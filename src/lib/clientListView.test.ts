import { describe, expect, it } from 'vitest'
import { clientListView } from './clientListView'

const client = (name: string, status: 'active' | 'paused' | 'churned', extra: Record<string, unknown> = {}) => ({
  name, status, email: null, contact_person: null, website: null, updated_at: '2026-01-01T00:00:00Z', ...extra,
})
const names = (rows: Array<{ name: string }>) => rows.map((row) => row.name)

describe('clientListView', () => {
  const clients = [
    client('Zed', 'active'),
    client('Old Co', 'churned'),
    client('Mia', 'paused', { email: 'mia@guidingfinancial.com', updated_at: '2026-11-01T00:00:00Z' }),
    client('Amy', 'active', { contact_person: 'Frank Torres', ai_sdr_profile_ready: true }),
  ]

  it('puts active clients first and churned last by default', () => {
    expect(names(clientListView(clients, { search: '', status: 'all', sort: 'status' }))).toEqual(['Amy', 'Zed', 'Mia', 'Old Co'])
  })

  it('searches name, contact, email and website', () => {
    expect(names(clientListView(clients, { search: 'frank', status: 'all', sort: 'status' }))).toEqual(['Amy'])
    expect(names(clientListView(clients, { search: 'GUIDING', status: 'all', sort: 'status' }))).toEqual(['Mia'])
  })

  it('filters by status and sorts by name, recency or brief progress', () => {
    expect(names(clientListView(clients, { search: '', status: 'churned', sort: 'status' }))).toEqual(['Old Co'])
    expect(names(clientListView(clients, { search: '', status: 'all', sort: 'name' }))).toEqual(['Amy', 'Mia', 'Old Co', 'Zed'])
    expect(names(clientListView(clients, { search: '', status: 'all', sort: 'updated' }))[0]).toBe('Mia')
    expect(names(clientListView(clients, { search: '', status: 'all', sort: 'brief' })).at(-1)).toBe('Amy')
  })
})
