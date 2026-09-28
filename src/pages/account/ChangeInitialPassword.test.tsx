import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { HelmetProvider } from 'react-helmet-async'
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import ChangeInitialPassword from '@/pages/account/ChangeInitialPassword'
import { useAuth } from '@/contexts/AuthContext'
import { supabase } from '@/lib/supabase'
import { changeInitialPassword } from '@/services/workspaceUsers'

vi.mock('@/contexts/AuthContext', () => ({ useAuth: vi.fn() }))
vi.mock('@/services/workspaceUsers', () => ({ changeInitialPassword: vi.fn() }))
vi.mock('@/lib/queryClient', () => ({ queryClient: { clear: vi.fn() } }))
vi.mock('@/lib/supabase', () => ({
  supabase: { auth: { signOut: vi.fn().mockResolvedValue({ error: null }) } },
}))

const mockedUseAuth = vi.mocked(useAuth)
const mockedChange = vi.mocked(changeInitialPassword)
const mockedLocalSignOut = vi.mocked(supabase.auth.signOut)

const Location = () => {
  const location = useLocation()
  return (
    <>
      <div data-testid="location">{location.pathname}</div>
      <div data-testid="location-state">{JSON.stringify(location.state)}</div>
    </>
  )
}

function renderPage() {
  // The page sets its own document title now, which needs the provider the app
  // wraps everything in.
  render(
    <HelmetProvider>
      <MemoryRouter
        initialEntries={['/change-password']}
        future={{ v7_startTransition: true, v7_relativeSplatPath: true }}
      >
        <Routes>
          <Route path="/change-password" element={<ChangeInitialPassword />} />
          <Route path="/login" element={<Location />} />
          <Route path="/app/clients" element={<Location />} />
        </Routes>
      </MemoryRouter>
    </HelmetProvider>,
  )
}

function authState(state: string, options?: { membership?: boolean; error?: string | null }) {
  mockedUseAuth.mockReturnValue({
    accountError: options?.error ?? null,
    accountState: state,
    membership: options?.membership === false ? null : {
      id: '11111111-1111-4111-8111-111111111111',
    },
    signOut: vi.fn().mockResolvedValue(undefined),
    user: { email: 'owner@example.com' },
  } as never)
}

describe('ChangeInitialPassword', () => {
  beforeEach(() => {
    mockedChange.mockReset()
    mockedLocalSignOut.mockClear()
  })

  it('changes the password, clears the local session, and requires a fresh sign-in', async () => {
    authState('password_change_required')
    mockedChange.mockResolvedValue(undefined)
    renderPage()

    fireEvent.change(screen.getByLabelText('New password'), { target: { value: 'Private Password 42!' } })
    fireEvent.change(screen.getByLabelText('Confirm new password'), { target: { value: 'Private Password 42!' } })
    fireEvent.click(screen.getByRole('button', { name: 'Change password' }))

    await waitFor(() => expect(mockedChange).toHaveBeenCalledWith(expect.objectContaining({
      membership_id: '11111111-1111-4111-8111-111111111111',
      new_password: 'Private Password 42!',
    })))
    await waitFor(() => expect(screen.getByTestId('location')).toHaveTextContent('/login'))
    expect(mockedLocalSignOut).toHaveBeenCalledWith({ scope: 'local' })
    // The login form prefills the account that was just secured.
    expect(JSON.parse(screen.getByTestId('location-state').textContent || '{}')).toEqual({
      passwordChanged: true,
      email: 'owner@example.com',
    })
  })

  it('explains the rules in plain words, before and after a wrong guess', () => {
    authState('password_change_required')
    renderPage()

    expect(screen.getByText('12 to 72 characters, with at least one capital letter, one number and one symbol.')).toBeInTheDocument()
    expect(screen.getByText(/For security you will sign in once more with your new password\./)).toBeInTheDocument()

    fireEvent.change(screen.getByLabelText('New password'), { target: { value: 'Short1!' } })
    fireEvent.change(screen.getByLabelText('Confirm new password'), { target: { value: 'Short1!' } })
    fireEvent.click(screen.getByRole('button', { name: 'Change password' }))
    expect(screen.getByRole('alert')).toHaveTextContent('Passwords need at least 12 characters.')

    fireEvent.change(screen.getByLabelText('New password'), { target: { value: 'Tmp-Private Password 42!' } })
    fireEvent.change(screen.getByLabelText('Confirm new password'), { target: { value: 'Tmp-Private Password 42!' } })
    fireEvent.click(screen.getByRole('button', { name: 'Change password' }))
    expect(screen.getByRole('alert')).toHaveTextContent('Choose a password that does not start with Tmp-.')

    fireEvent.change(screen.getByLabelText('New password'), { target: { value: `Aa1!${'x'.repeat(80)}` } })
    fireEvent.change(screen.getByLabelText('Confirm new password'), { target: { value: `Aa1!${'x'.repeat(80)}` } })
    fireEvent.click(screen.getByRole('button', { name: 'Change password' }))
    expect(screen.getByRole('alert')).toHaveTextContent('Passwords can be at most 72 characters.')
    expect(mockedChange).not.toHaveBeenCalled()
  })

  it('clears a stale credential session when the backend requires reauthentication', async () => {
    authState('password_change_required')
    const stale = new Error('Sign in again with the newest temporary password')
    stale.name = 'REAUTHENTICATION_REQUIRED'
    mockedChange.mockRejectedValue(stale)
    renderPage()

    fireEvent.change(screen.getByLabelText('New password'), { target: { value: 'Private Password 42!' } })
    fireEvent.change(screen.getByLabelText('Confirm new password'), { target: { value: 'Private Password 42!' } })
    fireEvent.click(screen.getByRole('button', { name: 'Change password' }))

    await waitFor(() => expect(screen.getByTestId('location')).toHaveTextContent('/login'))
    expect(mockedLocalSignOut).toHaveBeenCalledWith({ scope: 'local' })
  })

  it('renders an actionable expired state instead of a blank page', async () => {
    authState('expired')
    renderPage()

    expect(screen.getByText(/temporary password has expired\. Ask whoever set up your account for a new one\./i)).toBeInTheDocument()
    // The old assertion was toBeEnabled(), which could never fail: the button's
    // disabled prop is `submitting`, and that is false at first render. Assert
    // the outcome a person would notice — leaving the dead end for sign-in —
    // rather than which of the two sign-out paths ran.
    fireEvent.click(screen.getByRole('button', { name: /sign in with another account/i }))
    await waitFor(() => expect(screen.getByTestId('location')).toHaveTextContent('/login'))
  })
})
