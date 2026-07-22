import { useEffect, useMemo, useRef, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  Copy,
  Crown,
  Eye,
  EyeOff,
  ImageIcon,
  KeyRound,
  Loader2,
  PauseCircle,
  PlayCircle,
  RefreshCw,
  ShieldCheck,
  Trash2,
  Upload,
  UserPlus,
  Users,
} from 'lucide-react'
import { toast } from 'sonner'
import { WorkspaceBrandLogo, WorkspaceLayout } from '@/components/workspace/WorkspaceLayout'
import { useAuth } from '@/contexts/AuthContext'
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Checkbox } from '@/components/ui/checkbox'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { WORKSPACE_LOGO_MIME_TYPES, workspaceLogoUrl } from '@/lib/workspaceLogo'
import {
  createWorkspaceStaffTemporaryPassword,
  inviteWorkspaceStaff,
  listWorkspaceStaff,
  mutateWorkspaceStaff,
  retryWorkspaceStaffTemporaryPassword,
  removeWorkspaceLogo,
  updateWorkspaceLogo,
  updateWorkspaceStaffRole,
  type WorkspaceStaffInviteInput,
  type WorkspaceStaffMember,
  type WorkspaceStaffRole,
  type WorkspaceStaffTemporaryCredential,
  type WorkspaceStaffView,
} from '@/services/workspaceStaff'

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

interface WorkspaceStaffProps {
  platformWorkspaceId?: string
}

