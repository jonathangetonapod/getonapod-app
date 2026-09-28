import { Award, BarChart3, Check, CheckCircle2, Loader2, MessageSquare, RotateCcw, Sparkles, Star, Tag, Target, ThumbsDown, ThumbsUp, TrendingUp, Users, X, Zap } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Sheet, SheetContent, SheetTitle } from '@/components/ui/sheet'
import { Textarea } from '@/components/ui/textarea'
import { cn } from '@/lib/utils'
import { PodcastArtwork } from '@/components/review/PodcastArtwork'
import { useReviewBrandStyle } from '@/components/review/reviewBrand'
import {
  formatListeners,
  type PodcastFitAnalysis,
  type ReviewFeedback,
  type ReviewPodcast,
  type ReviewStatus,
} from '@/components/review/reviewTypes'

interface ShowProfileSheetProps {
  podcast: ReviewPodcast | null
  feedback?: ReviewFeedback
  fitAnalysis: PodcastFitAnalysis | null
  isAnalyzing?: boolean
  notes: string
  onNotesChange: (notes: string) => void
  onSaveNote: () => void
  isSaving?: boolean
  onDecide: (status: ReviewStatus) => void
  open: boolean
  onOpenChange: (open: boolean) => void
}

const sectionHeading = 'text-[10px] font-bold uppercase tracking-widest text-[#71808b] sm:text-xs'

const SkeletonLines = ({ count }: { count: number }) => (
  <div className="space-y-2">
    {Array.from({ length: count }, (_, index) => (
      <div key={index} className="h-4 animate-pulse rounded bg-[#e8e0d3]" style={{ width: `${100 - index * 14}%` }} />
    ))}
  </div>
)

/*
 * The full show profile. The reason it fits comes first because that is what
 * the reader opened it for; the decision is pinned to the foot so it stays
 * reachable however far they have scrolled.
 */
