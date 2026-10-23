/**
 * Any other numeric reference, &#233; and &#xE9; alike, is the character it
 * names. Control characters, surrogates and out-of-range codes stay as written.
 */
function numericEntity(key: string): string | null {
  if (!key.startsWith('#')) return null
  const code = key[1] === 'x' ? Number.parseInt(key.slice(2), 16) : Number.parseInt(key.slice(1), 10)
  if (!Number.isInteger(code) || code < 32 || code > 0x10ffff || (code >= 0xd800 && code <= 0xdfff)) return null
  return code === 160 ? ' ' : String.fromCodePoint(code)
}

/**
 * Podcast feeds publish names and descriptions as HTML: entities in titles
 * ("The Good, Bad, &amp; the Ugly") and <p> tags in descriptions. Decode once
 * at the service boundary so no surface — a list cell, a dialog, or an email a
 * host actually reads — renders markup.
 *
 * This mirrors decodeFeedText in supabase/functions/_shared/promptVariables.ts.
 * The two runtimes cannot share a module, so they share behaviour instead and
 * a host sees the same show name whether it came from a prompt or a draft.
 */
export function decodeFeedText(value: string): string {
  const withoutTags = value
    .replace(/<br\s*\/?>/giu, '\n')
    .replace(/<\/(p|div|h[1-6])>/giu, '\n\n')
    .replace(/<\/(li|tr)>/giu, '\n')
    .replace(/<[a-zA-Z/][^>]*>/gu, ' ')
  // One pass, so an escaped entity like "&amp;lt;" decodes to "&lt;" and not
  // to "<": decoding the ampersand separately would re-read its own output.
  const decoded = withoutTags.replace(
    /&(nbsp|amp|lt|gt|quot|apos|hellip|ndash|mdash|[lr]squo|[lr]dquo|#\d{1,7}|#x[0-9a-f]{1,6});/giu,
    (entity) => {
      const key = entity.slice(1, -1).toLowerCase()
      switch (key) {
        case 'nbsp': return ' '
        case 'amp': return '&'
        case 'lt': return '<'
        case 'gt': return '>'
        case 'quot': case 'ldquo': case 'rdquo': case '#8220': case '#8221': return '"'
        case 'apos': case '#39': case '#039': case '#x27': return "'"
        case 'lsquo': case '#8216': return '‘'
        case 'rsquo': case '#8217': return '’'
        case 'hellip': case '#8230': return '…'
        case 'ndash': case '#8211': return '–'
        case 'mdash': case '#8212': return '—'
        default: return numericEntity(key) ?? entity
      }
    },
  )
  // The space a stripped tag leaves behind is an artefact of the markup, so it
  // does not survive next to a break it did not create.
  return decoded
    .replace(/[ \t]+/gu, ' ')
    .replace(/[ \t]*\n[ \t]*/gu, '\n')
    .replace(/\n{3,}/gu, '\n\n')
    .trim()
}
