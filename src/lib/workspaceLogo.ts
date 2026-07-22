const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
const LOGO_OBJECT_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\.(png|jpg|webp)$/

export const WORKSPACE_LOGO_BUCKET = 'workspace-logos'
export const WORKSPACE_LOGO_MAX_BYTES = 2 * 1024 * 1024
export const WORKSPACE_LOGO_MIME_TYPES = ['image/jpeg', 'image/png', 'image/webp'] as const

export function workspaceLogoUrl(
  workspaceId: string | null | undefined,
  logoPath: string | null | undefined,
  logoUpdatedAt: string | null | undefined,
): string | null {
  const canonicalWorkspaceId = workspaceId?.trim().toLowerCase() || ''
  if (
    !UUID_PATTERN.test(canonicalWorkspaceId)
    || !logoPath
    || !logoUpdatedAt
    || !Number.isFinite(Date.parse(logoUpdatedAt))
  ) {
    return null
  }
  const [pathWorkspaceId, objectName, ...extra] = logoPath.split('/')
  if (
    extra.length > 0
    || pathWorkspaceId !== canonicalWorkspaceId
    || !LOGO_OBJECT_PATTERN.test(objectName || '')
  ) {
    return null
  }

  const supabaseUrl = import.meta.env.VITE_SUPABASE_URL?.trim()
  if (!supabaseUrl) return null
  try {
    const url = new URL(
      `/storage/v1/object/public/${WORKSPACE_LOGO_BUCKET}/${logoPath}`,
      supabaseUrl,
    )
    url.searchParams.set('v', String(Date.parse(logoUpdatedAt)))
    return url.toString()
  } catch {
    return null
  }
}
