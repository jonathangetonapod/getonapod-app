import { CheckCircle2, Loader2 } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import {
  CONTACT_ROLE_LABELS,
  sourceBadgeLabel,
  type PitchRecipient,
} from '@/lib/pitchRecipients'
import { cn } from '@/lib/utils'
import { EmailText } from './EmailText'
import { PITCH_RECIPIENT_GROUP_ID } from './PitchRecipientCards'

interface PitchSendingToPanelProps {
  recipient: PitchRecipient | null
  /** A paid search in flight, or one that just came back empty. */
  verifiedPlaceholder: 'searching' | 'not_found' | null
  disabled?: boolean
  className?: string
}

/**
 * The one place that says who receives the pitch: a confirmation strip under
 * the options, in the page's normal flow. Every pitch goes to one address; a
 * bounced address stays visible, so nobody picks it again, but cannot be sent to.
 */
export const PitchSendingToPanel = ({ recipient, verifiedPlaceholder, disabled, className }: PitchSendingToPanelProps) => {
  const bounced = recipient?.status === 'bounced'
  const focusOptions = () => {
    const group = document.getElementById(PITCH_RECIPIENT_GROUP_ID)
    const target = group?.querySelector<HTMLElement>('[role="radio"][aria-checked="true"]')
      ?? group?.querySelector<HTMLElement>('[role="radio"][tabindex="0"]')
    target?.focus()
    target?.scrollIntoView({ block: 'nearest', behavior: 'smooth' })
  }
  return (
    <section
      aria-labelledby="pitch-sending-to-heading"
      className={cn(
        'flex flex-wrap items-center gap-x-3 gap-y-2 rounded-lg border px-4 py-3',
        recipient && !bounced ? 'border-emerald-200 bg-emerald-50/60' : 'border-dashed bg-muted/20',
        className,
      )}
    >
      <h4 id="pitch-sending-to-heading" className="text-sm font-medium text-muted-foreground">Sending to</h4>
      {recipient ? (
        // Its own line on a phone, so the address is never squeezed to nothing.
        <div aria-label="Pitch recipient" className="order-3 flex min-w-0 basis-full flex-wrap items-center gap-2 sm:order-none sm:flex-1 sm:basis-auto">
          {!bounced && <CheckCircle2 aria-hidden="true" className="h-4 w-4 shrink-0 text-emerald-600" />}
          <span className={cn('min-w-0 text-sm [overflow-wrap:anywhere]', bounced ? 'line-through opacity-60' : 'font-semibold')}><EmailText email={recipient.email} /></span>
          <Badge variant="outline" className="bg-background font-normal">{sourceBadgeLabel(recipient)}</Badge>
          {recipient.contact_role && recipient.contact_role !== 'host' && (
            <Badge variant="secondary" className="font-normal">{CONTACT_ROLE_LABELS[recipient.contact_role]}</Badge>
          )}
          {bounced && <Badge variant="destructive">Bounced</Badge>}
        </div>
      ) : verifiedPlaceholder ? (
        <p role="status" className="flex min-w-0 flex-1 items-center gap-2 text-sm text-muted-foreground">
          {verifiedPlaceholder === 'searching'
            ? <><Loader2 className="h-3.5 w-3.5 animate-spin" />Verified host email: searching…</>
            : <>No verified email found</>}
        </p>
      ) : (
        <p className="min-w-0 flex-1 text-sm text-muted-foreground">No address selected yet.</p>
      )}
      {recipient && (
        <button
          type="button"
          disabled={disabled}
          className="ml-auto text-sm font-medium text-primary underline-offset-4 hover:underline disabled:opacity-50"
          onClick={focusOptions}
        >
          Change
        </button>
      )}
      {bounced && (
        <p className="basis-full text-xs text-destructive">This address bounced on an earlier send. Choose another one.</p>
      )}
    </section>
  )
}
