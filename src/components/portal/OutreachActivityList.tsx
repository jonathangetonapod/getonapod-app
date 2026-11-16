import { useMemo, useState } from 'react'
import { Headphones, Star } from 'lucide-react'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { compactNumber } from '@/lib/compactNumber'
import { OUTREACH_STAGE_LABELS } from '@/lib/placementStatus'
import { plural } from '@/lib/plural'
import { cn } from '@/lib/utils'
import type { PortalOutreachTarget } from '@/services/clientPortal'

type Stage = PortalOutreachTarget['stage']

// The words come from the shared table; only the colours live here.
const stageClassName: Record<Stage, string> = {
  preparing: 'bg-muted text-muted-foreground',
  queued: 'bg-violet-50 text-violet-700 border-violet-200',
  contacted: 'bg-sky-50 text-sky-700 border-sky-200',
  replied: 'bg-amber-50 text-amber-800 border-amber-200',
  completed: 'bg-emerald-50 text-emerald-800 border-emerald-200',
}

// The order a pitch moves through, which is also the order worth reading in.
const FILTER_ORDER: Stage[] = ['replied', 'contacted', 'queued', 'preparing', 'completed']
const PAGE_SIZE = 8

const displayDate = (value: string | null | undefined) => {
  if (!value) return null
  const date = new Date(value)
  return Number.isNaN(date.getTime())
    ? null
    : date.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })
}

const audience = (target: PortalOutreachTarget): string | null => compactNumber(target.audience_size)

const targetDetail = (target: PortalOutreachTarget): string => {
  if (target.stage === 'preparing') return 'Your personalized pitch is being written'
  if (target.stage === 'queued') {
    const queued = displayDate(target.queued_at)
    return `Pitch written and scheduled to send${queued ? ` · Added to outreach ${queued}` : ''}`
  }
  const sent = displayDate(target.first_message_at)
  // Before the first email there is no activity a client would recognise,
  // only bookkeeping timestamps, so this line belongs to emailed shows alone.
  const activity = displayDate(target.last_activity_at)
  return `${sent ? `Emailed ${sent}` : 'Pitch emailed to the host'}${activity && activity !== sent ? ` · Latest activity ${activity}` : ''}`
}

interface OutreachActivityListProps {
  targets: PortalOutreachTarget[]
  /** Shows in outreach altogether, when the list carries only the newest of them. */
  total?: number
}

/**
 * Show by show, filterable by stage. A hundred rows that mostly say the same
 * thing are not a list anyone reads; the question is "who replied" or "what
 * has gone out", and the filter answers it in one tap.
 */
export const OutreachActivityList = ({ targets, total }: OutreachActivityListProps) => {
  const [filter, setFilter] = useState<Stage | 'all'>('all')
  const [expanded, setExpanded] = useState(false)

  const filters = useMemo(() => FILTER_ORDER.flatMap((stage) => {
    const count = targets.filter((target) => target.stage === stage).length
    return count > 0 ? [{ stage, count }] : []
  }), [targets])
  // A filter whose last row left (a refetch moved it on) falls back to all.
  const activeFilter = filter !== 'all' && filters.some((entry) => entry.stage === filter) ? filter : 'all'
  const filtered = activeFilter === 'all' ? targets : targets.filter((target) => target.stage === activeFilter)
  const visible = expanded ? filtered : filtered.slice(0, PAGE_SIZE)

  const chip = (value: Stage | 'all', label: string, count: number) => (
    <button
      key={value}
      type="button"
      aria-pressed={activeFilter === value}
      onClick={() => { setFilter(value); setExpanded(false) }}
      className={cn(
        'rounded-full border px-3 py-1 text-xs font-medium transition-colors',
        activeFilter === value
          ? 'border-primary bg-primary text-primary-foreground'
          : 'bg-background text-muted-foreground hover:text-foreground',
      )}
    >
      {label} <span className="tabular-nums opacity-80">{count}</span>
    </button>
  )

  return (
    <>
      {filters.length > 1 && (
        <div className="mb-4 flex flex-wrap gap-2" role="group" aria-label="Filter shows by stage">
          {chip('all', 'All', targets.length)}
          {filters.map((entry) => chip(entry.stage, OUTREACH_STAGE_LABELS[entry.stage], entry.count))}
        </div>
      )}
      <ul className="divide-y">
        {visible.map((target) => (
          <li key={target.id} className="flex gap-3 py-3.5 first:pt-0 last:pb-0">
            {target.podcast_image_url ? (
              <img src={target.podcast_image_url} alt="" loading="lazy" className="h-10 w-10 shrink-0 rounded-lg border object-cover" />
            ) : (
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border bg-muted/40">
                <Headphones className="h-4 w-4 text-muted-foreground" />
              </div>
            )}
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                <p className="min-w-0 truncate font-medium">{target.podcast_name}</p>
                <Badge variant="outline" className={`shrink-0 ${stageClassName[target.stage] ?? 'bg-muted text-muted-foreground'}`}>
                  {OUTREACH_STAGE_LABELS[target.stage] ?? String(target.stage).replace(/_/gu, ' ')}
                </Badge>
              </div>
              <p className="mt-0.5 text-sm text-muted-foreground">{targetDetail(target)}</p>
              {/* Reach and engagement on one wrapping line. A fixed right-hand
                  column put "4 opens · 1 reply" alongside a title that was
                  already wrapping on a phone. */}
              {(audience(target) || target.itunes_rating || target.opens > 0 || target.replies > 0) && (
                <p className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
                  {audience(target) && (
                    <span className="inline-flex items-center gap-1">
                      <Headphones className="h-3 w-3" aria-hidden="true" />{audience(target)} listeners
                    </span>
                  )}
                  {target.itunes_rating ? (
                    <span className="inline-flex items-center gap-1">
                      <Star className="h-3 w-3 text-amber-500" aria-hidden="true" />{Number(target.itunes_rating).toFixed(1)}
                    </span>
                  ) : null}
                  {target.opens > 0 && <span>{plural(target.opens, 'open')}</span>}
                  {target.replies > 0 && <span>{plural(target.replies, 'reply', 'replies')}</span>}
                </p>
              )}
            </div>
          </li>
        ))}
      </ul>
      {filtered.length > visible.length && (
        <Button variant="outline" size="sm" className="mt-4" onClick={() => setExpanded(true)}>
          Show all {filtered.length}
        </Button>
      )}
      {typeof total === 'number' && total > targets.length && (
        <p className="mt-4 text-xs text-muted-foreground">
          Showing the {plural(targets.length, 'show')} furthest along, of {total} in outreach.
        </p>
      )}
    </>
  )
}
