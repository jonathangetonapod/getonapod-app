import { Check, Plus } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { cn } from '@/lib/utils'

/*
 * The one obvious thing to do with a show. What it is depends on the header's
 * working client and on whether that client already has the show, so the page
 * decides and every surface (row, card, details) renders the same answer.
 */
export type PodcastPrimaryActionState =
  | { kind: 'add'; label: string; onAdd: () => void }
  | { kind: 'added' }
  | { kind: 'on-shortlist'; clientName: string }
  | { kind: 'details'; onOpen: () => void }

export const PodcastPrimaryAction = ({
  action,
  podcastName,
  className,
}: {
  action: PodcastPrimaryActionState
  podcastName: string
  className?: string
}) => {
  const base = cn('shrink-0 whitespace-nowrap', className)
  if (action.kind === 'details') {
    return (
      <Button type="button" variant="outline" size="sm" className={base} onClick={action.onOpen}>
        See details
      </Button>
    )
  }
  if (action.kind === 'added') {
    return (
      <Button type="button" variant="secondary" size="sm" className={base} disabled>
        <Check className="mr-1.5 h-3.5 w-3.5" aria-hidden="true" />Added
      </Button>
    )
  }
  if (action.kind === 'on-shortlist') {
    // A disabled button swallows pointer events, so the tooltip hangs off a wrapper.
    return (
      <Tooltip>
        <TooltipTrigger asChild>
          <span tabIndex={0} className="inline-flex shrink-0 rounded-md">
            <Button type="button" variant="secondary" size="sm" className={base} disabled>
              <Check className="mr-1.5 h-3.5 w-3.5" aria-hidden="true" />On shortlist
            </Button>
          </span>
        </TooltipTrigger>
        <TooltipContent>Already on {action.clientName}’s shortlist.</TooltipContent>
      </Tooltip>
    )
  }
  return (
    <Button
      type="button"
      variant="outline"
      size="sm"
      className={cn('border-primary/40 text-primary hover:bg-primary/5 hover:text-primary', base)}
      onClick={action.onAdd}
      aria-label={`${action.label}: ${podcastName}`}
    >
      <Plus className="mr-1 h-3.5 w-3.5 sm:mr-1.5" aria-hidden="true" />
      {/* A phone keeps the show name readable; the full label is in the accessible name. */}
      <span className="sm:hidden">Add</span>
      <span className="hidden sm:inline">{action.label}</span>
    </Button>
  )
}
