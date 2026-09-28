import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { HelmetProvider } from 'react-helmet-async'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import ProspectView from '@/pages/prospect/ProspectView'

vi.mock('sonner', () => ({ toast: { error: vi.fn(), success: vi.fn(), info: vi.fn() } }))
vi.mock('@/lib/supabase', () => ({ supabase: { from: vi.fn() } }))

const SLUG = 'dallas-fontaine-8c1f2a'

const dashboard = {
  prospect_name: 'Dallas Fontaine',
  prospect_bio: 'Dallas helps leaders communicate with clarity and build lasting authority.',
  prospect_image_url: null,
  is_active: true,
  show_pricing_section: false,
  personalized_tagline: 'Conversations where practical leadership expertise can create real value.',
  media_kit_url: null,
  loom_video_url: null,
  loom_thumbnail_url: null,
  loom_video_title: null,
  show_loom_video: false,
  testimonial_ids: [],
  show_testimonials: false,
  cta_type: 'book_call' as const,
  cta_label: 'Book a call',
  cta_url: 'https://cal.com/northstar/intro',
}

const workspace = {
  name: 'Northstar Advisory',
  brand_name: 'Northstar Advisory',
  logo_url: null,
  primary_color: '#16324F',
  accent_color: '#E07A5F',
  booking_url: 'https://cal.com/northstar/intro',
}

const podcasts = [
  {
    podcast_id: 'show-one',
    podcast_name: 'The Clear Leader',
    podcast_description: 'Conversations about practical leadership and communication.',
    podcast_image_url: null,
    podcast_url: 'https://example.com/clear-leader',
    publisher_name: 'Morgan Host',
    itunes_rating: 4.9,
    episode_count: 146,
    audience_size: 42000,
    podcast_categories: [{ category_id: 'leadership', category_name: 'Leadership' }],
    last_posted_at: '2026-07-20T00:00:00.000Z',
    ai_clean_description: 'A thoughtful show for leaders building strong teams.',
    ai_fit_reasons: ['Dallas can give this audience a practical framework for communicating under pressure.'],
    ai_pitch_angles: [],
    demographics: null,
  },
  {
    podcast_id: 'show-two',
    podcast_name: 'Founder Signal',
    podcast_description: 'How founders build trust and momentum.',
    podcast_image_url: null,
    podcast_url: 'https://example.com/founder-signal',
    publisher_name: 'Taylor Host',
    itunes_rating: 4.7,
    episode_count: 82,
    audience_size: 18000,
    podcast_categories: [{ category_id: 'business', category_name: 'Business' }],
    last_posted_at: '2026-07-18T00:00:00.000Z',
    ai_clean_description: 'A founder interview show focused on trust and growth.',
    ai_fit_reasons: ['Dallas can connect clear positioning with durable founder trust.'],
    ai_pitch_angles: [],
    demographics: null,
  },
]

interface FeedbackRow {
  id: string
  prospect_dashboard_id: string
  podcast_id: string
  podcast_name: string | null
  status: 'approved' | 'rejected' | null
  notes: string | null
  created_at: string
  updated_at: string
}

let feedback: FeedbackRow[] = []

function jsonResponse(body: unknown) {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  })
}

function savedFeedbackBodies() {
  return vi.mocked(fetch).mock.calls
    .filter((call) => String(call[0]).includes('/save-prospect-feedback'))
    .map((call) => JSON.parse(String((call[1] as RequestInit | undefined)?.body || '{}')) as Record<string, unknown>)
}

function renderProspect() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  render(
    <HelmetProvider>
      <QueryClientProvider client={queryClient}>
        <MemoryRouter initialEntries={[`/prospect/${SLUG}`]} future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
          <Routes>
            <Route path="/prospect/:slug" element={<ProspectView />} />
          </Routes>
        </MemoryRouter>
      </QueryClientProvider>
    </HelmetProvider>,
  )
}

