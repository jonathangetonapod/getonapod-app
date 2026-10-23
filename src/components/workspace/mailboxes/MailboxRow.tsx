import { Fragment } from 'react'
import { Badge } from '@/components/ui/badge'
import { Checkbox } from '@/components/ui/checkbox'
import { TableCell, TableRow } from '@/components/ui/table'
import { linkifyText } from '@/lib/mailboxErrors'
import {
  batchLabel,
  cannotSend,
  clientNames,
  effectiveStatus,
  formatWarmup,
  healthScore,
  mailboxError,
  sendDataPoints,
  statusLabel,
  type EffectiveStatus,
} from '@/lib/mailboxView'
import type { WorkspaceClient } from '@/services/clients'
import type { WorkspaceMailboxAccount } from '@/services/workspaceCampaigns'
import { MailboxActionsMenu, MailboxClientMenu, type MailboxActions } from './MailboxMenus'

export const MAILBOX_COLUMN_COUNT = 7

const DOT: Record<EffectiveStatus, string> = {
  error: 'bg-red-500',
  disconnected: 'bg-orange-500',
  paused: 'bg-amber-400',
  warming: 'bg-sky-500',
  healthy: 'bg-emerald-500',
}

const ERROR_CHIP = {
  error: 'border-red-200 bg-red-50 text-red-700 hover:bg-red-50',
  disconnected: 'border-orange-200 bg-orange-50 text-orange-800 hover:bg-orange-50',
}

const SPARK_HEIGHT = 16

const Sparkline = ({ account }: { account: WorkspaceMailboxAccount }) => {
  if (sendDataPoints(account) < 2) return null
  const history = account.send_history ?? []
  const peak = Math.max(...history.map((day) => day.sent), 1)
  const total = history.reduce((sum, day) => sum + day.sent, 0)
  return (
    <span
      className="mt-1.5 flex h-4 items-end gap-[3px]"
      title={history.map((day) => `${day.date}: ${day.sent}`).join('\n')}
      aria-label={`${total} sent over the last ${history.length} days`}
      role="img"
    >
      {history.map((day) => (
        <span
          key={day.date}
          className={`w-1.5 rounded-sm ${day.sent > 0 ? 'bg-primary/60' : 'bg-muted'}`}
          style={{ height: `${Math.max((day.sent / peak) * SPARK_HEIGHT, 2)}px` }}
        />
      ))}
    </span>
  )
}

function sentText(account: WorkspaceMailboxAccount): string {
  const sent = account.sent_today === null || account.sent_today === undefined ? 'No data' : String(account.sent_today)
  return account.daily_limit ? `${sent} of ${account.daily_limit}` : sent
}

interface MailboxRowProps {
  account: WorkspaceMailboxAccount
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
  selected,
  onSelectedChange,
  detailsOpen,
  onToggleDetails,
  canManage,
  clients,
  clientsError,
  actions,
}: MailboxRowProps) => {
  const status = effectiveStatus(account)
  const error = mailboxError(account)
  const blocked = cannotSend(status)
  const score = healthScore(account)
  const batch = batchLabel(account)
  const names = clientNames(account)
  const detailsId = `mailbox-details-${account.email.replace(/[^a-z0-9]/gi, '-')}`
  const progress = account.daily_limit && typeof account.sent_today === 'number'
    ? Math.min((account.sent_today / account.daily_limit) * 100, 100)
    : 0
  const meta: Array<{ key: string; text: string; className?: string }> = [
    ...(batch ? [{ key: 'batch', text: (account.tags?.length ?? 0) > 1 ? `${batch} +${account.tags.length - 1}` : batch }] : []),
    { key: 'client', text: names.length ? names.join(', ') : 'Unassigned' },
    { key: 'sent', text: `Sent ${sentText(account)}`, className: 'xl:hidden' },
    { key: 'warmup', text: `Warmup ${formatWarmup(account)}`, className: 'xl:hidden' },
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
              <Badge variant="outline" className={`shrink-0 px-2 py-0 text-[10px] font-semibold ${ERROR_CHIP[error.kind]}`}>{error.label}</Badge>
            )}
            {account.has_signature === false && (
              <Badge variant="outline" className="shrink-0 border-amber-200 bg-amber-50 px-1.5 py-0 text-[10px] font-medium text-amber-800 hover:bg-amber-50">No signature</Badge>
            )}
          </div>
          <p className="mt-0.5 truncate text-xs text-muted-foreground">
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
                  aria-controls={detailsId}
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
          <p className="text-sm font-semibold tabular-nums">{sentText(account)}</p>
          <div className="mt-1.5 h-1.5 w-20 overflow-hidden rounded-full bg-muted" aria-hidden="true">
            <div className={`h-full rounded-full ${blocked ? 'bg-muted-foreground/30' : 'bg-primary'}`} style={{ width: `${progress}%` }} />
          </div>
          <Sparkline account={account} />
        </TableCell>
        <TableCell className="hidden py-3 align-top text-xs xl:table-cell">
          <span className={formatWarmup(account) === 'Not warming' ? 'text-muted-foreground' : 'text-foreground'}>{formatWarmup(account)}</span>
        </TableCell>
        <TableCell className="py-3 align-top">
          <div className="flex items-center gap-2">
            <span className={`h-2 w-2 shrink-0 rounded-full ${DOT[status]}`} aria-hidden="true" />
            {blocked
              ? <Badge variant="outline" className={`px-2 py-0 text-[10px] font-semibold ${ERROR_CHIP[status === 'disconnected' ? 'disconnected' : 'error']}`}>{statusLabel(account, status)}</Badge>
              : <span className="text-sm font-medium">{statusLabel(account, status)}</span>}
          </div>
          {/* The warmup score says nothing about a mailbox that cannot send,
              so it is greyed rather than replaced with an invented number. */}
          <p
            className={`mt-1 pl-4 text-xs tabular-nums ${blocked ? 'text-muted-foreground/50' : score !== null && score < 80 ? 'text-amber-700' : 'text-muted-foreground'}`}
            title={blocked ? 'Warmup health score. Not meaningful while this mailbox cannot send.' : 'Warmup health score'}
          >
            {score === null ? 'No score' : <><span className="sr-only">Health </span>{score}%</>}
          </p>
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
          <TableCell colSpan={MAILBOX_COLUMN_COUNT} className="px-5 pb-3 pt-0">
            <p id={detailsId} className="whitespace-pre-wrap break-words rounded-md border bg-background p-3 font-mono text-xs leading-5 text-muted-foreground">
              {linkifyText(error.raw).map((part, index) => (
                <Fragment key={index}>
                  {part.href
                    ? <a href={part.href} target="_blank" rel="noopener noreferrer" className="text-primary underline underline-offset-2">{part.text}</a>
                    : part.text}
                </Fragment>
              ))}
            </p>
          </TableCell>
        </TableRow>
      )}
    </>
  )
}
