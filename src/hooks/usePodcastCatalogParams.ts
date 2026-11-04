import { useCallback, useMemo } from 'react'
import { useSearchParams } from 'react-router-dom'
import type {
  WorkspacePodcastCatalogActivityFilter,
  WorkspacePodcastCatalogAudienceFilter,
  WorkspacePodcastCatalogB2bFitFilter,
  WorkspacePodcastCatalogJunkFilter,
  WorkspacePodcastFormat,
  WorkspacePodcastListener,
  WorkspacePodcastCatalogContactFilter,
  WorkspacePodcastCatalogGuestsFilter,
  WorkspacePodcastCatalogResearchFilter,
  WorkspacePodcastCatalogSort,
} from '@/services/workspacePodcastCatalog'
import { PODCAST_FORMAT_KEYS, PODCAST_LISTENER_KEYS } from '@/lib/podcastTags'

export const CATALOG_PAGE_SIZES = [24, 48] as const

export interface PodcastCatalogParams {
  search: string
  /** Category choices ("business", "health|fitness"); a show in any of them matches. Empty is any category. */
  categories: string[]
  /** Category choices to leave out. */
  excludeCategories: string[]
  /** Words or phrases ("crypto", "true crime"); a show that mentions any of them is left out. */
  excludeTerms: string[]
  /** Jev's B2B fit floor: some, good or strong. */
  b2bFit: WorkspacePodcastCatalogB2bFitFilter
  /** Who listens, as Jev tagged it; a show with any of them matches. */
  listeners: WorkspacePodcastListener[]
  formats: WorkspacePodcastFormat[]
  /** Junk feeds (spam, content farms, audiobook re-uploads) are hidden unless shown. */
  junk: WorkspacePodcastCatalogJunkFilter
  contact: WorkspacePodcastCatalogContactFilter
  activity: WorkspacePodcastCatalogActivityFilter
  audience: WorkspacePodcastCatalogAudienceFilter
  guests: WorkspacePodcastCatalogGuestsFilter
  research: WorkspacePodcastCatalogResearchFilter
  /** A language code such as "en", or 'all'. */
  language: string
  /** A region code such as "us", or 'all'. */
  region: string
  sort: WorkspacePodcastCatalogSort
  page: number
  pageSize: number
}

/*
 * Untouched, the catalogue shows every active show, with or without an email:
 * a show with no public inbox can still be reached through its website or
 * socials, or unlocked. Best fit already ranks shows with an email first, and
 * leads with shows a client can book rather than the biggest ones.
 */
export const DEFAULT_CATALOG_PARAMS: PodcastCatalogParams = {
  search: '',
  categories: [],
  excludeCategories: [],
  excludeTerms: [],
  b2bFit: 'all',
  listeners: [],
  formats: [],
  junk: 'hide',
  contact: 'all',
  activity: 'active',
  audience: 'all',
  guests: 'all',
  research: 'all',
  language: 'all',
  region: 'all',
  sort: 'best_fit',
  page: 1,
  pageSize: 24,
}

/** Everything that narrows the catalogue, cleared at once. Sort and page size are not filters. */
export const CLEAR_ALL_FILTERS: Partial<PodcastCatalogParams> = {
  search: '',
  categories: [],
  excludeCategories: [],
  excludeTerms: [],
  b2bFit: 'all',
  listeners: [],
  formats: [],
  junk: 'hide',
  contact: 'all',
  activity: DEFAULT_CATALOG_PARAMS.activity,
  audience: 'all',
  guests: 'all',
  research: 'all',
  language: 'all',
  region: 'all',
}

const CONTACTS = new Set<string>(['all', 'any', 'verified', 'free', 'direct', 'none'])
const ACTIVITIES = new Set<string>(['active', 'last_30_days', 'last_90_days', 'last_180_days', 'last_year', 'all'])
// 250k_plus is no longer offered, but an address that carries it still means it.
const AUDIENCES = new Set<string>(['all', 'under_10k', '10k_50k', '50k_250k', '250k_1m', '1m_plus', '250k_plus'])
const GUESTS = new Set<string>(['all', 'yes', 'no'])
const RESEARCH = new Set<string>(['all', 'saved', 'not_saved'])
const B2B_FITS = new Set<string>(['all', 'some', 'good', 'strong'])
const JUNK = new Set<string>(['hide', 'show'])
const LISTENERS = new Set<string>(PODCAST_LISTENER_KEYS)
const FORMATS = new Set<string>(PODCAST_FORMAT_KEYS)
const SORTS = new Set<string>(['best_fit', 'relevance', 'audience', 'name', 'recent', 'community', 'rating', 'reach'])
const LOCALE_CODE = /^[a-z]{2,3}(?:-[a-z0-9]{2,8})?$/u
// What the catalogue accepts: 2,000 characters of category codes per list,
// and up to 20 excluded words or phrases in 300 characters.
export const MAX_CATEGORY_CHOICES = 40
export const MAX_EXCLUDE_TERMS = 20
export const MAX_EXCLUDE_TERM_LENGTH = 60

