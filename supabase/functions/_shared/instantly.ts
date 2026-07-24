import { HttpError } from "./httpError.ts";

const INSTANTLY_API_ORIGIN = "https://api.instantly.ai";
const INSTANTLY_API_PREFIX = "/api/v2";
const REQUEST_TIMEOUT_MS = 20_000;
const MAX_PROVIDER_RESPONSE_BYTES = 2_000_000;
const MAX_ACCOUNT_PAGES = 10;

export interface EncryptedCredential {
  ciphertext: string;
  iv: string;
}

export interface InstantlyWorkspace {
  id: string;
  name: string;
}

export interface InstantlyAccountSummary {
  email: string;
  first_name: string | null;
  last_name: string | null;
  status: number;
  warmup_status: number | null;
  daily_limit: number | null;
}

export interface InstantlyAnalyticsSummary {
  emails_sent_count: number;
  contacted_count: number;
  open_count_unique: number;
  reply_count_unique: number;
  bounced_count: number;
  unsubscribed_count: number;
  total_interested: number;
  total_meeting_booked: number;
}

export class InstantlyApiError extends Error {
  readonly status: number;
  readonly code: string;

  constructor(status: number, code: string, message: string) {
    super(message);
    this.name = "InstantlyApiError";
    this.status = status;
    this.code = code;
  }
}

function requiredEncryptionSecret(): string {
  const value = Deno.env.get("INSTANTLY_CREDENTIAL_ENCRYPTION_KEY");
  if (!value || value.length < 32) {
    throw new HttpError(
      503,
      "INSTANTLY_ENCRYPTION_NOT_CONFIGURED",
      "Instantly credential storage has not been configured",
    );
  }
  return value;
}

function bytesToBase64(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

function base64ToBytes(value: string): Uint8Array<ArrayBuffer> {
  try {
    const binary = atob(value);
    const bytes = new Uint8Array(new ArrayBuffer(binary.length));
    for (let index = 0; index < binary.length; index += 1) {
      bytes[index] = binary.charCodeAt(index);
    }
    return bytes;
  } catch {
    throw new HttpError(
      500,
      "INSTANTLY_CREDENTIAL_INVALID",
      "The stored Instantly credential is invalid",
    );
  }
}

async function credentialKey(secret: string): Promise<CryptoKey> {
  if (secret.length < 32) {
    throw new HttpError(
      500,
      "INSTANTLY_ENCRYPTION_NOT_CONFIGURED",
      "Instantly credential storage has not been configured",
    );
  }
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(secret),
  );
  return await crypto.subtle.importKey(
    "raw",
    digest,
    { name: "AES-GCM" },
    false,
    ["encrypt", "decrypt"],
  );
}

export async function encryptInstantlyApiKey(
  apiKey: string,
  encryptionSecret = requiredEncryptionSecret(),
): Promise<EncryptedCredential> {
  const key = await credentialKey(encryptionSecret);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const encrypted = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv },
    key,
    new TextEncoder().encode(apiKey),
  );
  return {
    ciphertext: bytesToBase64(new Uint8Array(encrypted)),
    iv: bytesToBase64(iv),
  };
}

export async function decryptInstantlyApiKey(
  encrypted: EncryptedCredential,
  encryptionSecret = requiredEncryptionSecret(),
): Promise<string> {
  try {
    const key = await credentialKey(encryptionSecret);
    const decrypted = await crypto.subtle.decrypt(
      { name: "AES-GCM", iv: base64ToBytes(encrypted.iv) },
      key,
      base64ToBytes(encrypted.ciphertext),
    );
    const apiKey = new TextDecoder().decode(decrypted);
    if (!apiKey) throw new Error("empty credential");
    return apiKey;
  } catch (error) {
    if (error instanceof HttpError) throw error;
    throw new HttpError(
      500,
      "INSTANTLY_CREDENTIAL_INVALID",
      "The stored Instantly credential could not be decrypted",
    );
  }
}

