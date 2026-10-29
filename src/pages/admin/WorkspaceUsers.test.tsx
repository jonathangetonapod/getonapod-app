import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { MemoryRouter, useLocation } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import WorkspaceUsers from '@/pages/admin/WorkspaceUsers'
import { formatDate } from '@/lib/dates'
import { listJoinRequests } from '@/services/accessRequests'
import { listDeletedWorkspaces } from '@/services/adminWorkspaces'
import { deleteWorkspace } from '@/services/workspaceDeletion'
import { listWorkspaceDomains } from '@/services/workspaceDomains'
import { resetWorkspaceStaffTemporaryPassword } from '@/services/workspaceStaff'
import {
  createManualWorkspaceAccount,
  inviteWorkspaceUser,
  listWorkspaceUsers,
  revokeManualWorkspaceAccount,
} from '@/services/workspaceUsers'

vi.mock('@/components/workspace/WorkspaceLayout', () => ({
  WorkspaceLayout: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}))
vi.mock('@/components/workspace/SetupChecklist', () => ({
  SetupChecklist: ({ workspaceId, baseHref, review }: { workspaceId: string; baseHref: string; review: boolean }) => (
    <div data-testid="agency-setup-review" data-workspace={workspaceId} data-base={baseHref} data-review={String(review)} />
  ),
}))
vi.mock('@/services/workspaceUsers', () => ({
  createManualWorkspaceAccount: vi.fn(),
  inviteWorkspaceUser: vi.fn(),
  listWorkspaceUsers: vi.fn(),
  revokeManualWorkspaceAccount: vi.fn(),
  retryManualWorkspaceAccount: vi.fn(),
  rotateManualWorkspacePassword: vi.fn(),
  updateWorkspaceUserStatus: vi.fn(),
}))
vi.mock('@/services/adminWorkspaces', () => ({
  listAdminWorkspaces: vi.fn().mockResolvedValue([
    { id: '11111111-1111-4111-8111-111111111111', name: 'Acme Agency' },
  ]),
  // The recovery card lives on this page now. Nothing closed by default: that
  // is the normal state, and these tests are about the owner list.
  listDeletedWorkspaces: vi.fn().mockResolvedValue([]),
}))
vi.mock('@/services/workspaceDeletion', () => ({ restoreWorkspace: vi.fn(), deleteWorkspace: vi.fn() }))
vi.mock('@/services/accessRequests', () => ({
  listJoinRequests: vi.fn().mockResolvedValue([]),
  setJoinRequestStatus: vi.fn(),
}))
vi.mock('@/services/workspaceDomains', () => ({
  listWorkspaceDomains: vi.fn().mockResolvedValue([]),
  addWorkspaceDomain: vi.fn(),
  refreshWorkspaceDomain: vi.fn(),
  setPrimaryWorkspaceDomain: vi.fn(),
  removeWorkspaceDomain: vi.fn(),
}))
vi.mock('@/services/workspaceStaff', () => ({
  resetWorkspaceStaffTemporaryPassword: vi.fn(),
}))

const mockedCreate = vi.mocked(createManualWorkspaceAccount)
const mockedList = vi.mocked(listWorkspaceUsers)
const mockedRevoke = vi.mocked(revokeManualWorkspaceAccount)
const mockedResetOwnerPassword = vi.mocked(resetWorkspaceStaffTemporaryPassword)
const mockedInvite = vi.mocked(inviteWorkspaceUser)
const mockedDelete = vi.mocked(deleteWorkspace)

const Location = () => {
  const location = useLocation()
  return <div data-testid="location">{location.pathname}{location.search}</div>
}

