-- Add content_ready flag to prospect_dashboards
ALTER TABLE prospect_dashboards 
ADD COLUMN IF NOT EXISTS content_ready BOOLEAN DEFAULT FALSE;

-- Add comment
COMMENT ON COLUMN prospect_dashboards.content_ready IS 'When true, the prospect can see the dashboard content. When false, they see Coming Soon.';
