import { MoreHorizontal } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import type { RelationshipStage } from '@/lib/relationshipLabels'

/** Snooze lengths the menu offers, in days. "Snooze until…" picks any date. */
const SNOOZE_OPTIONS = [
  { label: 'Snooze 3 days', days: 3 },
  { label: 'Snooze 1 week', days: 7 },
  { label: 'Snooze 2 weeks', days: 14 },
] as const

interface RelationshipRowMenuProps {
  title: string
  stage: RelationshipStage
  snoozed: boolean
  canManage: boolean
  /**
   * The row's main action. At phone width the row hides its button and the
   * menu carries it instead.
   */
  primaryAction: { label: string; onSelect: () => void } | null
  onSnooze: (days: number | null) => void
  onSnoozeUntil: () => void
  onSetStage: (stage: 'placed' | 'not_a_fit') => void
  onEditDetails: () => void
  onDismiss: () => void
  onMarkDoNotContact: () => void
}

/**
 * Everything a row can do besides its main action. Do not contact stays last,
 * in red, and the page asks before applying it.
 */
export const RelationshipRowMenu = ({
  title,
  stage,
  snoozed,
  canManage,
  primaryAction,
  onSnooze,
  onSnoozeUntil,
  onSetStage,
  onEditDetails,
  onDismiss,
  onMarkDoNotContact,
}: RelationshipRowMenuProps) => {
  // Members who cannot curate keep the main action as a button at every width.
  if (!canManage) return null
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          type="button"
          size="icon"
          variant="ghost"
          className="h-8 w-8"
          aria-label={`More actions for ${title}`}
        >
          <MoreHorizontal className="h-4 w-4" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-52">
        {primaryAction && (
          <>
            <DropdownMenuItem className="sm:hidden" onSelect={primaryAction.onSelect}>{primaryAction.label}</DropdownMenuItem>
            <DropdownMenuSeparator className="sm:hidden" />
          </>
        )}
        {snoozed && <DropdownMenuItem onSelect={() => onSnooze(null)}>Unsnooze</DropdownMenuItem>}
        {SNOOZE_OPTIONS.map((option) => (
          <DropdownMenuItem key={option.days} onSelect={() => onSnooze(option.days)}>{option.label}</DropdownMenuItem>
        ))}
        <DropdownMenuItem onSelect={onSnoozeUntil}>Snooze until…</DropdownMenuItem>
        <DropdownMenuSeparator />
        {stage !== 'placed' && <DropdownMenuItem onSelect={() => onSetStage('placed')}>Mark placed</DropdownMenuItem>}
        {stage !== 'not_a_fit' && <DropdownMenuItem onSelect={() => onSetStage('not_a_fit')}>Not a fit</DropdownMenuItem>}
        <DropdownMenuItem onSelect={onEditDetails}>Edit show details…</DropdownMenuItem>
        <DropdownMenuItem onSelect={onDismiss}>Not a host, remove</DropdownMenuItem>
        {stage !== 'do_not_contact' && (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuItem className="text-destructive focus:text-destructive" onSelect={onMarkDoNotContact}>
              Mark as do not contact…
            </DropdownMenuItem>
          </>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
