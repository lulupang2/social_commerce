package listingimages

import (
	"context"
	"errors"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgconn"
	"github.com/jackc/pgx/v5/pgxpool"
)

type Repository interface {
	Ready(context.Context) error
	ListVisible(context.Context, string, string) ([]Record, error)
	PrepareCreate(context.Context, string, string, *int) (int, error)
	Insert(context.Context, string, string, Record) error
	GetForMutation(context.Context, string, string, string) (Record, error)
	Patch(context.Context, string, string, string, PatchInput) (Record, error)
	Replace(context.Context, string, string, string, string, string, bool, *string) (Record, error)
	Delete(context.Context, string, string, string, string) error
}

type Store struct{ Pool *pgxpool.Pool }

func (s *Store) Ready(ctx context.Context) error {
	if _, err := s.Pool.Exec(ctx, "SELECT 1 FROM summergear_app.listing_images LIMIT 0"); err != nil {
		return errDB
	}
	return nil
}

func (s *Store) ListVisible(ctx context.Context, listingID, memberID string) ([]Record, error) {
	if listingID == "" {
		return nil, errListingNotFound
	}
	var q queryer = s.Pool
	var tx pgx.Tx
	var err error
	if memberID != "" {
		tx, err = s.Pool.Begin(ctx)
		if err != nil {
			return nil, errDB
		}
		defer tx.Rollback(context.Background())
		if err = setMemberContext(ctx, tx, memberID); err != nil {
			return nil, err
		}
		q = tx
	}

	var visible bool
	if err = q.QueryRow(ctx, "SELECT EXISTS(SELECT 1 FROM summergear_app.listings WHERE id=$1)", listingID).Scan(&visible); err != nil {
		return nil, errDB
	}
	if !visible {
		return nil, errListingNotFound
	}
	rows, err := q.Query(ctx, `SELECT id::text,listing_id::text,storage_path,alt_text,sort_order,created_at,updated_at
		FROM summergear_app.listing_images
		WHERE listing_id=$1
		ORDER BY sort_order,id`, listingID)
	if err != nil {
		return nil, errDB
	}
	defer rows.Close()
	records := make([]Record, 0, MaxImages)
	for rows.Next() {
		record, scanErr := scanRecord(rows)
		if scanErr != nil {
			return nil, errDB
		}
		records = append(records, record)
	}
	if rows.Err() != nil {
		return nil, errDB
	}
	if tx != nil {
		if err = tx.Commit(ctx); err != nil {
			return nil, errDB
		}
	}
	return records, nil
}

func (s *Store) PrepareCreate(ctx context.Context, memberID, listingID string, requested *int) (int, error) {
	tx, err := s.Pool.Begin(ctx)
	if err != nil {
		return 0, errDB
	}
	defer tx.Rollback(context.Background())
	if err = setMemberContext(ctx, tx, memberID); err != nil {
		return 0, err
	}
	if err = lockMutableListing(ctx, tx, memberID, listingID); err != nil {
		return 0, err
	}
	order, err := availableSortOrder(ctx, tx, listingID, requested)
	if err != nil {
		return 0, err
	}
	if err = tx.Commit(ctx); err != nil {
		return 0, errDB
	}
	return order, nil
}

func (s *Store) Insert(ctx context.Context, memberID, listingID string, record Record) error {
	tx, err := s.Pool.Begin(ctx)
	if err != nil {
		return errDB
	}
	defer tx.Rollback(context.Background())
	if err = setMemberContext(ctx, tx, memberID); err != nil {
		return err
	}
	if err = lockMutableListing(ctx, tx, memberID, listingID); err != nil {
		return err
	}
	if _, err = availableSortOrder(ctx, tx, listingID, &record.SortOrder); err != nil {
		return err
	}
	_, err = tx.Exec(ctx, `INSERT INTO summergear_app.listing_images
		(id,listing_id,storage_path,alt_text,sort_order)
		VALUES($1,$2,$3,$4,$5)`,
		record.ID, listingID, record.StoragePath, record.AltText, record.SortOrder)
	if err != nil {
		if uniqueViolation(err) {
			return errSortConflict
		}
		return errDB
	}
	if err = tx.Commit(ctx); err != nil {
		return errDB
	}
	return nil
}

