-- Tighten table/function grants and the client portal's login and reset paths.
--
--  1. workspace_mailbox_orders and client_autopilot_settings carried
--     `FOR ALL TO authenticated` policies and kept Supabase's default table
--     privileges, so any workspace member could insert/update/delete rows
--     (status, credits_charged, enabled, next_run_at ...) straight through
--     PostgREST, skipping the edge functions' role checks and audit. Every
--     reader and writer is an edge function on the service role
--     (workspace-mailbox-infra, workspace-client-shortlist,
--     client-autopilot-tick); the browser never touches either table. Lock
--     them down the way the host-relationship book was
--     (20260728000500): revoke everything from PUBLIC/anon/authenticated,
--     force RLS, and grant the service role explicitly.
--  2. workspace_allowance_is_payable(uuid) was revoked from PUBLIC only;
--     Supabase grants EXECUTE on new functions to anon/authenticated
--     directly. Nothing outside the database calls it.
--  3. The legacy client-assets and prospect-images buckets are public, so
--     image display goes through /object/public and never consults
--     storage.objects policies. Their bare SELECT policies only let the
--     list API enumerate every object (same finding as 20260807000500).
--     prospect-images is written and cleaned up only by
--     workspace-prospect-dashboards on the service role, so its SELECT,
--     INSERT and DELETE policies (none of which named a role, so they
--     applied to anon too) are dropped. client-assets is still written from
--     the legacy admin client screen with upsert and remove, which storage
--     executes as INSERT ... ON CONFLICT and DELETE ... RETURNING and so
--     needs SELECT on the object: its public SELECT is replaced with an
--     authenticated one scoped to the client-photos folder its write
--     policies already cover. Anonymous listing stops either way.
--  4. Portal login counted every attempt per email, before the password was
--     checked, so anyone who knew a client's email could keep them locked
--     out. Only unsuccessful attempts now count: 8 per (email, IP) and a
--     global ceiling of 40 per email in 15 minutes, with 30 per IP kept as
--     before. A successful sign-in to an account with that email clears the
--     slate. Reservation stays atomic under the same email-then-IP advisory
--     locks, and issue_client_portal_password_session is unchanged, so the
--     serialization with password reset is intact.
--  5. Reset tokens are now one row per token rather than one per client, so
--     a new self-serve request adds a token instead of overwriting (and so
--     invalidating) one the client is about to use. Redemption still burns
--     every token for the client. Completion also refuses a client whose
--     workspace is not active, taking the workspace lock before the client
--     lock in the same order as login.

BEGIN;

SELECT pg_advisory_xact_lock(hashtextextended('goap:tighten-grants-portal-auth:v1', 0));

-- ---------------------------------------------------------------------------
-- 1. Service-role-only infra and autopilot tables.
-- ---------------------------------------------------------------------------
ALTER TABLE public.workspace_mailbox_orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.workspace_mailbox_orders FORCE ROW LEVEL SECURITY;
REVOKE ALL PRIVILEGES ON TABLE public.workspace_mailbox_orders FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.workspace_mailbox_orders TO service_role;

ALTER TABLE public.client_autopilot_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.client_autopilot_settings FORCE ROW LEVEL SECURITY;
REVOKE ALL PRIVILEGES ON TABLE public.client_autopilot_settings FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.client_autopilot_settings TO service_role;

-- The paired policies stay as defense in depth should a grant ever return;
-- without table privileges a browser session cannot reach either table.

-- ---------------------------------------------------------------------------
-- 2. Allowance gate is service-role only.
-- ---------------------------------------------------------------------------
REVOKE ALL ON FUNCTION public.workspace_allowance_is_payable(UUID) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.workspace_allowance_is_payable(UUID) TO service_role;

-- ---------------------------------------------------------------------------
-- 3. Legacy public buckets stop being listable.
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS "Public read access to client assets" ON storage.objects;
DROP POLICY IF EXISTS client_assets_client_photos_authenticated_read ON storage.objects;
CREATE POLICY client_assets_client_photos_authenticated_read
  ON storage.objects FOR SELECT
  TO authenticated
  USING (bucket_id = 'client-assets' AND (storage.foldername(name))[1] = 'client-photos');

DROP POLICY IF EXISTS "Public read access for prospect images" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated users can upload prospect images" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated users can delete prospect images" ON storage.objects;

-- ---------------------------------------------------------------------------
-- 4. Portal login: only unsuccessful attempts count toward the lockout.
-- ---------------------------------------------------------------------------
-- Finds the last successful sign-in for an email without a sequential scan
-- of the activity log.
CREATE INDEX IF NOT EXISTS client_portal_login_success_client_idx
  ON public.client_portal_activity_log (client_id, created_at DESC)
  WHERE action = 'password_login_success';

