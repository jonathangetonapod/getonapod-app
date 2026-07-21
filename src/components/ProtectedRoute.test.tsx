import { render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { PlatformAdminRoute, ProtectedRoute } from '@/components/ProtectedRoute'
import { useAuth } from '@/contexts/AuthContext'

vi.mock('@/contexts/AuthContext', () => ({ useAuth: vi.fn() }))

const mockedUseAuth = vi.mocked(useAuth)

const Location = () => {
  const location = useLocation()
  return <div data-testid="location">{location.pathname}</div>
}

function renderProtected(accountState: string, options?: { user?: boolean; platformAdmin?: boolean }) {
  mockedUseAuth.mockReturnValue({
    accountState,
    accountError: null,
    isPlatformAdmin: options?.platformAdmin ?? false,
    refreshAccount: vi.fn(),
    signOut: vi.fn(),
    user: options?.user === false ? null : { email: 'user@example.com' },
  } as never)

  render(
    <MemoryRouter initialEntries={['/app/clients']} future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
      <Routes>
        <Route path="/login" element={<Location />} />
        <Route path="/change-password" element={<Location />} />
        <Route path="/app/clients" element={<ProtectedRoute><div>Private workspace</div></ProtectedRoute>} />
      </Routes>
    </MemoryRouter>,
  )
}

describe('ProtectedRoute', () => {
  beforeEach(() => mockedUseAuth.mockReset())

  it.each(['password_change_required', 'reauthentication_required'])(
    'routes %s accounts only to password setup',
    async (state) => {
      renderProtected(state)
      await waitFor(() => expect(screen.getByTestId('location')).toHaveTextContent('/change-password'))
      expect(screen.queryByText('Private workspace')).not.toBeInTheDocument()
    },
  )

  it('routes signed-out users to login', async () => {
    renderProtected('signed_out', { user: false })
    await waitFor(() => expect(screen.getByTestId('location')).toHaveTextContent('/login'))
  })

  it('does not render platform-only content for a tenant user', () => {
    mockedUseAuth.mockReturnValue({
      accountState: 'active',
      accountError: null,
      isPlatformAdmin: false,
      refreshAccount: vi.fn(),
      signOut: vi.fn(),
      user: { email: 'tenant@example.com' },
    } as never)
    render(
      <MemoryRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
        <PlatformAdminRoute><div>Platform secret</div></PlatformAdminRoute>
      </MemoryRouter>,
    )
    expect(screen.queryByText('Platform secret')).not.toBeInTheDocument()
    expect(screen.getByText('This area is limited to platform administrators.')).toBeInTheDocument()
  })
})
