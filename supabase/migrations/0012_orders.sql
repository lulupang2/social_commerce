-- Orders, order items, and inventory reservation tables.
-- Prices are snapped at creation time in KRW integer won.
-- Shipping and fees are zero for test products without delivery.

CREATE TYPE summergear_app.order_status AS ENUM ('pending','cancelled','confirmed');
CREATE TYPE summergear_app.payment_status AS ENUM ('unpaid','pending_approval','approved','failed');

CREATE TABLE summergear_app.orders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  buyer_id uuid NOT NULL REFERENCES summergear_app.members(id),
  seller_id uuid NOT NULL REFERENCES summergear_app.sellers(id),
  listing_id uuid NOT NULL REFERENCES summergear_app.listings(id),
  item_name text NOT NULL CHECK (length(btrim(item_name)) BETWEEN 1 AND 120),
  unit_price_krw bigint NOT NULL CHECK (unit_price_krw > 0 AND unit_price_krw <= 999999999999),
  quantity smallint NOT NULL CHECK (quantity BETWEEN 1 AND 99),
  shipping_fee_krw smallint NOT NULL DEFAULT 0 CHECK (shipping_fee_krw >= 0),
  service_fee_krw smallint NOT NULL DEFAULT 0 CHECK (service_fee_krw >= 0),
  total_amount_krw bigint NOT NULL CHECK (total_amount_krw > 0),
  currency text NOT NULL DEFAULT 'KRW' CHECK (currency = 'KRW'),
  status summergear_app.order_status NOT NULL DEFAULT 'pending',
  payment_status summergear_app.payment_status NOT NULL DEFAULT 'unpaid',
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  updated_at timestamptz NOT NULL DEFAULT clock_timestamp()
);

CREATE UNIQUE INDEX orders_listing_unpaid_qty_one
  ON summergear_app.orders(listing_id, buyer_id)
  WHERE status = 'pending' AND quantity = 1;

CREATE INDEX order_buyer_created ON summergear_app.orders(buyer_id, created_at DESC);
CREATE INDEX order_seller_created ON summergear_app.orders(seller_id, created_at DESC);
CREATE INDEX order_listing_pending ON summergear_app.orders(listing_id, status) WHERE status = 'pending';

ALTER TABLE summergear_app.orders ENABLE ROW LEVEL SECURITY;

CREATE POLICY orders_api_select ON summergear_app.orders
  FOR SELECT TO summergear_api
  USING (
    buyer_id::text = current_setting('summergear.member_id', true)
    OR seller_id IN (
      SELECT sm.seller_id FROM summergear_app.seller_memberships sm
      WHERE sm.member_id::text = current_setting('summergear.member_id', true) AND sm.active = true
    )
  );

CREATE POLICY orders_api_insert ON summergear_app.orders
  FOR INSERT TO summergear_api WITH CHECK (true);

CREATE POLICY orders_api_update ON summergear_app.orders
  FOR UPDATE TO summergear_api
  USING (
    buyer_id::text = current_setting('summergear.member_id', true)
    OR seller_id IN (
      SELECT sm.seller_id FROM summergear_app.seller_memberships sm
      WHERE sm.member_id::text = current_setting('summergear.member_id', true) AND sm.active = true
    )
  );

CREATE TABLE summergear_app.order_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id uuid NOT NULL REFERENCES summergear_app.orders(id) ON DELETE CASCADE,
  listing_id uuid NOT NULL REFERENCES summergear_app.listings(id),
  item_name text NOT NULL CHECK (length(btrim(item_name)) BETWEEN 1 AND 120),
  unit_price_krw bigint NOT NULL CHECK (unit_price_krw > 0 AND unit_price_krw <= 999999999999),
  quantity smallint NOT NULL CHECK (quantity BETWEEN 1 AND 99),
  line_total_krw bigint NOT NULL CHECK (line_total_krw > 0),
  created_at timestamptz NOT NULL DEFAULT clock_timestamp()
);

CREATE INDEX order_items_order ON summergear_app.order_items(order_id);

