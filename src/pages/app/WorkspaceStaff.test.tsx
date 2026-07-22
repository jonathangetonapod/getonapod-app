import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import WorkspaceStaff from '@/pages/app/WorkspaceStaff'
import { useAuth } from '@/contexts/AuthContext'
import {
  inviteWorkspaceStaff,
  listWorkspaceStaff,
  mutateWorkspaceStaff,
  updateWorkspaceStaffRole,
  type WorkspaceStaffMember,
  type WorkspaceStaffView,
} from '@/services/workspaceStaff'

const { toastError, toastSuccess } = vi.hoisted(() => ({
  toastError: vi.fn(),
  toastSuccess: vi.fn(),
}))

vi.mock('sonner', () => ({ toast: { error: toastError, success: toastSuccess } }))
vi.mock('@/contexts/AuthContext', () => ({ useAuth: vi.fn() }))
vi.mock('@/components/admin/WorkspaceSwitcher', () => ({
  WorkspaceSwitcher: () => <div>Workspace switcher</div>,
}))
vi.mock('@/services/workspaceStaff', () => ({
  inviteWorkspaceStaff: vi.fn(),
  listWorkspaceStaff: vi.fn(),
  mutateWorkspaceStaff: vi.fn(),
  updateWorkspaceStaffRole: vi.fn(),
}))

const mockedUseAuth = vi.mocked(useAuth)
const mockedInvite = vi.mocked(inviteWorkspaceStaff)
const mockedList = vi.mocked(listWorkspaceStaff)
const mockedMutate = vi.mocked(mutateWorkspaceStaff)
const mockedUpdateRole = vi.mocked(updateWorkspaceStaffRole)

const workspaceId = '11111111-1111-4111-8111-111111111111'
const otherWorkspaceId = '22222222-2222-4222-8222-222222222222'
const userId = '33333333-3333-4333-8333-333333333333'
const ownerId = '44444444-4444-4444-8444-444444444444'
const adminId = '55555555-5555-4555-8555-555555555555'
const invitedAt = '2026-07-22T00:00:00.000Z'

const owner: WorkspaceStaffMember = {
  id: ownerId,
  email: 'owner@example.com',
  full_name: 'Workspace Owner',
  role: 'owner',
  status: 'active',
  invited_at: invitedAt,
  invite_expires_at: null,
  accepted_at: '2026-07-22T00:10:00.000Z',
  suspended_at: null,
  pending_review: false,
  allowed_actions: [],
}

const admin: WorkspaceStaffMember = {
  id: adminId,
  email: 'admin@example.com',
  full_name: 'Agency Admin',
  role: 'admin',
  status: 'active',
  invited_at: invitedAt,
  invite_expires_at: null,
  accepted_at: '2026-07-22T00:20:00.000Z',
  suspended_at: null,
  pending_review: false,
  allowed_actions: ['update_role', 'transfer_owner', 'suspend', 'revoke'],
}

const ownerView: WorkspaceStaffView = {
  workspace: { id: workspaceId, name: 'Acme Workspace', status: 'active' },
  capabilities: {
    read_only: false,
    invite_roles: ['admin', 'member'],
    can_update_roles: true,
    can_transfer_owner: true,
  },
  members: [owner, admin],
}

const refreshAccount = vi.fn()
const refreshSession = vi.fn()
const signOut = vi.fn()

function renderPage(adminPreviewWorkspaceId?: string) {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  })
  render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter
        initialEntries={[
          adminPreviewWorkspaceId
            ? `/admin/workspaces/${adminPreviewWorkspaceId}/workspace-users`
            : '/app/workspace-users',
        ]}
        future={{ v7_startTransition: true, v7_relativeSplatPath: true }}
      >
        <WorkspaceStaff adminPreviewWorkspaceId={adminPreviewWorkspaceId} />
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

