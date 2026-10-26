-- Scheduled refresh of the shared podcast catalogue.
--
-- Nothing refreshed a catalogue row on a schedule. A show was re-read from
-- Podscan only when another flow happened to fetch it, so by late October
-- 2026 more than half the catalogue had last been checked in January, and the
-- Podcast Database's "Still publishing" filter (which needs a recent episode)
-- was losing shows that were still recording.
--
-- podcast-catalog-refresh-tick runs hourly and refreshes what this function
-- says is due: shows on a client or prospect shortlist after 7 days, every
-- other show after 30, oldest first, shortlisted shows ahead of the rest. The
-- function's CATALOG_REFRESH_BATCH env var (default 55 a tick, about 1,320
-- Podscan lookups a day, 40K a month) is the budget; at 31K shows, about 2,500
-- of them shortlisted, that keeps both cycles. The backlog when this was
-- written (8,600 shows due) clears in about a week.
--
-- catalog_refresh_attempted_at records every try, successful or not, so a
-- show Podscan keeps failing on goes to the back of the queue instead of
-- holding the front of it.
--
-- Provision once (the job does nothing until both exist):
--   select vault.create_secret('<function url>', 'catalog_refresh_url');
--   select vault.create_secret('<secret>',       'catalog_refresh_secret');
-- and set the same secret as the CATALOG_REFRESH_SECRET edge function env var.

ALTER TABLE public.podcasts
  ADD COLUMN IF NOT EXISTS catalog_refresh_attempted_at TIMESTAMPTZ;

COMMENT ON COLUMN public.podcasts.catalog_refresh_attempted_at IS
  'When the scheduled catalogue refresh last tried this show, whether or not Podscan answered.';

CREATE OR REPLACE FUNCTION public.podcast_catalog_refresh_due(p_limit INTEGER DEFAULT 55)
RETURNS TABLE (podscan_id TEXT)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
  WITH shortlisted AS (
    SELECT shortlist.podcast_id FROM public.client_dashboard_podcasts shortlist
    UNION
    SELECT shortlist.podcast_id FROM public.prospect_dashboard_podcasts shortlist
  ),
  candidates AS (
    SELECT
      podcast.podscan_id,
      shortlisted.podcast_id IS NOT NULL AS on_shortlist,
      GREATEST(
        COALESCE(podcast.podscan_last_fetched_at, '-infinity'::TIMESTAMPTZ),
        COALESCE(podcast.catalog_refresh_attempted_at, '-infinity'::TIMESTAMPTZ)
      ) AS last_touched
    FROM public.podcasts podcast
    LEFT JOIN shortlisted ON shortlisted.podcast_id = podcast.podscan_id
    WHERE NULLIF(btrim(podcast.podscan_id), '') IS NOT NULL
  )
  SELECT candidates.podscan_id
  FROM candidates
  WHERE candidates.last_touched < NOW() - CASE
    WHEN candidates.on_shortlist THEN INTERVAL '7 days'
    ELSE INTERVAL '30 days'
  END
  ORDER BY candidates.on_shortlist DESC, candidates.last_touched ASC
  LIMIT LEAST(GREATEST(COALESCE(p_limit, 55), 1), 100);
$$;

REVOKE ALL ON FUNCTION public.podcast_catalog_refresh_due(INTEGER)
  FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.podcast_catalog_refresh_due(INTEGER) TO service_role;

COMMENT ON FUNCTION public.podcast_catalog_refresh_due(INTEGER) IS
  'Service-only: the catalogue shows due a Podscan refresh, shortlisted after 7 days and the rest after 30, oldest first.';

CREATE EXTENSION IF NOT EXISTS pg_cron;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'podcast-catalog-refresh-tick') THEN
    PERFORM cron.unschedule('podcast-catalog-refresh-tick');
  END IF;
  PERFORM cron.schedule(
    'podcast-catalog-refresh-tick',
    '23 * * * *',
    $job$
    SELECT net.http_post(
      url := (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'catalog_refresh_url'),
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'x-catalog-refresh-secret', (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'catalog_refresh_secret')
      ),
      body := '{}'::jsonb,
      timeout_milliseconds := 150000
    )
    -- Both secrets or nothing: a job firing at a null URL every hour looks
    -- scheduled while doing nothing.
    WHERE EXISTS (
      SELECT 1 FROM vault.decrypted_secrets
      WHERE name IN ('catalog_refresh_url', 'catalog_refresh_secret')
      HAVING count(*) = 2
    );
    $job$
  );
END;
$$;
