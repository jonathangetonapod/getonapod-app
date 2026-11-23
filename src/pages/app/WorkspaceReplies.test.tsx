import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useAuth } from '@/contexts/AuthContext'
import WorkspaceReplies from '@/pages/app/WorkspaceReplies'
import { createHostRelationship } from '@/services/hostRelationships'
import { getWorkspaceRecentReplies, type WorkspaceRecentReply } from '@/services/workspaceCampaigns'

vi.mock('@/contexts/AuthContext', () => ({ useAuth: vi.fn() }))
vi.mock('@/components/workspace/WorkspaceLayout', () => ({
  WorkspaceLayout: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}))
vi.mock('@/services/adminWorkspaces', () => ({ getAdminWorkspaceView: vi.fn() }))
vi.mock('@/services/hostRelationships', () => ({ createHostRelationship: vi.fn() }))
vi.mock('@/services/workspaceCampaigns', () => ({ getWorkspaceRecentReplies: vi.fn() }))
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }))

const mockedUseAuth = vi.mocked(useAuth)
const mockedReplies = vi.mocked(getWorkspaceRecentReplies)
const mockedCreate = vi.mocked(createHostRelationship)

const workspaceId = '11111111-1111-4111-8111-111111111111'
const clientId = '22222222-2222-4222-8222-222222222222'
const otherClientId = '33333333-3333-4333-8333-333333333333'

const reply = (overrides: Partial<WorkspaceRecentReply>): WorkspaceRecentReply => ({
  id: 'reply-1',
  provider_campaign_id: 'campaign-1',
  from_email: 'morgan@show.fm',
  from_name: 'Morgan Host',
  subject: 'Re: an idea',
  body_text: 'Happy to have Taylor on in January.',
  received_at: '2026-11-20T10:00:00Z',
  automated: false,
  interested: true,
  target: {
    id: 'target-1',
    shortlist_podcast_id: 'shortlist-1',
    podcast_id: 'podscan-123',
    podcast_name: 'Founder Stories',
    host_name: 'Morgan Host',
  },
  client: { id: clientId, name: 'Taylor Client' },
  relationship_podcast_id: null,
  ...overrides,
})

function renderPage() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={['/app/replies']} future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
        <WorkspaceReplies />
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

describe('WorkspaceReplies', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockedUseAuth.mockReturnValue({
      user: { id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa' },
      workspace: { id: workspaceId, name: 'Acme Workspace' },
      membership: { role: 'owner' },
      isPlatformAdmin: false,
    } as never)
    mockedReplies.mockResolvedValue({
      supported: true,
      provider_label: 'Instantly',
      truncated: false,
      failed_campaigns: 0,
      checked_at: '2026-11-23T10:00:00Z',
      replies: [
        reply({}),
        reply({
          id: 'reply-2',
          from_email: 'sam@other.fm',
          from_name: 'Sam',
          body_text: 'Already booked, thanks.',
          interested: null,
          target: { id: 'target-2', shortlist_podcast_id: 'shortlist-2', podcast_id: 'podscan-456', podcast_name: 'Other Show', host_name: 'Sam' },
          client: { id: otherClientId, name: 'Jordan Client' },
          relationship_podcast_id: 'podscan-456',
        }),
        reply({ id: 'reply-3', body_text: 'I am out of office.', automated: true, interested: null }),
      ],
    })
    mockedCreate.mockResolvedValue({ podcast_id: 'podscan-123', created: true })
  })

  it('lists every client\'s replies, newest first, and asks the platform for the full page', async () => {
    renderPage()
    expect(await screen.findByText('Happy to have Taylor on in January.')).toBeInTheDocument()
    expect(screen.getByText('Already booked, thanks.')).toBeInTheDocument()
    expect(screen.getByText('for Taylor Client')).toBeInTheDocument()
    expect(screen.getByText('for Jordan Client')).toBeInTheDocument()
    expect(mockedReplies).toHaveBeenCalledWith(workspaceId, { limit: 200 })
    // Automatic replies wait behind a checkbox.
    expect(screen.queryByText('I am out of office.')).not.toBeInTheDocument()
    fireEvent.click(screen.getByLabelText('Hide 1 automatic reply'))
    expect(screen.getByText('I am out of office.')).toBeInTheDocument()
    // One line per reply until it is opened.
    const [firstBody] = screen.getAllByRole('button', { name: 'Show the full reply' })
    expect(firstBody).toHaveAttribute('aria-expanded', 'false')
    fireEvent.click(firstBody)
    expect(firstBody).toHaveAttribute('aria-expanded', 'true')
    expect(firstBody).toHaveAccessibleName('Collapse reply')
    expect(screen.getAllByRole('link', { name: 'Open campaign' })[0])
      .toHaveAttribute('href', `/app/client-campaigns/${clientId}?tab=replies&reply_podcast=shortlist-1`)
  })

  it('adds a host to Relationships in one click and links the ones already there', async () => {
    renderPage()
    const list = await screen.findByRole('list', { name: 'Replies' })
    expect(within(list).getByRole('link', { name: 'In Relationships' }))
      .toHaveAttribute('href', '/app/relationships?open=podscan-456')

    fireEvent.click(within(list).getByRole('button', { name: 'Add to Relationships' }))
    await waitFor(() => expect(mockedCreate).toHaveBeenCalledWith(workspaceId, {
      podcastId: 'podscan-123',
      podcastName: 'Founder Stories',
      hostName: 'Morgan Host',
      contactEmail: 'morgan@show.fm',
    }))
    await waitFor(() => expect(within(list).getAllByRole('link', { name: 'In Relationships' })).toHaveLength(2))
    expect(within(list).queryByRole('button', { name: 'Add to Relationships' })).not.toBeInTheDocument()
  })

  it('searches replies by what the host said', async () => {
    renderPage()
    await screen.findByText('Happy to have Taylor on in January.')
    fireEvent.change(screen.getByLabelText('Search replies'), { target: { value: 'already booked' } })
    expect(screen.queryByText('Happy to have Taylor on in January.')).not.toBeInTheDocument()
    expect(screen.getByText('Already booked, thanks.')).toBeInTheDocument()
  })

  it('shows members the replies without the add button', async () => {
    mockedUseAuth.mockReturnValue({
      user: { id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa' },
      workspace: { id: workspaceId, name: 'Acme Workspace' },
      membership: { role: 'member' },
      isPlatformAdmin: false,
    } as never)
    renderPage()
    await screen.findByText('Happy to have Taylor on in January.')
    expect(screen.queryByRole('button', { name: 'Add to Relationships' })).not.toBeInTheDocument()
  })

  it('says so when the sending platform cannot list replies', async () => {
    mockedReplies.mockResolvedValue({
      supported: false, provider_label: 'ReachInbox', replies: [], truncated: false, failed_campaigns: 0, checked_at: '',
    })
    renderPage()
    expect(await screen.findByText(/ReachInbox does not let us read campaign replies yet/)).toBeInTheDocument()
  })
})
