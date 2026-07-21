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
  'slug',
  'prospect_name',
  'prospect_bio',
  'prospect_image_url',
  'is_active',
  'show_pricing_section',
  'personalized_tagline',
  'media_kit_url',
  'loom_video_url',
  'loom_thumbnail_url',
  'loom_video_title',
  'show_loom_video',
  'testimonial_ids',
  'show_testimonials',
  'view_count',
].join(',')
const FEEDBACK_FIELDS = [
  'id',
  'podcast_id',
  'podcast_name',
  'status',
  'notes',
  'created_at',
  'updated_at',
].join(',')

type ProspectDashboardRow = Record<string, unknown> & {
  id: string
  view_count: number | null
}

function requireSlug(value: unknown): string {
  const slug = requireString(value, 'slug', { max: 180 }).toLowerCase()
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)) {
    throw new HttpError(400, 'INVALID_SLUG', 'slug is invalid')
  }
  return slug
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return optionsResponse(req, METHODS)

  try {
    if (req.method !== 'POST') {
      throw new HttpError(405, 'METHOD_NOT_ALLOWED', 'Only POST is allowed')
    }

    const body = await parseJsonObject(req)
    requireOnlyKeys(body, ['slug'])
    const slug = requireSlug(body.slug)
    const admin = createAdminClient()

    const { data: dashboard, error: dashboardError } = await admin
      .from('prospect_dashboards')
      .select(DASHBOARD_FIELDS)
      .eq('slug', slug)
      .eq('is_active', true)
      .maybeSingle()

    if (dashboardError) {
      throw new HttpError(500, 'DASHBOARD_LOOKUP_FAILED', 'Dashboard could not be loaded')
    }
    if (!dashboard) {
      throw new HttpError(404, 'DASHBOARD_NOT_FOUND', 'Dashboard not found')
    }
    const dashboardRow = dashboard as unknown as ProspectDashboardRow

    const [{ data: feedback, error: feedbackError }, { error: viewError }] = await Promise.all([
      admin
        .from('prospect_podcast_feedback')
        .select(FEEDBACK_FIELDS)
        .eq('prospect_dashboard_id', dashboardRow.id),
      admin.rpc('record_public_prospect_dashboard_view', {
        p_dashboard_id: dashboardRow.id,
      }),
    ])

    if (feedbackError) {
      throw new HttpError(500, 'FEEDBACK_LOOKUP_FAILED', 'Feedback could not be loaded')
    }
    if (viewError) console.error('Public prospect dashboard view count failed')

    const publicDashboard: Record<string, unknown> = { ...dashboardRow }
    delete publicDashboard.id
    return jsonResponse(req, METHODS, 200, {
      success: true,
      dashboard: {
        ...publicDashboard,
        view_count: (dashboardRow.view_count ?? 0) + 1,
      },
      feedback: feedback ?? [],
    })
  } catch (error) {
    return errorResponse(req, METHODS, error)
  }
})
