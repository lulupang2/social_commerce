package jobs

import (
	"context"
	"errors"
	"log/slog"
	"regexp"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/lulupang2/social_commerce/apps/api/internal/notifications"
	"github.com/lulupang2/social_commerce/apps/api/internal/orders"
	"github.com/lulupang2/social_commerce/apps/api/internal/platform"
	"github.com/riverqueue/river"
	"github.com/riverqueue/river/riverdriver/riverpgxv5"
	"github.com/riverqueue/river/rivertype"
)

const Queue = "foundation"

// Payloads carry only a version and record identifier. Fault controls are
// fixture-only and rejected for hosted targets by both producer and consumer.
type SampleArgs struct {
	Version      int    `json:"version"`
	RequestID    string `json:"request_id"`
	FailAttempts int    `json:"fail_attempts,omitempty"`
	DelayMS      int    `json:"delay_ms,omitempty"`
}

func (SampleArgs) Kind() string { return "summergear_sample_v1" }

type Options struct{ FailAttempts, DelayMS, MaxAttempts int }
type Result struct {
	RequestID string `json:"requestId"`
	JobID     int64  `json:"jobId"`
	Duplicate bool   `json:"duplicate"`
}
type EnqueueFunc func(context.Context, pgx.Tx, SampleArgs, int) (int64, error)
type Service struct {
	Pool    *pgxpool.Pool
	Enqueue EnqueueFunc
	Fixture bool
}

var keyPattern = regexp.MustCompile(`^[a-zA-Z0-9_-]{1,100}$`)
var ErrInvalid = errors.New("invalid sample request")

func NewService(pool *pgxpool.Pool, client *river.Client[pgx.Tx], fixture bool) *Service {
	return &Service{Pool: pool, Fixture: fixture, Enqueue: func(ctx context.Context, tx pgx.Tx, args SampleArgs, maxAttempts int) (int64, error) {
		result, err := client.InsertTx(ctx, tx, args, &river.InsertOpts{Queue: Queue, MaxAttempts: maxAttempts})
		if err != nil {
			return 0, platform.ErrDatabase
		}
		return result.Job.ID, nil
	}}
}

func (s *Service) Create(ctx context.Context, key string, opts Options) (Result, error) {
	tx, err := s.Pool.BeginTx(ctx, pgx.TxOptions{})
	if err != nil {
		return Result{}, platform.ErrDatabase
	}
	defer tx.Rollback(context.Background())
	result, err := s.CreateTx(ctx, tx, key, opts)
	if err != nil {
		return Result{}, err
	}
	if err := tx.Commit(ctx); err != nil {
		return Result{}, platform.ErrDatabase
	}
	return result, nil
}

// CreateTx is the boundary shared by business writes and queue registration.
// The caller owns commit/rollback; workers cannot see either record beforehand.
func (s *Service) CreateTx(ctx context.Context, tx pgx.Tx, key string, opts Options) (Result, error) {
	if !keyPattern.MatchString(key) || opts.FailAttempts < 0 || opts.FailAttempts > 10 || opts.DelayMS < 0 || opts.DelayMS > 10000 {
		return Result{}, ErrInvalid
	}
	if !s.Fixture && (opts.FailAttempts != 0 || opts.DelayMS != 0) {
		return Result{}, ErrInvalid
	}
	if opts.MaxAttempts == 0 {
		opts.MaxAttempts = 3
	}
	if opts.MaxAttempts < 1 || opts.MaxAttempts > 10 {
		return Result{}, ErrInvalid
	}
	var result Result
	err := tx.QueryRow(ctx, `INSERT INTO summergear_app.sample_requests(idempotency_key)
		VALUES($1) ON CONFLICT(idempotency_key) DO NOTHING RETURNING id::text`, key).Scan(&result.RequestID)
	if errors.Is(err, pgx.ErrNoRows) {
		err = tx.QueryRow(ctx, `SELECT id::text,job_id FROM summergear_app.sample_requests WHERE idempotency_key=$1`, key).Scan(&result.RequestID, &result.JobID)
		if err != nil {
			return Result{}, platform.ErrDatabase
		}
		result.Duplicate = true
		return result, nil
	}
	if err != nil {
		return Result{}, platform.ErrDatabase
	}
	result.JobID, err = s.Enqueue(ctx, tx, SampleArgs{1, result.RequestID, opts.FailAttempts, opts.DelayMS}, opts.MaxAttempts)
	if err != nil {
		return Result{}, platform.ErrDatabase
	}
	if _, err = tx.Exec(ctx, `UPDATE summergear_app.sample_requests SET job_id=$1 WHERE id=$2`, result.JobID, result.RequestID); err != nil {
		return Result{}, platform.ErrDatabase
	}
	return result, nil
}

type SampleWorker struct {
	river.WorkerDefaults[SampleArgs]
	Pool    *pgxpool.Pool
	Fixture bool
}

