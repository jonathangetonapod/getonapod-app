/**
 * What each metered operation costs, for display before the click.
 *
 * The ledger prices from public.operation_credit_costs (seeded in the
 * migrations named below); this is the ONE frontend copy, so a button in the
 * finder, the inbox and the prospect studio all quote the same number. The
 * billing page prefers the live prices the overview returns and falls back to
 * these. A workspace running on its own AI key is not charged, so callers pass
 * `byo` to say so.
 */
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

// Seeded and re-priced across the migrations; scripts/test-credit-costs-sync
// replays every operation_credit_costs insert in order and pins these values.
export const CREDIT_COSTS: Record<MeteredOperation, number> = {
  research_run: 2,
  email_unlock_identify: 0,
  email_unlock_find: 0,
  email_unlock_verify: 1,
  dashboard_build: 5,
  query_generation: 1,
  compatibility_scoring: 1,
  podscan_lookup: 1,
  semantic_search: 0,
  pitch_profile: 3,
  mailbox_domain_purchase: 20,
  mailbox_monthly: 5,
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
  if (options.byo) return '· Included'
  const credits = CREDIT_COSTS[operation] * Math.max(1, options.units ?? 1)
  if (credits <= 0) return '· Included'
  return options.units && options.units > 1 ? `· up to ${creditsLabel(credits)}` : `· ${creditsLabel(credits)}`
}
