import { useQuery } from '@tanstack/react-query'
import { Loader2 } from 'lucide-react'
import { listBillingPlans } from '@/services/workspaceStaff'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { PlatformPlanRow } from '@/components/workspace/PlatformPlanRow'

/**
 * What each plan costs, for everyone. Platform-admin only.
 *
 * A Stripe Price cannot be edited, so saving creates a new one and points the
 * plan at it. Anyone already subscribed stays on the price they signed up at
 * until they move themselves, which is Stripe's behaviour and not something
 * this screen can or should paper over, so every save says so before it runs.
 */
export function PlatformPlanPricing() {
  const plansQuery = useQuery({
    queryKey: ['platform-billing-plans'],
    queryFn: listBillingPlans,
    retry: false,
    staleTime: 60_000,
  })

  return (
    <section className="space-y-4" aria-labelledby="platform-plan-pricing-title">
      <Card>
        <CardHeader>
          <CardTitle className="text-lg" id="platform-plan-pricing-title">Plan pricing</CardTitle>
          <CardDescription>
            A new price applies to new subscribers only. Existing subscribers keep the price they signed up at.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {plansQuery.isLoading ? (
            <p className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />Loading plans…
            </p>
          ) : plansQuery.isError ? (
            <div className="space-y-3 rounded-xl border border-dashed p-4 text-sm" role="alert">
              <p className="text-muted-foreground">The plans could not be loaded.</p>
              <Button type="button" variant="outline" size="sm" onClick={() => void plansQuery.refetch()}>
                Try again
              </Button>
            </div>
          ) : (
            (plansQuery.data ?? []).map((plan) => <PlatformPlanRow key={plan.plan_key} plan={plan} />)
          )}
        </CardContent>
      </Card>
    </section>
  )
}
