import { useEffect, useMemo, useRef, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import {
  AlertTriangle,
  ArrowRight,
  CheckCircle2,
  Loader2,
  RefreshCw,
  Sparkles,
  Users,
  X,
} from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Label } from '@/components/ui/label'
import { Progress } from '@/components/ui/progress'
import { Switch } from '@/components/ui/switch'
import { FinderClientPicker } from '@/components/workspace/finder/FinderClientPicker'
import { FinderFiltersPanel } from '@/components/workspace/finder/FinderFiltersPanel'
import { FinderRecentScans } from '@/components/workspace/finder/FinderRecentScans'
import { useRecentFinderScans } from '@/hooks/useRecentFinderScans'
import { FinderResults } from '@/components/workspace/finder/FinderResults'
import { preRankCandidates, scanDurationLabel } from '@/lib/finderRanking'
import {
  MAX_QUERIES,
  MAX_SCORED,
  PAGES_PER_QUERY,
  PROFILE_TOO_THIN_COPY,
  ScanFailedError,
  SCORING_BATCH_SIZE,
  SCORING_SPACING_MS,
  SEARCH_SPACING_MS,
  fromCatalog,
  fromPodscan,
  phaseSteps,
  rankCandidates,
  toShortlistInput,
  toStoredResult,
  type ScanFailure,
  type ScanPhase,
  type ScanPodcast,
  type ScanResult,
} from '@/lib/finderScan'
import { getFinderScan, saveFinderScan } from '@/services/finderScans'
import { normalizePodscanQuery } from '@/lib/podcastResearch'
import { CREDIT_COSTS, creditsLabel } from '@/lib/creditCosts'
import { PLATFORM_SUPPORT_EMAIL } from '@/lib/config'
import { DEFAULT_FINDER_FILTERS, type FinderFilters } from '@/lib/finderFilters'
import { readWorkingClient } from '@/lib/workingClient'
import { getWorkspaceBillingOverview } from '@/services/workspaceStaff'
import {
  podscanFailureReason,
  scanFailureCreditLine,
  withPodscanRetry,
  type ScanCreditTally,
} from '@/lib/podscanRetry'
import { WorkspaceLayout, type PlatformWorkspaceConfig } from '@/components/workspace/WorkspaceLayout'
import { useAuth } from '@/contexts/AuthContext'
import { getAdminWorkspaceView } from '@/services/adminWorkspaces'
import { workspaceLogoUrl } from '@/lib/workspaceLogo'
import { selectedWorkspaceBaseHref } from '@/lib/workspaceRoutes'
import { getWorkspaceClients, getWorkspaceResearchContext } from '@/services/clients'
import { generatePodcastQueries, ProfileTooThinError, StrategyGenerationError } from '@/services/queryGeneration'
import { describeQueryWarnings, searchPodcastsWithMeta } from '@/services/podscan'
import { InsufficientCreditsError, PartialScoringError, scoreCompatibilityBatch, type CompatibilityScore } from '@/services/compatibilityScoring'
import {
  addClientShortlistPodcasts,
  searchClientPodcastCatalog,
} from '@/services/clientShortlist'

interface WorkspaceSmartPodcastFinderProps {
  /**
   * Set when a platform admin is viewing a tenant. The Smart Finder used to be
   * unreachable in that view — the platform address resolved to the advanced
   * finder instead — so the same sidebar item opened a different page depending
   * on who clicked it.
   */
  platformWorkspaceId?: string
}

