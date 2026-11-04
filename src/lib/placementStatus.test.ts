import { describe, expect, it } from 'vitest'
import {
  OUTREACH_STAGE_LABELS,
  PLACEMENT_STATUS_LABELS,
  outreachStageLabel,
  placementOverdueDays,
  placementStatusLabel,
} from '@/lib/placementStatus'

describe('placementStatus', () => {
  it('gives every booking status a client-facing label', () => {
    expect(PLACEMENT_STATUS_LABELS).toEqual({
      conversation_started: 'Talking to the host',
      in_progress: 'Talking to the host',
      booked: 'Booked',
      recorded: 'Recorded',
      published: 'Live',
      cancelled: 'Cancelled',
    })
  })

  it('gives every outreach stage a client-facing label', () => {
    expect(OUTREACH_STAGE_LABELS).toEqual({
      preparing: 'Pitch being written',
      contacted: 'Pitch sent',
      replied: 'Host replied',
      completed: 'Conversation closed',
    })
  })

  it('reads an unknown key as words rather than nothing', () => {
    expect(placementStatusLabel('published')).toBe('Live')
    expect(placementStatusLabel('shadow_banned')).toBe('shadow banned')
    expect(outreachStageLabel('replied')).toBe('Host replied')
    expect(outreachStageLabel('on_hold')).toBe('on hold')
  })
})

describe('placementOverdueDays', () => {
  const base = { scheduled_date: null, recording_date: null, publish_date: null, episode_url: null }
  it('counts days past the recording date until the placement is recorded', () => {
    expect(placementOverdueDays({ ...base, status: 'in_progress', scheduled_date: '2026-08-13' }, '2026-11-04')).toBe(83)
    expect(placementOverdueDays({ ...base, status: 'booked', recording_date: '2026-11-10' }, '2026-11-04')).toBe(0)
    expect(placementOverdueDays({ ...base, status: 'cancelled', scheduled_date: '2026-08-13' }, '2026-11-04')).toBe(0)
  })
  it('counts days past go-live for a recorded episode with no link', () => {
    expect(placementOverdueDays({ ...base, status: 'recorded', publish_date: '2026-08-04' }, '2026-11-04')).toBe(92)
    expect(placementOverdueDays({ ...base, status: 'recorded', publish_date: '2026-08-04', episode_url: 'https://x.example/ep' }, '2026-11-04')).toBe(0)
  })
})
