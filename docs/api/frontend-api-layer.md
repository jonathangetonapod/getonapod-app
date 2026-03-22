# Frontend API Layer Documentation

## Overview

The Authority Built frontend uses a structured API layer built on top of **Supabase** as the primary backend service. The architecture includes direct database operations, Supabase Edge Functions, external API integrations, and a React Query-based data fetching strategy.

## Architecture Components

### 1. Core Infrastructure

#### Supabase Client (`/src/lib/supabase.ts`)
```typescript
import { createClient } from '@supabase/supabase-js'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

export const supabase = createClient(supabaseUrl, supabaseAnonKey)
```

**Environment Variables Required:**
- `VITE_SUPABASE_URL` - Supabase project URL
- `VITE_SUPABASE_ANON_KEY` - Supabase anonymous key

### 2. Authentication System

#### Admin Authentication (`/src/contexts/AuthContext.tsx`)
**Features:**
- Google OAuth integration
- Email/password authentication
- Admin email validation
- Session management

**Key Methods:**
```typescript
interface AuthContextType {
  user: User | null
  session: Session | null
  loading: boolean
  signInWithGoogle: () => Promise<void>
  signInWithPassword: (email: string, password: string) => Promise<void>
  signOut: () => Promise<void>
}
```

**Admin Authorization:**
- Uses `admin_users` table for email-based access control
- Fallback admin email: `jonathan@getonapod.com`
- Caches admin emails for performance (1-minute TTL)

#### Client Portal Authentication (`/src/contexts/ClientPortalContext.tsx`)
**Features:**
- Magic link authentication
- Password-based login
- Session token management
- Admin impersonation mode

**Key Methods:**
```typescript
interface ClientPortalContextType {
  client: Client | null
  session: ClientPortalSession | null
  loading: boolean
  isImpersonating: boolean
  requestMagicLink: (email: string) => Promise<void>
  loginWithToken: (token: string) => Promise<void>
  loginWithPassword: (email: string, password: string) => Promise<void>
  impersonateClient: (client: Client) => void
  exitImpersonation: () => void
  logout: () => Promise<void>
}
```

### 3. Service Layer Architecture

#### Database Service Pattern
All services follow a consistent pattern for database operations:

1. **Import Supabase client**
2. **Define TypeScript interfaces**
3. **Implement CRUD operations**
4. **Error handling with descriptive messages**
5. **Return typed data**

Example from `/src/services/clients.ts`:
```typescript
export interface Client {
  id: string
  name: string
  email: string | null
  // ... other fields
}

export async function getClients(options?: {
  search?: string
  status?: 'active' | 'paused' | 'churned'
  limit?: number
  offset?: number
}) {
  let query = supabase
    .from('clients')
    .select('*', { count: 'exact' })

  // Apply filters
  if (options?.status) {
    query = query.eq('status', options.status)
  }

  if (options?.search) {
    query = query.or(`name.ilike.%${options.search}%,email.ilike.%${options.search}%`)
  }

  const { data, error, count } = await query
  
  if (error) {
    throw new Error(`Failed to fetch clients: ${error.message}`)
  }

  return { clients: data as Client[], total: count || 0 }
}
```

### 4. Edge Functions Integration

#### Client Portal Functions (`/src/services/clientPortal.ts`)
The client portal uses Supabase Edge Functions for secure operations:

**Available Functions:**
- `send-portal-magic-link` - Sends authentication emails
- `verify-portal-token` - Validates magic link tokens
- `login-with-password` - Password authentication
- `validate-portal-session` - Session validation
- `logout-portal-session` - Session termination
- `get-client-bookings` - Protected booking data
- `analyze-podcast-fit` - AI analysis with caching

**Usage Pattern:**
```typescript
export async function requestMagicLink(email: string): Promise<void> {
  const { data, error } = await supabase.functions.invoke('send-portal-magic-link', {
    body: { email }
  })

  if (error) {
    throw new Error(error.message || 'Failed to send login link')
  }

  if (!data.success) {
    throw new Error(data.error || 'Failed to send login link')
  }
}
```

### 5. React Query Integration

#### Query Usage Pattern (`/src/components/admin/GlobalCacheStats.tsx`)
```typescript
import { useQuery } from '@tanstack/react-query'
import { getCacheStatistics } from '@/services/podcastCache'

export function GlobalCacheStats() {
  const { data: stats, isLoading } = useQuery({
    queryKey: ['global-cache-stats'],
    queryFn: getCacheStatistics,
    refetchInterval: 60000 // Refresh every minute
  })

  // Component logic...
}
```

**Query Key Patterns:**
- `['global-cache-stats']` - Cache statistics
- `['clients', filters]` - Client data with filters
- `['client-bookings', clientId]` - Client-specific bookings

### 6. External API Integrations

#### Podscan API (`/src/services/podscan.ts`)
**Purpose:** Podcast data and search functionality

**Authentication:**
```typescript
const PODSCAN_API_BASE = 'https://podscan.fm/api/v1'
const API_KEY = import.meta.env.VITE_PODSCAN_API_KEY
```

**Interface:**
```typescript
export interface PodcastData {
  podcast_id: string
  podcast_name: string
  podcast_url: string
  podcast_description?: string
  podcast_image_url?: string
  reach?: {
    audience_size?: number
    itunes?: {
      itunes_rating_average?: string
      itunes_rating_count?: string
    }
  }
  // ... more fields
}
```

**Key Functions:**
```typescript
// Core search
export async function searchPodcasts(options: SearchOptions): Promise<PodcastSearchResponse>

// Pre-built searches with randomized ordering and quality filters
export async function searchBusinessPodcasts(limit?: number): Promise<PodcastData[]>
export async function searchPremiumPodcasts(limit?: number): Promise<PodcastData[]>
export async function searchFinancePodcasts(limit?: number): Promise<PodcastData[]>
export async function searchTechPodcasts(limit?: number): Promise<PodcastData[]>
export async function searchPodcastsByCategory(categories: string[], limit?: number): Promise<PodcastData[]>

// Single podcast lookup
export async function getPodcastById(podcastId: string): Promise<PodcastData>
export async function getRelatedPodcasts(podcastId: string): Promise<PodcastData[]>
export async function getPodcastDemographics(podcastId: string): Promise<PodcastDemographics | null>

// Paginated search with progress callbacks
export async function previewSearch(options: SearchOptions): Promise<{ totalCount: number; totalPages: number; firstPage: PodcastData[] }>
export async function searchAllPodcasts(
  options: SearchOptions,
  onPage: (podcasts: PodcastData[], pageNum: number, totalPages: number, totalCount: number) => void | Promise<void>,
  onProgress?: (message: string) => void,
  maxPages?: number,
  opts?: { firstPageData?: PodcastData[]; totalCount?: number; totalPages?: number; abortSignal?: AbortSignal }
): Promise<{ totalFound: number; totalPages: number }>

// Analytics helper
export function getPodcastAnalytics(podcast: PodcastData): PodcastAnalytics

// Charts API
export async function getChartCountries(): Promise<ChartCountry[]>
export async function getChartCategories(platform: 'apple' | 'spotify', countryCode: string): Promise<ChartCategory[]>
export async function getTopChartPodcasts(platform: 'apple' | 'spotify', countryCode: string, category: string, limit?: number): Promise<ChartPodcast[]>
```