CREATE OR REPLACE FUNCTION public.reserve_client_portal_login_attempt(
  p_email_normalized TEXT,
  p_ip_address TEXT,
  p_user_agent TEXT
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  normalized_email TEXT := lower(btrim(COALESCE(p_email_normalized, '')));
  normalized_ip TEXT := COALESCE(NULLIF(btrim(p_ip_address), ''), 'unknown');
  window_start TIMESTAMPTZ := now() - interval '15 minutes';
  failure_window_start TIMESTAMPTZ;
  last_success_at TIMESTAMPTZ;
  recent_pair_failures BIGINT;
  recent_email_failures BIGINT;
  recent_ip_attempts BIGINT;
BEGIN
  IF char_length(normalized_email) NOT BETWEEN 3 AND 254
    OR normalized_email IS DISTINCT FROM p_email_normalized
    OR char_length(normalized_ip) > 120
    OR char_length(COALESCE(p_user_agent, '')) > 1024
  THEN
    RAISE EXCEPTION 'invalid portal login attempt parameters'
      USING ERRCODE = '22023';
  END IF;

  -- Every caller acquires locks in the same email-then-IP order.
  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('portal-login-email:' || normalized_email, 0)
  );
  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('portal-login-ip:' || normalized_ip, 0)
  );

  -- A reservation is a failure until a successful sign-in for the same email
  -- follows it. Counting reservations (not failures recorded later by the
  -- caller) keeps parallel requests from slipping past the limit, and the
  -- success marker is written by issue_client_portal_password_session in the
  -- same transaction that creates the session.
  SELECT max(activity.created_at)
  INTO last_success_at
  FROM public.client_portal_activity_log AS activity
  JOIN public.clients AS client ON client.id = activity.client_id
  WHERE activity.action = 'password_login_success'
    AND activity.created_at >= window_start
    AND client.portal_access_enabled
    AND client.portal_email_normalized = normalized_email;

  failure_window_start := GREATEST(window_start, COALESCE(last_success_at, window_start));

  SELECT
    count(*) FILTER (WHERE activity.ip_address = normalized_ip),
    count(*)
  INTO recent_pair_failures, recent_email_failures
  FROM public.client_portal_activity_log AS activity
  WHERE activity.action = 'password_login_attempt'
    AND activity.created_at > failure_window_start
    AND activity.metadata ->> 'email' = normalized_email;

  -- Per-IP volume across all emails is unchanged: a single source cannot
  -- spray many accounts.
  SELECT count(*)
  INTO recent_ip_attempts
  FROM public.client_portal_activity_log AS activity
  WHERE activity.action = 'password_login_attempt'
    AND activity.created_at >= window_start
    AND activity.ip_address = normalized_ip;

  IF recent_pair_failures >= 8
    OR recent_email_failures >= 40
    OR recent_ip_attempts >= 30
  THEN
    RETURN false;
  END IF;

  INSERT INTO public.client_portal_activity_log (
    client_id,
    session_id,
    action,
    metadata,
    ip_address,
    user_agent
  )
  VALUES (
    NULL,
    NULL,
    'password_login_attempt',
    jsonb_build_object('email', normalized_email),
    normalized_ip,
    NULLIF(p_user_agent, '')
  );

  RETURN true;
END;
$$;

REVOKE ALL ON FUNCTION public.reserve_client_portal_login_attempt(TEXT, TEXT, TEXT)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.reserve_client_portal_login_attempt(TEXT, TEXT, TEXT)
  TO service_role;

COMMENT ON FUNCTION public.reserve_client_portal_login_attempt(TEXT, TEXT, TEXT) IS
  'Service-role-only atomic password-login reservation. Unsuccessful attempts are limited to 8 per (email, IP) and 40 per email in 15 minutes, all attempts to 30 per IP; a successful sign-in clears the email''s failures.';

-- ---------------------------------------------------------------------------
-- 5. Reset tokens: one row per token, and completion requires an active
--    workspace.
-- ---------------------------------------------------------------------------
ALTER TABLE public.client_portal_reset_tokens
  ADD COLUMN IF NOT EXISTS id UUID NOT NULL DEFAULT gen_random_uuid();

-- client_id stays mandatory once it is no longer the key.
ALTER TABLE public.client_portal_reset_tokens
  ALTER COLUMN client_id SET NOT NULL;
ALTER TABLE public.client_portal_reset_tokens
  DROP CONSTRAINT IF EXISTS client_portal_reset_tokens_pkey;
ALTER TABLE public.client_portal_reset_tokens
  ADD CONSTRAINT client_portal_reset_tokens_pkey PRIMARY KEY (id);

-- Redemption looks a token up by its hash; two live rows must never share one.
CREATE UNIQUE INDEX IF NOT EXISTS client_portal_reset_tokens_token_hash_uidx
  ON public.client_portal_reset_tokens (token_hash);
CREATE INDEX IF NOT EXISTS client_portal_reset_tokens_client_idx
  ON public.client_portal_reset_tokens (client_id, expires_at);

