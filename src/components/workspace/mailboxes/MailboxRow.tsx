import { useId } from 'react'
import { Badge } from '@/components/ui/badge'
import { Checkbox } from '@/components/ui/checkbox'
import { TableCell, TableRow } from '@/components/ui/table'
import {
  batchLabel,
  cannotSend,
  clientNames,
  effectiveStatus,
  formatWarmup,
  mailboxError,
  sentText,
} from '@/lib/mailboxView'
import type { WorkspaceClient } from '@/services/clients'
import type { WorkspaceMailboxAccount } from '@/services/workspaceCampaigns'
import { ErrorChip, ErrorDetails, SentToday, StatusSummary } from './MailboxCells'
import { MailboxActionsMenu, MailboxClientMenu, type MailboxActions } from './MailboxMenus'

interface MailboxRowProps {
  account: WorkspaceMailboxAccount
  /** Columns visible at this width, for the details row to span. */
  columnCount: number
  selected: boolean
  onSelectedChange: (selected: boolean) => void
  detailsOpen: boolean
  onToggleDetails: () => void
  canManage: boolean
  clients: WorkspaceClient[]
  clientsError: Error | null
  actions: MailboxActions
}

export const MailboxRow = ({
  account,
  columnCount,
  selected,
  onSelectedChange,
  detailsOpen,
  onToggleDetails,
  canManage,
  clients,
  clientsError,
  actions,
}: MailboxRowProps) => {
  const detailsId = useId()
  const status = effectiveStatus(account)
  const error = mailboxError(account)
  const blocked = cannotSend(status)
  const batch = batchLabel(account)
  const names = clientNames(account)
  const warmup = formatWarmup(account)
  // Below xl the Sent today and Warmup columns fold into this line, which
  // then wraps rather than truncating the figures away.
  const meta: Array<{ key: string; text: string; className?: string }> = [
    ...(batch ? [{ key: 'batch', text: (account.tags?.length ?? 0) > 1 ? `${batch} +${account.tags.length - 1}` : batch }] : []),
    { key: 'client', text: names.length ? names.join(', ') : 'Unassigned' },
    { key: 'sent', text: `Sent ${sentText(account)}`, className: 'xl:hidden' },
    { key: 'warmup', text: `Warmup ${warmup}`, className: 'xl:hidden' },
  ]

  return (
    <>
      <TableRow data-state={selected ? 'selected' : undefined} className="hover:bg-muted/30 data-[state=selected]:bg-primary/5">
        <TableCell className="w-10 py-3 pl-4 pr-0 align-top">
          <Checkbox className="mt-0.5" checked={selected} onCheckedChange={(checked) => onSelectedChange(checked === true)} aria-label={`Select ${account.email}`} />
        </TableCell>
        <TableCell className="min-w-0 py-3 align-top">
          <div className="flex min-w-0 items-center gap-2">
            <span className="truncate font-semibold text-foreground" title={account.email}>{account.email}</span>
            {error && (
              <ErrorChip kind={error.kind}>{error.label}</ErrorChip>
            )}
            {account.has_signature === false && (
              <Badge variant="outline" className="shrink-0 border-amber-200 bg-amber-50 px-1.5 py-0 text-[10px] font-medium text-amber-800 hover:bg-amber-50">No signature</Badge>
            )}
          </div>
          <p className="mt-0.5 line-clamp-2 text-xs text-muted-foreground xl:line-clamp-none xl:truncate">
            {meta.map((item, index) => (
              <span key={item.key} className={item.className}>
                {index > 0 && <span aria-hidden="true"> · </span>}
                {item.text}
              </span>
            ))}
          </p>
          {error && (
            <div className="mt-0.5 flex min-w-0 items-center gap-2 text-xs">
              <span className="truncate text-red-700/80" title={error.hint}>{error.hint}</span>
              {error.raw && (
                <button
                  type="button"
                  aria-expanded={detailsOpen}
                  aria-controls={detailsOpen ? detailsId : undefined}
                  aria-label={`${detailsOpen ? 'Hide' : 'Show'} error details for ${account.email}`}
                  onClick={onToggleDetails}
                  className="shrink-0 font-medium text-muted-foreground underline underline-offset-2 hover:text-foreground"
                >
                  {detailsOpen ? 'Hide' : 'Details'}
                </button>
              )}
            </div>
          )}
        </TableCell>
        <TableCell className="hidden py-3 align-top xl:table-cell">
          <SentToday account={account} blocked={blocked} />
        </TableCell>
        <TableCell className="hidden py-3 align-top text-xs xl:table-cell">
          <span className={warmup === 'Not warming' ? 'text-muted-foreground' : 'text-foreground'}>{warmup}</span>
        </TableCell>
        <TableCell className="py-3 align-top">
          <StatusSummary account={account} status={status} />
        </TableCell>
        <TableCell className="py-3 align-top">
          <MailboxClientMenu account={account} canManage={canManage} clients={clients} clientsError={clientsError} actions={actions} />
        </TableCell>
        <TableCell className="w-10 py-3 pl-0 pr-4 align-top">
          <MailboxActionsMenu
            account={account}
            canManage={canManage}
            clients={clients}
            clientsError={clientsError}
            actions={actions}
            hasDetails={Boolean(error?.raw)}
            detailsOpen={detailsOpen}
            onToggleDetails={onToggleDetails}
          />
        </TableCell>
      </TableRow>
      {detailsOpen && error?.raw && (
        <TableRow className="bg-muted/20 hover:bg-muted/20">
          <TableCell colSpan={columnCount} className="px-5 pb-3 pt-0">
            <ErrorDetails id={detailsId} raw={error.raw} />
          </TableCell>
        </TableRow>
      )}
    </>
  )
}
