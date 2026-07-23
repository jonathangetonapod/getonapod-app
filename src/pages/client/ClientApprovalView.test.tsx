import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { HelmetProvider } from 'react-helmet-async'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import ClientApprovalView from '@/pages/client/ClientApprovalView'

vi.mock('canvas-confetti', () => ({ default: vi.fn() }))

const dashboard = {
  id: '22222222-2222-4222-8222-222222222222',
  name: 'Dallas Fontaine',
  bio: 'Dallas helps leaders communicate with clarity and build lasting authority.',
  photo_url: null,
  media_kit_url: 'https://example.com/media-kit',
  dashboard_tagline: 'Conversations where practical leadership and communication expertise can create real value.',
  dashboard_view_count: 12,
  dashboard_last_viewed_at: null,
  dashboard_enabled: true,
  workspace: {
    name: 'Northstar Advisory',
    logo_url: 'https://project.supabase.co/storage/v1/object/public/workspace-logos/northstar/logo.png',
    primary_color: '#16324F',
    accent_color: '#E07A5F',
  },
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
    is_featured: true,
    featured_order: 1,
    display_order: 1,
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
    is_featured: false,
    featured_order: null,
    display_order: 2,
    ai_clean_description: 'A founder interview show focused on trust and growth.',
    ai_fit_reasons: ['Dallas can connect clear positioning with durable founder trust.'],
    ai_pitch_angles: [],
    demographics: null,
  },
]

let feedback = [
  {
    id: 'feedback-one',
    client_id: dashboard.id,
    podcast_id: 'show-one',
    podcast_name: 'The Clear Leader',
    status: 'approved' as const,
    notes: null,
    created_at: '2026-07-22T00:00:00.000Z',
    updated_at: '2026-07-22T00:00:00.000Z',
  },
]

function jsonResponse(body: unknown) {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  })
}

function renderDashboard() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  render(
    <HelmetProvider>
      <QueryClientProvider client={queryClient}>
        <MemoryRouter
          initialEntries={['/client/dallas-fontaine-a0fd037530f8577cc03eb87b?preview=1']}
          future={{ v7_startTransition: true, v7_relativeSplatPath: true }}
        >
          <Routes>
            <Route path="/client/:slug" element={<ClientApprovalView />} />
          </Routes>
        </MemoryRouter>
      </QueryClientProvider>
    </HelmetProvider>,
  )
}

