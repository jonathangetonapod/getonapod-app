import DOMPurify from 'dompurify'
import { safeExternalUrl } from '@/lib/externalUrl'

const FORMATTING_TAGS = [
  'p',
  'br',
  'strong',
  'b',
  'em',
  'i',
  'u',
  's',
  'strike',
  'h1',
  'h2',
  'h3',
  'h4',
  'h5',
  'h6',
  'ul',
  'ol',
  'li',
  'blockquote',
  'pre',
  'code',
  'a',
  'hr',
  'div',
  'section',
  'article',
  'table',
  'thead',
  'tbody',
  'tr',
  'th',
  'td',
  'figure',
  'figcaption',
] as const

/**
 * Keep tenant-authored portal content formatting-only. Remote images, forms,
 * embeds, styles, and event handlers are deliberately excluded so a workspace
 * resource cannot become a tracking pixel or credential-collection surface.
 */
export function sanitizePortalResourceContent(content: string): string {
  const sanitized = DOMPurify.sanitize(content, {
    ALLOWED_TAGS: [...FORMATTING_TAGS],
    ALLOWED_ATTR: ['href', 'title'],
    ALLOW_DATA_ATTR: false,
  })
  const container = document.createElement('div')
  container.innerHTML = sanitized

  for (const anchor of container.querySelectorAll('a')) {
    const href = anchor.getAttribute('href')
    const safeHref = href ? safeExternalUrl(href) : null
    if (!safeHref) {
      anchor.removeAttribute('href')
      anchor.removeAttribute('target')
      anchor.removeAttribute('rel')
      continue
    }

    anchor.setAttribute('href', safeHref)
    anchor.setAttribute('target', '_blank')
    anchor.setAttribute('rel', 'noopener noreferrer')
  }

  return container.innerHTML
}
