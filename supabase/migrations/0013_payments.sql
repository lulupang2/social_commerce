-- Payment attempts, refunds, and payment events (webhook) tables.
-- Supports idempotent approval, full cancellation, and PG event deduplication.

CREATE TYPE summergear_app.payment_attempt_status AS ENUM ('pending','approved','failed','unknown');
CREATE TYPE summergear_app.refund_status AS ENUM ('requested','refunding','completed','failed','cancelled');
CREATE TYPE summergear_app.payment_event_state AS ENUM ('received','verified','processed','retry_later');

CREATE TABLE summergear_app.payment_attempts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id uuid NOT NULL REFERENCES summergear_app.orders(id),
  pg_provider text NOT NULL DEFAULT 'fake_toss' CHECK (pg_provider = 'fake_toss'),
  pg_payment_key text CHECK (length(pg_payment_key) <= 255),
  pg_transaction_id text CHECK (length(pg_transaction_id) <= 255),
  requested_amount bigint NOT NULL CHECK (requested_amount > 0),
  approved_amount bigint,
  currency text NOT NULL DEFAULT 'KRW' CHECK (currency = 'KRW'),
  status summergear_app.payment_attempt_status NOT NULL DEFAULT 'pending',
  idempotency_key text NOT NULL UNIQUE CHECK(idempotency_key ~ '^[a-zA-Z0-9_-]{1,100}$'),
  result_details jsonb CHECK (jsonb_typeof(result_details)='object' OR result_details IS NULL),
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  updated_at timestamptz NOT NULL DEFAULT clock_timestamp()
);

CREATE INDEX payment_attempts_order ON summergear_app.payment_attempts(order_id);
CREATE INDEX payment_attempts_order_status ON summergear_app.payment_attempts(order_id, status) WHERE status IN ('pending','unknown');
CREATE UNIQUE INDEX payment_attempts_pg_payment_key_unique
  ON summergear_app.payment_attempts(pg_payment_key) WHERE pg_payment_key IS NOT NULL;

ALTER TABLE summergear_app.payment_attempts ENABLE ROW LEVEL SECURITY;

CREATE POLICY payment_attempts_api_all ON summergear_app.payment_attempts
  FOR ALL TO summergear_api
  USING (order_id IN (
    SELECT o.id FROM summergear_app.orders o
    WHERE o.buyer_id::text = current_setting('summergear.member_id', true)
       OR o.seller_id IN (
         SELECT sm.seller_id FROM summergear_app.seller_memberships sm
         WHERE sm.member_id::text = current_setting('summergear.member_id', true) AND sm.active = true
       )
  ));

CREATE TABLE summergear_app.refunds (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id uuid NOT NULL REFERENCES summergear_app.orders(id),
  payment_attempt_id uuid NOT NULL REFERENCES summergear_app.payment_attempts(id),
  refund_amount bigint NOT NULL CHECK (refund_amount > 0),
  remaining_cancellable bigint NOT NULL CHECK (remaining_cancellable >= 0),
  reason text CHECK (length(btrim(reason)) BETWEEN 1 AND 500),
  status summergear_app.refund_status NOT NULL DEFAULT 'requested',
  pg_cancel_key text CHECK (length(pg_cancel_key) <= 255),
  pg_result jsonb CHECK (jsonb_typeof(pg_result)='object' OR pg_result IS NULL),
  completed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  updated_at timestamptz NOT NULL DEFAULT clock_timestamp()
);

CREATE INDEX refunds_order ON summergear_app.refunds(order_id);

ALTER TABLE summergear_app.refunds ENABLE ROW LEVEL SECURITY;

CREATE POLICY refunds_api_all ON summergear_app.refunds
  FOR ALL TO summergear_api
  USING (order_id IN (
    SELECT o.id FROM summergear_app.orders o
    WHERE o.buyer_id::text = current_setting('summergear.member_id', true)
       OR o.seller_id IN (
         SELECT sm.seller_id FROM summergear_app.seller_memberships sm
         WHERE sm.member_id::text = current_setting('summergear.member_id', true) AND sm.active = true
       )
  ));

CREATE TABLE summergear_app.payment_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  pg_event_id text NOT NULL CHECK (length(pg_event_id) BETWEEN 1 AND 255),
  pg_provider text NOT NULL DEFAULT 'fake_toss' CHECK (pg_provider = 'fake_toss'),
  event_type text NOT NULL CHECK (event_type IN ('paymentApproved','paymentFailed','paymentCancelled')),
  raw_payload jsonb NOT NULL CHECK (jsonb_typeof(raw_payload)='object'),
  order_id uuid REFERENCES summergear_app.orders(id),
  payment_attempt_id uuid REFERENCES summergear_app.payment_attempts(id),
  state summergear_app.payment_event_state NOT NULL DEFAULT 'received',
  verified_with_pg boolean NOT NULL DEFAULT false,
  retries smallint NOT NULL DEFAULT 0 CHECK (retries >= 0),
  last_error text CHECK (length(last_error) <= 500),
  processed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  updated_at timestamptz NOT NULL DEFAULT clock_timestamp()
);

CREATE UNIQUE INDEX payment_events_pg_event_id_unique
  ON summergear_app.payment_events(pg_provider, pg_event_id);

CREATE INDEX payment_events_retryable ON summergear_app.payment_events(state, retries)
  WHERE state = 'retry_later' AND retries < 10;

ALTER TABLE summergear_app.payment_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY payment_events_api_select ON summergear_app.payment_events
  FOR SELECT TO summergear_api USING (true);

CREATE POLICY payment_events_api_insert ON summergear_app.payment_events
  FOR INSERT TO summergear_api WITH CHECK (true);

CREATE POLICY payment_events_api_update ON summergear_app.payment_events
  FOR UPDATE TO summergear_api USING (true) WITH CHECK (true);

REVOKE ALL ON summergear_app.payment_attempts, summergear_app.refunds,
  summergear_app.payment_events FROM PUBLIC, summergear_worker;
GRANT SELECT, INSERT ON summergear_app.payment_attempts TO summergear_api;
GRANT UPDATE(status,approved_amount,result_details,updated_at) ON summergear_app.payment_attempts TO summergear_api;
GRANT SELECT, INSERT ON summergear_app.refunds TO summergear_api;
GRANT UPDATE(status,pg_cancel_key,pg_result,completed_at,updated_at) ON summergear_app.refunds TO summergear_api;
GRANT SELECT, INSERT, UPDATE ON summergear_app.payment_events TO summergear_api;

COMMENT ON TABLE summergear_app.payment_attempts IS 'Multiple PG attempts per order; tracks idempotency key and result.';
COMMENT ON TABLE summergear_app.refunds IS 'Full or partial refunds with cancellable balance tracking.';
COMMENT ON TABLE summergear_app.payment_events IS 'PG webhook events deduplicated by provider+event_id.';
