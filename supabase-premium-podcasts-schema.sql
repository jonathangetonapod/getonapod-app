-- Premium Podcasts Table (Simplified - stores Podscan ID + custom pricing)
-- Run this SQL in your Supabase SQL Editor to create the premium_podcasts table

CREATE TABLE IF NOT EXISTS public.premium_podcasts (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  podscan_id TEXT NOT NULL UNIQUE,
  podcast_name TEXT NOT NULL,
  podcast_image_url TEXT,
  audience_size TEXT,
  episode_count TEXT,
  rating TEXT,
  reach_score TEXT,
  why_this_show TEXT,
  whats_included TEXT[] DEFAULT '{}',
  price TEXT NOT NULL,
  is_featured BOOLEAN DEFAULT false,
  is_active BOOLEAN DEFAULT true,
  display_order INTEGER DEFAULT 0,
  notes TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
  created_by UUID REFERENCES auth.users(id)
);

-- Enable Row Level Security
ALTER TABLE public.premium_podcasts ENABLE ROW LEVEL SECURITY;

-- Policy: Allow public read access to active podcasts
CREATE POLICY "Premium podcasts are viewable by everyone"
  ON public.premium_podcasts
  FOR SELECT
  USING (is_active = true);

-- Policy: Allow authenticated users (admins) to view all podcasts
CREATE POLICY "Authenticated users can view all premium podcasts"
  ON public.premium_podcasts
  FOR SELECT
  USING (auth.role() = 'authenticated');

-- Policy: Allow authenticated users (admins) to insert
CREATE POLICY "Authenticated users can insert premium podcasts"
  ON public.premium_podcasts
  FOR INSERT
  WITH CHECK (auth.role() = 'authenticated');

-- Policy: Allow authenticated users (admins) to update
CREATE POLICY "Authenticated users can update premium podcasts"
  ON public.premium_podcasts
  FOR UPDATE
  USING (auth.role() = 'authenticated');

-- Policy: Allow authenticated users (admins) to delete
CREATE POLICY "Authenticated users can delete premium podcasts"
  ON public.premium_podcasts
  FOR DELETE
  USING (auth.role() = 'authenticated');

-- Create index for faster queries
CREATE INDEX IF NOT EXISTS premium_podcasts_featured_idx ON public.premium_podcasts(is_featured, display_order)
  WHERE is_active = true;

CREATE INDEX IF NOT EXISTS premium_podcasts_podscan_id_idx ON public.premium_podcasts(podscan_id);

-- Trigger to auto-update updated_at (reuse existing function)
CREATE TRIGGER update_premium_podcasts_updated_at
  BEFORE UPDATE ON public.premium_podcasts
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();