**Architecture Notes:**
- `searchBusinessPodcasts` randomizes `order_by` across rating/episode_count/audience_size/last_posted_at for variety, filters to US podcasts with guests, audience 1K-30K
- `searchAllPodcasts` paginates through all results (50 per page) with 500ms rate-limit delays, retry logic for 429 errors, and abort signal support
- Chart API normalizes field names across Apple and Spotify response formats

#### HeyGen Video Service (`/src/services/heygen.ts`)
**Purpose:** AI avatar video generation for prospect dashboards

**Environment Variables:**
- `VITE_HEYGEN_API_KEY` - HeyGen API key
- `VITE_VIDEO_SERVICE_URL` - Video generator service URL (default: `http://localhost:3001`)

**Interfaces:**
```typescript
export interface HeyGenTemplateVariable {
  name: string
  type: 'text' | 'image' | 'video' | 'audio' | 'avatar'
  properties: Record<string, any>
}

export interface HeyGenGenerateRequest {
  title: string
  caption?: boolean
  variables: Record<string, HeyGenTemplateVariable>
}

export interface HeyGenVideoStatus {
  id: string
  status: 'pending' | 'waiting' | 'processing' | 'completed' | 'failed'
  video_url?: string | null
  thumbnail_url?: string | null
  gif_url?: string | null
  duration?: number | null
  error?: { code: number; message: string; detail: string } | null
}
```

**Key Functions:**
```typescript
export async function listTemplates(): Promise<any>
export async function getTemplateDetails(templateId?: string): Promise<any>
export async function generateVideoFromTemplate(
  request: HeyGenGenerateRequest,
  templateId?: string
): Promise<{ video_id: string }>
export async function getVideoStatus(videoId: string, dashboardId: string): Promise<HeyGenVideoStatus>
export async function generateProspectVideo(
  dashboardId: string,
  backgroundVideoUrl: string,
  firstName: string
): Promise<string>
export async function pollVideoStatus(
  videoId: string,
  dashboardId: string,
  maxAttempts?: number,
  intervalMs?: number
): Promise<string>
```

**Architecture Notes:**
- `generateProspectVideo` and `getVideoStatus` route through a separate video-generator service to keep API keys secure server-side
- `pollVideoStatus` polls until completion (default 120 attempts at 5s intervals = 10 min timeout)

#### Anthropic Claude AI (`/src/services/ai.ts`)
**Purpose:** AI-powered podcast summaries and feature suggestions

**Environment Variable:** `VITE_ANTHROPIC_API_KEY`

**Model:** `claude-sonnet-4-5-20250929` (via `@anthropic-ai/sdk`, `dangerouslyAllowBrowser: true`)

**Key Functions:**
```typescript
export async function generatePodcastSummary(input: PodcastSummaryInput): Promise<string>
export async function generatePodcastFeatures(audienceSize: number): Promise<string[]>
```

**`PodcastSummaryInput` Interface:**
```typescript
interface PodcastSummaryInput {
  podcast_name: string
  audience_size: string
  episode_count: string
  rating: string
  reach_score: string
  description?: string
  categories?: string[]
  publisher_name?: string
}
```

**Fallback:** Returns a template-based summary if the API call fails.

#### Stripe Payment (`/src/services/stripe.ts`)
**Purpose:** Payment processing for premium podcast placements and addon services

**Environment Variable:** `VITE_STRIPE_PUBLISHABLE_KEY`

**Key Functions:**
```typescript
export const createCheckoutSession = async (
  cartItems: CartItem[],
  customerEmail: string,
  customerName: string
): Promise<{ sessionId: string; url: string }>

export const redirectToCheckout = async (sessionId: string): Promise<void>

export const getCheckoutSession = async (sessionId: string): Promise<{ sessionId: string }>

export const createAddonCheckoutSession = async (
  addons: Array<{ bookingId: string; serviceId: string }>,
  clientId: string
): Promise<{ sessionId: string; url: string }>
```

**Architecture Notes:**
- Stripe is lazy-loaded via `loadStripe()` only when needed
- Checkout sessions are created via Supabase Edge Functions (`create-checkout-session`, `create-addon-checkout`)
- Webhooks handle order creation server-side

#### Google Calendar (`/src/lib/googleCalendar.ts`)
**Purpose:** Generate Google Calendar "Add Event" URLs for podcast bookings

**Key Functions:**
```typescript
export function generateGoogleCalendarUrl(event: CalendarEventDetails): string
export function openGoogleCalendar(event: CalendarEventDetails): void
export function createCalendarEventFromBooking(booking: {
  podcast_name: string
  recording_date?: string | null
  scheduled_date?: string | null
  episode_url?: string | null
  podcast_url?: string | null
  host_name?: string | null
  notes?: string | null
}): CalendarEventDetails | null
```

**`CalendarEventDetails` Interface:**
```typescript
interface CalendarEventDetails {
  title: string
  startTime: Date
  endTime: Date
  description?: string
  location?: string
}
```

#### Google Indexing (`/src/services/indexing.ts`)
**Purpose:** Submit blog posts to Google Indexing API and check indexing status via Search Console API

**Key Interfaces:**
```typescript
export interface IndexingLog {
  id: string
  post_id: string
  url: string
  service: 'google'
  action: 'submit' | 'update' | 'check_status'
  status: 'success' | 'failed' | 'pending'
  response_data?: any
  error_message?: string
  created_at: string
}

export interface IndexingStats {
  total_posts: number
  submitted: number
  indexed: number
  failed: number
  pending: number
  indexation_rate: number
}

export interface IndexingStatusCheck {
  isIndexed: boolean
  coverageState: string
  lastCrawlTime?: string
  indexingState?: string
  verdict?: string
  canonicalUrl?: string
}
```

**Key Functions:**
```typescript
// Submission
export const submitToGoogleIndexing = async (url: string, postId: string): Promise<{ success: boolean; message: string }>
export const submitBatchToGoogleIndexing = async (posts: Array<{ url: string; postId: string }>): Promise<Array<...>>

// Status checking
export const checkGoogleIndexingStatus = async (url: string, postId: string): Promise<CheckIndexingResponse>
export const checkBatchGoogleIndexingStatus = async (posts: Array<{ url: string; postId: string }>): Promise<Array<...>>

// Logs & statistics
export const getIndexingLogsByPost = async (postId: string): Promise<IndexingLog[]>
export const getRecentIndexingLogs = async (limit?: number): Promise<any[]>
export const getFailedIndexingAttempts = async (): Promise<any[]>
export const getIndexingStats = async (): Promise<IndexingStats>
export const getPostsNeedingIndexing = async (): Promise<any[]>
export const getPostsNeedingResubmission = async (): Promise<any[]>

// Helpers
export const buildPostUrl = (slug: string): string
export const hasBeenSubmitted = (post: { submitted_to_google_at?: string | null }): boolean
export const hasBeenIndexed = (post: { indexed_by_google_at?: string | null }): boolean
export const getDaysSinceSubmission = (submittedAt?: string | null): number | null
export const getIndexingStatusBadge = (post: { ... }): { label: string; color: string }
```

