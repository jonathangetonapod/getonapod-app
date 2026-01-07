import { useState, useEffect, useRef } from 'react'
import { DashboardLayout } from '@/components/admin/DashboardLayout'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Sheet, SheetContent } from '@/components/ui/sheet'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Separator } from '@/components/ui/separator'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { supabase } from '@/lib/supabase'
import { toast } from 'sonner'
import {
  Share2,
  Copy,
  ExternalLink,
  MoreVertical,
  Trash2,
  Eye,
  EyeOff,
  Search,
  FileSpreadsheet,
  RefreshCw,
  Users,
  TrendingUp,
  Calendar,
  Link2,
  CheckCircle2,
  XCircle,
  Clock,
  BarChart3,
  Sparkles,
  ChevronRight,
  X,
  ImageIcon,
  Save,
  Loader2,
  Upload
} from 'lucide-react'
import { format, formatDistanceToNow } from 'date-fns'
import { cn } from '@/lib/utils'

interface ProspectDashboard {
  id: string
  slug: string
  prospect_name: string
  prospect_bio: string | null
  prospect_image_url: string | null
  spreadsheet_id: string
  spreadsheet_url: string
  created_at: string
  is_active: boolean
  view_count: number
  last_viewed_at: string | null
}

export default function ProspectDashboards() {
  const [dashboards, setDashboards] = useState<ProspectDashboard[]>([])
  const [loading, setLoading] = useState(true)
  const [searchQuery, setSearchQuery] = useState('')
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false)
  const [dashboardToDelete, setDashboardToDelete] = useState<ProspectDashboard | null>(null)
  const [selectedDashboard, setSelectedDashboard] = useState<ProspectDashboard | null>(null)
  const [editImageUrl, setEditImageUrl] = useState('')
  const [savingImage, setSavingImage] = useState(false)
  const [uploadingImage, setUploadingImage] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const appUrl = window.location.origin

  useEffect(() => {
    fetchDashboards()
  }, [])

  const fetchDashboards = async () => {
    setLoading(true)
    try {
      const { data, error } = await supabase
        .from('prospect_dashboards')
        .select('*')
        .order('created_at', { ascending: false })

      if (error) throw error
      setDashboards(data || [])
    } catch (error) {
      console.error('Error fetching dashboards:', error)
      toast.error('Failed to load prospect dashboards')
    } finally {
      setLoading(false)
    }
  }

  const toggleActive = async (dashboard: ProspectDashboard) => {
    try {
      const { error } = await supabase
        .from('prospect_dashboards')
        .update({ is_active: !dashboard.is_active })
        .eq('id', dashboard.id)

      if (error) throw error

      setDashboards(prev =>
        prev.map(d =>
          d.id === dashboard.id ? { ...d, is_active: !d.is_active } : d
        )
      )

      if (selectedDashboard?.id === dashboard.id) {
        setSelectedDashboard(prev => prev ? { ...prev, is_active: !prev.is_active } : null)
      }

      toast.success(dashboard.is_active ? 'Dashboard disabled' : 'Dashboard enabled')
    } catch (error) {
      console.error('Error toggling dashboard:', error)
      toast.error('Failed to update dashboard')
    }
  }

  const deleteDashboard = async () => {
    if (!dashboardToDelete) return

    try {
      const { error } = await supabase
        .from('prospect_dashboards')
        .delete()
        .eq('id', dashboardToDelete.id)

      if (error) throw error

      setDashboards(prev => prev.filter(d => d.id !== dashboardToDelete.id))
      if (selectedDashboard?.id === dashboardToDelete.id) {
        setSelectedDashboard(null)
      }
      toast.success('Dashboard deleted')
    } catch (error) {
      console.error('Error deleting dashboard:', error)
      toast.error('Failed to delete dashboard')
    } finally {
      setDeleteDialogOpen(false)
      setDashboardToDelete(null)
    }
  }

  const copyLink = (slug: string) => {
    const url = `${appUrl}/prospect/${slug}`
    navigator.clipboard.writeText(url)
    toast.success('Dashboard link copied!')
  }

  // Sync editImageUrl when selectedDashboard changes
  useEffect(() => {
    if (selectedDashboard) {
      setEditImageUrl(selectedDashboard.prospect_image_url || '')
    }
  }, [selectedDashboard])

  const saveProfilePicture = async () => {
    if (!selectedDashboard) return

    setSavingImage(true)
    try {
      const { error } = await supabase
        .from('prospect_dashboards')
        .update({ prospect_image_url: editImageUrl.trim() || null })
        .eq('id', selectedDashboard.id)

      if (error) throw error

      // Update local state
      setDashboards(prev =>
        prev.map(d =>
          d.id === selectedDashboard.id
            ? { ...d, prospect_image_url: editImageUrl.trim() || null }
            : d
        )
      )
      setSelectedDashboard(prev =>
        prev ? { ...prev, prospect_image_url: editImageUrl.trim() || null } : null
      )

      toast.success('Profile picture updated!')
    } catch (error) {
      console.error('Error saving profile picture:', error)
      toast.error('Failed to save profile picture')
    } finally {
      setSavingImage(false)
    }
  }

  const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (!file || !selectedDashboard) return

    // Validate file type
    if (!file.type.startsWith('image/')) {
      toast.error('Please select an image file')
      return
    }

    // Validate file size (max 5MB)
    if (file.size > 5 * 1024 * 1024) {
      toast.error('Image must be less than 5MB')
      return
    }

    setUploadingImage(true)
    try {
      // Generate unique filename
      const fileExt = file.name.split('.').pop()
      const fileName = `${selectedDashboard.id}-${Date.now()}.${fileExt}`

      // Upload to Supabase Storage
      const { data, error: uploadError } = await supabase.storage
        .from('prospect-images')
        .upload(fileName, file, {
          cacheControl: '3600',
          upsert: true
        })

      if (uploadError) throw uploadError

      // Get public URL
      const { data: { publicUrl } } = supabase.storage
        .from('prospect-images')
        .getPublicUrl(fileName)

      // Update the image URL
      setEditImageUrl(publicUrl)

      // Save to database
      const { error: dbError } = await supabase
        .from('prospect_dashboards')
        .update({ prospect_image_url: publicUrl })
        .eq('id', selectedDashboard.id)

      if (dbError) throw dbError

      // Update local state
      setDashboards(prev =>
        prev.map(d =>
          d.id === selectedDashboard.id
            ? { ...d, prospect_image_url: publicUrl }
            : d
        )
      )
      setSelectedDashboard(prev =>
        prev ? { ...prev, prospect_image_url: publicUrl } : null
      )

      toast.success('Profile picture uploaded!')
    } catch (error) {
      console.error('Error uploading image:', error)
      toast.error('Failed to upload image')
    } finally {
      setUploadingImage(false)
      // Reset file input
      if (fileInputRef.current) {
        fileInputRef.current.value = ''
      }
    }
  }

  const filteredDashboards = dashboards.filter(d =>
    d.prospect_name.toLowerCase().includes(searchQuery.toLowerCase())
  )

  const totalViews = dashboards.reduce((sum, d) => sum + (d.view_count || 0), 0)
  const activeDashboards = dashboards.filter(d => d.is_active).length
  const recentlyViewed = dashboards.filter(d => {
    if (!d.last_viewed_at) return false
    const daysSince = (Date.now() - new Date(d.last_viewed_at).getTime()) / (1000 * 60 * 60 * 24)
    return daysSince <= 7
  }).length

  return (
    <DashboardLayout>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Prospect Dashboards</h1>
          <p className="text-muted-foreground mt-1">
            Create and share visual podcast opportunity dashboards with prospects
          </p>
        </div>
        <Button onClick={fetchDashboards} variant="outline" size="sm" className="w-fit">
          <RefreshCw className={cn("h-4 w-4 mr-2", loading && "animate-spin")} />
          Refresh
        </Button>
      </div>

      {/* Stats Cards */}
      <div className="grid gap-4 grid-cols-2 lg:grid-cols-4">
        <Card className="border-0 shadow-md bg-gradient-to-br from-blue-50 to-indigo-50 dark:from-blue-950/30 dark:to-indigo-950/30">
          <CardContent className="p-5">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-blue-600 dark:text-blue-400">Total Dashboards</p>
                <p className="text-3xl font-bold mt-1">{dashboards.length}</p>
              </div>
              <div className="h-12 w-12 rounded-xl bg-blue-500/10 flex items-center justify-center">
                <Share2 className="h-6 w-6 text-blue-600" />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="border-0 shadow-md bg-gradient-to-br from-green-50 to-emerald-50 dark:from-green-950/30 dark:to-emerald-950/30">
          <CardContent className="p-5">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-green-600 dark:text-green-400">Active Links</p>
                <p className="text-3xl font-bold mt-1">{activeDashboards}</p>
              </div>
              <div className="h-12 w-12 rounded-xl bg-green-500/10 flex items-center justify-center">
                <CheckCircle2 className="h-6 w-6 text-green-600" />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="border-0 shadow-md bg-gradient-to-br from-purple-50 to-violet-50 dark:from-purple-950/30 dark:to-violet-950/30">
          <CardContent className="p-5">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-purple-600 dark:text-purple-400">Total Views</p>
                <p className="text-3xl font-bold mt-1">{totalViews}</p>
              </div>
              <div className="h-12 w-12 rounded-xl bg-purple-500/10 flex items-center justify-center">
                <Eye className="h-6 w-6 text-purple-600" />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="border-0 shadow-md bg-gradient-to-br from-amber-50 to-orange-50 dark:from-amber-950/30 dark:to-orange-950/30">
          <CardContent className="p-5">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-amber-600 dark:text-amber-400">Viewed This Week</p>
                <p className="text-3xl font-bold mt-1">{recentlyViewed}</p>
              </div>
              <div className="h-12 w-12 rounded-xl bg-amber-500/10 flex items-center justify-center">
                <TrendingUp className="h-6 w-6 text-amber-600" />
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Search */}
      <div className="relative max-w-md">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          placeholder="Search prospects..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="pl-10"
        />
      </div>

      {/* Dashboard Cards */}
      {loading ? (
        <div className="grid gap-4 grid-cols-1 md:grid-cols-2 lg:grid-cols-3">
          {[1, 2, 3].map((i) => (
            <Card key={i} className="border-0 shadow-md">
              <CardContent className="p-5 space-y-4">
                <div className="flex items-start justify-between">
                  <div className="space-y-2 flex-1">
                    <div className="h-5 bg-muted rounded animate-pulse w-3/4" />
                    <div className="h-4 bg-muted rounded animate-pulse w-1/2" />
                  </div>
                  <div className="h-6 w-16 bg-muted rounded-full animate-pulse" />
                </div>
                <div className="h-4 bg-muted rounded animate-pulse w-full" />
                <div className="flex gap-2">
                  <div className="h-9 bg-muted rounded animate-pulse flex-1" />
                  <div className="h-9 w-9 bg-muted rounded animate-pulse" />
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      ) : filteredDashboards.length === 0 ? (
        <Card className="border-0 shadow-md">
          <CardContent className="p-12 text-center">
            <div className="h-16 w-16 rounded-full bg-muted flex items-center justify-center mx-auto mb-4">
              <Share2 className="h-8 w-8 text-muted-foreground" />
            </div>
            <h3 className="text-lg font-semibold mb-2">
              {searchQuery ? 'No dashboards match your search' : 'No prospect dashboards yet'}
            </h3>
            <p className="text-muted-foreground max-w-sm mx-auto">
              {searchQuery
                ? 'Try a different search term'
                : 'Create one from the Podcast Finder by selecting "New Prospect" mode and exporting podcasts.'}
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 grid-cols-1 md:grid-cols-2 lg:grid-cols-3">
          {filteredDashboards.map((dashboard) => (
            <Card
              key={dashboard.id}
              className={cn(
                "border-0 shadow-md hover:shadow-lg transition-all cursor-pointer group",
                !dashboard.is_active && "opacity-60",
                selectedDashboard?.id === dashboard.id && "ring-2 ring-primary"
              )}
              onClick={() => setSelectedDashboard(dashboard)}
            >
              <CardContent className="p-5">
                <div className="flex items-start justify-between mb-3">
                  <div className="flex-1 min-w-0">
                    <h3 className="font-semibold text-lg truncate group-hover:text-primary transition-colors">
                      {dashboard.prospect_name}
                    </h3>
                    <p className="text-sm text-muted-foreground">
                      Created {formatDistanceToNow(new Date(dashboard.created_at), { addSuffix: true })}
                    </p>
                  </div>
                  <Badge
                    variant={dashboard.is_active ? 'default' : 'secondary'}
                    className={cn(
                      "ml-2 shrink-0",
                      dashboard.is_active && "bg-green-500 hover:bg-green-500"
                    )}
                  >
                    {dashboard.is_active ? 'Active' : 'Disabled'}
                  </Badge>
                </div>

                {dashboard.prospect_bio && (
                  <p className="text-sm text-muted-foreground line-clamp-2 mb-4">
                    {dashboard.prospect_bio}
                  </p>
                )}

                {/* Stats Row */}
                <div className="flex items-center gap-4 mb-4 text-sm">
                  <div className="flex items-center gap-1.5 text-muted-foreground">
                    <Eye className="h-4 w-4" />
                    <span className="font-medium">{dashboard.view_count || 0}</span>
                    <span>views</span>
                  </div>
                  {dashboard.last_viewed_at && (
                    <div className="flex items-center gap-1.5 text-muted-foreground">
                      <Clock className="h-4 w-4" />
                      <span>{formatDistanceToNow(new Date(dashboard.last_viewed_at), { addSuffix: true })}</span>
                    </div>
                  )}
                </div>

                {/* Actions */}
                <div className="flex gap-2" onClick={(e) => e.stopPropagation()}>
                  <Button
                    variant="default"
                    size="sm"
                    className="flex-1"
                    onClick={() => copyLink(dashboard.slug)}
                  >
                    <Copy className="h-4 w-4 mr-2" />
                    Copy Link
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => window.open(`${appUrl}/prospect/${dashboard.slug}`, '_blank')}
                  >
                    <ExternalLink className="h-4 w-4" />
                  </Button>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="outline" size="sm">
                        <MoreVertical className="h-4 w-4" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem
                        onClick={() => window.open(dashboard.spreadsheet_url, '_blank')}
                      >
                        <FileSpreadsheet className="h-4 w-4 mr-2" />
                        Edit Google Sheet
                      </DropdownMenuItem>
                      <DropdownMenuItem onClick={() => toggleActive(dashboard)}>
                        {dashboard.is_active ? (
                          <>
                            <EyeOff className="h-4 w-4 mr-2" />
                            Disable Link
                          </>
                        ) : (
                          <>
                            <Eye className="h-4 w-4 mr-2" />
                            Enable Link
                          </>
                        )}
                      </DropdownMenuItem>
                      <DropdownMenuItem
                        className="text-destructive"
                        onClick={() => {
                          setDashboardToDelete(dashboard)
                          setDeleteDialogOpen(true)
                        }}
                      >
                        <Trash2 className="h-4 w-4 mr-2" />
                        Delete
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Side Panel */}
      <Sheet open={!!selectedDashboard} onOpenChange={() => setSelectedDashboard(null)}>
        <SheetContent className="w-full sm:max-w-lg p-0 overflow-hidden">
          {selectedDashboard && (
            <div className="flex flex-col h-full">
              {/* Header */}
              <div className="p-6 bg-gradient-to-br from-primary/10 to-purple-500/10 border-b">
                <div className="flex items-start justify-between mb-4">
                  <Badge
                    variant={selectedDashboard.is_active ? 'default' : 'secondary'}
                    className={cn(
                      selectedDashboard.is_active && "bg-green-500 hover:bg-green-500"
                    )}
                  >
                    {selectedDashboard.is_active ? 'Active' : 'Disabled'}
                  </Badge>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8 -mr-2 -mt-2"
                    onClick={() => setSelectedDashboard(null)}
                  >
                    <X className="h-4 w-4" />
                  </Button>
                </div>
                <h2 className="text-2xl font-bold">{selectedDashboard.prospect_name}</h2>
                {selectedDashboard.prospect_bio && (
                  <p className="text-muted-foreground mt-2 text-sm">{selectedDashboard.prospect_bio}</p>
                )}
              </div>

              <ScrollArea className="flex-1">
                <div className="p-6 space-y-6">
                  {/* Stats */}
                  <div className="grid grid-cols-2 gap-4">
                    <div className="p-4 rounded-xl bg-purple-50 dark:bg-purple-950/30">
                      <div className="flex items-center gap-2 mb-1">
                        <Eye className="h-4 w-4 text-purple-600" />
                        <span className="text-sm font-medium text-purple-600">Total Views</span>
                      </div>
                      <p className="text-2xl font-bold">{selectedDashboard.view_count || 0}</p>
                    </div>
                    <div className="p-4 rounded-xl bg-blue-50 dark:bg-blue-950/30">
                      <div className="flex items-center gap-2 mb-1">
                        <Calendar className="h-4 w-4 text-blue-600" />
                        <span className="text-sm font-medium text-blue-600">Created</span>
                      </div>
                      <p className="text-lg font-bold">
                        {format(new Date(selectedDashboard.created_at), 'MMM d, yyyy')}
                      </p>
                    </div>
                  </div>

                  {selectedDashboard.last_viewed_at && (
                    <div className="p-4 rounded-xl bg-amber-50 dark:bg-amber-950/30">
                      <div className="flex items-center gap-2 mb-1">
                        <Clock className="h-4 w-4 text-amber-600" />
                        <span className="text-sm font-medium text-amber-600">Last Viewed</span>
                      </div>
                      <p className="font-semibold">
                        {format(new Date(selectedDashboard.last_viewed_at), 'MMM d, yyyy')} at {format(new Date(selectedDashboard.last_viewed_at), 'h:mm a')}
                      </p>
                      <p className="text-sm text-muted-foreground">
                        {formatDistanceToNow(new Date(selectedDashboard.last_viewed_at), { addSuffix: true })}
                      </p>
                    </div>
                  )}

                  <Separator />

                  {/* Profile Picture */}
                  <div className="space-y-3">
                    <h3 className="font-semibold flex items-center gap-2">
                      <ImageIcon className="h-4 w-4" />
                      Profile Picture
                    </h3>

                    {/* Preview */}
                    {editImageUrl && (
                      <div className="flex justify-center">
                        <div className="h-20 w-20 rounded-full overflow-hidden ring-2 ring-muted shadow-md">
                          <img
                            src={editImageUrl}
                            alt="Preview"
                            className="w-full h-full object-cover"
                            onError={(e) => {
                              (e.target as HTMLImageElement).style.display = 'none'
                            }}
                          />
                        </div>
                      </div>
                    )}

                    {/* Upload Button */}
                    <input
                      type="file"
                      ref={fileInputRef}
                      onChange={handleFileUpload}
                      accept="image/*"
                      className="hidden"
                    />
                    <Button
                      variant="outline"
                      className="w-full"
                      onClick={() => fileInputRef.current?.click()}
                      disabled={uploadingImage}
                    >
                      {uploadingImage ? (
                        <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      ) : (
                        <Upload className="h-4 w-4 mr-2" />
                      )}
                      {uploadingImage ? 'Uploading...' : 'Upload from Desktop'}
                    </Button>

                    {/* Or use URL */}
                    <div className="relative">
                      <div className="absolute inset-0 flex items-center">
                        <span className="w-full border-t" />
                      </div>
                      <div className="relative flex justify-center text-xs uppercase">
                        <span className="bg-background px-2 text-muted-foreground">Or paste URL</span>
                      </div>
                    </div>

                    <div className="flex gap-2">
                      <Input
                        placeholder="Paste image URL..."
                        value={editImageUrl}
                        onChange={(e) => setEditImageUrl(e.target.value)}
                        className="text-sm"
                      />
                      <Button
                        variant="outline"
                        size="icon"
                        onClick={saveProfilePicture}
                        disabled={savingImage || editImageUrl === (selectedDashboard.prospect_image_url || '')}
                      >
                        {savingImage ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                          <Save className="h-4 w-4" />
                        )}
                      </Button>
                    </div>
                    <p className="text-xs text-muted-foreground">
                      This will appear on the prospect's dashboard
                    </p>
                  </div>

                  <Separator />

                  {/* Shareable Link */}
                  <div className="space-y-3">
                    <h3 className="font-semibold flex items-center gap-2">
                      <Link2 className="h-4 w-4" />
                      Shareable Link
                    </h3>
                    <div className="flex gap-2">
                      <Input
                        value={`${appUrl}/prospect/${selectedDashboard.slug}`}
                        readOnly
                        className="text-sm"
                      />
                      <Button
                        variant="outline"
                        size="icon"
                        onClick={() => copyLink(selectedDashboard.slug)}
                      >
                        <Copy className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>

                  <Separator />

                  {/* Quick Actions */}
                  <div className="space-y-3">
                    <h3 className="font-semibold">Quick Actions</h3>
                    <div className="space-y-2">
                      <Button
                        variant="outline"
                        className="w-full justify-start"
                        onClick={() => window.open(`${appUrl}/prospect/${selectedDashboard.slug}`, '_blank')}
                      >
                        <ExternalLink className="h-4 w-4 mr-3" />
                        View Dashboard
                        <ChevronRight className="h-4 w-4 ml-auto" />
                      </Button>
                      <Button
                        variant="outline"
                        className="w-full justify-start"
                        onClick={() => window.open(selectedDashboard.spreadsheet_url, '_blank')}
                      >
                        <FileSpreadsheet className="h-4 w-4 mr-3" />
                        Edit Google Sheet
                        <ChevronRight className="h-4 w-4 ml-auto" />
                      </Button>
                      <Button
                        variant="outline"
                        className="w-full justify-start"
                        onClick={() => toggleActive(selectedDashboard)}
                      >
                        {selectedDashboard.is_active ? (
                          <>
                            <EyeOff className="h-4 w-4 mr-3" />
                            Disable Link
                          </>
                        ) : (
                          <>
                            <Eye className="h-4 w-4 mr-3" />
                            Enable Link
                          </>
                        )}
                        <ChevronRight className="h-4 w-4 ml-auto" />
                      </Button>
                      <Button
                        variant="outline"
                        className="w-full justify-start text-destructive hover:text-destructive"
                        onClick={() => {
                          setDashboardToDelete(selectedDashboard)
                          setDeleteDialogOpen(true)
                        }}
                      >
                        <Trash2 className="h-4 w-4 mr-3" />
                        Delete Dashboard
                        <ChevronRight className="h-4 w-4 ml-auto" />
                      </Button>
                    </div>
                  </div>
                </div>
              </ScrollArea>

              {/* Footer CTA */}
              <div className="p-4 border-t bg-muted/30">
                <Button
                  className="w-full"
                  onClick={() => copyLink(selectedDashboard.slug)}
                >
                  <Copy className="h-4 w-4 mr-2" />
                  Copy Link to Share
                </Button>
              </div>
            </div>
          )}
        </SheetContent>
      </Sheet>

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Prospect Dashboard?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete the dashboard for "{dashboardToDelete?.prospect_name}".
              The Google Sheet will remain but the shareable link will no longer work.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={deleteDashboard}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      </div>
    </DashboardLayout>
  )
}
