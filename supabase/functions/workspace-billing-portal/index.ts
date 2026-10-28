// Plan management for a workspace that manages its own billing: a Stripe-hosted
// Customer Portal session for one that already subscribes, and a subscription
// Checkout Session for one that does not.
//
// This function never writes plan_key, billing_status, or stripe_subscription_id.
// Stripe is the authority on what a workspace is subscribed to, and the signed
// webhook (workspace-subscription-webhook) is the only thing that records it —
// the same split the credit packs already use. A success redirect here proves
// the customer finished a form, not that Stripe charged them.

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { ensureWorkspaceBillingCustomer, getOrCreateWorkspaceCheckout, type StripeBillingRequest } from '../_shared/subscriptionCheckout.ts'

import {
  createAdminClient,
  errorResponse,
  HttpError,
  jsonResponse,
  optionsResponse,
  parseJsonObject,
  requireAuthenticatedUser,
  requireOnlyKeys,
  requirePlatformAdmin,
  requireString,
  requireUuid,
  requireWorkspaceFeatureAccess,
  workspaceCredentialIsFresh,
  writeAudit,
} from '../_shared/workspaceAuth.ts'

const METHODS = ['POST'] as const
const MANAGER_ROLES = new Set(['owner', 'admin', 'platform_admin'])

// Prices are Stripe catalog objects rather than inline price_data, because the
// Customer Portal can only offer a switch between prices it can name. Which
// Price each plan is sold at lives in billing_plans, so a platform admin can
// change it from a screen; an environment variable cannot be edited from one.
interface BillingPlan {
  plan_key: string
  display_name: string
  base_price_cents: number
  monthly_credit_allowance: number
  stripe_price_id: string | null
  is_purchasable: boolean
}

async function loadPlans(admin: ReturnType<typeof createAdminClient>): Promise<BillingPlan[]> {
  const { data, error } = await admin
    .from('billing_plans')
    .select('plan_key, display_name, base_price_cents, monthly_credit_allowance, stripe_price_id, is_purchasable')
    .order('base_price_cents', { ascending: true })
  if (error) throw new HttpError(503, 'BILLING_UNAVAILABLE', 'Plans could not be read')
  return (data ?? []) as BillingPlan[]
}

/**
 * How many workspaces each plan change would reach, for the admin deciding
 * whether to make it: subscribers who stay on their old Stripe price, and
 * every workspace on the plan, which is what an allowance backfill rewrites.
 * Read only for the admin responses; a checkout has no use for it.
 */
async function withWorkspaceCounts(
  admin: ReturnType<typeof createAdminClient>,
  plans: BillingPlan[],
): Promise<Array<BillingPlan & { workspace_count: number; subscriber_count: number }>> {
  const { data, error } = await admin
    .from('workspace_billing_profiles')
    .select('plan_key, billing_status, stripe_subscription_id')
  if (error) throw new HttpError(503, 'BILLING_UNAVAILABLE', 'Plan subscribers could not be counted')
  const workspaces = new Map<string, number>()
  const subscribers = new Map<string, number>()
  for (const row of (data ?? []) as Array<Record<string, unknown>>) {
    const planKey = String(row.plan_key)
    workspaces.set(planKey, (workspaces.get(planKey) ?? 0) + 1)
    const subscribed = typeof row.stripe_subscription_id === 'string' && row.stripe_subscription_id.length > 0
      && row.billing_status !== 'suspended'
    if (subscribed) subscribers.set(planKey, (subscribers.get(planKey) ?? 0) + 1)
  }
  return plans.map((plan) => ({
    ...plan,
    workspace_count: workspaces.get(plan.plan_key) ?? 0,
    subscriber_count: subscribers.get(plan.plan_key) ?? 0,
  }))
}

function appUrl(): string {
  return (Deno.env.get('APP_URL') || 'https://getonapod.com').replace(/\/+$/u, '')
}

