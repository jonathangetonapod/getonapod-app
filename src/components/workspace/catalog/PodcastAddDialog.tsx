import { useEffect, useState } from 'react'
import { useMutation, useQuery } from '@tanstack/react-query'
import { Check, Loader2 } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Skeleton } from '@/components/ui/skeleton'
import type { ShortlistTarget } from '@/hooks/useDeferredShortlistAdd'
import { toProspectPodcast } from '@/lib/podcastCatalogShortlist'
import type { WorkspaceClient } from '@/services/clients'
import {
  addWorkspaceProspectPodcasts,
  getWorkspaceProspects,
  PartialShortlistAddError,
} from '@/services/prospectDashboards'
import type { WorkspacePodcastCatalogItem } from '@/services/workspacePodcastCatalog'

interface PodcastAddDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  workspaceId: string
  userId: string
  podcasts: WorkspacePodcastCatalogItem[]
  clients: WorkspaceClient[]
  clientsLoading: boolean
  clientsError: unknown
  defaultClientId: string
  /** Client adds go back to the page, which holds them for the Undo window. */
  onAddToClient: (client: ShortlistTarget, podcasts: WorkspacePodcastCatalogItem[]) => void
  onProspectAdded: (podcasts: WorkspacePodcastCatalogItem[]) => void
}

/*
 * Where a show goes when no working client is set, or when it is going
 * somewhere other than the working client: a client's shortlist, or a
 * prospect's page. The same shows serve both: a client shortlist is work
 * already sold, a prospect page is the pitch for work that is not.
 */
