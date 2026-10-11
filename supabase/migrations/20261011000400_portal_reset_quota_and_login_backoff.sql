-- Client portal: reset quotas that do not depend on a match, and escalating
-- sign-in backoff.
--
--  1. Self-serve reset requests reserved one quota row per request, keyed by
--     the typed email, before the account lookup. Every request counted
--     toward the per-email quota whether or not the address had an account,
--     and the address typed was stored either way. portal-password-reset now
--     answers before it looks the email up (the lookup, token and send run
--     after the response), so the reservation is split in two:
--       reserve_client_portal_reset_ip_v1     10 requests per address per
--                                             hour, taken before anything
--                                             depends on the email; it
--                                             stores no email.
--       reserve_client_portal_reset_email_v1  3 sends per client per hour,
--                                             taken only for a matching,
--                                             portal-enabled client.
--     reserve_client_portal_reset_request_v1 (20260726000200) stays defined
--     for an edge deployment that still calls it during rollout.
--
--  2. Portal sign-in limited unsuccessful attempts to 8 per (email, IP) and
--     40 per email in 15 minutes (20261008000100). An attacker spreading
--     guesses across addresses and windows could keep trying for as long as
--     they liked. The per-email failure count since the last successful
--     sign-in (or completed reset) over the last 24 hours now also escalates
--     a wait between attempts: 30 seconds from 10 failures, 2 minutes from
--     20, 10 minutes from 40, and from 100 the email is locked until a
--     successful reset or until the failures age out of the 24-hour window.
--     The existing 15-minute ceilings are unchanged.

BEGIN;

SELECT pg_advisory_xact_lock(
  hashtextextended('goap:portal-reset-quota-and-login-backoff:v1', 0)
);

-- Lookups below filter the activity log by action and time, then by email or
-- client. The existing single-column indexes cover action and created_at
-- separately; this one serves both reservations directly.
CREATE INDEX IF NOT EXISTS client_portal_activity_log_action_created_idx
  ON public.client_portal_activity_log (action, created_at DESC);

-- ---------------------------------------------------------------------------
-- 1a. Per-address reset quota, taken before the email is looked up.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.reserve_client_portal_reset_ip_v1(
  p_ip_address TEXT,
  p_user_agent TEXT
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  normalized_ip TEXT := COALESCE(NULLIF(btrim(p_ip_address), ''), 'unknown');
  recent_ip_requests BIGINT;
BEGIN
  IF char_length(normalized_ip) > 120
    OR char_length(COALESCE(p_user_agent, '')) > 1024
  THEN
    RAISE EXCEPTION 'invalid portal reset request parameters'
      USING ERRCODE = '22023';
  END IF;

  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('portal-reset-ip:' || normalized_ip, 0)
  );

  SELECT count(*)
  INTO recent_ip_requests
  FROM public.client_portal_activity_log AS activity
  WHERE activity.action = 'password_reset_request'
    AND activity.created_at >= now() - interval '1 hour'
    AND activity.ip_address = normalized_ip;

  IF recent_ip_requests >= 10 THEN
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
    'password_reset_request',
    '{}'::jsonb,
    normalized_ip,
    NULLIF(p_user_agent, '')
  );

  RETURN true;
END;
$$;

-- ---------------------------------------------------------------------------
-- 1b. Per-client send quota, taken only for a matching account.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.reserve_client_portal_reset_email_v1(
  p_client_id UUID,
  p_email_normalized TEXT,
  p_ip_address TEXT
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  normalized_email TEXT := lower(btrim(COALESCE(p_email_normalized, '')));
  normalized_ip TEXT := COALESCE(NULLIF(btrim(p_ip_address), ''), 'unknown');
  recent_client_sends BIGINT;
BEGIN
  IF p_client_id IS NULL
    OR char_length(normalized_email) NOT BETWEEN 3 AND 254
    OR normalized_email IS DISTINCT FROM p_email_normalized
    OR char_length(normalized_ip) > 120
  THEN
    RAISE EXCEPTION 'invalid portal reset request parameters'
      USING ERRCODE = '22023';
  END IF;

  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('portal-reset-email:' || normalized_email, 0)
  );

  -- Only a portal-enabled client whose sign-in email is this address can
  -- reserve, so the quota can never be charged to someone else's account.
  IF NOT EXISTS (
    SELECT 1
    FROM public.clients AS client
    WHERE client.id = p_client_id
      AND client.portal_access_enabled
      AND client.portal_email_normalized = normalized_email
  ) THEN
    RETURN false;
  END IF;

  SELECT count(*)
  INTO recent_client_sends
  FROM public.client_portal_activity_log AS activity
  WHERE activity.action = 'password_reset_email_reserved'
    AND activity.created_at >= now() - interval '1 hour'
    AND activity.client_id = p_client_id;

  IF recent_client_sends >= 3 THEN
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
    p_client_id,
    NULL,
    'password_reset_email_reserved',
    '{}'::jsonb,
    normalized_ip,
    NULL
  );

  RETURN true;
END;
$$;

REVOKE ALL ON FUNCTION public.reserve_client_portal_reset_ip_v1(TEXT, TEXT)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.reserve_client_portal_reset_ip_v1(TEXT, TEXT)
  TO service_role;
REVOKE ALL ON FUNCTION public.reserve_client_portal_reset_email_v1(UUID, TEXT, TEXT)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.reserve_client_portal_reset_email_v1(UUID, TEXT, TEXT)
  TO service_role;

COMMENT ON FUNCTION public.reserve_client_portal_reset_ip_v1(TEXT, TEXT) IS
  'Service-role-only per-address limit for portal reset requests (10/hour), taken before the email is looked up; stores no email.';
COMMENT ON FUNCTION public.reserve_client_portal_reset_email_v1(UUID, TEXT, TEXT) IS
  'Service-role-only per-client limit for portal reset emails (3/hour), reserved only for a matching portal-enabled client.';

-- ---------------------------------------------------------------------------
-- 2. Sign-in reservation with escalating per-email backoff.
-- ---------------------------------------------------------------------------
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
  recent_ip_attempts BIGINT;
  day_email_failures BIGINT;
  last_email_failure_at TIMESTAMPTZ;
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
  -- clears the slate, so a client locked out by someone else's guesses gets
  -- back in by resetting.
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
    count(*),
    max(activity.created_at)
  INTO recent_pair_failures, recent_email_failures, day_email_failures, last_email_failure_at
  FROM public.client_portal_activity_log AS activity
  WHERE activity.action = 'password_login_attempt'
    AND activity.created_at > backoff_window_start
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

  -- Escalating backoff on the email's failures since it was last cleared.
  IF day_email_failures >= 100 THEN
    RETURN false;
  END IF;

  required_gap := CASE
    WHEN day_email_failures >= 40 THEN interval '10 minutes'
    WHEN day_email_failures >= 20 THEN interval '2 minutes'
    WHEN day_email_failures >= 10 THEN interval '30 seconds'
    ELSE interval '0 seconds'
  END;

  IF required_gap > interval '0 seconds'
    AND last_email_failure_at IS NOT NULL
    AND last_email_failure_at > now() - required_gap
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
  'Service-role-only atomic password-login reservation. Unsuccessful attempts are limited to 8 per (email, IP) and 40 per email in 15 minutes, all attempts to 30 per IP; the email''s failures in the last 24 hours escalate a wait between attempts (30s from 10, 2m from 20, 10m from 40) and lock it from 100. A successful sign-in or completed reset clears the email''s failures.';

NOTIFY pgrst, 'reload schema';

COMMIT;
