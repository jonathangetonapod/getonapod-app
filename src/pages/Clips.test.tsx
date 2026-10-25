import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { HelmetProvider } from 'react-helmet-async'
import { MemoryRouter } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import Clips from './Clips'
import { CLIPS_CAL_URL, CLIPS_FAQ, CLIPS_SEO } from '@/lib/clipsContent'
import { requestClipsCut } from '@/services/clipsLeads'

vi.mock('@/services/clipsLeads', () => ({ requestClipsCut: vi.fn() }))
const requestCut = vi.mocked(requestClipsCut)

// jsdom has no PointerEvent, and without one fireEvent drops clientX.
if (!('PointerEvent' in window)) {
  class PointerEventPolyfill extends MouseEvent {
    pointerId: number
    constructor(type: string, init: PointerEventInit = {}) {
      super(type, init)
      this.pointerId = init.pointerId ?? 1
    }
  }
  Object.defineProperty(window, 'PointerEvent', { configurable: true, value: PointerEventPolyfill })
}

function renderPage(path = '/clips') {
  const client = new QueryClient({ defaultOptions: { mutations: { retry: false } } })
  return render(
    <HelmetProvider>
      <QueryClientProvider client={client}>
        <MemoryRouter initialEntries={[path]}><Clips /></MemoryRouter>
      </QueryClientProvider>
    </HelmetProvider>,
  )
}

/** The page clock: the form drops anything submitted under three seconds, so tests start later. */
function fillAndSubmit({ name = 'Dana', email = 'dana@example.com', show = 'https://www.youtube.com/@danashow' } = {}) {
  fireEvent.change(screen.getByLabelText('Your name'), { target: { value: name } })
  fireEvent.change(screen.getByLabelText('Email'), { target: { value: email } })
  fireEvent.change(screen.getByLabelText('Your show on YouTube'), { target: { value: show } })
  fireEvent.click(screen.getByRole('button', { name: 'Cut my episode' }))
}

