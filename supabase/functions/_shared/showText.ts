/**
 * Show names and publishers arrive from feeds and the Podscan catalog with
 * their HTML entities still encoded, so "Self-Awareness &amp; Mindset" was
 * stored and shown exactly like that. Decoded once on the way in.
 *
 * Mirrored by src/lib/showText.ts, which decodes rows already stored encoded.
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

export interface ShowDuplicate<T> {
  kept: T
  dropped: T
}

/**
 * One row per show. The same show is often listed under two feeds (a
 * relaunch, a re-upload), and both used to reach a prospect's featured five.
 * Keyed on normalized title plus publisher; the larger audience wins and
 * takes the place of whichever copy came first, so curated order holds.
 */
export function dedupeShows<T extends DedupableShow>(
  shows: T[],
): { shows: T[]; duplicates: ShowDuplicate<T>[] } {
  const slotByKey = new Map<string, number>()
  const kept: T[] = []
  const duplicates: ShowDuplicate<T>[] = []
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
    if (Number(show.audience_size || 0) > Number(current.audience_size || 0)) {
      kept[slot] = show
      duplicates.push({ kept: show, dropped: current })
    } else {
      duplicates.push({ kept: current, dropped: show })
    }
  }
  return { shows: kept, duplicates }
}
