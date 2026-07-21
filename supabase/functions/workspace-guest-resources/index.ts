import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

import {
  guestResourceCharacterLength,
  hasMeaningfulGuestResourceContent,
  isCanonicalGuestResourceContent,
  optionalCanonicalGuestResourceContent,
} from "../_shared/guestResourceContent.ts";
import {
  errorResponse,
  HttpError,
  jsonResponse,
  optionsResponse,
  parseJsonObject,
  requireAuthenticatedUser,
  requireOnlyKeys,
  requireString,
  requireUuid,
  workspaceCredentialIsFresh,
} from "../_shared/workspaceAuth.ts";

const METHODS = ["POST"] as const;
const RESOURCE_FIELDS = [
  "title",
  "description",
  "content",
  "category",
  "type",
  "url",
  "file_url",
  "featured",
  "display_order",
  "status",
  "visibility",
  "client_ids",
] as const;
const RESOURCE_CATEGORIES = [
  "preparation",
  "technical_setup",
  "best_practices",
  "promotion",
  "examples",
  "templates",
] as const;
const RESOURCE_TYPES = ["article", "video", "download", "link"] as const;
const RESOURCE_STATUSES = ["draft", "published", "archived"] as const;
const RESOURCE_VISIBILITIES = ["all_clients", "selected_clients"] as const;
const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

type ResourceCategory = typeof RESOURCE_CATEGORIES[number];
type ResourceType = typeof RESOURCE_TYPES[number];
type ResourceStatus = typeof RESOURCE_STATUSES[number];
type ResourceVisibility = typeof RESOURCE_VISIBILITIES[number];

interface GuestResourcePayload {
  title: string;
  description: string;
  content: string | null;
  category: ResourceCategory;
  type: ResourceType;
  url: string | null;
  file_url: string | null;
  featured: boolean;
  display_order: number;
  status: ResourceStatus;
  visibility: ResourceVisibility;
  client_ids: string[];
}

interface GuestResourceDto extends GuestResourcePayload {
  id: string;
  workspace_id: string;
  created_at: string;
  updated_at: string;
}

function requireEnum<T extends string>(
  value: unknown,
  field: string,
  allowed: readonly T[],
): T {
  const result = requireString(value, field, { max: 32 });
  if (!allowed.includes(result as T)) {
    throw new HttpError(400, "INVALID_FIELD", `${field} is invalid`);
  }
  return result as T;
}

function requireBoolean(value: unknown, field: string): boolean {
  if (typeof value !== "boolean") {
    throw new HttpError(400, "INVALID_FIELD", `${field} must be a boolean`);
  }
  return value;
}

function requireDisplayOrder(value: unknown): number {
  if (
    typeof value !== "number" ||
    !Number.isSafeInteger(value) ||
    value < 0 ||
    value > 1_000_000
  ) {
    throw new HttpError(
      400,
      "INVALID_FIELD",
      "display_order must be an integer between 0 and 1000000",
    );
  }
  return value;
}

function requireResourceText(
  value: unknown,
  field: string,
  max: number,
): string {
  if (typeof value !== "string") {
    throw new HttpError(400, "INVALID_FIELD", `${field} must be a string`);
  }
  const result = value.trim();
  if (!result) {
    throw new HttpError(400, "INVALID_FIELD", `${field} is required`);
  }
  if (guestResourceCharacterLength(result) > max) {
    throw new HttpError(
      400,
      "INVALID_FIELD",
      `${field} must be ${max} characters or fewer`,
    );
  }
  return result;
}

function optionalResourceText(
  value: unknown,
  field: string,
  max: number,
): string | null {
  if (value === undefined || value === null) return null;
  if (typeof value !== "string") {
    throw new HttpError(400, "INVALID_FIELD", `${field} must be a string`);
  }
  const result = value.trim();
  if (!result) return null;
  if (guestResourceCharacterLength(result) > max) {
    throw new HttpError(
      400,
      "INVALID_FIELD",
      `${field} must be ${max} characters or fewer`,
    );
  }
  return result;
}

function optionalHttpUrl(value: unknown, field: string): string | null {
  const result = optionalResourceText(value, field, 2_048);
  if (!result) return null;

  let parsed: URL;
  try {
    parsed = new URL(result);
  } catch {
    throw new HttpError(400, "INVALID_FIELD", `${field} must be a valid URL`);
  }
  if (parsed.protocol !== "https:" && parsed.protocol !== "http:") {
    throw new HttpError(
      400,
      "INVALID_FIELD",
      `${field} must be an HTTP or HTTPS URL`,
    );
  }
  if (parsed.username || parsed.password) {
    throw new HttpError(
      400,
      "INVALID_FIELD",
      `${field} must not contain URL credentials`,
    );
  }
  return parsed.toString();
}

