-- Add loom_video_url column to prospect_dashboards
-- This allows admins to add personalized Loom video URLs for each prospect

ALTER TABLE prospect_dashboards
ADD COLUMN IF NOT EXISTS loom_video_url TEXT;

COMMENT ON COLUMN prospect_dashboards.loom_video_url IS 'URL to a personalized Loom video for the prospect';
