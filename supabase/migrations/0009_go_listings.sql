-- First Go-owned marketplace vertical slice.
-- Existing public.listings remains untouched until legacy ownership/storage migration is complete.
CREATE TABLE summergear_app.listings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  member_id uuid NOT NULL REFERENCES summergear_app.members(id),
  sport text NOT NULL CHECK (sport IN ('surf','tennis')),
  category text NOT NULL CHECK (category IN ('equipment','apparel','footwear','protective','accessories','other')),
  title text NOT NULL CHECK (length(btrim(title)) BETWEEN 1 AND 120),
  description text NOT NULL CHECK (length(btrim(description)) BETWEEN 10 AND 5000),
  price_krw bigint NOT NULL CHECK (price_krw BETWEEN 0 AND 999999999999),
  condition text NOT NULL CHECK (condition IN ('new','like_new','good','fair','poor')),
  status text NOT NULL DEFAULT 'pending_review'
    CHECK (status IN ('draft','pending_review','rejected','active','reserved','sold','archived','removed')),
  details jsonb NOT NULL CHECK (
    jsonb_typeof(details)='object'
    AND octet_length(details::text) <= 8192
    AND details ? 'sport'
    AND details->>'sport'=sport
  ),
  location_text text NOT NULL CHECK (length(btrim(location_text)) BETWEEN 1 AND 160),
  published_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  updated_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  CHECK ((status='active' AND published_at IS NOT NULL) OR status<>'active')
);

CREATE INDEX go_listings_active_created
  ON summergear_app.listings(created_at DESC) WHERE status='active';
CREATE INDEX go_listings_member_created
  ON summergear_app.listings(member_id,created_at DESC);

ALTER TABLE summergear_app.listings ENABLE ROW LEVEL SECURITY;

-- Public API reads are constrained to active rows. Authenticated owners can also
-- read their own pending/draft rows when the transaction-scoped member context is set.
CREATE POLICY go_listings_api_select ON summergear_app.listings
  FOR SELECT TO summergear_api
  USING (
    status='active'
    OR member_id::text = current_setting('summergear.member_id', true)
  );

CREATE POLICY go_listings_api_insert ON summergear_app.listings
  FOR INSERT TO summergear_api
  WITH CHECK (
    member_id::text = current_setting('summergear.member_id', true)
    AND status='pending_review'
    AND published_at IS NULL
  );

CREATE POLICY go_listings_api_update ON summergear_app.listings
  FOR UPDATE TO summergear_api
  USING (member_id::text = current_setting('summergear.member_id', true))
  WITH CHECK (member_id::text = current_setting('summergear.member_id', true));

REVOKE ALL ON summergear_app.listings FROM PUBLIC, summergear_worker;
GRANT SELECT, INSERT ON summergear_app.listings TO summergear_api;
GRANT UPDATE(title,description,category,price_krw,condition,details,location_text,updated_at)
  ON summergear_app.listings TO summergear_api;

COMMENT ON TABLE summergear_app.listings IS
  'Go-owned listings. Legacy public.listings is preserved until migration/cutover.';
