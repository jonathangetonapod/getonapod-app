# Authority Built API Documentation Index

Welcome to the comprehensive API documentation for **Authority Built** - a podcast placement platform that manages client bookings, outreach campaigns, and premium podcast opportunities.

## 🚀 Quick Start Guide

### Authentication Methods

Authority Built supports multiple authentication systems:

1. **Admin Authentication** (Supabase Auth + Admin Table)
   - Google OAuth or email/password
   - Admin email validation via `admin_users` table
   - JWT tokens for API access

2. **Client Portal Authentication** (Session-based)
   - Magic link (passwordless) authentication
   - Password authentication  
   - Session tokens with 24-hour expiry
   - Admin impersonation for support

3. **Service Role Access** (Backend Functions)
   - Supabase service role key for Edge Functions
   - Used for automated operations and secure data access

### Base URLs

- **Main Application**: `https://authoritybuilt.com`
- **Client Portal**: `https://authoritybuilt.com/portal`
- **Supabase Edge Functions**: `https://your-project.supabase.co/functions/v1/`
- **Supabase Database**: Direct connection via Supabase client

## 📋 API Categories Overview

### [Client Portal System](client-portal.md)
**Complete client-facing interface for podcast management**
- 🔐 **Authentication**: Magic links and password login
- 📊 **Dashboard**: Booking tracking, analytics, calendar view
- 🛍️ **E-commerce**: Addon services and premium placements
- 📚 **Resources**: Educational content and best practices

### [Database Schema](database-schema.md)
**37 tables powering the entire platform**
- 👥 **Core Entities**: Clients, bookings, podcasts, orders
- 💳 **E-commerce**: Customers, orders, premium podcasts, addons
- ✉️ **Communication**: Email logs, outreach messages, campaign replies
- 🔗 **Portal System**: Sessions, tokens, activity logs
- 📊 **Analytics**: Fit analyses, cache statistics, sync history
- 🤖 **AI & Vectors**: Podcast embeddings (pgvector), client/prospect analyses
- 📋 **Outreach**: Outreach actions, approval workflows, guest resources

### [Edge Functions (A-F)](edge-functions-a-f.md)
**15 Functions - Analysis, authentication, and automation**
- 🤖 **AI Analysis**: `analyze-podcast-fit`, `analyze-sales-call`, `classify-reply`
- 🔐 **Account Creation**: `create-client-account`, `create-outreach-message`
- 💳 **Checkout**: `create-addon-checkout`, `create-checkout-session`
- 📊 **Data Operations**: `append-prospect-sheet`, `backfill-prospect-podcasts`, `create-prospect-sheet`
- 🔗 **Webhooks**: `campaign-reply-webhook`
- 🔍 **SEO**: `check-indexing-status`

### [Edge Functions (D-G)](edge-functions-d-g.md)
**New - Data operations, generation, and Google integrations**
- 🗑️ **Data Operations**: `delete-outreach-podcast`, `delete-podcast-from-sheet`, `delete-reply`
- 📥 **Reply Management**: `fetch-and-classify-replies`, `fetch-email-thread`
- 📄 **Content Generation**: `generate-blog-content`, `generate-client-bio`, `generate-guest-resource`, `generate-media-kit-doc`, `generate-podcast-queries`, `generate-podcast-summary`, `generate-reply`, `generate-tagline`
- 📊 **Data Retrieval**: `get-client-bookings`, `get-client-outreach-podcasts`, `get-client-podcasts`, `get-outreach-podcasts`, `get-prospect-podcasts`

### [Edge Functions (L-S)](edge-functions-l-s.md)
**Login, management, QA, and synchronization**
- 🔐 **Authentication**: `login-with-password`, `logout-portal-session`, `send-portal-magic-link`
- 👨‍💼 **Admin Management**: `manage-admin-users`
- 📞 **Outreach**: `read-outreach-list`, `score-podcast-compatibility`, `send-outreach-webhook`
- ✉️ **Email**: `send-reply`, `resend-webhook`
- 🔍 **QA**: `qa-review-podcasts`
- 📈 **SEO**: `submit-to-indexing`
- 🔄 **Sync**: `sync-fathom-calls`, `sync-replies`
- 💳 **Payments**: `stripe-webhook`

