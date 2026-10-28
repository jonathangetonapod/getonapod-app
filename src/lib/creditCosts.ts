/** Operation names retained for analytics. Flat subscriptions have no app-credit prices. */
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

// Zeroed by the flat-subscription migration; historical ledger entries keep their original amounts.
export const CREDIT_COSTS: Record<MeteredOperation, number> = {
  research_run: 0,
  email_unlock_identify: 0,
  email_unlock_find: 0,
  email_unlock_verify: 0,
  dashboard_build: 0,
  query_generation: 0,
  compatibility_scoring: 0,
  podscan_lookup: 0,
  semantic_search: 0,
  pitch_profile: 0,
  mailbox_domain_purchase: 0,
  mailbox_monthly: 0,
}

/** Plain names for the price list, the usage table and the ledger. */
export const OPERATION_NAMES: Record<MeteredOperation | 'other', string> = {
  research_run: 'Research a podcast',
  email_unlock_identify: 'Identify a host',
  email_unlock_find: "Find a host's email",
  email_unlock_verify: 'Verify a host email',
  dashboard_build: 'Build a prospect page',
  query_generation: 'Write search terms, a pitch or a reply',
  compatibility_scoring: 'Score podcasts for fit (per 20)',
  podscan_lookup: 'Look up podcast data',
  semantic_search: 'Search the podcast database',
  pitch_profile: 'Draft a client profile',
  mailbox_domain_purchase: 'Buy a sending domain',
  mailbox_monthly: 'Run a mailbox for a month',
  other: 'Other',
}

/** "2 credits", "1 credit", or "Included" when nothing is charged. */
export function creditsLabel(credits: number): string {
  if (credits <= 0) return 'Included'
  return `${credits} ${credits === 1 ? 'credit' : 'credits'}`
}

/**
 * The suffix for a button that spends credits: "· 2 credits", or
 * "· up to 5 credits" for a batch whose size is known, or "· Included" when
 * the workspace's own key pays for it.
 */
export function creditCostSuffix(
  operation: MeteredOperation,
  options: { byo?: boolean; units?: number } = {},
): string {
  void operation
  void options
  return '· Your provider account'
}

/**
 * What a single credit pays for, from the same table every button quotes, so
 * the header tooltip moves when the ledger does.
 */
export function oneCreditBuys(): string {
  return 'Historical credit balance. Workspace subscriptions now use customer-owned provider accounts.'
}
