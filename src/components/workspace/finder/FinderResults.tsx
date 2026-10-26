import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { CheckCircle2, ExternalLink, Loader2, Mail, Plus } from 'lucide-react'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { safeExternalUrl } from '@/lib/externalUrl'
import {
  DEFAULT_RESULT_VIEW,
  MIN_SCORE_OPTIONS,
  SORT_OPTIONS,
  isDefaultView,
  postedAgo,
  viewResults,
  type RankablePodcast,
  type RankedResult,
  type ResultSort,
  type ResultView,
} from '@/lib/finderRanking'
import { podcastInitials } from '@/lib/podcastCatalogDisplay'
import { cn } from '@/lib/utils'

export interface FinderResultPodcast extends RankablePodcast {
  podcast_image_url?: string | null
  podcast_url?: string | null
  episode_count?: number | null
}

export type FinderResult = RankedResult<FinderResultPodcast>

function scoreBadgeClass(result: FinderResult): string {
  if (result.score === null || result.estimated) return 'border-border bg-muted text-foreground/75'
  if (result.score >= 80) return 'border-emerald-200 bg-emerald-50 text-emerald-800'
  if (result.score >= 60) return 'border-amber-200 bg-amber-50 text-amber-800'
  return 'border-border bg-muted text-foreground/75'
}

const PodcastArt = ({ podcast }: { podcast: FinderResultPodcast }) => {
  const [failed, setFailed] = useState(false)
  const src = safeExternalUrl(podcast.podcast_image_url)
  if (src && !failed) {
    return (
      <img
        src={src}
        alt=""
        loading="lazy"
        onError={() => setFailed(true)}
        className="h-11 w-11 shrink-0 rounded-md border border-border object-cover"
      />
    )
  }
  return (
    <span aria-hidden="true" className="flex h-11 w-11 shrink-0 items-center justify-center rounded-md bg-muted text-xs font-semibold text-foreground/70">
      {podcastInitials(podcast.podcast_name)}
    </span>
  )
}

const ViewToggle = ({ pressed, onChange, children }: { pressed: boolean; onChange: (next: boolean) => void; children: string }) => (
  <Button
    type="button"
    size="sm"
    variant="outline"
    aria-pressed={pressed}
    onClick={() => onChange(!pressed)}
    className="h-8 rounded-full px-3 text-xs aria-pressed:border-primary aria-pressed:bg-primary/10 aria-pressed:text-primary"
  >
    {children}
  </Button>
)

interface FinderResultsProps {
  clientName: string
  results: FinderResult[]
  addedIds: Set<string>
  isAdding: boolean
  onAdd: (results: FinderResult[]) => void
  clientHref: string
  /** Set when the list on screen is a saved scan rather than the one just run. */
  savedAt?: string | null
}

