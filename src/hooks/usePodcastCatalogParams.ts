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
  sort: WorkspacePodcastCatalogSort
  page: number
  pageSize: number
}

/*
 * Untouched, the email filter shows shows somebody can actually be pitched:
 * a first page full of "No email" rows is a page with nothing to do on it. The
 * filter says so as a removable chip, so nobody wonders where the rest went.
 */
export const DEFAULT_CATALOG_PARAMS: PodcastCatalogParams = {
  search: '',
  category: 'all',
  contact: 'any',
  activity: 'active',
  audience: 'all',
  sort: 'audience',
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
}

const CONTACTS = new Set<string>(['all', 'any', 'free', 'direct', 'none'])
const ACTIVITIES = new Set<string>(['active', 'last_30_days', 'last_90_days', 'last_180_days', 'last_year', 'all'])
const AUDIENCES = new Set<string>(['all', 'under_10k', '10k_50k', '50k_250k', '250k_plus'])
const SORTS = new Set<string>(['audience', 'name', 'recent', 'community'])

// Address names are short and stable; the client parameter belongs to the header.
const KEYS: Record<keyof PodcastCatalogParams, string> = {
  search: 'q',
  category: 'category',
  contact: 'email',
  activity: 'activity',
  audience: 'audience',
  sort: 'sort',
  page: 'page',
  pageSize: 'size',
}

function choice<T extends string>(value: string | null, allowed: Set<string>, fallback: T): T {
  return value !== null && allowed.has(value) ? value as T : fallback
}

export function readCatalogParams(params: URLSearchParams): PodcastCatalogParams {
  const page = Number.parseInt(params.get(KEYS.page) || '', 10)
  const size = Number.parseInt(params.get(KEYS.pageSize) || '', 10)
  return {
    search: (params.get(KEYS.search) || '').slice(0, 120),
    category: (params.get(KEYS.category) || '').slice(0, 200) || 'all',
    contact: choice(params.get(KEYS.contact), CONTACTS, DEFAULT_CATALOG_PARAMS.contact),
    activity: choice(params.get(KEYS.activity), ACTIVITIES, DEFAULT_CATALOG_PARAMS.activity),
    audience: choice(params.get(KEYS.audience), AUDIENCES, DEFAULT_CATALOG_PARAMS.audience),
    sort: choice(params.get(KEYS.sort), SORTS, DEFAULT_CATALOG_PARAMS.sort),
    page: Number.isSafeInteger(page) && page >= 1 && page <= 10_000 ? page : 1,
    pageSize: (CATALOG_PAGE_SIZES as readonly number[]).includes(size) ? size : DEFAULT_CATALOG_PARAMS.pageSize,
  }
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
      const merged = { ...readCatalogParams(current), ...patch }
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
