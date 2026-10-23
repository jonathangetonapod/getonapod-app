import { useEffect, useMemo, useState } from 'react'
import {
  DEFAULT_MAILBOX_SORT,
  cannotSend,
  effectiveStatus,
  groupMailboxes,
  isUnassigned,
  matchesFilter,
  matchesSearch,
  paginate,
  sortMailboxes,
  type MailboxFilter,
  type MailboxGroupBy,
  type MailboxSort,
  type MailboxSortKey,
} from '@/lib/mailboxView'
import type { WorkspaceMailboxAccount } from '@/services/workspaceCampaigns'

export const DEFAULT_MAILBOX_PAGE_SIZE = 50

/**
 * The view state of the mailbox list: what is filtered, sorted, grouped,
 * paged, selected and expanded, and the rows that follow from it.
 *
 * Changing what matches (filter, search, grouping) clears the selection, so a
 * bulk action can never reach rows the operator can no longer see.
 */
export const useMailboxList = (accounts: WorkspaceMailboxAccount[]) => {
  const [search, setSearchValue] = useState('')
  const [filter, setFilterValue] = useState<MailboxFilter>('all')
  const [groupBy, setGroupByValue] = useState<MailboxGroupBy>('none')
  const [sort, setSort] = useState<MailboxSort>(DEFAULT_MAILBOX_SORT)
  const [page, setPage] = useState(1)
  const [pageSize, setPageSizeValue] = useState(DEFAULT_MAILBOX_PAGE_SIZE)
  const [selected, setSelected] = useState<Set<string>>(() => new Set())
  const [details, setDetails] = useState<Set<string>>(() => new Set())
  // null means "the default": only the first group open. Which group that is
  // gets pinned once, so a refresh that reorders groups by size does not
  // swap the open one under the operator.
  const [openGroups, setOpenGroups] = useState<Set<string> | null>(null)
  const [defaultGroup, setDefaultGroup] = useState<string | null>(null)
  const [groupPages, setGroupPages] = useState<Record<string, number>>({})

  const resetView = () => {
    setPage(1)
    setSelected(new Set())
    setOpenGroups(null)
    setDefaultGroup(null)
    setGroupPages({})
  }

  const filtered = useMemo(() => sortMailboxes(
    accounts.filter((account) => matchesFilter(account, filter) && matchesSearch(account, search)),
    sort,
  ), [accounts, filter, search, sort])
  const groups = useMemo(() => groupMailboxes(filtered, groupBy), [filtered, groupBy])
  const pageInfo = paginate(filtered, page, pageSize)

  const firstGroup = groups[0]?.key ?? null
  useEffect(() => {
    if (defaultGroup === null && firstGroup !== null) setDefaultGroup(firstGroup)
  }, [defaultGroup, firstGroup])
  const openByDefault = defaultGroup ?? firstGroup
  const isGroupOpen = (key: string) => (openGroups ? openGroups.has(key) : key === openByDefault)
  const groupPage = (key: string, groupAccounts: WorkspaceMailboxAccount[]) => (
    paginate(groupAccounts, groupPages[key] ?? 1, pageSize)
  )
  const visibleRows = groupBy === 'none'
    ? pageInfo.items
    : groups.filter((group) => isGroupOpen(group.key)).flatMap((group) => groupPage(group.key, group.accounts).items)

  const setMany = (emails: string[], on: boolean) => setSelected((current) => {
    const next = new Set(current)
    for (const email of emails) {
      if (on) next.add(email)
      else next.delete(email)
    }
    return next
  })
  // Only rows that still match the view: a refresh or an action can move a
  // selected mailbox out of it, and a bulk action must not reach rows the
  // operator can no longer see.
  const selectedAccounts = filtered.filter((account) => selected.has(account.email))
  const allVisibleSelected = visibleRows.length > 0 && visibleRows.every((account) => selected.has(account.email))
  const someVisibleSelected = visibleRows.some((account) => selected.has(account.email))

  const stats = useMemo(() => {
    // Both sums count the SAME accounts (active), so the meter can't read
    // over 100% when a mailbox errs after sending.
    const active = accounts.filter((account) => account.status === 1)
    return {
      problemCount: accounts.filter((account) => cannotSend(effectiveStatus(account))).length,
      unassignedCount: accounts.filter(isUnassigned).length,
      capacity: active.reduce((total, account) => total + (account.daily_limit ?? 0), 0),
      sentToday: active.reduce((total, account) => total + (account.sent_today ?? 0), 0),
    }
  }, [accounts])

  return {
    search,
    setSearch: (value: string) => { setSearchValue(value); resetView() },
    filter,
    setFilter: (value: MailboxFilter) => { setFilterValue(value); resetView() },
    groupBy,
    setGroupBy: (value: MailboxGroupBy) => { setGroupByValue(value); resetView() },
    clearFilters: () => { setSearchValue(''); setFilterValue('all'); resetView() },
    sort,
    toggleSort: (key: MailboxSortKey) => {
      setSort((current) => (current.key === key
        ? { key, direction: current.direction === 'asc' ? 'desc' : 'asc' }
        : { key, direction: key === 'sent' ? 'desc' : 'asc' }))
      setPage(1)
      setGroupPages({})
    },
    page: pageInfo.page,
    pageCount: pageInfo.pageCount,
    setPage,
    pageSize,
    setPageSize: (value: number) => { setPageSizeValue(value); setPage(1); setGroupPages({}) },
    filtered,
    groups,
    pageRows: pageInfo.items,
    visibleRows,
    isGroupOpen,
    toggleGroup: (key: string) => setOpenGroups((current) => {
      const next = new Set(current ?? (openByDefault ? [openByDefault] : []))
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    }),
    groupPage,
    setGroupPage: (key: string, value: number) => setGroupPages((current) => ({ ...current, [key]: value })),
    isSelected: (email: string) => selected.has(email),
    setSelectedOne: (email: string, on: boolean) => setMany([email], on),
    setMany,
    selectAllMatching: () => setMany(filtered.map((account) => account.email), true),
    clearSelection: () => setSelected(new Set()),
    selectedAccounts,
    allVisibleSelected,
    someVisibleSelected,
    detailsOpen: (email: string) => details.has(email),
    toggleDetails: (email: string) => setDetails((current) => {
      const next = new Set(current)
      if (next.has(email)) next.delete(email)
      else next.add(email)
      return next
    }),
    stats,
  }
}

export type MailboxListState = ReturnType<typeof useMailboxList>
