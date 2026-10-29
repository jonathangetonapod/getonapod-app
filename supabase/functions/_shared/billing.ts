// Flat subscriptions never debit app credits. Keep the operation vocabulary,
// cost telemetry and historical refund support for in-flight legacy work.

import { createAdminClient } from './workspaceAuth.ts'

export type MeteredOperation =
  | 'research_run'
  | 'email_unlock_identify'
  | 'email_unlock_find'
  | 'email_unlock_verify'
  | 'dashboard_build'
  | 'query_generation'
  | 'compatibility_scoring'
  | 'podscan_lookup'
  | 'semantic_search'
  | 'pitch_profile'
  | 'mailbox_domain_purchase'
  | 'mailbox_monthly'
  | 'other'

export interface TokenUsage {
  anthropicInputTokens?: number
  anthropicOutputTokens?: number
  openaiTokens?: number
  openaiInputTokens?: number
  openaiOutputTokens?: number
  podscanCalls?: number
}

// Rough USD per unit for margin analytics; repriced here without ceremony
// because the numbers are estimates, not invoices.
const USD_PER_ANTHROPIC_INPUT_TOKEN = 0.000003
const USD_PER_ANTHROPIC_OUTPUT_TOKEN = 0.000015
const USD_PER_OPENAI_TOKEN = 0.00000002
const USD_PER_PODSCAN_CALL = 0.002

export function enforcementEnabled(): boolean {
  return false
}

export function estimatedCostUsd(usage: TokenUsage): number {
  const total = (usage.anthropicInputTokens ?? 0) * USD_PER_ANTHROPIC_INPUT_TOKEN
    + (usage.anthropicOutputTokens ?? 0) * USD_PER_ANTHROPIC_OUTPUT_TOKEN
    + (usage.openaiInputTokens ?? 0) * 0.000002
    + (usage.openaiOutputTokens ?? 0) * 0.000008
    + (usage.openaiTokens ?? 0) * USD_PER_OPENAI_TOKEN
    + (usage.podscanCalls ?? 0) * USD_PER_PODSCAN_CALL
  return Math.round(total * 1_000_000) / 1_000_000
}

/**
 * An idempotency key that survives a retry without making a repeat free.
 *
 * The obvious key — operation plus the thing it acts on — is wrong for
 * anything a person may legitimately run twice. Keyed on the podcast, a second
 * deliberate lookup would be free for ever; keyed on the client, so would
 * every future regeneration. The unique index does not know the difference
 * between a double-click and a decision.
 *
 * A coarse time bucket does: a retry lands in the same window as the attempt
 * it repeats, and a deliberate re-run minutes later does not. Two attempts
 * straddling a boundary are both charged, which is the safe direction to be
 * wrong in — the alternative is silently free work.
 *
 * Only for operations that build a specific thing. An operation whose repeat
 * is ordinary within the window, like a search, should carry no key at all.
 */
export function retryWindowKey(parts: Array<string | null | undefined>, windowMs = 120_000): string {
  const bucket = Math.floor(Date.now() / windowMs)
  return `${parts.filter(Boolean).join(':')}:w${bucket}`
}

// Compatibility interface for existing callers. No new lots or debits are written.
export async function chargeCredits(
  admin: ReturnType<typeof createAdminClient>,
  input: {
    workspaceId: string
    operationType: MeteredOperation
    referenceKind?: string
    referenceId?: string
    clientId?: string | null
    actorUserId?: string | null
    idempotencyKey?: string
    byoKeyUsed?: boolean
  },
): Promise<{ charged: number; entryId: string | null; replayed: boolean }> {
  // Compatibility shim for existing operation callers. Historical refund paths
  // remain available, but flat subscriptions never create new credit debits.
  void admin
  void input
  return { charged: 0, entryId: null, replayed: false }
}

/**
 * Give back a charge whose work did not happen.
 *
 * Credits are taken before the provider call, so an empty balance never gets a
 * free ride — but that means a timeout or a refusal leaves the workspace
 * paying for nothing. The ledger has always had a word for undoing that and
 * nothing ever said it.
 *
 * Never throws. A refund that fails must not replace the caller's real error
 * with a billing one: the operation already failed, and that is the failure
 * worth reporting. It does report the outcome, though: true when the debit is
 * refunded (now or by an earlier call — the RPC is idempotent per debit) or
 * there was nothing to refund, false when the refund did not land. Callers
 * that track a refund to completion must not record it as done on false.
 */
export async function refundCredits(
  admin: ReturnType<typeof createAdminClient>,
  input: { workspaceId: string; entryId: string | null; reason?: string },
): Promise<boolean> {
  /*
   * entryId alone decides. It is non-null exactly when a real debit was
   * written, so gating on the enforcement flag as well meant flipping the
   * flag off between a charge and its failure ate the refund: the debit stood
   * for work that was never delivered.
   */
  if (!input.entryId) return true
  try {
    const { error } = await admin.rpc('refund_workspace_credits_v1', {
      p_workspace_id: input.workspaceId,
      p_debit_entry_id: input.entryId,
      p_reason: input.reason ?? null,
    })
    if (error) {
      // The one observability this has: supabase-js reports failures as a
      // return value, so without this line a failed refund vanished silently.
      console.error(`[billing] refund of entry ${input.entryId} failed: ${error.message}`)
      return false
    }
    return true
  } catch (error) {
    // Never rethrown — the operation's own failure is the one worth
    // reporting — but never silent either.
    console.error(`[billing] refund of entry ${input.entryId} threw: ${error instanceof Error ? error.message : 'unknown'}`)
    return false
  }
}

// Cost logging never fails the underlying operation.
export async function logOperationCost(
  admin: ReturnType<typeof createAdminClient>,
  input: {
    workspaceId: string
    operationType: MeteredOperation
    usage: TokenUsage
    usedByoKey?: boolean
    clientId?: string | null
    referenceKind?: string
    referenceId?: string
  },
): Promise<void> {
  try {
    const { error } = await admin.from('workspace_operation_costs').insert({
      workspace_id: input.workspaceId,
      client_id: input.clientId ?? null,
      operation_type: input.operationType,
      anthropic_input_tokens: Math.max(0, Math.round(input.usage.anthropicInputTokens ?? 0)),
      anthropic_output_tokens: Math.max(0, Math.round(input.usage.anthropicOutputTokens ?? 0)),
      openai_input_tokens: Math.max(0, Math.round(input.usage.openaiInputTokens ?? 0)),
      openai_output_tokens: Math.max(0, Math.round(input.usage.openaiOutputTokens ?? 0)),
      openai_tokens: Math.max(0, Math.round(input.usage.openaiTokens ?? 0)),
      podscan_calls: Math.max(0, Math.round(input.usage.podscanCalls ?? 0)),
      estimated_cost_usd: estimatedCostUsd(input.usage),
      used_byo_key: input.usedByoKey === true,
      reference_kind: input.referenceKind?.slice(0, 60) ?? null,
      reference_id: input.referenceId?.slice(0, 120) ?? null,
    })
    if (error) console.error('[Billing] Operation cost logging failed')
  } catch (_error) {
    console.error('[Billing] Operation cost logging failed')
  }
}
