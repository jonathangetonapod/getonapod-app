import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { ChevronDown, ExternalLink, Info, Loader2, Mail, Send, Undo2, XCircle } from 'lucide-react'
import { toast } from 'sonner'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible'
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { RowMenu, type RowMenuItem } from '@/components/workspace/RowMenu'
import { TabIntro } from '@/components/workspace/agencies/InfoTip'
import { daysFromNow, formatDate, formatRelativeDays } from '@/lib/dates'
import { safeExternalUrl } from '@/lib/externalUrl'
import { isTestJoinRequest } from '@/lib/joinRequestTriage'
import { cn } from '@/lib/utils'
import { inviteWorkspaceUser } from '@/services/workspaceUsers'
import {
  listJoinRequests,
  setJoinRequestStatus,
  type AccessRequestStatus,
  type JoinRequest,
} from '@/services/accessRequests'

/** The words the landing page uses, so the queue reads the same as the form. */
const AUDIENCE_LABEL: Record<string, string> = {
  agency: 'Podcast agency',
  pr: 'PR or comms agency',
  freelancer: 'Freelancer',
  starting_out: 'Starting out',
  other: 'Other',
}

const STATUS_STYLE: Record<AccessRequestStatus, { label: string; className: string }> = {
  new: { label: 'Waiting', className: 'border-amber-200 bg-amber-50 text-amber-900' },
  contacted: { label: 'Contacted', className: 'border-sky-200 bg-sky-50 text-sky-900' },
  invited: { label: 'Invited', className: 'border-emerald-200 bg-emerald-50 text-emerald-900' },
  declined: { label: 'Declined', className: 'border-muted bg-muted/40 text-muted-foreground' },
}

/** The longest workspace name manage-workspace-users accepts. */
const WORKSPACE_NAME_MAX = 120

/**
 * Their company if they gave one, otherwise their own name. The form takes a
 * longer company than a workspace name may be, so it is cut to fit rather
 * than letting the invitation be refused for a name nobody chose.
 */
function workspaceNameFor(request: JoinRequest): string {
  const name = request.company?.trim() || request.full_name.trim()
  return name.slice(0, WORKSPACE_NAME_MAX).trim()
}

/** Plain until a week, amber to a month, red after. Text colour only. */
function waitingTone(createdAt: string): string {
  const days = daysFromNow(createdAt) ?? 0
  if (days > 30) return 'text-destructive'
  if (days > 7) return 'text-amber-700'
  return ''
}

const isOpen = (request: JoinRequest) => request.status === 'new' || request.status === 'contacted'

interface JoinRequestsCardProps {
  /** The workspace an invited request became, found by the owner's email. */
  workspaceIdForEmail?: (email: string) => string | null
}

/**
 * The queue of people asking to join.
 *
 * Whoever has waited longest is the one at risk of being forgotten, so the
 * waiting ones come first, oldest first, and carry how long it has been.
 * Declined requests and the deploy smoke check's test rows stay out of the
 * way until asked for.
 */
