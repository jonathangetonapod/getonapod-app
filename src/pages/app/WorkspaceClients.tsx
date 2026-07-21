import { useEffect, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Loader2, Pencil, Plus, Trash2, Users } from 'lucide-react'
import { toast } from 'sonner'
import { useAuth } from '@/contexts/AuthContext'
import { WorkspaceLayout } from '@/components/workspace/WorkspaceLayout'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Textarea } from '@/components/ui/textarea'
import {
  createWorkspaceClient,
  deleteWorkspaceClient,
  getWorkspaceClients,
  updateWorkspaceClient,
  type WorkspaceClient,
  type WorkspaceClientInput,
} from '@/services/clients'

const emptyClient: WorkspaceClientInput = {
  name: '',
  email: '',
  contact_person: '',
  linkedin_url: '',
  website: '',
  status: 'active',
  notes: '',
}

const WorkspaceClients = () => {
  const { canWriteClients, workspace } = useAuth()
  const queryClient = useQueryClient()
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editing, setEditing] = useState<WorkspaceClient | null>(null)
  const [deleting, setDeleting] = useState<WorkspaceClient | null>(null)
  const [form, setForm] = useState<WorkspaceClientInput>(emptyClient)
  const workspaceId = workspace?.id || ''
  const queryKey = ['workspace', workspaceId, 'clients'] as const

  const clientsQuery = useQuery({
    queryKey,
    queryFn: () => getWorkspaceClients(workspaceId),
    enabled: Boolean(workspaceId),
  })

  useEffect(() => {
    if (clientsQuery.error) {
      toast.error(clientsQuery.error instanceof Error ? clientsQuery.error.message : 'Unable to load clients.')
    }
  }, [clientsQuery.error])

  const saveMutation = useMutation({
    mutationFn: async () => {
      if (!workspaceId) throw new Error('Workspace is unavailable.')
      if (!form.name.trim()) throw new Error('Client name is required.')
      return editing
        ? updateWorkspaceClient(workspaceId, editing.id, form)
        : createWorkspaceClient(workspaceId, form)
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey })
      setDialogOpen(false)
      setEditing(null)
      setForm(emptyClient)
      toast.success(editing ? 'Client updated.' : 'Client added.')
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : 'Unable to save client.'),
  })

  const deleteMutation = useMutation({
    mutationFn: async (client: WorkspaceClient) => {
      if (!workspaceId) throw new Error('Workspace is unavailable.')
      await deleteWorkspaceClient(workspaceId, client.id)
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey })
      setDeleting(null)
      toast.success('Client removed.')
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : 'Unable to remove client.'),
  })

  const openCreate = () => {
    setEditing(null)
    setForm(emptyClient)
    setDialogOpen(true)
  }

  const openEdit = (client: WorkspaceClient) => {
    setEditing(client)
    setForm({
      name: client.name,
      email: client.email || '',
      contact_person: client.contact_person || '',
      linkedin_url: client.linkedin_url || '',
      website: client.website || '',
      status: client.status,
      notes: client.notes || '',
    })
    setDialogOpen(true)
  }

  if (!workspace) {
    return (
      <WorkspaceLayout>
        <Card><CardHeader><CardTitle>Workspace unavailable</CardTitle><CardDescription>Your account does not have an active workspace.</CardDescription></CardHeader></Card>
      </WorkspaceLayout>
    )
  }

  const clients = clientsQuery.data || []

  return (
    <WorkspaceLayout>
      <div className="space-y-6">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-3xl font-bold tracking-tight">Clients</h1>
            <p className="text-muted-foreground">Clients in {workspace.name}</p>
          </div>
          {canWriteClients && <Button onClick={openCreate}><Plus className="mr-2 h-4 w-4" />Add client</Button>}
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2"><Users className="h-5 w-5" />Your clients</CardTitle>
            <CardDescription>Only members of this workspace can access these records.</CardDescription>
          </CardHeader>
          <CardContent>
            {clientsQuery.isLoading ? (
              <div className="flex min-h-40 items-center justify-center"><Loader2 className="h-7 w-7 animate-spin text-primary" /></div>
            ) : clientsQuery.error ? (
              <div className="flex min-h-40 flex-col items-center justify-center gap-3 text-center">
                <p className="font-medium text-destructive">Clients could not be loaded</p>
                <p className="max-w-md text-sm text-muted-foreground">
                  {clientsQuery.error instanceof Error ? clientsQuery.error.message : 'Check your connection and try again.'}
                </p>
                <Button variant="outline" onClick={() => void clientsQuery.refetch()}>Try again</Button>
              </div>
            ) : clients.length === 0 ? (
              <div className="flex min-h-40 flex-col items-center justify-center gap-3 text-center">
                <Users className="h-10 w-10 text-muted-foreground" />
                <div><p className="font-medium">No clients yet</p><p className="text-sm text-muted-foreground">Add your first client to begin.</p></div>
                {canWriteClients && <Button onClick={openCreate} variant="outline"><Plus className="mr-2 h-4 w-4" />Add client</Button>}
              </div>
            ) : (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader><TableRow><TableHead>Name</TableHead><TableHead>Contact</TableHead><TableHead>Status</TableHead><TableHead className="text-right">Actions</TableHead></TableRow></TableHeader>
                  <TableBody>
                    {clients.map((client) => (
                      <TableRow key={client.id}>
                        <TableCell><p className="font-medium">{client.name}</p>{client.website && <p className="max-w-xs truncate text-xs text-muted-foreground">{client.website}</p>}</TableCell>
                        <TableCell><p>{client.contact_person || '—'}</p><p className="text-xs text-muted-foreground">{client.email || 'No email'}</p></TableCell>
                        <TableCell><Badge variant={client.status === 'active' ? 'default' : 'secondary'} className="capitalize">{client.status}</Badge></TableCell>
                        <TableCell className="text-right">
                          {canWriteClients && <div className="inline-flex gap-1"><Button size="icon" variant="ghost" onClick={() => openEdit(client)} aria-label={`Edit ${client.name}`}><Pencil className="h-4 w-4" /></Button><Button size="icon" variant="ghost" className="text-destructive" onClick={() => setDeleting(client)} aria-label={`Remove ${client.name}`}><Trash2 className="h-4 w-4" /></Button></div>}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      <Dialog open={dialogOpen} onOpenChange={(open) => { setDialogOpen(open); if (!open) setEditing(null) }}>
        <DialogContent className="max-w-xl">
          <DialogHeader><DialogTitle>{editing ? 'Edit client' : 'Add client'}</DialogTitle></DialogHeader>
          <form className="space-y-4" onSubmit={(event) => { event.preventDefault(); saveMutation.mutate() }}>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2 sm:col-span-2"><Label htmlFor="client-name">Client name</Label><Input id="client-name" required value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} /></div>
              <div className="space-y-2"><Label htmlFor="client-email">Email</Label><Input id="client-email" type="email" value={form.email || ''} onChange={(event) => setForm({ ...form, email: event.target.value })} /></div>
              <div className="space-y-2"><Label htmlFor="client-contact">Contact person</Label><Input id="client-contact" value={form.contact_person || ''} onChange={(event) => setForm({ ...form, contact_person: event.target.value })} /></div>
              <div className="space-y-2"><Label htmlFor="client-website">Website</Label><Input id="client-website" type="url" value={form.website || ''} onChange={(event) => setForm({ ...form, website: event.target.value })} /></div>
              <div className="space-y-2"><Label>Status</Label><Select value={form.status} onValueChange={(value: WorkspaceClientInput['status']) => setForm({ ...form, status: value })}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="active">Active</SelectItem><SelectItem value="paused">Paused</SelectItem><SelectItem value="churned">Churned</SelectItem></SelectContent></Select></div>
              <div className="space-y-2 sm:col-span-2"><Label htmlFor="client-linkedin">LinkedIn URL</Label><Input id="client-linkedin" type="url" value={form.linkedin_url || ''} onChange={(event) => setForm({ ...form, linkedin_url: event.target.value })} /></div>
              <div className="space-y-2 sm:col-span-2"><Label htmlFor="client-notes">Notes</Label><Textarea id="client-notes" value={form.notes || ''} onChange={(event) => setForm({ ...form, notes: event.target.value })} /></div>
            </div>
            <DialogFooter><Button type="button" variant="outline" onClick={() => setDialogOpen(false)}>Cancel</Button><Button type="submit" disabled={saveMutation.isPending}>{saveMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}{editing ? 'Save changes' : 'Add client'}</Button></DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={Boolean(deleting)} onOpenChange={(open) => { if (!open) setDeleting(null) }}>
        <DialogContent>
          <DialogHeader><DialogTitle>Remove client?</DialogTitle></DialogHeader>
          <p className="text-sm text-muted-foreground">This permanently removes {deleting?.name} and may remove connected records. This action cannot be undone.</p>
          <DialogFooter><Button variant="outline" onClick={() => setDeleting(null)}>Cancel</Button><Button variant="destructive" disabled={deleteMutation.isPending} onClick={() => deleting && deleteMutation.mutate(deleting)}>{deleteMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Remove client</Button></DialogFooter>
        </DialogContent>
      </Dialog>
    </WorkspaceLayout>
  )
}

export default WorkspaceClients
