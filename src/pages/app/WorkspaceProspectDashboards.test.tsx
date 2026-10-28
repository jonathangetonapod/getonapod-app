import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import WorkspaceProspectDashboards from '@/pages/app/WorkspaceProspectDashboards'
import { useAuth } from '@/contexts/AuthContext'
import {
  archiveWorkspaceProspect,
  createWorkspaceProspect,
  getWorkspaceProspect,
  getWorkspaceProspects,
  markWorkspaceProspectLinkCopied,
  rotateWorkspaceProspectLink,
  setWorkspaceProspectOutcome,
  type ProspectShortlistPodcast,
  type ProspectWorkspaceSummary,
  type WorkspaceProspect,
} from '@/services/prospectDashboards'

vi.mock('@/contexts/AuthContext', () => ({ useAuth: vi.fn() }))
vi.mock('@/services/prospectDashboards', () => ({
  archiveWorkspaceProspect: vi.fn(),
  buildWorkspaceProspect: vi.fn(),
  createWorkspaceProspect: vi.fn(),
  getWorkspaceProspect: vi.fn(),
  getWorkspaceProspects: vi.fn(),
  markWorkspaceProspectLinkCopied: vi.fn(),
  removeWorkspaceProspectPhoto: vi.fn(),
  rotateWorkspaceProspectLink: vi.fn(),
  setWorkspaceProspectOutcome: vi.fn(),
  setWorkspaceProspectPublished: vi.fn(),
  updateWorkspaceProspect: vi.fn(),
  updateWorkspaceProspectPodcast: vi.fn(),
  uploadWorkspaceProspectPhoto: vi.fn(),
}))
vi.mock('@/components/admin/WorkspaceSwitcher', () => ({ WorkspaceSwitcher: () => <div>Workspace switcher</div> }))

const mockedUseAuth = vi.mocked(useAuth)
const mockedList = vi.mocked(getWorkspaceProspects)
const mockedDetail = vi.mocked(getWorkspaceProspect)

const workspaceId = '11111111-1111-4111-8111-111111111111'
const userId = '22222222-2222-4222-8222-222222222222'
const prospectId = '33333333-3333-4333-8333-333333333333'
const platformWorkspaceId = '44444444-4444-4444-8444-444444444444'

const workspaceSummary: ProspectWorkspaceSummary = {
  id: workspaceId,
  name: 'Tenant Workspace',
  status: 'active',
  is_default: false,
  logo_path: null,
  logo_updated_at: null,
  client_brand_name: null,
  client_brand_primary_color: null,
  client_brand_accent_color: null,
}

const prospect: WorkspaceProspect = {
  id: prospectId,
  workspace_id: workspaceId,
  slug: 'casey-prospect-123',
  prospect_name: 'Casey Prospect',
  first_name: 'Casey',
  prospect_email: 'casey@example.com',
  prospect_company: 'Example Co',
  prospect_title: 'Founder',
  prospect_bio: 'Casey helps founders build durable operations, and has done for a decade.',
  prospect_image_url: null,
  prospect_linkedin_url: null,
  prospect_website: null,
  prospect_industry: null,
  prospect_expertise: null,
  prospect_topics: null,
  prospect_target_audience: null,
  linked_client: null,
  lifecycle_status: 'draft',
  build_error: null,
  build_started_at: null,
  build_completed_at: null,
  published_at: null,
  pending_review_at: null,
  sent_at: null,
  first_engaged_at: null,
  converted_at: null,
  cta_type: 'reply',
  cta_label: 'Reply to move forward',
  cta_url: null,
  show_pricing_section: false,
  is_active: true,
  content_ready: false,
  view_count: 0,
  last_viewed_at: null,
  created_at: '2026-07-21T00:00:00.000Z',
  updated_at: '2026-07-21T00:00:00.000Z',
  readiness: {
    profile_ready: true,
    visible_count: 0,
    analyzed_count: 0,
    featured_count: 0,
    cta_ready: true,
    publishable: false,
  },
}

/** Opens a prospect by default, the way a row click does; pass a list address to start on the list. */
function renderPage(props: { platformWorkspaceId?: string } = {}, initialEntry?: string) {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  })
  const base = props.platformWorkspaceId ? `/app/workspaces/${props.platformWorkspaceId}` : '/app'
  const page = <WorkspaceProspectDashboards {...props} />

  render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={[initialEntry ?? `${base}/prospects/${prospectId}`]} future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
        <Routes>
          <Route path="/app/prospect-dashboards" element={page} />
          <Route path="/app/prospects" element={page} />
          <Route path="/app/prospects/:prospectId" element={page} />
          <Route path="/app/workspaces/:workspaceId/prospects" element={page} />
          <Route path="/app/workspaces/:workspaceId/prospects/:prospectId" element={page} />
        </Routes>
        <LocationProbe />
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

/** Where the page has navigated to, for assertions about the address. */
const LocationProbe = () => {
  const location = useLocation()
  return <output data-testid="location">{`${location.pathname}${location.search}`}</output>
}

