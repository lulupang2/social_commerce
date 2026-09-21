package listingimages

import (
	"context"
	"errors"
	"fmt"
	"strings"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgconn"
	"github.com/jackc/pgx/v5/pgxpool"
)

type Repository interface {
	BeginUpload(context.Context, string, string, UploadInput, string, time.Time) (ImageRecord, error)
	FailUpload(context.Context, string, string, string) error
	PendingOwned(context.Context, string, string, string) (ImageRecord, error)
	CompleteUpload(context.Context, string, string, string) (ImageRecord, *ImageRecord, error)
	VisibleReady(context.Context, string, string) ([]ImageRecord, error)
	BeginDelete(context.Context, string, string, string) (ImageRecord, error)
	FinishDelete(context.Context, string, string, string) error
	Ready(context.Context) error
}

type Store struct{ Pool *pgxpool.Pool }

func (s *Store) Ready(ctx context.Context) error {
	_, err := s.Pool.Exec(ctx, `SELECT id FROM summergear_app.listing_images LIMIT 0`)
	if err != nil {
		return errDB
	}
	return nil
}

func (s *Store) BeginUpload(ctx context.Context, memberID, listingID string, input UploadInput, storagePath string, expiresAt time.Time) (ImageRecord, error) {
	tx, err := s.Pool.Begin(ctx)
	if err != nil {
		return ImageRecord{}, errDB
	}
	defer tx.Rollback(context.Background())
	if err := setMemberContext(ctx, tx, memberID); err != nil {
		return ImageRecord{}, err
	}

	var listingStatus string
	err = tx.QueryRow(ctx, `SELECT status FROM summergear_app.listings
		WHERE id=$1 AND member_id=$2 AND status IN ('draft','pending_review','rejected') FOR UPDATE`,
		listingID, memberID).Scan(&listingStatus)
	if errors.Is(err, pgx.ErrNoRows) {
		return ImageRecord{}, errNotFound
	}
	if err != nil {
		return ImageRecord{}, errDB
	}

	if _, err = tx.Exec(ctx, `UPDATE summergear_app.listing_images
		SET state='upload_failed',updated_at=clock_timestamp()
		WHERE listing_id=$1 AND member_id=$2 AND state='pending_upload' AND upload_expires_at<=clock_timestamp()`,
		listingID, memberID); err != nil {
		return ImageRecord{}, errDB
	}

	var count int
	if err = tx.QueryRow(ctx, `SELECT count(*) FROM summergear_app.listing_images
		WHERE listing_id=$1 AND state IN ('pending_upload','ready')`, listingID).Scan(&count); err != nil {
		return ImageRecord{}, errDB
	}
	if input.ReplaceImageID == nil && count >= MaxImages {
		return ImageRecord{}, errLimit
	}

	sortOrder := -1
	var replacement *ImageRecord
	if input.ReplaceImageID != nil {
		var old ImageRecord
		err = tx.QueryRow(ctx, `SELECT id::text,listing_id::text,member_id::text,storage_path,mime_type,file_size_bytes,
			alt_text,sort_order,state,upload_expires_at,completed_at,replaces_image_id::text
			FROM summergear_app.listing_images
			WHERE id=$1 AND listing_id=$2 AND member_id=$3 AND state='ready' FOR UPDATE`,
			*input.ReplaceImageID, listingID, memberID).Scan(
			&old.ID, &old.ListingID, &old.MemberID, &old.StoragePath, &old.MimeType, &old.FileSizeBytes,
			&old.AltText, &old.SortOrder, &old.State, &old.UploadExpiresAt, &old.CompletedAt, &old.ReplaceImageID)
		if errors.Is(err, pgx.ErrNoRows) {
			return ImageRecord{}, errNotFound
		}
		if err != nil {
			return ImageRecord{}, errDB
		}
		sortOrder = old.SortOrder
		if input.SortOrder != nil && *input.SortOrder != sortOrder {
			return ImageRecord{}, errInvalid
		}
		replacement = &old
	} else {
		sortOrder = *input.SortOrder
		var exists bool
		if err = tx.QueryRow(ctx, `SELECT EXISTS(
			SELECT 1 FROM summergear_app.listing_images
			WHERE listing_id=$1 AND sort_order=$2 AND state IN ('pending_upload','ready')
		)`, listingID, sortOrder).Scan(&exists); err != nil {
			return ImageRecord{}, errDB
		}
		if exists {
			return ImageRecord{}, errConflict
		}
	}

	var record ImageRecord
	var replacementID any
	if replacement != nil {
		replacementID = replacement.ID
	}
	err = tx.QueryRow(ctx, `INSERT INTO summergear_app.listing_images
		(id,listing_id,member_id,storage_path,mime_type,file_size_bytes,alt_text,sort_order,state,upload_expires_at,replaces_image_id)
		VALUES(split_part($3,'/',3)::text::uuid,$1,$2,$3,$4,$5,$6,$7,'pending_upload',$8,$9::uuid)
		RETURNING id::text,listing_id::text,member_id::text,storage_path,mime_type,file_size_bytes,
			alt_text,sort_order,state,upload_expires_at,completed_at,replaces_image_id::text`,
		listingID, memberID, storagePath, canonicalMime(input.MimeType), input.FileSizeBytes,
		input.AltText, sortOrder, expiresAt, replacementID).Scan(
		&record.ID, &record.ListingID, &record.MemberID, &record.StoragePath, &record.MimeType, &record.FileSizeBytes,
		&record.AltText, &record.SortOrder, &record.State, &record.UploadExpiresAt, &record.CompletedAt, &record.ReplaceImageID)
	if err != nil {
		if constraintConflict(err) {
			return ImageRecord{}, errConflict
		}
		return ImageRecord{}, errDB
	}
	if err = tx.Commit(ctx); err != nil {
		return ImageRecord{}, errDB
	}
	return record, nil
}

