import { useEffect } from 'react'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import type { PitchQueue } from '@/lib/pitchQueue'

interface PitchQueueNavProps {
  queue: PitchQueue
  /** Called with a shortlist row id; the page decides whether to ask first. */
  onNavigate: (shortlistPodcastId: string) => void
}

/**
 * Where a bare J or K must not move the queue: anything that takes typing, a
 * Radix Select trigger (its typeahead uses letter keys), and any open dialog,
 * so a keystroke never changes the podcast an open confirmation acts on.
 */
function isShortcutBlocked(target: EventTarget | null): boolean {
  if (typeof document !== 'undefined' && document.querySelector('[role="dialog"], [role="alertdialog"]')) return true
  if (!(target instanceof HTMLElement)) return false
  if (target.isContentEditable) return true
  return ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName)
    || Boolean(target.closest('[role="combobox"], [role="listbox"], [role="menu"]'))
}

/**
 * Previous / Next through the client's shortlist from the pitch page, so an
 * operator can write pitch after pitch without returning to the shortlist.
 * J and K move too, except while typing or with a dialog open.
 */
export const PitchQueueNav = ({ queue, onNavigate }: PitchQueueNavProps) => {
  const { items, index, previous, next } = queue

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.defaultPrevented || event.repeat || event.metaKey || event.ctrlKey || event.altKey || event.shiftKey) return
      if (isShortcutBlocked(event.target)) return
      const destination = event.key === 'j' ? next : event.key === 'k' ? previous : null
      if (!destination) return
      event.preventDefault()
      onNavigate(destination.id)
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [onNavigate, next, previous])

  if (items.length < 2 || index < 0) return null

  return (
    <nav aria-label="Pitch queue" className="flex flex-wrap items-center gap-2 rounded-xl border bg-background px-3 py-2">
      <Button variant="outline" size="sm" disabled={!previous} aria-keyshortcuts="K" onClick={() => previous && onNavigate(previous.id)} title={previous ? `Previous: ${previous.podcast_name}` : undefined}>
        <ChevronLeft className="mr-1 h-4 w-4" />Previous<kbd className="ml-2 hidden rounded border px-1 text-[10px] text-muted-foreground sm:inline">K</kbd>
      </Button>
      <span className="text-sm text-muted-foreground" aria-live="polite">Pitch {index + 1} of {items.length}</span>
      <Select value={items[index].id} onValueChange={onNavigate}>
        <SelectTrigger aria-label="Jump to podcast" className="h-9 min-w-0 flex-1 sm:max-w-xs"><SelectValue /></SelectTrigger>
        <SelectContent>
          {items.map((item, position) => <SelectItem key={item.id} value={item.id}>{position + 1}. {item.podcast_name}</SelectItem>)}
        </SelectContent>
      </Select>
      <Button size="sm" className="ml-auto" disabled={!next} aria-keyshortcuts="J" onClick={() => next && onNavigate(next.id)} title={next ? `Next: ${next.podcast_name}` : undefined}>
        Next pitch<ChevronRight className="ml-1 h-4 w-4" /><kbd className="ml-2 hidden rounded border border-primary-foreground/40 px-1 text-[10px] sm:inline">J</kbd>
      </Button>
    </nav>
  )
}
