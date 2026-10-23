import { Archive, Search } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { cn } from '@/lib/utils'
import {
  PROSPECT_FILTERS,
  PROSPECT_SORTS,
  type ProspectListFilter,
  type ProspectSort,
} from '@/lib/prospectStage'
import type { WorkspaceProspect } from '@/services/prospectDashboards'
import { PROSPECT_ROW_COLUMNS, ProspectRow } from './ProspectRow'

interface ProspectListProps {
  /** Already filtered, searched and sorted. */
  prospects: WorkspaceProspect[]
  counts: Record<ProspectListFilter, number>
  filter: ProspectListFilter
  onFilterChange: (filter: ProspectListFilter) => void
  sort: ProspectSort
  onSortChange: (sort: ProspectSort) => void
  search: string
  onSearchChange: (search: string) => void
  hrefFor: (prospectId: string) => string
  /** Beside an open prospect: two-line rows, no selection. */
  compact?: boolean
  selectedId?: string | null
  /** Bulk selection; omitted where the viewer cannot manage prospects. */
  checkedIds?: Set<string>
  onCheckedIdsChange?: (ids: Set<string>) => void
  onArchiveChecked?: () => void
}

export const ProspectList = ({
  prospects,
  counts,
  filter,
  onFilterChange,
  sort,
  onSortChange,
  search,
  onSearchChange,
  hrefFor,
  compact = false,
  selectedId = null,
  checkedIds,
  onCheckedIdsChange,
  onArchiveChecked,
}: ProspectListProps) => {
  const selectable = !compact && checkedIds !== undefined && onCheckedIdsChange !== undefined
  // Select-all means everything in the current view, nothing hidden by it.
  const checkedInView = selectable ? prospects.filter((prospect) => checkedIds.has(prospect.id)).length : 0
  const allChecked = prospects.length > 0 && checkedInView === prospects.length
  const toggleAll = (value: boolean) => onCheckedIdsChange?.(new Set(value ? prospects.map((prospect) => prospect.id) : []))
  const toggleOne = (id: string, value: boolean) => {
    const next = new Set(checkedIds)
    if (value) next.add(id)
    else next.delete(id)
    onCheckedIdsChange?.(next)
  }

  return (
    <div className="rounded-xl border bg-card">
      <div className={cn('flex flex-col gap-2 border-b p-3', !compact && 'md:flex-row md:items-center md:justify-between')}>
        <div className="flex flex-wrap gap-1.5" role="group" aria-label="Filter prospects">
          {PROSPECT_FILTERS.map((option) => (
            <button
              key={option.value}
              type="button"
              aria-pressed={filter === option.value}
              onClick={() => onFilterChange(option.value)}
              className={cn(
                'rounded-full border px-2.5 py-1 text-xs font-medium transition-colors',
                filter === option.value
                  ? 'border-primary bg-primary text-primary-foreground'
                  : 'border-border bg-background text-muted-foreground hover:border-primary/40 hover:text-foreground',
              )}
            >
              {option.label} <span className="ml-1 opacity-75">{counts[option.value]}</span>
            </button>
          ))}
        </div>
        <div className={cn('flex gap-2', compact && 'flex-col')}>
          <div className="relative min-w-0 flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={search}
              onChange={(event) => onSearchChange(event.target.value)}
              placeholder="Search prospects"
              aria-label="Search prospects"
              className={cn('h-9 pl-9', !compact && 'md:w-56')}
            />
          </div>
          <Select value={sort} onValueChange={(value) => onSortChange(value as ProspectSort)}>
            <SelectTrigger className={cn('h-9', !compact && 'w-40')} aria-label="Sort prospects">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {PROSPECT_SORTS.map((option) => <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
      </div>

      {selectable && checkedIds.size > 0 && (
        <div className="flex flex-wrap items-center gap-2 border-b bg-muted/40 px-3 py-2 text-sm">
          <span className="font-medium">{checkedIds.size} selected</span>
          <Button size="sm" variant="outline" className="h-7" onClick={onArchiveChecked}>
            <Archive className="mr-1.5 h-3.5 w-3.5" />Archive
          </Button>
          <Button size="sm" variant="ghost" className="h-7" onClick={() => toggleAll(false)}>Clear selection</Button>
        </div>
      )}

      {prospects.length === 0 ? (
        <p className="px-3 py-10 text-center text-sm text-muted-foreground">
          {search ? `No prospects match “${search}”.` : 'No prospects in this view.'}
        </p>
      ) : compact ? (
        <nav aria-label="Prospects" className="space-y-1 p-2">
          {prospects.map((prospect) => (
            <ProspectRow key={prospect.id} prospect={prospect} href={hrefFor(prospect.id)} compact selected={prospect.id === selectedId} />
          ))}
        </nav>
      ) : (
        <div>
          <div className="hidden items-center gap-3 border-b px-3 py-2 text-xs font-medium text-muted-foreground md:flex">
            {selectable && (
              <Checkbox
                checked={allChecked ? true : checkedInView > 0 ? 'indeterminate' : false}
                onCheckedChange={(value) => toggleAll(value === true)}
                aria-label="Select all prospects in this view"
              />
            )}
            <div className={cn('min-w-0 flex-1', PROSPECT_ROW_COLUMNS)}>
              <span>Prospect</span>
              <span>Stage</span>
              <span>Engagement</span>
              <span>Updated</span>
              <span>Readiness</span>
            </div>
          </div>
          {prospects.map((prospect) => (
            <ProspectRow
              key={prospect.id}
              prospect={prospect}
              href={hrefFor(prospect.id)}
              compact={false}
              selected={prospect.id === selectedId}
              checked={selectable ? checkedIds.has(prospect.id) : undefined}
              onCheckedChange={(value) => toggleOne(prospect.id, value)}
            />
          ))}
        </div>
      )}
    </div>
  )
}
