import { useState, useMemo, useCallback, useRef, useEffect } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { DashboardLayout } from '@/components/admin/DashboardLayout'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { Textarea } from '@/components/ui/textarea'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Progress } from '@/components/ui/progress'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  Search,
  Mail,
  MailOpen,
  TrendingUp,
  Briefcase,
  Headphones,
  HelpCircle,
  Archive,
  ArchiveRestore,
  RefreshCw,
  Send,
  MessageSquare,
  Bot,
  Loader2,
  ChevronDown,
  Filter,
  Sparkles,
  Trash2,
  X,
} from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { toast } from 'sonner'
import { searchPodcasts, type PodcastData } from '@/services/podscan'
import { Mic, Copy, ExternalLink, PanelRightOpen, PanelRightClose, Star } from 'lucide-react'

// Types
interface CampaignReply {
  id: string
  email: string
  name: string | null
  company: string | null
  reply_content: string | null
  campaign_name: string | null
  received_at: string
  lead_type: 'sales' | 'fulfillment' | 'podcasts' | 'client_podcast' | 'other' | null
  status: 'new' | 'contacted' | 'qualified' | 'not_interested' | 'converted'
  notes: string | null
  read: boolean
  bison_reply_id: number | null
  archived: boolean
  archived_at: string | null
  ai_classified_at: string | null
  ai_confidence: 'high' | 'medium' | 'low' | null
  ai_reason: string | null
  custom_prompt: string | null
  awaiting_reply: boolean | null
  last_reply_from: string | null
  thread_checked_at: string | null
  thread_message_count: number | null
  created_at: string
  updated_at: string
}

interface ThreadMessage {
  id: number
  from_name: string
  from_email_address: string
  subject: string
  text_body: string | null
  html_body: string | null
  date_received: string
  folder: string
}

// Helper to strip HTML
function stripHtml(html: string): string {
  return html.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim()
}

// Format email body — separates quoted content from the main message
function formatEmailBody(text: string): { main: string; quoted: string | null } {
  // Common patterns for quoted email indicators
  const quotePatterns = [
    /\nOn .+wrote:\s*\n/,        // "On Mon, Mar 2... wrote:"
    /\n-{2,}\s*Original Message/i, // "-- Original Message"
    /\n>{2,}/,                     // Multiple ">" quote markers
    /\nFrom:\s*.+\nSent:\s*/,     // Outlook-style "From: ... Sent:"
    /\nSent via .+\n/i,           // "Sent via Superhuman" etc
  ]

  for (const pattern of quotePatterns) {
    const match = text.search(pattern)
    if (match > 0) {
      return {
        main: text.substring(0, match).trim(),
        quoted: text.substring(match).trim(),
      }
    }
  }

  return { main: text, quoted: null }
}

// Classification badge
function ClassificationBadge({ type, confidence }: { type: string | null; confidence?: string | null }) {
  if (!type) return <Badge variant="outline" className="text-xs">Unclassified</Badge>

  const config: Record<string, { className: string; icon: typeof Briefcase; label: string }> = {
    sales: { className: 'bg-blue-100 text-blue-800 border-blue-200', icon: Briefcase, label: 'Sales' },
    fulfillment: { className: 'bg-green-100 text-green-800 border-green-200', icon: Headphones, label: 'Fulfillment' },
    other: { className: 'bg-gray-100 text-gray-600 border-gray-200', icon: HelpCircle, label: 'Other' },
    podcasts: { className: 'bg-purple-100 text-purple-800 border-purple-200', icon: Headphones, label: 'Premium' },
    client_podcast: { className: 'bg-emerald-100 text-emerald-800 border-emerald-200', icon: Headphones, label: 'Client' },
  }

  const c = config[type] || config.other
  const Icon = c.icon
  const isLow = confidence === 'low'

  return (
    <Badge
      variant="outline"
      className={`text-xs ${c.className} ${isLow ? 'border-dashed opacity-70' : ''}`}
      title={confidence ? `AI confidence: ${confidence}` : undefined}
    >
      <Icon className="h-3 w-3 mr-1" />
      {c.label}
    </Badge>
  )
}

// Status badge
function StatusBadge({ status }: { status: string }) {
  const config: Record<string, string> = {
    new: 'bg-yellow-100 text-yellow-800',
    contacted: 'bg-blue-100 text-blue-800',
    qualified: 'bg-green-100 text-green-800',
    not_interested: 'bg-red-100 text-red-800',
    converted: 'bg-purple-100 text-purple-800',
  }

  return (
    <Badge variant="outline" className={`text-xs ${config[status] || ''}`}>
      {status.replace('_', ' ')}
    </Badge>
  )
}

// Time ago helper
function timeAgo(dateStr: string): string {
  const now = new Date()
  const date = new Date(dateStr)
  const seconds = Math.floor((now.getTime() - date.getTime()) / 1000)

  if (seconds < 60) return 'just now'
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`
  if (seconds < 604800) return `${Math.floor(seconds / 86400)}d ago`
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

function buildDefaultPrompt(reply: CampaignReply): string {
  let roleContext = ''
  if (reply.lead_type === 'sales') {
    roleContext = `This is a SALES lead — a prospect who might hire GOAP to book them on podcasts. Your goal is to move them toward booking a call or learning more about GOAP's services. Be helpful, professional, and consultative.`
  } else if (reply.lead_type === 'fulfillment') {
    roleContext = `This is a FULFILLMENT thread — a podcast host/producer responding to a guest pitch on behalf of a GOAP client. Your goal is to coordinate scheduling, provide any requested info about the guest, and confirm the booking. Be friendly and accommodating.`
  } else {
    roleContext = `Respond appropriately based on the context of the conversation.`
  }

  return `You are writing an email reply on behalf of GOAP (Get On A Pod), a podcast booking agency. GOAP helps clients get booked as guests on podcasts.

${roleContext}

Contact info:
- Name: ${reply.name || 'Unknown'}
- Email: ${reply.email || 'Unknown'}
- Company: ${reply.company || 'Unknown'}
${reply.ai_reason ? `- AI classification note: ${reply.ai_reason}` : ''}

Write a concise, natural reply to the most recent message. Rules:
- Write ONLY the reply body text, no subject line, no "Dear X" unless appropriate
- Match the tone of the conversation (formal if they're formal, casual if they're casual)
- Keep it short and actionable
- Do not use generic filler phrases like "I hope this email finds you well"
- Do not sign off with a name — the email system handles signatures
- Write in plain text, no HTML or markdown`
}

