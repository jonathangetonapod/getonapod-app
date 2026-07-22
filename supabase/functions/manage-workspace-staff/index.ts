import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

import {
  errorResponse,
  HttpError,
  inviteRedirectUrl,
  jsonResponse,
  optionalString,
  optionsResponse,
  parseJsonObject,
  requireAuthenticatedUser,
  requireEmail,
  requireOnlyKeys,
  requireString,
  requireUuid,
  workspaceCredentialIsFresh,
} from "../_shared/workspaceAuth.ts";

const METHODS = ["POST"] as const;
const STAFF_ROLES = ["owner", "admin", "member"] as const;
const INVITE_ROLES = ["admin", "member"] as const;
const STAFF_STATUSES = [
  "provisioning",
  "invited",
  "active",
  "suspended",
  "revoked",
] as const;
const PUBLIC_ACTIONS = [
  "retry_invite",
  "update_role",
  "transfer_owner",
  "suspend",
  "reactivate",
  "revoke",
] as const;
const LIFECYCLE_ACTIONS = [
  "suspend",
  "reactivate",
] as const;
// The database caps live staff at 100. Extra rows are possible only while
// revoked Auth cleanup claims remain visible for reconciliation, so retain a
// separate defensive response bound instead of hiding the roster at 101.
const MAX_ROSTER_RESPONSE_MEMBERS = 1_000;
const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

type AdminClient = Awaited<
  ReturnType<typeof requireAuthenticatedUser>
>["admin"];
type StaffRole = typeof STAFF_ROLES[number];
type InviteRole = typeof INVITE_ROLES[number];
type StaffStatus = typeof STAFF_STATUSES[number];
type PublicAction = typeof PUBLIC_ACTIONS[number];
type LifecycleAction = typeof LIFECYCLE_ACTIONS[number];

interface RpcError {
  code?: string;
  message?: string;
}

interface InternalMembership {
  id: string;
  workspace_id: string;
  user_id: string | null;
  email_normalized: string;
  full_name: string | null;
  role: StaffRole;
  status: StaffStatus;
  invited_at: string;
  invite_expires_at: string | null;
  accepted_at: string | null;
  suspended_at: string | null;
  created_at: string;
}

interface StaffMemberDto {
  id: string;
  email: string;
  full_name: string | null;
  role: StaffRole;
  status: StaffStatus;
  invited_at: string;
  invite_expires_at: string | null;
  accepted_at: string | null;
  suspended_at: string | null;
  pending_review: boolean;
  allowed_actions: PublicAction[];
}

interface StaffViewDto {
  workspace: {
    id: string;
    name: string;
    status: "active";
  };
  members: StaffMemberDto[];
  capabilities: {
    read_only: boolean;
    invite_roles: InviteRole[];
    can_update_roles: boolean;
    can_transfer_owner: boolean;
  };
}

function invalidRpcResponse(): never {
  throw new HttpError(
    500,
    "INVALID_STAFF_RESPONSE",
    "The workspace user operation returned an invalid response",
  );
}

function responseRecord(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    invalidRpcResponse();
  }
  return value as Record<string, unknown>;
}

function responseUuid(value: unknown): string {
  if (typeof value !== "string" || !UUID_PATTERN.test(value)) {
    invalidRpcResponse();
  }
  return value.toLowerCase();
}

function responseNullableUuid(value: unknown): string | null {
  if (value === null) return null;
  return responseUuid(value);
}

function responseText(
  value: unknown,
  max: number,
  nullable = false,
): string | null {
  if (nullable && value === null) return null;
  if (typeof value !== "string" || !value.trim() || value.length > max) {
    invalidRpcResponse();
  }
  return value;
}

function responseTimestamp(value: unknown, nullable = false): string | null {
  if (nullable && value === null) return null;
  if (
    typeof value !== "string" ||
    value.length > 64 ||
    !Number.isFinite(Date.parse(value))
  ) {
    invalidRpcResponse();
  }
  return value;
}

function responseEnum<T extends string>(
  value: unknown,
  allowed: readonly T[],
): T {
  if (typeof value !== "string" || !allowed.includes(value as T)) {
    invalidRpcResponse();
  }
  return value as T;
}

function responseEmail(value: unknown): string {
  if (
    typeof value !== "string" ||
    value !== value.trim().toLowerCase() ||
    value.length > 254 ||
    !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)
  ) {
    invalidRpcResponse();
  }
  return value;
}

function responseActions(value: unknown): PublicAction[] {
  if (!Array.isArray(value) || value.length > PUBLIC_ACTIONS.length) {
    invalidRpcResponse();
  }
  const actions = value.map((action) => responseEnum(action, PUBLIC_ACTIONS));
  if (new Set(actions).size !== actions.length) invalidRpcResponse();
  return actions;
}

function memberDto(value: unknown, useRpcCapabilities = true): StaffMemberDto {
  const row = responseRecord(value);
  const emailValue = row.email ?? row.email_normalized;
  const pendingReview = useRpcCapabilities ? row.pending_review : false;
  const allowedActions = useRpcCapabilities
    ? responseActions(row.allowed_actions)
    : [];

  if (typeof pendingReview !== "boolean") invalidRpcResponse();
  if (pendingReview && allowedActions.length > 0) invalidRpcResponse();

  return {
    id: responseUuid(row.id),
    email: responseEmail(emailValue),
    full_name: responseText(row.full_name, 120, true),
    role: responseEnum(row.role, STAFF_ROLES),
    status: responseEnum(row.status, STAFF_STATUSES),
    invited_at: responseTimestamp(row.invited_at) as string,
    invite_expires_at: responseTimestamp(row.invite_expires_at, true),
    accepted_at: responseTimestamp(row.accepted_at, true),
    suspended_at: responseTimestamp(row.suspended_at, true),
    pending_review: pendingReview,
    allowed_actions: allowedActions,
  };
}

