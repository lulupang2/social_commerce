package jobs

import (
	"context"
	"errors"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/lulupang2/social_commerce/apps/api/internal/orders"
	"github.com/riverqueue/river"
)

const OrdersQueue = "orders"

type ReservationExpireArgs struct {
	Version int `json:"version"`
}

func (ReservationExpireArgs) Kind() string { return "summergear_reservation_expire_v1" }

type ReservationExpireWorker struct {
	river.WorkerDefaults[ReservationExpireArgs]
	Pool *pgxpool.Pool
}

func (w *ReservationExpireWorker) Work(ctx context.Context, job *river.Job[ReservationExpireArgs]) error {
	if job.Args.Version != 1 {
		return river.JobCancel(errors.New("unsupported version"))
	}
	return (&orders.Store{Pool: w.Pool}).ExpireReservations(ctx)
}

type PaymentReconcileArgs struct {
	Version int `json:"version"`
}

func (PaymentReconcileArgs) Kind() string { return "summergear_payment_reconcile_v1" }

type PaymentReconcileWorker struct {
	river.WorkerDefaults[PaymentReconcileArgs]
	Pool      *pgxpool.Pool
	PGAdapter orders.PGAdapter
}

func (w *PaymentReconcileWorker) Work(ctx context.Context, job *river.Job[PaymentReconcileArgs]) error {
	if job.Args.Version != 1 {
		return river.JobCancel(errors.New("unsupported version"))
	}
	store := &orders.Store{Pool: w.Pool}
	paymentErr := store.ReconcilePayments(ctx, w.PGAdapter)
	eventErr := store.ReconcileEvents(ctx, w.PGAdapter)
	return errors.Join(paymentErr, eventErr)
}

type PaymentRecheckArgs struct {
	Version   int    `json:"version"`
	RequestID string `json:"request_id"`
}

func (PaymentRecheckArgs) Kind() string { return "summergear_payment_recheck_v1" }

type PaymentRecheckWorker struct {
	river.WorkerDefaults[PaymentRecheckArgs]
	Pool      *pgxpool.Pool
	PGAdapter orders.PGAdapter
}

func (w *PaymentRecheckWorker) Work(ctx context.Context, job *river.Job[PaymentRecheckArgs]) error {
	if job.Args.Version != 1 || uuid.Validate(job.Args.RequestID) != nil {
		return river.JobCancel(errors.New("invalid payment recheck payload"))
	}
	var orderID, status string
	err := w.Pool.QueryRow(ctx, `SELECT order_id::text,status FROM summergear_app.payment_recovery_requests WHERE id=$1`, job.Args.RequestID).Scan(&orderID, &status)
	if errors.Is(err, pgx.ErrNoRows) {
		return river.JobCancel(errors.New("payment recheck request missing"))
	}
	if err != nil {
		return err
	}
	if status != "queued" {
		return nil
	}
	err = (&orders.Store{Pool: w.Pool}).ReconcileOrder(ctx, w.PGAdapter, orderID)
	if errors.Is(err, orders.ErrDatabase) || (ctx.Err() != nil && errors.Is(err, ctx.Err())) {
		return err
	}
	result, code := "checked", ""
	if err != nil {
		result, code = "failed", "provider_lookup_or_state_conflict"
		if errors.Is(err, orders.ErrConflict) {
			code = "authoritative_state_conflict"
		}
	}
	_, updateErr := w.Pool.Exec(ctx, `UPDATE summergear_app.payment_recovery_requests
 SET status=$2,last_error_code=$3,finished_at=clock_timestamp()
 WHERE id=$1 AND status='queued'`, job.Args.RequestID, result, code)
	return updateErr
}
