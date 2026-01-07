import { useState, useEffect, useRef } from 'react'
import { useQuery } from '@tanstack/react-query'
import { DashboardLayout } from '@/components/admin/DashboardLayout'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Separator } from '@/components/ui/separator'
import { Badge } from '@/components/ui/badge'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import {
  Search,
  Sparkles,
  RefreshCw,
  Loader2,
  Star,
  ExternalLink,
  Filter,
  ChevronDown,
  ChevronUp,
  Users,
  TrendingUp,
  Globe,
  Calendar,
  X,
  Trash2,
  FileText
} from 'lucide-react'
import { getClients } from '@/services/clients'
import { generatePodcastQueries, regenerateQuery } from '@/services/queryGeneration'
import { scoreCompatibilityBatch } from '@/services/compatibilityScoring'
import { searchPodcasts, getPodcastById, getPodcastDemographics, getChartCountries, getChartCategories, getTopChartPodcasts, type PodcastData, type PodcastDemographics, type ChartCountry, type ChartCategory } from '@/services/podscan'
import { deduplicatePodcasts } from '@/services/podcastSearchUtils'
import { exportPodcastsToGoogleSheets, type PodcastExportData } from '@/services/googleSheets'
import { toast } from 'sonner'

interface GeneratedQuery {
  id: string
  text: string
  isEditing: boolean
  isSearching: boolean
  results: PodcastData[]
  isScoring: boolean
  compatibilityScores: Record<string, number | null>
  scoreReasonings: Record<string, string | undefined>
  regenerateAttempts: number
}

