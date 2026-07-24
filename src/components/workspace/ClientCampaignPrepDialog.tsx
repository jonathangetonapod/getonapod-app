import { useEffect, useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  AlertCircle,
  Archive,
  ArrowLeft,
  ArrowRight,
  CheckCircle2,
  ChevronDown,
  Coins,
  ExternalLink,
  FileSearch,
  Loader2,
  Lightbulb,
  Mail,
  Mic2,
  Radio,
  RefreshCw,
  Search,
  Send,
  PenLine,
  Sparkles,
  Users,
} from 'lucide-react'
import { Link } from 'react-router-dom'
import { toast } from 'sonner'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { buildPodcastCampaignSequenceDraft, type PodcastCampaignSequenceDraft } from '@/lib/campaignSequence'
import { safeExternalUrl } from '@/lib/externalUrl'
import type { ClientShortlistPodcast } from '@/services/clientShortlist'
import {
  getWorkspaceCampaign,
  prepareWorkspaceCampaignPodcast,
} from '@/services/workspaceCampaigns'

interface ClientCampaignPrepDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  workspaceId: string
  clientId: string
  clientName: string
  clientBio?: string | null
  campaignHref: string
  podcast: ClientShortlistPodcast | null
  onArchive: () => void
  onPrepared?: () => void
}

type PitchStep = 'email' | 'research' | 'pitch'
type EmailRoute = 'podcast' | 'waterfall' | 'manual'
type ResearchProgressStatus = 'complete' | 'active' | 'queued'

interface ResearchProgressStep {
  id: string
  title: string
  detail: string
  status: ResearchProgressStatus
}

const pitchSteps: Array<{ id: PitchStep; step: string; title: string; detail: string }> = [
  { id: 'email', step: '1', title: 'Find email', detail: 'Identify the host or producer' },
  { id: 'research', step: '2', title: 'Research', detail: 'Understand the show and audience' },
  { id: 'pitch', step: '3', title: 'Write pitch', detail: 'Prepare the pitch and follow-ups' },
]

const researchProgressSteps: ResearchProgressStep[] = [
  { id: 'podcast', title: 'Reading the podcast profile', detail: 'Show focus, format, and positioning', status: 'complete' },
  { id: 'host', title: 'Confirming the host', detail: 'Background and interview approach', status: 'complete' },
  { id: 'episodes', title: 'Reviewing recent episodes', detail: 'Themes, questions, and timely references', status: 'complete' },
  { id: 'guests', title: 'Checking guest patterns', detail: 'Guest format and recent conversations', status: 'complete' },
  { id: 'fit', title: 'Matching guest expertise', detail: 'Audience needs and credible fit', status: 'complete' },
  { id: 'angles', title: 'Preparing pitch angles', detail: 'Primary topic and useful alternatives', status: 'complete' },
]

function emptyDraft(): PodcastCampaignSequenceDraft {
  return {
    researchNotes: '',
    subject: '',
    pitchBody: '',
    followUpOneSubject: '',
    followUpOneBody: '',
    followUpTwoSubject: '',
    followUpTwoBody: '',
  }
}

function fieldComplete(value: string): boolean {
  return Boolean(value.trim())
}

function compactNumber(value: number | null | undefined): string {
  if (!value) return '—'
  return new Intl.NumberFormat('en-US', { notation: 'compact', maximumFractionDigits: 1 }).format(value)
}

function formatPodcastDate(value: string | null | undefined): string {
  if (!value) return '—'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return '—'
  return new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(date)
}

