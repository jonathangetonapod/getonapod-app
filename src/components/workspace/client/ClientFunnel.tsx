import { Link } from 'react-router-dom'
import { ArrowRight } from 'lucide-react'
import { outreachAgo, type ClientFunnelStep } from '@/lib/clientNextStep'
import { plural } from '@/lib/plural'

interface ClientFunnelProps {
  steps: ClientFunnelStep[]
  /** Where each step leads: the pipeline, filtered to this client. */
  pipelineHref: string
  lastSentAt: string | null
  emailsSent: number
  failedCount: number
  pendingReviewCount: number
  campaignHref: string
}

export const ClientFunnel = ({
  steps,
  pipelineHref,
  lastSentAt,
  emailsSent,
  failedCount,
  pendingReviewCount,
  campaignHref,
}: ClientFunnelProps) => {
  const lastOutreach = outreachAgo(lastSentAt)
  return (
    <section aria-labelledby="client-funnel-heading" className="space-y-3">
      <div>
        <h2 id="client-funnel-heading" className="text-xl font-semibold">Funnel</h2>
        <p className="text-sm text-muted-foreground">Shows that reached each stage for this client.</p>
      </div>
      <ol className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        {steps.map((step, index) => {
          const previous = index > 0 ? steps[index - 1] : null
          return (
            <li key={step.key} data-funnel-step={step.key}>
              <Link
                to={pipelineHref}
                aria-label={`${step.label}: ${step.count}${step.conversion !== null && previous ? `, ${step.conversion}% of ${previous.label}` : ''}. Open pipeline`}
                className="flex h-full flex-col rounded-xl border bg-card p-4 shadow-sm transition-colors hover:bg-muted/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <span className="text-sm text-muted-foreground">{step.label}</span>
                <span className="mt-1 text-3xl font-bold tabular-nums">{step.count}</span>
                {step.conversion !== null && previous && (
                  <span className="mt-1 inline-flex items-center gap-1 text-xs text-muted-foreground">
                    <ArrowRight className="h-3 w-3 shrink-0" aria-hidden="true" />
                    {step.conversion}% of {previous.label.toLowerCase()}
                  </span>
                )}
              </Link>
            </li>
          )
        })}
      </ol>
      <p className="flex flex-wrap gap-x-4 gap-y-1 text-sm text-muted-foreground">
        {lastOutreach && <span>Last outreach: {lastOutreach}</span>}
        {emailsSent > 0 && <span>{plural(emailsSent, 'initial email')} sent</span>}
        {failedCount > 0 && <span className="font-medium text-red-700">{plural(failedCount, 'delivery issue')}</span>}
        {emailsSent > 0 && failedCount === 0 && <span>No delivery issues</span>}
        {pendingReviewCount > 0 && (
          <Link to={campaignHref} className="font-medium text-primary underline-offset-4 hover:underline">
            {plural(pendingReviewCount, 'pitch', 'pitches')} awaiting your review
          </Link>
        )}
      </p>
    </section>
  )
}
