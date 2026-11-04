// Marks this browser tab as a team member's portal preview, so the portal can
// say so. The real guard is server-side (portal-experience refuses changes
// from preview sessions); this only drives the banner.
const PREVIEW_MARKER_KEY = 'portal-preview-marker'

interface PortalPreviewMarker {
  clientId: string
  expiresAt: string
}

export function markPortalPreview(clientId: string, expiresAt: string): void {
  try {
    sessionStorage.setItem(PREVIEW_MARKER_KEY, JSON.stringify({ clientId, expiresAt }))
  } catch {
    // Storage blocked: the banner is lost, the server guard is not.
  }
}

export function isPortalPreview(clientId: string | null | undefined, now = Date.now()): boolean {
  if (!clientId) return false
  try {
    const raw = sessionStorage.getItem(PREVIEW_MARKER_KEY)
    if (!raw) return false
    const marker = JSON.parse(raw) as Partial<PortalPreviewMarker>
    return marker.clientId === clientId
      && typeof marker.expiresAt === 'string'
      && Date.parse(marker.expiresAt) > now
  } catch {
    return false
  }
}
