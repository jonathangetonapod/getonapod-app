import { useQuery } from '@tanstack/react-query'
import { ArrowRight } from 'lucide-react'
import { Link } from 'react-router-dom'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { planLabel, subscriptionStatusView } from '@/lib/subscriptionStatus'
import { getWorkspaceSubscriptionOverview } from '@/services/workspaceStaff'

interface SettingsBillingSectionProps {
  workspaceId: string
  billingHref: string
}

/**
 * The plan and the balance at a glance, with the way to the billing page.
 * Billing was a menu entry here with no section behind it, so choosing it
 * left Settings altogether. Buying credits and changing plan stay on the
 * billing page; this only says where things stand.
 *
 * Same query key as the header's credit chip, so the two share one request.
 */
export const SettingsBillingSection = ({ workspaceId, billingHref }: SettingsBillingSectionProps) => {
  const overviewQuery = useQuery({
    queryKey: ['workspace-subscription-overview', workspaceId],
    queryFn: () => getWorkspaceSubscriptionOverview(workspaceId),
    enabled: Boolean(workspaceId),
    retry: false,
    staleTime: 120_000,
  })
  const overview = overviewQuery.data
  const status = overview ? subscriptionStatusView(overview.billing_status) : null

  return (
    <Card className="min-w-0 max-w-full overflow-hidden border-border/70 shadow-sm">
      <CardContent className="flex flex-col gap-5 p-6 sm:flex-row sm:items-center sm:justify-between sm:p-7">
        {overviewQuery.isLoading ? (
          <div className="flex gap-8" aria-label="Loading billing">
            <Skeleton className="h-10 w-32" />
            <Skeleton className="h-10 w-32" />
          </div>
        ) : overview ? (
          <dl className="grid grid-cols-2 gap-x-8 gap-y-1 sm:flex sm:gap-10">
            <div>
              <dt className="text-xs text-muted-foreground">Plan</dt>
              <dd className="mt-1 flex flex-wrap items-center gap-2 font-semibold">
                {planLabel(overview.plan_key)}
                {status && <Badge variant="outline" className={status.className}>{status.label}</Badge>}
              </dd>
            </div>
            <div>
              <dt className="text-xs text-muted-foreground">Includes</dt>
              <dd className="mt-1 font-semibold">Unlimited clients & team members</dd>
            </div>
          </dl>
        ) : (
          <p className="text-sm text-muted-foreground">Billing details could not be loaded right now.</p>
        )}
        <Button variant="outline" className="w-fit shrink-0" asChild>
          <Link to={billingHref}>Manage billing<ArrowRight className="ml-2 h-4 w-4" /></Link>
        </Button>
      </CardContent>
    </Card>
  )
}
