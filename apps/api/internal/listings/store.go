package listings

import (
	"context"
	"encoding/json"
	"errors"
	"strings"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

type Store struct{ Pool *pgxpool.Pool }

func (s *Store) Ready(ctx context.Context) error {
	if _, err := s.Pool.Exec(ctx, "SELECT 1 FROM summergear_app.listings LIMIT 0"); err != nil {
		return errDB
	}
	return nil
}

func (s *Store) Create(ctx context.Context, memberID string, input CreateInput) (Listing, error) {
	input = normalizeCreate(input)
	if err := validateCreate(input); err != nil {
		return Listing{}, err
	}
	details, err := json.Marshal(input.Details)
	if err != nil {
		return Listing{}, errInvalid
	}

	tx, err := s.Pool.Begin(ctx)
	if err != nil {
		return Listing{}, errDB
	}
	defer tx.Rollback(context.Background())
	if err := setMemberContext(ctx, tx, memberID); err != nil {
		return Listing{}, err
	}

	var id string
	err = tx.QueryRow(ctx, `INSERT INTO summergear_app.listings
		(member_id,sport,category,title,description,price_krw,condition,status,details,location_text)
		VALUES($1,$2,$3,$4,$5,$6,$7,'pending_review',$8::jsonb,$9)
		RETURNING id::text`,
		memberID, input.Sport, input.Category, input.Title, input.Description, input.PriceKRW,
		input.Condition, string(details), input.Location).Scan(&id)
	if err != nil {
		return Listing{}, errDB
	}
	listing, err := selectOne(ctx, tx, id)
	if err != nil {
		return Listing{}, err
	}
	if err = tx.Commit(ctx); err != nil {
		return Listing{}, errDB
	}
	return listing, nil
}

func (s *Store) Update(ctx context.Context, memberID, id string, input UpdateInput) (Listing, error) {
	input = normalizeUpdate(input)
	if err := validateUpdate(input); err != nil {
		return Listing{}, err
	}
	var detailsJSON any
	if input.Details != nil {
		encoded, err := json.Marshal(*input.Details)
		if err != nil {
			return Listing{}, errInvalid
		}
		detailsJSON = string(encoded)
	}

	tx, err := s.Pool.Begin(ctx)
	if err != nil {
		return Listing{}, errDB
	}
	defer tx.Rollback(context.Background())
	if err := setMemberContext(ctx, tx, memberID); err != nil {
		return Listing{}, err
	}
	if input.Details != nil {
		var sport string
		err = tx.QueryRow(ctx, `SELECT sport FROM summergear_app.listings WHERE id=$1`, id).Scan(&sport)
		if errors.Is(err, pgx.ErrNoRows) {
			return Listing{}, errNotFound
		}
		if err != nil {
			return Listing{}, errDB
		}
		if err = validateDetails(sport, *input.Details); err != nil {
			return Listing{}, err
		}
	}

	tag, err := tx.Exec(ctx, `UPDATE summergear_app.listings SET
		category=COALESCE($2,category),
		title=COALESCE($3,title),
		description=COALESCE($4,description),
		price_krw=COALESCE($5,price_krw),
		condition=COALESCE($6,condition),
		details=COALESCE($7::jsonb,details),
		location_text=COALESCE($8,location_text),
		updated_at=clock_timestamp()
		WHERE id=$1 AND status IN ('draft','pending_review','rejected')`,
		id, input.Category, input.Title, input.Description, input.PriceKRW, input.Condition, detailsJSON, input.Location)
	if err != nil {
		return Listing{}, errDB
	}
	if tag.RowsAffected() != 1 {
		return Listing{}, errNotFound
	}
	listing, err := selectOne(ctx, tx, id)
	if err != nil {
		return Listing{}, err
	}
	if err = tx.Commit(ctx); err != nil {
		return Listing{}, errDB
	}
	return listing, nil
}

func (s *Store) Get(ctx context.Context, id, memberID string) (Listing, error) {
	if strings.TrimSpace(id) == "" {
		return Listing{}, errNotFound
	}
	if memberID == "" {
		return selectOne(ctx, s.Pool, id)
	}
	tx, err := s.Pool.Begin(ctx)
	if err != nil {
		return Listing{}, errDB
	}
	defer tx.Rollback(context.Background())
	if err := setMemberContext(ctx, tx, memberID); err != nil {
		return Listing{}, err
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

// ListOwned reads every status under the same transaction-scoped member context as Get.
func (s *Store) ListOwned(ctx context.Context, memberID string) ([]Listing, error) {
	tx, err := s.Pool.Begin(ctx)
	if err != nil {
		return nil, errDB
	}
	defer tx.Rollback(context.Background())
	if err = setMemberContext(ctx, tx, memberID); err != nil {
		return nil, err
	}
	rows, err := tx.Query(ctx, `SELECT
		l.id::text,l.member_id::text,m.display_name,l.sport,l.category,l.title,l.description,
		l.price_krw,l.condition,l.status,l.details,l.location_text,l.published_at,l.created_at,l.updated_at
		FROM summergear_app.listings l
		JOIN summergear_app.members m ON m.id=l.member_id
		WHERE l.member_id=$1 ORDER BY l.created_at DESC,l.id DESC`, memberID)
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

type queryRower interface {
	QueryRow(context.Context, string, ...any) pgx.Row
}

func selectOne(ctx context.Context, q queryRower, id string) (Listing, error) {
	row := q.QueryRow(ctx, `SELECT
		l.id::text,l.member_id::text,m.display_name,l.sport,l.category,l.title,l.description,
		l.price_krw,l.condition,l.status,l.details,l.location_text,l.published_at,l.created_at,l.updated_at
		FROM summergear_app.listings l
		JOIN summergear_app.members m ON m.id=l.member_id
		WHERE l.id=$1`, id)
	item, err := scanListing(row)
	if errors.Is(err, pgx.ErrNoRows) {
		return Listing{}, errNotFound
	}
	if err != nil {
		return Listing{}, errDB
	}
	return item, nil
}

type scanner interface{ Scan(...any) error }

func scanListing(row scanner) (Listing, error) {
	var item Listing
	var details []byte
	if err := row.Scan(
		&item.ID, &item.Seller.ID, &item.Seller.DisplayName, &item.Sport, &item.Category, &item.Title,
		&item.Description, &item.PriceKRW, &item.Condition, &item.Status, &details, &item.Location,
		&item.PublishedAt, &item.CreatedAt, &item.UpdatedAt,
	); err != nil {
		return Listing{}, err
	}
	if len(details) == 0 || json.Unmarshal(details, &item.Details) != nil {
		return Listing{}, errDB
	}
	return item, nil
}

func setMemberContext(ctx context.Context, tx pgx.Tx, memberID string) error {
	if _, err := tx.Exec(ctx, "SELECT set_config('summergear.member_id',$1,true)", memberID); err != nil {
		return errDB
	}
	return nil
}
