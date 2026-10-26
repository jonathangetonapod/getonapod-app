import { useEffect, useState } from 'react'
import { Loader2, Search, SlidersHorizontal, X } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle, SheetTrigger } from '@/components/ui/sheet'
import {
  ACTIVITY_LABELS,
  AUDIENCE_LABELS,
  categoryLabel,
  CONTACT_LABELS,
} from '@/components/workspace/catalog/catalogFilterLabels'
import { FilterControls, type ParamsUpdate } from '@/components/workspace/catalog/PodcastCatalogFilterControls'
import { CLEAR_ALL_FILTERS, DEFAULT_CATALOG_PARAMS, type PodcastCatalogParams } from '@/hooks/usePodcastCatalogParams'
import { languageName, regionName } from '@/lib/podcastCatalogDisplay'

interface ActiveChip {
  key: string
  label: string
  clear: Partial<PodcastCatalogParams>
}

function activeChips(params: PodcastCatalogParams): ActiveChip[] {
  const chips: ActiveChip[] = []
  if (params.search) {
    chips.push({ key: 'search', label: `Search: “${params.search}”`, clear: { search: '' } })
  }
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
  if (params.language !== 'all') {
    chips.push({ key: 'language', label: `Language: ${languageName(params.language)}`, clear: { language: 'all' } })
  }
  if (params.region !== 'all') {
    chips.push({ key: 'region', label: `Region: ${regionName(params.region)}`, clear: { region: 'all' } })
  }
  return chips
}

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
  languages,
  regions,
  searching,
}: {
  params: PodcastCatalogParams
  update: ParamsUpdate
  categories: string[]
  languages: string[]
  regions: string[]
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
  // The search box is not in the sheet, so its chip is not counted on the button.
  const filterCount = chips.filter((chip) => chip.key !== 'search').length

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
                {filterCount > 0 && <Badge variant="secondary" className="ml-2 px-1.5">{filterCount}</Badge>}
              </Button>
            </SheetTrigger>
            <SheetContent side="bottom" className="space-y-4">
              <SheetHeader>
                <SheetTitle>Filters</SheetTitle>
                <SheetDescription className="sr-only">Narrow the shows in the list.</SheetDescription>
              </SheetHeader>
              <div className="grid gap-3">
                <FilterControls params={params} update={update} categories={categories} languages={languages} regions={regions} />
              </div>
            </SheetContent>
          </Sheet>
        </div>
        <div className="hidden gap-3 md:grid md:grid-cols-3 xl:grid-cols-6">
          <FilterControls params={params} update={update} categories={categories} languages={languages} regions={regions} />
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
