export function openExternalUrl(value: string): boolean {
  try {
    const url = new URL(value)
    if (url.protocol !== 'https:' && url.protocol !== 'http:') return false

    const opened = window.open(url.toString(), '_blank', 'noopener,noreferrer')
    if (opened) opened.opener = null
    return true
  } catch {
    return false
  }
}
