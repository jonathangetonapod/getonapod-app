import { useEffect, useMemo, useRef, useState } from 'react'
import { useMutation, type UseQueryResult } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { ArrowDown, ArrowUp, ChevronsUpDown, Eye, KeyRound, Loader2, PauseCircle, PlayCircle, RefreshCw, Search, Send, Settings2, XCircle } from 'lucide-react'
import { toast } from 'sonner'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { RowMenu, type RowMenuItem } from '@/components/workspace/RowMenu'
import { SetupChecklist } from '@/components/workspace/SetupChecklist'
import { formatDate } from '@/lib/dates'
import { plural } from '@/lib/plural'
import { cn } from '@/lib/utils'
import { selectedWorkspaceBaseHref, workspaceModuleHref } from '@/lib/workspaceRoutes'
import { deleteWorkspace } from '@/services/workspaceDeletion'
import type { WorkspaceDomain } from '@/services/workspaceDomains'
import { resetWorkspaceStaffTemporaryPassword } from '@/services/workspaceStaff'
import {
  retryManualWorkspaceAccount,
  revokeManualWorkspaceAccount,
  rotateManualWorkspacePassword,
  updateWorkspaceUserStatus,
  type ManagedWorkspaceUser,
  type ManualWorkspaceCredential,
} from '@/services/workspaceUsers'
import { TabIntro } from './InfoTip'
import {
  isTemporaryPasswordAccount,
  STATUS_FILTER_LABEL,
  STATUS_ORDER,
  workspaceStatus,
  type WorkspaceStatusKey,
} from './ownerStatus'

type PendingAction = 'suspend' | 'reactivate' | 'revoke_pending' | 'revoke_manual' | 'retry_invite'
type SortKey = 'workspace' | 'status' | 'added'

interface WorkspacesTabProps {
  usersQuery: UseQueryResult<ManagedWorkspaceUser[]>
  users: ManagedWorkspaceUser[]
  domains: WorkspaceDomain[]
  highlightId: string | null
  onOpenDomains: () => void
  onCredential: (credential: ManualWorkspaceCredential, fallbackWorkspaceName?: string) => void
  /** Refetch everything on the page that a workspace change can move. */
  refresh: () => Promise<unknown>
}

function matchesSearch(user: ManagedWorkspaceUser, search: string): boolean {
  const needle = search.trim().toLowerCase()
  if (!needle) return true
  return [user.workspace?.name, user.full_name, user.email]
    .some((value) => (value || '').toLowerCase().includes(needle))
}

function reviewReady(value: string | null): boolean {
  if (!value) return false
  const reviewAt = Date.parse(value)
  return Number.isFinite(reviewAt) && reviewAt <= Date.now()
}

/** What the reconciliation flags allow, worked out once per row. */
function rowGates(user: ManagedWorkspaceUser, busy: boolean) {
  const credentialReviewReady = reviewReady(user.credential_reconciliation_review_after)
  const inviteReviewReady = reviewReady(user.invite_reconciliation_review_after)
  const rotationBlocked = busy || (
    user.credential_reconciliation_pending
    && (!credentialReviewReady || user.credential_reconciliation_claim_kind !== 'temporary_password_rotation')
  )
  return {
    credentialReviewReady,
    inviteReviewReady,
    passwordResetBlocked: busy || user.auth_reconciliation_pending || user.credential_reconciliation_pending,
    rotationBlocked,
    revocationCredentialBlocked: busy || (user.credential_reconciliation_pending && !credentialReviewReady),
    inviteBlocked: user.invite_reconciliation_pending && !inviteReviewReady,
    manualSetupRetryBlocked: user.invite_reconciliation_pending || rotationBlocked,
  }
}

