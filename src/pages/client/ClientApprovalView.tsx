import { useState, useEffect } from 'react'
import { useParams, useSearchParams } from 'react-router-dom'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import confetti from 'canvas-confetti'
import {
  Mic,
  Star,
  FileText,
  Sparkles,
  Target,
  Radio,
  X,
  Search,
  ThumbsUp,
  HelpCircle,
  Info,
  Library,
  Play,
  Send,
  CalendarCheck,
  Share2,
  ArrowRight,
  WandSparkles,
  ArrowLeft,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { toast } from 'sonner'
import PageSEO from '@/components/seo/PageSEO'
import { openExternalUrl } from '@/lib/externalUrl'
import { onboardingWorkspaceInitials } from '@/lib/onboardingBrand'
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
import { ReviewBrandContext, reviewBrandFrom, reviewBrandStyle } from '@/components/review/reviewBrand'
import {
  EMPTY_REVIEW_FILTERS,
  collectReviewCategories,
  filterReviewPodcasts,
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

export default function ClientApprovalView() {
  return <ClientApprovalViewContent />
}

interface ClientDashboard {
  id: string
  name: string
  bio: string | null
  photo_url: string | null
  media_kit_url: string | null
  dashboard_tagline: string | null
  dashboard_view_count: number
  dashboard_last_viewed_at: string | null
  workspace?: {
    name?: string | null
    logo_url?: string | null
    primary_color?: string | null
    accent_color?: string | null
  } | null
}

interface PodcastFeedback {
  id: string
  client_id: string
  podcast_id: string
  podcast_name: string | null
  status: ReviewStatus
  notes: string | null
  created_at: string
  updated_at: string
}

type DashboardView = 'top' | 'all' | 'picks'

const SHORTLIST_GOAL = 10
const TOP_MATCH_COUNT = 12

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY

const VIEW_LABELS: Record<DashboardView, string> = {
  top: 'Top matches',
  all: 'Explore all',
  picks: 'My picks',
}

const RATE_LIMITED_MESSAGE = 'You are saving choices faster than we can record them. Wait a few minutes, then try again.'

async function invokePublicClientDashboard<T>(body: Record<string, unknown>): Promise<T> {
  const response = await fetch(`${SUPABASE_URL}/functions/v1/public-client-dashboard`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'apikey': SUPABASE_ANON_KEY,
    },
    body: JSON.stringify({ ...body, hostname: currentHostname() }),
  })
  const payload = await response.json().catch(() => ({})) as { error?: string }
  if (response.status === 429) {
    // Throttled: the server's message says to wait; keep a readable fallback
    // in case the body did not survive the trip.
    throw new Error(payload.error || RATE_LIMITED_MESSAGE)
  }
  if (!response.ok) throw new Error(payload.error || 'Dashboard request failed')
  return payload as T
}

function decodePodcastEntities(value: string | null | undefined) {
  if (!value) return value
  return value
    .replace(/&amp;/giu, '&')
    .replace(/&quot;/giu, '"')
    .replace(/&#0*39;|&apos;/giu, "'")
    .replace(/&lt;/giu, '<')
    .replace(/&gt;/giu, '>')
    .replace(/&#x([0-9a-f]+);/giu, (entity, codePoint: string) => {
      const value = Number.parseInt(codePoint, 16)
      return Number.isSafeInteger(value) && value <= 0x10ffff ? String.fromCodePoint(value) : entity
    })
    .replace(/&#([0-9]+);/gu, (entity, codePoint: string) => {
      const value = Number.parseInt(codePoint, 10)
      return Number.isSafeInteger(value) && value <= 0x10ffff ? String.fromCodePoint(value) : entity
    })
}