describe('WorkspaceProspectDashboards finder link', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockedUseAuth.mockReturnValue({
      user: { id: userId, email: 'owner@example.com' },
      workspace: {
        id: workspaceId,
        name: 'Tenant Workspace',
        slug: 'tenant-workspace',
        status: 'active',
        is_default: false,
      },
      membership: { role: 'owner' },
      signOut: vi.fn(),
    } as never)
    mockedList.mockResolvedValue({
      workspace: workspaceSummary,
      viewer_role: 'owner',
      can_manage: true,
      dashboards: [prospect],
    })
    mockedDetail.mockResolvedValue({
      workspace: workspaceSummary,
      viewer_role: 'owner',
      can_manage: true,
      dashboard: prospect,
      podcasts: [],
    })
  })

  /*
   * The regression: /app/podcast-finder is the one-click Smart Finder, which
   * reads ?client= and knows nothing about prospects, so a prospect id sent
   * there was dropped and the finder opened unscoped. The prospect-aware
   * finder is the one at /advanced.
   */
  // A ?prospect= left from the previous selection used to win over the new
  // draft, so creating a prospect snapped the view back to the old one.
  it('selects a newly created prospect even when the address names another', async () => {
    const createdId = '55555555-5555-4555-8555-555555555555'
    const created = { ...prospect, id: createdId, prospect_name: 'Dallas Fontaine', updated_at: '2026-07-22T00:00:00.000Z' }
    vi.mocked(createWorkspaceProspect).mockResolvedValue(created)
    renderPage({}, `/app/prospect-dashboards?prospect=${prospectId}`)

    await waitFor(() => expect(mockedDetail).toHaveBeenCalledWith(workspaceId, prospectId))
    mockedList.mockResolvedValue({
      workspace: workspaceSummary,
      viewer_role: 'owner',
      can_manage: true,
      dashboards: [prospect, created],
    })
    fireEvent.click((await screen.findAllByRole('button', { name: /New prospect/u }))[0])
    fireEvent.change(await screen.findByLabelText('Name'), { target: { value: 'Dallas Fontaine' } })
    fireEvent.click(screen.getByRole('button', { name: 'Create draft' }))

    await waitFor(() => expect(mockedDetail).toHaveBeenCalledWith(workspaceId, createdId))
    await new Promise((resolve) => setTimeout(resolve, 50))
    expect(mockedDetail.mock.calls.at(-1)).toEqual([workspaceId, createdId])
  })

  it('regenerates the private link only after the operator confirms', async () => {
    const rotated = { ...prospect, slug: 'prospect-rotated' }
    vi.mocked(rotateWorkspaceProspectLink).mockResolvedValue({ dashboard: rotated, podcasts: [] } as never)
    renderPage()

    fireEvent.click(await screen.findByRole('button', { name: /Regenerate private link/i }))
    const dialog = await screen.findByRole('dialog')
    expect(within(dialog).getByText('This replaces the current private link. Anyone with the old link will lose access. Continue?')).toBeInTheDocument()
    expect(rotateWorkspaceProspectLink).not.toHaveBeenCalled()

    fireEvent.click(within(dialog).getByRole('button', { name: 'Regenerate link' }))
    await waitFor(() => expect(rotateWorkspaceProspectLink).toHaveBeenCalledWith(workspaceId, prospectId))
  })

  it('sends a prospect to the finder that reads the prospect parameter', async () => {
    renderPage()

    const link = await screen.findByRole('link', { name: /find podcasts/i })
    expect(link).toHaveAttribute('href', `/app/podcast-finder/advanced?prospect=${prospectId}`)
  })

  /*
   * This used to assert the plain platform address, because that path had no
   * Smart Finder and its plain address resolved to the advanced one. Both paths
   * now carry both finders at the same two addresses, so the prospect goes to
   * /advanced here for exactly the reason it does on the tenant path.
   */
  it('sends a prospect to the advanced finder on the platform path too', async () => {
    mockedList.mockResolvedValue({
      workspace: { ...workspaceSummary, id: platformWorkspaceId },
      viewer_role: 'platform_admin',
      can_manage: true,
      dashboards: [{ ...prospect, workspace_id: platformWorkspaceId }],
    })
    mockedDetail.mockResolvedValue({
      workspace: { ...workspaceSummary, id: platformWorkspaceId },
      viewer_role: 'platform_admin',
      can_manage: true,
      dashboard: { ...prospect, workspace_id: platformWorkspaceId },
      podcasts: [],
    })

    renderPage({ platformWorkspaceId })

    const link = await screen.findByRole('link', { name: /find podcasts/i })
    expect(link).toHaveAttribute(
      'href',
      `/app/workspaces/${platformWorkspaceId}/podcast-finder/advanced?prospect=${prospectId}`,
    )
    await waitFor(() => expect(mockedList).toHaveBeenCalledWith(platformWorkspaceId))
  })

  /*
   * Two finder addresses live on this page at once: the sidebar opens the
   * module at its plain address, which is the one-click Smart Finder, while the
   * prospect action has to reach the advanced one. Both paths now carry both,
   * so the pair must look the same on the platform path as on the tenant path —
   * neither collapsed onto the other, and neither pointing at /app while the
   * operator is looking at somebody else's workspace.
   */
  it('keeps the module at its plain address while the prospect goes to /advanced, on both paths', async () => {
    renderPage()

    const tenantNav = await screen.findAllByRole('link', { name: 'Podcast Finder' })
    expect(tenantNav.length).toBeGreaterThan(0)
    for (const link of tenantNav) expect(link).toHaveAttribute('href', '/app/podcast-finder')
    expect(await screen.findByRole('link', { name: /find podcasts/i }))
      .toHaveAttribute('href', `/app/podcast-finder/advanced?prospect=${prospectId}`)

    cleanup()

    mockedList.mockResolvedValue({
      workspace: { ...workspaceSummary, id: platformWorkspaceId },
      viewer_role: 'platform_admin',
      can_manage: true,
      dashboards: [{ ...prospect, workspace_id: platformWorkspaceId }],
    })
    mockedDetail.mockResolvedValue({
      workspace: { ...workspaceSummary, id: platformWorkspaceId },
      viewer_role: 'platform_admin',
      can_manage: true,
      dashboard: { ...prospect, workspace_id: platformWorkspaceId },
      podcasts: [],
    })
    renderPage({ platformWorkspaceId })

    const platformNav = await screen.findAllByRole('link', { name: 'Podcast Finder' })
    expect(platformNav.length).toBeGreaterThan(0)
    for (const link of platformNav) {
      expect(link).toHaveAttribute('href', `/app/workspaces/${platformWorkspaceId}/podcast-finder`)
    }
    expect(await screen.findByRole('link', { name: /find podcasts/i })).toHaveAttribute(
      'href',
      `/app/workspaces/${platformWorkspaceId}/podcast-finder/advanced?prospect=${prospectId}`,
    )
  })
})

