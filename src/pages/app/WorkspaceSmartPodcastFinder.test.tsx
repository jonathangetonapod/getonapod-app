import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { MemoryRouter, useLocation } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { toast } from 'sonner'
import WorkspaceSmartPodcastFinder from '@/pages/app/WorkspaceSmartPodcastFinder'
import { getWorkspaceClients, getWorkspaceResearchContext } from '@/services/clients'
import { getAdminWorkspaceView } from '@/services/adminWorkspaces'
import { generatePodcastQueries, ProfileTooThinError, StrategyGenerationError } from '@/services/queryGeneration'
import { searchPodcastsWithMeta } from '@/services/podscan'
import { scoreCompatibilityBatch } from '@/services/compatibilityScoring'
import { addClientShortlistPodcasts, searchClientPodcastCatalog } from '@/services/clientShortlist'
import { getWorkspaceBillingOverview } from '@/services/workspaceStaff'
import { getFinderScan, listFinderScans, saveFinderScan } from '@/services/finderScans'
import { writeWorkingClient } from '@/lib/workingClient'

vi.mock('@/contexts/AuthContext', () => ({
  useAuth: () => ({
    user: { id: 'user-1', email: 'owner@example.com' },
    workspace: { id: '11111111-1111-4111-8111-111111111111', name: 'Agency One' },
    membership: { role: 'owner' },
    platformAdmin: false,
    loading: false,
    signOut: vi.fn(),
  }),
}))
vi.mock('@/components/workspace/WorkspaceLayout', () => ({
  WorkspaceLayout: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}))
vi.mock('@/services/clients', () => ({
  getWorkspaceClients: vi.fn(),
  getWorkspaceResearchContext: vi.fn(),
}))
vi.mock('@/services/adminWorkspaces', () => ({ getAdminWorkspaceView: vi.fn(), listPodcastResearchWorkspaces: vi.fn(async () => []) }))
vi.mock('@/services/queryGeneration', async (importOriginal) => ({
  ...await importOriginal<typeof import('@/services/queryGeneration')>(),
  generatePodcastQueries: vi.fn(),
}))
vi.mock('@/services/podscan', async (importOriginal) => ({
  ...await importOriginal<typeof import('@/services/podscan')>(),
  searchPodcastsWithMeta: vi.fn(),
}))
vi.mock('@/services/compatibilityScoring', async (importOriginal) => ({
  ...await importOriginal<typeof import('@/services/compatibilityScoring')>(),
  scoreCompatibilityBatch: vi.fn(),
}))
vi.mock('@/services/clientShortlist', () => ({ addClientShortlistPodcasts: vi.fn(), searchClientPodcastCatalog: vi.fn() }))
vi.mock('@/services/workspaceStaff', () => ({ getWorkspaceBillingOverview: vi.fn() }))
vi.mock('@/services/finderScans', () => ({ saveFinderScan: vi.fn(), listFinderScans: vi.fn(), getFinderScan: vi.fn() }))
vi.mock('sonner', () => ({ toast: { error: vi.fn(), info: vi.fn(), success: vi.fn(), warning: vi.fn() } }))

const workspaceId = '11111111-1111-4111-8111-111111111111'
const clientId = '22222222-2222-4222-8222-222222222222'
// Deliberately not the workspace in AuthContext above: in the platform view the
// viewer's own workspace is never the one on screen.
const viewedWorkspaceId = '99999999-9999-4999-8999-999999999999'
// Relative to today: a fixed date ages out of the finder's 90-day recency
// filter, and the catalog match then silently drops out of every scan.
const recentDate = (daysAgo: number) => new Date(Date.now() - daysAgo * 86_400_000).toISOString().slice(0, 10)

function mockViewedWorkspace() {
  vi.mocked(getAdminWorkspaceView).mockResolvedValue({
    workspace: { id: viewedWorkspaceId, name: 'Viewed Workspace', logo_path: null, logo_updated_at: null },
    clients: [],
  } as never)
}

function podcast(id: string, name: string) {
  return {
    podcast_id: id,
    podcast_name: name,
    podcast_url: `https://example.com/${id}`,
    podcast_description: `${name} description`,
    episode_count: 100,
    last_posted_at: recentDate(3),
    reach: { audience_size: 12_000 },
    podcast_categories: [{ category_id: 'business', category_name: 'Business' }],
  }
}

const LocationProbe = () => {
  const location = useLocation()
  return <output data-testid="location">{`${location.pathname}${location.search}`}</output>
}

function renderFinder(
  initialEntry = `/app/podcast-finder?client=${clientId}`,
  platformWorkspaceId?: string,
) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={[initialEntry]} future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
        <WorkspaceSmartPodcastFinder platformWorkspaceId={platformWorkspaceId} />
        <LocationProbe />
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

// The search settings start collapsed; tests that change them open the panel.
function openFilters() {
  fireEvent.click(screen.getByRole('button', { name: /Edit filters/ }))
}

