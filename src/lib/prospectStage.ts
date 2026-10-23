import type { WorkspaceProspect } from '@/services/prospectDashboards'

/*
 * Where a prospect is, kept apart from whether they have looked.
 *
 * The server's lifecycle_status mixes the two: a view turns 'ready' into
 * 'viewed', so a viewed prospect stopped looking live, and filters built on it
 * overlapped (Viewed 17 + Live 16 out of 26). Stage here is exactly one of
 * three, read from publication and readiness; engagement is the view count
 * and when the last view was, shown as text.
 */

export type ProspectStage = 'draft' | 'needs_review' | 'live'

export type ProspectListFilter =
  | 'all'
  | 'draft'
  | 'needs_review'
  | 'live_not_viewed'
  | 'live_viewed'
  | 'live'
  | 'call_booked'
  | 'won'
  | 'lost'

export type ProspectSort = 'last_activity' | 'last_viewed' | 'views' | 'name' | 'created'

/** The minimum a dashboard needs before it can be published. */
export const MIN_SHORTLIST = 5

export const PROSPECT_FILTERS: Array<{ value: ProspectListFilter; label: string }> = [
  { value: 'all', label: 'All' },
  { value: 'draft', label: 'Drafts' },
  { value: 'needs_review', label: 'Needs review' },
  { value: 'live_not_viewed', label: 'Live, not viewed' },
  { value: 'live_viewed', label: 'Live, viewed' },
]

/*
 * Outcome filters are a second group: Call booked overlaps the stage buckets
 * (a booked prospect is still live), while Won and Lost are closed and leave
 * All and the stage buckets so the default list is the open work.
 */
export const OUTCOME_FILTERS: Array<{ value: Extract<ProspectListFilter, 'call_booked' | 'won' | 'lost'>; label: string }> = [
  { value: 'call_booked', label: 'Call booked' },
  { value: 'won', label: 'Won' },
  { value: 'lost', label: 'Lost' },
]

export const PROSPECT_SORTS: Array<{ value: ProspectSort; label: string }> = [
  { value: 'last_activity', label: 'Last activity' },
  { value: 'last_viewed', label: 'Last viewed' },
  { value: 'views', label: 'Views' },
  { value: 'name', label: 'Name' },
  { value: 'created', label: 'Created' },
]

const FILTER_VALUES = new Set<string>([
  ...PROSPECT_FILTERS.map((filter) => filter.value),
  ...OUTCOME_FILTERS.map((filter) => filter.value),
  'live',
])
const SORT_VALUES = new Set<string>(PROSPECT_SORTS.map((sort) => sort.value))

export function parseProspectFilter(value: string | null): ProspectListFilter {
  return value && FILTER_VALUES.has(value) ? value as ProspectListFilter : 'all'
}

export function parseProspectSort(value: string | null): ProspectSort | null {
  return value && SORT_VALUES.has(value) ? value as ProspectSort : null
}

export function prospectStage(prospect: WorkspaceProspect): ProspectStage {
  if (prospect.published_at) return 'live'
  return prospect.readiness.publishable ? 'needs_review' : 'draft'
}

export function stageLabel(stage: ProspectStage): string {
  return { draft: 'Draft', needs_review: 'Needs review', live: 'Live' }[stage]
}

export function stageClass(stage: ProspectStage): string {
  if (stage === 'live') return 'border-emerald-200 bg-emerald-50 text-emerald-700'
  if (stage === 'needs_review') return 'border-amber-200 bg-amber-50 text-amber-700'
  return 'border-slate-200 bg-slate-50 text-slate-600'
}

/** Won or lost: out of the default list, still under its own filter. */
export function isClosed(prospect: WorkspaceProspect): boolean {
  return prospect.outcome === 'won' || prospect.outcome === 'lost'
}

export function outcomeLabel(outcome: WorkspaceProspect['outcome']): string {
  if (outcome === 'call_booked') return 'Call booked'
  if (outcome === 'won') return 'Won'
  if (outcome === 'lost') return 'Lost'
  return ''
}

export function outcomeClass(outcome: WorkspaceProspect['outcome']): string {
  if (outcome === 'won') return 'border-emerald-300 bg-emerald-100 text-emerald-800'
  if (outcome === 'lost') return 'border-slate-200 bg-slate-100 text-slate-600'
  if (outcome === 'call_booked') return 'border-blue-200 bg-blue-50 text-blue-700'
  return ''
}

export function wasViewed(prospect: WorkspaceProspect): boolean {
  return (prospect.view_count || 0) > 0
}

/** For an open prospect, exactly one of the four non-overlapping buckets, so the counts sum to All. */
export function prospectBucket(prospect: WorkspaceProspect): 'draft' | 'needs_review' | 'live_not_viewed' | 'live_viewed' {
  const stage = prospectStage(prospect)
  if (stage !== 'live') return stage
  return wasViewed(prospect) ? 'live_viewed' : 'live_not_viewed'
}

