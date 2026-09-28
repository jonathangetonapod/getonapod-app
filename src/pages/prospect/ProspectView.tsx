import { useState, useEffect, type CSSProperties } from 'react'
import { useParams } from 'react-router-dom'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog'
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion'
import { supabase } from '@/lib/supabase'
import { toast } from 'sonner'
import { ArrowRight, BarChart3, Calendar, ExternalLink, FileText, HelpCircle, Loader2, MessageSquare, Play, Quote, Radio, RefreshCw, Search, X } from 'lucide-react'
import { bookingLinkUrl, schedulerEmbedUrl, schedulerName } from '@/lib/schedulerEmbed'
import PageSEO from '@/components/seo/PageSEO'
import { openExternalUrl } from '@/lib/externalUrl'
import { currentHostname } from '@/lib/workspaceHost'
import { AudienceEstimatesSheet } from '@/components/review/AudienceEstimatesSheet'
import { FocusedReview } from '@/components/review/FocusedReview'
import { ReviewCard } from '@/components/review/ReviewCard'
import { ReviewDoneCard } from '@/components/review/ReviewDoneCard'
import { ReviewEmptyState } from '@/components/review/ReviewEmptyState'
import { ReviewFilters } from '@/components/review/ReviewFilters'
import { ReviewPagination } from '@/components/review/ReviewPagination'
import { ReviewTutorial } from '@/components/review/ReviewTutorial'
import { ShowProfileSheet } from '@/components/review/ShowProfileSheet'
import { ReviewBrandContext, normalizedBrandColor, readableBrandColor, reviewBrandStyle } from '@/components/review/reviewBrand'
import {
  EMPTY_REVIEW_FILTERS,
  collectReviewCategories,
  filterReviewPodcasts,
  hasActiveFilters,
  type ReviewFilterState,
} from '@/components/review/reviewFilters'
import {
  REVIEW_CARDS_PER_PAGE,
  fitAnalysisFor,
  formatListeners,
  reviewCounts,
  uniqueReviewPodcasts,
  type ReviewPodcast,
  type ReviewStatus,
} from '@/components/review/reviewTypes'
import { useDebouncedValue } from '@/components/review/useDebouncedValue'

export default function ProspectView() {
  return <ProspectViewContent />
}

/** The fields of the public dashboard payload this page reads. */
interface ProspectDashboard {
  prospect_name: string
  prospect_image_url: string | null
  personalized_tagline: string | null
  media_kit_url: string | null
  loom_video_url: string | null
  loom_video_title: string | null
  show_loom_video: boolean
  testimonial_ids: string[] | null
  show_testimonials: boolean
  cta_type: 'reply' | 'book_call' | 'learn_more' | 'none'
  cta_label: string
  cta_url: string | null
}

interface ProspectWorkspaceBrand {
  brand_name: string
  logo_url: string | null
  primary_color: string | null
  accent_color: string | null
  booking_url?: string | null
}

interface ProspectTestimonial {
  id: string
  client_name: string
  client_title: string | null
  client_company: string | null
  quote: string | null
}

interface PodcastFeedback {
  id: string
  prospect_dashboard_id: string
  podcast_id: string
  podcast_name: string | null
  status: ReviewStatus
  notes: string | null
  created_at: string
  updated_at: string
}

interface ProspectDashboardResponse {
  success: true
  dashboard: ProspectDashboard
  feedback: PodcastFeedback[]
  workspace: ProspectWorkspaceBrand
}

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY
const PUBLIC_READ_TIMEOUT_MS = 12_000

class PublicReadError extends Error {
  constructor(message: string, readonly status?: number, readonly code?: string) {
    super(message)
    this.name = 'PublicReadError'
  }
}

/** The dashboard exists and is being edited. Not the same as a dead link. */
const DASHBOARD_UPDATING = 'DASHBOARD_UPDATING'

