import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'
import { useWaitingJoinRequests } from '@/hooks/useWaitingJoinRequests'

/**
 * How many people are waiting to hear back, on the way into the queue.
 *
 * A request used to arrive with nothing to notice it by: you had to remember to
 * open Manage workspaces and look. This is the noticing. It counts only what is
 * still waiting, so it clears itself as requests are actioned rather than
 * needing to be dismissed.
 *
 * The number is announced, not just coloured — a red dot says nothing to a
 * screen reader, and the count is the whole message.
 */
export function JoinRequestsBadge({ enabled }: { enabled: boolean }) {
  const waiting = useWaitingJoinRequests(enabled)
  if (!enabled || waiting < 1) return null

  const description = waiting === 1 ? '1 request to join is waiting' : `${waiting} requests to join are waiting`
  // Its own provider so the badge works outside the workspace shell too.
  return (
    <TooltipProvider delayDuration={200}>
      <Tooltip>
        <TooltipTrigger asChild>
          <span
            className="absolute -right-1.5 -top-1.5 flex h-5 min-w-5 items-center justify-center rounded-full bg-red-600 px-1 text-[11px] font-semibold leading-none text-white ring-2 ring-background"
            role="status"
          >
            <span aria-hidden="true">{waiting > 9 ? '9+' : waiting}</span>
            <span className="sr-only">{description}</span>
          </span>
        </TooltipTrigger>
        <TooltipContent>{description}</TooltipContent>
      </Tooltip>
    </TooltipProvider>
  )
}
