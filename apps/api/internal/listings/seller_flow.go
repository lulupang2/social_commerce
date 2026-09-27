package listings

import (
	"context"
	"errors"
	"strings"
	"time"
	"unicode/utf8"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgconn"
)

var errSellerConflict = &Failure{409, "SELLER_STATE_CONFLICT", "Seller application or inventory state changed"}
var errSellerForbidden = &Failure{403, "SELLER_REVIEW_FORBIDDEN", "Operator access required"}

type SellerApplication struct {
	ID          string     `json:"id"`
	ApplicantID string     `json:"applicantId"`
	Type        string     `json:"type"`
	DisplayName string     `json:"displayName"`
	Status      string     `json:"status"`
	SellerID    *string    `json:"sellerId"`
	Reason      *string    `json:"reason"`
	ReviewedBy  *string    `json:"reviewedBy"`
	CreatedAt   time.Time  `json:"createdAt"`
	ReviewedAt  *time.Time `json:"reviewedAt"`
}

type SellerMembershipView struct {
	ID          string `json:"id"`
	DisplayName string `json:"displayName"`
	Status      string `json:"status"`
}

type SellerStatus struct {
	Application *SellerApplication    `json:"application"`
	Seller      *SellerMembershipView `json:"seller"`
	Reviewer    bool                  `json:"reviewer"`
}

type InventoryView struct {
	ListingID         string `json:"listingId"`
	SellerID          string `json:"sellerId"`
	AvailableQuantity int    `json:"availableQuantity"`
	ReservedQuantity  int    `json:"reservedQuantity"`
}

const applicationColumns = `id::text,applicant_id::text,seller_type::text,display_name,status,seller_id::text,reason,reviewed_by::text,created_at,reviewed_at`

func scanApplication(row interface{ Scan(...any) error }) (*SellerApplication, error) {
	var a SellerApplication
	if err := row.Scan(&a.ID, &a.ApplicantID, &a.Type, &a.DisplayName, &a.Status, &a.SellerID, &a.Reason, &a.ReviewedBy, &a.CreatedAt, &a.ReviewedAt); err != nil {
		return nil, err
	}
	return &a, nil
}

func (s *Store) sellerTx(ctx context.Context, member string) (pgx.Tx, error) {
	tx, err := s.Pool.Begin(ctx)
	if err != nil {
		return nil, errDB
	}
	if err = setMemberContext(ctx, tx, member); err != nil {
		tx.Rollback(context.Background())
		return nil, err
	}
	return tx, nil
}

func (s *Store) SellerStatus(ctx context.Context, member string) (SellerStatus, error) {
	tx, err := s.sellerTx(ctx, member)
	if err != nil {
		return SellerStatus{}, err
	}
	defer tx.Rollback(context.Background())
	var result SellerStatus
	if err = tx.QueryRow(ctx, `SELECT EXISTS(SELECT 1 FROM summergear_app.listing_reviewers WHERE member_id=$1)`, member).Scan(&result.Reviewer); err != nil {
		return SellerStatus{}, errDB
	}
	result.Application, err = scanApplication(tx.QueryRow(ctx, `SELECT `+applicationColumns+` FROM summergear_app.seller_applications WHERE applicant_id=$1 ORDER BY created_at DESC,id DESC LIMIT 1`, member))
	if err != nil && !errors.Is(err, pgx.ErrNoRows) {
		return SellerStatus{}, errDB
	}
	var seller SellerMembershipView
	err = tx.QueryRow(ctx, `SELECT s.id::text,s.display_name,s.status FROM summergear_app.sellers s
 JOIN summergear_app.seller_memberships sm ON sm.seller_id=s.id
 WHERE sm.member_id=$1 AND sm.active AND sm.is_owner AND s.status='approved'
 ORDER BY s.created_at,s.id LIMIT 1`, member).Scan(&seller.ID, &seller.DisplayName, &seller.Status)
	if err == nil {
		result.Seller = &seller
	} else if !errors.Is(err, pgx.ErrNoRows) {
		return SellerStatus{}, errDB
	}
	if err = tx.Commit(ctx); err != nil {
		return SellerStatus{}, errDB
	}
	return result, nil
}

