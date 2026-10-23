import { describe, expect, it } from 'vitest'
import { intakeLastActivity, intakeStatus, type IntakeStatusInput } from '@/lib/intakeStatus'

const now = Date.parse('2026-10-20T12:00:00.000Z')
const daysAgo = (days: number) => new Date(now - days * 86_400_000).toISOString()

const intake = (overrides: Partial<IntakeStatusInput>): IntakeStatusInput => ({
  status: 'invited',
  invited_at: daysAgo(1),
  viewed_at: null,
  started_at: null,
  submitted_at: null,
  changes_requested_at: null,
  capability_expires_at: daysAgo(-13),
  progress_section: 0,
  delivery: { status: 'sent', sent_at: daysAgo(1) },
  ...overrides,
})

describe('intakeStatus', () => {
  it('gives every intake exactly one status', () => {
    expect(intakeStatus(intake({}), now)).toBe('in_progress')
    expect(intakeStatus(intake({ invited_at: daysAgo(4), delivery: null }), now)).toBe('chasing')
    expect(intakeStatus(intake({ invited_at: daysAgo(5), viewed_at: daysAgo(1) }), now)).toBe('in_progress')
    expect(intakeStatus(intake({ status: 'submitted' }), now)).toBe('review')
    expect(intakeStatus(intake({ status: 'approved' }), now)).toBe('approved')
    expect(intakeStatus(intake({ status: 'revoked' }), now)).toBe('expired')
  })

  it('treats a lapsed link as expired before the database catches up', () => {
    expect(intakeStatus(intake({ capability_expires_at: daysAgo(1) }), now)).toBe('expired')
  })

  it('chases an invitation email that never left', () => {
    expect(intakeStatus(intake({ delivery: { status: 'failed' } }), now)).toBe('chasing')
  })

  it('restarts the quiet clock when a reminder goes out', () => {
    expect(intakeStatus(intake({ invited_at: daysAgo(6), delivery: { status: 'sent', sent_at: daysAgo(1) } }), now)).toBe('in_progress')
  })
})

describe('intakeLastActivity', () => {
  it('names the most recent thing that happened', () => {
    expect(intakeLastActivity(intake({}), now)).toBe('Not opened')
    expect(intakeLastActivity(intake({ viewed_at: daysAgo(3) }), now)).toBe('Opened 3d ago')
    expect(intakeLastActivity(intake({ viewed_at: daysAgo(2), started_at: daysAgo(1), progress_section: 1 }), now)).toBe('Saved section 2 yesterday')
    expect(intakeLastActivity(intake({ status: 'submitted', submitted_at: daysAgo(0) }), now)).toBe('Submitted just now')
    expect(intakeLastActivity(intake({ invited_at: daysAgo(6), viewed_at: daysAgo(5), delivery: { status: 'sent', sent_at: daysAgo(2) } }), now)).toBe('Reminder sent 2d ago')
  })
})
