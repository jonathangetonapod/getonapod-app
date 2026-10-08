import { HttpError } from './httpError.ts'

/**
 * Throttling for the public capability pages (/client/:slug, /prospect/:slug).
 *
 * Anyone holding the link can write, so the limits sit on two axes: the
 * dashboard (however many people share it) and the caller address (however
 * many dashboards it touches). Both are generous enough for a real client
 * working through a hundred-podcast shortlist and re-deciding some of them.
 */
export const PUBLIC_FEEDBACK_LIMITS = {
  perDashboard: { limit: 300, windowSeconds: 60 * 60 },
  perAddress: { limit: 120, windowSeconds: 10 * 60 },
} as const

/** One recorded view per dashboard per caller per hour. */
export const PUBLIC_VIEW_DEDUPE_WINDOW_SECONDS = 60 * 60

// Callers with no address header share one bucket rather than skipping the
// limit: stripping headers must never buy a bigger allowance.
export const UNIDENTIFIED_ADDRESS = 'unidentified'

export const PUBLIC_RATE_LIMITED_CODE = 'RATE_LIMITED'
export const PUBLIC_RATE_LIMITED_MESSAGE =
  'You are saving choices faster than we can record them. Wait a few minutes, then try again. Nothing you already saved was lost.'

type RpcClient = {
  // deno-lint-ignore no-explicit-any
  rpc: (fn: string, args: Record<string, unknown>) => PromiseLike<{ data: any; error: unknown }>
}

/**
 * The caller's address, read the same way request-workspace-access reads it.
 *
 * `cf-connecting-ip` is set by the edge, not the caller. `x-forwarded-for` is a
 * list the client can prepend to, so only its last entry (what the nearest
 * proxy appended) is trusted.
 */
export function callerAddress(req: Request): string | null {
  const direct = req.headers.get('cf-connecting-ip')?.trim()
  if (direct) return direct
  const chain = req.headers.get('x-forwarded-for')?.split(',').map((part) => part.trim()).filter(Boolean)
  return chain?.length ? chain[chain.length - 1] : null
}

/**
 * A salted hash of the caller address, for counting only. Salted with the
 * service role key, which never leaves the function, so a stored value cannot
 * be turned back into an address by anyone reading the table.
 */
export async function hashedCallerAddress(req: Request): Promise<string> {
  const address = callerAddress(req)
  if (!address) return UNIDENTIFIED_ADDRESS
  const salt = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(`${salt}:${address}`))
  return Array.from(new Uint8Array(digest)).map((byte) => byte.toString(16).padStart(2, '0')).join('')
}

export interface RateBucket {
  bucket: string
  limit: number
  windowSeconds: number
}

/**
 * Reserve one event in every bucket, atomically. Returns false when any bucket
 * is at its limit. Throws when the reservation itself fails, so callers decide
 * whether to fail open or closed.
 */
export async function reservePublicRate(admin: RpcClient, buckets: RateBucket[]): Promise<boolean> {
  const { data, error } = await admin.rpc('reserve_public_capability_rate_v1', {
    p_buckets: buckets.map((entry) => entry.bucket),
    p_limits: buckets.map((entry) => entry.limit),
    p_window_seconds: buckets.map((entry) => entry.windowSeconds),
  })
  if (error) throw new Error('public rate limit reservation failed')
  return data === true
}

/**
 * Enforce the public feedback limits for one dashboard write. Throws a coded
 * 429 when either bucket is full.
 *
 * A broken limiter must not take a client's approvals down with it: if the
 * reservation call itself errors, the write goes ahead and the failure is
 * logged. The limiter is abuse protection, not a correctness guarantee.
 */
export async function enforcePublicFeedbackRate(
  admin: RpcClient,
  req: Request,
  scope: 'client' | 'prospect',
  dashboardId: string,
): Promise<void> {
  const addressHash = await hashedCallerAddress(req)
  let allowed: boolean
  try {
    allowed = await reservePublicRate(admin, [
      {
        bucket: `feedback:${scope}:${dashboardId}`,
        limit: PUBLIC_FEEDBACK_LIMITS.perDashboard.limit,
        windowSeconds: PUBLIC_FEEDBACK_LIMITS.perDashboard.windowSeconds,
      },
      {
        bucket: `feedback-ip:${addressHash}`,
        limit: PUBLIC_FEEDBACK_LIMITS.perAddress.limit,
        windowSeconds: PUBLIC_FEEDBACK_LIMITS.perAddress.windowSeconds,
      },
    ])
  } catch {
    console.error('[Public Rate Limit] Reservation failed; allowing the write')
    return
  }
  if (!allowed) {
    throw new HttpError(429, PUBLIC_RATE_LIMITED_CODE, PUBLIC_RATE_LIMITED_MESSAGE)
  }
}

/**
 * True the first time this caller views this dashboard within the dedupe
 * window. A limiter failure counts the view rather than dropping it.
 */
export async function shouldRecordPublicView(
  admin: RpcClient,
  req: Request,
  scope: 'client' | 'prospect',
  dashboardId: string,
): Promise<boolean> {
  const addressHash = await hashedCallerAddress(req)
  try {
    return await reservePublicRate(admin, [{
      bucket: `view:${scope}:${dashboardId}:${addressHash}`.slice(0, 200),
      limit: 1,
      windowSeconds: PUBLIC_VIEW_DEDUPE_WINDOW_SECONDS,
    }])
  } catch {
    return true
  }
}
