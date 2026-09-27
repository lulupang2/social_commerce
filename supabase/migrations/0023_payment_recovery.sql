-- Operator recovery is evidence-gathering, never an administrative payment approval.
CREATE TABLE summergear_app.payment_recovery_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  payment_attempt_id uuid NOT NULL REFERENCES summergear_app.payment_attempts(id) ON DELETE RESTRICT,
  order_id uuid NOT NULL REFERENCES summergear_app.orders(id) ON DELETE RESTRICT,
  actor_member_id uuid NOT NULL REFERENCES summergear_app.members(id) ON DELETE RESTRICT,
  reason text NOT NULL CHECK (length(btrim(reason)) BETWEEN 1 AND 500),
  status text NOT NULL DEFAULT 'queued' CHECK (status IN ('queued','checked','failed')),
  job_id bigint,
  last_error_code text,
  requested_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  finished_at timestamptz
);
CREATE UNIQUE INDEX payment_recovery_one_pending ON summergear_app.payment_recovery_requests(payment_attempt_id) WHERE status='queued';
CREATE INDEX payment_recovery_recent ON summergear_app.payment_recovery_requests(requested_at DESC,id);
ALTER TABLE summergear_app.payment_recovery_requests ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON summergear_app.payment_recovery_requests FROM PUBLIC;
GRANT SELECT,INSERT(payment_attempt_id,order_id,actor_member_id,reason),UPDATE(job_id)
  ON summergear_app.payment_recovery_requests TO summergear_api;
GRANT SELECT,UPDATE(status,last_error_code,finished_at) ON summergear_app.payment_recovery_requests TO summergear_worker;
CREATE POLICY recovery_operator_select ON summergear_app.payment_recovery_requests FOR SELECT TO summergear_api
  USING (EXISTS(SELECT 1 FROM summergear_app.listing_reviewers r
    WHERE r.member_id::text=current_setting('summergear.member_id',true)));
CREATE POLICY recovery_operator_insert ON summergear_app.payment_recovery_requests FOR INSERT TO summergear_api
  WITH CHECK(actor_member_id::text=current_setting('summergear.member_id',true)
    AND EXISTS(SELECT 1 FROM summergear_app.listing_reviewers r WHERE r.member_id=actor_member_id));
CREATE POLICY recovery_operator_update ON summergear_app.payment_recovery_requests FOR UPDATE TO summergear_api
  USING (EXISTS(SELECT 1 FROM summergear_app.listing_reviewers r
    WHERE r.member_id::text=current_setting('summergear.member_id',true)))
  WITH CHECK (EXISTS(SELECT 1 FROM summergear_app.listing_reviewers r
    WHERE r.member_id::text=current_setting('summergear.member_id',true)));
CREATE POLICY recovery_worker ON summergear_app.payment_recovery_requests FOR ALL TO summergear_worker USING (true);

-- Read-only operator policies supplement existing buyer/seller visibility; no
-- operator UPDATE policy on orders or payment_attempts is introduced.
CREATE POLICY orders_operator_read ON summergear_app.orders FOR SELECT TO summergear_api
  USING (EXISTS(SELECT 1 FROM summergear_app.listing_reviewers r
    WHERE r.member_id::text=current_setting('summergear.member_id',true)));
CREATE POLICY payment_attempts_operator_read ON summergear_app.payment_attempts FOR SELECT TO summergear_api
  USING (EXISTS(SELECT 1 FROM summergear_app.listing_reviewers r
    WHERE r.member_id::text=current_setting('summergear.member_id',true)));
