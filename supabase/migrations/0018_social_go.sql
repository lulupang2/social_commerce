-- Go-owned social data uses service-session member IDs. Legacy public tables and
-- Supabase Auth identities remain intact; no author mapping is inferred.
CREATE TABLE summergear_app.conversations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  listing_id uuid NOT NULL REFERENCES summergear_app.listings(id) ON DELETE RESTRICT,
  buyer_id uuid NOT NULL REFERENCES summergear_app.members(id) ON DELETE RESTRICT,
  seller_id uuid NOT NULL REFERENCES summergear_app.members(id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  updated_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  UNIQUE(listing_id,buyer_id),
  CHECK(buyer_id<>seller_id)
);
CREATE INDEX conversations_seller_recent ON summergear_app.conversations(seller_id,updated_at DESC);
ALTER TABLE summergear_app.conversations ENABLE ROW LEVEL SECURITY;
CREATE POLICY conversation_read ON summergear_app.conversations FOR SELECT TO summergear_api
 USING(buyer_id::text=current_setting('summergear.member_id',true) OR seller_id::text=current_setting('summergear.member_id',true));
CREATE POLICY conversation_insert ON summergear_app.conversations FOR INSERT TO summergear_api
 WITH CHECK(buyer_id::text=current_setting('summergear.member_id',true) AND EXISTS(
  SELECT 1 FROM summergear_app.listings l WHERE l.id=listing_id AND l.status='active' AND l.member_id=seller_id));
CREATE POLICY conversation_update ON summergear_app.conversations FOR UPDATE TO summergear_api
 USING(buyer_id::text=current_setting('summergear.member_id',true) OR seller_id::text=current_setting('summergear.member_id',true))
 WITH CHECK(buyer_id::text=current_setting('summergear.member_id',true) OR seller_id::text=current_setting('summergear.member_id',true));
REVOKE ALL ON summergear_app.conversations FROM PUBLIC, summergear_worker;
GRANT SELECT,INSERT,UPDATE(updated_at) ON summergear_app.conversations TO summergear_api;

CREATE TABLE summergear_app.messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id uuid NOT NULL REFERENCES summergear_app.conversations(id) ON DELETE RESTRICT,
  sender_id uuid NOT NULL REFERENCES summergear_app.members(id) ON DELETE RESTRICT,
  client_nonce uuid NOT NULL,
  body text NOT NULL CHECK(length(btrim(body)) BETWEEN 1 AND 5000),
  read_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  UNIQUE(conversation_id,sender_id,client_nonce)
);
CREATE INDEX messages_conversation_recent ON summergear_app.messages(conversation_id,created_at,id);
ALTER TABLE summergear_app.messages ENABLE ROW LEVEL SECURITY;
CREATE POLICY message_read ON summergear_app.messages FOR SELECT TO summergear_api USING(EXISTS(
 SELECT 1 FROM summergear_app.conversations c WHERE c.id=conversation_id
 AND (c.buyer_id::text=current_setting('summergear.member_id',true) OR c.seller_id::text=current_setting('summergear.member_id',true))));
CREATE POLICY message_insert ON summergear_app.messages FOR INSERT TO summergear_api WITH CHECK(
 sender_id::text=current_setting('summergear.member_id',true) AND EXISTS(
 SELECT 1 FROM summergear_app.conversations c WHERE c.id=conversation_id AND (c.buyer_id=sender_id OR c.seller_id=sender_id)));
CREATE POLICY message_update ON summergear_app.messages FOR UPDATE TO summergear_api USING(
 sender_id::text<>current_setting('summergear.member_id',true) AND EXISTS(
 SELECT 1 FROM summergear_app.conversations c WHERE c.id=conversation_id
 AND (c.buyer_id::text=current_setting('summergear.member_id',true) OR c.seller_id::text=current_setting('summergear.member_id',true))))
 WITH CHECK(sender_id::text<>current_setting('summergear.member_id',true));
REVOKE ALL ON summergear_app.messages FROM PUBLIC, summergear_worker;
GRANT SELECT,INSERT,UPDATE(read_at) ON summergear_app.messages TO summergear_api;

CREATE TABLE summergear_app.community_posts (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 author_id uuid NOT NULL REFERENCES summergear_app.members(id) ON DELETE RESTRICT,
 sport text NOT NULL CHECK(sport IN ('surf','tennis')),
 post_type text NOT NULL CHECK(post_type IN ('guide','review','meetup','discussion')),
 title text NOT NULL CHECK(length(btrim(title)) BETWEEN 4 AND 160),
 body text NOT NULL CHECK(length(btrim(body)) BETWEEN 10 AND 10000),
 status text NOT NULL DEFAULT 'pending_review' CHECK(status IN ('pending_review','rejected','active')),
 published_at timestamptz,
 created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 updated_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 CHECK ((status='active')=(published_at IS NOT NULL))
);
CREATE INDEX community_posts_public_recent ON summergear_app.community_posts(created_at DESC,id DESC) WHERE status='active';
CREATE INDEX community_posts_owner_recent ON summergear_app.community_posts(author_id,created_at DESC);
ALTER TABLE summergear_app.community_posts ENABLE ROW LEVEL SECURITY;
CREATE POLICY post_read ON summergear_app.community_posts FOR SELECT TO summergear_api USING(
 status='active' OR author_id::text=current_setting('summergear.member_id',true)
 OR EXISTS(SELECT 1 FROM summergear_app.listing_reviewers r WHERE r.member_id::text=current_setting('summergear.member_id',true)));
CREATE POLICY post_insert ON summergear_app.community_posts FOR INSERT TO summergear_api WITH CHECK(
 author_id::text=current_setting('summergear.member_id',true) AND status='pending_review' AND published_at IS NULL);
