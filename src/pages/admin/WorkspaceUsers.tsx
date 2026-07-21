import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Loader2, PauseCircle, PlayCircle, Send, UserPlus, UserX, Users } from 'lucide-react'
import { toast } from 'sonner'
import { DashboardLayout } from '@/components/admin/DashboardLayout'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import {
  inviteWorkspaceUser,
  listWorkspaceUsers,
  updateWorkspaceUserStatus,
  type ManagedWorkspaceUser,
} from '@/services/workspaceUsers'

type PendingAction = 'suspend' | 'reactivate' | 'revoke_pending'

const WorkspaceUsers = () => {
  const queryClient = useQueryClient()
  const [inviteOpen, setInviteOpen] = useState(false)
  const [email, setEmail] = useState('')
  const [fullName, setFullName] = useState('')
  const [workspaceName, setWorkspaceName] = useState('')
  const [confirmation, setConfirmation] = useState<{ user: ManagedWorkspaceUser; action: PendingAction } | null>(null)
  const queryKey = ['platform', 'workspace-users'] as const

  const usersQuery = useQuery({ queryKey, queryFn: listWorkspaceUsers })

  const inviteMutation = useMutation({
    mutationFn: () => inviteWorkspaceUser({
      email: email.trim(),
      full_name: fullName.trim() || undefined,
      workspace_name: workspaceName.trim() || undefined,
    }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey })
      setInviteOpen(false)
      setEmail('')
      setFullName('')
      setWorkspaceName('')
      toast.success('Invitation sent.')
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : 'Unable to send invitation.'),
  })

  const statusMutation = useMutation({
    mutationFn: ({ user, action }: { user: ManagedWorkspaceUser; action: PendingAction }) => updateWorkspaceUserStatus(action, user.id),
    onSuccess: async (_result, variables) => {
      await queryClient.invalidateQueries({ queryKey })
      setConfirmation(null)
      toast.success(variables.action === 'suspend' ? 'Account suspended.' : variables.action === 'reactivate' ? 'Account reactivated.' : 'Invitation revoked.')
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : 'Unable to update account.'),
  })

  const users = usersQuery.data || []

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div><h1 className="text-3xl font-bold tracking-tight">Workspace users</h1><p className="text-muted-foreground">Invite people and control access to their private client workspaces.</p></div>
          <Button onClick={() => setInviteOpen(true)}><UserPlus className="mr-2 h-4 w-4" />Invite user</Button>
        </div>

        <Card>
          <CardHeader><CardTitle className="flex items-center gap-2"><Users className="h-5 w-5" />Invited accounts</CardTitle><CardDescription>Each account receives one private workspace. Users cannot invite other users in this MVP.</CardDescription></CardHeader>
          <CardContent>
            {usersQuery.isLoading ? (
              <div className="flex min-h-40 items-center justify-center"><Loader2 className="h-7 w-7 animate-spin text-primary" /></div>
            ) : usersQuery.error ? (
              <div className="rounded-md border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive">{usersQuery.error instanceof Error ? usersQuery.error.message : 'Unable to load workspace users.'}</div>
            ) : users.length === 0 ? (
              <div className="flex min-h-40 flex-col items-center justify-center gap-3 text-center"><Send className="h-10 w-10 text-muted-foreground" /><div><p className="font-medium">No invited users</p><p className="text-sm text-muted-foreground">Invite the first user when staging is configured.</p></div></div>
            ) : (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader><TableRow><TableHead>User</TableHead><TableHead>Workspace</TableHead><TableHead>Status</TableHead><TableHead>Invited</TableHead><TableHead className="text-right">Actions</TableHead></TableRow></TableHeader>
                  <TableBody>
                    {users.map((managedUser) => (
                      <TableRow key={managedUser.id}>
                        <TableCell><p className="font-medium">{managedUser.full_name || managedUser.email}</p><p className="text-xs text-muted-foreground">{managedUser.email}</p></TableCell>
                        <TableCell>{managedUser.workspace?.name || 'Private workspace'}</TableCell>
                        <TableCell><Badge variant={managedUser.status === 'active' ? 'default' : managedUser.status === 'suspended' ? 'destructive' : 'secondary'} className="capitalize">{managedUser.status}</Badge></TableCell>
                        <TableCell>{managedUser.invited_at ? new Date(managedUser.invited_at).toLocaleDateString() : '—'}</TableCell>
                        <TableCell className="text-right">
                          {managedUser.status === 'active' && <Button size="sm" variant="outline" onClick={() => setConfirmation({ user: managedUser, action: 'suspend' })}><PauseCircle className="mr-2 h-4 w-4" />Suspend</Button>}
                          {managedUser.status === 'suspended' && <Button size="sm" variant="outline" onClick={() => setConfirmation({ user: managedUser, action: 'reactivate' })}><PlayCircle className="mr-2 h-4 w-4" />Reactivate</Button>}
                          {managedUser.status === 'invited' && <Button size="sm" variant="outline" className="text-destructive" onClick={() => setConfirmation({ user: managedUser, action: 'revoke_pending' })}><UserX className="mr-2 h-4 w-4" />Revoke</Button>}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      <Dialog open={inviteOpen} onOpenChange={setInviteOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Invite a workspace user</DialogTitle></DialogHeader>
          <form className="space-y-4" onSubmit={(event) => { event.preventDefault(); inviteMutation.mutate() }}>
            <div className="space-y-2"><Label htmlFor="invite-email">Email</Label><Input id="invite-email" type="email" required autoComplete="off" value={email} onChange={(event) => setEmail(event.target.value)} /></div>
            <div className="space-y-2"><Label htmlFor="invite-name">Full name</Label><Input id="invite-name" value={fullName} onChange={(event) => setFullName(event.target.value)} /></div>
            <div className="space-y-2"><Label htmlFor="workspace-name">Workspace name</Label><Input id="workspace-name" placeholder="Defaults to the user's name" value={workspaceName} onChange={(event) => setWorkspaceName(event.target.value)} /></div>
            <DialogFooter><Button type="button" variant="outline" onClick={() => setInviteOpen(false)}>Cancel</Button><Button type="submit" disabled={inviteMutation.isPending}>{inviteMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Send invitation</Button></DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={Boolean(confirmation)} onOpenChange={(open) => { if (!open) setConfirmation(null) }}>
        <DialogContent>
          <DialogHeader><DialogTitle>{confirmation?.action === 'suspend' ? 'Suspend account?' : confirmation?.action === 'reactivate' ? 'Reactivate account?' : 'Revoke invitation?'}</DialogTitle></DialogHeader>
          <p className="text-sm text-muted-foreground">This action applies to {confirmation?.user.email} and their private workspace.</p>
          <DialogFooter><Button variant="outline" onClick={() => setConfirmation(null)}>Cancel</Button><Button variant={confirmation?.action === 'reactivate' ? 'default' : 'destructive'} disabled={statusMutation.isPending} onClick={() => confirmation && statusMutation.mutate(confirmation)}>{statusMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Confirm</Button></DialogFooter>
        </DialogContent>
      </Dialog>
    </DashboardLayout>
  )
}

export default WorkspaceUsers
