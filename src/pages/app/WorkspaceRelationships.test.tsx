import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useAuth } from '@/contexts/AuthContext'
import WorkspaceRelationships from '@/pages/app/WorkspaceRelationships'
import { getAdminWorkspaceView } from '@/services/adminWorkspaces'
import { getWorkspaceClients } from '@/services/clients'
import {
  addHostRelationshipNote,
  createHostRelationship,
  dismissHostRelationship,
  getHostRelationship,
  linkHostRelationshipClient,
  listHostRelationships,
  listHostRelationshipsPage,
  saveHostRelationship,
  unlinkHostRelationshipClient,
  type HostRelationshipDetail,
  type HostRelationshipSummary,
} from '@/services/hostRelationships'

vi.mock('@/contexts/AuthContext', () => ({ useAuth: vi.fn() }))
vi.mock('@/components/workspace/WorkspaceLayout', () => ({
  WorkspaceLayout: ({
    children,
    platformWorkspace,
  }: {
    children: React.ReactNode
    platformWorkspace?: { baseHref?: string }
  }) => <div data-testid="workspace-layout" data-base-href={platformWorkspace?.baseHref}>{children}</div>,
}))
vi.mock('@/services/adminWorkspaces', () => ({ getAdminWorkspaceView: vi.fn(), listPodcastResearchWorkspaces: vi.fn(async () => []) }))
vi.mock('@/services/clients', () => ({ getWorkspaceClients: vi.fn() }))
vi.mock('@/services/hostRelationships', () => {
  const listHostRelationships = vi.fn()
  return {
    addHostRelationshipNote: vi.fn(),
    createHostRelationship: vi.fn(),
    dismissHostRelationship: vi.fn(),
    getHostRelationship: vi.fn(),
    linkHostRelationshipClient: vi.fn(),
    listHostRelationships,
    // The page reads the book a page at a time; by default one page holds the
    // whole list the older tests describe through listHostRelationships.
    listHostRelationshipsPage: vi.fn(async (workspaceId: string) => {
      const rows = ((await listHostRelationships(workspaceId)) ?? []) as Array<{ derived_state: string }>
      return {
        relationships: rows,
        total: rows.length,
        offset: 0,
        has_more: false,
        next_offset: null,
        counts: {
          in_conversation: rows.filter((row) => row.derived_state === 'in_conversation').length,
          booked: rows.filter((row) => row.derived_state === 'booked').length,
          engaged: rows.filter((row) => ['replied', 'declined'].includes(row.derived_state)).length,
        },
      }
    }),
    saveHostRelationship: vi.fn(),
    unlinkHostRelationshipClient: vi.fn(),
  }
})

const mockedUseAuth = vi.mocked(useAuth)
const mockedAdminWorkspace = vi.mocked(getAdminWorkspaceView)
const mockedClients = vi.mocked(getWorkspaceClients)
const mockedList = vi.mocked(listHostRelationships)
const mockedDetail = vi.mocked(getHostRelationship)
const mockedSave = vi.mocked(saveHostRelationship)
const mockedAddNote = vi.mocked(addHostRelationshipNote)
const mockedCreate = vi.mocked(createHostRelationship)
const mockedLinkClient = vi.mocked(linkHostRelationshipClient)
const mockedListPage = vi.mocked(listHostRelationshipsPage)
const mockedUnlinkClient = vi.mocked(unlinkHostRelationshipClient)
const mockedDismiss = vi.mocked(dismissHostRelationship)

const workspaceId = '11111111-1111-4111-8111-111111111111'
const platformWorkspaceId = '99999999-9999-4999-8999-999999999999'
const clientId = '22222222-2222-4222-8222-222222222222'


const daysAgo = (days: number) => new Date(Date.now() - days * 86_400_000).toISOString()

const relationship: HostRelationshipSummary = {
  podcast_id: 'show-one',
  podcast_name: 'Founder &amp; Operator',
  podcast_image_url: 'https://cdn.example.com/founder-operator.jpg',
  host_name: 'Morgan Host',
  contact_email: 'morgan@example.com',
  derived_state: 'replied',
  manual_stage: null,
  summary: 'Prefers practical operator stories.',
  last_contacted_at: daysAgo(2),
  touch_count: 1,
  booked_client_name: null,
  client_count: 1,
  client_names: ['Taylor Client'],
  note_count: 1,
  last_note_at: daysAgo(2),
  last_message_body: 'Interested in revisiting this in Q3.',
  last_message_at: daysAgo(2),
  last_message_direction: 'inbound',
  last_thread_key: null,
  last_thread_client_id: null,
  curated: true,
}

