-- Add category field to premium_podcasts for better filtering
-- Categories: Business, Technology, Marketing, Health & Fitness, Education, Entertainment, News, etc.

ALTER TABLE premium_podcasts
ADD COLUMN IF NOT EXISTS category TEXT;

-- Create index for faster category filtering
CREATE INDEX IF NOT EXISTS premium_podcasts_category_idx ON premium_podcasts(category)
  WHERE is_active = true;

COMMENT ON COLUMN premium_podcasts.category IS 'Podcast category/industry (e.g., Business, Technology, Marketing)';
