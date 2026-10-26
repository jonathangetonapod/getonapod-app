import { describe, expect, it } from 'vitest'
import {
  clientBriefStatus,
  clientSdrProfileReadiness,
  clientSdrProfilesEqual,
  isClientSdrProfile,
  normalizeClientSdrApprovedFields,
  normalizeClientSdrProfile,
} from '@/lib/clientSdrProfile'

describe('client AI SDR profile policy', () => {
  it('requires the four core fields while allowing recommended context later', () => {
    expect(clientSdrProfileReadiness({
      positioning: 'Taylor is a practical operations leader for growth-stage founders.',
      topics_and_angles: 'Sustainable scale, operator leverage, and durable systems.',
      listener_takeaways: 'A framework for finding and fixing the bottleneck behind stalled growth.',
      booking_details: 'Remote interviews preferred. Use the approved calendar link.',
    })).toEqual({
      ready: true,
      completed_fields: 4,
      total_fields: 6,
      missing_fields: ['proof_points', 'ideal_opportunities'],
      missing_core_fields: [],
    })
  })

  it('normalizes whitespace without treating unknown or non-string fields as approved context', () => {
    expect(normalizeClientSdrProfile({
      positioning: '  Approved positioning  ',
      ideal_opportunities: 42,
      unapproved_claims: 'Do not retain',
    })).toEqual({
      positioning: '',
      topics_and_angles: '',
      listener_takeaways: '',
      proof_points: '',
      ideal_opportunities: '',
      booking_details: '',
    })
    expect(isClientSdrProfile({ positioning: 42 })).toBe(false)
  })

  it('compares normalized profile values instead of object identity', () => {
    expect(clientSdrProfilesEqual(
      { positioning: 'Approved context' },
      { positioning: '  Approved context  ' },
    )).toBe(true)
  })

  it('accepts the documented maximum independently for every approved field', () => {
    const maximumField = 'x'.repeat(4_000)
    const profile = {
      positioning: maximumField,
      topics_and_angles: maximumField,
      listener_takeaways: maximumField,
      proof_points: maximumField,
      ideal_opportunities: maximumField,
      booking_details: maximumField,
    }

    expect(isClientSdrProfile(profile)).toBe(true)
    expect(clientSdrProfileReadiness(profile)).toMatchObject({
      ready: true,
      completed_fields: 6,
      missing_fields: [],
    })
  })
})

describe('clientBriefStatus', () => {
  const written = {
    positioning: 'a', topics_and_angles: 'b', listener_takeaways: 'c',
    proof_points: 'd', ideal_opportunities: '', booking_details: 'f',
  }

  it('reads each section as empty, draft or approved', () => {
    const status = clientBriefStatus(written, ['positioning', 'proof_points', 'ideal_opportunities'])
    expect(status.sections).toEqual({
      positioning: 'approved',
      topics_and_angles: 'draft',
      listener_takeaways: 'draft',
      proof_points: 'approved',
      // Approval of a section with no text does not count.
      ideal_opportunities: 'empty',
      booking_details: 'draft',
    })
    expect(status).toMatchObject({ approved_required: 1, total_required: 4, ready: false, started: true })
  })

  it('is ready once the four required sections are approved, extras or not', () => {
    const status = clientBriefStatus(written, ['positioning', 'topics_and_angles', 'listener_takeaways', 'booking_details'])
    expect(status).toMatchObject({ approved_required: 4, ready: true })
  })

  it('is not started with no text, and ignores unknown approvals', () => {
    expect(clientBriefStatus({}, ['positioning', 'nonsense'])).toMatchObject({ approved_required: 0, started: false, ready: false })
    expect(normalizeClientSdrApprovedFields('positioning', written)).toEqual([])
  })
})
