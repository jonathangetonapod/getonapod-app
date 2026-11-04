import { beforeEach, describe, expect, it } from 'vitest'
import { isPortalPreview, markPortalPreview } from './portalPreviewMarker'

describe('portal preview marker', () => {
  beforeEach(() => sessionStorage.clear())

  it('marks only the previewed client, and only until the session expires', () => {
    markPortalPreview('client-a', '2099-01-01T00:00:00Z')
    expect(isPortalPreview('client-a')).toBe(true)
    expect(isPortalPreview('client-b')).toBe(false)
    expect(isPortalPreview('client-a', Date.parse('2100-01-01T00:00:00Z'))).toBe(false)
  })

  it('is not a preview without a marker or a client', () => {
    expect(isPortalPreview('client-a')).toBe(false)
    markPortalPreview('client-a', '2099-01-01T00:00:00Z')
    expect(isPortalPreview(null)).toBe(false)
  })
})
