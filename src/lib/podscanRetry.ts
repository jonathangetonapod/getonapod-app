import { CREDIT_COSTS, creditsLabel } from '@/lib/creditCosts'

/**
 * How the finder treats a failed podcast index request.
 *
 * - `auth`: the index refused our key (401) or our account (403), or no key
 *   is configured. Retrying cannot fix that, so the scan stops on the first one.
 * - `retryable`: a timeout, a 5xx, a rate limit or a dropped connection. Worth
 *   a couple more tries with backoff, never more.
 * - `fatal`: anything else, such as an empty credit balance or the index's
 *   spent daily quota. Stop and say so.
 */
export type PodscanErrorKind = 'auth' | 'retryable' | 'fatal'

interface PodscanErrorFields {
  code?: string | null
  status?: number
  retryAfterSeconds?: number
  creditsCharged?: number
  creditsRefunded?: number
}

function fields(error: unknown): PodscanErrorFields {
  return error && typeof error === 'object' ? error as PodscanErrorFields : {}
}

/** The upstream HTTP status, from PODSCAN_UPSTREAM_403 or the response itself. */
export function podscanErrorStatus(error: unknown): number | null {
  const { code, status } = fields(error)
  const match = typeof code === 'string' ? /^PODSCAN_UPSTREAM_(\d{3})$/u.exec(code) : null
  if (match) return Number(match[1])
  return typeof status === 'number' ? status : null
}

export function classifyPodscanError(error: unknown): PodscanErrorKind {
  const { code } = fields(error)
  const status = podscanErrorStatus(error)
  if (code === 'PROVIDER_KEY_REQUIRED' || code === 'PROVIDER_KEY_REJECTED') return 'auth'
  if (code === 'PROVIDER_BILLING_REQUIRED' || code === 'SUBSCRIPTION_REQUIRED') return 'fatal'
  if (status === 401 || status === 403 || code === 'PODSCAN_NOT_CONFIGURED') return 'auth'
  // Both fail the same way however often they are tried: the quota resets
  // once a day, and the same request returns the same oversized response.
  if (code === 'PODSCAN_DAILY_LIMIT' || code === 'PODSCAN_RESPONSE_TOO_LARGE') return 'fatal'
  if (code === 'PODSCAN_TIMEOUT' || code === 'PODSCAN_UNAVAILABLE'
    || code === 'PODSCAN_RATE_LIMIT' || code === 'PODSCAN_CONCURRENCY_LIMIT') return 'retryable'
  if (status === null || status === 429 || status >= 500) return 'retryable'
  return 'fatal'
}

/** One plain sentence for the failure panel and the toast. */
export function podscanFailureReason(error: unknown): string {
  const { code } = fields(error)
  const status = podscanErrorStatus(error)
  if (status === 401 || status === 403) return `The podcast index rejected the request (error ${status}).`
  if (code === 'PODSCAN_NOT_CONFIGURED') return 'The podcast index is not set up on the server. Contact support.'
  if (code === 'SUBSCRIPTION_REQUIRED') return 'Your workspace subscription needs attention. Open Billing to restore access.'
  if (code === 'PROVIDER_BILLING_REQUIRED') return 'Your Podscan account needs billing or quota attention. Check that provider account.'
  if (code === 'PROVIDER_KEY_REQUIRED' || code === 'PROVIDER_KEY_REJECTED') return 'Ask your workspace owner to connect a valid Podscan key in Billing.'
  if (code === 'INSUFFICIENT_CREDITS') return 'App credits are retired. Refresh the app and contact support if this continues.'
  if (status === 402) return 'Billing needs attention. Check your workspace subscription and the connected provider account.'
  if (code === 'PODSCAN_DAILY_LIMIT') return 'The podcast index\'s daily request limit is used up. It resets within a day.'
  if (code === 'PODSCAN_TIMEOUT') return 'The podcast index did not respond in time.'
  if (code === 'PODSCAN_RATE_LIMIT' || code === 'PODSCAN_CONCURRENCY_LIMIT' || status === 429) {
    return 'The podcast index is busy and turned the request away.'
  }
  if (code === 'PODSCAN_UNAVAILABLE' || status === null) return 'The podcast index could not be reached.'
  return `The podcast index returned an error (error ${status}).`
}

export const PODSCAN_MAX_RETRIES = 2
export const PODSCAN_RETRY_BASE_MS = 1_000
// A Retry-After longer than this is not worth holding the scan open for.
const MAX_RETRY_WAIT_MS = 5_000

export interface PodscanAttemptCredits {
  charged: number
  refunded: number
}

/**
 * Runs one index request with the finder's retry policy: stop at once on a
 * 401/403 or a fatal error, retry a retryable one at most twice with backoff.
 * `onFailedAttempt` sees every failed try so the caller can count credits
 * charged and refunded for each one.
 */
export async function withPodscanRetry<T>(
  request: () => Promise<T>,
  options: {
    onFailedAttempt?: (credits: PodscanAttemptCredits) => void
    shouldContinue?: () => boolean
    sleep?: (ms: number) => Promise<void>
  } = {},
): Promise<T> {
  const sleep = options.sleep ?? ((ms: number) => new Promise<void>((resolve) => window.setTimeout(resolve, ms)))
  for (let attempt = 0; ; attempt += 1) {
    try {
      return await request()
    } catch (error) {
      const { creditsCharged, creditsRefunded } = fields(error)
      options.onFailedAttempt?.({ charged: creditsCharged ?? 0, refunded: creditsRefunded ?? 0 })
      if (classifyPodscanError(error) !== 'retryable' || attempt >= PODSCAN_MAX_RETRIES) throw error
      const retryAfterMs = (fields(error).retryAfterSeconds ?? 0) * 1_000
      await sleep(Math.min(MAX_RETRY_WAIT_MS, Math.max(retryAfterMs, PODSCAN_RETRY_BASE_MS * 2 ** attempt)))
      if (options.shouldContinue && !options.shouldContinue()) throw error
    }
  }
}

export interface ScanCreditTally {
  /** Credits for the AI strategy this scan drafted (it is kept for next time). */
  strategy: number
  /** Index lookups that returned results, each one charged. */
  successfulLookups: number
  /** Taken for failed lookups and given back, as the ledger confirmed. */
  refunded: number
  /** Taken for failed lookups and not confirmed as given back. */
  unrefunded: number
}

/** What a failed scan cost, in the panel's words. */
export function scanFailureCreditLine(tally: ScanCreditTally): string {
  const lookups = tally.successfulLookups * CREDIT_COSTS.podscan_lookup
  const spent = tally.strategy + lookups
  const refundNote = tally.refunded > 0
    ? ` ${creditsLabel(tally.refunded)} taken for the failed ${tally.refunded === 1 ? 'request was' : 'requests were'} refunded.`
    : ''
  const unrefundedNote = tally.unrefunded > 0
    ? ` ${creditsLabel(tally.unrefunded)} could not be refunded automatically. Contact support and we will put ${tally.unrefunded === 1 ? 'it' : 'them'} back.`
    : ''
  if (spent === 0) return `No credits were charged for this scan.${refundNote}${unrefundedNote}`
  const parts = [
    tally.strategy > 0 ? `${tally.strategy} for the AI search strategy` : null,
    lookups > 0 ? `${lookups} for the searches that worked` : null,
  ].filter(Boolean).join(' and ')
  const savedNote = tally.strategy > 0 ? ' The strategy is saved for your next try.' : ''
  return `This scan used ${creditsLabel(spent)}: ${parts}.${savedNote}${refundNote}${unrefundedNote}`
}