export const ShowProfileSheet = ({
  podcast,
  feedback,
  fitAnalysis,
  isAnalyzing = false,
  notes,
  onNotesChange,
  onSaveNote,
  isSaving = false,
  onDecide,
  open,
  onOpenChange,
}: ShowProfileSheetProps) => {
  const brandStyle = useReviewBrandStyle()
  const status = feedback?.status ?? null
  const demographics = podcast?.demographics ?? null
  const industries = demographics?.professional_industry?.slice(0, 3) ?? []
  const regions = demographics?.geographic_distribution?.slice(0, 4) ?? []
  const hasAudience = Boolean(demographics && (demographics.age || demographics.gender_skew || industries.length || regions.length))

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="!w-full overflow-hidden overflow-x-hidden border-l-0 bg-[#fbf8f3] p-0 shadow-2xl sm:!max-w-xl" style={brandStyle}>
        {podcast ? (
          <div className="flex h-full flex-col">
            <SheetTitle className="sr-only">{podcast.podcast_name}</SheetTitle>

            <div className="relative h-44 flex-shrink-0 overflow-hidden sm:h-64">
              <PodcastArtwork podcast={podcast} className="h-full w-full" decorative />
              <div className="absolute inset-0 bg-gradient-to-t from-black via-black/50 to-transparent" />
              <div className="absolute inset-0 bg-gradient-to-r from-black/30 to-transparent" />
              <div className="absolute left-1/2 top-2 h-1.5 w-12 -translate-x-1/2 rounded-full bg-white/30 sm:hidden" />
              <Button
                variant="ghost"
                size="icon"
                className="absolute right-3 top-3 h-9 w-9 rounded-full border border-white/20 bg-white/10 text-white backdrop-blur-sm hover:bg-white/20 sm:right-4 sm:top-4 sm:h-10 sm:w-10"
                onClick={() => onOpenChange(false)}
                aria-label="Close show profile"
              >
                <X className="h-5 w-5" />
              </Button>
              <div className="absolute inset-x-0 bottom-0 p-4 sm:p-6">
                <div className="mb-2 flex flex-wrap gap-1.5 sm:mb-3 sm:gap-2">
                  {podcast.itunes_rating && podcast.itunes_rating >= 4.5 ? (
                    <Badge className="border-0 bg-amber-500 text-xs text-white hover:bg-amber-500"><Award className="mr-1 h-3 w-3" />Top rated</Badge>
                  ) : null}
                  {podcast.audience_size && podcast.audience_size >= 50000 ? (
                    <Badge className="border-0 bg-green-500 text-xs text-white hover:bg-green-500"><TrendingUp className="mr-1 h-3 w-3" />High reach</Badge>
                  ) : null}
                  {podcast.episode_count && podcast.episode_count >= 100 ? (
                    <Badge className="border-0 bg-purple-500 text-xs text-white hover:bg-purple-500"><Zap className="mr-1 h-3 w-3" />Established</Badge>
                  ) : null}
                </div>
                <p className="mb-1 text-[10px] font-bold uppercase tracking-[0.16em] text-[#f1bc9e]">Full show profile</p>
                <h2 className="mb-1 line-clamp-2 font-editorial text-2xl text-white sm:text-3xl">{podcast.podcast_name}</h2>
                {podcast.publisher_name ? <p className="text-xs text-white/70 sm:text-sm">by {podcast.publisher_name}</p> : null}
              </div>
            </div>

            <div className="grid flex-shrink-0 grid-cols-3 divide-x divide-white/10 bg-gradient-to-r from-slate-900 to-slate-800 text-white">
              {[
                { icon: Star, iconClass: 'fill-yellow-400 text-yellow-400', value: podcast.itunes_rating ? Number(podcast.itunes_rating).toFixed(1) : '-', label: 'Rating' },
                { icon: Users, iconClass: 'text-blue-400', value: podcast.audience_size ? formatListeners(podcast.audience_size) : '-', label: 'Est. listeners' },
                { icon: BarChart3, iconClass: 'text-purple-400', value: podcast.episode_count || '-', label: 'Episodes' },
              ].map((stat) => (
                <div key={stat.label} className="p-2.5 text-center sm:p-4">
                  <p className="mb-0.5 flex items-center justify-center gap-1 sm:mb-1 sm:gap-1.5">
                    <stat.icon className={cn('h-4 w-4 sm:h-5 sm:w-5', stat.iconClass)} />
                    <span className="text-lg font-bold sm:text-2xl">{stat.value}</span>
                  </p>
                  <p className="text-[10px] uppercase tracking-wide text-white/60 sm:text-xs">{stat.label}</p>
                </div>
              ))}
            </div>

            <ScrollArea className="min-h-0 flex-1 overflow-x-hidden">
              <div className="space-y-4 overflow-x-hidden p-4 pb-8 sm:space-y-6 sm:p-6">
                <section className="rounded-xl border border-amber-200/50 bg-gradient-to-br from-amber-50 to-orange-50 p-3.5 sm:rounded-2xl sm:p-5">
                  <div className="mb-3 flex items-center gap-2.5 sm:mb-4 sm:gap-3">
                    <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br from-amber-500 to-orange-500 shadow-lg sm:h-10 sm:w-10 sm:rounded-xl">
                      <Sparkles className="h-4 w-4 text-white sm:h-5 sm:w-5" />
                    </div>
                    <div>
                      <h3 className="text-sm font-bold text-amber-900 sm:text-base">Why this show fits you</h3>
                      <p className="text-[10px] text-amber-700 sm:text-xs">Based on your background and the show's recent episodes</p>
                    </div>
                  </div>
                  {isAnalyzing ? (
                    <SkeletonLines count={3} />
                  ) : fitAnalysis?.fit_reasons.length ? (
                    <ul className="space-y-3">
                      {fitAnalysis.fit_reasons.map((reason) => (
                        <li key={reason} className="flex items-start gap-3">
                          <div className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-green-500">
                            <CheckCircle2 className="h-4 w-4 text-white" />
                          </div>
                          <span className="text-sm text-amber-900">{reason}</span>
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="text-sm text-amber-800">No fit analysis yet. Your team will add one.</p>
                  )}
                </section>

                <section className="rounded-xl border border-purple-200/50 bg-gradient-to-br from-purple-50 to-violet-50 p-3.5 sm:rounded-2xl sm:p-5">
                  <div className="mb-3 flex items-center gap-2.5 sm:mb-4 sm:gap-3">
                    <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br from-purple-500 to-violet-500 shadow-lg sm:h-10 sm:w-10 sm:rounded-xl">
                      <Target className="h-4 w-4 text-white sm:h-5 sm:w-5" />
                    </div>
                    <div>
                      <h3 className="text-sm font-bold text-purple-900 sm:text-base">What you could talk about</h3>
                      <p className="text-[10px] text-purple-700 sm:text-xs">Ways to approach this podcast</p>
                    </div>
                  </div>
                  {isAnalyzing ? (
                    <SkeletonLines count={3} />
                  ) : fitAnalysis?.pitch_angles.length ? (
                    <div className="space-y-3">
                      {fitAnalysis.pitch_angles.map((angle, index) => (
                        <div key={angle.title} className="rounded-xl border border-purple-100 bg-white/70 p-4">
                          <div className="flex items-start gap-3">
                            <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-gradient-to-br from-purple-600 to-violet-600 text-sm font-bold text-white shadow">
                              {index + 1}
                            </span>
                            <div className="space-y-1">
                              <h4 className="font-semibold text-purple-900">{angle.title}</h4>
                              <p className="text-sm text-purple-700">{angle.description}</p>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="text-sm text-purple-800">No pitch ideas yet. They will appear once the fit analysis is ready.</p>
                  )}
                </section>

                <section className="space-y-2 sm:space-y-3">
                  <h3 className={sectionHeading}>About this show</h3>
                  {isAnalyzing ? (
                    <SkeletonLines count={3} />
                  ) : (
                    <p className="text-sm leading-relaxed text-[#5f6b76]">
                      {fitAnalysis?.clean_description || podcast.podcast_description || 'No description available'}
                    </p>
                  )}
                  {podcast.podcast_categories?.length ? (
                    <div className="flex flex-wrap items-center gap-1.5 pt-1 sm:gap-2">
                      <Tag className="h-3 w-3 text-[#71808b]" aria-hidden="true" />
                      {podcast.podcast_categories.map((category) => (
                        <Badge key={category.category_id} variant="secondary" className="border-0 bg-[#f0ebe3] px-2 py-0.5 text-xs text-[#7b685a]">
                          {category.category_name}
                        </Badge>
                      ))}
                    </div>
                  ) : null}
                </section>

                {hasAudience && demographics ? (
                  <section className="rounded-xl border border-blue-200/50 bg-gradient-to-br from-blue-50 to-cyan-50 p-3.5 sm:rounded-2xl sm:p-5">
                    <div className="mb-3 flex items-center gap-2.5 sm:mb-4 sm:gap-3">
                      <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br from-blue-500 to-cyan-500 shadow-lg sm:h-10 sm:w-10 sm:rounded-xl">
                        <Users className="h-4 w-4 text-white sm:h-5 sm:w-5" />
                      </div>
                      <div>
                        <h3 className="text-sm font-bold text-blue-900 sm:text-base">Who listens</h3>
                        <p className="text-[10px] text-blue-700 sm:text-xs">
                          {demographics.episodes_analyzed ? `Estimated from ${demographics.episodes_analyzed} episodes` : 'Estimated from recent episodes'}
                        </p>
                      </div>
                    </div>
                    <dl className="grid grid-cols-2 gap-2 sm:gap-3">
                      {demographics.age ? (
                        <div className="rounded-lg border border-blue-100 bg-white/70 p-3 sm:rounded-xl sm:p-4">
                          <dt className="mb-0.5 text-[10px] font-medium text-blue-600 sm:mb-1 sm:text-xs">Age</dt>
                          <dd className="text-sm font-bold text-blue-900 sm:text-base">{demographics.age}</dd>
                        </div>
                      ) : null}
                      {demographics.gender_skew ? (
                        <div className="rounded-lg border border-blue-100 bg-white/70 p-3 sm:rounded-xl sm:p-4">
                          <dt className="mb-0.5 text-[10px] font-medium text-blue-600 sm:mb-1 sm:text-xs">Gender</dt>
                          <dd className="text-sm font-bold capitalize text-blue-900 sm:text-base">{demographics.gender_skew.replace(/_/g, ' ')}</dd>
                        </div>
                      ) : null}
                      {industries.length ? (
                        <div className="rounded-lg border border-blue-100 bg-white/70 p-3 sm:rounded-xl sm:p-4">
                          <dt className="mb-1 text-[10px] font-medium text-blue-600 sm:text-xs">Top industries</dt>
                          <dd className="space-y-1">
                            {industries.map((item) => (
                              <div key={item.industry} className="flex items-baseline justify-between gap-2 text-xs text-blue-900">
                                <span className="truncate">{item.industry}</span>
                                <span className="font-bold">{item.percentage}%</span>
                              </div>
                            ))}
                          </dd>
                        </div>
                      ) : null}
                      {regions.length ? (
                        <div className="rounded-lg border border-blue-100 bg-white/70 p-3 sm:rounded-xl sm:p-4">
                          <dt className="mb-1 text-[10px] font-medium text-blue-600 sm:text-xs">Regions</dt>
                          <dd className="flex flex-wrap gap-1.5">
                            {regions.map((item) => (
                              <span key={item.region} className="rounded-full bg-blue-100 px-2 py-0.5 text-[10px] font-medium text-blue-800">
                                {item.region} <span className="font-bold">{item.percentage}%</span>
                              </span>
                            ))}
                          </dd>
                        </div>
                      ) : null}
                    </dl>
                  </section>
                ) : null}

                <div className="mt-6 border-t border-[#e3dbd2] pt-6">
                  <h3 className={cn(sectionHeading, 'mb-3 flex items-center gap-2')}>
                    <MessageSquare className="h-3.5 w-3.5" />
                    Note for your campaign team
                  </h3>
                  <Textarea
                    aria-label="Note for your campaign team"
                    placeholder="Questions, preferences, or context your team should know..."
                    value={notes}
                    onChange={(event) => onNotesChange(event.target.value)}
                    className="min-h-[92px] resize-none rounded-xl border-[#d9d0c4] bg-white text-sm focus-visible:ring-[var(--campaign-accent)]"
                  />
                  <div className="mt-2 flex items-center justify-between gap-3">
                    <p className="text-[11px] text-[#7b858d]">Private to you and your campaign team.</p>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={onSaveNote}
                      disabled={isSaving || notes === (feedback?.notes || '')}
                      className="min-h-10 gap-2 rounded-xl border-[#d9d0c4] bg-white"
                    >
                      {isSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
                      Save note
                    </Button>
                  </div>
                </div>
              </div>
            </ScrollArea>

            <div className="flex-shrink-0 border-t border-[#ded5ca] bg-white p-3 shadow-[0_-12px_28px_rgba(16,32,51,.06)] sm:p-4">
              <div className="mb-2 flex min-h-6 items-center justify-between px-1 text-xs">
                <span className="font-semibold text-[#66727c]">Would you want to be a guest?</span>
                {status ? (
                  <button
                    type="button"
                    disabled={isSaving}
                    onClick={() => onDecide(null)}
                    className="inline-flex min-h-9 items-center gap-1.5 font-semibold text-[#7b858d] hover:text-[#102033]"
                  >
                    <RotateCcw className="h-3.5 w-3.5" />
                    Clear choice
                  </button>
                ) : null}
              </div>
              <div className="grid grid-cols-2 gap-2.5">
                <Button
                  type="button"
                  variant="outline"
                  disabled={isSaving}
                  aria-pressed={status === 'rejected'}
                  onClick={() => onDecide('rejected')}
                  className={cn(
                    'min-h-12 gap-2 rounded-xl border-[#d8cec4] font-bold',
                    status === 'rejected'
                      ? 'border-[#78685f] bg-[#78685f] text-white hover:bg-[#665850] hover:text-white'
                      : 'bg-[#fbf8f4] text-[#665d57] hover:bg-[#f2ece5]',
                  )}
                >
                  <ThumbsDown className="h-4 w-4" />
                  Not a fit
                </Button>
                <Button
                  type="button"
                  disabled={isSaving}
                  aria-pressed={status === 'approved'}
                  onClick={() => onDecide('approved')}
                  className={cn(
                    'min-h-12 gap-2 rounded-xl font-bold',
                    status === 'approved'
                      ? 'bg-[#668b78] text-white hover:bg-[#587765]'
                      : 'bg-[var(--campaign-primary)] text-[var(--campaign-primary-foreground)] hover:brightness-95',
                  )}
                >
                  {isSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : <ThumbsUp className="h-4 w-4" />}
                  Interested
                </Button>
              </div>
            </div>
          </div>
        ) : null}
      </SheetContent>
    </Sheet>
  )
}