describe('WorkspaceStaff', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    refreshAccount.mockResolvedValue(true)
    refreshSession.mockResolvedValue(true)
    signOut.mockResolvedValue(undefined)
    mockedUseAuth.mockReturnValue({
      user: { id: userId, email: 'owner@example.com', user_metadata: { full_name: 'Workspace Owner' } },
      workspace: {
        id: workspaceId,
        name: 'Acme Workspace',
        slug: 'acme-workspace',
        status: 'active',
        is_default: false,
      },
      membership: { id: ownerId, full_name: 'Workspace Owner', role: 'owner' },
      refreshAccount,
      refreshSession,
      signOut,
    } as never)
    mockedList.mockResolvedValue(ownerView)
    mockedInvite.mockResolvedValue({
      ...admin,
      role: 'member',
      status: 'invited',
      accepted_at: null,
      invite_expires_at: '2026-07-29T00:00:00.000Z',
      allowed_actions: ['revoke'],
    })
    mockedMutate.mockResolvedValue({ ...admin, role: 'owner', allowed_actions: [] })
    mockedUpdateRole.mockResolvedValue({ ...admin, role: 'member' })
  })

  it('renders the owner roster and only server-authorized controls for the signed-in workspace', async () => {
    renderPage()

    expect(await screen.findByText('Agency Admin')).toBeInTheDocument()
    expect(screen.getByText('Manage the people who can access Acme Workspace.')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /invite user/i })).toBeEnabled()
    expect(screen.getByRole('button', { name: /make owner/i })).toBeEnabled()
    expect(screen.getByRole('button', { name: /suspend/i })).toBeEnabled()
    expect(screen.getByRole('button', { name: /remove/i })).toBeEnabled()
    expect(screen.getByRole('combobox', { name: 'Change role for admin@example.com' })).toBeEnabled()
    expect(screen.getByText('Protected owner')).toBeInTheDocument()
    expect(mockedList).toHaveBeenCalledWith(workspaceId)
  })

  it('invites through the authenticated workspace and its allowed default role', async () => {
    renderPage()
    await screen.findByText('Agency Admin')

    fireEvent.click(screen.getByRole('button', { name: /invite user/i }))
    const dialog = screen.getByRole('dialog')
    fireEvent.change(within(dialog).getByLabelText('Full name'), { target: { value: 'New Teammate' } })
    fireEvent.change(within(dialog).getByLabelText('Email'), { target: { value: 'new@example.com' } })
    fireEvent.click(within(dialog).getByRole('button', { name: 'Send invitation' }))

    await waitFor(() => expect(mockedInvite).toHaveBeenCalledWith(workspaceId, {
      email: 'new@example.com',
      full_name: 'New Teammate',
      role: 'admin',
    }))
    await waitFor(() => expect(toastSuccess).toHaveBeenCalledWith('Workspace invitation sent.'))
  })

  it('confirms ownership transfer and refreshes the demoted owner session', async () => {
    renderPage()
    await screen.findByText('Agency Admin')

    fireEvent.click(screen.getByRole('button', { name: /make owner/i }))
    const dialog = screen.getByRole('alertdialog')
    expect(within(dialog).getByText('Transfer ownership to Agency Admin?')).toBeInTheDocument()
    expect(within(dialog).getByText(/Your role changes to admin/)).toBeInTheDocument()
    fireEvent.click(within(dialog).getByRole('button', { name: 'Transfer ownership' }))

    await waitFor(() => expect(mockedMutate).toHaveBeenCalledWith(workspaceId, adminId, 'transfer_owner'))
    await waitFor(() => expect(refreshSession).toHaveBeenCalledTimes(1))
    expect(refreshAccount).toHaveBeenCalledTimes(1)
    expect(signOut).not.toHaveBeenCalled()
    expect(toastSuccess).toHaveBeenCalledWith('Workspace ownership transferred.')
  })

  it('renders platform preview from the selected workspace with no mutation path', async () => {
    const previewView: WorkspaceStaffView = {
      ...ownerView,
      capabilities: {
        read_only: true,
        invite_roles: [],
        can_update_roles: false,
        can_transfer_owner: false,
      },
      members: [
        { ...owner, allowed_actions: [] },
        { ...admin, allowed_actions: [] },
      ],
    }
    mockedUseAuth.mockReturnValue({
      user: { id: userId, email: 'platform@example.com' },
      workspace: null,
      membership: null,
      isPlatformAdmin: true,
      refreshAccount,
      refreshSession,
      signOut,
    } as never)
    mockedList.mockResolvedValue(previewView)

    renderPage(workspaceId)

    expect(await screen.findByText('Admin preview · Read only')).toBeInTheDocument()
    expect(screen.getByText('Read-only preview: staff controls cannot make changes.')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /invite user/i })).toBeDisabled()
    expect(screen.getAllByText('Read only')).toHaveLength(2)
    expect(screen.queryByRole('button', { name: /make owner/i })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /^suspend$/i })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: /sign out/i })).toBeDisabled()
    expect(screen.getByRole('link', { name: 'Workspace Users' })).toHaveAttribute(
      'href',
      `/admin/workspaces/${workspaceId}/workspace-users`,
    )
    expect(mockedList).toHaveBeenCalledWith(workspaceId)
    expect(mockedInvite).not.toHaveBeenCalled()
    expect(mockedMutate).not.toHaveBeenCalled()
    expect(mockedUpdateRole).not.toHaveBeenCalled()
  })

  it('fails closed when preview data does not declare the selected read-only workspace', async () => {
    mockedList.mockResolvedValue({
      ...ownerView,
      workspace: { id: otherWorkspaceId, name: 'Other Workspace', status: 'active' },
    })

    renderPage(workspaceId)

    expect(await screen.findByText('Workspace users unavailable')).toBeInTheDocument()
    expect(screen.getByText('The workspace staff response did not match the signed-in account.')).toBeInTheDocument()
    expect(mockedInvite).not.toHaveBeenCalled()
    expect(mockedMutate).not.toHaveBeenCalled()
  })

  it('does not call the service for an invalid preview workspace address', async () => {
    renderPage('not-a-workspace')

    expect(screen.getByText('The workspace address is invalid.')).toBeInTheDocument()
    expect(mockedList).not.toHaveBeenCalled()
  })
})
