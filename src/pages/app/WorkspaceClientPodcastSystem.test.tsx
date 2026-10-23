import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { fireEvent, render, screen, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useAuth } from '@/contexts/AuthContext'
import WorkspaceClientPodcastSystem from '@/pages/app/WorkspaceClientPodcastSystem'
import {
  getWorkspaceClientPodcastSystem,
  type ClientPodcastSystemItem,
  type ClientPodcastSystemResponse,
} from '@/services/clientPodcastSystem'

// The page mounts the booking dialog, which reaches services that build a
// Supabase client at import time. The suite runs without env, so stub it.
vi.mock('@/lib/supabase', () => ({ supabase: { functions: { invoke: vi.fn() } } }))
vi.mock('@/contexts/AuthContext', () => ({ useAuth: vi.fn() }))
vi.mock('@/services/clientPodcastSystem', () => ({ getWorkspaceClientPodcastSystem: vi.fn() }))
/*
 * Surfaces the booking seed rather than driving the real dialog, because the
 * defect this pins is entirely in which id the page hands over.
 */
vi.mock('@/components/workspace/ClientBookingDialog', () => ({
  ClientBookingDialog: ({ open, booking }: {
    open: boolean
    booking?: { shortlist_podcast_id: string | null } | null
  }) => (open ? <div>seeded shortlist row {booking?.shortlist_podcast_id ?? 'none'}</div> : null),
}))
vi.mock('@/components/workspace/WorkspaceLayout', () => ({
  // Surfaces the branding the shell would draw, so the platform view's logo is
  // assertable without rendering the real sidebar.
  WorkspaceLayout: ({ children, platformWorkspace }: {
    children: React.ReactNode
    platformWorkspace?: { logoUrl?: string | null; workspaceName?: string }
  }) => (
    <div>
      {platformWorkspace && (
        <img src={platformWorkspace.logoUrl || ''} alt={`${platformWorkspace.workspaceName} shell logo`} />
      )}
      {children}
    </div>
  ),
}))

const mockedUseAuth = vi.mocked(useAuth)
const mockedGetSystem = vi.mocked(getWorkspaceClientPodcastSystem)
const workspaceId = '11111111-1111-4111-8111-111111111111'
const clientId = '22222222-2222-4222-8222-222222222222'
const formerClientId = '99999999-9999-4999-8999-999999999999'

const awaitingReview: ClientPodcastSystemItem = {
  id: 'shortlist-one',
  client: { id: clientId, name: 'Taylor Client', status: 'active', photo_url: null },
  podcast: {
    id: '33333333-3333-4333-8333-333333333333',
    podscan_id: 'podscan-one',
    name: 'Founder Frequency',
    description: 'Founder interviews.',
    image_url: null,
    url: 'https://podcasts.example.com/founder-frequency',
    publisher_name: 'Frequency Media',
    host_name: 'Morgan Host',
    audience_size: 25_000,
    last_posted_at: '2026-07-20T12:00:00.000Z',
  },
  stage: 'awaiting_review',
  outcome: null,
  terminal: false,
  has_conflict: false,
  next_action: 'Get the client decision',
  contact: { available: false, source: 'none', email: null, verified_at: null },
  decision: { status: null, notes: null, updated_at: null },
  analysis: {
    source: 'normalized',
    clean_description: 'A practical founder show for growth-stage operators.',
    fit_reasons: ['Taylor has operating experience that fits this audience.'],
    pitch_angles: [{ title: 'Durable growth', description: 'How founders can scale without operational debt.' }],
    analyzed_at: '2026-07-24T12:00:00.000Z',
  },
  campaign: null,
  legacy_outreach_at: null,
  conversation: null,
  booking: null,
  operator_notes: null,
  shortlist_created_at: '2026-07-20T12:00:00.000Z',
  shortlist_updated_at: '2026-07-24T12:00:00.000Z',
  last_activity_at: '2026-07-24T12:00:00.000Z',
}

