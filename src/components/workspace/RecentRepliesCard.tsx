import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { AlertCircle, ArrowRight, ChevronDown, ChevronUp, Loader2, MessageSquare, RefreshCw } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Checkbox } from '@/components/ui/checkbox'
import { Label } from '@/components/ui/label'
import { getWorkspaceRecentReplies, type WorkspaceRecentReply } from '@/services/workspaceCampaigns'

export interface RecentRepliesCardProps {
  workspaceId: string
  baseHref: string
  providerName: string
  /** Off while the sending platform is not connected. */
  connected: boolean
  /** The page's client filter; null shows every client. */
  clientId?: string | null
}

const PAGE = 10

function formatReceived(value: string | null): string {
  if (!value) return 'Date unknown'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return 'Date unknown'
  return date.toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })
}

function replyHref(baseHref: string, reply: WorkspaceRecentReply): string {
  const params = new URLSearchParams({ tab: 'replies' })
  if (reply.target) params.set('reply_podcast', reply.target.shortlist_podcast_id)
  return `${baseHref}/client-campaigns/${reply.client.id}?${params.toString()}`
}

/**
 * The newest host replies across every client, so nobody has to open each
 * campaign to find out whether anyone answered. Read from the sending
 * platform only once the card is opened — one read per campaign — and
 * rendered as text, never markup.
 */
export const RecentRepliesCard = ({ workspaceId, baseHref, providerName, connected, clientId }: RecentRepliesCardProps) => {
  const [open, setOpen] = useState(false)
  const [hideAutomated, setHideAutomated] = useState(true)
  const [shown, setShown] = useState(PAGE)

  const repliesQuery = useQuery({
    queryKey: ['workspace-recent-replies', workspaceId],
    queryFn: () => getWorkspaceRecentReplies(workspaceId),
    enabled: open && connected,
    retry: false,
    staleTime: 60_000,
  })
  const data = repliesQuery.data
  const scoped = useMemo(
    () => (data?.replies ?? []).filter((reply) => !clientId || reply.client.id.toLowerCase() === clientId.toLowerCase()),
    [data?.replies, clientId],
  )
  const visible = useMemo(() => scoped.filter((reply) => !hideAutomated || !reply.automated), [scoped, hideAutomated])
  const automatedCount = scoped.length - scoped.filter((reply) => !reply.automated).length

  return (
    <Card>
      <CardHeader className="flex flex-col gap-3 space-y-0 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-start gap-3">
          <div className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-emerald-100 text-emerald-700">
            <MessageSquare className="h-4 w-4" aria-hidden="true" />
          </div>
          <div>
            <CardTitle className="text-base">Recent replies</CardTitle>
            <CardDescription>The newest answers from hosts across {clientId ? 'this client’s' : 'every client’s'} campaigns, read from {providerName}.</CardDescription>
          </div>
        </div>
        <div className="flex gap-2">
          {open && (
            <Button type="button" variant="outline" size="sm" onClick={() => void repliesQuery.refetch()} disabled={!connected || repliesQuery.isFetching}>
              {repliesQuery.isFetching ? <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="mr-2 h-3.5 w-3.5" />}Refresh
            </Button>
          )}
          <Button type="button" variant={open ? 'ghost' : 'outline'} size="sm" aria-expanded={open} aria-controls="recent-replies-list" onClick={() => setOpen((value) => !value)}>
            {open ? <>Hide<ChevronUp className="ml-2 h-3.5 w-3.5" /></> : <>Show replies<ChevronDown className="ml-2 h-3.5 w-3.5" /></>}
          </Button>
        </div>
      </CardHeader>
      {open && (
        <CardContent id="recent-replies-list" className="space-y-3">
          {!connected ? (
            <p className="text-sm text-muted-foreground">Connect {providerName} to read replies here.</p>
          ) : repliesQuery.isPending ? (
            <p className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" />Reading replies from {providerName}…</p>
          ) : repliesQuery.isError ? (
            <div role="alert" className="flex flex-col gap-3 rounded-md border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900 sm:flex-row sm:items-center sm:justify-between">
              <p className="flex items-start gap-2"><AlertCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />{repliesQuery.error instanceof Error ? repliesQuery.error.message : 'Replies could not be read.'}</p>
              <Button type="button" size="sm" variant="outline" onClick={() => void repliesQuery.refetch()}>Try again</Button>
            </div>
          ) : data && !data.supported ? (
            <p className="text-sm text-muted-foreground">{data.provider_label} does not let us read campaign replies yet. Read them in {data.provider_label}.</p>
          ) : (
            <>
              {automatedCount > 0 && (
                <div className="flex items-center gap-2">
                  <Checkbox id="recent-hide-automated" checked={hideAutomated} onCheckedChange={(value) => setHideAutomated(value === true)} />
                  <Label htmlFor="recent-hide-automated" className="text-sm font-normal">Hide {automatedCount} automatic repl{automatedCount === 1 ? 'y' : 'ies'}</Label>
                </div>
              )}
              {visible.length === 0 ? (
                <p className="rounded-lg border border-dashed p-4 text-sm text-muted-foreground">No replies yet. When a host answers a campaign assigned to a client, it shows here.</p>
              ) : (
                <ul className="divide-y rounded-lg border">
                  {visible.slice(0, shown).map((reply) => (
                    <li key={`${reply.provider_campaign_id ?? ''}:${reply.id}`}>
                      <Link to={replyHref(baseHref, reply)} className="flex items-start gap-3 p-3 hover:bg-muted/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-center gap-2">
                            <p className="font-semibold">{reply.target?.podcast_name || 'Unmatched sender'}</p>
                            <span className="text-xs text-muted-foreground">for {reply.client.name}</span>
                            {reply.automated && <Badge variant="outline">Automatic</Badge>}
                            {reply.interested === true && <Badge variant="outline" className="border-emerald-200 bg-emerald-50 text-emerald-800">Interested</Badge>}
                          </div>
                          <p className="mt-0.5 truncate text-xs text-muted-foreground">{reply.from_name || reply.target?.host_name || reply.from_email || 'Unknown sender'} · {formatReceived(reply.received_at)}</p>
                          <p className="mt-1 line-clamp-2 text-sm text-muted-foreground">{reply.body_text || 'No text in this reply.'}</p>
                        </div>
                        <ArrowRight className="mt-1 h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
              {visible.length > shown && (
                <Button type="button" variant="ghost" size="sm" onClick={() => setShown((value) => value + PAGE)}>Show more</Button>
              )}
              {data && (data.truncated || data.failed_campaigns > 0) && (
                <p className="text-xs text-muted-foreground">
                  {data.failed_campaigns > 0
                    ? `${data.failed_campaigns} campaign${data.failed_campaigns === 1 ? '' : 's'} could not be read this time. `
                    : ''}
                  Showing the newest replies; each campaign’s Replies tab has the full list.
                </p>
              )}
            </>
          )}
        </CardContent>
      )}
    </Card>
  )
}
