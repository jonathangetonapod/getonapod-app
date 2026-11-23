import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const calls: Array<[string, unknown[]]> = []
const builder: Record<string, (...args: unknown[]) => unknown> = {}
for (const method of ['select', 'or', 'contains', 'gte', 'lte', 'not', 'eq', 'order', 'range', 'is', 'limit', 'gt', 'abortSignal']) {
  builder[method] = (...args: unknown[]) => {
    calls.push([method, args])
    return builder
  }
}
const queuedResults: unknown[] = []
;(builder as { then?: unknown }).then = (resolve: (value: unknown) => void) =>
  resolve(queuedResults.length ? queuedResults.shift() : { data: [], error: null, count: 0 })

vi.mock('@/lib/supabase', () => ({
  supabase: { from: vi.fn(() => builder) },
}))

import {
  bestPodcastEmail,
  csvCell,
  exportAllPodcastsWithEmailsToCSV,
  getPodcasts,
  podcastSortColumn,
} from '@/services/podcastDatabase'

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

describe('exportAllPodcastsWithEmailsToCSV', () => {
  let downloaded: Blob | null
  let clicks: string[]

  beforeEach(() => {
    calls.length = 0
    queuedResults.length = 0
    downloaded = null
    clicks = []
    window.URL.createObjectURL = vi.fn((blob: Blob) => {
      downloaded = blob
      return 'blob:podcasts'
    }) as typeof window.URL.createObjectURL
    window.URL.revokeObjectURL = vi.fn()
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (this: HTMLAnchorElement) {
      clicks.push(this.download)
    })
  })

  afterEach(() => {
    vi.restoreAllMocks()
    vi.useRealTimers()
  })

  it('pages through the whole table by id and downloads only rows with a usable contact email', async () => {
    queuedResults.push(
      {
        data: [
          { id: 'a1', podcast_name: 'First Show', contact_email: ' host@first.fm ', podscan_email: 'old@first.fm', contact_email_status: 'ok' },
          { id: 'a2', podcast_name: 'Blank Email', contact_email: '  ', podscan_email: 'feeds@spreaker.com' },
        ],
        error: null,
      },
      {
        data: [
          {
            id: 'b1',
            podcast_name: '=HYPERLINK("x")',
            contact_email: 'team@third.fm',
            email_addresses: ['team@third.fm', 'other@third.fm'],
            podcast_categories: [{ category_name: 'Business' }, { category_name: 'Tech' }],
            social_links: [{ platform: 'x', url: 'https://x.com/third' }],
            podcast_description: 'Line one\nLine "two"',
          },
        ],
        error: null,
      },
      { data: [], error: null },
    )
    const progress: number[] = []

    const exported = await exportAllPodcastsWithEmailsToCSV((n) => progress.push(n), 'out.csv')

    expect(exported).toBe(2)
    expect(progress).toEqual([1, 2])
    expect(clicks).toEqual(['out.csv'])
    expect(argsOf('gt')).toEqual([['id', 'a2'], ['id', 'b1']])
    expect(argsOf('is')).toContainEqual(['hidden_reason', null])
    expect(argsOf('is')).toContainEqual(['duplicate_of', null])
    expect(argsOf('not')).toContainEqual(['contact_email', 'is', null])
    expect(argsOf('limit')[0]).toEqual([1000])
    expect(argsOf('order')[0]).toEqual(['id', { ascending: true }])
    expect(argsOf('select')[0][0]).not.toMatch(/embedding|transcript|demographics|search_document/)

    const bytes = new Uint8Array(await new Promise<ArrayBuffer>((resolve) => {
      const reader = new FileReader()
      reader.onload = () => resolve(reader.result as ArrayBuffer)
      reader.readAsArrayBuffer(downloaded!)
    }))
    expect([...bytes.slice(0, 3)]).toEqual([0xef, 0xbb, 0xbf])
    const text = new TextDecoder('utf-8', { ignoreBOM: true }).decode(bytes)
    expect(text.charCodeAt(0)).toBe(0xfeff)
    expect(text).not.toContain('spreaker')
    const lines = text.slice(1).trim().split('\n')
    expect(lines[0].startsWith('"Email","Email Status"')).toBe(true)
    expect(lines[1].startsWith('"host@first.fm","ok","host@first.fm","old@first.fm"')).toBe(true)
    expect(lines[2].startsWith('"team@third.fm"')).toBe(true)
    expect(lines[2]).toContain('"team@third.fm; other@third.fm"')
    expect(lines[2]).toContain(`"'=HYPERLINK(""x"")"`)
    expect(lines[2]).toContain('"Business; Tech"')
    expect(lines[2]).toContain('"x: https://x.com/third"')
    expect(text).toContain('"Line one\nLine ""two"""')
  })

  it('retries a failed page before giving up', async () => {
    vi.useFakeTimers()
    queuedResults.push(
      { data: null, error: { message: 'timeout' } },
      { data: [{ id: 'a1', contact_email: 'host@first.fm' }], error: null },
      { data: [], error: null },
    )
    const run = exportAllPodcastsWithEmailsToCSV()
    await vi.runAllTimersAsync()
    await expect(run).resolves.toBe(1)
    // A fresh query and timeout per attempt; the retried first page still starts at the beginning.
    expect(argsOf('select')).toHaveLength(3)
    expect(argsOf('abortSignal')).toHaveLength(3)
    expect(new Set(argsOf('abortSignal').map(([signal]) => signal)).size).toBe(3)
    expect(argsOf('gt')).toEqual([['id', 'a1']])
  })

  it('stops with a clear error when a page keeps failing', async () => {
    vi.useFakeTimers()
    queuedResults.push(
      { data: null, error: { message: 'timeout' } },
      { data: null, error: { message: 'timeout' } },
      { data: null, error: { message: 'timeout' } },
    )
    const run = expect(exportAllPodcastsWithEmailsToCSV()).rejects.toThrow('Could not read podcasts: timeout')
    await vi.runAllTimersAsync()
    await run
    expect(clicks).toEqual([])
  })

  it('does not download an empty file', async () => {
    await expect(exportAllPodcastsWithEmailsToCSV()).rejects.toThrow('No podcasts with an email were found')
    expect(clicks).toEqual([])
  })

  it('uses only the contact email, never the raw Podscan field', () => {
    expect(bestPodcastEmail({ contact_email: ' a@x.com ', podscan_email: 'b@x.com' })).toBe('a@x.com')
    expect(bestPodcastEmail({ contact_email: ' ', podscan_email: 'b@x.com' })).toBe('')
    expect(bestPodcastEmail({ contact_email: null, email_addresses: ['c@x.com'] })).toBe('')
  })

  it('quotes cells and defuses spreadsheet formulas', () => {
    expect(csvCell('say "hi", ok')).toBe('"say ""hi"", ok"')
    expect(csvCell('+1 555')).toBe(`"'+1 555"`)
    expect(csvCell('@cmd')).toBe(`"'@cmd"`)
    expect(csvCell(null)).toBe('""')
    expect(csvCell(42)).toBe('"42"')
    expect(csvCell('-me@x.com', { email: true })).toBe('"-me@x.com"')
    expect(csvCell('=HYPERLINK("x")@a.b', { email: true })).toBe(`"'=HYPERLINK(""x"")@a.b"`)
    expect(csvCell("+cmd|' /C calc'!A0@x.com", { email: true })).toBe(`"'+cmd|' /C calc'!A0@x.com"`)
    expect(csvCell('-2+3', { email: true })).toBe(`"'-2+3"`)
  })
})
