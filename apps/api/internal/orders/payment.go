package orders

import (
	"context"
	"errors"
	"strings"
	"sync"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

// Every gateway result is bound to the order, amount and supplied payment key.
// A timeout must be reconciled using Lookup; callers never infer approval.
type PGAdapter interface {
	Approve(context.Context, string, string, int64, string) (*PaymentState, error)
	Lookup(context.Context, string, string) (*PaymentState, error)
	Cancel(context.Context, string, string) (*PaymentState, error)
}

var ErrPGUnavailable = &Failure{503, "PAYMENT_UNAVAILABLE", "Test payment gateway is not configured"}
var ErrPGUnknown = errors.New("payment result unknown")

type FakePG struct {
	Pool   *pgxpool.Pool
	mu     sync.Mutex
	states map[string]PaymentState
}

func NewFakePG() *FakePG { return &FakePG{states: map[string]PaymentState{}} }
func NewGateway(pool *pgxpool.Pool, fixture bool) PGAdapter {
	if !fixture {
		return unavailablePG{}
	}
	return &FakePG{Pool: pool}
}
func (f *FakePG) Approve(ctx context.Context, member, order string, amount int64, key string) (*PaymentState, error) {
	if !validID(order) || amount <= 0 || key != "fake-pay-"+order {
		return nil, ErrInvalid
	}
	state := PaymentState{PaymentKey: key, OrderID: order, Amount: amount, Status: "approved"}
	if f.Pool == nil {
		f.mu.Lock()
		defer f.mu.Unlock()
		if f.states == nil {
			f.states = map[string]PaymentState{}
		}
		if old, ok := f.states[key]; ok {
			if old.OrderID != order || old.Amount != amount {
				return nil, ErrConflict
			}
			return &old, nil
		}
		f.states[key] = state
		return &state, nil
	}
	tx, err := beginMember(ctx, f.Pool, member)
	if err != nil {
		return nil, err
	}
	defer tx.Rollback(context.Background())
	_, err = tx.Exec(ctx, `INSERT INTO summergear_app.fixture_payments(payment_key,order_id,amount,status) VALUES($1,$2,$3,'approved') ON CONFLICT DO NOTHING`, key, order, amount)
	if err != nil {
		return nil, ErrPGUnknown
	}
	err = tx.QueryRow(ctx, `SELECT order_id::text,amount,status FROM summergear_app.fixture_payments WHERE payment_key=$1`, key).Scan(&state.OrderID, &state.Amount, &state.Status)
	if err != nil {
		return nil, ErrPGUnknown
	}
	if state.OrderID != order || state.Amount != amount {
		return nil, ErrConflict
	}
	if err = tx.Commit(ctx); err != nil {
		return nil, ErrPGUnknown
	}
	return &state, nil
}
func (f *FakePG) Lookup(ctx context.Context, member, key string) (*PaymentState, error) {
	if !strings.HasPrefix(key, "fake-pay-") {
		return nil, ErrInvalid
	}
	if f.Pool == nil {
		f.mu.Lock()
		defer f.mu.Unlock()
		state, ok := f.states[key]
		if !ok {
			return nil, ErrPGUnknown
		}
		return &state, nil
	}
	tx, err := f.Pool.Begin(ctx)
	if err != nil {
		return nil, ErrPGUnknown
	}
	defer tx.Rollback(context.Background())
	if member != "" {
		if _, err = tx.Exec(ctx, "SELECT set_config('summergear.member_id',$1,true)", member); err != nil {
			return nil, ErrPGUnknown
		}
	}
	state := &PaymentState{PaymentKey: key}
	err = tx.QueryRow(ctx, `SELECT order_id::text,amount,status FROM summergear_app.fixture_payments WHERE payment_key=$1`, key).Scan(&state.OrderID, &state.Amount, &state.Status)
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, ErrPGUnknown
	}
	if err != nil {
		return nil, ErrPGUnknown
	}
	return state, nil
}
func (f *FakePG) Cancel(ctx context.Context, member, key string) (*PaymentState, error) {
	state, err := f.Lookup(ctx, member, key)
	if err != nil {
		return nil, err
	}
	if f.Pool == nil {
		f.mu.Lock()
		defer f.mu.Unlock()
		state.Status = "cancelled"
		f.states[key] = *state
		return state, nil
	}
	tx, err := beginMember(ctx, f.Pool, member)
	if err != nil {
		return nil, err
	}
	defer tx.Rollback(context.Background())
	tag, err := tx.Exec(ctx, `UPDATE summergear_app.fixture_payments SET status='cancelled' WHERE payment_key=$1`, key)
	if err != nil || tag.RowsAffected() != 1 {
		return nil, ErrPGUnknown
	}
	if err = tx.Commit(ctx); err != nil {
		return nil, ErrPGUnknown
	}
	state.Status = "cancelled"
	return state, nil
}

type unavailablePG struct{}

func (unavailablePG) Approve(context.Context, string, string, int64, string) (*PaymentState, error) {
	return nil, ErrPGUnavailable
}
func (unavailablePG) Lookup(context.Context, string, string) (*PaymentState, error) {
	return nil, ErrPGUnavailable
}
func (unavailablePG) Cancel(context.Context, string, string) (*PaymentState, error) {
	return nil, ErrPGUnavailable
}
