import { Plus } from 'lucide-react'
import { Button } from '@/components/ui/button'

/*
 * Fixed to the bottom of the screen, so picking shows never pushes the list
 * around under the cursor the way an inline bar did. It clears the sidebar on
 * wide screens and sits flush on phones.
 */
export const PodcastSelectionBar = ({
  count,
  clientShortName,
  onClear,
  onAdd,
  onAddElsewhere,
}: {
  count: number
  clientShortName: string | null
  onClear: () => void
  onAdd: () => void
  onAddElsewhere?: () => void
}) => {
  if (count === 0) return null
  return (
    <div
      role="region"
      aria-label="Selected podcasts"
      data-podcast-selection-bar=""
      className="fixed inset-x-0 bottom-0 z-40 border-t bg-background/95 shadow-[0_-4px_16px_rgba(0,0,0,0.06)] backdrop-blur animate-in slide-in-from-bottom-4 fade-in-0 lg:left-64"
    >
      <div className="flex items-center gap-2 px-4 py-3 sm:px-6">
        <p className="mr-auto whitespace-nowrap text-sm font-semibold">{count.toLocaleString()} selected</p>
        <Button type="button" variant="ghost" size="sm" onClick={onClear}>Clear</Button>
        {onAddElsewhere && (
          <Button type="button" variant="outline" size="sm" onClick={onAddElsewhere}>
            <span className="sm:hidden">Other</span><span className="hidden sm:inline">Add elsewhere</span>
          </Button>
        )}
        <Button type="button" size="sm" onClick={onAdd}>
          <Plus className="mr-1.5 h-4 w-4" aria-hidden="true" />
          Add {count.toLocaleString()} to {clientShortName || 'client'}
        </Button>
      </div>
    </div>
  )
}
