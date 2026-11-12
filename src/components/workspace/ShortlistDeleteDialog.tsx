import { useEffect, useState } from 'react'
import { Loader2, Trash2 } from 'lucide-react'
import { toast } from 'sonner'
import {
  AlertDialog, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { chunk } from '@/lib/shortlistFit'
import {
  BULK_FEEDBACK_BATCH_SIZE,
  deleteClientShortlistPodcasts,
  type ShortlistDeleteKept,
} from '@/services/clientShortlist'

const KEPT_REASONS: Record<ShortlistDeleteKept['reason'], string> = {
  in_campaign: 'already in a campaign',
  contacted: 'already contacted',
  research_running: 'research is running',
}

const CONFIRM_WORD = 'delete'

interface ShortlistDeleteDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  workspaceId: string
  clientId: string
  /** Podcast ids (the shortlist's `podcast_id`), and a name when there is just one. */
  podcastIds: string[]
  podcastName?: string
  onDeleted: () => Promise<void> | void
}

function keptSummary(kept: ShortlistDeleteKept[]): string {
  const named = kept.slice(0, 3).map((show) => `${show.podcast_name} (${KEPT_REASONS[show.reason] ?? show.reason})`).join(', ')
  return kept.length > 3 ? `${named} and ${kept.length - 3} more` : named
}

/** Permanent removal, behind a typed confirmation: archiving is the reversible option. */
export const ShortlistDeleteDialog = ({ open, onOpenChange, workspaceId, clientId, podcastIds, podcastName, onDeleted }: ShortlistDeleteDialogProps) => {
  const [typed, setTyped] = useState('')
  const [deleting, setDeleting] = useState(false)
  useEffect(() => { if (open) setTyped('') }, [open])
  const count = podcastIds.length
  const subject = count === 1 && podcastName ? podcastName : `${count} show${count === 1 ? '' : 's'}`

  const confirm = async () => {
    setDeleting(true)
    let deleted = 0
    const kept: ShortlistDeleteKept[] = []
    try {
      for (const batch of chunk(podcastIds, BULK_FEEDBACK_BATCH_SIZE)) {
        const result = await deleteClientShortlistPodcasts(workspaceId, clientId, batch)
        deleted += result.deleted
        kept.push(...result.kept)
      }
      if (deleted > 0) toast.success(`Deleted ${deleted} show${deleted === 1 ? '' : 's'} from the shortlist.`)
      if (kept.length > 0) {
        toast.info(`Kept ${kept.length}: ${keptSummary(kept)}. Archive ${kept.length === 1 ? 'it' : 'them'} instead to hide from the client.`, { duration: 10_000 })
      }
      onOpenChange(false)
    } catch (error) {
      const message = error instanceof Error ? error.message : 'The podcasts could not be deleted.'
      toast.error(deleted > 0 ? `${message} ${deleted} were deleted before it stopped.` : message)
    } finally {
      setDeleting(false)
      await onDeleted()
    }
  }

  return (
    <AlertDialog open={open} onOpenChange={(next) => { if (!deleting) onOpenChange(next) }}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Permanently delete {subject}?</AlertDialogTitle>
          <AlertDialogDescription asChild>
            <div className="space-y-2 text-sm text-muted-foreground">
              <p>This removes {count === 1 ? 'the show' : 'these shows'} from the shortlist with {count === 1 ? 'its' : 'their'} research, drafted pitches and the client’s decision. It cannot be undone, and {count === 1 ? 'the show' : 'they'} can be suggested and pitched again later.</p>
              <p>Shows already in a campaign, already contacted, or with research running are kept. To hide shows but keep their history, archive them instead.</p>
            </div>
          </AlertDialogDescription>
        </AlertDialogHeader>
        <label className="space-y-1.5 text-sm">
          <span>Type <strong>{CONFIRM_WORD}</strong> to confirm</span>
          <Input value={typed} onChange={(event) => setTyped(event.target.value)} aria-label={`Type ${CONFIRM_WORD} to confirm`} autoComplete="off" />
        </label>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={deleting}>Cancel</AlertDialogCancel>
          <Button variant="destructive" disabled={deleting || typed.trim().toLowerCase() !== CONFIRM_WORD} onClick={() => void confirm()}>
            {deleting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Trash2 className="mr-2 h-4 w-4" />}Delete permanently
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}
