import { useState } from 'react'
import { useParams, Link } from 'react-router-dom'
import { DashboardLayout } from '@/components/admin/DashboardLayout'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog'
import { Label } from '@/components/ui/label'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import {
  ArrowLeft,
  Plus,
  Edit,
  Calendar,
  Mail,
  User,
  Globe,
  Linkedin,
  CheckCircle2,
  Clock,
  Video,
  CheckCheck,
  ExternalLink
} from 'lucide-react'

// Mock client data
const mockClient = {
  id: '1',
  name: 'Client A',
  email: 'clienta@example.com',
  contactPerson: 'John Smith',
  linkedin: 'https://linkedin.com/in/johnsmith',
  website: 'https://clienta.com',
  calendarLink: 'https://calendly.com/clienta',
  status: 'active' as const,
  notes: 'Great client, very responsive. Prefers morning recordings.',
  firstInvoicePaidDate: '2024-01-15',
  createdAt: '2024-01-10'
}

const mockBookings = [
  {
    id: '1',
    podcastName: 'Tech Talks Podcast',
    hostName: 'Sarah Johnson',
    podcastUrl: 'https://techtalkspod.com',
    scheduledDate: '2025-01-15',
    recordingDate: null,
    publishDate: null,
    status: 'booked' as const,
    episodeUrl: null,
    prepSent: true,
    notes: 'Focus on AI and automation topics'
  },
  {
    id: '2',
    podcastName: 'Marketing Masterclass',
    hostName: 'Mike Chen',
    podcastUrl: 'https://marketingmasterclass.com',
    scheduledDate: '2025-01-22',
    recordingDate: null,
    publishDate: null,
    status: 'in_progress' as const,
    episodeUrl: null,
    prepSent: false,
    notes: 'Waiting for final confirmation on topics'
  },
  {
    id: '3',
    podcastName: 'Business Builders',
    hostName: 'Lisa Wong',
    podcastUrl: 'https://businessbuilders.fm',
    scheduledDate: '2025-01-08',
    recordingDate: '2025-01-08',
    publishDate: null,
    status: 'recorded' as const,
    episodeUrl: null,
    prepSent: true,
    notes: 'Great session, host loved the insights'
  },
  {
    id: '4',
    podcastName: 'The Growth Show',
    hostName: 'David Park',
    podcastUrl: 'https://growthshow.com',
    scheduledDate: '2024-12-20',
    recordingDate: '2024-12-20',
    publishDate: '2025-01-05',
    status: 'published' as const,
    episodeUrl: 'https://growthshow.com/episode/123',
    prepSent: true,
    notes: 'Episode performed really well'
  },
]

