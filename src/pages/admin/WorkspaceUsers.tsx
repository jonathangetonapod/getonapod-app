import { useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useSearchParams } from 'react-router-dom'
import { Plus } from 'lucide-react'
import { WorkspaceLayout } from '@/components/workspace/WorkspaceLayout'
import { Button } from '@/components/ui/button'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { JoinRequestsCard } from '@/components/workspace/JoinRequestsCard'
import { WorkspaceDomainsCard } from '@/components/workspace/WorkspaceDomainsCard'
import { WorkspaceRecoveryCard } from '@/components/workspace/WorkspaceRecoveryCard'
import { insideRecoveryWindow } from '@/components/workspace/agencies/ownerStatus'
import { NewWorkspaceDialog } from '@/components/workspace/agencies/NewWorkspaceDialog'
import { TemporaryPasswordDialog, type ShownCredential } from '@/components/workspace/agencies/TemporaryPasswordDialog'
import { WorkspacesTab } from '@/components/workspace/agencies/WorkspacesTab'
import { isOpenJoinRequest } from '@/lib/joinRequestTriage'
import { listJoinRequests } from '@/services/accessRequests'
import { listAdminWorkspaces, listDeletedWorkspaces } from '@/services/adminWorkspaces'
import { listWorkspaceDomains } from '@/services/workspaceDomains'
import { listWorkspaceUsers, type ManualWorkspaceCredential } from '@/services/workspaceUsers'

const TABS = ['workspaces', 'requests', 'domains', 'closed'] as const
type AgencyTab = typeof TABS[number]

const TAB_LABEL: Record<AgencyTab, string> = {
  workspaces: 'Workspaces',
  requests: 'Requests',
  domains: 'Domains',
  closed: 'Closed',
}

const isAgencyTab = (value: string | null): value is AgencyTab => TABS.includes(value as AgencyTab)

/**
 * Agencies: every agency on the platform, from the landing-page request to
 * the closed workspace waiting out its 30 days. The active tab lives in the
 * URL (?tab=requests) so a link or a refresh lands on it.
 */
