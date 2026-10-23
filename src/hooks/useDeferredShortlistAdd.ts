import { useCallback, useEffect, useRef, useState } from 'react'
import { toast } from 'sonner'
import { toShortlistPodcast } from '@/lib/podcastCatalogShortlist'
import { addClientShortlistPodcasts } from '@/services/clientShortlist'
import type { WorkspacePodcastCatalogItem } from '@/services/workspacePodcastCatalog'

/** How long the Undo on an add stays open, and so how long the add waits. */
export const SHORTLIST_UNDO_MS = 8000

export interface ShortlistTarget {
  id: string
  name: string
}

interface PendingAdd {
  client: ShortlistTarget
  podcasts: WorkspacePodcastCatalogItem[]
  timer: ReturnType<typeof setTimeout>
}

const addedKey = (clientId: string, podcastId: string) => `${clientId}:${podcastId}`

function addedMessage(clientName: string, added: number, alreadyThere: number): string {
  const lead = added === 1 ? `Added to ${clientName}.` : `Added ${added} to ${clientName}.`
  if (alreadyThere === 0) return lead
  return `${lead} ${alreadyThere} ${alreadyThere === 1 ? 'was' : 'were'} already there.`
}

/*
 * Adding a show to a client's shortlist, with an Undo that really undoes it.
 *
 * The add is not sent until the Undo window closes. Once it is sent the server
 * merges the show into the catalogue, captures its episodes and may tell the
 * client their shortlist has news, and none of that can be taken back; there
 * is no remove action to call. Holding the add for eight seconds makes Undo
 * exact. It is sent at once if the tab is hidden or the page is left, so an
 * add is never silently dropped by walking away from it.
 */
export function useDeferredShortlistAdd({
  workspaceId,
  onCommitted,
}: {
  workspaceId: string
  onCommitted: (clientId: string) => void
}) {
  const pending = useRef(new Map<number, PendingAdd>())
  const nextId = useRef(0)
  const onCommittedRef = useRef(onCommitted)
  onCommittedRef.current = onCommitted
  // Shows added in this visit, per client, so their buttons read Added at once.
  const [addedKeys, setAddedKeys] = useState<Set<string>>(() => new Set())

  const mark = useCallback((clientId: string, podcasts: WorkspacePodcastCatalogItem[], added: boolean) => {
    setAddedKeys((current) => {
      const next = new Set(current)
      podcasts.forEach((podcast) => {
        const key = addedKey(clientId, podcast.podcast_id)
        if (added) next.add(key)
        else next.delete(key)
      })
      return next
    })
  }, [])

  const commit = useCallback(async (id: number) => {
    const entry = pending.current.get(id)
    if (!entry) return
    pending.current.delete(id)
    clearTimeout(entry.timer)
    try {
      const result = await addClientShortlistPodcasts(workspaceId, entry.client.id, entry.podcasts.map(toShortlistPodcast))
      // The page only knows the working client's shortlist; the server knows
      // them all, and says so when it skipped something the page offered.
      if (result.skipped > 0) {
        toast.info(`${result.skipped} ${result.skipped === 1 ? 'was' : 'were'} already on ${entry.client.name}’s shortlist.`)
      }
      onCommittedRef.current(entry.client.id)
    } catch (error) {
      mark(entry.client.id, entry.podcasts, false)
      console.error('[Podcast Database] Shortlist add failed', error)
      toast.error(error instanceof Error ? error.message : `The shows could not be added to ${entry.client.name}.`)
    }
  }, [mark, workspaceId])

  const undo = useCallback((id: number) => {
    const entry = pending.current.get(id)
    if (!entry) return
    pending.current.delete(id)
    clearTimeout(entry.timer)
    mark(entry.client.id, entry.podcasts, false)
    toast.info(entry.podcasts.length === 1 ? 'Removed. Nothing was added.' : `Removed. None of the ${entry.podcasts.length} were added.`)
  }, [mark])

  const flushAll = useCallback(() => {
    Array.from(pending.current.keys()).forEach((id) => { void commit(id) })
  }, [commit])

  useEffect(() => {
    const onHidden = () => { if (document.visibilityState === 'hidden') flushAll() }
    document.addEventListener('visibilitychange', onHidden)
    window.addEventListener('pagehide', flushAll)
    return () => {
      document.removeEventListener('visibilitychange', onHidden)
      window.removeEventListener('pagehide', flushAll)
      flushAll()
    }
  }, [flushAll])

  const isAdded = useCallback(
    (clientId: string, podcastId: string) => addedKeys.has(addedKey(clientId, podcastId)),
    [addedKeys],
  )

  // With no working client the button cannot name one, but it still should
  // not offer the same add twice.
  const isAddedAnywhere = useCallback(
    (podcastId: string) => Array.from(addedKeys).some((key) => key.endsWith(`:${podcastId}`)),
    [addedKeys],
  )

  /**
   * Queue the shows for the client. `alreadyThere` are the ones the caller
   * knows the client has; they are left out and counted in the message.
   */
  const add = useCallback((
    client: ShortlistTarget,
    podcasts: WorkspacePodcastCatalogItem[],
    alreadyThere: WorkspacePodcastCatalogItem[] = [],
  ) => {
    const skip = new Set(alreadyThere.map((podcast) => podcast.podcast_id))
    const fresh = podcasts.filter((podcast) => !skip.has(podcast.podcast_id) && !isAdded(client.id, podcast.podcast_id))
    const skipped = podcasts.length - fresh.length
    if (fresh.length === 0) {
      toast.info(podcasts.length === 1
        ? `Already on ${client.name}’s shortlist.`
        : `All ${podcasts.length} are already on ${client.name}’s shortlist.`)
      return
    }
    const id = nextId.current
    nextId.current += 1
    mark(client.id, fresh, true)
    pending.current.set(id, {
      client,
      podcasts: fresh,
      timer: setTimeout(() => { void commit(id) }, SHORTLIST_UNDO_MS),
    })
    toast.success(addedMessage(client.name, fresh.length, skipped), {
      duration: SHORTLIST_UNDO_MS,
      action: { label: 'Undo', onClick: () => undo(id) },
    })
  }, [commit, isAdded, mark, undo])

  return { add, isAdded, isAddedAnywhere }
}
