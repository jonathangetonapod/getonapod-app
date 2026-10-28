import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { fireEvent, render, screen } from '@testing-library/react'
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useAuth } from '@/contexts/AuthContext'
import { getBillingPortfolio, listBillingPlans } from '@/services/workspaceStaff'
import PlatformBilling from '@/pages/app/PlatformBilling'

vi.mock('@/components/workspace/LegacyCreditReview', () => ({ LegacyCreditReviewQueue: () => null }))
vi.mock('@/contexts/AuthContext', () => ({ useAuth: vi.fn() }))
vi.mock('@/components/workspace/WorkspaceLayout', () => ({ WorkspaceLayout: ({ children }: { children: React.ReactNode }) => <div>{children}</div> }))
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }))
vi.mock('@/services/workspaceStaff', () => ({
  listBillingPlans: vi.fn(),
  updateBillingPlanPrice: vi.fn(),
  getBillingPortfolio: vi.fn(),
}))

const mockedUseAuth = vi.mocked(useAuth)
const mockedPlans = vi.mocked(listBillingPlans)
const mockedPortfolio = vi.mocked(getBillingPortfolio)
const adminWorkspaceId = '11111111-1111-4111-8111-111111111111'
const northwindId = '22222222-2222-4222-8222-222222222222'

const Location = () => {
  const location = useLocation()
  return (
    <div data-testid="location">
      {location.pathname}{location.search}|{JSON.stringify(location.state)}
    </div>
  )
}

function renderPage(initialEntry = '/app/platform/billing') {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={[initialEntry]} future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
        <Routes>
          <Route path="/app/platform/billing" element={<PlatformBilling />} />
          <Route path="/app/platform/billing/workspaces/:workspaceId" element={<Location />} />
          <Route path="/app/clients" element={<Location />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

const asAdmin = () => mockedUseAuth.mockReturnValue({
  isPlatformAdmin: true,
  user: { id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', email: 'jonathan@getonapod.com' },
  workspace: { id: adminWorkspaceId },
} as never)

describe('PlatformBilling', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockedPlans.mockResolvedValue([
      { plan_key: 'founding_member', display_name: 'Founding member', base_price_cents: 3900, monthly_credit_allowance: 100, stripe_price_id: 'price_x', is_purchasable: true },
    ] as never)
    mockedPortfolio.mockResolvedValue({
      enforcementEnabled: true,
      workspaces: [{
        workspace_id: northwindId,
        name: 'Northwind Agency',
        billing_status: 'trialing',
        plan_key: 'founding_member',
        monthly_credit_allowance: 100,
        balance: 200,
        credits_spent_this_month: 0,
        has_subscription: false,
        cancel_at_period_end: false,
        current_period_end: null,
      }],
    })
  })

  it('carries plan pricing and the workspace list, and no workspace dropdown', async () => {
    asAdmin()
    renderPage()

    expect(await screen.findByRole('heading', { name: 'Plan pricing' })).toBeInTheDocument()
    expect(await screen.findByText('Northwind Agency')).toBeInTheDocument()
    expect(mockedPortfolio).toHaveBeenCalledWith(adminWorkspaceId)
    expect(screen.queryByText('Top up a workspace')).not.toBeInTheDocument()
    expect(screen.queryByRole('combobox', { name: 'Workspace' })).not.toBeInTheDocument()
  })

  // The back link on the workspace page returns to this exact list.
  it('opens a workspace on its own page, handing over the search and filter', async () => {
    asAdmin()
    renderPage('/app/platform/billing?filter=trialing&q=north')

    fireEvent.click(await screen.findByText('Northwind Agency'))
    expect(screen.getByTestId('location')).toHaveTextContent(
      `/app/platform/billing/workspaces/${northwindId}|{"listSearch":"?filter=trialing&q=north"}`,
    )
  })

  // The credits chip in a tenant's shell used to link here with the tenant in
  // the address; those links still land on that agency.
  it('sends an address naming a workspace to that workspace page', () => {
    asAdmin()
    renderPage(`/app/platform/billing?workspace=${northwindId.toUpperCase()}`)

    expect(screen.getByTestId('location')).toHaveTextContent(`/app/platform/billing/workspaces/${northwindId}`)
  })

  it('ignores a workspace parameter that is not an id', async () => {
    asAdmin()
    renderPage('/app/platform/billing?workspace=not-a-workspace')

    expect(await screen.findByRole('heading', { name: 'Plan pricing' })).toBeInTheDocument()
  })

  it('leads back to the workspace own billing', async () => {
    asAdmin()
    renderPage()

    expect(await screen.findByRole('link', { name: /Your own billing/ }))
      .toHaveAttribute('href', '/app/settings/billing')
  })

  // Setting what every workspace pays is not a tenant capability. The edge
  // actions refuse a non-admin anyway, so rendering the page would only build
  // a screen whose every button 403s.
  it('sends anyone who is not a platform admin away', () => {
    mockedUseAuth.mockReturnValue({ isPlatformAdmin: false, user: { id: 'x' } } as never)
    renderPage()

    expect(screen.getByTestId('location')).toHaveTextContent('/app/clients')
    expect(mockedPlans).not.toHaveBeenCalled()
    expect(mockedPortfolio).not.toHaveBeenCalled()
  })
})
