import { useEffect, useState } from 'react'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { CATALOG_PAGE_SIZES } from '@/hooks/usePodcastCatalogParams'

/*
 * Above and below the list, so paging never needs a scroll to the far end
 * first. The page number is typed, not only stepped: page 212 of 399 is a
 * jump, not two hundred clicks.
 */
export const PodcastCatalogPagination = ({
  page,
  totalPages,
  pageSize,
  disabled,
  onPage,
  onPageSize,
  position,
}: {
  page: number
  totalPages: number
  pageSize: number
  disabled: boolean
  onPage: (page: number) => void
  onPageSize: (size: number) => void
  position: 'top' | 'bottom'
}) => {
  const [draft, setDraft] = useState(String(page))
  useEffect(() => setDraft(String(page)), [page])

  const commit = () => {
    const next = Number.parseInt(draft, 10)
    if (Number.isSafeInteger(next) && next >= 1 && next <= totalPages && next !== page) onPage(next)
    else setDraft(String(page))
  }

  return (
    <nav aria-label={position === 'top' ? 'Pages, top' : 'Pages, bottom'} className="flex flex-wrap items-center justify-between gap-2">
      {/* On a phone the size picker sits below the list only, so the top stays one line. */}
      <div className={`items-center gap-2 text-sm text-muted-foreground ${position === 'top' ? 'hidden sm:flex' : 'flex'}`}>
        <span>Show</span>
        <Select value={String(pageSize)} onValueChange={(value) => onPageSize(Number(value))}>
          <SelectTrigger className="h-8 w-[4.5rem]" aria-label={`Shows per page: ${pageSize}`}><SelectValue /></SelectTrigger>
          <SelectContent>
            {CATALOG_PAGE_SIZES.map((size) => <SelectItem key={size} value={String(size)}>{size}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>
      <div className="flex items-center gap-1.5">
        <Button variant="outline" size="sm" disabled={disabled || page <= 1} onClick={() => onPage(page - 1)}>
          <ChevronLeft className="h-4 w-4 sm:mr-1" aria-hidden="true" /><span className="hidden sm:inline">Previous</span>
          <span className="sr-only sm:hidden">Previous</span>
        </Button>
        <label className="flex items-center gap-1.5 text-sm text-muted-foreground">
          Page
          <Input
            aria-label={`Page, of ${totalPages.toLocaleString()}`}
            inputMode="numeric"
            value={draft}
            onChange={(event) => setDraft(event.target.value.replace(/\D/gu, '').slice(0, 5))}
            onBlur={commit}
            onKeyDown={(event) => { if (event.key === 'Enter') commit() }}
            className="h-8 w-14 px-2 text-center"
            disabled={disabled}
          />
          <span className="whitespace-nowrap">of {totalPages.toLocaleString()}</span>
        </label>
        <Button variant="outline" size="sm" disabled={disabled || page >= totalPages} onClick={() => onPage(page + 1)}>
          <span className="hidden sm:inline">Next</span>
          <span className="sr-only sm:hidden">Next</span>
          <ChevronRight className="h-4 w-4 sm:ml-1" aria-hidden="true" />
        </Button>
      </div>
    </nav>
  )
}
