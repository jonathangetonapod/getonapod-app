import { humanizeMailboxError, type HumanizedMailboxError } from '@/lib/mailboxErrors'
import type { WorkspaceMailboxAccount } from '@/services/workspaceCampaigns'

/**
 * The one status a mailbox row is judged by.
 *
 * `health_score` is Instantly's warmup reputation score, and it stays at 100%
 * on a mailbox Gmail has stopped accepting mail from. The row used to color
 * its dot from that score alone, so a mailbox that could not send read as the
 * healthiest one on the page. The chip, the dot and the default sort all come
 * from this instead.
 *
 * `paused` is not in the original four: a mailbox paused or in maintenance in
 * Instantly is neither healthy nor broken, and calling it either would be
 * wrong.
 */
export type EffectiveStatus = 'error' | 'disconnected' | 'paused' | 'warming' | 'healthy'

export type MailboxFilter = 'all' | 'attention' | 'sending' | 'unassigned'
export type MailboxGroupBy = 'none' | 'error' | 'client' | 'batch'
export type MailboxSortKey = 'status' | 'health' | 'email' | 'sent' | 'client'

export interface MailboxSort {
  key: MailboxSortKey
  direction: 'asc' | 'desc'
}

export interface MailboxGroup {
  key: string
  label: string
  accounts: WorkspaceMailboxAccount[]
}

export const DEFAULT_MAILBOX_SORT: MailboxSort = { key: 'status', direction: 'asc' }

const STATUS_RANK: Record<EffectiveStatus, number> = {
  error: 0,
  disconnected: 1,
  paused: 2,
  warming: 3,
  healthy: 4,
}

export const STATUS_LABEL: Record<EffectiveStatus, string> = {
  error: 'Error',
  disconnected: 'Disconnected',
  paused: 'Paused',
  warming: 'Warming',
  healthy: 'Healthy',
}

export function mailboxError(account: WorkspaceMailboxAccount): HumanizedMailboxError | null {
  return humanizeMailboxError(account.status, account.status_message)
}

export function effectiveStatus(account: WorkspaceMailboxAccount): EffectiveStatus {
  const error = mailboxError(account)
  if (error) return error.kind === 'disconnected' ? 'disconnected' : 'error'
  if (account.status !== 1) return 'paused'
  // Warming means the only mail going out is warmup: warmup is on and no
  // outreach left the mailbox in the history window. An empty history is an
  // analytics read that failed, which says nothing either way.
  const history = account.send_history ?? []
  if (account.warmup_status === 1 && history.length > 0 && history.every((day) => day.sent === 0)) {
    return 'warming'
  }
  return 'healthy'
}

/** The label for a paused-family status: Instantly separates maintenance from a pause. */
export function statusLabel(account: WorkspaceMailboxAccount, status = effectiveStatus(account)): string {
  if (status !== 'paused') return STATUS_LABEL[status]
  if (account.status === 2) return 'Paused'
  if (account.status === 3) return 'Maintenance'
  return 'Account issue'
}

export function cannotSend(status: EffectiveStatus): boolean {
  return status === 'error' || status === 'disconnected'
}

/**
 * `warmup_emails` is Instantly's warmup total over its reporting window and
 * `warmup_limit` is the per-day warmup target, so "70 of 10" compared two
 * different things. Stated as what each is.
 */
export function formatWarmup(account: WorkspaceMailboxAccount): string {
  if (account.status !== 1 || account.warmup_status !== 1) return 'Not warming'
  const sent = typeof account.warmup_emails === 'number' ? account.warmup_emails : null
  const target = account.warmup_limit ? ` · target ${account.warmup_limit}/day` : ''
  if (sent === null) return `No data yet${target}`
  return `${sent} sent${target}`
}

/** "3 of 20"; with no analytics, says so instead of reading "No data of 20". */
export function sentText(account: WorkspaceMailboxAccount): string {
  if (typeof account.sent_today !== 'number') {
    return account.daily_limit ? `No data, limit ${account.daily_limit}` : 'No data'
  }
  return account.daily_limit ? `${account.sent_today} of ${account.daily_limit}` : String(account.sent_today)
}

export function healthScore(account: WorkspaceMailboxAccount): number | null {
  return typeof account.health_score === 'number' && Number.isFinite(account.health_score)
    ? Math.round(account.health_score)
    : null
}

export function batchLabel(account: WorkspaceMailboxAccount): string | null {
  return account.tags?.[0]?.label || null
}

export function clientNames(account: WorkspaceMailboxAccount): string[] {
  return [...new Set((account.campaigns ?? []).map((link) => link.client_name || 'Unknown client'))]
}

export function isUnassigned(account: WorkspaceMailboxAccount): boolean {
  return (account.campaigns?.length ?? 0) === 0
}

/** Days with sends: a sparkline of zeros is an empty box, not a trend. */
export function sendDataPoints(account: WorkspaceMailboxAccount): number {
  return (account.send_history ?? []).filter((day) => day.sent > 0).length
}