function internalMembership(value: unknown): InternalMembership {
  const candidate = Array.isArray(value) ? value[0] : value;
  const row = responseRecord(candidate);
  const dto = memberDto(row, false);
  return {
    id: dto.id,
    workspace_id: responseUuid(row.workspace_id),
    user_id: responseNullableUuid(row.user_id),
    email_normalized: dto.email,
    full_name: dto.full_name,
    role: dto.role,
    status: dto.status,
    invited_at: dto.invited_at,
    invite_expires_at: dto.invite_expires_at,
    accepted_at: dto.accepted_at,
    suspended_at: dto.suspended_at,
    created_at: responseTimestamp(row.created_at) as string,
  };
}

function provisioningMembership(value: unknown): InternalMembership {
  const row = responseRecord(value);
  return internalMembership(row.membership ?? row);
}

function staffViewDto(value: unknown): StaffViewDto {
  const row = responseRecord(value);
  const workspace = responseRecord(row.workspace);
  const capabilities = responseRecord(row.capabilities);
  if (
    !Array.isArray(row.members) ||
    row.members.length > MAX_ROSTER_RESPONSE_MEMBERS
  ) {
    invalidRpcResponse();
  }

  const members = row.members.map((member) => memberDto(member));
  if (
    new Set(members.map((member) => member.id)).size !== members.length ||
    new Set(members.map((member) => member.email)).size !== members.length ||
    members.filter((member) =>
        member.role === "owner" && member.status !== "revoked"
      ).length !== 1
  ) {
    invalidRpcResponse();
  }

  if (typeof capabilities.read_only !== "boolean") invalidRpcResponse();
  if (!Array.isArray(capabilities.invite_roles)) invalidRpcResponse();
  const inviteRoles = capabilities.invite_roles.map((role) =>
    responseEnum(role, INVITE_ROLES)
  );
  if (new Set(inviteRoles).size !== inviteRoles.length) invalidRpcResponse();
  if (
    typeof capabilities.can_update_roles !== "boolean" ||
    typeof capabilities.can_transfer_owner !== "boolean" ||
    (capabilities.read_only &&
      (inviteRoles.length > 0 ||
        capabilities.can_update_roles ||
        capabilities.can_transfer_owner))
  ) {
    invalidRpcResponse();
  }

  const workspaceStatus = responseEnum(workspace.status, ["active"] as const);
  return {
    workspace: {
      id: responseUuid(workspace.id),
      name: responseText(workspace.name, 120) as string,
      status: workspaceStatus,
    },
    members,
    capabilities: {
      read_only: capabilities.read_only,
      invite_roles: inviteRoles,
      can_update_roles: capabilities.can_update_roles,
      can_transfer_owner: capabilities.can_transfer_owner,
    },
  };
}