describe('Clips', () => {
  beforeEach(() => {
    requestCut.mockReset()
    window.sessionStorage.clear()
    delete (window as unknown as { __clipsEvents?: unknown }).__clipsEvents
  })

  it('states the offer once in the H1 and sends every call to action to the form', () => {
    renderPage()
    const headings = screen.getAllByRole('heading', { level: 1 })
    expect(headings).toHaveLength(1)
    expect(headings[0]).toHaveTextContent('Five clips from your last episode.Free. In 72 hours.')
    expect(screen.getByRole('link', { name: /skip to content/iu })).toHaveAttribute('href', '#clips-main')
    // Nav, hero, pricing: every lime button lands on #cut.
    const ctas = screen.getAllByRole('link', { name: /get your free cut|start with the free cut/iu })
    expect(ctas.length).toBeGreaterThanOrEqual(4)
    for (const cta of ctas) expect(cta).toHaveAttribute('href', '#cut')
    expect(screen.getByRole('link', { name: 'AI cut vs our cut' })).toHaveAttribute('href', '#compare')
    // Calls are optional and go to the 30-minute link, in a new tab.
    for (const link of screen.getAllByRole('link', { name: /book a call|book 15 minutes|book fifteen minutes/iu })) {
      expect(link).toHaveAttribute('href', CLIPS_CAL_URL)
      expect(link).toHaveAttribute('rel', expect.stringContaining('noopener'))
    }
    // The three prices, stated once each in the tiers.
    expect(screen.getByText('$750')).toBeInTheDocument()
    expect(screen.getByText('$1,500')).toBeInTheDocument()
    expect(screen.getAllByText('$0').length).toBeGreaterThanOrEqual(1)
  })

  it('renders every FAQ open, marks the stages for a screen reader, and keeps the ghosts out of the tree', () => {
    renderPage()
    for (const item of CLIPS_FAQ.items) {
      expect(screen.getByRole('heading', { level: 3, name: item.q })).toBeInTheDocument()
      expect(screen.getByText(item.a)).toBeInTheDocument()
    }
    expect(screen.getByRole('img', { name: 'One episode frame being cut into five vertical clips' })).toBeInTheDocument()
    expect(screen.getByRole('img', { name: 'Five phones fanned out, one clip on each' })).toBeInTheDocument()
    expect(screen.getByRole('img', { name: 'Free cut, 72 hours, 5 clips, 2 thumbnails' })).toBeInTheDocument()
    // The ghost text is decoration: present, but hidden from assistive tech.
    expect(document.querySelector('.clips-ghost-cut')).toHaveAttribute('aria-hidden', 'true')
    expect(document.querySelector('.clips-ghost-clock')).toHaveTextContent('72:00:00')
    // Nothing invented.
    expect(screen.queryByText(/testimonial|views|★/iu)).not.toBeInTheDocument()
  })

  it('moves the compare split from the range input and from a drag on the picture', () => {
    renderPage()
    const range = screen.getByLabelText('AI tool ← drag → human editor') as HTMLInputElement
    expect(range.value).toBe('50')
    const aiLayer = document.querySelector('.clips-layer-ai') as HTMLElement
    expect(aiLayer.style.clipPath).toBe('inset(0 50% 0 0)')

    fireEvent.change(range, { target: { value: '20' } })
    expect(aiLayer.style.clipPath).toBe('inset(0 80% 0 0)')

    const box = document.querySelector('.clips-compare-box') as HTMLElement
    box.getBoundingClientRect = () => ({ left: 0, width: 400, top: 0, height: 500, right: 400, bottom: 500, x: 0, y: 0, toJSON: () => ({}) })
    fireEvent.pointerDown(box, { clientX: 300, pointerId: 1 })
    expect(aiLayer.style.clipPath).toBe('inset(0 25% 0 0)')
    fireEvent.pointerMove(box, { clientX: 100, pointerId: 1 })
    expect(aiLayer.style.clipPath).toBe('inset(0 75% 0 0)')
    fireEvent.pointerUp(box, { clientX: 100, pointerId: 1 })
    fireEvent.pointerMove(box, { clientX: 390, pointerId: 1 })
    expect(aiLayer.style.clipPath).toBe('inset(0 75% 0 0)')

    const events = (window as unknown as { __clipsEvents: Array<{ event: string }> }).__clipsEvents
    expect(events.filter((entry) => entry.event === 'clips_compare_drag')).toHaveLength(1)
  })

  it('refuses a link that is not YouTube before anything is sent', () => {
    renderPage()
    fillAndSubmit({ show: 'https://vimeo.com/123' })
    expect(screen.getByRole('alert')).toHaveTextContent('Paste a YouTube channel or episode link')
    expect(requestCut).not.toHaveBeenCalled()
    expect(screen.getByLabelText('Your show on YouTube')).toHaveAttribute('aria-invalid', 'true')
    const events = (window as unknown as { __clipsEvents: Array<{ event: string; props: Record<string, string> }> }).__clipsEvents
    expect(events).toContainEqual(expect.objectContaining({ event: 'clips_form_error', props: { field: 'show' } }))
  })

  it('sends the lead with its attribution and swaps the card for the running clock', async () => {
    window.history.replaceState({}, '', '/clips?utm_source=newsletter&utm_medium=email&utm_campaign=oct')
    requestCut.mockResolvedValue({ startedAt: new Date().toISOString() })
    renderPage()
    fillAndSubmit()
    await waitFor(() => expect(requestCut).toHaveBeenCalledTimes(1))
    const payload = requestCut.mock.calls[0][0]
    expect(payload).toMatchObject({
      name: 'Dana',
      email: 'dana@example.com',
      show: 'https://www.youtube.com/@danashow',
      website: '',
      attribution: expect.objectContaining({ utm_source: 'newsletter', utm_medium: 'email', utm_campaign: 'oct' }),
    })
    expect(payload.elapsedMs).toBeGreaterThanOrEqual(0)

    const done = await screen.findByRole('status')
    expect(within(done).getByRole('heading', { level: 3 })).toHaveTextContent('The clock is running.')
    expect(done).toHaveTextContent('Five clips and two thumbnails, in dana@example.com, within 72 hours.')
    expect(within(done).getByRole('link', { name: /book fifteen minutes anyway/iu })).toHaveAttribute('href', CLIPS_CAL_URL)
    expect(within(done).getByLabelText('72 hours remaining')).toHaveTextContent(/^7[12]:\d\d:\d\d$/u)
    window.history.replaceState({}, '', '/clips')
  })

  it('keeps the form and offers the mailto when the function fails', async () => {
    requestCut.mockRejectedValue(new Error("Something broke on our side. Email jonathan@getonapod.com and we'll start the clock by hand."))
    renderPage()
    fillAndSubmit()
    await act(async () => { await Promise.resolve() })
    const alert = await screen.findByRole('alert')
    expect(alert).toHaveTextContent("Something broke on our side. Email jonathan@getonapod.com and we'll start the clock by hand.")
    expect(within(alert).getByRole('link', { name: 'jonathan@getonapod.com' })).toHaveAttribute('href', 'mailto:jonathan@getonapod.com')
    expect(screen.getByRole('button', { name: 'Cut my episode' })).toBeInTheDocument()
  })

  it('carries the title, description, canonical and both schema blocks', async () => {
    renderPage()
    // Helmet can write the title a tick before the meta tags; wait for all of it.
    await waitFor(() => {
      expect(document.title).toBe(CLIPS_SEO.title)
      expect(document.querySelector('meta[name="description"]')).toHaveAttribute('content', CLIPS_SEO.description)
      expect(document.querySelectorAll('script[type="application/ld+json"]').length).toBeGreaterThanOrEqual(2)
    })
    expect(document.querySelector('link[rel="canonical"]')).toHaveAttribute('href', 'https://getonapod.com/clips')
    const schemas = [...document.querySelectorAll('script[type="application/ld+json"]')].map((node) => JSON.parse(node.textContent ?? '{}'))
    expect(schemas.map((schema) => schema['@type'])).toEqual(expect.arrayContaining(['Service', 'FAQPage']))
    const faq = schemas.find((schema) => schema['@type'] === 'FAQPage')
    expect(faq.mainEntity).toHaveLength(10)
    const service = schemas.find((schema) => schema['@type'] === 'Service')
    expect(service.provider.name).toBe('Get On A Pod LLC')
    expect(service.offers).toMatchObject({ price: '750', priceCurrency: 'USD' })
    expect(document.querySelector('link[rel="preload"][as="style"]')).toHaveAttribute('href', expect.stringContaining('Inter+Tight'))
  })

  it('folds the links behind a Menu button that says whether it is open', () => {
    renderPage()
    const menu = screen.getByRole('button', { name: 'Menu' })
    expect(menu).toHaveAttribute('aria-expanded', 'false')
    fireEvent.click(menu)
    expect(menu).toHaveAttribute('aria-expanded', 'true')
    expect(document.querySelector('.clips-nav')).toHaveClass('clips-nav-open')
    fireEvent.click(within(screen.getByRole('navigation', { name: 'Page' })).getByRole('link', { name: 'Pricing' }))
    expect(menu).toHaveAttribute('aria-expanded', 'false')
  })
})
