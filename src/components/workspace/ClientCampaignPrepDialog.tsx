import { useEffect, useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  AlertCircle,
  ArrowLeft,
  ArrowRight,
  CheckCircle2,
  Coins,
  ExternalLink,
  FileSearch,
  Loader2,
  Mail,
  Radio,
  RefreshCw,
  Search,
  Send,
  Sparkles,
} from 'lucide-react'
import { Link } from 'react-router-dom'
import { toast } from 'sonner'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
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
  onPrepared?: () => void
}

type PitchStep = 'email' | 'research' | 'pitch'
type EmailRoute = 'podcast' | 'waterfall'

const pitchSteps: Array<{ id: PitchStep; step: string; title: string; detail: string }> = [
  { id: 'email', step: '1', title: 'Find email', detail: 'Identify the host or producer' },
  { id: 'research', step: '2', title: 'Research', detail: 'Understand the show and audience' },
  { id: 'pitch', step: '3', title: 'Write pitch', detail: 'Prepare the pitch and follow-ups' },
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
  onPrepared,
}: ClientCampaignPrepDialogProps) {
  const queryClient = useQueryClient()
  const [activeStep, setActiveStep] = useState<PitchStep>('email')
  const [emailRoute, setEmailRoute] = useState<EmailRoute>('podcast')
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
  const emailValid = !normalizedEmail || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail)
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
    || !emailValid
    || !sequenceComplete
    || prepareMutation.isPending

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[92vh] overflow-hidden p-0 sm:max-w-5xl">
        <DialogHeader className="border-b px-5 py-5 pr-12 text-left sm:px-6 sm:pr-12">
          <div className="flex flex-wrap items-center gap-2">
            <Badge className="border-emerald-200 bg-emerald-50 text-emerald-800 hover:bg-emerald-50"><CheckCircle2 className="mr-1 h-3 w-3" />Approved podcast</Badge>
            <Badge variant="secondary">Pitch workspace</Badge>
            {campaign && <Badge variant="outline">{campaign.name}</Badge>}
          </div>
          <DialogTitle className="text-2xl">Write a pitch for {podcast?.podcast_name || 'this podcast'}</DialogTitle>
          <DialogDescription>Find the right contact, research the show, and then write a thoughtful outreach sequence for {clientName}. Nothing sends from this modal.</DialogDescription>
        </DialogHeader>

        <div className="max-h-[calc(92vh-13rem)] overflow-y-auto">
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
                  <div className="flex flex-col gap-4 p-4 sm:flex-row sm:p-5">
                    <div className="flex min-w-0 flex-1 gap-4">
                      <div className="flex h-20 w-20 shrink-0 items-center justify-center overflow-hidden rounded-2xl border bg-muted shadow-sm">
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
                        <p className="mt-2 line-clamp-2 max-w-2xl text-sm leading-6 text-muted-foreground">{podcast.ai_clean_description || podcast.podcast_description || 'No podcast description is available yet.'}</p>
                        {podcast.podcast_categories && podcast.podcast_categories.length > 0 && (
                          <div className="mt-3 flex flex-wrap gap-1.5">
                            {podcast.podcast_categories.slice(0, 3).map((category) => <Badge key={category.category_id} variant="secondary" className="font-normal">{category.category_name}</Badge>)}
                          </div>
                        )}
                      </div>
                    </div>
                    {podcastUrl && <Button asChild variant="outline" size="sm" className="shrink-0"><a href={podcastUrl} target="_blank" rel="noreferrer">Open show<ExternalLink className="ml-2 h-3.5 w-3.5" /></a></Button>}
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
                </section>
              </div>

              <nav aria-label="Pitch workflow steps" className="grid gap-2 border-b bg-muted/20 px-5 py-4 sm:grid-cols-3 sm:px-6">
                {pitchSteps.map((item) => {
                  const active = activeStep === item.id
                  return (
                    <button
                      key={item.id}
                      type="button"
                      aria-label={`Go to step ${item.step}: ${item.title}`}
                      aria-current={active ? 'step' : undefined}
                      className={`flex items-center gap-3 rounded-xl border px-3 py-2.5 text-left transition-colors ${active ? 'border-primary bg-primary/5 shadow-sm' : 'bg-background hover:border-primary/40 hover:bg-muted/30'}`}
                      onClick={() => setActiveStep(item.id)}
                    >
                      <span className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-semibold ${active ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground'}`}>{item.step}</span>
                      <span className="min-w-0"><span className="block text-sm font-semibold">{item.title}</span><span className="block truncate text-xs text-muted-foreground">{item.detail}</span></span>
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
                        <div><Badge variant="secondary">Step 1</Badge><h3 className="mt-2 text-xl font-semibold">Find the email</h3><p className="mt-1 max-w-2xl text-sm leading-6 text-muted-foreground">Choose the free public inbox already on file, or try a deeper waterfall search for the host's direct email.</p></div>
                      </div>
                    </div>

                    <div className="space-y-6 p-5 sm:p-6">
                      <div>
                        <p className="text-sm font-semibold">Choose an email path</p>
                        <p className="mt-1 text-xs leading-5 text-muted-foreground">You can use the basic address immediately or look for a more personal route that is more likely to earn a response.</p>
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
                              <span className="rounded-full bg-violet-100 px-2.5 py-1">Match LinkedIn</span>
                              <ArrowRight className="h-3 w-3 text-violet-400" />
                              <span className="rounded-full bg-violet-100 px-2.5 py-1">Verify email</span>
                            </div>
                            <div className="mt-auto flex items-center gap-2 pt-4 text-xs font-medium text-violet-800">
                              {emailRoute === 'waterfall' ? <CheckCircle2 className="h-4 w-4" /> : <span className="h-4 w-4 rounded-full border border-violet-300" />}
                              {emailRoute === 'waterfall' ? 'Selected' : 'Try for a better contact'}
                            </div>
                          </button>
                        </div>
                      </div>

                      {emailRoute === 'waterfall' && (
                        <div aria-label="Waterfall enrichment plan" className="rounded-xl border border-violet-200 bg-violet-50/50 p-4">
                          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                            <div className="flex gap-3">
                              <Sparkles className="mt-0.5 h-4 w-4 shrink-0 text-violet-700" />
                              <div><p className="text-sm font-semibold text-violet-950">Waterfall selected · 1 credit on success</p><p className="mt-1 max-w-2xl text-xs leading-5 text-violet-900/75">We will identify the host, match the right LinkedIn profile, and then verify the best available email. The public podcast inbox remains available as a fallback. No verified direct email means no credit is charged.</p></div>
                            </div>
                            <Button type="button" variant="outline" size="sm" className="shrink-0 border-violet-200 bg-background text-violet-900 hover:bg-violet-100"><Coins className="mr-2 h-3.5 w-3.5" />Buy more credits</Button>
                          </div>
                          <p className="mt-3 border-t border-violet-200/70 pt-3 text-[11px] font-medium text-violet-800">Credit top-ups are available on every paid plan, including Solo. Upgrading is only necessary when you need more clients, campaigns, or seats.</p>
                        </div>
                      )}

                      <div className="border-t pt-5">
                        <p className="text-sm font-semibold">Contact record</p>
                        <p className="mt-1 text-xs text-muted-foreground">Confirm or edit the person and best email before moving to research.</p>
                      </div>
                      <div className="grid gap-4 sm:grid-cols-2">
                        <div className="space-y-2"><Label htmlFor="campaign-host-name">Host or producer</Label><Input id="campaign-host-name" value={hostName} onChange={(event) => setHostName(event.target.value)} maxLength={500} placeholder="Host or booking contact" /></div>
                        <div className="space-y-2"><Label htmlFor="campaign-contact-email">Email</Label><Input id="campaign-contact-email" type="email" value={contactEmail} onChange={(event) => setContactEmail(event.target.value)} maxLength={254} placeholder="host@podcast.com" aria-invalid={!emailValid} />{!emailValid && <p className="text-xs text-destructive">Enter a valid email address or leave it blank.</p>}</div>
                      </div>
                      <p className="text-xs text-muted-foreground">Contact details stay private to your workspace.</p>
                    </div>
                  </section>
                </div>
              )}

              {activeStep === 'research' && (
                <div className="p-5 sm:p-6">
                  <div className="mb-5">
                    <div><Badge variant="secondary">Step 2</Badge><h3 className="mt-2 text-xl font-semibold">Research the podcast</h3><p className="mt-1 text-sm text-muted-foreground">Focus only on the show, its audience, recent episodes, and the strongest guest angle.</p></div>
                  </div>
                  <div className="grid gap-5 lg:grid-cols-[minmax(0,.9fr)_minmax(0,1.1fr)]">
                    <div className="space-y-5 rounded-2xl border bg-muted/15 p-5">
                      <section><div className="flex items-center gap-2"><FileSearch className="h-4 w-4 text-primary" /><h4 className="font-semibold">Show brief</h4></div><p className="mt-3 text-sm leading-6 text-muted-foreground">{podcast.ai_clean_description || podcast.podcast_description || 'Add what you learn about the show, host, audience, and recent episodes.'}</p></section>
                      {fitReasons.length > 0 && <section><p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Why it fits</p><ul className="mt-2 space-y-2 text-sm">{fitReasons.slice(0, 4).map((reason) => <li key={reason} className="flex gap-2"><span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-primary" /><span>{reason}</span></li>)}</ul></section>}
                      {pitchAngles.length > 0 && <section><p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Choose the lead angle</p><div className="mt-2 space-y-2">{pitchAngles.slice(0, 3).map((angle, index) => <button key={`${angle.title}-${index}`} type="button" className={`w-full rounded-xl border p-3 text-left transition-colors ${selectedAngleIndex === index ? 'border-primary bg-primary/5' : 'bg-background hover:border-primary/40'}`} onClick={() => setSelectedAngleIndex(index)}><p className="text-sm font-semibold">{angle.title}</p><p className="mt-1 text-xs leading-5 text-muted-foreground">{angle.description}</p></button>)}</div></section>}
                    </div>
                    <section className="rounded-2xl border bg-background p-5"><Label htmlFor="campaign-research-notes" className="text-base font-semibold">Research notes</Label><p className="mt-1 text-xs text-muted-foreground">Capture recent episodes, host preferences, audience details, useful proof points, and angles to avoid.</p><Textarea id="campaign-research-notes" value={draft.researchNotes} onChange={(event) => updateDraft('researchNotes', event.target.value)} className="mt-4 min-h-80 resize-y" maxLength={10_000} placeholder="Add focused podcast research here…" /></section>
                  </div>
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
          <DialogFooter className="border-t bg-background px-5 py-4 sm:items-center sm:justify-between sm:px-6">
            <p className="max-w-xl text-xs leading-5 text-muted-foreground">
              {activeStep === 'email' && 'This step is only for identifying and confirming the right contact.'}
              {activeStep === 'research' && 'This step is only for understanding the podcast and choosing the strongest angle.'}
              {activeStep === 'pitch' && 'This step is only for writing the opening pitch and follow-ups. Nothing is sent yet.'}
            </p>
            <div className="flex flex-wrap justify-end gap-2">
              <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
              {activeStep !== 'email' && <Button type="button" variant="outline" onClick={() => setActiveStep(activeStep === 'pitch' ? 'research' : 'email')}><ArrowLeft className="mr-2 h-4 w-4" />Back</Button>}
              {activeStep === 'email' && <Button type="button" onClick={() => setActiveStep('research')}>Continue to research<ArrowRight className="ml-2 h-4 w-4" /></Button>}
              {activeStep === 'research' && <Button type="button" onClick={() => setActiveStep('pitch')}>Continue to write pitch<ArrowRight className="ml-2 h-4 w-4" /></Button>}
              {activeStep === 'pitch' && <Button type="button" disabled={submitDisabled} onClick={() => prepareMutation.mutate()}>{prepareMutation.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Send className="mr-2 h-4 w-4" />}{target ? 'Update pitch draft' : 'Save pitch draft'}</Button>}
            </div>
          </DialogFooter>
        )}
      </DialogContent>
    </Dialog>
  )
}
