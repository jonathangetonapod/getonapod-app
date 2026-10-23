import { Link } from 'react-router-dom'
import { CornerUpLeft, Mail, Settings } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'

interface Props {
  open: boolean
  onOpenChange: (open: boolean) => void
  workspaceName: string
  /** Settings, pointed at the reply-to field itself. */
  settingsHref: string
}

/*
 * "Reply-to address" is email jargon. Invitations go out under the agency's
 * name but from the platform's shared sending address, so a client who
 * presses Reply writes to a mailbox the agency never sees. This says that in
 * plain words, with a picture of the email, before sending them to Settings.
 */
const ReplyToHelpDialog = ({ open, onOpenChange, workspaceName, settingsHref }: Props) => {
  const agency = workspaceName.trim() || 'Your agency'
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Where client replies go</DialogTitle>
          <DialogDescription>A one-time setting so you never miss a client’s question.</DialogDescription>
        </DialogHeader>

        <div className="space-y-4 text-sm">
          <div className="rounded-lg border bg-muted/30 p-3 text-xs">
            <p className="flex items-center gap-2 font-medium"><Mail className="h-3.5 w-3.5 text-muted-foreground" aria-hidden="true" />Invitation your client receives</p>
            <dl className="mt-2 grid grid-cols-[auto_1fr] gap-x-3 gap-y-1">
              <dt className="text-muted-foreground">From</dt><dd>{agency} (our shared sending address)</dd>
              <dt className="text-muted-foreground">Reply-to</dt><dd className="font-medium text-amber-800">Not set</dd>
            </dl>
          </div>

          <p>Intake invitations go out under your agency’s name, but from a shared sending address that has no inbox you can read.</p>
          <p className="flex gap-2">
            <CornerUpLeft className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
            <span>When a client presses Reply to ask a question, their email goes to that shared address and never reaches you.</span>
          </p>
          <p>Add the email you want replies sent to, such as <span className="font-medium">hello@youragency.com</span>. It applies to every intake invitation and reminder from then on, and to shortlist and booking emails.</p>
        </div>

        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)}>Not now</Button>
          <Button asChild><Link to={settingsHref}><Settings className="mr-2 h-4 w-4" />Add reply-to email</Link></Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

export default ReplyToHelpDialog