describe('WorkspaceProspectDashboards stale build', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockedUseAuth.mockReturnValue({
      user: { id: userId, email: 'owner@example.com' },
      workspace: {
        id: workspaceId,
        name: 'Tenant Workspace',
        slug: 'tenant-workspace',
        status: 'active',
        is_default: false,
      },
      membership: { role: 'owner' },
      signOut: vi.fn(),
    } as never)
  })

  function mockBuilding(buildStartedAt: string) {
    const building: WorkspaceProspect = { ...prospect, lifecycle_status: 'matching', build_started_at: buildStartedAt }
    mockedList.mockResolvedValue({ workspace: workspaceSummary, viewer_role: 'owner', can_manage: true, dashboards: [building] })
    mockedDetail.mockResolvedValue({ workspace: workspaceSummary, viewer_role: 'owner', can_manage: true, dashboard: building, podcasts: [] })
  }

  // A build that died server-side left the row in 'matching', so the page
  // spun forever with the Build button disabled and no way out.
  it('lets the operator build again when a build started long ago never finished', async () => {
    mockBuilding(new Date(Date.now() - 20 * 60 * 1000).toISOString())
    renderPage()

    expect(await screen.findByText(/previous build did not finish/i)).toBeInTheDocument()
    // The cost is on the button once it can be clicked again.
    const buttons = screen.getAllByRole('button', { name: 'Build shortlist · Your provider account' })
    expect(buttons.length).toBeGreaterThan(0)
    for (const button of buttons) expect(button).toBeEnabled()
  })

  it('keeps a recent build in progress', async () => {
    mockBuilding(new Date(Date.now() - 60 * 1000).toISOString())
    renderPage()

    const buttons = await screen.findAllByRole('button', { name: 'Build shortlist' })
    expect(buttons.length).toBeGreaterThan(0)
    for (const button of buttons) expect(button).toBeDisabled()
    expect(screen.queryByText(/previous build did not finish/i)).not.toBeInTheDocument()
    expect(screen.getAllByText('Usually 3 to 6 minutes.').length).toBeGreaterThan(0)
  })
})

function shortlistPodcast(index: number, overrides: Partial<ProspectShortlistPodcast> = {}): ProspectShortlistPodcast {
  return {
    id: `podcast-row-${index}`,
    prospect_dashboard_id: prospectId,
    podcast_id: `podcast-${index}`,
    podcast_name: `Operations Show ${index}`,
    podcast_description: 'A show about running companies.',
    podcast_image_url: null,
    podcast_url: null,
    publisher_name: `Publisher ${index}`,
    itunes_rating: null,
    episode_count: 120,
    audience_size: 1000 + index,
    podcast_categories: [{ category_id: `cat-${index % 2}`, category_name: index % 2 === 0 ? 'Business' : 'Health' }],
    last_posted_at: null,
    ai_clean_description: null,
    ai_fit_reasons: null,
    ai_pitch_angles: null,
    ai_analyzed_at: '2026-08-01T00:00:00.000Z',
    visibility: 'visible',
    display_order: index,
    is_featured: false,
    featured_order: null,
    operator_notes: null,
    relevance_score: 5,
    relevance_reason: 'Audience overlap.',
    match_source: 'ai_ranked',
    archived_at: null,
    archived_by: null,
    created_at: '2026-07-21T00:00:00.000Z',
    updated_at: '2026-07-21T00:00:00.000Z',
    ...overrides,
  }
}

