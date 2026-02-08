# Database Schema Documentation

## Overview
This document describes the complete database schema for the authority-built podcast placement platform. The database is built on Supabase (PostgreSQL) and includes tables for client management, podcast discovery, booking systems, e-commerce, blog content, and analytics.

## Core Business Entities

### 1. Clients Table
**Purpose**: Stores information about podcast placement clients

```sql
public.clients (
  id UUID PRIMARY KEY,
  name TEXT NOT NULL,
  email TEXT,
  linkedin_url TEXT,
  website TEXT,
  calendar_link TEXT,
  contact_person TEXT,
  first_invoice_paid_date DATE,
  status TEXT DEFAULT 'active' CHECK (status IN ('active', 'paused', 'churned')),
  notes TEXT,
  
  -- Portal access fields
  portal_access_enabled BOOLEAN DEFAULT false,
  portal_last_login_at TIMESTAMPTZ,
  portal_invitation_sent_at TIMESTAMPTZ,
  
  -- Client media assets  
  bio TEXT,
  photo_url TEXT,
  media_kit_url TEXT,
  google_sheet_url TEXT,
  prospect_dashboard_url TEXT,
  
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
)
```

**Relationships**: 
- One-to-many with `bookings`
- One-to-many with `client_portal_*` tables
- One-to-many with `booking_addons`

### 2. Bookings Table
**Purpose**: Tracks podcast bookings and their status throughout the lifecycle

```sql
public.bookings (
  id UUID PRIMARY KEY,
  client_id UUID NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  
  -- Podcast information
  podcast_name TEXT NOT NULL,
  podcast_url TEXT,
  host_name TEXT,
  podcast_id TEXT, -- Podscan ID
  podcast_description TEXT,
  podcast_image_url TEXT,
  rss_url TEXT,
  
  -- Booking dates
  scheduled_date DATE,
  recording_date DATE,
  publish_date DATE,
  
  -- Status tracking
  status TEXT DEFAULT 'booked' CHECK (status IN ('booked', 'in_progress', 'recorded', 'published', 'cancelled')),
  
  -- Podcast metadata
  itunes_rating DECIMAL,
  itunes_rating_count INTEGER,
  episode_count INTEGER,
  audience_size INTEGER,
  
  -- Additional details
  episode_url TEXT,
  notes TEXT,
  prep_sent BOOLEAN DEFAULT false,
  hidden BOOLEAN DEFAULT false,
  archived BOOLEAN DEFAULT false,
  
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
)
```

**Relationships**:
- Many-to-one with `clients`
- One-to-many with `booking_addons`

### 3. Podcasts Table (Centralized Cache)
**Purpose**: Central repository for podcast data to reduce API calls to Podscan

```sql
public.podcasts (
  id UUID PRIMARY KEY,
  podscan_id TEXT UNIQUE NOT NULL,
  
  -- Basic information
  podcast_name TEXT NOT NULL,
  podcast_description TEXT,
  podcast_guid TEXT,
  podcast_image_url TEXT,
  
  -- Publisher & Host
  publisher_name TEXT,
  host_name TEXT,
  
  -- Platform links
  podcast_url TEXT,
  podcast_itunes_id TEXT,
  podcast_spotify_id TEXT,
  rss_url TEXT,
  
  -- Categories & classification
  podcast_categories JSONB, -- [{category_id: string, category_name: string}]
  language TEXT, -- ISO code
  region TEXT, -- Country code
  
  -- Content metadata
  episode_count INTEGER,
  last_posted_at TIMESTAMPTZ,
  is_active BOOLEAN DEFAULT true,
  podcast_has_guests BOOLEAN,
  podcast_has_sponsors BOOLEAN,
  
  -- Ratings (iTunes)
  itunes_rating DECIMAL(3,2),
  itunes_rating_count INTEGER,
  itunes_rating_count_bracket TEXT,
  
  -- Ratings (Spotify)
  spotify_rating DECIMAL(3,2),
  spotify_rating_count INTEGER,
  spotify_rating_count_bracket TEXT,
  
  -- Audience metrics
  audience_size INTEGER,
  podcast_reach_score INTEGER,
  
  -- Contact information
  email TEXT,
  website TEXT,
  social_links JSONB, -- [{platform: string, url: string}]
  
  -- Demographics (full JSONB from Podscan)
  demographics JSONB,
  demographics_episodes_analyzed INTEGER,
  demographics_fetched_at TIMESTAMPTZ,
  
  -- Brand safety
  brand_safety_framework TEXT,
  brand_safety_risk_level TEXT,
  brand_safety_recommendation TEXT,
  
  -- Cache management
  podscan_last_fetched_at TIMESTAMPTZ DEFAULT NOW(),
  podscan_fetch_count INTEGER DEFAULT 1,
  cache_hit_count INTEGER DEFAULT 0,
  
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
)
```

