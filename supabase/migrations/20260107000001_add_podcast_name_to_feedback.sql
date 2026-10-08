-- replay-safety: this file sorts before 20260107000006_prospect_podcast_feedback.sql,
-- which creates the table. Create it here with the exact 20260107000006
-- definition so a fresh database can replay. Production already has the table.
CREATE TABLE IF NOT EXISTS prospect_podcast_feedback (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  prospect_dashboard_id UUID NOT NULL REFERENCES prospect_dashboards(id) ON DELETE CASCADE,
  podcast_id TEXT NOT NULL, -- Podscan podcast ID
  status TEXT CHECK (status IN ('approved', 'rejected')), -- null means not reviewed
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),

  -- Each prospect can only have one feedback entry per podcast
  UNIQUE(prospect_dashboard_id, podcast_id)
);

-- Add podcast_name column to prospect_podcast_feedback table
ALTER TABLE prospect_podcast_feedback ADD COLUMN IF NOT EXISTS podcast_name TEXT;

-- Add comment
COMMENT ON COLUMN prospect_podcast_feedback.podcast_name IS 'Cached podcast name for display purposes';