func (w *SampleWorker) Work(ctx context.Context, job *river.Job[SampleArgs]) error {
	a := job.Args
	if a.Version != 1 || a.RequestID == "" {
		return river.JobCancel(errors.New("unsupported sample payload"))
	}
	if !w.Fixture && (a.FailAttempts != 0 || a.DelayMS != 0) {
		return river.JobCancel(errors.New("fixture controls are forbidden"))
	}
	if a.FailAttempts < 0 || a.FailAttempts > 10 || a.DelayMS < 0 || a.DelayMS > 10000 {
		return river.JobCancel(errors.New("invalid sample payload"))
	}
	if job.Attempt <= a.FailAttempts {
		return errors.New("fixture retry requested")
	}
	if a.DelayMS > 0 && job.Attempt == 1 {
		timer := time.NewTimer(time.Duration(a.DelayMS) * time.Millisecond)
		defer timer.Stop()
		select {
		case <-ctx.Done():
			return context.Canceled
		case <-timer.C:
		}
	}
	return w.Apply(ctx, a.RequestID)
}

// A unique effect row protects against a crash after commit but before River
// acknowledges completion. This does NOT promise exactly-once external effects.
func (w *SampleWorker) Apply(ctx context.Context, requestID string) error {
	_, err := w.Pool.Exec(ctx, `INSERT INTO summergear_app.sample_effects(request_id) VALUES($1) ON CONFLICT(request_id) DO NOTHING`, requestID)
	if err != nil {
		return platform.ErrDatabase
	}
	return nil
}

func NewClient(pool *pgxpool.Pool, cfg platform.Config, logger *slog.Logger, execute bool) (*river.Client[pgx.Tx], error) {
	workers := river.NewWorkers()
	river.AddWorker(workers, &SampleWorker{Pool: pool, Fixture: cfg.Target == "fixture"})
	river.AddWorker(workers, &ReservationExpireWorker{Pool: pool})

	pg := orders.ConfiguredGateway(pool, cfg)
	river.AddWorker(workers, &PaymentReconcileWorker{Pool: pool, PGAdapter: pg})
	river.AddWorker(workers, &PaymentRecheckWorker{Pool: pool, PGAdapter: pg})
	river.AddWorker(workers, &notifications.DispatchWorker{
		Pool:   pool,
		Sender: &notifications.ExpoSender{AccessToken: cfg.ExpoPushAccessToken},
	})
	river.AddWorker(workers, &notifications.ReconcileWorker{
		Pool:          pool,
		Sender:        &notifications.ExpoSender{AccessToken: cfg.ExpoPushAccessToken},
		MinReceiptAge: 15 * time.Minute,
	})

	c := &river.Config{
		Schema: platform.RiverSchema, Logger: logger, Workers: workers,
		JobTimeout: 30 * time.Second, RescueStuckJobsAfter: time.Minute,
		ReindexerIndexNames: []string{}, DiscardedJobRetentionPeriod: -1,
	}
	if execute {
		c.PeriodicJobs = []*river.PeriodicJob{
			river.NewPeriodicJob(river.PeriodicInterval(time.Minute), func() (river.JobArgs, *river.InsertOpts) {
				return ReservationExpireArgs{Version: 1}, &river.InsertOpts{Queue: OrdersQueue, MaxAttempts: 5}
			}, &river.PeriodicJobOpts{ID: "orders-expire", RunOnStart: true}),
			river.NewPeriodicJob(river.PeriodicInterval(time.Minute), func() (river.JobArgs, *river.InsertOpts) {
				return PaymentReconcileArgs{Version: 1}, &river.InsertOpts{Queue: OrdersQueue, MaxAttempts: 5}
			}, &river.PeriodicJobOpts{ID: "orders-reconcile", RunOnStart: true}),
			river.NewPeriodicJob(river.PeriodicInterval(5*time.Second), func() (river.JobArgs, *river.InsertOpts) {
				return notifications.DispatchArgs{Version: 1}, &river.InsertOpts{Queue: Queue, MaxAttempts: 5}
			}, &river.PeriodicJobOpts{ID: "push-dispatch", RunOnStart: true}),
			river.NewPeriodicJob(river.PeriodicInterval(time.Minute), func() (river.JobArgs, *river.InsertOpts) {
				return notifications.ReconcileArgs{Version: 1}, &river.InsertOpts{Queue: Queue, MaxAttempts: 5}
			}, &river.PeriodicJobOpts{ID: "push-reconcile", RunOnStart: false}),
		}
		c.Queues = map[string]river.QueueConfig{Queue: {MaxWorkers: cfg.MaxWorkers}, OrdersQueue: {MaxWorkers: cfg.MaxWorkers}}
	}
	if cfg.FixtureFast {
		c.TestOnly = true
		c.JobTimeout, c.RescueStuckJobsAfter = 2*time.Second, 3*time.Second
		c.FetchCooldown, c.FetchPollInterval = 100*time.Millisecond, 200*time.Millisecond
		c.RetryPolicy = fixtureRetry{}
	}
	client, err := river.NewClient(riverpgxv5.New(pool), c)
	if err != nil {
		return nil, errors.New("River configuration rejected")
	}
	return client, nil
}

type fixtureRetry struct{}

func (fixtureRetry) NextRetry(*rivertype.JobRow) time.Time {
	return time.Now().Add(100 * time.Millisecond)
}
