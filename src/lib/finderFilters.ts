/*
 * The Podcast Finder's search settings, and the presets that set them.
 *
 * The presets are a way of choosing the same three strings the scan has always
 * read (minAudience, maxAudience, minEpisodes). They never reach the request
 * themselves, so a preset and the equivalent typed value send an identical
 * Podscan payload.
 */

export interface FinderFilters {
  customKeywords: string[]
  includeAiStrategy: boolean
  language: string
  region: string
  activityDays: string
  guestsOnly: boolean
  /** Digits, or '' for no bound. */
  minAudience: string
  maxAudience: string
  minEpisodes: string
}

export const DEFAULT_FINDER_FILTERS: FinderFilters = {
  customKeywords: [],
  includeAiStrategy: true,
  language: 'en',
  region: 'any',
  activityDays: '90',
  guestsOnly: true,
  minAudience: '',
  maxAudience: '',
  minEpisodes: '',
}

export const LANGUAGE_OPTIONS = [
  { value: 'any', label: 'Any language' },
  { value: 'en', label: 'English' },
  { value: 'es', label: 'Spanish' },
  { value: 'fr', label: 'French' },
  { value: 'de', label: 'German' },
  { value: 'pt', label: 'Portuguese' },
  { value: 'it', label: 'Italian' },
  { value: 'nl', label: 'Dutch' },
  { value: 'sv', label: 'Swedish' },
  { value: 'hi', label: 'Hindi' },
  { value: 'ja', label: 'Japanese' },
]

export const REGION_OPTIONS = [
  { value: 'any', label: 'Any region' },
  { value: 'US', label: 'United States' },
  { value: 'GB', label: 'United Kingdom' },
  { value: 'CA', label: 'Canada' },
  { value: 'AU', label: 'Australia' },
  { value: 'DE', label: 'Germany' },
  { value: 'IE', label: 'Ireland' },
  { value: 'NZ', label: 'New Zealand' },
  { value: 'IN', label: 'India' },
  { value: 'SG', label: 'Singapore' },
  { value: 'ZA', label: 'South Africa' },
  { value: 'NL', label: 'Netherlands' },
  { value: 'FR', label: 'France' },
  { value: 'ES', label: 'Spain' },
  { value: 'IT', label: 'Italy' },
  { value: 'SE', label: 'Sweden' },
  { value: 'BR', label: 'Brazil' },
  { value: 'MX', label: 'Mexico' },
]

export const ACTIVITY_OPTIONS = [
  { value: '30', label: 'Active in last 30 days' },
  { value: '90', label: 'Active in last 90 days' },
  { value: '180', label: 'Active in last 6 months' },
  { value: '365', label: 'Active in last year' },
  { value: 'any', label: 'Any activity' },
]

/*
 * Podscan's reach.audience_size: modeled from chart rankings, subscriber
 * counts, social following and reviews, not measured downloads, and stated
 * per episode ("Podscan's audience estimates are per-episode figures",
 * help.podscan.fm, Audience Size and Listener Demographics). Their show pages
 * label a similar number "Monthly Listeners (Est.)"; the methodology is what
 * the field means.
 */
export const AUDIENCE_UNIT = 'estimated listeners per episode'

export interface FinderPreset {
  id: string
  label: string
  /** The value written to the filter; '' is no bound. */
  value: string
}

export const AUDIENCE_PRESETS: FinderPreset[] = [
  { id: 'any', label: 'Any', value: '' },
  { id: '1k', label: '1K+', value: '1000' },
  { id: '5k', label: '5K+', value: '5000' },
  { id: '25k', label: '25K+', value: '25000' },
  { id: '100k', label: '100K+', value: '100000' },
]

export const EPISODE_PRESETS: FinderPreset[] = [
  { id: 'any', label: 'Any', value: '' },
  { id: '10', label: '10+', value: '10' },
  { id: '25', label: '25+', value: '25' },
  { id: '50', label: '50+', value: '50' },
]

export const CUSTOM_PRESET_ID = 'custom'

