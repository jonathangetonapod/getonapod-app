import { describe, expect, it } from 'vitest'
import type { ClientShortlistPodcast } from '@/services/clientShortlist'
import { buildPitchQueue } from './pitchQueue'

const row = (id: string, display_order: number, extra: Partial<ClientShortlistPodcast> = {}) => (
  { id, display_order, visibility: 'visible', feedback_status: null, ...extra } as ClientShortlistPodcast
)

describe('buildPitchQueue', () => {
  const podcasts = [
    row('c', 3),
    row('a', 1),
    row('archived', 2, { visibility: 'archived' }),
    row('rejected', 4, { feedback_status: 'rejected' }),
    row('b', 2),
  ]

  it('orders live, unrejected podcasts and links neighbours', () => {
    const queue = buildPitchQueue(podcasts, 'b')
    expect(queue.items.map((item) => item.id)).toEqual(['a', 'b', 'c'])
    expect(queue.index).toBe(1)
    expect(queue.previous?.id).toBe('a')
    expect(queue.next?.id).toBe('c')
  })

  it('has no neighbour past either end', () => {
    expect(buildPitchQueue(podcasts, 'a').previous).toBeNull()
    expect(buildPitchQueue(podcasts, 'c').next).toBeNull()
  })

  it('keeps the podcast on screen even when it would be left out', () => {
    const queue = buildPitchQueue(podcasts, 'rejected')
    expect(queue.items.map((item) => item.id)).toEqual(['a', 'b', 'c', 'rejected'])
    expect(queue.previous?.id).toBe('c')
    expect(queue.next).toBeNull()
  })
})
