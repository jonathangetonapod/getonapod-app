import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { foldActivity } from '@/lib/billingActivity'
import type { BillingActivityEntry } from '@/services/workspaceStaff'

interface BillingActivityListProps {
  entries: BillingActivityEntry[]
}

const PAGE_SIZE = 10

// Local time, with the time of day: a run of charges on one date is only
// told apart by when in the day each happened.
const formatWhen = (value: string): string => {
  if (!Number.isFinite(Date.parse(value))) return '—'
  return new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })
    .format(new Date(value))
}

const amountLabel = (amount: number): string => (amount > 0 ? `+${amount.toLocaleString()}` : amount === 0 ? '0' : amount.toLocaleString())

export const BillingActivityList = ({ entries }: BillingActivityListProps) => {
  const [showAll, setShowAll] = useState(false)
  const rows = foldActivity(entries)
  if (rows.length === 0) return null
  const visible = showAll ? rows : rows.slice(0, PAGE_SIZE)

  return (
    <section aria-labelledby="activity-title" className="space-y-3">
      <h2 id="activity-title" className="text-lg font-semibold">Activity</h2>
      <Card>
        <CardContent className="p-0">
          <ul className="divide-y">
            {visible.map((row) => (
              <li key={row.key} className="flex items-center justify-between gap-3 px-5 py-3 text-sm">
                <span className="min-w-0">
                  <span className="block truncate">
                    {row.label}
                    {row.count > 1 && <span className="text-muted-foreground"> × {row.count}</span>}
                  </span>
                  <span className="text-xs text-muted-foreground">
                    {formatWhen(row.createdAt)}
                    {row.note && <> · {row.note}</>}
                  </span>
                </span>
                <span
                  className={`shrink-0 font-medium tabular-nums ${row.amount > 0 ? 'text-emerald-700' : row.amount === 0 ? 'text-muted-foreground' : ''}`}
                >
                  {amountLabel(row.amount)}
                </span>
              </li>
            ))}
          </ul>
          {rows.length > PAGE_SIZE && (
            <div className="border-t px-5 py-2">
              <Button type="button" variant="ghost" size="sm" onClick={() => setShowAll((value) => !value)}>
                {showAll ? 'Show fewer' : `View all ${rows.length}`}
              </Button>
            </div>
          )}
        </CardContent>
      </Card>
    </section>
  )
}
