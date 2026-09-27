//go:build integration

package integration

import (
	"context"
	"errors"
	"io"
	"net/http"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"sync"
	"syscall"
	"testing"
	"time"

	"github.com/jackc/pgx/v5/pgconn"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/lulupang2/social_commerce/apps/api/internal/jobs"
	"github.com/lulupang2/social_commerce/apps/api/internal/migrate"
	"github.com/lulupang2/social_commerce/apps/api/internal/platform"
	"github.com/riverqueue/river"
)

func TestFoundation(t *testing.T) {
	if os.Getenv("SUMMERGEAR_INTEGRATION") != "fixture" || os.Getenv("DB_TARGET") != "fixture" || os.Getenv("DB_TARGET_ID") != platform.FixtureID {
		t.Fatal("integration tests require the explicit isolated fixture; no external database is permitted")
	}
	ctx := context.Background()
	logger := platform.NewLogger(io.Discard, "error")
	configs := map[platform.Role]platform.Config{}
	pools := map[platform.Role]*pgxpool.Pool{}
	for _, role := range []platform.Role{platform.API, platform.Worker, platform.Migration} {
		cfg, err := platform.LoadConfig(role, "")
		must(t, err)
		pool, err := platform.OpenDatabase(ctx, cfg)
		must(t, err)
		configs[role], pools[role] = cfg, pool
		t.Cleanup(pool.Close)
	}
	api, worker, admin := pools[platform.API], pools[platform.Worker], pools[platform.Migration]
	sql, err := os.ReadFile("/workspace/supabase/migrations/0007_go_foundation.sql")
	must(t, err)
	t.Run("official_migrations_idempotency_and_checksum", func(t *testing.T) {
		for range 2 {
			status, err := migrate.Up(ctx, admin, sql, logger)
			must(t, err)
			if !status.Ready || status.RiverVersion != 7 {
				t.Fatal("migration version not ready")
			}
		}
		_, err := migrate.Up(ctx, admin, append(append([]byte{}, sql...), []byte("\n-- drift\n")...), logger)
		if err == nil {
			t.Fatal("changed applied migration accepted")
		}
	})
	files, err := migrate.LoadFiles("/workspace/supabase/migrations")
	must(t, err)
	t.Run("upgrade_to_current_app_manifest", func(t *testing.T) {
		status, err := migrate.Run(ctx, admin, files, true, logger)
		must(t, err)
		if !status.Ready || status.AppVersion != migrate.PushReceiptsVersion || status.RiverVersion != 7 {
			t.Fatal("current app migration manifest not ready")
		}
	})
	client, err := jobs.NewClient(api, configs[platform.API], logger, false)
	must(t, err)
	service := jobs.NewService(api, client, true)
	var committed jobs.Result
	t.Run("commit_and_no_precommit_visibility", func(t *testing.T) {
		tx, err := api.Begin(ctx)
		must(t, err)
		defer tx.Rollback(ctx)
		committed, err = service.CreateTx(ctx, tx, "committed", jobs.Options{})
		must(t, err)
		if count(t, api, "SELECT count(*) FROM summergear_app.sample_requests WHERE id=$1", committed.RequestID) != 0 {
			t.Fatal("uncommitted business record visible")
		}
		if count(t, api, "SELECT count(*) FROM summergear_river.river_job WHERE id=$1", committed.JobID) != 0 {
			t.Fatal("uncommitted job visible")
		}
		must(t, tx.Commit(ctx))
		if count(t, api, "SELECT count(*) FROM summergear_river.river_job WHERE id=$1", committed.JobID) != 1 {
			t.Fatal("committed job missing")
		}
	})
	t.Run("rollback_removes_business_and_job", func(t *testing.T) {
		tx, err := api.Begin(ctx)
		must(t, err)
		r, err := service.CreateTx(ctx, tx, "rolled-back", jobs.Options{})
		must(t, err)
		must(t, tx.Rollback(ctx))
		if count(t, api, "SELECT count(*) FROM summergear_app.sample_requests WHERE id=$1", r.RequestID) != 0 || count(t, api, "SELECT count(*) FROM summergear_river.river_job WHERE id=$1", r.JobID) != 0 {
			t.Fatal("rollback left durable records")
		}
	})
	t.Run("real_enqueue_permission_failure_rolls_back_business", func(t *testing.T) {
		_, err := admin.Exec(ctx, "REVOKE INSERT ON summergear_river.river_job FROM summergear_api")
		must(t, err)
		_, createErr := service.Create(ctx, "enqueue-denied", jobs.Options{})
		_, err = admin.Exec(ctx, "GRANT INSERT ON summergear_river.river_job TO summergear_api")
		must(t, err)
		if createErr == nil {
			t.Fatal("enqueue should have failed")
		}
		if count(t, api, "SELECT count(*) FROM summergear_app.sample_requests WHERE idempotency_key='enqueue-denied'") != 0 {
			t.Fatal("business change survived failed enqueue")
		}
	})
	t.Run("concurrent_idempotent_registration", func(t *testing.T) {
		var wg sync.WaitGroup
		results := make(chan jobs.Result, 4)
		errs := make(chan error, 4)
		for range 4 {
			wg.Add(1)
			go func() {
				defer wg.Done()
				r, e := service.Create(ctx, "concurrent", jobs.Options{})
				results <- r
				errs <- e
			}()
		}
		wg.Wait()
		close(results)
		close(errs)
		for err := range errs {
			must(t, err)
		}
		var id int64
		for r := range results {
			if id == 0 {
				id = r.JobID
			}
			if r.JobID != id {
				t.Fatal("duplicate job registered")
			}
		}
		if count(t, api, "SELECT count(*) FROM summergear_app.sample_requests WHERE idempotency_key='concurrent'") != 1 {
			t.Fatal("duplicate business record")
		}
	})
	t.Run("least_privilege_and_private_schemas", func(t *testing.T) {
		denied(t, api, "UPDATE summergear_river.river_job SET state='available' WHERE false")
		denied(t, api, "DELETE FROM summergear_river.river_job WHERE false")
		denied(t, api, "INSERT INTO summergear_app.sample_effects(request_id) VALUES(gen_random_uuid())")
		denied(t, api, "CREATE TABLE summergear_app.forbidden(id int)")
		denied(t, api, "UPDATE summergear_meta.environment_guard SET target_id='changed' WHERE false")
		denied(t, worker, "DELETE FROM summergear_river.river_migration WHERE false")
		denied(t, worker, "CREATE TABLE summergear_river.forbidden(id int)")
		for _, role := range []string{"anon", "authenticated"} {
			for _, schema := range []string{platform.AppSchema, platform.RiverSchema, platform.MetaSchema} {
				var allowed bool
				must(t, admin.QueryRow(ctx, "SELECT has_schema_privilege($1,$2,'USAGE')", role, schema).Scan(&allowed))
				if allowed {
					t.Fatal("browser role can access private schema")
				}
			}
		}
		cfg := configs[platform.API]
		cfg.TargetID = "wrong-target"
		if platform.VerifyDatabase(ctx, api, cfg) == nil {
			t.Fatal("wrong target marker accepted")
		}
	})
	t.Run("worker_executes_committed_job", func(t *testing.T) {
		p := startProcess(t, "worker", configs[platform.Worker])
		defer p.kill()
		awaitJob(t, api, committed.JobID, "completed", 60*time.Second)
		p.stop(t)
		if count(t, api, "SELECT count(*) FROM summergear_app.sample_effects WHERE request_id=$1", committed.RequestID) != 1 {
			t.Fatal("business effect missing")
		}
	})
	t.Run("retry_success_and_exhaustion", func(t *testing.T) {
		retry, err := service.Create(ctx, "retry", jobs.Options{FailAttempts: 1, MaxAttempts: 3})
		must(t, err)
		exhaust, err := service.Create(ctx, "exhaust", jobs.Options{FailAttempts: 10, MaxAttempts: 2})
		must(t, err)
		p := startProcess(t, "worker", configs[platform.Worker])
		defer p.kill()
		awaitJob(t, api, retry.JobID, "completed", 60*time.Second)
		awaitJob(t, api, exhaust.JobID, "discarded", 60*time.Second)
		if count(t, api, "SELECT attempt FROM summergear_river.river_job WHERE id=$1", retry.JobID) != 2 {
			t.Fatal("retry attempt count mismatch")
		}
		if count(t, api, "SELECT attempt FROM summergear_river.river_job WHERE id=$1", exhaust.JobID) != 2 {
			t.Fatal("exhaustion attempt count mismatch")
		}
		if count(t, api, "SELECT count(*) FROM summergear_app.sample_effects WHERE request_id=$1", exhaust.RequestID) != 0 {
			t.Fatal("failed job recorded success")
		}
		p.stop(t)
	})
	t.Run("SIGKILL_restart_rescues_running_job", func(t *testing.T) {
		r, err := service.Create(ctx, "crash-recovery", jobs.Options{DelayMS: 10000, MaxAttempts: 3})
		must(t, err)
		p := startProcess(t, "worker", configs[platform.Worker])
		awaitJob(t, api, r.JobID, "running", 30*time.Second)
		p.kill()
		// Do not manipulate job timestamps/state. Let River's real rescuer run.
		time.Sleep(4 * time.Second)
		restarted := startProcess(t, "worker", configs[platform.Worker])
		defer restarted.kill()
		awaitJob(t, api, r.JobID, "completed", 90*time.Second)
		if count(t, api, "SELECT attempt FROM summergear_river.river_job WHERE id=$1", r.JobID) < 2 {
			t.Fatal("job was not retried after SIGKILL")
		}
		if count(t, api, "SELECT count(*) FROM summergear_app.sample_effects WHERE request_id=$1", r.RequestID) != 1 {
			t.Fatal("crash caused missing/duplicate effect")
		}
		restarted.stop(t)
	})
	t.Run("reexecution_does_not_duplicate_effect", func(t *testing.T) {
		w := jobs.SampleWorker{Pool: worker, Fixture: true}
		must(t, w.Apply(ctx, committed.RequestID))
		must(t, w.Apply(ctx, committed.RequestID))
		_, err := client.Insert(ctx, jobs.SampleArgs{Version: 1, RequestID: committed.RequestID}, &river.InsertOpts{Queue: jobs.Queue})
		must(t, err)
		p := startProcess(t, "worker", configs[platform.Worker])
		defer p.kill()
		eventually(t, 30*time.Second, func() bool {
			return count(t, api, "SELECT count(*) FROM summergear_river.river_job WHERE state IN ('available','running','retryable','scheduled')") == 0
		})
		p.stop(t)
		if count(t, api, "SELECT count(*) FROM summergear_app.sample_effects WHERE request_id=$1", committed.RequestID) != 1 {
			t.Fatal("reexecution duplicated effect")
		}
	})
	t.Run("HTTP_process_readiness_loss_and_graceful_shutdown", func(t *testing.T) {
		p := startProcess(t, "api", configs[platform.API])
		defer p.kill()
		eventually(t, 15*time.Second, func() bool { return httpStatus("/health/ready") == 200 })
		if httpStatus("/health/live") != 200 || httpStatus("/api/v1/private") != 404 {
			t.Fatal("unexpected HTTP contract")
		}
		_, err := admin.Exec(ctx, "REVOKE SELECT ON summergear_app.sample_requests FROM summergear_api")
		must(t, err)
		status := httpStatus("/health/ready")
		_, err = admin.Exec(ctx, "GRANT SELECT ON summergear_app.sample_requests TO summergear_api")
		must(t, err)
		if status != 503 {
			t.Fatal("missing database permissions did not fail readiness")
		}
		p.stop(t)
	})
}

