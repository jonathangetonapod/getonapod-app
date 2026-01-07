import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useClientPortal } from '@/contexts/ClientPortalContext'
import { PortalLayout } from '@/components/portal/PortalLayout'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import {
  BookOpen,
  Video,
  Download,
  ExternalLink,
  Search,
  Star,
  Clock,
  Loader2,
  FileText,
  Mic,
  TrendingUp,
  Share2,
  Grid3x3,
  List
} from 'lucide-react'
import { getGuestResources, trackResourceView, type GuestResource, type ResourceCategory } from '@/services/guestResources'

const categoryInfo = {
  preparation: {
    label: 'Preparation',
    icon: BookOpen,
    color: 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200',
  },
  technical_setup: {
    label: 'Technical Setup',
    icon: Mic,
    color: 'bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200',
  },
  best_practices: {
    label: 'Best Practices',
    icon: Star,
    color: 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200',
  },
  promotion: {
    label: 'Promotion',
    icon: TrendingUp,
    color: 'bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-200',
  },
  examples: {
    label: 'Examples',
    icon: Video,
    color: 'bg-pink-100 text-pink-800 dark:bg-pink-900 dark:text-pink-200',
  },
  templates: {
    label: 'Templates',
    icon: FileText,
    color: 'bg-amber-100 text-amber-800 dark:bg-amber-900 dark:text-amber-200',
  },
}

const typeInfo = {
  article: { icon: FileText, label: 'Article' },
  video: { icon: Video, label: 'Video' },
  download: { icon: Download, label: 'Download' },
  link: { icon: ExternalLink, label: 'External Link' },
}

