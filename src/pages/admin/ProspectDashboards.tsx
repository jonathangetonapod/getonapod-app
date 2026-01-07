import { useState, useEffect } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
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
  MoreHorizontal,
  Trash2,
  Eye,
  EyeOff,
  Search,
  FileSpreadsheet,
  RefreshCw
} from 'lucide-react'
import { format } from 'date-fns'

interface ProspectDashboard {
  id: string
  slug: string
  prospect_name: string
  prospect_bio: string | null
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

  const filteredDashboards = dashboards.filter(d =>
    d.prospect_name.toLowerCase().includes(searchQuery.toLowerCase())
  )

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Prospect Dashboards</h1>
          <p className="text-muted-foreground">
            Manage shareable podcast opportunity dashboards for prospects
          </p>
        </div>
        <Button onClick={fetchDashboards} variant="outline" size="sm">
          <RefreshCw className="h-4 w-4 mr-2" />
          Refresh
        </Button>
      </div>

      {/* Stats Cards */}
      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Dashboards</CardTitle>
            <Share2 className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{dashboards.length}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Active Links</CardTitle>
            <Eye className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {dashboards.filter(d => d.is_active).length}
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Views</CardTitle>
            <ExternalLink className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {dashboards.reduce((sum, d) => sum + (d.view_count || 0), 0)}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Dashboards Table */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle>All Prospect Dashboards</CardTitle>
              <CardDescription>
                Click "Copy Link" to share with prospects. They'll see a visual dashboard of podcast opportunities.
              </CardDescription>
            </div>
            <div className="relative w-64">
              <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search by name..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-8"
              />
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="flex items-center justify-center py-8">
              <RefreshCw className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : filteredDashboards.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              {searchQuery ? 'No dashboards match your search' : 'No prospect dashboards created yet'}
              <p className="text-sm mt-2">
                Create one from the Podcast Finder by selecting "New Prospect" and exporting podcasts.
              </p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Prospect</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Created</TableHead>
                  <TableHead>Views</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredDashboards.map((dashboard) => (
                  <TableRow key={dashboard.id}>
                    <TableCell>
                      <div>
                        <p className="font-medium">{dashboard.prospect_name}</p>
                        {dashboard.prospect_bio && (
                          <p className="text-xs text-muted-foreground line-clamp-1 max-w-xs">
                            {dashboard.prospect_bio}
                          </p>
                        )}
                      </div>
                    </TableCell>
                    <TableCell>
                      <Badge variant={dashboard.is_active ? 'default' : 'secondary'}>
                        {dashboard.is_active ? 'Active' : 'Disabled'}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <div className="text-sm">
                        {format(new Date(dashboard.created_at), 'MMM d, yyyy')}
                      </div>
                      <div className="text-xs text-muted-foreground">
                        {format(new Date(dashboard.created_at), 'h:mm a')}
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="text-sm">{dashboard.view_count || 0}</div>
                      {dashboard.last_viewed_at && (
                        <div className="text-xs text-muted-foreground">
                          Last: {format(new Date(dashboard.last_viewed_at), 'MMM d')}
                        </div>
                      )}
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex items-center justify-end gap-2">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => copyLink(dashboard.slug)}
                        >
                          <Copy className="h-3 w-3 mr-1" />
                          Copy Link
                        </Button>
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="sm">
                              <MoreHorizontal className="h-4 w-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem
                              onClick={() => window.open(`${appUrl}/prospect/${dashboard.slug}`, '_blank')}
                            >
                              <ExternalLink className="h-4 w-4 mr-2" />
                              View Dashboard
                            </DropdownMenuItem>
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
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

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
  )
}
