import { Link } from 'react-router-dom'
import { ArrowRight, Clock, OctagonAlert } from 'lucide-react'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { safeExternalUrl } from '@/lib/externalUrl'
import type { ClientPodcastSystemClient } from '@/services/clientPodcastSystem'
import { actionUrgency, initials, type ActionUrgency, type ClientRollup } from './pipelineRollup'

const URGENCY_CLASS: Record<ActionUrgency, string> = {
  blocking: 'bg-red-600 text-white hover:bg-red-700',
  soon: 'bg-amber-400 text-amber-950 hover:bg-amber-500',
  routine: '',
}

// Colour is never the only signal: the icon and the screen-reader text carry it too.
const URGENCY_TEXT: Record<ActionUrgency, string | null> = {
  blocking: 'Blocking',
  soon: 'Due soon',
  routine: null,
}

export const ClientAvatar = ({ client, className }: { client: ClientPodcastSystemClient; className?: string }) => {
  const imageUrl = safeExternalUrl(client.photo_url)
  return (
    <Avatar className={cn('h-10 w-10 shrink-0 border bg-background', className)}>
      {imageUrl && <AvatarImage src={imageUrl} alt="" className="object-cover" />}
      <AvatarFallback className="text-xs">{initials(client.name)}</AvatarFallback>
    </Avatar>
  )
}

/**
 * The client's next action as the button that does it: a shortlist row opens
 * the opportunity sheet, anything else opens the client record tab.
 */
export const NextActionButton = ({
  rollup,
  baseHref,
  onOpenItem,
  label,
  className,
}: {
  rollup: ClientRollup
  baseHref: string
  onOpenItem: (itemId: string) => void
  /** Visible text; defaults to the action itself. */
  label?: string
  className?: string
}) => {
  const { client, nextAction } = rollup
  const { target } = nextAction
  if (!target) return null
  const urgency = actionUrgency(rollup)
  const urgencyText = URGENCY_TEXT[urgency]
  const Icon = urgency === 'blocking' ? OctagonAlert : urgency === 'soon' ? Clock : null
  // Starts with the visible text, so speech control can say what it sees.
  const accessibleName = `${label ? `${label}: ` : ''}${nextAction.label} for ${client.name}${urgencyText ? ` (${urgencyText.toLowerCase()})` : ''}`
  const content = (
    <>
      {Icon && <Icon aria-hidden="true" />}
      <span className="truncate" title={label ? undefined : nextAction.label}>{label || nextAction.label}</span>
      <ArrowRight aria-hidden="true" />
    </>
  )
  const buttonClassName = cn('min-w-0 max-w-full', URGENCY_CLASS[urgency], className)

  if (target.kind === 'item') {
    return (
      <Button type="button" size="sm" className={buttonClassName} onClick={() => onOpenItem(target.itemId)} aria-label={accessibleName}>
        {content}
      </Button>
    )
  }
  return (
    <Button asChild size="sm" className={buttonClassName}>
      <Link to={`${baseHref}/clients/${encodeURIComponent(client.id)}?tab=${target.tab}`} aria-label={accessibleName}>{content}</Link>
    </Button>
  )
}