export default function ClientDetail() {
  const { id } = useParams<{ id: string }>()
  const [isAddBookingModalOpen, setIsAddBookingModalOpen] = useState(false)
  const [statusFilter, setStatusFilter] = useState('all')

  const filteredBookings = mockBookings.filter(booking =>
    statusFilter === 'all' || booking.status === statusFilter
  )

  const bookedCount = mockBookings.filter(b => b.status === 'booked').length
  const inProgressCount = mockBookings.filter(b => b.status === 'in_progress').length
  const recordedCount = mockBookings.filter(b => b.status === 'recorded').length
  const publishedCount = mockBookings.filter(b => b.status === 'published').length
  const thisMonthCount = mockBookings.filter(b => {
    const bookingDate = new Date(b.scheduledDate)
    const now = new Date()
    return bookingDate.getMonth() === now.getMonth() && bookingDate.getFullYear() === now.getFullYear()
  }).length

  const getStatusBadge = (status: string) => {
    const styles = {
      booked: { bg: 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200', icon: CheckCircle2 },
      in_progress: { bg: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200', icon: Clock },
      recorded: { bg: 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200', icon: Video },
      published: { bg: 'bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200', icon: CheckCheck },
    }
    const config = styles[status as keyof typeof styles]
    const Icon = config.icon
    return (
      <Badge className={config.bg}>
        <Icon className="h-3 w-3 mr-1" />
        {status.split('_').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ')}
      </Badge>
    )
  }

  const formatDate = (dateString: string | null) => {
    if (!dateString) return '-'
    return new Date(dateString).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric'
    })
  }

  return (
    <DashboardLayout>
      <div className="space-y-6">
        {/* Back Button */}
        <Link to="/admin/clients" className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground">
          <ArrowLeft className="h-4 w-4" />
          Back to Clients
        </Link>

        {/* Header */}
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div>
            <h1 className="text-3xl font-bold">{mockClient.name}</h1>
            <div className="flex items-center gap-2 mt-2">
              <Badge className="bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200">
                Active
              </Badge>
              <span className="text-sm text-muted-foreground">
                Joined {formatDate(mockClient.createdAt)}
              </span>
            </div>
          </div>
          <div className="flex gap-2">
            <Button variant="outline">
              <Edit className="h-4 w-4 mr-2" />
              Edit Client
            </Button>
            <Button onClick={() => setIsAddBookingModalOpen(true)}>
              <Plus className="h-4 w-4 mr-2" />
              Add Booking
            </Button>
          </div>
        </div>

        {/* Info and Stats */}
        <div className="grid gap-6 md:grid-cols-2">
          {/* Client Info */}
          <Card>
            <CardHeader>
              <CardTitle>Client Information</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {mockClient.email && (
                <div className="flex items-center gap-3">
                  <Mail className="h-4 w-4 text-muted-foreground" />
                  <div>
                    <p className="text-sm font-medium">Email</p>
                    <p className="text-sm text-muted-foreground">{mockClient.email}</p>
                  </div>
                </div>
              )}
              {mockClient.contactPerson && (
                <div className="flex items-center gap-3">
                  <User className="h-4 w-4 text-muted-foreground" />
                  <div>
                    <p className="text-sm font-medium">Contact Person</p>
                    <p className="text-sm text-muted-foreground">{mockClient.contactPerson}</p>
                  </div>
                </div>
              )}
              {mockClient.linkedin && (
                <div className="flex items-center gap-3">
                  <Linkedin className="h-4 w-4 text-muted-foreground" />
                  <div>
                    <p className="text-sm font-medium">LinkedIn</p>
                    <a
                      href={mockClient.linkedin}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-sm text-primary hover:underline"
                    >
                      View Profile
                    </a>
                  </div>
                </div>
              )}
              {mockClient.website && (
                <div className="flex items-center gap-3">
                  <Globe className="h-4 w-4 text-muted-foreground" />
                  <div>
                    <p className="text-sm font-medium">Website</p>
                    <a
                      href={mockClient.website}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-sm text-primary hover:underline"
                    >
                      Visit Website
                    </a>
                  </div>
                </div>
              )}
              {mockClient.calendarLink && (
                <div className="flex items-center gap-3">
                  <Calendar className="h-4 w-4 text-muted-foreground" />
                  <div>
                    <p className="text-sm font-medium">Calendar</p>
                    <a
                      href={mockClient.calendarLink}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-sm text-primary hover:underline"
                    >
                      Book Time
                    </a>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Progress Stats */}
          <Card>
            <CardHeader>
              <CardTitle>Progress Overview</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
                <div className="text-center p-4 bg-muted rounded-lg">
                  <div className="text-2xl font-bold">{mockBookings.length}</div>
                  <div className="text-xs text-muted-foreground mt-1">Total</div>
                </div>
                <div className="text-center p-4 bg-muted rounded-lg">
                  <div className="text-2xl font-bold text-green-600">{bookedCount}</div>
                  <div className="text-xs text-muted-foreground mt-1">Booked</div>
                </div>
                <div className="text-center p-4 bg-muted rounded-lg">
                  <div className="text-2xl font-bold text-yellow-600">{inProgressCount}</div>
                  <div className="text-xs text-muted-foreground mt-1">In Progress</div>
                </div>
                <div className="text-center p-4 bg-muted rounded-lg">
                  <div className="text-2xl font-bold text-blue-600">{recordedCount}</div>
                  <div className="text-xs text-muted-foreground mt-1">Recorded</div>
                </div>
                <div className="text-center p-4 bg-muted rounded-lg">
                  <div className="text-2xl font-bold text-purple-600">{publishedCount}</div>
                  <div className="text-xs text-muted-foreground mt-1">Published</div>
                </div>
                <div className="text-center p-4 bg-muted rounded-lg">
                  <div className="text-2xl font-bold">{thisMonthCount}</div>
                  <div className="text-xs text-muted-foreground mt-1">This Month</div>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Notes */}
        {mockClient.notes && (
          <Card>
            <CardHeader>
              <CardTitle>Notes</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground">{mockClient.notes}</p>
            </CardContent>
          </Card>
        )}

        {/* Booking Timeline */}
        <Card>
          <CardHeader>
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
              <CardTitle>Booking Timeline</CardTitle>
              <Select value={statusFilter} onValueChange={setStatusFilter}>
                <SelectTrigger className="w-full sm:w-[180px]">
                  <SelectValue placeholder="Filter by status" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Status</SelectItem>
                  <SelectItem value="booked">Booked</SelectItem>
                  <SelectItem value="in_progress">In Progress</SelectItem>
                  <SelectItem value="recorded">Recorded</SelectItem>
                  <SelectItem value="published">Published</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Date</TableHead>
                    <TableHead>Podcast</TableHead>
                    <TableHead>Host</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Episode</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredBookings.map((booking) => (
                    <TableRow key={booking.id}>
                      <TableCell className="font-medium">
                        {formatDate(booking.scheduledDate)}
                      </TableCell>
                      <TableCell>
                        <div>
                          <p className="font-medium">{booking.podcastName}</p>
                          {booking.notes && (
                            <p className="text-xs text-muted-foreground mt-1">
                              {booking.notes}
                            </p>
                          )}
                        </div>
                      </TableCell>
                      <TableCell className="text-muted-foreground">
                        {booking.hostName}
                      </TableCell>
                      <TableCell>
                        {getStatusBadge(booking.status)}
                      </TableCell>
                      <TableCell>
                        {booking.episodeUrl ? (
                          <a
                            href={booking.episodeUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-1 text-sm text-primary hover:underline"
                          >
                            Listen
                            <ExternalLink className="h-3 w-3" />
                          </a>
                        ) : (
                          <span className="text-sm text-muted-foreground">-</span>
                        )}
                      </TableCell>
                      <TableCell className="text-right">
                        <Button variant="ghost" size="sm">
                          <Edit className="h-4 w-4" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>

            {filteredBookings.length === 0 && (
              <div className="text-center py-12">
                <p className="text-muted-foreground">No bookings found</p>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Add Booking Modal */}
      <Dialog open={isAddBookingModalOpen} onOpenChange={setIsAddBookingModalOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Add Booking for {mockClient.name}</DialogTitle>
            <DialogDescription>Create a new podcast booking</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="podcastName">Podcast Name *</Label>
              <Input id="podcastName" placeholder="Enter podcast name" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="hostName">Host Name</Label>
              <Input id="hostName" placeholder="Enter host name" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="podcastUrl">Podcast URL</Label>
              <Input id="podcastUrl" placeholder="https://..." />
            </div>
            <div className="space-y-2">
              <Label htmlFor="scheduledDate">Scheduled Date</Label>
              <Input id="scheduledDate" type="date" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="status">Status</Label>
              <Select defaultValue="booked">
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="booked">Booked</SelectItem>
                  <SelectItem value="in_progress">In Progress</SelectItem>
                  <SelectItem value="recorded">Recorded</SelectItem>
                  <SelectItem value="published">Published</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="notes">Notes</Label>
              <Textarea id="notes" placeholder="Any notes about this booking..." />
            </div>
            <div className="flex justify-end gap-2 pt-4">
              <Button variant="outline" onClick={() => setIsAddBookingModalOpen(false)}>
                Cancel
              </Button>
              <Button onClick={() => setIsAddBookingModalOpen(false)}>
                Save Booking
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </DashboardLayout>
  )
}
