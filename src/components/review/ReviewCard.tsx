import { formatDistanceToNow } from 'date-fns'
import { ChevronRight, Clock, Sparkles, Star, ThumbsDown, ThumbsUp, Users } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { cn } from '@/lib/utils'
import { PodcastArtwork } from '@/components/review/PodcastArtwork'
import { formatListeners, GENERIC_FIT_REASON, type ReviewPodcast, type ReviewStatus } from '@/components/review/reviewTypes'

interface ReviewCardProps {
  podcast: ReviewPodcast
  decision: ReviewStatus
  disabled?: boolean
  /** Pressing the decision already made clears it (`null`). */
  onDecide: (status: ReviewStatus) => void
  onOpen: () => void
  /** A short label above the name, such as "Top match #3". */
  eyebrow?: string
}

export const ReviewCard = ({ podcast, decision, disabled = false, onDecide, onOpen, eyebrow }: ReviewCardProps) => {
  const fitReason = podcast.ai_fit_reasons?.[0] || GENERIC_FIT_REASON
  const category = podcast.podcast_categories?.[0]?.category_name
  const lastPostedDate = podcast.last_posted_at ? new Date(podcast.last_posted_at) : null
  const lastPostedLabel = lastPostedDate && !Number.isNaN(lastPostedDate.getTime())
    ? formatDistanceToNow(lastPostedDate, { addSuffix: true })
    : null

  return (
    <Card
      className={cn(
        'overflow-hidden rounded-3xl border-[#ded5ca] bg-white shadow-[0_14px_40px_rgba(16,32,51,.06)] transition duration-300 hover:-translate-y-0.5 hover:border-[#c6b8a8] hover:shadow-[0_18px_46px_rgba(16,32,51,.1)]',
        decision === 'approved' && 'border-[#9ab4a7] ring-1 ring-[#9ab4a7]/50',
      )}
    >
      <CardContent className="p-0">
        <button
          type="button"
          onClick={onOpen}
          className="group flex w-full gap-4 p-4 text-left sm:gap-5 sm:p-5"
          aria-label={'View details for ' + podcast.podcast_name}
        >
          <PodcastArtwork podcast={podcast} className="h-24 w-24 shrink-0 rounded-2xl shadow-md sm:h-32 sm:w-32" decorative />
          <div className="min-w-0 flex-1">
            <div className="flex items-start justify-between gap-3">
              <div>
                {eyebrow ? (
                  <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-[var(--campaign-accent)]">{eyebrow}</p>
                ) : null}
                <h3 className="mt-1 line-clamp-2 font-editorial text-xl leading-tight text-[#102033] transition group-hover:text-[var(--campaign-accent)] sm:text-2xl">
                  {podcast.podcast_name}
                </h3>
              </div>
              {decision ? (
                <span className={cn(
                  'flex shrink-0 items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-bold',
                  decision === 'approved' ? 'bg-[#e5efe9] text-[#476b59]' : 'bg-[#f1ece6] text-[#74675f]',
                )}>
                  {decision === 'approved' ? <ThumbsUp className="h-3 w-3" /> : <ThumbsDown className="h-3 w-3" />}
                  <span className="hidden sm:inline">{decision === 'approved' ? 'Interested' : 'Not a fit'}</span>
                </span>
              ) : null}
            </div>
            {podcast.publisher_name ? <p className="mt-1 truncate text-xs text-[#78828a]">with {podcast.publisher_name}</p> : null}
            <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1.5 text-xs font-medium text-[#53616d]">
              {podcast.audience_size ? <span className="flex items-center gap-1.5"><Users className="h-3.5 w-3.5 text-[#789486]" />{formatListeners(podcast.audience_size)} est. listeners</span> : null}
              {podcast.itunes_rating ? <span className="flex items-center gap-1.5"><Star className="h-3.5 w-3.5 fill-[#d69b52] text-[#d69b52]" />{Number(podcast.itunes_rating).toFixed(1)}</span> : null}
              {lastPostedLabel ? <span className="hidden items-center gap-1.5 sm:flex"><Clock className="h-3.5 w-3.5" />Active {lastPostedLabel}</span> : null}
            </div>
            {category ? (
              <span className="mt-2.5 inline-flex rounded-full bg-[#f0ebe3] px-2.5 py-0.5 text-[11px] font-semibold text-[#7b685a]">{category}</span>
            ) : null}
          </div>
        </button>

        <div className="border-t border-[#eee8e0] px-4 py-3 sm:px-5">
          <div className="mb-3 flex items-start gap-2 text-xs leading-5 text-[#5e6c77]">
            <Sparkles className="mt-0.5 h-3.5 w-3.5 shrink-0 text-[var(--campaign-accent)]" />
            <p className="line-clamp-2">{fitReason}</p>
          </div>
          <div className="grid grid-cols-[1fr_1fr_auto] gap-2">
            <Button
              type="button"
              variant="outline"
              disabled={disabled}
              aria-pressed={decision === 'approved'}
              onClick={() => onDecide(decision === 'approved' ? null : 'approved')}
              className={cn(
                'min-h-11 gap-2 rounded-xl border-[#d8dfda] text-xs font-bold sm:text-sm',
                decision === 'approved'
                  ? 'border-[#668b78] bg-[#668b78] text-white hover:bg-[#587765] hover:text-white'
                  : 'bg-[#f4f8f5] text-[#476b59] hover:border-[#789486] hover:bg-[#e7f0ea]',
              )}
            >
              <ThumbsUp className="h-4 w-4" />
              Interested
            </Button>
            <Button
              type="button"
              variant="outline"
              disabled={disabled}
              aria-pressed={decision === 'rejected'}
              onClick={() => onDecide(decision === 'rejected' ? null : 'rejected')}
              className={cn(
                'min-h-11 gap-2 rounded-xl border-[#ddd5cd] text-xs font-bold sm:text-sm',
                decision === 'rejected'
                  ? 'border-[#78685f] bg-[#78685f] text-white hover:bg-[#665850] hover:text-white'
                  : 'bg-[#fbf8f4] text-[#6c625c] hover:border-[#a99588] hover:bg-[#f1ebe4]',
              )}
            >
              <ThumbsDown className="h-4 w-4" />
              Not a fit
            </Button>
            <Button
              type="button"
              variant="ghost"
              onClick={onOpen}
              className="min-h-11 rounded-xl px-3 text-[#62707c] hover:bg-[#f2ede6] hover:text-[#102033]"
              aria-label={'Why ' + podcast.podcast_name + ' fits'}
            >
              <ChevronRight className="h-5 w-5" />
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  )
}