func (s *Store) ApplySeller(ctx context.Context, member, kind, displayName string) (*SellerApplication, error) {
	displayName = strings.TrimSpace(displayName)
	if (kind != "individual" && kind != "business") || utf8.RuneCountInString(displayName) < 1 || utf8.RuneCountInString(displayName) > 120 {
		return nil, errInvalid
	}
	tx, err := s.sellerTx(ctx, member)
	if err != nil {
		return nil, err
	}
	defer tx.Rollback(context.Background())
	var already bool
	if err = tx.QueryRow(ctx, `SELECT EXISTS(SELECT 1 FROM summergear_app.seller_memberships sm
 JOIN summergear_app.sellers s ON s.id=sm.seller_id WHERE sm.member_id=$1 AND sm.active AND s.status='approved')`, member).Scan(&already); err != nil {
		return nil, errDB
	}
	if already {
		return nil, errSellerConflict
	}
	a, err := scanApplication(tx.QueryRow(ctx, `INSERT INTO summergear_app.seller_applications(applicant_id,seller_type,display_name)
 VALUES($1,$2,$3) RETURNING `+applicationColumns, member, kind, displayName))
	if err != nil {
		var pg *pgconn.PgError
		if errors.As(err, &pg) && pg.Code == "23505" {
			return nil, errSellerConflict
		}
		return nil, errDB
	}
	if err = tx.Commit(ctx); err != nil {
		return nil, errDB
	}
	return a, nil
}

func (s *Store) PendingSellerApplications(ctx context.Context, reviewer string) ([]SellerApplication, error) {
	tx, err := s.reviewerTx(ctx, reviewer)
	if err != nil {
		return nil, err
	}
	defer tx.Rollback(context.Background())
	rows, err := tx.Query(ctx, `SELECT `+applicationColumns+` FROM summergear_app.seller_applications
 WHERE status='pending' ORDER BY created_at,id LIMIT 100`)
	if err != nil {
		return nil, errDB
	}
	result := make([]SellerApplication, 0)
	for rows.Next() {
		a, scanErr := scanApplication(rows)
		if scanErr != nil {
			rows.Close()
			return nil, errDB
		}
		result = append(result, *a)
	}
	err = rows.Err()
	rows.Close()
	if err != nil {
		return nil, errDB
	}
	if err = tx.Commit(ctx); err != nil {
		return nil, errDB
	}
	return result, nil
}

func (s *Store) ReviewSellerApplication(ctx context.Context, reviewer, id, decision, reason string) (*SellerApplication, error) {
	if uuid.Validate(id) != nil || (decision != "approve" && decision != "reject") {
		return nil, errInvalid
	}
	reason = strings.TrimSpace(reason)
	if (decision == "reject" && (utf8.RuneCountInString(reason) < 1 || utf8.RuneCountInString(reason) > 1000)) || (decision == "approve" && reason != "") {
		return nil, errInvalid
	}
	tx, err := s.reviewerTx(ctx, reviewer)
	if err != nil {
		return nil, err
	}
	defer tx.Rollback(context.Background())
	a, err := scanApplication(tx.QueryRow(ctx, `SELECT `+applicationColumns+` FROM summergear_app.seller_applications WHERE id=$1 FOR UPDATE`, id))
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, errNotFound
	}
	if err != nil {
		return nil, errDB
	}
	if a.ApplicantID == reviewer {
		return nil, errSellerForbidden
	}
	if a.Status != "pending" {
		return nil, errSellerConflict
	}
	if decision == "approve" {
		var sellerID string
		err = tx.QueryRow(ctx, `INSERT INTO summergear_app.sellers(type,display_name,status)
 VALUES($1,$2,'approved') RETURNING id::text`, a.Type, a.DisplayName).Scan(&sellerID)
		if err != nil {
			return nil, errDB
		}
		_, err = tx.Exec(ctx, `INSERT INTO summergear_app.seller_memberships(seller_id,member_id,is_owner)
 VALUES($1,$2,true)`, sellerID, a.ApplicantID)
		if err != nil {
			return nil, errDB
		}
		_, err = tx.Exec(ctx, `UPDATE summergear_app.seller_applications
 SET status='approved',seller_id=$2,reviewed_by=$3,reviewed_at=clock_timestamp()
 WHERE id=$1`, id, sellerID, reviewer)
	} else {
		_, err = tx.Exec(ctx, `UPDATE summergear_app.seller_applications
 SET status='rejected',reason=$2,reviewed_by=$3,reviewed_at=clock_timestamp()
 WHERE id=$1`, id, reason, reviewer)
	}
	if err != nil {
		return nil, errDB
	}
	a, err = scanApplication(tx.QueryRow(ctx, `SELECT `+applicationColumns+` FROM summergear_app.seller_applications WHERE id=$1`, id))
	if err != nil {
		return nil, errDB
	}
	if err = tx.Commit(ctx); err != nil {
		return nil, errDB
	}
	return a, nil
}

