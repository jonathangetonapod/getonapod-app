import { useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { Loader2, Search, Wallet } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { BillingPortfolioSummary } from '@/components/workspace/BillingPortfolioSummary'
import { BillingPortfolioTable } from '@/components/workspace/BillingPortfolioTable'
import { compareByAttention } from '@/lib/billingAttention'
import {
  PORTFOLIO_FILTERS,
  isPortfolioFilter,
  matchesFilter,
  matchesSearch,
  portfolioSummary,
  type PortfolioFilter,
} from '@/lib/billingPortfolio'
import { getBillingPortfolio } from '@/services/workspaceStaff'

interface BillingPortfolioProps {
  /** The signed-in admin's own workspace, which authorizes the read. */
  workspaceId: string
  onSelect: (workspaceId: string) => void
}

/**
 * Every workspace's money on one screen.
 *
 * The per-workspace cards answer "how is this agency doing". Nothing answered
 * "which agency needs me" — so the questions an owner actually has, who is
 * nearly out and whose card has failed, meant opening each workspace in turn.
 * Nobody does that, which means nobody asked, which means the first anyone
 * heard of an empty balance was the agency complaining.
 *
 * Search and filter live in the address, so leaving for a workspace and coming
 * back returns to the same list.
 */
export function BillingPortfolio({ workspaceId, onSelect }: BillingPortfolioProps) {
  // Read from the address once, then held in state and written back. Writing
  // each change straight to the address raced: setSearchParams builds on the
  // params of the last render, so a search typed before a filter click had
  // re-rendered wrote the old filter back over the new one.
  const [searchParams, setSearchParams] = useSearchParams()
  const [query, setQuery] = useState(() => searchParams.get('q') ?? '')
  const [filter, setFilter] = useState<PortfolioFilter>(() => {
    const requested = searchParams.get('filter')
    return isPortfolioFilter(requested) ? requested : 'all'
  })

  useEffect(() => {
    setSearchParams((current) => {
      const next = new URLSearchParams(current)
      if (query) next.set('q', query)
      else next.delete('q')
      if (filter !== 'all') next.set('filter', filter)
      else next.delete('filter')
      return next.toString() === current.toString() ? current : next
    }, { replace: true })
  }, [query, filter, setSearchParams])

  const portfolioQuery = useQuery({
    queryKey: ['billing-portfolio', workspaceId],
    queryFn: () => getBillingPortfolio(workspaceId),
    enabled: Boolean(workspaceId),
    retry: false,
    staleTime: 30_000,
  })

  const { sorted, summary, counts } = useMemo(() => {
    const now = Date.now()
    const all = portfolioQuery.data?.workspaces ?? []
    // Worst first, by the same rule the count uses. A list sorted by name
    // makes an owner read all of it to find the one row that needed them.
    const ordered = [...all].sort((left, right) => compareByAttention(left, right, now))
    const searched = ordered.filter((row) => matchesSearch(row, query))
    return {
      sorted: searched,
      // The cards describe the platform, not the current filter.
      summary: portfolioSummary(all, now),
      counts: Object.fromEntries(PORTFOLIO_FILTERS.map(({ value }) => [
        value,
        searched.filter((row) => matchesFilter(row, value, now)).length,
      ])) as Record<PortfolioFilter, number>,
    }
  }, [portfolioQuery.data, query])

  const visible = useMemo(() => sorted.filter((row) => matchesFilter(row, filter)), [sorted, filter])

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-lg"><Wallet className="h-5 w-5" />All workspaces</CardTitle>
        <CardDescription>Most urgent first. Open a row to manage that workspace.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {portfolioQuery.isLoading ? (
          <p className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />Reading every workspace…
          </p>
        ) : portfolioQuery.error ? (
          <p className="text-sm text-destructive">
            {portfolioQuery.error instanceof Error ? portfolioQuery.error.message : 'The portfolio could not be loaded.'}
          </p>
        ) : (portfolioQuery.data?.workspaces.length ?? 0) === 0 ? (
          <p className="text-sm text-muted-foreground">No active workspaces yet.</p>
        ) : (
          <>
            <BillingPortfolioSummary summary={summary} />

            <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
              <div className="relative w-full max-w-sm">
                <Label htmlFor="billing-portfolio-search" className="sr-only">Search workspaces</Label>
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
                <Input
                  id="billing-portfolio-search"
                  type="search"
                  value={query}
                  placeholder="Search by workspace or owner email"
                  onChange={(event) => setQuery(event.target.value)}
                  className="pl-9"
                />
              </div>
              <div className="flex flex-wrap gap-2" role="group" aria-label="Filter workspaces">
                {PORTFOLIO_FILTERS.map((option) => (
                  <Button
                    key={option.value}
                    type="button"
                    size="sm"
                    variant={filter === option.value ? 'default' : 'outline'}
                    aria-pressed={filter === option.value}
                    onClick={() => setFilter(option.value)}
                  >
                    {option.label}
                    <span className="ml-1.5 tabular-nums opacity-80">{counts[option.value]}</span>
                  </Button>
                ))}
              </div>
            </div>

            {visible.length === 0 ? (
              <p className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">
                No workspaces match this search and filter.
              </p>
            ) : (
              <BillingPortfolioTable rows={visible} onSelect={onSelect} />
            )}

            {!portfolioQuery.data?.enforcementEnabled && (
              // Every number above is a balance nothing is drawing from.
              <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs leading-5 text-amber-900">
                Credit enforcement is off, so nothing is being charged. These balances are being kept, not spent.
              </p>
            )}
          </>
        )}
      </CardContent>
    </Card>
  )
}
