package listingimages

import (
	"context"
	"errors"
	"log/slog"
	"time"
)

const (
	RecoverySweepInterval = 5 * time.Minute
	RecoveryGrace         = 5 * time.Minute
	RecoveryBatchSize     = 100
	RecoverySweepTimeout  = 30 * time.Second
)

type RecoveryRepository interface {
	RecoveryCandidates(context.Context, time.Time, int) ([]ImageRecord, error)
	FinishRecovery(context.Context, ImageRecord) error
}

type RecoveryStats struct {
	Scanned  int
	Cleaned  int
	Deferred int
}

// Recover deletes Storage objects for stale failed/deleting rows and removes the
// metadata only after object deletion succeeds (or Storage reports 404). It is
// safe to run concurrently and repeatedly.
func (s *Service) Recover(ctx context.Context, limit int) (RecoveryStats, error) {
	var stats RecoveryStats
	repo, ok := s.Repo.(RecoveryRepository)
	if !ok || limit <= 0 {
		return stats, nil
	}
	candidates, err := repo.RecoveryCandidates(ctx, s.now().Add(-RecoveryGrace), limit)
	if err != nil {
		return stats, err
	}
	stats.Scanned = len(candidates)
	var lastErr error
	for _, record := range candidates {
		if err := s.Storage.Delete(ctx, record.StoragePath); err != nil && !errors.Is(err, ErrObjectNotFound) {
			stats.Deferred++
			continue
		}
		if err := repo.FinishRecovery(ctx, record); err != nil {
			stats.Deferred++
			lastErr = err
			continue
		}
		stats.Cleaned++
	}
	return stats, lastErr
}

func (s *Service) RunRecoveryLoop(ctx context.Context, logger *slog.Logger) {
	run := func() {
		sweepCtx, cancel := context.WithTimeout(ctx, RecoverySweepTimeout)
		stats, err := s.Recover(sweepCtx, RecoveryBatchSize)
		cancel()
		if logger == nil {
			return
		}
		if err != nil {
			logger.Warn("listing_image_recovery_failed", "error", err.Error(), "scanned", stats.Scanned, "cleaned", stats.Cleaned, "deferred", stats.Deferred)
			return
		}
		if stats.Scanned > 0 {
			logger.Info("listing_image_recovery_sweep", "scanned", stats.Scanned, "cleaned", stats.Cleaned, "deferred", stats.Deferred)
		}
	}

	run()
	ticker := time.NewTicker(RecoverySweepInterval)
	defer ticker.Stop()
	for {
		select {
		case <-ctx.Done():
			return
		case <-ticker.C:
			run()
		}
	}
}

// RecoveryCandidates uses the API role only. The auth schema permits reading
// member ids, and each listing-image scan runs with a transaction-local member
// context so RLS remains effective and cannot leak between owners.
func (s *Store) RecoveryCandidates(ctx context.Context, cutoff time.Time, limit int) ([]ImageRecord, error) {
	if limit <= 0 {
		return []ImageRecord{}, nil
	}
	memberRows, err := s.Pool.Query(ctx, `SELECT id::text FROM summergear_app.members ORDER BY id`)
	if err != nil {
		return nil, errDB
	}
	memberIDs := make([]string, 0, 64)
	for memberRows.Next() {
		var memberID string
		if err := memberRows.Scan(&memberID); err != nil {
			memberRows.Close()
			return nil, errDB
		}
		memberIDs = append(memberIDs, memberID)
	}
	if err := memberRows.Err(); err != nil {
		memberRows.Close()
		return nil, errDB
	}
	memberRows.Close()

	result := make([]ImageRecord, 0, limit)
	for _, memberID := range memberIDs {
		if len(result) >= limit {
			break
		}
		tx, err := s.Pool.Begin(ctx)
		if err != nil {
			return nil, errDB
		}
		if err = setMemberContext(ctx, tx, memberID); err != nil {
			_ = tx.Rollback(context.Background())
			return nil, err
		}
		if _, err = tx.Exec(ctx, `UPDATE summergear_app.listing_images
			SET state='upload_failed',updated_at=clock_timestamp()
			WHERE member_id=$1 AND state='pending_upload' AND upload_expires_at<=clock_timestamp()`, memberID); err != nil {
			_ = tx.Rollback(context.Background())
			return nil, errDB
		}
		rows, err := tx.Query(ctx, `SELECT id::text,listing_id::text,member_id::text,storage_path,mime_type,file_size_bytes,
			alt_text,sort_order,state,upload_expires_at,completed_at,replaces_image_id::text
			FROM summergear_app.listing_images
			WHERE member_id=$1 AND state IN ('upload_failed','deleting') AND updated_at<=$2
			ORDER BY updated_at,id LIMIT $3`, memberID, cutoff, limit-len(result))
		if err != nil {
			_ = tx.Rollback(context.Background())
			return nil, errDB
		}
		for rows.Next() {
			var record ImageRecord
			if err := rows.Scan(&record.ID, &record.ListingID, &record.MemberID, &record.StoragePath,
				&record.MimeType, &record.FileSizeBytes, &record.AltText, &record.SortOrder, &record.State,
				&record.UploadExpiresAt, &record.CompletedAt, &record.ReplaceImageID); err != nil {
				rows.Close()
				_ = tx.Rollback(context.Background())
				return nil, errDB
			}
			result = append(result, record)
		}
		if err := rows.Err(); err != nil {
			rows.Close()
			_ = tx.Rollback(context.Background())
			return nil, errDB
		}
		rows.Close()
		if err = tx.Commit(ctx); err != nil {
			return nil, errDB
		}
	}
	return result, nil
}

func (s *Store) FinishRecovery(ctx context.Context, record ImageRecord) error {
	tx, err := s.Pool.Begin(ctx)
	if err != nil {
		return errDB
	}
	defer tx.Rollback(context.Background())
	if err = setMemberContext(ctx, tx, record.MemberID); err != nil {
		return err
	}
	if _, err = tx.Exec(ctx, `DELETE FROM summergear_app.listing_images
		WHERE id=$1 AND listing_id=$2 AND member_id=$3 AND state IN ('upload_failed','deleting')`,
		record.ID, record.ListingID, record.MemberID); err != nil {
		return errDB
	}
	if err = tx.Commit(ctx); err != nil {
		return errDB
	}
	return nil
}
