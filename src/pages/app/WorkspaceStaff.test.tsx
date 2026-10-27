import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { MemoryRouter, useLocation } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import WorkspaceStaff from '@/pages/app/WorkspaceStaff'
import { useAuth } from '@/contexts/AuthContext'
import { getWorkspaceClients } from '@/services/clients'
import { getWorkspaceCampaignOverview, getWorkspaceMailboxes } from '@/services/workspaceCampaigns'
import { listWorkspaceOnboarding } from '@/services/workspaceOnboarding'
import {
  createWorkspaceStaffTemporaryPassword,
  inviteWorkspaceStaff,
  listWorkspaceStaff,
  mutateWorkspaceStaff,
  resetWorkspaceStaffTemporaryPassword,
  retryWorkspaceStaffTemporaryPassword,
  removeMemberAvatar,
  removeWorkspaceLogo,
  uploadMemberAvatar,
  updateWorkspaceBookingLink,
  updateWorkspaceClientBranding,
  updateWorkspaceLogo,
  updateWorkspaceName,
  updateWorkspaceStaffRole,
  type WorkspaceStaffMember,
  type WorkspaceStaffView,
  getWorkspaceBillingOverview,
  getWorkspaceAiKeys,
  grantWorkspaceCredits,
  setWorkspaceAiKey,
  testWorkspaceAiKey,
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
// The setup-progress line in the header reads the same sources the clients
// page checklist does. None of them matter to these tests beyond answering;
// their answers are primed in beforeEach, since clearAllMocks empties them.
vi.mock('@/services/clients', () => ({ getWorkspaceClients: vi.fn() }))
vi.mock('@/services/workspaceCampaigns', () => ({
  getWorkspaceCampaignOverview: vi.fn(),
  getWorkspaceMailboxes: vi.fn(),
}))
vi.mock('@/services/workspaceOnboarding', () => ({ listWorkspaceOnboarding: vi.fn() }))
vi.mock('@/services/workspaceStaff', () => ({
  createWorkspaceStaffTemporaryPassword: vi.fn(),
  getWorkspaceAiKeys: vi.fn(),
  setWorkspaceAiKey: vi.fn(),
  clearWorkspaceAiKey: vi.fn(),
  testWorkspaceAiKey: vi.fn(),
  getWorkspaceBillingOverview: vi.fn(),
  grantWorkspaceCredits: vi.fn(),
  inviteWorkspaceStaff: vi.fn(),
  listWorkspaceStaff: vi.fn(),
  mutateWorkspaceStaff: vi.fn(),
  resetWorkspaceStaffTemporaryPassword: vi.fn(),
  retryWorkspaceStaffTemporaryPassword: vi.fn(),
  removeMemberAvatar: vi.fn(),
  removeWorkspaceLogo: vi.fn(),
  uploadMemberAvatar: vi.fn(),
  updateWorkspaceBookingLink: vi.fn().mockResolvedValue(undefined),
  updateWorkspaceClientBranding: vi.fn(),
  updateWorkspaceLogo: vi.fn(),
  updateWorkspaceName: vi.fn(),
  updateWorkspaceStaffRole: vi.fn(),
}))

const mockedUseAuth = vi.mocked(useAuth)
const mockedCreatePassword = vi.mocked(createWorkspaceStaffTemporaryPassword)
const mockedInvite = vi.mocked(inviteWorkspaceStaff)
const mockedList = vi.mocked(listWorkspaceStaff)
const mockedMutate = vi.mocked(mutateWorkspaceStaff)
const mockedResetPassword = vi.mocked(resetWorkspaceStaffTemporaryPassword)
const mockedRetryPassword = vi.mocked(retryWorkspaceStaffTemporaryPassword)
const mockedRemoveAvatar = vi.mocked(removeMemberAvatar)
const mockedRemoveLogo = vi.mocked(removeWorkspaceLogo)
const mockedUploadAvatar = vi.mocked(uploadMemberAvatar)
const mockedUpdateClientBrand = vi.mocked(updateWorkspaceClientBranding)
const mockedUpdateLogo = vi.mocked(updateWorkspaceLogo)
const mockedUpdateWorkspaceName = vi.mocked(updateWorkspaceName)
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
  allowed_actions: ['reset_password', 'update_role', 'transfer_owner', 'suspend', 'revoke'],
}

const ownerView: WorkspaceStaffView = {
  workspace: {
    id: workspaceId,
    name: 'Acme Workspace',
    updated_at: '2026-07-22T00:25:00.000Z',
    status: 'active',
    is_default: false,
    logo_path: null,
    logo_updated_at: null,
    client_brand_name: 'Acme Agency',
    client_brand_primary_color: '#0D1B2A',
    client_brand_accent_color: '#C7794F',
    booking_embed_url: null,
    client_brand_updated_at: '2026-07-22T00:30:00.000Z',
    client_contact_email: null,
  },
  capabilities: {
    read_only: false,
    invite_roles: ['admin', 'member'],
    can_generate_password: true,
    can_manage_branding: true,
    can_manage_client_branding: true,
    can_manage_workspace_name: true,
    can_update_roles: true,
    can_transfer_owner: true,
  },
  members: [owner, admin],
}

const refreshAccount = vi.fn()
const refreshSession = vi.fn()
const signOut = vi.fn()

const mediumDate = (value: string) => new Intl.DateTimeFormat(undefined, { dateStyle: 'medium' }).format(new Date(value))

/**
 * Row actions other than the role live behind a per-row menu now. Radix opens
 * it from the keyboard in jsdom, where pointer events do not exist.
 */
function openRowMenu(email: string) {
  const trigger = screen.getByRole('button', { name: `More actions for ${email}` })
  trigger.focus()
  fireEvent.keyDown(trigger, { key: 'Enter', code: 'Enter' })
}

const LocationHash = () => <span data-testid="location-hash">{useLocation().hash}</span>

function renderPage(platformWorkspaceId?: string, hash = '') {
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
            ? `/app/workspaces/${platformWorkspaceId}/settings`
            : `/app/settings${hash}`,
        ]}
        future={{ v7_startTransition: true, v7_relativeSplatPath: true }}
      >
        <WorkspaceStaff platformWorkspaceId={platformWorkspaceId} />
        <LocationHash />
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

