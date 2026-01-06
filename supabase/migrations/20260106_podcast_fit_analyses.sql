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
CREATE POLICY "Users can view their own podcast fit analyses"
  ON podcast_fit_analyses
  FOR SELECT
  USING (
    client_id IN (
      SELECT id FROM clients WHERE user_id = auth.uid()
    )
  );

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
