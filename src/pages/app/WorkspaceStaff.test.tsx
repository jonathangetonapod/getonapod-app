import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import WorkspaceStaff from '@/pages/app/WorkspaceStaff'
import { useAuth } from '@/contexts/AuthContext'
import {
  createWorkspaceStaffTemporaryPassword,
  inviteWorkspaceStaff,
  listWorkspaceStaff,
  mutateWorkspaceStaff,
  retryWorkspaceStaffTemporaryPassword,
  removeWorkspaceLogo,
  updateWorkspaceLogo,
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
  createWorkspaceStaffTemporaryPassword: vi.fn(),
  inviteWorkspaceStaff: vi.fn(),
  listWorkspaceStaff: vi.fn(),
  mutateWorkspaceStaff: vi.fn(),
  retryWorkspaceStaffTemporaryPassword: vi.fn(),
  removeWorkspaceLogo: vi.fn(),
  updateWorkspaceLogo: vi.fn(),
  updateWorkspaceStaffRole: vi.fn(),
}))

const mockedUseAuth = vi.mocked(useAuth)
const mockedCreatePassword = vi.mocked(createWorkspaceStaffTemporaryPassword)
const mockedInvite = vi.mocked(inviteWorkspaceStaff)
const mockedList = vi.mocked(listWorkspaceStaff)
const mockedMutate = vi.mocked(mutateWorkspaceStaff)
const mockedRetryPassword = vi.mocked(retryWorkspaceStaffTemporaryPassword)
const mockedRemoveLogo = vi.mocked(removeWorkspaceLogo)
const mockedUpdateLogo = vi.mocked(updateWorkspaceLogo)
const mockedUpdateRole = vi.mocked(updateWorkspaceStaffRole)

const workspaceId = '11111111-1111-4111-8111-111111111111'
const otherWorkspaceId = '22222222-2222-4222-8222-222222222222'
const userId = '33333333-3333-4333-8333-333333333333'
const ownerId = '44444444-4444-4444-8444-444444444444'
const adminId = '55555555-5555-4555-8555-555555555555'
const invitedAt = '2026-07-22T00:00:00.000Z'
const temporaryPassword = `Tmp-Aa2-${'b'.repeat(20)}`

const owner: WorkspaceStaffMember = {
  id: ownerId,
  email: 'owner@example.com',
  full_name: 'Workspace Owner',
  role: 'owner',
  status: 'active',
  setup_method: 'admin_temporary_password',
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
  setup_method: 'email_invite',
  invited_at: invitedAt,
  invite_expires_at: null,
  accepted_at: '2026-07-22T00:20:00.000Z',
  suspended_at: null,
  pending_review: false,
  allowed_actions: ['update_role', 'transfer_owner', 'suspend', 'revoke'],
}

const ownerView: WorkspaceStaffView = {
  workspace: {
    id: workspaceId,
    name: 'Acme Workspace',
    status: 'active',
    logo_path: null,
    logo_updated_at: null,
  },
  capabilities: {
    read_only: false,
    invite_roles: ['admin', 'member'],
    can_generate_password: true,
    can_manage_branding: true,
    can_update_roles: true,
    can_transfer_owner: true,
  },
  members: [owner, admin],
}

const refreshAccount = vi.fn()
const refreshSession = vi.fn()
const signOut = vi.fn()

