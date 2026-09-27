package recovery

import (
	"context"
	"errors"
	"strings"
	"time"
	"unicode/utf8"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/lulupang2/social_commerce/apps/api/internal/jobs"
	"github.com/riverqueue/river"
)

type Failure struct {
	Status        int
	Code, Message string
}

func (f *Failure) Error() string { return f.Code }

var forbidden = &Failure{403, "RECOVERY_FORBIDDEN", "Operator access required"}
var invalid = &Failure{400, "RECOVERY_INVALID", "Invalid recovery request"}
var conflict = &Failure{409, "RECOVERY_CONFLICT", "Payment is terminal or cannot be safely rechecked"}
var missing = &Failure{404, "RECOVERY_NOT_FOUND", "Payment attempt unavailable"}
var unavailable = &Failure{503, "RECOVERY_UNAVAILABLE", "Recovery database unavailable"}

type Attempt struct {
	ID            string    `json:"id"`
	OrderID       string    `json:"orderId"`
	Status        string    `json:"status"`
	PaymentStatus string    `json:"paymentStatus"`
	UpdatedAt     time.Time `json:"updatedAt"`
	Recheckable   bool      `json:"recheckable"`
}
type Job struct {
	ID        int64     `json:"id"`
	Kind      string    `json:"kind"`
	State     string    `json:"state"`
	Attempt   int       `json:"attempt"`
	CreatedAt time.Time `json:"createdAt"`
}
type NotificationFailure struct {
	ID            string    `json:"id"`
	Kind          string    `json:"kind"`
	Attempts      int       `json:"attempts"`
	LastErrorCode *string   `json:"lastErrorCode"`
	CreatedAt     time.Time `json:"createdAt"`
}
type PaymentEvent struct {
	ID       string  `json:"id"`
	OrderID  *string `json:"orderId"`
	State    string  `json:"state"`
	Retries  int     `json:"retries"`
	Verified bool    `json:"verified"`
}
type Request struct {
	ID            string     `json:"id"`
	OrderID       string     `json:"orderId"`
	AttemptID     string     `json:"attemptId"`
	ActorMemberID string     `json:"actorMemberId"`
	Reason        string     `json:"reason"`
	Status        string     `json:"status"`
	JobID         *int64     `json:"jobId"`
	LastErrorCode *string    `json:"lastErrorCode"`
	RequestedAt   time.Time  `json:"requestedAt"`
	FinishedAt    *time.Time `json:"finishedAt"`
}
type Dashboard struct {
	Attempts      []Attempt             `json:"attempts"`
	Jobs          []Job                 `json:"jobs"`
	Notifications []NotificationFailure `json:"notifications"`
	PaymentEvents []PaymentEvent        `json:"paymentEvents"`
	Requests      []Request             `json:"requests"`
}

type Service struct {
	Pool   *pgxpool.Pool
	Client *river.Client[pgx.Tx]
}

func (s *Service) operatorTx(ctx context.Context, member string) (pgx.Tx, error) {
	if uuid.Validate(member) != nil {
		return nil, invalid
	}
	tx, err := s.Pool.Begin(ctx)
	if err != nil {
		return nil, unavailable
	}
	if _, err = tx.Exec(ctx, `SELECT set_config('summergear.member_id',$1,true)`, member); err != nil {
		tx.Rollback(context.Background())
		return nil, unavailable
	}
	var permitted bool
	if err = tx.QueryRow(ctx, `SELECT EXISTS(SELECT 1 FROM summergear_app.listing_reviewers WHERE member_id=$1)`, member).Scan(&permitted); err != nil {
		tx.Rollback(context.Background())
		return nil, unavailable
	}
	if !permitted {
		tx.Rollback(context.Background())
		return nil, forbidden
	}
	return tx, nil
}

const requestColumns = `id::text,order_id::text,payment_attempt_id::text,actor_member_id::text,reason,status,job_id,last_error_code,requested_at,finished_at`