function rpcFailure(
  error: RpcError,
  fallbackCode: string,
  fallbackMessage: string,
): never {
  const message = (error.message ?? "").toLowerCase();
  const code = error.code ?? "";

  if (
    message.includes("stale") ||
    message.includes("issued before") ||
    message.includes("newest account credentials")
  ) {
    throw new HttpError(
      401,
      "REAUTHENTICATION_REQUIRED",
      "Sign in again with the newest account credentials",
    );
  }
  if (
    message.includes("platform administrator") &&
    (message.includes("email") ||
      message.includes("cannot be invited") ||
      message.includes("cannot be changed") ||
      message.includes("identities cannot be managed"))
  ) {
    throw new HttpError(
      409,
      "PLATFORM_ADMIN_PROTECTED",
      "Platform administrator identities cannot be managed as workspace users",
    );
  }
  if (
    message.includes("owner or administrator access") ||
    message.includes("active workspace manager") ||
    message.includes("workspace manager access") ||
    message.includes("workspace staff access") ||
    message.includes("active selected workspace") ||
    message.includes("active workspace access") ||
    message.includes("workspace access is required")
  ) {
    throw new HttpError(
      403,
      "WORKSPACE_ACCESS_REQUIRED",
      "Active access to this workspace is required",
    );
  }
  if (
    message.includes("active workspace owner") ||
    message.includes("workspace owner access")
  ) {
    throw new HttpError(
      403,
      "WORKSPACE_OWNER_REQUIRED",
      "Workspace owner access is required",
    );
  }
  if (
    message.includes("final owner") ||
    message.includes("only owner") ||
    message.includes("owner cannot be") ||
    message.includes("owner must be transferred") ||
    message.includes("role changes require ownership transfer")
  ) {
    throw new HttpError(
      409,
      "FINAL_OWNER_PROTECTED",
      "Transfer workspace ownership before changing the current owner",
    );
  }
  if (
    message.includes("role hierarchy") ||
    message.includes("administrators may invite members only") ||
    message.includes("cannot manage an owner") ||
    message.includes("cannot manage another admin") ||
    message.includes("target role")
  ) {
    throw new HttpError(
      403,
      "ROLE_HIERARCHY_VIOLATION",
      "This workspace user cannot be managed by your role",
    );
  }
  if (
    message.includes("staff limit") ||
    message.includes("membership limit") ||
    message.includes("maximum number of workspace")
  ) {
    throw new HttpError(
      409,
      "WORKSPACE_STAFF_LIMIT",
      "This workspace has reached its user limit",
    );
  }
  if (
    message.includes("already has workspace access") ||
    message.includes("already exists") ||
    message.includes("active workspace membership") ||
    code === "23505"
  ) {
    throw new HttpError(
      409,
      "STAFF_ACCOUNT_EXISTS",
      "This email already has workspace access",
    );
  }
  if (
    message.includes("private workspace not found")
  ) {
    throw new HttpError(
      404,
      "WORKSPACE_NOT_FOUND",
      "Workspace not found",
    );
  }
  if (
    message.includes("not found") ||
    code === "P0002"
  ) {
    throw new HttpError(
      404,
      "STAFF_NOT_FOUND",
      "Workspace user not found",
    );
  }
  if (
    message.includes("delivery is busy") ||
    message.includes("lifecycle is busy") ||
    message.includes("provider operation is busy") ||
    message.includes("claim is required") ||
    message.includes("claim was lost") ||
    message.includes("claim is inconsistent") ||
    message.includes("pending review") ||
    code === "55P03"
  ) {
    throw new HttpError(
      409,
      "STAFF_RECONCILIATION_PENDING",
      "This workspace user has a pending provider reconciliation",
    );
  }
  if (
    message.includes("unsafe") ||
    message.includes("ambiguous") ||
    message.includes("identity is missing") ||
    message.includes("identity mismatch") ||
    message.includes("contradictory ownership") ||
    message.includes("superseded")
  ) {
    throw new HttpError(
      409,
      "STAFF_IDENTITY_UNSAFE",
      "The workspace user identity requires operator review",
    );
  }
  if (
    message.includes("not provisioning") ||
    message.includes("not pending") ||
    message.includes("not revocable") ||
    message.includes("not editable") ||
    message.includes("not active") ||
    message.includes("not suspended") ||
    message.includes("no longer matches") ||
    message.includes("ownership changed") ||
    message.includes("requires another active accepted") ||
    message.includes("transfer target is unavailable") ||
    message.includes("status changed") ||
    message.includes("state changed") ||
    message.includes("workspace is not active")
  ) {
    throw new HttpError(
      409,
      "STAFF_STATE_CHANGED",
      "The workspace user state changed; refresh before trying again",
    );
  }
  if (
    message.includes("invalid") ||
    message.includes("required") ||
    message.includes("reused inconsistently") ||
    code === "22023"
  ) {
    throw new HttpError(
      400,
      "INVALID_STAFF_REQUEST",
      "The workspace user request is invalid",
    );
  }
  if (code === "42501") {
    throw new HttpError(
      403,
      "WORKSPACE_ACCESS_REQUIRED",
      "Active access to this workspace is required",
    );
  }

  throw new HttpError(500, fallbackCode, fallbackMessage);
}

function requireInviteRole(value: unknown): InviteRole {
  const role = requireString(value, "role", { max: 16 });
  if (!INVITE_ROLES.includes(role as InviteRole)) {
    throw new HttpError(400, "INVALID_FIELD", "role must be admin or member");
  }
  return role as InviteRole;
}

async function listWorkspaceStaff(
  admin: AdminClient,
  workspaceId: string,
  actorUserId: string,
  tokenIssuedAt: number,
): Promise<StaffViewDto> {
  const { data, error } = await admin.rpc("workspace_staff_list_v1", {
    p_workspace_id: workspaceId,
    p_actor_user_id: actorUserId,
    p_token_issued_at: tokenIssuedAt,
  });
  if (error) {
    rpcFailure(
      error,
      "STAFF_LIST_FAILED",
      "Workspace users could not be loaded",
    );
  }
  const result = staffViewDto(data);
  if (result.workspace.id !== workspaceId) invalidRpcResponse();
  return result;
}

async function beginStaffInvite(
  admin: AdminClient,
  input: {
    workspaceId: string;
    email: string;
    fullName: string | null;
    role: InviteRole;
    actorUserId: string;
    tokenIssuedAt: number;
  },
): Promise<InternalMembership> {
  const { data, error } = await admin.rpc("begin_workspace_staff_invite_v1", {
    p_workspace_id: input.workspaceId,
    p_email: input.email,
    p_full_name: input.fullName,
    p_role: input.role,
    p_actor_user_id: input.actorUserId,
    p_token_issued_at: input.tokenIssuedAt,
  });
  if (error) {
    rpcFailure(
      error,
      "STAFF_INVITE_FAILED",
      "The workspace invitation could not be created",
    );
  }
  const membership = provisioningMembership(data);
  if (
    membership.workspace_id !== input.workspaceId ||
    membership.email_normalized !== input.email ||
    membership.full_name !== input.fullName ||
    membership.role !== input.role ||
    membership.status !== "provisioning" ||
    membership.user_id !== null
  ) {
    invalidRpcResponse();
  }
  return membership;
}

