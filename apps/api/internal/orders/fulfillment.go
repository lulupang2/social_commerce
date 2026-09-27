package orders

import "context"

// ListSellerOrders returns only orders for active memberships. Membership and
// order RLS are evaluated under the same transaction-scoped member context.
func (s *Store) ListSellerOrders(ctx context.Context, member string) ([]*Order, error) {
	tx, err := beginMember(ctx, s.Pool, member)
	if err != nil {
		return nil, err
	}
	defer tx.Rollback(context.Background())
	rows, err := tx.Query(ctx, `SELECT `+orderColumns+` FROM summergear_app.orders o
 WHERE EXISTS (SELECT 1 FROM summergear_app.seller_memberships sm
   WHERE sm.seller_id=o.seller_id AND sm.member_id=$1 AND sm.active)
 ORDER BY o.created_at DESC,o.id DESC LIMIT 50`, member)
	if err != nil {
		return nil, ErrDatabase
	}
	orders := make([]*Order, 0)
	for rows.Next() {
		order, scanErr := scanOrder(rows)
		if scanErr != nil {
			rows.Close()
			return nil, scanErr
		}
		orders = append(orders, order)
	}
	err = rows.Err()
	rows.Close()
	if err != nil {
		return nil, ErrDatabase
	}
	if err = tx.Commit(ctx); err != nil {
		return nil, ErrDatabase
	}
	return orders, nil
}

// AdvanceFulfillment serializes buyer cancellation/refund and seller handling
// on the order row. Payment approval never implies handover or receipt.
func (s *Store) AdvanceFulfillment(ctx context.Context, id, member, action string) (*Order, error) {
	if !validID(id) {
		return nil, ErrInvalid
	}
	var from, to string
	switch action {
	case "accept":
		from, to = "awaiting_acceptance", "accepted"
	case "hand-over":
		from, to = "accepted", "handed_over"
	case "receive":
		from, to = "handed_over", "completed"
	default:
		return nil, ErrInvalid
	}
	tx, err := beginMember(ctx, s.Pool, member)
	if err != nil {
		return nil, err
	}
	defer tx.Rollback(context.Background())
	order, err := scanOrder(tx.QueryRow(ctx, `SELECT `+orderColumns+` FROM summergear_app.orders WHERE id=$1 FOR UPDATE`, id))
	if err != nil {
		return nil, err
	}
	if action == "receive" {
		if order.BuyerID != member {
			return nil, ErrNotFound
		}
	} else {
		var permitted bool
		err = tx.QueryRow(ctx, `SELECT EXISTS (SELECT 1 FROM summergear_app.seller_memberships
 WHERE seller_id=$1 AND member_id=$2 AND active)`, order.SellerID, member).Scan(&permitted)
		if err != nil {
			return nil, ErrDatabase
		}
		if !permitted {
			return nil, ErrNotFound
		}
	}
	if order.Status != "confirmed" || order.PaymentStatus != "approved" {
		return nil, ErrConflict
	}
	if order.FulfillmentStatus == to {
		if err = tx.Commit(ctx); err != nil {
			return nil, ErrDatabase
		}
		return s.GetOrder(ctx, id, member)
	}
	if order.FulfillmentStatus != from {
		return nil, ErrConflict
	}
	_, err = tx.Exec(ctx, `UPDATE summergear_app.orders SET fulfillment_status=$2,
 accepted_at=CASE WHEN $2='accepted' THEN clock_timestamp() ELSE accepted_at END,
 handed_over_at=CASE WHEN $2='handed_over' THEN clock_timestamp() ELSE handed_over_at END,
 received_at=CASE WHEN $2='completed' THEN clock_timestamp() ELSE received_at END,
 updated_at=clock_timestamp() WHERE id=$1`, id, to)
	if err != nil {
		return nil, ErrDatabase
	}
	_, err = tx.Exec(ctx, `INSERT INTO summergear_app.order_fulfillment_events
 (order_id,actor_member_id,from_status,to_status) VALUES($1,$2,$3,$4)`, id, member, from, to)
	if err != nil {
		return nil, ErrDatabase
	}
	if err = tx.Commit(ctx); err != nil {
		return nil, ErrDatabase
	}
	return s.GetOrder(ctx, id, member)
}

func (s *Store) FulfillmentHistory(ctx context.Context, id, member string) ([]FulfillmentEvent, error) {
	if !validID(id) {
		return nil, ErrInvalid
	}
	tx, err := beginMember(ctx, s.Pool, member)
	if err != nil {
		return nil, err
	}
	defer tx.Rollback(context.Background())
	var exists bool
	if err = tx.QueryRow(ctx, `SELECT EXISTS(SELECT 1 FROM summergear_app.orders WHERE id=$1)`, id).Scan(&exists); err != nil {
		return nil, ErrDatabase
	}
	if !exists {
		return nil, ErrNotFound
	}
	rows, err := tx.Query(ctx, `SELECT id,actor_member_id::text,from_status,to_status,created_at
 FROM summergear_app.order_fulfillment_events WHERE order_id=$1 ORDER BY id`, id)
	if err != nil {
		return nil, ErrDatabase
	}
	result := make([]FulfillmentEvent, 0)
	for rows.Next() {
		var event FulfillmentEvent
		if err = rows.Scan(&event.ID, &event.ActorMemberID, &event.FromStatus, &event.ToStatus, &event.CreatedAt); err != nil {
			rows.Close()
			return nil, ErrDatabase
		}
		result = append(result, event)
	}
	err = rows.Err()
	rows.Close()
	if err != nil {
		return nil, ErrDatabase
	}
	if err = tx.Commit(ctx); err != nil {
		return nil, ErrDatabase
	}
	return result, nil
}
