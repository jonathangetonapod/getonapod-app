import { withCurrentCatalogContacts, type CatalogDirectContact } from '../_shared/catalogContacts.ts'
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
import {
  generatePodcastSearchEmbedding,
  isSemanticSearchEnabled,
  normalizedSearchText,
  rememberedSearchEmbedding,
  rememberSearchEmbedding,
} from '../_shared/podcastSearch.ts'
import { logOperationCost } from '../_shared/billing.ts'
import { resolveAiKey } from '../_shared/workspaceAiKeys.ts'
import { reservePublicRate } from '../_shared/publicRateLimit.ts'

const METHODS = ['POST'] as const
// verified: a verified direct contact, or an address MillionVerifier confirmed.
const CONTACT_FILTERS = new Set(['all', 'any', 'free', 'direct', 'verified', 'none'])
const ACTIVITY_FILTERS = new Set(['active', 'last_30_days', 'last_90_days', 'last_180_days', 'last_year', 'all'])
// 250k_plus predates the 250K to 1M / 1M+ split and is kept for old addresses.
const AUDIENCE_FILTERS = new Set(['all', 'under_10k', '10k_50k', '50k_250k', '250k_1m', '1m_plus', '250k_plus'])
// Podscan's guest detection: 'yes' = takes guests, 'no' = not flagged as taking guests.
const GUEST_FILTERS = new Set(['all', 'yes', 'no'])
// Research data saved: Podscan episodes (and usually a transcript) already
// fetched and stored on the show, so researching it reuses them.
const RESEARCH_FILTERS = new Set(['all', 'saved', 'not_saved'])
// Jev's tags (20261104000300): B2B fit floor, audiences, formats, and whether junk is listed.
const B2B_FIT_FILTERS = new Set(['all', 'some', 'good', 'strong'])
const JUNK_FILTERS = new Set(['hide', 'show'])
const AUDIENCE_KEYS = new Set(['founders', 'executives', 'marketers', 'sales', 'investors', 'technical', 'healthcare', 'consumers'])
const FORMAT_KEYS = new Set(['interview', 'panel', 'solo', 'cohosts', 'news', 'narrative', 'brand', 'other'])
const SORT_OPTIONS = new Set(['best_fit', 'relevance', 'audience', 'name', 'recent', 'community', 'rating', 'reach'])
// Language and region codes as the catalogue stores them ("en", "us").
const LOCALE_CODE = /^[a-z]{2,3}(?:-[a-z0-9]{2,8})?$/u
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

/** A "|"-joined list of known keys, or null. */
function optionalKeyList(value: unknown, field: string, keys: Set<string>): string | null {
  const text = optionalString(value, field, 200)
  if (!text) return null
  const parts = text.split('|')
  if (parts.some((part) => !keys.has(part))) throw new HttpError(400, 'INVALID_FIELD', `${field} is invalid`)
  return [...new Set(parts)].join('|')
}

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

