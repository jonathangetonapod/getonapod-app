import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'

import { hashPortalPassword } from '../_shared/portalSecurity.ts'
import {
  errorResponse,
  HttpError,
  jsonResponse,
  optionsResponse,
  parseJsonObject,
  requireOnlyKeys,
  requirePlatformAdmin,
  requireString,
  requireUuid,
} from '../_shared/workspaceAuth.ts'

const METHODS = ['POST'] as const

function requirePassword(value: unknown): string {
  if (
    typeof value !== 'string'
    || value.length < 8
    || value.length > 256
    || value.trim().length === 0
  ) {
    throw new HttpError(400, 'INVALID_PASSWORD', 'password must be between 8 and 256 characters')
  }
  // Passwords are opaque credentials. Preserve intentional leading/trailing
  // spaces instead of applying the trimming used for ordinary text fields.
  return value
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return optionsResponse(req, METHODS)

  try {
    if (req.method !== 'POST') {
      throw new HttpError(405, 'METHOD_NOT_ALLOWED', 'Only POST is allowed')
    }

    const { admin, user } = await requirePlatformAdmin(req)
    const body = await parseJsonObject(req)
    const action = body.action
    const clientId = requireUuid(body.client_id, 'client_id')

    if (action === 'set') {
      requireOnlyKeys(body, ['action', 'client_id', 'password', 'set_by'])
      const password = requirePassword(body.password)
      const setBy = requireString(body.set_by ?? 'Admin', 'set_by', { max: 120 })
      const passwordHash = await hashPortalPassword(password)

      const { error } = await admin.rpc('manage_client_portal_password', {
        p_client_id: clientId,
        p_password_hash: passwordHash,
        p_set_by: setBy,
        p_actor_user_id: user.id,
      })

      if (error?.message.toLowerCase().includes('not found')) {
        throw new HttpError(404, 'CLIENT_NOT_FOUND', 'Client not found')
      }
      if (error) throw new HttpError(500, 'PASSWORD_SET_FAILED', 'Portal password could not be set')
      return jsonResponse(req, METHODS, 200, { success: true, configured: true })
    }

    if (action === 'clear') {
      requireOnlyKeys(body, ['action', 'client_id'])
      const { error } = await admin.rpc('manage_client_portal_password', {
        p_client_id: clientId,
        p_password_hash: null,
        p_set_by: null,
        p_actor_user_id: user.id,
      })

      if (error?.message.toLowerCase().includes('not found')) {
        throw new HttpError(404, 'CLIENT_NOT_FOUND', 'Client not found')
      }
      if (error) throw new HttpError(500, 'PASSWORD_CLEAR_FAILED', 'Portal password could not be cleared')
      return jsonResponse(req, METHODS, 200, { success: true, configured: false })
    }

    throw new HttpError(400, 'INVALID_ACTION', 'Unknown portal password action')
  } catch (error) {
    return errorResponse(req, METHODS, error)
  }
})
