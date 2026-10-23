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

// "Still publishing" is the catalog's own active flag, not a date window; the
// dated choices below it are the ones that check the last episode.
export const ACTIVITY_LABELS: Record<WorkspacePodcastCatalogActivityFilter, string> = {
  active: 'Still publishing',
  last_30_days: 'Published in 30 days',
  last_90_days: 'Published in 90 days',
  last_180_days: 'Published in 6 months',
  last_year: 'Published in 1 year',
  all: 'All shows',
}

export const AUDIENCE_LABELS: Record<WorkspacePodcastCatalogAudienceFilter, string> = {
  all: 'Any audience size',
  under_10k: 'Under 10K',
  '10k_50k': '10K to 50K',
  '50k_250k': '50K to 250K',
  '250k_plus': '250K+',
}

export const SORT_LABELS: Record<WorkspacePodcastCatalogSort, string> = {
  audience: 'Largest audience',
  recent: 'Most recent episode',
  community: 'Most shortlisted',
  name: 'Name A to Z',
}

/** The catalog spells some categories with entities; the value stays as sent. */
export function categoryLabel(value: string): string {
  return value === 'all' ? 'Any category' : decodeFeedText(value).replace(/\s+/gu, ' ').trim()
}
