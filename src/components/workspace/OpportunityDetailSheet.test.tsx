import { fireEvent, render, screen, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { describe, expect, it, vi } from 'vitest'
import { OpportunityDetailSheet } from '@/components/workspace/OpportunityDetailSheet'
import type { ClientPodcastSystemItem } from '@/services/clientPodcastSystem'

const clientId = '22222222-2222-4222-8222-222222222222'

const item: ClientPodcastSystemItem = {
  id: 'shortlist-two',
  client: { id: clientId, name: 'Taylor Client', status: 'active', photo_url: null },
  podcast: {
    id: '44444444-4444-4444-8444-444444444444',
    podscan_id: 'podscan-two',
    name: 'Operator Stories',
    description: 'Operator interviews.',
    image_url: null,
    url: 'https://podcasts.example.com/operator-stories',
    publisher_name: 'Frequency Media',
    host_name: 'Jamie Operator',
    audience_size: 25_000,
    last_posted_at: '2026-07-20T12:00:00.000Z',
  },
  stage: 'ready',
  outcome: null,
  terminal: false,
  has_conflict: false,
  next_action: 'Launch the reviewed campaign pitch',
  contact: {
    available: true,
    source: 'direct',
    email: 'jamie@operator.example',
    verified_at: '2026-07-24T10:00:00.000Z',
  },
  decision: { status: 'approved', notes: 'Strong fit for the launch.', updated_at: '2026-07-23T12:00:00.000Z' },
  analysis: {
    source: 'normalized',
    clean_description: 'A practical operator show for growth-stage teams.',
    fit_reasons: ['Taylor has operating experience that fits this audience.'],
    pitch_angles: [{ title: 'Durable growth', description: 'How founders can scale without operational debt.' }],
    analyzed_at: '2026-07-24T12:00:00.000Z',
  },
  campaign: {
    id: '55555555-5555-4555-8555-555555555555',
    target_id: '66666666-6666-4666-8666-666666666666',
    status: 'ready',
    research_ready: true,
    pitch_ready: true,
    open_count: 0,
    reply_count: 0,
    launched_at: null,
    last_activity_at: null,
    last_error: null,
  },
  legacy_outreach_at: null,
  conversation: null,
  booking: null,
  operator_notes: null,
  shortlist_created_at: '2026-07-20T12:00:00.000Z',
  shortlist_updated_at: '2026-07-24T12:00:00.000Z',
  last_activity_at: '2026-07-24T12:00:00.000Z',
}

function renderSheet(props: Partial<React.ComponentProps<typeof OpportunityDetailSheet>> = {}) {
  const onOpenChange = vi.fn()
  const onLogPlacement = vi.fn()
  render(
    <MemoryRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
      <OpportunityDetailSheet
        item={item}
        onOpenChange={onOpenChange}
        baseHref="/app"
        canManage
        onLogPlacement={onLogPlacement}
        {...props}
      />
    </MemoryRouter>,
  )
  return { onOpenChange, onLogPlacement }
}

describe('OpportunityDetailSheet', () => {
  it('shows the row in full, with every place its work continues', () => {
    const { onLogPlacement } = renderSheet()

    const sheet = screen.getByRole('dialog')
    expect(within(sheet).getByRole('heading', { name: 'Operator Stories' })).toBeInTheDocument()
    expect(within(sheet).getByText('Taylor Client · Ready to launch')).toBeInTheDocument()
    expect(within(sheet).getByText('jamie@operator.example')).toBeInTheDocument()
    expect(within(sheet).getByText('Taylor has operating experience that fits this audience.')).toBeInTheDocument()
    // The client record's shortlist tab, by its current id.
    expect(within(sheet).getByRole('link', { name: 'Client shortlist' })).toHaveAttribute(
      'href',
      `/app/clients/${clientId}?tab=shortlist`,
    )
    expect(within(sheet).getByRole('link', { name: 'Client campaign' })).toHaveAttribute(
      'href',
      `/app/client-campaigns/${clientId}`,
    )
    expect(within(sheet).getByRole('link', { name: 'Inbox' })).toHaveAttribute(
      'href',
      `/app/master-inbox?client=${clientId}`,
    )
    expect(within(sheet).getByRole('link', { name: /podcast page/i })).toHaveAttribute(
      'href',
      'https://podcasts.example.com/operator-stories',
    )

    fireEvent.click(within(sheet).getByRole('button', { name: 'Log a placement' }))
    expect(onLogPlacement).toHaveBeenCalledWith(item)
  })

  it('opens the host conversation directly when the inbox has read the thread', () => {
    renderSheet({
      item: {
        ...item,
        conversation: { thread_key: 'thread-42', status: 'needs_reply', replied: true, updated_at: '2026-07-27T10:00:00Z' },
      },
    })

    const sheet = screen.getByRole('dialog')
    expect(within(sheet).getByText('Host replied')).toBeInTheDocument()
    expect(within(sheet).getByRole('link', { name: 'Open conversation' })).toHaveAttribute(
      'href',
      `/app/master-inbox?client=${clientId}&thread=thread-42`,
    )
  })

  it('keeps contact emails and the placement action from members', () => {
    renderSheet({ canManage: false })

    const sheet = screen.getByRole('dialog')
    expect(within(sheet).queryByText('jamie@operator.example')).not.toBeInTheDocument()
    expect(within(sheet).queryByRole('button', { name: 'Log a placement' })).not.toBeInTheDocument()
    expect(within(sheet).getByText(/Owners and admins manage client decisions/i)).toBeInTheDocument()
  })

  it('hides the placement action where the surface logs placements elsewhere', () => {
    renderSheet({ onLogPlacement: undefined })

    expect(screen.queryByRole('button', { name: 'Log a placement' })).not.toBeInTheDocument()
  })

  it('names the existing booking action and its milestones', () => {
    renderSheet({
      item: {
        ...item,
        stage: 'published',
        terminal: true,
        booking: {
          id: '88888888-8888-4888-8888-888888888888',
          match: 'podcast_id',
          status: 'published',
          host_name: 'Jamie Operator',
          scheduled_date: '2026-06-10',
          recording_date: '2026-06-12',
          publish_date: '2026-07-01',
          episode_url: 'https://podcasts.example.com/operator-stories/episode-42',
          prep_sent: true,
          notes: null,
          created_at: '2026-06-01T12:00:00.000Z',
          updated_at: '2026-07-01T12:00:00.000Z',
        },
      },
    })

    const sheet = screen.getByRole('dialog')
    expect(within(sheet).getByRole('heading', { name: 'Booking milestones' })).toBeInTheDocument()
    expect(within(sheet).getByText('Jul 1, 2026')).toBeInTheDocument()
    expect(within(sheet).getByRole('button', { name: 'Update placement' })).toBeInTheDocument()
    expect(within(sheet).getByRole('link', { name: /listen to episode/i })).toHaveAttribute(
      'href',
      'https://podcasts.example.com/operator-stories/episode-42',
    )
  })

  it('stays closed with nothing to show', () => {
    renderSheet({ item: null })
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })
})