function optionalLocaleCode(value: unknown, field: string): string | null {
  const code = optionalString(value, field, 16)?.toLowerCase() ?? null
  if (code !== null && !LOCALE_CODE.test(code)) {
    throw new HttpError(400, 'INVALID_FIELD', `${field} is invalid`)
  }
  return code
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

    // Room for a long category list and its exclusions (up to 2,000 characters each).
    const body = await parseJsonObject(req, 8_192)
    requireOnlyKeys(body, [
      'action',
      'workspace_id',
      'search',
      'category',
      'contact',
      'activity',
      'audience',
      'guests',
      'research',
      'exclude_category',
      'exclude_terms',
      'b2b_fit',
      'audiences',
      'formats',
      'junk',
      'language',
      'region',
      'sort',
      'page',
      'page_size',
    ])
    if (body.action !== 'list') {
      throw new HttpError(400, 'INVALID_ACTION', 'Unknown podcast catalog action')
    }

    const workspaceId = requireUuid(body.workspace_id, 'workspace_id')
    const search = optionalString(body.search, 'search', 120)
    // Category choices joined by "|"; a show tagged with any of them matches.
    const category = optionalString(body.category, 'category', 2_000)
    // Left out: shows tagged with any of these categories ("|"), and shows that
    // mention any of these comma-separated words or phrases.
    const excludeCategory = optionalString(body.exclude_category, 'exclude_category', 2_000)
    const excludeTerms = optionalString(body.exclude_terms, 'exclude_terms', 300)
    if (excludeTerms && excludeTerms.split(',').length > 20) {
      throw new HttpError(400, 'INVALID_FIELD', 'exclude_terms is invalid')
    }
    const contact = optionalChoice(body.contact, 'contact', CONTACT_FILTERS, 'all')
    const activity = optionalChoice(body.activity, 'activity', ACTIVITY_FILTERS, 'active')
    const audience = optionalChoice(body.audience, 'audience', AUDIENCE_FILTERS, 'all')
    const guests = optionalChoice(body.guests, 'guests', GUEST_FILTERS, 'all')
    const research = optionalChoice(body.research, 'research', RESEARCH_FILTERS, 'all')
    const b2bFit = optionalChoice(body.b2b_fit, 'b2b_fit', B2B_FIT_FILTERS, 'all')
    const audiences = optionalKeyList(body.audiences, 'audiences', AUDIENCE_KEYS)
    const formats = optionalKeyList(body.formats, 'formats', FORMAT_KEYS)
    const junk = optionalChoice(body.junk, 'junk', JUNK_FILTERS, 'hide')
    const language = optionalLocaleCode(body.language, 'language')
    const region = optionalLocaleCode(body.region, 'region')
    const sort = optionalChoice(body.sort, 'sort', SORT_OPTIONS, 'best_fit')
    const page = optionalInteger(body.page, 'page', 1, 1, 10_000)
    const pageSize = optionalInteger(body.page_size, 'page_size', 24, 12, 48)

    const context = await requireAuthenticatedUser(req)
    // Browsing needs no embedding, so the remembered embeddings are only read
    // for a search. That read holds nothing belonging to a workspace (one
    // embedding per search text), so it runs alongside the workspace check.
    const wantsEmbedding = Boolean(search && search.length >= 3 && isSemanticSearchEnabled())
    const [access, rememberedEmbedding] = await Promise.all([
      requireWorkspaceFeatureAccess(context, workspaceId),
      wantsEmbedding ? rememberedSearchEmbedding(context.admin, search as string) : Promise.resolve(null),
    ])
    // A search seen before reuses its embedding: no OpenAI call, no cost, no
    // rate-limit slot, and the workspace's own AI key is never read.
    let queryEmbedding: number[] | null = rememberedEmbedding
    if (wantsEmbedding && !queryEmbedding) {
      // Only after the workspace check has passed: a workspace's stored key is
      // decrypted for its own members, never for a caller still being checked.
      const openaiKey = await resolveAiKey(context.admin, workspaceId, 'openai')
      let embeddingAllowed = true
      if (openaiKey && openaiKey.source !== 'workspace') {
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
      // Embedded as normalised text, the same text it is remembered under.
      const searchEmbedding = embeddingAllowed
        ? await generatePodcastSearchEmbedding(normalizedSearchText(search as string), openaiKey)
        : null
      if (searchEmbedding) {
        queryEmbedding = searchEmbedding.embedding
        await Promise.all([
          logOperationCost(context.admin, {
            workspaceId,
            operationType: 'semantic_search',
            usage: { openaiTokens: searchEmbedding.tokens },
            usedByoKey: searchEmbedding.usedByoKey,
            referenceKind: 'catalog_list',
          }),
          rememberSearchEmbedding(context.admin, search as string, searchEmbedding.embedding),
        ])
      }
    }
    const { data, error } = await context.admin.rpc('workspace_podcast_catalog_page_v3', {
      p_search: search,
      p_category: category,
      p_contact: contact,
      p_activity: activity,
      p_audience: audience,
      p_guests: guests,
      // Sent only when set, so the default list never depends on the
      // migration that added the parameter (20261104000100).
      ...(research !== 'all' ? { p_research: research } : {}),
      // The same for the exclusions (20261104000200).
      ...(excludeCategory ? { p_exclude_category: excludeCategory } : {}),
      ...(excludeTerms ? { p_exclude_terms: excludeTerms } : {}),
      // And for Jev's tags (20261104000400); junk is hidden unless asked for.
      ...(b2bFit !== 'all' ? { p_b2b_fit: b2bFit } : {}),
      ...(audiences ? { p_audiences: audiences } : {}),
      ...(formats ? { p_formats: formats } : {}),
      ...(junk !== 'hide' ? { p_junk: junk } : {}),
      p_language: language,
      p_region: region,
      p_query_embedding: queryEmbedding,
      p_sort: sort,
      p_page: page,
      p_page_size: pageSize,
    })
    if (error || !data || typeof data !== 'object' || Array.isArray(data)) {
      throw new HttpError(500, 'PODCAST_CATALOG_UNAVAILABLE', 'The shared podcast catalog could not be loaded')
    }

    // Keep both email sources in the existing catalog payload. Enrich only
    // this page with the saved personal profile, after workspace access checks.
    const catalogPage = data as Record<string, unknown>
    const items = Array.isArray(catalogPage.items) ? catalogPage.items as Array<Record<string, unknown>> : []
    const ids = items.map(item => item.podcast_id).filter((id): id is string => typeof id === 'string')
    let currentContacts: CatalogDirectContact[] = []
    if (ids.length) {
      const { data: contacts, error: contactsError } = await context.admin
        .from('podcast_direct_contacts')
        .select('email,last_verified_at,provider_reference,podcast:podcasts!inner(podscan_id)')
        .eq('verification_status', 'verified')
        .in('podcast.podscan_id', ids)
      if (contactsError) throw new HttpError(500, 'PODCAST_CATALOG_UNAVAILABLE', 'The shared podcast contacts could not be loaded')
      currentContacts = (contacts ?? []) as unknown as CatalogDirectContact[]
    }

    return jsonResponse(req, METHODS, 200, {
      workspace: {
        id: access.workspace.id,
        name: access.workspace.name,
      },
      search_mode: search ? (queryEmbedding ? 'hybrid' : 'keyword') : 'browse',
      ...catalogPage,
      items: withCurrentCatalogContacts(items, currentContacts),
    })
  } catch (error) {
    return errorResponse(req, METHODS, error)
  }
})
