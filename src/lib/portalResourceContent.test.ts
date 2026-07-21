import { describe, expect, it } from 'vitest'
import { sanitizePortalResourceContent } from '@/lib/portalResourceContent'

describe('sanitizePortalResourceContent', () => {
  it('preserves formatting and hardens safe links', () => {
    const html = sanitizePortalResourceContent(
      '<h2>Checklist</h2><p><strong>Prepare</strong> <a href="https://example.com/guide">here</a>.</p>',
    )

    expect(html).toContain('<h2>Checklist</h2>')
    expect(html).toContain('<strong>Prepare</strong>')
    expect(html).toContain('href="https://example.com/guide"')
    expect(html).toContain('target="_blank"')
    expect(html).toContain('rel="noopener noreferrer"')
  })

  it('preserves safe nested structural HTML while keeping headings consistent', () => {
    const html = sanitizePortalResourceContent(
      '<section><h5>Schedule</h5><table><tbody><tr><th>When</th><td>Tuesday</td></tr></tbody></table></section>',
    )

    expect(html).toContain('<section>')
    expect(html).toContain('<h5>Schedule</h5>')
    expect(html).toContain('<table>')
    expect(html).toContain('<td>Tuesday</td>')
  })

  it('removes tracking, form, embed, style, and event-handler surfaces', () => {
    const html = sanitizePortalResourceContent(
      '<img src="https://tracker.example/pixel"><form action="https://evil.example"><input name="password"></form><iframe src="https://evil.example"></iframe><p style="position:fixed" onclick="alert(1)">Safe text</p>',
    )

    expect(html).toBe('<p>Safe text</p>')
  })

  it('keeps unsafe anchors as text without navigation', () => {
    const html = sanitizePortalResourceContent(
      '<a href="javascript:alert(1)">Bad</a><a href="https://user:pass@example.com">Credentials</a>',
    )

    expect(html).toBe('<a>Bad</a><a>Credentials</a>')
  })
})
