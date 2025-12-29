# Get On A Pod - Complete Podcast Placement Platform

A comprehensive SaaS platform for managing podcast placement services, client relationships, and sales operations.

## 🚀 Project Overview

Get On A Pod is a full-stack application that helps founders and financial professionals build authority through podcast appearances. This platform includes client management, booking tracking, sales analytics, a secure client portal, premium podcast marketplace, and AI-powered sales call analysis.

## 🎯 Core Features

### Admin Dashboard
- **Client Management** - Complete CRM with client profiles, contact info, notes, and bio
- **Booking Tracking** - Track podcast bookings through full lifecycle (conversation → booked → recorded → published)
- **Calendar View** - Visual calendar for managing scheduled recordings and publish dates
- **Sales Analytics** - AI-powered analysis of sales calls with actionable recommendations
- **Campaign Management** - Email campaigns with reply tracking via Bison
- **Blog System** - Built-in content management for SEO and marketing

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
- **Google Sheets** - Automated podcast export and outreach tracking per client
- **Podscan API** - Real-time podcast metadata (audience size, ratings, episode count)
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
- `premium_podcasts` - Marketplace inventory
- `sales_calls` - Call recordings and AI analysis
- `campaigns` - Email campaign tracking
- `campaign_replies` - Bison reply integration
- `blog_posts` - Content management

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
npx supabase functions deploy send-portal-magic-link
npx supabase functions deploy verify-portal-token
npx supabase functions deploy create-client-google-sheet
npx supabase functions deploy export-to-google-sheets
npx supabase functions deploy get-client-outreach-podcasts
```

## 📝 Recent Updates (December 2025)

### Client Portal Enhancements
- ✅ Added analytics tab with month-over-month growth charts
- ✅ Implemented attention needed alerts for missing dates
- ✅ Added collapsible analytics sections
- ✅ Bar chart visualizations for bookings and quality metrics

### Bug Fixes
- ✅ Fixed booking update not refreshing UI (query cache invalidation)
- ✅ Fixed clearing dates not saving to database (null vs undefined)
- ✅ Fixed scheduled date detection in attention needed alerts
- ✅ Removed non-existent go_live_date field references

### Sales Analytics
- ✅ AI-powered call analysis with Corey Jackson framework
- ✅ Actionable recommendations with priority scoring
- ✅ Text analysis for pain points and goals
- ✅ Re-analyze functionality for updated insights

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
- Sales call performance and recommendations
- Client engagement and portal activity

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
