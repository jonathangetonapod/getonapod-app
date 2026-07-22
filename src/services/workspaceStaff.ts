import { supabase } from '@/lib/supabase'
import { toFunctionError } from '@/lib/functionErrors'

export type WorkspaceStaffRole = 'owner' | 'admin' | 'member'
export type WorkspaceStaffStatus = 'provisioning' | 'invited' | 'active' | 'suspended' | 'revoked'
export type WorkspaceStaffAction =
  | 'retry_invite'
  | 'update_role'
  | 'transfer_owner'
  | 'suspend'
  | 'reactivate'
  | 'revoke'

export interface WorkspaceStaffMember {
  id: string
  email: string
  full_name: string | null
  role: WorkspaceStaffRole
  status: WorkspaceStaffStatus
  invited_at: string
  invite_expires_at: string | null
  accepted_at: string | null
  suspended_at: string | null
  pending_review: boolean
  allowed_actions: WorkspaceStaffAction[]
}

export interface WorkspaceStaffCapabilities {
  read_only: boolean
  invite_roles: Array<Exclude<WorkspaceStaffRole, 'owner'>>
  can_update_roles: boolean
  can_transfer_owner: boolean
}

export interface WorkspaceStaffView {
  workspace: {
    id: string
    name: string
    status: 'active'
  }
  capabilities: WorkspaceStaffCapabilities
  members: WorkspaceStaffMember[]
}

export interface WorkspaceStaffInviteInput {
  email: string
  full_name?: string
  role: Exclude<WorkspaceStaffRole, 'owner'>
}

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const ROLES: WorkspaceStaffRole[] = ['owner', 'admin', 'member']
const STATUSES: WorkspaceStaffStatus[] = ['provisioning', 'invited', 'active', 'suspended', 'revoked']
const ACTIONS: WorkspaceStaffAction[] = [
  'retry_invite',
  'update_role',
  'transfer_owner',
  'suspend',
  'reactivate',
  'revoke',
]
const MUTATION_ACTIONS: Array<Exclude<WorkspaceStaffAction, 'update_role'>> = [
  'retry_invite',
  'transfer_owner',
  'suspend',
  'reactivate',
  'revoke',
]

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

function canonicalUuid(value: string, label: string): string {
  const result = value.trim().toLowerCase()
  if (!UUID_PATTERN.test(result)) throw new Error(`${label} is invalid.`)
  return result
}

function normalizedEmail(value: string): string {
  const email = value.trim().toLowerCase()
  if (!EMAIL_PATTERN.test(email) || email.length > 254) {
    throw new Error('Enter a valid email address.')
  }
  return email
}

function isoTimestamp(value: unknown, nullable: true): string | null
function isoTimestamp(value: unknown, nullable?: false): string
function isoTimestamp(value: unknown, nullable = false): string | null {
  if (nullable && value === null) return null
  if (typeof value !== 'string' || !value || !Number.isFinite(Date.parse(value))) {
    throw new Error('The workspace staff response was invalid.')
  }
  return value
}

