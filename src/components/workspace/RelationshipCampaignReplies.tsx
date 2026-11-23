import { useState } from 'react'
import { Link } from 'react-router-dom'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Label } from '@/components/ui/label'
import { Skeleton } from '@/components/ui/skeleton'
import type { HostCampaignReplies } from '@/services/hostRelationships'

interface RelationshipCampaignRepliesProps {
  data: HostCampaignReplies | undefined
  isLoading: boolean
  error: unknown
  onRetry: () => void
  baseHref: string
}

function formatReceived(value: string | null): string {
  if (!value) return 'Date unavailable'
  const date = new Date(value)
  return Number.isNaN(date.getTime())
    ? 'Date unavailable'
    : new Intl.DateTimeFormat('en-US', {
        month: 'short',
        day: 'numeric',
        year: 'numeric',
        hour: 'numeric',
        minute: '2-digit',
      }).format(date)
}

/**
 * What this host wrote back to any client's campaign, read live from the
 * sending platform and rendered as text, never markup. Nothing here is
 * stored, so there is nothing to save first.
 */
export const RelationshipCampaignReplies = ({ data, isLoading, error, onRetry, baseHref }: RelationshipCampaignRepliesProps) => {
  const [hideAutomated, setHideAutomated] = useState(true)

  if (isLoading) {
    return (
      <div className="space-y-3" role="status" aria-label="Loading campaign replies">
        <Skeleton className="h-16 w-full" />
        <Skeleton className="h-16 w-full" />
      </div>
    )
  }
  if (error) {
    return (
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-destructive/30 bg-destructive/5 p-3">
        <p className="text-sm text-destructive">
          {error instanceof Error ? error.message : 'Campaign replies could not be loaded.'}
        </p>
        <Button type="button" variant="outline" size="sm" onClick={onRetry}>Try again</Button>
      </div>
    )
  }
  if (data && !data.supported) {
    return (
      <p className="rounded-lg border border-dashed p-4 text-sm text-muted-foreground">
        {data.provider_label
          ? `${data.provider_label} does not let us list campaign replies, so they can't be shown here.`
          : 'Connect a sending platform on the Integrations page to see campaign replies here.'}
      </p>
    )
  }

  const replies = data?.replies ?? []
  const automatedCount = replies.filter((reply) => reply.automated).length
  const visible = hideAutomated ? replies.filter((reply) => !reply.automated) : replies

  return (
    <div>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-sm font-medium">Campaign replies</p>
          <p className="mt-0.5 text-xs text-muted-foreground">
            What this host wrote back to any client's campaign, read from {data?.provider_label ?? 'your sending platform'}.
          </p>
        </div>
        {automatedCount > 0 && (
          <div className="flex items-center gap-2">
            <Checkbox
              id="relationship-hide-automated"
              checked={hideAutomated}
              onCheckedChange={(value) => setHideAutomated(value === true)}
            />
            <Label htmlFor="relationship-hide-automated" className="text-sm font-normal">
              Hide {automatedCount} automatic repl{automatedCount === 1 ? 'y' : 'ies'}
            </Label>
          </div>
        )}
      </div>
      {data?.failed_campaigns
        ? <p className="mt-2 text-xs text-amber-700">Some campaigns could not be read, so a reply may be missing.</p>
        : data?.truncated
          ? <p className="mt-2 text-xs text-muted-foreground">Showing replies from the most recently active campaigns.</p>
          : null}
      {visible.length === 0
        ? (
          <p className="mt-3 rounded-lg border border-dashed p-4 text-sm text-muted-foreground">
            {replies.length > 0 ? 'Only automatic replies so far.' : 'This host has not replied to a campaign yet.'}
          </p>
        )
        : (
          <ul className="mt-3 space-y-2">
            {visible.map((reply) => (
              <li key={`${reply.client_id ?? 'none'}:${reply.id}`} className="rounded-lg border bg-muted/10 p-3">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium">{reply.subject || '(no subject)'}</p>
                    <p className="mt-0.5 text-xs text-muted-foreground">
                      {[reply.from_name, reply.from_email].filter(Boolean).join(' · ')}
                      {reply.client_name ? ` · for ${reply.client_name}` : ''}
                    </p>
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    {reply.automated && <Badge variant="outline">Automatic</Badge>}
                    {reply.interested === true && <Badge variant="secondary">Interested</Badge>}
                    <span className="text-xs text-muted-foreground">{formatReceived(reply.received_at)}</span>
                  </div>
                </div>
                <p className="mt-2 line-clamp-[12] whitespace-pre-wrap border-l-2 pl-3 text-sm leading-6 text-foreground/80">
                  {reply.body_text}
                </p>
                {reply.client_id && (
                  <Button asChild variant="link" size="sm" className="mt-1 h-auto px-0">
                    <Link to={`${baseHref}/client-campaigns/${reply.client_id}?tab=replies`}>Open in the campaign</Link>
                  </Button>
                )}
              </li>
            ))}
          </ul>
        )}
    </div>
  )
}
