import { useMemo } from 'react'
import { Link, Navigate, useLocation, useParams } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { ArrowLeft, Loader2 } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { useAuth } from '@/contexts/AuthContext'
import { PlatformWorkspaceBillingHeader } from '@/components/workspace/PlatformWorkspaceBillingHeader'
import { WorkspaceCreditAdjustment } from '@/components/workspace/WorkspaceCreditAdjustment'
import { WorkspaceCreditLedger } from '@/components/workspace/WorkspaceCreditLedger'
import { WorkspaceCreditGrantPreview } from '@/components/workspace/WorkspaceCreditGrantPreview'
import { WorkspaceLayout } from '@/components/workspace/WorkspaceLayout'
import { WorkspaceMonthlyAllowance } from '@/components/workspace/WorkspaceMonthlyAllowance'
import { WorkspaceSubscriptionStatus } from '@/components/workspace/WorkspaceSubscriptionStatus'
import { listWorkspaceStaff } from '@/services/workspaceStaff'

/** What the list hands over so its back link returns to the same search and filter. */
export interface PlatformBillingListState {
  listSearch?: string
}

/**
 * One workspace's money, from the platform side: its credits, its monthly
 * allowance, corrections, and its subscription.
 *
 * These sat under the workspace list, picked from a dropdown that repeated
 * the table above it. A page of their own gives each workspace an address an
 * admin can bookmark or be linked to, and the list keeps its place.
 */
const PlatformBillingWorkspace = () => {
  const { isPlatformAdmin } = useAuth()
  const { workspaceId = '' } = useParams()
  const location = useLocation()
  const listSearch = (location.state as PlatformBillingListState | null)?.listSearch ?? ''
  const backHref = `/app/platform/billing${listSearch.startsWith('?') ? listSearch : ''}`

  // The owner's name and email come from the roster, rather than a second
  // source that could disagree with it. A workspace without one is still
  // creditable, so this only decides what is displayed.
  const staffQuery = useQuery({
    queryKey: ['platform-billing-workspace', workspaceId, 'staff'],
    queryFn: () => listWorkspaceStaff(workspaceId),
    enabled: isPlatformAdmin && Boolean(workspaceId),
    retry: false,
  })
  const owner = useMemo(
    () => staffQuery.data?.members.find((member) => member.role === 'owner' && member.status !== 'revoked'),
    [staffQuery.data],
  )

  if (!isPlatformAdmin) return <Navigate to="/app/clients" replace />

  const workspaceName = staffQuery.data?.workspace.name || 'Workspace'
  const ownerName = owner ? owner.full_name || owner.email : null

  return (
    <WorkspaceLayout>
      <div className="mx-auto w-full max-w-5xl space-y-6 pb-12">
        <Button asChild variant="ghost" size="sm" className="-ml-3 w-fit">
          <Link to={backHref}><ArrowLeft className="mr-2 h-4 w-4" />All workspaces</Link>
        </Button>

        {staffQuery.isLoading ? (
          <p className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />Loading workspace…
          </p>
        ) : staffQuery.isError || !staffQuery.data ? (
          <div className="rounded-xl border border-dashed p-6 text-sm text-muted-foreground" role="alert">
            This workspace could not be loaded. It may have been archived, or the link is wrong.
          </div>
        ) : (
          // Keyed, so moving straight to another workspace starts every form
          // empty instead of carrying a half-typed grant across.
          <div key={workspaceId} className="space-y-6">
            <header className="border-b border-border/70 pb-6">
              <PlatformWorkspaceBillingHeader
                workspaceId={workspaceId}
                workspaceName={workspaceName}
                ownerName={ownerName}
                ownerEmail={owner?.email ?? null}
              />
            </header>
            <WorkspaceCreditGrantPreview
              workspaceId={workspaceId}
              workspaceName={workspaceName}
              ownerName={ownerName}
              ownerEmail={owner?.email ?? null}
            />
            {/* A grant is a one-off; this is what arrives every month without
                anyone doing anything. */}
            <WorkspaceMonthlyAllowance workspaceId={workspaceId} workspaceName={workspaceName} />
            {/* The correction to a grant, and the subscription that decides
                what this workspace is paying in the first place. */}
            <WorkspaceCreditAdjustment workspaceId={workspaceId} workspaceName={workspaceName} />
            <WorkspaceCreditLedger workspaceId={workspaceId} />
            <WorkspaceSubscriptionStatus workspaceId={workspaceId} workspaceName={workspaceName} ownerEmail={owner?.email ?? null} />
          </div>
        )}
      </div>
    </WorkspaceLayout>
  )
}

export default PlatformBillingWorkspace
