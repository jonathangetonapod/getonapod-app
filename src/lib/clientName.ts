/*
 * "Jim's", but "James'": a name already ending in s takes the apostrophe
 * alone. Typographic apostrophe, matching the rest of the app's copy.
 */
export function possessive(name: string): string {
  const trimmed = name.trim()
  if (!trimmed) return trimmed
  return /s$/iu.test(trimmed) ? `${trimmed}’` : `${trimmed}’s`
}