/** The one line a row shows when the server is holding its account actions. */
function reconciliationNotice(user: ManagedWorkspaceUser, gates: ReturnType<typeof rowGates>): string | null {
  const until = (value: string | null) => formatDate(value) || 'a later check'
  if (user.status === 'active' || user.status === 'suspended') {
    return user.auth_reconciliation_pending || (user.status === 'active' && user.credential_reconciliation_pending)
      ? 'Account actions are paused. Operator review is required.'
      : null
  }
  if (user.status === 'provisioning') {
    if (user.invite_reconciliation_pending) {
      return gates.inviteReviewReady
        ? 'Setup cannot resume. Cancel this invitation, then create it again.'
        : `Setup is being checked until ${until(user.invite_reconciliation_review_after)}.`
    }
    if (user.credential_reconciliation_pending) {
      return gates.credentialReviewReady
        ? 'Credential reconciliation is ready for a recovery action.'
        : `Credential reconciliation is pending until ${until(user.credential_reconciliation_review_after)}.`
    }
    return null
  }
  if (isTemporaryPasswordAccount(user)) {
    if (!user.credential_reconciliation_pending) return null
    if (user.credential_reconciliation_claim_kind === 'staff_password_reset') return 'This password reset requires operator review.'
    if (!gates.credentialReviewReady) return `Credential reconciliation is pending until ${until(user.credential_reconciliation_review_after)}.`
    return user.credential_reconciliation_claim_kind === 'initial_password_change'
      ? 'The owner may retry password setup, or you may cancel this invitation.'
      : 'Credential rotation is ready to retry.'
  }
  return user.invite_reconciliation_pending ? 'Cancelling this invitation requires operator review.' : null
}

/** The serving domain to show for each workspace, preferring the one links use. */
function servingDomains(domains: WorkspaceDomain[]): Map<string, string> {
  const byWorkspace = new Map<string, WorkspaceDomain>()
  for (const domain of domains) {
    if (domain.status !== 'active') continue
    const current = byWorkspace.get(domain.workspace_id)
    if (!current || (domain.is_primary && !current.is_primary)) byWorkspace.set(domain.workspace_id, domain)
  }
  return new Map([...byWorkspace].map(([id, domain]) => [id, domain.hostname]))
}

const workspaceLabel = (user: ManagedWorkspaceUser) => user.workspace?.name || 'Private workspace'

