-- Replying to hosts is retired (2026-10-26): the app no longer drafts or sends
-- answers to host replies. Reply counts and campaign stats are unaffected.
--
-- Stops the two inbox crons, and moves every client off automatic drafting so
-- no stored setting can resume it. The tick functions also exit on their own
-- kill switches, so this is belt and braces rather than the only guard.

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'inbox-enroll-tick') THEN
      PERFORM cron.unschedule('inbox-enroll-tick');
    END IF;
    IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'inbox-nudge-tick') THEN
      PERFORM cron.unschedule('inbox-nudge-tick');
    END IF;
  END IF;
END
$$;

UPDATE public.clients
SET ai_sdr_mode = 'manual'
WHERE ai_sdr_mode IS DISTINCT FROM 'manual';