**Architecture Notes:**
- Submission and status-check calls go through Supabase Edge Functions (`submit-to-indexing`, `check-indexing-status`)
- Batch operations include rate limiting (350ms for Indexing API, 500ms for Search Console API)

### 7. Data Models and Interfaces

#### Core Entities

**Client Interface:**
```typescript
export interface Client {
  id: string
  name: string
  email: string | null
  linkedin_url: string | null
  website: string | null
  calendar_link: string | null
  contact_person: string | null
  first_invoice_paid_date: string | null
  status: 'active' | 'paused' | 'churned'
  notes: string | null
  bio: string | null
  photo_url: string | null
  google_sheet_url: string | null
  media_kit_url: string | null
  prospect_dashboard_slug: string | null
  outreach_webhook_url: string | null
  bison_campaign_id: string | null
  created_at: string
  updated_at: string
  // Portal access fields
  portal_access_enabled?: boolean
  portal_last_login_at?: string | null
  portal_invitation_sent_at?: string | null
  portal_password?: string | null
  password_set_at?: string | null
  password_set_by?: string | null
}
```

**Session Management:**
```typescript
export interface ClientPortalSession {
  session_token: string
  expires_at: string
  client_id: string
}
```

### 8. Caching Strategy

#### Universal Podcast Cache (`/src/services/podcastCache.ts`)
**Purpose:** Prevents duplicate API calls across different features

**Cache Sources (Priority Order):**
1. `client_dashboard_podcasts` (most complete data)
2. `prospect_dashboard_podcasts` 
3. `bookings` (partial data)

**Cache Interface:**
```typescript
export interface UniversalPodcastCache {
  podcast_id: string
  podcast_name: string
  podcast_description?: string
  podcast_image_url?: string
  podcast_url?: string
  publisher_name?: string
  itunes_rating?: number
  episode_count?: number
  audience_size?: number
  podcast_categories?: any
  demographics?: any
  source: 'client_dashboard' | 'prospect_dashboard' | 'booking' | 'not_found'
  source_id?: string
  cached_at?: string
  has_demographics?: boolean
}
```

**Key Functions:**
```typescript
// Single podcast lookup (checks client_dashboard -> prospect_dashboard -> bookings in priority order)
export async function findCachedPodcastMetadata(podcastId: string): Promise<UniversalPodcastCache | null>

// Batch lookup - queries all sources in parallel, returns Map<podcast_id, cache>
export async function findCachedPodcastsMetadata(podcastIds: string[]): Promise<Map<string, UniversalPodcastCache>>

// Global statistics across all cache sources with embedding coverage
export async function getCacheStatistics(): Promise<CacheStatistics>

// Per-client cache breakdown showing how many podcasts need fresh API fetches
export async function getClientCacheStatus(clientId: string, podcastIds: string[]): Promise<{
  total: number
  cached_in_client: number
  cached_in_other_clients: number
  cached_in_prospects: number
  cached_in_bookings: number
  needs_fetch: number
  cache_map: Map<string, UniversalPodcastCache>
}>
```

### 9. File Upload and Storage

#### Supabase Storage Integration
**Bucket:** `client-assets`
**Path Pattern:** `client-photos/{clientId}-{timestamp}.{ext}`

```typescript
export async function uploadClientPhoto(clientId: string, file: File) {
  const fileExt = file.name.split('.').pop()
  const fileName = `${clientId}-${Date.now()}.${fileExt}`
  const filePath = `client-photos/${fileName}`

  // Upload to Supabase Storage
  const { error: uploadError } = await supabase.storage
    .from('client-assets')
    .upload(filePath, file, {
      cacheControl: '3600',
      upsert: true
    })

  if (uploadError) {
    throw new Error(`Failed to upload photo: ${uploadError.message}`)
  }

  // Get public URL
  const { data: { publicUrl } } = supabase.storage
    .from('client-assets')
    .getPublicUrl(filePath)

  // Update client record
  const { data, error } = await supabase
    .from('clients')
    .update({ photo_url: publicUrl })
    .eq('id', clientId)
    .select()
    .single()

  return data as Client
}
```

### 10. Analytics and Statistics

#### Pricing Analytics (`/src/services/analytics.ts`)
**Data Source:** `premium_podcasts` table

**Analytics Interface:**
```typescript
export interface PricingAnalytics {
  averagePricePerListener: number
  totalInventoryValue: number
  averagePrice: number
  averageAudienceSize: number
  totalReach: number
  priceByAudienceTier: Array<{
    tier: string
    range: string
    avgPrice: number
    avgCPL: number
    count: number
  }>
  priceByCategory: Array<{
    category: string
    avgPrice: number
    avgCPL: number
    count: number
  }>
  topPodcasts: Array<{
    name: string
    price: number
    audience: string
    cpl: number
  }>
  priceDistribution: Array<{
    range: string
    count: number
  }>
}
```

### 11. Database Services

#### Bookings (`/src/services/bookings.ts`)
**Purpose:** Full CRUD for podcast booking records with client joins, date filtering, and statistics
**Table:** `bookings`

```typescript
export interface Booking {
  id: string
  client_id: string
  podcast_name: string
  podcast_url: string | null
  host_name: string | null
  scheduled_date: string | null
  recording_date: string | null
  publish_date: string | null
  status: 'conversation_started' | 'in_progress' | 'booked' | 'recorded' | 'published' | 'cancelled'
  episode_url: string | null
  notes: string | null
  prep_sent: boolean
  // Podcast metadata from Podscan
  podcast_id: string | null
  audience_size: number | null
  podcast_description: string | null
  itunes_rating: number | null
  itunes_rating_count: number | null
  episode_count: number | null
  podcast_image_url: string | null
  rss_url: string | null
  created_at: string
  updated_at: string
}

export interface BookingWithClient extends Booking {
  client: Client
}
```

