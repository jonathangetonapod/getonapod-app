-- Email verification runs on request, not on a schedule.
--
-- The catalogue's addresses were checked in full on 2026-10-27, and the owner
-- wants verification as a one-off backfill rather than a standing job. The
-- every-10-minutes podcast-email-verify-tick job is removed. The function and
-- podcast_email_verification_due stay, so a run can still be started by hand
-- (POST with the x-email-verify-secret header), and
-- scripts/verify-podcast-emails.mjs remains the way to backfill in bulk.

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'podcast-email-verify-tick') THEN
    PERFORM cron.unschedule('podcast-email-verify-tick');
  END IF;
END;
$$;
