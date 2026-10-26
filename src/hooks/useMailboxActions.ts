import { useRef, useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import {
  setWorkspaceMailboxClient,
  setWorkspaceMailboxesPaused,
  type WorkspaceMailboxAccount,
} from '@/services/workspaceCampaigns'
import { plural } from '@/lib/plural'

const PAUSE_BATCH_SIZE = 100
const CLIENT_REFUSALS = new Set(['CAMPAIGN_NOT_FOUND', 'CLIENT_NOT_ACTIVE', 'CLIENT_NOT_FOUND'])

interface MailboxFailure {
  email: string
  message: string
}

interface AssignFailure extends MailboxFailure {
  clientName: string
}

export interface MailboxClientTarget {
  id: string
  name: string
}

interface AssignJob {
  clientId: string
  clientName: string
  emails: string[]
}

interface AssignInput {
  jobs: AssignJob[]
  assigned: boolean
}

interface MailboxActionOptions {
  /** Called with the mailboxes a write succeeded for, so the page can drop them from the selection. */
  onDone?: (emails: string[]) => void
}

function jobEmails(jobs: AssignJob[]): string[] {
  return [...new Set(jobs.flatMap((job) => job.emails))]
}

/** "Dallas", "Dallas and Rae", "Dallas, Rae and Sam"; past three, a count. */
function clientList(names: string[]): string {
  if (names.length > 3) return `${names.length} clients`
  if (names.length <= 1) return names[0] ?? ''
  return `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`
}

function errorCode(error: unknown): string | null {
  return error && typeof error === 'object' ? ((error as { code?: string | null }).code ?? null) : null
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
  // [tenant|platform, user, 'workspace', id, 'mailboxes'] on the Mailboxes
  // screen, ['workspace-mailboxes', id] on the client page), its campaigns,
  // and the setup checklist's mailbox step.
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
    // The client page's mailbox card and campaign sender picker.
    queryClient.invalidateQueries({ queryKey: ['workspace-mailboxes', workspaceId] }),
    queryClient.invalidateQueries({ queryKey: ['setup-checklist', workspaceId] }),
  ])

  const runAssign = async (input: AssignInput) => {
    const failed: AssignFailure[] = []
    const total = input.jobs.reduce((sum, job) => sum + job.emails.length, 0)
    const target = clientList(input.jobs.map((job) => job.clientName))
    let done = 0
    const progress = total > 1 ? toast.loading(`Assigning 0 of ${total} to ${target}`) : undefined
    try {
      for (const job of input.jobs) {
        for (const [index, email] of job.emails.entries()) {
          try {
            await setWorkspaceMailboxClient({ workspaceId, clientId: job.clientId, email, assigned: input.assigned })
          } catch (error) {
            // A refusal about the client itself is the same for every mailbox,
            // so the rest of this client's list would only repeat it.
            const code = errorCode(error)
            if (code && CLIENT_REFUSALS.has(code)) {
              const message = `${job.clientName}: ${errorMessage(error, 'The assignment could not be saved.')}`
              const rest = job.emails.slice(index)
              failed.push(...rest.map((skipped) => ({ email: skipped, clientName: job.clientName, message })))
              done += rest.length
              break
            }
            failed.push({ email, clientName: job.clientName, message: errorMessage(error, 'The assignment could not be saved.') })
          }
          done += 1
          if (progress !== undefined) toast.loading(`Assigning ${done} of ${total} to ${target}`, { id: progress })
        }
      }
    } finally {
      if (progress !== undefined) toast.dismiss(progress)
    }
    return { ...input, failed }
  }

  const assignMutation = useMutation({
    mutationFn: (input: AssignInput) => {
      markPending(jobEmails(input.jobs), true)
      const run = assignQueue.current.then(() => runAssign(input))
      assignQueue.current = run.catch(() => undefined)
      return run
    },
    onSuccess: ({ jobs, assigned, failed }) => {
      const emails = jobEmails(jobs)
      const failedEmails = new Set(failed.map((failure) => failure.email))
      onDone?.(emails.filter((email) => !failedEmails.has(email)))
      const target = clientList(jobs.map((job) => job.clientName))
      const total = jobs.reduce((sum, job) => sum + job.emails.length, 0)
      if (failed.length === 0) {
        if (total === 1) {
          toast.success(assigned
            ? `Connected to ${target}. It sends their outreach whenever their campaign is active.`
            : `Removed from ${target}'s campaign.`)
        } else {
          toast.success(`${plural(emails.length, 'mailbox', 'mailboxes')} connected to ${target}.`)
        }
        return
      }
      if (failed.length === total) {
        // Nothing went through: the reasons alone, once each ("Rae has no campaign yet...").
        toast.error([...new Set(failed.map((failure) => failure.message))].join(' '))
      } else if (jobs.length === 1) {
        toast.error(`${total - failed.length} of ${total} connected to ${target}. ${failed.length} failed: ${failed[0].message}`)
      } else {
        toast.error(`${total - failed.length} of ${total} connections saved. ${failed.length} failed (${failed[0].clientName}): ${failed[0].message}`)
      }
    },
    onSettled: async (_result, _error, input) => {
      markPending(jobEmails(input.jobs), false)
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
   * Assign to one or more clients. Mailboxes already on a client are left out
   * of that client's writes. One that cannot send is still sent: a client
   * whose campaign has not launched just records it, and a launched one
   * refuses it with its own reason.
   */
  const assign = (accounts: WorkspaceMailboxAccount[], clients: MailboxClientTarget[]) => {
    const jobs = clients
      .map((client) => ({
        clientId: client.id,
        clientName: client.name,
        emails: accounts
          .filter((account) => !(account.campaigns ?? []).some((link) => link.client_id === client.id))
          .map((account) => account.email),
      }))
      .filter((job) => job.emails.length > 0)
    if (jobs.length === 0) {
      if (accounts.length > 0) toast.info(`Already connected to ${clientList(clients.map((client) => client.name))}.`)
      return
    }
    assignMutation.mutate({ jobs, assigned: true })
  }

  const unassign = (email: string, clientId: string, clientName: string) => {
    assignMutation.mutate({ jobs: [{ clientId, clientName, emails: [email] }], assigned: false })
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
