import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { HelmetProvider } from 'react-helmet-async'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import Landing from './Landing'
import { getFeaturedTestimonials } from '@/services/testimonials'
import { CALL_URL } from '@/lib/landingContent'

vi.mock('@/services/testimonials', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/services/testimonials')>()),
  getFeaturedTestimonials: vi.fn(),
}))

const featured = vi.mocked(getFeaturedTestimonials)

/** Whose video a testimonial's watch link opens, read from its accessible name. */
const watching = (link: HTMLElement) => link.textContent.replace(/^Watch on YouTube — | \(opens in a new tab\)$/gu, '')

// jsdom has no PointerEvent, and without one fireEvent drops clientX and pointerType.
if (!('PointerEvent' in window)) {
  class PointerEventPolyfill extends MouseEvent {
    pointerType: string
    constructor(type: string, init: PointerEventInit = {}) {
      super(type, init)
      this.pointerType = init.pointerType ?? ''
    }
  }
  Object.defineProperty(window, 'PointerEvent', { configurable: true, value: PointerEventPolyfill })
}

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
    // Events publish no artwork, so the stage offer carries no sample grid.
    expect(screen.queryByRole('tablist', { name: 'Niche' })).not.toBeInTheDocument()
    expect(screen.queryByText(/rooms like these/u)).not.toBeInTheDocument()
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

  it('walks the niches with the arrow keys, one tab stop for the strip', () => {
    renderPage()
    const tabs = screen.getByRole('tablist', { name: 'Niche' })
    const first = within(tabs).getByRole('tab', { name: 'SaaS & Tech' })
    expect(first).toHaveAttribute('tabindex', '0')
    expect(within(tabs).getByRole('tab', { name: 'Marketing' })).toHaveAttribute('tabindex', '-1')
    fireEvent.keyDown(tabs, { key: 'ArrowRight' })
    expect(within(tabs).getByRole('tab', { name: 'Marketing' })).toHaveAttribute('aria-selected', 'true')
    expect(screen.getByText('Marketing School')).toBeInTheDocument()
    fireEvent.keyDown(tabs, { key: 'End' })
    expect(within(tabs).getByRole('tab', { name: 'Leadership' })).toHaveAttribute('aria-selected', 'true')
    fireEvent.keyDown(tabs, { key: 'ArrowRight' })
    expect(first).toHaveAttribute('aria-selected', 'true')
    expect(screen.getByRole('tabpanel')).toHaveAttribute('aria-labelledby', first.id)
  })

  it('tells a screen reader when a link leaves for a new tab', () => {
    renderPage()
    for (const link of screen.getAllByRole('link', { name: /book a (30-minute )?call/iu })) {
      expect(link).toHaveAccessibleName(/opens in a new tab/iu)
    }
  })

  it('falls back to initials when artwork fails to load', () => {
    renderPage()
    fireEvent.error(screen.getByRole('img', { name: 'The SaaS Podcast artwork' }))
    expect(screen.queryByRole('img', { name: 'The SaaS Podcast artwork' })).not.toBeInTheDocument()
    expect(screen.getByText('SP')).toBeInTheDocument()
  })

  it('quotes real clients, by name, with their faces and videos, on the podcast page only', () => {
    renderPage()
    const quotes = screen.getByRole('region', { name: 'Testimonials' })
    // Every quote is on the page; the carousel shows one at a time.
    for (const text of [
      /made setting up, scheduling and recording just a breeze/u, 'Co-founder and CEO, Relai',
      /booking me on podcasts almost immediately/u, 'Founder and CEO, North Street Creative',
      /Within my first week of becoming a client, I landed a spot/u, 'Founder and CEO, Quirk',
      /four podcasts scheduled in the first 10 days/u, 'Founder and CEO, Ownify',
      /get us on various media channels and podcasts/u, 'Co-founder and CEO, ShareClub',
      /I had two episodes booked in the first month/u, 'Founder and CEO, ScaleUp Valley',
    ]) {
      expect(quotes).toHaveTextContent(text)
    }
    const picker = within(quotes).getByRole('group', { name: 'Choose a client' })
    for (const [name, href, portrait] of [
      ['Miles Mufuka Martin', 'https://www.youtube.com/watch?v=7mjznMHEeg0', '/testimonials/miles-mufuka-martin.webp'],
      ['Tom Conlon', 'https://www.youtube.com/watch?v=MG4KENHrge0', '/testimonials/tom-conlon.webp'],
      ['Kate Pozeznik', 'https://www.youtube.com/watch?v=hFcbqL0vrn4', '/testimonials/kate-pozeznik.webp'],
      ['Frank Rohde', 'https://www.youtube.com/watch?v=dJwV94ymqz8', '/testimonials/frank-rohde.webp'],
      ['Sam Hollander', 'https://www.youtube.com/watch?v=3PYDap_jSUQ', '/testimonials/sam-hollander.webp'],
      ['Mike Dias', 'https://www.youtube.com/watch?v=IP6HW42oztc', '/testimonials/mike-dias.webp'],
    ]) {
      const pick = within(picker).getByRole('button', { name })
      expect(pick.querySelector('img')).toHaveAttribute('src', portrait)
      fireEvent.click(pick)
      expect(pick).toHaveAttribute('aria-current', 'true')
      const video = within(quotes).getByRole('link', { name: `Watch on YouTube — ${name} (opens in a new tab)` })
      expect(video).toHaveAttribute('href', href)
      expect(video).toHaveAttribute('rel', expect.stringContaining('noopener'))
    }
    cleanup()
    renderPage('/?mode=stages')
    expect(screen.queryByRole('region', { name: 'Testimonials' })).not.toBeInTheDocument()
  })

  it('shows one testimonial at a time and moves between them from every control', () => {
    renderPage()
    const quotes = screen.getByRole('region', { name: 'Testimonials' })
    const showing = () => within(quotes).getAllByRole('link', { name: /^Watch on YouTube — /u }).map(watching)
    expect(showing()).toEqual(['Miles Mufuka Martin'])
    const hidden = within(quotes).getByText('Tom Conlon', { selector: '.dfy-quote-name' }).closest('figure')
    expect(hidden).toHaveAttribute('inert')
    expect(hidden).toHaveAttribute('aria-hidden', 'true')

    fireEvent.click(within(quotes).getByRole('button', { name: 'Next testimonial' }))
    expect(showing()).toEqual(['Tom Conlon'])
    fireEvent.click(within(quotes).getByRole('button', { name: 'Previous testimonial' }))
    fireEvent.click(within(quotes).getByRole('button', { name: 'Previous testimonial' }))
    expect(showing()).toEqual(['Mike Dias'])

    fireEvent.keyDown(quotes, { key: 'ArrowRight' })
    expect(showing()).toEqual(['Miles Mufuka Martin'])

    const stage = within(quotes).getByRole('group', { name: '1 of 6' }).parentElement
    fireEvent.pointerDown(stage, { pointerType: 'touch', clientX: 300, clientY: 100 })
    fireEvent.pointerUp(stage, { pointerType: 'touch', clientX: 200, clientY: 110 })
    expect(showing()).toEqual(['Tom Conlon'])
    // A mouse drag is someone selecting the quote, not a swipe.
    fireEvent.pointerDown(stage, { pointerType: 'mouse', clientX: 300, clientY: 100 })
    fireEvent.pointerUp(stage, { pointerType: 'mouse', clientX: 100, clientY: 100 })
    expect(showing()).toEqual(['Tom Conlon'])
  })

  describe('moving on by itself', () => {
    const HOLD_MS = 9000
    const showing = () => within(screen.getByRole('region', { name: 'Testimonials' }))
      .getAllByRole('link', { name: /^Watch on YouTube — /u }).map(watching)[0]

    beforeEach(() => { vi.useFakeTimers() })
    afterEach(() => {
      vi.useRealTimers()
      vi.mocked(window.matchMedia).mockImplementation((query: string) => ({ matches: false, media: query }) as MediaQueryList)
    })

    it('advances, holds while pointed at, and stops once the reader takes over', () => {
      renderPage()
      const quotes = screen.getByRole('region', { name: 'Testimonials' })
      act(() => { vi.advanceTimersByTime(HOLD_MS) })
      expect(showing()).toBe('Tom Conlon')

      fireEvent.mouseEnter(quotes)
      act(() => { vi.advanceTimersByTime(HOLD_MS * 2) })
      expect(showing()).toBe('Tom Conlon')
      fireEvent.mouseLeave(quotes)
      act(() => { vi.advanceTimersByTime(HOLD_MS) })
      expect(showing()).toBe('Kate Pozeznik')

      fireEvent.click(within(quotes).getByRole('button', { name: 'Next testimonial' }))
      fireEvent.blur(within(quotes).getByRole('button', { name: 'Next testimonial' }))
      expect(within(quotes).getByRole('button', { name: 'Play' })).toBeInTheDocument()
      act(() => { vi.advanceTimersByTime(HOLD_MS * 3) })
      expect(showing()).toBe('Frank Rohde')
    })

    it('can be paused', () => {
      renderPage()
      const quotes = screen.getByRole('region', { name: 'Testimonials' })
      fireEvent.click(within(quotes).getByRole('button', { name: 'Pause' }))
      fireEvent.blur(within(quotes).getByRole('button', { name: 'Play' }))
      act(() => { vi.advanceTimersByTime(HOLD_MS * 3) })
      expect(showing()).toBe('Miles Mufuka Martin')
    })

    it('holds still for a reader who asked for less motion', () => {
      vi.mocked(window.matchMedia).mockImplementation((query: string) => ({ matches: query.includes('reduce'), media: query }) as MediaQueryList)
      renderPage()
      act(() => { vi.advanceTimersByTime(HOLD_MS * 3) })
      expect(showing()).toBe('Miles Mufuka Martin')
      expect(screen.getByRole('button', { name: 'Play' })).toBeInTheDocument()
    })
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
