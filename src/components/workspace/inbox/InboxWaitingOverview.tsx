import { MessageSquare } from 'lucide-react'
import { cn } from '@/lib/utils'
import { describeWait, waitIsOverdue } from '@/lib/inboxAttention'
import type { WorkspaceInboxThread } from '@/services/workspaceCampaigns'

interface InboxWaitingOverviewProps {
  waitingThreads: WorkspaceInboxThread[]
  oldestWait: string | null
  linkedThreadMissing: boolean
  onOpen: (threadId: string) => void
}

/** The reading pane before a conversation is opened: what is waiting on us. */
export const InboxWaitingOverview = ({
  waitingThreads,
  oldestWait,
  linkedThreadMissing,
  onOpen,
}: InboxWaitingOverviewProps) => (
  <div className="w-full max-w-xl p-5 text-center lg:p-8">
    {/* A deep link whose conversation has scrolled out of the reply window
        used to land here with no explanation at all — the relationship book
        keeps threads forever, the provider window does not, and silence read
        as a broken link. */}
    {linkedThreadMissing && (
      <div role="status" className="mx-auto mb-6 max-w-xl rounded-lg border border-amber-200 bg-amber-50/70 px-4 py-3 text-sm text-amber-900">
        That saved conversation is older than the reply window, so it cannot be opened here.
        Its saved messages remain on the relationship record.
      </div>
    )}
    <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-primary/10 text-primary">
      <MessageSquare className="h-7 w-7" />
    </div>
    {waitingThreads.length === 0 ? (
      <>
        <h2 className="mt-5 text-lg font-semibold">No conversations waiting</h2>
        <p className="mx-auto mt-2 max-w-md text-sm leading-6 text-muted-foreground">
          Every reply has an answer. Open a conversation from the list to read it again.
        </p>
      </>
    ) : (
      <>
        <h2 className="mt-5 text-lg font-semibold">
          {waitingThreads.length === 1 ? '1 conversation waiting' : `${waitingThreads.length} conversations waiting`}
          {oldestWait ? `, oldest ${oldestWait}` : ''}
        </h2>
        <p className="mx-auto mt-2 max-w-md text-sm leading-6 text-muted-foreground">
          The host who has waited longest is first. Open one to read it and draft a reply.
        </p>
        <ul className="mt-5 space-y-2 text-left" aria-label="Conversations waiting longest">
          {waitingThreads.slice(0, 3).map((thread) => {
            const wait = describeWait(thread.received_at)
            return (
              <li key={thread.id}>
                <button
                  type="button"
                  aria-label={`Open the conversation with ${thread.from_email || thread.lead_email || 'an unknown sender'}`}
                  onClick={() => onOpen(thread.id)}
                  className="w-full rounded-xl border bg-background px-4 py-3 text-left transition-colors hover:bg-muted/40"
                >
                  <div className="flex items-center justify-between gap-3">
                    <span className="truncate text-sm font-medium">{thread.from_email || thread.lead_email || 'Unknown sender'}</span>
                    {wait && (
                      <span className={cn('shrink-0 text-xs font-medium tabular-nums', waitIsOverdue(thread.received_at) ? 'text-amber-700' : 'text-muted-foreground')}>
                        {wait}
                      </span>
                    )}
                  </div>
                  <p className="mt-0.5 truncate text-xs text-muted-foreground">
                    {thread.subject || '(no subject)'}{thread.campaign?.client ? ` · ${thread.campaign.client.name}` : ''}
                  </p>
                </button>
              </li>
            )
          })}
        </ul>
      </>
    )}
  </div>
)
