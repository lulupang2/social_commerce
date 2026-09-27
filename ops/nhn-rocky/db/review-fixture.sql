\set ON_ERROR_STOP on
BEGIN;
DO $$ BEGIN
  IF current_database() <> 'summergear_foundation_test'
    OR (SELECT target_id FROM summergear_meta.environment_guard WHERE singleton)
       IS DISTINCT FROM 'summergear-foundation-fixture-v1' THEN
    RAISE EXCEPTION 'disposable review fixture database required';
  END IF;
END $$;
-- These five fixed IDs exist only inside the disposable fixture database.
INSERT INTO summergear_app.members(id,display_name,onboarded) VALUES
 ('00000000-0000-4000-8000-000000000015','검토 운영자',true),
 ('00000000-0000-4000-8000-000000000013','판매자 A',true)
 ON CONFLICT(id) DO NOTHING;
INSERT INTO summergear_app.listing_reviewers(member_id)
 VALUES('00000000-0000-4000-8000-000000000015') ON CONFLICT DO NOTHING;
INSERT INTO summergear_app.sellers(id,type,display_name,status)
 VALUES('00000000-0000-4000-8000-000000000021','individual','격리 판매자 A','approved')
 ON CONFLICT(id) DO NOTHING;
INSERT INTO summergear_app.seller_memberships(seller_id,member_id,is_owner)
 VALUES('00000000-0000-4000-8000-000000000021','00000000-0000-4000-8000-000000000013',true)
 ON CONFLICT DO NOTHING;
SELECT set_config('summergear.fixture_listing_id', :'listing_id', true);
DO $$ DECLARE listing uuid := NULLIF(current_setting('summergear.fixture_listing_id',true),'')::uuid;
BEGIN
  IF listing IS NOT NULL THEN
    IF NOT EXISTS(SELECT 1 FROM summergear_app.listings l
      WHERE l.id=listing AND l.member_id='00000000-0000-4000-8000-000000000013'
      AND l.status='active' AND l.price_krw>0
      AND EXISTS(SELECT 1 FROM summergear_app.sellers s JOIN summergear_app.seller_memberships sm
        ON sm.seller_id=s.id WHERE s.id='00000000-0000-4000-8000-000000000021'
        AND s.status='approved' AND sm.member_id=l.member_id AND sm.active)) THEN
      RAISE EXCEPTION 'listing must be an active fixture seller A listing with positive price';
    END IF;
    INSERT INTO summergear_app.inventory_items(listing_id,seller_id,available_quantity)
    VALUES(listing,'00000000-0000-4000-8000-000000000021',1)
    ON CONFLICT(listing_id) DO NOTHING;
    IF NOT EXISTS(SELECT 1 FROM summergear_app.inventory_items i WHERE i.listing_id=listing
      AND i.seller_id='00000000-0000-4000-8000-000000000021') THEN
      RAISE EXCEPTION 'inventory is owned by a different seller';
    END IF;
  END IF;
END $$;
COMMIT;
