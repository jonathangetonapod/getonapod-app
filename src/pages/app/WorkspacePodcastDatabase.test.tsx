import { act, fireEvent, render, screen, within, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useAuth } from '@/contexts/AuthContext'
import WorkspacePodcastDatabase from '@/pages/app/WorkspacePodcastDatabase'
import { addClientShortlistPodcasts, getClientShortlist } from '@/services/clientShortlist'
import { toast } from 'sonner'
import { addWorkspaceProspectPodcasts, getWorkspaceProspects, PartialShortlistAddError } from '@/services/prospectDashboards'
import { listHostRelationships } from '@/services/hostRelationships'
import { getWorkspaceClients } from '@/services/clients'
import { getWorkspacePodcastCatalog } from '@/services/workspacePodcastCatalog'
import { readWorkingClient, writeWorkingClient } from '@/lib/workingClient'

vi.mock('@/contexts/AuthContext', () => ({ useAuth: vi.fn() }))
vi.mock('@/components/workspace/WorkspaceLayout', () => ({
  WorkspaceLayout: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}))
vi.mock('@/services/workspacePodcastCatalog', () => ({ getWorkspacePodcastCatalog: vi.fn() }))
vi.mock('@/services/clients', () => ({ getWorkspaceClients: vi.fn() }))
vi.mock('@/services/clientShortlist', () => ({ addClientShortlistPodcasts: vi.fn(), getClientShortlist: vi.fn() }))
vi.mock('@/services/hostRelationships', () => ({ listHostRelationships: vi.fn() }))
vi.mock('@/services/prospectDashboards', async (importOriginal) => ({
  PartialShortlistAddError: (await importOriginal<typeof import('@/services/prospectDashboards')>()).PartialShortlistAddError,
  getWorkspaceProspects: vi.fn(),
  addWorkspaceProspectPodcasts: vi.fn(),
}))
vi.mock('sonner', () => ({ toast: Object.assign(vi.fn(), { error: vi.fn(), info: vi.fn(), success: vi.fn(), warning: vi.fn() }) }))

const mockedUseAuth = vi.mocked(useAuth)
const mockedCatalog = vi.mocked(getWorkspacePodcastCatalog)
const mockedClients = vi.mocked(getWorkspaceClients)
const mockedAdd = vi.mocked(addClientShortlistPodcasts)
const mockedShortlist = vi.mocked(getClientShortlist)
const mockedProspects = vi.mocked(getWorkspaceProspects)
const mockedAddToProspect = vi.mocked(addWorkspaceProspectPodcasts)
const mockedRelationships = vi.mocked(listHostRelationships)
const workspaceId = '11111111-1111-4111-8111-111111111111'
const clientId = '22222222-2222-4222-8222-222222222222'
const userId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'

const catalogResponse = {
  workspace: { id: workspaceId, name: 'Acme Workspace' },
  categories: ['Business', 'Technology'],
  languages: ['en', 'de'],
  // "en" is a language code some feeds store as their region.
  regions: ['us', 'gb', 'en'],
  pagination: { page: 1, page_size: 24, total: 1, total_pages: 1 },
  summary: {
    total_podcasts: 11807,
    active_podcasts: 9566,
    podcasts_with_free_email: 6610,
    podcasts_with_direct_email: 0,
    podcasts_used_in_shortlists: 1200,
    shortlist_uses: 2391,
    contributing_workspaces: 3,
    catalog_refreshed_at: '2026-10-25T09:00:00.000Z',
  },
  items: [{
    podcast_id: 'podcast-one',
    podcast_name: 'The Founder Show',
    podcast_description: 'Practical conversations with company founders.',
    podcast_image_url: null,
    podcast_url: 'https://example.com/podcast',
    publisher_name: 'Founder Media',
    host_name: null,
    podcast_categories: [{ category_id: 'business', category_name: 'Business' }],
    episode_count: 120,
    itunes_rating: 4.8,
    spotify_rating: null,
    audience_size: 25000,
    podcast_reach_score: 72,
    language: 'en',
    region: 'US',
    website: 'https://example.com',
    rss_feed: 'https://example.com/rss',
    last_posted_at: '2026-07-20T12:00:00.000Z',
    is_active: true,
    catalog_updated_at: '2026-07-20T12:00:00.000Z',
    free_podscan_email: 'show@example.com',
    direct_email: null,
    direct_verified_at: null,
    shortlist_uses: 4,
    workspace_uses: 2,
  }],
} as const

