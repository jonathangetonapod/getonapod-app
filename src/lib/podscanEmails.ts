const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

/**
 * Podscan sometimes packs several addresses into one field
 * ("host@show.com, someone@sponsor.com"). Split it into the distinct valid
 * addresses so the operator can choose one.
 */
export function podscanEmails(value: string | null | undefined): string[] {
  const seen = new Set<string>()
  return (value || '')
    .split(/[\s,;]+/)
    // Tolerate "Name <host@show.com>" and "mailto:host@show.com" forms.
    .map((part) => part.trim().replace(/^mailto:/i, '').replace(/^[<("']+|[>)"'.]+$/g, ''))
    .filter((part) => {
      const key = part.toLowerCase()
      if (!EMAIL_PATTERN.test(part) || seen.has(key)) return false
      seen.add(key)
      return true
    })
}