func must(t *testing.T, err error) {
	t.Helper()
	if err != nil {
		t.Fatal(err)
	}
}
func count(t *testing.T, pool *pgxpool.Pool, sql string, args ...any) int {
	t.Helper()
	var n int
	must(t, pool.QueryRow(context.Background(), sql, args...).Scan(&n))
	return n
}
func denied(t *testing.T, pool *pgxpool.Pool, sql string) {
	t.Helper()
	_, err := pool.Exec(context.Background(), sql)
	var pgErr *pgconn.PgError
	if !errors.As(err, &pgErr) || pgErr.Code != "42501" {
		t.Fatalf("expected permission denial, got %v", err)
	}
}
func eventually(t *testing.T, timeout time.Duration, condition func() bool) {
	t.Helper()
	deadline := time.Now().Add(timeout)
	for time.Now().Before(deadline) {
		if condition() {
			return
		}
		time.Sleep(100 * time.Millisecond)
	}
	t.Fatal("condition was not met before deadline")
}
func awaitJob(t *testing.T, pool *pgxpool.Pool, id int64, state string, timeout time.Duration) {
	t.Helper()
	eventually(t, timeout, func() bool {
		var actual string
		err := pool.QueryRow(context.Background(), "SELECT state::text FROM summergear_river.river_job WHERE id=$1", id).Scan(&actual)
		return err == nil && actual == state
	})
}
func httpStatus(path string) int {
	client := http.Client{Timeout: 3 * time.Second}
	response, err := client.Get("http://127.0.0.1:18080" + path)
	if err != nil {
		return 0
	}
	defer response.Body.Close()
	io.Copy(io.Discard, response.Body)
	return response.StatusCode
}

