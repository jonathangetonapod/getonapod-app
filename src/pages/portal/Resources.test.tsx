import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import PortalResources from '@/pages/portal/Resources'
import { useAuth } from '@/contexts/AuthContext'
import { useClientPortal } from '@/contexts/ClientPortalContext'
import { getPortalGuestResources, type PortalGuestResource } from '@/services/guestResources'

vi.mock('@/components/portal/PortalLayout', () => ({ PortalLayout: ({ children }: { children: React.ReactNode }) => <div>{children}</div> }))
vi.mock('@/contexts/AuthContext', () => ({ useAuth: vi.fn() }))
vi.mock('@/contexts/ClientPortalContext', () => ({ useClientPortal: vi.fn() }))
vi.mock('@/services/guestResources', () => ({ getPortalGuestResources: vi.fn() }))

const mockedUseAuth = vi.mocked(useAuth)
const mockedUseClientPortal = vi.mocked(useClientPortal)
const mockedGetResources = vi.mocked(getPortalGuestResources)

const firstClientId = '11111111-1111-4111-8111-111111111111'
const secondClientId = '22222222-2222-4222-8222-222222222222'

function portalResource(id: string, title: string): PortalGuestResource {
  return {
    id,
    title,
    description: `${title} description`,
    content: `${title} content`,
    category: 'preparation',
    type: 'article',
    url: null,
    file_url: null,
    featured: false,
    display_order: 0,
    published_at: '2026-07-21T00:00:00.000Z',
    updated_at: '2026-07-21T00:00:00.000Z',
  }
}

function renderPage(queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })) {
  const result = render(
    <QueryClientProvider client={queryClient}>
      <PortalResources />
    </QueryClientProvider>,
  )
  return { ...result, queryClient }
}

describe('PortalResources', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockedUseAuth.mockReturnValue({ isPlatformAdmin: false } as never)
    mockedUseClientPortal.mockReturnValue({
      client: { id: firstClientId, name: 'First Client' },
      session: {
        client_id: firstClientId,
        session_token: 'first-real-session',
        expires_at: '2026-07-22T00:00:00.000Z',
      },
      isImpersonating: false,
    } as never)
    mockedGetResources.mockImplementation(async ({ clientId }) => (
      clientId === firstClientId
        ? [portalResource('33333333-3333-4333-8333-333333333333', 'First client guide')]
        : [portalResource('44444444-4444-4444-8444-444444444444', 'Second client guide')]
    ))
  })

  it('invokes the hardened portal service with the real client session', async () => {
    renderPage()
    expect(await screen.findByText('First client guide')).toBeInTheDocument()
    expect(mockedGetResources).toHaveBeenCalledWith({
      clientId: firstClientId,
      sessionToken: 'first-real-session',
      platformAdminImpersonation: false,
    })
  })

  it('isolates query data when the portal client and session identity change', async () => {
    const rendered = renderPage()
    expect(await screen.findByText('First client guide')).toBeInTheDocument()

    mockedUseClientPortal.mockReturnValue({
      client: { id: secondClientId, name: 'Second Client' },
      session: {
        client_id: secondClientId,
        session_token: 'second-real-session',
        expires_at: '2026-07-23T00:00:00.000Z',
      },
      isImpersonating: false,
    } as never)
    rendered.rerender(
      <QueryClientProvider client={rendered.queryClient}>
        <PortalResources />
      </QueryClientProvider>,
    )

    expect(await screen.findByText('Second client guide')).toBeInTheDocument()
    expect(screen.queryByText('First client guide')).not.toBeInTheDocument()
    expect(mockedGetResources).toHaveBeenLastCalledWith({
      clientId: secondClientId,
      sessionToken: 'second-real-session',
      platformAdminImpersonation: false,
    })
    await waitFor(() => expect(mockedGetResources).toHaveBeenCalledTimes(2))
  })

  it('closes an open resource when the portal identity changes', async () => {
    const rendered = renderPage()
    const firstResource = await screen.findByRole('button', { name: 'Article: First client guide' })
    fireEvent.click(firstResource)
    expect(screen.getByText('First client guide content')).toBeInTheDocument()

    mockedUseClientPortal.mockReturnValue({
      client: { id: secondClientId, name: 'Second Client' },
      session: {
        client_id: secondClientId,
        session_token: 'second-real-session',
        expires_at: '2026-07-23T00:00:00.000Z',
      },
      isImpersonating: false,
    } as never)
    rendered.rerender(
      <QueryClientProvider client={rendered.queryClient}>
        <PortalResources />
      </QueryClientProvider>,
    )

    await waitFor(() => expect(screen.queryByText('First client guide content')).not.toBeInTheDocument())
  })

  it('supports keyboard resource activation and labels view controls', async () => {
    renderPage()
    const resourceCard = await screen.findByRole('button', { name: 'Article: First client guide' })
    expect(screen.getByRole('button', { name: 'Show resources in a grid' })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByRole('button', { name: 'Show resources in a list' })).toHaveAttribute('aria-pressed', 'false')
    expect(screen.getByRole('textbox', { name: 'Search guest resources' })).toBeInTheDocument()

    fireEvent.keyDown(resourceCard, { key: 'Enter' })
    expect(screen.getByText('First client guide content')).toBeInTheDocument()
  })

  it('omits a session only for a live platform-admin impersonation', async () => {
    mockedUseAuth.mockReturnValue({ isPlatformAdmin: true } as never)
    mockedUseClientPortal.mockReturnValue({
      client: { id: firstClientId, name: 'First Client' },
      session: null,
      isImpersonating: true,
    } as never)

    renderPage()
    expect(await screen.findByText('First client guide')).toBeInTheDocument()
    expect(mockedGetResources).toHaveBeenCalledWith({
      clientId: firstClientId,
      sessionToken: undefined,
      platformAdminImpersonation: true,
    })
  })
})