async function claimStaffInviteDelivery(
  admin: AdminClient,
  input: {
    workspaceId: string;
    membershipId: string;
    actorUserId: string;
    tokenIssuedAt: number;
    lockToken: string;
  },
): Promise<InternalMembership> {
  for (let attempt = 0; attempt < 2; attempt += 1) {
    const { data, error } = await admin.rpc(
      "claim_workspace_staff_invite_delivery_v1",
      {
        p_workspace_id: input.workspaceId,
        p_membership_id: input.membershipId,
        p_actor_user_id: input.actorUserId,
        p_token_issued_at: input.tokenIssuedAt,
        p_lock_token: input.lockToken,
      },
    );
    if (!error) {
      const membership = internalMembership(data);
      if (
        membership.id !== input.membershipId ||
        membership.workspace_id !== input.workspaceId ||
        membership.status !== "provisioning"
      ) {
        invalidRpcResponse();
      }
      return membership;
    }
    if (attempt === 1) {
      rpcFailure(
        error,
        "INVITE_DELIVERY_CLAIM_UNCERTAIN",
        "The invitation delivery claim requires operator review",
      );
    }
  }
  throw new HttpError(
    503,
    "INVITE_DELIVERY_CLAIM_UNCERTAIN",
    "The invitation delivery claim requires operator review",
  );
}

async function findStaffInviteAuthUser(
  admin: AdminClient,
  input: {
    workspaceId: string;
    membershipId: string;
    actorUserId: string;
    tokenIssuedAt: number;
    lockToken: string;
  },
): Promise<string | null> {
  for (let attempt = 0; attempt < 2; attempt += 1) {
    const { data, error } = await admin.rpc(
      "find_workspace_staff_invite_auth_user_v1",
      {
        p_workspace_id: input.workspaceId,
        p_membership_id: input.membershipId,
        p_actor_user_id: input.actorUserId,
        p_token_issued_at: input.tokenIssuedAt,
        p_lock_token: input.lockToken,
      },
    );
    if (!error) return data === null ? null : responseUuid(data);
    if (attempt === 1) {
      rpcFailure(
        error,
        "STAFF_IDENTITY_RECONCILIATION_FAILED",
        "The workspace user identity could not be reconciled",
      );
    }
  }
  throw new HttpError(
    503,
    "STAFF_IDENTITY_RECONCILIATION_FAILED",
    "The workspace user identity could not be reconciled",
  );
}

async function finalizeStaffInvite(
  admin: AdminClient,
  input: {
    workspaceId: string;
    membershipId: string;
    actorUserId: string;
    tokenIssuedAt: number;
    lockToken: string;
    authUserId: string;
  },
): Promise<InternalMembership | null> {
  let notReadyResponses = 0;
  let sawTransportUncertainty = false;
  for (let attempt = 0; attempt < 2; attempt += 1) {
    const { data, error } = await admin.rpc(
      "finalize_workspace_staff_invite_v1",
      {
        p_workspace_id: input.workspaceId,
        p_membership_id: input.membershipId,
        p_actor_user_id: input.actorUserId,
        p_token_issued_at: input.tokenIssuedAt,
        p_lock_token: input.lockToken,
        p_auth_user_id: input.authUserId,
      },
    );
    if (!error) {
      const membership = internalMembership(data);
      if (
        membership.id !== input.membershipId ||
        membership.workspace_id !== input.workspaceId ||
        membership.user_id !== input.authUserId ||
        membership.status !== "invited"
      ) {
        invalidRpcResponse();
      }
      return membership;
    }

    const message = error.message.toLowerCase();
    if (message.includes("auth identity is not ready")) {
      notReadyResponses += 1;
      continue;
    }
    // SQLSTATE-backed domain failures prove the transaction rolled back and
    // can be handled deterministically. A transport/PostgREST failure cannot
    // prove whether finalization committed, so retry once with the same token
    // and then preserve both the Auth identity and durable claim for review.
    if (
      ["22023", "23505", "42501", "55000", "55P03", "P0002"].includes(
        error.code ?? "",
      )
    ) {
      // A prior transport failure may have hidden a committed finalization.
      // Even a deterministic error on the replay (for example, the actor was
      // demoted between calls) cannot make cleanup of that Auth user safe.
      if (sawTransportUncertainty) break;
      rpcFailure(
        error,
        "INVITE_FINALIZE_FAILED",
        "The workspace invitation could not be finalized",
      );
    }
    sawTransportUncertainty = true;
  }
  if (!sawTransportUncertainty && notReadyResponses === 2) return null;
  throw new HttpError(
    503,
    "INVITE_FINALIZE_UNCERTAIN",
    "The invitation result is uncertain and requires operator review",
  );
}

async function releaseInviteClaim(
  admin: AdminClient,
  membershipId: string,
  lockToken: string,
): Promise<void> {
  for (let attempt = 0; attempt < 2; attempt += 1) {
    const { data, error } = await admin.rpc(
      "release_workspace_invite_delivery_claim",
      {
        p_membership_id: membershipId,
        p_lock_token: lockToken,
      },
    );
    if (!error && data === true) return;
    if (!error && data === false) {
      throw new HttpError(
        409,
        "STAFF_RECONCILIATION_PENDING",
        "The workspace user provider claim requires operator review",
      );
    }
    if (attempt === 1 && error) {
      rpcFailure(
        error,
        "INVITE_CLAIM_RELEASE_FAILED",
        "Provider cleanup completed, but its claim requires operator review",
      );
    }
  }
  throw new HttpError(
    503,
    "INVITE_CLAIM_RELEASE_FAILED",
    "Provider cleanup completed, but its claim requires operator review",
  );
}

