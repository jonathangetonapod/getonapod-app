import { Check, ChevronDown } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Command, CommandGroup, CommandItem, CommandList } from '@/components/ui/command'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import {
  B2B_FIT_LABELS,
  FORMAT_LABELS,
  JUNK_LABELS,
  LISTENER_LABELS,
  tagListLabel,
} from '@/components/workspace/catalog/catalogFilterLabels'
import type { ParamsUpdate } from '@/components/workspace/catalog/PodcastCatalogFilterControls'
import type { PodcastCatalogParams } from '@/hooks/usePodcastCatalogParams'
import { cn } from '@/lib/utils'
import { PODCAST_FORMAT_KEYS, PODCAST_LISTENER_KEYS } from '@/lib/podcastTags'

/*
 * Filters on Jev's tags. Every show in the catalogue is tagged once: who it is
 * made for, how its episodes are made, how well a B2B guest fits, and whether
 * the feed is junk. A tag filter only lists shows that have been tagged.
 */

const TagMultiSelect = <T extends string>({
  name,
  anyLabel,
  keys,
  labels,
  selected,
  onChange,
}: {
  name: string
  anyLabel: string
  keys: readonly T[]
  labels: Record<T, string>
  selected: T[]
  onChange: (values: T[]) => void
}) => (
  <Popover>
    <PopoverTrigger asChild>
      <Button
        type="button"
        variant="outline"
        role="combobox"
        aria-label={selected.length ? `${name}: ${selected.map((key) => labels[key]).join(', ')}` : anyLabel}
        className="h-10 w-full justify-between px-3 font-normal"
      >
        <span className="truncate">{selected.length ? tagListLabel(selected, labels) : anyLabel}</span>
        <ChevronDown className="ml-2 h-4 w-4 shrink-0 opacity-50" aria-hidden="true" />
      </Button>
    </PopoverTrigger>
    <PopoverContent align="start" className="w-64 p-0">
      <Command label={name}>
        <CommandList aria-label={name}>
          <CommandGroup>
            {keys.map((key) => {
              const isSelected = selected.includes(key)
              return (
                <CommandItem
                  key={key}
                  value={labels[key]}
                  aria-selected={isSelected}
                  onSelect={() => onChange(isSelected ? selected.filter((current) => current !== key) : [...selected, key])}
                  className="gap-2"
                >
                  <span className={cn('flex h-4 w-4 shrink-0 items-center justify-center rounded-sm border border-primary', isSelected ? 'bg-primary text-primary-foreground' : 'opacity-60')}>
                    {isSelected && <Check className="h-3 w-3" aria-hidden="true" />}
                  </span>
                  {labels[key]}
                </CommandItem>
              )
            })}
          </CommandGroup>
        </CommandList>
      </Command>
      {selected.length > 0 && (
        <div className="border-t p-1">
          <Button type="button" variant="ghost" size="sm" className="w-full" onClick={() => onChange([])}>{anyLabel}</Button>
        </div>
      )}
    </PopoverContent>
  </Popover>
)

export const TagFilterControls = ({ params, update }: { params: PodcastCatalogParams; update: ParamsUpdate }) => (
  <>
    <Select value={params.b2bFit} onValueChange={(b2bFit: PodcastCatalogParams['b2bFit']) => update({ b2bFit })}>
      <SelectTrigger
        aria-label={params.b2bFit === 'all' ? B2B_FIT_LABELS.all : `B2B fit: ${B2B_FIT_LABELS[params.b2bFit]}`}
        title="How well a founder, executive or expert fits as a guest, judged from the show's description"
      >
        <SelectValue>{B2B_FIT_LABELS[params.b2bFit]}</SelectValue>
      </SelectTrigger>
      <SelectContent>
        {(Object.keys(B2B_FIT_LABELS) as Array<PodcastCatalogParams['b2bFit']>).map((value) => (
          <SelectItem key={value} value={value}>{B2B_FIT_LABELS[value]}</SelectItem>
        ))}
      </SelectContent>
    </Select>
    <TagMultiSelect
      name="Listeners"
      anyLabel="Any listeners"
      keys={PODCAST_LISTENER_KEYS}
      labels={LISTENER_LABELS}
      selected={params.listeners}
      onChange={(listeners) => update({ listeners })}
    />
    <TagMultiSelect
      name="Format"
      anyLabel="Any format"
      keys={PODCAST_FORMAT_KEYS}
      labels={FORMAT_LABELS}
      selected={params.formats}
      onChange={(formats) => update({ formats })}
    />
    <Select value={params.junk} onValueChange={(junk: PodcastCatalogParams['junk']) => update({ junk })}>
      <SelectTrigger
        aria-label={params.junk === 'hide' ? JUNK_LABELS.hide : `Junk: ${JUNK_LABELS[params.junk]}`}
        title="Spam, piracy listings, content farms and audiobook or radio re-uploads"
      >
        <SelectValue>{JUNK_LABELS[params.junk]}</SelectValue>
      </SelectTrigger>
      <SelectContent>
        {(Object.keys(JUNK_LABELS) as Array<PodcastCatalogParams['junk']>).map((value) => (
          <SelectItem key={value} value={value}>{JUNK_LABELS[value]}</SelectItem>
        ))}
      </SelectContent>
    </Select>
  </>
)
