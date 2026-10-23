import { Link } from 'react-router-dom'
import { Ban, Bot, Eye, Loader2, Send, Sparkles } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { creditCostSuffix } from '@/lib/creditCosts'
import { replySubject } from '@/lib/inboxThreads'
import type { WorkspaceClient } from '@/services/clients'
import type {
  WorkspaceInboxNudge,
  WorkspaceInboxReplyClassification,
  WorkspaceInboxThread,
  WorkspaceInboxThreadStatus,
} from '@/services/workspaceCampaigns'

interface InboxReplyComposerProps {
  selectedThread: WorkspaceInboxThread
  threadClient: WorkspaceClient | null
  missingSdrFields: string[]
  sdrFieldsLoading: boolean
  status: WorkspaceInboxThreadStatus
  canManage: boolean
  baseHref: string
  draftBody: string
  drafted: boolean
  classification: WorkspaceInboxReplyClassification | null
  nudges: WorkspaceInboxNudge[]
  sent: boolean
  /** The staged draft no longer answers the host's latest message. */
  draftStale: boolean
  /** Stale and not yet redrafted, so sending would answer an old turn. */
  staleBlocksSend: boolean
  /** An aged-out reply whose mailbox and text are still being read from the thread. */
  recoveringThread: boolean
  drafting: boolean
  sending: boolean
  statusPending: boolean
  suppressPending: boolean
  onDraftBodyChange: (body: string) => void
  onDraft: () => void
  onSend: () => void
  onSetStatus: (status: 'needs_reply' | 'booked' | 'archived') => void
  onToggleNudges: () => void
  onSuppress: () => void
}

