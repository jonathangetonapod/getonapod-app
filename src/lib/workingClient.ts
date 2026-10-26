/*
 * The client a person is working on, remembered per person and per workspace
 * across visits. It used to last only as long as the tab, so every new tab or
 * next morning started on All clients and the one-click add was gone until
 * somebody picked the same client again.
 */
const WORKING_CLIENT_STORAGE_PREFIX = 'workspace-working-client-v2'

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu

/*
 * The modules that read ?client= from their address. Anything else would
 * carry a parameter it ignores, which reads as a bug in the address bar.
 */
export const CLIENT_SCOPED_SEGMENTS = new Set([
  'podcast-finder',
  'podcast-database',
  'client-podcast-system',
  'onboarding',
  'client-campaigns',
])

export function workingClientStorageKey(workspaceId: string, userId: string): string {
  return `${WORKING_CLIENT_STORAGE_PREFIX}:${userId.toLowerCase()}:${workspaceId.toLowerCase()}`
}

export function normalizeWorkingClientId(value: string | null | undefined): string | null {
  const candidate = (value || '').trim().toLowerCase()
  return UUID_PATTERN.test(candidate) ? candidate : null
}

export function readWorkingClient(workspaceId: string, userId: string | null | undefined): string | null {
  if (!workspaceId || !userId || typeof window === 'undefined') return null
  try {
    return normalizeWorkingClientId(window.localStorage.getItem(workingClientStorageKey(workspaceId, userId)))
  } catch {
    // The layout still works without a remembered client when storage is unavailable.
    return null
  }
}

export function writeWorkingClient(workspaceId: string, userId: string | null | undefined, clientId: string | null): void {
  if (!workspaceId || !userId || typeof window === 'undefined') return
  const key = workingClientStorageKey(workspaceId, userId)
  const normalized = normalizeWorkingClientId(clientId)
  try {
    if (normalized) window.localStorage.setItem(key, normalized)
    else window.localStorage.removeItem(key)
  } catch {
    // The selection still applies in this render when storage is unavailable.
  }
}

/*
 * Where a sidebar item leads once a working client is set: the modules that
 * filter by ?client= get the parameter; everything else is unchanged. Client
 * Campaigns opens its list filtered to the client, not that client's campaign
 * page, so a client with no campaign yet lands on the way to assign one.
 */
export function clientScopedHref(baseHref: string, segment: string, clientId: string | null): string {
  const href = `${baseHref}/${segment}`
  if (!clientId) return href
  if (CLIENT_SCOPED_SEGMENTS.has(segment)) return `${href}?client=${clientId}`
  return href
}