// Address names are short and stable; the client parameter belongs to the header.
const KEYS: Record<keyof PodcastCatalogParams, string> = {
  search: 'q',
  categories: 'category',
  excludeCategories: 'not_category',
  excludeTerms: 'exclude',
  b2bFit: 'fit',
  listeners: 'listeners',
  formats: 'format',
  junk: 'junk',
  contact: 'email',
  activity: 'activity',
  audience: 'audience',
  guests: 'guests',
  research: 'research',
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

/** Relevance while something is searched, so a shared search link opens ranked by match. */
function defaultSort(search: string): WorkspacePodcastCatalogSort {
  return search ? 'relevance' : DEFAULT_CATALOG_PARAMS.sort
}

/*
 * A list in the address is comma-separated: category choices are codes joined
 * by "|" and never hold a comma, and an excluded term is split on commas when
 * typed. An older address with one category ("health|fitness") is a list of one.
 */
function readList(value: string | null, max: number, maxLength: number): string[] {
  const seen = new Set<string>()
  for (const part of (value || '').split(',')) {
    const item = part.trim().toLowerCase().replace(/\s+/gu, ' ').slice(0, maxLength)
    if (item && item !== 'all') seen.add(item)
    if (seen.size >= max) break
  }
  return [...seen]
}

/** Excluded words as typed: comma-separated, trimmed, lower case, no repeats. */
export function parseExcludeTerms(value: string): string[] {
  return readList(value, MAX_EXCLUDE_TERMS, MAX_EXCLUDE_TERM_LENGTH)
}

function serialize(value: PodcastCatalogParams[keyof PodcastCatalogParams]): string {
  return Array.isArray(value) ? value.join(',') : String(value)
}

function choice<T extends string>(value: string | null, allowed: Set<string>, fallback: T): T {
  return value !== null && allowed.has(value) ? value as T : fallback
}

export function readCatalogParams(params: URLSearchParams): PodcastCatalogParams {
  const page = Number.parseInt(params.get(KEYS.page) || '', 10)
  const size = Number.parseInt(params.get(KEYS.pageSize) || '', 10)
  const search = (params.get(KEYS.search) || '').slice(0, 120)
  const sort = choice(params.get(KEYS.sort), SORTS, defaultSort(search))
  return {
    search,
    categories: readList(params.get(KEYS.categories), MAX_CATEGORY_CHOICES, 200),
    excludeCategories: readList(params.get(KEYS.excludeCategories), MAX_CATEGORY_CHOICES, 200),
    excludeTerms: readList(params.get(KEYS.excludeTerms), MAX_EXCLUDE_TERMS, MAX_EXCLUDE_TERM_LENGTH),
    b2bFit: choice(params.get(KEYS.b2bFit), B2B_FITS, DEFAULT_CATALOG_PARAMS.b2bFit),
    listeners: readList(params.get(KEYS.listeners), LISTENERS.size, 20).filter((key) => LISTENERS.has(key)) as WorkspacePodcastListener[],
    formats: readList(params.get(KEYS.formats), FORMATS.size, 20).filter((key) => FORMATS.has(key)) as WorkspacePodcastFormat[],
    junk: choice(params.get(KEYS.junk), JUNK, DEFAULT_CATALOG_PARAMS.junk),
    contact: choice(params.get(KEYS.contact), CONTACTS, DEFAULT_CATALOG_PARAMS.contact),
    activity: choice(params.get(KEYS.activity), ACTIVITIES, DEFAULT_CATALOG_PARAMS.activity),
    audience: choice(params.get(KEYS.audience), AUDIENCES, DEFAULT_CATALOG_PARAMS.audience),
    guests: choice(params.get(KEYS.guests), GUESTS, DEFAULT_CATALOG_PARAMS.guests),
    research: choice(params.get(KEYS.research), RESEARCH, DEFAULT_CATALOG_PARAMS.research),
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
        const value = serialize(merged[field])
        const fallback = field === 'sort' ? defaultSort(merged.search) : serialize(DEFAULT_CATALOG_PARAMS[field])
        if (value === fallback || value === '') next.delete(KEYS[field])
        else next.set(KEYS[field], value)
      })
      return next
    }, { replace: options.replace })
  }, [setSearchParams])

  return { params, update }
}
