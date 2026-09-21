-- Additive web-auth migration. Apply after 0007 as summergear_migrator.
-- Existing public/auth/storage tables and all previous migrations are untouched.
CREATE TABLE summergear_app.members (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active','suspended','deleted')),
  display_name text CHECK (length(display_name)<=200),
  email text CHECK (length(email)<=320),
  onboarded boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp()
);
CREATE TABLE summergear_app.auth_identities (
  provider text NOT NULL CHECK (provider IN ('naver','kakao')),
  subject text NOT NULL CHECK (length(subject) BETWEEN 1 AND 255),
  member_id uuid NOT NULL REFERENCES summergear_app.members(id),
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  PRIMARY KEY (provider,subject)
);
CREATE INDEX auth_identity_member ON summergear_app.auth_identities(member_id);
CREATE TABLE summergear_app.auth_sessions (
  token_hash text PRIMARY KEY CHECK (token_hash ~ '^[a-f0-9]{64}$'),
  member_id uuid NOT NULL REFERENCES summergear_app.members(id),
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  last_seen_at timestamptz NOT NULL,
  idle_expires_at timestamptz NOT NULL,
  absolute_expires_at timestamptz NOT NULL,
  reauthenticated_at timestamptz,
  revoked_at timestamptz,
  CHECK (idle_expires_at <= absolute_expires_at),
  CHECK (absolute_expires_at > created_at)
);
CREATE INDEX auth_session_member ON summergear_app.auth_sessions(member_id);
CREATE INDEX auth_session_expiry ON summergear_app.auth_sessions(absolute_expires_at);
CREATE TABLE summergear_app.auth_login_transactions (
  state_hash text PRIMARY KEY CHECK (state_hash ~ '^[a-f0-9]{64}$'),
  browser_hash text NOT NULL CHECK (browser_hash ~ '^[a-f0-9]{64}$'),
  provider text NOT NULL CHECK (provider IN ('naver','kakao')),
  return_path text NOT NULL CHECK (return_path ~ '^/[A-Za-z0-9/_-]*$'),
  pkce_verifier text,
  nonce text,
  purpose text NOT NULL CHECK (purpose IN ('login','reauth')),
  anchor_session_hash text REFERENCES summergear_app.auth_sessions(token_hash),
  member_id uuid REFERENCES summergear_app.members(id),
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  expires_at timestamptz NOT NULL,
  consumed_at timestamptz,
  CHECK ((purpose='login' AND anchor_session_hash IS NULL AND member_id IS NULL)
      OR (purpose='reauth' AND anchor_session_hash IS NOT NULL AND member_id IS NOT NULL)),
  CHECK (consumed_at IS NOT NULL OR (pkce_verifier IS NOT NULL AND nonce IS NOT NULL))
);
CREATE INDEX auth_login_expiry ON summergear_app.auth_login_transactions(expires_at);
CREATE INDEX auth_login_member ON summergear_app.auth_login_transactions(member_id);

ALTER TABLE summergear_app.members ENABLE ROW LEVEL SECURITY;
ALTER TABLE summergear_app.auth_identities ENABLE ROW LEVEL SECURITY;
ALTER TABLE summergear_app.auth_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE summergear_app.auth_login_transactions ENABLE ROW LEVEL SECURITY;
CREATE POLICY member_api ON summergear_app.members TO summergear_api USING (true) WITH CHECK (true);
CREATE POLICY identity_api ON summergear_app.auth_identities TO summergear_api USING (true) WITH CHECK (true);
CREATE POLICY session_api ON summergear_app.auth_sessions TO summergear_api USING (true) WITH CHECK (true);
CREATE POLICY login_api ON summergear_app.auth_login_transactions TO summergear_api USING (true) WITH CHECK (true);
REVOKE ALL ON summergear_app.members, summergear_app.auth_identities,
  summergear_app.auth_sessions, summergear_app.auth_login_transactions FROM PUBLIC, summergear_worker;
GRANT SELECT, INSERT ON summergear_app.members, summergear_app.auth_identities TO summergear_api;
-- Member row locking requires an UPDATE privilege. Status/onboarding are never granted.
GRANT UPDATE(display_name,email) ON summergear_app.members TO summergear_api;
GRANT SELECT, INSERT, UPDATE ON summergear_app.auth_sessions, summergear_app.auth_login_transactions TO summergear_api;
COMMENT ON TABLE summergear_app.auth_sessions IS 'Opaque service sessions: SHA-256 token hashes only; never provider tokens';
COMMENT ON TABLE summergear_app.auth_identities IS 'Only provider+subject identifies accounts. Email is never a merge key';