export default function PodcastFinder() {
  const [selectedClient, setSelectedClient] = useState<string>('')
  const [isGenerating, setIsGenerating] = useState(false)
  const [queries, setQueries] = useState<GeneratedQuery[]>([])
  const [expandedQueryId, setExpandedQueryId] = useState<string | null>(null)
  const [showFilters, setShowFilters] = useState(false)
  const [scoreModalOpen, setScoreModalOpen] = useState(false)
  const [selectedPodcastForScore, setSelectedPodcastForScore] = useState<{
    podcast: PodcastData
    score: number
    reasoning?: string
  } | null>(null)
  const [podcastDetailsModalOpen, setPodcastDetailsModalOpen] = useState(false)
  const [selectedPodcastDetails, setSelectedPodcastDetails] = useState<PodcastData | null>(null)
  const [loadingPodcastDetails, setLoadingPodcastDetails] = useState(false)
  const [podcastDemographics, setPodcastDemographics] = useState<PodcastDemographics | null>(null)
  const [loadingDemographics, setLoadingDemographics] = useState(false)

  // Mode toggle (search vs charts)
  const [finderMode, setFinderMode] = useState<'search' | 'charts'>('search')

  // Charts mode state
  const [chartPlatform, setChartPlatform] = useState<'apple' | 'spotify'>('apple')
  const [chartCountry, setChartCountry] = useState('us')
  const [chartCategory, setChartCategory] = useState('')
  const [chartResults, setChartResults] = useState<PodcastData[]>([])
  const [chartLimit, setChartLimit] = useState(50)
  const [loadingCharts, setLoadingCharts] = useState(false)

  // Scoring for chart results
  const [chartScores, setChartScores] = useState<Record<string, number | null>>({})
  const [chartReasonings, setChartReasonings] = useState<Record<string, string | undefined>>({})
  const [isChartScoring, setIsChartScoring] = useState(false)

  // Dynamic chart options from API
  const [chartCountries, setChartCountries] = useState<ChartCountry[]>([])
  const [chartCategories, setChartCategories] = useState<ChartCategory[]>([])
  const [loadingCountries, setLoadingCountries] = useState(false)
  const [loadingCategories, setLoadingCategories] = useState(false)

  // Google Sheets Export
  const [selectedPodcasts, setSelectedPodcasts] = useState<Set<string>>(new Set())
  const [isExporting, setIsExporting] = useState(false)

  // Ref to track regeneration attempts (avoids stale closure issues)
  const regenerateAttemptsRef = useRef<Record<string, number>>({})

  // Filters
  const [minAudience, setMinAudience] = useState('')
  const [maxAudience, setMaxAudience] = useState('')
  const [minEpisodes, setMinEpisodes] = useState('')
  const [region, setRegion] = useState('US')
  const [hasGuests, setHasGuests] = useState('true') // Default to only podcasts with guests
  const [hasSponsors, setHasSponsors] = useState('any')
  const [searchFields, setSearchFields] = useState('name,description')
  const [activeOnly, setActiveOnly] = useState(false)
  const [bioExpanded, setBioExpanded] = useState(false)

  // Fetch clients
  const { data: clientsData } = useQuery({
    queryKey: ['clients'],
    queryFn: () => getClients()
  })

  const clients = clientsData?.clients || []
  const selectedClientData = clients.find(c => c.id === selectedClient)

  // Load persisted state from localStorage on mount
  useEffect(() => {
    const savedState = localStorage.getItem('podcast-finder-state')
    if (savedState) {
      try {
        const parsed = JSON.parse(savedState)
        if (parsed.selectedClient) setSelectedClient(parsed.selectedClient)
        if (parsed.queries) setQueries(parsed.queries)
        if (parsed.selectedPodcasts) setSelectedPodcasts(new Set(parsed.selectedPodcasts))
        if (parsed.filters) {
          if (parsed.filters.minAudience !== undefined) setMinAudience(parsed.filters.minAudience)
          if (parsed.filters.maxAudience !== undefined) setMaxAudience(parsed.filters.maxAudience)
          if (parsed.filters.minEpisodes !== undefined) setMinEpisodes(parsed.filters.minEpisodes)
          if (parsed.filters.region !== undefined) setRegion(parsed.filters.region)
          if (parsed.filters.hasGuests !== undefined) setHasGuests(parsed.filters.hasGuests)
          if (parsed.filters.hasSponsors !== undefined) setHasSponsors(parsed.filters.hasSponsors)
          if (parsed.filters.searchFields !== undefined) setSearchFields(parsed.filters.searchFields)
          if (parsed.filters.activeOnly !== undefined) setActiveOnly(parsed.filters.activeOnly)
        }
        // Load chart state
        if (parsed.finderMode) setFinderMode(parsed.finderMode)
        if (parsed.chartPlatform) setChartPlatform(parsed.chartPlatform)
        if (parsed.chartCountry) setChartCountry(parsed.chartCountry)
        if (parsed.chartCategory) setChartCategory(parsed.chartCategory)
        if (parsed.chartLimit) setChartLimit(parsed.chartLimit)
        if (parsed.chartResults) setChartResults(parsed.chartResults)
        if (parsed.chartScores) setChartScores(parsed.chartScores)
        if (parsed.chartReasonings) setChartReasonings(parsed.chartReasonings)
      } catch (e) {
        console.error('Failed to load saved state:', e)
      }
    }
  }, [])

  // Save state to localStorage whenever it changes
  useEffect(() => {
    const stateToSave = {
      selectedClient,
      queries,
      selectedPodcasts: Array.from(selectedPodcasts),
      filters: {
        minAudience,
        maxAudience,
        minEpisodes,
        region,
        hasGuests,
        hasSponsors,
        searchFields,
        activeOnly,
      },
      // Chart state
      finderMode,
      chartPlatform,
      chartCountry,
      chartCategory,
      chartLimit,
      chartResults,
      chartScores,
      chartReasonings,
    }
    localStorage.setItem('podcast-finder-state', JSON.stringify(stateToSave))
  }, [selectedClient, queries, selectedPodcasts, minAudience, maxAudience, minEpisodes, region, hasGuests, hasSponsors, searchFields, activeOnly, finderMode, chartPlatform, chartCountry, chartCategory, chartLimit, chartResults, chartScores, chartReasonings])

  // Fetch chart countries when entering charts mode
  useEffect(() => {
    if (finderMode === 'charts' && chartCountries.length === 0) {
      const fetchCountries = async () => {
        setLoadingCountries(true)
        try {
          const countries = await getChartCountries()
          setChartCountries(countries)
          // Set default country if not already set
          if (!chartCountry && countries.length > 0) {
            setChartCountry(countries[0].code)
          }
        } catch (error) {
          console.error('Failed to fetch chart countries:', error)
          toast.error('Failed to load countries')
        } finally {
          setLoadingCountries(false)
        }
      }
      fetchCountries()
    }
  }, [finderMode, chartCountries.length, chartCountry])

  // Fetch chart categories when platform or country changes
  useEffect(() => {
    if (finderMode === 'charts' && chartPlatform && chartCountry) {
      const fetchCategories = async () => {
        setLoadingCategories(true)
        setChartCategory('') // Reset category when platform/country changes
        try {
          const categories = await getChartCategories(chartPlatform, chartCountry)
          setChartCategories(categories)
        } catch (error) {
          console.error('Failed to fetch chart categories:', error)
          toast.error('Failed to load categories')
        } finally {
          setLoadingCategories(false)
        }
      }
      fetchCategories()
    }
  }, [finderMode, chartPlatform, chartCountry])

  // Handle fetching top chart podcasts
  const handleFetchCharts = async () => {
    if (!chartCategory) {
      toast.error('Please select a category')
      return
    }

    setLoadingCharts(true)
    setChartResults([])
    setChartScores({})
    setChartReasonings({})

    try {
      const podcasts = await getTopChartPodcasts(chartPlatform, chartCountry, chartCategory, chartLimit)
      setChartResults(podcasts)
      toast.success(`Found ${podcasts.length} top podcasts`)
    } catch (error) {
      console.error('Failed to fetch chart podcasts:', error)
      toast.error(error instanceof Error ? error.message : 'Failed to fetch chart podcasts')
    } finally {
      setLoadingCharts(false)
    }
  }

  const handleGenerateQueries = async () => {
    if (!selectedClient || !selectedClientData) {
      toast.error('Please select a client first')
      return
    }

    if (!selectedClientData.bio) {
      toast.error('Please add a bio for this client first')
      return
    }

    setIsGenerating(true)

    try {
      const generatedQueries = await generatePodcastQueries({
        clientName: selectedClientData.name,
        clientBio: selectedClientData.bio,
        clientEmail: selectedClientData.email || undefined,
      })

      const queries: GeneratedQuery[] = generatedQueries.map((query, index) => ({
        id: `query-${Date.now()}-${index}`,
        text: query,
        isEditing: false,
        isSearching: false,
        results: [],
        isScoring: false,
        compatibilityScores: {},
        scoreReasonings: {},
        regenerateAttempts: 0
      }))

      // Reset regeneration attempt tracking for new queries
      regenerateAttemptsRef.current = {}

      setQueries(queries)
      toast.success('Generated 5 AI-powered search queries!')
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to generate queries')
      console.error(error)
    } finally {
      setIsGenerating(false)
    }
  }

  const handleRegenerateQuery = async (queryId: string, isAutomatic = false) => {
    if (!selectedClientData || !selectedClientData.bio) return

    const query = queries.find(q => q.id === queryId)
    if (!query) return

    // Use ref for attempt tracking to avoid stale closure issues
    const currentAttempts = regenerateAttemptsRef.current[queryId] || 0
    console.log(`handleRegenerateQuery called: queryId=${queryId}, isAutomatic=${isAutomatic}, currentAttempts=${currentAttempts}`)

    // Limit automatic regenerations to 1 attempt per query (2 total searches)
    if (isAutomatic && currentAttempts >= 1) {
      console.log(`Query ${queryId} has reached max regeneration attempts (${currentAttempts}), STOPPING`)
      toast.error(`No podcasts found after retrying. Try adjusting filters or editing the query manually.`)
      return
    }

    // Increment ref immediately (synchronous, no closure issues)
    if (isAutomatic) {
      regenerateAttemptsRef.current[queryId] = currentAttempts + 1
    } else {
      // Manual regenerate resets the counter
      regenerateAttemptsRef.current[queryId] = 0
    }

    try {
      if (!isAutomatic) {
        toast.info('Regenerating query...')
      }

      console.log(`Query ${queryId}: Calling AI to regenerate query...`)

      const newQueryText = await regenerateQuery(
        {
          clientName: selectedClientData.name,
          clientBio: selectedClientData.bio,
          clientEmail: selectedClientData.email || undefined,
        },
        query.text
      )

      setQueries(prev => {
        const updated = prev.map(q =>
          q.id === queryId
            ? {
                ...q,
                text: newQueryText,
                results: [],
                compatibilityScores: {},
                scoreReasonings: {},
                regenerateAttempts: regenerateAttemptsRef.current[queryId] || 0
              }
            : q
        )
        const updatedQuery = updated.find(q => q.id === queryId)
        console.log(`Query ${queryId}: State updated, new regenerateAttempts=${updatedQuery?.regenerateAttempts}`)
        return updated
      })

      if (!isAutomatic) {
        toast.success('Query regenerated!')
      }

      // If automatic, search with the new query after delay
      if (isAutomatic) {
        console.log(`Query ${queryId}: Scheduling next search in 700ms`)
        // Delay to ensure state is updated and respect rate limits
        setTimeout(() => {
          console.log(`Query ${queryId}: Executing scheduled search`)
          handleSearchQuery(queryId)
        }, 700)
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to regenerate query')
      console.error(error)
    }
  }

  const handleSearchQuery = async (queryId: string) => {
    const query = queries.find(q => q.id === queryId)
    if (!query) return

    // Use ref for attempt tracking (avoids stale closure issues)
    const currentAttempts = regenerateAttemptsRef.current[queryId] || 0

    // HARD STOP: Prevent infinite loops - max 2 total searches per query
    if (currentAttempts >= 2) {
      console.log(`STOPPED: Query ${queryId} has already been regenerated ${currentAttempts} times`)
      toast.error(`Query has reached maximum retry limit`)
      return
    }

    setQueries(prev => prev.map(q =>
      q.id === queryId ? { ...q, isSearching: true } : q
    ))

    try {
      // Build search filters
      const filters: any = {
        query: query.text,
        per_page: 50,
        order_by: 'audience_size',
        order_dir: 'desc',
        language: 'en',
        search_fields: searchFields,
      }

      // Apply optional filters
      if (minAudience) filters.min_audience_size = parseInt(minAudience)
      if (maxAudience) filters.max_audience_size = parseInt(maxAudience)
      if (minEpisodes) filters.min_episode_count = parseInt(minEpisodes)
      if (region !== 'US') filters.region = region
      if (hasGuests === 'true') filters.has_guests = true
      else if (hasGuests === 'false') filters.has_guests = false

      // Filter for podcasts with sponsors (professional/monetized)
      if (hasSponsors === 'true') filters.has_sponsors = true
      else if (hasSponsors === 'false') filters.has_sponsors = false

      // Filter for active podcasts only (posted in last 6 months)
      if (activeOnly) {
        const sixMonthsAgo = new Date()
        sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6)
        filters.min_last_episode_posted_at = sixMonthsAgo.toISOString().split('T')[0]
      }

      const response = await searchPodcasts(filters)
      const results = response.podcasts || []

      // Re-check ref for current attempts (in case of concurrent calls)
      const attemptsNow = regenerateAttemptsRef.current[queryId] || 0

      setQueries(prev => prev.map(q =>
        q.id === queryId
          ? { ...q, results, isSearching: false, regenerateAttempts: attemptsNow }
          : q
      ))

      setExpandedQueryId(queryId)

      console.log(`Query ${queryId}: Found ${results.length} results, currentAttempts=${attemptsNow}`)

      // Check if we should auto-regenerate due to zero results
      if (results.length === 0 && attemptsNow < 1) {
        console.log(`Query ${queryId}: Triggering auto-regeneration`)
        toast.warning(`No podcasts found. Trying a different query...`)
        // Add delay to respect rate limits (120/min = ~500ms between requests)
        await new Promise(resolve => setTimeout(resolve, 600))
        // Automatically regenerate and search with new query
        await handleRegenerateQuery(queryId, true)
      } else {
        if (results.length === 0) {
          console.log(`Query ${queryId}: Max attempts reached, stopping`)
          // Message already shown by handleRegenerateQuery when it stops
        } else {
          toast.success(`Found ${results.length} podcasts!`)
        }
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Search failed')
      console.error(error)
      setQueries(prev => prev.map(q =>
        q.id === queryId ? { ...q, isSearching: false } : q
      ))
    }
  }

  const handleScanCompatibility = async (queryId: string) => {
    const query = queries.find(q => q.id === queryId)
    if (!query || !query.results.length || !selectedClientData) return

    if (!selectedClientData.bio) {
      toast.error('Client bio is required for compatibility scoring')
      return
    }

    setQueries(prev => prev.map(q =>
      q.id === queryId ? { ...q, isScoring: true } : q
    ))

    try {
      // Map PodcastData to PodcastForScoring format
      const podcastsForScoring = query.results.map(p => ({
        podcast_id: p.podcast_id,
        podcast_name: p.podcast_name,
        podcast_description: p.podcast_description,
        publisher_name: p.publisher_name,
        podcast_categories: p.podcast_categories,
        audience_size: p.reach?.audience_size,
        episode_count: p.episode_count,
      }))

      // Score with progress callback
      const scores = await scoreCompatibilityBatch(
        selectedClientData.bio,
        podcastsForScoring,
        10,
        (completed, total) => {
          // Could add progress indicator in UI here
          console.log(`Scoring progress: ${completed}/${total}`)
        }
      )

      // Build score and reasoning maps
      const scoreMap: Record<string, number | null> = {}
      const reasoningMap: Record<string, string | undefined> = {}
      scores.forEach(s => {
        scoreMap[s.podcast_id] = s.score
        reasoningMap[s.podcast_id] = s.reasoning
      })

      setQueries(prev => prev.map(q =>
        q.id === queryId
          ? { ...q, compatibilityScores: scoreMap, scoreReasonings: reasoningMap, isScoring: false }
          : q
      ))

      // Calculate average score
      const validScores = scores.filter(s => s.score !== null).map(s => s.score!)
      const avgScore = validScores.length > 0
        ? validScores.reduce((sum, score) => sum + score, 0) / validScores.length
        : 0

      const highScoreCount = validScores.filter(s => s >= 8).length

      toast.success(
        `Scored ${scores.length} podcasts! Average: ${avgScore.toFixed(1)}/10 • ${highScoreCount} highly compatible (8+)`
      )
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to calculate compatibility scores')
      console.error(error)
      setQueries(prev => prev.map(q =>
        q.id === queryId ? { ...q, isScoring: false } : q
      ))
    }
  }

  const handleScanChartCompatibility = async () => {
    if (!chartResults.length || !selectedClientData) return

    if (!selectedClientData.bio) {
      toast.error('Client bio is required for compatibility scoring')
      return
    }

    setIsChartScoring(true)

    try {
      // Map PodcastData to PodcastForScoring format
      const podcastsForScoring = chartResults.map(p => ({
        podcast_id: p.podcast_id,
        podcast_name: p.podcast_name,
        podcast_description: p.podcast_description,
        publisher_name: p.publisher_name,
        podcast_categories: p.podcast_categories,
        audience_size: p.reach?.audience_size,
        episode_count: p.episode_count,
      }))

      // Score with progress callback
      const scores = await scoreCompatibilityBatch(
        selectedClientData.bio,
        podcastsForScoring,
        10,
        (completed, total) => {
          console.log(`Chart scoring progress: ${completed}/${total}`)
        }
      )

      // Build score and reasoning maps
      const scoreMap: Record<string, number | null> = {}
      const reasoningMap: Record<string, string | undefined> = {}
      scores.forEach(s => {
        scoreMap[s.podcast_id] = s.score
        reasoningMap[s.podcast_id] = s.reasoning
      })

      setChartScores(scoreMap)
      setChartReasonings(reasoningMap)

      // Calculate average score
      const validScores = scores.filter(s => s.score !== null).map(s => s.score!)
      const avgScore = validScores.length > 0
        ? validScores.reduce((sum, score) => sum + score, 0) / validScores.length
        : 0

      const highScoreCount = validScores.filter(s => s >= 8).length

      toast.success(
        `Scored ${scores.length} podcasts! Average: ${avgScore.toFixed(1)}/10 • ${highScoreCount} highly compatible (8+)`
      )
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to calculate compatibility scores')
      console.error(error)
    } finally {
      setIsChartScoring(false)
    }
  }

  const handleEditQuery = (queryId: string, newText: string) => {
    setQueries(prev => prev.map(q =>
      q.id === queryId ? { ...q, text: newText } : q
    ))
  }

  const toggleQueryExpanded = (queryId: string) => {
    setExpandedQueryId(prev => prev === queryId ? null : queryId)
  }

  const handleScoreClick = (podcast: PodcastData, query: GeneratedQuery) => {
    const score = query.compatibilityScores[podcast.podcast_id]
    const reasoning = query.scoreReasonings[podcast.podcast_id]

    if (score !== null && score !== undefined) {
      setSelectedPodcastForScore({
        podcast,
        score,
        reasoning
      })
      setScoreModalOpen(true)
    }
  }

  const handleDeletePodcast = (queryId: string, podcastId: string, podcastName: string) => {
    setQueries(prev => prev.map(q => {
      if (q.id === queryId) {
        // Remove the podcast from results
        const updatedResults = q.results.filter(p => p.podcast_id !== podcastId)

        // Remove from scores and reasonings too
        const updatedScores = { ...q.compatibilityScores }
        const updatedReasonings = { ...q.scoreReasonings }
        delete updatedScores[podcastId]
        delete updatedReasonings[podcastId]

        return {
          ...q,
          results: updatedResults,
          compatibilityScores: updatedScores,
          scoreReasonings: updatedReasonings
        }
      }
      return q
    }))

    toast.success(`Removed "${podcastName}" from results`)
  }

  const handlePodcastRowClick = async (podcastId: string) => {
    setLoadingPodcastDetails(true)
    setLoadingDemographics(true)
    setPodcastDemographics(null)
    setPodcastDetailsModalOpen(true)

    try {
      // Fetch podcast details
      const details = await getPodcastById(podcastId)
      setSelectedPodcastDetails(details)
      setLoadingPodcastDetails(false)

      // Fetch demographics (non-blocking)
      try {
        const demographics = await getPodcastDemographics(podcastId)
        setPodcastDemographics(demographics)
      } catch (demoError) {
        console.log('Demographics not available:', demoError)
      }
    } catch (error) {
      console.error('Error fetching podcast details:', error)
      toast.error('Failed to load podcast details')
      setPodcastDetailsModalOpen(false)
    } finally {
      setLoadingPodcastDetails(false)
      setLoadingDemographics(false)
    }
  }

  const handleReset = () => {
    setQueries([])
    setExpandedQueryId(null)
    setSelectedPodcasts(new Set())
    regenerateAttemptsRef.current = {} // Clear regeneration tracking
    localStorage.removeItem('podcast-finder-state') // Clear persisted state
    toast.success('Queries cleared')
  }

  // Checkbox selection handlers
  const handleTogglePodcastSelection = (podcastId: string) => {
    setSelectedPodcasts(prev => {
      const newSet = new Set(prev)
      if (newSet.has(podcastId)) {
        newSet.delete(podcastId)
      } else {
        newSet.add(podcastId)
      }
      return newSet
    })
  }

  const handleToggleAllInQuery = (query: GeneratedQuery) => {
    const queryPodcastIds = query.results.map(p => p.podcast_id)
    const allSelected = queryPodcastIds.every(id => selectedPodcasts.has(id))

    setSelectedPodcasts(prev => {
      const newSet = new Set(prev)
      if (allSelected) {
        // Deselect all in this query
        queryPodcastIds.forEach(id => newSet.delete(id))
      } else {
        // Select all in this query
        queryPodcastIds.forEach(id => newSet.add(id))
      }
      return newSet
    })
  }

  const handleExportToGoogleSheets = async () => {
    if (!selectedClient) {
      toast.error('Please select a client first')
      return
    }

    if (selectedPodcasts.size === 0) {
      toast.error('Please select at least one podcast to export')
      return
    }

    setIsExporting(true)

    try {
      const podcastsToExport: PodcastExportData[] = []

      if (finderMode === 'search') {
        // Collect all selected podcasts from all queries (search mode)
        queries.forEach(query => {
          query.results.forEach(podcast => {
            if (selectedPodcasts.has(podcast.podcast_id)) {
              podcastsToExport.push({
                podcast_name: podcast.podcast_name,
                podcast_description: podcast.podcast_description,
                itunes_rating: podcast.itunes_rating,
                episode_count: podcast.episode_count,
                podscan_podcast_id: podcast.podcast_id,
                // Legacy fields kept for backward compatibility:
                publisher_name: podcast.publisher_name,
                audience_size: podcast.reach?.audience_size,
                podcast_url: podcast.podcast_url,
                podcast_email: podcast.podcast_email,
                rss_feed: podcast.rss_url,
                compatibility_score: query.compatibilityScores[podcast.podcast_id],
                compatibility_reasoning: query.scoreReasonings[podcast.podcast_id],
              })
            }
          })
        })
      } else {
        // Collect selected podcasts from chart results (charts mode)
        chartResults.forEach(podcast => {
          if (selectedPodcasts.has(podcast.podcast_id)) {
            podcastsToExport.push({
              podcast_name: podcast.podcast_name,
              podcast_description: podcast.podcast_description,
              itunes_rating: podcast.reach?.itunes?.itunes_rating_average,
              episode_count: podcast.episode_count,
              podscan_podcast_id: podcast.podcast_id,
              publisher_name: podcast.publisher_name,
              audience_size: podcast.reach?.audience_size,
              podcast_url: podcast.podcast_url,
              podcast_email: podcast.podcast_email,
              rss_feed: podcast.rss_url,
              compatibility_score: chartScores[podcast.podcast_id],
              compatibility_reasoning: chartReasonings[podcast.podcast_id],
            })
          }
        })
      }

      const result = await exportPodcastsToGoogleSheets(selectedClient, podcastsToExport)

      toast.success(`Successfully exported ${result.rowsAdded} podcasts to Google Sheets!`)
      setSelectedPodcasts(new Set()) // Clear selection after successful export
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to export to Google Sheets')
      console.error('Export error:', error)
    } finally {
      setIsExporting(false)
    }
  }

  const handleSearchAllQueries = async () => {
    if (queries.length === 0) return

    toast.info(`Searching ${queries.length} queries with rate limit delays...`)

    for (const query of queries) {
      if (!query.isSearching && query.text) {
        await handleSearchQuery(query.id)
        // Delay between searches to respect rate limits (120/min = ~600ms)
        await new Promise(resolve => setTimeout(resolve, 700))
      }
    }
  }

  const handleScoreAllResults = async () => {
    const queriesToScore = queries.filter(q => q.results.length > 0 && Object.keys(q.compatibilityScores).length === 0)

    if (queriesToScore.length === 0) {
      toast.error('No unscored results to score')
      return
    }

    for (const query of queriesToScore) {
      await handleScanCompatibility(query.id)
      // Small delay between scoring batches
      await new Promise(resolve => setTimeout(resolve, 500))
    }
  }

  // Calculate aggregate statistics
  const aggregateStats = () => {
    const allResults = queries.flatMap(q => q.results)
    const uniquePodcasts = deduplicatePodcasts(allResults)

    const allScores = queries.flatMap(q =>
      Object.values(q.compatibilityScores).filter((score): score is number => score !== null)
    )

    const avgScore = allScores.length > 0
      ? allScores.reduce((sum, score) => sum + score, 0) / allScores.length
      : 0

    const highScoreCount = allScores.filter(s => s >= 8).length
    const mediumScoreCount = allScores.filter(s => s >= 5 && s < 8).length

    return {
      totalResults: allResults.length,
      uniquePodcasts: uniquePodcasts.length,
      scoredPodcasts: allScores.length,
      avgScore,
      highScoreCount,
      mediumScoreCount,
    }
  }

  const stats = aggregateStats()

  // Sort results by compatibility score (if available) or audience size
  const getSortedResults = (query: GeneratedQuery) => {
    const hasScores = Object.keys(query.compatibilityScores).length > 0

    if (hasScores) {
      return [...query.results].sort((a, b) => {
        const scoreA = query.compatibilityScores[a.podcast_id] || 0
        const scoreB = query.compatibilityScores[b.podcast_id] || 0
        if (scoreB !== scoreA) return scoreB - scoreA // Sort by score descending
        return (b.reach?.audience_size || 0) - (a.reach?.audience_size || 0) // Then by audience
      })
    }

    return query.results // Return unsorted if no scores
  }

  return (
    <DashboardLayout>
      <div className="space-y-8 pb-8">
        {/* Header */}
        <div className="space-y-2">
          <div className="flex items-start justify-between">
            <div>
              <h1 className="text-4xl font-bold tracking-tight">Podcast Finder</h1>
              <p className="text-lg text-muted-foreground">
                AI-powered podcast discovery with compatibility scoring
              </p>
            </div>
            <div className="text-right">
              <p className="text-xs text-muted-foreground">Podscan API Rate Limit</p>
              <p className="text-sm font-semibold text-primary">120 req/min · 2000 req/day</p>
            </div>
          </div>
        </div>

        {/* Mode Toggle */}
        <div className="flex items-center justify-center gap-2 p-4 bg-muted/50 rounded-lg">
          <Button
            variant={finderMode === 'search' ? 'default' : 'outline'}
            onClick={() => setFinderMode('search')}
            size="lg"
            className="min-w-[160px]"
          >
            <Sparkles className="h-4 w-4 mr-2" />
            AI Search Mode
          </Button>
          <Button
            variant={finderMode === 'charts' ? 'default' : 'outline'}
            onClick={() => setFinderMode('charts')}
            size="lg"
            className="min-w-[160px]"
          >
            <TrendingUp className="h-4 w-4 mr-2" />
            Charts Mode
          </Button>
        </div>

        {/* Export to Google Sheets */}
        {selectedPodcasts.size > 0 && (
          <Card className="border-2 border-green-200 dark:border-green-800 bg-gradient-to-r from-green-50 to-emerald-50 dark:from-green-950/30 dark:to-emerald-950/30 shadow-md">
            <CardContent className="pt-6">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-4">
                  <div className="flex h-12 w-12 items-center justify-center rounded-full bg-green-600 text-white">
                    <FileText className="h-6 w-6" />
                  </div>
                  <div>
                    <p className="text-lg font-semibold">
                      {selectedPodcasts.size} podcast{selectedPodcasts.size !== 1 ? 's' : ''} selected
                    </p>
                    <p className="text-sm text-muted-foreground">
                      Ready to export to Google Sheets
                    </p>
                  </div>
                </div>
                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    onClick={() => setSelectedPodcasts(new Set())}
                    disabled={isExporting}
                  >
                    Clear Selection
                  </Button>
                  <Button
                    onClick={handleExportToGoogleSheets}
                    disabled={isExporting || !selectedClient}
                    size="lg"
                    className="bg-green-600 hover:bg-green-700"
                  >
                    {isExporting ? (
                      <>
                        <Loader2 className="h-5 w-5 mr-2 animate-spin" />
                        Exporting...
                      </>
                    ) : (
                      <>
                        <FileText className="h-5 w-5 mr-2" />
                        Export to Google Sheets
                      </>
                    )}
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Client Selection */}
        <Card className="border-2 shadow-sm">
          <CardHeader className="pb-4">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-full bg-primary text-primary-foreground font-bold text-lg">
                1
              </div>
              <div>
                <CardTitle className="text-xl">Select Client</CardTitle>
                <CardDescription className="text-base mt-1">
                  {finderMode === 'search'
                    ? 'Choose a client and generate AI-powered podcast search queries'
                    : 'Choose a client to find podcasts for and score compatibility'
                  }
                </CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="client-select">Select Client</Label>
                <Select value={selectedClient} onValueChange={setSelectedClient}>
                  <SelectTrigger id="client-select">
                    <SelectValue placeholder="Choose a client..." />
                  </SelectTrigger>
                  <SelectContent>
                    {clients.map((client) => (
                      <SelectItem key={client.id} value={client.id}>
                        {client.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Search mode: Generate Queries button */}
              {finderMode === 'search' && (
                <div className="flex items-end gap-2">
                  <Button
                    onClick={handleGenerateQueries}
                    disabled={!selectedClient || isGenerating}
                    className="flex-1"
                    size="lg"
                  >
                    {isGenerating ? (
                      <>
                        <Loader2 className="h-5 w-5 mr-2 animate-spin" />
                        Generating...
                      </>
                    ) : (
                      <>
                        <Sparkles className="h-5 w-5 mr-2" />
                        Generate 5 AI Queries
                      </>
                    )}
                  </Button>
                  {queries.length > 0 && (
                    <Button
                      onClick={handleReset}
                      variant="outline"
                      size="lg"
                      title="Clear all queries and start over"
                    >
                      <X className="h-5 w-5" />
                    </Button>
                  )}
                </div>
              )}
            </div>

            {selectedClientData && (
              <div className="p-5 bg-gradient-to-br from-muted/50 to-muted/30 rounded-xl border-2 space-y-3 max-h-[400px] overflow-y-auto">
                <div className="flex items-center gap-2 mb-3 sticky top-0 bg-gradient-to-br from-muted/80 to-muted/60 -mx-5 -mt-5 px-5 pt-5 pb-2 backdrop-blur-sm">
                  <div className="h-2 w-2 rounded-full bg-primary"></div>
                  <p className="text-sm font-semibold uppercase tracking-wide text-primary">Selected Client</p>
                </div>
                <div className="space-y-2">
                  <p className="text-base">
                    <span className="font-semibold">Name:</span> <span className="text-muted-foreground">{selectedClientData.name}</span>
                  </p>
                  {selectedClientData.email && (
                    <p className="text-base">
                      <span className="font-semibold">Email:</span> <span className="text-muted-foreground">{selectedClientData.email}</span>
                    </p>
                  )}
                </div>
                {selectedClientData.bio ? (
                  <div className="pt-3 border-t-2 border-border/50 mt-3">
                    <p className="text-sm font-semibold mb-2 flex items-center gap-2">
                      <span className="h-1.5 w-1.5 rounded-full bg-green-500"></span>
                      Client Bio
                    </p>
                    <div className="text-sm text-muted-foreground leading-relaxed bg-background/50 p-3 rounded-lg">
                      <p className={`whitespace-pre-wrap ${!bioExpanded && selectedClientData.bio.length > 200 ? 'line-clamp-3' : ''}`}>
                        {selectedClientData.bio}
                      </p>
                      {selectedClientData.bio.length > 200 && (
                        <button
                          onClick={() => setBioExpanded(!bioExpanded)}
                          className="text-primary hover:underline text-xs font-medium mt-2 flex items-center gap-1"
                        >
                          {bioExpanded ? (
                            <>Show less <ChevronUp className="h-3 w-3" /></>
                          ) : (
                            <>Read more <ChevronDown className="h-3 w-3" /></>
                          )}
                        </button>
                      )}
                    </div>
                  </div>
                ) : (
                  <div className="pt-3 border-t-2 border-border/50 mt-3">
                    <div className="flex items-start gap-3 p-3 bg-amber-50 dark:bg-amber-950/20 rounded-lg border border-amber-200 dark:border-amber-800">
                      <span className="text-lg">⚠️</span>
                      <div>
                        <p className="text-sm font-semibold text-amber-800 dark:text-amber-400 mb-1">
                          No bio added yet
                        </p>
                        <p className="text-xs text-amber-700 dark:text-amber-500">
                          Add a bio in the client details page for better AI query generation.
                        </p>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Search Mode Content */}
        {finderMode === 'search' && (
          <>
            {/* Search Filters */}
            {queries.length > 0 && (
          <Card className="border-2 shadow-sm">
            <CardHeader className="pb-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-full bg-primary text-primary-foreground font-bold text-lg">
                    2
                  </div>
                  <div>
                    <CardTitle className="text-xl">Search Filters (Optional)</CardTitle>
                    <CardDescription className="text-base mt-1">
                      Refine your podcast search criteria
                    </CardDescription>
                  </div>
                </div>
                <Button
                  variant="outline"
                  onClick={() => setShowFilters(!showFilters)}
                >
                  <Filter className="h-4 w-4 mr-2" />
                  {showFilters ? 'Hide' : 'Show'} Filters
                  {showFilters ? (
                    <ChevronUp className="h-4 w-4 ml-2" />
                  ) : (
                    <ChevronDown className="h-4 w-4 ml-2" />
                  )}
                </Button>
              </div>
            </CardHeader>
            {showFilters && (
              <CardContent className="pt-0">
                <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                  <div className="space-y-2">
                    <Label htmlFor="min-audience" className="text-sm font-semibold flex items-center gap-2">
                      <Users className="h-4 w-4" />
                      Min Audience Size
                    </Label>
                    <Input
                      id="min-audience"
                      type="number"
                      placeholder="e.g., 1000"
                      value={minAudience}
                      onChange={(e) => setMinAudience(e.target.value)}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="max-audience" className="text-sm font-semibold flex items-center gap-2">
                      <Users className="h-4 w-4" />
                      Max Audience Size
                    </Label>
                    <Input
                      id="max-audience"
                      type="number"
                      placeholder="e.g., 50000"
                      value={maxAudience}
                      onChange={(e) => setMaxAudience(e.target.value)}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="min-episodes" className="text-sm font-semibold flex items-center gap-2">
                      <Calendar className="h-4 w-4" />
                      Min Episodes
                    </Label>
                    <Input
                      id="min-episodes"
                      type="number"
                      placeholder="e.g., 10"
                      value={minEpisodes}
                      onChange={(e) => setMinEpisodes(e.target.value)}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="region" className="text-sm font-semibold flex items-center gap-2">
                      <Globe className="h-4 w-4" />
                      Region
                    </Label>
                    <Select value={region} onValueChange={setRegion}>
                      <SelectTrigger id="region">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="US">United States</SelectItem>
                        <SelectItem value="GB">United Kingdom</SelectItem>
                        <SelectItem value="CA">Canada</SelectItem>
                        <SelectItem value="AU">Australia</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="has-guests" className="text-sm font-semibold flex items-center gap-2">
                      <Users className="h-4 w-4 text-green-600" />
                      Guest Format ⭐ (Default: Has Guests Only)
                    </Label>
                    <Select value={hasGuests} onValueChange={setHasGuests}>
                      <SelectTrigger id="has-guests" className="border-green-200">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="any">Any Format</SelectItem>
                        <SelectItem value="true">✅ Has Guests Only (Recommended)</SelectItem>
                        <SelectItem value="false">No Guests</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="has-sponsors" className="text-sm font-semibold flex items-center gap-2">
                      <TrendingUp className="h-4 w-4" />
                      Monetization
                    </Label>
                    <Select value={hasSponsors} onValueChange={setHasSponsors}>
                      <SelectTrigger id="has-sponsors">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="any">Any</SelectItem>
                        <SelectItem value="true">Has Sponsors</SelectItem>
                        <SelectItem value="false">No Sponsors</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="search-fields" className="text-sm font-semibold flex items-center gap-2">
                      <Search className="h-4 w-4" />
                      Search In
                    </Label>
                    <Select value={searchFields} onValueChange={setSearchFields}>
                      <SelectTrigger id="search-fields">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="name">Podcast Name Only</SelectItem>
                        <SelectItem value="name,description">Name + Description</SelectItem>
                        <SelectItem value="name,description,publisher_name">All Fields</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="active-only" className="text-sm font-semibold flex items-center gap-2">
                      <Calendar className="h-4 w-4" />
                      Active Podcasts Only
                    </Label>
                    <div className="flex items-center space-x-2 h-10 px-3 border rounded-md bg-background">
                      <input
                        type="checkbox"
                        id="active-only"
                        checked={activeOnly}
                        onChange={(e) => setActiveOnly(e.target.checked)}
                        className="h-4 w-4 rounded border-gray-300 cursor-pointer"
                      />
                      <Label htmlFor="active-only" className="text-sm text-muted-foreground cursor-pointer font-normal">
                        Posted in last 6 months
                      </Label>
                    </div>
                  </div>
                </div>
              </CardContent>
            )}
          </Card>
        )}

        {/* Aggregate Statistics */}
        {queries.length > 0 && stats.totalResults > 0 && (
          <Card className="bg-gradient-to-br from-blue-50 to-indigo-50 dark:from-blue-950/30 dark:to-indigo-950/30 border-2 border-blue-200 dark:border-blue-800 shadow-sm">
            <CardHeader className="pb-4">
              <CardTitle className="flex items-center gap-3 text-xl">
                <TrendingUp className="h-6 w-6 text-blue-600 dark:text-blue-400" />
                Search Statistics
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-6">
                <div className="space-y-2 text-center p-3 rounded-lg bg-white/50 dark:bg-black/20">
                  <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Total Results</p>
                  <p className="text-3xl font-bold text-blue-600 dark:text-blue-400">{stats.totalResults}</p>
                </div>
                <div className="space-y-2 text-center p-3 rounded-lg bg-white/50 dark:bg-black/20">
                  <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Unique Podcasts</p>
                  <p className="text-3xl font-bold text-indigo-600 dark:text-indigo-400">{stats.uniquePodcasts}</p>
                </div>
                <div className="space-y-2 text-center p-3 rounded-lg bg-white/50 dark:bg-black/20">
                  <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Scored</p>
                  <p className="text-3xl font-bold text-purple-600 dark:text-purple-400">{stats.scoredPodcasts}</p>
                </div>
                <div className="space-y-2 text-center p-3 rounded-lg bg-white/50 dark:bg-black/20">
                  <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Avg Score</p>
                  <p className="text-3xl font-bold text-green-600 dark:text-green-400">
                    {stats.avgScore > 0 ? stats.avgScore.toFixed(1) : '-'}
                  </p>
                </div>
                <div className="space-y-2 text-center p-3 rounded-lg bg-white/50 dark:bg-black/20">
                  <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">High Fit (8+)</p>
                  <p className="text-3xl font-bold text-emerald-600 dark:text-emerald-400">{stats.highScoreCount}</p>
                </div>
                <div className="space-y-2 text-center p-3 rounded-lg bg-white/50 dark:bg-black/20">
                  <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Medium Fit (5-7)</p>
                  <p className="text-3xl font-bold text-amber-600 dark:text-amber-400">{stats.mediumScoreCount}</p>
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Generated Queries */}
        {queries.length > 0 && (
          <Card className="border-2 shadow-sm">
            <CardHeader className="pb-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-full bg-primary text-primary-foreground font-bold text-lg">
                    3
                  </div>
                  <div>
                    <CardTitle className="text-xl">Search Queries & Results</CardTitle>
                    <CardDescription className="text-base mt-1">
                      Edit, regenerate, or search each query. Click "Scan Compatibility" to get AI scores.
                    </CardDescription>
                  </div>
                </div>
                <div className="flex gap-2">
                  <Button
                    onClick={handleSearchAllQueries}
                    disabled={queries.some(q => q.isSearching)}
                    variant="outline"
                  >
                    <Search className="h-4 w-4 mr-2" />
                    Search All
                  </Button>
                  <Button
                    onClick={handleScoreAllResults}
                    disabled={queries.some(q => q.isScoring) || queries.every(q => q.results.length === 0)}
                    variant="default"
                  >
                    <Star className="h-4 w-4 mr-2" />
                    Score All
                  </Button>
                </div>
              </div>
            </CardHeader>
            <CardContent className="space-y-6">
              {queries.map((query, index) => (
                <div key={query.id} className="border-2 rounded-xl p-5 space-y-4 bg-muted/30">
                  {/* Query Header */}
                  <div className="flex items-center gap-2 flex-wrap">
                    <Badge variant="default" className="font-semibold px-3 py-1 text-sm">
                      Query {index + 1}
                    </Badge>
                    {query.results.length > 0 && (
                      <Badge variant="secondary" className="px-3 py-1">
                        {query.results.length} results
                      </Badge>
                    )}
                    {Object.keys(query.compatibilityScores).length > 0 && (
                      <Badge variant="outline" className="px-3 py-1 border-green-500 text-green-700 dark:text-green-400">
                        <Star className="h-3 w-3 mr-1 fill-green-500" />
                        Scored
                      </Badge>
                    )}
                    {query.regenerateAttempts > 0 && (
                      <Badge variant="outline" className="px-3 py-1 border-amber-500 text-amber-700 dark:text-amber-400">
                        <RefreshCw className="h-3 w-3 mr-1" />
                        Auto-refined {query.regenerateAttempts}x
                      </Badge>
                    )}
                  </div>

                  {/* Query Input & Actions */}
                  <div className="flex gap-2">
                    <Input
                      value={query.text}
                      onChange={(e) => handleEditQuery(query.id, e.target.value)}
                      className="flex-1 font-mono text-sm"
                      placeholder="Enter search query..."
                    />
                    <Button
                      variant="outline"
                      size="icon"
                      onClick={() => handleRegenerateQuery(query.id)}
                      title="Regenerate this query"
                    >
                      <RefreshCw className="h-4 w-4" />
                    </Button>
                  </div>

                  {/* Action Buttons */}
                  <div className="flex gap-2 flex-wrap">
                    <Button
                      onClick={() => handleSearchQuery(query.id)}
                      disabled={query.isSearching || !query.text}
                      className="flex-1 min-w-[140px]"
                    >
                      {query.isSearching ? (
                        <>
                          <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                          Searching...
                        </>
                      ) : (
                        <>
                          <Search className="h-4 w-4 mr-2" />
                          Search Podcasts
                        </>
                      )}
                    </Button>

                    {query.results.length > 0 && (
                      <>
                        <Button
                          onClick={() => handleScanCompatibility(query.id)}
                          disabled={query.isScoring}
                          variant="secondary"
                          className="flex-1 min-w-[160px]"
                        >
                          {query.isScoring ? (
                            <>
                              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                              Scoring...
                            </>
                          ) : (
                            <>
                              <Star className="h-4 w-4 mr-2" />
                              Scan Compatibility
                            </>
                          )}
                        </Button>

                        <Button
                          onClick={() => toggleQueryExpanded(query.id)}
                          variant="outline"
                          className="min-w-[130px]"
                        >
                          {expandedQueryId === query.id ? (
                            <>
                              <ChevronUp className="h-4 w-4 mr-2" />
                              Hide Results
                            </>
                          ) : (
                            <>
                              <ChevronDown className="h-4 w-4 mr-2" />
                              Show Results
                            </>
                          )}
                        </Button>
                      </>
                    )}
                  </div>

                  {/* Results Table */}
                  {expandedQueryId === query.id && query.results.length > 0 && (
                    <div className="border-2 rounded-xl overflow-hidden shadow-sm">
                      <div className="bg-gradient-to-r from-primary/10 to-primary/5 px-5 py-3 border-b-2">
                        <p className="text-sm font-semibold flex items-center gap-2">
                          {Object.keys(query.compatibilityScores).length > 0 ? (
                            <>
                              <Star className="h-4 w-4 fill-yellow-500 text-yellow-500" />
                              Sorted by compatibility score (highest first)
                            </>
                          ) : (
                            <>
                              <Users className="h-4 w-4" />
                              Sorted by audience size (largest first)
                            </>
                          )}
                        </p>
                      </div>
                      <Table>
                        <TableHeader>
                          <TableRow className="bg-muted/50">
                            <TableHead className="w-[50px]">
                              <input
                                type="checkbox"
                                className="w-4 h-4 cursor-pointer"
                                checked={query.results.length > 0 && query.results.every(p => selectedPodcasts.has(p.podcast_id))}
                                onChange={() => handleToggleAllInQuery(query)}
                                onClick={(e) => e.stopPropagation()}
                              />
                            </TableHead>
                            <TableHead className="font-semibold">Podcast</TableHead>
                            <TableHead className="font-semibold">Has Guests</TableHead>
                            <TableHead className="font-semibold">Audience</TableHead>
                            <TableHead className="font-semibold">Episodes</TableHead>
                            <TableHead className="font-semibold">Rating</TableHead>
                            <TableHead className="font-semibold">Fit Score</TableHead>
                            <TableHead className="w-[120px] font-semibold">Actions</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {getSortedResults(query).map((podcast) => (
                            <TableRow
                              key={podcast.podcast_id}
                              className="hover:bg-muted/30 transition-colors cursor-pointer"
                              onClick={() => handlePodcastRowClick(podcast.podcast_id)}
                            >
                              <TableCell className="py-4" onClick={(e) => e.stopPropagation()}>
                                <input
                                  type="checkbox"
                                  className="w-4 h-4 cursor-pointer"
                                  checked={selectedPodcasts.has(podcast.podcast_id)}
                                  onChange={() => handleTogglePodcastSelection(podcast.podcast_id)}
                                />
                              </TableCell>
                              <TableCell className="py-4">
                                <div className="max-w-md">
                                  <p className="font-semibold text-base mb-1">{podcast.podcast_name}</p>
                                  <p className="text-sm text-muted-foreground line-clamp-2">
                                    {podcast.podcast_description}
                                  </p>
                                </div>
                              </TableCell>
                              <TableCell className="py-4">
                                {podcast.podcast_has_guests ? (
                                  <Badge className="bg-green-600 hover:bg-green-700 text-white font-semibold px-3 py-1">
                                    <Users className="h-4 w-4 mr-1" />
                                    Yes
                                  </Badge>
                                ) : (
                                  <Badge variant="secondary" className="font-semibold px-3 py-1">
                                    <X className="h-4 w-4 mr-1" />
                                    No
                                  </Badge>
                                )}
                              </TableCell>
                              <TableCell className="py-4">
                                <div className="flex items-center gap-2">
                                  <Users className="h-4 w-4 text-muted-foreground" />
                                  <span className="font-medium">
                                    {podcast.reach?.audience_size?.toLocaleString() || 'N/A'}
                                  </span>
                                </div>
                              </TableCell>
                              <TableCell className="py-4">
                                <span className="font-medium">{podcast.episode_count}</span>
                              </TableCell>
                              <TableCell className="py-4">
                                <div className="flex items-center gap-1">
                                  <Star className="h-4 w-4 text-yellow-500 fill-yellow-500" />
                                  <span className="font-medium">
                                    {podcast.reach?.itunes?.itunes_rating_average || 'N/A'}
                                  </span>
                                </div>
                              </TableCell>
                              <TableCell className="py-4">
                                {query.compatibilityScores[podcast.podcast_id] !== undefined ? (
                                  <Badge
                                    variant={
                                      (query.compatibilityScores[podcast.podcast_id] || 0) >= 9
                                        ? 'default'
                                        : (query.compatibilityScores[podcast.podcast_id] || 0) >= 8
                                        ? 'default'
                                        : 'secondary'
                                    }
                                    className={`text-base px-3 py-1 cursor-pointer transition-transform hover:scale-105 ${
                                      (query.compatibilityScores[podcast.podcast_id] || 0) >= 9
                                        ? 'bg-emerald-600 hover:bg-emerald-700 font-bold'
                                        : (query.compatibilityScores[podcast.podcast_id] || 0) >= 8
                                        ? 'bg-blue-600 hover:bg-blue-700 font-bold'
                                        : (query.compatibilityScores[podcast.podcast_id] || 0) >= 7
                                        ? 'bg-amber-600 hover:bg-amber-700 font-bold text-white'
                                        : 'font-bold'
                                    }`}
                                    onClick={(e) => {
                                      e.stopPropagation()
                                      handleScoreClick(podcast, query)
                                    }}
                                    title="Click to see why"
                                  >
                                    {(query.compatibilityScores[podcast.podcast_id] || 0) >= 9 ? '🎯' : (query.compatibilityScores[podcast.podcast_id] || 0) >= 8 ? '⭐' : '📊'} {query.compatibilityScores[podcast.podcast_id]}/10
                                  </Badge>
                                ) : (
                                  <span className="text-sm text-muted-foreground font-medium">Not scored</span>
                                )}
                              </TableCell>
                              <TableCell className="py-4" onClick={(e) => e.stopPropagation()}>
                                <div className="flex items-center gap-1">
                                  <Button
                                    variant="ghost"
                                    size="icon"
                                    asChild
                                    title="View on Podscan"
                                  >
                                    <a href={podcast.podcast_url} target="_blank" rel="noopener noreferrer">
                                      <ExternalLink className="h-5 w-5" />
                                    </a>
                                  </Button>
                                  <Button
                                    variant="ghost"
                                    size="icon"
                                    onClick={() => handleDeletePodcast(query.id, podcast.podcast_id, podcast.podcast_name)}
                                    title="Remove from results"
                                    className="text-destructive hover:text-destructive hover:bg-destructive/10"
                                  >
                                    <Trash2 className="h-5 w-5" />
                                  </Button>
                                </div>
                              </TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </div>
                  )}
                </div>
              ))}
            </CardContent>
          </Card>
        )}

            {/* Empty State */}
            {queries.length === 0 && (
              <Card className="border-2 shadow-sm">
                <CardContent className="flex flex-col items-center justify-center py-20">
                  <div className="rounded-full bg-primary/10 p-6 mb-6">
                    <Sparkles className="h-16 w-16 text-primary" />
                  </div>
                  <h3 className="text-2xl font-bold mb-3">Ready to Find Podcasts</h3>
                  <p className="text-muted-foreground text-center max-w-lg text-base mb-8">
                    Select a client above and click "Generate 5 AI Queries" to get started with AI-powered podcast discovery
                  </p>
                  <div className="flex items-center gap-4 text-sm text-muted-foreground">
                    <div className="flex items-center gap-2">
                      <Sparkles className="h-4 w-4" />
                      <span>AI-Powered Queries</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <Search className="h-4 w-4" />
                      <span>Advanced Filters</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <Star className="h-4 w-4" />
                      <span>Compatibility Scoring</span>
                    </div>
                  </div>
                </CardContent>
              </Card>
            )}
          </>
        )}

        {/* Charts Mode Content */}
        {finderMode === 'charts' && (
          <>
            {/* Chart Selection */}
            <Card className="border-2 shadow-sm">
              <CardHeader className="pb-4">
                <div className="flex items-center gap-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-full bg-primary text-primary-foreground font-bold text-lg">
                    2
                  </div>
                  <div>
                    <CardTitle className="text-xl">Browse Top Charts</CardTitle>
                    <CardDescription className="text-base mt-1">
                      Select platform, country, and category to browse top-ranked podcasts
                    </CardDescription>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="space-y-6">
                {/* Platform Selection */}
                <div className="space-y-2">
                  <Label className="text-sm font-semibold">Platform</Label>
                  <div className="flex gap-2">
                    <Button
                      variant={chartPlatform === 'apple' ? 'default' : 'outline'}
                      onClick={() => setChartPlatform('apple')}
                      className="flex-1"
                    >
                      Apple Podcasts
                    </Button>
                    <Button
                      variant={chartPlatform === 'spotify' ? 'default' : 'outline'}
                      onClick={() => setChartPlatform('spotify')}
                      className="flex-1"
                    >
                      Spotify
                    </Button>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    {chartPlatform === 'apple' ? 'Returns up to 200 podcasts' : 'Returns up to 50 podcasts'}
                  </p>
                </div>

                {/* Country & Category Selection */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="chart-country" className="text-sm font-semibold flex items-center gap-2">
                      <Globe className="h-4 w-4" />
                      Country
                      {loadingCountries && <Loader2 className="h-3 w-3 animate-spin" />}
                    </Label>
                    <Select value={chartCountry} onValueChange={setChartCountry} disabled={loadingCountries}>
                      <SelectTrigger id="chart-country">
                        <SelectValue placeholder={loadingCountries ? 'Loading...' : 'Select country...'} />
                      </SelectTrigger>
                      <SelectContent>
                        {chartCountries.map((country) => (
                          <SelectItem key={country.code} value={country.code}>
                            {country.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="chart-category" className="text-sm font-semibold flex items-center gap-2">
                      <Filter className="h-4 w-4" />
                      Category
                      {loadingCategories && <Loader2 className="h-3 w-3 animate-spin" />}
                    </Label>
                    <Select value={chartCategory} onValueChange={setChartCategory} disabled={loadingCategories || chartCategories.length === 0}>
                      <SelectTrigger id="chart-category">
                        <SelectValue placeholder={loadingCategories ? 'Loading...' : 'Select category...'} />
                      </SelectTrigger>
                      <SelectContent>
                        {chartCategories.map((cat) => (
                          <SelectItem key={cat.id} value={cat.id}>
                            {cat.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="chart-limit" className="text-sm font-semibold flex items-center gap-2">
                      <Users className="h-4 w-4" />
                      Limit
                    </Label>
                    <Select value={chartLimit.toString()} onValueChange={(v) => setChartLimit(parseInt(v))}>
                      <SelectTrigger id="chart-limit">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="10">10 podcasts</SelectItem>
                        <SelectItem value="25">25 podcasts</SelectItem>
                        <SelectItem value="50">50 podcasts</SelectItem>
                        <SelectItem value="100">100 podcasts</SelectItem>
                        <SelectItem value="200">200 podcasts</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                {/* Get Top Podcasts Button */}
                <Button
                  onClick={handleFetchCharts}
                  disabled={!chartCategory || loadingCharts}
                  size="lg"
                  className="w-full"
                >
                  {loadingCharts ? (
                    <>
                      <Loader2 className="h-5 w-5 mr-2 animate-spin" />
                      Loading Charts...
                    </>
                  ) : (
                    <>
                      <TrendingUp className="h-5 w-5 mr-2" />
                      Get Top Podcasts
                    </>
                  )}
                </Button>
              </CardContent>
            </Card>

            {/* Chart Results */}
            {chartResults.length > 0 && (
              <Card className="border-2 shadow-sm">
                <CardHeader className="pb-4">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className="flex h-10 w-10 items-center justify-center rounded-full bg-primary text-primary-foreground font-bold text-lg">
                        3
                      </div>
                      <div>
                        <CardTitle className="text-xl">Chart Results</CardTitle>
                        <CardDescription className="text-base mt-1">
                          {chartResults.length} top podcasts from {chartPlatform === 'apple' ? 'Apple Podcasts' : 'Spotify'}
                        </CardDescription>
                      </div>
                    </div>
                    <Button
                      onClick={handleScanChartCompatibility}
                      disabled={isChartScoring || !selectedClientData?.bio}
                      variant="secondary"
                    >
                      {isChartScoring ? (
                        <>
                          <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                          Scoring...
                        </>
                      ) : (
                        <>
                          <Star className="h-4 w-4 mr-2" />
                          Scan Compatibility
                        </>
                      )}
                    </Button>
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="border-2 rounded-xl overflow-hidden shadow-sm">
                    <Table>
                      <TableHeader>
                        <TableRow className="bg-muted/50">
                          <TableHead className="w-[50px]">
                            <input
                              type="checkbox"
                              className="w-4 h-4 cursor-pointer"
                              checked={chartResults.length > 0 && chartResults.every(p => selectedPodcasts.has(p.podcast_id))}
                              onChange={() => {
                                const allSelected = chartResults.every(p => selectedPodcasts.has(p.podcast_id))
                                setSelectedPodcasts(prev => {
                                  const newSet = new Set(prev)
                                  if (allSelected) {
                                    chartResults.forEach(p => newSet.delete(p.podcast_id))
                                  } else {
                                    chartResults.forEach(p => newSet.add(p.podcast_id))
                                  }
                                  return newSet
                                })
                              }}
                            />
                          </TableHead>
                          <TableHead className="w-[60px] font-semibold">#</TableHead>
                          <TableHead className="w-[60px] font-semibold"></TableHead>
                          <TableHead className="font-semibold">Podcast</TableHead>
                          <TableHead className="font-semibold">Audience</TableHead>
                          <TableHead className="font-semibold">Episodes</TableHead>
                          <TableHead className="font-semibold">Rating</TableHead>
                          <TableHead className="font-semibold">Fit Score</TableHead>
                          <TableHead className="w-[80px] font-semibold">Actions</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {chartResults.map((podcast, index) => (
                          <TableRow
                            key={podcast.podcast_id}
                            className="hover:bg-muted/30 transition-colors cursor-pointer"
                            onClick={() => handlePodcastRowClick(podcast.podcast_id)}
                          >
                            <TableCell className="py-4" onClick={(e) => e.stopPropagation()}>
                              <input
                                type="checkbox"
                                className="w-4 h-4 cursor-pointer"
                                checked={selectedPodcasts.has(podcast.podcast_id)}
                                onChange={() => handleTogglePodcastSelection(podcast.podcast_id)}
                              />
                            </TableCell>
                            <TableCell className="py-4">
                              <Badge variant="outline" className="font-bold">
                                {(podcast as any).rank || index + 1}
                              </Badge>
                            </TableCell>
                            <TableCell className="py-2">
                              {podcast.podcast_image_url ? (
                                <img
                                  src={podcast.podcast_image_url}
                                  alt={podcast.podcast_name}
                                  className="w-12 h-12 rounded-lg object-cover"
                                />
                              ) : (
                                <div className="w-12 h-12 rounded-lg bg-muted flex items-center justify-center">
                                  <span className="text-xs text-muted-foreground">No img</span>
                                </div>
                              )}
                            </TableCell>
                            <TableCell className="py-4">
                              <div className="max-w-md">
                                <p className="font-semibold text-base mb-1">{podcast.podcast_name}</p>
                                <p className="text-xs text-muted-foreground mb-1">{podcast.publisher_name}</p>
                                <p className="text-sm text-muted-foreground line-clamp-1">
                                  {podcast.podcast_description}
                                </p>
                              </div>
                            </TableCell>
                            <TableCell className="py-4">
                              <div className="flex items-center gap-2">
                                <Users className="h-4 w-4 text-muted-foreground" />
                                <span className="font-medium">
                                  {podcast.reach?.audience_size?.toLocaleString() || 'N/A'}
                                </span>
                              </div>
                            </TableCell>
                            <TableCell className="py-4">
                              <span className="font-medium">{podcast.episode_count}</span>
                            </TableCell>
                            <TableCell className="py-4">
                              <div className="flex items-center gap-1">
                                <Star className="h-4 w-4 text-yellow-500 fill-yellow-500" />
                                <span className="font-medium">
                                  {podcast.reach?.itunes?.itunes_rating_average || 'N/A'}
                                </span>
                              </div>
                            </TableCell>
                            <TableCell className="py-4">
                              {chartScores[podcast.podcast_id] !== undefined ? (
                                <Badge
                                  variant="default"
                                  className={`text-base px-3 py-1 cursor-pointer ${
                                    (chartScores[podcast.podcast_id] || 0) >= 8
                                      ? 'bg-emerald-600 hover:bg-emerald-700'
                                      : ''
                                  }`}
                                  onClick={(e) => {
                                    e.stopPropagation()
                                    setSelectedPodcastForScore({
                                      podcast,
                                      score: chartScores[podcast.podcast_id] || 0,
                                      reasoning: chartReasonings[podcast.podcast_id]
                                    })
                                    setScoreModalOpen(true)
                                  }}
                                >
                                  {chartScores[podcast.podcast_id]}/10
                                </Badge>
                              ) : (
                                <span className="text-sm text-muted-foreground font-medium">Not scored</span>
                              )}
                            </TableCell>
                            <TableCell className="py-4" onClick={(e) => e.stopPropagation()}>
                              <Button
                                variant="ghost"
                                size="icon"
                                asChild
                                title="View on Podscan"
                              >
                                <a href={podcast.podcast_url} target="_blank" rel="noopener noreferrer">
                                  <ExternalLink className="h-5 w-5" />
                                </a>
                              </Button>
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Charts Empty State */}
            {chartResults.length === 0 && (
              <Card className="border-2 shadow-sm">
                <CardContent className="flex flex-col items-center justify-center py-20">
                  <div className="rounded-full bg-primary/10 p-6 mb-6">
                    <TrendingUp className="h-16 w-16 text-primary" />
                  </div>
                  <h3 className="text-2xl font-bold mb-3">Browse Top Charts</h3>
                  <p className="text-muted-foreground text-center max-w-lg text-base mb-8">
                    Select a platform, country, and category above, then click "Get Top Podcasts" to browse the top-ranked podcasts
                  </p>
                  <div className="flex items-center gap-4 text-sm text-muted-foreground">
                    <div className="flex items-center gap-2">
                      <TrendingUp className="h-4 w-4" />
                      <span>Chart Rankings</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <Globe className="h-4 w-4" />
                      <span>Multiple Countries</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <Star className="h-4 w-4" />
                      <span>Compatibility Scoring</span>
                    </div>
                  </div>
                </CardContent>
              </Card>
            )}
          </>
        )}

        {/* Score Details Modal */}
        <Dialog open={scoreModalOpen} onOpenChange={setScoreModalOpen}>
          <DialogContent className="max-w-2xl">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <Star className="h-5 w-5 text-yellow-500 fill-yellow-500" />
                Compatibility Score Details
              </DialogTitle>
              <DialogDescription>
                AI analysis of podcast fit for your client
              </DialogDescription>
            </DialogHeader>

            {selectedPodcastForScore && (
              <div className="space-y-4">
                {/* Podcast Info */}
                <div className="p-4 bg-muted/50 rounded-lg">
                  <h3 className="font-semibold text-lg mb-2">
                    {selectedPodcastForScore.podcast.podcast_name}
                  </h3>
                  <p className="text-sm text-muted-foreground line-clamp-3">
                    {selectedPodcastForScore.podcast.podcast_description}
                  </p>
                  <div className="flex gap-4 mt-3 text-sm">
                    <div className="flex items-center gap-1">
                      <Users className="h-4 w-4 text-muted-foreground" />
                      <span>{selectedPodcastForScore.podcast.reach?.audience_size?.toLocaleString() || 'N/A'}</span>
                    </div>
                    <div className="flex items-center gap-1">
                      <Calendar className="h-4 w-4 text-muted-foreground" />
                      <span>{selectedPodcastForScore.podcast.episode_count} episodes</span>
                    </div>
                  </div>
                </div>

                {/* Score */}
                <div className="text-center p-6 bg-gradient-to-br from-primary/10 to-primary/5 rounded-lg border-2 border-primary/20">
                  <p className="text-sm text-muted-foreground mb-2">Compatibility Score</p>
                  <div className="text-5xl font-bold text-primary mb-2">
                    {selectedPodcastForScore.score}
                    <span className="text-2xl text-muted-foreground">/10</span>
                  </div>
                  <Badge
                    variant="outline"
                    className={`text-sm px-3 py-1 ${
                      selectedPodcastForScore.score >= 9
                        ? 'border-emerald-500 text-emerald-700 dark:text-emerald-400'
                        : selectedPodcastForScore.score >= 8
                        ? 'border-blue-500 text-blue-700 dark:text-blue-400'
                        : selectedPodcastForScore.score >= 7
                        ? 'border-amber-500 text-amber-700 dark:text-amber-400'
                        : 'border-gray-500 text-gray-700 dark:text-gray-400'
                    }`}
                  >
                    {selectedPodcastForScore.score >= 9
                      ? '🎯 Perfect Fit'
                      : selectedPodcastForScore.score >= 8
                      ? '⭐ Great Fit'
                      : selectedPodcastForScore.score >= 7
                      ? '📊 Good Fit'
                      : '📉 Moderate Fit'}
                  </Badge>
                </div>

                {/* Reasoning */}
                <div className="space-y-2">
                  <h4 className="font-semibold flex items-center gap-2">
                    <Sparkles className="h-4 w-4" />
                    Why This Score?
                  </h4>
                  {selectedPodcastForScore.reasoning ? (
                    <div className="p-4 bg-background border rounded-lg text-sm leading-relaxed whitespace-pre-wrap">
                      {selectedPodcastForScore.reasoning}
                    </div>
                  ) : (
                    <div className="p-4 bg-muted/30 border border-dashed rounded-lg text-sm text-muted-foreground text-center">
                      No detailed reasoning available for this score.
                    </div>
                  )}
                </div>

                {/* Action Buttons */}
                <div className="flex gap-2 pt-2">
                  <Button
                    variant="outline"
                    className="flex-1"
                    asChild
                  >
                    <a href={selectedPodcastForScore.podcast.podcast_url} target="_blank" rel="noopener noreferrer">
                      <ExternalLink className="h-4 w-4 mr-2" />
                      View on Podscan
                    </a>
                  </Button>
                  <Button
                    onClick={() => setScoreModalOpen(false)}
                    className="flex-1"
                  >
                    Close
                  </Button>
                </div>
              </div>
            )}
          </DialogContent>
        </Dialog>

        {/* Podcast Details Modal */}
        <Dialog open={podcastDetailsModalOpen} onOpenChange={setPodcastDetailsModalOpen}>
          <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <Search className="h-5 w-5 text-primary" />
                Podcast Details
              </DialogTitle>
              <DialogDescription>
                Full information about this podcast
              </DialogDescription>
            </DialogHeader>

            {loadingPodcastDetails ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="h-8 w-8 animate-spin text-primary" />
              </div>
            ) : selectedPodcastDetails ? (
              <div className="space-y-6">
                {/* Header with Image */}
                <div className="flex gap-4">
                  {selectedPodcastDetails.podcast_image_url && (
                    <img
                      src={selectedPodcastDetails.podcast_image_url}
                      alt={selectedPodcastDetails.podcast_name}
                      className="w-32 h-32 rounded-lg object-cover shadow-lg"
                    />
                  )}
                  <div className="flex-1">
                    <h2 className="text-2xl font-bold mb-2">{selectedPodcastDetails.podcast_name}</h2>
                    {selectedPodcastDetails.publisher_name && (
                      <p className="text-muted-foreground mb-2">
                        by {selectedPodcastDetails.publisher_name}
                      </p>
                    )}
                    <div className="flex flex-wrap gap-2">
                      {selectedPodcastDetails.podcast_categories?.map((cat) => (
                        <Badge key={cat.category_id} variant="secondary">
                          {cat.category_name}
                        </Badge>
                      ))}
                    </div>
                  </div>
                </div>

                {/* Description */}
                {selectedPodcastDetails.podcast_description && (
                  <div className="space-y-2">
                    <h3 className="font-semibold text-lg">Description</h3>
                    <p className="text-sm leading-relaxed text-muted-foreground">
                      {selectedPodcastDetails.podcast_description}
                    </p>
                  </div>
                )}

                {/* Stats Grid */}
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  <div className="p-4 bg-muted/50 rounded-lg text-center">
                    <Users className="h-5 w-5 mx-auto mb-2 text-primary" />
                    <p className="text-2xl font-bold">
                      {selectedPodcastDetails.reach?.audience_size?.toLocaleString() || 'N/A'}
                    </p>
                    <p className="text-xs text-muted-foreground">Audience Size</p>
                  </div>
                  <div className="p-4 bg-muted/50 rounded-lg text-center">
                    <Calendar className="h-5 w-5 mx-auto mb-2 text-primary" />
                    <p className="text-2xl font-bold">{selectedPodcastDetails.episode_count || 0}</p>
                    <p className="text-xs text-muted-foreground">Episodes</p>
                  </div>
                  <div className="p-4 bg-muted/50 rounded-lg text-center">
                    <Star className="h-5 w-5 mx-auto mb-2 text-yellow-500 fill-yellow-500" />
                    <p className="text-2xl font-bold">
                      {selectedPodcastDetails.reach?.itunes?.itunes_rating_average || 'N/A'}
                    </p>
                    <p className="text-xs text-muted-foreground">iTunes Rating</p>
                  </div>
                  <div className="p-4 bg-muted/50 rounded-lg text-center">
                    <Globe className="h-5 w-5 mx-auto mb-2 text-primary" />
                    <p className="text-2xl font-bold">{selectedPodcastDetails.language?.toUpperCase() || 'EN'}</p>
                    <p className="text-xs text-muted-foreground">Language</p>
                  </div>
                </div>

                {/* Additional Info */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {selectedPodcastDetails.reach?.website && (
                    <div className="space-y-1">
                      <p className="text-sm font-semibold">Website</p>
                      <a
                        href={selectedPodcastDetails.reach.website}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-sm text-primary hover:underline flex items-center gap-1"
                      >
                        {selectedPodcastDetails.reach.website}
                        <ExternalLink className="h-3 w-3" />
                      </a>
                    </div>
                  )}
                  {selectedPodcastDetails.reach?.email && (
                    <div className="space-y-1">
                      <p className="text-sm font-semibold">Email</p>
                      <a
                        href={`mailto:${selectedPodcastDetails.reach.email}`}
                        className="text-sm text-primary hover:underline"
                      >
                        {selectedPodcastDetails.reach.email}
                      </a>
                    </div>
                  )}
                  {selectedPodcastDetails.rss_url && (
                    <div className="space-y-1">
                      <p className="text-sm font-semibold">RSS Feed</p>
                      <a
                        href={selectedPodcastDetails.rss_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-sm text-primary hover:underline flex items-center gap-1 truncate"
                      >
                        {selectedPodcastDetails.rss_url}
                        <ExternalLink className="h-3 w-3" />
                      </a>
                    </div>
                  )}
                  {selectedPodcastDetails.last_posted_at && (
                    <div className="space-y-1">
                      <p className="text-sm font-semibold">Last Episode</p>
                      <p className="text-sm text-muted-foreground">
                        {new Date(selectedPodcastDetails.last_posted_at).toLocaleDateString()}
                      </p>
                    </div>
                  )}
                </div>

                {/* Social Links */}
                {selectedPodcastDetails.reach?.social_links && selectedPodcastDetails.reach.social_links.length > 0 && (
                  <div className="space-y-2">
                    <h3 className="font-semibold text-lg">Social Media</h3>
                    <div className="flex flex-wrap gap-2">
                      {selectedPodcastDetails.reach.social_links.map((link, idx) => (
                        <Button
                          key={idx}
                          variant="outline"
                          size="sm"
                          asChild
                        >
                          <a href={link.url} target="_blank" rel="noopener noreferrer">
                            <ExternalLink className="h-4 w-4 mr-2" />
                            {link.platform}
                          </a>
                        </Button>
                      ))}
                    </div>
                  </div>
                )}

                {/* Podcast Features */}
                <div className="flex flex-wrap gap-2 py-2">
                  {selectedPodcastDetails.podcast_has_guests && (
                    <Badge variant="outline" className="px-3 py-1">
                      <Users className="h-3 w-3 mr-1" />
                      Has Guests
                    </Badge>
                  )}
                  {selectedPodcastDetails.podcast_has_sponsors && (
                    <Badge variant="outline" className="px-3 py-1">
                      <TrendingUp className="h-3 w-3 mr-1" />
                      Has Sponsors
                    </Badge>
                  )}
                  {selectedPodcastDetails.is_active && (
                    <Badge variant="outline" className="px-3 py-1 border-green-500 text-green-700 dark:text-green-400">
                      Active
                    </Badge>
                  )}
                </div>

                {/* Demographics Section */}
                {loadingDemographics ? (
                  <div className="p-4 bg-muted/30 rounded-lg">
                    <div className="flex items-center gap-2">
                      <Loader2 className="h-4 w-4 animate-spin" />
                      <span className="text-sm text-muted-foreground">Analyzing audience demographics...</span>
                    </div>
                  </div>
                ) : podcastDemographics ? (
                  <div className="space-y-6 p-5 bg-gradient-to-br from-purple-50/50 to-indigo-50/50 dark:from-purple-950/20 dark:to-indigo-950/20 rounded-xl border-2 border-purple-200 dark:border-purple-800">
                    {/* Header */}
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <div className="p-2 bg-purple-600 rounded-lg">
                          <Users className="h-5 w-5 text-white" />
                        </div>
                        <div>
                          <h3 className="font-bold text-lg">Audience Intelligence</h3>
                          <p className="text-xs text-muted-foreground">Deep insights from {podcastDemographics.episodes_analyzed} episodes</p>
                        </div>
                      </div>
                      <Badge className="bg-purple-600 hover:bg-purple-700">AI-Powered</Badge>
                    </div>

                    {/* Key Metrics Grid */}
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                      <div className="p-3 bg-gradient-to-br from-green-100 to-emerald-100 dark:from-green-900/30 dark:to-emerald-900/30 rounded-xl border border-green-200 dark:border-green-800">
                        <p className="text-[10px] uppercase tracking-wider text-green-600 dark:text-green-400 font-semibold mb-1">Buying Power</p>
                        <p className="font-bold text-lg text-green-800 dark:text-green-300">{podcastDemographics.purchasing_power || 'N/A'}</p>
                      </div>
                      <div className="p-3 bg-gradient-to-br from-purple-100 to-violet-100 dark:from-purple-900/30 dark:to-violet-900/30 rounded-xl border border-purple-200 dark:border-purple-800">
                        <p className="text-[10px] uppercase tracking-wider text-purple-600 dark:text-purple-400 font-semibold mb-1">Education</p>
                        <p className="font-bold text-lg text-purple-800 dark:text-purple-300">{podcastDemographics.education_level || 'N/A'}</p>
                      </div>
                      <div className="p-3 bg-gradient-to-br from-blue-100 to-sky-100 dark:from-blue-900/30 dark:to-sky-900/30 rounded-xl border border-blue-200 dark:border-blue-800">
                        <p className="text-[10px] uppercase tracking-wider text-blue-600 dark:text-blue-400 font-semibold mb-1">Core Age</p>
                        <p className="font-bold text-lg text-blue-800 dark:text-blue-300">{podcastDemographics.age || 'N/A'}</p>
                      </div>
                      <div className="p-3 bg-gradient-to-br from-orange-100 to-amber-100 dark:from-orange-900/30 dark:to-amber-900/30 rounded-xl border border-orange-200 dark:border-orange-800">
                        <p className="text-[10px] uppercase tracking-wider text-orange-600 dark:text-orange-400 font-semibold mb-1">Engagement</p>
                        <p className="font-bold text-lg text-orange-800 dark:text-orange-300">{podcastDemographics.engagement_level || 'N/A'}</p>
                      </div>
                    </div>

                    {/* Gender & Age Distribution */}
                    <div className="grid md:grid-cols-2 gap-4">
                      {/* Gender */}
                      {podcastDemographics.gender_skew && (
                        <div className="p-4 bg-white/60 dark:bg-black/20 rounded-xl border">
                          <p className="text-xs font-semibold text-muted-foreground mb-2 uppercase tracking-wider">Gender Skew</p>
                          <div className="flex items-center gap-3">
                            <div className="flex-1">
                              <div className="h-3 bg-gradient-to-r from-blue-400 via-purple-400 to-pink-400 rounded-full" />
                            </div>
                            <span className="font-bold text-sm">{podcastDemographics.gender_skew}</span>
                          </div>
                        </div>
                      )}

                      {/* Age Distribution */}
                      {podcastDemographics.age_distribution && podcastDemographics.age_distribution.length > 0 && (
                        <div className="p-4 bg-white/60 dark:bg-black/20 rounded-xl border">
                          <p className="text-xs font-semibold text-muted-foreground mb-3 uppercase tracking-wider">Age Distribution</p>
                          <div className="space-y-2">
                            {podcastDemographics.age_distribution.slice(0, 4).map((item, idx) => (
                              <div key={idx} className="flex items-center gap-2">
                                <span className="text-xs w-16 text-muted-foreground">{item.age}</span>
                                <div className="flex-1 h-2 bg-muted rounded-full overflow-hidden">
                                  <div
                                    className="h-full bg-gradient-to-r from-blue-500 to-purple-500 rounded-full transition-all"
                                    style={{ width: `${Math.min(item.percentage, 100)}%` }}
                                  />
                                </div>
                                <span className="text-xs font-semibold w-10 text-right">{item.percentage}%</span>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>

                    {/* Geographic & Professional Distribution */}
                    <div className="grid md:grid-cols-2 gap-4">
                      {/* Geographic */}
                      {podcastDemographics.geographic_distribution && podcastDemographics.geographic_distribution.length > 0 && (
                        <div className="p-4 bg-white/60 dark:bg-black/20 rounded-xl border">
                          <div className="flex items-center gap-2 mb-3">
                            <Globe className="h-4 w-4 text-blue-500" />
                            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Top Regions</p>
                          </div>
                          <div className="flex flex-wrap gap-2">
                            {podcastDemographics.geographic_distribution.slice(0, 5).map((item, idx) => (
                              <Badge key={idx} variant="outline" className="text-xs">
                                {item.region} <span className="ml-1 font-bold text-blue-600">{item.percentage}%</span>
                              </Badge>
                            ))}
                          </div>
                        </div>
                      )}

                      {/* Professional Industry */}
                      {podcastDemographics.professional_industry && podcastDemographics.professional_industry.length > 0 && (
                        <div className="p-4 bg-white/60 dark:bg-black/20 rounded-xl border">
                          <div className="flex items-center gap-2 mb-3">
                            <TrendingUp className="h-4 w-4 text-green-500" />
                            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Industries</p>
                          </div>
                          <div className="flex flex-wrap gap-2">
                            {podcastDemographics.professional_industry.slice(0, 5).map((item, idx) => (
                              <Badge key={idx} variant="outline" className="text-xs">
                                {item.industry} <span className="ml-1 font-bold text-green-600">{item.percentage}%</span>
                              </Badge>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>

                    {/* Living Environment */}
                    {podcastDemographics.living_environment && (
                      <div className="p-4 bg-white/60 dark:bg-black/20 rounded-xl border">
                        <p className="text-xs font-semibold text-muted-foreground mb-3 uppercase tracking-wider">Living Environment</p>
                        <div className="flex gap-2">
                          <div className="flex-1 text-center p-2 rounded-lg bg-blue-100/50 dark:bg-blue-900/30">
                            <p className="text-2xl font-bold text-blue-600">{podcastDemographics.living_environment.urban}%</p>
                            <p className="text-xs text-muted-foreground">Urban</p>
                          </div>
                          <div className="flex-1 text-center p-2 rounded-lg bg-green-100/50 dark:bg-green-900/30">
                            <p className="text-2xl font-bold text-green-600">{podcastDemographics.living_environment.suburban}%</p>
                            <p className="text-xs text-muted-foreground">Suburban</p>
                          </div>
                          <div className="flex-1 text-center p-2 rounded-lg bg-amber-100/50 dark:bg-amber-900/30">
                            <p className="text-2xl font-bold text-amber-600">{podcastDemographics.living_environment.rural}%</p>
                            <p className="text-xs text-muted-foreground">Rural</p>
                          </div>
                        </div>
                      </div>
                    )}

                    {/* Brand Relationship */}
                    {podcastDemographics.brand_relationship && (
                      <div className="p-4 bg-gradient-to-r from-amber-50 to-orange-50 dark:from-amber-950/30 dark:to-orange-950/30 rounded-xl border border-amber-200 dark:border-amber-800">
                        <p className="text-xs font-semibold text-amber-700 dark:text-amber-400 mb-3 uppercase tracking-wider">Brand Relationship</p>
                        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-3">
                          <div className="text-center">
                            <p className="text-xs text-muted-foreground">Loyalty</p>
                            <p className="font-bold text-amber-700 dark:text-amber-400">{podcastDemographics.brand_relationship.loyalty_level}</p>
                          </div>
                          <div className="text-center">
                            <p className="text-xs text-muted-foreground">Price Sensitivity</p>
                            <p className="font-bold text-amber-700 dark:text-amber-400">{podcastDemographics.brand_relationship.price_sensitivity}</p>
                          </div>
                          <div className="text-center">
                            <p className="text-xs text-muted-foreground">Switching</p>
                            <p className="font-bold text-amber-700 dark:text-amber-400">{podcastDemographics.brand_relationship.brand_switching_frequency}</p>
                          </div>
                          <div className="text-center">
                            <p className="text-xs text-muted-foreground">Advocacy</p>
                            <p className="font-bold text-amber-700 dark:text-amber-400">{podcastDemographics.brand_relationship.advocacy_potential}</p>
                          </div>
                        </div>
                        {podcastDemographics.brand_relationship.reasoning && (
                          <p className="text-xs text-muted-foreground italic">"{podcastDemographics.brand_relationship.reasoning}"</p>
                        )}
                      </div>
                    )}

                    {/* Technology Adoption */}
                    {podcastDemographics.technology_adoption && (
                      <div className="p-4 bg-gradient-to-r from-cyan-50 to-blue-50 dark:from-cyan-950/30 dark:to-blue-950/30 rounded-xl border border-cyan-200 dark:border-cyan-800">
                        <div className="flex items-center justify-between mb-2">
                          <p className="text-xs font-semibold text-cyan-700 dark:text-cyan-400 uppercase tracking-wider">Tech Adoption Profile</p>
                          <Badge className="bg-cyan-600">{Math.round(podcastDemographics.technology_adoption.confidence_score * 100)}% Confidence</Badge>
                        </div>
                        <p className="font-bold text-lg text-cyan-800 dark:text-cyan-300 mb-1">{podcastDemographics.technology_adoption.profile}</p>
                        {podcastDemographics.technology_adoption.reasoning && (
                          <p className="text-xs text-muted-foreground">"{podcastDemographics.technology_adoption.reasoning}"</p>
                        )}
                      </div>
                    )}

                    {/* Content Habits */}
                    {podcastDemographics.content_habits && (
                      <div className="p-4 bg-white/60 dark:bg-black/20 rounded-xl border">
                        <p className="text-xs font-semibold text-muted-foreground mb-3 uppercase tracking-wider">Content Consumption</p>
                        <div className="space-y-3">
                          {podcastDemographics.content_habits.primary_platforms && (
                            <div>
                              <p className="text-[10px] text-muted-foreground mb-1">Platforms</p>
                              <div className="flex flex-wrap gap-1">
                                {podcastDemographics.content_habits.primary_platforms.map((platform, idx) => (
                                  <Badge key={idx} variant="secondary" className="text-xs">{platform}</Badge>
                                ))}
                              </div>
                            </div>
                          )}
                          {podcastDemographics.content_habits.preferred_formats && (
                            <div>
                              <p className="text-[10px] text-muted-foreground mb-1">Preferred Formats</p>
                              <div className="flex flex-wrap gap-1">
                                {podcastDemographics.content_habits.preferred_formats.map((format, idx) => (
                                  <Badge key={idx} variant="outline" className="text-xs">{format}</Badge>
                                ))}
                              </div>
                            </div>
                          )}
                          {podcastDemographics.content_habits.consumption_context && (
                            <div>
                              <p className="text-[10px] text-muted-foreground mb-1">When They Listen</p>
                              <div className="flex flex-wrap gap-1">
                                {podcastDemographics.content_habits.consumption_context.map((context, idx) => (
                                  <Badge key={idx} variant="outline" className="text-xs bg-purple-50 dark:bg-purple-950/30">{context}</Badge>
                                ))}
                              </div>
                            </div>
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                ) : null}

                {/* Action Buttons */}
                <div className="flex gap-2 pt-2">
                  <Button
                    variant="outline"
                    className="flex-1"
                    asChild
                  >
                    <a href={selectedPodcastDetails.podcast_url} target="_blank" rel="noopener noreferrer">
                      <ExternalLink className="h-4 w-4 mr-2" />
                      View on Podscan
                    </a>
                  </Button>
                  <Button
                    onClick={() => setPodcastDetailsModalOpen(false)}
                    className="flex-1"
                  >
                    Close
                  </Button>
                </div>
              </div>
            ) : (
              <div className="text-center py-12 text-muted-foreground">
                No podcast details available
              </div>
            )}
          </DialogContent>
        </Dialog>
      </div>
    </DashboardLayout>
  )
}
