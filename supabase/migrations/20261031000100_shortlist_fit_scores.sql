-- Shortlist fit scores: how well each shortlisted show fits its client.
--
-- Scores were computed in the Finder and by autopilot and then thrown away;
-- the shortlist had nowhere to keep them. These columns hold the latest score
-- for one shortlist row. They are operator-only: every client-facing reader of
-- this table (portal, public client view, notifications) selects an explicit
-- column list that leaves them out.
--
-- - fit_score is on the 1-10 scale the Finder uses.
-- - fit_concerns are the reasons it may not be a fit, kept apart from the
--   reasoning so the editor can show them on their own.
-- - fit_source is 'ai' for a model judgement and 'estimate' for the keyword
--   fallback, which the editor labels as an estimate.
-- - fit_profile_hash fingerprints what the client profile said when the show
--   was scored (bio, guest brief, intake answers). A row whose hash differs
--   from the current one, or is null, was scored against an older profile.

ALTER TABLE public.client_dashboard_podcasts
  ADD COLUMN IF NOT EXISTS fit_score NUMERIC(3,1),
  ADD COLUMN IF NOT EXISTS fit_reasoning TEXT,
  ADD COLUMN IF NOT EXISTS fit_concerns TEXT[],
  ADD COLUMN IF NOT EXISTS fit_source TEXT,
  ADD COLUMN IF NOT EXISTS fit_scored_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS fit_profile_hash TEXT;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'client_dashboard_podcasts_fit_score_check'
      AND conrelid = 'public.client_dashboard_podcasts'::regclass
  ) THEN
    ALTER TABLE public.client_dashboard_podcasts
      ADD CONSTRAINT client_dashboard_podcasts_fit_score_check
      CHECK (fit_score IS NULL OR (fit_score >= 1 AND fit_score <= 10));
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'client_dashboard_podcasts_fit_source_check'
      AND conrelid = 'public.client_dashboard_podcasts'::regclass
  ) THEN
    ALTER TABLE public.client_dashboard_podcasts
      ADD CONSTRAINT client_dashboard_podcasts_fit_source_check
      CHECK (fit_source IS NULL OR fit_source IN ('ai', 'estimate'));
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'client_dashboard_podcasts_fit_scored_check'
      AND conrelid = 'public.client_dashboard_podcasts'::regclass
  ) THEN
    ALTER TABLE public.client_dashboard_podcasts
      ADD CONSTRAINT client_dashboard_podcasts_fit_scored_check
      CHECK ((fit_score IS NULL) = (fit_scored_at IS NULL) AND (fit_score IS NULL) = (fit_source IS NULL));
  END IF;
END;
$$;

COMMENT ON COLUMN public.client_dashboard_podcasts.fit_score IS
  'Latest 1-10 fit score for this show against its client. Operator-only.';
COMMENT ON COLUMN public.client_dashboard_podcasts.fit_profile_hash IS
  'Fingerprint of the client bio, guest brief and intake answers the score was made against; null when unknown.';
