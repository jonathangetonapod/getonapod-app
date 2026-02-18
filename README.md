# Get On A Pod - Complete Podcast Placement Platform

A comprehensive SaaS platform for managing podcast placement services, client relationships, and sales operations.

## 🚀 Project Overview

Get On A Pod is a full-stack application that helps founders and financial professionals build authority through podcast appearances. This platform includes client management, booking tracking, sales analytics, a secure client portal, premium podcast marketplace, and AI-powered sales call analysis.

## 🎯 Core Features

### Admin Dashboard
- **Client Management** - Complete CRM with client profiles, contact info, notes, and bio
- **Booking Tracking** - Track podcast bookings through full lifecycle (conversation → booked → recorded → published)
- **Calendar View** - Visual calendar for managing scheduled recordings and publish dates
- **Podcast Finder** - AI-powered podcast discovery with query generation and compatibility scoring
- **Podcast Database** - Browse 1,000+ cached podcasts with advanced filtering and matching
- **Prospect Dashboards** - Create personalized podcast recommendation dashboards for prospects
- **Sales Analytics** - AI-powered analysis of sales calls with actionable recommendations
- **Campaign Management** - Email campaigns with reply tracking via Bison
- **Blog System** - Built-in content management for SEO and marketing

### AI-Powered Podcast Discovery

#### Podcast Finder
- **Smart Query Generation** - AI generates 5 targeted search queries based on client/prospect bio
- **Compatibility Scoring** - Claude AI scores podcast fit (1-10) with detailed reasoning
- **Batch Processing** - Score up to 50 podcasts in parallel batches
- **Export to Google Sheets** - One-click export with automatic cache population
- **Dual Mode** - Works for both existing clients and new prospects
- **Real-time Search** - Instant results from Podscan API (5,000,000+ podcasts)

#### Podcast Database
- **Centralized Cache** - Browse 2,400+ pre-fetched podcasts from central database
- **Vector Embeddings** - AI-powered semantic search for intelligent prospect-podcast matching
- **Four Modes:**
  - **Browse** - View all cached podcasts with filtering and search
  - **Match for Client** - Score and export podcasts to client sheets
  - **Match for Prospect** - Score and export to prospect dashboards
  - **Analytics** - Comprehensive insights into database growth, performance, and trends
- **Advanced Filtering** - Search by name, category, audience size, rating, language, region, email availability
- **Smart Caching** - 60-80% API cost reduction through proactive cache optimization
- **Table Density Control** - Compact/Comfortable/Spacious view options
- **Column Visibility** - Show/hide columns based on preference
- **Export Integration** - Same Google Sheets export as Podcast Finder

#### Prospect Dashboards
- **Personalized Recommendations** - Create custom podcast lists for prospects
- **Google Sheets Integration** - Each prospect gets their own shareable sheet
- **Bio-Based Matching** - AI analyzes prospect background for best-fit podcasts
- **Public Dashboard URLs** - Shareable links for prospect viewing
- **Approval Workflow** - Review and enable dashboards before sharing

### Client Portal (Magic Link Auth)
- **Secure Access** - Passwordless authentication via email magic links (15-min expiry)
- **Dashboard** - View all podcast bookings with status, dates, and episode URLs
- **Analytics Tab** - Month-over-month growth metrics (bookings, reach, quality improvements)
- **Calendar View** - See scheduled recordings and publish dates
- **Attention Needed** - Alerts for bookings missing scheduled/recording/publish dates
- **Outreach List** - View podcasts in the outreach pipeline from Google Sheets
- **Premium Placements** - Browse and add guaranteed podcast spots to cart

### Premium Podcast Marketplace
- **Public Storefront** - Browse 150+ premium podcast placement opportunities
- **Advanced Filters** - Filter by category, audience size, price range
- **Shopping Cart** - Add multiple placements and checkout
- **Featured Listings** - Highlight top-tier opportunities

### Integrations
- **Claude AI (Anthropic)** - Haiku for compatibility scoring, Sonnet for query generation
- **Google Sheets** - Automated podcast export and outreach tracking per client/prospect
- **Podscan API** - Real-time podcast search and metadata (5M+ podcasts)
- **Resend** - Transactional emails (magic links, notifications)
- **Bison** - Email campaign management and reply tracking
- **Supabase** - Database, authentication, storage, edge functions