type ConfirmationAction = 'suspend' | 'reactivate' | 'revoke' | 'transfer_owner' | 'update_role'
type InviteMethod = 'email_invite' | 'temporary_password'
type PasswordRequest =
  | { mode: 'create'; input: WorkspaceStaffInviteInput }
  | { mode: 'retry'; member: WorkspaceStaffMember }

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
  const [inviteMethod, setInviteMethod] = useState<InviteMethod>('email_invite')
  const [credential, setCredential] = useState<WorkspaceStaffTemporaryCredential | null>(null)
  const [credentialVisible, setCredentialVisible] = useState(false)
  const [credentialCopied, setCredentialCopied] = useState(false)
  const [credentialSaved, setCredentialSaved] = useState(false)
  const [credentialError, setCredentialError] = useState<string | null>(null)
  const [passwordBusy, setPasswordBusy] = useState(false)
  const [logoRemoveOpen, setLogoRemoveOpen] = useState(false)
  const [confirmation, setConfirmation] = useState<Confirmation | null>(null)
  const logoInputRef = useRef<HTMLInputElement>(null)
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
  const canGeneratePassword = capabilities?.can_generate_password === true
  const canManageBranding = capabilities?.can_manage_branding === true
  const allowedInviteRoles = capabilities?.invite_roles || []
  const logoUrl = workspaceLogoUrl(
    data?.workspace.id,
    data?.workspace.logo_path,
    data?.workspace.logo_updated_at,
  )
  const workspaceInitials = (data?.workspace.name || 'Workspace')
    .split(/\s+/u)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join('') || 'W'

  const refreshBranding = async () => {
    await queryClient.invalidateQueries({ queryKey })
    if (!isPlatformWorkspace) await refreshAccount()
  }

  const logoMutation = useMutation({
    mutationFn: (file: File) => {
      if (!data || !canManageBranding) {
        throw new Error('You do not have permission to update workspace branding.')
      }
      return updateWorkspaceLogo(workspaceId, file, data.workspace.logo_path)
    },
    onSuccess: async () => {
      await refreshBranding()
      toast.success('Workspace logo updated.')
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : 'The workspace logo could not be uploaded.'),
  })

  const removeLogoMutation = useMutation({
    mutationFn: () => {
      if (!data?.workspace.logo_path || !canManageBranding) {
        throw new Error('The workspace logo is unavailable.')
      }
      return removeWorkspaceLogo(workspaceId, data.workspace.logo_path)
    },
    onSuccess: async () => {
      setLogoRemoveOpen(false)
      await refreshBranding()
      toast.success('Workspace logo removed.')
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : 'The workspace logo could not be removed.'),
  })

  const inviteMutation = useMutation({
    mutationFn: () => {
      if (!canInvite) throw new Error('You do not have permission to invite workspace users.')
      return inviteWorkspaceStaff(workspaceId, invite)
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey })
      setInviteOpen(false)
      setInvite(emptyInvite)
      setInviteMethod('email_invite')
      toast.success('Workspace invitation sent.')
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : 'The invitation could not be sent.'),
  })

  // Keep plaintext credentials in component memory only, never React Query's
  // mutation cache.
  const issueTemporaryPassword = async (request: PasswordRequest) => {
    if (passwordBusy) return
    setPasswordBusy(true)
    try {
      if (!canInvite) throw new Error('You do not have permission to add workspace users.')
      if (request.mode === 'create' && !canGeneratePassword) {
        throw new Error('Temporary-password setup is not available yet.')
      }
      const issued = request.mode === 'create'
        ? await createWorkspaceStaffTemporaryPassword(workspaceId, request.input)
        : await retryWorkspaceStaffTemporaryPassword(workspaceId, request.member.id)
      await queryClient.invalidateQueries({ queryKey })
      setInviteOpen(false)
      setInvite(emptyInvite)
      setInviteMethod('email_invite')
      setCredentialVisible(false)
      setCredentialCopied(false)
      setCredentialSaved(false)
      setCredentialError(null)
      setCredential(issued)
      toast.success('Temporary password generated.')
    } catch (error) {
      await queryClient.invalidateQueries({ queryKey })
      toast.error(error instanceof Error ? error.message : 'The temporary password could not be generated.')
    } finally {
      setPasswordBusy(false)
    }
  }

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

  const inviteBusy = inviteMutation.isPending || passwordBusy

  const clearCredential = () => {
    setCredential(null)
    setCredentialVisible(false)
    setCredentialCopied(false)
    setCredentialSaved(false)
    setCredentialError(null)
  }

  const copyCredential = async () => {
    if (!credential) return
    try {
      await navigator.clipboard.writeText(credential.temporary_password)
      setCredentialCopied(true)
      setCredentialError(null)
    } catch {
      setCredentialError('Copy failed. Reveal the password and copy it manually.')
    }
  }

  const platformWorkspace = isPlatformWorkspace
    ? {
        workspaceName: data?.workspace.name || 'Client workspace',
        logoUrl,
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
              <div>
                <h1 className="text-3xl font-bold tracking-tight">Settings</h1>
                <p className="text-muted-foreground">
                  {isPlatformWorkspace
                    ? `Manage settings for ${data.workspace.name}.`
                    : 'Manage your workspace.'}
                </p>
              </div>

              <div className="border-t pt-6">
                <h2 className="text-xl font-semibold tracking-tight">Workspace branding</h2>
                <p className="text-muted-foreground">Upload the logo shown throughout this workspace.</p>
              </div>

              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2"><ImageIcon className="h-5 w-5" />Workspace logo</CardTitle>
                  <CardDescription>Use a PNG, JPEG, or WebP image up to 2 MB.</CardDescription>
                </CardHeader>
                <CardContent className="grid gap-6 lg:grid-cols-[minmax(0,28rem)_1fr] lg:items-center">
                  <WorkspaceBrandLogo
                    logoUrl={logoUrl}
                    workspaceName={data.workspace.name}
                    workspaceInitials={workspaceInitials}
                    placement="settings"
                  />
                  <div className="space-y-3">
                    <div>
                      <p className="font-semibold">Brand preview</p>
                      <p className="text-sm text-muted-foreground">
                        Your logo uses a high-contrast backdrop so transparent and light artwork stays visible.
                      </p>
                    </div>
                    <Input
                      ref={logoInputRef}
                      id="workspace-logo"
                      aria-label="Workspace logo file"
                      type="file"
                      className="sr-only"
                      accept={WORKSPACE_LOGO_MIME_TYPES.join(',')}
                      disabled={!canManageBranding || logoMutation.isPending || removeLogoMutation.isPending}
                      onChange={(event) => {
                        const file = event.currentTarget.files?.[0]
                        event.currentTarget.value = ''
                        if (file) logoMutation.mutate(file)
                      }}
                    />
                    <div className="flex flex-wrap gap-2">
                      <Button
                        type="button"
                        variant="outline"
                        disabled={!canManageBranding || logoMutation.isPending || removeLogoMutation.isPending}
                        onClick={() => logoInputRef.current?.click()}
                      >
                        {logoMutation.isPending
                          ? <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                          : <Upload className="mr-2 h-4 w-4" />}
                        {data.workspace.logo_path ? 'Replace logo' : 'Upload logo'}
                      </Button>
                      {data.workspace.logo_path && (
                        <Button
                          type="button"
                          variant="outline"
                          className="text-destructive"
                          disabled={!canManageBranding || logoMutation.isPending || removeLogoMutation.isPending}
                          onClick={() => setLogoRemoveOpen(true)}
                        >
                          <Trash2 className="mr-2 h-4 w-4" />Remove logo
                        </Button>
                      )}
                    </div>
                    {!canManageBranding && (
                      <p className="text-sm text-muted-foreground">Workspace branding controls are not active on the backend yet.</p>
                    )}
                  </div>
                </CardContent>
              </Card>

              <div className="flex flex-col gap-3 border-t pt-6 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <h2 className="text-xl font-semibold tracking-tight">Workspace users</h2>
                  <p className="text-muted-foreground">
                    {isPlatformWorkspace
                      ? 'Manage the people who can access this workspace.'
                      : 'Manage the people who can access your workspace.'}
                  </p>
                </div>
                <Button
                  disabled={!canInvite}
                  onClick={() => {
                    setInvite({ ...emptyInvite, role: allowedInviteRoles[0] || 'member' })
                    setInviteMethod('email_invite')
                    setInviteOpen(true)
                  }}
                >
                  <UserPlus className="mr-2 h-4 w-4" />Invite user
                </Button>
              </div>

              <div className="grid gap-4 sm:grid-cols-3">
                <Card><CardHeader className="pb-2"><CardDescription>Total users</CardDescription><CardTitle>{staff.length}</CardTitle></CardHeader></Card>
                <Card><CardHeader className="pb-2"><CardDescription>Active</CardDescription><CardTitle>{staff.filter((member) => member.status === 'active').length}</CardTitle></CardHeader></Card>
                <Card><CardHeader className="pb-2"><CardDescription>Pending access</CardDescription><CardTitle>{staff.filter((member) => member.status === 'invited' || member.status === 'provisioning').length}</CardTitle></CardHeader></Card>
              </div>

              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2"><Users className="h-5 w-5" />Agency team</CardTitle>
                  <CardDescription>Every user belongs to this workspace only. Client portal users are managed separately on each client.</CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="overflow-x-auto rounded-md border">
                    <Table>
                      <TableHeader><TableRow><TableHead>User</TableHead><TableHead>Role</TableHead><TableHead>Status</TableHead><TableHead>Joined / added</TableHead><TableHead className="text-right">Actions</TableHead></TableRow></TableHeader>
                      <TableBody>
                        {staff.map((member) => {
                          const manageable = member.allowed_actions.length > 0
                          const busy = actionMutation.isPending || passwordBusy || member.pending_review
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
                                <Badge variant={member.status === 'active' ? 'default' : member.status === 'suspended' ? 'destructive' : 'secondary'} className="capitalize">
                                  {member.status === 'provisioning'
                                    ? member.setup_method === 'admin_temporary_password' ? 'Password setup' : 'Sending invite'
                                    : member.status === 'invited' && member.setup_method === 'admin_temporary_password'
                                      ? 'Password change required'
                                      : member.status}
                                </Badge>
                                {member.pending_review && <p className="mt-1 max-w-44 text-xs text-destructive">Provider reconciliation requires review.</p>}
                              </TableCell>
                              <TableCell>{formatDate(member.accepted_at || member.invited_at)}</TableCell>
                              <TableCell className="text-right">
                                {member.role === 'owner' ? <span className="text-sm text-muted-foreground">Protected owner</span> : manageable ? (
                                  <div className="inline-flex flex-wrap justify-end gap-2">
                                    {member.allowed_actions.includes('retry_invite') && (
                                      <Button size="sm" variant="outline" disabled={busy} onClick={() => actionMutation.mutate({ action: 'retry_invite', member })}><RefreshCw className="mr-2 h-4 w-4" />Retry invite</Button>
                                    )}
                                    {member.allowed_actions.includes('retry_password') && (
                                      <Button size="sm" variant="outline" disabled={busy} onClick={() => void issueTemporaryPassword({ mode: 'retry', member })}>
                                        {passwordBusy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <KeyRound className="mr-2 h-4 w-4" />}
                                        Generate password
                                      </Button>
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

      <Dialog open={inviteOpen} onOpenChange={(open) => !inviteBusy && setInviteOpen(open)}>
        <DialogContent
          onEscapeKeyDown={(event) => { if (inviteBusy) event.preventDefault() }}
          onPointerDownOutside={(event) => { if (inviteBusy) event.preventDefault() }}
        >
          <DialogHeader>
            <DialogTitle>Add a workspace user</DialogTitle>
            <DialogDescription>
              {canGeneratePassword
                ? 'Choose how this person will receive their first sign-in credential.'
                : 'They will receive an email invitation to create their account.'}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2"><Label htmlFor="staff-name">Full name</Label><Input id="staff-name" value={invite.full_name || ''} maxLength={120} disabled={inviteBusy} onChange={(event) => setInvite((current) => ({ ...current, full_name: event.target.value }))} /></div>
            <div className="space-y-2"><Label htmlFor="staff-email">Email</Label><Input id="staff-email" type="email" value={invite.email} maxLength={254} autoComplete="off" disabled={inviteBusy} onChange={(event) => setInvite((current) => ({ ...current, email: event.target.value }))} /></div>
            <div className="space-y-2"><Label htmlFor="staff-role">Role</Label><Select value={invite.role} disabled={inviteBusy} onValueChange={(role: 'admin' | 'member') => setInvite((current) => ({ ...current, role }))}><SelectTrigger id="staff-role"><SelectValue /></SelectTrigger><SelectContent>{allowedInviteRoles.map((role) => <SelectItem key={role} value={role} className="capitalize">{role}</SelectItem>)}</SelectContent></Select></div>
            {canGeneratePassword && (
              <div className="space-y-2">
                <Label htmlFor="staff-sign-in">Sign-in setup</Label>
                <Select value={inviteMethod} disabled={inviteBusy} onValueChange={(method: InviteMethod) => setInviteMethod(method)}>
                  <SelectTrigger id="staff-sign-in"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="email_invite">Send email invitation</SelectItem>
                    <SelectItem value="temporary_password">Generate temporary password</SelectItem>
                  </SelectContent>
                </Select>
                <p className="text-sm text-muted-foreground">
                  {inviteMethod === 'temporary_password'
                    ? 'No invitation email is sent. The password is shown once so you can share it through a secure channel.'
                    : 'They will receive an email invitation to create their account.'}
                </p>
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setInviteOpen(false)} disabled={inviteBusy}>Cancel</Button>
            <Button
              onClick={() => {
                if (inviteMethod === 'temporary_password') {
                  void issueTemporaryPassword({ mode: 'create', input: invite })
                } else {
                  inviteMutation.mutate()
                }
              }}
              disabled={inviteBusy || !invite.email.trim()}
            >
              {inviteBusy && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {inviteMethod === 'temporary_password' ? 'Generate password' : 'Send invitation'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={Boolean(credential)}
        onOpenChange={(open) => {
          if (open) return
          if (!credentialSaved) {
            setCredentialError('Confirm that you saved the one-time password before closing.')
            return
          }
          clearCredential()
        }}
      >
        <DialogContent
          onEscapeKeyDown={(event) => { if (!credentialSaved) event.preventDefault() }}
          onPointerDownOutside={(event) => { if (!credentialSaved) event.preventDefault() }}
        >
          <DialogHeader>
            <DialogTitle>Save the temporary password</DialogTitle>
            <DialogDescription>
              This password is shown once and cannot be retrieved later. Share it with {credential?.email} through a secure channel.
            </DialogDescription>
          </DialogHeader>
          {credential && (
            <div className="space-y-4">
              <div><p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Email</p><p className="font-medium">{credential.email}</p></div>
              <div className="space-y-2">
                <Label htmlFor="staff-temporary-password">Temporary password</Label>
                <div className="flex gap-2">
                  <div className="relative min-w-0 flex-1">
                    <Input
                      id="staff-temporary-password"
                      type={credentialVisible ? 'text' : 'password'}
                      readOnly
                      value={credential.temporary_password}
                      className="pr-10 font-mono"
                      autoComplete="off"
                    />
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="absolute right-0 top-0 h-full px-3"
                      onClick={() => setCredentialVisible((value) => !value)}
                      aria-label={credentialVisible ? 'Hide temporary password' : 'Reveal temporary password'}
                    >
                      {credentialVisible ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </Button>
                  </div>
                  <Button type="button" variant="outline" onClick={() => void copyCredential()}>
                    <Copy className="mr-2 h-4 w-4" />{credentialCopied ? 'Copied' : 'Copy'}
                  </Button>
                </div>
              </div>
              <p className="rounded-md border border-amber-500/40 bg-amber-500/10 p-3 text-sm">
                This user must replace the temporary password at first sign-in before accessing workspace data.
              </p>
              {credential.member.invite_expires_at && (
                <p className="text-sm text-muted-foreground">
                  Temporary access expires {formatDate(credential.member.invite_expires_at)}.
                </p>
              )}
              {credentialError && <p className="text-sm text-destructive" role="alert">{credentialError}</p>}
              <div className="flex items-start gap-2">
                <Checkbox
                  id="staff-credential-saved"
                  checked={credentialSaved}
                  onCheckedChange={(checked) => setCredentialSaved(checked === true)}
                />
                <Label htmlFor="staff-credential-saved" className="font-normal leading-5">
                  I saved this password in a secure place.
                </Label>
              </div>
            </div>
          )}
          <DialogFooter>
            <Button type="button" disabled={!credentialSaved} onClick={clearCredential}>Done</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog
        open={logoRemoveOpen}
        onOpenChange={(open) => !removeLogoMutation.isPending && setLogoRemoveOpen(open)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove workspace logo?</AlertDialogTitle>
            <AlertDialogDescription>
              The workspace will return to its initials anywhere the logo is currently shown.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={removeLogoMutation.isPending}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              disabled={removeLogoMutation.isPending}
              onClick={() => removeLogoMutation.mutate()}
            >
              {removeLogoMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Remove logo
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

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
