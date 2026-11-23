import type { MeteredOperation } from '@/lib/creditCosts'

export type AiKeyProvider = 'anthropic' | 'openai' | 'openrouter'

/** Which text AI keys a workspace has saved, as client and dashboard reads report it. */
export interface AiKeyPresence {
  anthropic?: boolean
  openai?: boolean
  openrouter?: boolean
}

/**
 * Whether the workspace pays for AI itself. Any one text key is enough: the
 * server runs every AI step on whichever is selected.
 */
export function hasOwnAiKey(keys: AiKeyPresence | null | undefined): boolean {
  return keys?.anthropic === true || keys?.openai === true || keys?.openrouter === true
}

/*
 * Which metered work each provider's key pays for, read from where the edge
 * functions resolve a workspace key before charging (resolveAiKey beside the
 * operation's chargeOperation). A prospect page uses both; Claude writes it,
 * so it is counted there. Database search is OpenAI's, and costs nothing.
 * OpenRouter pays for the same text work Claude does when it is selected.
 */
export const AI_KEY_OPERATIONS: Record<AiKeyProvider, MeteredOperation[]> = {
  anthropic: ['research_run', 'query_generation', 'compatibility_scoring', 'dashboard_build', 'pitch_profile'],
  openai: ['semantic_search'],
  openrouter: ['research_run', 'query_generation', 'compatibility_scoring', 'dashboard_build', 'pitch_profile'],
}

/**
 * Platform credits spent this month on the work each key would pay for, from
 * the billing overview's ledger totals. Work already run on a workspace key
 * was never charged, so it is not in here.
 */
export function platformCreditsByProvider(
  ledgerUsage: Record<string, { credits: number }> | undefined,
): Record<AiKeyProvider, number> {
  const total = (provider: AiKeyProvider) => AI_KEY_OPERATIONS[provider]
    .reduce((sum, operation) => sum + Math.max(0, Number(ledgerUsage?.[operation]?.credits) || 0), 0)
  return { anthropic: total('anthropic'), openai: total('openai'), openrouter: total('openrouter') }
}
