import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useAuth } from '@/contexts/AuthContext'
import { createWorkspaceBillingPortal, createWorkspaceSubscriptionCheckout, getWorkspaceSubscriptionOverview } from '@/services/workspaceStaff'
import WorkspaceBilling from './WorkspaceBilling'

vi.mock('@/components/workspace/LegacyCreditReview', () => ({ LegacyCreditReview: () => null }))
vi.mock('@/contexts/AuthContext', () => ({ useAuth: vi.fn() }))
vi.mock('@/components/workspace/WorkspaceLayout', () => ({ WorkspaceLayout: ({ children }: { children: React.ReactNode }) => <div>{children}</div> }))
vi.mock('@/components/workspace/WorkspaceAiKeysCard', () => ({ WorkspaceAiKeysCard: () => <div>Connect provider accounts</div> }))
vi.mock('sonner', () => ({ toast: { info: vi.fn(), success: vi.fn(), error: vi.fn() } }))
vi.mock('@/services/workspaceStaff', () => ({ getWorkspaceSubscriptionOverview: vi.fn(), createWorkspaceBillingPortal: vi.fn(), createWorkspaceSubscriptionCheckout: vi.fn() }))
const workspaceId = '11111111-1111-4111-8111-111111111111'
const fixture = { plan_key: 'standard', billing_status: 'trialing', has_subscription: false, has_billing_customer: false, plan_base_price_cents: 9900, subscription_price_cents: null, trial_ends_at: '2099-01-01T00:00:00Z', cancel_at_period_end: false, current_period_end: null }
function renderPage(path = '/app/settings/billing') {
  return render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}><MemoryRouter initialEntries={[path]}><Routes><Route path="/app/settings/billing" element={<WorkspaceBilling />} /><Route path="/app/clients" element={<div>Client list</div>} /></Routes></MemoryRouter></QueryClientProvider>)
}
beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(useAuth).mockReturnValue({ canManageWorkspaceStaff: true, isPlatformAdmin: false, user: { id: 'u' }, workspace: { id: workspaceId }, membership: { role: 'owner' } } as never)
  vi.mocked(getWorkspaceSubscriptionOverview).mockResolvedValue(fixture)
  // Reject before navigating; jsdom does not implement external navigation.
  vi.mocked(createWorkspaceSubscriptionCheckout).mockRejectedValue(new Error('Payments unavailable'))
  vi.mocked(createWorkspaceBillingPortal).mockRejectedValue(new Error('Payments unavailable'))
})
describe('flat subscription billing portal', () => {
  it('offers one workspace subscription and explains provider billing without credit controls', async () => {
    renderPage()
    expect(await screen.findByText('$99')).toBeInTheDocument()
    expect(screen.getByText('Unlimited clients')).toBeInTheDocument()
    expect(screen.getByText('Unlimited team members')).toBeInTheDocument()
    expect(screen.getByText('Connect provider accounts')).toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: /buy credits/i })).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Start subscription' }))
    await waitFor(() => expect(createWorkspaceSubscriptionCheckout).toHaveBeenCalledWith(workspaceId, 'standard'))
    expect(screen.getByRole('button', { name: 'Start subscription' })).toBeEnabled()
  })
  it('preserves a subscriber’s actual founding price and opens Stripe for invoices', async () => {
    vi.mocked(getWorkspaceSubscriptionOverview).mockResolvedValue({ ...fixture, plan_key: 'founding_member', billing_status: 'active', has_subscription: true, subscription_price_cents: 3900 })
    renderPage()
    expect(await screen.findByText('$39')).toBeInTheDocument()
    expect(screen.getByText('Founding member price')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'View invoices' }))
    await waitFor(() => expect(createWorkspaceBillingPortal).toHaveBeenCalledWith(workspaceId))
    expect(createWorkspaceSubscriptionCheckout).not.toHaveBeenCalled()
  })
  it('does not present the catalog price as a legacy subscriber’s actual price on Stripe failure', async () => {
    vi.mocked(getWorkspaceSubscriptionOverview).mockResolvedValue({ ...fixture, has_subscription: true, billing_status: 'active' })
    renderPage()
    expect(await screen.findByText(/Price unavailable/)).toBeInTheDocument()
    expect(screen.queryByText('$99')).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Manage subscription' })).toBeEnabled()
  })
  it('keeps receipts accessible to former subscribers with a billing customer', async () => {
    vi.mocked(getWorkspaceSubscriptionOverview).mockResolvedValue({ ...fixture, billing_status: 'suspended', has_billing_customer: true })
    renderPage()
    expect(await screen.findByRole('button', { name: 'View invoices' })).toBeEnabled()
    expect(screen.getByRole('button', { name: 'Start subscription' })).toBeEnabled()
  })
  it('does not offer a paid subscription to complimentary workspaces', async () => {
    vi.mocked(getWorkspaceSubscriptionOverview).mockResolvedValue({ ...fixture, billing_status: 'comped' })
    renderPage()
    expect(await screen.findByText('$0')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Start subscription' })).not.toBeInTheDocument()
  })
  it('shows cancellation timing and trial expiry explicitly', async () => {
    vi.mocked(getWorkspaceSubscriptionOverview).mockResolvedValue({ ...fixture, has_subscription: true, billing_status: 'active', cancel_at_period_end: true, current_period_end: '2099-02-01T00:00:00Z' })
    renderPage()
    expect(await screen.findByText(/It will not renew/)).toBeInTheDocument()
  })
  it('does not treat a forged success URL as a confirmed payment', async () => {
    renderPage('/app/settings/billing?plan=updated')
    expect(await screen.findByText('Checking your subscription with Stripe…')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Start subscription' })).toBeDisabled()
    expect(createWorkspaceSubscriptionCheckout).not.toHaveBeenCalled()
  })
  it('clears pending checkout after a late confirmation is found by refreshing', async () => {
    vi.useFakeTimers()
    try {
      renderPage('/app/settings/billing?plan=updated')
      await act(async () => { await vi.advanceTimersByTimeAsync(100) })
      expect(screen.getByText('Checking your subscription with Stripe…')).toBeInTheDocument()
      await act(async () => { await vi.advanceTimersByTimeAsync(60_100) })
      expect(screen.getByText(/Your subscription is not confirmed yet/)).toBeInTheDocument()
      expect(screen.getByRole('button', { name: 'Start subscription' })).toBeDisabled()
      vi.mocked(getWorkspaceSubscriptionOverview).mockResolvedValue({ ...fixture, billing_status: 'active', has_subscription: true, subscription_price_cents: 9900 })
      fireEvent.click(screen.getByRole('button', { name: 'Refresh' }))
      await act(async () => { await vi.advanceTimersByTimeAsync(100) })
      expect(screen.getByRole('button', { name: 'Manage subscription' })).toBeEnabled()
      expect(screen.queryByText(/Your subscription is not confirmed yet/)).not.toBeInTheDocument()
    } finally {
      vi.useRealTimers()
    }
  })
  it('acknowledges an abandoned checkout without claiming a payment result', async () => {
    renderPage('/app/settings/billing?plan=cancelled')
    expect(await screen.findByText(/Checkout wasn’t completed/)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Start subscription' })).toBeEnabled()
    expect(createWorkspaceSubscriptionCheckout).not.toHaveBeenCalled()
  })
  it('makes payment recovery the primary action for a past-due subscription', async () => {
    vi.mocked(getWorkspaceSubscriptionOverview).mockResolvedValue({ ...fixture, billing_status: 'past_due', has_subscription: true, subscription_price_cents: 9900 })
    renderPage()
    fireEvent.click(await screen.findByRole('button', { name: 'Update payment method' }))
    await waitFor(() => expect(createWorkspaceBillingPortal).toHaveBeenCalledWith(workspaceId))
    expect(createWorkspaceSubscriptionCheckout).not.toHaveBeenCalled()
  })
  it('shows a recovery state when the overview fails', async () => {
    vi.mocked(getWorkspaceSubscriptionOverview).mockRejectedValue(new Error('offline'))
    renderPage()
    expect(await screen.findByRole('alert')).toHaveTextContent('couldn’t load')
    expect(screen.getByRole('button', { name: 'Try again' })).toBeEnabled()
  })
  it('redirects members without requesting billing details', async () => {
    vi.mocked(useAuth).mockReturnValue({ canManageWorkspaceStaff: false, workspace: { id: workspaceId } } as never)
    renderPage('/app/settings/billing?plan=updated')
    expect(await screen.findByText('Client list')).toBeInTheDocument()
    expect(getWorkspaceSubscriptionOverview).not.toHaveBeenCalled()
  })
  it('lets admins manage billing but reserves provider credentials for owners', async () => {
    vi.mocked(useAuth).mockReturnValue({ canManageWorkspaceStaff: true, workspace: { id: workspaceId }, membership: { role: 'admin' } } as never)
    renderPage()
    expect(await screen.findByText(/Ask your workspace owner/)).toBeInTheDocument()
    expect(screen.queryByText('Connect provider accounts')).not.toBeInTheDocument()
  })
})
