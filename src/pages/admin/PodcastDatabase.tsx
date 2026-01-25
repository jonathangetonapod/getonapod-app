import { useState, useMemo, useEffect } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useSearchParams } from 'react-router-dom'
import { DashboardLayout } from '@/components/admin/DashboardLayout'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Checkbox } from '@/components/ui/checkbox'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow
} from '@/components/ui/table'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuCheckboxItem,
  DropdownMenuSeparator,
  DropdownMenuLabel,
} from '@/components/ui/dropdown-menu'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip'
import {
  Search,
  LayoutGrid,
  LayoutList,
  MoreVertical,
  Star,
  TrendingUp,
  Download,
  Loader2,
  Database,
  Users as UsersIcon,
  Target,
  CheckCircle2,
  XCircle,
  ArrowUpDown,
  ArrowUp,
  ArrowDown,
  Columns3,
} from 'lucide-react'
import { getClients } from '@/services/clients'
import {
  getPodcasts,
  getPodcastStatistics,
  getPodcastCategories,
  exportPodcastsToCSV,
  type PodcastFilters,
  type PodcastDatabaseItem
} from '@/services/podcastDatabase'
import { scoreCompatibilityBatch, type PodcastForScoring } from '@/services/compatibilityScoring'
import { exportPodcastsToGoogleSheets, createProspectSheet, appendToProspectSheet, type PodcastExportData } from '@/services/googleSheets'
import { supabase } from '@/lib/supabase'
import { toast } from 'sonner'

type ViewMode = 'table' | 'grid'
type Mode = 'browse' | 'client' | 'prospect'
type SortOption = 'name' | 'host' | 'audience' | 'rating' | 'episodes' | 'dateAdded'
type TableDensity = 'compact' | 'comfortable' | 'spacious'

interface ColumnVisibility {
  host: boolean
  audience: boolean
  rating: boolean
  episodes: boolean
}

interface ExistingProspect {
  id: string
  prospect_name: string
  prospect_bio: string | null
  prospect_image_url: string | null
  spreadsheet_url: string | null
  slug: string
}

interface FilterPreset {
  id: string
  name: string
  filters: {
    searchQuery: string
    categoryFilter: string | string[]  // Support both old and new format
    minAudience: string
    maxAudience: string
    minRating: string
    maxRating: string
    hasEmailFilter: boolean
    languageFilter: string
    regionFilter: string
    minEpisodes: string
    maxEpisodes: string
    hasGuestsFilter: boolean
    hasSponsorsFilter: boolean
    isActiveFilter: boolean
  }
}

const PRESETS_STORAGE_KEY = 'podcast-database-filter-presets'

