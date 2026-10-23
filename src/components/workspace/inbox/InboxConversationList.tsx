import { AlertCircle, Archive, Ban, Inbox, Loader2 } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { describeWait, waitIsOverdue } from '@/lib/inboxAttention'
import { inboxScopeOf, statusPill, threadStatus } from '@/lib/inboxThreads'
import type { WorkspaceInboxThread } from '@/services/workspaceCampaigns'

interface InboxConversationListProps {
  threads: WorkspaceInboxThread[]
  loading: boolean
  hidden: boolean
  searching: boolean
  truncated: boolean
  optOutsAwaitingAction: number
  canManage: boolean
  selectedThreadId: string | null
  sentThreadIds: Set<string>
  bulkSelectedKeys: Set<string>
  bulkArchiving: boolean
  onToggleBulk: (threadKey: string) => void
  onClearBulk: () => void
  onBulkArchive: () => void
  onOpen: (threadId: string) => void
}

export const InboxConversationList = ({
  threads,
  loading,
  hidden,
  searching,
  truncated,
  optOutsAwaitingAction,
  canManage,
  selectedThreadId,
  sentThreadIds,
  bulkSelectedKeys,
  bulkArchiving,
  onToggleBulk,
  onClearBulk,
  onBulkArchive,
  onOpen,
}: InboxConversationListProps) => {
  const selectable = (thread: WorkspaceInboxThread) => Boolean(
    canManage && thread.thread_key && thread.campaign?.client && threadStatus(thread, sentThreadIds) !== 'archived',
  )

  return (
    <aside className={cn('min-h-0 flex-col border-r bg-muted/10', hidden ? 'hidden md:flex' : 'flex')}>
      <div className="flex items-center justify-between border-b px-4 py-3">
        <div>
          <h2 className="text-sm font-semibold">Conversations</h2>
          <p className="mt-0.5 text-xs text-muted-foreground">Client and campaign shown on every reply</p>
        </div>
        <span className="text-xs tabular-nums text-muted-foreground">{threads.length}</span>
      </div>
      {truncated && (
        <div role="status" className="flex items-start gap-2 border-b bg-muted/30 px-4 py-2.5">
          <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-muted-foreground" />
          <p className="text-[11px] leading-4 text-muted-foreground">
            Showing the most recent replies only. Instantly has more than this window holds, so an
            older conversation may be missing — search finds only what is loaded here.
          </p>
        </div>
      )}
      {/* An unactioned request to stop is the one thing in this list that
          should not wait to be scrolled to. Counted across both scopes,
          because an opt-out does not care which bucket it landed in. */}
      {optOutsAwaitingAction > 0 && (
        <div role="status" className="flex items-start gap-2 border-b border-destructive/30 bg-destructive/5 px-4 py-2.5">
          <Ban className="mt-0.5 h-3.5 w-3.5 shrink-0 text-destructive" />
          <p className="text-[11px] leading-4 text-destructive">
            {optOutsAwaitingAction === 1
              ? '1 reply asks not to be contacted and is not on the do-not-contact list.'
              : `${optOutsAwaitingAction} replies ask not to be contacted and are not on the do-not-contact list.`}
            {' '}Open each one to add the address.
          </p>
        </div>
      )}
      {canManage && bulkSelectedKeys.size > 0 && (
        <div className="flex items-center justify-between gap-2 border-b bg-muted/30 px-4 py-2">
          <span className="text-xs text-muted-foreground">
            {bulkSelectedKeys.size === 1 ? '1 conversation selected' : `${bulkSelectedKeys.size} conversations selected`}
          </span>
          <div className="flex items-center gap-2">
            <Button type="button" size="sm" variant="ghost" className="h-7 text-xs" disabled={bulkArchiving} onClick={onClearBulk}>
              Clear
            </Button>
            <Button type="button" size="sm" variant="outline" className="h-7 text-xs" disabled={bulkArchiving} onClick={onBulkArchive}>
              {bulkArchiving ? <Loader2 className="mr-1.5 h-3 w-3 animate-spin" /> : <Archive className="mr-1.5 h-3 w-3" />}
              Archive selected
            </Button>
          </div>
        </div>
      )}
      {loading ? (
        <div className="flex flex-1 items-center justify-center gap-2 py-10 text-xs text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" />Loading replies…
        </div>
      ) : threads.length === 0 ? (
        <div className="flex flex-1 flex-col items-center justify-center px-6 py-10 text-center">
          <div className="flex h-11 w-11 items-center justify-center rounded-xl border bg-background text-muted-foreground">
            <Inbox className="h-5 w-5" />
          </div>
          <h3 className="mt-4 text-sm font-semibold">{searching ? 'No matching conversations' : 'No replies yet'}</h3>
          <p className="mt-1 max-w-52 text-xs leading-5 text-muted-foreground">
            {searching ? 'Try another name, podcast, client, or campaign.' : 'Replies from mapped client campaigns will appear here automatically.'}
          </p>
        </div>
      ) : (
        <ul className="min-h-0 flex-1 divide-y divide-border/60 overflow-y-auto" aria-label="Inbox conversations">
          {threads.map((thread) => {
            const status = threadStatus(thread, sentThreadIds)
            const pill = statusPill[status]
            const wait = status === 'needs_reply' || status === 'review'
              ? describeWait(thread.received_at)
              : null
            return (
              <li key={thread.id} className="relative">
                {/* Left edge, not right: the interested dot owns the top-right
                    corner and the first checkbox placement painted over it. */}
                {selectable(thread) && (
                  <input
                    type="checkbox"
                    aria-label={`Select conversation with ${thread.from_email || thread.lead_email || 'unknown sender'}`}
                    checked={bulkSelectedKeys.has(thread.thread_key as string)}
                    disabled={bulkArchiving}
                    onChange={() => onToggleBulk(thread.thread_key as string)}
                    onClick={(event) => event.stopPropagation()}
                    className="absolute left-3 top-3.5 z-10 h-3.5 w-3.5 accent-primary"
                  />
                )}
                <button
                  type="button"
                  onClick={() => onOpen(thread.id)}
                  className={cn(
                    'w-full px-4 py-3 text-left transition-colors hover:bg-muted/40',
                    selectable(thread) && 'pl-9',
                    selectedThreadId === thread.id && 'bg-muted/50',
                  )}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className={cn('truncate text-xs', thread.is_unread ? 'font-semibold' : 'font-medium')}>{thread.from_email || thread.lead_email}</span>
                    {inboxScopeOf(thread) === 'interested' && <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-emerald-500" aria-label="Interested" />}
                  </div>
                  <p className="mt-0.5 truncate text-xs text-foreground/90">{thread.subject || '(no subject)'}</p>
                  <p className="mt-0.5 truncate text-[11px] text-muted-foreground">
                    {thread.window_aged_out ? 'Staged for review — the reply is older than the inbox window' : thread.body_text}
                  </p>
                  <div className="mt-1.5 flex items-center gap-1.5">
                    {thread.campaign?.client
                      ? <Badge variant="secondary" className="px-1.5 py-0 text-[10px] font-medium">{thread.campaign.client.name}</Badge>
                      : <Badge variant="outline" className="border-amber-200 bg-amber-50 px-1.5 py-0 text-[10px] text-amber-800">Unmapped</Badge>}
                    {pill && <Badge variant="outline" className={cn('px-1.5 py-0 text-[10px]', pill.className)}>{pill.label}</Badge>}
                    {/* How long this host has been waiting on us. Two days of
                        silence after a warm reply is where a booking starts
                        dying, so past that it turns amber. */}
                    {wait && (
                      <span className={cn(
                        'text-[10px] font-medium tabular-nums',
                        waitIsOverdue(thread.received_at) ? 'text-amber-700' : 'text-muted-foreground',
                      )}>
                        {wait}
                      </span>
                    )}
                  </div>
                </button>
              </li>
            )
          })}
        </ul>
      )}
    </aside>
  )
}
