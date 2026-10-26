import type { PortfolioSummary } from '@/lib/billingPortfolio'

interface BillingPortfolioSummaryProps {
  summary: PortfolioSummary
}

const dollars = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 2, minimumFractionDigits: 0 })

/** The six numbers an admin opens this page for, across every workspace. */
export const BillingPortfolioSummary = ({ summary }: BillingPortfolioSummaryProps) => {
  const cards = [
    { label: 'MRR', value: dollars.format(summary.mrrCents / 100) },
    { label: 'Paying / Trialing', value: `${summary.paying} / ${summary.trialing}` },
    { label: 'Trials ending in 7 days', value: summary.trialsEndingSoon.toLocaleString() },
    { label: 'Credits outstanding', value: summary.creditsOutstanding.toLocaleString() },
    { label: 'Credits used this month', value: summary.creditsUsedThisMonth.toLocaleString() },
    { label: 'Needs attention', value: summary.needsAttention.toLocaleString() },
  ]
  return (
    <dl className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
      {cards.map((card) => (
        <div key={card.label} className="rounded-lg border bg-muted/20 p-3">
          <dt className="text-xs text-muted-foreground">{card.label}</dt>
          <dd className="mt-0.5 text-xl font-semibold tabular-nums">{card.value}</dd>
        </div>
      ))}
    </dl>
  )
}