func scanRequest(row interface{ Scan(...any) error }) (Request, error) {
	var v Request
	err := row.Scan(&v.ID, &v.OrderID, &v.AttemptID, &v.ActorMemberID, &v.Reason, &v.Status, &v.JobID, &v.LastErrorCode, &v.RequestedAt, &v.FinishedAt)
	return v, err
}

func (s *Service) Dashboard(ctx context.Context, member string) (Dashboard, error) {
	tx, err := s.operatorTx(ctx, member)
	if err != nil {
		return Dashboard{}, err
	}
	defer tx.Rollback(context.Background())
	result := Dashboard{Attempts: []Attempt{}, Jobs: []Job{}, Notifications: []NotificationFailure{}, PaymentEvents: []PaymentEvent{}, Requests: []Request{}}
	rows, err := tx.Query(ctx, `SELECT p.id::text,p.order_id::text,p.status::text,o.payment_status::text,p.updated_at,
 (o.payment_status IN ('pending_approval','pending_cancel','approved') AND p.status IN ('pending','unknown','approved'))
 FROM summergear_app.payment_attempts p JOIN summergear_app.orders o ON o.id=p.order_id
 WHERE o.payment_status IN ('pending_approval','pending_cancel') OR p.status IN ('unknown','failed')
 ORDER BY p.updated_at DESC LIMIT 100`)
	if err != nil {
		return Dashboard{}, unavailable
	}
	for rows.Next() {
		var a Attempt
		if rows.Scan(&a.ID, &a.OrderID, &a.Status, &a.PaymentStatus, &a.UpdatedAt, &a.Recheckable) != nil {
			rows.Close()
			return Dashboard{}, unavailable
		}
		result.Attempts = append(result.Attempts, a)
	}
	err = rows.Err()
	rows.Close()
	if err != nil {
		return Dashboard{}, unavailable
	}
	rows, err = tx.Query(ctx, `SELECT id,kind,state::text,attempt,created_at FROM summergear_river.river_job
 WHERE state IN ('retryable','discarded','cancelled') AND kind IN
 ('summergear_payment_reconcile_v1','summergear_payment_recheck_v1','summergear_reservation_expire_v1','summergear_push_dispatch_v1','summergear_push_reconcile_v1')
 ORDER BY created_at DESC LIMIT 50`)
	if err != nil {
		return Dashboard{}, unavailable
	}
	for rows.Next() {
		var j Job
		if rows.Scan(&j.ID, &j.Kind, &j.State, &j.Attempt, &j.CreatedAt) != nil {
			rows.Close()
			return Dashboard{}, unavailable
		}
		result.Jobs = append(result.Jobs, j)
	}
	err = rows.Err()
	rows.Close()
	if err != nil {
		return Dashboard{}, unavailable
	}
	rows, err = tx.Query(ctx, `SELECT id::text,kind,attempts,last_error_code,created_at
 FROM summergear_app.notification_events WHERE status='failed' ORDER BY created_at DESC LIMIT 50`)
	if err != nil {
		return Dashboard{}, unavailable
	}
	for rows.Next() {
		var v NotificationFailure
		if rows.Scan(&v.ID, &v.Kind, &v.Attempts, &v.LastErrorCode, &v.CreatedAt) != nil {
			rows.Close()
			return Dashboard{}, unavailable
		}
		result.Notifications = append(result.Notifications, v)
	}
	err = rows.Err()
	rows.Close()
	if err != nil {
		return Dashboard{}, unavailable
	}
	rows, err = tx.Query(ctx, `SELECT id::text,order_id::text,state::text,retries,verified_with_pg
 FROM summergear_app.payment_events WHERE state='retry_later' ORDER BY updated_at DESC LIMIT 50`)
	if err != nil {
		return Dashboard{}, unavailable
	}
	for rows.Next() {
		var v PaymentEvent
		if rows.Scan(&v.ID, &v.OrderID, &v.State, &v.Retries, &v.Verified) != nil {
			rows.Close()
			return Dashboard{}, unavailable
		}
		result.PaymentEvents = append(result.PaymentEvents, v)
	}
	err = rows.Err()
	rows.Close()
	if err != nil {
		return Dashboard{}, unavailable
	}
	rows, err = tx.Query(ctx, `SELECT `+requestColumns+` FROM summergear_app.payment_recovery_requests ORDER BY requested_at DESC LIMIT 50`)
	if err != nil {
		return Dashboard{}, unavailable
	}
	for rows.Next() {
		v, scanErr := scanRequest(rows)
		if scanErr != nil {
			rows.Close()
			return Dashboard{}, unavailable
		}
		result.Requests = append(result.Requests, v)
	}
	err = rows.Err()
	rows.Close()
	if err != nil {
		return Dashboard{}, unavailable
	}
	if tx.Commit(ctx) != nil {
		return Dashboard{}, unavailable
	}
	return result, nil
}