COMMENT ON TABLE public.client_portal_reset_tokens IS
  'Hashed single-use portal password-set tokens, one row per token. Self-serve requests add a token without replacing pending ones; owner-issued invites and setup links replace all of a client''s tokens; redemption burns every token for the client.';

CREATE OR REPLACE FUNCTION public.complete_client_portal_password_reset_v1(
  p_token_hash TEXT,
  p_password_hash TEXT,
  p_ip_address TEXT
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  reset_client_id UUID;
  normalized_ip TEXT := COALESCE(NULLIF(btrim(p_ip_address), ''), 'unknown');
  target_workspace_id UUID;
  client_workspace_id UUID;
  client_name TEXT;
BEGIN
  IF p_token_hash IS NULL OR p_token_hash !~ '^sha256\$[A-Za-z0-9+/]{43}=$' THEN
    RETURN false;
  END IF;
  IF p_password_hash IS NULL
    OR p_password_hash !~ '^pbkdf2_sha256\$[0-9]{6,7}\$[A-Za-z0-9+/]{22}==\$[A-Za-z0-9+/]{43}=$'
  THEN
    RAISE EXCEPTION 'invalid portal password verifier'
      USING ERRCODE = '22023';
  END IF;
  IF char_length(normalized_ip) > 120 THEN
    RAISE EXCEPTION 'invalid portal reset parameters'
      USING ERRCODE = '22023';
  END IF;

  SELECT reset_token.client_id
  INTO reset_client_id
  FROM public.client_portal_reset_tokens AS reset_token
  WHERE reset_token.token_hash = p_token_hash
    AND reset_token.expires_at > now()
  FOR UPDATE;

  IF reset_client_id IS NULL THEN
    RETURN false;
  END IF;

  -- Resolve the workspace without a row lock, then lock workspace before
  -- client: the same order issue_client_portal_password_session uses, so a
  -- login and a reset for one client cannot deadlock.
  SELECT client.workspace_id
  INTO target_workspace_id
  FROM public.clients AS client
  WHERE client.id = reset_client_id;

  IF target_workspace_id IS NULL THEN
    DELETE FROM public.client_portal_reset_tokens WHERE client_id = reset_client_id;
    RETURN false;
  END IF;

  -- A suspended, expired or deleted workspace cannot have its clients'
  -- credentials changed. The token is left to expire on its own so the link
  -- works again if the workspace is reactivated within the hour.
  PERFORM 1
  FROM public.workspaces AS workspace
  WHERE workspace.id = target_workspace_id
    AND workspace.status = 'active'
  FOR SHARE;

  IF NOT FOUND THEN
    RETURN false;
  END IF;

  SELECT client.workspace_id, client.name
  INTO client_workspace_id, client_name
  FROM public.clients AS client
  WHERE client.id = reset_client_id
    AND client.workspace_id = target_workspace_id
    AND client.portal_access_enabled
  FOR UPDATE;

  IF client_workspace_id IS NULL THEN
    DELETE FROM public.client_portal_reset_tokens WHERE client_id = reset_client_id;
    RETURN false;
  END IF;

  INSERT INTO public.client_portal_credentials (client_id, password_verifier, configured_by)
  VALUES (reset_client_id, p_password_hash, 'self_service_reset')
  ON CONFLICT (client_id) DO UPDATE
  SET password_verifier = EXCLUDED.password_verifier,
      credential_version = public.client_portal_credentials.credential_version + 1,
      configured_at = now(),
      configured_by = 'self_service_reset',
      updated_at = now();

  UPDATE public.clients
  SET password_set_at = now(), password_set_by = 'self_service_reset'
  WHERE id = reset_client_id;

  DELETE FROM public.client_portal_sessions WHERE client_id = reset_client_id;
  DELETE FROM public.client_portal_tokens WHERE client_id = reset_client_id;
  DELETE FROM public.client_portal_reset_tokens WHERE client_id = reset_client_id;

  INSERT INTO public.workspace_audit_log (workspace_id, actor_user_id, action, entity_type, entity_id, metadata)
  VALUES (
    client_workspace_id,
    NULL,
    'client.portal_password.reset',
    'client',
    reset_client_id,
    pg_catalog.jsonb_build_object('client_name', client_name)
  );

  INSERT INTO public.client_portal_activity_log (client_id, session_id, action, metadata, ip_address, user_agent)
  VALUES (reset_client_id, NULL, 'password_reset_completed', '{}'::jsonb, normalized_ip, NULL);

  RETURN true;
END;
$$;

REVOKE ALL ON FUNCTION public.complete_client_portal_password_reset_v1(TEXT, TEXT, TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.complete_client_portal_password_reset_v1(TEXT, TEXT, TEXT) TO service_role;

COMMENT ON FUNCTION public.complete_client_portal_password_reset_v1(TEXT, TEXT, TEXT) IS
  'Redeems a hashed single-use reset token for a client in an active workspace: replaces the PBKDF2 verifier, revokes all portal sessions, burns every token for the client, audits.';

COMMIT;
