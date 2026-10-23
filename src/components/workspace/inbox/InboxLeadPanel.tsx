import { Link } from 'react-router-dom'
import { Globe, Loader2, Mic2, Phone } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { safeExternalUrl } from '@/lib/externalUrl'
import {
  INTEREST_STATUS,
  leadInitials,
  statusPill,
  threadStatus,
} from '@/lib/inboxThreads'
import type {
  WorkspaceInboxLeadDetail,
  WorkspaceInboxThread,
  WorkspaceLeadInterestValue,
} from '@/services/workspaceCampaigns'

const interestOptions: Array<{ value: WorkspaceLeadInterestValue; label: string }> = [
  { value: 1, label: 'Interested' },
  { value: 2, label: 'Meeting booked' },
  { value: -1, label: 'Not interested' },
  { value: null, label: 'Reset' },
]

interface InboxLeadPanelProps {
  selectedThread: WorkspaceInboxThread
  leadDetail: WorkspaceInboxLeadDetail | null
  leadDetailLoading: boolean
  sentThreadIds: Set<string>
  canManage: boolean
  interestPending: boolean
  baseHref: string
  onSetInterest: (value: WorkspaceLeadInterestValue) => void
}

export const InboxLeadPanel = ({
  selectedThread,
  leadDetail,
  leadDetailLoading,
  sentThreadIds,
  canManage,
  interestPending,
  baseHref,
  onSetInterest,
}: InboxLeadPanelProps) => {
  const leadFullName = [leadDetail?.first_name, leadDetail?.last_name].filter(Boolean).join(' ').trim()
  const leadName = leadFullName
    || selectedThread.lead_context?.host_name
    || selectedThread.from_email
    || selectedThread.lead_email
    || 'Unknown lead'
  const leadSubtitle = [leadDetail?.job_title, leadDetail?.company_name].filter(Boolean).join(' · ')
  const leadWebsite = leadDetail?.website ? safeExternalUrl(leadDetail.website) : null
  const engagement = leadDetail
    ? { opens: leadDetail.opens, replies: leadDetail.replies, clicks: leadDetail.clicks as number | null }
    : selectedThread.lead_context
      // Clicks unknown here, and unknown is not zero: the thread context does
      // not carry them, and rendering 0 stated a fact nobody measured.
      ? { opens: selectedThread.lead_context.opens, replies: selectedThread.lead_context.replies, clicks: null }
      : null
  const firstContactedAt = leadDetail?.first_contacted_at
    || selectedThread.lead_context?.first_message_at
    || null
  // The thread carries the operator's own decision; the lead detail is the
  // provider's view and lags it.
  const effectiveInterest = selectedThread.interest_status ?? leadDetail?.interest_status ?? null
  const interest = typeof effectiveInterest === 'number' ? INTEREST_STATUS[effectiveInterest] : null
  const pill = statusPill[threadStatus(selectedThread, sentThreadIds)]

  return (
    <aside className="hidden w-80 shrink-0 flex-col overflow-y-auto border-l bg-muted/5 xl:flex" aria-label="Lead details">
      <div className="border-b bg-background/60 p-4">
        <div className="flex items-start gap-3">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary/10 text-sm font-semibold text-primary">
            {leadInitials(leadName)}
          </span>
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold" title={leadName}>{leadName}</p>
            {leadSubtitle && <p className="truncate text-xs text-muted-foreground" title={leadSubtitle}>{leadSubtitle}</p>}
            <p className="mt-0.5 break-all text-xs text-muted-foreground">
              {leadDetail?.email || selectedThread.lead_email || selectedThread.from_email}
            </p>
          </div>
        </div>
        <div className="mt-3 flex flex-wrap gap-1.5">
          {interest
            ? <Badge variant="outline" className={interest.className} title="Interest status in Instantly">{interest.label}</Badge>
            : selectedThread.interested
              ? <Badge variant="outline" className="border-emerald-200 bg-emerald-50 text-emerald-800">Interested</Badge>
              : null}
          {pill && <Badge variant="outline" className={pill.className}>{pill.label}</Badge>}
          {selectedThread.state?.suppressed_at && (
            <Badge variant="outline" className="border-destructive/30 bg-destructive/10 text-destructive">Opted out</Badge>
          )}
        </div>
        {selectedThread.lead_email || selectedThread.from_email ? (
          <div className="mt-3">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Instantly status</p>
            <div className="mt-1.5 flex flex-wrap gap-1.5">
              {interestOptions.map((option) => (
                <Button
                  key={String(option.value)}
                  type="button"
                  size="sm"
                  variant={effectiveInterest === option.value ? 'default' : 'outline'}
                  className="h-7 px-2.5 text-xs"
                  disabled={!canManage || interestPending}
                  title={canManage ? undefined : 'Only workspace owners and admins can change a host’s status'}
                  onClick={() => onSetInterest(option.value)}
                >
                  {option.label}
                </Button>
              ))}
            </div>
            <p className="mt-1.5 text-[11px] leading-4 text-muted-foreground">
              {canManage
                ? 'Writes straight to Instantly. Interested and Meeting booked keep a conversation under Interested; Not interested and Reset move it to Other replies.'
                : 'View only. Workspace owners and admins can change a host’s status.'}
            </p>
          </div>
        ) : null}
        {(leadWebsite || leadDetail?.phone) && (
          <div className="mt-3 flex flex-wrap gap-3 text-xs">
            {leadWebsite && (
              <a href={leadWebsite} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-primary hover:underline">
                <Globe className="h-3.5 w-3.5" />Website
              </a>
            )}
            {leadDetail?.phone && (
              <span className="inline-flex items-center gap-1 text-muted-foreground"><Phone className="h-3.5 w-3.5" />{leadDetail.phone}</span>
            )}
          </div>
        )}
      </div>

      {leadDetailLoading ? (
        <div className="flex items-center gap-2 border-b p-4 text-xs text-muted-foreground">
          <Loader2 className="h-3.5 w-3.5 animate-spin" />Loading lead details…
        </div>
      ) : engagement ? (
        <div className="grid grid-cols-3 divide-x border-b text-center">
          {[
            { label: 'Opens', value: engagement.opens },
            { label: 'Replies', value: engagement.replies },
            { label: 'Clicks', value: engagement.clicks },
          ].map((stat) => (
            <div key={stat.label} className="p-3">
              <p className="text-lg font-semibold tabular-nums">{stat.value ?? '—'}</p>
              <p className="text-[11px] text-muted-foreground">{stat.label}</p>
            </div>
          ))}
        </div>
      ) : null}

      <div className="flex-1 space-y-4 p-4">
        {selectedThread.lead_context?.podcast_name && (
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Podcast</p>
            <p className="mt-1.5 text-sm">{selectedThread.lead_context.podcast_name}</p>
          </div>
        )}
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Outreach</p>
          <dl className="mt-1.5 space-y-1.5 text-xs">
            {selectedThread.campaign?.client && (
              <div className="flex justify-between gap-2"><dt className="text-muted-foreground">Client</dt><dd className="text-right font-medium">{selectedThread.campaign.client.name}</dd></div>
            )}
            {selectedThread.campaign?.campaign_name && (
              <div className="flex justify-between gap-2"><dt className="shrink-0 text-muted-foreground">Campaign</dt><dd className="min-w-0 truncate text-right font-medium" title={selectedThread.campaign.campaign_name}>{selectedThread.campaign.campaign_name}</dd></div>
            )}
            {firstContactedAt && (
              <div className="flex justify-between gap-2"><dt className="text-muted-foreground">First contacted</dt><dd className="text-right">{new Date(firstContactedAt).toLocaleDateString()}</dd></div>
            )}
            {selectedThread.received_at && (
              <div className="flex justify-between gap-2"><dt className="text-muted-foreground">Last reply</dt><dd className="text-right">{new Date(selectedThread.received_at).toLocaleDateString()}</dd></div>
            )}
            {selectedThread.state?.last_nudge_at && (
              <div className="flex justify-between gap-2"><dt className="text-muted-foreground">Last nudge</dt><dd className="text-right">{new Date(selectedThread.state.last_nudge_at).toLocaleDateString()}</dd></div>
            )}
            {selectedThread.eaccount && (
              <div className="flex flex-col gap-0.5"><dt className="text-muted-foreground">Sending mailbox</dt><dd className="break-all font-medium" title={selectedThread.eaccount}>{selectedThread.eaccount}</dd></div>
            )}
          </dl>
        </div>
        {selectedThread.state?.last_nudge_error && (
          <div className="rounded-lg border border-amber-200 bg-amber-50/70 p-3 text-xs leading-5 text-amber-900">
            <p className="font-semibold">Nudges stalled</p>
            <p className="mt-0.5">{selectedThread.state.last_nudge_error}</p>
          </div>
        )}
      </div>

      {selectedThread.campaign?.client && (
        <div className="space-y-2 border-t p-4">
          {/* Back to the placement this reply belongs to. The inbox could
              reach the client but never the show, so the stage, pitch, and
              dates behind a reply were a search away. */}
          {selectedThread.relationship?.podcast_id && (
            <Button asChild variant="outline" size="sm" className="w-full">
              <Link
                to={`${baseHref}/client-podcast-system?client=${encodeURIComponent(selectedThread.campaign.client.id)}&podcast=${encodeURIComponent(selectedThread.relationship.podcast_id)}`}
              >
                <Mic2 className="mr-2 h-4 w-4" />Open this placement
              </Link>
            </Button>
          )}
          <Button asChild variant="outline" size="sm" className="w-full">
            <Link to={`${baseHref}/clients/${encodeURIComponent(selectedThread.campaign.client.id)}`}>
              Open {selectedThread.campaign.client.name.split(' ')[0]}&rsquo;s page
            </Link>
          </Button>
        </div>
      )}
    </aside>
  )
}
