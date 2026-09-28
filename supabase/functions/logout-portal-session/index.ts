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

    const { error } = await admin.rpc('logout_client_portal_session', {
      p_session_token_hash: sessionTokenHash,
    })

    if (error) {
      console.error('Portal session invalidation failed')
      throw new HttpError(503, 'LOGOUT_FAILED', 'The portal session could not be invalidated')
    }

    // Logout is idempotent: an already-invalid token is still a successful
    // outcome, while database failures return a non-success status above.
    return jsonResponse(req, METHODS, 200, { success: true })
  } catch (error) {
    return errorResponse(req, METHODS, error)
  }
})
