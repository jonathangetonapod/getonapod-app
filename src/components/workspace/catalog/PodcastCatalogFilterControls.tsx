import { Select, SelectContent, SelectGroup, SelectItem, SelectLabel, SelectSeparator, SelectTrigger, SelectValue } from '@/components/ui/select'
import {
  ACTIVITY_LABELS,
  ACTIVITY_OPTIONS,
  AUDIENCE_LABELS,
  AUDIENCE_OPTIONS,
  categoryLabel,
  CONTACT_LABELS,
} from '@/components/workspace/catalog/catalogFilterLabels'
import { DEFAULT_CATALOG_PARAMS, type PodcastCatalogParams } from '@/hooks/usePodcastCatalogParams'
import { languageName, regionName } from '@/lib/podcastCatalogDisplay'
import { categoryFilterGroups } from '@/lib/podcastCategories'

export type ParamsUpdate = (patch: Partial<PodcastCatalogParams>, options?: { replace?: boolean }) => void

/** Closed, a filter reads as its value; its accessible name says which filter it is. */
function filterName(name: string, value: string, isDefault: boolean) {
  return isDefault ? value : `${name}: ${value}`
}

/*
 * Language and region arrive as codes ("en", "us") and read as names. The
 * catalogue sends the codes it holds, so every choice matches something; one
 * already in the address is kept even if this page's list lacks it.
 */
const LocaleSelect = ({
  name,
  value,
  codes,
  label,
  onChange,
}: {
  name: 'Language' | 'Region'
  value: string
  codes: string[]
  label: (code: string) => string | null
  onChange: (code: string) => void
}) => {
  const anyLabel = name === 'Language' ? 'Any language' : 'Any region'
  // A code nothing can name (a language code stored as a region, say) would
  // only read as itself, so it is not offered; one already chosen stays.
  const named = codes.filter((code) => label(code) !== code.toUpperCase())
  const options = value !== 'all' && !named.includes(value) ? [value, ...named] : named
  const current = value === 'all' ? anyLabel : label(value) || value
  return (
    <Select value={value} onValueChange={onChange}>
      <SelectTrigger aria-label={filterName(name, current, value === 'all')}>
        <SelectValue>{current}</SelectValue>
      </SelectTrigger>
      <SelectContent className="max-h-80">
        <SelectItem value="all">{anyLabel}</SelectItem>
        {options.map((code) => <SelectItem key={code} value={code}>{label(code) || code}</SelectItem>)}
      </SelectContent>
    </Select>
  )
}

/*
 * The categories a B2B client is pitched on first, then everything else, each
 * by its proper name. A value chosen earlier (an older address that names a
 * single code) stays selectable even when it is no longer a choice.
 */
const CategoryOptions = ({ codes, selected }: { codes: string[]; selected: string }) => {
  const { professional, other } = categoryFilterGroups(codes)
  const known = [...professional, ...other].some((choice) => choice.value === selected)
  return (
    <>
      {selected !== 'all' && !known && <SelectItem value={selected}>{categoryLabel(selected)}</SelectItem>}
      {professional.length > 0 && (
        <SelectGroup>
          <SelectLabel className="text-xs font-medium text-muted-foreground">Business &amp; professional</SelectLabel>
          {professional.map((choice) => <SelectItem key={choice.value} value={choice.value}>{choice.label}</SelectItem>)}
        </SelectGroup>
      )}
      {professional.length > 0 && other.length > 0 && <SelectSeparator />}
      {other.length > 0 && (
        <SelectGroup>
          <SelectLabel className="text-xs font-medium text-muted-foreground">Other topics</SelectLabel>
          {other.map((choice) => <SelectItem key={choice.value} value={choice.value}>{choice.label}</SelectItem>)}
        </SelectGroup>
      )}
    </>
  )
}

export const FilterControls = ({
  params,
  update,
  categories,
  languages,
  regions,
}: {
  params: PodcastCatalogParams
  update: ParamsUpdate
  categories: string[]
  languages: string[]
  regions: string[]
}) => (
  <>
    <Select value={params.category} onValueChange={(category) => update({ category })}>
      <SelectTrigger aria-label={filterName('Category', categoryLabel(params.category), params.category === 'all')}>
        <SelectValue>{categoryLabel(params.category)}</SelectValue>
      </SelectTrigger>
      <SelectContent className="max-h-80">
        <SelectItem value="all">Any category</SelectItem>
        <CategoryOptions codes={categories} selected={params.category} />
      </SelectContent>
    </Select>
    <Select value={params.contact} onValueChange={(contact: PodcastCatalogParams['contact']) => update({ contact })}>
      <SelectTrigger aria-label={filterName('Email status', CONTACT_LABELS[params.contact], params.contact === 'all')}>
        <SelectValue>{CONTACT_LABELS[params.contact]}</SelectValue>
      </SelectTrigger>
      <SelectContent>
        {(Object.keys(CONTACT_LABELS) as Array<PodcastCatalogParams['contact']>).map((value) => (
          <SelectItem key={value} value={value}>{CONTACT_LABELS[value]}</SelectItem>
        ))}
      </SelectContent>
    </Select>
    <Select value={params.activity} onValueChange={(activity: PodcastCatalogParams['activity']) => update({ activity })}>
      <SelectTrigger aria-label={filterName('Activity', ACTIVITY_LABELS[params.activity], params.activity === DEFAULT_CATALOG_PARAMS.activity)}>
        <SelectValue>{ACTIVITY_LABELS[params.activity]}</SelectValue>
      </SelectTrigger>
      <SelectContent>
        {ACTIVITY_OPTIONS.map((value) => (
          <SelectItem key={value} value={value}>{ACTIVITY_LABELS[value]}</SelectItem>
        ))}
      </SelectContent>
    </Select>
    <Select value={params.audience} onValueChange={(audience: PodcastCatalogParams['audience']) => update({ audience })}>
      <SelectTrigger aria-label={filterName('Audience', AUDIENCE_LABELS[params.audience], params.audience === 'all')}>
        <SelectValue>{AUDIENCE_LABELS[params.audience]}</SelectValue>
      </SelectTrigger>
      <SelectContent>
        {AUDIENCE_OPTIONS.map((value) => (
          <SelectItem key={value} value={value}>{AUDIENCE_LABELS[value]}</SelectItem>
        ))}
      </SelectContent>
    </Select>
    <LocaleSelect name="Language" value={params.language} codes={languages} label={languageName} onChange={(language) => update({ language })} />
    <LocaleSelect name="Region" value={params.region} codes={regions} label={regionName} onChange={(region) => update({ region })} />
  </>
)