### Sales & Analytics
- **Call Recording Analysis** - AI-powered insights using Corey Jackson sales framework
- **Recommendations Engine** - Context-aware next steps for each sales call
- **Text Analysis** - Extract pain points, goals, and key metrics from transcripts
- **Performance Tracking** - Monitor booking trends, revenue, and conversion rates

## 🛠️ Tech Stack

### Frontend
- **Framework:** React 18 + TypeScript
- **Build Tool:** Vite 5.4
- **Styling:** Tailwind CSS 3.4 with custom theme
- **UI Components:** shadcn/ui (60+ components)
- **Routing:** React Router DOM 7
- **State Management:** React Query (TanStack Query), Zustand
- **Forms:** React Hook Form + Zod validation
- **Charts:** Recharts
- **Icons:** Lucide React

### Backend
- **Database:** PostgreSQL (Supabase)
- **Auth:** Custom magic link system + Supabase Auth
- **Edge Functions:** Deno (Supabase Functions)
- **Storage:** Supabase Storage (client assets, resources)
- **APIs:** REST + Supabase Realtime

### Infrastructure
- **Hosting:** Railway
- **Database:** Supabase (PostgreSQL with RLS)
- **Email:** Resend
- **DNS:** Cloudflare
- **Version Control:** GitHub

## 📦 Installation & Setup

```bash
# Clone the repository
git clone https://github.com/jonathangetonapod/authority-built
cd authority-built

# Install dependencies
npm install

# Set up environment variables
cp .env.example .env.local
# Edit .env.local with your Supabase and API keys

# Start development server
npm run dev
```

The site will be available at `http://localhost:5173`

### Environment Variables

```env
# Supabase
VITE_SUPABASE_URL=your_supabase_url
VITE_SUPABASE_ANON_KEY=your_supabase_anon_key

# Podscan API
VITE_PODSCAN_API_KEY=your_podscan_api_key

# Resend (for email)
RESEND_API_KEY=your_resend_api_key

# Portal
PORTAL_BASE_URL=https://yourdomain.com
```

## 🗄️ Database Schema

### Core Tables
- `clients` - Client profiles and metadata
- `bookings` - Podcast bookings with status tracking
- `podcasts` - Centralized podcast cache (2,431+ podcasts with metadata and vector embeddings)
- `prospect_dashboards` - Prospect information and Google Sheet links
- `premium_podcasts` - Marketplace inventory
- `sales_calls` - Call recordings and AI analysis
- `campaigns` - Email campaign tracking
- `campaign_replies` - Bison reply integration
- `blog_posts` - Content management

### Vector Search Tables
- `podcasts.embedding` - 1536-dimension vector embeddings (text-embedding-3-small)
- `search_similar_podcasts()` - Semantic search function using cosine similarity

### Portal System
- `client_portal_tokens` - Magic link tokens (15-min expiry)
- `client_portal_sessions` - Active sessions (24-hour expiry)
- `client_portal_activity_log` - Audit trail for security

### Features
- **Row Level Security (RLS)** - Clients can only access their own data
- **Automatic Timestamps** - created_at, updated_at via triggers
- **Soft Deletes** - Archived flag instead of deletion
- **Foreign Key Constraints** - Data integrity enforcement

## 🚀 Deployment

### Railway (Production)

```bash
# Deploy to Railway
railway up

# View logs
railway logs
```

### Supabase Functions

```bash
# Deploy edge functions

# Portal & Auth
npx supabase functions deploy send-portal-magic-link
npx supabase functions deploy verify-portal-token

# Google Sheets Integration
npx supabase functions deploy create-client-google-sheet
npx supabase functions deploy export-to-google-sheets
npx supabase functions deploy get-client-outreach-podcasts
npx supabase functions deploy delete-outreach-podcast

# Podcast Finder (AI-Powered)
npx supabase functions deploy generate-podcast-queries
npx supabase functions deploy score-podcast-compatibility

# Prospect Dashboards
npx supabase functions deploy create-prospect-sheet
npx supabase functions deploy append-prospect-sheet

# Podcast Metadata
npx supabase functions deploy get-client-podcasts
npx supabase functions deploy analyze-podcast-fit
```

