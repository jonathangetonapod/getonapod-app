-- Podcast Database: judgments about each show from Jev (TypeSafe's System One
-- model), stored once per show so filters and ranking read columns instead of
-- calling a model.
--
-- Jev reads the show's name, publisher, host, categories and description and
-- answers fixed questions with probabilities:
--   jev_b2b_fit        0-4: how good a fit for booking a B2B guest (founder,
--                      executive, expert) who wants to reach decision-makers.
--                      0 none, 1 weak, 2 some, 3 good, 4 strong.
--   jev_takes_guests   0-1: probability the episodes regularly interview a
--                      guest. Podscan's podcast_has_guests flag misses about a
--                      sixth of interview shows and flags audiobooks as guest
--                      shows; this is the better signal where present.
--   jev_format         how episodes are usually made (see the check below).
--   jev_audience       probability per intended audience, e.g.
--                      {"founders": 0.92, "marketers": 0.31, ...}.
--   jev_audiences      the audiences at 0.5 or above, for indexed filtering;
--                      recomputable from jev_audience if the cutoff changes.
--   jev_junk           0-1: probability the feed is spam, piracy, a content
--                      farm, or an audiobook/radio re-upload rather than a show.
--   jev_model, jev_tagged_at: which model answered, and when.
-- All are null until a show is tagged.

ALTER TABLE public.podcasts
  ADD COLUMN IF NOT EXISTS jev_b2b_fit REAL,
  ADD COLUMN IF NOT EXISTS jev_takes_guests REAL,
  ADD COLUMN IF NOT EXISTS jev_format TEXT,
  ADD COLUMN IF NOT EXISTS jev_audience JSONB,
  ADD COLUMN IF NOT EXISTS jev_audiences TEXT[],
  ADD COLUMN IF NOT EXISTS jev_junk REAL,
  ADD COLUMN IF NOT EXISTS jev_model TEXT,
  ADD COLUMN IF NOT EXISTS jev_tagged_at TIMESTAMPTZ;

ALTER TABLE public.podcasts
  DROP CONSTRAINT IF EXISTS podcasts_jev_b2b_fit_range,
  ADD CONSTRAINT podcasts_jev_b2b_fit_range CHECK (jev_b2b_fit IS NULL OR jev_b2b_fit BETWEEN 0 AND 4),
  DROP CONSTRAINT IF EXISTS podcasts_jev_takes_guests_range,
  ADD CONSTRAINT podcasts_jev_takes_guests_range CHECK (jev_takes_guests IS NULL OR jev_takes_guests BETWEEN 0 AND 1),
  DROP CONSTRAINT IF EXISTS podcasts_jev_junk_range,
  ADD CONSTRAINT podcasts_jev_junk_range CHECK (jev_junk IS NULL OR jev_junk BETWEEN 0 AND 1),
  DROP CONSTRAINT IF EXISTS podcasts_jev_format_known,
  ADD CONSTRAINT podcasts_jev_format_known CHECK (
    jev_format IS NULL
    OR jev_format IN ('interview', 'panel', 'solo', 'cohosts', 'news', 'narrative', 'brand', 'other')
  ),
  DROP CONSTRAINT IF EXISTS podcasts_jev_audiences_known,
  ADD CONSTRAINT podcasts_jev_audiences_known CHECK (
    jev_audiences IS NULL
    OR jev_audiences <@ ARRAY[
      'founders', 'executives', 'marketers', 'sales', 'investors', 'technical', 'healthcare', 'consumers'
    ]::TEXT[]
  );

-- Audience filters match by overlap, like categories.
CREATE INDEX IF NOT EXISTS podcasts_jev_audiences_idx
  ON public.podcasts USING GIN (jev_audiences);
-- The backfill and each fill's new shows find untagged rows by this.
CREATE INDEX IF NOT EXISTS podcasts_jev_untagged_idx
  ON public.podcasts (id) WHERE jev_tagged_at IS NULL;

COMMENT ON COLUMN public.podcasts.jev_b2b_fit IS 'Jev: B2B guest fit, 0 (none) to 4 (strong)';
COMMENT ON COLUMN public.podcasts.jev_takes_guests IS 'Jev: probability the show regularly interviews guests';
COMMENT ON COLUMN public.podcasts.jev_audiences IS 'Jev: intended audiences at probability 0.5 or above';
COMMENT ON COLUMN public.podcasts.jev_junk IS 'Jev: probability the feed is junk rather than a real show';
