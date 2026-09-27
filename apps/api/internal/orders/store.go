package orders

import (
	"context"
	"errors"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

type Store struct{ Pool *pgxpool.Pool }

func validID(id string) bool { _, err := uuid.Parse(id); return err == nil }
func (s *Store) Ready(ctx context.Context) error {
	_, err := s.Pool.Exec(ctx, "SELECT seller_id FROM summergear_app.inventory_items LIMIT 0")
	if err != nil {
		return ErrDatabase
	}
	return nil
}
func beginMember(ctx context.Context, pool *pgxpool.Pool, member string) (pgx.Tx, error) {
	if !validID(member) {
		return nil, ErrInvalid
	}
	tx, err := pool.Begin(ctx)
	if err != nil {
		return nil, ErrDatabase
	}
	if _, err = tx.Exec(ctx, "SELECT set_config('summergear.member_id',$1,true)", member); err != nil {
		tx.Rollback(context.Background())
		return nil, ErrDatabase
	}
	return tx, nil
}

const orderColumns = `id::text,buyer_id::text,seller_id::text,listing_id::text,item_name,unit_price_krw,
 quantity,shipping_fee_krw,service_fee_krw,total_amount_krw,currency,status,payment_status,created_at,updated_at,
 fulfillment_status,accepted_at,handed_over_at,received_at`

type scanner interface{ Scan(...any) error }

func scanOrder(row scanner) (*Order, error) {
	o := &Order{}
	err := row.Scan(&o.ID, &o.BuyerID, &o.SellerID, &o.ListingID, &o.ItemName, &o.UnitPriceKRW, &o.Quantity,
		&o.ShippingFeeKRW, &o.ServiceFeeKRW, &o.TotalAmountKRW, &o.Currency, &o.Status, &o.PaymentStatus, &o.CreatedAt, &o.UpdatedAt,
		&o.FulfillmentStatus, &o.AcceptedAt, &o.HandedOverAt, &o.ReceivedAt)
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, ErrNotFound
	}
	if err != nil {
		return nil, ErrDatabase
	}
	return o, nil
}
func (s *Store) CreateOrder(ctx context.Context, buyerID, listingID string, quantity int) (*Order, error) {
	if !validID(listingID) || quantity != 1 {
		return nil, ErrInvalid
	}
	tx, err := beginMember(ctx, s.Pool, buyerID)
	if err != nil {
		return nil, err
	}
	defer tx.Rollback(context.Background())
	// Provisioned stock binds a listing to exactly one approved seller. Lock the
	// stock row before testing availability so concurrent buyers cannot oversell.
	var sellerID, ownerID, title string
	var price int64
	var available int
	err = tx.QueryRow(ctx, `SELECT i.seller_id::text,l.member_id::text,l.title,l.price_krw,i.available_quantity
 FROM summergear_app.inventory_items i
 JOIN summergear_app.listings l ON l.id=i.listing_id
 JOIN summergear_app.sellers s ON s.id=i.seller_id AND s.status='approved'
 WHERE l.id=$1 AND l.status='active' AND summergear_app.listing_seller_valid(l.id,s.id)
 FOR UPDATE OF i`, listingID).Scan(&sellerID, &ownerID, &title, &price, &available)
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, ErrNotFound
	}
	if err != nil {
		return nil, ErrDatabase
	}
	var self bool
	err = tx.QueryRow(ctx, `SELECT EXISTS(SELECT 1 FROM summergear_app.seller_memberships WHERE seller_id=$1 AND member_id=$2 AND active)`, sellerID, buyerID).Scan(&self)
	if err != nil {
		return nil, ErrDatabase
	}
	if self || buyerID == ownerID {
		return nil, ErrSelfPurchase
	}
	// A retried create for the same single-item pending purchase returns the same
	// order, including when the initial response was lost.
	existing, err := scanOrder(tx.QueryRow(ctx, `SELECT `+orderColumns+` FROM summergear_app.orders WHERE listing_id=$1 AND buyer_id=$2 AND status='pending'`, listingID, buyerID))
	if err == nil {
		if err = tx.Commit(ctx); err != nil {
			return nil, ErrDatabase
		}
		return existing, nil
	}
	if !errors.Is(err, ErrNotFound) {
		return nil, err
	}
	if available < 1 {
		return nil, ErrInsufficientStock
	}
	if price <= 0 || price > 999999999999 {
		return nil, ErrInvalid
	}
	order, err := scanOrder(tx.QueryRow(ctx, `INSERT INTO summergear_app.orders(buyer_id,seller_id,listing_id,item_name,unit_price_krw,quantity,total_amount_krw)
 VALUES($1,$2,$3,$4,$5,1,$5) RETURNING `+orderColumns, buyerID, sellerID, listingID, title, price))
	if err != nil {
		return nil, err
	}
	_, err = tx.Exec(ctx, `INSERT INTO summergear_app.order_items(order_id,listing_id,item_name,unit_price_krw,quantity,line_total_krw) VALUES($1,$2,$3,$4,1,$4)`, order.ID, listingID, title, price)
	if err != nil {
		return nil, ErrDatabase
	}
	_, err = tx.Exec(ctx, `INSERT INTO summergear_app.inventory_reservations(listing_id,order_id,buyer_id,quantity,expires_at) VALUES($1,$2,$3,1,clock_timestamp()+interval '15 minutes')`, listingID, order.ID, buyerID)
	if err != nil {
		return nil, ErrDatabase
	}
	_, err = tx.Exec(ctx, `UPDATE summergear_app.inventory_items SET available_quantity=available_quantity-1,reserved_quantity=reserved_quantity+1,updated_at=clock_timestamp() WHERE listing_id=$1`, listingID)
	if err != nil {
		return nil, ErrDatabase
	}
	if err = tx.Commit(ctx); err != nil {
		return nil, ErrDatabase
	}
	return order, nil
}
func (s *Store) GetOrder(ctx context.Context, orderID, memberID string) (*Order, error) {
	if !validID(orderID) {
		return nil, ErrInvalid
	}
	tx, err := beginMember(ctx, s.Pool, memberID)
	if err != nil {
		return nil, err
	}
	defer tx.Rollback(context.Background())
	o, err := scanOrder(tx.QueryRow(ctx, `SELECT `+orderColumns+` FROM summergear_app.orders WHERE id=$1`, orderID))
	if err != nil {
		return nil, err
	}
	rows, err := tx.Query(ctx, `SELECT id::text,listing_id::text,item_name,unit_price_krw,quantity,line_total_krw,created_at FROM summergear_app.order_items WHERE order_id=$1 ORDER BY created_at`, orderID)
	if err != nil {
		return nil, ErrDatabase
	}
	for rows.Next() {
		i := &OrderItem{}
		if err = rows.Scan(&i.ID, &i.ListingID, &i.ItemName, &i.UnitPriceKRW, &i.Quantity, &i.LineTotalKRW, &i.CreatedAt); err != nil {
			rows.Close()
			return nil, ErrDatabase
		}
		o.Items = append(o.Items, i)
	}
	rows.Close()
	if rows.Err() != nil {
		return nil, ErrDatabase
	}
	r := &Reservation{}
	err = tx.QueryRow(ctx, `SELECT id::text,listing_id::text,order_id::text,quantity,expires_at,state FROM summergear_app.inventory_reservations WHERE order_id=$1 ORDER BY created_at DESC LIMIT 1`, orderID).Scan(&r.ID, &r.ListingID, &r.OrderID, &r.Quantity, &r.ExpiresAt, &r.State)
	if err == nil {
		o.Reservation = r
	} else if !errors.Is(err, pgx.ErrNoRows) {
		return nil, ErrDatabase
	}
	if err = tx.Commit(ctx); err != nil {
		return nil, ErrDatabase
	}
	return o, nil
}
func (s *Store) ListBuyerOrders(ctx context.Context, buyerID string) ([]*Order, error) {
	tx, err := beginMember(ctx, s.Pool, buyerID)
	if err != nil {
		return nil, err
	}
	defer tx.Rollback(context.Background())
	rows, err := tx.Query(ctx, `SELECT `+orderColumns+` FROM summergear_app.orders WHERE buyer_id=$1 ORDER BY created_at DESC LIMIT 50`, buyerID)
	if err != nil {
		return nil, ErrDatabase
	}
	result := make([]*Order, 0)
	for rows.Next() {
		o, e := scanOrder(rows)
		if e != nil {
			rows.Close()
			return nil, e
		}
		result = append(result, o)
	}
	rows.Close()
	if rows.Err() != nil {
		return nil, ErrDatabase
	}
	if err = tx.Commit(ctx); err != nil {
		return nil, ErrDatabase
	}
	return result, nil
}