func (s *Store) GetForMutation(ctx context.Context, memberID, listingID, imageID string) (Record, error) {
	tx, err := s.Pool.Begin(ctx)
	if err != nil {
		return Record{}, errDB
	}
	defer tx.Rollback(context.Background())
	if err = setMemberContext(ctx, tx, memberID); err != nil {
		return Record{}, err
	}
	if err = lockMutableListing(ctx, tx, memberID, listingID); err != nil {
		return Record{}, err
	}
	record, err := selectImageForUpdate(ctx, tx, listingID, imageID)
	if err != nil {
		return Record{}, err
	}
	if err = tx.Commit(ctx); err != nil {
		return Record{}, errDB
	}
	return record, nil
}

func (s *Store) Patch(ctx context.Context, memberID, listingID, imageID string, input PatchInput) (Record, error) {
	tx, err := s.Pool.Begin(ctx)
	if err != nil {
		return Record{}, errDB
	}
	defer tx.Rollback(context.Background())
	if err = setMemberContext(ctx, tx, memberID); err != nil {
		return Record{}, err
	}
	if err = lockMutableListing(ctx, tx, memberID, listingID); err != nil {
		return Record{}, err
	}
	if _, err = selectImageForUpdate(ctx, tx, listingID, imageID); err != nil {
		return Record{}, err
	}
	if input.SortOrder != nil {
		var conflict bool
		if err = tx.QueryRow(ctx, `SELECT EXISTS(
			SELECT 1 FROM summergear_app.listing_images
			WHERE listing_id=$1 AND sort_order=$2 AND id<>$3
		)`, listingID, *input.SortOrder, imageID).Scan(&conflict); err != nil {
			return Record{}, errDB
		}
		if conflict {
			return Record{}, errSortConflict
		}
	}
	var record Record
	err = tx.QueryRow(ctx, `UPDATE summergear_app.listing_images SET
		alt_text=CASE WHEN $3 THEN $4 ELSE alt_text END,
		sort_order=COALESCE($5,sort_order),
		updated_at=clock_timestamp()
		WHERE id=$1 AND listing_id=$2
		RETURNING id::text,listing_id::text,storage_path,alt_text,sort_order,created_at,updated_at`,
		imageID, listingID, input.AltTextSet, input.AltText, input.SortOrder).Scan(
		&record.ID, &record.ListingID, &record.StoragePath, &record.AltText, &record.SortOrder,
		&record.CreatedAt, &record.UpdatedAt)
	if err != nil {
		if uniqueViolation(err) {
			return Record{}, errSortConflict
		}
		return Record{}, errDB
	}
	if err = tx.Commit(ctx); err != nil {
		return Record{}, errDB
	}
	return record, nil
}

func (s *Store) Replace(
	ctx context.Context,
	memberID, listingID, imageID, expectedOldPath, newPath string,
	altTextSet bool,
	altText *string,
) (Record, error) {
	tx, err := s.Pool.Begin(ctx)
	if err != nil {
		return Record{}, errDB
	}
	defer tx.Rollback(context.Background())
	if err = setMemberContext(ctx, tx, memberID); err != nil {
		return Record{}, err
	}
	if err = lockMutableListing(ctx, tx, memberID, listingID); err != nil {
		return Record{}, err
	}
	current, err := selectImageForUpdate(ctx, tx, listingID, imageID)
	if err != nil {
		return Record{}, err
	}
	if current.StoragePath != expectedOldPath {
		return Record{}, errStateConflict
	}
	var record Record
	err = tx.QueryRow(ctx, `UPDATE summergear_app.listing_images SET
		storage_path=$4,
		alt_text=CASE WHEN $5 THEN $6 ELSE alt_text END,
		updated_at=clock_timestamp()
		WHERE id=$1 AND listing_id=$2 AND storage_path=$3
		RETURNING id::text,listing_id::text,storage_path,alt_text,sort_order,created_at,updated_at`,
		imageID, listingID, expectedOldPath, newPath, altTextSet, altText).Scan(
		&record.ID, &record.ListingID, &record.StoragePath, &record.AltText, &record.SortOrder,
		&record.CreatedAt, &record.UpdatedAt)
	if errors.Is(err, pgx.ErrNoRows) {
		return Record{}, errStateConflict
	}
	if err != nil {
		return Record{}, errDB
	}
	if err = tx.Commit(ctx); err != nil {
		return Record{}, errDB
	}
	return record, nil
}