async function readPublicEndpoint<T>(endpoint: string, body: Record<string, unknown>): Promise<T> {
  const controller = new AbortController()
  const timeout = window.setTimeout(() => controller.abort(), PUBLIC_READ_TIMEOUT_MS)

  try {
    const response = await fetch(`${SUPABASE_URL}/functions/v1/${endpoint}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'apikey': SUPABASE_ANON_KEY,
        'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
      },
      body: JSON.stringify(body),
      signal: controller.signal,
    })
    const responseText = await response.text()
    let payload: unknown = {}

    if (responseText) {
      try {
        payload = JSON.parse(responseText)
      } catch {
        throw new PublicReadError('The server returned an unreadable response. Please try again.', response.status)
      }
    }

    if (!response.ok) {
      const field = (key: string) => {
        const value = payload && typeof payload === 'object' ? (payload as Record<string, unknown>)[key] : undefined
        return typeof value === 'string' ? value : undefined
      }
      throw new PublicReadError(field('error') || 'This page could not be loaded. Please try again.', response.status, field('code'))
    }

    return payload as T
  } catch (error) {
    if (controller.signal.aborted) {
      throw new PublicReadError('This page took too long to load. Please try again.')
    }
    if (error instanceof PublicReadError) throw error
    throw new PublicReadError('We could not connect to this page. Check your connection and try again.')
  } finally {
    window.clearTimeout(timeout)
  }
}

function shouldRetryPublicRead(failureCount: number, error: unknown): boolean {
  if (failureCount >= 1) return false
  if (!(error instanceof PublicReadError) || error.status === undefined) return true
  return error.status >= 500 || [408, 425, 429].includes(error.status)
}

function testimonialInitials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean)
  if (parts.length === 0) return '-'
  return (parts[0][0] + (parts.length > 1 ? parts[parts.length - 1][0] : '')).toUpperCase()
}

function testimonialRole(testimonial: ProspectTestimonial): string {
  return [testimonial.client_title, testimonial.client_company].map((part) => part?.trim()).filter(Boolean).join(', ')
}

/** Only a Loom share or embed link, over https, becomes a frame. */
function loomEmbedUrlFor(url: string): string | null {
  try {
    const parsedUrl = new URL(url)
    if (parsedUrl.protocol !== 'https:' || !['loom.com', 'www.loom.com'].includes(parsedUrl.hostname)) return null
    const match = parsedUrl.pathname.match(/^\/(?:share|embed)\/([a-zA-Z0-9_-]{8,128})\/?$/)
    return match ? `https://www.loom.com/embed/${match[1]}` : null
  } catch {
    return null
  }
}

function ProspectViewContent() {
  const { slug } = useParams<{ slug: string }>()
  const queryClient = useQueryClient()

  // UI state
  const [filters, setFilters] = useState<ReviewFilterState>(EMPTY_REVIEW_FILTERS)
  const debouncedSearch = useDebouncedValue(filters.search)
  const [currentPage, setCurrentPage] = useState(1)
  const [focusedQueue, setFocusedQueue] = useState<ReviewPodcast[] | null>(null)

  // Show profile state
  const [selectedPodcast, setSelectedPodcast] = useState<ReviewPodcast | null>(null)
  const [currentNotes, setCurrentNotes] = useState('')
  const [isSavingFeedback, setIsSavingFeedback] = useState(false)

  // Loom video modal state
  const [showLoomVideo, setShowLoomVideo] = useState(false)
  const [loomVideoLoading, setLoomVideoLoading] = useState(true)

  const [showTutorial, setShowTutorial] = useState(false)
  const [showReviewPanel, setShowReviewPanel] = useState(false)

  // React Query: Fetch dashboard + feedback via edge function (cached for 5 minutes)
  const { data: dashboardResponse, isLoading: dashboardLoading, error: dashboardError, refetch: refetchDashboard } = useQuery({
    queryKey: ['prospect-dashboard', slug],
    queryFn: async () => {
      if (!slug) throw new Error('Invalid dashboard link')

      const result = await readPublicEndpoint<Omit<ProspectDashboardResponse, 'success'> & { success: boolean; error?: string }>(
        'get-prospect-dashboard',
        { slug, hostname: currentHostname() },
      )

      if (!result.success) {
        throw new PublicReadError(result.error || 'Dashboard not found', 400)
      }

      return result as ProspectDashboardResponse
    },
    staleTime: 5 * 60 * 1000, // Cache for 5 minutes
    enabled: !!slug,
    retry: shouldRetryPublicRead,
    retryDelay: 600,
  })

  const dashboard = dashboardResponse?.dashboard ?? null
  const workspaceBrand = dashboardResponse?.workspace ?? null
  // White-label: colours and the signature come from the workspace, never from
  // us. The fallbacks are the design's own ink and terracotta.
  const brand = {
    primary: normalizedBrandColor(workspaceBrand?.primary_color, '#0D1B2A'),
    accent: normalizedBrandColor(workspaceBrand?.accent_color, '#B46A3C'),
  }
  const accentColor = brand.accent
  const primaryColor = brand.primary
  const primaryTextColor = readableBrandColor(primaryColor)
  const conciergeName = workspaceBrand?.brand_name?.trim()
    ? `${workspaceBrand.brand_name.trim()}, your booking team`
    : 'Your booking team'
  const conciergeInitial = (workspaceBrand?.brand_name?.trim() || 'G').charAt(0).toUpperCase()
  const bookingLink = bookingLinkUrl(workspaceBrand?.booking_url)
  const bookingEmbedUrl = schedulerEmbedUrl(workspaceBrand?.booking_url)
  const bookingProvider = schedulerName(workspaceBrand?.booking_url)
  const brandName = workspaceBrand?.brand_name?.trim() || 'Your booking team'

  // The tab, its icon and its colour belong to the agency whose page this is.
  const seo = (
    <PageSEO
      title={`Your podcast shortlist | ${brandName}`}
      description="A private, personalized podcast shortlist."
      noindex
      whiteLabel
      brandName={brandName}
      favicon={workspaceBrand?.logo_url ?? null}
      themeColor={primaryColor}
    />
  )

  // Only the testimonials chosen for this dashboard, and no fallback to the
  // featured ones: the table is the platform's own library, not workspace-scoped.
  const curatedTestimonialIds =
    dashboard?.show_testimonials === false
      ? []
      : (dashboard?.testimonial_ids ?? []).filter((id) => typeof id === 'string' && id.trim())

  const { data: curatedTestimonials = [] } = useQuery({
    queryKey: ['prospect-testimonials', slug, curatedTestimonialIds],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('testimonials')
        .select('id,client_name,client_title,client_company,quote')
        .in('id', curatedTestimonialIds)
        .eq('is_active', true)
        .order('display_order', { ascending: true })

      if (error) throw error
      return (data ?? []) as ProspectTestimonial[]
    },
    enabled: curatedTestimonialIds.length > 0,
    staleTime: 5 * 60 * 1000,
  })

  // The design's card is a quote, so one without a quote has nothing to say here.
  const quotedTestimonials = curatedTestimonials.filter((testimonial) => testimonial.quote?.trim())

  // Every answer is about how this page works; none promises a price, a date,
  // or a number of bookings on the agency's behalf.
  const faqTeamName = workspaceBrand?.brand_name?.trim() || 'We'
  const prospectFaqs = [
    {
      question: 'How were these shows chosen?',
      answer: 'Each one was matched against your background, the audience you are trying to reach, and whether the format actually gives a guest room to talk. The reason a show made your list is written on its card.',
    },
    {
      question: 'What happens when I mark a show as interested?',
      answer: `It joins your picks. ${faqTeamName} pitches you to the host with an angle drawn from your own work, then handles the follow-up and the scheduling. Nothing is ever sent to a show you have not picked.`,
    },
    {
      question: 'What if a show is not right for me?',
      answer: 'Mark it not a fit. That is as useful as a pick: it says something about what you want, and the next set of suggestions is sharper for it.',
    },
    {
      question: 'Am I committing to anything by marking a show as interested?',
      answer: 'No. It marks which rooms are worth a pitch. It is not a booking and it is not a contract, and you can change your mind on any show before it is pitched.',
    },
    {
      question: 'What do you need from me?',
      answer: 'Your decisions on this page, and your time on the recordings themselves. The pitching, the chasing, the scheduling and the prep notes are handled for you.',
    },
    {
      question: 'Who else can see this page?',
      answer: 'Only the people you send the link to. It is not listed anywhere, and search engines are asked not to index it.',
    },
  ]

  // Fetch the shortlist in parallel with the dashboard so a slow request cannot block both.
  const { data: podcasts = [], isLoading: podcastsLoading, error: podcastsError, refetch: refetchPodcasts } = useQuery({
    queryKey: ['prospect-podcasts', slug],
    queryFn: async () => {
      if (!slug) return []

      const data = await readPublicEndpoint<{ podcasts?: ReviewPodcast[] }>('get-prospect-podcasts', {
        dashboardSlug: slug,
        cacheOnly: true,
      })

      if (data.podcasts !== undefined && !Array.isArray(data.podcasts)) {
        throw new PublicReadError('The podcast shortlist could not be read. Please try again.')
      }
      return data.podcasts || []
    },
    staleTime: 5 * 60 * 1000, // Cache for 5 minutes
    enabled: !!slug,
    retry: shouldRetryPublicRead,
    retryDelay: 600,
  })

  // Feedback data comes from the dashboard edge function response
  const feedbackData = dashboardResponse?.feedback ?? []

  // Build feedback map from query data
  const feedbackMap = new Map<string, PodcastFeedback>(
    feedbackData.map((fb: PodcastFeedback) => [fb.podcast_id, fb])
  )
  const selectedFeedbackNotes = selectedPodcast
    ? feedbackMap.get(selectedPodcast.podcast_id)?.notes || ''
    : ''

  // Derived state
  const loading = dashboardLoading
  const loadingPodcasts = podcastsLoading
  const error = dashboardError instanceof Error
    ? dashboardError.message
    : dashboardError
      ? 'This dashboard could not be loaded.'
      : null
  const isUpdating = dashboardError instanceof PublicReadError
    && dashboardError.code === DASHBOARD_UPDATING

  const loomEmbedUrl = dashboard?.loom_video_url ? loomEmbedUrlFor(dashboard.loom_video_url) : null

  // Reset to page 1 when filters change
  useEffect(() => {
    setCurrentPage(1)
  }, [filters, debouncedSearch])

  // Load existing notes when podcast is selected
  useEffect(() => {
    setCurrentNotes(selectedPodcast ? selectedFeedbackNotes : '')
  }, [selectedFeedbackNotes, selectedPodcast])

  // Save feedback (interested / not a fit / notes)
  const saveFeedback = async (podcastId: string, status: ReviewStatus, notes?: string) => {
    if (!dashboard) return false

    const existingFeedback = feedbackMap.get(podcastId)

    setIsSavingFeedback(true)
    try {
      const response = await fetch(`${SUPABASE_URL}/functions/v1/save-prospect-feedback`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'apikey': SUPABASE_ANON_KEY, 'Authorization': `Bearer ${SUPABASE_ANON_KEY}` },
        body: JSON.stringify({
          dashboard_slug: slug,
          podcast_id: podcastId,
          status,
          notes: notes !== undefined ? notes : (selectedPodcast?.podcast_id === podcastId && currentNotes.trim() ? currentNotes : (feedbackMap.get(podcastId)?.notes ?? null))
        })
      })

      if (!response.ok) {
        // Error bodies are not always JSON; a parser error would hide the real message.
        const errorData = await response.json().catch(() => ({}))
        throw new Error(errorData.error || 'Failed to save feedback')
      }

      const result = await response.json().catch(() => ({})) as { feedback?: Partial<PodcastFeedback> }

      // Patch the cache instead of refetching: get-prospect-dashboard records a
      // view on every call. The saved row's values fill what the payload lacks.
      queryClient.setQueryData<ProspectDashboardResponse>(['prospect-dashboard', slug], (current) => {
        if (!current) return current
        const savedFeedback: PodcastFeedback = {
          id: result.feedback?.id ?? existingFeedback?.id ?? `${slug}:${podcastId}`,
          prospect_dashboard_id: result.feedback?.prospect_dashboard_id ?? existingFeedback?.prospect_dashboard_id ?? '',
          podcast_id: podcastId,
          podcast_name: existingFeedback?.podcast_name ?? null,
          status: result.feedback?.status ?? status,
          notes: result.feedback?.notes ?? null,
          created_at: result.feedback?.created_at ?? existingFeedback?.created_at ?? new Date().toISOString(),
          updated_at: result.feedback?.updated_at ?? new Date().toISOString(),
        }
        const rest = (current.feedback ?? []).filter((feedback) => feedback.podcast_id !== podcastId)
        return { ...current, feedback: [...rest, savedFeedback] }
      })
      return true
    } catch (err) {
      console.error('Error saving feedback:', err)
      toast.error(err instanceof Error ? err.message : 'Unable to save your feedback. Please try again.')
      return false
    } finally {
      setIsSavingFeedback(false)
    }
  }

  // Loading state - show skeleton UI for snappier feel
  if (loading) {
    return (
      <main className="homepage-shell min-h-screen bg-transparent text-[#0d1b2a]">
        {seo}
        <section className="paper-noise px-4 py-16 md:py-20">
          <div className="container mx-auto">
            <div className="grid gap-10 xl:grid-cols-[1.02fr_0.98fr]">
              <div className="space-y-5">
                <div className="h-6 w-40 animate-pulse rounded-full bg-[#dfeafb]" />
                <div className="h-24 max-w-2xl animate-pulse rounded-[28px] bg-[#eef4ff]" />
                <div className="h-8 max-w-xl animate-pulse rounded-[20px] bg-[#eef4ff]" />
              </div>
              <div className="h-[420px] animate-pulse rounded-[34px] bg-[#10263b]" />
            </div>
            <div className="mt-10 grid gap-4 lg:grid-cols-2">
              {[1, 2, 3, 4].map((item) => (
                <div key={item} className="h-64 animate-pulse rounded-3xl border border-[#0d1b2a]/8 bg-white/82" />
              ))}
            </div>
          </div>
        </section>
      </main>
    )
  }

  /*
   * Being updated is its own state, not an error. Somebody was sent this link
   * on purpose and the shortlist behind it still exists; the only true thing
   * to say is that it is not ready this minute, not "dead link".
   */
  if (isUpdating || error || !dashboard) {
    const notice = isUpdating
      ? {
          icon: <RefreshCw className="h-8 w-8 text-[#b46a3c]" />,
          iconClass: 'bg-[#fff3e8]',
          title: 'Your shortlist is being updated',
          body: 'We are adding to it right now. Your link still works. Check back in a few minutes, or reply to the email that brought you here and we will tell you the moment it is ready.',
          action: 'Check again',
        }
      : {
          icon: <X className="h-8 w-8 text-[#c5545b]" />,
          iconClass: 'bg-[#fce9ea]',
          title: 'Dashboard not available',
          body: error || 'This dashboard could not be found.',
          action: 'Try again',
        }
    return (
      <main className="homepage-shell min-h-screen bg-transparent text-[#0d1b2a]">
        {seo}
        <section className="paper-noise flex min-h-screen items-center justify-center px-4 py-16">
          <Card className="w-full max-w-md border border-[#0d1b2a]/8 bg-white/84 shadow-[0_20px_42px_rgba(13,27,42,0.08)] backdrop-blur-sm">
            <CardContent className="space-y-4 px-6 pb-8 pt-8 text-center">
              <div className={`mx-auto flex h-16 w-16 items-center justify-center rounded-full ${notice.iconClass}`}>{notice.icon}</div>
              <div className="space-y-2">
                <h2 className="font-display text-2xl font-semibold tracking-[-0.04em] text-[#0d1b2a]">{notice.title}</h2>
                <p className="text-[#5d7188]">{notice.body}</p>
              </div>
              <Button type="button" variant="outline" className="rounded-full" onClick={() => void refetchDashboard()}>
                <RefreshCw className="mr-2 h-4 w-4" />
                {notice.action}
              </Button>
            </CardContent>
          </Card>
        </section>
      </main>
    )
  }

  const uniquePodcasts = uniqueReviewPodcasts(podcasts)
  const totalReach = uniquePodcasts.reduce((sum, podcast) => sum + (podcast.audience_size || 0), 0)
  const ratings = uniquePodcasts.filter((podcast) => podcast.itunes_rating).map((podcast) => podcast.itunes_rating!)
  const avgRating = ratings.length > 0 ? ratings.reduce((sum, rating) => sum + rating, 0) / ratings.length : 0

  const allCategories = collectReviewCategories(uniquePodcasts)
  const counts = reviewCounts(uniquePodcasts, feedbackMap)
  const sortedPodcasts = filterReviewPodcasts(uniquePodcasts, { ...filters, search: debouncedSearch }, feedbackMap)

  // Pagination
  const totalPages = Math.ceil(sortedPodcasts.length / REVIEW_CARDS_PER_PAGE)
  const startIndex = (currentPage - 1) * REVIEW_CARDS_PER_PAGE
  const paginatedPodcasts = sortedPodcasts.slice(startIndex, startIndex + REVIEW_CARDS_PER_PAGE)
  const reviewedCountTotal = counts.interested + counts.notAFit
  const approvedCountTotal = counts.interested
  const progressPercent = uniquePodcasts.length > 0 ? (reviewedCountTotal / uniquePodcasts.length) * 100 : 0
  const prospectFirstName = dashboard.prospect_name.trim().split(/\s+/)[0] || dashboard.prospect_name
  // Every show has a decision. The page should say so where the list was,
  // not leave the reader hunting for a submit button that does not exist.
  const reviewComplete = !loadingPodcasts && !podcastsError
    && uniquePodcasts.length > 0
    && counts.toReview === 0
  // The one call link this page has: the dashboard's own when it is a
  // booking link, otherwise the workspace scheduler, and nothing when the
  // dashboard turned its call-to-action off.
  const callLink = dashboard.cta_type === 'none'
    ? null
    : dashboard.cta_type === 'book_call' && dashboard.cta_url
      ? dashboard.cta_url
      : bookingLink

  const startFocusedReview = () => {
    if (sortedPodcasts.length === 0) return
    setFocusedQueue(sortedPodcasts)
  }

  const exitFocusedReview = (reason: 'complete' | 'dismiss') => {
    setFocusedQueue(null)
    if (reason === 'complete') document.getElementById('opportunities')?.scrollIntoView?.({ behavior: 'smooth' })
  }

  const bookCallButton = (link: string, className: string) => (
    <button
      type="button"
      onClick={() => openExternalUrl(link)}
      style={{ backgroundColor: primaryColor, color: primaryTextColor }}
      className={`inline-flex shrink-0 items-center gap-2 rounded-full px-5 text-sm font-semibold shadow-[0_8px_20px_rgba(13,27,42,0.18)] transition-transform hover:-translate-y-px ${className}`}
    >
      <Calendar className="h-3.5 w-3.5" aria-hidden="true" />
      Book a short call
    </button>
  )

  const replyFallback = (title: string) => (
    <div className="flex max-w-sm items-start gap-3 rounded-[22px] border border-white/14 bg-white/8 px-5 py-4">
      <MessageSquare className="mt-0.5 h-5 w-5 flex-shrink-0 text-white/80" />
      <div>
        <p className="font-semibold">{title}</p>
        <p className="mt-1 text-sm leading-6 text-white/65">Reply to the email that brought you here and we will take care of the next step.</p>
      </div>
    </div>
  )

  return (
    <ReviewBrandContext.Provider value={brand}>
    <main className="homepage-shell min-h-screen bg-transparent text-[#0d1b2a]" style={reviewBrandStyle(brand)}>
      {seo}
      <a
        href="#opportunities"
        className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-[60] focus:rounded-full focus:bg-[#0d1b2a] focus:px-4 focus:py-2 focus:text-sm focus:text-[#f7fafc]"
      >
        Skip to opportunities
      </a>

      {/*
       * A sticky bar carrying who this was prepared for and the way to talk to
       * somebody about it, branded by the workspace and never by us.
       */}
      <div className="sticky top-0 z-[45] border-b border-[#0d1b2a]/[0.07] bg-[#fbf8f3]/85 backdrop-blur-[12px]">
        <div className="mx-auto flex max-w-[1320px] flex-wrap items-center gap-3 px-4 py-3 sm:px-6">
          {workspaceBrand?.logo_url ? (
            <img
              src={workspaceBrand.logo_url}
              alt={`${workspaceBrand.brand_name} logo`}
              className="h-7 max-w-24 object-contain"
            />
          ) : (
            <span className="font-editorial text-lg font-semibold tracking-[-0.02em]">
              {workspaceBrand?.brand_name || 'Your shortlist'}
            </span>
          )}
          <span className="hidden h-4 w-px bg-[#0d1b2a]/15 sm:block" aria-hidden="true" />
          <span className="hidden font-mono text-[10px] uppercase tracking-[0.22em] text-[#7a6554] sm:inline">
            Prepared for {dashboard.prospect_name}
          </span>
          <div className="ml-auto flex items-center gap-3">
            {approvedCountTotal > 0 && (
              <span className="hidden text-[13px] text-[#5d7188] sm:inline">
                {approvedCountTotal} {approvedCountTotal === 1 ? 'pick' : 'picks'}
              </span>
            )}
            {bookingLink ? bookCallButton(bookingLink, 'h-10') : null}
          </div>
        </div>
      </div>

      <section className="px-4 pb-10 pt-14 md:pb-12 md:pt-16">
        <div className="container mx-auto">
          <div className="grid gap-6 rounded-[32px] border border-[#0d1b2a]/8 bg-white px-5 py-6 shadow-[0_18px_38px_rgba(13,27,42,0.08)] sm:px-6 sm:py-7 lg:grid-cols-[minmax(0,1.2fr)_360px] lg:gap-8">
            {/* A column, so the slack under a shorter left side collects above the stats. */}
            <div className="flex flex-col">
              <div className="flex flex-wrap items-center gap-3">
                {workspaceBrand?.logo_url && (
                  <img src={workspaceBrand.logo_url} alt={`${workspaceBrand.brand_name} logo`} className="mr-1 h-9 max-w-28 object-contain" />
                )}
                <p className="section-kicker">Your podcast shortlist</p>
                <span className="rounded-full border border-[#0d1b2a]/10 bg-[#f6f9fc] px-3 py-1.5 font-mono text-[10px] uppercase tracking-[0.22em] text-[#5d7188]">
                  Built for {prospectFirstName}
                </span>
              </div>

              <div className="mt-5 flex items-center gap-4">
                {dashboard.prospect_image_url && (
                  <div className="h-14 w-14 overflow-hidden rounded-[18px] border border-[#0d1b2a]/10 bg-white sm:h-16 sm:w-16">
                    <img
                      src={dashboard.prospect_image_url}
                      alt={dashboard.prospect_name}
                      className="h-full w-full object-cover"
                    />
                  </div>
                )}
                <p className="max-w-xl text-sm leading-6 text-[#4c5d73]">
                  Review the best-fit shows, mark the ones you are interested in, and we handle the outreach and booking from there.
                </p>
              </div>

              <h1 className="mt-6 font-editorial text-[clamp(2.6rem,6.4vw,4.9rem)] leading-[0.94] tracking-[-0.05em] text-[#0d1b2a] text-balance">
                {uniquePodcasts.length > 0
                  ? `${prospectFirstName}, we found ${uniquePodcasts.length} rooms where your story belongs.`
                  : `${prospectFirstName}, your shortlist is ready.`}
              </h1>

              <p className="mt-5 max-w-2xl text-lg leading-8 text-[#4c5d73]">
                {loadingPodcasts
                  ? 'Loading your personalized podcast matches.'
                  : podcastsError
                    ? 'Your profile is ready, but the shortlist needs a quick refresh.'
                    : dashboard.personalized_tagline
                      || `Every show below was matched to your expertise and the audience you want in front of you${totalReach > 0 ? `, ${formatListeners(totalReach)} combined listeners` : ''}. Mark the ones you are interested in; we do everything after that.`}
              </p>

              {/* The note from whoever built the shortlist, signed by the workspace and never by us. */}
              <div
                className="mt-7 flex max-w-[620px] items-start gap-4 rounded-[22px] border p-5"
                style={{ borderColor: `${accentColor}2e`, background: `${accentColor}0f` }}
              >
                <div
                  className="flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-full font-editorial text-lg text-white"
                  style={{ background: `linear-gradient(135deg, ${accentColor}, ${accentColor}b0)` }}
                  aria-hidden="true"
                >
                  {conciergeInitial}
                </div>
                <div>
                  <p className="text-[15px] leading-[25px] text-[#4c5d73]">
                    “{prospectFirstName}, these were picked by hand after going through your
                    background. Start with the ones marked strongest; they are your best openings.
                    Any questions, grab a time below.”
                  </p>
                  <p
                    className="mt-2 font-mono text-[11px] uppercase tracking-[0.18em]"
                    style={{ color: accentColor }}
                  >
                    {conciergeName}
                  </p>
                </div>
              </div>

              <div className="mt-7 flex flex-col gap-3 sm:flex-row">
                <Button variant="hero" size="xl" className="rounded-full px-8 text-base" asChild>
                  <a href="#opportunities">Review opportunities</a>
                </Button>
                {dashboard.media_kit_url && (
                  <Button
                    variant="heroOutline"
                    size="xl"
                    className="rounded-full px-8 text-base"
                    onClick={() => openExternalUrl(dashboard.media_kit_url!)}
                  >
                    <FileText className="mr-2 h-4 w-4" />
                    View my media kit
                  </Button>
                )}
                {dashboard.cta_url && (dashboard.cta_type === 'book_call' || dashboard.cta_type === 'learn_more') && (
                  <Button
                    variant="heroOutline"
                    size="xl"
                    className="rounded-full px-8 text-base"
                    onClick={() => openExternalUrl(dashboard.cta_url!)}
                  >
                    {dashboard.cta_type === 'book_call' ? <Calendar className="mr-2 h-4 w-4" /> : <ExternalLink className="mr-2 h-4 w-4" />}
                    {dashboard.cta_label}
                  </Button>
                )}
              </div>

              {/* Only figures this page can stand behind; a time to first booking is a promise, not a stat. */}
              <div className="mt-8 flex flex-wrap gap-x-8 gap-y-5 lg:mt-auto lg:pt-8">
                {[
                  { value: totalReach > 0 ? `${formatListeners(totalReach)}+` : '-', label: 'combined listeners' },
                  { value: podcastsError ? '-' : String(uniquePodcasts.length), label: 'shows matched' },
                  { value: avgRating > 0 ? `${avgRating.toFixed(1)}★` : '-', label: 'average rating' },
                ].map((stat) => (
                  <div key={stat.label}>
                    <p className="text-[28px] font-semibold tracking-[-0.04em] text-[#0d1b2a]">{stat.value}</p>
                    <p className="mt-0.5 font-mono text-[10px] uppercase tracking-[0.2em] text-[#7a6554]">
                      {stat.label}
                    </p>
                  </div>
                ))}
              </div>
            </div>

            <div className="rounded-[28px] border border-[#0d1b2a]/8 bg-[#f8fbff] p-5">
              <p className="section-kicker">Start here</p>
              <h2 className="mt-3 font-display text-2xl font-semibold tracking-[-0.04em] text-[#0d1b2a]">
                Mark the shows you are interested in.
              </h2>

              <div className="mt-5 rounded-[22px] border border-[#0d1b2a]/8 bg-white p-4">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="text-sm font-medium text-[#0d1b2a]">Review progress</p>
                    <p className="mt-1 text-sm leading-6 text-[#4c5d73]">
                      {reviewedCountTotal > 0
                        ? `${reviewedCountTotal} of ${uniquePodcasts.length} reviewed so far`
                        : 'Start with the rooms that feel strongest for your story.'}
                    </p>
                  </div>
                  <span className="rounded-full border border-[#0d1b2a]/10 bg-[#f6f9fc] px-3 py-1.5 text-sm font-semibold text-[#0d1b2a]">
                    {approvedCountTotal} {approvedCountTotal === 1 ? 'pick' : 'picks'}
                  </span>
                </div>
                <div className="mt-4 h-2 overflow-hidden rounded-full bg-[#e5edf6]">
                  <div
                    className="h-full rounded-full bg-[#2d6df6] transition-all duration-500"
                    style={{ width: `${progressPercent}%` }}
                  />
                </div>
              </div>

              <div className="mt-5 space-y-3">
                {[
                  'Open any show to see why it fits, who listens, and what you could talk about.',
                  'Mark the shows you are interested in, mark the rest not a fit, and leave notes where useful.',
                  `${brandName} handles the pitching, follow-up, and booking for the shows you picked.`,
                ].map((step, index) => (
                  <div key={step} className="flex gap-3 rounded-[20px] border border-[#0d1b2a]/8 bg-white px-4 py-3">
                    <span className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-full bg-[#eef4ff] text-xs font-semibold text-[#2d6df6]">
                      {index + 1}
                    </span>
                    <p className="text-sm leading-6 text-[#4c5d73]">{step}</p>
                  </div>
                ))}
              </div>

              <div className="mt-5 flex flex-col gap-3">
                <Button
                  variant="outline"
                  className="justify-start rounded-full border-[#0d1b2a]/10 bg-white"
                  onClick={() => setShowReviewPanel(true)}
                >
                  <BarChart3 className="mr-2 h-4 w-4 text-[#2d6df6]" />
                  About the data
                </Button>

                {loomEmbedUrl && dashboard.show_loom_video ? (
                  <button
                    type="button"
                    onClick={() => setShowLoomVideo(true)}
                    className="rounded-[22px] border border-[#0d1b2a]/8 bg-white p-4 text-left transition-colors hover:bg-[#f8fbff]"
                  >
                    <p className="section-kicker">Watch this first</p>
                    <p className="mt-2 font-medium text-[#0d1b2a]">
                      {dashboard.loom_video_title || 'Your personal video message'}
                    </p>
                    <p className="mt-2 text-sm leading-6 text-[#4c5d73]">
                      A quick walkthrough of how to use this dashboard and where to start.
                    </p>
                    <p className="mt-3 inline-flex items-center gap-2 text-sm font-medium text-[#0d1b2a]">
                      Watch the walkthrough
                      <ArrowRight className="h-4 w-4" />
                    </p>
                  </button>
                ) : (
                  <div className="rounded-[22px] border border-[#0d1b2a]/8 bg-white px-4 py-4">
                    <p className="text-sm leading-6 text-[#4c5d73]">
                      Use the shortlist below to decide which rooms feel most aligned with your voice, offer, and audience. A short note on any pick helps our team pitch more sharply.
                    </p>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      </section>

      {/*
       * Appears once something has been approved. Approving is not the finish
       * line, the call is, and the moment worth catching is just after a decision.
       */}
      {approvedCountTotal > 0 && bookingLink && (
        <div className="fixed bottom-5 left-1/2 z-[46] w-[min(calc(100vw-2rem),640px)] -translate-x-1/2">
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-[999px] bg-[#0d1b2a] py-2.5 pl-6 pr-2.5 text-[#f7fafc] shadow-[0_20px_45px_rgba(13,27,42,0.35)]">
            <p className="text-sm" role="status">
              <strong className="font-semibold">
                {approvedCountTotal} {approvedCountTotal === 1 ? 'pick' : 'picks'}.
              </strong>
              <span className="text-[#f7fafc]/65">
                {' '}{brandName} will start with these.
              </span>
            </p>
            <button
              type="button"
              onClick={() => openExternalUrl(bookingLink)}
              className="h-[42px] shrink-0 rounded-full px-5 text-sm font-semibold text-[#0d1b2a] transition-transform hover:-translate-y-px"
              style={{ background: accentColor }}
            >
              Book the call
            </button>
          </div>
        </div>
      )}

      {/* The shortlist. Everything from here to the pagination is the shared review surface. */}
      <section id="opportunities" aria-labelledby="shortlist-heading" className="mx-auto max-w-7xl px-4 py-6 sm:px-6 sm:py-12 lg:px-8">
        <div className="flex flex-col justify-between gap-5 md:flex-row md:items-end">
          <div>
            <p className="section-kicker">The full shortlist</p>
            <h2 id="shortlist-heading" className="mt-3 font-editorial text-[clamp(1.9rem,3.4vw,2.8rem)] leading-[1.02] tracking-[-0.04em] text-[#0d1b2a]">
              Every room, and why it&rsquo;s yours.
            </h2>
            <p className="mt-3 max-w-xl text-[15px] leading-[25px] text-[#4c5d73]">
              Open any show to see why it fits and what you would talk about. Mark the ones you
              are interested in and we start reaching out on your behalf.
            </p>
          </div>
          <Button
            type="button"
            onClick={startFocusedReview}
            disabled={sortedPodcasts.length === 0}
            className="min-h-11 shrink-0 gap-2 rounded-full bg-[var(--campaign-primary)] px-5 text-[var(--campaign-primary-foreground)] hover:brightness-95"
          >
            <Play className="h-4 w-4 fill-current" />
            Focused review
          </Button>
        </div>

        {reviewComplete && (
          <ReviewDoneCard total={uniquePodcasts.length} picks={approvedCountTotal} brandName={brandName}>
            {callLink ? bookCallButton(callLink, 'min-h-11') : null}
          </ReviewDoneCard>
        )}

        <ReviewFilters
          value={filters}
          onChange={setFilters}
          categories={allCategories}
          counts={counts}
          resultCount={sortedPodcasts.length}
        />

        {podcastsError ? (
          <ReviewEmptyState
            icon={RefreshCw}
            title="The shortlist needs a quick refresh"
            body="Your dashboard is still available. We just could not load the podcast matches on this attempt."
            actionLabel="Retry shortlist"
            onAction={() => void refetchPodcasts()}
          />
        ) : loadingPodcasts ? (
          <div className="mt-7 grid gap-4 lg:grid-cols-2">
            {[1, 2, 3, 4].map((item) => (
              <div key={item} className="h-64 animate-pulse rounded-3xl border border-[#ded5ca] bg-white" />
            ))}
          </div>
        ) : uniquePodcasts.length === 0 ? (
          <ReviewEmptyState
            icon={Radio}
            title="Your shortlist is being prepared"
            body={`${brandName} is researching shows that fit you. Check back soon.`}
          />
        ) : sortedPodcasts.length === 0 ? (
          <ReviewEmptyState
            icon={Search}
            title="No podcasts found"
            body="No podcasts match your current filters. Try adjusting your criteria."
            actionLabel={hasActiveFilters(filters) ? 'Clear all filters' : undefined}
            onAction={() => setFilters(EMPTY_REVIEW_FILTERS)}
          />
        ) : (
          <>
            <div className="mt-7 grid gap-4 lg:grid-cols-2">
              {paginatedPodcasts.map((podcast) => (
                <ReviewCard
                  key={podcast.podcast_id}
                  podcast={podcast}
                  decision={feedbackMap.get(podcast.podcast_id)?.status ?? null}
                  disabled={isSavingFeedback}
                  onDecide={(status) => saveFeedback(podcast.podcast_id, status)}
                  onOpen={() => setSelectedPodcast(podcast)}
                />
              ))}
            </div>
            <ReviewPagination page={currentPage} totalPages={totalPages} onPageChange={setCurrentPage} />
          </>
        )}
      </section>

      {/* Proof sits between the shortlist and the call. Nothing chosen, nothing shown. */}
      {quotedTestimonials.length > 0 && (
        <section className="px-4 pb-2 pt-8 md:pt-10">
          <div className="mx-auto max-w-[1320px] rounded-[32px] bg-[#081a2b] px-6 py-12 text-[#f7fafc] md:px-10 md:py-16">
            <div className="mx-auto mb-11 max-w-[880px] text-center">
              <p
                className="font-mono text-[11px] uppercase tracking-[0.24em]"
                style={{ color: accentColor }}
              >
                You&rsquo;re in good company
              </p>
              <h2 className="mt-4 font-editorial text-3xl leading-[1.02] tracking-[-0.04em] sm:text-4xl md:text-5xl">
                People like you, already in the rooms that matter.
              </h2>
            </div>

            <div className="mx-auto grid max-w-[1152px] gap-5 md:grid-cols-2 xl:grid-cols-3">
              {quotedTestimonials.map((testimonial) => {
                const role = testimonialRole(testimonial)

                return (
                  <figure
                    key={testimonial.id}
                    className="flex flex-col rounded-[26px] border border-white/10 bg-white/5 p-7"
                  >
                    <Quote
                      className="mb-4 h-[22px] w-[22px] flex-shrink-0"
                      strokeWidth={1.8}
                      style={{ color: accentColor }}
                      aria-hidden="true"
                    />
                    <blockquote className="flex-1 text-base leading-7">
                      &ldquo;{testimonial.quote!.trim()}&rdquo;
                    </blockquote>
                    <figcaption className="mt-5 flex items-center gap-3">
                      <span
                        className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full font-editorial text-[15px] text-[#0d1b2a]"
                        style={{ background: accentColor }}
                        aria-hidden="true"
                      >
                        {testimonialInitials(testimonial.client_name)}
                      </span>
                      <span className="min-w-0">
                        <span className="block truncate text-sm font-semibold">
                          {testimonial.client_name}
                        </span>
                        {role && (
                          <span className="mt-0.5 block truncate text-[13px] text-[#d8c8b5]">{role}</span>
                        )}
                      </span>
                    </figcaption>
                  </figure>
                )
              })}
            </div>
          </div>
        </section>
      )}

      {/* Rendered for every dashboard. 'none' suppresses the button, not the section. */}
      <section className="px-4 py-12 md:py-16">
        <div className="container mx-auto">
          <div className="mx-auto grid gap-6 rounded-[32px] border border-[#0d1b2a]/8 bg-[#0d1b2a] px-6 py-8 text-white shadow-[0_20px_42px_rgba(13,27,42,0.16)] md:px-8 md:py-10 lg:grid-cols-[1fr_auto] lg:items-center">
            <div className="max-w-2xl">
              <p className="font-mono text-[11px] uppercase tracking-[0.24em] text-white/60">
                The no-pressure next step
              </p>
              <h2 className="mt-3 font-editorial text-4xl leading-[0.96] tracking-[-0.045em] sm:text-5xl">
                A short call, no pressure.
              </h2>
              <p className="mt-4 max-w-xl text-base leading-7 text-white/72">
                Bring your picks, or none at all. We will walk through which rooms to
                pitch first, what your angle would be, and what a realistic first month looks
                like. If it is not a fit, you leave with a sharper shortlist anyway.
              </p>
            </div>

            {dashboard.cta_type === 'none' ? (
              replyFallback('Reply to move forward')
            ) : dashboard.cta_url && (dashboard.cta_type === 'book_call' || dashboard.cta_type === 'learn_more') ? (
              <Button
                variant="secondary"
                size="xl"
                className="min-h-[52px] rounded-full bg-white px-7 text-[#0d1b2a] hover:bg-white/90"
                onClick={() => openExternalUrl(dashboard.cta_url!)}
              >
                {dashboard.cta_type === 'book_call' ? <Calendar className="mr-2 h-4 w-4" /> : <ExternalLink className="mr-2 h-4 w-4" />}
                {dashboard.cta_label}
              </Button>
            ) : bookingEmbedUrl ? null : bookingLink ? (
              // A booking link this build will not frame still gets a real
              // button, rather than being refused for not being Calendly.
              <Button
                variant="secondary"
                size="xl"
                className="min-h-[52px] rounded-full bg-white px-7 text-[#0d1b2a] hover:bg-white/90"
                onClick={() => openExternalUrl(bookingLink)}
              >
                <Calendar className="mr-2 h-4 w-4" />Book a call
              </Button>
            ) : (
              replyFallback(dashboard.cta_label || 'Reply to move forward')
            )}

            {bookingEmbedUrl && dashboard.cta_type !== 'none' && (
              // Under the copy and across the section, because a scheduler
              // beside a paragraph is too narrow to pick a time in.
              <div className="lg:col-span-2">
                <div className="overflow-hidden rounded-[22px] border border-white/14 bg-white">
                  <iframe
                    src={bookingEmbedUrl}
                    title={`Book a call${bookingProvider ? ` on ${bookingProvider}` : ''}`}
                    loading="lazy"
                    className="h-[640px] w-full border-0 sm:h-[700px]"
                    // Only what a scheduler needs: it may run and navigate
                    // itself, and nothing here can reach this page.
                    sandbox="allow-scripts allow-same-origin allow-forms allow-popups allow-popups-to-escape-sandbox"
                  />
                </div>
                <p className="mt-3 text-sm text-white/60">
                  Trouble loading?{' '}
                  <button
                    type="button"
                    onClick={() => openExternalUrl(bookingLink!)}
                    className="font-semibold text-white underline underline-offset-4"
                  >
                    Open the scheduler in a new tab
                  </button>
                  .
                </p>
              </div>
            )}
          </div>
        </div>
      </section>

      {/* The FAQ is the agency's, not ours: it answers the page and promises nothing. */}
      <section className="px-4 pb-10 pt-2 md:pb-14">
        <div
          className="mx-auto max-w-[1320px] rounded-[32px] border border-[#0d1b2a]/8 bg-white/84 px-6 py-8 text-[#0d1b2a] shadow-[0_20px_42px_rgba(13,27,42,0.08)] backdrop-blur-[4px] md:px-10 md:py-9"
          style={{ '--faq-chevron': accentColor } as CSSProperties}
        >
          <div className="grid gap-8 lg:grid-cols-[0.36fr_0.64fr] lg:items-start lg:gap-10">
            <div>
              <p className="font-mono text-[11px] uppercase tracking-[0.24em] text-[#7a6554]">
                Before you decide
              </p>
              <h3 className="mt-3 font-editorial text-3xl leading-[1.05] tracking-[-0.03em] sm:text-[34px]">
                The questions everyone asks first.
              </h3>
            </div>

            <div className="min-w-0">
              <Accordion type="single" collapsible className="w-full">
                {prospectFaqs.map((faq, index) => (
                  <AccordionItem
                    key={faq.question}
                    value={`faq-${index}`}
                    className="border-[#0d1b2a]/8"
                  >
                    <AccordionTrigger className="gap-3 py-4 text-left text-[15.5px] font-medium text-[#0d1b2a] hover:no-underline [&>svg]:h-[18px] [&>svg]:w-[18px] [&>svg]:text-[var(--faq-chevron)]">
                      {faq.question}
                    </AccordionTrigger>
                    <AccordionContent className="pr-8 text-[14.5px] leading-6 text-[#4c5d73]">
                      {faq.answer}
                    </AccordionContent>
                  </AccordionItem>
                ))}
              </Accordion>
            </div>
          </div>
        </div>
      </section>

      <footer className="border-t border-[#0d1b2a]/8 bg-white/40 backdrop-blur-sm">
        <div className="mx-auto flex max-w-6xl flex-col items-center justify-center gap-3 px-4 py-4 text-center sm:flex-row sm:gap-6 sm:px-6 sm:py-6 lg:px-8">
          <p className="text-xs text-[#5d7188] sm:text-sm">
            Prepared by <span className="font-semibold text-[#0d1b2a]">{workspaceBrand?.brand_name?.trim() || 'your booking team'}</span>
          </p>
          <button type="button" onClick={() => setShowTutorial(true)} className="min-h-10 text-xs text-[#5d7188] hover:text-[#0d1b2a] sm:text-sm">
            How it works
          </button>
        </div>
      </footer>

      <AudienceEstimatesSheet open={showReviewPanel} onOpenChange={setShowReviewPanel} />

      <ShowProfileSheet
        open={selectedPodcast !== null}
        onOpenChange={(open) => { if (!open) setSelectedPodcast(null) }}
        podcast={selectedPodcast}
        feedback={selectedPodcast ? feedbackMap.get(selectedPodcast.podcast_id) : undefined}
        fitAnalysis={selectedPodcast ? fitAnalysisFor(selectedPodcast) : null}
        notes={currentNotes}
        onNotesChange={setCurrentNotes}
        onSaveNote={() => {
          if (!selectedPodcast) return
          saveFeedback(selectedPodcast.podcast_id, feedbackMap.get(selectedPodcast.podcast_id)?.status || null, currentNotes)
        }}
        isSaving={isSavingFeedback}
        onDecide={(status) => {
          if (!selectedPodcast) return
          saveFeedback(selectedPodcast.podcast_id, status)
        }}
      />

      <FocusedReview
        open={focusedQueue !== null}
        queue={focusedQueue ?? []}
        feedback={feedbackMap}
        label="Your shortlist"
        recipientName={dashboard.prospect_name}
        isSaving={isSavingFeedback}
        onDecide={(podcast, status) => saveFeedback(podcast.podcast_id, status)}
        onExit={exitFocusedReview}
        onOpenProfile={(podcast) => {
          setFocusedQueue(null)
          setSelectedPodcast(podcast)
        }}
      />

      {/* Help button, fixed. The walkthrough never opens on its own. */}
      <button
        type="button"
        onClick={() => setShowTutorial(true)}
        className="fixed bottom-4 right-4 z-40 flex h-10 w-10 items-center justify-center rounded-full text-white shadow-lg transition-all hover:scale-105 sm:bottom-6 sm:right-6 sm:h-12 sm:w-12"
        style={{ backgroundColor: primaryColor, color: primaryTextColor }}
        aria-label="How to use this dashboard"
        title="How to use this dashboard"
      >
        <HelpCircle className="h-5 w-5 sm:h-6 sm:w-6" />
      </button>

      <ReviewTutorial open={showTutorial} onOpenChange={setShowTutorial} brandName={brandName} />

      {/* Loom Video Modal */}
      {loomEmbedUrl && (
        <Dialog
          open={showLoomVideo}
          onOpenChange={(open) => {
            setShowLoomVideo(open)
            if (open) {
              setLoomVideoLoading(true)
            }
          }}
        >
          <DialogContent className="max-w-4xl w-full p-0">
            <DialogTitle className="sr-only">Personal video message</DialogTitle>
            <div className="relative w-full" style={{ paddingBottom: '56.25%' }}>
              {loomVideoLoading && (
                <div className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-3 rounded-lg bg-[#f6f9fc]">
                  <Loader2 className="h-12 w-12 animate-spin text-[#0d1b2a]" />
                  <p className="text-sm text-muted-foreground">Loading your video...</p>
                </div>
              )}
              <iframe
                src={loomEmbedUrl}
                frameBorder="0"
                allowFullScreen
                className="absolute top-0 left-0 w-full h-full rounded-lg"
                allow="autoplay; fullscreen; picture-in-picture"
                referrerPolicy="no-referrer"
                sandbox="allow-scripts allow-same-origin allow-presentation"
                onLoad={() => setLoomVideoLoading(false)}
              />
            </div>
          </DialogContent>
        </Dialog>
      )}
    </main>
    </ReviewBrandContext.Provider>
  )
}
