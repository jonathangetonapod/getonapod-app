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
  workspace?: {
    id?: unknown
    name?: unknown
    status?: unknown
    logo_path?: unknown
    logo_updated_at?: unknown
    client_brand_name?: unknown
    client_brand_primary_color?: unknown
    client_brand_accent_color?: unknown
  } | null
}

function presentedWorkspaceName(value: unknown): string {
  if (typeof value !== 'string' || !value.trim() || value.length > 200) {
    throw new HttpError(500, 'INVALID_WORKSPACE_BRAND', 'Dashboard branding could not be loaded')
  }
  return value.trim()
}

function presentedWorkspaceColor(value: unknown, fallback: string): string {
  return typeof value === 'string' && /^#[0-9A-F]{6}$/u.test(value)
    ? value
    : fallback
}

function presentedWorkspaceLogo(
  workspaceIdValue: unknown,
  logoPathValue: unknown,
  logoUpdatedAtValue: unknown,
): string | null {
  if (logoPathValue === null || logoPathValue === undefined) return null
  if (
    typeof workspaceIdValue !== 'string'
    || typeof logoPathValue !== 'string'
    || logoPathValue.length > 500
    || logoPathValue.includes('..')
  ) {
    throw new HttpError(500, 'INVALID_WORKSPACE_BRAND', 'Dashboard branding could not be loaded')
  }
  const [pathWorkspaceId, objectName, ...extra] = logoPathValue.split('/')
  if (
    extra.length > 0
    || pathWorkspaceId !== workspaceIdValue
    || !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\.(?:png|jpg|webp)$/iu.test(objectName || '')
  ) {
    throw new HttpError(500, 'INVALID_WORKSPACE_BRAND', 'Dashboard branding could not be loaded')
  }
  const base = Deno.env.get('SUPABASE_URL')?.trim()
  if (!base) return null
  const encodedPath = logoPathValue.split('/').map(encodeURIComponent).join('/')
  const logoUrl = new URL(`/storage/v1/object/public/workspace-logos/${encodedPath}`, base)
  if (
    typeof logoUpdatedAtValue === 'string'
    && Number.isFinite(Date.parse(logoUpdatedAtValue))
  ) {
    logoUrl.searchParams.set('v', String(Date.parse(logoUpdatedAtValue)))
  }
  return logoUrl.toString()
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
    .select(`${DASHBOARD_FIELDS},workspace:workspaces(id,name,status,logo_path,logo_updated_at,client_brand_name,client_brand_primary_color,client_brand_accent_color)`)
    .eq('dashboard_slug', slug)
    .eq('dashboard_enabled', true)
    .maybeSingle()

  if (error) throw new HttpError(500, 'DASHBOARD_LOOKUP_FAILED', 'Dashboard could not be loaded')
  if (!data) {
    throw new HttpError(404, 'DASHBOARD_NOT_FOUND', 'Dashboard not found')
  }
  const row = data as unknown as ClientDashboardRow
  if (!row.workspace || row.workspace.status !== 'active') {
    throw new HttpError(404, 'DASHBOARD_NOT_FOUND', 'Dashboard not found')
  }
  const { workspace, ...dashboard } = row
  return {
    ...dashboard,
    workspace: {
      name: presentedWorkspaceName(workspace.client_brand_name ?? workspace.name),
      logo_url: presentedWorkspaceLogo(
        workspace.id,
        workspace.logo_path,
        workspace.logo_updated_at,
      ),
      primary_color: presentedWorkspaceColor(
        workspace.client_brand_primary_color,
        '#0D1B2A',
      ),
      accent_color: presentedWorkspaceColor(
        workspace.client_brand_accent_color,
        '#C7794F',
      ),
    },
  }
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

    if (action === 'metadata') {
      requireOnlyKeys(body, ['action', 'slug'])
      const dashboard = await findDashboard(admin, requireSlug(body.slug))
      return jsonResponse(req, METHODS, 200, {
        metadata: {
          name: dashboard.name,
          dashboard_tagline: dashboard.dashboard_tagline,
          workspace: dashboard.workspace,
        },
      })
    }

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
      const { data: visiblePodcasts, error: podcastsError } = await admin
        .from('client_dashboard_podcasts')
        .select('podcast_id')
        .eq('client_id', dashboard.id)
        .eq('visibility', 'visible')

      if (podcastsError) throw new HttpError(500, 'FEEDBACK_LOOKUP_FAILED', 'Feedback could not be loaded')
      const visiblePodcastIds = (visiblePodcasts ?? []).map((podcast) => podcast.podcast_id)
      if (visiblePodcastIds.length === 0) {
        return jsonResponse(req, METHODS, 200, { feedback: [] })
      }
      const { data, error } = await admin
        .from('client_podcast_feedback')
        .select(FEEDBACK_FIELDS)
        .eq('client_id', dashboard.id)

      if (error) throw new HttpError(500, 'FEEDBACK_LOOKUP_FAILED', 'Feedback could not be loaded')
      const visiblePodcastIdSet = new Set(visiblePodcastIds)
      const feedback = (data ?? []).filter((entry) => visiblePodcastIdSet.has(entry.podcast_id))
      return jsonResponse(req, METHODS, 200, { feedback })
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
        .eq('visibility', 'visible')
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
