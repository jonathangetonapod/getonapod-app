import { describe, expect, it } from 'vitest'
import { isOpenJoinRequest, isTestJoinRequest } from '@/lib/joinRequestTriage'
import type { JoinRequest } from '@/services/accessRequests'

const request = (overrides: Partial<JoinRequest>): JoinRequest => ({
  id: 'r1',
  email: 'dana@example.com',
  full_name: 'Dana Reyes',
  company: null,
  website: null,
  audience: 'agency',
  clients_now: null,
  notes: null,
  status: 'new',
  handled_at: null,
  handled_note: null,
  created_at: '2026-08-01T00:00:00Z',
  ...overrides,
})

describe('isTestJoinRequest', () => {
  it('recognises the deploy smoke check rows', () => {
    expect(isTestJoinRequest(request({ full_name: 'Deployment check (please decline)', email: 'deploy-check@getonapod.com' }))).toBe(true)
    expect(isTestJoinRequest(request({ full_name: 'Rate limit check 4', email: 'burst-4@getonapod.com' }))).toBe(true)
  })

  it('does not catch a real person, even on our own domain', () => {
    expect(isTestJoinRequest(request({}))).toBe(false)
    expect(isTestJoinRequest(request({ full_name: 'Sam Ortiz', email: 'sam@getonapod.com' }))).toBe(false)
  })
})

describe('isOpenJoinRequest', () => {
  it('counts waiting and contacted real requests only', () => {
    expect(isOpenJoinRequest(request({ status: 'new' }))).toBe(true)
    expect(isOpenJoinRequest(request({ status: 'contacted' }))).toBe(true)
    expect(isOpenJoinRequest(request({ status: 'invited' }))).toBe(false)
    expect(isOpenJoinRequest(request({ status: 'declined' }))).toBe(false)
    expect(isOpenJoinRequest(request({ full_name: 'Rate limit check 2', email: 'burst-2@getonapod.com' }))).toBe(false)
  })
})