### [Edge Functions (V + Shared)](edge-functions-v-shared.md)
**Validation functions and shared utilities**
- ✅ **Validation**: `validate-portal-session`, `verify-portal-token`
- 📧 **Email Templates**: Professional invitation and magic link emails
- 🗄️ **Podcast Cache**: Central caching system (60-80% API savings)

### [Frontend API Layer](frontend-api-layer.md)
**React-based frontend with TypeScript and React Query**
- ⚛️ **Architecture**: Supabase client, service patterns, context providers
- 🔐 **Auth Contexts**: Admin and client portal authentication
- 📊 **Data Layer**: React Query integration, caching strategies, Zustand state management
- 🎯 **External APIs**: Podscan, HeyGen video, Stripe, Google Calendar, Anthropic Claude
- 🛒 **E-commerce**: Cart store, checkout, orders, premium placements
- 📱 **Components**: Protected routes, error handling, Sentry monitoring
- 🧩 **Services**: 20+ domain-specific service modules

### [Admin Features](admin-features.md)
**24 admin pages for platform management**
- 📊 **Dashboard**: Overview, analytics, calendar
- 👥 **Management**: Clients, customers, prospects, orders, onboarding
- 🎙️ **Podcasts**: Finder, database, premium placements
- 📧 **Outreach**: Platform, messages, automation
- 📝 **Content**: Blog, guest resources, video management

### [MCP Server](mcp-server.md)
**Model Context Protocol server for AI-powered prospect management**
- 🤖 **AI Matching**: Semantic search with pgvector embeddings
- 📊 **Prospect Management**: Create dashboards with structured profiles
- 🔍 **Advanced Search**: Embedding-based similarity with AI filtering (0.30 threshold)
- 📈 **BridgeKit Compatible**: HTTP API bridge for web integration

## 🛠️ Core Architecture

### Technology Stack
```
Frontend:     React + TypeScript + Tailwind + React Query + Zustand
Backend:      Supabase (PostgreSQL + Edge Functions)
Auth:         Supabase Auth + Custom Portal System
AI Services:  OpenAI (embeddings) + Anthropic Claude (analysis/generation)
Video:        HeyGen (AI video generation)
Payments:     Stripe Checkout + Webhooks
Email:        Resend + Email Bison
Storage:      Supabase Storage (client assets)
Search:       Podscan API + pgvector (embeddings)
Monitoring:   Sentry (error tracking + session replay)
```

### Data Flow Architecture
```
┌─────────────┐    ┌──────────────┐    ┌─────────────┐
│   Frontend  │ ── │ Supabase RLS │ ── │  Database   │
│   (React)   │    │ + Functions  │    │(PostgreSQL)│
└─────────────┘    └──────────────┘    └─────────────┘
       │                   │                   │
       ├── External APIs ──┼── AI Services ────┤
       │   (Podscan)       │   (OpenAI/Claude) │
       ├── Stripe ─────────┼── Email Services ─┤
       │   (Payments)      │   (Resend/Bison)  │
       ├── HeyGen ─────────┼── Monitoring ─────┤
       │   (Video)         │   (Sentry)        │
       └── Google APIs ────┴── File Storage ───┘
           (Docs/Calendar)     (Supabase)
```

## 📊 All API Endpoints Summary

### Authentication Endpoints
| Function | Method | Purpose | Auth |
|----------|--------|---------|------|
| `send-portal-magic-link` | POST | Send magic link email | None |
| `verify-portal-token` | POST | Validate magic link token | None |
| `login-with-password` | POST | Password authentication | None |
| `validate-portal-session` | POST | Validate session token | Service |
| `logout-portal-session` | POST | End user session | None |
| `manage-admin-users` | POST | CRUD admin management | Admin |

### Client & Prospect Management
| Function | Method | Purpose | Auth |
|----------|--------|---------|------|
| `create-client-account` | POST | Full client onboarding | Optional |
| `create-client-google-sheet` | POST | Create client spreadsheet | Service |
| `create-prospect-sheet` | POST | Create prospect dashboard | Service |
| `append-prospect-sheet` | POST | Add podcasts to prospect | Service |
| `backfill-prospect-podcasts` | POST | Vector search + AI match podcasts | Service |

