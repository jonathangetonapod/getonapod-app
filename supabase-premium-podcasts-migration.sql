-- Migration script to add new fields to existing premium_podcasts table
-- Run this if you already created the table with the old schema

-- Add new columns
ALTER TABLE public.premium_podcasts
  ADD COLUMN IF NOT EXISTS podcast_name TEXT,
  ADD COLUMN IF NOT EXISTS podcast_image_url TEXT,
  ADD COLUMN IF NOT EXISTS audience_size TEXT,
  ADD COLUMN IF NOT EXISTS episode_count TEXT,
  ADD COLUMN IF NOT EXISTS rating TEXT,
  ADD COLUMN IF NOT EXISTS reach_score TEXT,
  ADD COLUMN IF NOT EXISTS why_this_show TEXT,
  ADD COLUMN IF NOT EXISTS whats_included TEXT[] DEFAULT '{}';

-- Rename features column to whats_included (if you had features)
-- ALTER TABLE public.premium_podcasts RENAME COLUMN features TO whats_included;

-- Make podcast_name required (update existing rows first if needed)
-- UPDATE public.premium_podcasts SET podcast_name = 'Unknown Podcast' WHERE podcast_name IS NULL;
-- ALTER TABLE public.premium_podcasts ALTER COLUMN podcast_name SET NOT NULL;

-- If you need to start fresh, drop and recreate:
-- DROP TABLE IF EXISTS public.premium_podcasts CASCADE;
-- Then run the full schema from supabase-premium-podcasts-schema.sql
