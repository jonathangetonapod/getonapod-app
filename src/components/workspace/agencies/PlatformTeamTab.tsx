import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Loader2, Send, ShieldCheck, UserMinus, UserPlus, XCircle } from 'lucide-react'
import { toast } from 'sonner'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { RowMenu, type RowMenuItem } from '@/components/workspace/RowMenu'
import { formatDate } from '@/lib/dates'
import {
  inviteExpired,
  listPlatformTeam,
  updatePlatformTeamMember,
  type PlatformTeamAction,
  type PlatformTeamMember,
} from '@/services/platformTeam'
import { TabIntro } from './InfoTip'
import { InvitePlatformAdminDialog } from './InvitePlatformAdminDialog'

interface Confirmation {
  action: PlatformTeamAction
  member: PlatformTeamMember
}

const nameOf = (member: PlatformTeamMember) => member.full_name || member.email

const isPending = (member: PlatformTeamMember) => member.status === 'provisioning' || member.status === 'invited'

const CONFIRM_COPY: Record<PlatformTeamAction, { title: (member: PlatformTeamMember) => string; body: (member: PlatformTeamMember) => string; button: string; destructive: boolean }> = {
  resend_invite: {
    title: (member) => member.status === 'provisioning' ? `Send ${nameOf(member)} their invite?` : `Send ${nameOf(member)} a new invite?`,
    body: (member) => member.status === 'provisioning'
      ? `The invite link goes to ${member.email}. It expires in 24 hours.`
      : `A fresh link goes to ${member.email}. The earlier link stops working.`,
    button: 'Send invite',
    destructive: false,
  },
  cancel_invite: {
    title: (member) => `Cancel the invite for ${nameOf(member)}?`,
    body: (member) => `The link sent to ${member.email} stops working. You can invite them again later.`,
    button: 'Cancel invite',
    destructive: true,
  },
  grant_admin: {
    title: (member) => `Make ${nameOf(member)} a platform admin?`,
    body: (member) => `${member.email} will be able to open every workspace, manage agencies and use the admin pages.`,
    button: 'Make platform admin',
    destructive: false,
  },
  remove: {
    title: (member) => `Remove ${nameOf(member)} from the platform team?`,
    body: (member) => `${member.email} loses access to the platform and every workspace now, including any session they have open, and their sign-in is deleted. You can invite them again later.`,
    button: 'Remove',
    destructive: true,
  },
}

const accessBadge = (member: PlatformTeamMember) => {
  if (member.role === 'owner') return <Badge>Owner</Badge>
  // Platform access needs an active membership, so only say so when it holds.
  if (member.platform_admin && member.status === 'active') return <Badge variant="secondary">Platform admin</Badge>
  if (member.platform_admin) return <Badge variant="outline">Platform admin, no access while suspended</Badge>
  if (member.platform_invite && isPending(member)) return <Badge variant="outline">Platform admin when they join</Badge>
  return <Badge variant="outline">Team member</Badge>
}

const statusLabel = (member: PlatformTeamMember) => {
  if (member.needs_review) return 'Stuck: needs operator review'
  if (member.status === 'active') return 'Active'
  if (member.status === 'suspended') return 'Suspended'
  if (member.status === 'revoked') return 'Cancelling'
  if (member.status === 'provisioning') return member.delivery_pending ? 'Sending invite' : 'Invite not sent'
  if (inviteExpired(member)) return 'Invite expired'
  return `Invited, expires ${formatDate(member.invite_expires_at)}`
}

