import { Link } from 'react-router-dom'
import { OctagonAlert } from 'lucide-react'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { safeExternalUrl } from '@/lib/externalUrl'
import type { ClientPodcastSystemClient } from '@/services/clientPodcastSystem'
import { actionHref, initials, type PipelineAction } from './pipelineRollup'

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
 * A queue action as the button that does it: a shortlist row opens the
 * opportunity sheet, anything else navigates. One neutral style for all of
 * them; red is kept for the one kind that blocks further work, and says so in
 * words too, since colour is never the only signal.
 */
export const ActionButton = ({
  action,
  baseHref,
  onOpenItem,
  className,
}: {
  action: PipelineAction
  baseHref: string
  onOpenItem: (itemId: string) => void
  className?: string
}) => {
  // Starts with the visible text, so speech control can say what it sees.
  const accessibleName = `${action.verb}: ${action.title} for ${action.client.name}${action.blocking ? ' (blocking)' : ''}`
  const content = (
    <>
      {action.blocking && <OctagonAlert aria-hidden="true" />}
      <span className="truncate">{action.verb}</span>
    </>
  )
  const variant = action.blocking ? 'destructive' : 'default'
  const buttonClassName = cn('min-w-0 max-w-full', className)
  const href = actionHref(action, baseHref)
  const { target } = action

  if (target.kind === 'item') {
    return (
      <Button type="button" size="sm" variant={variant} className={buttonClassName} onClick={() => onOpenItem(target.itemId)} aria-label={accessibleName}>
        {content}
      </Button>
    )
  }
  return (
    <Button asChild size="sm" variant={variant} className={buttonClassName}>
      <Link to={href || baseHref} aria-label={accessibleName}>{content}</Link>
    </Button>
  )
}