describe('WorkspaceProspectDashboards shortlist search and filters', () => {
  const podcasts = [
    ...Array.from({ length: 30 }, (_, index) => shortlistPodcast(index)),
    shortlistPodcast(99, {
      podcast_name: 'Private Practice Owners Club',
      publisher_name: 'Nathan Shields',
      podcast_categories: [{ category_id: 'cat-health', category_name: 'Health' }],
      relevance_score: 8.7,
    }),
    shortlistPodcast(100, {
      podcast_name: 'Retired Founder Radio',
      visibility: 'archived',
      archived_at: '2026-08-02T00:00:00.000Z',
      // Taken off the list by a person, which is what "Removed" means. A row
      // with no archived_by is a Finder addition waiting to be reviewed.
      archived_by: '55555555-5555-4555-8555-555555555555',
    }),
  ]

  beforeEach(() => {
    vi.clearAllMocks()
    mockedUseAuth.mockReturnValue({
      user: { id: userId, email: 'owner@example.com' },
      workspace: {
        id: workspaceId,
        name: 'Tenant Workspace',
        slug: 'tenant-workspace',
        status: 'active',
        is_default: false,
      },
      membership: { role: 'owner' },
      signOut: vi.fn(),
    } as never)
    mockedList.mockResolvedValue({
      workspace: workspaceSummary,
      viewer_role: 'owner',
      can_manage: true,
      dashboards: [prospect],
    })
    mockedDetail.mockResolvedValue({
      workspace: workspaceSummary,
      viewer_role: 'owner',
      can_manage: true,
      dashboard: prospect,
      podcasts,
    })
  })

  const visibleCount = podcasts.filter((podcast) => podcast.visibility === 'visible').length

  async function openAllView() {
    renderPage()
    fireEvent.click(await screen.findByRole('button', { name: `All (${visibleCount})` }))
  }

  it('finds one show in a shortlist too long to scroll', async () => {
    await openAllView()

    const search = await screen.findByLabelText(/search this shortlist/i)
    fireEvent.change(search, { target: { value: 'private practice' } })

    expect(await screen.findByText('Private Practice Owners Club')).toBeInTheDocument()
    expect(screen.queryByText('Operations Show 1')).not.toBeInTheDocument()
    expect(screen.getByText(/across the whole shortlist/i)).toBeInTheDocument()
  })

  /*
   * The reported failure: on Featured, which is three shows out of two hundred,
   * the search box was hidden and scoped to the open tab. Both made a search
   * that plainly should work look broken.
   */
  it('offers search on the featured tab and looks through the whole shortlist', async () => {
    renderPage()

    const search = await screen.findByLabelText(/search this shortlist/i)
    fireEvent.change(search, { target: { value: 'retired founder' } })

    // Archived, and on a tab that never lists archived shows.
    expect(await screen.findByText('Retired Founder Radio')).toBeInTheDocument()
    expect(screen.getByText('Removed')).toBeInTheDocument()
  })

  it('treats picking a tab as browsing, which ends the search', async () => {
    await openAllView()

    const search = await screen.findByLabelText(/search this shortlist/i)
    fireEvent.change(search, { target: { value: 'private practice' } })
    expect(await screen.findByText('Private Practice Owners Club')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: `All (${visibleCount})` }))

    // The search is over rather than silently ignored, so the tab shows what it says.
    await waitFor(() => expect(screen.getByLabelText(/search this shortlist/i)).toHaveValue(''))
    expect(await screen.findByText('Operations Show 0')).toBeInTheDocument()
  })

  it('searches the publisher and the reason, not only the title', async () => {
    await openAllView()

    const search = await screen.findByLabelText(/search this shortlist/i)
    fireEvent.change(search, { target: { value: 'nathan shields' } })

    expect(await screen.findByText('Private Practice Owners Club')).toBeInTheDocument()
  })

  it('pages through a long list rather than rendering all of it', async () => {
    await openAllView()

    expect(await screen.findByText(/showing 25 of 31/i)).toBeInTheDocument()
    expect(screen.queryByText('Operations Show 27')).not.toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: /show 6 more/i }))

    expect(await screen.findByText('Operations Show 27')).toBeInTheDocument()
  })

  it('says nothing matches instead of pretending the shortlist is empty', async () => {
    await openAllView()

    const search = await screen.findByLabelText(/search this shortlist/i)
    fireEvent.change(search, { target: { value: 'zzzz-no-such-show' } })

    expect(await screen.findByText(/no shows match/i)).toBeInTheDocument()
    expect(screen.queryByText(/no matches yet/i)).not.toBeInTheDocument()

    // Offered twice on purpose: in the controls, and in the empty result itself.
    fireEvent.click(screen.getAllByRole('button', { name: /clear filters/i })[0])
    expect(await screen.findByText('Operations Show 0')).toBeInTheDocument()
  })

  it('keeps the dashboard order until an operator asks for another one', async () => {
    await openAllView()

    const list = await screen.findByText('Operations Show 0')
    expect(list).toBeInTheDocument()

    fireEvent.click(screen.getByLabelText(/sort this shortlist/i))
    fireEvent.click(await screen.findByRole('option', { name: /best fit first/i }))

    const headings = screen.getAllByRole('heading', { level: 4 })
    expect(within(headings[0]).getByText('Private Practice Owners Club')).toBeInTheDocument()
  })
})

