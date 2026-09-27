//go:build integration

package jobs

import (
	"context"
	"io"
	"os"
	"testing"
	"time"

	"github.com/lulupang2/social_commerce/apps/api/internal/platform"
)

func TestCommercePeriodicJobs(t *testing.T) {
	if os.Getenv("SUMMERGEAR_INTEGRATION") != "fixture" || os.Getenv("DB_TARGET") != "fixture" || os.Getenv("DB_TARGET_ID") != platform.FixtureID {
		t.Fatal("explicit isolated fixture required")
	}
	ctx := context.Background()
	cfg, err := platform.LoadConfig(platform.Worker, "")
	if err != nil {
		t.Fatal(err)
	}
	pool, err := platform.OpenDatabase(ctx, cfg)
	if err != nil {
		t.Fatal(err)
	}
	defer pool.Close()
	started := time.Now()
	client, err := NewClient(pool, cfg, platform.NewLogger(io.Discard, "error"), true)
	if err != nil {
		t.Fatal(err)
	}
	if err = client.Start(ctx); err != nil {
		t.Fatal(err)
	}
	defer func() {
		stop, cancel := context.WithTimeout(context.Background(), 5*time.Second)
		defer cancel()
		if err := client.Stop(stop); err != nil {
			t.Error(err)
		}
	}()
	deadline := time.After(15 * time.Second)
	ticker := time.NewTicker(100 * time.Millisecond)
	defer ticker.Stop()
	for {
		select {
		case <-deadline:
			t.Fatal("commerce periodic jobs did not run after worker startup")
		case <-ticker.C:
			var count int
			err = pool.QueryRow(ctx, `SELECT count(DISTINCT kind) FROM summergear_river.river_job WHERE kind IN ('summergear_reservation_expire_v1','summergear_payment_reconcile_v1') AND created_at >= $1 AND state='completed'`, started).Scan(&count)
			if err != nil {
				t.Fatal(err)
			}
			if count == 2 {
				return
			}
		}
	}
}
