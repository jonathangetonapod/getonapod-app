import type { ClientShortlistPodcast } from '@/services/clientShortlist'

export interface PitchQueue {
  items: ClientShortlistPodcast[]
  index: number
  previous: ClientShortlistPodcast | null
  next: ClientShortlistPodcast | null
}

/**
 * The podcasts an operator works through one after another on the pitch page:
 * the client's live shortlist in its saved order, without the ones the client
 * rejected. The podcast on screen always stays in the queue, even when it would
 * otherwise be left out, so Previous and Next still have a place to start from.
 */
export function buildPitchQueue(podcasts: ClientShortlistPodcast[], currentId: string): PitchQueue {
  const items = [...podcasts]
    .filter((podcast) => podcast.id === currentId || (podcast.visibility === 'visible' && podcast.feedback_status !== 'rejected'))
    .sort((left, right) => (left.display_order ?? 0) - (right.display_order ?? 0))
  const index = items.findIndex((podcast) => podcast.id === currentId)
  return {
    items,
    index,
    previous: index > 0 ? items[index - 1] : null,
    next: index >= 0 && index < items.length - 1 ? items[index + 1] : null,
  }
}