export default function LeadsManagement() {
  const queryClient = useQueryClient()

  // State
  const [searchTerm, setSearchTerm] = useState('')
  const [classificationFilter, setClassificationFilter] = useState<string>('all')
  const [statusFilter, setStatusFilter] = useState<string>('all')
  const [readFilter, setReadFilter] = useState<string>('all')
  const [replyOwnerFilter, setReplyOwnerFilter] = useState<string>('all')
  const [showArchived, setShowArchived] = useState(false)
  const [selectedReplyId, setSelectedReplyId] = useState<string | null>(null)
  const [replyText, setReplyText] = useState('')
  const [showReplyComposer, setShowReplyComposer] = useState(false)
  const [showFilters, setShowFilters] = useState(false)
  const [reclassifyingIds, setReclassifyingIds] = useState<Set<string>>(new Set())
  const [bulkClassifying, setBulkClassifying] = useState(false)
  const [bulkProgress, setBulkProgress] = useState<{ done: number; total: number } | null>(null)
  const [localNotes, setLocalNotes] = useState('')
  const notesTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const promptTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const [generatingReply, setGeneratingReply] = useState(false)
  const [customPrompt, setCustomPrompt] = useState('')
  const [showPodcastSidebar, setShowPodcastSidebar] = useState(false)
  const [podcastSearchTerm, setPodcastSearchTerm] = useState('')
  const [podcastResults, setPodcastResults] = useState<PodcastData[]>([])
  const [podcastSearching, setPodcastSearching] = useState(false)
  const [podcastPage, setPodcastPage] = useState(1)
  const [podcastHasMore, setPodcastHasMore] = useState(false)
  const [podcastLoadingMore, setPodcastLoadingMore] = useState(false)

  // Fetch all replies
  const { data: replies = [], isLoading: repliesLoading, refetch: refetchReplies } = useQuery({
    queryKey: ['campaign-replies'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('campaign_replies')
        .select('*')
        .order('received_at', { ascending: false })

      if (error) throw error
      return data as CampaignReply[]
    },
  })

  // Filtered replies
  const filteredReplies = useMemo(() => {
    return replies.filter((r) => {
      // Archive filter
      if (!showArchived && r.archived) return false
      if (showArchived && !r.archived) return false

      // Search
      if (searchTerm) {
        const term = searchTerm.toLowerCase()
        const matchesSearch =
          (r.name || '').toLowerCase().includes(term) ||
          r.email.toLowerCase().includes(term) ||
          (r.company || '').toLowerCase().includes(term) ||
          (r.reply_content || '').toLowerCase().includes(term) ||
          (r.campaign_name || '').toLowerCase().includes(term)
        if (!matchesSearch) return false
      }

      // Classification
      if (classificationFilter !== 'all') {
        if (classificationFilter === 'unclassified') {
          if (r.lead_type !== null) return false
        } else {
          if (r.lead_type !== classificationFilter) return false
        }
      }

      // Status
      if (statusFilter !== 'all' && r.status !== statusFilter) return false

      // Read
      if (readFilter === 'unread' && r.read) return false
      if (readFilter === 'read' && !r.read) return false

      // Reply owner (who owes a reply)
      if (replyOwnerFilter === 'needs_reply' && !r.awaiting_reply) return false
      if (replyOwnerFilter === 'waiting' && r.awaiting_reply !== false) return false

      return true
    })
  }, [replies, searchTerm, classificationFilter, statusFilter, readFilter, replyOwnerFilter, showArchived])

  // Stats
  const stats = useMemo(() => {
    const nonArchived = replies.filter((r) => !r.archived)
    return {
      total: nonArchived.length,
      unread: nonArchived.filter((r) => !r.read).length,
      sales: nonArchived.filter((r) => r.lead_type === 'sales').length,
      fulfillment: nonArchived.filter((r) => r.lead_type === 'fulfillment').length,
      unclassified: nonArchived.filter((r) => r.lead_type === null).length,
      needsReply: nonArchived.filter((r) => r.awaiting_reply === true).length,
    }
  }, [replies])

  // Selected reply
  const selectedReply = useMemo(
    () => replies.find((r) => r.id === selectedReplyId) || null,
    [replies, selectedReplyId]
  )

  // Fetch thread for selected reply
  const { data: threadData, isLoading: threadLoading } = useQuery({
    queryKey: ['email-thread', selectedReply?.bison_reply_id],
    queryFn: async () => {
      const session = await supabase.auth.getSession()
      const token = session.data.session?.access_token
      const res = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/fetch-email-thread`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({ replyId: selectedReply!.bison_reply_id }),
        }
      )
      if (!res.ok) throw new Error('Failed to fetch thread')
      const json = await res.json()
      return json.data?.data || json.data
    },
    enabled: !!selectedReply?.bison_reply_id,
  })

  // Thread messages
  const threadMessages = useMemo(() => {
    if (!threadData) return []
    const msgs: ThreadMessage[] = [
      ...(threadData.older_messages || []).reverse(),
      threadData.current_reply,
      ...(threadData.newer_messages || []),
    ].filter(Boolean)
    return msgs
  }, [threadData])

  // Mark as read when selecting
  const markRead = useCallback(
    async (reply: CampaignReply) => {
      if (!reply.read) {
        await supabase.from('campaign_replies').update({ read: true }).eq('id', reply.id)
        queryClient.invalidateQueries({ queryKey: ['campaign-replies'] })
      }
    },
    [queryClient]
  )

  // Select a reply
  const handleSelectReply = useCallback(
    (reply: CampaignReply) => {
      if (notesTimerRef.current) clearTimeout(notesTimerRef.current)
      setSelectedReplyId(reply.id)
      setShowReplyComposer(false)
      setReplyText('')
      setLocalNotes(reply.notes || '')
      markRead(reply)
    },
    [markRead]
  )

  // Sync local notes when selected reply changes externally
  useEffect(() => {
    setLocalNotes(selectedReply?.notes || '')
  }, [selectedReply?.id])

  // Cleanup timers on unmount
  useEffect(() => {
    return () => {
      if (notesTimerRef.current) clearTimeout(notesTimerRef.current)
      if (promptTimerRef.current) clearTimeout(promptTimerRef.current)
    }
  }, [])

  // Fetch & Classify mutation — pulls interested replies from Bison and classifies each
  const [fetchProgress, setFetchProgress] = useState<{ active: boolean; message: string }>({
    active: false,
    message: '',
  })

  const fetchAndClassifyMutation = useMutation({
    mutationFn: async () => {
      setFetchProgress({ active: true, message: 'Fetching interested replies from Bison...' })
      const session = await supabase.auth.getSession()
      const token = session.data.session?.access_token
      const res = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/fetch-and-classify-replies`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({}),
        }
      )
      if (!res.ok) {
        const errData = await res.json().catch(() => null)
        throw new Error(errData?.error || `Fetch & classify failed (${res.status})`)
      }
      setFetchProgress({ active: true, message: 'Classifying replies with AI...' })
      return res.json()
    },
    onSuccess: (data) => {
      setFetchProgress({ active: false, message: '' })
      const d = data.data
      toast.success(
        `Found ${d?.total_interested || 0} interested replies — ${d?.new_replies || 0} new, ${d?.classified || 0} classified`
      )
      refetchReplies()
    },
    onError: (err: Error) => {
      setFetchProgress({ active: false, message: '' })
      toast.error(err.message || 'Fetch & classify failed')
    },
  })

  // Send reply mutation
  const sendReplyMutation = useMutation({
    mutationFn: async ({ bisonReplyId, message }: { bisonReplyId: number; message: string }) => {
      const session = await supabase.auth.getSession()
      const token = session.data.session?.access_token
      const res = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/send-reply`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({ bisonReplyId, message }),
        }
      )
      if (!res.ok) throw new Error('Send failed')
      return res.json()
    },
    onSuccess: () => {
      toast.success('Reply sent')
      setShowReplyComposer(false)
      setReplyText('')
      if (selectedReply) {
        supabase
          .from('campaign_replies')
          .update({ status: 'contacted' })
          .eq('id', selectedReply.id)
          .then(() => refetchReplies())
      }
    },
    onError: () => toast.error('Failed to send reply'),
  })

  // Update reply field
  const updateReply = useCallback(
    async (id: string, updates: Partial<CampaignReply>) => {
      const { error } = await supabase.from('campaign_replies').update(updates).eq('id', id)
      if (error) {
        toast.error('Update failed')
      } else {
        queryClient.invalidateQueries({ queryKey: ['campaign-replies'] })
      }
    },
    [queryClient]
  )

  // Debounced notes save
  const handleNotesChange = useCallback(
    (id: string, value: string) => {
      setLocalNotes(value)
      if (notesTimerRef.current) clearTimeout(notesTimerRef.current)
      notesTimerRef.current = setTimeout(() => {
        updateReply(id, { notes: value } as any)
      }, 500)
    },
    [updateReply]
  )

  // Debounced prompt save
  const handlePromptChange = useCallback(
    (id: string, value: string) => {
      setCustomPrompt(value)
      if (promptTimerRef.current) clearTimeout(promptTimerRef.current)
      promptTimerRef.current = setTimeout(() => {
        updateReply(id, { custom_prompt: value } as any)
      }, 500)
    },
    [updateReply]
  )

  // Generate AI reply
  const generateReply = useCallback(async (promptOverride?: string) => {
    if (!selectedReply?.bison_reply_id) return
    setGeneratingReply(true)
    try {
      const session = await supabase.auth.getSession()
      const token = session.data.session?.access_token
      const res = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/generate-reply`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({
            bisonReplyId: selectedReply.bison_reply_id,
            name: selectedReply.name,
            email: selectedReply.email,
            company: selectedReply.company,
            leadType: selectedReply.lead_type,
            aiReason: selectedReply.ai_reason,
            ...(promptOverride ? { customPrompt: promptOverride } : {}),
          }),
        }
      )
      if (!res.ok) {
        const errData = await res.json().catch(() => null)
        throw new Error(errData?.error || 'Failed to generate reply')
      }
      const data = await res.json()
      setReplyText(data.data?.reply || '')
      toast.success('Response generated')
    } catch (err: any) {
      toast.error(err.message || 'Failed to generate reply')
    } finally {
      setGeneratingReply(false)
    }
  }, [selectedReply])

  // Search podcasts
  const handlePodcastSearch = useCallback(async () => {
    if (!podcastSearchTerm.trim()) return
    setPodcastSearching(true)
    setPodcastPage(1)
    try {
      const res = await searchPodcasts({
        query: podcastSearchTerm,
        per_page: 20,
        page: 1,
        order_by: 'best_match',
        has_guests: true,
        min_audience_size: 500,
      })
      setPodcastResults(res.podcasts || [])
      const lastPage = parseInt(res.pagination?.last_page || '1', 10)
      setPodcastHasMore(1 < lastPage)
      if ((res.podcasts || []).length === 0) {
        toast('No podcasts found for that search')
      }
    } catch {
      toast.error('Podcast search failed')
    } finally {
      setPodcastSearching(false)
    }
  }, [podcastSearchTerm])

  const loadMorePodcasts = useCallback(async () => {
    const nextPage = podcastPage + 1
    setPodcastLoadingMore(true)
    try {
      const res = await searchPodcasts({
        query: podcastSearchTerm,
        per_page: 20,
        page: nextPage,
        order_by: 'best_match',
        has_guests: true,
        min_audience_size: 500,
      })
      setPodcastResults((prev) => [...prev, ...(res.podcasts || [])])
      setPodcastPage(nextPage)
      const lastPage = parseInt(res.pagination?.last_page || '1', 10)
      setPodcastHasMore(nextPage < lastPage)
    } catch {
      toast.error('Failed to load more')
    } finally {
      setPodcastLoadingMore(false)
    }
  }, [podcastSearchTerm, podcastPage])

  // Classify a single reply
  const classifyReply = useCallback(
    async (replyId: string) => {
      setReclassifyingIds((prev) => new Set([...prev, replyId]))
      try {
        const session = await supabase.auth.getSession()
        const token = session.data.session?.access_token
        const res = await fetch(
          `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/classify-reply`,
          {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              Authorization: `Bearer ${token}`,
            },
            body: JSON.stringify({ reply_id: replyId }),
          }
        )
        if (!res.ok) throw new Error('Classification failed')
        const data = await res.json()
        toast.success(`Classified as ${data.data?.classification || 'unknown'}`)
        refetchReplies()
      } catch {
        toast.error('Classification failed')
      } finally {
        setReclassifyingIds((prev) => {
          const next = new Set(prev)
          next.delete(replyId)
          return next
        })
      }
    },
    [refetchReplies]
  )

  // Bulk classify unclassified
  const bulkClassify = useCallback(async () => {
    const unclassified = replies.filter((r) => !r.lead_type && !r.archived)
    if (unclassified.length === 0) {
      toast('No unclassified replies')
      return
    }
    setBulkClassifying(true)
    setBulkProgress({ done: 0, total: unclassified.length })
    let done = 0
    for (const reply of unclassified) {
      try {
        const session = await supabase.auth.getSession()
        const token = session.data.session?.access_token
        await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/classify-reply`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({ reply_id: reply.id }),
        })
        done++
      } catch {
        done++
      }
      setBulkProgress({ done, total: unclassified.length })
    }
    toast.success(`Classified ${done}/${unclassified.length} replies`)
    setBulkClassifying(false)
    setBulkProgress(null)
    refetchReplies()
  }, [replies, refetchReplies])

  // Archive / restore
  const toggleArchive = useCallback(
    (reply: CampaignReply) => {
      updateReply(reply.id, {
        archived: !reply.archived,
        archived_at: reply.archived ? null : new Date().toISOString(),
      } as any)
      if (selectedReplyId === reply.id) setSelectedReplyId(null)
    },
    [updateReply, selectedReplyId]
  )

  // Delete reply (from Bison + database)
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null)

  const deleteReply = useCallback(
    async (reply: CampaignReply) => {
      setDeletingId(reply.id)
      try {
        const session = await supabase.auth.getSession()
        const token = session.data.session?.access_token
        const res = await fetch(
          `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/delete-reply`,
          {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              Authorization: `Bearer ${token}`,
            },
            body: JSON.stringify({ reply_id: reply.id }),
          }
        )
        if (!res.ok) {
          const errData = await res.json().catch(() => null)
          throw new Error(errData?.error || 'Delete failed')
        }
        const data = await res.json()
        toast.success(
          data.data?.bison_deleted
            ? 'Deleted from Bison and database'
            : 'Deleted from database'
        )
        if (selectedReplyId === reply.id) setSelectedReplyId(null)
        setConfirmDeleteId(null)
        refetchReplies()
      } catch (err: any) {
        toast.error(err.message || 'Delete failed')
      } finally {
        setDeletingId(null)
      }
    },
    [refetchReplies, selectedReplyId]
  )

  return (
    <DashboardLayout>
      <div className="space-y-4">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold">Leads</h1>
            <p className="text-muted-foreground">Campaign replies with AI classification</p>
          </div>
          <div className="flex items-center gap-2">
            {stats.unclassified > 0 && (
              <Button
                variant="outline"
                size="sm"
                onClick={bulkClassify}
                disabled={bulkClassifying}
              >
                {bulkClassifying ? (
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                ) : (
                  <Sparkles className="h-4 w-4 mr-2" />
                )}
                Classify All ({stats.unclassified})
              </Button>
            )}
            <Button
              variant="outline"
              size="sm"
              onClick={() => fetchAndClassifyMutation.mutate()}
              disabled={fetchAndClassifyMutation.isPending}
            >
              {fetchAndClassifyMutation.isPending ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <RefreshCw className="h-4 w-4 mr-2" />
              )}
              Fetch & Classify
            </Button>
            <Button
              variant={showPodcastSidebar ? 'secondary' : 'outline'}
              size="sm"
              onClick={() => setShowPodcastSidebar(!showPodcastSidebar)}
            >
              {showPodcastSidebar ? (
                <PanelRightClose className="h-4 w-4 mr-2" />
              ) : (
                <PanelRightOpen className="h-4 w-4 mr-2" />
              )}
              Podcasts
            </Button>
          </div>
        </div>

        {/* Fetch & Classify Progress Bar */}
        {(fetchAndClassifyMutation.isPending || fetchProgress.active) && (
          <div className="rounded-lg border bg-card p-3 space-y-2">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Loader2 className="h-4 w-4 animate-spin text-blue-500" />
                <span className="text-sm font-medium">{fetchProgress.message || 'Processing...'}</span>
              </div>
              <span className="text-xs text-muted-foreground">This may take a moment</span>
            </div>
            <div className="h-2 w-full bg-muted rounded-full overflow-hidden">
              <div className="h-full bg-blue-500 rounded-full animate-pulse" style={{ width: '100%', animationDuration: '1.5s' }} />
            </div>
          </div>
        )}

        {/* Bulk Classify Progress Bar */}
        {bulkClassifying && bulkProgress && (
          <div className="rounded-lg border bg-card p-3 space-y-2">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Loader2 className="h-4 w-4 animate-spin text-purple-500" />
                <span className="text-sm font-medium">Classifying replies with AI...</span>
              </div>
              <span className="text-sm font-medium">{bulkProgress.done}/{bulkProgress.total}</span>
            </div>
            <div className="h-2 w-full bg-muted rounded-full overflow-hidden">
              <div
                className="h-full bg-purple-500 rounded-full transition-all duration-300"
                style={{ width: `${(bulkProgress.done / bulkProgress.total) * 100}%` }}
              />
            </div>
          </div>
        )}

        {/* Stats Cards */}
        <div className="grid gap-3 grid-cols-2 lg:grid-cols-6">
          <Card className="cursor-pointer hover:border-foreground/20 transition-colors" onClick={() => { setClassificationFilter('all'); setShowArchived(false) }}>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Total</CardTitle>
              <Mail className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{stats.total}</div>
              <p className="text-xs text-muted-foreground">{stats.unread} unread</p>
            </CardContent>
          </Card>

          <Card className="cursor-pointer hover:border-blue-300 transition-colors" onClick={() => { setClassificationFilter('sales'); setShowArchived(false) }}>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Sales</CardTitle>
              <Briefcase className="h-4 w-4 text-blue-500" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-blue-600">{stats.sales}</div>
              <p className="text-xs text-muted-foreground">New business leads</p>
            </CardContent>
          </Card>

          <Card className="cursor-pointer hover:border-green-300 transition-colors" onClick={() => { setClassificationFilter('fulfillment'); setShowArchived(false) }}>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Fulfillment</CardTitle>
              <Headphones className="h-4 w-4 text-green-500" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-green-600">{stats.fulfillment}</div>
              <p className="text-xs text-muted-foreground">Podcast replies</p>
            </CardContent>
          </Card>

          <Card className="cursor-pointer hover:border-yellow-300 transition-colors" onClick={() => { setClassificationFilter('unclassified'); setShowArchived(false) }}>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Unclassified</CardTitle>
              <Bot className="h-4 w-4 text-yellow-500" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-yellow-600">{stats.unclassified}</div>
              <p className="text-xs text-muted-foreground">Needs AI review</p>
            </CardContent>
          </Card>

          <Card className="cursor-pointer hover:border-orange-300 transition-colors" onClick={() => { setReplyOwnerFilter('needs_reply'); setShowArchived(false); setClassificationFilter('all') }}>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Needs Reply</CardTitle>
              <Send className="h-4 w-4 text-orange-500" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-orange-600">{stats.needsReply}</div>
              <p className="text-xs text-muted-foreground">We owe a response</p>
            </CardContent>
          </Card>

          <Card className="cursor-pointer hover:border-gray-300 transition-colors" onClick={() => { setShowArchived(true); setClassificationFilter('all') }}>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Archived</CardTitle>
              <Archive className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{replies.filter((r) => r.archived).length}</div>
              <p className="text-xs text-muted-foreground">Hidden from view</p>
            </CardContent>
          </Card>
        </div>

        {/* Search & Filters */}
        <div className="flex items-center gap-2">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search name, email, company, content..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-10"
            />
          </div>
          <Button
            variant={showFilters ? 'secondary' : 'outline'}
            size="sm"
            onClick={() => setShowFilters(!showFilters)}
          >
            <Filter className="h-4 w-4 mr-1" />
            Filters
            {(classificationFilter !== 'all' || statusFilter !== 'all' || readFilter !== 'all' || replyOwnerFilter !== 'all') && (
              <span className="ml-1 h-2 w-2 rounded-full bg-blue-500" />
            )}
          </Button>
        </div>

        {showFilters && (
          <div className="flex items-center gap-3 flex-wrap">
            <Select value={classificationFilter} onValueChange={setClassificationFilter}>
              <SelectTrigger className="w-[160px]">
                <SelectValue placeholder="Classification" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Types</SelectItem>
                <SelectItem value="sales">Sales</SelectItem>
                <SelectItem value="fulfillment">Fulfillment</SelectItem>
                <SelectItem value="unclassified">Unclassified</SelectItem>
              </SelectContent>
            </Select>

            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-[160px]">
                <SelectValue placeholder="Status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Statuses</SelectItem>
                <SelectItem value="new">New</SelectItem>
                <SelectItem value="contacted">Contacted</SelectItem>
                <SelectItem value="qualified">Qualified</SelectItem>
                <SelectItem value="not_interested">Not Interested</SelectItem>
                <SelectItem value="converted">Converted</SelectItem>
              </SelectContent>
            </Select>

            <Select value={readFilter} onValueChange={setReadFilter}>
              <SelectTrigger className="w-[140px]">
                <SelectValue placeholder="Read status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All</SelectItem>
                <SelectItem value="unread">Unread</SelectItem>
                <SelectItem value="read">Read</SelectItem>
              </SelectContent>
            </Select>

            <Select value={replyOwnerFilter} onValueChange={setReplyOwnerFilter}>
              <SelectTrigger className="w-[160px]">
                <SelectValue placeholder="Reply status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Threads</SelectItem>
                <SelectItem value="needs_reply">Needs Our Reply</SelectItem>
                <SelectItem value="waiting">Waiting on Them</SelectItem>
              </SelectContent>
            </Select>

            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                setClassificationFilter('all')
                setStatusFilter('all')
                setReadFilter('all')
                setReplyOwnerFilter('all')
                setShowArchived(false)
              }}
            >
              Clear filters
            </Button>
          </div>
        )}

        {/* Main Content + Podcast Sidebar */}
        <div className="flex gap-4">
        {/* Main Split View */}
        <div className={`grid grid-cols-1 lg:grid-cols-5 gap-4 flex-1 min-w-0`} style={{ minHeight: 'calc(100vh - 420px)' }}>
          {/* Reply List - Left Panel */}
          <div className="lg:col-span-2 space-y-1 overflow-y-auto max-h-[calc(100vh-420px)] border rounded-lg">
            {repliesLoading ? (
              <div className="p-4 space-y-3">
                {[...Array(6)].map((_, i) => (
                  <Skeleton key={i} className="h-20 w-full" />
                ))}
              </div>
            ) : filteredReplies.length === 0 ? (
              <div className="flex items-center justify-center h-40 text-muted-foreground">
                No replies found
              </div>
            ) : (
              filteredReplies.map((reply) => (
                <div
                  key={reply.id}
                  onClick={() => handleSelectReply(reply)}
                  className={`flex items-start gap-3 p-3 cursor-pointer border-b transition-colors hover:bg-muted/50 ${
                    selectedReplyId === reply.id ? 'bg-muted' : ''
                  } ${!reply.read ? 'bg-blue-50/50' : ''}`}
                >
                  {/* Avatar */}
                  <div className="h-10 w-10 rounded-full bg-gradient-to-br from-blue-500 to-purple-500 flex items-center justify-center text-white text-sm font-bold flex-shrink-0">
                    {(reply.name || reply.email).charAt(0).toUpperCase()}
                  </div>

                  {/* Content */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className={`text-sm truncate ${!reply.read ? 'font-semibold' : ''}`}>
                        {reply.name || reply.email}
                      </span>
                      <span className="text-xs text-muted-foreground flex-shrink-0">
                        {timeAgo(reply.received_at)}
                      </span>
                    </div>

                    {reply.company && (
                      <p className="text-xs text-muted-foreground truncate">{reply.company}</p>
                    )}

                    <p className="text-xs text-muted-foreground truncate mt-0.5">
                      {reply.reply_content
                        ? stripHtml(reply.reply_content).substring(0, 100)
                        : 'No content'}
                    </p>

                    <div className="flex items-center gap-1.5 mt-1.5">
                      <ClassificationBadge type={reply.lead_type} confidence={reply.ai_confidence} />
                      <StatusBadge status={reply.status} />
                      {reply.awaiting_reply === true && (
                        <Badge variant="outline" className="text-xs bg-orange-100 text-orange-700 border-orange-200">
                          Needs Reply
                        </Badge>
                      )}
                      {reply.awaiting_reply === false && (
                        <Badge variant="outline" className="text-xs bg-gray-100 text-gray-500 border-gray-200">
                          Waiting
                        </Badge>
                      )}
                      {!reply.read && (
                        <span className="h-2 w-2 rounded-full bg-blue-500 flex-shrink-0" />
                      )}
                    </div>

                    {reply.thread_checked_at && (
                      <p className="text-[10px] text-muted-foreground/60 mt-0.5">
                        Thread checked {timeAgo(reply.thread_checked_at)}
                      </p>
                    )}
                  </div>
                </div>
              ))
            )}
          </div>

          {/* Detail Panel - Right */}
          <div className="lg:col-span-3 border rounded-lg overflow-y-auto max-h-[calc(100vh-420px)]">
            {!selectedReply ? (
              <div className="flex flex-col items-center justify-center h-full text-muted-foreground p-8">
                <MailOpen className="h-12 w-12 mb-4 opacity-30" />
                <p>Select a reply to view details</p>
              </div>
            ) : (
              <div className="p-4 space-y-4">
                {/* Reply Header */}
                <div className="flex items-start justify-between">
                  <div>
                    <h2 className="text-lg font-semibold">
                      {selectedReply.name || 'Unknown'}
                    </h2>
                    <p className="text-sm text-muted-foreground">{selectedReply.email}</p>
                    {selectedReply.company && (
                      <p className="text-sm text-muted-foreground">{selectedReply.company}</p>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    <ClassificationBadge
                      type={selectedReply.lead_type}
                      confidence={selectedReply.ai_confidence}
                    />
                    {selectedReply.awaiting_reply === true && (
                      <Badge variant="outline" className="text-xs bg-orange-100 text-orange-700 border-orange-200">
                        Needs Reply
                      </Badge>
                    )}
                    {selectedReply.awaiting_reply === false && (
                      <Badge variant="outline" className="text-xs bg-gray-100 text-gray-500 border-gray-200">
                        Waiting on them
                      </Badge>
                    )}
                    {selectedReply.ai_classified_at && (
                      <span className="text-xs text-muted-foreground">
                        AI classified {timeAgo(selectedReply.ai_classified_at)}
                      </span>
                    )}
                  </div>
                </div>

                {/* Campaign & Date */}
                <div className="flex items-center gap-4 text-sm text-muted-foreground flex-wrap">
                  {selectedReply.campaign_name && (
                    <span className="flex items-center gap-1">
                      <Mail className="h-3.5 w-3.5" />
                      Subject: {selectedReply.campaign_name}
                    </span>
                  )}
                  <span>
                    {new Date(selectedReply.received_at).toLocaleDateString('en-US', {
                      month: 'short',
                      day: 'numeric',
                      year: 'numeric',
                      hour: 'numeric',
                      minute: '2-digit',
                    })}
                  </span>
                  {selectedReply.thread_message_count && (
                    <span>{selectedReply.thread_message_count} messages in thread</span>
                  )}
                </div>

                {/* Thread Status */}
                {selectedReply.last_reply_from && (
                  <div className={`rounded-lg p-3 text-sm ${
                    selectedReply.awaiting_reply
                      ? 'bg-orange-50 border border-orange-200'
                      : 'bg-gray-50 border border-gray-200'
                  }`}>
                    <div className="flex items-center justify-between">
                      <div>
                        <span className="font-medium">
                          {selectedReply.awaiting_reply ? 'We owe a reply' : 'Waiting on them'}
                        </span>
                        <span className="text-muted-foreground ml-2">
                          — Last message from: <strong>{selectedReply.last_reply_from}</strong>
                        </span>
                      </div>
                      {selectedReply.thread_checked_at && (
                        <span className="text-xs text-muted-foreground">
                          Checked {timeAgo(selectedReply.thread_checked_at)}
                        </span>
                      )}
                    </div>
                  </div>
                )}

                {/* Actions Bar */}
                <div className="flex items-center gap-2 flex-wrap border-y py-3">
                  {/* Reclassify buttons */}
                  <div className="flex items-center gap-1 mr-2">
                    <span className="text-xs text-muted-foreground mr-1">Label:</span>
                    <Button
                      variant={selectedReply.lead_type === 'sales' ? 'default' : 'outline'}
                      size="sm"
                      className="h-7 text-xs"
                      onClick={() => updateReply(selectedReply.id, { lead_type: 'sales' } as any)}
                    >
                      Sales
                    </Button>
                    <Button
                      variant={selectedReply.lead_type === 'fulfillment' ? 'default' : 'outline'}
                      size="sm"
                      className="h-7 text-xs"
                      onClick={() => updateReply(selectedReply.id, { lead_type: 'fulfillment' } as any)}
                    >
                      Fulfillment
                    </Button>
                  </div>

                  <div className="h-6 w-px bg-border" />

                  {/* Status */}
                  <Select
                    value={selectedReply.status}
                    onValueChange={(val) => updateReply(selectedReply.id, { status: val } as any)}
                  >
                    <SelectTrigger className="h-7 w-[130px] text-xs">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="new">New</SelectItem>
                      <SelectItem value="contacted">Contacted</SelectItem>
                      <SelectItem value="qualified">Qualified</SelectItem>
                      <SelectItem value="not_interested">Not Interested</SelectItem>
                      <SelectItem value="converted">Converted</SelectItem>
                    </SelectContent>
                  </Select>

                  <div className="h-6 w-px bg-border" />

                  {/* AI Reclassify */}
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-7 text-xs"
                    onClick={() => classifyReply(selectedReply.id)}
                    disabled={reclassifyingIds.has(selectedReply.id)}
                  >
                    {reclassifyingIds.has(selectedReply.id) ? (
                      <Loader2 className="h-3 w-3 mr-1 animate-spin" />
                    ) : (
                      <Sparkles className="h-3 w-3 mr-1" />
                    )}
                    AI Reclassify
                  </Button>

                  {/* Reply button */}
                  {selectedReply.bison_reply_id && (
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-7 text-xs"
                      onClick={() => {
                        setShowReplyComposer(!showReplyComposer)
                        if (!showReplyComposer && selectedReply) {
                          setCustomPrompt(selectedReply.custom_prompt || buildDefaultPrompt(selectedReply))
                        }
                      }}
                    >
                      <Send className="h-3 w-3 mr-1" />
                      Reply
                    </Button>
                  )}

                  {/* Archive */}
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-7 text-xs ml-auto"
                    onClick={() => toggleArchive(selectedReply)}
                  >
                    {selectedReply.archived ? (
                      <ArchiveRestore className="h-3 w-3 mr-1" />
                    ) : (
                      <Archive className="h-3 w-3 mr-1" />
                    )}
                    {selectedReply.archived ? 'Restore' : 'Archive'}
                  </Button>

                  {/* Delete */}
                  {confirmDeleteId === selectedReply.id ? (
                    <div className="flex items-center gap-1">
                      <Button
                        variant="destructive"
                        size="sm"
                        className="h-7 text-xs"
                        disabled={deletingId === selectedReply.id}
                        onClick={() => deleteReply(selectedReply)}
                      >
                        {deletingId === selectedReply.id ? (
                          <Loader2 className="h-3 w-3 mr-1 animate-spin" />
                        ) : (
                          <Trash2 className="h-3 w-3 mr-1" />
                        )}
                        Confirm
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-7 text-xs"
                        onClick={() => setConfirmDeleteId(null)}
                      >
                        Cancel
                      </Button>
                    </div>
                  ) : (
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-7 text-xs text-red-500 hover:text-red-700 hover:bg-red-50"
                      onClick={() => setConfirmDeleteId(selectedReply.id)}
                    >
                      <Trash2 className="h-3 w-3" />
                    </Button>
                  )}
                </div>

                {/* Reply Composer */}
                {showReplyComposer && selectedReply.bison_reply_id && (
                  <div className="border rounded-lg p-3 space-y-3 bg-muted/30">
                    {/* AI Prompt */}
                    <div className="space-y-1.5">
                      <div className="flex items-center justify-between">
                        <p className="text-xs font-medium text-purple-700 flex items-center gap-1">
                          <Sparkles className="h-3 w-3" />
                          AI Prompt
                        </p>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-6 text-xs text-purple-600"
                          onClick={() => {
                            const defaultPrompt = buildDefaultPrompt(selectedReply)
                            setCustomPrompt(defaultPrompt)
                            updateReply(selectedReply.id, { custom_prompt: null } as any)
                          }}
                        >
                          Reset to default
                        </Button>
                      </div>
                      <Textarea
                        value={customPrompt}
                        onChange={(e) => handlePromptChange(selectedReply.id, e.target.value)}
                        rows={6}
                        className="text-xs font-mono bg-purple-50/50 border-purple-200"
                      />
                    </div>

                    {/* Generated Reply */}
                    <div className="space-y-1.5">
                      <p className="text-xs font-medium text-muted-foreground">Reply</p>
                      <Textarea
                        placeholder="Click Generate to create a reply, or type your own..."
                        value={replyText}
                        onChange={(e) => setReplyText(e.target.value)}
                        rows={4}
                      />
                    </div>

                    <div className="flex items-center justify-end gap-2">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => {
                          setShowReplyComposer(false)
                          setReplyText('')
                        }}
                      >
                        Cancel
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => generateReply(customPrompt)}
                        disabled={generatingReply || !customPrompt.trim()}
                      >
                        {generatingReply ? (
                          <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                        ) : (
                          <Sparkles className="h-4 w-4 mr-2" />
                        )}
                        Generate
                      </Button>
                      <Button
                        size="sm"
                        disabled={!replyText.trim() || sendReplyMutation.isPending}
                        onClick={() =>
                          sendReplyMutation.mutate({
                            bisonReplyId: selectedReply.bison_reply_id!,
                            message: replyText,
                          })
                        }
                      >
                        {sendReplyMutation.isPending ? (
                          <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                        ) : (
                          <Send className="h-4 w-4 mr-2" />
                        )}
                        Send
                      </Button>
                    </div>
                  </div>
                )}

                {/* Reply Content */}
                <div className="bg-muted/30 rounded-lg p-4">
                  <p className="text-sm whitespace-pre-wrap leading-relaxed">
                    {selectedReply.reply_content
                      ? stripHtml(selectedReply.reply_content)
                      : 'No content'}
                  </p>
                </div>

                {/* AI Reason */}
                {selectedReply.ai_reason && (
                  <div className="flex items-start gap-2 rounded-lg bg-purple-50 border border-purple-200 p-3">
                    <Sparkles className="h-4 w-4 text-purple-500 mt-0.5 flex-shrink-0" />
                    <p className="text-sm text-purple-800">{selectedReply.ai_reason}</p>
                  </div>
                )}

                {/* Notes */}
                <div>
                  <p className="text-xs font-medium text-muted-foreground mb-1">Notes</p>
                  <Textarea
                    placeholder="Add notes..."
                    value={localNotes}
                    onChange={(e) => handleNotesChange(selectedReply.id, e.target.value)}
                    rows={2}
                    className="text-sm"
                  />
                </div>

                {/* Email Thread */}
                {selectedReply.bison_reply_id && (
                  <div>
                    <div className="flex items-center justify-between mb-3">
                      <div className="flex items-center gap-2">
                        <MessageSquare className="h-4 w-4" />
                        <h3 className="text-sm font-semibold">Email Thread</h3>
                        {threadMessages.length > 0 && (
                          <span className="text-xs text-muted-foreground">
                            ({threadMessages.length} message{threadMessages.length !== 1 ? 's' : ''})
                          </span>
                        )}
                      </div>
                    </div>

                    {threadLoading ? (
                      <div className="space-y-3">
                        <Skeleton className="h-24 w-full" />
                        <Skeleton className="h-24 w-full" />
                      </div>
                    ) : threadMessages.length === 0 ? (
                      <p className="text-sm text-muted-foreground">No thread data available</p>
                    ) : (
                      <div className="space-y-3">
                        {threadMessages.map((msg, i) => {
                          const isFromLead = msg.from_email_address?.toLowerCase() === selectedReply.email.toLowerCase()
                          const rawBody = msg.text_body || (msg.html_body ? stripHtml(msg.html_body) : '')
                          const { main, quoted } = formatEmailBody(rawBody)

                          return (
                            <div key={msg.id || i} className={`flex ${isFromLead ? 'justify-start' : 'justify-end'}`}>
                              <div className={`max-w-[85%] rounded-lg border p-4 ${
                                isFromLead
                                  ? 'bg-white border-border'
                                  : 'bg-emerald-50 border-emerald-200'
                              }`}>
                                {/* Header */}
                                <div className="flex items-center gap-2 mb-2">
                                  <div className={`h-6 w-6 rounded-full flex items-center justify-center text-[10px] font-bold text-white flex-shrink-0 ${
                                    isFromLead ? 'bg-blue-500' : 'bg-emerald-500'
                                  }`}>
                                    {(msg.from_name || msg.from_email_address || '?').charAt(0).toUpperCase()}
                                  </div>
                                  <div className="flex-1 min-w-0">
                                    <div className="flex items-center gap-1.5">
                                      <span className="text-sm font-medium truncate">
                                        {msg.from_name || msg.from_email_address}
                                      </span>
                                      <Badge variant="outline" className={`text-[10px] px-1.5 py-0 flex-shrink-0 ${
                                        isFromLead
                                          ? 'bg-blue-100 text-blue-700 border-blue-200'
                                          : 'bg-emerald-100 text-emerald-700 border-emerald-200'
                                      }`}>
                                        {isFromLead ? 'Lead' : 'Our Team'}
                                      </Badge>
                                    </div>
                                    <span className="text-[11px] text-muted-foreground">
                                      {msg.from_email_address}
                                    </span>
                                  </div>
                                  <span className="text-[11px] text-muted-foreground flex-shrink-0 whitespace-nowrap">
                                    {new Date(msg.date_received).toLocaleDateString('en-US', {
                                      month: 'short',
                                      day: 'numeric',
                                      hour: 'numeric',
                                      minute: '2-digit',
                                    })}
                                  </span>
                                </div>

                                {/* Subject - first message only */}
                                {msg.subject && i === 0 && (
                                  <p className="text-xs text-muted-foreground mb-2 font-medium">
                                    {msg.subject}
                                  </p>
                                )}

                                {/* Main body */}
                                <p className="text-sm whitespace-pre-wrap leading-relaxed">
                                  {main || 'No content'}
                                </p>

                                {/* Quoted content - collapsed */}
                                {quoted && (
                                  <details className="mt-3">
                                    <summary className="text-xs text-muted-foreground cursor-pointer hover:text-foreground transition-colors">
                                      Show quoted text
                                    </summary>
                                    <div className="mt-2 pl-3 border-l-2 border-muted-foreground/20">
                                      <p className="text-xs text-muted-foreground whitespace-pre-wrap leading-relaxed">
                                        {quoted}
                                      </p>
                                    </div>
                                  </details>
                                )}
                              </div>
                            </div>
                          )
                        })}
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Podcast Search Sidebar */}
        {showPodcastSidebar && (
          <div className="w-80 flex-shrink-0 border rounded-lg overflow-hidden flex flex-col" style={{ maxHeight: 'calc(100vh - 420px)' }}>
            <div className="p-3 border-b bg-muted/30">
              <div className="flex items-center justify-between mb-2">
                <h3 className="text-sm font-semibold flex items-center gap-1.5">
                  <Mic className="h-4 w-4" />
                  Podcast Search
                </h3>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-6 w-6 p-0"
                  onClick={() => setShowPodcastSidebar(false)}
                >
                  <X className="h-3.5 w-3.5" />
                </Button>
              </div>
              <form
                onSubmit={(e) => {
                  e.preventDefault()
                  handlePodcastSearch()
                }}
                className="flex gap-1.5"
              >
                <Input
                  placeholder="Search keywords..."
                  value={podcastSearchTerm}
                  onChange={(e) => setPodcastSearchTerm(e.target.value)}
                  className="h-8 text-sm"
                />
                <Button
                  type="submit"
                  size="sm"
                  className="h-8 px-3"
                  disabled={podcastSearching || !podcastSearchTerm.trim()}
                >
                  {podcastSearching ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <Search className="h-3.5 w-3.5" />
                  )}
                </Button>
              </form>
            </div>

            <div className="flex-1 overflow-y-auto">
              {podcastResults.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-40 text-muted-foreground p-4">
                  <Mic className="h-8 w-8 mb-2 opacity-30" />
                  <p className="text-sm text-center">Search for podcasts by keyword to find matches</p>
                </div>
              ) : (
                <div className="divide-y">
                  {podcastResults.map((podcast) => (
                    <div key={podcast.podcast_id} className="p-3 hover:bg-muted/30 transition-colors">
                      <div className="flex items-start gap-2">
                        {podcast.podcast_image_url ? (
                          <img
                            src={podcast.podcast_image_url}
                            alt=""
                            className="h-10 w-10 rounded flex-shrink-0 object-cover"
                          />
                        ) : (
                          <div className="h-10 w-10 rounded bg-purple-100 flex items-center justify-center flex-shrink-0">
                            <Mic className="h-5 w-5 text-purple-500" />
                          </div>
                        )}
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium truncate">{podcast.podcast_name}</p>
                          {podcast.publisher_name && (
                            <p className="text-xs text-muted-foreground truncate">{podcast.publisher_name}</p>
                          )}
                          <div className="flex items-center gap-1.5 mt-1 flex-wrap">
                            {podcast.podcast_reach_score != null && (
                              <Badge variant="outline" className="text-[10px] px-1.5 py-0">
                                <Star className="h-2.5 w-2.5 mr-0.5" />
                                {podcast.podcast_reach_score}
                              </Badge>
                            )}
                            {podcast.reach?.audience_size != null && (
                              <Badge variant="outline" className="text-[10px] px-1.5 py-0">
                                {podcast.reach.audience_size.toLocaleString()} listeners
                              </Badge>
                            )}
                            {podcast.podcast_categories?.slice(0, 2).map((cat) => (
                              <Badge key={cat.category_id} variant="outline" className="text-[10px] px-1.5 py-0 bg-purple-50 text-purple-700 border-purple-200">
                                {cat.category_name}
                              </Badge>
                            ))}
                          </div>
                        </div>
                      </div>
                      <div className="flex items-center gap-1 mt-2 ml-12">
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-6 text-xs"
                          onClick={() => {
                            const text = `${podcast.podcast_name}${podcast.podcast_url ? ` - ${podcast.podcast_url}` : ''}`
                            navigator.clipboard.writeText(text)
                            toast.success('Copied to clipboard')
                          }}
                        >
                          <Copy className="h-3 w-3 mr-1" />
                          Copy
                        </Button>
                        {podcast.podcast_url && (
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-6 text-xs"
                            onClick={() => window.open(podcast.podcast_url, '_blank')}
                          >
                            <ExternalLink className="h-3 w-3 mr-1" />
                            Open
                          </Button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {podcastResults.length > 0 && (
              <div className="p-2 border-t bg-muted/30 space-y-1.5">
                {podcastHasMore && (
                  <Button
                    variant="outline"
                    size="sm"
                    className="w-full h-7 text-xs"
                    onClick={loadMorePodcasts}
                    disabled={podcastLoadingMore}
                  >
                    {podcastLoadingMore ? (
                      <Loader2 className="h-3 w-3 mr-1 animate-spin" />
                    ) : null}
                    Load More
                  </Button>
                )}
                <p className="text-xs text-muted-foreground text-center">{podcastResults.length} results</p>
              </div>
            )}
          </div>
        )}
        </div>
      </div>
    </DashboardLayout>
  )
}
