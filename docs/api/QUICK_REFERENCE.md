# Authority Built API Quick Reference

**🚀 One-page cheat sheet for all API endpoints, authentication, and common operations**

## 🔐 Authentication Quick Setup

### Admin Auth (Frontend)
```javascript
// Google OAuth
await supabase.auth.signInWithOAuth({ provider: 'google' })

// Email/Password  
await supabase.auth.signInWithPassword({ email, password })
```

### Client Portal Auth
```javascript
// Magic Link
POST /functions/v1/send-portal-magic-link
{ "email": "client@example.com" }

// Verify Token
POST /functions/v1/verify-portal-token  
{ "token": "magic-link-token" }

// Password Login
POST /functions/v1/login-with-password
{ "email": "client@example.com", "password": "password" }
```

### Service Role (Backend)
```javascript
const supabase = createClient(url, SUPABASE_SERVICE_ROLE_KEY)
```

## 📋 All API Endpoints

### 🔐 Authentication & Sessions
| Endpoint | Method | Purpose | Body |
|----------|--------|---------|------|
| `/send-portal-magic-link` | POST | Send magic link | `{email}` |
| `/verify-portal-token` | POST | Verify magic link | `{token}` |
| `/login-with-password` | POST | Password login | `{email, password}` |
| `/validate-portal-session` | POST | Check session | `{sessionToken}` |
| `/logout-portal-session` | POST | End session | `{sessionToken}` |
| `/manage-admin-users` | POST | Admin CRUD | `{action, email, ...}` |

### 👥 Client Management
| Endpoint | Method | Purpose | Body |
|----------|--------|---------|------|
| `/create-client-account` | POST | Full onboarding | `{name, email, bio, ...}` |
| `/create-client-google-sheet` | POST | Create spreadsheet | `{clientId, clientName}` |

### 🎯 Prospect Management
| Endpoint | Method | Purpose | Body |
|----------|--------|---------|------|
| `/create-prospect-sheet` | POST | Create dashboard | `{prospectName, podcasts[]}` |
| `/append-prospect-sheet` | POST | Add podcasts | `{dashboardId, podcasts[]}` |
| `/backfill-prospect-podcasts` | POST | Vector search + AI match | `{prospect_id}` |

### 🤖 AI Analysis
| Endpoint | Method | Purpose | Body |
|----------|--------|---------|------|
| `/analyze-podcast-fit` | POST | Fit analysis | `{podcastName, clientBio, ...}` |
| `/analyze-sales-call` | POST | Call analysis | `{sales_call_id}` |
| `/score-podcast-compatibility` | POST | Compatibility score | `{clientBio, podcasts[]}` |
| `/qa-review-podcasts` | POST | QA score podcasts (max 10) | `{prospect_bio, podcasts[]}` |
| `/classify-reply` | POST | Classify reply type | `{reply_id}` |

### 🛒 E-commerce
| Endpoint | Method | Purpose | Body |
|----------|--------|---------|------|
| `/create-checkout-session` | POST | Podcast orders | `{cartItems[], customerEmail}` |
| `/create-addon-checkout` | POST | Addon orders | `{addons[], clientId}` |
| `/stripe-webhook` | POST | Payment events | Stripe payload |

### 📞 Outreach & Communication
| Endpoint | Method | Purpose | Body |
|----------|--------|---------|------|
| `/read-outreach-list` | POST | Read Google Sheet | `{clientId}` |
| `/send-outreach-webhook` | POST | Notify systems | `{clientId, podcastId}` |
| `/create-outreach-message` | POST | Store messages | `{client_id, email_1, ...}` |
| `/create-bison-lead` | POST | Create CRM lead | `{message_id}` |
| `/send-reply` | POST | Send email reply | `{bisonReplyId, message}` |
| `/generate-reply` | POST | AI-generate reply | `{bisonReplyId, leadType?, customPrompt?}` |
| `/delete-reply` | POST | Delete reply (Bison + DB) | `{reply_id}` |
| `/fetch-and-classify-replies` | POST | Bulk fetch + classify | `{}` |

### 📄 Content Generation
| Endpoint | Method | Purpose | Body |
|----------|--------|---------|------|
| `/generate-blog-content` | POST | AI blog content | `{topic, ...}` (Bearer auth) |
| `/generate-client-bio` | POST | AI client bio | `{clientName, ...}` |
| `/generate-media-kit-doc` | POST | Google Doc media kit | `{prospect_id}` |
| `/generate-podcast-queries` | POST | Search queries | `{clientBio, ...}` |
| `/generate-podcast-summary` | POST | Podcast summary | `{podcastName, ...}` |
| `/generate-tagline` | POST | AI tagline | `{prospect_name, bio}` |
| `/generate-guest-resource` | POST | Guest resource | `{type, topic, ...}` |