### AI & Analysis
| Function | Method | Purpose | Auth |
|----------|--------|---------|------|
| `analyze-podcast-fit` | POST | AI podcast analysis | Service |
| `analyze-sales-call` | POST | Sales call analysis | Service |
| `score-podcast-compatibility` | POST | Compatibility scoring | None |
| `qa-review-podcasts` | POST | QA score podcasts vs prospect bio | Service |
| `classify-reply` | POST | Classify email reply type | Service |

### E-commerce & Payments
| Function | Method | Purpose | Auth |
|----------|--------|---------|------|
| `create-checkout-session` | POST | Podcast placement orders | None |
| `create-addon-checkout` | POST | Addon service orders | Service |
| `stripe-webhook` | POST | Payment confirmations | Webhook |

### Outreach & Communication
| Function | Method | Purpose | Auth |
|----------|--------|---------|------|
| `read-outreach-list` | POST | Read Google Sheets data | None |
| `send-outreach-webhook` | POST | Notify outreach systems | None |
| `create-outreach-message` | POST | Store outreach messages | Service |
| `create-bison-lead` | POST | Create Email Bison leads | Service |
| `send-reply` | POST | Send Email Bison replies | None |
| `generate-reply` | POST | AI-generate contextual email reply | Service |
| `delete-reply` | POST | Delete reply from Bison + DB | Service |
| `fetch-and-classify-replies` | POST | Bulk fetch + AI classify replies | Service |

### Content Generation
| Function | Method | Purpose | Auth |
|----------|--------|---------|------|
| `generate-blog-content` | POST | AI blog content generation | Bearer |
| `generate-client-bio` | POST | AI client bio generation | Service |
| `generate-media-kit-doc` | POST | Generate Google Doc media kit | Service |
| `generate-podcast-queries` | POST | Generate podcast search queries | Service |
| `generate-podcast-summary` | POST | AI podcast summary | Service |
| `generate-tagline` | POST | AI tagline generation | Service |
| `generate-guest-resource` | POST | Generate guest resource content | Service |

### Data Synchronization
| Function | Method | Purpose | Auth |
|----------|--------|---------|------|
| `sync-fathom-calls` | POST/GET | Import meeting recordings | None |
| `sync-replies` | POST/GET | Sync email replies | None |

### SEO & Content
| Function | Method | Purpose | Auth |
|----------|--------|---------|------|
| `submit-to-indexing` | POST | Google indexing submission | None |
| `check-indexing-status` | POST | Google indexing status | Service |

### Webhooks
| Function | Method | Purpose | Auth |
|----------|--------|---------|------|
| `campaign-reply-webhook` | POST | Email Bison replies | Webhook |
| `resend-webhook` | POST | Email delivery events | Webhook |

### MCP Tools (AI Assistant Integration)
| Tool | Purpose | Required Params |
|------|---------|-----------------|
| `create_prospect` | Create prospect dashboard | `prospect_name` |
| `match_podcasts` | AI-powered podcast matching | `prospect_name` |

> **Note**: `enable_prospect_dashboard` exists in code but is not currently registered in the MCP server.

## 🔐 Authentication Examples

### Admin Authentication (Frontend)
```javascript
import { supabase } from '@/lib/supabase'

// Google OAuth
const { data, error } = await supabase.auth.signInWithOAuth({
  provider: 'google',
  options: {
    redirectTo: `${window.location.origin}/auth/callback`
  }
})

// Email/Password
const { data, error } = await supabase.auth.signInWithPassword({
  email: 'admin@example.com',
  password: 'password123'
})
```

### Client Portal Authentication
```javascript
// Magic Link Request
const response = await fetch('/functions/v1/send-portal-magic-link', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ email: 'client@example.com' })
})

// Token Verification
const response = await fetch('/functions/v1/verify-portal-token', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ token: 'magic-link-token' })
})

// Password Login
const response = await fetch('/functions/v1/login-with-password', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    email: 'client@example.com',
    password: 'clientpassword'
  })
})
```

### Edge Function Authentication
```javascript
import { createClient } from '@supabase/supabase-js'

const supabaseUrl = Deno.env.get('SUPABASE_URL')!
const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

const supabase = createClient(supabaseUrl, supabaseKey)

// Functions use service role key for database access
```

## 🗄️ Database Quick Access