async function requireUnprotectedEmail(
  admin: AdminClient,
  email: string,
): Promise<void> {
  const { data, error } = await admin.rpc("is_platform_admin_email", {
    p_email: email,
  });
  if (error) {
    throw new HttpError(
      503,
      "ACCOUNT_PROTECTION_UNAVAILABLE",
      "The account protection check is unavailable",
    );
  }
  if (data === true) {
    throw new HttpError(
      409,
      "PLATFORM_ADMIN_PROTECTED",
      "Platform administrator identities cannot be managed as workspace users",
    );
  }
}

function markerMatches(
  metadata: Record<string, unknown> | undefined,
  membership: InternalMembership,
): boolean {
  return metadata?.workspace_id === membership.workspace_id &&
    metadata?.workspace_membership_id === membership.id;
}

function markerContradicts(
  metadata: Record<string, unknown> | undefined,
  membership: InternalMembership,
): boolean {
  if (!metadata) return false;
  const workspaceId = metadata.workspace_id;
  const membershipId = metadata.workspace_membership_id;
  return (workspaceId !== undefined &&
    workspaceId !== membership.workspace_id) ||
    (membershipId !== undefined && membershipId !== membership.id);
}

async function requireSafeProviderInviteIdentity(
  admin: AdminClient,
  user: {
    email?: string;
    created_at?: string;
    invited_at?: string;
    confirmed_at?: string;
    last_sign_in_at?: string;
    user_metadata?: Record<string, unknown>;
    app_metadata?: Record<string, unknown>;
  },
  membership: InternalMembership,
): Promise<void> {
  const email = user.email?.trim().toLowerCase();
  const createdAt = Date.parse(user.created_at ?? "");
  const invitedAt = Date.parse(user.invited_at ?? "");
  const membershipCreatedAt = Date.parse(membership.created_at);
  if (
    email !== membership.email_normalized ||
    !Number.isFinite(createdAt) ||
    !Number.isFinite(invitedAt) ||
    !Number.isFinite(membershipCreatedAt) ||
    createdAt < membershipCreatedAt - 60_000 ||
    invitedAt < membershipCreatedAt - 60_000 ||
    Boolean(user.confirmed_at) ||
    Boolean(user.last_sign_in_at) ||
    !markerMatches(user.user_metadata, membership) ||
    markerContradicts(user.app_metadata, membership)
  ) {
    throw new HttpError(
      409,
      "STAFF_IDENTITY_UNSAFE",
      "The workspace user identity requires operator review",
    );
  }
  await requireUnprotectedEmail(admin, membership.email_normalized);
}

async function deleteExactAuthUser(
  admin: AdminClient,
  authUserId: string,
  membership: InternalMembership,
  allowInviteMarker: boolean,
): Promise<void> {
  const { data, error } = await admin.auth.admin.getUserById(authUserId);
  if (error) {
    if (
      error.status === 404 ||
      error.message.toLowerCase().includes("not found")
    ) return;
    throw new HttpError(
      503,
      "AUTH_RECONCILIATION_UNCERTAIN",
      "The workspace user provider state requires operator review",
    );
  }
  if (!data.user) return;

  const email = data.user.email?.trim().toLowerCase();
  const appMarkerMatches = markerMatches(data.user.app_metadata, membership);
  const inviteMarkerMatches = markerMatches(
    data.user.user_metadata,
    membership,
  );
  const createdAt = Date.parse(data.user.created_at ?? "");
  const membershipCreatedAt = Date.parse(membership.created_at);
  const safeUntrustedInviteMarker = allowInviteMarker &&
    inviteMarkerMatches &&
    Boolean(data.user.invited_at) &&
    Number.isFinite(createdAt) &&
    Number.isFinite(membershipCreatedAt) &&
    createdAt >= membershipCreatedAt - 60_000 &&
    !data.user.confirmed_at &&
    !data.user.last_sign_in_at;
  if (
    email !== membership.email_normalized ||
    markerContradicts(data.user.app_metadata, membership) ||
    markerContradicts(data.user.user_metadata, membership) ||
    (!appMarkerMatches && !safeUntrustedInviteMarker)
  ) {
    throw new HttpError(
      409,
      "STAFF_IDENTITY_UNSAFE",
      "The workspace user identity requires operator review",
    );
  }
  await requireUnprotectedEmail(admin, email);

  const { error: deleteError } = await admin.auth.admin.deleteUser(authUserId);
  if (
    deleteError &&
    deleteError.status !== 404 &&
    !deleteError.message.toLowerCase().includes("not found")
  ) {
    throw new HttpError(
      503,
      "AUTH_RECONCILIATION_UNCERTAIN",
      "The workspace user provider state requires operator review",
    );
  }
}

