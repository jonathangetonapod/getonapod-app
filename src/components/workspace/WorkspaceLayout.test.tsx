import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useAuth } from '@/contexts/AuthContext'
import {
  WorkspaceLayout,
  type PlatformWorkspaceConfig,
} from '@/components/workspace/WorkspaceLayout'

vi.mock('@/contexts/AuthContext', () => ({ useAuth: vi.fn() }))
vi.mock('@/components/admin/WorkspaceSwitcher', () => ({
  WorkspaceSwitcher: () => <div>Workspace switcher</div>,
}))

const mockedUseAuth = vi.mocked(useAuth)
const signOut = vi.fn()
const workspaceId = '11111111-1111-4111-8111-111111111111'
const expectedNavigation = [
  'Overview',
  'Onboarding',
  'Podcast Finder',
  'Prospect Dashboards',
  'Podcast Database',
  'Client Podcast System',
  'Clients',
  'Outreach Platform',
  'Guest Resources',
  'Unibox',
  'Settings',
]

function renderLayout(platformWorkspace?: PlatformWorkspaceConfig) {
  render(
    <MemoryRouter initialEntries={[platformWorkspace ? `${platformWorkspace.baseHref}/clients` : '/app/clients']} future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
      <WorkspaceLayout platformWorkspace={platformWorkspace}><div>Module content</div></WorkspaceLayout>
    </MemoryRouter>,
  )
}

describe('WorkspaceLayout', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    signOut.mockResolvedValue(undefined)
    mockedUseAuth.mockReturnValue({
      user: {
        email: 'owner@example.com',
        user_metadata: { full_name: 'Owner Name' },
      },
      workspace: { name: 'Acme Workspace' },
      membership: { full_name: 'Owner Name', role: 'owner' },
      isPlatformAdmin: false,
      signOut,
    } as never)
  })

  it('matches the complete navigation order and enables settings for an owner', () => {
    renderLayout()

    const navigation = screen.getByRole('navigation', { name: 'Workspace navigation' })
    const labels = within(navigation).getAllByRole('listitem').map((item) => (
      item.querySelector('span')?.textContent
    ))
    expect(labels).toEqual(expectedNavigation)

    const links = within(navigation).getAllByRole('link')
    expect(links).toHaveLength(6)
    expect(within(navigation).getByRole('link', { name: 'Settings' })).toHaveAttribute(
      'href',
      '/app/settings',
    )
    expect(within(navigation).getByRole('link', { name: 'Clients' })).toHaveAttribute('href', '/app/clients')
    expect(within(navigation).getByRole('link', { name: 'Onboarding' })).toHaveAttribute('href', '/app/onboarding')
    expect(within(navigation).getByRole('link', { name: 'Overview' })).toHaveAttribute('href', '/app/overview')
    expect(within(navigation).getByRole('link', { name: 'Podcast Finder' })).toHaveAttribute('href', '/app/podcast-finder')
    expect(within(navigation).getByRole('link', { name: 'Guest Resources' })).toHaveAttribute('href', '/app/guest-resources')

    const disabledModules = within(navigation).getAllByRole('button')
    expect(disabledModules).toHaveLength(5)
    disabledModules.forEach((module) => expect(module).toBeDisabled())
    expect(screen.getAllByText('Acme Workspace')).toHaveLength(3)
    expect(screen.getByText('owner@example.com')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /sign out/i })).toBeEnabled()
  })

  it('enables settings for an admin and keeps it unavailable to a member', () => {
    mockedUseAuth.mockReturnValue({
      user: { email: 'admin@example.com' },
      workspace: { name: 'Acme Workspace' },
      membership: { full_name: 'Agency Admin', role: 'admin' },
      isPlatformAdmin: false,
      signOut,
    } as never)
    const { unmount } = render(
      <MemoryRouter initialEntries={['/app/clients']} future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
        <WorkspaceLayout><div>Module content</div></WorkspaceLayout>
      </MemoryRouter>,
    )
    expect(screen.getByRole('link', { name: 'Settings' })).toHaveAttribute('href', '/app/settings')

    unmount()
    mockedUseAuth.mockReturnValue({
      user: { email: 'member@example.com' },
      workspace: { name: 'Acme Workspace' },
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
  })

  it('renders a selected workspace as a native platform-owner context', () => {
    mockedUseAuth.mockReturnValue({
      user: { email: 'owner@example.com' },
      workspace: { name: 'Acme Workspace' },
      membership: { full_name: 'Owner Name', role: 'owner' },
      isPlatformAdmin: true,
      signOut,
    } as never)
    const platformWorkspace: PlatformWorkspaceConfig = {
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
    expect(within(navigation).getByRole('link', { name: 'Onboarding' })).toHaveAttribute(
      'href',
      `/app/workspaces/${workspaceId}/onboarding`,
    )
    expect(within(navigation).getByRole('link', { name: 'Guest Resources' })).toHaveAttribute(
      'href',
      `/app/workspaces/${workspaceId}/guest-resources`,
    )
    expect(screen.queryByText(/admin preview/i)).not.toBeInTheDocument()
    expect(screen.getByText('owner@example.com')).toBeInTheDocument()
    expect(screen.getByText('platform owner')).toBeInTheDocument()
    expect(screen.getByText('Workspace switcher')).toBeInTheDocument()
    expect(screen.getByText('Workspace switcher').closest('header')).not.toBeNull()
    expect(screen.getByRole('link', { name: /manage workspaces/i })).toHaveAttribute('href', '/app/settings')
    expect(screen.getByRole('button', { name: /sign out/i })).toBeEnabled()
    expect(screen.getByTestId('workspace-logo-sidebar')).toHaveClass('h-24', 'w-full', 'bg-gradient-to-br')
    expect(screen.getByTestId('workspace-logo-sidebar')).toHaveAttribute('data-logo-state', 'uploaded')
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
})
