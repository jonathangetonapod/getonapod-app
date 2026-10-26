import { useEffect, useMemo, useRef, useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Link, useSearchParams } from 'react-router-dom'
import {
  ArrowLeft,
  Database,
  Info,
  Plus,
  Search,
  X,
} from 'lucide-react'
import { toast } from 'sonner'
import { useAuth } from '@/contexts/AuthContext'
import { WorkspaceLayout, type PlatformWorkspaceConfig } from '@/components/workspace/WorkspaceLayout'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'
import { PodcastCatalogCard } from '@/components/workspace/catalog/PodcastCatalogCard'
import { PodcastCatalogPagination } from '@/components/workspace/catalog/PodcastCatalogPagination'
import { PodcastCatalogRow, PodcastCatalogRowHeader, PodcastCatalogRowSkeleton } from '@/components/workspace/catalog/PodcastCatalogRow'
import { PodcastCatalogSearchPanel } from '@/components/workspace/catalog/PodcastCatalogSearchPanel'
import { PodcastResultsHeader, type CatalogView } from '@/components/workspace/catalog/PodcastResultsHeader'
import type { PodcastResultProps } from '@/components/workspace/catalog/podcastResult'
import { PodcastAddDialog } from '@/components/workspace/catalog/PodcastAddDialog'
import type { PodcastPrimaryActionState } from '@/components/workspace/catalog/PodcastPrimaryAction'
import { PodcastSelectionBar } from '@/components/workspace/catalog/PodcastSelectionBar'
import { useDeferredShortlistAdd } from '@/hooks/useDeferredShortlistAdd'
import { CLEAR_ALL_FILTERS, usePodcastCatalogParams } from '@/hooks/usePodcastCatalogParams'
import { captureException } from '@/lib/sentry'
import { getClientShortlist } from '@/services/clientShortlist'
import { getWorkspaceClients } from '@/services/clients'
import {
  getWorkspacePodcastCatalog,
  type WorkspacePodcastCatalogItem,
} from '@/services/workspacePodcastCatalog'
import { PodcastCatalogDetailsDialog } from '@/components/workspace/PodcastCatalogDetailsDialog'
import { relationshipBadge } from '@/lib/relationshipLabels'
import { listHostRelationships } from '@/services/hostRelationships'
import { MY_WORKSPACE_BASE_HREF, selectedWorkspaceBaseHref } from '@/lib/workspaceRoutes'
import { readWorkingClient } from '@/lib/workingClient'
import { shortClientName } from '@/lib/podcastCatalogDisplay'

const VIEW_STORAGE_KEY = 'podcastDb.view'
const CLIENT_HINT_STORAGE_KEY = 'podcastDb.clientHintDismissed'

function readStoredFlag(key: string): boolean {
  try {
    return window.localStorage.getItem(key) === '1'
  } catch {
    return false
  }
}

function readStoredView(): CatalogView {
  try {
    return window.localStorage.getItem(VIEW_STORAGE_KEY) === 'cards' ? 'cards' : 'list'
  } catch {
    return 'list'
  }
}
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

interface WorkspacePodcastDatabaseProps {
  platformWorkspaceId?: string
}

