import { AlertTriangle, CircleAlert, Clock } from 'lucide-react'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'
import { cn } from '@/lib/utils'
import { daysSince, formattedDate, quietLevel, relativeDays, type ClientRollup } from './pipelineRollup'

/** Relative last activity, turning amber then red as an active client goes quiet. */
export const LastActivity = ({ rollup }: { rollup: ClientRollup }) => {
  const days = daysSince(rollup.lastActivityAt)
  const level = quietLevel(rollup, days)
  const Icon = level === 'alert' ? AlertTriangle : level === 'warn' ? CircleAlert : Clock
  const label = relativeDays(days)
  return (
    <TooltipProvider delayDuration={200}>
      <Tooltip>
        <TooltipTrigger asChild>
          {/* Not a tab stop: one per row was a lot of tabbing for a date the
              expanded row already shows. */}
          <span
            className={cn(
              'inline-flex items-center gap-1 rounded text-[11px] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
              level === 'alert' ? 'font-medium text-red-700' : level === 'warn' ? 'font-medium text-amber-700' : 'text-muted-foreground',
            )}
          >
            <Icon className="h-3 w-3" aria-hidden="true" />
            <span>{days === null ? label : `Active ${label.toLowerCase()}`}</span>
            {level !== 'recent' && <span className="sr-only">{level === 'alert' ? ', gone quiet' : ', going quiet'}</span>}
          </span>
        </TooltipTrigger>
        <TooltipContent>Last activity {formattedDate(rollup.lastActivityAt, true)}</TooltipContent>
      </Tooltip>
    </TooltipProvider>
  )
}