export const PodcastAddDialog = ({
  open,
  onOpenChange,
  workspaceId,
  userId,
  podcasts,
  clients,
  clientsLoading,
  clientsError,
  defaultClientId,
  onAddToClient,
  onProspectAdded,
}: PodcastAddDialogProps) => {
  const [addTarget, setAddTarget] = useState<'client' | 'prospect'>('client')
  const [selectedClientId, setSelectedClientId] = useState(defaultClientId)
  const [selectedProspectId, setSelectedProspectId] = useState('')

  useEffect(() => {
    if (!open) return
    setAddTarget('client')
    setSelectedProspectId('')
    setSelectedClientId(clients.some((client) => client.id === defaultClientId) ? defaultClientId : '')
  }, [clients, defaultClientId, open])

  const prospectsQuery = useQuery({
    queryKey: ['workspace-podcast-catalog', userId, workspaceId, 'prospects'],
    queryFn: () => getWorkspaceProspects(workspaceId),
    enabled: open && addTarget === 'prospect',
    retry: false,
  })
  // Archived dashboards are not somewhere anything should be added to.
  const availableProspects = (prospectsQuery.data?.dashboards || [])
    .filter((prospect) => prospect.lifecycle_status !== 'archived')

  const prospectMutation = useMutation({
    mutationFn: () => {
      if (!selectedProspectId) throw new Error('Choose a prospect first.')
      return addWorkspaceProspectPodcasts(workspaceId, selectedProspectId, podcasts.map(toProspectPodcast))
    },
    onSuccess: (result) => {
      const prospect = availableProspects.find((candidate) => candidate.id === selectedProspectId)
      if (result.added > 0) {
        toast.success(`Added ${result.added} podcast${result.added === 1 ? '' : 's'} to ${prospect?.prospect_name || 'the prospect page'}.`)
      } else {
        toast.info('Those podcasts are already on this prospect page.')
      }
      // A live dashboard stays live; the additions wait hidden for review.
      if ('hidden_pending_review' in result && result.hidden_pending_review) {
        toast.warning('Added hidden. Open the prospect’s New tab to show them.', { duration: 8000 })
      }
      onProspectAdded(podcasts)
      onOpenChange(false)
    },
    onError: (error) => {
      // The batch is sent in chunks; say how far it got before the failure.
      if (error instanceof PartialShortlistAddError) {
        toast.warning(`${error.partial.added} podcast${error.partial.added === 1 ? ' was' : 's were'} added before it failed.`)
      }
      toast.error(error instanceof Error ? error.message : 'The podcasts could not be added.')
    },
  })

  const confirm = () => {
    if (addTarget === 'prospect') {
      prospectMutation.mutate()
      return
    }
    const client = clients.find((candidate) => candidate.id === selectedClientId)
    if (!client) return
    onAddToClient({ id: client.id, name: client.name }, podcasts)
    onOpenChange(false)
  }

  return (
    <Dialog open={open} onOpenChange={(next) => { if (!prospectMutation.isPending) onOpenChange(next) }}>
      <DialogContent className="max-h-[calc(100dvh-2rem)] overflow-y-auto sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>{podcasts.length === 1 ? `Add ${podcasts[0].podcast_name}` : `Add ${podcasts.length} podcasts`}</DialogTitle>
          <DialogDescription>{addTarget === 'prospect'
            ? 'The selected shows will be added to the prospect’s dashboard. Existing entries are skipped.'
            : 'The selected shows will be added to the client’s shortlist. Existing entries are skipped.'}</DialogDescription>
        </DialogHeader>
        <div className="space-y-4 py-2">
          <div className="space-y-2">
            <Label>Add to</Label>
            {/* Filled plus a tick, so the chosen side looks chosen. */}
            <div className="grid grid-cols-2 gap-2">
              <Button
                type="button"
                variant={addTarget === 'client' ? 'default' : 'outline'}
                aria-pressed={addTarget === 'client'}
                onClick={() => setAddTarget('client')}
              >
                {addTarget === 'client' && <Check className="mr-2 h-4 w-4" aria-hidden="true" />}
                A client
              </Button>
              <Button
                type="button"
                variant={addTarget === 'prospect' ? 'default' : 'outline'}
                aria-pressed={addTarget === 'prospect'}
                onClick={() => setAddTarget('prospect')}
              >
                {addTarget === 'prospect' && <Check className="mr-2 h-4 w-4" aria-hidden="true" />}
                A prospect
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">
              {addTarget === 'prospect'
                ? 'Adding to a prospect page, a pitch for someone who is not a client yet.'
                : 'Adding to a client’s shortlist.'}
            </p>
          </div>
          {addTarget === 'prospect' ? (
            <div className="space-y-2">
              <Label htmlFor="podcast-database-prospect">Prospect</Label>
              {prospectsQuery.isLoading ? (
                <Skeleton className="h-10 w-full" />
              ) : prospectsQuery.error ? (
                <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">{prospectsQuery.error instanceof Error ? prospectsQuery.error.message : 'Prospects could not be loaded.'}</div>
              ) : availableProspects.length === 0 ? (
                <div className="rounded-lg border p-4 text-sm text-muted-foreground">No prospect pages are available in this workspace.</div>
              ) : (
                <Select value={selectedProspectId} onValueChange={setSelectedProspectId}>
                  <SelectTrigger id="podcast-database-prospect" aria-label="Prospect"><SelectValue placeholder="Choose a prospect" /></SelectTrigger>
                  <SelectContent>{availableProspects.map((prospect) => <SelectItem key={prospect.id} value={prospect.id}>{prospect.prospect_name}</SelectItem>)}</SelectContent>
                </Select>
              )}
            </div>
          ) : (
            <div className="space-y-2">
              <Label htmlFor="podcast-database-client">Client</Label>
              {clientsLoading ? (
                <Skeleton className="h-10 w-full" />
              ) : clientsError ? (
                <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">{clientsError instanceof Error ? clientsError.message : 'Clients could not be loaded.'}</div>
              ) : clients.length === 0 ? (
                <div className="rounded-lg border p-4 text-sm text-muted-foreground">No active clients are available in this workspace.</div>
              ) : (
                <Select value={selectedClientId} onValueChange={setSelectedClientId}>
                  <SelectTrigger id="podcast-database-client" aria-label="Client"><SelectValue placeholder="Choose a client" /></SelectTrigger>
                  <SelectContent>{clients.map((client) => <SelectItem key={client.id} value={client.id}>{client.name}</SelectItem>)}</SelectContent>
                </Select>
              )}
            </div>
          )}
          <div className="rounded-xl bg-muted/50 p-4">
            <p className="text-sm font-medium">What happens next</p>
            <p className="mt-1 text-xs leading-5 text-muted-foreground">{addTarget === 'prospect'
              ? 'The shows are added to the prospect’s dashboard hidden, so nothing changes under a reader. Open the prospect’s New tab to review and show them.'
              : 'The shows appear in the client’s Podcasts section for review, research, contact selection, and campaign preparation. This action does not send outreach.'}</p>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={prospectMutation.isPending}>Cancel</Button>
          <Button
            onClick={confirm}
            disabled={prospectMutation.isPending || (addTarget === 'prospect'
              ? !selectedProspectId || availableProspects.length === 0
              : !selectedClientId || clients.length === 0)}
          >{prospectMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}{addTarget === 'prospect' ? 'Add to dashboard' : 'Add to shortlist'}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
