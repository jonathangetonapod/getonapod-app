import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { ensureWorkspaceBillingCustomer, getOrCreateWorkspaceCheckout } from "../_shared/subscriptionCheckout.ts";

import { checkoutEmailOutcome, sendCheckoutEmail } from "../_shared/checkoutEmail.ts";
import { CREDIT_PACKS } from "../_shared/creditPacks.ts";

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
  requireWorkspaceFeatureAccess,
  workspaceCredentialIsFresh,
  writeAudit,
} from "../_shared/workspaceAuth.ts";
import { generateTemporaryPassword } from "../_shared/workspaceCredentials.ts";
import {
  clearWorkspaceAiKey,
  probeAiKeyResult,
  readStoredAiKey,
  requireProvider,
  storeWorkspaceAiKey,
  workspaceAiKeyStatus,
  workspaceTextAiPreference,
  setWorkspaceTextAiProvider,
} from "../_shared/workspaceAiKeys.ts";

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
  "retry_password",
  "reset_password",
  "update_role",
  "transfer_owner",
  "suspend",
  "reactivate",
  "revoke",
] as const;
// The database allows three, not two. 'platform_bootstrap' is what the default
// workspace's own memberships were backfilled with, and every mutation below
// refuses anything that is not an invite or a temporary password, so admitting
// it here only lets the roster be read.
const PROVISIONING_METHODS = [
  "platform_bootstrap",
  "email_invite",
  "admin_temporary_password",
] as const;
const LIFECYCLE_ACTIONS = [
  "suspend",
  "reactivate",
] as const;
// The database caps live staff at 100. Extra rows are possible only while
// revoked Auth cleanup claims remain visible for reconciliation, so retain a
// separate defensive response bound instead of hiding the roster at 101.
const MAX_ROSTER_RESPONSE_MEMBERS = 1_000;
const WORKSPACE_LOGO_BUCKET = "workspace-logos";
const MEMBER_AVATAR_BUCKET = "member-avatars";
const MAX_WORKSPACE_LOGO_BYTES = 2 * 1024 * 1024;
const MAX_WORKSPACE_LOGO_REQUEST_BYTES = 2_900_000;
const WORKSPACE_LOGO_MIME_TYPES = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
} as const;
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
type ProvisioningMethod = typeof PROVISIONING_METHODS[number];
type WorkspaceLogoMimeType = keyof typeof WORKSPACE_LOGO_MIME_TYPES;

interface RpcError {
  code?: string;
  message?: string;
}

function schemaObjectUnavailable(error: RpcError, objectName: string): boolean {
  const message = (error.message ?? "").toLowerCase();
  const normalizedObjectName = objectName.toLowerCase();
  return error.code === "PGRST202" ||
    error.code === "PGRST204" ||
    ((message.includes("schema cache") || message.includes("does not exist")) &&
      message.includes(normalizedObjectName));
}

interface InternalMembership {
  id: string;
  workspace_id: string;
  user_id: string | null;
  email_normalized: string;
  full_name: string | null;
  role: StaffRole;
  status: StaffStatus;
  provisioning_method: ProvisioningMethod;
  password_change_required: boolean;
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
  setup_method: ProvisioningMethod;
  invited_at: string;
  invite_expires_at: string | null;
  accepted_at: string | null;
  suspended_at: string | null;
  pending_review: boolean;
  allowed_actions: PublicAction[];
}

interface StaffPasswordResetClaim {
  membership: InternalMembership;
  attemptId: string;
  executionId: string;
}

interface StaffViewDto {
  workspace: {
    id: string;
    name: string;
    updated_at: string | null;
    status: "active";
    is_default: boolean;
    logo_path: string | null;
    logo_updated_at: string | null;
    client_brand_name: string;
    client_brand_primary_color: string;
    client_brand_accent_color: string;
    client_brand_updated_at: string | null;
    /** Reply-to on client emails; null until the agency sets one. */
    client_contact_email: string | null;
    booking_embed_url: string | null;
  };
  members: StaffMemberDto[];
  capabilities: {
    read_only: boolean;
    invite_roles: InviteRole[];
    can_generate_password: boolean;
    can_manage_branding: boolean;
    can_manage_client_branding: boolean;
    can_manage_workspace_name: boolean;
    can_update_roles: boolean;
    can_transfer_owner: boolean;
  };
}

interface WorkspaceBrandingDto {
  id: string;
  logo_path: string | null;
  logo_updated_at: string | null;
}

interface WorkspacePresentationBrandingDto extends WorkspaceBrandingDto {
  client_brand_name: string;
  client_brand_primary_color: string;
  client_brand_accent_color: string;
  client_brand_updated_at: string;
  /** Reply-to on client emails; null until the agency sets one. */
  client_contact_email: string | null;
  /** Scheduler link offered to prospects. Null until an agency sets one. */
  booking_embed_url: string | null;
}

interface WorkspaceSettingsBrandingDto extends WorkspacePresentationBrandingDto {
  name: string;
  updated_at: string;
}

interface WorkspaceNameDto {
  id: string;
  name: string;
  updated_at: string;
}

