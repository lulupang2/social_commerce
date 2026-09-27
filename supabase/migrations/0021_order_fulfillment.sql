-- Preserve payment/order states: a confirmed payment is not proof of delivery.
-- Existing confirmed orders start awaiting seller acceptance, never completed.
ALTER TABLE summergear_app.orders
  ADD COLUMN fulfillment_status text NOT NULL DEFAULT 'awaiting_acceptance'
    CHECK (fulfillment_status IN ('awaiting_acceptance','accepted','handed_over','completed')),
  ADD COLUMN accepted_at timestamptz,
  ADD COLUMN handed_over_at timestamptz,
  ADD COLUMN received_at timestamptz,
  ADD CONSTRAINT order_fulfillment_timestamps CHECK (
    (fulfillment_status = 'awaiting_acceptance' OR accepted_at IS NOT NULL)
    AND (fulfillment_status NOT IN ('handed_over','completed') OR handed_over_at IS NOT NULL)
    AND (fulfillment_status <> 'completed' OR received_at IS NOT NULL)
  );

CREATE TABLE summergear_app.order_fulfillment_events (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  order_id uuid NOT NULL REFERENCES summergear_app.orders(id) ON DELETE RESTRICT,
  actor_member_id uuid NOT NULL REFERENCES summergear_app.members(id) ON DELETE RESTRICT,
  from_status text NOT NULL CHECK (from_status IN ('awaiting_acceptance','accepted','handed_over')),
  to_status text NOT NULL CHECK (to_status IN ('accepted','handed_over','completed')),
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  CHECK ((from_status='awaiting_acceptance' AND to_status='accepted')
    OR (from_status='accepted' AND to_status='handed_over')
    OR (from_status='handed_over' AND to_status='completed'))
);
CREATE INDEX order_fulfillment_events_order ON summergear_app.order_fulfillment_events(order_id,id);
ALTER TABLE summergear_app.order_fulfillment_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY order_fulfillment_events_read ON summergear_app.order_fulfillment_events
  FOR SELECT TO summergear_api USING (EXISTS (
    SELECT 1 FROM summergear_app.orders o WHERE o.id=order_id
      AND (o.buyer_id::text=current_setting('summergear.member_id',true)
        OR EXISTS (SELECT 1 FROM summergear_app.seller_memberships sm
          WHERE sm.seller_id=o.seller_id AND sm.member_id::text=current_setting('summergear.member_id',true)
            AND sm.active))));
CREATE POLICY order_fulfillment_events_insert ON summergear_app.order_fulfillment_events
  FOR INSERT TO summergear_api WITH CHECK (
    actor_member_id::text=current_setting('summergear.member_id',true)
    AND EXISTS (SELECT 1 FROM summergear_app.orders o WHERE o.id=order_id
      AND ((to_status='completed' AND o.buyer_id=actor_member_id)
        OR (to_status<>'completed' AND EXISTS (SELECT 1 FROM summergear_app.seller_memberships sm
          WHERE sm.seller_id=o.seller_id AND sm.member_id=actor_member_id AND sm.active)))));
REVOKE ALL ON summergear_app.order_fulfillment_events FROM PUBLIC, summergear_worker;
GRANT SELECT,INSERT(order_id,actor_member_id,from_status,to_status)
  ON summergear_app.order_fulfillment_events TO summergear_api;
GRANT USAGE ON SEQUENCE summergear_app.order_fulfillment_events_id_seq TO summergear_api;
GRANT UPDATE(fulfillment_status,accepted_at,handed_over_at,received_at) ON summergear_app.orders TO summergear_api;
