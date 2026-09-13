import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { HelmetProvider } from 'react-helmet-async'
import { MemoryRouter } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import Landing from './Landing'
import { getFeaturedTestimonials } from '@/services/testimonials'
import { CALL_URL } from '@/lib/landingContent'

vi.mock('@/services/testimonials', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/services/testimonials')>()),
  getFeaturedTestimonials: vi.fn(),
}))

const featured = vi.mocked(getFeaturedTestimonials)

function renderPage(path = '/') {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <HelmetProvider>
      <QueryClientProvider client={client}>
        <MemoryRouter initialEntries={[path]}><Landing /></MemoryRouter>
      </QueryClientProvider>
    </HelmetProvider>,
  )
}

describe('Landing', () => {
  beforeEach(() => {
    featured.mockReset()
    featured.mockResolvedValue([])
  })

  it('opens on the podcast offer and books calls where the rest of the site does', () => {
    renderPage()
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent(/podcasts come calling/iu)
    expect(screen.getByRole('link', { name: /skip to content/iu })).toHaveAttribute('href', '#main')
    expect(screen.getByRole('link', { name: 'Sign in' })).toHaveAttribute('href', '/login')
    expect(screen.getByRole('link', { name: 'For agencies' })).toHaveAttribute('href', '/platform')
    for (const link of screen.getAllByRole('link', { name: /book a (30-minute )?call/iu })) {
      expect(link).toHaveAttribute('href', CALL_URL)
      expect(link).toHaveAttribute('rel', expect.stringContaining('noopener'))
    }
    expect(screen.getByText('$500')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Podcasts' })).toHaveAttribute('aria-pressed', 'true')
  })

  it('switches every changing section to the stage offer', () => {
    renderPage()
    fireEvent.click(screen.getByRole('button', { name: 'Stages' }))
    expect(screen.getByRole('button', { name: 'Stages' })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent(/full of your ideal clients/iu)
    expect(screen.getByRole('heading', { name: /one system\. four steps/iu })).toBeInTheDocument()
    expect(screen.getByText('We put you in rooms like these')).toBeInTheDocument()
    expect(screen.getByText(/we're not a bureau/iu)).toBeInTheDocument()
    expect(screen.getByText('What exactly am I paying for?')).toBeInTheDocument()
    expect(screen.queryByText('How is this different from a PR agency?')).not.toBeInTheDocument()
  })

  it('reads the offer from the address so the stage page can be linked to', () => {
    renderPage('/?mode=stages')
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent(/full of your ideal clients/iu)
    // The design's "Starting in September" line is computed, never stale.
    expect(screen.getByText(/^Starting in [A-Z][a-z]+ means your Q[1-4]/u)).toBeInTheDocument()
  })

  it('lets the reader browse sample shows by niche', () => {
    renderPage()
    const tabs = screen.getByRole('tablist', { name: 'Niche' })
    expect(within(tabs).getByRole('tab', { name: 'SaaS & Tech' })).toHaveAttribute('aria-selected', 'true')
    expect(screen.getByText('The SaaS Podcast')).toBeInTheDocument()
    // Every podcast is a real show with its artwork; no initials plates remain.
    expect(screen.getByRole('img', { name: 'The SaaS Podcast artwork' })).toHaveAttribute('src', '/shows/the-saas-podcast.webp')
    expect(screen.getAllByRole('img', { name: /artwork$/u })).toHaveLength(4)
    fireEvent.click(within(tabs).getByRole('tab', { name: 'Finance' }))
    expect(screen.getByText('Animal Spirits')).toBeInTheDocument()
    expect(screen.queryByText('The SaaS Podcast')).not.toBeInTheDocument()
  })

  it('falls back to initials when artwork fails to load', () => {
    renderPage()
    fireEvent.error(screen.getByRole('img', { name: 'The SaaS Podcast artwork' }))
    expect(screen.queryByRole('img', { name: 'The SaaS Podcast artwork' })).not.toBeInTheDocument()
    expect(screen.getByText('SP')).toBeInTheDocument()
  })

  it('quotes real clients, by name and with their videos, on the podcast page only', () => {
    renderPage()
    const quotes = screen.getByRole('region', { name: 'Testimonials' })
    expect(quotes).toHaveTextContent(/made setting up, scheduling and recording just a breeze/u)
    expect(quotes).toHaveTextContent('Co-founder and CEO, Relai')
    expect(quotes).toHaveTextContent(/booking me on podcasts almost immediately/u)
    expect(quotes).toHaveTextContent('Founder and CEO, North Street Creative')
    expect(quotes).toHaveTextContent(/Within my first week of becoming a client, I landed a spot/u)
    expect(quotes).toHaveTextContent('Founder and CEO, Quirk')
    expect(quotes).toHaveTextContent(/four podcasts scheduled in the first 10 days/u)
    expect(quotes).toHaveTextContent('Founder and CEO, Ownify')
    expect(quotes).toHaveTextContent(/get us on various media channels and podcasts/u)
    expect(quotes).toHaveTextContent('Co-founder and CEO, ShareClub')
    expect(quotes).toHaveTextContent(/I had two episodes booked in the first month/u)
    expect(quotes).toHaveTextContent('Founder and CEO, ScaleUp Valley')
    for (const [name, href] of [
      ['Mike Dias', 'https://www.youtube.com/watch?v=IP6HW42oztc'],
      ['Sam Hollander', 'https://www.youtube.com/watch?v=3PYDap_jSUQ'],
      ['Frank Rohde', 'https://www.youtube.com/watch?v=dJwV94ymqz8'],
      ['Miles Mufuka Martin', 'https://www.youtube.com/watch?v=7mjznMHEeg0'],
      ['Tom Conlon', 'https://www.youtube.com/watch?v=MG4KENHrge0'],
      ['Kate Pozeznik', 'https://www.youtube.com/watch?v=hFcbqL0vrn4'],
    ]) {
      const video = within(quotes).getByRole('link', { name: `Watch on YouTube: ${name}` })
      expect(video).toHaveAttribute('href', href)
      expect(video).toHaveAttribute('rel', expect.stringContaining('noopener'))
    }
    cleanup()
    renderPage('/?mode=stages')
    expect(screen.queryByRole('region', { name: 'Testimonials' })).not.toBeInTheDocument()
  })

  it('shows no client stories, and no placeholder ones, until a real one is featured', async () => {
    renderPage()
    await screen.findByText('The SaaS Podcast')
    expect(screen.queryByText('In their words')).not.toBeInTheDocument()
    expect(screen.queryByText(/Client name/u)).not.toBeInTheDocument()
    expect(screen.queryByText(/Hartwell/u)).not.toBeInTheDocument()
  })

  it('shows a featured client story as a link to their video', async () => {
    featured.mockResolvedValue([
      {
        id: 't1',
        video_url: 'https://www.youtube.com/watch?v=abc12345678',
        client_name: 'Dana Reyes',
        client_title: 'Founder',
        client_company: 'Northwind',
        quote: 'Eleven shows in four months.',
        is_featured: true,
        display_order: 1,
        is_active: true,
        created_at: '',
        updated_at: '',
      },
      {
        // Not embeddable, so not a story the page can show.
        id: 't2',
        video_url: 'https://www.loom.com/share/xyz',
        client_name: 'Nobody',
        is_featured: true,
        display_order: 2,
        is_active: true,
        created_at: '',
        updated_at: '',
      },
    ])
    renderPage()
    expect(await screen.findByText('In their words')).toBeInTheDocument()
    const story = screen.getByRole('link', { name: /Dana Reyes/u })
    expect(story).toHaveAttribute('href', 'https://www.youtube.com/watch?v=abc12345678')
    expect(story).toHaveTextContent('Founder, Northwind')
    expect(story).toHaveTextContent('Watch on YouTube')
    expect(screen.queryByText('Nobody')).not.toBeInTheDocument()
  })
})
