import { useState } from 'react'
import { ChevronDown, Loader2, MoreHorizontal } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { clientNames } from '@/lib/mailboxView'
import { plural } from '@/lib/plural'
import type { WorkspaceClient } from '@/services/clients'
import type { WorkspaceMailboxAccount } from '@/services/workspaceCampaigns'
import type { useMailboxActions } from '@/hooks/useMailboxActions'

export type MailboxActions = ReturnType<typeof useMailboxActions>

interface ClientOption {
  id: string
  name: string
}

/** Clients plus any the mailbox is still on but the list no longer has (a deleted client). */
function clientOptions(account: WorkspaceMailboxAccount, clients: WorkspaceClient[]): ClientOption[] {
  const known = new Set(clients.map((client) => client.id))
  const orphaned = (account.campaigns ?? [])
    .filter((link) => !known.has(link.client_id))
    .map((link) => ({ id: link.client_id, name: link.client_name || 'Unknown client' }))
  return [...clients.map((client) => ({ id: client.id, name: client.name })), ...orphaned]
}

interface ClientListProps {
  clients: WorkspaceClient[]
  clientsError: Error | null
  onApply: (clients: ClientOption[]) => void
}

/**
 * The "assign to clients" list shared by the row menu and the bulk bar.
 * Ticking a client keeps the menu open so several can be chosen; the last
 * item applies them all. The choice resets each time the menu closes.
 */
export const ClientPickItems = ({ clients, clientsError, onApply }: ClientListProps) => {
  const [chosen, setChosen] = useState<string[]>([])
  if (clientsError) return <DropdownMenuItem disabled>Clients could not be loaded</DropdownMenuItem>
  if (clients.length === 0) return <DropdownMenuItem disabled>No clients yet</DropdownMenuItem>
  const toggle = (id: string, checked: boolean) => setChosen((current) => (
    checked ? [...current, id] : current.filter((value) => value !== id)
  ))
  return (
    <>
      {clients.map((client) => (
        <DropdownMenuCheckboxItem
          key={client.id}
          checked={chosen.includes(client.id)}
          onSelect={(event) => event.preventDefault()}
          onCheckedChange={(checked) => toggle(client.id, checked)}
        >
          {client.name}
        </DropdownMenuCheckboxItem>
      ))}
      <DropdownMenuSeparator />
      <DropdownMenuItem
        disabled={chosen.length === 0}
        className="font-semibold text-primary"
        onSelect={() => onApply(clients
          .filter((client) => chosen.includes(client.id))
          .map((client) => ({ id: client.id, name: client.name })))}
      >
        {chosen.length === 0 ? 'Tick one or more clients' : `Assign to ${plural(chosen.length, 'client')}`}
      </DropdownMenuItem>
    </>
  )
}

interface MailboxMenuProps {
  account: WorkspaceMailboxAccount
  canManage: boolean
  clients: WorkspaceClient[]
  clientsError: Error | null
  actions: MailboxActions
}

/**
 * The client cell is the dropdown: "Assign client" when unassigned, the
 * client's name when assigned. Each client is a checkbox, so the same menu
 * connects and disconnects.
 */
export const MailboxClientMenu = ({ account, canManage, clients, clientsError, actions }: MailboxMenuProps) => {
  const names = clientNames(account)
  const label = names.length === 0
    ? 'Assign client'
    : names.length === 1 ? names[0] : `${names[0]} +${names.length - 1}`
  if (!canManage) {
    return <span className="block truncate text-sm text-muted-foreground" title={names.join(', ')}>{names.length ? label : 'Unassigned'}</span>
  }
  const assignedIds = new Set((account.campaigns ?? []).map((link) => link.client_id))
  const busy = actions.pendingEmails.has(account.email)
  const options = clientOptions(account, clients)
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          disabled={busy}
          aria-label={`Client for ${account.email}: ${names.length ? names.join(', ') : 'unassigned'}`}
          className={`-ml-2 h-7 max-w-full gap-1 px-2 font-normal ${names.length ? 'text-foreground' : 'text-primary'}`}
        >
          {busy && <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin" />}
          <span className="truncate">{label}</span>
          <ChevronDown className="h-3.5 w-3.5 shrink-0 opacity-60" aria-hidden="true" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="max-h-80 w-56 overflow-y-auto">
        <DropdownMenuLabel className="text-xs text-muted-foreground">Sends for</DropdownMenuLabel>
        {clientsError && <DropdownMenuItem disabled>Clients could not be loaded</DropdownMenuItem>}
        {!clientsError && options.length === 0 && <DropdownMenuItem disabled>No clients yet</DropdownMenuItem>}
        {options.map((client) => (
          <DropdownMenuCheckboxItem
            key={client.id}
            checked={assignedIds.has(client.id)}
            onCheckedChange={(checked) => {
              if (checked) actions.assign([account], [client])
              else actions.unassign(account.email, client.id, client.name)
            }}
          >
            {client.name}
          </DropdownMenuCheckboxItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

interface MailboxActionsMenuProps extends MailboxMenuProps {
  hasDetails: boolean
  detailsOpen: boolean
  onToggleDetails: () => void
}

export const MailboxActionsMenu = ({
  account,
  canManage,
  clients,
  clientsError,
  actions,
  hasDetails,
  detailsOpen,
  onToggleDetails,
}: MailboxActionsMenuProps) => (
  <DropdownMenu>
    <DropdownMenuTrigger asChild>
      <Button type="button" variant="ghost" size="icon" className="h-7 w-7" aria-label={`Actions for ${account.email}`}>
        <MoreHorizontal className="h-4 w-4" />
      </Button>
    </DropdownMenuTrigger>
    <DropdownMenuContent align="end" className="w-48">
      {canManage && (
        <>
          <DropdownMenuSub>
            <DropdownMenuSubTrigger>Assign to clients</DropdownMenuSubTrigger>
            <DropdownMenuSubContent className="max-h-80 w-56 overflow-y-auto">
              <ClientPickItems
                clients={clients}
                clientsError={clientsError}
                onApply={(picked) => actions.assign([account], picked)}
              />
            </DropdownMenuSubContent>
          </DropdownMenuSub>
          {account.status === 2
            ? <DropdownMenuItem onSelect={() => actions.setPaused([account], false)}>Resume sending</DropdownMenuItem>
            : <DropdownMenuItem onSelect={() => actions.setPaused([account], true)}>Pause sending</DropdownMenuItem>}
          {/* TODO(mailboxes): Reconnect. Instantly's API has no endpoint to
              re-run a mailbox's OAuth; it has to be done in Instantly. */}
          <DropdownMenuSeparator />
        </>
      )}
      <DropdownMenuItem onSelect={() => void actions.copyEmails([account.email])}>Copy email</DropdownMenuItem>
      {hasDetails && (
        <DropdownMenuItem onSelect={onToggleDetails}>{detailsOpen ? 'Hide error details' : 'Show error details'}</DropdownMenuItem>
      )}
    </DropdownMenuContent>
  </DropdownMenu>
)
