-- Ongoing email verification for the shared podcast catalogue.
--
-- The one-off MillionVerifier bulk run (scripts/verify-podcast-emails.mjs)
-- checked every address the catalogue held on 2026-10-27. Shows keep arriving
-- (the Podscan fill adds thousands a day) and inboxes go bad, so
-- podcast-email-verify-tick runs every 10 minutes and checks what this
-- function says is due: addresses no show has had checked yet first, then
-- results older than 90 days (an 'error' result after 1 day), oldest first.
-- The tick only upserts podcast_email_verifications; contacts re-pick from
-- those rows on their own.
--
-- Provision once (the job does nothing until both exist):
--   select vault.create_secret('<function url>', 'email_verify_url');
--   select vault.create_secret('<secret>',       'email_verify_secret');
-- and set the same secret as the EMAIL_VERIFY_SECRET edge function env var,
-- plus MILLIONVERIFIER_API_KEY.

CREATE OR REPLACE FUNCTION public.podcast_email_verification_due(p_limit INTEGER DEFAULT 300)
RETURNS TABLE (normalized_email TEXT)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
  WITH listed AS (
    SELECT DISTINCT lower(btrim(part)) AS email
    FROM public.podcasts podcast
    CROSS JOIN LATERAL regexp_split_to_table(podcast.podscan_email, '[,;[:space:]]+') AS part
    WHERE podcast.podscan_email IS NOT NULL
  ),
  candidates AS (
    SELECT listed.email, verification.checked_at
    FROM listed
    LEFT JOIN public.podcast_email_verifications verification
      ON verification.normalized_email = listed.email
    WHERE listed.email ~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'
      AND (
        verification.normalized_email IS NULL
        OR (verification.status = 'error' AND verification.checked_at < NOW() - INTERVAL '1 day')
        OR verification.checked_at < NOW() - INTERVAL '90 days'
      )
  )
  SELECT candidates.email
  FROM candidates
  ORDER BY candidates.checked_at ASC NULLS FIRST, candidates.email
  LIMIT LEAST(GREATEST(COALESCE(p_limit, 300), 1), 1000);
$$;

REVOKE ALL ON FUNCTION public.podcast_email_verification_due(INTEGER)
  FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.podcast_email_verification_due(INTEGER) TO service_role;

COMMENT ON FUNCTION public.podcast_email_verification_due(INTEGER) IS
  'Service-only: catalogue inbox addresses due a MillionVerifier check, never-checked first, then results older than 90 days (errors after 1 day).';

CREATE EXTENSION IF NOT EXISTS pg_cron;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'podcast-email-verify-tick') THEN
    PERFORM cron.unschedule('podcast-email-verify-tick');
  END IF;
  PERFORM cron.schedule(
    'podcast-email-verify-tick',
    '*/10 * * * *',
    $job$
    SELECT net.http_post(
      url := (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'email_verify_url'),
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'x-email-verify-secret', (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'email_verify_secret')
      ),
      body := '{}'::jsonb,
      timeout_milliseconds := 150000
    )
    -- Both secrets or nothing: a job firing at a null URL looks scheduled
    -- while doing nothing.
    WHERE EXISTS (
      SELECT 1 FROM vault.decrypted_secrets
      WHERE name IN ('email_verify_url', 'email_verify_secret')
      HAVING count(*) = 2
    );
    $job$
  );
END;
$$;
