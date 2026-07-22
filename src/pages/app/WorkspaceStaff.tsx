import { useEffect, useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  Crown,
  Loader2,
  PauseCircle,
  PlayCircle,
  RefreshCw,
  ShieldCheck,
  Trash2,
  UserPlus,
  Users,
} from 'lucide-react'
import { toast } from 'sonner'
import { WorkspaceLayout } from '@/components/workspace/WorkspaceLayout'
import { useAuth } from '@/contexts/AuthContext'
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import {
  inviteWorkspaceStaff,
  listWorkspaceStaff,
  mutateWorkspaceStaff,
  updateWorkspaceStaffRole,
  type WorkspaceStaffInviteInput,
  type WorkspaceStaffMember,
  type WorkspaceStaffRole,
  type WorkspaceStaffView,
} from '@/services/workspaceStaff'

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

interface WorkspaceStaffProps {
  platformWorkspaceId?: string
}

type ConfirmationAction = 'suspend' | 'reactivate' | 'revoke' | 'transfer_owner' | 'update_role'

interface Confirmation {
  action: ConfirmationAction
  member: WorkspaceStaffMember
  role?: Exclude<WorkspaceStaffRole, 'owner'>
}

const emptyInvite: WorkspaceStaffInviteInput = {
  email: '',
  full_name: '',
  role: 'member',
}

function validateView(
  view: WorkspaceStaffView,
  workspaceId: string,
  isPlatformWorkspace: boolean,
): WorkspaceStaffView {
  if (view.workspace.id !== workspaceId) {
    throw new Error(
      isPlatformWorkspace
        ? 'The workspace staff response did not match the selected workspace.'
        : 'The workspace staff response did not match the signed-in account.',
    )
  }
  if (view.capabilities.read_only) {
    throw new Error(
      isPlatformWorkspace
        ? 'Platform-owner workspace management is not active on the backend yet.'
        : 'The workspace staff response did not match the signed-in account.',
    )
  }
  return view
}

function formatDate(value: string | null): string {
  if (!value) return '—'
  return new Intl.DateTimeFormat(undefined, { dateStyle: 'medium' }).format(new Date(value))
}

function confirmationCopy(
  confirmation: Confirmation,
  isPlatformWorkspace: boolean,
): { title: string; description: string; button: string } {
  const name = confirmation.member.full_name || confirmation.member.email
  if (confirmation.action === 'suspend') {
    return {
      title: `Suspend ${name}?`,
      description: 'This immediately blocks this employee from the agency workspace. The agency and its client portals stay active.',
      button: 'Suspend user',
    }
  }
  if (confirmation.action === 'reactivate') {
    return {
      title: `Reactivate ${name}?`,
      description: 'This restores this employee’s access to the same agency workspace.',
      button: 'Reactivate user',
    }
  }
  if (confirmation.action === 'revoke') {
    return {
      title: `Remove ${name}?`,
      description: 'This permanently removes this employee’s workspace access. It does not archive the agency or sign out client portal users.',
      button: 'Remove user',
    }
  }
  if (confirmation.action === 'transfer_owner') {
    return {
      title: `Transfer ownership to ${name}?`,
      description: isPlatformWorkspace
        ? 'This user becomes the workspace owner and the current workspace owner becomes an admin. You remain the platform owner.'
        : 'This user becomes the only workspace owner. Your role changes to admin, and only the new owner can transfer ownership again.',
      button: 'Transfer ownership',
    }
  }
  return {
    title: `Change ${name} to ${confirmation.role}?`,
    description: confirmation.role === 'admin'
      ? 'Admins can manage agency operations and member accounts, but cannot manage the owner or other admins.'
      : 'Members have restricted operational access and cannot manage workspace users.',
    button: 'Change role',
  }
}

