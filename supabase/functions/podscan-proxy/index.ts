import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'

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
} from '../_shared/workspaceAuth.ts'
import { chargeCredits, logOperationCost, refundCredits } from '../_shared/billing.ts'
import {
  type PodscanFetchResult,
  PodscanRateLimitError,
  podscanFetch,
  podscanUpstreamStatus,
  withoutDuplicateShows,
} from '../_shared/podscan.ts'

const METHODS = ['POST'] as const
const SEARCH_KEYS = new Set([
  'query',
  'category_ids',
  'per_page',
  'order_by',
  'order_dir',
  'search_fields',
  'language',
  'region',
  'min_audience_size',
  'max_audience_size',
  'min_episode_count',
  'max_episode_count',
  'min_last_episode_posted_at',
  'max_last_episode_posted_at',
  'has_guests',
  'has_sponsors',
  'page',
])

function podcastId(value: unknown): string {
  const id = requireString(value, 'podcast_id', { max: 200 })
  if (!/^[a-zA-Z0-9_-]+$/.test(id)) {
    throw new HttpError(400, 'INVALID_FIELD', 'podcast_id is invalid')
  }
  return id
}

function enumValue(value: unknown, field: string, values: readonly string[]): string {
  const result = requireString(value, field, { max: 80 })
  if (!values.includes(result)) throw new HttpError(400, 'INVALID_FIELD', `${field} is invalid`)
  return result
}

const PAGING_BOUNDS: Record<string, number> = { per_page: 50, page: 1_000 }

function searchParams(value: unknown): URLSearchParams {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new HttpError(400, 'INVALID_FIELD', 'options must be an object')
  }
  const options = value as Record<string, unknown>
  if (Object.keys(options).some((key) => !SEARCH_KEYS.has(key))) {
    throw new HttpError(400, 'UNKNOWN_FIELD', 'options contains an unknown field')
  }

  const params = new URLSearchParams()
  for (const [key, rawValue] of Object.entries(options)) {
    if (rawValue === undefined || rawValue === null || rawValue === '') continue
    if (!['string', 'number', 'boolean'].includes(typeof rawValue)) {
      throw new HttpError(400, 'INVALID_FIELD', `${key} has an invalid value`)
    }
    const serialized = String(rawValue)
    if (serialized.length > 500) {
      throw new HttpError(400, 'INVALID_FIELD', `${key} is too long`)
    }
    // Podscan caps per_page at 50; page is bounded so a request cannot ask
    // for an arbitrary offset into the index.
    const bound = PAGING_BOUNDS[key]
    if (bound) {
      const number = Number(serialized)
      if (!Number.isInteger(number) || number < 1 || number > bound) {
        throw new HttpError(400, 'INVALID_FIELD', `${key} must be a whole number from 1 to ${bound}`)
      }
    }
    params.set(key, serialized)
  }
  return params
}

async function fetchPodscan(path: string, params?: URLSearchParams): Promise<PodscanFetchResult> {
  // No retries here: the browser decides, and each retry is its own charge.
  return await podscanFetch(path, { params })
}

/**
 * The same envelope with Podscan-flagged duplicate feeds left out of a list,
 * and how many were left out: a page that held only duplicates comes back
 * empty, and a caller paging by "empty means done" needs to know it was not.
 */
function dropDuplicateShows(
  result: PodscanFetchResult,
  listKey: string,
): { result: PodscanFetchResult; removed: number } {
  const data = result.data
  if (!data || typeof data !== 'object' || Array.isArray(data)) return { result, removed: 0 }
  const list = (data as Record<string, unknown>)[listKey]
  if (!Array.isArray(list)) return { result, removed: 0 }
  const kept = withoutDuplicateShows(list)
  return { result: { ...result, data: { ...data, [listKey]: kept } }, removed: list.length - kept.length }
}

interface PodscanRequest {
  path: string
  params?: URLSearchParams
  /** The list duplicate feeds are dropped from, for list endpoints. */
  listKey?: string
}

/**
 * Validates the body into the one upstream request it asks for. Runs before
 * the charge, so a malformed request is refused without touching the ledger.
 */
