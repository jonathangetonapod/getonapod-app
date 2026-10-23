import { useEffect, useMemo, useRef, useState } from 'react'
import { describeWait, sortThreadsForAttention } from '@/lib/inboxAttention'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Link, useSearchParams } from 'react-router-dom'
import {
  ArrowLeft,
  BookUser,
  CalendarCheck2,
  Inbox,
  Loader2,
  Search,
  Send,
  Sparkles,
  UserRound,
} from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'
import {
  draftWorkspaceInboxReply,
  getWorkspaceInboxLeadDetail,
  getWorkspaceInboxThreadMessages,
  getWorkspaceInboxThreads,
  setWorkspaceInboxLeadInterest,
  sendWorkspaceInboxReply,
  setWorkspaceInboxThreadStatus,
  type WorkspaceInboxNudge,
  type WorkspaceInboxReplyClassification,
  type WorkspaceInboxThread,
  type WorkspaceLeadInterestValue,
} from '@/services/workspaceCampaigns'
import { addOutreachSuppression, captureHostRelationshipThread } from '@/services/hostRelationships'
import { CLIENT_SDR_PROFILE_FIELD_DEFINITIONS } from '@/lib/clientSdrProfile'
import {
  getWorkspaceClientSdrContext,
  type WorkspaceClient,
} from '@/services/clients'
import {
  inboxFilters,
  inboxScopeOf,
  isPositiveInterest,
  recoverAgedOutThread,
  replySubject,
  threadStatus,
  type InboxFilter,
  type InboxScope,
} from '@/lib/inboxThreads'
import { useInboxDraftAutosave } from '@/hooks/useInboxDraftAutosave'
import { ClientSdrContextPanel } from '@/components/workspace/inbox/ClientSdrContextPanel'
import { InboxConversationList } from '@/components/workspace/inbox/InboxConversationList'
import { InboxLeadPanel } from '@/components/workspace/inbox/InboxLeadPanel'
import { InboxReplyComposer } from '@/components/workspace/inbox/InboxReplyComposer'
import { InboxThreadHistory } from '@/components/workspace/inbox/InboxThreadHistory'
import { InboxWaitingOverview } from '@/components/workspace/inbox/InboxWaitingOverview'
import { SuppressContactDialog } from '@/components/workspace/inbox/SuppressContactDialog'

interface MasterInboxPreviewProps {
  workspaceId: string
  clients: WorkspaceClient[]
  clientsLoading: boolean
  clientsError: Error | null
  baseHref: string
  canManage: boolean
}

