import { useState, useEffect } from 'react'
import { useParams } from 'react-router-dom'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Separator } from '@/components/ui/separator'
import { supabase } from '@/lib/supabase'
import { formatDistanceToNow } from 'date-fns'
import confetti from 'canvas-confetti'
import {
  Mic,
  Users,
  Star,
  ExternalLink,
  Loader2,
  Sparkles,
  Target,
  CheckCircle2,
  TrendingUp,
  Radio,
  X,
  ChevronRight,
  Headphones,
  Zap,
  Globe,
  Award,
  BarChart3,
  ArrowRight,
  Search,
  Tag,
  ThumbsUp,
  ThumbsDown,
  MessageSquare,
  Check,
  Clock
} from 'lucide-react'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { getPodcastDemographics, type PodcastDemographics } from '@/services/podscan'
import { cn } from '@/lib/utils'

interface ProspectDashboard {
  id: string
  slug: string
  prospect_name: string
  prospect_bio: string | null
  prospect_image_url: string | null
  spreadsheet_id: string | null
  spreadsheet_url: string | null
  is_active: boolean
}

interface PodcastCategory {
  category_id: string
  category_name: string
}

interface OutreachPodcast {
  podcast_id: string
  podcast_name: string
  podcast_description: string | null
  podcast_image_url: string | null
  podcast_url: string | null
  publisher_name: string | null
  itunes_rating: number | null
  episode_count: number | null
  audience_size: number | null
  podcast_categories?: PodcastCategory[] | null
  last_posted_at: string | null
}

interface PitchAngle {
  title: string
  description: string
}

interface PodcastFitAnalysis {
  clean_description: string
  fit_reasons: string[]
  pitch_angles: PitchAngle[]
}

interface PodcastFeedback {
  id: string
  prospect_dashboard_id: string
  podcast_id: string
  podcast_name: string | null
  status: 'approved' | 'rejected' | null
  notes: string | null
  created_at: string
  updated_at: string
}

type FeedbackFilter = 'all' | 'approved' | 'rejected' | 'not_reviewed'

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY

export default function ProspectView() {
  const { slug } = useParams<{ slug: string }>()

  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [dashboard, setDashboard] = useState<ProspectDashboard | null>(null)
  const [podcasts, setPodcasts] = useState<OutreachPodcast[]>([])
  const [searchQuery, setSearchQuery] = useState('')
  const [selectedCategories, setSelectedCategories] = useState<string[]>([])
  const [feedbackFilter, setFeedbackFilter] = useState<FeedbackFilter>('all')

  // Side panel state
  const [selectedPodcast, setSelectedPodcast] = useState<OutreachPodcast | null>(null)
  const [isAnalyzing, setIsAnalyzing] = useState(false)
  const [fitAnalysis, setFitAnalysis] = useState<PodcastFitAnalysis | null>(null)
  const [isLoadingDemographics, setIsLoadingDemographics] = useState(false)
  const [demographics, setDemographics] = useState<PodcastDemographics | null>(null)

  // Feedback state
  const [feedbackMap, setFeedbackMap] = useState<Map<string, PodcastFeedback>>(new Map())
  const [currentNotes, setCurrentNotes] = useState('')
  const [isSavingFeedback, setIsSavingFeedback] = useState(false)

  // Cache for analyses and demographics
  const [analysisCache, setAnalysisCache] = useState<Map<string, PodcastFitAnalysis>>(new Map())
  const [demographicsCache, setDemographicsCache] = useState<Map<string, PodcastDemographics | null>>(new Map())

  // Preloading state
  const [preloadingAnalyses, setPreloadingAnalyses] = useState(false)
  const [analysesPreloaded, setAnalysesPreloaded] = useState(0)

  // Fetch dashboard data
  useEffect(() => {
    const fetchDashboard = async () => {
      if (!slug) {
        setError('Invalid dashboard link')
        setLoading(false)
        return
      }

      try {
        const { data: dashboardData, error: dbError } = await supabase
          .from('prospect_dashboards')
          .select('*')
          .eq('slug', slug)
          .single()

        if (dbError || !dashboardData) {
          setError('Dashboard not found')
          setLoading(false)
          return
        }

        if (!dashboardData.is_active) {
          setError('This dashboard link is no longer active')
          setLoading(false)
          return
        }

        setDashboard(dashboardData)

        // Update view count
        await supabase
          .from('prospect_dashboards')
          .update({
            view_count: (dashboardData.view_count || 0) + 1,
            last_viewed_at: new Date().toISOString()
          })
          .eq('id', dashboardData.id)

        // Fetch podcasts from Google Sheet via edge function (only if spreadsheet exists)
        if (dashboardData.spreadsheet_id) {
          const response = await fetch(`${SUPABASE_URL}/functions/v1/get-prospect-podcasts`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'apikey': SUPABASE_ANON_KEY,
            },
            body: JSON.stringify({
              spreadsheetId: dashboardData.spreadsheet_id,
            }),
          })

          if (!response.ok) {
            const errorData = await response.json()
            throw new Error(errorData.error || 'Failed to fetch podcasts')
          }

          const data = await response.json()
          setPodcasts(data.podcasts || [])
        } else {
          // No spreadsheet linked yet - show empty state
          setPodcasts([])
        }

        // Fetch existing feedback for this prospect
        const { data: feedbackData } = await supabase
          .from('prospect_podcast_feedback')
          .select('*')
          .eq('prospect_dashboard_id', dashboardData.id)

        if (feedbackData && feedbackData.length > 0) {
          const map = new Map<string, PodcastFeedback>()
          feedbackData.forEach((fb: PodcastFeedback) => {
            map.set(fb.podcast_id, fb)
          })
          setFeedbackMap(map)
        }
      } catch (err) {
        console.error('Error fetching dashboard:', err)
        setError('Failed to load dashboard')
      } finally {
        setLoading(false)
      }
    }

    fetchDashboard()
  }, [slug])

  // Preload all AI analyses AND demographics in parallel with rate limiting
  useEffect(() => {
    if (!dashboard?.prospect_bio || podcasts.length === 0 || preloadingAnalyses) return
    if (analysisCache.size >= podcasts.length && demographicsCache.size >= podcasts.length) return

    const preloadAll = async () => {
      setPreloadingAnalyses(true)
      console.log('[Preload] Starting parallel preload for', podcasts.length, 'podcasts')

      // Controlled concurrency - max 5 AI analyses and 10 demographics at once
      const AI_CONCURRENCY = 5
      const DEMO_CONCURRENCY = 10

      // Helper for controlled parallel execution
      const runWithConcurrency = async <T,>(
        items: T[],
        fn: (item: T) => Promise<void>,
        concurrency: number
      ) => {
        const queue = [...items]
        const workers = Array(Math.min(concurrency, items.length))
          .fill(null)
          .map(async () => {
            while (queue.length > 0) {
              const item = queue.shift()
              if (item) await fn(item)
            }
          })
        await Promise.all(workers)
      }

      // AI Analysis preloader
      const preloadAnalysis = async (podcast: typeof podcasts[0]) => {
        if (analysisCache.has(podcast.podcast_id)) {
          console.log('[Preload] AI analysis already cached:', podcast.podcast_name)
          setAnalysesPreloaded(prev => prev + 1)
          return
        }

        console.log('[Preload] 🤖 Fetching AI analysis:', podcast.podcast_name)
        try {
          const response = await fetch(`${SUPABASE_URL}/functions/v1/analyze-podcast-fit`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'apikey': SUPABASE_ANON_KEY,
            },
            body: JSON.stringify({
              podcastId: podcast.podcast_id,
              podcastName: podcast.podcast_name,
              podcastDescription: podcast.podcast_description,
              podcastUrl: podcast.podcast_url,
              publisherName: podcast.publisher_name,
              itunesRating: podcast.itunes_rating,
              episodeCount: podcast.episode_count,
              audienceSize: podcast.audience_size,
              clientId: dashboard.id,
              clientName: dashboard.prospect_name,
              clientBio: dashboard.prospect_bio,
            }),
          })

          if (response.ok) {
            const data = await response.json()
            console.log('[Preload] ✅ AI analysis cached:', podcast.podcast_name)
            setAnalysisCache(prev => new Map(prev).set(podcast.podcast_id, data.analysis))
          } else {
            console.error('[Preload] ❌ AI analysis failed:', podcast.podcast_name, response.status)
          }
        } catch (err) {
          console.error('[Preload] Error preloading analysis for:', podcast.podcast_name, err)
        }

        setAnalysesPreloaded(prev => prev + 1)
      }

      // Demographics preloader
      const preloadDemographics = async (podcast: typeof podcasts[0]) => {
        if (demographicsCache.has(podcast.podcast_id)) return

        try {
          const data = await getPodcastDemographics(podcast.podcast_id)
          setDemographicsCache(prev => new Map(prev).set(podcast.podcast_id, data))
        } catch (err) {
          setDemographicsCache(prev => new Map(prev).set(podcast.podcast_id, null))
        }
      }

      // Run both preloaders in parallel, each with their own concurrency limit
      await Promise.all([
        runWithConcurrency(podcasts, preloadAnalysis, AI_CONCURRENCY),
        runWithConcurrency(podcasts, preloadDemographics, DEMO_CONCURRENCY)
      ])

      console.log('[Preload] Finished parallel preload')
      setPreloadingAnalyses(false)
    }

    preloadAll()
  }, [dashboard, podcasts, preloadingAnalyses, analysisCache.size, demographicsCache.size])

  // Analyze podcast fit when side panel opens
  useEffect(() => {
    if (!selectedPodcast || !dashboard?.prospect_bio) {
      setFitAnalysis(null)
      return
    }

    const cached = analysisCache.get(selectedPodcast.podcast_id)
    console.log('[Panel] Checking cache for:', selectedPodcast.podcast_name, 'Found:', !!cached, 'Cache size:', analysisCache.size)
    if (cached) {
      console.log('[Panel] ✅ Using cached analysis')
      setFitAnalysis(cached)
      return
    }

    console.log('[Panel] ❌ Cache miss, fetching fresh analysis...')
    const analyzefit = async () => {
      setIsAnalyzing(true)
      setFitAnalysis(null)

      try {
        const response = await fetch(`${SUPABASE_URL}/functions/v1/analyze-podcast-fit`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'apikey': SUPABASE_ANON_KEY,
          },
          body: JSON.stringify({
            podcastId: selectedPodcast.podcast_id,
            podcastName: selectedPodcast.podcast_name,
            podcastDescription: selectedPodcast.podcast_description,
            podcastUrl: selectedPodcast.podcast_url,
            publisherName: selectedPodcast.publisher_name,
            itunesRating: selectedPodcast.itunes_rating,
            episodeCount: selectedPodcast.episode_count,
            audienceSize: selectedPodcast.audience_size,
            clientId: dashboard.id,
            clientName: dashboard.prospect_name,
            clientBio: dashboard.prospect_bio,
          }),
        })

        if (response.ok) {
          const data = await response.json()
          setFitAnalysis(data.analysis)
          setAnalysisCache(prev => new Map(prev).set(selectedPodcast.podcast_id, data.analysis))
        }
      } catch (err) {
        console.error('Error analyzing fit:', err)
      } finally {
        setIsAnalyzing(false)
      }
    }

    analyzefit()
  }, [selectedPodcast, dashboard, analysisCache])

  // Fetch demographics when side panel opens (use cache if available)
  useEffect(() => {
    if (!selectedPodcast) {
      setDemographics(null)
      return
    }

    // Check cache first
    if (demographicsCache.has(selectedPodcast.podcast_id)) {
      setDemographics(demographicsCache.get(selectedPodcast.podcast_id) || null)
      return
    }

    const fetchDemographics = async () => {
      setIsLoadingDemographics(true)
      try {
        const data = await getPodcastDemographics(selectedPodcast.podcast_id)
        setDemographics(data)
        setDemographicsCache(prev => new Map(prev).set(selectedPodcast.podcast_id, data))
      } catch (err) {
        console.error('Error fetching demographics:', err)
        setDemographicsCache(prev => new Map(prev).set(selectedPodcast.podcast_id, null))
      } finally {
        setIsLoadingDemographics(false)
      }
    }

    fetchDemographics()
  }, [selectedPodcast])

  // Load existing notes when podcast is selected
  useEffect(() => {
    if (selectedPodcast) {
      const existing = feedbackMap.get(selectedPodcast.podcast_id)
      setCurrentNotes(existing?.notes || '')
    } else {
      setCurrentNotes('')
    }
  }, [selectedPodcast, feedbackMap])

  // Confetti celebration for approvals
  const triggerConfetti = () => {
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
  const saveFeedback = async (podcastId: string, status: 'approved' | 'rejected' | null, notes?: string, podcastName?: string) => {
    if (!dashboard) return

    // Check if this is a new approval (not already approved)
    const existingFeedback = feedbackMap.get(podcastId)
    const isNewApproval = status === 'approved' && existingFeedback?.status !== 'approved'

    setIsSavingFeedback(true)
    try {
      const feedbackData = {
        prospect_dashboard_id: dashboard.id,
        podcast_id: podcastId,
        podcast_name: podcastName || selectedPodcast?.podcast_name || null,
        status,
        notes: notes !== undefined ? notes : (currentNotes || null),
      }

      const { data, error } = await supabase
        .from('prospect_podcast_feedback')
        .upsert(feedbackData, {
          onConflict: 'prospect_dashboard_id,podcast_id',
        })
        .select()
        .single()

      if (error) throw error

      // Update local state
      setFeedbackMap(prev => {
        const newMap = new Map(prev)
        newMap.set(podcastId, data)
        return newMap
      })

      // Trigger confetti for new approvals
      if (isNewApproval) {
        triggerConfetti()
      }
    } catch (err) {
      console.error('Error saving feedback:', err)
    } finally {
      setIsSavingFeedback(false)
    }
  }

  // Loading state
  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-slate-100 dark:from-slate-950 dark:via-slate-900 dark:to-slate-950 flex items-center justify-center">
        <div className="text-center space-y-4">
          <div className="relative">
            <div className="h-16 w-16 rounded-full bg-primary/10 flex items-center justify-center mx-auto">
              <Loader2 className="h-8 w-8 animate-spin text-primary" />
            </div>
          </div>
          <div className="space-y-1">
            <p className="font-medium">Loading your opportunities</p>
            <p className="text-sm text-muted-foreground">Preparing personalized podcast matches...</p>
          </div>
        </div>
      </div>
    )
  }

  // Error state
  if (error || !dashboard) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-slate-100 dark:from-slate-950 dark:via-slate-900 dark:to-slate-950 flex items-center justify-center p-4">
        <Card className="max-w-md w-full border-0 shadow-xl">
          <CardContent className="pt-8 pb-8 text-center space-y-4">
            <div className="h-16 w-16 rounded-full bg-red-100 dark:bg-red-900/20 flex items-center justify-center mx-auto">
              <X className="h-8 w-8 text-red-600" />
            </div>
            <div className="space-y-2">
              <h2 className="text-xl font-semibold">Dashboard Not Available</h2>
              <p className="text-muted-foreground">{error || 'This dashboard could not be found.'}</p>
            </div>
          </CardContent>
        </Card>
      </div>
    )
  }

  // Calculate stats
  const totalReach = podcasts.reduce((sum, p) => sum + (p.audience_size || 0), 0)
  const podcastsWithAudience = podcasts.filter(p => p.audience_size && p.audience_size > 0)
  const avgListenersPerEpisode = podcastsWithAudience.length > 0
    ? Math.round(totalReach / podcastsWithAudience.length)
    : 0

  const ratings = podcasts.filter(p => p.itunes_rating).map(p => p.itunes_rating!)
  const avgRating = ratings.length > 0 ? ratings.reduce((a, b) => a + b, 0) / ratings.length : 0

  const totalEpisodes = podcasts.reduce((sum, p) => sum + (p.episode_count || 0), 0)
  const avgEpisodesPerPodcast = podcasts.length > 0
    ? Math.round(totalEpisodes / podcasts.length)
    : 0

  // Find top podcasts
  const topRatedPodcast = [...podcasts].sort((a, b) => (b.itunes_rating || 0) - (a.itunes_rating || 0))[0]
  const highestReachPodcast = [...podcasts].sort((a, b) => (b.audience_size || 0) - (a.audience_size || 0))[0]
  const mostEpisodesPodcast = [...podcasts].sort((a, b) => (b.episode_count || 0) - (a.episode_count || 0))[0]

  const formatNumber = (num: number) => {
    if (num >= 1000000) return `${(num / 1000000).toFixed(1)}M`
    if (num >= 1000) return `${(num / 1000).toFixed(0)}K`
    return num.toLocaleString()
  }

  // Extract unique categories from all podcasts (computed each render, no useMemo)
  const allCategories: Array<{ category_id: string; category_name: string }> = []
  const seenCategoryIds = new Set<string>()
  for (const podcast of podcasts) {
    const cats = podcast.podcast_categories
    if (Array.isArray(cats)) {
      for (const cat of cats) {
        if (cat?.category_id && cat?.category_name && !seenCategoryIds.has(cat.category_id)) {
          seenCategoryIds.add(cat.category_id)
          allCategories.push({ category_id: cat.category_id, category_name: cat.category_name })
        }
      }
    }
  }
  allCategories.sort((a, b) => a.category_name.localeCompare(b.category_name))

  // Count feedback stats
  const feedbackStats = {
    approved: 0,
    rejected: 0,
    notReviewed: 0
  }
  podcasts.forEach(podcast => {
    const feedback = feedbackMap.get(podcast.podcast_id)
    if (feedback?.status === 'approved') feedbackStats.approved++
    else if (feedback?.status === 'rejected') feedbackStats.rejected++
    else feedbackStats.notReviewed++
  })

  // Filter podcasts based on search query, categories, and feedback status
  const filteredPodcasts = podcasts.filter(podcast => {
    // Search filter
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase()
      const matchesSearch = (
        podcast.podcast_name.toLowerCase().includes(query) ||
        podcast.podcast_description?.toLowerCase().includes(query) ||
        podcast.publisher_name?.toLowerCase().includes(query)
      )
      if (!matchesSearch) return false
    }

    // Category filter
    if (selectedCategories.length > 0) {
      const podcastCats = podcast.podcast_categories
      if (!Array.isArray(podcastCats) || podcastCats.length === 0) return false
      const podcastCatIds = podcastCats.map(c => c.category_id)
      const hasMatch = selectedCategories.some(id => podcastCatIds.includes(id))
      if (!hasMatch) return false
    }

    // Feedback status filter
    if (feedbackFilter !== 'all') {
      const feedback = feedbackMap.get(podcast.podcast_id)
      if (feedbackFilter === 'approved' && feedback?.status !== 'approved') return false
      if (feedbackFilter === 'rejected' && feedback?.status !== 'rejected') return false
      if (feedbackFilter === 'not_reviewed' && feedback?.status) return false
    }

    return true
  })

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-slate-100 dark:from-slate-950 dark:via-slate-900 dark:to-slate-950">
      {/* Hero Header */}
      <div className="relative overflow-hidden">
        {/* Animated gradient background */}
        <div className="absolute inset-0 bg-gradient-to-br from-primary/10 via-purple-500/10 to-pink-500/10" />
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-primary/20 via-transparent to-transparent" />
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_bottom_right,_var(--tw-gradient-stops))] from-purple-500/10 via-transparent to-transparent" />

        {/* Floating decorative elements */}
        <div className="absolute top-20 left-10 w-72 h-72 bg-primary/10 rounded-full blur-3xl animate-pulse" />
        <div className="absolute bottom-10 right-10 w-96 h-96 bg-purple-500/10 rounded-full blur-3xl animate-pulse delay-1000" />

        <div className="relative max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-10 sm:py-16 lg:py-20">
          <div className="text-center space-y-4 sm:space-y-6">
            {/* Badge */}
            <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-white/80 dark:bg-slate-900/80 backdrop-blur-sm border border-primary/20 shadow-lg animate-fade-in">
              <Sparkles className="h-4 w-4 text-primary animate-pulse" />
              <span className="text-sm font-semibold bg-gradient-to-r from-primary to-purple-600 bg-clip-text text-transparent">
                Personalized Podcast Opportunities
              </span>
            </div>

            {/* Prospect Profile Picture */}
            {dashboard.prospect_image_url && (
              <div className="flex justify-center animate-scale-in">
                <div className="relative">
                  <div className="absolute inset-0 bg-gradient-to-r from-primary to-purple-600 rounded-full blur-lg opacity-50 animate-pulse" />
                  <div className="relative h-24 w-24 sm:h-32 sm:w-32 lg:h-36 lg:w-36 rounded-full overflow-hidden ring-4 ring-white dark:ring-slate-800 shadow-2xl">
                    <img
                      src={dashboard.prospect_image_url}
                      alt={dashboard.prospect_name}
                      className="w-full h-full object-cover"
                    />
                  </div>
                </div>
              </div>
            )}

            {/* Greeting */}
            <div className="space-y-2 animate-fade-in-up">
              <h1 className="text-3xl sm:text-4xl lg:text-6xl font-bold tracking-tight px-2">
                Hi, <span className="bg-gradient-to-r from-primary via-purple-600 to-pink-600 bg-clip-text text-transparent">{dashboard.prospect_name}</span>!
              </h1>
              <p className="text-lg sm:text-xl lg:text-2xl text-muted-foreground max-w-3xl mx-auto px-2">
                We've curated <span className="font-bold text-foreground">{podcasts.length}</span> podcast{podcasts.length !== 1 ? 's' : ''} perfect for your expertise
              </p>
            </div>

            {/* Big Stats */}
            <div className="flex flex-wrap justify-center gap-6 sm:gap-10 pt-4 animate-fade-in-up delay-200">
              <div className="text-center">
                <p className="text-3xl sm:text-5xl font-bold bg-gradient-to-r from-green-500 to-emerald-600 bg-clip-text text-transparent">
                  {formatNumber(totalReach)}+
                </p>
                <p className="text-sm sm:text-base text-muted-foreground font-medium">Potential Listeners</p>
              </div>
              <div className="hidden sm:block w-px bg-gradient-to-b from-transparent via-slate-300 to-transparent" />
              <div className="text-center">
                <p className="text-3xl sm:text-5xl font-bold bg-gradient-to-r from-amber-500 to-orange-600 bg-clip-text text-transparent">
                  {avgRating > 0 ? avgRating.toFixed(1) : '4.5'}
                </p>
                <p className="text-sm sm:text-base text-muted-foreground font-medium">Avg Rating</p>
              </div>
              <div className="hidden sm:block w-px bg-gradient-to-b from-transparent via-slate-300 to-transparent" />
              <div className="text-center">
                <p className="text-3xl sm:text-5xl font-bold bg-gradient-to-r from-blue-500 to-cyan-600 bg-clip-text text-transparent">
                  {podcasts.length}
                </p>
                <p className="text-sm sm:text-base text-muted-foreground font-medium">Curated Podcasts</p>
              </div>
            </div>

            {/* Review Progress */}
            {(() => {
              const reviewedCount = Array.from(feedbackMap.values()).filter(f => f.status).length
              const approvedCount = Array.from(feedbackMap.values()).filter(f => f.status === 'approved').length
              return (
                <div className="mt-8 animate-fade-in-up delay-300">
                  {reviewedCount > 0 ? (
                    <div className="inline-flex flex-col items-center gap-2 px-6 py-3 rounded-2xl bg-white/60 dark:bg-slate-900/60 backdrop-blur-sm border border-slate-200/50 dark:border-slate-700/50">
                      <p className="text-sm font-medium text-muted-foreground">
                        You've reviewed <span className="text-foreground font-bold">{reviewedCount}</span> of <span className="text-foreground font-bold">{podcasts.length}</span> podcasts
                        {approvedCount > 0 && (
                          <span className="text-green-600"> ({approvedCount} approved!)</span>
                        )}
                      </p>
                      <div className="w-48 h-2 bg-slate-200 dark:bg-slate-700 rounded-full overflow-hidden">
                        <div
                          className="h-full bg-gradient-to-r from-primary to-purple-600 rounded-full transition-all duration-500"
                          style={{ width: `${(reviewedCount / podcasts.length) * 100}%` }}
                        />
                      </div>
                    </div>
                  ) : (
                    <p className="text-muted-foreground">
                      Review each podcast below and let us know which ones interest you
                    </p>
                  )}
                </div>
              )
            })()}

            {/* Preloading Status */}
            {preloadingAnalyses && (
              <div className="mt-6 flex items-center justify-center gap-2 text-xs text-muted-foreground animate-fade-in">
                <Loader2 className="h-3 w-3 animate-spin" />
                <span>Preparing insights... {analysesPreloaded}/{podcasts.length}</span>
              </div>
            )}

            {/* Scroll CTA */}
            <div className="mt-8 animate-bounce">
              <div className="flex flex-col items-center gap-2 text-muted-foreground">
                <p className="text-sm font-medium">Explore your opportunities below</p>
                <ChevronRight className="h-6 w-6 rotate-90" />
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Featured Podcasts Section */}
      <div className="max-w-6xl mx-auto px-3 sm:px-6 lg:px-8 py-6 sm:py-8">
        <p className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-4 text-center">
          Featured Opportunities
        </p>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 sm:gap-4">
          {/* Highest Reach */}
          {highestReachPodcast && highestReachPodcast.audience_size && (
            <Card
              className="border-0 shadow-xl bg-gradient-to-br from-green-50/80 to-emerald-50/80 dark:from-green-950/50 dark:to-emerald-950/50 backdrop-blur-sm cursor-pointer hover:shadow-2xl hover:-translate-y-1 transition-all duration-300 active:scale-[0.98] animate-fade-in-up"
              style={{ animationDelay: '100ms' }}
              onClick={() => setSelectedPodcast(highestReachPodcast)}
            >
              <CardContent className="p-3 sm:p-4 flex items-center gap-3 sm:gap-4">
                <div className="h-12 w-12 sm:h-14 sm:w-14 rounded-xl overflow-hidden flex-shrink-0 shadow-md">
                  {highestReachPodcast.podcast_image_url ? (
                    <img src={highestReachPodcast.podcast_image_url} alt="" className="w-full h-full object-cover" />
                  ) : (
                    <div className="w-full h-full bg-green-200 flex items-center justify-center">
                      <Mic className="h-5 w-5 sm:h-6 sm:w-6 text-green-600" />
                    </div>
                  )}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-[10px] sm:text-xs font-semibold text-green-600 uppercase tracking-wide">Highest Reach</p>
                  <p className="font-semibold truncate text-sm sm:text-base">{highestReachPodcast.podcast_name}</p>
                  <p className="text-xs sm:text-sm text-muted-foreground">{formatNumber(highestReachPodcast.audience_size)} listeners</p>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Top Rated */}
          {topRatedPodcast && topRatedPodcast.itunes_rating && (
            <Card
              className="border-0 shadow-xl bg-gradient-to-br from-amber-50/80 to-yellow-50/80 dark:from-amber-950/50 dark:to-yellow-950/50 backdrop-blur-sm cursor-pointer hover:shadow-2xl hover:-translate-y-1 transition-all duration-300 active:scale-[0.98] animate-fade-in-up"
              style={{ animationDelay: '200ms' }}
              onClick={() => setSelectedPodcast(topRatedPodcast)}
            >
              <CardContent className="p-3 sm:p-4 flex items-center gap-3 sm:gap-4">
                <div className="h-12 w-12 sm:h-14 sm:w-14 rounded-xl overflow-hidden flex-shrink-0 shadow-md">
                  {topRatedPodcast.podcast_image_url ? (
                    <img src={topRatedPodcast.podcast_image_url} alt="" className="w-full h-full object-cover" />
                  ) : (
                    <div className="w-full h-full bg-amber-200 flex items-center justify-center">
                      <Mic className="h-5 w-5 sm:h-6 sm:w-6 text-amber-600" />
                    </div>
                  )}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-[10px] sm:text-xs font-semibold text-amber-600 uppercase tracking-wide">Top Rated</p>
                  <p className="font-semibold truncate text-sm sm:text-base">{topRatedPodcast.podcast_name}</p>
                  <p className="text-xs sm:text-sm text-muted-foreground flex items-center gap-1">
                    <Star className="h-3 w-3 sm:h-4 sm:w-4 fill-amber-500 text-amber-500" />
                    {Number(topRatedPodcast.itunes_rating).toFixed(1)} rating
                  </p>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Most Established */}
          {mostEpisodesPodcast && mostEpisodesPodcast.episode_count && (
            <Card
              className="border-0 shadow-xl bg-gradient-to-br from-purple-50/80 to-violet-50/80 dark:from-purple-950/50 dark:to-violet-950/50 backdrop-blur-sm cursor-pointer hover:shadow-2xl hover:-translate-y-1 transition-all duration-300 active:scale-[0.98] animate-fade-in-up"
              style={{ animationDelay: '300ms' }}
              onClick={() => setSelectedPodcast(mostEpisodesPodcast)}
            >
              <CardContent className="p-3 sm:p-4 flex items-center gap-3 sm:gap-4">
                <div className="h-12 w-12 sm:h-14 sm:w-14 rounded-xl overflow-hidden flex-shrink-0 shadow-md">
                  {mostEpisodesPodcast.podcast_image_url ? (
                    <img src={mostEpisodesPodcast.podcast_image_url} alt="" className="w-full h-full object-cover" />
                  ) : (
                    <div className="w-full h-full bg-purple-200 flex items-center justify-center">
                      <Mic className="h-5 w-5 sm:h-6 sm:w-6 text-purple-600" />
                    </div>
                  )}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-[10px] sm:text-xs font-semibold text-purple-600 uppercase tracking-wide">Most Established</p>
                  <p className="font-semibold truncate text-sm sm:text-base">{mostEpisodesPodcast.podcast_name}</p>
                  <p className="text-xs sm:text-sm text-muted-foreground">{mostEpisodesPodcast.episode_count} episodes</p>
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      </div>

      {/* Podcast Grid */}
      <div className="max-w-6xl mx-auto px-3 sm:px-6 lg:px-8 py-6 sm:py-12">
        {/* Section Header */}
        <div className="text-center mb-6 sm:mb-8">
          <h2 className="text-2xl sm:text-3xl font-bold mb-2">
            Your Podcast Opportunities
          </h2>
          <p className="text-muted-foreground max-w-xl mx-auto">
            Click any podcast to learn why it's a perfect fit for you.
            <span className="text-primary font-medium"> Approve the ones you love</span>,
            and we'll start reaching out on your behalf.
          </p>
        </div>

        {/* Search */}
        <div className="flex justify-center mb-6">
          <div className="relative w-full max-w-md">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search by name, topic, or host..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-11 bg-white dark:bg-slate-900 h-12 text-base rounded-full border-2 focus:border-primary"
            />
          </div>
        </div>

        {/* Feedback Status Filter */}
        <div className="mb-4 sm:mb-6">
          <div className="flex items-center gap-2 mb-2">
            <ThumbsUp className="h-4 w-4 text-muted-foreground" />
            <span className="text-xs sm:text-sm font-medium text-muted-foreground">Filter by status</span>
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              onClick={() => setFeedbackFilter('all')}
              className={cn(
                "px-3 py-1.5 rounded-full text-xs sm:text-sm font-medium transition-all duration-200 border",
                feedbackFilter === 'all'
                  ? "bg-primary text-primary-foreground border-primary"
                  : "bg-white dark:bg-slate-900 text-muted-foreground border-slate-200 dark:border-slate-700 hover:border-primary/50"
              )}
            >
              All ({podcasts.length})
            </button>
            <button
              onClick={() => setFeedbackFilter('approved')}
              className={cn(
                "px-3 py-1.5 rounded-full text-xs sm:text-sm font-medium transition-all duration-200 border flex items-center gap-1.5",
                feedbackFilter === 'approved'
                  ? "bg-green-600 text-white border-green-600"
                  : "bg-white dark:bg-slate-900 text-muted-foreground border-slate-200 dark:border-slate-700 hover:border-green-500 hover:text-green-600"
              )}
            >
              <CheckCircle2 className="h-3.5 w-3.5" />
              Approved ({feedbackStats.approved})
            </button>
            <button
              onClick={() => setFeedbackFilter('rejected')}
              className={cn(
                "px-3 py-1.5 rounded-full text-xs sm:text-sm font-medium transition-all duration-200 border flex items-center gap-1.5",
                feedbackFilter === 'rejected'
                  ? "bg-red-600 text-white border-red-600"
                  : "bg-white dark:bg-slate-900 text-muted-foreground border-slate-200 dark:border-slate-700 hover:border-red-500 hover:text-red-600"
              )}
            >
              <X className="h-3.5 w-3.5" />
              Rejected ({feedbackStats.rejected})
            </button>
            <button
              onClick={() => setFeedbackFilter('not_reviewed')}
              className={cn(
                "px-3 py-1.5 rounded-full text-xs sm:text-sm font-medium transition-all duration-200 border",
                feedbackFilter === 'not_reviewed'
                  ? "bg-slate-600 text-white border-slate-600"
                  : "bg-white dark:bg-slate-900 text-muted-foreground border-slate-200 dark:border-slate-700 hover:border-slate-500"
              )}
            >
              To Review ({feedbackStats.notReviewed})
            </button>
          </div>
        </div>

        {/* Category Filter Chips */}
        {allCategories.length > 0 && (
          <div className="mb-4 sm:mb-6">
            <div className="flex items-center gap-2 mb-2">
              <Tag className="h-4 w-4 text-muted-foreground" />
              <span className="text-xs sm:text-sm font-medium text-muted-foreground">Filter by category</span>
              {selectedCategories.length > 0 && (
                <button
                  onClick={() => setSelectedCategories([])}
                  className="text-xs text-primary hover:text-primary/80 ml-auto"
                >
                  Clear filters
                </button>
              )}
            </div>
            <div className="flex flex-wrap gap-2">
              {allCategories.map((cat) => (
                <button
                  key={cat.category_id}
                  onClick={() => {
                    setSelectedCategories(prev =>
                      prev.includes(cat.category_id)
                        ? prev.filter(id => id !== cat.category_id)
                        : [...prev, cat.category_id]
                    )
                  }}
                  className={cn(
                    "px-3 py-1.5 rounded-full text-xs sm:text-sm font-medium transition-all duration-200",
                    "border hover:shadow-md active:scale-95",
                    selectedCategories.includes(cat.category_id)
                      ? "bg-primary text-primary-foreground border-primary shadow-sm"
                      : "bg-white dark:bg-slate-900 text-muted-foreground border-slate-200 dark:border-slate-700 hover:border-primary/50 hover:text-primary"
                  )}
                >
                  {cat.category_name}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Results count when filtering */}
        {(searchQuery || selectedCategories.length > 0) && (
          <p className="text-xs sm:text-sm text-muted-foreground mb-3 sm:mb-4">
            Showing {filteredPodcasts.length} of {podcasts.length} podcasts
            {selectedCategories.length > 0 && ` in ${selectedCategories.length} ${selectedCategories.length === 1 ? 'category' : 'categories'}`}
          </p>
        )}

        {podcasts.length === 0 ? (
          <Card className="border-0 shadow-md">
            <CardContent className="p-8 sm:p-12 text-center">
              <Radio className="h-10 w-10 sm:h-12 sm:w-12 text-muted-foreground/50 mx-auto mb-3 sm:mb-4" />
              <h3 className="text-base sm:text-lg font-semibold mb-2">Podcasts Coming Soon</h3>
              <p className="text-sm text-muted-foreground">
                We're curating the perfect podcast opportunities for you. Check back soon!
              </p>
            </CardContent>
          </Card>
        ) : filteredPodcasts.length === 0 && (searchQuery || selectedCategories.length > 0) ? (
          <Card className="border-0 shadow-md">
            <CardContent className="p-8 sm:p-12 text-center">
              <Search className="h-10 w-10 sm:h-12 sm:w-12 text-muted-foreground/50 mx-auto mb-3 sm:mb-4" />
              <h3 className="text-base sm:text-lg font-semibold mb-2">No podcasts found</h3>
              <p className="text-sm text-muted-foreground">
                {selectedCategories.length > 0 && searchQuery
                  ? 'Try different filters or search terms.'
                  : selectedCategories.length > 0
                  ? 'No podcasts match the selected categories.'
                  : 'Try a different search term.'}
              </p>
              <Button
                variant="outline"
                className="mt-4"
                onClick={() => {
                  setSearchQuery('')
                  setSelectedCategories([])
                }}
              >
                Clear all filters
              </Button>
            </CardContent>
          </Card>
        ) : (
          <div className="grid gap-3 sm:gap-6 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3">
            {filteredPodcasts.map((podcast, index) => (
            <Card
              key={podcast.podcast_id}
              className={cn(
                "group cursor-pointer border-0 shadow-lg hover:shadow-2xl transition-all duration-300 overflow-hidden",
                "active:scale-[0.98] bg-white/80 dark:bg-slate-900/80 backdrop-blur-sm",
                "hover:-translate-y-1 hover:scale-[1.02]",
                "animate-slide-in-bottom",
                selectedPodcast?.podcast_id === podcast.podcast_id && "ring-2 ring-primary shadow-xl"
              )}
              style={{ animationDelay: `${index * 50}ms` }}
              onClick={() => setSelectedPodcast(podcast)}
            >
              <CardContent className="p-0">
                {/* Image */}
                <div className="relative aspect-[16/10] overflow-hidden bg-gradient-to-br from-slate-100 to-slate-200 dark:from-slate-800 dark:to-slate-900">
                  {podcast.podcast_image_url ? (
                    <img
                      src={podcast.podcast_image_url}
                      alt={podcast.podcast_name}
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center">
                      <Mic className="h-10 w-10 sm:h-12 sm:w-12 text-muted-foreground/50" />
                    </div>
                  )}
                  {/* Overlay gradient */}
                  <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent" />

                  {/* Feedback Status Badge */}
                  {feedbackMap.get(podcast.podcast_id)?.status && (
                    <div className={cn(
                      "absolute top-2 right-2 sm:top-3 sm:right-3 flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium backdrop-blur-sm",
                      feedbackMap.get(podcast.podcast_id)?.status === 'approved'
                        ? "bg-green-500/90 text-white"
                        : "bg-red-500/90 text-white"
                    )}>
                      {feedbackMap.get(podcast.podcast_id)?.status === 'approved' ? (
                        <>
                          <CheckCircle2 className="h-3 w-3" />
                          <span className="hidden sm:inline">Approved</span>
                        </>
                      ) : (
                        <>
                          <X className="h-3 w-3" />
                          <span className="hidden sm:inline">Rejected</span>
                        </>
                      )}
                    </div>
                  )}

                  {/* Badges on image */}
                  <div className="absolute bottom-2 sm:bottom-3 left-2 sm:left-3 right-2 sm:right-3 flex items-center gap-1.5 sm:gap-2">
                    {podcast.audience_size && (
                      <Badge className="bg-black/70 hover:bg-black/70 text-white border-0 backdrop-blur-sm text-xs px-2 py-0.5">
                        <Users className="h-3 w-3 mr-1" />
                        {formatNumber(podcast.audience_size)}
                      </Badge>
                    )}
                    {podcast.last_posted_at && (
                      <Badge className="bg-green-600/90 hover:bg-green-600/90 text-white border-0 backdrop-blur-sm text-xs px-2 py-0.5">
                        <Clock className="h-3 w-3 mr-1" />
                        Active
                      </Badge>
                    )}
                  </div>
                </div>

                {/* Content */}
                <div className="p-3 sm:p-4 space-y-2 sm:space-y-3">
                  <h3 className="font-semibold text-sm sm:text-base line-clamp-2 group-hover:text-primary transition-colors">
                    {podcast.podcast_name}
                  </h3>

                  {podcast.publisher_name && (
                    <p className="text-xs sm:text-sm text-muted-foreground truncate">
                      by {podcast.publisher_name}
                    </p>
                  )}

                  {/* Stats Row */}
                  <div className="flex items-center gap-3 text-xs text-muted-foreground">
                    {podcast.audience_size && (
                      <div className="flex items-center gap-1">
                        <Users className="h-3.5 w-3.5" />
                        <span className="font-medium">{formatNumber(podcast.audience_size)}</span>
                      </div>
                    )}
                    {podcast.episode_count && (
                      <div className="flex items-center gap-1">
                        <Mic className="h-3.5 w-3.5" />
                        <span>{podcast.episode_count} eps</span>
                      </div>
                    )}
                    {podcast.last_posted_at && (
                      <div className="flex items-center gap-1 text-green-600 dark:text-green-400">
                        <Clock className="h-3.5 w-3.5" />
                        <span>{formatDistanceToNow(new Date(podcast.last_posted_at), { addSuffix: true })}</span>
                      </div>
                    )}
                  </div>

                  {/* Categories */}
                  {podcast.podcast_categories && podcast.podcast_categories.length > 0 && (
                    <div className="flex flex-wrap gap-1">
                      {podcast.podcast_categories.slice(0, 2).map((cat) => (
                        <span
                          key={cat.category_id}
                          className="px-2 py-0.5 bg-slate-100 dark:bg-slate-800 text-[10px] sm:text-xs rounded-full text-muted-foreground"
                        >
                          {cat.category_name}
                        </span>
                      ))}
                      {podcast.podcast_categories.length > 2 && (
                        <span className="px-2 py-0.5 bg-slate-100 dark:bg-slate-800 text-[10px] sm:text-xs rounded-full text-muted-foreground">
                          +{podcast.podcast_categories.length - 2}
                        </span>
                      )}
                    </div>
                  )}

                  {/* View Details */}
                  <div className="flex items-center justify-end pt-1">
                    <span className="text-xs text-primary font-medium opacity-0 group-hover:opacity-100 transition-opacity flex items-center gap-1">
                      View Details
                      <ChevronRight className="h-3.5 w-3.5" />
                    </span>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
          </div>
        )}
      </div>

      {/* Footer */}
      <footer className="border-t bg-white/50 dark:bg-slate-900/50 backdrop-blur-sm mt-8 sm:mt-12">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-4 sm:py-6 text-center">
          <p className="text-xs sm:text-sm text-muted-foreground">
            Powered by <span className="font-semibold text-foreground">Authority Built</span>
          </p>
        </div>
      </footer>

      {/* Side Panel */}
      <Sheet open={!!selectedPodcast} onOpenChange={() => setSelectedPodcast(null)}>
        <SheetContent className="w-full sm:max-w-xl p-0 overflow-hidden border-l-0 shadow-2xl">
          {selectedPodcast && (
            <div className="flex flex-col h-[90vh] sm:h-full">
              {/* Hero Header with Image */}
              <div className="relative h-44 sm:h-64 overflow-hidden flex-shrink-0">
                {selectedPodcast.podcast_image_url ? (
                  <img
                    src={selectedPodcast.podcast_image_url}
                    alt={selectedPodcast.podcast_name}
                    className="w-full h-full object-cover"
                  />
                ) : (
                  <div className="w-full h-full bg-gradient-to-br from-primary to-purple-600 flex items-center justify-center">
                    <Mic className="h-16 w-16 sm:h-20 sm:w-20 text-white/30" />
                  </div>
                )}
                {/* Gradient overlays */}
                <div className="absolute inset-0 bg-gradient-to-t from-black via-black/50 to-transparent" />
                <div className="absolute inset-0 bg-gradient-to-r from-black/30 to-transparent" />

                {/* Drag handle for mobile */}
                <div className="absolute top-2 left-1/2 -translate-x-1/2 w-12 h-1.5 bg-white/30 rounded-full sm:hidden" />

                {/* Close button */}
                <Button
                  variant="ghost"
                  size="icon"
                  className="absolute top-3 right-3 sm:top-4 sm:right-4 h-9 w-9 sm:h-10 sm:w-10 rounded-full bg-white/10 hover:bg-white/20 text-white backdrop-blur-sm border border-white/20"
                  onClick={() => setSelectedPodcast(null)}
                >
                  <X className="h-5 w-5" />
                </Button>

                {/* Content on image */}
                <div className="absolute bottom-0 left-0 right-0 p-4 sm:p-6">
                  {/* Badges */}
                  <div className="flex flex-wrap gap-1.5 sm:gap-2 mb-2 sm:mb-3">
                    {selectedPodcast.itunes_rating && selectedPodcast.itunes_rating >= 4.5 && (
                      <Badge className="bg-amber-500 hover:bg-amber-500 text-white border-0 text-xs">
                        <Award className="h-3 w-3 mr-1" />
                        Top Rated
                      </Badge>
                    )}
                    {selectedPodcast.audience_size && selectedPodcast.audience_size >= 50000 && (
                      <Badge className="bg-green-500 hover:bg-green-500 text-white border-0 text-xs">
                        <TrendingUp className="h-3 w-3 mr-1" />
                        High Reach
                      </Badge>
                    )}
                    {selectedPodcast.episode_count && selectedPodcast.episode_count >= 100 && (
                      <Badge className="bg-purple-500 hover:bg-purple-500 text-white border-0 text-xs">
                        <Zap className="h-3 w-3 mr-1" />
                        Established
                      </Badge>
                    )}
                  </div>

                  <h2 className="text-xl sm:text-2xl font-bold text-white line-clamp-2 mb-1">{selectedPodcast.podcast_name}</h2>
                  {selectedPodcast.publisher_name && (
                    <p className="text-white/70 text-xs sm:text-sm">by {selectedPodcast.publisher_name}</p>
                  )}
                </div>
              </div>

              {/* Quick Stats Bar */}
              <div className="flex-shrink-0 bg-gradient-to-r from-slate-900 to-slate-800 text-white">
                <div className="grid grid-cols-3 divide-x divide-white/10">
                  <div className="p-2.5 sm:p-4 text-center">
                    <div className="flex items-center justify-center gap-1 sm:gap-1.5 mb-0.5 sm:mb-1">
                      <Star className="h-4 w-4 sm:h-5 sm:w-5 text-yellow-400 fill-yellow-400" />
                      <span className="text-lg sm:text-2xl font-bold">
                        {selectedPodcast.itunes_rating ? Number(selectedPodcast.itunes_rating).toFixed(1) : '-'}
                      </span>
                    </div>
                    <p className="text-[10px] sm:text-xs text-white/60 uppercase tracking-wide">Rating</p>
                  </div>
                  <div className="p-2.5 sm:p-4 text-center">
                    <div className="flex items-center justify-center gap-1 sm:gap-1.5 mb-0.5 sm:mb-1">
                      <Users className="h-4 w-4 sm:h-5 sm:w-5 text-blue-400" />
                      <span className="text-lg sm:text-2xl font-bold">
                        {selectedPodcast.audience_size ? formatNumber(selectedPodcast.audience_size) : '-'}
                      </span>
                    </div>
                    <p className="text-[10px] sm:text-xs text-white/60 uppercase tracking-wide">Listeners</p>
                  </div>
                  <div className="p-2.5 sm:p-4 text-center">
                    <div className="flex items-center justify-center gap-1 sm:gap-1.5 mb-0.5 sm:mb-1">
                      <BarChart3 className="h-4 w-4 sm:h-5 sm:w-5 text-purple-400" />
                      <span className="text-lg sm:text-2xl font-bold">
                        {selectedPodcast.episode_count || '-'}
                      </span>
                    </div>
                    <p className="text-[10px] sm:text-xs text-white/60 uppercase tracking-wide">Episodes</p>
                  </div>
                </div>
              </div>

              {/* Scrollable Content */}
              <ScrollArea className="flex-1">
                <div className="p-4 sm:p-6 space-y-4 sm:space-y-6">
                  {/* About Section */}
                  <div className="space-y-2 sm:space-y-3">
                    <h3 className="text-[10px] sm:text-xs font-bold text-muted-foreground uppercase tracking-widest">About This Podcast</h3>
                    {isAnalyzing ? (
                      <div className="space-y-2">
                        <div className="h-4 bg-muted rounded animate-pulse w-full" />
                        <div className="h-4 bg-muted rounded animate-pulse w-5/6" />
                        <div className="h-4 bg-muted rounded animate-pulse w-4/6" />
                      </div>
                    ) : (
                      <p className="text-sm leading-relaxed text-muted-foreground">
                        {fitAnalysis?.clean_description || selectedPodcast.podcast_description || 'No description available'}
                      </p>
                    )}
                  </div>

                  {/* Categories */}
                  {selectedPodcast.podcast_categories && selectedPodcast.podcast_categories.length > 0 && (
                    <div className="space-y-2 sm:space-y-3">
                      <h3 className="text-[10px] sm:text-xs font-bold text-muted-foreground uppercase tracking-widest flex items-center gap-1.5">
                        <Tag className="h-3 w-3" />
                        Categories
                      </h3>
                      <div className="flex flex-wrap gap-1.5 sm:gap-2">
                        {selectedPodcast.podcast_categories.map((cat) => (
                          <Badge
                            key={cat.category_id}
                            variant="secondary"
                            className="text-xs px-2 py-0.5 bg-primary/10 text-primary border-0"
                          >
                            {cat.category_name}
                          </Badge>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Why It's a Great Fit */}
                  {dashboard.prospect_bio && (
                    <>
                      <div className="rounded-xl sm:rounded-2xl bg-gradient-to-br from-amber-50 to-orange-50 dark:from-amber-950/30 dark:to-orange-950/30 p-3.5 sm:p-5 border border-amber-200/50 dark:border-amber-800/50">
                        <div className="flex items-center gap-2.5 sm:gap-3 mb-3 sm:mb-4">
                          <div className="h-8 w-8 sm:h-10 sm:w-10 rounded-lg sm:rounded-xl bg-gradient-to-br from-amber-500 to-orange-500 flex items-center justify-center shadow-lg">
                            <Sparkles className="h-4 w-4 sm:h-5 sm:w-5 text-white" />
                          </div>
                          <div>
                            <h3 className="font-bold text-sm sm:text-base text-amber-900 dark:text-amber-100">Why This Is Perfect For You</h3>
                            <p className="text-[10px] sm:text-xs text-amber-700 dark:text-amber-300">AI-powered analysis</p>
                          </div>
                        </div>

                        {isAnalyzing ? (
                          <div className="space-y-3">
                            {[1, 2, 3].map((i) => (
                              <div key={i} className="flex items-start gap-3">
                                <div className="h-6 w-6 bg-amber-200 dark:bg-amber-800 rounded-full animate-pulse shrink-0" />
                                <div className="flex-1 h-4 bg-amber-200 dark:bg-amber-800 rounded animate-pulse" />
                              </div>
                            ))}
                          </div>
                        ) : fitAnalysis?.fit_reasons && fitAnalysis.fit_reasons.length > 0 ? (
                          <ul className="space-y-3">
                            {fitAnalysis.fit_reasons.map((reason, idx) => (
                              <li key={idx} className="flex items-start gap-3">
                                <div className="h-6 w-6 rounded-full bg-green-500 flex items-center justify-center shrink-0 mt-0.5">
                                  <CheckCircle2 className="h-4 w-4 text-white" />
                                </div>
                                <span className="text-sm text-amber-900 dark:text-amber-100">{reason}</span>
                              </li>
                            ))}
                          </ul>
                        ) : (
                          <div className="flex items-center gap-2 text-amber-700 dark:text-amber-300">
                            <Loader2 className="h-4 w-4 animate-spin" />
                            <span className="text-sm">Analyzing fit...</span>
                          </div>
                        )}
                      </div>

                      {/* Pitch Angles */}
                      <div className="rounded-xl sm:rounded-2xl bg-gradient-to-br from-purple-50 to-violet-50 dark:from-purple-950/30 dark:to-violet-950/30 p-3.5 sm:p-5 border border-purple-200/50 dark:border-purple-800/50">
                        <div className="flex items-center gap-2.5 sm:gap-3 mb-3 sm:mb-4">
                          <div className="h-8 w-8 sm:h-10 sm:w-10 rounded-lg sm:rounded-xl bg-gradient-to-br from-purple-500 to-violet-500 flex items-center justify-center shadow-lg">
                            <Target className="h-4 w-4 sm:h-5 sm:w-5 text-white" />
                          </div>
                          <div>
                            <h3 className="font-bold text-sm sm:text-base text-purple-900 dark:text-purple-100">Suggested Pitch Angles</h3>
                            <p className="text-[10px] sm:text-xs text-purple-700 dark:text-purple-300">Ways to approach this podcast</p>
                          </div>
                        </div>

                        {isAnalyzing ? (
                          <div className="space-y-3">
                            {[1, 2, 3].map((i) => (
                              <div key={i} className="p-4 bg-white/50 dark:bg-white/5 rounded-xl space-y-2">
                                <div className="h-4 bg-purple-200 dark:bg-purple-800 rounded animate-pulse w-2/3" />
                                <div className="h-3 bg-purple-100 dark:bg-purple-900 rounded animate-pulse w-full" />
                              </div>
                            ))}
                          </div>
                        ) : fitAnalysis?.pitch_angles && fitAnalysis.pitch_angles.length > 0 ? (
                          <div className="space-y-3">
                            {fitAnalysis.pitch_angles.map((angle, idx) => (
                              <div
                                key={idx}
                                className="p-4 bg-white/70 dark:bg-white/5 rounded-xl border border-purple-100 dark:border-purple-800/50 hover:border-purple-300 dark:hover:border-purple-700 transition-colors"
                              >
                                <div className="flex items-start gap-3">
                                  <span className="flex items-center justify-center h-7 w-7 rounded-lg bg-gradient-to-br from-purple-600 to-violet-600 text-white text-sm font-bold shrink-0 shadow">
                                    {idx + 1}
                                  </span>
                                  <div className="space-y-1">
                                    <h4 className="font-semibold text-purple-900 dark:text-purple-100">{angle.title}</h4>
                                    <p className="text-sm text-purple-700 dark:text-purple-300">{angle.description}</p>
                                  </div>
                                </div>
                              </div>
                            ))}
                          </div>
                        ) : (
                          <div className="flex items-center gap-2 text-purple-700 dark:text-purple-300">
                            <Loader2 className="h-4 w-4 animate-spin" />
                            <span className="text-sm">Generating pitch ideas...</span>
                          </div>
                        )}
                      </div>
                    </>
                  )}

                  {/* Demographics */}
                  {(isLoadingDemographics || demographics) && (
                    <div className="rounded-xl sm:rounded-2xl bg-gradient-to-br from-blue-50 to-cyan-50 dark:from-blue-950/30 dark:to-cyan-950/30 p-3.5 sm:p-5 border border-blue-200/50 dark:border-blue-800/50">
                      <div className="flex items-center gap-2.5 sm:gap-3 mb-3 sm:mb-4">
                        <div className="h-8 w-8 sm:h-10 sm:w-10 rounded-lg sm:rounded-xl bg-gradient-to-br from-blue-500 to-cyan-500 flex items-center justify-center shadow-lg">
                          <Globe className="h-4 w-4 sm:h-5 sm:w-5 text-white" />
                        </div>
                        <div>
                          <h3 className="font-bold text-sm sm:text-base text-blue-900 dark:text-blue-100">Audience Profile</h3>
                          <p className="text-[10px] sm:text-xs text-blue-700 dark:text-blue-300">Know who you'll reach</p>
                        </div>
                      </div>

                      {isLoadingDemographics ? (
                        <div className="grid grid-cols-2 gap-2 sm:gap-3">
                          {[1, 2, 3, 4].map((i) => (
                            <div key={i} className="p-3 sm:p-4 bg-white/50 dark:bg-white/5 rounded-lg sm:rounded-xl space-y-2">
                              <div className="h-3 bg-blue-200 dark:bg-blue-800 rounded animate-pulse w-1/2" />
                              <div className="h-5 bg-blue-100 dark:bg-blue-900 rounded animate-pulse w-3/4" />
                            </div>
                          ))}
                        </div>
                      ) : demographics && (
                        <div className="grid grid-cols-2 gap-2 sm:gap-3">
                          <div className="p-3 sm:p-4 bg-white/70 dark:bg-white/5 rounded-lg sm:rounded-xl border border-blue-100 dark:border-blue-800/50">
                            <p className="text-[10px] sm:text-xs font-medium text-blue-600 dark:text-blue-400 mb-0.5 sm:mb-1">Age Group</p>
                            <p className="font-bold text-sm sm:text-base text-blue-900 dark:text-blue-100">{demographics.age}</p>
                          </div>
                          <div className="p-3 sm:p-4 bg-white/70 dark:bg-white/5 rounded-lg sm:rounded-xl border border-pink-100 dark:border-pink-800/50">
                            <p className="text-[10px] sm:text-xs font-medium text-pink-600 dark:text-pink-400 mb-0.5 sm:mb-1">Gender Split</p>
                            <p className="font-bold text-sm sm:text-base text-pink-900 dark:text-pink-100 capitalize">{demographics.gender_skew?.replace(/_/g, ' ')}</p>
                          </div>
                          <div className="p-3 sm:p-4 bg-white/70 dark:bg-white/5 rounded-lg sm:rounded-xl border border-green-100 dark:border-green-800/50">
                            <p className="text-[10px] sm:text-xs font-medium text-green-600 dark:text-green-400 mb-0.5 sm:mb-1">Buying Power</p>
                            <p className="font-bold text-sm sm:text-base text-green-900 dark:text-green-100 capitalize">{demographics.purchasing_power}</p>
                          </div>
                          <div className="p-3 sm:p-4 bg-white/70 dark:bg-white/5 rounded-lg sm:rounded-xl border border-purple-100 dark:border-purple-800/50">
                            <p className="text-[10px] sm:text-xs font-medium text-purple-600 dark:text-purple-400 mb-0.5 sm:mb-1">Education</p>
                            <p className="font-bold text-sm sm:text-base text-purple-900 dark:text-purple-100 capitalize">{demographics.education_level}</p>
                          </div>
                        </div>
                      )}
                    </div>
                  )}

                  {/* Feedback Section */}
                  <div className="mt-6 pt-6 border-t border-slate-200 dark:border-slate-700">
                    <h3 className="text-[10px] sm:text-xs font-bold text-muted-foreground uppercase tracking-widest mb-4 flex items-center gap-2">
                      <MessageSquare className="h-3 w-3" />
                      Your Feedback
                    </h3>

                    {/* Current Status Display */}
                    {(() => {
                      const feedback = feedbackMap.get(selectedPodcast.podcast_id)
                      if (feedback?.status) {
                        return (
                          <div className={cn(
                            "mb-4 p-3 rounded-lg border",
                            feedback.status === 'approved'
                              ? "bg-green-50 dark:bg-green-950/30 border-green-200 dark:border-green-800"
                              : "bg-red-50 dark:bg-red-950/30 border-red-200 dark:border-red-800"
                          )}>
                            <div className="flex items-center gap-2">
                              {feedback.status === 'approved' ? (
                                <CheckCircle2 className="h-4 w-4 text-green-600 dark:text-green-400" />
                              ) : (
                                <X className="h-4 w-4 text-red-600 dark:text-red-400" />
                              )}
                              <span className={cn(
                                "text-sm font-medium",
                                feedback.status === 'approved'
                                  ? "text-green-700 dark:text-green-300"
                                  : "text-red-700 dark:text-red-300"
                              )}>
                                {feedback.status === 'approved' ? 'You approved this podcast' : 'You rejected this podcast'}
                              </span>
                            </div>
                          </div>
                        )
                      }
                      return null
                    })()}

                    {/* Approve/Reject Buttons */}
                    <div className="flex gap-3 mb-4">
                      <Button
                        variant={feedbackMap.get(selectedPodcast.podcast_id)?.status === 'approved' ? 'default' : 'outline'}
                        className={cn(
                          "flex-1 gap-2",
                          feedbackMap.get(selectedPodcast.podcast_id)?.status === 'approved'
                            ? "bg-green-600 hover:bg-green-700 text-white"
                            : "hover:bg-green-50 hover:text-green-700 hover:border-green-300 dark:hover:bg-green-950/30"
                        )}
                        onClick={() => saveFeedback(selectedPodcast.podcast_id, 'approved')}
                        disabled={isSavingFeedback}
                      >
                        <ThumbsUp className="h-4 w-4" />
                        Approve
                      </Button>
                      <Button
                        variant={feedbackMap.get(selectedPodcast.podcast_id)?.status === 'rejected' ? 'default' : 'outline'}
                        className={cn(
                          "flex-1 gap-2",
                          feedbackMap.get(selectedPodcast.podcast_id)?.status === 'rejected'
                            ? "bg-red-600 hover:bg-red-700 text-white"
                            : "hover:bg-red-50 hover:text-red-700 hover:border-red-300 dark:hover:bg-red-950/30"
                        )}
                        onClick={() => saveFeedback(selectedPodcast.podcast_id, 'rejected')}
                        disabled={isSavingFeedback}
                      >
                        <ThumbsDown className="h-4 w-4" />
                        Reject
                      </Button>
                    </div>

                    {/* Notes Section */}
                    <div className="space-y-2">
                      <label className="text-xs font-medium text-muted-foreground">
                        Add a note (optional)
                      </label>
                      <Textarea
                        placeholder="Any thoughts or questions about this podcast..."
                        value={currentNotes}
                        onChange={(e) => setCurrentNotes(e.target.value)}
                        className="min-h-[80px] resize-none text-sm"
                      />
                      <Button
                        variant="outline"
                        size="sm"
                        className="w-full gap-2"
                        onClick={() => {
                          const existing = feedbackMap.get(selectedPodcast.podcast_id)
                          saveFeedback(selectedPodcast.podcast_id, existing?.status || null, currentNotes)
                        }}
                        disabled={isSavingFeedback || currentNotes === (feedbackMap.get(selectedPodcast.podcast_id)?.notes || '')}
                      >
                        {isSavingFeedback ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                          <Check className="h-4 w-4" />
                        )}
                        Save Note
                      </Button>
                    </div>
                  </div>
                </div>
              </ScrollArea>

            </div>
          )}
        </SheetContent>
      </Sheet>
    </div>
  )
}