export function prospectMatchesFilter(prospect: WorkspaceProspect, filter: ProspectListFilter): boolean {
  if (filter === 'call_booked' || filter === 'won' || filter === 'lost') return prospect.outcome === filter
  if (isClosed(prospect)) return false
  if (filter === 'all') return true
  if (filter === 'live') return prospectStage(prospect) === 'live'
  return prospectBucket(prospect) === filter
}

export function prospectFilterCounts(prospects: WorkspaceProspect[]): Record<ProspectListFilter, number> {
  const counts: Record<ProspectListFilter, number> = {
    all: 0,
    draft: 0,
    needs_review: 0,
    live_not_viewed: 0,
    live_viewed: 0,
    live: 0,
    call_booked: 0,
    won: 0,
    lost: 0,
  }
  for (const prospect of prospects) {
    if (prospect.outcome) counts[prospect.outcome] += 1
    if (isClosed(prospect)) continue
    counts.all += 1
    counts[prospectBucket(prospect)] += 1
  }
  counts.live = counts.live_not_viewed + counts.live_viewed
  return counts
}

/** "2d ago", "5h ago", "just now". */
export function relativeTime(value: string | null, now = Date.now()): string {
  if (!value) return ''
  const then = Date.parse(value)
  if (Number.isNaN(then)) return ''
  const minutes = Math.max(0, Math.round((now - then) / 60_000))
  if (minutes < 1) return 'just now'
  if (minutes < 60) return `${minutes}m ago`
  const hours = Math.round(minutes / 60)
  if (hours < 24) return `${hours}h ago`
  const days = Math.round(hours / 24)
  if (days < 14) return `${days}d ago`
  const weeks = Math.round(days / 7)
  if (days < 60) return `${weeks}w ago`
  return `${Math.round(days / 30)}mo ago`
}

/** "Viewed 42x, last 2d ago", or "Not viewed yet". */
export function engagementText(prospect: WorkspaceProspect, now = Date.now()): string {
  if (!wasViewed(prospect)) return 'Not viewed yet'
  const last = relativeTime(prospect.last_viewed_at, now)
  return `Viewed ${prospect.view_count}x${last ? `, last ${last}` : ''}`
}

/** What a dashboard still lacks, in the readiness checklist's order. */
export function missingItems(prospect: WorkspaceProspect): string[] {
  const readiness = prospect.readiness
  const missing: string[] = []
  if (!prospect.prospect_title?.trim()) missing.push('title')
  if (!readiness.profile_ready) missing.push('bio')
  if (readiness.visible_count < MIN_SHORTLIST) missing.push('shortlist')
  else if (readiness.analyzed_count < MIN_SHORTLIST) missing.push('fit explanations')
  if (!readiness.cta_ready) missing.push('next step')
  return missing
}

export function readinessPercent(prospect: WorkspaceProspect): number {
  const readiness = prospect.readiness
  return Math.round(([
    readiness.profile_ready,
    readiness.visible_count >= MIN_SHORTLIST,
    readiness.analyzed_count >= MIN_SHORTLIST,
    readiness.cta_ready,
  ].filter(Boolean).length / 4) * 100)
}

/** The later of the last edit and the last view. */
export function lastActivityAt(prospect: WorkspaceProspect): number {
  const updated = Date.parse(prospect.updated_at) || 0
  const viewed = prospect.last_viewed_at ? Date.parse(prospect.last_viewed_at) || 0 : 0
  return Math.max(updated, viewed)
}

export function compareProspects(sort: ProspectSort) {
  const time = (value: string | null) => (value ? Date.parse(value) || 0 : 0)
  return (left: WorkspaceProspect, right: WorkspaceProspect): number => {
    let order = 0
    if (sort === 'last_activity') order = lastActivityAt(right) - lastActivityAt(left)
    else if (sort === 'last_viewed') order = time(right.last_viewed_at) - time(left.last_viewed_at)
    else if (sort === 'views') order = (right.view_count || 0) - (left.view_count || 0)
    else if (sort === 'name') order = left.prospect_name.localeCompare(right.prospect_name)
    else if (sort === 'created') order = time(right.created_at) - time(left.created_at)
    return order || left.prospect_name.localeCompare(right.prospect_name) || left.id.localeCompare(right.id)
  }
}

/** Lowercased, with punctuation and runs of space removed, for duplicate checks. */
export function normalizeProspectName(value: string): string {
  return value.toLowerCase().normalize('NFKD').replace(/[^\p{L}\p{N}]+/gu, '')
}

/** An existing prospect with the same name, or the same email when one is given. */
export function findDuplicateProspect(
  prospects: WorkspaceProspect[],
  name: string,
  email: string,
): WorkspaceProspect | null {
  const normalizedName = normalizeProspectName(name)
  const normalizedEmail = email.trim().toLowerCase()
  return prospects.find((prospect) => (
    (normalizedName && normalizeProspectName(prospect.prospect_name) === normalizedName)
    || (normalizedEmail && prospect.prospect_email?.trim().toLowerCase() === normalizedEmail)
  )) ?? null
}