func (s *Store) FailUpload(ctx context.Context, memberID, listingID, imageID string) error {
	tx, err := s.Pool.Begin(ctx)
	if err != nil {
		return errDB
	}
	defer tx.Rollback(context.Background())
	if err := setMemberContext(ctx, tx, memberID); err != nil {
		return err
	}
	if _, err = tx.Exec(ctx, `UPDATE summergear_app.listing_images
		SET state='upload_failed',updated_at=clock_timestamp()
		WHERE id=$1 AND listing_id=$2 AND member_id=$3 AND state='pending_upload'`,
		imageID, listingID, memberID); err != nil {
		return errDB
	}
	if err = tx.Commit(ctx); err != nil {
		return errDB
	}
	return nil
}

func (s *Store) PendingOwned(ctx context.Context, memberID, listingID, imageID string) (ImageRecord, error) {
	tx, err := s.Pool.Begin(ctx)
	if err != nil {
		return ImageRecord{}, errDB
	}
	defer tx.Rollback(context.Background())
	if err := setMemberContext(ctx, tx, memberID); err != nil {
		return ImageRecord{}, err
	}
	var ownedMutable bool
	if err = tx.QueryRow(ctx, `SELECT EXISTS(
		SELECT 1 FROM summergear_app.listings
		WHERE id=$1 AND member_id=$2 AND status IN ('draft','pending_review','rejected')
	)`, listingID, memberID).Scan(&ownedMutable); err != nil {
		return ImageRecord{}, errDB
	}
	if !ownedMutable {
		return ImageRecord{}, errNotFound
	}
	record, err := selectImage(ctx, tx, `id=$1 AND listing_id=$2 AND member_id=$3 AND state='pending_upload'`,
		imageID, listingID, memberID)
	if err != nil {
		return ImageRecord{}, err
	}
	if err = tx.Commit(ctx); err != nil {
		return ImageRecord{}, errDB
	}
	return record, nil
}

