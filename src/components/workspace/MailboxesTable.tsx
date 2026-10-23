import type { ReactNode } from 'react'
import { AlertCircle } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { useMailboxActions } from '@/hooks/useMailboxActions'
import { useMailboxList } from '@/hooks/useMailboxList'
import type { WorkspaceClient } from '@/services/clients'
import type { WorkspaceMailboxesResponse } from '@/services/workspaceCampaigns'
import { MailboxBulkBar } from './mailboxes/MailboxBulkBar'
import { MailboxesHeader } from './mailboxes/MailboxesHeader'
import { MailboxListBody } from './mailboxes/MailboxListBody'
import { MailboxPager } from './mailboxes/MailboxPager'
import { MailboxSummary } from './mailboxes/MailboxSummary'
import { MailboxTableHead } from './mailboxes/MailboxTableHead'

/**
 * Every sending mailbox, worst first, and who it sends for.
 *
 * What an operator comes here to find is the broken mailbox and whose
 * outreach it just stopped, so every row is judged by one derived status
 * (see lib/mailboxView), raw provider errors are reduced to a label and a
 * hint (lib/mailboxErrors), and the counts at the top are the filters.
 */

interface MailboxesTableProps {
  workspaceId: string
  data?: WorkspaceMailboxesResponse
  loading: boolean
  /** A refetch in flight with data already on screen. */
  refreshing?: boolean
  error: Error | null
  onRetry: () => void
  canManage: boolean
  clients: WorkspaceClient[]
  /**
   * Whether the client list actually loaded. Without these, a failed load
   * arrived as clients=[] and every row silently lost its client picker,
   * indistinguishable from a workspace with no clients.
   */
  clientsError: Error | null
  onRetryClients: () => void
}

const Notice = ({ children }: { children: ReactNode }) => (
  <div role="status" className="flex items-start gap-2 border-b border-amber-200 bg-amber-50 px-5 py-3 text-xs leading-5 text-amber-900">
    <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
    <span>{children}</span>
  </div>
)

export const MailboxesTable = ({
  workspaceId,
  data,
  loading,
  refreshing = false,
  error,
  onRetry,
  canManage,
  clients,
  clientsError,
  onRetryClients,
}: MailboxesTableProps) => {
  const allAccounts = data?.accounts ?? []
  const list = useMailboxList(allAccounts)
  // A mailbox an action succeeded for leaves the selection, so the next bulk
  // action cannot reach it by accident after it moves out of view.
  const actions = useMailboxActions(workspaceId, { onDone: (emails) => list.setMany(emails, false) })
  const connected = Boolean(data?.connected)
  const showRows = connected && !loading

  return (
    <Card className="shadow-none">
      <MailboxesHeader data={data} loading={loading} syncing={loading || refreshing} list={list} onRetry={onRetry} />

      {error && !loading && (
        <div role="alert" className="flex flex-wrap items-center gap-3 border-b border-red-200 bg-red-50 px-5 py-3 text-sm text-red-900">
          <AlertCircle className="h-4 w-4 shrink-0" />
          <div className="min-w-0 flex-1">
            <h2 className="font-semibold">Mailbox data unavailable</h2>
            <p className="text-xs">{error.message}{data ? ' Showing the last synced list.' : ''}</p>
          </div>
          <Button type="button" variant="outline" size="sm" className="h-8 bg-background" onClick={onRetry}>Retry</Button>
        </div>
      )}

      {clientsError && !loading && (
        <Notice>
          Clients could not be loaded, so mailboxes cannot be connected to one right now: {clientsError.message}{' '}
          <button type="button" className="font-semibold underline underline-offset-2" onClick={onRetryClients}>Try again</button>
        </Notice>
      )}

      {data?.analytics_errors?.length ? (
        <Notice>
          Account details are current, but some analytics could not be refreshed:{' '}
          {data.analytics_errors.join(' ')} Sending and warmup figures below may be incomplete.
        </Notice>
      ) : null}

      {showRows && allAccounts.length > 0 && (
        <MailboxSummary
          sentToday={list.stats.sentToday}
          capacity={list.stats.capacity}
          timeZone={data?.send_day_timezone}
          problemCount={list.stats.problemCount}
          unassignedCount={list.stats.unassignedCount}
          filter={list.filter}
          onFilterChange={list.setFilter}
        />
      )}

      {list.selectedAccounts.length > 0 && (
        <MailboxBulkBar
          selected={list.selectedAccounts}
          visibleCount={list.visibleRows.length}
          allVisibleSelected={list.allVisibleSelected}
          matchingCount={list.filtered.length}
          onSelectAllMatching={list.selectAllMatching}
          onClear={list.clearSelection}
          canManage={canManage}
          clients={clients}
          clientsError={clientsError}
          actions={actions}
        />
      )}

      <CardContent className="p-0">
        <table aria-label="Mailbox accounts" className="w-full table-fixed caption-bottom text-sm">
          <caption className="sr-only">Sending volume, warmup activity, status, and client assignment by mailbox.</caption>
          <MailboxTableHead
            sort={list.sort}
            onSort={list.toggleSort}
            allSelected={list.allVisibleSelected}
            someSelected={list.someVisibleSelected}
            onSelectAll={(on) => list.setMany(list.visibleRows.map((account) => account.email), on)}
            selectDisabled={!showRows || list.visibleRows.length === 0}
          />
          <MailboxListBody
            data={data}
            loading={loading}
            error={error}
            list={list}
            canManage={canManage}
            clients={clients}
            clientsError={clientsError}
            actions={actions}
          />
        </table>
        {showRows && list.groupBy === 'none' && list.filtered.length > 0 && (
          <div className="border-t">
            <MailboxPager
              total={list.filtered.length}
              page={list.page}
              pageCount={list.pageCount}
              pageSize={list.pageSize}
              onPageChange={list.setPage}
              onPageSizeChange={list.setPageSize}
            />
          </div>
        )}
      </CardContent>
    </Card>
  )
}