function renderPage(initialEntry = '/app/podcast-database') {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={[initialEntry]} future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
        <WorkspacePodcastDatabase />
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

describe('WorkspacePodcastDatabase', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    window.localStorage.clear()
    // No history with any of these hosts unless a test says otherwise.
    mockedRelationships.mockResolvedValue([])
    mockedUseAuth.mockReturnValue({
      user: { id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa' },
      workspace: { id: workspaceId, name: 'Acme Workspace' },
      membership: { role: 'owner' },
      isPlatformAdmin: false,
    } as never)
    mockedCatalog.mockResolvedValue(catalogResponse as never)
    mockedClients.mockResolvedValue([{ id: clientId, name: 'Dallas Fontaine', status: 'active' }] as never)
    mockedAdd.mockResolvedValue({ added: 1, skipped: 0, podcast_ids: ['podcast-one'] })
    mockedShortlist.mockResolvedValue({ client: { id: clientId, name: 'Dallas Fontaine' }, podcasts: [] } as never)
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('shows the searchable shared catalog without internal network metrics', async () => {
    renderPage()

    expect(await screen.findByRole('heading', { name: 'Podcast Database' })).toBeInTheDocument()
    expect(screen.queryByText('Usable free inboxes')).not.toBeInTheDocument()
    expect(screen.queryByText('Used in shortlists')).not.toBeInTheDocument()
    expect(screen.queryByText('Workspaces building it')).not.toBeInTheDocument()
    expect(screen.getByText('The Founder Show')).toBeInTheDocument()
    expect(screen.getAllByText('Public email').length).toBeGreaterThan(0)
    // The rating names its source, and the page says how old its data is:
    // one catalogue-wide date, not the oldest row on screen.
    expect(screen.getByText('Apple 4.8')).toBeInTheDocument()
    expect(screen.getByText('Catalog synced Oct 25, 2026')).toBeInTheDocument()
    expect(screen.getByText('Catalog synced Oct 25, 2026')).not.toHaveClass('text-amber-700')
    // Every control is named by what it shows.
    expect(screen.getByRole('combobox', { name: 'Any category' })).toHaveTextContent('Any category')
    expect(screen.getByRole('combobox', { name: 'Email status: Public or verified' })).toHaveTextContent('Public or verified')
    expect(screen.getByRole('combobox', { name: 'Still publishing' })).toHaveTextContent('Still publishing')
    expect(screen.getByRole('combobox', { name: 'Any audience size' })).toHaveTextContent('Any audience size')
    // Best fit, not the biggest shows nobody can book.
    expect(screen.getByRole('combobox', { name: 'Sort: Best fit' })).toBeInTheDocument()
    expect(mockedCatalog).toHaveBeenLastCalledWith(workspaceId, expect.objectContaining({ sort: 'best_fit' }), expect.anything())
    expect(screen.getByText(/^Showing 1 to 1 of 1 ·/)).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Find new podcasts' })).toHaveAttribute('href', '/app/podcast-finder')
    // No internal names or how-it-works paragraphs on the page itself.
    expect(screen.queryByText(/Scout|semantic|falls back/i)).not.toBeInTheDocument()
    expect(screen.queryByText('How the database grows')).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'What is shared' })).toBeInTheDocument()
  })

  it('filters by email status, activity, and audience size, and keeps them in the address', async () => {
    renderPage()
    await screen.findByText('The Founder Show')

    fireEvent.click(screen.getByRole('combobox', { name: 'Email status: Public or verified' }))
    fireEvent.click(await screen.findByRole('option', { name: 'Verified email' }))
    fireEvent.click(screen.getByRole('combobox', { name: 'Still publishing' }))
    // Still publishing already means an episode in 90 days, so that is not offered twice.
    expect(screen.queryByRole('option', { name: 'Published in 90 days' })).not.toBeInTheDocument()
    fireEvent.click(await screen.findByRole('option', { name: 'Published in 6 months' }))
    fireEvent.click(screen.getByRole('combobox', { name: 'Any audience size' }))
    fireEvent.click(await screen.findByRole('option', { name: '10K to 50K' }))

    await waitFor(() => expect(mockedCatalog).toHaveBeenLastCalledWith(
      workspaceId,
      expect.objectContaining({ contact: 'direct', activity: 'last_180_days', audience: '10k_50k', page: 1 }),
      expect.anything(),
    ))
    expect(screen.getByText('Email: Verified email')).toBeInTheDocument()
    expect(screen.getByText('Activity: Published in 6 months')).toBeInTheDocument()
    expect(screen.getByText('Audience: 10K to 50K')).toBeInTheDocument()
  })

  // Untouched, the list shows shows somebody can be pitched, and says so.
  it('starts on shows with an email and lets the chip be removed', async () => {
    renderPage()
    await screen.findByText('The Founder Show')
    expect(mockedCatalog).toHaveBeenLastCalledWith(workspaceId, expect.objectContaining({ contact: 'any' }), expect.anything())

    fireEvent.click(screen.getByRole('button', { name: 'Remove Email: Public or verified' }))
    await waitFor(() => expect(mockedCatalog).toHaveBeenLastCalledWith(workspaceId, expect.objectContaining({ contact: 'all' }), expect.anything()))
    expect(screen.queryByText('Email: Public or verified')).not.toBeInTheDocument()
  })

  it('reads filters, sort, page and size from the address', async () => {
    renderPage('/app/podcast-database?q=founders&category=Business&email=all&activity=last_30_days&sort=recent&page=3&size=48')
    await screen.findByText('The Founder Show')
    expect(mockedCatalog).toHaveBeenCalledWith(workspaceId, expect.objectContaining({
      search: 'founders',
      category: 'Business',
      contact: 'all',
      activity: 'last_30_days',
      sort: 'recent',
      page: 3,
      pageSize: 48,
    }), expect.anything())
    expect(screen.getByLabelText('Search podcasts')).toHaveValue('founders')
    expect(screen.getByRole('combobox', { name: 'Sort: Most recent episode' })).toBeInTheDocument()
  })

  it('jumps to a typed page number', async () => {
    mockedCatalog.mockResolvedValue({
      ...catalogResponse,
      pagination: { page: 1, page_size: 24, total: 9566, total_pages: 399 },
    } as never)
    renderPage()
    await screen.findByText('The Founder Show')
    expect(screen.getByText(/^Showing 1 to 1 of 9,566/)).toBeInTheDocument()

    const [pageInput] = screen.getAllByRole('textbox', { name: 'Page, of 399' })
    fireEvent.change(pageInput, { target: { value: '212' } })
    fireEvent.keyDown(pageInput, { key: 'Enter' })
    await waitFor(() => expect(mockedCatalog).toHaveBeenLastCalledWith(workspaceId, expect.objectContaining({ page: 212 }), expect.anything()))
  })

  it('offers a way out when nothing matches', async () => {
    mockedCatalog.mockResolvedValue({ ...catalogResponse, items: [], pagination: { page: 1, page_size: 24, total: 0, total_pages: 0 } } as never)
    renderPage('/app/podcast-database?category=Business')
    expect(await screen.findByText('No shows match these filters.')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Not finding it? Open Finder' })).toHaveAttribute('href', '/app/podcast-finder')

    fireEvent.click(screen.getByRole('button', { name: 'Clear all filters' }))
    await waitFor(() => expect(mockedCatalog).toHaveBeenLastCalledWith(workspaceId, expect.objectContaining({ category: undefined, contact: 'all' }), expect.anything()))
  })

  it('says the catalog could not load and retries', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined)
    mockedCatalog.mockRejectedValueOnce(new Error('down'))
    renderPage()
    expect(await screen.findByText('Couldn\'t load the catalog. Try again.')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Retry' }))
    expect(await screen.findByText('The Founder Show')).toBeInTheDocument()
  })

  /*
   * With a working client the add is one click, and it waits out the Undo
   * window before it is sent: once sent, the server merges the show into the
   * catalogue and may tell the client, and there is no remove to call.
   */
  it('adds the selection to the working client after the undo window', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    renderPage(`/app/podcast-database?client=${clientId}`)

    expect(await screen.findByText('Browsing for Dallas Fontaine')).toBeInTheDocument()
    fireEvent.click(await screen.findByRole('checkbox', { name: 'Select The Founder Show' }))
    fireEvent.click(screen.getByRole('button', { name: /Add 1 to Dallas/ }))

    expect(vi.mocked(toast.success)).toHaveBeenCalledWith('Added to Dallas Fontaine.', expect.objectContaining({
      duration: 8000,
      action: expect.objectContaining({ label: 'Undo' }),
    }))
    expect(screen.getByRole('button', { name: 'Added' })).toBeDisabled()
    expect(mockedAdd).not.toHaveBeenCalled()

    vi.advanceTimersByTime(8000)
    await waitFor(() => expect(mockedAdd).toHaveBeenCalledWith(
      workspaceId,
      clientId,
      [expect.objectContaining({
        podcast_id: 'podcast-one',
        podcast_name: 'The Founder Show',
        podcast_email: 'show@example.com',
      })],
    ))
  })

  it('takes an add back when Undo is pressed', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    renderPage(`/app/podcast-database?client=${clientId}`)

    fireEvent.click(await screen.findByRole('button', { name: 'Add to Dallas: The Founder Show' }))
    const options = vi.mocked(toast.success).mock.calls.at(-1)?.[1] as unknown as { action: { onClick: () => void } }
    act(() => options.action.onClick())

    vi.advanceTimersByTime(10_000)
    await screen.findByRole('button', { name: 'Add to Dallas: The Founder Show' })
    expect(mockedAdd).not.toHaveBeenCalled()
  })

  it('says a show is already on the working client’s shortlist', async () => {
    mockedShortlist.mockResolvedValue({
      client: { id: clientId, name: 'Dallas Fontaine' },
      podcasts: [{ podcast_id: 'podcast-one', podcast_name: 'The Founder Show' }],
    } as never)
    renderPage(`/app/podcast-database?client=${clientId}`)

    expect(await screen.findByRole('button', { name: 'On shortlist' })).toBeDisabled()
    expect(screen.queryByRole('button', { name: /Add to Dallas/ })).not.toBeInTheDocument()
  })

  it('skips what the client already has and says so', async () => {
    mockedCatalog.mockResolvedValue({
      ...catalogResponse,
      items: [catalogResponse.items[0], { ...catalogResponse.items[0], podcast_id: 'podcast-two', podcast_name: 'Second Show' }],
    } as never)
    mockedShortlist.mockResolvedValue({
      client: { id: clientId, name: 'Dallas Fontaine' },
      podcasts: [{ podcast_id: 'podcast-one', podcast_name: 'The Founder Show' }],
    } as never)
    renderPage(`/app/podcast-database?client=${clientId}`)

    await screen.findByRole('button', { name: 'On shortlist' })
    fireEvent.click(screen.getByRole('checkbox', { name: 'Select this page' }))
    fireEvent.click(screen.getByRole('button', { name: /Add 2 to Dallas/ }))
    expect(vi.mocked(toast.success)).toHaveBeenCalledWith(
      'Added to Dallas Fontaine. 1 was already there.',
      expect.anything(),
    )
  })

  it('adds from the details without closing them', async () => {
    renderPage(`/app/podcast-database?client=${clientId}`)
    fireEvent.click(await screen.findByRole('button', { name: 'The Founder Show' }))
    const dialog = within(await screen.findByRole('dialog'))
    fireEvent.click(await dialog.findByRole('button', { name: 'Add to Dallas: The Founder Show' }))
    expect(dialog.getByRole('button', { name: 'Added' })).toBeDisabled()
    expect(vi.mocked(toast.success)).toHaveBeenCalledWith('Added to Dallas Fontaine.', expect.anything())
  })

  it('picks a client in the dialog when the header is on all clients', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    renderPage()
    fireEvent.click(await screen.findByRole('button', { name: 'Add to client: The Founder Show' }))
    fireEvent.click(await screen.findByRole('combobox', { name: 'Client' }))
    fireEvent.click(await screen.findByRole('option', { name: 'Dallas Fontaine' }))
    fireEvent.click(screen.getByRole('button', { name: 'Add to shortlist' }))

    expect(vi.mocked(toast.success)).toHaveBeenCalledWith('Added to Dallas Fontaine.', expect.anything())
    vi.advanceTimersByTime(8000)
    await waitFor(() => expect(mockedAdd).toHaveBeenCalledWith(workspaceId, clientId, [expect.objectContaining({ podcast_id: 'podcast-one' })]))
  })

  it('gives members without add rights the details as their one action', async () => {
    mockedUseAuth.mockReturnValue({
      user: { id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa' },
      workspace: { id: workspaceId, name: 'Acme Workspace' },
      membership: { role: 'member' },
      isPlatformAdmin: false,
    } as never)
    renderPage()
    expect(await screen.findByRole('button', { name: 'See details' })).toBeInTheDocument()
    expect(screen.queryByRole('checkbox', { name: 'Select The Founder Show' })).not.toBeInTheDocument()
  })

  /*
   * A prospect dashboard is the pitch for work nobody has bought yet, and it is
   * built out of the same catalogue as a client's shortlist. Until now the only
   * way to fill one was to go and find the shows again from inside the prospect.
   */
  it('adds selected shared podcasts to a prospect dashboard', async () => {
    mockedProspects.mockResolvedValue({
      workspace: { id: workspaceId, name: 'Northwind', slug: 'northwind' },
      viewer_role: 'owner',
      can_manage: true,
      dashboards: [
        { id: 'prospect-1', prospect_name: 'Ada Bell', lifecycle_status: 'draft' },
        // Archived is not somewhere anything should be added to.
        { id: 'prospect-2', prospect_name: 'Old Lead', lifecycle_status: 'archived' },
      ],
    } as never)
    mockedAddToProspect.mockResolvedValue({
      added: 1, skipped: 0, podcast_ids: ['podcast-one'], unpublished_for_review: false,
    })

    renderPage()

    fireEvent.click(await screen.findByRole('checkbox', { name: 'Select The Founder Show' }))
    fireEvent.click(screen.getByRole('button', { name: 'Add 1 to client' }))
    fireEvent.click(await screen.findByRole('button', { name: 'A prospect' }))

    const picker = await screen.findByRole('combobox', { name: 'Prospect' })
    expect(picker).toBeInTheDocument()
    expect(screen.queryByText('Old Lead')).not.toBeInTheDocument()

    fireEvent.click(picker)
    fireEvent.click(await screen.findByRole('option', { name: 'Ada Bell' }))
    fireEvent.click(screen.getByRole('button', { name: 'Add to dashboard' }))

    await waitFor(() => expect(mockedAddToProspect).toHaveBeenCalledWith(
      workspaceId,
      'prospect-1',
      [expect.objectContaining({ podcast_id: 'podcast-one', podcast_name: 'The Founder Show' })],
    ))
    // The prospect shape is narrower on purpose: a dashboard goes to someone
    // who has signed nothing, so the contact address is not gathered for it.
    expect(mockedAddToProspect.mock.calls[0][2][0]).not.toHaveProperty('podcast_email')
  })

  async function addToProspect() {
    mockedProspects.mockResolvedValue({
      workspace: { id: workspaceId, name: 'Northwind', slug: 'northwind' },
      viewer_role: 'owner',
      can_manage: true,
      dashboards: [{ id: 'prospect-1', prospect_name: 'Ada Bell', lifecycle_status: 'published' }],
    } as never)
    renderPage()

    fireEvent.click(await screen.findByRole('checkbox', { name: 'Select The Founder Show' }))
    fireEvent.click(screen.getByRole('button', { name: 'Add 1 to client' }))
    fireEvent.click(await screen.findByRole('button', { name: 'A prospect' }))
    fireEvent.click(await screen.findByRole('combobox', { name: 'Prospect' }))
    fireEvent.click(await screen.findByRole('option', { name: 'Ada Bell' }))
    fireEvent.click(screen.getByRole('button', { name: 'Add to dashboard' }))
  }

  /*
   * The dialog promised to unpublish a live dashboard, which the server stopped
   * doing: the additions land hidden and the page stays up. The copy and the
   * follow-up toast now say where the shows went instead.
   */
  it('tells the operator the shows were added hidden to a live dashboard', async () => {
    mockedAddToProspect.mockResolvedValue({
      added: 1, skipped: 0, podcast_ids: ['podcast-one'], unpublished_for_review: false, hidden_pending_review: true,
    })

    await addToProspect()
    expect(screen.getByText(/added to the prospect’s dashboard hidden/)).toBeInTheDocument()
    expect(screen.queryByText(/unpublished/)).not.toBeInTheDocument()

    await waitFor(() => expect(mockedAddToProspect).toHaveBeenCalled())
    await waitFor(() => expect(vi.mocked(toast.warning)).toHaveBeenCalledWith(
      'Added hidden. Open the prospect’s New tab to show them.',
      { duration: 8000 },
    ))
  })

  // The batch goes over in chunks; a failure part-way used to read as if
  // nothing had been added at all.
  it('says how many podcasts landed before a partial failure', async () => {
    mockedAddToProspect.mockRejectedValue(new PartialShortlistAddError('The second batch timed out.', {
      added: 3, skipped: 0, podcast_ids: ['a', 'b', 'c'], unpublished_for_review: false,
    }))

    await addToProspect()

    await waitFor(() => expect(vi.mocked(toast.warning)).toHaveBeenCalledWith('3 podcasts were added before it failed.'))
    expect(vi.mocked(toast.error)).toHaveBeenCalledWith('The second batch timed out.')
  })

  // A row is a line of facts; the cards add the description and the address.
  it('switches between the list and cards and remembers the choice', async () => {
    renderPage()
    expect(await screen.findByRole('listitem', { name: 'The Founder Show' })).toBeInTheDocument()
    expect(screen.queryByText('show@example.com')).not.toBeInTheDocument()

    fireEvent.mouseDown(screen.getByRole('radio', { name: 'Cards' }))
    fireEvent.click(screen.getByRole('radio', { name: 'Cards' }))
    expect(await screen.findByText('show@example.com')).toBeInTheDocument()
    expect(screen.getByText('25K audience · Apple 4.8 · Last episode Jul 2026')).toBeInTheDocument()
    expect(screen.getByText('On 4 shortlists')).toBeInTheDocument()
    expect(window.localStorage.getItem('podcastDb.view')).toBe('cards')
  })

  it('opens the details when Enter is pressed on a row', async () => {
    renderPage()
    const row = await screen.findByRole('listitem', { name: 'The Founder Show' })
    fireEvent.keyDown(row, { key: 'Enter' })
    expect(await screen.findByRole('dialog')).toBeInTheDocument()
  })

  it('opens the one-show add dialog from the row button', async () => {
    renderPage()
    fireEvent.click(await screen.findByRole('button', { name: 'Add to client: The Founder Show' }))
    expect(await screen.findByRole('heading', { name: 'Add The Founder Show' })).toBeInTheDocument()
  })

  it('suggests picking a client until one is picked or the hint is dismissed', async () => {
    renderPage()
    expect(await screen.findByText('Pick a client in the top bar to add shows with one click.')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Dismiss' }))
    expect(screen.queryByText('Pick a client in the top bar to add shows with one click.')).not.toBeInTheDocument()
    expect(window.localStorage.getItem('podcastDb.clientHintDismissed')).toBe('1')
  })

  it('splits the top audience band into 250K to 1M and 1M+', async () => {
    renderPage()
    await screen.findByText('The Founder Show')
    fireEvent.click(screen.getByRole('combobox', { name: 'Any audience size' }))
    expect(await screen.findByRole('option', { name: '250K to 1M' })).toBeInTheDocument()
    expect(screen.queryByRole('option', { name: '250K+' })).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('option', { name: '1M+' }))
    await waitFor(() => expect(mockedCatalog).toHaveBeenLastCalledWith(workspaceId, expect.objectContaining({ audience: '1m_plus' }), expect.anything()))
  })

  it('keeps an old 250K+ link meaning what it said', async () => {
    renderPage('/app/podcast-database?audience=250k_plus')
    await screen.findByText('The Founder Show')
    expect(mockedCatalog).toHaveBeenLastCalledWith(workspaceId, expect.objectContaining({ audience: '250k_plus' }), expect.anything())
    expect(screen.getByText('Audience: 250K+')).toBeInTheDocument()
  })

  // The client this person last worked on comes back on the next visit, so the
  // add stays one click and the pick-a-client hint stays away.
  it('opens on the client this person last worked on', async () => {
    writeWorkingClient(workspaceId, userId, clientId)
    vi.useFakeTimers({ shouldAdvanceTime: true })
    renderPage()

    expect(await screen.findByText('Browsing for Dallas Fontaine')).toBeInTheDocument()
    expect(screen.queryByText('Pick a client in the top bar to add shows with one click.')).not.toBeInTheDocument()
    fireEvent.click(await screen.findByRole('button', { name: 'Add to Dallas: The Founder Show' }))
    // Straight to the shortlist with an Undo, no dialog.
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(vi.mocked(toast.success)).toHaveBeenCalledWith('Added to Dallas Fontaine.', expect.objectContaining({
      action: expect.objectContaining({ label: 'Undo' }),
    }))
    expect(readWorkingClient(workspaceId, userId)).toBe(clientId)
  })

  // A remembered client that has since been paused is not written back into
  // the address, where the header would keep it as a deliberate choice.
  it('does not reopen on a remembered client that is no longer active', async () => {
    mockedClients.mockResolvedValue([{ id: clientId, name: 'Dallas Fontaine', status: 'paused' }] as never)
    writeWorkingClient(workspaceId, userId, clientId)
    renderPage()

    await screen.findByText('The Founder Show')
    expect(await screen.findByText('Pick a client in the top bar to add shows with one click.')).toBeInTheDocument()
    expect(screen.queryByText('Browsing for Dallas Fontaine')).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Add to client: The Founder Show' })).toBeInTheDocument()
  })

  it('does not suggest a client when one is already working', async () => {
    renderPage(`/app/podcast-database?client=${clientId}`)
    await screen.findByText('The Founder Show')
    expect(screen.queryByText('Pick a client in the top bar to add shows with one click.')).not.toBeInTheDocument()
  })

  /*
   * A search shows as a chip like the filters, Clear all clears it, and while
   * it is searching the sort is Relevance unless somebody picked another one.
   */
  it('shows the search as a removable chip and sorts it by relevance', async () => {
    renderPage()
    await screen.findByText('The Founder Show')
    fireEvent.change(screen.getByLabelText('Search podcasts'), { target: { value: 'founders' } })

    expect(await screen.findByText('Search: “founders”')).toBeInTheDocument()
    expect(mockedCatalog).toHaveBeenLastCalledWith(
      workspaceId,
      expect.objectContaining({ search: 'founders', sort: 'relevance' }),
      expect.anything(),
    )
    expect(screen.getByRole('combobox', { name: 'Sort: Relevance' })).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Clear all' }))
    await waitFor(() => expect(mockedCatalog).toHaveBeenLastCalledWith(
      workspaceId,
      expect.objectContaining({ search: '', sort: 'best_fit' }),
      expect.anything(),
    ))
    expect(screen.getByLabelText('Search podcasts')).toHaveValue('')
    expect(screen.queryByText(/^Search:/)).not.toBeInTheDocument()
  })

  // A search link someone sends opens ranked by match, and Best fit can still be chosen for it.
  it('opens a search link on relevance', async () => {
    renderPage('/app/podcast-database?q=founders')
    await screen.findByText('The Founder Show')
    expect(mockedCatalog).toHaveBeenLastCalledWith(
      workspaceId,
      expect.objectContaining({ search: 'founders', sort: 'relevance' }),
      expect.anything(),
    )
    fireEvent.click(screen.getByRole('combobox', { name: 'Sort: Relevance' }))
    fireEvent.click(await screen.findByRole('option', { name: /^Best fit/ }))
    await waitFor(() => expect(mockedCatalog).toHaveBeenLastCalledWith(
      workspaceId,
      expect.objectContaining({ search: 'founders', sort: 'best_fit' }),
      expect.anything(),
    ))
    expect(screen.getByRole('combobox', { name: 'Sort: Best fit' })).toBeInTheDocument()
  })

  it('applies a sort chosen on purpose to a search', async () => {
    renderPage('/app/podcast-database?sort=audience')
    await screen.findByText('The Founder Show')
    fireEvent.change(screen.getByLabelText('Search podcasts'), { target: { value: 'founders' } })
    await waitFor(() => expect(mockedCatalog).toHaveBeenLastCalledWith(
      workspaceId,
      expect.objectContaining({ search: 'founders', sort: 'audience' }),
      expect.anything(),
    ))
    fireEvent.click(screen.getByRole('button', { name: 'Remove Search: “founders”' }))
    // Back to the unsearched list (served from cache), still on the chosen sort.
    await waitFor(() => expect(screen.queryByText(/^Search:/)).not.toBeInTheDocument())
    expect(screen.getByRole('combobox', { name: 'Sort: Largest audience' })).toBeInTheDocument()
  })

  it('says it is searching and fades the old results while a search is in flight', async () => {
    renderPage()
    await screen.findByText('The Founder Show')
    mockedCatalog.mockImplementation(() => new Promise(() => undefined))
    fireEvent.change(screen.getByLabelText('Search podcasts'), { target: { value: 'founders' } })

    expect(await screen.findByText('Searching…')).toBeInTheDocument()
    const list = screen.getByRole('listitem', { name: 'The Founder Show' }).closest('[aria-busy]')
    expect(list).toHaveAttribute('aria-busy', 'true')
    expect(list).toHaveClass('opacity-35')
    // Faded, not frozen: the row menu still opens while the search runs.
    expect(list).not.toHaveClass('pointer-events-none')
  })

  // The table explains its numbers, sorts by them, and shows whose inbox the email is.
  it('labels, sorts and fills the list columns', async () => {
    renderPage()
    const row = within(await screen.findByRole('listitem', { name: 'The Founder Show' }))
    expect(row.getByText('72')).toBeInTheDocument()
    expect(row.getByText('@example.com')).toBeInTheDocument()
    expect(row.getByRole('button', { name: 'The Founder Show' })).toHaveAttribute('title', 'The Founder Show')

    expect(screen.getByRole('button', { name: 'Sort by Audience' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Sort by Rating' })).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Sort by Reach' }))
    await waitFor(() => expect(mockedCatalog).toHaveBeenLastCalledWith(
      workspaceId,
      expect.objectContaining({ sort: 'reach' }),
      expect.anything(),
    ))
    expect(screen.getByRole('button', { name: 'Sort by Reach' })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByRole('combobox', { name: 'Sort: Reach score' })).toBeInTheDocument()
  })

  it('filters by language and region by name, not code', async () => {
    renderPage()
    await screen.findByText('The Founder Show')
    fireEvent.click(screen.getByRole('combobox', { name: 'Any language' }))
    fireEvent.click(await screen.findByRole('option', { name: 'German' }))
    fireEvent.click(screen.getByRole('combobox', { name: 'Any region' }))
    expect(screen.queryByRole('option', { name: 'EN' })).not.toBeInTheDocument()
    fireEvent.click(await screen.findByRole('option', { name: 'United Kingdom' }))

    await waitFor(() => expect(mockedCatalog).toHaveBeenLastCalledWith(
      workspaceId,
      expect.objectContaining({ language: 'de', region: 'gb' }),
      expect.anything(),
    ))
    expect(screen.getByText('Language: German')).toBeInTheDocument()
    expect(screen.getByText('Region: United Kingdom')).toBeInTheDocument()
  })

  // The catalog function rejects a search longer than 120 characters.
  it('caps the search box at the length the catalog accepts', async () => {
    renderPage()
    expect(await screen.findByLabelText('Search podcasts')).toHaveAttribute('maxlength', '120')
  })

  /*
   * The shared catalogue holds websites somebody typed without a scheme —
   * simplecast.com, www.AngelInvestorsNetwork.com. The prospect endpoint
   * validates URLs because the dashboard it builds is public, so one untidy
   * address refused the whole batch with INVALID_FIELD.
   */
  it('repairs a catalogue website that was typed without a scheme', async () => {
    mockedCatalog.mockResolvedValue({
      ...catalogResponse,
      items: [{ ...catalogResponse.items[0], podcast_url: 'simplecast.com', podcast_image_url: null }],
    } as never)
    mockedProspects.mockResolvedValue({
      workspace: { id: workspaceId, name: 'Northwind', slug: 'northwind' },
      viewer_role: 'owner',
      can_manage: true,
      dashboards: [{ id: 'prospect-1', prospect_name: 'Ada Bell', lifecycle_status: 'draft' }],
    } as never)
    mockedAddToProspect.mockResolvedValue({
      added: 1, skipped: 0, podcast_ids: ['podcast-one'], unpublished_for_review: false,
    })

    renderPage()

    fireEvent.click(await screen.findByRole('checkbox', { name: 'Select The Founder Show' }))
    fireEvent.click(screen.getByRole('button', { name: 'Add 1 to client' }))
    fireEvent.click(await screen.findByRole('button', { name: 'A prospect' }))
    fireEvent.click(await screen.findByRole('combobox', { name: 'Prospect' }))
    fireEvent.click(await screen.findByRole('option', { name: 'Ada Bell' }))
    fireEvent.click(screen.getByRole('button', { name: 'Add to dashboard' }))

    await waitFor(() => expect(mockedAddToProspect).toHaveBeenCalled())
    const sent = mockedAddToProspect.mock.calls[0][2][0]
    expect(sent.podcast_url).toBe('https://simplecast.com/')
    // Absent is fine; invalid is not.
    expect(sent.podcast_image_url).toBeNull()
  })

  // The same podcast is a row here and a relationship in the book, keyed by the
  // same podcast_id — but only the book knew this host had already passed, or
  // been marked do not contact. Someone building a shortlist saw none of it.
  it('marks a podcast the workspace already has history with', async () => {
    mockedRelationships.mockResolvedValue([{
      podcast_id: 'podcast-one',
      podcast_name: 'The Founder Show',
      podcast_image_url: null,
      host_name: null,
      contact_email: null,
      derived_state: 'declined',
      manual_stage: null,
      summary: null,
      last_contacted_at: null,
      touch_count: 1,
      booked_client_name: null,
      client_count: 0,
      note_count: 0,
      last_note_at: null,
      curated: false,
    }] as never)
    renderPage()

    expect(await screen.findByText('Not a fit')).toBeInTheDocument()
  })

  it('says nothing about a host nobody has contacted', async () => {
    // Every podcast in the catalogue is this one, so a badge on all of them
    // would say nothing and hide the ones that matter.
    mockedRelationships.mockResolvedValue([])
    renderPage()

    expect(await screen.findByText('The Founder Show')).toBeInTheDocument()
    expect(screen.queryByText('Not a fit')).not.toBeInTheDocument()
    expect(screen.queryByText('Not contacted')).not.toBeInTheDocument()
  })

  // A relationship book that will not load must not take the catalogue with it.
  it('still lists podcasts when the relationship book cannot be read', async () => {
    mockedRelationships.mockRejectedValue(new Error('relationships unavailable'))
    renderPage()

    expect(await screen.findByText('The Founder Show')).toBeInTheDocument()
  })

  // The row keeps a clipped description and four numbers; everything else the
  // catalogue already carried was fetched, sent to the browser, and shown
  // nowhere — so judging a show meant opening it somewhere else.
  it('opens the details it already had for a podcast', async () => {
    renderPage()
    fireEvent.click(await screen.findByRole('button', { name: 'The Founder Show' }))

    const dialog = within(await screen.findByRole('dialog'))
    expect(dialog.getByText('The Founder Show')).toBeInTheDocument()
    expect(dialog.getByText(/Practical conversations with company founders/i)).toBeInTheDocument()
    // Fields the row never showed.
    expect(dialog.getByText('Reach score')).toBeInTheDocument()
    expect(dialog.getByText('Last published')).toBeInTheDocument()
    expect(dialog.getByText(/On 4 shortlists across 2 workspaces/i)).toBeInTheDocument()
    expect(dialog.getByText('English')).toBeInTheDocument()
    expect(dialog.getByText('United States')).toBeInTheDocument()
    // One copy button, next to the address; the footer only adds.
    expect(dialog.getAllByRole('button', { name: /copy/i })).toHaveLength(1)
    // The show's own refresh date, named as the show's.
    expect(dialog.getByText(/This show’s data last refreshed/)).toBeInTheDocument()
  })

  it('carries the relationship warning into the details', async () => {
    mockedRelationships.mockResolvedValue([{
      podcast_id: 'podcast-one',
      podcast_name: 'The Founder Show',
      podcast_image_url: null,
      host_name: null,
      contact_email: null,
      derived_state: 'declined',
      manual_stage: null,
      summary: null,
      last_contacted_at: null,
      touch_count: 1,
      booked_client_name: null,
      client_count: 0,
      note_count: 0,
      last_note_at: null,
      curated: false,
    }] as never)
    renderPage()
    fireEvent.click(await screen.findByRole('button', { name: 'The Founder Show' }))

    const dialog = within(await screen.findByRole('dialog'))
    expect(dialog.getByText('Not a fit')).toBeInTheDocument()
  })
})