**Key Features**:
- Deduplicates podcast data across the platform (60-80% API call savings)
- Tracks cache hit statistics
- Full demographics and brand safety data from Podscan

## E-commerce Tables

### 4. Customers Table
**Purpose**: E-commerce customers (separate from clients)

```sql
public.customers (
  id UUID PRIMARY KEY,
  email TEXT UNIQUE NOT NULL,
  full_name TEXT NOT NULL,
  stripe_customer_id TEXT UNIQUE,
  total_orders INTEGER DEFAULT 0,
  total_spent DECIMAL(10,2) DEFAULT 0.00,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
)
```

### 5. Orders Table
**Purpose**: E-commerce orders with Stripe integration

```sql
public.orders (
  id UUID PRIMARY KEY,
  customer_id UUID NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  
  -- Stripe payment data
  stripe_checkout_session_id TEXT UNIQUE NOT NULL,
  stripe_payment_intent_id TEXT,
  
  -- Order details
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'paid', 'failed', 'refunded')),
  total_amount DECIMAL(10,2) NOT NULL CHECK (total_amount >= 0),
  currency TEXT DEFAULT 'usd',
  
  -- Customer snapshot
  customer_email TEXT NOT NULL,
  customer_name TEXT NOT NULL,
  
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  paid_at TIMESTAMPTZ
)
```

### 6. Order Items Table
**Purpose**: Line items for orders

```sql
public.order_items (
  id UUID PRIMARY KEY,
  order_id UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  premium_podcast_id UUID NOT NULL REFERENCES premium_podcasts(id),
  
  -- Item snapshot at purchase
  podcast_name TEXT NOT NULL,
  podcast_image_url TEXT,
  price_at_purchase DECIMAL(10,2) NOT NULL,
  quantity INTEGER DEFAULT 1,
  
  created_at TIMESTAMPTZ DEFAULT NOW()
)
```

### 7. Premium Podcasts Table
**Purpose**: Curated premium podcast placements for purchase

```sql
public.premium_podcasts (
  id UUID PRIMARY KEY,
  podscan_id TEXT UNIQUE NOT NULL,
  podcast_name TEXT NOT NULL,
  podcast_image_url TEXT,
  audience_size TEXT,
  episode_count TEXT,
  rating TEXT,
  reach_score TEXT,
  why_this_show TEXT,
  whats_included TEXT[] DEFAULT '{}',
  price TEXT NOT NULL,
  my_cost TEXT, -- Internal cost tracking
  category TEXT,
  is_featured BOOLEAN DEFAULT false,
  is_active BOOLEAN DEFAULT true,
  display_order INTEGER DEFAULT 0,
  notes TEXT,
  
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  created_by UUID REFERENCES auth.users(id)
)
```

## Add-on Services System

### 8. Addon Services Table
**Purpose**: Catalog of available add-on services (clips, transcription, etc.)

```sql
public.addon_services (
  id UUID PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT NOT NULL,
  short_description TEXT,
  price_cents INTEGER NOT NULL,
  stripe_product_id TEXT UNIQUE,
  stripe_price_id TEXT UNIQUE,
  active BOOLEAN DEFAULT true,
  features JSONB DEFAULT '[]',
  delivery_days INTEGER DEFAULT 5,
  
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
)
```

### 9. Booking Addons Table
**Purpose**: Track addon service purchases per booking

