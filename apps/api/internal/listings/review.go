package listings

import (
	"context"
	"errors"
	"fmt"
	"strings"
	"time"

	"github.com/jackc/pgx/v5"
)

var errReviewConflict = &Failure{409, "LISTING_REVIEW_CONFLICT", "Listing state changed; reload before reviewing"}
var errReviewForbidden = &Failure{403, "LISTING_REVIEW_FORBIDDEN", "Reviewer access required"}

type ReviewEvent struct {
	ID            int64     `json:"id"`
	ListingID     string    `json:"listingId"`
	ActorMemberID string    `json:"actorMemberId"`
	FromStatus    string    `json:"fromStatus"`
	ToStatus      string    `json:"toStatus"`
	Reason        *string   `json:"reason"`
	CreatedAt     time.Time `json:"createdAt"`
}

type Availability struct {
	Purchasable bool   `json:"purchasable"`
	Reason      string `json:"reason"`
}

func (s *Store) reviewerTx(ctx context.Context, memberID string) (pgx.Tx, error) {
	tx, err := s.Pool.Begin(ctx)
	if err != nil {
		return nil, errDB
	}
	if err = setMemberContext(ctx, tx, memberID); err != nil {
		tx.Rollback(context.Background())
		return nil, err
	}
	var allowed bool
	err = tx.QueryRow(ctx, `SELECT EXISTS(SELECT 1 FROM summergear_app.listing_reviewers WHERE member_id=$1)`, memberID).Scan(&allowed)
	if err != nil {
		tx.Rollback(context.Background())
		return nil, errDB
	}
	if !allowed {
		tx.Rollback(context.Background())
		return nil, errReviewForbidden
	}
	return tx, nil
}

const reviewColumns = `l.id::text,l.member_id::text,m.display_name,l.sport,l.category,l.title,l.description,
 l.price_krw,l.condition,l.status,l.details,l.location_text,l.published_at,l.created_at,l.updated_at`

func (s *Store) PendingReviews(ctx context.Context, reviewerID string) ([]Listing, error) {
	tx, err := s.reviewerTx(ctx, reviewerID)
	if err != nil {
		return nil, err
	}
	defer tx.Rollback(context.Background())
	rows, err := tx.Query(ctx, `SELECT `+reviewColumns+` FROM summergear_app.listings l
 JOIN summergear_app.members m ON m.id=l.member_id
 WHERE l.status='pending_review' ORDER BY l.created_at,l.id`)
	if err != nil {
		return nil, errDB
	}
	items := []Listing{}
	for rows.Next() {
		item, scanErr := scanListing(rows)
		if scanErr != nil {
			rows.Close()
			return nil, errDB
		}
		items = append(items, item)
	}
	err = rows.Err()
	rows.Close()
	if err != nil {
		return nil, errDB
	}
	if err = tx.Commit(ctx); err != nil {
		return nil, errDB
	}
	return items, nil
}

func (s *Store) Review(ctx context.Context, reviewerID, id, decision, reason string) (Listing, error) {
	if decision != "approve" && decision != "reject" {
		return Listing{}, errInvalid
	}
	reason = strings.TrimSpace(reason)
	if (decision == "approve" && reason != "") || (decision == "reject" && (len([]rune(reason)) < 1 || len([]rune(reason)) > 1000)) {
		return Listing{}, errInvalid
	}
	tx, err := s.reviewerTx(ctx, reviewerID)
	if err != nil {
		return Listing{}, err
	}
	defer tx.Rollback(context.Background())
	var status string
	var price int64
	err = tx.QueryRow(ctx, `SELECT status,price_krw FROM summergear_app.listings WHERE id=$1 FOR UPDATE`, id).Scan(&status, &price)
	if errors.Is(err, pgx.ErrNoRows) {
		return Listing{}, errNotFound
	}
	if err != nil {
		return Listing{}, errDB
	}
	if status != "pending_review" {
		return Listing{}, errReviewConflict
	}
	if decision == "approve" && price == 0 {
		return Listing{}, errInvalid
	}
	next := "rejected"
	var auditReason any = reason
	if decision == "approve" {
		next = "active"
		auditReason = nil
	}
	_, err = tx.Exec(ctx, `UPDATE summergear_app.listings SET status=$2,
 published_at=CASE WHEN $2='active' THEN clock_timestamp() ELSE NULL END,updated_at=clock_timestamp() WHERE id=$1`, id, next)
	if err != nil {
		return Listing{}, errDB
	}
	var reviewID int64
	err = tx.QueryRow(ctx, `INSERT INTO summergear_app.listing_review_events(listing_id,actor_member_id,from_status,to_status,reason)
 VALUES($1,$2,$3,$4,$5) RETURNING id`, id, reviewerID, status, next, auditReason).Scan(&reviewID)
	if err != nil {
		return Listing{}, errDB
	}
	item, err := selectOne(ctx, tx, id)
	if err != nil {
		return Listing{}, err
	}
	if _, err = tx.Exec(ctx, `INSERT INTO summergear_app.notification_events
 (event_key,member_id,actor_member_id,kind,resource_id)
 VALUES($1,$2,$3,'listing_review',$4)`,
		fmt.Sprintf("listing_review:%d", reviewID), item.Seller.ID, reviewerID, id); err != nil {
		return Listing{}, errDB
	}
	if err = tx.Commit(ctx); err != nil {
		return Listing{}, errDB
	}
	return item, nil
}

