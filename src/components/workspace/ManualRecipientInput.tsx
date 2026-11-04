import { useState } from 'react'
import { X } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { EmailText } from './EmailText'
import {
  CONTACT_ROLE_LABELS,
  isValidRecipientEmail,
  normalizeRecipientEmail,
  type ContactRole,
  type PitchRecipient,
} from '@/lib/pitchRecipients'

interface ManualRecipientInputProps {
  /** The chosen recipient when it was found by hand, else null. */
  recipient: PitchRecipient | null
  disabled?: boolean
  onChoose: (email: string) => void
  onClear: () => void
  onRoleChange: (role: ContactRole) => void
}

function unverifiedHint(recipient: PitchRecipient): string {
  if (recipient.mx === 'none') return 'This domain has no mail server on record, so the address may not receive mail. You can still send to it.'
  return 'Added by hand and not confirmed yet. It becomes verified when a contact search confirms it or a reply comes from it.'
}

/**
 * An address the operator found themselves. Enter or a comma makes it the
 * recipient, replacing any other. The format is checked here; the MX check
 * runs on save and only ever labels, never blocks.
 */
export const ManualRecipientInput = ({ recipient, disabled, onChoose, onClear, onRoleChange }: ManualRecipientInputProps) => {
  const [draft, setDraft] = useState('')
  const [error, setError] = useState<string | null>(null)

  const commit = (value: string) => {
    const parts = value.split(/[\s,;]+/).map((part) => part.trim()).filter(Boolean)
    if (parts.length === 0) return
    if (parts.length > 1) {
      setDraft(value.replace(/[,;]+\s*$/, ''))
      setError('A pitch goes to one email address. Enter just one.')
      return
    }
    if (!isValidRecipientEmail(parts[0])) {
      setDraft(parts[0])
      setError(`${parts[0]} is not a valid email address.`)
      return
    }
    onChoose(normalizeRecipientEmail(parts[0]))
    setDraft('')
    setError(null)
  }

  return (
    <div className="space-y-3">
      <div>
        <Label htmlFor="campaign-manual-email" className="text-xs font-medium">Email address</Label>
        <Input
          id="campaign-manual-email"
          type="text"
          inputMode="email"
          autoComplete="off"
          value={draft}
          disabled={disabled}
          maxLength={254}
          placeholder="host@podcast.com, then Enter"
          aria-invalid={Boolean(error)}
          aria-describedby="campaign-manual-email-help"
          className="mt-1.5 bg-background"
          onChange={(event) => {
            const value = event.target.value
            // A comma ends an address the same way Enter does.
            if (/[,;]\s*$/.test(value)) commit(value)
            else {
              setDraft(value)
              if (error) setError(null)
            }
          }}
          onKeyDown={(event) => {
            if (event.key === 'Enter') {
              event.preventDefault()
              commit(draft)
            }
          }}
          onBlur={() => commit(draft)}
        />
        <p id="campaign-manual-email-help" className={`mt-1.5 text-xs ${error ? 'text-destructive' : 'text-muted-foreground'}`}>
          {error || 'Press Enter to use this address.'}
        </p>
      </div>
      {recipient && (
        <div aria-label="Email you added" className="flex flex-wrap items-center gap-2 rounded-lg border bg-background px-2.5 py-2">
          <span className="w-full min-w-0 text-sm font-medium [overflow-wrap:anywhere]"><EmailText email={recipient.email} /></span>
          {recipient.status === 'verified' ? (
            <Badge variant="outline" className="border-emerald-200 bg-emerald-50 text-emerald-800 hover:bg-emerald-50">Verified</Badge>
          ) : recipient.status === 'bounced' ? (
            <Badge variant="destructive">Bounced</Badge>
          ) : (
            <Tooltip>
              <TooltipTrigger asChild>
                <span className="inline-flex"><Badge variant="outline" className="border-amber-200 bg-amber-50 text-amber-900 hover:bg-amber-50">Unverified</Badge></span>
              </TooltipTrigger>
              <TooltipContent className="max-w-xs">{unverifiedHint(recipient)}</TooltipContent>
            </Tooltip>
          )}
          <Select value={recipient.contact_role ?? 'host'} disabled={disabled} onValueChange={(value) => onRoleChange(value as ContactRole)}>
            <SelectTrigger aria-label={`Role for ${recipient.email}`} className="h-8 w-28 text-xs"><SelectValue /></SelectTrigger>
            <SelectContent>
              {(Object.keys(CONTACT_ROLE_LABELS) as ContactRole[]).map((role) => (
                <SelectItem key={role} value={role}>{CONTACT_ROLE_LABELS[role]}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <button
            type="button"
            aria-label={`Remove ${recipient.email}`}
            disabled={disabled}
            className="rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground disabled:opacity-50"
            onClick={onClear}
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      )}
    </div>
  )
}