describe('WorkspaceStaff', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(getWorkspaceAiKeys).mockResolvedValue({
      anthropic: { configured: false, last_four: null, updated_at: null },
      openai: { configured: false, last_four: null, updated_at: null },
      winnr: { configured: false, last_four: null, updated_at: null },
    })
    vi.mocked(getWorkspaceBillingOverview).mockResolvedValue({
      plan_key: 'founding_member',
      billing_status: 'trialing',
      base_price_cents: 3900,
      per_client_price_cents: 3900,
      included_active_clients: 1,
      monthly_credit_allowance: 25,
      enforcement_enabled: false,
      balance: 10,
      expiring_credits: 0,
      next_expiry_at: null,
      usage_this_month: {},
      prices: {},
      recent_activity: [],
    })
    vi.mocked(grantWorkspaceCredits).mockResolvedValue({ granted: 100, balance: 110 })
    vi.mocked(getWorkspaceClients).mockResolvedValue([])
    vi.mocked(getWorkspaceCampaignOverview).mockResolvedValue({
      integration: { connected: true, status: 'connected', provider_workspace_name: 'Acme Sending' },
      can_manage_campaigns: true,
      campaigns: [],
      provider_campaigns: [],
      provider_campaigns_error: null,
    } as never)
    vi.mocked(getWorkspaceMailboxes).mockResolvedValue({
      connected: true,
      provider_workspace_name: 'Acme Sending',
      accounts: [],
      last_synced_at: null,
      analytics_errors: [],
    })
    vi.mocked(listWorkspaceOnboarding).mockResolvedValue({ templates: [] } as never)
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
    mockedResetPassword.mockResolvedValue({
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
    mockedUploadAvatar.mockResolvedValue({
      avatar_path: `${workspaceId}/${userId}/77777777-7777-4777-8777-777777777777.png`,
      avatar_updated_at: '2026-08-05T20:00:00.000Z',
    })
    mockedRemoveAvatar.mockResolvedValue({ avatar_path: null, avatar_updated_at: null })
    mockedUpdateClientBrand.mockResolvedValue({
      id: workspaceId,
      client_brand_name: 'Northstar Advisory',
      client_brand_primary_color: '#16324F',
      client_brand_accent_color: '#E07A5F',
      client_brand_updated_at: '2026-07-22T01:05:00.000Z',
      client_contact_email: null,
    })
    mockedUpdateWorkspaceName.mockResolvedValue({
      id: workspaceId,
      name: 'Northstar Workspace',
      updated_at: '2026-07-22T01:04:00.000Z',
    })
    mockedMutate.mockResolvedValue({ ...admin, role: 'owner', allowed_actions: [] })
    mockedUpdateRole.mockResolvedValue({ ...admin, role: 'member' })
  })

  it('scrolls to and focuses the field another page linked to', async () => {
    const scrollIntoView = vi.fn()
    Element.prototype.scrollIntoView = scrollIntoView
    renderPage(undefined, '#client-contact-email')

    const field = await screen.findByLabelText('Email clients reply to')
    await waitFor(() => expect(field).toHaveFocus())
    expect(scrollIntoView).toHaveBeenCalledWith({ block: 'center' })
    // The menu marks the section the link landed in.
    const settingsNavigation = screen.getByRole('navigation', { name: 'Settings sections' })
    expect(within(settingsNavigation).getByRole('link', { name: /Client branding/ })).toHaveAttribute('aria-current', 'location')
  })

  it('warns while the reply-to email is empty and offers the owner address', async () => {
    renderPage()

    const field = await screen.findByLabelText('Email clients reply to')
    expect(field).toHaveAttribute('aria-invalid', 'true')
    expect(screen.getByText('Replies to your client emails go nowhere until you add an address.')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Use owner@example.com' }))
    expect(field).toHaveValue('owner@example.com')
    expect(field).not.toHaveAttribute('aria-invalid')
    expect(screen.queryByText(/go nowhere/)).not.toBeInTheDocument()
  })

  // 1Password offered a login for "Agency name shown to clients".
  it('keeps password managers off the fields that are not credentials', async () => {
    renderPage()
    await screen.findByText('Agency Admin')

    for (const label of ['Workspace name', 'Agency name shown to clients', 'Email clients reply to', 'Booking link or embed code']) {
      const field = screen.getByLabelText(label)
      expect(field).toHaveAttribute('autocomplete', 'off')
      expect(field).toHaveAttribute('data-1p-ignore', 'true')
      expect(field).toHaveAttribute('data-lpignore', 'true')
    }
  })

  it('hides an API key as it is typed and reveals it on request', async () => {
    renderPage()

    const field = await screen.findByLabelText('Anthropic (Claude) API key')
    expect(field).toHaveAttribute('type', 'password')
    expect(field).toHaveAttribute('autocomplete', 'off')
    fireEvent.click(screen.getByRole('button', { name: 'Show Anthropic (Claude) key' }))
    expect(field).toHaveAttribute('type', 'text')
    fireEvent.click(screen.getByRole('button', { name: 'Hide Anthropic (Claude) key' }))
    expect(field).toHaveAttribute('type', 'password')
  })

  describe('AI keys', () => {
    const savedAnthropic = () => vi.mocked(getWorkspaceAiKeys).mockResolvedValue({
      anthropic: { configured: true, last_four: '4f2a', updated_at: '2026-10-01T00:00:00Z' },
      openai: { configured: false, last_four: null, updated_at: null },
      winnr: { configured: false, last_four: null, updated_at: null },
    })

    it('shows a saved key masked, with Replace, Test and Remove instead of an empty box', async () => {
      savedAnthropic()
      renderPage()

      expect(await screen.findByLabelText('Saved Anthropic (Claude) key')).toHaveTextContent('sk-ant-…4f2a')
      expect(screen.queryByLabelText('Anthropic (Claude) API key')).not.toBeInTheDocument()
      expect(screen.getByRole('button', { name: 'Replace' })).toBeEnabled()
      expect(screen.getByRole('button', { name: 'Test key' })).toBeEnabled()

      fireEvent.click(screen.getByRole('button', { name: 'Replace' }))
      expect(screen.getByLabelText('Anthropic (Claude) API key')).toHaveAttribute('type', 'password')
      fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))
      expect(screen.getByLabelText('Saved Anthropic (Claude) key')).toBeInTheDocument()

      fireEvent.click(screen.getByRole('button', { name: /^Remove$/ }))
      expect(await screen.findByRole('alertdialog', { name: 'Remove the Anthropic (Claude) key?' })).toBeInTheDocument()
    })

    it.each([
      ['valid', 'Valid. The provider accepted this key.'],
      ['invalid', 'Invalid. The provider rejected this key.'],
      // An outage says nothing about the key; calling it invalid would
      // invite deleting a key that works.
      ['unreachable', 'The provider did not answer, so the key could not be checked.'],
    ] as const)('says what a test of the saved key found: %s', async (result, copy) => {
      savedAnthropic()
      vi.mocked(testWorkspaceAiKey).mockResolvedValue(result)
      renderPage()

      fireEvent.click(await screen.findByRole('button', { name: 'Test key' }))
      expect(await screen.findByText(new RegExp(`^${copy.replace(/[.]/gu, '\\.')}`))).toBeInTheDocument()
      expect(testWorkspaceAiKey).toHaveBeenCalledWith(workspaceId, 'anthropic')
    })

    it('says plainly when the server cannot test keys yet', async () => {
      savedAnthropic()
      vi.mocked(testWorkspaceAiKey).mockRejectedValue(Object.assign(new Error('Unknown workspace user action'), { code: 'INVALID_ACTION' }))
      renderPage()

      fireEvent.click(await screen.findByRole('button', { name: 'Test key' }))
      expect(await screen.findByText('Testing a saved key is not available yet.')).toBeInTheDocument()
    })

    it('shows the platform credits a key would have covered this month', async () => {
      vi.mocked(getWorkspaceBillingOverview).mockResolvedValue({
        plan_key: 'founding_member',
        billing_status: 'active',
        balance: 500,
        ledger_usage_this_month: {
          research_run: { credits: 200, refunds: 0 },
          query_generation: { credits: 112, refunds: 0 },
          podscan_lookup: { credits: 30, refunds: 0 },
        },
      } as never)
      renderPage()

      expect(await screen.findByText('Used 312 platform credits on Claude tasks this month.')).toBeInTheDocument()
      // Database search costs nothing, so there is no line to show for it.
      expect(screen.queryByText(/on database searches this month/)).not.toBeInTheDocument()
      expect(screen.getByText(/^Used for podcast research, pitch writing and inbox replies\./)).toBeInTheDocument()
    })

    it('saves a new key with an explicit save, then shows it masked', async () => {
      vi.mocked(setWorkspaceAiKey).mockResolvedValue(undefined)
      renderPage()

      fireEvent.change(await screen.findByLabelText('Anthropic (Claude) API key'), { target: { value: ' sk-ant-api03-new-key-0000 ' } })
      savedAnthropic()
      fireEvent.click(screen.getAllByRole('button', { name: 'Save key' })[0])
      await waitFor(() => expect(setWorkspaceAiKey).toHaveBeenCalledWith(workspaceId, 'anthropic', 'sk-ant-api03-new-key-0000'))
      expect(await screen.findByLabelText('Saved Anthropic (Claude) key')).toBeInTheDocument()
    })
  })

  it('saves a pasted scheduler link when the field loses focus and says it will load inline', async () => {
    renderPage()

    const field = await screen.findByLabelText('Booking link or embed code')
    fireEvent.change(field, { target: { value: 'https://calendly.com/agency/intro' } })
    expect(screen.getByText('Calendly link detected. It loads inline on prospect dashboards.')).toBeInTheDocument()
    // No button of its own any more.
    expect(screen.queryByRole('button', { name: 'Save link' })).not.toBeInTheDocument()

    fireEvent.blur(field)
    await waitFor(() => expect(vi.mocked(updateWorkspaceBookingLink)).toHaveBeenCalledWith(
      workspaceId,
      'https://calendly.com/agency/intro',
    ))
    expect(await screen.findByText('Saved')).toBeInTheDocument()
  })

  it('takes the link out of the embed block a scheduler puts on the clipboard', async () => {
    renderPage()

    const field = await screen.findByLabelText('Booking link or embed code')
    fireEvent.change(field, {
      target: {
        value: '<script>Cal("init", "30min", {origin:"https://app.cal.com"});'
          + ' Cal.ns["30min"]("inline", { calLink: "agency/30min" });</script>',
      },
    })
    fireEvent.blur(field)

    await waitFor(() => expect(vi.mocked(updateWorkspaceBookingLink)).toHaveBeenCalledWith(
      workspaceId,
      'https://cal.com/agency/30min',
    ))
    // The field then shows the link it saved, not the script.
    await waitFor(() => expect(field).toHaveValue('https://cal.com/agency/30min'))
  })

  it('says a link it cannot frame will open in a new tab instead of refusing it', async () => {
    renderPage()

    const field = await screen.findByLabelText('Booking link or embed code')
    fireEvent.change(field, { target: { value: 'https://book.example.com/agency' } })

    expect(screen.getByText('Link detected. It opens in a new tab from prospect dashboards.')).toBeInTheDocument()
  })

  it('refuses a paste with no link in it, under the field, without saving', async () => {
    renderPage()

    const field = await screen.findByLabelText('Booking link or embed code')
    fireEvent.change(field, { target: { value: 'not a link at all' } })
    fireEvent.blur(field)

    expect(await screen.findByRole('alert')).toHaveTextContent('No booking link found in that.')
    expect(field).toHaveAttribute('aria-invalid', 'true')
    expect(updateWorkspaceBookingLink).not.toHaveBeenCalled()
  })

  it('renders the owner roster and only server-authorized controls for the signed-in workspace', async () => {
    renderPage()

    expect(await screen.findByText('Agency Admin')).toBeInTheDocument()
    expect(screen.getByTestId('workspace-settings-page')).toHaveClass('min-w-0', 'max-w-full')
    expect(screen.getByRole('heading', { name: 'Settings', level: 1 })).toBeInTheDocument()
    const settingsNavigation = screen.getByRole('navigation', { name: 'Settings sections' })
    expect(within(settingsNavigation).getByRole('link', { name: /General/ })).toHaveAttribute('href', '#workspace-general')
    expect(within(settingsNavigation).getByRole('link', { name: /Sidebar order/ })).toHaveAttribute('href', '#sidebar-navigation')
    expect(within(settingsNavigation).getByRole('link', { name: /Profile/ })).toHaveAttribute('href', '#your-profile')
    expect(within(settingsNavigation).getByRole('link', { name: /AI keys/ })).toHaveAttribute('href', '#ai-keys')
    // Grouped by whose setting it is; the group names replaced the small
    // uppercase labels each section used to carry.
    expect(within(settingsNavigation).getByText('Your account')).toBeInTheDocument()
    expect(within(settingsNavigation).getByText('Workspace')).toBeInTheDocument()
    for (const label of ['YOU', 'PERSONALIZATION', 'WHITE LABEL', 'INTEGRATIONS', 'ACCESS']) {
      expect(screen.queryByText(new RegExp(`^${label}$`, 'i'))).not.toBeInTheDocument()
    }
    expect(within(settingsNavigation).getByRole('link', { name: /Client branding/ })).toHaveAttribute('href', '#client-branding')
    expect(within(settingsNavigation).getByRole('link', { name: /Team & access/ })).toHaveAttribute('href', '#workspace-access')
    // Billing is a section of its own now, not a link off the page.
    expect(within(settingsNavigation).getByRole('link', { name: /Billing/ })).toHaveAttribute('href', '#billing')
    expect(screen.getByRole('heading', { name: 'Billing', level: 2 })).toBeInTheDocument()
    expect(within(settingsNavigation).getByRole('link', { name: /Danger zone/ })).toHaveAttribute('href', '#danger-zone')
    expect(within(settingsNavigation).queryByRole('link', { name: /^Credits/ })).not.toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'General', level: 2 })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Sidebar order', level: 2 })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Client branding', level: 2 })).toBeInTheDocument()
    // The count lives in the heading; the three stat tiles that repeated it are gone.
    expect(screen.getByRole('heading', { name: 'Team & access · 2 members', level: 2 })).toBeInTheDocument()
    expect(screen.queryByText('Total users')).not.toBeInTheDocument()
    expect(screen.queryByText('Pending access')).not.toBeInTheDocument()
    // The way out sits inside the settings body under its own heading, not
    // floating after the grid where nothing pointed at it.
    expect(screen.getByRole('heading', { name: 'Danger zone', level: 2 })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Close workspace' })).toBeInTheDocument()
    expect(screen.getByLabelText('Primary color')).toHaveClass('min-w-0', 'flex-1')
    expect(screen.getByRole('table')).toHaveClass('min-w-[44rem]')
    expect(screen.getByText('Manage the people who can access your workspace.')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Invite member' })).toBeEnabled()
    expect(screen.getByRole('combobox', { name: 'Change role for admin@example.com' })).toBeEnabled()
    const table = screen.getByRole('table')
    expect(within(table).getByText('Owner')).toBeInTheDocument()
    expect(within(table).queryByText('Protected owner')).not.toBeInTheDocument()
    expect(within(table).queryByText('No actions')).not.toBeInTheDocument()
    // The roles are explained once, beside the list they apply to.
    expect(screen.getByText(/Cannot see Settings, Billing or the team list\./)).toBeInTheDocument()

    // Everything but the role sits behind the row menu, grouped by what it does.
    openRowMenu('admin@example.com')
    expect(await screen.findByRole('menuitem', { name: 'Suspend' })).toBeInTheDocument()
    expect(screen.getByRole('menuitem', { name: 'Reset password' })).toBeInTheDocument()
    expect(screen.getByRole('menuitem', { name: /make owner/i })).toBeInTheDocument()
    expect(screen.getByRole('menuitem', { name: /remove/i })).toHaveClass('text-destructive')
    expect(mockedList).toHaveBeenCalledWith(workspaceId)
  })

  it('says how far setup has come, and whether Instantly is connected', async () => {
    renderPage()
    await screen.findByText('Agency Admin')

    const status = screen.getByTestId('instantly-status')
    await waitFor(() => expect(status).toHaveTextContent('Connected to Acme Sending · Manage in Client Campaigns'))
    expect(within(status).getByRole('link', { name: 'Manage in Client Campaigns' })).toHaveAttribute('href', '/app/client-campaigns')
    // Instantly connected and credits in hand, but no client, no linked
    // mailbox and no reply-to address: two of five. It opens what is left,
    // each linking to where it is finished.
    fireEvent.click(await screen.findByRole('button', { name: /Setup: 2 of 5 required steps done/ }))
    expect(await screen.findByText('Still to do')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Set the email clients reply to' })).toHaveAttribute('href', '/app/settings#client-contact-email')
    expect(screen.getByRole('link', { name: 'Add your first client' })).toHaveAttribute('href', '/app/clients')
    expect(screen.getByRole('link', { name: 'Open the full checklist' })).toHaveAttribute('href', '/app/clients')
    expect(screen.queryByText('Workspace active')).not.toBeInTheDocument()
  })

  it('moves to a section from the menu, marks it current and puts it in the address', async () => {
    const scrollIntoView = vi.fn()
    Element.prototype.scrollIntoView = scrollIntoView
    renderPage()
    await screen.findByText('Agency Admin')

    const settingsNavigation = screen.getByRole('navigation', { name: 'Settings sections' })
    const branding = within(settingsNavigation).getByRole('link', { name: /Client branding/ })
    fireEvent.click(branding)

    expect(scrollIntoView).toHaveBeenCalledWith(expect.objectContaining({ block: 'start' }))
    expect(branding).toHaveAttribute('aria-current', 'location')
    expect(screen.getByRole('heading', { name: 'Client branding', level: 2 })).toHaveFocus()
    await waitFor(() => expect(screen.getByTestId('location-hash')).toHaveTextContent('#client-branding'))
    // The menu scrolled already; the page does not scroll a second time.
    expect(scrollIntoView).toHaveBeenCalledTimes(1)
  })

  it('hides the setup badge once every required step is done', async () => {
    mockedList.mockResolvedValue({
      ...ownerView,
      workspace: { ...ownerView.workspace, client_contact_email: 'hello@northstar.test' },
    })
    vi.mocked(getWorkspaceClients).mockResolvedValue([{ id: 'client-1' }] as never)
    vi.mocked(getWorkspaceMailboxes).mockResolvedValue({
      connected: true,
      provider_workspace_name: 'Acme Sending',
      accounts: [{ campaigns: [{ id: 'campaign-1' }] }],
      last_synced_at: null,
      analytics_errors: [],
    } as never)
    renderPage()
    await screen.findByText('Agency Admin')

    await waitFor(() => expect(getWorkspaceMailboxes).toHaveBeenCalled())
    await new Promise((resolve) => setTimeout(resolve, 20))
    expect(screen.queryByRole('button', { name: /Setup:/ })).not.toBeInTheDocument()
  })

  it('shows the plan and balance in its own billing section', async () => {
    renderPage()

    const billing = await screen.findByRole('region', { name: 'Billing' })
    expect(await within(billing).findByText('Founding member')).toBeInTheDocument()
    expect(within(billing).getByText('10 credits')).toBeInTheDocument()
    expect(within(billing).getByRole('link', { name: 'Manage billing' })).toHaveAttribute('href', '/app/settings/billing')
  })

  it('stacks the team on a narrow screen, with every action in view', async () => {
    // The setup's matchMedia is a read-only vi.fn(); its implementation is
    // swapped for this test and put back after.
    const original = vi.mocked(window.matchMedia).getMockImplementation()
    vi.mocked(window.matchMedia).mockImplementation((query: string) => ({
      matches: query === '(max-width: 1279px)',
      media: query,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    }) as never)
    try {
      renderPage()
      const list = await screen.findByRole('list', { name: 'Team members' })
      expect(screen.queryByRole('table')).not.toBeInTheDocument()
      const admin = within(list).getByText('Agency Admin').closest('li') as HTMLElement
      expect(within(admin).getByRole('combobox', { name: 'Change role for admin@example.com' })).toBeEnabled()
      expect(within(admin).getByRole('button', { name: 'More actions for admin@example.com' })).toBeEnabled()
      // The owner cannot be removed from here, by themselves or anyone.
      const owner = within(list).getByText('Workspace Owner').closest('li') as HTMLElement
      expect(within(owner).queryByRole('button', { name: /More actions/ })).not.toBeInTheDocument()
    } finally {
      if (original) vi.mocked(window.matchMedia).mockImplementation(original)
    }
  })

  it('offers to resend an invite that is still being set up', async () => {
    mockedList.mockResolvedValue({
      ...ownerView,
      members: [...ownerView.members, {
        ...admin,
        id: '99999999-9999-4999-8999-999999999999',
        email: 'new@example.com',
        full_name: null,
        role: 'member',
        status: 'provisioning',
        accepted_at: null,
        allowed_actions: ['retry_invite', 'revoke'],
      }],
    })
    renderPage()
    await screen.findByText('Agency Admin')

    expect(screen.getByRole('heading', { name: 'Team & access · 3 members, 1 pending', level: 2 })).toBeInTheDocument()
    openRowMenu('new@example.com')
    expect(await screen.findByRole('menuitem', { name: 'Resend invite' })).toBeInTheDocument()
    expect(screen.getByRole('menuitem', { name: /Remove/ })).toBeInTheDocument()
  })

  it('marks an expired invite and puts sending a new one in the open', async () => {
    const expired: WorkspaceStaffMember = {
      ...admin,
      id: '88888888-8888-4888-8888-888888888888',
      email: 'late@example.com',
      full_name: 'Late Invitee',
      role: 'member',
      status: 'invited',
      setup_method: 'email_invite',
      invited_at: '2026-07-01T00:00:00.000Z',
      invite_expires_at: '2026-07-08T00:00:00.000Z',
      accepted_at: null,
      allowed_actions: ['retry_invite', 'revoke'],
    }
    mockedList.mockResolvedValue({ ...ownerView, members: [owner, admin, expired] })
    mockedMutate.mockResolvedValue(undefined)
    renderPage()

    await screen.findByText('Late Invitee')
    expect(screen.getByText('Invite expired')).toBeInTheDocument()
    expect(screen.getByText(`Expired ${mediumDate(expired.invite_expires_at as string)}`)).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Send a new invite' }))
    await waitFor(() => expect(mockedMutate).toHaveBeenCalledWith(workspaceId, expired.id, 'retry_invite'))
  })

  it('lets only the signed-in workspace owner launch their sidebar organizer', async () => {
    renderPage()
    await screen.findByText('Agency Admin')

    fireEvent.click(screen.getByRole('button', { name: 'Organize sidebar' }))

    const navigation = screen.getByRole('navigation', { name: 'Workspace navigation' })
    expect(within(navigation).getByRole('button', { name: 'Done' })).toBeInTheDocument()
    // 12: University was added 2026-08-07 and the Inbox retired 2026-10-26.
    expect(within(navigation).getAllByRole('button', { name: /^Drag /u })).toHaveLength(12)
  })

  it('saves the workspace name on blur, with the timestamp it was read at', async () => {
    renderPage()
    await screen.findByText('Agency Admin')

    const name = screen.getByLabelText('Workspace name')
    fireEvent.change(name, { target: { value: '  Northstar Workspace ' } })
    fireEvent.blur(name)
    await waitFor(() => expect(mockedUpdateWorkspaceName).toHaveBeenCalledWith(workspaceId, {
      name: 'Northstar Workspace',
      expected_updated_at: '2026-07-22T00:25:00.000Z',
    }))
    expect(await screen.findByText('Saved')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Save workspace name' })).not.toBeInTheDocument()
  })

  it('refuses an empty workspace name under the field, without saving', async () => {
    renderPage()
    await screen.findByText('Agency Admin')

    const name = screen.getByLabelText('Workspace name')
    fireEvent.change(name, { target: { value: '   ' } })
    fireEvent.blur(name)

    expect(await screen.findByText('Enter a workspace name.')).toBeInTheDocument()
    expect(mockedUpdateWorkspaceName).not.toHaveBeenCalled()
  })

  it('saves the workspace name once typing pauses, without a blur', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    try {
      renderPage()
      await screen.findByText('Agency Admin')

      fireEvent.change(screen.getByLabelText('Workspace name'), { target: { value: 'Northstar Workspace' } })
      expect(mockedUpdateWorkspaceName).not.toHaveBeenCalled()
      await vi.advanceTimersByTimeAsync(1300)
      await waitFor(() => expect(mockedUpdateWorkspaceName).toHaveBeenCalledTimes(1))
    } finally {
      vi.useRealTimers()
    }
  })

  /*
   * Agency name, reply-to and both colours are one record with one
   * timestamp. Saved one field at a time, the second save has to carry the
   * timestamp and values the first returned, or it is refused as stale or
   * puts back what the first just changed.
   */
  it('saves brand fields one at a time, each on top of the last', async () => {
    let release: () => void = () => undefined
    mockedUpdateClientBrand
      .mockImplementationOnce(() => new Promise((resolve) => {
        release = () => resolve({
          id: workspaceId,
          client_brand_name: 'Northstar Advisory',
          client_brand_primary_color: '#0D1B2A',
          client_brand_accent_color: '#C7794F',
          client_brand_updated_at: '2026-07-22T01:05:00.000Z',
          client_contact_email: null,
        })
      }))
      .mockResolvedValueOnce({
        id: workspaceId,
        client_brand_name: 'Northstar Advisory',
        client_brand_primary_color: '#0D1B2A',
        client_brand_accent_color: '#C7794F',
        client_brand_updated_at: '2026-07-22T01:06:00.000Z',
        client_contact_email: 'owner@example.com',
      })
    renderPage()
    await screen.findByText('Agency Admin')

    const agency = screen.getByLabelText('Agency name shown to clients')
    fireEvent.change(agency, { target: { value: 'Northstar Advisory' } })
    fireEvent.blur(agency)
    fireEvent.click(screen.getByRole('button', { name: 'Use owner@example.com' }))

    await waitFor(() => expect(mockedUpdateClientBrand).toHaveBeenCalledTimes(1))
    expect(mockedUpdateClientBrand).toHaveBeenLastCalledWith(workspaceId, {
      client_brand_name: 'Northstar Advisory',
      client_brand_primary_color: '#0D1B2A',
      client_brand_accent_color: '#C7794F',
      client_contact_email: undefined,
      expected_brand_updated_at: '2026-07-22T00:30:00.000Z',
    })
    release()
    await waitFor(() => expect(mockedUpdateClientBrand).toHaveBeenCalledTimes(2))
    expect(mockedUpdateClientBrand).toHaveBeenLastCalledWith(workspaceId, {
      client_brand_name: 'Northstar Advisory',
      client_brand_primary_color: '#0D1B2A',
      client_brand_accent_color: '#C7794F',
      client_contact_email: 'owner@example.com',
      expected_brand_updated_at: '2026-07-22T01:05:00.000Z',
    })
  })

  it('holds colours behind the unsaved-changes bar until Save, and Discard puts them back', async () => {
    renderPage()
    await screen.findByText('Agency Admin')

    expect(screen.queryByRole('region', { name: 'Unsaved changes' })).not.toBeInTheDocument()
    fireEvent.change(screen.getByLabelText('Primary color'), { target: { value: '#16324F' } })
    const bar = screen.getByRole('region', { name: 'Unsaved changes' })
    expect(mockedUpdateClientBrand).not.toHaveBeenCalled()

    fireEvent.click(within(bar).getByRole('button', { name: 'Discard' }))
    expect(screen.getByLabelText('Primary color')).toHaveValue('#0D1B2A')
    expect(screen.queryByRole('region', { name: 'Unsaved changes' })).not.toBeInTheDocument()

    fireEvent.change(screen.getByLabelText('Primary color'), { target: { value: '#16324F' } })
    fireEvent.change(screen.getByLabelText('Accent color'), { target: { value: '#E07A5F' } })
    fireEvent.click(within(screen.getByRole('region', { name: 'Unsaved changes' })).getByRole('button', { name: 'Save' }))
    await waitFor(() => expect(mockedUpdateClientBrand).toHaveBeenCalledWith(workspaceId, {
      client_brand_name: 'Acme Agency',
      client_brand_primary_color: '#16324F',
      client_brand_accent_color: '#E07A5F',
      client_contact_email: undefined,
      expected_brand_updated_at: '2026-07-22T00:30:00.000Z',
    }))
    await waitFor(() => expect(toastSuccess).toHaveBeenCalledWith('Client branding saved.'))
  })

  it('asks before leaving the page with unsaved colours, and not for moving within it', async () => {
    renderPage()
    await screen.findByText('Agency Admin')

    fireEvent.change(screen.getByLabelText('Primary color'), { target: { value: '#16324F' } })
    // Within the page: the section menu changes only the hash.
    fireEvent.click(within(screen.getByRole('navigation', { name: 'Settings sections' })).getByRole('link', { name: /General/ }))
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument()

    // Out of it: a link to another page.
    fireEvent.click(await screen.findByRole('link', { name: 'Manage in Client Campaigns' }))
    expect(await screen.findByRole('alertdialog', { name: 'Leave without saving?' })).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Stay on this page' }))
    await waitFor(() => expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument())
    expect(screen.getByLabelText('Primary color')).toHaveValue('#16324F')

    // The browser's own prompt covers closing and reloading the tab.
    const unload = new Event('beforeunload', { cancelable: true })
    window.dispatchEvent(unload)
    expect(unload.defaultPrevented).toBe(true)
  })

  /**
   * refreshAccount flips the account state to loading, and ProtectedRoute
   * answers loading with a full-screen spinner — so calling it tears this page
   * down and rebuilds it, losing drafts and scroll position. Saving something
   * the sidebar never draws must not pay that.
   */
  it('keeps a half-typed workspace name when an unrelated roster change refetches', async () => {
    // Suspending a teammate invalidates and refetches the staff roster with
    // changed data. A blanket effect keyed on `data` used to wipe the name,
    // booking link, and brand a user was mid-editing.
    renderPage()
    await screen.findByText('Agency Admin')

    fireEvent.change(screen.getByLabelText('Workspace name'), { target: { value: 'Half Typed Name' } })

    // The next roster load reflects the suspension — genuinely different data.
    mockedList.mockResolvedValue({
      ...ownerView,
      members: ownerView.members.map((member) => (
        member.id === adminId ? { ...member, status: 'suspended', suspended_at: '2026-07-22T01:00:00.000Z' } : member
      )),
    })
    mockedMutate.mockResolvedValue(undefined)

    openRowMenu('admin@example.com')
    fireEvent.click(await screen.findByRole('menuitem', { name: 'Suspend' }))
    const confirmation = await screen.findByRole('alertdialog', { name: 'Suspend Agency Admin?' })
    expect(within(confirmation).getByText(
      'Agency Admin loses access straight away. Their clients, campaigns and notes stay exactly as they are, and you can reactivate them any time.',
    )).toBeInTheDocument()
    fireEvent.click(within(confirmation).getByRole('button', { name: 'Suspend user' }))
    await waitFor(() => expect(mockedMutate).toHaveBeenCalledWith(workspaceId, adminId, 'suspend'))

    // The edit the user never saved is still in the field.
    expect((screen.getByLabelText('Workspace name') as HTMLInputElement).value).toBe('Half Typed Name')
  })

  it('shows a saved booking link and lets it be cleared', async () => {
    // The list response used to drop booking_embed_url, so the box loaded
    // empty and a saved link could never be removed through the UI.
    mockedList.mockResolvedValue({
      ...ownerView,
      workspace: { ...ownerView.workspace, booking_embed_url: 'https://calendly.com/northstar/intro' },
    })
    vi.mocked(updateWorkspaceBookingLink).mockResolvedValue(undefined)
    renderPage()
    await screen.findByText('Agency Admin')

    const box = screen.getByLabelText('Booking link or embed code') as HTMLInputElement
    expect(box.value).toBe('https://calendly.com/northstar/intro')
    expect(screen.getByText('Calendly link detected. It loads inline on prospect dashboards.')).toBeInTheDocument()

    fireEvent.change(box, { target: { value: '' } })
    fireEvent.blur(box)
    await waitFor(() => expect(updateWorkspaceBookingLink).toHaveBeenCalledWith(workspaceId, null))
  })

  it('does not tear the page down to save a booking link', async () => {
    renderPage()
    await screen.findByText('Agency Admin')

    const box = screen.getByLabelText('Booking link or embed code')
    fireEvent.change(box, { target: { value: 'https://calendly.com/northstar/intro' } })
    fireEvent.blur(box)

    await waitFor(() => expect(updateWorkspaceBookingLink).toHaveBeenCalled())
    expect(await screen.findByText('Saved')).toBeInTheDocument()
    expect(refreshAccount).not.toHaveBeenCalled()
  })

  it('does not tear the page down to save the client-facing brand', async () => {
    renderPage()
    await screen.findByText('Agency Admin')

    const agency = screen.getByLabelText('Agency name shown to clients')
    fireEvent.change(agency, { target: { value: 'Northstar Advisory' } })
    fireEvent.blur(agency)

    await waitFor(() => expect(mockedUpdateClientBrand).toHaveBeenCalled())
    expect(await screen.findByText('Saved')).toBeInTheDocument()
    expect(refreshAccount).not.toHaveBeenCalled()
  })

  // The sidebar draws the workspace name from the account context, so this one
  // has to re-read it or the sidebar sits stale until a hard refresh — but
  // quietly, or ProtectedRoute throws up a spinner and rebuilds the page.
  it('refreshes the shell for the name the sidebar draws, without tearing the page down', async () => {
    renderPage()
    await screen.findByText('Agency Admin')

    const name = screen.getByLabelText('Workspace name')
    fireEvent.change(name, { target: { value: 'Northstar Workspace' } })
    fireEvent.blur(name)

    await waitFor(() => expect(refreshAccount).toHaveBeenCalledTimes(1))
    expect(refreshAccount).toHaveBeenCalledWith({ quiet: true })
  })

  // Two fields on this page are called a name, and which one a client sees was
  // described only from the other one's helper text.
  it('says plainly which name a client sees and which one they never do', async () => {
    renderPage()
    await screen.findByText('Agency Admin')

    expect(screen.getByText(/Only your team sees this/i)).toBeInTheDocument()
    expect(screen.getByText(/Clients never see it unless you type the same name/i)).toBeInTheDocument()
    expect(screen.getByText(/The name your clients recognize/i)).toBeInTheDocument()
  })

  it('names the scheduler a link belongs to and offers to open it', async () => {
    renderPage()

    const field = await screen.findByLabelText('Booking link or embed code')
    fireEvent.change(field, { target: { value: 'https://savvycal.com/northstar/intro' } })
    expect(screen.getByText('SavvyCal link detected. It loads inline on prospect dashboards.')).toBeInTheDocument()
    const test = screen.getByRole('link', { name: /Test link/ })
    expect(test).toHaveAttribute('href', 'https://savvycal.com/northstar/intro')
    expect(test).toHaveAttribute('target', '_blank')
    expect(test).toHaveAttribute('rel', 'noopener noreferrer')
  })

  it('takes a hex color with or without the # and stores it in capitals', async () => {
    renderPage()
    await screen.findByText('Agency Admin')

    const primary = screen.getByLabelText('Primary color')
    fireEvent.focus(primary)
    fireEvent.change(primary, { target: { value: '2b4c7e' } })
    fireEvent.blur(primary)
    expect(primary).toHaveValue('#2B4C7E')

    fireEvent.focus(primary)
    fireEvent.change(primary, { target: { value: '#12' } })
    // Half a color while typing is not an error yet.
    expect(screen.queryByText('Enter a hex color, like #2B4C7E.')).not.toBeInTheDocument()
    fireEvent.blur(primary)
    expect(screen.getByText('Enter a hex color, like #2B4C7E.')).toBeInTheDocument()
    expect(within(screen.getByRole('region', { name: 'Unsaved changes' })).getByRole('button', { name: 'Save' })).toBeDisabled()
  })

  it('warns when white text on a brand color would be hard to read', async () => {
    renderPage()
    await screen.findByText('Agency Admin')

    // The default accent, #C7794F, is already too light for white text.
    expect(screen.getAllByText(/Text on this color may be hard to read/)).toHaveLength(1)
    fireEvent.change(screen.getByLabelText('Primary color'), { target: { value: '#FFAA00' } })
    expect(screen.getAllByText(/Text on this color may be hard to read/)).toHaveLength(2)
    fireEvent.change(screen.getByLabelText('Primary color'), { target: { value: '#16324F' } })
    expect(screen.getAllByText(/Text on this color may be hard to read/)).toHaveLength(1)
  })

  it('previews the brand on the client dashboard and on onboarding', async () => {
    renderPage()
    await screen.findByText('Agency Admin')

    expect(screen.getByLabelText('Client dashboard brand preview')).toBeInTheDocument()
    // Radix tabs switch on mouse down, which is what a click starts with.
    fireEvent.mouseDown(screen.getByRole('tab', { name: 'Onboarding' }))
    expect(await screen.findByLabelText('Onboarding brand preview')).toBeInTheDocument()
    expect(screen.queryByLabelText('Client dashboard brand preview')).not.toBeInTheDocument()
  })

  it('says what the two brand colours actually move', async () => {
    renderPage()
    await screen.findByText('Agency Admin')

    expect(screen.getByText(/Primary is the solid colour behind headers and buttons/i)).toBeInTheDocument()
    expect(screen.getByText(/Accent marks the active item/i)).toBeInTheDocument()
  })

  // The instruction never changes and the status changes with every keystroke,
  // so reading the status used to mean re-reading the instruction.
  it('keeps the booking-link instruction apart from its live status', async () => {
    renderPage()
    await screen.findByText('Agency Admin')

    // One line: what the link is for. Nothing typed yet, so no provider.
    expect(screen.getByText('Prospects without their own call-to-action will see this booking link.')).toBeInTheDocument()
    expect(screen.queryByText(/link detected/)).not.toBeInTheDocument()
    expect(screen.queryByRole('link', { name: /Test link/ })).not.toBeInTheDocument()
  })

  it('invites through the authenticated workspace and its allowed default role', async () => {
    renderPage()
    await screen.findByText('Agency Admin')

    fireEvent.click(screen.getByRole('button', { name: 'Invite member' }))
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

  // The hidden file field was the styled Input, whose base classes carry
  // h-10 w-full. tailwind-merge does not treat sr-only as conflicting with a
  // width, so both survived: the field kept sr-only's position:absolute at a
  // full 774px and, with no positioned ancestor, anchored to the initial
  // containing block and stretched the document 260px past the viewport.
  // jsdom has no layout, so the classes are what can be asserted here.
  it('hides the logo field without giving it a width that widens the page', async () => {
    renderPage()
    await screen.findByText('Agency Admin')

    const field = screen.getByLabelText('Workspace logo file')
    expect(field.tagName).toBe('INPUT')
    expect(field).toHaveClass('sr-only')
    // These are what sr-only's 1px box loses to.
    expect(field.className).not.toMatch(/\bw-full\b/)
    expect(field.className).not.toMatch(/\bh-10\b/)
  })

  it('uploads a workspace logo and refreshes the signed-in workspace shell', async () => {
    renderPage()
    await screen.findByText('Agency Admin')
    const file = new File(
      [new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])],
      'agency.png',
      { type: 'image/png' },
    )

    // jsdom has no object URLs; the chosen file is previewed through one.
    URL.createObjectURL = vi.fn(() => 'blob:preview')
    URL.revokeObjectURL = vi.fn()

    fireEvent.change(screen.getByLabelText('Workspace logo file'), {
      target: { files: [file] },
    })

    // Previewed, not uploaded, until the bar's Save.
    expect(screen.getByLabelText('Client dashboard brand preview').querySelector('img')).toHaveAttribute('src', 'blob:preview')
    expect(mockedUpdateLogo).not.toHaveBeenCalled()
    fireEvent.click(within(screen.getByRole('region', { name: 'Unsaved changes' })).getByRole('button', { name: 'Save' }))

    await waitFor(() => expect(mockedUpdateLogo).toHaveBeenCalledWith(workspaceId, file, null))
    await waitFor(() => expect(refreshAccount).toHaveBeenCalledTimes(1))
    expect(toastSuccess).toHaveBeenCalledWith('Client branding saved.')
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

    // Shown on the primary color it sits on in the client's header.
    expect(screen.getByTestId('workspace-logo-on-primary')).toHaveStyle({ backgroundColor: '#0D1B2A' })

    fireEvent.click(screen.getByRole('button', { name: 'Remove logo' }))
    const dialog = screen.getByRole('alertdialog', { name: 'Remove workspace logo?' })
    fireEvent.click(within(dialog).getByRole('button', { name: 'Remove logo' }))

    await waitFor(() => expect(mockedRemoveLogo).toHaveBeenCalledWith(workspaceId, logoPath))
    await waitFor(() => expect(refreshAccount).toHaveBeenCalledTimes(1))
    expect(toastSuccess).toHaveBeenCalledWith('Workspace logo removed.')
  })

  it('lets a member upload their own picture and refreshes the shell that draws it', async () => {
    renderPage()
    await screen.findByText('Agency Admin')

    const profile = screen.getByRole('region', { name: 'Profile' })
    expect(within(profile).getByRole('button', { name: /upload picture/i })).toBeEnabled()
    // Nothing to remove until there is one.
    expect(within(profile).queryByRole('button', { name: /^Remove$/ })).not.toBeInTheDocument()

    const file = new File(
      [new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])],
      'me.png',
      { type: 'image/png' },
    )
    fireEvent.change(screen.getByLabelText('Profile picture file'), { target: { files: [file] } })

    // No member id: the row is located by the authenticated actor, so a caller
    // cannot nominate somebody else's membership.
    await waitFor(() => expect(mockedUploadAvatar).toHaveBeenCalledWith(workspaceId, file, null))
    await waitFor(() => expect(refreshAccount).toHaveBeenCalledTimes(1))
    expect(toastSuccess).toHaveBeenCalledWith('Profile picture updated.')
  })

  it('removes the picture it currently has, naming the object it expects to clear', async () => {
    const avatarPath = `${workspaceId}/${userId}/77777777-7777-4777-8777-777777777777.png`
    mockedUseAuth.mockReturnValue({
      user: { id: userId, email: 'owner@example.com', user_metadata: { full_name: 'Workspace Owner' } },
      workspace: { id: workspaceId, name: 'Acme Workspace', slug: 'acme-workspace', status: 'active', is_default: false },
      membership: {
        id: ownerId,
        full_name: 'Workspace Owner',
        role: 'owner',
        avatar_path: avatarPath,
        avatar_updated_at: '2026-08-05T20:00:00.000Z',
      },
      refreshAccount,
      refreshSession,
      signOut,
    } as never)

    renderPage()
    await screen.findByText('Agency Admin')

    const profile = screen.getByRole('region', { name: 'Profile' })
    expect(within(profile).getByRole('button', { name: /replace picture/i })).toBeEnabled()
    fireEvent.click(within(profile).getByRole('button', { name: /^Remove$/ }))
    fireEvent.click(within(await screen.findByRole('alertdialog', { name: 'Remove your profile picture?' })).getByRole('button', { name: 'Remove picture' }))

    await waitFor(() => expect(mockedRemoveAvatar).toHaveBeenCalledWith(workspaceId, avatarPath))
    await waitFor(() => expect(refreshAccount).toHaveBeenCalledTimes(1))
    expect(toastSuccess).toHaveBeenCalledWith('Profile picture removed.')
  })

  /*
   * A platform admin inspecting an agency holds no membership there, and a
   * picture belongs to a membership. The control used to be offered anyway,
   * and the backend answered it accurately — "avatar member row is absent for
   * this actor" — which read as a bug for a state that has no meaning here.
   */
  it('offers no picture on the platform view of a workspace the admin is not a member of', async () => {
    mockedUseAuth.mockReturnValue({
      user: { id: userId, email: 'platform@example.com' },
      workspace: null,
      membership: null,
      isPlatformAdmin: true,
      refreshAccount,
      refreshSession,
      signOut,
    } as never)

    renderPage(workspaceId)
    await screen.findByText('Agency Admin')

    expect(screen.queryByRole('region', { name: 'Profile' })).not.toBeInTheDocument()
    expect(screen.queryByLabelText('Profile picture file')).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /upload picture/i })).not.toBeInTheDocument()
    // The workspace's own branding is still theirs to manage from this view.
    expect(screen.getByLabelText('Workspace logo file')).toBeInTheDocument()
  })

  /*
   * The way the operator of this platform reaches their own agency: from the
   * platform side, on the /app/workspaces/:id route. Gating on the route rather
   * than on the membership took the card away from them here, which is the one
   * place they would go to use it.
   */
  it('still offers the picture when the admin opens the workspace they belong to', async () => {
    mockedUseAuth.mockReturnValue({
      user: { id: userId, email: 'owner@example.com', user_metadata: { full_name: 'Workspace Owner' } },
      workspace: { id: workspaceId, name: 'Acme Workspace', slug: 'acme-workspace', status: 'active', is_default: false },
      membership: { id: ownerId, full_name: 'Workspace Owner', role: 'owner' },
      isPlatformAdmin: true,
      refreshAccount,
      refreshSession,
      signOut,
    } as never)

    renderPage(workspaceId)
    await screen.findByText('Agency Admin')

    const profile = screen.getByRole('region', { name: 'Profile' })
    const file = new File([new Uint8Array([0x89, 0x50, 0x4e, 0x47])], 'me.png', { type: 'image/png' })
    fireEvent.change(within(profile).getByLabelText('Profile picture file'), { target: { files: [file] } })

    await waitFor(() => expect(mockedUploadAvatar).toHaveBeenCalledWith(workspaceId, file, null))
    /*
     * The account context is the only carrier of the viewer's own avatar — the
     * staff DTO has no such field — and this route otherwise skips that read.
     * Without it the page keeps the old path, and the next change sends an
     * expected path the row has already moved past, refused as "changed
     * elsewhere" for a change this actor just made.
     */
    await waitFor(() => expect(refreshAccount).toHaveBeenCalledTimes(1))
  })

  /*
   * The same gap the upload had, on the other button. Removing is a change to
   * the same row, carried by the same account context, and refreshShellIdentity
   * skips that read on this route — so a removal left the page holding the path
   * of an object that is gone, and the next upload declared it as the expected
   * path the row had already moved past.
   */
  it('refreshes the account when the picture is removed from the platform route', async () => {
    const avatarPath = `${workspaceId}/${userId}/77777777-7777-4777-8777-777777777777.png`
    mockedUseAuth.mockReturnValue({
      user: { id: userId, email: 'owner@example.com', user_metadata: { full_name: 'Workspace Owner' } },
      workspace: { id: workspaceId, name: 'Acme Workspace', slug: 'acme-workspace', status: 'active', is_default: false },
      membership: {
        id: ownerId,
        full_name: 'Workspace Owner',
        role: 'owner',
        avatar_path: avatarPath,
        avatar_updated_at: '2026-08-05T20:00:00.000Z',
      },
      isPlatformAdmin: true,
      refreshAccount,
      refreshSession,
      signOut,
    } as never)

    renderPage(workspaceId)
    await screen.findByText('Agency Admin')

    const profile = screen.getByRole('region', { name: 'Profile' })
    fireEvent.click(within(profile).getByRole('button', { name: /^Remove$/ }))
    fireEvent.click(within(await screen.findByRole('alertdialog', { name: 'Remove your profile picture?' })).getByRole('button', { name: 'Remove picture' }))

    await waitFor(() => expect(mockedRemoveAvatar).toHaveBeenCalledWith(workspaceId, avatarPath))
    await waitFor(() => expect(refreshAccount).toHaveBeenCalledTimes(1))
    expect(refreshAccount).toHaveBeenCalledWith({ quiet: true })
    expect(toastSuccess).toHaveBeenCalledWith('Profile picture removed.')
  })

  /*
   * The optimistic-concurrency argument, which only has a value to carry once
   * there is a second upload. Sending null there would declare "this row has no
   * picture" against a row that has one — the check the server makes to refuse a
   * change that raced another device.
   */
  it('declares the picture it is replacing, not an empty slot, on a second upload', async () => {
    const avatarPath = `${workspaceId}/${userId}/77777777-7777-4777-8777-777777777777.png`
    mockedUseAuth.mockReturnValue({
      user: { id: userId, email: 'owner@example.com', user_metadata: { full_name: 'Workspace Owner' } },
      workspace: { id: workspaceId, name: 'Acme Workspace', slug: 'acme-workspace', status: 'active', is_default: false },
      membership: {
        id: ownerId,
        full_name: 'Workspace Owner',
        role: 'owner',
        avatar_path: avatarPath,
        avatar_updated_at: '2026-08-05T20:00:00.000Z',
      },
      refreshAccount,
      refreshSession,
      signOut,
    } as never)

    renderPage()
    await screen.findByText('Agency Admin')

    const file = new File(
      [new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])],
      'replacement.png',
      { type: 'image/png' },
    )
    fireEvent.change(screen.getByLabelText('Profile picture file'), { target: { files: [file] } })

    await waitFor(() => expect(mockedUploadAvatar).toHaveBeenCalledWith(workspaceId, file, avatarPath))
    expect(toastSuccess).toHaveBeenCalledWith('Profile picture updated.')
  })

  /*
   * The refusal this whole area exists to make legible — "changed elsewhere" —
   * is only useful if the words reach the person. A generic fallback would tell
   * them the upload failed and not that the row moved.
   */
  it('says why the server refused a picture, and claims nothing it did not do', async () => {
    mockedUploadAvatar.mockRejectedValueOnce(
      new Error('Your profile picture changed elsewhere. Refresh and try again.'),
    )
    renderPage()
    await screen.findByText('Agency Admin')

    const file = new File([new Uint8Array([0x89, 0x50, 0x4e, 0x47])], 'me.png', { type: 'image/png' })
    fireEvent.change(screen.getByLabelText('Profile picture file'), { target: { files: [file] } })

    await waitFor(() => expect(toastError).toHaveBeenCalledWith(
      'Your profile picture changed elsewhere. Refresh and try again.',
    ))
    expect(toastSuccess).not.toHaveBeenCalledWith('Profile picture updated.')
    // Nothing changed, so there is nothing to re-read — and re-reading here
    // would make the failure look like a save that half-happened.
    expect(refreshAccount).not.toHaveBeenCalled()
  })

  /*
   * Platform admin is not the question: a picture belongs to a membership, and
   * this admin's membership is in their own agency, not the one on screen.
   * Holding a membership somewhere must not offer the card everywhere.
   */
  it('offers no picture on another agency when the admin belongs to a different workspace', async () => {
    mockedUseAuth.mockReturnValue({
      user: { id: userId, email: 'platform@example.com' },
      workspace: { id: otherWorkspaceId, name: 'Own Workspace', slug: 'own-workspace', status: 'active', is_default: false },
      membership: { id: ownerId, full_name: 'Platform Owner', role: 'owner' },
      isPlatformAdmin: true,
      refreshAccount,
      refreshSession,
      signOut,
    } as never)

    renderPage(workspaceId)
    await screen.findByText('Agency Admin')

    expect(screen.queryByRole('region', { name: 'Profile' })).not.toBeInTheDocument()
    expect(screen.queryByLabelText('Profile picture file')).not.toBeInTheDocument()
  })

  /*
   * A platform admin keeps access without a tenant membership, so membership
   * can be null on a page whose workspace is perfectly real. On your own
   * settings the workspace on screen is the one you are signed in to, and
   * requiring the membership object as well took the card off a page where it
   * had always rendered.
   */
  it('offers the picture on your own settings even when context carries no membership', async () => {
    mockedUseAuth.mockReturnValue({
      user: { id: userId, email: 'platform@example.com' },
      workspace: { id: workspaceId, name: 'Acme Workspace', slug: 'acme-workspace', status: 'active', is_default: true },
      membership: null,
      isPlatformAdmin: true,
      refreshAccount,
      refreshSession,
      signOut,
    } as never)

    renderPage()
    await screen.findByText('Agency Admin')

    expect(screen.getByRole('region', { name: 'Profile' })).toBeInTheDocument()
  })

  // No membership anywhere means no picture to set, and the workspace id the
  // upload would carry is empty — the refusal would have been about that.
  it('offers no picture to an admin who holds no membership at all', async () => {
    mockedUseAuth.mockReturnValue({
      user: { id: userId, email: 'platform@example.com' },
      workspace: null,
      membership: null,
      isPlatformAdmin: true,
      refreshAccount,
      refreshSession,
      signOut,
    } as never)

    renderPage(workspaceId)
    await screen.findByText('Agency Admin')

    expect(screen.queryByRole('region', { name: 'Profile' })).not.toBeInTheDocument()
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

    fireEvent.click(screen.getByRole('button', { name: 'Invite member' }))
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
    expect(screen.getByText('Setting up')).toBeInTheDocument()
    openRowMenu('password@example.com')
    fireEvent.click(await screen.findByRole('menuitem', { name: 'Generate password' }))

    await waitFor(() => expect(mockedRetryPassword).toHaveBeenCalledWith(workspaceId, pendingPassword.id))
    expect(await screen.findByRole('dialog', { name: 'Save the temporary password' })).toBeInTheDocument()
  })

  it('lets the workspace owner reset a user password and reveals the temporary password once', async () => {
    renderPage()
    await screen.findByText('Agency Admin')

    openRowMenu('admin@example.com')
    fireEvent.click(await screen.findByRole('menuitem', { name: 'Reset password' }))
    const confirmation = await screen.findByRole('alertdialog', { name: 'Reset Agency Admin’s password?' })
    expect(within(confirmation).getByText(/current workspace sessions will stop working/i)).toBeInTheDocument()
    fireEvent.click(within(confirmation).getByRole('button', { name: 'Reset password' }))

    await waitFor(() => expect(mockedResetPassword).toHaveBeenCalledWith(workspaceId, adminId))
    const credentialDialog = await screen.findByRole('dialog', { name: 'Save the temporary password' })
    expect(within(credentialDialog).getByLabelText('Temporary password')).toHaveValue(temporaryPassword)
    expect(within(credentialDialog).getByText(/must replace the temporary password at first sign-in/i)).toBeInTheDocument()

    // One paste for the person being set up: where, who, the password, and
    // that it is a one-off.
    const writeText = vi.fn().mockResolvedValue(undefined)
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText } })
    fireEvent.click(within(credentialDialog).getByRole('button', { name: 'Copy sign-in instructions' }))
    await waitFor(() => expect(writeText).toHaveBeenCalledWith(
      `Sign in at ${window.location.origin}/login with admin@example.com and this temporary password: ${temporaryPassword}\n`
      + 'You will be asked to choose your own password straight away. '
      + `This temporary one stops working on ${mediumDate('2026-07-29T00:00:00.000Z')}.`,
    ))
    expect(await within(credentialDialog).findByRole('button', { name: 'Sign-in instructions copied' })).toBeInTheDocument()
  })

  it('confirms ownership transfer and refreshes the demoted owner session', async () => {
    renderPage()
    await screen.findByText('Agency Admin')

    openRowMenu('admin@example.com')
    fireEvent.click(await screen.findByRole('menuitem', { name: /make owner/i }))
    const dialog = await screen.findByRole('alertdialog')
    expect(within(dialog).getByText('Transfer ownership to Agency Admin?')).toBeInTheDocument()
    expect(within(dialog).getByText(/Your role changes to admin/)).toBeInTheDocument()
    fireEvent.click(within(dialog).getByRole('button', { name: 'Transfer ownership' }))

    await waitFor(() => expect(mockedMutate).toHaveBeenCalledWith(workspaceId, adminId, 'transfer_owner'))
    await waitFor(() => expect(refreshSession).toHaveBeenCalledTimes(1))
    expect(refreshAccount).toHaveBeenCalledTimes(1)
    expect(signOut).not.toHaveBeenCalled()
    expect(toastSuccess).toHaveBeenCalledWith('Workspace ownership transferred.')
  })

  // Viewing a workspace shows what its own people see. Platform work — manual
  // credit grants — is not part of that and lives at /app/platform/billing,
  // where it can be aimed at any workspace.
  it('shows a viewed workspace exactly what its own people would see', async () => {
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
    // The same words a workspace owner reads on their own settings page.
    expect(screen.getByText('Manage your workspace identity, client experience, and team access.')).toBeInTheDocument()
    expect(screen.getByText('Manage the people who can access your workspace.')).toBeInTheDocument()
    const settingsNavigation = screen.getByRole('navigation', { name: 'Settings sections' })
    expect(within(settingsNavigation).queryByRole('link', { name: /^Credits/ })).not.toBeInTheDocument()
    expect(screen.queryByRole('region', { name: 'Workspace credits' })).not.toBeInTheDocument()
    expect(screen.queryByText(/admin preview/i)).not.toBeInTheDocument()
    /*
     * Present here, which is the point of this test's name: an owner sees this
     * section on their own settings, so hiding it from the platform view made
     * the two disagree — and the shell offered the reorder control on this very
     * screen, so the sidebar had a button whose settings entry did not exist.
     * The order is the viewer's own in every view, never the viewed
     * workspace's, and the card says so.
     */
    expect(screen.getByRole('heading', { name: 'Sidebar order', level: 2 })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Organize sidebar' })).toBeEnabled()
    expect(screen.getByText(/Only you see this order/i)).toBeInTheDocument()
    expect(screen.getByText(/It is saved in this browser/i)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Invite member' })).toBeEnabled()
    expect(screen.getByRole('button', { name: 'More actions for admin@example.com' })).toBeEnabled()
    // Sign out lives in the menu on the person's avatar.
    expect(screen.getByRole('button', { name: /^Account menu: / })).toBeEnabled()
    expect(screen.getByText('platform@example.com')).toBeInTheDocument()
    expect(screen.getByText('platform owner')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Settings' })).toHaveAttribute(
      'href',
      `/app/workspaces/${workspaceId}/settings`,
    )

    fireEvent.click(screen.getByRole('button', { name: 'Invite member' }))
    const inviteDialog = screen.getByRole('dialog')
    fireEvent.change(within(inviteDialog).getByLabelText('Full name'), { target: { value: 'Platform Invite' } })
    fireEvent.change(within(inviteDialog).getByLabelText('Email'), { target: { value: 'platform-invite@example.com' } })
    fireEvent.click(within(inviteDialog).getByRole('button', { name: 'Send invitation' }))
    await waitFor(() => expect(mockedInvite).toHaveBeenCalledWith(workspaceId, {
      email: 'platform-invite@example.com',
      full_name: 'Platform Invite',
      role: 'admin',
    }))

    openRowMenu('admin@example.com')
    fireEvent.click(await screen.findByRole('menuitem', { name: /make owner/i }))
    const dialog = await screen.findByRole('alertdialog')
    expect(within(dialog).getByText(/current workspace owner becomes an admin/i)).toBeInTheDocument()
    fireEvent.click(within(dialog).getByRole('button', { name: 'Transfer ownership' }))

    await waitFor(() => expect(mockedMutate).toHaveBeenCalledWith(workspaceId, adminId, 'transfer_owner'))
    expect(refreshSession).not.toHaveBeenCalled()
    expect(refreshAccount).not.toHaveBeenCalled()
    expect(mockedList).toHaveBeenCalledWith(workspaceId)
  })

  
  // A workspace whose owner was invited the ordinary way and has not signed in
  // yet has no owner row to name. The credit still goes to the workspace
  // ledger, and the billing page's own top-up grants without one, so hiding the
  // card here gave the same admin two answers for the same workspace.
  
  // The balance used to fall back to 0 when the read failed, and there are no
  // retries. An admin who topped this workspace up an hour ago would read the
  // 0 as the grant never landing, and grant a second time.
  
  it('lets the platform owner reset the selected workspace owner without exposing an old password', async () => {
    const resettableOwner: WorkspaceStaffMember = { ...owner, allowed_actions: ['reset_password'] }
    mockedUseAuth.mockReturnValue({
      user: { id: userId, email: 'platform@example.com' },
      workspace: null,
      membership: null,
      isPlatformAdmin: true,
      refreshAccount,
      refreshSession,
      signOut,
    } as never)
    mockedList.mockResolvedValue({ ...ownerView, members: [resettableOwner, admin] })
    mockedResetPassword.mockResolvedValue({
      member: {
        ...owner,
        status: 'invited',
        invite_expires_at: '2026-07-30T00:00:00.000Z',
        accepted_at: owner.accepted_at,
        allowed_actions: [],
      },
      email: owner.email,
      temporary_password: temporaryPassword,
    })

    renderPage(workspaceId)
    const teamTable = await screen.findByRole('table')
    const ownerRow = within(teamTable).getByText('Workspace Owner').closest('tr')
    expect(ownerRow).not.toBeNull()
    const trigger = within(ownerRow as HTMLElement).getByRole('button', { name: 'More actions for owner@example.com' })
    trigger.focus()
    fireEvent.keyDown(trigger, { key: 'Enter', code: 'Enter' })
    fireEvent.click(await screen.findByRole('menuitem', { name: 'Reset password' }))
    const confirmation = await screen.findByRole('alertdialog', { name: 'Reset Workspace Owner’s password?' })
    fireEvent.click(within(confirmation).getByRole('button', { name: 'Reset password' }))

    await waitFor(() => expect(mockedResetPassword).toHaveBeenCalledWith(workspaceId, ownerId))
    expect(await screen.findByRole('dialog', { name: 'Save the temporary password' })).toBeInTheDocument()
  })

  it('says what a temporary-password account is waiting for, and since when', async () => {
    const fiveDaysAgo = new Date(Date.now() - 5 * 86_400_000).toISOString()
    mockedList.mockResolvedValue({
      ...ownerView,
      members: [
        owner,
        {
          ...admin,
          id: '44444444-4444-4444-8444-444444444444',
          email: 'stalled@example.com',
          full_name: 'Stalled Owner',
          status: 'invited',
          setup_method: 'admin_temporary_password',
          invited_at: fiveDaysAgo,
          accepted_at: null,
        },
      ],
    })
    renderPage()

    // A temporary password is handed over by a person, so it can simply never
    // arrive. "Password change required" read the same on day one and day
    // five; the issue date says which it is.
    expect(await screen.findByText('Waiting for first sign-in')).toBeInTheDocument()
    expect(screen.getByText(`Issued ${mediumDate(fiveDaysAgo)}`)).toBeInTheDocument()
  })

  it('leaves a member who has signed in unmarked', async () => {
    mockedList.mockResolvedValue({ ...ownerView, members: [owner, admin] })
    renderPage()

    // The shell footer also names the signed-in owner, so wait for the row
    // only the table draws.
    await screen.findByText('Agency Admin')
    expect(screen.queryByText(/Issued |Email sent /)).not.toBeInTheDocument()
    expect(within(screen.getByRole('table')).getAllByText('Active')).toHaveLength(2)
  })

  it('fails closed when selected-workspace data names a different workspace', async () => {
    mockedList.mockResolvedValue({
      ...ownerView,
      workspace: {
        ...ownerView.workspace,
        id: otherWorkspaceId,
        name: 'Other Workspace',
      },
    })

    renderPage(workspaceId)

    expect(await screen.findByText('Workspace settings unavailable')).toBeInTheDocument()
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
        can_manage_client_branding: false,
        can_manage_workspace_name: false,
        can_update_roles: false,
        can_transfer_owner: false,
      },
      members: [
        { ...owner, allowed_actions: [] },
        { ...admin, allowed_actions: [] },
      ],
    })

    renderPage(workspaceId)

    expect(await screen.findByText('Workspace settings unavailable')).toBeInTheDocument()
    expect(screen.getByText('Platform-owner workspace management is not active on the backend yet.')).toBeInTheDocument()
    expect(screen.queryByText(/did not match the signed-in account/i)).not.toBeInTheDocument()
  })

  it('does not call the service for an invalid selected workspace address', async () => {
    renderPage('not-a-workspace')

    expect(screen.getByText('The workspace address is invalid.')).toBeInTheDocument()
    expect(mockedList).not.toHaveBeenCalled()
  })

  describe('on the default platform workspace', () => {
    const platformView: WorkspaceStaffView = {
      ...ownerView,
      workspace: { ...ownerView.workspace, is_default: true, name: 'Get On A Pod' },
      capabilities: {
        ...ownerView.capabilities,
        invite_roles: [],
        can_update_roles: false,
        can_transfer_owner: false,
      },
      members: [
        { ...owner, allowed_actions: [] },
        { ...admin, allowed_actions: [] },
      ],
    }

    beforeEach(() => {
      mockedUseAuth.mockReturnValue({
        user: { id: userId, email: 'owner@example.com', user_metadata: { full_name: 'Workspace Owner' } },
        workspace: {
          id: workspaceId,
          name: 'Get On A Pod',
          slug: 'get-on-a-pod',
          status: 'active',
          is_default: true,
        },
        isPlatformAdmin: true,
        membership: { id: ownerId, full_name: 'Workspace Owner', role: 'owner' },
        refreshAccount,
        refreshSession,
        signOut,
      } as never)
      mockedList.mockResolvedValue(platformView)
    })

    it('lets the platform workspace set its own client-facing brand', async () => {
      renderPage()
      // The workspace runs real clients, so the identity its prospects see is
      // its own to set rather than a platform default.
      expect(await screen.findByRole('heading', { name: 'Client branding' })).toBeInTheDocument()
      expect(screen.getByRole('heading', { name: 'General' })).toBeInTheDocument()
    })

    it('sends the platform roster to the platform tools instead of offering an invite', async () => {
      renderPage()
      await screen.findByRole('heading', { name: /^Team & access/ })
      expect(screen.queryByRole('button', { name: 'Invite member' })).not.toBeInTheDocument()
      const links = screen.getAllByRole('link', { name: /Manage workspaces/ })
      expect(links.length).toBeGreaterThan(0)
      for (const link of links) expect(link).toHaveAttribute('href', '/app/manage-workspaces')
    })

    it('offers no action on a platform operator account', async () => {
      renderPage()
      await screen.findByRole('heading', { name: /^Team & access/ })
      // Staff mutations are refused at the SQL root for this workspace, so a
      // button here would be a promise the database will not keep.
      expect(screen.queryByRole('button', { name: /More actions/ })).not.toBeInTheDocument()
    })
  })
})
