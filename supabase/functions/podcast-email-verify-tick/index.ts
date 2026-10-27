import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'

import { createAdminClient, secretsMatch } from '../_shared/workspaceAuth.ts'

/**
 * Keeps the catalogue's inbox addresses verified.
 *
 * Every address the catalogue held on 2026-10-27 was checked once with
 * MillionVerifier's bulk API (scripts/verify-podcast-emails.mjs). Shows keep
 * arriving and inboxes go bad, so this tick checks what the database says is
 * due (podcast_email_verification_due): never-checked addresses first, then
 * results older than 90 days, an 'error' result after a day.
 *
 * Invoked by pg_cron via pg_net with a shared secret, so there is no user JWT
 * (verify_jwt = false), the same shape as podcast-catalog-refresh-tick. It only
 * writes podcast_email_verifications, in one upsert per tick: the contacts that
 * use an address re-pick from those rows on their own, once per statement.
 */
const API = 'https://api.millionverifier.com/api/v3/'
// About 43K checks a day at the 10-minute schedule; MillionVerifier credits
// are the only cost.
const DEFAULT_BATCH = 300
const MAX_BATCH = 1000
const CONCURRENCY = 10
// Inside pg_net's 150s wait for the call, with room to write the results.
// An address not reached in time has no new row and stays due.
const RUN_BUDGET_MS = 110_000
// Seconds MillionVerifier may spend on one mailbox before answering 'unknown'.
const MAILBOX_TIMEOUT_SECONDS = 20
// Failures about MillionVerifier rather than the address, in a row, before
// the sweep stops.
const MAX_TRANSIENT_FAILURES = 5
const STATUSES = new Set(['ok', 'catch_all', 'unknown', 'disposable', 'invalid', 'error'])

interface VerificationRow {
  normalized_email: string
  status: string
  subresult: string | null
  quality: string | null
  is_free: boolean | null
  is_role: boolean | null
  did_you_mean: string | null
  provider: string
  checked_at: string
  updated_at: string
}

function json(status: number, body: Record<string, unknown>): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

function batchSize(): number {
  const configured = Number(Deno.env.get('EMAIL_VERIFY_BATCH'))
  return Number.isInteger(configured) && configured > 0 ? Math.min(configured, MAX_BATCH) : DEFAULT_BATCH
}

function optionalText(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim().slice(0, 200) : null
}

serve(async (req) => {
  if (req.method !== 'POST') {
    return json(405, { error: 'method_not_allowed' })
  }
  const secret = Deno.env.get('EMAIL_VERIFY_SECRET')?.trim()
  const presentedSecret = req.headers.get('x-email-verify-secret') ?? ''
  if (!secret || !presentedSecret || !(await secretsMatch(presentedSecret, secret))) {
    return json(401, { error: 'unauthorized' })
  }
  const apiKey = Deno.env.get('MILLIONVERIFIER_API_KEY')?.trim()
  if (!apiKey) {
    return json(200, { verified: 0, error: 'millionverifier_not_configured' })
  }
  const deadlineAt = Date.now() + RUN_BUDGET_MS

  const admin = createAdminClient()
  const { data: due, error } = await admin.rpc('podcast_email_verification_due', { p_limit: batchSize() })
  if (error || !Array.isArray(due)) {
    console.error('[Email Verify] Due list unavailable', error?.message)
    return json(200, { verified: 0, error: 'due_list_unavailable' })
  }
  const dueEmails = due
    .map((row: { normalized_email?: unknown }) => row.normalized_email)
    .filter((value): value is string => typeof value === 'string')

  const rows: VerificationRow[] = []
  const counts: Record<string, number> = { failed: 0, not_reached: 0 }
  let stopReason: string | null = null
  let transientFailuresInARow = 0
  const queue = [...dueEmails]

  const verifyOne = async (email: string) => {
    const remaining = deadlineAt - Date.now()
    // Too little time left for MillionVerifier's own mailbox timeout: leave it due.
    if (remaining < (MAILBOX_TIMEOUT_SECONDS + 5) * 1000) {
      counts.not_reached += 1
      stopReason ??= 'run_budget_spent'
      return
    }
    let body: Record<string, unknown>
    try {
      const url = `${API}?api=${encodeURIComponent(apiKey)}&email=${encodeURIComponent(email)}&timeout=${MAILBOX_TIMEOUT_SECONDS}`
      const res = await fetch(url, { signal: AbortSignal.timeout(Math.min(remaining, (MAILBOX_TIMEOUT_SECONDS + 10) * 1000)) })
      if (res.status === 401 || res.status === 403) {
        counts.not_reached += 1
        stopReason ??= 'millionverifier_auth'
        return
      }
      if (!res.ok) throw new Error(`MillionVerifier ${res.status}`)
      body = await res.json()
    } catch (caught) {
      // A timeout or 5xx is about MillionVerifier, not the address: leave it
      // due, and stop once it looks like an outage.
      counts.not_reached += 1
      transientFailuresInARow += 1
      if (transientFailuresInARow >= MAX_TRANSIENT_FAILURES) stopReason ??= 'millionverifier_unavailable'
      // MillionVerifier only takes the key in the query string, and a fetch
      // error can echo the URL: the key and the address never reach the log.
      const message = caught instanceof Error ? caught.message : 'unknown error'
      console.error('[Email Verify] Check failed', message.replaceAll(apiKey, '[key]').replaceAll(email, '[email]').slice(0, 200))
      return
    }
    transientFailuresInARow = 0
    const result = typeof body.result === 'string' ? body.result : ''
    const apiError = optionalText(body.error)
    // A refused key or spent credits is not an answer about any address: stop
    // and write nothing for it.
    if (apiError && /api key|credit/iu.test(apiError)) {
      counts.not_reached += 1
      stopReason ??= /credit/iu.test(apiError) ? 'millionverifier_no_credits' : 'millionverifier_auth'
      return
    }
    if (!STATUSES.has(result)) {
      counts.failed += 1
      return
    }
    const now = new Date().toISOString()
    rows.push({
      normalized_email: email,
      status: result,
      subresult: optionalText(body.subresult),
      quality: optionalText(body.quality),
      is_free: typeof body.free === 'boolean' ? body.free : null,
      is_role: typeof body.role === 'boolean' ? body.role : null,
      did_you_mean: optionalText(body.didyoumean),
      provider: 'millionverifier',
      checked_at: now,
      updated_at: now,
    })
    counts[result] = (counts[result] ?? 0) + 1
  }

  const worker = async () => {
    while (queue.length > 0 && !stopReason) {
      await verifyOne(queue.shift() as string)
    }
  }
  await Promise.all(Array.from({ length: CONCURRENCY }, worker))
  counts.not_reached += queue.length

  // One upsert per tick: each statement is one contact re-pick pass.
  if (rows.length > 0) {
    const { error: saveError } = await admin
      .from('podcast_email_verifications')
      .upsert(rows, { onConflict: 'normalized_email' })
    if (saveError) {
      console.error('[Email Verify] Results could not be saved', saveError.message)
      return json(200, { due: dueEmails.length, verified: 0, error: 'save_failed', checked: rows.length })
    }
  }

  return json(200, {
    due: dueEmails.length,
    verified: rows.length,
    ...counts,
    stopped_early: stopReason,
  })
})
