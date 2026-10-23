import { Link } from 'react-router-dom'
import { CheckCircle2, Circle, Lock } from 'lucide-react'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'
import { cn } from '@/lib/utils'
import type { ClientPodcastSystemClient } from '@/services/clientPodcastSystem'
import { setupItems } from './pipelineRollup'

/** Each setup step, with the missing ones linking to where they are fixed. */
export const ClientSetupList = ({
  client,
  canManage,
  pipelineStarted,
  recordHref,
}: {
  client: ClientPodcastSystemClient
  canManage: boolean
  pipelineStarted: boolean
  recordHref: string
}) => (
  <ul className="space-y-1.5 text-sm">
    {setupItems(client, canManage, pipelineStarted).map((item) => {
      const Icon = item.done === null ? Lock : item.done ? CheckCircle2 : Circle
      return (
        <li key={item.key} className="flex items-center gap-2">
          <Icon className={cn('h-4 w-4 shrink-0', item.done ? 'text-emerald-600' : 'text-muted-foreground')} aria-hidden="true" />
          <span className="min-w-0 flex-1">
            <span className={cn(item.done && 'text-muted-foreground')}>{item.label}</span>
            <span className="text-xs text-muted-foreground">: {item.detail}</span>
            {item.done !== null && <span className="sr-only">{item.done ? ' (done)' : ' (to do)'}</span>}
          </span>
          {item.done === false && (
            <Link to={`${recordHref}?tab=${item.tab}`} className="shrink-0 text-xs font-medium text-primary hover:underline" aria-label={`Fix ${item.label.toLowerCase()} for ${client.name}`}>
              Fix
            </Link>
          )}
        </li>
      )
    })}
  </ul>
)

/** "Setup X/Y" that names what is missing and goes straight to the first gap. */
export const ClientSetupBadge = ({
  client,
  canManage,
  pipelineStarted,
  recordHref,
}: {
  client: ClientPodcastSystemClient
  canManage: boolean
  pipelineStarted: boolean
  recordHref: string
}) => {
  const counted = setupItems(client, canManage, pipelineStarted).filter((item) => item.done !== null)
  const missing = counted.filter((item) => !item.done)
  const done = counted.length - missing.length
  if (missing.length === 0) {
    return (
      <span className="inline-flex items-center gap-1 text-[11px] text-emerald-700">
        <CheckCircle2 className="h-3.5 w-3.5" aria-hidden="true" />Set up
      </span>
    )
  }
  const missingNames = missing.map((item) => item.label.toLowerCase()).join(', ')
  return (
    <TooltipProvider delayDuration={150}>
      <Tooltip>
        <TooltipTrigger asChild>
          <Link
            to={`${recordHref}?tab=${missing[0].tab}`}
            className="inline-flex items-center rounded-full border border-violet-200 bg-violet-50 px-1.5 text-[11px] font-medium leading-[18px] text-violet-800 hover:bg-violet-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            aria-label={`Setup ${done}/${counted.length} for ${client.name}: missing ${missingNames}. Go to ${missing[0].label.toLowerCase()}`}
          >
            Setup {done}/{counted.length}
          </Link>
        </TooltipTrigger>
        <TooltipContent className="max-w-xs text-xs">
          Missing: {missing.map((item) => `${item.label} (${item.detail})`).join(', ')}. Opens {missing[0].label.toLowerCase()}.
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  )
}
