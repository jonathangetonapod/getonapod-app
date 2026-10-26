import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { getWorkspaceBillingOverview, grantWorkspaceCredits } from '@/services/workspaceStaff'
import { WorkspaceCreditGrantPreview } from '@/components/workspace/WorkspaceCreditGrantPreview'

const { toastSuccess } = vi.hoisted(() => ({ toastSuccess: vi.fn() }))
vi.mock('sonner', () => ({ toast: { error: vi.fn(), success: toastSuccess } }))
vi.mock('@/services/workspaceStaff', () => ({
  getWorkspaceBillingOverview: vi.fn(),
  grantWorkspaceCredits: vi.fn(),
}))

const mockedOverview = vi.mocked(getWorkspaceBillingOverview)
const mockedGrant = vi.mocked(grantWorkspaceCredits)
const workspaceId = '11111111-1111-4111-8111-111111111111'

const overview = {
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
}

function renderPanel(props: Partial<Parameters<typeof WorkspaceCreditGrantPreview>[0]> = {}) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  })
  render(
    <QueryClientProvider client={queryClient}>
      <WorkspaceCreditGrantPreview
        workspaceId={workspaceId}
        workspaceName="Acme Workspace"
        ownerName="Workspace Owner"
        ownerEmail="owner@example.com"
        {...props}
      />
    </QueryClientProvider>,
  )
}

