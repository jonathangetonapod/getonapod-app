import { Fragment, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { MoreHorizontal } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { cn } from '@/lib/utils'

export interface RowMenuAction {
  label: string
  icon?: ReactNode
  /** Opens a route instead of running a handler. */
  to?: string
  onSelect?: () => void
  disabled?: boolean
  /** Red, for the steps that end something. Each one should open a confirm dialog. */
  destructive?: boolean
}

export type RowMenuItem = RowMenuAction | 'divider'

interface RowMenuProps {
  items: RowMenuItem[]
  /** The accessible name of the trigger. */
  label?: string
  disabled?: boolean
}

/**
 * The secondary moves on a table row, behind one icon button so the row keeps
 * a single visible action. Radix supplies the keyboard: Enter, Space and the
 * arrow keys open it, arrows move between items, Escape and an outside click
 * close it, and focus returns to the trigger.
 *
 * Dividers that would sit at either end, or next to another divider, are
 * dropped, so callers can build the list from conditions without tidying it.
 */
export const RowMenu = ({ items, label = 'More actions', disabled }: RowMenuProps) => {
  const visible = items.filter((item, index, all) => {
    if (item !== 'divider') return true
    const before = all.slice(0, index).some((other) => other !== 'divider')
    const after = all.slice(index + 1).some((other) => other !== 'divider')
    return before && after && all[index - 1] !== 'divider'
  })
  if (!visible.length) return null

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button type="button" variant="ghost" size="icon" className="h-8 w-8 shrink-0" aria-label={label} disabled={disabled}>
          <MoreHorizontal className="h-4 w-4" aria-hidden="true" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="min-w-48">
        {visible.map((item, index) => {
          if (item === 'divider') return <DropdownMenuSeparator key={`divider-${index}`} />
          const className = cn(item.destructive && 'text-destructive focus:bg-destructive/10 focus:text-destructive')
          const content = <>{item.icon}{item.label}</>
          return (
            <Fragment key={item.label}>
              {item.to && !item.disabled ? (
                <DropdownMenuItem asChild className={className}>
                  <Link to={item.to}>{content}</Link>
                </DropdownMenuItem>
              ) : (
                <DropdownMenuItem className={className} disabled={item.disabled} onSelect={item.onSelect}>
                  {content}
                </DropdownMenuItem>
              )}
            </Fragment>
          )
        })}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