**Key Functions:**
```typescript
export async function getBookings(options?: {
  client_id?: string
  status?: 'booked' | 'in_progress' | 'recorded' | 'published' | 'cancelled'
  date_from?: string
  date_to?: string
  search?: string
  limit?: number
  offset?: number
}): Promise<{ bookings: BookingWithClient[]; total: number }>

export async function getBookingById(bookingId: string): Promise<BookingWithClient>
export async function getBookingsByDate(date: string): Promise<BookingWithClient[]>
export async function getBookingsByMonth(year: number, month: number): Promise<BookingWithClient[]>
export async function createBooking(input: { client_id: string; podcast_name: string; ... }): Promise<BookingWithClient>
export async function updateBooking(bookingId: string, updates: Partial<Booking>): Promise<BookingWithClient>
export async function deleteBooking(bookingId: string): Promise<void>
export async function getBookingStats(): Promise<{ totalBookings: number; booked: number; inProgress: number; recorded: number; published: number }>
export async function getClientBookingStats(clientId: string): Promise<{ total: number; booked: number; inProgress: number; recorded: number; published: number }>
```

**Architecture Notes:**
- All queries join with `clients(*)` to return `BookingWithClient`
- `getBookings` supports pagination via `limit`/`offset` and returns total count
- Ordered by `scheduled_date` descending (newest first, nulls last)

#### Clients (`/src/services/clients.ts`)
**Purpose:** Full CRUD for client records with portal password management, photo upload, and statistics
**Table:** `clients`

```typescript
export interface Client {
  id: string
  name: string
  email: string | null
  linkedin_url: string | null
  website: string | null
  calendar_link: string | null
  contact_person: string | null
  first_invoice_paid_date: string | null
  status: 'active' | 'paused' | 'churned'
  notes: string | null
  bio: string | null
  photo_url: string | null
  google_sheet_url: string | null
  media_kit_url: string | null
  prospect_dashboard_slug: string | null
  outreach_webhook_url: string | null
  bison_campaign_id: string | null
  created_at: string
  updated_at: string
  // Portal access fields
  portal_access_enabled?: boolean
  portal_last_login_at?: string | null
  portal_invitation_sent_at?: string | null
  portal_password?: string | null
  password_set_at?: string | null
  password_set_by?: string | null
}
```

**Key Functions:**
```typescript
// CRUD
export async function getClients(options?: { search?: string; status?: 'active' | 'paused' | 'churned'; limit?: number; offset?: number }): Promise<{ clients: Client[]; total: number }>
export async function getClientById(clientId: string): Promise<Client>
export async function createClient(input: { name: string; email?: string; ... }): Promise<Client>
export async function updateClient(clientId: string, updates: Partial<Client>): Promise<Client>
export async function deleteClient(clientId: string): Promise<void>

// Portal password management
export async function setClientPassword(clientId: string, password: string, setBy?: string): Promise<void>
export async function clearClientPassword(clientId: string): Promise<void>
export function generatePassword(length?: number): string

// Statistics
export async function getClientStats(): Promise<{ totalClients: number; activeClients: number; totalBookings: number }>

// Photo management
export async function uploadClientPhoto(clientId: string, file: File): Promise<Client>
export async function removeClientPhoto(clientId: string, photoUrl: string): Promise<Client>
```

**Architecture Notes:**
- `getClients` supports search across `name` and `email` fields via `or` filter
- Ordered alphabetically by name
- `uploadClientPhoto` stores files in Supabase Storage bucket `client-assets` under `client-photos/`
- `generatePassword` uses `crypto.getRandomValues` for secure random generation

#### Google Sheets (`/src/services/googleSheets.ts`)
**Purpose:** Google Sheets integration for client podcast outreach lists, prospect dashboards, and AI-powered podcast fit analysis
**Edge Functions:** `create-client-google-sheet`, `export-to-google-sheets`, `create-prospect-sheet`, `append-prospect-sheet`, `get-client-outreach-podcasts`, `delete-outreach-podcast`, `analyze-podcast-fit`

```typescript
export interface CreateSheetResult {
  success: boolean
  spreadsheetUrl: string
  spreadsheetId: string
  message: string
}

export interface ExportToSheetsResult {
  success: boolean
  rowsAdded: number
  updatedRange: string
  cacheSaved?: number
  cacheSkipped?: number
  cacheErrors?: number
}

export interface CreateProspectSheetResult {
  success: boolean
  spreadsheetUrl: string
  spreadsheetId: string
  sheetTitle: string
  rowsAdded: number
  message: string
  dashboardUrl: string
  dashboardSlug: string
}

export interface AnalyzePodcastFitResult {
  success: boolean
  cached: boolean
  analysis: PodcastFitAnalysis
}
```

**Key Functions:**
```typescript
// Client sheet operations (require authenticated JWT)
export async function createClientGoogleSheet(clientId: string, clientName: string): Promise<CreateSheetResult>
export async function exportPodcastsToGoogleSheets(clientId: string, podcasts: PodcastExportData[]): Promise<ExportToSheetsResult>

// Prospect sheet operations (require authenticated JWT)
export async function createProspectSheet(prospectName: string, prospectBio: string | undefined, podcasts: PodcastExportData[], prospectImageUrl?: string): Promise<CreateProspectSheetResult>
export async function appendToProspectSheet(dashboardId: string, podcasts: PodcastExportData[]): Promise<AppendToProspectSheetResult>

// Outreach management (use anon key)
export async function getClientOutreachPodcasts(clientId: string): Promise<GetOutreachPodcastsResult>
export async function deleteOutreachPodcast(clientId: string, podcastId: string): Promise<DeleteOutreachPodcastResult>

// AI analysis (uses anon key)
export async function analyzePodcastFit(podcast: PodcastDataForAnalysis, clientId: string, clientName: string, clientBio: string): Promise<AnalyzePodcastFitResult>
```

**Architecture Notes:**
- Client/prospect sheet creation and export functions require an authenticated user session (JWT from `supabase.auth.getSession()`)
- `getClientOutreachPodcasts` fetches podcast IDs from the Edge Function, then fetches full metadata from Podscan API client-side in batches of 10 with 100ms delays
- `analyzePodcastFit` returns cached results when available to save API credits

#### AI Categorization (`/src/services/categorization.ts`)
**Purpose:** Auto-categorize podcasts using Claude AI

**Model:** `claude-haiku-4-5-20251001` (via direct REST API with `VITE_ANTHROPIC_API_KEY`)

```typescript
export interface AutoCategorizeInput {
  podcastName: string
  description?: string
  whyThisShow?: string
}

export async function autoCategorizePodcast(input: AutoCategorizeInput): Promise<string>
```
Falls back to `'Business'` if the API is unavailable or the response is unrecognized.

#### Query Generation (`/src/services/queryGeneration.ts`)
**Purpose:** AI-powered podcast search query generation via Edge Function

```typescript
export interface GenerateQueriesInput {
  clientName?: string
  clientBio?: string
  clientEmail?: string
  prospectName?: string
  prospectBio?: string
  additionalContext?: Record<string, any>
}

export async function generatePodcastQueries(input: GenerateQueriesInput): Promise<string[]>
export async function regenerateQuery(input: GenerateQueriesInput, oldQuery: string): Promise<string>
```
Uses Edge Function `generate-podcast-queries` with authenticated JWT.

