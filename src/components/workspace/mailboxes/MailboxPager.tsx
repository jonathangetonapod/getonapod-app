import { ChevronLeft, ChevronRight } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'

const MAILBOX_PAGE_SIZES = [50, 100, 200] as const

interface MailboxPagerProps {
  total: number
  page: number
  pageCount: number
  pageSize: number
  onPageChange: (page: number) => void
  /** Omitted inside a group, where the page size is the list's. */
  onPageSizeChange?: (pageSize: number) => void
  label?: string
}

export const MailboxPager = ({ total, page, pageCount, pageSize, onPageChange, onPageSizeChange, label = 'mailboxes' }: MailboxPagerProps) => {
  const first = total === 0 ? 0 : (page - 1) * pageSize + 1
  const last = Math.min(page * pageSize, total)
  return (
    <nav aria-label={`Pages of ${label}`} className="flex flex-wrap items-center justify-between gap-3 px-5 py-2.5 text-xs text-muted-foreground">
      <span className="tabular-nums">{first.toLocaleString()}-{last.toLocaleString()} of {total.toLocaleString()} {label}</span>
      <div className="flex items-center gap-2">
        {onPageSizeChange && (
          <Select value={String(pageSize)} onValueChange={(value) => onPageSizeChange(Number(value))}>
            <SelectTrigger aria-label="Rows per page" className="h-7 w-[7.5rem] bg-background text-xs"><SelectValue /></SelectTrigger>
            <SelectContent>
              {MAILBOX_PAGE_SIZES.map((size) => <SelectItem key={size} value={String(size)}>{size} per page</SelectItem>)}
            </SelectContent>
          </Select>
        )}
        <span className="tabular-nums">Page {page} of {pageCount}</span>
        <Button type="button" variant="outline" size="icon" className="h-7 w-7" aria-label="Previous page" disabled={page <= 1} onClick={() => onPageChange(page - 1)}>
          <ChevronLeft className="h-3.5 w-3.5" />
        </Button>
        <Button type="button" variant="outline" size="icon" className="h-7 w-7" aria-label="Next page" disabled={page >= pageCount} onClick={() => onPageChange(page + 1)}>
          <ChevronRight className="h-3.5 w-3.5" />
        </Button>
      </div>
    </nav>
  )
}