function providerFailure(status: number): InstantlyApiError {
  if (status === 401) {
    return new InstantlyApiError(
      status,
      "INSTANTLY_KEY_REJECTED",
      "Instantly rejected this API key",
    );
  }
  if (status === 402) {
    return new InstantlyApiError(
      status,
      "INSTANTLY_PLAN_REQUIRED",
      "The connected Instantly workspace needs an active API plan",
    );
  }
  if (status === 403) {
    return new InstantlyApiError(
      status,
      "INSTANTLY_SCOPE_REQUIRED",
      "The Instantly API key is missing a required permission",
    );
  }
  if (status === 404) {
    return new InstantlyApiError(
      status,
      "INSTANTLY_RESOURCE_NOT_FOUND",
      "The mapped Instantly resource no longer exists",
    );
  }
  if (status === 429) {
    return new InstantlyApiError(
      status,
      "INSTANTLY_RATE_LIMITED",
      "Instantly is temporarily rate limiting this workspace",
    );
  }
  return new InstantlyApiError(
    status,
    "INSTANTLY_REQUEST_FAILED",
    "Instantly could not complete the request",
  );
}

export async function instantlyRequest<T>(
  apiKey: string,
  path: string,
  options: {
    method?: "GET" | "POST" | "PATCH";
    body?: Record<string, unknown>;
    query?: URLSearchParams;
  } = {},
): Promise<T> {
  if (!path.startsWith("/") || path.includes("://") || path.includes("\\")) {
    throw new HttpError(
      500,
      "INSTANTLY_PATH_INVALID",
      "The Instantly request path is invalid",
    );
  }
  const url = new URL(`${INSTANTLY_API_PREFIX}${path}`, INSTANTLY_API_ORIGIN);
  if (options.query) url.search = options.query.toString();

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  let response: Response;
  try {
    response = await fetch(url, {
      method: options.method ?? "GET",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        ...(options.body ? { "Content-Type": "application/json" } : {}),
      },
      body: options.body ? JSON.stringify(options.body) : undefined,
      signal: controller.signal,
    });
  } catch {
    throw new InstantlyApiError(
      0,
      "INSTANTLY_UNAVAILABLE",
      "Instantly could not be reached",
    );
  } finally {
    clearTimeout(timeout);
  }

  if (!response.ok) throw providerFailure(response.status);
  if (response.status === 204) return undefined as T;

  const declaredLength = Number(response.headers.get("content-length") ?? "0");
  if (
    Number.isFinite(declaredLength) &&
    declaredLength > MAX_PROVIDER_RESPONSE_BYTES
  ) {
    throw new InstantlyApiError(
      502,
      "INSTANTLY_RESPONSE_INVALID",
      "Instantly returned an invalid response",
    );
  }
  const raw = await response.text();
  if (new TextEncoder().encode(raw).byteLength > MAX_PROVIDER_RESPONSE_BYTES) {
    throw new InstantlyApiError(
      502,
      "INSTANTLY_RESPONSE_INVALID",
      "Instantly returned an invalid response",
    );
  }
  try {
    return JSON.parse(raw) as T;
  } catch {
    throw new InstantlyApiError(
      502,
      "INSTANTLY_RESPONSE_INVALID",
      "Instantly returned an invalid response",
    );
  }
}

function record(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function providerUuid(value: unknown): string | null {
  return typeof value === "string" &&
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
        value,
      )
    ? value.toLowerCase()
    : null;
}

function finiteInteger(value: unknown, fallback = 0): number {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0
    ? value
    : fallback;
}

export async function getInstantlyWorkspace(
  apiKey: string,
): Promise<InstantlyWorkspace> {
  const response = record(
    await instantlyRequest<unknown>(apiKey, "/workspaces/current"),
  );
  const id = providerUuid(response?.id);
  const name = typeof response?.name === "string" ? response.name.trim() : "";
  if (!id || !name || name.length > 300) {
    throw new InstantlyApiError(
      502,
      "INSTANTLY_RESPONSE_INVALID",
      "Instantly returned an invalid workspace",
    );
  }
  return { id, name };
}

