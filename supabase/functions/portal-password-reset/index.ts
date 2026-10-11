import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'

import {
  createAdminClient,
  errorResponse,
  HttpError,
  jsonResponse,
  optionsResponse,
  parseJsonObject,
  requireOnlyKeys,
  requireString,
} from '../_shared/workspaceAuth.ts'
import { ensureWorkspaceOriginAllowed } from '../_shared/cors.ts'
import {
  hashPortalPassword,
  hashPortalSessionToken,
  isAcceptableNewPortalPassword,
  MIN_PORTAL_PASSWORD_LENGTH,
} from '../_shared/portalSecurity.ts'
import { safeWorkspaceBranding } from '../_shared/portalBranding.ts'
import { portalResetUrl, sendPortalResetEmail } from '../_shared/portalResetEmail.ts'
import { workspaceLinkOrigin } from '../_shared/workspaceOrigin.ts'

const METHODS = ['POST'] as const
const RESET_TOKEN_TTL_MINUTES = 60

function requestNetworkContext(req: Request): { ip: string; userAgent: string } {
  const forwardedFor = req.headers.get('x-forwarded-for')?.split(',').at(-1)
  const ip = (req.headers.get('cf-connecting-ip')
    || req.headers.get('x-real-ip')
    || forwardedFor
    || 'unknown').trim().slice(0, 120)
  const userAgent = (req.headers.get('user-agent') || 'unknown').slice(0, 1024)
  return { ip, userAgent }
}

function normalizedEmail(value: unknown): string {
  const email = requireString(value, 'email', { max: 254 }).toLowerCase().trim()
  if (email.length < 3 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/u.test(email)) {
    throw new HttpError(400, 'INVALID_EMAIL', 'A valid email address is required')
  }
  return email
}

// New passwords chosen through self-serve reset need 12 characters. Existing
// credentials (including older 8-character ones) keep working at login; only
// the password being set here is held to the higher floor, the same one every
// other portal password setter uses (portalSecurity.ts).
const MIN_RESET_PASSWORD_LENGTH = MIN_PORTAL_PASSWORD_LENGTH

function requirePortalPassword(value: unknown): string {
  if (
    typeof value !== 'string'
    || value.length < MIN_RESET_PASSWORD_LENGTH
    || !isAcceptableNewPortalPassword(value)
  ) {
    throw new HttpError(400, 'INVALID_PASSWORD', 'Password must be between 12 and 256 characters')
  }
  return value
}

type AdminClient = ReturnType<typeof createAdminClient>

// Fallback floor for the request action when the runtime cannot finish work
// after responding: comfortably above a lookup, a token write and a provider
// call (which itself times out at 10 seconds in portalResetEmail.ts).
const RESET_REQUEST_RESPONSE_FLOOR_MS = 1_500

/** Hands `work` to the edge runtime to finish after the response. */
function runInBackground(work: Promise<unknown>): boolean {
  const runtime = (globalThis as { EdgeRuntime?: { waitUntil?: (promise: Promise<unknown>) => void } }).EdgeRuntime
  if (typeof runtime?.waitUntil !== 'function') return false
  runtime.waitUntil(work)
  return true
}

async function padToFloor(startedAt: number, floorMs: number): Promise<void> {
  const remaining = floorMs - (Date.now() - startedAt)
  if (remaining > 0) await new Promise((resolve) => setTimeout(resolve, remaining))
}

/**
 * The part of a reset request that depends on whether the email matched.
 * Only a matching, active account reserves against the per-email quota
 * (reserve_client_portal_reset_email_v1), so requests for addresses with no
 * account neither fill a real client's quota nor store the address typed.
 */