const ready: ClientPodcastSystemItem = {
  ...awaitingReview,
  id: 'shortlist-two',
  podcast: {
    ...awaitingReview.podcast,
    id: '44444444-4444-4444-8444-444444444444',
    podscan_id: 'podscan-two',
    name: 'Operator Stories',
    url: 'https://podcasts.example.com/operator-stories',
    host_name: 'Jamie Operator',
  },
  stage: 'ready',
  next_action: 'Launch the reviewed campaign pitch',
  contact: {
    available: true,
    source: 'direct',
    email: 'jamie@operator.example',
    verified_at: '2026-07-24T10:00:00.000Z',
  },
  decision: {
    status: 'approved',
    notes: 'Strong fit for the launch.',
    updated_at: '2026-07-23T12:00:00.000Z',
  },
  campaign: {
    id: '55555555-5555-4555-8555-555555555555',
    target_id: '66666666-6666-4666-8666-666666666666',
    status: 'ready',
    research_ready: true,
    pitch_ready: true,
    open_count: 0,
    reply_count: 0,
    launched_at: null,
    last_activity_at: null,
    last_error: null,
  },
}

const published: ClientPodcastSystemItem = {
  ...awaitingReview,
  id: 'shortlist-three',
  podcast: {
    ...awaitingReview.podcast,
    id: '77777777-7777-4777-8777-777777777777',
    podscan_id: 'podscan-three',
    name: 'Scale Notes',
    url: 'https://podcasts.example.com/scale-notes',
    host_name: 'Alex Scale',
  },
  stage: 'published',
  terminal: true,
  next_action: null,
  decision: { status: 'approved', notes: null, updated_at: '2026-06-01T12:00:00.000Z' },
  booking: {
    id: '88888888-8888-4888-8888-888888888888',
    match: 'podcast_id',
    status: 'published',
    host_name: 'Alex Scale',
    scheduled_date: '2026-06-10',
    recording_date: '2026-06-12',
    publish_date: '2026-07-01',
    episode_url: 'https://podcasts.example.com/scale-notes/episode-42',
    prep_sent: true,
    notes: null,
    created_at: '2026-06-01T12:00:00.000Z',
    updated_at: '2026-07-01T12:00:00.000Z',
  },
  last_activity_at: '2026-07-01T12:00:00.000Z',
}

const response: ClientPodcastSystemResponse = {
  workspace: {
    id: workspaceId,
    name: 'Acme Workspace',
    logo_path: `${workspaceId}/66666666-6666-4666-8666-666666666666.png`,
    logo_updated_at: '2026-07-25T11:00:00.000Z',
  },
  viewer_role: 'owner',
  can_manage: true,
  generated_at: '2026-07-25T12:00:00.000Z',
  clients: [{
    id: clientId,
    name: 'Taylor Client',
    status: 'active',
    photo_url: null,
    email: 'taylor@example.com',
    contact_person: null,
    website: null,
    bio: null,
    profile: {
      ready: true,
      completed_fields: 4,
      total_fields: 6,
      positioning: 'Fintech founder',
      updated_at: '2026-07-01T12:00:00.000Z',
      has_calendar: true,
      has_media_kit: false,
    },
    dashboard_configured: true,
    portal: { enabled: true, last_login_at: null },
    onboarding: null,
    podcast_count: 3,
    created_at: '2026-06-01T12:00:00.000Z',
    updated_at: '2026-07-01T12:00:00.000Z',
    last_activity_at: '2026-07-01T12:00:00.000Z',
  }, {
    id: formerClientId,
    name: 'Jordan Former',
    status: 'churned',
    photo_url: null,
    email: 'jordan@example.com',
    contact_person: null,
    website: null,
    bio: null,
    profile: {
      ready: false,
      completed_fields: 0,
      total_fields: 6,
      positioning: null,
      updated_at: null,
      has_calendar: false,
      has_media_kit: false,
    },
    dashboard_configured: false,
    portal: { enabled: false, last_login_at: null },
    onboarding: null,
    podcast_count: 0,
    created_at: '2026-05-01T12:00:00.000Z',
    updated_at: '2026-06-01T12:00:00.000Z',
    last_activity_at: '2026-06-01T12:00:00.000Z',
  }],
  summary: {
    total: 3,
    active: 2,
    completed: 1,
    needs_attention: 0,
    upcoming_recordings: 0,
    awaiting_publication: 0,
    stage_counts: {
      awaiting_review: 1,
      approved: 0,
      contact_needed: 0,
      research_needed: 0,
      ready: 1,
      outreach: 0,
      conversation: 0,
      booked: 0,
      recorded: 0,
      published: 1,
    },
  },
  items: [awaitingReview, ready, published],
}

function renderPage(path = '/app/client-podcast-system', platformWorkspaceId?: string) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={[path]} future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
        <WorkspaceClientPodcastSystem platformWorkspaceId={platformWorkspaceId} />
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

