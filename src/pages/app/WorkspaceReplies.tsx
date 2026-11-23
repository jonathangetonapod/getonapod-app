import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { AlertCircle, Check, Loader2, MessageSquare, RefreshCw, Search, UserRoundPlus } from 'lucide-react'
import { WorkspaceLayout, type PlatformWorkspaceConfig } from '@/components/workspace/WorkspaceLayout'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Checkbox } from '@/components/ui/checkbox'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Skeleton } from '@/components/ui/skeleton'
import { useAuth } from '@/contexts/AuthContext'
import { MY_WORKSPACE_BASE_HREF, selectedWorkspaceBaseHref } from '@/lib/workspaceRoutes'
import { workspaceLogoUrl } from '@/lib/workspaceLogo'
import { getAdminWorkspaceView } from '@/services/adminWorkspaces'
import { createHostRelationship } from '@/services/hostRelationships'
import { getWorkspaceRecentReplies, type WorkspaceRecentReply } from '@/services/workspaceCampaigns'

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
// The most the server returns; one paged read per campaign, newest first.
const REPLY_LIMIT = 200
const PAGE = 25
const ALL_CLIENTS = 'all'
// Podcast ids from the catalog or the book; anything else is added by address.
const PODCAST_ID_PATTERN = /^[a-zA-Z0-9_-]{1,200}$/

type ReplyView = 'all' | 'not_in_relationships' | 'interested'

const VIEW_LABELS: Record<ReplyView, string> = {
  all: 'All replies',
  not_in_relationships: 'Not in Relationships',
  interested: 'Interested',
}