type process struct {
	cmd      *exec.Cmd
	done     chan error
	finished bool
	log      *os.File
}

func startProcess(t *testing.T, kind string, cfg platform.Config) *process {
	t.Helper()
	binary := filepath.Join(os.Getenv("FOUNDATION_BIN_DIR"), kind)
	cmd := exec.Command(binary)
	// Never inherit the runner's full environment: especially no migrator DSN.
	cmd.Env = []string{"PATH=/usr/local/bin:/usr/bin:/bin", "APP_ENV=test", "PAYMENT_MODE=test", "DB_TARGET=fixture", "DB_TARGET_ID=" + platform.FixtureID, "FIXTURE_FAST_JOBS=true", "GOMAXPROCS=2", "GOMEMLIMIT=64MiB", "API_ADDR=127.0.0.1:18080", "LOG_LEVEL=warn"}
	key := "DATABASE_URL"
	if kind == "worker" {
		key = "RIVER_DATABASE_URL"
	}
	cmd.Env = append(cmd.Env, key+"="+cfg.DatabaseURL)
	log, err := os.CreateTemp(t.TempDir(), kind+"-*.log")
	must(t, err)
	cmd.Stdout, cmd.Stderr = log, log
	must(t, cmd.Start())
	p := &process{cmd: cmd, done: make(chan error, 1), log: log}
	go func() { p.done <- cmd.Wait() }()
	t.Cleanup(func() {
		p.kill()
		log.Close()
		data, _ := os.ReadFile(log.Name())
		if strings.Contains(string(data), "fixture_api") || strings.Contains(string(data), "fixture_worker") {
			t.Error("credential leaked in child logs")
		}
	})
	return p
}
func (p *process) kill() {
	if p.finished {
		return
	}
	_ = p.cmd.Process.Kill()
	select {
	case <-p.done:
		p.finished = true
	case <-time.After(5 * time.Second):
	}
	p.log.Sync()
}
func (p *process) stop(t *testing.T) {
	t.Helper()
	if p.finished {
		return
	}
	must(t, p.cmd.Process.Signal(syscall.SIGTERM))
	select {
	case err := <-p.done:
		p.finished = true
		must(t, err)
	case <-time.After(15 * time.Second):
		p.kill()
		t.Fatal("process did not gracefully stop")
	}
}
