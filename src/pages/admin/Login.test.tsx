import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { HelmetProvider } from 'react-helmet-async'
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import Login from './Login'

const auth = {
  accountState: 'signed_out',
  accountError: null as string | null,
  isPlatformAdmin: false,
  refreshAccount: vi.fn(),
  signInWithGoogle: vi.fn(),
  signInWithPassword: vi.fn(),
  signOut: vi.fn(),
  user: null as { email: string } | null,
}

vi.mock('@/contexts/AuthContext', () => ({ useAuth: () => auth }))
vi.mock('@/lib/supabase', () => ({
  supabase: { auth: { resetPasswordForEmail: vi.fn().mockResolvedValue({}) } },
}))
vi.mock('sonner', () => ({ toast: { error: vi.fn(), success: vi.fn() } }))

import { supabase } from '@/lib/supabase'
import { toast } from 'sonner'

function renderLogin(path = '/login') {
  return render(
    <HelmetProvider>
      <MemoryRouter initialEntries={[path]}><Login /></MemoryRouter>
    </HelmetProvider>,
  )
}

describe('Login', () => {
  beforeEach(() => {
    auth.accountState = 'signed_out'
    auth.accountError = null
    auth.isPlatformAdmin = false
    auth.user = null
    auth.signInWithPassword.mockReset().mockResolvedValue(undefined)
    auth.signInWithGoogle.mockReset().mockResolvedValue(undefined)
    auth.signOut.mockReset()
    auth.refreshAccount.mockReset()
    vi.mocked(toast.error).mockReset()
    vi.mocked(supabase.auth.resetPasswordForEmail).mockReset().mockResolvedValue({} as never)
  })

  it('signs in with the email and password given', async () => {
    renderLogin()
    fireEvent.change(screen.getByLabelText('Email'), { target: { value: ' dana@example.com ' } })
    fireEvent.change(screen.getByLabelText('Password'), { target: { value: 'hunter2' } })
    fireEvent.click(screen.getByRole('button', { name: 'Sign in' }))

    await waitFor(() => expect(auth.signInWithPassword).toHaveBeenCalledWith('dana@example.com', 'hunter2'))
  })

  it('offers the way in for someone who has no account', () => {
    renderLogin()
    expect(screen.getByRole('link', { name: 'Request to join' })).toHaveAttribute('href', '/register')
  })

  // Clients of an agency have their own door; a client who followed a link
  // here used to see a form that could never let them in.
  it('points clients at the portal sign-in', () => {
    renderLogin()
    expect(screen.getByRole('link', { name: 'Sign in to your client portal.' })).toHaveAttribute('href', '/portal/login')
    expect(screen.getByText('Get On A Pod staff')).toBeInTheDocument()
    expect(screen.getByText(/workspace members sign in with email and password above/iu)).toBeInTheDocument()
  })

  // The password-change page already knows the address; typing it twice is a
  // chore and a chance for a typo.
  it('prefills the email the password-change page handed over', () => {
    render(
      <HelmetProvider>
        <MemoryRouter initialEntries={[{ pathname: '/login', state: { passwordChanged: true, email: 'dana@example.com' } }]}>
          <Login />
        </MemoryRouter>
      </HelmetProvider>,
    )
    expect(screen.getByLabelText('Email')).toHaveValue('dana@example.com')
    expect(screen.getByRole('status')).toHaveTextContent(/password changed/iu)
  })

  // The toggle used to claim "Show password" while the password was showing.
  it('says what the reveal toggle will do, not what it already did', () => {
    renderLogin()
    const toggle = screen.getByRole('button', { name: 'Show password' })
    expect(screen.getByLabelText('Password')).toHaveAttribute('type', 'password')
    fireEvent.click(toggle)
    expect(screen.getByLabelText('Password')).toHaveAttribute('type', 'text')
    expect(screen.getByRole('button', { name: 'Hide password' })).toBeInTheDocument()
  })

  /*
   * Google is the platform-admin door, and it used to appear only on /admin
   * paths. An administrator whose account was created through Google has no
   * password to type, so bookmarking /login — or being bounced there from an
   * /app route — left them looking at a form they could not use, with no way
   * through. Showing it everywhere costs a tenant one quiet line they will not
   * press; hiding it cost an admin the only door they have.
   */
  it('offers admin sign-in wherever the sign-in form is', () => {
    const { unmount } = renderLogin('/login')
    expect(screen.getByRole('button', { name: /continue with google/iu })).toBeInTheDocument()
    unmount()

    renderLogin('/admin/login')
    expect(screen.getByRole('button', { name: /continue with google/iu })).toBeInTheDocument()
  })

  // Sending a reset hid the control, so a typo in the address could only be
  // corrected by reloading the page.
  it('offers the reset again once the address is changed', async () => {
    renderLogin()
    fireEvent.change(screen.getByLabelText('Email'), { target: { value: 'wrong@example.com' } })
    fireEvent.click(screen.getByRole('button', { name: 'Forgot password?' }))

    await screen.findByText(/a password reset link is on the way/iu)
    expect(screen.queryByRole('button', { name: 'Forgot password?' })).toBeNull()

    fireEvent.change(screen.getByLabelText('Email'), { target: { value: 'right@example.com' } })
    expect(screen.getByRole('button', { name: 'Forgot password?' })).toBeInTheDocument()
  })

  it('sends the reset to the address typed, pointed at this app', async () => {
    renderLogin()
    fireEvent.change(screen.getByLabelText('Email'), { target: { value: ' dana@example.com ' } })
    fireEvent.click(screen.getByRole('button', { name: 'Forgot password?' }))

    await waitFor(() => expect(supabase.auth.resetPasswordForEmail).toHaveBeenCalledWith(
      'dana@example.com',
      { redirectTo: `${window.location.origin}/reset-password` },
    ))
    expect(await screen.findByText(/if that email has an account/iu)).toBeInTheDocument()
  })

  // The neutral answer is the point: a different reply for an unknown address
  // turns this button into a way to test whether someone has an account.
  it('answers the same way when the reset fails as when it succeeds', async () => {
    vi.mocked(supabase.auth.resetPasswordForEmail).mockRejectedValueOnce(new Error('User not found'))
    renderLogin()
    fireEvent.change(screen.getByLabelText('Email'), { target: { value: 'nobody@example.com' } })
    fireEvent.click(screen.getByRole('button', { name: 'Forgot password?' }))

    expect(await screen.findByText(/if that email has an account/iu)).toBeInTheDocument()
    expect(toast.error).not.toHaveBeenCalled()
  })

  it('does not claim a link is on the way when no address was given', () => {
    renderLogin()
    fireEvent.click(screen.getByRole('button', { name: 'Forgot password?' }))

    expect(supabase.auth.resetPasswordForEmail).not.toHaveBeenCalled()
    expect(screen.queryByText(/if that email has an account/iu)).toBeNull()
    expect(screen.getByRole('alert')).toHaveTextContent(/enter your email above/iu)
    expect(toast.error).not.toHaveBeenCalled()
  })

  // Supabase distinguishes "wrong password" from "no such user"; surfacing that
  // difference would turn the sign-in form into an enumeration oracle.
  it('says the same thing for a wrong password and an unknown account', async () => {
    renderLogin()
    const said: string[] = []
    for (const reason of ['Invalid login credentials', 'User not found', 'Email not confirmed']) {
      auth.signInWithPassword.mockRejectedValueOnce(new Error(reason))
      // Typing clears the last verdict, so each attempt's alert is its own.
      fireEvent.change(screen.getByLabelText('Email'), { target: { value: 'dana@example.com' } })
      fireEvent.change(screen.getByLabelText('Password'), { target: { value: `whatever-${reason}` } })
      expect(screen.queryByRole('alert')).toBeNull()
      fireEvent.click(screen.getByRole('button', { name: 'Sign in' }))
      said.push((await screen.findByRole('alert')).textContent)
    }
    expect(said).toHaveLength(3)
    expect(new Set(said)).toEqual(new Set(['Invalid email or password.']))
    // Said under the button, where the eye is, not in a toast that leaves.
    expect(toast.error).not.toHaveBeenCalled()
  })

  // A request that never reached a server is about the connection, not about
  // whether the account exists, so it may say so.
  it('distinguishes a connection failure, which reveals nothing about the account', async () => {
    auth.signInWithPassword.mockRejectedValueOnce(new TypeError('Failed to fetch'))
    renderLogin()
    fireEvent.change(screen.getByLabelText('Email'), { target: { value: 'dana@example.com' } })
    fireEvent.change(screen.getByLabelText('Password'), { target: { value: 'whatever' } })
    fireEvent.click(screen.getByRole('button', { name: 'Sign in' }))

    expect(await screen.findByRole('alert')).toHaveTextContent('Could not reach the server. Try again.')
  })

  it('still reports a Google failure as a toast, since that flow leaves the page', async () => {
    auth.signInWithGoogle.mockRejectedValueOnce(new Error('popup closed'))
    renderLogin()
    fireEvent.click(screen.getByRole('button', { name: /continue with google/iu }))

    await waitFor(() => expect(toast.error).toHaveBeenCalled())
  })

  // A deep link like /app/clients?client=abc was bounced to sign-in and came
  // back without its query, landing on the list instead of the client.
  it('returns to the attempted path with its query after sign-in', async () => {
    auth.user = { email: 'dana@example.com' }
    auth.accountState = 'active'
    const Landing = () => <p>Landed on {useLocation().pathname + useLocation().search}</p>
    render(
      <HelmetProvider>
        <MemoryRouter initialEntries={[{ pathname: '/login', state: { from: { pathname: '/app/clients', search: '?client=abc' } } }]}>
          <Routes>
            <Route path="/login" element={<Login />} />
            <Route path="/app/clients" element={<Landing />} />
          </Routes>
        </MemoryRouter>
      </HelmetProvider>,
    )

    expect(await screen.findByText('Landed on /app/clients?client=abc')).toBeInTheDocument()
  })

  // The OAuth round trip drops router state, so the destination is parked in
  // sessionStorage for the callback page to pick up.
  it('stashes the attempted path before starting Google sign-in', async () => {
    sessionStorage.removeItem('goap.post-login-path')
    render(
      <HelmetProvider>
        <MemoryRouter initialEntries={[{ pathname: '/login', state: { from: { pathname: '/admin/clients', search: '?client=abc' } } }]}>
          <Login />
        </MemoryRouter>
      </HelmetProvider>,
    )
    fireEvent.click(screen.getByRole('button', { name: /continue with google/iu }))

    await waitFor(() => expect(auth.signInWithGoogle).toHaveBeenCalled())
    expect(sessionStorage.getItem('goap.post-login-path')).toBe('/admin/clients?client=abc')
    sessionStorage.removeItem('goap.post-login-path')
  })

  it('explains a suspended account rather than looping the sign-in form', () => {
    auth.user = { email: 'dana@example.com' }
    auth.accountState = 'suspended'
    renderLogin()

    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent(/access unavailable/iu)
    expect(screen.getByText(/suspended/iu)).toBeInTheDocument()
    expect(screen.getByText(/dana@example.com/u)).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: /sign in with another account/iu }))
    expect(auth.signOut).toHaveBeenCalled()
  })
})
