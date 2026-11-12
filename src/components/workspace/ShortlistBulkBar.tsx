import { useState } from 'react'
import { Archive, Loader2, ThumbsDown, ThumbsUp, Trash2, X } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { chunk } from '@/lib/shortlistFit'
import { ShortlistDeleteDialog } from '@/components/workspace/ShortlistDeleteDialog'
import {
  BULK_FEEDBACK_BATCH_SIZE,
  archiveClientShortlistPodcasts,
  setClientShortlistFeedbackBulk,
  type ClientShortlistFeedbackStatus,
} from '@/services/clientShortlist'

interface ShortlistBulkBarProps {
  workspaceId: string
  clientId: string
  selectedIds: string[]
  onClear: () => void
  onSaved: () => Promise<void> | void
}

/** Approve, pass, archive or delete every selected show in one go. */
export const ShortlistBulkBar = ({ workspaceId, clientId, selectedIds, onClear, onSaved }: ShortlistBulkBarProps) => {
  const [saving, setSaving] = useState<ClientShortlistFeedbackStatus | 'archive' | 'none'>('none')
  const [deleteOpen, setDeleteOpen] = useState(false)
  if (selectedIds.length === 0) return null
  const count = selectedIds.length
  const shows = `${count} show${count === 1 ? '' : 's'}`

  const save = async (status: 'approved' | 'rejected') => {
    setSaving(status)
    let done = 0
    try {
      for (const batch of chunk(selectedIds, BULK_FEEDBACK_BATCH_SIZE)) {
        done += (await setClientShortlistFeedbackBulk(workspaceId, clientId, batch, status)).updated
      }
      toast.success(`${shows} marked ${status === 'approved' ? 'approved' : 'passed'}.`)
      onClear()
    } catch (error) {
      const message = error instanceof Error ? error.message : 'The podcasts could not be updated.'
      toast.error(done > 0 ? `${message} ${done} of ${count} were saved before it stopped.` : message)
    } finally {
      await onSaved()
      setSaving('none')
    }
  }

  const archive = async () => {
    setSaving('archive')
    let done = 0
    try {
      for (const batch of chunk(selectedIds, BULK_FEEDBACK_BATCH_SIZE)) {
        done += (await archiveClientShortlistPodcasts(workspaceId, clientId, batch)).archived
      }
      toast.success(`${done} show${done === 1 ? '' : 's'} archived. They stay in history and weekly dedupe.`)
      onClear()
    } catch (error) {
      const message = error instanceof Error ? error.message : 'The podcasts could not be archived.'
      toast.error(done > 0 ? `${message} ${done} of ${count} were archived before it stopped.` : message)
    } finally {
      await onSaved()
      setSaving('none')
    }
  }

  return (
    <div role="region" aria-label="Bulk actions" className="flex flex-col gap-2 rounded-xl border border-primary/30 bg-primary/5 p-3 sm:flex-row sm:items-center sm:justify-between">
      <p className="text-sm font-medium">{shows} selected</p>
      <div className="flex flex-wrap gap-2">
        <Button size="sm" variant="outline" disabled={saving !== 'none'} onClick={() => void save('approved')}>
          {saving === 'approved' ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <ThumbsUp className="mr-2 h-4 w-4 text-emerald-600" />}Mark approved
        </Button>
        <Button size="sm" variant="outline" disabled={saving !== 'none'} onClick={() => void save('rejected')}>
          {saving === 'rejected' ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <ThumbsDown className="mr-2 h-4 w-4 text-rose-600" />}Mark passed
        </Button>
        <Button size="sm" variant="outline" disabled={saving !== 'none'} onClick={() => void archive()}>
          {saving === 'archive' ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Archive className="mr-2 h-4 w-4" />}Archive
        </Button>
        <Button size="sm" variant="outline" className="border-destructive/40 text-destructive hover:bg-destructive/10 hover:text-destructive" disabled={saving !== 'none'} onClick={() => setDeleteOpen(true)}>
          <Trash2 className="mr-2 h-4 w-4" />Delete
        </Button>
        <Button size="sm" variant="ghost" disabled={saving !== 'none'} onClick={onClear}><X className="mr-2 h-4 w-4" />Clear</Button>
      </div>
      <ShortlistDeleteDialog
        open={deleteOpen}
        onOpenChange={setDeleteOpen}
        workspaceId={workspaceId}
        clientId={clientId}
        podcastIds={selectedIds}
        onDeleted={async () => { onClear(); await onSaved() }}
      />
    </div>
  )
}