func (s *Store) Delete(ctx context.Context, memberID, listingID, imageID, expectedPath string) error {
	tx, err := s.Pool.Begin(ctx)
	if err != nil {
		return errDB
	}
	defer tx.Rollback(context.Background())
	if err = setMemberContext(ctx, tx, memberID); err != nil {
		return err
	}
	if err = lockMutableListing(ctx, tx, memberID, listingID); err != nil {
		return err
	}
	current, err := selectImageForUpdate(ctx, tx, listingID, imageID)
	if err != nil {
		return err
	}
	if current.StoragePath != expectedPath {
		return errStateConflict
	}
	tag, err := tx.Exec(ctx, `DELETE FROM summergear_app.listing_images
		WHERE id=$1 AND listing_id=$2 AND storage_path=$3`, imageID, listingID, expectedPath)
	if err != nil {
		return errDB
	}
	if tag.RowsAffected() != 1 {
		return errImageNotFound
	}
	if err = tx.Commit(ctx); err != nil {
		return errDB
	}
	return nil
}

func lockMutableListing(ctx context.Context, tx pgx.Tx, memberID, listingID string) error {
	var owner, status string
	err := tx.QueryRow(ctx, `SELECT member_id::text,status
		FROM summergear_app.listings
		WHERE id=$1
		FOR UPDATE`, listingID).Scan(&owner, &status)
	if errors.Is(err, pgx.ErrNoRows) {
		return errListingNotFound
	}
	if err != nil {
		return errDB
	}
	if owner != memberID {
		return errListingNotFound
	}
	if !mutableListingStatus(status) {
		return errStateConflict
	}
	return nil
}

func availableSortOrder(ctx context.Context, tx pgx.Tx, listingID string, requested *int) (int, error) {
	var count int
	if err := tx.QueryRow(ctx, `SELECT count(*) FROM summergear_app.listing_images WHERE listing_id=$1`, listingID).Scan(&count); err != nil {
		return 0, errDB
	}
	if count >= MaxImages {
		return 0, errLimitReached
	}
	if requested != nil {
		var conflict bool
		if err := tx.QueryRow(ctx, `SELECT EXISTS(
			SELECT 1 FROM summergear_app.listing_images
			WHERE listing_id=$1 AND sort_order=$2
		)`, listingID, *requested).Scan(&conflict); err != nil {
			return 0, errDB
		}
		if conflict {
			return 0, errSortConflict
		}
		return *requested, nil
	}
	var order int
	if err := tx.QueryRow(ctx, `SELECT COALESCE(MAX(sort_order),-1)+1
		FROM summergear_app.listing_images WHERE listing_id=$1`, listingID).Scan(&order); err != nil {
		return 0, errDB
	}
	return order, nil
}

func selectImageForUpdate(ctx context.Context, tx pgx.Tx, listingID, imageID string) (Record, error) {
	var record Record
	err := tx.QueryRow(ctx, `SELECT id::text,listing_id::text,storage_path,alt_text,sort_order,created_at,updated_at
		FROM summergear_app.listing_images
		WHERE id=$1 AND listing_id=$2
		FOR UPDATE`, imageID, listingID).Scan(
		&record.ID, &record.ListingID, &record.StoragePath, &record.AltText, &record.SortOrder,
		&record.CreatedAt, &record.UpdatedAt)
	if errors.Is(err, pgx.ErrNoRows) {
		return Record{}, errImageNotFound
	}
	if err != nil {
		return Record{}, errDB
	}
	return record, nil
}

type queryer interface {
	Query(context.Context, string, ...any) (pgx.Rows, error)
	QueryRow(context.Context, string, ...any) pgx.Row
}

type scanner interface{ Scan(...any) error }

func scanRecord(row scanner) (Record, error) {
	var record Record
	err := row.Scan(&record.ID, &record.ListingID, &record.StoragePath, &record.AltText, &record.SortOrder,
		&record.CreatedAt, &record.UpdatedAt)
	return record, err
}

func setMemberContext(ctx context.Context, tx pgx.Tx, memberID string) error {
	if _, err := tx.Exec(ctx, "SELECT set_config('summergear.member_id',$1,true)", memberID); err != nil {
		return errDB
	}
	return nil
}

func uniqueViolation(err error) bool {
	var pgErr *pgconn.PgError
	return errors.As(err, &pgErr) && pgErr.Code == "23505"
}
