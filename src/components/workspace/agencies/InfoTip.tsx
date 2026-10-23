import { Info } from 'lucide-react'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'

/** The longer explanation behind a one-sentence tab description. Focusable, so it works without a mouse. */
export const InfoTip = ({ label, children }: { label: string; children: React.ReactNode }) => (
  <TooltipProvider delayDuration={150}>
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          type="button"
          className="inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          aria-label={label}
        >
          <Info className="h-4 w-4" aria-hidden="true" />
        </button>
      </TooltipTrigger>
      <TooltipContent className="max-w-xs text-xs leading-5">{children}</TooltipContent>
    </Tooltip>
  </TooltipProvider>
)

/** The single sentence that opens a tab body, with its optional info icon. */
export const TabIntro = ({ children, info }: { children: React.ReactNode; info?: React.ReactNode }) => (
  <p className="flex items-center gap-1.5 text-sm text-muted-foreground">
    <span>{children}</span>
    {info && <InfoTip label="More about this tab">{info}</InfoTip>}
  </p>
)