```sql
public.booking_addons (
  id UUID PRIMARY KEY,
  booking_id UUID NOT NULL REFERENCES bookings(id) ON DELETE CASCADE,
  service_id UUID NOT NULL REFERENCES addon_services(id) ON DELETE RESTRICT,
  client_id UUID NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  
  -- Payment info
  stripe_payment_intent_id TEXT UNIQUE,
  amount_paid_cents INTEGER NOT NULL,
  
  -- Fulfillment
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'in_progress', 'delivered', 'cancelled')),
  google_drive_url TEXT,
  admin_notes TEXT,
  
  purchased_at TIMESTAMPTZ DEFAULT NOW(),
  delivered_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
)
```

## Blog & Content System

### 10. Blog Categories Table
**Purpose**: Categories for organizing blog posts

```sql
public.blog_categories (
  id UUID PRIMARY KEY,
  name TEXT UNIQUE NOT NULL,
  slug TEXT UNIQUE NOT NULL,
  description TEXT,
  display_order INTEGER DEFAULT 0,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW()
)
```

### 11. Blog Posts Table
**Purpose**: Blog content with SEO features

```sql
public.blog_posts (
  id UUID PRIMARY KEY,
  slug TEXT UNIQUE NOT NULL,
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
  read_status TEXT DEFAULT 'unread',
  
  -- Google Indexing tracking
  submitted_to_google_at TIMESTAMPTZ,
  indexed_by_google_at TIMESTAMPTZ,
  google_indexing_status TEXT,
  
  author_name TEXT DEFAULT 'Get On A Pod Team',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL
)
```

### 12. Blog Indexing Log Table
**Purpose**: Track Google Indexing API submissions

```sql
public.blog_indexing_log (
  id UUID PRIMARY KEY,
  post_id UUID REFERENCES blog_posts(id) ON DELETE CASCADE,
  url TEXT NOT NULL,
  service TEXT NOT NULL, -- 'google'
  action TEXT NOT NULL, -- 'submit', 'update', 'check_status'
  status TEXT NOT NULL, -- 'success', 'failed', 'pending'
  response_data JSONB,
  error_message TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
)
```

## Client Portal System

### 13. Client Portal Tokens Table
**Purpose**: One-time magic link tokens for passwordless authentication

```sql
public.client_portal_tokens (
  id UUID PRIMARY KEY,
  client_id UUID NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  token TEXT UNIQUE NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  used_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  ip_address TEXT,
  user_agent TEXT,
  
  CONSTRAINT token_not_expired CHECK (expires_at > created_at)
)
```

### 14. Client Portal Sessions Table
**Purpose**: Active client sessions after successful authentication

```sql
public.client_portal_sessions (
  id UUID PRIMARY KEY,
  client_id UUID NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  session_token TEXT UNIQUE NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  last_active_at TIMESTAMPTZ DEFAULT NOW(),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  ip_address TEXT,
  user_agent TEXT,
  
  CONSTRAINT session_not_expired CHECK (expires_at > created_at)
)
```

### 15. Client Portal Activity Log Table
**Purpose**: Comprehensive audit log of client portal activity

```sql
public.client_portal_activity_log (
  id UUID PRIMARY KEY,
  client_id UUID NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  session_id UUID REFERENCES client_portal_sessions(id) ON DELETE SET NULL,
  action TEXT NOT NULL, -- 'request_magic_link', 'login_success', 'logout', etc.
  metadata JSONB,
  ip_address TEXT,
  user_agent TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
)
```

## Prospect & Lead Management

### 16. Prospect Dashboards Table
**Purpose**: Shareable dashboard links for prospects

```sql
public.prospect_dashboards (
  id UUID PRIMARY KEY,
  slug TEXT UNIQUE NOT NULL,
  prospect_name TEXT NOT NULL,
  prospect_bio TEXT,
  first_name TEXT,
  prospect_image_url TEXT,
  spreadsheet_id TEXT,
  spreadsheet_url TEXT,
  loom_video_url TEXT,
  heygen_video_url TEXT,
  background_video_url TEXT,
  testimonials JSONB DEFAULT '[]',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  created_by UUID REFERENCES auth.users(id),
  is_active BOOLEAN DEFAULT true,
  view_count INTEGER DEFAULT 0,
  last_viewed_at TIMESTAMPTZ
)
```

### 17. Prospect Dashboard Podcasts Cache Table
**Purpose**: Cache podcast data for prospect dashboards

