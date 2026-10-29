-- Preserve the old RPC while returning a durable identity to new mail callers.
BEGIN;
CREATE OR REPLACE FUNCTION public.record_clips_lead_with_receipt_v1(
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
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  inserted_id UUID;
  inserted_at TIMESTAMPTZ;
  recent_count INTEGER;
  repeat_count INTEGER;
  local_part TEXT;
  domain_part TEXT;
  normalized_key TEXT;
BEGIN
  IF p_source_ip_hash IS NULL OR btrim(p_source_ip_hash) = '' THEN
    RAISE EXCEPTION 'A source bucket is required';
  END IF;

  IF p_hourly_ceiling IS NULL OR p_hourly_ceiling < 1 THEN
    RAISE EXCEPTION 'A positive hourly ceiling is required';
  END IF;

  -- One inbox under every spelling: lower-cased, +tag dropped, and dots in the
  -- local part dropped where the provider ignores them.
  local_part := lower(split_part(p_email, '@', 1));
  domain_part := lower(split_part(p_email, '@', 2));
  local_part := regexp_replace(local_part, '\+.*$', '');
  IF domain_part IN ('gmail.com', 'googlemail.com') THEN
    local_part := replace(local_part, '.', '');
    domain_part := 'gmail.com';
  END IF;
  normalized_key := local_part || '@' || domain_part;

  -- Serializes every concurrent request from this address bucket, and from
  -- this inbox, for the rest of the transaction. Both locks are always taken
  -- in this order so two callers sharing either cannot deadlock. Released on
  -- commit or rollback, so a failure cannot leave a bucket wedged.
  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtext('clips_lead:' || p_source_ip_hash)
  );
  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtext('clips_lead_email:' || normalized_key)
  );

  SELECT count(*)
  INTO recent_count
  FROM public.clips_leads
  WHERE source_ip_hash = p_source_ip_hash
    AND created_at >= now() - INTERVAL '1 hour';

  IF recent_count >= p_hourly_ceiling THEN
    RETURN jsonb_build_object('outcome', 'rate_limited');
  END IF;

  SELECT count(*)
  INTO repeat_count
  FROM public.clips_leads
  WHERE email_key = normalized_key
    AND created_at >= now() - INTERVAL '24 hours';

  INSERT INTO public.clips_leads (
    name,
    email,
    email_key,
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
    normalized_key,
    p_show_url,
    p_utm_source,
    p_utm_medium,
    p_utm_campaign,
    p_referrer,
    p_landing_path,
    p_user_agent,
    p_source_ip_hash
  ) RETURNING id, created_at INTO inserted_id, inserted_at;

  IF repeat_count > 0 THEN
    RETURN jsonb_build_object('outcome', 'recorded_repeat', 'id', inserted_id, 'created_at', inserted_at);
  END IF;

  RETURN jsonb_build_object('outcome', 'recorded', 'id', inserted_id, 'created_at', inserted_at);
END;
$$;

REVOKE ALL ON FUNCTION public.record_clips_lead_with_receipt_v1(TEXT,TEXT,TEXT,TEXT,TEXT,TEXT,TEXT,TEXT,TEXT,TEXT,INTEGER) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.record_clips_lead_with_receipt_v1(TEXT,TEXT,TEXT,TEXT,TEXT,TEXT,TEXT,TEXT,TEXT,TEXT,INTEGER) TO service_role;
COMMIT;
