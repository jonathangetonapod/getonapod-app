import { describe, expect, it } from 'vitest'
import { bulkImportFailureMessage, bulkImportNotice, dashboardFetchNotices } from '@/lib/podscanOutcomes'

const show = { podcast_id: 'pd_1' }

describe('dashboardFetchNotices', () => {
  it('says the sheet is empty only when nothing failed and nothing is left', () => {
    expect(dashboardFetchNotices({ podcasts: [], fetched: 0, failed: 0 })).toEqual([{
      title: 'No podcasts found',
      description: 'Google Sheet is empty or has no valid podcast IDs',
      destructive: true,
    }])
  })

  it('says Podscan failed, not "empty sheet", when every show failed', () => {
    const notices = dashboardFetchNotices({ podcasts: [], fetched: 0, failed: 20 })
    expect(notices).toEqual([{
      title: '20 podcasts could not be fetched',
      description: 'Podscan did not return them. Click again to retry, or check the IDs in the sheet.',
      destructive: true,
    }])
  })

  it('says the run stopped, not "empty sheet", when it ran out of time first', () => {
    expect(dashboardFetchNotices({ podcasts: [], fetched: 0, failed: 0, stoppedEarly: true, remaining: 30 })).toEqual([{
      title: 'Partial fetch — 0 new, 30 remaining',
      description: 'Click again to continue fetching',
    }])
  })

  it('reports a complete fetch and adds the failures after it', () => {
    const notices = dashboardFetchNotices({ podcasts: [show, show], cached: 1, fetched: 1, failed: 1 })
    expect(notices.map((notice) => notice.title)).toEqual(['✅ Metadata Cache Complete', '1 podcast could not be fetched'])
    expect(notices[0].description).toBe('1 from cache, 1 newly fetched. Click "Run AI Analysis" to personalize.')
  })

  it('reports a partial fetch with what is left', () => {
    const notices = dashboardFetchNotices({ podcasts: [show], fetched: 10, failed: 0, stoppedEarly: true, remaining: 15 })
    expect(notices.map((notice) => notice.title)).toEqual(['Partial fetch — 10 new, 15 remaining'])
  })
})

describe('bulkImportNotice', () => {
  it('reports a clean import', () => {
    expect(bulkImportNotice({ saved: 120, keywords: 'founders', failedPages: 0, cancelled: false }))
      .toEqual({ kind: 'success', message: 'Imported 120 podcasts from "founders"' })
  })

  it('warns about skipped pages', () => {
    expect(bulkImportNotice({ saved: 100, keywords: 'founders', failedPages: 1, cancelled: false }))
      .toEqual({ kind: 'warning', message: 'Imported 100 podcasts from "founders". 1 page could not be fetched and was skipped.' })
    expect(bulkImportNotice({ saved: 100, keywords: 'founders', failedPages: 3, cancelled: false }).message)
      .toBe('Imported 100 podcasts from "founders". 3 pages could not be fetched and were skipped.')
  })

  it('says what was kept when cancelled', () => {
    expect(bulkImportNotice({ saved: 40, keywords: 'founders', failedPages: 2, cancelled: true }))
      .toEqual({ kind: 'success', message: 'Cancelled. 40 podcasts saved before stopping.' })
  })
})

describe('bulkImportFailureMessage', () => {
  it('adds what was saved before the stop', () => {
    expect(bulkImportFailureMessage(new Error('Import stopped at page 3. The podcast index rejected the request (error 403).'), 100))
      .toBe('Import stopped at page 3. The podcast index rejected the request (error 403). 100 podcasts were saved before it stopped.')
  })

  it('gives the reason alone when nothing was saved', () => {
    expect(bulkImportFailureMessage(new Error('Preview failed'), 0)).toBe('Preview failed')
    expect(bulkImportFailureMessage('weird', 0)).toBe('Bulk import failed.')
  })
})