function renderPage(platformWorkspaceId?: string) {
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
          platformWorkspaceId
            ? `/admin/workspaces/${platformWorkspaceId}/settings`
            : '/app/settings',
        ]}
        future={{ v7_startTransition: true, v7_relativeSplatPath: true }}
      >
        <WorkspaceStaff platformWorkspaceId={platformWorkspaceId} />
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
    const passwordMember: WorkspaceStaffMember = {
      ...admin,
      setup_method: 'admin_temporary_password',
      status: 'invited',
      accepted_at: null,
      invite_expires_at: '2026-07-29T00:00:00.000Z',
      allowed_actions: [],
    }
    mockedCreatePassword.mockResolvedValue({
      member: passwordMember,
      email: passwordMember.email,
      temporary_password: temporaryPassword,
    })
    mockedRetryPassword.mockResolvedValue({
      member: passwordMember,
      email: passwordMember.email,
      temporary_password: temporaryPassword,
    })
    mockedUpdateLogo.mockResolvedValue({
      id: workspaceId,
      logo_path: `${workspaceId}/66666666-6666-4666-8666-666666666666.png`,
      logo_updated_at: '2026-07-22T01:00:00.000Z',
    })
    mockedRemoveLogo.mockResolvedValue({ id: workspaceId, logo_path: null, logo_updated_at: null })
    mockedMutate.mockResolvedValue({ ...admin, role: 'owner', allowed_actions: [] })
    mockedUpdateRole.mockResolvedValue({ ...admin, role: 'member' })
  })

  it('renders the owner roster and only server-authorized controls for the signed-in workspace', async () => {
    renderPage()

    expect(await screen.findByText('Agency Admin')).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Settings', level: 1 })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Workspace users', level: 2 })).toBeInTheDocument()
    expect(screen.getByText('Manage the people who can access your workspace.')).toBeInTheDocument()
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

  it('uploads a workspace logo and refreshes the signed-in workspace shell', async () => {
    renderPage()
    await screen.findByText('Agency Admin')
    const file = new File(
      [new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])],
      'agency.png',
      { type: 'image/png' },
    )

    fireEvent.change(screen.getByLabelText('Workspace logo file'), {
      target: { files: [file] },
    })

    await waitFor(() => expect(mockedUpdateLogo).toHaveBeenCalledWith(workspaceId, file, null))
    await waitFor(() => expect(refreshAccount).toHaveBeenCalledTimes(1))
    expect(toastSuccess).toHaveBeenCalledWith('Workspace logo updated.')
  })

  it('confirms and removes the current workspace logo', async () => {
    const logoPath = `${workspaceId}/66666666-6666-4666-8666-666666666666.png`
    mockedList.mockResolvedValue({
      ...ownerView,
      workspace: {
        ...ownerView.workspace,
        logo_path: logoPath,
        logo_updated_at: '2026-07-22T01:00:00.000Z',
      },
    })
    renderPage()
    await screen.findByText('Agency Admin')

    expect(screen.getByTestId('workspace-logo-settings')).toHaveClass('h-44', 'w-full', 'max-w-md')

    fireEvent.click(screen.getByRole('button', { name: 'Remove logo' }))
    const dialog = screen.getByRole('alertdialog', { name: 'Remove workspace logo?' })
    fireEvent.click(within(dialog).getByRole('button', { name: 'Remove logo' }))

    await waitFor(() => expect(mockedRemoveLogo).toHaveBeenCalledWith(workspaceId, logoPath))
    await waitFor(() => expect(refreshAccount).toHaveBeenCalledTimes(1))
    expect(toastSuccess).toHaveBeenCalledWith('Workspace logo removed.')
  })

  it('generates a one-time password and requires confirmation before closing it', async () => {
    const passwordMember: WorkspaceStaffMember = {
      ...admin,
      email: 'new@example.com',
      full_name: 'New Teammate',
      status: 'invited',
      setup_method: 'admin_temporary_password',
      accepted_at: null,
      invite_expires_at: '2026-07-29T00:00:00.000Z',
      allowed_actions: [],
    }
    mockedCreatePassword.mockResolvedValueOnce({
      member: passwordMember,
      email: passwordMember.email,
      temporary_password: temporaryPassword,
    })
    renderPage()
    await screen.findByText('Agency Admin')

    fireEvent.click(screen.getByRole('button', { name: /invite user/i }))
    const inviteDialog = screen.getByRole('dialog')
    fireEvent.change(within(inviteDialog).getByLabelText('Full name'), { target: { value: 'New Teammate' } })
    fireEvent.change(within(inviteDialog).getByLabelText('Email'), { target: { value: 'new@example.com' } })
    fireEvent.click(within(inviteDialog).getByLabelText('Sign-in setup'))
    fireEvent.click(await screen.findByRole('option', { name: 'Generate temporary password' }))
    fireEvent.click(within(inviteDialog).getByRole('button', { name: 'Generate password' }))

    await waitFor(() => expect(mockedCreatePassword).toHaveBeenCalledWith(workspaceId, {
      email: 'new@example.com',
      full_name: 'New Teammate',
      role: 'admin',
    }))
    expect(mockedInvite).not.toHaveBeenCalled()

    const credentialDialog = await screen.findByRole('dialog', { name: 'Save the temporary password' })
    expect(within(credentialDialog).getByLabelText('Temporary password')).toHaveValue(temporaryPassword)
    expect(within(credentialDialog).getByRole('button', { name: 'Done' })).toBeDisabled()
    fireEvent.click(within(credentialDialog).getByRole('button', { name: 'Close' }))
    expect(await within(credentialDialog).findByRole('alert')).toHaveTextContent(
      'Confirm that you saved the one-time password before closing.',
    )
    fireEvent.click(within(credentialDialog).getByLabelText('I saved this password in a secure place.'))
    expect(within(credentialDialog).getByRole('button', { name: 'Done' })).toBeEnabled()
    fireEvent.click(within(credentialDialog).getByRole('button', { name: 'Done' }))
    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Save the temporary password' })).not.toBeInTheDocument())
  })

  it('can safely retry password generation for a pending password account', async () => {
    const pendingPassword: WorkspaceStaffMember = {
      ...admin,
      id: '66666666-6666-4666-8666-666666666666',
      email: 'password@example.com',
      full_name: 'Password User',
      role: 'member',
      status: 'provisioning',
      setup_method: 'admin_temporary_password',
      accepted_at: null,
      invite_expires_at: null,
      allowed_actions: ['retry_password', 'revoke'],
    }
    mockedList.mockResolvedValueOnce({ ...ownerView, members: [owner, admin, pendingPassword] })
    mockedRetryPassword.mockResolvedValueOnce({
      member: {
        ...pendingPassword,
        status: 'invited',
        invite_expires_at: '2026-07-29T00:00:00.000Z',
        allowed_actions: [],
      },
      email: pendingPassword.email,
      temporary_password: temporaryPassword,
    })
    renderPage()

    expect(await screen.findByText('Password User')).toBeInTheDocument()
    expect(screen.getByText('Password setup')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Generate password' }))

    await waitFor(() => expect(mockedRetryPassword).toHaveBeenCalledWith(workspaceId, pendingPassword.id))
    expect(await screen.findByRole('dialog', { name: 'Save the temporary password' })).toBeInTheDocument()
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

  it('gives the platform owner native management controls in the selected workspace', async () => {
    mockedUseAuth.mockReturnValue({
      user: { id: userId, email: 'platform@example.com' },
      workspace: null,
      membership: null,
      isPlatformAdmin: true,
      refreshAccount,
      refreshSession,
      signOut,
    } as never)
    mockedList.mockResolvedValue(ownerView)

    renderPage(workspaceId)

    expect(await screen.findByText('Agency Admin')).toBeInTheDocument()
    expect(screen.getByText('Manage settings for Acme Workspace.')).toBeInTheDocument()
    expect(screen.getByText('Manage the people who can access this workspace.')).toBeInTheDocument()
    expect(screen.queryByText(/admin preview/i)).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: /invite user/i })).toBeEnabled()
    expect(screen.getByRole('button', { name: /make owner/i })).toBeEnabled()
    expect(screen.getByRole('button', { name: /^suspend$/i })).toBeEnabled()
    expect(screen.getByRole('button', { name: /sign out/i })).toBeEnabled()
    expect(screen.getByText('platform@example.com')).toBeInTheDocument()
    expect(screen.getByText('platform owner')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Settings' })).toHaveAttribute(
      'href',
      `/admin/workspaces/${workspaceId}/settings`,
    )

    fireEvent.click(screen.getByRole('button', { name: /invite user/i }))
    const inviteDialog = screen.getByRole('dialog')
    fireEvent.change(within(inviteDialog).getByLabelText('Full name'), { target: { value: 'Platform Invite' } })
    fireEvent.change(within(inviteDialog).getByLabelText('Email'), { target: { value: 'platform-invite@example.com' } })
    fireEvent.click(within(inviteDialog).getByRole('button', { name: 'Send invitation' }))
    await waitFor(() => expect(mockedInvite).toHaveBeenCalledWith(workspaceId, {
      email: 'platform-invite@example.com',
      full_name: 'Platform Invite',
      role: 'admin',
    }))

    fireEvent.click(screen.getByRole('button', { name: /make owner/i }))
    const dialog = screen.getByRole('alertdialog')
    expect(within(dialog).getByText(/current workspace owner becomes an admin/i)).toBeInTheDocument()
    fireEvent.click(within(dialog).getByRole('button', { name: 'Transfer ownership' }))

    await waitFor(() => expect(mockedMutate).toHaveBeenCalledWith(workspaceId, adminId, 'transfer_owner'))
    expect(refreshSession).not.toHaveBeenCalled()
    expect(refreshAccount).not.toHaveBeenCalled()
    expect(mockedList).toHaveBeenCalledWith(workspaceId)
  })

  it('fails closed when selected-workspace data names a different workspace', async () => {
    mockedList.mockResolvedValue({
      ...ownerView,
      workspace: {
        id: otherWorkspaceId,
        name: 'Other Workspace',
        status: 'active',
        logo_path: null,
        logo_updated_at: null,
      },
    })

    renderPage(workspaceId)

    expect(await screen.findByText('Workspace users unavailable')).toBeInTheDocument()
    expect(screen.getByText('The workspace staff response did not match the selected workspace.')).toBeInTheDocument()
    expect(mockedInvite).not.toHaveBeenCalled()
    expect(mockedMutate).not.toHaveBeenCalled()
  })

  it('identifies a stale read-only backend without blaming the platform-owner session', async () => {
    mockedUseAuth.mockReturnValue({
      user: { id: userId, email: 'platform@example.com' },
      workspace: null,
      membership: null,
      isPlatformAdmin: true,
      refreshAccount,
      refreshSession,
      signOut,
    } as never)
    mockedList.mockResolvedValue({
      ...ownerView,
      capabilities: {
        read_only: true,
        invite_roles: [],
        can_generate_password: false,
        can_manage_branding: false,
        can_update_roles: false,
        can_transfer_owner: false,
      },
      members: [
        { ...owner, allowed_actions: [] },
        { ...admin, allowed_actions: [] },
      ],
    })

    renderPage(workspaceId)

    expect(await screen.findByText('Workspace users unavailable')).toBeInTheDocument()
    expect(screen.getByText('Platform-owner workspace management is not active on the backend yet.')).toBeInTheDocument()
    expect(screen.queryByText(/did not match the signed-in account/i)).not.toBeInTheDocument()
  })

  it('does not call the service for an invalid selected workspace address', async () => {
    renderPage('not-a-workspace')

    expect(screen.getByText('The workspace address is invalid.')).toBeInTheDocument()
    expect(mockedList).not.toHaveBeenCalled()
  })
})
