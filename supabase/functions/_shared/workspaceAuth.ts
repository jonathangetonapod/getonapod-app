import {
  createClient,
  type SupabaseClient,
  type User,
} from 'https://esm.sh/@supabase/supabase-js@2.39.3'

import { getCorsHeaders } from './cors.ts'

export const MEMBERSHIP_COLUMNS = [
  'id',
  'workspace_id',
  'user_id',
  'email_normalized',
  'full_name',
  'role',
  'status',
  'invited_by',
  'invited_at',
  'invite_expires_at',
  'accepted_at',
  'accepted_by',
  'suspended_at',
  'suspended_by',
  'revoked_at',
  'revoked_by',
  'created_at',
  'updated_at',
].join(',')

export const WORKSPACE_COLUMNS = [
  'id',
  'name',
  'slug',
  'status',
  'is_default',
  'created_by',
  'created_at',
  'updated_at',
].join(',')

export class HttpError extends Error {
  readonly status: number
  readonly code: string

  constructor(status: number, code: string, message: string) {
    super(message)
    this.name = 'HttpError'
    this.status = status
    this.code = code
  }
}

export interface AuthContext {
  admin: SupabaseClient
  user: User
  email: string
  platformAdmin: boolean
}

export interface AuditEvent {
  workspaceId?: string | null
  actorUserId: string
  action: string
  entityType: string
  entityId?: string | null
  metadata?: Record<string, unknown>
}

function requiredEnv(name: string): string {
  const value = Deno.env.get(name)?.trim()
  if (!value) {
    throw new HttpError(500, 'SERVER_MISCONFIGURED', 'The service is not configured')
  }
  return value
}

export function normalizeEmail(value: string): string {
  return value.trim().toLowerCase()
}

export function createAdminClient(): SupabaseClient {
  return createClient(
    requiredEnv('SUPABASE_URL'),
    requiredEnv('SUPABASE_SERVICE_ROLE_KEY'),
    {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    },
  )
}

function bearerToken(req: Request): string {
  const authorization = req.headers.get('authorization')
  const match = authorization?.match(/^Bearer\s+([^\s]+)$/i)
  if (!match) {
    throw new HttpError(401, 'AUTH_REQUIRED', 'Authentication is required')
  }
  return match[1]
}

export async function secretsMatch(left: string, right: string): Promise<boolean> {
  const encoder = new TextEncoder()
  const [leftHash, rightHash] = await Promise.all([
    crypto.subtle.digest('SHA-256', encoder.encode(left)),
    crypto.subtle.digest('SHA-256', encoder.encode(right)),
  ])
  const leftBytes = new Uint8Array(leftHash)
  const rightBytes = new Uint8Array(rightHash)
  let difference = leftBytes.length ^ rightBytes.length
  const length = Math.max(leftBytes.length, rightBytes.length)
  for (let index = 0; index < length; index += 1) {
    difference |= (leftBytes[index] ?? 0) ^ (rightBytes[index] ?? 0)
  }
  return difference === 0
}

export async function requireAuthenticatedUser(req: Request): Promise<AuthContext> {
  const admin = createAdminClient()
  const token = bearerToken(req)
  const { data, error } = await admin.auth.getUser(token)

  if (error || !data.user) {
    throw new HttpError(401, 'INVALID_AUTH', 'Authentication is invalid or expired')
  }

  const email = normalizeEmail(data.user.email ?? '')
  if (!email) {
    throw new HttpError(403, 'EMAIL_REQUIRED', 'A verified account email is required')
  }

  // The legacy admin table is the platform-operator allowlist. It is queried
  // with the service client so a broken/missing RLS policy cannot grant access.
  const { data: platformAdmin, error: adminError } = await admin.rpc(
    'is_platform_admin_email',
    { p_email: email },
  )

  if (adminError) {
    throw new HttpError(500, 'AUTHORIZATION_UNAVAILABLE', 'Authorization could not be verified')
  }

  return {
    admin,
    user: data.user,
    email,
    platformAdmin: platformAdmin === true,
  }
}

