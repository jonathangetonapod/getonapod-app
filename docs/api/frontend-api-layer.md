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

**Usage:**
```typescript
export async function searchPodcasts(options: SearchOptions): Promise<PodcastSearchResponse> {
  const params = new URLSearchParams()
  Object.entries(options).forEach(([key, value]) => {
    if (value !== undefined) {
      params.append(key, String(value))
    }
  })

  const response = await fetch(`${PODSCAN_API_BASE}/podcasts/search?${params}`, {
    headers: {
      'Authorization': `Bearer ${API_KEY}`,
    },
  })

  return response.json()
}
```

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

**Cache Lookup Function:**
```typescript
export async function findCachedPodcastMetadata(
  podcastId: string
): Promise<UniversalPodcastCache | null>
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

### 11. Protected Routes and Authorization

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

### 12. Error Handling Patterns

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

### 1. Error Tracking
- Sentry integration for error reporting
- User context setting in authentication flows

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
- **External API integrations** with proper authentication

The architecture supports both direct database operations and server-side functions, providing flexibility for different use cases while maintaining security and performance.