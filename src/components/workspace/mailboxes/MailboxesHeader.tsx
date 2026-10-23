import { useEffect, useState } from 'react'
import { RefreshCw } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import type { MailboxListState } from '@/hooks/useMailboxList'
import { formatRelativeTime, type MailboxFilter, type MailboxGroupBy } from '@/lib/mailboxView'
import type { WorkspaceMailboxesResponse } from '@/services/workspaceCampaigns'

/** Re-renders every 30 seconds so "Synced 2 min ago" does not freeze. */
const useNow = () => {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 30_000)
    return () => window.clearInterval(timer)
  }, [])
  return now
}

interface MailboxesHeaderProps {
  data?: WorkspaceMailboxesResponse
  loading: boolean
  syncing: boolean
  list: MailboxListState
  onRetry: () => void
}

/** Title, count, sync status and Refresh, then search, filter and grouping. */
export const MailboxesHeader = ({ data, loading, syncing, list, onRetry }: MailboxesHeaderProps) => {
  const now = useNow()
  const connected = Boolean(data?.connected)
  const allAccounts = data?.accounts ?? []
  const syncedAgo = formatRelativeTime(data?.last_synced_at, now)
  const filtering = list.filter !== 'all' || list.search.trim() !== ''
  return (
    <CardHeader className="space-y-3 rounded-t-lg border-b border-border/70 bg-muted/20 px-4 py-4 sm:px-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <CardTitle className="flex items-center gap-2 text-lg">
            Sending accounts
            <Badge variant="outline" className="bg-background font-medium text-muted-foreground">
              {loading
                ? 'Loading'
                : !data
                  ? 'Unavailable'
                  : !connected
                    ? 'Not connected'
                    : filtering
                      ? `${list.filtered.length.toLocaleString()} of ${allAccounts.length.toLocaleString()}`
                      : `${allAccounts.length.toLocaleString()} mailboxes`}
            </Badge>
          </CardTitle>
          <CardDescription className="mt-1">Daily sends, warmup activity, and health for every mailbox.</CardDescription>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {/* Parse-checked: an unparseable timestamp said "Invalid Date". */}
          {syncedAgo && (
            <span data-testid="mailbox-sync-status" className="text-xs text-muted-foreground" title={data?.last_synced_at ?? undefined}>
              Synced {syncedAgo} · Instantly{data?.provider_workspace_name ? ` / ${data.provider_workspace_name}` : ''}
            </span>
          )}
          <Button type="button" variant="outline" size="sm" className="h-8 bg-background" onClick={onRetry} disabled={syncing} aria-busy={syncing}>
            <RefreshCw className={`mr-2 h-3.5 w-3.5 ${syncing ? 'animate-spin' : ''}`} aria-hidden="true" />
            {syncing ? 'Syncing' : 'Refresh'}
          </Button>
        </div>
      </div>
      {connected && (
        <div className="flex flex-wrap items-center gap-2">
          <Input
            type="search"
            value={list.search}
            onChange={(event) => list.setSearch(event.target.value)}
            placeholder="Search email, batch or client"
            aria-label="Search mailboxes"
            className="h-8 w-full bg-background sm:w-64"
          />
          <Select value={list.filter} onValueChange={(value) => list.setFilter(value as MailboxFilter)}>
            <SelectTrigger aria-label="Filter mailboxes" className="h-8 w-56 bg-background"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All mailboxes</SelectItem>
              <SelectItem value="attention">Needs attention{list.stats.problemCount ? ` (${list.stats.problemCount})` : ''}</SelectItem>
              <SelectItem value="sending">Sending</SelectItem>
              <SelectItem value="unassigned">No client{list.stats.unassignedCount ? ` (${list.stats.unassignedCount})` : ''}</SelectItem>
            </SelectContent>
          </Select>
          <Select value={list.groupBy} onValueChange={(value) => list.setGroupBy(value as MailboxGroupBy)}>
            <SelectTrigger aria-label="Group mailboxes" className="h-8 w-44 bg-background">
              <span className="text-muted-foreground">Group:</span><SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="none">None</SelectItem>
              <SelectItem value="error">Error type</SelectItem>
              <SelectItem value="client">Client</SelectItem>
              <SelectItem value="batch">Batch tag</SelectItem>
            </SelectContent>
          </Select>
        </div>
      )}
    </CardHeader>  )
}
