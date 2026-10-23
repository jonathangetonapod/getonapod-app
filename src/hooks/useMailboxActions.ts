import { useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import {
  setWorkspaceMailboxClient,
  setWorkspaceMailboxesPaused,
  type WorkspaceMailboxAccount,
} from '@/services/workspaceCampaigns'

const PAUSE_BATCH_SIZE = 500

/**
 * Every write the mailboxes screen makes, single-row and bulk.
 *
 * Bulk assignment reuses the one-mailbox call in sequence, never in parallel:
 * each call reads the client campaign's sender list and writes it back whole,
 * so two in flight at once would drop each other's mailbox.
 */
export const useMailboxActions = (workspaceId: string) => {
  const queryClient = useQueryClient()
  // Emails with a write in flight, so only those rows show a spinner.
  const [pendingEmails, setPendingEmails] = useState<Set<string>>(() => new Set())

  const markPending = (emails: string[], pending: boolean) => setPendingEmails((current) => {
    const next = new Set(current)
    for (const email of emails) {
      if (pending) next.add(email)
      else next.delete(email)
    }
    return next
  })

  // Only what these writes change: this workspace's mailbox list (keyed
  // [tenant|platform, user, 'workspace', id, 'mailboxes']), its campaigns, and
  // the setup checklist's mailbox step.
  const invalidate = () => Promise.all([
    queryClient.invalidateQueries({
      predicate: (query) => {
        const [scope, , kind, keyWorkspaceId, module] = query.queryKey as unknown[]
        return (scope === 'tenant' || scope === 'platform')
          && kind === 'workspace'
          && keyWorkspaceId === workspaceId
          && module === 'mailboxes'
      },
    }),
    queryClient.invalidateQueries({ queryKey: ['workspace-client-campaigns', workspaceId] }),
    queryClient.invalidateQueries({ queryKey: ['setup-checklist', workspaceId] }),
  ])

  const assignMutation = useMutation({
    mutationFn: async (input: { emails: string[]; clientId: string; clientName: string; assigned: boolean }) => {
      markPending(input.emails, true)
      const failed: Array<{ email: string; message: string }> = []
      let done = 0
      const progress = input.emails.length > 1
        ? toast.loading(`Assigning 0 of ${input.emails.length} to ${input.clientName}`)
        : undefined
      try {
        for (const email of input.emails) {
          try {
            await setWorkspaceMailboxClient({ workspaceId, clientId: input.clientId, email, assigned: input.assigned })
          } catch (error) {
            failed.push({ email, message: error instanceof Error ? error.message : 'The assignment could not be saved.' })
          }
          done += 1
          if (progress !== undefined) toast.loading(`Assigning ${done} of ${input.emails.length} to ${input.clientName}`, { id: progress })
        }
      } finally {
        if (progress !== undefined) toast.dismiss(progress)
        markPending(input.emails, false)
      }
      return { ...input, failed }
    },
    onSuccess: async ({ emails, clientName, assigned, failed }) => {
      await invalidate()
      const saved = emails.length - failed.length
      if (failed.length === 0) {
        if (emails.length === 1) {
          toast.success(assigned
            ? `Connected to ${clientName}. It sends their outreach whenever their campaign is active.`
            : `Removed from ${clientName}'s campaign.`)
        } else {
          toast.success(`${saved} mailboxes connected to ${clientName}.`)
        }
        return
      }
      const summary = emails.length === 1
        ? failed[0].message
        : `${saved} of ${emails.length} connected to ${clientName}. ${failed.length} failed: ${failed[0].message}`
      toast.error(summary)
    },
  })

  const pauseMutation = useMutation({
    mutationFn: async (input: { emails: string[]; paused: boolean }) => {
      markPending(input.emails, true)
      try {
        // The server takes at most 500 per call; "select all matching" can be more.
        const result = { paused: input.paused, updated: [] as string[], failed: [] as Array<{ email: string; message: string }> }
        for (let start = 0; start < input.emails.length; start += PAUSE_BATCH_SIZE) {
          const batch = await setWorkspaceMailboxesPaused({
            workspaceId,
            emails: input.emails.slice(start, start + PAUSE_BATCH_SIZE),
            paused: input.paused,
          })
          result.updated.push(...batch.updated)
          result.failed.push(...batch.failed)
        }
        return result
      } finally {
        markPending(input.emails, false)
      }
    },
    onSuccess: async (result) => {
      await invalidate()
      const verb = result.paused ? 'paused' : 'resumed'
      if (result.failed.length === 0) {
        toast.success(result.updated.length === 1 ? `Mailbox ${verb}.` : `${result.updated.length} mailboxes ${verb}.`)
      } else {
        toast.error(`${result.updated.length} ${verb}, ${result.failed.length} failed: ${result.failed[0].message}`)
      }
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : 'The mailboxes could not be updated.'),
  })

  /**
   * Assign to a client, skipping mailboxes that cannot send: the server
   * refuses those (a campaign pointed at a broken sender silently stops), so
   * sending them would only produce a list of failures.
   */
  const assign = (accounts: WorkspaceMailboxAccount[], clientId: string, clientName: string) => {
    const eligible = accounts.filter((account) => (
      account.status === 1 && !(account.campaigns ?? []).some((link) => link.client_id === clientId)
    ))
    const skipped = accounts.filter((account) => account.status !== 1).length
    if (skipped > 0) {
      toast.info(`${skipped} mailbox${skipped === 1 ? '' : 'es'} skipped because ${skipped === 1 ? 'it is' : 'they are'} not active in Instantly.`)
    }
    if (eligible.length === 0) return
    assignMutation.mutate({ emails: eligible.map((account) => account.email), clientId, clientName, assigned: true })
  }

  const unassign = (email: string, clientId: string, clientName: string) => {
    assignMutation.mutate({ emails: [email], clientId, clientName, assigned: false })
  }

  const setPaused = (emails: string[], paused: boolean) => {
    if (emails.length) pauseMutation.mutate({ emails, paused })
  }

  const copyEmails = async (emails: string[]) => {
    try {
      await navigator.clipboard.writeText(emails.join('\n'))
      toast.success(emails.length === 1 ? 'Email copied.' : `${emails.length} emails copied.`)
    } catch {
      toast.error('The clipboard is not available in this browser. Select the addresses and copy them by hand.')
    }
  }

  return {
    assign,
    unassign,
    setPaused,
    copyEmails,
    pendingEmails,
    busy: assignMutation.isPending || pauseMutation.isPending,
  }
}
