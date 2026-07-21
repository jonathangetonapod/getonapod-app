import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'

import {
  errorResponse,
  HttpError,
  jsonResponse,
  optionsResponse,
  optionalString,
  parseJsonObject,
  requireEmail,
  requireOnlyKeys,
  requireString,
  requireUuid,
  requireAuthenticatedUser,
} from '../_shared/workspaceAuth.ts'

const METHODS = ['POST'] as const
const CLIENT_FIELDS = [
  'name',
  'email',
  'contact_person',
  'linkedin_url',
  'website',
  'status',
  'notes',
] as const

function optionalUrl(value: unknown, field: string): string | null {
  const result = optionalString(value, field, 2048)
  if (!result) return null

  let parsed: URL
  try {
    parsed = new URL(result)
  } catch {
    throw new HttpError(400, 'INVALID_FIELD', `${field} must be a valid URL`)
  }
  if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') {
    throw new HttpError(400, 'INVALID_FIELD', `${field} must be an HTTP or HTTPS URL`)
  }
  return parsed.toString()
}

function clientPayload(value: unknown): Record<string, string | null> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new HttpError(400, 'INVALID_CLIENT', 'client must be an object')
  }
  const input = value as Record<string, unknown>
  requireOnlyKeys(input, CLIENT_FIELDS)

  const status = requireString(input.status, 'status', { max: 20 })
  if (!['active', 'paused', 'churned'].includes(status)) {
    throw new HttpError(400, 'INVALID_FIELD', 'status is invalid')
  }

  const rawEmail = optionalString(input.email, 'email', 254)
  return {
    name: requireString(input.name, 'name', { max: 200 }),
    email: rawEmail ? requireEmail(rawEmail) : null,
    contact_person: optionalString(input.contact_person, 'contact_person', 200),
    linkedin_url: optionalUrl(input.linkedin_url, 'linkedin_url'),
    website: optionalUrl(input.website, 'website'),
    status,
    notes: optionalString(input.notes, 'notes', 10000),
  }
}

function rpcError(error: { message?: string }): never {
  const message = (error.message ?? '').toLowerCase()
  if (message.includes('active workspace manager')) {
    throw new HttpError(403, 'WORKSPACE_ACCESS_REQUIRED', 'Active workspace access is required')
  }
  if (message.includes('not found')) {
    throw new HttpError(404, 'CLIENT_NOT_FOUND', 'Workspace client not found')
  }
  if (message.includes('invalid')) {
    throw new HttpError(400, 'INVALID_REQUEST', 'Workspace client request is invalid')
  }
  throw new HttpError(500, 'CLIENT_OPERATION_FAILED', 'The workspace client operation failed')
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return optionsResponse(req, METHODS)

  try {
    if (req.method !== 'POST') {
      throw new HttpError(405, 'METHOD_NOT_ALLOWED', 'Only POST is allowed')
    }

    const body = await parseJsonObject(req)
    const action = typeof body.action === 'string' ? body.action : ''
    const { admin, user } = await requireAuthenticatedUser(req)
    const workspaceId = requireUuid(body.workspace_id, 'workspace_id')
    let clientId: string | null = null
    let payload: Record<string, string | null> = {}

    if (action === 'list') {
      requireOnlyKeys(body, ['action', 'workspace_id'])
    } else if (action === 'create') {
      requireOnlyKeys(body, ['action', 'workspace_id', 'client'])
      payload = clientPayload(body.client)
    } else if (action === 'update') {
      requireOnlyKeys(body, ['action', 'workspace_id', 'client_id', 'client'])
      clientId = requireUuid(body.client_id, 'client_id')
      payload = clientPayload(body.client)
    } else if (action === 'delete') {
      requireOnlyKeys(body, ['action', 'workspace_id', 'client_id'])
      clientId = requireUuid(body.client_id, 'client_id')
    } else {
      throw new HttpError(400, 'INVALID_ACTION', 'Unknown workspace client action')
    }

    const { data, error } = await admin.rpc('workspace_client_operation', {
      p_action: action,
      p_workspace_id: workspaceId,
      p_client_id: clientId,
      p_payload: payload,
      p_actor_user_id: user.id,
    })

    if (error) rpcError(error)
    if (action === 'list') {
      return jsonResponse(req, METHODS, 200, { clients: Array.isArray(data) ? data : [] })
    }
    return jsonResponse(req, METHODS, action === 'create' ? 201 : 200, {
      success: true,
      client: data,
    })
  } catch (error) {
    return errorResponse(req, METHODS, error)
  }
})
