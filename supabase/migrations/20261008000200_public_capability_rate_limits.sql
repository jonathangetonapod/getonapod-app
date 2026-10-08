-- Throttle the public capability pages.
--
-- /client/:slug and /prospect/:slug take writes from anyone holding the link,
-- with no account behind them. Nothing limited how fast those writes could
-- arrive, and every page load of a client dashboard added one to its view
-- count, so a reload loop could make a dashboard look heavily read.
--
-- This is the same shape as the access-request and portal-login limits: count
-- recent events per bucket and insert behind a per-bucket transaction lock, so
-- concurrent callers queue instead of racing past the ceiling. It is generic
-- (one row per event, keyed by an opaque bucket string) so any public endpoint
-- can share it. Buckets are built by the edge function from record ids and a
-- salted hash of the caller address; no slug or raw address is stored.

BEGIN;

SELECT pg_advisory_xact_lock(
  hashtextextended('goap:public-capability-rate-limits:v1', 0)
);

CREATE TABLE IF NOT EXISTS public.public_capability_rate_events (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  bucket TEXT NOT NULL CHECK (char_length(bucket) BETWEEN 1 AND 200),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS public_capability_rate_events_bucket_created_idx
  ON public.public_capability_rate_events (bucket, created_at DESC);

CREATE INDEX IF NOT EXISTS public_capability_rate_events_created_idx
  ON public.public_capability_rate_events (created_at);

-- Service role only. RLS on with no policies: browser roles see nothing.
ALTER TABLE public.public_capability_rate_events ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.public_capability_rate_events FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, DELETE ON TABLE public.public_capability_rate_events TO service_role;

-- Reserve one event in every bucket, or in none.
--
-- p_buckets, p_limits and p_window_seconds are parallel arrays. Returns true
-- when every bucket was under its limit (and records one event in each), false
-- when any bucket was at its limit (and records nothing). Locks are taken in
-- sorted bucket order so two callers sharing buckets cannot deadlock.
CREATE OR REPLACE FUNCTION public.reserve_public_capability_rate_v1(
  p_buckets TEXT[],
  p_limits INTEGER[],
  p_window_seconds INTEGER[]
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  bucket_count INTEGER := COALESCE(array_length(p_buckets, 1), 0);
  idx INTEGER;
  locked_bucket TEXT;
  recent_count BIGINT;
BEGIN
  IF bucket_count < 1
    OR bucket_count > 4
    OR COALESCE(array_length(p_limits, 1), 0) <> bucket_count
    OR COALESCE(array_length(p_window_seconds, 1), 0) <> bucket_count
  THEN
    RAISE EXCEPTION 'invalid public rate limit parameters'
      USING ERRCODE = '22023';
  END IF;

  FOR idx IN 1..bucket_count LOOP
    IF p_buckets[idx] IS NULL
      OR char_length(p_buckets[idx]) NOT BETWEEN 1 AND 200
      OR p_limits[idx] IS NULL OR p_limits[idx] < 1
      OR p_window_seconds[idx] IS NULL
      OR p_window_seconds[idx] NOT BETWEEN 1 AND 86400
    THEN
      RAISE EXCEPTION 'invalid public rate limit parameters'
        USING ERRCODE = '22023';
    END IF;
  END LOOP;

  FOR locked_bucket IN
    SELECT DISTINCT bucket FROM unnest(p_buckets) AS bucket ORDER BY bucket
  LOOP
    PERFORM pg_catalog.pg_advisory_xact_lock(
      pg_catalog.hashtextextended('public-capability-rate:' || locked_bucket, 0)
    );
  END LOOP;

  FOR idx IN 1..bucket_count LOOP
    SELECT count(*)
    INTO recent_count
    FROM public.public_capability_rate_events AS event
    WHERE event.bucket = p_buckets[idx]
      AND event.created_at >= now() - make_interval(secs => p_window_seconds[idx]);

    IF recent_count >= p_limits[idx] THEN
      RETURN false;
    END IF;
  END LOOP;

  INSERT INTO public.public_capability_rate_events (bucket)
  SELECT DISTINCT bucket FROM unnest(p_buckets) AS bucket;

  -- Every window is at most a day, so anything older is dead weight. Prune a
  -- slice now and then rather than on every call.
  IF random() < 0.02 THEN
    DELETE FROM public.public_capability_rate_events AS event
    WHERE event.id IN (
      SELECT stale.id
      FROM public.public_capability_rate_events AS stale
      WHERE stale.created_at < now() - INTERVAL '1 day'
      LIMIT 5000
    );
  END IF;

  RETURN true;
END;
$$;

REVOKE ALL ON FUNCTION public.reserve_public_capability_rate_v1(TEXT[], INTEGER[], INTEGER[])
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.reserve_public_capability_rate_v1(TEXT[], INTEGER[], INTEGER[])
  TO service_role;

COMMENT ON TABLE public.public_capability_rate_events IS
  'Service-only event log for throttling public capability-URL endpoints. Buckets hold record ids and salted address hashes, never slugs or raw addresses.';
COMMENT ON FUNCTION public.reserve_public_capability_rate_v1(TEXT[], INTEGER[], INTEGER[]) IS
  'Service-role-only all-or-nothing rate-limit reservation across up to four buckets, serialized per bucket by advisory locks.';

NOTIFY pgrst, 'reload schema';

COMMIT;
