import { decodeFeedText } from '@/lib/feedText'
import type {
  WorkspacePodcastCatalogActivityFilter,
  WorkspacePodcastCatalogAudienceFilter,
  WorkspacePodcastCatalogContactFilter,
  WorkspacePodcastCatalogSort,
} from '@/services/workspacePodcastCatalog'

/*
 * The words each filter and sort shows, in one place so the controls, the
 * active-filter chips and the accessible names all say the same thing.
 */

export const CONTACT_LABELS: Record<WorkspacePodcastCatalogContactFilter, string> = {
  all: 'Any email status',
  any: 'Public or verified',
  direct: 'Verified email',
  free: 'Public email',
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
}

export const SORT_LABELS: Record<WorkspacePodcastCatalogSort, string> = {
  best_fit: 'Best fit',
  relevance: 'Relevance',
  audience: 'Largest audience',
  recent: 'Most recent episode',
  community: 'Most shortlisted',
  name: 'Name A to Z',
}

/** What a sort favours, where its name alone does not say. */
export const SORT_HINTS: Partial<Record<WorkspacePodcastCatalogSort, string>> = {
  best_fit: 'Has an email, 10K to 250K audience, recent episodes',
  relevance: 'Closest match to the search first',
}

/** The catalog spells some categories with entities; the value stays as sent. */
export function categoryLabel(value: string): string {
  return value === 'all' ? 'Any category' : decodeFeedText(value).replace(/\s+/gu, ' ').trim()
}
