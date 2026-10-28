import { Copy, MailCheck, ShieldCheck } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { formatDay, type PodcastEmailStatus } from '@/lib/podcastCatalogDisplay'
import { cn } from '@/lib/utils'

const CHIP: Record<PodcastEmailStatus['state'], { label: string; className: string }> = {
  verified: { label: 'Verified host email', className: 'border-emerald-200 bg-emerald-50 text-emerald-800 hover:bg-emerald-50' },
  deliverable: { label: 'Deliverable email', className: 'border-emerald-200 bg-white text-emerald-800 hover:bg-white' },
  catch_all: { label: 'Catch-all email', className: 'border-amber-200 bg-amber-50 text-amber-900 hover:bg-amber-50' },
  public: { label: 'Public email', className: 'border-border bg-muted text-foreground hover:bg-muted' },
  none: { label: 'No email', className: 'border-dashed bg-transparent text-muted-foreground hover:bg-transparent' },
}

function chipHint(status: PodcastEmailStatus): string | null {
  if (status.state === 'verified') {
    const checked = formatDay(status.verifiedAt)
    return checked ? `Verified direct contact. Checked ${checked}.` : 'Verified direct contact.'
  }
  if (status.state === 'deliverable') return 'Published by the show. The mailbox is confirmed to accept mail.'
  if (status.state === 'catch_all') return 'Published by the show. Its mail server accepts every address, so this inbox cannot be confirmed.'
  if (status.state === 'public') return 'Published by the show. Not checked yet.'
  return null
}

/** One chip for the contact states, the same in the list, the cards and the details. */
export const PodcastEmailChip = ({ status, className }: { status: PodcastEmailStatus; className?: string }) => {
  const chip = CHIP[status.state]
  const hint = chipHint(status)
  const badge = (
    <Badge variant="outline" className={cn('whitespace-nowrap font-medium', chip.className, !hint && className)}>
      {status.state === 'verified' && <ShieldCheck className="mr-1 h-3 w-3" aria-hidden="true" />}
      {status.state === 'deliverable' && <MailCheck className="mr-1 h-3 w-3" aria-hidden="true" />}
      {chip.label}
      {status.state === 'public' && <span className="sr-only">, unverified</span>}
    </Badge>
  )
  if (!hint) return badge
  return (
    <Tooltip>
      {/* Badge does not forward a ref, so the trigger is a span around it. */}
      <TooltipTrigger asChild><span className={cn('inline-flex', className)}>{badge}</span></TooltipTrigger>
      <TooltipContent>{hint}</TooltipContent>
    </Tooltip>
  )
}

/** The chip with the address beside it and a Copy button, for the card and the details. */
export const PodcastEmailLine = ({
  status,
  onCopy,
}: {
  status: PodcastEmailStatus
  onCopy: (email: string) => void
}) => (
  <div className="flex min-w-0 items-center gap-2">
    <PodcastEmailChip status={status} className="shrink-0" />
    {status.email && (
      <>
        <span className="min-w-0 truncate text-sm">{status.email}</span>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="h-7 shrink-0 px-2"
          onClick={() => onCopy(status.email as string)}
          aria-label={`Copy ${status.email}`}
        >
          <Copy className="mr-1.5 h-3.5 w-3.5" aria-hidden="true" />Copy
        </Button>
      </>
    )}
  </div>
)