const detail: HostRelationshipDetail = {
  relationship: {
    podcast_id: 'show-one',
    podcast_name: 'Founder & Operator',
    host_name: 'Morgan Host',
    contact_email: 'morgan@example.com',
    manual_stage: null,
    summary: 'Prefers practical operator stories.',
    updated_at: '2026-07-21T12:00:00.000Z',
  },
  derived: { state: 'replied', last_client_name: 'Taylor Client', booked_client_name: null },
  clients: [{
    client_id: clientId,
    client_name: 'Taylor Client',
    intent: 'pitched',
    note: null,
    created_at: '2026-07-20T12:00:00.000Z',
  }],
  events: [{
    id: 'event-one',
    client_id: clientId,
    kind: 'note',
    body: 'Asked for a tighter angle next time.',
    occurred_at: '2026-07-21T12:00:00.000Z',
  }],
  threads: [{
    thread_key: 'thread-one',
    client_id: clientId,
    client_name: 'Taylor Client',
    provider: 'instantly',
    latest_message_id: 'message-one',
    subject: 'Re: operator systems',
    lead_email: 'morgan@example.com',
    from_email: 'morgan@example.com',
    to_email: 'sdr@example.com',
    latest_message_body: 'Interested in revisiting this in Q3.',
    latest_message_at: '2026-07-09T12:00:00.000Z',
    campaign_id: 'campaign-one',
    campaign_name: '(failed) Titan | (Sunnova, Mosaic)',
    created_at: '2026-07-09T12:00:00.000Z',
    updated_at: '2026-07-09T12:00:00.000Z',
  }],
}

function renderPage(props: { platformWorkspaceId?: string } = {}) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  })
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={['/app/relationships']} future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
        <WorkspaceRelationships {...props} />
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

const openDetails = async (title: string) => {
  fireEvent.click(await screen.findByRole('button', { name: `Open details for ${title}` }))
}

