import { supabase } from '@/lib/supabase'
import { toFunctionError } from '@/lib/functionErrors'
import { createPortalSessionStore } from '@/lib/portalSessionStore'
import type { Client } from './clients'
import type { Booking } from './bookings'

export { isPortalAuthError } from '@/lib/portalAuthError'

export interface ClientPortalSession {
  session_token: string
  expires_at: string
  client_id: string
}

export interface PortalBranding {
  name: string
  logo_url: string | null
  primary_color: string
  accent_color: string
}

export interface ClientPortalAuthResponse {
  session: ClientPortalSession
  client: Client
  branding: PortalBranding | null
}

export interface ClientPortalValidation {
  client: Client
  branding: PortalBranding | null
}

function parsePortalBranding(value: unknown): PortalBranding | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null
  const record = value as Record<string, unknown>
  if (typeof record.name !== 'string' || !record.name.trim()) return null
  return {
    name: record.name.trim(),
    logo_url: typeof record.logo_url === 'string' ? record.logo_url : null,
    primary_color: typeof record.primary_color === 'string' ? record.primary_color : '#0D1B2A',
    accent_color: typeof record.accent_color === 'string' ? record.accent_color : '#C7794F',
  }
}

/**
 * Login with email and password
 */
export async function loginWithPassword(email: string, password: string): Promise<ClientPortalAuthResponse> {
  const { data, error } = await supabase.functions.invoke('login-with-password', {
    body: { email, password }
  })

  if (error) {
    console.error('Failed to login with password:', error)
    throw await toFunctionError(error, 'Login failed.')
  }

  // A 2xx with an error body, or no usable body at all, is still a failed
  // sign-in; reading fields off a missing body would crash instead.
  if (!data || typeof data !== 'object') throw new Error('Login failed.')
  if (data.error) {
    throw new Error(typeof data.error === 'string' ? data.error : 'Login failed.')
  }
  if (typeof data.session_token !== 'string' || !data.client || typeof data.client.id !== 'string') {
    throw new Error('Login failed.')
  }

  return {
    session: {
      session_token: data.session_token,
      expires_at: data.expires_at,
      client_id: data.client.id
    },
    client: data.client,
    branding: parsePortalBranding(data.branding)
  }
}

/**
 * Validate an existing session and return client data
 */
export async function validateSession(sessionToken: string): Promise<ClientPortalValidation> {
  const { data, error } = await supabase.functions.invoke('validate-portal-session', {
    body: { sessionToken }
  })

  if (error) {
    console.error('Failed to validate session:', error)
    throw await toFunctionError(error, 'Your portal session has ended. Sign in again to continue.')
  }

  if (!data?.success || !data.client) {
    throw new Error(
      typeof data?.error === 'string' && data.error
        ? data.error
        : 'Your portal session has ended. Sign in again to continue',
    )
  }

  return { client: data.client, branding: parsePortalBranding(data.branding) }
}

/**
 * Request a self-serve password reset email. Always resolves on success
 * responses regardless of whether the email matched an account.
 */
export async function requestPortalPasswordReset(email: string): Promise<void> {
  const { data, error } = await supabase.functions.invoke('portal-password-reset', {
    body: { action: 'request', email }
  })
  if (error) throw await toFunctionError(error, 'The reset request could not be sent.')
  if (!data?.success) throw new Error('The reset request could not be sent.')
}

/**
 * Redeem a reset token with a new password.
 */
export async function completePortalPasswordReset(token: string, password: string): Promise<void> {
  const { data, error } = await supabase.functions.invoke('portal-password-reset', {
    body: { action: 'complete', token, password }
  })
  if (error) throw await toFunctionError(error, 'This reset link is invalid or has expired.')
  if (!data?.success) throw new Error('This reset link is invalid or has expired.')
}

/**
 * Logout and invalidate the session
 */
