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

  it('shows a host reply in the attention list without opening anything', async () => {
    mockedGetSystem.mockResolvedValue({
      ...response,
      items: [{
        ...ready,
        conversation: { thread_key: 'thread-42', status: 'needs_reply', replied: true, updated_at: '2026-07-27T10:00:00Z' },
      }],
    } as never)

    renderPage()

    expect((await screen.findAllByText('Host replied')).length).toBeGreaterThan(0)
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
    expect(screen.getByRole('heading', { name: 'Jordan Former' })).toBeInTheDocument()
    expect(screen.getByText('Get client podcast decisions')).toBeInTheDocument()
    expect(screen.getByText(/Onboarding not started · Dashboard live · Portal enabled/)).toBeInTheDocument()

    // Every client links to its record, and the churned client's next action
    // is nothing to open.
    const links = screen.getAllByRole('link', { name: 'Client record' })
    expect(links[0]).toHaveAttribute('href', `/app/clients/${clientId}`)
    expect(links[1]).toHaveAttribute('href', `/app/clients/${formerClientId}`)
    expect(screen.queryByRole('link', { name: 'Open Jordan Former next action' })).not.toBeInTheDocument()

    // The attention list holds live work across clients; finished work is not there.
    const attention = screen.getByRole('heading', { name: 'Needs attention' }).closest('div')?.parentElement as HTMLElement
    expect(within(attention).getByText('Founder Frequency')).toBeInTheDocument()
    expect(within(attention).getByText('Operator Stories')).toBeInTheDocument()
    expect(screen.queryByText('Scale Notes')).not.toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Open Taylor Client next action' }))
    const details = await screen.findByRole('dialog')
    expect(within(details).getByRole('heading', { name: 'Founder Frequency' })).toBeInTheDocument()
    expect(within(details).getByRole('link', { name: 'Client shortlist' })).toHaveAttribute(
      'href',
      `/app/clients/${clientId}?tab=shortlist`,
    )
    expect(within(details).getByRole('link', { name: 'Client campaign' })).toHaveAttribute(
      'href',
      `/app/client-campaigns/${clientId}`,
    )
    expect(within(details).getByRole('link', { name: 'Inbox' })).toHaveAttribute(
      'href',
      `/app/master-inbox?client=${clientId}`,
    )
    expect(mockedGetSystem).toHaveBeenCalledWith(workspaceId)
  })

  it('sends a next action that is not a shortlist row to the right client record tab', async () => {
    mockedGetSystem.mockResolvedValue({
      ...response,
      clients: [{ ...response.clients[0], profile: { ...response.clients[0].profile, ready: false } }],
    } as never)

    renderPage()

    expect(await screen.findByText('Complete the guest profile')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Open Taylor Client next action' })).toHaveAttribute(
      'href',
      `/app/clients/${clientId}?tab=profile`,
    )
  })

  // The nav and the client record open this page on one client. That narrows
  // the queue rather than opening a second copy of the client's tabs.
  it('narrows the queue to the client the address names, until cleared', async () => {
    renderPage(`/app/client-podcast-system?client=${clientId}`)

    expect(await screen.findByRole('heading', { name: 'Taylor Client' })).toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: 'Jordan Former' })).not.toBeInTheDocument()
    expect(screen.getByText(/Showing/)).toHaveTextContent('Taylor Client')

    fireEvent.click(screen.getByRole('button', { name: 'Show all clients' }))
    expect(await screen.findByRole('heading', { name: 'Jordan Former' })).toBeInTheDocument()
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
    })

    renderPage(`/app/client-podcast-system?client=${clientId}`)
    await screen.findByRole('heading', { name: 'Pipeline' })
    expect(await screen.findByText(/Onboarding owner\/admin only/)).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: /Operator Stories/ }))

    const details = await screen.findByRole('dialog')
    expect(within(details).queryByText('jamie@operator.example')).not.toBeInTheDocument()
    expect(within(details).getByText(/Owners and admins manage client decisions/i)).toBeInTheDocument()
  })
})
