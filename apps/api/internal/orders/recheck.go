package orders

import (
	"context"
	"errors"

	"github.com/jackc/pgx/v5"
)

// ReconcileOrder checks one durable attempt against its authoritative provider.
// It never turns a local failed/cancelled order into an approved one by fiat.
func (s *Store) ReconcileOrder(ctx context.Context, pg PGAdapter, orderID string) error {
	if !validID(orderID) {
		return ErrInvalid
	}
	var key, provider, paymentStatus string
	var amount int64
	err := s.Pool.QueryRow(ctx, `SELECT p.pg_payment_key,p.pg_provider,p.requested_amount,o.payment_status
 FROM summergear_app.payment_attempts p JOIN summergear_app.orders o ON o.id=p.order_id
 WHERE p.order_id=$1`, orderID).Scan(&key, &provider, &amount, &paymentStatus)
	if errors.Is(err, pgx.ErrNoRows) {
		return ErrNotFound
	}
	if err != nil {
		return ErrDatabase
	}
	if key == "" || provider != gatewayProvider(pg) {
		return ErrConflict
	}
	if paymentStatus != "pending_approval" && paymentStatus != "pending_cancel" && paymentStatus != "approved" {
		return ErrConflict
	}
	state, err := pg.Lookup(ctx, "", key)
	if err != nil {
		return err
	}
	if state == nil || state.OrderID != orderID || state.PaymentKey != key || state.Amount != amount || (state.Provider != "" && state.Provider != provider) {
		return ErrConflict
	}
	state.Provider = provider
	if state.Status == "approved" && paymentStatus == "pending_cancel" {
		state, err = pg.Cancel(ctx, "", key)
		if err != nil {
			return err
		}
		if state == nil || state.OrderID != orderID || state.PaymentKey != key || state.Amount != amount || (state.Provider != "" && state.Provider != provider) {
			return ErrConflict
		}
	}
	state.Provider = provider
	if paymentStatus == "approved" && state.Status == "approved" {
		return nil
	}
	if (paymentStatus == "approved" && state.Status == "failed") || (paymentStatus == "pending_cancel" && state.Status == "failed") {
		return ErrConflict
	}
	if state.Status != "approved" && state.Status != "failed" && state.Status != "cancelled" {
		return ErrPGUnknown
	}
	return s.ApplyPayment(ctx, "", orderID, state)
}