describe('WorkspaceClientPodcastSystem', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockedUseAuth.mockReturnValue({
      user: { id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', email: 'owner@example.com' },
      workspace: {
        id: workspaceId,
        name: 'Acme Workspace',
        logo_path: `${workspaceId}/66666666-6666-4666-8666-666666666666.png`,
        logo_updated_at: '2026-07-25T11:00:00.000Z',
      },
      membership: { role: 'owner', full_name: 'Workspace Owner' },
      isPlatformAdmin: false,
    } as never)
    mockedGetSystem.mockResolvedValue(response)
  })

  /*
   * This was the one page that sent the shell no logo, so an operator walking
   * Clients → Pipeline watched the tenant's mark drop to initials and return
   * on the next page. Nothing about the logo was wrong; the payload simply
   * never carried it.
   */
  it('brands the shell with the viewed workspace logo like every neighbouring page', async () => {
    renderPage(`/app/workspaces/${workspaceId}/client-podcast-system`, workspaceId)

    const logo = await screen.findByRole('img', { name: 'Acme Workspace shell logo' })
    expect(logo).toHaveAttribute(
      'src',
      expect.stringContaining(`${workspaceId}/66666666-6666-4666-8666-666666666666.png`),
    )
  })

  // The bundle and the function ship separately, so a page can be talking to a
  // function deployed before this field existed. No logo, not a broken one.
  it('draws no logo rather than a broken one when the payload predates the field', async () => {
    mockedGetSystem.mockResolvedValue({
      ...response,
      workspace: { id: workspaceId, name: 'Acme Workspace' },
    } as never)

    renderPage(`/app/workspaces/${workspaceId}/client-podcast-system`, workspaceId)

    const logo = await screen.findByRole('img', { name: 'Acme Workspace shell logo' })
    expect(logo).toHaveAttribute('src', '')
  })

  /*
   * bookings_shortlist_podcast_fk points at client_dashboard_podcasts by
   * (client_id, shortlist_podcast_id). The page was seeding the dialog with
   * item.podcast.id, the global catalog row, so the insert failed the
   * constraint and every placement logged from this page came back "The
   * placement could not be saved". Not an edge case: the whole action.
   */
  it('hands the booking dialog the shortlist row, not the catalog show', async () => {
    mockedGetSystem.mockResolvedValue({
      ...response,
      items: [{ ...ready, booking: null }],
    } as never)

    renderPage(`/app/client-podcast-system?client=${clientId}&podcast=${ready.podcast.podscan_id}`)

    fireEvent.click(await screen.findByRole('button', { name: /log a placement/i }))

    expect(await screen.findByText(`seeded shortlist row ${ready.id}`)).toBeInTheDocument()
    // The id the constraint rejects.
    expect(screen.queryByText(`seeded shortlist row ${ready.podcast.id}`)).not.toBeInTheDocument()
  })

  it('puts a host reply in the queue once, as the button that answers it', async () => {
    mockedGetSystem.mockResolvedValue({
      ...response,
      items: [{
        ...ready,
        stage: 'conversation',
        conversation: { thread_key: 'thread-42', status: 'needs_reply', replied: true, updated_at: '2026-07-27T10:00:00Z' },
      }],
    } as never)

    renderPage()

    const today = await screen.findByRole('region', { name: /Today/ })
    expect(within(today).getByRole('heading', { name: 'Today · 1 action' })).toBeInTheDocument()
    // Neutral, not the old amber "due soon".
    const reply = within(today).getByRole('button', { name: 'Reply to 1 host: Operator Stories for Taylor Client' })
    expect(reply).not.toHaveClass('bg-amber-400')
    // The card points at the queue instead of repeating the action.
    expect(screen.getAllByRole('button', { name: /^Reply to/ })).toHaveLength(1)
    expect(screen.getByRole('link', { name: '1 action for Taylor Client in Today' })).toBeInTheDocument()

    fireEvent.click(reply)
    const details = await screen.findByRole('dialog')
    expect(within(details).getByRole('heading', { name: 'Operator Stories' })).toBeInTheDocument()
    expect(within(details).getByRole('link', { name: 'Client shortlist' })).toHaveAttribute('href', `/app/clients/${clientId}?tab=shortlist`)
    expect(within(details).getByRole('link', { name: 'Client campaign' })).toHaveAttribute('href', `/app/client-campaigns/${clientId}`)
  })

  it('opens the placement a reply belongs to when the inbox links back', async () => {
    mockedGetSystem.mockResolvedValue({
      ...response,
      items: [{ ...ready, conversation: null }],
    } as never)

    renderPage(`/app/client-podcast-system?client=${clientId}&podcast=${ready.podcast.podscan_id}`)

    // Resolved by show, because a thread knows the podcast and not the
    // shortlist row it came from.
    const sheet = await screen.findByRole('dialog')
    expect(within(sheet).getByText(ready.podcast.name)).toBeInTheDocument()
  })

  /*
   * The queue is the only thing this page does now. A client's own tabs live
   * on the client record, so every per-client action here links there rather
   * than repeating it.
   */
  it('is the cross-client work queue, with each next action opening where the work is done', async () => {
    renderPage()

    expect(await screen.findByRole('heading', { name: 'Pipeline' })).toBeInTheDocument()
    expect(screen.queryByText('Private workspace overview')).not.toBeInTheDocument()
    expect(screen.queryByRole('tab', { name: /Podcasts/ })).not.toBeInTheDocument()
    expect(screen.queryByRole('tab', { name: /Placements/ })).not.toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'All clients' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Taylor Client' })).toBeInTheDocument()
    // The in-list client picker is gone: the header's working client does that.
    expect(screen.queryByRole('combobox', { name: 'Filter by client' })).not.toBeInTheDocument()
    expect(screen.queryByRole('link', { name: 'Clients' })).not.toBeInTheDocument()

    // Churned clients wait, collapsed, below the active list.
    expect(screen.queryByRole('heading', { name: 'Jordan Former' })).not.toBeInTheDocument()
    const churned = screen.getByRole('button', { name: 'Churned (1)' })
    expect(churned).toHaveAttribute('aria-expanded', 'false')
    fireEvent.click(churned)
    expect(screen.getByRole('heading', { name: 'Jordan Former' })).toBeInTheDocument()
    expect(screen.queryByText('Client is no longer active')).not.toBeInTheDocument()

    // Review decisions are one batch row per client, never a row per podcast.
    const today = screen.getByRole('region', { name: /Today/ })
    expect(within(today).getByText("1 podcast waiting on Taylor's review")).toBeInTheDocument()
    expect(within(today).getByRole('link', { name: /^Open review batch/ })).toHaveAttribute(
      'href',
      `/app/clients/${clientId}?tab=shortlist&filter=not_reviewed`,
    )
    expect(within(today).queryByText('Jordan Former')).not.toBeInTheDocument()
    expect(screen.queryByText('Founder Frequency')).not.toBeInTheDocument()
    // The old per-podcast attention list, and its "Show all", are gone.
    expect(screen.queryByRole('heading', { name: 'Needs attention' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /^Show all/ })).not.toBeInTheDocument()

    // The tile is the queue's length.
    expect(screen.getByRole('button', { name: /Need attention/ })).toHaveTextContent(/^1\s*Need attention$/)

    // Taylor has a published placement and no intake on record, which is not
    // "not started": setup counts as complete.
    expect(screen.getByText('Set up')).toBeInTheDocument()
    expect(screen.queryByRole('link', { name: /^Setup \d/ })).not.toBeInTheDocument()

    // Every funnel count leads to that client's filtered list.
    expect(screen.getByRole('link', { name: '1 to review for Taylor Client' })).toHaveAttribute(
      'href',
      `/app/clients/${clientId}?tab=shortlist&filter=not_reviewed`,
    )
    expect(screen.getByRole('link', { name: '1 placements for Taylor Client' })).toHaveAttribute('href', `/app/clients/${clientId}?tab=placements`)

    // A row expands to its setup and its client record.
    fireEvent.click(screen.getByRole('button', { name: 'Taylor Client' }))
    expect(screen.getByRole('button', { name: 'Taylor Client' })).toHaveAttribute('aria-expanded', 'true')
    expect(screen.getByRole('link', { name: 'Open client record' })).toHaveAttribute('href', `/app/clients/${clientId}`)
    expect(screen.getByText(/Done outside intake/)).toBeInTheDocument()

    // A churned client has nothing to open.
    expect(screen.queryByRole('link', { name: /actions? for Jordan Former/ })).not.toBeInTheDocument()

    expect(mockedGetSystem).toHaveBeenCalledWith(workspaceId)
  })

  // Reply brief and onboarding gaps are on the Setup chip; the queue does not say them again.
  it('leaves setup gaps to the Setup chip rather than the queue', async () => {
    mockedGetSystem.mockResolvedValue({
      ...response,
      clients: [{ ...response.clients[0], profile: { ...response.clients[0].profile, ready: false } }],
      items: [published],
    } as never)

    renderPage()

    expect(await screen.findByText(/Nothing to do right now/)).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /^Setup 3\/4 for Taylor Client: missing reply brief/ })).toHaveAttribute(
      'href',
      `/app/clients/${clientId}?tab=profile`,
    )
    expect(screen.getByRole('button', { name: /Need attention/ })).toHaveTextContent(/^0\s*Need attention$/)
  })

  it('filters the client list by a portfolio stat until the filter is cleared', async () => {
    renderPage()

    const attention = await screen.findByRole('button', { name: /Need attention/ })
    expect(attention).toHaveAttribute('aria-pressed', 'false')
    fireEvent.click(attention)

    expect(attention).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByRole('status')).toHaveTextContent('Showing clients in Need attention')
    expect(screen.getByRole('heading', { name: 'Taylor Client' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /^Churned/ })).not.toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: /Clear filter/ }))
    expect(attention).toHaveAttribute('aria-pressed', 'false')
    expect(screen.getByRole('button', { name: 'Churned (1)' })).toBeInTheDocument()
  })

  it('lists every client a stat counts, including paused ones a narrower status filter hides', async () => {
    const pausedId = '12121212-1212-4212-8212-121212121212'
    mockedGetSystem.mockResolvedValue({
      ...response,
      clients: [...response.clients, { ...response.clients[0], id: pausedId, name: 'Pat Paused', status: 'paused' }],
      items: [...response.items, { ...published, id: 'paused-published', client: { ...published.client, id: pausedId, name: 'Pat Paused', status: 'paused' } }],
    } as never)

    renderPage()

    // Paused clients are in the default view; narrowing to Active hides them.
    expect(await screen.findByRole('heading', { name: 'Pat Paused' })).toBeInTheDocument()
    fireEvent.click(screen.getByRole('combobox', { name: 'Filter clients by status' }))
    fireEvent.click(screen.getByRole('option', { name: 'Active clients' }))
    expect(screen.queryByRole('heading', { name: 'Pat Paused' })).not.toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: /Published episodes/ }))
    expect(screen.getByRole('heading', { name: 'Pat Paused' })).toBeInTheDocument()
    expect(screen.getByRole('combobox', { name: 'Filter clients by status' })).toHaveTextContent('All statuses')
  })

  it('says so instead of showing an empty queue when no client has an action', async () => {
    mockedGetSystem.mockResolvedValue({ ...response, items: [published] } as never)

    renderPage()

    expect(await screen.findByText(/Nothing to do right now/)).toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: /Today/ })).not.toBeInTheDocument()
  })

  it('marks an active client stale past the threshold, and says nothing before it', async () => {
    const daysAgo = (days: number) => new Date(Date.now() - days * 86_400_000).toISOString()
    const recentId = '13131313-1313-4313-8313-131313131313'
    mockedGetSystem.mockResolvedValue({
      ...response,
      clients: [
        { ...response.clients[0], last_activity_at: daysAgo(80) },
        { ...response.clients[0], id: recentId, name: 'Riley Recent', last_activity_at: daysAgo(10) },
        { ...response.clients[1], last_activity_at: daysAgo(90) },
      ],
      items: [{ ...awaitingReview, last_activity_at: daysAgo(80) }],
    } as never)

    renderPage()

    const taylor = (await screen.findByRole('heading', { name: 'Taylor Client' })).closest('article') as HTMLElement
    expect(within(taylor).getByText('No activity in 80 days')).toBeInTheDocument()
    expect(taylor).toHaveAttribute('data-stale', 'true')
    // Stale replaces the green "active" pill rather than sitting beside it.
    expect(within(taylor).getByText('stale')).toBeInTheDocument()
    expect(within(taylor).queryByText('active')).not.toBeInTheDocument()

    const riley = screen.getByRole('heading', { name: 'Riley Recent' }).closest('article') as HTMLElement
    expect(within(riley).queryByText(/No activity in/)).not.toBeInTheDocument()
    expect(riley).not.toHaveAttribute('data-stale')

    // A churned client is quiet on purpose.
    fireEvent.click(screen.getByRole('button', { name: 'Churned (1)' }))
    const jordan = screen.getByRole('heading', { name: 'Jordan Former' }).closest('article') as HTMLElement
    expect(within(jordan).queryByText(/No activity in/)).not.toBeInTheDocument()
  })

  // The nav and the client record open this page on one client. That narrows
  // the queue rather than opening a second copy of the client's tabs.
  it('narrows the queue to the client the address names, until cleared', async () => {
    renderPage(`/app/client-podcast-system?client=${clientId}`)

    expect(await screen.findByRole('heading', { name: 'Taylor Client' })).toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: 'Jordan Former' })).not.toBeInTheDocument()
    expect(screen.getByText(/Showing/)).toHaveTextContent('Taylor Client')

    fireEvent.click(screen.getByRole('button', { name: 'Show all clients' }))
    expect(await screen.findByRole('button', { name: 'Churned (1)' })).toBeInTheDocument()
  })

  // Churned clients wait in their own section by default and are one filter
  // away from the main list; their next action is nothing to open.
  it('keeps churned clients out of the default list and reachable by status', async () => {
    renderPage()

    expect(await screen.findByRole('heading', { name: 'Taylor Client' })).toBeInTheDocument()
    const statusFilter = screen.getByRole('combobox', { name: 'Filter clients by status' })
    expect(statusFilter).toHaveTextContent('Active and paused')
    expect(screen.queryByRole('heading', { name: 'Jordan Former' })).not.toBeInTheDocument()

    fireEvent.click(statusFilter)
    fireEvent.click(screen.getByRole('option', { name: 'Churned clients' }))

    expect(await screen.findByRole('heading', { name: 'Jordan Former' })).toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: 'Taylor Client' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Churned (1)' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /^(?!More ).* for Jordan Former/ })).not.toBeInTheDocument()
  })

  /*
   * The row reads the server's client-level activity, which counts only real
   * events. Item timestamps include shortlist edits and backfills, and folding
   * them in had every row showing the day a migration ran.
   */
  it('shows the reply brief gap, real last activity and onboarding from pipeline history', async () => {
    mockedGetSystem.mockResolvedValue({
      ...response,
      clients: [
        { ...response.clients[0], profile: { ...response.clients[0].profile, ready: false, completed_fields: 2 } },
        { ...response.clients[1], status: 'active', last_activity_at: null },
      ],
    } as never)

    renderPage()

    // The setup chip names the gap and goes straight to it.
    expect(await screen.findByRole('link', { name: 'Setup 3/4 for Taylor Client: missing reply brief. Go to reply brief' })).toHaveAttribute(
      'href',
      `/app/clients/${clientId}?tab=profile`,
    )

    fireEvent.click(screen.getByRole('button', { name: 'Taylor Client' }))
    expect(screen.getByText('Jul 1, 2026, 12:00 PM')).toBeInTheDocument()
    expect(screen.getByText(/2\/6 sections complete/)).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Fix reply brief for Taylor Client' })).toHaveAttribute('href', `/app/clients/${clientId}?tab=profile`)

    // No pipeline history and no intake: genuinely not started.
    const jordan = screen.getByRole('heading', { name: 'Jordan Former' }).closest('article') as HTMLElement
    expect(within(jordan).getByText('No activity recorded yet')).toBeInTheDocument()
    fireEvent.click(within(jordan).getByRole('button', { name: 'Jordan Former' }))
    expect(within(jordan).getByText(/Not started/)).toBeInTheDocument()
  })

  it('keeps raw contact emails out of the member-safe lifecycle response', async () => {
    mockedUseAuth.mockReturnValue({
      user: { id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', email: 'member@example.com' },
      workspace: {
        id: workspaceId,
        name: 'Acme Workspace',
        logo_path: `${workspaceId}/66666666-6666-4666-8666-666666666666.png`,
        logo_updated_at: '2026-07-25T11:00:00.000Z',
      },
      membership: { role: 'member', full_name: 'Workspace Member' },
      isPlatformAdmin: false,
    } as never)
    // Emails stay populated so this exercises the component's own canManage gate,
    // not just server-side redaction (covered by the edge contract script).
    mockedGetSystem.mockResolvedValue({
      ...response,
      viewer_role: 'member',
      can_manage: false,
      items: [awaitingReview, { ...ready, stage: 'conversation' }, published],
    })

    renderPage(`/app/client-podcast-system?client=${clientId}`)
    fireEvent.click(await screen.findByRole('button', { name: 'Taylor Client' }))
    expect(screen.getByText(/Owner\/admin only/)).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: /^Reply to 1 host: Operator Stories/ }))

    const details = await screen.findByRole('dialog')
    expect(within(details).queryByText('jamie@operator.example')).not.toBeInTheDocument()
    expect(within(details).getByText(/Owners and admins manage client decisions/i)).toBeInTheDocument()
  })
})
