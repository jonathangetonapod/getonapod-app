import { describe, expect, it } from 'vitest'
import {
  OUTREACH_STAGE_LABELS,
  PLACEMENT_STATUS_LABELS,
  outreachStageLabel,
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