ALTER TABLE summergear_app.order_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY order_items_api_all ON summergear_app.order_items
  FOR ALL TO summergear_api
  USING (order_id IN (
    SELECT o.id FROM summergear_app.orders o
    WHERE o.buyer_id::text = current_setting('summergear.member_id', true)
       OR o.seller_id IN (
         SELECT sm.seller_id FROM summergear_app.seller_memberships sm
         WHERE sm.member_id::text = current_setting('summergear.member_id', true) AND sm.active = true
       )
  ));

-- Inventory reservation model for preventing overselling on listings with limited stock.
-- For test products each listing has exactly 1 available item tracked separately.

CREATE TABLE summergear_app.inventory_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  listing_id uuid NOT NULL UNIQUE REFERENCES summergear_app.listings(id) ON DELETE RESTRICT,
  available_quantity smallint NOT NULL CHECK (available_quantity >= 0),
  reserved_quantity smallint NOT NULL DEFAULT 0 CHECK (reserved_quantity >= 0),
  updated_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  CHECK (available_quantity + reserved_quantity >= 0)
);

CREATE INDEX inventory_items_listing ON summergear_app.inventory_items(listing_id);

CREATE TABLE summergear_app.inventory_reservations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  listing_id uuid NOT NULL REFERENCES summergear_app.listings(id),
  order_id uuid NOT NULL REFERENCES summergear_app.orders(id) ON DELETE CASCADE,
  buyer_id uuid NOT NULL REFERENCES summergear_app.members(id),
  quantity smallint NOT NULL CHECK (quantity BETWEEN 1 AND 99),
  expires_at timestamptz NOT NULL,
  state text NOT NULL DEFAULT 'active'
    CHECK (state IN ('active','consumed','expired','released')),
  consumed_at timestamptz,
  released_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp()
);

CREATE INDEX inventory_reservations_listing_state_active
  ON summergear_app.inventory_reservations(listing_id, state) WHERE state IN ('active','consumed');

CREATE INDEX inventory_reservations_expires_active
  ON summergear_app.inventory_reservations(expires_at) WHERE state = 'active';

CREATE UNIQUE INDEX inventory_reservations_unique_unconsumed
  ON summergear_app.inventory_reservations(order_id) WHERE state = 'active';

ALTER TABLE summergear_app.inventory_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE summergear_app.inventory_reservations ENABLE ROW LEVEL SECURITY;

CREATE POLICY inventory_items_api_select ON summergear_app.inventory_items
  FOR SELECT TO summergear_api USING (true);

CREATE POLICY inventory_items_api_update ON summergear_app.inventory_items
  FOR UPDATE TO summergear_api USING (true) WITH CHECK (true);

CREATE POLICY inventory_reservations_api_select ON summergear_app.inventory_reservations
  FOR SELECT TO summergear_api USING (true);

CREATE POLICY inventory_reservations_api_insert ON summergear_app.inventory_reservations
  FOR INSERT TO summergear_api WITH CHECK (true);

CREATE POLICY inventory_reservations_api_update ON summergear_app.inventory_reservations
  FOR UPDATE TO summergear_api USING (true) WITH CHECK (true);

REVOKE ALL ON summergear_app.orders, summergear_app.order_items,
  summergear_app.inventory_items, summergear_app.inventory_reservations FROM PUBLIC, summergear_worker;
GRANT SELECT, INSERT ON summergear_app.orders TO summergear_api;
GRANT UPDATE(status,payment_status,updated_at) ON summergear_app.orders TO summergear_api;
GRANT SELECT ON summergear_app.order_items TO summergear_api;
GRANT INSERT ON summergear_app.order_items TO summergear_api;
GRANT SELECT, UPDATE ON summergear_app.inventory_items TO summergear_api;
GRANT SELECT, INSERT, UPDATE ON summergear_app.inventory_reservations TO summergear_api;

COMMENT ON TABLE summergear_app.orders IS 'Orders snap price at creation; all amounts in KRW integer won.';
COMMENT ON TABLE summergear_app.order_items IS 'Immutable snapshot of ordered items within an order.';
COMMENT ON TABLE summergear_app.inventory_items IS 'Per-listing available/reserved stock counters for preventing oversell.';
COMMENT ON TABLE summergear_app.inventory_reservations IS 'Timeout-bound reservations consumed on confirmed payment.';