// Every validator in this file raised the same opaque message, so a rejected
// roster row could not be told from a rejected brand without querying the
// database by hand. The label names the failing check in the logs; the caller
// still sees one message, and only enum names and shapes are ever logged.
function invalidRpcResponse(where?: string): never {
  if (where) {
    console.error(`[manage-workspace-staff] invalid RPC response: ${where}`);
  }
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

function workspaceLogoPath(
  value: unknown,
  workspaceId: string,
): string | null {
  if (value === null) return null;
  if (typeof value !== "string" || value.length > 96) invalidRpcResponse();
  const pathPattern = new RegExp(
    `^${workspaceId}/[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\\.(png|jpg|webp)$`,
    "u",
  );
  if (!pathPattern.test(value)) invalidRpcResponse();
  return value;
}

function workspaceBrandingDto(
  value: unknown,
  expectedWorkspaceId: string,
): WorkspaceBrandingDto {
  const row = responseRecord(Array.isArray(value) ? value[0] : value);
  const id = responseUuid(row.id);
  if (id !== expectedWorkspaceId) invalidRpcResponse();
  const logoPath = workspaceLogoPath(row.logo_path, id);
  const logoUpdatedAt = responseTimestamp(row.logo_updated_at, true);
  if ((logoPath === null) !== (logoUpdatedAt === null)) invalidRpcResponse();
  return {
    id,
    logo_path: logoPath,
    logo_updated_at: logoUpdatedAt,
  };
}

function responseBrandColor(value: unknown): string {
  if (typeof value !== "string" || !/^#[0-9A-F]{6}$/u.test(value)) {
    invalidRpcResponse();
  }
  return value;
}

function workspacePresentationBrandingDto(
  value: unknown,
  expectedWorkspaceId: string,
  fallbackName?: string,
): WorkspacePresentationBrandingDto {
  const row = responseRecord(Array.isArray(value) ? value[0] : value);
  const logo = workspaceBrandingDto(row, expectedWorkspaceId);
  return {
    ...logo,
    client_brand_name: responseText(
      row.client_brand_name ?? fallbackName,
      120,
    ) as string,
    client_brand_primary_color: responseBrandColor(
      row.client_brand_primary_color,
    ),
    client_brand_accent_color: responseBrandColor(
      row.client_brand_accent_color,
    ),
    booking_embed_url: responseText(row.booking_embed_url ?? null, 500, true),
    client_contact_email: responseText(row.client_contact_email ?? null, 254, true),
    client_brand_updated_at: responseTimestamp(
      row.client_brand_updated_at,
    ) as string,
  };
}

function workspaceSettingsBrandingDto(
  value: unknown,
  expectedWorkspaceId: string,
): WorkspaceSettingsBrandingDto {
  const row = responseRecord(Array.isArray(value) ? value[0] : value);
  return {
    ...workspacePresentationBrandingDto(
      row,
      expectedWorkspaceId,
      responseText(row.name, 120) as string,
    ),
    name: responseText(row.name, 120) as string,
    updated_at: responseTimestamp(row.updated_at) as string,
  };
}

function workspaceNameDto(
  value: unknown,
  expectedWorkspaceId: string,
): WorkspaceNameDto {
  const row = responseRecord(Array.isArray(value) ? value[0] : value);
  const id = responseUuid(row.id);
  if (id !== expectedWorkspaceId) invalidRpcResponse();
  return {
    id,
    name: responseText(row.name, 120) as string,
    updated_at: responseTimestamp(row.updated_at) as string,
  };
}

function responseEnum<T extends string>(
  value: unknown,
  allowed: readonly T[],
  field?: string,
): T {
  if (typeof value !== "string" || !allowed.includes(value as T)) {
    invalidRpcResponse(
      field
        ? `${field} was ${
          typeof value === "string" ? JSON.stringify(value) : typeof value
        }, expected one of ${allowed.join("|")}`
        : undefined,
    );
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
  const actions = value.map((action) =>
    responseEnum(action, PUBLIC_ACTIONS, "member.allowed_actions[]")
  );
  if (new Set(actions).size !== actions.length) invalidRpcResponse();
  return actions;
}

function responseSetupMethod(
  row: Record<string, unknown>,
): ProvisioningMethod {
  return responseEnum(
    row.setup_method ?? row.provisioning_method ?? "email_invite",
    PROVISIONING_METHODS,
    "member.setup_method",
  );
}

function memberDto(value: unknown, useRpcCapabilities = true): StaffMemberDto {
  const row = responseRecord(value);
  const emailValue = row.email ?? row.email_normalized;
  const pendingReview = useRpcCapabilities ? row.pending_review : false;
  const allowedActions = useRpcCapabilities
    ? responseActions(row.allowed_actions)
    : [];
  const setupMethod = responseSetupMethod(row);

  if (typeof pendingReview !== "boolean") invalidRpcResponse();
  if (pendingReview && allowedActions.length > 0) invalidRpcResponse();
  if (
    (allowedActions.includes("retry_invite") &&
      setupMethod !== "email_invite") ||
    (allowedActions.includes("retry_password") &&
      setupMethod !== "admin_temporary_password") ||
    (allowedActions.includes("reset_password") &&
      !(
        row.status === "active" ||
        (row.status === "invited" &&
          setupMethod === "admin_temporary_password")
      ))
  ) {
    invalidRpcResponse();
  }

  return {
    id: responseUuid(row.id),
    email: responseEmail(emailValue),
    full_name: responseText(row.full_name, 120, true),
    role: responseEnum(row.role, STAFF_ROLES, "member.role"),
    status: responseEnum(row.status, STAFF_STATUSES, "member.status"),
    setup_method: setupMethod,
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
    provisioning_method: responseEnum(
      row.provisioning_method,
      PROVISIONING_METHODS,
      "membership.provisioning_method",
    ),
    password_change_required: (() => {
      if (typeof row.password_change_required !== "boolean") {
        invalidRpcResponse();
      }
      return row.password_change_required;
    })(),
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
  if (typeof workspace.is_default !== "boolean") invalidRpcResponse();
  const isDefaultWorkspace = workspace.is_default === true;
  // Exactly one live owner is a private-workspace invariant, enforced by
  // enforce_private_workspace_staff_invariants — which skips the default
  // workspace on purpose. Asserting it there would reject a roster the database
  // considers perfectly valid, so the assertion follows the invariant.
  if (
    new Set(members.map((member) => member.id)).size !== members.length ||
    new Set(members.map((member) => member.email)).size !== members.length ||
    (!isDefaultWorkspace && members.filter((member) =>
        member.role === "owner" && member.status !== "revoked"
      ).length !== 1)
  ) {
    invalidRpcResponse();
  }

  if (typeof capabilities.read_only !== "boolean") invalidRpcResponse();
  if (!Array.isArray(capabilities.invite_roles)) invalidRpcResponse();
  const inviteRoles = capabilities.invite_roles.map((role) =>
    responseEnum(role, INVITE_ROLES)
  );
  const canGeneratePassword = capabilities.can_generate_password ?? false;
  const canManageBranding = capabilities.can_manage_branding ?? false;
  const canManageClientBranding =
    capabilities.can_manage_client_branding ?? false;
  const canManageWorkspaceName =
    capabilities.can_manage_workspace_name ?? false;
  if (new Set(inviteRoles).size !== inviteRoles.length) invalidRpcResponse();
  if (
    typeof canGeneratePassword !== "boolean" ||
    typeof canManageBranding !== "boolean" ||
    typeof canManageClientBranding !== "boolean" ||
    typeof canManageWorkspaceName !== "boolean" ||
    typeof capabilities.can_update_roles !== "boolean" ||
    typeof capabilities.can_transfer_owner !== "boolean" ||
    (capabilities.read_only &&
      (inviteRoles.length > 0 ||
        canGeneratePassword ||
        canManageBranding ||
        canManageClientBranding ||
        canManageWorkspaceName ||
        capabilities.can_update_roles ||
        capabilities.can_transfer_owner))
  ) {
    invalidRpcResponse();
  }

  // The default workspace gets the settings sections and a read-only roster.
  // Its staff mutations are still refused at the SQL root, so a capability that
  // said otherwise would render a button that cannot work. Refuse the response
  // instead of showing it.
  if (
    isDefaultWorkspace &&
    (inviteRoles.length > 0 ||
      capabilities.can_update_roles ||
      capabilities.can_transfer_owner ||
      members.some((member) => member.allowed_actions.length > 0))
  ) {
    invalidRpcResponse();
  }

  const workspaceStatus = responseEnum(
    workspace.status,
    ["active"] as const,
    "workspace.status",
  );
  return {
    workspace: {
      id: responseUuid(workspace.id),
      name: responseText(workspace.name, 120) as string,
      updated_at: null,
      status: workspaceStatus,
      is_default: isDefaultWorkspace,
      logo_path: null,
      logo_updated_at: null,
      client_brand_name: responseText(workspace.name, 120) as string,
      client_brand_primary_color: "#0D1B2A",
      client_brand_accent_color: "#C7794F",
      client_brand_updated_at: null,
      client_contact_email: null,
      // Placeholder; listWorkspaceSettings overlays the real value from
      // loadWorkspaceBranding. The list action always goes through that
      // overlay, so the settings box shows the saved link and can clear it.
      booking_embed_url: null,
    },
    members,
    capabilities: {
      read_only: capabilities.read_only,
      invite_roles: inviteRoles,
      can_generate_password: canGeneratePassword,
      can_manage_branding: canManageBranding,
      can_manage_client_branding: canManageClientBranding,
      can_manage_workspace_name: canManageWorkspaceName,
      can_update_roles: capabilities.can_update_roles,
      can_transfer_owner: capabilities.can_transfer_owner,
    },
  };
}

/**
 * Whether an address can be invited is the only fact a tenant may learn.
 *
 * The distinct refusals (a platform administrator, staff at another agency,
 * an unrelated Auth account) answered a question an agency admin has no
 * business asking about a stranger's email: the invite form was an oracle
 * for who is a customer elsewhere. A tenant actor gets one answer, unless the
 * address already has a live membership on this workspace, which their own
 * roster shows them anyway.
 */
async function withoutInviteOracle(
  admin: AdminClient,
  error: unknown,
  input: { platformAdmin: boolean; workspaceId: string; email: string },
): Promise<unknown> {
  if (input.platformAdmin || !(error instanceof HttpError)) return error;
  if (
    !["PLATFORM_ADMIN_PROTECTED", "STAFF_ACCOUNT_EXISTS", "AUTH_ACCOUNT_EXISTS"]
      .includes(error.code)
  ) {
    return error;
  }
  const { data } = await admin
    .from("workspace_memberships")
    .select("id")
    .eq("workspace_id", input.workspaceId)
    .eq("email_normalized", input.email)
    .neq("status", "revoked")
    .limit(1);
  if ((data ?? []).length > 0) {
    return new HttpError(
      409,
      "STAFF_ACCOUNT_EXISTS",
      "This email already has access to this workspace",
    );
  }
  return new HttpError(
    409,
    "CANNOT_INVITE_ADDRESS",
    "This address cannot be invited to this workspace. Contact us if you think that is wrong",
  );
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
      "Your sign-in is out of date. Sign out and sign in again to continue",
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
    message.includes("requires reconciliation") ||
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

const PORTFOLIO_PAGE_SIZE = 1_000;
const PORTFOLIO_MAX_PAGES = 200;

/**
 * Read a select to the end, a page at a time. The builder must apply a stable
 * order and the given range. Returns the first error instead of partial rows,
 * so a total is either complete or not shown.
 */
async function readAllPages(
  page: (from: number, to: number) => PromiseLike<{ data: unknown[] | null; error: unknown }>,
): Promise<{ data: Array<Record<string, unknown>>; error: unknown }> {
  const rows: Array<Record<string, unknown>> = [];
  for (let index = 0; index < PORTFOLIO_MAX_PAGES; index += 1) {
    const from = index * PORTFOLIO_PAGE_SIZE;
    const { data, error } = await page(from, from + PORTFOLIO_PAGE_SIZE - 1);
    if (error) return { data: [], error };
    const batch = (data ?? []) as Array<Record<string, unknown>>;
    rows.push(...batch);
    if (batch.length < PORTFOLIO_PAGE_SIZE) return { data: rows, error: null };
  }
  // More rows than the page ceiling: refuse rather than under-report.
  return { data: [], error: new Error("portfolio read exceeded its page limit") };
}

/**
 * Whether Stripe holds a card for this customer that can be charged again.
 * The same question the refill tick asks before charging, so the billing
 * page and the tick cannot disagree. Null when Stripe cannot be asked (no key,
 * timeout, error), and the caller falls back to the ledger proof.
 */
async function stripeHasSavedCard(customerId: string): Promise<boolean | null> {
  const stripeKey = Deno.env.get("STRIPE_SECRET_KEY")?.trim();
  if (!stripeKey) return null;
  try {
    const query = new URLSearchParams({ customer: customerId, type: "card", limit: "1" });
    const response = await fetch(`https://api.stripe.com/v1/payment_methods?${query.toString()}`, {
      headers: { Authorization: `Bearer ${stripeKey}` },
      signal: AbortSignal.timeout(8_000),
    });
    if (!response.ok) return null;
    const body = await response.json().catch(() => null) as { data?: unknown } | null;
    if (!body || !Array.isArray(body.data)) return null;
    return body.data.length > 0;
  } catch (_error) {
    return null;
  }
}

/**
 * What the subscription actually charges, in cents a month, read from Stripe.
 *
 * workspace_billing_profiles.base_price_cents cannot answer this: it is copied
 * from the plan by the subscription webhook, so it is the column default until
 * a workspace first subscribes, and the plan's new price after a repricing even
 * though Stripe keeps existing subscribers on the Price they signed up at.
 * Null when Stripe is not configured or not answering; the caller falls back to
 * the plan's price rather than to a column nothing kept current.
 */
async function stripeSubscriptionPriceCents(subscriptionId: string): Promise<number | null> {
  const stripeKey = Deno.env.get("STRIPE_SECRET_KEY")?.trim();
  if (!stripeKey) return null;
  try {
    const response = await fetch(
      `https://api.stripe.com/v1/subscriptions/${encodeURIComponent(subscriptionId)}`,
      {
        headers: { Authorization: `Bearer ${stripeKey}` },
        signal: AbortSignal.timeout(8_000),
      },
    );
    if (!response.ok) return null;
    const body = await response.json().catch(() => null) as {
      items?: { data?: Array<{ price?: { unit_amount?: unknown; recurring?: { interval?: unknown } } }> }
    } | null;
    const price = body?.items?.data?.[0]?.price;
    const amount = price?.unit_amount;
    if (typeof amount !== "number" || !Number.isSafeInteger(amount)) return null;
    // Every plan is sold monthly; a yearly Price is shown at its monthly rate
    // so it can be compared with the plan's.
    return price?.recurring?.interval === "year" ? Math.round(amount / 12) : amount;
  } catch (_error) {
    return null;
  }
}

/**
 * Every trial runs this long from the day the workspace was created, unless a
 * platform admin has set trial_ends_at. Nothing wrote that column before, so
 * reading it alone left every trial without an end and no workspace ever came
 * due.
 */
const TRIAL_LENGTH_DAYS = 14;

function effectiveTrialEndsAt(trialEndsAt: unknown, workspaceCreatedAt: unknown): string | null {
  if (typeof trialEndsAt === "string" && !Number.isNaN(Date.parse(trialEndsAt))) {
    return new Date(trialEndsAt).toISOString();
  }
  if (typeof workspaceCreatedAt !== "string") return null;
  const created = Date.parse(workspaceCreatedAt);
  if (Number.isNaN(created)) return null;
  return new Date(created + TRIAL_LENGTH_DAYS * 86_400_000).toISOString();
}

/**
 * A Stripe call made on a platform admin's behalf. Every write carries an
 * idempotency key derived from the admin's action, so a retried action is one
 * change at Stripe; Stripe refuses a key reused for a different request, which
 * is why callers suffix it per call.
 */
async function stripeRequest(
  method: "GET" | "POST",
  path: string,
  params?: URLSearchParams,
  idempotencyKey?: string,
): Promise<Record<string, unknown>> {
  const stripeKey = Deno.env.get("STRIPE_SECRET_KEY")?.trim();
  if (!stripeKey) throw new HttpError(503, "STRIPE_UNAVAILABLE", "Stripe is not configured");
  const headers: Record<string, string> = { Authorization: `Bearer ${stripeKey}` };
  if (method === "POST") headers["Content-Type"] = "application/x-www-form-urlencoded";
  if (idempotencyKey) headers["Idempotency-Key"] = idempotencyKey;
  let response: Response;
  try {
    response = await fetch(`https://api.stripe.com/v1/${path}`, {
      method,
      headers,
      body: method === "POST" ? (params ?? new URLSearchParams()).toString() : undefined,
      signal: AbortSignal.timeout(15_000),
    });
  } catch (_error) {
    throw new HttpError(502, "STRIPE_UNAVAILABLE", "Stripe did not answer. Try again");
  }
  const payload = await response.json().catch(() => null) as Record<string, unknown> | null;
  if (!response.ok || !payload) {
    const stripeError = payload?.error as { message?: unknown } | undefined;
    console.error(`[manage-workspace-staff] Stripe ${method} ${path.split(/[/?]/u)[0]} failed: ${response.status}`);
    throw new HttpError(
      502,
      "STRIPE_REJECTED",
      typeof stripeError?.message === "string"
        ? `Stripe refused the change: ${stripeError.message}`.slice(0, 300)
        : "Stripe refused the change",
    );
  }
  return payload;
}

const SUBSCRIPTION_OPERATIONS = ["extend_trial", "change_plan", "make_comped", "cancel", "checkout_link"] as const;
type SubscriptionOperation = typeof SUBSCRIPTION_OPERATIONS[number];

/**
 * What a ledger row is, in the words the billing admin page filters by. The
 * ledger's own entry_type is mechanical (a purchase and a support grant are
 * both "grant"), so the reference kind decides.
 */
const LEDGER_TYPES = ["all", "grant", "removal", "allowance", "spend", "purchase", "expiry"] as const;
type LedgerType = typeof LEDGER_TYPES[number];
const LEDGER_PAGE_SIZE = 25;

function ledgerEntryType(entryType: unknown, referenceKind: unknown): Exclude<LedgerType, "all"> {
  const kind = typeof referenceKind === "string" ? referenceKind : "";
  if (entryType === "grant") {
    if (kind === "allowance_period") return "allowance";
    if (kind.startsWith("stripe_")) return "purchase";
    return "grant";
  }
  if (entryType === "debit" || entryType === "refund") return "spend";
  if (entryType === "expiry") return "expiry";
  // A reversal of a bought pack (refund, dispute) is an adjustment too, but
  // not one an admin made.
  if (entryType === "adjustment") return kind === "admin_adjustment" ? "removal" : "purchase";
  return "grant";
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

async function loadWorkspaceBranding(
  admin: AdminClient,
  workspaceId: string,
): Promise<WorkspaceSettingsBrandingDto> {
  const { data: workspaceData, error: workspaceError } = await admin
    .from("workspaces")
    .select("id,name,updated_at,logo_path,logo_updated_at")
    .eq("id", workspaceId)
    .eq("status", "active")
    .maybeSingle();
  if (workspaceError || !workspaceData) {
    throw new HttpError(
      500,
      "BRANDING_UNAVAILABLE",
      "Workspace branding could not be loaded",
    );
  }

  const workspace = responseRecord(workspaceData);
  const base = {
    ...workspaceBrandingDto(workspace, workspaceId),
    name: responseText(workspace.name, 120) as string,
    updated_at: responseTimestamp(workspace.updated_at) as string,
  };
  const { data: canonicalBrand, error: canonicalBrandError } = await admin
    .from("workspaces")
    .select("id,client_brand_name,client_brand_primary_color,client_brand_accent_color,client_brand_updated_at,booking_embed_url,client_contact_email")
    .eq("id", workspaceId)
    .maybeSingle();

  if (!canonicalBrandError && canonicalBrand?.client_brand_name) {
    return {
      ...base,
      client_brand_name: responseText(
        canonicalBrand.client_brand_name,
        120,
      ) as string,
      client_brand_primary_color: responseBrandColor(
        canonicalBrand.client_brand_primary_color,
      ),
      client_brand_accent_color: responseBrandColor(
        canonicalBrand.client_brand_accent_color,
      ),
      client_brand_updated_at: responseTimestamp(
        canonicalBrand.client_brand_updated_at,
      ) as string,
      booking_embed_url: responseText(canonicalBrand.booking_embed_url ?? null, 500, true),
      client_contact_email: responseText(canonicalBrand.client_contact_email ?? null, 254, true),
    };
  }
  if (
    canonicalBrandError &&
    !schemaObjectUnavailable(canonicalBrandError, "client_brand_name")
  ) {
    throw new HttpError(
      500,
      "BRANDING_UNAVAILABLE",
      "Workspace branding could not be loaded",
    );
  }

  const { data: brandEvent, error: brandEventError } = await admin
    .from("workspace_audit_log")
    .select("created_at,metadata")
    .eq("workspace_id", workspaceId)
    .eq("action", "workspace.branding.client_identity_updated")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (brandEventError) {
    throw new HttpError(
      500,
      "BRANDING_UNAVAILABLE",
      "Workspace branding could not be loaded",
    );
  }
  if (!brandEvent) {
    // The save compares against client_brand_updated_at, not the workspace's
    // updated_at, which moves with every logo or name change. Handing out the
    // wrong one made the first brand save fail as "changed" every time.
    return {
      ...base,
      client_brand_name: base.name,
      client_brand_primary_color: "#0D1B2A",
      client_brand_accent_color: "#C7794F",
      client_brand_updated_at:
        responseTimestamp(canonicalBrand?.client_brand_updated_at ?? null, true) ?? base.updated_at,
      booking_embed_url: responseText(canonicalBrand?.booking_embed_url ?? null, 500, true),
      client_contact_email: responseText(canonicalBrand?.client_contact_email ?? null, 254, true),
    };
  }

  const event = responseRecord(brandEvent);
  const metadata = responseRecord(event.metadata);
  return {
    ...base,
    client_brand_name: responseText(metadata.client_brand_name, 120) as string,
    client_brand_primary_color: responseBrandColor(metadata.primary_color),
    client_brand_accent_color: responseBrandColor(metadata.accent_color),
    client_brand_updated_at: responseTimestamp(event.created_at) as string,
    booking_embed_url: responseText(canonicalBrand?.booking_embed_url ?? null, 500, true),
    client_contact_email: responseText(canonicalBrand?.client_contact_email ?? null, 254, true),
  };
}

async function listWorkspaceSettings(
  admin: AdminClient,
  workspaceId: string,
  actorUserId: string,
  tokenIssuedAt: number,
): Promise<StaffViewDto> {
  const [staff, branding] = await Promise.all([
    listWorkspaceStaff(admin, workspaceId, actorUserId, tokenIssuedAt),
    loadWorkspaceBranding(admin, workspaceId),
  ]);
  const canManageWorkspaceBranding = staff.capabilities.can_generate_password;
  return {
    ...staff,
    workspace: {
      ...staff.workspace,
      name: branding.name,
      updated_at: branding.updated_at,
      logo_path: branding.logo_path,
      logo_updated_at: branding.logo_updated_at,
      client_brand_name: branding.client_brand_name,
      client_brand_primary_color: branding.client_brand_primary_color,
      client_brand_accent_color: branding.client_brand_accent_color,
      client_brand_updated_at: branding.client_brand_updated_at,
      client_contact_email: branding.client_contact_email,
      booking_embed_url: branding.booking_embed_url,
    },
    capabilities: {
      ...staff.capabilities,
      can_manage_branding: canManageWorkspaceBranding,
      can_manage_client_branding: canManageWorkspaceBranding,
      can_manage_workspace_name: canManageWorkspaceBranding,
    },
  };
}

function requireWorkspaceManager(staff: StaffViewDto): void {
  if (!staff.capabilities.can_generate_password) {
    throw new HttpError(
      403,
      "WORKSPACE_MANAGER_REQUIRED",
      "Workspace owner or administrator access is required",
    );
  }
}

function requireExpectedLogoPath(
  value: unknown,
  workspaceId: string,
): string | null {
  if (value === null) return null;
  if (value === undefined) {
    throw new HttpError(
      400,
      "INVALID_FIELD",
      "expected_logo_path is required",
    );
  }
  if (typeof value !== "string") {
    throw new HttpError(
      400,
      "INVALID_FIELD",
      "expected_logo_path is invalid",
    );
  }
  try {
    return workspaceLogoPath(value, workspaceId);
  } catch {
    throw new HttpError(
      400,
      "INVALID_FIELD",
      "expected_logo_path is invalid",
    );
  }
}

function requireWorkspaceLogoImage(
  mimeValue: unknown,
  base64Value: unknown,
): {
  bytes: Uint8Array;
  extension: typeof WORKSPACE_LOGO_MIME_TYPES[WorkspaceLogoMimeType];
  mimeType: WorkspaceLogoMimeType;
} {
  if (
    typeof mimeValue !== "string" ||
    !Object.hasOwn(WORKSPACE_LOGO_MIME_TYPES, mimeValue)
  ) {
    throw new HttpError(
      400,
      "INVALID_LOGO_TYPE",
      "Logo must be a PNG, JPEG, or WebP image",
    );
  }
  if (
    typeof base64Value !== "string" ||
    base64Value.length === 0 ||
    base64Value.length > Math.ceil(MAX_WORKSPACE_LOGO_BYTES / 3) * 4 ||
    base64Value.length % 4 !== 0 ||
    !/^[A-Za-z0-9+/]+={0,2}$/u.test(base64Value)
  ) {
    throw new HttpError(
      400,
      "INVALID_LOGO_DATA",
      "Logo image data is invalid",
    );
  }

  let bytes: Uint8Array;
  try {
    const decoded = atob(base64Value);
    bytes = Uint8Array.from(decoded, (character) => character.charCodeAt(0));
  } catch {
    throw new HttpError(
      400,
      "INVALID_LOGO_DATA",
      "Logo image data is invalid",
    );
  }
  if (bytes.byteLength === 0 || bytes.byteLength > MAX_WORKSPACE_LOGO_BYTES) {
    throw new HttpError(
      413,
      "LOGO_TOO_LARGE",
      "Logo must be 2 MB or smaller",
    );
  }

  const mimeType = mimeValue as WorkspaceLogoMimeType;
  const signatureMatches = mimeType === "image/png"
    ? bytes.byteLength >= 8 &&
      [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a].every((byte, index) =>
        bytes[index] === byte
      )
    : mimeType === "image/jpeg"
    ? bytes.byteLength >= 4 &&
      bytes[0] === 0xff &&
      bytes[1] === 0xd8 &&
      bytes[2] === 0xff
    : bytes.byteLength >= 12 &&
      String.fromCharCode(...bytes.slice(0, 4)) === "RIFF" &&
      String.fromCharCode(...bytes.slice(8, 12)) === "WEBP";
  if (!signatureMatches) {
    throw new HttpError(
      400,
      "LOGO_TYPE_MISMATCH",
      "Logo contents do not match the selected image type",
    );
  }

  return {
    bytes,
    extension: WORKSPACE_LOGO_MIME_TYPES[mimeType],
    mimeType,
  };
}

function requireExpectedAvatarPath(
  value: unknown,
  workspaceId: string,
): string | null {
  if (value === null || value === undefined) return null;
  const path = requireString(value, "expected_avatar_path", { max: 320 });
  // Confined to this workspace's folder. Note this does NOT confine it to the
  // caller's own subfolder — objects live at workspace/user/uuid and only the
  // workspace half is checked here. That is safe only because this value is
  // never used to locate a row: set_membership_avatar_v1 finds the membership
  // by the authenticated actor alone, and compares this path solely to detect a
  // concurrent change. Do not start trusting it for anything else.
  if (!path.startsWith(`${workspaceId}/`)) {
    throw new HttpError(400, "INVALID_FIELD", "expected_avatar_path is invalid");
  }
  return path;
}

async function removeMemberAvatarObject(
  admin: AdminClient,
  path: string | null,
): Promise<void> {
  if (!path) return;
  const { error } = await admin.storage.from(MEMBER_AVATAR_BUCKET).remove([path]);
  // A leftover object is untidy, not incorrect; the row is what is read.
  if (error) console.error("Member avatar cleanup failed");
}

async function setMembershipAvatar(
  admin: AdminClient,
  input: {
    workspaceId: string;
    expectedAvatarPath: string | null;
    avatarPath: string | null;
    actorUserId: string;
    tokenIssuedAt: number;
  },
): Promise<Record<string, unknown>> {
  const { data, error } = await admin.rpc("set_membership_avatar_v1", {
    p_workspace_id: input.workspaceId,
    p_expected_avatar_path: input.expectedAvatarPath,
    p_avatar_path: input.avatarPath,
    p_actor_user_id: input.actorUserId,
    p_token_issued_at: input.tokenIssuedAt,
  });
  if (error) {
    /*
     * Mapped here rather than through rpcFailure, which reads messages meant
     * for staff invites: "active workspace membership is required" matched its
     * duplicate-invite branch and told a member setting their own picture that
     * their email already had access. These refusals are this function's own
     * words about this member, so they are safe to pass on — and saying which
     * of five conditions refused is the difference between a fixable report and
     * another round of guessing.
     */
    const message = (error as { message?: string }).message ?? "";
    if (message.includes("stale")) {
      throw new HttpError(
        401,
        "REAUTHENTICATION_REQUIRED",
        "Your sign-in is out of date. Sign out and sign in again to continue",
      );
    }
    if (message.includes("avatar changed")) {
      throw new HttpError(
        409,
        "AVATAR_CHANGED",
        "Your profile picture changed elsewhere. Refresh and try again",
      );
    }
    if (message.startsWith("avatar ")) {
      throw new HttpError(403, "AVATAR_ACCESS_REFUSED", message);
    }
    rpcFailure(error, "AVATAR_UPDATE_FAILED", "The profile picture could not be updated");
  }
  return (data ?? {}) as Record<string, unknown>;
}

async function setWorkspaceLogo(
  admin: AdminClient,
  input: {
    workspaceId: string;
    expectedLogoPath: string | null;
    logoPath: string | null;
    actorUserId: string;
    tokenIssuedAt: number;
  },
): Promise<WorkspaceBrandingDto> {
  const { data, error } = await admin.rpc("set_workspace_logo_v1", {
    p_workspace_id: input.workspaceId,
    p_expected_logo_path: input.expectedLogoPath,
    p_logo_path: input.logoPath,
    p_actor_user_id: input.actorUserId,
    p_token_issued_at: input.tokenIssuedAt,
  });
  if (error) {
    rpcFailure(
      error,
      "BRANDING_UPDATE_FAILED",
      "Workspace branding could not be updated",
    );
  }
  return workspaceBrandingDto(data, input.workspaceId);
}

function requireClientBrandName(value: unknown): string {
  const name = requireString(value, "client_brand_name", { max: 120 }).trim();
  if (!name || /[\p{Cc}\p{Cf}]/u.test(name)) {
    throw new HttpError(
      400,
      "INVALID_BRAND_NAME",
      "Client-facing agency name is invalid",
    );
  }
  return name;
}

function requireWorkspaceName(value: unknown): string {
  const name = requireString(value, "workspace_name", { max: 120 }).trim();
  if (!name || /[\p{Cc}\p{Cf}]/u.test(name)) {
    throw new HttpError(
      400,
      "INVALID_WORKSPACE_NAME",
      "Workspace name is invalid",
    );
  }
  return name;
}

function requireClientBrandColor(value: unknown, field: string): string {
  const color = requireString(value, field, { max: 7 }).trim().toUpperCase();
  if (!/^#[0-9A-F]{6}$/u.test(color)) {
    throw new HttpError(
      400,
      "INVALID_BRAND_COLOR",
      `${field} must be a six-digit hexadecimal color`,
    );
  }
  return color;
}

function requireBrandUpdatedAt(value: unknown): string {
  if (
    typeof value !== "string" ||
    value.length > 64 ||
    !Number.isFinite(Date.parse(value))
  ) {
    throw new HttpError(
      400,
      "INVALID_FIELD",
      "expected_brand_updated_at is invalid",
    );
  }
  return value;
}

function requireWorkspaceUpdatedAt(value: unknown): string {
  if (
    typeof value !== "string" ||
    value.length > 64 ||
    !Number.isFinite(Date.parse(value))
  ) {
    throw new HttpError(
      400,
      "INVALID_FIELD",
      "expected_updated_at is invalid",
    );
  }
  return value;
}

async function setWorkspaceName(
  admin: AdminClient,
  input: {
    workspaceId: string;
    expectedUpdatedAt: string;
    previousWorkspaceName: string;
    workspaceName: string;
    actorUserId: string;
    tokenIssuedAt: number;
  },
): Promise<WorkspaceNameDto> {
  const { data, error } = await admin.rpc("set_workspace_name_v1", {
    p_workspace_id: input.workspaceId,
    p_expected_updated_at: input.expectedUpdatedAt,
    p_workspace_name: input.workspaceName,
    p_actor_user_id: input.actorUserId,
    p_token_issued_at: input.tokenIssuedAt,
  });
  if (!error) {
    return workspaceNameDto(data, input.workspaceId);
  }
  if (!schemaObjectUnavailable(error, "set_workspace_name_v1")) {
    rpcFailure(
      error,
      "WORKSPACE_NAME_UPDATE_FAILED",
      "Workspace name could not be updated",
    );
  }

  const { data: updatedWorkspace, error: updateError } = await admin
    .from("workspaces")
    .update({ name: input.workspaceName })
    .eq("id", input.workspaceId)
    .eq("status", "active")
    .eq("updated_at", input.expectedUpdatedAt)
    .select("id,name,updated_at")
    .maybeSingle();
  if (updateError) {
    throw new HttpError(
      500,
      "WORKSPACE_NAME_UPDATE_FAILED",
      "Workspace name could not be updated",
    );
  }
  if (!updatedWorkspace) {
    throw new HttpError(
      409,
      "WORKSPACE_STATE_CHANGED",
      "Workspace settings changed; refresh before trying again",
    );
  }

  const { error: auditError } = await admin.from("workspace_audit_log").insert({
    workspace_id: input.workspaceId,
    actor_user_id: input.actorUserId,
    action: "workspace.identity.name_updated",
    entity_type: "workspace",
    entity_id: input.workspaceId,
    metadata: {
      previous_name: input.previousWorkspaceName,
      workspace_name: input.workspaceName,
    },
  });
  if (auditError) console.error("Workspace name audit event failed");
  return workspaceNameDto(updatedWorkspace, input.workspaceId);
}

async function setWorkspaceClientBrand(
  admin: AdminClient,
  input: {
    workspaceId: string;
    expectedBrandUpdatedAt: string;
    clientBrandName: string;
    primaryColor: string;
    accentColor: string;
    contactEmail?: string | null;
    actorUserId: string;
    tokenIssuedAt: number;
  },
): Promise<WorkspacePresentationBrandingDto> {
  const { data, error } = await admin.rpc("set_workspace_client_brand_v1", {
    p_workspace_id: input.workspaceId,
    p_expected_brand_updated_at: input.expectedBrandUpdatedAt,
    p_client_brand_name: input.clientBrandName,
    p_client_brand_primary_color: input.primaryColor,
    p_client_brand_accent_color: input.accentColor,
    p_actor_user_id: input.actorUserId,
    p_token_issued_at: input.tokenIssuedAt,
  });
  if (!error) {
    // The reply-to rides beside the brand rather than inside the RPC: the
    // RPC has already checked the actor and the expected version, and a
    // column write here keeps its signature stable.
    if (input.contactEmail !== undefined) {
      const { error: contactError } = await admin
        .from("workspaces")
        .update({ client_contact_email: input.contactEmail })
        .eq("id", input.workspaceId);
      if (contactError && !schemaObjectUnavailable(contactError, "client_contact_email")) {
        throw new HttpError(500, "BRANDING_UPDATE_FAILED", "The contact email could not be saved");
      }
    }
    const dto = workspacePresentationBrandingDto(data, input.workspaceId);
    return { ...dto, client_contact_email: input.contactEmail === undefined ? dto.client_contact_email : input.contactEmail };
  }
  if (!schemaObjectUnavailable(error, "set_workspace_client_brand_v1")) {
    rpcFailure(
      error,
      "BRANDING_UPDATE_FAILED",
      "Client-facing workspace branding could not be updated",
    );
  }

  const { error: auditError } = await admin.from("workspace_audit_log").insert({
    workspace_id: input.workspaceId,
    actor_user_id: input.actorUserId,
    action: "workspace.branding.client_identity_updated",
    entity_type: "workspace",
    entity_id: input.workspaceId,
    metadata: {
      client_brand_name: input.clientBrandName,
      primary_color: input.primaryColor,
      accent_color: input.accentColor,
    },
  });
  if (auditError) {
    throw new HttpError(
      500,
      "BRANDING_UPDATE_FAILED",
      "Client-facing workspace branding could not be updated",
    );
  }
  return loadWorkspaceBranding(admin, input.workspaceId);
}

async function removeWorkspaceLogoObject(
  admin: AdminClient,
  logoPath: string | null,
): Promise<void> {
  if (!logoPath) return;
  try {
    await admin.storage.from(WORKSPACE_LOGO_BUCKET).remove([logoPath]);
  } catch {
    // The database pointer is authoritative. A failed best-effort cleanup may
    // leave an unreferenced public presentation asset, never a tenant write.
  }
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
    membership.user_id !== null ||
    membership.provisioning_method !== "email_invite" ||
    membership.password_change_required
  ) {
    invalidRpcResponse();
  }
  return membership;
}

async function beginStaffPasswordAccount(
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
  const { data, error } = await admin.rpc(
    "begin_workspace_staff_password_account_v1",
    {
      p_workspace_id: input.workspaceId,
      p_email: input.email,
      p_full_name: input.fullName,
      p_role: input.role,
      p_actor_user_id: input.actorUserId,
      p_token_issued_at: input.tokenIssuedAt,
    },
  );
  if (error) {
    rpcFailure(
      error,
      "STAFF_PASSWORD_ACCOUNT_FAILED",
      "The workspace password account could not be created",
    );
  }
  const membership = provisioningMembership(data);
  if (
    membership.workspace_id !== input.workspaceId ||
    membership.email_normalized !== input.email ||
    membership.full_name !== input.fullName ||
    membership.role !== input.role ||
    membership.status !== "provisioning" ||
    membership.user_id !== null ||
    membership.provisioning_method !== "admin_temporary_password" ||
    membership.password_change_required
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
        membership.status !== "provisioning" ||
        membership.provisioning_method !== "email_invite" ||
        membership.password_change_required
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

async function claimStaffPasswordDelivery(
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
      "claim_workspace_staff_password_delivery_v1",
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
        membership.status !== "provisioning" ||
        membership.user_id !== null ||
        membership.provisioning_method !== "admin_temporary_password" ||
        membership.password_change_required
      ) {
        invalidRpcResponse();
      }
      return membership;
    }
    if (attempt === 1) {
      rpcFailure(
        error,
        "PASSWORD_DELIVERY_CLAIM_UNCERTAIN",
        "The temporary-password claim requires operator review",
      );
    }
  }
  throw new HttpError(
    503,
    "PASSWORD_DELIVERY_CLAIM_UNCERTAIN",
    "The temporary-password claim requires operator review",
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
        membership.status !== "invited" ||
        membership.provisioning_method !== "email_invite" ||
        membership.password_change_required
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

async function finalizeStaffPasswordAccount(
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
      "finalize_workspace_staff_password_account_v1",
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
        membership.status !== "invited" ||
        membership.provisioning_method !== "admin_temporary_password" ||
        !membership.password_change_required ||
        membership.invite_expires_at === null
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
    if (
      ["22023", "23505", "42501", "55000", "55P03", "P0002"].includes(
        error.code ?? "",
      )
    ) {
      if (sawTransportUncertainty) break;
      rpcFailure(
        error,
        "PASSWORD_FINALIZE_FAILED",
        "The temporary-password account could not be finalized",
      );
    }
    sawTransportUncertainty = true;
  }
  if (!sawTransportUncertainty && notReadyResponses === 2) return null;
  throw new HttpError(
    503,
    "PASSWORD_FINALIZE_UNCERTAIN",
    "The temporary-password result is uncertain and requires operator review",
  );
}

async function cancelStaffPasswordAccount(
  admin: AdminClient,
  input: {
    workspaceId: string;
    membershipId: string;
    actorUserId: string;
    tokenIssuedAt: number;
    lockToken: string;
  },
): Promise<void> {
  for (let attempt = 0; attempt < 2; attempt += 1) {
    const { data, error } = await admin.rpc(
      "cancel_workspace_staff_password_account_v1",
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
        membership.status !== "revoked" ||
        membership.user_id !== null ||
        membership.password_change_required
      ) {
        invalidRpcResponse();
      }
      return;
    }
    if (attempt === 1) {
      rpcFailure(
        error,
        "PASSWORD_ACCOUNT_CANCEL_UNCERTAIN",
        "The failed temporary-password account requires operator review",
      );
    }
  }
  throw new HttpError(
    503,
    "PASSWORD_ACCOUNT_CANCEL_UNCERTAIN",
    "The failed temporary-password account requires operator review",
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

function resetIdentityMarkersAreSafe(
  user: {
    app_metadata?: Record<string, unknown>;
    user_metadata?: Record<string, unknown>;
  },
  membership: InternalMembership,
): boolean {
  const appMetadata = user.app_metadata ?? {};
  const appMarkersMatch = markerMatches(appMetadata, membership);
  const appMarkersAreAbsent = appMetadata.workspace_id == null &&
    appMetadata.workspace_membership_id == null;
  return (appMarkersMatch || appMarkersAreAbsent) &&
    !markerContradicts(user.user_metadata, membership);
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

function exactTemporaryPasswordMetadata(
  metadata: Record<string, unknown> | undefined,
  membership: InternalMembership,
  lockToken: string,
): boolean {
  return markerMatches(metadata, membership) &&
    metadata?.workspace_provisioning_method === "admin_temporary_password" &&
    metadata?.workspace_password_change_required === true &&
    metadata?.workspace_credential_version === 1 &&
    metadata?.workspace_credential_attempt_id === lockToken &&
    metadata?.workspace_credential_execution_id === lockToken;
}

function passwordIdentityMatches(
  user: {
    email?: string;
    created_at?: string;
    confirmed_at?: string;
    last_sign_in_at?: string;
    app_metadata?: Record<string, unknown>;
  },
  membership: InternalMembership,
  lockToken: string,
): boolean {
  const createdAt = Date.parse(user.created_at ?? "");
  const membershipCreatedAt = Date.parse(membership.created_at);
  return user.email?.trim().toLowerCase() === membership.email_normalized &&
    Number.isFinite(createdAt) &&
    Number.isFinite(membershipCreatedAt) &&
    createdAt >= membershipCreatedAt - 60_000 &&
    !user.last_sign_in_at &&
    exactTemporaryPasswordMetadata(
      user.app_metadata,
      membership,
      lockToken,
    );
}

async function deleteExactTemporaryPasswordAuthUser(
  admin: AdminClient,
  authUserId: string,
  membership: InternalMembership,
  lockToken: string,
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
  if (!passwordIdentityMatches(data.user, membership, lockToken)) {
    throw new HttpError(
      409,
      "STAFF_IDENTITY_UNSAFE",
      "The workspace user identity requires operator review",
    );
  }
  await requireUnprotectedEmail(admin, membership.email_normalized);
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
        "This email already has a Get On A Pod account outside this workspace. Invite a different address, or contact support to move the account",
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

async function issueStaffTemporaryPassword(
  admin: AdminClient,
  input: {
    workspaceId: string;
    membershipId: string;
    actorUserId: string;
    tokenIssuedAt: number;
  },
): Promise<{ membership: InternalMembership; temporaryPassword: string }> {
  const lockToken = crypto.randomUUID();
  const claimInput = { ...input, lockToken };
  const membership = await claimStaffPasswordDelivery(admin, claimInput);

  try {
    await requireUnprotectedEmail(admin, membership.email_normalized);
  } catch (error) {
    await releaseInviteClaim(admin, membership.id, lockToken);
    throw error;
  }

  const temporaryPassword = generateTemporaryPassword();
  const { data, error: createError } = await admin.auth.admin.createUser({
    email: membership.email_normalized,
    password: temporaryPassword,
    email_confirm: true,
    user_metadata: {
      full_name: membership.full_name,
    },
    app_metadata: {
      workspace_id: membership.workspace_id,
      workspace_membership_id: membership.id,
      workspace_provisioning_method: "admin_temporary_password",
      workspace_password_change_required: true,
      workspace_credential_version: 1,
      workspace_credential_attempt_id: lockToken,
      workspace_credential_execution_id: lockToken,
    },
  });

  if (createError || !data.user) {
    const accountExists =
      (createError as { code?: string } | null)?.code === "email_exists" ||
      createError?.message.toLowerCase().includes("registered") === true;
    const markedUserId = await findStaffInviteAuthUser(admin, claimInput);
    if (markedUserId) {
      await deleteExactTemporaryPasswordAuthUser(
        admin,
        markedUserId,
        membership,
        lockToken,
      );
      await releaseInviteClaim(admin, membership.id, lockToken);
      throw new HttpError(
        503,
        "PASSWORD_CREATE_RETRY_REQUIRED",
        "Password creation was safely rolled back; generate a new password",
      );
    }
    if (accountExists) {
      await cancelStaffPasswordAccount(admin, claimInput);
      throw new HttpError(
        409,
        "AUTH_ACCOUNT_EXISTS",
        "This email already has a Get On A Pod account outside this workspace. Invite a different address, or contact support to move the account",
      );
    }
    await releaseInviteClaim(admin, membership.id, lockToken);
    throw new HttpError(
      503,
      "PASSWORD_CREATE_RETRY_REQUIRED",
      "Password creation did not complete; generate a new password",
    );
  }

  if (!passwordIdentityMatches(data.user, membership, lockToken)) {
    // Every other failure branch releases the delivery claim before it
    // throws; this one used to abandon it, leaving the membership stuck in
    // provisioning and blocking every retry with AUTH_ACCOUNT_EXISTS. The
    // auth account is deliberately NOT deleted — identity did not match, so
    // we cannot prove we created it, and deleting an account we do not own
    // would be worse than leaving it for operator review.
    await releaseInviteClaim(admin, membership.id, lockToken);
    throw new HttpError(
      409,
      "STAFF_IDENTITY_UNSAFE",
      "The workspace user identity requires operator review",
    );
  }

  let finalized: InternalMembership | null = null;
  let finalizationError: HttpError | null = null;
  try {
    finalized = await finalizeStaffPasswordAccount(admin, {
      ...claimInput,
      authUserId: data.user.id,
    });
  } catch (error) {
    if (!(error instanceof HttpError)) throw error;
    if (
      error.code === "PASSWORD_FINALIZE_UNCERTAIN" ||
      error.code === "STAFF_RECONCILIATION_PENDING" ||
      error.code === "STAFF_IDENTITY_UNSAFE"
    ) {
      throw error;
    }
    finalizationError = error;
  }
  if (finalized) return { membership: finalized, temporaryPassword };

  await deleteExactTemporaryPasswordAuthUser(
    admin,
    data.user.id,
    membership,
    lockToken,
  );
  await releaseInviteClaim(admin, membership.id, lockToken);
  if (finalizationError) throw finalizationError;
  throw new HttpError(
    503,
    "PASSWORD_CREATE_RETRY_REQUIRED",
    "Password creation was safely rolled back; generate a new password",
  );
}

function staffPasswordResetClaim(value: unknown): StaffPasswordResetClaim {
  const row = responseRecord(value);
  return {
    membership: internalMembership(row.membership),
    attemptId: responseUuid(row.attempt_id),
    executionId: responseUuid(row.execution_id),
  };
}

async function claimStaffPasswordReset(
  admin: AdminClient,
  input: {
    workspaceId: string;
    membershipId: string;
    actorUserId: string;
    tokenIssuedAt: number;
    attemptId: string;
    executionId: string;
  },
): Promise<StaffPasswordResetClaim> {
  const { data, error } = await admin.rpc(
    "claim_workspace_staff_password_reset_v1",
    {
      p_workspace_id: input.workspaceId,
      p_membership_id: input.membershipId,
      p_actor_user_id: input.actorUserId,
      p_token_issued_at: input.tokenIssuedAt,
      p_attempt_id: input.attemptId,
      p_execution_id: input.executionId,
    },
  );
  if (error) {
    rpcFailure(
      error,
      "STAFF_PASSWORD_RESET_FAILED",
      "The workspace user password could not be reset",
    );
  }
  const claim = staffPasswordResetClaim(data);
  if (
    claim.membership.id !== input.membershipId ||
    claim.membership.workspace_id !== input.workspaceId ||
    claim.membership.status !== "invited" ||
    claim.membership.provisioning_method !== "admin_temporary_password" ||
    !claim.membership.password_change_required ||
    claim.attemptId !== input.attemptId ||
    claim.executionId !== input.executionId
  ) {
    invalidRpcResponse();
  }
  return claim;
}

async function cancelStaffPasswordReset(
  admin: AdminClient,
  input: {
    workspaceId: string;
    membershipId: string;
    actorUserId: string;
    tokenIssuedAt: number;
    attemptId: string;
    executionId: string;
  },
): Promise<void> {
  const { data, error } = await admin.rpc(
    "cancel_workspace_staff_password_reset_v1",
    {
      p_workspace_id: input.workspaceId,
      p_membership_id: input.membershipId,
      p_actor_user_id: input.actorUserId,
      p_token_issued_at: input.tokenIssuedAt,
      p_attempt_id: input.attemptId,
      p_execution_id: input.executionId,
    },
  );
  if (error) {
    throw new HttpError(
      503,
      "STAFF_PASSWORD_RECONCILIATION_REQUIRED",
      "The workspace user password reset requires operator review",
    );
  }
  const restored = internalMembership(data);
  if (
    restored.id !== input.membershipId ||
    restored.workspace_id !== input.workspaceId
  ) {
    invalidRpcResponse();
  }
}

async function failStaffPasswordResetBeforeProvider(
  admin: AdminClient,
  input: {
    workspaceId: string;
    membershipId: string;
    actorUserId: string;
    tokenIssuedAt: number;
    attemptId: string;
    executionId: string;
  },
  error: HttpError,
): Promise<never> {
  await cancelStaffPasswordReset(admin, input);
  throw error;
}

function resetCredentialVersion(value: unknown): number {
  if (value === undefined || value === null) return 0;
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 1) {
    throw new HttpError(
      409,
      "CREDENTIAL_STATE_INVALID",
      "The workspace user credential state requires operator review",
    );
  }
  return value;
}

function exactStaffPasswordResetMetadata(
  metadata: Record<string, unknown> | undefined,
  membership: InternalMembership,
  attemptId: string,
  executionId: string,
  credentialVersion: number,
): boolean {
  return markerMatches(metadata, membership) &&
    metadata?.workspace_provisioning_method === "admin_temporary_password" &&
    metadata?.workspace_password_change_required === true &&
    metadata?.workspace_credential_version === credentialVersion &&
    metadata?.workspace_credential_attempt_id === attemptId &&
    metadata?.workspace_credential_execution_id === executionId;
}

async function resetStaffTemporaryPassword(
  admin: AdminClient,
  input: {
    workspaceId: string;
    membershipId: string;
    actorUserId: string;
    tokenIssuedAt: number;
  },
): Promise<{ membership: InternalMembership; temporaryPassword: string }> {
  const resetInput = {
    ...input,
    attemptId: crypto.randomUUID(),
    executionId: crypto.randomUUID(),
  };
  const claim = await claimStaffPasswordReset(admin, resetInput);
  const membership = claim.membership;

  try {
    await requireUnprotectedEmail(admin, membership.email_normalized);
  } catch (error) {
    return await failStaffPasswordResetBeforeProvider(
      admin,
      resetInput,
      error instanceof HttpError
        ? error
        : new HttpError(
          503,
          "ACCOUNT_PROTECTION_UNAVAILABLE",
          "The account protection check is unavailable",
        ),
    );
  }

  if (!membership.user_id) {
    return await failStaffPasswordResetBeforeProvider(
      admin,
      resetInput,
      new HttpError(
        409,
        "STAFF_IDENTITY_UNSAFE",
        "The workspace user identity requires operator review",
      ),
    );
  }

  const currentResult = await admin.auth.admin.getUserById(membership.user_id);
  const currentUser = currentResult.data.user;
  if (currentResult.error || !currentUser) {
    return await failStaffPasswordResetBeforeProvider(
      admin,
      resetInput,
      new HttpError(
        503,
        "STAFF_PASSWORD_RESET_RETRY_REQUIRED",
        "The workspace user password could not be verified. Try again",
      ),
    );
  }
  if (
    currentUser.email?.trim().toLowerCase() !== membership.email_normalized ||
    !resetIdentityMarkersAreSafe(currentUser, membership)
  ) {
    return await failStaffPasswordResetBeforeProvider(
      admin,
      resetInput,
      new HttpError(
        409,
        "STAFF_IDENTITY_UNSAFE",
        "The workspace user identity requires operator review",
      ),
    );
  }

  let nextVersion: number;
  try {
    nextVersion = resetCredentialVersion(
      currentUser.app_metadata?.workspace_credential_version,
    ) + 1;
    if (!Number.isSafeInteger(nextVersion)) throw new Error("version overflow");
  } catch {
    return await failStaffPasswordResetBeforeProvider(
      admin,
      resetInput,
      new HttpError(
        409,
        "CREDENTIAL_STATE_INVALID",
        "The workspace user credential state requires operator review",
      ),
    );
  }

  const temporaryPassword = generateTemporaryPassword();
  const nextMetadata = {
    ...currentUser.app_metadata,
    workspace_id: membership.workspace_id,
    workspace_membership_id: membership.id,
    workspace_provisioning_method: "admin_temporary_password",
    workspace_password_change_required: true,
    workspace_credential_version: nextVersion,
    workspace_credential_attempt_id: claim.attemptId,
    workspace_credential_execution_id: claim.executionId,
  };
  const updatedResult = await admin.auth.admin.updateUserById(
    membership.user_id,
    { password: temporaryPassword, app_metadata: nextMetadata },
  );
  let updatedUser = updatedResult.data.user;
  if (updatedResult.error || !updatedUser) {
    const reconciled = await admin.auth.admin.getUserById(membership.user_id);
    updatedUser = reconciled.data.user;
  }

  if (
    !updatedUser ||
    updatedUser.email?.trim().toLowerCase() !== membership.email_normalized ||
    !exactStaffPasswordResetMetadata(
      updatedUser.app_metadata,
      membership,
      claim.attemptId,
      claim.executionId,
      nextVersion,
    )
  ) {
    return await failStaffPasswordResetBeforeProvider(
      admin,
      resetInput,
      new HttpError(
        503,
        "STAFF_PASSWORD_RESET_RETRY_REQUIRED",
        "The workspace user password was not changed. Try again",
      ),
    );
  }

  const { data, error } = await admin.rpc(
    "complete_workspace_staff_password_reset_v1",
    {
      p_workspace_id: input.workspaceId,
      p_membership_id: input.membershipId,
      p_actor_user_id: input.actorUserId,
      p_token_issued_at: input.tokenIssuedAt,
      p_attempt_id: claim.attemptId,
      p_execution_id: claim.executionId,
      p_credential_version: nextVersion,
    },
  );
  if (error) {
    throw new HttpError(
      503,
      "STAFF_PASSWORD_RECONCILIATION_REQUIRED",
      "The password changed, but workspace access requires operator review",
    );
  }
  const completed = internalMembership(data);
  if (
    completed.id !== input.membershipId ||
    completed.workspace_id !== input.workspaceId ||
    completed.status !== "invited" ||
    completed.provisioning_method !== "admin_temporary_password" ||
    !completed.password_change_required
  ) {
    invalidRpcResponse();
  }

  return { membership: completed, temporaryPassword };
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

    // Authenticate BEFORE buffering the body: this function accepts up to a
    // 2.9 MB logo/avatar payload, and parsing it ahead of the token let an
    // unauthenticated caller make the isolate buffer and JSON.parse megabytes
    // per request.
    const authContext = await requireAuthenticatedUser(req);
    if (!workspaceCredentialIsFresh(authContext)) {
      throw new HttpError(
        401,
        "REAUTHENTICATION_REQUIRED",
        "Your sign-in is out of date. Sign out and sign in again to continue",
      );
    }
    const body = await parseJsonObject(req, MAX_WORKSPACE_LOGO_REQUEST_BYTES);
    const action = typeof body.action === "string" ? body.action : "";
    const { admin, platformAdmin, tokenIssuedAt, user } = authContext;
    const workspaceId = requireUuid(body.workspace_id, "workspace_id");

    if (action === "list") {
      requireOnlyKeys(body, ["action", "workspace_id"]);
      const result = await listWorkspaceSettings(
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

    if (["credits-grant", "credits-adjust", "billing-allowance-set", "billing-autorefill-set"].includes(action)) {
      throw new HttpError(410, "CREDIT_BILLING_RETIRED", "Credit billing has ended. Historical transactions remain available in the ledger.");
    }

    if (action === "legacy-credit-review-queue") {
      requireOnlyKeys(body, ["action", "workspace_id"]);
      if (!platformAdmin) throw new HttpError(403, "PLATFORM_ADMIN_REQUIRED", "Platform administrator access is required");
      const { data, error } = await admin.from("workspace_credit_reviews")
        .select("workspace_id,status,requested_at,purchased_remaining_at_request,resolution_note,updated_at,workspace:workspaces(name)")
        .neq("status", "resolved").order("requested_at").limit(500);
      if (error) throw new HttpError(503, "CREDIT_REVIEW_UNAVAILABLE", "Review requests could not be loaded");
      return jsonResponse(req, METHODS, 200, { success: true, requests: (data ?? []).map((row) => ({
        ...row, workspace_name: (row.workspace as unknown as { name?: string } | null)?.name ?? "Workspace", workspace: undefined,
      })) });
    }

    if (["legacy-credit-overview", "legacy-credit-review-request", "legacy-credit-review-update"].includes(action)) {
      requireOnlyKeys(body, action === "legacy-credit-review-update"
        ? ["action", "workspace_id", "status", "resolution_note"] : ["action", "workspace_id"]);
      const access = await requireWorkspaceFeatureAccess(authContext, workspaceId, { billingRecovery: true });
      if (!["owner", "admin", "platform_admin"].includes(access.role)) {
        throw new HttpError(403, "WORKSPACE_ACCESS_REQUIRED", "Workspace manager access is required");
      }
      if (action === "legacy-credit-review-update" && !platformAdmin) {
        throw new HttpError(403, "PLATFORM_ADMIN_REQUIRED", "Only platform administrators can record a settlement review");
      }
      // Aggregate inside one SQL snapshot: neither pagination limits nor a
      // concurrent historical payment/refund can produce a partial balance.
      const { data: balance, error: balanceError } = await admin.rpc("workspace_purchased_credit_balance_v1", { p_workspace_id: workspaceId });
      const remaining = Number(balance);
      if (balanceError || !Number.isSafeInteger(remaining) || remaining < 0 || balance === null) {
        throw new HttpError(503, "CREDIT_HISTORY_UNAVAILABLE", "Your historical purchased balance could not be loaded");
      }
      if (action === "legacy-credit-review-request") {
        if (remaining <= 0) throw new HttpError(409, "NO_PURCHASED_BALANCE", "There is no remaining purchased balance to review");
        // One request per workspace. Retries never reset a completed review or
        // overwrite its outcome. Financial adjustments occur separately in Stripe.
        const { data: inserted, error } = await admin.from("workspace_credit_reviews").upsert({
          workspace_id: workspaceId, requested_by: user.id, purchased_remaining_at_request: remaining,
        }, { onConflict: "workspace_id", ignoreDuplicates: true }).select("workspace_id");
        if (error) throw new HttpError(503, "CREDIT_REVIEW_UNAVAILABLE", "Your review request could not be saved. Try again");
        if (inserted?.length) await writeAudit(admin, {
          workspaceId, actorUserId: user.id, action: "billing.credit_review_requested",
          entityType: "workspace_billing_profile", entityId: workspaceId,
          metadata: { purchased_remaining: remaining },
        });
      }
      if (action === "legacy-credit-review-update") {
        const status = requireString(body.status, "status", { max: 20 });
        if (!["reviewing", "resolved"].includes(status)) throw new HttpError(400, "INVALID_STATUS", "Choose reviewing or resolved");
        const note = status === "resolved" ? requireString(body.resolution_note, "resolution_note", { min: 10, max: 1000 }) : null;
        const { data: updated, error } = await admin.from("workspace_credit_reviews").update({
          status, resolution_note: note, updated_by: user.id, updated_at: new Date().toISOString(),
        }).eq("workspace_id", workspaceId).neq("status", "resolved").select("workspace_id");
        if (error) throw new HttpError(503, "CREDIT_REVIEW_UNAVAILABLE", "The review could not be updated");
        if (!updated?.length) throw new HttpError(409, "CREDIT_REVIEW_UNCHANGED", "This review was already completed or no request exists. Refresh to see its status");
        await writeAudit(admin, {
          workspaceId, actorUserId: user.id, action: "billing.credit_review_updated",
          entityType: "workspace_billing_profile", entityId: workspaceId,
          metadata: { status, resolution_note: note },
        });
      }
      const { data: review, error: reviewError } = await admin.from("workspace_credit_reviews")
        .select("status,requested_at,purchased_remaining_at_request,resolution_note,updated_at")
        .eq("workspace_id", workspaceId).maybeSingle();
      if (reviewError) throw new HttpError(503, "CREDIT_REVIEW_UNAVAILABLE", "Your review status could not be loaded");
      return jsonResponse(req, METHODS, 200, { success: true, purchased_remaining: remaining, review });
    }

    if (action === "subscription-overview") {
      requireOnlyKeys(body, ["action", "workspace_id"]);
      const access = await requireWorkspaceFeatureAccess(authContext, workspaceId, { billingRecovery: true });
      if (!["owner", "admin", "platform_admin"].includes(access.role)) {
        throw new HttpError(403, "WORKSPACE_ACCESS_REQUIRED", "Workspace manager access is required");
      }
      const [profileResult, workspaceResult, plansResult] = await Promise.all([
        admin.from("workspace_billing_profiles")
          .select("plan_key,billing_status,stripe_customer_id,stripe_subscription_id,cancel_at_period_end,current_period_end,trial_ends_at")
          .eq("workspace_id", workspaceId).maybeSingle(),
        admin.from("workspaces").select("created_at").eq("id", workspaceId).maybeSingle(),
        admin.from("billing_plans").select("plan_key,base_price_cents,is_purchasable"),
      ]);
      if (profileResult.error || workspaceResult.error || plansResult.error || !workspaceResult.data) {
        throw new HttpError(503, "BILLING_UNAVAILABLE", "Your subscription could not be loaded");
      }
      const profile = profileResult.data;
      const subscribed = Boolean(profile?.stripe_subscription_id);
      // Unsubscribed legacy profiles buy the single current plan, not the retired offer.
      const planKey = subscribed || profile?.billing_status === "comped" ? profile!.plan_key : "standard";
      const plan = (plansResult.data ?? []).find((row) => row.plan_key === planKey);
      const actualPrice = subscribed ? await stripeSubscriptionPriceCents(profile!.stripe_subscription_id!) : null;
      return jsonResponse(req, METHODS, 200, {
        success: true,
        billing: {
          plan_key: planKey,
          billing_status: profile?.billing_status ?? "trialing",
          has_subscription: subscribed,
          has_billing_customer: Boolean(profile?.stripe_customer_id),
          subscription_price_cents: actualPrice,
          plan_base_price_cents: plan?.base_price_cents ?? null,
          cancel_at_period_end: profile?.cancel_at_period_end === true,
          current_period_end: profile?.current_period_end ?? null,
          trial_ends_at: effectiveTrialEndsAt(profile?.trial_ends_at, workspaceResult.data.created_at),
        },
      });
    }

    if (action === "billing-overview") {
      requireOnlyKeys(body, ["action", "workspace_id"]);
      const access = await requireWorkspaceFeatureAccess(authContext, workspaceId, { billingRecovery: true });
      if (!["owner", "admin", "platform_admin"].includes(access.role)) {
        throw new HttpError(403, "WORKSPACE_ACCESS_REQUIRED", "Workspace manager access is required");
      }

      const monthStart = new Date();
      monthStart.setUTCDate(1);
      monthStart.setUTCHours(0, 0, 0, 0);

      const [profileResult, lotsResult, ledgerResult, spentResult, usageResult, pricesResult, cardProofResult, workspaceRowResult, plansResult] = await Promise.all([
        admin.from("workspace_billing_profiles")
          .select("plan_key, billing_status, base_price_cents, per_client_price_cents, included_active_clients, monthly_credit_allowance, stripe_subscription_id, stripe_customer_id, cancel_at_period_end, current_period_end, trial_ends_at, refill_threshold_credits, refill_pack_credits, refill_monthly_cap_cents, refill_failure_count, refill_last_error, refill_last_failed_at")
          .eq("workspace_id", workspaceId)
          .maybeSingle(),
        admin.from("workspace_credit_lots")
          .select("remaining, expires_at, source")
          .eq("workspace_id", workspaceId)
          .gt("remaining", 0),
        admin.from("workspace_credit_ledger")
          .select("id, entry_type, amount, operation_type, reference_kind, reference_id, created_at")
          .eq("workspace_id", workspaceId)
          .order("created_at", { ascending: false })
          // Enough to pair each failed run's refund with its charge and still
          // fill a page once the pairs are folded together.
          .limit(50),
        // What was actually taken this month. Multiplying run counts by today's
        // price is only right while the price has never moved: the ledger holds
        // the amount charged at the time, and a mid-month price change made the
        // total on the page disagree with the balance underneath it.
        admin.from("workspace_credit_ledger")
          .select("amount, entry_type, operation_type")
          .eq("workspace_id", workspaceId)
          .in("entry_type", ["debit", "refund"])
          .gte("created_at", monthStart.toISOString())
          .limit(10000),
        admin.from("workspace_operation_costs")
          .select("operation_type, used_byo_key")
          .eq("workspace_id", workspaceId)
          .gte("created_at", monthStart.toISOString())
          .limit(5000),
        admin.from("operation_credit_costs")
          .select("operation_type, credit_cost, effective_from")
          .lte("effective_from", new Date().toISOString())
          .order("effective_from", { ascending: false }),
        // Fallback proof a card was saved, used only when Stripe cannot be
        // asked: a lot bought by a real payment. Any stripe:… ledger key used
        // to count, but free checkouts and refund or dispute reversals carry
        // that key too, with no card behind them. A free checkout records no
        // payment reference, and a reversal creates no lot.
        admin.from("workspace_credit_lots")
          .select("id")
          .eq("workspace_id", workspaceId)
          .eq("source", "purchase")
          .not("stripe_payment_ref", "is", null)
          .limit(1)
          .maybeSingle(),
        // The trial runs from the workspace's creation when no end is set.
        admin.from("workspaces")
          .select("created_at")
          .eq("id", workspaceId)
          .maybeSingle(),
        // What the plan costs and grants today: the price shown when there is
        // no subscription to ask Stripe about, and the default an allowance
        // override is measured against.
        admin.from("billing_plans")
          .select("plan_key, base_price_cents, monthly_credit_allowance"),
      ]);
      // All six reads, not four: a failed profile read used to serve the
      // fallback identity — trial plan, default allowance, no saved card — as
      // if it were real, and a failed spent read served "used this month: 0".
      if (
        profileResult.error || lotsResult.error || ledgerResult.error
        || spentResult.error || usageResult.error || pricesResult.error
        || workspaceRowResult.error || plansResult.error
      ) {
        throw new HttpError(503, "BILLING_UNAVAILABLE", "Billing data is temporarily unavailable");
      }

      // Stripe itself is the authority on whether a card is saved: the same
      // question the refill tick asks before it charges. The ledger proof is
      // only the fallback for when Stripe is not configured or not answering.
      const customerIdForCard = typeof profileResult.data?.stripe_customer_id === "string"
        ? profileResult.data.stripe_customer_id
        : "";
      let hasSavedCard = false;
      if (customerIdForCard) {
        const stripeAnswer = await stripeHasSavedCard(customerIdForCard);
        hasSavedCard = stripeAnswer === null ? Boolean(cardProofResult.data) : stripeAnswer;
      }

      const planKey = profileResult.data?.plan_key ?? "standard";
      const plan = (plansResult.data ?? []).find((row) => row.plan_key === planKey);
      const subscriptionId = typeof profileResult.data?.stripe_subscription_id === "string"
        ? profileResult.data.stripe_subscription_id
        : "";
      const subscriptionPriceCents = subscriptionId
        ? await stripeSubscriptionPriceCents(subscriptionId)
        : null;

      const now = Date.now();
      const activeLots = (lotsResult.data ?? []).filter((lot) =>
        !lot.expires_at || Date.parse(String(lot.expires_at)) > now
      );
      const balance = activeLots.reduce((sum, lot) => sum + (Number(lot.remaining) || 0), 0);
      const expiringLots = activeLots
        .filter((lot) => lot.expires_at)
        .sort((left, right) => String(left.expires_at).localeCompare(String(right.expires_at)));
      const usageByType: Record<string, { total: number; byo: number }> = {};
      for (const row of usageResult.data ?? []) {
        const key = String(row.operation_type);
        usageByType[key] = usageByType[key] ?? { total: 0, byo: 0 };
        usageByType[key].total += 1;
        if (row.used_byo_key === true) usageByType[key].byo += 1;
      }
      // The usage table's credits, from the same ledger rows as the meter, so
      // the two can never disagree. Pricing run counts instead charged a run
      // that failed and was refunded, and the table out-totalled the meter.
      const ledgerUsage: Record<string, { credits: number; refunds: number }> = {};
      for (const row of spentResult.data ?? []) {
        const key = typeof row.operation_type === "string" && row.operation_type ? row.operation_type : "other";
        ledgerUsage[key] = ledgerUsage[key] ?? { credits: 0, refunds: 0 };
        const amount = Math.abs(Number(row.amount) || 0);
        if (row.entry_type === "debit") {
          ledgerUsage[key].credits += amount;
        } else {
          ledgerUsage[key].credits -= amount;
          ledgerUsage[key].refunds += 1;
        }
      }
      for (const usage of Object.values(ledgerUsage)) usage.credits = Math.max(0, usage.credits);
      // Only the lots on the earliest date: summing every expiring lot under
      // that date said all of them lapse at once.
      const nextExpiryAt = expiringLots[0]?.expires_at ?? null;
      const nextExpiryDay = nextExpiryAt ? String(nextExpiryAt).slice(0, 10) : null;
      const expiringNext = expiringLots
        .filter((lot) => String(lot.expires_at).slice(0, 10) === nextExpiryDay)
        .reduce((sum, lot) => sum + (Number(lot.remaining) || 0), 0);
      // Allowances are granted on the 1st of each UTC month (see
      // grant_monthly_allowances_v1), whatever the subscription's own period.
      const allowanceStatus = profileResult.data?.billing_status ?? "trialing";
      const nextMonthStart = new Date(monthStart);
      nextMonthStart.setUTCMonth(nextMonthStart.getUTCMonth() + 1);
      const nextAllowanceAt = ["trialing", "active", "comped"].includes(String(allowanceStatus))
        && (0) > 0
        ? nextMonthStart.toISOString()
        : null;
      const currentPrices: Record<string, number> = {};
      for (const row of pricesResult.data ?? []) {
        const key = String(row.operation_type);
        if (!(key in currentPrices)) currentPrices[key] = Number(row.credit_cost) || 0;
      }

      return jsonResponse(req, METHODS, 200, {
        success: true,
        billing: {
          plan_key: planKey,
          billing_status: profileResult.data?.billing_status ?? "trialing",
          base_price_cents: profileResult.data?.base_price_cents ?? 9900,
          // What this workspace pays: Stripe's answer when it has a
          // subscription, null otherwise. Compared against plan_base_price_cents
          // to tell a grandfathered price from the current one.
          subscription_price_cents: subscriptionPriceCents,
          plan_base_price_cents: typeof plan?.base_price_cents === "number" ? plan.base_price_cents : null,
          plan_monthly_credit_allowance: typeof plan?.monthly_credit_allowance === "number"
            ? plan.monthly_credit_allowance
            : null,
          trial_ends_at: effectiveTrialEndsAt(
            profileResult.data?.trial_ends_at,
            workspaceRowResult.data?.created_at,
          ),
          per_client_price_cents: profileResult.data?.per_client_price_cents ?? 3900,
          // 3 to match workspace_client_operation_v2, which is what actually
          // enforces it when a workspace has no billing profile yet.
          included_active_clients: profileResult.data?.included_active_clients ?? 3,
          monthly_credit_allowance: 0,
          enforcement_enabled: false,
          // Debits net of refunds. Summing every negative row counted an
          // admin removing mistaken credits, and an allowance lapsing, as the
          // workspace "using" credits — an adjustment could flip the usage bar
          // red without one operation running. Clamped: a refund of last
          // month's debit is not negative usage this month.
          credits_spent_this_month: Math.max(0, (spentResult.data ?? [])
            .reduce((sum, row) => (
              row.entry_type === "debit"
                ? sum + Math.abs(Number(row.amount) || 0)
                : sum - Math.abs(Number(row.amount) || 0)
            ), 0)),
          // Whether there is a subscription to manage, not which one. The id
          // itself is a Stripe identifier and the browser has no use for it.
          has_billing_customer: Boolean(profileResult.data?.stripe_customer_id),
          has_subscription: typeof profileResult.data?.stripe_subscription_id === "string"
            && profileResult.data.stripe_subscription_id.length > 0,
          // Only to a platform admin, and only so the dashboard can be opened
          // on the right customer. Useless without a Stripe login, and never
          // sent to the workspace's own people.
          stripe_customer_id: platformAdmin
            ? (profileResult.data?.stripe_customer_id ?? null)
            : null,
          // A subscription cancelled from the portal stays active until the
          // period ends, so the status alone cannot show that it is ending.
          refill_threshold_credits: profileResult.data?.refill_threshold_credits ?? null,
          refill_pack_credits: profileResult.data?.refill_pack_credits ?? null,
          refill_monthly_cap_cents: profileResult.data?.refill_monthly_cap_cents ?? null,
          // Consecutive automatic top-up failures; the tick pauses at 3 until
          // the settings are saved again.
          refill_failure_count: Number(profileResult.data?.refill_failure_count) || 0,
          refill_last_error: profileResult.data?.refill_last_error ?? null,
          refill_last_failed_at: profileResult.data?.refill_last_failed_at ?? null,
          // Whether there is anything to charge. A Stripe customer row is
          // created the moment a checkout session opens — before any payment —
          // so "has a customer" was true for anyone who clicked Buy and then
          // cancelled, and auto top-ups were offered with nothing saved to
          // charge. A completed purchase is the event that saves a card, and
          // the webhook grant is its receipt.
          has_saved_card: hasSavedCard,
          cancel_at_period_end: profileResult.data?.cancel_at_period_end === true,
          current_period_end: profileResult.data?.current_period_end ?? null,
          balance,
          expiring_credits: expiringLots.reduce((sum, lot) => sum + (Number(lot.remaining) || 0), 0),
          // The balance by the day it lapses, soonest first, then what never
          // does: "120 expire Nov 30, 80 never expire".
          balance_by_expiry: (() => {
            const byDay = new Map<string | null, number>();
            for (const lot of activeLots) {
              const day = lot.expires_at ? String(lot.expires_at).slice(0, 10) : null;
              byDay.set(day, (byDay.get(day) ?? 0) + (Number(lot.remaining) || 0));
            }
            return [...byDay.entries()]
              .filter(([, credits]) => credits > 0)
              .sort(([left], [right]) => (left === null ? 1 : right === null ? -1 : left.localeCompare(right)))
              .map(([expiresOn, credits]) => ({ expires_on: expiresOn, credits }));
          })(),
          next_expiry_at: nextExpiryAt,
          expiring_next_credits: expiringNext,
          // Lots with no expiry: purchases, and anything granted to keep.
          purchased_credits: activeLots
            .filter((lot) => !lot.expires_at)
            .reduce((sum, lot) => sum + (Number(lot.remaining) || 0), 0),
          next_allowance_at: nextAllowanceAt,
          usage_this_month: usageByType,
          ledger_usage_this_month: ledgerUsage,
          prices: currentPrices,
          recent_activity: (ledgerResult.data ?? []).map((entry) => ({
            id: entry.id,
            entry_type: entry.entry_type,
            amount: entry.amount,
            operation_type: entry.operation_type,
            reference_kind: entry.reference_kind,
            // For a refund, the debit it reverses, so the page can pair them.
            reference_id: entry.reference_kind === "refund_of" ? entry.reference_id : null,
            created_at: entry.created_at,
          })),
        },
      });
    }

    if (action === "credits-grant") {
      requireOnlyKeys(body, ["action", "workspace_id", "amount", "reason", "note", "grant_key"]);
      await requireWorkspaceFeatureAccess(authContext, workspaceId, { billingRecovery: true });
      if (!platformAdmin) {
        throw new HttpError(403, "PLATFORM_ADMIN_REQUIRED", "Platform administrator access is required");
      }
      const amount = typeof body.amount === "number" && Number.isSafeInteger(body.amount)
        ? body.amount
        : NaN;
      if (!Number.isSafeInteger(amount) || amount < 1 || amount > 10_000) {
        throw new HttpError(400, "INVALID_AMOUNT", "Grant between 1 and 10,000 credits");
      }
      const reason = requireString(body.reason, "reason", { max: 60 });
      // The note is optional: the reason is what the ledger entry is filed
      // under, and requiring a written justification for every top-up bought
      // nothing the audit row does not already carry.
      const note = requireString(body.note, "note", { min: 0, max: 500 });
      const grantKey = requireUuid(body.grant_key, "grant_key");

      const { data, error } = await admin.rpc("grant_workspace_credits_v1", {
        p_workspace_id: workspaceId,
        p_source: "admin_grant",
        p_amount: amount,
        p_reference_kind: reason,
        p_reference_id: grantKey,
        p_actor_user_id: user.id,
        p_idempotency_key: `admin-grant:${grantKey}`,
      });
      if (error) {
        throw new HttpError(503, "CREDIT_GRANT_FAILED", "The credit grant could not be recorded");
      }
      const result = data as { balance?: number; idempotent?: boolean } | null;
      // The credits are already in the ledger. Failing the request because the
      // log row would not insert tells an operator the grant did not happen,
      // and the obvious response to that is to grant again.
      await writeAudit(admin, {
        workspaceId,
        actorUserId: user.id,
        action: "workspace.credits.granted",
        entityType: "workspace",
        entityId: workspaceId,
        metadata: { amount, reason, note, grant_key: grantKey },
      });
      return jsonResponse(req, METHODS, 200, {
        success: true,
        granted: amount,
        balance: typeof result?.balance === "number" ? result.balance : null,
        idempotent: result?.idempotent === true,
      });
    }

    if (action === "billing-autorefill-set") {
      requireOnlyKeys(body, ["action", "workspace_id", "threshold_credits", "pack_credits", "monthly_cap_cents"]);
      const refillAccess = await requireWorkspaceFeatureAccess(authContext, workspaceId, { billingRecovery: true });
      // The workspace's own managers, not only a platform admin: this is their
      // card and their decision.
      if (!["owner", "admin", "platform_admin"].includes(refillAccess.role)) {
        throw new HttpError(403, "WORKSPACE_ACCESS_REQUIRED", "Workspace manager access is required");
      }

      const off = body.threshold_credits === null && body.pack_credits === null;
      // A monthly spending ceiling in cents; null (or absent) means no cap.
      // Only sent when the caller is changing it, so an omitted key leaves the
      // stored cap untouched. $100,000 is a generous upper bound against typos.
      const hasCap = "monthly_cap_cents" in body;
      let capCents: number | null = null;
      if (hasCap && body.monthly_cap_cents !== null) {
        if (
          typeof body.monthly_cap_cents !== "number"
          || !Number.isSafeInteger(body.monthly_cap_cents)
          || body.monthly_cap_cents < 0
          || body.monthly_cap_cents > 10_000_000
        ) {
          throw new HttpError(400, "INVALID_CAP", "Choose a monthly cap between $0 and $100,000, or no limit");
        }
        capCents = body.monthly_cap_cents;
      }
      if (!off) {
        const threshold = typeof body.threshold_credits === "number"
            && Number.isSafeInteger(body.threshold_credits)
          ? body.threshold_credits
          : NaN;
        const packCredits = typeof body.pack_credits === "number"
            && Number.isSafeInteger(body.pack_credits)
          ? body.pack_credits
          : NaN;
        if (!Number.isSafeInteger(threshold) || threshold < 0 || threshold > 100_000) {
          throw new HttpError(400, "INVALID_THRESHOLD", "Choose a threshold between 0 and 100,000 credits");
        }
        // Only a pack that is actually sold: an arbitrary number has no price,
        // and inventing one would charge a figure nobody agreed.
        if (!Object.values(CREDIT_PACKS).some((pack) => pack.credits === packCredits)) {
          throw new HttpError(400, "INVALID_PACK", "Choose one of the credit packs on sale");
        }
      }

      // Both together or neither, matching the constraint on the table: half a
      // rule is a rule that cannot fire.
      const { error: refillError } = await admin
        .from("workspace_billing_profiles")
        .upsert({
          workspace_id: workspaceId,
          refill_threshold_credits: off ? null : body.threshold_credits,
          refill_pack_credits: off ? null : body.pack_credits,
          // Disabling clears the cap; enabling writes it when supplied and
          // leaves it as-is otherwise (absent key => no change).
          ...(off ? { refill_monthly_cap_cents: null } : hasCap ? { refill_monthly_cap_cents: capCents } : {}),
          // Saving is the person's answer to a pause: the run of failures
          // starts again from nothing, so the next tick tries once more.
          refill_failure_count: 0,
          refill_last_error: null,
          refill_last_failed_at: null,
          updated_at: new Date().toISOString(),
        }, { onConflict: "workspace_id" });
      if (refillError) {
        throw new HttpError(503, "AUTOREFILL_UPDATE_FAILED", "Automatic top-ups could not be saved");
      }

      await writeAudit(admin, {
        workspaceId,
        actorUserId: user.id,
        action: off ? "workspace.credits.autorefill_disabled" : "workspace.credits.autorefill_enabled",
        entityType: "workspace",
        entityId: workspaceId,
        metadata: { threshold_credits: body.threshold_credits, pack_credits: body.pack_credits, monthly_cap_cents: off ? null : (hasCap ? capCents : undefined) },
      });
      return jsonResponse(req, METHODS, 200, {
        success: true,
        refill_threshold_credits: off ? null : body.threshold_credits,
        refill_pack_credits: off ? null : body.pack_credits,
        ...(off ? { refill_monthly_cap_cents: null } : hasCap ? { refill_monthly_cap_cents: capCents } : {}),
      });
    }

    if (action === "billing-portfolio") {
      requireOnlyKeys(body, ["action", "workspace_id"]);
      await requireWorkspaceFeatureAccess(authContext, workspaceId, { billingRecovery: true });
      if (!platformAdmin) {
        throw new HttpError(403, "PLATFORM_ADMIN_REQUIRED", "Platform administrator access is required");
      }

      const monthStart = new Date();
      monthStart.setUTCDate(1);
      monthStart.setUTCHours(0, 0, 0, 0);

      // Every workspace at once. The per-workspace overview answers "how is
      // this agency doing"; the only way to ask "which agency needs me" was to
      // open each one in turn, so nobody ever asked it.
      //
      // Every read is paged to the end. PostgREST caps an unpaged select at
      // its max-rows setting, so the lots and this month's ledger — which grow
      // with every operation — were silently truncated and the balances and
      // spend shown here came out low with nothing to say so. A page that
      // fails fails the whole portfolio rather than showing partial totals.
      const [
        workspacesResult, profilesResult, lotsResult, spendResult, plansResult, membersResult, purchasesResult,
      ] = await Promise.all([
        readAllPages((from, to) => admin.from("workspaces")
          .select("id, name, status, created_at")
          .eq("status", "active")
          .order("id", { ascending: true })
          .range(from, to)),
        readAllPages((from, to) => admin.from("workspace_billing_profiles")
          .select("workspace_id, plan_key, billing_status, base_price_cents, monthly_credit_allowance, cancel_at_period_end, current_period_end, stripe_subscription_id, trial_ends_at")
          .order("workspace_id", { ascending: true })
          .range(from, to)),
        readAllPages((from, to) => admin.from("workspace_credit_lots")
          .select("id, workspace_id, remaining, expires_at")
          .gt("remaining", 0)
          .order("id", { ascending: true })
          .range(from, to)),
        // Debits net of refunds, the same arithmetic the per-workspace
        // overview uses — the two screens used to disagree by construction.
        readAllPages((from, to) => admin.from("workspace_credit_ledger")
          .select("id, workspace_id, amount, entry_type, created_at")
          .in("entry_type", ["debit", "refund"])
          .gte("created_at", monthStart.toISOString())
          .order("id", { ascending: true })
          .range(from, to)),
        // Three rows. Each workspace's allowance is compared with its plan's
        // so an override can be told apart from the default.
        admin.from("billing_plans").select("plan_key, display_name, base_price_cents, monthly_credit_allowance"),
        // The owner to show, and the people whose sign-ins say whether the
        // workspace is in use.
        readAllPages((from, to) => admin.from("workspace_memberships")
          .select("id, workspace_id, user_id, email_normalized, role, status")
          .neq("status", "revoked")
          .order("id", { ascending: true })
          .range(from, to)),
        // A card on file, as the overview proves it when Stripe cannot be
        // asked: a lot bought by a real payment. Asking Stripe once per row
        // would make the list as slow as its longest answer.
        readAllPages((from, to) => admin.from("workspace_credit_lots")
          .select("id, workspace_id")
          .eq("source", "purchase")
          .not("stripe_payment_ref", "is", null)
          .order("id", { ascending: true })
          .range(from, to)),
      ]);
      if (
        workspacesResult.error || profilesResult.error || lotsResult.error || spendResult.error
        || plansResult.error || membersResult.error || purchasesResult.error
      ) {
        throw new HttpError(503, "PORTFOLIO_UNAVAILABLE", "The billing portfolio could not be read");
      }

      const now = Date.now();
      const balances = new Map<string, number>();
      for (const lot of (lotsResult.data ?? []) as Array<Record<string, unknown>>) {
        const expires = typeof lot.expires_at === "string" ? Date.parse(lot.expires_at) : Number.NaN;
        // An expired lot is already out of the balance everywhere else; a
        // portfolio that counted it would disagree with every other screen.
        if (!Number.isNaN(expires) && expires <= now) continue;
        const id = String(lot.workspace_id);
        balances.set(id, (balances.get(id) ?? 0) + (Number(lot.remaining) || 0));
      }
      const spend = new Map<string, number>();
      const lastActivity = new Map<string, number>();
      const noteActivity = (id: string, at: unknown) => {
        const time = typeof at === "string" ? Date.parse(at) : Number.NaN;
        if (!Number.isNaN(time) && time > (lastActivity.get(id) ?? 0)) lastActivity.set(id, time);
      };
      for (const row of (spendResult.data ?? []) as Array<Record<string, unknown>>) {
        const id = String(row.workspace_id);
        if (row.entry_type === "debit") noteActivity(id, row.created_at);
        const magnitude = Math.abs(Number(row.amount) || 0);
        spend.set(id, (spend.get(id) ?? 0) + (row.entry_type === "debit" ? magnitude : -magnitude));
      }
      for (const [id, value] of spend) {
        if (value < 0) spend.set(id, 0);
      }
      const profiles = new Map<string, Record<string, unknown>>();
      for (const row of (profilesResult.data ?? []) as Array<Record<string, unknown>>) {
        profiles.set(String(row.workspace_id), row);
      }

      const plans = new Map<string, Record<string, unknown>>();
      for (const plan of (plansResult.data ?? []) as Array<Record<string, unknown>>) {
        plans.set(String(plan.plan_key), plan);
      }

      const cardOnFile = new Set<string>();
      for (const lot of (purchasesResult.data ?? []) as Array<Record<string, unknown>>) {
        cardOnFile.add(String(lot.workspace_id));
      }

      // Last active: the latest sign-in by anyone in the workspace, or the
      // latest credit spent this month. A sign-in alone undercounts, because
      // a session refreshes for weeks without signing in again.
      const owners = new Map<string, string>();
      const memberWorkspaces = new Map<string, string[]>();
      for (const member of (membersResult.data ?? []) as Array<Record<string, unknown>>) {
        const id = String(member.workspace_id);
        if (member.role === "owner" && typeof member.email_normalized === "string" && !owners.has(id)) {
          owners.set(id, member.email_normalized);
        }
        if (typeof member.user_id === "string") {
          memberWorkspaces.set(member.user_id, [...(memberWorkspaces.get(member.user_id) ?? []), id]);
        }
      }
      for (let page = 1; page <= PORTFOLIO_MAX_PAGES && memberWorkspaces.size > 0; page += 1) {
        const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 1000 });
        // Sign-ins only sharpen a column; a failure leaves it to the ledger
        // rather than failing the whole portfolio.
        if (error || !data?.users) break;
        for (const user of data.users) {
          for (const id of memberWorkspaces.get(user.id) ?? []) noteActivity(id, user.last_sign_in_at);
        }
        if (data.users.length < 1000) break;
      }

      // What each paying workspace is charged, from Stripe. Only workspaces
      // with a subscription are asked, in parallel; the profile's recorded
      // price stands in when Stripe does not answer.
      const subscriptionPrices = new Map<string, number>();
      await Promise.all(((profilesResult.data ?? []) as Array<Record<string, unknown>>)
        .filter((profile) => typeof profile.stripe_subscription_id === "string" && profile.stripe_subscription_id)
        .map(async (profile) => {
          const cents = await stripeSubscriptionPriceCents(String(profile.stripe_subscription_id));
          const fallback = typeof profile.base_price_cents === "number" ? profile.base_price_cents : null;
          if (cents !== null || fallback !== null) subscriptionPrices.set(String(profile.workspace_id), cents ?? fallback!);
        }));

      const rows = ((workspacesResult.data ?? []) as Array<Record<string, unknown>>).map((workspace) => {
        const id = String(workspace.id);
        const profile = profiles.get(id);
        // A profile is created with founding_member, so a workspace without
        // one is on that plan in every sense that matters here.
        const effectivePlanKey = typeof profile?.plan_key === "string" ? profile.plan_key : "founding_member";
        const plan = plans.get(effectivePlanKey);
        const lastActive = lastActivity.get(id);
        const allowance = typeof profile?.monthly_credit_allowance === "number"
          ? profile.monthly_credit_allowance
          : 100;
        const balance = balances.get(id) ?? 0;
        return {
          workspace_id: id,
          name: typeof workspace.name === "string" ? workspace.name : "Workspace",
          // No profile is a workspace that has never been billed: a trial.
          billing_status: typeof profile?.billing_status === "string" ? profile.billing_status : "trialing",
          plan_key: typeof profile?.plan_key === "string" ? profile.plan_key : null,
          monthly_credit_allowance: allowance,
          balance,
          credits_spent_this_month: spend.get(id) ?? 0,
          has_subscription: typeof profile?.stripe_subscription_id === "string"
            && profile.stripe_subscription_id.length > 0,
          cancel_at_period_end: profile?.cancel_at_period_end === true,
          current_period_end: profile?.current_period_end ?? null,
          trial_ends_at: effectiveTrialEndsAt(profile?.trial_ends_at, workspace.created_at),
          plan_monthly_credit_allowance: typeof plan?.monthly_credit_allowance === "number"
            ? plan.monthly_credit_allowance
            : null,
          plan_name: typeof plan?.display_name === "string" ? plan.display_name : null,
          plan_base_price_cents: typeof plan?.base_price_cents === "number" ? plan.base_price_cents : null,
          subscription_price_cents: subscriptionPrices.get(id) ?? null,
          owner_email: owners.get(id) ?? null,
          has_saved_card: cardOnFile.has(id),
          last_active_at: lastActive ? new Date(lastActive).toISOString() : null,
        };
      });

      return jsonResponse(req, METHODS, 200, {
        success: true,
        enforcement_enabled: false,
        workspaces: rows,
      });
    }

    if (action === "subscription-admin") {
      requireOnlyKeys(body, [
        "action", "workspace_id", "operation", "reason", "note", "action_key", "trial_ends_at", "plan_key", "email_owner",
      ]);
      await requireWorkspaceFeatureAccess(authContext, workspaceId, { billingRecovery: true });
      if (!platformAdmin) {
        throw new HttpError(403, "PLATFORM_ADMIN_REQUIRED", "Platform administrator access is required");
      }
      const operation = body.operation as SubscriptionOperation;
      if (!SUBSCRIPTION_OPERATIONS.includes(operation)) {
        throw new HttpError(400, "INVALID_OPERATION", "Choose a subscription action");
      }
      // Every change to what a workspace pays or holds says why.
      const reason = requireString(body.reason, "reason", { min: 1, max: 60 });
      const note = body.note === undefined ? "" : requireString(body.note, "note", { min: 0, max: 500 });
      const actionKey = requireUuid(body.action_key, "action_key");

      // The same action twice (a double click, a retry after a timeout) is
      // one action. Its audit row is the receipt.
      const { data: done, error: doneError } = await admin
        .from("workspace_audit_log")
        .select("id, metadata")
        .eq("workspace_id", workspaceId)
        .eq("action", "workspace.subscription.admin_action")
        .contains("metadata", { action_key: actionKey })
        .limit(1)
        .maybeSingle();
      if (doneError) throw new HttpError(503, "BILLING_UNAVAILABLE", "Billing data could not be read");
      // Checkout audit results intentionally omit the bearer URL. A retry must
      // reconcile the durable session again to return its link, not replay an
      // audit result that the caller cannot open. Other actions remain no-ops.
      const checkoutReplay = Boolean(done && operation === "checkout_link"
        && (done.metadata as Record<string, unknown> | null)?.operation === "checkout_link");
      if (done && !checkoutReplay) {
        const metadata = (done.metadata ?? {}) as Record<string, unknown>;
        return jsonResponse(req, METHODS, 200, {
          success: true,
          idempotent: true,
          operation,
          result: (metadata.result ?? {}) as Record<string, unknown>,
        });
      }

      const [profileResult, plansResult] = await Promise.all([
        admin.from("workspace_billing_profiles")
          .select("plan_key, billing_status, monthly_credit_allowance, stripe_customer_id, stripe_subscription_id, cancel_at_period_end, trial_ends_at")
          .eq("workspace_id", workspaceId)
          .maybeSingle(),
        admin.from("billing_plans")
          .select("plan_key, display_name, base_price_cents, monthly_credit_allowance, per_client_price_cents, included_active_clients, stripe_price_id, is_purchasable"),
      ]);
      if (profileResult.error || plansResult.error) {
        throw new HttpError(503, "BILLING_UNAVAILABLE", "Billing data could not be read");
      }
      const profile = profileResult.data;
      const plans = (plansResult.data ?? []) as Array<Record<string, unknown>>;
      const currentPlanKey = typeof profile?.plan_key === "string" ? profile.plan_key : "founding_member";
      const subscriptionId = typeof profile?.stripe_subscription_id === "string" && profile.stripe_subscription_id
        ? profile.stripe_subscription_id
        : null;
      // A suspended row still names the subscription that ended.
      const liveSubscription = subscriptionId !== null && profile?.billing_status !== "suspended";
      const purchasablePlan = (planKey: string) => {
        const plan = plans.find((candidate) => candidate.plan_key === planKey);
        if (!plan || plan.is_purchasable !== true || plan.plan_key === "comped") {
          throw new HttpError(400, "INVALID_PLAN", "Choose a plan that is on sale");
        }
        return plan;
      };
      const writeProfile = async (fields: Record<string, unknown>) => {
        // Upserted: a workspace that has never been billed has no row yet.
        const { error } = await admin
          .from("workspace_billing_profiles")
          .upsert({ workspace_id: workspaceId, ...fields, updated_at: new Date().toISOString() }, { onConflict: "workspace_id" });
        if (error) throw new HttpError(503, "BILLING_UPDATE_FAILED", "The change could not be saved");
      };

      let result: Record<string, unknown> = {};
      let checkoutUrl: string | null = null;

      if (operation === "extend_trial") {
        // A Stripe subscription has its own billing dates; this trial is the
        // one before a workspace subscribes.
        if (liveSubscription) {
          throw new HttpError(409, "SUBSCRIPTION_EXISTS", "This workspace is subscribed, so there is no trial to extend");
        }
        const until = typeof body.trial_ends_at === "string" ? Date.parse(body.trial_ends_at) : Number.NaN;
        if (Number.isNaN(until) || until <= Date.now() || until > Date.now() + 366 * 86_400_000) {
          throw new HttpError(400, "INVALID_TRIAL_END", "Choose a trial end within the next year");
        }
        const trialEndsAt = new Date(until).toISOString();
        // A cancelled workspace keeps a suspended profile after its Stripe
        // subscription is removed. Extending the date must also restore trial
        // access, without downgrading a manually active or complimentary account.
        const keepAccessStatus = profile?.billing_status === "active" || profile?.billing_status === "comped";
        await writeProfile({
          trial_ends_at: trialEndsAt,
          ...(keepAccessStatus ? {} : { billing_status: "trialing" }),
        });
        result = { trial_ends_at: trialEndsAt, from_trial_ends_at: profile?.trial_ends_at ?? null };
      } else if (operation === "change_plan") {
        const target = purchasablePlan(requireString(body.plan_key, "plan_key", { max: 40 }));
        if (target.plan_key === currentPlanKey) {
          throw new HttpError(409, "PLAN_UNCHANGED", "The workspace is already on that plan");
        }
        if (liveSubscription && subscriptionId) {
          const priceId = typeof target.stripe_price_id === "string" ? target.stripe_price_id : "";
          if (!priceId) throw new HttpError(409, "PLAN_NOT_CONFIGURED", "That plan has no Stripe price yet");
          const subscription = await stripeRequest("GET", `subscriptions/${encodeURIComponent(subscriptionId)}`);
          const items = (subscription.items as { data?: Array<{ id?: unknown }> } | undefined)?.data ?? [];
          const itemId = typeof items[0]?.id === "string" ? items[0].id : "";
          if (!itemId) throw new HttpError(409, "SUBSCRIPTION_UNREADABLE", "The Stripe subscription has no plan to change");
          // Switched now and prorated: Stripe credits the unused part of the
          // old plan. The webhook records the new plan and its allowance.
          await stripeRequest("POST", `subscriptions/${encodeURIComponent(subscriptionId)}`, new URLSearchParams({
            "items[0][id]": itemId,
            "items[0][price]": priceId,
            proration_behavior: "create_prorations",
            "metadata[plan_key]": String(target.plan_key),
          }), `${actionKey}:plan`);
          result = { plan_key: target.plan_key, from_plan_key: currentPlanKey, via: "stripe" };
        } else {
          // No subscription: the plan is ours to set. An allowance set by hand
          // stays; one that was the old plan's default follows the new plan.
          const currentPlan = plans.find((candidate) => candidate.plan_key === currentPlanKey);
          const overridden = typeof profile?.monthly_credit_allowance === "number"
            && typeof currentPlan?.monthly_credit_allowance === "number"
            && profile.monthly_credit_allowance !== currentPlan.monthly_credit_allowance;
          await writeProfile({
            plan_key: target.plan_key,
            base_price_cents: target.base_price_cents,
            per_client_price_cents: target.per_client_price_cents,
            included_active_clients: target.included_active_clients,
            ...(overridden ? {} : { monthly_credit_allowance: target.monthly_credit_allowance }),
          });
          result = { plan_key: target.plan_key, from_plan_key: currentPlanKey, via: "profile", kept_allowance_override: overridden };
        }
      } else if (operation === "make_comped") {
        if (profile?.billing_status === "comped") {
          throw new HttpError(409, "ALREADY_COMPED", "The workspace is already complimentary");
        }
        // A paying workspace stops being charged after the period it has
        // already paid for; the webhook keeps it complimentary meanwhile.
        const stopsStripe = liveSubscription && subscriptionId !== null && profile?.cancel_at_period_end !== true;
        if (stopsStripe && subscriptionId) {
          await stripeRequest("POST", `subscriptions/${encodeURIComponent(subscriptionId)}`, new URLSearchParams({
            cancel_at_period_end: "true",
          }), `${actionKey}:comp`);
        }
        await writeProfile({
          billing_status: "comped",
          plan_key: "comped",
          ...(liveSubscription ? { cancel_at_period_end: true } : {}),
        });
        result = { from_plan_key: currentPlanKey, from_billing_status: profile?.billing_status ?? "trialing", stripe_cancel_at_period_end: stopsStripe };
      } else if (operation === "cancel") {
        if (!liveSubscription || !subscriptionId) {
          throw new HttpError(409, "NO_SUBSCRIPTION", "This workspace has no subscription to cancel");
        }
        if (profile?.cancel_at_period_end === true) {
          throw new HttpError(409, "ALREADY_CANCELLING", "This subscription already ends at the period end");
        }
        // At period end: the workspace keeps what it paid for, and the
        // cancellation can be undone in Stripe until then.
        await stripeRequest("POST", `subscriptions/${encodeURIComponent(subscriptionId)}`, new URLSearchParams({
          cancel_at_period_end: "true",
        }), `${actionKey}:cancel`);
        await writeProfile({ cancel_at_period_end: true });
        result = { cancel_at_period_end: true };
      } else {
        // checkout_link: a hosted Stripe checkout the owner completes.
        if (liveSubscription) {
          throw new HttpError(409, "SUBSCRIPTION_EXISTS", "This workspace already has a subscription");
        }
        const target = purchasablePlan(requireString(body.plan_key, "plan_key", { max: 40 }));
        const priceId = typeof target.stripe_price_id === "string" ? target.stripe_price_id : "";
        if (!priceId) throw new HttpError(409, "PLAN_NOT_CONFIGURED", "That plan has no Stripe price yet");

        const [{ data: ownerRow }, { data: workspaceRow }] = await Promise.all([
          admin.from("workspace_memberships")
            .select("email_normalized")
            .eq("workspace_id", workspaceId)
            .eq("role", "owner")
            .eq("status", "active")
            .limit(1)
            .maybeSingle(),
          admin.from("workspaces").select("name").eq("id", workspaceId).maybeSingle(),
        ]);
        const ownerEmail = typeof ownerRow?.email_normalized === "string" ? ownerRow.email_normalized : "";
        const workspaceName = typeof workspaceRow?.name === "string" && workspaceRow.name ? workspaceRow.name : "your workspace";

        const customerId = await ensureWorkspaceBillingCustomer(admin, stripeRequest, workspaceId,
          typeof profile?.stripe_customer_id === "string" ? profile.stripe_customer_id : null);
        const billingBase = `${(Deno.env.get("APP_URL") || "https://getonapod.com").replace(/\/+$/u, "")}/app/settings/billing`;
        const session = await getOrCreateWorkspaceCheckout(admin, stripeRequest, {
          workspaceId, customerId, planKey: String(target.plan_key), priceId, billingBase,
        });
        checkoutUrl = session.url;
        const expiresAt = session.expires_at;

        const previousResult = ((done?.metadata as Record<string, unknown> | null)?.result ?? {}) as Record<string, unknown>;
        let emailed: "sent" | "failed" | "skipped" | "unknown" | "not_requested" =
          checkoutReplay && ["sent", "failed", "skipped", "unknown", "not_requested"].includes(String(previousResult.emailed))
            ? previousResult.emailed as "sent" | "failed" | "skipped" | "unknown" | "not_requested"
            : "not_requested";
        if (checkoutReplay) {
          // The durable mail receipt wins over an audit written after an uncertain
          // acknowledgement. A replay never issues another send or rotates its key.
          emailed = await checkoutEmailOutcome(admin, workspaceId, actionKey) ?? emailed;
        }
        if (!checkoutReplay && body.email_owner === true) {
          emailed = ownerEmail
            ? await sendCheckoutEmail(admin, {
              workspaceId,
              actionKey,
              to: ownerEmail,
              workspaceName,
              planName: String(target.display_name ?? target.plan_key),
              // An existing session retains its original Price even if the plan
              // catalog changed. Stripe shows that price and any discounts.
              priceLabel: "Review the price and any discounts in secure checkout",
              url: checkoutUrl,
            })
            : "skipped";
        }
        // The link itself is not kept in the audit log: whoever holds it can pay.
        result = { plan_key: target.plan_key, expires_at: expiresAt, emailed, owner_email: ownerEmail || null };
      }

      // The recipient is useful in this response, but the delivery receipt and
      // audit need only operation identity and outcome, never checkout secrets.
      const auditResult = { ...result };
      if (checkoutUrl) delete auditResult.owner_email;
      if (!checkoutReplay) await writeAudit(admin, {
        workspaceId,
        actorUserId: user.id,
        action: "workspace.subscription.admin_action",
        entityType: "workspace_billing_profile",
        entityId: workspaceId,
        metadata: { operation, reason, note, action_key: actionKey, result: auditResult },
      });
      return jsonResponse(req, METHODS, 200, {
        success: true,
        operation,
        result: checkoutUrl ? { ...result, url: checkoutUrl } : result,
      });
    }

    if (action === "credits-ledger") {
      requireOnlyKeys(body, ["action", "workspace_id", "type", "page"]);
      await requireWorkspaceFeatureAccess(authContext, workspaceId, { billingRecovery: true });
      if (!platformAdmin) {
        throw new HttpError(403, "PLATFORM_ADMIN_REQUIRED", "Platform administrator access is required");
      }
      const type: LedgerType = body.type === undefined ? "all" : body.type as LedgerType;
      if (!LEDGER_TYPES.includes(type)) {
        throw new HttpError(400, "INVALID_LEDGER_TYPE", "Choose a ledger type to filter by");
      }
      const page = body.page === undefined ? 0 : body.page;
      if (typeof page !== "number" || !Number.isSafeInteger(page) || page < 0 || page > 100_000) {
        throw new HttpError(400, "INVALID_PAGE", "Choose a page of the ledger");
      }

      // The whole ledger, oldest first, because the balance after each entry
      // is the running sum of everything before it. Nothing stores it, and the
      // ledger sums to the lots' balance, so the sum is the balance.
      const [ledgerResult, auditResult] = await Promise.all([
        readAllPages((from, to) => admin.from("workspace_credit_ledger")
          .select("id, entry_type, amount, operation_type, reference_kind, reference_id, actor_user_id, idempotency_key, created_at")
          .eq("workspace_id", workspaceId)
          .order("created_at", { ascending: true })
          .order("id", { ascending: true })
          .range(from, to)),
        // Notes, and the reason behind a removal, live on the audit row that
        // carries the same key as the ledger entry.
        readAllPages((from, to) => admin.from("workspace_audit_log")
          .select("id, action, metadata")
          .eq("workspace_id", workspaceId)
          .in("action", ["workspace.credits.granted", "workspace.credits.adjusted"])
          .order("id", { ascending: true })
          .range(from, to)),
      ]);
      if (ledgerResult.error || auditResult.error) {
        throw new HttpError(503, "LEDGER_UNAVAILABLE", "The credit ledger could not be read");
      }

      const notes = new Map<string, string>();
      for (const row of auditResult.data) {
        const metadata = (row.metadata ?? {}) as Record<string, unknown>;
        const note = typeof metadata.note === "string" ? metadata.note.trim() : "";
        if (!note) continue;
        if (typeof metadata.grant_key === "string") notes.set(`grant:${metadata.grant_key}`, note);
        if (typeof metadata.adjustment_key === "string") notes.set(`adjust:${metadata.adjustment_key}`, note);
      }

      let running = 0;
      const all = ledgerResult.data.map((entry) => {
        const amount = Number(entry.amount) || 0;
        running += amount;
        const entryType = ledgerEntryType(entry.entry_type, entry.reference_kind);
        const referenceId = typeof entry.reference_id === "string" ? entry.reference_id : "";
        let reason: string | null = null;
        let note: string | null = null;
        if (entryType === "grant") {
          reason = typeof entry.reference_kind === "string" ? entry.reference_kind : null;
          note = notes.get(`grant:${referenceId}`) ?? null;
        } else if (entryType === "removal") {
          // The reason is on the entry itself; older removals hold free text.
          reason = referenceId || null;
          const key = typeof entry.idempotency_key === "string" ? entry.idempotency_key : "";
          if (key.startsWith("admin-adjust:")) note = notes.get(`adjust:${key.slice("admin-adjust:".length)}`) ?? null;
        } else if (entryType === "spend") {
          reason = entry.entry_type === "refund"
            ? "refund"
            : (typeof entry.operation_type === "string" ? entry.operation_type : null);
        } else {
          reason = typeof entry.reference_kind === "string" ? entry.reference_kind : null;
        }
        return {
          id: String(entry.id),
          created_at: entry.created_at,
          type: entryType,
          entry_type: entry.entry_type,
          amount,
          reason,
          note,
          actor_user_id: typeof entry.actor_user_id === "string" ? entry.actor_user_id : null,
          balance_after: running,
        };
      });
      const filtered = (type === "all" ? all : all.filter((entry) => entry.type === type)).reverse();
      const pageEntries = filtered.slice(page * LEDGER_PAGE_SIZE, (page + 1) * LEDGER_PAGE_SIZE);

      // Who made each entry, for the few on this page. A failed lookup shows
      // no name rather than failing the ledger.
      const actorIds = [...new Set(pageEntries.map((entry) => entry.actor_user_id).filter(Boolean))] as string[];
      const actorEmails = new Map<string, string>();
      await Promise.all(actorIds.map(async (id) => {
        const { data } = await admin.auth.admin.getUserById(id);
        if (data?.user?.email) actorEmails.set(id, data.user.email);
      }));

      return jsonResponse(req, METHODS, 200, {
        success: true,
        page,
        page_size: LEDGER_PAGE_SIZE,
        total: filtered.length,
        entries: pageEntries.map(({ actor_user_id: actorId, ...entry }) => ({
          ...entry,
          actor_email: actorId ? actorEmails.get(actorId) ?? null : null,
        })),
      });
    }

    if (action === "credits-adjust") {
      requireOnlyKeys(body, ["action", "workspace_id", "amount", "reason", "note", "adjustment_key"]);
      await requireWorkspaceFeatureAccess(authContext, workspaceId, { billingRecovery: true });
      if (!platformAdmin) {
        throw new HttpError(403, "PLATFORM_ADMIN_REQUIRED", "Platform administrator access is required");
      }
      const amount = typeof body.amount === "number" && Number.isSafeInteger(body.amount)
        ? body.amount
        : NaN;
      if (!Number.isSafeInteger(amount) || amount < 1 || amount > 10_000) {
        throw new HttpError(400, "INVALID_AMOUNT", "Remove between 1 and 10,000 credits");
      }
      // Required, unlike a grant's note: taking credit away is the movement
      // somebody will later ask to have explained.
      const reason = requireString(body.reason, "reason", { min: 1, max: 200 });
      // Optional, as on a grant: the reason files it, the note explains it.
      const adjustNote = body.note === undefined ? "" : requireString(body.note, "note", { min: 0, max: 500 });
      const adjustmentKey = requireUuid(body.adjustment_key, "adjustment_key");

      const { data, error } = await admin.rpc("adjust_workspace_credits_v1", {
        p_workspace_id: workspaceId,
        p_amount: amount,
        p_reason: reason,
        p_actor_user_id: user.id,
        p_idempotency_key: `admin-adjust:${adjustmentKey}`,
      });
      if (error) {
        if ((error.message ?? "").includes("INSUFFICIENT_CREDITS")) {
          throw new HttpError(
            409,
            "INSUFFICIENT_CREDITS",
            "That is more than the workspace has. A balance cannot go below zero.",
          );
        }
        throw new HttpError(503, "CREDIT_ADJUST_FAILED", "The adjustment could not be recorded");
      }
      const result = data as { balance?: number; idempotent?: boolean } | null;
      await writeAudit(admin, {
        workspaceId,
        actorUserId: user.id,
        action: "workspace.credits.adjusted",
        entityType: "workspace",
        entityId: workspaceId,
        metadata: { amount: -amount, reason, note: adjustNote, adjustment_key: adjustmentKey },
      });
      return jsonResponse(req, METHODS, 200, {
        success: true,
        removed: amount,
        balance: typeof result?.balance === "number" ? result.balance : null,
        idempotent: result?.idempotent === true,
      });
    }

    if (action === "billing-allowance-set") {
      requireOnlyKeys(body, ["action", "workspace_id", "monthly_credit_allowance", "reason", "note"]);
      await requireWorkspaceFeatureAccess(authContext, workspaceId, { billingRecovery: true });
      if (!platformAdmin) {
        throw new HttpError(403, "PLATFORM_ADMIN_REQUIRED", "Platform administrator access is required");
      }
      const allowance = typeof body.monthly_credit_allowance === "number"
          && Number.isSafeInteger(body.monthly_credit_allowance)
        ? body.monthly_credit_allowance
        : NaN;
      if (!Number.isSafeInteger(allowance) || allowance < 0 || allowance > 1_000_000) {
        throw new HttpError(400, "INVALID_ALLOWANCE", "Set an allowance between 0 and 1,000,000 credits");
      }
      // Every change to what a workspace is given says why, like a grant.
      const allowanceReason = requireString(body.reason, "reason", { min: 1, max: 60 });
      const allowanceNote = body.note === undefined ? "" : requireString(body.note, "note", { min: 0, max: 500 });
      const { data: previousProfile } = await admin
        .from("workspace_billing_profiles")
        .select("monthly_credit_allowance")
        .eq("workspace_id", workspaceId)
        .maybeSingle();

      // Upserted rather than updated: the workspaces that most need an
      // allowance set are the ones that have never been billed, and those have
      // no profile row at all until something creates one.
      const { error: allowanceError } = await admin
        .from("workspace_billing_profiles")
        .upsert(
          { workspace_id: workspaceId, monthly_credit_allowance: allowance, updated_at: new Date().toISOString() },
          { onConflict: "workspace_id" },
        );
      if (allowanceError) {
        throw new HttpError(503, "ALLOWANCE_UPDATE_FAILED", "The monthly allowance could not be saved");
      }

      await writeAudit(admin, {
        workspaceId,
        actorUserId: user.id,
        action: "workspace.credits.allowance_set",
        entityType: "workspace",
        entityId: workspaceId,
        metadata: {
          monthly_credit_allowance: allowance,
          from_monthly_credit_allowance: previousProfile?.monthly_credit_allowance ?? null,
          reason: allowanceReason,
          note: allowanceNote,
        },
      });
      // Takes effect on the next renewal rather than immediately: the current
      // month is already granted under the old number, and re-granting the
      // difference now would need a second idempotency key and would double up
      // for anyone who ran it twice.
      return jsonResponse(req, METHODS, 200, {
        success: true,
        monthly_credit_allowance: allowance,
      });
    }


    if (action === "ai-provider-set" || action === "ai-keys-status" || action === "ai-keys-set" || action === "ai-keys-clear" || action === "ai-keys-test") {
      const access = await requireWorkspaceFeatureAccess(authContext, workspaceId, { billingRecovery: true });
      if (!["owner", "platform_admin"].includes(access.role)) {
        throw new HttpError(403, "WORKSPACE_OWNER_REQUIRED", "Workspace owner access is required");
      }

      if (action === "ai-keys-status") {
        requireOnlyKeys(body, ["action", "workspace_id"]);
        const status = await workspaceAiKeyStatus(admin, workspaceId);
        return jsonResponse(req, METHODS, 200, { success: true, providers: status, default_provider: await workspaceTextAiPreference(admin, workspaceId) });
      }

      if (action === "ai-provider-set") {
        requireOnlyKeys(body, ["action", "workspace_id", "provider"]);
        const provider = requireProvider(body.provider);
        await setWorkspaceTextAiProvider(admin, workspaceId, provider);
        await writeAudit(admin, { workspaceId, actorUserId: user.id, action: "workspace.ai_provider.set", entityType: "workspace", entityId: workspaceId, metadata: { provider } });
        return jsonResponse(req, METHODS, 200, { success: true });
      }

      // Whether the saved key still works, asked of the provider with the
      // key itself: never the platform key, which would always pass. Read
      // only, so nothing to audit.
      if (action === "ai-keys-test") {
        requireOnlyKeys(body, ["action", "workspace_id", "provider"]);
        const provider = requireProvider(body.provider);
        const stored = await readStoredAiKey(admin, workspaceId, provider);
        if (!stored.configured) {
          throw new HttpError(404, "AI_KEY_NOT_CONFIGURED", "No API key is saved for this provider");
        }
        // Storage failures surface separately; only ask the provider about readable keys.
        const result = stored.apiKey ? await probeAiKeyResult(provider, stored.apiKey) : "invalid";
        return jsonResponse(req, METHODS, 200, { success: true, result });
      }

      if (action === "ai-keys-set") {
        requireOnlyKeys(body, ["action", "workspace_id", "provider", "api_key"]);
        const provider = requireProvider(body.provider);
        const apiKey = requireString(body.api_key, "api_key", { max: 512 });
        if (apiKey.trim().length < 20) {
          throw new HttpError(400, "INVALID_API_KEY", "The API key looks incomplete");
        }
        const probe = await probeAiKeyResult(provider, apiKey.trim());
        if (probe === "invalid") throw new HttpError(422, "PROVIDER_KEY_REJECTED", "The provider rejected this API key. Check that you copied an active key");
        if (probe === "unreachable") throw new HttpError(503, "PROVIDER_UNAVAILABLE", "The provider could not verify this key right now. Your existing connection has not changed; try again shortly");
        await storeWorkspaceAiKey(admin, workspaceId, provider, apiKey.trim(), user.id);
        await writeAudit(admin, {
          workspaceId,
          actorUserId: user.id,
          action: "workspace.ai_key.set",
          entityType: "workspace",
          entityId: workspaceId,
          metadata: { provider },
        });
        return jsonResponse(req, METHODS, 200, { success: true });
      }

      requireOnlyKeys(body, ["action", "workspace_id", "provider"]);
      const provider = requireProvider(body.provider);
      await clearWorkspaceAiKey(admin, workspaceId, provider);
      await writeAudit(admin, {
        workspaceId,
        actorUserId: user.id,
        action: "workspace.ai_key.cleared",
        entityType: "workspace",
        entityId: workspaceId,
        metadata: { provider },
      });
      return jsonResponse(req, METHODS, 200, { success: true });
    }

    if (action === "update_workspace_name") {
      requireOnlyKeys(body, [
        "action",
        "workspace_id",
        "expected_updated_at",
        "workspace_name",
      ]);
      const expectedUpdatedAt = requireWorkspaceUpdatedAt(
        body.expected_updated_at,
      );
      const workspaceName = requireWorkspaceName(body.workspace_name);
      const staff = await listWorkspaceStaff(
        admin,
        workspaceId,
        user.id,
        tokenIssuedAt,
      );
      if (staff.capabilities.read_only) invalidRpcResponse();
      requireWorkspaceManager(staff);
      const currentBranding = await loadWorkspaceBranding(admin, workspaceId);
      if (currentBranding.updated_at !== expectedUpdatedAt) {
        throw new HttpError(
          409,
          "WORKSPACE_STATE_CHANGED",
          "Workspace settings changed; refresh before trying again",
        );
      }
      const updatedWorkspace = await setWorkspaceName(admin, {
        workspaceId,
        expectedUpdatedAt,
        previousWorkspaceName: currentBranding.name,
        workspaceName,
        actorUserId: user.id,
        tokenIssuedAt,
      });
      return jsonResponse(req, METHODS, 200, {
        success: true,
        workspace: updatedWorkspace,
      });
    }

    if (action === "update_booking_link") {
      requireOnlyKeys(body, ["action", "workspace_id", "booking_embed_url"]);
      // Null clears it. Anything else has to be an https URL this build would
      // also be willing to render, so a link cannot be saved here and then
      // silently refused on the page that shows it.
      const rawBookingUrl = body.booking_embed_url === null
        ? null
        : requireString(body.booking_embed_url, "booking_embed_url", { max: 500 }).trim();
      if (rawBookingUrl !== null && !/^https:\/\/[^\s]+$/u.test(rawBookingUrl)) {
        throw new HttpError(
          400,
          "INVALID_FIELD",
          "The booking link must be a full https address",
        );
      }
      const staff = await listWorkspaceStaff(
        admin,
        workspaceId,
        user.id,
        tokenIssuedAt,
      );
      if (staff.capabilities.read_only) invalidRpcResponse();
      requireWorkspaceManager(staff);
      const { error: bookingError } = await admin.rpc(
        "set_workspace_booking_link_v1",
        {
          p_workspace_id: workspaceId,
          p_booking_embed_url: rawBookingUrl,
          p_actor_user_id: user.id,
          p_token_issued_at: tokenIssuedAt,
        },
      );
      if (bookingError) {
        rpcFailure(
          bookingError,
          "BOOKING_LINK_UPDATE_FAILED",
          "The booking link could not be saved",
        );
      }
      await writeAudit(admin, {
        workspaceId,
        actorUserId: user.id,
        action: rawBookingUrl
          ? "workspace.booking_link.set"
          : "workspace.booking_link.cleared",
        entityType: "workspace",
        entityId: workspaceId,
        // The URL served to clients, recorded so a phished-then-reverted
        // link can be scoped from the audit trail. The sibling actions
        // record their values; this one recorded nothing.
        metadata: { booking_embed_url: rawBookingUrl || null },
      });
      return jsonResponse(req, METHODS, 200, {
        branding: await loadWorkspaceBranding(admin, workspaceId),
      });
    }

    if (action === "update_brand") {
      requireOnlyKeys(body, [
        "action",
        "workspace_id",
        "expected_brand_updated_at",
        "client_brand_name",
        "client_brand_primary_color",
        "client_brand_accent_color",
        "client_contact_email",
      ]);
      const expectedBrandUpdatedAt = requireBrandUpdatedAt(
        body.expected_brand_updated_at,
      );
      const clientBrandName = requireClientBrandName(body.client_brand_name);
      const primaryColor = requireClientBrandColor(
        body.client_brand_primary_color,
        "client_brand_primary_color",
      );
      const accentColor = requireClientBrandColor(
        body.client_brand_accent_color,
        "client_brand_accent_color",
      );
      const contactEmail = body.client_contact_email === undefined || body.client_contact_email === null || body.client_contact_email === ""
        ? null
        : requireEmail(body.client_contact_email);
      const staff = await listWorkspaceStaff(
        admin,
        workspaceId,
        user.id,
        tokenIssuedAt,
      );
      if (staff.capabilities.read_only) invalidRpcResponse();
      requireWorkspaceManager(staff);
      const currentBranding = await loadWorkspaceBranding(admin, workspaceId);
      if (currentBranding.client_brand_updated_at !== expectedBrandUpdatedAt) {
        throw new HttpError(
          409,
          "BRANDING_STATE_CHANGED",
          "Workspace branding changed; refresh before trying again",
        );
      }
      const branding = await setWorkspaceClientBrand(admin, {
        workspaceId,
        expectedBrandUpdatedAt,
        clientBrandName,
        primaryColor,
        accentColor,
        contactEmail,
        actorUserId: user.id,
        tokenIssuedAt,
      });
      return jsonResponse(req, METHODS, 200, {
        success: true,
        workspace: branding,
      });
    }

    /*
     * A member's own picture. Not a manager action — everyone owns their own
     * face — so there is no role check here, and the RPC locates the row by the
     * authenticated actor rather than by anything the caller sends. The image
     * validation is the logo's, since the constraints are identical.
     */
    if (action === "update_avatar") {
      requireOnlyKeys(body, [
        "action",
        "workspace_id",
        "expected_avatar_path",
        "mime_type",
        "image_base64",
      ]);
      const expectedAvatarPath = requireExpectedAvatarPath(
        body.expected_avatar_path,
        workspaceId,
      );
      const image = requireWorkspaceLogoImage(body.mime_type, body.image_base64);
      // Authorize before the service-role upload. The RPC below is the
      // authoritative gate, but it runs only AFTER the object is written —
      // so without this probe any authenticated user (a member of another
      // tenant, a suspended one) could force a 2 MB write under an arbitrary
      // workspace_id prefix and then a delete. A cheap active-membership
      // check refuses that at the door.
      const { data: avatarMembership } = await admin
        .from("workspace_memberships")
        .select("id")
        .eq("workspace_id", workspaceId)
        .eq("user_id", user.id)
        .eq("status", "active")
        .maybeSingle();
      if (!avatarMembership) {
        throw new HttpError(403, "WORKSPACE_ACCESS_REQUIRED", "You are not an active member of this workspace");
      }
      const avatarPath =
        `${workspaceId}/${user.id}/${crypto.randomUUID()}.${image.extension}`;
      const { error: uploadError } = await admin.storage
        .from(MEMBER_AVATAR_BUCKET)
        .upload(avatarPath, image.bytes, {
          cacheControl: "31536000",
          contentType: image.mimeType,
          upsert: false,
        });
      if (uploadError) {
        throw new HttpError(
          502,
          "AVATAR_UPLOAD_FAILED",
          "The profile picture could not be uploaded",
        );
      }

      let avatar: Record<string, unknown>;
      try {
        avatar = await setMembershipAvatar(admin, {
          workspaceId,
          expectedAvatarPath,
          avatarPath,
          actorUserId: user.id,
          tokenIssuedAt,
        });
      } catch (error) {
        // The row did not take it, so the object should not linger.
        await removeMemberAvatarObject(admin, avatarPath);
        throw error;
      }
      await removeMemberAvatarObject(admin, expectedAvatarPath);
      await writeAudit(admin, {
        workspaceId,
        actorUserId: user.id,
        action: "workspace.member_avatar.set",
        entityType: "membership",
        entityId: user.id,
        metadata: {},
      });
      return jsonResponse(req, METHODS, 200, { success: true, membership: avatar });
    }

    if (action === "remove_avatar") {
      requireOnlyKeys(body, ["action", "workspace_id", "expected_avatar_path"]);
      const expectedAvatarPath = requireExpectedAvatarPath(
        body.expected_avatar_path,
        workspaceId,
      );
      const avatar = await setMembershipAvatar(admin, {
        workspaceId,
        expectedAvatarPath,
        avatarPath: null,
        actorUserId: user.id,
        tokenIssuedAt,
      });
      await removeMemberAvatarObject(admin, expectedAvatarPath);
      await writeAudit(admin, {
        workspaceId,
        actorUserId: user.id,
        action: "workspace.member_avatar.cleared",
        entityType: "membership",
        entityId: user.id,
        metadata: {},
      });
      return jsonResponse(req, METHODS, 200, { success: true, membership: avatar });
    }

    if (action === "update_logo") {
      requireOnlyKeys(body, [
        "action",
        "workspace_id",
        "expected_logo_path",
        "mime_type",
        "image_base64",
      ]);
      const expectedLogoPath = requireExpectedLogoPath(
        body.expected_logo_path,
        workspaceId,
      );
      const staff = await listWorkspaceStaff(
        admin,
        workspaceId,
        user.id,
        tokenIssuedAt,
      );
      if (staff.capabilities.read_only) invalidRpcResponse();
      requireWorkspaceManager(staff);
      const currentBranding = await loadWorkspaceBranding(admin, workspaceId);
      if (currentBranding.logo_path !== expectedLogoPath) {
        throw new HttpError(
          409,
          "BRANDING_STATE_CHANGED",
          "Workspace branding changed; refresh before trying again",
        );
      }
      const image = requireWorkspaceLogoImage(
        body.mime_type,
        body.image_base64,
      );
      const logoPath = `${workspaceId}/${crypto.randomUUID()}.${image.extension}`;
      const { error: uploadError } = await admin.storage
        .from(WORKSPACE_LOGO_BUCKET)
        .upload(logoPath, image.bytes, {
          cacheControl: "31536000",
          contentType: image.mimeType,
          upsert: false,
        });
      if (uploadError) {
        throw new HttpError(
          502,
          "LOGO_UPLOAD_FAILED",
          "The workspace logo could not be uploaded",
        );
      }

      let branding: WorkspaceBrandingDto;
      try {
        branding = await setWorkspaceLogo(admin, {
          workspaceId,
          expectedLogoPath,
          logoPath,
          actorUserId: user.id,
          tokenIssuedAt,
        });
      } catch (error) {
        await removeWorkspaceLogoObject(admin, logoPath);
        throw error;
      }
      await removeWorkspaceLogoObject(admin, expectedLogoPath);
      return jsonResponse(req, METHODS, 200, {
        success: true,
        workspace: branding,
      });
    }

    if (action === "remove_logo") {
      requireOnlyKeys(body, [
        "action",
        "workspace_id",
        "expected_logo_path",
      ]);
      const expectedLogoPath = requireExpectedLogoPath(
        body.expected_logo_path,
        workspaceId,
      );
      const staff = await listWorkspaceStaff(
        admin,
        workspaceId,
        user.id,
        tokenIssuedAt,
      );
      if (staff.capabilities.read_only) invalidRpcResponse();
      requireWorkspaceManager(staff);
      const currentBranding = await loadWorkspaceBranding(admin, workspaceId);
      if (
        expectedLogoPath === null ||
        currentBranding.logo_path !== expectedLogoPath
      ) {
        throw new HttpError(
          409,
          "BRANDING_STATE_CHANGED",
          "Workspace branding changed; refresh before trying again",
        );
      }
      const branding = await setWorkspaceLogo(admin, {
        workspaceId,
        expectedLogoPath,
        logoPath: null,
        actorUserId: user.id,
        tokenIssuedAt,
      });
      await removeWorkspaceLogoObject(admin, expectedLogoPath);
      return jsonResponse(req, METHODS, 200, {
        success: true,
        workspace: branding,
      });
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
      try {
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
      } catch (error) {
        throw await withoutInviteOracle(admin, error, { platformAdmin, workspaceId, email });
      }
    }

    if (action === "create_password") {
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
      try {
        const provisioning = await beginStaffPasswordAccount(admin, {
          workspaceId,
          email,
          fullName,
          role,
          actorUserId: user.id,
          tokenIssuedAt,
        });
        const issued = await issueStaffTemporaryPassword(admin, {
          workspaceId,
          membershipId: provisioning.id,
          actorUserId: user.id,
          tokenIssuedAt,
        });
        return jsonResponse(req, METHODS, 201, {
          success: true,
          member: memberDto(issued.membership, false),
          email: issued.membership.email_normalized,
          temporary_password: issued.temporaryPassword,
        });
      } catch (error) {
        throw await withoutInviteOracle(admin, error, { platformAdmin, workspaceId, email });
      }
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

    if (action === "retry_password") {
      requireOnlyKeys(body, ["action", "workspace_id", "membership_id"]);
      const membershipId = requireUuid(body.membership_id, "membership_id");
      const issued = await issueStaffTemporaryPassword(admin, {
        workspaceId,
        membershipId,
        actorUserId: user.id,
        tokenIssuedAt,
      });
      return jsonResponse(req, METHODS, 200, {
        success: true,
        member: memberDto(issued.membership, false),
        email: issued.membership.email_normalized,
        temporary_password: issued.temporaryPassword,
      });
    }

    if (action === "reset_password") {
      requireOnlyKeys(body, ["action", "workspace_id", "membership_id"]);
      const membershipId = requireUuid(body.membership_id, "membership_id");
      const issued = await resetStaffTemporaryPassword(admin, {
        workspaceId,
        membershipId,
        actorUserId: user.id,
        tokenIssuedAt,
      });
      return jsonResponse(req, METHODS, 200, {
        success: true,
        member: memberDto(issued.membership, false),
        email: issued.membership.email_normalized,
        temporary_password: issued.temporaryPassword,
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
