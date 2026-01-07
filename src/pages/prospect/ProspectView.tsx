import { useState, useEffect } from 'react'
import { useParams } from 'react-router-dom'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog'
import { supabase } from '@/lib/supabase'
import { toast } from 'sonner'
import {
  Mic,
  Users,
  Star,
  ExternalLink,
  Loader2,
  Sparkles,
  Target,
  CheckCircle2,
  FileText,
  LayoutGrid,
  List,
  ChevronLeft,
  ChevronRight
} from 'lucide-react'
import { getPodcastDemographics, type PodcastDemographics } from '@/services/podscan'

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

  // View and pagination
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid')
  const [page, setPage] = useState(1)
  const perPage = 12

  // Modal state
  const [viewingPodcast, setViewingPodcast] = useState<OutreachPodcast | null>(null)
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
        // Fetch dashboard record
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

  // Analyze podcast fit when modal opens
  useEffect(() => {
    if (!viewingPodcast || !dashboard?.prospect_bio) {
      setFitAnalysis(null)
      return
    }

    // Check cache first
    const cached = analysisCache.get(viewingPodcast.podcast_id)
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
            podcastId: viewingPodcast.podcast_id,
            podcastName: viewingPodcast.podcast_name,
            podcastDescription: viewingPodcast.podcast_description,
            podcastUrl: viewingPodcast.podcast_url,
            publisherName: viewingPodcast.publisher_name,
            itunesRating: viewingPodcast.itunes_rating,
            episodeCount: viewingPodcast.episode_count,
            audienceSize: viewingPodcast.audience_size,
            clientId: dashboard.id, // Use dashboard ID as client ID for caching
            clientName: dashboard.prospect_name,
            clientBio: dashboard.prospect_bio,
          }),
        })

        if (response.ok) {
          const data = await response.json()
          setFitAnalysis(data.analysis)
          setAnalysisCache(prev => new Map(prev).set(viewingPodcast.podcast_id, data.analysis))
        }
      } catch (err) {
        console.error('Error analyzing fit:', err)
      } finally {
        setIsAnalyzing(false)
      }
    }

    analyzefit()
  }, [viewingPodcast, dashboard, analysisCache])

  // Fetch demographics when modal opens
  useEffect(() => {
    if (!viewingPodcast) {
      setDemographics(null)
      return
    }

    const fetchDemographics = async () => {
      setIsLoadingDemographics(true)
      try {
        const data = await getPodcastDemographics(viewingPodcast.podcast_id)
        setDemographics(data)
      } catch (err) {
        console.error('Error fetching demographics:', err)
      } finally {
        setIsLoadingDemographics(false)
      }
    }

    fetchDemographics()
  }, [viewingPodcast])

  // Loading state
  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 dark:from-slate-950 dark:to-slate-900 flex items-center justify-center">
        <div className="text-center space-y-4">
          <Loader2 className="h-8 w-8 animate-spin mx-auto text-primary" />
          <p className="text-muted-foreground">Loading your podcast opportunities...</p>
        </div>
      </div>
    )
  }

  // Error state
  if (error || !dashboard) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 dark:from-slate-950 dark:to-slate-900 flex items-center justify-center p-4">
        <Card className="max-w-md w-full">
          <CardHeader className="text-center">
            <CardTitle className="text-destructive">Dashboard Not Available</CardTitle>
            <CardDescription>{error || 'This dashboard could not be found.'}</CardDescription>
          </CardHeader>
        </Card>
      </div>
    )
  }

  const totalPages = Math.ceil(podcasts.length / perPage)
  const paginatedPodcasts = podcasts.slice((page - 1) * perPage, page * perPage)

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 dark:from-slate-950 dark:to-slate-900">
      {/* Header */}
      <div className="bg-white dark:bg-slate-900 border-b shadow-sm">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
          <div className="text-center space-y-2">
            <h1 className="text-2xl sm:text-3xl font-bold text-primary">
              Podcast Opportunities
            </h1>
            <p className="text-lg text-muted-foreground">
              Curated for <span className="font-semibold text-foreground">{dashboard.prospect_name}</span>
            </p>
            {dashboard.prospect_bio && (
              <p className="text-sm text-muted-foreground max-w-2xl mx-auto line-clamp-2">
                {dashboard.prospect_bio}
              </p>
            )}
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Stats */}
        <div className="grid gap-4 md:grid-cols-3 mb-8">
          <Card>
            <CardContent className="pt-6">
              <div className="text-center">
                <p className="text-3xl font-bold text-primary">{podcasts.length}</p>
                <p className="text-sm text-muted-foreground">Podcast Opportunities</p>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6">
              <div className="text-center">
                <p className="text-3xl font-bold text-green-600">
                  {(() => {
                    const total = podcasts.reduce((sum, p) => sum + (p.audience_size || 0), 0)
                    if (total >= 1000000) return `${(total / 1000000).toFixed(1)}M`
                    if (total >= 1000) return `${(total / 1000).toFixed(0)}K`
                    return total.toLocaleString()
                  })()}
                </p>
                <p className="text-sm text-muted-foreground">Combined Reach</p>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6">
              <div className="text-center">
                <p className="text-3xl font-bold text-amber-600">
                  {(() => {
                    const ratings = podcasts.filter(p => p.itunes_rating).map(p => p.itunes_rating!)
                    if (ratings.length === 0) return '-'
                    return (ratings.reduce((a, b) => a + b, 0) / ratings.length).toFixed(1)
                  })()}
                </p>
                <p className="text-sm text-muted-foreground">Avg Rating</p>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* View Toggle */}
        <div className="flex items-center justify-between mb-6">
          <p className="text-sm text-muted-foreground">
            Click any podcast to see detailed insights and pitch angles
          </p>
          <div className="flex items-center gap-2">
            <Button
              variant={viewMode === 'grid' ? 'default' : 'outline'}
              size="sm"
              onClick={() => setViewMode('grid')}
            >
              <LayoutGrid className="h-4 w-4" />
            </Button>
            <Button
              variant={viewMode === 'list' ? 'default' : 'outline'}
              size="sm"
              onClick={() => setViewMode('list')}
            >
              <List className="h-4 w-4" />
            </Button>
          </div>
        </div>

        {/* Podcast Grid */}
        {viewMode === 'grid' && (
          <div className="grid gap-6 grid-cols-1 md:grid-cols-2 lg:grid-cols-3">
            {paginatedPodcasts.map((podcast) => (
              <Card
                key={podcast.podcast_id}
                className="cursor-pointer hover:shadow-lg transition-all hover:-translate-y-1"
                onClick={() => setViewingPodcast(podcast)}
              >
                <CardContent className="p-4 space-y-4">
                  {podcast.podcast_image_url ? (
                    <img
                      src={podcast.podcast_image_url}
                      alt={podcast.podcast_name}
                      className="w-full h-48 object-cover rounded-lg"
                    />
                  ) : (
                    <div className="w-full h-48 bg-muted rounded-lg flex items-center justify-center">
                      <Mic className="h-12 w-12 text-muted-foreground" />
                    </div>
                  )}
                  <div className="space-y-2">
                    <h3 className="font-semibold text-lg line-clamp-2">{podcast.podcast_name}</h3>
                    {podcast.podcast_description && (
                      <p className="text-sm text-muted-foreground line-clamp-2">
                        {analysisCache.get(podcast.podcast_id)?.clean_description || podcast.podcast_description}
                      </p>
                    )}
                    <div className="flex flex-wrap gap-2">
                      {podcast.audience_size && (
                        <Badge variant="secondary" className="text-xs">
                          <Users className="h-3 w-3 mr-1" />
                          {podcast.audience_size.toLocaleString()}
                        </Badge>
                      )}
                      {podcast.itunes_rating && (
                        <Badge variant="secondary" className="text-xs">
                          <Star className="h-3 w-3 mr-1 fill-yellow-500 text-yellow-500" />
                          {Number(podcast.itunes_rating).toFixed(1)}
                        </Badge>
                      )}
                    </div>
                    {podcast.publisher_name && (
                      <p className="text-xs text-muted-foreground">
                        By {podcast.publisher_name}
                      </p>
                    )}
                  </div>
                  <Button variant="outline" className="w-full">
                    View Details
                  </Button>
                </CardContent>
              </Card>
            ))}
          </div>
        )}

        {/* Podcast List */}
        {viewMode === 'list' && (
          <div className="space-y-4">
            {paginatedPodcasts.map((podcast) => (
              <Card
                key={podcast.podcast_id}
                className="cursor-pointer hover:shadow-md transition-shadow"
                onClick={() => setViewingPodcast(podcast)}
              >
                <CardContent className="p-4">
                  <div className="flex gap-4">
                    {podcast.podcast_image_url ? (
                      <img
                        src={podcast.podcast_image_url}
                        alt={podcast.podcast_name}
                        className="w-20 h-20 object-cover rounded-lg flex-shrink-0"
                      />
                    ) : (
                      <div className="w-20 h-20 bg-muted rounded-lg flex items-center justify-center flex-shrink-0">
                        <Mic className="h-8 w-8 text-muted-foreground" />
                      </div>
                    )}
                    <div className="flex-1 min-w-0 space-y-1">
                      <h3 className="font-semibold line-clamp-1">{podcast.podcast_name}</h3>
                      {podcast.publisher_name && (
                        <p className="text-sm text-muted-foreground">By {podcast.publisher_name}</p>
                      )}
                      <div className="flex flex-wrap gap-2">
                        {podcast.audience_size && (
                          <Badge variant="secondary" className="text-xs">
                            <Users className="h-3 w-3 mr-1" />
                            {podcast.audience_size.toLocaleString()}
                          </Badge>
                        )}
                        {podcast.itunes_rating && (
                          <Badge variant="secondary" className="text-xs">
                            <Star className="h-3 w-3 mr-1 fill-yellow-500 text-yellow-500" />
                            {Number(podcast.itunes_rating).toFixed(1)}
                          </Badge>
                        )}
                        {podcast.episode_count && (
                          <Badge variant="secondary" className="text-xs">
                            <Mic className="h-3 w-3 mr-1" />
                            {podcast.episode_count} eps
                          </Badge>
                        )}
                      </div>
                    </div>
                    <Button variant="outline" size="sm" className="flex-shrink-0">
                      Details
                    </Button>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="flex items-center justify-center gap-4 mt-8">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setPage(p => Math.max(1, p - 1))}
              disabled={page === 1}
            >
              <ChevronLeft className="h-4 w-4 mr-1" />
              Previous
            </Button>
            <span className="text-sm text-muted-foreground">
              Page {page} of {totalPages}
            </span>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setPage(p => Math.min(totalPages, p + 1))}
              disabled={page === totalPages}
            >
              Next
              <ChevronRight className="h-4 w-4 ml-1" />
            </Button>
          </div>
        )}
      </div>

      {/* Podcast Detail Modal */}
      <Dialog open={!!viewingPodcast} onOpenChange={() => setViewingPodcast(null)}>
        <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto w-[95vw] sm:w-full">
          <DialogHeader>
            <DialogTitle>Podcast Details</DialogTitle>
            <DialogDescription>
              AI-powered analysis for your outreach strategy
            </DialogDescription>
          </DialogHeader>
          {viewingPodcast && (
            <div className="space-y-6">
              {/* Podcast Header */}
              <div className="flex flex-col sm:flex-row gap-4 p-4 bg-gradient-to-r from-primary/5 to-purple-500/5 rounded-lg border">
                {viewingPodcast.podcast_image_url && (
                  <img
                    src={viewingPodcast.podcast_image_url}
                    alt={viewingPodcast.podcast_name}
                    className="w-20 h-20 sm:w-24 sm:h-24 rounded-lg object-cover shadow-md mx-auto sm:mx-0"
                  />
                )}
                <div className="flex-1 space-y-2 text-center sm:text-left">
                  <h3 className="text-xl font-bold">{viewingPodcast.podcast_name}</h3>
                  {viewingPodcast.publisher_name && (
                    <p className="text-sm text-muted-foreground">by {viewingPodcast.publisher_name}</p>
                  )}
                  <div className="flex flex-wrap items-center justify-center sm:justify-start gap-3 text-sm">
                    {viewingPodcast.itunes_rating && (
                      <span className="inline-flex items-center gap-1">
                        <Star className="h-4 w-4 text-yellow-500 fill-yellow-500" />
                        {Number(viewingPodcast.itunes_rating).toFixed(1)}
                      </span>
                    )}
                    {viewingPodcast.audience_size && (
                      <span className="inline-flex items-center gap-1">
                        <Users className="h-4 w-4 text-muted-foreground" />
                        {viewingPodcast.audience_size.toLocaleString()}
                      </span>
                    )}
                    {viewingPodcast.episode_count && (
                      <span className="inline-flex items-center gap-1">
                        <Mic className="h-4 w-4 text-muted-foreground" />
                        {viewingPodcast.episode_count} episodes
                      </span>
                    )}
                  </div>
                </div>
              </div>

              {/* About Section */}
              <div className="space-y-2">
                <h4 className="font-semibold flex items-center gap-2">
                  <FileText className="h-4 w-4 text-primary" />
                  About This Podcast
                </h4>
                {isAnalyzing ? (
                  <div className="space-y-2">
                    <div className="h-4 bg-muted rounded animate-pulse w-full" />
                    <div className="h-4 bg-muted rounded animate-pulse w-5/6" />
                    <div className="h-4 bg-muted rounded animate-pulse w-4/6" />
                  </div>
                ) : (
                  <p className="text-sm text-muted-foreground leading-relaxed">
                    {fitAnalysis?.clean_description || viewingPodcast.podcast_description || 'No description available'}
                  </p>
                )}
              </div>

              {/* Why This Is a Great Fit */}
              {dashboard.prospect_bio && (
                <div className="space-y-3">
                  <h4 className="font-semibold flex items-center gap-2">
                    <Sparkles className="h-4 w-4 text-amber-500" />
                    Why This Is a Great Fit for You
                  </h4>
                  {isAnalyzing ? (
                    <div className="space-y-2">
                      {[1, 2, 3].map((i) => (
                        <div key={i} className="flex items-start gap-2">
                          <div className="h-5 w-5 bg-muted rounded-full animate-pulse shrink-0 mt-0.5" />
                          <div className="flex-1 space-y-1">
                            <div className="h-4 bg-muted rounded animate-pulse w-full" />
                            <div className="h-4 bg-muted rounded animate-pulse w-3/4" />
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : fitAnalysis?.fit_reasons && fitAnalysis.fit_reasons.length > 0 ? (
                    <ul className="space-y-2">
                      {fitAnalysis.fit_reasons.map((reason, idx) => (
                        <li key={idx} className="flex items-start gap-2">
                          <CheckCircle2 className="h-5 w-5 text-green-500 shrink-0 mt-0.5" />
                          <span className="text-sm">{reason}</span>
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="text-sm text-muted-foreground italic">
                      Analyzing fit...
                    </p>
                  )}
                </div>
              )}

              {/* Potential Pitch Angles */}
              {dashboard.prospect_bio && (
                <div className="space-y-3">
                  <h4 className="font-semibold flex items-center gap-2">
                    <Target className="h-4 w-4 text-purple-500" />
                    Potential Pitch Angles
                  </h4>
                  {isAnalyzing ? (
                    <div className="space-y-3">
                      {[1, 2, 3].map((i) => (
                        <div key={i} className="p-4 border rounded-lg space-y-2">
                          <div className="h-5 bg-muted rounded animate-pulse w-2/3" />
                          <div className="h-4 bg-muted rounded animate-pulse w-full" />
                          <div className="h-4 bg-muted rounded animate-pulse w-5/6" />
                        </div>
                      ))}
                    </div>
                  ) : fitAnalysis?.pitch_angles && fitAnalysis.pitch_angles.length > 0 ? (
                    <div className="space-y-3">
                      {fitAnalysis.pitch_angles.map((angle, idx) => (
                        <div key={idx} className="p-4 border rounded-lg bg-gradient-to-r from-purple-500/5 to-transparent hover:from-purple-500/10 transition-colors">
                          <div className="flex items-start gap-3">
                            <span className="flex items-center justify-center w-6 h-6 rounded-full bg-purple-500/10 text-purple-600 text-sm font-bold shrink-0">
                              {idx + 1}
                            </span>
                            <div className="space-y-1">
                              <h5 className="font-medium">{angle.title}</h5>
                              <p className="text-sm text-muted-foreground">{angle.description}</p>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="text-sm text-muted-foreground italic">
                      Generating pitch ideas...
                    </p>
                  )}
                </div>
              )}

              {/* Audience Demographics */}
              {(isLoadingDemographics || demographics) && (
                <div className="bg-gradient-to-br from-blue-50 to-cyan-50 dark:from-blue-950/20 dark:to-cyan-950/20 border-2 border-blue-200 dark:border-blue-800 rounded-lg p-4">
                  <div className="flex items-start gap-3 mb-4">
                    <div className="h-10 w-10 rounded-full bg-gradient-to-br from-blue-600 to-cyan-600 flex items-center justify-center flex-shrink-0">
                      <Users className="h-5 w-5 text-white" />
                    </div>
                    <div>
                      <h4 className="font-semibold text-blue-900 dark:text-blue-100">Who's Listening</h4>
                      <p className="text-xs text-blue-700 dark:text-blue-300">Know exactly who you'll reach on this podcast</p>
                    </div>
                  </div>
                  {isLoadingDemographics ? (
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                      {[1, 2, 3, 4].map((i) => (
                        <div key={i} className="p-3 bg-white/70 dark:bg-white/10 rounded-lg space-y-2">
                          <div className="h-3 bg-muted rounded animate-pulse w-1/2" />
                          <div className="h-5 bg-muted rounded animate-pulse w-3/4" />
                        </div>
                      ))}
                    </div>
                  ) : demographics && (
                    <div className="space-y-4">
                      {/* Key Metrics */}
                      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                        <div className="p-3 bg-white/70 dark:bg-white/10 rounded-lg border border-blue-100 dark:border-blue-800">
                          <p className="text-xs text-blue-600 dark:text-blue-400 font-medium mb-1">Primary Age Group</p>
                          <p className="font-bold text-lg text-blue-900 dark:text-blue-100">{demographics.age}</p>
                        </div>
                        <div className="p-3 bg-white/70 dark:bg-white/10 rounded-lg border border-blue-100 dark:border-blue-800">
                          <p className="text-xs text-blue-600 dark:text-blue-400 font-medium mb-1">Gender Split</p>
                          <p className="font-bold text-lg text-blue-900 dark:text-blue-100 capitalize">{demographics.gender_skew?.replace(/_/g, ' ')}</p>
                        </div>
                        <div className="p-3 bg-white/70 dark:bg-white/10 rounded-lg border border-green-100 dark:border-green-800">
                          <p className="text-xs text-green-600 dark:text-green-400 font-medium mb-1">Buying Power</p>
                          <p className="font-bold text-lg text-green-900 dark:text-green-100 capitalize">{demographics.purchasing_power}</p>
                        </div>
                        <div className="p-3 bg-white/70 dark:bg-white/10 rounded-lg border border-purple-100 dark:border-purple-800">
                          <p className="text-xs text-purple-600 dark:text-purple-400 font-medium mb-1">Education</p>
                          <p className="font-bold text-lg text-purple-900 dark:text-purple-100 capitalize">{demographics.education_level}</p>
                        </div>
                      </div>

                      {/* Geographic & Industry */}
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        {demographics.geographic_distribution && demographics.geographic_distribution.length > 0 && (
                          <div className="p-3 bg-white/50 dark:bg-white/5 rounded-lg">
                            <p className="text-xs text-blue-600 dark:text-blue-400 font-medium mb-2">Where They Are</p>
                            <div className="space-y-1">
                              {demographics.geographic_distribution.slice(0, 3).map((geo, idx) => (
                                <div key={idx} className="flex items-center justify-between">
                                  <span className="text-sm font-medium">{geo.region}</span>
                                  <span className="text-sm text-muted-foreground">{geo.percentage}%</span>
                                </div>
                              ))}
                            </div>
                          </div>
                        )}
                        {demographics.professional_industry && demographics.professional_industry.length > 0 && (
                          <div className="p-3 bg-white/50 dark:bg-white/5 rounded-lg">
                            <p className="text-xs text-cyan-600 dark:text-cyan-400 font-medium mb-2">Industries</p>
                            <div className="flex flex-wrap gap-1.5">
                              {demographics.professional_industry
                                .sort((a, b) => b.percentage - a.percentage)
                                .slice(0, 4)
                                .map((ind, idx) => (
                                  <span key={idx} className="text-xs bg-cyan-100 dark:bg-cyan-900/40 text-cyan-800 dark:text-cyan-200 px-2 py-1 rounded-full font-medium">
                                    {ind.industry}
                                  </span>
                                ))}
                            </div>
                          </div>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* Actions */}
              <div className="flex flex-col sm:flex-row gap-3 pt-4 border-t">
                {viewingPodcast.podcast_url && (
                  <Button
                    variant="default"
                    onClick={() => window.open(viewingPodcast.podcast_url!, '_blank', 'noopener,noreferrer')}
                    className="flex-1"
                  >
                    <ExternalLink className="h-4 w-4 mr-2" />
                    Visit Podcast
                  </Button>
                )}
                <Button
                  variant="outline"
                  onClick={() => setViewingPodcast(null)}
                  className="flex-1"
                >
                  Close
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Footer */}
      <footer className="border-t bg-white dark:bg-slate-900 mt-12">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 text-center">
          <p className="text-sm text-muted-foreground">
            Powered by <span className="font-semibold">Authority Built</span>
          </p>
        </div>
      </footer>
    </div>
  )
}