async function deliverStaffInvite(
  admin: AdminClient,
  input: {
    workspaceId: string;
    membershipId: string;
    actorUserId: string;
    tokenIssuedAt: number;
  },
): Promise<InternalMembership> {
  // Resolve configuration before acquiring a non-stealable provider claim.
  const redirectTo = inviteRedirectUrl();
  const lockToken = crypto.randomUUID();
  const claimInput = { ...input, lockToken };
  const membership = await claimStaffInviteDelivery(admin, claimInput);

  const { data: invited, error: inviteError } = await admin.auth.admin
    .inviteUserByEmail(membership.email_normalized, {
      redirectTo,
      data: {
        full_name: membership.full_name,
        workspace_id: membership.workspace_id,
        workspace_membership_id: membership.id,
      },
    });

  if (inviteError || !invited.user) {
    const authUserId = await findStaffInviteAuthUser(admin, claimInput);
    if (authUserId) {
      await deleteExactAuthUser(admin, authUserId, membership, true);
      await releaseInviteClaim(admin, membership.id, lockToken);
      throw new HttpError(
        503,
        "INVITE_DELIVERY_RETRY_REQUIRED",
        "An uncertain invitation was invalidated; retry to send a fresh link",
      );
    }
    if (inviteError?.message.toLowerCase().includes("registered")) {
      await releaseInviteClaim(admin, membership.id, lockToken);
      throw new HttpError(
        409,
        "AUTH_ACCOUNT_EXISTS",
        "This email already has an unrelated account",
      );
    }
    throw new HttpError(
      503,
      "INVITE_DELIVERY_UNCERTAIN",
      "Invitation delivery is uncertain and requires operator review",
    );
  }

  await requireSafeProviderInviteIdentity(admin, invited.user, membership);
  const { error: markerError } = await admin.auth.admin.updateUserById(
    invited.user.id,
    {
      app_metadata: {
        ...invited.user.app_metadata,
        workspace_id: membership.workspace_id,
        workspace_membership_id: membership.id,
      },
    },
  );

  let finalized: InternalMembership | null = null;
  let finalizationError: HttpError | null = null;
  try {
    finalized = await finalizeStaffInvite(admin, {
      ...claimInput,
      authUserId: invited.user.id,
    });
  } catch (error) {
    if (!(error instanceof HttpError)) throw error;
    if (
      error.code === "INVITE_FINALIZE_UNCERTAIN" ||
      error.code === "STAFF_RECONCILIATION_PENDING" ||
      error.code === "STAFF_IDENTITY_UNSAFE"
    ) {
      throw error;
    }
    finalizationError = error;
  }
  if (finalized) return finalized;

  await deleteExactAuthUser(admin, invited.user.id, membership, true);
  await releaseInviteClaim(admin, membership.id, lockToken);
  if (finalizationError) throw finalizationError;
  throw new HttpError(
    503,
    markerError ? "INVITE_MARKER_FAILED" : "INVITE_FINALIZE_FAILED",
    "The invitation was invalidated before activation; retry to send a fresh link",
  );
}

async function claimStaffLifecycle(
  admin: AdminClient,
  input: {
    workspaceId: string;
    membershipId: string;
    action: LifecycleAction;
    actorUserId: string;
    tokenIssuedAt: number;
    lockToken: string;
  },
): Promise<InternalMembership> {
  for (let attempt = 0; attempt < 2; attempt += 1) {
    const { data, error } = await admin.rpc(
      "claim_workspace_staff_auth_lifecycle_v1",
      {
        p_workspace_id: input.workspaceId,
        p_membership_id: input.membershipId,
        p_action: input.action,
        p_actor_user_id: input.actorUserId,
        p_token_issued_at: input.tokenIssuedAt,
        p_lock_token: input.lockToken,
      },
    );
    if (!error) return internalMembership(data);
    if (attempt === 1) {
      rpcFailure(
        error,
        "STAFF_LIFECYCLE_UNCERTAIN",
        "The workspace user change requires operator review",
      );
    }
  }
  throw new HttpError(
    503,
    "STAFF_LIFECYCLE_UNCERTAIN",
    "The workspace user change requires operator review",
  );
}

async function completeStaffLifecycle(
  admin: AdminClient,
  input: {
    workspaceId: string;
    membershipId: string;
    action: LifecycleAction;
    actorUserId: string;
    tokenIssuedAt: number;
    lockToken: string;
  },
): Promise<InternalMembership> {
  for (let attempt = 0; attempt < 2; attempt += 1) {
    const { data, error } = await admin.rpc(
      "complete_workspace_staff_auth_lifecycle_v1",
      {
        p_workspace_id: input.workspaceId,
        p_membership_id: input.membershipId,
        p_action: input.action,
        p_actor_user_id: input.actorUserId,
        p_token_issued_at: input.tokenIssuedAt,
        p_lock_token: input.lockToken,
      },
    );
    if (!error) return internalMembership(data);
    if (attempt === 1) {
      rpcFailure(
        error,
        "STAFF_LIFECYCLE_COMPLETION_UNCERTAIN",
        "The provider changed, but database completion requires operator review",
      );
    }
  }
  throw new HttpError(
    503,
    "STAFF_LIFECYCLE_COMPLETION_UNCERTAIN",
    "The provider changed, but database completion requires operator review",
  );
}

