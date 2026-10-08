-- AI-Powered Blog System Migration
-- Creates 3 tables: blog_posts, blog_categories, blog_indexing_log
-- Created: 2025-01-25

-- =====================================================
-- Table 1: blog_categories
-- =====================================================

CREATE TABLE public.blog_categories (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  slug TEXT NOT NULL UNIQUE,
  description TEXT,
  display_order INTEGER DEFAULT 0,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_blog_categories_slug ON blog_categories(slug);

COMMENT ON TABLE blog_categories IS 'Categories for organizing blog posts';
COMMENT ON COLUMN blog_categories.slug IS 'URL-friendly identifier for category';

-- =====================================================
-- Table 2: blog_posts
-- =====================================================

CREATE TABLE public.blog_posts (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  slug TEXT NOT NULL UNIQUE,
  title TEXT NOT NULL,
  meta_description TEXT NOT NULL,
  content TEXT NOT NULL,
  excerpt TEXT,
  featured_image_url TEXT,
  featured_image_alt TEXT,

  -- SEO fields
  focus_keyword TEXT,
  schema_markup JSONB,

  -- Taxonomy
  category_id UUID REFERENCES blog_categories(id) ON DELETE SET NULL,
  tags TEXT[] DEFAULT '{}',

  -- Publishing
  status TEXT CHECK (status IN ('draft', 'published')) DEFAULT 'draft',
  published_at TIMESTAMPTZ,

  -- Analytics
  view_count INTEGER DEFAULT 0,
  read_time_minutes INTEGER DEFAULT 5,

  -- Indexing tracking
  submitted_to_google_at TIMESTAMPTZ,
  indexed_by_google_at TIMESTAMPTZ,
  google_indexing_status TEXT,

  -- Metadata
  author_name TEXT DEFAULT 'Get On A Pod Team',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL
);

-- Indexes for performance
CREATE INDEX idx_blog_posts_slug ON blog_posts(slug);
CREATE INDEX idx_blog_posts_status ON blog_posts(status);
CREATE INDEX idx_blog_posts_published_at ON blog_posts(published_at DESC);
CREATE INDEX idx_blog_posts_category ON blog_posts(category_id);
CREATE INDEX idx_blog_posts_created_at ON blog_posts(created_at DESC);

COMMENT ON TABLE blog_posts IS 'Main blog posts table with SEO and analytics fields';
COMMENT ON COLUMN blog_posts.content IS 'Rich HTML content from TipTap editor';
COMMENT ON COLUMN blog_posts.schema_markup IS 'JSON-LD structured data for Google rich results';

-- =====================================================
-- Table 3: blog_indexing_log
-- =====================================================

CREATE TABLE public.blog_indexing_log (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  post_id UUID REFERENCES blog_posts(id) ON DELETE CASCADE,
  url TEXT NOT NULL,
  service TEXT NOT NULL,
  action TEXT NOT NULL,
  status TEXT NOT NULL,
  response_data JSONB,
  error_message TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes
CREATE INDEX idx_blog_indexing_post ON blog_indexing_log(post_id);
CREATE INDEX idx_blog_indexing_created ON blog_indexing_log(created_at DESC);
CREATE INDEX idx_blog_indexing_service ON blog_indexing_log(service);
CREATE INDEX idx_blog_indexing_status ON blog_indexing_log(status);

COMMENT ON TABLE blog_indexing_log IS 'Tracks Google Indexing API submission attempts';
COMMENT ON COLUMN blog_indexing_log.service IS 'Service used: google';
COMMENT ON COLUMN blog_indexing_log.action IS 'Action performed: submit, update, check_status';
COMMENT ON COLUMN blog_indexing_log.status IS 'Result: success, failed, pending';

-- =====================================================
-- Row Level Security (RLS) Policies
-- =====================================================

-- blog_categories: Public read, admin write
ALTER TABLE blog_categories ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Categories are publicly readable"
ON blog_categories FOR SELECT
USING (true);

CREATE POLICY "Only admins can manage categories"
ON blog_categories FOR ALL
USING (auth.jwt() ->> 'email' = 'jonathan@getonapod.com');

-- blog_posts: Published posts public, admin full access
ALTER TABLE blog_posts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Published posts are publicly readable"
ON blog_posts FOR SELECT
USING (status = 'published');

CREATE POLICY "Only admins can manage posts"
ON blog_posts FOR ALL
USING (auth.jwt() ->> 'email' = 'jonathan@getonapod.com');

-- blog_indexing_log: Admin only
ALTER TABLE blog_indexing_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Only admins can view indexing logs"
ON blog_indexing_log FOR SELECT
USING (auth.jwt() ->> 'email' = 'jonathan@getonapod.com');

CREATE POLICY "Only admins can insert indexing logs"
ON blog_indexing_log FOR INSERT
WITH CHECK (auth.jwt() ->> 'email' = 'jonathan@getonapod.com');

-- =====================================================
-- Seed Data: Blog Categories
-- =====================================================

INSERT INTO blog_categories (name, slug, description, display_order) VALUES
  ('Podcast Strategy', 'podcast-strategy', 'Tips and strategies for podcast guesting success', 1),
  ('Content Marketing', 'content-marketing', 'Content marketing and thought leadership insights', 2),
  ('Authority Building', 'authority-building', 'Building credibility and authority in your industry', 3),
  ('SEO & Growth', 'seo-growth', 'SEO strategies and growth tactics', 4),
  ('Case Studies', 'case-studies', 'Real success stories and examples', 5);

-- =====================================================
-- Trigger: Update updated_at timestamp
-- =====================================================

CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TRIGGER update_blog_posts_updated_at
    BEFORE UPDATE ON blog_posts
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- =====================================================
-- Migration Complete
-- =====================================================

-- Verify tables were created
DO $$
BEGIN
    RAISE NOTICE 'Blog system migration completed successfully!';
    RAISE NOTICE 'Tables created: blog_categories, blog_posts, blog_indexing_log';
    RAISE NOTICE 'RLS policies enabled for all tables';
    RAISE NOTICE 'Seeded % categories', (SELECT COUNT(*) FROM blog_categories);
END $$;


-- =============================================================================
-- replay-safety: folded-in premium placements and e-commerce schema
-- =============================================================================
-- These objects were applied to production by hand (Dec 25 2025, the same day
-- as this file) from un-numbered files the CLI never runs; the originals now live
-- in supabase/migrations_archive/. They are folded in here, in idempotent form,
-- so a fresh database gets them. Production already has them and never re-runs
-- this file. No later migration depends on them; order_items needs
-- premium_podcasts, so the table is created first.

-- premium_podcasts: no migration ever created this table. Its shape is INFERRED
-- from the root-level supabase-premium-podcasts-schema.sql (the SQL-editor script
-- it was created with), plus the two archived ALTERs below. That script's
-- permissive "Authenticated users can ..." policies are deliberately left out:
-- the archived fix file's DROP POLICY names show production's policies came
-- from elsewhere, and the fix file's own policies are applied below instead.
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

ALTER TABLE public.premium_podcasts ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS premium_podcasts_featured_idx ON public.premium_podcasts(is_featured, display_order)
  WHERE is_active = true;

CREATE INDEX IF NOT EXISTS premium_podcasts_podscan_id_idx ON public.premium_podcasts(podscan_id);

DROP TRIGGER IF EXISTS update_premium_podcasts_updated_at ON public.premium_podcasts;
CREATE TRIGGER update_premium_podcasts_updated_at
  BEFORE UPDATE ON public.premium_podcasts
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- From archived add_my_cost_to_premium_podcasts.sql
-- Add my_cost column to premium_podcasts table
-- This is an admin-only field that tracks the cost to purchase the placement

ALTER TABLE premium_podcasts
ADD COLUMN IF NOT EXISTS my_cost TEXT;

COMMENT ON COLUMN premium_podcasts.my_cost IS 'Admin-only field: the cost to purchase this podcast placement';

-- From archived add_category_to_premium_podcasts.sql
-- Add category field to premium_podcasts for better filtering
-- Categories: Business, Technology, Marketing, Health & Fitness, Education, Entertainment, News, etc.

ALTER TABLE premium_podcasts
ADD COLUMN IF NOT EXISTS category TEXT;

-- Create index for faster category filtering
CREATE INDEX IF NOT EXISTS premium_podcasts_category_idx ON premium_podcasts(category)
  WHERE is_active = true;

COMMENT ON COLUMN premium_podcasts.category IS 'Podcast category/industry (e.g., Business, Technology, Marketing)';

-- From archived fix_premium_podcasts_public_access.sql (already drop-then-create)
-- Allow public read access to premium_podcasts table
-- This is needed so the Premium Placements page can be viewed by anyone

-- Drop existing policies if they exist
DROP POLICY IF EXISTS "Allow public read access to active premium podcasts" ON premium_podcasts;
DROP POLICY IF EXISTS "Enable read access for admin users" ON premium_podcasts;

-- Create new policy for public read access (only active podcasts)
CREATE POLICY "Allow public read access to active premium podcasts"
ON premium_podcasts
FOR SELECT
USING (is_active = true);

-- Keep admin-only policies for insert, update, delete
DROP POLICY IF EXISTS "Enable insert for admin users" ON premium_podcasts;
DROP POLICY IF EXISTS "Enable update for admin users" ON premium_podcasts;
DROP POLICY IF EXISTS "Enable delete for admin users" ON premium_podcasts;

CREATE POLICY "Enable insert for admin users"
ON premium_podcasts
FOR INSERT
WITH CHECK (
  auth.jwt() IS NOT NULL AND
  auth.jwt()->>'email' IN ('jonathan@getonapod.com')
);

CREATE POLICY "Enable update for admin users"
ON premium_podcasts
FOR UPDATE
USING (
  auth.jwt() IS NOT NULL AND
  auth.jwt()->>'email' IN ('jonathan@getonapod.com')
);

CREATE POLICY "Enable delete for admin users"
ON premium_podcasts
FOR DELETE
USING (
  auth.jwt() IS NOT NULL AND
  auth.jwt()->>'email' IN ('jonathan@getonapod.com')
);

-- From archived create_ecommerce_tables.sql (already idempotent)
-- =============================================================================
-- CUSTOMERS TABLE
-- =============================================================================
-- Stores customer information and aggregate purchase data
CREATE TABLE IF NOT EXISTS public.customers (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  email TEXT NOT NULL UNIQUE,
  full_name TEXT NOT NULL,
  stripe_customer_id TEXT UNIQUE,
  total_orders INTEGER DEFAULT 0,
  total_spent DECIMAL(10, 2) DEFAULT 0.00,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Indexes for fast lookups
CREATE INDEX IF NOT EXISTS customers_email_idx ON public.customers(email);
CREATE INDEX IF NOT EXISTS customers_stripe_id_idx ON public.customers(stripe_customer_id);
CREATE INDEX IF NOT EXISTS customers_created_at_idx ON public.customers(created_at DESC);

-- Add comments for documentation
COMMENT ON TABLE public.customers IS 'Stores customer information and purchase statistics';
COMMENT ON COLUMN public.customers.stripe_customer_id IS 'Stripe customer ID for linking to Stripe dashboard';
COMMENT ON COLUMN public.customers.total_orders IS 'Cached count of paid orders';
COMMENT ON COLUMN public.customers.total_spent IS 'Cached sum of all paid order amounts';

-- =============================================================================
-- ORDERS TABLE
-- =============================================================================
-- Stores order header information and payment status
CREATE TABLE IF NOT EXISTS public.orders (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  customer_id UUID NOT NULL REFERENCES public.customers(id) ON DELETE CASCADE,

  -- Stripe payment data
  stripe_checkout_session_id TEXT UNIQUE NOT NULL,
  stripe_payment_intent_id TEXT,

  -- Order details
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'paid', 'failed', 'refunded')),
  total_amount DECIMAL(10, 2) NOT NULL CHECK (total_amount >= 0),
  currency TEXT NOT NULL DEFAULT 'usd',

  -- Customer snapshot (preserved even if customer record changes)
  customer_email TEXT NOT NULL,
  customer_name TEXT NOT NULL,

  -- Timestamps
  created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
  paid_at TIMESTAMP WITH TIME ZONE
);

-- Indexes for queries
CREATE INDEX IF NOT EXISTS orders_customer_id_idx ON public.orders(customer_id);
CREATE INDEX IF NOT EXISTS orders_status_idx ON public.orders(status);
CREATE INDEX IF NOT EXISTS orders_stripe_session_idx ON public.orders(stripe_checkout_session_id);
CREATE INDEX IF NOT EXISTS orders_created_at_idx ON public.orders(created_at DESC);
CREATE INDEX IF NOT EXISTS orders_paid_at_idx ON public.orders(paid_at DESC);

-- Add comments
COMMENT ON TABLE public.orders IS 'Stores order information and payment status';
COMMENT ON COLUMN public.orders.status IS 'Order status: pending (created but not paid), paid (payment successful), failed (payment failed), refunded (payment refunded)';
COMMENT ON COLUMN public.orders.stripe_checkout_session_id IS 'Unique Stripe Checkout Session ID';
COMMENT ON COLUMN public.orders.customer_email IS 'Snapshot of customer email at time of order';
COMMENT ON COLUMN public.orders.customer_name IS 'Snapshot of customer name at time of order';

-- =============================================================================
-- ORDER_ITEMS TABLE
-- =============================================================================
-- Stores individual items within each order
CREATE TABLE IF NOT EXISTS public.order_items (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  order_id UUID NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
  premium_podcast_id UUID NOT NULL REFERENCES public.premium_podcasts(id),

  -- Item snapshot (prices and details at time of purchase)
  podcast_name TEXT NOT NULL,
  podcast_image_url TEXT,
  price_at_purchase DECIMAL(10, 2) NOT NULL CHECK (price_at_purchase >= 0),
  quantity INTEGER NOT NULL DEFAULT 1 CHECK (quantity > 0),

  created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Indexes for queries
CREATE INDEX IF NOT EXISTS order_items_order_id_idx ON public.order_items(order_id);
CREATE INDEX IF NOT EXISTS order_items_podcast_id_idx ON public.order_items(premium_podcast_id);

-- Add comments
COMMENT ON TABLE public.order_items IS 'Stores line items for each order with pricing snapshot';
COMMENT ON COLUMN public.order_items.podcast_name IS 'Snapshot of podcast name at time of purchase';
COMMENT ON COLUMN public.order_items.price_at_purchase IS 'Price charged for this item (preserved even if podcast price changes later)';

-- =============================================================================
-- ROW LEVEL SECURITY (RLS) POLICIES
-- =============================================================================

-- Enable RLS on all tables
ALTER TABLE public.customers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.order_items ENABLE ROW LEVEL SECURITY;

-- Drop existing policies if any (for re-running migration)
DROP POLICY IF EXISTS "Admin full access to customers" ON public.customers;
DROP POLICY IF EXISTS "Admin full access to orders" ON public.orders;
DROP POLICY IF EXISTS "Admin full access to order_items" ON public.order_items;

-- CUSTOMERS: Admin-only access
CREATE POLICY "Admin full access to customers"
  ON public.customers
  FOR ALL
  TO authenticated
  USING (true)
  WITH CHECK (true);

-- ORDERS: Admin-only access
CREATE POLICY "Admin full access to orders"
  ON public.orders
  FOR ALL
  TO authenticated
  USING (true)
  WITH CHECK (true);

-- ORDER_ITEMS: Admin-only access
CREATE POLICY "Admin full access to order_items"
  ON public.order_items
  FOR ALL
  TO authenticated
  USING (true)
  WITH CHECK (true);

-- =============================================================================
-- FUNCTIONS AND TRIGGERS
-- =============================================================================

-- Function to update updated_at timestamp
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = timezone('utc'::text, now());
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger for customers table
DROP TRIGGER IF EXISTS update_customers_updated_at ON public.customers;
CREATE TRIGGER update_customers_updated_at
  BEFORE UPDATE ON public.customers
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- Trigger for orders table
DROP TRIGGER IF EXISTS update_orders_updated_at ON public.orders;
CREATE TRIGGER update_orders_updated_at
  BEFORE UPDATE ON public.orders
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- =============================================================================
-- GRANT PERMISSIONS
-- =============================================================================

-- Grant permissions to authenticated users (admins)
GRANT ALL ON public.customers TO authenticated;
GRANT ALL ON public.orders TO authenticated;
GRANT ALL ON public.order_items TO authenticated;

-- Grant usage on sequences
GRANT USAGE ON ALL SEQUENCES IN SCHEMA public TO authenticated;