export default function PortalResources() {
  const { client } = useClientPortal()
  const [searchQuery, setSearchQuery] = useState('')
  const [categoryFilter, setCategoryFilter] = useState<string>('all')
  const [viewingResource, setViewingResource] = useState<GuestResource | null>(null)
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid')

  // Fetch resources
  const { data: resources, isLoading } = useQuery({
    queryKey: ['guest-resources'],
    queryFn: () => getGuestResources(),
  })

  // Filter resources
  const filteredResources = (resources || []).filter(resource => {
    const matchesSearch =
      resource.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
      resource.description.toLowerCase().includes(searchQuery.toLowerCase())

    const matchesCategory = categoryFilter === 'all' || resource.category === categoryFilter

    return matchesSearch && matchesCategory
  })

  // Separate featured and regular resources
  const featuredResources = filteredResources.filter(r => r.featured)
  const regularResources = filteredResources.filter(r => !r.featured)

  const handleViewResource = (resource: GuestResource) => {
    setViewingResource(resource)

    // Track view
    if (client) {
      trackResourceView(resource.id, client.id).catch(console.error)
    }
  }

  const handleResourceAction = (resource: GuestResource) => {
    if (resource.type === 'video' && resource.url) {
      window.open(resource.url, '_blank')
    } else if (resource.type === 'download' && resource.file_url) {
      window.open(resource.file_url, '_blank')
    } else if (resource.type === 'link' && resource.url) {
      window.open(resource.url, '_blank')
    } else if (resource.type === 'article') {
      handleViewResource(resource)
    }
  }

  const ResourceCard = ({ resource }: { resource: GuestResource }) => {
    const CategoryIcon = categoryInfo[resource.category].icon
    const TypeIcon = typeInfo[resource.type].icon

    return (
      <Card
        className="hover:shadow-lg transition-shadow cursor-pointer h-full flex flex-col"
        onClick={() => handleResourceAction(resource)}
      >
        <CardHeader>
          <div className="flex items-start justify-between gap-2">
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-2">
                <Badge className={categoryInfo[resource.category].color}>
                  <CategoryIcon className="h-3 w-3 mr-1" />
                  {categoryInfo[resource.category].label}
                </Badge>
                {resource.featured && (
                  <Badge variant="secondary">
                    <Star className="h-3 w-3 mr-1 fill-current" />
                    Featured
                  </Badge>
                )}
              </div>
              <CardTitle className="text-lg line-clamp-2">{resource.title}</CardTitle>
            </div>
            <TypeIcon className="h-5 w-5 text-muted-foreground flex-shrink-0" />
          </div>
        </CardHeader>
        <CardContent className="flex-1 flex flex-col">
          <CardDescription className="line-clamp-3 flex-1">
            {resource.description}
          </CardDescription>
          <div className="mt-4 flex items-center justify-between text-xs text-muted-foreground">
            <span className="flex items-center gap-1">
              <Clock className="h-3 w-3" />
              {new Date(resource.created_at).toLocaleDateString()}
            </span>
            <span className="font-medium text-primary">
              {resource.type === 'article' ? 'Read More' :
               resource.type === 'video' ? 'Watch' :
               resource.type === 'download' ? 'Download' : 'Visit'}
              <ExternalLink className="h-3 w-3 inline ml-1" />
            </span>
          </div>
        </CardContent>
      </Card>
    )
  }

  const ResourceListItem = ({ resource }: { resource: GuestResource }) => {
    const CategoryIcon = categoryInfo[resource.category].icon
    const TypeIcon = typeInfo[resource.type].icon

    return (
      <Card
        className="hover:shadow-md transition-shadow cursor-pointer"
        onClick={() => handleResourceAction(resource)}
      >
        <CardContent className="p-4">
          <div className="flex items-center gap-4">
            <div className="flex-shrink-0 w-12 h-12 rounded-lg bg-muted flex items-center justify-center">
              <TypeIcon className="h-6 w-6 text-muted-foreground" />
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-1">
                <Badge className={`${categoryInfo[resource.category].color} text-xs`}>
                  <CategoryIcon className="h-3 w-3 mr-1" />
                  {categoryInfo[resource.category].label}
                </Badge>
                {resource.featured && (
                  <Badge variant="secondary" className="text-xs">
                    <Star className="h-3 w-3 mr-1 fill-current" />
                    Featured
                  </Badge>
                )}
              </div>
              <h3 className="font-semibold text-base mb-1">{resource.title}</h3>
              <p className="text-sm text-muted-foreground line-clamp-2">{resource.description}</p>
            </div>
            <div className="flex-shrink-0 text-sm text-primary font-medium">
              {resource.type === 'article' ? 'Read' :
               resource.type === 'video' ? 'Watch' :
               resource.type === 'download' ? 'Download' : 'Visit'}
              <ExternalLink className="h-3 w-3 inline ml-1" />
            </div>
          </div>
        </CardContent>
      </Card>
    )
  }

  if (isLoading) {
    return (
      <PortalLayout>
        <div className="flex items-center justify-center h-96">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      </PortalLayout>
    )
  }

  return (
    <PortalLayout>
      <div className="space-y-6">
        {/* Header */}
        <div>
          <h1 className="text-3xl font-bold">Guest Resources</h1>
          <p className="text-muted-foreground mt-2">
            Everything you need to be a successful podcast guest
          </p>
        </div>

        {/* Search and Filters */}
        <Card>
          <CardContent className="pt-6">
            <div className="flex flex-col sm:flex-row gap-3">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Search resources..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-10"
                />
              </div>
              <Select value={categoryFilter} onValueChange={setCategoryFilter}>
                <SelectTrigger className="w-full sm:w-[200px]">
                  <SelectValue placeholder="All Categories" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Categories</SelectItem>
                  {Object.entries(categoryInfo).map(([key, info]) => (
                    <SelectItem key={key} value={key}>
                      {info.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <div className="flex gap-1 border rounded-lg p-1">
                <Button
                  variant={viewMode === 'grid' ? 'secondary' : 'ghost'}
                  size="sm"
                  onClick={() => setViewMode('grid')}
                >
                  <Grid3x3 className="h-4 w-4" />
                </Button>
                <Button
                  variant={viewMode === 'list' ? 'secondary' : 'ghost'}
                  size="sm"
                  onClick={() => setViewMode('list')}
                >
                  <List className="h-4 w-4" />
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Featured Resources */}
        {featuredResources.length > 0 && (
          <div>
            <div className="flex items-center gap-2 mb-4">
              <Star className="h-5 w-5 text-amber-500 fill-current" />
              <h2 className="text-2xl font-bold">Featured Resources</h2>
            </div>
            {viewMode === 'grid' ? (
              <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
                {featuredResources.map(resource => (
                  <ResourceCard key={resource.id} resource={resource} />
                ))}
              </div>
            ) : (
              <div className="space-y-3">
                {featuredResources.map(resource => (
                  <ResourceListItem key={resource.id} resource={resource} />
                ))}
              </div>
            )}
          </div>
        )}

        {/* All Resources */}
        {regularResources.length > 0 && (
          <div>
            {featuredResources.length > 0 && (
              <h2 className="text-2xl font-bold mb-4">All Resources</h2>
            )}
            {viewMode === 'grid' ? (
              <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
                {regularResources.map(resource => (
                  <ResourceCard key={resource.id} resource={resource} />
                ))}
              </div>
            ) : (
              <div className="space-y-3">
                {regularResources.map(resource => (
                  <ResourceListItem key={resource.id} resource={resource} />
                ))}
              </div>
            )}
          </div>
        )}

        {/* No Results */}
        {filteredResources.length === 0 && (
          <Card>
            <CardContent className="py-12 text-center">
              <BookOpen className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
              <h3 className="text-lg font-semibold mb-2">No resources found</h3>
              <p className="text-muted-foreground">
                Try adjusting your search or filters
              </p>
            </CardContent>
          </Card>
        )}
      </div>

      {/* Resource Detail Modal */}
      <Dialog open={!!viewingResource} onOpenChange={() => setViewingResource(null)}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <div className="flex items-start gap-3">
              <div className="flex-1">
                <DialogTitle className="text-2xl mb-3">{viewingResource?.title}</DialogTitle>
                <div className="flex flex-wrap items-center gap-2 mb-2">
                  {viewingResource && (
                    <>
                      <Badge className={categoryInfo[viewingResource.category].color}>
                        {categoryInfo[viewingResource.category].label}
                      </Badge>
                      <Badge variant="outline">
                        {typeInfo[viewingResource.type].label}
                      </Badge>
                      {viewingResource.featured && (
                        <Badge variant="secondary">
                          <Star className="h-3 w-3 mr-1 fill-current" />
                          Featured
                        </Badge>
                      )}
                    </>
                  )}
                </div>
                <p className="text-muted-foreground">{viewingResource?.description}</p>
              </div>
            </div>
          </DialogHeader>

          {viewingResource?.content && (
            <div
              className="prose prose-sm dark:prose-invert max-w-none"
              dangerouslySetInnerHTML={{ __html: viewingResource.content }}
            />
          )}

          {viewingResource?.url && (
            <div className="pt-4 border-t">
              <Button
                onClick={() => window.open(viewingResource.url!, '_blank')}
                className="w-full"
              >
                <ExternalLink className="h-4 w-4 mr-2" />
                {viewingResource.type === 'video' ? 'Watch Video' : 'Visit Link'}
              </Button>
            </div>
          )}

          {viewingResource?.file_url && (
            <div className="pt-4 border-t">
              <Button
                onClick={() => window.open(viewingResource.file_url!, '_blank')}
                className="w-full"
              >
                <Download className="h-4 w-4 mr-2" />
                Download File
              </Button>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </PortalLayout>
  )
}