// SetInventory locks the same stock row as CreateOrder. Unit-one listings can
// never increase available stock while a reservation or sold item exists.
func (s *Store) SetInventory(ctx context.Context, member, listingID string, available int) (InventoryView, error) {
	if uuid.Validate(listingID) != nil || available < 0 || available > 1 {
		return InventoryView{}, errInvalid
	}
	tx, err := s.sellerTx(ctx, member)
	if err != nil {
		return InventoryView{}, err
	}
	defer tx.Rollback(context.Background())
	var stock InventoryView
	err = tx.QueryRow(ctx, `SELECT i.listing_id::text,i.seller_id::text,i.available_quantity,i.reserved_quantity
 FROM summergear_app.inventory_items i WHERE i.listing_id=$1 FOR UPDATE`, listingID).Scan(
		&stock.ListingID, &stock.SellerID, &stock.AvailableQuantity, &stock.ReservedQuantity)
	if err != nil && !errors.Is(err, pgx.ErrNoRows) {
		return InventoryView{}, errDB
	}
	exists := err == nil
	var sellerID string
	err = tx.QueryRow(ctx, `SELECT s.id::text FROM summergear_app.listings l
 JOIN summergear_app.seller_memberships sm ON sm.member_id=l.member_id AND sm.member_id=$2 AND sm.active AND sm.is_owner
 JOIN summergear_app.sellers s ON s.id=sm.seller_id AND s.status='approved'
 WHERE l.id=$1 AND l.member_id=$2 AND l.status='active'
 ORDER BY s.created_at,s.id LIMIT 1`, listingID, member).Scan(&sellerID)
	if errors.Is(err, pgx.ErrNoRows) {
		return InventoryView{}, errNotFound
	}
	if err != nil {
		return InventoryView{}, errDB
	}
	if exists && stock.SellerID != sellerID {
		return InventoryView{}, errNotFound
	}
	if !exists {
		// A newly prepared listing is not purchasable until this insert commits.
		err = tx.QueryRow(ctx, `INSERT INTO summergear_app.inventory_items(listing_id,seller_id,available_quantity)
 VALUES($1,$2,$3) ON CONFLICT(listing_id) DO NOTHING RETURNING listing_id::text,seller_id::text,available_quantity,reserved_quantity`,
			listingID, sellerID, available).Scan(&stock.ListingID, &stock.SellerID, &stock.AvailableQuantity, &stock.ReservedQuantity)
		if errors.Is(err, pgx.ErrNoRows) {
			return InventoryView{}, errSellerConflict
		}
		if err != nil {
			return InventoryView{}, errDB
		}
	} else {
		var consumed bool
		if err = tx.QueryRow(ctx, `SELECT EXISTS(SELECT 1 FROM summergear_app.inventory_reservations
 WHERE listing_id=$1 AND state='consumed')`, listingID).Scan(&consumed); err != nil {
			return InventoryView{}, errDB
		}
		if (stock.ReservedQuantity > 0 || consumed) && available > stock.AvailableQuantity {
			return InventoryView{}, errSellerConflict
		}
		if available != stock.AvailableQuantity {
			err = tx.QueryRow(ctx, `UPDATE summergear_app.inventory_items SET available_quantity=$2,
 updated_at=clock_timestamp() WHERE listing_id=$1 RETURNING available_quantity`, listingID, available).Scan(&stock.AvailableQuantity)
			if err != nil {
				return InventoryView{}, errDB
			}
		}
	}
	if err = tx.Commit(ctx); err != nil {
		return InventoryView{}, errDB
	}
	return stock, nil
}

func (s *Store) OwnerInventory(ctx context.Context, member, listingID string) (*InventoryView, error) {
	if uuid.Validate(listingID) != nil {
		return nil, errInvalid
	}
	tx, err := s.sellerTx(ctx, member)
	if err != nil {
		return nil, err
	}
	defer tx.Rollback(context.Background())
	var listingOwner bool
	if err = tx.QueryRow(ctx, `SELECT EXISTS(SELECT 1 FROM summergear_app.listings WHERE id=$1 AND member_id=$2)`, listingID, member).Scan(&listingOwner); err != nil {
		return nil, errDB
	}
	if !listingOwner {
		return nil, errNotFound
	}
	var stock InventoryView
	err = tx.QueryRow(ctx, `SELECT listing_id::text,seller_id::text,available_quantity,reserved_quantity
 FROM summergear_app.inventory_items WHERE listing_id=$1`, listingID).Scan(&stock.ListingID, &stock.SellerID, &stock.AvailableQuantity, &stock.ReservedQuantity)
	if err != nil && !errors.Is(err, pgx.ErrNoRows) {
		return nil, errDB
	}
	if err = tx.Commit(ctx); err != nil {
		return nil, errDB
	}
	if stock.ListingID == "" {
		return nil, nil
	}
	return &stock, nil
}
