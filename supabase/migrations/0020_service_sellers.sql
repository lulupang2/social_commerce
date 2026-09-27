-- Seller enrollment and approval live in Go-owned schema. No legacy data is moved.
-- Reviewer enrollment itself remains migrator-only (0017); fixture admin explicitly grants it.
CREATE TABLE summergear_app.seller_applications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  applicant_id uuid NOT NULL REFERENCES summergear_app.members(id) ON DELETE RESTRICT,
  seller_type summergear_app.seller_type NOT NULL,
  display_name text NOT NULL CHECK (length(btrim(display_name)) BETWEEN 1 AND 120),
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','approved','rejected')),
  reviewed_by uuid REFERENCES summergear_app.members(id) ON DELETE RESTRICT,
  reviewed_at timestamptz,
  reason text CHECK (reason IS NULL OR length(btrim(reason)) BETWEEN 1 AND 1000),
  seller_id uuid UNIQUE REFERENCES summergear_app.sellers(id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  CHECK ((status='pending' AND reviewed_by IS NULL AND reviewed_at IS NULL AND seller_id IS NULL AND reason IS NULL)
    OR (status='approved' AND reviewed_by IS NOT NULL AND reviewed_at IS NOT NULL AND seller_id IS NOT NULL AND reason IS NULL)
    OR (status='rejected' AND reviewed_by IS NOT NULL AND reviewed_at IS NOT NULL AND seller_id IS NULL AND reason IS NOT NULL))
);
CREATE UNIQUE INDEX seller_applications_one_pending ON summergear_app.seller_applications(applicant_id) WHERE status='pending';
CREATE INDEX seller_applications_review_queue ON summergear_app.seller_applications(created_at,id) WHERE status='pending';
ALTER TABLE summergear_app.seller_applications ENABLE ROW LEVEL SECURITY;
CREATE POLICY seller_application_read ON summergear_app.seller_applications FOR SELECT TO summergear_api
  USING (applicant_id::text=current_setting('summergear.member_id',true)
    OR EXISTS(SELECT 1 FROM summergear_app.listing_reviewers r
      WHERE r.member_id::text=current_setting('summergear.member_id',true)));
CREATE POLICY seller_application_insert ON summergear_app.seller_applications FOR INSERT TO summergear_api
  WITH CHECK (applicant_id::text=current_setting('summergear.member_id',true)
    AND status='pending' AND reviewed_by IS NULL AND seller_id IS NULL);
CREATE POLICY seller_application_update ON summergear_app.seller_applications FOR UPDATE TO summergear_api
  USING (EXISTS(SELECT 1 FROM summergear_app.listing_reviewers r
    WHERE r.member_id::text=current_setting('summergear.member_id',true)))
  WITH CHECK (EXISTS(SELECT 1 FROM summergear_app.listing_reviewers r
    WHERE r.member_id::text=current_setting('summergear.member_id',true)));
REVOKE ALL ON summergear_app.seller_applications FROM PUBLIC, summergear_worker;
GRANT SELECT,INSERT(applicant_id,seller_type,display_name) ON summergear_app.seller_applications TO summergear_api;
GRANT UPDATE(status,reviewed_by,reviewed_at,reason,seller_id) ON summergear_app.seller_applications TO summergear_api;

-- 0014 revoked seller/membership writes. Only reviewer decisions may approve
-- sellers or add members; a self-submitted application grants no selling role.
DROP POLICY sellers_api_insert ON summergear_app.sellers;
DROP POLICY sellers_api_update ON summergear_app.sellers;
CREATE POLICY sellers_reviewer_insert ON summergear_app.sellers FOR INSERT TO summergear_api
  WITH CHECK (status='approved' AND EXISTS(SELECT 1 FROM summergear_app.listing_reviewers r
    WHERE r.member_id::text=current_setting('summergear.member_id',true)));
CREATE POLICY sellers_reviewer_update ON summergear_app.sellers FOR UPDATE TO summergear_api
  USING (EXISTS(SELECT 1 FROM summergear_app.listing_reviewers r
    WHERE r.member_id::text=current_setting('summergear.member_id',true)))
  WITH CHECK (EXISTS(SELECT 1 FROM summergear_app.listing_reviewers r
    WHERE r.member_id::text=current_setting('summergear.member_id',true)));
CREATE POLICY sellers_membership_read ON summergear_app.sellers FOR SELECT TO summergear_api
  USING (EXISTS(SELECT 1 FROM summergear_app.seller_memberships sm
    WHERE sm.seller_id=id AND sm.member_id::text=current_setting('summergear.member_id',true) AND sm.active)
    OR EXISTS(SELECT 1 FROM summergear_app.listing_reviewers r
      WHERE r.member_id::text=current_setting('summergear.member_id',true)));
GRANT INSERT(type,display_name,status) ON summergear_app.sellers TO summergear_api;
GRANT UPDATE(status,updated_at) ON summergear_app.sellers TO summergear_api;

DROP POLICY seller_memberships_api_all ON summergear_app.seller_memberships;
CREATE POLICY seller_membership_read ON summergear_app.seller_memberships FOR SELECT TO summergear_api
  USING (member_id::text=current_setting('summergear.member_id',true)
    OR EXISTS(SELECT 1 FROM summergear_app.listing_reviewers r
      WHERE r.member_id::text=current_setting('summergear.member_id',true)));
CREATE POLICY seller_membership_reviewer_insert ON summergear_app.seller_memberships FOR INSERT TO summergear_api
  WITH CHECK (EXISTS(SELECT 1 FROM summergear_app.listing_reviewers r
    WHERE r.member_id::text=current_setting('summergear.member_id',true)));
GRANT INSERT(seller_id,member_id,is_owner,active) ON summergear_app.seller_memberships TO summergear_api;

-- Stock binds one approved seller to an active owner listing. Existing buyer
-- reservation UPDATE privilege remains because purchasing also changes stock.
CREATE POLICY inventory_seller_insert ON summergear_app.inventory_items FOR INSERT TO summergear_api
  WITH CHECK (available_quantity BETWEEN 0 AND 1 AND reserved_quantity=0
    AND EXISTS (SELECT 1 FROM summergear_app.listings l
      JOIN summergear_app.seller_memberships sm ON sm.member_id=l.member_id AND sm.seller_id=seller_id AND sm.active
      JOIN summergear_app.sellers s ON s.id=sm.seller_id AND s.status='approved'
      WHERE l.id=listing_id AND l.status='active'
        AND l.member_id::text=current_setting('summergear.member_id',true)));
GRANT INSERT(listing_id,seller_id,available_quantity) ON summergear_app.inventory_items TO summergear_api;
