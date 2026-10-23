import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { ClipboardList, Copy, Eye, EyeOff } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { formatDate } from '@/lib/dates'
import { selectedWorkspaceBaseHref, workspaceModuleHref } from '@/lib/workspaceRoutes'
import type { ManualWorkspaceCredential } from '@/services/workspaceUsers'

export interface ShownCredential extends ManualWorkspaceCredential {
  workspaceName?: string
}

/**
 * What the operator pastes to the owner they are setting up: the address, the
 * account, the password, and that it is a one-off.
 */
function signInInstructions(credential: ManualWorkspaceCredential): string {
  const origin = String(import.meta.env.VITE_APP_URL || window.location.origin).replace(/\/+$/u, '')
  const expiry = formatDate(credential.membership.invite_expires_at)
  return `Sign in at ${origin}/login with ${credential.email} and this temporary password: ${credential.temporary_password}\n`
    + 'You will be asked to choose your own password straight away.'
    + (expiry ? ` This temporary one stops working on ${expiry}.` : '')
}

interface TemporaryPasswordDialogProps {
  credential: ShownCredential | null
  onClose: () => void
}

/**
 * The one time a temporary password is visible. It stays in memory only, and
 * the dialog cannot be dismissed until the operator says they saved it.
 * Mount it with a key per credential so each one starts hidden and unsaved.
 */
export const TemporaryPasswordDialog = ({ credential, onClose }: TemporaryPasswordDialogProps) => {
  const navigate = useNavigate()
  const [visible, setVisible] = useState(false)
  const [copied, setCopied] = useState(false)
  const [instructionsCopied, setInstructionsCopied] = useState(false)
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const copyText = async (value: string, onCopied: () => void) => {
    try {
      await navigator.clipboard.writeText(value)
      onCopied()
      setError(null)
    } catch {
      setVisible(true)
      setError('Clipboard access is unavailable. Select and copy the visible password manually.')
    }
  }

  const blockClose = Boolean(credential) && !saved

  return (
    <Dialog
      open={Boolean(credential)}
      onOpenChange={(open) => {
        if (open) return
        if (blockClose) {
          setError('Confirm that you saved the one-time password before closing.')
          return
        }
        onClose()
      }}
    >
      <DialogContent
        onEscapeKeyDown={(event) => { if (blockClose) event.preventDefault() }}
        onPointerDownOutside={(event) => { if (blockClose) event.preventDefault() }}
      >
        {credential && (
          <>
            <DialogHeader>
              <DialogTitle>Save the temporary password</DialogTitle>
              <DialogDescription>
                This password is shown once and cannot be retrieved later. Share it with {credential.email} through a secure channel, not email from this app.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4">
              {credential.workspaceName && (
                <div><p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Workspace</p><p className="font-medium">{credential.workspaceName}</p></div>
              )}
              <div><p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Email</p><p className="font-medium">{credential.email}</p></div>
              <div className="space-y-2">
                <Label htmlFor="temporary-password">Temporary password</Label>
                <div className="flex gap-2">
                  <div className="relative min-w-0 flex-1">
                    <Input
                      id="temporary-password"
                      type={visible ? 'text' : 'password'}
                      readOnly
                      value={credential.temporary_password}
                      className="pr-10 font-mono"
                      autoComplete="off"
                    />
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="absolute right-0 top-0 h-full px-3"
                      onClick={() => setVisible((value) => !value)}
                      aria-label={visible ? 'Hide temporary password' : 'Reveal temporary password'}
                    >
                      {visible ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </Button>
                  </div>
                  <Button type="button" variant="outline" onClick={() => void copyText(credential.temporary_password, () => setCopied(true))}>
                    <Copy className="mr-2 h-4 w-4" />{copied ? 'Copied' : 'Copy'}
                  </Button>
                </div>
                {/* The whole message, not just the secret: where to go,
                    which account, and that the password is a one-off. */}
                <Button type="button" variant="outline" size="sm" onClick={() => void copyText(signInInstructions(credential), () => setInstructionsCopied(true))}>
                  <ClipboardList className="mr-2 h-4 w-4" />{instructionsCopied ? 'Sign-in instructions copied' : 'Copy sign-in instructions'}
                </Button>
              </div>
              <p className="rounded-md border border-amber-500/40 bg-amber-500/10 p-3 text-sm">
                The account cannot access workspace data until this password is replaced at first sign-in.
              </p>
              {credential.membership.invite_expires_at && (
                <p className="text-sm text-muted-foreground">
                  Temporary access expires {formatDate(credential.membership.invite_expires_at)}.
                </p>
              )}
              {error && <p className="text-sm text-destructive" role="alert">{error}</p>}
              <div className="flex items-start gap-2">
                <Checkbox id="credential-saved" checked={saved} onCheckedChange={(checked) => setSaved(checked === true)} />
                <Label htmlFor="credential-saved" className="font-normal leading-5">
                  I saved this password in a secure place.
                </Label>
              </div>
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" disabled={!saved} onClick={onClose}>Done</Button>
              <Button
                type="button"
                disabled={!saved}
                onClick={() => {
                  const workspaceId = credential.membership.workspace_id
                  onClose()
                  navigate(workspaceModuleHref(selectedWorkspaceBaseHref(workspaceId), 'clients'))
                }}
              >
                Open workspace
              </Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  )
}