#### Compatibility Scoring (`/src/services/compatibilityScoring.ts`)
**Purpose:** AI-scored podcast-to-client compatibility via Edge Function

```typescript
export interface PodcastForScoring {
  podcast_id: string
  podcast_name: string
  podcast_description?: string | null
  publisher_name?: string | null
  podcast_categories?: Array<{ category_name: string }> | null
  audience_size?: number | null
  episode_count?: number | null
}

export interface CompatibilityScore {
  podcast_id: string
  score: number | null
  reasoning?: string
}

export async function scoreCompatibilityBatch(
  bio: string,
  podcasts: PodcastForScoring[],
  batchSize?: number,
  onProgress?: (completed: number, total: number) => void,
  isProspectMode?: boolean
): Promise<CompatibilityScore[]>

export async function scoreAndRankPodcasts(
  bio: string,
  podcasts: PodcastForScoring[],
  minScore?: number,
  onProgress?: (completed: number, total: number) => void,
  isProspectMode?: boolean
): Promise<Array<PodcastForScoring & { compatibility_score: number }>>
```
Processes in batches of 10 with 500ms delays. Uses Edge Function `score-podcast-compatibility`.

#### Addon Services (`/src/services/addonServices.ts`)
**Purpose:** Manage purchasable addon services for podcast bookings
**Table:** `addon_services`, `booking_addons`

```typescript
export interface AddonService {
  id: string
  name: string
  description: string
  short_description: string | null
  price_cents: number
  stripe_product_id: string | null
  stripe_price_id: string | null
  active: boolean
  features: string[]
  delivery_days: number
  created_at: string
  updated_at: string
}

export interface BookingAddon {
  id: string
  booking_id: string
  service_id: string
  client_id: string
  status: 'pending' | 'in_progress' | 'delivered' | 'cancelled'
  // ... plus joined service/booking/client data
}
```

**Key Functions:**
```typescript
export async function getActiveAddonServices(): Promise<AddonService[]>
export async function getAddonServiceById(serviceId: string): Promise<AddonService>
export async function getBookingAddons(bookingId: string): Promise<BookingAddon[]>
export async function getClientAddons(clientId: string): Promise<BookingAddon[]>
export async function hasBookingAddon(bookingId: string, serviceId: string): Promise<boolean>
export async function createBookingAddon(input: { ... }): Promise<BookingAddon>
export async function updateBookingAddonStatus(addonId: string, status: BookingAddon['status'], ...): Promise<BookingAddon>
export async function deleteBookingAddon(addonId: string): Promise<void>
export async function getAllBookingAddons(): Promise<BookingAddon[]>
export function formatPrice(cents: number): string
export function getAddonStatusColor(status: BookingAddon['status']): string
export function getAddonStatusText(status: BookingAddon['status']): string
```

#### Admin Users (`/src/services/adminUsers.ts`)
**Purpose:** Admin user management with in-memory caching
**Table:** `admin_users`

```typescript
export interface AdminUser {
  id: string
  email: string
  name: string | null
  added_by: string | null
  created_at: string
  updated_at: string
}

export async function getAdminUsers(): Promise<AdminUser[]>
export async function getAdminEmails(): Promise<string[]>   // 1-min TTL cache
export async function isAdminEmailAsync(email: string | undefined): Promise<boolean>
export async function addAdminUser(email: string, name?: string, addedBy?: string): Promise<AdminUser>
export async function removeAdminUser(id: string): Promise<void>
export function clearAdminCache(): void
```

#### Blog Management (`/src/services/blog.ts`)
**Purpose:** Full CRUD for blog posts and categories with SEO helpers
**Tables:** `blog_posts`, `blog_categories`

```typescript
export interface BlogPost {
  id: string
  slug: string
  title: string
  meta_description: string
  content: string
  status: 'draft' | 'published'
  view_count: number
  read_time_minutes: number
  // ... plus SEO, indexing, and category fields
}

export interface BlogCategory {
  id: string
  name: string
  slug: string
  description?: string
  display_order: number
  is_active: boolean
}
```

**Key Functions:**
```typescript
// CRUD
export const getAllPosts = async (filters?: BlogFilters): Promise<BlogPost[]>
export const getPostBySlug = async (slug: string): Promise<BlogPost>
export const getPostById = async (id: string): Promise<BlogPost>
export const createPost = async (post: CreateBlogPostInput): Promise<BlogPost>
export const updatePost = async (input: UpdateBlogPostInput): Promise<BlogPost>
export const deletePost = async (id: string): Promise<void>
export const publishPost = async (id: string): Promise<BlogPost>
export const unpublishPost = async (id: string): Promise<BlogPost>
export const incrementViewCount = async (id: string): Promise<void>

// Categories
export const getAllCategories = async (): Promise<BlogCategory[]>
export const getCategoryBySlug = async (slug: string): Promise<BlogCategory>

// Helpers
export const generateSlug = (title: string): string
export const isSlugUnique = async (slug: string, excludeId?: string): Promise<boolean>
export const calculateReadTime = (content: string): number
export const generateExcerpt = (content: string, maxLength?: number): string
export const generateSchemaMarkup = (post: BlogPost): object
export const getRelatedPosts = async (post: BlogPost, limit?: number): Promise<BlogPost[]>
```

#### Customers (`/src/services/customers.ts`)
**Purpose:** Customer and order management for the marketplace
**Tables:** `customers`, `orders`, `order_items`

```typescript
export interface Customer {
  id: string
  email: string
  full_name: string
  stripe_customer_id: string | null
  total_orders: number
  total_spent: number
  created_at: string
}

export async function getCustomers(options?: { search?: string; limit?: number; offset?: number; ... }): Promise<{ customers: Customer[]; total: number }>
export async function getCustomerById(customerId: string): Promise<CustomerWithOrders>
export async function getCustomerStats(): Promise<{ totalCustomers: number; totalRevenue: number; avgOrderValue: number; totalOrders: number }>
export async function searchCustomers(searchTerm: string): Promise<Customer[]>
```

#### Orders (`/src/services/orders.ts`)
**Purpose:** Order operations with pagination and statistics
**Tables:** `orders`, `order_items`

```typescript
export interface OrderWithItems extends Order {
  order_items: OrderItem[]
}

export async function getOrders(options?: { customerId?: string; status?: Order['status']; limit?: number; offset?: number; ... }): Promise<{ orders: OrderWithItems[]; total: number }>
export async function getOrderById(orderId: string): Promise<OrderWithItems>
export async function getRecentOrders(limit?: number): Promise<OrderWithItems[]>
export async function getOrderStats(): Promise<{ totalOrders: number; paidOrders: number; pendingOrders: number; failedOrders: number }>
export async function getOrderItems(orderId: string): Promise<OrderItem[]>
```