describe('WorkspaceProspectDashboards shortlist display', () => {
  const featured = (index: number, overrides: Partial<ProspectShortlistPodcast> = {}) => shortlistPodcast(index, {
    is_featured: true,
    featured_order: index,
    podcast_url: `https://example.com/${index}`,
    ...overrides,
  })

  function renderWith(podcasts: ProspectShortlistPodcast[], readiness: Partial<WorkspaceProspect['readiness']> = {}, extra: Partial<WorkspaceProspect> = {}) {
    const dashboard = { ...prospect, ...extra, readiness: { ...prospect.readiness, ...readiness } }
    mockedUseAuth.mockReturnValue({
      user: { id: userId, email: 'owner@example.com' },
      workspace: { id: workspaceId, name: 'Tenant Workspace', slug: 'tenant-workspace', status: 'active', is_default: false },
      membership: { role: 'owner' },
      signOut: vi.fn(),
    } as never)
    mockedList.mockResolvedValue({ workspace: workspaceSummary, viewer_role: 'owner', can_manage: true, dashboards: [dashboard] })
    mockedDetail.mockResolvedValue({ workspace: workspaceSummary, viewer_role: 'owner', can_manage: true, dashboard, podcasts })
    renderPage()
  }

  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('decodes HTML entities in show titles and publishers', async () => {
    renderWith([featured(1, { podcast_name: 'Self-Awareness &amp; Mindset', publisher_name: 'Tom &amp; Jerry' })])

    expect(await screen.findByText('Self-Awareness & Mindset')).toBeInTheDocument()
    expect(screen.getByText('Tom & Jerry')).toBeInTheDocument()
    expect(screen.queryByText(/&amp;/u)).not.toBeInTheDocument()
  })

  it('shows a show listed under two feeds once, as the larger feed', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined)
    renderWith([
      featured(1, { podcast_name: 'You Turn Podcast w/ Ashley Stahl', publisher_name: 'Ashley Stahl', audience_size: 100 }),
      featured(2),
      featured(3, { podcast_name: 'You Turn Podcast w/ Ashley Stahl', publisher_name: 'Ashley Stahl', audience_size: 600 }),
    ])

    expect(await screen.findAllByText('You Turn Podcast w/ Ashley Stahl')).toHaveLength(1)
    expect(screen.getByText('600 listeners')).toBeInTheDocument()
    expect(screen.queryByText('100 listeners')).not.toBeInTheDocument()
    expect(warn).toHaveBeenCalled()
    warn.mockRestore()
  })

  it('labels the icon buttons and keeps internal match labels off the card', async () => {
    renderWith([featured(1, { match_source: 'semantic' })])

    expect(await screen.findByRole('button', { name: 'Open Operations Show 1' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Unfeature Operations Show 1' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Remove Operations Show 1 from shortlist' })).toBeInTheDocument()
    expect(screen.queryByText(/^semantic$/iu)).not.toBeInTheDocument()
  })

  it('pluralizes counts on the shortlist', async () => {
    renderWith([featured(1, { audience_size: 1, episode_count: 1 })])

    expect(await screen.findByText('1 listener')).toBeInTheDocument()
    expect(screen.getByText('1 episode')).toBeInTheDocument()
  })

  it('states readiness minimums instead of a fraction', async () => {
    renderWith([featured(1)], { visible_count: 12, analyzed_count: 1 })

    expect(await screen.findByText('12 visible matches (min 5)')).toBeInTheDocument()
    expect(screen.getByText('1 explained match (min 5)')).toBeInTheDocument()
    expect(screen.queryByText(/12\/5/u)).not.toBeInTheDocument()
  })

  it('no longer offers the internal "Not analyzed yet" filter', async () => {
    renderWith(Array.from({ length: 10 }, (_, index) => shortlistPodcast(index, { ai_analyzed_at: null })))

    expect(await screen.findByLabelText(/search this shortlist/i)).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /not analyzed yet/i })).not.toBeInTheDocument()
  })

  it('confirms before archiving a prospect', async () => {
    renderWith([featured(1)])

    fireEvent.click(await screen.findByRole('button', { name: /archive prospect/i }))
    const dialog = await screen.findByRole('dialog')
    expect(within(dialog).getByRole('button', { name: /archive dashboard/i })).toBeInTheDocument()
    expect(archiveWorkspaceProspect).not.toHaveBeenCalled()
  })
})

