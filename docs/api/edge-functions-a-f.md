# Supabase Edge Functions API Reference (A-F)

This document provides comprehensive API documentation for all Supabase Edge Functions starting with letters A through F.

## Table of Contents

1. [analyze-podcast-fit](#analyze-podcast-fit)
2. [analyze-sales-call](#analyze-sales-call)
3. [append-prospect-sheet](#append-prospect-sheet)
4. [campaign-reply-webhook](#campaign-reply-webhook)
5. [check-indexing-status](#check-indexing-status)
6. [classify-sales-call](#classify-sales-call)
7. [create-addon-checkout](#create-addon-checkout)
8. [create-bison-lead](#create-bison-lead)
9. [create-checkout-session](#create-checkout-session)
10. [create-client-account](#create-client-account)
11. [create-client-google-sheet](#create-client-google-sheet)
12. [create-outreach-message](#create-outreach-message)
13. [create-prospect-sheet](#create-prospect-sheet)

---

## analyze-podcast-fit

Analyzes why a specific podcast would be an excellent fit for a client using AI analysis.

### Endpoint
- **Path**: `/functions/v1/analyze-podcast-fit`
- **Method**: `POST`
- **Auth**: Service role or authenticated user

### Request Body
```json
{
  "podcastId": "string",              // Required: Podcast ID or name as fallback
  "podcastName": "string",            // Required: Name of the podcast
  "podcastDescription": "string",     // Optional: Raw description (may contain HTML)
  "podcastUrl": "string",             // Optional: Podcast website URL
  "publisherName": "string",          // Optional: Host/publisher name
  "hostName": "string",               // Optional: Alternative to publisherName
  "itunesRating": "number",           // Optional: iTunes rating (0-5)
  "episodeCount": "number",           // Optional: Total episodes
  "audienceSize": "number",           // Optional: Estimated audience size
  "clientId": "string",               // Optional: Client ID (defaults to 'legacy')
  "clientName": "string",             // Optional: Client name
  "clientBio": "string"               // Optional: Client biography/background
}
```

### Response
```json
{
  "success": true,
  "cached": false,                    // Whether result came from cache
  "analysis": {
    "clean_description": "string",    // Clean podcast description (1-2 sentences)
    "fit_reasons": ["string"],        // Array of 3-4 detailed fit reasons
    "pitch_angles": [                 // Array of 3 episode topic ideas
      {
        "title": "string",            // Compelling episode title (5-8 words)
        "description": "string"       // 2-3 sentence pitch
      }
    ]
  }
}
```

### Error Response
```json
{
  "success": false,
  "error": "string"                   // Error description
}
```

### Features
- **AI-Powered Analysis**: Uses Claude API to analyze podcast-client fit
- **Caching**: Results cached for 7 days to reduce API costs
- **Fallback Bio**: Uses default bio if client bio not provided
- **Multiple Data Sources**: Supports both old and new format inputs

### Example Request
```bash
curl -X POST https://your-project.supabase.co/functions/v1/analyze-podcast-fit \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "podcastName": "The Tim Ferriss Show",
    "podcastDescription": "Tim Ferriss is a five-time New York Times best-selling author...",
    "clientName": "John Smith",
    "clientBio": "Serial entrepreneur and productivity expert...",
    "clientId": "client_123"
  }'
```

---

## analyze-sales-call

Analyzes sales call transcripts using Corey Jackson's Scalable Sales Framework.

### Endpoint
- **Path**: `/functions/v1/analyze-sales-call`
- **Method**: `POST`
- **Auth**: Service role required

### Request Body
```json
{
  "sales_call_id": "string",          // Required: Sales call ID
  "recording_id": "string"            // Optional: Override recording ID from database
}
```

### Response
```json
{
  "success": true,
  "message": "Call analyzed successfully",
  "data": {
    "overall_score": 8,               // Overall call score (0-10)
    "framework_adherence_score": 7,   // How well framework was followed
    "frame_control_score": 9,         // Frame control execution
    "discovery_current_state_score": 8,
    "discovery_desired_state_score": 7,
    "discovery_cost_of_inaction_score": 6,
    "watt_tiedowns_score": 5,
    "bridge_gap_score": 8,
    "sellback_score": 7,
    "price_drop_score": 6,
    "objection_handling_score": 8,
    "close_celebration_score": 4,
    "discovery_score": 7,
    "closing_score": 6,
    "engagement_score": 8,
    "talk_listen_ratio": {
      "talk": 60,                     // Percentage talking
      "listen": 40                    // Percentage listening
    },
    "questions_asked_count": 12,
    "framework_insights": {
      "frame_control": {
        "present": true,
        "feedback": "Excellent opening, confirmed timing and agenda"
      },
      "discovery": {
        "current_state_explored": true,
        "desired_state_identified": true,
        "cost_of_inaction_discussed": false,
        "consequences_explored": false,
        "gap_size": "large",
        "feedback": "Good current and desired state exploration, missed pain points"
      }
      // ... more framework insights
    },
    "recommendations": [
      {
        "priority": "high",
        "framework_stage": "discovery",
        "title": "Explore cost of inaction",
        "description": "Ask what staying stuck costs them",
        "specific_timestamp": "12:34"
      }
    ],
    "strengths": ["Strong opening", "Good rapport building"],
    "weaknesses": ["Weak close", "Didn't ask for money again"],
    "key_moments": [
      {
        "timestamp": "05:30",
        "framework_stage": "discovery",
        "type": "positive",
        "description": "Excellent current state question"
      }
    ],
    "sentiment_analysis": {
      "overall_sentiment": "positive",
      "prospect_engagement": "high",
      "confidence_level": "medium"
    }
  }
}
```

### Error Response
```json
{
  "success": false,
  "error": "string"
}
```

### Features
- **Corey Jackson Framework**: Analyzes calls against proven sales methodology
- **Transcript Integration**: Fetches transcripts from Fathom API
- **Detailed Scoring**: 10+ different framework stage scores
- **Actionable Insights**: Specific recommendations with timestamps
- **Database Storage**: Analysis stored for future reference

### Framework Stages Analyzed
1. **Frame Control** (60-90 seconds) - Set tone, establish authority
2. **Discovery Phase** - Find the gap between current and desired state
3. **WATT Tie-downs** - Build YES momentum with micro-commitments
4. **Bridge the Gap** - Position offer as solution
5. **Sellback** - Let prospect talk themselves into it
6. **Price Drop** - Minimize and pause after revealing price
7. **Objection Handling** - Address fears as information gaps
8. **Close & Celebrate** - Take payment and celebrate

---

## append-prospect-sheet

Appends podcast data to an existing prospect's Google Sheet.

### Endpoint
- **Path**: `/functions/v1/append-prospect-sheet`
- **Method**: `POST`
- **Auth**: Service role required

### Request Body
```json
{
  "dashboardId": "string",            // Required: Prospect dashboard ID
  "podcasts": [                       // Required: Array of podcasts to add
    {
      "podcast_name": "string",       // Required: Podcast name
      "publisher_name": "string",     // Optional: Publisher/host name
      "podcast_description": "string", // Optional: Description
      "audience_size": 50000,         // Optional: Estimated audience
      "episode_count": 150,           // Optional: Total episodes
      "itunes_rating": 4.8,           // Optional: iTunes rating
      "podcast_url": "string",        // Optional: Podcast website
      "podscan_podcast_id": "string", // Optional: Podscan ID
      "podcast_id": "string",         // Optional: Alternative ID
      "compatibility_score": 85,      // Optional: Compatibility score
      "compatibility_reasoning": "string" // Optional: Reasoning
    }
  ]
}
```

### Response
```json
{
  "success": true,
  "spreadsheetUrl": "https://docs.google.com/spreadsheets/d/...",
  "rowsAdded": 5,
  "updatedRange": "Sheet1!A6:E10",
  "message": "Added 5 podcasts to \"John Smith\"'s sheet",
  "cacheSaved": 4,                    // Podcasts saved to central cache
  "cacheSkipped": 1,                  // Podcasts skipped (no ID)
  "cacheErrors": 0                    // Cache save errors
}
```

### Error Response
```json
{
  "success": false,
  "error": "string"
}
```

### Features
- **Google Sheets Integration**: Uses domain-wide delegation for sheet access
- **Template Matching**: Appends data in template column format
- **Central Caching**: Saves podcasts to central database for future use
- **Public Access**: Makes sheets publicly readable via link
- **Duplicate Detection**: Handles existing prospect sheets

### Cache Optimization
The function automatically saves all podcasts to a central `podcasts` table, making them available for future searches across all prospects and clients. This reduces API calls and improves performance.

---

## campaign-reply-webhook

Webhook endpoint for processing Email Bison campaign replies and interested leads.

### Endpoint
- **Path**: `/functions/v1/campaign-reply-webhook`
- **Method**: `POST`
- **Auth**: Optional webhook secret via `x-webhook-secret` header

### Request Headers
```
x-webhook-secret: your-webhook-secret  // Optional but recommended
```

### Request Body (Email Bison Format)
```json
{
  "event": {
    "type": "LEAD_INTERESTED"         // Event type: LEAD_INTERESTED, EMAIL_REPLY, etc.
  },
  "data": {
    "lead": {
      "email": "host@podcast.com",    // Required: Lead email
      "first_name": "John",           // Optional: First name
      "last_name": "Doe",             // Optional: Last name
      "company": "Podcast Inc"        // Optional: Company name
    },
    "campaign": {
      "name": "Q4 Outreach Campaign" // Optional: Campaign name
    },
    "reply": {
      "id": "reply_123",              // Optional: Email Bison reply ID
      "text_body": "I'm interested!", // Optional: Reply content (preferred)
      "html_body": "<p>Interested</p>", // Optional: HTML reply content
      "date_received": "2024-01-15T10:30:00Z" // Optional: Reply timestamp
    },
    "campaign_event": {
      "created_at": "2024-01-15T10:30:00Z" // Optional: Event timestamp
    }
  }
}
```

### Response
```json
{
  "success": true,
  "message": "Campaign reply received",
  "reply_id": "uuid-string"           // Created reply record ID
}
```

### Ignored Events Response
```json
{
  "success": true,
  "message": "Event type SOME_EVENT ignored - only processing replies"
}
```

### Error Response
```json
{
  "success": false,
  "error": "string"
}
```

### Features
- **Event Filtering**: Only processes reply/interested events
- **Duplicate Detection**: Prevents duplicate replies within 1-hour window
- **Flexible Input**: Handles multiple Email Bison event formats
- **Database Storage**: Stores replies in `campaign_replies` table
- **Status Tracking**: Sets initial status to 'new'

### Supported Event Types
- `LEAD_INTERESTED`
- `EMAIL_REPLY`
- `EMAIL_REPLIED`
- `LEAD_REPLIED`
- `REPLY_RECEIVED`

---

## check-indexing-status

Checks Google Search Console indexing status for blog posts.

### Endpoint
- **Path**: `/functions/v1/check-indexing-status`
- **Method**: `POST`
- **Auth**: Service role required

### Request Body
```json
{
  "url": "string",                    // Required: Blog post URL
  "postId": "string"                  // Required: Blog post ID for logging
}
```

### Response
```json
{
  "success": true,
  "message": "Post is indexed by Google",
  "data": {
    "isIndexed": true,                // Whether page is indexed
    "coverageState": "PASS",          // Coverage state from Google
    "lastCrawlTime": "2024-01-15T10:30:00Z", // Last crawl timestamp
    "indexingState": "INDEXING_ALLOWED", // Indexing state
    "crawlDecision": "DESKTOP",       // How Google crawled it
    "verdict": "PASS",                // Overall verdict
    "canonicalUrl": "https://...",    // Google's canonical URL
    "urlMismatch": false,             // Whether canonical differs from requested
    "richResultsItems": []            // Rich results detected
  }
}
```

### Error Response
```json
{
  "success": false,
  "message": "Failed to check indexing status",
  "error": "string"
}
```

### Features
- **OAuth Integration**: Uses Google Search Console API with refresh tokens
- **URL Validation**: Ensures URLs match expected domain pattern
- **Database Logging**: Logs all checks to `blog_indexing_log` table
- **Auto-Updates**: Updates post indexing status automatically
- **Rich Results**: Detects structured data and rich results
- **Canonical Checking**: Identifies canonical URL mismatches

### Required Environment Variables
- `GOOGLE_SEARCH_CONSOLE_REFRESH_TOKEN`
- `GOOGLE_SEARCH_CONSOLE_CLIENT_ID`
- `GOOGLE_SEARCH_CONSOLE_CLIENT_SECRET`

### URL Requirements
URLs must match the format: `https://getonapod.com/blog/*`

---

## classify-sales-call

Quickly classifies whether a recording is a sales call or not using AI.

### Endpoint
- **Path**: `/functions/v1/classify-sales-call`
- **Method**: `POST`
- **Auth**: Service role required

### Request Body
```json
{
  "sales_call_id": "string"           // Required: Sales call ID
}
```

### Response
```json
{
  "success": true,
  "message": "Call classified as sales",
  "data": {
    "call_type": "sales"              // "sales" or "non-sales"
  }
}
```

### Error Response
```json
{
  "success": false,
  "error": "string"
}
```

### Features
- **Fast Classification**: Uses Claude Haiku for quick, efficient analysis
- **Title + Summary Based**: Analyzes meeting title and summary, not full transcript
- **Database Updates**: Updates `call_type` field in `sales_calls` table
- **Cost Efficient**: Minimal token usage compared to full analysis

### Classification Logic
**Sales Call Criteria:**
- Discussing products/services with prospects or customers
- Demo or presentation to potential buyers
- Discovery call with leads
- Closing or negotiation discussions
- Follow-up with potential customers

**Non-Sales Call Examples:**
- Internal team meetings
- 1-on-1s with colleagues
- Planning or strategy sessions
- Technical discussions between teammates
- All-hands or company meetings

---

## create-addon-checkout

Creates a Stripe checkout session for addon services.

### Endpoint
- **Path**: `/functions/v1/create-addon-checkout`
- **Method**: `POST`
- **Auth**: Service role required

### Request Body
```json
{
  "addons": [                         // Required: Array of addon items
    {
      "bookingId": "string",          // Required: Booking ID
      "serviceId": "string"           // Required: Addon service ID
    }
  ],
  "clientId": "string"                // Required: Client ID
}
```

### Response
```json
{
  "sessionId": "cs_live_...",         // Stripe session ID
  "url": "https://checkout.stripe.com/pay/..." // Checkout URL
}
```

### Error Response
```json
{
  "error": "string"
}
```

### Features
- **Stripe Integration**: Creates secure checkout sessions
- **Addon Validation**: Verifies services exist and aren't already purchased
- **Dynamic Pricing**: Uses current service pricing from database
- **Metadata Tracking**: Includes booking and client details for webhooks
- **Redirect URLs**: Configures success/cancel redirect URLs
- **Duplicate Prevention**: Skips addons already purchased

### Addon Processing
1. Fetches service details from `addon_services` table
2. Fetches booking details for podcast context
3. Checks for existing addon purchases
4. Creates Stripe line items with dynamic pricing
5. Includes podcast images and descriptions

---

## create-bison-lead

Creates or updates leads in Email Bison CRM system.

### Endpoint
- **Path**: `/functions/v1/create-bison-lead`
- **Method**: `POST`
- **Auth**: Service role required

### Request Body
```json
{
  "message_id": "string"              // Required: Outreach message ID
}
```

### Response
```json
{
  "success": true,
  "lead_id": 12345,                   // Bison lead ID
  "lead_already_existed": false,      // Whether lead was updated vs created
  "campaign_attached": true,          // Whether lead was attached to campaign
  "campaign_id": 67890               // Bison campaign ID
}
```

### Error Response
```json
{
  "success": false,
  "error": "string"
}
```

### Features
- **Bison API Integration**: Creates leads in Email Bison system
- **Duplicate Handling**: Updates existing leads instead of creating duplicates
- **Campaign Attachment**: Automatically attaches leads to campaigns
- **Custom Variables**: Includes podcast and client data as custom fields
- **Name Parsing**: Splits host names into first/last name components
- **Database Updates**: Updates message with Bison lead ID

### Lead Data Mapping
- **Name**: Parsed from `host_name` field
- **Email**: From `host_email`
- **Company**: Podcast name
- **Title**: "Podcast Host"
- **Custom Variables**: Podcast ID, name, client name, subject line, email body

### API Requirements
- `BISON_API_URL`: Email Bison API base URL
- `BISON_API_KEY`: API authentication key

---

## create-checkout-session

Creates Stripe checkout session for podcast placement orders.

### Endpoint
- **Path**: `/functions/v1/create-checkout-session`
- **Method**: `POST`
- **Auth**: No authentication required

### Request Body
```json
{
  "cartItems": [                      // Required: Array of cart items
    {
      "podcastId": "string",          // Required: Podcast ID
      "podcastName": "string",        // Required: Podcast name
      "podcastImage": "string",       // Optional: Podcast image URL
      "price": 299.99,                // Required: Price in dollars
      "priceDisplay": "$299.99"       // Required: Formatted price string
    }
  ],
  "customerEmail": "string",          // Required: Customer email
  "customerName": "string"            // Required: Customer name
}
```

### Response
```json
{
  "sessionId": "cs_live_...",         // Stripe checkout session ID
  "url": "https://checkout.stripe.com/pay/..." // Checkout page URL
}
```

### Error Response
```json
{
  "error": "string"
}
```

### Features
- **Public Endpoint**: No authentication required for prospects
- **Stripe Integration**: Secure payment processing
- **Dynamic Line Items**: Creates Stripe products from cart data
- **Metadata Storage**: Stores customer and cart data for webhook processing
- **Redirect Handling**: Configures success/cancel page URLs
- **Image Support**: Includes podcast images in checkout

### Cart Validation
- Validates cart is not empty
- Requires customer email and name
- Converts prices from dollars to cents for Stripe
- Maps podcast data to Stripe product format

---

## create-client-account

Comprehensive client account creation with portal access, Google Sheets, and email invitations.

### Endpoint
- **Path**: `/functions/v1/create-client-account`
- **Method**: `POST`
- **Auth**: Optional API key authentication

### Request Body
```json
{
  "name": "string",                   // Required: Client name
  "email": "string",                  // Required: Client email
  "bio": "string",                    // Optional: Client biography
  "linkedin_url": "string",           // Optional: LinkedIn profile
  "website": "string",                // Optional: Website URL
  "calendar_link": "string",          // Optional: Calendar booking link
  "contact_person": "string",         // Optional: Primary contact
  "first_invoice_paid_date": "string", // Optional: First payment date
  "status": "active",                 // Optional: active|paused|churned
  "notes": "string",                  // Optional: Internal notes
  "headshot_base64": "string",        // Optional: Base64 encoded photo
  "headshot_filename": "string",      // Optional: Photo filename
  "headshot_content_type": "string",  // Optional: Photo MIME type
  "enable_portal_access": true,       // Optional: Enable portal (default: true)
  "password": "string",               // Optional: Portal password
  "send_invitation_email": true,      // Optional: Send email (default: true)
  "create_google_sheet": false,       // Optional: Create sheet (default: false)
  "api_key": "string"                 // Optional: API authentication
}
```

### Response
```json
{
  "success": true,
  "message": "Client account created successfully",
  "client": {
    "client_id": "uuid",
    "name": "John Smith",
    "email": "john@example.com",
    "status": "active",
    "portal_access_enabled": true,
    "portal_url": "https://portal.example.com/portal/login",
    "invitation_sent": true,
    "google_sheet_created": false,
    "dashboard_slug": "abc123de",
    "dashboard_url": "https://portal.example.com/client/abc123de",
    "created_at": "2024-01-15T10:30:00Z"
    // ... other optional fields if provided
  }
}
```

### Error Response
```json
{
  "success": false,
  "error": "string"
}
```

### Features
- **Complete Onboarding**: Creates client with all associated resources
- **Portal Access**: Sets up client portal with optional password
- **Photo Upload**: Handles base64 headshot upload to Supabase Storage
- **Google Sheets**: Optionally creates client Google Sheet
- **Email Invitations**: Sends welcome email with portal access
- **Dashboard URLs**: Generates unique dashboard URLs
- **Duplicate Prevention**: Prevents duplicate email addresses
- **Webhook Integration**: Sends completion webhook with all data
- **Flexible Fields**: All optional fields beyond name/email

### Email Template
Sends professional invitation email with:
- Welcome message
- Portal login instructions
- Contact information
- Branded design

### Dashboard Features
Each client gets a unique dashboard with:
- Podcast approval interface
- Booking management
- Communication tools
- Performance metrics

---

## create-client-google-sheet

Creates a Google Sheet for client podcast tracking using template.

### Endpoint
- **Path**: `/functions/v1/create-client-google-sheet`
- **Method**: `POST`
- **Auth**: Service role required

### Request Body
```json
{
  "clientId": "string",               // Required: Client ID
  "clientName": "string",             // Required: Client name
  "ownerEmail": "string"              // Optional: Sheet owner email
}
```

### Response
```json
{
  "success": true,
  "spreadsheetUrl": "https://docs.google.com/spreadsheets/d/...",
  "spreadsheetId": "1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs74OgvE2upms",
  "message": "Created sheet: Podcast Leads - John Smith"
}
```

### Error Response
```json
{
  "success": false,
  "error": "string",
  "details": "string"
}
```

### Features
- **Template-Based**: Copies from predefined Google Sheet template
- **Domain-Wide Delegation**: Uses service account with user impersonation
- **Storage Optimization**: Creates sheets in user's Drive, not service account
- **Permission Management**: Sets up proper sharing permissions
- **Public Access**: Makes sheets publicly editable via link
- **Database Updates**: Updates client record with sheet URL

### Google API Setup Requirements
- Service account with domain-wide delegation enabled
- Template spreadsheet ID in environment variables
- Workspace user email for impersonation
- Google Workspace admin configuration

### Permission Levels
1. **Service Account**: Writer access for API operations
2. **Public Link**: Anyone with link can edit
3. **Owner Transfer**: Optional ownership transfer to specified email

---

## create-outreach-message

Creates outreach message records from Clay automation data.

### Endpoint
- **Path**: `/functions/v1/create-outreach-message`
- **Method**: `POST`
- **Auth**: Service role required

### Request Body
```json
{
  "client_id": "string",              // Required: Client ID
  "final_host_email": "string",       // Required: Host email address
  "email_1": "string",                // Required: Email body content
  "subject_line": "string",           // Required: Email subject
  "host_name": "string",              // Optional: Full host name
  "first_name": "string",             // Optional: Host first name
  "last_name": "string",              // Optional: Host last name
  "podcast_id": "string",             // Optional: Podcast ID for lookup
  "podcast_research": "string",       // Optional: Research content
  "host_info": "string",              // Optional: Host information
  "topics": "string",                 // Optional: Suggested topics
  "bison_campaign_id": "string",      // Optional: Email Bison campaign
  "priority": "medium"                // Optional: high|medium|low
}
```

### Response
```json
{
  "success": true,
  "message": "Outreach message created successfully",
  "data": {
    "id": "uuid",                     // Created message ID
    "client_id": "string",
    "podcast_name": "string",         // Resolved podcast name
    "status": "pending_review"        // Initial status
  }
}
```

### Error Response
```json
{
  "success": false,
  "error": "string"
}
```

### Features
- **Clay Integration**: Designed for Clay automation workflows
- **Podcast Lookup**: Resolves podcast names from cached data
- **Name Parsing**: Handles various name format inputs
- **Campaign Linking**: Associates with Email Bison campaigns
- **Research Storage**: Stores personalization data as JSON
- **Priority Setting**: Supports priority levels for queue management

### Data Sources
1. **Client Dashboard Cache**: First checks client podcast cache
2. **Prospect Cache**: Falls back to prospect podcast data
3. **Regex Extraction**: Extracts podcast name from research text
4. **Fallback Handling**: Uses "Unknown Podcast" if no name found

### Clay Automation Flow
1. Clay researches podcast and host
2. Generates personalized email content
3. Calls this endpoint to store message
4. Message enters review queue
5. Approved messages sent via Email Bison

---

## create-prospect-sheet

Creates Google Sheet for prospect podcast opportunities and dashboard.

### Endpoint
- **Path**: `/functions/v1/create-prospect-sheet`
- **Method**: `POST`
- **Auth**: Service role required

### Request Body
```json
{
  "prospectName": "string",           // Required: Prospect name
  "prospectBio": "string",            // Optional: Prospect biography
  "prospectImageUrl": "string",       // Optional: Prospect photo URL
  "podcasts": [                       // Required: Array of podcast opportunities
    {
      "podcast_name": "string",       // Required: Podcast name
      "publisher_name": "string",     // Optional: Publisher name
      "podcast_description": "string", // Optional: Description
      "audience_size": 50000,         // Optional: Audience size
      "episode_count": 150,           // Optional: Episode count
      "itunes_rating": 4.8,           // Optional: iTunes rating
      "podcast_url": "string",        // Optional: Podcast URL
      "podscan_podcast_id": "string", // Optional: Podscan ID
      "podcast_id": "string",         // Optional: Alternative ID
      "compatibility_score": 85,      // Optional: Fit score
      "compatibility_reasoning": "string" // Optional: Fit reasoning
    }
  ]
}
```

### Response
```json
{
  "success": true,
  "spreadsheetUrl": "https://docs.google.com/spreadsheets/d/...",
  "spreadsheetId": "string",
  "sheetTitle": "Podcast Opportunities - John Smith - Jan 15, 2024",
  "rowsAdded": 25,
  "updatedRange": "Sheet1!A2:E26",
  "message": "Created sheet with 25 podcasts",
  "dashboardUrl": "https://app.com/prospect/abc12345",
  "dashboardSlug": "abc12345",       // 8-character random slug
  "cacheSaved": 24,                  // Podcasts saved to central cache
  "cacheSkipped": 1,                 // Podcasts without IDs
  "cacheErrors": 0                   // Cache save errors
}
```

### Error Response
```json
{
  "success": false,
  "error": "string"
}
```

### Features
- **Template-Based**: Uses Google Sheets template for consistent formatting
- **Dashboard Creation**: Creates prospect dashboard with unique URL
- **Public Sharing**: Makes sheet publicly readable
- **Central Caching**: Saves all podcasts to central database for reuse
- **Timestamp Naming**: Includes creation date in sheet title
- **Slug Generation**: Creates random 8-character dashboard slug

### Dashboard Features
- **Public Access**: Shareable link for prospects
- **Branded Design**: Professional presentation
- **Podcast Details**: Complete podcast information
- **Contact Integration**: Links back to lead generation

### Caching Benefits
- **Performance**: Faster future searches across all prospects
- **Cost Savings**: Reduces external API calls
- **Data Enrichment**: Builds comprehensive podcast database
- **Cross-Client Usage**: Shared data benefits all users

### Sheet Structure
Based on template with columns:
1. Podcast Name
2. Description
3. iTunes Rating
4. Episode Count
5. Podcast ID

---

## Authentication & Environment Variables

### Required Environment Variables

**Supabase:**
- `SUPABASE_URL` - Supabase project URL
- `SUPABASE_SERVICE_ROLE_KEY` - Service role key for database access

**AI Services:**
- `ANTHROPIC_API_KEY` - Claude AI API key

**Email Services:**
- `RESEND_API_KEY` - Resend email service key

**Google Services:**
- `GOOGLE_SERVICE_ACCOUNT_JSON` - Service account credentials JSON
- `GOOGLE_WORKSPACE_USER_EMAIL` - User email for domain-wide delegation
- `GOOGLE_SHEET_TEMPLATE_ID` - Template spreadsheet ID
- `GOOGLE_SEARCH_CONSOLE_REFRESH_TOKEN` - OAuth refresh token
- `GOOGLE_SEARCH_CONSOLE_CLIENT_ID` - OAuth client ID  
- `GOOGLE_SEARCH_CONSOLE_CLIENT_SECRET` - OAuth client secret

**External APIs:**
- `FATHOM_API_KEY` - Fathom meeting recorder API key
- `BISON_API_URL` - Email Bison CRM API URL
- `BISON_API_KEY` - Email Bison API key
- `STRIPE_SECRET_KEY` - Stripe payment processing key

**URLs & Configuration:**
- `PORTAL_BASE_URL` - Client portal base URL
- `APP_URL` - Main application URL
- `API_KEY` - Optional API authentication key
- `CAMPAIGN_WEBHOOK_SECRET` - Webhook security secret
- `ONBOARDING_WEBHOOK_URL` - Client onboarding webhook URL

### CORS Headers
All functions include CORS headers for cross-origin requests:
```javascript
{
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type'
}
```

### Error Handling
All functions follow consistent error response format:
```json
{
  "success": false,
  "error": "Human readable error message"
}
```

### Rate Limits
- **Google APIs**: Respect daily quotas (Search Console: 2,000 requests/day)
- **AI APIs**: Subject to provider rate limits
- **Stripe**: No specific limits for these operations

---

## Webhook Integrations

### Campaign Reply Webhook
**Purpose**: Processes Email Bison campaign replies  
**Security**: Optional secret header validation  
**Events**: LEAD_INTERESTED, EMAIL_REPLY, LEAD_REPLIED  

### Client Onboarding Webhook
**Purpose**: Notifies external systems of new client creation  
**Payload**: Complete client data including portal access  
**Optional**: Only sent if `ONBOARDING_WEBHOOK_URL` configured  

### Stripe Webhooks
**Purpose**: Processes payment confirmations for checkouts  
**Security**: Stripe signature validation  
**Events**: `checkout.session.completed`, `payment_intent.succeeded`  

---

This documentation provides complete API reference for all Supabase Edge Functions starting with A-F. Each function includes detailed request/response schemas, feature descriptions, and integration examples.