function requireClientIds(value: unknown): string[] {
  if (!Array.isArray(value) || value.length > 500) {
    throw new HttpError(
      400,
      "INVALID_FIELD",
      "client_ids must be an array of at most 500 UUIDs",
    );
  }

  const clientIds = value.map((clientId, index) =>
    requireUuid(clientId, `client_ids[${index}]`)
  );
  if (new Set(clientIds).size !== clientIds.length) {
    throw new HttpError(
      400,
      "INVALID_FIELD",
      "client_ids must not contain duplicates",
    );
  }
  return clientIds;
}

function resourcePayload(value: unknown): GuestResourcePayload {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new HttpError(400, "INVALID_RESOURCE", "resource must be an object");
  }
  const input = value as Record<string, unknown>;
  requireOnlyKeys(input, RESOURCE_FIELDS);

  const visibility = requireEnum(
    input.visibility,
    "visibility",
    RESOURCE_VISIBILITIES,
  );
  const clientIds = requireClientIds(input.client_ids);
  if (visibility === "all_clients" && clientIds.length !== 0) {
    throw new HttpError(
      400,
      "INVALID_FIELD",
      "client_ids must be empty when visibility is all_clients",
    );
  }
  if (visibility === "selected_clients" && clientIds.length === 0) {
    throw new HttpError(
      400,
      "INVALID_FIELD",
      "client_ids must include at least one client when visibility is selected_clients",
    );
  }

  const type = requireEnum(input.type, "type", RESOURCE_TYPES);
  const status = requireEnum(input.status, "status", RESOURCE_STATUSES);
  const content = optionalCanonicalGuestResourceContent(input.content);
  const url = optionalHttpUrl(input.url, "url");
  const fileUrl = optionalHttpUrl(input.file_url, "file_url");
  if (
    status === "published" && (type === "video" || type === "link") &&
    !url
  ) {
    throw new HttpError(
      400,
      "INVALID_FIELD",
      "published video and link resources require url",
    );
  }
  if (status === "published" && type === "download" && !fileUrl) {
    throw new HttpError(
      400,
      "INVALID_FIELD",
      "published download resources require file_url",
    );
  }
  if (
    status === "published" && type === "article" &&
    !hasMeaningfulGuestResourceContent(content)
  ) {
    throw new HttpError(
      400,
      "INVALID_FIELD",
      "published article resources require meaningful content",
    );
  }

  return {
    title: requireResourceText(input.title, "title", 200),
    description: requireResourceText(input.description, "description", 2_000),
    content,
    category: requireEnum(input.category, "category", RESOURCE_CATEGORIES),
    type,
    url,
    file_url: fileUrl,
    featured: requireBoolean(input.featured, "featured"),
    display_order: requireDisplayOrder(input.display_order),
    status,
    visibility,
    client_ids: clientIds,
  };
}

function invalidRpcResponse(): never {
  throw new HttpError(
    500,
    "INVALID_RESOURCE_RESPONSE",
    "The workspace resource operation returned an invalid response",
  );
}

function responseRecord(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    invalidRpcResponse();
  }
  return value as Record<string, unknown>;
}

function responseString(
  value: unknown,
  max: number,
  nullable = false,
): string | null {
  if (nullable && value === null) return null;
  if (
    typeof value !== "string" ||
    guestResourceCharacterLength(value) < 1 ||
    guestResourceCharacterLength(value) > max
  ) {
    invalidRpcResponse();
  }
  return value;
}