async function requireSafeBoundAuthIdentity(
  admin: AdminClient,
  membership: InternalMembership,
): Promise<string> {
  if (!membership.user_id) {
    throw new HttpError(
      409,
      "STAFF_IDENTITY_UNSAFE",
      "The workspace user identity requires operator review",
    );
  }
  const { data, error } = await admin.auth.admin.getUserById(
    membership.user_id,
  );
  if (error || !data.user) {
    throw new HttpError(
      409,
      "STAFF_IDENTITY_UNSAFE",
      "The workspace user identity requires operator review",
    );
  }
  const email = data.user.email?.trim().toLowerCase();
  if (
    email !== membership.email_normalized ||
    !markerMatches(data.user.app_metadata, membership) ||
    markerContradicts(data.user.user_metadata, membership)
  ) {
    throw new HttpError(
      409,
      "STAFF_IDENTITY_UNSAFE",
      "The workspace user identity requires operator review",
    );
  }
  await requireUnprotectedEmail(admin, email);
  return membership.user_id;
}

async function transitionStaffLifecycle(
  admin: AdminClient,
  input: {
    workspaceId: string;
    membershipId: string;
    action: LifecycleAction;
    actorUserId: string;
    tokenIssuedAt: number;
  },
): Promise<InternalMembership> {
  const lockToken = crypto.randomUUID();
  const claimInput = { ...input, lockToken };
  const membership = await claimStaffLifecycle(admin, claimInput);
  const desiredStatus = input.action === "suspend" ? "suspended" : "active";
  if (
    membership.id !== input.membershipId ||
    membership.workspace_id !== input.workspaceId ||
    membership.status !== desiredStatus
  ) {
    invalidRpcResponse();
  }
  const authUserId = await requireSafeBoundAuthIdentity(admin, membership);
  const { error } = await admin.auth.admin.updateUserById(authUserId, {
    ban_duration: desiredStatus === "suspended" ? "876000h" : "none",
  });
  if (error) {
    throw new HttpError(
      503,
      "AUTH_RECONCILIATION_UNCERTAIN",
      "The workspace user state is saved, but provider reconciliation requires review",
    );
  }

  const completed = await completeStaffLifecycle(admin, claimInput);
  if (
    completed.id !== input.membershipId ||
    completed.workspace_id !== input.workspaceId ||
    completed.status !== desiredStatus
  ) {
    invalidRpcResponse();
  }
  return completed;
}

async function revokeStaffAccount(
  admin: AdminClient,
  input: {
    workspaceId: string;
    membershipId: string;
    actorUserId: string;
    tokenIssuedAt: number;
  },
): Promise<InternalMembership> {
  const lockToken = crypto.randomUUID();
  const claimInput = { ...input, lockToken };
  let revoked: InternalMembership | null = null;
  for (let attempt = 0; attempt < 2; attempt += 1) {
    const { data, error } = await admin.rpc(
      "revoke_workspace_staff_account_v1",
      {
        p_workspace_id: input.workspaceId,
        p_membership_id: input.membershipId,
        p_actor_user_id: input.actorUserId,
        p_token_issued_at: input.tokenIssuedAt,
        p_lock_token: lockToken,
      },
    );
    if (!error) {
      revoked = internalMembership(data);
      break;
    }
    if (attempt === 1) {
      rpcFailure(
        error,
        "STAFF_REVOCATION_UNCERTAIN",
        "The workspace user removal requires operator review",
      );
    }
  }
  if (
    !revoked ||
    revoked.id !== input.membershipId ||
    revoked.workspace_id !== input.workspaceId ||
    revoked.status !== "revoked"
  ) {
    invalidRpcResponse();
  }

  const authUserId = await findStaffInviteAuthUser(admin, claimInput);
  if (authUserId) {
    await deleteExactAuthUser(admin, authUserId, revoked, false);
  }
  await releaseInviteClaim(admin, revoked.id, lockToken);
  return revoked;
}

async function updateStaffRole(
  admin: AdminClient,
  input: {
    workspaceId: string;
    membershipId: string;
    role: InviteRole;
    actorUserId: string;
    tokenIssuedAt: number;
  },
): Promise<InternalMembership> {
  const { data, error } = await admin.rpc("update_workspace_staff_role_v1", {
    p_workspace_id: input.workspaceId,
    p_membership_id: input.membershipId,
    p_role: input.role,
    p_actor_user_id: input.actorUserId,
    p_token_issued_at: input.tokenIssuedAt,
  });
  if (error) {
    rpcFailure(
      error,
      "STAFF_ROLE_UPDATE_FAILED",
      "The workspace user role could not be updated",
    );
  }
  const membership = internalMembership(data);
  if (
    membership.id !== input.membershipId ||
    membership.workspace_id !== input.workspaceId ||
    membership.role !== input.role
  ) {
    invalidRpcResponse();
  }
  return membership;
}

async function transferWorkspaceOwner(
  admin: AdminClient,
  input: {
    workspaceId: string;
    membershipId: string;
    actorUserId: string;
    actorIsPlatformAdmin: boolean;
    tokenIssuedAt: number;
  },
): Promise<{ owner: StaffMemberDto; previousOwner: StaffMemberDto }> {
  const { data, error } = await admin.rpc("transfer_workspace_owner_v1", {
    p_workspace_id: input.workspaceId,
    p_membership_id: input.membershipId,
    p_actor_user_id: input.actorUserId,
    p_token_issued_at: input.tokenIssuedAt,
  });
  if (error) {
    rpcFailure(
      error,
      "OWNER_TRANSFER_FAILED",
      "Workspace ownership could not be transferred",
    );
  }
  const result = responseRecord(data);
  const ownerRow = responseRecord(result.owner);
  const previousOwnerRow = responseRecord(result.previous_owner);
  const owner = memberDto(ownerRow, false);
  const previousOwner = memberDto(previousOwnerRow, false);
  if (
    responseUuid(ownerRow.workspace_id) !== input.workspaceId ||
    responseUuid(previousOwnerRow.workspace_id) !== input.workspaceId ||
    (!input.actorIsPlatformAdmin &&
      responseUuid(previousOwnerRow.user_id) !== input.actorUserId) ||
    owner.id !== input.membershipId ||
    owner.role !== "owner" ||
    owner.status !== "active" ||
    previousOwner.role !== "admin" ||
    previousOwner.status !== "active" ||
    owner.id === previousOwner.id
  ) {
    invalidRpcResponse();
  }
  return { owner, previousOwner };
}

