import { useEffect, useState } from 'react'
import { ArrowRight, Loader2 } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { toInstantlyTimezone } from '@/lib/instantlyTimezones'
import { type WorkspaceClient } from '@/services/clients'
import { saveWorkspaceCampaign, type WorkspaceInstantlyCampaign } from '@/services/workspaceCampaigns'

interface AssignInstantlyCampaignsDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  workspaceId: string
  /** Instantly campaigns no client holds yet. */
  campaigns: WorkspaceInstantlyCampaign[]
  /** Active clients without a campaign; each can take exactly one. */
  clients: WorkspaceClient[]
  /** Pre-filled on the first campaign, when opened for one client. */
  defaultClientId?: string | null
  statusLabel: (status: number) => string
  /** Called after a run that assigned at least one campaign. */
  onAssigned: (assigned: number) => Promise<void> | void
}

interface AssignFailure {
  campaignId: string
  message: string
}

/*
 * Assigning links an existing Instantly campaign to a client. It reads the
 * campaign from Instantly and writes only our own record, so nothing in the
 * client's Instantly account changes. A client holds one campaign, so each
 * client can be picked on one row only.
 */
export const AssignInstantlyCampaignsDialog = ({
  open,
  onOpenChange,
  workspaceId,
  campaigns,
  clients,
  defaultClientId,
  statusLabel,
  onAssigned,
}: AssignInstantlyCampaignsDialogProps) => {
  const [clientByCampaign, setClientByCampaign] = useState<Record<string, string>>({})
  const [checked, setChecked] = useState<Set<string>>(new Set())
  const [reviewing, setReviewing] = useState(false)
  const [assigning, setAssigning] = useState(false)
  const [failures, setFailures] = useState<AssignFailure[]>([])

  useEffect(() => {
    if (!open) return
    const firstCampaign = campaigns[0]
    const preset = defaultClientId && firstCampaign && clients.some((client) => client.id === defaultClientId)
      ? { [firstCampaign.id]: defaultClientId }
      : {}
    setClientByCampaign(preset)
    setChecked(new Set(Object.keys(preset)))
    setReviewing(false)
    setFailures([])
    // Reset on open only; the lists refetch while the dialog is up.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

  const clientName = (clientId: string) => clients.find((client) => client.id === clientId)?.name || 'Unknown client'
  const ready = campaigns.filter((campaign) => checked.has(campaign.id) && clientByCampaign[campaign.id])
  const takenClientIds = new Set(Object.entries(clientByCampaign)
    .filter(([campaignId]) => checked.has(campaignId))
    .map(([, clientId]) => clientId))

  const chooseClient = (campaignId: string, clientId: string) => {
    setClientByCampaign((current) => ({ ...current, [campaignId]: clientId }))
    // Picking a client is choosing to assign that row.
    setChecked((current) => new Set(current).add(campaignId))
  }

  const toggleChecked = (campaignId: string, value: boolean) => {
    setChecked((current) => {
      const next = new Set(current)
      if (value) next.add(campaignId)
      else next.delete(campaignId)
      return next
    })
  }

  const assign = async () => {
    if (assigning || ready.length === 0) return
    setAssigning(true)
    const failed: AssignFailure[] = []
    let assigned = 0
    // One at a time: each assignment checks that neither the campaign nor the
    // client was taken meanwhile, and parallel calls would race that check.
    for (const campaign of ready) {
      try {
        await saveWorkspaceCampaign({
          workspaceId,
          clientId: clientByCampaign[campaign.id],
          name: campaign.name.slice(0, 180),
          timezone: toInstantlyTimezone(campaign.timezone),
          dailyLimit: Math.min(1000, Math.max(1, Math.round(campaign.daily_limit) || 30)),
          senderAccounts: campaign.sender_accounts,
          shortlistPodcastIds: [],
          providerCampaignId: campaign.id,
        })
        assigned += 1
      } catch (error) {
        failed.push({ campaignId: campaign.id, message: error instanceof Error ? error.message : 'Could not be assigned.' })
      }
    }
    setAssigning(false)
    setFailures(failed)
    if (assigned > 0) await onAssigned(assigned)
    if (failed.length === 0) {
      onOpenChange(false)
      return
    }
    // Keep only the rows that failed, so trying again retries just those.
    const failedIds = new Set(failed.map((failure) => failure.campaignId))
    setChecked((current) => new Set([...current].filter((id) => failedIds.has(id))))
    setReviewing(false)
  }

  return (
    <Dialog open={open} onOpenChange={(next) => { if (!assigning) onOpenChange(next) }}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{reviewing ? 'Confirm assignments' : 'Assign Instantly campaigns'}</DialogTitle>
          <DialogDescription>
            {reviewing
              ? 'Each campaign below is linked to the client next to it. Nothing changes in Instantly.'
              : 'Pick a client for each campaign you want to assign. A client can hold one campaign.'}
          </DialogDescription>
        </DialogHeader>

        {failures.length > 0 && !reviewing && (
          <div role="alert" className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-900">
            <p className="font-medium">{failures.length === 1 ? '1 campaign was not assigned' : `${failures.length} campaigns were not assigned`}</p>
            <ul className="mt-1 space-y-0.5 text-red-800">
              {failures.map((failure) => (
                <li key={failure.campaignId}>
                  {campaigns.find((campaign) => campaign.id === failure.campaignId)?.name || 'A campaign'}: {failure.message}
                </li>
              ))}
            </ul>
          </div>
        )}

        {reviewing ? (
          <ul className="divide-y rounded-xl border">
            {ready.map((campaign) => (
              <li key={campaign.id} className="flex flex-wrap items-center gap-2 px-4 py-3 text-sm">
                <span className="font-medium">{campaign.name}</span>
                <ArrowRight className="h-4 w-4 text-muted-foreground" aria-label="assigned to" />
                <span>{clientName(clientByCampaign[campaign.id])}</span>
              </li>
            ))}
          </ul>
        ) : campaigns.length === 0 ? (
          <p className="rounded-xl border border-dashed px-4 py-6 text-center text-sm text-muted-foreground">Every Instantly campaign is already assigned.</p>
        ) : clients.length === 0 ? (
          <p className="rounded-xl border border-dashed px-4 py-6 text-center text-sm text-muted-foreground">Every active client already has a campaign. Add or reactivate a client to assign another.</p>
        ) : (
          <ul className="divide-y rounded-xl border" aria-label="Unassigned Instantly campaigns">
            {campaigns.map((campaign) => {
              const chosen = clientByCampaign[campaign.id] || ''
              const options = clients.filter((client) => client.id === chosen || !takenClientIds.has(client.id))
              return (
                <li key={campaign.id} className="flex flex-col gap-3 px-4 py-3 sm:flex-row sm:items-center">
                  <div className="flex min-w-0 flex-1 items-start gap-3">
                    <Checkbox
                      id={`assign-${campaign.id}`}
                      className="mt-0.5"
                      checked={checked.has(campaign.id)}
                      disabled={!chosen}
                      onCheckedChange={(value) => toggleChecked(campaign.id, value === true)}
                      aria-label={`Assign ${campaign.name}`}
                    />
                    <label htmlFor={`assign-${campaign.id}`} className="min-w-0">
                      <span className="block truncate font-medium">{campaign.name}</span>
                      <span className="mt-0.5 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                        <Badge variant="outline" className="font-normal">{statusLabel(campaign.status)}</Badge>
                        {campaign.sender_accounts.length} sending account{campaign.sender_accounts.length === 1 ? '' : 's'}
                      </span>
                    </label>
                  </div>
                  <Select value={chosen} onValueChange={(value) => chooseClient(campaign.id, value)}>
                    <SelectTrigger aria-label={`Client for ${campaign.name}`} className="w-full sm:w-52">
                      <SelectValue placeholder="Choose a client" />
                    </SelectTrigger>
                    <SelectContent>
                      {options.map((client) => <SelectItem key={client.id} value={client.id}>{client.name}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </li>
              )
            })}
          </ul>
        )}

        <DialogFooter>
          <Button type="button" variant="outline" disabled={assigning} onClick={() => (reviewing ? setReviewing(false) : onOpenChange(false))}>
            {reviewing ? 'Back' : 'Cancel'}
          </Button>
          {reviewing ? (
            <Button type="button" disabled={assigning} onClick={() => void assign()}>
              {assigning && <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden="true" />}
              {assigning ? 'Assigning...' : `Assign ${ready.length} campaign${ready.length === 1 ? '' : 's'}`}
            </Button>
          ) : (
            <Button type="button" disabled={ready.length === 0} onClick={() => setReviewing(true)}>
              {ready.length === 0 ? 'Review assignments' : `Review ${ready.length} assignment${ready.length === 1 ? '' : 's'}`}<ArrowRight className="ml-2 h-4 w-4" />
            </Button>
          )}
        </DialogFooter>
        <p className="sr-only" aria-live="polite">{assigning ? `Assigning ${ready.length} campaigns` : ''}</p>
      </DialogContent>
    </Dialog>
  )
}
