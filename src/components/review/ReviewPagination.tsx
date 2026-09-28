import { ChevronLeft, ChevronRight } from 'lucide-react'
import { Button } from '@/components/ui/button'

interface ReviewPaginationProps {
  page: number
  totalPages: number
  onPageChange: (page: number) => void
}

export const ReviewPagination = ({ page, totalPages, onPageChange }: ReviewPaginationProps) => {
  if (totalPages <= 1) return null

  return (
    <nav className="mt-8 flex items-center justify-between rounded-2xl border border-[#ded5ca] bg-white p-2 shadow-sm" aria-label="Podcast pages">
      <Button
        type="button"
        variant="ghost"
        disabled={page === 1}
        onClick={() => onPageChange(Math.max(1, page - 1))}
        className="min-h-11 gap-2 rounded-xl"
      >
        <ChevronLeft className="h-4 w-4" />
        Previous
      </Button>
      <p className="text-sm font-medium text-[#66727c]">Page <span className="text-[#102033]">{page}</span> of {totalPages}</p>
      <Button
        type="button"
        variant="ghost"
        disabled={page === totalPages}
        onClick={() => onPageChange(Math.min(totalPages, page + 1))}
        className="min-h-11 gap-2 rounded-xl"
      >
        Next
        <ChevronRight className="h-4 w-4" />
      </Button>
    </nav>
  )
}