describe('ClientApprovalView', () => {
  beforeEach(() => {
    feedback = [
      {
        id: 'feedback-one',
        client_id: dashboard.id,
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
      const body = JSON.parse(String(init?.body || '{}')) as { action?: string; podcast_id?: string; podcast_name?: string; status?: 'approved' | 'rejected' | null; notes?: string | null }

      if (url.includes('/get-client-podcasts')) return jsonResponse({ podcasts })
      if (body.action === 'get') return jsonResponse({ dashboard })
      if (body.action === 'feedback_list') return jsonResponse({ feedback })
      if (body.action === 'feedback_upsert' && body.podcast_id) {
        const saved = {
          id: feedback.find((entry) => entry.podcast_id === body.podcast_id)?.id || `feedback-${body.podcast_id}`,
          client_id: dashboard.id,
          podcast_id: body.podcast_id,
          podcast_name: body.podcast_name || null,
          status: body.status ?? null,
          notes: body.notes ?? null,
          created_at: '2026-07-22T00:00:00.000Z',
          updated_at: '2026-07-23T00:00:00.000Z',
        }
        feedback = [...feedback.filter((entry) => entry.podcast_id !== body.podcast_id), saved as (typeof feedback)[number]]
        return jsonResponse({ feedback: saved })
      }

      return new Response(JSON.stringify({ error: 'Unexpected request' }), { status: 400 })
    }))
  })

  it('leads with a focused campaign and removes the repetitive database framing', async () => {
    renderDashboard()

    expect(await screen.findByRole('heading', { name: 'The right rooms for your next big ideas.' })).toBeInTheDocument()
    expect(screen.getByText('Prepared for Dallas Fontaine')).toBeInTheDocument()
    expect(screen.getAllByText('Northstar Advisory').length).toBeGreaterThan(0)
    expect(screen.getByAltText('Northstar Advisory logo')).toBeInTheDocument()
    expect(screen.queryByText('Get On A Pod')).not.toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Choose 10 shows' })).toBeInTheDocument()
    const firstBatch = screen.getByRole('heading', { name: 'Choose 10 shows' }).closest('aside')
    expect(firstBatch).not.toBeNull()
    expect(within(firstBatch as HTMLElement).getByText('1', { selector: 'span' })).toBeInTheDocument()
    expect(screen.getByRole('tab', { name: /Top matches 2/i })).toHaveAttribute('aria-selected', 'true')
    expect(screen.getByRole('heading', { name: 'The Clear Leader' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Founder Signal' })).toBeInTheDocument()
    expect(screen.queryByText('Featured Opportunities')).not.toBeInTheDocument()
    expect(screen.queryByText('Your Podcast Opportunities')).not.toBeInTheDocument()
    expect(screen.queryByText('AI Ready')).not.toBeInTheDocument()
    expect(screen.getByText('Your picks become a campaign—not another spreadsheet.')).toBeInTheDocument()
  })

  it('keeps positive choices in My picks and uses direct decision language', async () => {
    renderDashboard()
    await screen.findByRole('heading', { name: 'The Clear Leader' })

    fireEvent.click(screen.getByRole('tab', { name: /My picks 1/i }))

    expect(screen.getByRole('heading', { name: 'Shows you are interested in' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'The Clear Leader' })).toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: 'Founder Signal' })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Interested' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Not a fit' })).toBeInTheDocument()
    expect(screen.queryByText('Approved')).not.toBeInTheDocument()
    expect(screen.queryByText('Rejected')).not.toBeInTheDocument()
  })

  it('supports a one-show-at-a-time focused review and persists the choice', async () => {
    renderDashboard()
    await screen.findByRole('heading', { name: 'The Clear Leader' })

    fireEvent.click(screen.getAllByRole('button', { name: /Focused review/i })[0])
    const review = screen.getByRole('dialog', { name: 'Focused review' })
    expect(within(review).getByRole('heading', { name: 'Founder Signal' })).toBeInTheDocument()
    expect(within(review).getByText('Dallas can connect clear positioning with durable founder trust.')).toBeInTheDocument()

    fireEvent.click(within(review).getByRole('button', { name: 'Interested' }))

    await waitFor(() => expect(feedback.find((entry) => entry.podcast_id === 'show-two')?.status).toBe('approved'))
    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Focused review' })).not.toBeInTheDocument())
  })

  it('scopes focused review to My picks when that view is active', async () => {
    renderDashboard()
    await screen.findByRole('heading', { name: 'The Clear Leader' })

    fireEvent.click(screen.getByRole('tab', { name: /My picks 1/i }))
    fireEvent.click(screen.getByRole('button', { name: 'Focused review · My picks' }))

    const review = screen.getByRole('dialog', { name: 'Focused review' })
    expect(within(review).getByRole('heading', { name: 'The Clear Leader' })).toBeInTheDocument()
    expect(within(review).getByText(/My picks · Match 1 of 1/iu)).toBeInTheDocument()
  })

  it('uses the active Explore all filters for focused review', async () => {
    renderDashboard()
    await screen.findByRole('heading', { name: 'The Clear Leader' })

    fireEvent.click(screen.getByRole('tab', { name: /Explore all 2/i }))
    fireEvent.change(screen.getByPlaceholderText('Search shows, hosts, or topics'), {
      target: { value: 'Founder' },
    })
    await waitFor(() => expect(screen.queryByRole('heading', { name: 'The Clear Leader' })).not.toBeInTheDocument())
    fireEvent.click(screen.getByRole('button', { name: 'Focused review · Explore all' }))

    const review = screen.getByRole('dialog', { name: 'Focused review' })
    expect(within(review).getByRole('heading', { name: 'Founder Signal' })).toBeInTheDocument()
    expect(within(review).getByText(/Explore all · Match 1 of 1/iu)).toBeInTheDocument()
  })
})
