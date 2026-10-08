-- replay-safety: this file sorts before 20250129000002_addon_services.sql,
-- which creates addon_services. Create the table here with the exact
-- 20250129000002 definition so a fresh database can replay; the later CREATE
-- TABLE IF NOT EXISTS is then a no-op. Production already has the table.
CREATE TABLE IF NOT EXISTS public.addon_services (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  description TEXT NOT NULL,
  short_description TEXT, -- For card/banner display
  price_cents INTEGER NOT NULL, -- Price in cents
  stripe_product_id TEXT UNIQUE,
  stripe_price_id TEXT UNIQUE,
  active BOOLEAN DEFAULT true,
  features JSONB DEFAULT '[]'::jsonb, -- Array of feature strings
  delivery_days INTEGER DEFAULT 5, -- Expected delivery timeline
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Add Blog Post and Bundle Services

-- ============================================================================
-- 1. SEO BLOG POST SERVICE
-- ============================================================================

INSERT INTO public.addon_services (
  name,
  description,
  short_description,
  price_cents,
  active,
  features,
  delivery_days
) VALUES (
  'SEO Blog Post',
  'Transform your podcast episode into a fully optimized blog post. We transcribe the episode and craft a 1500-2000 word article with proper headings, meta descriptions, and keyword optimization to drive organic traffic.',
  'Full transcript + SEO-optimized 1500-2000 word blog post',
  14900, -- $149.00
  true,
  '["Complete episode transcription", "1500-2000 word SEO-optimized article", "Meta description & title tags", "Keyword research & optimization", "Proper heading structure (H1-H3)", "Delivered as Google Doc"]'::jsonb,
  7
) ON CONFLICT DO NOTHING;

-- ============================================================================
-- 2. COMPLETE CONTENT BUNDLE
-- ============================================================================

INSERT INTO public.addon_services (
  name,
  description,
  short_description,
  price_cents,
  active,
  features,
  delivery_days
) VALUES (
  'Complete Content Bundle',
  'Get maximum ROI from your episode! Includes 5 professionally edited short-form clips for social media PLUS a full SEO blog post to drive organic traffic. Save $49 compared to purchasing separately.',
  'Clips package + SEO blog post - Save $49!',
  24900, -- $249.00 (normally $298)
  true,
  '["5 engaging short clips (15-60s)", "Hook-first editing for maximum retention", "Captions included on all clips", "Complete episode transcription", "1500-2000 word SEO-optimized blog post", "Meta description & keyword optimization", "All content delivered via Google Drive"]'::jsonb,
  7
) ON CONFLICT DO NOTHING;

-- ============================================================================
-- 3. UPDATE EXISTING CLIPS SERVICE SHORT DESCRIPTION
-- ============================================================================

UPDATE public.addon_services
SET short_description = '5 professionally edited clips for social media'
WHERE name = 'Short-Form Content Package'
  AND short_description = 'Get 5 professionally edited clips optimized for social media';
