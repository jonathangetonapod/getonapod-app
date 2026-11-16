import { ArrowRight, Check } from 'lucide-react'
import { Link } from 'react-router-dom'

import { Button } from '@/components/ui/button'
import type { PortalJourneyStatus, PortalJourneyStep } from '@/lib/portalJourney'
import { cn } from '@/lib/utils'

interface JourneyStatusCardProps {
  status: PortalJourneyStatus
  steps: PortalJourneyStep[]
}

/**
 * One sentence on where the tour stands, one on what follows, and the whole
 * road with a mark on how far along it is.
 *
 * During outreach the dashboard was four small numbers over "No shows yet" for
 * weeks, which reads as nothing happening at the point the most work is being
 * done. This says what is happening, and points at the page with the detail.
 */
export const JourneyStatusCard = ({ status, steps }: JourneyStatusCardProps) => {
  // The furthest step reached is where the client is now.
  const currentIndex = steps.reduce((latest, step, index) => (step.reached ? index : latest), -1)
  return (
    <section
      aria-label="Where things stand"
      className="overflow-hidden rounded-2xl border border-primary/20 bg-gradient-to-br from-primary/10 via-card to-card shadow-sm"
    >
      <div className="flex flex-col gap-4 p-6 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0">
          <p className="text-xs font-semibold uppercase tracking-wide text-primary">Where things stand</p>
          <p className="mt-1.5 text-2xl font-semibold tracking-tight">{status.headline}</p>
          <p className="mt-1.5 max-w-2xl text-sm leading-6 text-muted-foreground">{status.detail}</p>
        </div>
        <Button asChild className="shrink-0">
          <Link to="/portal/outreach">
            See outreach
            <ArrowRight className="ml-2 h-4 w-4" />
          </Link>
        </Button>
      </div>
      <ol className="grid grid-cols-3 gap-x-2 gap-y-4 border-t border-primary/10 bg-card/60 px-6 py-4 sm:grid-cols-6">
        {steps.map((step, index) => {
          const current = index === currentIndex
          return (
            <li key={step.label} aria-current={current ? 'step' : undefined} className="min-w-0">
              <span
                className={cn('block h-1 rounded-full', step.reached ? 'bg-primary' : 'bg-muted')}
                aria-hidden="true"
              />
              <span className="mt-2 flex items-center gap-1.5">
                <span
                  className={cn(
                    'flex h-4 w-4 shrink-0 items-center justify-center rounded-full',
                    step.reached ? 'bg-primary text-primary-foreground' : 'border border-muted-foreground/30',
                  )}
                  aria-hidden="true"
                >
                  {step.reached && <Check className="h-2.5 w-2.5" strokeWidth={3} />}
                </span>
                <span className={cn('truncate text-xs', current ? 'font-semibold text-foreground' : step.reached ? 'font-medium text-foreground' : 'text-muted-foreground')}>
                  {step.label}
                </span>
                <span className="sr-only">{current ? '(you are here)' : step.reached ? '(done)' : '(to come)'}</span>
              </span>
            </li>
          )
        })}
      </ol>
    </section>
  )
}