#### Guest Resources (`/src/services/guestResources.ts`)
**Purpose:** Manage educational resources for podcast guests
**Tables:** `guest_resources`, `guest_resource_views`

```typescript
export type ResourceType = 'article' | 'video' | 'download' | 'link'
export type ResourceCategory = 'preparation' | 'technical_setup' | 'best_practices' | 'promotion' | 'examples' | 'templates'

export interface GuestResource {
  id: string
  title: string
  description: string
  content: string | null
  category: ResourceCategory
  type: ResourceType
  url: string | null
  file_url: string | null
  featured: boolean
  display_order: number
}

export async function getGuestResources(options?: { category?: ResourceCategory; featured?: boolean }): Promise<GuestResource[]>
export async function getGuestResourceById(resourceId: string): Promise<GuestResource>
export async function createGuestResource(input: { ... }): Promise<GuestResource>
export async function updateGuestResource(resourceId: string, updates: { ... }): Promise<GuestResource>
export async function deleteGuestResource(resourceId: string): Promise<void>
export async function trackResourceView(resourceId: string, clientId: string): Promise<ResourceView | null>
export async function getClientResourceViews(clientId: string): Promise<any[]>
export async function getResourceViewCount(resourceId: string): Promise<number>
```

#### Outreach Messages (`/src/services/outreachMessages.ts`)
**Purpose:** Manage podcast outreach emails
**Table:** `outreach_messages`

```typescript
export interface OutreachMessage {
  id: string
  client_id: string
  podcast_name: string
  host_name: string
  host_email: string
  subject_line: string
  email_body: string
  status: 'pending_review' | 'approved' | 'sent' | 'failed' | 'archived'
  priority: 'high' | 'medium' | 'low' | null
  // ... plus scheduling, response tracking, and enriched podcast metadata
}

export async function getOutreachMessages(options?: { clientId?: string; campaignId?: string; status?: string; limit?: number }): Promise<OutreachMessageWithClient[]>
export async function updateOutreachMessage(id: string, updates: Partial<OutreachMessage>): Promise<OutreachMessage>
export async function deleteOutreachMessage(id: string): Promise<void>
export async function getOutreachStats(clientId?: string): Promise<{ total: number; pending_review: number; approved: number; sent: number; failed: number }>
```

#### Podcast Analytics (`/src/services/podcastAnalytics.ts`)
**Purpose:** Podcast database analytics via pre-calculated Supabase views
**Views:** `podcast_growth_stats`, `top_cached_podcasts`, `recently_added_podcasts`, `podcast_category_stats`, `podcast_cache_statistics_detailed`, `podcast_audience_distribution`, `podcast_rating_distribution`

```typescript
export async function getPodcastGrowthStats(): Promise<PodcastGrowthStats | null>
export async function getTopCachedPodcasts(): Promise<TopCachedPodcast[]>
export async function getRecentlyAddedPodcasts(): Promise<RecentlyAddedPodcast[]>
export async function getCategoryStats(): Promise<CategoryStats[]>
export async function getDetailedCacheStats(): Promise<DetailedCacheStats | null>
export async function getAudienceDistribution(): Promise<AudienceDistribution | null>
export async function getRatingDistribution(): Promise<RatingDistribution | null>
export async function getAllAnalytics(): Promise<{ growthStats, detailedStats, topCached, recentlyAdded, categoryStats, audienceDistribution, ratingDistribution }>
```

#### Podcast Database (`/src/services/podcastDatabase.ts`)
**Purpose:** Centralized podcast database with filtering, sorting, pagination, and auto-save from Podscan
**Table:** `podcasts`

```typescript
export interface PodcastFilters {
  search?: string
  categories?: string[]
  minAudience?: number
  maxAudience?: number
  minRating?: number
  hasEmail?: boolean
  isActive?: boolean
  language?: string
  region?: string
  hasGuests?: boolean
  hasSponsors?: boolean
  // ... more fields
}

export async function getPodcasts(params: GetPodcastsParams): Promise<GetPodcastsResult>
export async function getPodcastStatistics(): Promise<any>
export async function getPodcastById(id: string): Promise<{ data: PodcastDatabaseItem; error: any }>
export async function getPodcastCategories(): Promise<{ categories: string[]; error: any }>
export async function getPodcastLanguages(): Promise<{ languages: string[]; error: any }>
export async function getPodcastRegions(): Promise<{ regions: string[]; error: any }>
export function isPodcastStale(lastFetchedAt: string | null): boolean
export async function exportPodcastsToCSV(podcasts: PodcastDatabaseItem[], filename?: string): Promise<boolean>
export async function savePodcastsToDatabase(podcasts: Array<...>): Promise<{ saved: number; errors: number }>
```

**Architecture Notes:**
- Multi-select category filtering with OR logic
- Auto-saves Podscan API results via upsert on `podscan_id`
- CSV export generates a client-side download

#### Podcast Search Utilities (`/src/services/podcastSearchUtils.ts`)
**Purpose:** Multi-query search, deduplication, filtering, and sorting utilities for Podscan results

```typescript
export function deduplicatePodcasts(podcasts: PodcastData[]): PodcastData[]

export async function searchMultipleQueries(
  queries: string[],
  baseFilters?: Omit<SearchOptions, 'query'>,
  onQueryComplete?: (queryIndex: number, results: PodcastData[]) => void
): Promise<PodcastData[]>

export async function searchWithProgressiveResults(
  queries: string[],
  baseFilters?: Omit<SearchOptions, 'query'>,
  onResults: (results: PodcastData[], queryIndex: number, isComplete: boolean) => void
): Promise<PodcastData[]>

export function calculateSearchStatistics(podcasts: PodcastData[]): SearchStatistics
export function filterPodcasts(podcasts: PodcastData[], criteria: FilterCriteria): PodcastData[]
export function sortPodcasts(podcasts: PodcastData[], sortBy: SortBy, sortOrder?: 'asc' | 'desc'): PodcastData[]
```

#### Premium Podcasts (`/src/services/premiumPodcasts.ts`)
**Purpose:** CRUD for premium podcast marketplace listings
**Table:** `premium_podcasts`

```typescript
export interface PremiumPodcast {
  id: string
  podscan_id: string
  podcast_name: string
  price: string
  my_cost?: string
  category?: string
  is_featured: boolean
  is_active: boolean
  display_order: number
  whats_included: string[]
  // ... plus podcast metadata fields
}

export const getAllPremiumPodcasts = async (): Promise<PremiumPodcast[]>
export const getActivePremiumPodcasts = async (): Promise<PremiumPodcast[]>
export const getFeaturedPremiumPodcasts = async (): Promise<PremiumPodcast[]>
export const getPremiumPodcastsByCategory = async (category: string): Promise<PremiumPodcast[]>
export const getPremiumPodcastById = async (id: string): Promise<PremiumPodcast | null>
export const createPremiumPodcast = async (input: CreatePremiumPodcastInput): Promise<PremiumPodcast>
export const updatePremiumPodcast = async (input: UpdatePremiumPodcastInput): Promise<PremiumPodcast>
export const deletePremiumPodcast = async (id: string): Promise<void>
export const togglePodcastFeatured = async (id: string, isFeatured: boolean): Promise<PremiumPodcast>
export const togglePodcastActive = async (id: string, isActive: boolean): Promise<PremiumPodcast>
export const formatAudienceSize = (size: number): string
export const getPricingTierColor = (price: string): string
```

