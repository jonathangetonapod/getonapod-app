import { ArrowRight, Circle } from 'lucide-react'
import { useState } from 'react'
import { Link } from 'react-router-dom'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import type { SetupProgress } from '@/components/workspace/SetupChecklist'

interface SettingsSetupBadgeProps {
  progress: SetupProgress
  /** Where the full checklist lives. */
  checklistHref: string
}

/**
 * How far setup has come, only while it has somewhere left to go.
 *
 * At 100% it said "5 of 5 required steps done" on every visit for good, which
 * is noise. Short of that it opens the steps still missing, each a link to
 * where it is finished: a step on this page scrolls to its field, the rest
 * open their own page.
 */
export const SettingsSetupBadge = ({ progress, checklistHref }: SettingsSetupBadgeProps) => {
  const [open, setOpen] = useState(false)
  if (progress.loading || progress.complete) return null

  const missing = progress.steps.filter((step) => step.required && !step.done && !step.unknown && !step.dismissed)

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          className="inline-flex w-fit items-center gap-2 rounded-full border border-border/70 px-3 py-1.5 text-xs font-medium hover:bg-muted/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <span className="h-2 w-2 rounded-full bg-amber-500" aria-hidden="true" />
          Setup: {progress.requiredDone} of {progress.requiredTotal} required steps done
          {progress.requiredDismissed > 0 && `, ${progress.requiredDismissed} dismissed`}
        </button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-80 p-0">
        <p className="border-b border-border/70 px-4 py-3 text-sm font-semibold">Still to do</p>
        {missing.length > 0 ? (
          <ul className="py-1">
            {missing.map((step) => (
              <li key={step.key}>
                <Link
                  to={step.href}
                  onClick={() => setOpen(false)}
                  className="flex items-center gap-2.5 px-4 py-2 text-sm hover:bg-muted/60 focus-visible:bg-muted/60 focus-visible:outline-none"
                >
                  <Circle className="h-3.5 w-3.5 shrink-0 text-muted-foreground" aria-hidden="true" />
                  <span className="flex-1">{step.label}</span>
                  <ArrowRight className="h-3.5 w-3.5 shrink-0 text-muted-foreground" aria-hidden="true" />
                </Link>
              </li>
            ))}
          </ul>
        ) : (
          <p className="px-4 py-3 text-sm text-muted-foreground">Some steps could not be checked right now.</p>
        )}
        <Link
          to={checklistHref}
          onClick={() => setOpen(false)}
          className="block border-t border-border/70 px-4 py-2.5 text-xs font-medium text-muted-foreground hover:text-foreground"
        >
          Open the full checklist
        </Link>
      </PopoverContent>
    </Popover>
  )
}
