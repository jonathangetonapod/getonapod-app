import { useEffect, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { BookOpen, Eye, Loader2, Pencil, Plus, Trash2 } from 'lucide-react'
import { toast } from 'sonner'
import { WorkspaceLayout } from '@/components/workspace/WorkspaceLayout'
import { GuestResourceEditor } from '@/components/GuestResourceEditor'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Checkbox } from '@/components/ui/checkbox'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Textarea } from '@/components/ui/textarea'
import { useAuth } from '@/contexts/AuthContext'
import { getAdminWorkspaceView, type AdminWorkspaceView } from '@/services/adminWorkspaces'
import { hasMeaningfulGuestResourceContent } from '@/lib/guestResourceContent'
import { sanitizePortalResourceContent } from '@/lib/portalResourceContent'
import { getWorkspaceClients, type WorkspaceClient } from '@/services/clients'
import type { ResourceCategory, ResourceType } from '@/services/guestResources'
import {
  createWorkspaceGuestResource,
  deleteWorkspaceGuestResource,
  listWorkspaceGuestResources,
  updateWorkspaceGuestResource,
  type WorkspaceGuestResource,
  type WorkspaceGuestResourceInput,
} from '@/services/workspaceGuestResources'

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

const categoryLabels: Record<ResourceCategory, string> = {
  preparation: 'Preparation',
  technical_setup: 'Technical setup',
  best_practices: 'Best practices',
  promotion: 'Promotion',
  examples: 'Examples',
  templates: 'Templates',
}

const typeLabels: Record<ResourceType, string> = {
  article: 'Article',
  video: 'Video',
  download: 'Download',
  link: 'External link',
}

const emptyResource: WorkspaceGuestResourceInput = {
  title: '',
  description: '',
  content: '',
  category: 'preparation',
  type: 'article',
  url: '',
  file_url: '',
  featured: false,
  display_order: 0,
  status: 'draft',
  visibility: 'all_clients',
  client_ids: [],
}

interface WorkspaceGuestResourcesProps {
  adminPreviewWorkspaceId?: string
}

interface ResourcePageData {
  resources: WorkspaceGuestResource[]
  clients: WorkspaceClient[]
}

interface PreviewResourcePageData extends ResourcePageData {
  view: AdminWorkspaceView
}