export async function requirePlatformAdmin(req: Request): Promise<AuthContext> {
  const context = await requireAuthenticatedUser(req)
  if (!context.platformAdmin) {
    throw new HttpError(403, 'PLATFORM_ADMIN_REQUIRED', 'Platform administrator access is required')
  }
  return context
}

/**
 * Transitional guard for legacy operational functions. Browser calls must be
 * made by a platform administrator; existing function-to-function calls may
 * continue using the service-role bearer they already use. New tenant
 * functions should use requireAuthenticatedUser plus explicit workspace checks
 * instead of this compatibility guard.
 */
export async function requirePlatformAdminOrService(
  req: Request,
): Promise<AuthContext | null> {
  const token = bearerToken(req)
  const serviceRoleKey = requiredEnv('SUPABASE_SERVICE_ROLE_KEY')
  if (await secretsMatch(token, serviceRoleKey)) return null
  return await requirePlatformAdmin(req)
}

export async function parseJsonObject(
  req: Request,
  maxBytes = 16_384,
): Promise<Record<string, unknown>> {
  const contentType = req.headers.get('content-type')?.toLowerCase() ?? ''
  if (!contentType.includes('application/json')) {
    throw new HttpError(415, 'JSON_REQUIRED', 'Content-Type must be application/json')
  }

  const declaredLength = Number(req.headers.get('content-length') ?? '0')
  if (Number.isFinite(declaredLength) && declaredLength > maxBytes) {
    throw new HttpError(413, 'BODY_TOO_LARGE', 'Request body is too large')
  }

  const raw = await req.text()
  if (new TextEncoder().encode(raw).byteLength > maxBytes) {
    throw new HttpError(413, 'BODY_TOO_LARGE', 'Request body is too large')
  }

  let value: unknown
  try {
    value = JSON.parse(raw)
  } catch {
    throw new HttpError(400, 'INVALID_JSON', 'Request body must be valid JSON')
  }

  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new HttpError(400, 'INVALID_BODY', 'Request body must be a JSON object')
  }

  return value as Record<string, unknown>
}

export async function parseOptionalJsonObject(
  req: Request,
  maxBytes = 16_384,
): Promise<Record<string, unknown>> {
  const declaredLength = Number(req.headers.get('content-length') ?? '0')
  if (Number.isFinite(declaredLength) && declaredLength > maxBytes) {
    throw new HttpError(413, 'BODY_TOO_LARGE', 'Request body is too large')
  }

  const raw = await req.text()
  if (new TextEncoder().encode(raw).byteLength > maxBytes) {
    throw new HttpError(413, 'BODY_TOO_LARGE', 'Request body is too large')
  }
  if (!raw.trim()) return {}

  const contentType = req.headers.get('content-type')?.toLowerCase() ?? ''
  if (!contentType.includes('application/json')) {
    throw new HttpError(415, 'JSON_REQUIRED', 'Content-Type must be application/json')
  }

  let value: unknown
  try {
    value = JSON.parse(raw)
  } catch {
    throw new HttpError(400, 'INVALID_JSON', 'Request body must be valid JSON')
  }
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new HttpError(400, 'INVALID_BODY', 'Request body must be a JSON object')
  }
  return value as Record<string, unknown>
}

export function requireOnlyKeys(
  body: Record<string, unknown>,
  allowedKeys: readonly string[],
): void {
  const allowed = new Set(allowedKeys)
  if (Object.keys(body).some((key) => !allowed.has(key))) {
    throw new HttpError(400, 'UNKNOWN_FIELD', 'Request body contains an unknown field')
  }
}

export function requireUuid(value: unknown, field: string): string {
  if (
    typeof value !== 'string' ||
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)
  ) {
    throw new HttpError(400, 'INVALID_FIELD', `${field} must be a valid UUID`)
  }
  return value.toLowerCase()
}

