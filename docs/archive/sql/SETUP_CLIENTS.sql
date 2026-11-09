-- ====================================================================
-- SETUP SCRIPT FOR CLIENT ENHANCEMENTS
-- Run this in Supabase SQL Editor: https://supabase.com/dashboard/project/ysjwveqnwjysldpfqzov/sql
-- ====================================================================

-- 1. Add bio column to clients table for AI query generation
ALTER TABLE public.clients
  ADD COLUMN IF NOT EXISTS bio TEXT;

-- Add full-text search index for bio
CREATE INDEX IF NOT EXISTS clients_bio_idx ON public.clients USING gin(to_tsvector('english', bio));

COMMENT ON COLUMN public.clients.bio IS 'Client biography/description used for AI-powered podcast query generation';

-- 2. Add photo_url column to clients table (if not already added)
ALTER TABLE public.clients
  ADD COLUMN IF NOT EXISTS photo_url TEXT;

CREATE INDEX IF NOT EXISTS clients_photo_url_idx ON public.clients(photo_url) WHERE photo_url IS NOT NULL;

COMMENT ON COLUMN public.clients.photo_url IS 'URL to client profile photo (displayed in portal dashboard)';

-- 3. Create storage bucket for client assets (photos)
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'client-assets',
  'client-assets',
  true,
  5242880, -- 5MB limit
  ARRAY['image/jpeg', 'image/jpg', 'image/png', 'image/gif', 'image/webp']
)
ON CONFLICT (id) DO NOTHING;

-- 4. Create storage policies for client photos

-- Drop existing policies if they exist (to avoid conflicts)
DROP POLICY IF EXISTS "Authenticated users can upload client photos" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated users can update client photos" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated users can delete client photos" ON storage.objects;
DROP POLICY IF EXISTS "Public read access to client assets" ON storage.objects;

-- Allow authenticated users to upload to client-photos folder
CREATE POLICY "Authenticated users can upload client photos"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (bucket_id = 'client-assets' AND (storage.foldername(name))[1] = 'client-photos');

-- Allow authenticated users to update client photos
CREATE POLICY "Authenticated users can update client photos"
ON storage.objects FOR UPDATE
TO authenticated
USING (bucket_id = 'client-assets' AND (storage.foldername(name))[1] = 'client-photos');

-- Allow authenticated users to delete client photos
CREATE POLICY "Authenticated users can delete client photos"
ON storage.objects FOR DELETE
TO authenticated
USING (bucket_id = 'client-assets' AND (storage.foldername(name))[1] = 'client-photos');

-- Allow public read access to all files in bucket
CREATE POLICY "Public read access to client assets"
ON storage.objects FOR SELECT
TO public
USING (bucket_id = 'client-assets');

-- Done! You can now:
-- 1. Add client bios for AI podcast search
-- 2. Upload client photos
