import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'

import { hashPortalSessionToken } from '../_shared/portalSecurity.ts'
import {
  createAdminClient,
  errorResponse,
  HttpError,
  jsonResponse,
  optionsResponse,
  parseJsonObject,
  requireOnlyKeys,
  requireUuid,
} from '../_shared/workspaceAuth.ts'
import { ensureWorkspaceOriginAllowed } from '../_shared/cors.ts'
import { safeWorkspaceBranding } from '../_shared/portalBranding.ts'

const METHODS = ['POST'] as const

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    // Portal pages are served from tenant custom domains too, and the
    // preflight is the first request that origin ever makes, so it has to
    // warm the allowlist itself or the domain never works.
    await ensureWorkspaceOriginAllowed(createAdminClient(), req)
    return optionsResponse(req, METHODS)
  }

  try {
    if (req.method !== 'POST') {
      throw new HttpError(405, 'METHOD_NOT_ALLOWED', 'Only POST is allowed')
    }

    const body = await parseJsonObject(req, 1_024)
    requireOnlyKeys(body, ['sessionToken'])
    const sessionToken = requireUuid(body.sessionToken, 'sessionToken')
    const sessionTokenHash = await hashPortalSessionToken(sessionToken)
    const admin = createAdminClient()
    await ensureWorkspaceOriginAllowed(admin, req)

    const { data: session, error: sessionError } = await admin
      .from('client_portal_sessions')
      .select('id,client_id,clients(id,name,email,photo_url,portal_access_enabled,dashboard_slug,workspace:workspaces!clients_workspace_id_fkey(id,name,status,logo_path,logo_updated_at))')
      .eq('session_token', sessionTokenHash)
      .gt('expires_at', new Date().toISOString())
      .maybeSingle()

    if (sessionError) {
      throw new HttpError(503, 'SESSION_LOOKUP_FAILED', 'Session validation is temporarily unavailable')
    }

    const client = session?.clients as {
      id?: string
      name?: string
      email?: string | null
      photo_url?: string | null
      portal_access_enabled?: boolean
      dashboard_slug?: string | null
      workspace?: {
        id?: string
        name?: string
        status?: string
        logo_path?: string | null
        logo_updated_at?: string | null
      } | null
    } | null

    if (
      !session
      || !client?.id
      || !client.name
      || !client.portal_access_enabled
      || client.workspace?.status !== 'active'
    ) {
      throw new HttpError(401, 'INVALID_PORTAL_SESSION', 'Your portal session has ended. Sign in again to continue')
    }

    const { error: activityError } = await admin
      .from('client_portal_sessions')
      .update({ last_active_at: new Date().toISOString() })
      .eq('id', session.id)

    if (activityError) {
      throw new HttpError(503, 'SESSION_UPDATE_FAILED', 'Session validation is temporarily unavailable')
    }

    const branding = client.workspace
      ? await safeWorkspaceBranding(admin, client.workspace)
      : null

    return jsonResponse(req, METHODS, 200, {
      success: true,
      client: {
        id: client.id,
        name: client.name,
        email: client.email ?? null,
        photo_url: client.photo_url ?? null,
        dashboard_slug: client.dashboard_slug ?? null,
      },
      branding,
    })
  } catch (error) {
    return errorResponse(req, METHODS, error)
  }
})