export const InboxReplyComposer = ({
  selectedThread,
  threadClient,
  missingSdrFields,
  sdrFieldsLoading,
  status,
  canManage,
  baseHref,
  draftBody,
  drafted,
  classification,
  nudges,
  sent,
  draftStale,
  staleBlocksSend,
  recoveringThread,
  drafting,
  sending,
  statusPending,
  suppressPending,
  onDraftBodyChange,
  onDraft,
  onSend,
  onSetStatus,
  onToggleNudges,
  onSuppress,
}: InboxReplyComposerProps) => {
  /*
   * Members can read every conversation but every control below is a manager
   * action, refused by the server too. A page of greyed buttons with no
   * reason reads as broken, so say once, where the controls are, why.
   */
  const viewOnlyNotice = !canManage && (
    <div className="flex items-start gap-2.5 rounded-xl border bg-muted/20 px-4 py-3 text-xs leading-5 text-muted-foreground">
      <Eye className="mt-0.5 h-3.5 w-3.5 shrink-0" />
      <span>
        <span className="font-semibold text-foreground">You have view access.</span>{' '}
        Drafting, sending, booking and archiving are for workspace owners and admins. Ask one of them to change your role if you handle replies.
      </span>
    </div>
  )

  if (selectedThread.suppressed) {
    return (
      <div className="mt-4 rounded-xl border border-destructive/30 bg-destructive/5 px-4 py-3 text-xs leading-5 text-destructive">
        <span className="font-semibold">This address is on the do-not-contact list.</span> Replying is disabled for
        every client in this workspace. If that was recorded in error, remove it in Relationships, where the
        reversal asks for a written reason.
      </div>
    )
  }

  if (!selectedThread.campaign?.client) {
    return (
      <div className="mt-4 space-y-3">
        <div className="rounded-xl border border-amber-200 bg-amber-50/70 px-4 py-3 text-xs leading-5 text-amber-900">
          This reply is not linked to a client, so AI drafting is off. Link it to a client campaign to draft a reply.
        </div>
        {/* Suppression needs only the address, so an opt-out on an unmapped
            thread is still actionable here. The banner above the list said
            "open each one to add the address" and this was the one kind of
            thread with nothing to press when you did. */}
        {selectedThread.opt_out_detected && (
          <Button
            type="button"
            size="sm"
            variant="destructive"
            disabled={!canManage || suppressPending}
            onClick={onSuppress}
          >
            <Ban className="mr-1.5 h-3.5 w-3.5" />They asked to stop — add to do not contact
          </Button>
        )}
        {viewOnlyNotice}
      </div>
    )
  }

  const clientName = selectedThread.campaign.client.name
  const briefNotReady = Boolean(threadClient && !threadClient.ai_sdr_profile_ready)
  // A reply that aged out of the window has no text until the thread is read,
  // and a draft needs something to answer.
  const nothingToAnswer = !selectedThread.body_text.trim()

  return (
    <div className="mt-4 space-y-3">
      {viewOnlyNotice}
      {briefNotReady && (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-amber-200 bg-amber-50/70 px-4 py-3 text-xs leading-5 text-amber-900">
          <span>
            <span className="font-semibold">{clientName}&rsquo;s reply brief is not ready.</span>{' '}
            {missingSdrFields.length > 0
              ? `AI drafting is off until ${missingSdrFields.length === 1 ? 'one core field is' : `${missingSdrFields.length} core fields are`} filled in: ${missingSdrFields.join(', ')}. You can still reply manually below.`
              : sdrFieldsLoading
                ? 'Checking which fields are missing. You can still reply manually below.'
                : 'AI drafting is off until the core fields are complete — you can still reply manually below.'}
          </span>
          <Button asChild size="sm" variant="outline" className="border-amber-300 bg-background">
            <Link to={`${baseHref}/clients/${selectedThread.campaign.client.id}?tab=ai-sdr`}>Open profile</Link>
          </Button>
        </div>
      )}
      {draftStale && (
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-amber-200 bg-amber-50/70 px-4 py-3 text-xs leading-5 text-amber-900">
          <span><span className="font-semibold">This draft is no longer based on the latest message.</span> Regenerate before sending so the reply answers what the host actually said.</span>
        </div>
      )}
      {classification && drafted && (
        <div className="flex items-start gap-2.5 rounded-xl border bg-muted/10 px-4 py-3">
          <Bot className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
          <p className="text-xs leading-5 text-muted-foreground">
            <span className="font-semibold text-foreground">
              Classified as {classification.label.replace(/_/gu, ' ')}
              {classification.confidence ? ` · ${classification.confidence}% confidence` : ''}
            </span>
            {classification.reasoning ? <> — {classification.reasoning}</> : null}
          </p>
        </div>
      )}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm font-semibold">Reply for {clientName}</p>
        <Button
          type="button"
          size="sm"
          variant="outline"
          disabled={!canManage || drafting || briefNotReady || nothingToAnswer}
          title={briefNotReady
            ? 'Complete the reply brief to draft with AI. Manual replies work now.'
            : nothingToAnswer
              ? 'The host’s reply is still being loaded from the conversation.'
              : undefined}
          onClick={onDraft}
        >
          {drafting ? <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" /> : <Sparkles className="mr-2 h-3.5 w-3.5" />}
          {drafted ? `Draft again ${creditCostSuffix('query_generation')}` : `Draft reply ${creditCostSuffix('query_generation')}`}
        </Button>
      </div>
      {/* A disabled control has to say why where it sits. The banner above
          explains it, but a greyed button with the reason somewhere else
          reads as broken, not as blocked. */}
      {threadClient && briefNotReady && (
        <p className="-mt-1 text-xs leading-5 text-muted-foreground">
          <span className="font-medium text-foreground">Drafting is off</span> because{' '}
          {threadClient.name}&rsquo;s reply brief is incomplete
          {missingSdrFields.length > 0 ? ` (${missingSdrFields.join(', ')})` : ''}. Writing a reply
          yourself still works.
        </p>
      )}
      {/* Shown, not editable: the subject is what keeps this reply in the
          host's existing thread. */}
      <div
        className="flex items-center gap-2 rounded-md border bg-muted/20 px-3 py-2 text-sm text-muted-foreground"
        aria-label="Reply subject"
      >
        <span className="shrink-0 text-xs uppercase tracking-wide">Subject</span>
        <span className="truncate text-foreground" title={replySubject(selectedThread.subject)}>
          {replySubject(selectedThread.subject)}
        </span>
      </div>
      <Textarea
        value={draftBody}
        onChange={(event) => onDraftBodyChange(event.target.value)}
        placeholder="Draft a reply with AI, or write it yourself."
        aria-label="Reply body"
        className="min-h-36"
      />
      <div className="flex items-center justify-between gap-2">
        <p className="text-[11px] text-muted-foreground">
          {selectedThread.eaccount
            ? `Sends from ${selectedThread.eaccount} in the same thread.`
            : recoveringThread
              ? 'Finding the sending mailbox in the conversation…'
              : 'Sending mailbox unknown — reply from Instantly directly.'}
        </p>
        <Button
          type="button"
          size="sm"
          disabled={!canManage || sending || !draftBody.trim() || !selectedThread.eaccount || sent || staleBlocksSend}
          onClick={onSend}
        >
          {sending ? <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" /> : <Send className="mr-2 h-3.5 w-3.5" />}
          {sent ? 'Replied' : 'Send reply'}
        </Button>
      </div>
      {nudges.length > 0 && drafted && (
        <div className="rounded-xl border bg-muted/10 p-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Follow-up nudge plan
              {selectedThread.state ? ` · ${selectedThread.state.nudges_sent} of ${nudges.length} sent` : ''}
            </p>
            <Button
              type="button"
              size="sm"
              variant="ghost"
              className="h-7 text-xs text-muted-foreground"
              disabled={!canManage || statusPending}
              onClick={onToggleNudges}
            >
              {selectedThread.state?.nudges_paused ? 'Resume nudges' : 'Pause nudges'}
            </Button>
          </div>
          <ol className="mt-2 space-y-2">
            {nudges.map((nudge, index) => {
              const nudgeSent = (selectedThread.state?.nudges_sent ?? 0) > index
              return (
                <li key={`${index}-${nudge.send_after_days}`} className="text-xs leading-5">
                  <span className={`font-semibold ${nudgeSent ? 'text-emerald-700' : 'text-foreground'}`}>
                    Nudge {index + 1} · {nudgeSent ? 'sent' : `after ${nudge.send_after_days} day${nudge.send_after_days === 1 ? '' : 's'} of silence`}
                  </span>
                  <p className="mt-0.5 whitespace-pre-wrap text-muted-foreground">{nudge.body}</p>
                </li>
              )
            })}
          </ol>
          <p className="mt-2 text-[11px] text-muted-foreground">
            {selectedThread.state?.nudges_paused
              ? 'Nudges are paused for this conversation.'
              // Mirrors NUDGE_SENDING_DISABLED in inbox-nudge-tick: automated
              // dispatch is off platform-wide, and this panel must not promise
              // follow-ups nothing will send. Change both together if sending
              // is ever restored.
              : 'Automatic nudge sending is currently switched off platform-wide — this plan is staged as a reference, and these follow-ups only go out if you send them yourself.'}
          </p>
        </div>
      )}
      <div className="flex flex-wrap items-center gap-2 border-t pt-3">
        {status === 'archived' ? (
          <Button type="button" size="sm" variant="outline" disabled={!canManage || statusPending} onClick={() => onSetStatus('needs_reply')}>
            Reopen conversation
          </Button>
        ) : (
          <>
            <Button type="button" size="sm" variant="outline" disabled={!canManage || statusPending} onClick={() => onSetStatus('booked')}>
              Mark booked
            </Button>
            <Button type="button" size="sm" variant="ghost" className="text-muted-foreground" disabled={!canManage || statusPending} onClick={() => onSetStatus('archived')}>
              Archive conversation
            </Button>
            {selectedThread.opt_out_detected ? (
              <Button
                type="button"
                size="sm"
                variant="destructive"
                disabled={!canManage || suppressPending}
                onClick={onSuppress}
              >
                <Ban className="mr-1.5 h-3.5 w-3.5" />They asked to stop — add to do not contact
              </Button>
            ) : (
              <Button
                type="button"
                size="sm"
                variant="ghost"
                className="text-destructive hover:text-destructive"
                disabled={!canManage || suppressPending}
                onClick={onSuppress}
              >
                <Ban className="mr-1.5 h-3.5 w-3.5" />Do not contact
              </Button>
            )}
          </>
        )}
      </div>
    </div>
  )
}
