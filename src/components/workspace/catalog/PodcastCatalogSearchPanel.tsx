import { useEffect, useState } from 'react'
import { Loader2, Search, SlidersHorizontal, X } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle, SheetTrigger } from '@/components/ui/sheet'
import {
  ACTIVITY_LABELS,
  ACTIVITY_OPTIONS,
  AUDIENCE_LABELS,
  categoryLabel,
  CONTACT_LABELS,
} from '@/components/workspace/catalog/catalogFilterLabels'
import { CLEAR_ALL_FILTERS, DEFAULT_CATALOG_PARAMS, type PodcastCatalogParams } from '@/hooks/usePodcastCatalogParams'

type ParamsUpdate = (patch: Partial<PodcastCatalogParams>, options?: { replace?: boolean }) => void

/** Closed, a filter reads as its value; its accessible name says which filter it is. */
function filterName(name: string, value: string, isDefault: boolean) {
  return isDefault ? value : `${name}: ${value}`
}

interface ActiveChip {
  key: string
  label: string
  clear: Partial<PodcastCatalogParams>
}

function activeChips(params: PodcastCatalogParams): ActiveChip[] {
  const chips: ActiveChip[] = []
  if (params.category !== 'all') {
    chips.push({ key: 'category', label: `Category: ${categoryLabel(params.category)}`, clear: { category: 'all' } })
  }
  if (params.contact !== 'all') {
    chips.push({ key: 'contact', label: `Email: ${CONTACT_LABELS[params.contact]}`, clear: { contact: 'all' } })
  }
  if (params.activity !== DEFAULT_CATALOG_PARAMS.activity) {
    chips.push({ key: 'activity', label: `Activity: ${ACTIVITY_LABELS[params.activity]}`, clear: { activity: DEFAULT_CATALOG_PARAMS.activity } })
  }
  if (params.audience !== 'all') {
    chips.push({ key: 'audience', label: `Audience: ${AUDIENCE_LABELS[params.audience]}`, clear: { audience: 'all' } })
  }
  return chips
}

const FilterControls = ({
  params,
  update,
  categories,
}: {
  params: PodcastCatalogParams
  update: ParamsUpdate
  categories: string[]
}) => (
  <>
    <Select value={params.category} onValueChange={(category) => update({ category })}>
      <SelectTrigger aria-label={filterName('Category', categoryLabel(params.category), params.category === 'all')}>
        <SelectValue>{categoryLabel(params.category)}</SelectValue>
      </SelectTrigger>
      <SelectContent className="max-h-80">
        <SelectItem value="all">Any category</SelectItem>
        {categories.map((option) => <SelectItem key={option} value={option}>{categoryLabel(option)}</SelectItem>)}
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
        {(Object.keys(AUDIENCE_LABELS) as Array<PodcastCatalogParams['audience']>).map((value) => (
          <SelectItem key={value} value={value}>{AUDIENCE_LABELS[value]}</SelectItem>
        ))}
      </SelectContent>
    </Select>
  </>
)

/*
 * Search and filters. The search box explains itself, so there is no
 * paragraph about how matching works. On a phone the four filters fold into
 * a sheet behind one button, and the chips below show what is narrowing the
 * list wherever the controls are.
 */
export const PodcastCatalogSearchPanel = ({
  params,
  update,
  categories,
  searching,
}: {
  params: PodcastCatalogParams
  update: ParamsUpdate
  categories: string[]
  searching: boolean
}) => {
  const [input, setInput] = useState(params.search)

  // The address can change under the box (Clear all, the back button).
  useEffect(() => {
    setInput((current) => (current.trim() === params.search ? current : params.search))
  }, [params.search])

  useEffect(() => {
    const trimmed = input.trim()
    if (trimmed === params.search) return undefined
    const timer = window.setTimeout(() => update({ search: trimmed }, { replace: true }), 300)
    return () => window.clearTimeout(timer)
  }, [input, params.search, update])

  const chips = activeChips(params)

  return (
    <Card>
      <CardContent className="space-y-3 p-4">
        <h2 className="sr-only">Find podcasts</h2>
        <div className="flex gap-2">
          <div className="relative min-w-0 flex-1">
            <Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" aria-hidden="true" />
            <Input
              aria-label="Search podcasts"
              maxLength={120}
              value={input}
              onChange={(event) => setInput(event.target.value)}
              placeholder='Search shows, hosts, or topics. Try "founders" or "true crime"'
              className="pl-9 pr-9"
            />
            {searching && input.trim() && (
              <Loader2 className="absolute right-3 top-3 h-4 w-4 animate-spin text-muted-foreground" aria-label="Searching" />
            )}
          </div>
          {/* Under 768px the filters fold into a sheet; CSS picks which shows,
              so the sheet's copy only exists while it is open. */}
          <Sheet>
            <SheetTrigger asChild>
              <Button type="button" variant="outline" className="shrink-0 md:hidden">
                <SlidersHorizontal className="mr-2 h-4 w-4" aria-hidden="true" />Filters
                {chips.length > 0 && <Badge variant="secondary" className="ml-2 px-1.5">{chips.length}</Badge>}
              </Button>
            </SheetTrigger>
            <SheetContent side="bottom" className="space-y-4">
              <SheetHeader>
                <SheetTitle>Filters</SheetTitle>
                <SheetDescription className="sr-only">Narrow the shows in the list.</SheetDescription>
              </SheetHeader>
              <div className="grid gap-3">
                <FilterControls params={params} update={update} categories={categories} />
              </div>
            </SheetContent>
          </Sheet>
        </div>
        <div className="hidden gap-3 md:grid md:grid-cols-2 lg:grid-cols-4">
          <FilterControls params={params} update={update} categories={categories} />
        </div>
        {chips.length > 0 && (
          <div className="flex flex-wrap items-center gap-1.5">
            {chips.map((chip) => (
              <Badge key={chip.key} variant="secondary" className="gap-1 py-0.5 pl-2 pr-1 font-normal">
                {chip.label}
                <button
                  type="button"
                  onClick={() => update(chip.clear)}
                  className="rounded-sm p-0.5 hover:bg-background/80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  aria-label={`Remove ${chip.label}`}
                >
                  <X className="h-3 w-3" aria-hidden="true" />
                </button>
              </Badge>
            ))}
            <Button type="button" variant="link" size="sm" className="h-auto px-1 py-0" onClick={() => update(CLEAR_ALL_FILTERS)}>
              Clear all
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  )
}
