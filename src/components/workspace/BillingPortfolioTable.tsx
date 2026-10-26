import { AlertTriangle } from 'lucide-react'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { ATTENTION_LABELS, allowanceIsOverride, workspaceAttention } from '@/lib/billingAttention'
import { lastActiveLabel, trialView } from '@/lib/billingPortfolio'
import { formatDate } from '@/lib/dates'
import type { BillingPortfolioRow } from '@/services/workspaceStaff'

interface BillingPortfolioTableProps {
  rows: BillingPortfolioRow[]
  onSelect: (workspaceId: string) => void
}

const numberCell = 'py-2.5 pr-3 text-right tabular-nums'
const numberHead = 'py-2 pr-3 text-right font-medium'

export const BillingPortfolioTable = ({ rows, onSelect }: BillingPortfolioTableProps) => {
  const now = Date.now()
  return (
    // A table that scrolls itself rather than one that widens the page: the
    // row count grows with the business, and so does the column count.
    <div className="overflow-x-auto">
      <table className="w-full min-w-[64rem] text-sm">
        <thead>
          <tr className="border-b text-left text-xs text-muted-foreground">
            <th className="py-2 pr-3 font-medium">Workspace</th>
            <th className="py-2 pr-3 font-medium">Owner email</th>
            <th className="py-2 pr-3 font-medium">Plan</th>
            <th className="py-2 pr-3 font-medium">Trial ends</th>
            <th className="py-2 pr-3 font-medium">Card on file</th>
            <th className={numberHead}>Credits</th>
            <th className={numberHead}>
              <span title="Free credits granted to this workspace at the start of every month, on top of anything bought or granted by hand.">
                Free each month
              </span>
            </th>
            <th className={numberHead}>Credits used (month)</th>
            <th className="py-2 pr-3 font-medium">Billing</th>
            <th className="py-2 pr-3 font-medium">Last active</th>
            <th className="py-2 font-medium"><span className="sr-only">Action</span></th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => {
            const attention = workspaceAttention(row, now)
            const billingReasons = attention.reasons.filter((reason) => reason !== 'low_balance')
            const override = allowanceIsOverride(row.monthly_credit_allowance, row.plan_monthly_credit_allowance)
            const trial = trialView(row, now)
            return (
              <tr
                key={row.workspace_id}
                // The Manage button stays the keyboard path; the row is the
                // larger target for a pointer.
                onClick={() => onSelect(row.workspace_id)}
                className="cursor-pointer border-b last:border-0 hover:bg-muted/40"
              >
                <td className="py-2.5 pr-3 font-medium">{row.name}</td>
                <td className="max-w-[14rem] truncate py-2.5 pr-3" title={row.owner_email ?? undefined}>
                  {row.owner_email ?? <span className="text-muted-foreground">No owner yet</span>}
                </td>
                <td className="py-2.5 pr-3">{row.plan_name ?? row.plan_key ?? 'Founding member'}</td>
                <td className="whitespace-nowrap py-2.5 pr-3">
                  {trial.endsAt && <span className="block tabular-nums">{formatDate(trial.endsAt)}</span>}
                  <span className={`block text-xs ${trial.ended ? 'text-destructive' : 'text-muted-foreground'}`}>{trial.note}</span>
                </td>
                <td className="py-2.5 pr-3">{row.has_saved_card ? 'Yes' : 'No'}</td>
                <td className={numberCell}>
                  <div className="flex items-center justify-end gap-2">
                    {attention.reasons.includes('low_balance') && (
                      <Badge variant="outline" className="border-amber-200 bg-amber-50 text-amber-900">
                        {row.balance <= 0 ? 'Out of credits' : ATTENTION_LABELS.low_balance}
                      </Badge>
                    )}
                    <span>{row.balance.toLocaleString()}</span>
                  </div>
                </td>
                <td className={numberCell}>
                  <div className="flex items-center justify-end gap-2">
                    {override && (
                      <Badge
                        variant="outline"
                        className="border-violet-200 bg-violet-50 text-violet-900"
                        title={`Plan default is ${row.plan_monthly_credit_allowance?.toLocaleString()}/mo`}
                      >
                        Override
                      </Badge>
                    )}
                    <span>{row.monthly_credit_allowance.toLocaleString()}/mo</span>
                  </div>
                </td>
                <td className={numberCell}>{row.credits_spent_this_month.toLocaleString()}</td>
                <td className="py-2.5 pr-3">
                  <div className="flex flex-wrap items-center gap-1.5">
                    {billingReasons.length > 0 && <AlertTriangle className="h-3.5 w-3.5 text-destructive" aria-hidden="true" />}
                    <span className={billingReasons.length > 0 ? 'text-destructive' : ''}>
                      {row.billing_status.replace(/_/gu, ' ')}
                    </span>
                    {billingReasons.map((reason) => (
                      <Badge key={reason} variant="outline" className="border-destructive/30 bg-destructive/5 text-destructive">
                        {ATTENTION_LABELS[reason]}
                      </Badge>
                    ))}
                    {row.cancel_at_period_end && (
                      <Badge variant="outline" className="border-amber-200 bg-amber-50 text-amber-900">Ending</Badge>
                    )}
                  </div>
                </td>
                <td className="whitespace-nowrap py-2.5 pr-3">{lastActiveLabel(row.last_active_at, now)}</td>
                <td className="py-2.5 text-right">
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    aria-label={`Manage ${row.name}`}
                    onClick={(event) => {
                      event.stopPropagation()
                      onSelect(row.workspace_id)
                    }}
                  >
                    Manage
                  </Button>
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}
