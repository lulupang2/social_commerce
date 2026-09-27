//go:build integration

package listingimages

import (
	"context"
	"errors"
	"io"
	"os"
	"sync"
	"testing"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/lulupang2/social_commerce/apps/api/internal/migrate"
	"github.com/lulupang2/social_commerce/apps/api/internal/platform"
)

func TestImageDatabaseConcurrencyCapacityAndRecovery(t *testing.T) {
	if os.Getenv("SUMMERGEAR_INTEGRATION") != "fixture" ||
		os.Getenv("DB_TARGET") != "fixture" ||
		os.Getenv("DB_TARGET_ID") != platform.FixtureID {
		t.Fatal("image integration requires the explicit isolated fixture")
	}

	ctx := context.Background()
	pools := map[platform.Role]*pgxpool.Pool{}
	for _, role := range []platform.Role{platform.API, platform.Migration} {
		cfg, err := platform.LoadConfig(role, "")
		imageMust(t, err)
		pool, err := platform.OpenDatabase(ctx, cfg)
		imageMust(t, err)
		pools[role] = pool
		t.Cleanup(pool.Close)
	}
	files, err := migrate.LoadFiles("/workspace/supabase/migrations")
	imageMust(t, err)
	status, err := migrate.Run(ctx, pools[platform.Migration], files, true, platform.NewLogger(io.Discard, "error"))
	imageMust(t, err)
	if !status.Ready || status.AppVersion != migrate.PushReceiptsVersion {
		t.Fatal("image migration is not current")
	}

	var owner string
	imageMust(t, pools[platform.Migration].QueryRow(ctx,
		"INSERT INTO summergear_app.members(display_name) VALUES('image-concurrency-owner') RETURNING id::text").Scan(&owner))
	t.Cleanup(func() {
		_, _ = pools[platform.Migration].Exec(context.Background(),
			"DELETE FROM summergear_app.listings WHERE member_id=$1", owner)
		_, _ = pools[platform.Migration].Exec(context.Background(),
			"DELETE FROM summergear_app.members WHERE id=$1", owner)
	})
	store := &Store{Pool: pools[platform.API]}
	now := time.Now().UTC()

	createListing := func(title string) string {
		t.Helper()
		var id string
		imageMust(t, pools[platform.Migration].QueryRow(ctx, `INSERT INTO summergear_app.listings
			(member_id,sport,category,title,description,price_krw,condition,status,details,location_text)
			VALUES($1,'surf','equipment',$2,'image concurrency integration',1000,'good','pending_review',
			'{"sport":"surf","equipmentType":"surfboard"}'::jsonb,'fixture')
			RETURNING id::text`, owner, title).Scan(&id))
		return id
	}
	begin := func(listingID, imageID string, order int, replace *string) (ImageRecord, error) {
		input := UploadInput{MimeType: "image/jpeg", FileSizeBytes: 1024, ReplaceImageID: replace}
		if replace == nil {
			input.SortOrder = &order
		}
		return store.BeginUpload(ctx, owner, listingID, input, owner+"/"+listingID+"/"+imageID, now.Add(time.Hour))
	}
	makeReady := func(listingID, imageID string, order int) ImageRecord {
		t.Helper()
		record, err := begin(listingID, imageID, order, nil)
		imageMust(t, err)
		ready, _, err := store.CompleteUpload(ctx, owner, listingID, record.ID)
		imageMust(t, err)
		return ready
	}

	t.Run("same_position_has_one_winner", func(t *testing.T) {
		listingID := createListing("same-position")
		type result struct {
			record ImageRecord
			err    error
		}
		results := make(chan result, 2)
		var wg sync.WaitGroup
		for _, imageID := range []string{
			"10000000-0000-4000-8000-000000000001",
			"10000000-0000-4000-8000-000000000002",
		} {
			wg.Add(1)
			go func(id string) {
				defer wg.Done()
				record, err := begin(listingID, id, 0, nil)
				results <- result{record, err}
			}(imageID)
		}
		wg.Wait()
		close(results)
		successes, conflicts := 0, 0
		for result := range results {
			switch {
			case result.err == nil:
				successes++
			case errors.Is(result.err, errConflict):
				conflicts++
			default:
				t.Fatalf("unexpected slot race error: %v", result.err)
			}
		}
		if successes != 1 || conflicts != 1 {
			t.Fatalf("same-position race successes=%d conflicts=%d", successes, conflicts)
		}
		_, err := pools[platform.Migration].Exec(ctx, "DELETE FROM summergear_app.listing_images WHERE listing_id=$1", listingID)
		imageMust(t, err)
	})

	t.Run("same_replacement_has_one_pending_winner", func(t *testing.T) {
		listingID := createListing("same-replacement")
		old := makeReady(listingID, "20000000-0000-4000-8000-000000000001", 0)
		type result struct{ err error }
		results := make(chan result, 2)
		var wg sync.WaitGroup
		for _, imageID := range []string{
			"20000000-0000-4000-8000-000000000002",
			"20000000-0000-4000-8000-000000000003",
		} {
			wg.Add(1)
			go func(id string) {
				defer wg.Done()
				_, err := begin(listingID, id, 0, &old.ID)
				results <- result{err}
			}(imageID)
		}
		wg.Wait()
		close(results)
		successes, conflicts := 0, 0
		for result := range results {
			switch {
			case result.err == nil:
				successes++
			case errors.Is(result.err, errConflict):
				conflicts++
			default:
				t.Fatalf("unexpected replacement race error: %v", result.err)
			}
		}
		if successes != 1 || conflicts != 1 {
			t.Fatalf("replacement race successes=%d conflicts=%d", successes, conflicts)
		}
		_, err := pools[platform.Migration].Exec(ctx,
			"DELETE FROM summergear_app.listing_images WHERE listing_id=$1 AND state='pending_upload'", listingID)
		imageMust(t, err)
	})

	t.Run("replacement_is_allowed_at_twelve_ready_images", func(t *testing.T) {
		listingID := createListing("capacity-replacement")
		ready := make([]ImageRecord, 0, MaxImages)
		for order := 0; order < MaxImages; order++ {
			imageID := []string{
				"30000000-0000-4000-8000-000000000000",
				"30000000-0000-4000-8000-000000000001",
				"30000000-0000-4000-8000-000000000002",
				"30000000-0000-4000-8000-000000000003",
				"30000000-0000-4000-8000-000000000004",
				"30000000-0000-4000-8000-000000000005",
				"30000000-0000-4000-8000-000000000006",
				"30000000-0000-4000-8000-000000000007",
				"30000000-0000-4000-8000-000000000008",
				"30000000-0000-4000-8000-000000000009",
				"30000000-0000-4000-8000-00000000000a",
				"30000000-0000-4000-8000-00000000000b",
			}[order]
			ready = append(ready, makeReady(listingID, imageID, order))
		}
		replacement, err := begin(listingID, "30000000-0000-4000-8000-0000000000ff", 0, &ready[5].ID)
		imageMust(t, err)
		completed, old, err := store.CompleteUpload(ctx, owner, listingID, replacement.ID)
		imageMust(t, err)
		if completed.State != ReadyState || old == nil || old.ID != ready[5].ID {
			t.Fatal("replacement at capacity did not preserve the replaced row for cleanup")
		}
		var readyCount, deletingCount int
		imageMust(t, pools[platform.Migration].QueryRow(ctx, `SELECT
			count(*) FILTER (WHERE state='ready'),
			count(*) FILTER (WHERE state='deleting')
			FROM summergear_app.listing_images WHERE listing_id=$1`, listingID).Scan(&readyCount, &deletingCount))
		if readyCount != MaxImages || deletingCount != 1 {
			t.Fatalf("capacity replacement states ready=%d deleting=%d", readyCount, deletingCount)
		}
		imageMust(t, store.FinishDelete(ctx, owner, listingID, old.ID))
	})

	t.Run("failed_replacement_keeps_previous_ready_image", func(t *testing.T) {
		listingID := createListing("failed-replacement")
		old := makeReady(listingID, "40000000-0000-4000-8000-000000000001", 0)
		pending, err := begin(listingID, "40000000-0000-4000-8000-000000000002", 0, &old.ID)
		imageMust(t, err)
		imageMust(t, store.FailUpload(ctx, owner, listingID, pending.ID))
		var oldState, newState string
		imageMust(t, pools[platform.Migration].QueryRow(ctx,
			"SELECT state FROM summergear_app.listing_images WHERE id=$1", old.ID).Scan(&oldState))
		imageMust(t, pools[platform.Migration].QueryRow(ctx,
			"SELECT state FROM summergear_app.listing_images WHERE id=$1", pending.ID).Scan(&newState))
		if oldState != ReadyState || newState != FailedState {
			t.Fatalf("failed replacement changed old=%s new=%s", oldState, newState)
		}
		_, err = pools[platform.Migration].Exec(ctx, "DELETE FROM summergear_app.listing_images WHERE id=$1", pending.ID)
		imageMust(t, err)
	})

	t.Run("same_pending_replacement_complete_has_one_winner", func(t *testing.T) {
		listingID := createListing("complete-race")
		old := makeReady(listingID, "50000000-0000-4000-8000-000000000001", 0)
		pending, err := begin(listingID, "50000000-0000-4000-8000-000000000002", 0, &old.ID)
		imageMust(t, err)
		results := make(chan error, 2)
		var wg sync.WaitGroup
		for range 2 {
			wg.Add(1)
			go func() {
				defer wg.Done()
				_, _, err := store.CompleteUpload(ctx, owner, listingID, pending.ID)
				results <- err
			}()
		}
		wg.Wait()
		close(results)
		successes, missing := 0, 0
		for err := range results {
			switch {
			case err == nil:
				successes++
			case errors.Is(err, errNotFound):
				missing++
			default:
				t.Fatalf("unexpected complete race error: %v", err)
			}
		}
		if successes != 1 || missing != 1 {
			t.Fatalf("complete race successes=%d missing=%d", successes, missing)
		}
		imageMust(t, store.FinishDelete(ctx, owner, listingID, old.ID))
	})

	t.Run("expired_and_deleting_rows_are_bounded_by_recovery", func(t *testing.T) {
		listingID := createListing("recovery")
		order := 0
		expired, err := store.BeginUpload(ctx, owner, listingID,
			UploadInput{MimeType: "image/jpeg", FileSizeBytes: 1024, SortOrder: &order},
			owner+"/"+listingID+"/60000000-0000-4000-8000-000000000001", now.Add(-time.Hour))
		imageMust(t, err)
		ready := makeReady(listingID, "60000000-0000-4000-8000-000000000002", 1)
		_, err = store.BeginDelete(ctx, owner, listingID, ready.ID)
		imageMust(t, err)

		storage := &databaseCleanupStorage{}
		service := &Service{Repo: store, Storage: storage, Now: func() time.Time { return time.Now().UTC().Add(time.Hour) }}
		stats, err := service.Recover(ctx, 100)
		imageMust(t, err)
		if stats.Cleaned < 2 {
			t.Fatalf("expected expired+deleting cleanup, got %+v", stats)
		}
		var remaining int
		imageMust(t, pools[platform.Migration].QueryRow(ctx,
			"SELECT count(*) FROM summergear_app.listing_images WHERE id IN ($1,$2)", expired.ID, ready.ID).Scan(&remaining))
		if remaining != 0 || storage.deleteCalls < 2 {
			t.Fatalf("recovery left rows=%d storageDeletes=%d", remaining, storage.deleteCalls)
		}
	})
}

type databaseCleanupStorage struct{ deleteCalls int }

func (*databaseCleanupStorage) CreateSignedUpload(context.Context, string) (string, error) {
	return "", ErrStorageUnavailable
}
func (*databaseCleanupStorage) Info(context.Context, string) (ObjectInfo, error) {
	return ObjectInfo{}, ErrStorageUnavailable
}
func (*databaseCleanupStorage) ReadObject(context.Context, string, int64) ([]byte, error) {
	return nil, ErrStorageUnavailable
}
func (*databaseCleanupStorage) Sign(context.Context, string, time.Duration) (string, error) {
	return "", ErrStorageUnavailable
}
func (s *databaseCleanupStorage) Delete(context.Context, string) error {
	s.deleteCalls++
	return nil
}