### Primary Tables
- **`clients`** - Client accounts and portal settings
- **`bookings`** - Podcast booking tracking
- **`podcasts`** - Central podcast cache with vector embeddings
- **`premium_podcasts`** - E-commerce podcast inventory
- **`orders` + `order_items`** - Purchase tracking
- **`client_portal_sessions`** - Portal authentication
- **`campaign_replies`** - Email outreach responses
- **`outreach_messages`** - Outreach email approval queue
- **`prospect_dashboards`** - Prospect profiles with structured fields
- **`client_podcast_analyses`** - Client-specific AI podcast analysis
- **`prospect_podcast_analyses`** - Prospect-specific AI podcast analysis
- **`blog_posts`** - SEO content management
- **`guest_resources`** - Educational content for podcast guests

### Key Features
- **Row Level Security (RLS)** - Data access control
- **pgvector** - Semantic search with embeddings
- **JSONB columns** - Flexible metadata storage
- **Audit logging** - Comprehensive activity tracking
- **Cache optimization** - 60-80% API call reduction

## 🚀 Getting Started

### 1. Environment Setup
```bash
# Required Environment Variables
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_ANON_KEY=your-anon-key
SUPABASE_SERVICE_ROLE_KEY=your-service-key

# AI Services
OPENAI_API_KEY=your-openai-key
ANTHROPIC_API_KEY=your-claude-key

# Payment Processing
STRIPE_SECRET_KEY=your-stripe-key

# Email Services
RESEND_API_KEY=your-resend-key
EMAIL_BISON_API_TOKEN=your-bison-token

# External APIs
PODSCAN_API_KEY=your-podscan-key
FATHOM_API_KEY=your-fathom-key

# Video Generation
HEYGEN_API_KEY=your-heygen-key

# Frontend-specific (VITE_ prefix)
VITE_STRIPE_PUBLISHABLE_KEY=your-stripe-pub-key
VITE_HEYGEN_API_KEY=your-heygen-key
VITE_ANTHROPIC_API_KEY=your-anthropic-key
VITE_VIDEO_SERVICE_URL=your-video-service-url
VITE_SENTRY_DSN=your-sentry-dsn
```

### 2. Local Development
```bash
# Frontend
npm install
npm run dev

# Edge Functions
supabase functions serve

# MCP Server
cd mcp-prospect-dashboard
npm install
npm run build
npm start
```

### 3. Common Operations

#### Create a New Client
```javascript
const { data, error } = await supabase.functions.invoke('create-client-account', {
  body: {
    name: 'John Smith',
    email: 'john@example.com',
    enable_portal_access: true,
    send_invitation_email: true
  }
})
```

#### Get Client Bookings
```javascript
const { data, error } = await supabase
  .from('bookings')
  .select('*')
  .eq('client_id', clientId)
  .order('created_at', { ascending: false })
```

#### Analyze Podcast Fit
```javascript
const { data, error } = await supabase.functions.invoke('analyze-podcast-fit', {
  body: {
    podcastName: 'The Tim Ferriss Show',
    podcastDescription: 'Five-time #1 New York Times best-selling author...',
    clientName: 'Sarah Johnson',
    clientBio: 'Marketing expert with 15 years of experience...'
  }
})
```

## 📚 Documentation Structure

Each documentation section provides:
- **Complete endpoint reference** with request/response examples
- **Authentication requirements** and security considerations  
- **Error handling patterns** and status codes
- **Integration examples** with practical code samples
- **Database schema details** where relevant
- **Performance considerations** and optimization tips

## 🆘 Support & Troubleshooting

### Common Issues
1. **Authentication Failures** - Check admin_users table and portal_access_enabled
2. **CORS Errors** - Verify allowed origins in Supabase dashboard
3. **Edge Function Timeouts** - Functions have 60-second timeout limit
4. **Database RLS** - Ensure proper row-level security policies
5. **API Rate Limits** - External services have varying limits

### Debug Tips
- Enable Edge Function logs in Supabase dashboard
- Use browser network tab for API inspection
- Check environment variables in function deployments
- Validate JWT tokens using jwt.io

### Contact
- **Technical Issues**: Check function logs and database monitoring
- **API Questions**: Refer to individual endpoint documentation
- **Integration Help**: See integration examples in each section

---

**Last Updated**: March 2026
**Platform Version**: 2.1
**Total Endpoints**: 50 Edge Functions + Direct Database Access + 2 MCP Tools
**Database Tables**: 37 tables with comprehensive relationships
**Frontend Services**: 20+ domain-specific service modules