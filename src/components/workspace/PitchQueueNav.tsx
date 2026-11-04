import { useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import type { PitchQueue } from '@/lib/pitchQueue'

interface PitchQueueNavProps {
  queue: PitchQueue
  hrefFor: (shortlistPodcastId: string) => string
}

function isTypingTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false
  if (target.isContentEditable) return true
  return ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName) || Boolean(target.closest('[role="dialog"], [role="listbox"], [role="menu"]'))
}

/**
 * Previous / Next through the client's shortlist from the pitch page, so an
 * operator can write pitch after pitch without returning to the shortlist.
 * J and K move too, except while typing.
 */
export const PitchQueueNav = ({ queue, hrefFor }: PitchQueueNavProps) => {
  const navigate = useNavigate()
  const { items, index, previous, next } = queue

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.defaultPrevented || event.metaKey || event.ctrlKey || event.altKey || isTypingTarget(event.target)) return
      const key = event.key.toLowerCase()
      const destination = key === 'j' ? next : key === 'k' ? previous : null
      if (!destination) return
      event.preventDefault()
      navigate(hrefFor(destination.id))
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [hrefFor, navigate, next, previous])

  if (items.length < 2 || index < 0) return null

  return (
    <nav aria-label="Pitch queue" className="flex flex-wrap items-center gap-2 rounded-xl border bg-background px-3 py-2">
      <Button variant="outline" size="sm" disabled={!previous} onClick={() => previous && navigate(hrefFor(previous.id))} title={previous ? `Previous: ${previous.podcast_name} (K)` : undefined}>
        <ChevronLeft className="mr-1 h-4 w-4" />Previous
      </Button>
      <span className="text-sm text-muted-foreground" aria-live="polite">Pitch {index + 1} of {items.length}</span>
      <Select value={items[index].id} onValueChange={(id) => navigate(hrefFor(id))}>
        <SelectTrigger aria-label="Jump to podcast" className="h-9 min-w-0 flex-1 sm:max-w-xs"><SelectValue /></SelectTrigger>
        <SelectContent>
          {items.map((item, position) => <SelectItem key={item.id} value={item.id}>{position + 1}. {item.podcast_name}</SelectItem>)}
        </SelectContent>
      </Select>
      <Button size="sm" className="ml-auto" disabled={!next} onClick={() => next && navigate(hrefFor(next.id))} title={next ? `Next: ${next.podcast_name} (J)` : undefined}>
        Next pitch<ChevronRight className="ml-1 h-4 w-4" />
      </Button>
    </nav>
  )
}
