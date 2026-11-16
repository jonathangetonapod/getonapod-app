import { fireEvent, render, screen, within } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import PortalOutreach from '@/pages/portal/Outreach'
import { usePortalExperience } from '@/hooks/usePortalExperience'

vi.mock('@/components/portal/PortalLayout', () => ({ PortalLayout: ({ children }: { children: React.ReactNode }) => <div>{children}</div> }))
vi.mock('@/hooks/usePortalExperience', () => ({ usePortalExperience: vi.fn() }))

const mockedUseExperience = vi.mocked(usePortalExperience)

describe('PortalOutreach', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockedUseExperience.mockReturnValue({
      data: {
        outreach: {
          emails_sent: 42,
          podcasts_contacted: 18,
          replies: 5,
          meetings_booked: 2,
          in_outreach_count: 7,
          replied_count: 3,
          completed_count: 1,
        },
        outreach_targets: [
          {
            id: 't1',
            podcast_name: 'Founder Stories',
            podcast_image_url: null,
            stage: 'contacted',
            first_message_at: '2026-07-20T10:00:00.000Z',
            last_activity_at: '2026-07-24T10:00:00.000Z',
            opens: 3,
            replies: 0,
          },
          {
            id: 't2',
            podcast_name: 'Operator Weekly',
            podcast_image_url: null,
            stage: 'replied',
            first_message_at: '2026-07-10T10:00:00.000Z',
            last_activity_at: '2026-07-12T10:00:00.000Z',
            opens: 5,
            replies: 1,
          },
          {
            id: 't3',
            podcast_name: 'Growth Lab',
            podcast_image_url: null,
            stage: 'preparing',
            first_message_at: null,
            last_activity_at: null,
            opens: 0,
            replies: 0,
          },
        ],
        bookings: [
          { id: 'b1', podcast_name: 'Live Show', status: 'published', publish_date: '2026-07-01', scheduled_date: null, recording_date: null, episode_url: null, podcast_url: null, host_name: null, podcast_image_url: null, podcast_description: null, audience_size: null, itunes_rating: null, episode_count: null },
        ],
      },
      isLoading: false,
      error: null,
    } as never)
  })

  it('shows outreach stat tiles and the per-podcast activity feed', async () => {
    render(<PortalOutreach />)

    // One count for the page: the per-show record, lifted to the sending
    // platform's total where that runs ahead. "Meetings booked" was the
    // platform's own counter, not this client's bookings, and is gone.
    expect(await screen.findByText('Pitches in queue')).toBeInTheDocument()
    expect(screen.getByText('Pitches in queue').nextElementSibling).toHaveTextContent('0')
    expect(screen.getByText('Hosts emailed').nextElementSibling).toHaveTextContent('18')
    expect(screen.getByText('Replies').nextElementSibling).toHaveTextContent('5')
    expect(screen.getByText('Shows secured').nextElementSibling).toHaveTextContent('1')
    expect(screen.queryByText('Meetings booked')).not.toBeInTheDocument()
    expect(screen.getByText('1 show secured, 1 live')).toBeInTheDocument()
    expect(screen.getByText('Founder Stories')).toBeInTheDocument()
    expect(screen.getByText(/Emailed Jul 20, 2026/)).toBeInTheDocument()
    // Appears as both a stage badge and a pipeline row label.
    expect(screen.getAllByText('Host replied').length).toBeGreaterThan(0)
    expect(screen.getAllByText('Pitch sent').length).toBeGreaterThan(0)
    expect(screen.getByText('Your personalized pitch is being written')).toBeInTheDocument()
    expect(screen.getByText(/5 opens · 1 reply/)).toBeInTheDocument()
  })

  // The stage words are the shared client vocabulary, not the workspace's.
  it('summarizes the pipeline from outreach stages and booking statuses', async () => {
    render(<PortalOutreach />)

    const pipeline = await screen.findByLabelText('Your pipeline')
    expect(pipeline).toHaveTextContent('Pitch being written')
    expect(pipeline).toHaveTextContent('Pitch sent')
    expect(pipeline).toHaveTextContent('Host replied')
    expect(pipeline).toHaveTextContent('Talking to the host')
    expect(pipeline).toHaveTextContent('Live')
    expect(pipeline).not.toHaveTextContent('Published')
    expect(pipeline).not.toHaveTextContent('Message sent')
    expect(screen.getByLabelText('Bar chart of outreach messages sent per month')).toBeInTheDocument()
  })

  // A pitch added straight into the sending campaign is written and waiting
  // to go out: not "being written", and not yet "sent".
  it('shows a pitch waiting in the sending campaign as scheduled', async () => {
    mockedUseExperience.mockReturnValue({
      data: {
        outreach: null,
        outreach_targets: [
          {
            id: 'q1',
            podcast_name: 'Exit Insights',
            podcast_image_url: null,
            stage: 'queued',
            first_message_at: null,
            queued_at: '2026-11-16T10:00:00.000Z',
            last_activity_at: '2026-11-16T12:00:00.000Z',
            opens: 0,
            replies: 0,
          },
        ],
        bookings: [],
      },
      isLoading: false,
      error: null,
    } as never)

    render(<PortalOutreach />)

    const pipeline = await screen.findByLabelText('Your pipeline')
    expect(pipeline).toHaveTextContent('Pitch scheduled')
    expect(screen.getByText(/Pitch written and scheduled to send · Added to outreach Nov 16, 2026/)).toBeInTheDocument()
    expect(screen.queryByText('Your personalized pitch is being written')).not.toBeInTheDocument()
    expect(screen.queryByText(/Latest activity/)).not.toBeInTheDocument()
  })

  it('filters the activity list by stage', async () => {
    render(<PortalOutreach />)

    const filters = await screen.findByRole('group', { name: 'Filter shows by stage' })
    expect(within(filters).getByRole('button', { name: /All 3/ })).toHaveAttribute('aria-pressed', 'true')
    fireEvent.click(within(filters).getByRole('button', { name: /Host replied 1/ }))

    expect(screen.getByText('Operator Weekly')).toBeInTheDocument()
    expect(screen.queryByText('Founder Stories')).not.toBeInTheDocument()
    expect(screen.queryByText('Growth Lab')).not.toBeInTheDocument()
  })

  // The pipeline reads the server's totals, which stay exact when the list
  // carries only the two hundred shows furthest along.
  it('draws the pipeline from the server totals and says when the list is partial', async () => {
    mockedUseExperience.mockReturnValue({
      data: {
        outreach: null,
        outreach_pipeline: { preparing: 0, queued: 240, contacted: 10, replied: 0, completed: 0 },
        outreach_targets: [
          { id: 'q1', podcast_name: 'Exit Insights', podcast_image_url: null, stage: 'queued', first_message_at: null, queued_at: null, last_activity_at: null, opens: 0, replies: 0 },
        ],
        bookings: [],
      },
      isLoading: false,
      error: null,
    } as never)

    render(<PortalOutreach />)

    expect((await screen.findByText('Pitches in queue')).nextElementSibling).toHaveTextContent('240')
    expect(screen.getByText('Your pitch has reached 10 hosts')).toBeInTheDocument()
    expect(screen.getByText('Showing the 1 show furthest along, of 250 in outreach.')).toBeInTheDocument()
    // No month has anything to chart, so the two charts stay out of the way.
    expect(screen.queryByText('Pitches emailed by month')).not.toBeInTheDocument()
  })

  it('renders friendly empty states without outreach data', async () => {
    mockedUseExperience.mockReturnValue({
      data: { outreach: null, outreach_targets: [], bookings: [] },
      isLoading: false,
      error: null,
    } as never)

    render(<PortalOutreach />)

    expect(await screen.findByText(/Outreach activity appears here once your team starts contacting/)).toBeInTheDocument()
    expect(screen.getByText(/Your pipeline fills in as soon as/)).toBeInTheDocument()
  })
})