func (s *Store) CompleteUpload(ctx context.Context, memberID, listingID, imageID string) (ImageRecord, *ImageRecord, error) {
	tx, err := s.Pool.Begin(ctx)
	if err != nil {
		return ImageRecord{}, nil, errDB
	}
	defer tx.Rollback(context.Background())
	if err := setMemberContext(ctx, tx, memberID); err != nil {
		return ImageRecord{}, nil, err
	}
	record, err := selectImageForUpdate(ctx, tx, imageID, listingID, memberID, PendingUploadState)
	if err != nil {
		return ImageRecord{}, nil, err
	}
	if !record.UploadExpiresAt.After(time.Now().UTC()) {
		if _, updateErr := tx.Exec(ctx, `UPDATE summergear_app.listing_images
			SET state='upload_failed',updated_at=clock_timestamp() WHERE id=$1`, imageID); updateErr != nil {
			return ImageRecord{}, nil, errDB
		}
		if commitErr := tx.Commit(ctx); commitErr != nil {
			return ImageRecord{}, nil, errDB
		}
		return ImageRecord{}, nil, errExpired
	}

	var replaced *ImageRecord
	if record.ReplaceImageID != nil {
		old, findErr := selectImageForUpdate(ctx, tx, *record.ReplaceImageID, listingID, memberID, ReadyState)
		if findErr != nil {
			return ImageRecord{}, nil, findErr
		}
		if old.SortOrder != record.SortOrder {
			return ImageRecord{}, nil, errConflict
		}
		if _, err = tx.Exec(ctx, `UPDATE summergear_app.listing_images
			SET state='deleting',updated_at=clock_timestamp() WHERE id=$1`, old.ID); err != nil {
			return ImageRecord{}, nil, errDB
		}
		replaced = &old
	} else {
		var exists bool
		if err = tx.QueryRow(ctx, `SELECT EXISTS(
			SELECT 1 FROM summergear_app.listing_images
			WHERE listing_id=$1 AND sort_order=$2 AND state='ready' AND id<>$3
		)`, listingID, record.SortOrder, imageID).Scan(&exists); err != nil {
			return ImageRecord{}, nil, errDB
		}
		if exists {
			return ImageRecord{}, nil, errConflict
		}
	}

	err = tx.QueryRow(ctx, `UPDATE summergear_app.listing_images
		SET state='ready',completed_at=clock_timestamp(),updated_at=clock_timestamp()
		WHERE id=$1 AND state='pending_upload'
		RETURNING id::text,listing_id::text,member_id::text,storage_path,mime_type,file_size_bytes,
			alt_text,sort_order,state,upload_expires_at,completed_at,replaces_image_id::text`, imageID).Scan(
		&record.ID, &record.ListingID, &record.MemberID, &record.StoragePath, &record.MimeType, &record.FileSizeBytes,
		&record.AltText, &record.SortOrder, &record.State, &record.UploadExpiresAt, &record.CompletedAt, &record.ReplaceImageID)
	if err != nil {
		if constraintConflict(err) {
			return ImageRecord{}, nil, errConflict
		}
		return ImageRecord{}, nil, errDB
	}
	if err = tx.Commit(ctx); err != nil {
		return ImageRecord{}, nil, errDB
	}
	return record, replaced, nil
}