```sql
public.prospect_dashboard_podcasts (
  id UUID PRIMARY KEY,
  dashboard_id UUID NOT NULL REFERENCES prospect_dashboards(id) ON DELETE CASCADE,
  podcast_id TEXT NOT NULL, -- Podscan ID
  podcast_name TEXT,
  podcast_description TEXT,
  podcast_image_url TEXT,
  podcast_url TEXT,
  publisher_name TEXT,
  itunes_rating DECIMAL,
  episode_count INTEGER,
  audience_size INTEGER,
  podcast_categories JSONB,
  last_posted_at TIMESTAMPTZ,
  sort_order INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
)
```

## Analytics & Tracking

### 18. Podcast Fit Analyses Table
**Purpose**: Cache AI-generated podcast fit analyses

```sql
public.podcast_fit_analyses (
  id UUID PRIMARY KEY,
  podcast_id TEXT NOT NULL,
  client_id UUID NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  clean_description TEXT,
  fit_reasons JSONB DEFAULT '[]',
  pitch_angles JSONB DEFAULT '[]',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  
  UNIQUE(podcast_id, client_id)
)
```

### 19. Podcast Fit Analysis Cache Table
**Purpose**: General-purpose cache for podcast fitness analyses

```sql
public.podcast_fit_analysis_cache (
  id UUID PRIMARY KEY,
  cache_key TEXT UNIQUE NOT NULL,
  analysis_result JSONB NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
)
```

### 20. Campaign Replies Table
**Purpose**: Track email campaign responses

```sql
public.campaign_replies (
  id UUID PRIMARY KEY,
  bison_reply_id TEXT UNIQUE,
  campaign_id TEXT,
  sender_email TEXT,
  sender_name TEXT,
  subject TEXT,
  content TEXT,
  received_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
)
```

## Email & Communication

### 21. Email Logs Table
**Purpose**: Track all email delivery via Resend

```sql
public.email_logs (
  id UUID PRIMARY KEY,
  resend_email_id TEXT UNIQUE,
  email_type TEXT NOT NULL,
  from_address TEXT NOT NULL,
  to_address TEXT NOT NULL,
  subject TEXT NOT NULL,
  status TEXT DEFAULT 'sent' CHECK (status IN ('sent', 'delivered', 'bounced', 'complained', 'failed')),
  bounce_type TEXT,
  complaint_type TEXT,
  opened_at TIMESTAMPTZ,
  clicked_at TIMESTAMPTZ,
  open_count INTEGER DEFAULT 0,
  click_count INTEGER DEFAULT 0,
  client_id UUID REFERENCES clients(id) ON DELETE SET NULL,
  booking_id UUID REFERENCES bookings(id) ON DELETE SET NULL,
  metadata JSONB DEFAULT '{}',
  error_message TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
)
```

### 22. Email Bounces Table
**Purpose**: Email suppression list for bounced addresses

```sql
public.email_bounces (
  id UUID PRIMARY KEY,
  email_address TEXT UNIQUE NOT NULL,
  bounce_type TEXT NOT NULL,
  bounce_count INTEGER DEFAULT 1,
  first_bounced_at TIMESTAMPTZ DEFAULT NOW(),
  last_bounced_at TIMESTAMPTZ DEFAULT NOW(),
  suppressed BOOLEAN DEFAULT false,
  suppressed_at TIMESTAMPTZ,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
)
```

### 23. Podcast Emails Table
**Purpose**: Store podcast contact emails

```sql
public.podcast_emails (
  id UUID PRIMARY KEY,
  podcast_id TEXT NOT NULL,
  email TEXT NOT NULL,
  source TEXT, -- 'manual', 'scraped', 'podscan'
  verified BOOLEAN DEFAULT false,
  bounced BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  
  UNIQUE(podcast_id, email)
)
```

## Outreach & Messaging

### 24. Outreach Messages Table
**Purpose**: Template messages for podcast outreach

```sql
public.outreach_messages (
  id UUID PRIMARY KEY,
  title TEXT NOT NULL,
  subject_line TEXT NOT NULL,
  message_template TEXT NOT NULL,
  message_type TEXT DEFAULT 'initial' CHECK (message_type IN ('initial', 'follow_up', 'thank_you')),
  is_active BOOLEAN DEFAULT true,
  usage_count INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  created_by UUID REFERENCES auth.users(id)
)
```

