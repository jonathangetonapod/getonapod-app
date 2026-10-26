import { Link, Navigate, useLocation, useNavigate, useSearchParams } from 'react-router-dom'
import { ArrowLeft, Building2, ShieldCheck } from 'lucide-react'
import { WorkspaceLayout } from '@/components/workspace/WorkspaceLayout'
import { useAuth } from '@/contexts/AuthContext'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { BillingPortfolio } from '@/components/workspace/BillingPortfolio'
import { PlatformPlanPricing } from '@/components/workspace/PlatformPlanPricing'
import { platformBillingWorkspaceHref } from '@/lib/workspaceRoutes'
import type { PlatformBillingListState } from '@/pages/app/PlatformBillingWorkspace'

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/iu

/**
 * Platform billing administration: what each plan costs everyone, and every
 * workspace's money in one list. A row opens that workspace's own page.
 *
 * These used to sit on top of /app/settings/billing, which is a workspace's own
 * plan and balance. One page cannot be both — an agency owner reading their
 * balance and a platform admin pricing the product are different jobs, and
 * stacking them meant the platform owner scrolled past their own billing to
 * reach the tools they came for.
 */
const PlatformBilling = () => {
  const { isPlatformAdmin, workspace } = useAuth()
  const location = useLocation()
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()

  if (!isPlatformAdmin) return <Navigate to="/app/clients" replace />

  // Older links, including the credits chip in a tenant's shell before it was
  // pointed at the workspace page, named the workspace in the query string.
  const legacyWorkspaceId = (searchParams.get('workspace') || '').trim()
  if (UUID_PATTERN.test(legacyWorkspaceId)) {
    return <Navigate to={platformBillingWorkspaceHref(legacyWorkspaceId)} replace />
  }

  const openWorkspace = (workspaceId: string) => {
    const state: PlatformBillingListState = { listSearch: location.search }
    navigate(platformBillingWorkspaceHref(workspaceId), { state })
  }

  return (
    <WorkspaceLayout>
      <div className="mx-auto w-full max-w-7xl space-y-8 pb-12">
        <header className="space-y-5 border-b border-border/70 pb-6">
          <div className="flex flex-wrap items-center gap-2">
            <Button asChild variant="ghost" size="sm" className="-ml-3 w-fit">
              <Link to="/app/settings/billing"><ArrowLeft className="mr-2 h-4 w-4" />Your own billing</Link>
            </Button>
            {/* The other half of platform administration. Users, access and
                custom domains live there; money lives here. */}
            <Button asChild variant="ghost" size="sm" className="w-fit">
              <Link to="/app/manage-workspaces"><Building2 className="mr-2 h-4 w-4" />Workspaces &amp; users</Link>
            </Button>
          </div>
          <div>
            <Badge variant="secondary">
              <ShieldCheck className="mr-1.5 h-3.5 w-3.5" />Platform administration
            </Badge>
            <h1 className="mt-3 text-3xl font-bold tracking-tight sm:text-4xl">Billing administration</h1>
            <p className="mt-2 max-w-2xl text-muted-foreground">
              Everything that decides what a workspace pays and what it can spend: what each plan costs across the
              platform, a one-off credit grant to a single agency, and the allowance that agency is granted every
              month. A workspace&rsquo;s own plan, invoices and card live on its billing page, not here.
            </p>
          </div>
        </header>

        <PlatformPlanPricing />
        {/* The signed-in admin's own workspace authorizes the portfolio read;
            the rows it returns are every workspace, not just this one. */}
        {workspace?.id && <BillingPortfolio workspaceId={workspace.id} onSelect={openWorkspace} />}
      </div>
    </WorkspaceLayout>
  )
}

export default PlatformBilling
