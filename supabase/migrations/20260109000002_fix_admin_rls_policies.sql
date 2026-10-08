-- replay-safety: this fix sorts before 20260109000003_prospect_dashboard_podcasts_cache.sql,
-- which creates prospect_dashboard_podcasts. Create the table here with the
-- exact 20260109000003 definition so a fresh database can replay; the later
-- CREATE TABLE IF NOT EXISTS is then a no-op. Production already has it.
CREATE TABLE IF NOT EXISTS prospect_dashboard_podcasts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  prospect_dashboard_id UUID NOT NULL REFERENCES prospect_dashboards(id) ON DELETE CASCADE,
  podcast_id TEXT NOT NULL,

  -- Podcast data (from Podscan API)
  podcast_name TEXT NOT NULL,
  podcast_description TEXT,
  podcast_image_url TEXT,
  podcast_url TEXT,
  publisher_name TEXT,
  itunes_rating NUMERIC,
  episode_count INTEGER,
  audience_size INTEGER,
  podcast_categories JSONB,
  last_posted_at TIMESTAMPTZ,

  -- AI Analysis (from Claude API)
  ai_clean_description TEXT,
  ai_fit_reasons JSONB,  -- Array of strings
  ai_pitch_angles JSONB, -- Array of {title, description}
  ai_analyzed_at TIMESTAMPTZ, -- When AI analysis was done

  -- Metadata
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),

  -- Unique constraint: one podcast per dashboard
  UNIQUE(prospect_dashboard_id, podcast_id)
);

-- Fix RLS policies that incorrectly reference admin_users.user_id (which doesn't exist)
-- The admin_users table uses 'email' to identify admins, not 'user_id'

-- Drop the broken policy on prospect_dashboard_podcasts
DROP POLICY IF EXISTS "Admin write access for prospect_dashboard_podcasts" ON prospect_dashboard_podcasts;

-- Create fixed policy that checks by email
CREATE POLICY "Admin write access for prospect_dashboard_podcasts"
  ON prospect_dashboard_podcasts
  FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM admin_users
      WHERE admin_users.email = (
        SELECT email FROM auth.users WHERE id = auth.uid()
      )
    )
  );

-- Also fix prospect_dashboards if it has the same issue
DROP POLICY IF EXISTS "Admin full access for prospect_dashboards" ON prospect_dashboards;

CREATE POLICY "Admin full access for prospect_dashboards"
  ON prospect_dashboards
  FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM admin_users
      WHERE admin_users.email = (
        SELECT email FROM auth.users WHERE id = auth.uid()
      )
    )
  );

-- Fix prospect_podcast_feedback admin policy if exists
DROP POLICY IF EXISTS "Admin full access for prospect_podcast_feedback" ON prospect_podcast_feedback;

CREATE POLICY "Admin full access for prospect_podcast_feedback"
  ON prospect_podcast_feedback
  FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM admin_users
      WHERE admin_users.email = (
        SELECT email FROM auth.users WHERE id = auth.uid()
      )
    )
  );
