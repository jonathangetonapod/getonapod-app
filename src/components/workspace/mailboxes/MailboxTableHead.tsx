import { ArrowDown, ArrowUp, ChevronsUpDown } from 'lucide-react'
import { Checkbox } from '@/components/ui/checkbox'
import { TableHead, TableHeader, TableRow } from '@/components/ui/table'
import type { MailboxSort, MailboxSortKey } from '@/lib/mailboxView'

interface SortButtonProps {
  label: string
  sortKey: MailboxSortKey
  sort: MailboxSort
  onSort: (key: MailboxSortKey) => void
}

const SortButton = ({ label, sortKey, sort, onSort }: SortButtonProps) => {
  const active = sort.key === sortKey
  const Icon = !active ? ChevronsUpDown : sort.direction === 'asc' ? ArrowUp : ArrowDown
  return (
    <button
      type="button"
      onClick={() => onSort(sortKey)}
      className={`-mx-1 inline-flex items-center gap-1 rounded px-1 py-0.5 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${active ? 'text-foreground' : ''}`}
    >
      {label}
      <Icon className={`h-3.5 w-3.5 ${active ? '' : 'opacity-40'}`} aria-hidden="true" />
    </button>
  )
}

function ariaSort(sort: MailboxSort, keys: MailboxSortKey[]): 'ascending' | 'descending' | undefined {
  if (!keys.includes(sort.key)) return undefined
  return sort.direction === 'asc' ? 'ascending' : 'descending'
}

interface MailboxTableHeadProps {
  sort: MailboxSort
  onSort: (key: MailboxSortKey) => void
  allSelected: boolean
  someSelected: boolean
  onSelectAll: (selected: boolean) => void
  selectDisabled: boolean
}

/**
 * Sticky under the app's 5rem top bar. The table sits outside any overflow
 * container so the window's own scroll drives it.
 */
export const MailboxTableHead = ({ sort, onSort, allSelected, someSelected, onSelectAll, selectDisabled }: MailboxTableHeadProps) => (
  <TableHeader className="sticky top-20 z-20 bg-card shadow-[inset_0_-1px_0_hsl(var(--border))] [&_tr]:border-b-0">
    <TableRow className="bg-muted/40 hover:bg-muted/40">
      <TableHead className="w-10 pl-4 pr-0">
        <Checkbox
          checked={allSelected ? true : someSelected ? 'indeterminate' : false}
          onCheckedChange={(checked) => onSelectAll(checked === true)}
          disabled={selectDisabled}
          aria-label="Select all shown mailboxes"
        />
      </TableHead>
      <TableHead aria-sort={ariaSort(sort, ['email'])}>
        <SortButton label="Email" sortKey="email" sort={sort} onSort={onSort} />
      </TableHead>
      <TableHead className="hidden w-32 xl:table-cell" aria-sort={ariaSort(sort, ['sent'])}>
        <SortButton label="Sent today" sortKey="sent" sort={sort} onSort={onSort} />
      </TableHead>
      <TableHead className="hidden w-40 xl:table-cell">Warmup</TableHead>
      <TableHead className="w-36" aria-sort={ariaSort(sort, ['status', 'health'])}>
        <span className="flex flex-wrap items-center gap-x-2">
          <SortButton label="Status" sortKey="status" sort={sort} onSort={onSort} />
          <SortButton label="Health" sortKey="health" sort={sort} onSort={onSort} />
        </span>
      </TableHead>
      <TableHead className="w-44" aria-sort={ariaSort(sort, ['client'])}>
        <SortButton label="Client" sortKey="client" sort={sort} onSort={onSort} />
      </TableHead>
      <TableHead className="w-10 pl-0 pr-4"><span className="sr-only">Actions</span></TableHead>
    </TableRow>
  </TableHeader>
)
