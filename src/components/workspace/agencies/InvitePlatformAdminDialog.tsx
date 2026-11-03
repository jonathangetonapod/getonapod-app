import { useState } from 'react'
import { Loader2 } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { invitePlatformAdmin } from '@/services/platformTeam'

interface InvitePlatformAdminDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** Called after the attempt, whether it worked or not, so the list refetches. */
  onSettled: () => void
}

export const InvitePlatformAdminDialog = ({ open, onOpenChange, onSettled }: InvitePlatformAdminDialogProps) => {
  const [email, setEmail] = useState('')
  const [fullName, setFullName] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const submit = async (event: React.FormEvent) => {
    event.preventDefault()
    setSubmitting(true)
    setError(null)
    const address = email.trim()
    try {
      await invitePlatformAdmin({ email: address, full_name: fullName.trim() || undefined })
      toast.success(`Invite sent to ${address}.`)
      setEmail('')
      setFullName('')
      onOpenChange(false)
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : 'The invite could not be sent.')
    } finally {
      onSettled()
      setSubmitting(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={(next) => { if (!submitting) onOpenChange(next) }}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Invite a platform admin</DialogTitle>
          <DialogDescription>
            They can open every workspace, manage agencies and use the admin pages. They get an email link to set a
            password; it expires in 24 hours.
          </DialogDescription>
        </DialogHeader>
        <form className="space-y-4" onSubmit={submit}>
          <div className="space-y-2">
            <Label htmlFor="platform-invite-email">Email</Label>
            <Input id="platform-invite-email" type="email" required autoComplete="off" value={email} onChange={(event) => setEmail(event.target.value)} disabled={submitting} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="platform-invite-name">Full name</Label>
            <Input id="platform-invite-name" autoComplete="off" value={fullName} onChange={(event) => setFullName(event.target.value)} disabled={submitting} />
          </div>
          <p className="text-xs leading-5 text-muted-foreground">
            The email must not already belong to an agency workspace: one address can only be in one workspace.
          </p>
          {error && <p className="text-sm text-destructive" role="alert">{error}</p>}
          <DialogFooter>
            <Button type="button" variant="outline" disabled={submitting} onClick={() => onOpenChange(false)}>Cancel</Button>
            <Button type="submit" disabled={submitting}>
              {submitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Send invite
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