const manualUser = {
  id: '11111111-1111-4111-8111-111111111111',
  workspace_id: '22222222-2222-4222-8222-222222222222',
  user_id: '33333333-3333-4333-8333-333333333333',
  email: 'owner@example.com',
  full_name: 'Owner Name',
  role: 'owner' as const,
  status: 'invited' as const,
  invited_at: '2026-07-21T00:00:00Z',
  invite_expires_at: '2026-07-28T00:00:00Z',
  accepted_at: null,
  provisioning_method: 'admin_temporary_password' as const,
  password_change_required: true,
  workspace_access_not_before_epoch: 0,
  auth_reconciliation_pending: false,
  auth_reconciliation_review_after: null,
  has_newer_membership: false,
  invite_cleanup_blocked: false,
  invite_reconciliation_pending: false,
  invite_reconciliation_claim_kind: null,
  invite_reconciliation_review_after: null,
  credential_reconciliation_pending: false,
  credential_reconciliation_claim_kind: null,
  credential_reconciliation_review_after: null,
  workspace: { id: '22222222-2222-4222-8222-222222222222', name: 'Acme Workspace' },
}

function renderPage(path = '/app/manage-workspaces') {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={[path]} future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
        <WorkspaceUsers />
        <Location />
      </MemoryRouter>
    </QueryClientProvider>,
  )
  return queryClient
}

async function openMenu(workspaceName: string) {
  const trigger = await screen.findByRole('button', { name: `More actions for ${workspaceName}` })
  trigger.focus()
  fireEvent.keyDown(trigger, { key: 'Enter', code: 'Enter' })
}

const startTemporaryPasswordFlow = () => {
  fireEvent.click(screen.getByRole('button', { name: 'New workspace' }))
  fireEvent.click(screen.getByRole('radio', { name: 'Generate a temporary password' }))
}

