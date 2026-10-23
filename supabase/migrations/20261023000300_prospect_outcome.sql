-- What came of a prospect, kept apart from where their dashboard is.
--
-- Stage (draft, needs review, live) says how far the dashboard has got;
-- engagement says whether the prospect looked. Neither says whether the
-- operator booked a call or closed the deal, which is the point of sending
-- the dashboard at all. outcome records that, set by hand in Prospect
-- Studio, and outcome_at when it was last set.
--
-- sent_at already exists and was never written; Prospect Studio now sets it
-- when the private link is copied, so no column is added for that.

BEGIN;

SELECT pg_advisory_xact_lock(
  hashtextextended('goap:prospect-outcome:v1', 0)
);

ALTER TABLE public.prospect_dashboards
  ADD COLUMN IF NOT EXISTS outcome TEXT,
  ADD COLUMN IF NOT EXISTS outcome_at TIMESTAMPTZ;

ALTER TABLE public.prospect_dashboards
  DROP CONSTRAINT IF EXISTS prospect_dashboards_outcome_check;

-- An outcome always says when; no outcome has no time.
ALTER TABLE public.prospect_dashboards
  ADD CONSTRAINT prospect_dashboards_outcome_check CHECK (
    (outcome IS NULL AND outcome_at IS NULL)
    OR (outcome IN ('call_booked', 'won', 'lost') AND outcome_at IS NOT NULL)
  );

COMMENT ON COLUMN public.prospect_dashboards.outcome IS
  'Operator-recorded result of the prospect: call_booked, won or lost; null while open.';
COMMENT ON COLUMN public.prospect_dashboards.outcome_at IS
  'When the current outcome was recorded; null exactly when outcome is null.';
COMMENT ON COLUMN public.prospect_dashboards.sent_at IS
  'When the private link was last copied in Prospect Studio.';

NOTIFY pgrst, 'reload schema';

COMMIT;
