import { useState, useEffect } from 'react'
import { useParams } from 'react-router-dom'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Separator } from '@/components/ui/separator'
import { supabase } from '@/lib/supabase'
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
  ArrowRight
} from 'lucide-react'
import { getPodcastDemographics, type PodcastDemographics } from '@/services/podscan'
import { cn } from '@/lib/utils'

interface ProspectDashboard {
  id: string
  slug: string
  prospect_name: string
  prospect_bio: string | null
  spreadsheet_id: string
  spreadsheet_url: string
  is_active: boolean
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

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY

export default function ProspectView() {
  const { slug } = useParams<{ slug: string }>()

  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [dashboard, setDashboard] = useState<ProspectDashboard | null>(null)
  const [podcasts, setPodcasts] = useState<OutreachPodcast[]>([])

  // Side panel state
  const [selectedPodcast, setSelectedPodcast] = useState<OutreachPodcast | null>(null)
  const [isAnalyzing, setIsAnalyzing] = useState(false)
  const [fitAnalysis, setFitAnalysis] = useState<PodcastFitAnalysis | null>(null)
  const [isLoadingDemographics, setIsLoadingDemographics] = useState(false)
  const [demographics, setDemographics] = useState<PodcastDemographics | null>(null)

  // Cache for analyses
  const [analysisCache, setAnalysisCache] = useState<Map<string, PodcastFitAnalysis>>(new Map())

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

        // Fetch podcasts from Google Sheet via edge function
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
      } catch (err) {
        console.error('Error fetching dashboard:', err)
        setError('Failed to load dashboard')
      } finally {
        setLoading(false)
      }
    }

    fetchDashboard()
  }, [slug])

  // Analyze podcast fit when side panel opens
  useEffect(() => {
    if (!selectedPodcast || !dashboard?.prospect_bio) {
      setFitAnalysis(null)
      return
    }

    const cached = analysisCache.get(selectedPodcast.podcast_id)
    if (cached) {
      setFitAnalysis(cached)
      return
    }

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

  // Fetch demographics when side panel opens
  useEffect(() => {
    if (!selectedPodcast) {
      setDemographics(null)
      return
    }

    const fetchDemographics = async () => {
      setIsLoadingDemographics(true)
      try {
        const data = await getPodcastDemographics(selectedPodcast.podcast_id)
        setDemographics(data)
      } catch (err) {
        console.error('Error fetching demographics:', err)
      } finally {
        setIsLoadingDemographics(false)
      }
    }

    fetchDemographics()
  }, [selectedPodcast])

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

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-slate-100 dark:from-slate-950 dark:via-slate-900 dark:to-slate-950">
      {/* Hero Header */}
      <div className="relative overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-r from-primary/5 via-purple-500/5 to-pink-500/5" />
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-primary/10 via-transparent to-transparent" />

        <div className="relative max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-12 sm:py-16">
          <div className="text-center space-y-4">
            <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-primary/10 text-primary text-sm font-medium">
              <Radio className="h-4 w-4" />
              Curated Podcast Opportunities
            </div>

            <h1 className="text-3xl sm:text-4xl lg:text-5xl font-bold tracking-tight">
              Hi, <span className="text-primary">{dashboard.prospect_name}</span>
            </h1>

            <p className="text-lg sm:text-xl text-muted-foreground max-w-2xl mx-auto">
              We've identified {podcasts.length} podcast{podcasts.length !== 1 ? 's' : ''} that would be perfect for your expertise
            </p>

            {dashboard.prospect_bio && (
              <p className="text-sm text-muted-foreground max-w-xl mx-auto italic">
                "{dashboard.prospect_bio}"
              </p>
            )}
          </div>

        </div>
      </div>

      {/* Stats Cards Section */}
      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 -mt-6 relative z-10">
        <div className="grid grid-cols-2 lg:grid-cols-5 gap-3 sm:gap-4">
          {/* Total Podcasts */}
          <Card className="border-0 shadow-lg bg-white dark:bg-slate-900">
            <CardContent className="p-4 sm:p-6 text-center">
              <Headphones className="h-8 w-8 mx-auto mb-2 text-primary" />
              <p className="text-3xl sm:text-4xl font-bold">{podcasts.length}</p>
              <p className="text-xs sm:text-sm text-muted-foreground mt-1">Podcasts</p>
            </CardContent>
          </Card>

          {/* Total Potential Reach */}
          <Card className="border-0 shadow-lg bg-white dark:bg-slate-900">
            <CardContent className="p-4 sm:p-6 text-center">
              <TrendingUp className="h-8 w-8 mx-auto mb-2 text-green-600" />
              <p className="text-3xl sm:text-4xl font-bold text-green-600">{formatNumber(totalReach)}</p>
              <p className="text-xs sm:text-sm text-muted-foreground mt-1">Total Reach</p>
            </CardContent>
          </Card>

          {/* Avg Listeners Per Episode */}
          <Card className="border-0 shadow-lg bg-white dark:bg-slate-900">
            <CardContent className="p-4 sm:p-6 text-center">
              <Users className="h-8 w-8 mx-auto mb-2 text-blue-600" />
              <p className="text-3xl sm:text-4xl font-bold text-blue-600">{formatNumber(avgListenersPerEpisode)}</p>
              <p className="text-xs sm:text-sm text-muted-foreground mt-1">Avg Listeners</p>
            </CardContent>
          </Card>

          {/* Average Rating */}
          <Card className="border-0 shadow-lg bg-white dark:bg-slate-900">
            <CardContent className="p-4 sm:p-6 text-center">
              <Star className="h-8 w-8 mx-auto mb-2 text-amber-500 fill-amber-500" />
              <p className="text-3xl sm:text-4xl font-bold text-amber-600">{avgRating > 0 ? avgRating.toFixed(1) : '-'}</p>
              <p className="text-xs sm:text-sm text-muted-foreground mt-1">Avg Rating</p>
            </CardContent>
          </Card>

          {/* Total Episodes */}
          <Card className="border-0 shadow-lg bg-white dark:bg-slate-900 col-span-2 lg:col-span-1">
            <CardContent className="p-4 sm:p-6 text-center">
              <Mic className="h-8 w-8 mx-auto mb-2 text-purple-600" />
              <p className="text-3xl sm:text-4xl font-bold text-purple-600">{formatNumber(totalEpisodes)}</p>
              <p className="text-xs sm:text-sm text-muted-foreground mt-1">Total Episodes</p>
            </CardContent>
          </Card>
        </div>

        {/* Highlights Row */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 sm:gap-4 mt-4">
          {/* Highest Reach */}
          {highestReachPodcast && highestReachPodcast.audience_size && (
            <Card
              className="border-0 shadow-lg bg-gradient-to-br from-green-50 to-emerald-50 dark:from-green-950/30 dark:to-emerald-950/30 cursor-pointer hover:shadow-xl transition-shadow"
              onClick={() => setSelectedPodcast(highestReachPodcast)}
            >
              <CardContent className="p-4 flex items-center gap-4">
                <div className="h-14 w-14 rounded-xl overflow-hidden flex-shrink-0 shadow-md">
                  {highestReachPodcast.podcast_image_url ? (
                    <img src={highestReachPodcast.podcast_image_url} alt="" className="w-full h-full object-cover" />
                  ) : (
                    <div className="w-full h-full bg-green-200 flex items-center justify-center">
                      <Mic className="h-6 w-6 text-green-600" />
                    </div>
                  )}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-xs font-semibold text-green-600 uppercase tracking-wide">Highest Reach</p>
                  <p className="font-semibold truncate">{highestReachPodcast.podcast_name}</p>
                  <p className="text-sm text-muted-foreground">{formatNumber(highestReachPodcast.audience_size)} listeners</p>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Top Rated */}
          {topRatedPodcast && topRatedPodcast.itunes_rating && (
            <Card
              className="border-0 shadow-lg bg-gradient-to-br from-amber-50 to-yellow-50 dark:from-amber-950/30 dark:to-yellow-950/30 cursor-pointer hover:shadow-xl transition-shadow"
              onClick={() => setSelectedPodcast(topRatedPodcast)}
            >
              <CardContent className="p-4 flex items-center gap-4">
                <div className="h-14 w-14 rounded-xl overflow-hidden flex-shrink-0 shadow-md">
                  {topRatedPodcast.podcast_image_url ? (
                    <img src={topRatedPodcast.podcast_image_url} alt="" className="w-full h-full object-cover" />
                  ) : (
                    <div className="w-full h-full bg-amber-200 flex items-center justify-center">
                      <Mic className="h-6 w-6 text-amber-600" />
                    </div>
                  )}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-xs font-semibold text-amber-600 uppercase tracking-wide">Top Rated</p>
                  <p className="font-semibold truncate">{topRatedPodcast.podcast_name}</p>
                  <p className="text-sm text-muted-foreground flex items-center gap-1">
                    <Star className="h-4 w-4 fill-amber-500 text-amber-500" />
                    {Number(topRatedPodcast.itunes_rating).toFixed(1)} rating
                  </p>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Most Established */}
          {mostEpisodesPodcast && mostEpisodesPodcast.episode_count && (
            <Card
              className="border-0 shadow-lg bg-gradient-to-br from-purple-50 to-violet-50 dark:from-purple-950/30 dark:to-violet-950/30 cursor-pointer hover:shadow-xl transition-shadow"
              onClick={() => setSelectedPodcast(mostEpisodesPodcast)}
            >
              <CardContent className="p-4 flex items-center gap-4">
                <div className="h-14 w-14 rounded-xl overflow-hidden flex-shrink-0 shadow-md">
                  {mostEpisodesPodcast.podcast_image_url ? (
                    <img src={mostEpisodesPodcast.podcast_image_url} alt="" className="w-full h-full object-cover" />
                  ) : (
                    <div className="w-full h-full bg-purple-200 flex items-center justify-center">
                      <Mic className="h-6 w-6 text-purple-600" />
                    </div>
                  )}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-xs font-semibold text-purple-600 uppercase tracking-wide">Most Established</p>
                  <p className="font-semibold truncate">{mostEpisodesPodcast.podcast_name}</p>
                  <p className="text-sm text-muted-foreground">{mostEpisodesPodcast.episode_count} episodes</p>
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      </div>

      {/* Podcast Grid */}
      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-8 sm:py-12">
        <div className="flex items-center justify-between mb-6">
          <p className="text-sm text-muted-foreground">
            Click any podcast to see why it's a great fit
          </p>
        </div>

        <div className="grid gap-4 sm:gap-6 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3">
          {podcasts.map((podcast, index) => (
            <Card
              key={podcast.podcast_id}
              className={cn(
                "group cursor-pointer border-0 shadow-md hover:shadow-xl transition-all duration-300 overflow-hidden",
                "hover:-translate-y-1 bg-white dark:bg-slate-900",
                selectedPodcast?.podcast_id === podcast.podcast_id && "ring-2 ring-primary shadow-xl -translate-y-1"
              )}
              onClick={() => setSelectedPodcast(podcast)}
            >
              <CardContent className="p-0">
                {/* Image */}
                <div className="relative aspect-[16/10] overflow-hidden bg-gradient-to-br from-slate-100 to-slate-200 dark:from-slate-800 dark:to-slate-900">
                  {podcast.podcast_image_url ? (
                    <img
                      src={podcast.podcast_image_url}
                      alt={podcast.podcast_name}
                      className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                    />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center">
                      <Mic className="h-12 w-12 text-muted-foreground/50" />
                    </div>
                  )}
                  {/* Overlay gradient */}
                  <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent" />

                  {/* Badges on image */}
                  <div className="absolute bottom-3 left-3 right-3 flex items-center gap-2">
                    {podcast.itunes_rating && (
                      <Badge className="bg-black/70 hover:bg-black/70 text-white border-0 backdrop-blur-sm">
                        <Star className="h-3 w-3 mr-1 fill-yellow-400 text-yellow-400" />
                        {Number(podcast.itunes_rating).toFixed(1)}
                      </Badge>
                    )}
                    {podcast.audience_size && (
                      <Badge className="bg-black/70 hover:bg-black/70 text-white border-0 backdrop-blur-sm">
                        <Users className="h-3 w-3 mr-1" />
                        {formatNumber(podcast.audience_size)}
                      </Badge>
                    )}
                  </div>
                </div>

                {/* Content */}
                <div className="p-4 space-y-2">
                  <h3 className="font-semibold text-base line-clamp-2 group-hover:text-primary transition-colors">
                    {podcast.podcast_name}
                  </h3>

                  {podcast.publisher_name && (
                    <p className="text-sm text-muted-foreground">
                      {podcast.publisher_name}
                    </p>
                  )}

                  <div className="flex items-center justify-between pt-2">
                    {podcast.episode_count && (
                      <span className="text-xs text-muted-foreground">
                        {podcast.episode_count} episodes
                      </span>
                    )}
                    <ChevronRight className="h-4 w-4 text-muted-foreground group-hover:text-primary group-hover:translate-x-1 transition-all" />
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>

      {/* Footer */}
      <footer className="border-t bg-white/50 dark:bg-slate-900/50 backdrop-blur-sm mt-12">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-6 text-center">
          <p className="text-sm text-muted-foreground">
            Powered by <span className="font-semibold text-foreground">Authority Built</span>
          </p>
        </div>
      </footer>

      {/* Side Panel */}
      <Sheet open={!!selectedPodcast} onOpenChange={() => setSelectedPodcast(null)}>
        <SheetContent className="w-full sm:max-w-xl p-0 overflow-hidden border-l-0 shadow-2xl">
          {selectedPodcast && (
            <div className="flex flex-col h-full">
              {/* Hero Header with Image */}
              <div className="relative h-56 sm:h-64 overflow-hidden flex-shrink-0">
                {selectedPodcast.podcast_image_url ? (
                  <img
                    src={selectedPodcast.podcast_image_url}
                    alt={selectedPodcast.podcast_name}
                    className="w-full h-full object-cover"
                  />
                ) : (
                  <div className="w-full h-full bg-gradient-to-br from-primary to-purple-600 flex items-center justify-center">
                    <Mic className="h-20 w-20 text-white/30" />
                  </div>
                )}
                {/* Gradient overlays */}
                <div className="absolute inset-0 bg-gradient-to-t from-black via-black/50 to-transparent" />
                <div className="absolute inset-0 bg-gradient-to-r from-black/30 to-transparent" />

                {/* Close button */}
                <Button
                  variant="ghost"
                  size="icon"
                  className="absolute top-4 right-4 h-10 w-10 rounded-full bg-white/10 hover:bg-white/20 text-white backdrop-blur-sm border border-white/20"
                  onClick={() => setSelectedPodcast(null)}
                >
                  <X className="h-5 w-5" />
                </Button>

                {/* Content on image */}
                <div className="absolute bottom-0 left-0 right-0 p-6">
                  {/* Badges */}
                  <div className="flex flex-wrap gap-2 mb-3">
                    {selectedPodcast.itunes_rating && selectedPodcast.itunes_rating >= 4.5 && (
                      <Badge className="bg-amber-500 hover:bg-amber-500 text-white border-0">
                        <Award className="h-3 w-3 mr-1" />
                        Top Rated
                      </Badge>
                    )}
                    {selectedPodcast.audience_size && selectedPodcast.audience_size >= 50000 && (
                      <Badge className="bg-green-500 hover:bg-green-500 text-white border-0">
                        <TrendingUp className="h-3 w-3 mr-1" />
                        High Reach
                      </Badge>
                    )}
                    {selectedPodcast.episode_count && selectedPodcast.episode_count >= 100 && (
                      <Badge className="bg-purple-500 hover:bg-purple-500 text-white border-0">
                        <Zap className="h-3 w-3 mr-1" />
                        Established
                      </Badge>
                    )}
                  </div>

                  <h2 className="text-2xl font-bold text-white line-clamp-2 mb-1">{selectedPodcast.podcast_name}</h2>
                  {selectedPodcast.publisher_name && (
                    <p className="text-white/70 text-sm">by {selectedPodcast.publisher_name}</p>
                  )}
                </div>
              </div>

              {/* Quick Stats Bar */}
              <div className="flex-shrink-0 bg-gradient-to-r from-slate-900 to-slate-800 text-white">
                <div className="grid grid-cols-3 divide-x divide-white/10">
                  <div className="p-4 text-center">
                    <div className="flex items-center justify-center gap-1.5 mb-1">
                      <Star className="h-5 w-5 text-yellow-400 fill-yellow-400" />
                      <span className="text-2xl font-bold">
                        {selectedPodcast.itunes_rating ? Number(selectedPodcast.itunes_rating).toFixed(1) : '-'}
                      </span>
                    </div>
                    <p className="text-xs text-white/60 uppercase tracking-wide">Rating</p>
                  </div>
                  <div className="p-4 text-center">
                    <div className="flex items-center justify-center gap-1.5 mb-1">
                      <Users className="h-5 w-5 text-blue-400" />
                      <span className="text-2xl font-bold">
                        {selectedPodcast.audience_size ? formatNumber(selectedPodcast.audience_size) : '-'}
                      </span>
                    </div>
                    <p className="text-xs text-white/60 uppercase tracking-wide">Listeners</p>
                  </div>
                  <div className="p-4 text-center">
                    <div className="flex items-center justify-center gap-1.5 mb-1">
                      <BarChart3 className="h-5 w-5 text-purple-400" />
                      <span className="text-2xl font-bold">
                        {selectedPodcast.episode_count || '-'}
                      </span>
                    </div>
                    <p className="text-xs text-white/60 uppercase tracking-wide">Episodes</p>
                  </div>
                </div>
              </div>

              {/* Scrollable Content */}
              <ScrollArea className="flex-1">
                <div className="p-6 space-y-6">
                  {/* About Section */}
                  <div className="space-y-3">
                    <h3 className="text-xs font-bold text-muted-foreground uppercase tracking-widest">About This Podcast</h3>
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

                  {/* Why It's a Great Fit */}
                  {dashboard.prospect_bio && (
                    <>
                      <div className="rounded-2xl bg-gradient-to-br from-amber-50 to-orange-50 dark:from-amber-950/30 dark:to-orange-950/30 p-5 border border-amber-200/50 dark:border-amber-800/50">
                        <div className="flex items-center gap-3 mb-4">
                          <div className="h-10 w-10 rounded-xl bg-gradient-to-br from-amber-500 to-orange-500 flex items-center justify-center shadow-lg">
                            <Sparkles className="h-5 w-5 text-white" />
                          </div>
                          <div>
                            <h3 className="font-bold text-amber-900 dark:text-amber-100">Why This Is Perfect For You</h3>
                            <p className="text-xs text-amber-700 dark:text-amber-300">AI-powered analysis</p>
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
                      <div className="rounded-2xl bg-gradient-to-br from-purple-50 to-violet-50 dark:from-purple-950/30 dark:to-violet-950/30 p-5 border border-purple-200/50 dark:border-purple-800/50">
                        <div className="flex items-center gap-3 mb-4">
                          <div className="h-10 w-10 rounded-xl bg-gradient-to-br from-purple-500 to-violet-500 flex items-center justify-center shadow-lg">
                            <Target className="h-5 w-5 text-white" />
                          </div>
                          <div>
                            <h3 className="font-bold text-purple-900 dark:text-purple-100">Suggested Pitch Angles</h3>
                            <p className="text-xs text-purple-700 dark:text-purple-300">Ways to approach this podcast</p>
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
                    <div className="rounded-2xl bg-gradient-to-br from-blue-50 to-cyan-50 dark:from-blue-950/30 dark:to-cyan-950/30 p-5 border border-blue-200/50 dark:border-blue-800/50">
                      <div className="flex items-center gap-3 mb-4">
                        <div className="h-10 w-10 rounded-xl bg-gradient-to-br from-blue-500 to-cyan-500 flex items-center justify-center shadow-lg">
                          <Globe className="h-5 w-5 text-white" />
                        </div>
                        <div>
                          <h3 className="font-bold text-blue-900 dark:text-blue-100">Audience Profile</h3>
                          <p className="text-xs text-blue-700 dark:text-blue-300">Know who you'll reach</p>
                        </div>
                      </div>

                      {isLoadingDemographics ? (
                        <div className="grid grid-cols-2 gap-3">
                          {[1, 2, 3, 4].map((i) => (
                            <div key={i} className="p-4 bg-white/50 dark:bg-white/5 rounded-xl space-y-2">
                              <div className="h-3 bg-blue-200 dark:bg-blue-800 rounded animate-pulse w-1/2" />
                              <div className="h-5 bg-blue-100 dark:bg-blue-900 rounded animate-pulse w-3/4" />
                            </div>
                          ))}
                        </div>
                      ) : demographics && (
                        <div className="grid grid-cols-2 gap-3">
                          <div className="p-4 bg-white/70 dark:bg-white/5 rounded-xl border border-blue-100 dark:border-blue-800/50">
                            <p className="text-xs font-medium text-blue-600 dark:text-blue-400 mb-1">Age Group</p>
                            <p className="font-bold text-blue-900 dark:text-blue-100">{demographics.age}</p>
                          </div>
                          <div className="p-4 bg-white/70 dark:bg-white/5 rounded-xl border border-pink-100 dark:border-pink-800/50">
                            <p className="text-xs font-medium text-pink-600 dark:text-pink-400 mb-1">Gender Split</p>
                            <p className="font-bold text-pink-900 dark:text-pink-100 capitalize">{demographics.gender_skew?.replace(/_/g, ' ')}</p>
                          </div>
                          <div className="p-4 bg-white/70 dark:bg-white/5 rounded-xl border border-green-100 dark:border-green-800/50">
                            <p className="text-xs font-medium text-green-600 dark:text-green-400 mb-1">Buying Power</p>
                            <p className="font-bold text-green-900 dark:text-green-100 capitalize">{demographics.purchasing_power}</p>
                          </div>
                          <div className="p-4 bg-white/70 dark:bg-white/5 rounded-xl border border-purple-100 dark:border-purple-800/50">
                            <p className="text-xs font-medium text-purple-600 dark:text-purple-400 mb-1">Education</p>
                            <p className="font-bold text-purple-900 dark:text-purple-100 capitalize">{demographics.education_level}</p>
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </ScrollArea>

              {/* Sticky Footer CTA */}
              {selectedPodcast.podcast_url && (
                <div className="flex-shrink-0 p-4 bg-white dark:bg-slate-900 border-t shadow-[0_-4px_20px_rgba(0,0,0,0.1)]">
                  <Button
                    className="w-full h-12 text-base font-semibold bg-gradient-to-r from-primary to-purple-600 hover:from-primary/90 hover:to-purple-600/90 shadow-lg"
                    onClick={() => window.open(selectedPodcast.podcast_url!, '_blank', 'noopener,noreferrer')}
                  >
                    Visit Podcast
                    <ArrowRight className="h-5 w-5 ml-2" />
                  </Button>
                </div>
              )}
            </div>
          )}
        </SheetContent>
      </Sheet>
    </div>
  )
}
