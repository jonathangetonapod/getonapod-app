import type {
  WorkspaceInboxMessage,
  WorkspaceInboxThread,
  WorkspaceInboxThreadStatus,
} from '@/services/workspaceCampaigns'

export type InboxScope = 'interested' | 'other'
export type InboxFilter = 'all' | 'needs_reply' | 'review' | 'replied' | 'booked' | 'archived'

export const inboxFilters: Array<{ value: InboxFilter; label: string; title: string }> = [
  { value: 'all', label: 'All', title: 'Every open conversation in this reply scope' },
  { value: 'needs_reply', label: 'Needs reply', title: 'The host sent the newest message and no draft is staged' },
  { value: 'review', label: 'Review', title: 'An AI reply package is staged and waiting for review' },
  { value: 'replied', label: 'Replied', title: 'The workspace has replied' },
  { value: 'booked', label: 'Booked', title: 'Conversations marked as a confirmed booking' },
  { value: 'archived', label: 'Archived', title: 'Conversations closed out of the inbox — reopen any time' },
]

// Instantly lt_interest_status values.
export const INTEREST_STATUS: Record<number, { label: string; className: string }> = {
  1: { label: 'Interested', className: 'border-emerald-200 bg-emerald-50 text-emerald-800' },
  2: { label: 'Meeting booked', className: 'border-emerald-200 bg-emerald-50 text-emerald-800' },
  3: { label: 'Meeting completed', className: 'border-emerald-200 bg-emerald-50 text-emerald-800' },
  4: { label: 'Won', className: 'border-emerald-200 bg-emerald-50 text-emerald-800' },
  0: { label: 'Out of office', className: 'bg-muted text-muted-foreground' },
  [-1]: { label: 'Not interested', className: 'bg-muted text-muted-foreground' },
  [-2]: { label: 'Wrong person', className: 'bg-muted text-muted-foreground' },
  [-3]: { label: 'Lost', className: 'bg-muted text-muted-foreground' },
  [-4]: { label: 'No show', className: 'border-amber-200 bg-amber-50 text-amber-800' },
}

export const statusPill: Partial<Record<WorkspaceInboxThreadStatus, { label: string; className: string }>> = {
  review: { label: 'Review', className: 'border-sky-200 bg-sky-50 text-sky-800' },
  replied: { label: 'Replied', className: 'border-emerald-200 bg-emerald-50 text-emerald-800' },
  booked: { label: 'Booked', className: 'border-amber-200 bg-amber-50 text-amber-800' },
  archived: { label: 'Archived', className: 'bg-muted text-muted-foreground' },
}

/**
 * Whether an interest value is a positive outcome. Interested, Meeting booked,
 * Meeting completed and Won are all progress with a host; zero (out of office)
 * and the negatives are not.
 */
export const isPositiveInterest = (value: number | null | undefined): boolean =>
  typeof value === 'number' && value > 0

/**
 * Which scope a conversation belongs to. The scope used to be exactly
 * "interest status is 1", so booking a meeting — the best thing that can
 * happen to a conversation — moved it out of Interested and into Other
 * replies, beside the out-of-office notices. Every positive outcome now stays
 * under Interested. A thread with no recorded status falls back to the
 * server's interested flag.
 */
export const inboxScopeOf = (thread: Pick<WorkspaceInboxThread, 'interested' | 'interest_status'>): InboxScope => {
  if (typeof thread.interest_status === 'number') {
    return isPositiveInterest(thread.interest_status) ? 'interested' : 'other'
  }
  return thread.interested ? 'interested' : 'other'
}

export const threadStatus = (thread: WorkspaceInboxThread, sentThreadIds: Set<string>): WorkspaceInboxThreadStatus => {
  if (sentThreadIds.has(thread.id)) return 'replied'
  return thread.state?.status ?? 'needs_reply'
}

export const leadInitials = (name: string): string => {
  const parts = name.trim().split(/\s+/u).filter(Boolean)
  if (parts.length === 0) return '?'
  return (parts.length === 1 ? parts[0].slice(0, 2) : `${parts[0][0]}${parts[parts.length - 1][0]}`).toUpperCase()
}

// A reply has to keep the subject the host is already reading. Mail clients
// thread on subject as well as on the reference headers, so a changed subject —
// whether an operator retyped it or the model invented its own — lands as a
// second conversation beside the one being answered, and the host sees two.
// Derived from the thread at send time rather than held in state, so no drafting
// path can reintroduce the fork.
export const replySubject = (subject: string | null | undefined): string => {
  const original = (subject ?? '').trim()
  if (!original) return 'Re:'
  return /^re\s*:/iu.test(original) ? original : `Re: ${original}`
}

/**
 * A conversation whose list row aged out of the provider window arrives with
 * no mailbox and no reply text, which left it reviewable but neither sendable
 * nor redraftable. The full thread still has both: the inbound message the
 * staged draft answers carries its text, and any message on the thread names
 * the workspace mailbox. Returns the thread unchanged when it did not age out
 * or the history has nothing to add.
 */
export const recoverAgedOutThread = (
  thread: WorkspaceInboxThread,
  messages: WorkspaceInboxMessage[] | undefined,
): { thread: WorkspaceInboxThread; newerInboundArrived: boolean } => {
  if (!thread.window_aged_out || !messages || messages.length === 0) {
    return { thread, newerInboundArrived: false }
  }
  const inbound = messages.filter((message) => message.direction === 'inbound')
  const answered = inbound.find((message) => message.id === thread.id) ?? null
  const newestInbound = inbound[inbound.length - 1] ?? null
  // Inbound mail was received BY the workspace mailbox, so its eaccount is the
  // one to answer from; an outbound message's eaccount is the same mailbox.
  const eaccount = answered?.eaccount
    || newestInbound?.eaccount
    || messages.find((message) => message.eaccount)?.eaccount
    || null
  return {
    thread: {
      ...thread,
      eaccount: thread.eaccount || eaccount,
      body_text: thread.body_text || answered?.body_text || '',
      subject: thread.subject || answered?.subject || '',
    },
    newerInboundArrived: Boolean(newestInbound && newestInbound.id !== thread.id),
  }
}
