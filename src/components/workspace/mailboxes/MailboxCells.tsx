import { Fragment } from 'react'
import { Badge } from '@/components/ui/badge'
import { linkifyText } from '@/lib/mailboxErrors'
import {
  cannotSend,
  healthScore,
  sendDataPoints,
  sentText,
  statusLabel,
  type EffectiveStatus,
} from '@/lib/mailboxView'
import type { WorkspaceMailboxAccount } from '@/services/workspaceCampaigns'

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

export const ErrorChip = ({ kind, children }: { kind: 'error' | 'disconnected'; children: string }) => (
  <Badge variant="outline" className={`shrink-0 px-2 py-0 text-[10px] font-semibold ${ERROR_CHIP[kind]}`}>{children}</Badge>
)

export const SentToday = ({ account, blocked }: { account: WorkspaceMailboxAccount; blocked: boolean }) => {
  const progress = account.daily_limit && typeof account.sent_today === 'number'
    ? Math.min((account.sent_today / account.daily_limit) * 100, 100)
    : 0
  return (
    <>
      <p className="text-sm font-semibold tabular-nums">{sentText(account)}</p>
      <div className="mt-1.5 h-1.5 w-20 overflow-hidden rounded-full bg-muted" aria-hidden="true">
        <div className={`h-full rounded-full ${blocked ? 'bg-muted-foreground/30' : 'bg-primary'}`} style={{ width: `${progress}%` }} />
      </div>
      <Sparkline account={account} />
    </>
  )
}

export const StatusSummary = ({ account, status }: { account: WorkspaceMailboxAccount; status: EffectiveStatus }) => {
  const blocked = cannotSend(status)
  const score = healthScore(account)
  return (
    <>
      <div className="flex items-center gap-2">
        <span className={`h-2 w-2 shrink-0 rounded-full ${DOT[status]}`} aria-hidden="true" />
        {blocked
          ? <ErrorChip kind={status === 'disconnected' ? 'disconnected' : 'error'}>{statusLabel(account, status)}</ErrorChip>
          : <span className="text-sm font-medium">{statusLabel(account, status)}</span>}
      </div>
      {/* The warmup score says nothing about a mailbox that cannot send,
          so it is greyed rather than replaced with an invented number. */}
      <p className={`mt-1 pl-4 text-xs tabular-nums ${blocked ? 'text-muted-foreground/50' : score !== null && score < 80 ? 'text-amber-700' : 'text-muted-foreground'}`}>
        {score === null
          ? 'No score'
          : <><span className="sr-only">Health </span>{score}%{blocked && <span className="sr-only">, not meaningful while this mailbox cannot send</span>}</>}
      </p>
    </>
  )
}

export const ErrorDetails = ({ id, raw }: { id: string; raw: string }) => (
  <p id={id} className="whitespace-pre-wrap break-words rounded-md border bg-background p-3 font-mono text-xs leading-5 text-muted-foreground">
    {linkifyText(raw).map((part, index) => (
      <Fragment key={index}>
        {part.href
          ? <a href={part.href} target="_blank" rel="noopener noreferrer" className="text-primary underline underline-offset-2">{part.text}</a>
          : part.text}
      </Fragment>
    ))}
  </p>
)
