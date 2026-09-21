-- Go-owned listing image metadata and private Storage lifecycle.
-- Object bytes remain in the existing private "listing-images" bucket.
CREATE UNIQUE INDEX go_listings_id_member_unique
  ON summergear_app.listings(id, member_id);

CREATE TABLE summergear_app.listing_images (
  id uuid PRIMARY KEY,
  listing_id uuid NOT NULL,
  member_id uuid NOT NULL REFERENCES summergear_app.members(id),
  storage_path text NOT NULL UNIQUE,
  mime_type text NOT NULL CHECK (mime_type IN ('image/jpeg','image/png','image/webp')),
  file_size_bytes bigint NOT NULL CHECK (file_size_bytes BETWEEN 1 AND 10485760),
  alt_text text CHECK (alt_text IS NULL OR length(btrim(alt_text)) BETWEEN 1 AND 160),
  sort_order smallint NOT NULL CHECK (sort_order BETWEEN 0 AND 11),
  state text NOT NULL DEFAULT 'pending_upload'
    CHECK (state IN ('pending_upload','ready','upload_failed','deleting')),
  upload_expires_at timestamptz NOT NULL,
  completed_at timestamptz,
  replaces_image_id uuid REFERENCES summergear_app.listing_images(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  updated_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  CONSTRAINT go_listing_images_listing_owner_fk
    FOREIGN KEY (listing_id, member_id)
    REFERENCES summergear_app.listings(id, member_id)
    ON DELETE CASCADE,
  CONSTRAINT go_listing_images_namespace CHECK (
    storage_path = member_id::text || '/' || listing_id::text || '/' || id::text
  ),
  CONSTRAINT go_listing_images_completion CHECK (
    (state='ready' AND completed_at IS NOT NULL)
    OR (state<>'ready')
  )
);

CREATE UNIQUE INDEX go_listing_images_ready_sort
  ON summergear_app.listing_images(listing_id, sort_order)
  WHERE state='ready';

CREATE INDEX go_listing_images_listing_state
  ON summergear_app.listing_images(listing_id, state, sort_order);

CREATE UNIQUE INDEX go_listing_images_one_pending_replacement
  ON summergear_app.listing_images(replaces_image_id)
  WHERE state='pending_upload' AND replaces_image_id IS NOT NULL;

ALTER TABLE summergear_app.listing_images ENABLE ROW LEVEL SECURITY;

CREATE POLICY go_listing_images_api_select ON summergear_app.listing_images
  FOR SELECT TO summergear_api
  USING (
    member_id::text = current_setting('summergear.member_id', true)
    OR (
      state='ready'
      AND EXISTS (
        SELECT 1
        FROM summergear_app.listings listing
        WHERE listing.id=listing_id
          AND listing.status='active'
      )
    )
  );

CREATE POLICY go_listing_images_api_insert ON summergear_app.listing_images
  FOR INSERT TO summergear_api
  WITH CHECK (
    member_id::text = current_setting('summergear.member_id', true)
    AND state='pending_upload'
    AND completed_at IS NULL
  );

CREATE POLICY go_listing_images_api_update ON summergear_app.listing_images
  FOR UPDATE TO summergear_api
  USING (member_id::text = current_setting('summergear.member_id', true))
  WITH CHECK (member_id::text = current_setting('summergear.member_id', true));

CREATE POLICY go_listing_images_api_delete ON summergear_app.listing_images
  FOR DELETE TO summergear_api
  USING (member_id::text = current_setting('summergear.member_id', true));

REVOKE ALL ON summergear_app.listing_images FROM PUBLIC, summergear_worker;
GRANT SELECT, INSERT, DELETE ON summergear_app.listing_images TO summergear_api;
GRANT UPDATE(state,completed_at,updated_at)
  ON summergear_app.listing_images TO summergear_api;

COMMENT ON TABLE summergear_app.listing_images IS
  'Go-owned private listing image metadata; raw storage paths never leave the service boundary.';
