import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import {
  Archive,
  ChevronDown,
  Database,
  Eye,
  ExternalLink,
  Library,
  ListPlus,
  Loader2,
  MailCheck,
  Plus,
  Radio,
  Search,
  Star,
} from 'lucide-react'
import { toast } from 'sonner'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Checkbox } from '@/components/ui/checkbox'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Input } from '@/components/ui/input'
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet'
import { Textarea } from '@/components/ui/textarea'
import { safeExternalUrl } from '@/lib/externalUrl'
import { isResearchRunStale } from '@/lib/researchProgress'
import { matchesEmailFilter, shortlistContactEmail, type EmailFilter } from '@/lib/shortlistEmail'
import { PITCH_LABELS, hasWrittenPitch, pitchStatus, type PitchFilter } from '@/lib/shortlistPitchStatus'
import { MY_WORKSPACE_BASE_HREF, clientPitchHref } from '@/lib/workspaceRoutes'
import { getWorkspaceCampaign } from '@/services/workspaceCampaigns'
import { cn } from '@/lib/utils'
import { WEAK_FIT_BELOW } from '@/lib/shortlistFit'
import { FitDetails, ShortlistFitRunner } from '@/components/workspace/ShortlistFit'
import { ShortlistResearchBatch } from '@/components/workspace/ShortlistResearchBatch'
import { ShortlistBulkBar } from '@/components/workspace/ShortlistBulkBar'
import { ShortlistDeleteDialog } from '@/components/workspace/ShortlistDeleteDialog'
import { FeedbackBadge, PodcastArtwork, ShortlistTable } from '@/components/workspace/ShortlistTable'
import { compactNumber, qualityFlags, researchStatusLabel } from '@/lib/shortlistRow'
import {
  addClientShortlistPodcasts,
  getClientShortlist,
  searchClientPodcastCatalog,
  updateClientShortlistPodcast,
  type ClientShortlistCatalogPodcast,
  type ClientShortlistPodcast,
} from '@/services/clientShortlist'

type ListFilter = 'all' | 'not_reviewed' | 'approved' | 'rejected' | 'weak_fit' | 'low_quality' | 'archived'
const LIST_FILTERS: ListFilter[] = ['all', 'not_reviewed', 'approved', 'rejected', 'weak_fit', 'low_quality', 'archived']

/** Not posting in 90 days, or a company's own feed: see qualityFlags. */
const isLowQuality = (podcast: Parameters<typeof qualityFlags>[0]) => {
  const flags = qualityFlags(podcast)
  return flags.notPosting || flags.companyFeed
}
type FitFilter = 'any' | 'at_least' | 'below' | 'unscored'
type ListSort = 'list_order' | 'fit_desc' | 'audience_desc' | 'audience_asc' | 'rating_desc' | 'rating_asc' | 'recent_desc' | 'name_asc'

interface ClientShortlistEditorProps {
  workspaceId: string
  clientId: string
  clientName: string
  /**
   * Carried by the client page for the pitch flow, which now lives on its own
   * page and loads these itself. Accepted so the page's call site is stable.
   */
  clientBio?: string | null
  viewerRole?: 'owner' | 'admin' | 'member' | 'platform_admin'
  databaseHref: string
  finderHref: string
  /** The list filter to open on, from a ?filter= link such as the Pipeline's "To review". */
  initialFilter?: string | null
  /**
   * `${base}/client-campaigns/${clientId}`, so the workspace base every pitch
   * link is built on is what precedes it; the editor is given no other route
   * context, and a platform admin viewing a tenant must stay in that tenant.
   */
  campaignHref: string
  relationshipsHref?: string
  billingHref?: string
  /** The workspace has its own Anthropic key, so scoring costs no credits. */
  byoAi?: boolean
  onChanged?: () => void
}

const PAGE_SIZE = 10
const SELECT_CLASS = 'h-10 rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 disabled:opacity-50'

/** A threshold that is not a number yet (mid-typing) filters nothing out. */
function matchesFitFilter(podcast: ClientShortlistPodcast, fitFilter: FitFilter, threshold: number): boolean {
  const score = typeof podcast.fit_score === 'number' ? podcast.fit_score : null
  if (fitFilter === 'unscored') return score === null
  if (fitFilter === 'any' || !Number.isFinite(threshold)) return true
  if (score === null) return false
  return fitFilter === 'at_least' ? score >= threshold : score < threshold
}

function isWeakFit(podcast: ClientShortlistPodcast): boolean {
  return podcast.visibility === 'visible' && typeof podcast.fit_score === 'number' && podcast.fit_score < WEAK_FIT_BELOW
}

