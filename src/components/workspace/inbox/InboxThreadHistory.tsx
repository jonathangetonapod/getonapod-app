import { Loader2, MailOpen } from 'lucide-react'
import { Button } from '@/components/ui/button'
import type { WorkspaceInboxMessage } from '@/services/workspaceCampaigns'

interface InboxThreadHistoryProps {
  open: boolean
  loading: boolean
  failed: boolean
  messages: WorkspaceInboxMessage[]
  onOpen: () => void
  onClose: () => void
  onRetry: () => void
}

/*
 * The list reads received mail only, so without this an operator answers
 * having never seen what was pitched — only what the host happened to quote
 * back.
 */
export const InboxThreadHistory = ({ open, loading, failed, messages, onOpen, onClose, onRetry }: InboxThreadHistoryProps) => {
  if (!open) {
    return (
      <Button type="button" variant="outline" size="sm" onClick={onOpen}>
        <MailOpen className="mr-2 h-3.5 w-3.5" />Show what we sent
      </Button>
    )
  }
  if (loading) {
    return (
      <p className="flex items-center gap-2 text-xs text-muted-foreground">
        <Loader2 className="h-3.5 w-3.5 animate-spin" />Loading the full conversation…
      </p>
    )
  }
  if (failed) {
    return (
      <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-destructive/30 bg-destructive/5 p-3">
        <p className="text-xs text-destructive">The conversation history could not be loaded.</p>
        <Button type="button" variant="outline" size="sm" onClick={onRetry}>Try again</Button>
      </div>
    )
  }
  if (messages.length === 0) {
    return (
      <p className="rounded-xl border border-dashed p-3 text-xs text-muted-foreground">
        Instantly returned no other messages on this thread.
      </p>
    )
  }
  return (
    <div className="space-y-2" aria-label="Full conversation">
      {messages.map((message) => (
        <div
          key={message.id}
          className={message.direction === 'outbound'
            ? 'rounded-xl border border-primary/20 bg-primary/5 p-3'
            : 'rounded-xl border bg-muted/15 p-3'}
        >
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
              {message.direction === 'outbound' ? 'We sent' : 'They replied'}
            </span>
            {message.sent_at && (
              <span className="text-[11px] text-muted-foreground">{new Date(message.sent_at).toLocaleString()}</span>
            )}
          </div>
          <p className="mt-1 text-xs font-medium">{message.subject || '(no subject)'}</p>
          <p className="mt-2 whitespace-pre-wrap text-xs leading-5 text-muted-foreground">{message.body_text || 'No text content.'}</p>
        </div>
      ))}
      <Button type="button" variant="ghost" size="sm" onClick={onClose}>Hide history</Button>
    </div>
  )
}