describe('ProspectView', () => {
  beforeEach(() => {
    feedback = [
      {
        id: 'feedback-one',
        prospect_dashboard_id: 'dashboard-1',
        podcast_id: 'show-one',
        podcast_name: 'The Clear Leader',
        status: 'approved',
        notes: null,
        created_at: '2026-07-22T00:00:00.000Z',
        updated_at: '2026-07-22T00:00:00.000Z',
      },
    ]

    vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input)
      const body = JSON.parse(String(init?.body || '{}')) as { podcast_id?: string; status?: 'approved' | 'rejected' | null; notes?: string | null }

      if (url.includes('/get-prospect-dashboard')) return jsonResponse({ success: true, dashboard, feedback, workspace })
      if (url.includes('/get-prospect-podcasts')) return jsonResponse({ podcasts })
      if (url.includes('/save-prospect-feedback') && body.podcast_id) {
        const saved: FeedbackRow = {
          id: feedback.find((entry) => entry.podcast_id === body.podcast_id)?.id || `feedback-${body.podcast_id}`,
          prospect_dashboard_id: 'dashboard-1',
          podcast_id: body.podcast_id,
          podcast_name: null,
          status: body.status ?? null,
          notes: body.notes ?? null,
          created_at: '2026-07-22T00:00:00.000Z',
          updated_at: '2026-07-23T00:00:00.000Z',
        }
        feedback = [...feedback.filter((entry) => entry.podcast_id !== body.podcast_id), saved]
        return jsonResponse({ success: true, feedback: saved })
      }

      return new Response(JSON.stringify({ error: 'Unexpected request' }), { status: 400 })
    }))
  })

  it('renders the shortlist from the dashboard payload', async () => {
    renderProspect()

    expect(await screen.findByRole('heading', { name: 'Dallas, we found 2 rooms where your story belongs.' })).toBeInTheDocument()
    expect(screen.getByText('Prepared for Dallas Fontaine')).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'The Clear Leader' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Founder Signal' })).toBeInTheDocument()
    expect(screen.getByText('Dallas can connect clear positioning with durable founder trust.')).toBeInTheDocument()
    expect(screen.queryByText('Get On A Pod')).not.toBeInTheDocument()
    expect(screen.getAllByRole('button', { name: 'Interested' })).toHaveLength(2)
    expect(screen.getAllByRole('button', { name: 'Not a fit' })).toHaveLength(2)
    expect(screen.getByPlaceholderText('Search shows, hosts, or topics')).toBeInTheDocument()
  })

  it('posts a card decision to save-prospect-feedback with the dashboard slug', async () => {
    renderProspect()
    await screen.findByRole('heading', { name: 'Founder Signal' })

    fireEvent.click(screen.getAllByRole('button', { name: 'Not a fit' })[1])

    await waitFor(() => expect(savedFeedbackBodies()).toHaveLength(1))
    expect(savedFeedbackBodies()[0]).toEqual({
      dashboard_slug: SLUG,
      podcast_id: 'show-two',
      status: 'rejected',
      notes: null,
    })
    const [, init] = vi.mocked(fetch).mock.calls.find((call) => String(call[0]).includes('/save-prospect-feedback'))!
    expect((init as RequestInit).method).toBe('POST')
    expect((init as RequestInit).headers).toMatchObject({ apikey: 'test-anon-key', Authorization: 'Bearer test-anon-key' })
  })

  // A card-level click sends no notes; the saved note must survive it.
  it('keeps the saved note when a card-level choice is made', async () => {
    feedback[0] = { ...feedback[0], status: null, notes: 'Keep the intro short' }
    renderProspect()
    await screen.findByRole('heading', { name: 'The Clear Leader' })

    fireEvent.click(screen.getAllByRole('button', { name: 'Interested' })[0])

    await waitFor(() => expect(savedFeedbackBodies()[0]?.notes).toBe('Keep the intro short'))
  })

  it('says what happens next once every show has a decision', async () => {
    renderProspect()
    await screen.findByRole('heading', { name: 'Founder Signal' })
    expect(screen.queryByText(/You have reviewed all/)).not.toBeInTheDocument()

    fireEvent.click(screen.getAllByRole('button', { name: 'Not a fit' })[1])

    const heading = await screen.findByText('You have reviewed all 2 shows')
    const done = heading.closest('[role="status"]') as HTMLElement
    expect(within(done).getByText(/Northstar Advisory will start outreach on your 1 pick\./)).toBeInTheDocument()
    expect(within(done).getByText(/There is nothing to submit/)).toBeInTheDocument()
    expect(within(done).getByRole('button', { name: 'Book a short call' })).toBeInTheDocument()
  })

  it('does not open the walkthrough on its own', async () => {
    renderProspect()
    await screen.findByRole('heading', { name: 'The Clear Leader' })

    await new Promise((resolve) => setTimeout(resolve, 1200))
    expect(screen.queryByRole('dialog', { name: 'How this works' })).not.toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'How it works' }))
    const tour = await screen.findByRole('dialog', { name: 'How this works' })
    expect(within(tour).getByRole('button', { name: 'Skip' })).toBeInTheDocument()
    expect(tour.textContent).not.toMatch(/!/u)
  })

  it('walks the shortlist one show at a time', async () => {
    renderProspect()
    await screen.findByRole('heading', { name: 'Founder Signal' })

    fireEvent.click(screen.getByRole('button', { name: /Focused review/ }))
    const review = screen.getByRole('dialog', { name: 'Focused review' })
    expect(within(review).getByRole('heading', { name: 'Founder Signal' })).toBeInTheDocument()
    expect(within(review).getByText(/Your shortlist · Match 2 of 2/u)).toBeInTheDocument()

    fireEvent.click(within(review).getByRole('button', { name: 'Interested' }))

    await waitFor(() => expect(feedback.find((entry) => entry.podcast_id === 'show-two')?.status).toBe('approved'))
    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Focused review' })).not.toBeInTheDocument())
  })
})
