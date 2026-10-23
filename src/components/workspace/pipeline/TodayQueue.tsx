import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { CheckCircle2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { ActionButton, ClientAvatar } from './ActionButton'
import type { PipelineAction } from './pipelineRollup'

const QUEUE_PREVIEW = 8

const queueRowId = (actionId: string) => `pipeline-action-${actionId.replace(/[^a-zA-Z0-9_-]/gu, '-')}`

/** A card chip asking to be shown its client's rows; the nonce repeats a click. */
export interface QueueReveal {
  clientId: string
  nonce: number
}

/**
 * The page's one list of things to do, most pressing first. Every action
 * appears here and nowhere else; the client cards only point at their rows.
 */
export const TodayQueue = ({
  queue,
  baseHref,
  onOpenItem,
  reveal,
  allPodcastsHref,
}: {
  queue: PipelineAction[]
  baseHref: string
  onOpenItem: (itemId: string) => void
  reveal: QueueReveal | null
  /** With one client on screen, where their full podcast list is. */
  allPodcastsHref?: string | null
}) => {
  const [expanded, setExpanded] = useState(false)
  const [highlightClientId, setHighlightClientId] = useState<string | null>(null)

  useEffect(() => {
    if (!reveal) return
    const index = queue.findIndex((action) => action.client.id === reveal.clientId)
    if (index < 0) return
    if (index >= QUEUE_PREVIEW) setExpanded(true)
    setHighlightClientId(reveal.clientId)
    // After the expand has rendered the row.
    const frame = window.requestAnimationFrame(() => {
      const row = document.getElementById(queueRowId(queue[index].id))
      row?.scrollIntoView?.({ behavior: 'smooth', block: 'center' })
      row?.querySelector<HTMLElement>('a, button')?.focus({ preventScroll: true })
    })
    const timer = window.setTimeout(() => setHighlightClientId(null), 2000)
    return () => {
      window.cancelAnimationFrame(frame)
      window.clearTimeout(timer)
    }
    // The queue changing under a reveal should not replay it.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reveal])

  if (queue.length === 0) {
    return (
      <section id="pipeline-today" aria-label="Today" className="flex items-center gap-2 rounded-xl border border-dashed px-4 py-3 text-sm text-muted-foreground">
        <CheckCircle2 className="h-4 w-4 text-emerald-600" aria-hidden="true" />
        Nothing to do right now. Host replies, recordings and review batches will appear here.
      </section>
    )
  }

  const visible = expanded ? queue : queue.slice(0, QUEUE_PREVIEW)
  return (
    <section id="pipeline-today" aria-labelledby="pipeline-today-heading" className="scroll-mt-24 rounded-xl border bg-card">
      <div className="flex items-center justify-between gap-3 border-b px-4 py-2.5">
        <h2 id="pipeline-today-heading" className="text-base font-semibold">
          Today <span className="font-normal text-muted-foreground">· {queue.length} {queue.length === 1 ? 'action' : 'actions'}</span>
        </h2>
        {allPodcastsHref && <Link to={allPodcastsHref} className="text-xs font-medium text-primary hover:underline">All podcasts for this client</Link>}
      </div>
      <ul className="divide-y">
        {visible.map((action) => (
          <li
            key={action.id}
            id={queueRowId(action.id)}
            className={cn(
              'grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 gap-y-1 px-4 py-2.5 transition-colors sm:flex sm:gap-4',
              highlightClientId === action.client.id && 'bg-primary/5',
            )}
          >
            <div className="flex min-w-0 items-center gap-2.5 sm:w-44 sm:shrink-0">
              <ClientAvatar client={action.client} className="h-7 w-7" />
              <span className="truncate text-sm font-medium">{action.client.name}</span>
            </div>
            <ActionButton action={action} baseHref={baseHref} onOpenItem={onOpenItem} className="sm:order-last sm:w-44" />
            <div className="col-span-2 min-w-0 text-sm sm:flex-1">
              <p className="truncate font-medium">{action.title}</p>
              <p className="truncate text-xs text-muted-foreground">{action.detail}</p>
            </div>
          </li>
        ))}
      </ul>
      {queue.length > QUEUE_PREVIEW && (
        <div className="border-t px-4 py-2">
          <Button type="button" variant="ghost" size="sm" onClick={() => setExpanded((current) => !current)} aria-expanded={expanded}>
            {expanded ? 'Show fewer' : `Show ${queue.length - QUEUE_PREVIEW} more`}
          </Button>
        </div>
      )}
    </section>
  )
}
