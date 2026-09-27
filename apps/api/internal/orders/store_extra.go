package orders

import (
	"context"
	"errors"
	"github.com/jackc/pgx/v5"
)

type ConfirmPaymentRequest struct {
	PaymentKey string `json:"paymentKey"`
	Amount     int64  `json:"amount"`
}

func (s *Store) ConfirmPayment(ctx context.Context, pg PGAdapter, orderID, member string, input ConfirmPaymentRequest) (*Order, error) {
	if !validID(orderID) || input.Amount <= 0 || !validPaymentKey(pg, orderID, input.PaymentKey) {
		return nil, ErrInvalid
	}
	if _, off := pg.(unavailablePG); off {
		return nil, ErrPGUnavailable
	}
	tx, err := beginMember(ctx, s.Pool, member)
	if err != nil {
		return nil, err
	}
	defer tx.Rollback(context.Background())
	o, err := scanOrder(tx.QueryRow(ctx, `SELECT `+orderColumns+` FROM summergear_app.orders WHERE id=$1 FOR UPDATE`, orderID))
	if err != nil {
		return nil, err
	}
	if o.BuyerID != member {
		return nil, ErrForbidden
	}
	if o.TotalAmountKRW != input.Amount {
		return nil, ErrInvalid
	}
	var oldKey, oldProvider string
	err = tx.QueryRow(ctx, `SELECT pg_payment_key,pg_provider FROM summergear_app.payment_attempts WHERE order_id=$1`, orderID).Scan(&oldKey, &oldProvider)
	if err == nil {
		if oldKey != input.PaymentKey || oldProvider != gatewayProvider(pg) {
			return nil, ErrConflict
		}
		// Do not repeat an external effect, including after a lost response.
		if err = tx.Commit(ctx); err != nil {
			return nil, ErrDatabase
		}
		return o, nil
	}
	if !errors.Is(err, pgx.ErrNoRows) {
		return nil, ErrDatabase
	}
	if o.Status != "pending" || o.PaymentStatus != "unpaid" {
		return nil, ErrConflict
	}
	var active bool
	err = tx.QueryRow(ctx, `SELECT EXISTS(SELECT 1 FROM summergear_app.inventory_reservations WHERE order_id=$1 AND state='active' AND expires_at>clock_timestamp())`, orderID).Scan(&active)
	if err != nil {
		return nil, ErrDatabase
	}
	if !active {
		return nil, ErrConflict
	}
	_, err = tx.Exec(ctx, `INSERT INTO summergear_app.payment_attempts(order_id,pg_payment_key,requested_amount,idempotency_key,pg_provider) VALUES($1,$2,$3,$4,$5)`, orderID, input.PaymentKey, input.Amount, orderID, gatewayProvider(pg))
	if err != nil {
		return nil, ErrDatabase
	}
	_, err = tx.Exec(ctx, `UPDATE summergear_app.orders SET payment_status='pending_approval',updated_at=clock_timestamp() WHERE id=$1`, orderID)
	if err != nil {
		return nil, ErrDatabase
	}
	if err = tx.Commit(ctx); err != nil {
		return nil, ErrDatabase
	}
	state, pgErr := pg.Approve(ctx, member, orderID, input.Amount, input.PaymentKey)
	if pgErr != nil {
		// The durable pending attempt is recoverable even if this update fails.
		_ = s.markUnknown(ctx, orderID, member)
		return s.GetOrder(ctx, orderID, member)
	}
	if err = s.ApplyPayment(ctx, member, orderID, state); err != nil {
		return nil, err
	}
	return s.GetOrder(ctx, orderID, member)
}
func (s *Store) markUnknown(ctx context.Context, id, member string) error {
	tx, err := beginMember(ctx, s.Pool, member)
	if err != nil {
		return err
	}
	defer tx.Rollback(context.Background())
	_, err = tx.Exec(ctx, `UPDATE summergear_app.payment_attempts SET status='unknown',updated_at=clock_timestamp() WHERE order_id=$1 AND status='pending'`, id)
	if err != nil {
		return ErrDatabase
	}
	return tx.Commit(ctx)
}
func (s *Store) ApplyPayment(ctx context.Context, member, orderID string, state *PaymentState) error {
	if state == nil || state.OrderID != orderID {
		return ErrInvalid
	}
	var tx pgx.Tx
	var err error
	if member == "" {
		tx, err = s.Pool.Begin(ctx)
	} else {
		tx, err = beginMember(ctx, s.Pool, member)
	}
	if err != nil {
		return ErrDatabase
	}
	defer tx.Rollback(context.Background())
	o, err := scanOrder(tx.QueryRow(ctx, `SELECT `+orderColumns+` FROM summergear_app.orders WHERE id=$1 FOR UPDATE`, orderID))
	if err != nil {
		return err
	}
	var attemptID, key, status, provider string
	var amount int64
	err = tx.QueryRow(ctx, `SELECT id::text,pg_payment_key,requested_amount,status,pg_provider FROM summergear_app.payment_attempts WHERE order_id=$1 FOR UPDATE`, orderID).Scan(&attemptID, &key, &amount, &status, &provider)
	if err != nil {
		return ErrDatabase
	}
	if key != state.PaymentKey || amount != state.Amount || amount != o.TotalAmountKRW {
		return ErrInvalid
	}
	stateProvider := state.Provider
	if stateProvider == "" {
		stateProvider = "fake_toss"
	}
	if provider != stateProvider {
		return ErrInvalid
	}
	if state.Status == "cancelled" && status == "approved" {
		if o.PaymentStatus == "cancelled" {
			return nil
		}
		if o.PaymentStatus != "approved" && o.PaymentStatus != "pending_cancel" {
			return ErrConflict
		}
		// A provider-side cancellation after handover is a dispute requiring
		// operator intervention; never resell property already delivered.
		if o.FulfillmentStatus == "handed_over" || o.FulfillmentStatus == "completed" {
			return ErrConflict
		}
		var listing string
		var qty int
		err = tx.QueryRow(ctx, `UPDATE summergear_app.inventory_reservations SET state='released',released_at=clock_timestamp() WHERE order_id=$1 AND state='consumed' RETURNING listing_id::text,quantity`, orderID).Scan(&listing, &qty)
		if err != nil {
			return ErrConflict
		}
		if _, err = tx.Exec(ctx, `UPDATE summergear_app.inventory_items SET available_quantity=available_quantity+$2,updated_at=clock_timestamp() WHERE listing_id=$1`, listing, qty); err != nil {
			return ErrDatabase
		}
		// A cancellation can be initiated outside this service (for example from
		// the Toss test console). Keep the local refund ledger complete after the
		// authoritative provider lookup instead of only changing order/inventory.
		if _, err = tx.Exec(ctx, `INSERT INTO summergear_app.refunds(order_id,payment_attempt_id,refund_amount,remaining_cancellable,reason,status,completed_at)
 VALUES($1,$2,$3,0,'Provider-confirmed full cancellation','completed',clock_timestamp())
 ON CONFLICT(order_id) DO NOTHING`, orderID, attemptID, amount); err != nil {
			return ErrDatabase
		}
		if _, err = tx.Exec(ctx, `UPDATE summergear_app.refunds SET status='completed',remaining_cancellable=0,completed_at=clock_timestamp(),updated_at=clock_timestamp() WHERE order_id=$1`, orderID); err != nil {
			return ErrDatabase
		}
		if _, err = tx.Exec(ctx, `UPDATE summergear_app.orders SET status='cancelled',payment_status='cancelled',updated_at=clock_timestamp() WHERE id=$1`, orderID); err != nil {
			return ErrDatabase
		}
		return tx.Commit(ctx)
	}
	if status == "approved" || status == "failed" {
		return nil
	}
	if o.Status != "pending" || o.PaymentStatus != "pending_approval" {
		return ErrConflict
	}
	switch state.Status {
	case "approved":
		var listing string
		var qty int
		err = tx.QueryRow(ctx, `UPDATE summergear_app.inventory_reservations SET state='consumed',consumed_at=clock_timestamp() WHERE order_id=$1 AND state='active' RETURNING listing_id::text,quantity`, orderID).Scan(&listing, &qty)
		if err != nil {
			return ErrConflict
		}
		tag, e := tx.Exec(ctx, `UPDATE summergear_app.inventory_items SET reserved_quantity=reserved_quantity-$2,updated_at=clock_timestamp() WHERE listing_id=$1 AND reserved_quantity>=$2`, listing, qty)
		if e != nil || tag.RowsAffected() != 1 {
			return ErrDatabase
		}
		_, err = tx.Exec(ctx, `UPDATE summergear_app.payment_attempts SET status='approved',approved_amount=$2,updated_at=clock_timestamp() WHERE order_id=$1`, orderID, amount)
		if err != nil {
			return ErrDatabase
		}
		_, err = tx.Exec(ctx, `UPDATE summergear_app.orders SET status='confirmed',payment_status='approved',updated_at=clock_timestamp() WHERE id=$1`, orderID)
	case "failed", "cancelled":
		if err = releaseReservation(ctx, tx, orderID, "released"); err != nil {
			return err
		}
		_, err = tx.Exec(ctx, `UPDATE summergear_app.payment_attempts SET status='failed',updated_at=clock_timestamp() WHERE order_id=$1`, orderID)
		if err != nil {
			return ErrDatabase
		}
		_, err = tx.Exec(ctx, `UPDATE summergear_app.orders SET status='cancelled',payment_status='failed',updated_at=clock_timestamp() WHERE id=$1`, orderID)
	default:
		return ErrPGUnknown
	}
	if err != nil {
		return ErrDatabase
	}
	return tx.Commit(ctx)
}
func (s *Store) ReconcilePayments(ctx context.Context, pg PGAdapter) error {
	rows, err := s.Pool.Query(ctx, `SELECT p.order_id::text,p.pg_payment_key,o.payment_status FROM summergear_app.payment_attempts p JOIN summergear_app.orders o ON o.id=p.order_id WHERE p.pg_provider=$1 AND o.payment_status IN ('pending_approval','pending_cancel','approved') ORDER BY p.updated_at LIMIT 50`, gatewayProvider(pg))
	if err != nil {
		return ErrDatabase
	}
	type pending struct{ id, key, status string }
	var entries []pending
	for rows.Next() {
		var p pending
		if err = rows.Scan(&p.id, &p.key, &p.status); err != nil {
			rows.Close()
			return ErrDatabase
		}
		entries = append(entries, p)
	}
	rows.Close()
	if rows.Err() != nil {
		return ErrDatabase
	}
	var result error
	for _, p := range entries {
		state, e := pg.Lookup(ctx, "", p.key)
		if e == nil && state.Status == "approved" && p.status == "pending_cancel" {
			state, e = pg.Cancel(ctx, "", p.key)
		}
		if e == nil {
			e = s.ApplyPayment(ctx, "", p.id, state)
		}
		// Rotate unresolved attempts so one batch cannot starve later orders.
		if _, touchErr := s.Pool.Exec(ctx, `UPDATE summergear_app.payment_attempts SET updated_at=clock_timestamp() WHERE order_id=$1`, p.id); touchErr != nil {
			return ErrDatabase
		}
		if e != nil {
			result = e
		}
	}
	return result
}

