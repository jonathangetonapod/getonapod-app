import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'

import {
  errorResponse,
  HttpError,
  jsonResponse,
  optionsResponse,
  optionalString,
  parseJsonObject,
  requireAuthenticatedUser,
  requireOnlyKeys,
  requireUuid,
  requireWorkspaceFeatureAccess,
} from '../_shared/workspaceAuth.ts'
import { generatePodcastSearchEmbedding } from '../_shared/podcastSearch.ts'
import { logOperationCost } from '../_shared/billing.ts'
import { resolveAiKey } from '../_shared/workspaceAiKeys.ts'
import { reservePublicRate } from '../_shared/publicRateLimit.ts'

const METHODS = ['POST'] as const
const CONTACT_FILTERS = new Set(['all', 'any', 'free', 'direct', 'none'])
const ACTIVITY_FILTERS = new Set(['active', 'last_30_days', 'last_90_days', 'last_180_days', 'last_year', 'all'])
// 250k_plus predates the 250K to 1M / 1M+ split and is kept for old addresses.
const AUDIENCE_FILTERS = new Set(['all', 'under_10k', '10k_50k', '50k_250k', '250k_1m', '1m_plus', '250k_plus'])
const SORT_OPTIONS = new Set(['best_fit', 'relevance', 'audience', 'name', 'recent', 'community'])
// Semantic search embeds every search box change on the platform OpenAI key.
// Charging credits per keystroke would punish ordinary typing, so instead
// each workspace (and each member) gets a generous embedding allowance; past
// it the search quietly runs as keyword-only until the window rolls over.
// Workspaces on their own OpenAI key pay for their own embeddings and are not
// limited.
const CATALOG_EMBEDDING_LIMITS = {
  perWorkspace: { limit: 300, windowSeconds: 60 * 60 },
  perUser: { limit: 60, windowSeconds: 10 * 60 },
} as const

function optionalChoice(
  value: unknown,
  field: string,
  choices: Set<string>,
  fallback: string,
): string {
  if (value === undefined || value === null || value === '') return fallback
  if (typeof value !== 'string' || !choices.has(value)) {
    throw new HttpError(400, 'INVALID_FIELD', `${field} is invalid`)
  }
  return value
}

function optionalInteger(
  value: unknown,
  field: string,
  fallback: number,
  minimum: number,
  maximum: number,
): number {
  if (value === undefined || value === null) return fallback
  if (!Number.isSafeInteger(value) || Number(value) < minimum || Number(value) > maximum) {
    throw new HttpError(400, 'INVALID_FIELD', `${field} is invalid`)
  }
  return Number(value)
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return optionsResponse(req, METHODS)

  try {
    if (req.method !== 'POST') throw new HttpError(405, 'METHOD_NOT_ALLOWED', 'Only POST is allowed')

    const body = await parseJsonObject(req, 4_096)
    requireOnlyKeys(body, [
      'action',
      'workspace_id',
      'search',
      'category',
      'contact',
      'activity',
      'audience',
      'sort',
      'page',
      'page_size',
    ])
    if (body.action !== 'list') {
      throw new HttpError(400, 'INVALID_ACTION', 'Unknown podcast catalog action')
    }

    const workspaceId = requireUuid(body.workspace_id, 'workspace_id')
    const search = optionalString(body.search, 'search', 120)
    const category = optionalString(body.category, 'category', 200)
    const contact = optionalChoice(body.contact, 'contact', CONTACT_FILTERS, 'all')
    const activity = optionalChoice(body.activity, 'activity', ACTIVITY_FILTERS, 'active')
    const audience = optionalChoice(body.audience, 'audience', AUDIENCE_FILTERS, 'all')
    const sort = optionalChoice(body.sort, 'sort', SORT_OPTIONS, 'best_fit')
    const page = optionalInteger(body.page, 'page', 1, 1, 10_000)
    const pageSize = optionalInteger(body.page_size, 'page_size', 24, 12, 48)

    const context = await requireAuthenticatedUser(req)
    const access = await requireWorkspaceFeatureAccess(context, workspaceId)
    const openaiKey = await resolveAiKey(context.admin, workspaceId, 'openai')
    let embeddingAllowed = true
    if (search && search.length >= 3 && openaiKey && openaiKey.source !== 'workspace') {
      try {
        embeddingAllowed = await reservePublicRate(context.admin, [
          {
            bucket: `catalog-embed:${workspaceId}`,
            limit: CATALOG_EMBEDDING_LIMITS.perWorkspace.limit,
            windowSeconds: CATALOG_EMBEDDING_LIMITS.perWorkspace.windowSeconds,
          },
          {
            bucket: `catalog-embed-user:${context.user.id}`,
            limit: CATALOG_EMBEDDING_LIMITS.perUser.limit,
            windowSeconds: CATALOG_EMBEDDING_LIMITS.perUser.windowSeconds,
          },
        ])
      } catch {
        // Keyword search still answers, so a broken limiter costs relevance,
        // never platform spend.
        console.error('[Podcast Catalog] Embedding rate limit unavailable; using keyword search')
        embeddingAllowed = false
      }
    }
    const searchEmbedding = embeddingAllowed
      ? await generatePodcastSearchEmbedding(search, openaiKey)
      : null
    if (searchEmbedding) {
      await logOperationCost(context.admin, {
        workspaceId,
        operationType: 'semantic_search',
        usage: { openaiTokens: searchEmbedding.tokens },
        usedByoKey: searchEmbedding.usedByoKey,
        referenceKind: 'catalog_list',
      })
    }
    const queryEmbedding = searchEmbedding?.embedding ?? null
    const { data, error } = await context.admin.rpc('workspace_podcast_catalog_page_v3', {
      p_search: search,
      p_category: category,
      p_contact: contact,
      p_activity: activity,
      p_audience: audience,
      p_query_embedding: queryEmbedding,
      p_sort: sort,
      p_page: page,
      p_page_size: pageSize,
    })
    if (error || !data || typeof data !== 'object' || Array.isArray(data)) {
      throw new HttpError(500, 'PODCAST_CATALOG_UNAVAILABLE', 'The shared podcast catalog could not be loaded')
    }

    return jsonResponse(req, METHODS, 200, {
      workspace: {
        id: access.workspace.id,
        name: access.workspace.name,
      },
      search_mode: search ? (queryEmbedding ? 'hybrid' : 'keyword') : 'browse',
      ...data as Record<string, unknown>,
    })
  } catch (error) {
    return errorResponse(req, METHODS, error)
  }
})
