import { AlertCircle, CalendarDays, Inbox, Radio, Users, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { PIPELINE_KPI_LABELS, type PipelineKpi } from './pipelineRollup'

const KPI_ORDER: Array<{ kpi: PipelineKpi; icon: typeof Users; iconClassName: string }> = [
  { kpi: 'active', icon: Users, iconClassName: 'bg-sky-50 text-sky-700' },
  { kpi: 'attention', icon: AlertCircle, iconClassName: 'bg-amber-50 text-amber-700' },
  { kpi: 'conversations', icon: Inbox, iconClassName: 'bg-fuchsia-50 text-fuchsia-700' },
  { kpi: 'recordings', icon: CalendarDays, iconClassName: 'bg-emerald-50 text-emerald-700' },
  { kpi: 'published', icon: Radio, iconClassName: 'bg-violet-50 text-violet-700' },
]

/** One row of portfolio stats; each one filters the client list below. */
export const PipelineKpiRow = ({
  counts,
  selected,
  onSelect,
}: {
  counts: Record<PipelineKpi, number>
  selected: PipelineKpi | null
  onSelect: (kpi: PipelineKpi | null) => void
}) => (
  <section aria-label="Client portfolio summary" className="space-y-2">
    {/* Padded all round: the scroll container clips the focus ring otherwise. */}
    <div className="-m-1 flex gap-2 overflow-x-auto p-1">
      {KPI_ORDER.map(({ kpi, icon: Icon, iconClassName }) => {
        const pressed = selected === kpi
        const empty = counts[kpi] === 0
        return (
          <button
            key={kpi}
            type="button"
            aria-pressed={pressed}
            onClick={() => onSelect(pressed ? null : kpi)}
            className={cn(
              'flex min-w-[140px] flex-1 items-center gap-3 rounded-xl border bg-card px-3 py-2.5 text-left transition-colors',
              'hover:border-primary/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2',
              pressed && 'border-primary bg-primary/5 ring-1 ring-primary',
              // Nothing to see: still a filter, but it should not compete with the counts that matter.
              empty && !pressed && 'bg-muted/30',
            )}
          >
            <span className={cn('rounded-lg p-2', empty ? 'bg-muted text-muted-foreground' : iconClassName)}><Icon className="h-4 w-4" aria-hidden="true" /></span>
            <span className="min-w-0">
              <span className={cn('block text-xl font-bold leading-6', empty && 'font-semibold text-muted-foreground')}>{counts[kpi].toLocaleString()}</span>
              {/* Wraps rather than truncates: "Upcoming recordin…" read as a typo. */}
              <span className="block text-xs leading-4 text-muted-foreground">{PIPELINE_KPI_LABELS[kpi]}</span>
            </span>
          </button>
        )
      })}
    </div>
    {/* The live region is always mounted, so a screen reader announces the
        filter when it appears rather than missing a region born with its text. */}
    <div role="status" className="empty:hidden">
    {selected && (
      <div className="flex items-center gap-2 text-sm">
        <p>
          <span className="text-muted-foreground">Showing clients in </span>
          <span className="font-medium">{PIPELINE_KPI_LABELS[selected]}</span>
        </p>
        <Button type="button" variant="ghost" size="sm" className="h-7 px-2" onClick={() => onSelect(null)}>
          <X aria-hidden="true" />Clear filter
        </Button>
      </div>
    )}
    </div>
  </section>
)
