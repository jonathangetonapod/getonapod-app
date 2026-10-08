-- replay-safety: the 202501xx files carry a mistyped year (they were written in
-- Dec 2025/Jan 2026), so on a fresh database they run before
-- 20251227000004_podcast_calendar_clean.sql creates clients and bookings.
-- Create both here with the exact 20251227000004 definitions; that file no
-- longer drops them, so every column added in between survives, matching
-- production. Production already has both tables, so this is a no-op there.
CREATE TABLE IF NOT EXISTS public.clients (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  email TEXT,
  linkedin_url TEXT,
  website TEXT,
  calendar_link TEXT,
  contact_person TEXT,
  first_invoice_paid_date DATE,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'paused', 'churned')),
  notes TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

CREATE TABLE IF NOT EXISTS public.bookings (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  client_id UUID NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  podcast_name TEXT NOT NULL,
  podcast_url TEXT,
  host_name TEXT,
  scheduled_date DATE,
  recording_date DATE,
  publish_date DATE,
  status TEXT NOT NULL DEFAULT 'booked' CHECK (status IN ('booked', 'in_progress', 'recorded', 'published', 'cancelled')),
  episode_url TEXT,
  notes TEXT,
  prep_sent BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Add bio column to clients table for AI query generation
ALTER TABLE public.clients
  ADD COLUMN IF NOT EXISTS bio TEXT;

-- Add index for bio searches (optional but good practice)
CREATE INDEX IF NOT EXISTS clients_bio_idx ON public.clients USING gin(to_tsvector('english', bio));

-- Comment
COMMENT ON COLUMN public.clients.bio IS 'Client biography/description used for AI-powered podcast query generation';
