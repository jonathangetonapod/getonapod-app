/*
 * How a scan treats a failed podcast index call. A refusal (401/403) will not
 * change on the next page, so it stops the scan at once; the audit scan sent
 * 21 refused requests over most of a minute and then said nothing was new.
 * A timeout or 5xx may be transient, so it gets two more tries and then stops.
 */

export type PodscanFailureKind =
  | 'rejected'
  | 'unavailable'
  | 'rate_limited'
  | 'insufficient_credits'
  | 'other'

export interface PodscanFailure {
  kind: PodscanFailureKind
  /** The index's own status where the proxy passed it on (PODSCAN_UPSTREAM_403 → 403). */
  upstreamStatus: number | null
  message: string
  retryAfterSeconds?: number
}

interface CodedError {
  code?: string | null
  status?: number
  retryAfterSeconds?: number
  creditsCharged?: number
  creditsRefunded?: number
}

export const PODSCAN_RETRY_DELAYS_MS = [1_000, 2_000]
const MAX_RATE_LIMIT_WAIT_MS = 5_000

export function classifyPodscanError(error: unknown): PodscanFailure {
  const coded = (error && typeof error === 'object' ? error : {}) as CodedError
  const message = error instanceof Error && error.message ? error.message : 'Podscan request failed.'
  const code = typeof coded.code === 'string' ? coded.code : ''
  const upstream = /^PODSCAN_UPSTREAM_(\d{3})$/u.exec(code)
  if (upstream) {
    const status = Number(upstream[1])
    if (status === 401 || status === 403) return { kind: 'rejected', upstreamStatus: status, message }
    if (status >= 500) return { kind: 'unavailable', upstreamStatus: status, message }
    return { kind: 'other', upstreamStatus: status, message }
  }
  if (code === 'SERVER_MISCONFIGURED') return { kind: 'rejected', upstreamStatus: null, message }
  if (code === 'PODSCAN_TIMEOUT') return { kind: 'unavailable', upstreamStatus: 504, message }
  if (code === 'PODSCAN_UNAVAILABLE') return { kind: 'unavailable', upstreamStatus: null, message }
  if (code === 'PODSCAN_RATE_LIMIT' || code === 'PODSCAN_CONCURRENCY_LIMIT') {
    return { kind: 'rate_limited', upstreamStatus: 429, message, retryAfterSeconds: coded.retryAfterSeconds }
  }
  if (code === 'INSUFFICIENT_CREDITS') return { kind: 'insufficient_credits', upstreamStatus: null, message }
  // No code and no response at all is the network, not the request.
  if (!code && coded.status === undefined) return { kind: 'unavailable', upstreamStatus: null, message }
  if (!code && typeof coded.status === 'number' && coded.status >= 500) {
    return { kind: 'unavailable', upstreamStatus: null, message }
  }
  return { kind: 'other', upstreamStatus: null, message }
}

/** Whether a failure of this kind should end the whole scan rather than one page. */
export function stopsScan(failure: PodscanFailure): boolean {
  return failure.kind !== 'other'
}

/** What a failed proxy call charged and what the server confirmed it gave back. */
export function creditsMovedBy(error: unknown): { charged: number; refunded: number } {
  const coded = (error && typeof error === 'object' ? error : {}) as CodedError
  const count = (value: unknown) => (typeof value === 'number' && value > 0 ? value : 0)
  return { charged: count(coded.creditsCharged), refunded: count(coded.creditsRefunded) }
}

export class PodscanSearchError extends Error {
  readonly failure: PodscanFailure

  constructor(failure: PodscanFailure) {
    super(failure.message)
    this.name = 'PodscanSearchError'
    this.failure = failure
  }
}

interface RetryOptions {
  /** Called for every failed attempt, retried or not, so refunds can be tallied. */
  onFailedAttempt?: (error: unknown) => void
  /** Checked before each retry; a cancelled scan must not keep paying for tries. */
  isCancelled?: () => boolean
  sleep?: (ms: number) => Promise<void>
}

const defaultSleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms))

/**
 * Runs one index call with the scan's retry policy. Throws PodscanSearchError
 * with the classified failure once the call cannot succeed.
 */
export async function withPodscanRetry<T>(run: () => Promise<T>, options: RetryOptions = {}): Promise<T> {
  const sleep = options.sleep ?? defaultSleep
  for (let attempt = 0; ; attempt += 1) {
    try {
      return await run()
    } catch (error) {
      options.onFailedAttempt?.(error)
      const failure = classifyPodscanError(error)
      const retryable = failure.kind === 'unavailable' || failure.kind === 'rate_limited'
      if (!retryable || attempt >= PODSCAN_RETRY_DELAYS_MS.length || options.isCancelled?.()) {
        throw new PodscanSearchError(failure)
      }
      const delay = failure.kind === 'rate_limited' && failure.retryAfterSeconds
        ? Math.min(failure.retryAfterSeconds * 1_000, MAX_RATE_LIMIT_WAIT_MS)
        : PODSCAN_RETRY_DELAYS_MS[attempt]
      await sleep(delay)
      if (options.isCancelled?.()) throw new PodscanSearchError(failure)
    }
  }
}

/** The reason line the failure panel shows. Plain, no em dashes. */
export function podscanFailureReason(failure: PodscanFailure): string {
  const status = failure.upstreamStatus ? ` (error ${failure.upstreamStatus})` : ''
  switch (failure.kind) {
    case 'rejected':
      return `The podcast index rejected the request${status}.`
    case 'unavailable':
      return failure.upstreamStatus
        ? `The podcast index is not responding${status}.`
        : 'The podcast index could not be reached.'
    case 'rate_limited':
      return 'The podcast index is limiting requests right now.'
    case 'insufficient_credits':
      return 'There are not enough credits to search the podcast index.'
    default:
      return failure.message
  }
}