export default function PodcastDatabase() {
  // URL Parameters for filter persistence
  const [searchParams, setSearchParams] = useSearchParams()

  // View & Mode State
  const [viewMode, setViewMode] = useState<ViewMode>('table')
  const [mode, setMode] = useState<Mode>('browse')
  const [tableDensity, setTableDensity] = useState<TableDensity>(() => {
    try {
      const stored = localStorage.getItem('podcast-database-density')
      return (stored as TableDensity) || 'comfortable'
    } catch (error) {
      console.error('Failed to load table density:', error)
      return 'comfortable'
    }
  })
  const [columnVisibility, setColumnVisibility] = useState<ColumnVisibility>(() => {
    try {
      const stored = localStorage.getItem('podcast-database-columns')
      return stored ? JSON.parse(stored) : {
        host: true,
        audience: true,
        rating: true,
        episodes: true,
      }
    } catch (error) {
      console.error('Failed to load column visibility:', error)
      return {
        host: true,
        audience: true,
        rating: true,
        episodes: true,
      }
    }
  })

  // Save table density to localStorage
  useEffect(() => {
    try {
      localStorage.setItem('podcast-database-density', tableDensity)
    } catch (error) {
      console.error('Failed to save table density:', error)
    }
  }, [tableDensity])

  // Save column visibility to localStorage
  useEffect(() => {
    try {
      localStorage.setItem('podcast-database-columns', JSON.stringify(columnVisibility))
    } catch (error) {
      console.error('Failed to save column visibility:', error)
    }
  }, [columnVisibility])

  // Search & Filter State (initialized from URL params)
  const [searchQuery, setSearchQuery] = useState(searchParams.get('search') || '')
  const [debouncedSearchQuery, setDebouncedSearchQuery] = useState(searchParams.get('search') || '')
  const [categoryFilter, setCategoryFilter] = useState<string[]>(() => {
    const categories = searchParams.get('categories')
    return categories ? categories.split(',') : []
  })
  const [sortBy, setSortBy] = useState<SortOption>((searchParams.get('sortBy') as SortOption) || 'name')
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>((searchParams.get('sortOrder') as 'asc' | 'desc') || 'asc')
  const [page, setPage] = useState(() => {
    const pageParam = parseInt(searchParams.get('page') || '1')
    return isNaN(pageParam) || pageParam < 1 ? 1 : pageParam
  })

  // Basic Filters
  const [minAudience, setMinAudience] = useState(searchParams.get('minAudience') || '')
  const [maxAudience, setMaxAudience] = useState(searchParams.get('maxAudience') || '')
  const [minRating, setMinRating] = useState(searchParams.get('minRating') || '')
  const [maxRating, setMaxRating] = useState(searchParams.get('maxRating') || '')
  const [hasEmailFilter, setHasEmailFilter] = useState(searchParams.get('hasEmail') === 'true')

  // Advanced Filters
  const [languageFilter, setLanguageFilter] = useState(searchParams.get('language') || 'all')
  const [regionFilter, setRegionFilter] = useState(searchParams.get('region') || 'all')
  const [minEpisodes, setMinEpisodes] = useState(searchParams.get('minEpisodes') || '')
  const [maxEpisodes, setMaxEpisodes] = useState(searchParams.get('maxEpisodes') || '')
  const [hasGuestsFilter, setHasGuestsFilter] = useState(searchParams.get('hasGuests') === 'true')
  const [hasSponsorsFilter, setHasSponsorsFilter] = useState(searchParams.get('hasSponsors') === 'true')
  const [isActiveFilter, setIsActiveFilter] = useState(searchParams.get('isActive') === 'true')
  const [showAdvancedFilters, setShowAdvancedFilters] = useState(false)

  // Client Mode State
  const [selectedClient, setSelectedClient] = useState('')

  // Prospect Mode State
  const [prospectMode, setProspectMode] = useState<'new' | 'existing'>('new')
  const [selectedProspectId, setSelectedProspectId] = useState('')
  const [prospectName, setProspectName] = useState('')
  const [prospectBio, setProspectBio] = useState('')
  const [prospectImageUrl, setProspectImageUrl] = useState('')
  const [existingProspects, setExistingProspects] = useState<ExistingProspect[]>([])

  // Selection & Scoring State
  const [selectedPodcasts, setSelectedPodcasts] = useState<Set<string>>(new Set())
  const [isScoring, setIsScoring] = useState(false)
  const [scores, setScores] = useState<Record<string, number | null>>({})
  const [reasonings, setReasonings] = useState<Record<string, string | undefined>>({})
  const [minScoreFilter, setMinScoreFilter] = useState<number>(0)

  // Export State
  const [isExporting, setIsExporting] = useState(false)

  // Saved Filter Presets State
  const [savedPresets, setSavedPresets] = useState<FilterPreset[]>(() => {
    try {
      const stored = localStorage.getItem(PRESETS_STORAGE_KEY)
      return stored ? JSON.parse(stored) : []
    } catch (error) {
      console.error('Failed to load filter presets:', error)
      return []
    }
  })
  const [showSavePresetDialog, setShowSavePresetDialog] = useState(false)
  const [presetName, setPresetName] = useState('')

  // Save presets to localStorage whenever they change
  useEffect(() => {
    try {
      localStorage.setItem(PRESETS_STORAGE_KEY, JSON.stringify(savedPresets))
    } catch (error) {
      console.error('Failed to save filter presets:', error)
      // Could show toast notification here if needed
    }
  }, [savedPresets])

  // Preset management functions
  const saveCurrentFiltersAsPreset = () => {
    if (!presetName.trim()) {
      toast.error('Please enter a preset name')
      return
    }

    const newPreset: FilterPreset = {
      id: Date.now().toString(),
      name: presetName.trim(),
      filters: {
        searchQuery,
        categoryFilter,
        minAudience,
        maxAudience,
        minRating,
        maxRating,
        hasEmailFilter,
        languageFilter,
        regionFilter,
        minEpisodes,
        maxEpisodes,
        hasGuestsFilter,
        hasSponsorsFilter,
        isActiveFilter,
      }
    }

    setSavedPresets(prev => [...prev, newPreset])
    setPresetName('')
    setShowSavePresetDialog(false)
    toast.success(`Filter preset "${newPreset.name}" saved!`)
  }

  const loadPreset = (preset: FilterPreset) => {
    setSearchQuery(preset.filters.searchQuery)
    // Handle both old (string) and new (array) format for categoryFilter
    if (Array.isArray(preset.filters.categoryFilter)) {
      setCategoryFilter(preset.filters.categoryFilter)
    } else if (preset.filters.categoryFilter && preset.filters.categoryFilter !== 'all') {
      setCategoryFilter([preset.filters.categoryFilter])
    } else {
      setCategoryFilter([])
    }
    setMinAudience(preset.filters.minAudience)
    setMaxAudience(preset.filters.maxAudience)
    setMinRating(preset.filters.minRating)
    setMaxRating(preset.filters.maxRating)
    setHasEmailFilter(preset.filters.hasEmailFilter)
    setLanguageFilter(preset.filters.languageFilter)
    setRegionFilter(preset.filters.regionFilter)
    setMinEpisodes(preset.filters.minEpisodes)
    setMaxEpisodes(preset.filters.maxEpisodes)
    setHasGuestsFilter(preset.filters.hasGuestsFilter)
    setHasSponsorsFilter(preset.filters.hasSponsorsFilter)
    setIsActiveFilter(preset.filters.isActiveFilter)
    setPage(1)
    toast.success(`Loaded preset "${preset.name}"`)
  }

  const deletePreset = (presetId: string) => {
    setSavedPresets(prev => prev.filter(p => p.id !== presetId))
    toast.success('Preset deleted')
  }

  // Fetch clients
  const { data: clientsData } = useQuery({
    queryKey: ['clients'],
    queryFn: () => getClients()
  })
  const clients = clientsData?.clients || []
  const selectedClientData = clients.find(c => c.id === selectedClient)

  // Fetch existing prospects
  useEffect(() => {
    const fetchProspects = async () => {
      try {
        const { data, error } = await supabase
          .from('prospect_dashboards')
          .select('id, prospect_name, prospect_bio, prospect_image_url, spreadsheet_url, slug')
          .eq('is_active', true)
          .order('created_at', { ascending: false })

        if (error) throw error
        setExistingProspects(data || [])
      } catch (error) {
        console.error('Failed to fetch prospects:', error)
      }
    }
    fetchProspects()
  }, [])

  // Debounce search query
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearchQuery(searchQuery)
    }, 300)

    return () => clearTimeout(timer)
  }, [searchQuery])

  // Sync filters to URL parameters
  useEffect(() => {
    const params = new URLSearchParams()

    // Only add non-default values to keep URL clean
    if (searchQuery) params.set('search', searchQuery)
    if (categoryFilter.length > 0) params.set('categories', categoryFilter.join(','))
    if (sortBy !== 'name') params.set('sortBy', sortBy)
    if (sortOrder !== 'asc') params.set('sortOrder', sortOrder)
    if (page !== 1) params.set('page', page.toString())
    if (minAudience) params.set('minAudience', minAudience)
    if (maxAudience) params.set('maxAudience', maxAudience)
    if (minRating) params.set('minRating', minRating)
    if (maxRating) params.set('maxRating', maxRating)
    if (hasEmailFilter) params.set('hasEmail', 'true')
    if (languageFilter !== 'all') params.set('language', languageFilter)
    if (regionFilter !== 'all') params.set('region', regionFilter)
    if (minEpisodes) params.set('minEpisodes', minEpisodes)
    if (maxEpisodes) params.set('maxEpisodes', maxEpisodes)
    if (hasGuestsFilter) params.set('hasGuests', 'true')
    if (hasSponsorsFilter) params.set('hasSponsors', 'true')
    if (isActiveFilter) params.set('isActive', 'true')

    setSearchParams(params, { replace: true })
  }, [
    searchQuery, categoryFilter, sortBy, sortOrder, page,
    minAudience, maxAudience, minRating, maxRating, hasEmailFilter,
    languageFilter, regionFilter, minEpisodes, maxEpisodes,
    hasGuestsFilter, hasSponsorsFilter, isActiveFilter, setSearchParams
  ])

  // Build filters
  const filters: PodcastFilters = useMemo(() => {
    const f: PodcastFilters = {}

    if (debouncedSearchQuery.trim()) {
      f.search = debouncedSearchQuery.trim()
    }

    if (categoryFilter.length > 0) {
      f.categories = categoryFilter
    }

    if (minAudience && !isNaN(Number(minAudience))) {
      f.minAudience = Number(minAudience)
    }

    if (maxAudience && !isNaN(Number(maxAudience))) {
      f.maxAudience = Number(maxAudience)
    }

    if (minRating && !isNaN(Number(minRating))) {
      f.minRating = Number(minRating)
    }

    if (maxRating && !isNaN(Number(maxRating))) {
      f.maxRating = Number(maxRating)
    }

    if (hasEmailFilter) {
      f.hasEmail = true
    }

    if (languageFilter && languageFilter !== 'all') {
      f.language = languageFilter
    }

    if (regionFilter && regionFilter !== 'all') {
      f.region = regionFilter
    }

    if (hasGuestsFilter) {
      f.hasGuests = true
    }

    if (hasSponsorsFilter) {
      f.hasSponsors = true
    }

    if (isActiveFilter) {
      f.isActive = true
    }

    if (minEpisodes && !isNaN(Number(minEpisodes))) {
      f.minEpisodes = Number(minEpisodes)
    }

    if (maxEpisodes && !isNaN(Number(maxEpisodes))) {
      f.maxEpisodes = Number(maxEpisodes)
    }

    return f
  }, [debouncedSearchQuery, categoryFilter, minAudience, maxAudience, minRating, maxRating, hasEmailFilter, languageFilter, regionFilter, minEpisodes, maxEpisodes, hasGuestsFilter, hasSponsorsFilter, isActiveFilter])

  // Fetch podcasts
  const { data: podcastsResult, isLoading, refetch } = useQuery({
    queryKey: ['podcast-database', filters, sortBy, sortOrder, page],
    queryFn: () => getPodcasts({
      filters,
      sortBy,
      sortOrder,
      page,
      pageSize: 20
    })
  })

  // Fetch statistics
  const { data: stats } = useQuery({
    queryKey: ['podcast-stats'],
    queryFn: getPodcastStatistics,
    refetchInterval: 60000
  })

  // Fetch categories
  const { data: categoriesData } = useQuery({
    queryKey: ['podcast-categories'],
    queryFn: getPodcastCategories
  })
  const categories = categoriesData?.categories || []

  // Fetch languages
  const { data: languagesData } = useQuery({
    queryKey: ['podcast-languages'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('podcasts')
        .select('language')
        .not('language', 'is', null)

      if (error) return { languages: [] }

      const languageSet = new Set<string>()
      data?.forEach(row => {
        if (row.language) languageSet.add(row.language)
      })

      return { languages: Array.from(languageSet).sort() }
    }
  })
  const languages = languagesData?.languages || []

  // Fetch regions
  const { data: regionsData } = useQuery({
    queryKey: ['podcast-regions'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('podcasts')
        .select('region')
        .not('region', 'is', null)

      if (error) return { regions: [] }

      const regionSet = new Set<string>()
      data?.forEach(row => {
        if (row.region) regionSet.add(row.region)
      })

      return { regions: Array.from(regionSet).sort() }
    }
  })
  const regions = regionsData?.regions || []

  const podcasts = podcastsResult?.data || []
  const totalCount = podcastsResult?.count || 0
  const totalPages = Math.ceil(totalCount / 20)

  // Computed values
  const isClientMode = mode === 'client'
  const isProspectMode = mode === 'prospect'
  const isMatchMode = isClientMode || isProspectMode
  const isNewProspectMode = isProspectMode && prospectMode === 'new'
  const isExistingProspectMode = isProspectMode && prospectMode === 'existing'
  const selectedProspect = existingProspects.find(p => p.id === selectedProspectId)
  const existingProspectHasSheet = selectedProspect?.spreadsheet_url ? true : false

  const bioToUse = isProspectMode
    ? (isNewProspectMode ? prospectBio : selectedProspect?.prospect_bio || '')
    : selectedClientData?.bio || ''

  // Selection state calculations
  const visiblePodcastIds = podcasts.map(p => p.id)
  const allVisibleSelected = visiblePodcastIds.length > 0 && visiblePodcastIds.every(id => selectedPodcasts.has(id))
  const someVisibleSelected = visiblePodcastIds.some(id => selectedPodcasts.has(id)) && !allVisibleSelected

  // Handle select/deselect all visible podcasts
  const handleSelectAllVisible = (checked: boolean) => {
    setSelectedPodcasts(prev => {
      const next = new Set(prev)
      if (checked) {
        visiblePodcastIds.forEach(id => next.add(id))
      } else {
        visiblePodcastIds.forEach(id => next.delete(id))
      }
      return next
    })
  }

  // Handle column header sorting
  const handleSort = (column: SortOption) => {
    if (sortBy === column) {
      // Toggle sort order if same column
      setSortOrder(prev => prev === 'asc' ? 'desc' : 'asc')
    } else {
      // Set new column with ascending order
      setSortBy(column)
      setSortOrder('asc')
    }
    setPage(1) // Reset to first page
  }

  // Render sort indicator
  const SortIndicator = ({ column }: { column: SortOption }) => {
    if (sortBy !== column) {
      return <ArrowUpDown className="h-3 w-3 ml-1 opacity-30" />
    }
    return sortOrder === 'asc'
      ? <ArrowUp className="h-3 w-3 ml-1" />
      : <ArrowDown className="h-3 w-3 ml-1" />
  }

  // Get density class for table cells
  const getDensityClass = () => {
    switch (tableDensity) {
      case 'compact':
        return 'py-2'
      case 'spacious':
        return 'py-4'
      default: // comfortable
        return 'py-3'
    }
  }

  // Toggle column visibility
  const toggleColumn = (column: keyof ColumnVisibility) => {
    setColumnVisibility(prev => ({
      ...prev,
      [column]: !prev[column]
    }))
  }

  // Handle select all matching filters
  const handleSelectAllMatching = async () => {
    if (totalCount > 500) {
      const confirm = window.confirm(
        `This will select all ${totalCount.toLocaleString()} podcasts matching your filters. This may take a moment. Continue?`
      )
      if (!confirm) return
    }

    try {
      // Build query with same logic as getPodcasts service
      let query = supabase
        .from('podcasts')
        .select('id')

      // Apply all filters (same logic as in podcastDatabase.ts)
      if (filters.search) {
        query = query.or(`podcast_name.ilike.%${filters.search}%,host_name.ilike.%${filters.search}%,publisher_name.ilike.%${filters.search}%,podcast_description.ilike.%${filters.search}%`)
      }

      if (filters.categories && filters.categories.length > 0) {
        const orConditions = filters.categories.map(cat =>
          `podcast_categories.cs.${JSON.stringify([{ category_name: cat }])}`
        ).join(',')
        query = query.or(orConditions)
      }

      if (filters.minAudience !== undefined) {
        query = query.gte('audience_size', filters.minAudience)
      }

      if (filters.maxAudience !== undefined) {
        query = query.lte('audience_size', filters.maxAudience)
      }

      if (filters.minRating !== undefined) {
        query = query.gte('itunes_rating', filters.minRating)
      }

      if (filters.maxRating !== undefined) {
        query = query.lte('itunes_rating', filters.maxRating)
      }

      if (filters.hasEmail !== undefined && filters.hasEmail) {
        query = query.not('email', 'is', null)
      }

      if (filters.isActive !== undefined) {
        query = query.eq('is_active', filters.isActive)
      }

      if (filters.language) {
        query = query.eq('language', filters.language)
      }

      if (filters.region) {
        query = query.eq('region', filters.region)
      }

      if (filters.hasGuests !== undefined) {
        query = query.eq('podcast_has_guests', filters.hasGuests)
      }

      if (filters.hasSponsors !== undefined) {
        query = query.eq('podcast_has_sponsors', filters.hasSponsors)
      }

      if (filters.minEpisodes !== undefined) {
        query = query.gte('episode_count', filters.minEpisodes)
      }

      if (filters.maxEpisodes !== undefined) {
        query = query.lte('episode_count', filters.maxEpisodes)
      }

      const { data, error } = await query

      if (error) throw error

      if (data) {
        const allIds = data.map((p: { id: string }) => p.id)
        setSelectedPodcasts(new Set(allIds))
        toast.success(`Selected ${allIds.length.toLocaleString()} podcasts`)
      }
    } catch (error) {
      console.error('Error selecting all matching:', error)
      toast.error('Failed to select all podcasts')
    }
  }

  // Filter by score
  const displayPodcasts = useMemo(() => {
    if (minScoreFilter === 0) return podcasts

    return podcasts.filter(p => {
      const score = scores[p.id]
      return score !== null && score !== undefined && score >= minScoreFilter
    })
  }, [podcasts, scores, minScoreFilter])

  // Handle scoring
  const handleScoreSelected = async () => {
    if (!bioToUse || bioToUse.trim().length === 0) {
      toast.error(
        isProspectMode
          ? 'Prospect bio is required for compatibility scoring'
          : 'Client bio is required for compatibility scoring'
      )
      return
    }

    if (selectedPodcasts.size === 0) {
      toast.error('Please select at least one podcast to score')
      return
    }

    setIsScoring(true)

    try {
      // Get selected podcasts
      const podcastsToScore = podcasts.filter(p => selectedPodcasts.has(p.id))

      // Map to scoring format
      const podcastsForScoring: PodcastForScoring[] = podcastsToScore.map(p => ({
        podcast_id: p.podscan_id,
        podcast_name: p.podcast_name,
        podcast_description: p.podcast_description || undefined,
        publisher_name: p.publisher_name || undefined,
        podcast_categories: Array.isArray(p.podcast_categories)
          ? p.podcast_categories.map((c: any) => ({ category_name: c.category_name || c }))
          : undefined,
        audience_size: p.audience_size || undefined,
        episode_count: p.episode_count || undefined,
      }))

      // Score them
      const scoreResults = await scoreCompatibilityBatch(
        bioToUse,
        podcastsForScoring,
        10,
        (completed, total) => {
          console.log(`Scoring progress: ${completed}/${total}`)
        },
        isProspectMode
      )

      // Build maps
      const scoreMap: Record<string, number | null> = {}
      const reasoningMap: Record<string, string | undefined> = {}

      scoreResults.forEach(s => {
        const podcast = podcastsToScore.find(p => p.podscan_id === s.podcast_id)
        if (podcast) {
          scoreMap[podcast.id] = s.score
          reasoningMap[podcast.id] = s.reasoning
        }
      })

      setScores(prev => ({ ...prev, ...scoreMap }))
      setReasonings(prev => ({ ...prev, ...reasoningMap }))

      // Stats
      const validScores = scoreResults.filter(s => s.score !== null).map(s => s.score!)
      const avgScore = validScores.length > 0
        ? validScores.reduce((sum, score) => sum + score, 0) / validScores.length
        : 0
      const highScoreCount = validScores.filter(s => s >= 8).length

      toast.success(
        `✅ Scored ${scoreResults.length} podcasts! Average: ${avgScore.toFixed(1)}/10 • ${highScoreCount} highly compatible (8+)`
      )
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to score podcasts')
      console.error(error)
    } finally {
      setIsScoring(false)
    }
  }

  // Handle score all visible
  const handleScoreAllVisible = async () => {
    if (displayPodcasts.length === 0) {
      toast.error('No podcasts to score')
      return
    }

    // Select all visible
    const allIds = new Set(displayPodcasts.map(p => p.id))
    setSelectedPodcasts(allIds)

    // Wait a tick for state to update, then score
    setTimeout(() => {
      handleScoreSelected()
    }, 100)
  }

  // Handle export to client sheet
  const handleExportToClientSheet = async () => {
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

      podcasts.forEach(podcast => {
        if (selectedPodcasts.has(podcast.id)) {
          podcastsToExport.push({
            podcast_id: podcast.podscan_id,
            podscan_podcast_id: podcast.podscan_id,
            podcast_name: podcast.podcast_name,
            podcast_description: podcast.podcast_description,
            podcast_image_url: podcast.podcast_image_url,
            podcast_url: podcast.podcast_url,
            publisher_name: podcast.publisher_name,
            episode_count: podcast.episode_count,
            itunes_rating: podcast.itunes_rating,
            audience_size: podcast.audience_size,
            language: podcast.language,
            region: podcast.region,
            podcast_email: podcast.podscan_email,
            rss_feed: podcast.rss_url,
            podcast_categories: podcast.podcast_categories,
            compatibility_score: scores[podcast.id],
            compatibility_reasoning: reasonings[podcast.id],
          })
        }
      })

      const result = await exportPodcastsToGoogleSheets(selectedClient, podcastsToExport)

      toast.success(`✅ Exported ${result.rowsAdded} podcasts to client's sheet!`)

      if (result.cacheSaved) {
        toast.success(`💾 ${result.cacheSaved} podcasts saved to cache!`)
      }

      setSelectedPodcasts(new Set())
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to export')
    } finally {
      setIsExporting(false)
    }
  }

  // Handle export to prospect sheet
  const handleExportToProspectSheet = async () => {
    if (isNewProspectMode) {
      if (!prospectName.trim()) {
        toast.error('Please enter a prospect name')
        return
      }
      if (!prospectBio.trim()) {
        toast.error('Please enter prospect bio')
        return
      }
    }

    if (selectedPodcasts.size === 0) {
      toast.error('Please select at least one podcast to export')
      return
    }

    setIsExporting(true)

    try {
      const podcastsToExport: PodcastExportData[] = []

      podcasts.forEach(podcast => {
        if (selectedPodcasts.has(podcast.id)) {
          podcastsToExport.push({
            podcast_id: podcast.podscan_id,
            podscan_podcast_id: podcast.podscan_id,
            podcast_name: podcast.podcast_name,
            podcast_description: podcast.podcast_description,
            podcast_image_url: podcast.podcast_image_url,
            podcast_url: podcast.podcast_url,
            publisher_name: podcast.publisher_name,
            episode_count: podcast.episode_count,
            itunes_rating: podcast.itunes_rating,
            audience_size: podcast.audience_size,
            language: podcast.language,
            region: podcast.region,
            podcast_email: podcast.podscan_email,
            rss_feed: podcast.rss_url,
            podcast_categories: podcast.podcast_categories,
            compatibility_score: scores[podcast.id],
            compatibility_reasoning: reasonings[podcast.id],
          })
        }
      })

      if (isExistingProspectMode && selectedProspectId && existingProspectHasSheet) {
        // Append to existing
        const result = await appendToProspectSheet(selectedProspectId, podcastsToExport)
        toast.success(`✅ Added ${result.rowsAdded} podcasts to ${selectedProspect?.prospect_name}'s sheet!`)

      } else if (isExistingProspectMode && selectedProspectId && !existingProspectHasSheet) {
        // Create sheet for existing prospect
        const result = await createProspectSheet(
          selectedProspect!.prospect_name,
          selectedProspect!.prospect_bio || '',
          podcastsToExport,
          selectedProspect!.prospect_image_url || undefined
        )

        await supabase
          .from('prospect_dashboards')
          .update({
            spreadsheet_id: result.spreadsheetId,
            spreadsheet_url: result.spreadsheetUrl
          })
          .eq('id', selectedProspectId)

        toast.success(`✅ Created sheet for ${selectedProspect?.prospect_name}!`)

      } else if (isNewProspectMode) {
        // Create new prospect
        const result = await createProspectSheet(
          prospectName.trim(),
          prospectBio.trim(),
          podcastsToExport,
          prospectImageUrl.trim() || undefined
        )

        toast.success(`✅ Created dashboard for ${prospectName}!`)
        toast.success(`🔗 ${result.dashboardUrl}`)
      }

      setSelectedPodcasts(new Set())
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to export')
    } finally {
      setIsExporting(false)
    }
  }

  // Handle CSV export
  const handleCSVExport = async (selectedOnly: boolean = false) => {
    try {
      let podcastsToExport: PodcastDatabaseItem[]

      if (selectedOnly) {
        // Export only selected podcasts
        podcastsToExport = podcasts.filter(p => selectedPodcasts.has(p.id))
      } else {
        // Export all visible (filtered) podcasts
        podcastsToExport = displayPodcasts
      }

      if (podcastsToExport.length === 0) {
        toast.error('No podcasts to export')
        return
      }

      await exportPodcastsToCSV(podcastsToExport)
      toast.success(`✅ Exported ${podcastsToExport.length} podcasts to CSV`)
    } catch (error) {
      toast.error('Failed to export CSV')
    }
  }

  // Calculate average score for selected
  const calculateAverageScore = () => {
    const selectedScores = Array.from(selectedPodcasts)
      .map(id => scores[id])
      .filter(s => s !== null && s !== undefined) as number[]

    if (selectedScores.length === 0) return 0

    return selectedScores.reduce((sum, s) => sum + s, 0) / selectedScores.length
  }

  return (
    <DashboardLayout>
      <div className="space-y-6">
        {/* Header */}
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Podcast Database</h1>
          <p className="text-muted-foreground">
            Browse, search, and manage your centralized podcast inventory
          </p>
        </div>

        {/* Mode Selector */}
        <div className="flex gap-2">
          <Button
            variant={mode === 'browse' ? 'default' : 'outline'}
            onClick={() => setMode('browse')}
            className="flex items-center gap-2"
          >
            <Database className="h-4 w-4" />
            Browse
          </Button>
          <Button
            variant={mode === 'client' ? 'default' : 'outline'}
            onClick={() => setMode('client')}
            className="flex items-center gap-2"
          >
            <UsersIcon className="h-4 w-4" />
            Match for Client
          </Button>
          <Button
            variant={mode === 'prospect' ? 'default' : 'outline'}
            onClick={() => setMode('prospect')}
            className="flex items-center gap-2"
          >
            <Target className="h-4 w-4" />
            Match for Prospect
          </Button>
        </div>

        {/* Stats Cards */}
        <div className="grid gap-4 md:grid-cols-4">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Total Podcasts</CardTitle>
              <Database className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{stats?.total_podcasts?.toLocaleString() || 0}</div>
              <p className="text-xs text-muted-foreground">In your database</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Total Reach</CardTitle>
              <TrendingUp className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">
                {stats?.total_podcasts ? (stats.avg_audience_size * stats.total_podcasts / 1000000).toFixed(1) : 0}M
              </div>
              <p className="text-xs text-muted-foreground">Combined audience</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Cache Hits</CardTitle>
              <CheckCircle2 className="h-4 w-4 text-green-600" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{stats?.total_cache_hits?.toLocaleString() || 0}</div>
              <p className="text-xs text-muted-foreground">API calls saved</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Cost Savings</CardTitle>
              <Star className="h-4 w-4 text-yellow-600" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-green-600">
                ${((stats?.estimated_api_calls_saved || 0) * 0.01).toFixed(2)}
              </div>
              <p className="text-xs text-muted-foreground">Total saved</p>
            </CardContent>
          </Card>
        </div>

        {/* Client Selector */}
        {isClientMode && (
          <Card>
            <CardHeader>
              <CardTitle>Select Client</CardTitle>
              <CardDescription>Choose a client to match podcasts for</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <Select value={selectedClient} onValueChange={setSelectedClient}>
                <SelectTrigger>
                  <SelectValue placeholder="Choose a client..." />
                </SelectTrigger>
                <SelectContent>
                  {clients.map(client => (
                    <SelectItem key={client.id} value={client.id}>
                      {client.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {selectedClientData?.bio && (
                <div className="p-3 bg-muted rounded-md">
                  <p className="text-sm font-medium mb-1">Client Bio:</p>
                  <p className="text-sm text-muted-foreground">
                    {selectedClientData.bio}
                  </p>
                </div>
              )}
            </CardContent>
          </Card>
        )}

        {/* Prospect Form */}
        {isProspectMode && (
          <Card>
            <CardHeader>
              <CardTitle>Prospect Details</CardTitle>
              <CardDescription>Create new or select existing prospect</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex gap-2">
                <Button
                  variant={prospectMode === 'new' ? 'default' : 'outline'}
                  onClick={() => setProspectMode('new')}
                  className="flex-1"
                >
                  New Prospect
                </Button>
                <Button
                  variant={prospectMode === 'existing' ? 'default' : 'outline'}
                  onClick={() => setProspectMode('existing')}
                  className="flex-1"
                >
                  Existing Prospect
                </Button>
              </div>

              {prospectMode === 'existing' ? (
                <>
                  <Select value={selectedProspectId} onValueChange={setSelectedProspectId}>
                    <SelectTrigger>
                      <SelectValue placeholder="Choose a prospect..." />
                    </SelectTrigger>
                    <SelectContent>
                      {existingProspects.map(prospect => (
                        <SelectItem key={prospect.id} value={prospect.id}>
                          {prospect.prospect_name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {selectedProspect?.prospect_bio && (
                    <div className="p-3 bg-muted rounded-md">
                      <p className="text-sm font-medium mb-1">Prospect Bio:</p>
                      <p className="text-sm text-muted-foreground">
                        {selectedProspect.prospect_bio}
                      </p>
                    </div>
                  )}
                </>
              ) : (
                <>
                  <div>
                    <Label>Prospect Name</Label>
                    <Input
                      value={prospectName}
                      onChange={(e) => setProspectName(e.target.value)}
                      placeholder="Sarah Johnson"
                    />
                  </div>
                  <div>
                    <Label>Prospect Bio</Label>
                    <Textarea
                      value={prospectBio}
                      onChange={(e) => setProspectBio(e.target.value)}
                      placeholder="Brief background about the prospect..."
                      rows={4}
                    />
                  </div>
                  <div>
                    <Label>Profile Image URL (optional)</Label>
                    <Input
                      value={prospectImageUrl}
                      onChange={(e) => setProspectImageUrl(e.target.value)}
                      placeholder="https://..."
                    />
                  </div>
                </>
              )}
            </CardContent>
          </Card>
        )}

        {/* Search & Actions */}
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle>Search & Filter</CardTitle>
                <CardDescription className="flex items-center gap-2">
                  <span className="font-semibold text-primary">
                    {totalCount.toLocaleString()} podcasts
                  </span>
                  {(searchQuery || categoryFilter.length > 0 || minAudience || maxAudience || minRating || maxRating || hasEmailFilter || languageFilter !== 'all' || regionFilter !== 'all' || minEpisodes || maxEpisodes || hasGuestsFilter || hasSponsorsFilter || isActiveFilter) && (
                    <span className="text-xs text-muted-foreground">
                      match your filters
                    </span>
                  )}
                  <span className="text-muted-foreground">•</span>
                  <span>Page {page} of {totalPages}</span>
                </CardDescription>
              </div>
              <div className="flex gap-2">
                {isMatchMode && bioToUse && (
                  <>
                    <Button
                      onClick={handleScoreSelected}
                      disabled={isScoring || selectedPodcasts.size === 0}
                      variant="secondary"
                      size="sm"
                    >
                      {isScoring ? (
                        <>
                          <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                          Scoring...
                        </>
                      ) : (
                        <>
                          <Star className="h-4 w-4 mr-2" />
                          Score Selected ({selectedPodcasts.size})
                        </>
                      )}
                    </Button>
                    <Button
                      onClick={handleScoreAllVisible}
                      disabled={isScoring || displayPodcasts.length === 0}
                      variant="outline"
                      size="sm"
                    >
                      {isScoring ? (
                        <>
                          <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                          Scoring...
                        </>
                      ) : (
                        <>
                          <Star className="h-4 w-4 mr-2" />
                          Score All Visible
                        </>
                      )}
                    </Button>
                  </>
                )}
                {isMatchMode && totalCount > visiblePodcastIds.length && (
                  <Button
                    onClick={handleSelectAllMatching}
                    variant="outline"
                    size="sm"
                  >
                    <CheckCircle2 className="h-4 w-4 mr-2" />
                    Select All {totalCount.toLocaleString()}
                  </Button>
                )}
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="outline" size="sm">
                      <Download className="h-4 w-4 mr-2" />
                      CSV
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuItem onClick={() => handleCSVExport(false)}>
                      Export All Visible ({displayPodcasts.length})
                    </DropdownMenuItem>
                    {isMatchMode && selectedPodcasts.size > 0 && (
                      <DropdownMenuItem onClick={() => handleCSVExport(true)}>
                        Export Selected ({selectedPodcasts.size})
                      </DropdownMenuItem>
                    )}
                  </DropdownMenuContent>
                </DropdownMenu>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="outline" size="sm">
                      <LayoutList className="h-4 w-4 mr-2" />
                      Density
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuItem onClick={() => setTableDensity('compact')}>
                      {tableDensity === 'compact' && '✓ '}Compact
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => setTableDensity('comfortable')}>
                      {tableDensity === 'comfortable' && '✓ '}Comfortable
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => setTableDensity('spacious')}>
                      {tableDensity === 'spacious' && '✓ '}Spacious
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="outline" size="sm">
                      <Columns3 className="h-4 w-4 mr-2" />
                      Columns
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuItem onClick={() => toggleColumn('host')}>
                      {columnVisibility.host && '✓ '}Host
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => toggleColumn('audience')}>
                      {columnVisibility.audience && '✓ '}Audience
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => toggleColumn('rating')}>
                      {columnVisibility.rating && '✓ '}Rating
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => toggleColumn('episodes')}>
                      {columnVisibility.episodes && '✓ '}Episodes
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* Active Filters Pills */}
            {(searchQuery || categoryFilter.length > 0 || minAudience || maxAudience || minRating || maxRating || hasEmailFilter || languageFilter !== 'all' || regionFilter !== 'all' || minEpisodes || maxEpisodes || hasGuestsFilter || hasSponsorsFilter || isActiveFilter) && (
              <div className="flex items-center gap-2 flex-wrap p-3 bg-muted/50 rounded-md">
                <span className="text-sm font-medium text-muted-foreground">Active Filters:</span>
                {searchQuery && (
                  <Badge variant="secondary" className="gap-1">
                    Search: {searchQuery}
                    <button onClick={() => setSearchQuery('')} className="ml-1 hover:bg-background/20 rounded-full p-0.5">
                      <XCircle className="h-3 w-3" />
                    </button>
                  </Badge>
                )}
                {categoryFilter.length > 0 && categoryFilter.map(cat => (
                  <Badge key={cat} variant="secondary" className="gap-1">
                    Category: {cat}
                    <button onClick={() => setCategoryFilter(prev => prev.filter(c => c !== cat))} className="ml-1 hover:bg-background/20 rounded-full p-0.5">
                      <XCircle className="h-3 w-3" />
                    </button>
                  </Badge>
                ))}
                {minAudience && (
                  <Badge variant="secondary" className="gap-1">
                    Min Audience: {Number(minAudience).toLocaleString()}
                    <button onClick={() => setMinAudience('')} className="ml-1 hover:bg-background/20 rounded-full p-0.5">
                      <XCircle className="h-3 w-3" />
                    </button>
                  </Badge>
                )}
                {maxAudience && (
                  <Badge variant="secondary" className="gap-1">
                    Max Audience: {Number(maxAudience).toLocaleString()}
                    <button onClick={() => setMaxAudience('')} className="ml-1 hover:bg-background/20 rounded-full p-0.5">
                      <XCircle className="h-3 w-3" />
                    </button>
                  </Badge>
                )}
                {minRating && (
                  <Badge variant="secondary" className="gap-1">
                    Min Rating: {minRating}★
                    <button onClick={() => setMinRating('')} className="ml-1 hover:bg-background/20 rounded-full p-0.5">
                      <XCircle className="h-3 w-3" />
                    </button>
                  </Badge>
                )}
                {maxRating && (
                  <Badge variant="secondary" className="gap-1">
                    Max Rating: {maxRating}★
                    <button onClick={() => setMaxRating('')} className="ml-1 hover:bg-background/20 rounded-full p-0.5">
                      <XCircle className="h-3 w-3" />
                    </button>
                  </Badge>
                )}
                {hasEmailFilter && (
                  <Badge variant="secondary" className="gap-1">
                    Has Email
                    <button onClick={() => setHasEmailFilter(false)} className="ml-1 hover:bg-background/20 rounded-full p-0.5">
                      <XCircle className="h-3 w-3" />
                    </button>
                  </Badge>
                )}
                {languageFilter !== 'all' && (
                  <Badge variant="secondary" className="gap-1">
                    Language: {languageFilter}
                    <button onClick={() => setLanguageFilter('all')} className="ml-1 hover:bg-background/20 rounded-full p-0.5">
                      <XCircle className="h-3 w-3" />
                    </button>
                  </Badge>
                )}
                {regionFilter !== 'all' && (
                  <Badge variant="secondary" className="gap-1">
                    Region: {regionFilter}
                    <button onClick={() => setRegionFilter('all')} className="ml-1 hover:bg-background/20 rounded-full p-0.5">
                      <XCircle className="h-3 w-3" />
                    </button>
                  </Badge>
                )}
                {minEpisodes && (
                  <Badge variant="secondary" className="gap-1">
                    Min Episodes: {minEpisodes}
                    <button onClick={() => setMinEpisodes('')} className="ml-1 hover:bg-background/20 rounded-full p-0.5">
                      <XCircle className="h-3 w-3" />
                    </button>
                  </Badge>
                )}
                {maxEpisodes && (
                  <Badge variant="secondary" className="gap-1">
                    Max Episodes: {maxEpisodes}
                    <button onClick={() => setMaxEpisodes('')} className="ml-1 hover:bg-background/20 rounded-full p-0.5">
                      <XCircle className="h-3 w-3" />
                    </button>
                  </Badge>
                )}
                {hasGuestsFilter && (
                  <Badge variant="secondary" className="gap-1">
                    Has Guests
                    <button onClick={() => setHasGuestsFilter(false)} className="ml-1 hover:bg-background/20 rounded-full p-0.5">
                      <XCircle className="h-3 w-3" />
                    </button>
                  </Badge>
                )}
                {hasSponsorsFilter && (
                  <Badge variant="secondary" className="gap-1">
                    Has Sponsors
                    <button onClick={() => setHasSponsorsFilter(false)} className="ml-1 hover:bg-background/20 rounded-full p-0.5">
                      <XCircle className="h-3 w-3" />
                    </button>
                  </Badge>
                )}
                {isActiveFilter && (
                  <Badge variant="secondary" className="gap-1">
                    Active Only
                    <button onClick={() => setIsActiveFilter(false)} className="ml-1 hover:bg-background/20 rounded-full p-0.5">
                      <XCircle className="h-3 w-3" />
                    </button>
                  </Badge>
                )}
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    setSearchQuery('')
                    setCategoryFilter([])
                    setMinAudience('')
                    setMaxAudience('')
                    setMinRating('')
                    setMaxRating('')
                    setHasEmailFilter(false)
                    setLanguageFilter('all')
                    setRegionFilter('all')
                    setMinEpisodes('')
                    setMaxEpisodes('')
                    setHasGuestsFilter(false)
                    setHasSponsorsFilter(false)
                    setIsActiveFilter(false)
                    setPage(1)
                  }}
                  className="h-6 text-xs"
                >
                  Clear All
                </Button>
              </div>
            )}

            {/* Saved Filter Presets */}
            <div className="flex gap-2 items-center p-3 bg-muted/30 rounded-md">
              <span className="text-sm font-medium whitespace-nowrap">Quick Filters:</span>
              {savedPresets.length > 0 ? (
                <>
                  <Select onValueChange={(presetId) => {
                    const preset = savedPresets.find(p => p.id === presetId)
                    if (preset) loadPreset(preset)
                  }}>
                    <SelectTrigger className="w-[250px]">
                      <SelectValue placeholder="Load saved filter preset..." />
                    </SelectTrigger>
                    <SelectContent>
                      {savedPresets.map(preset => (
                        <SelectItem key={preset.id} value={preset.id}>
                          {preset.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {savedPresets.length > 0 && (
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="sm">
                          Manage Presets
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        {savedPresets.map(preset => (
                          <DropdownMenuItem
                            key={preset.id}
                            className="flex justify-between items-center"
                            onClick={() => deletePreset(preset.id)}
                          >
                            <span>{preset.name}</span>
                            <XCircle className="h-4 w-4 ml-2 text-destructive" />
                          </DropdownMenuItem>
                        ))}
                      </DropdownMenuContent>
                    </DropdownMenu>
                  )}
                </>
              ) : (
                <span className="text-sm text-muted-foreground">No saved presets yet</span>
              )}

              {!showSavePresetDialog ? (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setShowSavePresetDialog(true)}
                  className="ml-auto"
                >
                  Save Current Filters
                </Button>
              ) : (
                <div className="flex gap-2 ml-auto">
                  <Input
                    placeholder="Preset name..."
                    value={presetName}
                    onChange={(e) => setPresetName(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') saveCurrentFiltersAsPreset()
                      if (e.key === 'Escape') setShowSavePresetDialog(false)
                    }}
                    className="w-[200px]"
                    autoFocus
                  />
                  <Button size="sm" onClick={saveCurrentFiltersAsPreset}>
                    Save
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => {
                      setShowSavePresetDialog(false)
                      setPresetName('')
                    }}
                  >
                    Cancel
                  </Button>
                </div>
              )}
            </div>

            <div className="flex gap-2">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Search podcasts by name, host, publisher..."
                  value={searchQuery}
                  onChange={(e) => {
                    setSearchQuery(e.target.value)
                    setPage(1)
                  }}
                  className="pl-10"
                />
              </div>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="outline" className="w-[200px] justify-between">
                    {categoryFilter.length === 0
                      ? 'All Categories'
                      : categoryFilter.length === 1
                      ? categoryFilter[0]
                      : `${categoryFilter.length} categories`
                    }
                    <ArrowUpDown className="ml-2 h-4 w-4 opacity-50" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="start" className="w-[200px] max-h-[400px] overflow-y-auto">
                  <DropdownMenuLabel>Select Categories</DropdownMenuLabel>
                  <DropdownMenuSeparator />
                  {categoryFilter.length > 0 && (
                    <>
                      <DropdownMenuItem onClick={() => {
                        setCategoryFilter([])
                        setPage(1)
                      }}>
                        Clear Selection
                      </DropdownMenuItem>
                      <DropdownMenuSeparator />
                    </>
                  )}
                  {categories.map(cat => (
                    <DropdownMenuCheckboxItem
                      key={cat}
                      checked={categoryFilter.includes(cat)}
                      onCheckedChange={(checked) => {
                        if (checked) {
                          setCategoryFilter(prev => [...prev, cat])
                        } else {
                          setCategoryFilter(prev => prev.filter(c => c !== cat))
                        }
                        setPage(1)
                      }}
                    >
                      {cat}
                    </DropdownMenuCheckboxItem>
                  ))}
                </DropdownMenuContent>
              </DropdownMenu>
              <Select value={sortBy} onValueChange={(v) => setSortBy(v as SortOption)}>
                <SelectTrigger className="w-[150px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="name">Name</SelectItem>
                  <SelectItem value="audience">Audience</SelectItem>
                  <SelectItem value="rating">Rating</SelectItem>
                  <SelectItem value="episodes">Episodes</SelectItem>
                  <SelectItem value="dateAdded">Date Added</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="flex gap-2">
              <Input
                placeholder="Min Audience"
                value={minAudience}
                onChange={(e) => setMinAudience(e.target.value)}
                className="w-[150px]"
                type="number"
              />
              <Input
                placeholder="Min Rating"
                value={minRating}
                onChange={(e) => setMinRating(e.target.value)}
                className="w-[150px]"
                type="number"
                step="0.1"
                max="5"
              />
              <div className="flex items-center gap-2">
                <Checkbox
                  id="hasEmail"
                  checked={hasEmailFilter}
                  onCheckedChange={(checked) => setHasEmailFilter(!!checked)}
                />
                <Label htmlFor="hasEmail" className="cursor-pointer">
                  Has Email
                </Label>
              </div>
              {Object.keys(scores).length > 0 && (
                <Select
                  value={minScoreFilter.toString()}
                  onValueChange={(v) => setMinScoreFilter(Number(v))}
                >
                  <SelectTrigger className="w-[180px]">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="0">All Scores</SelectItem>
                    <SelectItem value="5">5+ Only</SelectItem>
                    <SelectItem value="6">6+ Only</SelectItem>
                    <SelectItem value="7">7+ Only (Good)</SelectItem>
                    <SelectItem value="8">8+ Only (Great)</SelectItem>
                    <SelectItem value="9">9+ Only (Excellent)</SelectItem>
                  </SelectContent>
                </Select>
              )}
            </div>

            {/* Advanced Filters */}
            <div className="border-t pt-4">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setShowAdvancedFilters(!showAdvancedFilters)}
                className="mb-3"
              >
                {showAdvancedFilters ? '▼' : '▶'} Advanced Filters
              </Button>

              {showAdvancedFilters && (
                <div className="space-y-3 p-4 bg-muted/30 rounded-md">
                  {/* Row 1: Max Audience & Max Rating */}
                  <div className="flex gap-2">
                    <Input
                      placeholder="Max Audience"
                      value={maxAudience}
                      onChange={(e) => setMaxAudience(e.target.value)}
                      className="w-[150px]"
                      type="number"
                    />
                    <Input
                      placeholder="Max Rating"
                      value={maxRating}
                      onChange={(e) => setMaxRating(e.target.value)}
                      className="w-[150px]"
                      type="number"
                      step="0.1"
                      max="5"
                    />
                  </div>

                  {/* Row 2: Episodes Range */}
                  <div className="flex gap-2">
                    <Input
                      placeholder="Min Episodes"
                      value={minEpisodes}
                      onChange={(e) => setMinEpisodes(e.target.value)}
                      className="w-[150px]"
                      type="number"
                    />
                    <Input
                      placeholder="Max Episodes"
                      value={maxEpisodes}
                      onChange={(e) => setMaxEpisodes(e.target.value)}
                      className="w-[150px]"
                      type="number"
                    />
                  </div>

                  {/* Row 3: Language & Region */}
                  <div className="flex gap-2">
                    <Select
                      value={languageFilter}
                      onValueChange={(v) => {
                        setLanguageFilter(v)
                        setPage(1)
                      }}
                    >
                      <SelectTrigger className="w-[200px]">
                        <SelectValue placeholder="Language" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">All Languages</SelectItem>
                        {languages.map(lang => (
                          <SelectItem key={lang} value={lang}>{lang}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>

                    <Select
                      value={regionFilter}
                      onValueChange={(v) => {
                        setRegionFilter(v)
                        setPage(1)
                      }}
                    >
                      <SelectTrigger className="w-[200px]">
                        <SelectValue placeholder="Region" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">All Regions</SelectItem>
                        {regions.map(region => (
                          <SelectItem key={region} value={region}>{region}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  {/* Row 4: Additional Filters */}
                  <div className="flex gap-4 flex-wrap">
                    <div className="flex items-center gap-2">
                      <Checkbox
                        id="hasGuests"
                        checked={hasGuestsFilter}
                        onCheckedChange={(checked) => setHasGuestsFilter(!!checked)}
                      />
                      <Label htmlFor="hasGuests" className="cursor-pointer">
                        Has Guests
                      </Label>
                    </div>

                    <div className="flex items-center gap-2">
                      <Checkbox
                        id="hasSponsors"
                        checked={hasSponsorsFilter}
                        onCheckedChange={(checked) => setHasSponsorsFilter(!!checked)}
                      />
                      <Label htmlFor="hasSponsors" className="cursor-pointer">
                        Has Sponsors
                      </Label>
                    </div>

                    <div className="flex items-center gap-2">
                      <Checkbox
                        id="isActive"
                        checked={isActiveFilter}
                        onCheckedChange={(checked) => setIsActiveFilter(!!checked)}
                      />
                      <Label htmlFor="isActive" className="cursor-pointer">
                        Active Podcasts Only
                      </Label>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Podcasts Table */}
        <Card>
          <CardContent className="pt-6">
            {isLoading ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
              </div>
            ) : displayPodcasts.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-12 text-center">
                <XCircle className="h-12 w-12 text-muted-foreground mb-4" />
                <h3 className="text-lg font-semibold">No podcasts found</h3>
                <p className="text-sm text-muted-foreground">
                  Try adjusting your search or filters
                </p>
              </div>
            ) : (
              <>
                <Table>
                  <TableHeader>
                    <TableRow>
                      {isMatchMode && (
                        <TableHead className="w-12">
                          <Checkbox
                            checked={allVisibleSelected}
                            indeterminate={someVisibleSelected}
                            onCheckedChange={handleSelectAllVisible}
                            aria-label="Select all on page"
                          />
                        </TableHead>
                      )}
                      <TableHead
                        className="cursor-pointer select-none hover:bg-muted/50"
                        onClick={() => handleSort('name')}
                      >
                        <div className="flex items-center">
                          Podcast
                          <SortIndicator column="name" />
                        </div>
                      </TableHead>
                      {columnVisibility.host && <TableHead>Host</TableHead>}
                      {columnVisibility.audience && (
                        <TableHead
                          className="cursor-pointer select-none hover:bg-muted/50"
                          onClick={() => handleSort('audience')}
                        >
                          <div className="flex items-center">
                            Audience
                            <SortIndicator column="audience" />
                          </div>
                        </TableHead>
                      )}
                      {columnVisibility.rating && (
                        <TableHead
                          className="cursor-pointer select-none hover:bg-muted/50"
                          onClick={() => handleSort('rating')}
                        >
                          <div className="flex items-center">
                            Rating
                            <SortIndicator column="rating" />
                          </div>
                        </TableHead>
                      )}
                      {columnVisibility.episodes && (
                        <TableHead
                          className="cursor-pointer select-none hover:bg-muted/50"
                          onClick={() => handleSort('episodes')}
                        >
                          <div className="flex items-center">
                            Episodes
                            <SortIndicator column="episodes" />
                          </div>
                        </TableHead>
                      )}
                      {isMatchMode && <TableHead>Compatibility</TableHead>}
                      <TableHead className="w-12"></TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {displayPodcasts.map(podcast => {
                      const score = scores[podcast.id]
                      const reasoning = reasonings[podcast.id]
                      const isSelected = selectedPodcasts.has(podcast.id)
                      const categories = Array.isArray(podcast.podcast_categories)
                        ? podcast.podcast_categories.map((c: any) => c.category_name || c).slice(0, 2)
                        : []

                      return (
                        <TableRow key={podcast.id}>
                          {isMatchMode && (
                            <TableCell className={getDensityClass()}>
                              <Checkbox
                                checked={isSelected}
                                onCheckedChange={(checked) => {
                                  setSelectedPodcasts(prev => {
                                    const next = new Set(prev)
                                    if (checked) {
                                      next.add(podcast.id)
                                    } else {
                                      next.delete(podcast.id)
                                    }
                                    return next
                                  })
                                }}
                              />
                            </TableCell>
                          )}
                          <TableCell className={getDensityClass()}>
                            <div className="flex items-center gap-3">
                              <img
                                src={podcast.podcast_image_url || `https://ui-avatars.com/api/?name=${encodeURIComponent(podcast.podcast_name)}&background=random&size=40`}
                                alt={podcast.podcast_name}
                                className="w-10 h-10 rounded object-cover"
                              />
                              <div>
                                <div className="font-medium">{podcast.podcast_name}</div>
                                {categories.length > 0 && (
                                  <div className="text-xs text-muted-foreground">
                                    {categories.join(', ')}
                                  </div>
                                )}
                              </div>
                            </div>
                          </TableCell>
                          {columnVisibility.host && (
                            <TableCell className={getDensityClass()}>
                              {podcast.host_name || podcast.publisher_name || 'Unknown'}
                            </TableCell>
                          )}
                          {columnVisibility.audience && (
                            <TableCell className={getDensityClass()}>
                              {podcast.audience_size
                                ? `${(podcast.audience_size / 1000).toFixed(0)}K`
                                : 'N/A'}
                            </TableCell>
                          )}
                          {columnVisibility.rating && (
                            <TableCell className={getDensityClass()}>
                              {podcast.itunes_rating ? (
                                <div className="flex items-center gap-1">
                                  <Star className="h-3 w-3 fill-yellow-400 text-yellow-400" />
                                  {podcast.itunes_rating.toFixed(1)}
                                </div>
                              ) : 'N/A'}
                            </TableCell>
                          )}
                          {columnVisibility.episodes && (
                            <TableCell className={getDensityClass()}>
                              {podcast.episode_count || 'N/A'}
                            </TableCell>
                          )}
                          {isMatchMode && (
                            <TableCell className={getDensityClass()}>
                              {score !== null && score !== undefined ? (
                                <TooltipProvider>
                                  <Tooltip>
                                    <TooltipTrigger>
                                      <Badge
                                        variant={
                                          score >= 8 ? 'default' :
                                          score >= 7 ? 'secondary' :
                                          'outline'
                                        }
                                        className="cursor-help"
                                      >
                                        {score.toFixed(1)}/10
                                      </Badge>
                                    </TooltipTrigger>
                                    <TooltipContent className="max-w-xs">
                                      <p className="text-sm">{reasoning || 'No reasoning available'}</p>
                                    </TooltipContent>
                                  </Tooltip>
                                </TooltipProvider>
                              ) : (
                                <span className="text-xs text-muted-foreground">Not scored</span>
                              )}
                            </TableCell>
                          )}
                          <TableCell className={getDensityClass()}>
                            <DropdownMenu>
                              <DropdownMenuTrigger asChild>
                                <Button variant="ghost" size="sm">
                                  <MoreVertical className="h-4 w-4" />
                                </Button>
                              </DropdownMenuTrigger>
                              <DropdownMenuContent align="end">
                                <DropdownMenuItem>
                                  View Details
                                </DropdownMenuItem>
                                {podcast.podscan_email && (
                                  <DropdownMenuItem>
                                    Copy Email
                                  </DropdownMenuItem>
                                )}
                              </DropdownMenuContent>
                            </DropdownMenu>
                          </TableCell>
                        </TableRow>
                      )
                    })}
                  </TableBody>
                </Table>

                {/* Pagination */}
                <div className="flex items-center justify-between mt-4">
                  <div className="text-sm text-muted-foreground">
                    Showing {((page - 1) * 20) + 1} to {Math.min(page * 20, totalCount)} of {totalCount.toLocaleString()} podcasts
                  </div>
                  <div className="flex gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setPage(p => Math.max(1, p - 1))}
                      disabled={page === 1}
                    >
                      Previous
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                      disabled={page === totalPages}
                    >
                      Next
                    </Button>
                  </div>
                </div>
              </>
            )}
          </CardContent>
        </Card>

        {/* Action Bar */}
        {isMatchMode && selectedPodcasts.size > 0 && (
          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div>
                    <div className="flex items-center gap-2">
                      <p className="font-medium text-lg">{selectedPodcasts.size} podcasts selected</p>
                      {selectedPodcasts.size > visiblePodcastIds.length && (
                        <Badge variant="secondary" className="text-xs">
                          across multiple pages
                        </Badge>
                      )}
                      {visiblePodcastIds.length > 0 && selectedPodcasts.size === visiblePodcastIds.length && visiblePodcastIds.length < totalCount && (
                        <Badge variant="outline" className="text-xs">
                          all on this page
                        </Badge>
                      )}
                    </div>
                    {Object.keys(scores).length > 0 && (
                      <p className="text-sm text-muted-foreground">
                        Average score: {calculateAverageScore().toFixed(1)}/10
                      </p>
                    )}
                  </div>
                </div>
                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    onClick={() => setSelectedPodcasts(new Set())}
                  >
                    Clear Selection
                  </Button>
                  {isClientMode && selectedClient && (
                    <Button onClick={handleExportToClientSheet} disabled={isExporting}>
                      {isExporting ? (
                        <>
                          <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                          Exporting...
                        </>
                      ) : (
                        'Export to Client Sheet'
                      )}
                    </Button>
                  )}
                  {isProspectMode && (
                    <Button onClick={handleExportToProspectSheet} disabled={isExporting}>
                      {isExporting ? (
                        <>
                          <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                          Exporting...
                        </>
                      ) : (
                        'Export to Prospect Sheet'
                      )}
                    </Button>
                  )}
                </div>
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    </DashboardLayout>
  )
}
