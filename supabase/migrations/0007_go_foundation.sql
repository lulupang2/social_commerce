-- Go/River foundation only. Run as summergear_migrator after explicit DBA bootstrap.
-- Does not alter public, auth, storage, existing policies or earlier migrations.
CREATE TABLE summergear_app.sample_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  idempotency_key text NOT NULL UNIQUE CHECK(idempotency_key ~ '^[a-zA-Z0-9_-]{1,100}$'),
  job_id bigint UNIQUE,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE summergear_app.sample_effects (
  request_id uuid PRIMARY KEY REFERENCES summergear_app.sample_requests(id),
  completed_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE summergear_app.sample_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE summergear_app.sample_effects ENABLE ROW LEVEL SECURITY;
CREATE POLICY sample_api_read ON summergear_app.sample_requests FOR SELECT TO summergear_api USING (true);
CREATE POLICY sample_api_insert ON summergear_app.sample_requests FOR INSERT TO summergear_api WITH CHECK (true);
CREATE POLICY sample_api_job_link ON summergear_app.sample_requests FOR UPDATE TO summergear_api USING (true) WITH CHECK (true);
CREATE POLICY sample_worker_read ON summergear_app.sample_requests FOR SELECT TO summergear_worker USING (true);
CREATE POLICY sample_effect_read ON summergear_app.sample_effects FOR SELECT TO summergear_api, summergear_worker USING (true);
CREATE POLICY sample_effect_insert ON summergear_app.sample_effects FOR INSERT TO summergear_worker WITH CHECK (true);
GRANT USAGE ON SCHEMA summergear_app TO summergear_api, summergear_worker;
GRANT SELECT, INSERT ON summergear_app.sample_requests TO summergear_api;
GRANT UPDATE(job_id) ON summergear_app.sample_requests TO summergear_api;
GRANT SELECT ON summergear_app.sample_requests TO summergear_worker;
GRANT SELECT ON summergear_app.sample_effects TO summergear_api, summergear_worker;
GRANT INSERT ON summergear_app.sample_effects TO summergear_worker;
COMMENT ON SCHEMA summergear_app IS 'Private Go foundation; never expose through Supabase Data API';
COMMENT ON SCHEMA summergear_river IS 'Private River queue; never expose through Supabase Data API';
