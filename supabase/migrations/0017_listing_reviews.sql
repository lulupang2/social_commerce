-- Reviewer grants are provisioned only by the migrator in disposable fixtures.
-- Production reviewer enrollment requires a separate administrative process.
CREATE TABLE summergear_app.listing_reviewers (
  member_id uuid PRIMARY KEY REFERENCES summergear_app.members(id) ON DELETE RESTRICT,
  granted_at timestamptz NOT NULL DEFAULT clock_timestamp()
);
ALTER TABLE summergear_app.listing_reviewers ENABLE ROW LEVEL SECURITY;
CREATE POLICY reviewer_self ON summergear_app.listing_reviewers FOR SELECT TO summergear_api
  USING (member_id::text = current_setting('summergear.member_id', true));
REVOKE ALL ON summergear_app.listing_reviewers FROM PUBLIC, summergear_worker;
GRANT SELECT ON summergear_app.listing_reviewers TO summergear_api;

CREATE POLICY listing_reviewer_select ON summergear_app.listings FOR SELECT TO summergear_api
  USING (EXISTS (SELECT 1 FROM summergear_app.listing_reviewers r
    WHERE r.member_id::text = current_setting('summergear.member_id', true)));
CREATE POLICY listing_reviewer_update ON summergear_app.listings FOR UPDATE TO summergear_api
  USING (EXISTS (SELECT 1 FROM summergear_app.listing_reviewers r
    WHERE r.member_id::text = current_setting('summergear.member_id', true)))
  WITH CHECK (EXISTS (SELECT 1 FROM summergear_app.listing_reviewers r
    WHERE r.member_id::text = current_setting('summergear.member_id', true)));
GRANT UPDATE(status,published_at,updated_at) ON summergear_app.listings TO summergear_api;

CREATE POLICY listing_reviewer_images ON summergear_app.listing_images FOR SELECT TO summergear_api
  USING (state='ready' AND EXISTS (SELECT 1 FROM summergear_app.listing_reviewers r
    WHERE r.member_id::text = current_setting('summergear.member_id', true)));

CREATE TABLE summergear_app.listing_review_events (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  listing_id uuid NOT NULL REFERENCES summergear_app.listings(id) ON DELETE RESTRICT,
  actor_member_id uuid NOT NULL REFERENCES summergear_app.members(id) ON DELETE RESTRICT,
  from_status text NOT NULL CHECK (from_status IN ('pending_review','rejected')),
  to_status text NOT NULL CHECK (to_status IN ('active','rejected','pending_review')),
  reason text CHECK (reason IS NULL OR length(btrim(reason)) BETWEEN 1 AND 1000),
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  CHECK ((from_status='pending_review' AND to_status IN ('active','rejected'))
      OR (from_status='rejected' AND to_status='pending_review')),
  CHECK ((to_status='rejected') = (reason IS NOT NULL))
);
CREATE INDEX listing_review_events_listing ON summergear_app.listing_review_events(listing_id,id DESC);
ALTER TABLE summergear_app.listing_review_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY review_event_read ON summergear_app.listing_review_events FOR SELECT TO summergear_api
  USING (EXISTS (SELECT 1 FROM summergear_app.listings l WHERE l.id=listing_id
    AND (l.member_id::text=current_setting('summergear.member_id',true)
      OR EXISTS(SELECT 1 FROM summergear_app.listing_reviewers r
        WHERE r.member_id::text=current_setting('summergear.member_id',true)))));
CREATE POLICY review_event_insert ON summergear_app.listing_review_events FOR INSERT TO summergear_api
  WITH CHECK (actor_member_id::text=current_setting('summergear.member_id',true)
    AND ((to_status='pending_review' AND EXISTS(SELECT 1 FROM summergear_app.listings l
      WHERE l.id=listing_id AND l.member_id=actor_member_id))
      OR EXISTS(SELECT 1 FROM summergear_app.listing_reviewers r
        WHERE r.member_id=actor_member_id)));
REVOKE ALL ON summergear_app.listing_review_events FROM PUBLIC, summergear_worker;
GRANT SELECT,INSERT(listing_id,actor_member_id,from_status,to_status,reason)
  ON summergear_app.listing_review_events TO summergear_api;
GRANT USAGE ON SEQUENCE summergear_app.listing_review_events_id_seq TO summergear_api;