## 📝 Recent Updates (January 2026)

### AI-Powered Semantic Podcast Matching (January 29, 2026)
- ✅ **Massive Database Expansion** - Grew from 1,422 to 2,431 podcasts (+71% growth)
- ✅ **Vector Embeddings** - Generated embeddings for all 2,431 podcasts using OpenAI text-embedding-3-small
- ✅ **pgvector Integration** - Enabled semantic search with cosine similarity
- ✅ **Intelligent Matching** - Match prospects to podcasts based on meaning, not just keywords
- ✅ **Top 20 Categories** - Focused scraping on most popular categories (Business, News, Culture, Technology, etc.)
- ✅ **Search Function** - Built `search_similar_podcasts()` for prospect-podcast matching
- ✅ **Cost Efficient** - Total embedding cost: ~$0.06 for 2,431 podcasts

## 📝 Recent Updates (January 2026)

### Podcast Database Analytics Dashboard (January 26, 2026)
- ✅ **Comprehensive Analytics View** - New Analytics mode with 7 database views
- ✅ **Growth Tracking** - Daily, weekly, and monthly podcast additions
- ✅ **Coverage Statistics** - Email coverage %, demographics %, geographic diversity
- ✅ **Cost Optimization Metrics** - Cache efficiency %, API calls saved, money saved
- ✅ **Top Performers** - Top 20 most cached podcasts with reuse counts
- ✅ **Category Insights** - Top 30 categories with audience metrics and distribution
- ✅ **Recently Added** - Last 20 podcasts with ratings and audience size
- ✅ **Visual Analytics** - Progress bars, stat cards, and ranking lists
- ✅ **Auto-refresh** - Live data updates every 60 seconds

### Email Extraction & UX Improvements (January 25, 2026)
- ✅ **Automatic Email Extraction** - All podcast fetches now capture contact emails from Podscan API
- ✅ **Database Column Rename** - Renamed `email` to `podscan_email` for clarity
- ✅ **Email Filter** - Filter podcasts by email availability
- ✅ **Table Density Control** - Compact/Comfortable/Spacious view options
- ✅ **Category Dropdown Scrolling** - Scrollable multi-select category filter
- ✅ **Column Visibility** - Show/hide table columns based on preference
- ✅ **Enhanced Caching** - Emails automatically saved to central cache

### AI-Powered Podcast Discovery System
- ✅ Built complete Podcast Finder with AI query generation (Claude Sonnet)
- ✅ Implemented compatibility scoring with Claude Haiku (1-10 scale with reasoning)
- ✅ Created Podcast Database page with centralized cache (1,000+ podcasts)
- ✅ Added four-mode architecture: Browse, Match for Client, Match for Prospect, Analytics
- ✅ Integrated Google Sheets export for clients and prospects
- ✅ Built prospect dashboard system with shareable public URLs

### Cache Optimization & Cost Reduction
- ✅ Implemented proactive caching during export (saves API calls)
- ✅ Created centralized `podcasts` table for deduplication across clients
- ✅ Added epic logging to all edge functions for observability
- ✅ Achieved 60-80% API cost reduction through smart caching
- ✅ Built `podcast_cache_statistics` view for monitoring savings
- ✅ Added detailed analytics views for comprehensive insights

### Prospect Dashboard Features
- ✅ Create personalized podcast recommendations for prospects
- ✅ Google Sheets integration (one sheet per prospect)
- ✅ Public dashboard URLs with slug-based routing
- ✅ Approval workflow (draft → enabled → published)
- ✅ Bio-based AI matching for best-fit podcasts

### Previous Updates (December 2025)

#### Client Portal Enhancements
- ✅ Added analytics tab with month-over-month growth charts
- ✅ Implemented attention needed alerts for missing dates
- ✅ Added collapsible analytics sections
- ✅ Bar chart visualizations for bookings and quality metrics