export function requireString(
  value: unknown,
  field: string,
  options: { min?: number; max: number },
): string {
  if (typeof value !== 'string') {
    throw new HttpError(400, 'INVALID_FIELD', `${field} must be a string`)
  }
  const result = value.trim()
  if (result.length < (options.min ?? 1) || result.length > options.max) {
    throw new HttpError(
      400,
      'INVALID_FIELD',
      `${field} must be between ${options.min ?? 1} and ${options.max} characters`,
    )
  }
  return result
}

export function requireEmail(value: unknown): string {
  const email = requireString(value, 'email', { max: 254 }).toLowerCase()
  // Deliberately conservative: Supabase Auth performs the authoritative email
  // validation, while this rejects malformed input before any data is written.
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throw new HttpError(400, 'INVALID_EMAIL', 'email must be a valid email address')
  }
  return email
}

export function optionalString(
  value: unknown,
  field: string,
  max: number,
): string | null {
  if (value === undefined || value === null || value === '') return null
  return requireString(value, field, { max })
}

export function inviteRedirectUrl(membershipId: string): string {
  const configured = [Deno.env.get('APP_URL'), Deno.env.get('WEB_URL')]
    .map((value) => value?.trim())
    .filter((value): value is string => Boolean(value))

  if (configured.length === 0) {
    throw new HttpError(500, 'SERVER_MISCONFIGURED', 'The invite redirect is not configured')
  }

  for (const candidate of configured) {
    try {
      const parsed = new URL(candidate)
      const localDevelopment = parsed.hostname === 'localhost' || parsed.hostname === '127.0.0.1'
      if (parsed.protocol !== 'https:' && !(localDevelopment && parsed.protocol === 'http:')) {
        continue
      }

      // Only an environment-configured origin is used. Paths, queries and
      // fragments from configuration or request input never reach the redirect.
      const redirect = new URL('/accept-invite', parsed.origin)
      redirect.searchParams.set('membership_id', membershipId)
      return redirect.toString()
    } catch {
      // Try the other explicitly configured application URL.
    }
  }

  throw new HttpError(500, 'SERVER_MISCONFIGURED', 'The invite redirect is not configured')
}

export async function writeAudit(admin: SupabaseClient, event: AuditEvent): Promise<void> {
  const { error } = await admin.from('workspace_audit_log').insert({
    workspace_id: event.workspaceId ?? null,
    actor_user_id: event.actorUserId,
    action: event.action,
    entity_type: event.entityType,
    entity_id: event.entityId ?? null,
    metadata: event.metadata ?? {},
  })

  if (error) {
    throw new HttpError(500, 'AUDIT_WRITE_FAILED', 'The operation could not be audited')
  }
}

export function responseHeaders(req: Request, methods: readonly string[]): Record<string, string> {
  return {
    ...getCorsHeaders(req),
    'Access-Control-Allow-Methods': [...methods, 'OPTIONS'].join(', '),
    'Access-Control-Max-Age': '86400',
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
    'Vary': 'Origin',
  }
}

export function jsonResponse(
  req: Request,
  methods: readonly string[],
  status: number,
  body: unknown,
): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: responseHeaders(req, methods),
  })
}

export function optionsResponse(req: Request, methods: readonly string[]): Response {
  const headers = responseHeaders(req, methods)
  delete headers['Content-Type']
  return new Response(null, { status: 204, headers })
}

export function errorResponse(req: Request, methods: readonly string[], error: unknown): Response {
  if (error instanceof HttpError) {
    return jsonResponse(req, methods, error.status, {
      error: error.message,
      code: error.code,
    })
  }

  // Do not serialize database/Auth errors or request data into responses/logs.
  console.error('Workspace function failed with an unexpected error')
  return jsonResponse(req, methods, 500, {
    error: 'Internal server error',
    code: 'INTERNAL_ERROR',
  })
}
