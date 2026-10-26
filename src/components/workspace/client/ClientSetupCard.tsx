import { useState } from 'react'
import { Link } from 'react-router-dom'
import { ArrowRight, CheckCircle2, ChevronDown, Circle, CircleDashed } from 'lucide-react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Progress } from '@/components/ui/progress'
import type { ClientSetupItem, SetupItemStatus, SetupItemTarget } from '@/lib/clientNextStep'
import { cn } from '@/lib/utils'

/*
 * One pill style for every row. The text carries the state, the icon and
 * color only repeat it, so the list reads the same without color.
 */
const STATUS_PILL: Record<SetupItemStatus, { label: string; icon: typeof Circle; className: string }> = {
  done: { label: 'Done', icon: CheckCircle2, className: 'border-emerald-200 bg-emerald-50 text-emerald-800' },
  in_progress: { label: 'In progress', icon: CircleDashed, className: 'border-amber-200 bg-amber-50 text-amber-900' },
  not_started: { label: 'Not started', icon: Circle, className: 'border-slate-200 bg-slate-100 text-slate-700' },
}

export const SetupStatusPill = ({ status }: { status: SetupItemStatus }) => {
  const { label, icon: Icon, className } = STATUS_PILL[status]
  return (
    <span className={cn('inline-flex shrink-0 items-center gap-1 rounded-full border px-2.5 py-0.5 text-xs font-medium', className)}>
      <Icon className="h-3.5 w-3.5" aria-hidden="true" />
      {label}
    </span>
  )
}

interface ClientSetupCardProps {
  items: ClientSetupItem[]
  hrefFor: (target: SetupItemTarget) => string
}

export const ClientSetupCard = ({ items, hrefFor }: ClientSetupCardProps) => {
  const [expanded, setExpanded] = useState(false)
  const doneCount = items.filter((item) => item.status === 'done').length
  const complete = doneCount === items.length
  const percent = items.length ? Math.round((doneCount / items.length) * 100) : 0

  // Once everything is done the card folds to one line; the rows stay one
  // click away for anyone checking how the client was set up.
  if (complete && !expanded) {
    return (
      <button
        type="button"
        aria-expanded={false}
        aria-controls="client-setup-list"
        onClick={() => setExpanded(true)}
        className="flex w-full items-center justify-between gap-3 rounded-xl border bg-card px-4 py-3 text-left text-sm shadow-sm transition-colors hover:bg-muted/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        <span className="font-medium text-emerald-800">Setup complete ✓</span>
        <span className="inline-flex items-center gap-1 text-muted-foreground">
          Show steps<ChevronDown className="h-4 w-4" aria-hidden="true" />
        </span>
      </button>
    )
  }

  return (
    <Card data-testid="client-setup">
      <CardHeader className="gap-3 pb-3 sm:flex-row sm:items-start sm:justify-between sm:space-y-0">
        <div>
          <CardTitle className="text-lg">Setup</CardTitle>
          <CardDescription>What this client needs before outreach can run.</CardDescription>
        </div>
        <div className="flex shrink-0 items-center gap-3">
          <p className="text-sm font-medium" id="client-setup-count">{doneCount} of {items.length} complete</p>
          {complete && (
            <button
              type="button"
              aria-expanded
              aria-controls="client-setup-list"
              onClick={() => setExpanded(false)}
              className="text-sm font-medium text-primary underline-offset-4 hover:underline"
            >
              Hide steps
            </button>
          )}
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        <Progress value={percent} className="h-2" aria-labelledby="client-setup-count" />
        <ul id="client-setup-list" className="divide-y rounded-xl border">
          {items.map((item) => (
            <li key={item.key} data-setup-item={item.key} data-status={item.status}>
              <Link
                to={hrefFor(item.target)}
                className="group flex flex-col gap-2 p-3 transition-colors hover:bg-muted/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring sm:flex-row sm:items-center sm:gap-4 sm:px-4"
              >
                <span className="flex min-w-0 flex-1 flex-wrap items-center gap-x-3 gap-y-1">
                  <span className="font-medium">{item.label}</span>
                  <SetupStatusPill status={item.status} />
                  {item.detail && <span className="text-sm text-muted-foreground">{item.detail}</span>}
                </span>
                <span
                  className={cn(
                    'inline-flex shrink-0 items-center gap-1 text-sm font-medium',
                    item.status === 'done' ? 'text-muted-foreground' : 'text-primary',
                  )}
                >
                  {item.actionLabel}
                  <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" aria-hidden="true" />
                </span>
              </Link>
            </li>
          ))}
        </ul>
      </CardContent>
    </Card>
  )
}