async function stripePost(
  path: string,
  params: URLSearchParams,
  key: string,
  idempotencyKey?: string,
): Promise<Record<string, unknown>> {
  let response: Response
  try {
    response = await fetch(`https://api.stripe.com/v1/${path}`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${key}`,
        'Content-Type': 'application/x-www-form-urlencoded',
        // A retried save is the same save: Stripe answers the first request
        // again instead of minting a second Price.
        ...(idempotencyKey ? { 'Idempotency-Key': idempotencyKey } : {}),
      },
      body: params.toString(),
      signal: AbortSignal.timeout(20_000),
    })
  } catch (_error) {
    throw new HttpError(503, 'STRIPE_UNAVAILABLE', 'Payments are temporarily unavailable. Try again in a few minutes')
  }
  const payload = await response.json().catch(() => null) as Record<string, unknown> | null
  if (!response.ok || !payload) {
    throw new HttpError(502, 'STRIPE_REJECTED', 'The payment could not be started. Check the card on file and try again')
  }
  return payload
}

async function stripeGet(path: string, key: string): Promise<Record<string, unknown>> {
  let response: Response
  try {
    response = await fetch(`https://api.stripe.com/v1/${path}`, {
      headers: { Authorization: `Bearer ${key}` },
      signal: AbortSignal.timeout(20_000),
    })
  } catch (_error) {
    throw new HttpError(503, 'STRIPE_UNAVAILABLE', 'Payments are temporarily unavailable. Try again in a few minutes')
  }
  const payload = await response.json().catch(() => null) as Record<string, unknown> | null
  if (!response.ok || !payload) {
    throw new HttpError(502, 'STRIPE_REJECTED', 'The payment could not be started. Check the card on file and try again')
  }
  return payload
}

/** Keep hosted payment recovery and cancellation aligned with the flat plan. */
async function syncPortalConfiguration(
  plans: BillingPlan[],
  stripeKey: string,
): Promise<string | null> {
  // A single plan has nothing to switch between. Preserve legacy prices and
  // expose payment recovery, invoice history and end-of-period cancellation.
  void plans
  const params: Record<string, string> = {
    'features[subscription_update][enabled]': 'false',
    'features[subscription_cancel][enabled]': 'true',
    'features[subscription_cancel][mode]': 'at_period_end',
    'features[payment_method_update][enabled]': 'true',
    'features[invoice_history][enabled]': 'true',
  }

  const existing = await stripeGet('billing_portal/configurations?is_default=true&limit=1', stripeKey)
  const current = (existing.data as Array<Record<string, unknown>> | undefined)?.[0]
  const configurationId = typeof current?.id === 'string' ? current.id : ''
  const configuration = configurationId
    ? await stripePost(`billing_portal/configurations/${configurationId}`, new URLSearchParams(params), stripeKey)
    : await stripePost('billing_portal/configurations', new URLSearchParams({
      ...params,
      'business_profile[headline]': 'Manage your Get On A Pod plan',
    }), stripeKey)
  return typeof configuration.id === 'string' ? configuration.id : null
}

