export function safeExternalUrl(value: string): string | null {
  try {
    const url = new URL(value)
    if (url.protocol !== 'https:' && url.protocol !== 'http:') return null
    if (url.username || url.password) return null
    return url.toString()
  } catch {
    return null
  }
}

export function openExternalUrl(value: string): boolean {
  try {
    const url = safeExternalUrl(value)
    if (!url) return false

    const opened = window.open(url, '_blank', 'noopener,noreferrer')
    if (opened) opened.opener = null
    return true
  } catch {
    return false
  }
}
