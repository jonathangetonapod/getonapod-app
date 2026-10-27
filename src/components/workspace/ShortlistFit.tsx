import { useState } from 'react'
import { Gauge, Loader2 } from 'lucide-react'
import { toast } from 'sonner'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { creditCostSuffix } from '@/lib/creditCosts'
import { cn } from '@/lib/utils'
import { chunk, fitBand, fitScoreLabel, fitState, rowsToScore } from '@/lib/shortlistFit'
import {
  FIT_SCORE_BATCH_SIZE,
  scoreClientShortlistFit,
  type ClientShortlistFitProfile,
  type ClientShortlistPodcast,
} from '@/services/clientShortlist'

const BAND_STYLES = {
  strong: 'border-emerald-200 bg-emerald-50 text-emerald-800 hover:bg-emerald-50',
  possible: 'border-amber-200 bg-amber-50 text-amber-900 hover:bg-amber-50',
  weak: 'border-rose-200 bg-rose-50 text-rose-800 hover:bg-rose-50',
} as const

const BAND_NAMES = { strong: 'Strong fit', possible: 'Possible fit', weak: 'Weak fit' } as const

interface FitProps {
  podcast: ClientShortlistPodcast
  profile: ClientShortlistFitProfile | null
}

export const FitScoreBadge = ({ podcast, profile }: FitProps) => {
  if (typeof podcast.fit_score !== 'number') {
    return <span className="text-sm text-muted-foreground">—</span>
  }
  const state = fitState(podcast, profile)
  const band = fitBand(podcast.fit_score)
  const estimate = podcast.fit_source === 'estimate'
  return (
    <Badge
      variant="outline"
      className={cn(BAND_STYLES[band], state === 'stale' && 'border-dashed')}
      aria-label={`${BAND_NAMES[band]}, ${fitScoreLabel(podcast.fit_score)} out of 10${estimate ? ', estimated' : ''}${state === 'stale' ? ', needs rescoring' : ''}`}
      title={state === 'stale' ? 'Scored against an older profile. Score fit again to update it.' : undefined}
    >
      {fitScoreLabel(podcast.fit_score)}/10{estimate ? ' est.' : ''}
    </Badge>
  )
}

/** The score, why, and why not, for the podcast details sheet. */
export const FitDetails = ({ podcast, profile }: FitProps) => {
  if (typeof podcast.fit_score !== 'number') {
    return (
      <section className="rounded-xl border border-dashed p-4">
        <h4 className="text-sm font-semibold">Fit</h4>
        <p className="mt-2 text-sm text-muted-foreground">Not scored yet. Use Score fit to judge this show against the bio, guest brief and intake answers.</p>
      </section>
    )
  }
  const state = fitState(podcast, profile)
  const band = fitBand(podcast.fit_score)
  const concerns = (podcast.fit_concerns ?? []).filter(Boolean)
  return (
    <section className="space-y-3 rounded-xl border p-4">
      <div className="flex flex-wrap items-center gap-2">
        <h4 className="text-sm font-semibold">Fit</h4>
        <FitScoreBadge podcast={podcast} profile={profile} />
        <span className="text-sm text-muted-foreground">{BAND_NAMES[band]}</span>
      </div>
      {podcast.fit_reasoning && <p className="text-sm leading-6 text-muted-foreground">{podcast.fit_reasoning}</p>}
      {concerns.length > 0 && (
        <div>
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Why it may not fit</p>
          <ul className="mt-1 list-disc space-y-1 pl-5 text-sm text-muted-foreground">
            {concerns.map((concern) => <li key={concern}>{concern}</li>)}
          </ul>
        </div>
      )}
      {podcast.fit_source === 'estimate' && <p className="text-xs text-muted-foreground">Estimated from keyword overlap because the AI could not score it. Score fit again for a full judgement.</p>}
      {podcast.fit_source !== 'estimate' && state === 'stale' && <p className="text-xs text-muted-foreground">Scored before the latest changes to the bio, guest brief or intake. Score fit again to update it.</p>}
      <p className="text-xs text-muted-foreground">Only your team sees fit scores.</p>
    </section>
  )
}

interface ShortlistFitRunnerProps {
  workspaceId: string
  clientId: string
  podcasts: ClientShortlistPodcast[]
  profile: ClientShortlistFitProfile | null
  byoAi?: boolean
  /** Called after each batch, so scores appear while the run continues. */
  onProgress: () => Promise<void> | void
}

/**
 * Scores every visible show that is unscored or stale, twenty per request,
 * one request at a time so a failure (out of credits, say) stops the run
 * with what was already scored kept.
 */
export const ShortlistFitRunner = ({ workspaceId, clientId, podcasts, profile, byoAi, onProgress }: ShortlistFitRunnerProps) => {
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null)
  const pending = rowsToScore(podcasts, profile)
  const batches = chunk(pending, FIT_SCORE_BATCH_SIZE)
  const ready = profile?.ready === true

  const run = async () => {
    if (batches.length === 0) return
    let done = 0
    let saved = 0
    let estimated = 0
    setProgress({ done: 0, total: pending.length })
    try {
      for (const batch of batches) {
        const result = await scoreClientShortlistFit(workspaceId, clientId, batch.map((podcast) => podcast.id))
        saved += result.saved
        estimated += result.estimated
        done += batch.length
        setProgress({ done, total: pending.length })
        await onProgress()
      }
      toast.success(
        estimated > 0
          ? `Scored ${saved} show${saved === 1 ? '' : 's'}. ${estimated} could only be estimated; score fit again to retry them.`
          : `Scored ${saved} show${saved === 1 ? '' : 's'} for fit.`,
      )
    } catch (error) {
      const message = error instanceof Error ? error.message : 'The shortlist could not be scored.'
      toast.error(done > 0 ? `${message} ${done} of ${pending.length} shows were scored before it stopped.` : message)
      await onProgress()
    } finally {
      setProgress(null)
    }
  }

  const label = progress
    ? `Scoring ${progress.done} of ${progress.total}…`
    : batches.length === 0 ? 'All shows scored' : `Score fit (${pending.length})`
  return (
    <Button
      variant="outline"
      onClick={() => void run()}
      disabled={Boolean(progress) || batches.length === 0 || !ready}
      title={!ready ? 'Finish the guest brief or intake first' : undefined}
    >
      {progress ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Gauge className="mr-2 h-4 w-4" />}
      {!ready ? 'Score fit (needs a brief)' : label}
      {!progress && ready && batches.length > 0 && (
        <span className="ml-1.5 font-normal opacity-70">{creditCostSuffix('compatibility_scoring', { byo: byoAi, units: batches.length })}</span>
      )}
    </Button>
  )
}
