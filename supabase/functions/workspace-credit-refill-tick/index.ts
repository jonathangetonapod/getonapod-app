import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'

import { createAdminClient, secretsMatch, writeAudit } from '../_shared/workspaceAuth.ts'
import { CREDIT_PACKS } from '../_shared/creditPacks.ts'

/**
 * Buy credits back for a workspace that is running out, without a person.
 *
 * The columns for this — refill_threshold_credits and refill_pack_credits —
 * have been in the billing profile since it was created, with a constraint
 * requiring both or neither, and nothing ever read them. So an agency that had
 * asked for automatic top-ups still stopped dead at zero.
 *
 * This spends somebody's money while they are asleep, so every guard here is
 * deliberate:
 *
 *   * opt-in only, and off unless both columns are set
 *   * one refill per workspace per day, keyed in the ledger, so a stuck tick
 *     or a double schedule cannot bill twice
 *   * a saved card only; there is no path here that asks anyone for one
 *   * a failure is recorded on the profile and the workspace is left alone
 *     until tomorrow; three in a row pause it and tell the owner, and saving
 *     the settings again is what resumes it
 *
 * Granting is the webhook's job, not this function's. It charges and stops:
 * payment_intent.succeeded is what proves the money arrived, and inventing a
 * second grant path here would let credits exist for a payment that later
 * failed.
 */
const MAX_REFILLS_PER_TICK = 10
const STRIPE_API = 'https://api.stripe.com/v1'
// Consecutive failures before the tick stops trying and asks a person.
const MAX_CONSECUTIVE_FAILURES = 3
const PAGE_SIZE = 200

type AdminClient = ReturnType<typeof createAdminClient>

function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;')
}

/**
 * Tells the workspace owner that automatic top-ups have stopped.
 *
 * Best-effort, like every notification here: the pause is already recorded
 * on the profile and shown on the billing page, so a missed email loses the
 * nudge, not the state.
 */
async function notifyOwnerRefillPaused(
  admin: AdminClient,
  workspaceId: string,
  reason: string,
): Promise<void> {
  const apiKey = Deno.env.get('RESEND_API_KEY')?.trim()
  const from = Deno.env.get('RESEND_FROM_EMAIL')?.trim()
  if (!apiKey || !from) return

  const { data: owners } = await admin
    .from('workspace_memberships')
    .select('workspace_id,email_normalized,role,status')
    .eq('workspace_id', workspaceId)
    .eq('status', 'active')
    .eq('role', 'owner')
    .limit(5)
  const emails: string[] = [...new Set<string>(((owners ?? []) as Array<Record<string, unknown>>)
    .filter((member) => member.workspace_id === workspaceId)
    .map((member) => String(member.email_normalized ?? '').trim())
    .filter((email) => /^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/u.test(email)))]
  if (emails.length === 0) return

  const { data: workspace } = await admin
    .from('workspaces')
    .select('name')
    .eq('id', workspaceId)
    .maybeSingle()
  const workspaceName = String((workspace as { name?: unknown } | null)?.name ?? '').trim() || 'your workspace'
  const origin = (Deno.env.get('APP_URL') || 'https://getonapod.com').replace(/\/+$/u, '')
  const billingUrl = `${origin}/app/settings/billing`
  const lines = [
    `Automatic top-ups for ${workspaceName} failed ${MAX_CONSECUTIVE_FAILURES} times in a row, so we have paused them. Nothing more will be charged automatically.`,
    `The last attempt failed with: ${reason}`,
    'Check the card on file in the billing portal, then save your automatic top-up settings again to resume them.',
  ]
  const html = `<!doctype html><html><body style="font-family:Arial,sans-serif;color:#19172d"><h2 style="margin:0 0 16px">Automatic top-ups paused</h2>${lines
    .map((line) => `<p style="line-height:1.6;margin:0 0 12px">${escapeHtml(line)}</p>`)
    .join('')}<p><a href="${escapeHtml(billingUrl)}">Open billing</a></p></body></html>`
  const text = `${lines.join('\n\n')}\n\nOpen billing: ${billingUrl}`

  try {
    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        from,
        to: emails,
        subject: `Automatic top-ups paused for ${workspaceName}`,
        html,
        text,
      }),
      signal: AbortSignal.timeout(10_000),
    })
    if (!response.ok) console.error('[Credit Refill Tick] Pause notification was rejected by the provider')
  } catch (_error) {
    console.error('[Credit Refill Tick] Pause notification provider was unavailable')
  }
}