#### Sales Calls (`/src/services/salesCalls.ts`)
**Purpose:** Fathom call syncing, AI analysis, and sales performance analytics
**Tables:** `sales_calls`, `sales_call_analysis`

```typescript
export type CallType = 'sales' | 'non-sales' | 'unclassified'

export interface SalesCall {
  id: string
  recording_id: number
  title: string | null
  duration_minutes: number | null
  transcript: any
  summary: string | null
  hidden: boolean
  call_type: CallType
  // ... plus scheduling and URL fields
}

export interface SalesCallAnalysis {
  overall_score: number
  framework_adherence_score?: number
  // Corey Jackson Framework scores
  frame_control_score?: number
  discovery_current_state_score?: number
  // ... 8 more framework scores
  talk_listen_ratio_talk: number
  talk_listen_ratio_listen: number
  questions_asked_count: number
  recommendations: any[]
  strengths: string[]
  weaknesses: string[]
  key_moments: any[]
}
```

**Key Functions:**
```typescript
export const syncFathomCalls = async (daysBack?: number): Promise<any>
export const getSalesCallsWithAnalysis = async (): Promise<SalesCallWithAnalysis[]>
export const getSalesPerformanceStats = async (): Promise<{ overall_score, discovery_score, ... }>
export const getTopRecommendations = async (): Promise<any[]>
export const getRecentSalesCalls = async (page?, pageSize?, showHidden?, callTypeFilter?): Promise<{ calls, totalCount, totalPages, currentPage }>
export const analyzeSalesCall = async (callId: string, recordingId: number): Promise<any>
export const hideSalesCall = async (callId: string): Promise<void>
export const unhideSalesCall = async (callId: string): Promise<void>
export const deleteSalesCall = async (callId: string): Promise<void>
export const classifySalesCall = async (callId: string): Promise<any>
export const getUnclassifiedCallsCount = async (): Promise<number>
export const getUnclassifiedCalls = async (limit?: number): Promise<any[]>
export const getSalesAnalytics = async (daysBack?: number): Promise<{ timeSeriesData, frameworkBreakdown, improvementAreas, ... }>
```

**Edge Functions Used:** `sync-fathom-calls`, `analyze-sales-call`, `classify-sales-call`

#### Testimonials (`/src/services/testimonials.ts`)
**Purpose:** Video testimonial management with YouTube/Vimeo support
**Table:** `testimonials`

```typescript
export interface Testimonial {
  id: string
  video_url: string
  client_name: string
  client_title?: string
  client_company?: string
  client_photo_url?: string
  quote?: string
  is_featured: boolean
  display_order: number
  is_active: boolean
}

export const getAllTestimonials = async (): Promise<Testimonial[]>
export const getActiveTestimonials = async (): Promise<Testimonial[]>
export const getFeaturedTestimonials = async (): Promise<Testimonial[]>
export const getTestimonialById = async (id: string): Promise<Testimonial | null>
export const createTestimonial = async (input: CreateTestimonialInput): Promise<Testimonial>
export const updateTestimonial = async (input: UpdateTestimonialInput): Promise<Testimonial>
export const deleteTestimonial = async (id: string): Promise<void>
export const toggleFeatured = async (id: string, isFeatured: boolean): Promise<Testimonial>
export const toggleActive = async (id: string, isActive: boolean): Promise<Testimonial>
export const extractVideoId = (url: string): { platform: 'youtube' | 'vimeo' | 'unknown'; id: string }
export const getEmbedUrl = (url: string): string
export const getThumbnailUrl = (url: string): string
```

#### QA Review (`/src/services/qaReview.ts`)
**Purpose:** AI-powered quality assurance review of podcast-prospect fit
**Edge Function:** `qa-review-podcasts`

```typescript
export interface QAPodcastInput {
  podcast_id: string
  podcast_name: string
  podcast_description?: string | null
  publisher_name?: string | null
  podcast_categories?: Array<{ category_name: string }> | null
  audience_size?: number | null
  episode_count?: number | null
}

export interface QAResult {
  podcast_id: string
  bio_fit_score: number | null
  topic_relevance_score: number | null
  bio_fit_reasoning: string | null
  topic_reasoning: string | null
  pitch_angles: Array<{ title: string; description: string }>
  topic_signals: string[]
}

export type ScoreTier = 'green' | 'yellow' | 'red' | 'unavailable'

export function getScoreTier(score: number | null): ScoreTier

export async function runQAReview(
  prospectBio: string,
  targetTopic: string,
  podcasts: QAPodcastInput[],
  onProgress?: (completed: number, total: number) => void
): Promise<QAResult[]>
```

**Architecture Notes:**
- Max 50 podcasts per QA review
- Processes in batches of 5 with 500ms delays
- Requires authenticated session

### 12. State Management

#### Cart Store (`/src/stores/cartStore.ts`)
**Purpose:** Zustand-based shopping cart with localStorage persistence

```typescript
export interface CartItem {
  id: string
  type: 'premium_podcast' | 'addon_service'
  // Premium podcast fields
  podcastId?: string
  podcastName?: string
  podcastImage?: string
  // Addon service fields
  bookingId?: string
  serviceId?: string
  serviceName?: string
  episodeName?: string
  clientId?: string
  // Common fields
  price: number
  priceDisplay: string
  quantity: number
}

interface CartStore {
  items: CartItem[]
  isOpen: boolean
  addItem: (podcast: PremiumPodcast) => void
  addAddonItem: (booking: Booking, service: AddonService, clientId: string) => void
  removeItem: (id: string) => void
  clearCart: () => void
  toggleCart: () => void
  openCart: () => void
  closeCart: () => void
  getTotalItems: () => number
  getTotalPrice: () => number
  getTotalPriceDisplay: () => string
  isInCart: (podcastId: string) => boolean
  isAddonInCart: (bookingId: string, serviceId: string) => boolean
}

export const parsePrice = (priceStr: string): number
export const formatPrice = (price: number): string
export const useCartStore = create<CartStore>()(persist(...))
```

**Persistence:** localStorage key `"podcast-cart"`, only persists `items` (not `isOpen` state).

### 13. Custom Hooks

#### `useToast` (`/src/hooks/use-toast.ts`)
**Purpose:** Global toast notification system with reducer-based state management

```typescript
function toast(props: Toast): { id: string; dismiss: () => void; update: (props: ToasterToast) => void }
function useToast(): { toasts: ToasterToast[]; toast: typeof toast; dismiss: (toastId?: string) => void }
```