async function handlePlanAdministration(
  req: Request,
  body: Record<string, unknown>,
  action: string,
  stripeKey: string,
): Promise<Response> {
  const authContext = await requirePlatformAdmin(req)
  const admin = createAdminClient()

  if (action === 'plans-list') {
    requireOnlyKeys(body, ['action'])
    return jsonResponse(req, METHODS, 200, { success: true, plans: await withWorkspaceCounts(admin, await loadPlans(admin)) })
  }

  requireOnlyKeys(body, [
    'action', 'plan_key', 'base_price_cents', 'monthly_credit_allowance', 'apply_to_existing_subscribers',
    'reason', 'note', 'action_key',
  ])
  // Changing what a plan costs or gives is a change for every workspace on
  // it, so it says why, like every other billing write.
  const reason = requireString(body.reason, 'reason', { min: 1, max: 60 })
  const note = body.note === undefined ? '' : requireString(body.note, 'note', { min: 0, max: 500 })
  const actionKey = requireUuid(body.action_key, 'action_key')
  if ((body.monthly_credit_allowance !== undefined && body.monthly_credit_allowance !== 0) || body.apply_to_existing_subscribers === true) {
    throw new HttpError(410, 'CREDIT_BILLING_RETIRED', 'Monthly credit allowances are retired')
  }
  if (body.apply_to_existing_subscribers !== undefined && typeof body.apply_to_existing_subscribers !== 'boolean') {
    throw new HttpError(400, 'INVALID_FIELD', 'apply_to_existing_subscribers must be true or false')
  }
  const applyToExisting = body.apply_to_existing_subscribers === true
  const planKey = requireString(body.plan_key, 'plan_key', { max: 40 })
  const amount = typeof body.base_price_cents === 'number' && Number.isSafeInteger(body.base_price_cents)
    ? body.base_price_cents
    : NaN
  if (!Number.isSafeInteger(amount) || amount < 0 || amount > 10_000_00) {
    throw new HttpError(400, 'INVALID_AMOUNT', 'Price must be between 0 and 1,000,000 cents')
  }

  // Optional: a caller changing only the price leaves the allowance alone.
  const allowance = body.monthly_credit_allowance === undefined
    ? null
    : typeof body.monthly_credit_allowance === 'number'
        && Number.isSafeInteger(body.monthly_credit_allowance)
        && body.monthly_credit_allowance >= 0
        && body.monthly_credit_allowance <= 1_000_000
      ? body.monthly_credit_allowance
      : NaN
  if (Number.isNaN(allowance)) {
    throw new HttpError(400, 'INVALID_AMOUNT', 'Allowance must be between 0 and 1,000,000 credits')
  }

  const plans = await loadPlans(admin)
  const plan = plans.find((candidate) => candidate.plan_key === planKey)
  if (!plan) throw new HttpError(404, 'PLAN_NOT_FOUND', 'No such plan')
  if (!plan.is_purchasable) {
    // Complimentary is assigned, never sold: it has credits and no price, so
    // nothing here touches Stripe.
    if (amount !== plan.base_price_cents) {
      throw new HttpError(400, 'PLAN_NOT_PURCHASABLE', 'This plan is never sold, so it has no price to set')
    }
    if (allowance === null) {
      throw new HttpError(400, 'INVALID_AMOUNT', 'Set the credits this plan gives each month')
    }
    const { error: allowanceError } = await admin
      .from('billing_plans')
      .update({ monthly_credit_allowance: allowance, updated_at: new Date().toISOString() })
      .eq('plan_key', planKey)
    if (allowanceError) throw new HttpError(503, 'BILLING_UNAVAILABLE', 'The allowance could not be recorded')
    let backfilled: number | null = null
    if (applyToExisting) {
      const { data, error } = await admin
        .from('workspace_billing_profiles')
        .update({ monthly_credit_allowance: allowance, updated_at: new Date().toISOString() })
        .eq('plan_key', planKey)
        .neq('monthly_credit_allowance', allowance)
        .select('workspace_id')
      if (error) throw new HttpError(503, 'BILLING_UNAVAILABLE', 'The allowance could not be applied to existing workspaces')
      backfilled = (data ?? []).length
    }
    await writeAudit(admin, {
      workspaceId: null,
      actorUserId: authContext.user.id,
      action: 'billing_plan_allowance_changed',
      entityType: 'billing_plan',
      entityId: null,
      metadata: {
        plan_key: planKey,
        from_credits: plan.monthly_credit_allowance,
        to_credits: allowance,
        backfilled_workspaces: backfilled,
        reason,
        note,
        action_key: actionKey,
      },
    })
    return jsonResponse(req, METHODS, 200, {
      success: true,
      plans: await withWorkspaceCounts(admin, await loadPlans(admin)),
      backfilled_workspaces: backfilled,
    })
  }
  // Saving the price a plan already carries is not a no-op: the portal sync
  // happens after the price is recorded, so a save that failed on the sync
  // leaves a plan priced but not offered. Returning early here would make that
  // permanent, because every retry would look like nothing to do. The Price is
  // skipped — a second identical one is pure churn — and the sync still runs,
  // which makes Save the thing that repairs it.
  const alreadyPriced = plan.base_price_cents === amount && Boolean(plan.stripe_price_id)
  const allowanceChanged = allowance !== null && allowance !== plan.monthly_credit_allowance
  if (allowanceChanged) {
    // Recorded on the plan, and applied to a workspace when its subscription
    // next moves onto the plan. Existing subscribers keep what they have until
    // then, the same way Stripe leaves them on the price they signed up at —
    // unless the admin asked for apply_to_existing_subscribers below.
    const { error: allowanceError } = await admin
      .from('billing_plans')
      .update({ monthly_credit_allowance: allowance, updated_at: new Date().toISOString() })
      .eq('plan_key', planKey)
    if (allowanceError) {
      throw new HttpError(503, 'BILLING_UNAVAILABLE', 'The allowance could not be recorded')
    }
  }

  // Opt-in, because it changes what workspaces that already pay are given:
  // without it an allowance edit reaches a workspace only when its
  // subscription next moves onto the plan. Comped and other plans are left
  // alone — only rows on this plan take this plan's allowance.
  let backfilledWorkspaces: number | null = null
  if (applyToExisting) {
    const targetAllowance = allowance ?? plan.monthly_credit_allowance
    const { data: backfilled, error: backfillError } = await admin
      .from('workspace_billing_profiles')
      .update({ monthly_credit_allowance: targetAllowance, updated_at: new Date().toISOString() })
      .eq('plan_key', planKey)
      .neq('monthly_credit_allowance', targetAllowance)
      .select('workspace_id')
    if (backfillError) {
      throw new HttpError(503, 'BILLING_UNAVAILABLE', 'The allowance could not be applied to existing subscribers')
    }
    backfilledWorkspaces = (backfilled ?? []).length
    await writeAudit(admin, {
      workspaceId: null,
      actorUserId: authContext.user.id,
      action: 'billing_plan_allowance_backfilled',
      entityType: 'billing_plan',
      entityId: null,
      metadata: {
        plan_key: planKey,
        to_credits: targetAllowance,
        workspaces: backfilledWorkspaces,
        reason,
        note,
        action_key: actionKey,
      },
    })
  }

  let priceId = plan.stripe_price_id ?? ''
  if (!alreadyPriced) {
    // Stripe Prices are immutable, so a change is a new Price on the same
    // Product. Reusing the Product keeps one plan's history in one place rather
    // than scattering it across a product per price change.
    let productId = ''
    if (plan.stripe_price_id) {
      const existingPrice = await stripeGet(`prices/${plan.stripe_price_id}`, stripeKey)
      productId = typeof existingPrice.product === 'string' ? existingPrice.product : ''
    }
    if (!productId) {
      const product = await stripePost('products', new URLSearchParams({
        name: `Get On A Pod · ${plan.display_name}`,
        'metadata[plan_key]': planKey,
      }), stripeKey, `${actionKey}:product`)
      productId = typeof product.id === 'string' ? product.id : ''
    }
    if (!productId) throw new HttpError(502, 'STRIPE_REJECTED', 'The payment could not be started. Check the card on file and try again')

    const price = await stripePost('prices', new URLSearchParams({
      product: productId,
      currency: 'usd',
      unit_amount: String(amount),
      'recurring[interval]': 'month',
      'metadata[plan_key]': planKey,
    }), stripeKey, `${actionKey}:price`)
    priceId = typeof price.id === 'string' ? price.id : ''
    if (!priceId) throw new HttpError(502, 'STRIPE_REJECTED', 'The payment could not be started. Check the card on file and try again')

    // Recorded together: the amount is only a description of what the Price
    // charges, and the two disagreeing is how a screen starts lying about money.
    const { error: writeError } = await admin
      .from('billing_plans')
      .update({
        base_price_cents: amount,
        stripe_price_id: priceId,
        updated_at: new Date().toISOString(),
      })
      .eq('plan_key', planKey)
    if (writeError) {
      throw new HttpError(503, 'BILLING_UNAVAILABLE', 'The new price could not be recorded')
    }
  }

  const updated = await loadPlans(admin)
  const configurationId = await syncPortalConfiguration(updated, stripeKey)

  if (alreadyPriced) {
    // An allowance change is a change to what every workspace on this plan
    // gets. It used to slip through unaudited because the audit sat in the
    // price branch, and this path returns before reaching it.
    if (allowanceChanged) {
      await writeAudit(admin, {
        workspaceId: null,
        actorUserId: authContext.user.id,
        action: 'billing_plan_allowance_changed',
        entityType: 'billing_plan',
        entityId: null,
        metadata: {
          plan_key: planKey,
          from_credits: plan.monthly_credit_allowance,
          to_credits: allowance,
          reason,
          note,
          action_key: actionKey,
        },
      })
    }
    return jsonResponse(req, METHODS, 200, {
      success: true,
      plans: await withWorkspaceCounts(admin, updated),
      unchanged: !allowanceChanged && backfilledWorkspaces === null,
      portal_configuration_id: configurationId,
      backfilled_workspaces: backfilledWorkspaces,
    })
  }

  await writeAudit(admin, {
    workspaceId: null,
    actorUserId: authContext.user.id,
    action: 'billing_plan_price_changed',
    entityType: 'billing_plan',
    entityId: null,
    metadata: {
      plan_key: planKey,
      from_cents: plan.base_price_cents,
      to_cents: amount,
      stripe_price_id: priceId,
      portal_configuration_id: configurationId,
      // Allowance changes made in the same save are recorded here too; the
      // allowance-only audit above covers saves that left the price alone.
      ...(allowanceChanged ? { from_credits: plan.monthly_credit_allowance, to_credits: allowance } : {}),
      reason,
      note,
      action_key: actionKey,
    },
  })

  return jsonResponse(req, METHODS, 200, {
    success: true,
    plans: await withWorkspaceCounts(admin, updated),
    backfilled_workspaces: backfilledWorkspaces,
  })
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return optionsResponse(req, METHODS)

  try {
    if (req.method !== 'POST') {
      throw new HttpError(405, 'METHOD_NOT_ALLOWED', 'Only POST is allowed')
    }
    const stripeKey = Deno.env.get('STRIPE_SECRET_KEY')?.trim()
    if (!stripeKey) {
      throw new HttpError(500, 'SERVER_MISCONFIGURED', 'Plan management is not configured')
    }

    const body = await parseJsonObject(req)
    const action = typeof body.action === 'string' ? body.action : ''

    // Plan administration is platform-wide: it sets what a plan costs for
    // everyone, so it is not scoped to a workspace and takes no workspace_id.
    if (action === 'plans-list' || action === 'plans-update') {
      return await handlePlanAdministration(req, body, action, stripeKey)
    }

    if (action !== 'portal-create' && action !== 'subscription-create') {
      throw new HttpError(400, 'INVALID_ACTION', 'Unknown billing portal action')
    }
    if (action === 'portal-create') {
      requireOnlyKeys(body, ['action', 'workspace_id'])
    } else {
      requireOnlyKeys(body, ['action', 'workspace_id', 'plan_key'])
    }
    const workspaceId = requireUuid(body.workspace_id, 'workspace_id')

    const authContext = await requireAuthenticatedUser(req)
    if (!workspaceCredentialIsFresh(authContext)) {
      throw new HttpError(401, 'CREDENTIAL_STALE', 'Sign in again to continue')
    }
    const access = await requireWorkspaceFeatureAccess(authContext, workspaceId, { billingRecovery: true })
    if (!MANAGER_ROLES.has(access.role)) {
      throw new HttpError(403, 'FORBIDDEN', 'Workspace manager access is required')
    }

    const admin = createAdminClient()
    const { data: profile, error: profileError } = await admin
      .from('workspace_billing_profiles')
      .select('stripe_customer_id, stripe_subscription_id, plan_key, billing_status')
      .eq('workspace_id', workspaceId)
      .maybeSingle()
    if (profileError) {
      throw new HttpError(503, 'BILLING_UNAVAILABLE', 'Billing data could not be read')
    }

    // A second checkout for a workspace that already subscribes is a second
    // subscription, billed in full alongside the first. Changing plans is the
    // portal's job, so the caller is sent there instead. A suspended row is a
    // subscription that has ended, which is exactly when a new one is right.
    const alreadySubscribed = typeof profile?.stripe_subscription_id === 'string'
      && profile.stripe_subscription_id.length > 0
      && profile.billing_status !== 'suspended'
    if (action === 'subscription-create' && alreadySubscribed) {
      throw new HttpError(409, 'SUBSCRIPTION_EXISTS', 'This workspace already has a plan. Change it from the billing portal')
    }

    const stripe: StripeBillingRequest = (method, path, params, idempotencyKey) => method === 'GET'
      ? stripeGet(path, stripeKey)
      : stripePost(path, params ?? new URLSearchParams(), stripeKey, idempotencyKey)
    const customerId = await ensureWorkspaceBillingCustomer(admin, stripe, workspaceId, profile?.stripe_customer_id)

    const billingBase = `${appUrl()}/app/settings/billing`

    if (action === 'portal-create') {
      const configurationId = await syncPortalConfiguration([], stripeKey)
      if (!configurationId) throw new HttpError(503, 'PORTAL_UNAVAILABLE', 'Billing settings are temporarily unavailable')
      const session = await stripePost(
        'billing_portal/sessions',
        new URLSearchParams({ customer: customerId, return_url: billingBase, configuration: configurationId }),
        stripeKey,
      )
      const url = typeof session.url === 'string' ? session.url : ''
      if (!url) throw new HttpError(502, 'STRIPE_REJECTED', 'The payment could not be started. Check the card on file and try again')
      await writeAudit(admin, {
        workspaceId,
        actorUserId: authContext.user.id,
        action: 'billing_portal_opened',
        entityType: 'workspace_billing_profile',
        entityId: workspaceId,
        metadata: { customer_id: customerId },
      })
      return jsonResponse(req, METHODS, 200, { success: true, url })
    }

    const planKey = requireString(body.plan_key, 'plan_key', { max: 40 })
    const plan = (await loadPlans(admin)).find((candidate) => candidate.plan_key === planKey)
    if (!plan || !plan.is_purchasable) {
      throw new HttpError(400, 'INVALID_FIELD', 'That plan cannot be subscribed to')
    }
    const priceId = plan.stripe_price_id?.trim()
    if (!priceId) {
      throw new HttpError(500, 'PLAN_NOT_CONFIGURED', 'This plan cannot be bought yet. Contact support')
    }

    const session = await getOrCreateWorkspaceCheckout(admin, stripe, {
      workspaceId, customerId, planKey, priceId, billingBase,
    })
    const url = session.url

    await writeAudit(admin, {
      workspaceId,
      actorUserId: authContext.user.id,
      action: 'billing_subscription_checkout_opened',
      entityType: 'workspace_billing_profile',
      entityId: workspaceId,
      metadata: { customer_id: customerId, plan_key: planKey },
    })
    return jsonResponse(req, METHODS, 200, { success: true, url })
  } catch (error) {
    return errorResponse(req, METHODS, error)
  }
})
