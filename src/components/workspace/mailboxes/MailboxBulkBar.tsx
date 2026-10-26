import { ChevronDown, Copy, Pause, Play, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { DropdownMenu, DropdownMenuContent, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import type { WorkspaceClient } from '@/services/clients'
import type { WorkspaceMailboxAccount } from '@/services/workspaceCampaigns'
import { ClientPickItems, type MailboxActions } from './MailboxMenus'

interface MailboxBulkBarProps {
  selected: WorkspaceMailboxAccount[]
  /** Rows the header checkbox covers (this page, or the open groups). */
  visibleCount: number
  allVisibleSelected: boolean
  matchingCount: number
  onSelectAllMatching: () => void
  onClear: () => void
  canManage: boolean
  clients: WorkspaceClient[]
  clientsError: Error | null
  actions: MailboxActions
}

export const MailboxBulkBar = ({
  selected,
  visibleCount,
  allVisibleSelected,
  matchingCount,
  onSelectAllMatching,
  onClear,
  canManage,
  clients,
  clientsError,
  actions,
}: MailboxBulkBarProps) => {
  const emails = selected.map((account) => account.email)
  const allMatching = selected.length >= matchingCount
  return (
    <div role="region" aria-label="Bulk actions" className="flex flex-wrap items-center gap-2 border-b bg-primary/5 px-5 py-2">
      <span className="mr-1 text-sm font-semibold tabular-nums">{selected.length.toLocaleString()} selected</span>
      {canManage && (
        <>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button type="button" variant="outline" size="sm" className="h-8 bg-background" disabled={actions.busy}>
                Assign to clients<ChevronDown className="ml-1 h-3.5 w-3.5" aria-hidden="true" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="max-h-80 w-56 overflow-y-auto">
              <ClientPickItems
                clients={clients}
                clientsError={clientsError}
                onApply={(picked) => actions.assign(selected, picked)}
              />
            </DropdownMenuContent>
          </DropdownMenu>
          <Button type="button" variant="outline" size="sm" className="h-8 bg-background" disabled={actions.busy} onClick={() => actions.setPaused(selected, true)}>
            <Pause className="mr-1.5 h-3.5 w-3.5" aria-hidden="true" />Pause
          </Button>
          <Button type="button" variant="outline" size="sm" className="h-8 bg-background" disabled={actions.busy} onClick={() => actions.setPaused(selected, false)}>
            <Play className="mr-1.5 h-3.5 w-3.5" aria-hidden="true" />Resume
          </Button>
          {/* TODO(mailboxes): Reconnect. Instantly's API has no endpoint to
              re-run a mailbox's OAuth, so there is nothing to call yet. */}
        </>
      )}
      <Button type="button" variant="outline" size="sm" className="h-8 bg-background" onClick={() => void actions.copyEmails(emails)}>
        <Copy className="mr-1.5 h-3.5 w-3.5" aria-hidden="true" />Copy emails
      </Button>
      <Button type="button" variant="ghost" size="sm" className="h-8 text-muted-foreground" onClick={onClear}>
        <X className="mr-1 h-3.5 w-3.5" aria-hidden="true" />Clear selection
      </Button>
      {allVisibleSelected && matchingCount > visibleCount && (
        <p className="basis-full text-xs text-muted-foreground sm:ml-auto sm:basis-auto">
          {allMatching
            ? `All ${matchingCount.toLocaleString()} matching mailboxes are selected.`
            : `All ${visibleCount.toLocaleString()} shown are selected. `}
          {!allMatching && (
            <button type="button" onClick={onSelectAllMatching} className="font-semibold text-primary underline underline-offset-2">
              Select all {matchingCount.toLocaleString()} matching
            </button>
          )}
        </p>
      )}
    </div>
  )
}