- Limit: 1 toast visible at a time
- Uses external store pattern (listeners array) for cross-component updates

#### `useScrollAnimation` (`/src/hooks/useScrollAnimation.ts`)
**Purpose:** Intersection Observer hook for scroll-triggered animations

```typescript
export function useScrollAnimation<T extends HTMLElement>(threshold?: number): {
  ref: React.RefObject<T>
  isVisible: boolean
}
```

- Unobserves after first intersection (fires once)
- Default threshold: `0.1`

#### `useIsMobile` (`/src/hooks/use-mobile.tsx`)
**Purpose:** Responsive breakpoint detection

```typescript
export function useIsMobile(): boolean
```

- Breakpoint: `768px`
- Uses `window.matchMedia` with change listener

### 14. Sentry Integration (`/src/lib/sentry.ts`)
**Purpose:** Error tracking, performance monitoring, and session replay

**Environment Variables:**
- `VITE_SENTRY_DSN` - Sentry DSN (error tracking disabled if not set)
- `VITE_APP_VERSION` - Release version tag

**Configuration:**
- **Performance:** 100% trace sample rate
- **Session Replay:** 10% of normal sessions, 100% of sessions with errors
- **Privacy:** `maskAllText: true`, `blockAllMedia: true`
- **Filtering:** Ignores Stripe internal errors, network errors from ad blockers

**Exported Helpers:**
```typescript
export function initSentry(): void
export function captureException(error: Error, context?: Record<string, any>): void
export function captureMessage(message: string, level?: 'info' | 'warning' | 'error'): void
export function setUser(user: { id: string; email?: string; name?: string } | null): void
```

### 15. Protected Routes and Authorization

#### Route Protection Patterns
```typescript
// Admin Route Protection
export const useAuth = () => {
  const context = useContext(AuthContext)
  // Admin email validation
}

// Client Portal Protection
export const ClientProtectedRoute = ({ children }: ClientProtectedRouteProps) => {
  const { client, loading, isImpersonating } = useClientPortal()

  if (loading) return <LoadingSpinner />

  if (!client) {
    return <Navigate to="/portal/login" state={{ from: location }} replace />
  }

  return <>{children}</>
}
```

### 16. Error Handling Patterns

#### Service Layer Error Handling
```typescript
// Consistent error throwing
export async function getClientById(clientId: string) {
  const { data, error } = await supabase
    .from('clients')
    .select('*')
    .eq('id', clientId)
    .single()

  if (error) {
    throw new Error(`Failed to fetch client: ${error.message}`)
  }

  return data as Client
}
```

#### Component Error Handling
```typescript
// React Query error states
const { data, isLoading, error } = useQuery({
  queryKey: ['client', clientId],
  queryFn: () => getClientById(clientId),
  onError: (error) => {
    toast.error(`Failed to load client: ${error.message}`)
  }
})
```

## Environment Configuration

### Required Environment Variables
```env
# Supabase
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_ANON_KEY=eyJ...

# External APIs
VITE_PODSCAN_API_KEY=your-podscan-key
VITE_HEYGEN_API_KEY=your-heygen-key
VITE_ANTHROPIC_API_KEY=your-anthropic-key
VITE_STRIPE_PUBLISHABLE_KEY=pk_live_...

# Video Service
VITE_VIDEO_SERVICE_URL=https://your-video-service.com

# Monitoring
VITE_SENTRY_DSN=https://...@sentry.io/...
VITE_APP_VERSION=1.0.0

# Application
VITE_APP_URL=https://your-domain.com
```

## Development Guidelines

### 1. Adding New API Endpoints
1. Create service function in appropriate `/src/services/*.ts` file
2. Define TypeScript interfaces
3. Implement error handling
4. Add React Query hook if needed
5. Update this documentation

### 2. Service Function Pattern
```typescript
export async function serviceFunction(params: ParamsType): Promise<ReturnType> {
  const { data, error } = await supabase
    .from('table')
    .select('*')
    // ... query operations
  
  if (error) {
    throw new Error(`Operation failed: ${error.message}`)
  }
  
  return data as ReturnType
}
```

### 3. React Query Usage
```typescript
const { data, isLoading, error } = useQuery({
  queryKey: ['feature', ...dependencies],
  queryFn: () => serviceFunction(params),
  refetchInterval: 60000, // Optional polling
  staleTime: 5 * 60 * 1000, // 5 minutes
})
```

### 4. Edge Function Integration
```typescript
const { data, error } = await supabase.functions.invoke('function-name', {
  body: requestPayload
})

if (error) {
  throw new Error(error.message || 'Operation failed')
}

if (!data.success) {
  throw new Error(data.error || 'Operation failed')
}
```

## Security Considerations

### 1. Authentication
- Admin access controlled via `admin_users` table
- Client portal uses session tokens with expiration
- Admin impersonation mode for support

### 2. Authorization
- Row-level security policies in Supabase
- Client data access restricted by `client_id`
- Admin functions require admin session validation

### 3. Data Protection
- Sensitive operations use Edge Functions
- Session tokens stored in localStorage with expiration checks
- Admin emails cached with TTL to reduce database load

## Monitoring and Observability

### 1. Error Tracking (Sentry)
- `@sentry/react` integration initialized in `/src/lib/sentry.ts`
- Browser tracing for performance monitoring (100% sample rate)
- Session replay for debugging (10% normal sessions, 100% error sessions)
- User context set on login via `setUser()`
- `captureException()` helper for contextual error reporting
- Filters out known noisy errors (Stripe race conditions, ad-blocker network errors)
- Environment and release tracking via `VITE_SENTRY_DSN` and `VITE_APP_VERSION`

### 2. Performance Monitoring
- React Query for data fetching optimization
- Caching strategies to reduce API calls
- Pagination for large datasets

### 3. Cache Statistics
- Global podcast cache tracking
- API call savings estimation
- Source-based cache distribution

---

## Summary

The Authority Built frontend API layer provides a robust, type-safe interface to the Supabase backend with:

- **Dual authentication systems** for admin and client access
- **Comprehensive caching strategy** to optimize external API usage
- **Edge Functions** for secure server-side operations
- **React Query integration** for efficient data fetching
- **TypeScript interfaces** for type safety
- **Consistent error handling** throughout the application
- **External API integrations** -- Podscan, HeyGen, Anthropic Claude, Stripe, Google Calendar, Google Indexing
- **AI-powered features** -- podcast categorization, query generation, compatibility scoring, QA review, podcast summaries
- **E-commerce layer** -- Stripe checkout, cart store (Zustand), customer/order management, addon services
- **Sentry observability** -- error tracking, session replay, performance monitoring
- **20+ service modules** covering blog, testimonials, sales calls, guest resources, outreach, and more

The architecture supports both direct database operations and server-side functions, providing flexibility for different use cases while maintaining security and performance.