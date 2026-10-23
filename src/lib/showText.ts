/**
 * Show names and publishers stored before the edge function decoded them still
 * carry HTML entities ("Self-Awareness &amp; Mindset"). Decoded at render so
 * existing rows read correctly without a backfill.
 *
 * Mirrors supabase/functions/_shared/showText.ts.
 */

const NAMED_ENTITIES: Record<string, string> = {
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  apos: "'",
  nbsp: ' ',
  ndash: '–',
  mdash: '—',
  lsquo: '‘',
  rsquo: '’',
  ldquo: '“',
  rdquo: '”',
  hellip: '…',
  copy: '©',
  reg: '®',
  trade: '™',
}

const ENTITY_PATTERN = /&(#x[0-9a-f]+|#[0-9]+|[a-z]+);/giu

function decodeOnce(value: string): string {
  return value.replace(ENTITY_PATTERN, (match, body: string) => {
    if (body[0] === '#') {
      const code = body[1] === 'x' || body[1] === 'X'
        ? Number.parseInt(body.slice(2), 16)
        : Number.parseInt(body.slice(1), 10)
      return Number.isFinite(code) && code > 0 && code <= 0x10ffff ? String.fromCodePoint(code) : match
    }
    return NAMED_ENTITIES[body.toLowerCase()] ?? match
  })
}

/** Decodes entities, including the double-encoded "&amp;amp;" some feeds send. */
export function decodeHtmlEntities(value: string): string
export function decodeHtmlEntities(value: string | null | undefined): string | null
export function decodeHtmlEntities(value: string | null | undefined): string | null {
  if (value === null || value === undefined) return null
  let current = value
  for (let pass = 0; pass < 3 && current.includes('&'); pass += 1) {
    const next = decodeOnce(current)
    if (next === current) break
    current = next
  }
  return current
}

/** Lowercased, entity-decoded, with punctuation and whitespace removed. */
export function normalizeShowText(value: string | null | undefined): string {
  return (decodeHtmlEntities(value) || '')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, '')
}

export interface DedupableShow {
  podcast_name: string
  publisher_name?: string | null
  audience_size?: number | null
}

/**
 * One row per show: the same show listed under two feeds is kept once, as the
 * feed with the larger audience, in the place of whichever copy came first.
 * Duplicates are reported to the console so the source can be fixed.
 */
export function dedupeShows<T extends DedupableShow>(shows: T[]): T[] {
  const slotByKey = new Map<string, number>()
  const kept: T[] = []
  for (const show of shows) {
    const name = normalizeShowText(show.podcast_name)
    if (!name) {
      kept.push(show)
      continue
    }
    const key = `${name}|${normalizeShowText(show.publisher_name)}`
    const slot = slotByKey.get(key)
    if (slot === undefined) {
      slotByKey.set(key, kept.length)
      kept.push(show)
      continue
    }
    const current = kept[slot]
    const replace = Number(show.audience_size || 0) > Number(current.audience_size || 0)
    if (replace) kept[slot] = show
    console.warn('Duplicate show feed hidden', {
      show: decodeHtmlEntities(show.podcast_name),
      kept_listeners: (replace ? show : current).audience_size ?? 0,
      hidden_listeners: (replace ? current : show).audience_size ?? 0,
    })
  }
  return kept
}