const WorkspaceSmartPodcastFinder = ({ platformWorkspaceId }: WorkspaceSmartPodcastFinderProps) => {
  const { user, workspace, membership, isPlatformAdmin } = useAuth()
  const queryClient = useQueryClient()
  const [searchParams, setSearchParams] = useSearchParams()
  const isPlatformWorkspace = platformWorkspaceId !== undefined
  const workspaceId = (isPlatformWorkspace ? platformWorkspaceId : workspace?.id || '').toLowerCase()
  const baseHref = isPlatformWorkspace ? selectedWorkspaceBaseHref(workspaceId) : '/app'

  // The shell names and brands the workspace on screen, which in the platform
  // view is not the one in AuthContext.
  const selectedWorkspaceQuery = useQuery({
    queryKey: ['platform', user?.id || 'unknown', 'workspace', workspaceId, 'smart-finder'],
    queryFn: ({ signal }) => getAdminWorkspaceView(workspaceId, signal),
    enabled: isPlatformWorkspace && Boolean(workspaceId),
    retry: false,
    gcTime: 0,
  })
  const selectedWorkspace = selectedWorkspaceQuery.data?.workspace
  const platformWorkspace: PlatformWorkspaceConfig | undefined = isPlatformWorkspace
    ? {
        workspaceId,
        workspaceName: selectedWorkspace?.name || 'Client workspace',
        logoUrl: workspaceLogoUrl(
          selectedWorkspace?.id,
          selectedWorkspace?.logo_path,
          selectedWorkspace?.logo_updated_at,
        ),
        baseHref,
      }
    : undefined
  /*
   * The client lives in ?client=, the same place the header's "Working on"
   * picker writes on this page, so the two are one choice rather than two
   * that can disagree.
   */
  const clientId = (searchParams.get('client') || '').toLowerCase()
  const setClientId = (next: string) => {
    setSearchParams((current) => {
      const params = new URLSearchParams(current)
      if (next) params.set('client', next)
      else params.delete('client')
      // A saved scan belongs to the client it was run for.
      params.delete('scan')
      return params
    })
  }
  // ?scan= reopens a saved scan, so a scan's results have an address.
  const openScanId = (searchParams.get('scan') || '').toLowerCase() || null
  const clearOpenScan = () => {
    setSearchParams((current) => {
      if (!current.get('scan')) return current
      const params = new URLSearchParams(current)
      params.delete('scan')
      return params
    }, { replace: true })
  }
  /*
   * Arriving with no ?client= while the header remembers one: open on that
   * client. Read during the first render, because the layout clears the
   * remembered client in its own effect when the address names none.
   */
  const [rememberedClientId] = useState(() => (clientId ? null : readWorkingClient(workspaceId)))
  useEffect(() => {
    if (!rememberedClientId) return
    setSearchParams((current) => {
      if (current.get('client')) return current
      const params = new URLSearchParams(current)
      params.set('client', rememberedClientId)
      return params
    }, { replace: true })
  }, [rememberedClientId, setSearchParams])

  const clientsQuery = useQuery({
    queryKey: ['workspace-clients', workspaceId],
    queryFn: () => getWorkspaceClients(workspaceId),
    enabled: Boolean(workspaceId),
  })
  const activeClients = useMemo(
    () => (clientsQuery.data || []).filter((client) => client.status === 'active'),
    [clientsQuery.data],
  )
  const selectedClient = activeClients.find((client) => client.id.toLowerCase() === clientId) || null

  const contextQuery = useQuery({
    queryKey: ['workspace-research-context', workspaceId, clientId],
    queryFn: () => getWorkspaceResearchContext(workspaceId, clientId),
    enabled: Boolean(workspaceId && clientId),
    retry: false,
  })
  const clientBio = contextQuery.data?.client.bio || null
  const existingPodcastIds = useMemo(
    () => new Set((contextQuery.data?.existing_podcast_ids || []).map((id) => id.toLowerCase())),
    [contextQuery.data?.existing_podcast_ids],
  )

  const [phase, setPhase] = useState<ScanPhase>('idle')
  const [failure, setFailure] = useState<ScanFailure | null>(null)
  // Whether an empty scan found shows that were all on the list already, or
  // found nothing at all. The empty card says different things for each.
  const [emptyScanFoundKnown, setEmptyScanFoundKnown] = useState(false)
  const [statusMessage, setStatusMessage] = useState('')
  const [progress, setProgress] = useState<{ completed: number; total: number } | null>(null)
  const [results, setResults] = useState<ScanResult[]>([])
  const [addedIds, setAddedIds] = useState<Set<string>>(new Set())
  const [isAdding, setIsAdding] = useState(false)
  const scanRunId = useRef(0)
  // Leaving the page cancels a running scan, so it stops searching and never
  // starts paid scoring for a page nobody is looking at.
  useEffect(() => () => {
    scanRunId.current += 1
  }, [])

  const [aiQueries, setAiQueries] = useState<string[]>([])
  const [aiStrategyLoaded, setAiStrategyLoaded] = useState(false)
  const [isRegenerating, setIsRegenerating] = useState(false)
  // Set when the strategy was refused for a thin profile. The fix is on the
  // client record, so the notice links there rather than offering a retry.
  const [profileTooThin, setProfileTooThin] = useState(false)
  const [filters, setFilters] = useState<FinderFilters>(DEFAULT_FINDER_FILTERS)
  const updateFilters = (patch: Partial<FinderFilters>) => setFilters((current) => ({ ...current, ...patch }))
  const {
    customKeywords,
    includeAiStrategy,
    language,
    region,
    activityDays,
    guestsOnly,
    minAudience,
    maxAudience,
    minEpisodes,
  } = filters

  const scanning = phase !== 'idle' && phase !== 'done' && phase !== 'failed'
  const [pickerOpen, setPickerOpen] = useState(false)
  const [pickerHighlighted, setPickerHighlighted] = useState(false)
  const pickerRef = useRef<HTMLButtonElement>(null)

  /*
   * A new client is a new scan: whatever was found, drafted or running for
   * the last one is dropped. The header can change the client mid-scan now,
   * so a running scan is cancelled the same way leaving the page cancels it.
   */
  const previousClientId = useRef(clientId)
  useEffect(() => {
    if (previousClientId.current === clientId) return
    previousClientId.current = clientId
    scanRunId.current += 1
    setResults([])
    setAddedIds(new Set())
    setProgress(null)
    setStatusMessage('')
    setAiQueries([])
    setAiStrategyLoaded(false)
    setProfileTooThin(false)
    setFailure(null)
    setSavedAt(null)
    setPhase('idle')
  }, [clientId])

  /*
   * A saved scan, shown as the result list. Applied only once the address and
   * the scan agree on the client, so the reset above cannot clear it after.
   */
  const [savedAt, setSavedAt] = useState<string | null>(null)
  const savedScanQuery = useQuery({
    queryKey: ['finder-scan', workspaceId, openScanId],
    queryFn: () => getFinderScan(workspaceId, openScanId!),
    enabled: Boolean(workspaceId && openScanId),
    retry: false,
  })
  useEffect(() => {
    const scan = savedScanQuery.data
    if (!scan || scan.id !== openScanId || scan.client_id.toLowerCase() !== clientId || scanning) return
    setResults(scan.results.map((result) => ({ ...result, estimated: result.estimated === true })))
    setAddedIds(new Set())
    setFailure(null)
    setSavedAt(scan.created_at)
    setPhase('done')
    // scanning is read, not watched: a scan finishing must not re-apply this.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [savedScanQuery.data, openScanId, clientId])
  useEffect(() => {
    if (savedScanQuery.isError) toast.error('That scan could not be opened. It may have been removed.')
  }, [savedScanQuery.isError])

  // The client's own scans: the latest one's queries steer the next strategy
  // away from angles already searched.
  const clientScansQuery = useRecentFinderScans(workspaceId, clientId || null)
  const lastScanQueries = useMemo(
    () => (clientId ? clientScansQuery.data?.[0]?.queries ?? [] : []),
    [clientId, clientScansQuery.data],
  )

  useEffect(() => {
    if (clientId) setPickerHighlighted(false)
  }, [clientId])

  /*
   * What the click can cost, said under the button, and the ceiling is known
   * before anything runs:
   * - every live index page is a podcast lookup, up to PAGES_PER_QUERY per
   *   query, charged even on the workspace's own AI key (it is not AI work);
   * - scoring is charged per request of SCORING_BATCH_SIZE, at most MAX_SCORED;
   * - drafting the AI strategy, only when the scan has to draft it itself.
   * The lookups were left out of this figure, which quoted 6 credits for a
   * scan that could take 24.
   */
  const scoringUnits = Math.ceil(MAX_SCORED / SCORING_BATCH_SIZE)
  const draftsStrategy = includeAiStrategy && aiQueries.length === 0 && !aiStrategyLoaded
  const byoAnthropic = Boolean(contextQuery.data?.ai_keys?.anthropic)
  const plannedQueryCount = customKeywords.length
    + (includeAiStrategy ? (aiStrategyLoaded ? aiQueries.length : MAX_QUERIES) : 0)
  const maxScanCredits = plannedQueryCount * PAGES_PER_QUERY * CREDIT_COSTS.podscan_lookup
    + (byoAnthropic ? 0 : CREDIT_COSTS.compatibility_scoring * scoringUnits + (draftsStrategy ? CREDIT_COSTS.query_generation : 0))
  const scanCostLabel = maxScanCredits > 0 ? `Up to ${creditsLabel(maxScanCredits)}` : 'Included'

  // The same balance the header chip reads, under the same query key, so
  // showing it here costs no extra request.
  const canViewBalance = Boolean(isPlatformAdmin) || membership?.role === 'owner' || membership?.role === 'admin'
  const billingQuery = useQuery({
    queryKey: ['workspace-billing-overview', workspaceId],
    queryFn: () => getWorkspaceBillingOverview(workspaceId),
    enabled: Boolean(workspaceId) && canViewBalance,
    retry: false,
    staleTime: 120_000,
  })
  const billingHref = isPlatformWorkspace
    ? `/app/platform/billing?workspace=${workspaceId}`
    : '/app/settings/billing'
  const creditBalance = billingQuery.data && billingQuery.data.enforcement_enabled !== false
    ? billingQuery.data.balance
    : null
  const balanceShort = creditBalance !== null && creditBalance < maxScanCredits

  const requestClient = () => {
    setPickerHighlighted(true)
    pickerRef.current?.focus()
    setPickerOpen(true)
  }

  const regenerateStrategy = async () => {
    if (!workspaceId || !clientId || !clientBio || isRegenerating) return
    setIsRegenerating(true)
    try {
      // Regenerating should look somewhere else, not draft the same angles
      // again. The advanced finder already asks this way.
      const generated = (await generatePodcastQueries({
        workspaceId,
        clientId,
        ...(aiQueries.length > 0
          ? { avoidQueries: aiQueries }
          : lastScanQueries.length > 0 ? { avoidQueries: lastScanQueries } : {}),
      }))
        .map(normalizePodscanQuery)
        .filter(Boolean)
        .slice(0, MAX_QUERIES)
      setAiQueries(generated)
      setAiStrategyLoaded(true)
      setProfileTooThin(false)
      toast.success('New AI search strategy ready. Remove any query you do not want before scanning.')
    } catch (error) {
      if (error instanceof ProfileTooThinError) {
        setProfileTooThin(true)
        toast.error(PROFILE_TOO_THIN_COPY)
      } else {
        toast.error(error instanceof StrategyGenerationError ? error.message : 'The AI search strategy could not be drafted. Try again in a moment.')
      }
    } finally {
      setIsRegenerating(false)
    }
  }

  const runScan = async () => {
    // Discovery is already paid for by the time scoring runs; hold the
    // candidates so a scoring failure can still show them instead of throwing
    // the whole run away.
    let discoveredCandidates: ScanPodcast[] = []
    let scoredSoFar: CompatibilityScore[] = []
    if (!workspaceId || !clientId || !selectedClient || scanning) return
    if (!clientBio) {
      toast.error('Add a client profile (bio) before scanning. The AI needs it to judge relevancy.')
      return
    }
    const runId = scanRunId.current + 1
    scanRunId.current = runId
    setResults([])
    setAddedIds(new Set())
    setProgress(null)
    setFailure(null)
    setSavedAt(null)
    clearOpenScan()
    const credits: ScanCreditTally = { strategy: 0, successfulLookups: 0, refunded: 0, unrefunded: 0 }
    // Scoring requests the server kept the charge for: not on the workspace's
    // own key, and not refunded because the model scored nothing.
    let scoringCharged = 0
    let ranQueries: string[] = []
    let foundCount = 0
    /*
     * Kept so a refresh does not throw a paid scan away. Saving is best
     * effort: the results are already on screen, so a failure says so and
     * leaves them there.
     */
    const persistScan = (ranked: ScanResult[]) => {
      const creditsUsed = credits.strategy
        + credits.successfulLookups * CREDIT_COSTS.podscan_lookup
        + scoringCharged * CREDIT_COSTS.compatibility_scoring
      void saveFinderScan(workspaceId, clientId, {
        queries: ranQueries,
        filters,
        found_count: foundCount,
        credits_used: creditsUsed,
        results: ranked.map(toStoredResult),
      })
        .then(() => queryClient.invalidateQueries({ queryKey: ['finder-scans', workspaceId] }))
        .catch((error) => {
          console.error('Smart scan could not be saved:', error)
          toast.warning('The results are shown, but this scan could not be saved to Recent scans.')
        })
    }

    try {
      setPhase('strategy')
      let strategyQueries = aiQueries
      // A previewed-then-edited strategy is authoritative, even if the owner
      // removed every query — only draft one when none was ever loaded.
      if (includeAiStrategy && strategyQueries.length === 0 && !aiStrategyLoaded) {
        setStatusMessage(`Reading ${selectedClient.name}’s profile and drafting search angles…`)
        try {
          // Away from what the last scan already searched, so scanning again
          // looks somewhere new rather than paying for the same results.
          strategyQueries = (await generatePodcastQueries({
            workspaceId,
            clientId,
            ...(lastScanQueries.length > 0 ? { avoidQueries: lastScanQueries } : {}),
          }))
            .map(normalizePodscanQuery)
            .filter(Boolean)
            .slice(0, MAX_QUERIES)
        } catch (error) {
          // A failed or refused strategy is refunded by the function (and a
          // thin profile is refused before any charge), so nothing was spent.
          if (error instanceof ProfileTooThinError) setProfileTooThin(true)
          throw new ScanFailedError(error instanceof ProfileTooThinError
            ? {
                title: 'Scan could not run.',
                reason: PROFILE_TOO_THIN_COPY,
                credits: scanFailureCreditLine(credits),
                action: { label: 'Open client profile', href: `${baseHref}/clients/${selectedClient.id}` },
              }
            : {
                title: 'Scan could not run.',
                reason: error instanceof StrategyGenerationError ? error.message : 'The AI search strategy could not be drafted. Try again in a moment.',
                credits: scanFailureCreditLine(credits),
              })
        }
        if (scanRunId.current !== runId) return
        setAiQueries(strategyQueries)
        setAiStrategyLoaded(true)
        credits.strategy = contextQuery.data?.ai_keys?.anthropic ? 0 : CREDIT_COSTS.query_generation
      }
      const queries = Array.from(new Set([
        ...customKeywords,
        ...(includeAiStrategy ? strategyQueries : []),
      ])).slice(0, MAX_QUERIES + customKeywords.length)
      if (queries.length === 0) {
        throw new Error('Add at least one keyword or turn the AI search strategy back on.')
      }
      ranQueries = queries

      setPhase('search')
      const minPostedAt = new Date()
      if (activityDays !== 'any') minPostedAt.setDate(minPostedAt.getDate() - Number.parseInt(activityDays, 10))
      const collected = new Map<string, ScanPodcast>()
      // How many different queries found each show: the strongest free
      // signal of fit, used to pick which shows are worth paying to score.
      const queryHits = new Map<string, number>()
      const seenInQuery = new Set<string>()
      const collect = (podcast: ScanPodcast, query: string) => {
        const key = podcast.podcast_id.toLowerCase()
        if (!collected.has(key)) collected.set(key, podcast)
        const hitKey = `${query}\u0000${key}`
        if (seenInQuery.has(hitKey)) return
        seenInQuery.add(hitKey)
        queryHits.set(key, (queryHits.get(key) ?? 0) + 1)
      }
      const matchesFilters = (podcast: ScanPodcast) => {
        if (minAudience && (podcast.audience_size ?? 0) < Number.parseInt(minAudience, 10)) return false
        if (maxAudience && (podcast.audience_size ?? 0) > Number.parseInt(maxAudience, 10)) return false
        if (minEpisodes && (podcast.episode_count ?? 0) < Number.parseInt(minEpisodes, 10)) return false
        if (language !== 'any' && podcast.language && podcast.language !== language) return false
        if (region !== 'any' && podcast.region && podcast.region !== region) return false
        if (activityDays !== 'any' && podcast.last_posted_at
          && Date.parse(podcast.last_posted_at) < minPostedAt.getTime()) return false
        return true
      }

      // The shared internal database first — instant, free of Podscan rate
      // limits, and already enriched by every workspace on the platform.
      setStatusMessage('Checking the shared podcast database…')
      // Failed lookups are counted so a scan that could not search is not
      // reported as one that searched and found nothing new.
      let catalogFailures = 0
      for (const query of queries) {
        if (scanRunId.current !== runId) return
        try {
          const catalogPodcasts = await searchClientPodcastCatalog(workspaceId, clientId, query)
          for (const podcast of catalogPodcasts) {
            const normalized = fromCatalog(podcast)
            if (matchesFilters(normalized)) collect(normalized, query)
          }
        } catch (error) {
          catalogFailures += 1
          console.error('Smart scan catalog search failed:', error)
        }
      }
      if (collected.size > 0) {
        setStatusMessage(`${collected.size.toLocaleString()} matches in the shared database. Expanding the search…`)
      }

      // Searches Podscan flagged as not read exactly as written. Their results
      // still count; the scan just says so at the end.
      const warnedQueries = new Set<string>()
      const warnAboutQueries = () => {
        const note = describeQueryWarnings([...warnedQueries])
        if (note) toast.warning(note, { duration: 10000 })
      }
      const totalRequests = queries.length * PAGES_PER_QUERY
      let completedRequests = 0
      for (const query of queries) {
        for (let page = 1; page <= PAGES_PER_QUERY; page += 1) {
          if (scanRunId.current !== runId) return
          let response: Awaited<ReturnType<typeof searchPodcastsWithMeta>>
          try {
            // A refused key or account stops the scan on the first request,
            // and a flaky index gets two more tries. Carrying on through every
            // remaining page after a failure is what kept a 403 scan spinning
            // for a minute and a half.
            response = await withPodscanRetry(() => searchPodcastsWithMeta({
              query,
              page,
              per_page: 50,
              order_by: 'best_match',
              order_dir: 'desc',
              search_fields: 'name,description,publisher_name',
              ...(guestsOnly ? { has_guests: true } : {}),
              ...(language !== 'any' ? { language } : {}),
              ...(region !== 'any' ? { region } : {}),
              ...(activityDays !== 'any' ? { min_last_episode_posted_at: minPostedAt.toISOString().slice(0, 10) } : {}),
              ...(minAudience ? { min_audience_size: Number.parseInt(minAudience, 10) } : {}),
              ...(maxAudience ? { max_audience_size: Number.parseInt(maxAudience, 10) } : {}),
              ...(minEpisodes ? { min_episode_count: Number.parseInt(minEpisodes, 10) } : {}),
            }, workspaceId), {
              shouldContinue: () => scanRunId.current === runId,
              onFailedAttempt: ({ charged, refunded }) => {
                credits.refunded += refunded
                credits.unrefunded += Math.max(0, charged - refunded)
              },
            })
          } catch (error) {
            console.error('Smart scan search page failed:', error)
            throw new ScanFailedError({
              title: 'Scan could not run.',
              reason: podscanFailureReason(error),
              credits: scanFailureCreditLine(credits),
            })
          }
          credits.successfulLookups += 1
          if (response.data.query_warnings?.length) {
            warnedQueries.add(query)
            console.warn('Podscan query warnings:', query, response.data.query_warnings)
          }
          const podcasts = response.data.podcasts || []
          for (const podcast of podcasts) collect(fromPodscan(podcast), query)
          const lastPage = Number.parseInt(String(response.data.pagination?.last_page ?? PAGES_PER_QUERY), 10)
          if (podcasts.length === 0 || page >= lastPage) {
            completedRequests += PAGES_PER_QUERY - page + 1
            break
          }
          completedRequests += 1
          setProgress({ completed: completedRequests, total: totalRequests })
          setStatusMessage(`${collected.size.toLocaleString()} unique podcasts found so far…`)
          if (completedRequests < totalRequests) {
            await new Promise((resolve) => window.setTimeout(resolve, SEARCH_SPACING_MS))
          }
        }
      }
      if (scanRunId.current !== runId) return
      // Only the shared database can fail here and leave the scan running:
      // a failed index request has already ended it above.
      const failedSearches = catalogFailures
      /*
       * Only the first MAX_SCORED are scored, so which ones come first is a
       * spending decision. Discovery order (index relevance per query) was
       * the order before; shows several queries found, that share words with
       * the profile and that posted recently now come first.
       */
      const fresh = preRankCandidates(
        [...collected.values()].filter((podcast) => !existingPodcastIds.has(podcast.podcast_id.toLowerCase())),
        queryHits,
        [clientBio, ...customKeywords, ...queries].join(' '),
      )
      foundCount = fresh.length
      const candidates = fresh.slice(0, MAX_SCORED)
      discoveredCandidates = candidates
      const droppedCount = fresh.length - candidates.length
      if (candidates.length === 0) {
        // "Nothing new" is a claim that every search ran. With any of them
        // failed, it may simply be the part that did not run.
        if (failedSearches > 0) {
          throw new ScanFailedError({
            title: 'Some searches failed.',
            reason: `The shared podcast database did not answer ${failedSearches} of ${queries.length} searches, and the rest found nothing new.`,
            credits: scanFailureCreditLine(credits),
          })
        }
        setEmptyScanFoundKnown(collected.size > 0)
        setPhase('done')
        setStatusMessage('')
        toast.info(collected.size > 0
          ? 'No new podcasts were found. Everything discovered is already on this client’s list.'
          : 'No podcasts matched these searches and filters.')
        warnAboutQueries()
        return
      }

      setPhase('score')
      setProgress({ completed: 0, total: candidates.length })
      setStatusMessage(droppedCount > 0
        ? `Comparing the first ${candidates.length} of ${fresh.length} new podcasts against ${selectedClient.name}’s profile…`
        : `Comparing ${candidates.length} podcasts against ${selectedClient.name}’s profile…`)
      const forScoring = candidates.map((podcast) => ({
        podcast_id: podcast.podcast_id,
        podcast_name: podcast.podcast_name,
        podcast_description: podcast.podcast_description ?? undefined,
        publisher_name: podcast.publisher_name ?? undefined,
        podcast_categories: podcast.podcast_categories ?? undefined,
        audience_size: podcast.audience_size ?? undefined,
        episode_count: podcast.episode_count ?? undefined,
      }))
      // Sent one paid batch at a time so a cancelled scan (the user left the
      // page or started another) stops before the next charge. The endpoint
      // scores up to 20 per request and charges one credit per request.
      let failedScores = 0
      for (let start = 0; start < forScoring.length; start += SCORING_BATCH_SIZE) {
        if (scanRunId.current !== runId) return
        if (start > 0) await new Promise((resolve) => window.setTimeout(resolve, SCORING_SPACING_MS))
        if (scanRunId.current !== runId) return
        const batch = forScoring.slice(start, start + SCORING_BATCH_SIZE)
        try {
          const batchScores = await scoreCompatibilityBatch(
            clientBio,
            batch,
            SCORING_BATCH_SIZE,
            undefined,
            false,
            { workspaceId, clientId },
          )
          // A request the model scored none of is refunded by the function.
          if (!byoAnthropic && batchScores.some((score) => score.source !== 'deterministic')) scoringCharged += 1
          scoredSoFar = [...scoredSoFar, ...batchScores]
        } catch (error) {
          if (!(error instanceof PartialScoringError)) throw error
          scoredSoFar = [...scoredSoFar, ...error.scored]
          failedScores += error.failedCount
        }
        const completed = Math.min(start + batch.length, forScoring.length)
        if (scanRunId.current !== runId) return
        setProgress({ completed, total: forScoring.length })
        setStatusMessage(`Scored ${completed} of ${forScoring.length} podcasts…`)
      }
      if (failedScores > 0) {
        throw new PartialScoringError(
          `${forScoring.length - failedScores} of ${forScoring.length} scored before the rest failed.`,
          scoredSoFar,
          failedScores,
        )
      }
      const scores = scoredSoFar
      if (scanRunId.current !== runId) return
      const ranked = rankCandidates(candidates, scores)
      setResults(ranked)
      setPhase('done')
      setStatusMessage('')
      persistScan(ranked)
      // An unscored row is not a low score, and a truncated list is not the
      // whole market. Saying "ranked" for either would be a claim the scan
      // did not earn.
      const unscored = ranked.filter((result) => result.score === null).length
      const notes = [
        unscored > 0 ? `${unscored} could not be scored` : null,
        droppedCount > 0 ? `${droppedCount} more found but not scored` : null,
        failedSearches > 0 ? `${failedSearches} search${failedSearches === 1 ? '' : 'es'} failed` : null,
      ].filter(Boolean).join(', ')
      if (notes) toast.warning(`${ranked.length - unscored} ranked for ${selectedClient.name}: ${notes}.`)
      else toast.success(`${ranked.length} podcasts ranked for ${selectedClient.name}.`)
      warnAboutQueries()
    } catch (error) {
      if (scanRunId.current !== runId) return
      // A scoring failure must not bin discovery the workspace already paid
      // for. Show what was found (with any partial scores) and say plainly
      // what did not score, mirroring the advanced Finder.
      if (error instanceof PartialScoringError && discoveredCandidates.length > 0) {
        const ranked = rankCandidates(discoveredCandidates, error.scored)
        setResults(ranked)
        setPhase('done')
        setStatusMessage('')
        persistScan(ranked)
        toast.warning(`${error.message} Score the rest again when you are ready.`, { duration: 10000 })
        return
      }
      if (error instanceof InsufficientCreditsError && discoveredCandidates.length > 0) {
        const ranked = rankCandidates(discoveredCandidates, scoredSoFar)
        setResults(ranked)
        persistScan(ranked)
        setPhase('done')
        setStatusMessage('')
        toast.error(`${error.message} The ${discoveredCandidates.length} podcasts found are shown unscored. Add credits to score them.`, { duration: 10000 })
        return
      }
      if (error instanceof ScanFailedError) {
        setFailure(error.failure)
        setPhase('failed')
        setStatusMessage('')
        toast.error(`${error.failure.title} ${error.failure.reason}`)
        return
      }
      setPhase('idle')
      setStatusMessage('')
      toast.error(error instanceof Error ? error.message : 'The scan could not be completed.')
    }
  }

  const addPodcasts = async (toAdd: ScanResult[]) => {
    if (!workspaceId || !clientId || toAdd.length === 0 || isAdding) return
    setIsAdding(true)
    try {
      const response = await addClientShortlistPodcasts(workspaceId, clientId, toAdd.map(toShortlistInput))
      setAddedIds((current) => new Set([...current, ...toAdd.map((result) => result.podcast.podcast_id)]))
      void queryClient.invalidateQueries({ queryKey: ['workspace-research-context', workspaceId, clientId] })
      const skippedNote = response.skipped > 0 ? ` (${response.skipped} already on the list)` : ''
      toast.success(`${response.added} podcast${response.added === 1 ? '' : 's'} added to ${selectedClient?.name || 'the client'}’s list${skippedNote}.`)
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'The podcasts could not be added.')
    } finally {
      setIsAdding(false)
    }
  }

  const currentStepIndex = phaseSteps.findIndex((step) => step.id === phase)

  const aiStrategy = (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Switch
            id="finder-ai-strategy"
            checked={includeAiStrategy}
            onCheckedChange={(next) => updateFilters({ includeAiStrategy: next })}
          />
          <Label htmlFor="finder-ai-strategy" className="text-sm font-medium">AI search strategy</Label>
        </div>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => void regenerateStrategy()}
          disabled={!clientBio || isRegenerating || !includeAiStrategy || scanning}
        >
          {isRegenerating ? <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" /> : <Sparkles className="mr-2 h-3.5 w-3.5" />}
          {aiQueries.length > 0 ? 'Regenerate' : 'Preview strategy'}
        </Button>
      </div>
      {includeAiStrategy && aiQueries.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-1.5">
          {aiQueries.map((query) => (
            <Badge key={query} variant="outline" className="gap-1 pr-1 font-normal">
              <Sparkles className="h-3 w-3 text-violet-500" />
              {query}
              <button
                type="button"
                aria-label={`Remove AI query ${query}`}
                className="rounded-full p-0.5 hover:bg-muted"
                onClick={() => setAiQueries((current) => current.filter((entry) => entry !== query))}
              >
                <X className="h-3 w-3" />
              </button>
            </Badge>
          ))}
        </div>
      )}
      {includeAiStrategy && aiQueries.length === 0 && (
        <p className="mt-1.5 text-xs text-muted-foreground">AI builds the search from the client’s profile. Preview to tweak it.</p>
      )}
      {!includeAiStrategy && (
        <p className="mt-1.5 text-xs text-muted-foreground">Off. Only your keywords are searched.</p>
      )}
      {includeAiStrategy && profileTooThin && selectedClient && (
        <p role="alert" className="mt-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2.5 text-xs leading-5 text-amber-900">
          {PROFILE_TOO_THIN_COPY}{' '}
          <Link className="font-semibold underline underline-offset-2" to={`${baseHref}/clients/${selectedClient.id}`}>
            Open {selectedClient.name}’s profile
          </Link>
        </p>
      )}
    </div>
  )

  return (
    <WorkspaceLayout platformWorkspace={platformWorkspace} hidePageName>
      <div className="mx-auto w-full max-w-4xl space-y-6">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">Podcast Finder</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              One scan finds active guest-interview podcasts and ranks every match against your client with AI.
            </p>
          </div>
          <div className="flex shrink-0 flex-col sm:items-end">
            <Button asChild variant="ghost" size="sm" className="-ml-3 w-fit text-muted-foreground sm:ml-0 sm:-mr-3">
              <Link to={`${baseHref}/podcast-finder/advanced${clientId ? `?client=${encodeURIComponent(clientId)}` : ''}`}>
                Advanced finder
                <ArrowRight className="ml-2 h-3.5 w-3.5" />
              </Link>
            </Button>
            <p className="max-w-[16rem] text-xs text-muted-foreground sm:text-right">
              Set how many shows to pull, filter by chart category, and score only the ones you pick.
            </p>
          </div>
        </div>

        <Card>
          <CardHeader className="pb-4">
            <CardTitle className="text-lg">Who are we booking?</CardTitle>
            <CardDescription>Pick a client. Their profile drives the scan.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-start">
              <FinderClientPicker
                ref={pickerRef}
                clients={activeClients}
                value={clientId}
                onChange={setClientId}
                loading={clientsQuery.isLoading}
                disabled={scanning}
                addClientHref={`${baseHref}/clients?new=1`}
                open={pickerOpen}
                onOpenChange={setPickerOpen}
                highlighted={pickerHighlighted && !selectedClient}
              />
              <div className="flex flex-col gap-1.5">
                <Button
                  onClick={() => (selectedClient ? void runScan() : requestClient())}
                  disabled={scanning || (Boolean(selectedClient) && (contextQuery.isLoading || contextQuery.isError))}
                  aria-describedby={selectedClient ? 'finder-scan-cost' : undefined}
                  // The default disabled look is 50% opacity: white on a washed
                  // indigo, 2.3:1. Muted with darker text holds 7:1 in both themes.
                  className="sm:w-auto disabled:bg-muted disabled:text-foreground/75 disabled:opacity-100"
                >
                  {scanning
                    ? <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    : <Sparkles className="mr-2 h-4 w-4" />}
                  {scanning
                    ? 'Scanning…'
                    : !selectedClient
                      ? 'Pick a client to scan'
                      : results.length > 0
                        ? 'Scan again'
                        : `Scan podcasts for ${selectedClient.name}`}
                </Button>
                {selectedClient && (
                  <p
                    id="finder-scan-cost"
                    className={balanceShort ? 'text-xs text-amber-800 dark:text-amber-300' : 'text-xs text-muted-foreground'}
                  >
                    {scanCostLabel}
                    {creditBalance !== null && ` · ${creditBalance.toLocaleString()} left`}
                    {balanceShort && (
                      <>
                        {'. '}
                        <Link className="font-medium underline underline-offset-2" to={billingHref}>Add credits</Link>
                      </>
                    )}
                  </p>
                )}
              </div>
            </div>
            <FinderFiltersPanel
              filters={filters}
              onChange={updateFilters}
              onReset={() => {
                setFilters(DEFAULT_FINDER_FILTERS)
                setAiQueries([])
                setAiStrategyLoaded(false)
              }}
              aiStrategy={aiStrategy}
              storageKey={`podcast-finder-filters-open-v1:${user?.id || 'anonymous'}`}
            />
            {selectedClient && contextQuery.isError && (
              <p className="flex flex-wrap items-center gap-2 text-sm text-destructive">
                {selectedClient.name}’s profile could not be loaded.
                <button type="button" className="font-medium underline underline-offset-2" onClick={() => void contextQuery.refetch()}>Retry</button>
              </p>
            )}
            {selectedClient && !contextQuery.isLoading && !contextQuery.isError && !clientBio && (
              <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2.5 text-xs leading-5 text-amber-900">
                {selectedClient.name} has no profile bio yet, so the AI has nothing to match against.{' '}
                <Link className="font-semibold underline underline-offset-2" to={`${baseHref}/clients/${selectedClient.id}`}>
                  Add their profile first
                </Link>.
              </p>
            )}
            {clientsQuery.isError ? (
              <p className="flex items-center gap-2 text-sm text-destructive">
                <Users className="h-4 w-4" />
                Your clients could not be loaded.
                <button type="button" className="font-medium underline underline-offset-2" onClick={() => void clientsQuery.refetch()}>Try again</button>
              </p>
            ) : activeClients.length === 0 && !clientsQuery.isLoading && (
              // A failed load must not read as "you have no clients" — that
              // sends the operator to create a duplicate of one they already have.
              <p className="flex items-center gap-2 text-sm text-muted-foreground">
                <Users className="h-4 w-4" />
                No active clients yet. <Link className="font-medium underline underline-offset-2" to={`${baseHref}/clients`}>Add your first client</Link>.
              </p>
            )}
          </CardContent>
        </Card>

        {scanning && (
          <Card role="status" aria-label="Scan progress">
            <CardContent className="space-y-4 pt-6">
              <ol className="space-y-2.5">
                {phaseSteps.map((step, index) => {
                  const state = index < currentStepIndex ? 'complete' : index === currentStepIndex ? 'active' : 'queued'
                  return (
                    <li key={step.id} className="flex items-center gap-2.5 text-sm">
                      {state === 'complete' && <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-600" />}
                      {state === 'active' && <Loader2 className="h-4 w-4 shrink-0 animate-spin text-primary" />}
                      {state === 'queued' && <span className="h-4 w-4 shrink-0 rounded-full border border-border" />}
                      <span className={state === 'queued' ? 'text-muted-foreground' : ''}>{step.label}</span>
                    </li>
                  )
                })}
              </ol>
              {progress && progress.total > 0 && (
                <Progress value={Math.round((progress.completed / progress.total) * 100)} />
              )}
              {statusMessage && <p className="text-xs text-muted-foreground">{statusMessage}</p>}
              <p className="text-xs text-muted-foreground">{scanDurationLabel(plannedQueryCount)}</p>
            </CardContent>
          </Card>
        )}

        {phase === 'done' && results.length > 0 && (
          <FinderResults
            clientName={selectedClient?.name || 'this client'}
            results={results}
            addedIds={addedIds}
            isAdding={isAdding}
            onAdd={(toAdd) => void addPodcasts(toAdd as ScanResult[])}
            clientHref={`${baseHref}/clients/${clientId}`}
            savedAt={savedAt}
          />
        )}

        {phase === 'failed' && failure && (
          <Card role="alert" className="border-destructive/40">
            <CardContent className="flex flex-col items-center gap-3 py-10 text-center">
              <AlertTriangle className="h-5 w-5 text-destructive" />
              <p className="text-sm font-semibold">{failure.title}</p>
              <p className="max-w-lg text-sm text-muted-foreground">{failure.reason}</p>
              <p className="max-w-lg text-sm text-muted-foreground">{failure.credits}</p>
              <p className="max-w-lg text-sm text-muted-foreground">Try again, or contact support if it keeps happening.</p>
              <div className="flex items-center gap-3">
                {failure.action && (
                  <Button asChild size="sm">
                    <Link to={failure.action.href}>{failure.action.label}</Link>
                  </Button>
                )}
                <Button size="sm" variant={failure.action ? 'outline' : 'default'} onClick={() => void runScan()}>
                  <RefreshCw className="mr-2 h-3.5 w-3.5" />
                  Retry
                </Button>
                <Button asChild size="sm" variant="outline">
                  <a href={`mailto:${PLATFORM_SUPPORT_EMAIL}?subject=${encodeURIComponent('Podcast Finder scan failed')}`}>Contact support</a>
                </Button>
              </div>
            </CardContent>
          </Card>
        )}

        {phase === 'done' && results.length === 0 && (
          <Card>
            <CardContent className="flex flex-col items-center gap-3 py-10 text-center">
              <RefreshCw className="h-5 w-5 text-muted-foreground" />
              <p className="text-sm text-muted-foreground">
                {emptyScanFoundKnown
                  ? 'Nothing new this time. Every podcast found is already on the list.'
                  : 'No podcasts matched these searches and filters.'}{' '}
                Update the client profile or loosen the filters and try again, or use the{' '}
                <Link className="font-medium underline underline-offset-2" to={`${baseHref}/podcast-finder/advanced`}>advanced finder</Link> for a wider net.
              </p>
            </CardContent>
          </Card>
        )}

        {!scanning && (
          <FinderRecentScans
            workspaceId={workspaceId}
            clientId={selectedClient ? clientId : null}
            clientName={selectedClient?.name ?? null}
            finderHref={`${baseHref}/podcast-finder`}
            openScanId={savedAt ? openScanId : null}
          />
        )}
      </div>
    </WorkspaceLayout>
  )
}

export default WorkspaceSmartPodcastFinder