describe('WorkspaceRelationships', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockedUseAuth.mockReturnValue({
      user: { id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa' },
      workspace: { id: workspaceId, name: 'Acme Workspace' },
      membership: { role: 'owner' },
      isPlatformAdmin: false,
    } as never)
    mockedList.mockResolvedValue([relationship])
    mockedDetail.mockResolvedValue(detail)
    mockedClients.mockResolvedValue([
      { id: clientId, name: 'Taylor Client', status: 'active' },
      { id: '33333333-3333-4333-8333-333333333333', name: 'Jordan Client', status: 'active' },
    ] as never)
    mockedSave.mockResolvedValue(undefined)
    mockedAddNote.mockResolvedValue(undefined)
    mockedLinkClient.mockResolvedValue(undefined)
    mockedCreate.mockResolvedValue({ podcast_id: 'manual-relationship-one', created: true })
    mockedAdminWorkspace.mockResolvedValue({
      workspace: {
        id: platformWorkspaceId,
        name: 'Selected Agency',
        slug: 'selected-agency',
        status: 'active',
        is_default: false,
        logo_path: null,
        logo_updated_at: null,
      },
      viewer: { workspace_id: platformWorkspaceId, email: 'owner@example.com', full_name: 'Owner', role: 'owner' },
      clients: [],
    })
  })

  // A row answers who to reply to and what they last said, not when the
  // metadata changed.
  it('shows each row as the last message and the next step', async () => {
    mockedList.mockResolvedValue([
      { ...relationship, client_names: ['Taylor Client', 'Jordan Client'] },
      {
        ...relationship,
        podcast_id: 'show-two',
        podcast_name: 'Second Show',
        derived_state: 'pitched',
        client_names: [],
        last_message_body: `Hi there, ${'a long pitch '.repeat(20)}`,
        last_message_direction: 'outbound',
        last_message_at: daysAgo(3),
      },
      {
        ...relationship,
        podcast_id: 'show-three',
        podcast_name: 'Third Show',
        derived_state: 'none',
        manual_stage: 'nurturing',
        last_message_body: null,
        last_message_at: null,
        last_message_direction: null,
        last_contacted_at: null,
      },
      { ...relationship, podcast_id: 'show-four', podcast_name: 'Fourth Show', derived_state: 'booked' },
    ])
    renderPage()

    // Clients pitched to the host show on the row as chips.
    const [firstClients] = await screen.findAllByRole('list', { name: 'Clients pitched to this host' })
    expect(within(firstClients).getByText('Taylor Client')).toBeInTheDocument()
    expect(within(firstClients).getByText('Jordan Client')).toBeInTheDocument()
    // The sender is named: the host by first name, us as You.
    expect(screen.getAllByText('Morgan:')).toHaveLength(2)
    expect(screen.getByText('You:')).toBeInTheDocument()
    expect(screen.getByText(/· 3d ago/)).toBeInTheDocument()
    // Snippets stop at 90 characters.
    const line = screen.getByText('You:').parentElement!.textContent!
    const snippet = line.replace(/^You: /, '').replace(/ · 3d ago$/, '')
    expect(snippet.length).toBeLessThanOrEqual(90)
    expect(snippet).toMatch(/^Hi there, a long pitch.*…$/)
    expect(screen.getByText('No messages yet')).toBeInTheDocument()

    // Replying from the app is retired: a row with a conversation opens it,
    // a host nobody has pitched opens the pitch.
    expect(screen.getAllByRole('button', { name: 'View conversation' })).toHaveLength(3)
    expect(screen.getByRole('button', { name: 'Pitch' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Reply' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Follow up' })).not.toBeInTheDocument()
    // Whose move it is, from who wrote last; a week-old pitch is overdue.
    expect(screen.getAllByText('Your move').length).toBeGreaterThan(0)
    expect(screen.getByText('Their move')).toBeInTheDocument()
    // The old metadata line is gone from the row.
    expect(screen.queryByText(/Last contact .* 2026/)).not.toBeInTheDocument()
    expect(screen.queryByText(/\d+ notes?$/)).not.toBeInTheDocument()

    // The whole row opens the panel.
    fireEvent.click(screen.getByText('Third Show'))
    expect(await screen.findByRole('tab', { name: 'Overview' })).toBeInTheDocument()
  })

  it('uses one stage vocabulary on badges and in the filter', async () => {
    mockedList.mockResolvedValue([
      relationship,
      { ...relationship, podcast_id: 'show-two', podcast_name: 'Second Show', derived_state: 'declined' },
      { ...relationship, podcast_id: 'show-three', podcast_name: 'Third Show', derived_state: 'none', manual_stage: 'warm' },
    ])
    renderPage()

    expect(await screen.findByText('In conversation · 2d')).toBeInTheDocument()
    expect(screen.getByText('Not a fit')).toBeInTheDocument()
    expect(screen.getByText('Nurturing')).toBeInTheDocument()

    // The common filters are tabs; the dropdown holds only the other stages.
    fireEvent.click(screen.getByRole('combobox', { name: 'Other stages' }))
    const options = (await screen.findAllByRole('option')).map((option) => option.textContent)
    expect(options).toEqual(['New', 'Pitched', 'Nurturing', 'Not a fit', 'Do not contact'])
    fireEvent.click(screen.getByRole('option', { name: 'Not a fit' }))
    expect(screen.getByText('Second Show')).toBeInTheDocument()
    expect(screen.queryByText('Third Show')).not.toBeInTheDocument()
  })

  it('lets a manager curate notes, stage and clients from the panel', async () => {
    renderPage()
    await openDetails('Founder & Operator')

    // Autosaves on blur; there is no save button.
    const summary = await screen.findByLabelText('What we know about this host')
    expect(screen.queryByRole('button', { name: 'Save relationship' })).not.toBeInTheDocument()
    fireEvent.change(summary, { target: { value: 'Warm, direct, and prefers concise pitches.' } })
    fireEvent.blur(summary)
    await waitFor(() => expect(mockedSave).toHaveBeenCalledWith(workspaceId, {
      podcastId: 'show-one',
      summary: 'Warm, direct, and prefers concise pitches.',
    }))
    expect(await screen.findByText('Saved')).toBeInTheDocument()

    // The stage saves the moment it changes.
    expect(screen.getByText('Auto follows your outreach activity. Pick a stage to override it.')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('combobox', { name: 'Stage' }))
    expect(await screen.findByRole('option', { name: 'Auto (currently: In conversation)' })).toBeInTheDocument()
    fireEvent.click(screen.getByRole('option', { name: 'Not a fit' }))
    await waitFor(() => expect(mockedSave).toHaveBeenCalledWith(workspaceId, {
      podcastId: 'show-one',
      manualStage: 'not_a_fit',
    }))

    fireEvent.click(screen.getByRole('combobox', { name: 'Choose a client' }))
    fireEvent.click(await screen.findByRole('option', { name: 'Jordan Client' }))
    expect(screen.getByText('Add a client')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Add' }))
    await waitFor(() => expect(mockedLinkClient).toHaveBeenCalledWith(workspaceId, {
      podcastId: 'show-one',
      clientId: '33333333-3333-4333-8333-333333333333',
      intent: 'considering',
    }))

    fireEvent.mouseDown(screen.getByRole('tab', { name: 'Notes 1' }), { button: 0, ctrlKey: false })
    fireEvent.click(screen.getByRole('combobox', { name: 'Interaction type' }))
    fireEvent.click(await screen.findByRole('option', { name: 'Call' }))
    fireEvent.change(screen.getByLabelText('Add an internal note'), { target: { value: 'Call went well.' } })
    fireEvent.click(screen.getByRole('button', { name: 'Log call' }))
    await waitFor(() => expect(mockedAddNote).toHaveBeenCalledWith(workspaceId, {
      podcastId: 'show-one',
      body: 'Call went well.',
      kind: 'call',
    }))
  })

  it('drops the duplicated header and the stat tiles from the panel', async () => {
    renderPage()
    await openDetails('Founder & Operator')

    expect(await screen.findByRole('tab', { name: 'Notes 1' })).toBeInTheDocument()
    expect(screen.getByRole('tab', { name: 'Threads 1' })).toBeInTheDocument()
    expect(screen.getByRole('tab', { name: 'Activity 2' })).toBeInTheDocument()
    expect(screen.getAllByText('Founder & Operator')).toHaveLength(1)
    expect(screen.queryByText('Saved threads')).not.toBeInTheDocument()
    expect(screen.queryByText('Internal notes')).not.toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Clients on this host 1' })).toBeInTheDocument()

    const headings = screen.getAllByText(/What we know about this host|^Stage$|Clients on this host|Recent activity/)
      .map((node) => node.textContent?.replace(/\s*\d+$/, ''))
    expect(headings).toEqual(['What we know about this host', 'Stage', 'Clients on this host', 'Recent activity'])
  })

  it('keeps campaign metadata and send status out of activity lines', async () => {
    renderPage()
    await openDetails('Founder & Operator')

    fireEvent.mouseDown(await screen.findByRole('tab', { name: 'Activity 2' }), { button: 0, ctrlKey: false })
    expect(screen.getByText('Taylor Client · Jul 9, 2026')).toBeInTheDocument()
    expect(screen.queryByText(/\(failed\)/)).not.toBeInTheDocument()
    expect(screen.queryByText(/Titan/)).not.toBeInTheDocument()

    // The Threads tab still carries the campaign for whoever needs it.
    fireEvent.mouseDown(screen.getByRole('tab', { name: 'Threads 1' }), { button: 0, ctrlKey: false })
    expect(screen.getByText(/Titan \| \(Sunnova, Mosaic\)/)).toBeInTheDocument()
  })

  // The inbox is retired: a live conversation opens its saved threads here
  // rather than linking anywhere else.
  it('opens a live conversation on its saved threads, with no inbox link', async () => {
    mockedList.mockResolvedValue([{ ...relationship, last_thread_key: 'thread-one', last_thread_client_id: clientId }])
    renderPage()

    fireEvent.click(await screen.findByRole('button', { name: 'View conversation' }))
    expect(await screen.findByRole('tab', { name: 'Threads 1' })).toHaveAttribute('data-state', 'active')
    expect(screen.queryByRole('link', { name: 'Open in the inbox' })).not.toBeInTheDocument()
    expect(screen.queryByRole('link', { name: /reply/i })).not.toBeInTheDocument()
  })

  it('turns the header chips into filters with whole-book counts', async () => {
    mockedListPage
      .mockResolvedValueOnce({
        relationships: [relationship],
        total: 2,
        offset: 0,
        has_more: true,
        next_offset: 1,
        counts: { in_conversation: 7, booked: 3, engaged: 4 },
      })
      .mockResolvedValueOnce({
        relationships: [{ ...relationship, podcast_id: 'show-two', podcast_name: 'Second Show', derived_state: 'booked' }],
        total: 2,
        offset: 1,
        has_more: false,
        next_offset: null,
        counts: { in_conversation: 7, booked: 3, engaged: 4 },
      })
    renderPage()

    await screen.findByText('Founder & Operator')
    const tabs = screen.getByRole('group', { name: 'Filter by status' })
    expect(within(tabs).getAllByRole('button').map((tab) => tab.textContent)).toEqual([
      'All 2', 'Needs attention 1', 'In conversation 7', 'Follow-up overdue 0', 'Placed 3',
    ])
    const live = within(tabs).getByRole('button', { name: 'In conversation 7' })
    expect(within(tabs).getByRole('button', { name: 'All 2' })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.queryByText(/engaged/)).not.toBeInTheDocument()
    expect(screen.getByText('1 of 2 relationships loaded. Search, filters and sorting cover the loaded rows.')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Load more relationships' }))
    expect(await screen.findByText('Second Show')).toBeInTheDocument()
    expect(mockedListPage).toHaveBeenLastCalledWith(workspaceId, { offset: 1 })

    fireEvent.click(within(tabs).getByRole('button', { name: 'Placed 3' }))
    expect(within(tabs).getByRole('button', { name: 'Placed 3' })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.queryByText('Founder & Operator')).not.toBeInTheDocument()
    expect(screen.getByText('Second Show')).toBeInTheDocument()
    fireEvent.click(within(tabs).getByRole('button', { name: 'All 2' }))
    expect(screen.getByText('Founder & Operator')).toBeInTheDocument()
    expect(live).toHaveAttribute('aria-pressed', 'false')
  })

  it('asks before removing a client from a host', async () => {
    mockedUnlinkClient.mockResolvedValue(undefined)
    renderPage()
    await openDetails('Founder & Operator')

    fireEvent.click(await screen.findByRole('button', { name: 'Unlink Taylor Client from this host' }))
    expect(await screen.findByRole('alertdialog', { name: 'Remove Taylor Client from this host?' })).toBeInTheDocument()
    expect(mockedUnlinkClient).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole('button', { name: 'Remove' }))

    await waitFor(() => expect(mockedUnlinkClient).toHaveBeenCalledWith(workspaceId, {
      podcastId: 'show-one',
      clientId,
    }))
  })

  // One status per row: a conversation silent past thirty days reads Gone
  // quiet instead of carrying a second "Went cold" badge.
  it('shows one status for a conversation that has gone quiet', async () => {
    mockedList.mockResolvedValue([
      { ...relationship, podcast_id: 'show-cold', podcast_name: 'Long Gone FM', derived_state: 'in_conversation', last_contacted_at: daysAgo(88), last_message_at: daysAgo(92) },
      { ...relationship, podcast_id: 'show-fresh', podcast_name: 'Fresh Talk', derived_state: 'in_conversation', last_contacted_at: daysAgo(0), last_message_at: daysAgo(0) },
    ])
    renderPage()

    expect(await screen.findByText('Gone quiet · 88d')).toBeInTheDocument()
    expect(screen.getByText('In conversation · today')).toBeInTheDocument()
    expect(screen.queryByText('Went cold')).not.toBeInTheDocument()
    expect(screen.queryByText('In conversation · 88d')).not.toBeInTheDocument()

    // Gone quiet needs attention; the fresh conversation where the host wrote
    // last does too (it is our move), so both are listed, quiet one included.
    fireEvent.click(screen.getByRole('button', { name: 'Needs attention 2' }))
    expect(screen.getByText('Long Gone FM')).toBeInTheDocument()
  })

  it('names an unresolved row after its host, never a placeholder', async () => {
    mockedList.mockResolvedValue([
      { ...relationship, podcast_id: 'manual-email', podcast_name: null, host_name: null, contact_email: 'unknown-host@example.com' },
      { ...relationship, podcast_id: 'manual-host', podcast_name: null, host_name: 'Priya Raman', contact_email: 'priya@example.com' },
    ])
    const { container } = renderPage()

    expect(await screen.findByRole('heading', { name: 'unknown-host@example.com' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Priya Raman' })).toBeInTheDocument()
    expect(container.textContent).not.toMatch(/not identified/i)

    const [nameFirst] = screen.getAllByRole('button', { name: 'Name this show' })
    fireEvent.click(nameFirst)
    const input = screen.getByRole('textbox', { name: 'Show name for unknown-host@example.com' })
    fireEvent.change(input, { target: { value: 'Draft' } })
    fireEvent.keyDown(input, { key: 'Escape' })
    expect(screen.queryByRole('textbox', { name: 'Show name for unknown-host@example.com' })).not.toBeInTheDocument()
    expect(mockedSave).not.toHaveBeenCalled()

    fireEvent.click(screen.getAllByRole('button', { name: 'Name this show' })[0])
    const editor = screen.getByRole('textbox', { name: 'Show name for unknown-host@example.com' })
    fireEvent.change(editor, { target: { value: 'The Scale Show' } })
    fireEvent.keyDown(editor, { key: 'Enter' })
    await waitFor(() => expect(mockedSave).toHaveBeenCalledWith(workspaceId, {
      podcastId: 'manual-email',
      podcastName: 'The Scale Show',
    }))
    // Saving never opened the row.
    expect(mockedDetail).not.toHaveBeenCalled()
  })

  it('falls back to initials when a cover will not load', async () => {
    const { container } = renderPage()
    await screen.findByRole('heading', { name: 'Founder & Operator' })

    const cover = container.querySelector('img[src="https://cdn.example.com/founder-operator.jpg"]')
    expect(cover).not.toBeNull()
    fireEvent.error(cover!)
    await waitFor(() => expect(container.querySelector('img')).toBeNull())
    expect(screen.getByText('FO')).toBeInTheDocument()
  })

  it('moves do not contact out of the header and asks before blocking a host', async () => {
    renderPage()
    await screen.findByRole('heading', { name: 'Founder & Operator' })
    expect(screen.queryByRole('button', { name: 'Do not contact' })).not.toBeInTheDocument()

    fireEvent.keyDown(screen.getByRole('button', { name: 'More actions for Founder & Operator' }), { key: 'Enter' })
    fireEvent.click(await screen.findByRole('menuitem', { name: 'Mark as do not contact…' }))
    expect(await screen.findByText('Block new pitches to this host?')).toBeInTheDocument()
    expect(mockedSave).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole('button', { name: 'Block pitches' }))

    await waitFor(() => expect(mockedSave).toHaveBeenCalledWith(workspaceId, {
      podcastId: 'show-one',
      manualStage: 'do_not_contact',
    }))
  })

  it('removes a row that is not a host without asking, and sends the narrow dismiss', async () => {
    mockedDismiss.mockResolvedValue(undefined)
    renderPage()
    await screen.findByRole('heading', { name: 'Founder & Operator' })

    fireEvent.keyDown(screen.getByRole('button', { name: 'More actions for Founder & Operator' }), { key: 'Enter' })
    fireEvent.click(await screen.findByRole('menuitem', { name: 'Not a host, remove' }))

    await waitFor(() => expect(mockedDismiss).toHaveBeenCalledWith(workspaceId, {
      podcastId: 'show-one',
      dismissed: true,
    }))
    expect(mockedSave).not.toHaveBeenCalled()
  })

  it('snoozes a row for a week, and marks one placed, from the row menu', async () => {
    renderPage()
    await screen.findByRole('heading', { name: 'Founder & Operator' })
    const before = Date.now()

    fireEvent.keyDown(screen.getByRole('button', { name: 'More actions for Founder & Operator' }), { key: 'Enter' })
    const items = (await screen.findAllByRole('menuitem')).map((item) => item.textContent)
    // Do not contact stays last.
    expect(items.at(-1)).toBe('Mark as do not contact…')
    expect(items).toEqual(expect.arrayContaining([
      'Snooze 3 days', 'Snooze 1 week', 'Snooze 2 weeks', 'Snooze until…',
      'Mark placed', 'Not a fit', 'Edit show details…', 'Not a host, remove',
    ]))
    fireEvent.click(screen.getByRole('menuitem', { name: 'Snooze 1 week' }))

    await waitFor(() => expect(mockedSave).toHaveBeenCalledTimes(1))
    const [, input] = mockedSave.mock.calls[0] as [string, { podcastId: string; snoozedUntil: string }]
    expect(input.podcastId).toBe('show-one')
    const days = (new Date(input.snoozedUntil).getTime() - before) / 86_400_000
    expect(days).toBeGreaterThanOrEqual(6.99)
    expect(days).toBeLessThan(7.01)

    fireEvent.keyDown(screen.getByRole('button', { name: 'More actions for Founder & Operator' }), { key: 'Enter' })
    fireEvent.click(await screen.findByRole('menuitem', { name: 'Mark placed' }))
    await waitFor(() => expect(mockedSave).toHaveBeenLastCalledWith(workspaceId, {
      podcastId: 'show-one',
      manualStage: 'placed',
    }))
  })

  it('shows a snoozed row as snoozed and keeps it out of Needs attention', async () => {
    mockedList.mockResolvedValue([{ ...relationship, snoozed_until: daysAgo(-5) }])
    renderPage()

    expect(await screen.findByText(/^Snoozed until /)).toBeInTheDocument()
    expect(screen.queryByText('Your move')).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Needs attention 0' })).toBeInTheDocument()
  })

  it('edits show details in a dialog', async () => {
    renderPage()
    await screen.findByRole('heading', { name: 'Founder & Operator' })

    fireEvent.keyDown(screen.getByRole('button', { name: 'More actions for Founder & Operator' }), { key: 'Enter' })
    fireEvent.click(await screen.findByRole('menuitem', { name: 'Edit show details…' }))
    const show = await screen.findByLabelText('Show name')
    expect(show).toHaveValue('Founder & Operator')
    fireEvent.change(show, { target: { value: 'Founder and Operator' } })
    fireEvent.change(screen.getByLabelText('Host name'), { target: { value: 'Morgan Q. Host' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))

    await waitFor(() => expect(mockedSave).toHaveBeenCalledWith(workspaceId, {
      podcastId: 'show-one',
      podcastName: 'Founder and Operator',
      hostName: 'Morgan Q. Host',
      contactEmail: 'morgan@example.com',
    }))
  })

  it('leads the overview with the last message, then notes, stage, clients and activity', async () => {
    renderPage()
    await openDetails('Founder & Operator')

    const panel = await screen.findByRole('tabpanel')
    const order = [
      within(panel).getByRole('heading', { name: 'Last message' }),
      within(panel).getByText('What we know about this host'),
      within(panel).getByText('Stage'),
      within(panel).getByText(/^Clients on this host/),
      within(panel).getByRole('heading', { name: 'Recent activity' }),
    ]
    for (let index = 1; index < order.length; index += 1) {
      expect(order[index - 1].compareDocumentPosition(order[index]) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    }
    fireEvent.click(within(panel).getByRole('button', { name: 'View conversation' }))
    expect(await screen.findByText('Saved inbox threads')).toBeInTheDocument()
  })

  it('shows skeleton rows while the history loads', async () => {
    mockedDetail.mockReturnValue(new Promise(() => {}))
    renderPage()
    await openDetails('Founder & Operator')
    expect(screen.getByRole('status', { name: 'Loading history' })).toBeInTheDocument()
    expect(screen.queryByText('Loading history…')).not.toBeInTheDocument()
  })

  it('lets a manager add a relationship before outreach exists', async () => {
    renderPage()
    await screen.findByRole('heading', { name: 'Founder & Operator' })

    fireEvent.click(screen.getByRole('button', { name: 'Add relationship' }))
    const dialog = screen.getByRole('dialog')
    expect(within(dialog).getByText(
      "Add a host you're working with, by show name, email, or both.",
    )).toBeInTheDocument()
    expect(within(dialog).getByRole('button', { name: 'Add relationship' })).toBeDisabled()
    expect(within(dialog).getByText('Add a show name or a host email to continue.')).toBeVisible()
    expect(within(dialog).getByPlaceholderText('host@example.com')).toBeInTheDocument()
    expect(within(dialog).getByRole('combobox', { name: 'Stage' })).toHaveTextContent('Nurturing')

    fireEvent.change(within(dialog).getByLabelText(/Show name/), { target: { value: 'The Operator Room' } })
    fireEvent.change(within(dialog).getByLabelText('Host name'), { target: { value: 'Alex Host' } })
    fireEvent.change(within(dialog).getByLabelText(/Host email/), { target: { value: 'alex@example.com' } })
    fireEvent.change(within(dialog).getByLabelText('Notes'), { target: { value: 'Met at the operator summit.' } })
    fireEvent.click(within(dialog).getByRole('button', { name: 'Add relationship' }))

    await waitFor(() => expect(mockedCreate).toHaveBeenCalledWith(workspaceId, {
      podcastName: 'The Operator Room',
      hostName: 'Alex Host',
      contactEmail: 'alex@example.com',
      manualStage: 'nurturing',
      summary: 'Met at the operator summit.',
    }))
  })

  it('adds a host by email alone', async () => {
    renderPage()
    await screen.findByRole('heading', { name: 'Founder & Operator' })

    fireEvent.click(screen.getByRole('button', { name: 'Add relationship' }))
    const dialog = screen.getByRole('dialog')
    fireEvent.change(within(dialog).getByLabelText(/Host email/), { target: { value: 'alex@example.com' } })
    fireEvent.click(within(dialog).getByRole('button', { name: 'Add relationship' }))

    await waitFor(() => expect(mockedCreate).toHaveBeenCalledWith(workspaceId, {
      podcastName: null,
      hostName: null,
      contactEmail: 'alex@example.com',
      manualStage: 'nurturing',
      summary: null,
    }))
  })

  it('shows an empty state when the workspace has no hosts', async () => {
    mockedList.mockResolvedValue([])
    renderPage()

    expect(await screen.findByRole('heading', { name: 'No hosts yet' })).toBeInTheDocument()
    expect(screen.getByText("Add the hosts you're working with. Only hosts someone adds appear here.")).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Add relationship' })).toBeInTheDocument()
    expect(screen.queryByLabelText('Search relationships')).not.toBeInTheDocument()
  })

  it('pages a growing relationship book and resets pagination for search', async () => {
    mockedList.mockResolvedValue(Array.from({ length: 30 }, (_, index) => ({
      ...relationship,
      podcast_id: `show-${index + 1}`,
      podcast_name: `Relationship Show ${String(index + 1).padStart(2, '0')}`,
      host_name: `Host ${index + 1}`,
      contact_email: `host-${index + 1}@example.com`,
    })))

    renderPage()

    expect(await screen.findByText('Relationship Show 01')).toBeInTheDocument()
    expect(screen.getByText('Relationship Show 25')).toBeInTheDocument()
    expect(screen.queryByText('Relationship Show 26')).not.toBeInTheDocument()
    expect(screen.getByText('Showing 1–25 of 30 relationships')).toBeInTheDocument()
    expect(screen.getByText('Page 1 of 2')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Next' }))
    expect(screen.getByText('Relationship Show 26')).toBeInTheDocument()
    expect(screen.queryByText('Relationship Show 01')).not.toBeInTheDocument()
    expect(screen.getByText('Showing 26–30 of 30 relationships')).toBeInTheDocument()

    fireEvent.change(screen.getByLabelText('Search relationships'), { target: { value: 'Show 01' } })
    expect(screen.getByText('Relationship Show 01')).toBeInTheDocument()
    expect(screen.queryByRole('navigation', { name: 'Relationship pagination' })).not.toBeInTheDocument()
    expect(screen.getByLabelText('Sort relationships')).toBeInTheDocument()
  })

  // A new relationship has no outreach, so it sorts last; opening it after
  // creation ran the detail request for a card that never rendered because
  // the row sat on a page the operator was not looking at.
  it('moves to the page of a newly added relationship so its card is on screen', async () => {
    mockedList.mockResolvedValue(Array.from({ length: 30 }, (_, index) => ({
      ...relationship,
      podcast_id: `show-${index + 1}`,
      podcast_name: `Relationship Show ${String(index + 1).padStart(2, '0')}`,
      host_name: `Host ${index + 1}`,
      contact_email: `host-${index + 1}@example.com`,
    })))
    mockedCreate.mockResolvedValue({ podcast_id: 'show-30', created: true })

    renderPage()
    expect(await screen.findByText('Relationship Show 01')).toBeInTheDocument()
    expect(screen.queryByText('Relationship Show 30')).not.toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Add relationship' }))
    const dialog = screen.getByRole('dialog')
    fireEvent.change(within(dialog).getByLabelText(/Show name/), { target: { value: 'Relationship Show 30' } })
    fireEvent.click(within(dialog).getByRole('button', { name: 'Add relationship' }))

    expect(await screen.findByRole('heading', { name: 'Relationship Show 30' })).toBeInTheDocument()
    expect(screen.getByText('Showing 26–30 of 30 relationships')).toBeInTheDocument()
    expect(screen.queryByText('Relationship Show 01')).not.toBeInTheDocument()
  })

  it('gives ordinary members relationship context without mutation controls', async () => {
    mockedUseAuth.mockReturnValue({
      user: { id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb' },
      workspace: { id: workspaceId, name: 'Acme Workspace' },
      membership: { role: 'member' },
      isPlatformAdmin: false,
    } as never)

    renderPage()
    await screen.findByRole('heading', { name: 'Founder & Operator' })
    expect(screen.getByText(/owners and admins curate stages/i)).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /More actions/ })).not.toBeInTheDocument()
    await openDetails('Founder & Operator')

    expect(await screen.findByText('Prefers practical operator stories.')).toBeInTheDocument()
    expect(screen.queryByRole('combobox', { name: 'Stage' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Save note' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Add relationship' })).not.toBeInTheDocument()
    expect(mockedClients).not.toHaveBeenCalled()
  })

  it('keeps platform admins inside the explicitly selected workspace shell', async () => {
    mockedUseAuth.mockReturnValue({
      user: { id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa' },
      workspace: null,
      membership: null,
      isPlatformAdmin: true,
    } as never)

    renderPage({ platformWorkspaceId })

    expect(await screen.findByText('Founder & Operator')).toBeInTheDocument()
    expect(mockedAdminWorkspace).toHaveBeenCalledWith(platformWorkspaceId, expect.any(AbortSignal))
    expect(mockedList).toHaveBeenCalledWith(platformWorkspaceId)
    expect(screen.getByTestId('workspace-layout')).toHaveAttribute(
      'data-base-href',
      `/app/workspaces/${platformWorkspaceId}`,
    )
  })
})