const WorkspaceUsers = () => {
  const queryClient = useQueryClient()
  const [searchParams, setSearchParams] = useSearchParams()
  const [newOpen, setNewOpen] = useState(false)
  const [credential, setCredential] = useState<ShownCredential | null>(null)

  const tabParam = searchParams.get('tab')
  const tab: AgencyTab = isAgencyTab(tabParam) ? tabParam : 'workspaces'
  const highlightId = searchParams.get('highlight')
  const selectTab = (next: string) => setSearchParams((current) => {
    const params = new URLSearchParams(current)
    if (next === 'workspaces') params.delete('tab')
    else params.set('tab', next)
    params.delete('highlight')
    return params
  })

  const usersQuery = useQuery({ queryKey: ['platform', 'workspace-users'], queryFn: listWorkspaceUsers })
  const requestsQuery = useQuery({ queryKey: ['join-requests'], queryFn: listJoinRequests })
  const domainsQuery = useQuery({ queryKey: ['workspace-domains'], queryFn: listWorkspaceDomains, retry: false })
  const deletedQuery = useQuery({ queryKey: ['platform', 'deleted-workspaces'], queryFn: listDeletedWorkspaces, retry: false })
  // Tenant workspaces, for attaching a custom domain to one of them.
  const workspacesQuery = useQuery({ queryKey: ['admin-workspaces'], queryFn: listAdminWorkspaces, retry: false })

  const allMemberships = usersQuery.data || []
  const users = allMemberships.filter((user) => user.status !== 'revoked')
  const requests = requestsQuery.data || []
  const domains = domainsQuery.data || []
  const waiting = requests.filter((request) => request.status === 'new' && isOpenJoinRequest(request)).length

  const counts: Record<AgencyTab, number | null> = {
    workspaces: usersQuery.isSuccess ? users.length : null,
    requests: requestsQuery.isSuccess ? requests.filter(isOpenJoinRequest).length : null,
    domains: domainsQuery.isSuccess ? domains.length : null,
    closed: deletedQuery.isSuccess ? deletedQuery.data.filter((workspace) => insideRecoveryWindow(workspace)).length : null,
  }

  const domainWorkspaces = (workspacesQuery.data || [])
    .map((workspace) => ({ id: workspace.id, name: workspace.name }))
    .sort((left, right) => left.name.localeCompare(right.name))

  const refresh = () => Promise.all([
    queryClient.invalidateQueries({ queryKey: ['platform'] }),
    queryClient.invalidateQueries({ queryKey: ['admin-workspaces'] }),
    queryClient.invalidateQueries({ queryKey: ['workspace-domains'] }),
  ])

  const showCredential = (result: ManualWorkspaceCredential, fallbackWorkspaceName?: string) => {
    setCredential({ ...result, workspaceName: result.workspace?.name || fallbackWorkspaceName })
  }

  const workspaceIdForEmail = (email: string) => {
    const needle = email.trim().toLowerCase()
    return users.find((user) => user.email.toLowerCase() === needle)?.workspace_id ?? null
  }
  const ownerEmailFor = (workspaceId: string) => (
    allMemberships.find((user) => user.workspace_id === workspaceId && user.role === 'owner')?.email ?? null
  )

  return (
    <WorkspaceLayout>
      <div className="space-y-6">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-3xl font-bold tracking-tight">Agencies</h1>
            <p className="text-muted-foreground">Every agency on the platform, from first request to close.</p>
          </div>
          <Button onClick={() => setNewOpen(true)}><Plus className="mr-2 h-4 w-4" />New workspace</Button>
        </div>

        <Tabs value={tab} onValueChange={selectTab} activationMode="manual">
          <TabsList>
            {TABS.map((key) => (
              <TabsTrigger key={key} value={key} className="gap-1.5">
                {TAB_LABEL[key]}
                {counts[key] !== null && <span className="tabular-nums text-muted-foreground">({counts[key]})</span>}
                {key === 'requests' && waiting > 0 && (
                  <>
                    <span className="h-2 w-2 rounded-full bg-amber-500" aria-hidden="true" />
                    <span className="sr-only">, {waiting} waiting</span>
                  </>
                )}
              </TabsTrigger>
            ))}
          </TabsList>

          {/* Kept mounted so the domain tab's once-a-minute check keeps
              running and each tab keeps its filters while another is open. */}
          <TabsContent value="workspaces" forceMount className="mt-5 data-[state=inactive]:hidden">
            <WorkspacesTab
              usersQuery={usersQuery}
              users={users}
              domains={domains}
              highlightId={tab === 'workspaces' ? highlightId : null}
              onOpenDomains={() => selectTab('domains')}
              onCredential={showCredential}
              refresh={refresh}
            />
          </TabsContent>
          <TabsContent value="requests" forceMount className="mt-5 data-[state=inactive]:hidden">
            <JoinRequestsCard workspaceIdForEmail={workspaceIdForEmail} />
          </TabsContent>
          <TabsContent value="domains" forceMount className="mt-5 data-[state=inactive]:hidden">
            <WorkspaceDomainsCard workspaces={domainWorkspaces} />
          </TabsContent>
          <TabsContent value="closed" forceMount className="mt-5 data-[state=inactive]:hidden">
            <WorkspaceRecoveryCard ownerEmailFor={ownerEmailFor} />
          </TabsContent>
        </Tabs>
      </div>

      <NewWorkspaceDialog
        open={newOpen}
        onOpenChange={setNewOpen}
        onSettled={() => void refresh()}
        onCredential={showCredential}
      />
      <TemporaryPasswordDialog
        key={credential?.temporary_password ?? 'none'}
        credential={credential}
        onClose={() => setCredential(null)}
      />
    </WorkspaceLayout>
  )
}

export default WorkspaceUsers