function parseMember(value: unknown): WorkspaceStaffMember {
  if (!isRecord(value)) throw new Error('The workspace staff response was invalid.')
  const id = typeof value.id === 'string' ? canonicalUuid(value.id, 'Staff membership ID') : ''
  const email = typeof value.email === 'string' ? value.email.trim().toLowerCase() : ''
  const fullNameValue = value.full_name
  let fullName: string | null | undefined
  if (fullNameValue === null) fullName = null
  else if (typeof fullNameValue === 'string') fullName = fullNameValue
  else fullName = undefined
  const role = value.role as WorkspaceStaffRole
  const status = value.status as WorkspaceStaffStatus
  const allowedActions = Array.isArray(value.allowed_actions)
    ? value.allowed_actions as WorkspaceStaffAction[]
    : null

  if (
    !id
    || !EMAIL_PATTERN.test(email)
    || email.length > 254
    || fullName === undefined
    || (typeof fullName === 'string' && (fullName.trim().length === 0 || fullName.length > 120))
    || !ROLES.includes(role)
    || !STATUSES.includes(status)
    || typeof value.pending_review !== 'boolean'
    || !allowedActions
    || allowedActions.some((action) => !ACTIONS.includes(action))
    || new Set(allowedActions).size !== allowedActions.length
    || (value.pending_review && allowedActions.length > 0)
  ) {
    throw new Error('The workspace staff response was invalid.')
  }

  const actionsMatchState = (
    (role !== 'owner' || allowedActions.length === 0)
    && (!allowedActions.includes('retry_invite') || status === 'provisioning')
    && (!allowedActions.includes('update_role') || status === 'active' || status === 'suspended')
    && (!allowedActions.includes('transfer_owner') || status === 'active')
    && (!allowedActions.includes('suspend') || status === 'active')
    && (!allowedActions.includes('reactivate') || status === 'suspended')
    && (!allowedActions.includes('revoke') || status !== 'revoked')
  )
  if (!actionsMatchState) throw new Error('The workspace staff response was invalid.')

  return {
    id,
    email,
    full_name: fullName,
    role,
    status,
    invited_at: isoTimestamp(value.invited_at),
    invite_expires_at: isoTimestamp(value.invite_expires_at, true),
    accepted_at: isoTimestamp(value.accepted_at, true),
    suspended_at: isoTimestamp(value.suspended_at, true),
    pending_review: value.pending_review,
    allowed_actions: allowedActions,
  }
}

function parseCapabilities(value: unknown): WorkspaceStaffCapabilities {
  if (!isRecord(value)) throw new Error('The workspace staff response was invalid.')
  const inviteRoles = Array.isArray(value.invite_roles)
    ? value.invite_roles as Array<'admin' | 'member'>
    : null
  if (
    typeof value.read_only !== 'boolean'
    || !inviteRoles
    || inviteRoles.some((role) => role !== 'admin' && role !== 'member')
    || new Set(inviteRoles).size !== inviteRoles.length
    || typeof value.can_update_roles !== 'boolean'
    || typeof value.can_transfer_owner !== 'boolean'
    || (value.read_only && (inviteRoles.length > 0 || value.can_update_roles || value.can_transfer_owner))
  ) {
    throw new Error('The workspace staff response was invalid.')
  }
  return {
    read_only: value.read_only,
    invite_roles: inviteRoles,
    can_update_roles: value.can_update_roles,
    can_transfer_owner: value.can_transfer_owner,
  }
}

function parseView(value: unknown, expectedWorkspaceId: string): WorkspaceStaffView {
  if (!isRecord(value) || !isRecord(value.workspace) || !Array.isArray(value.members)) {
    throw new Error('The workspace staff response was invalid.')
  }
  const workspaceId = typeof value.workspace.id === 'string'
    ? canonicalUuid(value.workspace.id, 'Workspace ID')
    : ''
  if (
    workspaceId !== expectedWorkspaceId
    || typeof value.workspace.name !== 'string'
    || !value.workspace.name.trim()
    || value.workspace.name.length > 120
    || value.workspace.status !== 'active'
  ) {
    throw new Error('The workspace staff response was invalid.')
  }

  const members = value.members.map(parseMember)
  if (new Set(members.map((member) => member.id)).size !== members.length) {
    throw new Error('The workspace staff response was invalid.')
  }
  const liveOwners = members.filter((member) => member.role === 'owner' && member.status !== 'revoked')
  if (liveOwners.length !== 1) throw new Error('The workspace staff response was invalid.')

  const capabilities = parseCapabilities(value.capabilities)
  if (capabilities.read_only && members.some((member) => member.allowed_actions.length > 0)) {
    throw new Error('The workspace staff response was invalid.')
  }
  return {
    workspace: { id: workspaceId, name: value.workspace.name, status: 'active' },
    capabilities,
    members,
  }
}

async function invoke(body: Record<string, unknown>, fallback: string): Promise<unknown> {
  const { data, error } = await supabase.functions.invoke('manage-workspace-staff', { body })
  if (error) throw await toFunctionError(error, fallback)
  return data
}