### 🔄 Data Sync
| Endpoint | Method | Purpose | Body |
|----------|--------|---------|------|
| `/sync-fathom-calls` | POST/GET | Import recordings | `{daysBack?}` |
| `/sync-replies` | POST/GET | Sync email replies | `{syncType?, daysBack?}` |

### 📈 SEO & Content
| Endpoint | Method | Purpose | Body |
|----------|--------|---------|------|
| `/submit-to-indexing` | POST | Google indexing | `{url, postId}` |
| `/check-indexing-status` | POST | Check index status | `{url, postId}` |

### 🔗 Webhooks
| Endpoint | Method | Purpose | Body |
|----------|--------|---------|------|
| `/campaign-reply-webhook` | POST | Email replies | Email Bison format |
| `/resend-webhook` | POST | Email events | Resend format |

## 🗄️ Database Quick Access

### Core Tables (34 total)
```sql
-- Clients & Authentication
clients                     -- Client accounts + dashboard settings
client_portal_sessions      -- Portal sessions
client_portal_tokens        -- Magic link tokens

-- Bookings & Podcasts
bookings                    -- Podcast placements
podcasts                    -- Central cache with vector embeddings
premium_podcasts            -- E-commerce inventory

-- E-commerce
customers, orders           -- Purchase tracking
order_items                 -- Order line items
booking_addons              -- Addon services

-- Communication & Outreach
email_logs                  -- Email delivery
campaign_replies            -- Outreach responses
outreach_messages           -- Approval queue for outreach emails
podcast_outreach_actions    -- Outreach sent/skipped tracking

-- AI Analysis
client_podcast_analyses     -- Client-specific AI analysis
prospect_podcast_analyses   -- Prospect-specific AI analysis
podcast_fit_analyses        -- General AI analysis cache

-- Prospect System
prospect_dashboards         -- Prospect profiles + structured fields
prospect_dashboard_podcasts -- Matched podcasts per prospect

-- Client Dashboard
client_dashboard_podcasts   -- Cached podcasts from Google Sheets
client_podcast_feedback     -- Client approval/rejection

-- Content & Resources
blog_posts                  -- SEO content
guest_resources             -- Educational content for guests
guest_resource_views        -- Resource engagement tracking
```

### Common Queries
```sql
-- Get client bookings
SELECT * FROM bookings WHERE client_id = 'uuid' ORDER BY created_at DESC;

-- Find cached podcasts
SELECT * FROM podcasts WHERE podscan_id = ANY(array['id1','id2']);

-- Check portal sessions
SELECT * FROM client_portal_sessions 
WHERE session_token = 'token' AND expires_at > NOW();

-- Get client orders
SELECT o.*, oi.* FROM orders o 
JOIN order_items oi ON o.id = oi.order_id 
WHERE customer_email = 'email@example.com';
```

## 🤖 MCP Server (AI Assistant)

### Registered Tools
| Tool | Purpose | Required Params |
|------|---------|-----------------|
| `create_prospect` | Create prospect dashboard | `prospect_name` |
| `match_podcasts` | AI podcast matching (0.30 threshold) | `prospect_name` |

> **Note**: `enable_prospect_dashboard` exists in code but is not registered in the MCP server.

### Usage
```javascript
// Create prospect (with optional structured fields)
await mcp.createProspect({
  prospect_name: "Sarah Johnson",
  bio: "Marketing expert...",
  industry: "Marketing",
  expertise: ["content marketing", "SEO"],
  topics: ["digital marketing", "brand building"],
  target_audience: "CMOs and marketing directors",
  company: "Growth Co",
  title: "VP of Marketing"
})

// Match podcasts with AI
await mcp.matchPodcasts({
  prospect_name: "Sarah Johnson",
  prospect_bio: "15 years marketing experience...",
  match_count: 50,
  export_to_sheet: true
})
```

## ⚡ Common Operations

### Client Onboarding
```javascript
// 1. Create client account
const client = await supabase.functions.invoke('create-client-account', {
  body: {
    name: 'John Smith',
    email: 'john@example.com',
    enable_portal_access: true,
    send_invitation_email: true,
    create_google_sheet: true
  }
})

// 2. Client receives email and logs in via magic link
// 3. Access portal at /portal/login
```

