package orders

import (
	"context"
)

// Full cancellation only, requested by the buyer. The durable intent survives
// process loss; a periodic worker repeats the same provider idempotency key.
func (s *Store) Refund(ctx context.Context, pg PGAdapter, id, member string) (*Order, error) {
	if !validID(id) {
		return nil, ErrInvalid
	}
	tx, err := beginMember(ctx, s.Pool, member)
	if err != nil {
		return nil, err
	}
	defer tx.Rollback(context.Background())
	o, err := scanOrder(tx.QueryRow(ctx, `SELECT `+orderColumns+` FROM summergear_app.orders WHERE id=$1 FOR UPDATE`, id))
	if err != nil {
		return nil, err
	}
	if o.BuyerID != member {
		return nil, ErrForbidden
	}
	if o.PaymentStatus == "cancelled" || o.PaymentStatus == "pending_cancel" {
		return o, nil
	}
	if o.Status != "confirmed" || o.PaymentStatus != "approved" ||
		(o.FulfillmentStatus != "awaiting_acceptance" && o.FulfillmentStatus != "accepted") {
		return nil, ErrConflict
	}
	var key, attempt, provider string
	err = tx.QueryRow(ctx, `SELECT id::text,pg_payment_key,pg_provider FROM summergear_app.payment_attempts WHERE order_id=$1 AND status='approved'`, id).Scan(&attempt, &key, &provider)
	if err != nil {
		return nil, ErrDatabase
	}
	if provider != gatewayProvider(pg) {
		return nil, ErrConflict
	}
	_, err = tx.Exec(ctx, `INSERT INTO summergear_app.refunds(order_id,payment_attempt_id,refund_amount,remaining_cancellable,reason,status) VALUES($1,$2,$3,$3,'Buyer requested full test cancellation','refunding')`, id, attempt, o.TotalAmountKRW)
	if err != nil {
		return nil, ErrDatabase
	}
	if _, err = tx.Exec(ctx, `UPDATE summergear_app.orders SET payment_status='pending_cancel',updated_at=clock_timestamp() WHERE id=$1`, id); err != nil {
		return nil, ErrDatabase
	}
	if err = tx.Commit(ctx); err != nil {
		return nil, ErrDatabase
	}
	state, err := pg.Cancel(ctx, member, key)
	if err == nil {
		if err = s.ApplyPayment(ctx, member, id, state); err != nil {
			return nil, err
		}
	}
	return s.GetOrder(ctx, id, member)
}
