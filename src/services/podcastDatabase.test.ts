import { beforeEach, describe, expect, it, vi } from 'vitest'

const calls: Array<[string, unknown[]]> = []
const builder: Record<string, (...args: unknown[]) => unknown> = {}
for (const method of ['select', 'or', 'contains', 'gte', 'lte', 'not', 'eq', 'order', 'range']) {
  builder[method] = (...args: unknown[]) => {
    calls.push([method, args])
    return builder
  }
}
;(builder as { then?: unknown }).then = (resolve: (value: unknown) => void) => resolve({ data: [], error: null, count: 0 })

vi.mock('@/lib/supabase', () => ({
  supabase: { from: vi.fn(() => builder) },
}))

import { getPodcasts, podcastSortColumn } from '@/services/podcastDatabase'

const argsOf = (method: string) => calls.filter(([name]) => name === method).map(([, args]) => args)

describe('getPodcasts', () => {
  beforeEach(() => {
    calls.length = 0
  })

  it('quotes each category so punctuation in a name cannot change the filter', async () => {
    await getPodcasts({ filters: { categories: ['Business', 'Health, Fitness),id.not.is.null', '', '  '] } })

    const [orFilter] = argsOf('or')
    expect(orFilter[0]).toBe(
      'podcast_categories.cs."[{\\"category_name\\":\\"Business\\"}]",'
      + 'podcast_categories.cs."[{\\"category_name\\":\\"Health, Fitness),id.not.is.null\\"}]"',
    )
  })

  it('skips the category filter when nothing valid is left', async () => {
    await getPodcasts({ filters: { categories: ['', 'x'.repeat(201)] } })
    expect(argsOf('or')).toHaveLength(0)
  })

  it('sorts only by allowlisted columns', async () => {
    await getPodcasts({ sortBy: 'audience', sortOrder: 'desc' })
    expect(argsOf('order')[0]).toEqual(['audience_size', { ascending: false, nullsFirst: false }])

    calls.length = 0
    await getPodcasts({ sortBy: 'podscan_email' })
    expect(argsOf('order')[0][0]).toBe('podcast_name')

    expect(podcastSortColumn('prs')).toBe('podcast_reach_score')
    expect(podcastSortColumn('created_at')).toBe('created_at')
    expect(podcastSortColumn('constructor')).toBe('podcast_name')
    expect(podcastSortColumn(undefined)).toBe('podcast_name')
  })
})