describe('WorkspaceCreditGrantPreview', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockedOverview.mockResolvedValue(overview as never)
    mockedGrant.mockResolvedValue({ granted: 100, balance: 110 })
  })

  it('previews a manual credit grant with an explicit reason and confirmation', async () => {
    renderPanel()

    const section = await screen.findByRole('region', { name: 'Workspace credits' })
    const review = within(section).getByRole('button', { name: 'Review credit grant' })
    expect(review).toBeDisabled()

    fireEvent.click(within(section).getByRole('combobox', { name: 'Reason' }))
    fireEvent.click(await screen.findByRole('option', { name: 'Customer support' }))
    // No amount yet: the field starts empty, so a reason alone grants nothing.
    expect(review).toBeDisabled()
    fireEvent.click(within(section).getByRole('button', { name: 'Set credit amount to 100' }))
    // The note is optional; amount and reason arm the grant.
    expect(review).toBeEnabled()

    fireEvent.change(within(section).getByLabelText(/Internal note/), {
      target: { value: 'Onboarding courtesy for the new workspace.' },
    })
    fireEvent.click(review)

    const confirmation = screen.getByRole('alertdialog', { name: 'Add 100 credits to Acme Workspace?' })
    expect(within(confirmation).getByText('Workspace Owner')).toBeInTheDocument()
    expect(within(confirmation).getByText('Customer support')).toBeInTheDocument()
    fireEvent.click(within(confirmation).getByRole('button', { name: 'Add credits' }))

    await waitFor(() => expect(toastSuccess).toHaveBeenCalledWith('100 credits added to Acme Workspace.'))
    expect(mockedGrant).toHaveBeenCalledWith(workspaceId, {
      amount: 100,
      reason: 'customer_support',
      note: 'Onboarding courtesy for the new workspace.',
      grantKey: expect.stringMatching(/^[0-9a-f-]{36}$/u),
    })
    // Reset for the next grant, empty again.
    expect(within(section).getByLabelText('Credits to add')).toHaveValue(null)
  })

  // The credit goes to the workspace ledger, so an owner who has not accepted
  // their invite is a missing name, not a reason to refuse the grant.
  it('still offers the grant for a workspace with no owner on the roster', async () => {
    renderPanel({ ownerName: null, ownerEmail: null })

    const section = await screen.findByRole('region', { name: 'Workspace credits' })
    expect(within(section).getByText('Nobody has accepted the invite yet')).toBeInTheDocument()
    fireEvent.click(within(section).getByRole('combobox', { name: 'Reason' }))
    fireEvent.click(await screen.findByRole('option', { name: 'Customer support' }))
    fireEvent.change(within(section).getByLabelText('Credits to add'), { target: { value: '40' } })
    expect(within(section).getByRole('button', { name: 'Review credit grant' })).toBeEnabled()
  })

  it('starts with no amount, and quick amounts set it rather than add to it', async () => {
    renderPanel()

    const section = await screen.findByRole('region', { name: 'Workspace credits' })
    const field = within(section).getByLabelText('Credits to add')
    expect(field).toHaveValue(null)

    fireEvent.click(within(section).getByRole('button', { name: 'Set credit amount to 50' }))
    fireEvent.click(within(section).getByRole('button', { name: 'Set credit amount to 250' }))
    expect(field).toHaveValue(250)
    expect(within(section).getByRole('button', { name: 'Set credit amount to 250' })).toHaveAttribute('aria-pressed', 'true')
    expect(within(section).getByRole('button', { name: 'Set credit amount to 50' })).toHaveAttribute('aria-pressed', 'false')

    // A typed amount that matches one lights it up too.
    fireEvent.change(field, { target: { value: '25' } })
    expect(within(section).getByRole('button', { name: 'Set credit amount to 25' })).toHaveAttribute('aria-pressed', 'true')
  })

  // A double click on Add credits, or a retry after a timeout, is the same
  // grant. Each attempt carries the review's key so the ledger records one.
  it('sends the same key for every attempt within one review', async () => {
    mockedGrant.mockRejectedValueOnce(new Error('Network timeout'))
    renderPanel()

    const section = await screen.findByRole('region', { name: 'Workspace credits' })
    fireEvent.click(within(section).getByRole('button', { name: 'Set credit amount to 25' }))
    fireEvent.click(within(section).getByRole('combobox', { name: 'Reason' }))
    fireEvent.click(await screen.findByRole('option', { name: 'Customer support' }))
    fireEvent.click(within(section).getByRole('button', { name: 'Review credit grant' }))

    const confirmation = screen.getByRole('alertdialog')
    fireEvent.click(within(confirmation).getByRole('button', { name: 'Add credits' }))
    await waitFor(() => expect(mockedGrant).toHaveBeenCalledTimes(1))
    await waitFor(() => expect(within(confirmation).getByRole('button', { name: 'Add credits' })).toBeEnabled())
    fireEvent.click(within(confirmation).getByRole('button', { name: 'Add credits' }))
    await waitFor(() => expect(mockedGrant).toHaveBeenCalledTimes(2))

    const [first, second] = mockedGrant.mock.calls.map(([, input]) => input.grantKey)
    expect(first).toBe(second)
  })

  // The balance used to fall back to 0 when the read failed, and there are no
  // retries. An admin who topped this workspace up an hour ago would read the
  // 0 as the grant never landing, and grant a second time.
  it('does not report a balance of zero when the balance could not be read', async () => {
    mockedOverview.mockRejectedValue(new Error('Billing data could not be loaded.'))
    renderPanel()

    const section = await screen.findByRole('region', { name: 'Workspace credits' })
    expect(await within(section).findByText('Unavailable')).toBeInTheDocument()
    expect(within(section).queryByLabelText('0 credits available')).not.toBeInTheDocument()
    expect(within(section).getByText(/could not be read, so this cannot be projected/i)).toBeInTheDocument()
  })

  // While the balance is on its way, say so: the error used to show here
  // during loading, beside a card that went on to read 200.
  it('shows a loading state, not an error, until the balance resolves', async () => {
    let resolveOverview: (value: typeof overview) => void = () => {}
    mockedOverview.mockImplementation(() => new Promise((resolve) => { resolveOverview = resolve }))
    renderPanel()

    const section = await screen.findByRole('region', { name: 'Workspace credits' })
    expect(within(section).getByText('Reading the current balance…')).toBeInTheDocument()
    expect(within(section).queryByText(/could not be read/i)).not.toBeInTheDocument()

    resolveOverview({ ...overview, balance: 200 })
    expect(await within(section).findByLabelText('200 credits available')).toBeInTheDocument()
    expect(within(section).queryByText('Reading the current balance…')).not.toBeInTheDocument()
    expect(within(section).queryByText(/could not be read/i)).not.toBeInTheDocument()
  })

  // One fetch for every card on the page, so they cannot disagree.
  it('reads the balance through the shared billing overview query', async () => {
    mockedOverview.mockResolvedValue({ ...overview, balance: 200 })
    renderPanel()

    await screen.findByLabelText('200 credits available')
    expect(mockedOverview).toHaveBeenCalledTimes(1)
  })

  // Named after the workspace rather than the owner: a workspace called after
  // the person who owns it turned "granted to X, not to this person" into a
  // sentence that contradicted the card above it.
  it('names the workspace, not the owner, as what the credits belong to', async () => {
    renderPanel()

    const section = await screen.findByRole('region', { name: 'Workspace credits' })
    expect(within(section).getByText(/credits belong to the workspace, not to whoever owns it today/i))
      .toBeInTheDocument()
  })
})
