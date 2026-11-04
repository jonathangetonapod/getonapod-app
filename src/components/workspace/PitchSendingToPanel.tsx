import { Loader2, X } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import {
  CONTACT_ROLE_LABELS,
  sourceBadgeLabel,
  type PitchRecipient,
} from '@/lib/pitchRecipients'
import { cn } from '@/lib/utils'

interface PitchSendingToPanelProps {
  recipient: PitchRecipient | null
  /** A paid search in flight, or one that just came back empty. */
  verifiedPlaceholder: 'searching' | 'not_found' | null
  disabled?: boolean
  className?: string
  onRemove: () => void
}

const STATUS_DOT: Record<PitchRecipient['status'], { className: string; label: string }> = {
  verified: { className: 'bg-emerald-500', label: 'Verified' },
  unverified: { className: 'bg-slate-300', label: 'Not verified' },
  bounced: { className: 'bg-destructive', label: 'Bounced' },
}

/**
 * The one place that says who receives the pitch. Every pitch goes to one
 * address, on every platform; a bounced address stays visible, so nobody
 * picks it again, but cannot be sent to.
 */
export const PitchSendingToPanel = ({ recipient, verifiedPlaceholder, disabled, className, onRemove }: PitchSendingToPanelProps) => {
  const bounced = recipient?.status === 'bounced'
  return (
    <section aria-labelledby="pitch-sending-to-heading" className={cn('rounded-xl border bg-background p-4 shadow-sm', className)}>
      <h4 id="pitch-sending-to-heading" className="text-sm font-semibold">Sending to</h4>
      {recipient ? (
        <div
          aria-label="Pitch recipient"
          className={cn('mt-3 flex flex-wrap items-center gap-2 rounded-lg border px-2.5 py-2', bounced ? 'bg-muted/40' : 'border-primary/40 bg-primary/5')}
        >
          <span className={cn('h-2 w-2 shrink-0 rounded-full', STATUS_DOT[recipient.status].className)} role="img" aria-label={STATUS_DOT[recipient.status].label} />
          <span className={cn('min-w-0 flex-1 truncate text-sm', bounced ? 'line-through opacity-60' : 'font-medium')}>{recipient.email}</span>
          <Badge variant="outline" className="font-normal">{sourceBadgeLabel(recipient)}</Badge>
          {recipient.contact_role && recipient.contact_role !== 'host' && (
            <Badge variant="secondary" className="font-normal">{CONTACT_ROLE_LABELS[recipient.contact_role]}</Badge>
          )}
          {bounced && <Badge variant="destructive">Bounced</Badge>}
          <button
            type="button"
            aria-label={`Remove ${recipient.email}`}
            disabled={disabled}
            className="rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground disabled:opacity-50"
            onClick={onRemove}
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      ) : !verifiedPlaceholder && (
        <p className="mt-3 text-xs text-muted-foreground">Choose one address above.</p>
      )}
      {bounced && (
        <p className="mt-2 text-xs text-destructive">This address bounced on an earlier send. Choose another one.</p>
      )}
      {verifiedPlaceholder && (
        <p role="status" className="mt-2 flex items-center gap-2 rounded-lg border border-dashed px-2.5 py-2 text-sm text-muted-foreground">
          {verifiedPlaceholder === 'searching'
            ? <><Loader2 className="h-3.5 w-3.5 animate-spin" />Verified host email: searching…</>
            : <>No verified email found</>}
        </p>
      )}
    </section>
  )
}
