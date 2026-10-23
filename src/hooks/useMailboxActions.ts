import { useRef, useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import {
  setWorkspaceMailboxClient,
  setWorkspaceMailboxesPaused,
  type WorkspaceMailboxAccount,
} from '@/services/workspaceCampaigns'

const PAUSE_BATCH_SIZE = 100

interface MailboxFailure {
  email: string
  message: string
}

interface MailboxActionOptions {
  /** Called with the mailboxes a write succeeded for, so the page can drop them from the selection. */
  onDone?: (emails: string[]) => void
}

function errorMessage(error: unknown, fallback: string): string {
  return error instanceof Error ? error.message : fallback
}

/**
 * Every write the mailboxes screen makes, single-row and bulk.
 *
 * Assignment reuses the one-mailbox call and never runs two at once, across
 * rows and bulk alike: each call reads the client campaign's sender list and
 * writes it back whole, so two in flight would drop each other's mailbox. A
 * second click while one is saving queues behind it.
 */
export const useMailboxActions = (workspaceId: string, { onDone }: MailboxActionOptions = {}) => {
  const queryClient = useQueryClient()
  // Emails with a write in flight, so only those rows show a spinner.
  const [pendingEmails, setPendingEmails] = useState<Set<string>>(() => new Set())
  const assignQueue = useRef<Promise<unknown>>(Promise.resolve())

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

  const runAssign = async (input: { emails: string[]; clientId: string; clientName: string; assigned: boolean }) => {
    const failed: MailboxFailure[] = []
    let done = 0
    const progress = input.emails.length > 1
      ? toast.loading(`Assigning 0 of ${input.emails.length} to ${input.clientName}`)
      : undefined
    try {
      for (const email of input.emails) {
        try {
          await setWorkspaceMailboxClient({ workspaceId, clientId: input.clientId, email, assigned: input.assigned })
        } catch (error) {
          failed.push({ email, message: errorMessage(error, 'The assignment could not be saved.') })
        }
        done += 1
        if (progress !== undefined) toast.loading(`Assigning ${done} of ${input.emails.length} to ${input.clientName}`, { id: progress })
      }
    } finally {
      if (progress !== undefined) toast.dismiss(progress)
    }
    return { ...input, failed }
  }

  const assignMutation = useMutation({
    mutationFn: (input: { emails: string[]; clientId: string; clientName: string; assigned: boolean }) => {
      markPending(input.emails, true)
      const run = assignQueue.current.then(() => runAssign(input))
      assignQueue.current = run.catch(() => undefined)
      return run
    },
    onSuccess: ({ emails, clientName, assigned, failed }) => {
      const failedEmails = new Set(failed.map((failure) => failure.email))
      onDone?.(emails.filter((email) => !failedEmails.has(email)))
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
      toast.error(emails.length === 1
        ? failed[0].message
        : `${saved} of ${emails.length} connected to ${clientName}. ${failed.length} failed: ${failed[0].message}`)
    },
    onSettled: async (_result, _error, input) => {
      markPending(input.emails, false)
      await invalidate()
    },
  })

  const pauseMutation = useMutation({
    mutationFn: async (input: { emails: string[]; paused: boolean }) => {
      markPending(input.emails, true)
      // The server takes at most 100 per call; "select all matching" can be
      // more. A batch that fails outright is reported with its emails rather
      // than throwing away the batches that already went through.
      const result = { paused: input.paused, updated: [] as string[], failed: [] as MailboxFailure[] }
      for (let start = 0; start < input.emails.length; start += PAUSE_BATCH_SIZE) {
        const emails = input.emails.slice(start, start + PAUSE_BATCH_SIZE)
        try {
          const batch = await setWorkspaceMailboxesPaused({ workspaceId, emails, paused: input.paused })
          result.updated.push(...batch.updated)
          result.failed.push(...batch.failed)
        } catch (error) {
          const message = errorMessage(error, 'The mailboxes could not be updated.')
          result.failed.push(...emails.map((email) => ({ email, message })))
        }
      }
      return result
    },
    onSuccess: (result) => {
      onDone?.(result.updated)
      const verb = result.paused ? 'paused' : 'resumed'
      if (result.failed.length === 0) {
        toast.success(result.updated.length === 1 ? `Mailbox ${verb}.` : `${result.updated.length} mailboxes ${verb}.`)
      } else {
        toast.error(`${result.updated.length} ${verb}, ${result.failed.length} failed: ${result.failed[0].message}`)
      }
    },
    onSettled: async (_result, _error, input) => {
      markPending(input.emails, false)
      await invalidate()
    },
  })

  /**
   * Assign to a client, skipping mailboxes that cannot send: the server
   * refuses those (a campaign pointed at a broken sender silently stops), so
   * sending them would only produce a list of failures.
   */
  const assign = (accounts: WorkspaceMailboxAccount[], clientId: string, clientName: string) => {
    const active = accounts.filter((account) => account.status === 1)
    const eligible = active.filter((account) => !(account.campaigns ?? []).some((link) => link.client_id === clientId))
    const skipped = accounts.length - active.length
    if (skipped > 0) {
      toast.info(`${skipped} mailbox${skipped === 1 ? '' : 'es'} skipped because ${skipped === 1 ? 'it is' : 'they are'} not active in Instantly.`)
    }
    if (eligible.length === 0) {
      if (active.length > 0) toast.info(`Already connected to ${clientName}.`)
      return
    }
    assignMutation.mutate({ emails: eligible.map((account) => account.email), clientId, clientName, assigned: true })
  }

  const unassign = (email: string, clientId: string, clientName: string) => {
    assignMutation.mutate({ emails: [email], clientId, clientName, assigned: false })
  }

  /** Resume only what is paused; pause anything that is not already paused. */
  const setPaused = (accounts: WorkspaceMailboxAccount[], paused: boolean) => {
    const eligible = accounts.filter((account) => (paused ? account.status !== 2 : account.status === 2))
    const skipped = accounts.length - eligible.length
    if (skipped > 0) {
      toast.info(`${skipped} mailbox${skipped === 1 ? '' : 'es'} skipped because ${skipped === 1 ? 'it is' : 'they are'} ${paused ? 'already paused' : 'not paused'}.`)
    }
    if (eligible.length) pauseMutation.mutate({ emails: eligible.map((account) => account.email), paused })
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
