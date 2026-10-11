import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { HelmetProvider } from 'react-helmet-async'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import PortalLogin from '@/pages/portal/Login'
import { ClientProtectedRoute } from '@/components/ClientProtectedRoute'
import { readPortalBrand, rememberPortalBrand } from '@/components/portal/portalBrandMemory'
import { useClientPortal } from '@/contexts/ClientPortalContext'
import { supabase } from '@/lib/supabase'

vi.mock('@/contexts/ClientPortalContext', () => ({ useClientPortal: vi.fn() }))
vi.mock('@/lib/supabase', () => ({ supabase: { functions: { invoke: vi.fn() } } }))

const mockedUseClientPortal = vi.mocked(useClientPortal)
const mockedInvoke = vi.mocked(supabase.functions.invoke)

const renderAt = (path: string) => render(
  <HelmetProvider>
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/portal/login" element={<PortalLogin />} />
        <Route path="/portal/dashboard" element={<ClientProtectedRoute><p>Dashboard</p></ClientProtectedRoute>} />
      </Routes>
    </MemoryRouter>
  </HelmetProvider>,
)

describe('PortalLogin white-label', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    window.sessionStorage.clear()
    mockedUseClientPortal.mockReturnValue({
      client: null,
      branding: null,
      loading: false,
      isImpersonating: false,
      loginWithPassword: vi.fn(),
    } as never)
  })

  it('names no one when no agency is known', async () => {
    renderAt('/portal/login')

    expect(await screen.findByText('Client portal')).toBeInTheDocument()
    expect(screen.getByText('Need help? Contact the team that invited you.')).toBeInTheDocument()
    expect(document.body.textContent).not.toMatch(/Get On A Pod|getonapod/iu)
    expect(document.querySelector('a[href="/"]')).toBeNull()
    expect(document.querySelector('a[href^="mailto:"]')).toBeNull()
    expect(screen.queryByText(/©/u)).not.toBeInTheDocument()
    expect(mockedInvoke).not.toHaveBeenCalled()
    await waitFor(() => expect(document.title).toBe('Client portal sign-in'))
    expect(document.querySelector('meta[name="application-name"]')?.getAttribute('content')).toBe('Client portal')
  })

  it('wears the agency resolved from ?b= and remembers it for the tab', async () => {
    mockedInvoke.mockResolvedValue({
      data: { metadata: { workspace: { name: 'Northstar Advisory', logo_url: 'https://cdn.example.com/logo.png', primary_color: '#16324F' } } },
      error: null,
    } as never)

    renderAt('/portal/login?b=dallas-fontaine-a0fd')

    expect(await screen.findByText('Northstar Advisory')).toBeInTheDocument()
    expect(screen.getByText('Need help? Contact your Northstar Advisory team.')).toBeInTheDocument()
    expect(mockedInvoke).toHaveBeenCalledWith('public-client-dashboard', expect.objectContaining({
      body: expect.objectContaining({ action: 'metadata', slug: 'dallas-fontaine-a0fd' }),
    }))
    expect(readPortalBrand()).toEqual({
      slug: 'dallas-fontaine-a0fd',
      name: 'Northstar Advisory',
      logo_url: 'https://cdn.example.com/logo.png',
      primary_color: '#16324F',
    })
    await waitFor(() => expect(document.querySelector('meta[name="application-name"]')?.getAttribute('content')).toBe('Northstar Advisory'))
  })

  it('keeps the remembered agency on a bare sign-in link', async () => {
    rememberPortalBrand({ name: 'Northstar Advisory', logo_url: null, primary_color: null })

    renderAt('/portal/login')

    expect(await screen.findByText('Northstar Advisory')).toBeInTheDocument()
    expect(document.body.textContent).not.toMatch(/Get On A Pod/iu)
  })

  it('sends an expired session back to the branded sign-in', async () => {
    mockedInvoke.mockResolvedValue({
      data: { metadata: { workspace: { name: 'Northstar Advisory', logo_url: null } } },
      error: null,
    } as never)
    rememberPortalBrand({ slug: 'dallas-fontaine-a0fd', name: 'Northstar Advisory' })

    renderAt('/portal/dashboard')

    expect(await screen.findByText('Northstar Advisory')).toBeInTheDocument()
    expect(mockedInvoke).toHaveBeenCalledWith('public-client-dashboard', expect.objectContaining({
      body: expect.objectContaining({ slug: 'dallas-fontaine-a0fd' }),
    }))
  })
})

describe('PortalLogin refusals', () => {
  const loginWithPassword = vi.fn()

  beforeEach(() => {
    vi.clearAllMocks()
    window.sessionStorage.clear()
    mockedUseClientPortal.mockReturnValue({
      client: null,
      branding: null,
      loading: false,
      isImpersonating: false,
      loginWithPassword,
    } as never)
  })

  const submitWith = async (failure: unknown) => {
    loginWithPassword.mockRejectedValueOnce(failure)
    renderAt('/portal/login')
    fireEvent.change(await screen.findByLabelText('Email'), { target: { value: 'taylor@example.com' } })
    fireEvent.change(screen.getByLabelText('Password'), { target: { value: 'wrong-password' } })
    fireEvent.click(screen.getByRole('button', { name: 'Sign in' }))
    return screen.findByRole('alert')
  }

  it('says the credentials do not match and marks both fields', async () => {
    const alert = await submitWith(Object.assign(new Error('Invalid email or password'), { code: 'INVALID_CREDENTIALS', status: 401 }))

    expect(alert).toHaveTextContent('That email and password do not match.')
    expect(alert.id).toBe('portal-login-error')
    for (const field of [screen.getByLabelText('Email'), screen.getByLabelText('Password')]) {
      expect(field).toHaveAttribute('aria-invalid', 'true')
      expect(field).toHaveAttribute('aria-describedby', 'portal-login-error')
    }
  })

  it('says the attempt limit was reached on the rate-limit code', async () => {
    const alert = await submitWith(Object.assign(new Error('Too many sign-in attempts.'), { code: 'LOGIN_RATE_LIMITED', status: 429 }))

    expect(alert).toHaveTextContent('Too many sign-in attempts. Wait a few minutes, then try again')
    expect(alert).not.toHaveTextContent('do not match')
    expect(screen.getByLabelText('Email')).not.toHaveAttribute('aria-invalid')
    expect(screen.getByLabelText('Email')).toHaveAttribute('aria-describedby', 'portal-login-error')
  })

  it('says the server could not be reached when the request never left', async () => {
    const alert = await submitWith(new Error('Failed to send a request to the Edge Function'))

    expect(alert).toHaveTextContent('Could not reach the server.')
  })

  it('says sign-in is unavailable on a server failure', async () => {
    const alert = await submitWith(Object.assign(new Error('Login is temporarily unavailable'), { code: 'LOGIN_UNAVAILABLE', status: 503 }))

    expect(alert).toHaveTextContent('Sign-in is temporarily unavailable.')
  })

  it('marks only the empty field when something is missing', async () => {
    renderAt('/portal/login')
    fireEvent.change(await screen.findByLabelText('Email'), { target: { value: 'taylor@example.com' } })
    fireEvent.click(screen.getByRole('button', { name: 'Sign in' }))

    expect(await screen.findByRole('alert')).toHaveTextContent('Enter your email and password.')
    expect(screen.getByLabelText('Email')).not.toHaveAttribute('aria-invalid')
    expect(screen.getByLabelText('Password')).toHaveAttribute('aria-invalid', 'true')
    expect(loginWithPassword).not.toHaveBeenCalled()
  })
})