export async function listWorkspaceStaff(workspaceId: string): Promise<WorkspaceStaffView> {
  const canonicalWorkspaceId = canonicalUuid(workspaceId, 'Workspace ID')
  const data = await invoke(
    { action: 'list', workspace_id: canonicalWorkspaceId },
    'Workspace users could not be loaded.',
  )
  return parseView(data, canonicalWorkspaceId)
}

export async function inviteWorkspaceStaff(
  workspaceId: string,
  input: WorkspaceStaffInviteInput,
): Promise<WorkspaceStaffMember> {
  const canonicalWorkspaceId = canonicalUuid(workspaceId, 'Workspace ID')
  const role = input.role
  if (role !== 'admin' && role !== 'member') throw new Error('Staff role is invalid.')
  const fullName = input.full_name?.trim() || null
  if (fullName && fullName.length > 120) throw new Error('Full name must be 120 characters or fewer.')
  const data = await invoke({
    action: 'invite',
    workspace_id: canonicalWorkspaceId,
    email: normalizedEmail(input.email),
    full_name: fullName,
    role,
  }, 'The staff invitation could not be sent.')
  if (!isRecord(data) || data.success !== true) throw new Error('The workspace staff response was invalid.')
  const member = parseMember(data.member)
  if (member.role !== role || member.status !== 'invited') {
    throw new Error('The workspace staff response was invalid.')
  }
  return member
}

export async function updateWorkspaceStaffRole(
  workspaceId: string,
  membershipId: string,
  role: Exclude<WorkspaceStaffRole, 'owner'>,
): Promise<WorkspaceStaffMember> {
  const canonicalWorkspaceId = canonicalUuid(workspaceId, 'Workspace ID')
  const canonicalMembershipId = canonicalUuid(membershipId, 'Staff membership ID')
  if (role !== 'admin' && role !== 'member') throw new Error('Staff role is invalid.')
  const data = await invoke({
    action: 'update_role',
    workspace_id: canonicalWorkspaceId,
    membership_id: canonicalMembershipId,
    role,
  }, 'The staff role could not be updated.')
  if (!isRecord(data) || data.success !== true) throw new Error('The workspace staff response was invalid.')
  const member = parseMember(data.member)
  if (member.id !== canonicalMembershipId || member.role !== role) {
    throw new Error('The workspace staff response was invalid.')
  }
  return member
}

export async function mutateWorkspaceStaff(
  workspaceId: string,
  membershipId: string,
  action: Exclude<WorkspaceStaffAction, 'update_role'>,
): Promise<WorkspaceStaffMember | null> {
  const canonicalWorkspaceId = canonicalUuid(workspaceId, 'Workspace ID')
  const canonicalMembershipId = canonicalUuid(membershipId, 'Staff membership ID')
  if (!MUTATION_ACTIONS.includes(action)) throw new Error('Staff action is invalid.')
  const data = await invoke({
    action,
    workspace_id: canonicalWorkspaceId,
    membership_id: canonicalMembershipId,
  }, 'The workspace user could not be updated.')
  if (!isRecord(data) || data.success !== true) throw new Error('The workspace staff response was invalid.')
  if (action === 'transfer_owner') {
    if (data.reauthentication_required !== true) throw new Error('The workspace staff response was invalid.')
    const owner = parseMember(data.owner)
    const previousOwner = parseMember(data.previous_owner)
    if (
      owner.id !== canonicalMembershipId
      || owner.role !== 'owner'
      || owner.status !== 'active'
      || previousOwner.id === owner.id
      || previousOwner.role !== 'admin'
      || previousOwner.status !== 'active'
    ) {
      throw new Error('The workspace staff response was invalid.')
    }
    return owner
  }
  const member = parseMember(data.member)
  const expectedStatus: Record<Exclude<WorkspaceStaffAction, 'update_role' | 'transfer_owner'>, WorkspaceStaffStatus> = {
    retry_invite: 'invited',
    suspend: 'suspended',
    reactivate: 'active',
    revoke: 'revoked',
  }
  if (
    member.id !== canonicalMembershipId
    || member.status !== expectedStatus[action]
  ) {
    throw new Error('The workspace staff response was invalid.')
  }
  return member
}
