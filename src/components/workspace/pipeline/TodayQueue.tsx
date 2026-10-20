import { useState } from 'react'
import { CheckCircle2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { ClientAvatar, NextActionButton } from './NextActionButton'
import type { ClientRollup } from './pipelineRollup'

const QUEUE_PREVIEW = 5

/** Every pending next action across active clients, one line each, most pressing first. */
export const TodayQueue = ({
  queue,
  baseHref,
  onOpenItem,
}: {
  queue: ClientRollup[]
  baseHref: string
  onOpenItem: (itemId: string) => void
}) => {
  const [expanded, setExpanded] = useState(false)

  if (queue.length === 0) {
    return (
      <section aria-label="Today" className="flex items-center gap-2 rounded-xl border border-dashed px-4 py-3 text-sm text-muted-foreground">
        <CheckCircle2 className="h-4 w-4 text-emerald-600" aria-hidden="true" />
        Nothing to do right now. New replies, decisions and bookings will appear here.
      </section>
    )
  }

  const visible = expanded ? queue : queue.slice(0, QUEUE_PREVIEW)
  return (
    <section aria-labelledby="pipeline-today-heading" className="rounded-xl border bg-card">
      <div className="flex items-center justify-between gap-3 border-b px-4 py-2.5">
        <h2 id="pipeline-today-heading" className="text-sm font-semibold">Today <span className="font-normal text-muted-foreground">· {queue.length} {queue.length === 1 ? 'action' : 'actions'}</span></h2>
      </div>
      <ul className="divide-y">
        {visible.map((rollup) => (
          <li key={rollup.client.id} className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 gap-y-1 px-4 py-2.5 sm:flex sm:gap-4">
            <div className="flex min-w-0 items-center gap-2.5 sm:w-48 sm:shrink-0">
              <ClientAvatar client={rollup.client} className="h-7 w-7" />
              <span className="truncate text-sm font-medium">{rollup.client.name}</span>
            </div>
            <NextActionButton rollup={rollup} baseHref={baseHref} onOpenItem={onOpenItem} label="Open" className="sm:order-last" />
            <div className="col-span-2 line-clamp-2 min-w-0 text-sm sm:flex-1 sm:truncate">
              <span className="font-medium">{rollup.nextAction.label}</span>
              <span className="text-muted-foreground"> · {rollup.nextAction.detail}</span>
            </div>
          </li>
        ))}
      </ul>
      {queue.length > QUEUE_PREVIEW && (
        <div className="border-t px-4 py-2">
          <Button type="button" variant="ghost" size="sm" onClick={() => setExpanded((current) => !current)} aria-expanded={expanded}>
            {expanded ? 'Show fewer' : `Show all ${queue.length}`}
          </Button>
        </div>
      )}
    </section>
  )
}
