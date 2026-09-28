/*
 * The client a person is working on right now, remembered per workspace for
 * the length of the tab. Session rather than local storage: a working client
 * is a task, not a preference, and should not follow someone into tomorrow.
 */
const WORKING_CLIENT_STORAGE_PREFIX = 'workspace-working-client-v1'

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu

/*
 * The modules that read ?client= from their address. Anything else would
 * carry a parameter it ignores, which reads as a bug in the address bar.
 */
export const CLIENT_SCOPED_SEGMENTS = new Set([
  'podcast-finder',
  'podcast-database',
  'client-podcast-system',
  'master-inbox',
])

export function workingClientStorageKey(workspaceId: string): string {
  return `${WORKING_CLIENT_STORAGE_PREFIX}:${workspaceId.toLowerCase()}`
}

export function normalizeWorkingClientId(value: string | null | undefined): string | null {
  const candidate = (value || '').trim().toLowerCase()
  return UUID_PATTERN.test(candidate) ? candidate : null
}

export function readWorkingClient(workspaceId: string): string | null {
  if (!workspaceId || typeof window === 'undefined') return null
  try {
    return normalizeWorkingClientId(window.sessionStorage.getItem(workingClientStorageKey(workspaceId)))
  } catch {
    // The layout still works without a remembered client when storage is unavailable.
    return null
  }
}

export function writeWorkingClient(workspaceId: string, clientId: string | null): void {
  if (!workspaceId || typeof window === 'undefined') return
  const key = workingClientStorageKey(workspaceId)
  const normalized = normalizeWorkingClientId(clientId)
  try {
    if (normalized) window.sessionStorage.setItem(key, normalized)
    else window.sessionStorage.removeItem(key)
  } catch {
    // The selection still applies in this render when storage is unavailable.
  }
}

/*
 * Where a sidebar item leads once a working client is set. Client Campaigns
 * has a per-client detail route, so it goes straight there; the modules that
 * filter by ?client= get the parameter; everything else is unchanged.
 */
export function clientScopedHref(baseHref: string, segment: string, clientId: string | null): string {
  const href = `${baseHref}/${segment}`
  if (!clientId) return href
  if (segment === 'client-campaigns') return `${href}/${clientId}`
  if (CLIENT_SCOPED_SEGMENTS.has(segment)) return `${href}?client=${clientId}`
  return href
}
