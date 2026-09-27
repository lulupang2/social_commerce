-- Go service-session personal data. Legacy public profiles/favorites remain untouched.
CREATE TABLE summergear_app.member_preferences (
  member_id uuid PRIMARY KEY REFERENCES summergear_app.members(id) ON DELETE CASCADE,
  surf_skill text NOT NULL DEFAULT 'beginner' CHECK (surf_skill IN ('beginner','intermediate','advanced','expert')),
  tennis_skill text NOT NULL DEFAULT 'beginner' CHECK (tennis_skill IN ('beginner','intermediate','advanced','expert')),
  updated_at timestamptz NOT NULL DEFAULT clock_timestamp()
);
CREATE TABLE summergear_app.member_favorites (
  member_id uuid NOT NULL REFERENCES summergear_app.members(id) ON DELETE CASCADE,
  listing_id uuid NOT NULL REFERENCES summergear_app.listings(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  PRIMARY KEY (member_id,listing_id)
);
CREATE INDEX member_favorites_listing ON summergear_app.member_favorites(listing_id);

ALTER TABLE summergear_app.member_preferences ENABLE ROW LEVEL SECURITY;
ALTER TABLE summergear_app.member_favorites ENABLE ROW LEVEL SECURITY;
CREATE POLICY own_preferences ON summergear_app.member_preferences TO summergear_api
  USING (member_id::text = current_setting('summergear.member_id',true))
  WITH CHECK (member_id::text = current_setting('summergear.member_id',true));
CREATE POLICY own_favorites ON summergear_app.member_favorites TO summergear_api
  USING (member_id::text = current_setting('summergear.member_id',true))
  WITH CHECK (member_id::text = current_setting('summergear.member_id',true));
REVOKE ALL ON summergear_app.member_preferences, summergear_app.member_favorites FROM PUBLIC, summergear_worker;
GRANT SELECT,INSERT,UPDATE(surf_skill,tennis_skill,updated_at) ON summergear_app.member_preferences TO summergear_api;
GRANT SELECT,INSERT,DELETE ON summergear_app.member_favorites TO summergear_api;
