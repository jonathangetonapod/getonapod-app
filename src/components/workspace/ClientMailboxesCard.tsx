import { useMemo } from 'react'
import { Link } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { Inbox, Loader2, RefreshCw, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { StatusSummary } from '@/components/workspace/mailboxes/MailboxCells'
import { useMailboxActions } from '@/hooks/useMailboxActions'
import { cannotSend, effectiveStatus, sentText } from '@/lib/mailboxView'
import { plural } from '@/lib/plural'
import { getWorkspaceMailboxes } from '@/services/workspaceCampaigns'

interface ClientMailboxesCardProps {
  workspaceId: string
  clientId: string
  clientName: string
  canManage: boolean
  mailboxesHref: string
}

/**
 * The mailboxes assigned to this client on the Mailboxes screen. Assigning
 * happens there, across many mailboxes at once; this is where the client's
 * own page shows the result and lets one be taken off.
 */
export const ClientMailboxesCard = ({ workspaceId, clientId, clientName, canManage, mailboxesHref }: ClientMailboxesCardProps) => {
  // Same key as the campaign card's sender picker, so the two share one fetch.
  const mailboxesQuery = useQuery({
    queryKey: ['workspace-mailboxes', workspaceId],
    queryFn: () => getWorkspaceMailboxes(workspaceId),
    retry: false,
    staleTime: 30_000,
  })
  const actions = useMailboxActions(workspaceId)

  const assigned = useMemo(
    () => (mailboxesQuery.data?.accounts ?? [])
      .filter((account) => (account.campaigns ?? []).some((link) => link.client_id === clientId))
      .sort((left, right) => left.email.localeCompare(right.email)),
    [mailboxesQuery.data, clientId],
  )
  const blocked = assigned.filter((account) => cannotSend(effectiveStatus(account))).length

  return (
    <Card aria-labelledby="client-mailboxes-heading">
      <CardHeader className="gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <CardTitle id="client-mailboxes-heading" className="flex items-center gap-2">
            <Inbox className="h-4 w-4 text-muted-foreground" />Sending mailboxes
            {assigned.length > 0 && <span className="text-sm font-normal text-muted-foreground">({assigned.length})</span>}
          </CardTitle>
          <CardDescription>
            The mailboxes that send {clientName}'s outreach whenever their campaign is active.
            {blocked > 0 && <span className="text-destructive"> {plural(blocked, 'mailbox', 'mailboxes')} cannot send right now.</span>}
          </CardDescription>
        </div>
        <Button asChild size="sm" variant="outline" className="shrink-0">
          <Link to={mailboxesHref}>{canManage ? 'Assign mailboxes' : 'View mailboxes'}</Link>
        </Button>
      </CardHeader>
      <CardContent>
        {mailboxesQuery.isLoading ? (
          <div className="flex min-h-20 items-center justify-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />Loading mailboxes…
          </div>
        ) : mailboxesQuery.isError ? (
          <div className="flex min-h-20 flex-col items-center justify-center gap-3 text-center">
            <p className="text-sm text-destructive">
              {mailboxesQuery.error instanceof Error ? mailboxesQuery.error.message : 'Mailboxes could not be loaded.'}
            </p>
            <Button variant="outline" size="sm" onClick={() => void mailboxesQuery.refetch()}>
              <RefreshCw className="mr-2 h-4 w-4" />Try again
            </Button>
          </div>
        ) : !mailboxesQuery.data?.connected ? (
          <p className="text-sm text-muted-foreground">Connect Instantly to assign sending mailboxes.</p>
        ) : assigned.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            No mailboxes send for {clientName} yet. Assign them from the Mailboxes page.
          </p>
        ) : (
          <ul className="divide-y rounded-md border" aria-label={`Mailboxes sending for ${clientName}`}>
            {assigned.map((account) => {
              const status = effectiveStatus(account)
              const name = [account.first_name, account.last_name].filter(Boolean).join(' ')
              return (
                <li key={account.email} className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-4 gap-y-1 px-3 py-2 sm:grid-cols-[minmax(0,1fr)_8rem_6rem_auto]">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium">{account.email}</p>
                    {name && <p className="truncate text-xs text-muted-foreground">{name}</p>}
                  </div>
                  <div className="hidden sm:block"><StatusSummary account={account} status={status} /></div>
                  <p className="hidden text-sm tabular-nums text-muted-foreground sm:block">{sentText(account)}</p>
                  {canManage ? (
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8 text-muted-foreground"
                      disabled={actions.pendingEmails.has(account.email)}
                      aria-label={`Remove ${account.email} from ${clientName}`}
                      onClick={() => actions.unassign(account.email, clientId, clientName)}
                    >
                      {actions.pendingEmails.has(account.email)
                        ? <Loader2 className="h-4 w-4 animate-spin" />
                        : <X className="h-4 w-4" />}
                    </Button>
                  ) : <span />}
                </li>
              )
            })}
          </ul>
        )}
      </CardContent>
    </Card>
  )
}
