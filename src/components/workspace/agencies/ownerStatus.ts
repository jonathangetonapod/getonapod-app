import { formatDate } from '@/lib/dates'
import type { DeletedAdminWorkspace } from '@/services/adminWorkspaces'
import type { ManagedWorkspaceUser } from '@/services/workspaceUsers'

/** The lifecycle words a workspace row can show, in filter order. */
export type WorkspaceStatusKey = 'active' | 'invited' | 'expired' | 'suspended'

export interface WorkspaceStatus {
  key: WorkspaceStatusKey
  label: string
  /** Muted line under the pill, if any. */
  detail: string | null
  className: string
}

export const STATUS_ORDER: WorkspaceStatusKey[] = ['active', 'invited', 'expired', 'suspended']

export const STATUS_FILTER_LABEL: Record<WorkspaceStatusKey, string> = {
  active: 'Active',
  invited: 'Invited',
  expired: 'Expired',
  suspended: 'Suspended',
}

const PILL: Record<WorkspaceStatusKey, string> = {
  active: 'border-emerald-200 bg-emerald-50 text-emerald-800',
  invited: 'border-blue-200 bg-blue-50 text-blue-800',
  expired: 'border-amber-200 bg-amber-50 text-amber-900',
  suspended: 'border-border bg-muted text-muted-foreground',
}

export function isExpiredInvite(user: ManagedWorkspaceUser, now = Date.now()): boolean {
  if (user.status !== 'invited' || !user.invite_expires_at) return false
  const expiresAt = Date.parse(user.invite_expires_at)
  return Number.isFinite(expiresAt) && expiresAt <= now
}

export const isTemporaryPasswordAccount = (user: ManagedWorkspaceUser): boolean => (
  user.provisioning_method === 'admin_temporary_password'
)

/**
 * One owner row, in the page's lifecycle words. An account whose setup never
 * finished ('provisioning') has not reached anyone yet, so it reads as Invited
 * with a note, and its menu offers the retry.
 */
export function workspaceStatus(user: ManagedWorkspaceUser, now = Date.now()): WorkspaceStatus {
  const status = (key: WorkspaceStatusKey, detail: string | null): WorkspaceStatus => ({
    key,
    label: key === 'expired' ? 'Invite expired' : STATUS_FILTER_LABEL[key],
    detail,
    className: PILL[key],
  })
  if (user.status === 'active') return status('active', null)
  if (user.status === 'suspended') return status('suspended', null)
  if (user.status === 'provisioning') return status('invited', 'Setup did not finish')
  if (isExpiredInvite(user, now)) return status('expired', `Expired ${formatDate(user.invite_expires_at)}`)
  return status('invited', user.invite_expires_at ? `Expires ${formatDate(user.invite_expires_at)}` : null)
}

/** Still restorable: deleted, and the 30-day window has not run out. */
export function insideRecoveryWindow(workspace: Pick<DeletedAdminWorkspace, 'purge_after'>, now = Date.now()): boolean {
  if (!workspace.purge_after) return true
  const purgeAt = Date.parse(workspace.purge_after)
  return !Number.isFinite(purgeAt) || purgeAt > now
}
