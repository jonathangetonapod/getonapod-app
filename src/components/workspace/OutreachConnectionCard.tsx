import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { KeyRound, Loader2, PlugZap, RefreshCw } from 'lucide-react'
import { toast } from 'sonner'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { OutreachConnectionDialog } from '@/components/workspace/OutreachConnectionDialog'
import { campaignErrorToast } from '@/lib/campaignErrorGuidance'
import { clearMailboxCaches } from '@/lib/mailboxCache'
import { integrationProviderLabel } from '@/lib/outreachProviders'
import { relativeAge } from '@/lib/syncFreshness'
import {
  disconnectWorkspaceInstantly,
  getWorkspaceCampaignOverview,
  refreshWorkspaceCampaignAnalytics,
  refreshWorkspaceInstantly,
} from '@/services/workspaceCampaigns'

interface OutreachConnectionCardProps {
  workspaceId: string
}

/**
 * The workspace's sending-platform connection: who it is connected to, a sync,
 * and the connect / manage / disconnect dialog. Client Campaigns and workspace
 * settings both render this, so the connection can be managed from either
 * place. It reads the same overview query Client Campaigns does, so the two
 * share one request and one cache entry and cannot disagree.
 */
export const OutreachConnectionCard = ({ workspaceId }: OutreachConnectionCardProps) => {
  const queryClient = useQueryClient()
  const [connectionOpen, setConnectionOpen] = useState(false)
  const overviewQuery = useQuery({
    queryKey: ['workspace-client-campaigns', workspaceId, 'overview'],
    queryFn: () => getWorkspaceCampaignOverview(workspaceId),
    enabled: Boolean(workspaceId),
    retry: false,
    staleTime: 15_000,
  })

  const integration = overviewQuery.data?.integration || null
  const canManageCampaigns = Boolean(overviewQuery.data?.can_manage_campaigns)
  // The connected platform's name, everywhere this card names it. Before any
  // connection, the copy speaks of "a sending platform" rather than one brand.
  const providerLabel = integration?.connected || integration?.status === 'error'
    ? integrationProviderLabel(integration)
    : 'your sending platform'
  const providerName = integrationProviderLabel(integration)
  const providerCampaigns = overviewQuery.data?.provider_campaigns || []
  const unassignedCount = providerCampaigns.filter((campaign) => !campaign.mapped_client_id).length

  /*
   * One sync for what used to be two buttons: the connection (senders and the
   * campaign list) and then the campaign totals. Each step says which one
   * failed, since a working key with failing totals is a different problem.
   */
  const syncMutation = useMutation({
    mutationFn: async () => {
      try {
        await refreshWorkspaceInstantly(workspaceId)
      } catch (error) {
        throw new Error(`${providerName} connection: ${error instanceof Error ? error.message : 'could not be checked.'}`)
      }
      try {
        return await refreshWorkspaceCampaignAnalytics(workspaceId)
      } catch (error) {
        throw new Error(`Campaign totals: ${error instanceof Error ? error.message : 'could not be refreshed.'}`)
      }
    },
    onSuccess: async (result) => {
      await queryClient.invalidateQueries({ queryKey: ['workspace-client-campaigns', workspaceId] })
      // A campaign the platform no longer answers for is named as unrefreshed
      // rather than counted as done; its numbers are the last ones anybody saw.
      if (result.missing > 0) {
        toast.warning(`Synced. ${result.missing} of ${result.requested} campaigns could not be found in ${providerName}.`)
      } else {
        toast.success(`Synced with ${providerName}.`)
      }
    },
    onError: async () => {
      // The first step may have landed; show whatever it refreshed.
      await queryClient.invalidateQueries({ queryKey: ['workspace-client-campaigns', workspaceId] })
    },
  })

  /*
   * Everything that renders the connection, not only the overview: the setup
   * checklist and the mailbox lists kept saying "connected" (or named the old
   * provider) until their own stale time ran out.
   */
  const invalidateConnectionViews = async () => {
    // The stored mailbox list belongs to the platform that was connected; a
    // reload must not draw it under the new one (or under none).
    clearMailboxCaches()
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ['workspace-client-campaigns', workspaceId] }),
      queryClient.invalidateQueries({ queryKey: ['setup-checklist', workspaceId] }),
      queryClient.invalidateQueries({ queryKey: ['workspace-mailboxes', workspaceId] }),
      queryClient.invalidateQueries({
        predicate: (query) => query.queryKey.includes('mailboxes') && query.queryKey.includes(workspaceId),
      }),
    ])
  }

  const disconnectMutation = useMutation({
    mutationFn: () => disconnectWorkspaceInstantly(workspaceId),
    onSuccess: async () => {
      setConnectionOpen(false)
      await invalidateConnectionViews()
      toast.success(`${providerLabel} access removed from this workspace.`)
    },
    onError: (error) => {
      const report = campaignErrorToast(error, `${providerLabel} could not be disconnected.`)
      toast.error(report.title, report.description ? { description: report.description } : undefined)
    },
  })

  const lastSyncedAt = integration?.last_verified_at ? Date.parse(integration.last_verified_at) : Number.NaN
  const lastSyncedLabel = Number.isFinite(lastSyncedAt) ? `Last synced ${relativeAge(Math.max(0, Date.now() - lastSyncedAt))}` : null

  return (
    <>
      <Card
        data-testid="instantly-connection-card"
        className={integration?.connected ? 'border-emerald-200 bg-emerald-50/40' : 'border-amber-200 bg-amber-50/40'}
      >
        <CardContent className="flex flex-col gap-4 p-4 sm:flex-row sm:items-center sm:justify-between sm:p-5">
          <div className="flex min-w-0 items-start gap-3">
            <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${integration?.connected ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700'}`}>
              {overviewQuery.isLoading ? <Loader2 className="h-5 w-5 animate-spin" /> : <PlugZap className="h-5 w-5" />}
            </div>
            <div className="min-w-0">
              {/* Named as the platform account: on its own the account's
                  name read like a client, or like a different workspace. */}
              {integration?.connected && !overviewQuery.isLoading && (
                <p className="text-xs font-medium text-muted-foreground">{providerName} account</p>
              )}
              <div className="flex flex-wrap items-center gap-2">
                <p className="font-semibold">
                  {overviewQuery.isLoading
                    ? 'Checking the sending platform connection…'
                    : integration?.connected
                      ? integration.provider_workspace_name || `${providerName} connected`
                      : integration?.status === 'error'
                        ? `${providerName} needs attention`
                        : 'Connect a sending platform to launch outreach'}
                </p>
                {integration?.connected && <Badge variant="outline" className="border-emerald-200 bg-background text-emerald-800">Connected</Badge>}
              </div>
              <p className="mt-1 text-sm leading-5 text-muted-foreground">
                {overviewQuery.error instanceof Error
                  ? overviewQuery.error.message
                  : integration?.connected
                    ? `${integration.active_account_count} active sending account${integration.active_account_count === 1 ? '' : 's'} · ${providerCampaigns.length} campaign${providerCampaigns.length === 1 ? '' : 's'}${unassignedCount > 0 ? ` (${unassignedCount} unassigned)` : ''}`
                    : integration?.last_error || 'Draft campaigns and pitches now; the workspace owner connects Instantly, Email Bison or ReachInbox before anyone sends.'}
              </p>
            </div>
          </div>
          <div className="flex shrink-0 flex-col gap-1.5 sm:items-end">
            <div className="flex flex-wrap gap-2">
              {overviewQuery.error && (
                <Button type="button" variant="outline" size="sm" onClick={() => void overviewQuery.refetch()}>
                  <RefreshCw className="mr-2 h-4 w-4" />Try again
                </Button>
              )}
              {integration?.connected && canManageCampaigns && (
                <Button type="button" variant="outline" size="sm" disabled={syncMutation.isPending} onClick={() => syncMutation.mutate()}>
                  <RefreshCw className={`mr-2 h-4 w-4 ${syncMutation.isPending ? 'animate-spin' : ''}`} aria-hidden="true" />
                  {syncMutation.isPending ? 'Syncing campaigns…' : `Sync with ${providerName}`}
                </Button>
              )}
              {integration?.can_manage && (
                <Button
                  type="button"
                  size="sm"
                  variant={integration.connected ? 'outline' : 'default'}
                  onClick={() => setConnectionOpen(true)}
                  title={integration.connected && integration.api_key_last_four ? `Key ending ${integration.api_key_last_four}` : undefined}
                >
                  <KeyRound className="mr-2 h-4 w-4" />{integration.connected ? 'Manage connection' : 'Connect a sending platform'}
                </Button>
              )}
            </div>
            <div aria-live="polite" className="text-xs sm:text-right">
              {syncMutation.isError ? (
                <p className="flex flex-wrap items-center gap-x-2 text-red-700 sm:justify-end">
                  <span>Sync failed. {syncMutation.error instanceof Error ? syncMutation.error.message : ''}</span>
                  <button type="button" className="font-medium underline underline-offset-2" onClick={() => syncMutation.mutate()}>Try again</button>
                </p>
              ) : syncMutation.isPending ? (
                <p className="text-muted-foreground">Syncing campaigns…</p>
              ) : integration?.connected && overviewQuery.data?.provider_campaigns_error ? (
                // last_verified_at is when the key was last checked, not when
                // campaigns last loaded; next to a refresh error it read as a
                // contradiction ("Last synced just now" over "could not be refreshed").
                <p className="text-amber-800">Connected · campaigns not refreshed</p>
              ) : integration?.connected && lastSyncedLabel ? (
                <p className="text-muted-foreground">{lastSyncedLabel}</p>
              ) : null}
            </div>
          </div>
        </CardContent>
      </Card>

      <OutreachConnectionDialog
        open={connectionOpen}
        onOpenChange={setConnectionOpen}
        workspaceId={workspaceId}
        integration={integration}
        onConnected={async (label) => {
          await invalidateConnectionViews()
          toast.success(`${label} connected. You can create and launch campaigns.`)
        }}
        onDisconnect={() => disconnectMutation.mutate()}
        disconnecting={disconnectMutation.isPending}
      />
    </>
  )
}