const MasterInboxPreview = ({ workspaceId, clients, clientsLoading, clientsError, baseHref, canManage }: MasterInboxPreviewProps) => {
  const queryClient = useQueryClient()
  const [scope, setScope] = useState<InboxScope>('interested')
  const [suppressTarget, setSuppressTarget] = useState<WorkspaceInboxThread | null>(null)
  const [filter, setFilter] = useState<InboxFilter>('all')
  const [search, setSearch] = useState('')
  const [searchParams, setSearchParams] = useSearchParams()
  const requestedClientId = searchParams.get('client') || ''
  const selectedClient = clients.find((client) => client.id === requestedClientId) || null
  const selectedClientId = selectedClient?.id || 'all-clients'
  const activeClients = clients.filter((client) => client.status === 'active')
  const readyClientCount = activeClients.filter((client) => client.ai_sdr_profile_ready).length
  const sdrContextQuery = useQuery({
    queryKey: ['workspace-client-sdr-context', workspaceId, selectedClient?.id || 'none'],
    queryFn: () => getWorkspaceClientSdrContext(workspaceId, selectedClient!.id),
    enabled: Boolean(workspaceId && selectedClient),
    retry: false,
  })
  const inboxQuery = useQuery({
    queryKey: ['workspace-inbox', workspaceId],
    queryFn: () => getWorkspaceInboxThreads(workspaceId),
    enabled: Boolean(workspaceId),
    retry: false,
    staleTime: 30_000,
  })
  const threads = useMemo(() => inboxQuery.data?.threads ?? [], [inboxQuery.data?.threads])
  const [showFullThread, setShowFullThread] = useState(false)
  const [selectedThreadId, setSelectedThreadId] = useState<string | null>(null)
  // Arriving from a placement: open that host's conversation rather than
  // dropping the operator into the client's whole inbox to search for it.
  const requestedThreadKey = searchParams.get('thread') || ''
  const [draftBody, setDraftBody] = useState('')
  const [draftedForThread, setDraftedForThread] = useState<string | null>(null)
  const [draftClassification, setDraftClassification] = useState<WorkspaceInboxReplyClassification | null>(null)
  const [draftNudges, setDraftNudges] = useState<WorkspaceInboxNudge[]>([])
  const [sentThreadIds, setSentThreadIds] = useState<Set<string>>(new Set())
  const persistDraftEdit = useInboxDraftAutosave(workspaceId, canManage)

  const counts = useMemo(() => ({
    interested: threads.filter((thread) => inboxScopeOf(thread) === 'interested').length,
    other: threads.filter((thread) => inboxScopeOf(thread) === 'other').length,
    optOutsAwaitingAction: threads.filter((thread) => (
      thread.opt_out_detected && !thread.suppressed
    )).length,
  }), [threads])
  const filterCounts = useMemo(() => {
    const counts: Record<InboxFilter, number> = { all: 0, needs_reply: 0, review: 0, replied: 0, booked: 0, archived: 0 }
    for (const thread of threads) {
      // Count what the list under these chips can actually show: the chip
      // said "Review 3" over a list of one when the other two sat in the
      // other interest scope.
      if (inboxScopeOf(thread) !== scope) continue
      if (selectedClient && thread.campaign?.client?.id !== selectedClient.id) continue
      const status = threadStatus(thread, sentThreadIds)
      counts[status] += 1
      if (status !== 'archived') counts.all += 1
    }
    return counts
  }, [threads, scope, selectedClient, sentThreadIds])
  const visibleThreads = useMemo(() => {
    const query = search.trim().toLowerCase()
    const filtered = threads.filter((thread) => {
      if (inboxScopeOf(thread) !== scope) return false
      if (selectedClient && thread.campaign?.client?.id !== selectedClient.id) return false
      const status = threadStatus(thread, sentThreadIds)
      if (filter === 'all' ? status === 'archived' : status !== filter) return false
      if (query) {
        const haystack = [thread.subject, thread.from_email, thread.body_text, thread.campaign?.client?.name ?? '', thread.campaign?.campaign_name ?? '']
          .join(' ')
          .toLowerCase()
        if (!haystack.includes(query)) return false
      }
      return true
    })
    // Attention order, not arrival order. The host who has waited longest for
    // an answer leads; recency only orders what is already handled.
    return sortThreadsForAttention(filtered, (item) => threadStatus(item, sentThreadIds))
  }, [threads, scope, search, selectedClient, filter, sentThreadIds])
  // What is waiting on us, for the pane shown before a conversation is opened.
  // Scoped to the client filter but not to the Interested/Other toggle: a host
  // waiting in the other bucket is still waiting.
  const waitingThreads = useMemo(() => {
    const waiting = threads.filter((thread) => {
      if (selectedClient && thread.campaign?.client?.id !== selectedClient.id) return false
      const status = threadStatus(thread, sentThreadIds)
      return status === 'needs_reply' || status === 'review'
    })
    return sortThreadsForAttention(waiting, (item) => threadStatus(item, sentThreadIds))
  }, [threads, selectedClient, sentThreadIds])
  const oldestWaitingAt = waitingThreads.reduce<string | null>(
    (oldest, thread) => (thread.received_at && (!oldest || thread.received_at < oldest) ? thread.received_at : oldest),
    null,
  )
  const oldestWait = describeWait(oldestWaitingAt)?.replace(/^waiting /u, '') ?? null
  const linkedThread = requestedThreadKey
    ? threads.find((thread) => thread.thread_key === requestedThreadKey) || null
    : null
  const selectedThread = visibleThreads.find((thread) => thread.id === selectedThreadId)
    || threads.find((thread) => thread.id === selectedThreadId)
    || linkedThread
    || null
  // A deep link lands through the fallback above without running openThread,
  // which is where a persisted draft is restored — so the one entry path built
  // for returning to a conversation was the one that rendered it empty. Runs
  // once per link target, then normal selection takes over.
  const hydratedLinkRef = useRef<string | null>(null)
  useEffect(() => {
    if (!linkedThread || selectedThreadId) return
    if (hydratedLinkRef.current === linkedThread.id) return
    hydratedLinkRef.current = linkedThread.id
    openThread(linkedThread.id)
    // openThread is stable enough for this purpose and not memoized.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [linkedThread, selectedThreadId])
  // Both sides of the conversation. Loaded on request rather than with the
  // list: it is one provider call per thread, and most triage never needs it.
  // The exception is a reply that aged out of the window: its row has no
  // mailbox and no text, and the thread is the only place both still exist,
  // so it is read as soon as that conversation opens.
  const needsThreadRecovery = Boolean(selectedThread?.window_aged_out)
  const threadMessagesQuery = useQuery({
    queryKey: ['workspace-inbox-thread', workspaceId, selectedThread?.thread_key ?? ''],
    queryFn: () => getWorkspaceInboxThreadMessages(workspaceId, selectedThread!.thread_key),
    enabled: (showFullThread || needsThreadRecovery) && Boolean(workspaceId) && Boolean(selectedThread?.thread_key),
    retry: false,
    staleTime: 30_000,
  })
  const recovery = selectedThread ? recoverAgedOutThread(selectedThread, threadMessagesQuery.data) : null
  // The thread every action works on: the list row, with what an aged-out
  // reply was missing filled in from its own conversation.
  const activeThread = recovery?.thread ?? null
  const threadClient = selectedThread?.campaign?.client
    ? clients.find((client) => client.id === selectedThread.campaign?.client?.id) ?? null
    : null

  // Which core fields are missing, for the thread's own client. sdrContextQuery
  // is keyed to the client FILTER, so during all-client triage it is disabled
  // and the banner had nothing to name. "Not ready" without saying what is
  // missing sends the operator to hunt through a form.
  const threadSdrQuery = useQuery({
    queryKey: ['workspace-client-sdr-context', workspaceId, threadClient?.id ?? 'none'],
    queryFn: () => getWorkspaceClientSdrContext(workspaceId, threadClient!.id),
    enabled: Boolean(workspaceId) && Boolean(threadClient?.id) && threadClient?.ai_sdr_profile_ready === false,
    retry: false,
  })
  const missingSdrFields: string[] = (threadSdrQuery.data?.readiness.missing_core_fields ?? [])
    .flatMap((field) => {
      const label = CLIENT_SDR_PROFILE_FIELD_DEFINITIONS.find((definition) => definition.id === field)?.shortLabel
      return label ? [label] : []
    })

  // When there is no inbox to browse, there is nothing for two panes to hold.
  // The split view is sized to the viewport so the reading pane has something
  // to scroll inside; wrapping that around a one-line notice leaves most of
  // the screen blank, which reads as a broken page rather than an empty one.
  const unavailable = inboxQuery.isLoading
    ? null
    : inboxQuery.data?.connected === false
      ? {
        title: inboxQuery.data.reason ? 'Instantly declined the connected key' : 'Instantly is not connected',
        detail: inboxQuery.data.reason === 'key_rejected'
          ? 'Instantly rejected the saved API key. Reconnect Instantly in Client Campaigns with a current key.'
          : inboxQuery.data.reason === 'scope_missing'
            ? 'The saved API key cannot read emails. Reconnect Instantly with a key that has all scopes enabled.'
            : 'Connect Instantly in Client Campaigns to load replies.',
        action: true,
      }
      : inboxQuery.isError
        ? {
          title: 'Replies could not be loaded',
          detail: inboxQuery.error instanceof Error ? inboxQuery.error.message : 'Try again in a moment.',
          action: false,
        }
        : null
  // Lead identity is fetched lazily for the open conversation only: campaigns
  // built directly in Instantly have no local target row, so this is the only
  // place a host's real name, company, and engagement can come from.
  const leadDetailQuery = useQuery({
    queryKey: ['workspace-inbox-lead', workspaceId, selectedThread?.lead_id || 'none'],
    queryFn: () => getWorkspaceInboxLeadDetail(workspaceId, selectedThread!.lead_id!),
    // canManage because the server allows only managers here: without it a
    // member opening any thread with a lead fired a guaranteed, silent 403.
    enabled: Boolean(workspaceId && selectedThread?.lead_id && canManage),
    retry: false,
    staleTime: 5 * 60_000,
  })
  const leadDetail = leadDetailQuery.data ?? null
  const leadFullName = [leadDetail?.first_name, leadDetail?.last_name].filter(Boolean).join(' ').trim()

  const captureRelationshipMutation = useMutation({
    mutationFn: (thread: WorkspaceInboxThread) => {
      const isSelected = thread.id === selectedThread?.id
      return captureHostRelationshipThread(workspaceId, {
        podcastId: thread.lead_context?.podcast_id ?? null,
        // Never a stand-in name. podcast_name is the show's identity in the
        // relationship book and part of how it dedupes a host across clients,
        // so a placeholder here forks one host into two rows later. Sending
        // null lets the server resolve the show from the host's address.
        podcastName: thread.lead_context?.podcast_name || null,
        // leadDetail is fetched for the open conversation only, so its
        // identity may only be stamped on that same thread.
        hostName: (isSelected ? leadFullName : '') || thread.lead_context?.host_name || null,
        contactEmail: (isSelected ? leadDetail?.email : null)
          || thread.lead_email || thread.from_email || null,
        threadKey: thread.thread_key || thread.id,
        clientId: thread.campaign?.client?.id ?? null,
        messageId: thread.id,
        subject: thread.subject || null,
        fromEmail: thread.from_email || null,
        toEmail: thread.to_email || null,
        body: thread.body_text || null,
        receivedAt: thread.received_at,
        campaignId: thread.campaign?.campaign_id ?? null,
        campaignName: thread.campaign?.campaign_name ?? null,
      })
    },
    onSuccess: (result) => {
      // An unidentified row is a task, not a failure: say so, so nobody has to
      // notice it later in a list of shows that all look named.
      toast.success(result.show_identified === false
        ? 'Conversation saved. The show could not be identified from this address — name it in Relationships.'
        : result.relationship_created
          ? 'Relationship created and conversation saved.'
          : 'Conversation saved to the relationship book.')
      void inboxQuery.refetch()
      void queryClient.invalidateQueries({ queryKey: ['host-relationships', workspaceId] })
      void queryClient.invalidateQueries({ queryKey: ['host-relationship', workspaceId, result.podcast_id] })
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : 'The conversation could not be saved to relationships.')
    },
  })

  const draftMutation = useMutation({
    mutationFn: (thread: WorkspaceInboxThread) => draftWorkspaceInboxReply(
      workspaceId,
      thread.campaign!.client!.id,
      thread.subject || '(no subject)',
      thread.body_text,
      thread.thread_key
        ? {
          thread_key: thread.thread_key,
          email_id: thread.id,
          force: draftedForThread === thread.id,
          lead_email: thread.lead_email || thread.from_email,
        }
        : undefined,
    ),
    onSuccess: (draft, thread) => {
      /*
       * Race guard: only stage the result if the thread it was drafted for is
       * still the open conversation. Compared against the rendered thread, not
       * the selection id — a deep-linked conversation stays open through the
       * ?thread= fallback with the id null (changing the client filter clears
       * the id but not the link), and comparing the id there threw away a
       * draft the operator had just paid for, silently, into a live textarea.
       */
      if (selectedThread?.id !== thread.id) return
      // An opt-out caught while drafting is suppressed server-side with no
      // model call. Without saying so the operator saw an empty draft and a
      // classification line, and never learned the address was now silenced.
      if (draft.suppressed) {
        toast.warning('This reply asks not to be contacted. No draft was written, and the address is now on the do-not-contact list.')
        void inboxQuery.refetch()
        return
      }
      setDraftBody(draft.body)
      setDraftedForThread(thread.id)
      setDraftClassification(draft.classification)
      setDraftNudges(draft.nudges)
      void inboxQuery.refetch()
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : 'The reply draft could not be generated.')
    },
  })
  const sendMutation = useMutation({
    mutationFn: (thread: WorkspaceInboxThread) => sendWorkspaceInboxReply(workspaceId, {
      reply_to_id: thread.id,
      eaccount: thread.eaccount!,
      subject: replySubject(thread.subject),
      message: draftBody.trim(),
      ...(thread.thread_key ? { thread_key: thread.thread_key } : {}),
      ...(thread.campaign?.client ? { client_id: thread.campaign.client.id } : {}),
      // Sent so the server can refuse a reply to a suppressed address. The UI
      // hides the composer for those, but the gate belongs on the send.
      ...(thread.lead_email || thread.from_email
        ? { lead_email: (thread.lead_email || thread.from_email).trim().toLowerCase() }
        : {}),
    }),
    onSuccess: (_result, thread) => {
      setSentThreadIds((current) => new Set([...current, thread.id]))
      toast.success('Reply sent.')
      void inboxQuery.refetch()
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : 'The reply could not be sent.')
    },
  })
  const interestMutation = useMutation({
    mutationFn: (input: { thread: WorkspaceInboxThread; value: WorkspaceLeadInterestValue }) =>
      setWorkspaceInboxLeadInterest(workspaceId, {
        lead_email: input.thread.lead_email || input.thread.from_email,
        interest_value: input.value,
        ...(input.thread.campaign?.campaign_id ? { campaign_id: input.thread.campaign.campaign_id } : {}),
      }),
    onSuccess: (_result, input) => {
      // Marking a conversation changes which bucket it belongs to, so follow it
      // rather than letting it disappear out of the list being read. Every
      // positive outcome — a booked meeting included — stays under Interested.
      const movedTo: InboxScope = isPositiveInterest(input.value) ? 'interested' : 'other'
      const moved = movedTo !== scope
      setScope(movedTo)
      toast.success(input.value === null
        ? 'Status reset in Instantly. Moved to Other replies.'
        : moved
          ? movedTo === 'interested'
            ? 'Status updated. Moved to Interested.'
            : 'Status updated. Moved to Other replies.'
          : 'Status updated in Instantly.')
      void inboxQuery.refetch()
      void leadDetailQuery.refetch()
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : 'The host’s status could not be updated.')
    },
  })
  // The reply in front of the operator is often the only place an opt-out is
  // ever seen. Until now there was nothing to do about it here: the automatic
  // prefilter only suppresses threads it processes, so a request to stop that
  // arrived on an unprocessed thread simply sat in the list.
  const suppressMutation = useMutation({
    mutationFn: async (thread: WorkspaceInboxThread) => {
      const email = (thread.lead_email || thread.from_email || '').trim().toLowerCase()
      if (!email) throw new Error('This conversation has no sender address to suppress.')
      await addOutreachSuppression(workspaceId, {
        contactEmail: email,
        reason: 'opted_out',
        note: `Asked to stop in ${thread.subject ? `“${thread.subject.slice(0, 120)}”` : 'a reply'}`,
      })
      /*
       * The suppression above is the part that matters and has already
       * succeeded; a failed archive must not roll the toast back to an error.
       * But it must not be silent either — the dialog promised the
       * conversation would be archived, and a swallowed failure left that
       * promise broken with a success toast on top of it.
       */
      // Archiving is per client-mapped thread state; an unmapped thread has
      // nothing to archive and must not turn that absence into a warning.
      const clientId = thread.campaign?.client?.id
      const archived = clientId
        ? await setWorkspaceInboxThreadStatus(workspaceId, {
          thread_key: thread.thread_key,
          client_id: clientId,
          status: 'archived',
        }).then(() => true, () => false)
        : true
      return { archived }
    },
    onSuccess: ({ archived }) => {
      setSuppressTarget(null)
      if (archived) {
        toast.success('Added to do not contact. No client in this workspace will email that address again.')
      } else {
        toast.warning('Added to do not contact, but the conversation could not be archived. It may reappear in the list.')
      }
      void inboxQuery.refetch()
    },
    onError: (error) => {
      setSuppressTarget(null)
      toast.error(error instanceof Error ? error.message : 'The address could not be suppressed.')
    },
  })
  /*
   * Bulk triage. Archiving was one thread at a time, which on a Monday means
   * a click per handled conversation. Selection is offered only on threads a
   * bulk archive can actually act on — mapped, and not already archived — and
   * runs sequentially so one refusal names itself without hiding the rest.
   */
  /*
   * Keyed by thread_key, not the row id: the id is the latest message, and a
   * new reply changes it — a selection keyed on it went stale on any refetch
   * and "Archive selected" archived nothing while reporting success.
   */
  const [bulkSelectedKeys, setBulkSelectedKeys] = useState<Set<string>>(new Set())
  const [bulkArchiving, setBulkArchiving] = useState(false)
  const toggleBulkSelected = (threadKey: string) => {
    setBulkSelectedKeys((current) => {
      const next = new Set(current)
      if (next.has(threadKey)) next.delete(threadKey)
      else next.add(threadKey)
      return next
    })
  }
  // Pruned to what a bulk archive can still act on, every time the list moves:
  // a conversation archived elsewhere, or gone from the reply window, leaves
  // the selection instead of inflating its count.
  useEffect(() => {
    setBulkSelectedKeys((current) => {
      if (current.size === 0) return current
      const archivable = new Set(
        threads
          .filter((thread) => thread.thread_key && thread.campaign?.client && threadStatus(thread, sentThreadIds) !== 'archived')
          .map((thread) => thread.thread_key as string),
      )
      const next = new Set([...current].filter((key) => archivable.has(key)))
      return next.size === current.size ? current : next
    })
  }, [threads, sentThreadIds])
  const bulkArchive = async () => {
    if (bulkArchiving || bulkSelectedKeys.size === 0) return
    setBulkArchiving(true)
    let archived = 0
    let failed = 0
    for (const threadKey of bulkSelectedKeys) {
      const thread = threads.find((item) => item.thread_key === threadKey)
      if (!thread?.campaign?.client || !thread.thread_key) continue
      try {
        await setWorkspaceInboxThreadStatus(workspaceId, {
          thread_key: thread.thread_key,
          client_id: thread.campaign.client.id,
          status: 'archived',
        })
        archived += 1
      } catch (error) {
        failed += 1
        console.error('Bulk archive failed for a thread:', error)
      }
    }
    setBulkArchiving(false)
    setBulkSelectedKeys(new Set())
    if (failed > 0) toast.warning(`Archived ${archived}; ${failed} could not be archived.`)
    else if (archived === 0) toast.warning('Nothing was archived — the selection no longer matched the list.')
    else toast.success(archived === 1 ? 'Archived 1 conversation.' : `Archived ${archived} conversations.`)
    void inboxQuery.refetch()
  }

  const statusMutation = useMutation({
    mutationFn: (input: { thread: WorkspaceInboxThread; status?: 'needs_reply' | 'booked' | 'archived'; nudges_paused?: boolean }) =>
      setWorkspaceInboxThreadStatus(workspaceId, {
        thread_key: input.thread.thread_key || input.thread.id,
        client_id: input.thread.campaign!.client!.id,
        ...(input.status ? { status: input.status } : {}),
        ...(input.nudges_paused !== undefined ? { nudges_paused: input.nudges_paused } : {}),
        // Booking a conversation needs the lead address to find the outreach
        // it came from, so the placement is created against the right show.
        ...(input.status === 'booked' && (input.thread.lead_email || input.thread.from_email)
          ? { lead_email: input.thread.lead_email || input.thread.from_email }
          : {}),
      }),
    onSuccess: (_result, input) => {
      toast.success(input.status === 'archived'
        ? 'Conversation archived.'
        : input.status === 'booked'
          ? _result?.booking_id
            ? 'Booked — the placement is on the client’s calendar.'
            : 'Marked as booked.'
          : input.status === 'needs_reply'
            ? 'Conversation reopened.'
            : input.nudges_paused
              ? 'Nudges paused for this conversation.'
              : 'Nudges resumed.')
      void inboxQuery.refetch()
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : 'The conversation state could not be saved.')
    },
  })
  const openThread = (threadId: string) => {
    persistDraftEdit.flush()
    setSelectedThreadId(threadId)
    // History is per-conversation; carrying it open into the next thread would
    // show one host's messages under another's subject line.
    setShowFullThread(false)
    const thread = threads.find((item) => item.id === threadId)
    const persisted = thread?.state?.draft
    if (persisted && !thread.state?.draft_stale) {
      // Restore the staged review package (Reply-style persisted runs).
      setDraftBody(persisted.body)
      setDraftedForThread(threadId)
      setDraftClassification((thread.state?.classification ?? null) as WorkspaceInboxReplyClassification | null)
      setDraftNudges(persisted.nudges)
    } else {
      setDraftBody('')
      setDraftedForThread(null)
      setDraftClassification(null)
      setDraftNudges([])
    }
  }

  // Back from a conversation on a phone. Clearing the thread param too:
  // without that the deep-link fallback re-selected the same thread at once.
  const closeThread = () => {
    persistDraftEdit.flush()
    setSelectedThreadId(null)
    if (requestedThreadKey) {
      const next = new URLSearchParams(searchParams)
      next.delete('thread')
      setSearchParams(next, { replace: true })
    }
  }
  const selectClient = (clientId: string) => {
    const next = new URLSearchParams(searchParams)
    if (clientId === 'all-clients') next.delete('client')
    else next.set('client', clientId)
    // The deep-linked thread belongs to the client being left; carried over,
    // the link fallback kept it open under the new client with an empty draft.
    next.delete('thread')
    hydratedLinkRef.current = null
    setSearchParams(next, { replace: true })
    // Switching clients closes the previous client's open conversation, and
    // drops any bulk selection made against it: archiving rows the operator
    // can no longer see is the wrong kind of surprise.
    setSelectedThreadId(null)
    setBulkSelectedKeys(new Set())
    setDraftBody('')
    setDraftedForThread(null)
    setDraftClassification(null)
    setDraftNudges([])
  }

  return (
    <Card className="overflow-hidden shadow-none">
      {/* Scope, search, and filters only describe an inbox that loaded. With
          nothing behind them they offer controls that cannot change anything
          and counts that are zero for a reason the notice below explains. */}
      {!unavailable && (
      <div className="border-b bg-background">
        <div className="flex flex-col gap-3 p-3 lg:flex-row lg:items-center lg:justify-between lg:px-4">
          <div className="flex min-w-0 flex-wrap items-center gap-2">
            <div role="radiogroup" aria-label="Inbox scope" className="inline-flex rounded-lg border bg-muted/40 p-0.5">
              <button
                type="button"
                role="radio"
                aria-checked={scope === 'interested'}
                title="Interested, meeting booked, meeting completed and won"
                onClick={() => setScope('interested')}
                className={cn(
                  'rounded-md px-3 py-1.5 text-xs font-medium transition-colors',
                  scope === 'interested' ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground',
                )}
              >
                Interested <span className="ml-1 text-muted-foreground">{counts.interested}</span>
              </button>
              <button
                type="button"
                role="radio"
                aria-checked={scope === 'other'}
                onClick={() => setScope('other')}
                className={cn(
                  'rounded-md px-3 py-1.5 text-xs font-medium transition-colors',
                  scope === 'other' ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground',
                )}
              >
                Other replies <span className="ml-1 text-muted-foreground">{counts.other}</span>
              </button>
            </div>

            <div className="relative w-full sm:w-64">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                aria-label="Search conversations"
                placeholder="Search conversations"
                className="h-8 pl-8 text-xs"
              />
            </div>
          </div>

          <Badge variant="outline" className="w-fit gap-2 text-muted-foreground">
            <Sparkles className="h-3.5 w-3.5" />
            {clientsLoading
              ? 'Loading client reply briefs'
              : clientsError
                ? 'Client reply briefs unavailable'
                : activeClients.length === 0
                  ? 'Add a client to create a reply brief'
                  : `${readyClientCount} of ${activeClients.length} client reply brief${activeClients.length === 1 ? '' : 's'} ready`}
          </Badge>
        </div>

        <div className="flex max-w-full items-center gap-1.5 overflow-x-auto border-t bg-muted/10 px-3 py-2 lg:px-4" aria-label="Conversation filters">
          <Select value={selectedClientId} onValueChange={selectClient} disabled={clientsLoading || Boolean(clientsError)}>
            <SelectTrigger aria-label="Filter by client" className="h-7 w-40 shrink-0 gap-1.5 bg-background px-2.5 text-xs">
              <UserRound className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
              <SelectValue>
                <span className="truncate">{selectedClient ? selectedClient.name : 'All clients'}</span>
              </SelectValue>
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all-clients">All clients</SelectItem>
              {clients.map((client) => (
                <SelectItem key={client.id} value={client.id}>
                  <span className="flex items-center gap-2">
                    <span>{client.name}</span>
                    <span className={client.ai_sdr_profile_ready ? 'text-emerald-700' : 'text-amber-700'}>
                      {client.ai_sdr_profile_ready ? 'Ready' : `${client.ai_sdr_profile_completed_fields || 0}/${client.ai_sdr_profile_total_fields || 6}`}
                    </span>
                  </span>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <span className="mx-1 h-4 w-px shrink-0 bg-border" aria-hidden="true" />
          {inboxFilters.map((item) => (
            <button
              key={item.value}
              type="button"
              aria-pressed={filter === item.value}
              title={item.title}
              onClick={() => setFilter(item.value)}
              className={cn(
                'shrink-0 rounded-full border px-3 py-1 text-xs font-medium transition-colors',
                filter === item.value
                  ? 'border-primary bg-primary text-primary-foreground'
                  : 'border-border bg-background text-muted-foreground hover:text-foreground',
              )}
            >
              {item.label} <span className="ml-1 opacity-70">{filterCounts[item.value]}</span>
            </button>
          ))}
        </div>
      </div>
      )}

      {unavailable ? (
        <div className="flex flex-col items-center justify-center px-6 py-12 text-center">
          <div className="flex h-11 w-11 items-center justify-center rounded-xl border bg-background text-muted-foreground">
            <Inbox className="h-5 w-5" />
          </div>
          <h3 className="mt-4 text-sm font-semibold">{unavailable.title}</h3>
          <p className="mt-1 max-w-sm text-xs leading-5 text-muted-foreground">{unavailable.detail}</p>
          {unavailable.action && (
            <Button asChild size="sm" variant="outline" className="mt-4">
              <Link to={`${baseHref}/client-campaigns`}>Open Client Campaigns</Link>
            </Button>
          )}
        </div>
      ) : (
      <div className="grid h-[max(520px,calc(100vh-260px))] md:grid-cols-[21rem_minmax(0,1fr)]">
        {/* Below md only one pane fits, and which one follows whether a
            conversation is open: the list until one is, then the thread with
            a way back. It used to follow the client filter, which left the
            list unreachable on a phone once a client was chosen. */}
        <InboxConversationList
          threads={visibleThreads}
          loading={inboxQuery.isLoading}
          hidden={Boolean(selectedThread)}
          searching={Boolean(search.trim())}
          truncated={Boolean(inboxQuery.data?.truncated)}
          optOutsAwaitingAction={counts.optOutsAwaitingAction}
          canManage={canManage}
          selectedThreadId={selectedThread?.id ?? null}
          sentThreadIds={sentThreadIds}
          bulkSelectedKeys={bulkSelectedKeys}
          bulkArchiving={bulkArchiving}
          onToggleBulk={toggleBulkSelected}
          onClearBulk={() => setBulkSelectedKeys(new Set())}
          onBulkArchive={() => void bulkArchive()}
          onOpen={openThread}
        />

        {/* min-h-0 is load-bearing: as a grid item this column defaults to
            min-height:auto and grows to fit the thread, so the reading pane's
            overflow-y-auto below never gets a constrained parent to scroll
            against and the Card's overflow-hidden clips the rest out of reach.
            The conversation list beside it already carries the same guard. */}
        <section className={cn('min-h-0 min-w-0 flex-col bg-background', selectedThread ? 'flex' : 'hidden md:flex')}>
          {selectedThread && (
            <div className="border-b px-3 py-2 md:hidden">
              <Button type="button" variant="ghost" size="sm" onClick={closeThread}>
                <ArrowLeft className="mr-2 h-4 w-4" />Back to conversations
              </Button>
            </div>
          )}
          <div className="flex items-center justify-between border-b px-5 py-3.5">
            <div>
              <h2 className="text-sm font-semibold">{selectedThread ? 'Conversation' : selectedClient ? 'Client reply brief' : 'Conversation thread'}</h2>
              <p className="mt-0.5 text-xs text-muted-foreground">{selectedThread ? (selectedThread.campaign?.campaign_name || 'Reply from outreach') : selectedClient ? 'Preview the exact context available to matched inbox replies.' : 'Open a reply to see its history and the client’s reply brief.'}</p>
            </div>
            <div className="flex flex-wrap items-center justify-end gap-2">
              {selectedThread && canManage && (
                <Button
                  type="button"
                  size="sm"
                  variant={selectedThread.relationship ? 'secondary' : 'outline'}
                  disabled={captureRelationshipMutation.isPending}
                  onClick={() => captureRelationshipMutation.mutate(activeThread ?? selectedThread)}
                >
                  {captureRelationshipMutation.isPending
                    ? <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" />
                    : <BookUser className="mr-2 h-3.5 w-3.5" />}
                  {selectedThread.relationship ? 'Update relationship' : 'Save to relationships'}
                </Button>
              )}
              {/* The Command Center links into this inbox; this is the way
                  back. The reply's placement — stage, dates, prep — lived one
                  unaided navigation away, and the thread already knows the
                  client and, once captured, the show. */}
              {/* Only for a show the Command Center can actually resolve: a
                  captured-but-unidentified relationship gets a manual-<uuid>
                  id that matches nothing, and offering the link anyway
                  stranded the operator on an unfiltered page. */}
              {selectedThread?.relationship?.podcast_id && !selectedThread.relationship.podcast_id.startsWith('manual-') && selectedThread.campaign?.client && (
                <Button asChild size="sm" variant="outline">
                  <Link to={`${baseHref}/client-podcast-system?client=${encodeURIComponent(selectedThread.campaign.client.id)}&podcast=${encodeURIComponent(selectedThread.relationship.podcast_id)}`}>
                    <CalendarCheck2 className="mr-2 h-3.5 w-3.5" />View placement
                  </Link>
                </Button>
              )}
              <Badge variant="outline" className="text-muted-foreground">{selectedThread ? (selectedThread.campaign?.client?.name || 'Unmapped reply') : selectedClient?.name || 'No conversation selected'}</Badge>
            </div>
          </div>

          <div className={cn('flex flex-1', selectedThread ? 'min-h-0' : 'items-center justify-center')}>
            {selectedThread && activeThread && recovery ? (
              <div className="flex min-h-0 flex-1">
              <div className="flex min-h-0 flex-1 flex-col overflow-y-auto p-5">
                <div className="rounded-xl border bg-muted/15 p-4">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className="text-sm font-semibold">{activeThread.subject || '(no subject)'}</p>
                    {activeThread.received_at && (
                      <span className="text-xs text-muted-foreground">{new Date(activeThread.received_at).toLocaleString()}</span>
                    )}
                  </div>
                  <p className="mt-1 text-xs text-muted-foreground">From {activeThread.from_email || activeThread.lead_email}</p>
                  {activeThread.window_aged_out && (
                    <p className="mt-3 rounded-md border border-amber-200 bg-amber-50 p-3 text-xs leading-5 text-amber-900">
                      {threadMessagesQuery.isLoading
                        ? 'This reply has scrolled out of the inbox window. Loading it from the conversation so it can be read and answered here…'
                        : activeThread.body_text
                          ? 'This reply has scrolled out of the inbox window. Its text and sending mailbox were recovered from the conversation, so it can still be answered here.'
                          : 'This reply has scrolled out of the inbox window and could not be recovered from the conversation. Open the full conversation below, or reply from Instantly directly.'}
                    </p>
                  )}
                  {(!activeThread.window_aged_out || activeThread.body_text) && (
                    <p className="mt-3 whitespace-pre-wrap text-sm leading-6">{activeThread.body_text || 'No text content.'}</p>
                  )}
                </div>

                {activeThread.thread_key && (
                  <div className="mt-3">
                    <InboxThreadHistory
                      open={showFullThread}
                      loading={threadMessagesQuery.isLoading}
                      failed={Boolean(threadMessagesQuery.error)}
                      messages={threadMessagesQuery.data ?? []}
                      onOpen={() => setShowFullThread(true)}
                      onClose={() => setShowFullThread(false)}
                      onRetry={() => void threadMessagesQuery.refetch()}
                    />
                  </div>
                )}

                <InboxReplyComposer
                  selectedThread={activeThread}
                  threadClient={threadClient}
                  missingSdrFields={missingSdrFields}
                  sdrFieldsLoading={threadSdrQuery.isLoading}
                  status={threadStatus(activeThread, sentThreadIds)}
                  canManage={canManage}
                  baseHref={baseHref}
                  draftBody={draftBody}
                  drafted={draftedForThread === activeThread.id}
                  classification={draftClassification}
                  nudges={draftNudges}
                  sent={sentThreadIds.has(activeThread.id)}
                  draftStale={Boolean(activeThread.state?.draft_stale) || recovery.newerInboundArrived}
                  staleBlocksSend={
                    Boolean(activeThread.state?.draft_stale && draftedForThread !== activeThread.id)
                    // A newer host message than the one this draft answers:
                    // the server refuses that send as THREAD_ADVANCED anyway.
                    || recovery.newerInboundArrived
                  }
                  recoveringThread={needsThreadRecovery && threadMessagesQuery.isLoading}
                  drafting={draftMutation.isPending}
                  sending={sendMutation.isPending}
                  statusPending={statusMutation.isPending}
                  suppressPending={suppressMutation.isPending}
                  onDraftBodyChange={(body) => {
                    setDraftBody(body)
                    persistDraftEdit(activeThread, body)
                  }}
                  onDraft={() => draftMutation.mutate(activeThread)}
                  onSend={() => sendMutation.mutate(activeThread)}
                  onSetStatus={(status) => statusMutation.mutate({ thread: activeThread, status })}
                  onToggleNudges={() => statusMutation.mutate({
                    thread: activeThread,
                    nudges_paused: !activeThread.state?.nudges_paused,
                  })}
                  onSuppress={() => setSuppressTarget(activeThread)}
                />
              </div>

              <InboxLeadPanel
                selectedThread={activeThread}
                leadDetail={leadDetail}
                leadDetailLoading={leadDetailQuery.isLoading}
                sentThreadIds={sentThreadIds}
                canManage={canManage}
                interestPending={interestMutation.isPending}
                baseHref={baseHref}
                onSetInterest={(value) => interestMutation.mutate({ thread: activeThread, value })}
              />
              </div>
            ) : selectedClient ? (
              <ClientSdrContextPanel
                context={sdrContextQuery.data}
                loading={sdrContextQuery.isLoading}
                error={sdrContextQuery.error instanceof Error ? sdrContextQuery.error : null}
                client={selectedClient}
                baseHref={baseHref}
                onRetry={() => void sdrContextQuery.refetch()}
              />
            ) : (
              <InboxWaitingOverview
                waitingThreads={waitingThreads}
                oldestWait={oldestWait}
                linkedThreadMissing={Boolean(requestedThreadKey && !linkedThread && !inboxQuery.isLoading)}
                onOpen={openThread}
              />
            )}
          </div>

          <div className="border-t bg-muted/10 p-3">
            <div className="flex items-center justify-between rounded-lg border border-dashed bg-background px-4 py-3 text-xs text-muted-foreground">
              <span>{selectedClient ? 'Choose All clients to see every conversation, or open this client to edit its reply brief.' : 'Drafting, reply, and booking controls appear once a conversation is open.'}</span>
              <Send className="h-4 w-4" />
            </div>
          </div>
        </section>

      </div>
      )}

      <SuppressContactDialog
        target={suppressTarget}
        pending={suppressMutation.isPending}
        canManage={canManage}
        onCancel={() => setSuppressTarget(null)}
        onConfirm={(thread) => suppressMutation.mutate(thread)}
      />
    </Card>
  )
}

export default MasterInboxPreview