describe('Agencies page', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockedList.mockResolvedValue([])
    mockedRevoke.mockResolvedValue()
    mockedInvite.mockResolvedValue({})
    mockedDelete.mockResolvedValue({})
    vi.mocked(listJoinRequests).mockResolvedValue([])
    vi.mocked(listWorkspaceDomains).mockResolvedValue([])
    vi.mocked(listDeletedWorkspaces).mockResolvedValue([])
    mockedCreate.mockResolvedValue({
      membership: {
        id: '11111111-1111-4111-8111-111111111111',
        workspace_id: '22222222-2222-4222-8222-222222222222',
        status: 'invited',
        provisioning_method: 'admin_temporary_password',
        password_change_required: true,
        invite_expires_at: '2026-07-28T00:00:00Z',
      },
      workspace: { id: '22222222-2222-4222-8222-222222222222', name: 'Acme Workspace' },
      email: 'owner@example.com',
      temporary_password: 'Tmp-Abcd2345_Abcd2345_Abcd',
    })
  })

  it('is titled Agencies and has exactly one header action', async () => {
    renderPage()
    expect(screen.getByRole('heading', { level: 1, name: 'Agencies' })).toBeInTheDocument()
    expect(screen.getByText('Every agency on the platform, from first request to close.')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'New workspace' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /temporary password|invite an owner/i })).toBeNull()
    expect(screen.queryByRole('heading', { name: 'Workspaces' })).toBeNull()
    await screen.findByText('No workspaces yet')
  })

  it('opens setup for the selected active agency only when requested', async () => {
    mockedList.mockResolvedValue([{ ...manualUser, status: 'active', password_change_required: false }])
    renderPage()
    const open = await screen.findByRole('button', { name: 'View setup for Acme Workspace' })
    expect(screen.getByRole('columnheader', { name: 'Access' })).toBeInTheDocument()
    expect(screen.getByRole('columnheader', { name: 'Onboarding' })).toBeInTheDocument()
    expect(screen.queryByTestId('agency-setup-review')).not.toBeInTheDocument()
    fireEvent.click(open)
    const review = await screen.findByTestId('agency-setup-review')
    expect(review).toHaveAttribute('data-workspace', manualUser.workspace_id)
    expect(review).toHaveAttribute('data-base', `/app/workspaces/${manualUser.workspace_id}`)
    expect(review).toHaveAttribute('data-review', 'true')
    expect(screen.getByRole('dialog', { name: 'Acme Workspace setup' })).toBeInTheDocument()
  })

  it('keeps pending access separate from setup without adding a resend action', async () => {
    mockedList.mockResolvedValue([{ ...manualUser, provisioning_method: 'email_invite' }])
    renderPage()
    expect(await screen.findByText('Waiting for owner sign-in')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /View setup for/ })).not.toBeInTheDocument()
    await openMenu('Acme Workspace')
    expect(screen.queryByRole('menuitem', { name: /resend/i })).not.toBeInTheDocument()
  })

  it('counts each tab, marks waiting requests, and lands on the tab in the URL', async () => {
    mockedList.mockResolvedValue([{ ...manualUser, status: 'active', password_change_required: false }])
    vi.mocked(listJoinRequests).mockResolvedValue([
      { id: 'r1', email: 'dana@example.com', full_name: 'Dana Reyes', company: null, website: null, audience: 'agency', clients_now: null, notes: null, status: 'new', handled_at: null, handled_note: null, created_at: '2026-08-01T00:00:00Z' },
      { id: 'r2', email: 'burst-2@getonapod.com', full_name: 'Rate limit check 2', company: null, website: null, audience: 'other', clients_now: null, notes: null, status: 'new', handled_at: null, handled_note: null, created_at: '2026-08-01T00:00:00Z' },
      { id: 'r3', email: 'no@example.com', full_name: 'Turned Down', company: null, website: null, audience: 'other', clients_now: null, notes: null, status: 'declined', handled_at: null, handled_note: null, created_at: '2026-08-01T00:00:00Z' },
    ])
    renderPage('/app/manage-workspaces?tab=domains')

    expect(await screen.findByRole('tab', { name: /Workspaces\s*\(1\)/ })).toBeInTheDocument()
    expect(await screen.findByRole('tab', { name: /Requests\s*\(1\)\s*,\s*1 waiting/ })).toBeInTheDocument()
    expect(screen.getByRole('tab', { name: /^Domains/ })).toHaveAttribute('aria-selected', 'true')
    expect(screen.getByRole('tab', { name: /^Closed/ })).toHaveAttribute('aria-selected', 'false')
  })

  it('emails an invitation from the New workspace dialog by default', async () => {
    renderPage()
    fireEvent.click(screen.getByRole('button', { name: 'New workspace' }))
    expect(screen.getByRole('radio', { name: 'Email them an invitation' })).toBeChecked()
    expect(screen.getByText(/The link expires in 24 hours/)).toBeInTheDocument()
    fireEvent.change(screen.getByLabelText('Email'), { target: { value: 'new@example.com' } })
    fireEvent.change(screen.getByLabelText('Workspace name'), { target: { value: 'New Agency' } })
    fireEvent.click(screen.getByRole('button', { name: 'Send invitation' }))

    await waitFor(() => expect(mockedInvite).toHaveBeenCalledWith({
      email: 'new@example.com',
      full_name: undefined,
      workspace_name: 'New Agency',
    }))
    expect(mockedCreate).not.toHaveBeenCalled()
  })

  it('keeps the one-time password in memory and requires save confirmation', async () => {
    const storageSpy = vi.spyOn(Storage.prototype, 'setItem')
    const queryClient = renderPage()
    const invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries')
    startTemporaryPasswordFlow()
    fireEvent.change(screen.getByLabelText('Email'), { target: { value: 'owner@example.com' } })
    fireEvent.change(screen.getByLabelText('Full name'), { target: { value: 'Owner Name' } })
    fireEvent.change(screen.getByLabelText('Workspace name'), { target: { value: 'Acme Workspace' } })
    fireEvent.click(screen.getByRole('button', { name: 'Create and show password' }))

    const password = await screen.findByLabelText('Temporary password') as HTMLInputElement
    expect(password.type).toBe('password')
    expect(password.value).toBe('Tmp-Abcd2345_Abcd2345_Abcd')
    expect(storageSpy).not.toHaveBeenCalled()
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['platform'] })
    expect(screen.getByRole('button', { name: 'Done' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Open workspace' })).toBeDisabled()

    // One paste for the owner being set up: where, who, the password, and
    // that it is a one-off.
    const writeText = vi.fn().mockResolvedValue(undefined)
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText } })
    fireEvent.click(screen.getByRole('button', { name: 'Copy sign-in instructions' }))
    await waitFor(() => expect(writeText).toHaveBeenCalledWith(
      `Sign in at ${window.location.origin}/login with owner@example.com and this temporary password: Tmp-Abcd2345_Abcd2345_Abcd\n`
      + `You will be asked to choose your own password straight away. This temporary one stops working on ${formatDate('2026-07-28T00:00:00Z')}.`,
    ))
    expect(await screen.findByRole('button', { name: 'Sign-in instructions copied' })).toBeInTheDocument()

    fireEvent.click(screen.getByLabelText('I saved this password in a secure place.'))
    expect(screen.getByRole('button', { name: 'Done' })).toBeEnabled()
    fireEvent.click(screen.getByRole('button', { name: 'Open workspace' }))
    await waitFor(() => expect(screen.queryByText('Save the temporary password')).not.toBeInTheDocument())
    expect(screen.getByTestId('location')).toHaveTextContent(
      '/app/workspaces/22222222-2222-4222-8222-222222222222/clients',
    )
  })

  it('surfaces credential reconciliation and blocks conflicting actions', async () => {
    mockedList.mockResolvedValue([{
      ...manualUser,
      credential_reconciliation_pending: true,
      credential_reconciliation_claim_kind: 'temporary_password_rotation',
      credential_reconciliation_review_after: '2099-07-21T00:15:00Z',
    }])

    renderPage()

    expect(await screen.findByText(/credential reconciliation is pending until/i)).toBeInTheDocument()
    await openMenu('Acme Workspace')
    expect(await screen.findByRole('menuitem', { name: 'Issue temporary password' })).toHaveAttribute('aria-disabled', 'true')
    expect(screen.getByRole('menuitem', { name: 'Cancel invitation' })).toHaveAttribute('aria-disabled', 'true')
  })

  it('resets an active workspace owner password from the row menu', async () => {
    const activeOwner = {
      ...manualUser,
      status: 'active' as const,
      provisioning_method: 'email_invite' as const,
      password_change_required: false,
      invite_expires_at: null,
      accepted_at: '2026-07-22T00:00:00Z',
    }
    mockedList.mockResolvedValue([activeOwner])
    mockedResetOwnerPassword.mockResolvedValue({
      member: {
        id: activeOwner.id,
        email: activeOwner.email,
        full_name: activeOwner.full_name,
        role: 'owner',
        status: 'invited',
        setup_method: 'admin_temporary_password',
        invited_at: '2026-07-23T00:00:00Z',
        invite_expires_at: '2026-07-24T00:00:00Z',
        accepted_at: null,
        suspended_at: null,
        pending_review: false,
        allowed_actions: ['reset_password'],
      },
      email: activeOwner.email,
      temporary_password: 'Tmp-Reset2345_Reset2345_Reset',
    })

    renderPage()

    expect(await screen.findByRole('link', { name: 'Open workspace' })).toHaveAttribute(
      'href',
      '/app/workspaces/22222222-2222-4222-8222-222222222222/clients',
    )
    await openMenu('Acme Workspace')
    expect(await screen.findByRole('menuitem', { name: 'Manage users' })).toHaveAttribute(
      'href',
      '/app/workspaces/22222222-2222-4222-8222-222222222222/settings',
    )
    // The order the brief sets: team, sign-in, suspend, then the red step.
    expect(screen.getAllByRole('menuitem').map((item) => item.textContent)).toEqual([
      'Manage users', 'Reset password', 'Suspend', 'Close workspace',
    ])
    fireEvent.click(screen.getByRole('menuitem', { name: 'Reset password' }))
    const confirmation = await screen.findByRole('dialog')
    expect(within(confirmation).getByText('Reset the owner password?')).toBeInTheDocument()
    fireEvent.click(within(confirmation).getByRole('button', { name: 'Reset password' }))

    await waitFor(() => expect(mockedResetOwnerPassword).toHaveBeenCalledWith(
      activeOwner.workspace_id,
      activeOwner.id,
    ))
    const password = await screen.findByLabelText('Temporary password') as HTMLInputElement
    expect(password.type).toBe('password')
    expect(password.value).toBe('Tmp-Reset2345_Reset2345_Reset')
    expect(screen.getByText(/cannot access workspace data until this password is replaced at first sign-in/i)).toBeInTheDocument()
  })

  it('refreshes platform workspace state after a partial manual-create failure', async () => {
    mockedCreate.mockRejectedValueOnce(new Error('Credential reconciliation is pending.'))
    const queryClient = renderPage()
    const invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries')

    startTemporaryPasswordFlow()
    fireEvent.change(screen.getByLabelText('Email'), { target: { value: 'owner@example.com' } })
    fireEvent.click(screen.getByRole('button', { name: 'Create and show password' }))

    expect(await screen.findByText('Credential reconciliation is pending.')).toBeInTheDocument()
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['platform'] })
  })

  it('asks before cancelling an invitation, and says the replacement-password rule only in its own dialog', async () => {
    mockedList
      .mockResolvedValueOnce([manualUser])
      .mockResolvedValue([])
    renderPage()

    await screen.findByText('Acme Workspace')
    expect(screen.queryByText(/invalidates the previous temporary password/i)).toBeNull()
    await openMenu('Acme Workspace')
    fireEvent.click(await screen.findByRole('menuitem', { name: 'Cancel invitation' }))
    const dialog = within(await screen.findByRole('dialog'))
    expect(dialog.getByText('Cancel the invitation for Acme Workspace?')).toBeInTheDocument()
    fireEvent.click(dialog.getByRole('button', { name: 'Cancel invitation' }))

    await waitFor(() => expect(mockedRevoke).toHaveBeenCalledWith(
      manualUser.id,
      expect.any(String),
    ))
    expect(await screen.findByText('No workspaces yet')).toBeInTheDocument()
  })

  it('names the replacement-password rule inside the Issue temporary password dialog', async () => {
    mockedList.mockResolvedValue([{ ...manualUser, invite_expires_at: '2099-01-08T00:00:00Z' }])
    renderPage()

    await openMenu('Acme Workspace')
    fireEvent.click(await screen.findByRole('menuitem', { name: 'Issue temporary password' }))
    const dialog = within(await screen.findByRole('dialog'))
    expect(dialog.getByText(/Issuing a replacement immediately invalidates the previous temporary password/)).toBeInTheDocument()
  })

  it('offers only cancelling after an interrupted manual setup reaches review', async () => {
    mockedList.mockResolvedValue([{
      ...manualUser,
      user_id: null,
      status: 'provisioning',
      invite_reconciliation_pending: true,
      invite_reconciliation_claim_kind: 'deliver',
      invite_reconciliation_review_after: '2020-01-01T00:00:00Z',
    }])

    renderPage()

    expect(await screen.findByText(/setup cannot resume/i)).toBeInTheDocument()
    await openMenu('Acme Workspace')
    expect(await screen.findByRole('menuitem', { name: 'Retry setup' })).toHaveAttribute('aria-disabled', 'true')
    expect(screen.getByRole('menuitem', { name: 'Cancel invitation' })).not.toHaveAttribute('aria-disabled')
  })

  it('hides settled and unsafe revoked history while retaining live accounts', async () => {
    mockedList.mockResolvedValue([
      { ...manualUser, id: '41111111-1111-4111-8111-111111111111', email: 'settled-manual@example.com', status: 'revoked', password_change_required: false },
      { ...manualUser, id: '51111111-1111-4111-8111-111111111111', email: 'credential-incident@example.com', status: 'revoked', password_change_required: false, credential_reconciliation_pending: true, credential_reconciliation_claim_kind: 'temporary_password_rotation' },
      { ...manualUser, id: '61111111-1111-4111-8111-111111111111', email: 'delivery-incident@example.com', status: 'revoked', password_change_required: false, invite_reconciliation_pending: true, invite_reconciliation_claim_kind: 'deliver' },
      { ...manualUser, id: '81111111-1111-4111-8111-111111111111', email: 'live-owner@example.com' },
    ])

    renderPage()

    expect(await screen.findByText(/live-owner@example.com/)).toBeInTheDocument()
    expect(screen.queryByText(/settled-manual@example.com/)).not.toBeInTheDocument()
    expect(screen.queryByText(/credential-incident@example.com/)).not.toBeInTheDocument()
    expect(screen.queryByText(/delivery-incident@example.com/)).not.toBeInTheDocument()
  })

  it('shows no workspaces when the only row is a revoked invitation', async () => {
    mockedList.mockResolvedValue([{
      ...manualUser,
      status: 'revoked',
      provisioning_method: 'email_invite',
      password_change_required: false,
      invite_reconciliation_pending: true,
      invite_reconciliation_claim_kind: 'revoke_cleanup',
      invite_reconciliation_review_after: '2099-07-21T00:15:00Z',
    }])

    renderPage()

    expect(await screen.findByText('No workspaces yet')).toBeInTheDocument()
    expect(screen.queryByText(/operator review/i)).not.toBeInTheDocument()
  })

  it('offers Suspend on active rows and Unsuspend on suspended ones', async () => {
    mockedList.mockResolvedValue([
      { ...manualUser, status: 'active', password_change_required: false },
      { ...manualUser, id: '91111111-1111-4111-8111-111111111111', email: 'suspended-owner@example.com', status: 'suspended', password_change_required: false, workspace: { id: '92222222-2222-4222-8222-222222222222', name: 'Paused Agency' } },
    ])

    renderPage()

    await openMenu('Paused Agency')
    expect(await screen.findByRole('menuitem', { name: 'Unsuspend' })).toBeInTheDocument()
    expect(screen.queryByRole('menuitem', { name: 'Reset password' })).toBeNull()
    expect(screen.queryByRole('menuitem', { name: /verify auth/i })).toBeNull()
  })

  it('describes each account in the lifecycle words, with one date format', async () => {
    mockedList.mockResolvedValue([
      { ...manualUser, invited_at: '2099-01-01T00:00:00Z', invite_expires_at: '2099-01-08T00:00:00Z' },
      { ...manualUser, id: '51111111-1111-4111-8111-111111111111', email: 'late@example.com', provisioning_method: 'email_invite', password_change_required: false, invited_at: '2026-07-01T00:00:00Z', invite_expires_at: '2026-07-08T00:00:00Z', workspace: { id: '52222222-2222-4222-8222-222222222222', name: 'Late Agency' } },
    ])

    renderPage()

    expect(await screen.findByText('Invited')).toBeInTheDocument()
    expect(screen.getByText('Expires Jan 8, 2099')).toBeInTheDocument()
    expect(screen.getByText('Invite expired')).toBeInTheDocument()
    expect(screen.getByText('Expired Jul 8, 2026')).toBeInTheDocument()
    expect(screen.getByText('Jan 1, 2099')).toBeInTheDocument()
    expect(screen.queryByText(/Waiting for first sign-in/i)).toBeNull()
  })

  it('combines the search with the status filter', async () => {
    mockedList.mockResolvedValue([
      { ...manualUser, status: 'active', password_change_required: false },
      { ...manualUser, id: '41111111-1111-4111-8111-111111111111', email: 'nina@northstar.example', full_name: 'Nina North', status: 'active', password_change_required: false, workspace: { id: '52222222-2222-4222-8222-222222222222', name: 'Northstar Advisory' } },
      { ...manualUser, id: '42111111-1111-4111-8111-111111111111', email: 'nora@northpole.example', full_name: 'Nora Pole', invite_expires_at: '2099-01-08T00:00:00Z', workspace: { id: '53222222-2222-4222-8222-222222222222', name: 'North Pole Media' } },
    ])

    renderPage()
    expect(await screen.findByText('Northstar Advisory')).toBeInTheDocument()
    expect(screen.getByText('3 workspaces')).toBeInTheDocument()

    fireEvent.change(screen.getByRole('searchbox', { name: 'Search workspaces' }), { target: { value: 'north' } })
    expect(screen.getByText('2 workspaces')).toBeInTheDocument()
    expect(screen.queryByText('Acme Workspace')).not.toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Invited' }))
    expect(screen.getByText('North Pole Media')).toBeInTheDocument()
    expect(screen.queryByText('Northstar Advisory')).not.toBeInTheDocument()
    expect(screen.getByText('1 workspace')).toBeInTheDocument()

    // Owner email counts too, not only the workspace name.
    fireEvent.click(screen.getByRole('button', { name: 'All' }))
    fireEvent.change(screen.getByRole('searchbox', { name: 'Search workspaces' }), { target: { value: 'owner@example' } })
    expect(screen.getByText('Acme Workspace')).toBeInTheDocument()

    fireEvent.change(screen.getByRole('searchbox', { name: 'Search workspaces' }), { target: { value: 'nobody' } })
    expect(screen.getByText(/No workspaces match/)).toBeInTheDocument()
  })

  it('shows a serving domain as a badge that opens the Domains tab', async () => {
    mockedList.mockResolvedValue([
      { ...manualUser, status: 'active', password_change_required: false },
      { ...manualUser, id: '41111111-1111-4111-8111-111111111111', status: 'active', password_change_required: false, workspace: { id: '52222222-2222-4222-8222-222222222222', name: 'Plain Agency' }, workspace_id: '52222222-2222-4222-8222-222222222222' },
    ])
    vi.mocked(listWorkspaceDomains).mockResolvedValue([{
      id: 'd1', workspace_id: manualUser.workspace_id, hostname: 'podcasts.acme.com', status: 'active', is_primary: true,
      dns_record_type: 'CNAME', dns_record_name: null, dns_record_value: null, last_error: null, activated_at: null,
      first_activated_at: null, last_checked_at: null, created_at: '2026-08-01T00:00:00Z',
      workspace: { id: manualUser.workspace_id, name: 'Acme Workspace', slug: 'acme' },
    }])

    renderPage()

    const badge = await screen.findByRole('button', { name: 'podcasts.acme.com, open Domains' })
    expect(screen.getByText('Default')).toBeInTheDocument()
    fireEvent.click(badge)
    await waitFor(() => expect(screen.getByTestId('location')).toHaveTextContent('?tab=domains'))
  })

  it('closes a workspace only after its name is typed', async () => {
    mockedList.mockResolvedValue([{ ...manualUser, status: 'active', password_change_required: false }])
    renderPage()

    await openMenu('Acme Workspace')
    fireEvent.click(await screen.findByRole('menuitem', { name: 'Close workspace' }))
    const dialog = within(await screen.findByRole('dialog'))
    expect(dialog.getByText(/The owner loses access now. Data is kept for 30 days, then deleted./)).toBeInTheDocument()
    const submit = dialog.getByRole('button', { name: 'Close workspace' })
    expect(submit).toBeDisabled()
    fireEvent.change(dialog.getByLabelText(/to confirm/), { target: { value: 'acme workspace' } })
    fireEvent.click(submit)
    await waitFor(() => expect(mockedDelete).toHaveBeenCalledWith(manualUser.workspace_id, ''))
  })

  it('keeps the Closed tab to two lines when empty, and lists the countdown when not', async () => {
    renderPage('/app/manage-workspaces?tab=closed')
    expect(await screen.findByText('No closed workspaces.')).toBeInTheDocument()
    expect(screen.getByText('Closed workspaces stay here for 30 days, then they are deleted.')).toBeInTheDocument()
  })

  it('lists a closed workspace with its owner, dates and Restore', async () => {
    const purgeAfter = new Date(Date.now() + 12.5 * 86_400_000).toISOString()
    vi.mocked(listDeletedWorkspaces).mockResolvedValue([
      { id: manualUser.workspace_id, name: 'Gone Agency', slug: 'gone', deleted_at: '2026-10-05T00:00:00Z', purge_after: purgeAfter, deletion_reason: null },
      { id: 'expired-window', name: 'Past Window', slug: 'past', deleted_at: '2026-01-01T00:00:00Z', purge_after: '2026-01-31T00:00:00Z', deletion_reason: null },
    ])
    mockedList.mockResolvedValue([{ ...manualUser, status: 'revoked', email: 'gone@example.com' }])
    renderPage('/app/manage-workspaces?tab=closed')

    expect(await screen.findByText('Gone Agency')).toBeInTheDocument()
    expect(await screen.findByText('gone@example.com')).toBeInTheDocument()
    expect(screen.getByText('in 12 days')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Restore' })).toBeInTheDocument()
    expect(screen.queryByText('Past Window')).toBeNull()
    expect(screen.getByRole('tab', { name: /Closed\s*\(1\)/ })).toBeInTheDocument()
  })
})
