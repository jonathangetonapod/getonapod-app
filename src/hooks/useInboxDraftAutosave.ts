import { useEffect, useMemo } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import {
  setWorkspaceInboxThreadStatus,
  type WorkspaceInboxThread,
} from '@/services/workspaceCampaigns'

/**
 * Persist the operator's edits as they type, debounced.
 *
 * The AI draft is stored server-side and restored on open, but edits lived
 * only in this component — so leaving and returning restored the original
 * draft over the human's version, which looks like the work survived when it
 * did not. Keyed to the thread and client captured at edit time, never at
 * flush time, so a queued save can only ever land on the thread it was
 * written in.
 */
export const useInboxDraftAutosave = (workspaceId: string, canManage: boolean) => {
  const queryClient = useQueryClient()
  const persistDraftEdit = useMemo(() => {
    let timer: number | null = null
    let pending: (() => void) | null = null
    let pendingThreadKey: string | null = null
    const schedule = (thread: WorkspaceInboxThread, body: string) => {
      const clientId = thread.campaign?.client?.id
      if (!thread.thread_key || !clientId) return
      // Members can type, but their save would 403 — and the cache patch ran
      // before the server call, so their edits looked persisted in-session and
      // reverted on the next refetch: the exact "work survived when it did
      // not" this feature exists to end. No save, no cache lie.
      if (!canManage) return
      const threadKey = thread.thread_key
      if (timer !== null) {
        window.clearTimeout(timer)
        // A pending save for a DIFFERENT thread is work about to be lost, not
        // a keystroke to coalesce — flush it now. Cancelling it outright was
        // how switching threads inside the debounce window silently dropped
        // the previous thread's edit.
        if (pending && pendingThreadKey !== threadKey) pending()
      }
      const flush = () => {
        // The cached list is what a re-opened thread restores from, so it has
        // to carry the edit too — the server copy alone only helps after a
        // refetch, and switching threads and back is faster than one.
        queryClient.setQueryData(
          ['workspace-inbox', workspaceId],
          (current: { threads: WorkspaceInboxThread[] } | undefined) => (current
            ? {
              ...current,
              threads: current.threads.map((item) => (
                item.thread_key === threadKey
                  ? {
                    ...item,
                    /*
                     * Synthesized when the row has no state yet, because that
                     * is exactly when losing the edit hurts most: a reply on
                     * its first page load after arriving has state: null, and
                     * skipping the patch meant switching threads and back
                     * emptied the textarea. The server-side save below already
                     * upserts the row either way — this makes the cache agree
                     * with it. The defaults match a freshly created row.
                     */
                    state: {
                      status: 'needs_reply' as const,
                      classification: null,
                      nudges_sent: 0,
                      nudges_paused: false,
                      last_nudge_at: null,
                      draft_stale: false,
                      ...item.state,
                      draft: item.state?.draft
                        ? { ...item.state.draft, body }
                        : { subject: '', body, nudges: [], based_on_email_id: null, generated_at: null },
                    },
                  }
                  : item
              )),
            }
            : current),
        )
        // Fire-and-forget on purpose: a failed background save must not
        // interrupt typing, and the worst case is the pre-edit draft — exactly
        // what the operator had before this feature existed.
        void Promise.resolve(setWorkspaceInboxThreadStatus(workspaceId, {
          thread_key: threadKey,
          client_id: clientId,
          draft_body: body,
        })).catch(() => {})
        if (pending === flush) { pending = null; pendingThreadKey = null; timer = null }
      }
      pending = flush
      pendingThreadKey = threadKey
      timer = window.setTimeout(flush, 900)
    }
    return Object.assign(schedule, {
      // Commit whatever is queued right now. Re-opening a conversation inside
      // the debounce window restored the cached (pre-edit) draft over the
      // textarea, and the next keystroke saved that reverted text.
      flush: () => {
        if (timer !== null) {
          window.clearTimeout(timer)
          timer = null
        }
        if (pending) pending()
      },
    })
  }, [workspaceId, queryClient, canManage])

  // Leaving the page inside the debounce window dropped the last edit.
  useEffect(() => () => persistDraftEdit.flush(), [persistDraftEdit])

  return persistDraftEdit
}
