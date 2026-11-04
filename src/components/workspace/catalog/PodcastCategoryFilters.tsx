import { useState } from 'react'
import { Check, ChevronDown, X } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList, CommandSeparator } from '@/components/ui/command'
import { Input } from '@/components/ui/input'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { categoryLabel, categoryListLabel } from '@/components/workspace/catalog/catalogFilterLabels'
import { MAX_CATEGORY_CHOICES, MAX_EXCLUDE_TERMS, parseExcludeTerms, type PodcastCatalogParams } from '@/hooks/usePodcastCatalogParams'
import { cn } from '@/lib/utils'
import { categoryFilterGroups, type CategoryChoice } from '@/lib/podcastCategories'
import type { ParamsUpdate } from '@/components/workspace/catalog/PodcastCatalogFilterControls'

/*
 * Every category the catalogue holds, searchable, in the same two groups as
 * before (business and professional first). A choice already picked stays in
 * the list even when this page's categories lack it.
 */
const CategoryChecklist = ({
  codes,
  selected,
  onToggle,
  label,
}: {
  codes: string[]
  selected: string[]
  onToggle: (value: string) => void
  label: string
}) => {
  const { professional, other } = categoryFilterGroups(codes)
  const known = new Set([...professional, ...other].map((choice) => choice.value))
  const orphans: CategoryChoice[] = selected.filter((value) => !known.has(value))
    .map((value) => ({ value, label: categoryLabel(value), keys: value.split('|') }))
  const full = selected.length >= MAX_CATEGORY_CHOICES
  const item = (choice: CategoryChoice) => {
    const isSelected = selected.includes(choice.value)
    return (
      <CommandItem
        key={choice.value}
        value={`${choice.label} ${choice.value}`}
        disabled={full && !isSelected}
        onSelect={() => onToggle(choice.value)}
        aria-selected={isSelected}
        className="gap-2"
      >
        <span className={cn('flex h-4 w-4 shrink-0 items-center justify-center rounded-sm border border-primary', isSelected ? 'bg-primary text-primary-foreground' : 'opacity-60')}>
          {isSelected && <Check className="h-3 w-3" aria-hidden="true" />}
        </span>
        <span className="min-w-0 flex-1 truncate">{choice.label}</span>
      </CommandItem>
    )
  }
  return (
    <Command label={label}>
      <CommandInput placeholder="Find a category" />
      <CommandList aria-label={label} className="max-h-72">
        <CommandEmpty>No category matches that search.</CommandEmpty>
        {[...orphans, ...professional].length > 0 && (
          <CommandGroup heading="Business & professional">{[...orphans, ...professional].map(item)}</CommandGroup>
        )}
        {professional.length > 0 && other.length > 0 && <CommandSeparator />}
        {other.length > 0 && <CommandGroup heading="Other topics">{other.map(item)}</CommandGroup>}
      </CommandList>
    </Command>
  )
}

const toggled = (values: string[], value: string) => (
  values.includes(value) ? values.filter((current) => current !== value) : [...values, value]
)

/** Several categories at once: a show in any of them matches. */
export const CategoryFilter = ({ params, update, codes }: { params: PodcastCatalogParams; update: ParamsUpdate; codes: string[] }) => {
  const label = params.categories.length ? categoryListLabel(params.categories) : 'Any category'
  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          role="combobox"
          aria-label={params.categories.length ? `Categories: ${params.categories.map(categoryLabel).join(', ')}` : 'Any category'}
          className="h-10 w-full justify-between px-3 font-normal"
        >
          <span className="truncate">{label}</span>
          <ChevronDown className="ml-2 h-4 w-4 shrink-0 opacity-50" aria-hidden="true" />
        </Button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-72 p-0">
        <CategoryChecklist
          label="Categories"
          codes={codes}
          selected={params.categories}
          // Including a category takes it out of the excluded ones.
          onToggle={(value) => update({
            categories: toggled(params.categories, value),
            excludeCategories: params.excludeCategories.filter((current) => current !== value),
          })}
        />
        {params.categories.length > 0 && (
          <div className="border-t p-1">
            <Button type="button" variant="ghost" size="sm" className="w-full" onClick={() => update({ categories: [] })}>Any category</Button>
          </div>
        )}
      </PopoverContent>
    </Popover>
  )
}

