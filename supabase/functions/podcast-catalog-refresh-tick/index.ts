import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'

import { HttpError } from '../_shared/httpError.ts'
import {
  isPodscanAuthError,
  isPodscanDeadlineError,
  isPodscanId,
  isRetryablePodscanError,
  podscanApiKey,
  podscanFetch,
  podscanPodcastPayload,
  podscanUpstreamStatus,
  PODSCAN_MAX_CONCURRENT,
  PodscanRateLimitError,
} from '../_shared/podscan.ts'
import { catalogFieldsFromPodscan } from '../_shared/podcastRefresh.ts'
import { createAdminClient, secretsMatch } from '../_shared/workspaceAuth.ts'

/**
 * Keeps the shared podcast catalogue current.
 *
 * Nothing refreshed a catalogue row on a schedule. A show was re-read from
 * Podscan only when some other flow happened to fetch it, so most of the
 * catalogue went months without a check, and the Podcast Database's "Still
 * publishing" filter, which needs a recent episode, quietly lost shows that
 * were still recording.
 *
 * Invoked by pg_cron via pg_net with a shared secret, so there is no user JWT
 * (verify_jwt = false), the same shape as workspace-domain-tick. The database
 * decides what is due (podcast_catalog_refresh_due): shows on a client or
 * prospect shortlist after 7 days, every other show after 30, oldest first.
 * The batch size is the Podscan budget: CATALOG_REFRESH_BATCH shows per tick.
 */
// About 1,320 Podscan lookups a day at the hourly schedule.
const DEFAULT_BATCH = 55
const MAX_BATCH = 100
// Inside pg_net's 150s wait for the call, with room to write the last rows.
// A show not reached in time is left exactly as it was and stays due.
const RUN_BUDGET_MS = 110_000
// Failures that are about Podscan rather than the show (5xx, timeouts) in a
// row before the sweep stops: an outage is not a reason to push shows back.
const MAX_TRANSIENT_FAILURES = 3

function json(status: number, body: Record<string, unknown>): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

function batchSize(): number {
  const configured = Number(Deno.env.get('CATALOG_REFRESH_BATCH'))
  return Number.isInteger(configured) && configured > 0 ? Math.min(configured, MAX_BATCH) : DEFAULT_BATCH
}

