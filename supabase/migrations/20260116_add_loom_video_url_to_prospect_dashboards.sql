-- Add loom_video_url and show_loom_video columns to prospect_dashboards
-- This allows admins to add personalized Loom video URLs for each prospect and toggle visibility

ALTER TABLE prospect_dashboards
ADD COLUMN IF NOT EXISTS loom_video_url TEXT,
ADD COLUMN IF NOT EXISTS show_loom_video BOOLEAN DEFAULT true;

COMMENT ON COLUMN prospect_dashboards.loom_video_url IS 'URL to a personalized Loom video for the prospect';
COMMENT ON COLUMN prospect_dashboards.show_loom_video IS 'Whether to show the Loom video on the prospect dashboard';
