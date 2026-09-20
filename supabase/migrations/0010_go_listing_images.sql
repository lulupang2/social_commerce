-- Go-owned listing image metadata for the existing private listing-images bucket.
-- Legacy public.listing_images and existing Storage RLS remain untouched.
CREATE TABLE summergear_app.listing_images (
  id uuid PRIMARY KEY,
  listing_id uuid NOT NULL REFERENCES summergear_app.listings(id) ON DELETE CASCADE,
  storage_path text NOT NULL UNIQUE,
  alt_text text CHECK (alt_text IS NULL OR length(btrim(alt_text)) BETWEEN 1 AND 160),
  sort_order bigint NOT NULL CHECK (sort_order >= 0),
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  updated_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  UNIQUE (listing_id, sort_order)
);

CREATE INDEX go_listing_images_listing_sort
  ON summergear_app.listing_images(listing_id, sort_order);

CREATE OR REPLACE FUNCTION summergear_app.validate_go_listing_image()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = pg_catalog, summergear_app
AS $$
DECLARE
  listing_owner uuid;
  path_owner uuid;
  path_listing uuid;
  filename text;
  filename_uuid uuid;
  extension text;
  segment_count integer;
  image_count integer;
BEGIN
  SELECT listing.member_id
  INTO listing_owner
  FROM summergear_app.listings listing
  WHERE listing.id = NEW.listing_id
  FOR UPDATE;

  IF listing_owner IS NULL THEN
    RAISE EXCEPTION 'listing image references an unavailable listing'
      USING ERRCODE = 'check_violation';
  END IF;

  segment_count := array_length(string_to_array(NEW.storage_path, '/'), 1);
  IF segment_count IS DISTINCT FROM 3
     OR NEW.storage_path ~ '[[:space:]]'
     OR position('?' in NEW.storage_path) > 0
     OR position('#' in NEW.storage_path) > 0
     OR position('%' in NEW.storage_path) > 0
     OR position(chr(92) in NEW.storage_path) > 0
     OR NEW.storage_path LIKE '%//%' THEN
    RAISE EXCEPTION 'invalid listing image namespace'
      USING ERRCODE = 'check_violation';
  END IF;

  BEGIN
    path_owner := split_part(NEW.storage_path, '/', 1)::uuid;
    path_listing := split_part(NEW.storage_path, '/', 2)::uuid;
    filename := split_part(NEW.storage_path, '/', 3);
    filename_uuid := split_part(filename, '.', 1)::uuid;
    extension := split_part(filename, '.', 2);
  EXCEPTION
    WHEN invalid_text_representation THEN
      RAISE EXCEPTION 'invalid listing image namespace'
        USING ERRCODE = 'check_violation';
  END;

  IF path_owner <> listing_owner
     OR path_listing <> NEW.listing_id
     OR filename <> filename_uuid::text || '.' || extension
     OR extension NOT IN ('jpg', 'png', 'webp') THEN
    RAISE EXCEPTION 'invalid listing image namespace'
      USING ERRCODE = 'check_violation';
  END IF;

  IF TG_OP = 'INSERT' THEN
    SELECT count(*)
    INTO image_count
    FROM summergear_app.listing_images image
    WHERE image.listing_id = NEW.listing_id;

    IF image_count >= 12 THEN
      RAISE EXCEPTION 'listing image limit reached'
        USING ERRCODE = 'check_violation';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER go_listing_images_validate
BEFORE INSERT OR UPDATE OF listing_id, storage_path
ON summergear_app.listing_images
FOR EACH ROW EXECUTE FUNCTION summergear_app.validate_go_listing_image();

ALTER TABLE summergear_app.listing_images ENABLE ROW LEVEL SECURITY;

CREATE POLICY go_listing_images_api_select ON summergear_app.listing_images
  FOR SELECT TO summergear_api
  USING (
    EXISTS (
      SELECT 1
      FROM summergear_app.listings listing
      WHERE listing.id = listing_id
        AND (
          listing.status = 'active'
          OR listing.member_id::text = current_setting('summergear.member_id', true)
        )
    )
  );

CREATE POLICY go_listing_images_api_insert ON summergear_app.listing_images
  FOR INSERT TO summergear_api
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM summergear_app.listings listing
      WHERE listing.id = listing_id
        AND listing.member_id::text = current_setting('summergear.member_id', true)
        AND listing.status IN ('draft','pending_review','rejected')
    )
  );

CREATE POLICY go_listing_images_api_update ON summergear_app.listing_images
  FOR UPDATE TO summergear_api
  USING (
    EXISTS (
      SELECT 1
      FROM summergear_app.listings listing
      WHERE listing.id = listing_id
        AND listing.member_id::text = current_setting('summergear.member_id', true)
        AND listing.status IN ('draft','pending_review','rejected')
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM summergear_app.listings listing
      WHERE listing.id = listing_id
        AND listing.member_id::text = current_setting('summergear.member_id', true)
        AND listing.status IN ('draft','pending_review','rejected')
    )
  );

CREATE POLICY go_listing_images_api_delete ON summergear_app.listing_images
  FOR DELETE TO summergear_api
  USING (
    EXISTS (
      SELECT 1
      FROM summergear_app.listings listing
      WHERE listing.id = listing_id
        AND listing.member_id::text = current_setting('summergear.member_id', true)
        AND listing.status IN ('draft','pending_review','rejected')
    )
  );

REVOKE ALL ON summergear_app.listing_images FROM PUBLIC, summergear_worker;
GRANT SELECT, INSERT, DELETE ON summergear_app.listing_images TO summergear_api;
GRANT UPDATE(storage_path, alt_text, sort_order, updated_at)
  ON summergear_app.listing_images TO summergear_api;
REVOKE EXECUTE ON FUNCTION summergear_app.validate_go_listing_image() FROM PUBLIC;

COMMENT ON TABLE summergear_app.listing_images IS
  'Go-owned listing image metadata. Object bytes stay in the private listing-images Storage bucket.';
