// Workspace mailbox infrastructure (Winnr-backed): buy sending domains and
// warmed mailboxes in-app, track provisioning, and export to Instantly.
// Manager-gated; provider work uses the platform's Winnr account and workspace tags.

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'

import {
  type AuthContext,
  errorResponse,
  HttpError,
  jsonResponse,
  optionsResponse,
  parseJsonObject,
  requireAuthenticatedUser,
  requireOnlyKeys,
  requireString,
  requireUuid,
  requireWorkspaceFeatureAccess,
  workspaceCredentialIsFresh,
  writeAudit,
  type WorkspaceFeatureAccess,
} from '../_shared/workspaceAuth.ts'
import { chargeCredits, logOperationCost, refundCredits } from '../_shared/billing.ts'
import { resolveAiKey } from '../_shared/workspaceAiKeys.ts'
import { providerFailure, providerResponseError } from '../_shared/providerErrors.ts'

const METHODS = ['POST'] as const
const MANAGER_ROLES = new Set(['owner', 'admin', 'platform_admin'])
const WINNR_BASE = 'https://api.winnr.app/v1'
const DOMAIN_PATTERN = /^[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?(\.[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?)+$/
const USERNAME_PATTERN = /^[a-z0-9](?:[a-z0-9._-]{0,38}[a-z0-9])?$/
const MAX_ORDER_DOMAINS = 3
const MAX_MAILBOXES_PER_DOMAIN = 3

function requireManager(access: WorkspaceFeatureAccess): void {
  if (!MANAGER_ROLES.has(access.role)) {
    throw new HttpError(403, 'FORBIDDEN', 'Workspace manager access is required')
  }
}

/**
 * A provider call whose outcome is unknown: the request may have been accepted
 * even though no answer arrived. A timeout, a dropped connection or a gateway
 * error in front of the provider all look like this. It is never treated as a
 * refusal, because for a purchase that would refund credits for domains the
 * provider may be registering with real money.
 */
class WinnrOutcomeUnknownError extends HttpError {}

const AMBIGUOUS_GATEWAY_STATUSES = new Set([502, 503, 504])

async function winnrRequestRaw(
  token: string,
  path: string,
  options: { method?: 'GET' | 'POST'; body?: Record<string, unknown>; query?: URLSearchParams } = {},
): Promise<unknown> {
  const url = new URL(`${WINNR_BASE}${path}`)
  if (options.query) url.search = options.query.toString()
  let response: Response
  try {
    response = await fetch(url, {
      method: options.method ?? 'GET',
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: 'application/json',
        ...(options.body ? { 'Content-Type': 'application/json' } : {}),
      },
      body: options.body ? JSON.stringify(options.body) : undefined,
      signal: AbortSignal.timeout(25_000),
    })
  } catch (_error) {
    const failure = providerFailure('winnr')
    throw new WinnrOutcomeUnknownError(failure.status, failure.code, failure.message)
  }
  if (!response.ok) {
    const failure = await providerResponseError('winnr', response)
    console.error('[Mailbox Infra] Winnr error', failure.code)
    if (AMBIGUOUS_GATEWAY_STATUSES.has(response.status)) {
      throw new WinnrOutcomeUnknownError(failure.status, failure.code, failure.message)
    }
    throw failure
  }
  return await response.json().catch(() => null)
}

async function winnrRequest<T>(
  token: string,
  path: string,
  options: { method?: 'GET' | 'POST'; body?: Record<string, unknown>; query?: URLSearchParams } = {},
): Promise<T> {
  const payload = await winnrRequestRaw(token, path, options) as { data?: unknown } | null
  return (payload?.data ?? payload) as T
}

const MAX_LIST_PAGES = 20

function listRows<T>(payload: unknown): T[] {
  if (Array.isArray(payload)) return payload as T[]
  const data = (payload as { data?: unknown } | null)?.data
  if (Array.isArray(data)) return data as T[]
  const nested = (data as { data?: unknown } | null)?.data
  return Array.isArray(nested) ? nested as T[] : []
}

function pageInfo(payload: unknown): { cursor: string | null; hasMore: boolean | null } {
  const root = (payload && typeof payload === 'object' && !Array.isArray(payload))
    ? payload as Record<string, unknown>
    : {}
  const candidates = [root, root.pagination, root.meta, root.data]
    .filter((value): value is Record<string, unknown> => !!value && typeof value === 'object' && !Array.isArray(value))
  let cursor: string | null = null
  let hasMore: boolean | null = null
  for (const candidate of candidates) {
    const next = candidate.next_cursor ?? candidate.nextCursor ?? candidate.cursor_next
    if (!cursor && typeof next === 'string' && next) cursor = next
    if (hasMore === null && typeof candidate.has_more === 'boolean') hasMore = candidate.has_more
    if (
      hasMore === null &&
      typeof candidate.current_page === 'number' &&
      typeof candidate.last_page === 'number'
    ) {
      hasMore = candidate.current_page < candidate.last_page
    }
  }
  return { cursor, hasMore }
}

/**
 * Read every page of a Winnr list.
 *
 * The platform account is shared by every workspace, and rows are filtered by
 * workspace tag only after they arrive. Reading one page meant a workspace
 * whose domains sat past the first hundred saw an empty card and exported
 * nothing. The envelope's cursor is followed when there is one, page numbers
 * otherwise, and a page that adds nothing new ends the walk so an API that
 * ignores the paging parameter cannot loop.
 */
async function winnrListAll<T>(
  token: string,
  path: string,
  options: { query?: Record<string, string>; sizeParam: 'limit' | 'per_page'; pageSize: number; key: (row: T) => string },
): Promise<T[]> {
  const rows: T[] = []
  const seen = new Set<string>()
  let cursor: string | null = null
  for (let page = 1; page <= MAX_LIST_PAGES; page += 1) {
    const query = new URLSearchParams({ ...(options.query ?? {}), [options.sizeParam]: String(options.pageSize) })
    if (cursor) query.set('cursor', cursor)
    else if (page > 1) query.set('page', String(page))
    const payload = await winnrRequestRaw(token, path, { query })
    const pageRows = listRows<T>(payload)
    let added = 0
    for (const row of pageRows) {
      const key = options.key(row)
      if (seen.has(key)) continue
      seen.add(key)
      rows.push(row)
      added += 1
    }
    if (added === 0) break
    const info = pageInfo(payload)
    if (info.cursor) {
      cursor = info.cursor
      continue
    }
    cursor = null
    if (info.hasMore === false) break
    if (info.hasMore === null && pageRows.length < options.pageSize) break
  }
  return rows
}

function workspaceTag(workspaceId: string): string {
  return `workspace:${workspaceId}`
}

function normalizedDomain(value: unknown, field: string): string {
  const domain = requireString(value, field, { max: 253 }).toLowerCase()
  if (!DOMAIN_PATTERN.test(domain)) {
    throw new HttpError(400, 'INVALID_FIELD', `${field} is not a valid domain name`)
  }
  return domain
}

interface WinnrDomain {
  id: string
  name: string
  status: string
  tags?: string[]
  dns_health?: { status?: string } | null
  email_users_count?: number
  expire_date?: string | null
}

interface WinnrEmailUser {
  id: string
  username: string
  domain: string
  full_address: string
  name: string | null
  status: string
}

interface MailboxOrderRow {
  id: string
  winnr_job_id: string | null
  status: 'processing' | 'provisioned' | 'warming' | 'failed'
  domains: unknown
  mailbox_count: number
  credits_charged: number
  warming_enabled_at: string | null
  error_message: string | null
  created_at: string
  charged_entry_ids?: string[] | null
  credits_refunded_at?: string | null
}

const ORDER_COLUMNS =
  'id, winnr_job_id, status, domains, mailbox_count, credits_charged, warming_enabled_at, error_message, created_at, charged_entry_ids, credits_refunded_at'

// An order row with no provider job after this long never got the provider's
// confirmation recorded; it is surfaced instead of polling forever in silence.
const UNCONFIRMED_ORDER_MS = 30 * 60_000
const UNCONFIRMED_ORDER_MESSAGE =
  'The provider did not confirm this order in time. It may still be provisioning, so the credits were kept. Contact support before ordering these domains again.'
const REFUND_PENDING_MESSAGE =
  'Returning the credits for this order did not finish. It is retried automatically; contact support if this message stays.'

/** Ledger entry ids and refund bookkeeping stay server-side. */
function publicOrder(order: MailboxOrderRow): Omit<MailboxOrderRow, 'charged_entry_ids' | 'credits_refunded_at'> {
  const { charged_entry_ids: _chargedEntryIds, credits_refunded_at: _creditsRefundedAt, ...rest } = order
  return rest
}

async function listWorkspaceDomains(token: string, workspaceId: string, scopeToTag: boolean): Promise<WinnrDomain[]> {
  const tag = workspaceTag(workspaceId)
  const domains = await winnrListAll<WinnrDomain>(token, '/domains', {
    sizeParam: 'limit',
    pageSize: 100,
    key: (domain) => String(domain.id ?? domain.name),
  })
  return domains.filter((domain) => !scopeToTag || (Array.isArray(domain.tags) && domain.tags.includes(tag)))
}

async function mailboxUserIds(apiKey: string, domainNames: string[]): Promise<string[]> {
  const userIds: string[] = []
  for (const domainName of domainNames) {
    const users = await winnrRequest<WinnrEmailUser[] | { data?: WinnrEmailUser[] }>(apiKey, '/email-users', {
      query: new URLSearchParams({ domain: domainName, limit: '25' }),
    })
    const rows = Array.isArray(users) ? users : (users as { data?: WinnrEmailUser[] }).data ?? []
    userIds.push(...rows.map((user) => user.id))
  }
  return userIds
}

/**
 * Give back the exact debits taken for an order the provider refused.
 *
 * Reversed rather than granted. The old version minted a permanent grant,
 * which laundered soon-to-expire allowance credit into lifetime credit, and —
 * worse — left the original debits standing as "charged" for idempotency, so
 * a fail-then-retry replayed those debits free while keeping the grant: any
 * provider outage plus one retry bought the order at net zero. Refunding the
 * entries by id journals the movement as the refund it is, and the spend RPC
 * now reopens a refunded key on retry, so the retry pays.
 *
 * A failure to refund must not mask the provider error that caused it, so
 * this never throws. It reports whether every debit was refunded, so an order
 * is only recorded as refunded once that is true; the refund RPC is
 * idempotent per debit, so retrying the whole list is safe.
 */
async function refundMailboxCredits(
  authContext: AuthContext,
  workspaceId: string,
  orders: Array<{ domain: string }>,
  chargedEntryIds: string[],
): Promise<boolean> {
  if (chargedEntryIds.length === 0) return true
  let failedEntries = 0
  for (const entryId of chargedEntryIds) {
    const refunded = await refundCredits(authContext.admin, {
      workspaceId,
      entryId,
      reason: 'mailbox order was not accepted by the provider',
    })
    if (!refunded) failedEntries += 1
  }
  await writeAudit(authContext.admin, {
    workspaceId,
    actorUserId: authContext.user.id,
    action: failedEntries === 0 ? 'workspace.mailbox_infra.refunded' : 'workspace.mailbox_infra.refund_incomplete',
    entityType: 'mailbox_order',
    entityId: null,
    metadata: {
      domains: orders.map((order) => order.domain),
      refunded_entries: chargedEntryIds.length - failedEntries,
      failed_entries: failedEntries,
    },
  }).catch(() => undefined)
  return failedEntries === 0
}

/**
 * Refund a failed order's debits and record the outcome on the row.
 *
 * credits_refunded_at is stamped only after every debit is back. Stamping it
 * first meant a refund that failed half way read as done for ever: nothing
 * would try again and the workspace kept paying for an order that never
 * existed. On failure the row says the refund needs finishing, and the next
 * status poll or overview retries it.
 */
async function settleMailboxRefund(
  authContext: AuthContext,
  workspaceId: string,
  order: Pick<MailboxOrderRow, 'id' | 'domains' | 'charged_entry_ids'>,
  reason: string,
): Promise<string> {
  const refunded = await refundMailboxCredits(
    authContext,
    workspaceId,
    (Array.isArray(order.domains) ? order.domains : []) as Array<{ domain: string }>,
    Array.isArray(order.charged_entry_ids) ? order.charged_entry_ids : [],
  )
  const now = new Date().toISOString()
  const message = refunded
    ? `${reason} The credits for this order were returned.`
    : `${reason} ${REFUND_PENDING_MESSAGE}`
  const { error } = await authContext.admin.from('workspace_mailbox_orders')
    .update(refunded
      ? { credits_refunded_at: now, error_message: message, updated_at: now }
      : { error_message: message, updated_at: now })
    .eq('workspace_id', workspaceId)
    .eq('id', order.id)
    .is('credits_refunded_at', null)
  if (error) {
    console.error('[Mailbox Infra] could not record the refund outcome', order.id)
  }
  if (!refunded) {
    console.error('[Mailbox Infra] refund incomplete, needs reconciliation', order.id)
  }
  return message
}

/**
 * Fail an order and give back its credits, once.
 *
 * The conditional update is the claim: only the caller that flips the row from
 * processing to failed starts the refund, so two status polls racing over the
 * same failed job cannot both reach the ledger at once (the refund RPC is
 * idempotent per debit as well). A refunded debit reopens its idempotency key,
 * so retrying the same domain charges afresh instead of replaying the
 * refunded debit. Returns the message recorded on the row, or null when
 * another caller had already claimed the failure.
 */
async function failMailboxOrder(
  authContext: AuthContext,
  workspaceId: string,
  order: Pick<MailboxOrderRow, 'id' | 'domains' | 'charged_entry_ids'>,
  reason: string,
): Promise<string | null> {
  const now = new Date().toISOString()
  const { data: claimed, error } = await authContext.admin.from('workspace_mailbox_orders')
    .update({ status: 'failed', error_message: `${reason} ${REFUND_PENDING_MESSAGE}`, updated_at: now })
    .eq('workspace_id', workspaceId)
    .eq('id', order.id)
    .eq('status', 'processing')
    .is('credits_refunded_at', null)
    .select('id')
  if (error) {
    console.error('[Mailbox Infra] could not mark order failed', order.id)
    return null
  }
  if (!claimed || claimed.length === 0) return null
  return await settleMailboxRefund(authContext, workspaceId, order, reason)
}

/**
 * Move a processing order forward: check the provider job, and on completion
 * turn warming on for the mailboxes it created.
 *
 * This used to live only in the status poll, which runs while somebody has the
 * page open. An operator who placed an order and closed the tab left the
 * mailboxes provisioned but never warming — and the order copy promises
 * warming starts automatically.
 */
async function advanceMailboxOrder(
  authContext: AuthContext,
  workspaceId: string,
  apiKey: string,
  order: MailboxOrderRow,
): Promise<MailboxOrderRow> {
  // A failed order whose refund did not finish is retried on every poll until
  // it does. Without this, one failed RPC kept the debit for good.
  if (
    order.status === 'failed' &&
    !order.credits_refunded_at &&
    Array.isArray(order.charged_entry_ids) &&
    order.charged_entry_ids.length > 0
  ) {
    const message = await settleMailboxRefund(authContext, workspaceId, order, 'This order failed.')
    return { ...order, error_message: message }
  }
  if (order.status !== 'processing') return order
  if (!order.winnr_job_id) {
    if (Date.now() - new Date(order.created_at).getTime() > UNCONFIRMED_ORDER_MS) {
      return {
        ...order,
        error_message: order.error_message ??
          'The provider confirmation for this order was not recorded. Contact support before ordering these domains again.',
      }
    }
    return order
  }
  const job = await winnrRequest<{ status?: string; progress?: Record<string, unknown> }>(
    apiKey,
    `/jobs/${encodeURIComponent(order.winnr_job_id)}`,
  )
  if (job.status === 'failed') {
    const message = await failMailboxOrder(authContext, workspaceId, order, 'Provisioning failed at the provider.')
    return {
      ...order,
      status: 'failed',
      error_message: message ?? 'Provisioning failed at the provider.',
    }
  }
  if (job.status !== 'completed') return order

  const userIds = await mailboxUserIds(
    apiKey,
    (order.domains as Array<{ domain: string }>).map((entry) => entry.domain),
  )
  let warmingError: string | null = null
  if (userIds.length === 0) {
    warmingError = 'The provider reported no mailboxes for these domains, so warmup could not be started'
  } else {
    await winnrRequest(apiKey, '/warming/enable-async', {
      method: 'POST',
      body: { user_ids: userIds, settings: { emails_per_day: 20, rampup_speed: 'normal' } },
    }).catch(() => {
      // Recorded rather than swallowed. An order that reads "warming" while
      // nothing is warming costs three silent weeks before anyone notices.
      warmingError = 'Mailboxes were created but warmup could not be started. Retry warmup from this order.'
    })
  }
  const warmingEnabledAt = new Date().toISOString()
  await authContext.admin.from('workspace_mailbox_orders')
    .update({
      status: 'warming',
      warming_enabled_at: warmingError ? null : warmingEnabledAt,
      error_message: warmingError,
      updated_at: warmingEnabledAt,
    })
    .eq('id', order.id)
  return {
    ...order,
    status: 'warming',
    warming_enabled_at: warmingError ? null : warmingEnabledAt,
    error_message: warmingError,
  }
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return optionsResponse(req, METHODS)

  try {
    if (req.method !== 'POST') {
      throw new HttpError(405, 'METHOD_NOT_ALLOWED', 'Only POST is allowed')
    }
    const body = await parseJsonObject(req)
    const action = typeof body.action === 'string' ? body.action : ''
    const workspaceId = requireUuid(body.workspace_id, 'workspace_id')
    const authContext = await requireAuthenticatedUser(req)
    if (!workspaceCredentialIsFresh(authContext)) {
      throw new HttpError(401, 'CREDENTIAL_STALE', 'Sign in again to continue')
    }
    const access = await requireWorkspaceFeatureAccess(authContext, workspaceId)
    requireManager(access)
    // Keep the overview available when platform mailbox provisioning is disabled.
    if (action === 'infra-overview') {
      requireOnlyKeys(body, ['action', 'workspace_id'])
      if (!Deno.env.get('WINNR_API_TOKEN')?.trim()) {
        return jsonResponse(req, METHODS, 200, {
          winnr_connected: false,
          domains: [],
          orders: [],
        })
      }
    }
    const winnrKey = await resolveAiKey(authContext.admin, workspaceId, 'winnr')
    if (!winnrKey) {
      throw new HttpError(
        409,
        'PLATFORM_PROVIDER_NOT_CONFIGURED',
        'Mailbox provisioning is not configured on the platform. Contact support',
      )
    }
    const usingWorkspaceKey = winnrKey.source === 'workspace'

    if (action === 'domain-search') {
      requireOnlyKeys(body, ['action', 'workspace_id', 'domains'])
      if (!Array.isArray(body.domains) || body.domains.length === 0 || body.domains.length > 10) {
        throw new HttpError(400, 'INVALID_FIELD', 'Provide between 1 and 10 domains to check')
      }
      const domains = body.domains.map((entry, index) => normalizedDomain(entry, `domains[${index}]`))
      const result = await winnrRequest<{ results?: Array<{ domain: string; available: boolean | null; price: number | null }> }>(
        winnrKey.apiKey,
        '/domains/search-bulk',
        { method: 'POST', body: { domains } },
      )
      const results = (result.results ?? []).map((entry) => ({
        domain: entry.domain,
        available: entry.available === true,
        price_usd: typeof entry.price === 'number' ? entry.price : null,
      }))
      return jsonResponse(req, METHODS, 200, { results })
    }

    if (action === 'order-create') {
      requireOnlyKeys(body, ['action', 'workspace_id', 'orders'])
      if (!Array.isArray(body.orders) || body.orders.length === 0 || body.orders.length > MAX_ORDER_DOMAINS) {
        throw new HttpError(400, 'INVALID_FIELD', `Provide between 1 and ${MAX_ORDER_DOMAINS} domains per order`)
      }
      const orders = body.orders.map((raw, index) => {
        if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
          throw new HttpError(400, 'INVALID_FIELD', `orders[${index}] must be an object`)
        }
        const entry = raw as Record<string, unknown>
        const domain = normalizedDomain(entry.domain, `orders[${index}].domain`)
        if (!Array.isArray(entry.mailboxes) || entry.mailboxes.length === 0 || entry.mailboxes.length > MAX_MAILBOXES_PER_DOMAIN) {
          throw new HttpError(400, 'INVALID_FIELD', `orders[${index}] needs 1-${MAX_MAILBOXES_PER_DOMAIN} mailboxes`)
        }
        const mailboxes = entry.mailboxes.map((mailboxRaw, mailboxIndex) => {
          if (!mailboxRaw || typeof mailboxRaw !== 'object' || Array.isArray(mailboxRaw)) {
            throw new HttpError(400, 'INVALID_FIELD', `orders[${index}].mailboxes[${mailboxIndex}] must be an object`)
          }
          const mailbox = mailboxRaw as Record<string, unknown>
          const username = requireString(mailbox.username, `orders[${index}].mailboxes[${mailboxIndex}].username`, { max: 40 }).toLowerCase()
          if (!USERNAME_PATTERN.test(username)) {
            throw new HttpError(400, 'INVALID_FIELD', `orders[${index}].mailboxes[${mailboxIndex}].username is invalid`)
          }
          return {
            username,
            name: requireString(mailbox.name, `orders[${index}].mailboxes[${mailboxIndex}].name`, { max: 100 }),
          }
        })
        return { domain, mailboxes }
      })
      const mailboxCount = orders.reduce((total, order) => total + order.mailboxes.length, 0)

      // Charge credits before spending real money with the provider. Each
      // domain and mailbox is idempotency-keyed so retries never double-charge,
      // and every entry id is kept so a refund can reverse the exact debits.
      // A charge failing mid-list — the fourth mailbox hitting an empty
      // balance — refunds the ones already taken before rethrowing, so an
      // abandoned order strands nothing.
      const chargedEntryIds: string[] = []
      let creditsCharged = 0
      try {
        for (const order of orders) {
          const domainCharge = await chargeCredits(authContext.admin, {
            workspaceId,
            operationType: 'mailbox_domain_purchase',
            referenceKind: 'mailbox_domain',
            referenceId: order.domain,
            actorUserId: authContext.user.id,
            idempotencyKey: `mailbox-domain:${workspaceId}:${order.domain}`,
            byoKeyUsed: usingWorkspaceKey,
          })
          // Fresh debits only: a replay names an earlier attempt's paid
          // charge, and refunding it would claw back delivered work. The same
          // holds for credits_charged: this order did not pay for a replay.
          if (domainCharge.entryId && !domainCharge.replayed) chargedEntryIds.push(domainCharge.entryId)
          if (!domainCharge.replayed) creditsCharged += domainCharge.charged
          for (const mailbox of order.mailboxes) {
            const mailboxCharge = await chargeCredits(authContext.admin, {
              workspaceId,
              operationType: 'mailbox_monthly',
              referenceKind: 'mailbox',
              referenceId: `${mailbox.username}@${order.domain}`,
              actorUserId: authContext.user.id,
              idempotencyKey: `mailbox-monthly:${workspaceId}:${mailbox.username}@${order.domain}:first`,
              byoKeyUsed: usingWorkspaceKey,
            })
            if (mailboxCharge.entryId && !mailboxCharge.replayed) chargedEntryIds.push(mailboxCharge.entryId)
            if (!mailboxCharge.replayed) creditsCharged += mailboxCharge.charged
          }
        }
      } catch (error) {
        await refundMailboxCredits(authContext, workspaceId, orders, chargedEntryIds)
        throw error
      }

      // The order is recorded BEFORE the provider is called. Recording it
      // afterwards meant a failed insert left the provider building domains
      // and the workspace charged with nothing tracking either: no status
      // poll, no warmup, no refund path. The row carries the exact debits so
      // a provider failure — now or when the job later fails — reverses them.
      const { data: orderRow, error: orderError } = await authContext.admin
        .from('workspace_mailbox_orders')
        .insert({
          workspace_id: workspaceId,
          winnr_job_id: null,
          status: 'processing',
          domains: orders,
          mailbox_count: mailboxCount,
          credits_charged: creditsCharged,
          charged_entry_ids: chargedEntryIds,
          created_by: authContext.user.id,
        })
        .select('id, status, domains, mailbox_count, credits_charged, created_at')
        .single()
      if (orderError || !orderRow) {
        await refundMailboxCredits(authContext, workspaceId, orders, chargedEntryIds)
        throw new HttpError(500, 'ORDER_SAVE_FAILED', 'The order could not be recorded')
      }
      const trackedOrder = { id: orderRow.id as string, domains: orders, charged_entry_ids: chargedEntryIds }

      // Credits are spent before the provider is called, so an order the
      // provider refused has to give them back. Without this, a Winnr outage
      // charges for infrastructure that does not exist.
      //
      // Only a definite refusal refunds. A timeout or a dropped connection may
      // have reached the provider, which then registers the domains with real
      // money; refunding then gave the order away. Those orders stay
      // processing with the debit kept, say so on the row, and go to support.
      const markUnconfirmed = async () => {
        const { error: markError } = await authContext.admin.from('workspace_mailbox_orders')
          .update({ error_message: UNCONFIRMED_ORDER_MESSAGE, updated_at: new Date().toISOString() })
          .eq('workspace_id', workspaceId)
          .eq('id', orderRow.id)
          .eq('status', 'processing')
        if (markError) console.error('[Mailbox Infra] could not mark order unconfirmed', orderRow.id)
        console.error('[Mailbox Infra] provider outcome unknown, debit kept', orderRow.id)
      }
      let purchase: { job_id?: string; status?: string } | null
      try {
        purchase = await winnrRequest<{ job_id?: string; status?: string }>(winnrKey.apiKey, '/domains/purchase', {
          method: 'POST',
          body: {
            async: true,
            domains: orders.map((order) => ({
              domain: order.domain,
              register: true,
              setup_dns: true,
              setup_email: true,
              users: order.mailboxes,
              tags: [workspaceTag(workspaceId)],
            })),
          },
        })
      } catch (error) {
        if (error instanceof WinnrOutcomeUnknownError) {
          await markUnconfirmed()
          throw new HttpError(504, 'WINNR_UNCONFIRMED', UNCONFIRMED_ORDER_MESSAGE)
        }
        await failMailboxOrder(authContext, workspaceId, trackedOrder, 'The provider did not accept the order.')
        throw error
      }
      // A success response without a job id is not a refusal either: the
      // provider answered 2xx, so it may well be building the order.
      if (!purchase?.job_id) {
        await markUnconfirmed()
        throw new HttpError(504, 'WINNR_UNCONFIRMED', UNCONFIRMED_ORDER_MESSAGE)
      }

      // The provider has accepted and is spending real money, so the job id
      // is retried onto the row rather than dropped on one failed write.
      let jobRecorded = false
      for (let attempt = 0; attempt < 3 && !jobRecorded; attempt += 1) {
        const { error: jobError } = await authContext.admin.from('workspace_mailbox_orders')
          .update({ winnr_job_id: purchase.job_id, updated_at: new Date().toISOString() })
          .eq('workspace_id', workspaceId)
          .eq('id', orderRow.id)
        jobRecorded = !jobError
      }
      if (!jobRecorded) {
        console.error('[Mailbox Infra] provider job id not recorded', orderRow.id, purchase.job_id)
      }
      await writeAudit(authContext.admin, {
        workspaceId,
        actorUserId: authContext.user.id,
        action: 'workspace.mailbox_infra.ordered',
        entityType: 'mailbox_order',
        entityId: orderRow.id,
        metadata: { domains: orders.map((order) => order.domain), mailbox_count: mailboxCount },
      })
      await logOperationCost(authContext.admin, {
        workspaceId,
        operationType: 'mailbox_domain_purchase',
        usage: {},
        usedByoKey: usingWorkspaceKey,
        referenceKind: 'mailbox_order',
        referenceId: orderRow.id,
      })
      return jsonResponse(req, METHODS, 200, { order: orderRow })
    }

    if (action === 'order-status') {
      requireOnlyKeys(body, ['action', 'workspace_id', 'order_id'])
      const orderId = requireUuid(body.order_id, 'order_id')
      const { data: order } = await authContext.admin
        .from('workspace_mailbox_orders')
        .select(ORDER_COLUMNS)
        .eq('workspace_id', workspaceId)
        .eq('id', orderId)
        .maybeSingle()
      if (!order) throw new HttpError(404, 'ORDER_NOT_FOUND', 'Order not found')

      const advanced = await advanceMailboxOrder(
        authContext,
        workspaceId,
        winnrKey.apiKey,
        order as unknown as MailboxOrderRow,
      )
      return jsonResponse(req, METHODS, 200, { order: publicOrder(advanced), progress: null })
    }

    if (action === 'warming-retry') {
      requireOnlyKeys(body, ['action', 'workspace_id', 'order_id'])
      const orderId = requireUuid(body.order_id, 'order_id')
      const { data: order } = await authContext.admin
        .from('workspace_mailbox_orders')
        .select(ORDER_COLUMNS)
        .eq('workspace_id', workspaceId)
        .eq('id', orderId)
        .maybeSingle()
      if (!order) throw new HttpError(404, 'ORDER_NOT_FOUND', 'Order not found')
      if (order.status !== 'warming' || order.warming_enabled_at) {
        throw new HttpError(
          409,
          'WARMING_NOT_PENDING',
          'This order does not have warmup waiting to be started',
        )
      }
      const userIds = await mailboxUserIds(
        winnrKey.apiKey,
        (order.domains as Array<{ domain: string }>).map((entry) => entry.domain),
      )
      if (userIds.length === 0) {
        throw new HttpError(
          409,
          'NO_MAILBOXES',
          'The provider reports no mailboxes on these domains yet',
        )
      }
      await winnrRequest(winnrKey.apiKey, '/warming/enable-async', {
        method: 'POST',
        body: { user_ids: userIds, settings: { emails_per_day: 20, rampup_speed: 'normal' } },
      })
      const warmingEnabledAt = new Date().toISOString()
      await authContext.admin.from('workspace_mailbox_orders')
        .update({ warming_enabled_at: warmingEnabledAt, error_message: null, updated_at: warmingEnabledAt })
        .eq('id', order.id)
      await writeAudit(authContext.admin, {
        workspaceId,
        actorUserId: authContext.user.id,
        action: 'workspace.mailbox_infra.warming_started',
        entityType: 'mailbox_order',
        entityId: order.id,
        metadata: { mailboxes: userIds.length },
      })
      return jsonResponse(req, METHODS, 200, {
        order: publicOrder({
          ...(order as unknown as MailboxOrderRow),
          warming_enabled_at: warmingEnabledAt,
          error_message: null,
        }),
      })
    }

    if (action === 'infra-overview') {
      requireOnlyKeys(body, ['action', 'workspace_id'])
      const [domains, ordersResult] = await Promise.all([
        listWorkspaceDomains(winnrKey.apiKey, workspaceId, !usingWorkspaceKey),
        authContext.admin
          .from('workspace_mailbox_orders')
          .select(ORDER_COLUMNS)
          .eq('workspace_id', workspaceId)
          .order('created_at', { ascending: false })
          .limit(10),
      ])
      // Any order left mid-provision is moved on here, so closing the tab
      // during an order no longer strands its mailboxes unwarmed.
      const orders = await Promise.all(
        ((ordersResult.data ?? []) as unknown as MailboxOrderRow[]).map((order) => (
          advanceMailboxOrder(authContext, workspaceId, winnrKey.apiKey, order)
            .catch(() => order)
        )),
      ).then((rows) => rows.map(publicOrder))
      const warmingRows = await winnrListAll<Record<string, unknown>>(winnrKey.apiKey, '/warming', {
        sizeParam: 'per_page',
        pageSize: 200,
        key: (row) => String(row.id ?? row.full_address),
      }).catch(() => [] as Array<Record<string, unknown>>)
      const domainNames = new Set(domains.map((domain) => domain.name))
      const warmingByAddress = new Map(
        warmingRows
          .filter((row) => typeof row.domain_string === 'string' && domainNames.has(row.domain_string as string))
          .map((row) => [String(row.full_address), row]),
      )

      const detailed = await Promise.all(domains.slice(0, 6).map(async (domain) => {
        const users = await winnrRequest<WinnrEmailUser[] | { data?: WinnrEmailUser[] }>(winnrKey.apiKey, '/email-users', {
          query: new URLSearchParams({ domain: domain.name, limit: '10' }),
        }).catch(() => [])
        const rows = Array.isArray(users) ? users : (users as { data?: WinnrEmailUser[] }).data ?? []
        return {
          id: domain.id,
          name: domain.name,
          status: domain.status,
          dns_health: domain.dns_health?.status ?? null,
          expire_date: domain.expire_date ?? null,
          mailboxes: rows.map((user) => {
            const warmingRow = warmingByAddress.get(user.full_address)
            return {
              full_address: user.full_address,
              name: user.name,
              status: user.status,
              warming_status: warmingRow ? String(warmingRow.warming_status ?? '') || null : null,
              warming_health_score: warmingRow && typeof warmingRow.warming_health_score === 'number'
                ? warmingRow.warming_health_score
                : null,
              warming_inbox_rate: warmingRow && typeof warmingRow.warming_inbox_rate === 'number'
                ? warmingRow.warming_inbox_rate
                : null,
            }
          }),
        }
      }))
      return jsonResponse(req, METHODS, 200, {
        winnr_connected: true,
        domains: detailed,
        // Detail is fetched for the first few domains only. Saying so beats a
        // list that silently stops at six.
        domain_count: domains.length,
        detailed_domain_count: detailed.length,
        orders,
      })
    }

    if (action === 'export-instantly') {
      requireOnlyKeys(body, ['action', 'workspace_id'])
      const domains = await listWorkspaceDomains(winnrKey.apiKey, workspaceId, !usingWorkspaceKey)
      if (domains.length === 0) {
        throw new HttpError(404, 'NO_INFRA', 'This workspace has no purchased sending domains yet')
      }
      const result = await winnrRequest<{ download_url?: string; user_count?: number }>(winnrKey.apiKey, '/export', {
        method: 'POST',
        body: { format: 'instantly', domains: domains.map((domain) => domain.name) },
      })
      if (!result.download_url) {
        throw new HttpError(502, 'WINNR_ERROR', 'The export could not be generated')
      }
      await writeAudit(authContext.admin, {
        workspaceId,
        actorUserId: authContext.user.id,
        action: 'workspace.mailbox_infra.exported',
        entityType: 'mailbox_order',
        entityId: null,
        metadata: { format: 'instantly', user_count: result.user_count ?? null },
      })
      return jsonResponse(req, METHODS, 200, {
        download_url: result.download_url,
        user_count: result.user_count ?? null,
      })
    }

    throw new HttpError(400, 'INVALID_ACTION', 'Unknown mailbox infrastructure action')
  } catch (error) {
    return errorResponse(req, METHODS, error)
  }
})
