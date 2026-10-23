import { useState } from 'react'
import { Loader2 } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group'
import {
  createManualWorkspaceAccount,
  inviteWorkspaceUser,
  type ManualWorkspaceCredential,
} from '@/services/workspaceUsers'

type AccessMethod = 'email' | 'password'

interface NewWorkspaceDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** Called after either path, whether it worked or not, so the lists refetch. */
  onSettled: () => void
  /** The password path hands its one-time credential up to be shown. */
  onCredential: (credential: ManualWorkspaceCredential, fallbackWorkspaceName?: string) => void
}

/*
 * The expiries are the database's, not a design choice: an emailed link lasts
 * 24 hours (finalize_workspace_invite) and a temporary password 7 days (every
 * create, rotate and reset path). See docs/manage-workspaces-discovery.md.
 */
const METHODS: Array<{ value: AccessMethod; label: string; help: string }> = [
  {
    value: 'email',
    label: 'Email them an invitation',
    help: 'They get a link to set their own password. The link expires in 24 hours.',
  },
  {
    value: 'password',
    label: 'Generate a temporary password',
    help: 'No email is sent. You see the password once and share it yourself. It works for 7 days.',
  },
]

/** One way in for a new workspace. Both paths call the same endpoints the two old buttons did. */
export const NewWorkspaceDialog = ({ open, onOpenChange, onSettled, onCredential }: NewWorkspaceDialogProps) => {
  const [email, setEmail] = useState('')
  const [fullName, setFullName] = useState('')
  const [workspaceName, setWorkspaceName] = useState('')
  const [method, setMethod] = useState<AccessMethod>('email')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const reset = () => {
    setEmail('')
    setFullName('')
    setWorkspaceName('')
    setMethod('email')
    setError(null)
  }

  const submit = async (event: React.FormEvent) => {
    event.preventDefault()
    setSubmitting(true)
    setError(null)
    const input = {
      email: email.trim(),
      full_name: fullName.trim() || undefined,
      workspace_name: workspaceName.trim() || undefined,
    }
    try {
      if (method === 'email') {
        await inviteWorkspaceUser(input)
        toast.success(`Invitation sent to ${input.email}.`)
        onOpenChange(false)
        reset()
      } else {
        const result = await createManualWorkspaceAccount({ request_id: crypto.randomUUID(), ...input })
        onOpenChange(false)
        reset()
        onCredential(result, input.workspace_name)
      }
    } catch (failure) {
      setError(failure instanceof Error
        ? failure.message
        : method === 'email' ? 'The invitation could not be sent.' : 'The workspace could not be created.')
    } finally {
      onSettled()
      setSubmitting(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={(next) => { if (!submitting) onOpenChange(next) }}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>New workspace</DialogTitle>
          <DialogDescription>The owner gets a private workspace and can add their agency team once they sign in.</DialogDescription>
        </DialogHeader>
        <form className="space-y-4" onSubmit={submit}>
          <div className="space-y-2"><Label htmlFor="new-workspace-email">Email</Label><Input id="new-workspace-email" type="email" required autoComplete="off" value={email} onChange={(event) => setEmail(event.target.value)} disabled={submitting} /></div>
          <div className="space-y-2"><Label htmlFor="new-workspace-owner">Full name</Label><Input id="new-workspace-owner" value={fullName} onChange={(event) => setFullName(event.target.value)} disabled={submitting} /></div>
          <div className="space-y-2"><Label htmlFor="new-workspace-name">Workspace name</Label><Input id="new-workspace-name" placeholder="Defaults to the owner's name" value={workspaceName} onChange={(event) => setWorkspaceName(event.target.value)} disabled={submitting} /></div>
          <fieldset className="space-y-2">
            <legend id="access-method-label" className="text-sm font-medium">How they get access</legend>
            <RadioGroup aria-labelledby="access-method-label" value={method} onValueChange={(value) => setMethod(value as AccessMethod)} disabled={submitting}>
              {METHODS.map((option) => (
                <div key={option.value} className="flex items-start gap-2 rounded-md border p-3">
                  <RadioGroupItem id={`access-${option.value}`} value={option.value} aria-describedby={`access-${option.value}-help`} className="mt-0.5" />
                  <div>
                    <Label htmlFor={`access-${option.value}`} className="font-medium">{option.label}</Label>
                    <p id={`access-${option.value}-help`} className="text-xs leading-5 text-muted-foreground">{option.help}</p>
                  </div>
                </div>
              ))}
            </RadioGroup>
          </fieldset>
          {error && <p className="text-sm text-destructive" role="alert">{error}</p>}
          <DialogFooter>
            <Button type="button" variant="outline" disabled={submitting} onClick={() => onOpenChange(false)}>Cancel</Button>
            <Button type="submit" disabled={submitting}>
              {submitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {method === 'email' ? 'Send invitation' : 'Create and show password'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
