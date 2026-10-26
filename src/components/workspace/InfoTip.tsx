import { Info } from 'lucide-react'
import { Portal as TooltipPortal } from '@radix-ui/react-tooltip'

import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'

interface InfoTipProps {
  /** What the explanation is about, for the button's accessible name. */
  topic: string
  children: React.ReactNode
}

/**
 * The longer explanation behind a one-line section description. A real
 * button, so it is reachable by keyboard and opens on focus, not only on
 * hover. Carries its own provider so it works outside the app shell too, and
 * renders in a portal: section descriptions are paragraphs, which cannot hold
 * the tooltip's block content, and scrolling cards would clip it.
 */
export const InfoTip = ({ topic, children }: InfoTipProps) => (
  <TooltipProvider delayDuration={150}>
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          type="button"
          aria-label={`More about ${topic}`}
          className="inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full align-middle text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <Info className="h-3.5 w-3.5" aria-hidden="true" />
        </button>
      </TooltipTrigger>
      <TooltipPortal>
        <TooltipContent className="max-w-xs text-xs leading-5">{children}</TooltipContent>
      </TooltipPortal>
    </Tooltip>
  </TooltipProvider>
)
