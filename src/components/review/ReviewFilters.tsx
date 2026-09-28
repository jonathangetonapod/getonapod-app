import { useState } from 'react'
import { Search, SlidersHorizontal, ThumbsDown, ThumbsUp } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet'
import { cn } from '@/lib/utils'
import { useReviewBrandStyle } from '@/components/review/reviewBrand'
import {
  AUDIENCE_FILTER_OPTIONS,
  EMPTY_REVIEW_FILTERS,
  EPISODE_FILTER_OPTIONS,
  SORT_OPTIONS,
  countActiveFilters,
  hasActiveFilters,
  type AudienceFilter,
  type DecisionFilter,
  type EpisodeFilter,
  type ReviewFilterState,
  type ReviewSort,
} from '@/components/review/reviewFilters'
import type { ReviewCategory, ReviewCounts } from '@/components/review/reviewTypes'

interface ReviewFiltersProps {
  value: ReviewFilterState
  onChange: (next: ReviewFilterState) => void
  categories: ReviewCategory[]
  counts: ReviewCounts
  /** How many shows the current filters leave in the list. */
  resultCount: number
}

const DECISION_OPTIONS: Array<{ value: Exclude<DecisionFilter, 'all'>; label: string; count: keyof ReviewCounts; icon?: typeof ThumbsUp }> = [
  { value: 'not_reviewed', label: 'To review', count: 'toReview' },
  { value: 'approved', label: 'Interested', count: 'interested', icon: ThumbsUp },
  { value: 'rejected', label: 'Not a fit', count: 'notAFit', icon: ThumbsDown },
]

const selectClassName = 'mt-3 h-12 w-full rounded-xl border border-[#d9d0c4] bg-white px-3 text-sm text-[#344455] focus:outline-none focus:ring-2 focus:ring-[var(--campaign-accent)]'

/*
 * Search, the decision segmented control, and a Filters button that opens
 * the sheet with everything else. Pressing the active decision again shows
 * every show; there is no separate "all" button to explain.
 */
