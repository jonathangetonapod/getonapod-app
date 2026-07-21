import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { DashboardLayout } from '@/components/admin/DashboardLayout'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { GuestResourceEditor } from '@/components/GuestResourceEditor'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Checkbox } from '@/components/ui/checkbox'
import {
  Plus,
  Edit,
  Trash2,
  Loader2,
  BookOpen,
  Video,
  Download,
  ExternalLink,
  Star,
  FileText,
  Mic,
  TrendingUp,
  Share2,
} from 'lucide-react'
import { toast } from 'sonner'
import { safeExternalUrl } from '@/lib/externalUrl'
import { hasMeaningfulGuestResourceContent } from '@/lib/guestResourceContent'
import {
  getGuestResources,
  createGuestResource,
  updateGuestResource,
  deleteGuestResource,
  type GuestResource,
  type GuestResourceCreateInput,
  type GuestResourceUpdateInput,
  type ResourceType,
  type ResourceCategory,
} from '@/services/guestResources'

const categoryInfo = {
  preparation: { label: 'Preparation', icon: BookOpen },
  technical_setup: { label: 'Technical Setup', icon: Mic },
  best_practices: { label: 'Best Practices', icon: Star },
  promotion: { label: 'Promotion', icon: TrendingUp },
  examples: { label: 'Examples', icon: Video },
  templates: { label: 'Templates', icon: FileText },
}

const typeInfo = {
  article: { label: 'Article', icon: FileText },
  video: { label: 'Video', icon: Video },
  download: { label: 'Download', icon: Download },
  link: { label: 'External Link', icon: ExternalLink },
}

interface GuestResourceFormData {
  title: string
  description: string
  content: string
  category: ResourceCategory
  type: ResourceType
  url: string
  file_url: string
  featured: boolean
  display_order: number
}