/**
 * Records a failed attempt on the profile. The count is what pauses a
 * workspace after MAX_CONSECUTIVE_FAILURES; the owner hears about it once, on
 * the failure that crosses the line.
 */
async function recordFailure(
  admin: AdminClient,
  workspaceId: string,
  previousCount: number,
  reason: string,
): Promise<void> {
  const count = previousCount + 1
  const now = new Date().toISOString()
  const { error } = await admin
    .from('workspace_billing_profiles')
    .update({
      refill_failure_count: count,
      refill_last_error: reason.slice(0, 300),
      refill_last_failed_at: now,
      last_refill_attempt_at: now,
    })
    .eq('workspace_id', workspaceId)
  if (error) {
    console.error('[Credit Refill Tick] Failure could not be recorded on the profile')
    return
  }
  if (count === MAX_CONSECUTIVE_FAILURES) {
    await notifyOwnerRefillPaused(admin, workspaceId, reason)
  }
}

function json(status: number, body: Record<string, unknown>): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

async function stripePost(
  path: string,
  form: URLSearchParams,
  key: string,
  idempotencyKey: string,
): Promise<{ ok: boolean; status: number; body: Record<string, unknown> }> {
  const response = await fetch(`${STRIPE_API}/${path}`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${key}`,
      'Content-Type': 'application/x-www-form-urlencoded',
      // Stripe's own idempotency, on top of the ledger's. A retry of this exact
      // request is the same charge, not a second one.
      'Idempotency-Key': idempotencyKey,
    },
    body: form,
    signal: AbortSignal.timeout(20_000),
  })
  const body = await response.json().catch(() => ({})) as Record<string, unknown>
  return { ok: response.ok, status: response.status, body }
}


/**
 * A card Stripe will accept without the customer present.
 *
 * A PaymentIntent with only a customer relies on invoice_settings holding a
 * default payment method, which a Checkout purchase never sets. Asking for the
 * cards attached to the customer and naming one explicitly is what actually
 * works — and returning null when there are none is how a workspace that never
 * saved a card is skipped rather than charged at.
 */
async function savedCardFor(
  customerId: string,
  key: string,
): Promise<{ ok: true; paymentMethodId: string | null } | { ok: false; reason: string }> {
  /*
   * A Stripe outage is not the same answer as "no card". Both used to come
   * back as null, so a Stripe hiccup was recorded as the customer's failure
   * and three of them paused a workspace whose card was fine.
   */
  const query = new URLSearchParams({ customer: customerId, type: 'card', limit: '1' })
  let response: Response
  try {
    response = await fetch(`${STRIPE_API}/payment_methods?${query.toString()}`, {
      headers: { Authorization: `Bearer ${key}` },
      signal: AbortSignal.timeout(20_000),
    })
  } catch (_error) {
    return { ok: false, reason: 'Stripe was unreachable' }
  }
  if (!response.ok) return { ok: false, reason: `Stripe returned ${response.status}` }
  const body = await response.json().catch(() => null) as { data?: Array<{ id?: unknown }> } | null
  if (!body || !Array.isArray(body.data)) return { ok: false, reason: 'Stripe returned an unreadable card list' }
  const first = body.data[0]
  return { ok: true, paymentMethodId: first && typeof first.id === 'string' ? first.id : null }
}

/**
 * Every eligible workspace's spendable balance, read in a few bulk queries.
 *
 * Most profiles on the queue are nowhere near their threshold. Reading each
 * one's lots separately — and its monthly spend before that — cost two
 * queries per comfortable workspace every hour. This settles the clear cases
 * up front; a workspace that looks low is still re-read live before any
 * charge. Returns null when the bulk read fails, and the loop then falls back
 * to the per-workspace read.
 */
async function bulkBalances(admin: AdminClient, workspaceIds: string[]): Promise<Map<string, number> | null> {
  const balances = new Map<string, number>()
  const now = Date.now()
  const LOT_PAGE = 1_000
  for (let index = 0; index < workspaceIds.length; index += 100) {
    const chunk = workspaceIds.slice(index, index + 100)
    for (let offset = 0; ; offset += LOT_PAGE) {
      const { data, error } = await admin
        .from('workspace_credit_lots')
        .select('id, workspace_id, remaining, expires_at')
        .in('workspace_id', chunk)
        .gt('remaining', 0)
        .order('id', { ascending: true })
        .range(offset, offset + LOT_PAGE - 1)
      if (error) return null
      for (const lot of (data ?? []) as Array<Record<string, unknown>>) {
        const expires = typeof lot.expires_at === 'string' ? Date.parse(lot.expires_at) : Number.NaN
        if (!Number.isNaN(expires) && expires <= now) continue
        const workspaceId = String(lot.workspace_id)
        balances.set(workspaceId, (balances.get(workspaceId) ?? 0) + (Number(lot.remaining) || 0))
      }
      if ((data ?? []).length < LOT_PAGE) break
    }
  }
  return balances
}

/** Rotates a profile to the back of the queue without counting a failure. */
async function recordTransientFailure(admin: AdminClient, workspaceId: string, reason: string): Promise<void> {
  const { error } = await admin
    .from('workspace_billing_profiles')
    .update({ last_refill_attempt_at: new Date().toISOString() })
    .eq('workspace_id', workspaceId)
  if (error) console.error('[Credit Refill Tick] Attempt could not be recorded on the profile')
  console.error(`[Credit Refill Tick] Transient Stripe failure for ${workspaceId}: ${reason}`)
}

serve(async (req) => {
  if (req.method !== 'POST') return json(405, { error: 'method_not_allowed' })

  // Timing-safe like every other secret comparison in this codebase: this
  // header authorizes charging saved cards off-session.
  const secret = Deno.env.get('REFILL_TICK_SECRET')?.trim()
  const providedSecret = req.headers.get('x-refill-secret') ?? ''
  if (!secret || !(await secretsMatch(providedSecret, secret))) {
    return json(401, { error: 'unauthorized' })
  }
  const stripeKey = Deno.env.get('STRIPE_SECRET_KEY')?.trim()
  if (!stripeKey) return json(200, { charged: 0, error: 'stripe_not_configured' })

  const admin = createAdminClient()

  // Opt-in only. Both columns are required together by constraint, so one of
  // them being present is enough to know this workspace asked for it.
  //
  // Every eligible profile, a page at a time, in a fair order: the ones never
  // tried first, then the longest since their last attempt. A bare limit with
  // no order let the same 200 rows win every hour and starved the rest. The
  // whole queue is read before any of it is touched, because the loop below
  // moves last_refill_attempt_at and would otherwise reshuffle the pages.
  // Paused profiles (too many failures in a row) wait for a person.
  const profiles: Array<Record<string, unknown>> = []
  for (let offset = 0; ; offset += PAGE_SIZE) {
    const { data: page, error } = await admin
      .from('workspace_billing_profiles')
      .select('workspace_id, refill_threshold_credits, refill_pack_credits, refill_monthly_cap_cents, stripe_customer_id, billing_status, refill_failure_count, refill_last_failed_at')
      .not('refill_threshold_credits', 'is', null)
      .not('stripe_customer_id', 'is', null)
      .lt('refill_failure_count', MAX_CONSECUTIVE_FAILURES)
      .order('last_refill_attempt_at', { ascending: true, nullsFirst: true })
      .order('workspace_id', { ascending: true })
      .range(offset, offset + PAGE_SIZE - 1)
    if (error) {
      if (profiles.length === 0) return json(200, { charged: 0, error: 'profiles_unavailable' })
      break
    }
    profiles.push(...((page ?? []) as Array<Record<string, unknown>>))
    if ((page ?? []).length < PAGE_SIZE) break
  }

  const today = new Date().toISOString().slice(0, 10)
  const precomputedBalances = await bulkBalances(admin, profiles.map((profile) => String(profile.workspace_id)))
  let charged = 0
  let skipped = 0
  // Counted separately from skips: a ceiling doing its job is worth seeing.
  let capReached = 0
  const failures: Array<{ workspace_id: string; reason: string }> = []

  for (const profile of profiles) {
    if (charged >= MAX_REFILLS_PER_TICK) break

    const workspaceId = String(profile.workspace_id)
    const failureCount = Number(profile.refill_failure_count) || 0
    // One attempt a day after a failure. The tick runs hourly, and Stripe
    // replays a refused request under the same idempotency key, so retrying
    // within the day would only count the same decline again.
    const lastFailedDay = typeof profile.refill_last_failed_at === 'string'
      ? profile.refill_last_failed_at.slice(0, 10)
      : ''
    if (lastFailedDay === today) {
      skipped += 1
      continue
    }
    const threshold = Number(profile.refill_threshold_credits)
    const packCredits = Number(profile.refill_pack_credits)
    const customerId = String(profile.stripe_customer_id ?? '')
    const billingStatus = String(profile.billing_status ?? 'trialing')

    // Clearly above its threshold: skipped before any per-workspace query.
    if (precomputedBalances && (precomputedBalances.get(workspaceId) ?? 0) > threshold) {
      skipped += 1
      continue
    }

    // A workspace whose payments are already failing is the last one to charge
    // again automatically.
    // billing_status only ever holds trialing/active/past_due/comped/suspended
    // (the webhook maps every cancelled or lapsed Stripe state to suspended),
    // so the Stripe names never matched and a cancelled plan kept refilling.
    if (['past_due', 'suspended'].includes(billingStatus)) {
      skipped += 1
      continue
    }

    const pack = Object.values(CREDIT_PACKS).find((entry) => entry.credits === packCredits)
    if (!pack) {
      failures.push({ workspace_id: workspaceId, reason: 'pack no longer sold' })
      await recordFailure(admin, workspaceId, failureCount, 'The chosen credit pack is no longer sold')
      continue
    }

    /*
     * The monthly spending ceiling, enforced where the charging happens. The
     * column existed with nothing reading it, which is worse than no cap: a
     * schema that promises a control invites somebody to set it and believe
     * it. Spend so far is reconstructed from the ledger — refill grants carry
     * the auto-refill:{workspace}:{day} key — because the audit trail is
     * best-effort by design and a charge whose audit write failed must still
     * count against the ceiling. Each past refill is priced at its own pack
     * (matched by credits granted), falling back to today's pack if the
     * catalog moved underneath it.
     */
    // A NULL cap means NO cap, not a zero ceiling. The column has no default
    // and no code path sets it, so Number(null) === 0 turned the "spend cap"
    // into "never spend": spent + pack > 0 is always true, so every eligible
    // workspace was refused and auto-refill silently never charged anyone.
    // Only enforce a cap that was actually configured.
    const rawCap = profile.refill_monthly_cap_cents
    const monthlyCapCents = rawCap === null || rawCap === undefined ? null : Number(rawCap)
    if (monthlyCapCents !== null && Number.isFinite(monthlyCapCents) && monthlyCapCents >= 0) {
      const monthPrefix = `auto-refill:${workspaceId}:${today.slice(0, 7)}-`
      const { data: monthRefills } = await admin
        .from('workspace_credit_ledger')
        .select('amount')
        .eq('workspace_id', workspaceId)
        .eq('entry_type', 'grant')
        .like('idempotency_key', `${monthPrefix}%`)
      const spentCents = (monthRefills ?? []).reduce((sum: number, row: Record<string, unknown>) => {
        const credited = Number(row.amount) || 0
        const priced = Object.values(CREDIT_PACKS).find((entry) => entry.credits === credited)
        return sum + (priced?.amount_cents ?? pack.amount_cents)
      }, 0)
      if (spentCents + pack.amount_cents > monthlyCapCents) {
        capReached += 1
        continue
      }
    }

    const { data: lots } = await admin
      .from('workspace_credit_lots')
      .select('remaining, expires_at')
      .eq('workspace_id', workspaceId)
      .gt('remaining', 0)
    const now = Date.now()
    const balance = (lots ?? []).reduce((sum: number, lot: Record<string, unknown>) => {
      const expires = typeof lot.expires_at === 'string' ? Date.parse(lot.expires_at) : Number.NaN
      if (!Number.isNaN(expires) && expires <= now) return sum
      return sum + (Number(lot.remaining) || 0)
    }, 0)
    if (balance > threshold) {
      skipped += 1
      continue
    }

    // One per workspace per day. The ledger entry the webhook writes carries
    // this key, so a refill already bought today is visible before charging.
    const refillKey = `auto-refill:${workspaceId}:${today}`
    const { data: existing } = await admin
      .from('workspace_credit_ledger')
      .select('id')
      .eq('workspace_id', workspaceId)
      .eq('idempotency_key', refillKey)
      .maybeSingle()
    if (existing) {
      skipped += 1
      continue
    }

    // Named explicitly rather than left to a default the purchase flow never
    // sets. No saved card means this workspace never consented to being
    // charged again, so it is skipped, not attempted.
    const card = await savedCardFor(customerId, stripeKey)
    if (!card.ok) {
      // Stripe's problem, not the customer's: not counted toward the pause.
      failures.push({ workspace_id: workspaceId, reason: card.reason })
      await recordTransientFailure(admin, workspaceId, card.reason)
      continue
    }
    const paymentMethodId = card.paymentMethodId
    if (!paymentMethodId) {
      failures.push({ workspace_id: workspaceId, reason: 'no saved card to charge' })
      await recordFailure(admin, workspaceId, failureCount, 'No saved card to charge')
      continue
    }

    const form = new URLSearchParams({
      amount: String(pack.amount_cents),
      currency: 'usd',
      customer: customerId,
      payment_method: paymentMethodId,
      confirm: 'true',
      // Nobody is present to answer a card challenge, so a card that demands
      // one fails here rather than hanging.
      off_session: 'true',
      description: pack.label,
      'metadata[workspace_id]': workspaceId,
      'metadata[credits]': String(pack.credits),
      'metadata[auto_refill]': 'true',
      // The webhook grants under this exact key, which is what makes the
      // daily pre-check and the monthly cap above actually see past refills:
      // both query the ledger for auto-refill:… keys, and grants keyed on the
      // Stripe event id were invisible to them.
      'metadata[refill_key]': refillKey,
    })
    let result: { ok: boolean; status: number; body: Record<string, unknown> }
    try {
      result = await stripePost('payment_intents', form, stripeKey, refillKey)
    } catch (_error) {
      // A timeout may still have charged; the Idempotency-Key makes the next
      // attempt the same charge, and the webhook grants either way. Not the
      // customer's failure, so not counted toward the pause.
      failures.push({ workspace_id: workspaceId, reason: 'Stripe was unreachable' })
      await recordTransientFailure(admin, workspaceId, 'Stripe was unreachable')
      continue
    }
    if (!result.ok && (result.status >= 500 || result.status === 429)) {
      failures.push({ workspace_id: workspaceId, reason: `Stripe returned ${result.status}` })
      await recordTransientFailure(admin, workspaceId, `Stripe returned ${result.status}`)
      continue
    }
    if (!result.ok) {
      const message = ((result.body.error ?? {}) as { message?: unknown }).message
      const reason = typeof message === 'string' ? message.slice(0, 200) : 'charge refused'
      failures.push({ workspace_id: workspaceId, reason })
      await recordFailure(admin, workspaceId, failureCount, reason)
      await writeAudit(admin, {
        workspaceId,
        actorUserId: null as unknown as string,
        action: 'workspace.credits.auto_refill_failed',
        entityType: 'workspace',
        entityId: workspaceId,
        metadata: { credits: pack.credits, amount_cents: pack.amount_cents, balance, threshold },
      })
      continue
    }

    charged += 1
    // A charge that went through ends the run of failures.
    const { error: attemptError } = await admin
      .from('workspace_billing_profiles')
      .update({
        last_refill_attempt_at: new Date().toISOString(),
        refill_failure_count: 0,
        refill_last_error: null,
        refill_last_failed_at: null,
      })
      .eq('workspace_id', workspaceId)
    if (attemptError) console.error('[Credit Refill Tick] Attempt could not be recorded on the profile')
    await writeAudit(admin, {
      workspaceId,
      actorUserId: null as unknown as string,
      action: 'workspace.credits.auto_refill_charged',
      entityType: 'workspace',
      entityId: workspaceId,
      metadata: {
        credits: pack.credits,
        amount_cents: pack.amount_cents,
        balance_before: balance,
        threshold,
        payment_intent: typeof result.body.id === 'string' ? result.body.id : null,
      },
    })
  }

  // The credits are not here yet: the webhook grants them when Stripe confirms
  // the money. Saying "charged" rather than "granted" keeps that distinction.
  return json(200, { charged, skipped, cap_reached: capReached, failed: failures.length, failures: failures.slice(0, 10) })
})
