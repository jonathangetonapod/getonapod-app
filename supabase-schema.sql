-- Testimonials Table
-- Run this SQL in your Supabase SQL Editor to create the testimonials table

CREATE TABLE IF NOT EXISTS public.testimonials (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  video_url TEXT NOT NULL,
  client_name TEXT NOT NULL,
  client_title TEXT,
  client_company TEXT,
  client_photo_url TEXT,
  quote TEXT,
  is_featured BOOLEAN DEFAULT false,
  display_order INTEGER DEFAULT 0,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
  created_by UUID REFERENCES auth.users(id)
);

-- Enable Row Level Security
ALTER TABLE public.testimonials ENABLE ROW LEVEL SECURITY;

-- Policy: Allow public read access to active testimonials
CREATE POLICY "Testimonials are viewable by everyone"
  ON public.testimonials
  FOR SELECT
  USING (is_active = true);

-- Policy: Allow authenticated users (admins) to insert
CREATE POLICY "Authenticated users can insert testimonials"
  ON public.testimonials
  FOR INSERT
  WITH CHECK (auth.role() = 'authenticated');

-- Policy: Allow authenticated users (admins) to update
CREATE POLICY "Authenticated users can update testimonials"
  ON public.testimonials
  FOR UPDATE
  USING (auth.role() = 'authenticated');

-- Policy: Allow authenticated users (admins) to delete
CREATE POLICY "Authenticated users can delete testimonials"
  ON public.testimonials
  FOR DELETE
  USING (auth.role() = 'authenticated');

-- Create index for faster queries
CREATE INDEX IF NOT EXISTS testimonials_featured_idx ON public.testimonials(is_featured, display_order)
  WHERE is_active = true;

-- Function to automatically update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = timezone('utc'::text, now());
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Trigger to auto-update updated_at
CREATE TRIGGER update_testimonials_updated_at
  BEFORE UPDATE ON public.testimonials
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();
