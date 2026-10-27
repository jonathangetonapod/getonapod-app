-- The email verification tick gets its due list from the cron job.
--
-- Through the API, podcast_email_verification_due runs under PostgREST's 8s
-- statement timeout. It takes about 1.5s on a quiet database, but at :00,
-- when several other jobs fire, it was cancelled and the tick did nothing. The
-- job now computes the list in the database, where that timeout does not
-- apply, and sends it in the request body; the tick validates it and only
-- falls back to asking when called without one. The schedule moves to 7, 17,
-- 27... past the hour, away from the jobs that run on the hour and half hour.

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'podcast-email-verify-tick') THEN
    PERFORM cron.unschedule('podcast-email-verify-tick');
  END IF;
  PERFORM cron.schedule(
    'podcast-email-verify-tick',
    '7-59/10 * * * *',
    $job$
    SELECT net.http_post(
      url := (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'email_verify_url'),
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'x-email-verify-secret', (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'email_verify_secret')
      ),
      body := jsonb_build_object(
        'emails',
        COALESCE((SELECT jsonb_agg(due.normalized_email) FROM public.podcast_email_verification_due(300) AS due), '[]'::jsonb)
      ),
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
