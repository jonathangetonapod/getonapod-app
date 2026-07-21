import { useEffect, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Loader2, Pencil, Plus, Trash2, Users } from 'lucide-react'
import { toast } from 'sonner'
import { useAuth } from '@/contexts/AuthContext'
import { WorkspaceLayout } from '@/components/workspace/WorkspaceLayout'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
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
import { getAdminWorkspaceView, type AdminWorkspaceView } from '@/services/adminWorkspaces'

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

const emptyClient: WorkspaceClientInput = {
  name: '',
  email: '',
  contact_person: '',
  linkedin_url: '',
  website: '',
  status: 'active',
  notes: '',
}

interface WorkspaceClientsProps {
  adminPreviewWorkspaceId?: string
}

function validatePreviewView(view: AdminWorkspaceView, workspaceId: string): AdminWorkspaceView {
  if (
    view.workspace.id !== workspaceId
    || view.workspace.is_default
    || view.workspace.status !== 'active'
    || view.viewer.workspace_id !== workspaceId
    || view.viewer.role !== 'owner'
    || !view.viewer.email
    || view.clients.some((client) => client.workspace_id !== workspaceId)
  ) {
    throw new Error('The workspace preview response did not match the selected workspace.')
  }
  return view
}

const WorkspaceClients = ({ adminPreviewWorkspaceId }: WorkspaceClientsProps) => {
  const { canWriteClients, user, workspace } = useAuth()
  const queryClient = useQueryClient()
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editing, setEditing] = useState<WorkspaceClient | null>(null)
  const [deleting, setDeleting] = useState<WorkspaceClient | null>(null)
  const [form, setForm] = useState<WorkspaceClientInput>(emptyClient)
  const isAdminPreview = adminPreviewWorkspaceId !== undefined
  const previewWorkspaceId = (adminPreviewWorkspaceId || '').toLowerCase()
  const validPreviewWorkspaceId = UUID_PATTERN.test(previewWorkspaceId)
  const tenantWorkspaceId = workspace?.id || ''
  const queryKey = ['tenant', user?.id || 'unknown', tenantWorkspaceId, 'clients'] as const

  const tenantClientsQuery = useQuery({
    queryKey,
    queryFn: () => getWorkspaceClients(tenantWorkspaceId),
    enabled: !isAdminPreview && Boolean(tenantWorkspaceId),
  })

  const previewQuery = useQuery({
    queryKey: ['platform', user?.id || 'unknown', 'workspace-preview', previewWorkspaceId, 'clients'],
    queryFn: async ({ signal }) => validatePreviewView(
      await getAdminWorkspaceView(previewWorkspaceId, signal),
      previewWorkspaceId,
    ),
    enabled: isAdminPreview && validPreviewWorkspaceId,
    retry: false,
    gcTime: 0,
  })

  useEffect(() => {
    if (!isAdminPreview && tenantClientsQuery.error) {
      toast.error(tenantClientsQuery.error instanceof Error ? tenantClientsQuery.error.message : 'Unable to load clients.')
    }
  }, [isAdminPreview, tenantClientsQuery.error])

  const effectiveWorkspace = isAdminPreview
    ? previewQuery.data?.workspace || null
    : workspace
  const workspaceId = effectiveWorkspace?.id || ''
  const clients = isAdminPreview
    ? previewQuery.data?.clients || []
    : tenantClientsQuery.data || []
  const clientsLoading = isAdminPreview
    ? validPreviewWorkspaceId && previewQuery.isLoading
    : tenantClientsQuery.isLoading
  const clientsError = isAdminPreview
    ? !validPreviewWorkspaceId
      ? new Error('The workspace address is invalid.')
      : previewQuery.error
    : tenantClientsQuery.error
  const refetchClients = isAdminPreview ? previewQuery.refetch : tenantClientsQuery.refetch
  const managementEnabled = !isAdminPreview && canWriteClients
  const showManagementControls = isAdminPreview || managementEnabled

  const saveMutation = useMutation({
    mutationFn: async () => {
      if (isAdminPreview) throw new Error('Changes are disabled in administrator preview.')
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
      if (isAdminPreview) throw new Error('Changes are disabled in administrator preview.')
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
    if (!managementEnabled) return
    setEditing(null)
    setForm(emptyClient)
    setDialogOpen(true)
  }

  const openEdit = (client: WorkspaceClient) => {
    if (!managementEnabled) return
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

  if (!isAdminPreview && !workspace) {
    return (
      <WorkspaceLayout>
        <Card><CardHeader><CardTitle>Workspace unavailable</CardTitle><CardDescription>Your account does not have an active workspace.</CardDescription></CardHeader></Card>
      </WorkspaceLayout>
    )
  }

  const previewLayout = isAdminPreview
    ? {
        workspaceName: effectiveWorkspace?.name || 'Client workspace',
        viewerEmail: previewQuery.data?.viewer.email || 'Workspace owner',
        viewerRole: previewQuery.data?.viewer.role || 'owner',
        clientsHref: `/admin/workspaces/${previewWorkspaceId}/clients`,
        exitHref: '/admin/users',
      }
    : undefined

  return (
    <WorkspaceLayout preview={previewLayout}>
      <div className="space-y-6">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-3xl font-bold tracking-tight">Clients</h1>
            <p className="text-muted-foreground">Clients in {effectiveWorkspace?.name || 'this workspace'}</p>
            {isAdminPreview && (
              <p className="mt-1 text-sm text-amber-800 dark:text-amber-300" aria-describedby="admin-preview-context">
                Read-only preview: workspace controls are shown but cannot make changes.
              </p>
            )}
          </div>
          {showManagementControls && (
            <Button
              onClick={openCreate}
              disabled={!managementEnabled}
              aria-describedby={isAdminPreview ? 'admin-preview-context' : undefined}
            >
              <Plus className="mr-2 h-4 w-4" />Add client
            </Button>
          )}
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2"><Users className="h-5 w-5" />Your clients</CardTitle>
            <CardDescription>Only members of this workspace can access these records.</CardDescription>
          </CardHeader>
          <CardContent>
            {clientsLoading ? (
              <div className="flex min-h-40 items-center justify-center"><Loader2 className="h-7 w-7 animate-spin text-primary" /></div>
            ) : clientsError ? (
              <div className="flex min-h-40 flex-col items-center justify-center gap-3 text-center">
                <p className="font-medium text-destructive">Clients could not be loaded</p>
                <p className="max-w-md text-sm text-muted-foreground">
                  {clientsError instanceof Error ? clientsError.message : 'Check your connection and try again.'}
                </p>
                {validPreviewWorkspaceId || !isAdminPreview ? (
                  <Button variant="outline" onClick={() => void refetchClients()}>Try again</Button>
                ) : null}
              </div>
            ) : clients.length === 0 ? (
              <div className="flex min-h-40 flex-col items-center justify-center gap-3 text-center">
                <Users className="h-10 w-10 text-muted-foreground" />
                <div><p className="font-medium">No clients yet</p><p className="text-sm text-muted-foreground">Add your first client to begin.</p></div>
                {showManagementControls && (
                  <Button
                    onClick={openCreate}
                    variant="outline"
                    disabled={!managementEnabled}
                    aria-describedby={isAdminPreview ? 'admin-preview-context' : undefined}
                  >
                    <Plus className="mr-2 h-4 w-4" />Add client
                  </Button>
                )}
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
                          {showManagementControls && (
                            <div className="inline-flex gap-1">
                              <Button
                                size="icon"
                                variant="ghost"
                                onClick={() => openEdit(client)}
                                aria-label={`Edit ${client.name}`}
                                disabled={!managementEnabled}
                                aria-describedby={isAdminPreview ? 'admin-preview-context' : undefined}
                              >
                                <Pencil className="h-4 w-4" />
                              </Button>
                              <Button
                                size="icon"
                                variant="ghost"
                                className="text-destructive"
                                onClick={() => managementEnabled && setDeleting(client)}
                                aria-label={`Remove ${client.name}`}
                                disabled={!managementEnabled}
                                aria-describedby={isAdminPreview ? 'admin-preview-context' : undefined}
                              >
                                <Trash2 className="h-4 w-4" />
                              </Button>
                            </div>
                          )}
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

      {!isAdminPreview && <Dialog open={dialogOpen} onOpenChange={(open) => { setDialogOpen(open); if (!open) setEditing(null) }}>
        <DialogContent className="max-w-xl">
          <DialogHeader><DialogTitle>{editing ? 'Edit client' : 'Add client'}</DialogTitle><DialogDescription>{editing ? 'Update this client inside your private workspace.' : 'Create a client visible only inside your private workspace.'}</DialogDescription></DialogHeader>
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
      </Dialog>}

      {!isAdminPreview && <Dialog open={Boolean(deleting)} onOpenChange={(open) => { if (!open) setDeleting(null) }}>
        <DialogContent>
          <DialogHeader><DialogTitle>Remove client?</DialogTitle><DialogDescription>This permanently removes {deleting?.name} and may remove connected records. This action cannot be undone.</DialogDescription></DialogHeader>
          <DialogFooter><Button variant="outline" onClick={() => setDeleting(null)}>Cancel</Button><Button variant="destructive" disabled={deleteMutation.isPending} onClick={() => deleting && deleteMutation.mutate(deleting)}>{deleteMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Remove client</Button></DialogFooter>
        </DialogContent>
      </Dialog>}
    </WorkspaceLayout>
  )
}

export default WorkspaceClients
