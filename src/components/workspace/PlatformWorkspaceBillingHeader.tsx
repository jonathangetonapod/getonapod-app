import { useQuery } from '@tanstack/react-query'

import { Badge } from '@/components/ui/badge'
import { formatExpiryBreakdown } from '@/lib/creditAdjustments'
import { planLabel, subscriptionStatusView } from '@/lib/subscriptionStatus'
import { getWorkspaceBillingOverview } from '@/services/workspaceStaff'

interface PlatformWorkspaceBillingHeaderProps {
  workspaceId: string
  workspaceName: string
  ownerName: string | null
  ownerEmail: string | null
}

/**
 * Who this is, before anything that changes their money: the workspace, its
 * owner, what it is on, and what it holds. The same overview query every card
 * below reads, so the balance here moves with a grant made under it.
 */
export const PlatformWorkspaceBillingHeader = ({
  workspaceId,
  workspaceName,
  ownerName,
  ownerEmail,
}: PlatformWorkspaceBillingHeaderProps) => {
  const overviewQuery = useQuery({
    queryKey: ['workspace-billing-overview', workspaceId],
    queryFn: () => getWorkspaceBillingOverview(workspaceId),
    retry: false,
  })
  const billing = overviewQuery.data
  const status = billing ? subscriptionStatusView(String(billing.billing_status)) : null

  return (
    <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
      <div className="min-w-0">
        <h1 className="truncate text-3xl font-bold tracking-tight">{workspaceName}</h1>
        <p className="mt-1 truncate text-sm text-muted-foreground">
          {ownerName
            ? <>Owner: <span className="font-medium text-foreground">{ownerName}</span>{ownerEmail && ownerEmail !== ownerName ? ` · ${ownerEmail}` : ''}</>
            : 'No owner has accepted the invite yet'}
        </p>
        <div className="mt-3 flex flex-wrap items-center gap-2">
          {billing && <Badge variant="outline">{planLabel(billing.plan_key)}</Badge>}
          {status && <Badge variant="outline" className={status.className}>{status.label}</Badge>}
        </div>
      </div>
      <div className="shrink-0 sm:text-right">
        <p className="text-xs text-muted-foreground">Balance</p>
        <p className="text-3xl font-semibold tabular-nums" aria-live="polite">
          {billing
            ? billing.balance.toLocaleString()
            : overviewQuery.isError ? 'Unavailable' : '…'}
          {billing && <span className="ml-1 text-sm font-normal text-muted-foreground">credits</span>}
        </p>
        {/* When it lapses, not only how much: allowance credits expire and
            bought or granted ones mostly do not. */}
        {billing && formatExpiryBreakdown(billing.balance_by_expiry) && (
          <p className="mt-1 text-xs text-muted-foreground">{formatExpiryBreakdown(billing.balance_by_expiry)}</p>
        )}
      </div>
    </div>
  )
}
