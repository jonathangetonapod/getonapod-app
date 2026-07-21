import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { WorkspaceSwitcher } from '@/components/admin/WorkspaceSwitcher'
import { useAuth } from '@/contexts/AuthContext'
import { listAdminWorkspaces } from '@/services/adminWorkspaces'

vi.mock('@/contexts/AuthContext', () => ({ useAuth: vi.fn() }))
vi.mock('@/services/adminWorkspaces', () => ({ listAdminWorkspaces: vi.fn() }))

const mockedUseAuth = vi.mocked(useAuth)
const mockedList = vi.mocked(listAdminWorkspaces)

const Location = () => {
  const location = useLocation()
  return <div data-testid="location">{location.pathname}</div>
}

function renderSwitcher({
  initialPath = '/admin/dashboard',
  presentation = 'sidebar',
}: {
  initialPath?: string
  presentation?: 'sidebar' | 'toolbar'
} = {}) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={[initialPath]} future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
        <WorkspaceSwitcher presentation={presentation} />
        <Routes>
          <Route path="*" element={<Location />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

describe('WorkspaceSwitcher', () => {
  beforeEach(() => {
    mockedUseAuth.mockReturnValue({ isPlatformAdmin: true } as never)
    mockedList.mockResolvedValue([
      { id: '11111111-1111-4111-8111-111111111111', name: 'Acme', slug: 'acme-one', status: 'active', is_default: false },
      { id: '22222222-2222-4222-8222-222222222222', name: 'Bravo', slug: 'bravo-two', status: 'active', is_default: false },
    ])
  })

  it('navigates to an explicit admin workspace URL', async () => {
    renderSwitcher()
    const trigger = await screen.findByRole('combobox', { name: 'Select a client workspace to view' })
    fireEvent.click(trigger)
    fireEvent.click(await screen.findByText('Acme'))
    await waitFor(() => expect(screen.getByTestId('location')).toHaveTextContent(
      '/admin/workspaces/11111111-1111-4111-8111-111111111111/clients',
    ))
  })

  it('does not query or render for non-admin users', () => {
    mockedUseAuth.mockReturnValue({ isPlatformAdmin: false } as never)
    renderSwitcher()
    expect(screen.queryByRole('combobox')).not.toBeInTheDocument()
    expect(mockedList).not.toHaveBeenCalled()
  })

  it('shows the selected workspace in the compact preview toolbar', async () => {
    renderSwitcher({
      initialPath: '/admin/workspaces/22222222-2222-4222-8222-222222222222/clients',
      presentation: 'toolbar',
    })

    expect(await screen.findByRole('combobox', { name: 'Select a client workspace to view' })).toHaveTextContent('Bravo')
    expect(screen.queryByText('View client workspace')).not.toBeInTheDocument()
  })
})
