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
**27 tables powering the entire platform**
- 👥 **Core Entities**: Clients, bookings, podcasts, orders
- 💳 **E-commerce**: Customers, orders, premium podcasts, addons
- ✉️ **Communication**: Email logs, outreach messages, campaign replies
- 🔗 **Portal System**: Sessions, tokens, activity logs
- 📊 **Analytics**: Fit analyses, cache statistics, sync history

### [Edge Functions (A-F)](edge-functions-a-f.md)
**13 Functions - Analysis, authentication, and automation**
- 🤖 **AI Analysis**: `analyze-podcast-fit`, `analyze-sales-call`
- 🔐 **Account Creation**: `create-client-account`, `create-outreach-message`
- 💳 **Checkout**: `create-addon-checkout`, `create-checkout-session`
- 📊 **Data Operations**: `append-prospect-sheet`, `create-prospect-sheet`
- 🔗 **Webhooks**: `campaign-reply-webhook`
- 🔍 **SEO**: `check-indexing-status`

### [Edge Functions (L-S)](edge-functions-l-s.md)
**13 Functions - Login, management, and synchronization**
- 🔐 **Authentication**: `login-with-password`, `logout-portal-session`, `send-portal-magic-link`
- 👨‍💼 **Admin Management**: `manage-admin-users`
- 📞 **Outreach**: `read-outreach-list`, `score-podcast-compatibility`, `send-outreach-webhook`
- ✉️ **Email**: `send-reply`, `resend-webhook`
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
- 📊 **Data Layer**: React Query integration, caching strategies
- 🎯 **External APIs**: Podscan integration, file uploads
- 📱 **Components**: Protected routes, error handling, analytics

### [MCP Server](mcp-server.md)
**Model Context Protocol server for AI-powered prospect management**
- 🤖 **AI Matching**: Semantic search across 7,884 podcasts  
- 📊 **Prospect Management**: Create dashboards, enable publishing
- 🔍 **Advanced Search**: Embedding-based similarity with AI filtering
- 📈 **BridgeKit Compatible**: HTTP API bridge for web integration

## 🛠️ Core Architecture

### Technology Stack
```
Frontend:     React + TypeScript + Tailwind + React Query
Backend:      Supabase (PostgreSQL + Edge Functions)
Auth:         Supabase Auth + Custom Portal System
AI Services:  OpenAI (embeddings) + Anthropic Claude (analysis)
Payments:     Stripe Checkout + Webhooks
Email:        Resend + Email Bison
Storage:      Supabase Storage (client assets)
Search:       Podscan API + pgvector (embeddings)
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
       └── Stripe ─────────┼── Email Services ─┘
           (Payments)      │   (Resend/Bison)
                           └── File Storage
                               (Supabase)
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

### AI & Analysis
| Function | Method | Purpose | Auth |
|----------|--------|---------|------|
| `analyze-podcast-fit` | POST | AI podcast analysis | Service |
| `analyze-sales-call` | POST | Sales call analysis | Service |
| `score-podcast-compatibility` | POST | Compatibility scoring | None |

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
| `enable_prospect_dashboard` | Publish prospect dashboard | `prospect_id` |
| `match_podcasts_for_prospect` | AI-powered podcast matching | `prospect_name` |

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
- **`podcasts`** - Central podcast cache (7,884 records)
- **`premium_podcasts`** - E-commerce podcast inventory
- **`orders` + `order_items`** - Purchase tracking
- **`client_portal_sessions`** - Portal authentication
- **`campaign_replies`** - Email outreach responses
- **`blog_posts`** - SEO content management

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
BISON_API_TOKEN=your-bison-token

# External APIs
PODSCAN_API_KEY=your-podscan-key
FATHOM_API_KEY=your-fathom-key
```

### 2. Local Development
```bash
# Frontend
npm install
npm run dev

# Edge Functions
supabase functions serve

# MCP Server  
cd mcp-server
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

**Last Updated**: February 2026  
**Platform Version**: 2.0  
**Total Endpoints**: 25 Edge Functions + Direct Database Access  
**Database Tables**: 27 tables with comprehensive relationships