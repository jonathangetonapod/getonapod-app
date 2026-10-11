import { render, screen } from '@testing-library/react'
import { HelmetProvider } from 'react-helmet-async'
import { MemoryRouter } from 'react-router-dom'
import { describe, expect, it, vi } from 'vitest'
import NotFound from '@/pages/NotFound'

const renderAt = (path: string) => render(
  <HelmetProvider>
    <MemoryRouter initialEntries={[path]}>
      <NotFound />
    </MemoryRouter>
  </HelmetProvider>,
)

describe('NotFound', () => {
  it.each(['/portal/unknown', '/client', '/prospect/a/b', '/onboarding/x/y'])(
    'shows a neutral notice under the client-facing path %s',
    (path) => {
      vi.spyOn(console, 'error').mockImplementation(() => undefined)
      renderAt(path)

      expect(screen.getByRole('heading', { name: 'This link is not valid.' })).toBeInTheDocument()
      expect(screen.getByText('Contact the person who sent it.')).toBeInTheDocument()
      expect(document.body.textContent).not.toMatch(/Get On A Pod|homepage|Book a call/iu)
      expect(document.querySelector('a')).toBeNull()
    },
  )

  it('keeps the marketing doors everywhere else', () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined)
    renderAt('/no-such-page')

    expect(screen.getByRole('heading', { name: 'Nothing at this address.' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Go to the homepage' })).toHaveAttribute('href', '/')
  })
})
