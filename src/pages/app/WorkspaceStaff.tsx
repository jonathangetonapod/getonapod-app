import { useEffect, useMemo, useRef, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import * as SelectPrimitive from '@radix-ui/react-select'
import {
  ArrowRight,
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
import { Link } from 'react-router-dom'
import { toast } from 'sonner'
import {
  WORKSPACE_NAV_ORGANIZE_EVENT,
  WorkspaceLayout,
} from '@/components/workspace/WorkspaceLayout'
import { WorkspaceDeletionCard } from '@/components/workspace/WorkspaceDeletionCard'
import { WorkspaceAiKeysCard } from '@/components/workspace/WorkspaceAiKeysCard'
import { WorkspaceAiModelsCard } from '@/components/workspace/WorkspaceAiModelsCard'
import { OutreachConnectionCard } from '@/components/workspace/OutreachConnectionCard'
import { InfoTip } from '@/components/workspace/InfoTip'
import { useSetupProgress } from '@/components/workspace/SetupChecklist'
import { ClientBrandingSection } from '@/components/workspace/settings/ClientBrandingSection'
import { FieldSaveError, FieldSaveStatus } from '@/components/workspace/settings/FieldSaveStatus'
import { SettingsBillingSection } from '@/components/workspace/settings/SettingsBillingSection'
import { UnsavedChangesPrompt } from '@/components/workspace/settings/UnsavedChangesPrompt'
import { useAutoSaveField } from '@/components/workspace/settings/useAutoSaveField'
import { SettingsSectionNav, type SettingsSectionGroup } from '@/components/workspace/settings/SettingsSectionNav'
import { SettingsSetupBadge } from '@/components/workspace/settings/SettingsSetupBadge'
import { useSettingsSection } from '@/components/workspace/settings/useSettingsSection'
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
import { cn } from '@/lib/utils'
import { notACredentialField } from '@/lib/formAutofill'
import { plural } from '@/lib/plural'
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

/** The open section's title. One per page, so the id is shared. */
const SectionHeading = ({ title, description }: { title: string; description?: string }) => (
  <div className="min-w-0">
    <h2 id="settings-section-title" className="text-xl font-semibold tracking-tight">{title}</h2>
    {description && <p className="mt-1 text-sm text-muted-foreground">{description}</p>}
  </div>
)

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
  // Links from other pages (#client-contact-email) are mapped to their
  // section and focused by useSettingsSection once the data has loaded.
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
  const activeCount = staff.filter((member) => member.status === 'active').length
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
   * The menu: the viewer's own settings first, then the workspace's. One
   * section shows at a time, named in ?section= (see useSettingsSection).
   */
  const showProfile = viewerBelongsToWorkspaceOnScreen || canOrganizeSidebar
  const settingsGroups: SettingsSectionGroup[] = [
    {
      label: 'You',
      sections: showProfile ? [{ id: 'profile', label: 'Profile', icon: UserCircle }] : [],
    },
    {
      label: 'Workspace',
      sections: [
        { id: 'general', label: 'General', icon: Building2 },
        { id: 'branding', label: 'Client branding', icon: Palette },
        { id: 'integrations', label: 'Integrations', icon: KeyRound },
        { id: 'team', label: 'Team & access', icon: Users },
        // Not while viewing another workspace: its billing is platform work
        // and lives at /app/platform/billing, against any workspace.
        ...(!isPlatformWorkspace ? [{ id: 'billing' as const, label: 'Billing', icon: CreditCard }] : []),
      ],
    },
  ].filter((group) => group.sections.length > 0) as SettingsSectionGroup[]
  const { active: activeSection, hrefFor } = useSettingsSection(
    settingsGroups.flatMap((group) => group.sections.map((section) => section.id)),
    settingsLoaded,
  )

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
      manageable ? (
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
          {hasMenu && (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button size="icon" variant="ghost" className="h-11 w-11" disabled={busy} aria-label={`More actions for ${member.email}`}>
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

  const memberRole = (member: WorkspaceStaffMember) => {
    const busy = actionMutation.isPending || passwordBusy || member.pending_review
    if (member.allowed_actions.includes('update_role') && capabilities.can_update_roles) {
      return (
        <Select value={member.role} disabled={busy} onValueChange={(role: 'admin' | 'member') => setConfirmation({ action: 'update_role', member, role })}>
          <SelectTrigger className="h-11 w-32" aria-label={`Change role for ${member.email}`}><SelectValue /></SelectTrigger>
          <SelectContent align="end"><RoleOption role="admin" /><RoleOption role="member" /></SelectContent>
        </Select>
      )
    }
    return (
      <div className="flex items-center gap-2">
        {member.role === 'owner' ? <Crown className="h-4 w-4 text-amber-600" aria-hidden="true" /> : member.role === 'admin' ? <ShieldCheck className="h-4 w-4 text-primary" aria-hidden="true" /> : null}
        <Badge variant="outline" className="capitalize">{member.role}</Badge>
      </div>
    )
  }

  const memberJoined = (member: WorkspaceStaffMember) => (member.accepted_at
    ? `Joined ${formatDate(member.accepted_at)}`
    : `Invited ${formatDate(member.invited_at)}`)

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
            <div data-testid="workspace-settings-page" className="mx-auto w-full min-w-0 max-w-full space-y-6 pb-12 xl:max-w-6xl">
              <header className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
                <div className="min-w-0">
                  <h1 className="text-3xl font-bold tracking-tight">Settings</h1>
                  <p className="mt-1 text-sm text-muted-foreground">Changes save automatically</p>
                </div>
                <SettingsSetupBadge progress={setupProgress} checklistHref={`${baseHref}/clients`} />
              </header>

              <div className="min-w-0 space-y-6 lg:grid lg:grid-cols-[13rem_minmax(0,1fr)] lg:items-start lg:gap-8 lg:space-y-0">
                <SettingsSectionNav groups={settingsGroups} activeId={activeSection} hrefFor={hrefFor} />

                <div className="min-w-0 space-y-4">
                  {activeSection === 'profile' && (
                    <section id="your-profile" className="min-w-0 space-y-4" aria-labelledby="settings-section-title">
                      <SectionHeading title="Profile" description="How you appear to your team, and how your sidebar is laid out." />
                      <Card className="min-w-0 max-w-full overflow-hidden border-border/70 shadow-sm">
                        <CardContent className="divide-y p-0">
                          {/*
                            * Absent when the viewer has no membership in the
                            * workspace on screen: a picture belongs to a
                            * membership, and a platform admin inspecting an
                            * agency has none there.
                            */}
                          {viewerBelongsToWorkspaceOnScreen && (
                            <div className="flex flex-wrap items-center gap-5 p-5 sm:p-6">
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
                              <div className="min-w-0 flex-1 basis-56 space-y-2">
                                <p className="font-medium">Profile picture</p>
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
                                <p className="text-sm text-muted-foreground">PNG, JPEG, or WebP, up to 2 MB. Shown beside your name in the sidebar.</p>
                              </div>
                              <div className="flex flex-wrap gap-2">
                                <Button
                                  type="button"
                                  variant="outline"
                                  className="min-h-11"
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
                                    variant="ghost"
                                    className="min-h-11 text-destructive hover:text-destructive"
                                    disabled={avatarMutation.isPending || removeAvatarMutation.isPending}
                                    onClick={() => setAvatarRemoveOpen(true)}
                                  >
                                    <Trash2 className="mr-2 h-4 w-4" />Remove
                                  </Button>
                                )}
                              </div>
                            </div>
                          )}
                          {/*
                            * Mirrors canOrganizeNavigation in the shell. The
                            * order is the viewer's own in every view, so it
                            * sits with their profile.
                            */}
                          {canOrganizeSidebar && (
                            <div id="sidebar-navigation" className="flex flex-wrap items-center justify-between gap-4 p-5 sm:p-6">
                              <div className="min-w-0 flex-1 basis-56">
                                <p className="font-medium">Sidebar order</p>
                                <p className="mt-1 flex items-center gap-1 text-sm text-muted-foreground">
                                  Put the pages you use most where you want them. Only you see this order.
                                  <InfoTip topic="where the order is saved">
                                    It is saved in this browser, so another browser or device starts with the default order.
                                  </InfoTip>
                                </p>
                              </div>
                              <Button
                                type="button"
                                variant="outline"
                                className="min-h-11 shrink-0"
                                onClick={() => window.dispatchEvent(new Event(WORKSPACE_NAV_ORGANIZE_EVENT))}
                              >
                                <PanelLeft className="mr-2 h-4 w-4" />
                                Reorder sidebar
                              </Button>
                            </div>
                          )}
                        </CardContent>
                      </Card>
                    </section>
                  )}

                  {activeSection === 'general' && (
                    <section id="workspace-general" className="min-w-0 space-y-4" aria-labelledby="settings-section-title">
                      <SectionHeading title="General" />
                      <Card className="min-w-0 max-w-full overflow-hidden border-border/70 shadow-sm">
                        <CardContent className="p-5 sm:p-6">
                          <div className="min-w-0 max-w-xl space-y-2">
                            <div className="flex items-center justify-between gap-2">
                              <Label htmlFor="workspace-name">Workspace name</Label>
                              <FieldSaveStatus status={workspaceName.status} />
                            </div>
                            <Input
                              id="workspace-name"
                              {...notACredentialField}
                              maxLength={120}
                              className="h-11"
                              value={workspaceName.value}
                              disabled={!canManageWorkspaceName}
                              onChange={(event) => workspaceName.setValue(event.target.value)}
                              onBlur={workspaceName.onBlur}
                              aria-invalid={workspaceName.error ? true : undefined}
                              aria-describedby={workspaceName.error ? 'workspace-name-error' : 'workspace-name-help'}
                            />
                            <FieldSaveError id="workspace-name-error" error={workspaceName.error} />
                            <p id="workspace-name-help" className="flex items-center gap-1 text-xs text-muted-foreground">
                              Only your team sees this.
                              <InfoTip topic="the workspace name">
                                It names the workspace in the sidebar and the workspace switcher. Clients see the agency name under Client branding instead.
                              </InfoTip>
                            </p>
                            {!canManageWorkspaceName ? (
                              <p className="text-sm text-muted-foreground">Workspace name controls are not available for your role.</p>
                            ) : null}
                          </div>
                        </CardContent>
                      </Card>

                      {/* Only the owner of a real tenant workspace. Kept out of
                          the menu: it is rare, and it should not sit one
                          click away beside everyday settings. */}
                      {canCloseWorkspace && workspace && (
                        <div id="danger-zone" className="min-w-0 space-y-3 rounded-xl border border-destructive/30 bg-destructive/5 p-5 sm:p-6">
                          <div>
                            <h3 className="font-semibold">Danger zone</h3>
                            <p className="mt-1 text-sm text-muted-foreground">Nothing here can be undone from inside the app.</p>
                          </div>
                          <WorkspaceDeletionCard workspaceId={workspace.id} workspaceName={workspace.name} />
                        </div>
                      )}
                    </section>
                  )}

                  {activeSection === 'branding' && (
                    <section id="client-branding" className="min-w-0 space-y-4" aria-labelledby="settings-section-title">
                      <SectionHeading title="Client branding" description="What your clients see on their dashboards, onboarding and emails." />
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
                  )}

                  {activeSection === 'integrations' && (
                    <section id="ai-keys" className="min-w-0 space-y-4" aria-labelledby="settings-section-title">
                      <SectionHeading title="Integrations" />
                      {/* The same connection Client Campaigns shows, in its
                          compact form. */}
                      <OutreachConnectionCard
                        workspaceId={workspaceId}
                        variant="compact"
                        linkCampaignsHref={`${baseHref}/client-campaigns?assign=1`}
                      />
                      {canManageAiKeys && <WorkspaceAiKeysCard workspaceId={workspaceId} />}
                      {canManageAiKeys && <WorkspaceAiModelsCard workspaceId={workspaceId} />}
                    </section>
                  )}

                  {activeSection === 'team' && (
                    <section id="workspace-access" className="min-w-0 space-y-4" aria-labelledby="settings-section-title">
                      <div className="flex flex-wrap items-end justify-between gap-3">
                        <SectionHeading
                          title="Team & access"
                          description={`${plural(activeCount, 'person', 'people')} can sign in to this workspace${pendingCount > 0 ? ` · ${plural(pendingCount, 'invite')} pending` : ''}`}
                        />
                        {!platformRoster && (
                          <Button
                            className="min-h-11"
                            disabled={!canInvite}
                            onClick={() => {
                              setInvite({ ...emptyInvite, role: allowedInviteRoles[0] || 'member' })
                              setInviteMethod('email_invite')
                              setInviteOpen(true)
                            }}
                          >
                            <UserPlus className="mr-2 h-4 w-4" />Invite teammate
                          </Button>
                        )}
                      </div>

                      <Card className="min-w-0 max-w-full overflow-hidden border-border/70 shadow-sm">
                        <CardContent className="min-w-0 p-0">
                          <ul className="divide-y divide-border/70" aria-label="Team members">
                            {staff.map((member) => {
                              const state = memberState(member)
                              return (
                                <li key={member.id} className="flex flex-wrap items-center gap-x-4 gap-y-3 p-4">
                                  <div className="flex min-w-0 flex-1 basis-60 items-center gap-3">
                                    <Avatar className="h-10 w-10">
                                      <AvatarFallback>{(member.full_name || member.email || '?').charAt(0).toUpperCase()}</AvatarFallback>
                                    </Avatar>
                                    <div className="min-w-0">
                                      <p className="truncate font-medium">{member.full_name || 'Invited user'}</p>
                                      <p className="truncate text-sm text-muted-foreground">{member.email}</p>
                                    </div>
                                  </div>
                                  <p className="text-sm text-muted-foreground">{memberJoined(member)}</p>
                                  {state.label !== 'Active' && <div>{memberStatus(member)}</div>}
                                  <div className="flex flex-wrap items-center gap-2">
                                    {memberRole(member)}
                                    {memberActions(member)}
                                  </div>
                                </li>
                              )
                            })}
                          </ul>
                        </CardContent>
                      </Card>

                      {platformRoster ? (
                        <Link to="/app/manage-workspaces?tab=team" className="inline-flex min-h-11 items-center gap-1 text-sm font-medium text-primary underline-offset-4 hover:underline">
                          Manage the platform team in Manage workspaces<ArrowRight className="h-4 w-4" aria-hidden="true" />
                        </Link>
                      ) : (
                        <p className="flex items-center gap-1 text-sm text-muted-foreground">
                          Owners and admins manage the workspace; members work on clients.
                          <InfoTip topic="what each role can do">
                            <RolesCaption roles={['admin', 'member', 'owner']} className="text-popover-foreground [&_span]:text-popover-foreground" />
                            <span className="mt-2 block">Client portal users are separate, and are managed inside each client.</span>
                          </InfoTip>
                        </p>
                      )}
                    </section>
                  )}

                  {activeSection === 'billing' && (
                    <section id="billing" className="min-w-0 space-y-4" aria-labelledby="settings-section-title">
                      <SectionHeading title="Billing" />
                      <SettingsBillingSection workspaceId={workspaceId} billingHref={`${baseHref}/settings/billing`} />
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