function podscanRequest(body: Record<string, unknown>, action: string): PodscanRequest {
  if (action === 'search') {
    requireOnlyKeys(body, ['action', 'options', 'workspace_id'])
    return { path: '/podcasts/search', params: searchParams(body.options), listKey: 'podcasts' }
  }
  if (action === 'podcast') {
    requireOnlyKeys(body, ['action', 'podcast_id', 'workspace_id'])
    return { path: `/podcasts/${encodeURIComponent(podcastId(body.podcast_id))}` }
  }
  if (action === 'related') {
    requireOnlyKeys(body, ['action', 'podcast_id', 'workspace_id'])
    return {
      path: `/podcasts/${encodeURIComponent(podcastId(body.podcast_id))}/related_podcasts`,
      listKey: 'related_podcasts',
    }
  }
  if (action === 'demographics') {
    requireOnlyKeys(body, ['action', 'podcast_id', 'workspace_id'])
    return { path: `/podcasts/${encodeURIComponent(podcastId(body.podcast_id))}/demographics` }
  }
  if (action === 'chart_countries') {
    requireOnlyKeys(body, ['action', 'workspace_id'])
    return { path: '/charts/countries/available' }
  }
  if (action === 'chart_categories') {
    requireOnlyKeys(body, ['action', 'platform', 'country', 'workspace_id'])
    const platform = enumValue(body.platform, 'platform', ['apple', 'spotify'])
    const country = requireString(body.country, 'country', { max: 8 }).toLowerCase()
    if (!/^[a-z]{2,8}$/.test(country)) throw new HttpError(400, 'INVALID_FIELD', 'country is invalid')
    return { path: `/charts/${platform}/${country}/categories` }
  }
  if (action === 'chart_top') {
    requireOnlyKeys(body, ['action', 'platform', 'country', 'category', 'limit', 'workspace_id'])
    const platform = enumValue(body.platform, 'platform', ['apple', 'spotify'])
    const country = requireString(body.country, 'country', { max: 8 }).toLowerCase()
    const category = requireString(body.category, 'category', { max: 100 })
    if (!/^[a-z]{2,8}$/.test(country) || !/^[a-zA-Z0-9_-]+$/.test(category)) {
      throw new HttpError(400, 'INVALID_FIELD', 'chart parameters are invalid')
    }
    const limit = typeof body.limit === 'number' && Number.isInteger(body.limit)
      ? Math.max(1, Math.min(body.limit, platform === 'apple' ? 200 : 50))
      : 10
    return {
      path: `/charts/${platform}/${country}/${encodeURIComponent(category)}/top`,
      params: new URLSearchParams({ limit: String(limit) }),
    }
  }
  throw new HttpError(400, 'INVALID_ACTION', 'Unknown Podscan action')
}

serve(async (req) => {
  // A lookup that failed after the charge — the index refusing, a timeout —
  // delivered nothing to pay for, so the outer catch gives the debit back
  // (except a 404, which is an answer; see the catch).
  let chargedForRefund: { workspaceId: string; entryId: string; credits: number } | null = null
  let refundAdmin: Parameters<typeof refundCredits>[0] | null = null
  if (req.method === 'OPTIONS') return optionsResponse(req, METHODS)

  try {
    if (req.method !== 'POST') {
      throw new HttpError(405, 'METHOD_NOT_ALLOWED', 'Only POST is allowed')
    }
    const body = await parseJsonObject(req)
    const action = typeof body.action === 'string' ? body.action : ''
    const workspaceId = body.workspace_id === undefined
      ? null
      : requireUuid(body.workspace_id, 'workspace_id')
    const request = podscanRequest(body, action)
    let metering: { admin: Awaited<ReturnType<typeof requireAuthenticatedUser>>['admin']; workspaceId: string } | null = null
    if (workspaceId) {
      const context = await requireAuthenticatedUser(req)
      await requireWorkspaceFeatureAccess(context, workspaceId)
      metering = { admin: context.admin, workspaceId }
      const lookupCharge = await chargeCredits(context.admin, {
        workspaceId,
        operationType: 'podscan_lookup',
        referenceKind: 'podscan_action',
        referenceId: action,
        actorUserId: context.user.id,
      })
      if (lookupCharge.entryId && !lookupCharge.replayed) {
        chargedForRefund = { workspaceId, entryId: lookupCharge.entryId, credits: lookupCharge.charged }
        refundAdmin = context.admin
      }
    } else {
      await requirePlatformAdmin(req)
    }
    const fetched = await fetchPodscan(request.path, request.params)
    const { result, removed } = request.listKey
      ? dropDuplicateShows(fetched, request.listKey)
      : { result: fetched, removed: 0 }

    if (metering) {
      await logOperationCost(metering.admin, {
        workspaceId: metering.workspaceId,
        operationType: 'podscan_lookup',
        usage: { podscanCalls: 1 },
        referenceKind: 'podscan_action',
        referenceId: action,
      })
    }

    return jsonResponse(req, METHODS, 200, {
      data: result.data,
      meta: {
        rate_limit: result.rateLimit,
        ...(request.listKey ? { duplicates_removed: removed } : {}),
      },
    })
  } catch (error) {
    // Said in headers so the body shape callers depend on stays as it was, and
    // only a refund the ledger confirmed counts as refunded.
    let creditsCharged = 0
    let creditsRefunded = 0
    // A 404 is an answer, not a failure: Podscan looked and the show is not
    // there. Refunding it made lookups of made-up ids free, and those still
    // spend the index's concurrency and daily quota every tenant shares.
    const answered = podscanUpstreamStatus(error) === 404
    if (chargedForRefund && answered) creditsCharged = chargedForRefund.credits
    if (chargedForRefund && refundAdmin && !answered) {
      creditsCharged = chargedForRefund.credits
      const refunded = await refundCredits(refundAdmin, {
        workspaceId: chargedForRefund.workspaceId,
        entryId: chargedForRefund.entryId,
        reason: 'the podcast index lookup failed after the charge',
      })
      if (refunded) creditsRefunded = chargedForRefund.credits
    }
    const response = errorResponse(req, METHODS, error)
    const headers = new Headers(response.headers)
    headers.set('Access-Control-Expose-Headers', 'Retry-After, X-Concurrency-Limit, X-Credits-Charged, X-Credits-Refunded')
    headers.set('X-Credits-Charged', String(creditsCharged))
    headers.set('X-Credits-Refunded', String(creditsRefunded))
    if (error instanceof PodscanRateLimitError) {
      if (error.retryAfter) headers.set('Retry-After', error.retryAfter)
      if (error.concurrencyLimit) headers.set('X-Concurrency-Limit', error.concurrencyLimit)
    }
    return new Response(response.body, { status: response.status, headers })
  }
})
