-- replay-safety: this file sorts before 20260107000005_prospect_dashboards.sql
-- (its date prefix is a year off), so on a fresh database the table does not
-- exist yet. Create it here with the exact 20260107000005 definition; the later
-- CREATE TABLE IF NOT EXISTS is then a no-op. Production already has the table.
CREATE TABLE IF NOT EXISTS prospect_dashboards (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  slug TEXT UNIQUE NOT NULL,
  prospect_name TEXT NOT NULL,
  prospect_bio TEXT,
  spreadsheet_id TEXT NOT NULL,
  spreadsheet_url TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  created_by UUID REFERENCES auth.users(id),
  is_active BOOLEAN DEFAULT true,
  view_count INTEGER DEFAULT 0,
  last_viewed_at TIMESTAMPTZ
);

-- Add personalized tagline column to prospect_dashboards
ALTER TABLE prospect_dashboards
ADD COLUMN IF NOT EXISTS personalized_tagline TEXT;

-- Add comment
COMMENT ON COLUMN prospect_dashboards.personalized_tagline IS 'AI-generated personalized tagline based on prospect bio';