const WorkspaceStaff = ({ platformWorkspaceId }: WorkspaceStaffProps) => {
  const { refreshAccount, refreshSession, signOut, user, workspace } = useAuth()
  const queryClient = useQueryClient()
  const [inviteOpen, setInviteOpen] = useState(false)
  const [invite, setInvite] = useState<WorkspaceStaffInviteInput>(emptyInvite)
  const [confirmation, setConfirmation] = useState<Confirmation | null>(null)
  const isPlatformWorkspace = platformWorkspaceId !== undefined
  const workspaceId = (isPlatformWorkspace ? platformWorkspaceId : workspace?.id || '').toLowerCase()
  const validWorkspaceId = UUID_PATTERN.test(workspaceId)
  const queryKey = [
    isPlatformWorkspace ? 'platform' : 'tenant',
    user?.id || 'unknown',
    workspaceId,
    'workspace-staff',
  ] as const

  const staffQuery = useQuery({
    queryKey,
    queryFn: async () => validateView(
      await listWorkspaceStaff(workspaceId),
      workspaceId,
      isPlatformWorkspace,
    ),
    enabled: validWorkspaceId,
    retry: false,
    gcTime: isPlatformWorkspace ? 0 : undefined,
  })

  useEffect(() => {
    if (staffQuery.error) {
      toast.error(staffQuery.error instanceof Error ? staffQuery.error.message : 'Workspace users could not be loaded.')
    }
  }, [staffQuery.error])

  const data = staffQuery.data
  const staff = useMemo(
    () => (data?.members || []).filter((member) => member.status !== 'revoked'),
    [data?.members],
  )
  const capabilities = data?.capabilities
  const canInvite = Boolean(capabilities?.invite_roles.length)
  const allowedInviteRoles = capabilities?.invite_roles || []

  const inviteMutation = useMutation({
    mutationFn: () => {
      if (!canInvite) throw new Error('You do not have permission to invite workspace users.')
      return inviteWorkspaceStaff(workspaceId, invite)
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey })
      setInviteOpen(false)
      setInvite(emptyInvite)
      toast.success('Workspace invitation sent.')
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : 'The invitation could not be sent.'),
  })

  const actionMutation = useMutation({
    mutationFn: async (request: Confirmation | { action: 'retry_invite'; member: WorkspaceStaffMember }) => {
      if (request.action === 'update_role') {
        if (!request.role) throw new Error('Choose a staff role.')
        return updateWorkspaceStaffRole(workspaceId, request.member.id, request.role)
      }
      return mutateWorkspaceStaff(workspaceId, request.member.id, request.action)
    },
    onSuccess: async (_result, request) => {
      await queryClient.invalidateQueries({ queryKey })
      setConfirmation(null)
      if (request.action === 'transfer_owner' && !isPlatformWorkspace) {
        try {
          const sessionRefreshed = await refreshSession()
          if (!sessionRefreshed) throw new Error('Session refresh failed')
          const refreshed = await refreshAccount()
          if (!refreshed) throw new Error('Account refresh failed')
          await queryClient.invalidateQueries({ queryKey: ['tenant', user?.id || 'unknown'] })
        } catch {
          await signOut()
          toast.error('Ownership changed, but your permissions could not be refreshed. Sign in again.')
          return
        }
      }
      const message = request.action === 'retry_invite'
        ? 'Workspace invitation sent again.'
        : request.action === 'update_role'
          ? 'Workspace role updated.'
          : request.action === 'transfer_owner'
            ? 'Workspace ownership transferred.'
            : request.action === 'revoke'
              ? 'Workspace user removed.'
              : request.action === 'suspend'
                ? 'Workspace user suspended.'
                : 'Workspace user reactivated.'
      toast.success(message)
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : 'The workspace user could not be updated.'),
  })

  const platformWorkspace = isPlatformWorkspace
    ? {
        workspaceName: data?.workspace.name || 'Client workspace',
        baseHref: `/admin/workspaces/${workspaceId}`,
        exitHref: '/admin/users',
      }
    : undefined

  const body = !validWorkspaceId
    ? <Card><CardHeader><CardTitle>Workspace unavailable</CardTitle><CardDescription>The workspace address is invalid.</CardDescription></CardHeader></Card>
    : staffQuery.isLoading
      ? <div className="flex min-h-64 items-center justify-center"><Loader2 className="h-8 w-8 animate-spin text-primary" aria-label="Loading workspace users" /></div>
      : staffQuery.error || !data
        ? (
            <Card>
              <CardHeader><CardTitle>Workspace users unavailable</CardTitle><CardDescription>{staffQuery.error instanceof Error ? staffQuery.error.message : 'Workspace users could not be loaded.'}</CardDescription></CardHeader>
              <CardContent><Button variant="outline" onClick={() => void staffQuery.refetch()}>Try again</Button></CardContent>
            </Card>
          )
        : (
            <div className="space-y-6">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <h1 className="text-3xl font-bold tracking-tight">Workspace Users</h1>
                  <p className="text-muted-foreground">Manage the people who can access {data.workspace.name}.</p>
                </div>
                <Button
                  disabled={!canInvite}
                  onClick={() => {
                    setInvite({ ...emptyInvite, role: allowedInviteRoles[0] || 'member' })
                    setInviteOpen(true)
                  }}
                >
                  <UserPlus className="mr-2 h-4 w-4" />Invite user
                </Button>
              </div>

              <div className="grid gap-4 sm:grid-cols-3">
                <Card><CardHeader className="pb-2"><CardDescription>Total users</CardDescription><CardTitle>{staff.length}</CardTitle></CardHeader></Card>
                <Card><CardHeader className="pb-2"><CardDescription>Active</CardDescription><CardTitle>{staff.filter((member) => member.status === 'active').length}</CardTitle></CardHeader></Card>
                <Card><CardHeader className="pb-2"><CardDescription>Pending invites</CardDescription><CardTitle>{staff.filter((member) => member.status === 'invited' || member.status === 'provisioning').length}</CardTitle></CardHeader></Card>
              </div>

              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2"><Users className="h-5 w-5" />Agency team</CardTitle>
                  <CardDescription>Every user belongs to this workspace only. Client portal users are managed separately on each client.</CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="overflow-x-auto rounded-md border">
                    <Table>
                      <TableHeader><TableRow><TableHead>User</TableHead><TableHead>Role</TableHead><TableHead>Status</TableHead><TableHead>Joined / invited</TableHead><TableHead className="text-right">Actions</TableHead></TableRow></TableHeader>
                      <TableBody>
                        {staff.map((member) => {
                          const manageable = member.allowed_actions.length > 0
                          const busy = actionMutation.isPending || member.pending_review
                          return (
                            <TableRow key={member.id}>
                              <TableCell>
                                <div className="font-medium">{member.full_name || 'Invited user'}</div>
                                <div className="text-sm text-muted-foreground">{member.email}</div>
                              </TableCell>
                              <TableCell>
                                <div className="flex items-center gap-2">
                                  {member.role === 'owner' ? <Crown className="h-4 w-4 text-amber-600" /> : member.role === 'admin' ? <ShieldCheck className="h-4 w-4 text-primary" /> : null}
                                  <Badge variant="outline" className="capitalize">{member.role}</Badge>
                                </div>
                              </TableCell>
                              <TableCell>
                                <Badge variant={member.status === 'active' ? 'default' : member.status === 'suspended' ? 'destructive' : 'secondary'} className="capitalize">{member.status === 'provisioning' ? 'Sending invite' : member.status}</Badge>
                                {member.pending_review && <p className="mt-1 max-w-44 text-xs text-destructive">Provider reconciliation requires review.</p>}
                              </TableCell>
                              <TableCell>{formatDate(member.accepted_at || member.invited_at)}</TableCell>
                              <TableCell className="text-right">
                                {member.role === 'owner' ? <span className="text-sm text-muted-foreground">Protected owner</span> : manageable ? (
                                  <div className="inline-flex flex-wrap justify-end gap-2">
                                    {member.allowed_actions.includes('retry_invite') && (
                                      <Button size="sm" variant="outline" disabled={busy} onClick={() => actionMutation.mutate({ action: 'retry_invite', member })}><RefreshCw className="mr-2 h-4 w-4" />Retry invite</Button>
                                    )}
                                    {member.allowed_actions.includes('update_role') && capabilities.can_update_roles && (
                                      <Select value={member.role} disabled={busy} onValueChange={(role: 'admin' | 'member') => setConfirmation({ action: 'update_role', member, role })}>
                                        <SelectTrigger className="h-9 w-28" aria-label={`Change role for ${member.email}`}><SelectValue /></SelectTrigger>
                                        <SelectContent><SelectItem value="admin">Admin</SelectItem><SelectItem value="member">Member</SelectItem></SelectContent>
                                      </Select>
                                    )}
                                    {member.allowed_actions.includes('transfer_owner') && capabilities.can_transfer_owner && (
                                      <Button size="sm" variant="outline" disabled={busy} onClick={() => setConfirmation({ action: 'transfer_owner', member })}><Crown className="mr-2 h-4 w-4" />Make owner</Button>
                                    )}
                                    {member.allowed_actions.includes('suspend') && (
                                      <Button size="sm" variant="outline" disabled={busy} onClick={() => setConfirmation({ action: 'suspend', member })}><PauseCircle className="mr-2 h-4 w-4" />Suspend</Button>
                                    )}
                                    {member.allowed_actions.includes('reactivate') && (
                                      <Button size="sm" variant="outline" disabled={busy} onClick={() => setConfirmation({ action: 'reactivate', member })}><PlayCircle className="mr-2 h-4 w-4" />Reactivate</Button>
                                    )}
                                    {member.allowed_actions.includes('revoke') && <Button size="sm" variant="outline" className="text-destructive" disabled={busy} onClick={() => setConfirmation({ action: 'revoke', member })}><Trash2 className="mr-2 h-4 w-4" />Remove</Button>}
                                  </div>
                                ) : <span className="text-sm text-muted-foreground">No actions</span>}
                              </TableCell>
                            </TableRow>
                          )
                        })}
                      </TableBody>
                    </Table>
                  </div>
                </CardContent>
              </Card>
            </div>
          )

  return (
    <WorkspaceLayout platformWorkspace={platformWorkspace}>
      {body}

      <Dialog open={inviteOpen} onOpenChange={(open) => !inviteMutation.isPending && setInviteOpen(open)}>
        <DialogContent>
          <DialogHeader><DialogTitle>Invite a workspace user</DialogTitle><DialogDescription>They will receive an email invitation to create their own account in this agency workspace.</DialogDescription></DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2"><Label htmlFor="staff-name">Full name</Label><Input id="staff-name" value={invite.full_name || ''} maxLength={120} onChange={(event) => setInvite((current) => ({ ...current, full_name: event.target.value }))} /></div>
            <div className="space-y-2"><Label htmlFor="staff-email">Email</Label><Input id="staff-email" type="email" value={invite.email} maxLength={254} autoComplete="off" onChange={(event) => setInvite((current) => ({ ...current, email: event.target.value }))} /></div>
            <div className="space-y-2"><Label htmlFor="staff-role">Role</Label><Select value={invite.role} onValueChange={(role: 'admin' | 'member') => setInvite((current) => ({ ...current, role }))}><SelectTrigger id="staff-role"><SelectValue /></SelectTrigger><SelectContent>{allowedInviteRoles.map((role) => <SelectItem key={role} value={role} className="capitalize">{role}</SelectItem>)}</SelectContent></Select></div>
          </div>
          <DialogFooter><Button variant="outline" onClick={() => setInviteOpen(false)} disabled={inviteMutation.isPending}>Cancel</Button><Button onClick={() => inviteMutation.mutate()} disabled={inviteMutation.isPending || !invite.email.trim()}>{inviteMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Send invitation</Button></DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={Boolean(confirmation)} onOpenChange={(open) => !open && !actionMutation.isPending && setConfirmation(null)}>
        <AlertDialogContent>
          {confirmation && (() => {
            const copy = confirmationCopy(confirmation, isPlatformWorkspace)
            return <><AlertDialogHeader><AlertDialogTitle>{copy.title}</AlertDialogTitle><AlertDialogDescription>{copy.description}</AlertDialogDescription></AlertDialogHeader><AlertDialogFooter><AlertDialogCancel disabled={actionMutation.isPending}>Cancel</AlertDialogCancel><AlertDialogAction onClick={() => actionMutation.mutate(confirmation)} disabled={actionMutation.isPending}>{actionMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}{copy.button}</AlertDialogAction></AlertDialogFooter></>
          })()}
        </AlertDialogContent>
      </AlertDialog>
    </WorkspaceLayout>
  )
}

export default WorkspaceStaff
