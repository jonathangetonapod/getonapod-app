import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen, within } from '@testing-library/react'
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useAuth } from '@/contexts/AuthContext'
import { getWorkspaceBillingOverview, listWorkspaceStaff } from '@/services/workspaceStaff'
import PlatformBillingWorkspace from '@/pages/app/PlatformBillingWorkspace'

vi.mock('@/contexts/AuthContext', () => ({ useAuth: vi.fn() }))
vi.mock('@/components/workspace/WorkspaceLayout', () => ({ WorkspaceLayout: ({ children }: { children: React.ReactNode }) => <div>{children}</div> }))
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }))
vi.mock('@/services/workspaceStaff', () => ({
  listWorkspaceStaff: vi.fn(),
  getWorkspaceBillingOverview: vi.fn(),
  grantWorkspaceCredits: vi.fn(),
  setWorkspaceMonthlyAllowance: vi.fn(),
  adjustWorkspaceCredits: vi.fn(),
}))

const mockedUseAuth = vi.mocked(useAuth)
const mockedStaff = vi.mocked(listWorkspaceStaff)
const mockedOverview = vi.mocked(getWorkspaceBillingOverview)
const samId = '33333333-3333-4333-8333-333333333333'

const Location = () => {
  const location = useLocation()
  return <div data-testid="location">{location.pathname}{location.search}</div>
}

function renderPage(state?: unknown) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter
        initialEntries={[{ pathname: `/app/platform/billing/workspaces/${samId}`, state }]}
        future={{ v7_startTransition: true, v7_relativeSplatPath: true }}
      >
        <Routes>
          <Route path="/app/platform/billing/workspaces/:workspaceId" element={<PlatformBillingWorkspace />} />
          <Route path="/app/platform/billing" element={<Location />} />
          <Route path="/app/clients" element={<Location />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

describe('PlatformBillingWorkspace', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockedUseAuth.mockReturnValue({
      isPlatformAdmin: true,
      user: { id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', email: 'jonathan@getonapod.com' },
    } as never)
    mockedStaff.mockResolvedValue({
      workspace: { id: samId, name: 'Sam Bylett' },
      members: [
        { role: 'owner', status: 'active', full_name: 'Sam Bylett', email: 'sam@quantisedmedia.com' },
      ],
    } as never)
    mockedOverview.mockResolvedValue({
      plan_key: 'founding_member',
      billing_status: 'trialing',
      base_price_cents: 2900,
      plan_base_price_cents: 4900,
      monthly_credit_allowance: 100,
      plan_monthly_credit_allowance: 100,
      balance: 200,
      expiring_credits: 0,
      next_expiry_at: null,
      usage_this_month: {},
      prices: {},
      recent_activity: [],
    } as never)
  })

  it('heads the page with the workspace, owner, plan, status and balance', async () => {
    renderPage()

    const header = (await screen.findByRole('heading', { level: 1, name: 'Sam Bylett' })).closest('header') as HTMLElement
    expect(within(header).getByText(/sam@quantisedmedia\.com/)).toBeInTheDocument()
    expect(within(header).getByText('Founding member')).toBeInTheDocument()
    expect(within(header).getByText('Trialing')).toBeInTheDocument()
    expect(await within(header).findByText('200')).toBeInTheDocument()
    expect(mockedStaff).toHaveBeenCalledWith(samId)
  })

  it('carries every per-workspace card', async () => {
    renderPage()

    expect(await screen.findByRole('region', { name: 'Workspace credits' })).toBeInTheDocument()
    expect(screen.getByText('Subscription')).toBeInTheDocument()
  })

  it('goes back to the list with the search and filter it was opened from', async () => {
    renderPage({ listSearch: '?filter=attention&q=sam' })

    expect(await screen.findByRole('link', { name: /All workspaces/ }))
      .toHaveAttribute('href', '/app/platform/billing?filter=attention&q=sam')
  })

  it('goes back to the plain list when opened directly', async () => {
    renderPage()

    expect(await screen.findByRole('link', { name: /All workspaces/ })).toHaveAttribute('href', '/app/platform/billing')
  })

  it('says so when the workspace cannot be loaded', async () => {
    mockedStaff.mockRejectedValue(new Error('Workspace not found'))
    renderPage()

    expect(await screen.findByRole('alert')).toHaveTextContent(/could not be loaded/i)
    expect(screen.queryByRole('region', { name: 'Workspace credits' })).not.toBeInTheDocument()
  })

  it('sends anyone who is not a platform admin away', () => {
    mockedUseAuth.mockReturnValue({ isPlatformAdmin: false, user: { id: 'x' } } as never)
    renderPage()

    expect(screen.getByTestId('location')).toHaveTextContent('/app/clients')
    expect(mockedStaff).not.toHaveBeenCalled()
  })
})
