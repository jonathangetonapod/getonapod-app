import { useId, useState } from 'react'
import { Link } from 'react-router-dom'
import { ChevronDown, ExternalLink, Mail, MoreHorizontal, UserRound } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { cn } from '@/lib/utils'
import { safeExternalUrl } from '@/lib/externalUrl'
import { ClientFunnel } from './ClientFunnel'
import { ClientSetupBadge, ClientSetupList } from './ClientSetupBadge'
import { LastActivity } from './LastActivity'
import { ClientAvatar, NextActionButton } from './NextActionButton'
import { formattedDate, statusClassName, type ClientRollup } from './pipelineRollup'

/** One compact line per client; the name expands it to the full details. */
export const ClientPipelineRow = ({
  rollup,
  baseHref,
  canManage,
  onOpenItem,
}: {
  rollup: ClientRollup
  baseHref: string
  canManage: boolean
  onOpenItem: (itemId: string) => void
}) => {
  const [expanded, setExpanded] = useState(false)
  const detailsId = useId()
  const { client, nextAction } = rollup
  const website = safeExternalUrl(client.website)
  const recordHref = `${baseHref}/clients/${encodeURIComponent(client.id)}`
  const isActive = client.status === 'active'

  return (
    <article className="rounded-xl border bg-card transition-colors hover:border-primary/30">
      <div className="flex flex-col gap-3 p-3 lg:flex-row lg:items-center lg:gap-4">
        <div className="flex min-w-0 items-center gap-3 lg:w-64 lg:shrink-0 xl:w-80">
          <ClientAvatar client={client} />
          <div className="min-w-0">
            <h3 className="min-w-0 text-base font-semibold">
              <button
                type="button"
                aria-expanded={expanded}
                aria-controls={detailsId}
                onClick={() => setExpanded((current) => !current)}
                className="flex max-w-full items-center gap-1 rounded text-left hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <span className="truncate">{client.name}</span>
                <ChevronDown className={cn('h-4 w-4 shrink-0 text-muted-foreground transition-transform', expanded && 'rotate-180')} aria-hidden="true" />
              </button>
            </h3>
            <div className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-1">
              <Badge variant="outline" className={cn('px-1.5 py-0 text-[11px]', statusClassName(client.status))}>{client.status}</Badge>
              {isActive && <ClientSetupBadge client={client} canManage={canManage} recordHref={recordHref} />}
              <LastActivity rollup={rollup} />
            </div>
          </div>
        </div>

        <div className="min-w-0 lg:flex-1"><ClientFunnel rollup={rollup} /></div>

        <div className="flex items-center gap-2 lg:w-[22rem] lg:shrink-0 lg:justify-end">
          {nextAction.target ? (
            <NextActionButton rollup={rollup} baseHref={baseHref} onOpenItem={onOpenItem} className="min-w-0 flex-1 lg:flex-initial" />
          ) : (
            // Paused and churned say so in their status pill; only an active
            // client's "nothing to do" is worth a line.
            <p className="min-w-0 flex-1 truncate text-sm text-muted-foreground lg:text-right">{isActive ? nextAction.label : ''}</p>
          )}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button type="button" variant="ghost" size="icon" className="h-9 w-9 shrink-0" aria-label={`More for ${client.name}`}>
                <MoreHorizontal aria-hidden="true" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem asChild><Link to={recordHref}><UserRound className="mr-2 h-4 w-4" />Client record</Link></DropdownMenuItem>
              {website && <DropdownMenuItem asChild><a href={website} target="_blank" rel="noreferrer"><ExternalLink className="mr-2 h-4 w-4" />Website</a></DropdownMenuItem>}
              {client.email && <DropdownMenuItem asChild><a href={`mailto:${client.email}`}><Mail className="mr-2 h-4 w-4" />Email {client.email}</a></DropdownMenuItem>}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      {expanded && (
        <div id={detailsId} className="grid gap-x-6 gap-y-2 border-t px-4 py-3 text-sm sm:grid-cols-2 lg:grid-cols-4">
          <div className="min-w-0">
            <p className="text-xs text-muted-foreground">Contact</p>
            <p className="truncate">{client.email || client.contact_person || 'No primary contact saved'}</p>
            {website && <a href={website} target="_blank" rel="noreferrer" className="inline-flex max-w-full items-center truncate text-xs text-primary hover:underline">{client.website}<ExternalLink className="ml-1 h-3 w-3" aria-hidden="true" /></a>}
          </div>
          {isActive && (
            <div className="min-w-0">
              <p className="text-xs text-muted-foreground">Next action</p>
              <p className="font-medium">{nextAction.label}</p>
              <p className="text-xs text-muted-foreground">{nextAction.detail}</p>
            </div>
          )}
          <div className="min-w-0">
            <p className="mb-1 text-xs text-muted-foreground">Setup</p>
            <ClientSetupList client={client} canManage={canManage} recordHref={recordHref} />
          </div>
          <div className="min-w-0">
            <p className="text-xs text-muted-foreground">Last activity</p>
            <p>{formattedDate(rollup.lastActivityAt, true)}</p>
            <Link to={recordHref} className="text-xs text-primary hover:underline">Open client record</Link>
          </div>
        </div>
      )}
    </article>
  )
}