describe('WorkspaceProspectDashboards list', () => {
  const published = '2026-10-01T00:00:00.000Z'
  const ready = { profile_ready: true, visible_count: 12, analyzed_count: 12, featured_count: 5, cta_ready: true, publishable: true }
  const list: WorkspaceProspect[] = [
    { ...prospect, id: 'aaaaaaaa-0000-4000-8000-000000000001', prospect_name: 'Dana Draft', prospect_title: null, updated_at: '2026-10-20T00:00:00.000Z', readiness: { ...prospect.readiness, profile_ready: false } },
    { ...prospect, id: 'aaaaaaaa-0000-4000-8000-000000000002', prospect_name: 'Rory Review', lifecycle_status: 'review', updated_at: '2026-10-19T00:00:00.000Z', readiness: ready },
    { ...prospect, id: 'aaaaaaaa-0000-4000-8000-000000000003', prospect_name: 'Lee Live', lifecycle_status: 'ready', published_at: published, updated_at: '2026-10-18T00:00:00.000Z', readiness: ready, views_last_7_days: 0 },
    { ...prospect, id: 'aaaaaaaa-0000-4000-8000-000000000004', prospect_name: 'Vic Viewed', lifecycle_status: 'viewed', published_at: published, view_count: 3, last_viewed_at: new Date(Date.now() - 2 * 86_400_000).toISOString(), updated_at: '2026-10-17T00:00:00.000Z', readiness: ready, views_last_7_days: 2 },
  ].map((item) => ({ views_last_7_days: 0, ...item }) as WorkspaceProspect)

  beforeEach(() => {
    vi.clearAllMocks()
    window.localStorage.clear()
    mockedUseAuth.mockReturnValue({
      user: { id: userId, email: 'owner@example.com' },
      workspace: { id: workspaceId, name: 'Tenant Workspace', slug: 'tenant-workspace', status: 'active', is_default: false },
      membership: { role: 'owner' },
      signOut: vi.fn(),
    } as never)
    mockedList.mockResolvedValue({ workspace: workspaceSummary, viewer_role: 'owner', can_manage: true, dashboards: list })
    mockedDetail.mockImplementation(async (_workspace, id) => ({
      workspace: workspaceSummary,
      viewer_role: 'owner',
      can_manage: true,
      dashboard: list.find((item) => item.id === id) || list[0],
      podcasts: [],
    }))
  })

  afterEach(() => window.localStorage.clear())

  const location = () => screen.getByTestId('location').textContent
  const filterChip = (name: RegExp) => within(screen.getByRole('group', { name: 'Filter prospects' })).getByRole('button', { name })

  it('keeps a viewed prospect live and says how it was viewed', async () => {
    renderPage({}, '/app/prospects')

    const row = (await screen.findByText('Vic Viewed')).closest('a')!
    expect(within(row).getByText('Live')).toBeInTheDocument()
    expect(within(row).getByText('Viewed 3x, last 2d ago')).toBeInTheDocument()
    expect(within(screen.getByText('Lee Live').closest('a')!).getByText('Not viewed yet')).toBeInTheDocument()
  })

  it('shows what a draft is missing', async () => {
    renderPage({}, '/app/prospects')

    const row = (await screen.findByText('Dana Draft')).closest('a')!
    expect(within(row).getByText('Draft')).toBeInTheDocument()
    expect(within(row).getByText('Missing title, bio, shortlist')).toBeInTheDocument()
  })

  it('counts each prospect in exactly one filter', async () => {
    renderPage({}, '/app/prospects')

    await screen.findByText('Dana Draft')
    expect(filterChip(/^All 4$/u)).toBeInTheDocument()
    expect(filterChip(/^Drafts 1$/u)).toBeInTheDocument()
    expect(filterChip(/^Needs review 1$/u)).toBeInTheDocument()
    expect(filterChip(/^Live, not viewed 1$/u)).toBeInTheDocument()
    expect(filterChip(/^Live, viewed 1$/u)).toBeInTheDocument()
    expect(screen.queryByText(/to review$/u)).not.toBeInTheDocument()
  })

  it('filters through the address and carries the filter into a prospect and back', async () => {
    renderPage({}, '/app/prospects')

    await screen.findByText('Dana Draft')
    fireEvent.click(filterChip(/^Live, viewed/u))
    await waitFor(() => expect(location()).toBe('/app/prospects?filter=live_viewed'))
    expect(screen.queryByText('Lee Live')).not.toBeInTheDocument()

    fireEvent.click(screen.getByText('Vic Viewed'))
    await waitFor(() => expect(location()).toBe('/app/prospects/aaaaaaaa-0000-4000-8000-000000000004?filter=live_viewed'))
    expect(await screen.findByRole('link', { name: /all prospects/i })).toHaveAttribute('href', '/app/prospects?filter=live_viewed')
  })

  it('moves to the previous and next prospect within the list', async () => {
    renderPage({}, '/app/prospects/aaaaaaaa-0000-4000-8000-000000000002')

    // Last activity counts views, so Vic's view two days ago puts Vic first.
    expect(await screen.findByText('3 of 4')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Previous prospect' })).toHaveAttribute('href', '/app/prospects/aaaaaaaa-0000-4000-8000-000000000001')
    expect(screen.getByRole('link', { name: 'Next prospect' })).toHaveAttribute('href', '/app/prospects/aaaaaaaa-0000-4000-8000-000000000003')
  })

  it('moves an old ?prospect= link onto the prospect path', async () => {
    renderPage({}, '/app/prospects?prospect=aaaaaaaa-0000-4000-8000-000000000003&view=all')

    await waitFor(() => expect(location()).toBe('/app/prospects/aaaaaaaa-0000-4000-8000-000000000003?view=all'))
  })

  it('remembers the chosen sort', async () => {
    renderPage({}, '/app/prospects')

    fireEvent.click(await screen.findByLabelText('Sort prospects'))
    fireEvent.click(await screen.findByRole('option', { name: 'Name' }))

    await waitFor(() => expect(location()).toBe('/app/prospects?sort=name'))
    expect(window.localStorage.getItem('goap:prospect-studio:sort')).toBe('name')
    const names = screen.getAllByRole('link').map((link) => link.textContent).filter((text) => /Dana|Rory|Lee|Vic/u.test(text || ''))
    expect(names[0]).toMatch(/^Dana Draft/u)
    expect(names[1]).toMatch(/^Lee Live/u)
  })

  it('makes the summary numbers filters and shows views for the last week', async () => {
    renderPage({}, '/app/prospects')

    fireEvent.click(await screen.findByRole('button', { name: /2\s*views, last 7 days/u }))
    await waitFor(() => expect(location()).toBe('/app/prospects?filter=live_viewed'))
    fireEvent.click(screen.getByRole('button', { name: /^2\s*live$/u }))
    await waitFor(() => expect(location()).toBe('/app/prospects?filter=live'))
    expect(screen.queryByText('Dana Draft')).not.toBeInTheDocument()
    expect(screen.getByText('Lee Live')).toBeInTheDocument()
  })

  it('keeps the tagline for the empty state only', async () => {
    renderPage({}, '/app/prospects')
    await screen.findByText('Dana Draft')
    expect(screen.queryByText(/share-ready podcast shortlist/u)).not.toBeInTheDocument()

    cleanup()
    mockedList.mockResolvedValue({ workspace: workspaceSummary, viewer_role: 'owner', can_manage: true, dashboards: [] })
    renderPage({}, '/app/prospects')
    expect(await screen.findByText(/share-ready podcast shortlist/u)).toBeInTheDocument()
  })

  it('warns before creating a prospect that already exists', async () => {
    renderPage({}, '/app/prospects')

    fireEvent.click((await screen.findAllByRole('button', { name: /new prospect/i }))[0])
    fireEvent.change(await screen.findByLabelText('Name'), { target: { value: '  lee   live ' } })

    expect(await screen.findByText('A prospect named Lee Live already exists.')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Open existing' })).toHaveAttribute('href', '/app/prospects/aaaaaaaa-0000-4000-8000-000000000003')
    expect(screen.getByRole('button', { name: 'Create anyway' })).toBeInTheDocument()
  })

  it('archives every selected prospect in the current view after confirming', async () => {
    vi.mocked(archiveWorkspaceProspect).mockResolvedValue(undefined)
    renderPage({}, '/app/prospects?filter=live')

    fireEvent.click(await screen.findByRole('checkbox', { name: 'Select all prospects in this view' }))
    expect(screen.getByText('2 selected')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Archive' }))
    const dialog = await screen.findByRole('dialog')
    fireEvent.click(within(dialog).getByRole('button', { name: 'Archive' }))

    await waitFor(() => expect(archiveWorkspaceProspect).toHaveBeenCalledTimes(2))
    expect(archiveWorkspaceProspect).toHaveBeenCalledWith(workspaceId, 'aaaaaaaa-0000-4000-8000-000000000003')
    expect(archiveWorkspaceProspect).toHaveBeenCalledWith(workspaceId, 'aaaaaaaa-0000-4000-8000-000000000004')
  })
})

describe('WorkspaceProspectDashboards next step and outcome', () => {
  const liveId = 'bbbbbbbb-0000-4000-8000-000000000001'
  const ready = { profile_ready: true, visible_count: 12, analyzed_count: 12, featured_count: 5, cta_ready: true, publishable: true }
  const live: WorkspaceProspect = {
    ...prospect,
    id: liveId,
    prospect_name: 'Tyler Brennan',
    first_name: 'Tyler',
    lifecycle_status: 'ready',
    published_at: '2026-08-04T00:00:00.000Z',
    readiness: ready,
    outcome: null,
    outcome_at: null,
  }

  function renderProspect(dashboard: WorkspaceProspect, others: WorkspaceProspect[] = [], entry = `/app/prospects/${dashboard.id}`) {
    mockedUseAuth.mockReturnValue({
      user: { id: userId, email: 'owner@example.com' },
      workspace: { id: workspaceId, name: 'Tenant Workspace', slug: 'tenant-workspace', status: 'active', is_default: false },
      membership: { role: 'owner' },
      signOut: vi.fn(),
    } as never)
    mockedList.mockResolvedValue({ workspace: workspaceSummary, viewer_role: 'owner', can_manage: true, dashboards: [dashboard, ...others] })
    mockedDetail.mockResolvedValue({ workspace: workspaceSummary, viewer_role: 'owner', can_manage: true, dashboard, podcasts: [] })
    renderPage({}, entry)
  }

  beforeEach(() => {
    vi.clearAllMocks()
    Object.assign(navigator, { clipboard: { writeText: vi.fn().mockResolvedValue(undefined) } })
  })

  it('asks for the link to be sent, and records the copy', async () => {
    const copied = { ...live, sent_at: '2026-10-20T10:00:00.000Z', lifecycle_status: 'sent' as const }
    vi.mocked(markWorkspaceProspectLinkCopied).mockResolvedValue({ dashboard: copied, podcasts: [] })
    renderProspect(live)

    expect(await screen.findByText('Send the private link')).toBeInTheDocument()
    expect(screen.getByText('Tyler has not received their link yet.')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Copy private link' }))

    await waitFor(() => expect(markWorkspaceProspectLinkCopied).toHaveBeenCalledWith(workspaceId, liveId))
    expect(navigator.clipboard.writeText).toHaveBeenCalledWith(expect.stringContaining('/prospect/'))
    expect(await screen.findByText(/^Link copied Oct 20$/u)).toBeInTheDocument()
  })

  it('offers to book the call while the prospect is warm', async () => {
    vi.mocked(setWorkspaceProspectOutcome).mockResolvedValue({ dashboard: { ...live, outcome: 'call_booked', outcome_at: new Date().toISOString() }, podcasts: [] })
    renderProspect({ ...live, sent_at: '2026-10-01T00:00:00.000Z', view_count: 4, last_viewed_at: new Date(Date.now() - 86_400_000).toISOString() })

    expect(await screen.findByText('Follow up while it is warm')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Mark call booked' }))
    await waitFor(() => expect(setWorkspaceProspectOutcome).toHaveBeenCalledWith(workspaceId, liveId, 'call_booked'))
    expect(await screen.findByText('Call booked', { selector: 'h3' })).toBeInTheDocument()
  })

  it('sets the outcome from the header', async () => {
    vi.mocked(setWorkspaceProspectOutcome).mockResolvedValue({ dashboard: { ...live, outcome: 'won', outcome_at: new Date().toISOString() }, podcasts: [] })
    renderProspect(live)

    fireEvent.click(await screen.findByRole('combobox', { name: 'Outcome' }))
    fireEvent.click(await screen.findByRole('option', { name: 'Won' }))
    await waitFor(() => expect(setWorkspaceProspectOutcome).toHaveBeenCalledWith(workspaceId, liveId, 'won'))
  })

  it('folds a live prospect\'s finished checklists into one line', async () => {
    renderProspect(live)

    expect(await screen.findByText(/^Published Aug 4 · 100% ready$/u)).toBeInTheDocument()
    expect(screen.queryByText('Publishing progress')).not.toBeInTheDocument()
    expect(screen.queryByText('Publish readiness')).not.toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: /show details/i }))
    expect(screen.getByText('Publishing progress')).toBeInTheDocument()
    expect(screen.getByText('Publish readiness')).toBeInTheDocument()
  })

  it('keeps the checklists open before a prospect is live', async () => {
    renderProspect({ ...live, published_at: null })

    expect(await screen.findByText('Review and publish')).toBeInTheDocument()
    expect(screen.getByText('Publishing progress')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /show details/i })).not.toBeInTheDocument()
  })

  it('moves won prospects out of the default list and under their own filter', async () => {
    const won = { ...live, id: 'bbbbbbbb-0000-4000-8000-000000000002', prospect_name: 'Wanda Won', outcome: 'won' as const, outcome_at: '2026-10-21T00:00:00.000Z' }
    renderProspect(live, [won], '/app/prospects')

    await screen.findByText('Tyler Brennan')
    expect(screen.queryByText('Wanda Won')).not.toBeInTheDocument()
    fireEvent.click(within(screen.getByRole('group', { name: 'Filter by outcome' })).getByRole('button', { name: /^Won 1$/u }))
    const row = (await screen.findByText('Wanda Won')).closest('a')!
    // Once for narrow screens and once in the desktop column; CSS shows one.
    expect(within(row).getAllByText('Won').length).toBeGreaterThan(0)
    expect(screen.queryByText('Tyler Brennan')).not.toBeInTheDocument()
  })
})
