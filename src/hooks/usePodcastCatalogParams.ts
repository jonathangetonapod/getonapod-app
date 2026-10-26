import { useCallback, useMemo } from 'react'
import { useSearchParams } from 'react-router-dom'
import type {
  WorkspacePodcastCatalogActivityFilter,
  WorkspacePodcastCatalogAudienceFilter,
  WorkspacePodcastCatalogContactFilter,
  WorkspacePodcastCatalogSort,
} from '@/services/workspacePodcastCatalog'

export const CATALOG_PAGE_SIZES = [24, 48] as const

export interface PodcastCatalogParams {
  search: string
  category: string
  contact: WorkspacePodcastCatalogContactFilter
  activity: WorkspacePodcastCatalogActivityFilter
  audience: WorkspacePodcastCatalogAudienceFilter
  /** A language code such as "en", or 'all'. */
  language: string
  /** A region code such as "us", or 'all'. */
  region: string
  sort: WorkspacePodcastCatalogSort
  page: number
  pageSize: number
}

/*
 * Untouched, the email filter shows shows somebody can actually be pitched:
 * a first page full of "No email" rows is a page with nothing to do on it. The
 * filter says so as a removable chip, so nobody wonders where the rest went.
 * Best fit leads with shows a client can book rather than the biggest ones.
 */
export const DEFAULT_CATALOG_PARAMS: PodcastCatalogParams = {
  search: '',
  category: 'all',
  contact: 'any',
  activity: 'active',
  audience: 'all',
  language: 'all',
  region: 'all',
  sort: 'best_fit',
  page: 1,
  pageSize: 24,
}

/** Everything that narrows the catalogue, cleared at once. Sort and page size are not filters. */
export const CLEAR_ALL_FILTERS: Partial<PodcastCatalogParams> = {
  search: '',
  category: 'all',
  contact: 'all',
  activity: DEFAULT_CATALOG_PARAMS.activity,
  audience: 'all',
  language: 'all',
  region: 'all',
}

const CONTACTS = new Set<string>(['all', 'any', 'free', 'direct', 'none'])
const ACTIVITIES = new Set<string>(['active', 'last_30_days', 'last_90_days', 'last_180_days', 'last_year', 'all'])
const AUDIENCES = new Set<string>(['all', 'under_10k', '10k_50k', '50k_250k', '250k_1m', '1m_plus'])
const SORTS = new Set<string>(['best_fit', 'relevance', 'audience', 'name', 'recent', 'community', 'rating', 'reach'])
const LOCALE_CODE = /^[a-z]{2,3}(?:-[a-z0-9]{2,8})?$/u

// Address names are short and stable; the client parameter belongs to the header.
const KEYS: Record<keyof PodcastCatalogParams, string> = {
  search: 'q',
  category: 'category',
  contact: 'email',
  activity: 'activity',
  audience: 'audience',
  language: 'lang',
  region: 'region',
  sort: 'sort',
  page: 'page',
  pageSize: 'size',
}

function localeCode(value: string | null): string {
  const code = (value || '').trim().toLowerCase()
  return LOCALE_CODE.test(code) ? code : 'all'
}

function choice<T extends string>(value: string | null, allowed: Set<string>, fallback: T): T {
  return value !== null && allowed.has(value) ? value as T : fallback
}

export function readCatalogParams(params: URLSearchParams): PodcastCatalogParams {
  const page = Number.parseInt(params.get(KEYS.page) || '', 10)
  const size = Number.parseInt(params.get(KEYS.pageSize) || '', 10)
  const search = (params.get(KEYS.search) || '').slice(0, 120)
  const sort = choice(params.get(KEYS.sort), SORTS, DEFAULT_CATALOG_PARAMS.sort)
  return {
    search,
    category: (params.get(KEYS.category) || '').slice(0, 200) || 'all',
    contact: choice(params.get(KEYS.contact), CONTACTS, DEFAULT_CATALOG_PARAMS.contact),
    activity: choice(params.get(KEYS.activity), ACTIVITIES, DEFAULT_CATALOG_PARAMS.activity),
    audience: choice(params.get(KEYS.audience), AUDIENCES, DEFAULT_CATALOG_PARAMS.audience),
    language: localeCode(params.get(KEYS.language)),
    region: localeCode(params.get(KEYS.region)),
    // Relevance ranks a search; with nothing searched it means the default.
    sort: sort === 'relevance' && !search ? DEFAULT_CATALOG_PARAMS.sort : sort,
    page: Number.isSafeInteger(page) && page >= 1 && page <= 10_000 ? page : 1,
    pageSize: (CATALOG_PAGE_SIZES as readonly number[]).includes(size) ? size : DEFAULT_CATALOG_PARAMS.pageSize,
  }
}

/*
 * Starting a search switches the default sort to Relevance, so the closest
 * matches lead; ending one switches Relevance back. A sort somebody picked on
 * purpose is left alone either way.
 */
export function withSearchSort(current: PodcastCatalogParams, merged: PodcastCatalogParams, patch: Partial<PodcastCatalogParams>): PodcastCatalogParams {
  if ('sort' in patch) return merged
  if (merged.search && !current.search && merged.sort === DEFAULT_CATALOG_PARAMS.sort) {
    return { ...merged, sort: 'relevance' }
  }
  if (!merged.search && merged.sort === 'relevance') {
    return { ...merged, sort: DEFAULT_CATALOG_PARAMS.sort }
  }
  return merged
}

/*
 * Filters, sort, page and page size live in the address, so a filtered view
 * survives a refresh and can be sent to someone. Defaults are left out, so a
 * plain visit has a plain address. Anything that changes what matches goes
 * back to page 1.
 */
export function usePodcastCatalogParams() {
  const [searchParams, setSearchParams] = useSearchParams()
  const params = useMemo(() => readCatalogParams(searchParams), [searchParams])

  const update = useCallback((patch: Partial<PodcastCatalogParams>, options: { replace?: boolean } = {}) => {
    setSearchParams((current) => {
      const next = new URLSearchParams(current)
      const before = readCatalogParams(current)
      const merged = withSearchSort(before, { ...before, ...patch }, patch)
      if (!('page' in patch)) merged.page = 1
      ;(Object.keys(KEYS) as Array<keyof PodcastCatalogParams>).forEach((field) => {
        const value = merged[field]
        if (value === DEFAULT_CATALOG_PARAMS[field] || value === '') next.delete(KEYS[field])
        else next.set(KEYS[field], String(value))
      })
      return next
    }, { replace: options.replace })
  }, [setSearchParams])

  return { params, update }
}