func (s *Service) Recheck(ctx context.Context, member, attemptID, reason string) (Request, error) {
	if uuid.Validate(attemptID) != nil {
		return Request{}, invalid
	}
	reason = strings.TrimSpace(reason)
	if utf8.RuneCountInString(reason) < 1 || utf8.RuneCountInString(reason) > 500 {
		return Request{}, invalid
	}
	tx, err := s.operatorTx(ctx, member)
	if err != nil {
		return Request{}, err
	}
	defer tx.Rollback(context.Background())
	var orderID, status, paymentStatus string
	err = tx.QueryRow(ctx, `SELECT p.order_id::text,p.status::text,o.payment_status::text
 FROM summergear_app.payment_attempts p JOIN summergear_app.orders o ON o.id=p.order_id WHERE p.id=$1`, attemptID).Scan(&orderID, &status, &paymentStatus)
	if errors.Is(err, pgx.ErrNoRows) {
		return Request{}, missing
	}
	if err != nil {
		return Request{}, unavailable
	}
	if (paymentStatus != "pending_approval" && paymentStatus != "pending_cancel" && paymentStatus != "approved") ||
		(status != "pending" && status != "unknown" && status != "approved") {
		return Request{}, conflict
	}
	var requestID string
	err = tx.QueryRow(ctx, `INSERT INTO summergear_app.payment_recovery_requests
 (payment_attempt_id,order_id,actor_member_id,reason) VALUES($1,$2,$3,$4)
 ON CONFLICT(payment_attempt_id) WHERE status='queued' DO NOTHING RETURNING id::text`, attemptID, orderID, member, reason).Scan(&requestID)
	if errors.Is(err, pgx.ErrNoRows) {
		v, loadErr := scanRequest(tx.QueryRow(ctx, `SELECT `+requestColumns+` FROM summergear_app.payment_recovery_requests
 WHERE payment_attempt_id=$1 AND status='queued'`, attemptID))
		if loadErr != nil {
			return Request{}, unavailable
		}
		if tx.Commit(ctx) != nil {
			return Request{}, unavailable
		}
		return v, nil
	}
	if err != nil {
		return Request{}, unavailable
	}
	if s.Client == nil {
		return Request{}, unavailable
	}
	job, err := s.Client.InsertTx(ctx, tx, jobs.PaymentRecheckArgs{Version: 1, RequestID: requestID}, &river.InsertOpts{Queue: jobs.OrdersQueue, MaxAttempts: 5})
	if err != nil {
		return Request{}, unavailable
	}
	v, err := scanRequest(tx.QueryRow(ctx, `UPDATE summergear_app.payment_recovery_requests SET job_id=$2 WHERE id=$1 RETURNING `+requestColumns, requestID, job.Job.ID))
	if err != nil {
		return Request{}, unavailable
	}
	if tx.Commit(ctx) != nil {
		return Request{}, unavailable
	}
	return v, nil
}