CREATE POLICY post_update ON summergear_app.community_posts FOR UPDATE TO summergear_api USING(
 author_id::text=current_setting('summergear.member_id',true) OR EXISTS(
 SELECT 1 FROM summergear_app.listing_reviewers r WHERE r.member_id::text=current_setting('summergear.member_id',true)))
 WITH CHECK(author_id::text=current_setting('summergear.member_id',true) OR EXISTS(
 SELECT 1 FROM summergear_app.listing_reviewers r WHERE r.member_id::text=current_setting('summergear.member_id',true)));
REVOKE ALL ON summergear_app.community_posts FROM PUBLIC, summergear_worker;
GRANT SELECT,INSERT,UPDATE(title,body,status,published_at,updated_at) ON summergear_app.community_posts TO summergear_api;

CREATE TABLE summergear_app.community_review_events (
 id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
 post_id uuid NOT NULL REFERENCES summergear_app.community_posts(id) ON DELETE RESTRICT,
 actor_id uuid NOT NULL REFERENCES summergear_app.members(id) ON DELETE RESTRICT,
 from_status text NOT NULL CHECK(from_status IN ('pending_review','rejected')),
 to_status text NOT NULL CHECK(to_status IN ('pending_review','rejected','active')),
 reason text CHECK(reason IS NULL OR length(btrim(reason)) BETWEEN 1 AND 1000),
 created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 CHECK((from_status='pending_review' AND to_status IN ('rejected','active')) OR (from_status='rejected' AND to_status='pending_review')),
 CHECK ((to_status='rejected')=(reason IS NOT NULL))
);
CREATE INDEX community_review_events_post ON summergear_app.community_review_events(post_id,id DESC);
ALTER TABLE summergear_app.community_review_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY post_review_read ON summergear_app.community_review_events FOR SELECT TO summergear_api USING(EXISTS(
 SELECT 1 FROM summergear_app.community_posts p WHERE p.id=post_id AND
 (p.author_id::text=current_setting('summergear.member_id',true) OR EXISTS(
 SELECT 1 FROM summergear_app.listing_reviewers r WHERE r.member_id::text=current_setting('summergear.member_id',true)))));
CREATE POLICY post_review_insert ON summergear_app.community_review_events FOR INSERT TO summergear_api WITH CHECK(
 actor_id::text=current_setting('summergear.member_id',true) AND
 ((to_status='pending_review' AND EXISTS(SELECT 1 FROM summergear_app.community_posts p WHERE p.id=post_id AND p.author_id=actor_id))
 OR EXISTS(SELECT 1 FROM summergear_app.listing_reviewers r WHERE r.member_id=actor_id)));
REVOKE ALL ON summergear_app.community_review_events FROM PUBLIC, summergear_worker;
GRANT SELECT,INSERT(post_id,actor_id,from_status,to_status,reason) ON summergear_app.community_review_events TO summergear_api;
GRANT USAGE ON SEQUENCE summergear_app.community_review_events_id_seq TO summergear_api;

CREATE TABLE summergear_app.community_comments (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 post_id uuid NOT NULL REFERENCES summergear_app.community_posts(id) ON DELETE RESTRICT,
 author_id uuid NOT NULL REFERENCES summergear_app.members(id) ON DELETE RESTRICT,
 body text NOT NULL CHECK(length(btrim(body)) BETWEEN 1 AND 5000),
 created_at timestamptz NOT NULL DEFAULT clock_timestamp()
);
CREATE INDEX community_comments_post ON summergear_app.community_comments(post_id,created_at,id);
ALTER TABLE summergear_app.community_comments ENABLE ROW LEVEL SECURITY;
CREATE POLICY comment_read ON summergear_app.community_comments FOR SELECT TO summergear_api USING(EXISTS(
 SELECT 1 FROM summergear_app.community_posts p WHERE p.id=post_id AND p.status='active'));
CREATE POLICY comment_insert ON summergear_app.community_comments FOR INSERT TO summergear_api WITH CHECK(
 author_id::text=current_setting('summergear.member_id',true) AND EXISTS(
 SELECT 1 FROM summergear_app.community_posts p WHERE p.id=post_id AND p.status='active'));
REVOKE ALL ON summergear_app.community_comments FROM PUBLIC, summergear_worker;
GRANT SELECT,INSERT ON summergear_app.community_comments TO summergear_api;

CREATE TABLE summergear_app.community_reactions (
 post_id uuid NOT NULL REFERENCES summergear_app.community_posts(id) ON DELETE RESTRICT,
 member_id uuid NOT NULL REFERENCES summergear_app.members(id) ON DELETE RESTRICT,
 created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 PRIMARY KEY(post_id,member_id)
);
ALTER TABLE summergear_app.community_reactions ENABLE ROW LEVEL SECURITY;
CREATE POLICY reaction_read ON summergear_app.community_reactions FOR SELECT TO summergear_api USING(EXISTS(
 SELECT 1 FROM summergear_app.community_posts p WHERE p.id=post_id AND p.status='active'));
CREATE POLICY reaction_insert ON summergear_app.community_reactions FOR INSERT TO summergear_api WITH CHECK(
 member_id::text=current_setting('summergear.member_id',true) AND EXISTS(
 SELECT 1 FROM summergear_app.community_posts p WHERE p.id=post_id AND p.status='active'));
CREATE POLICY reaction_delete ON summergear_app.community_reactions FOR DELETE TO summergear_api USING(
 member_id::text=current_setting('summergear.member_id',true));
REVOKE ALL ON summergear_app.community_reactions FROM PUBLIC, summergear_worker;
GRANT SELECT,INSERT,DELETE ON summergear_app.community_reactions TO summergear_api;
