import { useEffect, useMemo, useRef, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import * as SelectPrimitive from '@radix-ui/react-select'
import {
  AlertTriangle,
  Building2,
  Check,
  ClipboardList,
  Copy,
  CreditCard,
  Crown,
  Eye,
  EyeOff,
  KeyRound,
  Loader2,
  MoreHorizontal,
  Palette,
  PanelLeft,
  Send,
  ShieldCheck,
  Trash2,
  Upload,
  UserCircle,
  UserPlus,
  Users,
} from 'lucide-react'
import { Link, useLocation } from 'react-router-dom'
import { toast } from 'sonner'
import {
  WORKSPACE_NAV_ORGANIZE_EVENT,
  WorkspaceLayout,
} from '@/components/workspace/WorkspaceLayout'
import { WorkspaceDeletionCard } from '@/components/workspace/WorkspaceDeletionCard'
import { WorkspaceAiKeysCard } from '@/components/workspace/WorkspaceAiKeysCard'
import { InfoTip } from '@/components/workspace/InfoTip'
import { useSetupProgress } from '@/components/workspace/SetupChecklist'
import { ClientBrandingSection } from '@/components/workspace/settings/ClientBrandingSection'
import { FieldSaveError, FieldSaveStatus } from '@/components/workspace/settings/FieldSaveStatus'
import { SettingsBillingSection } from '@/components/workspace/settings/SettingsBillingSection'
import { UnsavedChangesPrompt } from '@/components/workspace/settings/UnsavedChangesPrompt'
import { useAutoSaveField } from '@/components/workspace/settings/useAutoSaveField'
import { SettingsSectionNav, type SettingsSectionGroup } from '@/components/workspace/settings/SettingsSectionNav'
import { SettingsSetupBadge } from '@/components/workspace/settings/SettingsSetupBadge'
import { SECTION_NAV_STATE, useActiveSection } from '@/components/workspace/settings/useActiveSection'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
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
import { cn } from '@/lib/utils'
import { notACredentialField } from '@/lib/formAutofill'
import { plural } from '@/lib/plural'
import { useMediaQuery } from '@/hooks/useMediaQuery'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import {
  MEMBER_AVATAR_MIME_TYPES,
  memberAvatarUrl,
  workspaceLogoUrl,
} from '@/lib/workspaceLogo'
import { MY_WORKSPACE_BASE_HREF, selectedWorkspaceBaseHref } from '@/lib/workspaceRoutes'
import {
  createWorkspaceStaffTemporaryPassword,
  inviteWorkspaceStaff,
  listWorkspaceStaff,
  mutateWorkspaceStaff,
  resetWorkspaceStaffTemporaryPassword,
  retryWorkspaceStaffTemporaryPassword,
  removeMemberAvatar,
  uploadMemberAvatar,
  updateWorkspaceName,
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

type ConfirmationAction = 'suspend' | 'reactivate' | 'revoke' | 'transfer_owner' | 'update_role' | 'reset_password'
type InviteMethod = 'email_invite' | 'temporary_password'
type PasswordRequest =
  | { mode: 'create'; input: WorkspaceStaffInviteInput }
  | { mode: 'retry'; member: WorkspaceStaffMember }
  | { mode: 'reset'; member: WorkspaceStaffMember }

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
  if (!value) return 'Not yet'
  return new Intl.DateTimeFormat(undefined, { dateStyle: 'medium' }).format(new Date(value))
}

/*
 * What each role can and cannot do, in the words the select and its caption
 * both use. Lower-case openings so they read after "Admin:"; the select item
 * capitalises its own copy.
 */
const roleDescriptions: Record<WorkspaceStaffRole, string> = {
  admin: 'manages clients, campaigns, onboarding and the team. Cannot change the owner or other admins, and cannot close the workspace.',
  member: 'works on clients and campaigns. Cannot see Settings, Billing or the team list.',
  owner: 'everything above, plus billing, AI keys and closing the workspace. There is one owner; transfer it from the team list.',
}

const roleLabel = (role: WorkspaceStaffRole) => role.charAt(0).toUpperCase() + role.slice(1)
const sentence = (text: string) => text.charAt(0).toUpperCase() + text.slice(1)

/**
 * A two-line select option: the role, then what it means. The shadcn item
 * puts all of its children inside the ItemText, which the closed trigger then
 * repeats, so the description has to sit beside the text rather than in it.
 */
const RoleOption = ({ role }: { role: WorkspaceStaffRole }) => (
  <SelectPrimitive.Item
    value={role}
    textValue={roleLabel(role)}
    className="relative flex w-full cursor-default select-none flex-col items-start rounded-sm py-1.5 pl-8 pr-2 text-sm outline-none focus:bg-accent focus:text-accent-foreground data-[disabled]:pointer-events-none data-[disabled]:opacity-50"
  >
    <span className="absolute left-2 top-2 flex h-3.5 w-3.5 items-center justify-center">
      <SelectPrimitive.ItemIndicator><Check className="h-4 w-4" /></SelectPrimitive.ItemIndicator>
    </span>
    <SelectPrimitive.ItemText>{roleLabel(role)}</SelectPrimitive.ItemText>
    <span className="max-w-72 text-xs leading-5 text-muted-foreground">{sentence(roleDescriptions[role])}</span>
  </SelectPrimitive.Item>
)

const RolesCaption = ({ roles, className }: { roles: WorkspaceStaffRole[]; className?: string }) => (
  <ul className={cn('space-y-1 text-xs leading-5 text-muted-foreground', className)}>
    {roles.map((role) => (
      <li key={role}><span className="font-medium text-foreground">{roleLabel(role)}:</span> {roleDescriptions[role]}</li>
    ))}
  </ul>
)

interface MemberState {
  label: string
  tone: 'default' | 'secondary' | 'destructive'
  /** When the invite went out and when it stops working, where that is known. */
  detail: string | null
  expired: boolean
}

/**
 * One vocabulary for where a person is on the way in, whichever way they were
 * added. A temporary password is handed over by a person and an invite is
 * emailed, and both used to be described by their mechanism rather than by
 * what the owner is waiting for.
 */
function memberState(member: WorkspaceStaffMember, now = Date.now()): MemberState {
  if (member.status === 'active') return { label: 'Active', tone: 'default', detail: null, expired: false }
  if (member.status === 'suspended') return { label: 'Suspended', tone: 'destructive', detail: null, expired: false }
  if (member.status === 'provisioning') return { label: 'Setting up', tone: 'secondary', detail: null, expired: false }
  const expiresAt = member.invite_expires_at ? Date.parse(member.invite_expires_at) : Number.NaN
  if (Number.isFinite(expiresAt) && expiresAt <= now) {
    return { label: 'Invite expired', tone: 'destructive', detail: `Expired ${formatDate(member.invite_expires_at)}`, expired: true }
  }
  const expiry = member.invite_expires_at ? ` · expires ${formatDate(member.invite_expires_at)}` : ''
  if (member.setup_method === 'admin_temporary_password') {
    return {
      label: 'Waiting for first sign-in',
      tone: 'secondary',
      detail: member.invited_at ? `Issued ${formatDate(member.invited_at)}${expiry}` : null,
      expired: false,
    }
  }
  return {
    label: 'Invited',
    tone: 'secondary',
    detail: member.invited_at ? `Email sent ${formatDate(member.invited_at)}${expiry}` : null,
    expired: false,
  }
}

/**
 * The text an owner pastes to whoever they are setting up, so the person gets
 * the address, the account and the password in one message instead of three.
 */
function signInInstructions(credential: WorkspaceStaffTemporaryCredential): string {
  const origin = String(import.meta.env.VITE_APP_URL || window.location.origin).replace(/\/+$/u, '')
  const expiry = credential.member.invite_expires_at ? formatDate(credential.member.invite_expires_at) : null
  return `Sign in at ${origin}/login with ${credential.email} and this temporary password: ${credential.temporary_password}\n`
    + 'You will be asked to choose your own password straight away.'
    + (expiry ? ` This temporary one stops working on ${expiry}.` : '')
}

function confirmationCopy(
  confirmation: Confirmation,
  isPlatformWorkspace: boolean,
): { title: string; description: string; button: string } {
  const name = confirmation.member.full_name || confirmation.member.email
  if (confirmation.action === 'suspend') {
    return {
      title: `Suspend ${name}?`,
      description: `${name} loses access straight away. Their clients, campaigns and notes stay exactly as they are, and you can reactivate them any time.`,
      button: 'Suspend user',
    }
  }
  if (confirmation.action === 'reactivate') {
    return {
      title: `Reactivate ${name}?`,
      description: 'This restores this team member’s access to the workspace.',
      button: 'Reactivate user',
    }
  }
  if (confirmation.action === 'revoke') {
    return {
      title: `Remove ${name}?`,
      description: `${name} is taken off the team and can no longer sign in. Nothing they worked on is deleted.`,
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
  if (confirmation.action === 'reset_password') {
    return {
      title: `Reset ${name}’s password?`,
      description: 'Their current workspace sessions will stop working. A one-time temporary password will be shown to you, and they must replace it at their next sign-in.',
      button: 'Reset password',
    }
  }
  return {
    title: `Change ${name} to ${confirmation.role}?`,
    description: confirmation.role ? sentence(`${roleLabel(confirmation.role)} ${roleDescriptions[confirmation.role]}`) : '',
    button: 'Change role',
  }
}

const WorkspaceStaff = ({ platformWorkspaceId }: WorkspaceStaffProps) => {
  const { isPlatformAdmin, membership, refreshAccount, refreshSession, signOut, user, workspace } = useAuth()
  const queryClient = useQueryClient()
  const [inviteOpen, setInviteOpen] = useState(false)
  const [invite, setInvite] = useState<WorkspaceStaffInviteInput>(emptyInvite)
  const [inviteMethod, setInviteMethod] = useState<InviteMethod>('email_invite')
  const [credential, setCredential] = useState<WorkspaceStaffTemporaryCredential | null>(null)
  const [credentialVisible, setCredentialVisible] = useState(false)
  const [credentialCopied, setCredentialCopied] = useState(false)
  const [instructionsCopied, setInstructionsCopied] = useState(false)
  const [credentialSaved, setCredentialSaved] = useState(false)
  const [credentialError, setCredentialError] = useState<string | null>(null)
  const [passwordBusy, setPasswordBusy] = useState(false)
  // Which member's password op is running, so the spinner lands on that row
  // rather than every row's password button at once.
  const [passwordBusyMemberId, setPasswordBusyMemberId] = useState<string | null>(null)
  const [avatarRemoveOpen, setAvatarRemoveOpen] = useState(false)
  const [brandingUnsaved, setBrandingUnsaved] = useState(false)
  const [confirmation, setConfirmation] = useState<Confirmation | null>(null)
  const avatarInputRef = useRef<HTMLInputElement>(null)
  const isPlatformWorkspace = platformWorkspaceId !== undefined
  const workspaceId = (isPlatformWorkspace ? platformWorkspaceId : workspace?.id || '').toLowerCase()
  const validWorkspaceId = UUID_PATTERN.test(workspaceId)
  // A platform admin sitting on the default workspace owns it in every sense
  // that matters here, whatever their membership row says: platform admin is
  // decided by admin_users, not by a role on that membership.
  const onOwnPlatformWorkspace = !isPlatformWorkspace
    && isPlatformAdmin
    && Boolean(workspace?.is_default)
  /*
   * A picture belongs to a membership, so the question is not which route this
   * is — it is whether the viewer holds a membership in the workspace on
   * screen. Asking the route instead hid the card from a platform admin opening
   * their own workspace from the platform side, which is the way the operator
   * of this platform actually reaches it.
   *
   * The membership in context is always the viewer's own, so comparing its
   * workspace to the one being edited answers it exactly: shown on your own
   * settings, shown when an admin opens the workspace they belong to, absent in
   * another agency's — where the row genuinely does not exist and the backend
   * would answer, accurately and uselessly, "avatar member row is absent for
   * this actor".
   *
   * On your own settings the workspace on screen is by definition the one you
   * are signed in to, so a valid id is the whole test. Requiring a membership
   * object as well took the card off that page for a platform admin whose
   * account-context carries none — they keep access without a tenant
   * membership — which is a page where it had always rendered.
   */
  const viewerBelongsToWorkspaceOnScreen = validWorkspaceId
    && (
      !isPlatformWorkspace
      || (Boolean(membership) && (workspace?.id || '').toLowerCase() === workspaceId)
    )
  /*
   * Mirrors canOrganizeNavigation in the shell, which offers the same control
   * on the same screens. The two used to disagree: the shell offered reordering
   * while viewing a tenant and this page hid the section, so the sidebar had a
   * button whose settings entry did not exist.
   *
   * The order is the viewer's own in every view — stored against their account
   * and their own workspace — so it is a personalization rather than anything
   * belonging to the workspace being viewed, and the copy below says so.
   */
  const canOrganizeSidebar = validWorkspaceId
    && (isPlatformAdmin || (!isPlatformWorkspace && membership?.role === 'owner'))
  const canManageAiKeys = validWorkspaceId
    && (isPlatformWorkspace || membership?.role === 'owner' || onOwnPlatformWorkspace)
  /*
   * Only the owner of a real tenant workspace, and never the default one — that
   * is the platform's own, and closing it would take the operator's access with
   * it. A platform admin looking at somebody else's workspace closes it from
   * the platform screen, not from inside their settings.
   */
  const canCloseWorkspace = !isPlatformWorkspace
    && membership?.role === 'owner'
    && Boolean(workspace)
    && !workspace?.is_default
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

  // A load failure already renders an inline card with a Retry button below;
  // a toast on top of it double-surfaced the same error and re-fired on every
  // window-focus refetch while the outage lasted. The card is the better
  // surface, so it owns the message alone.

  const data = staffQuery.data
  /*
   * Other pages link straight to a setting (#client-contact-email from the
   * intake page's reply-to banner). The sections only exist once the
   * workspace has loaded, and the router does not scroll to a hash on its
   * own, so a link used to land at the top of Settings with nothing pointed
   * out. Scroll to it once per navigation, and put the cursor in it when it
   * is a field. Keyed on the navigation rather than the hash, so following
   * the same link twice (the credit chip, a setup step) still scrolls. The
   * section menu scrolls for itself and marks its own hash changes.
   */
  const location = useLocation()
  const scrolledNavigationRef = useRef('')
  const settingsLoaded = Boolean(data)
  const staff = useMemo(
    () => (data?.members || []).filter((member) => member.status !== 'revoked'),
    [data?.members],
  )
  const baseHref = isPlatformWorkspace ? selectedWorkspaceBaseHref(workspaceId) : MY_WORKSPACE_BASE_HREF
  // The same steps the clients page lists, so the header here and the card
  // there never disagree about how far along the workspace is.
  const setupProgress = useSetupProgress({
    workspaceId,
    baseHref,
    enabled: validWorkspaceId,
    staffView: data ?? null,
  })
  const capabilities = data?.capabilities
  const canInvite = Boolean(capabilities?.invite_roles.length)
  const canGeneratePassword = capabilities?.can_generate_password === true
  // The default workspace's members are platform operators; the settings are
  // its own, the roster is not editable from here.
  const platformRoster = data?.workspace.is_default === true
  const canManageBranding = capabilities?.can_manage_branding === true
  const canManageClientBranding = capabilities?.can_manage_client_branding === true
  const canManageWorkspaceName = capabilities?.can_manage_workspace_name === true
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

  const ownerEmail = staff.find((member) => member.role === 'owner' && member.status === 'active')?.email ?? null
  // Below 1280px the team table does not fit beside the menu, so the people
  // stack instead; one or the other, never both in the page.
  const stackTeam = useMediaQuery('(max-width: 1279px)')
  const pendingCount = staff.filter((member) => member.status === 'invited' || member.status === 'provisioning').length

  /**
   * Reload this page's own data. Cheap, and nothing outside the page moves.
   */
  const refreshSettings = async () => {
    await queryClient.invalidateQueries({ queryKey })
  }

  /**
   * Reload the account too, for the two things the app shell reads.
   *
   * The workspace name and logo are drawn in the sidebar from the account
   * context, so saving either has to re-read it or the sidebar sits stale
   * until a hard refresh. Quietly: a loud refresh flips the account state to
   * loading, which ProtectedRoute answers with a full-screen spinner, and
   * that unmounted this page mid-save and rebuilt it — drafts and scroll
   * position gone, to change a word in the sidebar.
   */
  const refreshShellIdentity = async () => {
    await refreshSettings()
    // The workspace switcher reads its own list rather than the account, so
    // it kept the old name until that list went stale on its own.
    await queryClient.invalidateQueries({ queryKey: ['platform', user?.id || 'unknown', 'switchable-workspaces'] })
    if (!isPlatformWorkspace) await refreshAccount({ quiet: true })
  }

  /*
   * The picture belongs to the viewer's own membership, and the account context
   * is the only thing that carries it — the staff list DTO has no avatar field
   * at all, so refreshSettings cannot see the change.
   *
   * refreshShellIdentity skips the account read on the platform route, which is
   * right for workspace-level edits to somebody else's workspace and wrong for
   * this one: the card only renders when the membership on screen is the
   * viewer's. Leaving it stale meant the upload succeeded, the page went on
   * showing the old picture, and the next change sent an expected path the row
   * had already moved past — refused as "changed elsewhere" for a change this
   * actor had just made, and only unstuck by reloading.
   */
  const refreshOwnMembership = async () => {
    await refreshSettings()
    await refreshAccount({ quiet: true })
  }

  /*
   * The member's own picture, not the workspace's. Every active member owns
   * theirs — the server locates the row by the authenticated actor — so these
   * carry no permission check beyond being signed in to this workspace.
   */
  const avatarPath = (membership as { avatar_path?: string | null } | null)?.avatar_path ?? null
  const avatarMutation = useMutation({
    mutationFn: (file: File) => uploadMemberAvatar(workspaceId, file, avatarPath),
    onSuccess: async () => {
      await refreshOwnMembership()
      toast.success('Profile picture updated.')
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : 'The profile picture could not be uploaded.'),
  })

  const removeAvatarMutation = useMutation({
    mutationFn: () => {
      if (!avatarPath) throw new Error('There is no profile picture to remove.')
      return removeMemberAvatar(workspaceId, avatarPath)
    },
    onSuccess: async () => {
      setAvatarRemoveOpen(false)
      await refreshOwnMembership()
      toast.success('Profile picture removed.')
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : 'The profile picture could not be removed.'),
  })

  /*
   * Saved with the timestamp it was read at, so a stale tab cannot overwrite
   * a newer name. Kept here rather than read from the query, because a second
   * save can start before the refetch after the first one lands.
   */
  const nameUpdatedAtRef = useRef('')
  if (data?.workspace.updated_at && Date.parse(data.workspace.updated_at) > Date.parse(nameUpdatedAtRef.current || '0')) {
    nameUpdatedAtRef.current = data.workspace.updated_at
  }
  const workspaceName = useAutoSaveField({
    serverValue: data?.workspace.name ?? '',
    normalize: (value) => value.trim(),
    validate: (value) => (value ? null : 'Enter a workspace name.'),
    save: async (value) => {
      if (!canManageWorkspaceName || !nameUpdatedAtRef.current) {
        throw new Error('Workspace name controls are not available yet.')
      }
      const saved = await updateWorkspaceName(workspaceId, { name: value, expected_updated_at: nameUpdatedAtRef.current })
      nameUpdatedAtRef.current = saved.updated_at
      await refreshShellIdentity()
    },
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
    setPasswordBusyMemberId(request.mode === 'create' ? null : request.member.id)
    try {
      if (!canInvite) throw new Error('You do not have permission to add workspace users.')
      if (request.mode === 'create' && !canGeneratePassword) {
        throw new Error('Temporary-password setup is not available yet.')
      }
      const issued = request.mode === 'create'
        ? await createWorkspaceStaffTemporaryPassword(workspaceId, request.input)
        : request.mode === 'retry'
          ? await retryWorkspaceStaffTemporaryPassword(workspaceId, request.member.id)
          : await resetWorkspaceStaffTemporaryPassword(workspaceId, request.member.id)
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
      setPasswordBusyMemberId(null)
    }
  }

  const actionMutation = useMutation({
    mutationFn: async (request: Confirmation | { action: 'retry_invite'; member: WorkspaceStaffMember }) => {
      if (request.action === 'reset_password') {
        throw new Error('Password resets use the one-time credential flow.')
      }
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
              ? 'Team member removed.'
              : request.action === 'suspend'
                ? 'Team member suspended.'
                : 'Team member reactivated.'
      toast.success(message)
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : 'The team member could not be updated.'),
  })

  const inviteBusy = inviteMutation.isPending || passwordBusy

  const clearCredential = () => {
    setCredential(null)
    setCredentialVisible(false)
    setCredentialCopied(false)
    setInstructionsCopied(false)
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

  const copySignInInstructions = async () => {
    if (!credential) return
    try {
      await navigator.clipboard.writeText(signInInstructions(credential))
      setInstructionsCopied(true)
      setCredentialError(null)
    } catch {
      setCredentialError('Copy failed. Reveal the password and copy it manually.')
    }
  }

  const platformWorkspace = isPlatformWorkspace
    ? {
        workspaceId,
        workspaceName: data?.workspace.name || 'Client workspace',
        logoUrl,
        baseHref: selectedWorkspaceBaseHref(workspaceId),
      }
    : undefined


  /*
   * The menu, in page order. Grouped by whose setting it is: the first group
   * is the viewer's own and follows them, the second belongs to the
   * workspace. The group names replace the small uppercase labels each
   * section used to carry above its heading.
   */
  const settingsGroups: SettingsSectionGroup[] = [
    {
      label: 'Your account',
      sections: [
        ...(viewerBelongsToWorkspaceOnScreen ? [{ id: 'your-profile', label: 'Profile', icon: UserCircle }] : []),
        ...(canOrganizeSidebar ? [{ id: 'sidebar-navigation', label: 'Sidebar order', icon: PanelLeft }] : []),
      ],
    },
    {
      label: 'Workspace',
      sections: [
        { id: 'workspace-general', label: 'General', icon: Building2 },
        { id: 'client-branding', label: 'Client branding', icon: Palette },
        { id: 'ai-keys', label: canManageAiKeys ? 'AI keys' : 'Integrations', icon: KeyRound },
        { id: 'workspace-access', label: 'Team & access', icon: Users },
        // Not while viewing another workspace: its billing is platform work
        // and lives at /app/platform/billing, against any workspace.
        ...(!isPlatformWorkspace ? [{ id: 'billing', label: 'Billing', icon: CreditCard }] : []),
        ...(canCloseWorkspace ? [{ id: 'danger-zone', label: 'Danger zone', icon: AlertTriangle }] : []),
      ],
    },
  ].filter((group) => group.sections.length > 0)
  const { activeId: activeSectionId, selectSection } = useActiveSection(
    settingsGroups.flatMap((group) => group.sections.map((section) => section.id)),
    settingsLoaded,
  )
  // After the menu's own hook, which it tells where a link landed.
  useEffect(() => {
    const target = location.hash.slice(1)
    if (!settingsLoaded || !target || scrolledNavigationRef.current === location.key) return
    if ((location.state as typeof SECTION_NAV_STATE | null)?.settingsSectionNav) return
    const element = document.getElementById(decodeURIComponent(target))
    if (!element) return
    scrolledNavigationRef.current = location.key
    const isField = element instanceof HTMLInputElement || element instanceof HTMLTextAreaElement
    element.scrollIntoView({ block: isField ? 'center' : 'start' })
    if (isField) element.focus({ preventScroll: true })
    // The menu marks where the link landed, field or section alike.
    const section = element.closest('section[id]')
    if (section) selectSection(section.id)
  }, [location.hash, location.key, location.state, settingsLoaded, selectSection])

  /*
   * One person's status and actions, shared by the table and by the stacked
   * list a phone gets instead: the table needs 52rem, and on a phone its
   * status and actions sat behind a sideways scroll nobody would find.
   */
  const memberStatus = (member: WorkspaceStaffMember) => {
    const state = memberState(member)
    return (
      <>
        <Badge variant={state.tone}>{state.label}</Badge>
        {state.detail && (
          <p className={cn('mt-1 max-w-48 text-xs', state.expired ? 'font-medium text-destructive' : 'text-muted-foreground')}>
            {state.detail}
          </p>
        )}
        {member.pending_review && <p className="mt-1 max-w-44 text-xs text-destructive">Provider reconciliation requires review.</p>}
      </>
    )
  }

  const memberActions = (member: WorkspaceStaffMember) => {
    const manageable = member.allowed_actions.length > 0
    const busy = actionMutation.isPending || passwordBusy || member.pending_review
    const state = memberState(member)
    const allows = (action: WorkspaceStaffMember['allowed_actions'][number]) => member.allowed_actions.includes(action)
    const rowPasswordBusy = passwordBusy && passwordBusyMemberId === member.id
    const accessActions = [allows('suspend'), allows('reactivate')].some(Boolean)
    const signInActions = [allows('reset_password'), allows('retry_password'), allows('retry_invite')].some(Boolean)
    const dangerActions = [allows('transfer_owner') && capabilities.can_transfer_owner, allows('revoke')].some(Boolean)
    const hasMenu = accessActions || signInActions || dangerActions
    return (
      member.role === 'owner' && !manageable ? <span className="text-sm text-muted-foreground">Owner</span> : manageable ? (
        <div className="inline-flex flex-wrap items-center justify-end gap-2">
          {/* An expired invite gets its one obvious
              next step in the open, not behind the
              menu: the person is locked out until
              somebody presses it. */}
          {state.expired && allows('retry_invite') && (
            <Button size="sm" variant="outline" disabled={busy} onClick={() => actionMutation.mutate({ action: 'retry_invite', member })}>
              <Send className="mr-2 h-4 w-4" />Send a new invite
            </Button>
          )}
          {state.expired && !allows('retry_invite') && (allows('retry_password') || allows('reset_password')) && (
            <Button
              size="sm"
              variant="outline"
              disabled={busy}
              onClick={() => allows('retry_password')
                ? void issueTemporaryPassword({ mode: 'retry', member })
                : setConfirmation({ action: 'reset_password', member })}
            >
              {rowPasswordBusy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <KeyRound className="mr-2 h-4 w-4" />}
              Issue a new password
            </Button>
          )}
          {allows('update_role') && capabilities.can_update_roles && (
            <Select value={member.role} disabled={busy} onValueChange={(role: 'admin' | 'member') => setConfirmation({ action: 'update_role', member, role })}>
              <SelectTrigger className="h-9 w-28" aria-label={`Change role for ${member.email}`}><SelectValue /></SelectTrigger>
              <SelectContent align="end"><RoleOption role="admin" /><RoleOption role="member" /></SelectContent>
            </Select>
          )}
          {hasMenu && (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button size="icon" variant="ghost" className="h-9 w-9" disabled={busy} aria-label={`More actions for ${member.email}`}>
                  {rowPasswordBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : <MoreHorizontal className="h-4 w-4" />}
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-56">
                {accessActions && (
                  <DropdownMenuGroup>
                    <DropdownMenuLabel className="text-xs font-medium text-muted-foreground">Access</DropdownMenuLabel>
                    {allows('suspend') && (
                      <DropdownMenuItem onSelect={() => setConfirmation({ action: 'suspend', member })}>Suspend</DropdownMenuItem>
                    )}
                    {allows('reactivate') && (
                      <DropdownMenuItem onSelect={() => setConfirmation({ action: 'reactivate', member })}>Reactivate</DropdownMenuItem>
                    )}
                  </DropdownMenuGroup>
                )}
                {signInActions && (
                  <DropdownMenuGroup>
                    <DropdownMenuLabel className="text-xs font-medium text-muted-foreground">Sign-in</DropdownMenuLabel>
                    {allows('reset_password') && (
                      <DropdownMenuItem onSelect={() => setConfirmation({ action: 'reset_password', member })}>Reset password</DropdownMenuItem>
                    )}
                    {allows('retry_password') && (
                      <DropdownMenuItem onSelect={() => void issueTemporaryPassword({ mode: 'retry', member })}>Generate password</DropdownMenuItem>
                    )}
                    {allows('retry_invite') && (
                      <DropdownMenuItem onSelect={() => actionMutation.mutate({ action: 'retry_invite', member })}>Resend invite</DropdownMenuItem>
                    )}
                  </DropdownMenuGroup>
                )}
                {dangerActions && (
                  <>
                    {(accessActions || signInActions) && <DropdownMenuSeparator />}
                    <DropdownMenuGroup>
                      {allows('transfer_owner') && capabilities.can_transfer_owner && (
                        <DropdownMenuItem onSelect={() => setConfirmation({ action: 'transfer_owner', member })}>
                          <Crown className="mr-2 h-4 w-4" />Make owner
                        </DropdownMenuItem>
                      )}
                      {allows('revoke') && (
                        <DropdownMenuItem className="text-destructive focus:text-destructive" onSelect={() => setConfirmation({ action: 'revoke', member })}>
                          <Trash2 className="mr-2 h-4 w-4" />Remove
                        </DropdownMenuItem>
                      )}
                    </DropdownMenuGroup>
                  </>
                )}
              </DropdownMenuContent>
            </DropdownMenu>
          )}
        </div>
      ) : null
    )
  }

  const memberRole = (member: WorkspaceStaffMember) => (
    <div className="flex items-center gap-2">
      {member.role === 'owner' ? <Crown className="h-4 w-4 text-amber-600" /> : member.role === 'admin' ? <ShieldCheck className="h-4 w-4 text-primary" /> : null}
      <Badge variant="outline" className="capitalize">{member.role}</Badge>
    </div>
  )

  const body = !validWorkspaceId
    ? <Card><CardHeader><CardTitle>Workspace unavailable</CardTitle><CardDescription>The workspace address is invalid.</CardDescription></CardHeader></Card>
    : staffQuery.isLoading
      ? <div className="flex min-h-64 items-center justify-center"><Loader2 className="h-8 w-8 animate-spin text-primary" aria-label="Loading workspace settings" /></div>
      : staffQuery.error || !data
        ? (
            <Card>
              <CardHeader><CardTitle>Workspace settings unavailable</CardTitle><CardDescription>{staffQuery.error instanceof Error ? staffQuery.error.message : 'Workspace settings could not be loaded.'}</CardDescription></CardHeader>
              <CardContent><Button variant="outline" onClick={() => void staffQuery.refetch()}>Try again</Button></CardContent>
            </Card>
          )
        : (
            <div data-testid="workspace-settings-page" className="mx-auto w-full min-w-0 max-w-full space-y-8 pb-12 xl:max-w-7xl">
              <header className="flex flex-col gap-4 border-b border-border/70 pb-6 sm:flex-row sm:items-end sm:justify-between">
                <div className="min-w-0">
                  <h1 className="text-3xl font-bold tracking-tight sm:text-4xl">Settings</h1>
                  <p className="mt-1.5 max-w-2xl text-muted-foreground">
                    Manage your workspace identity, client experience, and team access.
                  </p>
                </div>
                <SettingsSetupBadge progress={setupProgress} checklistHref={`${baseHref}/clients`} />
              </header>

              {/* A block on a phone, not a one-column grid: the menu sticks
                  within its parent, and a grid row of its own is exactly
                  its height, so it could never stick there. */}
              <div className="min-w-0 space-y-8 lg:grid lg:grid-cols-[220px_minmax(0,1fr)] lg:items-start lg:gap-8 lg:space-y-0">
                <SettingsSectionNav groups={settingsGroups} activeId={activeSectionId} onSelect={selectSection} />

                <div className="min-w-0 space-y-12">
                  {/*
                    * First, because it is the only thing on this page that
                    * belongs to the person rather than to the workspace, and it
                    * is the one setting every member can change for themselves.
                    *
                    * Absent when the viewer has no membership in the workspace
                    * on screen, and that is not a permission check: a picture
                    * belongs to a membership, and a platform admin inspecting an
                    * agency has none there. Offering the control anyway produced
                    * a refusal that was perfectly accurate and read as a bug —
                    * "avatar member row is absent for this actor" — for a state
                    * that simply has no meaning here.
                    */}
                  {viewerBelongsToWorkspaceOnScreen && (
                  <section id="your-profile" className="min-w-0 scroll-mt-36 space-y-4 lg:scroll-mt-28" aria-labelledby="your-profile-title">
                    <div>
                      <h2 id="your-profile-title" tabIndex={-1} className="text-2xl font-semibold tracking-tight focus:outline-none">Profile</h2>
                      <p className="mt-1 text-sm text-muted-foreground">Your picture, shown beside your name in the sidebar.</p>
                    </div>

                    <Card className="min-w-0 max-w-full overflow-hidden border-border/70 shadow-sm">
                      <CardContent className="flex flex-wrap items-center gap-5 p-6 sm:p-7">
                        <Avatar className="h-16 w-16">
                          {memberAvatarUrl(workspaceId, user?.id, avatarPath, (membership as { avatar_updated_at?: string | null } | null)?.avatar_updated_at) && (
                            <AvatarImage
                              src={memberAvatarUrl(workspaceId, user?.id, avatarPath, (membership as { avatar_updated_at?: string | null } | null)?.avatar_updated_at) || undefined}
                              alt="Your profile picture"
                              className="object-cover"
                            />
                          )}
                          <AvatarFallback>{(membership?.full_name || user?.email || '?').charAt(0).toUpperCase()}</AvatarFallback>
                        </Avatar>
                        <div className="min-w-0 flex-1 space-y-2">
                          <input
                            ref={avatarInputRef}
                            id="member-avatar"
                            aria-label="Profile picture file"
                            type="file"
                            className="sr-only"
                            accept={MEMBER_AVATAR_MIME_TYPES.join(',')}
                            disabled={avatarMutation.isPending || removeAvatarMutation.isPending}
                            onChange={(event) => {
                              const file = event.currentTarget.files?.[0]
                              event.currentTarget.value = ''
                              if (file) avatarMutation.mutate(file)
                            }}
                          />
                          <div className="flex flex-wrap gap-2">
                            <Button
                              type="button"
                              size="sm"
                              variant="outline"
                              disabled={avatarMutation.isPending || removeAvatarMutation.isPending}
                              onClick={() => avatarInputRef.current?.click()}
                            >
                              {avatarMutation.isPending
                                ? <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                : <Upload className="mr-2 h-4 w-4" />}
                              {avatarPath ? 'Replace picture' : 'Upload picture'}
                            </Button>
                            {avatarPath && (
                              <Button
                                type="button"
                                size="sm"
                                variant="ghost"
                                className="text-destructive hover:text-destructive"
                                disabled={avatarMutation.isPending || removeAvatarMutation.isPending}
                                onClick={() => setAvatarRemoveOpen(true)}
                              >
                                <Trash2 className="mr-2 h-4 w-4" />Remove
                              </Button>
                            )}
                          </div>
                          <p className="text-sm text-muted-foreground">PNG, JPEG, or WebP, up to 2 MB. Only you can change yours.</p>
                        </div>
                      </CardContent>
                    </Card>
                  </section>
                  )}

                  {canOrganizeSidebar && (
                    <section id="sidebar-navigation" className="min-w-0 scroll-mt-36 space-y-4 lg:scroll-mt-28" aria-labelledby="sidebar-navigation-title">
                      <div>
                        <h2 id="sidebar-navigation-title" tabIndex={-1} className="text-2xl font-semibold tracking-tight focus:outline-none">Sidebar order</h2>
                        <p className="mt-1 text-sm text-muted-foreground">Put the pages you use most where you want them. Only you see this order.</p>
                      </div>

                      <Card className="min-w-0 max-w-full overflow-hidden border-border/70 shadow-sm">
                        <CardContent className="flex min-w-0 flex-col gap-5 p-6 sm:flex-row sm:items-center sm:justify-between sm:p-7">
                          <div className="flex min-w-0 items-start gap-4">
                            <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-muted text-muted-foreground">
                              <PanelLeft className="h-5 w-5" />
                            </span>
                            <p className="flex min-w-0 max-w-2xl items-center gap-1 text-sm leading-6 text-muted-foreground">
                              Drag pages into the order you want.
                              <InfoTip topic="where the order is saved">
                                It is saved in this browser, so another browser or device starts with the default order.
                              </InfoTip>
                            </p>
                          </div>
                          <Button
                            type="button"
                            variant="outline"
                            className="shrink-0"
                            onClick={() => window.dispatchEvent(new Event(WORKSPACE_NAV_ORGANIZE_EVENT))}
                          >
                            <PanelLeft className="mr-2 h-4 w-4" />
                            Organize sidebar
                          </Button>
                        </CardContent>
                      </Card>
                    </section>
                  )}

                  <section id="workspace-general" className="min-w-0 scroll-mt-36 space-y-4 lg:scroll-mt-28" aria-labelledby="workspace-general-title">
                    <div>
                      <h2 id="workspace-general-title" tabIndex={-1} className="text-2xl font-semibold tracking-tight focus:outline-none">General</h2>
                      <p className="mt-1 text-sm text-muted-foreground">How this workspace appears to your team.</p>
                    </div>

                    <Card className="min-w-0 max-w-full overflow-hidden border-border/70 shadow-sm">
                      <CardContent className="p-0">
                        <div className="min-w-0 p-6 sm:p-7">
                          <div className="min-w-0 max-w-xl space-y-3">
                            <div className="flex items-center justify-between gap-2">
                              <Label htmlFor="workspace-name">Workspace name</Label>
                              <FieldSaveStatus status={workspaceName.status} />
                            </div>
                            <Input
                              id="workspace-name"
                              {...notACredentialField}
                              maxLength={120}
                              value={workspaceName.value}
                              disabled={!canManageWorkspaceName}
                              onChange={(event) => workspaceName.setValue(event.target.value)}
                              onBlur={workspaceName.onBlur}
                              aria-invalid={workspaceName.error ? true : undefined}
                              aria-describedby={workspaceName.error ? 'workspace-name-error' : undefined}
                            />
                            <FieldSaveError id="workspace-name-error" error={workspaceName.error} />
                            <p className="flex items-center gap-1 text-xs text-muted-foreground">
                              Only your team sees this.
                              <InfoTip topic="the workspace name">
                                It names the workspace in the sidebar and the workspace switcher. Clients see the agency name under Client branding instead.
                              </InfoTip>
                            </p>
                            {!canManageWorkspaceName ? (
                              <p className="text-sm text-muted-foreground">Workspace name controls are not available for your role.</p>
                            ) : null}
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  </section>

                  <section id="client-branding" className="min-w-0 scroll-mt-36 space-y-4 lg:scroll-mt-28" aria-labelledby="client-branding-title">
                    <div>
                      <h2 id="client-branding-title" tabIndex={-1} className="text-2xl font-semibold tracking-tight focus:outline-none">Client branding</h2>
                      <p className="mt-1 text-sm text-muted-foreground">What your clients see on their dashboards, onboarding and emails.</p>
                    </div>

                    <ClientBrandingSection
                      workspaceId={workspaceId}
                      view={data}
                      canManageBranding={canManageBranding}
                      canManageClientBranding={canManageClientBranding}
                      ownerEmail={ownerEmail}
                      logoUrl={logoUrl}
                      workspaceInitials={workspaceInitials}
                      onSaved={refreshSettings}
                      onLogoChanged={refreshShellIdentity}
                      onUnsavedChange={setBrandingUnsaved}
                    />
                  </section>

                  <section id="ai-keys" className="min-w-0 scroll-mt-36 space-y-4 lg:scroll-mt-28" aria-labelledby="ai-keys-title">
                    <div>
                      <h2 id="ai-keys-title" tabIndex={-1} className="text-2xl font-semibold tracking-tight focus:outline-none">
                        {canManageAiKeys ? 'AI keys' : 'Integrations'}
                      </h2>
                      <p className="mt-1 text-sm text-muted-foreground">
                        {canManageAiKeys
                          ? 'Optional. Add your own key to bill AI usage to your provider instead of using platform credits.'
                          : 'The services this workspace is connected to.'}
                      </p>
                    </div>
                    {canManageAiKeys && <WorkspaceAiKeysCard workspaceId={workspaceId} queryScope={queryKey} />}
                    {/* Read-only on purpose: the connection is made and
                        managed in Client Campaigns. This row only says whether
                        it exists, so nobody hunts through settings for it. */}
                    <Card className="min-w-0 max-w-full overflow-hidden border-border/70 shadow-sm">
                      <CardContent className="flex flex-wrap items-center gap-4 p-5 sm:p-6">
                        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground">
                          <Send className="h-4 w-4" />
                        </span>
                        <div className="min-w-0">
                          <p className="font-semibold">Instantly</p>
                          <p className="text-sm text-muted-foreground" data-testid="instantly-status">
                            {setupProgress.integration?.connected
                              ? `Connected to ${setupProgress.integration.provider_workspace_name || 'your Instantly workspace'} · `
                              : 'Not connected · '}
                            <Link to={`${baseHref}/client-campaigns`} className="font-medium text-foreground underline underline-offset-2">
                              {setupProgress.integration?.connected ? 'Manage in Client Campaigns' : 'Connect in Client Campaigns'}
                            </Link>
                          </p>
                        </div>
                      </CardContent>
                    </Card>
                  </section>

                  <section id="workspace-access" className="min-w-0 scroll-mt-36 space-y-4 lg:scroll-mt-28" aria-labelledby="workspace-access-title">
                    <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
                      <div>
                        {/* The count in the heading, where the three stat
                            tiles used to repeat it at the size of a headline. */}
                        <h2 id="workspace-access-title" tabIndex={-1} className="text-2xl font-semibold tracking-tight focus:outline-none">
                          Team &amp; access
                          <span className="text-base font-normal tracking-normal text-muted-foreground">
                            {' · '}{plural(staff.length, 'member')}
                            {pendingCount > 0 && `, ${pendingCount} pending`}
                          </span>
                        </h2>
                        <p className="mt-1 text-sm text-muted-foreground">
                          Who can sign in to this workspace, and what they can do.
                        </p>
                      </div>
                      {platformRoster ? (
                        <Button variant="outline" asChild>
                          <Link to="/app/manage-workspaces"><Users className="mr-2 h-4 w-4" />Manage workspaces</Link>
                        </Button>
                      ) : (
                        <Button
                          disabled={!canInvite}
                          onClick={() => {
                            setInvite({ ...emptyInvite, role: allowedInviteRoles[0] || 'member' })
                            setInviteMethod('email_invite')
                            setInviteOpen(true)
                          }}
                        >
                          <UserPlus className="mr-2 h-4 w-4" />Invite member
                        </Button>
                      )}
                    </div>

                    <Card className="min-w-0 max-w-full overflow-hidden border-border/70 shadow-sm">
                      <CardHeader className="border-b border-border/70 bg-muted/15">
                        <CardDescription>
                          {platformRoster
                            ? <>These are the people who run the platform. They are added on the platform side, not invited here. To create a workspace or change who owns one, open <Link to="/app/manage-workspaces" className="font-medium underline underline-offset-2">Manage workspaces</Link>.</>
                            : (
                              <span className="flex items-center gap-1">
                                Owners and admins manage the workspace; members work on clients.
                                {/* The full list of what each role may do, behind
                                    the line rather than three paragraphs above
                                    the table. The role picker repeats it. */}
                                <InfoTip topic="what each role can do">
                                  <RolesCaption roles={['admin', 'member', 'owner']} className="text-popover-foreground [&_span]:text-popover-foreground" />
                                  <span className="mt-2 block">Client portal users are separate, and are managed inside each client.</span>
                                </InfoTip>
                              </span>
                            )}
                        </CardDescription>
                      </CardHeader>
                      <CardContent className="min-w-0 p-0">
                        {/* A phone gets the same people stacked: name, then
                            role and status, then the actions, all in view. */}
                        {stackTeam ? (
                        <ul className="divide-y divide-border/70" aria-label="Team members">
                          {staff.map((member) => (
                            <li key={member.id} className="space-y-3 p-4">
                              <div className="min-w-0">
                                <p className="truncate font-medium">{member.full_name || 'Invited user'}</p>
                                <p className="truncate text-sm text-muted-foreground">{member.email}</p>
                              </div>
                              <div className="flex flex-wrap items-start gap-x-4 gap-y-2">
                                {memberRole(member)}
                                <div>{memberStatus(member)}</div>
                                <p className="text-xs text-muted-foreground">Added {formatDate(member.accepted_at || member.invited_at)}</p>
                              </div>
                              <div className="flex justify-start [&>div]:justify-start">{memberActions(member)}</div>
                            </li>
                          ))}
                        </ul>
                        ) : (
                        <div className="max-w-full overflow-hidden">
                    <Table className="min-w-[44rem]">
                      <TableHeader className="bg-muted/30"><TableRow><TableHead>User</TableHead><TableHead>Role</TableHead><TableHead>Status</TableHead><TableHead>Joined / added</TableHead><TableHead className="text-right">Actions</TableHead></TableRow></TableHeader>
                      <TableBody>
                        {staff.map((member) => (
                          <TableRow key={member.id}>
                            <TableCell>
                              <div className="font-medium">{member.full_name || 'Invited user'}</div>
                              <div className="text-sm text-muted-foreground">{member.email}</div>
                            </TableCell>
                            <TableCell>{memberRole(member)}</TableCell>
                            <TableCell>{memberStatus(member)}</TableCell>
                            <TableCell>{formatDate(member.accepted_at || member.invited_at)}</TableCell>
                            <TableCell className="text-right">{memberActions(member)}</TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                        </div>
                        )}
                      </CardContent>
                    </Card>
                  </section>

                  {!isPlatformWorkspace && (
                    <section id="billing" className="min-w-0 scroll-mt-36 space-y-4 lg:scroll-mt-28" aria-labelledby="billing-title">
                      <div>
                        <h2 id="billing-title" tabIndex={-1} className="text-2xl font-semibold tracking-tight focus:outline-none">Billing</h2>
                        <p className="mt-1 text-sm text-muted-foreground">Your plan and credit balance. Buy credits or change plan on the billing page.</p>
                      </div>
                      <SettingsBillingSection workspaceId={workspaceId} billingHref={`${baseHref}/settings/billing`} />
                    </section>
                  )}

                  {canCloseWorkspace && workspace && (
                    <section
                      id="danger-zone"
                      className="min-w-0 scroll-mt-36 space-y-4 lg:scroll-mt-28 rounded-2xl border border-destructive/30 bg-destructive/5 p-5 sm:p-6"
                      aria-labelledby="danger-zone-title"
                    >
                      <div>
                        <h2 id="danger-zone-title" tabIndex={-1} className="text-2xl font-semibold tracking-tight focus:outline-none">Danger zone</h2>
                        <p className="mt-1 text-sm text-muted-foreground">Nothing here can be undone from inside the app.</p>
                      </div>
                      <WorkspaceDeletionCard workspaceId={workspace.id} workspaceName={workspace.name} />
                    </section>
                  )}
                </div>
              </div>
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
            <DialogTitle>Add a team member</DialogTitle>
            <DialogDescription>
              {canGeneratePassword
                ? 'Choose how this person will receive their first sign-in credential.'
                : 'They will receive an email invitation to create their account.'}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2"><Label htmlFor="staff-name">Full name</Label><Input id="staff-name" {...notACredentialField} value={invite.full_name || ''} maxLength={120} disabled={inviteBusy} onChange={(event) => setInvite((current) => ({ ...current, full_name: event.target.value }))} /></div>
            <div className="space-y-2"><Label htmlFor="staff-email">Email</Label><Input id="staff-email" type="email" {...notACredentialField} value={invite.email} maxLength={254} disabled={inviteBusy} onChange={(event) => setInvite((current) => ({ ...current, email: event.target.value }))} /></div>
            <div className="space-y-2">
              <Label htmlFor="staff-role">Role</Label>
              <Select value={invite.role} disabled={inviteBusy} onValueChange={(role: 'admin' | 'member') => setInvite((current) => ({ ...current, role }))}>
                <SelectTrigger id="staff-role"><SelectValue /></SelectTrigger>
                <SelectContent>{allowedInviteRoles.map((role) => <RoleOption key={role} role={role} />)}</SelectContent>
              </Select>
              <RolesCaption roles={[...allowedInviteRoles, 'owner']} />
            </div>
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
                <p className="text-xs leading-5 text-muted-foreground">
                  Use a temporary password when their inbox cannot receive our invitation, or when you are setting them up in person.
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
                {/* The whole message, not just the secret: where to go, which
                    account, and that the password is a one-off. Pasting the
                    password alone left the person guessing the rest. */}
                <Button type="button" variant="outline" size="sm" onClick={() => void copySignInInstructions()}>
                  <ClipboardList className="mr-2 h-4 w-4" />{instructionsCopied ? 'Sign-in instructions copied' : 'Copy sign-in instructions'}
                </Button>
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
        open={avatarRemoveOpen}
        onOpenChange={(open) => !removeAvatarMutation.isPending && setAvatarRemoveOpen(open)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove your profile picture?</AlertDialogTitle>
            <AlertDialogDescription>
              Your initials show beside your name instead until you upload a new one.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={removeAvatarMutation.isPending}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              disabled={removeAvatarMutation.isPending}
              onClick={(event) => {
                event.preventDefault()
                removeAvatarMutation.mutate()
              }}
            >
              {removeAvatarMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Remove picture
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <UnsavedChangesPrompt when={brandingUnsaved || workspaceName.unsaved} />

      <AlertDialog open={Boolean(confirmation)} onOpenChange={(open) => !open && !actionMutation.isPending && setConfirmation(null)}>
        <AlertDialogContent>
          {confirmation && (() => {
            const copy = confirmationCopy(confirmation, isPlatformWorkspace)
            const confirmationBusy = actionMutation.isPending || passwordBusy
            return <><AlertDialogHeader><AlertDialogTitle>{copy.title}</AlertDialogTitle><AlertDialogDescription>{copy.description}</AlertDialogDescription></AlertDialogHeader><AlertDialogFooter><AlertDialogCancel disabled={confirmationBusy}>Cancel</AlertDialogCancel><AlertDialogAction onClick={(event) => {
              // Keep the dialog open while the action runs — the Radix Action
              // closes on click by default, which fired the in-flight spinner
              // and disabled-state as dead code and made a failed suspend or
              // transfer look done. onSuccess/reset close it explicitly.
              event.preventDefault()
              if (confirmation.action === 'reset_password') {
                const member = confirmation.member
                setConfirmation(null)
                void issueTemporaryPassword({ mode: 'reset', member })
                return
              }
              actionMutation.mutate(confirmation)
            }} disabled={confirmationBusy}>{confirmationBusy && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}{copy.button}</AlertDialogAction></AlertDialogFooter></>
          })()}
        </AlertDialogContent>
      </AlertDialog>
    </WorkspaceLayout>
  )
}

export default WorkspaceStaff