/** The people who run the platform, and the one place to add or remove them. */
export const PlatformTeamTab = () => {
  const queryClient = useQueryClient()
  const [inviteOpen, setInviteOpen] = useState(false)
  const [confirmation, setConfirmation] = useState<Confirmation | null>(null)
  const teamQuery = useQuery({ queryKey: ['platform', 'team'], queryFn: listPlatformTeam })
  const refresh = () => queryClient.invalidateQueries({ queryKey: ['platform', 'team'] })

  const mutation = useMutation({
    mutationFn: ({ action, member }: Confirmation) => updatePlatformTeamMember(action, member.id),
    onSuccess: (result, { action, member }) => {
      if (action === 'remove' && result?.sign_in_deleted === false) {
        toast.warning(`${nameOf(member)} was removed and has no access. Their old sign-in could not be deleted, so inviting ${member.email} again needs manual cleanup.`)
        setConfirmation(null)
        return
      }
      const done: Record<PlatformTeamAction, string> = {
        resend_invite: `New invite sent to ${member.email}.`,
        cancel_invite: `Invite for ${member.email} cancelled.`,
        grant_admin: `${nameOf(member)} is now a platform admin.`,
        remove: `${nameOf(member)} was removed from the platform team.`,
      }
      toast.success(done[action])
      setConfirmation(null)
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : 'The platform team could not be changed.'),
    onSettled: () => void refresh(),
  })

  const canManage = teamQuery.data?.can_manage === true
  const members = teamQuery.data?.members ?? []

  const menuFor = (member: PlatformTeamMember): RowMenuItem[] => {
    if (!canManage || member.is_self || member.role === 'owner') return []
    const ask = (action: PlatformTeamAction) => () => setConfirmation({ action, member })
    const items: RowMenuItem[] = []
    if (isPending(member) && member.platform_invite) {
      items.push({ label: 'Resend invite', icon: <Send className="h-4 w-4" />, onSelect: ask('resend_invite'), disabled: member.delivery_pending })
      items.push('divider')
      items.push({ label: 'Cancel invite', icon: <XCircle className="h-4 w-4" />, onSelect: ask('cancel_invite'), destructive: true, disabled: member.delivery_pending })
    }
    if (member.status === 'active' && !member.platform_admin) {
      items.push({ label: 'Make platform admin', icon: <ShieldCheck className="h-4 w-4" />, onSelect: ask('grant_admin') })
    }
    if (member.status === 'active' || member.status === 'suspended') {
      items.push('divider')
      items.push({ label: 'Remove from platform', icon: <UserMinus className="h-4 w-4" />, onSelect: ask('remove'), destructive: true })
    }
    return items
  }

  const copy = confirmation ? CONFIRM_COPY[confirmation.action] : null

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <TabIntro info="Platform admins can open every agency workspace, use Manage workspaces and the admin pages. Only the platform owner can invite or remove people.">
          The people who run the platform.
        </TabIntro>
        {canManage && (
          <Button onClick={() => setInviteOpen(true)}><UserPlus className="mr-2 h-4 w-4" />Invite platform admin</Button>
        )}
      </div>

      {teamQuery.isLoading ? (
        <div className="flex min-h-40 items-center justify-center"><Loader2 className="h-7 w-7 animate-spin text-primary" /></div>
      ) : teamQuery.error ? (
        <div className="flex flex-col items-start gap-3 rounded-md border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive">
          <p>{teamQuery.error instanceof Error ? teamQuery.error.message : 'The platform team could not be loaded.'}</p>
          <Button type="button" size="sm" variant="outline" disabled={teamQuery.isFetching} onClick={() => void teamQuery.refetch()}>Try again</Button>
        </div>
      ) : (
        <>
          {!canManage && (
            <p className="text-sm text-muted-foreground">Only the platform owner can invite or remove people. Ask them if someone needs access.</p>
          )}
          <div className="overflow-x-auto rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Person</TableHead>
                  <TableHead>Access</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Joined</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {members.map((member) => (
                  <TableRow key={member.id}>
                    <TableCell>
                      <p className="font-medium">{nameOf(member)}{member.is_self && <span className="text-muted-foreground"> (you)</span>}</p>
                      {member.full_name && <p className="text-sm text-muted-foreground">{member.email}</p>}
                    </TableCell>
                    <TableCell>{accessBadge(member)}</TableCell>
                    <TableCell className="text-sm">{statusLabel(member)}</TableCell>
                    <TableCell className="whitespace-nowrap text-sm tabular-nums">{member.accepted_at ? formatDate(member.accepted_at) : '—'}</TableCell>
                    <TableCell className="text-right"><RowMenu items={menuFor(member)} label={`Actions for ${nameOf(member)}`} /></TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </>
      )}

      <InvitePlatformAdminDialog open={inviteOpen} onOpenChange={setInviteOpen} onSettled={() => void refresh()} />

      <Dialog open={Boolean(confirmation)} onOpenChange={(open) => { if (!open && !mutation.isPending) setConfirmation(null) }}>
        <DialogContent>
          {confirmation && copy && (
            <>
              <DialogHeader>
                <DialogTitle>{copy.title(confirmation.member)}</DialogTitle>
                <DialogDescription>{copy.body(confirmation.member)}</DialogDescription>
              </DialogHeader>
              <DialogFooter>
                <Button variant="outline" disabled={mutation.isPending} onClick={() => setConfirmation(null)}>Keep as is</Button>
                <Button variant={copy.destructive ? 'destructive' : 'default'} disabled={mutation.isPending} onClick={() => mutation.mutate(confirmation)}>
                  {mutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}{copy.button}
                </Button>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  )
}
