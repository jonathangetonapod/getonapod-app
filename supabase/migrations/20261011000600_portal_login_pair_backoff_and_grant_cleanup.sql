-- Portal sign-in backoff scoped to the address it comes from, and a round of
-- grant and policy cleanup after the 20261011 review.
--
--  1. reserve_client_portal_login_attempt (20261011000400) escalated a wait
--     between attempts, and locked the email outright from 100 failures, on
--     the email's failures from every address. The check runs before the
--     password is verified, so anyone could lock a client out for a day by
--     typing their email with wrong passwords. The escalating wait (30 seconds
--     from 10 failures, 2 minutes from 20, 10 minutes from 40) and the lock at
--     100 now count only the (email, address) pair's own failures. Email-wide,
--     the 15-minute ceiling of 40 stays, and a 24-hour ceiling of 1000 with no
--     per-attempt wait is added, so guesses spread across many addresses are
--     still capped without one address's failures locking out another. A
--     successful sign-in or a completed reset still clears every count for
--     the email.
--
--  2. Default EXECUTE for functions created by the migration role.
--     20261011000500 ran ALTER DEFAULT PRIVILEGES REVOKE EXECUTE ON FUNCTIONS
--     FROM PUBLIC with no schema clause, which removes the built-in PUBLIC
--     grant in every schema, not only public. The request was to put the
--     global default back and keep the public-schema revoke. That cannot be
--     expressed: PostgreSQL adds per-schema default privileges to the global
--     ones, and a per-schema REVOKE can only undo an earlier per-schema GRANT
--     (see ALTER DEFAULT PRIVILEGES, "you cannot revoke privileges per-schema
--     if they are granted globally"). Restoring the global grant would hand
--     EXECUTE to PUBLIC, and so to anon and authenticated, on every new
--     function in public again, including SECURITY DEFINER ones.
--     So the global revoke stays, and the built-in default is restored per
--     schema instead: every other schema that exists now and that the
--     migration role can create functions in gets ALTER DEFAULT PRIVILEGES IN
--     SCHEMA ... GRANT EXECUTE ON FUNCTIONS TO PUBLIC. A schema created later
--     needs the same statement in the migration that creates it.
--     In public, a new function is executable only by its owner and
--     service_role until a migration grants it. That includes SECURITY
--     INVOKER helpers: a function an RLS policy, column default or check
--     constraint calls is run as the querying role, so a migration that adds
--     one must GRANT EXECUTE on it to authenticated (and anon if needed)
--     explicitly, or the policy fails with a permission error. Trigger
--     functions are unaffected; EXECUTE is checked when the trigger is
--     created, not when it fires.
--
--  3. cleanup_expired_portal_data() is service-role only. It was allowlisted
--     in 20261011000500 because 20250128000002 granted it to authenticated;
--     20260720000200 had already revoked that, and nothing in the browser
--     calls it. get_client_portal_stats() leaves the allowlist too: the
--     browser helper that called it is removed, and 20260720000200 revoked it
--     from authenticated as well (the old allowlist comment said otherwise).
--     The allowlist below replaces the one in 20261011000500, and
--     scripts/check-security-definer-grants.mjs reads the newest one. The
--     same sweep runs again so both functions lose any browser grant.
--
--  4. set_workspace_primary_domain_v1 locked only the target domain row, so
--     two switches in one workspace at once could each clear the other's
--     primary and leave the workspace with none or collide on the partial
--     unique index. It now locks the workspace row first, then re-reads the
--     target FOR UPDATE and re-checks that it still belongs to that workspace
--     and is serving.
--
--  5. Signed-in reads of client-photos in client-assets are limited to
--     platform admins. The bucket is public, so images still render through
--     their public URLs; the policy only governed listing and API reads.
--
--  6. workspace_billing_profiles and workspace_credit_lots lose their
--     anon/authenticated grants. Nothing in the browser reads either table;
--     the billing edge functions use the service role.
--
--  7. client_notifications, workspace_domains and billing_plans lose their
--     anon/authenticated grants (no browser reads; /platform states prices
--     from the page itself and /app billing reads plans through edge
--     functions). workspace_access_requests keeps SELECT, UPDATE and DELETE
--     for authenticated, which the platform-admin queue uses directly under
--     its is_platform_admin() policies, and loses everything else.
--     ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON TABLES FROM
--     anon, authenticated is deliberately not run: older tables the browser
--     reads rely on Supabase's default table grants, and a later migration
--     could too.
--
--  8. The permissive "Service role full access" policies on
--     client_search_history and matching_experiments applied to every role
--     with USING (true). The service role bypasses RLS and needs no policy;
--     for any other role they were an open door that only restrictive
--     policies happened to close.

BEGIN;

SELECT pg_advisory_xact_lock(
  hashtextextended('goap:portal-login-pair-backoff-and-grant-cleanup:v1', 0)
);

-- ---------------------------------------------------------------------------
-- 1. Sign-in reservation: backoff and lock per (email, address).
-- ---------------------------------------------------------------------------
-- The per-email counts below are served by client_portal_login_attempt_email_idx
-- (20260720000300).
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
  day_window_start TIMESTAMPTZ := now() - interval '24 hours';
  failure_window_start TIMESTAMPTZ;
  backoff_window_start TIMESTAMPTZ;
  last_clear_at TIMESTAMPTZ;
  recent_pair_failures BIGINT;
  recent_email_failures BIGINT;
  day_pair_failures BIGINT;
  day_email_failures BIGINT;
  last_pair_failure_at TIMESTAMPTZ;
  recent_ip_attempts BIGINT;
  required_gap INTERVAL;
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
  -- follows it (written by issue_client_portal_password_session in the same
  -- transaction that creates the session). A completed password reset also
  -- clears the slate.
  SELECT max(activity.created_at)
  INTO last_clear_at
  FROM public.client_portal_activity_log AS activity
  JOIN public.clients AS client ON client.id = activity.client_id
  WHERE activity.action IN ('password_login_success', 'password_reset_completed')
    AND activity.created_at >= day_window_start
    AND client.portal_access_enabled
    AND client.portal_email_normalized = normalized_email;

  failure_window_start := GREATEST(window_start, COALESCE(last_clear_at, window_start));
  backoff_window_start := GREATEST(day_window_start, COALESCE(last_clear_at, day_window_start));

  SELECT
    count(*) FILTER (WHERE activity.created_at > failure_window_start AND activity.ip_address = normalized_ip),
    count(*) FILTER (WHERE activity.created_at > failure_window_start),
    count(*) FILTER (WHERE activity.ip_address = normalized_ip),
    count(*),
    max(activity.created_at) FILTER (WHERE activity.ip_address = normalized_ip)
  INTO recent_pair_failures, recent_email_failures, day_pair_failures, day_email_failures, last_pair_failure_at
  FROM public.client_portal_activity_log AS activity
  WHERE activity.action = 'password_login_attempt'
    AND activity.created_at > backoff_window_start
    AND activity.metadata ->> 'email' = normalized_email;

  -- Per-IP volume across all emails: a single source cannot spray accounts.
  SELECT count(*)
  INTO recent_ip_attempts
  FROM public.client_portal_activity_log AS activity
  WHERE activity.action = 'password_login_attempt'
    AND activity.created_at >= window_start
    AND activity.ip_address = normalized_ip;

  IF recent_pair_failures >= 8
    OR recent_email_failures >= 40
    OR recent_ip_attempts >= 30
    OR day_email_failures >= 1000
  THEN
    RETURN false;
  END IF;

  -- Escalating backoff, and the lock, on this address's own failures for the
  -- email since it was last cleared. Another address's failures never add a
  -- wait here.
  IF day_pair_failures >= 100 THEN
    RETURN false;
  END IF;

  required_gap := CASE
    WHEN day_pair_failures >= 40 THEN interval '10 minutes'
    WHEN day_pair_failures >= 20 THEN interval '2 minutes'
    WHEN day_pair_failures >= 10 THEN interval '30 seconds'
    ELSE interval '0 seconds'
  END;

  IF required_gap > interval '0 seconds'
    AND last_pair_failure_at IS NOT NULL
    AND last_pair_failure_at > now() - required_gap
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
  'Service-role-only atomic password-login reservation. Per (email, IP): 8 failures in 15 minutes, a wait between attempts from the pair''s failures in the last 24 hours (30s from 10, 2m from 20, 10m from 40), locked from 100. Per email: 40 failures in 15 minutes and 1000 in 24 hours. Per IP: 30 attempts in 15 minutes. A successful sign-in or completed reset clears the email''s failures.';

-- ---------------------------------------------------------------------------
-- 2. Built-in EXECUTE default restored outside public (see header).
-- ---------------------------------------------------------------------------
DO $restore_function_defaults$
DECLARE
  target_schema TEXT;
BEGIN
  FOR target_schema IN
    SELECT n.nspname
    FROM pg_catalog.pg_namespace AS n
    WHERE n.nspname <> 'public'
      AND n.nspname <> 'information_schema'
      AND n.nspname NOT LIKE 'pg\_%'
      AND pg_catalog.has_schema_privilege(current_user, n.oid, 'CREATE')
    ORDER BY n.nspname
  LOOP
    EXECUTE pg_catalog.format(
      'ALTER DEFAULT PRIVILEGES IN SCHEMA %I GRANT EXECUTE ON FUNCTIONS TO PUBLIC',
      target_schema
    );
  END LOOP;
END;
$restore_function_defaults$;

-- ---------------------------------------------------------------------------
-- 3. SECURITY DEFINER allowlist, replacing 20261011000500's, and the sweep.
-- ---------------------------------------------------------------------------
DO $security_definer_grants$
DECLARE
  -- security-definer-allowlist:start
  allowlist CONSTANT TEXT[] := ARRAY[
    -- Called from the browser through supabase.rpc().
    'count_unique_cached_podcasts',
    'increment_post_views',
    -- Called by RLS policies, and granted to authenticated (and anon for
    -- is_platform_admin) by the migrations that created them.
    'can_access_client',
    'can_access_workspace',
    'can_manage_workspace',
    'current_auth_token_iat',
    'current_workspace_id',
    'is_platform_admin',
    'workspace_auth_credential_is_fresh'
  ];
  -- security-definer-allowlist:end
  target RECORD;
BEGIN
  FOR target IN
    SELECT p.oid::regprocedure AS signature
    FROM pg_catalog.pg_proc AS p
    JOIN pg_catalog.pg_namespace AS n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.prosecdef
      AND p.prokind IN ('f', 'p')
      AND NOT (p.proname = ANY (allowlist))
      AND pg_catalog.pg_has_role(current_user, p.proowner, 'USAGE')
      AND NOT EXISTS (
        SELECT 1
        FROM pg_catalog.pg_depend AS d
        WHERE d.refclassid = 'pg_catalog.pg_proc'::regclass
          AND d.refobjid = p.oid
          AND (
            d.deptype = 'e'
            OR d.classid IN (
              'pg_catalog.pg_policy'::regclass,
              'pg_catalog.pg_attrdef'::regclass,
              'pg_catalog.pg_constraint'::regclass,
              'pg_catalog.pg_rewrite'::regclass
            )
          )
      )
    ORDER BY 1::text
  LOOP
    EXECUTE pg_catalog.format(
      'REVOKE EXECUTE ON FUNCTION %s FROM PUBLIC, anon, authenticated',
      target.signature
    );
    EXECUTE pg_catalog.format(
      'GRANT EXECUTE ON FUNCTION %s TO service_role',
      target.signature
    );
  END LOOP;
END;
$security_definer_grants$;

-- Named explicitly as well, so the result does not depend on the sweep.
REVOKE ALL ON FUNCTION public.cleanup_expired_portal_data()
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.cleanup_expired_portal_data()
  TO service_role;
REVOKE ALL ON FUNCTION public.get_client_portal_stats()
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_client_portal_stats()
  TO service_role;

-- ---------------------------------------------------------------------------
-- 4. Primary-domain switch serialised per workspace.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.set_workspace_primary_domain_v1(p_domain_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  target_workspace_id UUID;
  target RECORD;
BEGIN
  IF p_domain_id IS NULL THEN
    RAISE EXCEPTION 'domain id is required' USING ERRCODE = '22023';
  END IF;

  SELECT domain.workspace_id
  INTO target_workspace_id
  FROM public.workspace_domains AS domain
  WHERE domain.id = p_domain_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'DOMAIN_NOT_FOUND' USING ERRCODE = 'P0002';
  END IF;

  -- The workspace row is the one lock every switch in this workspace takes,
  -- before any domain row, so concurrent switches run one after the other.
  PERFORM 1
  FROM public.workspaces AS workspace
  WHERE workspace.id = target_workspace_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'DOMAIN_NOT_FOUND' USING ERRCODE = 'P0002';
  END IF;

  -- Re-read under the lock: the domain may have been removed, moved or
  -- stopped serving while this call waited.
  SELECT domain.id, domain.workspace_id, domain.hostname, domain.status
  INTO target
  FROM public.workspace_domains AS domain
  WHERE domain.id = p_domain_id
    AND domain.workspace_id = target_workspace_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'DOMAIN_NOT_FOUND' USING ERRCODE = 'P0002';
  END IF;
  IF target.status <> 'active' THEN
    RAISE EXCEPTION 'DOMAIN_NOT_SERVING' USING ERRCODE = '22023';
  END IF;

  -- Clear first: the partial unique index allows one primary per workspace
  -- and is not deferrable, so setting before clearing would collide.
  UPDATE public.workspace_domains
  SET is_primary = false, updated_at = now()
  WHERE workspace_id = target.workspace_id
    AND is_primary
    AND id <> target.id;

  UPDATE public.workspace_domains
  SET is_primary = true, updated_at = now()
  WHERE id = target.id;

  RETURN jsonb_build_object(
    'id', target.id,
    'workspace_id', target.workspace_id,
    'hostname', target.hostname
  );
END;
$$;

REVOKE ALL ON FUNCTION public.set_workspace_primary_domain_v1(UUID)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.set_workspace_primary_domain_v1(UUID)
  TO service_role;

-- ---------------------------------------------------------------------------
-- 5. Client photos: signed-in reads for platform admins only.
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS client_assets_client_photos_authenticated_read ON storage.objects;
CREATE POLICY client_assets_client_photos_authenticated_read
  ON storage.objects FOR SELECT
  TO authenticated
  USING (
    bucket_id = 'client-assets'
    AND (storage.foldername(name))[1] = 'client-photos'
    AND public.is_platform_admin()
  );

-- ---------------------------------------------------------------------------
-- 6 and 7. Table grants the browser does not use.
-- ---------------------------------------------------------------------------
REVOKE ALL PRIVILEGES ON TABLE public.workspace_billing_profiles FROM anon, authenticated;
REVOKE ALL PRIVILEGES ON TABLE public.workspace_credit_lots FROM anon, authenticated;
REVOKE ALL PRIVILEGES ON TABLE public.client_notifications FROM anon, authenticated;
REVOKE ALL PRIVILEGES ON TABLE public.workspace_domains FROM anon, authenticated;
REVOKE ALL PRIVILEGES ON TABLE public.billing_plans FROM anon, authenticated;
REVOKE ALL PRIVILEGES ON TABLE public.workspace_access_requests FROM anon, authenticated;
GRANT SELECT, UPDATE, DELETE ON TABLE public.workspace_access_requests TO authenticated;

GRANT ALL PRIVILEGES ON TABLE public.workspace_billing_profiles TO service_role;
GRANT ALL PRIVILEGES ON TABLE public.workspace_credit_lots TO service_role;
GRANT ALL PRIVILEGES ON TABLE public.client_notifications TO service_role;
GRANT ALL PRIVILEGES ON TABLE public.workspace_domains TO service_role;
GRANT ALL PRIVILEGES ON TABLE public.billing_plans TO service_role;
GRANT ALL PRIVILEGES ON TABLE public.workspace_access_requests TO service_role;

-- ---------------------------------------------------------------------------
-- 8. Misleading open policies.
-- ---------------------------------------------------------------------------
-- client_search_history predates the migrations folder, so it may be absent
-- on a fresh replay.
DO $drop_open_policies$
BEGIN
  IF pg_catalog.to_regclass('public.client_search_history') IS NOT NULL THEN
    DROP POLICY IF EXISTS "Service role full access to search history"
      ON public.client_search_history;
  END IF;
END;
$drop_open_policies$;

DROP POLICY IF EXISTS "Service role full access on matching_experiments"
  ON public.matching_experiments;

NOTIFY pgrst, 'reload schema';

COMMIT;