export const WorkspacesTab = ({ usersQuery, users, domains, highlightId, onOpenDomains, onCredential, refresh }: WorkspacesTabProps) => {
  const [search, setSearch] = useState('')
  const [filter, setFilter] = useState<WorkspaceStatusKey | 'all'>('all')
  const [sort, setSort] = useState<{ key: SortKey; direction: 'asc' | 'desc' }>({ key: 'added', direction: 'desc' })
  const [credentialBusyId, setCredentialBusyId] = useState<string | null>(null)
  const [credentialConfirmation, setCredentialConfirmation] = useState<ManagedWorkspaceUser | null>(null)
  const [confirmation, setConfirmation] = useState<{ user: ManagedWorkspaceUser; action: PendingAction } | null>(null)
  const [closing, setClosing] = useState<ManagedWorkspaceUser | null>(null)
  const [setupReview, setSetupReview] = useState<ManagedWorkspaceUser | null>(null)
  const [closeName, setCloseName] = useState('')
  const [closeReason, setCloseReason] = useState('')
  const highlightRef = useRef<HTMLTableRowElement | null>(null)

  useEffect(() => {
    highlightRef.current?.scrollIntoView?.({ block: 'center' })
  }, [highlightId, users.length])

  const domainFor = useMemo(() => servingDomains(domains), [domains])

  const statusMutation = useMutation({
    mutationFn: async ({ user, action }: { user: ManagedWorkspaceUser; action: PendingAction }) => {
      if (action === 'revoke_manual') {
        await revokeManualWorkspaceAccount(user.id, crypto.randomUUID())
        return
      }
      await updateWorkspaceUserStatus(action, user.id)
    },
    onSuccess: (_result, { action }) => {
      setConfirmation(null)
      toast.success(
        action === 'suspend' ? 'Workspace suspended.'
          : action === 'reactivate' ? 'Workspace unsuspended.'
            : action === 'retry_invite' ? 'Invitation finalized.'
              : 'Invitation cancelled.',
      )
    },
    onError: (error) => {
      setConfirmation(null)
      toast.error(error instanceof Error ? error.message : 'Unable to update the workspace.')
    },
    onSettled: () => refresh(),
  })

  const closeMutation = useMutation({
    mutationFn: (user: ManagedWorkspaceUser) => deleteWorkspace(user.workspace_id, closeReason),
    onSuccess: (result, user) => {
      setClosing(null)
      if (result.stranded_domains?.length) {
        toast.warning(`${workspaceLabel(user)} is closed, but ${plural(result.stranded_domains.length, 'custom domain')} could not be removed automatically.`)
      } else {
        toast.success(`${workspaceLabel(user)} is closed. It stays in Closed for 30 days.`)
      }
    },
    // Shown as given: the function refuses rather than half-closing, and its
    // reason is the thing to act on.
    onError: (error) => toast.error(error instanceof Error ? error.message : 'The workspace could not be closed.'),
    onSettled: () => refresh(),
  })

  const issueOwnerCredential = async (user: ManagedWorkspaceUser) => {
    setCredentialBusyId(user.id)
    try {
      let result: ManualWorkspaceCredential
      if (user.status === 'active') {
        const reset = await resetWorkspaceStaffTemporaryPassword(user.workspace_id, user.id)
        result = {
          membership: {
            id: reset.member.id,
            workspace_id: user.workspace_id,
            status: reset.member.status,
            provisioning_method: 'admin_temporary_password',
            password_change_required: true,
            invite_expires_at: reset.member.invite_expires_at,
          },
          workspace: user.workspace,
          email: reset.email,
          temporary_password: reset.temporary_password,
        }
      } else {
        result = user.status === 'provisioning'
          ? await retryManualWorkspaceAccount(user.id, crypto.randomUUID())
          : await rotateManualWorkspacePassword(user.id, crypto.randomUUID())
      }
      setCredentialConfirmation(null)
      onCredential(result, user.workspace?.name)
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'The owner password could not be reset.')
    } finally {
      void refresh()
      setCredentialBusyId(null)
    }
  }

  const menuItems = (user: ManagedWorkspaceUser, gates: ReturnType<typeof rowGates>): RowMenuItem[] => {
    const settingsHref = user.workspace?.id ? workspaceModuleHref(selectedWorkspaceBaseHref(user.workspace.id), 'settings') : undefined
    const manual = isTemporaryPasswordAccount(user)
    const cancelInvitation: RowMenuItem = {
      label: 'Cancel invitation',
      icon: <XCircle className="mr-2 h-4 w-4" />,
      destructive: true,
      disabled: manual ? gates.inviteBlocked || gates.revocationCredentialBlocked : user.invite_reconciliation_pending,
      onSelect: () => setConfirmation({ user, action: manual ? 'revoke_manual' : 'revoke_pending' }),
    }
    const closeWorkspace: RowMenuItem = {
      label: 'Close workspace',
      icon: <XCircle className="mr-2 h-4 w-4" />,
      destructive: true,
      onSelect: () => { setCloseName(''); setCloseReason(''); setClosing(user) },
    }
    const manageUsers: RowMenuItem[] = settingsHref ? [{ label: 'Manage users', icon: <Settings2 className="mr-2 h-4 w-4" />, to: settingsHref }] : []

    if (user.status === 'active') {
      return [
        ...manageUsers,
        { label: 'Reset password', icon: <KeyRound className="mr-2 h-4 w-4" />, disabled: gates.passwordResetBlocked, onSelect: () => setCredentialConfirmation(user) },
        { label: 'Suspend', icon: <PauseCircle className="mr-2 h-4 w-4" />, disabled: user.auth_reconciliation_pending, onSelect: () => setConfirmation({ user, action: 'suspend' }) },
        'divider',
        closeWorkspace,
      ]
    }
    if (user.status === 'suspended') {
      return [
        ...manageUsers,
        { label: 'Unsuspend', icon: <PlayCircle className="mr-2 h-4 w-4" />, disabled: user.auth_reconciliation_pending, onSelect: () => setConfirmation({ user, action: 'reactivate' }) },
        'divider',
        closeWorkspace,
      ]
    }
    if (user.status === 'provisioning') {
      return [
        manual
          ? { label: 'Retry setup', icon: <RefreshCw className="mr-2 h-4 w-4" />, disabled: gates.manualSetupRetryBlocked, onSelect: () => void issueOwnerCredential(user) }
          : { label: 'Retry invitation', icon: <Send className="mr-2 h-4 w-4" />, disabled: user.invite_reconciliation_pending, onSelect: () => setConfirmation({ user, action: 'retry_invite' }) },
        'divider',
        cancelInvitation,
      ]
    }
    // Invited or invite expired. A replacement password only exists for an
    // account set up with one; an emailed link cannot be resent.
    return [
      ...(manual
        ? [{ label: 'Issue temporary password', icon: <KeyRound className="mr-2 h-4 w-4" />, disabled: gates.rotationBlocked, onSelect: () => setCredentialConfirmation(user) }]
        : []),
      'divider',
      cancelInvitation,
    ]
  }

  const filtered = users
    .filter((user) => matchesSearch(user, search))
    .filter((user) => filter === 'all' || workspaceStatus(user).key === filter)
  const sorted = [...filtered].sort((left, right) => {
    const order = sort.direction === 'asc' ? 1 : -1
    if (sort.key === 'workspace') return workspaceLabel(left).localeCompare(workspaceLabel(right)) * order
    if (sort.key === 'status') {
      return (STATUS_ORDER.indexOf(workspaceStatus(left).key) - STATUS_ORDER.indexOf(workspaceStatus(right).key)) * order
    }
    return (left.invited_at || '').localeCompare(right.invited_at || '') * order
  })

  const toggleSort = (key: SortKey) => setSort((current) => (
    current.key === key
      ? { key, direction: current.direction === 'asc' ? 'desc' : 'asc' }
      : { key, direction: key === 'added' ? 'desc' : 'asc' }
  ))

  const sortHeader = (sortKey: SortKey, children: string) => {
    const active = sort.key === sortKey
    const Icon = !active ? ChevronsUpDown : sort.direction === 'asc' ? ArrowUp : ArrowDown
    return (
      <TableHead key={sortKey} aria-sort={active ? (sort.direction === 'asc' ? 'ascending' : 'descending') : 'none'}>
        <button type="button" className="inline-flex items-center gap-1 font-medium hover:text-foreground" onClick={() => toggleSort(sortKey)}>
          {children}<Icon className="h-3.5 w-3.5" aria-hidden="true" />
        </button>
      </TableHead>
    )
  }

  const closeConfirmed = Boolean(closing) && closeName.trim().toLowerCase() === workspaceLabel(closing).trim().toLowerCase()
  const confirmingCancel = confirmation?.action === 'revoke_manual' || confirmation?.action === 'revoke_pending'

  return (
    <div className="space-y-4">
      <TabIntro info="New passwords are shown once and must be replaced at the owner's next sign-in. Manage users opens the workspace settings, where the owner's whole team is listed.">
        Every workspace on the platform and the owner who signs in to it.
      </TabIntro>

      <div className="flex flex-wrap items-center gap-3">
        <div className="relative w-full max-w-xs">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
          <Input type="search" aria-label="Search workspaces" placeholder="Search by workspace, name or email" className="pl-9" value={search} onChange={(event) => setSearch(event.target.value)} />
        </div>
        <div className="flex flex-wrap gap-1.5" role="group" aria-label="Filter by status">
          {(['all', ...STATUS_ORDER] as const).map((key) => (
            <Button key={key} type="button" size="sm" variant={filter === key ? 'secondary' : 'ghost'} aria-pressed={filter === key} className="h-8" onClick={() => setFilter(key)}>
              {key === 'all' ? 'All' : STATUS_FILTER_LABEL[key]}
            </Button>
          ))}
        </div>
        <p className="ml-auto text-sm text-muted-foreground tabular-nums" aria-live="polite">{plural(sorted.length, 'workspace')}</p>
      </div>

      {usersQuery.isLoading ? (
        <div className="flex min-h-40 items-center justify-center"><Loader2 className="h-7 w-7 animate-spin text-primary" /></div>
      ) : usersQuery.error ? (
        <div className="flex flex-col items-start gap-3 rounded-md border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive">
          <p>{usersQuery.error instanceof Error ? usersQuery.error.message : 'Unable to load workspaces.'}</p>
          <Button type="button" size="sm" variant="outline" disabled={usersQuery.isFetching} onClick={() => void usersQuery.refetch()}>
            {usersQuery.isFetching && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Try again
          </Button>
        </div>
      ) : users.length === 0 ? (
        <div className="flex min-h-40 flex-col items-center justify-center gap-2 text-center">
          <p className="font-medium">No workspaces yet</p>
          <p className="text-sm text-muted-foreground">Use New workspace to invite an agency owner.</p>
        </div>
      ) : sorted.length === 0 ? (
        <p className="py-8 text-center text-sm text-muted-foreground">
          {search.trim() ? <>No workspaces match &ldquo;{search.trim()}&rdquo;.</> : 'No workspaces have this status.'}
        </p>
      ) : (
        <div className="overflow-x-auto rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                {sortHeader('workspace', 'Workspace')}
                {sortHeader('status', 'Access')}
                <TableHead>Onboarding</TableHead>
                <TableHead>Domain</TableHead>
                {sortHeader('added', 'Added')}
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {sorted.map((user) => {
                const gates = rowGates(user, credentialBusyId === user.id)
                const state = workspaceStatus(user)
                const notice = reconciliationNotice(user, gates)
                const hostname = domainFor.get(user.workspace_id)
                const highlighted = Boolean(highlightId) && user.workspace_id === highlightId
                return (
                  <TableRow key={user.id} ref={highlighted ? highlightRef : undefined} data-highlighted={highlighted || undefined} className={cn(highlighted && 'bg-primary/5')}>
                    <TableCell>
                      <p className="font-semibold">{workspaceLabel(user)}</p>
                      <p className="text-xs text-muted-foreground">{user.full_name ? `${user.full_name} · ${user.email}` : user.email}</p>
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline" className={state.className}>{state.label}</Badge>
                      {state.detail && <p className="mt-1 text-xs text-muted-foreground">{state.detail}</p>}
                      {notice && <p className="mt-1 max-w-64 text-xs font-medium text-destructive">{notice}</p>}
                    </TableCell>
                    <TableCell>
                      {user.status === 'active' && !user.password_change_required ? (
                        <Button variant="link" size="sm" className="h-auto p-0" aria-label={`View setup for ${workspaceLabel(user)}`} onClick={() => setSetupReview(user)}>View setup progress</Button>
                      ) : <span className="text-sm text-muted-foreground">{user.status === 'suspended' ? 'Access suspended' : 'Waiting for owner sign-in'}</span>}
                    </TableCell>
                    <TableCell>
                      {hostname ? (
                        <button type="button" onClick={onOpenDomains} aria-label={`${hostname}, open Domains`}>
                          <Badge variant="secondary" className="font-mono text-[11px] font-normal">{hostname}</Badge>
                        </button>
                      ) : (
                        <span className="text-sm text-muted-foreground">Default</span>
                      )}
                    </TableCell>
                    <TableCell className="whitespace-nowrap text-sm tabular-nums">{formatDate(user.invited_at)}</TableCell>
                    <TableCell className="text-right">
                      <div className="inline-flex items-center justify-end gap-1 whitespace-nowrap">
                        {credentialBusyId === user.id && <Loader2 className="h-4 w-4 animate-spin" aria-label="Working" />}
                        {user.workspace?.id && (
                          <Button size="sm" variant="outline" asChild>
                            <Link to={workspaceModuleHref(selectedWorkspaceBaseHref(user.workspace.id), 'clients')}><Eye className="mr-2 h-4 w-4" />Open workspace</Link>
                          </Button>
                        )}
                        <RowMenu items={menuItems(user, gates)} label={`More actions for ${workspaceLabel(user)}`} />
                      </div>
                    </TableCell>
                  </TableRow>
                )
              })}
            </TableBody>
          </Table>
        </div>
      )}

      <Dialog open={Boolean(credentialConfirmation)} onOpenChange={(open) => { if (!open && !credentialBusyId) setCredentialConfirmation(null) }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{credentialConfirmation?.status === 'active' ? 'Reset the owner password?' : 'Issue a new temporary password?'}</DialogTitle>
            <DialogDescription>
              {credentialConfirmation?.status === 'active'
                ? `This immediately invalidates the current password for ${credentialConfirmation.email} and signs out existing workspace sessions. The replacement is shown only once and must be changed at next sign-in.`
                : `Issuing a replacement immediately invalidates the previous temporary password. The new one for ${credentialConfirmation?.email} is shown only once.`}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" disabled={Boolean(credentialBusyId)} onClick={() => setCredentialConfirmation(null)}>Keep current password</Button>
            <Button disabled={!credentialConfirmation || Boolean(credentialBusyId)} onClick={() => credentialConfirmation && void issueOwnerCredential(credentialConfirmation)}>
              {credentialBusyId && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {credentialConfirmation?.status === 'active' ? 'Reset password' : 'Issue temporary password'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={Boolean(setupReview)} onOpenChange={(open) => { if (!open) setSetupReview(null) }}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>{setupReview ? `${workspaceLabel(setupReview)} setup` : 'Agency setup'}</DialogTitle>
            <DialogDescription>Signing in activates access. These steps show whether the agency has prepared its workspace for outreach.</DialogDescription>
          </DialogHeader>
          {setupReview && <SetupChecklist key={setupReview.workspace_id} workspaceId={setupReview.workspace_id} baseHref={selectedWorkspaceBaseHref(setupReview.workspace_id)} canManage review />}
        </DialogContent>
      </Dialog>

      <Dialog open={Boolean(confirmation)} onOpenChange={(open) => { if (!open && !statusMutation.isPending) setConfirmation(null) }}>
        <DialogContent>
          {confirmation && (
            <>
              <DialogHeader>
                <DialogTitle>
                  {confirmation.action === 'suspend' ? `Suspend ${workspaceLabel(confirmation.user)}?`
                    : confirmation.action === 'reactivate' ? `Unsuspend ${workspaceLabel(confirmation.user)}?`
                      : confirmation.action === 'retry_invite' ? `Retry the invitation for ${workspaceLabel(confirmation.user)}?`
                        : `Cancel the invitation for ${workspaceLabel(confirmation.user)}?`}
                </DialogTitle>
                <DialogDescription>
                  {confirmation.action === 'suspend' ? `${confirmation.user.email} and their team cannot sign in until you unsuspend it. Nothing is deleted.`
                    : confirmation.action === 'reactivate' ? `${confirmation.user.email} and their team can sign in again.`
                      : confirmation.action === 'retry_invite' ? `This finishes sending the invitation to ${confirmation.user.email}.`
                        : `${confirmation.user.email} can no longer use their link or temporary password, and the unused workspace is removed. You can invite the same email again afterwards.`}
                </DialogDescription>
              </DialogHeader>
              <DialogFooter>
                <Button variant="outline" disabled={statusMutation.isPending} onClick={() => setConfirmation(null)}>{confirmingCancel ? 'Keep invitation' : 'Cancel'}</Button>
                <Button variant={confirmingCancel ? 'destructive' : 'default'} disabled={statusMutation.isPending} onClick={() => statusMutation.mutate(confirmation)}>
                  {statusMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  {confirmation.action === 'suspend' ? 'Suspend'
                    : confirmation.action === 'reactivate' ? 'Unsuspend'
                      : confirmation.action === 'retry_invite' ? 'Retry invitation'
                        : 'Cancel invitation'}
                </Button>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>

      <Dialog open={Boolean(closing)} onOpenChange={(open) => { if (!open && !closeMutation.isPending) setClosing(null) }}>
        <DialogContent>
          {closing && (
            <form onSubmit={(event) => { event.preventDefault(); if (closeConfirmed) closeMutation.mutate(closing) }}>
              <DialogHeader>
                <DialogTitle>Close {workspaceLabel(closing)}?</DialogTitle>
                <DialogDescription>
                  The owner loses access now. Data is kept for 30 days, then deleted. Their subscription ends and any outreach still sending stops.
                </DialogDescription>
              </DialogHeader>
              <div className="my-4 space-y-3">
                <div className="space-y-1.5">
                  <Label htmlFor="close-workspace-name">Type <span className="font-semibold">{workspaceLabel(closing)}</span> to confirm</Label>
                  <Input id="close-workspace-name" autoComplete="off" value={closeName} onChange={(event) => setCloseName(event.target.value)} disabled={closeMutation.isPending} />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="close-workspace-reason">Reason (optional)</Label>
                  <Input id="close-workspace-reason" value={closeReason} onChange={(event) => setCloseReason(event.target.value)} disabled={closeMutation.isPending} />
                </div>
              </div>
              <DialogFooter>
                <Button type="button" variant="outline" disabled={closeMutation.isPending} onClick={() => setClosing(null)}>Keep it open</Button>
                <Button type="submit" variant="destructive" disabled={!closeConfirmed || closeMutation.isPending}>
                  {closeMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Close workspace
                </Button>
              </DialogFooter>
            </form>
          )}
        </DialogContent>
      </Dialog>
    </div>
  )
}
