import { useEffect, useState } from 'react'
import { ArrowUpRight, CheckCircle2, ChevronLeft, ChevronRight, Loader2, RotateCcw, Sparkles, ThumbsDown, ThumbsUp } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog'
import { cn } from '@/lib/utils'
import { PodcastArtwork } from '@/components/review/PodcastArtwork'
import { useReviewBrandStyle } from '@/components/review/reviewBrand'
import { formatListeners, type ReviewFeedbackMap, type ReviewPodcast, type ReviewStatus } from '@/components/review/reviewTypes'

interface FocusedReviewProps {
  open: boolean
  /** The shows to walk through, in order. Snapshot it when the review starts. */
  queue: ReviewPodcast[]
  feedback: ReviewFeedbackMap
  /** The view the queue came from, such as "Top matches". */
  label: string
  /** Who the recommendation is addressed to. */
  recipientName: string
  isSaving?: boolean
  /** Resolves true when the decision was saved; false keeps the reader on the same show. */
  onDecide: (podcast: ReviewPodcast, status: ReviewStatus) => Promise<boolean> | boolean
  /** `complete` when the last undecided show has a decision, `dismiss` otherwise. */
  onExit: (reason: 'complete' | 'dismiss') => void
  onOpenProfile?: (podcast: ReviewPodcast) => void
}

const FALLBACK_REASON = 'The show aligns with your expertise and gives you room for a useful, credible conversation.'

/*
 * One show at a time. When the queue still has undecided shows the review
 * jumps between them; once every show has a decision it walks the queue in
 * order so a reader can revisit choices.
 */