// ReconcileEvents only marks a hint verified after looking up the known payment
// attempt. A forged or stale payload never supplies the authoritative status.
func (s *Store) ReconcileEvents(ctx context.Context, pg PGAdapter) error {
	rows, err := s.Pool.Query(ctx, `SELECT e.id::text,e.order_id::text,COALESCE(p.pg_payment_key,'')
 FROM summergear_app.payment_events e LEFT JOIN summergear_app.payment_attempts p ON p.order_id=e.order_id
 WHERE e.state IN ('received','retry_later') AND e.retries<10 AND e.pg_provider=$1 AND (p.pg_provider=$1 OR p.pg_provider IS NULL) ORDER BY e.updated_at LIMIT 50`, gatewayProvider(pg))
	if err != nil {
		return ErrDatabase
	}
	type event struct{ id, order, key string }
	var entries []event
	for rows.Next() {
		var e event
		if err = rows.Scan(&e.id, &e.order, &e.key); err != nil {
			rows.Close()
			return ErrDatabase
		}
		entries = append(entries, e)
	}
	rows.Close()
	if rows.Err() != nil {
		return ErrDatabase
	}
	for _, e := range entries {
		state, lookupErr := pg.Lookup(ctx, "", e.key)
		if lookupErr == nil {
			lookupErr = s.ApplyPayment(ctx, "", e.order, state)
		}
		if lookupErr != nil {
			_, err = s.Pool.Exec(ctx, `UPDATE summergear_app.payment_events SET state='retry_later',retries=retries+1,last_error='GATEWAY_VERIFICATION_PENDING',updated_at=clock_timestamp() WHERE id=$1 AND state<>'processed'`, e.id)
		} else {
			_, err = s.Pool.Exec(ctx, `UPDATE summergear_app.payment_events SET state='processed',verified_with_pg=true,processed_at=clock_timestamp(),updated_at=clock_timestamp() WHERE id=$1`, e.id)
		}
		if err != nil {
			return ErrDatabase
		}
	}
	return nil
}
