import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useAuth } from '@/contexts/AuthContext'
import {
  WorkspaceLayout,
  type WorkspacePreviewConfig,
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
  'Workspace Users',
  'Onboarding',
  'Podcast Finder',
  'Prospect Dashboards',
  'Podcast Database',
  'Client Podcast System',
  'Clients',
  'Outreach Platform',
  'Guest Resources',
  'Unibox',
]

function renderLayout(preview?: WorkspacePreviewConfig) {
  render(
    <MemoryRouter initialEntries={[preview ? `${preview.baseHref}/clients` : '/app/clients']} future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
      <WorkspaceLayout preview={preview}><div>Module content</div></WorkspaceLayout>
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
      signOut,
    } as never)
  })

  it('matches the complete admin navigation order without exposing unsafe tenant routes', () => {
    renderLayout()

    const navigation = screen.getByRole('navigation', { name: 'Workspace navigation' })
    const labels = within(navigation).getAllByRole('listitem').map((item) => (
      item.querySelector('span')?.textContent
    ))
    expect(labels).toEqual(expectedNavigation)

    const links = within(navigation).getAllByRole('link')
    expect(links).toHaveLength(2)
    expect(within(navigation).getByRole('link', { name: 'Clients' })).toHaveAttribute('href', '/app/clients')
    expect(within(navigation).getByRole('link', { name: 'Guest Resources' })).toHaveAttribute('href', '/app/guest-resources')

    const disabledModules = within(navigation).getAllByRole('button')
    expect(disabledModules).toHaveLength(9)
    disabledModules.forEach((module) => expect(module).toBeDisabled())
    expect(screen.getAllByText('Acme Workspace')).toHaveLength(2)
    expect(screen.getByText('owner@example.com')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /sign out/i })).toBeEnabled()
  })

  it('keeps enabled navigation inside the selected read-only admin preview', () => {
    const preview: WorkspacePreviewConfig = {
      workspaceName: 'Preview Workspace',
      viewerEmail: 'preview@example.com',
      viewerName: 'Preview Owner',
      viewerRole: 'owner',
      baseHref: `/admin/workspaces/${workspaceId}`,
      exitHref: '/admin/users',
    }
    renderLayout(preview)

    const navigation = screen.getByRole('navigation', { name: 'Workspace navigation' })
    expect(within(navigation).getByRole('link', { name: 'Clients' })).toHaveAttribute(
      'href',
      `/admin/workspaces/${workspaceId}/clients`,
    )
    expect(within(navigation).getByRole('link', { name: 'Guest Resources' })).toHaveAttribute(
      'href',
      `/admin/workspaces/${workspaceId}/guest-resources`,
    )
    expect(screen.getByText('Admin preview · Read only')).toBeInTheDocument()
    expect(screen.getByText('Workspace switcher')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /exit preview/i })).toHaveAttribute('href', '/admin/users')
    expect(screen.getByRole('button', { name: /sign out/i })).toBeDisabled()
  })

  it('signs a workspace user out without exposing an admin destination', async () => {
    renderLayout()

    fireEvent.click(screen.getByRole('button', { name: /sign out/i }))
    await waitFor(() => expect(signOut).toHaveBeenCalledTimes(1))
  })
})