export const FinderResults = ({ clientName, results, addedIds, isAdding, onAdd, clientHref, savedAt }: FinderResultsProps) => {
  const [view, setView] = useState<ResultView>(DEFAULT_RESULT_VIEW)
  const shown = useMemo(() => viewResults(results, view), [results, view])
  const pendingTop = shown.filter((result) => !addedIds.has(result.podcast.podcast_id)).slice(0, 10)
  const estimatedCount = results.filter((result) => result.estimated).length
  const update = (patch: Partial<ResultView>) => setView((current) => ({ ...current, ...patch }))

  return (
    <Card>
      <CardHeader className="flex-col gap-3 space-y-0 pb-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0">
          <CardTitle className="text-lg">Ranked by fit for {clientName}</CardTitle>
          <CardDescription>
            {savedAt
              ? `From the scan on ${new Date(savedAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}. `
              : 'Highest AI relevancy first. '}
            Adding sends them to the client’s podcast list.
          </CardDescription>
        </div>
        <div className="flex shrink-0 flex-wrap items-center gap-2">
          <Button size="sm" onClick={() => onAdd(pendingTop)} disabled={pendingTop.length === 0 || isAdding}>
            {isAdding ? <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" /> : <Plus className="mr-2 h-3.5 w-3.5" />}
            Add top {pendingTop.length}
          </Button>
          <Button asChild size="sm" variant="outline">
            <Link to={clientHref}>Open client list</Link>
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        <div className="flex flex-wrap items-center gap-2 border-b border-border/70 pb-3">
          <Select value={String(view.minScore)} onValueChange={(value) => update({ minScore: Number(value) })}>
            <SelectTrigger aria-label="Minimum fit" className="h-8 w-[7.5rem] text-xs"><SelectValue /></SelectTrigger>
            <SelectContent>
              {MIN_SCORE_OPTIONS.map((option) => (
                <SelectItem key={option.value} value={String(option.value)}>{option.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={view.sort} onValueChange={(value) => update({ sort: value as ResultSort })}>
            <SelectTrigger aria-label="Sort results" className="h-8 w-[11rem] text-xs"><SelectValue /></SelectTrigger>
            <SelectContent>
              {SORT_OPTIONS.map((option) => (
                <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          {estimatedCount > 0 && (
            <ViewToggle pressed={view.hideEstimated} onChange={(hideEstimated) => update({ hideEstimated })}>Hide estimated</ViewToggle>
          )}
          <ViewToggle pressed={view.emailOnly} onChange={(emailOnly) => update({ emailOnly })}>Has email</ViewToggle>
          <span role="status" className="ml-auto text-xs text-muted-foreground">
            {shown.length === results.length ? `${results.length} podcasts` : `Showing ${shown.length} of ${results.length}`}
          </span>
        </div>

        {estimatedCount > 0 && (
          <p className="mt-3 rounded-lg border border-border bg-muted/40 px-3 py-2 text-xs leading-5 text-foreground/80">
            {estimatedCount === 1 ? '1 score is' : `${estimatedCount} scores are`} estimated from keyword overlap because the AI could not score {estimatedCount === 1 ? 'it' : 'them'}. Estimated scores rank below AI scores. A request where the AI scored nothing is not charged.
          </p>
        )}

        {shown.length === 0 ? (
          <div className="flex flex-col items-center gap-2 py-10 text-center text-sm text-muted-foreground">
            No podcasts match these view settings.
            {!isDefaultView(view) && (
              <Button type="button" size="sm" variant="outline" onClick={() => setView(DEFAULT_RESULT_VIEW)}>Show all</Button>
            )}
          </div>
        ) : (
          <ul aria-label="Ranked podcasts" className="divide-y divide-border/70">
            {shown.map((result, index) => {
              const podcast = result.podcast
              const added = addedIds.has(podcast.podcast_id)
              const websiteUrl = safeExternalUrl(podcast.podcast_url)
              const posted = postedAgo(podcast.last_posted_at)
              return (
                <li key={podcast.podcast_id} className="flex items-start gap-3 py-4 sm:gap-4">
                  <span className="mt-3 hidden w-6 shrink-0 text-right text-sm font-medium tabular-nums text-muted-foreground sm:block">{index + 1}</span>
                  <PodcastArt podcast={podcast} />
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-medium">{podcast.podcast_name}</span>
                      <Badge
                        variant="outline"
                        className={scoreBadgeClass(result)}
                        title={result.estimated ? 'Estimated from keyword overlap, not scored by the AI' : undefined}
                      >
                        {result.score === null ? 'Unscored' : `${result.score} fit${result.estimated ? ', estimated' : ''}`}
                      </Badge>
                      {podcast.source === 'database' && (
                        <Badge variant="secondary" className="font-normal text-foreground/75">In your database</Badge>
                      )}
                      {websiteUrl && (
                        <a
                          href={websiteUrl}
                          target="_blank"
                          rel="noreferrer"
                          className="text-muted-foreground hover:text-foreground"
                          aria-label={`Open ${podcast.podcast_name} website`}
                        >
                          <ExternalLink className="h-3.5 w-3.5" />
                        </a>
                      )}
                    </div>
                    {result.reasoning && (
                      <p className="mt-1 text-xs leading-5 text-muted-foreground">{result.reasoning}</p>
                    )}
                    <p className="mt-1 flex flex-wrap items-center gap-x-1.5 text-xs text-muted-foreground">
                      {[
                        podcast.audience_size ? `${Number(podcast.audience_size).toLocaleString()} listeners per episode` : null,
                        podcast.episode_count ? `${podcast.episode_count.toLocaleString()} episodes` : null,
                        posted ? `Last episode ${posted}` : null,
                        podcast.podcast_categories?.[0]?.category_name || null,
                      ].filter(Boolean).join(' · ')}
                      {podcast.podcast_email && (
                        <span className="inline-flex items-center gap-1 text-foreground/75">
                          <Mail aria-hidden="true" className="h-3 w-3" />Email on file
                        </span>
                      )}
                    </p>
                  </div>
                  <Button
                    size="sm"
                    variant={added ? 'ghost' : 'outline'}
                    className={cn('shrink-0', added && 'disabled:opacity-100')}
                    disabled={added || isAdding}
                    onClick={() => onAdd([result])}
                  >
                    {added ? <><CheckCircle2 className="mr-2 h-3.5 w-3.5 text-emerald-600" />Added</> : <><Plus className="mr-2 h-3.5 w-3.5" />Add</>}
                  </Button>
                </li>
              )
            })}
          </ul>
        )}
      </CardContent>
    </Card>
  )
}
