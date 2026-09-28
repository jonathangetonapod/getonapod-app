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
  ImageIcon,
  KeyRound,
  Loader2,
  MoreHorizontal,
  Palette,
  PanelLeft,
  Send,
  ShieldCheck,
  Save,
  Trash2,
  Upload,
  UserPlus,
  Users,
} from 'lucide-react'
import { Link } from 'react-router-dom'
import { toast } from 'sonner'
import { bookingLinkFromPaste, schedulerName } from '@/lib/schedulerEmbed'
import {
  WORKSPACE_NAV_ORGANIZE_EVENT,
  WorkspaceBrandLogo,
  WorkspaceLayout,
} from '@/components/workspace/WorkspaceLayout'
import { WorkspaceDeletionCard } from '@/components/workspace/WorkspaceDeletionCard'
import { WorkspaceAiKeysCard } from '@/components/workspace/WorkspaceAiKeysCard'
import { useSetupProgress } from '@/components/workspace/SetupChecklist'
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
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { cn } from '@/lib/utils'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import {
  MEMBER_AVATAR_MIME_TYPES,
  memberAvatarUrl,
  WORKSPACE_LOGO_MIME_TYPES,
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
  removeWorkspaceLogo,
  updateWorkspaceLogo,
  uploadMemberAvatar,
  updateWorkspaceBookingLink,
  updateWorkspaceClientBranding,
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

const defaultClientBrand = {
  client_brand_name: '',
  client_brand_primary_color: '#0D1B2A',
  client_brand_accent_color: '#C7794F',
  client_contact_email: '',
}

function readableColor(background: string): string {
  const color = /^#[0-9A-F]{6}$/iu.test(background) ? background.slice(1) : '0D1B2A'
  const channels = [0, 2, 4].map((offset) => Number.parseInt(color.slice(offset, offset + 2), 16) / 255)
  const luminance = channels
    .map((channel) => channel <= 0.03928 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4)
    .reduce((total, channel, index) => total + channel * [0.2126, 0.7152, 0.0722][index], 0)
  return luminance > 0.42 ? '#102033' : '#FFFFFF'
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

/*
 * What each role can and cannot do, in the words the select and its caption
 * both use. Lower-case openings so they read after "Admin:"; the select item
 * capitalises its own copy.
 */
const roleDescriptions: Record<WorkspaceStaffRole, string> = {
  admin: 'manages clients, campaigns, onboarding and the team. Cannot change the owner or other admins, and cannot close the workspace.',
  member: 'works on clients, campaigns and the inbox. Cannot see Settings, Billing or the team list.',
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
  const [logoRemoveOpen, setLogoRemoveOpen] = useState(false)
  const [workspaceNameDraft, setWorkspaceNameDraft] = useState('')
  const [clientBrandDraft, setClientBrandDraft] = useState(defaultClientBrand)
  const [confirmation, setConfirmation] = useState<Confirmation | null>(null)
  const logoInputRef = useRef<HTMLInputElement>(null)
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

  /*
   * Seed each edit form from the server, but ONLY when that field's own
   * server value changes — not on every refetch. The staff query is
   * invalidated by unrelated mutations (suspend a teammate, issue a
   * password) and refetches on window focus, and a blanket reset keyed on
   * `data` silently reverted a half-typed name, booking link, or brand the
   * moment any of those fired. Comparing against the last-seen server value
   * re-seeds after a genuine remote change (including one this user just
   * saved) while leaving an in-progress edit untouched.
   */
  const lastServerNameRef = useRef<string | null>(null)
  const lastServerBookingRef = useRef<string | null>(null)
  const lastServerBrandRef = useRef<string | null>(null)
  useEffect(() => {
    if (!data) return
    const serverName = data.workspace.name
    if (lastServerNameRef.current !== serverName) {
      lastServerNameRef.current = serverName
      setWorkspaceNameDraft(serverName)
    }
    const serverBooking = data.workspace.booking_embed_url ?? ''
    if (lastServerBookingRef.current !== serverBooking) {
      lastServerBookingRef.current = serverBooking
      setBookingLinkDraft(serverBooking)
    }
    const serverBrand = JSON.stringify([
      data.workspace.client_brand_name,
      data.workspace.client_brand_primary_color,
      data.workspace.client_brand_accent_color,
      data.workspace.client_contact_email,
    ])
    if (lastServerBrandRef.current !== serverBrand) {
      lastServerBrandRef.current = serverBrand
      setClientBrandDraft({
        client_brand_name: data.workspace.client_brand_name,
        client_brand_primary_color: data.workspace.client_brand_primary_color,
        client_brand_accent_color: data.workspace.client_brand_accent_color,
        client_contact_email: data.workspace.client_contact_email ?? '',
      })
    }
  }, [data])

  const workspaceNameDirty = Boolean(data) && workspaceNameDraft !== data?.workspace.name

  const clientBrandDirty = Boolean(data) && (
    clientBrandDraft.client_brand_name !== data?.workspace.client_brand_name
    || clientBrandDraft.client_brand_primary_color.toUpperCase() !== data?.workspace.client_brand_primary_color
    || clientBrandDraft.client_brand_accent_color.toUpperCase() !== data?.workspace.client_brand_accent_color
    || clientBrandDraft.client_contact_email.trim() !== (data?.workspace.client_contact_email ?? '')
  )

  const [bookingLinkDraft, setBookingLinkDraft] = useState('')
  // Copying "embed code" from a scheduler gives a block of script, not a URL,
  // so the link is taken out of whatever was pasted rather than refused.
  const bookingLinkResolved = bookingLinkFromPaste(bookingLinkDraft)
  const bookingLinkChanged = (bookingLinkResolved ?? bookingLinkDraft.trim())
    !== (data?.workspace.booking_embed_url ?? '')
  const bookingLinkPreviewName = schedulerName(bookingLinkResolved)

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

  const logoMutation = useMutation({
    mutationFn: (file: File) => {
      if (!data || !canManageBranding) {
        throw new Error('You do not have permission to update workspace branding.')
      }
      return updateWorkspaceLogo(workspaceId, file, data.workspace.logo_path)
    },
    onSuccess: async () => {
      await refreshShellIdentity()
      toast.success('Workspace logo updated.')
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : 'The workspace logo could not be uploaded.'),
  })

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
      await refreshOwnMembership()
      toast.success('Profile picture removed.')
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : 'The profile picture could not be removed.'),
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
      await refreshShellIdentity()
      toast.success('Workspace logo removed.')
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : 'The workspace logo could not be removed.'),
  })

  const bookingLinkMutation = useMutation({
    mutationFn: (nextUrl: string | null) => updateWorkspaceBookingLink(workspaceId, nextUrl),
    onSuccess: async (_result, nextUrl) => {
      await refreshSettings()
      toast.success(nextUrl ? 'Booking link saved.' : 'Booking link removed.')
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : 'The booking link could not be saved.'),
  })

  const clientBrandMutation = useMutation({
    mutationFn: () => {
      if (!data?.workspace.client_brand_updated_at || !canManageClientBranding) {
        throw new Error('Client-facing branding controls are not available yet.')
      }
      return updateWorkspaceClientBranding(workspaceId, {
        ...clientBrandDraft,
        expected_brand_updated_at: data.workspace.client_brand_updated_at,
      })
    },
    onSuccess: async () => {
      await refreshSettings()
      toast.success('Client-facing brand updated.')
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : 'Client-facing branding could not be updated.'),
  })

  const workspaceNameMutation = useMutation({
    mutationFn: () => {
      if (!data?.workspace.updated_at || !canManageWorkspaceName) {
        throw new Error('Workspace name controls are not available yet.')
      }
      return updateWorkspaceName(workspaceId, {
        name: workspaceNameDraft,
        expected_updated_at: data.workspace.updated_at,
      })
    },
    onSuccess: async () => {
      await refreshShellIdentity()
      toast.success('Workspace name updated.')
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : 'Workspace name could not be updated.'),
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


  const settingsNavigation = [
    { href: '#workspace-general', label: 'General', description: 'Workspace identity', icon: Building2 },
    ...(canOrganizeSidebar
      ? [{ href: '#sidebar-navigation', label: 'Sidebar', description: 'Your page order', icon: PanelLeft }]
      : []),
    { href: '#client-branding', label: 'Client branding', description: 'Logo, name, and colors', icon: Palette },
    ...(canManageAiKeys
      ? [{ href: '#ai-keys', label: 'AI keys', description: 'Bring your own provider keys', icon: KeyRound }]
      : []),
    { href: '#workspace-access', label: 'Team & access', description: 'Users, roles, and passwords', icon: Users },
    // No platform-only entry here. Viewing a workspace shows what its own
    // people see, and a tenant has never had a manual-grant screen — that is
    // platform work and lives at /app/platform/billing, against any workspace.
    ...(!isPlatformWorkspace
      ? [{ href: '/app/settings/billing', label: 'Billing', description: 'Plan and credits', icon: CreditCard }]
      : []),
    ...(canCloseWorkspace
      ? [{ href: '#danger-zone', label: 'Danger zone', description: 'Close the workspace', icon: AlertTriangle }]
      : []),
  ]

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
                <div className="min-w-0 space-y-3">
                  <Badge variant="secondary" className="max-w-full gap-1.5 rounded-full px-3 py-1 font-medium">
                    <Building2 className="h-3.5 w-3.5" />
                    <span className="truncate">{data.workspace.name}</span>
                  </Badge>
                  <div>
                    <h1 className="text-3xl font-bold tracking-tight sm:text-4xl">Settings</h1>
                    <p className="mt-1.5 max-w-2xl text-muted-foreground">
                      Manage your workspace identity, client experience, and team access.
                    </p>
                  </div>
                </div>
                <Link
                  to={`${baseHref}/clients`}
                  className="inline-flex w-fit items-center gap-2 rounded-full border border-border/70 px-3 py-1.5 text-xs font-medium hover:bg-muted/60"
                >
                  <span className={cn('h-2 w-2 rounded-full', setupProgress.complete ? 'bg-emerald-500' : 'bg-amber-500')} />
                  Setup: {setupProgress.requiredDone} of {setupProgress.requiredTotal} required steps done
                </Link>
              </header>

              <div className="grid min-w-0 items-start gap-8 lg:grid-cols-[13rem_minmax(0,1fr)] xl:grid-cols-[15rem_minmax(0,1fr)]">
                <aside className="min-w-0 lg:sticky lg:top-28">
                  <p className="mb-2 hidden px-3 text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground lg:block">
                    Workspace settings
                  </p>
                  <nav
                    aria-label="Settings sections"
                    className={cn(
                      'grid gap-2 lg:grid-cols-1 lg:gap-1',
                      'grid-cols-2 sm:grid-cols-4',
                    )}
                  >
                    {settingsNavigation.map((item) => {
                      const Icon = item.icon
                      const content = (
                        <>
                          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground transition group-hover:bg-background group-hover:text-foreground">
                            <Icon className="h-4 w-4" />
                          </span>
                          <span className="min-w-0">
                            <span className="block truncate text-xs font-semibold sm:text-sm">{item.label}</span>
                            <span className="mt-0.5 hidden truncate text-xs text-muted-foreground lg:block">{item.description}</span>
                          </span>
                        </>
                      )
                      const className = 'group flex min-w-0 items-center gap-2.5 rounded-xl border border-border/70 bg-card px-3 py-3 text-left transition hover:border-primary/25 hover:bg-muted/60 lg:border-transparent lg:bg-transparent'
                      return item.href.startsWith('#')
                        ? <a key={item.href} href={item.href} className={className}>{content}</a>
                        : <Link key={item.href} to={item.href} className={className}>{content}</Link>
                    })}
                  </nav>
                  <div className="mt-5 hidden rounded-xl border border-border/70 bg-muted/25 p-3 text-xs leading-5 text-muted-foreground lg:block">
                    Public brand changes appear on shared client dashboards and onboarding pages.
                  </div>
                </aside>

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
                  <section id="your-profile" className="min-w-0 scroll-mt-28 space-y-4" aria-labelledby="your-profile-title">
                    <div>
                      <p className="text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">You</p>
                      <h2 id="your-profile-title" className="mt-1 text-2xl font-semibold tracking-tight">Profile picture</h2>
                      <p className="mt-1 text-sm text-muted-foreground">Shown beside your name at the foot of the sidebar.</p>
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
                                onClick={() => removeAvatarMutation.mutate()}
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

                  <section id="workspace-general" className="min-w-0 scroll-mt-28 space-y-4" aria-labelledby="workspace-general-title">
                    <div>
                      <p className="text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">Workspace</p>
                      <h2 id="workspace-general-title" className="mt-1 text-2xl font-semibold tracking-tight">General</h2>
                      <p className="mt-1 text-sm text-muted-foreground">The private identity your team sees inside the app.</p>
                    </div>

                    <Card className="min-w-0 max-w-full overflow-hidden border-border/70 shadow-sm">
                      <CardContent className="p-0">
                        <div className="grid min-w-0 gap-5 p-6 sm:p-7 md:grid-cols-[minmax(0,14rem)_minmax(0,1fr)]">
                          <div>
                            <p className="font-semibold">Workspace name</p>
                            <p className="mt-1 text-sm leading-6 text-muted-foreground">
                              Used in your workspace selector and throughout the private app.
                            </p>
                          </div>
                          <div className="min-w-0 max-w-xl space-y-3">
                            <Label htmlFor="workspace-name">Workspace name</Label>
                            <Input
                              id="workspace-name"
                              maxLength={120}
                              value={workspaceNameDraft}
                              disabled={!canManageWorkspaceName || workspaceNameMutation.isPending}
                              onChange={(event) => setWorkspaceNameDraft(event.target.value)}
                            />
                            <p className="text-xs text-muted-foreground">Only your team sees this — it names the workspace in the sidebar and in the workspace switcher. Clients never see it unless you type the same name into the client-facing brand below.</p>
                            <div className="flex flex-wrap gap-2 pt-1">
                              <Button
                                type="button"
                                size="sm"
                                disabled={!canManageWorkspaceName || !workspaceNameDirty || workspaceNameMutation.isPending}
                                onClick={() => workspaceNameMutation.mutate()}
                              >
                                {workspaceNameMutation.isPending
                                  ? <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                  : <Save className="mr-2 h-4 w-4" />}
                                Save workspace name
                              </Button>
                              {workspaceNameDirty ? (
                                <Button
                                  type="button"
                                  size="sm"
                                  variant="ghost"
                                  disabled={workspaceNameMutation.isPending}
                                  onClick={() => setWorkspaceNameDraft(data.workspace.name)}
                                >
                                  Reset
                                </Button>
                              ) : null}
                            </div>
                            {!canManageWorkspaceName ? (
                              <p className="text-sm text-muted-foreground">Workspace name controls are not available for your role.</p>
                            ) : null}
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  </section>

                  {canOrganizeSidebar && (
                    <section id="sidebar-navigation" className="min-w-0 scroll-mt-28 space-y-4" aria-labelledby="sidebar-navigation-title">
                      <div>
                        <p className="text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">Personalization</p>
                        <h2 id="sidebar-navigation-title" className="mt-1 text-2xl font-semibold tracking-tight">Sidebar navigation</h2>
                        <p className="mt-1 text-sm text-muted-foreground">Put the pages you use most exactly where you want them.</p>
                      </div>

                      <Card className="min-w-0 max-w-full overflow-hidden border-border/70 shadow-sm">
                        <CardContent className="flex min-w-0 flex-col gap-5 p-6 sm:flex-row sm:items-center sm:justify-between sm:p-7">
                          <div className="flex min-w-0 items-start gap-4">
                            <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-muted text-muted-foreground">
                              <PanelLeft className="h-5 w-5" />
                            </span>
                            <div className="min-w-0">
                              <div className="flex flex-wrap items-center gap-2">
                                <p className="font-semibold">Choose your page order</p>
                                <Badge variant="secondary" className="rounded-full text-[10px]">Owner preference</Badge>
                              </div>
                              <p className="mt-1 max-w-2xl text-sm leading-6 text-muted-foreground">
                                Drag pages into the order that works for you. The order is yours rather than the workspace's — it is kept against your own account and workspace on this browser, so it follows you into any workspace you open.
                              </p>
                            </div>
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

                  <section id="client-branding" className="min-w-0 scroll-mt-28 space-y-4" aria-labelledby="client-branding-title">
                    <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
                      <div>
                        <p className="text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">White label</p>
                        <h2 id="client-branding-title" className="mt-1 text-2xl font-semibold tracking-tight">Client-facing brand</h2>
                        <p className="mt-1 text-sm text-muted-foreground">Control the identity clients see on dashboards and onboarding.</p>
                      </div>
                      <Badge variant="outline" className="w-fit rounded-full">Client visible</Badge>
                    </div>

                    <Card className="min-w-0 max-w-full overflow-hidden border-border/70 shadow-sm">
                      <CardContent className="min-w-0 p-0">
                        <div className="grid min-w-0 xl:grid-cols-[minmax(0,1fr)_minmax(20rem,0.88fr)]">
                          <div className="min-w-0 space-y-6 p-6 sm:p-7">
                            <div className="space-y-2">
                              <Label htmlFor="client-brand-name">Agency name shown to clients</Label>
                              <Input
                                id="client-brand-name"
                                maxLength={120}
                                value={clientBrandDraft.client_brand_name}
                                disabled={!canManageClientBranding || clientBrandMutation.isPending}
                                onChange={(event) => setClientBrandDraft((current) => ({
                                  ...current,
                                  client_brand_name: event.target.value,
                                }))}
                                placeholder={data.workspace.name}
                              />
                              <p className="text-xs text-muted-foreground">The name your clients recognize, shown on their dashboards, onboarding and portal. Leave it empty and they see the workspace name instead.</p>
                            </div>

                            <div className="space-y-2">
                              <Label htmlFor="client-contact-email">Email clients reply to</Label>
                              <Input
                                id="client-contact-email"
                                type="email"
                                maxLength={254}
                                value={clientBrandDraft.client_contact_email}
                                disabled={!canManageClientBranding || clientBrandMutation.isPending}
                                onChange={(event) => setClientBrandDraft((current) => ({
                                  ...current,
                                  client_contact_email: event.target.value,
                                }))}
                                placeholder="hello@youragency.com"
                              />
                              <p className="text-xs text-muted-foreground">Set as the reply-to on shortlist and booking emails, so a client who replies reaches you. Leave it empty and replies go nowhere.</p>
                            </div>

                            <div className="space-y-2">
                              <Label htmlFor="workspace-booking-link">Booking link or embed code</Label>
                              <div className="flex flex-col gap-2">
                                {/* A textarea because "embed code" is a block
                                    of script, and that is what a scheduler
                                    puts on the clipboard. */}
                                <Textarea
                                  id="workspace-booking-link"
                                  rows={2}
                                  maxLength={6_000}
                                  value={bookingLinkDraft}
                                  disabled={!canManageClientBranding || bookingLinkMutation.isPending}
                                  onChange={(event) => setBookingLinkDraft(event.target.value)}
                                  placeholder="https://calendly.com/your-agency/intro — or paste the whole embed snippet"
                                  className="font-mono text-xs"
                                />
                                <Button
                                  type="button"
                                  variant="outline"
                                  className="w-fit"
                                  disabled={!canManageClientBranding
                                    || bookingLinkMutation.isPending
                                    || !bookingLinkChanged
                                    || (Boolean(bookingLinkDraft.trim()) && !bookingLinkResolved)}
                                  onClick={() => bookingLinkMutation.mutate(bookingLinkResolved)}
                                >
                                  {bookingLinkMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                                  Save link
                                </Button>
                              </div>
                              {/* Two lines rather than one paragraph: what to
                                  do never changes, and what will happen
                                  changes with every keystroke. Reading the
                                  second used to mean re-reading the first. */}
                              <p className="text-xs leading-5 text-muted-foreground">
                                Paste the scheduler link, or the whole embed code it gives you — either works.
                              </p>
                              <p className="text-xs leading-5 text-muted-foreground">
                                Prospect dashboards without a call-to-action of their own show it under
                                &ldquo;Ready to turn your shortlist into conversations?&rdquo;, instead of asking the
                                prospect to reply to an email. Saved on its own with Save link.
                              </p>
                              {bookingLinkDraft.trim() ? (
                                <p className={`text-xs leading-5 ${bookingLinkResolved ? 'text-muted-foreground' : 'text-destructive'}`}>
                                  {!bookingLinkResolved
                                    ? 'No booking link found in that. Paste the scheduler address, or the embed code it gives you.'
                                    : bookingLinkPreviewName
                                      ? `Saving ${bookingLinkResolved} — ${bookingLinkPreviewName} loads on the page itself.`
                                      : `Saving ${bookingLinkResolved} — this one opens in a new tab. Calendly, Cal.com, SavvyCal, TidyCal, HubSpot, and Zcal load on the page itself.`}
                                </p>
                              ) : null}
                            </div>

                            <div className="space-y-2">
                              {/* Named for what they do, not where they sit in
                                  a palette: "primary" and "accent" mean
                                  nothing until you know which one moves. */}
                              <p className="text-xs leading-5 text-muted-foreground">
                                Primary is the solid colour behind headers and buttons on a client&rsquo;s pages. Accent
                                marks the active item — the current tab, a selected row. The live preview on the right
                                updates as you change them.
                              </p>
                            <div className="grid gap-4 sm:grid-cols-2">
                              {[
                                { key: 'client_brand_primary_color' as const, label: 'Primary color' },
                                { key: 'client_brand_accent_color' as const, label: 'Accent color' },
                              ].map((field) => {
                                const value = clientBrandDraft[field.key]
                                const pickerValue = /^#[0-9A-F]{6}$/iu.test(value) ? value : '#0D1B2A'
                                return (
                                  <div key={field.key} className="min-w-0 space-y-2">
                                    <Label htmlFor={field.key}>{field.label}</Label>
                                    <div className="flex min-w-0 gap-2">
                                      <Input
                                        aria-label={`${field.label} picker`}
                                        type="color"
                                        value={pickerValue}
                                        disabled={!canManageClientBranding || clientBrandMutation.isPending}
                                        onChange={(event) => setClientBrandDraft((current) => ({
                                          ...current,
                                          [field.key]: event.target.value.toUpperCase(),
                                        }))}
                                        className="h-10 w-12 shrink-0 cursor-pointer p-1"
                                      />
                                      <Input
                                        id={field.key}
                                        value={value}
                                        maxLength={7}
                                        spellCheck={false}
                                        disabled={!canManageClientBranding || clientBrandMutation.isPending}
                                        onChange={(event) => setClientBrandDraft((current) => ({
                                          ...current,
                                          [field.key]: event.target.value.toUpperCase(),
                                        }))}
                                        className="min-w-0 flex-1 font-mono uppercase"
                                      />
                                    </div>
                                  </div>
                                )
                              })}
                            </div>
                            </div>

                            <div className="border-t border-border/70 pt-6">
                              <div className="mb-4 flex items-start gap-3">
                                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground">
                                  <ImageIcon className="h-4 w-4" />
                                </span>
                                <div>
                                  <p className="font-semibold">Agency logo</p>
                                  <p className="mt-0.5 text-sm text-muted-foreground">PNG, JPEG, or WebP up to 2 MB.</p>
                                </div>
                              </div>
                              <div className="grid gap-4 rounded-xl border border-border/70 bg-muted/20 p-4 sm:grid-cols-[auto_minmax(0,1fr)] sm:items-center">
                                <WorkspaceBrandLogo
                                  logoUrl={logoUrl}
                                  workspaceName={data.workspace.name}
                                  workspaceInitials={workspaceInitials}
                                  placement="settings"
                                />
                                <div className="min-w-0 space-y-3">
                                  <p className="text-sm leading-6 text-muted-foreground">
                                    Shown without a colored backdrop so the original artwork stays intact.
                                  </p>
                                  {/* A native input, not the styled one. Input's
                                      base classes carry h-10 w-full, and cn's
                                      tailwind-merge does not know sr-only
                                      conflicts with a width — so both survived
                                      and the field kept sr-only's absolute
                                      positioning at a full 774px, anchored to
                                      the initial containing block because no
                                      ancestor is positioned. It stretched the
                                      document 260px past the viewport. */}
                                  <input
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
                                      size="sm"
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
                                        size="sm"
                                        variant="ghost"
                                        className="text-destructive hover:text-destructive"
                                        disabled={!canManageBranding || logoMutation.isPending || removeLogoMutation.isPending}
                                        onClick={() => setLogoRemoveOpen(true)}
                                      >
                                        <Trash2 className="mr-2 h-4 w-4" />Remove logo
                                      </Button>
                                    )}
                                  </div>
                                  {!canManageBranding && (
                                    <p className="text-sm text-muted-foreground">Logo controls are not available for your role.</p>
                                  )}
                                </div>
                              </div>
                            </div>

                            {!canManageClientBranding ? (
                              <p className="text-sm text-muted-foreground">Client-facing brand controls are not available for your role.</p>
                            ) : null}
                          </div>

                          <div className="min-w-0 border-t border-border/70 bg-muted/25 p-4 sm:p-6 xl:border-l xl:border-t-0">
                            <div className="mb-3 flex items-center justify-between gap-3">
                              <p className="text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">Live preview</p>
                              <Badge variant="secondary" className="rounded-full text-[10px]">Shared dashboard</Badge>
                            </div>
                            <div
                              className="relative min-h-80 overflow-hidden rounded-2xl border border-white/10 p-6 shadow-sm"
                              style={{
                                background: `linear-gradient(135deg, ${clientBrandDraft.client_brand_primary_color} 0%, #102033 140%)`,
                                color: readableColor(clientBrandDraft.client_brand_primary_color),
                              }}
                              aria-label="Client dashboard brand preview"
                            >
                              <div className="absolute -right-12 -top-12 h-40 w-40 rounded-full bg-white/10 blur-2xl" />
                              <div className="relative flex items-center gap-3">
                                {logoUrl ? (
                                  <span className="flex h-12 w-20 items-center justify-center p-1">
                                    <img src={logoUrl} alt="" className="max-h-full max-w-full object-contain" />
                                  </span>
                                ) : (
                                  <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-white/10 text-sm font-bold ring-1 ring-white/20">
                                    {workspaceInitials}
                                  </span>
                                )}
                                <div>
                                  <p className="font-semibold">{clientBrandDraft.client_brand_name || data.workspace.name}</p>
                                  <p className="mt-0.5 text-xs opacity-65">Private podcast campaign</p>
                                </div>
                              </div>
                              <div className="relative mt-12 max-w-sm">
                                <p className="text-xs font-bold uppercase tracking-[0.18em] opacity-70">Prepared for your client</p>
                                <p className="mt-3 text-3xl font-semibold leading-tight">The right rooms for their next big ideas.</p>
                                <span
                                  className="mt-6 inline-flex rounded-full px-4 py-2 text-sm font-semibold shadow-sm"
                                  style={{
                                    backgroundColor: clientBrandDraft.client_brand_accent_color,
                                    color: readableColor(clientBrandDraft.client_brand_accent_color),
                                  }}
                                >
                                  Review top matches
                                </span>
                              </div>
                            </div>
                          </div>
                        </div>

                        <div className="flex flex-col gap-3 border-t border-border/70 bg-muted/15 px-6 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-7">
                          <p className="text-xs text-muted-foreground">Brand changes apply to every client dashboard in this workspace.</p>
                          <div className="flex flex-wrap gap-2">
                            {clientBrandDirty ? (
                              <Button
                                type="button"
                                size="sm"
                                variant="ghost"
                                disabled={clientBrandMutation.isPending}
                                onClick={() => setClientBrandDraft({
                                  client_brand_name: data.workspace.client_brand_name,
                                  client_brand_primary_color: data.workspace.client_brand_primary_color,
                                  client_brand_accent_color: data.workspace.client_brand_accent_color,
                                  client_contact_email: data.workspace.client_contact_email ?? '',
                                })}
                              >
                                Reset
                              </Button>
                            ) : null}
                            <Button
                              type="button"
                              size="sm"
                              disabled={!canManageClientBranding || !clientBrandDirty || clientBrandMutation.isPending}
                              onClick={() => clientBrandMutation.mutate()}
                            >
                              {clientBrandMutation.isPending
                                ? <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                : <Save className="mr-2 h-4 w-4" />}
                              Save client brand
                            </Button>
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  </section>

                  <section id="ai-keys" className="min-w-0 scroll-mt-28 space-y-4" aria-labelledby="ai-keys-title">
                    <div>
                      <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Integrations</p>
                      <h2 id="ai-keys-title" className="mt-1 text-2xl font-semibold tracking-tight">
                        {canManageAiKeys ? 'AI API keys' : 'Integrations'}
                      </h2>
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

                  <section id="workspace-access" className="min-w-0 scroll-mt-28 space-y-4" aria-labelledby="workspace-access-title">
                    <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
                      <div>
                        <p className="text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">Access</p>
                        <h2 id="workspace-access-title" className="mt-1 text-2xl font-semibold tracking-tight">Team</h2>
                        <p className="mt-1 text-sm text-muted-foreground">
                          Manage the people who can access your workspace.
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
                          <UserPlus className="mr-2 h-4 w-4" />Invite
                        </Button>
                      )}
                    </div>

                    <div className="grid grid-cols-3 divide-x overflow-hidden rounded-xl border border-border/70 bg-card shadow-sm">
                      <div className="px-3 py-4 sm:px-5">
                        <p className="text-xs text-muted-foreground">Total users</p>
                        <p className="mt-1 text-2xl font-semibold tracking-tight">{staff.length}</p>
                      </div>
                      <div className="px-3 py-4 sm:px-5">
                        <p className="text-xs text-muted-foreground">Active</p>
                        <p className="mt-1 text-2xl font-semibold tracking-tight">{staff.filter((member) => member.status === 'active').length}</p>
                      </div>
                      <div className="px-3 py-4 sm:px-5">
                        <p className="text-xs text-muted-foreground">Pending access</p>
                        <p className="mt-1 text-2xl font-semibold tracking-tight">{staff.filter((member) => member.status === 'invited' || member.status === 'provisioning').length}</p>
                      </div>
                    </div>

                    <Card className="min-w-0 max-w-full overflow-hidden border-border/70 shadow-sm">
                      <CardHeader className="border-b border-border/70 bg-muted/15">
                        <CardTitle className="flex items-center gap-2 text-lg"><Users className="h-5 w-5" />Agency team</CardTitle>
                        <CardDescription>
                          {platformRoster
                            ? <>These are platform operator accounts, listed here for reference. They are managed by the platform allowlist rather than invited into a workspace — open <Link to="/app/manage-workspaces" className="font-medium underline underline-offset-2">Manage workspaces</Link> to create a workspace or change a tenant owner's access.</>
                            : 'Team members are separate from client portal users, which are managed inside each client.'}
                        </CardDescription>
                        {!platformRoster && <RolesCaption roles={['admin', 'member', 'owner']} className="pt-2" />}
                      </CardHeader>
                      <CardContent className="min-w-0 p-0">
                        <div className="max-w-full overflow-hidden">
                    <Table className="min-w-[52rem]">
                      <TableHeader className="bg-muted/30"><TableRow><TableHead>User</TableHead><TableHead>Role</TableHead><TableHead>Status</TableHead><TableHead>Joined / added</TableHead><TableHead className="text-right">Actions</TableHead></TableRow></TableHeader>
                      <TableBody>
                        {staff.map((member) => {
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
                                <Badge variant={state.tone}>{state.label}</Badge>
                                {state.detail && (
                                  <p className={cn('mt-1 max-w-48 text-xs', state.expired ? 'font-medium text-destructive' : 'text-muted-foreground')}>
                                    {state.detail}
                                  </p>
                                )}
                                {member.pending_review && <p className="mt-1 max-w-44 text-xs text-destructive">Provider reconciliation requires review.</p>}
                              </TableCell>
                              <TableCell>{formatDate(member.accepted_at || member.invited_at)}</TableCell>
                              <TableCell className="text-right">
                                {member.role === 'owner' && !manageable ? <span className="text-sm text-muted-foreground">Owner</span> : manageable ? (
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
                                                <DropdownMenuItem onSelect={() => actionMutation.mutate({ action: 'retry_invite', member })}>Retry invite</DropdownMenuItem>
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
                                ) : null}
                              </TableCell>
                            </TableRow>
                          )
                        })}
                      </TableBody>
                    </Table>
                        </div>
                      </CardContent>
                    </Card>
                  </section>

                  {canCloseWorkspace && workspace && (
                    <section
                      id="danger-zone"
                      className="min-w-0 scroll-mt-28 space-y-4 rounded-2xl border border-destructive/30 bg-destructive/5 p-5 sm:p-6"
                      aria-labelledby="danger-zone-title"
                    >
                      <div>
                        <p className="text-xs font-semibold uppercase tracking-[0.14em] text-destructive">Irreversible</p>
                        <h2 id="danger-zone-title" className="mt-1 text-2xl font-semibold tracking-tight">Danger zone</h2>
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
            <div className="space-y-2"><Label htmlFor="staff-name">Full name</Label><Input id="staff-name" value={invite.full_name || ''} maxLength={120} disabled={inviteBusy} onChange={(event) => setInvite((current) => ({ ...current, full_name: event.target.value }))} /></div>
            <div className="space-y-2"><Label htmlFor="staff-email">Email</Label><Input id="staff-email" type="email" value={invite.email} maxLength={254} autoComplete="off" disabled={inviteBusy} onChange={(event) => setInvite((current) => ({ ...current, email: event.target.value }))} /></div>
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