export const ReviewFilters = ({ value, onChange, categories, counts, resultCount }: ReviewFiltersProps) => {
  const [sheetOpen, setSheetOpen] = useState(false)
  const brandStyle = useReviewBrandStyle()
  const activeCount = countActiveFilters(value)
  const update = (patch: Partial<ReviewFilterState>) => onChange({ ...value, ...patch })
  const clearFilters = () => onChange(EMPTY_REVIEW_FILTERS)

  return (
    <>
      <div className="mt-5 flex flex-col gap-3 lg:flex-row">
        <label className="relative flex-1">
          <span className="sr-only">Search podcasts</span>
          <Search className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-[#7a858e]" />
          <Input
            value={value.search}
            onChange={(event) => update({ search: event.target.value })}
            placeholder="Search shows, hosts, or topics"
            className="h-12 rounded-xl border-[#d9d0c4] bg-white pl-11 text-base shadow-sm focus-visible:ring-[var(--campaign-accent)]"
          />
        </label>
        <div className="grid grid-cols-3 gap-1 rounded-xl border border-[#d9d0c4] bg-white p-1 shadow-sm" role="group" aria-label="Filter by your decision">
          {DECISION_OPTIONS.map((option) => {
            const active = value.decision === option.value
            return (
              <button
                key={option.value}
                type="button"
                aria-pressed={active}
                onClick={() => update({ decision: active ? 'all' : option.value })}
                className={cn(
                  'flex min-h-10 items-center justify-center gap-1.5 whitespace-nowrap rounded-lg px-2 text-xs font-semibold transition sm:px-3 sm:text-sm',
                  active
                    ? 'bg-[var(--campaign-primary)] text-[var(--campaign-primary-foreground)] shadow-sm'
                    : 'text-[#66727c] hover:bg-[#f5f0e9] hover:text-[#102033]',
                )}
              >
                {option.icon ? <option.icon className="hidden h-3.5 w-3.5 sm:block" /> : null}
                {option.label}
                <span className={cn('rounded-full px-1.5 py-0.5 text-[10px]', active ? 'bg-white/12' : 'bg-[#eee8df]')}>
                  {counts[option.count]}
                </span>
              </button>
            )
          })}
        </div>
        <Button
          type="button"
          variant="outline"
          onClick={() => setSheetOpen(true)}
          className="h-12 gap-2 rounded-xl border-[#d9d0c4] bg-white px-5 text-[#344455] shadow-sm hover:bg-[#fbf8f3]"
        >
          <SlidersHorizontal className="h-4 w-4" />
          Filters
          {activeCount > 0 ? <span className="rounded-full bg-[var(--campaign-primary)] px-2 py-0.5 text-[11px] text-[var(--campaign-primary-foreground)]">{activeCount}</span> : null}
        </Button>
      </div>

      {hasActiveFilters(value) ? (
        <div className="mt-3 flex items-center justify-between gap-3 text-sm text-[#66727c]">
          <p>{resultCount} result{resultCount === 1 ? '' : 's'} in this view</p>
          <button type="button" onClick={clearFilters} className="min-h-10 font-semibold text-[var(--campaign-accent)] hover:brightness-75">
            Clear filters
          </button>
        </div>
      ) : null}

      <Sheet open={sheetOpen} onOpenChange={setSheetOpen}>
        <SheetContent side="right" className="w-full overflow-y-auto border-l-[#ded5ca] bg-[#fbf8f3] sm:max-w-md" style={brandStyle}>
          <SheetHeader className="text-left">
            <SheetTitle className="font-editorial text-3xl text-[#102033]">Refine the list</SheetTitle>
            <p className="text-sm leading-6 text-[#66727c]">Use only what helps. Your top matches remain the recommended place to begin.</p>
          </SheetHeader>

          <div className="mt-7 space-y-7">
            <fieldset>
              <legend className="text-xs font-bold uppercase tracking-[0.16em] text-[#7b685a]">Order</legend>
              <select
                aria-label="Sort podcasts"
                value={value.sort}
                onChange={(event) => update({ sort: event.target.value as ReviewSort })}
                className={selectClassName}
              >
                {SORT_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
              </select>
            </fieldset>

            <fieldset>
              <legend className="text-xs font-bold uppercase tracking-[0.16em] text-[#7b685a]">Audience size</legend>
              <select
                aria-label="Filter by audience size"
                value={value.audience}
                onChange={(event) => update({ audience: event.target.value as AudienceFilter })}
                className={selectClassName}
              >
                {AUDIENCE_FILTER_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
              </select>
            </fieldset>

            <fieldset>
              <legend className="text-xs font-bold uppercase tracking-[0.16em] text-[#7b685a]">Show depth</legend>
              <select
                aria-label="Filter by episode count"
                value={value.episodes}
                onChange={(event) => update({ episodes: event.target.value as EpisodeFilter })}
                className={selectClassName}
              >
                {EPISODE_FILTER_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
              </select>
            </fieldset>

            {categories.length > 0 ? (
              <fieldset>
                <legend className="text-xs font-bold uppercase tracking-[0.16em] text-[#7b685a]">Topics</legend>
                <div className="mt-3 flex max-h-56 flex-wrap content-start gap-2 overflow-y-auto pr-1">
                  {categories.map((category) => {
                    const selected = value.categories.includes(category.category_id)
                    return (
                      <button
                        key={category.category_id}
                        type="button"
                        aria-pressed={selected}
                        onClick={() => update({
                          categories: selected
                            ? value.categories.filter((categoryId) => categoryId !== category.category_id)
                            : [...value.categories, category.category_id],
                        })}
                        className={cn(
                          'min-h-10 rounded-full border px-3 text-xs font-semibold transition',
                          selected
                            ? 'border-[var(--campaign-accent)] bg-white text-[var(--campaign-accent)]'
                            : 'border-[#d9d0c4] bg-white text-[#596772] hover:border-[#bcae9e]',
                        )}
                      >
                        {category.category_name}
                      </button>
                    )
                  })}
                </div>
              </fieldset>
            ) : null}
          </div>

          <div className="sticky bottom-0 mt-8 grid grid-cols-2 gap-2 border-t border-[#ded5ca] bg-[#fbf8f3] py-4">
            <Button type="button" variant="outline" onClick={clearFilters} className="min-h-12 rounded-xl border-[#d9d0c4] bg-white">
              Reset
            </Button>
            <Button type="button" onClick={() => setSheetOpen(false)} className="min-h-12 rounded-xl bg-[var(--campaign-primary)] text-[var(--campaign-primary-foreground)] hover:brightness-95">
              Show {resultCount} results
            </Button>
          </div>
        </SheetContent>
      </Sheet>
    </>
  )
}
