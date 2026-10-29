import { useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { addClientShortlistPodcasts, getClientShortlist } from '@/services/clientShortlist'
import { toShortlistPodcast } from '@/lib/podcastCatalogShortlist'
import { clientPitchHref } from '@/lib/workspaceRoutes'
import type { WorkspacePodcastCatalogItem } from '@/services/workspacePodcastCatalog'

export function FindHostEmailDialog({ podcast, clients, defaultClientId, workspaceId, baseHref, onClose }: {
  podcast: WorkspacePodcastCatalogItem
  clients: Array<{ id: string; name: string }>
  defaultClientId: string
  workspaceId: string
  baseHref: string
  onClose: () => void
}) {
  const [clientId, setClientId] = useState(defaultClientId)
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const openPitch = useMutation({
    mutationFn: async () => {
      if (!clients.some(client => client.id === clientId)) throw new Error('Choose an active client first.')
      let shortlist = await getClientShortlist(workspaceId, clientId)
      let row = shortlist.podcasts.find(item => item.podcast_id === podcast.podcast_id)
      if (!row) {
        await addClientShortlistPodcasts(workspaceId, clientId, [toShortlistPodcast(podcast)])
        shortlist = await getClientShortlist(workspaceId, clientId)
        row = shortlist.podcasts.find(item => item.podcast_id === podcast.podcast_id)
      }
      if (!row) throw new Error('The podcast could not be opened. Refresh the shortlist and try again.')
      queryClient.setQueryData(['client-shortlist', workspaceId, clientId], shortlist)
      queryClient.setQueryData(['workspace-client-shortlist', workspaceId, clientId, 'catalog-ids'], shortlist)
      void queryClient.invalidateQueries({ queryKey: ['workspace-podcast-catalog'] })
      return row.id
    },
    onSuccess: id => navigate(clientPitchHref(baseHref, clientId, id)),
  })
  return <Dialog open onOpenChange={open => { if (!open && !openPitch.isPending) onClose() }}>
    <DialogContent>
      <DialogHeader>
        <DialogTitle>Find host email</DialogTitle>
        <DialogDescription>Open {podcast.podcast_name} in a client’s pitch workspace to start the lookup. We’ll add it to their shortlist if needed.</DialogDescription>
      </DialogHeader>
      <label className="space-y-2 text-sm">Client
        <select aria-label="Client for host email search" value={clientId} onChange={event => setClientId(event.target.value)} disabled={openPitch.isPending} className="block w-full rounded-md border bg-background p-2">
          <option value="">Choose a client</option>
          {clients.map(client => <option key={client.id} value={client.id}>{client.name}</option>)}
        </select>
      </label>
      <p className="text-sm text-muted-foreground">The lookup uses your workspace’s selected Claude or OpenAI key. No app credits are used; your AI provider’s API charges apply when you start the search.</p>
      {openPitch.error && <p role="alert" className="text-sm text-destructive">{openPitch.error.message}</p>}
      <Button disabled={!clientId || openPitch.isPending} onClick={() => openPitch.mutate()}>{openPitch.isPending ? 'Opening…' : 'Continue to pitch workspace'}</Button>
    </DialogContent>
  </Dialog>
}
