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
  requireWorkspaceFeatureAccess,
  workspaceCredentialIsFresh,
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
  if (
    message.includes('active workspace manager')
    || message.includes('active workspace staff')
    || message.includes('active selected workspace')
  ) {
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
    const authContext = await requireAuthenticatedUser(req)
    if (!workspaceCredentialIsFresh(authContext)) {
      throw new HttpError(401, 'REAUTHENTICATION_REQUIRED', 'Sign in again with the newest account credentials')
    }
    const { admin, user, tokenIssuedAt } = authContext
    const workspaceId = requireUuid(body.workspace_id, 'workspace_id')
    let clientId: string | null = null
    let payload: Record<string, string | null> = {}

    if (action === 'research-get' || action === 'detail-get') {
      requireOnlyKeys(body, ['action', 'workspace_id', 'client_id'])
      clientId = requireUuid(body.client_id, 'client_id')
    } else if (action === 'list') {
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

    if (action === 'detail-get') {
      const access = await requireWorkspaceFeatureAccess(authContext, workspaceId)
      const { data: client, error: clientError } = await admin
        .from('clients')
        .select('id,workspace_id,name,email,contact_person,linkedin_url,website,calendar_link,status,notes,bio,photo_url,google_sheet_url,media_kit_url,prospect_dashboard_slug,dashboard_slug,dashboard_enabled,portal_access_enabled,portal_last_login_at,password_set_at,created_at,updated_at')
        .eq('id', clientId!)
        .eq('workspace_id', workspaceId)
        .maybeSingle()

      if (clientError) {
        throw new HttpError(500, 'CLIENT_OPERATION_FAILED', 'The workspace client could not be loaded')
      }
      if (!client || client.workspace_id !== workspaceId) {
        throw new HttpError(404, 'CLIENT_NOT_FOUND', 'Workspace client not found')
      }

      const [bookingsResult, onboardingResult] = await Promise.all([
        admin
          .from('bookings')
          .select('id,client_id,podcast_id,podcast_name,podcast_url,host_name,scheduled_date,recording_date,publish_date,status,episode_url,prep_sent,notes,created_at,updated_at')
          .eq('client_id', clientId!)
          .order('scheduled_date', { ascending: false, nullsFirst: false })
          .order('created_at', { ascending: false })
          .limit(500),
        admin
          .from('workspace_onboarding_instances')
          .select('id,workspace_id,client_id,recipient_name,recipient_email,status,invited_at,started_at,submitted_at,approved_at,updated_at,archived_at')
          .eq('workspace_id', workspaceId)
          .eq('client_id', clientId!)
          .order('created_at', { ascending: false })
          .limit(1)
          .maybeSingle(),
      ])

      if (bookingsResult.error) {
        throw new HttpError(500, 'CLIENT_OPERATION_FAILED', 'The client podcast activity could not be loaded')
      }
      if (onboardingResult.error) {
        throw new HttpError(500, 'CLIENT_OPERATION_FAILED', 'The client onboarding status could not be loaded')
      }
      if ((bookingsResult.data || []).some((booking) => booking.client_id !== clientId)) {
        throw new HttpError(500, 'CLIENT_SCOPE_MISMATCH', 'The client podcast activity could not be loaded')
      }
      if (onboardingResult.data && (
        onboardingResult.data.workspace_id !== workspaceId
        || onboardingResult.data.client_id !== clientId
      )) {
        throw new HttpError(500, 'CLIENT_SCOPE_MISMATCH', 'The client onboarding status could not be loaded')
      }

      return jsonResponse(req, METHODS, 200, {
        workspace: {
          id: access.workspace.id,
          name: access.workspace.name,
          slug: access.workspace.slug,
          status: access.workspace.status,
          is_default: access.workspace.is_default,
          logo_path: access.workspace.logo_path,
          logo_updated_at: access.workspace.logo_updated_at,
        },
        viewer_role: access.role,
        can_manage: ['owner', 'admin', 'platform_admin'].includes(access.role),
        client,
        bookings: bookingsResult.data || [],
        onboarding: access.role === 'member' ? null : onboardingResult.data || null,
      })
    }

    if (action === 'research-get') {
      const access = await requireWorkspaceFeatureAccess(authContext, workspaceId)
      const { data: client, error: clientError } = await admin
        .from('clients')
        .select('id,workspace_id,name,email,website,status,bio,photo_url,google_sheet_url,updated_at')
        .eq('id', clientId!)
        .eq('workspace_id', workspaceId)
        .eq('status', 'active')
        .maybeSingle()

      if (clientError) {
        throw new HttpError(500, 'CLIENT_OPERATION_FAILED', 'The workspace client could not be loaded')
      }
      if (!client || client.workspace_id !== workspaceId) {
        throw new HttpError(404, 'CLIENT_NOT_FOUND', 'Active workspace client not found')
      }

      const historyTables = [
        'client_dashboard_podcasts',
        'client_podcast_feedback',
        'podcast_outreach_actions',
        'bookings',
      ] as const
      const historyResults = await Promise.all(historyTables.map(async (table) => {
        const podcastIds: string[] = []
        const pageSize = 1_000
        const maximumRows = 5_000
        for (let offset = 0; offset < maximumRows; offset += pageSize) {
          const { data, error } = await admin
            .from(table)
            .select('podcast_id')
            .eq('client_id', clientId!)
            .not('podcast_id', 'is', null)
            .order('created_at', { ascending: false })
            .order('id', { ascending: false })
            .range(offset, offset + pageSize - 1)
          if (error) {
            throw new HttpError(500, 'CLIENT_OPERATION_FAILED', 'The client podcast history could not be loaded')
          }
          podcastIds.push(...(data || [])
            .map((row) => typeof row.podcast_id === 'string' ? row.podcast_id.trim() : '')
            .filter(Boolean))
          if ((data || []).length < pageSize) break
        }
        return podcastIds
      }))

      const existingPodcastIds = Array.from(new Set(
        historyResults.flat(),
      ))

      return jsonResponse(req, METHODS, 200, {
        workspace: {
          id: access.workspace.id,
          name: access.workspace.name,
          slug: access.workspace.slug,
          status: access.workspace.status,
          is_default: access.workspace.is_default,
          logo_path: access.workspace.logo_path,
          logo_updated_at: access.workspace.logo_updated_at,
        },
        client: {
          id: client.id,
          workspace_id: client.workspace_id,
          name: client.name,
          email: client.email,
          website: client.website,
          status: client.status,
          bio: client.bio,
          photo_url: client.photo_url,
          google_sheet_configured: Boolean(client.google_sheet_url),
          updated_at: client.updated_at,
        },
        existing_podcast_ids: existingPodcastIds,
      })
    }

    if (action === 'list') {
      await requireWorkspaceFeatureAccess(authContext, workspaceId)
      const { data: clients, error: clientsError } = await admin
        .from('clients')
        .select('id,workspace_id,name,email,contact_person,linkedin_url,website,status,notes,created_at,updated_at')
        .eq('workspace_id', workspaceId)
        .order('name', { ascending: true })
        .order('id', { ascending: true })

      if (clientsError) {
        throw new HttpError(500, 'CLIENT_OPERATION_FAILED', 'The workspace clients could not be loaded')
      }
      if ((clients || []).some((client) => client.workspace_id !== workspaceId)) {
        throw new HttpError(500, 'CLIENT_SCOPE_MISMATCH', 'The workspace clients could not be loaded')
      }
      return jsonResponse(req, METHODS, 200, { clients: clients || [] })
    }

    const { data, error } = await admin.rpc('workspace_client_operation_v2', {
      p_action: action,
      p_workspace_id: workspaceId,
      p_client_id: clientId,
      p_payload: payload,
      p_actor_user_id: user.id,
      p_token_issued_at: tokenIssuedAt,
    })

    if (error) rpcError(error)
    return jsonResponse(req, METHODS, action === 'create' ? 201 : 200, {
      success: true,
      client: data,
    })
  } catch (error) {
    return errorResponse(req, METHODS, error)
  }
})