export async function logout(sessionToken: string): Promise<void> {
  const { error } = await supabase.functions.invoke('logout-portal-session', {
    body: { sessionToken }
  })
  if (error) throw await toFunctionError(error, 'Failed to invalidate the portal session.')

  // The portal store below, not window.sessionStorage: it removes only the
  // portal session keys (memory, tab and legacy storage), so the agency brand
  // remembered for the tab (portalBrandMemory) survives signing out.
  portalSessionStore.clear()
}

export interface ClientPortalData {
  bookings: Array<Pick<
    Booking,
    | 'id'
    | 'podcast_name'
    | 'podcast_url'
    | 'host_name'
    | 'scheduled_date'
    | 'recording_date'
    | 'publish_date'
    | 'status'
    | 'episode_url'
  >>
}

/**
 * Get all bookings and outreach messages for the authenticated client via Edge Function
 */
export async function getClientBookings(clientId: string): Promise<ClientPortalData> {
  // Get session token if exists
  const { session } = portalSessionStore.get()

  if (session && session.client_id !== clientId) {
    throw new Error('Portal session does not match the requested client.')
  }

  // Build request body - only include sessionToken if it exists
  const requestBody: { clientId: string; sessionToken?: string } = {
    clientId
  }

  if (session?.session_token) {
    requestBody.sessionToken = session.session_token
  }

  const { data, error } = await supabase.functions.invoke('get-client-bookings', {
    body: requestBody
  })

  if (error) throw await toFunctionError(error, 'Your bookings could not be loaded.')

  // A 2xx with an error body, or no body at all, is still a failed load.
  if (!data || typeof data !== 'object') throw new Error('Your bookings could not be loaded.')
  if (data.error) throw new Error(typeof data.error === 'string' ? data.error : 'Your bookings could not be loaded.')

  return {
    bookings: Array.isArray(data.bookings) ? data.bookings : [],
  }
}

export interface PortalExperienceBooking {
  id: string
  podcast_name: string
  podcast_url: string | null
  host_name: string | null
  scheduled_date: string | null
  recording_date: string | null
  publish_date: string | null
  status: string
  episode_url: string | null
  podcast_image_url: string | null
  podcast_description: string | null
  audience_size: number | null
  itunes_rating: number | null
  episode_count: number | null
  created_by_client?: boolean
}

export interface PortalOutreachTarget {
  id: string
  podcast_name: string
  podcast_image_url: string | null
  stage: 'preparing' | 'contacted' | 'replied' | 'completed'
  first_message_at: string | null
  last_activity_at: string | null
  opens: number
  replies: number
}

export interface PortalExperienceOverview {
  profile: {
    name: string
    photo_url: string | null
    bio: string | null
    media_kit_url: string | null
    calendar_link: string | null
    dashboard_tagline: string | null
    notifications_enabled?: boolean
  }
  review: {
    dashboard_slug: string | null
    total_visible: number
    awaiting_count: number
    approved_count: number
    rejected_count: number
  }
  outreach: {
    emails_sent: number
    podcasts_contacted: number
    replies: number
    meetings_booked: number
    in_outreach_count: number
    replied_count: number
    completed_count: number
  } | null
  outreach_targets?: PortalOutreachTarget[]
  pitch_profile: {
    professional_bio: string | null
    positioning_summary: string | null
    key_messages: string[]
    story_angles: string[]
    talking_points: string[]
    ideal_audience: string | null
  } | null
  bookings: PortalExperienceBooking[]
}

/**
 * Load the aggregated portal overview (profile, review queue, outreach
 * journey, approved guest profile, and placements) in one round trip.
 */