export function ClientCampaignPrepDialog({
  open,
  onOpenChange,
  workspaceId,
  clientId,
  clientName,
  clientBio,
  campaignHref,
  podcast,
  onArchive,
  onPrepared,
}: ClientCampaignPrepDialogProps) {
  const queryClient = useQueryClient()
  const [activeStep, setActiveStep] = useState<PitchStep>('email')
  const [emailRoute, setEmailRoute] = useState<EmailRoute>('podcast')
  const [showPodcastStats, setShowPodcastStats] = useState(false)
  const [showResearchSteps, setShowResearchSteps] = useState(false)
  const [selectedAngleIndex, setSelectedAngleIndex] = useState(0)
  const [hostName, setHostName] = useState('')
  const [contactEmail, setContactEmail] = useState('')
  const [draft, setDraft] = useState<PodcastCampaignSequenceDraft>(emptyDraft)

  const campaignQueryKey = ['client-campaign-preparation', workspaceId, clientId] as const
  const campaignQuery = useQuery({
    queryKey: campaignQueryKey,
    queryFn: () => getWorkspaceCampaign(workspaceId, clientId),
    enabled: open && Boolean(podcast),
    retry: false,
  })
  const campaign = campaignQuery.data?.campaign || null
  const target = campaignQuery.data?.targets.find((item) => item.shortlist_podcast_id === podcast?.id) || null
  const locked = Boolean(target && (
    target.instantly_lead_id
    || ['launching', 'in_outreach', 'replied', 'completed'].includes(target.status)
  ))
  const mappedCampaign = Boolean(campaign?.instantly_campaign_id)
  const podcastUrl = safeExternalUrl(podcast?.podcast_url)
  const podcastImageUrl = safeExternalUrl(podcast?.podcast_image_url)
  const publicPodcastEmail = podcast?.podcast_email?.trim() || ''
  const fitReasons = podcast?.ai_fit_reasons || []
  const pitchAngles = podcast?.ai_pitch_angles || []

  const starterDraft = useMemo(() => podcast
    ? buildPodcastCampaignSequenceDraft({ podcast, clientName, clientBio, angleIndex: selectedAngleIndex })
    : emptyDraft(), [clientBio, clientName, podcast, selectedAngleIndex])

  useEffect(() => {
    if (!open) {
      setActiveStep('email')
      setEmailRoute('podcast')
      setShowPodcastStats(false)
      setShowResearchSteps(false)
      setSelectedAngleIndex(0)
      setHostName('')
      setContactEmail('')
      setDraft(emptyDraft())
    }
  }, [open])

  useEffect(() => {
    if (!open || !podcast || campaignQuery.isLoading) return
    const initial = buildPodcastCampaignSequenceDraft({ podcast, clientName, clientBio })
    const savedContactEmail = target?.contact_email?.trim() || ''
    setHostName(target?.host_name || podcast.publisher_name || '')
    setContactEmail(savedContactEmail || publicPodcastEmail)
    setEmailRoute(
      publicPodcastEmail
      && (!savedContactEmail || savedContactEmail.toLowerCase() === publicPodcastEmail.toLowerCase())
        ? 'podcast'
        : 'waterfall',
    )
    setDraft({
      researchNotes: target?.research_notes || initial.researchNotes,
      subject: target?.pitch_subject || initial.subject,
      pitchBody: target?.pitch_body || initial.pitchBody,
      followUpOneSubject: target?.follow_up_1_subject || initial.followUpOneSubject,
      followUpOneBody: target?.follow_up_1_body || initial.followUpOneBody,
      followUpTwoSubject: target?.follow_up_2_subject || initial.followUpTwoSubject,
      followUpTwoBody: target?.follow_up_2_body || initial.followUpTwoBody,
    })
  }, [campaignQuery.isLoading, clientBio, clientName, open, podcast, publicPodcastEmail, target])

  const updateDraft = (field: keyof PodcastCampaignSequenceDraft, value: string) => {
    setDraft((current) => ({ ...current, [field]: value }))
  }
  const applyResearchDraft = () => {
    setDraft((current) => ({ ...starterDraft, researchNotes: current.researchNotes || starterDraft.researchNotes }))
    toast.success('A fresh three-email draft was built from the selected research angle.')
  }

  const normalizedEmail = contactEmail.trim().toLowerCase()
  const emailReady = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail)
  const sequenceComplete = [
    draft.subject,
    draft.pitchBody,
    draft.followUpOneSubject,
    draft.followUpOneBody,
    draft.followUpTwoSubject,
    draft.followUpTwoBody,
  ].every(fieldComplete)

  const prepareMutation = useMutation({
    mutationFn: () => {
      if (!podcast) throw new Error('Choose a podcast first.')
      return prepareWorkspaceCampaignPodcast({
        workspaceId,
        clientId,
        shortlistPodcastId: podcast.id,
        researchNotes: draft.researchNotes,
        hostName: hostName.trim(),
        contactEmail: normalizedEmail,
        subject: draft.subject,
        pitchBody: draft.pitchBody,
        followUpOneSubject: draft.followUpOneSubject,
        followUpOneBody: draft.followUpOneBody,
        followUpTwoSubject: draft.followUpTwoSubject,
        followUpTwoBody: draft.followUpTwoBody,
      })
    },
    onSuccess: async (result) => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: campaignQueryKey }),
        queryClient.invalidateQueries({ queryKey: ['workspace-client-campaigns', workspaceId] }),
      ])
      toast.success(result.added
        ? `${podcast?.podcast_name || 'Podcast'} pitch draft is ready for outreach review.`
        : `${podcast?.podcast_name || 'Podcast'} pitch draft was updated.`)
      onPrepared?.()
      onOpenChange(false)
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : 'The pitch draft could not be saved.'),
  })

  const submitDisabled = !podcast
    || !mappedCampaign
    || locked
    || !sequenceComplete
    || prepareMutation.isPending

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="grid max-h-[92vh] grid-rows-[auto_minmax(0,1fr)_auto] gap-0 overflow-hidden p-0 sm:max-w-5xl">
        <DialogHeader className="border-b px-5 py-5 pr-12 text-left sm:px-6 sm:pr-12">
          <div className="flex flex-wrap items-center gap-2">
            <Badge className="border-emerald-200 bg-emerald-50 text-emerald-800 hover:bg-emerald-50"><CheckCircle2 className="mr-1 h-3 w-3" />Approved podcast</Badge>
            <Badge variant="secondary">Pitch workspace</Badge>
            {campaign && <Badge variant="outline">{campaign.name}</Badge>}
          </div>
          <DialogTitle className="text-2xl">Write a pitch for {podcast?.podcast_name || 'this podcast'}</DialogTitle>
          <DialogDescription>Find the right contact, research the show, and then write a thoughtful outreach sequence for {clientName}. Nothing sends from this modal.</DialogDescription>
        </DialogHeader>

        <div className="min-h-0 overflow-y-auto overscroll-contain">
          {campaignQuery.isLoading ? (
            <div className="flex min-h-96 flex-col items-center justify-center gap-3"><Loader2 className="h-7 w-7 animate-spin text-primary" /><p className="text-sm text-muted-foreground">Loading the pitch workspace…</p></div>
          ) : locked ? (
            <div className="m-6 flex min-h-80 flex-col items-center justify-center rounded-2xl border border-dashed px-6 text-center">
              <Send className="h-9 w-9 text-sky-600" />
              <h3 className="mt-4 text-lg font-semibold">This podcast is already in outreach</h3>
              <p className="mt-2 max-w-md text-sm leading-6 text-muted-foreground">The sequence is locked so active Instantly outreach cannot be changed accidentally.</p>
              <Button asChild className="mt-5"><Link to={campaignHref}>View outreach</Link></Button>
            </div>
          ) : podcast ? (
            <div>
              <div className="border-b bg-muted/10 px-5 py-4 sm:px-6">
                <section aria-labelledby="pitch-podcast-context-heading" className="overflow-hidden rounded-2xl border bg-background shadow-sm">
                  <div className="flex flex-col gap-4 p-4 sm:flex-row sm:items-center sm:p-5">
                    <div className="flex min-w-0 flex-1 gap-4">
                      <div className="flex h-16 w-16 shrink-0 items-center justify-center overflow-hidden rounded-2xl border bg-muted shadow-sm">
                        {podcastImageUrl
                          ? <img src={podcastImageUrl} alt="" className="h-full w-full object-cover" />
                          : <Radio className="h-7 w-7 text-muted-foreground/60" />}
                      </div>
                      <div className="min-w-0">
                        <p id="pitch-podcast-context-heading" className="text-xs font-semibold uppercase tracking-[0.16em] text-primary">Podcast context</p>
                        <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1">
                          <h3 className="text-lg font-semibold leading-tight">{podcast.podcast_name}</h3>
                          <span className="text-muted-foreground" aria-hidden="true">·</span>
                          <p className="text-sm text-muted-foreground">{podcast.publisher_name || 'Publisher unavailable'}</p>
                        </div>
                      </div>
                    </div>
                    <div className="flex shrink-0 flex-wrap gap-2">
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        aria-expanded={showPodcastStats}
                        aria-controls="pitch-podcast-stats"
                        onClick={() => setShowPodcastStats((current) => !current)}
                      >
                        {showPodcastStats ? 'Hide podcast stats' : 'Show podcast stats'}
                        <ChevronDown className={`ml-2 h-3.5 w-3.5 transition-transform ${showPodcastStats ? 'rotate-180' : ''}`} />
                      </Button>
                      {podcastUrl && <Button asChild variant="outline" size="sm"><a href={podcastUrl} target="_blank" rel="noreferrer">Open show<ExternalLink className="ml-2 h-3.5 w-3.5" /></a></Button>}
                    </div>
                  </div>

                  {showPodcastStats && (
                    <div id="pitch-podcast-stats">
                      <div className="border-t px-4 py-4 sm:px-5">
                        <p className="max-w-3xl text-sm leading-6 text-muted-foreground">{podcast.ai_clean_description || podcast.podcast_description || 'No podcast description is available yet.'}</p>
                        {podcast.podcast_categories && podcast.podcast_categories.length > 0 && (
                          <div className="mt-3 flex flex-wrap gap-1.5">
                            {podcast.podcast_categories.slice(0, 3).map((category) => <Badge key={category.category_id} variant="secondary" className="font-normal">{category.category_name}</Badge>)}
                          </div>
                        )}
                      </div>

                      <div className="grid grid-cols-2 border-t bg-muted/15 sm:grid-cols-4">
                        <div className="border-b border-r px-4 py-3 sm:border-b-0"><p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">Est. audience</p><p className="mt-1 text-sm font-semibold">{compactNumber(podcast.audience_size)}</p></div>
                        <div className="border-b px-4 py-3 sm:border-b-0 sm:border-r"><p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">Apple rating</p><p className="mt-1 text-sm font-semibold">{podcast.itunes_rating ? Number(podcast.itunes_rating).toFixed(1) : '—'}</p></div>
                        <div className="border-r px-4 py-3"><p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">Episodes</p><p className="mt-1 text-sm font-semibold">{podcast.episode_count?.toLocaleString() || '—'}</p></div>
                        <div className="px-4 py-3"><p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">Latest episode</p><p className="mt-1 text-sm font-semibold">{formatPodcastDate(podcast.last_posted_at)}</p></div>
                      </div>

                      {podcast.feedback_notes && (
                        <div className="flex gap-3 border-t border-emerald-100 bg-emerald-50/60 px-4 py-3 sm:px-5">
                          <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-700" />
                          <p className="text-sm leading-5 text-emerald-950"><span className="font-semibold">Client note:</span> “{podcast.feedback_notes}”</p>
                        </div>
                      )}
                    </div>
                  )}
                </section>
              </div>

              <nav aria-label="Pitch workflow steps" className="grid gap-2 border-b bg-muted/20 px-5 py-4 sm:grid-cols-3 sm:px-6">
                {pitchSteps.map((item) => {
                  const active = activeStep === item.id
                  const lockedUntilEmail = item.id !== 'email' && !emailReady
                  return (
                    <button
                      key={item.id}
                      type="button"
                      aria-label={lockedUntilEmail ? `Step ${item.step}: ${item.title} locked until an email is ready` : `Go to step ${item.step}: ${item.title}`}
                      aria-current={active ? 'step' : undefined}
                      disabled={lockedUntilEmail}
                      className={`flex items-center gap-3 rounded-xl border px-3 py-2.5 text-left transition-colors disabled:cursor-not-allowed disabled:opacity-55 ${active ? 'border-primary bg-primary/5 shadow-sm' : 'bg-background hover:border-primary/40 hover:bg-muted/30'}`}
                      onClick={() => setActiveStep(item.id)}
                    >
                      <span className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-semibold ${active ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground'}`}>{item.step}</span>
                      <span className="min-w-0"><span className="block text-sm font-semibold">{item.title}</span><span className="block truncate text-xs text-muted-foreground">{lockedUntilEmail ? 'Email required first' : item.detail}</span></span>
                    </button>
                  )
                })}
              </nav>

              {activeStep === 'email' && (
                <div className="mx-auto max-w-4xl p-5 sm:p-8">
                  <section className="overflow-hidden rounded-2xl border bg-background shadow-sm">
                    <div className="border-b bg-gradient-to-br from-primary/10 via-primary/5 to-background p-5 sm:p-6">
                      <div className="flex gap-3">
                        <div className="rounded-xl bg-primary/10 p-2.5 text-primary"><Mail className="h-5 w-5" /></div>
                        <div><Badge variant="secondary">Step 1</Badge><h3 className="mt-2 text-xl font-semibold">Find the email</h3><p className="mt-1 max-w-2xl text-sm leading-6 text-muted-foreground">A valid email is required before research. Use the free public inbox, try a deeper search, or enter an address you already have.</p></div>
                      </div>
                    </div>

                    <div className="space-y-6 p-5 sm:p-6">
                      <div>
                        <p className="text-sm font-semibold">Choose an email path</p>
                        <p className="mt-1 text-xs leading-5 text-muted-foreground">Choose the route you want. Host identification and Waterfall verification happen automatically behind the scenes.</p>
                        <div className="mt-4 grid gap-4 md:grid-cols-2">
                          <button
                            type="button"
                            aria-label="Use free podcast email"
                            aria-pressed={emailRoute === 'podcast'}
                            disabled={!publicPodcastEmail}
                            className={`relative flex min-h-64 flex-col rounded-2xl border p-5 text-left transition-all disabled:cursor-not-allowed disabled:opacity-60 ${emailRoute === 'podcast' ? 'border-primary bg-primary/5 shadow-sm ring-1 ring-primary/20' : 'bg-background hover:border-primary/40 hover:bg-muted/20'}`}
                            onClick={() => {
                              setEmailRoute('podcast')
                              setContactEmail(publicPodcastEmail)
                            }}
                          >
                            <div className="flex items-start justify-between gap-3">
                              <div className="rounded-xl bg-slate-100 p-2.5 text-slate-700"><Mail className="h-5 w-5" /></div>
                              <Badge variant="outline" className="border-emerald-200 bg-emerald-50 text-emerald-800">0 credits · Basic</Badge>
                            </div>
                            <h4 className="mt-4 font-semibold">Use the podcast email</h4>
                            <p className="mt-2 text-sm leading-6 text-muted-foreground">Use the public address already stored with this podcast. It is fast and free, but may route to a general show inbox.</p>
                            <div className="mt-4 rounded-xl border bg-background px-3 py-2.5">
                              <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">Address on file</p>
                              <p className="mt-1 truncate text-sm font-medium">{publicPodcastEmail || 'No public email found'}</p>
                            </div>
                            <div className="mt-auto flex items-center gap-2 pt-4 text-xs font-medium text-muted-foreground">
                              {emailRoute === 'podcast' && publicPodcastEmail ? <CheckCircle2 className="h-4 w-4 text-primary" /> : <span className="h-4 w-4 rounded-full border" />}
                              {publicPodcastEmail ? (emailRoute === 'podcast' ? 'Selected' : 'Use this email') : 'Unavailable for this show'}
                            </div>
                          </button>

                          <button
                            type="button"
                            aria-label="Try waterfall enrichment"
                            aria-pressed={emailRoute === 'waterfall'}
                            className={`relative flex min-h-64 flex-col rounded-2xl border p-5 text-left transition-all ${emailRoute === 'waterfall' ? 'border-violet-500 bg-violet-50/50 shadow-sm ring-1 ring-violet-200' : 'bg-background hover:border-violet-300 hover:bg-violet-50/20'}`}
                            onClick={() => setEmailRoute('waterfall')}
                          >
                            <div className="flex items-start justify-between gap-3">
                              <div className="rounded-xl bg-violet-100 p-2.5 text-violet-700"><Search className="h-5 w-5" /></div>
                              <div className="flex flex-col items-end gap-1.5">
                                <Badge className="border-violet-200 bg-violet-100 text-violet-800 hover:bg-violet-100">Recommended</Badge>
                                <span className="text-[11px] font-semibold text-violet-800">1 credit on success</span>
                              </div>
                            </div>
                            <h4 className="mt-4 font-semibold">Find the host's direct email</h4>
                            <p className="mt-2 text-sm leading-6 text-muted-foreground">Run a waterfall search to identify the host and verify a work or personal address—the stronger route for reply potential.</p>
                            <div className="mt-4 flex flex-wrap items-center gap-1.5 text-[11px] font-medium text-violet-900">
                              <span className="rounded-full bg-violet-100 px-2.5 py-1">Identify host</span>
                              <ArrowRight className="h-3 w-3 text-violet-400" />
                              <span className="rounded-full bg-violet-100 px-2.5 py-1">Confirm identity</span>
                              <ArrowRight className="h-3 w-3 text-violet-400" />
                              <span className="rounded-full bg-violet-100 px-2.5 py-1">Verify email</span>
                            </div>
                            <div className="mt-auto flex items-center gap-2 pt-4 text-xs font-medium text-violet-800">
                              {emailRoute === 'waterfall' ? <CheckCircle2 className="h-4 w-4" /> : <span className="h-4 w-4 rounded-full border border-violet-300" />}
                              {emailRoute === 'waterfall' ? 'Selected' : 'Try for a better contact'}
                            </div>
                          </button>
                        </div>

                        <button
                          type="button"
                          aria-label="Enter email manually"
                          aria-pressed={emailRoute === 'manual'}
                          className={`mt-4 flex w-full flex-col gap-3 rounded-xl border p-4 text-left transition-all sm:flex-row sm:items-center ${emailRoute === 'manual' ? 'border-slate-500 bg-slate-50 shadow-sm ring-1 ring-slate-200' : 'bg-background hover:border-slate-300 hover:bg-muted/20'}`}
                          onClick={() => {
                            setEmailRoute('manual')
                            if (contactEmail.trim().toLowerCase() === publicPodcastEmail.toLowerCase()) setContactEmail('')
                          }}
                        >
                          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-slate-100 text-slate-700"><PenLine className="h-4 w-4" /></span>
                          <span className="min-w-0 flex-1"><span className="block text-sm font-semibold">Enter an email manually</span><span className="mt-0.5 block text-xs leading-5 text-muted-foreground">Use a host or producer email you found yourself. No credits are used.</span></span>
                          <span className="flex shrink-0 items-center gap-2"><Badge variant="outline">0 credits</Badge>{emailRoute === 'manual' && <CheckCircle2 className="h-4 w-4 text-slate-700" />}</span>
                        </button>

                        {emailRoute === 'manual' && (
                          <div className="mt-4 rounded-xl border bg-slate-50/70 p-4">
                            <Label htmlFor="campaign-manual-email">Email address</Label>
                            <Input
                              id="campaign-manual-email"
                              type="email"
                              value={contactEmail}
                              onChange={(event) => setContactEmail(event.target.value)}
                              maxLength={254}
                              placeholder="host@podcast.com"
                              aria-invalid={Boolean(normalizedEmail) && !emailReady}
                              aria-describedby="campaign-manual-email-help"
                              required
                              className="mt-2 bg-background"
                            />
                            <p id="campaign-manual-email-help" className={`mt-2 text-xs ${emailReady ? 'text-emerald-700' : normalizedEmail ? 'text-destructive' : 'text-muted-foreground'}`}>{emailReady ? 'Email ready. You can continue to Research.' : normalizedEmail ? 'Enter a valid email address.' : 'A valid email is required to unlock Research.'}</p>
                          </div>
                        )}
                      </div>

                      {emailRoute === 'waterfall' && (
                        <div aria-label="Waterfall enrichment plan" className="rounded-xl border border-violet-200 bg-violet-50/50 p-4">
                          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                            <div className="flex gap-3">
                              <Sparkles className="mt-0.5 h-4 w-4 shrink-0 text-violet-700" />
                              <div><p className="text-sm font-semibold text-violet-950">Waterfall selected · 1 credit on success</p><p className="mt-1 max-w-2xl text-xs leading-5 text-violet-900/75">We will identify the host, confirm the right person, and then verify the best available email. The public podcast inbox remains available as a fallback. No verified direct email means no credit is charged.</p></div>
                            </div>
                            <Button asChild variant="outline" size="sm" className="shrink-0 border-violet-200 bg-background text-violet-900 hover:bg-violet-100"><Link to="/app/settings/billing" target="_blank" rel="noreferrer"><Coins className="mr-2 h-3.5 w-3.5" />Buy credits in Billing<ExternalLink className="ml-2 h-3.5 w-3.5" /></Link></Button>
                          </div>
                          <p className="mt-3 border-t border-violet-200/70 pt-3 text-[11px] font-medium leading-5 text-violet-800">Credit top-ups are available on every paid plan, including Solo. Billing opens in a new tab so this pitch stays here.</p>
                        </div>
                      )}

                      {!emailReady && (
                        <div className="flex flex-col gap-3 border-t pt-5 sm:flex-row sm:items-center sm:justify-between">
                          <div><p className="text-sm font-semibold">No usable email?</p><p className="mt-1 text-xs leading-5 text-muted-foreground">Archive this podcast instead of moving an incomplete contact into research.</p></div>
                          <Button type="button" variant="outline" className="shrink-0 border-destructive/30 text-destructive hover:bg-destructive/5 hover:text-destructive" onClick={onArchive}><Archive className="mr-2 h-4 w-4" />Archive podcast</Button>
                        </div>
                      )}

                    </div>
                  </section>
                </div>
              )}

              {activeStep === 'research' && (
                <div className="mx-auto max-w-5xl p-5 sm:p-8">
                  <section aria-labelledby="campaign-research-heading" className="overflow-hidden rounded-2xl border bg-background shadow-sm">
                    <div className="border-b bg-gradient-to-br from-sky-50 via-primary/5 to-background p-5 sm:p-6">
                      <div className="flex gap-3">
                        <div className="h-fit rounded-xl bg-sky-100 p-2.5 text-sky-700"><FileSearch className="h-5 w-5" /></div>
                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-center gap-2">
                            <Badge variant="secondary">Step 2</Badge>
                            <Badge variant="outline" className="border-emerald-200 bg-emerald-50 text-emerald-800"><CheckCircle2 className="mr-1 h-3 w-3" />Included with your plan</Badge>
                          </div>
                          <h3 id="campaign-research-heading" className="mt-2 text-xl font-semibold">Research this podcast</h3>
                          <p className="mt-1 max-w-2xl text-sm leading-6 text-muted-foreground">Review the show, its audience, and the strongest reasons to feature {clientName} before choosing the angle for the pitch.</p>
                        </div>
                      </div>

                      <div className="mt-5 overflow-hidden rounded-xl border border-emerald-200 bg-emerald-50/70">
                        <div className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between">
                          <div className="flex gap-3">
                            <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-700" />
                            <div><p className="text-sm font-semibold text-emerald-950">Research ready · 6 of 6 steps complete</p><p className="mt-1 text-xs leading-5 text-emerald-900/75">The research is saved to this podcast and will still be here when you return.</p></div>
                          </div>
                          <div className="flex shrink-0 items-center gap-2 sm:justify-end">
                            <p className="hidden text-xs font-medium text-emerald-800 lg:block">{podcast.ai_analyzed_at ? `Last researched ${formatPodcastDate(podcast.ai_analyzed_at)}` : 'Saved to your workspace'}</p>
                            <Button
                              type="button"
                              variant="outline"
                              size="sm"
                              className="border-emerald-200 bg-background text-emerald-900 hover:bg-emerald-100 hover:text-emerald-950"
                              aria-expanded={showResearchSteps}
                              aria-controls="campaign-research-progress-steps"
                              onClick={() => setShowResearchSteps((current) => !current)}
                            >
                              {showResearchSteps ? 'Hide steps' : 'View steps'}
                              <ChevronDown className={`ml-2 h-3.5 w-3.5 transition-transform ${showResearchSteps ? 'rotate-180' : ''}`} />
                            </Button>
                          </div>
                        </div>

                        {showResearchSteps && (
                          <div id="campaign-research-progress-steps" className="border-t border-emerald-200/80 bg-background/80">
                            <ol aria-label="Podcast research progress" className="grid gap-px bg-emerald-100 sm:grid-cols-2 lg:grid-cols-3">
                              {researchProgressSteps.map((step) => (
                                <li key={step.id} className="flex gap-3 bg-background p-4">
                                  {step.status === 'complete' && <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" />}
                                  {step.status === 'active' && <Loader2 className="mt-0.5 h-4 w-4 shrink-0 animate-spin text-primary" />}
                                  {step.status === 'queued' && <span className="mt-0.5 h-4 w-4 shrink-0 rounded-full border-2 border-muted-foreground/25" />}
                                  <div><p className="text-xs font-semibold text-foreground">{step.title}</p><p className="mt-1 text-[11px] leading-4 text-muted-foreground">{step.detail}</p></div>
                                </li>
                              ))}
                            </ol>
                            <div className="flex gap-2 border-t px-4 py-3 text-[11px] leading-4 text-muted-foreground"><CheckCircle2 className="h-3.5 w-3.5 shrink-0 text-emerald-600" /><p>While research is running, you can safely close this window and return without losing progress.</p></div>
                          </div>
                        )}
                      </div>
                    </div>

                    <div className="space-y-5 p-5 sm:p-6">
                      <div className="grid gap-4 lg:grid-cols-[minmax(0,1.25fr)_minmax(0,.75fr)]">
                        <section className="rounded-2xl border bg-muted/10 p-5">
                          <div className="flex items-center gap-2"><FileSearch className="h-4 w-4 text-primary" /><h4 className="font-semibold">Show overview</h4></div>
                          <p className="mt-3 text-sm leading-6 text-muted-foreground">{podcast.ai_clean_description || podcast.podcast_description || 'No show overview has been saved yet.'}</p>
                        </section>

                        <section className="rounded-2xl border bg-muted/10 p-5">
                          <div className="flex items-center gap-2"><Mic2 className="h-4 w-4 text-primary" /><h4 className="font-semibold">Host and show</h4></div>
                          <dl className="mt-4 space-y-3 text-sm">
                            <div><dt className="text-xs text-muted-foreground">Host or publisher on record</dt><dd className="mt-1 font-medium">{podcast.publisher_name || 'Not identified yet'}</dd></div>
                            <div><dt className="text-xs text-muted-foreground">Latest activity</dt><dd className="mt-1 font-medium">{formatPodcastDate(podcast.last_posted_at)}</dd></div>
                          </dl>
                        </section>
                      </div>

                      <section className="overflow-hidden rounded-2xl border">
                        <div className="flex items-center gap-2 border-b bg-muted/15 px-5 py-4"><Users className="h-4 w-4 text-primary" /><h4 className="font-semibold">Audience snapshot</h4></div>
                        <div className="grid grid-cols-1 divide-y sm:grid-cols-3 sm:divide-x sm:divide-y-0">
                          <div className="px-5 py-4"><p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">Estimated audience</p><p className="mt-1 text-lg font-semibold">{compactNumber(podcast.audience_size)}</p></div>
                          <div className="px-5 py-4"><p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">Episode library</p><p className="mt-1 text-lg font-semibold">{podcast.episode_count?.toLocaleString() || '—'}</p></div>
                          <div className="px-5 py-4"><p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">Primary themes</p><div className="mt-2 flex flex-wrap gap-1.5">{podcast.podcast_categories?.length ? podcast.podcast_categories.slice(0, 3).map((category) => <Badge key={category.category_id} variant="secondary" className="font-normal">{category.category_name}</Badge>) : <span className="text-sm font-medium">—</span>}</div></div>
                        </div>
                      </section>

                      <div className="grid gap-4 lg:grid-cols-2">
                        <section className="rounded-2xl border p-5">
                          <div className="flex items-center gap-2"><CheckCircle2 className="h-4 w-4 text-primary" /><h4 className="font-semibold">Why {clientName} fits</h4></div>
                          {fitReasons.length > 0
                            ? <ul className="mt-4 space-y-3 text-sm">{fitReasons.slice(0, 4).map((reason) => <li key={reason} className="flex gap-2.5 leading-6"><span className="mt-2.5 h-1.5 w-1.5 shrink-0 rounded-full bg-primary" /><span>{reason}</span></li>)}</ul>
                            : <p className="mt-3 text-sm leading-6 text-muted-foreground">Fit findings will appear here after the podcast has been analyzed for {clientName}.</p>}
                        </section>

                        <section className="rounded-2xl border p-5">
                          <div className="flex items-center gap-2"><Lightbulb className="h-4 w-4 text-primary" /><h4 className="font-semibold">Recommended pitch angles</h4></div>
                          <p className="mt-1 text-xs leading-5 text-muted-foreground">Select the direction that should lead the outreach.</p>
                          {pitchAngles.length > 0
                            ? <div className="mt-4 space-y-2">{pitchAngles.slice(0, 3).map((angle, index) => <button key={`${angle.title}-${index}`} type="button" aria-pressed={selectedAngleIndex === index} className={`w-full rounded-xl border p-3 text-left transition-colors ${selectedAngleIndex === index ? 'border-primary bg-primary/5 shadow-sm ring-1 ring-primary/15' : 'bg-background hover:border-primary/40'}`} onClick={() => setSelectedAngleIndex(index)}><div className="flex gap-2.5"><span className={`mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full border ${selectedAngleIndex === index ? 'border-primary' : 'border-muted-foreground/40'}`}>{selectedAngleIndex === index && <span className="h-2 w-2 rounded-full bg-primary" />}</span><span><span className="block text-sm font-semibold">{angle.title}</span><span className="mt-1 block text-xs leading-5 text-muted-foreground">{angle.description}</span></span></div></button>)}</div>
                            : <p className="mt-3 text-sm leading-6 text-muted-foreground">Recommended angles will appear here once the podcast research is ready.</p>}
                        </section>
                      </div>

                      <section className="rounded-2xl border bg-background p-5">
                        <Label htmlFor="campaign-research-notes" className="text-base font-semibold">Additional research notes</Label>
                        <p className="mt-1 text-xs leading-5 text-muted-foreground">Add anything the research should carry into the pitch, such as a recent episode, a host preference, a useful proof point, or an angle to avoid.</p>
                        <Textarea id="campaign-research-notes" aria-label="Research notes" value={draft.researchNotes} onChange={(event) => updateDraft('researchNotes', event.target.value)} className="mt-4 min-h-44 resize-y" maxLength={10_000} placeholder="Add focused podcast research here…" />
                      </section>
                    </div>
                  </section>
                </div>
              )}

              {activeStep === 'pitch' && (
                <div className="space-y-5 p-5 sm:p-6">
                  {(campaignQuery.error || !mappedCampaign) && (
                    <div className="flex flex-col gap-3 rounded-xl border border-amber-200 bg-amber-50/70 p-4 text-amber-950 sm:flex-row sm:items-center sm:justify-between">
                      <div className="flex gap-3"><AlertCircle className="mt-0.5 h-5 w-5 shrink-0 text-amber-700" /><div><p className="text-sm font-semibold">You can design the pitch now</p><p className="mt-1 text-xs leading-5 text-amber-900/80">Connect or assign the client campaign before saving this draft for outreach.</p></div></div>
                      <div className="flex shrink-0 gap-2">{campaignQuery.error && <Button type="button" variant="outline" size="sm" onClick={() => void campaignQuery.refetch()}><RefreshCw className="mr-2 h-3.5 w-3.5" />Retry</Button>}<Button asChild variant="outline" size="sm"><Link to={campaignHref}>Campaign setup</Link></Button></div>
                    </div>
                  )}
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between"><div><Badge variant="secondary">Step 3</Badge><h3 className="mt-2 text-xl font-semibold">Write the pitch</h3><p className="mt-1 text-sm text-muted-foreground">Write one personal opening pitch and two respectful follow-ups.</p></div><Button type="button" variant="outline" onClick={applyResearchDraft}><Sparkles className="mr-2 h-4 w-4" />Build draft from research</Button></div>
                  <div className="grid gap-4 lg:grid-cols-2">
                    <section className="space-y-3 rounded-2xl border p-5 lg:col-span-2"><div><Badge variant="secondary">Email 1 · Opening pitch</Badge><p className="mt-2 text-xs text-muted-foreground">Your personalized first note to the host or producer.</p></div><div className="space-y-2"><Label htmlFor="campaign-pitch-subject">Subject</Label><Input id="campaign-pitch-subject" value={draft.subject} onChange={(event) => updateDraft('subject', event.target.value)} maxLength={300} /></div><div className="space-y-2"><Label htmlFor="campaign-pitch-body">Opening email</Label><Textarea id="campaign-pitch-body" value={draft.pitchBody} onChange={(event) => updateDraft('pitchBody', event.target.value)} className="min-h-52 resize-y" maxLength={20_000} /></div></section>
                    <section className="space-y-3 rounded-2xl border p-5"><div><Badge variant="secondary">Email 2 · Follow-up</Badge><p className="mt-2 text-xs text-muted-foreground">Wait 3 days. Stop when the host replies.</p></div><div className="space-y-2"><Label htmlFor="campaign-follow-up-one-subject">Follow-up 1 subject</Label><Input id="campaign-follow-up-one-subject" value={draft.followUpOneSubject} onChange={(event) => updateDraft('followUpOneSubject', event.target.value)} maxLength={300} /></div><div className="space-y-2"><Label htmlFor="campaign-follow-up-one-body">Follow-up 1 email</Label><Textarea id="campaign-follow-up-one-body" value={draft.followUpOneBody} onChange={(event) => updateDraft('followUpOneBody', event.target.value)} className="min-h-40 resize-y" maxLength={20_000} /></div></section>
                    <section className="space-y-3 rounded-2xl border p-5"><div><Badge variant="secondary">Email 3 · Close the loop</Badge><p className="mt-2 text-xs text-muted-foreground">Wait 5 more days, then close respectfully.</p></div><div className="space-y-2"><Label htmlFor="campaign-follow-up-two-subject">Follow-up 2 subject</Label><Input id="campaign-follow-up-two-subject" value={draft.followUpTwoSubject} onChange={(event) => updateDraft('followUpTwoSubject', event.target.value)} maxLength={300} /></div><div className="space-y-2"><Label htmlFor="campaign-follow-up-two-body">Follow-up 2 email</Label><Textarea id="campaign-follow-up-two-body" value={draft.followUpTwoBody} onChange={(event) => updateDraft('followUpTwoBody', event.target.value)} className="min-h-40 resize-y" maxLength={20_000} /></div></section>
                  </div>
                </div>
              )}
            </div>
          ) : null}
        </div>

        {podcast && !locked && !campaignQuery.isLoading && (
          <footer aria-label="Pitch actions" className="shrink-0 border-t bg-muted/20 px-4 pb-5 pt-4 sm:px-6 sm:pb-6">
            <div className="flex flex-col gap-4 rounded-2xl border bg-background p-4 shadow-sm sm:flex-row sm:items-center sm:justify-between">
              <p className="max-w-xl text-xs leading-5 text-muted-foreground">
                {activeStep === 'email' && (emailReady
                  ? 'Email ready. Research is unlocked.'
                  : 'A valid email is required before you can continue to Research.')}
                {activeStep === 'research' && 'Research is included with your plan, saved to this podcast, and used to shape the pitch.'}
                {activeStep === 'pitch' && 'This step is only for writing the opening pitch and follow-ups. Nothing is sent yet.'}
              </p>
              <div className="grid w-full gap-2 sm:flex sm:w-auto sm:flex-wrap sm:justify-end">
                <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
                {activeStep !== 'email' && <Button type="button" variant="outline" onClick={() => setActiveStep(activeStep === 'pitch' ? 'research' : 'email')}><ArrowLeft className="mr-2 h-4 w-4" />Back</Button>}
                {activeStep === 'email' && <Button type="button" disabled={!emailReady} onClick={() => setActiveStep('research')}>Continue to research<ArrowRight className="ml-2 h-4 w-4" /></Button>}
                {activeStep === 'research' && <Button type="button" onClick={() => setActiveStep('pitch')}>Continue to write pitch<ArrowRight className="ml-2 h-4 w-4" /></Button>}
                {activeStep === 'pitch' && <Button type="button" disabled={submitDisabled} onClick={() => prepareMutation.mutate()}>{prepareMutation.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Send className="mr-2 h-4 w-4" />}{target ? 'Update pitch draft' : 'Save pitch draft'}</Button>}
              </div>
            </div>
          </footer>
        )}
      </DialogContent>
    </Dialog>
  )
}
