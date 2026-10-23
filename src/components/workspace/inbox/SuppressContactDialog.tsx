import { Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import type { WorkspaceInboxThread } from '@/services/workspaceCampaigns'

interface SuppressContactDialogProps {
  target: WorkspaceInboxThread | null
  pending: boolean
  canManage: boolean
  onCancel: () => void
  onConfirm: (thread: WorkspaceInboxThread) => void
}

/*
 * Suppression is workspace-wide and directed at the sender, so it is worth
 * naming the address before it silences that person for every client. The
 * safe direction, but not a small one.
 */
export const SuppressContactDialog = ({ target, pending, canManage, onCancel, onConfirm }: SuppressContactDialogProps) => (
  <Dialog open={Boolean(target)} onOpenChange={(next) => !pending && !next && onCancel()}>
    <DialogContent className="sm:max-w-lg">
      <DialogHeader>
        <DialogTitle>Never contact {target?.lead_email || target?.from_email}?</DialogTitle>
        <DialogDescription>
          An opt-out is directed at your agency, not at one campaign. This address will be
          excluded from outreach for every client in this workspace, and the conversation is
          archived.
        </DialogDescription>
      </DialogHeader>
      {target?.body_text && (
        <p className="mt-4 line-clamp-4 rounded-lg border bg-muted/40 p-3 text-xs leading-5 text-muted-foreground">
          {target.body_text.slice(0, 400)}
        </p>
      )}
      <p className="mt-3 text-xs leading-5 text-muted-foreground">
        It stays reversible from Relationships, where removing it asks for a written reason.
      </p>
      <DialogFooter className="mt-5">
        <Button type="button" variant="outline" onClick={onCancel} disabled={pending}>Cancel</Button>
        <Button type="button" variant="destructive" onClick={() => target && onConfirm(target)} disabled={!canManage || pending}>
          {pending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
          Add to do not contact
        </Button>
      </DialogFooter>
    </DialogContent>
  </Dialog>
)