serve(async (req) => {
  if (req.method !== 'POST') {
    return json(405, { error: 'method_not_allowed' })
  }
  const secret = Deno.env.get('CATALOG_REFRESH_SECRET')?.trim()
  const presentedSecret = req.headers.get('x-catalog-refresh-secret') ?? ''
  if (!secret || !presentedSecret || !(await secretsMatch(presentedSecret, secret))) {
    return json(401, { error: 'unauthorized' })
  }
  if (!podscanApiKey()) {
    return json(200, { refreshed: 0, error: 'podscan_not_configured' })
  }
  const deadlineAt = Date.now() + RUN_BUDGET_MS

  const admin = createAdminClient()
  const { data: due, error } = await admin.rpc('podcast_catalog_refresh_due', { p_limit: batchSize() })
  if (error || !Array.isArray(due)) {
    console.error('[Catalog Refresh] Due list unavailable', error?.message)
    return json(200, { refreshed: 0, error: 'due_list_unavailable' })
  }
  const dueIds = due
    .map((row: { podscan_id?: unknown }) => row.podscan_id)
    .filter((value): value is string => typeof value === 'string')

  // Recorded on every show the tick got an answer about, so a show Podscan
  // keeps failing on goes to the back of the queue instead of blocking it.
  // Not recorded for shows the tick never reached.
  const markAttempted = async (podscanId: string, extra: Record<string, unknown> = {}) => {
    const { data, error: updateError } = await admin
      .from('podcasts')
      .update({ ...extra, catalog_refresh_attempted_at: new Date().toISOString() })
      .eq('podscan_id', podscanId)
      .select('podscan_id')
    if (updateError) throw new Error(`Catalog row could not be updated: ${updateError.message}`)
    return (data ?? []).length
  }

  const counts = { refreshed: 0, not_found: 0, invalid_id: 0, failed: 0, not_reached: 0 }
  const errors: Array<{ podscan_id: string; message: string }> = []
  let stopReason: string | null = null
  let transientFailuresInARow = 0
  const queue = [...dueIds]
  const recordError = (podscanId: string, caught: unknown) => {
    errors.push({
      podscan_id: podscanId,
      message: caught instanceof HttpError
        ? caught.code
        : caught instanceof Error ? caught.message.slice(0, 300) : 'unknown error',
    })
  }

  const refreshOne = async (podscanId: string) => {
    // An id the Podscan client will not put in a path is recorded and skipped,
    // so it does not come back at the front of every tick.
    if (!isPodscanId(podscanId)) {
      await markAttempted(podscanId).catch(() => undefined)
      counts.invalid_id += 1
      return
    }
    try {
      const { data } = await podscanFetch(`/podcasts/${podscanId}`, { retries: 1, deadlineAt })
      transientFailuresInARow = 0
      const fields = catalogFieldsFromPodscan(podscanPodcastPayload(data))
      // A 200 with no podcast in it is not a refresh: the show is recorded as
      // tried, but its data and fetch date are left as they were.
      if (!fields.podcast_name) {
        await markAttempted(podscanId)
        counts.failed += 1
        errors.push({ podscan_id: podscanId, message: 'PODSCAN_EMPTY_PODCAST' })
        return
      }
      const updated = await markAttempted(podscanId, {
        ...fields,
        podscan_last_fetched_at: new Date().toISOString(),
      })
      if (updated > 0) counts.refreshed += 1
      else counts.failed += 1
    } catch (caught) {
      if (isPodscanDeadlineError(caught)) {
        // The run's time ran out before Podscan answered: not an answer about
        // this show, so nothing is recorded and it stays at the front.
        counts.not_reached += 1
        stopReason ??= 'run_budget_spent'
        return
      }
      if (caught instanceof PodscanRateLimitError) {
        // Podscan asked us to stop (the shared client already retried a short
        // limit once). The rest of the batch stays due for the next tick.
        counts.not_reached += 1
        stopReason ??= caught.code === 'PODSCAN_DAILY_LIMIT' ? 'podscan_daily_limit' : 'podscan_rate_limit'
        return
      }
      // A 404 is Podscan's answer that it has no such show. The row is kept as
      // it was rather than switched off on one reply: a show that has really
      // gone stops counting as still publishing once its last episode is more
      // than 90 days old, and a transient 404 cannot hide a live one.
      if (podscanUpstreamStatus(caught) === 404) {
        await markAttempted(podscanId).catch(() => undefined)
        counts.not_found += 1
        return
      }
      // A refused key says nothing about any show: stop, and touch nothing.
      if (isPodscanAuthError(caught)) {
        counts.not_reached += 1
        recordError(podscanId, caught)
        stopReason ??= 'podscan_auth'
        return
      }
      // A 5xx or timeout (after the client's own retry) is about Podscan, not
      // the show: leave it due, and stop once it looks like an outage.
      if (isRetryablePodscanError(caught)) {
        counts.not_reached += 1
        recordError(podscanId, caught)
        transientFailuresInARow += 1
        if (transientFailuresInARow >= MAX_TRANSIENT_FAILURES) stopReason ??= 'podscan_unavailable'
        return
      }
      // Anything else is about this show (or its row): record the try, so it
      // goes to the back of the queue.
      counts.failed += 1
      recordError(podscanId, caught)
      await markAttempted(podscanId).catch(() => undefined)
    }
  }

  // As many workers as the shared client lets through at once; it enforces
  // the cap itself, this only avoids queueing the whole batch at it.
  const worker = async () => {
    while (queue.length > 0 && !stopReason) {
      await refreshOne(queue.shift() as string)
    }
  }
  await Promise.all(Array.from({ length: PODSCAN_MAX_CONCURRENT }, worker))
  counts.not_reached += queue.length

  return json(200, {
    due: dueIds.length,
    ...counts,
    stopped_early: stopReason,
    errors: errors.slice(0, 10),
  })
})