export async function listInstantlyAccounts(
  apiKey: string,
): Promise<InstantlyAccountSummary[]> {
  const accounts = new Map<string, InstantlyAccountSummary>();
  let startingAfter = "";

  for (let page = 0; page < MAX_ACCOUNT_PAGES; page += 1) {
    const query = new URLSearchParams({ limit: "100" });
    if (startingAfter) query.set("starting_after", startingAfter);
    const response = record(
      await instantlyRequest<unknown>(apiKey, "/accounts", { query }),
    );
    const items = Array.isArray(response?.items) ? response.items : null;
    if (!items) {
      throw new InstantlyApiError(
        502,
        "INSTANTLY_RESPONSE_INVALID",
        "Instantly returned an invalid account list",
      );
    }
    for (const item of items) {
      const account = record(item);
      const email = typeof account?.email === "string"
        ? account.email.trim().toLowerCase()
        : "";
      const status =
        typeof account?.status === "number" && Number.isInteger(account.status)
          ? account.status
          : null;
      if (!email || email.length > 254 || status === null) continue;
      accounts.set(email, {
        email,
        first_name: typeof account?.first_name === "string"
          ? account.first_name.slice(0, 200)
          : null,
        last_name: typeof account?.last_name === "string"
          ? account.last_name.slice(0, 200)
          : null,
        status,
        warmup_status: typeof account?.warmup_status === "number" &&
            Number.isInteger(account.warmup_status)
          ? account.warmup_status
          : null,
        daily_limit: typeof account?.daily_limit === "number" &&
            Number.isInteger(account.daily_limit)
          ? account.daily_limit
          : null,
      });
    }
    const next = typeof response?.next_starting_after === "string"
      ? response.next_starting_after.trim()
      : "";
    if (!next || next === startingAfter) break;
    startingAfter = next;
  }

  return Array.from(accounts.values()).sort((left, right) =>
    left.email.localeCompare(right.email)
  );
}

export function safeInstantlyAnalytics(
  value: unknown,
): InstantlyAnalyticsSummary {
  const analytics = record(value);
  return {
    emails_sent_count: finiteInteger(analytics?.emails_sent_count),
    contacted_count: finiteInteger(analytics?.contacted_count),
    open_count_unique: finiteInteger(analytics?.open_count_unique),
    reply_count_unique: finiteInteger(analytics?.reply_count_unique),
    bounced_count: finiteInteger(analytics?.bounced_count),
    unsubscribed_count: finiteInteger(analytics?.unsubscribed_count),
    total_interested: finiteInteger(analytics?.total_interested),
    total_meeting_booked: finiteInteger(analytics?.total_meeting_booked),
  };
}

export function instantlyCampaignStatus(value: unknown): number | null {
  return typeof value === "number" &&
      Number.isInteger(value) &&
      [-99, -2, -1, 0, 1, 2, 3, 4].includes(value)
    ? value
    : null;
}

export function localCampaignStatus(
  providerStatus: number | null,
): "draft" | "active" | "paused" | "completed" | "attention" {
  if (providerStatus === 1) return "active";
  if (providerStatus === 2) return "paused";
  if (providerStatus === 3) return "completed";
  if (
    providerStatus === -99 || providerStatus === -2 || providerStatus === -1 ||
    providerStatus === 4
  ) return "attention";
  return "draft";
}

export function safeInstantlyError(
  error: unknown,
): { code: string; message: string; status: number } {
  if (error instanceof InstantlyApiError) {
    return { code: error.code, message: error.message, status: error.status };
  }
  if (error instanceof HttpError) {
    return { code: error.code, message: error.message, status: error.status };
  }
  return {
    code: "INSTANTLY_REQUEST_FAILED",
    message: "Instantly could not complete the request",
    status: 502,
  };
}
