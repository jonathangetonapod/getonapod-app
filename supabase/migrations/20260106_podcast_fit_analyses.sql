-- replay-safety: 20250131_podcast_fit_analysis_cache.sql (which sorts first on a
-- fresh database) creates an earlier podcast_fit_analyses shape keyed by
-- booking_id that no code uses; analyze-podcast-fit reads and writes the
-- podcast_id/fit_reasons shape below. Drop that superseded shape only when it
-- lacks podcast_id, so the CREATE TABLE below takes effect. Production already
-- has the podcast_id shape, so this is a no-op there.
DO $replay$
BEGIN
  IF to_regclass('public.podcast_fit_analyses') IS NOT NULL
     AND NOT EXISTS (
       SELECT 1 FROM information_schema.columns
       WHERE table_schema = 'public'
         AND table_name = 'podcast_fit_analyses'
         AND column_name = 'podcast_id'
     ) THEN
    DROP TABLE public.podcast_fit_analyses;
  END IF;
END
$replay$;

-- Create table for caching AI-generated podcast fit analyses
CREATE TABLE IF NOT EXISTS podcast_fit_analyses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  podcast_id TEXT NOT NULL,
  client_id UUID NOT NULL REFERENCES clients(id) ON DELETE CASCADE,

  -- Enriched podcast info
  clean_description TEXT,

  -- Fit analysis
  fit_reasons JSONB DEFAULT '[]'::jsonb,

  -- Pitch angles
  pitch_angles JSONB DEFAULT '[]'::jsonb,

  -- Metadata
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),

  -- Unique constraint: one analysis per podcast per client
  UNIQUE(podcast_id, client_id)
);

-- Index for fast lookups
CREATE INDEX IF NOT EXISTS idx_podcast_fit_analyses_lookup
  ON podcast_fit_analyses(podcast_id, client_id);

CREATE INDEX IF NOT EXISTS idx_podcast_fit_analyses_client
  ON podcast_fit_analyses(client_id);

-- Enable RLS
ALTER TABLE podcast_fit_analyses ENABLE ROW LEVEL SECURITY;

-- Policy: Users can read analyses for their own client record
-- replay-safety: no migration ever adds clients.user_id, so on a fresh database
-- this policy cannot be created. Create it only when that column exists.
DO $replay$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'clients'
      AND column_name = 'user_id'
  ) THEN
    EXECUTE $policy$
      CREATE POLICY "Users can view their own podcast fit analyses"
        ON podcast_fit_analyses
        FOR SELECT
        USING (
          client_id IN (
            SELECT id FROM clients WHERE user_id = auth.uid()
          )
        )
    $policy$;
  END IF;
END
$replay$;

-- Policy: Service role can do everything (for edge functions)
CREATE POLICY "Service role has full access to podcast fit analyses"
  ON podcast_fit_analyses
  FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

-- Update trigger for updated_at
CREATE OR REPLACE FUNCTION update_podcast_fit_analyses_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_podcast_fit_analyses_updated_at
  BEFORE UPDATE ON podcast_fit_analyses
  FOR EACH ROW
  EXECUTE FUNCTION update_podcast_fit_analyses_updated_at();