func (s *Store) VisibleReady(ctx context.Context, listingID, memberID string) ([]ImageRecord, error) {
	if strings.TrimSpace(listingID) == "" {
		return nil, errNotFound
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
	if err = q.QueryRow(ctx, `SELECT EXISTS(SELECT 1 FROM summergear_app.listings WHERE id=$1)`, listingID).Scan(&visible); err != nil {
		return nil, errDB
	}
	if !visible {
		return nil, errNotFound
	}
	rows, err := q.Query(ctx, `SELECT id::text,listing_id::text,member_id::text,storage_path,mime_type,file_size_bytes,
		alt_text,sort_order,state,upload_expires_at,completed_at,replaces_image_id::text
		FROM summergear_app.listing_images
		WHERE listing_id=$1 AND state='ready'
		ORDER BY sort_order,id`, listingID)
	if err != nil {
		return nil, errDB
	}
	defer rows.Close()
	items := make([]ImageRecord, 0, MaxImages)
	for rows.Next() {
		var record ImageRecord
		if err := rows.Scan(&record.ID, &record.ListingID, &record.MemberID, &record.StoragePath,
			&record.MimeType, &record.FileSizeBytes, &record.AltText, &record.SortOrder, &record.State,
			&record.UploadExpiresAt, &record.CompletedAt, &record.ReplaceImageID); err != nil {
			return nil, errDB
		}
		items = append(items, record)
	}
	if rows.Err() != nil {
		return nil, errDB
	}
	if tx != nil {
		if err = tx.Commit(ctx); err != nil {
			return nil, errDB
		}
	}
	return items, nil
}

func (s *Store) BeginDelete(ctx context.Context, memberID, listingID, imageID string) (ImageRecord, error) {
	tx, err := s.Pool.Begin(ctx)
	if err != nil {
		return ImageRecord{}, errDB
	}
	defer tx.Rollback(context.Background())
	if err := setMemberContext(ctx, tx, memberID); err != nil {
		return ImageRecord{}, err
	}
	var status string
	err = tx.QueryRow(ctx, `SELECT status FROM summergear_app.listings
		WHERE id=$1 AND member_id=$2 AND status IN ('draft','pending_review','rejected') FOR UPDATE`,
		listingID, memberID).Scan(&status)
	if errors.Is(err, pgx.ErrNoRows) {
		return ImageRecord{}, errNotFound
	}
	if err != nil {
		return ImageRecord{}, errDB
	}
	record, err := selectImageForUpdateAnyState(ctx, tx, imageID, listingID, memberID)
	if err != nil {
		return ImageRecord{}, err
	}
	if record.State == DeletingState {
		return record, nil
	}
	if record.State != ReadyState && record.State != PendingUploadState && record.State != FailedState {
		return ImageRecord{}, errNotFound
	}
	if _, err = tx.Exec(ctx, `UPDATE summergear_app.listing_images
		SET state='deleting',updated_at=clock_timestamp() WHERE id=$1`, imageID); err != nil {
		return ImageRecord{}, errDB
	}
	record.State = DeletingState
	if err = tx.Commit(ctx); err != nil {
		return ImageRecord{}, errDB
	}
	return record, nil
}

func (s *Store) FinishDelete(ctx context.Context, memberID, listingID, imageID string) error {
	tx, err := s.Pool.Begin(ctx)
	if err != nil {
		return errDB
	}
	defer tx.Rollback(context.Background())
	if err := setMemberContext(ctx, tx, memberID); err != nil {
		return err
	}
	tag, err := tx.Exec(ctx, `DELETE FROM summergear_app.listing_images
		WHERE id=$1 AND listing_id=$2 AND member_id=$3 AND state='deleting'`, imageID, listingID, memberID)
	if err != nil {
		return errDB
	}
	if tag.RowsAffected() != 1 {
		return errNotFound
	}
	if err = tx.Commit(ctx); err != nil {
		return errDB
	}
	return nil
}

type queryer interface {
	Query(context.Context, string, ...any) (pgx.Rows, error)
	QueryRow(context.Context, string, ...any) pgx.Row
}

func selectImage(ctx context.Context, q queryer, where string, args ...any) (ImageRecord, error) {
	query := fmt.Sprintf(`SELECT id::text,listing_id::text,member_id::text,storage_path,mime_type,file_size_bytes,
		alt_text,sort_order,state,upload_expires_at,completed_at,replaces_image_id::text
		FROM summergear_app.listing_images WHERE %s`, where)
	var record ImageRecord
	err := q.QueryRow(ctx, query, args...).Scan(
		&record.ID, &record.ListingID, &record.MemberID, &record.StoragePath, &record.MimeType, &record.FileSizeBytes,
		&record.AltText, &record.SortOrder, &record.State, &record.UploadExpiresAt, &record.CompletedAt, &record.ReplaceImageID)
	if errors.Is(err, pgx.ErrNoRows) {
		return ImageRecord{}, errNotFound
	}
	if err != nil {
		return ImageRecord{}, errDB
	}
	return record, nil
}

func selectImageForUpdate(ctx context.Context, tx pgx.Tx, imageID, listingID, memberID, state string) (ImageRecord, error) {
	return selectImage(ctx, tx, `id=$1 AND listing_id=$2 AND member_id=$3 AND state=$4 FOR UPDATE`, imageID, listingID, memberID, state)
}

func selectImageForUpdateAnyState(ctx context.Context, tx pgx.Tx, imageID, listingID, memberID string) (ImageRecord, error) {
	return selectImage(ctx, tx, `id=$1 AND listing_id=$2 AND member_id=$3 FOR UPDATE`, imageID, listingID, memberID)
}

func setMemberContext(ctx context.Context, tx pgx.Tx, memberID string) error {
	if _, err := tx.Exec(ctx, "SELECT set_config('summergear.member_id',$1,true)", memberID); err != nil {
		return errDB
	}
	return nil
}

func constraintConflict(err error) bool {
	var pgErr *pgconn.PgError
	return errors.As(err, &pgErr) && (pgErr.Code == "23505" || pgErr.Code == "23514")
}
