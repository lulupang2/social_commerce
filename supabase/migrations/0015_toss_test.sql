-- Separate genuine Toss TEST effects from historical fake gateway results.
ALTER TABLE summergear_app.payment_attempts DROP CONSTRAINT payment_attempts_pg_provider_check;
ALTER TABLE summergear_app.payment_attempts ADD CONSTRAINT payment_attempts_pg_provider_check CHECK(pg_provider IN ('fake_toss','toss_test'));
ALTER TABLE summergear_app.payment_events DROP CONSTRAINT payment_events_pg_provider_check;
ALTER TABLE summergear_app.payment_events ADD CONSTRAINT payment_events_pg_provider_check CHECK(pg_provider IN ('fake_toss','toss_test'));
ALTER TYPE summergear_app.payment_status ADD VALUE 'pending_cancel';
ALTER TYPE summergear_app.payment_status ADD VALUE 'cancelled';
CREATE UNIQUE INDEX refunds_full_order ON summergear_app.refunds(order_id);
GRANT UPDATE(remaining_cancellable) ON summergear_app.refunds TO summergear_api;
GRANT SELECT, INSERT, UPDATE ON summergear_app.refunds TO summergear_worker;
CREATE POLICY refunds_worker ON summergear_app.refunds FOR ALL TO summergear_worker USING(true);
