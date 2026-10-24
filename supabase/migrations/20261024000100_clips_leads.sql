-- Leads from getonapod.com/clips: a host pastes a YouTube link and asks for
-- the free cut. There is no account, no workspace and no session behind the
-- request, so the row is written by the clips-lead edge function with the
-- service role and read by platform admins only.
--
-- Same shape as workspace_access_requests: a public, unauthenticated form whose
-- only anti-flood control is a per-address ceiling, so counting and inserting
-- happen inside one function behind a per-bucket transaction lock. Two round
-- trips would let simultaneous callers all read the same under-ceiling count
-- and all get in.

BEGIN;

CREATE TABLE IF NOT EXISTS public.clips_leads (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  email TEXT NOT NULL,
  show_url TEXT NOT NULL,
  utm_source TEXT,
  utm_medium TEXT,
  utm_campaign TEXT,
  referrer TEXT,
  landing_path TEXT,
  user_agent TEXT,
  status TEXT NOT NULL DEFAULT 'new',
  handled_at TIMESTAMPTZ,
  handled_note TEXT,
  source_ip_hash TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  -- The states an editor can move a lead through. Anything not listed is a
  -- status nothing writes and nobody can clear.
  CONSTRAINT clips_leads_status_check
    CHECK (status IN ('new', 'cutting', 'delivered', 'converted', 'declined')),
  CONSTRAINT clips_leads_email_check
    CHECK (email = lower(email) AND email LIKE '%@%.%'),
  -- The page only accepts YouTube links and so does the function; the column
  -- agrees, so a row can never point at a host we cannot pull from.
  CONSTRAINT clips_leads_show_url_check
    CHECK (show_url ~* '^https://([a-z0-9-]+\.)*(youtube\.com|youtu\.be)/')
);

COMMENT ON TABLE public.clips_leads IS
  'Free-cut requests from getonapod.com/clips. Written by the clips-lead edge function; read by platform admins.';
COMMENT ON COLUMN public.clips_leads.source_ip_hash IS
  'Salted hash of the submitting IP, used only to rate-limit repeat submissions. Never the address itself.';

CREATE INDEX IF NOT EXISTS clips_leads_status_created_idx
  ON public.clips_leads (status, created_at DESC);

CREATE INDEX IF NOT EXISTS clips_leads_ip_recent_idx
  ON public.clips_leads (source_ip_hash, created_at DESC)
  WHERE source_ip_hash IS NOT NULL;

ALTER TABLE public.clips_leads ENABLE ROW LEVEL SECURITY;

-- No tenant owns a lead: it arrives before anyone is a client. Platform admins
-- read and update; the service role writes; the submitter has no session.
DROP POLICY IF EXISTS clips_leads_admin_read ON public.clips_leads;
CREATE POLICY clips_leads_admin_read
  ON public.clips_leads
  FOR SELECT
  TO authenticated
  USING (public.is_platform_admin());

DROP POLICY IF EXISTS clips_leads_admin_write ON public.clips_leads;
CREATE POLICY clips_leads_admin_write
  ON public.clips_leads
  FOR UPDATE
  TO authenticated
  USING (public.is_platform_admin())
  WITH CHECK (public.is_platform_admin());

-- Personal data somebody volunteered needs a way out of the table.
DROP POLICY IF EXISTS clips_leads_admin_delete ON public.clips_leads;
CREATE POLICY clips_leads_admin_delete
  ON public.clips_leads
  FOR DELETE
  TO authenticated
  USING (public.is_platform_admin());

CREATE OR REPLACE FUNCTION public.touch_clips_lead()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS clips_leads_touch ON public.clips_leads;
CREATE TRIGGER clips_leads_touch
  BEFORE UPDATE ON public.clips_leads
  FOR EACH ROW EXECUTE FUNCTION public.touch_clips_lead();

-- Count recent leads from one bucket and insert the new one under a single
-- advisory lock. Returns 'recorded' or 'rate_limited'.
CREATE OR REPLACE FUNCTION public.record_clips_lead(
  p_name TEXT,
  p_email TEXT,
  p_show_url TEXT,
  p_utm_source TEXT,
  p_utm_medium TEXT,
  p_utm_campaign TEXT,
  p_referrer TEXT,
  p_landing_path TEXT,
  p_user_agent TEXT,
  p_source_ip_hash TEXT,
  p_hourly_ceiling INTEGER
)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  recent_count INTEGER;
BEGIN
  IF p_source_ip_hash IS NULL OR btrim(p_source_ip_hash) = '' THEN
    RAISE EXCEPTION 'A source bucket is required';
  END IF;

  IF p_hourly_ceiling IS NULL OR p_hourly_ceiling < 1 THEN
    RAISE EXCEPTION 'A positive hourly ceiling is required';
  END IF;

  -- Serializes every concurrent request from this bucket for the rest of the
  -- transaction. Released on commit or rollback, so a failure cannot leave a
  -- bucket wedged.
  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtext('clips_lead:' || p_source_ip_hash)
  );

  SELECT count(*)
  INTO recent_count
  FROM public.clips_leads
  WHERE source_ip_hash = p_source_ip_hash
    AND created_at >= now() - INTERVAL '1 hour';

  IF recent_count >= p_hourly_ceiling THEN
    RETURN 'rate_limited';
  END IF;

  INSERT INTO public.clips_leads (
    name,
    email,
    show_url,
    utm_source,
    utm_medium,
    utm_campaign,
    referrer,
    landing_path,
    user_agent,
    source_ip_hash
  )
  VALUES (
    p_name,
    p_email,
    p_show_url,
    p_utm_source,
    p_utm_medium,
    p_utm_campaign,
    p_referrer,
    p_landing_path,
    p_user_agent,
    p_source_ip_hash
  );

  RETURN 'recorded';
END;
$$;

REVOKE ALL ON FUNCTION public.record_clips_lead(
  TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, INTEGER
) FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.record_clips_lead(
  TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, INTEGER
) TO service_role;

COMMENT ON FUNCTION public.record_clips_lead(
  TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, INTEGER
) IS
  'Service-only atomic /clips lead intake: per-bucket hourly ceiling and insert under one advisory lock.';

COMMIT;
