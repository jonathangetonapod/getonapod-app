import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useAuth } from '@/contexts/AuthContext'
import {
  WORKSPACE_NAV_ORGANIZE_EVENT,
  WorkspaceLayout,
  type PlatformWorkspaceConfig,
} from '@/components/workspace/WorkspaceLayout'
import { getWorkspaceBillingOverview } from '@/services/workspaceStaff'
import { getWorkspaceClients } from '@/services/clients'
import { readWorkingClient, writeWorkingClient } from '@/lib/workingClient'

vi.mock('@/contexts/AuthContext', () => ({ useAuth: vi.fn() }))
vi.mock('@/components/admin/WorkspaceSwitcher', () => ({
  WorkspaceSwitcher: () => <div>Workspace switcher</div>,
}))
vi.mock('@/services/workspaceStaff', () => ({ getWorkspaceBillingOverview: vi.fn() }))
vi.mock('@/services/clients', () => ({ getWorkspaceClients: vi.fn() }))

const mockedUseAuth = vi.mocked(useAuth)
const mockedBillingOverview = vi.mocked(getWorkspaceBillingOverview)
const mockedClients = vi.mocked(getWorkspaceClients)
const signOut = vi.fn()
const workspaceId = '11111111-1111-4111-8111-111111111111'
// Somebody else's workspace, so a balance read against the viewer's own would
// be visible as the wrong id rather than passing by coincidence.
const viewedWorkspaceId = '22222222-2222-4222-8222-222222222222'
const clientId = '44444444-4444-4444-8444-444444444444'
const otherClientId = '55555555-5555-4555-8555-555555555555'
const workspaceClients = [
  { id: clientId, workspace_id: workspaceId, name: 'Dallas Fontaine', status: 'active' },
  { id: otherClientId, workspace_id: workspaceId, name: 'Priya Natarajan', status: 'active' },
  // Not offered: nobody is working on a churned client.
  { id: '66666666-6666-4666-8666-666666666666', workspace_id: workspaceId, name: 'Former Client', status: 'churned' },
]
// The daily loop first, then setup and reference pages.
const expectedNavigation = [
  'Clients',
  'Client Command Center',
  'Podcast Finder',
  'Podcast Database',
  'Client Campaigns',
  'Inbox',
  'Relationships',
  'Prospect Studio',
  'Client intake',
  'Mailboxes',
  'University',
  'Billing & credits',
  'Settings',
]