export async function getPortalExperience(clientId: string): Promise<PortalExperienceOverview> {
  const { session } = portalSessionStore.get()

  if (session && session.client_id !== clientId) {
    throw new Error('Portal session does not match the requested client.')
  }

  const requestBody: { clientId: string; sessionToken?: string } = { clientId }
  if (session?.session_token) {
    requestBody.sessionToken = session.session_token
  }

  const { data, error } = await supabase.functions.invoke('portal-experience', {
    body: requestBody,
  })
  if (error) throw await toFunctionError(error, 'Your portal overview could not be loaded.')

  // A 2xx with an error body, or no body at all, is still a failed load.
  if (!data || typeof data !== 'object') throw new Error('Your portal overview could not be loaded.')
  if (data.error) {
    throw new Error(typeof data.error === 'string' ? data.error : 'Your portal overview could not be loaded.')
  }
  if (!data.profile || !data.review) throw new Error('Your portal overview could not be loaded.')

  return {
    ...data,
    bookings: Array.isArray(data.bookings) ? data.bookings : [],
  } as PortalExperienceOverview
}

export interface PortalCalendarEventInput {
  podcast_name: string
  kind: 'recording' | 'release'
  date: string
  host_name?: string | null
  podcast_url?: string | null
  episode_url?: string | null
  notes?: string | null
}

function portalRequestBody(clientId: string, extra: Record<string, unknown>): Record<string, unknown> {
  const { session } = portalSessionStore.get()
  if (session && session.client_id !== clientId) {
    throw new Error('Portal session does not match the requested client.')
  }
  return {
    clientId,
    ...(session?.session_token ? { sessionToken: session.session_token } : {}),
    ...extra,
  }
}

/** Add a recording or episode-release date the client arranged themselves. */
export async function addPortalCalendarEvent(
  clientId: string,
  event: PortalCalendarEventInput,
): Promise<PortalExperienceBooking> {
  const { data, error } = await supabase.functions.invoke('portal-experience', {
    body: portalRequestBody(clientId, { calendar_event: event }),
  })
  if (error) throw await toFunctionError(error, 'That event could not be added — try again.')
  if (!data?.booking) throw new Error('That event could not be added — try again.')
  return data.booking as PortalExperienceBooking
}

/** Remove an event the client added. Team-created placements are untouched. */
export async function removePortalCalendarEvent(clientId: string, eventId: string): Promise<void> {
  const { data, error } = await supabase.functions.invoke('portal-experience', {
    body: portalRequestBody(clientId, { delete_event_id: eventId }),
  })
  if (error) throw await toFunctionError(error, 'That event could not be removed — try again.')
  if (!data?.success) throw new Error('That event could not be removed — try again.')
}

/** Turn milestone emails on or off for this client. */
export async function setPortalNotifications(clientId: string, enabled: boolean): Promise<boolean> {
  const { data, error } = await supabase.functions.invoke('portal-experience', {
    body: portalRequestBody(clientId, { notifications_enabled: enabled }),
  })
  if (error) throw await toFunctionError(error, 'That setting could not be saved — try again.')
  if (!data?.success) throw new Error('That setting could not be saved — try again.')
  return data.notifications_enabled !== false
}

/**
 * Enable or disable portal access for a client (Admin use only)
 */
export async function updatePortalAccess(clientId: string, enabled: boolean): Promise<void> {
  const { data, error } = await supabase
    .from('clients')
    .update({ portal_access_enabled: enabled })
    .eq('id', clientId)
    .select('id')

  if (error) {
    throw new Error(`Failed to update portal access: ${error.message}`)
  }
  // Row-level security answers a write it refuses with zero rows, not an
  // error, so a client in another workspace looked updated when it was not.
  if (!data || data.length === 0) {
    throw new Error('This client belongs to another workspace and cannot be changed here')
  }
}

const portalSessionStore = {
  ...createPortalSessionStore<ClientPortalSession, Client>(),
  isExpired: (session: ClientPortalSession): boolean => {
    const expiresAt = new Date(session.expires_at)
    const now = new Date()
    return now >= expiresAt
  }
}

/**
 * Kept under its historical name for existing importers. It shadows
 * window.sessionStorage inside this module, so code here uses
 * portalSessionStore to make clear which store it touches.
 */
export const sessionStorage = portalSessionStore
