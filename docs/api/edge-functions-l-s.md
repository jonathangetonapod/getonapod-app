# Supabase Edge Functions API Reference (L-S)

This document provides comprehensive API documentation for all Supabase Edge Functions starting with L-S in the Authority Built platform.

## Table of Contents

1. [Authentication Functions](#authentication-functions)
   - [login-with-password](#login-with-password)
   - [logout-portal-session](#logout-portal-session)
   - [send-portal-magic-link](#send-portal-magic-link)
2. [Admin Management](#admin-management)
   - [manage-admin-users](#manage-admin-users)
3. [Podcast & Outreach](#podcast--outreach)
   - [read-outreach-list](#read-outreach-list)
   - [score-podcast-compatibility](#score-podcast-compatibility)
   - [send-outreach-webhook](#send-outreach-webhook)
4. [Email & Communication](#email--communication)
   - [send-reply](#send-reply)
   - [resend-webhook](#resend-webhook)
5. [SEO & Content](#seo--content)
   - [submit-to-indexing](#submit-to-indexing)
6. [Data Synchronization](#data-synchronization)
   - [sync-fathom-calls](#sync-fathom-calls)
   - [sync-replies](#sync-replies)
7. [Payment Processing](#payment-processing)
   - [stripe-webhook](#stripe-webhook)

---

## Authentication Functions

### login-with-password

**Endpoint:** `/functions/v1/login-with-password`  
**HTTP Method:** `POST`  
**Auth Required:** No  

Authenticates users with email and password, creates portal sessions.

#### Request Body
```json
{
  "email": "user@example.com",
  "password": "userpassword123"
}
```

#### Success Response (200)
```json
{
  "session_token": "uuid-session-token",
  "client": {
    "id": "client_id",
    "name": "Client Name",
    "email": "user@example.com",
    "photo_url": "https://example.com/photo.jpg"
  },
  "expires_at": "2024-01-01T12:00:00.000Z"
}
```

#### Error Responses
```json
// 400 Bad Request
{
  "error": "Email and password are required"
}

// 401 Unauthorized
{
  "error": "Invalid email or password"
}

// 403 Forbidden
{
  "error": "Portal access is not enabled for this account"
}

// 429 Too Many Requests
{
  "error": "Too many failed login attempts. Please try again in 15 minutes."
}
```

#### Features
- Rate limiting (5 attempts per 15 minutes)
- IP and user agent logging
- Portal access validation
- Password not set detection
- Activity logging

---

### logout-portal-session

**Endpoint:** `/functions/v1/logout-portal-session`  
**HTTP Method:** `POST`  
**Auth Required:** No  

Logs out a user session and invalidates the session token.

#### Request Body
```json
{
  "sessionToken": "uuid-session-token"
}
```

#### Success Response (200)
```json
{
  "success": true
}
```

#### Error Response (400)
```json
{
  "success": false,
  "error": "Session token is required"
}
```

#### Features
- Always returns success (graceful logout)
- Session deletion with activity logging
- Error-resilient design

---

### send-portal-magic-link

**Endpoint:** `/functions/v1/send-portal-magic-link`  
**HTTP Method:** `POST`  
**Auth Required:** No  

Sends a magic link email for passwordless authentication.

#### Request Body
```json
{
  "email": "user@example.com"
}
```

#### Success Response (200)
```json
{
  "success": true,
  "message": "Check your email for a login link. It will expire in 15 minutes."
}
```

#### Error Responses
```json
// 400 Bad Request
{
  "error": "Invalid email format"
}

// 429 Too Many Requests  
{
  "error": "Too many requests. Please wait a few minutes before trying again."
}
```

#### Features
- Email format validation
- Portal access checking
- Email suppression checking (bounces/complaints)
- Rate limiting (15 requests per 15 minutes)
- 15-minute token expiration
- Activity and email delivery logging
- Privacy-first (no email enumeration)

---

## Admin Management

### manage-admin-users

**Endpoint:** `/functions/v1/manage-admin-users`  
**HTTP Method:** `POST`  
**Auth Required:** Yes (Bearer token)  

Manages admin users (CRUD operations). Only accessible by existing admin users.

#### Request Body Structure
```json
{
  "action": "list|create|delete|reset-password",
  // Additional fields based on action
}
```

#### List Admins
```json
{
  "action": "list"
}
```

**Response:**
```json
{
  "success": true,
  "admins": [
    {
      "id": "admin_id",
      "email": "admin@example.com",
      "name": "Admin Name",
      "added_by": "creator@example.com",
      "created_at": "2024-01-01T12:00:00.000Z"
    }
  ]
}
```

#### Create Admin
```json
{
  "action": "create",
  "email": "newadmin@example.com", 
  "password": "securepassword123",
  "name": "New Admin Name"
}
```

**Response:**
```json
{
  "success": true,
  "admin": {
    "id": "new_admin_id",
    "email": "newadmin@example.com",
    "name": "New Admin Name"
  },
  "message": "Admin user newadmin@example.com created successfully"
}
```

#### Delete Admin
```json
{
  "action": "delete",
  "id": "admin_id",
  "email": "admin@example.com"
}
```

**Response:**
```json
{
  "success": true,
  "message": "Admin user removed successfully"
}
```

#### Reset Password
```json
{
  "action": "reset-password",
  "email": "admin@example.com",
  "newPassword": "newsecurepassword123"
}
```

**Response:**
```json
{
  "success": true,
  "message": "Password reset successfully for admin@example.com"
}
```

#### Error Responses
```json
// 401 Unauthorized
{
  "error": "Authorization header required"
}

// 403 Forbidden
{
  "error": "Only admins can manage admin users"
}

// 400 Bad Request
{
  "error": "You cannot remove yourself as an admin"
}
```

#### Features
- JWT token authentication
- Admin-only access control
- Prevents self-deletion
- Password requirements (8+ characters)
- Automatic auth user creation/deletion

---

## Podcast & Outreach

### read-outreach-list

**Endpoint:** `/functions/v1/read-outreach-list`  
**HTTP Method:** `POST`  
**Auth Required:** No  

Reads podcast IDs from a client's Google Sheet and fetches podcast data from cache or Podscan API.

#### Request Body
```json
{
  "clientId": "client_uuid"
}
```

#### Success Response (200)
```json
{
  "success": true,
  "podcasts": [
    {
      "podcast_id": "podscan_podcast_id",
      "podcast_name": "The Amazing Podcast",
      "podcast_description": "A great podcast about amazing things",
      "podcast_image_url": "https://example.com/image.jpg",
      "podcast_url": "https://podcast.example.com",
      "publisher_name": "Publisher Name",
      "itunes_rating": 4.8,
      "episode_count": 150,
      "audience_size": 50000
    }
  ],
  "total": 25,
  "cached": 20,
  "fetched": 5,
  "cachePerformance": {
    "cacheHitRate": 80.0,
    "apiCallsSaved": 40,
    "apiCallsMade": 10,
    "costSavings": 0.40,
    "costSpent": 0.10
  }
}
```

#### Error Response (500)
```json
{
  "success": false,
  "error": "Failed to fetch outreach podcasts"
}
```

#### Features
- Google Sheets integration with service account authentication
- Central podcast caching (7-day freshness)
- Batch processing with progress logging
- Cost optimization tracking
- Parallel API calls with rate limiting
- Fallback error handling

---

### score-podcast-compatibility

**Endpoint:** `/functions/v1/score-podcast-compatibility`  
**HTTP Method:** `POST`  
**Auth Required:** No  

Uses Claude AI to score podcast compatibility with client or prospect bios.

#### Request Body
```json
{
  "clientBio": "Client biography and expertise description", // OR
  "prospectBio": "Prospect biography and expertise description",
  "podcasts": [
    {
      "podcast_id": "podcast_1",
      "podcast_name": "Tech Talk",
      "podcast_description": "Weekly tech discussions",
      "publisher_name": "Tech Host",
      "podcast_categories": [{"category_name": "Technology"}],
      "audience_size": 25000,
      "episode_count": 100
    }
  ]
}
```

#### Success Response (200)
```json
{
  "scores": [
    {
      "podcast_id": "podcast_1",
      "score": 8,
      "reasoning": "Strong alignment between client's tech expertise and podcast's focus on emerging technologies. Target audience matches well."
    }
  ]
}
```

#### Error Responses
```json
// 400 Bad Request
{
  "error": "Client bio is required for compatibility scoring"
}

{
  "error": "Podcasts array is required"
}
```

#### Features
- Supports both client and prospect mode
- Claude Haiku 4.5 for fast processing
- Parallel processing of multiple podcasts
- 1-10 scoring scale with reasoning
- Batch statistics and progress tracking
- Fallback score extraction for parsing errors

---

### send-outreach-webhook

**Endpoint:** `/functions/v1/send-outreach-webhook`  
**HTTP Method:** `POST`  
**Auth Required:** No  

Sends podcast approval webhook to client's configured outreach system.

#### Request Body
```json
{
  "clientId": "client_uuid",
  "podcastId": "podcast_id"
}
```

#### Success Response (200)
```json
{
  "success": true,
  "message": "Webhook sent successfully",
  "webhookStatus": 200,
  "podcast": {
    "id": "podcast_id",
    "name": "Podcast Name"
  }
}
```

#### Error Responses
```json
// Webhook failure (still 200 for graceful frontend handling)
{
  "success": false,
  "error": "Webhook failed with status 500",
  "webhookStatus": 500,
  "webhookResponse": "Error details..."
}

// 500 Internal Server Error
{
  "success": false,
  "error": "Webhook URL not configured for this client"
}
```

#### Webhook Payload Sent
```json
{
  "event": "podcast_approved_for_outreach",
  "timestamp": "2024-01-01T12:00:00.000Z",
  "since": "2023-11-01 12:00:00",
  "client": {
    "id": "client_id",
    "name": "Client Name",
    "email": "client@example.com",
    "bio": "Client bio...",
    "photo_url": "https://example.com/photo.jpg",
    "contact_person": "Contact Name",
    "linkedin_url": "https://linkedin.com/in/client",
    "website": "https://client.com",
    "google_sheet_url": "https://docs.google.com/spreadsheets/...",
    "media_kit_url": "https://client.com/media-kit",
    "calendar_link": "https://calendly.com/client",
    "bison_campaign_id": "campaign_123"
  },
  "podcast": {
    "id": "podcast_id",
    "name": "Podcast Name",
    "description": "Podcast description...",
    "url": "https://podcast.com",
    "image_url": "https://podcast.com/image.jpg",
    "publisher_name": "Host Name",
    "rating": 4.5,
    "episode_count": 100,
    "audience_size": 50000,
    "last_posted_at": "2024-01-01T12:00:00.000Z",
    "categories": ["Technology", "Business"],
    "ai_clean_description": "AI-processed description",
    "ai_fit_reasons": ["Reason 1", "Reason 2"],
    "ai_pitch_angles": ["Angle 1", "Angle 2"],
    "demographics": {...},
    "created_at": "2024-01-01T12:00:00.000Z"
  }
}
```

#### Features
- 10-second webhook timeout
- Action logging with response details
- 60-day lookback date calculation
- Comprehensive client and podcast data
- Graceful error handling

---

## Email & Communication

### send-reply

**Endpoint:** `/functions/v1/send-reply`  
**HTTP Method:** `POST`  
**Auth Required:** No  

Sends email replies via Email Bison API.

#### Request Body
```json
{
  "bisonReplyId": "bison_reply_id",
  "message": "Reply message content",
  "subject": "Reply subject (optional)"
}
```

#### Success Response (200)
```json
{
  "success": true,
  "message": "Reply sent successfully",
  "data": {
    // Email Bison response data
  }
}
```

#### Error Response (500)
```json
{
  "success": false,
  "error": "EMAIL_BISON_API_TOKEN not configured"
}
```

#### Features
- Integration with Email Bison API
- Automatic reply-all and thread injection
- Plain text content type
- Full error logging with API details

---

### resend-webhook

**Endpoint:** `/functions/v1/resend-webhook`  
**HTTP Method:** `POST`  
**Auth Required:** No (Webhook signature verification)

Handles email delivery events from Resend service.

#### Expected Headers
```
svix-id: webhook_id
svix-timestamp: timestamp
svix-signature: signature
```

#### Webhook Events Supported

##### email.sent
```json
{
  "type": "email.sent",
  "created_at": "2024-01-01T12:00:00.000Z",
  "data": {
    "email_id": "resend_email_id",
    "from": "sender@example.com",
    "to": ["recipient@example.com"],
    "subject": "Email Subject"
  }
}
```

##### email.delivered
```json
{
  "type": "email.delivered",
  "created_at": "2024-01-01T12:00:00.000Z",
  "data": {
    "email_id": "resend_email_id",
    "from": "sender@example.com",
    "to": ["recipient@example.com"],
    "subject": "Email Subject"
  }
}
```

##### email.bounced
```json
{
  "type": "email.bounced",
  "created_at": "2024-01-01T12:00:00.000Z", 
  "data": {
    "email_id": "resend_email_id",
    "from": "sender@example.com",
    "to": ["recipient@example.com"],
    "subject": "Email Subject",
    "bounce_type": "hard"
  }
}
```

##### email.complained
```json
{
  "type": "email.complained",
  "created_at": "2024-01-01T12:00:00.000Z",
  "data": {
    "email_id": "resend_email_id", 
    "from": "sender@example.com",
    "to": ["recipient@example.com"],
    "subject": "Email Subject",
    "complaint_type": "abuse"
  }
}
```

##### email.opened
```json
{
  "type": "email.opened",
  "created_at": "2024-01-01T12:00:00.000Z",
  "data": {
    "email_id": "resend_email_id",
    "from": "sender@example.com", 
    "to": ["recipient@example.com"],
    "subject": "Email Subject"
  }
}
```

##### email.clicked
```json
{
  "type": "email.clicked",
  "created_at": "2024-01-01T12:00:00.000Z",
  "data": {
    "email_id": "resend_email_id",
    "from": "sender@example.com",
    "to": ["recipient@example.com"], 
    "subject": "Email Subject",
    "click": {
      "link": "https://example.com/link",
      "timestamp": "2024-01-01T12:00:00.000Z"
    }
  }
}
```

#### Success Response (200)
```json
{
  "received": true,
  "event_type": "email.delivered"
}
```

#### Features
- Webhook signature verification (TODO)
- Email status tracking
- Bounce and complaint handling with auto-suppression
- Open and click tracking with counters
- Always returns 200 to prevent retries

---

## SEO & Content

### submit-to-indexing

**Endpoint:** `/functions/v1/submit-to-indexing`  
**HTTP Method:** `POST`  
**Auth Required:** No  

Submits URLs to Google Indexing API for faster search engine discovery.

#### Request Body
```json
{
  "url": "https://example.com/blog/post-title",
  "postId": "blog_post_id"
}
```

#### Success Response (200)
```json
{
  "success": true,
  "message": "Successfully submitted to Google Indexing API",
  "data": {
    "urlNotificationMetadata": {
      "url": "https://example.com/blog/post-title",
      "latestUpdate": {
        "url": "https://example.com/blog/post-title",
        "type": "URL_UPDATED",
        "notifyTime": "2024-01-01T12:00:00.000Z"
      }
    }
  }
}
```

#### Error Response (500)
```json
{
  "success": false,
  "error": "Failed to get access token: invalid_grant",
  "data": {
    "error": "invalid_grant",
    "error_description": "Invalid JWT: ..."
  }
}
```

#### Features
- Google service account JWT authentication  
- OAuth 2.0 token generation
- Indexing API submission with URL_UPDATED type
- Database logging of submission attempts
- Post status updates (submitted_to_google_at)
- Comprehensive error handling

---

## Data Synchronization

### sync-fathom-calls

**Endpoint:** `/functions/v1/sync-fathom-calls`  
**HTTP Method:** `POST` or `GET`  
**Auth Required:** No  

Syncs meeting recordings from Fathom API to the local database.

#### Request Body (Optional)
```json
{
  "daysBack": 30  // Default: 30 days
}
```

#### Success Response (200)
```json
{
  "success": true,
  "message": "Fathom sync completed successfully",
  "data": {
    "total_meetings": 45,
    "new_calls": 12,
    "updated_calls": 8
  }
}
```

#### Error Response (500)
```json
{
  "success": false,
  "error": "FATHOM_API_KEY not configured"
}
```

#### Features
- Pagination support (up to 50 pages, 100 per page)
- Date range filtering
- Skips calls that already have analysis
- Duration calculation in minutes
- Transcript and summary extraction
- Safe update for existing records

---

### sync-replies

**Endpoint:** `/functions/v1/sync-replies`  
**HTTP Method:** `POST` or `GET`  
**Auth Required:** No  

Syncs email replies from Email Bison API to the local database.

#### Request Body (Optional)
```json
{
  "syncType": "manual",     // "manual" or "auto"
  "unreadOnly": false,      // Smart sync - unread only
  "daysBack": 7            // Days to look back (default: 7)
}
```

#### Success Response (200)
```json
{
  "success": true,
  "message": "Sync completed successfully", 
  "data": {
    "total_processed": 25,
    "new_replies": 15,
    "updated_replies": 3,
    "skipped_replies": 7,
    "sync_duration_ms": 2500
  }
}
```

#### Error Response (500)
```json
{
  "success": false,
  "error": "EMAIL_BISON_API_TOKEN not configured"
}
```

#### Features
- Smart sync option (unread only)
- Configurable lookback period
- Read status synchronization
- Duplicate detection and handling
- Sync history logging with performance metrics
- Error-resilient with fallback logging

---

## Payment Processing

### stripe-webhook

**Endpoint:** `/functions/v1/stripe-webhook`  
**HTTP Method:** `POST`  
**Auth Required:** No (Webhook signature verification)

Handles payment events from Stripe webhooks.

#### Expected Headers
```
stripe-signature: stripe_webhook_signature
```

#### Supported Events

##### checkout.session.completed (Premium Placements)
```json
{
  "type": "checkout.session.completed",
  "data": {
    "object": {
      "id": "cs_session_id",
      "payment_intent": "pi_payment_id", 
      "customer": "cus_customer_id",
      "customer_email": "customer@example.com",
      "amount_total": 9900,
      "currency": "usd",
      "metadata": {
        "customerName": "Customer Name",
        "cartItemIds": "[\"podcast_1\", \"podcast_2\"]"
      }
    }
  }
}
```

**Actions:**
- Creates/updates customer record
- Creates order with line items 
- Updates customer stats (total orders, total spent)
- Idempotent processing

##### checkout.session.completed (Addon Orders)
```json
{
  "type": "checkout.session.completed",
  "data": {
    "object": {
      "id": "cs_session_id",
      "payment_intent": "pi_payment_id",
      "metadata": {
        "type": "addon_order",
        "clientId": "client_uuid",
        "addons": "[{\"bookingId\":\"booking_1\",\"serviceId\":\"service_1\"}]"
      }
    }
  }
}
```

**Actions:**
- Creates booking_addons records
- Links to existing bookings
- Tracks pricing per addon

##### payment_intent.payment_failed
```json
{
  "type": "payment_intent.payment_failed",
  "data": {
    "object": {
      "id": "pi_payment_id",
      "last_payment_error": {...}
    }
  }
}
```

**Actions:**
- Updates order status to 'failed'

##### charge.refunded  
```json
{
  "type": "charge.refunded", 
  "data": {
    "object": {
      "id": "ch_charge_id",
      "payment_intent": "pi_payment_id",
      "amount_refunded": 5000
    }
  }
}
```

**Actions:**
- Updates order status to 'refunded'

#### Success Response (200)
```json
{
  "received": true
}
```

#### Error Response (400)
```json
{
  "error": "Webhook signature verification failed",
  "details": "Invalid signature"
}
```

#### Features
- Stripe webhook signature verification
- Comprehensive event logging
- Idempotent order processing
- Customer lifecycle management
- Line item processing with metadata
- Addon order support
- Error handling with detailed logging

---

## Common Error Handling

All endpoints implement consistent error handling:

### CORS Support
All endpoints support CORS preflight requests (`OPTIONS` method) and include appropriate CORS headers.

### Rate Limiting
Certain endpoints implement rate limiting:
- `login-with-password`: 5 attempts per 15 minutes per email
- `send-portal-magic-link`: 15 requests per 15 minutes per client

### Error Response Format
```json
{
  "error": "Human-readable error message",
  "success": false  // When applicable
}
```

### Authentication
Bearer token authentication where required:
```
Authorization: Bearer <jwt_token>
```

### Environment Variables
Required environment variables for each function are documented in their respective sections. Common variables include:
- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`
- Service-specific API keys (Stripe, Resend, Anthropic, etc.)

---

## Integration Examples

### Frontend Authentication Flow
```javascript
// Login with password
const loginResponse = await fetch('/functions/v1/login-with-password', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    email: 'user@example.com',
    password: 'userpassword'
  })
});

const { session_token, expires_at } = await loginResponse.json();

// Use session for subsequent requests
localStorage.setItem('session_token', session_token);

// Logout
await fetch('/functions/v1/logout-portal-session', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    sessionToken: session_token
  })
});
```

### Outreach Workflow
```javascript
// 1. Read outreach list
const listResponse = await fetch('/functions/v1/read-outreach-list', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ clientId: 'client_uuid' })
});

const { podcasts } = await listResponse.json();

// 2. Score compatibility
const scoreResponse = await fetch('/functions/v1/score-podcast-compatibility', {
  method: 'POST', 
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    clientBio: 'Client expertise and background...',
    podcasts: podcasts
  })
});

const { scores } = await scoreResponse.json();

// 3. Send approved podcasts via webhook
for (const podcast of approvedPodcasts) {
  await fetch('/functions/v1/send-outreach-webhook', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      clientId: 'client_uuid',
      podcastId: podcast.podcast_id
    })
  });
}
```

This documentation covers all Edge Functions starting with L-S, providing comprehensive information for developers integrating with the Authority Built platform.