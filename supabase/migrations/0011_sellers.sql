-- Seller entity and member-to-seller membership for Go-owned marketplace vertical slice.
-- Does not alter public, existing tables, or earlier migrations.

CREATE TYPE summergear_app.seller_type AS ENUM ('individual', 'business');

CREATE TABLE summergear_app.sellers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  type summergear_app.seller_type NOT NULL,
  display_name text NOT NULL CHECK (length(btrim(display_name)) BETWEEN 1 AND 120),
  status text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending','approved','suspended','deleted')),
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  updated_at timestamptz NOT NULL DEFAULT clock_timestamp()
);

CREATE TABLE summergear_app.seller_memberships (
  seller_id uuid NOT NULL REFERENCES summergear_app.sellers(id) ON DELETE RESTRICT,
  member_id uuid NOT NULL REFERENCES summergear_app.members(id) ON DELETE CASCADE,
  is_owner boolean NOT NULL DEFAULT false,
  active boolean NOT NULL DEFAULT true,
  joined_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  PRIMARY KEY (seller_id, member_id)
);

ALTER TABLE summergear_app.sellers ENABLE ROW LEVEL SECURITY;
ALTER TABLE summergear_app.seller_memberships ENABLE ROW LEVEL SECURITY;

CREATE POLICY sellers_api_select ON summergear_app.sellers
  FOR SELECT TO summergear_api USING (status = 'approved');

CREATE POLICY sellers_api_insert ON summergear_app.sellers
  FOR INSERT TO summergear_api WITH CHECK (true);

CREATE POLICY sellers_api_update ON summergear_app.sellers
  FOR UPDATE TO summergear_api
  USING (true)
  WITH CHECK (true);

CREATE POLICY seller_memberships_api_all ON summergear_app.seller_memberships
  FOR ALL TO summergear_api
  USING (member_id::text = current_setting('summergear.member_id', true))
  WITH CHECK (member_id::text = current_setting('summergear.member_id', true));

REVOKE ALL ON summergear_app.sellers, summergear_app.seller_memberships FROM PUBLIC, summergear_worker;
GRANT SELECT ON summergear_app.sellers TO summergear_api;
GRANT INSERT ON summergear_app.sellers TO summergear_api;
GRANT UPDATE(type,display_name,status,updated_at) ON summergear_app.sellers TO summergear_api;
GRANT SELECT, INSERT, UPDATE, DELETE ON summergear_app.seller_memberships TO summergear_api;

COMMENT ON TABLE summergear_app.sellers IS 'Go-owned seller entity: individual or business with approval lifecycle.';
COMMENT ON TABLE summergear_app.seller_memberships IS 'Many-to-many between members and sellers; tracks ownership and active status.';
