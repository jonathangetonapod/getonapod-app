import { useState } from 'react'
import { DashboardLayout } from '@/components/admin/DashboardLayout'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow
} from '@/components/ui/table'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Search,
  SlidersHorizontal,
  LayoutGrid,
  LayoutList,
  Plus,
  MoreVertical,
  Mic,
  Users,
  Star,
  Layers,
  TrendingUp,
  Eye,
  Edit,
  Trash2,
  Download,
  Upload,
} from 'lucide-react'

type ViewMode = 'table' | 'grid'

type SortOption = 'name' | 'audience' | 'rating' | 'episodes' | 'dateAdded'

export default function PodcastDatabase() {
  const [viewMode, setViewMode] = useState<ViewMode>('table')
  const [searchQuery, setSearchQuery] = useState('')
  const [sortBy, setSortBy] = useState<SortOption>('name')
  const [categoryFilter, setCategoryFilter] = useState('all')

  // Mock data - will be replaced with real data from Supabase/API
  const stats = {
    total: 1234,
    totalReach: 5200000,
    avgRating: 4.7,
    categories: 45,
  }

  const mockPodcasts = [
    {
      id: '1',
      name: 'The Joe Rogan Experience',
      host: 'Joe Rogan',
      image: 'https://via.placeholder.com/100',
      audience: 11000000,
      rating: 4.8,
      episodes: 2089,
      categories: ['Comedy', 'Society & Culture'],
      status: 'Active',
    },
    {
      id: '2',
      name: 'The Tim Ferriss Show',
      host: 'Tim Ferriss',
      image: 'https://via.placeholder.com/100',
      audience: 900000,
      rating: 4.9,
      episodes: 700,
      categories: ['Business', 'Health & Fitness'],
      status: 'Active',
    },
    {
      id: '3',
      name: 'How I Built This',
      host: 'Guy Raz',
      image: 'https://via.placeholder.com/100',
      audience: 650000,
      rating: 4.7,
      episodes: 500,
      categories: ['Business', 'Entrepreneurship'],
      status: 'Active',
    },
    {
      id: '4',
      name: 'SmartLess',
      host: 'Jason Bateman, Sean Hayes, Will Arnett',
      image: 'https://via.placeholder.com/100',
      audience: 850000,
      rating: 4.6,
      episodes: 200,
      categories: ['Comedy', 'Arts'],
      status: 'Active',
    },
    {
      id: '5',
      name: 'The Daily',
      host: 'The New York Times',
      image: 'https://via.placeholder.com/100',
      audience: 2500000,
      rating: 4.5,
      episodes: 1800,
      categories: ['News', 'Politics'],
      status: 'Active',
    },
  ]

  const formatNumber = (num: number) => {
    if (num >= 1000000) return `${(num / 1000000).toFixed(1)}M`
    if (num >= 1000) return `${(num / 1000).toFixed(0)}K`
    return num.toString()
  }

  return (
    <DashboardLayout>
      <div className="space-y-6">
        {/* Header */}
        <div>
          <h1 className="text-3xl font-bold">Podcast Database</h1>
          <p className="text-muted-foreground mt-2">
            Manage and explore your podcast database
          </p>
        </div>

      {/* Main Content with Sidebar Layout */}
      <div className="flex flex-col xl:flex-row gap-6">
        {/* Main Content Area */}
        <div className="flex-1 min-w-0 space-y-6">

      {/* Quick Stats */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Card className="bg-gradient-to-br from-blue-50 to-blue-100 dark:from-blue-950 dark:to-blue-900 border-blue-200">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-blue-900 dark:text-blue-100">
              Total Podcasts
            </CardTitle>
            <Mic className="h-4 w-4 text-blue-600 dark:text-blue-400" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-blue-900 dark:text-blue-100">
              {stats.total.toLocaleString()}
            </div>
            <p className="text-xs text-blue-700 dark:text-blue-300 mt-1">
              Active podcasts in database
            </p>
          </CardContent>
        </Card>

        <Card className="bg-gradient-to-br from-purple-50 to-purple-100 dark:from-purple-950 dark:to-purple-900 border-purple-200">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-purple-900 dark:text-purple-100">
              Total Reach
            </CardTitle>
            <Users className="h-4 w-4 text-purple-600 dark:text-purple-400" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-purple-900 dark:text-purple-100">
              {formatNumber(stats.totalReach)}
            </div>
            <p className="text-xs text-purple-700 dark:text-purple-300 mt-1">
              Combined audience reach
            </p>
          </CardContent>
        </Card>

        <Card className="bg-gradient-to-br from-amber-50 to-amber-100 dark:from-amber-950 dark:to-amber-900 border-amber-200">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-amber-900 dark:text-amber-100">
              Average Rating
            </CardTitle>
            <Star className="h-4 w-4 text-amber-600 dark:text-amber-400 fill-amber-600 dark:fill-amber-400" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-amber-900 dark:text-amber-100">
              {stats.avgRating.toFixed(1)} ⭐
            </div>
            <p className="text-xs text-amber-700 dark:text-amber-300 mt-1">
              Average podcast rating
            </p>
          </CardContent>
        </Card>

        <Card className="bg-gradient-to-br from-green-50 to-green-100 dark:from-green-950 dark:to-green-900 border-green-200">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-green-900 dark:text-green-100">
              Categories
            </CardTitle>
            <Layers className="h-4 w-4 text-green-600 dark:text-green-400" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-green-900 dark:text-green-100">
              {stats.categories}
            </div>
            <p className="text-xs text-green-700 dark:text-green-300 mt-1">
              Unique podcast categories
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Toolbar */}
      <Card>
        <CardContent className="pt-6">
          <div className="flex flex-col gap-4">
            {/* Search and Actions Row */}
            <div className="flex flex-col sm:flex-row gap-2">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Search podcasts by name, host, or category..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-9"
                />
              </div>

              <div className="flex gap-2">
                <Select value={categoryFilter} onValueChange={setCategoryFilter}>
                  <SelectTrigger className="w-[140px]">
                    <SlidersHorizontal className="h-4 w-4 mr-2" />
                    <SelectValue placeholder="Filter" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Categories</SelectItem>
                    <SelectItem value="business">Business</SelectItem>
                    <SelectItem value="comedy">Comedy</SelectItem>
                    <SelectItem value="technology">Technology</SelectItem>
                    <SelectItem value="health">Health & Fitness</SelectItem>
                    <SelectItem value="news">News</SelectItem>
                  </SelectContent>
                </Select>

                <Select value={sortBy} onValueChange={(value) => setSortBy(value as SortOption)}>
                  <SelectTrigger className="w-[140px]">
                    <TrendingUp className="h-4 w-4 mr-2" />
                    <SelectValue placeholder="Sort by" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="name">Name</SelectItem>
                    <SelectItem value="audience">Audience Size</SelectItem>
                    <SelectItem value="rating">Rating</SelectItem>
                    <SelectItem value="episodes">Episodes</SelectItem>
                    <SelectItem value="dateAdded">Date Added</SelectItem>
                  </SelectContent>
                </Select>

                <Button variant="outline" size="icon">
                  <Download className="h-4 w-4" />
                </Button>

                <Button className="bg-gradient-to-r from-primary to-purple-600">
                  <Plus className="h-4 w-4 mr-2" />
                  Add Podcast
                </Button>
              </div>
            </div>

            {/* View Toggle */}
            <div className="flex items-center gap-2">
              <span className="text-sm text-muted-foreground">View:</span>
              <div className="flex gap-1 border rounded-md p-1">
                <Button
                  variant={viewMode === 'table' ? 'default' : 'ghost'}
                  size="sm"
                  onClick={() => setViewMode('table')}
                  className="h-8"
                >
                  <LayoutList className="h-4 w-4 mr-1" />
                  Table
                </Button>
                <Button
                  variant={viewMode === 'grid' ? 'default' : 'ghost'}
                  size="sm"
                  onClick={() => setViewMode('grid')}
                  className="h-8"
                >
                  <LayoutGrid className="h-4 w-4 mr-1" />
                  Grid
                </Button>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Content Area */}
      {viewMode === 'table' ? (
        /* Table View */
        <Card>
          <CardContent className="pt-6">
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-[300px]">Podcast</TableHead>
                    <TableHead>Host</TableHead>
                    <TableHead>Categories</TableHead>
                    <TableHead className="text-right">Audience</TableHead>
                    <TableHead className="text-center">Rating</TableHead>
                    <TableHead className="text-center">Episodes</TableHead>
                    <TableHead className="text-center">Status</TableHead>
                    <TableHead className="w-[50px]"></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {mockPodcasts.map((podcast) => (
                    <TableRow key={podcast.id} className="cursor-pointer hover:bg-muted/50">
                      <TableCell>
                        <div className="flex items-center gap-3">
                          <img
                            src={podcast.image}
                            alt={podcast.name}
                            className="w-12 h-12 rounded-md object-cover"
                          />
                          <div>
                            <p className="font-medium">{podcast.name}</p>
                          </div>
                        </div>
                      </TableCell>
                      <TableCell className="text-muted-foreground">
                        {podcast.host}
                      </TableCell>
                      <TableCell>
                        <div className="flex flex-wrap gap-1">
                          {podcast.categories.slice(0, 2).map((cat) => (
                            <Badge key={cat} variant="secondary" className="text-xs">
                              {cat}
                            </Badge>
                          ))}
                          {podcast.categories.length > 2 && (
                            <Badge variant="secondary" className="text-xs">
                              +{podcast.categories.length - 2}
                            </Badge>
                          )}
                        </div>
                      </TableCell>
                      <TableCell className="text-right font-medium">
                        {formatNumber(podcast.audience)}
                      </TableCell>
                      <TableCell className="text-center">
                        <div className="flex items-center justify-center gap-1">
                          <Star className="h-4 w-4 fill-amber-400 text-amber-400" />
                          <span className="font-medium">{podcast.rating}</span>
                        </div>
                      </TableCell>
                      <TableCell className="text-center text-muted-foreground">
                        {podcast.episodes.toLocaleString()}
                      </TableCell>
                      <TableCell className="text-center">
                        <Badge
                          variant={podcast.status === 'Active' ? 'default' : 'secondary'}
                          className="bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200"
                        >
                          {podcast.status}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="icon" className="h-8 w-8">
                              <MoreVertical className="h-4 w-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem>
                              <Eye className="h-4 w-4 mr-2" />
                              View Details
                            </DropdownMenuItem>
                            <DropdownMenuItem>
                              <Edit className="h-4 w-4 mr-2" />
                              Edit
                            </DropdownMenuItem>
                            <DropdownMenuItem className="text-destructive">
                              <Trash2 className="h-4 w-4 mr-2" />
                              Delete
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>

            {/* Pagination */}
            <div className="flex items-center justify-between mt-4">
              <p className="text-sm text-muted-foreground">
                Showing 1-5 of {stats.total.toLocaleString()} podcasts
              </p>
              <div className="flex gap-1">
                <Button variant="outline" size="sm">Previous</Button>
                <Button variant="outline" size="sm">1</Button>
                <Button variant="default" size="sm">2</Button>
                <Button variant="outline" size="sm">3</Button>
                <Button variant="outline" size="sm">...</Button>
                <Button variant="outline" size="sm">247</Button>
                <Button variant="outline" size="sm">Next</Button>
              </div>
            </div>
          </CardContent>
        </Card>
      ) : (
        /* Grid View */
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {mockPodcasts.map((podcast) => (
            <Card key={podcast.id} className="overflow-hidden hover:shadow-lg transition-shadow cursor-pointer">
              <div className="aspect-square relative">
                <img
                  src={podcast.image}
                  alt={podcast.name}
                  className="w-full h-full object-cover"
                />
                <Badge className="absolute top-2 right-2 bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200">
                  {podcast.status}
                </Badge>
              </div>
              <CardContent className="p-4">
                <h3 className="font-semibold text-lg mb-1 line-clamp-1">
                  {podcast.name}
                </h3>
                <p className="text-sm text-muted-foreground mb-3 line-clamp-1">
                  {podcast.host}
                </p>

                <div className="space-y-2">
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-muted-foreground flex items-center gap-1">
                      <Users className="h-4 w-4" />
                      {formatNumber(podcast.audience)}
                    </span>
                    <span className="font-medium flex items-center gap-1">
                      <Star className="h-4 w-4 fill-amber-400 text-amber-400" />
                      {podcast.rating}
                    </span>
                  </div>

                  <div className="flex flex-wrap gap-1">
                    {podcast.categories.slice(0, 2).map((cat) => (
                      <Badge key={cat} variant="secondary" className="text-xs">
                        {cat}
                      </Badge>
                    ))}
                  </div>

                  <Button className="w-full mt-2" variant="outline" size="sm">
                    <Eye className="h-4 w-4 mr-2" />
                    View Details
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
        </div>
        {/* End Main Content Area */}

        {/* Sidebar */}
        <div className="hidden xl:block w-80 flex-shrink-0">
          <div className="sticky top-6 space-y-4 max-h-[calc(100vh-3rem)] overflow-y-auto pr-2">

            {/* Quick Filters */}
            <Card>
              <CardHeader>
                <CardTitle className="text-base flex items-center gap-2">
                  <SlidersHorizontal className="h-4 w-4" />
                  Quick Filters
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <Button variant="outline" className="w-full justify-start" size="sm">
                  <Star className="h-4 w-4 mr-2 fill-amber-400 text-amber-400" />
                  Top Rated (4.5+)
                </Button>
                <Button variant="outline" className="w-full justify-start" size="sm">
                  <Users className="h-4 w-4 mr-2 text-purple-600" />
                  Large Audience (1M+)
                </Button>
                <Button variant="outline" className="w-full justify-start" size="sm">
                  <TrendingUp className="h-4 w-4 mr-2 text-green-600" />
                  Recently Added
                </Button>
                <Button variant="outline" className="w-full justify-start" size="sm">
                  <Mic className="h-4 w-4 mr-2 text-blue-600" />
                  Active Shows
                </Button>
              </CardContent>
            </Card>

            {/* Top Categories */}
            <Card>
              <CardHeader>
                <CardTitle className="text-base flex items-center gap-2">
                  <Layers className="h-4 w-4" />
                  Top Categories
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                {[
                  { name: 'Business', count: 234, color: 'blue' },
                  { name: 'Technology', count: 189, color: 'purple' },
                  { name: 'Comedy', count: 156, color: 'pink' },
                  { name: 'Health & Fitness', count: 142, color: 'green' },
                  { name: 'News', count: 98, color: 'red' },
                ].map((cat) => (
                  <button
                    key={cat.name}
                    className="w-full flex items-center justify-between p-2 rounded-md hover:bg-muted transition-colors text-left"
                  >
                    <span className="text-sm font-medium">{cat.name}</span>
                    <Badge variant="secondary" className="text-xs">
                      {cat.count}
                    </Badge>
                  </button>
                ))}
              </CardContent>
            </Card>

            {/* Recently Viewed */}
            <Card>
              <CardHeader>
                <CardTitle className="text-base flex items-center gap-2">
                  <Eye className="h-4 w-4" />
                  Recently Viewed
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                {mockPodcasts.slice(0, 3).map((podcast) => (
                  <div key={podcast.id} className="flex items-center gap-3 p-2 rounded-md hover:bg-muted transition-colors cursor-pointer">
                    <img
                      src={podcast.image}
                      alt={podcast.name}
                      className="w-10 h-10 rounded object-cover flex-shrink-0"
                    />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate">{podcast.name}</p>
                      <p className="text-xs text-muted-foreground truncate">{podcast.host}</p>
                    </div>
                  </div>
                ))}
              </CardContent>
            </Card>

            {/* Quick Actions */}
            <Card className="bg-gradient-to-br from-primary/5 to-purple-600/5">
              <CardHeader>
                <CardTitle className="text-base">Quick Actions</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                <Button className="w-full bg-gradient-to-r from-primary to-purple-600" size="sm">
                  <Plus className="h-4 w-4 mr-2" />
                  Add New Podcast
                </Button>
                <Button variant="outline" className="w-full" size="sm">
                  <Download className="h-4 w-4 mr-2" />
                  Export Database
                </Button>
                <Button variant="outline" className="w-full" size="sm">
                  <Upload className="h-4 w-4 mr-2" />
                  Import Podcasts
                </Button>
              </CardContent>
            </Card>

          </div>
        </div>
        {/* End Sidebar */}

      </div>
      {/* End Main Content with Sidebar Layout */}
      </div>
    </DashboardLayout>
  )
}
