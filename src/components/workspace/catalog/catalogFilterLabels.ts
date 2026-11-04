import { categoryFilterLabel } from '@/lib/podcastCategories'
import type {
  WorkspacePodcastCatalogActivityFilter,
  WorkspacePodcastCatalogAudienceFilter,
  WorkspacePodcastCatalogB2bFitFilter,
  WorkspacePodcastCatalogJunkFilter,
  WorkspacePodcastFormat,
  WorkspacePodcastListener,
  WorkspacePodcastCatalogContactFilter,
  WorkspacePodcastCatalogGuestsFilter,
  WorkspacePodcastCatalogResearchFilter,
  WorkspacePodcastCatalogSort,
} from '@/services/workspacePodcastCatalog'

/*
 * The words each filter and sort shows, in one place so the controls, the
 * active-filter chips and the accessible names all say the same thing.
 */

// In the order the Email filter lists them. "Valid email" (a mailbox confirmed to
// accept mail, or an unlocked contact) is the one people want most, so it leads;
// an unlocked contact is a paid direct-host lookup, not a checked public inbox.
export const CONTACT_LABELS: Record<WorkspacePodcastCatalogContactFilter, string> = {
  all: 'Any email status',
  verified: 'Valid email (deliverable)',
  any: 'Has an email',
  free: 'Public email (unchecked or catch-all)',
  direct: 'Unlocked direct contact',
  none: 'No email',
}

// "Still publishing" is an active feed with an episode in the last 90 days.
export const ACTIVITY_LABELS: Record<WorkspacePodcastCatalogActivityFilter, string> = {
  active: 'Still publishing',
  last_30_days: 'Published in 30 days',
  last_90_days: 'Published in 90 days',
  last_180_days: 'Published in 6 months',
  last_year: 'Published in 1 year',
  all: 'All shows',
}

/*
 * The choices the Activity filter offers. "Published in 90 days" is the same
 * rule as Still publishing, so it is not offered twice; an address that still
 * carries it keeps its label.
 */
export const ACTIVITY_OPTIONS: WorkspacePodcastCatalogActivityFilter[] = [
  'active',
  'last_30_days',
  'last_180_days',
  'last_year',
  'all',
]

export const AUDIENCE_LABELS: Record<WorkspacePodcastCatalogAudienceFilter, string> = {
  all: 'Any audience size',
  under_10k: 'Under 10K',
  '10k_50k': '10K to 50K',
  '50k_250k': '50K to 250K',
  '250k_1m': '250K to 1M',
  '1m_plus': '1M+',
  '250k_plus': '250K+',
}

/*
 * The choices the Audience filter offers. 250K+ was split into 250K to 1M and
 * 1M+; an old address that still carries it keeps its label and its meaning.
 */
export const AUDIENCE_OPTIONS: WorkspacePodcastCatalogAudienceFilter[] = [
  'all',
  'under_10k',
  '10k_50k',
  '50k_250k',
  '250k_1m',
  '1m_plus',
]

// Jev's judgment once a show is tagged, Podscan's guest detection until then; neither is
// certain, so "Not flagged" is not "never".
export const GUESTS_LABELS: Record<WorkspacePodcastCatalogGuestsFilter, string> = {
  all: 'Any guest format',
  yes: 'Takes guests',
  no: 'Not flagged for guests',
}

// Podscan data already fetched for research: recent episodes and, usually, a transcript.
export const RESEARCH_LABELS: Record<WorkspacePodcastCatalogResearchFilter, string> = {
  all: 'Any research status',
  saved: 'Research data saved',
  not_saved: 'No research data yet',
}

// Jev's B2B fit, 0 to 4: how well a founder, executive or expert fits as a guest.
export const B2B_FIT_LABELS: Record<WorkspacePodcastCatalogB2bFitFilter, string> = {
  all: 'Any B2B fit',
  some: 'Some B2B fit or better',
  good: 'Good B2B fit or better',
  strong: 'Strong B2B fit',
}

// Who a show is made for, as Jev reads its name, description and categories.
export const LISTENER_LABELS: Record<WorkspacePodcastListener, string> = {
  founders: 'Founders & business owners',
  executives: 'Executives',
  marketers: 'Marketers',
  sales: 'Sales & revenue',
  investors: 'Investors',
  technical: 'Engineers & IT',
  healthcare: 'Healthcare',
  consumers: 'General public',
}

export const FORMAT_LABELS: Record<WorkspacePodcastFormat, string> = {
  interview: 'Interview',
  panel: 'Panel',
  solo: 'Solo host',
  cohosts: 'Co-hosts',
  news: 'News & updates',
  narrative: 'Narrative',
  brand: 'Company podcast',
  other: 'Other format',
}

// Spam, piracy, content farms and audiobook or radio re-uploads, as Jev judges them.
export const JUNK_LABELS: Record<WorkspacePodcastCatalogJunkFilter, string> = {
  hide: 'Hide junk feeds',
  show: 'Include junk feeds',
}

/** "Founders", "Founders +2": a list of tag choices on a closed control. */
export function tagListLabel<T extends string>(values: T[], labels: Record<T, string>): string {
  if (values.length === 0) return ''
  return values.length === 1 ? labels[values[0]] : `${labels[values[0]]} +${values.length - 1}`
}

export const SORT_LABELS: Record<WorkspacePodcastCatalogSort, string> = {
  best_fit: 'Best fit',
  relevance: 'Relevance',
  audience: 'Largest audience',
  recent: 'Most recent episode',
  community: 'Most shortlisted',
  rating: 'Highest rated',
  reach: 'Reach score',
  name: 'Name A to Z',
}

/** What a sort favours, where its name alone does not say. */
export const SORT_HINTS: Partial<Record<WorkspacePodcastCatalogSort, string>> = {
  best_fit: 'Takes guests, B2B fit, has an email, 10K to 250K audience, recent episodes',
  relevance: 'Closest match to the search first',
}

/** A category filter value by its proper name ("health|fitness" reads "Health & Fitness"). */
export function categoryLabel(value: string): string {
  return categoryFilterLabel(value)
}

/** "Business", "Business +2": what a list of category choices reads as on a closed control. */
export function categoryListLabel(values: string[]): string {
  if (values.length === 0) return ''
  const first = categoryLabel(values[0])
  return values.length === 1 ? first : `${first} +${values.length - 1}`
}
