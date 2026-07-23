import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'

import { hashPortalPassword } from '../_shared/portalSecurity.ts'
import {
  errorResponse,
  HttpError,
  jsonResponse,
  optionsResponse,
  parseJsonObject,
  requireAuthenticatedUser,
  requireOnlyKeys,
  requirePlatformAdmin,
  requireString,
  requireUuid,
  requireWorkspaceFeatureAccess,
  workspaceCredentialIsFresh,
} from '../_shared/workspaceAuth.ts'

const METHODS = ['POST'] as const
const PASSWORD_MANAGER_ROLES = new Set(['owner', 'platform_admin'])

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

function actorLabel(user: {
  email?: string
  user_metadata?: Record<string, unknown>
}): string {
  const fullName = user.user_metadata?.full_name
  if (typeof fullName === 'string' && fullName.trim() && fullName.trim().length <= 120) {
    return fullName.trim()
  }
  const email = user.email?.trim().toLowerCase()
  return email && email.length <= 120 ? email : 'Workspace owner'
}

function passwordMutationError(
  error: { message?: string } | null,
  action: 'set' | 'clear',
): never {
  const message = error?.message?.toLowerCase() ?? ''
  if (message.includes('not found')) {
    throw new HttpError(404, 'CLIENT_NOT_FOUND', 'Workspace client not found')
  }
  if (message.includes('owner access') || message.includes('actor role hierarchy')) {
    throw new HttpError(403, 'WORKSPACE_OWNER_REQUIRED', 'Workspace owner access is required')
  }
  throw new HttpError(
    500,
    action === 'set' ? 'PASSWORD_SET_FAILED' : 'PASSWORD_CLEAR_FAILED',
    action === 'set'
      ? 'Portal password could not be set'
      : 'Portal password could not be cleared',
  )
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return optionsResponse(req, METHODS)

  try {
    if (req.method !== 'POST') {
      throw new HttpError(405, 'METHOD_NOT_ALLOWED', 'Only POST is allowed')
    }

    const body = await parseJsonObject(req)
    const action = body.action
    const clientId = requireUuid(body.client_id, 'client_id')
    const tenantScoped = Object.hasOwn(body, 'workspace_id')

    if (tenantScoped) {
      const workspaceId = requireUuid(body.workspace_id, 'workspace_id')
      const authContext = await requireAuthenticatedUser(req)
      if (!workspaceCredentialIsFresh(authContext)) {
        throw new HttpError(401, 'REAUTHENTICATION_REQUIRED', 'Sign in again with the newest account credentials')
      }
      const access = await requireWorkspaceFeatureAccess(authContext, workspaceId)
      if (!PASSWORD_MANAGER_ROLES.has(access.role)) {
        throw new HttpError(403, 'WORKSPACE_OWNER_REQUIRED', 'Workspace owner access is required')
      }
      const { admin, tokenIssuedAt, user } = authContext

      if (action === 'set') {
        requireOnlyKeys(body, ['action', 'workspace_id', 'client_id', 'password'])
        const passwordHash = await hashPortalPassword(requirePassword(body.password))
        const { error } = await admin.rpc('manage_client_portal_password', {
          p_client_id: clientId,
          p_workspace_id: workspaceId,
          p_password_hash: passwordHash,
          p_set_by: actorLabel(user),
          p_actor_user_id: user.id,
          p_token_issued_at: tokenIssuedAt,
        })
        if (error) passwordMutationError(error, 'set')
        return jsonResponse(req, METHODS, 200, { success: true, configured: true })
      }

      if (action === 'clear') {
        requireOnlyKeys(body, ['action', 'workspace_id', 'client_id'])
        const { error } = await admin.rpc('manage_client_portal_password', {
          p_client_id: clientId,
          p_workspace_id: workspaceId,
          p_password_hash: null,
          p_set_by: null,
          p_actor_user_id: user.id,
          p_token_issued_at: tokenIssuedAt,
        })
        if (error) passwordMutationError(error, 'clear')
        return jsonResponse(req, METHODS, 200, { success: true, configured: false })
      }

      throw new HttpError(400, 'INVALID_ACTION', 'Unknown portal password action')
    }

    // Compatibility path for the legacy platform-only client screen. Tenant
    // callers must always supply workspace_id and pass the owner-scoped RPC.
    const { admin, user } = await requirePlatformAdmin(req)
    if (action === 'set') {
      requireOnlyKeys(body, ['action', 'client_id', 'password', 'set_by'])
      const passwordHash = await hashPortalPassword(requirePassword(body.password))
      const setBy = requireString(body.set_by ?? 'Admin', 'set_by', { max: 120 })
      const { error } = await admin.rpc('manage_client_portal_password', {
        p_client_id: clientId,
        p_password_hash: passwordHash,
        p_set_by: setBy,
        p_actor_user_id: user.id,
      })
      if (error) passwordMutationError(error, 'set')
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
      if (error) passwordMutationError(error, 'clear')
      return jsonResponse(req, METHODS, 200, { success: true, configured: false })
    }

    throw new HttpError(400, 'INVALID_ACTION', 'Unknown portal password action')
  } catch (error) {
    return errorResponse(req, METHODS, error)
  }
})