async function issueResetForEmail(admin: AdminClient, email: string, ip: string): Promise<void> {
  const { data: client, error: clientError } = await admin
    .from('clients')
    .select('id, name, email, portal_access_enabled, workspace:workspaces!clients_workspace_id_fkey(id, name, status, logo_path, logo_updated_at)')
    .eq('portal_email_normalized', email)
    .eq('portal_access_enabled', true)
    .maybeSingle()

  const workspace = client?.workspace as { id?: string; name?: string; status?: string } | null
  if (clientError || !client || workspace?.status !== 'active') return

  const { data: emailReserved, error: emailReserveError } = await admin.rpc('reserve_client_portal_reset_email_v1', {
    p_client_id: client.id,
    p_email_normalized: email,
    p_ip_address: ip,
  })
  if (emailReserveError || !emailReserved) {
    if (emailReserveError) console.error('[Portal Password Reset] Email quota reservation failed')
    return
  }

  const token = crypto.randomUUID()
  const tokenHash = await hashPortalSessionToken(token)
  const expiresAt = new Date(Date.now() + RESET_TOKEN_TTL_MINUTES * 60 * 1000).toISOString()

  // A new request adds a token; it never replaces one. Overwriting let an
  // anonymous caller who knew a client's email silently invalidate the
  // link the client was about to use. Pending tokens stay valid until
  // they expire or one is redeemed (redemption burns every token for
  // the client), and the per-email reservation above bounds how many
  // can be live at once.
  const { error: expiredCleanupError } = await admin
    .from('client_portal_reset_tokens')
    .delete()
    .eq('client_id', client.id)
    .lte('expires_at', new Date().toISOString())
  if (expiredCleanupError) {
    console.error('[Portal Password Reset] Expired token cleanup failed')
  }

  const { error: insertError } = await admin
    .from('client_portal_reset_tokens')
    .insert({
      client_id: client.id,
      token_hash: tokenHash,
      expires_at: expiresAt,
      requested_ip: ip,
    })
  if (insertError) {
    console.error('[Portal Password Reset] Token storage failed')
    return
  }

  const branding = await safeWorkspaceBranding(admin, workspace ?? {})
  const linkOrigin = await workspaceLinkOrigin(admin, workspace?.id ?? null)
  const delivery = await sendPortalResetEmail({
    workspaceName: branding?.name || workspace?.name || 'Your agency',
    recipientName: client.name || 'there',
    recipientEmail: email,
    url: portalResetUrl(token, linkOrigin),
  })
  if (delivery.status !== 'sent') {
    console.error('[Portal Password Reset] Delivery status:', delivery.status)
  }
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    // Portal pages are served from tenant custom domains too, and the
    // preflight is the first request that origin ever makes, so it has to
    // warm the allowlist itself or the domain never works.
    await ensureWorkspaceOriginAllowed(createAdminClient(), req)
    return optionsResponse(req, METHODS)
  }

  const startedAt = Date.now()
  try {
    if (req.method !== 'POST') {
      throw new HttpError(405, 'METHOD_NOT_ALLOWED', 'Only POST is allowed')
    }

    const body = await parseJsonObject(req, 2_048)
    const action = typeof body.action === 'string' ? body.action : ''
    const admin = createAdminClient()
    await ensureWorkspaceOriginAllowed(admin, req)
    const { ip, userAgent } = requestNetworkContext(req)

    if (action === 'request') {
      requireOnlyKeys(body, ['action', 'email'])
      const email = normalizedEmail(body.email)

      // The per-address limit runs before anything depends on the email, so
      // it answers the same way whether or not the address has an account.
      const { data: reserved, error: reserveError } = await admin.rpc('reserve_client_portal_reset_ip_v1', {
        p_ip_address: ip,
        p_user_agent: userAgent,
      })
      if (reserveError) {
        throw new HttpError(503, 'RESET_UNAVAILABLE', 'Password reset is temporarily unavailable')
      }
      if (!reserved) {
        throw new HttpError(429, 'RESET_RATE_LIMITED', 'Too many reset requests. Try again later.')
      }

      // Everything that depends on whether the email matched (the account
      // lookup, the per-email quota, the token write, the email send) runs
      // after the response, so a match and a miss take the same time to
      // answer. Without a background runtime the response waits exactly the
      // fixed floor and the work is left running on the event loop, never
      // awaited: awaiting it first meant a slow provider call on a match
      // pushed the response past the floor, and that difference is the very
      // signal the floor exists to hide.
      const work = issueResetForEmail(admin, email, ip).catch(() => {
        console.error('[Portal Password Reset] Background reset failed')
      })
      if (!runInBackground(work)) {
        await padToFloor(startedAt, RESET_REQUEST_RESPONSE_FLOOR_MS)
      }

      // Identical response whether or not the email matched a portal account.
      return jsonResponse(req, METHODS, 200, { success: true })
    }

    if (action === 'complete') {
      requireOnlyKeys(body, ['action', 'token', 'password'])
      const token = requireString(body.token, 'token', { max: 100 })
      const password = requirePortalPassword(body.password)

      const tokenHash = await hashPortalSessionToken(token)
      const passwordHash = await hashPortalPassword(password)

      const { data: completed, error: completeError } = await admin.rpc('complete_client_portal_password_reset_v1', {
        p_token_hash: tokenHash,
        p_password_hash: passwordHash,
        p_ip_address: ip,
      })
      if (completeError) {
        throw new HttpError(503, 'RESET_UNAVAILABLE', 'Password reset is temporarily unavailable')
      }
      if (!completed) {
        throw new HttpError(400, 'RESET_INVALID', 'This reset link is invalid or has expired. Request a new one.')
      }

      return jsonResponse(req, METHODS, 200, { success: true })
    }

    throw new HttpError(400, 'INVALID_ACTION', 'Unknown portal password reset action')
  } catch (error) {
    return errorResponse(req, METHODS, error)
  }
})