export const FocusedReview = ({
  open,
  queue,
  feedback,
  label,
  recipientName,
  isSaving = false,
  onDecide,
  onExit,
  onOpenProfile,
}: FocusedReviewProps) => {
  const brandStyle = useReviewBrandStyle()
  const [index, setIndex] = useState(0)
  const [pendingOnly, setPendingOnly] = useState(true)

  const isPending = (podcast: ReviewPodcast) => !feedback.get(podcast.podcast_id)?.status

  useEffect(() => {
    if (!open) return
    const firstPending = queue.findIndex(isPending)
    setPendingOnly(firstPending >= 0)
    setIndex(firstPending >= 0 ? firstPending : 0)
    // Only the moment of opening matters; a decision made inside must not reset the position.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

  const podcast = queue[Math.min(index, Math.max(queue.length - 1, 0))]
  const reviewedCount = queue.filter((entry) => !isPending(entry)).length
  const status = podcast ? feedback.get(podcast.podcast_id)?.status ?? null : null

  const decide = async (next: ReviewStatus) => {
    if (!podcast) return
    const saved = await onDecide(podcast, next)
    if (!saved || next === null) return

    if (pendingOnly) {
      const stillPending = (entry: ReviewPodcast) => entry.podcast_id !== podcast.podcast_id && isPending(entry)
      const later = queue.findIndex((entry, position) => position > index && stillPending(entry))
      if (later >= 0) return setIndex(later)
      const earlier = queue.findIndex((entry, position) => position < index && stillPending(entry))
      if (earlier >= 0) return setIndex(earlier)
    } else if (index < queue.length - 1) {
      return setIndex(index + 1)
    }

    onExit('complete')
  }

  return (
    <Dialog open={open} onOpenChange={(next) => { if (!next) onExit('dismiss') }}>
      <DialogContent
        className="max-h-[94vh] w-[calc(100%-1rem)] max-w-5xl overflow-y-auto rounded-[28px] border-0 bg-[#fbf8f3] p-0 pb-32 shadow-2xl sm:w-[calc(100%-2rem)] sm:pb-0"
        style={brandStyle}
        onOpenAutoFocus={(event) => {
          event.preventDefault()
          const content = event.currentTarget as HTMLElement
          window.requestAnimationFrame(() => {
            content.scrollTop = 0
            content.focus({ preventScroll: true })
          })
        }}
      >
        {podcast ? (
          <div>
            <div className="flex items-center justify-between border-b border-[#e2d9ce] px-5 py-4 pr-14 sm:px-7">
              <div>
                <DialogTitle className="font-editorial text-2xl text-[#102033]">Focused review</DialogTitle>
                <DialogDescription className="sr-only">Review one podcast at a time from {label} and mark whether you are interested.</DialogDescription>
                <p className="mt-0.5 text-xs text-[#74808a]">{label} · Match {index + 1} of {queue.length} · {reviewedCount} reviewed</p>
              </div>
              <div className="hidden h-1.5 w-40 overflow-hidden rounded-full bg-[#e6ded4] sm:block">
                <div className="h-full rounded-full bg-[var(--campaign-accent)]" style={{ width: ((index + 1) / Math.max(queue.length, 1)) * 100 + '%' }} />
              </div>
            </div>

            <div className="grid lg:grid-cols-[0.9fr_1.1fr]">
              <div className="border-b border-[#e2d9ce] p-5 sm:p-7 lg:border-b-0 lg:border-r">
                <PodcastArtwork podcast={podcast} className="aspect-[16/10] w-full rounded-3xl shadow-[0_18px_50px_rgba(16,32,51,.16)] lg:aspect-square" decorative />
                <dl className="mt-5 grid grid-cols-3 divide-x divide-[#e2d9ce] rounded-2xl border border-[#e2d9ce] bg-white py-3 text-center">
                  {[
                    { label: 'Listeners', value: podcast.audience_size ? formatListeners(podcast.audience_size) : '-' },
                    { label: 'Rating', value: podcast.itunes_rating ? Number(podcast.itunes_rating).toFixed(1) : '-' },
                    { label: 'Episodes', value: podcast.episode_count || '-' },
                  ].map((stat) => (
                    <div key={stat.label} className="px-2">
                      <dt className="text-[9px] font-bold uppercase tracking-wider text-[#7b858d]">{stat.label}</dt>
                      <dd className="mt-1 font-editorial text-xl text-[#102033]">{stat.value}</dd>
                    </div>
                  ))}
                </dl>
              </div>

              <div className="flex flex-col p-5 sm:p-7">
                <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-[var(--campaign-accent)]">Recommended for {recipientName}</p>
                <h2 className="mt-2 font-editorial text-3xl leading-tight text-[#102033] sm:text-4xl">{podcast.podcast_name}</h2>
                {podcast.publisher_name ? <p className="mt-1 text-sm text-[#74808a]">with {podcast.publisher_name}</p> : null}

                <div className="mt-6 rounded-2xl border border-[#ead8cc] bg-[#f8eade] p-4 sm:p-5">
                  <p className="flex items-center gap-2 text-xs font-bold uppercase tracking-[0.14em] text-[#8d4b2f]">
                    <Sparkles className="h-4 w-4" />
                    Why it fits
                  </p>
                  <ul className="mt-3 space-y-3">
                    {(podcast.ai_fit_reasons?.length ? podcast.ai_fit_reasons : [FALLBACK_REASON]).slice(0, 2).map((reason) => (
                      <li key={reason} className="flex gap-3 text-sm leading-6 text-[#5d514a]">
                        <CheckCircle2 className="mt-1 h-4 w-4 shrink-0 text-[#668b78]" />
                        <span className="line-clamp-3">{reason}</span>
                      </li>
                    ))}
                  </ul>
                </div>

                <p className="mt-5 hidden text-sm leading-6 text-[#66727c] sm:line-clamp-3">
                  {podcast.ai_clean_description || podcast.podcast_description || 'Open the full show profile for audience details, topics, and pitch angles.'}
                </p>
                {onOpenProfile ? (
                  <button
                    type="button"
                    onClick={() => onOpenProfile(podcast)}
                    className="mt-3 hidden min-h-11 items-center gap-1 self-start text-sm font-bold text-[var(--campaign-accent)] hover:brightness-75 sm:inline-flex"
                  >
                    Open full show profile
                    <ArrowUpRight className="h-4 w-4" />
                  </button>
                ) : null}

                <div className="absolute inset-x-0 bottom-0 z-20 mt-auto border-t border-[#ded5ca] bg-white p-3 shadow-[0_-12px_28px_rgba(16,32,51,.08)] sm:static sm:border-0 sm:bg-transparent sm:p-0 sm:pt-5 sm:shadow-none">
                  <div className="grid grid-cols-2 gap-3">
                    <Button
                      type="button"
                      variant="outline"
                      disabled={isSaving}
                      onClick={() => decide('rejected')}
                      className={cn(
                        'min-h-14 gap-2 rounded-2xl border-[#d8cec4] text-sm font-bold',
                        status === 'rejected'
                          ? 'border-[#78685f] bg-[#78685f] text-white hover:bg-[#665850] hover:text-white'
                          : 'bg-white text-[#665d57] hover:bg-[#f2ece5]',
                      )}
                    >
                      <ThumbsDown className="h-5 w-5" />
                      Not a fit
                    </Button>
                    <Button
                      type="button"
                      disabled={isSaving}
                      onClick={() => decide('approved')}
                      className={cn(
                        'min-h-14 gap-2 rounded-2xl text-sm font-bold',
                        status === 'approved'
                          ? 'bg-[#668b78] text-white hover:bg-[#587765]'
                          : 'bg-[var(--campaign-primary)] text-[var(--campaign-primary-foreground)] hover:brightness-95',
                      )}
                    >
                      {isSaving ? <Loader2 className="h-5 w-5 animate-spin" /> : <ThumbsUp className="h-5 w-5" />}
                      Interested
                    </Button>
                  </div>
                  <div className="mt-3 flex items-center justify-between">
                    <Button
                      type="button"
                      variant="ghost"
                      disabled={index === 0}
                      onClick={() => setIndex((current) => Math.max(0, current - 1))}
                      className="min-h-10 gap-1 text-[#6e7982]"
                    >
                      <ChevronLeft className="h-4 w-4" />
                      Back
                    </Button>
                    {status ? (
                      <button
                        type="button"
                        disabled={isSaving}
                        onClick={() => decide(null)}
                        className="inline-flex min-h-10 items-center gap-1.5 text-xs font-semibold text-[#7b858d] hover:text-[#102033]"
                      >
                        <RotateCcw className="h-3.5 w-3.5" />
                        Clear choice
                      </button>
                    ) : <span />}
                    <Button
                      type="button"
                      variant="ghost"
                      disabled={index >= queue.length - 1}
                      onClick={() => setIndex((current) => Math.min(queue.length - 1, current + 1))}
                      className="min-h-10 gap-1 text-[#6e7982]"
                    >
                      Next
                      <ChevronRight className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              </div>
            </div>
          </div>
        ) : (
          <div className="p-10 text-center">
            <DialogTitle className="font-editorial text-2xl text-[#102033]">No podcasts match this view yet</DialogTitle>
            <DialogDescription className="sr-only">Change the filters or the view and start the focused review again.</DialogDescription>
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}
