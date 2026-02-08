# Supabase Edge Functions API Documentation
## V Functions (validate-*, verify-*) & Shared Utilities

This document provides comprehensive API documentation for all Supabase Edge Functions starting with "V" and the shared utilities used across the Get On A Pod platform.

---

## Table of Contents

1. [Shared Utilities](#shared-utilities)
   - [Email Templates](#email-templates)
   - [Podcast Cache](#podcast-cache)
2. [V Functions](#v-functions)
   - [validate-portal-session](#validate-portal-session)
   - [verify-portal-token](#verify-portal-token)

---

## Shared Utilities

### Email Templates

**File:** `/supabase/functions/_shared/email-templates.ts`

A utility module for generating styled HTML and plain text email templates for the client portal system.

#### Interface

```typescript
interface EmailTemplate {
  subject: string
  html: string
  text: string
}
```

#### Functions

##### `getPortalInvitationEmail(clientName: string, portalUrl: string): EmailTemplate`

Generates a welcome email template for client portal invitations.

**Parameters:**
- `clientName` (string) - The client's name
- `portalUrl` (string) - The portal access URL

**Returns:** `EmailTemplate` object with subject, HTML, and text versions

**Example Usage:**
```typescript
import { getPortalInvitationEmail } from '../_shared/email-templates.ts'

const template = getPortalInvitationEmail('John Doe', 'https://portal.getonapod.com/abc123')
// Returns styled email with branding and portal features explanation
```

##### `getMagicLinkEmail(clientFirstName: string, magicLink: string): EmailTemplate`

Generates a magic link authentication email template.

**Parameters:**
- `clientFirstName` (string) - The client's first name
- `magicLink` (string) - The magic link URL for authentication

**Returns:** `EmailTemplate` object with subject, HTML, and text versions

**Example Usage:**
```typescript
import { getMagicLinkEmail } from '../_shared/email-templates.ts'

const template = getMagicLinkEmail('John', 'https://portal.getonapod.com/login?token=xyz789')
// Returns 15-minute expiry login email with branded styling
```

---

### Podcast Cache

**File:** `/supabase/functions/_shared/podcastCache.ts`

Centralized podcast cache management system that saves 60-80% on Podscan API calls by deduplicating podcast data across clients and prospects.

#### Interfaces

```typescript
interface PodcastCacheData {
  podscan_id: string;
  podcast_name: string;
  podcast_description?: string;
  podcast_image_url?: string;
  podcast_url?: string;
  publisher_name?: string;
  host_name?: string;
  podcast_categories?: any;
  language?: string;
  region?: string;
  episode_count?: number;
  last_posted_at?: string;
  is_active?: boolean;
  podcast_has_guests?: boolean;
  podcast_has_sponsors?: boolean;
  itunes_rating?: number;
  itunes_rating_count?: number;
  audience_size?: number;
  podcast_reach_score?: number;
  podscan_email?: string;
  website?: string;
  rss_url?: string;
  demographics?: any;
  demographics_episodes_analyzed?: number;
}

interface CachedPodcast extends PodcastCacheData {
  id: string;
  podscan_last_fetched_at: string;
  podscan_fetch_count: number;
  cache_hit_count: number;
  created_at: string;
  updated_at: string;
}
```

#### Functions

##### `getCachedPodcasts(supabaseClient, podcastIds: string[], staleDays: number = 7)`

Retrieves podcasts from central cache and identifies missing/stale entries.

**Parameters:**
- `supabaseClient` - Supabase client instance
- `podcastIds` (string[]) - Array of Podscan podcast IDs
- `staleDays` (number, optional) - Days after which cache is considered stale (default: 7)

**Returns:**
```typescript
{
  cached: CachedPodcast[];     // Successfully cached podcasts
  missing: string[];           // Podcast IDs not in cache
  stale: string[];            // Podcast IDs with stale data
}
```

**Example Usage:**
```typescript
import { getCachedPodcasts } from '../_shared/podcastCache.ts'

const result = await getCachedPodcasts(supabase, ['podcast1', 'podcast2', 'podcast3'])
// Returns cached data and identifies what needs fresh API calls
```

##### `upsertPodcastCache(supabaseClient, podcastData: PodcastCacheData)`

Creates or updates a single podcast cache entry.

**Parameters:**
- `supabaseClient` - Supabase client instance
- `podcastData` (PodcastCacheData) - Podcast data to cache

**Returns:**
```typescript
{
  success: boolean;
  podcast_id?: string;
  error?: any;
}
```

##### `batchUpsertPodcastCache(supabaseClient, podcastsData: PodcastCacheData[])`

Efficiently upserts multiple podcasts in a single operation.

**Parameters:**
- `supabaseClient` - Supabase client instance
- `podcastsData` (PodcastCacheData[]) - Array of podcast data

**Returns:**
```typescript
{
  success: boolean;
  count: number;
  errors: any[];
}
```

##### `updatePodcastDemographics(supabaseClient, podscanId: string, demographics: any, episodesAnalyzed?: number)`

Updates demographic data for a cached podcast.

##### `getCacheStatistics(supabaseClient)`

Returns cache usage statistics.

##### `cleanupStaleCache(supabaseClient, staleDays: number = 30)`

Maintenance function to remove old cache entries.

---

## V Functions

### validate-portal-session

**Endpoint:** `/functions/v1/validate-portal-session`  
**Method:** `POST`  
**Purpose:** Validates an active client portal session and returns client information

#### Authentication
- **Type:** Service Role Key (internal function)
- **Requirements:** Valid session token

#### Request

**Headers:**
```http
Content-Type: application/json
```

**Body:**
```typescript
{
  "sessionToken": string  // Required: The session token to validate
}
```

**Example Request:**
```bash
curl -X POST https://your-project.supabase.co/functions/v1/validate-portal-session \
  -H "Content-Type: application/json" \
  -d '{"sessionToken": "abc123-def456-ghi789"}'
```

#### Response

**Success Response (200):**
```typescript
{
  "success": true,
  "client": {
    "id": string,
    "name": string,
    "email": string,
    "contact_person": string,
    "linkedin_url": string,
    "website": string,
    // ... other client fields
  }
}
```

**Error Responses:**

**400 Bad Request:**
```typescript
{
  "success": false,
  "error": "Session token is required"
}
```

**401 Unauthorized:**
```typescript
{
  "success": false,
  "error": "Session expired or invalid"
}
```

**500 Internal Server Error:**
```typescript
{
  "success": false,
  "error": "Failed to validate session"
}
```

#### Behavior

1. Validates the provided session token exists and is not expired
2. Updates the session's `last_active_at` timestamp
3. Returns associated client information
4. Handles CORS preflight requests

#### CORS Headers
```http
Access-Control-Allow-Origin: *
Access-Control-Allow-Headers: authorization, x-client-info, apikey, content-type
```

---

### verify-portal-token

**Endpoint:** `/functions/v1/verify-portal-token`  
**Method:** `POST`  
**Purpose:** Verifies a magic link token and creates a new portal session

#### Authentication
- **Type:** Service Role Key (internal function)
- **Requirements:** Valid magic link token

#### Request

**Headers:**
```http
Content-Type: application/json
```

**Body:**
```typescript
{
  "token": string  // Required: Magic link token from email
}
```

**Example Request:**
```bash
curl -X POST https://your-project.supabase.co/functions/v1/verify-portal-token \
  -H "Content-Type: application/json" \
  -d '{"token": "magic-link-token-12345"}'
```

#### Response

**Success Response (200):**
```typescript
{
  "success": true,
  "session": {
    "session_token": string,      // New session token (24h expiry)
    "expires_at": string,         // ISO timestamp
    "client_id": string
  },
  "client": {
    "id": string,
    "name": string,
    "email": string,
    "contact_person": string,
    "linkedin_url": string,
    "website": string
  }
}
```

**Error Responses:**

**400 Bad Request:**
```typescript
{
  "error": "Token is required"
}
```

**401 Unauthorized - Invalid/Expired Token:**
```typescript
{
  "error": "Invalid or expired login link. Please request a new one."
}
```

**401 Unauthorized - Already Used:**
```typescript
{
  "error": "This login link has already been used. Please request a new one."
}
```

**401 Unauthorized - Expired:**
```typescript
{
  "error": "This login link has expired. Please request a new one."
}
```

**403 Forbidden - Access Disabled:**
```typescript
{
  "error": "Portal access has been disabled. Please contact support."
}
```

**500 Internal Server Error:**
```typescript
{
  "error": "Internal server error"
}
```

#### Behavior

1. **Token Validation**: Checks if token exists in database
2. **Usage Check**: Ensures token hasn't been used before
3. **Expiration Check**: Validates token hasn't expired
4. **Client Verification**: Confirms client exists and has portal access enabled
5. **Token Consumption**: Marks token as used (single-use only)
6. **Session Creation**: Generates new 24-hour session
7. **Activity Logging**: Records login attempt and success/failure
8. **Client Update**: Updates last login timestamp

#### Security Features

- **Single-use tokens**: Each magic link can only be used once
- **IP and User-Agent logging**: Tracks login attempts for security
- **Session expiry**: 24-hour session timeout
- **Portal access control**: Can be disabled per client
- **Comprehensive audit trail**: All actions logged to `client_portal_activity_log`

#### CORS Headers
```http
Access-Control-Allow-Origin: *
Access-Control-Allow-Headers: authorization, x-client-info, apikey, content-type
```

#### Activity Logging

The function logs various events to `client_portal_activity_log`:

- `login_success` - Successful authentication
- `login_failed` - Failed authentication with reason:
  - `token_already_used`
  - `token_expired`  
  - `portal_access_disabled`

---

## Error Handling

All functions implement comprehensive error handling with:

1. **Structured error responses** with consistent format
2. **Detailed logging** for debugging and monitoring
3. **Security considerations** (no sensitive data in error messages)
4. **CORS support** for web client integration
5. **Graceful degradation** with meaningful error messages

## Security Considerations

1. **Service Role Access**: Functions use service role key to bypass RLS
2. **Input Validation**: All inputs are validated before processing
3. **Single-Use Tokens**: Magic links can only be used once
4. **Session Management**: Automatic session expiry and cleanup
5. **Activity Logging**: Complete audit trail for security monitoring
6. **Rate Limiting**: Consider implementing rate limiting for production use

## Integration Examples

### Frontend Session Management

```javascript
// Validate existing session
async function validateSession(sessionToken) {
  const response = await fetch('/functions/v1/validate-portal-session', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ sessionToken })
  })
  
  const data = await response.json()
  
  if (data.success) {
    return data.client
  } else {
    // Redirect to login
    window.location.href = '/login'
  }
}

// Process magic link
async function verifyToken(token) {
  const response = await fetch('/functions/v1/verify-portal-token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ token })
  })
  
  const data = await response.json()
  
  if (data.success) {
    // Store session token
    localStorage.setItem('sessionToken', data.session.session_token)
    localStorage.setItem('client', JSON.stringify(data.client))
    
    // Redirect to portal
    window.location.href = '/portal'
  } else {
    alert(data.error)
  }
}
```

### Email Integration

```javascript
import { getMagicLinkEmail } from '../_shared/email-templates.ts'

// Send magic link email
async function sendMagicLink(clientEmail, magicLink) {
  const client = await getClientByEmail(clientEmail)
  const emailTemplate = getMagicLinkEmail(client.contact_person, magicLink)
  
  await sendEmail({
    to: clientEmail,
    subject: emailTemplate.subject,
    html: emailTemplate.html,
    text: emailTemplate.text
  })
}
```

---

*This documentation is current as of the latest function implementations. Always refer to the source code for the most up-to-date implementation details.*