/*
 * Leave shows out: those that mention a word or phrase anywhere in their name,
 * host, publisher or description, and those tagged with a category. Words are
 * added with Enter or a comma, so "crypto, true crime" is two.
 */
export const ExcludeFilter = ({ params, update, codes }: { params: PodcastCatalogParams; update: ParamsUpdate; codes: string[] }) => {
  const [draft, setDraft] = useState('')
  const count = params.excludeTerms.length + params.excludeCategories.length
  const addDraft = () => {
    const terms = parseExcludeTerms([...params.excludeTerms, draft].join(','))
    setDraft('')
    if (terms.join(',') !== params.excludeTerms.join(',')) update({ excludeTerms: terms })
  }
  return (
    <Popover onOpenChange={(open) => { if (!open && draft.trim()) addDraft() }}>
      <PopoverTrigger asChild>
        <Button type="button" variant="outline" className="h-10 w-full justify-between px-3 font-normal" aria-label={count ? `Exclude: ${count} set` : 'Exclude nothing'}>
          <span className="truncate">{count ? `Excluding ${count}` : 'Exclude nothing'}</span>
          <ChevronDown className="ml-2 h-4 w-4 shrink-0 opacity-50" aria-hidden="true" />
        </Button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-80 p-0">
        <div className="space-y-2 p-3">
          <label htmlFor="catalog-exclude-terms" className="text-sm font-medium">Leave out shows that mention</label>
          <Input
            id="catalog-exclude-terms"
            value={draft}
            maxLength={300}
            disabled={params.excludeTerms.length >= MAX_EXCLUDE_TERMS}
            placeholder={params.excludeTerms.length >= MAX_EXCLUDE_TERMS ? `Up to ${MAX_EXCLUDE_TERMS} words` : 'crypto, true crime'}
            onChange={(event) => {
              const value = event.target.value
              if (value.includes(',')) {
                const terms = parseExcludeTerms([...params.excludeTerms, value].join(','))
                setDraft('')
                update({ excludeTerms: terms })
              } else {
                setDraft(value)
              }
            }}
            onKeyDown={(event) => {
              if (event.key === 'Enter') {
                event.preventDefault()
                addDraft()
              }
            }}
          />
          <p className="text-xs text-muted-foreground">Matches the name, host, publisher and description. Press Enter to add.</p>
          {params.excludeTerms.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {params.excludeTerms.map((term) => (
                <Badge key={term} variant="secondary" className="gap-1 py-0.5 pl-2 pr-1 font-normal">
                  {term}
                  <button
                    type="button"
                    onClick={() => update({ excludeTerms: params.excludeTerms.filter((current) => current !== term) })}
                    className="rounded-sm p-0.5 hover:bg-background/80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    aria-label={`Stop excluding ${term}`}
                  >
                    <X className="h-3 w-3" aria-hidden="true" />
                  </button>
                </Badge>
              ))}
            </div>
          )}
        </div>
        <div className="border-t">
          <p className="px-3 pt-2 text-sm font-medium">Leave out categories</p>
          <CategoryChecklist
            label="Excluded categories"
            codes={codes}
            selected={params.excludeCategories}
            // Excluding a category takes it out of the included ones.
            onToggle={(value) => update({
              excludeCategories: toggled(params.excludeCategories, value),
              categories: params.categories.filter((current) => current !== value),
            })}
          />
        </div>
        {count > 0 && (
          <div className="border-t p-1">
            <Button type="button" variant="ghost" size="sm" className="w-full" onClick={() => update({ excludeTerms: [], excludeCategories: [] })}>Exclude nothing</Button>
          </div>
        )}
      </PopoverContent>
    </Popover>
  )
}
