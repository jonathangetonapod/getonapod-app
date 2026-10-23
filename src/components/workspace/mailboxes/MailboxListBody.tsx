import type { ReactNode } from 'react'
import { ChevronRight } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Skeleton } from '@/components/ui/skeleton'
import type { MailboxListState } from '@/hooks/useMailboxList'
import type { WorkspaceClient } from '@/services/clients'
import type { WorkspaceMailboxAccount, WorkspaceMailboxesResponse } from '@/services/workspaceCampaigns'
import type { MailboxActions } from './MailboxMenus'
import { MailboxPager } from './MailboxPager'
import { useMailboxColumnCount } from '@/hooks/useMailboxColumnCount'
import { MailboxRow } from './MailboxRow'

const SKELETON_ROWS = 8

const MessageRow = ({ columnCount, children }: { columnCount: number; children: ReactNode }) => (
  <tbody>
    <tr>
      <td colSpan={columnCount} className="h-52 px-5 text-center">
        <div className="mx-auto max-w-md">{children}</div>
      </td>
    </tr>
  </tbody>
)

/** Same shape and height as a real row, so nothing jumps when data lands. */
const SkeletonRows = () => (
  <tbody aria-label="Loading mailboxes" aria-busy="true">
    {Array.from({ length: SKELETON_ROWS }, (_, index) => (
      <tr key={index} className="border-b">
        <td className="w-10 py-3 pl-4 pr-0 align-top"><Skeleton className="h-4 w-4" /></td>
        <td className="p-4 py-3 align-top">
          <Skeleton className="h-4 w-56 max-w-full" />
          <Skeleton className="mt-2 h-3 w-40 max-w-full" />
        </td>
        <td className="hidden p-4 py-3 align-top xl:table-cell">
          <Skeleton className="h-4 w-14" />
          <Skeleton className="mt-2 h-1.5 w-20" />
          <Skeleton className="mt-1.5 h-4 w-16" />
        </td>
        <td className="hidden p-4 py-3 align-top xl:table-cell"><Skeleton className="h-3 w-24" /></td>
        <td className="p-4 py-3 align-top"><Skeleton className="h-4 w-16" /><Skeleton className="mt-2 h-3 w-8" /></td>
        <td className="p-4 py-3 align-top"><Skeleton className="h-4 w-24" /></td>
        <td className="w-10 py-3 pl-0 pr-4 align-top" />
      </tr>
    ))}
  </tbody>
)

interface MailboxListBodyProps {
  data?: WorkspaceMailboxesResponse
  loading: boolean
  error: Error | null
  list: MailboxListState
  canManage: boolean
  clients: WorkspaceClient[]
  clientsError: Error | null
  actions: MailboxActions
}

export const MailboxListBody = ({ data, loading, error, list, canManage, clients, clientsError, actions }: MailboxListBodyProps) => {
  const columnCount = useMailboxColumnCount()
  if (loading) return <SkeletonRows />
  // The banner above names the failure; with no earlier list there is nothing to show.
  if (!data) {
    return (
      <MessageRow columnCount={columnCount}>
        <p className="text-sm text-muted-foreground">
          {error ? 'No mailbox list to show until a sync succeeds.' : 'The mailboxes for this workspace could not be read.'}
        </p>
      </MessageRow>
    )
  }
  // Only a payload that says connected: false may say disconnected.
  if (!data.connected) {
    return (
      <MessageRow columnCount={columnCount}>
        <h2 className="font-semibold">{data.reason ? 'Instantly declined the connected key' : 'Instantly is not connected'}</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          {data.reason === 'key_rejected'
            ? 'Instantly rejected the saved API key. Reconnect Instantly in Client Campaigns with a current key.'
            : data.reason === 'scope_missing'
              ? 'The saved API key cannot read accounts. Reconnect Instantly with a key that has all scopes enabled.'
              : 'Connect this workspace to load its sending accounts.'}
        </p>
      </MessageRow>
    )
  }
  if (data.accounts.length === 0) {
    return (
      <MessageRow columnCount={columnCount}>
        <h2 className="font-semibold">No mailboxes found</h2>
        <p className="mt-1 text-sm text-muted-foreground">This Instantly workspace has no sending accounts.</p>
      </MessageRow>
    )
  }
  if (list.filtered.length === 0) {
    return (
      <MessageRow columnCount={columnCount}>
        <h2 className="font-semibold">No mailboxes match this view</h2>
        <Button type="button" variant="outline" size="sm" className="mt-3" onClick={list.clearFilters}>Clear filters</Button>
      </MessageRow>
    )
  }

  const renderRows = (accounts: WorkspaceMailboxAccount[]) => accounts.map((account) => (
    <MailboxRow
      key={account.email}
      account={account}
      columnCount={columnCount}
      selected={list.isSelected(account.email)}
      onSelectedChange={(on) => list.setSelectedOne(account.email, on)}
      detailsOpen={list.detailsOpen(account.email)}
      onToggleDetails={() => list.toggleDetails(account.email)}
      canManage={canManage}
      clients={clients}
      clientsError={clientsError}
      actions={actions}
    />
  ))

  if (list.groupBy === 'none') return <tbody className="[&_tr:last-child]:border-0">{renderRows(list.pageRows)}</tbody>

  return (
    <>
      {list.groups.map((group) => {
        const open = list.isGroupOpen(group.key)
        const paged = list.groupPage(group.key, group.accounts)
        const emails = group.accounts.map((account) => account.email)
        const selectedCount = emails.filter((email) => list.isSelected(email)).length
        return (
          <tbody key={group.key}>
            <tr className="border-b bg-muted/30">
              <td className="w-10 py-2 pl-4 pr-0">
                <Checkbox
                  checked={selectedCount === emails.length ? true : selectedCount > 0 ? 'indeterminate' : false}
                  onCheckedChange={(checked) => list.setMany(emails, checked === true)}
                  aria-label={`Select all ${emails.length} in ${group.label}`}
                />
              </td>
              <td colSpan={columnCount - 1} className="py-1 pr-4">
                <button
                  type="button"
                  aria-expanded={open}
                  data-group-toggle
                  onClick={() => list.toggleGroup(group.key)}
                  className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-sm font-semibold hover:bg-muted/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  <ChevronRight className={`h-4 w-4 shrink-0 transition-transform ${open ? 'rotate-90' : ''}`} aria-hidden="true" />
                  <span className="truncate">{group.label}</span>
                  <span className="rounded-full border bg-background px-2 text-xs font-medium tabular-nums text-muted-foreground">{group.accounts.length.toLocaleString()}</span>
                </button>
              </td>
            </tr>
            {open && renderRows(paged.items)}
            {open && paged.pageCount > 1 && (
              <tr className="border-b">
                <td colSpan={columnCount} className="p-0">
                  <MailboxPager
                    total={group.accounts.length}
                    page={paged.page}
                    pageCount={paged.pageCount}
                    pageSize={list.pageSize}
                    onPageChange={(page) => list.setGroupPage(group.key, page)}
                    label={`in ${group.label}`}
                  />
                </td>
              </tr>
            )}
          </tbody>
        )
      })}
    </>
  )
}
