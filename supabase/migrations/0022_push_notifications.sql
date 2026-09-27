-- Push devices belong to a Go auth session, not to legacy Supabase browser auth.
CREATE TABLE summergear_app.push_devices (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  member_id uuid NOT NULL REFERENCES summergear_app.members(id) ON DELETE CASCADE,
  session_hash text NOT NULL REFERENCES summergear_app.auth_sessions(token_hash) ON DELETE CASCADE,
  token text NOT NULL UNIQUE CHECK (length(token) BETWEEN 25 AND 256),
  platform text NOT NULL CHECK (platform IN ('ios','android')),
  active boolean NOT NULL DEFAULT true,
  updated_at timestamptz NOT NULL DEFAULT clock_timestamp()
);
CREATE INDEX push_devices_member ON summergear_app.push_devices(member_id) WHERE active;
ALTER TABLE summergear_app.push_devices ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON summergear_app.push_devices FROM PUBLIC;
GRANT SELECT,UPDATE(active,updated_at) ON summergear_app.push_devices TO summergear_api;
GRANT SELECT,UPDATE(active,updated_at) ON summergear_app.push_devices TO summergear_worker;
CREATE POLICY push_devices_api_read ON summergear_app.push_devices FOR SELECT TO summergear_api
  USING (member_id::text=current_setting('summergear.member_id',true));
CREATE POLICY push_devices_api_update ON summergear_app.push_devices FOR UPDATE TO summergear_api
  USING (member_id::text=current_setting('summergear.member_id',true))
  WITH CHECK (member_id::text=current_setting('summergear.member_id',true));
CREATE POLICY push_devices_worker ON summergear_app.push_devices FOR ALL TO summergear_worker USING (true);

-- Called by an already validated Go session. The current member GUC prevents
-- service callers from registering another member's device. Reassignment by
-- native token possession prevents stale account bindings on shared devices.
CREATE FUNCTION summergear_app.register_push_device(
  actor uuid, session_key text, push_token text, device_platform text)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE device uuid;
BEGIN
  IF actor::text IS DISTINCT FROM current_setting('summergear.member_id',true)
     OR push_token !~ '^(Expo|Exponent)PushToken\[[a-zA-Z0-9_-]{10,240}\]$'
     OR device_platform NOT IN ('ios','android')
     OR NOT EXISTS (SELECT 1 FROM summergear_app.auth_sessions s
       JOIN summergear_app.members m ON m.id=s.member_id
       WHERE s.token_hash=session_key AND s.member_id=actor AND m.status='active'
         AND s.revoked_at IS NULL AND s.idle_expires_at>clock_timestamp()
         AND s.absolute_expires_at>clock_timestamp()) THEN
    RAISE EXCEPTION 'active Go session and Expo token required' USING ERRCODE='22023';
  END IF;
  INSERT INTO summergear_app.push_devices(member_id,session_hash,token,platform)
   VALUES(actor,session_key,push_token,device_platform)
   ON CONFLICT(token) DO UPDATE SET member_id=EXCLUDED.member_id,
      session_hash=EXCLUDED.session_hash,platform=EXCLUDED.platform,
      active=true,updated_at=clock_timestamp()
   RETURNING id INTO device;
  RETURN device;
END $$;
REVOKE ALL ON FUNCTION summergear_app.register_push_device(uuid,text,text,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION summergear_app.register_push_device(uuid,text,text,text) TO summergear_api;

CREATE FUNCTION summergear_app.active_push_session(session_key text, actor uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
 SELECT EXISTS (SELECT 1 FROM summergear_app.auth_sessions s
   JOIN summergear_app.members m ON m.id=s.member_id
   WHERE s.token_hash=session_key AND s.member_id=actor AND m.status='active'
     AND s.revoked_at IS NULL AND s.idle_expires_at>clock_timestamp()
     AND s.absolute_expires_at>clock_timestamp());
$$;
REVOKE ALL ON FUNCTION summergear_app.active_push_session(text,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION summergear_app.active_push_session(text,uuid) TO summergear_worker;

-- Producers write an event in the same transaction as the chat/review change.
-- A periodic River worker delivers without making business writes depend on Expo.
CREATE TABLE summergear_app.notification_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_key text NOT NULL UNIQUE CHECK (length(event_key) BETWEEN 2 AND 200),
  member_id uuid NOT NULL REFERENCES summergear_app.members(id) ON DELETE CASCADE,
  actor_member_id uuid NOT NULL REFERENCES summergear_app.members(id),
  kind text NOT NULL CHECK (kind IN ('chat_message','listing_review','community_review')),
  resource_id uuid NOT NULL,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','sent','skipped','failed')),
  attempts int NOT NULL DEFAULT 0,
  last_error_code text,
  delivered_at timestamptz,
  next_attempt_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  created_at timestamptz NOT NULL DEFAULT clock_timestamp()
);
CREATE INDEX notification_events_pending ON summergear_app.notification_events(next_attempt_at,id) WHERE status='pending';
ALTER TABLE summergear_app.notification_events ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON summergear_app.notification_events FROM PUBLIC;
GRANT INSERT(event_key,member_id,actor_member_id,kind,resource_id) ON summergear_app.notification_events TO summergear_api;
GRANT SELECT ON summergear_app.notification_events TO summergear_api;
GRANT SELECT,UPDATE(status,attempts,last_error_code,delivered_at,next_attempt_at) ON summergear_app.notification_events TO summergear_worker;
CREATE POLICY notification_events_api_insert ON summergear_app.notification_events FOR INSERT TO summergear_api
  WITH CHECK (actor_member_id::text=current_setting('summergear.member_id',true));
CREATE POLICY notification_events_operator_read ON summergear_app.notification_events FOR SELECT TO summergear_api
  USING (EXISTS(SELECT 1 FROM summergear_app.listing_reviewers r
    WHERE r.member_id::text=current_setting('summergear.member_id',true)));
CREATE POLICY notification_events_worker ON summergear_app.notification_events FOR ALL TO summergear_worker USING (true);

CREATE TABLE summergear_app.notification_deliveries (
  event_id uuid NOT NULL REFERENCES summergear_app.notification_events(id) ON DELETE CASCADE,
  device_id uuid NOT NULL REFERENCES summergear_app.push_devices(id) ON DELETE CASCADE,
  delivered_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  PRIMARY KEY(event_id,device_id)
);
ALTER TABLE summergear_app.notification_deliveries ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON summergear_app.notification_deliveries FROM PUBLIC;
GRANT SELECT,INSERT ON summergear_app.notification_deliveries TO summergear_worker;
CREATE POLICY notification_deliveries_worker ON summergear_app.notification_deliveries FOR ALL TO summergear_worker USING (true);
