import { CircleAlert } from 'lucide-react'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'
import { daysSince, formattedDate, isStale, type ClientRollup } from './pipelineRollup'

/**
 * Said only when it is a problem: an active client past the stale threshold.
 * A recent date next to "active" added nothing the expanded row does not show.
 */
export const LastActivity = ({ rollup }: { rollup: ClientRollup }) => {
  const days = daysSince(rollup.lastActivityAt)
  if (days === null) return <span className="text-[11px] text-muted-foreground">No activity recorded yet</span>
  if (!isStale(rollup)) return null
  return (
    <TooltipProvider delayDuration={200}>
      <Tooltip>
        <TooltipTrigger asChild>
          <span className="inline-flex items-center gap-1 text-[11px] font-medium text-amber-800">
            <CircleAlert className="h-3 w-3" aria-hidden="true" />
            No activity in {days.toLocaleString()} days
          </span>
        </TooltipTrigger>
        <TooltipContent>Last activity {formattedDate(rollup.lastActivityAt, true)}</TooltipContent>
      </Tooltip>
    </TooltipProvider>
  )
}
