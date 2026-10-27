-- podcast_email_verification_due, fast enough for the API's statement timeout.
--
-- The first version split every catalogue email field with a regex and
-- de-duplicated all ~92K addresses before looking anything up: about 8.4s at
-- 110K shows, past PostgREST's 8s limit, so the tick never got a due list.
-- Most fields hold one address and need no split; only fields with a
-- separator are split. Each address is checked against the verifications
-- primary key before de-duplication, and stale results come straight off the
-- checked_at index. About 1.5s at 110K shows.

CREATE OR REPLACE FUNCTION public.podcast_email_verification_due(p_limit INTEGER DEFAULT 300)
RETURNS TABLE (normalized_email TEXT)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
  WITH listed AS (
    SELECT lower(btrim(podcast.podscan_email)) AS email
    FROM public.podcasts podcast
    WHERE podcast.podscan_email IS NOT NULL
      AND podcast.podscan_email !~ '[,;[:space:]]'
    UNION ALL
    SELECT lower(btrim(part))
    FROM public.podcasts podcast
    CROSS JOIN LATERAL regexp_split_to_table(podcast.podscan_email, '[,;[:space:]]+') AS part
    WHERE podcast.podscan_email ~ '[,;[:space:]]'
  ),
  never_checked AS (
    SELECT DISTINCT listed.email
    FROM listed
    WHERE listed.email ~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'
      AND NOT EXISTS (
        SELECT 1 FROM public.podcast_email_verifications verification
        WHERE verification.normalized_email = listed.email
      )
  ),
  stale AS (
    SELECT verification.normalized_email AS email, verification.checked_at
    FROM public.podcast_email_verifications verification
    WHERE verification.checked_at < NOW() - INTERVAL '90 days'
      OR (verification.status = 'error' AND verification.checked_at < NOW() - INTERVAL '1 day')
    ORDER BY verification.checked_at
    LIMIT LEAST(GREATEST(COALESCE(p_limit, 300), 1), 1000)
  ),
  candidates AS (
    SELECT never_checked.email, NULL::TIMESTAMPTZ AS checked_at FROM never_checked
    UNION ALL
    SELECT stale.email, stale.checked_at FROM stale
  )
  SELECT candidates.email
  FROM candidates
  ORDER BY candidates.checked_at ASC NULLS FIRST, candidates.email
  LIMIT LEAST(GREATEST(COALESCE(p_limit, 300), 1), 1000);
$$;

REVOKE ALL ON FUNCTION public.podcast_email_verification_due(INTEGER)
  FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.podcast_email_verification_due(INTEGER) TO service_role;