### 25. Sales Calls Table
**Purpose**: Track sales calls and their outcomes

```sql
public.sales_calls (
  id UUID PRIMARY KEY,
  contact_name TEXT NOT NULL,
  contact_email TEXT,
  contact_linkedin TEXT,
  contact_company TEXT,
  call_date TIMESTAMPTZ,
  call_duration_minutes INTEGER,
  call_type TEXT DEFAULT 'discovery' CHECK (call_type IN ('discovery', 'demo', 'closing', 'onboarding')),
  outcome TEXT,
  notes TEXT,
  follow_up_required BOOLEAN DEFAULT false,
  follow_up_date DATE,
  deal_value_estimate INTEGER,
  hidden BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
)
```

## Administrative Tables

### 26. Admin Users Table
**Purpose**: Manage admin access to the platform

```sql
public.admin_users (
  id UUID PRIMARY KEY,
  email TEXT UNIQUE NOT NULL,
  name TEXT,
  added_by TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
)
```

### 27. Sync History Table
**Purpose**: Track data synchronization operations

```sql
public.sync_history (
  id UUID PRIMARY KEY,
  sync_type TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('running', 'completed', 'failed')),
  records_processed INTEGER DEFAULT 0,
  errors_count INTEGER DEFAULT 0,
  error_details TEXT,
  started_at TIMESTAMPTZ DEFAULT NOW(),
  completed_at TIMESTAMPTZ,
  duration_ms INTEGER
)
```

## Entity Relationship Summary

### Core Business Flow
1. **Clients** book podcast placements → **Bookings**
2. **Bookings** can have **Booking Addons** (additional services)
3. **Podcasts** table serves as central cache for podcast data
4. **Premium Podcasts** are available for e-commerce purchase by **Customers**
5. **Prospect Dashboards** showcase potential placements to prospects

### Content & Communication
1. **Blog Posts** are categorized by **Blog Categories**
2. **Email Logs** track all outbound communication
3. **Outreach Messages** provide templated communication
4. **Sales Calls** track business development activities

### Authentication & Security
1. **Admin Users** manage the platform
2. **Client Portal Tokens/Sessions** enable passwordless client access
3. All activity is logged in **Client Portal Activity Log**

## Key Database Functions

### Helper Functions

1. **`is_podcast_stale()`** - Check if podcast cache is stale
2. **`upsert_podcast()`** - Insert or update podcast data
3. **`increment_podcast_cache_hit()`** - Track cache usage
4. **`cleanup_expired_portal_data()`** - Clean expired tokens/sessions
5. **`get_client_portal_stats()`** - Portal usage statistics
6. **`update_updated_at_column()`** - Auto-update timestamp trigger

### Views

1. **`client_overview`** - Client summary with booking counts
2. **`calendar_view`** - Monthly booking breakdown
3. **`daily_bookings`** - Daily booking schedule
4. **`podcast_cache_statistics`** - Cache performance metrics

## Row Level Security (RLS) Policies

### Access Patterns

1. **Admin Access**: Full CRUD access for authenticated admin users
2. **Client Portal Access**: Clients can only access their own data via portal sessions
3. **Public Access**: Published blog posts, active premium podcasts, prospect dashboards
4. **Service Role**: Edge functions have elevated access for automation

### Security Context

- Client portal access uses `current_setting('app.current_client_id', true)` 
- Admin access verified via `admin_users` table lookup
- Public data filtered by `is_active` or `status = 'published'` flags

## Storage Buckets

### Client Assets Bucket
- **Purpose**: Store client photos, media kits, and other assets
- **Policies**: Authenticated users (admins) can upload, public read access

### Prospect Images Bucket  
- **Purpose**: Store prospect dashboard images
- **Policies**: Public read access, admin upload access

## Performance Optimizations

### Indexing Strategy
- Unique indexes on all external IDs (Stripe, Podscan)
- Composite indexes on common query patterns (client_id + date)
- JSONB GIN indexes for metadata searches
- Partial indexes on filtered queries (active records only)

### Caching Strategy
- Central `podcasts` table reduces API calls by 60-80%
- Cache hit tracking for analytics
- Stale data detection and refresh mechanisms

## Migration History
The database evolved through 60+ migration files from 2025-01-07 to 2026-01-29, indicating active development and iterative improvements to the schema.