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
import { ClientAvatar } from './ActionButton'
import { formattedDate, isStale, statusClassName, type ClientRollup } from './pipelineRollup'

/** One compact line per client; the name expands it to the full details. */
export const ClientPipelineRow = ({
  rollup,
  baseHref,
  canManage,
  onShowActions,
}: {
  rollup: ClientRollup
  baseHref: string
  canManage: boolean
  /** Takes the operator to this client's rows in the Today queue. */
  onShowActions: (clientId: string) => void
}) => {
  const [expanded, setExpanded] = useState(false)
  const detailsId = useId()
  const { client, actions } = rollup
  const website = safeExternalUrl(client.website)
  const recordHref = `${baseHref}/clients/${encodeURIComponent(client.id)}`
  const isActive = client.status === 'active'
  const stale = isStale(rollup)

  return (
    <article
      data-stale={stale || undefined}
      className={cn(
        'rounded-xl border bg-card transition-colors hover:border-primary/30',
        // Stale is a state of the whole card, not a footnote beside "active".
        stale && 'border-l-4 border-amber-300 border-l-amber-400 bg-amber-50/40',
      )}
    >
      {/* One line only from xl. From lg the name and action share a line and
          the funnel takes the next one, since fixed columns either side would
          leave it too narrow to read. Phones stack all three. */}
      <div className="flex flex-col gap-3 p-3 lg:flex-row lg:flex-wrap lg:items-center xl:flex-nowrap xl:gap-4">
        <div className="flex min-w-0 items-center gap-3 lg:flex-1 xl:w-56 xl:flex-none xl:shrink-0 2xl:w-80">
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
              {stale ? (
                <Badge variant="outline" className="border-amber-300 bg-amber-100 px-1.5 py-0 text-[11px] text-amber-900">stale</Badge>
              ) : (
                <Badge variant="outline" className={cn('px-1.5 py-0 text-[11px]', statusClassName(client.status))}>{client.status}</Badge>
              )}
              {isActive && <ClientSetupBadge client={client} canManage={canManage} pipelineStarted={rollup.pipelineStarted} recordHref={recordHref} />}
              <LastActivity rollup={rollup} />
            </div>
          </div>
        </div>

        <div className="min-w-0 lg:order-last lg:basis-full xl:order-none xl:basis-auto xl:flex-1"><ClientFunnel rollup={rollup} baseHref={baseHref} /></div>

        <div className="flex items-center gap-2 xl:w-32 xl:shrink-0">
          <span className="flex-1" aria-hidden="true" />
          {/* The action itself lives once, in the Today queue; this only points at it. */}
          {actions.length > 0 ? (
            <a
              href="#pipeline-today"
              onClick={(event) => { event.preventDefault(); onShowActions(client.id) }}
              className={cn(
                'inline-flex shrink-0 items-center rounded-full border px-2 py-0.5 text-xs font-medium hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                actions.some((action) => action.blocking) && 'border-red-200 bg-red-50 text-red-800 hover:bg-red-100',
              )}
              aria-label={`${actions.length} ${actions.length === 1 ? 'action' : 'actions'} for ${client.name} in Today`}
            >
              {actions.length} {actions.length === 1 ? 'action' : 'actions'}
            </a>
          ) : (
            // Paused and churned say so in their status pill; only an active
            // client's "nothing to do" is worth a line.
            <p className="min-w-0 truncate text-xs text-muted-foreground">{isActive ? 'Nothing due' : ''}</p>
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
        <div id={detailsId} className="grid gap-x-6 gap-y-2 border-t px-4 py-3 text-sm sm:grid-cols-3">
          <div className="min-w-0">
            <p className="text-xs text-muted-foreground">Contact</p>
            <p className="truncate">{client.email || client.contact_person || 'No primary contact saved'}</p>
            {website && <a href={website} target="_blank" rel="noreferrer" className="inline-flex max-w-full items-center truncate text-xs text-primary hover:underline">{client.website}<ExternalLink className="ml-1 h-3 w-3" aria-hidden="true" /></a>}
          </div>
          <div className="min-w-0">
            <p className="mb-1 text-xs text-muted-foreground">Setup</p>
            <ClientSetupList client={client} canManage={canManage} pipelineStarted={rollup.pipelineStarted} recordHref={recordHref} />
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
