import { useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { Loader2 } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { campaignErrorToast, errorCode } from '@/lib/campaignErrorGuidance'
import { deleteWorkspaceCampaign, type CampaignDeleteOutcome, type OutreachProviderKind } from '@/services/workspaceCampaigns'

export interface DeleteCampaignTarget {
  clientId: string
  clientName: string
  campaignName: string
  /** Whether a campaign exists on the sending platform, not only as a draft here. */
  onPlatform: boolean
  /** Pitches recorded on the campaign, staged or not. */
  pitchCount: number
}

interface DeleteCampaignDialogProps {
  workspaceId: string
  /** Null keeps the dialog closed. */
  target: DeleteCampaignTarget | null
  providerKind: OutreachProviderKind
  providerLabel: string
  onClose: () => void
  /** Also called when the campaign turns out to be gone already. */
  onDeleted?: (outcome: CampaignDeleteOutcome) => void
}

const CONFIRM_WORD = 'delete'

/** Refusals that mean the platform cannot be reached at all, so only a local removal is possible. */
const isUnreachable = (code: string | null): boolean => Boolean(code) && (
  code === 'CAMPAIGN_PLATFORM_UNREACHABLE' ||
  code === 'INSTANTLY_NOT_CONNECTED' ||
  code === 'INSTANTLY_CREDENTIAL_INVALID' ||
  code.endsWith('_KEY_REJECTED')
)

const successMessage = (outcome: CampaignDeleteOutcome, providerLabel: string): string => {
  switch (outcome) {
    case 'deleted':
      return `Campaign deleted here and in ${providerLabel}.`
    case 'paused':
      return `Campaign removed. ${providerLabel} has no way to delete a campaign through its API, so it is paused there; delete it in ${providerLabel} if you want it gone.`
    case 'missing':
      return `Campaign deleted. It was already gone from ${providerLabel}.`
    case 'skipped':
      return `Campaign removed from this app only. It is untouched in ${providerLabel}; delete or pause it there.`
    default:
      return 'Campaign deleted.'
  }
}

/**
 * Confirms and deletes a client campaign, on the sending platform and here.
 * Typing a word to confirm, because nothing about it can be undone: the
 * platform campaign, its leads and the staged pitches all go.
 */
export const DeleteCampaignDialog = ({
  workspaceId,
  target,
  providerKind,
  providerLabel,
  onClose,
  onDeleted,
}: DeleteCampaignDialogProps) => {
  const queryClient = useQueryClient()
  const [typed, setTyped] = useState('')
  // Set when the platform refused in a way only a local removal gets past.
  const [unreachable, setUnreachable] = useState(false)
  const platformDeletes = providerKind !== 'reachinbox'

  const reset = () => {
    setTyped('')
    setUnreachable(false)
  }
  const finish = async (outcome: CampaignDeleteOutcome) => {
    reset()
    onClose()
    onDeleted?.(outcome)
    await queryClient.invalidateQueries({ queryKey: ['workspace-client-campaigns', workspaceId] })
  }
  const mutation = useMutation({
    mutationFn: ({ clientId, localOnly }: { clientId: string; localOnly: boolean }) =>
      deleteWorkspaceCampaign(workspaceId, clientId, { localOnly }),
    onSuccess: async (outcome) => {
      toast.success(successMessage(outcome, providerLabel))
      await finish(outcome)
    },
    onError: async (error) => {
      const code = errorCode(error)
      const report = campaignErrorToast(error, 'The campaign could not be deleted.')
      toast.error(report.title, report.description ? { description: report.description } : undefined)
      // The list was stale; there is nothing left to delete.
      if (code === 'CAMPAIGN_NOT_FOUND') {
        await finish(null)
        return
      }
      if (isUnreachable(code)) setUnreachable(true)
    },
  })
  const confirmed = typed.trim().toLowerCase() === CONFIRM_WORD
  const close = () => {
    if (mutation.isPending) return
    reset()
    onClose()
  }
  const run = (localOnly: boolean) => target && mutation.mutate({ clientId: target.clientId, localOnly })

  return (
    <AlertDialog open={Boolean(target)} onOpenChange={(next) => !next && close()}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Delete {target?.campaignName}?</AlertDialogTitle>
          <AlertDialogDescription>This can't be undone.</AlertDialogDescription>
        </AlertDialogHeader>
        <ul className="list-disc space-y-1.5 pl-5 text-sm text-muted-foreground">
          {target?.onPlatform && (platformDeletes ? (
            <li>
              The campaign is deleted in {providerLabel}, with its leads and sequence. Hosts stop receiving emails from it.
            </li>
          ) : (
            <li>
              {providerLabel} has no way to delete a campaign through its API, so it is paused there and hosts stop receiving
              emails from it. The campaign and its leads stay in {providerLabel} until you delete them there.
            </li>
          ))}
          {target?.onPlatform && (
            <li>Any of its pitches staged into {target.clientName}'s other linked campaigns are removed from those campaigns too.</li>
          )}
          {Boolean(target?.pitchCount) && (
            <li>
              {target.pitchCount} pitch{target.pitchCount === 1 ? '' : 'es'} for {target.clientName}{' '}
              {target.pitchCount === 1 ? 'is' : 'are'} removed from this app. Bookings already made are kept.
            </li>
          )}
          <li>
            The mailboxes it sent from no longer show as assigned to {target?.clientName}. {target?.clientName} and their
            shortlist are not affected, and you can start a new campaign for them afterwards.
          </li>
        </ul>
        {unreachable && (
          <p role="alert" className="rounded-md border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">
            {providerLabel} can't be reached with the saved key, so nothing was deleted there. Reconnect it to delete the
            campaign in both places, or remove it from this app only. If it is still live in {providerLabel}, it keeps
            sending until you pause or delete it there.
          </p>
        )}
        <div className="space-y-2">
          <Label htmlFor="delete-campaign-confirm">
            Type <span className="font-mono font-semibold">{CONFIRM_WORD}</span> to confirm
          </Label>
          <Input
            id="delete-campaign-confirm"
            value={typed}
            onChange={(event) => setTyped(event.target.value)}
            autoComplete="off"
            autoFocus
            disabled={mutation.isPending}
          />
        </div>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={mutation.isPending}>Cancel</AlertDialogCancel>
          {unreachable && (
            <Button variant="outline" disabled={!confirmed || mutation.isPending || !target} onClick={() => run(true)}>
              Remove from this app only
            </Button>
          )}
          <Button variant="destructive" disabled={!confirmed || mutation.isPending || !target} onClick={() => run(false)}>
            {mutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Delete campaign
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}
