import { useEffect, useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { AlertCircle, CheckCircle2, ExternalLink, FileSearch, Loader2, Mail, RefreshCw, Send, Sparkles } from 'lucide-react'
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
  const fitReasons = podcast?.ai_fit_reasons || []
  const pitchAngles = podcast?.ai_pitch_angles || []

  const starterDraft = useMemo(() => podcast
    ? buildPodcastCampaignSequenceDraft({ podcast, clientName, clientBio, angleIndex: selectedAngleIndex })
    : emptyDraft(), [clientBio, clientName, podcast, selectedAngleIndex])

  useEffect(() => {
    if (!open) {
      setSelectedAngleIndex(0)
      setHostName('')
      setContactEmail('')
      setDraft(emptyDraft())
    }
  }, [open])

  useEffect(() => {
    if (!open || !podcast || campaignQuery.isLoading) return
    const initial = buildPodcastCampaignSequenceDraft({ podcast, clientName, clientBio })
    setHostName(target?.host_name || podcast.publisher_name || '')
    setContactEmail(target?.contact_email || podcast.podcast_email || '')
    setDraft({
      researchNotes: target?.research_notes || initial.researchNotes,
      subject: target?.pitch_subject || initial.subject,
      pitchBody: target?.pitch_body || initial.pitchBody,
      followUpOneSubject: target?.follow_up_1_subject || initial.followUpOneSubject,
      followUpOneBody: target?.follow_up_1_body || initial.followUpOneBody,
      followUpTwoSubject: target?.follow_up_2_subject || initial.followUpTwoSubject,
      followUpTwoBody: target?.follow_up_2_body || initial.followUpTwoBody,
    })
  }, [campaignQuery.isLoading, clientBio, clientName, open, podcast, target])

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
        ? `${podcast?.podcast_name || 'Podcast'} and its outreach sequence were pushed to ${result.campaign.name}.`
        : `${podcast?.podcast_name || 'Podcast'} campaign preparation was updated.`)
      onPrepared?.()
      onOpenChange(false)
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : 'The prepared outreach could not be pushed to the client campaign.'),
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
            <Badge className="border-emerald-200 bg-emerald-50 text-emerald-800 hover:bg-emerald-50"><CheckCircle2 className="mr-1 h-3 w-3" />Client approved</Badge>
            {campaign && <Badge variant="outline">{campaign.name}</Badge>}
          </div>
          <DialogTitle className="text-2xl">Prepare {podcast?.podcast_name || 'podcast'} outreach</DialogTitle>
          <DialogDescription>Research the fit, review all three emails, and then push the completed draft into {clientName}’s campaign. Nothing sends from this modal.</DialogDescription>
        </DialogHeader>

        <div className="max-h-[calc(92vh-13rem)] overflow-y-auto">
          {campaignQuery.isLoading ? (
            <div className="flex min-h-96 flex-col items-center justify-center gap-3"><Loader2 className="h-7 w-7 animate-spin text-primary" /><p className="text-sm text-muted-foreground">Loading the client campaign…</p></div>
          ) : campaignQuery.error ? (
            <div className="m-6 rounded-xl border border-destructive/30 bg-destructive/5 p-5"><div className="flex gap-3"><AlertCircle className="mt-0.5 h-5 w-5 text-destructive" /><div><p className="font-semibold">Campaign unavailable</p><p className="mt-1 text-sm text-muted-foreground">{campaignQuery.error instanceof Error ? campaignQuery.error.message : 'The client campaign could not be loaded.'}</p><Button className="mt-4" variant="outline" onClick={() => void campaignQuery.refetch()}><RefreshCw className="mr-2 h-4 w-4" />Try again</Button></div></div></div>
          ) : !mappedCampaign ? (
            <div className="m-6 flex min-h-80 flex-col items-center justify-center rounded-2xl border border-dashed px-6 text-center">
              <AlertCircle className="h-9 w-9 text-amber-600" />
              <h3 className="mt-4 text-lg font-semibold">Create or assign the client campaign first</h3>
              <p className="mt-2 max-w-md text-sm leading-6 text-muted-foreground">{clientName} needs a real Instantly campaign before prepared podcast outreach has somewhere to go.</p>
              <Button asChild className="mt-5"><Link to={campaignHref}>Open Client Campaigns</Link></Button>
            </div>
          ) : locked ? (
            <div className="m-6 flex min-h-80 flex-col items-center justify-center rounded-2xl border border-dashed px-6 text-center">
              <Send className="h-9 w-9 text-sky-600" />
              <h3 className="mt-4 text-lg font-semibold">This podcast is already in outreach</h3>
              <p className="mt-2 max-w-md text-sm leading-6 text-muted-foreground">The sequence is locked so active Instantly outreach cannot be changed accidentally.</p>
              <Button asChild className="mt-5"><Link to={campaignHref}>Open client campaign</Link></Button>
            </div>
          ) : podcast ? (
            <div className="grid lg:grid-cols-[minmax(0,.8fr)_minmax(0,1.2fr)]">
              <div className="space-y-5 border-b bg-muted/15 p-5 lg:border-b-0 lg:border-r sm:p-6">
                <section>
                  <div className="flex items-center justify-between gap-3"><div className="flex items-center gap-2"><FileSearch className="h-4 w-4 text-primary" /><h3 className="font-semibold">Research brief</h3></div>{podcastUrl && <Button asChild variant="ghost" size="sm"><a href={podcastUrl} target="_blank" rel="noreferrer">Open show<ExternalLink className="ml-2 h-3.5 w-3.5" /></a></Button>}</div>
                  <p className="mt-3 text-sm leading-6 text-muted-foreground">{podcast.ai_clean_description || podcast.podcast_description || 'Add what you learn about the show, host, audience, and recent episodes below.'}</p>
                  {fitReasons.length > 0 && <div className="mt-4"><p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Why it fits</p><ul className="mt-2 space-y-2 text-sm">{fitReasons.slice(0, 4).map((reason) => <li key={reason} className="flex gap-2"><span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-primary" /><span>{reason}</span></li>)}</ul></div>}
                </section>

                {pitchAngles.length > 0 && <section><p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Choose the lead angle</p><div className="mt-2 space-y-2">{pitchAngles.slice(0, 3).map((angle, index) => <button key={`${angle.title}-${index}`} type="button" className={`w-full rounded-xl border p-3 text-left transition-colors ${selectedAngleIndex === index ? 'border-primary bg-primary/5' : 'hover:bg-background'}`} onClick={() => setSelectedAngleIndex(index)}><p className="text-sm font-semibold">{angle.title}</p><p className="mt-1 text-xs leading-5 text-muted-foreground">{angle.description}</p></button>)}</div></section>}

                <div className="space-y-2"><Label htmlFor="campaign-research-notes">Research notes</Label><Textarea id="campaign-research-notes" value={draft.researchNotes} onChange={(event) => updateDraft('researchNotes', event.target.value)} rows={7} maxLength={10_000} placeholder="Recent episodes, host preferences, audience details, proof points, and angles to avoid…" /></div>

                <section className="rounded-xl border bg-background p-4"><div className="flex items-center gap-2"><Mail className="h-4 w-4 text-primary" /><h3 className="font-semibold">Host contact</h3></div><div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-1 xl:grid-cols-2"><div className="space-y-2"><Label htmlFor="campaign-host-name">Host or producer</Label><Input id="campaign-host-name" value={hostName} onChange={(event) => setHostName(event.target.value)} maxLength={500} placeholder="Host or booking contact" /></div><div className="space-y-2"><Label htmlFor="campaign-contact-email">Email</Label><Input id="campaign-contact-email" type="email" value={contactEmail} onChange={(event) => setContactEmail(event.target.value)} maxLength={254} placeholder="host@podcast.com" aria-invalid={!emailValid} /></div></div>{!emailValid && <p className="mt-2 text-xs text-destructive">Enter a valid email address or leave it blank for later research.</p>}</section>
              </div>

              <div className="space-y-5 p-5 sm:p-6">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between"><div><div className="flex items-center gap-2"><Sparkles className="h-4 w-4 text-primary" /><h3 className="font-semibold">Three-email sequence</h3></div><p className="mt-1 text-sm text-muted-foreground">Use the research starter or edit every word manually.</p></div><Button type="button" variant="outline" size="sm" onClick={applyResearchDraft}><Sparkles className="mr-2 h-4 w-4" />Build draft from research</Button></div>

                <section className="space-y-3 rounded-xl border p-4"><div><Badge variant="secondary">Email 1 · Opening pitch</Badge><p className="mt-2 text-xs text-muted-foreground">Sent after final approval in Client Campaigns.</p></div><div className="space-y-2"><Label htmlFor="campaign-pitch-subject">Subject</Label><Input id="campaign-pitch-subject" value={draft.subject} onChange={(event) => updateDraft('subject', event.target.value)} maxLength={300} /></div><div className="space-y-2"><Label htmlFor="campaign-pitch-body">Opening email</Label><Textarea id="campaign-pitch-body" value={draft.pitchBody} onChange={(event) => updateDraft('pitchBody', event.target.value)} className="min-h-52 resize-y" maxLength={20_000} /></div></section>

                <section className="space-y-3 rounded-xl border p-4"><div><Badge variant="secondary">Email 2 · Follow-up</Badge><p className="mt-2 text-xs text-muted-foreground">Wait 3 days. Instantly stops the sequence when the host replies.</p></div><div className="space-y-2"><Label htmlFor="campaign-follow-up-one-subject">Follow-up 1 subject</Label><Input id="campaign-follow-up-one-subject" value={draft.followUpOneSubject} onChange={(event) => updateDraft('followUpOneSubject', event.target.value)} maxLength={300} /></div><div className="space-y-2"><Label htmlFor="campaign-follow-up-one-body">Follow-up 1 email</Label><Textarea id="campaign-follow-up-one-body" value={draft.followUpOneBody} onChange={(event) => updateDraft('followUpOneBody', event.target.value)} className="min-h-40 resize-y" maxLength={20_000} /></div></section>

                <section className="space-y-3 rounded-xl border p-4"><div><Badge variant="secondary">Email 3 · Close the loop</Badge><p className="mt-2 text-xs text-muted-foreground">Wait 5 more days, then close the conversation respectfully.</p></div><div className="space-y-2"><Label htmlFor="campaign-follow-up-two-subject">Follow-up 2 subject</Label><Input id="campaign-follow-up-two-subject" value={draft.followUpTwoSubject} onChange={(event) => updateDraft('followUpTwoSubject', event.target.value)} maxLength={300} /></div><div className="space-y-2"><Label htmlFor="campaign-follow-up-two-body">Follow-up 2 email</Label><Textarea id="campaign-follow-up-two-body" value={draft.followUpTwoBody} onChange={(event) => updateDraft('followUpTwoBody', event.target.value)} className="min-h-40 resize-y" maxLength={20_000} /></div></section>
              </div>
            </div>
          ) : null}
        </div>

        {mappedCampaign && !locked && !campaignQuery.isLoading && !campaignQuery.error && (
          <DialogFooter className="border-t bg-background px-5 py-4 sm:items-center sm:justify-between sm:px-6">
            <p className="max-w-xl text-xs leading-5 text-muted-foreground">Pushing saves the research, contact, pitch, and both follow-ups in Client Campaigns. It does not start outreach.</p>
            <div className="flex gap-2"><Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button><Button type="button" disabled={submitDisabled} onClick={() => prepareMutation.mutate()}>{prepareMutation.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Send className="mr-2 h-4 w-4" />}{target ? 'Update campaign draft' : 'Push to client campaign'}</Button></div>
          </DialogFooter>
        )}
      </DialogContent>
    </Dialog>
  )
}
