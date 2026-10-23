import { X } from 'lucide-react'
import type { MailboxFilter } from '@/lib/mailboxView'

interface FilterChipProps {
  count: number
  label: string
  active: boolean
  tone: 'attention' | 'neutral'
  onClick: () => void
}

const FilterChip = ({ count, label, active, tone, onClick }: FilterChipProps) => {
  const idle = tone === 'attention'
    ? 'border-red-200 bg-red-50/60 text-red-800 hover:bg-red-50'
    : 'border-border bg-background text-foreground hover:bg-muted/50'
  const on = tone === 'attention'
    ? 'border-red-600 bg-red-600 text-white hover:bg-red-700'
    : 'border-foreground bg-foreground text-background hover:bg-foreground/90'
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 ${active ? on : idle}`}
    >
      <span className="font-semibold tabular-nums">{count.toLocaleString()}</span>{' '}
      {label}
      {active && <X className="h-3 w-3" aria-hidden="true" />}
    </button>
  )
}

interface MailboxSummaryProps {
  sentToday: number
  capacity: number
  timeZone?: string
  problemCount: number
  unassignedCount: number
  filter: MailboxFilter
  onFilterChange: (filter: MailboxFilter) => void
}

export const MailboxSummary = ({
  sentToday,
  capacity,
  timeZone,
  problemCount,
  unassignedCount,
  filter,
  onFilterChange,
}: MailboxSummaryProps) => {
  const used = capacity > 0 ? Math.min((sentToday / capacity) * 100, 100) : 0
  const toggle = (target: MailboxFilter) => onFilterChange(filter === target ? 'all' : target)
  return (
    <div data-testid="mailbox-capacity" className="flex flex-wrap items-center gap-x-6 gap-y-3 border-b bg-background px-5 py-3">
      <div className="min-w-[14rem] max-w-sm flex-1">
        <p className="text-xs text-muted-foreground">
          <span className="font-semibold tabular-nums text-foreground">{sentToday.toLocaleString()}</span>
          {' / '}
          <span className="tabular-nums">{capacity.toLocaleString()}</span> sent today, resets midnight{timeZone ? ` ${timeZone}` : ''}
        </p>
        <div
          role="progressbar"
          aria-label="Sent today across active mailboxes"
          aria-valuemin={0}
          aria-valuemax={capacity}
          aria-valuenow={sentToday}
          className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-muted"
        >
          <div className="h-full rounded-full bg-primary" style={{ width: `${used}%` }} />
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        {(problemCount > 0 || filter === 'attention') && (
          <FilterChip
            count={problemCount}
            label={problemCount === 1 ? 'mailbox cannot send' : 'mailboxes cannot send'}
            tone="attention"
            active={filter === 'attention'}
            onClick={() => toggle('attention')}
          />
        )}
        {(unassignedCount > 0 || filter === 'unassigned') && (
          <FilterChip
            count={unassignedCount}
            label="not connected to any client"
            tone="neutral"
            active={filter === 'unassigned'}
            onClick={() => toggle('unassigned')}
          />
        )}
      </div>
    </div>
  )
}
