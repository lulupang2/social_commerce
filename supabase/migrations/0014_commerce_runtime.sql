-- Forward fix for the initial commerce scaffolding. Seller/stock provisioning
-- belongs to the migrator, never to a browser request or a buyer's API role.
ALTER TABLE summergear_app.inventory_items ADD COLUMN seller_id uuid
  REFERENCES summergear_app.sellers(id) ON DELETE RESTRICT;
CREATE FUNCTION summergear_app.listing_seller_valid(listing uuid, seller uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT EXISTS (SELECT 1 FROM summergear_app.listings l
    JOIN summergear_app.seller_memberships sm ON sm.member_id=l.member_id
    WHERE l.id=listing AND sm.seller_id=seller AND sm.active);
$$;
REVOKE ALL ON FUNCTION summergear_app.listing_seller_valid(uuid,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION summergear_app.listing_seller_valid(uuid,uuid) TO summergear_api;
REVOKE INSERT, UPDATE ON summergear_app.sellers FROM summergear_api;
REVOKE UPDATE(type,display_name,status,updated_at) ON summergear_app.sellers FROM summergear_api;
REVOKE INSERT, UPDATE, DELETE ON summergear_app.seller_memberships FROM summergear_api;

ALTER TABLE summergear_app.orders ADD CONSTRAINT orders_test_quantity CHECK (quantity = 1);
ALTER TABLE summergear_app.orders ADD CONSTRAINT orders_amount_snapshot
  CHECK (shipping_fee_krw = 0 AND service_fee_krw = 0 AND total_amount_krw = unit_price_krw * quantity);
CREATE UNIQUE INDEX payment_attempts_one_per_order ON summergear_app.payment_attempts(order_id);
DROP POLICY orders_api_insert ON summergear_app.orders;
CREATE POLICY orders_api_insert ON summergear_app.orders FOR INSERT TO summergear_api
  WITH CHECK (buyer_id::text=current_setting('summergear.member_id',true)
    AND status='pending' AND payment_status='unpaid');
DROP POLICY inventory_reservations_api_select ON summergear_app.inventory_reservations;
DROP POLICY inventory_reservations_api_insert ON summergear_app.inventory_reservations;
DROP POLICY inventory_reservations_api_update ON summergear_app.inventory_reservations;
CREATE POLICY reservations_api ON summergear_app.inventory_reservations FOR ALL TO summergear_api
  USING (order_id IN (SELECT id FROM summergear_app.orders))
  WITH CHECK (order_id IN (SELECT id FROM summergear_app.orders));

-- Worker uses a distinct DB role; it must be able to reconcile committed work.
GRANT SELECT, UPDATE ON summergear_app.orders, summergear_app.inventory_items,
  summergear_app.inventory_reservations, summergear_app.payment_attempts,
  summergear_app.payment_events TO summergear_worker;
CREATE POLICY orders_worker ON summergear_app.orders FOR ALL TO summergear_worker USING (true);
CREATE POLICY inventory_worker ON summergear_app.inventory_items FOR ALL TO summergear_worker USING (true);
CREATE POLICY reservations_worker ON summergear_app.inventory_reservations FOR ALL TO summergear_worker USING (true);
CREATE POLICY attempts_worker ON summergear_app.payment_attempts FOR ALL TO summergear_worker USING (true);
CREATE POLICY events_worker ON summergear_app.payment_events FOR ALL TO summergear_worker USING (true);

-- Persist the fixture gateway separately from application payment attempts so
-- API/worker restart and a lost approval response can be tested without keys.
CREATE TABLE summergear_app.fixture_payments (
  payment_key text PRIMARY KEY,
  order_id uuid NOT NULL UNIQUE REFERENCES summergear_app.orders(id),
  amount bigint NOT NULL CHECK (amount > 0),
  status text NOT NULL CHECK (status IN ('approved','cancelled')),
  created_at timestamptz NOT NULL DEFAULT clock_timestamp()
);
ALTER TABLE summergear_app.fixture_payments ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON summergear_app.fixture_payments FROM PUBLIC;
GRANT SELECT, INSERT, UPDATE ON summergear_app.fixture_payments TO summergear_api;
GRANT SELECT ON summergear_app.fixture_payments TO summergear_worker;
CREATE POLICY fixture_payments_api ON summergear_app.fixture_payments FOR ALL TO summergear_api
  USING (order_id IN (SELECT id FROM summergear_app.orders
    WHERE buyer_id::text = current_setting('summergear.member_id', true)));
CREATE POLICY fixture_payments_worker ON summergear_app.fixture_payments FOR SELECT TO summergear_worker USING (true);