export function matchesFilter(account: WorkspaceMailboxAccount, filter: MailboxFilter): boolean {
  if (filter === 'attention') return cannotSend(effectiveStatus(account))
  if (filter === 'sending') {
    const status = effectiveStatus(account)
    return status === 'healthy' || status === 'warming'
  }
  if (filter === 'unassigned') return isUnassigned(account)
  return true
}

/** Email, every batch tag, and every client name. */
export function matchesSearch(account: WorkspaceMailboxAccount, query: string): boolean {
  const needle = query.trim().toLowerCase()
  if (!needle) return true
  return account.email.toLowerCase().includes(needle)
    || (account.tags ?? []).some((tag) => (tag.label || '').toLowerCase().includes(needle))
    || clientNames(account).some((name) => name.toLowerCase().includes(needle))
}

/**
 * The value a column sorts by, or null for "nothing to sort by", which always
 * goes last whichever way the column is sorted. A mailbox that cannot send
 * has no health worth ranking: its warmup score still reads 100%.
 */
function sortValue(key: MailboxSortKey, account: WorkspaceMailboxAccount): number | string | null {
  if (key === 'email') return account.email
  if (key === 'health') return cannotSend(effectiveStatus(account)) ? null : healthScore(account)
  if (key === 'sent') return typeof account.sent_today === 'number' ? account.sent_today : null
  if (key === 'client') return clientNames(account)[0] ?? null
  return STATUS_RANK[effectiveStatus(account)]
}

function compareNullsLast(left: number | string | null, right: number | string | null, sign: number): number {
  if (left === null || right === null) return left === right ? 0 : left === null ? 1 : -1
  if (typeof left === 'string' || typeof right === 'string') return sign * String(left).localeCompare(String(right))
  return sign * (left - right)
}

/**
 * Within a status, the weakest health first. Ties break on email, so a row
 * does not move under the cursor between loads.
 */
export function sortMailboxes(accounts: WorkspaceMailboxAccount[], sort: MailboxSort): WorkspaceMailboxAccount[] {
  const sign = sort.direction === 'asc' ? 1 : -1
  return [...accounts].sort((left, right) => (
    compareNullsLast(sortValue(sort.key, left), sortValue(sort.key, right), sign)
      || (sort.key === 'status' ? compareNullsLast(sortValue('health', left), sortValue('health', right), 1) : 0)
      || left.email.localeCompare(right.email)
  ))
}

function groupKey(account: WorkspaceMailboxAccount, groupBy: MailboxGroupBy): { key: string; label: string } {
  if (groupBy === 'error') {
    const error = mailboxError(account)
    return error ? { key: `error:${error.label}`, label: error.label } : { key: 'none', label: 'No errors' }
  }
  if (groupBy === 'client') {
    const names = clientNames(account).sort()
    return names.length ? { key: `client:${names.join('|')}`, label: names.join(', ') } : { key: 'none', label: 'Unassigned' }
  }
  const batch = batchLabel(account)
  return batch ? { key: `batch:${batch}`, label: batch } : { key: 'none', label: 'No batch tag' }
}

/**
 * Groups an already filtered and sorted list. Rows keep their order inside a
 * group. Error groups put the biggest problem first; client and batch groups
 * are alphabetical. The catch-all group ("No errors", "Unassigned") is last.
 */
export function groupMailboxes(accounts: WorkspaceMailboxAccount[], groupBy: MailboxGroupBy): MailboxGroup[] {
  if (groupBy === 'none') return [{ key: 'all', label: 'All mailboxes', accounts }]
  const groups = new Map<string, MailboxGroup>()
  for (const account of accounts) {
    const { key, label } = groupKey(account, groupBy)
    const group = groups.get(key) ?? { key, label, accounts: [] }
    group.accounts.push(account)
    groups.set(key, group)
  }
  return [...groups.values()].sort((left, right) => {
    if (left.key === 'none' || right.key === 'none') return Number(left.key === 'none') - Number(right.key === 'none')
    if (groupBy === 'error') return right.accounts.length - left.accounts.length || left.label.localeCompare(right.label)
    return left.label.localeCompare(right.label)
  })
}

export function paginate<T>(items: T[], page: number, pageSize: number): { items: T[]; page: number; pageCount: number } {
  const pageCount = Math.max(Math.ceil(items.length / pageSize), 1)
  const current = Math.min(Math.max(page, 1), pageCount)
  return { items: items.slice((current - 1) * pageSize, current * pageSize), page: current, pageCount }
}

/** "just now", "12 min ago", "3 hr ago", then a date. Null for an unparseable timestamp. */
export function formatRelativeTime(iso: string | null | undefined, now: number = Date.now()): string | null {
  if (!iso) return null
  const then = Date.parse(iso)
  if (!Number.isFinite(then)) return null
  const minutes = Math.floor(Math.max(now - then, 0) / 60_000)
  if (minutes < 1) return 'just now'
  if (minutes < 60) return `${minutes} min ago`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours} hr ago`
  return new Date(then).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
}
