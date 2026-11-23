import { useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { AlertCircle, ChevronDown, ChevronUp, ExternalLink, Loader2, MessageSquare, RefreshCw, Search, X } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Checkbox } from '@/components/ui/checkbox'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { getWorkspaceCampaignReplies, type WorkspaceCampaignReply } from '@/services/workspaceCampaigns'

export interface CampaignRepliesPanelProps {
  workspaceId: string
  clientId: string
  providerName: string
  /** Link to the campaign on the sending platform, where replies are answered. */
  providerCampaignHref?: string | null
  /** Off until the tab is open and the campaign has a platform campaign to read. */
  enabled: boolean
  /** Narrow the list to one podcast, set from the Podcasts tab. */
  focusShortlistPodcastId?: string | null
  onClearFocus?: () => void
}

function formatReceived(value: string | null): string {
  if (!value) return 'Date unknown'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return 'Date unknown'
  return date.toLocaleString(undefined, { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' })
}

function senderLabel(reply: WorkspaceCampaignReply): string {
  const name = reply.from_name || reply.target?.host_name
  if (name && reply.from_email) return `${name} · ${reply.from_email}`
  return name || reply.from_email || 'Unknown sender'
}

/**
 * Replies the campaign received, read from the sending platform each time the
 * tab opens. Read-only on purpose: the app shows who answered and what they
 * said, and answering happens on the platform. Bodies are rendered as text,
 * never as markup — they are written by people outside the workspace.
 */
export const CampaignRepliesPanel = ({
  workspaceId,
  clientId,
  providerName,
  providerCampaignHref,
  enabled,
  focusShortlistPodcastId,
  onClearFocus,
}: CampaignRepliesPanelProps) => {
  const [search, setSearch] = useState('')
  const [hideAutomated, setHideAutomated] = useState(false)
  const [expandedId, setExpandedId] = useState<string | null>(null)

  const repliesQuery = useQuery({
    queryKey: ['workspace-campaign-replies', workspaceId, clientId],
    queryFn: () => getWorkspaceCampaignReplies(workspaceId, clientId),
    enabled,
    retry: false,
    staleTime: 60_000,
  })
  const data = repliesQuery.data
  const replies = useMemo(() => data?.replies ?? [], [data?.replies])
  const focusedReplies = useMemo(
    () => (focusShortlistPodcastId ? replies.filter((reply) => reply.target?.shortlist_podcast_id === focusShortlistPodcastId) : replies),
    [replies, focusShortlistPodcastId],
  )
  const focusName = focusShortlistPodcastId
    ? focusedReplies.find((reply) => reply.target)?.target?.podcast_name ?? 'this podcast'
    : null
  const automatedCount = focusedReplies.filter((reply) => reply.automated).length
  const visibleReplies = useMemo(() => {
    const term = search.trim().toLowerCase()
    return focusedReplies.filter((reply) => {
      if (hideAutomated && reply.automated) return false
      if (!term) return true
      return [reply.target?.podcast_name, reply.target?.host_name, reply.from_name, reply.from_email, reply.subject, reply.body_text]
        .some((value) => value?.toLowerCase().includes(term))
    })
  }, [focusedReplies, search, hideAutomated])
  const podcastCount = new Set(focusedReplies.filter((reply) => reply.target && !reply.automated).map((reply) => reply.target!.shortlist_podcast_id)).size

  return (
    <Card>
      <CardHeader className="flex flex-col gap-3 space-y-0 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <CardTitle>Replies</CardTitle>
          <CardDescription>
            What hosts wrote back, read from {providerName} when you open this tab. Answer them in {providerName}.
          </CardDescription>
        </div>
        <div className="flex flex-wrap gap-2">
          {providerCampaignHref && (
            <Button asChild variant="outline" size="sm">
              <a href={providerCampaignHref} target="_blank" rel="noopener noreferrer">
                <ExternalLink className="mr-2 h-3.5 w-3.5" />Open in {providerName}
                <span className="sr-only"> (opens in a new tab)</span>
              </a>
            </Button>
          )}
          <Button type="button" variant="outline" size="sm" onClick={() => void repliesQuery.refetch()} disabled={!enabled || repliesQuery.isFetching}>
            {repliesQuery.isFetching ? <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="mr-2 h-3.5 w-3.5" />}Refresh
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {!enabled ? (
          <p className="rounded-lg border border-dashed p-4 text-sm text-muted-foreground">
            Replies appear here once this client has a {providerName} campaign and the account is connected.
          </p>
        ) : repliesQuery.isPending ? (
          <p className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" />Reading replies from {providerName}…</p>
        ) : repliesQuery.isError ? (
          <div role="alert" className="flex flex-col gap-3 rounded-md border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900 sm:flex-row sm:items-center sm:justify-between">
            <p className="flex items-start gap-2"><AlertCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />{repliesQuery.error instanceof Error ? repliesQuery.error.message : 'Replies could not be read.'}</p>
            <Button type="button" size="sm" variant="outline" onClick={() => void repliesQuery.refetch()}>Try again</Button>
          </div>
        ) : data && !data.supported ? (
          <p className="rounded-lg border border-dashed p-4 text-sm text-muted-foreground">
            {data.provider_label} does not let us read campaign replies yet. Read them in {data.provider_label}.
          </p>
        ) : (
          <>
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <p className="text-sm text-muted-foreground">
                {focusedReplies.length === 0
                  ? 'No replies yet.'
                  : `${focusedReplies.length} repl${focusedReplies.length === 1 ? 'y' : 'ies'} from ${podcastCount} podcast${podcastCount === 1 ? '' : 's'}${automatedCount > 0 ? ` · ${automatedCount} automatic` : ''}`}
                {data?.checked_at && <span> · Checked {formatReceived(data.checked_at)}</span>}
              </p>
              {focusedReplies.length > 0 && (
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
                  {automatedCount > 0 && (
                    <div className="flex items-center gap-2">
                      <Checkbox id="hide-automated-replies" checked={hideAutomated} onCheckedChange={(value) => setHideAutomated(value === true)} />
                      <Label htmlFor="hide-automated-replies" className="text-sm font-normal">Hide automatic replies</Label>
                    </div>
                  )}
                  <div className="relative w-full sm:w-64">
                    <Search className="absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
                    <Input aria-label="Search replies" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search replies" className="h-9 pl-8" />
                  </div>
                </div>
              )}
            </div>

            {focusShortlistPodcastId && (
              <div className="flex items-center justify-between gap-3 rounded-md border bg-muted/30 px-3 py-2 text-sm">
                <span>Showing replies from <span className="font-medium">{focusName}</span></span>
                <Button type="button" size="sm" variant="ghost" onClick={onClearFocus}><X className="mr-1 h-3.5 w-3.5" />Show all</Button>
              </div>
            )}

            {data?.truncated && (
              <p className="text-xs text-muted-foreground">Showing the newest replies. Older ones are in {providerName}.</p>
            )}

            {focusedReplies.length === 0 ? (
              <p className="rounded-lg border border-dashed p-4 text-sm text-muted-foreground">
                {focusShortlistPodcastId ? 'No replies from this podcast yet.' : 'When a host answers, their reply shows here.'}
              </p>
            ) : visibleReplies.length === 0 ? (
              <p className="rounded-lg border border-dashed p-4 text-sm text-muted-foreground">No replies match.</p>
            ) : (
              <ul className="divide-y rounded-lg border">
                {visibleReplies.map((reply) => {
                  const expanded = expandedId === reply.id
                  const bodyId = `reply-body-${reply.id}`
                  return (
                    <li key={`${reply.provider_campaign_id ?? ''}:${reply.id}`}>
                      <button
                        type="button"
                        className="flex w-full items-start gap-3 p-4 text-left hover:bg-muted/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                        aria-expanded={expanded}
                        aria-controls={bodyId}
                        onClick={() => setExpandedId(expanded ? null : reply.id)}
                      >
                        <div className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-emerald-100 text-emerald-700">
                          <MessageSquare className="h-4 w-4" aria-hidden="true" />
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-center gap-2">
                            <p className="font-semibold">{reply.target?.podcast_name || 'Unmatched sender'}</p>
                            {reply.automated && <Badge variant="outline">Automatic</Badge>}
                            {reply.interested === true && <Badge variant="outline" className="border-emerald-200 bg-emerald-50 text-emerald-800">Interested</Badge>}
                          </div>
                          <p className="mt-0.5 truncate text-xs text-muted-foreground">{senderLabel(reply)} · {formatReceived(reply.received_at)}</p>
                          {reply.subject && <p className="mt-1 truncate text-sm font-medium">{reply.subject}</p>}
                          {!expanded && <p className="mt-1 line-clamp-2 text-sm text-muted-foreground">{reply.body_text || 'No text in this reply.'}</p>}
                        </div>
                        {expanded ? <ChevronUp className="mt-1 h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" /> : <ChevronDown className="mt-1 h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />}
                      </button>
                      {expanded && (
                        <div id={bodyId} className="px-4 pb-4 pl-16">
                          <p className="whitespace-pre-wrap break-words rounded-md border bg-muted/20 p-3 text-sm leading-6">{reply.body_text || 'No text in this reply.'}</p>
                          {!reply.target && (
                            <p className="mt-2 text-xs text-muted-foreground">This address was not pitched in this campaign, so it is not matched to a podcast. It may be an assistant or producer answering for a host.</p>
                          )}
                        </div>
                      )}
                    </li>
                  )
                })}
              </ul>
            )}
          </>
        )}
      </CardContent>
    </Card>
  )
}