/** The audience bounds a preset stands for. Custom keeps whatever is typed. */
export function audiencePresetValues(presetId: string): Pick<FinderFilters, 'minAudience' | 'maxAudience'> | null {
  const preset = AUDIENCE_PRESETS.find((entry) => entry.id === presetId)
  return preset ? { minAudience: preset.value, maxAudience: '' } : null
}

export function episodePresetValue(presetId: string): string | null {
  return EPISODE_PRESETS.find((entry) => entry.id === presetId)?.value ?? null
}

/**
 * Which chip is lit for the current bounds. A max audience has no preset, so
 * any max (or a min no preset matches) reads as Custom.
 */
export function audiencePresetFor(filters: Pick<FinderFilters, 'minAudience' | 'maxAudience'>): string {
  if (filters.maxAudience !== '') return CUSTOM_PRESET_ID
  return AUDIENCE_PRESETS.find((entry) => entry.value === filters.minAudience)?.id ?? CUSTOM_PRESET_ID
}

export function episodePresetFor(minEpisodes: string): string {
  return EPISODE_PRESETS.find((entry) => entry.value === minEpisodes)?.id ?? CUSTOM_PRESET_ID
}

/** How many settings differ from the defaults. */
export function changedFilterCount(filters: FinderFilters): number {
  return [
    filters.language !== DEFAULT_FINDER_FILTERS.language,
    filters.region !== DEFAULT_FINDER_FILTERS.region,
    filters.activityDays !== DEFAULT_FINDER_FILTERS.activityDays,
    filters.guestsOnly !== DEFAULT_FINDER_FILTERS.guestsOnly,
    filters.minAudience !== '',
    filters.maxAudience !== '',
    filters.minEpisodes !== '',
    filters.customKeywords.length > 0,
    filters.includeAiStrategy !== DEFAULT_FINDER_FILTERS.includeAiStrategy,
  ].filter(Boolean).length
}

/** The minimum and maximum together say something only when both are numbers in order. */
export function audienceRangeIsInverted(filters: Pick<FinderFilters, 'minAudience' | 'maxAudience'>): boolean {
  if (filters.minAudience === '' || filters.maxAudience === '') return false
  return Number.parseInt(filters.minAudience, 10) > Number.parseInt(filters.maxAudience, 10)
}

function compact(value: string): string {
  const number = Number.parseInt(value, 10)
  if (!Number.isFinite(number)) return value
  if (number >= 1000 && number % 1000 === 0) return `${(number / 1000).toLocaleString()}K`
  return number.toLocaleString()
}

/** The closed panel's one-line summary, one chip per setting worth naming. */
export function filterSummary(filters: FinderFilters): string[] {
  const label = (options: Array<{ value: string; label: string }>, value: string) =>
    options.find((option) => option.value === value)?.label ?? value
  const chips = [
    label(LANGUAGE_OPTIONS, filters.language),
    label(REGION_OPTIONS, filters.region),
    filters.activityDays === 'any' ? 'Any activity' : label(ACTIVITY_OPTIONS, filters.activityDays).replace('Active in last', 'Active last'),
    filters.guestsOnly ? 'Guest shows only' : 'All show formats',
  ]
  if (filters.minAudience !== '' && filters.maxAudience !== '') {
    chips.push(`${compact(filters.minAudience)} to ${compact(filters.maxAudience)} listeners`)
  } else if (filters.minAudience !== '') {
    chips.push(`${compact(filters.minAudience)}+ listeners`)
  } else if (filters.maxAudience !== '') {
    chips.push(`Up to ${compact(filters.maxAudience)} listeners`)
  }
  if (filters.minEpisodes !== '') chips.push(`${compact(filters.minEpisodes)}+ episodes`)
  if (filters.customKeywords.length > 0) {
    chips.push(`${filters.customKeywords.length} keyword${filters.customKeywords.length === 1 ? '' : 's'}`)
  }
  if (!filters.includeAiStrategy) chips.push('AI strategy off')
  return chips
}