function validateAssignments(
  workspaceId: string,
  clients: WorkspaceClient[],
  resources: WorkspaceGuestResource[],
): ResourcePageData {
  if (
    clients.some((client) => client.workspace_id !== workspaceId)
    || resources.some((resource) => resource.workspace_id !== workspaceId)
  ) {
    throw new Error('The guest resources response did not match the selected workspace.')
  }

  const clientIds = new Set(clients.map((client) => client.id))
  if (resources.some((resource) => resource.client_ids.some((clientId) => !clientIds.has(clientId)))) {
    throw new Error('The guest resources response included an invalid client assignment.')
  }
  return { clients, resources }
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

const WorkspaceGuestResources = ({ adminPreviewWorkspaceId }: WorkspaceGuestResourcesProps) => {
  const { canWriteClients, user, workspace } = useAuth()
  const queryClient = useQueryClient()
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editing, setEditing] = useState<WorkspaceGuestResource | null>(null)
  const [deleting, setDeleting] = useState<WorkspaceGuestResource | null>(null)
  const [viewing, setViewing] = useState<WorkspaceGuestResource | null>(null)
  const [form, setForm] = useState<WorkspaceGuestResourceInput>(emptyResource)
  const isAdminPreview = adminPreviewWorkspaceId !== undefined
  const previewWorkspaceId = (adminPreviewWorkspaceId || '').toLowerCase()
  const validPreviewWorkspaceId = UUID_PATTERN.test(previewWorkspaceId)
  const tenantWorkspaceId = workspace?.id || ''
  const tenantQueryKey = ['tenant', user?.id || 'unknown', tenantWorkspaceId, 'guest-resources'] as const

  const tenantQuery = useQuery({
    queryKey: tenantQueryKey,
    queryFn: async () => {
      const [resources, clients] = await Promise.all([
        listWorkspaceGuestResources(tenantWorkspaceId),
        getWorkspaceClients(tenantWorkspaceId),
      ])
      return validateAssignments(tenantWorkspaceId, clients, resources)
    },
    enabled: !isAdminPreview && Boolean(tenantWorkspaceId),
  })

  const previewQuery = useQuery({
    queryKey: ['platform', user?.id || 'unknown', 'workspace-preview', previewWorkspaceId, 'guest-resources'],
    queryFn: async ({ signal }): Promise<PreviewResourcePageData> => {
      const [view, resources] = await Promise.all([
        getAdminWorkspaceView(previewWorkspaceId, signal),
        listWorkspaceGuestResources(previewWorkspaceId),
      ])
      const validView = validatePreviewView(view, previewWorkspaceId)
      return {
        view: validView,
        ...validateAssignments(previewWorkspaceId, validView.clients, resources),
      }
    },
    enabled: isAdminPreview && validPreviewWorkspaceId,
    retry: false,
    gcTime: 0,
  })

  useEffect(() => {
    if (!isAdminPreview && tenantQuery.error) {
      toast.error(tenantQuery.error instanceof Error ? tenantQuery.error.message : 'Unable to load guest resources.')
    }
  }, [isAdminPreview, tenantQuery.error])

  const effectiveWorkspace = isAdminPreview ? previewQuery.data?.view.workspace || null : workspace
  const workspaceId = effectiveWorkspace?.id || ''
  const resources = isAdminPreview ? previewQuery.data?.resources || [] : tenantQuery.data?.resources || []
  const clients = isAdminPreview ? previewQuery.data?.clients || [] : tenantQuery.data?.clients || []
  const resourcesLoading = isAdminPreview
    ? validPreviewWorkspaceId && previewQuery.isLoading
    : tenantQuery.isLoading
  const resourcesError = isAdminPreview
    ? !validPreviewWorkspaceId
      ? new Error('The workspace address is invalid.')
      : previewQuery.error
    : tenantQuery.error
  const refetchResources = isAdminPreview ? previewQuery.refetch : tenantQuery.refetch
  const managementEnabled = !isAdminPreview && canWriteClients
  const showManagementControls = isAdminPreview || managementEnabled
  const clientById = new Map(clients.map((client) => [client.id, client]))
  const resourceUrlRequired = form.status === 'published' && (form.type === 'video' || form.type === 'link')
  const fileUrlRequired = form.status === 'published' && form.type === 'download'
  const articleContentRequired = form.status === 'published' && form.type === 'article'

  const saveMutation = useMutation({
    mutationFn: async () => {
      if (isAdminPreview) throw new Error('Changes are disabled in administrator preview.')
      if (!managementEnabled) throw new Error('Workspace manager access is required.')
      if (!workspaceId) throw new Error('Workspace is unavailable.')
      return editing
        ? updateWorkspaceGuestResource(workspaceId, editing.id, form)
        : createWorkspaceGuestResource(workspaceId, form)
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: tenantQueryKey })
      setDialogOpen(false)
      setEditing(null)
      setForm(emptyResource)
      toast.success(editing ? 'Guest resource updated.' : 'Guest resource created.')
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : 'Unable to save guest resource.'),
  })

  const deleteMutation = useMutation({
    mutationFn: async (resource: WorkspaceGuestResource) => {
      if (isAdminPreview) throw new Error('Changes are disabled in administrator preview.')
      if (!managementEnabled) throw new Error('Workspace manager access is required.')
      if (!workspaceId) throw new Error('Workspace is unavailable.')
      await deleteWorkspaceGuestResource(workspaceId, resource.id)
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: tenantQueryKey })
      setDeleting(null)
      toast.success('Guest resource deleted.')
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : 'Unable to delete guest resource.'),
  })

  const openCreate = () => {
    if (!managementEnabled) return
    setEditing(null)
    setForm(emptyResource)
    setDialogOpen(true)
  }

  const openEdit = (resource: WorkspaceGuestResource) => {
    if (!managementEnabled) return
    setEditing(resource)
    setForm({
      title: resource.title,
      description: resource.description,
      content: resource.content || '',
      category: resource.category,
      type: resource.type,
      url: resource.url || '',
      file_url: resource.file_url || '',
      featured: resource.featured,
      display_order: resource.display_order,
      status: resource.status,
      visibility: resource.visibility,
      client_ids: [...resource.client_ids],
    })
    setDialogOpen(true)
  }

  const toggleClient = (clientId: string, checked: boolean) => {
    setForm((current) => ({
      ...current,
      client_ids: checked
        ? [...new Set([...current.client_ids, clientId])]
        : current.client_ids.filter((id) => id !== clientId),
    }))
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
        viewerEmail: previewQuery.data?.view.viewer.email || 'Workspace owner',
        viewerRole: previewQuery.data?.view.viewer.role || 'owner' as const,
        clientsHref: `/admin/workspaces/${previewWorkspaceId}/clients`,
        guestResourcesHref: `/admin/workspaces/${previewWorkspaceId}/guest-resources`,
        exitHref: '/admin/users',
      }
    : undefined

  return (
    <WorkspaceLayout preview={previewLayout}>
      <div className="space-y-6">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-3xl font-bold tracking-tight">Guest Resources</h1>
            <p className="text-muted-foreground">Resources for clients in {effectiveWorkspace?.name || 'this workspace'}</p>
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
              <Plus className="mr-2 h-4 w-4" />Add resource
            </Button>
          )}
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2"><BookOpen className="h-5 w-5" />Workspace resources</CardTitle>
            <CardDescription>Publish to every client or assign a resource to selected clients only.</CardDescription>
          </CardHeader>
          <CardContent>
            {resourcesLoading ? (
              <div className="flex min-h-40 items-center justify-center"><Loader2 className="h-7 w-7 animate-spin text-primary" /></div>
            ) : resourcesError ? (
              <div className="flex min-h-40 flex-col items-center justify-center gap-3 text-center">
                <p className="font-medium text-destructive">Guest resources could not be loaded</p>
                <p className="max-w-md text-sm text-muted-foreground">
                  {resourcesError instanceof Error ? resourcesError.message : 'Check your connection and try again.'}
                </p>
                {validPreviewWorkspaceId || !isAdminPreview ? (
                  <Button variant="outline" onClick={() => void refetchResources()}>Try again</Button>
                ) : null}
              </div>
            ) : resources.length === 0 ? (
              <div className="flex min-h-40 flex-col items-center justify-center gap-3 text-center">
                <BookOpen className="h-10 w-10 text-muted-foreground" />
                <div><p className="font-medium">No guest resources yet</p><p className="text-sm text-muted-foreground">Create a draft or publish your first client resource.</p></div>
                {showManagementControls && (
                  <Button
                    onClick={openCreate}
                    variant="outline"
                    disabled={!managementEnabled}
                    aria-describedby={isAdminPreview ? 'admin-preview-context' : undefined}
                  >
                    <Plus className="mr-2 h-4 w-4" />Add resource
                  </Button>
                )}
              </div>
            ) : (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Resource</TableHead>
                      <TableHead>Type</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Visibility</TableHead>
                      <TableHead>Order</TableHead>
                      <TableHead className="text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {resources.map((resource) => {
                      const assignedClients = resource.client_ids
                        .map((clientId) => clientById.get(clientId))
                        .filter((client): client is WorkspaceClient => Boolean(client))
                      const assignedSummary = assignedClients
                        .map((client) => `${client.name}${client.email ? ` (${client.email})` : ''}`)
                        .join(', ')
                      return (
                        <TableRow key={resource.id}>
                          <TableCell>
                            <div className="flex items-center gap-2">
                              <p className="font-medium">{resource.title}</p>
                              {resource.featured && <Badge variant="secondary">Featured</Badge>}
                            </div>
                            <p className="max-w-sm truncate text-xs text-muted-foreground">{resource.description}</p>
                          </TableCell>
                          <TableCell><p>{typeLabels[resource.type]}</p><p className="text-xs text-muted-foreground">{categoryLabels[resource.category]}</p></TableCell>
                          <TableCell><Badge variant={resource.status === 'published' ? 'default' : resource.status === 'archived' ? 'secondary' : 'outline'} className="capitalize">{resource.status}</Badge></TableCell>
                          <TableCell>
                            {resource.visibility === 'all_clients'
                              ? 'All clients'
                              : (
                                <div>
                                  <p>{assignedClients.length} selected client{assignedClients.length === 1 ? '' : 's'}</p>
                                  <p className="max-w-xs truncate text-xs text-muted-foreground" title={assignedSummary || undefined}>
                                    {assignedSummary || 'No clients currently assigned'}
                                  </p>
                                </div>
                              )}
                          </TableCell>
                          <TableCell>{resource.display_order}</TableCell>
                          <TableCell className="text-right">
                            {showManagementControls && (
                              <div className="inline-flex gap-1">
                                {isAdminPreview && (
                                  <Button
                                    size="icon"
                                    variant="ghost"
                                    onClick={() => setViewing(resource)}
                                    aria-label={`View ${resource.title}`}
                                  >
                                    <Eye className="h-4 w-4" />
                                  </Button>
                                )}
                                <Button
                                  size="icon"
                                  variant="ghost"
                                  onClick={() => openEdit(resource)}
                                  aria-label={`Edit ${resource.title}`}
                                  disabled={!managementEnabled}
                                  aria-describedby={isAdminPreview ? 'admin-preview-context' : undefined}
                                >
                                  <Pencil className="h-4 w-4" />
                                </Button>
                                <Button
                                  size="icon"
                                  variant="ghost"
                                  className="text-destructive"
                                  onClick={() => managementEnabled && setDeleting(resource)}
                                  aria-label={`Delete ${resource.title}`}
                                  disabled={!managementEnabled}
                                  aria-describedby={isAdminPreview ? 'admin-preview-context' : undefined}
                                >
                                  <Trash2 className="h-4 w-4" />
                                </Button>
                              </div>
                            )}
                          </TableCell>
                        </TableRow>
                      )
                    })}
                  </TableBody>
                </Table>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {!isAdminPreview && (
        <Dialog open={dialogOpen} onOpenChange={(open) => { setDialogOpen(open); if (!open) setEditing(null) }}>
          <DialogContent className="max-h-[90vh] max-w-3xl overflow-y-auto">
            <DialogHeader>
              <DialogTitle>{editing ? 'Edit guest resource' : 'Add guest resource'}</DialogTitle>
              <DialogDescription>Control what is published and which workspace clients can access it.</DialogDescription>
            </DialogHeader>
            <form className="space-y-5" onSubmit={(event) => {
              event.preventDefault()
              if (articleContentRequired && !hasMeaningfulGuestResourceContent(form.content)) {
                toast.error('Published article resources require meaningful content.')
                return
              }
              saveMutation.mutate()
            }}>
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2 sm:col-span-2"><Label htmlFor="resource-title">Title</Label><Input id="resource-title" required maxLength={200} value={form.title} onChange={(event) => setForm({ ...form, title: event.target.value })} /></div>
                <div className="space-y-2 sm:col-span-2"><Label htmlFor="resource-description">Description</Label><Textarea id="resource-description" required maxLength={2000} value={form.description} onChange={(event) => setForm({ ...form, description: event.target.value })} /></div>
                {form.type === 'article' && (
                  <div className="space-y-2 sm:col-span-2">
                    <Label>Content{articleContentRequired ? ' *' : ''}</Label>
                    <GuestResourceEditor
                      content={form.content || ''}
                      onChange={(content) => setForm((current) => ({ ...current, content }))}
                      category={form.category}
                      placeholder="Write the resource your clients will see..."
                      allowAI={false}
                      allowImages={false}
                    />
                    <p className="text-xs text-muted-foreground">
                      Safe rich-text formatting and links are supported. Images, forms, embeds, and custom styles are not shown in the client portal.
                      {articleContentRequired ? ' Meaningful content is required before publishing.' : ''}
                    </p>
                  </div>
                )}
                <div className="space-y-2"><Label>Category</Label><Select value={form.category} onValueChange={(value: ResourceCategory) => setForm({ ...form, category: value })}><SelectTrigger aria-label="Category"><SelectValue /></SelectTrigger><SelectContent>{Object.entries(categoryLabels).map(([value, label]) => <SelectItem key={value} value={value}>{label}</SelectItem>)}</SelectContent></Select></div>
                <div className="space-y-2"><Label>Type</Label><Select value={form.type} onValueChange={(value: ResourceType) => setForm({ ...form, type: value, content: value === 'article' ? form.content : '' })}><SelectTrigger aria-label="Type"><SelectValue /></SelectTrigger><SelectContent>{Object.entries(typeLabels).map(([value, label]) => <SelectItem key={value} value={value}>{label}</SelectItem>)}</SelectContent></Select></div>
                <div className="space-y-2"><Label htmlFor="resource-url">Resource URL{resourceUrlRequired ? ' *' : ''}</Label><Input id="resource-url" type="url" required={resourceUrlRequired} maxLength={2048} value={form.url || ''} onChange={(event) => setForm({ ...form, url: event.target.value })} /></div>
                <div className="space-y-2"><Label htmlFor="resource-file-url">File URL{fileUrlRequired ? ' *' : ''}</Label><Input id="resource-file-url" type="url" required={fileUrlRequired} maxLength={2048} value={form.file_url || ''} onChange={(event) => setForm({ ...form, file_url: event.target.value })} /></div>
                <div className="space-y-2"><Label>Status</Label><Select value={form.status} onValueChange={(value: WorkspaceGuestResourceInput['status']) => setForm({ ...form, status: value })}><SelectTrigger aria-label="Status"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="draft">Draft</SelectItem><SelectItem value="published">Published</SelectItem><SelectItem value="archived">Archived</SelectItem></SelectContent></Select></div>
                <div className="space-y-2"><Label>Visibility</Label><Select value={form.visibility} onValueChange={(value: WorkspaceGuestResourceInput['visibility']) => setForm({ ...form, visibility: value, client_ids: value === 'all_clients' ? [] : form.client_ids })}><SelectTrigger aria-label="Visibility"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="all_clients">All clients</SelectItem><SelectItem value="selected_clients">Selected clients</SelectItem></SelectContent></Select></div>
                <div className="space-y-2"><Label htmlFor="resource-display-order">Display order</Label><Input id="resource-display-order" type="number" min={0} max={1000000} step={1} value={form.display_order} onChange={(event) => setForm({ ...form, display_order: Number(event.target.value) })} /></div>
                <div className="flex items-center gap-2 pt-7"><Checkbox id="resource-featured" checked={form.featured} onCheckedChange={(checked) => setForm({ ...form, featured: checked === true })} /><Label htmlFor="resource-featured">Featured resource</Label></div>
              </div>

              {form.visibility === 'selected_clients' && (
                <fieldset className="space-y-3 rounded-md border p-4">
                  <legend className="px-1 text-sm font-medium">Assigned clients</legend>
                  {clients.length === 0 ? (
                    <p className="text-sm text-muted-foreground">Add a workspace client before using selected-client visibility.</p>
                  ) : (
                    <div className="grid gap-3 sm:grid-cols-2">
                      {clients.map((client) => (
                        <div key={client.id} className="flex items-start gap-2">
                          <Checkbox id={`resource-client-${client.id}`} checked={form.client_ids.includes(client.id)} onCheckedChange={(checked) => toggleClient(client.id, checked === true)} />
                          <Label htmlFor={`resource-client-${client.id}`} className="leading-4">
                            <span className="block">{client.name}</span>
                            <span className="block text-xs font-normal text-muted-foreground">
                              {client.email || 'No email'} · {client.status}
                            </span>
                          </Label>
                        </div>
                      ))}
                    </div>
                  )}
                  <p className="text-xs text-muted-foreground" aria-live="polite">
                    {form.client_ids.length} client{form.client_ids.length === 1 ? '' : 's'} selected.
                  </p>
                </fieldset>
              )}

              <DialogFooter>
                <Button type="button" variant="outline" onClick={() => setDialogOpen(false)}>Cancel</Button>
                <Button type="submit" disabled={saveMutation.isPending}>
                  {saveMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  {editing ? 'Save changes' : 'Add resource'}
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
      )}

      {isAdminPreview && (
        <Dialog open={Boolean(viewing)} onOpenChange={(open) => { if (!open) setViewing(null) }}>
          <DialogContent className="max-h-[90vh] max-w-3xl overflow-y-auto">
            <DialogHeader>
              <DialogTitle>{viewing?.title || 'Guest resource details'}</DialogTitle>
              <DialogDescription>{viewing?.description}</DialogDescription>
            </DialogHeader>
            {viewing && (
              <div className="space-y-5">
                <div className="flex flex-wrap gap-2">
                  <Badge>{viewing.status}</Badge>
                  <Badge variant="outline">{typeLabels[viewing.type]}</Badge>
                  <Badge variant="outline">{categoryLabels[viewing.category]}</Badge>
                  {viewing.featured && <Badge variant="secondary">Featured</Badge>}
                </div>
                <dl className="grid gap-4 text-sm sm:grid-cols-2">
                  <div><dt className="font-medium">Display order</dt><dd className="text-muted-foreground">{viewing.display_order}</dd></div>
                  <div>
                    <dt className="font-medium">Audience</dt>
                    <dd className="text-muted-foreground">
                      {viewing.visibility === 'all_clients'
                        ? 'All clients'
                        : `${viewing.client_ids.length} selected client${viewing.client_ids.length === 1 ? '' : 's'}`}
                    </dd>
                  </div>
                  {viewing.url && <div className="sm:col-span-2"><dt className="font-medium">Resource URL</dt><dd className="break-all text-muted-foreground">{viewing.url}</dd></div>}
                  {viewing.file_url && <div className="sm:col-span-2"><dt className="font-medium">File URL</dt><dd className="break-all text-muted-foreground">{viewing.file_url}</dd></div>}
                </dl>
                {viewing.visibility === 'selected_clients' && (
                  <div>
                    <h3 className="font-medium">Assigned clients</h3>
                    {viewing.client_ids.length === 0 ? (
                      <p className="mt-1 text-sm text-muted-foreground">No clients currently assigned.</p>
                    ) : (
                      <ul className="mt-2 space-y-2 text-sm">
                        {viewing.client_ids.map((clientId) => {
                          const client = clientById.get(clientId)
                          return (
                            <li key={clientId} className="rounded-md border p-3">
                              <p className="font-medium">{client?.name || 'Unknown client'}</p>
                              <p className="text-muted-foreground">{client?.email || 'No email'} · {client?.status || 'unavailable'}</p>
                            </li>
                          )
                        })}
                      </ul>
                    )}
                  </div>
                )}
                <div>
                  <h3 className="font-medium">Client-facing content</h3>
                  {viewing.content ? (
                    <div
                      className="prose prose-sm mt-2 max-w-none rounded-md border p-4"
                      dangerouslySetInnerHTML={{ __html: sanitizePortalResourceContent(viewing.content) }}
                    />
                  ) : (
                    <p className="mt-1 text-sm text-muted-foreground">No long-form content.</p>
                  )}
                </div>
              </div>
            )}
            <DialogFooter><Button type="button" variant="outline" onClick={() => setViewing(null)}>Close</Button></DialogFooter>
          </DialogContent>
        </Dialog>
      )}

      {!isAdminPreview && (
        <Dialog open={Boolean(deleting)} onOpenChange={(open) => { if (!open) setDeleting(null) }}>
          <DialogContent>
            <DialogHeader><DialogTitle>Delete guest resource?</DialogTitle><DialogDescription>This permanently deletes {deleting?.title}. This action cannot be undone.</DialogDescription></DialogHeader>
            <DialogFooter><Button variant="outline" onClick={() => setDeleting(null)}>Cancel</Button><Button variant="destructive" disabled={deleteMutation.isPending} onClick={() => deleting && deleteMutation.mutate(deleting)}>{deleteMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Delete resource</Button></DialogFooter>
          </DialogContent>
        </Dialog>
      )}
    </WorkspaceLayout>
  )
}

export default WorkspaceGuestResources