describe('WorkspaceSmartPodcastFinder', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    window.localStorage.clear()
    window.sessionStorage.clear()
    vi.mocked(getWorkspaceBillingOverview).mockResolvedValue({ balance: 200, enforcement_enabled: true, monthly_credit_allowance: 500 } as never)
    vi.mocked(listFinderScans).mockResolvedValue([])
    vi.mocked(saveFinderScan).mockResolvedValue({ id: 'scan-new' } as never)
    vi.mocked(getWorkspaceClients).mockResolvedValue([
      {
        id: clientId,
        workspace_id: workspaceId,
        name: 'Taylor Client',
        email: null,
        contact_person: null,
        linkedin_url: null,
        website: null,
        status: 'active',
        notes: null,
        created_at: '2026-07-01T00:00:00.000Z',
        updated_at: '2026-07-01T00:00:00.000Z',
      },
    ])
    vi.mocked(getWorkspaceResearchContext).mockResolvedValue({
      workspace: { id: workspaceId, name: 'Agency One', slug: null, status: 'active', is_default: false, logo_path: null, logo_updated_at: null },
      client: {
        id: clientId,
        workspace_id: workspaceId,
        name: 'Taylor Client',
        email: null,
        website: null,
        status: 'active',
        bio: 'Taylor helps founders scale.',
        photo_url: null,
        updated_at: '2026-07-01T00:00:00.000Z',
      },
      existing_podcast_ids: ['pd-existing'],
    })
    vi.mocked(generatePodcastQueries).mockResolvedValue(['founder stories'])
    vi.mocked(searchPodcastsWithMeta).mockResolvedValue({
      data: {
        podcasts: [
          podcast('pd-low', 'Low Fit Weekly'),
          podcast('pd-high', 'Founder Stories'),
          podcast('pd-existing', 'Already Listed'),
        ],
        pagination: { last_page: '1' },
      },
      rateLimit: {},
    } as never)
    vi.mocked(scoreCompatibilityBatch).mockResolvedValue([
      // The endpoint's real contract is a 1-10 score. The page normalizes it
      // to 0-100 for display ("92 fit") and stores /10 (9.2) on the shortlist.
      { podcast_id: 'pd-high', score: 9.2, reasoning: 'Perfect audience overlap.' },
      { podcast_id: 'pd-catalog', score: 8.8, reasoning: 'Strong database match.' },
      { podcast_id: 'pd-low', score: 4.1, reasoning: 'Weak topical match.' },
    ])
    vi.mocked(addClientShortlistPodcasts).mockResolvedValue({ added: 2, skipped: 0, podcast_ids: ['pd-high', 'pd-low'] })
    vi.mocked(searchClientPodcastCatalog).mockResolvedValue([
      {
        podcast_id: 'pd-catalog',
        podcast_name: 'Catalog Growth Show',
        podcast_description: 'From the shared database.',
        podcast_image_url: null,
        podcast_url: null,
        publisher_name: null,
        itunes_rating: null,
        episode_count: 80,
        audience_size: 9_000,
        last_posted_at: recentDate(5),
        podcast_categories: null,
        language: 'en',
        region: null,
        podcast_email: null,
        rss_feed: null,
        already_added: false,
        existing_visibility: null,
      },
    ] as never)
  })

  /*
   * The Smart Finder had no platform view at all — the platform address for
   * this module resolved to the advanced finder — so an agency's own people and
   * the operator viewing them got different pages from the same sidebar item.
   * Reachable now, and scoped to the workspace on screen rather than the one in
   * AuthContext, which is always the viewer's own.
   */
  it('reads the viewed workspace when a platform admin opens it, not their own', async () => {
    mockViewedWorkspace()

    renderFinder(
      `/app/workspaces/${viewedWorkspaceId}/podcast-finder?client=${clientId}`,
      viewedWorkspaceId,
    )

    await waitFor(() => expect(vi.mocked(getWorkspaceClients)).toHaveBeenCalledWith(viewedWorkspaceId))
    expect(vi.mocked(getWorkspaceClients)).not.toHaveBeenCalledWith(workspaceId)
  })

  /*
   * The client list is only half of what the page reads. The research context
   * carries the bio the AI matches against and the ids already on the client's
   * list, so asking the viewer's own workspace for it would either fail or
   * answer about a different agency's client. And ?client= is how every other
   * module hands a client to this one, so the platform view has to honour it
   * too or the operator arrives at an empty chooser.
   */
  it('reads the research context from the viewed workspace, and still honours ?client=', async () => {
    mockViewedWorkspace()

    renderFinder(
      `/app/workspaces/${viewedWorkspaceId}/podcast-finder?client=${clientId}`,
      viewedWorkspaceId,
    )

    // The client arrived from the URL: the scan button already names them.
    // The cost is under the button: up to six queries of three index pages
    // (18 lookups), five scoring requests for up to 100 podcasts, and one
    // credit to draft the AI strategy not loaded yet.
    expect(await screen.findByRole('button', { name: 'Scan podcasts for Taylor Client' })).toBeInTheDocument()
    expect(await screen.findByText('Billed to your provider accounts')).toBeInTheDocument()
    await waitFor(() =>
      expect(vi.mocked(getWorkspaceResearchContext)).toHaveBeenCalledWith(viewedWorkspaceId, clientId))
    expect(vi.mocked(getWorkspaceResearchContext)).not.toHaveBeenCalledWith(workspaceId, clientId)
  })

  /*
   * Scanning spends the viewed workspace's Podscan quota and AI credits and
   * writes rows onto its client's list. A workspace id taken from AuthContext
   * anywhere along that path would bill one agency for another's scan and file
   * the results in the wrong tenant.
   */
  it('scans and files the results against the viewed workspace, not the viewer’s', async () => {
    mockViewedWorkspace()

    renderFinder(
      `/app/workspaces/${viewedWorkspaceId}/podcast-finder?client=${clientId}`,
      viewedWorkspaceId,
    )
    fireEvent.click(await screen.findByRole('button', { name: /^Scan podcasts for Taylor Client/ }))
    expect(await screen.findByText('Ranked by fit for Taylor Client')).toBeInTheDocument()

    expect(vi.mocked(searchClientPodcastCatalog)).toHaveBeenCalledWith(viewedWorkspaceId, clientId, expect.any(String))
    expect(vi.mocked(generatePodcastQueries)).toHaveBeenCalledWith({ workspaceId: viewedWorkspaceId, clientId })
    expect(vi.mocked(searchPodcastsWithMeta)).toHaveBeenCalledWith(expect.any(Object), viewedWorkspaceId)
    expect(vi.mocked(scoreCompatibilityBatch).mock.calls[0][5]).toEqual({ workspaceId: viewedWorkspaceId, clientId })

    fireEvent.click(await screen.findByRole('button', { name: /^Add top/ }))
    await waitFor(() => expect(vi.mocked(addClientShortlistPodcasts)).toHaveBeenCalled())
    expect(vi.mocked(addClientShortlistPodcasts).mock.calls[0][0]).toBe(viewedWorkspaceId)
    expect(vi.mocked(addClientShortlistPodcasts)).not.toHaveBeenCalledWith(workspaceId, expect.anything(), expect.anything())
  })

  /*
   * A link written as a literal /app/… moves a platform admin out of the
   * workspace they were looking at and into their own, silently. Both of the
   * page's body links have to follow the viewed workspace's baseHref.
   */
  it('offers to add the first client inside the workspace on screen', async () => {
    mockViewedWorkspace()
    vi.mocked(getWorkspaceClients).mockResolvedValue([])

    renderFinder(`/app/workspaces/${viewedWorkspaceId}/podcast-finder`, viewedWorkspaceId)

    expect(await screen.findByRole('link', { name: 'Add your first client' }))
      .toHaveAttribute('href', `/app/workspaces/${viewedWorkspaceId}/clients`)

    cleanup()
    renderFinder('/app/podcast-finder')

    expect(await screen.findByRole('link', { name: 'Add your first client' }))
      .toHaveAttribute('href', '/app/clients')
  })

  it('sends a fruitless scan on to the advanced finder inside the workspace on screen', async () => {
    mockViewedWorkspace()
    // Nothing new: the catalog is silent and Podscan only returns a show that
    // is already on the client's list, which is what opens the empty state.
    vi.mocked(searchClientPodcastCatalog).mockResolvedValue([] as never)
    vi.mocked(searchPodcastsWithMeta).mockResolvedValue({
      data: { podcasts: [podcast('pd-existing', 'Already Listed')], pagination: { last_page: '1' } },
      rateLimit: {},
    } as never)

    renderFinder(
      `/app/workspaces/${viewedWorkspaceId}/podcast-finder?client=${clientId}`,
      viewedWorkspaceId,
    )
    fireEvent.click(await screen.findByRole('button', { name: /^Scan podcasts for Taylor Client/ }))

    expect(await screen.findByRole('link', { name: 'advanced finder' }))
      .toHaveAttribute('href', `/app/workspaces/${viewedWorkspaceId}/podcast-finder/advanced`)

    cleanup()
    renderFinder()
    fireEvent.click(await screen.findByRole('button', { name: /^Scan podcasts for Taylor Client/ }))

    expect(await screen.findByRole('link', { name: 'advanced finder' }))
      .toHaveAttribute('href', '/app/podcast-finder/advanced')
  })

  /*
   * The header button is always on screen and is the ordinary way to reach the
   * advanced finder, which makes it the worst of these to leave hardcoded: it
   * sent the operator to their own workspace's advanced finder, rebranded and
   * scoped to a client id belonging to the agency they had just left. It was
   * missed when the two body links were fixed, because it builds its path in a
   * template literal rather than a plain string.
   */
  it('keeps the header advanced-finder button inside the workspace on screen', async () => {
    mockViewedWorkspace()
    renderFinder(
      `/app/workspaces/${viewedWorkspaceId}/podcast-finder?client=${clientId}`,
      viewedWorkspaceId,
    )

    const platformLink = await screen.findByRole('link', { name: /advanced finder/i })
    expect(platformLink).toHaveAttribute(
      'href',
      `/app/workspaces/${viewedWorkspaceId}/podcast-finder/advanced?client=${clientId}`,
    )

    cleanup()

    renderFinder(`/app/podcast-finder?client=${clientId}`)
    expect(await screen.findByRole('link', { name: /advanced finder/i }))
      .toHaveAttribute('href', `/app/podcast-finder/advanced?client=${clientId}`)
  })

  /*
   * The live audit: every index page came back 403, the shared database
   * answered with shows already on the list, and the page said "Nothing new
   * this time" after a minute and a half of retries. A refused request ends
   * the scan on the first page and says so.
   */
  it('stops on the first 403 and shows the failure panel with the refund, not "nothing new"', async () => {
    vi.mocked(searchClientPodcastCatalog).mockResolvedValue([] as never)
    vi.mocked(searchPodcastsWithMeta).mockRejectedValue(Object.assign(new Error('Podscan API error: 403'), {
      code: 'PODSCAN_UPSTREAM_403', status: 502, creditsCharged: 1, creditsRefunded: 1,
    }))
    renderFinder()
    fireEvent.click(await screen.findByRole('button', { name: /^Scan podcasts for Taylor Client/ }))

    const panel = await screen.findByRole('alert')
    expect(panel).toHaveTextContent('Scan could not run.')
    expect(panel).toHaveTextContent('The podcast index rejected the request (error 403).')
    expect(panel).toHaveTextContent('1 credit taken for the failed request was refunded.')
    expect(screen.getByRole('button', { name: /Retry/ })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Contact support' })).toHaveAttribute('href', expect.stringMatching(/^mailto:/u))
    expect(screen.queryByText(/Nothing new this time/u)).not.toBeInTheDocument()
    expect(vi.mocked(searchPodcastsWithMeta)).toHaveBeenCalledTimes(1)
    expect(vi.mocked(scoreCompatibilityBatch)).not.toHaveBeenCalled()
  })

  it('retries a flaky index twice and then fails, instead of walking every page', async () => {
    vi.mocked(searchPodcastsWithMeta).mockRejectedValue(Object.assign(new Error('Podscan did not respond in time'), {
      code: 'PODSCAN_TIMEOUT', status: 504,
    }))
    renderFinder()
    fireEvent.click(await screen.findByRole('button', { name: /^Scan podcasts for Taylor Client/ }))

    expect(await screen.findByRole('alert', {}, { timeout: 6_000 })).toHaveTextContent('The podcast index did not respond in time.')
    expect(vi.mocked(searchPodcastsWithMeta)).toHaveBeenCalledTimes(3)
    expect(vi.mocked(toast.error)).toHaveBeenCalledWith('Scan could not run. The podcast index did not respond in time.')
  }, 15_000)

  it('does not call it "nothing new" when the shared database searches failed', async () => {
    vi.mocked(searchClientPodcastCatalog).mockRejectedValue(new Error('catalog down'))
    vi.mocked(searchPodcastsWithMeta).mockResolvedValue({
      data: { podcasts: [podcast('pd-existing', 'Already Listed')], pagination: { last_page: '1' } },
      rateLimit: {},
    } as never)
    renderFinder()
    fireEvent.click(await screen.findByRole('button', { name: /^Scan podcasts for Taylor Client/ }))

    expect(await screen.findByRole('alert')).toHaveTextContent('The shared podcast database did not answer 1 of 1 searches')
    expect(screen.queryByText(/Nothing new this time/u)).not.toBeInTheDocument()
  })

  it('sends a thin profile to the client record instead of scanning with a guessed strategy', async () => {
    vi.mocked(generatePodcastQueries).mockRejectedValue(new ProfileTooThinError('The profile has only 3 descriptive words.'))
    renderFinder()
    fireEvent.click(await screen.findByRole('button', { name: /^Scan podcasts for Taylor Client/ }))

    const panel = await screen.findByText('Scan could not run.')
    const card = panel.closest('[role="alert"]') as HTMLElement
    expect(card).toHaveTextContent('Not enough profile to draft a strategy. Add a bio, topics or talking points to the client, then try again.')
    expect(card).toHaveTextContent('No credits were charged for this scan.')
    expect(screen.getByRole('link', { name: 'Open client profile' })).toHaveAttribute('href', `/app/clients/${clientId}`)
    // The strategy section says so too, inside the search settings.
    openFilters()
    expect(screen.getByRole('link', { name: 'Open Taylor Client’s profile' })).toHaveAttribute('href', `/app/clients/${clientId}`)
    expect(vi.mocked(searchPodcastsWithMeta)).not.toHaveBeenCalled()
  })

  it('says the strategy failed instead of searching with filler when the AI call fails', async () => {
    vi.mocked(generatePodcastQueries).mockRejectedValue(
      new StrategyGenerationError('The AI could not draft a search strategy. Try again in a moment.', 'STRATEGY_PROVIDER_FAILED'),
    )
    renderFinder()
    fireEvent.click(await screen.findByRole('button', { name: /^Scan podcasts for Taylor Client/ }))

    expect(await screen.findByRole('alert')).toHaveTextContent('The AI could not draft a search strategy. Try again in a moment.')
    expect(vi.mocked(searchPodcastsWithMeta)).not.toHaveBeenCalled()
  })

  it('flags a thin profile when previewing the strategy', async () => {
    vi.mocked(generatePodcastQueries).mockRejectedValue(new ProfileTooThinError('The profile has only 3 descriptive words.'))
    renderFinder()
    await screen.findByRole('button', { name: /^Scan podcasts for Taylor Client/ })
    openFilters()
    fireEvent.click(await screen.findByRole('button', { name: /Preview strategy/ }))

    expect(await screen.findByRole('link', { name: 'Open Taylor Client’s profile' })).toHaveAttribute('href', `/app/clients/${clientId}`)
    expect(vi.mocked(toast.error)).toHaveBeenCalledWith('Not enough profile to draft a strategy. Add a bio, topics or talking points to the client, then try again.')
  })

  it('stops a running scan when the page is left, before any paid scoring', async () => {
    let releaseSearch: () => void = () => undefined
    vi.mocked(searchPodcastsWithMeta).mockImplementation(() => new Promise((resolve) => {
      releaseSearch = () => resolve({
        data: { podcasts: [podcast('pd-high', 'Founder Stories')], pagination: { last_page: '1' } },
        rateLimit: {},
      } as never)
    }))
    renderFinder()
    fireEvent.click(await screen.findByRole('button', { name: /^Scan podcasts for Taylor Client/ }))
    await waitFor(() => expect(vi.mocked(searchPodcastsWithMeta)).toHaveBeenCalled())

    cleanup()
    releaseSearch()
    await new Promise((resolve) => setTimeout(resolve, 50))
    expect(vi.mocked(scoreCompatibilityBatch)).not.toHaveBeenCalled()
  })

  it('scans, ranks by AI fit, and never rescored podcasts already on the list', async () => {
    renderFinder()

    const scanButton = await screen.findByRole('button', { name: /^Scan podcasts for Taylor Client/ })
    fireEvent.click(scanButton)

    expect(await screen.findByText('Ranked by fit for Taylor Client')).toBeInTheDocument()
    expect(vi.mocked(generatePodcastQueries)).toHaveBeenCalledWith({ workspaceId, clientId })
    expect(vi.mocked(searchPodcastsWithMeta)).toHaveBeenCalledWith(
      expect.objectContaining({ query: 'founder stories', has_guests: true, order_by: 'best_match' }),
      workspaceId,
    )
    const scored = vi.mocked(scoreCompatibilityBatch).mock.calls[0]
    expect(scored[0]).toBe('Taylor helps founders scale.')
    // Scored in pre-rank order: Founder Stories shares the profile's words,
    // the catalog match is recent and from the shared database.
    expect((scored[1] as Array<{ podcast_id: string }>).map((entry) => entry.podcast_id)).toEqual(['pd-high', 'pd-catalog', 'pd-low'])

    const items = within(screen.getByRole('list', { name: 'Ranked podcasts' })).getAllByRole('listitem')
    expect(items[0]).toHaveTextContent('Founder Stories')
    expect(items[0]).toHaveTextContent('92 fit')
    expect(items[0]).toHaveTextContent('Perfect audience overlap.')
    expect(items[1]).toHaveTextContent('Catalog Growth Show')
    expect(items[1]).toHaveTextContent('In your database')
    expect(items[2]).toHaveTextContent('Low Fit Weekly')
    expect(screen.queryByText('Already Listed')).not.toBeInTheDocument()
  })

  it('says when the index could not read a search as written, and still ranks its results', async () => {
    vi.mocked(searchPodcastsWithMeta).mockResolvedValue({
      data: {
        podcasts: [podcast('pd-high', 'Founder Stories')],
        pagination: { last_page: '1' },
        query_warnings: [{ code: 'UNBALANCED_QUOTE', message: 'Unbalanced quote', position: 0, length: 1 }],
      },
      rateLimit: {},
    } as never)
    renderFinder()

    fireEvent.click(await screen.findByRole('button', { name: /^Scan podcasts for Taylor Client/ }))

    expect(await screen.findByText('Ranked by fit for Taylor Client')).toBeInTheDocument()
    expect(vi.mocked(toast.warning)).toHaveBeenCalledWith(
      'The podcast index could not read one search exactly as written (“founder stories”), so its results may be broader than intended.',
      { duration: 10000 },
    )
  })

  it('keeps paging past a page that only held duplicate feeds', async () => {
    vi.mocked(searchPodcastsWithMeta).mockImplementation(async (options) => {
      const page = options.page ?? 1
      return {
        data: {
          podcasts: page === 2 ? [] : [podcast(`pd-page-${page}`, `Page ${page} Show`)],
          pagination: { last_page: '3' },
        },
        rateLimit: {},
        duplicatesRemoved: page === 2 ? 50 : 0,
      } as never
    })
    renderFinder()

    fireEvent.click(await screen.findByRole('button', { name: /^Scan podcasts for Taylor Client/ }))

    expect(await screen.findByText('Ranked by fit for Taylor Client', {}, { timeout: 10000 })).toBeInTheDocument()
    expect(vi.mocked(searchPodcastsWithMeta)).toHaveBeenCalledTimes(3)
    expect(screen.getByText('Page 3 Show')).toBeInTheDocument()
  }, 15000)

  it('adds the ranked podcasts to the client list with their compatibility scores', async () => {
    renderFinder()
    fireEvent.click(await screen.findByRole('button', { name: /^Scan podcasts for Taylor Client/ }))
    fireEvent.click(await screen.findByRole('button', { name: 'Add top 3' }))

    await waitFor(() => expect(vi.mocked(addClientShortlistPodcasts)).toHaveBeenCalled())
    const [calledWorkspaceId, calledClientId, inputs] = vi.mocked(addClientShortlistPodcasts).mock.calls[0]
    expect(calledWorkspaceId).toBe(workspaceId)
    expect(calledClientId).toBe(clientId)
    expect(inputs.map((input) => input.podcast_id)).toEqual(['pd-high', 'pd-catalog', 'pd-low'])
    expect(inputs[0]).toMatchObject({ compatibility_score: 9.2, compatibility_reasoning: 'Perfect audience overlap.' })
    expect(await screen.findAllByRole('button', { name: /Added/ })).toHaveLength(3)
  })

  it('lets the owner search with their own keywords and filters instead of the AI strategy', async () => {
    renderFinder()
    await screen.findByRole('button', { name: /^Scan podcasts for Taylor Client/ })
    openFilters()

    fireEvent.change(screen.getByLabelText('Your keywords'), { target: { value: '"b2b saas" AND founders' } })
    fireEvent.click(screen.getByRole('button', { name: 'Add' }))
    fireEvent.click(screen.getByRole('switch', { name: 'AI search strategy' }))
    fireEvent.click(screen.getByRole('radio', { name: '5K+' }))
    fireEvent.click(screen.getByRole('button', { name: /^Scan podcasts for Taylor Client/ }))

    expect(await screen.findByText('Ranked by fit for Taylor Client')).toBeInTheDocument()
    expect(vi.mocked(generatePodcastQueries)).not.toHaveBeenCalled()
    expect(vi.mocked(searchPodcastsWithMeta)).toHaveBeenCalledWith(
      expect.objectContaining({
        query: '"b2b saas" AND founders',
        min_audience_size: 5000,
        has_guests: true,
      }),
      workspaceId,
    )
  })

  it('previews the AI strategy so individual queries can be removed before scanning', async () => {
    renderFinder()
    await screen.findByRole('button', { name: /^Scan podcasts for Taylor Client/ })
    openFilters()

    fireEvent.click(screen.getByRole('button', { name: 'Preview strategy' }))
    expect(await screen.findByText('founder stories')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Remove AI query founder stories' }))
    fireEvent.change(screen.getByLabelText('Your keywords'), { target: { value: 'bootstrapping' } })
    fireEvent.click(screen.getByRole('button', { name: 'Add' }))
    fireEvent.click(screen.getByRole('button', { name: /^Scan podcasts for Taylor Client/ }))

    expect(await screen.findByText('Ranked by fit for Taylor Client')).toBeInTheDocument()
    const searchedQueries = vi.mocked(searchPodcastsWithMeta).mock.calls.map((call) => (call[0] as { query: string }).query)
    expect(searchedQueries).toContain('bootstrapping')
    expect(searchedQueries).not.toContain('founder stories')
  })

  it('blocks scanning until the client has a profile bio', async () => {
    vi.mocked(getWorkspaceResearchContext).mockResolvedValue({
      workspace: { id: workspaceId, name: 'Agency One', slug: null, status: 'active', is_default: false, logo_path: null, logo_updated_at: null },
      client: {
        id: clientId,
        workspace_id: workspaceId,
        name: 'Taylor Client',
        email: null,
        website: null,
        status: 'active',
        bio: null,
        photo_url: null,
        updated_at: '2026-07-01T00:00:00.000Z',
      },
      existing_podcast_ids: [],
    })
    renderFinder()

    expect(await screen.findByText(/has no profile bio yet/)).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: /^Scan podcasts for Taylor Client/ }))
    expect(vi.mocked(generatePodcastQueries)).not.toHaveBeenCalled()
  })

  // A failed context load has no bio either, so it showed the "add their
  // profile" banner and blamed the client for what was a request failure.
  it('says the profile could not be loaded, offers a retry, and blocks the scan', async () => {
    vi.mocked(getWorkspaceResearchContext).mockRejectedValueOnce(new Error('Network down'))
    renderFinder()

    expect(await screen.findByText(/profile could not be loaded/)).toBeInTheDocument()
    expect(screen.queryByText(/has no profile bio yet/)).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: /^Scan podcasts for Taylor Client/ })).toBeDisabled()

    fireEvent.click(screen.getByRole('button', { name: 'Retry' }))
    await waitFor(() => expect(vi.mocked(getWorkspaceResearchContext)).toHaveBeenCalledTimes(2))
    await waitFor(() => expect(screen.getByRole('button', { name: /^Scan podcasts for Taylor Client/ })).toBeEnabled())
    expect(screen.queryByText(/profile could not be loaded/)).not.toBeInTheDocument()
  })

  it('opens with the search settings collapsed to a one-line summary', async () => {
    renderFinder()
    await screen.findByRole('button', { name: /^Scan podcasts for Taylor Client/ })

    const summary = screen.getByRole('list', { name: 'Current search settings' })
    expect(within(summary).getAllByRole('listitem').map((item) => item.textContent)).toEqual([
      'English', 'Any region', 'Active last 90 days', 'Guest shows only',
    ])
    expect(screen.getByRole('button', { name: /Edit filters/ })).toHaveAttribute('aria-expanded', 'false')
    expect(screen.queryByLabelText('Your keywords')).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Reset' })).not.toBeInTheDocument()
  })

  it('remembers the open panel per user', async () => {
    renderFinder()
    await screen.findByRole('button', { name: /^Scan podcasts for Taylor Client/ })
    openFilters()
    expect(window.localStorage.getItem('podcast-finder-filters-open-v1:user-1')).toBe('open')

    cleanup()
    renderFinder()
    expect(await screen.findByLabelText('Your keywords')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Hide filters/ })).toHaveAttribute('aria-expanded', 'true')
  })

  it('counts changed settings on the closed panel and resets them', async () => {
    renderFinder()
    await screen.findByRole('button', { name: /^Scan podcasts for Taylor Client/ })
    openFilters()
    fireEvent.click(screen.getByRole('radio', { name: '10+' }))
    fireEvent.click(screen.getByRole('radio', { name: '25K+' }))
    fireEvent.click(screen.getByRole('button', { name: /Hide filters/ }))

    expect(screen.getByRole('button', { name: 'Edit filters 2 changed' })).toBeInTheDocument()
    expect(screen.getByRole('list', { name: 'Current search settings' })).toHaveTextContent('25K+ listeners')
    fireEvent.click(screen.getByRole('button', { name: 'Reset' }))
    expect(screen.getByRole('button', { name: 'Edit filters' })).toBeInTheDocument()
    expect(screen.getByRole('list', { name: 'Current search settings' })).not.toHaveTextContent('listeners')
  })

  it('sends the same search for a preset as for the same value typed in Custom', async () => {
    const scanWith = async (choose: () => void) => {
      renderFinder()
      await screen.findByRole('button', { name: /^Scan podcasts for Taylor Client/ })
      openFilters()
      choose()
      fireEvent.click(screen.getByRole('button', { name: /^Scan podcasts for Taylor Client/ }))
      await screen.findByText('Ranked by fit for Taylor Client')
      const calls = vi.mocked(searchPodcastsWithMeta).mock.calls.map((call) => call[0])
      cleanup()
      window.localStorage.clear()
      vi.mocked(searchPodcastsWithMeta).mockClear()
      return calls
    }

    const viaPresets = await scanWith(() => {
      fireEvent.click(screen.getByRole('radio', { name: '25K+' }))
      fireEvent.click(screen.getByRole('radio', { name: '10+' }))
    })
    const viaCustom = await scanWith(() => {
      fireEvent.click(within(screen.getByRole('radiogroup', { name: /^Audience/ })).getByRole('radio', { name: 'Custom' }))
      fireEvent.change(screen.getByLabelText('Min audience'), { target: { value: '25000' } })
      fireEvent.click(within(screen.getByRole('radiogroup', { name: 'Min episodes' })).getByRole('radio', { name: 'Custom' }))
      fireEvent.change(screen.getByLabelText('Custom min episodes'), { target: { value: '10' } })
    })

    expect(viaPresets[0]).toMatchObject({ min_audience_size: 25000, min_episode_count: 10 })
    expect(viaPresets[0]).not.toHaveProperty('max_audience_size')
    expect(viaCustom).toEqual(viaPresets)
  })

  it('asks for a client instead of doing nothing when none is picked', async () => {
    renderFinder('/app/podcast-finder')
    const scanButton = await screen.findByRole('button', { name: 'Pick a client to scan' })
    expect(scanButton).toBeEnabled()

    fireEvent.click(scanButton)
    const picker = screen.getByRole('combobox', { name: 'Client' })
    expect(picker).toHaveAttribute('aria-expanded', 'true')
    expect(await screen.findByRole('option', { name: 'Taylor Client' })).toBeInTheDocument()
    // Focus lands in the open list, where the arrow keys work.
    await waitFor(() => expect(document.activeElement).toHaveAttribute('cmdk-root'))
    expect(screen.getByRole('option', { name: 'Add client' })).toBeInTheDocument()
    expect(vi.mocked(generatePodcastQueries)).not.toHaveBeenCalled()
    expect(vi.mocked(searchPodcastsWithMeta)).not.toHaveBeenCalled()
  })

  it('opens on the header’s working client when the address names none', async () => {
    writeWorkingClient(workspaceId, 'user-1', clientId)
    renderFinder('/app/podcast-finder')

    expect(await screen.findByRole('button', { name: 'Scan podcasts for Taylor Client' })).toBeInTheDocument()
    expect(screen.getByTestId('location')).toHaveTextContent(`/app/podcast-finder?client=${clientId}`)
  })

  // The address is what the header reads on this page, so picking here is
  // picking there too.
  it('writes the picked client to the address the header follows', async () => {
    renderFinder('/app/podcast-finder')
    await screen.findByRole('button', { name: 'Pick a client to scan' })

    fireEvent.click(screen.getByRole('combobox', { name: 'Client' }))
    fireEvent.click(await screen.findByRole('option', { name: 'Taylor Client' }))

    await waitFor(() => expect(screen.getByTestId('location')).toHaveTextContent(`/app/podcast-finder?client=${clientId}`))
    expect(await screen.findByRole('button', { name: 'Scan podcasts for Taylor Client' })).toBeInTheDocument()
  })

  it('warns and links to billing when the balance cannot cover the scan', async () => {
    vi.mocked(getWorkspaceBillingOverview).mockResolvedValue({ balance: 3, enforcement_enabled: true, monthly_credit_allowance: 500 } as never)
    renderFinder()

    expect(await screen.findByText(/Billed to your provider accounts/)).toBeInTheDocument()
    expect(screen.queryByRole('link', { name: 'Add credits' })).not.toBeInTheDocument()
  })

  it('labels keyword estimates and ranks them below AI scores', async () => {
    vi.mocked(scoreCompatibilityBatch).mockResolvedValue([
      { podcast_id: 'pd-high', score: 9.2, reasoning: 'Perfect audience overlap.', source: 'ai' },
      { podcast_id: 'pd-catalog', score: 9.5, reasoning: 'Estimated from keyword overlap.', source: 'deterministic' },
      { podcast_id: 'pd-low', score: 4.1, reasoning: 'Weak topical match.', source: 'ai' },
    ])
    renderFinder()
    fireEvent.click(await screen.findByRole('button', { name: /^Scan podcasts for Taylor Client/ }))

    const items = within(await screen.findByRole('list', { name: 'Ranked podcasts' })).getAllByRole('listitem')
    expect(items[0]).toHaveTextContent('Founder Stories')
    expect(items[1]).toHaveTextContent('Low Fit Weekly')
    expect(items[2]).toHaveTextContent('Catalog Growth Show')
    expect(items[2]).toHaveTextContent('95 fit, estimated')
    expect(screen.getByText(/1 score is estimated from keyword overlap/)).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Hide estimated' }))
    expect(screen.queryByText('Catalog Growth Show')).not.toBeInTheDocument()
    expect(screen.getByText('Showing 2 of 3')).toBeInTheDocument()
  })

  it('narrows the finished list by fit without scanning again', async () => {
    renderFinder()
    fireEvent.click(await screen.findByRole('button', { name: /^Scan podcasts for Taylor Client/ }))
    await screen.findByText('Ranked by fit for Taylor Client')
    const searches = vi.mocked(searchPodcastsWithMeta).mock.calls.length

    fireEvent.click(screen.getByRole('combobox', { name: 'Minimum fit' }))
    fireEvent.click(await screen.findByRole('option', { name: '80+ fit' }))

    expect(screen.queryByText('Low Fit Weekly')).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Add top 2' })).toBeInTheDocument()
    expect(vi.mocked(searchPodcastsWithMeta).mock.calls.length).toBe(searches)
  })

  it('saves a finished scan with what it ran and what it charged', async () => {
    vi.mocked(scoreCompatibilityBatch).mockResolvedValue([
      { podcast_id: 'pd-high', score: 9.2, reasoning: 'Perfect audience overlap.', source: 'ai' },
      { podcast_id: 'pd-catalog', score: 8.8, reasoning: 'Strong database match.', source: 'ai' },
      { podcast_id: 'pd-low', score: 4.1, reasoning: 'Weak topical match.', source: 'deterministic' },
    ])
    renderFinder()
    fireEvent.click(await screen.findByRole('button', { name: /^Scan podcasts for Taylor Client/ }))

    await waitFor(() => expect(vi.mocked(saveFinderScan)).toHaveBeenCalled())
    const [savedWorkspace, savedClient, scan] = vi.mocked(saveFinderScan).mock.calls[0]
    expect(savedWorkspace).toBe(workspaceId)
    expect(savedClient).toBe(clientId)
    expect(scan.queries).toEqual(['founder stories'])
    expect(scan.found_count).toBe(3)
    // Strategy 1 + one index page 1 + one scoring request 1.
    expect(scan.credits_used).toBe(0)
    expect(scan.results.map((result) => [result.podcast.podcast_id, result.score, result.estimated])).toEqual([
      ['pd-high', 92, false],
      ['pd-catalog', 88, false],
      ['pd-low', 41, true],
    ])
  })

  it('lists recent scans, and says so when there are none', async () => {
    renderFinder('/app/podcast-finder')
    expect(await screen.findByText('No scans yet. Pick a client and run your first one.')).toBeInTheDocument()
    expect(vi.mocked(listFinderScans)).toHaveBeenCalledWith(workspaceId, null)
    cleanup()

    vi.mocked(listFinderScans).mockResolvedValue([{
      id: '44444444-4444-4444-8444-444444444444',
      workspace_id: workspaceId,
      client_id: clientId,
      client_name: 'Taylor Client',
      queries: ['founder stories'],
      found_count: 120,
      match_count: 42,
      credits_used: 24,
      created_at: '2026-10-20T15:30:00.000Z',
    }])
    renderFinder()
    const list = await screen.findByRole('list', { name: 'Recent scans' })
    expect(list).toHaveTextContent('Taylor Client')
    expect(list).toHaveTextContent('42 matches · 24 credits used')
    expect(within(list).getByRole('link', { name: /View results/ }))
      .toHaveAttribute('href', `/app/podcast-finder?client=${clientId}&scan=44444444-4444-4444-8444-444444444444`)
  })

  it('reopens a saved scan from its address', async () => {
    const scanId = '44444444-4444-4444-8444-444444444444'
    vi.mocked(getFinderScan).mockResolvedValue({
      id: scanId,
      workspace_id: workspaceId,
      client_id: clientId,
      client_name: 'Taylor Client',
      queries: ['founder stories'],
      found_count: 2,
      match_count: 1,
      credits_used: 24,
      created_at: '2026-10-20T15:30:00.000Z',
      filters: { customKeywords: [], includeAiStrategy: true, language: 'en', region: 'any', activityDays: '90', guestsOnly: true, minAudience: '', maxAudience: '', minEpisodes: '' },
      results: [{
        podcast: {
          podcast_id: 'pd-saved', podcast_name: 'Saved Signal', podcast_description: null, podcast_image_url: null, podcast_url: null,
          publisher_name: null, itunes_rating: null, episode_count: 40, audience_size: 3000, last_posted_at: null, language: 'en',
          region: null, podcast_email: 'host@example.com', rss_feed: null, podcast_categories: null, source: 'podscan',
        },
        score: 87,
        reasoning: 'Books operators.',
        estimated: false,
      }],
    })
    renderFinder(`/app/podcast-finder?client=${clientId}&scan=${scanId}`)

    expect(await screen.findByText('Saved Signal')).toBeInTheDocument()
    expect(screen.getByText(/From the scan on/)).toBeInTheDocument()
    expect(screen.getByText('Email on file')).toBeInTheDocument()
    expect(vi.mocked(getFinderScan)).toHaveBeenCalledWith(workspaceId, scanId)
    expect(vi.mocked(searchPodcastsWithMeta)).not.toHaveBeenCalled()
  })

  it('steers the next strategy away from what the last scan searched', async () => {
    vi.mocked(listFinderScans).mockResolvedValue([{
      id: '44444444-4444-4444-8444-444444444444',
      workspace_id: workspaceId,
      client_id: clientId,
      client_name: 'Taylor Client',
      queries: ['founder stories', 'bootstrapping'],
      found_count: 120,
      match_count: 42,
      credits_used: 24,
      created_at: '2026-10-20T15:30:00.000Z',
    }])
    renderFinder()
    await screen.findByRole('list', { name: 'Recent scans' })
    fireEvent.click(screen.getByRole('button', { name: /^Scan podcasts for Taylor Client/ }))

    await waitFor(() => expect(vi.mocked(generatePodcastQueries)).toHaveBeenCalledWith({
      workspaceId,
      clientId,
      avoidQueries: ['founder stories', 'bootstrapping'],
    }))
  })
})