function compareOptionalNumbers(
  left: number | null | undefined,
  right: number | null | undefined,
  direction: 'asc' | 'desc',
): number {
  const leftValue = typeof left === 'number' && Number.isFinite(left) ? left : null
  const rightValue = typeof right === 'number' && Number.isFinite(right) ? right : null
  if (leftValue === null && rightValue === null) return 0
  if (leftValue === null) return 1
  if (rightValue === null) return -1
  return direction === 'asc' ? leftValue - rightValue : rightValue - leftValue
}

function resultLabel(count: number): string {
  return `${count.toLocaleString()} podcast${count === 1 ? '' : 's'}`
}

function formattedDate(value: string | null | undefined): string {
  if (!value) return 'an earlier campaign'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return 'an earlier campaign'
  return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })
}

function PodcastExternalLink({ url, name }: { url: string | null; name: string }) {
  const href = safeExternalUrl(url)
  if (!href) return null
  return <Button asChild variant="ghost" size="icon"><a href={href} target="_blank" rel="noreferrer" aria-label={`Open ${name}`}><ExternalLink className="h-4 w-4" /></a></Button>
}

export function ClientShortlistEditor({
  workspaceId,
  clientId,
  clientName,
  databaseHref,
  finderHref,
  campaignHref,
  initialFilter,
  byoAi,
  onChanged,
}: ClientShortlistEditorProps) {
  const queryClient = useQueryClient()
  const [filter, setFilter] = useState<ListFilter>(() => (
    LIST_FILTERS.includes(initialFilter as ListFilter) ? initialFilter as ListFilter : 'all'
  ))
  const [pitchFilter, setPitchFilter] = useState<PitchFilter>('all')
  const [sort, setSort] = useState<ListSort>('list_order')
  const [searchQuery, setSearchQuery] = useState('')
  const [fitFilter, setFitFilter] = useState<FitFilter>('any')
  const [fitThreshold, setFitThreshold] = useState('7')
  const [emailFilter, setEmailFilter] = useState<EmailFilter>('any')
  const [page, setPage] = useState(1)
  const [addOpen, setAddOpen] = useState(false)
  const [catalogQuery, setCatalogQuery] = useState('')
  const [debouncedCatalogQuery, setDebouncedCatalogQuery] = useState('')
  // The podcast objects, not just ids: a tick made under an earlier search
  // has to survive the results changing, or the count and the add both
  // silently drop it.
  const [selectedCatalog, setSelectedCatalog] = useState<Map<string, ClientShortlistCatalogPodcast>>(new Map())
  const [pendingPodcastId, setPendingPodcastId] = useState<string | null>(null)
  const [isAdding, setIsAdding] = useState(false)
  const [archiveTarget, setArchiveTarget] = useState<ClientShortlistPodcast | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<ClientShortlistPodcast | null>(null)
  const [detailPodcast, setDetailPodcast] = useState<ClientShortlistPodcast | null>(null)
  const [operatorNotes, setOperatorNotes] = useState('')
  const [isSavingNotes, setIsSavingNotes] = useState(false)
  // Podcast ids ticked for a bulk decision. Cleared whenever the view
  // changes, so an action never lands on shows the operator can no longer see.
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())

  const shortlistQueryKey = ['client-shortlist', workspaceId, clientId] as const
  const workspaceBaseHref = campaignHref.split('/client-campaigns')[0] || MY_WORKSPACE_BASE_HREF
  /**
   * Which of these podcasts are already out with the host.
   *
   * The row could not see it, so a podcast in active outreach still offered
   * "Write Pitch" — a button promising work the next screen opens locked and
   * refuses. Same query key as the pitch page, so this shares its cache
   * rather than fetching the campaign twice, and a failure leaves every label
   * exactly as it was.
   */
  const campaignTargetsQuery = useQuery({
    queryKey: ['client-campaign-preparation', workspaceId, clientId],
    queryFn: () => getWorkspaceCampaign(workspaceId, clientId),
    enabled: Boolean(workspaceId) && Boolean(clientId),
    retry: false,
    staleTime: 30_000,
  })
  const targetsByPodcast = useMemo(() => new Map(
    (campaignTargetsQuery.data?.targets ?? []).map((target) => [target.shortlist_podcast_id, target]),
  ), [campaignTargetsQuery.data])
  const pitchDataAvailable = campaignTargetsQuery.data !== undefined


  const shortlistQuery = useQuery({
    queryKey: shortlistQueryKey,
    queryFn: () => getClientShortlist(workspaceId, clientId),
    retry: false,
    refetchInterval: (query) => query.state.data?.podcasts.some((podcast) =>
      ['queued', 'running'].includes(podcast.research_progress?.status ?? '')
      && !isResearchRunStale(podcast.research_progress)) ? 10_000 : false,
  })
  const catalogSearchQuery = useQuery({
    queryKey: ['client-shortlist-catalog', workspaceId, clientId, debouncedCatalogQuery],
    queryFn: () => searchClientPodcastCatalog(workspaceId, clientId, debouncedCatalogQuery),
    enabled: addOpen && debouncedCatalogQuery.length >= 2,
    retry: false,
  })

  useEffect(() => {
    const timeout = window.setTimeout(() => setDebouncedCatalogQuery(catalogQuery.trim()), 250)
    return () => window.clearTimeout(timeout)
  }, [catalogQuery])

  useEffect(() => setPage(1), [filter, searchQuery, sort, fitFilter, fitThreshold, pitchFilter, emailFilter])
  useEffect(() => setSelectedIds(new Set()), [filter, searchQuery, fitFilter, fitThreshold, pitchFilter, emailFilter])

  const podcasts = useMemo(() => shortlistQuery.data?.podcasts || [], [shortlistQuery.data?.podcasts])
  const featured = useMemo(() => podcasts
    .filter((podcast) => podcast.visibility === 'visible' && podcast.is_featured)
    .sort((left, right) => (left.featured_order ?? 99) - (right.featured_order ?? 99)), [podcasts])
  const counts = useMemo(() => ({
    active: podcasts.filter((podcast) => podcast.visibility === 'visible').length,
    archived: podcasts.filter((podcast) => podcast.visibility === 'archived').length,
    approved: podcasts.filter((podcast) => podcast.visibility === 'visible' && podcast.feedback_status === 'approved').length,
    rejected: podcasts.filter((podcast) => podcast.visibility === 'visible' && podcast.feedback_status === 'rejected').length,
    notReviewed: podcasts.filter((podcast) => podcast.visibility === 'visible' && !podcast.feedback_status).length,
    weakFit: podcasts.filter(isWeakFit).length,
    lowQuality: podcasts.filter((podcast) => podcast.visibility === 'visible' && isLowQuality(podcast)).length,
  }), [podcasts])
  // Every filter but email, so the email counts describe what the other filters leave.
  const beforeEmail = useMemo(() => {
    const query = searchQuery.trim().toLowerCase()
    const threshold = Number.parseFloat(fitThreshold)
    return podcasts.filter((podcast) => {
      if (query && !`${podcast.podcast_name} ${podcast.publisher_name || ''}`.toLowerCase().includes(query)) return false
      if (pitchFilter !== 'all') {
        if (!pitchDataAvailable) return false
        const target = targetsByPodcast.get(podcast.id)
        if (pitchFilter === 'written' ? !hasWrittenPitch(target) : pitchStatus(target) !== pitchFilter) return false
      }
      if (!matchesFitFilter(podcast, fitFilter, threshold)) return false
      if (filter === 'all') return podcast.visibility === 'visible'
      if (filter === 'archived') return podcast.visibility === 'archived'
      if (podcast.visibility !== 'visible') return false
      if (filter === 'approved') return podcast.feedback_status === 'approved'
      if (filter === 'rejected') return podcast.feedback_status === 'rejected'
      if (filter === 'weak_fit') return isWeakFit(podcast)
      if (filter === 'low_quality') return isLowQuality(podcast)
      return podcast.feedback_status === null
    })
  }, [filter, fitFilter, fitThreshold, podcasts, searchQuery, pitchFilter, pitchDataAvailable, targetsByPodcast])
  const emailCounts = useMemo(() => {
    const has = beforeEmail.filter((podcast) => shortlistContactEmail(podcast) !== null).length
    return { has, none: beforeEmail.length - has }
  }, [beforeEmail])
  const filtered = useMemo(() => {
    const matching = beforeEmail.filter((podcast) => matchesEmailFilter(podcast, emailFilter))
    if (sort === 'list_order') return matching
    return [...matching].sort((left, right) => {
      if (sort === 'fit_desc') return compareOptionalNumbers(left.fit_score, right.fit_score, 'desc')
      if (sort === 'audience_desc') return compareOptionalNumbers(left.audience_size, right.audience_size, 'desc')
      if (sort === 'audience_asc') return compareOptionalNumbers(left.audience_size, right.audience_size, 'asc')
      if (sort === 'rating_desc') return compareOptionalNumbers(left.itunes_rating, right.itunes_rating, 'desc')
      if (sort === 'rating_asc') return compareOptionalNumbers(left.itunes_rating, right.itunes_rating, 'asc')
      if (sort === 'recent_desc') {
        const leftTimestamp = left.last_posted_at ? Date.parse(left.last_posted_at) : Number.NaN
        const rightTimestamp = right.last_posted_at ? Date.parse(right.last_posted_at) : Number.NaN
        return compareOptionalNumbers(
          Number.isFinite(leftTimestamp) ? leftTimestamp : null,
          Number.isFinite(rightTimestamp) ? rightTimestamp : null,
          'desc',
        )
      }
      return left.podcast_name.localeCompare(right.podcast_name, undefined, { sensitivity: 'base' })
    })
  }, [beforeEmail, emailFilter, sort])
  // A campaign refresh can move a selected podcast out of the active filter.
  useEffect(() => {
    const visibleIds = new Set(filtered.map((podcast) => podcast.podcast_id))
    setSelectedIds((current) => {
      const next = new Set([...current].filter((id) => visibleIds.has(id)))
      return next.size === current.size ? current : next
    })
  }, [filtered])
  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE))
  useEffect(() => setPage((current) => Math.min(current, totalPages)), [totalPages])
  const visiblePage = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE)
  // A new page starts at the top of the list, not wherever the pager left the viewport.
  const goToPage = (next: number) => {
    setPage(next)
    document.getElementById('client-podcast-list')?.scrollIntoView?.({ block: 'start', behavior: 'smooth' })
  }
  const allSelected = filtered.length > 0 && filtered.every((podcast) => selectedIds.has(podcast.podcast_id))
  const toggleSelected = (podcastId: string, checked: boolean) => setSelectedIds((current) => {
    const next = new Set(current)
    if (checked) next.add(podcastId)
    else next.delete(podcastId)
    return next
  })
  const catalogResults = catalogSearchQuery.data || []
  const selectedCatalogPodcasts = Array.from(selectedCatalog.values())

  const refresh = async () => {
    await queryClient.invalidateQueries({ queryKey: shortlistQueryKey })
    onChanged?.()
  }

  const updatePodcast = async (
    podcast: ClientShortlistPodcast,
    changes: Parameters<typeof updateClientShortlistPodcast>[3],
    successMessage: string,
  ) => {
    setPendingPodcastId(podcast.podcast_id)
    try {
      await updateClientShortlistPodcast(workspaceId, clientId, podcast.podcast_id, changes)
      await refresh()
      toast.success(successMessage)
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'The podcast could not be updated.')
    } finally {
      setPendingPodcastId(null)
    }
  }

  const toggleFeatured = async (podcast: ClientShortlistPodcast) => {
    const nextFeatured = !podcast.is_featured
    if (nextFeatured && featured.length >= 6) {
      toast.error('You can feature up to six podcasts. Unfeature one first.')
      return
    }
    await updatePodcast(
      podcast,
      { is_featured: nextFeatured },
      nextFeatured ? `${podcast.podcast_name} added to featured recommendations.` : `${podcast.podcast_name} removed from featured recommendations.`,
    )
  }

  const addSelectedCatalog = async () => {
    if (selectedCatalogPodcasts.length === 0) return
    setIsAdding(true)
    try {
      const result = await addClientShortlistPodcasts(workspaceId, clientId, selectedCatalogPodcasts)
      await Promise.all([
        refresh(),
        queryClient.invalidateQueries({ queryKey: ['client-shortlist-catalog', workspaceId, clientId] }),
      ])
      setSelectedCatalog(new Map())
      if (result.added === 0) {
        toast.info('Those podcasts are already in this client’s history.')
      } else if (result.skipped > 0) {
        toast.success(`Added ${result.added} podcast${result.added === 1 ? '' : 's'} and skipped ${result.skipped} duplicate${result.skipped === 1 ? '' : 's'}.`)
      } else {
        toast.success(`Added ${result.added} podcast${result.added === 1 ? '' : 's'} to ${clientName}’s shortlist.`)
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Podcasts could not be added.')
    } finally {
      setIsAdding(false)
    }
  }

  const confirmArchive = async () => {
    if (!archiveTarget) return
    const target = archiveTarget
    setArchiveTarget(null)
    await updatePodcast(
      target,
      { visibility: 'archived' },
      `${target.podcast_name} archived. Its history will still be used for dedupe.`,
    )
  }

  const openPodcastDetails = (podcast: ClientShortlistPodcast) => {
    setDetailPodcast(podcast)
    setOperatorNotes(podcast.operator_notes || '')
  }

  const saveOperatorNotes = async () => {
    if (!detailPodcast) return
    setIsSavingNotes(true)
    try {
      const updated = await updateClientShortlistPodcast(
        workspaceId,
        clientId,
        detailPodcast.podcast_id,
        { operator_notes: operatorNotes.trim() || null },
      )
      setDetailPodcast(updated)
      setOperatorNotes(updated.operator_notes || '')
      await refresh()
      toast.success('Internal podcast notes saved.')
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Internal notes could not be saved.')
    } finally {
      setIsSavingNotes(false)
    }
  }

  if (shortlistQuery.isLoading) {
    return <Card id="client-podcast-list"><CardContent className="flex min-h-56 items-center justify-center"><Loader2 className="h-7 w-7 animate-spin text-primary" /></CardContent></Card>
  }

  if (shortlistQuery.error) {
    return (
      <Card id="client-podcast-list" className="border-destructive/30">
        <CardHeader><CardTitle>Shortlist unavailable</CardTitle><CardDescription>{shortlistQuery.error instanceof Error ? shortlistQuery.error.message : 'The shortlist could not be loaded.'}</CardDescription></CardHeader>
        <CardContent><Button variant="outline" onClick={() => void shortlistQuery.refetch()}>Try again</Button></CardContent>
      </Card>
    )
  }

  return (
    <section id="client-podcast-list" aria-labelledby="client-podcast-list-heading" className="scroll-mt-6">
      <Card>
        <CardHeader className="space-y-4 border-b bg-muted/20">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <CardTitle id="client-podcast-list-heading" className="flex items-center gap-2 text-xl"><Library className="h-5 w-5 text-primary" />Shortlist</CardTitle>
                <Badge variant="outline" className="border-amber-200 bg-amber-50 text-xs font-medium text-amber-900"><Star className="mr-1 h-3 w-3 fill-current" />Featured {featured.length}<span className="font-normal">&nbsp;/ 6</span></Badge>
              </div>
              <CardDescription className="mt-1 max-w-2xl">Control exactly what {clientName} sees. Archived shows stay in campaign history and weekly dedupe.</CardDescription>
            </div>
            <div className="flex flex-wrap gap-2">
              <DropdownMenu>
                <DropdownMenuTrigger asChild><Button variant="outline"><Plus className="mr-2 h-4 w-4" />Add podcasts<ChevronDown className="ml-2 h-4 w-4" /></Button></DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-56">
                  <DropdownMenuItem asChild><Link to={databaseHref}><Database className="mr-2 h-4 w-4" />Browse database</Link></DropdownMenuItem>
                  <DropdownMenuItem onClick={() => setAddOpen(true)}><ListPlus className="mr-2 h-4 w-4" />Quick add</DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
              <ShortlistFitRunner
                workspaceId={workspaceId}
                clientId={clientId}
                podcasts={podcasts}
                profile={shortlistQuery.data?.fit_profile ?? null}
                byoAi={byoAi}
                onProgress={refresh}
              />
            </div>
          </div>

          {/* The counts are the filter: one row instead of two blocks of stat cards. */}
          <span id="shortlist-inactive-hint" className="sr-only">Shows with no episode in 90 days, or a company’s own feed.</span>
          <div role="group" aria-label="Filter by client decision" className="flex flex-wrap gap-1.5">
            {([
              ['all', 'All', counts.active],
              ['not_reviewed', 'To review', counts.notReviewed],
              ['approved', 'Approved', counts.approved],
              ['rejected', 'Passed', counts.rejected],
              ['weak_fit', 'Weak fit', counts.weakFit],
              ['low_quality', 'Inactive', counts.lowQuality],
              ['archived', 'Archived', counts.archived],
            ] as Array<[ListFilter, string, number]>).map(([value, label, count]) => (
              <button
                key={value}
                type="button"
                aria-pressed={filter === value}
                title={value === 'low_quality' ? 'No episode in 90 days, or a company’s own feed' : undefined}
                aria-describedby={value === 'low_quality' ? 'shortlist-inactive-hint' : undefined}
                onClick={() => setFilter(value)}
                className={cn(
                  'inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2',
                  filter === value ? 'border-primary bg-primary text-primary-foreground' : 'bg-background hover:bg-muted',
                )}
              >
                {label} <span className={cn('tabular-nums font-semibold', filter !== value && 'text-foreground')}>{count}</span>
              </button>
            ))}
          </div>

          <div className="grid gap-2 sm:grid-cols-2 lg:flex lg:flex-wrap lg:items-center">
            <div className="relative sm:col-span-2 lg:w-72"><Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" /><Input value={searchQuery} onChange={(event) => setSearchQuery(event.target.value)} placeholder="Search podcasts or publishers…" aria-label="Search podcasts or publishers" className="pl-9" /></div>
            <select aria-label="Sort podcasts" value={sort} onChange={(event) => setSort(event.target.value as ListSort)} className={SELECT_CLASS}>
              <option value="list_order">Client list order</option>
              <option value="fit_desc">Fit: best first</option>
              <option value="audience_desc">Audience: largest first</option>
              <option value="audience_asc">Audience: smallest first</option>
              <option value="rating_desc">Rating: highest first</option>
              <option value="rating_asc">Rating: lowest first</option>
              <option value="recent_desc">Recently published</option>
              <option value="name_asc">Name: A–Z</option>
            </select>
            <div className="flex gap-2">
              <select aria-label="Filter by fit score" value={fitFilter} onChange={(event) => setFitFilter(event.target.value as FitFilter)} className={cn(SELECT_CLASS, 'flex-1')}>
                <option value="any">Any fit</option>
                <option value="at_least">Fit at least</option>
                <option value="below">Fit below</option>
                <option value="unscored">Not scored</option>
              </select>
              {(fitFilter === 'at_least' || fitFilter === 'below') && (
                <Input type="number" inputMode="decimal" min={1} max={10} step={0.5} value={fitThreshold} onChange={(event) => setFitThreshold(event.target.value)} aria-label="Fit score threshold" className="w-20" />
              )}
            </div>
            <select aria-label="Filter by pitch status" value={pitchFilter} disabled={!pitchDataAvailable} onChange={(event) => setPitchFilter(event.target.value as PitchFilter)} className={SELECT_CLASS}>
              {Object.entries(PITCH_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
            </select>
            <select aria-label="Filter by contact email" value={emailFilter} onChange={(event) => setEmailFilter(event.target.value as EmailFilter)} className={SELECT_CLASS}>
              <option value="any">Any email</option>
              <option value="has">Has email ({emailCounts.has})</option>
              <option value="none">No email ({emailCounts.none})</option>
            </select>
          </div>
        </CardHeader>

        <CardContent className="space-y-3 p-3 sm:p-4">
          <ShortlistResearchBatch pitchHref={id => clientPitchHref(workspaceBaseHref,clientId,id)} workspaceId={workspaceId} clientId={clientId} selectedIds={podcasts.filter(podcast => selectedIds.has(podcast.podcast_id)).map(podcast => podcast.id)} />
          {campaignTargetsQuery.isError && <p role="status" className="text-sm text-muted-foreground">{pitchDataAvailable ? 'Pitch statuses could not be refreshed. Showing last loaded statuses.' : 'Pitch statuses could not be loaded.'} <button type="button" className="underline" onClick={() => void campaignTargetsQuery.refetch()}>Retry</button></p>}
          <ShortlistBulkBar
            workspaceId={workspaceId}
            clientId={clientId}
            selectedIds={Array.from(selectedIds)}
            onClear={() => setSelectedIds(new Set())}
            onSaved={refresh}
          />
          {filtered.length > 0 && (
            <label className="flex w-fit cursor-pointer items-center gap-2 text-sm text-muted-foreground">
              <Checkbox checked={allSelected} onCheckedChange={(checked) => setSelectedIds(checked ? new Set(filtered.map((podcast) => podcast.podcast_id)) : new Set())} aria-label={`Select all ${resultLabel(filtered.length)} in this view`} />
              Select all {resultLabel(filtered.length)} in this view
            </label>
          )}
          {visiblePage.length === 0 ? (
            <div className="rounded-xl border border-dashed p-8 text-center"><Search className="mx-auto h-8 w-8 text-muted-foreground/50" /><p className="mt-2 font-medium">No podcasts match this view</p><p className="text-sm text-muted-foreground">Try a different filter or add podcasts from the catalog.</p></div>
          ) : (
            <ShortlistTable
              podcasts={visiblePage}
              selectedIds={selectedIds}
              onToggle={toggleSelected}
              fitProfile={shortlistQuery.data?.fit_profile ?? null}
              targetsByPodcast={targetsByPodcast}
              pitchDataAvailable={pitchDataAvailable}
              pitchError={campaignTargetsQuery.isError}
              pendingPodcastId={pendingPodcastId}
              workspaceBaseHref={workspaceBaseHref}
              clientId={clientId}
              onOpenDetails={openPodcastDetails}
              onDecision={(podcast, status) => void updatePodcast(podcast, { feedback_status: status }, `${podcast.podcast_name} marked ${status === 'approved' ? 'approved' : 'passed'}.`)}
              onToggleFeatured={(podcast) => void toggleFeatured(podcast)}
              onRestore={(podcast) => void updatePodcast(podcast, { visibility: 'visible' }, `${podcast.podcast_name} restored to the client list.`)}
              onArchive={setArchiveTarget}
              onDelete={setDeleteTarget}
            />
          )}
          <div className="flex flex-col gap-3 pt-1 text-sm text-muted-foreground sm:flex-row sm:items-center sm:justify-between">
            <p>Showing {visiblePage.length} of {resultLabel(filtered.length)}</p>
            {totalPages > 1 && <div className="flex items-center gap-2"><Button variant="outline" size="sm" disabled={page === 1} onClick={() => goToPage(page - 1)}>Previous</Button><span>Page {page} of {totalPages}</span><Button variant="outline" size="sm" disabled={page === totalPages} onClick={() => goToPage(page + 1)}>Next</Button></div>}
          </div>
        </CardContent>
      </Card>
      <Sheet open={Boolean(detailPodcast)} onOpenChange={(open) => !open && setDetailPodcast(null)}>
        <SheetContent className="w-full overflow-y-auto sm:max-w-xl">
          {detailPodcast && (
            <div className="space-y-6">
              <SheetHeader>
                <div className="flex items-start gap-3 pr-8 text-left">
                  <PodcastArtwork podcast={detailPodcast} />
                  <div className="min-w-0"><SheetTitle>{detailPodcast.podcast_name}</SheetTitle><SheetDescription>{detailPodcast.publisher_name || 'Publisher unavailable'}</SheetDescription></div>
                </div>
              </SheetHeader>
              <div className="flex flex-wrap gap-2"><FeedbackBadge podcast={detailPodcast} />{detailPodcast.visibility === 'archived' ? <Badge variant="outline" className="border-slate-200 bg-slate-100 text-slate-700"><Archive className="mr-1 h-3 w-3" />Archived · hidden from client</Badge> : <Badge variant="outline" className="border-sky-200 bg-sky-50 text-sky-800"><Eye className="mr-1 h-3 w-3" />Visible to client</Badge>}{researchStatusLabel(detailPodcast.research_progress) && <Badge variant="outline"><span className="sr-only">Research status: </span>{researchStatusLabel(detailPodcast.research_progress)}</Badge>}{shortlistContactEmail(detailPodcast) && <Badge variant="outline" className="border-emerald-200 bg-emerald-50 text-emerald-800"><MailCheck className="mr-1 h-3 w-3" />{shortlistContactEmail(detailPodcast)}</Badge>}{detailPodcast.is_featured && <Badge className="border-amber-200 bg-amber-50 text-amber-800 hover:bg-amber-50"><Star className="mr-1 h-3 w-3 fill-current" />Featured</Badge>}{detailPodcast.prior_outreach_at && <Badge variant="outline" className="border-sky-200 bg-sky-50 text-sky-800"><MailCheck className="mr-1 h-3 w-3" />Previously contacted</Badge>}</div>
              <div className="grid grid-cols-3 gap-2">
                <div className="rounded-xl border p-3"><p className="text-xs text-muted-foreground">Audience</p><p className="mt-1 font-semibold">{compactNumber(detailPodcast.audience_size)}</p></div>
                <div className="rounded-xl border p-3"><p className="text-xs text-muted-foreground">Rating</p><p className="mt-1 font-semibold">{detailPodcast.itunes_rating ? Number(detailPodcast.itunes_rating).toFixed(1) : '—'}</p></div>
                <div className="rounded-xl border p-3"><p className="text-xs text-muted-foreground">Episodes</p><p className="mt-1 font-semibold">{detailPodcast.episode_count?.toLocaleString() || '—'}</p></div>
              </div>
              <FitDetails podcast={detailPodcast} profile={shortlistQuery.data?.fit_profile ?? null} />
              <section><h4 className="text-sm font-semibold">About this podcast</h4><p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-muted-foreground">{detailPodcast.ai_clean_description || detailPodcast.podcast_description || 'No podcast description is available yet.'}</p></section>
              <section className="rounded-xl border bg-muted/20 p-4"><h4 className="text-sm font-semibold">Client feedback</h4><p className="mt-2 text-sm leading-6 text-muted-foreground">{detailPodcast.feedback_notes || (detailPodcast.feedback_status ? 'The client left a decision without a note.' : 'The client has not reviewed this podcast yet.')}</p></section>
              {detailPodcast.prior_outreach_at && <section className="rounded-xl border border-amber-200 bg-amber-50/70 p-4"><h4 className="flex items-center gap-2 text-sm font-semibold text-amber-950"><MailCheck className="h-4 w-4" />Outreach history</h4><p className="mt-2 text-sm leading-6 text-amber-900/80">This podcast was already handed off for outreach for this client on {formattedDate(detailPodcast.prior_outreach_at)}. You can prepare a re-pitch, but the relationship warning must be reviewed first and any active campaign remains protected.</p></section>}
              <section className="space-y-2"><label htmlFor="podcast-operator-notes" className="text-sm font-semibold">Internal notes</label><Textarea id="podcast-operator-notes" value={operatorNotes} onChange={(event) => setOperatorNotes(event.target.value)} rows={5} maxLength={2_000} placeholder="Add workspace-only context, follow-up ideas, or research notes…" /><p className="text-xs text-muted-foreground">Only workspace managers can see these notes.</p></section>
              <div className="flex flex-col gap-2 sm:flex-row">
                <Button className="flex-1" disabled={isSavingNotes || operatorNotes.trim() === (detailPodcast.operator_notes || '')} onClick={() => void saveOperatorNotes()}>{isSavingNotes && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Save internal notes</Button>
                <PodcastExternalLink url={detailPodcast.podcast_url} name={detailPodcast.podcast_name} />
              </div>
            </div>
          )}
        </SheetContent>
      </Sheet>

      <Sheet open={addOpen} onOpenChange={setAddOpen}>
        <SheetContent className="w-full overflow-y-auto sm:max-w-2xl">
          <SheetHeader><SheetTitle>Add podcasts</SheetTitle><SheetDescription>Search the existing podcast catalog and add shows without leaving this client.</SheetDescription></SheetHeader>
          <div className="mt-6 space-y-5">
            <div className="relative"><Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" /><Input autoFocus value={catalogQuery} onChange={(event) => setCatalogQuery(event.target.value)} placeholder="Search by podcast or publisher…" aria-label="Search the podcast catalog" className="pl-9" /></div>
            {debouncedCatalogQuery.length < 2 ? (
              <div className="rounded-xl border border-dashed p-8 text-center"><Library className="mx-auto h-9 w-9 text-muted-foreground/50" /><p className="mt-3 font-medium">Search the shared podcast catalog</p><p className="text-sm text-muted-foreground">Enter at least two characters to find shows already researched by the platform.</p></div>
            ) : catalogSearchQuery.isLoading ? (
              <div className="flex min-h-40 items-center justify-center"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>
            ) : catalogSearchQuery.error ? (
              <div className="rounded-xl border border-destructive/30 p-5"><p className="font-medium">Catalog search failed</p><p className="text-sm text-muted-foreground">{catalogSearchQuery.error instanceof Error ? catalogSearchQuery.error.message : 'Try again.'}</p></div>
            ) : catalogResults.length === 0 ? (
              <div className="rounded-xl border border-dashed p-8 text-center"><Search className="mx-auto h-8 w-8 text-muted-foreground/50" /><p className="mt-2 font-medium">No catalog matches</p><p className="text-sm text-muted-foreground">Run fresh discovery when the show is not already in the database.</p></div>
            ) : (
              <div className="space-y-2">
                {catalogResults.map((podcast: ClientShortlistCatalogPodcast) => (
                  <label key={podcast.podcast_id} className={cn('flex items-center gap-3 rounded-xl border p-3', podcast.already_added ? 'bg-muted/40 opacity-70' : 'cursor-pointer hover:bg-muted/30')}>
                    <Checkbox checked={selectedCatalog.has(podcast.podcast_id)} disabled={podcast.already_added} onCheckedChange={(checked) => setSelectedCatalog((current) => { const next = new Map(current); if (checked && !podcast.already_added) next.set(podcast.podcast_id, podcast); else next.delete(podcast.podcast_id); return next })} aria-label={`Select ${podcast.podcast_name}`} />
                    <div className="flex h-11 w-11 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-muted">{podcast.podcast_image_url ? <img src={podcast.podcast_image_url} alt="" className="h-full w-full object-cover" /> : <Radio className="h-5 w-5 text-muted-foreground" />}</div>
                    <div className="min-w-0 flex-1"><p className="truncate font-medium">{podcast.podcast_name}</p><p className="truncate text-xs text-muted-foreground">{podcast.publisher_name || 'Publisher unavailable'} · {compactNumber(podcast.audience_size)} estimated listeners</p></div>
                    {podcast.already_added && <Badge variant="outline">{podcast.existing_visibility === 'archived' ? 'Archived' : 'Already added'}</Badge>}
                  </label>
                ))}
              </div>
            )}
            <div className="sticky bottom-0 space-y-3 border-t bg-background pt-4">
              <Button className="w-full" disabled={selectedCatalogPodcasts.length === 0 || isAdding} onClick={() => void addSelectedCatalog()}>{isAdding ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <ListPlus className="mr-2 h-4 w-4" />}Add {selectedCatalogPodcasts.length || ''} selected</Button>
              <Button asChild variant="outline" className="w-full"><Link to={databaseHref}>Browse with filters<Database className="ml-2 h-3.5 w-3.5" /></Link></Button>
              <Button asChild variant="outline" className="w-full"><Link to={finderHref}>Run fresh weekly discovery<ExternalLink className="ml-2 h-3.5 w-3.5" /></Link></Button>
            </div>
          </div>
        </SheetContent>
      </Sheet>

      <ShortlistDeleteDialog
        open={Boolean(deleteTarget)}
        onOpenChange={(open) => { if (!open) setDeleteTarget(null) }}
        workspaceId={workspaceId}
        clientId={clientId}
        podcastIds={deleteTarget ? [deleteTarget.podcast_id] : []}
        podcastName={deleteTarget?.podcast_name}
        onDeleted={refresh}
      />

      <AlertDialog open={Boolean(archiveTarget)} onOpenChange={(open) => !open && setArchiveTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader><AlertDialogTitle>Archive this podcast?</AlertDialogTitle><AlertDialogDescription>{archiveTarget?.podcast_name} will disappear from the client dashboard, but its decisions and campaign history remain available for dedupe. You can restore it later.</AlertDialogDescription></AlertDialogHeader>
          <AlertDialogFooter><AlertDialogCancel>Keep podcast</AlertDialogCancel><AlertDialogAction className="bg-destructive text-destructive-foreground hover:bg-destructive/90" onClick={() => void confirmArchive()}>Archive podcast</AlertDialogAction></AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </section>
  )
}