function ClientApprovalViewContent() {
  const { slug } = useParams<{ slug: string }>()
  const [searchParams] = useSearchParams()
  const forceTour = searchParams.get('tour') === '1'
  const isAdminPreview = searchParams.get('preview') === '1'
  // Opened from the portal dashboard, so a way back belongs in the header.
  const fromPortal = searchParams.get('from') === 'portal'
  const queryClient = useQueryClient()

  // UI state
  const [filters, setFilters] = useState<ReviewFilterState>(EMPTY_REVIEW_FILTERS)
  const debouncedSearch = useDebouncedValue(filters.search)
  const [dashboardView, setDashboardView] = useState<DashboardView>('top')
  const [focusedQueue, setFocusedQueue] = useState<ReviewPodcast[] | null>(null)
  const [brandLogoUnavailable, setBrandLogoUnavailable] = useState(false)
  const [currentPage, setCurrentPage] = useState(1)

  // Show profile state
  const [selectedPodcast, setSelectedPodcast] = useState<ReviewPodcast | null>(null)
  const [currentNotes, setCurrentNotes] = useState('')
  const [isSavingFeedback, setIsSavingFeedback] = useState(false)

  const [showTutorial, setShowTutorial] = useState(false)
  const [showReviewPanel, setShowReviewPanel] = useState(false)

  // React Query: Fetch dashboard (cached for 5 minutes)
  const { data: dashboard, isLoading: dashboardLoading, error: dashboardError } = useQuery({
    queryKey: ['client-dashboard', slug],
    queryFn: async () => {
      if (!slug) throw new Error('Invalid dashboard link')

      const data = await invokePublicClientDashboard<{ dashboard: ClientDashboard }>({
        action: 'get',
        slug,
      })
      return data.dashboard
    },
    staleTime: 5 * 60 * 1000, // Cache for 5 minutes
    enabled: !!slug,
  })

  // React Query: Fetch podcasts (enabled when dashboard is ready)
  const { data: podcasts = [], isLoading: podcastsLoading, error: podcastsError, refetch: refetchPodcasts } = useQuery({
    queryKey: ['client-podcasts', dashboard?.id],
    queryFn: async () => {
      if (!dashboard?.id || !slug) return []

      const response = await fetch(`${SUPABASE_URL}/functions/v1/get-client-podcasts`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'apikey': SUPABASE_ANON_KEY,
        },
        body: JSON.stringify({
          clientId: dashboard?.id,
          clientName: dashboard?.name,
          clientBio: dashboard?.bio,
          dashboardSlug: slug,
          cacheOnly: true,
        }),
      })

      if (!response.ok) {
        const payload = await response.json().catch(() => ({})) as { error?: string }
        throw new Error(payload.error || 'Podcasts could not be loaded')
      }
      const data = await response.json()
      return (data.podcasts || []).map((podcast: ReviewPodcast) => ({
        ...podcast,
        podcast_name: decodePodcastEntities(podcast.podcast_name) || podcast.podcast_name,
        publisher_name: decodePodcastEntities(podcast.publisher_name),
        podcast_description: decodePodcastEntities(podcast.podcast_description),
        ai_clean_description: decodePodcastEntities(podcast.ai_clean_description),
      })) as ReviewPodcast[]
    },
    staleTime: 5 * 60 * 1000, // Cache for 5 minutes
    enabled: !!dashboard?.id && !!slug,
  })

  // React Query: Fetch feedback (refreshes more often)
  const { data: feedbackData = [], error: feedbackError, refetch: refetchFeedback } = useQuery({
    queryKey: ['client-feedback', dashboard?.id],
    queryFn: async () => {
      if (!dashboard?.id || !slug) return []
      const data = await invokePublicClientDashboard<{ feedback: PodcastFeedback[] }>({
        action: 'feedback_list',
        slug,
      })
      return data.feedback || []
    },
    staleTime: 30 * 1000, // 30 seconds - feedback changes more often
    enabled: !!dashboard?.id,
  })

  // Build feedback map from query data
  const feedbackMap = new Map<string, PodcastFeedback>(
    feedbackData.map((fb: PodcastFeedback) => [fb.podcast_id, fb])
  )
  // "Choose 10" on a list of six is a goal nobody can reach; the first batch
  // is ten or the whole list, whichever is smaller.
  const shortlistGoal = Math.max(1, Math.min(SHORTLIST_GOAL, new Set(podcasts.map((podcast) => podcast.podcast_id)).size))
  const selectedFeedbackNotes = selectedPodcast
    ? feedbackMap.get(selectedPodcast.podcast_id)?.notes || ''
    : ''

  // Derived state
  const loading = dashboardLoading
  const loadingPodcasts = podcastsLoading
  // Only the dashboard itself can take over the page. A podcast or feedback
  // query that fails is shown in place, with a way to retry. Losing the whole
  // page because a secondary list failed leaves the client staring at a red
  // card about a page that actually loaded.
  const error = dashboardError?.message || null
  const secondaryError = podcastsError?.message || feedbackError?.message || null
  const secondaryErrorMessage = podcastsError
    ? 'Your shows could not be loaded just now. Everything you have already approved is safe.'
    : 'Your choices could not be loaded just now. They are saved; the page just could not read them back.'
  const retrySecondary = () => {
    if (podcastsError) void refetchPodcasts()
    if (feedbackError) void refetchFeedback()
  }

  // Reset to page 1 when filters change
  useEffect(() => {
    setCurrentPage(1)
  }, [filters, debouncedSearch, dashboardView])

  useEffect(() => {
    setBrandLogoUnavailable(false)
  }, [dashboard?.workspace?.logo_url])

  // The page explains itself. The walkthrough stays a tap away under "How it
  // works" and opens on ?tour=1, but it never interrupts a first visit.
  useEffect(() => {
    if (!dashboard || loading || isAdminPreview || !forceTour) return
    const timer = setTimeout(() => setShowTutorial(true), 500)
    return () => clearTimeout(timer)
  }, [dashboard, loading, forceTour, isAdminPreview])

  // Load existing notes when podcast is selected
  useEffect(() => {
    setCurrentNotes(selectedPodcast ? selectedFeedbackNotes : '')
  }, [selectedFeedbackNotes, selectedPodcast])

  // One burst when the first batch is complete, and none for anyone who has
  // asked their device for less motion.
  const triggerConfetti = () => {
    if (typeof window.matchMedia === 'function' && window.matchMedia('(prefers-reduced-motion: reduce)')?.matches) return
    const count = 200
    const defaults = {
      origin: { y: 0.7 },
      zIndex: 9999,
    }

    function fire(particleRatio: number, opts: confetti.Options) {
      confetti({
        ...defaults,
        ...opts,
        particleCount: Math.floor(count * particleRatio),
      })
    }

    fire(0.25, { spread: 26, startVelocity: 55 })
    fire(0.2, { spread: 60 })
    fire(0.35, { spread: 100, decay: 0.91, scalar: 0.8 })
    fire(0.1, { spread: 120, startVelocity: 25, decay: 0.92, scalar: 1.2 })
    fire(0.1, { spread: 120, startVelocity: 45 })
  }

  // Save feedback (approve/reject/notes)
  const saveFeedback = async (podcastId: string, status: ReviewStatus, notes?: string, podcastName?: string) => {
    if (!dashboard) return false

    // An admin previewing the page must not write feedback or trigger the client's nudge email.
    if (isAdminPreview) {
      toast.info('Preview only. Choices are not saved.')
      return true
    }

    // Check if this is a new approval (not already approved)
    const existingFeedback = feedbackMap.get(podcastId)
    const isNewApproval = status === 'approved' && existingFeedback?.status !== 'approved'
    const approvedBefore = Array.from(feedbackMap.values()).filter((feedback) => feedback.status === 'approved').length

    setIsSavingFeedback(true)
    try {
      if (!slug) throw new Error('Dashboard link is invalid')
      const feedbackData = {
        action: 'feedback_upsert',
        slug,
        podcast_id: podcastId,
        podcast_name: podcastName || selectedPodcast?.podcast_name || null,
        status,
        notes: notes !== undefined ? notes : (selectedPodcast?.podcast_id === podcastId && currentNotes.trim() ? currentNotes : (feedbackMap.get(podcastId)?.notes ?? null)),
      }

      const response = await invokePublicClientDashboard<{ feedback: PodcastFeedback }>(feedbackData)

      queryClient.setQueryData<PodcastFeedback[]>(['client-feedback', dashboard.id], (current = []) => {
        const next = current.filter((feedback) => feedback.podcast_id !== podcastId)
        return [...next, response.feedback]
      })

      // Invalidate feedback cache to refresh the data
      queryClient.invalidateQueries({ queryKey: ['client-feedback', dashboard.id] })

      // Celebrate the meaningful milestone, not every individual click.
      if (isNewApproval && approvedBefore < shortlistGoal && approvedBefore + 1 >= shortlistGoal) {
        triggerConfetti()
      }
      return true
    } catch (err) {
      console.error('Error saving feedback:', err)
      toast.error(err instanceof Error ? err.message : 'Feedback could not be saved.')
      return false
    } finally {
      setIsSavingFeedback(false)
    }
  }

  // Loading state - show skeleton UI for snappier feel
  if (loading) {
    return (
      <div className="min-h-screen bg-[#f6f1e9]">
        <div className="relative overflow-hidden bg-[#0d1b2a]">
          <div className="relative mx-auto max-w-6xl px-4 py-6 sm:px-6 sm:py-10 lg:px-8">
            <div className="space-y-4 text-center">
              <div className="mx-auto h-8 w-48 animate-pulse rounded-full bg-white/10" />
              <div className="mx-auto h-10 w-80 animate-pulse rounded-lg bg-white/10" />
              <div className="mx-auto h-6 w-96 animate-pulse rounded-lg bg-white/5" />
              <div className="flex justify-center gap-6 pt-4">
                <div className="h-8 w-24 animate-pulse rounded-lg bg-white/10" />
                <div className="h-8 w-24 animate-pulse rounded-lg bg-white/10" />
              </div>
            </div>
          </div>
        </div>

        <div className="mx-auto max-w-6xl px-4 py-6 sm:px-6 lg:px-8">
          <div className="mb-6 h-12 w-full max-w-md animate-pulse rounded-xl bg-white shadow-sm" />
          <div className="mb-6 flex gap-2">
            {[1, 2, 3].map((item) => (
              <div key={item} className="h-9 w-24 animate-pulse rounded-full bg-white" />
            ))}
          </div>
          <div className="grid gap-4 lg:grid-cols-2">
            {[1, 2, 3, 4].map((item) => (
              <div key={item} className="h-64 animate-pulse rounded-3xl border border-[#ded5ca] bg-white" />
            ))}
          </div>
        </div>
      </div>
    )
  }

  // Error state
  if (error || !dashboard) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#f6f1e9] p-4">
        <Card className="w-full max-w-md border-0 shadow-xl">
          <CardContent className="space-y-4 pb-8 pt-8 text-center">
            <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-red-100">
              <X className="h-8 w-8 text-red-600" />
            </div>
            <div className="space-y-2">
              <h2 className="text-xl font-semibold">Dashboard not available</h2>
              <p className="text-muted-foreground">{error || 'This dashboard could not be found.'}</p>
            </div>
            <Button variant="outline" onClick={() => window.location.reload()}>Try again</Button>
          </CardContent>
        </Card>
      </div>
    )
  }

  const brandName = dashboard.workspace?.name?.trim() || 'Your podcast team'
  const brandLogoUrl = dashboard.workspace?.logo_url && !brandLogoUnavailable
    ? dashboard.workspace.logo_url
    : null
  const brand = reviewBrandFrom(dashboard.workspace?.primary_color, dashboard.workspace?.accent_color)
  const campaignStyle = reviewBrandStyle(brand)
  const personalizedTagline = dashboard.dashboard_tagline || null

  // Keep the public experience grounded in the curated database order and
  // remove accidental duplicates before calculating any visible totals.
  const uniquePodcasts = uniqueReviewPodcasts(podcasts)

  const totalReach = uniquePodcasts.reduce((sum, podcast) => sum + (podcast.audience_size || 0), 0)
  const ratings = uniquePodcasts.filter((podcast) => podcast.itunes_rating).map((podcast) => podcast.itunes_rating!)
  const avgRating = ratings.length > 0 ? ratings.reduce((sum, rating) => sum + rating, 0) / ratings.length : 0

  const topMatches = [...uniquePodcasts]
    .sort((left, right) => {
      if (Boolean(left.is_featured) !== Boolean(right.is_featured)) return left.is_featured ? -1 : 1
      if ((left.featured_order ?? 999) !== (right.featured_order ?? 999)) {
        return (left.featured_order ?? 999) - (right.featured_order ?? 999)
      }
      const leftHasFit = Boolean(left.ai_fit_reasons?.length)
      const rightHasFit = Boolean(right.ai_fit_reasons?.length)
      if (leftHasFit !== rightHasFit) return leftHasFit ? -1 : 1
      if ((left.display_order ?? 9999) !== (right.display_order ?? 9999)) {
        return (left.display_order ?? 9999) - (right.display_order ?? 9999)
      }
      return (right.audience_size || 0) - (left.audience_size || 0)
    })
    .slice(0, TOP_MATCH_COUNT)

  const allCategories = collectReviewCategories(uniquePodcasts)
  const counts = reviewCounts(uniquePodcasts, feedbackMap)
  const approvedPodcasts = uniquePodcasts.filter((podcast) => feedbackMap.get(podcast.podcast_id)?.status === 'approved')
  const reviewedTopMatches = topMatches.filter((podcast) => Boolean(feedbackMap.get(podcast.podcast_id)?.status)).length
  const firstBatchApproved = Math.min(counts.interested, shortlistGoal)
  const shortlistProgress = Math.min(100, Math.round((firstBatchApproved / shortlistGoal) * 100))
  // Nothing left to decide, or the first batch is full: either way the work
  // here is done and the page should say so, in place, rather than in a toast
  // that is gone by the time anyone wonders what happens next.
  const reviewComplete = uniquePodcasts.length > 0
    && (counts.toReview === 0 || firstBatchApproved >= shortlistGoal)
  const viewPodcasts = dashboardView === 'top'
    ? topMatches
    : dashboardView === 'picks'
      ? approvedPodcasts
      : uniquePodcasts

  const sortedPodcasts = filterReviewPodcasts(viewPodcasts, { ...filters, search: debouncedSearch }, feedbackMap)

  // Pagination
  const totalPages = Math.ceil(sortedPodcasts.length / REVIEW_CARDS_PER_PAGE)
  const startIndex = (currentPage - 1) * REVIEW_CARDS_PER_PAGE
  const paginatedPodcasts = sortedPodcasts.slice(startIndex, startIndex + REVIEW_CARDS_PER_PAGE)
  const focusedReviewViewLabel = VIEW_LABELS[dashboardView]

  const clearFilters = () => setFilters(EMPTY_REVIEW_FILTERS)

  const startFocusedReview = () => {
    if (sortedPodcasts.length === 0) return
    setFocusedQueue(sortedPodcasts)
  }

  const exitFocusedReview = (reason: 'complete' | 'dismiss') => {
    setFocusedQueue(null)
    // The done card at the top of the list says what happens next, so the
    // dialog just closes and leaves the reader there.
    if (reason === 'complete') document.getElementById('podcast-shortlist')?.scrollIntoView?.({ behavior: 'smooth' })
  }

  const showPicks = () => {
    setDashboardView('picks')
    document.getElementById('podcast-shortlist')?.scrollIntoView({ behavior: 'smooth' })
  }

  const openTutorial = () => setShowTutorial(true)

  const shareDashboard = async () => {
    const shareData = {
      title: `${dashboard.name}'s podcast opportunities`,
      text: `A curated podcast shortlist prepared for ${dashboard.name}.`,
      url: window.location.href,
    }

    try {
      if (navigator.share) {
        await navigator.share(shareData)
        return
      }
      await navigator.clipboard.writeText(shareData.url)
      toast.success('Share link copied')
    } catch (shareError) {
      if (shareError instanceof DOMException && shareError.name === 'AbortError') return
      toast.error('The link could not be shared. Copy it from your address bar instead.')
    }
  }

  return (
    <ReviewBrandContext.Provider value={brand}>
    <div className="min-h-screen bg-[#f6f1e9] text-[#102033]" style={campaignStyle}>
      <PageSEO
        title={dashboard.name + "'s podcast opportunities | " + brandName}
        description={"A curated podcast shortlist prepared for " + dashboard.name + ". Review the best-fit shows and choose where you would like to be featured."}
        path={"/client/" + (slug || '') + (isAdminPreview ? '?preview=1' : '')}
        image="/client-dashboard-share.png"
        imageAlt={"A curated podcast campaign prepared by " + brandName}
        noindex
        whiteLabel
        brandName={brandName}
        favicon={brandLogoUrl}
        themeColor={brand.primary}
      />

      <header
        className="relative overflow-hidden text-white"
        style={{ background: `linear-gradient(rgba(7,18,31,.58), rgba(7,18,31,.72)), ${brand.primary}` }}
      >
        <div
          className="absolute inset-0 opacity-70"
          style={{ background: `radial-gradient(circle at 84% 10%, ${brand.accent}55, transparent 30%), radial-gradient(circle at 8% 100%, ${brand.primary}66, transparent 33%)` }}
        />
        <div className="absolute inset-0 opacity-[0.06] [background-image:radial-gradient(#fff_0.7px,transparent_0.7px)] [background-size:7px_7px]" />

        <div className="relative mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <nav className="flex min-h-16 items-center justify-between border-b border-white/10 py-3" aria-label="Client dashboard">
            <div className="flex items-center gap-3">
              <span className={cn('flex h-10 items-center justify-center rounded-xl bg-white shadow-sm', brandLogoUrl ? 'w-16 px-2' : 'w-10')}>
                {brandLogoUrl ? (
                  <img
                    src={brandLogoUrl}
                    alt={`${brandName} logo`}
                    className="max-h-7 max-w-full object-contain"
                    onError={() => setBrandLogoUnavailable(true)}
                  />
                ) : (
                  <span className="text-xs font-black" style={{ color: brand.primary }}>{onboardingWorkspaceInitials(brandName)}</span>
                )}
              </span>
              <div>
                <p className="font-editorial text-lg leading-none">{brandName}</p>
                <p className="mt-1 text-[10px] uppercase tracking-[0.2em] text-white/50">Private campaign</p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              {isAdminPreview ? (
                <span className="hidden rounded-full border border-white/20 bg-white/10 px-3 py-1.5 text-xs font-semibold text-white/80 sm:inline-flex">
                  Share preview
                </span>
              ) : null}
              {fromPortal ? (
                <Button
                  asChild
                  variant="ghost"
                  size="sm"
                  className="min-h-11 gap-2 text-white/70 hover:bg-white/10 hover:text-white"
                >
                  <a href="/portal/dashboard">
                    <ArrowLeft className="h-4 w-4" />
                    Back to your portal
                  </a>
                </Button>
              ) : null}
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={openTutorial}
                className="hidden min-h-11 gap-2 text-white/70 hover:bg-white/10 hover:text-white sm:inline-flex"
              >
                <HelpCircle className="h-4 w-4" />
                How it works
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={shareDashboard}
                className="min-h-11 gap-2 border-white/20 bg-white/5 text-white hover:bg-white/10 hover:text-white"
              >
                <Share2 className="h-4 w-4" />
                <span className="hidden sm:inline">Share</span>
              </Button>
            </div>
          </nav>

          <div className="grid gap-8 py-9 sm:py-12 lg:grid-cols-[minmax(0,1fr)_360px] lg:items-center lg:gap-14 lg:py-16">
            <div>
              <div className="mb-5 flex items-center gap-4">
                {dashboard.photo_url ? (
                  <img
                    src={dashboard.photo_url}
                    alt={dashboard.name}
                    className="h-16 w-16 rounded-2xl border border-white/20 object-cover shadow-2xl sm:h-20 sm:w-20"
                  />
                ) : (
                  <div className="flex h-16 w-16 items-center justify-center rounded-2xl border border-white/20 bg-white/10 sm:h-20 sm:w-20">
                    <Mic className="h-8 w-8 text-[var(--campaign-accent)]" />
                  </div>
                )}
                <div>
                  <p className="section-kicker !text-[var(--campaign-accent)]">Prepared for {dashboard.name}</p>
                  <p className="mt-1 text-sm text-white/55">Your private podcast campaign</p>
                </div>
              </div>

              <h1 className="max-w-3xl font-editorial text-4xl leading-[1.02] tracking-[-0.035em] text-white sm:text-5xl lg:text-6xl">
                The right rooms for your next big ideas.
              </h1>
              <p className="mt-5 max-w-2xl text-base leading-7 text-white/68 sm:text-lg">
                {personalizedTagline || `${brandName} matched your expertise with active podcasts whose listeners are likely to care about what you have to say.`}
              </p>

              <div className="mt-7 flex flex-col gap-3 sm:flex-row">
                <Button
                  type="button"
                  size="lg"
                  onClick={startFocusedReview}
                  disabled={sortedPodcasts.length === 0}
                  className="min-h-12 gap-2 rounded-full bg-[var(--campaign-accent)] px-6 font-semibold text-[var(--campaign-accent-foreground)] shadow-[0_12px_36px_rgba(0,0,0,.2)] hover:brightness-95"
                >
                  <Play className="h-4 w-4 fill-current" />
                  Start focused review
                </Button>
                <Button
                  type="button"
                  size="lg"
                  variant="outline"
                  onClick={showPicks}
                  className="min-h-12 gap-2 rounded-full border-white/20 bg-white/5 px-6 text-white hover:bg-white/10 hover:text-white"
                >
                  <ThumbsUp className="h-4 w-4" />
                  View my picks
                  {counts.interested > 0 ? <span className="rounded-full bg-white/15 px-2 py-0.5 text-xs">{counts.interested}</span> : null}
                </Button>
                {dashboard.media_kit_url ? (
                  <Button
                    type="button"
                    size="lg"
                    variant="ghost"
                    onClick={() => openExternalUrl(dashboard.media_kit_url!)}
                    className="min-h-12 gap-2 rounded-full px-5 text-white/65 hover:bg-white/10 hover:text-white"
                  >
                    <FileText className="h-4 w-4" />
                    See how hosts see me
                  </Button>
                ) : null}
              </div>

              <dl className="mt-9 grid max-w-2xl grid-cols-3 divide-x divide-white/10 rounded-2xl border border-white/10 bg-white/[0.04] py-4">
                <div className="px-3 sm:px-5">
                  <dt className="text-[10px] uppercase tracking-[0.14em] text-white/45 sm:text-xs">Est. combined reach</dt>
                  <dd className="mt-1 font-editorial text-2xl text-white sm:text-3xl">{formatListeners(totalReach)}</dd>
                </div>
                <div className="px-3 sm:px-5">
                  <dt className="text-[10px] uppercase tracking-[0.14em] text-white/45 sm:text-xs">Avg. Apple rating</dt>
                  <dd className="mt-1 flex items-center gap-1.5 font-editorial text-2xl text-white sm:text-3xl">
                    {avgRating > 0 ? avgRating.toFixed(1) : '-'}
                    {avgRating > 0 ? <Star className="h-4 w-4 fill-[var(--campaign-accent)] text-[var(--campaign-accent)]" /> : null}
                  </dd>
                </div>
                <div className="px-3 sm:px-5">
                  <dt className="text-[10px] uppercase tracking-[0.14em] text-white/45 sm:text-xs">Curated matches</dt>
                  <dd className="mt-1 font-editorial text-2xl text-white sm:text-3xl">{uniquePodcasts.length}</dd>
                </div>
              </dl>
              <button
                type="button"
                onClick={() => setShowReviewPanel(true)}
                className="mt-3 inline-flex min-h-10 items-center gap-1.5 text-xs text-white/48 transition hover:text-white/80"
              >
                <Info className="h-3.5 w-3.5" />
                How audience estimates work
              </button>
            </div>

            <aside className="rounded-[28px] border border-white/10 bg-white/[0.075] p-5 shadow-2xl backdrop-blur-md sm:p-6" aria-label="First shortlist goal">
              <div className="flex items-start justify-between">
                <div>
                  <p className="section-kicker !text-[var(--campaign-accent)]">Your first batch</p>
                  <h2 className="mt-2 font-editorial text-3xl text-white">Choose {shortlistGoal} shows</h2>
                </div>
                <span className="flex h-11 w-11 items-center justify-center rounded-full bg-[#789486]/20 text-[#b8d0c4]">
                  <Target className="h-5 w-5" />
                </span>
              </div>
              <p className="mt-3 text-sm leading-6 text-white/58">
                Start with the shows you would genuinely enjoy. Your choices help us sharpen every pitch that follows.
              </p>
              <div className="mt-6 flex items-end justify-between">
                <div>
                  <span className="font-editorial text-5xl text-white">{firstBatchApproved}</span>
                  <span className="ml-1 text-lg text-white/40">/ {shortlistGoal}</span>
                </div>
                <span className="pb-1 text-sm font-semibold text-[#b8d0c4]">
                  {Math.max(0, shortlistGoal - firstBatchApproved)} to go
                </span>
              </div>
              <div className="mt-3 h-2 overflow-hidden rounded-full bg-white/10">
                <div
                  className="h-full rounded-full bg-gradient-to-r from-[#789486] to-[var(--campaign-accent)] transition-all duration-500"
                  style={{ width: shortlistProgress + '%' }}
                />
              </div>
              <div className="mt-5 flex items-center justify-between border-t border-white/10 pt-4 text-xs text-white/48">
                <span>{reviewedTopMatches} of {topMatches.length} top matches reviewed</span>
                {counts.notAFit > 0 ? <span>{counts.notAFit} not a fit</span> : null}
              </div>
            </aside>
          </div>

          <div className="grid grid-cols-2 border-t border-white/10 sm:grid-cols-4">
            {[
              { icon: ThumbsUp, label: 'Choose shows', detail: 'You stay in control' },
              { icon: Send, label: 'Your team pitches hosts', detail: 'Personalized outreach' },
              { icon: CalendarCheck, label: 'Approve dates', detail: 'No calendar chaos' },
              { icon: Radio, label: 'Episodes go live', detail: 'Track every result' },
            ].map((step, index) => (
              <div key={step.label} className={cn('flex gap-3 px-3 py-5 sm:px-5', index > 0 && 'border-l border-white/10')}>
                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-white/8 text-[var(--campaign-accent)]">
                  <step.icon className="h-4 w-4" />
                </span>
                <div>
                  <p className="text-sm font-semibold text-white">{step.label}</p>
                  <p className="mt-0.5 hidden text-xs text-white/40 lg:block">{step.detail}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </header>

      {isAdminPreview ? (
        <div role="status" className="border-b border-amber-200 bg-amber-50 px-4 py-2 text-center text-sm text-amber-900">
          Admin preview. Choices made here are not saved and the client is not notified.
        </div>
      ) : null}

      <main id="podcast-shortlist" className="mx-auto max-w-7xl px-4 py-10 sm:px-6 sm:py-14 lg:px-8">
        <section aria-labelledby="shortlist-heading">
          <div className="flex flex-col justify-between gap-5 md:flex-row md:items-end">
            <div>
              <p className="section-kicker text-[var(--campaign-accent)]">Curated for your voice</p>
              <h2 id="shortlist-heading" className="mt-2 font-editorial text-3xl tracking-tight text-[#102033] sm:text-4xl">
                {dashboardView === 'top' ? 'Start with your strongest matches' : dashboardView === 'picks' ? 'Shows you are interested in' : 'Explore every opportunity'}
              </h2>
              <p className="mt-2 max-w-2xl text-sm leading-6 text-[#5f6b76] sm:text-base">
                {dashboardView === 'top'
                  ? 'A focused first pass, ordered around relevance and the quality of the opportunity.'
                  : dashboardView === 'picks'
                    ? 'Your positive choices in one place. These become the starting point for outreach.'
                    : 'Search the complete curated library when you want to go beyond the recommended first batch.'}
              </p>
            </div>
            <Button
              type="button"
              onClick={startFocusedReview}
              disabled={sortedPodcasts.length === 0}
              className="min-h-11 shrink-0 gap-2 rounded-full bg-[var(--campaign-primary)] px-5 text-[var(--campaign-primary-foreground)] hover:brightness-95"
            >
              <Play className="h-4 w-4 fill-current" />
              Focused review · {focusedReviewViewLabel}
            </Button>
          </div>

          {reviewComplete ? (
            <ReviewDoneCard
              total={uniquePodcasts.length}
              picks={counts.interested}
              brandName={brandName}
              title={counts.toReview === 0 ? undefined : `You have picked ${counts.interested} shows`}
            />
          ) : null}

          <div className="mt-7 grid grid-cols-3 overflow-hidden rounded-2xl border border-[#d9d0c4] bg-white p-1.5 shadow-sm" role="tablist" aria-label="Podcast views">
            {[
              { value: 'top' as DashboardView, count: topMatches.length, icon: Sparkles },
              { value: 'all' as DashboardView, count: uniquePodcasts.length, icon: Library },
              { value: 'picks' as DashboardView, count: counts.interested, icon: ThumbsUp },
            ].map((tab) => (
              <button
                key={tab.value}
                type="button"
                role="tab"
                aria-selected={dashboardView === tab.value}
                onClick={() => {
                  setDashboardView(tab.value)
                  setFilters((current) => ({ ...current, decision: 'all' }))
                }}
                className={cn(
                  'flex min-h-11 min-w-0 items-center justify-center gap-1 whitespace-nowrap rounded-xl px-1 text-[11px] font-semibold transition sm:gap-2 sm:px-5 sm:text-sm',
                  dashboardView === tab.value
                    ? 'bg-[var(--campaign-primary)] text-[var(--campaign-primary-foreground)] shadow-sm'
                    : 'text-[#66727c] hover:bg-[#f5f0e9] hover:text-[#102033]',
                )}
              >
                <tab.icon className="hidden h-4 w-4 sm:block" />
                {VIEW_LABELS[tab.value]}
                <span className={cn('rounded-full px-1.5 py-0.5 text-[10px] sm:px-2 sm:text-[11px]', dashboardView === tab.value ? 'bg-white/12' : 'bg-[#eee8df]')}>
                  {tab.count}
                </span>
              </button>
            ))}
          </div>

          <ReviewFilters
            value={filters}
            onChange={setFilters}
            categories={allCategories}
            counts={counts}
            resultCount={sortedPodcasts.length}
          />

          {secondaryError && !loadingPodcasts && (
            <div className="mt-7 flex flex-col items-start gap-3 rounded-2xl border border-amber-200 bg-amber-50 px-5 py-4 text-sm text-amber-900 sm:flex-row sm:items-center sm:justify-between">
              <p>{secondaryErrorMessage}</p>
              <Button
                variant="outline"
                size="sm"
                className="shrink-0"
                onClick={retrySecondary}
              >
                Try again
              </Button>
            </div>
          )}

          {loadingPodcasts ? (
            <div className="mt-7 grid gap-4 lg:grid-cols-2">
              {[1, 2, 3, 4].map((item) => (
                <div key={item} className="h-64 animate-pulse rounded-3xl border border-[#ded5ca] bg-white" />
              ))}
            </div>
          ) : sortedPodcasts.length === 0 ? (
            <ReviewEmptyState
              icon={dashboardView === 'picks' ? ThumbsUp : Search}
              title={dashboardView === 'picks' ? 'Your picks will appear here' : 'No matching podcasts'}
              body={dashboardView === 'picks'
                ? 'Mark a show as Interested and it will become part of your outreach shortlist.'
                : 'Try removing a filter or searching for a broader topic.'}
              actionLabel="Browse top matches"
              onAction={() => {
                clearFilters()
                setDashboardView('top')
              }}
            />
          ) : (
            <>
              <div className="mt-7 grid gap-4 lg:grid-cols-2">
                {paginatedPodcasts.map((podcast) => {
                  const topMatchIndex = topMatches.findIndex((candidate) => candidate.podcast_id === podcast.podcast_id)
                  return (
                    <ReviewCard
                      key={podcast.podcast_id}
                      podcast={podcast}
                      decision={feedbackMap.get(podcast.podcast_id)?.status ?? null}
                      disabled={isSavingFeedback}
                      eyebrow={topMatchIndex >= 0 ? `Top match #${topMatchIndex + 1}` : undefined}
                      onDecide={(status) => saveFeedback(podcast.podcast_id, status, undefined, podcast.podcast_name)}
                      onOpen={() => setSelectedPodcast(podcast)}
                    />
                  )
                })}
              </div>

              <ReviewPagination page={currentPage} totalPages={totalPages} onPageChange={setCurrentPage} />
            </>
          )}
        </section>

        <section
          className="mt-16 overflow-hidden rounded-[32px] text-white shadow-[0_24px_70px_rgba(16,32,51,.14)]"
          style={{ background: `linear-gradient(rgba(7,18,31,.58), rgba(7,18,31,.72)), ${brand.primary}` }}
        >
          <div className="grid lg:grid-cols-[0.9fr_1.1fr]">
            <div className="relative overflow-hidden border-b border-white/10 p-7 sm:p-9 lg:border-b-0 lg:border-r">
              <div className="absolute -right-24 -top-24 h-64 w-64 rounded-full bg-[var(--campaign-accent)] opacity-20 blur-3xl" />
              <p className="section-kicker !text-[var(--campaign-accent)]">{isAdminPreview ? 'A campaign built around you' : 'What happens next'}</p>
              <h2 className="relative mt-3 max-w-lg font-editorial text-3xl leading-tight sm:text-4xl">
                Your picks become a campaign—not another spreadsheet.
              </h2>
              <p className="relative mt-4 max-w-lg text-sm leading-6 text-white/60 sm:text-base">
                {brandName} researches the host, writes the angle, manages outreach, coordinates dates, and keeps every opportunity visible from pitch to published episode.
              </p>
              {isAdminPreview ? (
                <Button
                  type="button"
                  onClick={openTutorial}
                  className="relative mt-6 min-h-12 gap-2 rounded-full bg-[var(--campaign-accent)] px-6 text-[var(--campaign-accent-foreground)] hover:brightness-95"
                >
                  Preview the client walkthrough
                  <ArrowRight className="h-4 w-4" />
                </Button>
              ) : (
                <Button
                  type="button"
                  onClick={showPicks}
                  className="relative mt-6 min-h-12 gap-2 rounded-full bg-[var(--campaign-accent)] px-6 text-[var(--campaign-accent-foreground)] hover:brightness-95"
                >
                  Review my picks
                  <ArrowRight className="h-4 w-4" />
                </Button>
              )}
            </div>
            <div className="grid gap-px bg-white/10 sm:grid-cols-3">
              {[
                { icon: WandSparkles, title: 'Personalized outreach', text: 'Every pitch is written for the show and host, not sprayed from a template.' },
                { icon: CalendarCheck, title: 'Booking visibility', text: 'See upcoming recordings, scheduled appearances, and what is going live next.' },
                { icon: Radio, title: 'Episodes go live', text: 'You get the link and a ready-to-share note.' },
              ].map((feature) => (
                <div key={feature.title} className="bg-black/10 p-6 sm:p-7">
                  <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-white/8 text-[var(--campaign-accent)]">
                    <feature.icon className="h-5 w-5" />
                  </span>
                  <p className="mt-5 font-editorial text-xl">{feature.title}</p>
                  <p className="mt-2 text-sm leading-6 text-white/52">{feature.text}</p>
                </div>
              ))}
            </div>
          </div>
        </section>
      </main>

      <footer className="border-t border-[#d9d0c4] bg-[#ede6dc]">
        <div className="mx-auto flex max-w-7xl flex-col items-center justify-between gap-3 px-4 py-6 text-center sm:flex-row sm:px-6 sm:text-left lg:px-8">
          <div className="flex items-center gap-2 text-sm font-semibold text-[#344455]">
            {brandLogoUrl ? (
              <img src={brandLogoUrl} alt="" className="h-7 w-10 object-contain" onError={() => setBrandLogoUnavailable(true)} />
            ) : (
              <span className="flex h-7 w-7 items-center justify-center rounded-lg text-[10px] font-black text-white" style={{ backgroundColor: brand.primary }}>
                {onboardingWorkspaceInitials(brandName)}
              </span>
            )}
            {brandName}
          </div>
          <div className="flex items-center gap-4 text-xs text-[#6f7a83]">
            <button type="button" onClick={() => setShowReviewPanel(true)} className="min-h-10 hover:text-[#102033]">About the data</button>
            <button type="button" onClick={openTutorial} className="min-h-10 hover:text-[#102033]">
              How it works
            </button>
            <button type="button" onClick={shareDashboard} className="min-h-10 hover:text-[#102033]">Share dashboard</button>
            {slug && (
              <a href={fromPortal ? '/portal/dashboard' : `/portal/login?b=${encodeURIComponent(slug)}`} className="min-h-10 leading-10 hover:text-[#102033]">
                Open your portal
              </a>
            )}
          </div>
        </div>
      </footer>

      <FocusedReview
        open={focusedQueue !== null}
        queue={focusedQueue ?? []}
        feedback={feedbackMap}
        label={focusedReviewViewLabel}
        recipientName={dashboard.name}
        isSaving={isSavingFeedback}
        onDecide={(podcast, status) => saveFeedback(podcast.podcast_id, status, undefined, podcast.podcast_name)}
        onExit={exitFocusedReview}
        onOpenProfile={(podcast) => {
          setFocusedQueue(null)
          setSelectedPodcast(podcast)
        }}
      />

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
          saveFeedback(selectedPodcast.podcast_id, status, undefined, selectedPodcast.podcast_name)
        }}
      />

      <ReviewTutorial open={showTutorial} onOpenChange={setShowTutorial} brandName={brandName} />
    </div>
    </ReviewBrandContext.Provider>
  )
}
