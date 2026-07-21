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

const METHODS = ['POST'] as const
const DASHBOARD_FIELDS = [
  'id',
  'dashboard_slug',
  'name',
  'bio',
  'photo_url',
  'media_kit_url',
  'dashboard_tagline',
  'dashboard_view_count',
  'dashboard_last_viewed_at',
  'dashboard_enabled',
].join(',')
const FEEDBACK_FIELDS = [
  'id',
  'client_id',
  'podcast_id',
  'podcast_name',
  'status',
  'notes',
  'created_at',
  'updated_at',
].join(',')

type ClientDashboardRow = Record<string, unknown> & {
  id: string
  workspace?: { status?: string } | null
}

function requireSlug(value: unknown): string {
  const slug = requireString(value, 'slug', { max: 180 })
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/i.test(slug)) {
    throw new HttpError(400, 'INVALID_SLUG', 'slug is invalid')
  }
  return slug.toLowerCase()
}

async function findDashboard(
  admin: ReturnType<typeof createAdminClient>,
  slug: string,
) {
  const { data, error } = await admin
    .from('clients')
    .select(`${DASHBOARD_FIELDS},workspace:workspaces(status)`)
    .eq('dashboard_slug', slug)
    .eq('dashboard_enabled', true)
    .maybeSingle()

  if (error) throw new HttpError(500, 'DASHBOARD_LOOKUP_FAILED', 'Dashboard could not be loaded')
  if (!data) {
    throw new HttpError(404, 'DASHBOARD_NOT_FOUND', 'Dashboard not found')
  }
  const row = data as unknown as ClientDashboardRow
  if (row.workspace?.status !== 'active') {
    throw new HttpError(404, 'DASHBOARD_NOT_FOUND', 'Dashboard not found')
  }
  const { workspace: _workspace, ...dashboard } = row
  return dashboard
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return optionsResponse(req, METHODS)

  try {
    if (req.method !== 'POST') {
      throw new HttpError(405, 'METHOD_NOT_ALLOWED', 'Only POST is allowed')
    }

    const body = await parseJsonObject(req)
    const action = typeof body.action === 'string' ? body.action : ''
    const admin = createAdminClient()

    if (action === 'get') {
      requireOnlyKeys(body, ['action', 'slug'])
      const slug = requireSlug(body.slug)
      const dashboard = await findDashboard(admin, slug)

      const { error: viewError } = await admin.rpc('record_public_client_dashboard_view', {
        p_client_id: dashboard.id,
      })
      if (viewError) console.error('Public client dashboard view count failed')

      return jsonResponse(req, METHODS, 200, { dashboard })
    }

    if (action === 'feedback_list') {
      requireOnlyKeys(body, ['action', 'slug'])
      const dashboard = await findDashboard(admin, requireSlug(body.slug))
      const { data, error } = await admin
        .from('client_podcast_feedback')
        .select(FEEDBACK_FIELDS)
        .eq('client_id', dashboard.id)

      if (error) throw new HttpError(500, 'FEEDBACK_LOOKUP_FAILED', 'Feedback could not be loaded')
      return jsonResponse(req, METHODS, 200, { feedback: data ?? [] })
    }

    if (action === 'feedback_upsert') {
      requireOnlyKeys(body, ['action', 'slug', 'podcast_id', 'podcast_name', 'status', 'notes'])
      const dashboard = await findDashboard(admin, requireSlug(body.slug))
      const podcastId = requireString(body.podcast_id, 'podcast_id', { max: 300 })
      const notes = body.notes === null || body.notes === undefined || body.notes === ''
        ? null
        : requireString(body.notes, 'notes', { max: 5_000 })
      const status = body.status === null ? null : body.status
      if (status !== null && status !== 'approved' && status !== 'rejected') {
        throw new HttpError(400, 'INVALID_STATUS', 'status must be approved, rejected, or null')
      }

      const { data: podcast, error: podcastError } = await admin
        .from('client_dashboard_podcasts')
        .select('id,podcast_name')
        .eq('client_id', dashboard.id)
        .eq('podcast_id', podcastId)
        .maybeSingle()

      if (podcastError) throw new HttpError(500, 'PODCAST_LOOKUP_FAILED', 'Podcast could not be verified')
      if (!podcast) throw new HttpError(404, 'PODCAST_NOT_FOUND', 'Podcast is not on this dashboard')

      const { data, error } = await admin
        .from('client_podcast_feedback')
        .upsert({
          client_id: dashboard.id,
          podcast_id: podcastId,
          // The dashboard cache is authoritative. Never let a public caller
          // poison operator-facing feedback with a fabricated podcast name.
          podcast_name: podcast.podcast_name,
          status,
          notes,
        }, { onConflict: 'client_id,podcast_id' })
        .select(FEEDBACK_FIELDS)
        .single()

      if (error || !data) throw new HttpError(500, 'FEEDBACK_SAVE_FAILED', 'Feedback could not be saved')
      return jsonResponse(req, METHODS, 200, { feedback: data })
    }

    throw new HttpError(400, 'INVALID_ACTION', 'Unknown public dashboard action')
  } catch (error) {
    return errorResponse(req, METHODS, error)
  }
})