#### Bug Fixes
- ✅ Fixed booking update not refreshing UI (query cache invalidation)
- ✅ Fixed clearing dates not saving to database (null vs undefined)
- ✅ Fixed scheduled date detection in attention needed alerts
- ✅ Removed non-existent go_live_date field references

#### Sales Analytics
- ✅ AI-powered call analysis with Corey Jackson framework
- ✅ Actionable recommendations with priority scoring
- ✅ Text analysis for pain points and goals
- ✅ Re-analyze functionality for updated insights

## 💰 Cost Optimization

### Intelligent Podcast Caching
- **Centralized Database** - Single `podcasts` table shared across all clients/prospects
- **Proactive Caching** - Exports automatically save metadata to cache
- **Reactive Caching** - Fetches save to cache for future use
- **Deduplication** - Popular podcasts cached once, used by all
- **Cost Tracking** - Real-time statistics on API calls saved and money saved
- **60-80% Savings** - Typical reduction in Podscan API costs

### Cache Statistics Views
```sql
-- Basic stats
SELECT * FROM podcast_cache_statistics;

-- Detailed analytics
SELECT * FROM podcast_cache_statistics_detailed;
-- Shows: total_podcasts, email_coverage_pct, demographics_coverage_pct,
--        cache_efficiency_pct, estimated_money_saved_usd, and more

-- Growth tracking
SELECT * FROM podcast_growth_stats;
-- Shows: added_today, added_last_7_days, added_last_30_days

-- Top performers
SELECT * FROM top_cached_podcasts;
SELECT * FROM recently_added_podcasts;

-- Category insights
SELECT * FROM podcast_category_stats;

-- Distribution analysis
SELECT * FROM podcast_audience_distribution;
SELECT * FROM podcast_rating_distribution;
```

See `EXPORT_CACHE_OPTIMIZATION.md` for detailed documentation.

## 🔐 Security Features

### Client Portal
- **Passwordless Auth** - Magic links via email (no password vulnerabilities)
- **Token Expiry** - 15-minute tokens, 24-hour sessions
- **Rate Limiting** - 15 magic link requests per 15 minutes
- **IP Tracking** - Audit log with IP addresses and user agents
- **RLS Policies** - Database-level access control
- **Generic Error Messages** - Prevents email enumeration

### Admin
- **Supabase Auth** - Industry-standard authentication
- **RLS Enforcement** - All queries filtered by permissions
- **Secure Edge Functions** - Server-side validation

## 📊 Key Metrics

The platform tracks:
- Total bookings and conversion rates
- Audience reach per booking (quality metric)
- Month-over-month growth in bookings secured
- Episode publish rates and timelines
- Podcast cache efficiency and API cost savings (with detailed analytics)
- Database growth metrics (daily, weekly, monthly additions)
- Email and demographics coverage percentages
- Geographic diversity (languages, regions)
- Category distribution and audience insights
- Top cached podcasts and reuse rates
- Compatibility scoring success rates
- Sales call performance and recommendations
- Client engagement and portal activity
- Prospect dashboard creation and engagement

## 🎨 UI/UX Features

- ✅ Fully responsive design (mobile-first)
- ✅ Dark mode support throughout
- ✅ Accessible components (WCAG compliant)
- ✅ Loading states and optimistic updates
- ✅ Toast notifications for user feedback
- ✅ Modal dialogs and slide-out sheets
- ✅ Interactive charts and data visualizations
- ✅ Search, filter, and sort functionality

## 📚 Documentation

- [React Documentation](https://react.dev)
- [Supabase Documentation](https://supabase.com/docs)
- [Tailwind CSS](https://tailwindcss.com/docs)
- [shadcn/ui](https://ui.shadcn.com)
- [TanStack Query](https://tanstack.com/query)

## 🤝 Support

For questions or issues:
- Email: jonathan@getonapod.com
- GitHub Issues: [Report an issue](https://github.com/jonathangetonapod/authority-built/issues)

## 📄 License

Private - All Rights Reserved

---

Built with [Claude Code](https://claude.com/claude-code) 🤖