function formatReceived(value: string | null): string {
  if (!value) return 'Date unknown'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return 'Date unknown'
  return date.toLocaleString(undefined, { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' })
}

function replyKey(reply: WorkspaceRecentReply): string {
  return `${reply.provider_campaign_id ?? ''}:${reply.id}`
}

function campaignHref(baseHref: string, reply: WorkspaceRecentReply): string {
  const params = new URLSearchParams({ tab: 'replies' })
  if (reply.target) params.set('reply_podcast', reply.target.shortlist_podcast_id)
  return `${baseHref}/client-campaigns/${reply.client.id}?${params.toString()}`
}

/** The relationship this reply would create: the pitched show when known, else the sender. */
function relationshipInput(reply: WorkspaceRecentReply) {
  const podcastId = reply.target?.podcast_id && PODCAST_ID_PATTERN.test(reply.target.podcast_id)
    ? reply.target.podcast_id
    : null
  return {
    podcastId,
    podcastName: reply.target?.podcast_name || null,
    hostName: reply.target?.host_name || reply.from_name || null,
    contactEmail: reply.from_email || null,
  }
}

interface WorkspaceRepliesProps {
  platformWorkspaceId?: string
}

/**
 * Every host who wrote back to any client's campaign, in one place, with a
 * one-click way to keep them in Relationships. Read live from the sending
 * platform and rendered as text, never markup; nothing here is stored except
 * a relationship someone chooses to add.
 */
const WorkspaceReplies = ({ platformWorkspaceId }: WorkspaceRepliesProps) => {
  const { isPlatformAdmin, membership, user, workspace } = useAuth()
  const isPlatformWorkspace = platformWorkspaceId !== undefined
  const selectedWorkspaceId = (platformWorkspaceId || '').toLowerCase()
  const workspaceId = (isPlatformWorkspace ? selectedWorkspaceId : workspace?.id || '').toLowerCase()
  const validWorkspaceId = UUID_PATTERN.test(workspaceId)
  const canManage = Boolean(
    isPlatformWorkspace || isPlatformAdmin || membership?.role === 'owner' || membership?.role === 'admin',
  )
  const queryClient = useQueryClient()
  const [search, setSearch] = useState('')
  const [clientFilter, setClientFilter] = useState(ALL_CLIENTS)
  const [view, setView] = useState<ReplyView>('all')
  const [hideAutomated, setHideAutomated] = useState(true)
  const [shown, setShown] = useState(PAGE)
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set())
  // Added on this page since the last read, so the button turns over at once.
  const [added, setAdded] = useState<Map<string, string>>(() => new Map())

  const selectedWorkspaceQuery = useQuery({
    queryKey: ['platform', user?.id || 'unknown', 'workspace', selectedWorkspaceId, 'replies'],
    queryFn: ({ signal }) => getAdminWorkspaceView(selectedWorkspaceId, signal),
    enabled: isPlatformWorkspace && validWorkspaceId,
    retry: false,
    gcTime: 0,
  })
  const selectedWorkspaceReady = !isPlatformWorkspace || Boolean(selectedWorkspaceQuery.data?.workspace)
  const repliesQuery = useQuery({
    queryKey: ['workspace-replies-page', workspaceId],
    queryFn: () => getWorkspaceRecentReplies(workspaceId, { limit: REPLY_LIMIT }),
    enabled: validWorkspaceId && selectedWorkspaceReady,
    retry: false,
    staleTime: 60_000,
  })

  const addMutation = useMutation({
    mutationFn: (reply: WorkspaceRecentReply) => createHostRelationship(workspaceId, relationshipInput(reply)),
    onSuccess: (result, reply) => {
      const email = reply.from_email?.trim().toLowerCase()
      setAdded((current) => {
        const next = new Map(current)
        next.set(replyKey(reply), result.podcast_id)
        if (email) next.set(`email:${email}`, result.podcast_id)
        return next
      })
      toast.success(result.created ? 'Added to Relationships.' : 'Already in Relationships, so we updated it.')
      void queryClient.invalidateQueries({ queryKey: ['host-relationships', workspaceId] })
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : 'The host could not be added.'),
  })

  const data = repliesQuery.data
  const relationshipOf = (reply: WorkspaceRecentReply): string | null => {
    const email = reply.from_email?.trim().toLowerCase()
    return added.get(replyKey(reply)) ?? (email ? added.get(`email:${email}`) : undefined) ?? reply.relationship_podcast_id ?? null
  }
  const clients = useMemo(() => {
    const byId = new Map<string, string>()
    for (const reply of data?.replies ?? []) byId.set(reply.client.id, reply.client.name)
    return [...byId].map(([id, name]) => ({ id, name })).sort((a, b) => a.name.localeCompare(b.name))
  }, [data?.replies])
  const scoped = useMemo(() => {
    const term = search.trim().toLowerCase()
    return (data?.replies ?? []).filter((reply) => (
      (clientFilter === ALL_CLIENTS || reply.client.id === clientFilter)
      && (!term || [
        reply.target?.podcast_name, reply.target?.host_name, reply.from_name, reply.from_email,
        reply.client.name, reply.subject, reply.body_text,
      ].filter(Boolean).join(' ').toLowerCase().includes(term))
    ))
  }, [clientFilter, data?.replies, search])
  const automatedCount = scoped.filter((reply) => reply.automated).length
  const visible = scoped.filter((reply) => (
    (!hideAutomated || !reply.automated)
    && (view !== 'interested' || reply.interested === true)
    && (view !== 'not_in_relationships' || !relationshipOf(reply))
  ))

  const baseHref = isPlatformWorkspace ? selectedWorkspaceBaseHref(selectedWorkspaceId) : MY_WORKSPACE_BASE_HREF
  const selectedWorkspace = selectedWorkspaceQuery.data?.workspace
  const platformWorkspace: PlatformWorkspaceConfig | undefined = isPlatformWorkspace
    ? {
        workspaceId,
        workspaceName: selectedWorkspace?.name || 'Client workspace',
        logoUrl: workspaceLogoUrl(selectedWorkspace?.id, selectedWorkspace?.logo_path, selectedWorkspace?.logo_updated_at),
        baseHref,
      }
    : undefined

  if (!validWorkspaceId || (isPlatformWorkspace && selectedWorkspaceQuery.error)) {
    return (
      <WorkspaceLayout platformWorkspace={platformWorkspace}>
        <Card>
          <CardHeader>
            <CardTitle>Workspace unavailable</CardTitle>
            <CardDescription>
              {selectedWorkspaceQuery.error instanceof Error
                ? selectedWorkspaceQuery.error.message
                : 'Your account does not have an active workspace.'}
            </CardDescription>
          </CardHeader>
        </Card>
      </WorkspaceLayout>
    )
  }

  const toggleExpanded = (key: string) => setExpanded((current) => {
    const next = new Set(current)
    if (next.has(key)) next.delete(key)
    else next.add(key)
    return next
  })

  return (
    <WorkspaceLayout platformWorkspace={platformWorkspace}>
      <div className="space-y-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h1 className="flex items-center gap-2 text-2xl font-semibold">
              <MessageSquare className="h-6 w-6 text-primary" />Replies
            </h1>
            <p className="mt-1 text-sm text-muted-foreground">
              Every host who wrote back to a client's campaign, newest first. Add the ones worth keeping to Relationships.
            </p>
          </div>
          <Button type="button" variant="outline" onClick={() => void repliesQuery.refetch()} disabled={repliesQuery.isFetching}>
            {repliesQuery.isFetching ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <RefreshCw className="mr-2 h-4 w-4" />}Refresh
          </Button>
        </div>

        <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              aria-label="Search replies"
              value={search}
              onChange={(event) => { setSearch(event.target.value); setShown(PAGE) }}
              placeholder="Search shows, hosts, emails, clients or what they said"
              className="pl-9"
            />
          </div>
          <Select value={view} onValueChange={(value) => { setView(value as ReplyView); setShown(PAGE) }}>
            <SelectTrigger className="w-full lg:w-52" aria-label="Which replies"><SelectValue /></SelectTrigger>
            <SelectContent>
              {(Object.keys(VIEW_LABELS) as ReplyView[]).map((key) => (
                <SelectItem key={key} value={key}>{VIEW_LABELS[key]}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={clientFilter} onValueChange={(value) => { setClientFilter(value); setShown(PAGE) }}>
            <SelectTrigger className="w-full lg:w-52" aria-label="Client"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL_CLIENTS}>All clients</SelectItem>
              {clients.map((client) => <SelectItem key={client.id} value={client.id}>{client.name}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        {automatedCount > 0 && (
          <div className="flex items-center gap-2">
            <Checkbox id="replies-hide-automated" checked={hideAutomated} onCheckedChange={(value) => setHideAutomated(value === true)} />
            <Label htmlFor="replies-hide-automated" className="text-sm font-normal">
              Hide {automatedCount} automatic repl{automatedCount === 1 ? 'y' : 'ies'}
            </Label>
          </div>
        )}

        {repliesQuery.isPending ? (
          <div className="space-y-3" role="status" aria-label="Loading replies">
            <Skeleton className="h-24 w-full" />
            <Skeleton className="h-24 w-full" />
            <Skeleton className="h-24 w-full" />
          </div>
        ) : repliesQuery.isError ? (
          <div role="alert" className="flex flex-col gap-3 rounded-md border border-amber-300 bg-amber-50 p-4 text-sm text-amber-900 sm:flex-row sm:items-center sm:justify-between">
            <p className="flex items-start gap-2">
              <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
              {repliesQuery.error instanceof Error ? repliesQuery.error.message : 'Replies could not be read.'}
            </p>
            <Button type="button" size="sm" variant="outline" onClick={() => void repliesQuery.refetch()}>Try again</Button>
          </div>
        ) : data && !data.supported ? (
          <p className="rounded-lg border border-dashed p-6 text-sm text-muted-foreground">
            {data.provider_label} does not let us read campaign replies yet. Read them in {data.provider_label}.
          </p>
        ) : visible.length === 0 ? (
          <p className="rounded-lg border border-dashed p-6 text-sm text-muted-foreground">
            {(data?.replies.length ?? 0) === 0
              ? 'No replies yet. When a host answers a campaign assigned to a client, it shows here.'
              : 'No replies match these filters.'}
          </p>
        ) : (
          <ul className="space-y-3" aria-label="Replies">
            {visible.slice(0, shown).map((reply) => {
              const key = replyKey(reply)
              const relationshipId = relationshipOf(reply)
              const open = expanded.has(key)
              const adding = addMutation.isPending && addMutation.variables && replyKey(addMutation.variables) === key
              return (
                <li key={key}>
                  <Card>
                    <CardContent className="space-y-2 p-4">
                      <div className="flex flex-wrap items-start justify-between gap-2">
                        <div className="min-w-0">
                          <div className="flex flex-wrap items-center gap-2">
                            <p className="font-semibold">{reply.target?.podcast_name || reply.from_name || reply.from_email || 'Unknown sender'}</p>
                            <span className="text-xs text-muted-foreground">for {reply.client.name}</span>
                            {reply.automated && <Badge variant="outline">Automatic</Badge>}
                            {reply.interested === true && <Badge variant="outline" className="border-emerald-200 bg-emerald-50 text-emerald-800">Interested</Badge>}
                          </div>
                          <p className="mt-0.5 truncate text-xs text-muted-foreground">
                            {[reply.from_name || reply.target?.host_name, reply.from_email].filter(Boolean).join(' · ') || 'Unknown sender'} · {formatReceived(reply.received_at)}
                          </p>
                        </div>
                        <div className="flex flex-wrap items-center gap-2">
                          {relationshipId ? (
                            <Button asChild variant="outline" size="sm">
                              <Link to={`${baseHref}/relationships?open=${encodeURIComponent(relationshipId)}`}>
                                <Check className="mr-1.5 h-3.5 w-3.5 text-emerald-600" />In Relationships
                              </Link>
                            </Button>
                          ) : canManage ? (
                            <Button
                              type="button"
                              size="sm"
                              onClick={() => addMutation.mutate(reply)}
                              disabled={addMutation.isPending || !reply.from_email}
                            >
                              {adding ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : <UserRoundPlus className="mr-1.5 h-3.5 w-3.5" />}
                              Add to Relationships
                            </Button>
                          ) : null}
                          <Button asChild variant="ghost" size="sm">
                            <Link to={campaignHref(baseHref, reply)}>Open campaign</Link>
                          </Button>
                        </div>
                      </div>
                      {reply.subject && <p className="text-sm font-medium">{reply.subject}</p>}
                      <p className={`whitespace-pre-wrap text-sm leading-6 text-foreground/80 ${open ? '' : 'line-clamp-4'}`}>
                        {reply.body_text || 'No text in this reply.'}
                      </p>
                      {reply.body_text.length > 280 && (
                        <Button type="button" variant="link" size="sm" className="h-auto px-0" aria-expanded={open} onClick={() => toggleExpanded(key)}>
                          {open ? 'Show less' : 'Show the full reply'}
                        </Button>
                      )}
                    </CardContent>
                  </Card>
                </li>
              )
            })}
          </ul>
        )}
        {visible.length > shown && (
          <Button type="button" variant="outline" onClick={() => setShown((value) => value + PAGE)}>
            Show more ({visible.length - shown} left)
          </Button>
        )}
        {data && (data.truncated || data.failed_campaigns > 0) && (
          <p className="text-xs text-muted-foreground">
            {data.failed_campaigns > 0
              ? `${data.failed_campaigns} campaign${data.failed_campaigns === 1 ? '' : 's'} could not be read this time. `
              : ''}
            Showing the newest replies from the most recently active campaigns; each campaign's Replies tab has its full list.
          </p>
        )}
      </div>
    </WorkspaceLayout>
  )
}

export default WorkspaceReplies