### Podcast Outreach Workflow
```javascript
// 1. Read outreach list from Google Sheets
const podcasts = await supabase.functions.invoke('read-outreach-list', {
  body: { clientId: 'client-uuid' }
})

// 2. Score compatibility  
const scores = await supabase.functions.invoke('score-podcast-compatibility', {
  body: { clientBio: 'Bio text...', podcasts: podcasts.data }
})

// 3. Send approved podcasts
for (const approved of approvedPodcasts) {
  await supabase.functions.invoke('send-outreach-webhook', {
    body: { clientId: 'uuid', podcastId: approved.id }
  })
}
```

### E-commerce Purchase Flow
```javascript
// 1. Create checkout session
const checkout = await supabase.functions.invoke('create-checkout-session', {
  body: {
    cartItems: [{
      podcastId: 'podcast-1',
      podcastName: 'Amazing Podcast', 
      price: 299.99
    }],
    customerEmail: 'customer@example.com'
  }
})

// 2. Redirect to Stripe: checkout.url
// 3. Stripe webhook processes payment confirmation
// 4. Order created in database
```

### AI Analysis
```javascript
// Analyze podcast fit
const analysis = await supabase.functions.invoke('analyze-podcast-fit', {
  body: {
    podcastName: 'The Tim Ferriss Show',
    podcastDescription: 'Author interviews...',
    clientBio: 'Entrepreneur and author...'
  }
})

// Returns fit_reasons and pitch_angles
```

## 🔧 Environment Variables

### Required (Core)
```bash
SUPABASE_URL=https://xxx.supabase.co
SUPABASE_SERVICE_ROLE_KEY=eyJ...
SUPABASE_ANON_KEY=eyJ...
```

### AI Services
```bash
OPENAI_API_KEY=sk-...
ANTHROPIC_API_KEY=sk-ant-...
```

### Payments & Email
```bash
STRIPE_SECRET_KEY=sk_live_...
RESEND_API_KEY=re_...
EMAIL_BISON_API_TOKEN=...
```

### External APIs
```bash
PODSCAN_API_KEY=...
FATHOM_API_KEY=...
HEYGEN_API_KEY=...
```

### Frontend (VITE_ prefix)
```bash
VITE_STRIPE_PUBLISHABLE_KEY=pk_...
VITE_HEYGEN_API_KEY=...
VITE_ANTHROPIC_API_KEY=sk-ant-...
VITE_VIDEO_SERVICE_URL=...
VITE_SENTRY_DSN=...
VITE_APP_VERSION=...
```

## 🚨 Error Handling

### Standard Error Format
```json
{
  "success": false,
  "error": "Human readable message"
}
```

### HTTP Status Codes
- `200` - Success (functions always return 200)
- `400` - Validation error
- `401` - Authentication failed  
- `403` - Authorization denied
- `429` - Rate limited
- `500` - Server error

### Common Errors
```javascript
// Session expired
{ "error": "Session expired or invalid" }

// Validation failed
{ "error": "Email and password are required" }

// Rate limited  
{ "error": "Too many requests. Please wait..." }

// Portal access disabled
{ "error": "Portal access is not enabled for this account" }
```

## 📊 Performance Tips

### Caching
- **Podcast cache**: 60-80% API call reduction
- **Session validation**: 24-hour expiry
- **AI analysis**: 7-day cache for fit analyses

### Rate Limits
- **Magic links**: 15 per 15 minutes
- **Login attempts**: 5 per 15 minutes  
- **External APIs**: Varies by service

### Optimization
```javascript
// Batch operations
const results = await Promise.all([
  supabase.from('bookings').select('*'),
  supabase.from('clients').select('*')
])

// Use specific fields
const { data } = await supabase
  .from('bookings')
  .select('id, podcast_name, status')
```

## 🔍 Debug Commands

### Check Function Logs
```bash
supabase functions logs --follow
```

### Test Edge Function Locally
```bash
curl -X POST http://localhost:54321/functions/v1/function-name \
  -H "Content-Type: application/json" \
  -d '{"test": "data"}'
```

### Database Queries
```sql
-- Check sessions
SELECT * FROM client_portal_sessions WHERE expires_at > NOW();

-- Check function executions
SELECT * FROM auth.audit_log_entries WHERE ip_address = 'your-ip';

-- Check email logs
SELECT * FROM email_logs WHERE created_at > NOW() - INTERVAL '1 hour';
```

---

**💡 Pro Tips**
- Use service role for backend operations
- Cache podcast data to reduce API costs  
- Always handle edge function errors gracefully
- Validate inputs before database operations
- Use React Query for frontend data fetching

**📚 Full Documentation**: See individual files for complete details
**🔗 Base URL**: `https://your-project.supabase.co/functions/v1/`
**📅 Last Updated**: March 2026 | **50 Edge Functions** | **34 Database Tables** | **2 MCP Tools**