-- Add personalized tagline column to prospect_dashboards
ALTER TABLE prospect_dashboards
ADD COLUMN IF NOT EXISTS personalized_tagline TEXT;

-- Add comment
COMMENT ON COLUMN prospect_dashboards.personalized_tagline IS 'AI-generated personalized tagline based on prospect bio';