function responseUuid(value: unknown): string {
  if (typeof value !== "string" || !UUID_PATTERN.test(value)) {
    invalidRpcResponse();
  }
  return value.toLowerCase();
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

function responseHttpUrl(value: unknown): string | null {
  if (value === null) return null;
  if (
    typeof value !== "string" ||
    guestResourceCharacterLength(value) > 2_048
  ) invalidRpcResponse();
  try {
    const parsed = new URL(value);
    if (
      (parsed.protocol !== "https:" && parsed.protocol !== "http:") ||
      parsed.username ||
      parsed.password
    ) {
      invalidRpcResponse();
    }
    return parsed.toString();
  } catch {
    return invalidRpcResponse();
  }
}

function resourceDto(value: unknown): GuestResourceDto {
  const row = responseRecord(value);
  if (typeof row.featured !== "boolean") invalidRpcResponse();
  if (
    typeof row.display_order !== "number" ||
    !Number.isSafeInteger(row.display_order) ||
    row.display_order < 0 ||
    row.display_order > 1_000_000
  ) invalidRpcResponse();
  if (!Array.isArray(row.client_ids) || row.client_ids.length > 500) {
    invalidRpcResponse();
  }
  const clientIds = row.client_ids.map(responseUuid);
  if (new Set(clientIds).size !== clientIds.length) invalidRpcResponse();
  const visibility = responseEnum(row.visibility, RESOURCE_VISIBILITIES);
  const type = responseEnum(row.type, RESOURCE_TYPES);
  const status = responseEnum(row.status, RESOURCE_STATUSES);
  const url = responseHttpUrl(row.url);
  const fileUrl = responseHttpUrl(row.file_url);
  const content = row.content === null
    ? null
    : isCanonicalGuestResourceContent(row.content)
    ? row.content
    : invalidRpcResponse();
  // Deleting the final assigned client may leave a selected resource with no
  // audience. Managers must still be able to load and repair that safe,
  // portal-invisible state.
  if (visibility === "all_clients" && clientIds.length !== 0) {
    invalidRpcResponse();
  }
  if (
    status === "published" &&
    ((type === "article" && !hasMeaningfulGuestResourceContent(content)) ||
      ((type === "video" || type === "link") && url === null) ||
      (type === "download" && fileUrl === null))
  ) {
    invalidRpcResponse();
  }

  return {
    id: responseUuid(row.id),
    workspace_id: responseUuid(row.workspace_id),
    title: responseString(row.title, 200) as string,
    description: responseString(row.description, 2_000) as string,
    content,
    category: responseEnum(row.category, RESOURCE_CATEGORIES),
    type,
    url,
    file_url: fileUrl,
    featured: row.featured,
    display_order: row.display_order,
    status,
    visibility,
    client_ids: clientIds,
    created_at: responseString(row.created_at, 64) as string,
    updated_at: responseString(row.updated_at, 64) as string,
  };
}

function rpcError(error: { code?: string; message?: string }): never {
  const code = error.code ?? "";
  const message = (error.message ?? "").toLowerCase();
  if (
    code === "42501" ||
    message.includes("active workspace manager") ||
    message.includes("workspace access") ||
    message.includes("not authorized")
  ) {
    throw new HttpError(
      403,
      "WORKSPACE_ACCESS_REQUIRED",
      "Active workspace access is required",
    );
  }
  if (code === "P0002" || message.includes("not found")) {
    throw new HttpError(
      404,
      "RESOURCE_NOT_FOUND",
      "Workspace guest resource not found",
    );
  }
  if (
    ["22023", "22P02", "23503", "23505", "23514"].includes(code) ||
    message.includes("invalid")
  ) {
    throw new HttpError(
      400,
      "INVALID_REQUEST",
      "Workspace guest resource request is invalid",
    );
  }
  throw new HttpError(
    500,
    "RESOURCE_OPERATION_FAILED",
    "The workspace guest resource operation failed",
  );
}

serve(async (req) => {
  if (req.method === "OPTIONS") return optionsResponse(req, METHODS);

  try {
    if (req.method !== "POST") {
      throw new HttpError(405, "METHOD_NOT_ALLOWED", "Only POST is allowed");
    }

    // The content field permits 100,000 characters, including four-byte UTF-8.
    const body = await parseJsonObject(req, 524_288);
    const action = typeof body.action === "string" ? body.action : "";
    const authContext = await requireAuthenticatedUser(req);
    if (!workspaceCredentialIsFresh(authContext)) {
      throw new HttpError(
        401,
        "REAUTHENTICATION_REQUIRED",
        "Sign in again with the newest account credentials",
      );
    }
    const { admin, user, tokenIssuedAt } = authContext;
    const workspaceId = requireUuid(body.workspace_id, "workspace_id");
    let resourceId: string | null = null;
    let payload: GuestResourcePayload | Record<string, never> = {};

    if (action === "list") {
      requireOnlyKeys(body, ["action", "workspace_id"]);
    } else if (action === "create") {
      requireOnlyKeys(body, ["action", "workspace_id", "resource"]);
      payload = resourcePayload(body.resource);
    } else if (action === "update") {
      requireOnlyKeys(body, [
        "action",
        "workspace_id",
        "resource_id",
        "resource",
      ]);
      resourceId = requireUuid(body.resource_id, "resource_id");
      payload = resourcePayload(body.resource);
    } else if (action === "delete") {
      requireOnlyKeys(body, ["action", "workspace_id", "resource_id"]);
      resourceId = requireUuid(body.resource_id, "resource_id");
    } else {
      throw new HttpError(
        400,
        "INVALID_ACTION",
        "Unknown workspace guest resource action",
      );
    }

    const { data, error } = await admin.rpc(
      "workspace_guest_resource_operation_v1",
      {
        p_action: action,
        p_workspace_id: workspaceId,
        p_resource_id: resourceId,
        p_payload: payload,
        p_actor_user_id: user.id,
        p_token_issued_at: tokenIssuedAt,
      },
    );

    if (error) rpcError(error);
    if (action === "list") {
      if (!Array.isArray(data)) invalidRpcResponse();
      return jsonResponse(req, METHODS, 200, {
        resources: data.map(resourceDto),
      });
    }

    return jsonResponse(req, METHODS, action === "create" ? 201 : 200, {
      success: true,
      resource: data === null ? null : resourceDto(data),
    });
  } catch (error) {
    return errorResponse(req, METHODS, error);
  }
});