export default function GuestResourcesManagement() {
  const [editingResource, setEditingResource] = useState<GuestResource | null>(null)
  const [deletingResource, setDeletingResource] = useState<GuestResource | null>(null)
  const [showCreateDialog, setShowCreateDialog] = useState(false)
  const [formData, setFormData] = useState<GuestResourceFormData>({
    title: '',
    description: '',
    content: '',
    category: 'preparation' as ResourceCategory,
    type: 'article' as ResourceType,
    url: '',
    file_url: '',
    featured: false,
    display_order: 0,
  })

  const queryClient = useQueryClient()
  const resourceUrlRequired = formData.type === 'video' || formData.type === 'link'
  const fileUrlRequired = formData.type === 'download'

  // Fetch resources
  const { data: resources, isLoading } = useQuery({
    queryKey: ['admin-guest-resources'],
    queryFn: () => getGuestResources(),
  })

  // Create mutation
  const createMutation = useMutation({
    mutationFn: createGuestResource,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-guest-resources'] })
      toast.success('Resource created successfully')
      setShowCreateDialog(false)
      resetForm()
    },
    onError: (error: unknown) => {
      toast.error(`Failed to create resource: ${error instanceof Error ? error.message : 'Unknown error'}`)
    },
  })

  // Update mutation
  const updateMutation = useMutation({
    mutationFn: ({ id, updates }: { id: string; updates: GuestResourceUpdateInput }) =>
      updateGuestResource(id, updates),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-guest-resources'] })
      toast.success('Resource updated successfully')
      setEditingResource(null)
      resetForm()
    },
    onError: (error: unknown) => {
      toast.error(`Failed to update resource: ${error instanceof Error ? error.message : 'Unknown error'}`)
    },
  })

  // Delete mutation
  const deleteMutation = useMutation({
    mutationFn: deleteGuestResource,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-guest-resources'] })
      toast.success('Resource deleted successfully')
      setDeletingResource(null)
    },
    onError: (error: unknown) => {
      toast.error(`Failed to delete resource: ${error instanceof Error ? error.message : 'Unknown error'}`)
    },
  })

  const resetForm = () => {
    setFormData({
      title: '',
      description: '',
      content: '',
      category: 'preparation',
      type: 'article',
      url: '',
      file_url: '',
      featured: false,
      display_order: 0,
    })
  }

  const handleCreate = () => {
    setShowCreateDialog(true)
    resetForm()
  }

  const handleEdit = (resource: GuestResource) => {
    setEditingResource(resource)
    setFormData({
      title: resource.title,
      description: resource.description,
      content: resource.content || '',
      category: resource.category,
      type: resource.type,
      url: resource.url || '',
      file_url: resource.file_url || '',
      featured: resource.featured,
      display_order: resource.display_order,
    })
  }

  const handleSave = () => {
    const title = formData.title.trim()
    const description = formData.description.trim()
    const content = formData.content.trim()

    if (!title || !description) {
      toast.error('Title and description are required')
      return
    }
    if (title.length > 200) {
      toast.error('Title must be 200 characters or fewer')
      return
    }
    if (description.length > 2_000) {
      toast.error('Description must be 2,000 characters or fewer')
      return
    }
    if (content.length > 100_000) {
      toast.error('Content must be 100,000 characters or fewer')
      return
    }
    if (formData.type === 'article' && !hasMeaningfulGuestResourceContent(content)) {
      toast.error('Article templates require meaningful content')
      return
    }
    if (
      !Number.isSafeInteger(formData.display_order)
      || formData.display_order < 0
      || formData.display_order > 1_000_000
    ) {
      toast.error('Display order must be an integer between 0 and 1,000,000')
      return
    }

    const resourceUrlInput = formData.url.trim()
    const fileUrlInput = formData.file_url.trim()
    if (resourceUrlInput.length > 2_048 || fileUrlInput.length > 2_048) {
      toast.error('Resource URLs must be 2,048 characters or fewer')
      return
    }
    const resourceUrl = resourceUrlInput ? safeExternalUrl(resourceUrlInput) : null
    const fileUrl = fileUrlInput ? safeExternalUrl(fileUrlInput) : null

    if (resourceUrlInput && !resourceUrl) {
      toast.error('Resource URL must be a safe HTTP or HTTPS URL without credentials')
      return
    }
    if (fileUrlInput && !fileUrl) {
      toast.error('File URL must be a safe HTTP or HTTPS URL without credentials')
      return
    }
    if (resourceUrlRequired && !resourceUrl) {
      toast.error('Video and link templates require a resource URL')
      return
    }
    if (fileUrlRequired && !fileUrl) {
      toast.error('Download templates require a file URL')
      return
    }

    const normalizedFormData: GuestResourceCreateInput = {
      title,
      description,
      content: content || null,
      category: formData.category,
      type: formData.type,
      url: resourceUrl,
      file_url: fileUrl,
      featured: formData.featured,
      display_order: formData.display_order,
    }

    if (editingResource) {
      updateMutation.mutate({
        id: editingResource.id,
        updates: normalizedFormData,
      })
    } else {
      createMutation.mutate(normalizedFormData)
    }
  }

  const handleDelete = (resource: GuestResource) => {
    setDeletingResource(resource)
  }

  const confirmDelete = () => {
    if (deletingResource) {
      deleteMutation.mutate(deletingResource.id)
    }
  }

  if (isLoading) {
    return (
      <DashboardLayout>
        <div className="flex items-center justify-center h-96">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      </DashboardLayout>
    )
  }

  return (
    <DashboardLayout>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold">Platform Resource Templates</h1>
            <p className="text-muted-foreground mt-2">
              Manage GOAP's public/default catalog and the starter content copied into new private workspaces. Existing workspace copies are never overwritten.
            </p>
          </div>
          <Button onClick={handleCreate}>
            <Plus className="h-4 w-4 mr-2" />
            Add Resource
          </Button>
        </div>

        {/* Resources Table */}
        <Card>
          <CardHeader>
            <CardTitle>All Resources ({resources?.length || 0})</CardTitle>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Title</TableHead>
                  <TableHead>Category</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Featured</TableHead>
                  <TableHead>Order</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {resources?.map((resource) => {
                  const CategoryIcon = categoryInfo[resource.category].icon
                  const TypeIcon = typeInfo[resource.type].icon

                  return (
                    <TableRow key={resource.id}>
                      <TableCell className="font-medium">{resource.title}</TableCell>
                      <TableCell>
                        <Badge variant="outline">
                          <CategoryIcon className="h-3 w-3 mr-1" />
                          {categoryInfo[resource.category].label}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <Badge variant="secondary">
                          <TypeIcon className="h-3 w-3 mr-1" />
                          {typeInfo[resource.type].label}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        {resource.featured && (
                          <Star className="h-4 w-4 text-amber-500 fill-current" />
                        )}
                      </TableCell>
                      <TableCell>{resource.display_order}</TableCell>
                      <TableCell className="text-right">
                        <div className="flex gap-2 justify-end">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleEdit(resource)}
                            aria-label={`Edit ${resource.title}`}
                          >
                            <Edit className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleDelete(resource)}
                            aria-label={`Delete ${resource.title}`}
                            className="text-destructive hover:text-destructive"
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  )
                })}
              </TableBody>
            </Table>

            {(!resources || resources.length === 0) && (
              <div className="text-center py-12">
                <BookOpen className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
                <h3 className="text-lg font-semibold mb-2">No resources yet</h3>
                <p className="text-muted-foreground mb-4">
                  Get started by creating your first guest resource
                </p>
                <Button onClick={handleCreate}>
                  <Plus className="h-4 w-4 mr-2" />
                  Add Resource
                </Button>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Create/Edit Dialog */}
      <Dialog
        open={showCreateDialog || !!editingResource}
        onOpenChange={(open) => {
          if (!open) {
            setShowCreateDialog(false)
            setEditingResource(null)
            resetForm()
          }
        }}
      >
        <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              {editingResource ? 'Edit Resource' : 'Create New Resource'}
            </DialogTitle>
            <DialogDescription>
              Manage a public/default template without changing existing workspace copies.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="title">Title *</Label>
              <Input
                id="title"
                maxLength={200}
                value={formData.title}
                onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                placeholder="Enter resource title"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="description">Description *</Label>
              <Textarea
                id="description"
                maxLength={2000}
                value={formData.description}
                onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                placeholder="Brief description of the resource"
                rows={3}
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="category">Category</Label>
                <Select
                  value={formData.category}
                  onValueChange={(value: ResourceCategory) =>
                    setFormData({ ...formData, category: value })
                  }
                >
                  <SelectTrigger aria-label="Category">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {Object.entries(categoryInfo).map(([key, info]) => (
                      <SelectItem key={key} value={key}>
                        {info.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label htmlFor="type">Type</Label>
                <Select
                  value={formData.type}
                  onValueChange={(value: ResourceType) =>
                    setFormData({
                      ...formData,
                      type: value,
                      content: value === 'article' ? formData.content : '',
                    })
                  }
                >
                  <SelectTrigger aria-label="Type">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {Object.entries(typeInfo).map(([key, info]) => (
                      <SelectItem key={key} value={key}>
                        {info.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            {formData.type === 'article' && (
              <div className="space-y-2">
                <Label>Content *</Label>
                <GuestResourceEditor
                  content={formData.content}
                  onChange={(content) => setFormData({ ...formData, content })}
                  category={formData.category}
                  placeholder="Write your content or paste from Google Docs..."
                />
                <p className="text-xs text-muted-foreground">
                  {formData.content.length.toLocaleString()} / 100,000 characters
                </p>
              </div>
            )}

            {(formData.type === 'video' || formData.type === 'link') && (
              <div className="space-y-2">
                <Label htmlFor="url">URL{resourceUrlRequired ? ' *' : ''}</Label>
                <Input
                  id="url"
                  type="url"
                  required={resourceUrlRequired}
                  maxLength={2048}
                  value={formData.url}
                  onChange={(e) => setFormData({ ...formData, url: e.target.value })}
                  placeholder="https://..."
                />
              </div>
            )}

            {formData.type === 'download' && (
              <div className="space-y-2">
                <Label htmlFor="file_url">File URL{fileUrlRequired ? ' *' : ''}</Label>
                <Input
                  id="file_url"
                  type="url"
                  required={fileUrlRequired}
                  maxLength={2048}
                  value={formData.file_url}
                  onChange={(e) => setFormData({ ...formData, file_url: e.target.value })}
                  placeholder="https://..."
                />
              </div>
            )}

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="display_order">Display Order</Label>
                <Input
                  id="display_order"
                  type="number"
                  min={0}
                  max={1000000}
                  step={1}
                  value={formData.display_order}
                  onChange={(e) =>
                    setFormData({ ...formData, display_order: Number(e.target.value) })
                  }
                />
              </div>

              <div className="flex items-end space-x-2">
                <Checkbox
                  id="featured"
                  checked={formData.featured}
                  onCheckedChange={(checked) =>
                    setFormData({ ...formData, featured: checked === true })
                  }
                />
                <Label htmlFor="featured" className="cursor-pointer">
                  Featured Resource
                </Label>
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-4">
              <Button
                variant="outline"
                onClick={() => {
                  setShowCreateDialog(false)
                  setEditingResource(null)
                  resetForm()
                }}
              >
                Cancel
              </Button>
              <Button
                onClick={handleSave}
                disabled={createMutation.isPending || updateMutation.isPending}
              >
                {(createMutation.isPending || updateMutation.isPending) && (
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                )}
                {editingResource ? 'Update' : 'Create'}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <Dialog open={!!deletingResource} onOpenChange={() => setDeletingResource(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete Resource</DialogTitle>
            <DialogDescription>
              This permanently deletes the platform template and cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            {deletingResource && (
              <div className="p-3 bg-muted rounded-lg">
                <p className="font-medium">{deletingResource.title}</p>
              </div>
            )}
            <div className="flex justify-end gap-2 pt-4">
              <Button variant="outline" onClick={() => setDeletingResource(null)}>
                Cancel
              </Button>
              <Button
                variant="destructive"
                onClick={confirmDelete}
                disabled={deleteMutation.isPending}
              >
                {deleteMutation.isPending && (
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                )}
                Delete
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </DashboardLayout>
  )
}
