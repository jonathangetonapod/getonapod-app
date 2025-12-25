import { useState, useEffect } from 'react'
import { DashboardLayout } from '@/components/admin/DashboardLayout'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Plus, Edit, Trash2, Star, Eye, EyeOff, Loader2 } from 'lucide-react'
import { toast } from 'sonner'
import {
  getAllTestimonials,
  createTestimonial,
  updateTestimonial,
  deleteTestimonial,
  toggleFeatured,
  toggleActive,
  getThumbnailUrl,
  type Testimonial,
  type CreateTestimonialInput
} from '@/services/testimonials'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'

const VideoManagement = () => {
  const queryClient = useQueryClient()
  const [isDialogOpen, setIsDialogOpen] = useState(false)
  const [editingTestimonial, setEditingTestimonial] = useState<Testimonial | null>(null)
  const [formData, setFormData] = useState<CreateTestimonialInput>({
    video_url: '',
    client_name: '',
    client_title: '',
    client_company: '',
    quote: '',
    is_featured: false,
    display_order: 0
  })

  // Fetch testimonials
  const { data: testimonials = [], isLoading } = useQuery({
    queryKey: ['testimonials'],
    queryFn: getAllTestimonials
  })

  // Create testimonial mutation
  const createMutation = useMutation({
    mutationFn: createTestimonial,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['testimonials'] })
      toast.success('Testimonial added successfully!')
      handleCloseDialog()
    },
    onError: (error: any) => {
      toast.error(error.message || 'Failed to create testimonial')
    }
  })

  // Update testimonial mutation
  const updateMutation = useMutation({
    mutationFn: updateTestimonial,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['testimonials'] })
      toast.success('Testimonial updated successfully!')
      handleCloseDialog()
    },
    onError: (error: any) => {
      toast.error(error.message || 'Failed to update testimonial')
    }
  })

  // Delete testimonial mutation
  const deleteMutation = useMutation({
    mutationFn: deleteTestimonial,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['testimonials'] })
      toast.success('Testimonial deleted successfully!')
    },
    onError: (error: any) => {
      toast.error(error.message || 'Failed to delete testimonial')
    }
  })

  // Toggle featured mutation
  const toggleFeaturedMutation = useMutation({
    mutationFn: ({ id, isFeatured }: { id: string; isFeatured: boolean }) =>
      toggleFeatured(id, isFeatured),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['testimonials'] })
    }
  })

  // Toggle active mutation
  const toggleActiveMutation = useMutation({
    mutationFn: ({ id, isActive }: { id: string; isActive: boolean }) =>
      toggleActive(id, isActive),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['testimonials'] })
    }
  })

  const handleOpenDialog = (testimonial?: Testimonial) => {
    if (testimonial) {
      setEditingTestimonial(testimonial)
      setFormData({
        video_url: testimonial.video_url,
        client_name: testimonial.client_name,
        client_title: testimonial.client_title || '',
        client_company: testimonial.client_company || '',
        quote: testimonial.quote || '',
        is_featured: testimonial.is_featured,
        display_order: testimonial.display_order
      })
    } else {
      setEditingTestimonial(null)
      setFormData({
        video_url: '',
        client_name: '',
        client_title: '',
        client_company: '',
        quote: '',
        is_featured: false,
        display_order: testimonials.length
      })
    }
    setIsDialogOpen(true)
  }

  const handleCloseDialog = () => {
    setIsDialogOpen(false)
    setEditingTestimonial(null)
  }

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (editingTestimonial) {
      updateMutation.mutate({ id: editingTestimonial.id, ...formData })
    } else {
      createMutation.mutate(formData)
    }
  }

  const handleDelete = (id: string) => {
    if (confirm('Are you sure you want to delete this testimonial?')) {
      deleteMutation.mutate(id)
    }
  }

  const activeTestimonials = testimonials.filter(t => t.is_active)
  const featuredTestimonials = testimonials.filter(t => t.is_featured && t.is_active)

  return (
    <TooltipProvider>
      <DashboardLayout>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold">Video Testimonials</h1>
            <p className="text-muted-foreground mt-2">
              Manage video testimonials that appear on your homepage
            </p>
          </div>
          <Button onClick={() => handleOpenDialog()}>
            <Plus className="mr-2 h-4 w-4" />
            Add Testimonial
          </Button>
        </div>

        {/* Stats */}
        <div className="grid gap-4 md:grid-cols-3">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Total Testimonials</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{testimonials.length}</div>
              <p className="text-xs text-muted-foreground">
                All testimonials
              </p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Active</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{activeTestimonials.length}</div>
              <p className="text-xs text-muted-foreground">
                Visible on website
              </p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Featured</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{featuredTestimonials.length}</div>
              <p className="text-xs text-muted-foreground">
                Homepage featured
              </p>
            </CardContent>
          </Card>
        </div>

        {/* Testimonials Grid */}
        <Card>
          <CardHeader>
            <CardTitle>All Testimonials</CardTitle>
            <CardDescription>
              Manage your client video testimonials
            </CardDescription>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="flex justify-center py-12">
                <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
              </div>
            ) : testimonials.length === 0 ? (
              <div className="text-center py-12">
                <Star className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
                <h3 className="text-lg font-medium mb-2">No testimonials yet</h3>
                <p className="text-sm text-muted-foreground mb-4">
                  Add your first client testimonial video
                </p>
                <Button onClick={() => handleOpenDialog()}>
                  <Plus className="mr-2 h-4 w-4" />
                  Add Testimonial
                </Button>
              </div>
            ) : (
              <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                {testimonials.map((testimonial) => (
                  <div
                    key={testimonial.id}
                    className={`group relative border rounded-lg overflow-hidden hover:shadow-lg transition-shadow ${
                      !testimonial.is_active ? 'opacity-60' : ''
                    }`}
                  >
                    <div className="relative aspect-video bg-muted">
                      <img
                        src={getThumbnailUrl(testimonial.video_url)}
                        alt={testimonial.client_name}
                        className="w-full h-full object-cover"
                      />
                      {testimonial.is_featured && (
                        <div className="absolute top-2 left-2 bg-yellow-500 text-white text-xs px-2 py-1 rounded flex items-center gap-1">
                          <Star className="h-3 w-3" />
                          Featured
                        </div>
                      )}
                      {!testimonial.is_active && (
                        <div className="absolute top-2 right-2 bg-red-500 text-white text-xs px-2 py-1 rounded">
                          Inactive
                        </div>
                      )}
                    </div>
                    <div className="p-4">
                      <h3 className="font-medium mb-1">{testimonial.client_name}</h3>
                      {testimonial.client_title && (
                        <p className="text-sm text-muted-foreground mb-2">
                          {testimonial.client_title}
                          {testimonial.client_company && ` at ${testimonial.client_company}`}
                        </p>
                      )}
                      <div className="flex gap-2 mt-3">
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() =>
                                toggleFeaturedMutation.mutate({
                                  id: testimonial.id,
                                  isFeatured: !testimonial.is_featured
                                })
                              }
                            >
                              <Star className={`h-4 w-4 ${testimonial.is_featured ? 'fill-current' : ''}`} />
                            </Button>
                          </TooltipTrigger>
                          <TooltipContent>
                            <p>{testimonial.is_featured ? 'Remove from' : 'Feature on'} homepage</p>
                          </TooltipContent>
                        </Tooltip>

                        <Tooltip>
                          <TooltipTrigger asChild>
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() =>
                                toggleActiveMutation.mutate({
                                  id: testimonial.id,
                                  isActive: !testimonial.is_active
                                })
                              }
                            >
                              {testimonial.is_active ? (
                                <Eye className="h-4 w-4" />
                              ) : (
                                <EyeOff className="h-4 w-4" />
                              )}
                            </Button>
                          </TooltipTrigger>
                          <TooltipContent>
                            <p>{testimonial.is_active ? 'Hide' : 'Show'} testimonial</p>
                          </TooltipContent>
                        </Tooltip>

                        <Tooltip>
                          <TooltipTrigger asChild>
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => handleOpenDialog(testimonial)}
                            >
                              <Edit className="h-4 w-4" />
                            </Button>
                          </TooltipTrigger>
                          <TooltipContent>
                            <p>Edit testimonial</p>
                          </TooltipContent>
                        </Tooltip>

                        <Tooltip>
                          <TooltipTrigger asChild>
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => handleDelete(testimonial.id)}
                            >
                              <Trash2 className="h-4 w-4 text-destructive" />
                            </Button>
                          </TooltipTrigger>
                          <TooltipContent>
                            <p>Delete testimonial</p>
                          </TooltipContent>
                        </Tooltip>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Add/Edit Dialog */}
      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent className="sm:max-w-[600px]">
          <form onSubmit={handleSubmit}>
            <DialogHeader>
              <DialogTitle>
                {editingTestimonial ? 'Edit Testimonial' : 'Add New Testimonial'}
              </DialogTitle>
              <DialogDescription>
                Add a client video testimonial from YouTube or Vimeo
              </DialogDescription>
            </DialogHeader>
            <div className="grid gap-4 py-4">
              <div className="space-y-2">
                <Label htmlFor="video_url">Video URL *</Label>
                <Input
                  id="video_url"
                  placeholder="https://www.youtube.com/watch?v=..."
                  value={formData.video_url}
                  onChange={(e) => setFormData({ ...formData, video_url: e.target.value })}
                  required
                />
                <p className="text-xs text-muted-foreground">
                  Paste a YouTube or Vimeo video URL
                </p>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="client_name">Client Name *</Label>
                  <Input
                    id="client_name"
                    placeholder="John Doe"
                    value={formData.client_name}
                    onChange={(e) => setFormData({ ...formData, client_name: e.target.value })}
                    required
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="client_title">Title/Position</Label>
                  <Input
                    id="client_title"
                    placeholder="CEO"
                    value={formData.client_title}
                    onChange={(e) => setFormData({ ...formData, client_title: e.target.value })}
                  />
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="client_company">Company</Label>
                <Input
                  id="client_company"
                  placeholder="Acme Inc."
                  value={formData.client_company}
                  onChange={(e) => setFormData({ ...formData, client_company: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="quote">Quote (optional)</Label>
                <Textarea
                  id="quote"
                  placeholder="A brief quote from the testimonial..."
                  value={formData.quote}
                  onChange={(e) => setFormData({ ...formData, quote: e.target.value })}
                  rows={3}
                />
              </div>
              <div className="flex items-center gap-4">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={formData.is_featured}
                    onChange={(e) => setFormData({ ...formData, is_featured: e.target.checked })}
                    className="rounded"
                  />
                  <span className="text-sm">Featured on homepage</span>
                </label>
              </div>
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={handleCloseDialog}>
                Cancel
              </Button>
              <Button
                type="submit"
                disabled={createMutation.isPending || updateMutation.isPending}
              >
                {(createMutation.isPending || updateMutation.isPending) && (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                )}
                {editingTestimonial ? 'Update' : 'Create'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
      </DashboardLayout>
    </TooltipProvider>
  )
}

export default VideoManagement