serve(async (req) => {
  if (req.method === "OPTIONS") return optionsResponse(req, METHODS);

  try {
    if (req.method !== "POST") {
      throw new HttpError(405, "METHOD_NOT_ALLOWED", "Only POST is allowed");
    }

    const body = await parseJsonObject(req);
    const action = typeof body.action === "string" ? body.action : "";
    const authContext = await requireAuthenticatedUser(req);
    if (!workspaceCredentialIsFresh(authContext)) {
      throw new HttpError(
        401,
        "REAUTHENTICATION_REQUIRED",
        "Sign in again with the newest account credentials",
      );
    }
    const { admin, platformAdmin, tokenIssuedAt, user } = authContext;
    const workspaceId = requireUuid(body.workspace_id, "workspace_id");

    if (action === "list") {
      requireOnlyKeys(body, ["action", "workspace_id"]);
      const result = await listWorkspaceStaff(
        admin,
        workspaceId,
        user.id,
        tokenIssuedAt,
      );
      if (result.capabilities.read_only) {
        invalidRpcResponse();
      }
      return jsonResponse(req, METHODS, 200, result);
    }

    if (action === "invite") {
      requireOnlyKeys(body, [
        "action",
        "workspace_id",
        "email",
        "full_name",
        "role",
      ]);
      const email = requireEmail(body.email);
      const fullName = optionalString(body.full_name, "full_name", 120);
      const role = requireInviteRole(body.role);
      const provisioning = await beginStaffInvite(admin, {
        workspaceId,
        email,
        fullName,
        role,
        actorUserId: user.id,
        tokenIssuedAt,
      });
      const invited = await deliverStaffInvite(admin, {
        workspaceId,
        membershipId: provisioning.id,
        actorUserId: user.id,
        tokenIssuedAt,
      });
      return jsonResponse(req, METHODS, 201, {
        success: true,
        member: memberDto(invited, false),
      });
    }

    if (action === "retry_invite") {
      requireOnlyKeys(body, ["action", "workspace_id", "membership_id"]);
      const membershipId = requireUuid(body.membership_id, "membership_id");
      const invited = await deliverStaffInvite(admin, {
        workspaceId,
        membershipId,
        actorUserId: user.id,
        tokenIssuedAt,
      });
      return jsonResponse(req, METHODS, 200, {
        success: true,
        member: memberDto(invited, false),
      });
    }

    if (action === "update_role") {
      requireOnlyKeys(body, [
        "action",
        "workspace_id",
        "membership_id",
        "role",
      ]);
      const membershipId = requireUuid(body.membership_id, "membership_id");
      const role = requireInviteRole(body.role);
      const membership = await updateStaffRole(admin, {
        workspaceId,
        membershipId,
        role,
        actorUserId: user.id,
        tokenIssuedAt,
      });
      return jsonResponse(req, METHODS, 200, {
        success: true,
        member: memberDto(membership, false),
      });
    }

    if (action === "transfer_owner") {
      requireOnlyKeys(body, ["action", "workspace_id", "membership_id"]);
      const membershipId = requireUuid(body.membership_id, "membership_id");
      const result = await transferWorkspaceOwner(admin, {
        workspaceId,
        membershipId,
        actorUserId: user.id,
        actorIsPlatformAdmin: platformAdmin,
        tokenIssuedAt,
      });
      return jsonResponse(req, METHODS, 200, {
        success: true,
        owner: result.owner,
        previous_owner: result.previousOwner,
        reauthentication_required: !platformAdmin,
      });
    }

    if (action === "revoke") {
      requireOnlyKeys(body, ["action", "workspace_id", "membership_id"]);
      const membershipId = requireUuid(body.membership_id, "membership_id");
      const membership = await revokeStaffAccount(admin, {
        workspaceId,
        membershipId,
        actorUserId: user.id,
        tokenIssuedAt,
      });
      return jsonResponse(req, METHODS, 200, {
        success: true,
        member: memberDto(membership, false),
      });
    }

    if (LIFECYCLE_ACTIONS.includes(action as LifecycleAction)) {
      requireOnlyKeys(body, ["action", "workspace_id", "membership_id"]);
      const membershipId = requireUuid(body.membership_id, "membership_id");
      const membership = await transitionStaffLifecycle(admin, {
        workspaceId,
        membershipId,
        action: action as LifecycleAction,
        actorUserId: user.id,
        tokenIssuedAt,
      });
      return jsonResponse(req, METHODS, 200, {
        success: true,
        member: memberDto(membership, false),
      });
    }

    throw new HttpError(
      400,
      "INVALID_ACTION",
      "Unknown workspace user action",
    );
  } catch (error) {
    return errorResponse(req, METHODS, error);
  }
});