func (s *Store) Resubmit(ctx context.Context, memberID, id string) (Listing, error) {
	tx, err := s.Pool.Begin(ctx)
	if err != nil {
		return Listing{}, errDB
	}
	defer tx.Rollback(context.Background())
	if err = setMemberContext(ctx, tx, memberID); err != nil {
		return Listing{}, err
	}
	var status string
	err = tx.QueryRow(ctx, `SELECT status FROM summergear_app.listings WHERE id=$1 AND member_id=$2 FOR UPDATE`, id, memberID).Scan(&status)
	if errors.Is(err, pgx.ErrNoRows) {
		return Listing{}, errNotFound
	}
	if err != nil {
		return Listing{}, errDB
	}
	if status != "rejected" {
		return Listing{}, errReviewConflict
	}
	_, err = tx.Exec(ctx, `UPDATE summergear_app.listings SET status='pending_review',published_at=NULL,updated_at=clock_timestamp() WHERE id=$1`, id)
	if err != nil {
		return Listing{}, errDB
	}
	_, err = tx.Exec(ctx, `INSERT INTO summergear_app.listing_review_events(listing_id,actor_member_id,from_status,to_status)
 VALUES($1,$2,'rejected','pending_review')`, id, memberID)
	if err != nil {
		return Listing{}, errDB
	}
	item, err := selectOne(ctx, tx, id)
	if err != nil {
		return Listing{}, err
	}
	if err = tx.Commit(ctx); err != nil {
		return Listing{}, errDB
	}
	return item, nil
}

func (s *Store) ReviewHistory(ctx context.Context, memberID, id string) ([]ReviewEvent, error) {
	tx, err := s.Pool.Begin(ctx)
	if err != nil {
		return nil, errDB
	}
	defer tx.Rollback(context.Background())
	if err = setMemberContext(ctx, tx, memberID); err != nil {
		return nil, err
	}
	var permitted bool
	err = tx.QueryRow(ctx, `SELECT EXISTS(SELECT 1 FROM summergear_app.listings l WHERE l.id=$1
 AND (l.member_id=$2 OR EXISTS(SELECT 1 FROM summergear_app.listing_reviewers r WHERE r.member_id=$2)))`, id, memberID).Scan(&permitted)
	if err != nil {
		return nil, errDB
	}
	if !permitted {
		return nil, errNotFound
	}
	rows, err := tx.Query(ctx, `SELECT id,listing_id::text,actor_member_id::text,from_status,to_status,reason,created_at
 FROM summergear_app.listing_review_events WHERE listing_id=$1 ORDER BY id DESC`, id)
	if err != nil {
		return nil, errDB
	}
	events := []ReviewEvent{}
	for rows.Next() {
		var event ReviewEvent
		if rows.Scan(&event.ID, &event.ListingID, &event.ActorMemberID, &event.FromStatus, &event.ToStatus, &event.Reason, &event.CreatedAt) != nil {
			rows.Close()
			return nil, errDB
		}
		events = append(events, event)
	}
	err = rows.Err()
	rows.Close()
	if err != nil {
		return nil, errDB
	}
	if err = tx.Commit(ctx); err != nil {
		return nil, errDB
	}
	return events, nil
}

func (s *Store) Availability(ctx context.Context, id string) (Availability, error) {
	var status string
	var price int64
	var sellerID *string
	var stock *int
	var valid *bool
	err := s.Pool.QueryRow(ctx, `SELECT l.status,l.price_krw,i.seller_id::text,i.available_quantity,
 CASE WHEN i.seller_id IS NULL THEN NULL ELSE (s.status='approved' AND summergear_app.listing_seller_valid(l.id,i.seller_id)) END
 FROM summergear_app.listings l LEFT JOIN summergear_app.inventory_items i ON i.listing_id=l.id
 LEFT JOIN summergear_app.sellers s ON s.id=i.seller_id WHERE l.id=$1`, id).Scan(&status, &price, &sellerID, &stock, &valid)
	if errors.Is(err, pgx.ErrNoRows) {
		return Availability{}, errNotFound
	}
	if err != nil {
		return Availability{}, errDB
	}
	if status != "active" {
		return Availability{Reason: "not_public"}, nil
	}
	if price <= 0 || sellerID == nil || valid == nil || !*valid {
		return Availability{Reason: "not_prepared"}, nil
	}
	if stock == nil || *stock < 1 {
		return Availability{Reason: "sold_out"}, nil
	}
	return Availability{Purchasable: true, Reason: "available"}, nil
}