function renderLayout(platformWorkspace?: PlatformWorkspaceConfig, initialEntry?: string) {
  // The shell reads the credit balance now, so it needs the app's query client
  // the same way every other data-reading component does.
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={[initialEntry || (platformWorkspace ? `${platformWorkspace.baseHref}/clients` : '/app/clients')]} future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
        <WorkspaceLayout platformWorkspace={platformWorkspace}><div>Module content</div></WorkspaceLayout>
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

function chooseWorkingClient(label: string) {
  fireEvent.click(screen.getByRole('combobox', { name: 'Working client' }))
  fireEvent.click(screen.getByRole('option', { name: label }))
}

describe('WorkspaceLayout', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    window.localStorage.clear()
    window.sessionStorage.clear()
    signOut.mockResolvedValue(undefined)
    mockedClients.mockResolvedValue(workspaceClients as never)
    mockedUseAuth.mockReturnValue({
      user: {
        id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
        email: 'owner@example.com',
        user_metadata: { full_name: 'Owner Name' },
      },
      workspace: { id: workspaceId, name: 'Acme Workspace' },
      membership: { full_name: 'Owner Name', role: 'owner' },
      isPlatformAdmin: false,
      signOut,
    } as never)
  })

  it('puts buying credits one click away, not behind a settings sub-page', () => {
    renderLayout()

    const navigation = screen.getByRole('navigation', { name: 'Workspace navigation' })
    expect(within(navigation).getByRole('link', { name: 'Billing & credits' }))
      .toHaveAttribute('href', '/app/settings/billing')
  })

  it('drops billing while a platform admin is viewing somebody else\'s workspace', () => {
    renderLayout({
      workspaceId: viewedWorkspaceId,
      baseHref: `/app/workspaces/${viewedWorkspaceId}`,
      workspaceName: 'Acme Workspace',
      logoUrl: null,
    })

    const navigation = screen.getByRole('navigation', { name: 'Workspace navigation' })
    // That route is not workspace-scoped, so showing it would link to a page
    // that does not exist for the workspace being viewed.
    expect(within(navigation).queryByRole('link', { name: 'Billing & credits' })).toBeNull()
  })

  it('matches the complete navigation order and enables settings for an owner', () => {
    renderLayout()

    expect(screen.getByTestId('workspace-layout')).toHaveClass('max-w-full', 'overflow-x-clip')
    const navigation = screen.getByRole('navigation', { name: 'Workspace navigation' })
    const labels = within(navigation).getAllByRole('listitem').map((item) => (
      item.querySelector('span')?.textContent
    ))
    expect(labels).toEqual(expectedNavigation)

    const links = within(navigation).getAllByRole('link')
    // 13 with University, the platform training library added 2026-08-07.
    expect(links).toHaveLength(13)
    expect(within(navigation).getByRole('link', { name: 'Settings' })).toHaveAttribute(
      'href',
      '/app/settings',
    )
    expect(within(navigation).getByRole('link', { name: 'Clients' })).toHaveAttribute('href', '/app/clients')
    expect(within(navigation).getByRole('link', { name: 'Client intake' })).toHaveAttribute('href', '/app/onboarding')
    expect(within(navigation).getByRole('link', { name: 'Podcast Finder' })).toHaveAttribute('href', '/app/podcast-finder')
    expect(within(navigation).getByRole('link', { name: 'Podcast Database' })).toHaveAttribute('href', '/app/podcast-database')
    expect(within(navigation).getByRole('link', { name: 'Client Command Center' })).toHaveAttribute('href', '/app/client-podcast-system')
    expect(within(navigation).getByRole('link', { name: 'Prospect Studio' })).toHaveAttribute('href', '/app/prospects')
    expect(within(navigation).getByRole('link', { name: 'Client Campaigns' })).toHaveAttribute('href', '/app/client-campaigns')
    expect(within(navigation).getByRole('link', { name: 'Inbox' })).toHaveAttribute('href', '/app/master-inbox')
    expect(within(navigation).getByRole('link', { name: 'Mailboxes' })).toHaveAttribute('href', '/app/mailboxes')

    const disabledModules = within(navigation).queryAllByRole('button').filter((button) => button.hasAttribute('disabled'))
    expect(disabledModules).toHaveLength(0)
    expect(screen.getAllByText('Acme Workspace')).toHaveLength(4)
    expect(screen.getByText('owner@example.com')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /sign out/i })).toBeEnabled()
  })

  // "Workspace dashboard" under the name was filler on every page. The page
  // the person is actually on is worth the space; nothing is, when no module
  // matches.
  it('names the active module under the workspace name', () => {
    const { unmount } = renderLayout(undefined, '/app/master-inbox')

    const header = screen.getByRole('banner')
    expect(within(header).getAllByText('Inbox')).toHaveLength(2)
    expect(screen.queryByText('Workspace dashboard')).not.toBeInTheDocument()
    unmount()

    renderLayout(undefined, '/app/manage-workspaces')
    expect(within(screen.getByRole('banner')).queryByText('Inbox')).not.toBeInTheDocument()
    expect(screen.queryByText('Workspace dashboard')).not.toBeInTheDocument()
  })

  it('restores and resets a navigation order saved for this owner and workspace', () => {
    const storageKey = `workspace-nav-order-v2:${workspaceId}:aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa`
    window.localStorage.setItem(storageKey, JSON.stringify(['prospects', 'podcast-finder', 'onboarding']))
    renderLayout()

    const navigation = screen.getByRole('navigation', { name: 'Workspace navigation' })
    expect(within(navigation).getAllByRole('listitem').slice(0, 3).map((item) => (
      item.querySelector('span')?.textContent
    ))).toEqual(['Prospect Studio', 'Podcast Finder', 'Client intake'])

    // Reordering lives in the sidebar footer now, not as a block above the nav.
    expect(within(navigation).queryByRole('button', { name: 'Reorder' })).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Reorder' }))
    expect(within(navigation).getAllByRole('button', { name: /^Drag /u })).toHaveLength(expectedNavigation.length)
    expect(within(navigation).getByText(/changes save automatically/i)).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Reorder' })).not.toBeInTheDocument()

    fireEvent.click(within(navigation).getByRole('button', { name: 'Reset' }))
    expect(within(navigation).getAllByRole('listitem').map((item) => (
      item.querySelector('span')?.textContent
    ))).toEqual(expectedNavigation)
    expect(window.localStorage.getItem(storageKey)).toBeNull()

    fireEvent.click(within(navigation).getByRole('button', { name: 'Done' }))
    expect(screen.getByRole('button', { name: 'Reorder' })).toBeInTheDocument()
  })

  // A complete order saved under the previous default keeps every position the
  // person chose; the new default order only applies to people who never
  // arranged theirs.
  it('keeps a saved custom order intact across the default reorder', () => {
    const storageKey = `workspace-nav-order-v2:${workspaceId}:aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa`
    const savedOrder = [
      'onboarding', 'podcast-finder', 'prospects', 'podcast-database', 'client-podcast-system',
      'clients', 'outreach-platform', 'relationships', 'unibox', 'mailboxes', 'university',
      'billing', 'settings',
    ]
    window.localStorage.setItem(storageKey, JSON.stringify(savedOrder))
    renderLayout()

    const navigation = screen.getByRole('navigation', { name: 'Workspace navigation' })
    expect(within(navigation).getAllByRole('listitem').map((item) => (
      item.querySelector('span')?.textContent
    ))).toEqual([
      'Client intake', 'Podcast Finder', 'Prospect Studio', 'Podcast Database', 'Client Command Center',
      'Clients', 'Client Campaigns', 'Relationships', 'Inbox', 'Mailboxes', 'University',
      'Billing & credits', 'Settings',
    ])
  })

  /*
   * One choice in the header instead of re-picking the same person on every
   * page. The modules that filter by client open on them; the ones that do
   * not are left alone, so no page carries a parameter it ignores.
   */
  it('opens every client-scoped module on the working client', async () => {
    renderLayout()

    const navigation = screen.getByRole('navigation', { name: 'Workspace navigation' })
    const combobox = await screen.findByRole('combobox', { name: 'Working client' })
    expect(combobox).toHaveTextContent('All clients')
    await waitFor(() => expect(mockedClients).toHaveBeenCalledWith(workspaceId))

    chooseWorkingClient('Dallas Fontaine')

    expect(combobox).toHaveTextContent('Dallas Fontaine')
    expect(readWorkingClient(workspaceId)).toBe(clientId)
    expect(within(navigation).getByRole('link', { name: 'Podcast Finder' })).toHaveAttribute('href', `/app/podcast-finder?client=${clientId}`)
    expect(within(navigation).getByRole('link', { name: 'Podcast Database' })).toHaveAttribute('href', `/app/podcast-database?client=${clientId}`)
    expect(within(navigation).getByRole('link', { name: 'Client Command Center' })).toHaveAttribute('href', `/app/client-podcast-system?client=${clientId}`)
    expect(within(navigation).getByRole('link', { name: 'Inbox' })).toHaveAttribute('href', `/app/master-inbox?client=${clientId}`)
    expect(within(navigation).getByRole('link', { name: 'Client Campaigns' })).toHaveAttribute('href', `/app/client-campaigns/${clientId}`)
    expect(within(navigation).getByRole('link', { name: 'Clients' })).toHaveAttribute('href', '/app/clients')
    expect(within(navigation).getByRole('link', { name: 'Relationships' })).toHaveAttribute('href', '/app/relationships')
    expect(within(navigation).getByRole('link', { name: 'Client intake' })).toHaveAttribute('href', '/app/onboarding')
    expect(within(navigation).getByRole('link', { name: 'Clients' })).toHaveAttribute('aria-current', 'page')

    chooseWorkingClient('All clients')

    expect(combobox).toHaveTextContent('All clients')
    expect(readWorkingClient(workspaceId)).toBeNull()
    expect(within(navigation).getByRole('link', { name: 'Podcast Finder' })).toHaveAttribute('href', '/app/podcast-finder')
    expect(within(navigation).getByRole('link', { name: 'Client Campaigns' })).toHaveAttribute('href', '/app/client-campaigns')
    expect(within(navigation).getByRole('link', { name: 'Inbox' })).toHaveAttribute('href', '/app/master-inbox')
  })

  it('offers only active clients and remembers the choice for the tab', async () => {
    writeWorkingClient(workspaceId, otherClientId)
    renderLayout()

    const combobox = await screen.findByRole('combobox', { name: 'Working client' })
    await waitFor(() => expect(combobox).toHaveTextContent('Priya Natarajan'))
    const navigation = screen.getByRole('navigation', { name: 'Workspace navigation' })
    expect(within(navigation).getByRole('link', { name: 'Inbox' })).toHaveAttribute('href', `/app/master-inbox?client=${otherClientId}`)

    fireEvent.click(combobox)
    expect(screen.getByRole('option', { name: 'Dallas Fontaine' })).toBeInTheDocument()
    expect(screen.queryByRole('option', { name: 'Former Client' })).not.toBeInTheDocument()
  })

  // A page opened with ?client= (a link from another module, a bookmark) is a
  // choice too, and the header follows it rather than arguing.
  it('adopts the client a scoped page was opened on', async () => {
    renderLayout(undefined, `/app/client-podcast-system?client=${otherClientId}`)

    await waitFor(() => expect(readWorkingClient(workspaceId)).toBe(otherClientId))
    const combobox = await screen.findByRole('combobox', { name: 'Working client' })
    await waitFor(() => expect(combobox).toHaveTextContent('Priya Natarajan'))
    const navigation = screen.getByRole('navigation', { name: 'Workspace navigation' })
    expect(within(navigation).getByRole('link', { name: 'Podcast Finder' })).toHaveAttribute('href', `/app/podcast-finder?client=${otherClientId}`)
    expect(within(navigation).getByRole('link', { name: 'Client Command Center' })).toHaveAttribute('aria-current', 'page')
  })

  it('drops a working client that is no longer active', async () => {
    writeWorkingClient(workspaceId, '66666666-6666-4666-8666-666666666666')
    renderLayout()

    await waitFor(() => expect(readWorkingClient(workspaceId)).toBeNull())
    expect(screen.getByRole('combobox', { name: 'Working client' })).toHaveTextContent('All clients')
  })

  it('keeps the sidebar scroll position stable when the layout remounts during navigation', () => {
    const storageKey = `workspace-nav-scroll-v1:${workspaceId}:aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa`
    const firstRender = renderLayout()
    const firstNavigation = screen.getByRole('navigation', { name: 'Workspace navigation' })

    firstNavigation.scrollTop = 184
    fireEvent.scroll(firstNavigation)
    expect(window.sessionStorage.getItem(storageKey)).toBe('184')

    firstRender.unmount()
    renderLayout()

    expect(screen.getByRole('navigation', { name: 'Workspace navigation' }).scrollTop).toBe(184)
  })

  it('splices a newly shipped module into a complete saved order at its default slot', () => {
    // Saved before University existed: all twelve prior ids, custom order.
    const storageKey = `workspace-nav-order-v2:${workspaceId}:aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa`
    const priorOrder = [
      'clients', 'onboarding', 'podcast-finder', 'prospects', 'podcast-database',
      'client-podcast-system', 'outreach-platform', 'relationships', 'unibox',
      'mailboxes', 'billing', 'settings',
    ]
    window.localStorage.setItem(storageKey, JSON.stringify(priorOrder))
    renderLayout()

    const navigation = screen.getByRole('navigation', { name: 'Workspace navigation' })
    const labels = within(navigation).getAllByRole('listitem').map((item) => (
      item.querySelector('span')?.textContent
    ))
    // Appending put the new module below Settings — where nobody looks.
    // A complete prior order gets it at its default position instead.
    expect(labels.indexOf('University')).toBeGreaterThan(-1)
    expect(labels.indexOf('University')).toBeLessThan(labels.indexOf('Billing & credits'))
    expect(labels[0]).toBe('Clients')
  })

  it('opens owner organize mode when requested from workspace settings', () => {
    renderLayout()

    const navigation = screen.getByRole('navigation', { name: 'Workspace navigation' })
    fireEvent(window, new Event(WORKSPACE_NAV_ORGANIZE_EVENT))

    expect(within(navigation).getByRole('button', { name: 'Done' })).toBeInTheDocument()
    expect(within(navigation).getAllByRole('button', { name: /^Drag /u })).toHaveLength(expectedNavigation.length)
  })

  // Both hrefs prefix /app/settings/billing, so Settings lit up next to
  // Billing whenever the operator was on the billing page.
  it('marks only the most specific item active on a nested route', () => {
    render(
      <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
        <MemoryRouter initialEntries={['/app/settings/billing']} future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
          <WorkspaceLayout><div>Module content</div></WorkspaceLayout>
        </MemoryRouter>
      </QueryClientProvider>,
    )

    const navigation = screen.getByRole('navigation', { name: 'Workspace navigation' })
    expect(within(navigation).getByRole('link', { name: 'Billing & credits' })).toHaveAttribute('aria-current', 'page')
    expect(within(navigation).getByRole('link', { name: 'Settings' })).not.toHaveAttribute('aria-current')
  })

  it('enables settings for an admin and keeps it unavailable to a member', () => {
    mockedUseAuth.mockReturnValue({
      user: { id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', email: 'admin@example.com' },
      workspace: { id: workspaceId, name: 'Acme Workspace' },
      membership: { full_name: 'Agency Admin', role: 'admin' },
      isPlatformAdmin: false,
      signOut,
    } as never)
    const { unmount } = render(
      <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
        <MemoryRouter initialEntries={['/app/clients']} future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
          <WorkspaceLayout><div>Module content</div></WorkspaceLayout>
        </MemoryRouter>
      </QueryClientProvider>,
    )
    expect(screen.getByRole('link', { name: 'Settings' })).toHaveAttribute('href', '/app/settings')
    expect(screen.queryByRole('button', { name: 'Reorder' })).not.toBeInTheDocument()

    unmount()
    mockedUseAuth.mockReturnValue({
      user: { id: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc', email: 'member@example.com' },
      workspace: { id: workspaceId, name: 'Acme Workspace' },
      membership: { full_name: 'Agency Member', role: 'member' },
      isPlatformAdmin: false,
      signOut,
    } as never)
    renderLayout()

    const navigation = screen.getByRole('navigation', { name: 'Workspace navigation' })
    expect(within(navigation).queryByRole('link', { name: 'Settings' })).not.toBeInTheDocument()
    const settings = within(navigation).getByText('Settings').closest('button')
    expect(settings).toBeDisabled()
    expect(within(settings as HTMLElement).getByText('Owner/Admin')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Reorder' })).not.toBeInTheDocument()
  })

  /*
   * Supporting an agency means knowing whether they are about to run out. The
   * balance was hidden here on the grounds that it is not the admin's to act on
   * — true of acting, not of knowing — so the number now shows and leads to the
   * platform billing screen rather than the agency's own.
   */
  it('reads the viewed workspace balance and sends it to the platform screen', async () => {
    mockedUseAuth.mockReturnValue({
      user: { email: 'platform@example.com' },
      workspace: { id: workspaceId, name: 'Acme Workspace' },
      membership: null,
      isPlatformAdmin: true,
      signOut,
    } as never)
    mockedBillingOverview.mockResolvedValue({
      enforcement_enabled: true,
      monthly_credit_allowance: 100,
      balance: 850,
    } as never)

    renderLayout({
      workspaceId: viewedWorkspaceId,
      workspaceName: 'Selected Workspace',
      logoUrl: null,
      baseHref: `/app/workspaces/${viewedWorkspaceId}`,
    })

    const chip = await screen.findByRole('link', { name: /850 credits remaining/i })
    // With the tenant named, so the top-up screen opens on this agency.
    expect(chip).toHaveAttribute('href', `/app/platform/billing?workspace=${viewedWorkspaceId}`)
    // Theirs, not the admin's own.
    expect(mockedBillingOverview).toHaveBeenCalledWith(viewedWorkspaceId)
    expect(mockedBillingOverview).not.toHaveBeenCalledWith(workspaceId)
  })

  it('renders a selected workspace as a native platform-owner context', () => {
    mockedUseAuth.mockReturnValue({
      user: { email: 'owner@example.com' },
      workspace: { id: workspaceId, name: 'Acme Workspace' },
      membership: { full_name: 'Owner Name', role: 'owner' },
      isPlatformAdmin: true,
      signOut,
    } as never)
    const platformWorkspace: PlatformWorkspaceConfig = {
      workspaceId,
      workspaceName: 'Selected Workspace',
      logoUrl: 'https://cdn.example/selected-workspace.png',
      baseHref: `/app/workspaces/${workspaceId}`,
    }
    renderLayout(platformWorkspace)

    const navigation = screen.getByRole('navigation', { name: 'Workspace navigation' })
    expect(within(navigation).getByRole('link', { name: 'Settings' })).toHaveAttribute(
      'href',
      `/app/workspaces/${workspaceId}/settings`,
    )
    expect(within(navigation).getByRole('link', { name: 'Clients' })).toHaveAttribute(
      'href',
      `/app/workspaces/${workspaceId}/clients`,
    )
    expect(within(navigation).getByRole('link', { name: 'Client intake' })).toHaveAttribute(
      'href',
      `/app/workspaces/${workspaceId}/onboarding`,
    )
    expect(within(navigation).getByRole('link', { name: 'Podcast Database' })).toHaveAttribute(
      'href',
      `/app/workspaces/${workspaceId}/podcast-database`,
    )
    expect(within(navigation).getByRole('link', { name: 'Client Command Center' })).toHaveAttribute(
      'href',
      `/app/workspaces/${workspaceId}/client-podcast-system`,
    )
    expect(within(navigation).getByRole('link', { name: 'Prospect Studio' })).toHaveAttribute(
      'href',
      `/app/workspaces/${workspaceId}/prospects`,
    )
    expect(within(navigation).getByRole('link', { name: 'Client Campaigns' })).toHaveAttribute(
      'href',
      `/app/workspaces/${workspaceId}/client-campaigns`,
    )
    expect(within(navigation).getByRole('link', { name: 'Inbox' })).toHaveAttribute(
      'href',
      `/app/workspaces/${workspaceId}/master-inbox`,
    )
    expect(within(navigation).getByRole('link', { name: 'Mailboxes' })).toHaveAttribute(
      'href',
      `/app/workspaces/${workspaceId}/mailboxes`,
    )
    expect(screen.queryByText(/admin preview/i)).not.toBeInTheDocument()
    expect(screen.getByText('owner@example.com')).toBeInTheDocument()
    expect(screen.getByText('platform owner')).toBeInTheDocument()
    expect(screen.getByText('Workspace switcher')).toBeInTheDocument()
    expect(screen.getByText('Workspace switcher').closest('header')).not.toBeNull()
    expect(screen.getByRole('button', { name: 'Reorder' })).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Reorder' }))
    expect(within(navigation).getByRole('button', { name: 'Done' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Manage workspaces' })).toHaveAttribute('href', '/app/manage-workspaces')
    expect(screen.getByRole('button', { name: /sign out/i })).toBeEnabled()
    expect(screen.getByTestId('workspace-logo-sidebar')).toHaveClass('h-24', 'w-full', 'bg-transparent')
    expect(screen.getByTestId('workspace-logo-sidebar')).not.toHaveClass('bg-gradient-to-br')
    expect(screen.getByTestId('workspace-logo-sidebar')).toHaveAttribute('data-logo-state', 'uploaded')
  })

  /*
   * A tenant's shell looks exactly like the admin's own, which is the point of
   * it and also how an admin edits the wrong agency. The strip stays on screen
   * for as long as they are inside somebody else's, and never in their own.
   */
  it('keeps a platform admin told whose workspace they are inside', async () => {
    mockedUseAuth.mockReturnValue({
      user: { email: 'platform@example.com' },
      workspace: { id: workspaceId, name: 'Acme Workspace' },
      membership: null,
      isPlatformAdmin: true,
      signOut,
    } as never)
    renderLayout({
      workspaceId: viewedWorkspaceId,
      workspaceName: 'Northwind Agency',
      logoUrl: null,
      baseHref: `/app/workspaces/${viewedWorkspaceId}`,
    })

    const strip = screen.getByTestId('platform-tenant-strip')
    expect(strip).toHaveTextContent('You are viewing Northwind Agency as platform admin. Changes here are live for their team.')
    expect(within(strip).getByRole('link', { name: 'Back to Manage workspaces' })).toHaveAttribute('href', '/app/manage-workspaces')
    expect(strip.className).toMatch(/amber/)
    // The working client is the tenant's, not the admin's own.
    await waitFor(() => expect(mockedClients).toHaveBeenCalledWith(viewedWorkspaceId))
    expect(mockedClients).not.toHaveBeenCalledWith(workspaceId)
  })

  it('shows no tenant strip in the admin own workspace', () => {
    mockedUseAuth.mockReturnValue({
      user: { email: 'platform@example.com' },
      workspace: { id: workspaceId, name: 'Acme Workspace' },
      membership: { full_name: 'Owner Name', role: 'owner' },
      isPlatformAdmin: true,
      signOut,
    } as never)
    renderLayout()

    expect(screen.queryByTestId('platform-tenant-strip')).not.toBeInTheDocument()
  })

  it('shows Jonathan the workspace switcher in his own workspace without changing his feature role', () => {
    mockedUseAuth.mockReturnValue({
      user: { email: 'jonathan@getonapod.com' },
      workspace: { id: '00000000-0000-4000-8000-000000000000', name: 'Get On A Pod', is_default: true },
      membership: { full_name: 'Jonathan', role: 'owner' },
      isPlatformAdmin: true,
      signOut,
    } as never)

    renderLayout()

    expect(screen.getByText('Workspace switcher')).toBeInTheDocument()
    expect(screen.getByText('Workspace switcher').closest('header')).not.toBeNull()
    expect(screen.getAllByText('My Workspace').length).toBeGreaterThan(0)
    expect(screen.getByText('owner')).toBeInTheDocument()
    expect(screen.queryByText('platform owner')).not.toBeInTheDocument()
  })

  it('signs a workspace user out without exposing an admin destination', async () => {
    renderLayout()

    fireEvent.click(screen.getByRole('button', { name: /sign out/i }))
    await waitFor(() => expect(signOut).toHaveBeenCalledTimes(1))
  })

  // Plan pricing, credit grants and monthly allowances were reachable only
  // through a link inside the platform owner's own billing page, so the tools
  // for every other workspace sat behind one workspace's balance.
  it('puts billing administration one click from anywhere for a platform admin', async () => {
    mockedUseAuth.mockReturnValue({
      user: { id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', email: 'owner@example.com', user_metadata: {} },
      workspace: { id: workspaceId, name: 'Acme Workspace' },
      membership: { full_name: 'Owner Name', role: 'owner' },
      isPlatformAdmin: true,
      signOut,
    } as never)
    renderLayout()

    const link = await screen.findByRole('link', { name: 'Billing administration' })
    expect(link).toHaveAttribute('href', '/app/platform/billing')
  })

  it('offers no billing administration to a workspace member', async () => {
    renderLayout()

    expect(screen.queryByRole('link', { name: 'Billing administration' })).not.toBeInTheDocument()
  })

  // Reading the balance is a manager's business inside an agency: a member has
  // no billing page to be sent to, so there is nothing to ask the server for.
  it('asks for no balance at all on behalf of a workspace member', async () => {
    mockedUseAuth.mockReturnValue({
      user: { id: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc', email: 'member@example.com' },
      workspace: { id: workspaceId, name: 'Acme Workspace' },
      membership: { full_name: 'Agency Member', role: 'member' },
      isPlatformAdmin: false,
      signOut,
    } as never)
    mockedBillingOverview.mockResolvedValue({
      enforcement_enabled: true,
      monthly_credit_allowance: 100,
      balance: 850,
    } as never)

    renderLayout()

    await waitFor(() => expect(screen.getByText('Module content')).toBeInTheDocument())
    expect(mockedBillingOverview).not.toHaveBeenCalled()
    expect(screen.queryByRole('link', { name: /credits remaining/i })).not.toBeInTheDocument()
  })

  /*
   * A platform shell renders the chip for the platform admin, so the flag that
   * decides whether the request happens has to be the one that says so — not a
   * constant that happens to be true wherever platform surfaces are reachable.
   */
  it('asks for no balance on a platform shell rendered for someone who is not a platform admin', async () => {
    renderLayout({
      workspaceId: viewedWorkspaceId,
      workspaceName: 'Selected Workspace',
      logoUrl: null,
      baseHref: `/app/workspaces/${viewedWorkspaceId}`,
    })

    await waitFor(() => expect(screen.getByText('Module content')).toBeInTheDocument())
    expect(mockedBillingOverview).not.toHaveBeenCalled()
    expect(screen.queryByRole('link', { name: /credits remaining/i })).not.toBeInTheDocument()
  })

  // A balance is a number about nothing while nothing is being charged, on
  // either side of the shell.
  it('shows no chip in a tenant shell while enforcement is off', async () => {
    mockedBillingOverview.mockResolvedValue({
      enforcement_enabled: false,
      monthly_credit_allowance: 100,
      balance: 850,
    } as never)

    renderLayout()

    await waitFor(() => expect(mockedBillingOverview).toHaveBeenCalledWith(workspaceId))
    expect(screen.queryByRole('link', { name: /credits remaining/i })).not.toBeInTheDocument()
  })

  it('shows no chip in a platform shell while enforcement is off', async () => {
    mockedUseAuth.mockReturnValue({
      user: { email: 'platform@example.com' },
      workspace: { id: workspaceId, name: 'Acme Workspace' },
      membership: null,
      isPlatformAdmin: true,
      signOut,
    } as never)
    mockedBillingOverview.mockResolvedValue({
      enforcement_enabled: false,
      monthly_credit_allowance: 100,
      balance: 850,
    } as never)

    renderLayout({
      workspaceId: viewedWorkspaceId,
      workspaceName: 'Selected Workspace',
      logoUrl: null,
      baseHref: `/app/workspaces/${viewedWorkspaceId}`,
    })

    await waitFor(() => expect(mockedBillingOverview).toHaveBeenCalledWith(viewedWorkspaceId))
    expect(screen.queryByRole('link', { name: /credits remaining/i })).not.toBeInTheDocument()
  })

  /*
   * The split is deliberate and worth pinning. The chip is knowing; the banner
   * is a prompt to top up, and topping somebody else's workspace up happens on
   * the platform screen, so the banner stays out of a platform shell even when
   * the tenant is nearly out.
   */
  it('shows a nearly-empty tenant both the chip and the top-up banner', async () => {
    mockedBillingOverview.mockResolvedValue({
      enforcement_enabled: true,
      monthly_credit_allowance: 100,
      balance: 4,
    } as never)

    renderLayout()

    await screen.findByRole('link', { name: /4 credits remaining/i })
    expect(await screen.findByRole('link', { name: /top up/i })).toHaveAttribute(
      'href',
      '/app/settings/billing',
    )
    expect(screen.getByText(/4 credits left/i)).toBeInTheDocument()
  })

  it('gives a platform admin the number without the top-up banner', async () => {
    mockedUseAuth.mockReturnValue({
      user: { email: 'platform@example.com' },
      workspace: { id: workspaceId, name: 'Acme Workspace' },
      membership: null,
      isPlatformAdmin: true,
      signOut,
    } as never)
    mockedBillingOverview.mockResolvedValue({
      enforcement_enabled: true,
      monthly_credit_allowance: 100,
      balance: 4,
    } as never)

    renderLayout({
      workspaceId: viewedWorkspaceId,
      workspaceName: 'Selected Workspace',
      logoUrl: null,
      baseHref: `/app/workspaces/${viewedWorkspaceId}`,
    })

    // The number is theirs to know, and it reads as a problem.
    const chip = await screen.findByRole('link', { name: /4 credits remaining/i })
    expect(chip.className).toMatch(/destructive/)
    expect(screen.queryByRole('link', { name: /top up/i })).not.toBeInTheDocument()
    expect(screen.queryByText(/credits left/i)).not.toBeInTheDocument()
  })

  /*
   * A platform admin moves between tenants inside the same shell. The number in
   * the header has to move with them: one agency's credits shown under another
   * agency's name is worse than no number at all.
   */
  it('moves the balance with the workspace being viewed', async () => {
    mockedUseAuth.mockReturnValue({
      user: { email: 'platform@example.com' },
      workspace: { id: workspaceId, name: 'Acme Workspace' },
      membership: null,
      isPlatformAdmin: true,
      signOut,
    } as never)
    mockedBillingOverview.mockImplementation(((id: string) => Promise.resolve({
      enforcement_enabled: true,
      monthly_credit_allowance: 100,
      balance: id === viewedWorkspaceId ? 850 : 12,
    })) as never)

    const secondWorkspaceId = '33333333-3333-4333-8333-333333333333'
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    const shellFor = (id: string) => (
      <QueryClientProvider client={queryClient}>
        <MemoryRouter initialEntries={[`/app/workspaces/${id}/clients`]} future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
          <WorkspaceLayout
            platformWorkspace={{
              workspaceId: id,
              workspaceName: 'Selected Workspace',
              logoUrl: null,
              baseHref: `/app/workspaces/${id}`,
            }}
          >
            <div>Module content</div>
          </WorkspaceLayout>
        </MemoryRouter>
      </QueryClientProvider>
    )

    const { rerender } = render(shellFor(viewedWorkspaceId))
    await screen.findByRole('link', { name: /850 credits remaining/i })

    rerender(shellFor(secondWorkspaceId))
    await screen.findByRole('link', { name: /12 credits remaining/i })
    expect(screen.queryByText('850')).not.toBeInTheDocument()
    expect(mockedBillingOverview).toHaveBeenCalledWith(secondWorkspaceId)
    expect(mockedBillingOverview).not.toHaveBeenCalledWith(workspaceId)
  })
})