// All reservation transitions lock the order first, then reservation, then stock.
func releaseReservation(ctx context.Context, tx pgx.Tx, orderID, state string) error {
	var listing string
	var qty int
	err := tx.QueryRow(ctx, `UPDATE summergear_app.inventory_reservations SET state=$2,released_at=clock_timestamp() WHERE order_id=$1 AND state='active' RETURNING listing_id::text,quantity`, orderID, state).Scan(&listing, &qty)
	if errors.Is(err, pgx.ErrNoRows) {
		return nil
	}
	if err != nil {
		return ErrDatabase
	}
	tag, err := tx.Exec(ctx, `UPDATE summergear_app.inventory_items SET available_quantity=available_quantity+$2,reserved_quantity=reserved_quantity-$2,updated_at=clock_timestamp() WHERE listing_id=$1 AND reserved_quantity >= $2`, listing, qty)
	if err != nil || tag.RowsAffected() != 1 {
		return ErrDatabase
	}
	return nil
}
func (s *Store) CancelOrder(ctx context.Context, orderID, memberID string) (*Order, error) {
	if !validID(orderID) {
		return nil, ErrInvalid
	}
	tx, err := beginMember(ctx, s.Pool, memberID)
	if err != nil {
		return nil, err
	}
	defer tx.Rollback(context.Background())
	o, err := scanOrder(tx.QueryRow(ctx, `SELECT `+orderColumns+` FROM summergear_app.orders WHERE id=$1 FOR UPDATE`, orderID))
	if err != nil {
		return nil, err
	}
	if o.Status == "cancelled" {
		return o, nil
	}
	if o.Status != "pending" || o.PaymentStatus != "unpaid" {
		return nil, ErrConflict
	}
	if err = releaseReservation(ctx, tx, orderID, "released"); err != nil {
		return nil, err
	}
	err = tx.QueryRow(ctx, `UPDATE summergear_app.orders SET status='cancelled',updated_at=clock_timestamp() WHERE id=$1 RETURNING updated_at`, orderID).Scan(&o.UpdatedAt)
	if err != nil {
		return nil, ErrDatabase
	}
	if err = tx.Commit(ctx); err != nil {
		return nil, ErrDatabase
	}
	o.Status = "cancelled"
	return o, nil
}
func (s *Store) ExpireReservations(ctx context.Context) error {
	tx, err := s.Pool.Begin(ctx)
	if err != nil {
		return ErrDatabase
	}
	defer tx.Rollback(context.Background())
	rows, err := tx.Query(ctx, `SELECT o.id::text FROM summergear_app.orders o WHERE o.status='pending' AND o.payment_status='unpaid'
 AND EXISTS(SELECT 1 FROM summergear_app.inventory_reservations r WHERE r.order_id=o.id AND r.state='active' AND r.expires_at<=clock_timestamp())
 ORDER BY o.created_at LIMIT 50 FOR UPDATE OF o SKIP LOCKED`)
	if err != nil {
		return ErrDatabase
	}
	var ids []string
	for rows.Next() {
		var id string
		if err = rows.Scan(&id); err != nil {
			rows.Close()
			return ErrDatabase
		}
		ids = append(ids, id)
	}
	rows.Close()
	if rows.Err() != nil {
		return ErrDatabase
	}
	for _, id := range ids {
		if err = releaseReservation(ctx, tx, id, "expired"); err != nil {
			return err
		}
		if _, err = tx.Exec(ctx, `UPDATE summergear_app.orders SET status='cancelled',updated_at=clock_timestamp() WHERE id=$1`, id); err != nil {
			return ErrDatabase
		}
	}
	return tx.Commit(ctx)
}
