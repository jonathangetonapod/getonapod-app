/**
 * A portal session rejection, as opposed to a network or server fault. Only
 * the former means the stored session is gone; the latter is worth a retry.
 * Lives apart from the service so a test that mocks the service keeps it.
 */
export function isPortalAuthError(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false
  const named = error as { name?: string; status?: number }
  return named.name === 'INVALID_PORTAL_SESSION' || named.status === 401
}