export function JoinRequestsCard({ workspaceIdForEmail }: JoinRequestsCardProps = {}) {
  const queryClient = useQueryClient()
  const [expanded, setExpanded] = useState<string | null>(null)
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [showTests, setShowTests] = useState(false)
  const [declinedOpen, setDeclinedOpen] = useState(false)
  const [confirming, setConfirming] = useState<JoinRequest | null>(null)
  const [bulkConfirming, setBulkConfirming] = useState(false)

  const requestsQuery = useQuery({
    queryKey: ['join-requests'],
    queryFn: listJoinRequests,
  })

  const refreshQueue = async () => {
    await queryClient.invalidateQueries({ queryKey: ['join-requests'] })
    // The bubble in the app shell counts what is still waiting; clearing a
    // request should clear it now, not at the next two-minute poll.
    await queryClient.invalidateQueries({ queryKey: ['join-requests-waiting'] })
  }

  /*
   * Sending the invitation is the act, and marking the request invited is the
   * bookkeeping. This does the real thing, then records it, and only records
   * it if the send succeeded.
   */
  const invite = useMutation({
    mutationFn: async (request: JoinRequest) => {
      await inviteWorkspaceUser({
        email: request.email,
        full_name: request.full_name,
        workspace_name: workspaceNameFor(request),
      })

      /*
       * The email has now gone. Recording it is bookkeeping about something
       * that already happened, so a failure here cannot be reported as a
       * failure to send: that would invite a second click, mailing a stranger
       * twice and creating a second workspace in their name.
       */
      try {
        await setJoinRequestStatus(request.id, 'invited')
        return { recorded: true }
      } catch {
        return { recorded: false }
      }
    },
    onSuccess: async (result, request) => {
      await refreshQueue()
      await queryClient.invalidateQueries({ queryKey: ['platform', 'workspace-users'] })
      setConfirming(null)
      if (result.recorded) {
        toast.success(`Invitation sent to ${request.email}.`)
      } else {
        toast.warning(
          `Invitation sent to ${request.email}, but the queue still shows them waiting. `
          + 'Do not send again. Mark the row invited by hand.',
        )
      }
    },
    onError: (error) => toast.error(
      error instanceof Error ? error.message : 'The invitation could not be sent.',
    ),
  })

  const move = useMutation({
    mutationFn: ({ id, status }: { id: string; status: AccessRequestStatus }) =>
      setJoinRequestStatus(id, status),
    onSuccess: async (_result, variables) => {
      await refreshQueue()
      toast.success(`Marked ${STATUS_STYLE[variables.status].label.toLowerCase()}.`)
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : 'That request could not be updated.'),
  })

  const bulkDecline = useMutation({
    mutationFn: async (requests: JoinRequest[]) => {
      // One at a time, so a refusal part way leaves an honest count behind it.
      let declined = 0
      for (const request of requests) {
        await setJoinRequestStatus(request.id, 'declined')
        declined += 1
      }
      return declined
    },
    onSuccess: (declined) => {
      toast.success(`Declined ${declined} ${declined === 1 ? 'request' : 'requests'}.`)
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : 'Some requests could not be declined.'),
    onSettled: async () => {
      setBulkConfirming(false)
      setSelected(new Set())
      await refreshQueue()
    },
  })

  const requests = (requestsQuery.data ?? []).filter((request) => showTests || !isTestJoinRequest(request))
  const testCount = (requestsQuery.data ?? []).filter(isTestJoinRequest).length
  const byAge = (a: JoinRequest, b: JoinRequest) => a.created_at.localeCompare(b.created_at)
  // Waiting first, then contacted, each oldest first; then invited, newest first.
  const active = [
    ...requests.filter((request) => request.status === 'new').sort(byAge),
    ...requests.filter((request) => request.status === 'contacted').sort(byAge),
    ...requests.filter((request) => request.status === 'invited').sort((a, b) => byAge(b, a)),
  ]
  const declined = requests.filter((request) => request.status === 'declined').sort((a, b) => byAge(b, a))
  const selectable = active.filter(isOpen)
  const selectedRequests = selectable.filter((request) => selected.has(request.id))

  const toggleSelected = (id: string, checked: boolean) => setSelected((current) => {
    const next = new Set(current)
    if (checked) next.add(id)
    else next.delete(id)
    return next
  })

  const rowProps = (request: JoinRequest) => ({
    request,
    expanded: expanded === request.id,
    busy: (move.isPending && move.variables?.id === request.id) || bulkDecline.isPending,
    workspaceId: request.status === 'invited' ? workspaceIdForEmail?.(request.email) ?? null : null,
    onToggle: () => setExpanded((current) => (current === request.id ? null : request.id)),
    onMove: (status: AccessRequestStatus) => move.mutate({ id: request.id, status }),
    onInvite: () => setConfirming(request),
  })

  const header = (selectAll?: React.ReactNode) => (
    <TableHeader>
      <TableRow>
        <TableHead className="w-10">{selectAll}</TableHead>
        <TableHead>Who</TableHead>
        <TableHead>Type</TableHead>
        <TableHead>Clients</TableHead>
        <TableHead>Waiting</TableHead>
        <TableHead>Status</TableHead>
        <TableHead className="text-right">Actions</TableHead>
      </TableRow>
    </TableHeader>
  )

  return (
    <div className="space-y-4">
      <TabIntro info="Sending an invitation creates their workspace and emails them a link to set a password.">
        People who asked to join from the landing page, none of whom has an account yet.
      </TabIntro>

      {requestsQuery.isLoading ? (
        <p className="flex items-center gap-2 py-6 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" />Loading requests…
        </p>
      ) : requestsQuery.isError ? (
        <p className="py-6 text-sm text-destructive" role="alert">
          {requestsQuery.error instanceof Error ? requestsQuery.error.message : 'Requests could not be loaded.'}
        </p>
      ) : active.length === 0 && declined.length === 0 ? (
        // An empty queue is the normal state, not a fault.
        <p className="py-6 text-sm text-muted-foreground">
          No one has asked to join yet. Requests from the landing page arrive here.
        </p>
      ) : (
        <>
          {selectedRequests.length > 0 && (
            <div className="flex items-center gap-3 rounded-md border bg-muted/40 px-3 py-2 text-sm" role="toolbar" aria-label="Selected requests">
              <span className="tabular-nums">{selectedRequests.length} selected</span>
              <Button type="button" size="sm" variant="outline" className="text-destructive" disabled={bulkDecline.isPending} onClick={() => setBulkConfirming(true)}>
                <XCircle className="mr-2 h-4 w-4" />Decline selected
              </Button>
              <Button type="button" size="sm" variant="ghost" onClick={() => setSelected(new Set())}>Clear</Button>
            </div>
          )}

          {active.length === 0 ? (
            <p className="py-4 text-sm text-muted-foreground">No one is waiting.</p>
          ) : (
            <div className="overflow-x-auto rounded-md border">
              <Table>
                {header(selectable.length > 0 && (
                  <Checkbox
                    aria-label="Select all open requests"
                    checked={selectedRequests.length === selectable.length ? true : selectedRequests.length ? 'indeterminate' : false}
                    onCheckedChange={(checked) => setSelected(checked === true ? new Set(selectable.map((request) => request.id)) : new Set())}
                  />
                ))}
                <TableBody>
                  {active.map((request) => (
                    <RequestRow
                      key={request.id}
                      {...rowProps(request)}
                      selected={selected.has(request.id)}
                      onSelect={isOpen(request) ? (checked) => toggleSelected(request.id, checked) : undefined}
                    />
                  ))}
                </TableBody>
              </Table>
            </div>
          )}

          {declined.length > 0 && (
            <Collapsible open={declinedOpen} onOpenChange={setDeclinedOpen}>
              <CollapsibleTrigger asChild>
                <Button type="button" variant="ghost" size="sm" className="-ml-2 gap-1">
                  <ChevronDown className={cn('h-4 w-4 transition-transform', declinedOpen && 'rotate-180')} aria-hidden="true" />
                  Declined ({declined.length})
                </Button>
              </CollapsibleTrigger>
              <CollapsibleContent>
                <div className="mt-2 overflow-x-auto rounded-md border">
                  <Table>
                    {header()}
                    <TableBody>
                      {declined.map((request) => <RequestRow key={request.id} {...rowProps(request)} />)}
                    </TableBody>
                  </Table>
                </div>
              </CollapsibleContent>
            </Collapsible>
          )}
        </>
      )}

      {testCount > 0 && (
        <div className="flex items-center gap-2 border-t pt-3">
          <Switch id="show-test-requests" checked={showTests} onCheckedChange={setShowTests} />
          <Label htmlFor="show-test-requests" className="text-sm font-normal text-muted-foreground">
            Show test entries ({testCount})
          </Label>
        </div>
      )}

      {/* Sending mails a stranger and creates a workspace in their name, so
          the dialog says exactly what is about to happen and to whom. */}
      <Dialog open={Boolean(confirming)} onOpenChange={(open) => { if (!open && !invite.isPending) setConfirming(null) }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Send an invitation?</DialogTitle>
            <DialogDescription>
              {confirming && (
                <>
                  {confirming.full_name} gets an email inviting them to set their own password.
                  A private workspace called <strong>{workspaceNameFor(confirming)}</strong> is
                  created with them as owner. The link expires in 24 hours.
                </>
              )}
            </DialogDescription>
          </DialogHeader>
          {confirming && (
            <dl className="grid gap-1 text-sm">
              <div className="flex gap-2"><dt className="text-muted-foreground">Email</dt><dd>{confirming.email}</dd></div>
              <div className="flex gap-2"><dt className="text-muted-foreground">Workspace</dt><dd>{workspaceNameFor(confirming)}</dd></div>
            </dl>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirming(null)} disabled={invite.isPending}>
              Cancel
            </Button>
            <Button disabled={invite.isPending} onClick={() => confirming && invite.mutate(confirming)}>
              {invite.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Send invitation
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={bulkConfirming} onOpenChange={(open) => { if (!open && !bulkDecline.isPending) setBulkConfirming(false) }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Decline {selectedRequests.length} {selectedRequests.length === 1 ? 'request' : 'requests'}?</DialogTitle>
            <DialogDescription>They move to Declined. Nobody is emailed, and you can move any of them back to waiting.</DialogDescription>
          </DialogHeader>
          <ul className="max-h-48 list-disc space-y-0.5 overflow-y-auto pl-5 text-sm">
            {selectedRequests.map((request) => <li key={request.id}>{request.full_name}</li>)}
          </ul>
          <DialogFooter>
            <Button variant="outline" disabled={bulkDecline.isPending} onClick={() => setBulkConfirming(false)}>Cancel</Button>
            <Button variant="destructive" disabled={bulkDecline.isPending} onClick={() => bulkDecline.mutate(selectedRequests)}>
              {bulkDecline.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Decline selected
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

interface RequestRowProps {
  request: JoinRequest
  expanded: boolean
  busy: boolean
  workspaceId: string | null
  selected?: boolean
  onSelect?: (checked: boolean) => void
  onToggle: () => void
  onMove: (status: AccessRequestStatus) => void
  onInvite: () => void
}

const RequestRow = ({ request, expanded, busy, workspaceId, selected, onSelect, onToggle, onMove, onInvite }: RequestRowProps) => {
  const website = safeExternalUrl(request.website || '')
  const status = STATUS_STYLE[request.status]
  const details: RowMenuItem = { label: expanded ? 'Hide details' : 'Show details', icon: <Info className="mr-2 h-4 w-4" />, onSelect: onToggle }
  const decline: RowMenuItem = { label: 'Decline', icon: <XCircle className="mr-2 h-4 w-4" />, disabled: busy, onSelect: () => onMove('declined') }
  const backToWaiting: RowMenuItem = { label: 'Move back to waiting', icon: <Undo2 className="mr-2 h-4 w-4" />, disabled: busy, onSelect: () => onMove('new') }

  const menu: RowMenuItem[] = request.status === 'declined'
    ? [{ label: 'Send invitation', icon: <Send className="mr-2 h-4 w-4" />, disabled: busy, onSelect: onInvite }, details]
    : request.status === 'invited'
      ? [backToWaiting, decline, details]
      : [
        ...(request.status === 'new' ? [{ label: 'Mark contacted', icon: <Mail className="mr-2 h-4 w-4" />, disabled: busy, onSelect: () => onMove('contacted') }] : [backToWaiting]),
        decline,
        details,
      ]

  const secondLine = [request.email, request.company].filter(Boolean).join(' · ')

  return (
    <>
      <TableRow data-state={selected ? 'selected' : undefined}>
        <TableCell className="w-10">
          {onSelect && (
            <Checkbox aria-label={`Select ${request.full_name}`} checked={Boolean(selected)} onCheckedChange={(checked) => onSelect(checked === true)} />
          )}
        </TableCell>
        <TableCell className="max-w-72">
          <div className="flex items-center gap-2">
            {workspaceId ? (
              <Link to={`?tab=workspaces&highlight=${workspaceId}`} className="font-medium underline-offset-2 hover:underline">
                {request.full_name}
              </Link>
            ) : (
              <button type="button" className="text-left font-medium hover:underline" onClick={onToggle} aria-expanded={expanded}>
                {request.full_name}
              </button>
            )}
            {isTestJoinRequest(request) && <Badge variant="outline" className="text-[10px]">Test</Badge>}
          </div>
          <p className="truncate text-xs text-muted-foreground">{secondLine}</p>
        </TableCell>
        <TableCell className="whitespace-nowrap text-sm">
          {AUDIENCE_LABEL[request.audience] ?? request.audience}
        </TableCell>
        <TableCell className="text-sm">
          {request.clients_now || <span className="text-muted-foreground">Not given</span>}
        </TableCell>
        <TableCell className={cn('whitespace-nowrap text-sm tabular-nums', isOpen(request) && waitingTone(request.created_at))}>
          {isOpen(request) ? formatRelativeDays(request.created_at) : null}
        </TableCell>
        <TableCell>
          <Badge variant="outline" className={status.className}>{status.label}</Badge>
        </TableCell>
        <TableCell className="text-right">
          <div className="inline-flex items-center justify-end gap-1 whitespace-nowrap">
            {busy && <Loader2 className="h-4 w-4 animate-spin" aria-label="Working" />}
            {isOpen(request) && (
              <Button type="button" size="sm" disabled={busy} onClick={onInvite}>
                <Send className="mr-2 h-4 w-4" />Send invitation
              </Button>
            )}
            {request.status === 'declined' && (
              <Button type="button" size="sm" variant="outline" disabled={busy} onClick={() => onMove('new')}>
                Move back to waiting
              </Button>
            )}
            <RowMenu items={menu} label={`More actions for ${request.full_name}`} />
          </div>
        </TableCell>
      </TableRow>
      {expanded && (
        <TableRow>
          <TableCell colSpan={7} className="bg-muted/30">
            <div className="space-y-2 py-1 text-sm">
              <p className="whitespace-pre-wrap">
                {request.notes || 'They did not say what they are using now.'}
              </p>
              <div className="flex flex-wrap gap-2">
                <Button asChild size="sm" variant="outline">
                  <a href={`mailto:${request.email}?subject=Get%20On%20A%20Pod`}>
                    <Mail className="mr-2 h-4 w-4" />Reply
                  </a>
                </Button>
                {website && (
                  <Button asChild size="sm" variant="outline">
                    <a href={website} target="_blank" rel="noreferrer">
                      <ExternalLink className="mr-2 h-4 w-4" />Their site
                    </a>
                  </Button>
                )}
              </div>
              {request.handled_at && (
                <p className="text-xs text-muted-foreground">Last moved {formatDate(request.handled_at)}.</p>
              )}
            </div>
          </TableCell>
        </TableRow>
      )}
    </>
  )
}