const WorkspacePodcastDatabase = ({ platformWorkspaceId }: WorkspacePodcastDatabaseProps) => {
  const [searchParams, setSearchParams] = useSearchParams()
  const { isPlatformAdmin, membership, user, workspace } = useAuth()
  const isPlatformWorkspace = platformWorkspaceId !== undefined
  const selectedWorkspaceId = (platformWorkspaceId || '').toLowerCase()
  const workspaceId = (isPlatformWorkspace ? selectedWorkspaceId : workspace?.id || '').toLowerCase()
  const validWorkspaceId = UUID_PATTERN.test(workspaceId)
  const baseHref = isPlatformWorkspace
    ? selectedWorkspaceBaseHref(selectedWorkspaceId)
    : MY_WORKSPACE_BASE_HREF
  const canAddToClient = isPlatformWorkspace
    || isPlatformAdmin
    || membership?.role === 'owner'
    || membership?.role === 'admin'
  const requestedClientId = (searchParams.get('client') || '').toLowerCase()
  const targetClientId = UUID_PATTERN.test(requestedClientId) ? requestedClientId : ''

  /*
   * Arriving with no ?client= while this person last worked on a client: open
   * on that client, so the adds stay one click. Read during the first render,
   * because the layout clears the remembered client in its own effect when the
   * address names none. All clients in the header clears it for good.
   */
  const [rememberedClientId] = useState(() => (targetClientId ? null : readWorkingClient(workspaceId, user?.id)))
  useEffect(() => {
    if (!rememberedClientId) return
    setSearchParams((current) => {
      if (current.get('client')) return current
      const params = new URLSearchParams(current)
      params.set('client', rememberedClientId)
      return params
    }, { replace: true })
  }, [rememberedClientId, setSearchParams])

  const queryClient = useQueryClient()
  const { params, update } = usePodcastCatalogParams()
  const { search, category, contact, activity, audience, sort, page, pageSize } = params
  const resultsRef = useRef<HTMLDivElement>(null)
  const [selectedPodcasts, setSelectedPodcasts] = useState<Map<string, WorkspacePodcastCatalogItem>>(new Map())
  const [addDialogOpen, setAddDialogOpen] = useState(false)
  // What the add dialog is adding: the bulk selection, or the one show whose
  // button opened it.
  const [dialogPodcasts, setDialogPodcasts] = useState<WorkspacePodcastCatalogItem[]>([])
  const [view, setView] = useState<CatalogView>(readStoredView)
  const [clientHintDismissed, setClientHintDismissed] = useState(() => readStoredFlag(CLIENT_HINT_STORAGE_KEY))
  const [detailsPodcast, setDetailsPodcast] = useState<WorkspacePodcastCatalogItem | null>(null)

  const catalogQuery = useQuery({
    queryKey: [
      'workspace-podcast-catalog',
      user?.id || 'unknown',
      workspaceId,
      search,
      category,
      contact,
      activity,
      audience,
      sort,
      page,
      pageSize,
    ],
    queryFn: () => getWorkspacePodcastCatalog(workspaceId, {
      search,
      category: category === 'all' ? undefined : category,
      contact,
      activity,
      audience,
      sort,
      page,
      pageSize,
    }),
    enabled: validWorkspaceId,
    retry: false,
    // Catalogue rows change when somebody adds a show, not continuously, so a
    // few minutes of staleness costs nothing and makes going back to a page
    // already seen instant rather than another round trip.
    staleTime: 5 * 60_000,
    placeholderData: (previousData) => previousData,
  })

  /**
   * Fetch the next page while this one is being read.
   *
   * Paging is the one move an operator makes without thinking, and every Next
   * used to wait on a round trip. The request is identical to the one the click
   * would make, so it lands in the same cache slot and the click resolves from
   * memory. Skipped on the last page and while the current one is still in
   * flight, so it never competes with the request somebody is waiting on.
   */
  const totalPages = catalogQuery.data?.pagination.total_pages ?? 1
  useEffect(() => {
    if (!validWorkspaceId || catalogQuery.isFetching || page >= totalPages) return
    const nextPage = page + 1
    void queryClient.prefetchQuery({
      queryKey: [
        'workspace-podcast-catalog',
        user?.id || 'unknown',
        workspaceId,
        search,
        category,
        contact,
        activity,
        audience,
        sort,
        nextPage,
        pageSize,
      ],
      queryFn: () => getWorkspacePodcastCatalog(workspaceId, {
        search,
        category: category === 'all' ? undefined : category,
        contact,
        activity,
        audience,
        sort,
        page: nextPage,
        pageSize,
      }),
      staleTime: 5 * 60_000,
    })
  }, [
    queryClient, validWorkspaceId, catalogQuery.isFetching, page, totalPages,
    user?.id, workspaceId, search, category, contact, activity, audience, sort, pageSize,
  ])

  // A failed load is shown to the person and reported, not only shown.
  useEffect(() => {
    if (!catalogQuery.error) return
    console.error('[Podcast Database] Catalog load failed', catalogQuery.error)
    captureException(catalogQuery.error instanceof Error ? catalogQuery.error : new Error(String(catalogQuery.error)))
  }, [catalogQuery.error])

  /**
   * History with these hosts, so the catalogue is not read cold.
   *
   * The same podcast is a row in the database and a relationship in the book,
   * keyed by the same podcast_id — but only the book knew that this host had
   * already passed, or was mid conversation, or had been marked do not
   * contact. Someone building a shortlist saw none of it and could pitch a
   * host the workspace had already burned.
   *
   * One list for the workspace rather than a lookup per card, and a failure
   * leaves the catalogue exactly as it was rather than blocking it.
   */
  const relationshipsQuery = useQuery({
    queryKey: ['workspace-host-relationships', workspaceId, 'catalog-labels'],
    queryFn: () => listHostRelationships(workspaceId),
    enabled: Boolean(workspaceId),
    staleTime: 60_000,
    retry: false,
  })
  const relationshipsByPodcastId = useMemo(() => {
    const index = new Map<string, ReturnType<typeof relationshipBadge>>()
    for (const row of relationshipsQuery.data ?? []) {
      const badge = relationshipBadge(row)
      if (badge) index.set(row.podcast_id, badge)
    }
    return index
  }, [relationshipsQuery.data])

  const clientsQuery = useQuery({
    queryKey: ['workspace-podcast-catalog', user?.id || 'unknown', workspaceId, 'clients'],
    queryFn: () => getWorkspaceClients(workspaceId),
    enabled: validWorkspaceId && canAddToClient,
    retry: false,
  })

  /*
   * What the working client already has, so a show they have reads On
   * shortlist instead of offering an add the server would only skip. One read
   * per client, not one per row.
   */
  const shortlistQuery = useQuery({
    queryKey: ['workspace-client-shortlist', workspaceId, targetClientId, 'catalog-ids'],
    queryFn: () => getClientShortlist(workspaceId, targetClientId),
    enabled: validWorkspaceId && canAddToClient && Boolean(targetClientId),
    staleTime: 60_000,
    retry: false,
  })
  const shortlistIds = useMemo(
    () => new Set((shortlistQuery.data?.podcasts || []).map((podcast) => podcast.podcast_id)),
    [shortlistQuery.data],
  )

  const shortlistAdd = useDeferredShortlistAdd({
    workspaceId,
    onCommitted: (clientId) => {
      void queryClient.invalidateQueries({ queryKey: ['workspace-client-shortlist', workspaceId, clientId] })
      // Shortlist counts on the rows include this add now.
      void queryClient.invalidateQueries({ queryKey: ['workspace-podcast-catalog', user?.id || 'unknown', workspaceId] })
    },
  })

  const catalog = catalogQuery.data
  const podcasts = catalog?.items || []
  const activeClients = (clientsQuery.data || []).filter((client) => client.status === 'active')
  // Any client, not only active ones: the header can open this page on a
  // paused client by address, and the buttons have to name who that is.
  const targetClient = (clientsQuery.data || []).find((client) => client.id === targetClientId) || null
  const pagePodcastIds = podcasts.map((podcast) => podcast.podcast_id)
  const allPageSelected = pagePodcastIds.length > 0
    && pagePodcastIds.every((podcastId) => selectedPodcasts.has(podcastId))
  const platformWorkspace: PlatformWorkspaceConfig | undefined = isPlatformWorkspace
    ? {
        workspaceId,
        workspaceName: catalog?.workspace.name || 'Client workspace',
        logoUrl: null,
        baseHref,
      }
    : undefined

  const togglePodcast = (podcast: WorkspacePodcastCatalogItem, checked: boolean) => {
    setSelectedPodcasts((current) => {
      const next = new Map(current)
      if (checked) next.set(podcast.podcast_id, podcast)
      else next.delete(podcast.podcast_id)
      return next
    })
  }

  const togglePage = (checked: boolean) => {
    setSelectedPodcasts((current) => {
      const next = new Map(current)
      podcasts.forEach((podcast) => {
        if (checked) next.set(podcast.podcast_id, podcast)
        else next.delete(podcast.podcast_id)
      })
      return next
    })
  }

  const openAddDialog = (podcastsToAdd: WorkspacePodcastCatalogItem[]) => {
    setDialogPodcasts(podcastsToAdd)
    setAddDialogOpen(true)
  }

  const dropFromSelection = (added: WorkspacePodcastCatalogItem[]) => {
    setSelectedPodcasts((current) => {
      const next = new Map(current)
      added.forEach((podcast) => next.delete(podcast.podcast_id))
      return next
    })
  }

  /** Add to the working client, leaving out what they already have. */
  const addToWorkingClient = (podcastsToAdd: WorkspacePodcastCatalogItem[]) => {
    if (!targetClient) return
    shortlistAdd.add(
      { id: targetClient.id, name: targetClient.name },
      podcastsToAdd,
      podcastsToAdd.filter((podcast) => shortlistIds.has(podcast.podcast_id)),
    )
  }

  const addSelection = () => {
    const chosen = Array.from(selectedPodcasts.values())
    if (targetClient) {
      addToWorkingClient(chosen)
      dropFromSelection(chosen)
    } else {
      openAddDialog(chosen)
    }
  }

  /*
   * One answer for every surface, from the header's working client: a one
   * click add when one is chosen, the client picker when it is All clients.
   */
  const primaryAction = (podcast: WorkspacePodcastCatalogItem): PodcastPrimaryActionState => {
    if (!canAddToClient) return { kind: 'details', onOpen: () => setDetailsPodcast(podcast) }
    if (targetClient) {
      if (shortlistAdd.isAdded(targetClient.id, podcast.podcast_id)) return { kind: 'added' }
      if (shortlistIds.has(podcast.podcast_id)) return { kind: 'on-shortlist', clientName: targetClient.name }
      return {
        kind: 'add',
        label: `Add to ${shortClientName(targetClient.name)}`,
        onAdd: () => addToWorkingClient([podcast]),
      }
    }
    if (shortlistAdd.isAddedAnywhere(podcast.podcast_id)) return { kind: 'added' }
    return { kind: 'add', label: 'Add to client', onAdd: () => openAddDialog([podcast]) }
  }

  const dismissClientHint = () => {
    setClientHintDismissed(true)
    try {
      window.localStorage.setItem(CLIENT_HINT_STORAGE_KEY, '1')
    } catch {
      // Dismissed for this visit when storage is unavailable.
    }
  }

  const changeView = (next: CatalogView) => {
    setView(next)
    try {
      window.localStorage.setItem(VIEW_STORAGE_KEY, next)
    } catch {
      // The choice still applies for this visit when storage is unavailable.
    }
  }

  const resultProps = (podcast: WorkspacePodcastCatalogItem): PodcastResultProps => ({
    podcast,
    relationship: relationshipsByPodcastId.get(podcast.podcast_id) ?? null,
    selectable: canAddToClient,
    selected: selectedPodcasts.has(podcast.podcast_id),
    onSelectedChange: (checked) => togglePodcast(podcast, checked),
    action: primaryAction(podcast),
    onOpenDetails: () => setDetailsPodcast(podcast),
    onCopyEmail: (email) => void copyEmail(email),
  })

  /** Page changes keep the reader in the results, not at the top of the document. */
  const goToPage = (next: number) => {
    update({ page: next })
    resultsRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }

  const total = catalog?.pagination.total ?? 0
  const totalPagesShown = Math.max(1, catalog?.pagination.total_pages ?? 1)
  const pageFrom = total === 0 ? 0 : (page - 1) * pageSize + 1
  const pageTo = Math.min(total, (page - 1) * pageSize + podcasts.length)
  // Paging keeps the page that was there and dims it; skeletons are for the first load only.
  const refreshing = catalogQuery.isFetching && catalogQuery.isPlaceholderData
  const pagination = (position: 'top' | 'bottom') => (
    <PodcastCatalogPagination
      position={position}
      page={page}
      totalPages={totalPagesShown}
      pageSize={pageSize}
      disabled={catalogQuery.isLoading}
      onPage={goToPage}
      onPageSize={(size) => update({ pageSize: size })}
    />
  )

  const copyEmail = async (email: string) => {
    try {
      await navigator.clipboard.writeText(email)
      toast.success('Email copied.')
    } catch {
      toast.error('The email could not be copied.')
    }
  }

  if (!validWorkspaceId) {
    return (
      <WorkspaceLayout platformWorkspace={platformWorkspace}>
        <Card>
          <CardHeader>
            <CardTitle>Workspace unavailable</CardTitle>
            <CardDescription>Your account does not have an active workspace.</CardDescription>
          </CardHeader>
        </Card>
      </WorkspaceLayout>
    )
  }

  return (
    <WorkspaceLayout platformWorkspace={platformWorkspace}>
      <TooltipProvider delayDuration={200}>
      <div className={`space-y-6 ${selectedPodcasts.size > 0 ? 'pb-20' : ''}`}>
        {/* What is shared and what is not is worth knowing once, not reading
            on every visit, so it sits behind the info button. */}
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex min-w-0 items-center gap-1.5">
            <h1 className="text-2xl font-bold tracking-tight">Podcast Database</h1>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button type="button" variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground" aria-label="What is shared">
                  <Info className="h-4 w-4" aria-hidden="true" />
                </Button>
              </TooltipTrigger>
              <TooltipContent className="max-w-xs">
                Show details and public emails are shared across all workspaces. Client notes and campaign data stay private.
              </TooltipContent>
            </Tooltip>
          </div>
          <Button asChild size="sm" className="shrink-0">
            <Link to={`${baseHref}/podcast-finder`}>
              <Plus className="mr-2 h-4 w-4" />Find new podcasts
            </Link>
          </Button>
        </div>

        {targetClient && (
          <div className="flex flex-col gap-3 rounded-xl border border-primary/20 bg-primary/[0.035] p-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="font-semibold">Browsing for {targetClient.name}</p>
              <p className="mt-1 text-sm text-muted-foreground">Select podcasts here and they’ll be ready to add to this client’s shortlist.</p>
            </div>
            <Button asChild variant="outline" size="sm" className="shrink-0">
              <Link to={`${baseHref}/clients/${encodeURIComponent(targetClient.id)}`}><ArrowLeft className="mr-2 h-4 w-4" />Back to client</Link>
            </Button>
          </div>
        )}

        <PodcastCatalogSearchPanel
          params={params}
          update={update}
          categories={catalog?.categories || []}
          searching={catalogQuery.isFetching}
        />

        {canAddToClient && !targetClientId && !rememberedClientId && !clientHintDismissed && (
          <div className="flex items-center justify-between gap-3 rounded-lg border border-primary/20 bg-primary/[0.035] px-3 py-2 text-sm">
            <p>Pick a client in the top bar to add shows with one click.</p>
            <Button type="button" variant="ghost" size="icon" className="h-7 w-7 shrink-0" aria-label="Dismiss" onClick={dismissClientHint}>
              <X className="h-4 w-4" aria-hidden="true" />
            </Button>
          </div>
        )}

        <div ref={resultsRef} className="scroll-mt-24 space-y-3">
          <PodcastResultsHeader
            selectable={canAddToClient}
            allPageSelected={allPageSelected}
            onTogglePage={togglePage}
            from={pageFrom}
            to={pageTo}
            total={total}
            loading={catalogQuery.isLoading}
            catalogUpdated={catalog?.summary.catalog_refreshed_at ?? null}
            fetching={catalogQuery.isFetching}
            onRefresh={() => void catalogQuery.refetch()}
            view={view}
            onViewChange={changeView}
            sort={sort}
            onSortChange={(next) => update({ sort: next })}
          />

          {catalogQuery.isLoading ? (
            view === 'list' ? (
              <Card className="overflow-hidden" aria-busy="true" aria-label="Loading podcasts">
                <PodcastCatalogRowHeader selectable={canAddToClient} />
                <div className="divide-y">{Array.from({ length: 10 }, (_, index) => <PodcastCatalogRowSkeleton key={index} />)}</div>
              </Card>
            ) : (
              <div className="grid gap-4 xl:grid-cols-2" aria-busy="true" aria-label="Loading podcasts">
                {Array.from({ length: 6 }, (_, index) => <Skeleton key={index} className="h-60 rounded-xl" />)}
              </div>
            )
          ) : catalogQuery.error && !catalog ? (
            <Card>
              <CardContent className="flex min-h-64 flex-col items-center justify-center gap-3 p-8 text-center">
                <Database className="h-10 w-10 text-muted-foreground" aria-hidden="true" />
                <p className="font-semibold">Couldn't load the catalog. Try again.</p>
                <Button variant="outline" onClick={() => void catalogQuery.refetch()}>Retry</Button>
              </CardContent>
            </Card>
          ) : podcasts.length === 0 ? (
            <Card>
              <CardContent className="flex min-h-64 flex-col items-center justify-center gap-3 p-8 text-center">
                <Search className="h-10 w-10 text-muted-foreground" aria-hidden="true" />
                <p className="font-semibold">No shows match these filters.</p>
                <div className="flex flex-wrap justify-center gap-2">
                  <Button variant="outline" onClick={() => update(CLEAR_ALL_FILTERS)}>Clear all filters</Button>
                  <Button asChild variant="ghost"><Link to={`${baseHref}/podcast-finder`}>Not finding it? Open Finder</Link></Button>
                </div>
              </CardContent>
            </Card>
          ) : (
            <>
              {totalPagesShown > 1 && pagination('top')}
              {catalogQuery.error && (
                <div className="flex items-center justify-between gap-3 rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive">
                  Couldn't load the catalog. Try again.
                  <Button variant="outline" size="sm" onClick={() => void catalogQuery.refetch()}>Retry</Button>
                </div>
              )}
              <div className={refreshing ? 'pointer-events-none opacity-60 transition-opacity' : 'transition-opacity'} aria-busy={refreshing}>
                {view === 'list' ? (
                  <Card className="overflow-hidden">
                    <PodcastCatalogRowHeader selectable={canAddToClient} />
                    <ul className="divide-y">
                      {podcasts.map((podcast) => <PodcastCatalogRow key={podcast.podcast_id} {...resultProps(podcast)} />)}
                    </ul>
                  </Card>
                ) : (
                  <div className="grid gap-4 xl:grid-cols-2">
                    {podcasts.map((podcast) => <PodcastCatalogCard key={podcast.podcast_id} {...resultProps(podcast)} />)}
                  </div>
                )}
              </div>
              {totalPagesShown > 1 && pagination('bottom')}
            </>
          )}
        </div>
      </div>

      {canAddToClient && (
        <>
          <PodcastSelectionBar
            count={selectedPodcasts.size}
            clientShortName={targetClient ? shortClientName(targetClient.name) : null}
            onClear={() => setSelectedPodcasts(new Map())}
            onAdd={addSelection}
            onAddElsewhere={targetClient ? () => openAddDialog(Array.from(selectedPodcasts.values())) : undefined}
          />
          <PodcastAddDialog
            open={addDialogOpen}
            onOpenChange={setAddDialogOpen}
            workspaceId={workspaceId}
            userId={user?.id || 'unknown'}
            podcasts={dialogPodcasts}
            clients={activeClients}
            clientsLoading={clientsQuery.isLoading}
            clientsError={clientsQuery.error}
            defaultClientId={targetClientId}
            onAddToClient={(client, podcastsToAdd) => {
              shortlistAdd.add(client, podcastsToAdd, client.id === targetClientId
                ? podcastsToAdd.filter((podcast) => shortlistIds.has(podcast.podcast_id))
                : [])
              dropFromSelection(podcastsToAdd)
            }}
            onProspectAdded={(added) => {
              dropFromSelection(added)
              void catalogQuery.refetch()
            }}
          />
        </>
      )}

      <PodcastCatalogDetailsDialog
        podcast={detailsPodcast}
        relationship={detailsPodcast ? relationshipsByPodcastId.get(detailsPodcast.podcast_id) ?? null : null}
        onClose={() => setDetailsPodcast(null)}
        // Members without add rights already see See details; it would only reopen this.
        action={detailsPodcast && canAddToClient ? primaryAction(detailsPodcast) : undefined}
        onCopyEmail={(email) => void copyEmail(email)}
      />
      </TooltipProvider>
    </WorkspaceLayout>
  )
}

export default WorkspacePodcastDatabase
