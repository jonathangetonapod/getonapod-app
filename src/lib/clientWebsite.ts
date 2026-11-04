import { repairableExternalUrl } from '@/lib/externalUrl'

/*
 * Client websites arrive however somebody typed them: "missioninbox.com",
 * "www.theexporter.ca ", "https://dura-foam.com/". Saved, they become one
 * shape (https, no trailing slash on a bare domain); shown, they read as the
 * plain domain. Text that is not a web address is kept as typed rather than
 * guessed at.
 */
export function normalizeClientWebsite(value: string | null | undefined): string | null {
  const trimmed = (value ?? '').trim()
  if (!trimmed) return null
  const url = repairableExternalUrl(trimmed)
  if (!url) return trimmed
  const parsed = new URL(url)
  return parsed.pathname === '/' && !parsed.search && !parsed.hash ? `${parsed.protocol}//${parsed.host}` : url
}

/** A website as people read it: "drdds.com", "example.com/about". */
export function displayClientWebsite(value: string | null | undefined): string | null {
  const trimmed = (value ?? '').trim()
  if (!trimmed) return null
  const url = repairableExternalUrl(trimmed)
  if (!url) return trimmed
  const parsed = new URL(url)
  const path = `${parsed.pathname}${parsed.search}${parsed.hash}`.replace(/\/$/u, '')
  return `${parsed.host.replace(/^www\./u, '')}${path === '/' ? '' : path}`
}
