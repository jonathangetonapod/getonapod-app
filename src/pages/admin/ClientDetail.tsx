import { useState, useEffect } from 'react'
import { useParams, Link, useNavigate } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useClientPortal } from '@/contexts/ClientPortalContext'
import { DashboardLayout } from '@/components/admin/DashboardLayout'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog'
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog'
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible'
import { useToast } from '@/hooks/use-toast'
import { Label } from '@/components/ui/label'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Switch } from '@/components/ui/switch'
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
  ExternalLink,
  Loader2,
  Trash2,
  ChevronLeft,
  ChevronRight,
  AlertCircle,
  Rocket,
  Download,
  MessageSquare,
  XCircle,
  Lock,
  Unlock,
  Copy,
  Send,
  Save,
  Upload,
  Image,
  X,
  FileText,
  Sparkles,
  Eye,
  Key,
  EyeOff,
  RefreshCw,
  Package,
  ChevronUp,
  ChevronDown,
  Mic,
  ListChecks,
  Brain,
  ThumbsUp,
  ThumbsDown
} from 'lucide-react'
import { getClientById, updateClient, uploadClientPhoto, removeClientPhoto, deleteClient, setClientPassword, clearClientPassword, generatePassword } from '@/services/clients'
import { getBookings, createBooking, updateBooking, deleteBooking } from '@/services/bookings'
import { getPodcastById } from '@/services/podscan'
import { updatePortalAccess, sendPortalInvitation } from '@/services/clientPortal'
import { createClientGoogleSheet } from '@/services/googleSheets'
import { getClientAddons, updateBookingAddonStatus, deleteBookingAddon, getAddonStatusColor, getAddonStatusText, formatPrice } from '@/services/addonServices'
import type { BookingAddon } from '@/services/addonServices'
import { getClientCacheStatus, findCachedPodcastsMetadata } from '@/services/podcastCache'
import type { PodcastOutreachAction } from '@/services/podcastCache'
import { PodcastOutreachSwiper } from '@/components/admin/PodcastOutreachSwiper'
import { supabase } from '@/lib/supabase'
import { cn } from '@/lib/utils'

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL

type TimeRange = 30 | 60 | 90 | 180

export default function ClientDetail() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const { impersonateClient } = useClientPortal()
  const { toast } = useToast()
  const [isAddBookingModalOpen, setIsAddBookingModalOpen] = useState(false)
  const [isEditClientModalOpen, setIsEditClientModalOpen] = useState(false)
  const [isPodcastDetailsModalOpen, setIsPodcastDetailsModalOpen] = useState(false)
  const [viewingPodcast, setViewingPodcast] = useState<any>(null)
  const [statusFilter, setStatusFilter] = useState('all')
  const [selectedDate, setSelectedDate] = useState(new Date())
  const [upcomingTimeRange, setUpcomingTimeRange] = useState<TimeRange>(30)
  const [goingLiveTimeRange, setGoingLiveTimeRange] = useState<TimeRange>(30)
  const [editingBooking, setEditingBooking] = useState<any>(null)
  const [deletingBooking, setDeletingBooking] = useState<any>(null)
  const [orderToDelete, setOrderToDelete] = useState<BookingAddon | null>(null)
  const [isDeleteClientDialogOpen, setIsDeleteClientDialogOpen] = useState(false)
  const [fetchingPodcast, setFetchingPodcast] = useState(false)
  const [sendingInvitation, setSendingInvitation] = useState(false)
  const [togglingPortalAccess, setTogglingPortalAccess] = useState(false)
  const [settingPassword, setSettingPassword] = useState(false)
  const [showPassword, setShowPassword] = useState(false)
  const [newPassword, setNewPassword] = useState('')
  const [uploadingPhoto, setUploadingPhoto] = useState(false)
  const [photoFile, setPhotoFile] = useState<File | null>(null)
  const [photoPreview, setPhotoPreview] = useState<string | null>(null)
  const [creatingSheet, setCreatingSheet] = useState(false)
  const [bioExpanded, setBioExpanded] = useState(false)
  const [editMediaKitUrl, setEditMediaKitUrl] = useState('')
  const [savingMediaKit, setSavingMediaKit] = useState(false)
  // Podcast Approval Dashboard state
  const [dashboardCacheLoading, setDashboardCacheLoading] = useState(false)
  const [dashboardAiLoading, setDashboardAiLoading] = useState(false)
  const [dashboardCacheStatus, setDashboardCacheStatus] = useState<{
    cached: number
    aiAnalyzed: number
    total: number
    cached_in_client?: number
    cached_in_other_clients?: number
    cached_in_prospects?: number
    cached_in_bookings?: number
    needs_fetch?: number
  } | null>(null)
  const [expandedFeedbackSection, setExpandedFeedbackSection] = useState<'approved' | 'rejected' | 'notes' | null>(null)
  const [deletingPodcastId, setDeletingPodcastId] = useState<string | null>(null)
  const [deletingAllRejected, setDeletingAllRejected] = useState(false)
  // Podcast Outreach state
  const [webhookUrl, setWebhookUrl] = useState('')
  const [outreachModeActive, setOutreachModeActive] = useState(false)
  const [expandedOutreachSection, setExpandedOutreachSection] = useState<'sent' | 'skipped' | null>(null)
  const [currentPodcastIndex, setCurrentPodcastIndex] = useState(0)
  const [sendingWebhook, setSendingWebhook] = useState(false)
  const [savingWebhookUrl, setSavingWebhookUrl] = useState(false)
  const [editBookingForm, setEditBookingForm] = useState({
    podcast_name: '',
    host_name: '',
    podcast_url: '',
    scheduled_date: '',
    recording_date: '',
    publish_date: '',
    episode_url: '',
    status: 'booked' as const,
    notes: '',
    prep_sent: false
  })
  const [newBookingForm, setNewBookingForm] = useState({
    podcast_id: '',
    podcast_name: '',
    host_name: '',
    podcast_url: '',
    scheduled_date: '',
    status: 'booked' as const,
    notes: '',
    audience_size: null as number | null,
    podcast_description: '',
    itunes_rating: null as number | null,
    itunes_rating_count: null as number | null,
    episode_count: null as number | null,
    podcast_image_url: '',
    rss_url: ''
  })
  const [editClientForm, setEditClientForm] = useState({
    name: '',
    email: '',
    contact_person: '',
    linkedin_url: '',
    website: '',
    status: 'active' as const,
    notes: '',
    bio: '',
    google_sheet_url: '',
    media_kit_url: '',
    prospect_dashboard_slug: '',
    bison_campaign_id: ''
  })

  const queryClient = useQueryClient()

  const selectedMonth = selectedDate.getMonth()
  const selectedYear = selectedDate.getFullYear()
  const monthNames = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']

  // Fetch client data
  const { data: client, isLoading: clientLoading } = useQuery({
    queryKey: ['client', id],
    queryFn: () => getClientById(id!),
    enabled: !!id
  })

  // Fetch bookings for this client
  const { data: bookingsData, isLoading: bookingsLoading } = useQuery({
    queryKey: ['bookings', 'client', id],
    queryFn: () => getBookings({ client_id: id }),
    enabled: !!id
  })

  // Fetch addon orders for this client
  const { data: clientAddons, isLoading: addonsLoading } = useQuery({
    queryKey: ['client-addons', id],
    queryFn: () => getClientAddons(id!),
    enabled: !!id
  })

  // Fetch client podcast feedback
  const { data: clientFeedback = [] } = useQuery({
    queryKey: ['client-feedback', id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('client_podcast_feedback')
        .select('*')
        .eq('client_id', id)
        .order('updated_at', { ascending: false })
      if (error) throw error
      return data || []
    },
    enabled: !!id
  })

  // Fetch prospect dashboards for linking
  const { data: prospectDashboards = [] } = useQuery({
    queryKey: ['prospect-dashboards-list'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('prospect_dashboards')
        .select('id, slug, prospect_name, is_active')
        .order('prospect_name', { ascending: true })
      if (error) throw error
      return data || []
    }
  })

  // Fetch outreach actions for this client
  const { data: outreachActions = [], refetch: refetchOutreachActions } = useQuery<PodcastOutreachAction[]>({
    queryKey: ['podcast-outreach-actions', id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('podcast_outreach_actions')
        .select('*')
        .eq('client_id', id)
        .order('created_at', { ascending: false })
      if (error) throw error
      return data || []
    },
    enabled: !!id
  })

  // Fetch cached podcasts for outreach
  const { data: cachedPodcasts = [], refetch: refetchCachedPodcasts } = useQuery({
    queryKey: ['client-cached-podcasts', id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('client_dashboard_podcasts')
        .select('*')
        .eq('client_id', id)
        .order('podcast_name', { ascending: true })
      if (error) throw error
      return data || []
    },
    enabled: !!id
  })

  // Create booking mutation
  const createBookingMutation = useMutation({
    mutationFn: createBooking,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['bookings', 'client', id] })
      queryClient.invalidateQueries({ queryKey: ['bookings', 'all'] })
      toast({
        title: 'Booking Created',
        description: 'Successfully created podcast booking',
      })
      setIsAddBookingModalOpen(false)
      setNewBookingForm({
        podcast_id: '',
        podcast_name: '',
        host_name: '',
        podcast_url: '',
        scheduled_date: '',
        status: 'booked',
        notes: '',
        audience_size: null,
        podcast_description: '',
        itunes_rating: null,
        itunes_rating_count: null,
        episode_count: null,
        podcast_image_url: '',
        rss_url: ''
      })
    },
    onError: (error) => {
      console.error('Failed to create booking:', error)
      toast({
        title: 'Failed to Create Booking',
        description: error instanceof Error ? error.message : 'An unknown error occurred',
        variant: 'destructive'
      })
    }
  })

  const updateBookingMutation = useMutation({
    mutationFn: ({ id, updates }: { id: string, updates: any }) => updateBooking(id, updates),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['bookings', 'client', id] })
      queryClient.invalidateQueries({ queryKey: ['bookings', 'all'] })
      queryClient.invalidateQueries({ queryKey: ['bookings'] })
      toast({
        title: 'Booking Updated',
        description: 'Successfully updated booking',
      })
      setEditingBooking(null)
    },
    onError: (error) => {
      console.error('Failed to update booking:', error)
      toast({
        title: 'Failed to Update Booking',
        description: error instanceof Error ? error.message : 'An unknown error occurred',
        variant: 'destructive'
      })
    }
  })

  const deleteBookingMutation = useMutation({
    mutationFn: (id: string) => deleteBooking(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['bookings', 'client', id] })
      queryClient.invalidateQueries({ queryKey: ['bookings', 'all'] })
      toast({
        title: 'Booking Deleted',
        description: 'Successfully deleted booking',
      })
      setDeletingBooking(null)
    },
    onError: (error) => {
      console.error('Failed to delete booking:', error)
      toast({
        title: 'Failed to Delete Booking',
        description: error instanceof Error ? error.message : 'An unknown error occurred',
        variant: 'destructive'
      })
      setDeletingBooking(null)
    }
  })

  const deleteOrderMutation = useMutation({
    mutationFn: deleteBookingAddon,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['client-addons', id] })
      queryClient.invalidateQueries({ queryKey: ['all-booking-addons'] })
      toast({
        title: 'Order Deleted',
        description: 'Add-on order has been successfully deleted',
      })
      setOrderToDelete(null)
    },
    onError: (error: Error) => {
      toast({
        title: 'Error',
        description: error.message || 'Failed to delete order',
        variant: 'destructive',
      })
    }
  })

  const updateClientMutation = useMutation({
    mutationFn: ({ id, updates }: { id: string, updates: any }) => updateClient(id, updates),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['client', id] })
      queryClient.invalidateQueries({ queryKey: ['clients'] })
      setIsEditClientModalOpen(false)
    }
  })

  // Delete client mutation
  const deleteClientMutation = useMutation({
    mutationFn: deleteClient,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['clients'] })
      toast({
        title: 'Client Deleted',
        description: 'Client has been successfully deleted',
      })
      navigate('/admin/clients')
    },
    onError: (error: Error) => {
      toast({
        title: 'Error',
        description: error.message || 'Failed to delete client',
        variant: 'destructive',
      })
    }
  })

  const handleDeleteClient = () => {
    if (id) {
      deleteClientMutation.mutate(id)
    }
  }

  const bookings = bookingsData?.bookings || []

  // Show all bookings in timeline regardless of date
  const filteredBookings = bookings.filter(booking =>
    statusFilter === 'all' || booking.status === statusFilter
  )

  // For stats, only count bookings with scheduled dates in the selected month
  const bookingsInSelectedMonth = bookings.filter(booking => {
    if (!booking.scheduled_date) return false
    const bookingDate = new Date(booking.scheduled_date)
    return bookingDate.getMonth() === selectedMonth && bookingDate.getFullYear() === selectedYear
  })

  const bookedCount = bookingsInSelectedMonth.filter(b => b.status === 'booked').length
  const inProgressCount = bookingsInSelectedMonth.filter(b => b.status === 'in_progress').length
  const recordedCount = bookingsInSelectedMonth.filter(b => b.status === 'recorded').length
  const publishedCount = bookingsInSelectedMonth.filter(b => b.status === 'published').length
  const totalCount = bookingsInSelectedMonth.length
  const completionRate = totalCount > 0 ? (publishedCount / totalCount) * 100 : 0

  // Calculate upcoming recordings (filtered by time range)
  const now = new Date()
  const futureDateFromNow = new Date()
  futureDateFromNow.setDate(futureDateFromNow.getDate() + upcomingTimeRange)

  const upcomingRecordings = bookings
    .filter(booking => {
      if (!booking.recording_date) return false
      const recordingDate = new Date(booking.recording_date)
      return recordingDate >= now &&
             recordingDate <= futureDateFromNow &&
             (booking.status === 'conversation_started' ||
              booking.status === 'booked' ||
              booking.status === 'in_progress')
    })
    .sort((a, b) => new Date(a.recording_date!).getTime() - new Date(b.recording_date!).getTime())

  // Calculate upcoming going live (filtered by time range, all statuses with publish date)
  const goingLiveFutureDate = new Date()
  goingLiveFutureDate.setDate(goingLiveFutureDate.getDate() + goingLiveTimeRange)

  const upcomingGoingLive = bookings
    .filter(booking => {
      if (!booking.publish_date) return false
      const publishDate = new Date(booking.publish_date)
      return publishDate >= now &&
             publishDate <= goingLiveFutureDate
    })
    .sort((a, b) => new Date(a.publish_date!).getTime() - new Date(b.publish_date!).getTime())

  // Initialize editMediaKitUrl when client data loads
  useEffect(() => {
    if (client) {
      setEditMediaKitUrl(client.media_kit_url || '')
    }
  }, [client])

  const goToPreviousMonth = () => {
    setSelectedDate(new Date(selectedYear, selectedMonth - 1, 1))
  }

  const goToNextMonth = () => {
    setSelectedDate(new Date(selectedYear, selectedMonth + 1, 1))
  }

  const goToThisMonth = () => {
    setSelectedDate(new Date())
  }

  const handleCreateBooking = () => {
    console.log('handleCreateBooking called', { podcast_name: newBookingForm.podcast_name, id })
    if (!newBookingForm.podcast_name || !id) {
      console.log('Validation failed', { podcast_name: newBookingForm.podcast_name, id })
      toast({
        title: 'Validation Error',
        description: 'Podcast name is required',
        variant: 'destructive'
      })
      return
    }

    // Clean up form data - convert empty strings to undefined for date fields
    const cleanedData = {
      ...newBookingForm,
      scheduled_date: newBookingForm.scheduled_date || undefined,
      recording_date: undefined,
      publish_date: undefined,
    }

    console.log('Creating booking with data:', cleanedData)
    createBookingMutation.mutate({
      client_id: id,
      ...cleanedData
    })
  }

  const handleFetchPodcastDetails = async () => {
    if (!newBookingForm.podcast_id) {
      toast({
        title: 'Podcast ID Required',
        description: 'Please enter a podcast ID first',
        variant: 'destructive'
      })
      return
    }

    try {
      setFetchingPodcast(true)
      const podcastData = await getPodcastById(newBookingForm.podcast_id)

      // Extract host/publisher name
      const hostName = podcastData.publisher_name || ''

      // Parse ratings
      const itunesRating = podcastData.reach?.itunes?.itunes_rating_average
        ? parseFloat(podcastData.reach.itunes.itunes_rating_average)
        : null

      const itunesRatingCount = podcastData.reach?.itunes?.itunes_rating_count
        ? parseInt(podcastData.reach.itunes.itunes_rating_count)
        : null

      // Auto-fill form with ALL podcast data (except notes - keep user's notes)
      setNewBookingForm(prev => ({
        ...prev,
        podcast_name: prev.podcast_name || podcastData.podcast_name,
        host_name: prev.host_name || hostName,
        podcast_url: prev.podcast_url || podcastData.podcast_url || '',
        audience_size: podcastData.reach?.audience_size || null,
        podcast_description: podcastData.podcast_description || '',
        itunes_rating: itunesRating,
        itunes_rating_count: itunesRatingCount,
        episode_count: podcastData.episode_count || null,
        podcast_image_url: podcastData.podcast_image_url || '',
        rss_url: podcastData.rss_url || ''
      }))

      toast({
        title: 'Podcast Details Loaded',
        description: `Successfully fetched details for "${podcastData.podcast_name}" (${podcastData.reach?.audience_size?.toLocaleString() || 'N/A'} audience)`,
      })
    } catch (error) {
      console.error('Error fetching podcast:', error)
      toast({
        title: 'Fetch Failed',
        description: error instanceof Error ? error.message : 'Failed to fetch podcast details',
        variant: 'destructive'
      })
    } finally {
      setFetchingPodcast(false)
    }
  }

  const handleEditBooking = (booking: any) => {
    setEditingBooking(booking)
    setEditBookingForm({
      podcast_name: booking.podcast_name,
      host_name: booking.host_name || '',
      podcast_url: booking.podcast_url || '',
      scheduled_date: booking.scheduled_date || '',
      recording_date: booking.recording_date || '',
      publish_date: booking.publish_date || '',
      episode_url: booking.episode_url || '',
      status: booking.status,
      notes: booking.notes || '',
      prep_sent: booking.prep_sent || false
    })
  }

  const handleSaveBooking = () => {
    if (editingBooking && editBookingForm.podcast_name) {
      // Clean up form data - convert empty strings to null for nullable fields
      // Use null instead of undefined so Supabase actually clears the fields
      const cleanedUpdates = {
        ...editBookingForm,
        scheduled_date: editBookingForm.scheduled_date || null,
        recording_date: editBookingForm.recording_date || null,
        publish_date: editBookingForm.publish_date || null,
        episode_url: editBookingForm.episode_url || null,
        host_name: editBookingForm.host_name || null,
        podcast_url: editBookingForm.podcast_url || null,
        notes: editBookingForm.notes || null,
      }

      updateBookingMutation.mutate({
        id: editingBooking.id,
        updates: cleanedUpdates
      })
    }
  }

  const handleDeleteBooking = (booking: any) => {
    setDeletingBooking(booking)
  }

  const confirmDelete = () => {
    if (deletingBooking) {
      deleteBookingMutation.mutate(deletingBooking.id)
    }
  }

  const handleViewPodcast = (booking: any) => {
    setViewingPodcast(booking)
    setIsPodcastDetailsModalOpen(true)
  }

  const handleEditClient = () => {
    if (client) {
      setEditClientForm({
        name: client.name,
        email: client.email || '',
        contact_person: client.contact_person || '',
        linkedin_url: client.linkedin_url || '',
        website: client.website || '',
        status: client.status,
        notes: client.notes || '',
        bio: client.bio || '',
        google_sheet_url: client.google_sheet_url || '',
        media_kit_url: client.media_kit_url || '',
        prospect_dashboard_slug: client.prospect_dashboard_slug || '',
        bison_campaign_id: client.bison_campaign_id || ''
      })
      setIsEditClientModalOpen(true)
    }
  }

  const handleUpdateClient = () => {
    if (!editClientForm.name || !id) return
    updateClientMutation.mutate({
      id,
      updates: editClientForm
    })
  }

  const handlePhotoSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    // Validate file type
    if (!file.type.startsWith('image/')) {
      toast({
        title: 'Invalid File',
        description: 'Please select an image file',
        variant: 'destructive'
      })
      return
    }

    // Validate file size (max 5MB)
    if (file.size > 5 * 1024 * 1024) {
      toast({
        title: 'File Too Large',
        description: 'Please select an image under 5MB',
        variant: 'destructive'
      })
      return
    }

    setPhotoFile(file)

    // Create preview
    const reader = new FileReader()
    reader.onloadend = () => {
      setPhotoPreview(reader.result as string)
    }
    reader.readAsDataURL(file)
  }

  const handlePhotoUpload = async () => {
    if (!photoFile || !id) return

    setUploadingPhoto(true)
    try {
      await uploadClientPhoto(id, photoFile)
      queryClient.invalidateQueries({ queryKey: ['client', id] })
      toast({
        title: 'Photo Uploaded',
        description: 'Client photo updated successfully'
      })
      setPhotoFile(null)
      setPhotoPreview(null)
    } catch (error) {
      toast({
        title: 'Upload Failed',
        description: error instanceof Error ? error.message : 'Failed to upload photo',
        variant: 'destructive'
      })
    } finally {
      setUploadingPhoto(false)
    }
  }

  const handlePhotoRemove = async () => {
    if (!client?.photo_url || !id) return

    setUploadingPhoto(true)
    try {
      await removeClientPhoto(id, client.photo_url)
      queryClient.invalidateQueries({ queryKey: ['client', id] })
      toast({
        title: 'Photo Removed',
        description: 'Client photo removed successfully'
      })
    } catch (error) {
      toast({
        title: 'Removal Failed',
        description: error instanceof Error ? error.message : 'Failed to remove photo',
        variant: 'destructive'
      })
    } finally {
      setUploadingPhoto(false)
    }
  }

  const handleCreateGoogleSheet = async () => {
    if (!client || !id) return

    setCreatingSheet(true)
    try {
      const result = await createClientGoogleSheet(id, client.name)

      // Update local state
      setEditClientForm(prev => ({ ...prev, google_sheet_url: result.spreadsheetUrl }))

      // Refresh client data
      queryClient.invalidateQueries({ queryKey: ['client', id] })

      toast({
        title: 'Google Sheet Created!',
        description: (
          <div className="flex flex-col gap-2">
            <p>{result.message}</p>
            <a
              href={result.spreadsheetUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="text-xs text-primary hover:underline flex items-center gap-1"
            >
              Open Sheet <ExternalLink className="h-3 w-3" />
            </a>
          </div>
        )
      })
    } catch (error) {
      toast({
        title: 'Creation Failed',
        description: error instanceof Error ? error.message : 'Failed to create Google Sheet',
        variant: 'destructive'
      })
    } finally {
      setCreatingSheet(false)
    }
  }

  const saveMediaKitUrl = async () => {
    if (!client || !id) return

    setSavingMediaKit(true)
    try {
      const { error } = await supabase
        .from('clients')
        .update({ media_kit_url: editMediaKitUrl.trim() || null })
        .eq('id', id)

      if (error) throw error

      // Refresh client data
      queryClient.invalidateQueries({ queryKey: ['client', id] })

      toast({
        title: 'Media Kit URL Saved!',
        description: 'Media kit link has been updated'
      })
    } catch (error) {
      console.error('Error saving media kit URL:', error)
      toast({
        title: 'Save Failed',
        description: error instanceof Error ? error.message : 'Failed to save media kit URL',
        variant: 'destructive'
      })
    } finally {
      setSavingMediaKit(false)
    }
  }

  const handleTogglePortalAccess = async (enabled: boolean) => {
    if (!client) return
    setTogglingPortalAccess(true)
    try {
      await updatePortalAccess(client.id, enabled)
      toast({
        title: enabled ? 'Portal Access Enabled' : 'Portal Access Disabled',
        description: enabled
          ? 'Client can now access their portal'
          : 'Client can no longer access their portal'
      })
      // Refresh client data
      queryClient.invalidateQueries({ queryKey: ['client', id] })
    } catch (error) {
      toast({
        title: 'Error',
        description: error instanceof Error ? error.message : 'Failed to update portal access',
        variant: 'destructive'
      })
    } finally {
      setTogglingPortalAccess(false)
    }
  }

  const handleSendInvitation = async () => {
    if (!client) return

    if (!client.email) {
      toast({
        title: 'No Email Address',
        description: 'Please add an email address to this client first',
        variant: 'destructive'
      })
      return
    }

    setSendingInvitation(true)
    try {
      await sendPortalInvitation(client.id)
      toast({
        title: 'Invitation Sent',
        description: `Portal invitation sent to ${client.email}`
      })
      // Refresh client data to update invitation_sent_at
      queryClient.invalidateQueries({ queryKey: ['client', id] })
    } catch (error) {
      toast({
        title: 'Error',
        description: error instanceof Error ? error.message : 'Failed to send invitation',
        variant: 'destructive'
      })
    } finally {
      setSendingInvitation(false)
    }
  }

  const handleCopyPortalUrl = () => {
    // Always use production URL, not localhost
    const baseUrl = import.meta.env.VITE_APP_URL || window.location.origin
    const portalUrl = `${baseUrl}/portal/login`
    navigator.clipboard.writeText(portalUrl)
    toast({
      title: 'Copied!',
      description: 'Portal login URL copied to clipboard'
    })
  }

  const handleViewPortalAsClient = () => {
    if (client) {
      impersonateClient(client)
      navigate('/portal/dashboard')
    }
  }

  const handleGeneratePassword = () => {
    const generated = generatePassword(12)
    setNewPassword(generated)
    setShowPassword(true)
  }

  const handleSetPassword = async () => {
    if (!client || !newPassword) return

    setSettingPassword(true)
    try {
      await setClientPassword(client.id, newPassword, 'Admin')
      toast({
        title: 'Password Set',
        description: 'Portal password has been set successfully'
      })
      queryClient.invalidateQueries({ queryKey: ['client', id] })
      setNewPassword('')
      setShowPassword(false)
    } catch (error) {
      toast({
        title: 'Error',
        description: error instanceof Error ? error.message : 'Failed to set password',
        variant: 'destructive'
      })
    } finally {
      setSettingPassword(false)
    }
  }

  const handleClearPassword = async () => {
    if (!client) return

    try {
      await clearClientPassword(client.id)
      toast({
        title: 'Password Cleared',
        description: 'Portal password has been removed'
      })
      queryClient.invalidateQueries({ queryKey: ['client', id] })
    } catch (error) {
      toast({
        title: 'Error',
        description: error instanceof Error ? error.message : 'Failed to clear password',
        variant: 'destructive'
      })
    }
  }

  const handleCopyPassword = () => {
    if (client?.portal_password) {
      navigator.clipboard.writeText(client.portal_password)
      toast({
        title: 'Copied!',
        description: 'Password copied to clipboard'
      })
    }
  }

  // Dashboard management helpers
  const extractSpreadsheetId = (url: string | null): string | null => {
    if (!url) return null
    const match = url.match(/\/spreadsheets\/d\/([a-zA-Z0-9-_]+)/)
    return match ? match[1] : null
  }

  const handleCheckDashboardCache = async () => {
    if (!client || !client.google_sheet_url) return

    const spreadsheetId = extractSpreadsheetId(client.google_sheet_url)
    if (!spreadsheetId) {
      toast({
        title: 'Invalid Google Sheet URL',
        description: 'Could not extract spreadsheet ID from the URL',
        variant: 'destructive'
      })
      return
    }

    setDashboardCacheLoading(true)
    try {
      // Get podcast IDs from Google Sheet
      const { data: session } = await supabase.auth.getSession()
      const response = await fetch(`${SUPABASE_URL}/functions/v1/get-client-podcasts`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session?.session?.access_token || ''}`
        },
        body: JSON.stringify({
          spreadsheetId,
          clientId: client.id,
          clientName: client.name,
          clientBio: client.bio || '',
          checkStatusOnly: true
        })
      })

      const result = await response.json()
      if (!response.ok) throw new Error(result.error || 'Failed to check cache status')

      const podcastIds = result.podcastIds || []

      if (podcastIds.length === 0) {
        toast({
          title: 'No podcasts in sheet',
          description: 'Google Sheet is empty or has no podcast IDs',
          variant: 'destructive'
        })
        return
      }

      // Use unified cache search across all sources
      const cacheStatus = await getClientCacheStatus(client.id, podcastIds)

      // Count AI analyzed podcasts in client's cache
      const { data: clientPodcasts } = await supabase
        .from('client_dashboard_podcasts')
        .select('ai_analyzed_at')
        .eq('client_id', client.id)
        .not('ai_analyzed_at', 'is', null)

      const aiAnalyzed = clientPodcasts?.length || 0

      setDashboardCacheStatus({
        total: cacheStatus.total,
        cached: cacheStatus.cached_in_client,
        aiAnalyzed,
        cached_in_client: cacheStatus.cached_in_client,
        cached_in_other_clients: cacheStatus.cached_in_other_clients,
        cached_in_prospects: cacheStatus.cached_in_prospects,
        cached_in_bookings: cacheStatus.cached_in_bookings,
        needs_fetch: cacheStatus.needs_fetch
      })

      const totalCached = cacheStatus.cached_in_client + cacheStatus.cached_in_other_clients +
                          cacheStatus.cached_in_prospects + cacheStatus.cached_in_bookings

      toast({
        title: '✅ Cache Status Check Complete',
        description: `${totalCached} podcasts found in cache (${cacheStatus.needs_fetch} need fetching). ${aiAnalyzed} have AI analysis.`
      })
    } catch (error) {
      toast({
        title: 'Error',
        description: error instanceof Error ? error.message : 'Failed to check cache',
        variant: 'destructive'
      })
    } finally {
      setDashboardCacheLoading(false)
    }
  }

  const handleFetchDashboardPodcasts = async () => {
    if (!client || !client.google_sheet_url) return

    const spreadsheetId = extractSpreadsheetId(client.google_sheet_url)
    if (!spreadsheetId) {
      toast({
        title: 'Invalid Google Sheet URL',
        description: 'Could not extract spreadsheet ID from the URL',
        variant: 'destructive'
      })
      return
    }

    setDashboardCacheLoading(true)
    try {
      toast({ title: 'Checking cache across all sources...' })

      // Step 1: Get podcast IDs from Google Sheet
      const { data: session } = await supabase.auth.getSession()
      const sheetResponse = await fetch(`${SUPABASE_URL}/functions/v1/get-client-podcasts`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session?.session?.access_token || ''}`
        },
        body: JSON.stringify({
          spreadsheetId,
          clientId: client.id,
          clientName: client.name,
          clientBio: client.bio || '',
          checkStatusOnly: true // Just get IDs, don't fetch yet
        })
      })

      const sheetResult = await sheetResponse.json()
      if (!sheetResponse.ok) throw new Error(sheetResult.error || 'Failed to read Google Sheet')

      const podcastIds = sheetResult.podcastIds || []

      if (podcastIds.length === 0) {
        toast({
          title: 'No podcasts found',
          description: 'Google Sheet is empty or has no valid podcast IDs',
          variant: 'destructive'
        })
        return
      }

      // Step 2: Check what's cached anywhere
      const cachedMetadata = await findCachedPodcastsMetadata(podcastIds)

      // Step 3: Copy universal metadata from other sources to this client's cache
      const toCopy = Array.from(cachedMetadata.values()).filter(
        p => p.source !== 'client_dashboard' // Don't copy if already in client cache
      )

      if (toCopy.length > 0) {
        await supabase.from('client_dashboard_podcasts').upsert(
          toCopy.map(p => ({
            client_id: client.id,
            // Universal podcast metadata (NO AI analysis)
            podcast_id: p.podcast_id,
            podcast_name: p.podcast_name,
            podcast_description: p.podcast_description,
            podcast_image_url: p.podcast_image_url,
            podcast_url: p.podcast_url,
            publisher_name: p.publisher_name,
            itunes_rating: p.itunes_rating,
            episode_count: p.episode_count,
            audience_size: p.audience_size,
            podcast_categories: p.podcast_categories,
            last_posted_at: p.last_posted_at,
            // Demographics (universal listener data)
            demographics: p.demographics,
            demographics_fetched_at: p.has_demographics ? new Date().toISOString() : null,
            // AI fields explicitly NULL - will be generated later
            ai_clean_description: null,
            ai_fit_reasons: null,
            ai_pitch_angles: null,
            ai_analyzed_at: null
          })),
          { onConflict: 'client_id,podcast_id' }
        )

        toast({
          title: `✅ Copied ${toCopy.length} from cache`,
          description: `Saved ${toCopy.length} Podscan API calls!`
        })
      }

      // Step 4: Fetch only missing podcasts from Podscan
      const missingIds = podcastIds.filter(id => !cachedMetadata.has(id))

      if (missingIds.length > 0) {
        toast({
          title: `Fetching ${missingIds.length} from Podscan...`,
          description: 'This may take a moment'
        })

        // Now actually fetch the missing ones
        const response = await fetch(`${SUPABASE_URL}/functions/v1/get-client-podcasts`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${session?.session?.access_token || ''}`
          },
          body: JSON.stringify({
            spreadsheetId,
            clientId: client.id,
            clientName: client.name,
            clientBio: client.bio || '',
            skipAiAnalysis: true,
            podcastIds: missingIds // Only fetch these IDs
          })
        })

        const result = await response.json()
        if (!response.ok) throw new Error(result.error || 'Failed to fetch podcasts')

        toast({
          title: `✅ Fetched ${missingIds.length} new podcasts`,
          description: `Used ${missingIds.length} Podscan credits`
        })
      }

      // Final summary
      const totalCopied = toCopy.length
      const totalFetched = missingIds.length

      toast({
        title: '🎉 Metadata Cache Complete',
        description: `Copied: ${totalCopied} | Fetched: ${totalFetched} | Saved ${totalCopied} API calls! Click "Run AI Analysis" to personalize.`
      })

      // Refresh cache status automatically
      await handleCheckDashboardCache()

      queryClient.invalidateQueries({ queryKey: ['client', id] })
    } catch (error) {
      toast({
        title: 'Error',
        description: error instanceof Error ? error.message : 'Failed to fetch podcasts',
        variant: 'destructive'
      })
    } finally {
      setDashboardCacheLoading(false)
    }
  }

  const handleRunAiAnalysis = async () => {
    if (!client || !client.google_sheet_url) return

    const spreadsheetId = extractSpreadsheetId(client.google_sheet_url)
    if (!spreadsheetId) return

    setDashboardAiLoading(true)
    try {
      const { data: session } = await supabase.auth.getSession()
      const response = await fetch(`${SUPABASE_URL}/functions/v1/get-client-podcasts`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session?.session?.access_token || ''}`
        },
        body: JSON.stringify({
          spreadsheetId,
          clientId: client.id,
          clientName: client.name,
          clientBio: client.bio || '',
          aiAnalysisOnly: true
        })
      })

      const result = await response.json()
      console.log('[AI Analysis] Response:', result)
      if (!response.ok) throw new Error(result.error || 'Failed to run AI analysis')

      // Backend returns: { analyzed, remaining, total, aiComplete, stoppedEarly }
      const analyzed = result.analyzed || 0
      const total = result.total || 0
      const remaining = result.remaining || 0
      const aiComplete = result.aiComplete || false

      console.log('[AI Analysis] Results:', { analyzed, total, remaining, aiComplete })

      // Update cache status with new AI analysis count
      setDashboardCacheStatus(prev => ({
        ...prev,
        cached: total,
        aiAnalyzed: total - remaining,
        total: total
      }))

      // Refetch cached podcasts to show updated data
      await refetchCachedPodcasts()

      toast({
        title: aiComplete ? 'AI Analysis Complete' : 'AI Analysis In Progress',
        description: analyzed > 0
          ? `Analyzed ${analyzed} podcast${analyzed !== 1 ? 's' : ''}. ${remaining > 0 ? `${remaining} remaining - click "Run AI Analysis" again to continue` : 'All done!'}`
          : 'No podcasts needed analysis'
      })
    } catch (error) {
      toast({
        title: 'Error',
        description: error instanceof Error ? error.message : 'Failed to run AI analysis',
        variant: 'destructive'
      })
    } finally {
      setDashboardAiLoading(false)
    }
  }

  const handleCopyDashboardUrl = () => {
    if (!client?.dashboard_slug) {
      toast({
        title: 'No Dashboard URL',
        description: 'Client does not have a dashboard slug yet',
        variant: 'destructive'
      })
      return
    }
    const url = `${window.location.origin}/client/${client.dashboard_slug}`
    navigator.clipboard.writeText(url)
    toast({
      title: 'Copied!',
      description: 'Dashboard URL copied to clipboard'
    })
  }

  const handleViewDashboard = () => {
    if (!client?.dashboard_slug) {
      toast({
        title: 'No Dashboard URL',
        description: 'Client does not have a dashboard slug yet',
        variant: 'destructive'
      })
      return
    }
    window.open(`/client/${client.dashboard_slug}`, '_blank')
  }

  const deletePodcastFromDashboard = async (podcastId: string, podcastName: string | null) => {
    if (!client?.id || !client?.google_sheet_url) return

    console.log('=== DELETE PODCAST START ===')
    console.log('Attempting to delete:', { podcastId, podcastName, client_id: client.id })

    // Check current feedback state before deletion
    const feedbackBeforeDelete = clientFeedback.find((f: any) => f.podcast_id === podcastId)
    console.log('Feedback record before delete:', feedbackBeforeDelete)

    setDeletingPodcastId(podcastId)
    try {
      const spreadsheetId = extractSpreadsheetId(client.google_sheet_url)

      // Delete from Google Sheet first
      if (spreadsheetId) {
        try {
          const { data: session } = await supabase.auth.getSession()
          const response = await fetch(`${SUPABASE_URL}/functions/v1/delete-podcast-from-sheet`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${session?.session?.access_token}`,
            },
            body: JSON.stringify({ spreadsheetId, podcastId }),
          })

          if (!response.ok) {
            console.warn('Failed to delete from Google Sheet')
          }
        } catch (sheetError) {
          console.warn('Error deleting from Google Sheet:', sheetError)
        }
      }

      // Delete from cached podcasts table
      const { error: cacheError } = await supabase
        .from('client_dashboard_podcasts')
        .delete()
        .eq('client_id', client.id)
        .eq('podcast_id', podcastId)

      if (cacheError) {
        console.error('Error deleting from cache:', cacheError)
      }

      // Delete the feedback record
      const { data: deletedData, error: feedbackError } = await supabase
        .from('client_podcast_feedback')
        .delete()
        .eq('client_id', client.id)
        .eq('podcast_id', podcastId)

      console.log('Delete result:', { deletedData, feedbackError, client_id: client.id, podcast_id: podcastId })

      if (feedbackError) {
        console.error('Feedback deletion error:', feedbackError)
        throw feedbackError
      }

      // Force refetch the feedback data
      console.log('Refetching feedback with id:', id)
      const refetchResult = await queryClient.refetchQueries({ queryKey: ['client-feedback', id] })
      console.log('Refetch result:', refetchResult)

      // Log the current feedback state after refetch
      const currentFeedback = queryClient.getQueryData(['client-feedback', id])
      console.log('Current feedback after refetch:', currentFeedback)
      console.log('Looking for podcast_id:', podcastId)

      toast({
        title: 'Podcast Deleted',
        description: `"${podcastName || podcastId}" has been removed`
      })
    } catch (error) {
      console.error('Delete podcast error:', error)
      toast({
        title: 'Error',
        description: error instanceof Error ? error.message : 'Failed to delete podcast',
        variant: 'destructive'
      })
    } finally {
      setDeletingPodcastId(null)
    }
  }

  const deleteAllRejectedPodcasts = async () => {
    if (!client?.id || !client?.google_sheet_url) return

    const rejectedPodcasts = clientFeedback.filter((f: any) => f.status === 'rejected')
    if (rejectedPodcasts.length === 0) {
      toast({
        title: 'No Rejected Podcasts',
        description: 'There are no rejected podcasts to delete'
      })
      return
    }

    setDeletingAllRejected(true)
    try {
      const podcastIds = rejectedPodcasts.map((f: any) => f.podcast_id)
      const spreadsheetId = extractSpreadsheetId(client.google_sheet_url)

      // Delete from Google Sheet first
      if (spreadsheetId) {
        const { data: session } = await supabase.auth.getSession()
        let sheetDeleteCount = 0

        for (const podcastId of podcastIds) {
          try {
            const response = await fetch(`${SUPABASE_URL}/functions/v1/delete-podcast-from-sheet`, {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${session?.session?.access_token}`,
              },
              body: JSON.stringify({ spreadsheetId, podcastId }),
            })

            if (response.ok) {
              sheetDeleteCount++
            }
          } catch (sheetError) {
            console.warn('Error deleting from Google Sheet:', podcastId)
          }
        }
        console.log(`Deleted ${sheetDeleteCount}/${podcastIds.length} from Google Sheet`)
      }

      // Delete all rejected from cached podcasts table
      const { error: cacheError } = await supabase
        .from('client_dashboard_podcasts')
        .delete()
        .eq('client_id', client.id)
        .in('podcast_id', podcastIds)

      if (cacheError) {
        console.error('Error deleting from cache:', cacheError)
      }

      // Delete all rejected feedback records
      const { error: feedbackError } = await supabase
        .from('client_podcast_feedback')
        .delete()
        .eq('client_id', client.id)
        .in('podcast_id', podcastIds)

      if (feedbackError) {
        console.error('Feedback deletion error:', feedbackError)
        throw feedbackError
      }

      // Force refetch the feedback data
      await queryClient.refetchQueries({ queryKey: ['client-feedback', id] })

      toast({
        title: 'All Rejected Deleted',
        description: `Removed ${rejectedPodcasts.length} rejected podcasts`
      })
    } catch (error) {
      console.error('Delete all rejected error:', error)
      toast({
        title: 'Error',
        description: error instanceof Error ? error.message : 'Failed to delete rejected podcasts',
        variant: 'destructive'
      })
    } finally {
      setDeletingAllRejected(false)
    }
  }

  // Podcast Outreach handlers
  const handleSaveWebhookUrl = async () => {
    if (!client?.id) return

    setSavingWebhookUrl(true)
    try {
      const { error } = await supabase
        .from('clients')
        .update({ outreach_webhook_url: webhookUrl || null })
        .eq('id', client.id)

      if (error) throw error

      queryClient.invalidateQueries({ queryKey: ['client', id] })
      toast({
        title: 'Webhook URL Saved',
        description: 'Outreach webhook URL has been updated'
      })
    } catch (error) {
      toast({
        title: 'Error',
        description: error instanceof Error ? error.message : 'Failed to save webhook URL',
        variant: 'destructive'
      })
    } finally {
      setSavingWebhookUrl(false)
    }
  }

  const handleSendWebhook = async (podcast: any) => {
    if (!client?.id || !client?.outreach_webhook_url) {
      toast({
        title: 'No Webhook URL',
        description: 'Please configure a webhook URL first',
        variant: 'destructive'
      })
      return
    }

    if (!client?.bison_campaign_id) {
      toast({
        title: 'Bison Campaign ID Required',
        description: 'Please add a Bison Campaign ID to the client before sending to outreach',
        variant: 'destructive'
      })
      return
    }

    setSendingWebhook(true)
    try {
      const response = await fetch(`${SUPABASE_URL}/functions/v1/send-outreach-webhook`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${(await supabase.auth.getSession()).data.session?.access_token}`
        },
        body: JSON.stringify({
          clientId: client.id,
          podcastId: podcast.podcast_id
        })
      })

      const result = await response.json()

      if (!result.success) {
        throw new Error(result.error || 'Failed to send webhook')
      }

      await refetchOutreachActions()

      toast({
        title: 'Webhook Sent',
        description: `Successfully sent ${podcast.podcast_name} to outreach webhook`
      })

      // Move to next podcast
      if (currentPodcastIndex < availablePodcasts.length - 1) {
        setCurrentPodcastIndex(currentPodcastIndex + 1)
      }
    } catch (error) {
      toast({
        title: 'Webhook Failed',
        description: error instanceof Error ? error.message : 'Failed to send webhook',
        variant: 'destructive'
      })
    } finally {
      setSendingWebhook(false)
    }
  }

  const handleSkipPodcast = async (podcast: any) => {
    if (!client?.id) return

    try {
      const { error } = await supabase
        .from('podcast_outreach_actions')
        .upsert({
          client_id: client.id,
          podcast_id: podcast.podcast_id,
          podcast_name: podcast.podcast_name,
          action: 'skipped',
          updated_at: new Date().toISOString()
        }, { onConflict: 'client_id,podcast_id' })

      if (error) throw error

      await refetchOutreachActions()

      toast({
        title: 'Podcast Skipped',
        description: `Skipped ${podcast.podcast_name}`
      })

      // Move to next podcast
      if (currentPodcastIndex < availablePodcasts.length - 1) {
        setCurrentPodcastIndex(currentPodcastIndex + 1)
      }
    } catch (error) {
      toast({
        title: 'Error',
        description: error instanceof Error ? error.message : 'Failed to skip podcast',
        variant: 'destructive'
      })
    }
  }

  // Initialize webhook URL when client loads
  useEffect(() => {
    if (client?.outreach_webhook_url) {
      setWebhookUrl(client.outreach_webhook_url)
    }
  }, [client?.outreach_webhook_url])

  // Calculate available podcasts and stats
  const actionedPodcastIds = new Set(outreachActions.map(action => action.podcast_id))
  const availablePodcasts = cachedPodcasts.filter(p => !actionedPodcastIds.has(p.podcast_id))
  const outreachStats = {
    total: cachedPodcasts.length,
    sent: outreachActions.filter(a => a.action === 'sent').length,
    skipped: outreachActions.filter(a => a.action === 'skipped').length,
    remaining: availablePodcasts.length
  }

  if (clientLoading || bookingsLoading) {
    return (
      <DashboardLayout>
        <div className="flex items-center justify-center h-96">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      </DashboardLayout>
    )
  }

  if (!client) {
    return (
      <DashboardLayout>
        <div className="flex flex-col items-center justify-center h-96">
          <p className="text-muted-foreground">Client not found</p>
          <Link to="/admin/clients" className="text-primary hover:underline mt-2">
            Back to Clients
          </Link>
        </div>
      </DashboardLayout>
    )
  }

  const getStatusBadge = (status: string) => {
    const styles = {
      conversation_started: { bg: 'bg-amber-100 text-amber-800 dark:bg-amber-900 dark:text-amber-200', icon: MessageSquare },
      in_progress: { bg: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200', icon: Clock },
      booked: { bg: 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200', icon: CheckCircle2 },
      recorded: { bg: 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200', icon: Video },
      published: { bg: 'bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200', icon: CheckCheck },
      cancelled: { bg: 'bg-gray-100 text-gray-800 dark:bg-gray-900 dark:text-gray-200', icon: XCircle },
    }
    const config = styles[status as keyof typeof styles] || { bg: 'bg-gray-100 text-gray-800 dark:bg-gray-900 dark:text-gray-200', icon: AlertCircle }
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

  const formatUpcomingDate = (dateString: string) => {
    // Parse date in local timezone to avoid timezone shifts
    const [year, month, day] = dateString.split('T')[0].split('-')
    const date = new Date(parseInt(year), parseInt(month) - 1, parseInt(day))

    const today = new Date()
    today.setHours(0, 0, 0, 0)

    const tomorrow = new Date(today)
    tomorrow.setDate(tomorrow.getDate() + 1)

    if (date.toDateString() === today.toDateString()) return 'Today'
    if (date.toDateString() === tomorrow.toDateString()) return 'Tomorrow'

    return date.toLocaleDateString('en-US', {
      weekday: 'short',
      month: 'short',
      day: 'numeric'
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
            <h1 className="text-2xl sm:text-3xl font-bold">{client.name}</h1>
            <div className="flex flex-wrap items-center gap-2 mt-2">
              <Badge className={
                client.status === 'active' ? 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200' :
                client.status === 'paused' ? 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200' :
                'bg-gray-100 text-gray-800 dark:bg-gray-900 dark:text-gray-200'
              }>
                {client.status.charAt(0).toUpperCase() + client.status.slice(1)}
              </Badge>
              <span className="text-sm text-muted-foreground">
                Joined {formatDate(client.created_at)}
              </span>
            </div>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" onClick={handleEditClient}>
              <Edit className="h-4 w-4 mr-2" />
              Edit Client
            </Button>
            <Button
              variant="destructive"
              onClick={() => setIsDeleteClientDialogOpen(true)}
            >
              <Trash2 className="h-4 w-4 mr-2" />
              Delete
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
              {/* Client Photo */}
              <div className="flex items-center gap-4 pb-4 border-b">
                <div className="relative">
                  {client.photo_url ? (
                    <img
                      src={client.photo_url}
                      alt={client.name}
                      className="w-20 h-20 rounded-full object-cover"
                    />
                  ) : (
                    <div className="w-20 h-20 rounded-full bg-muted flex items-center justify-center">
                      <User className="h-10 w-10 text-muted-foreground" />
                    </div>
                  )}
                </div>
                <div className="flex-1">
                  <p className="text-sm font-medium mb-2">Client Photo</p>
                  <div className="flex gap-2">
                    <input
                      type="file"
                      id="photo-upload"
                      accept="image/*"
                      className="hidden"
                      onChange={handlePhotoSelect}
                    />
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => document.getElementById('photo-upload')?.click()}
                      disabled={uploadingPhoto}
                    >
                      <Upload className="h-4 w-4 mr-2" />
                      {client.photo_url ? 'Change' : 'Upload'}
                    </Button>
                    {client.photo_url && (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={handlePhotoRemove}
                        disabled={uploadingPhoto}
                      >
                        <Trash2 className="h-4 w-4 mr-2" />
                        Remove
                      </Button>
                    )}
                  </div>
                  {photoFile && (
                    <div className="mt-2">
                      <p className="text-xs text-muted-foreground mb-2">
                        Selected: {photoFile.name}
                      </p>
                      <Button
                        size="sm"
                        onClick={handlePhotoUpload}
                        disabled={uploadingPhoto}
                      >
                        {uploadingPhoto ? (
                          <>
                            <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                            Uploading...
                          </>
                        ) : (
                          'Save Photo'
                        )}
                      </Button>
                    </div>
                  )}
                </div>
              </div>

              {client.email && (
                <div className="flex items-center gap-3">
                  <Mail className="h-4 w-4 text-muted-foreground" />
                  <div>
                    <p className="text-sm font-medium">Email</p>
                    <p className="text-sm text-muted-foreground">{client.email}</p>
                  </div>
                </div>
              )}
              {client.contact_person && (
                <div className="flex items-center gap-3">
                  <User className="h-4 w-4 text-muted-foreground" />
                  <div>
                    <p className="text-sm font-medium">Contact Person</p>
                    <p className="text-sm text-muted-foreground">{client.contact_person}</p>
                  </div>
                </div>
              )}
              {client.linkedin_url && (
                <div className="flex items-center gap-3">
                  <Linkedin className="h-4 w-4 text-muted-foreground" />
                  <div>
                    <p className="text-sm font-medium">LinkedIn</p>
                    <a
                      href={client.linkedin_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-sm text-primary hover:underline"
                    >
                      View Profile
                    </a>
                  </div>
                </div>
              )}
              {client.website && (
                <div className="flex items-center gap-3">
                  <Globe className="h-4 w-4 text-muted-foreground" />
                  <div>
                    <p className="text-sm font-medium">Website</p>
                    <a
                      href={client.website}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-sm text-primary hover:underline"
                    >
                      Visit Website
                    </a>
                  </div>
                </div>
              )}
              {client.calendar_link && (
                <div className="flex items-center gap-3">
                  <Calendar className="h-4 w-4 text-muted-foreground" />
                  <div>
                    <p className="text-sm font-medium">Calendar</p>
                    <a
                      href={client.calendar_link}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-sm text-primary hover:underline"
                    >
                      Book Time
                    </a>
                  </div>
                </div>
              )}
              {client.google_sheet_url ? (
                <div className="flex items-center gap-3">
                  <FileText className="h-4 w-4 text-muted-foreground" />
                  <div>
                    <p className="text-sm font-medium">Google Sheet (Podcast Export)</p>
                    <a
                      href={client.google_sheet_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-sm text-primary hover:underline flex items-center gap-1"
                    >
                      Open Sheet
                      <ExternalLink className="h-3 w-3" />
                    </a>
                  </div>
                </div>
              ) : (
                <div className="flex items-center gap-3 p-3 bg-muted/50 rounded-lg border-2 border-dashed">
                  <FileText className="h-4 w-4 text-muted-foreground" />
                  <div className="flex-1">
                    <p className="text-sm font-medium">Google Sheet Not Set Up</p>
                    <p className="text-xs text-muted-foreground">Create a formatted sheet for podcast exports</p>
                  </div>
                  <Button
                    size="sm"
                    onClick={handleCreateGoogleSheet}
                    disabled={creatingSheet}
                    className="bg-green-600 hover:bg-green-700"
                  >
                    {creatingSheet ? (
                      <>
                        <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                        Creating...
                      </>
                    ) : (
                      <>
                        <Sparkles className="h-4 w-4 mr-2" />
                        Create Sheet
                      </>
                    )}
                  </Button>
                </div>
              )}

              {/* Media Kit / One Pager */}
              <div className="flex items-start gap-3 pt-4 border-t">
                <FileText className="h-4 w-4 text-muted-foreground mt-1" />
                <div className="flex-1">
                  <p className="text-sm font-medium mb-2">Media Kit / One Pager</p>
                  <div className="flex gap-2">
                    <Input
                      placeholder="Paste media kit URL..."
                      value={editMediaKitUrl}
                      onChange={(e) => setEditMediaKitUrl(e.target.value)}
                      className="text-sm"
                    />
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={saveMediaKitUrl}
                      disabled={savingMediaKit || editMediaKitUrl === (client.media_kit_url || '')}
                    >
                      {savingMediaKit ? (
                        <>
                          <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                          Saving...
                        </>
                      ) : (
                        <>
                          <Save className="h-4 w-4 mr-2" />
                          Save
                        </>
                      )}
                    </Button>
                  </div>
                  {editMediaKitUrl && (
                    <Button
                      variant="link"
                      className="h-auto p-0 text-xs mt-2"
                      onClick={() => window.open(editMediaKitUrl, '_blank')}
                    >
                      <ExternalLink className="h-3 w-3 mr-1" />
                      Preview Media Kit
                    </Button>
                  )}
                  <p className="text-xs text-muted-foreground mt-2">
                    Link to the client's media kit or one-pager document (Google Doc, PDF, etc.)
                  </p>
                </div>
              </div>

              {/* Client Bio */}
              {client.bio && (
                <div className="pt-4 border-t">
                  <div className="flex items-start gap-3">
                    <FileText className="h-4 w-4 text-muted-foreground mt-1" />
                    <div className="flex-1">
                      <p className="text-sm font-medium mb-2">Client Bio (for AI Podcast Search)</p>
                      <div className="text-sm text-muted-foreground">
                        <p className={`whitespace-pre-wrap ${!bioExpanded && client.bio.length > 200 ? 'line-clamp-3' : ''}`}>
                          {client.bio}
                        </p>
                        {client.bio.length > 200 && (
                          <button
                            onClick={() => setBioExpanded(!bioExpanded)}
                            className="text-primary hover:underline text-xs font-medium mt-2 flex items-center gap-1"
                          >
                            {bioExpanded ? (
                              <>Show less <ChevronUp className="h-3 w-3" /></>
                            ) : (
                              <>Read more <ChevronDown className="h-3 w-3" /></>
                            )}
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Client Portal Access */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                {client.portal_access_enabled ? (
                  <Unlock className="h-5 w-5 text-green-600" />
                ) : (
                  <Lock className="h-5 w-5 text-muted-foreground" />
                )}
                Client Portal Access
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {/* Toggle Portal Access */}
              <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                  <Label htmlFor="portal-access">Enable Portal Access</Label>
                  <p className="text-xs text-muted-foreground">
                    Allow client to view their bookings
                  </p>
                </div>
                <Switch
                  id="portal-access"
                  checked={client.portal_access_enabled || false}
                  onCheckedChange={handleTogglePortalAccess}
                  disabled={togglingPortalAccess}
                />
              </div>

              {/* Portal Actions */}
              {client.portal_access_enabled && (
                <div className="space-y-3 pt-3 border-t">
                  <Button
                    onClick={handleSendInvitation}
                    disabled={!client.email || sendingInvitation}
                    className="w-full"
                  >
                    {sendingInvitation ? (
                      <>
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        Sending...
                      </>
                    ) : (
                      <>
                        <Send className="mr-2 h-4 w-4" />
                        Send Portal Invitation
                      </>
                    )}
                  </Button>

                  {!client.email && (
                    <p className="text-xs text-muted-foreground text-center">
                      Add email address to send invitation
                    </p>
                  )}

                  <Button
                    variant="outline"
                    onClick={handleCopyPortalUrl}
                    className="w-full"
                  >
                    <Copy className="mr-2 h-4 w-4" />
                    Copy Portal URL
                  </Button>

                  <Button
                    variant="outline"
                    onClick={handleViewPortalAsClient}
                    className="w-full bg-primary/5 hover:bg-primary/10"
                  >
                    <Eye className="mr-2 h-4 w-4" />
                    View Portal as Client
                  </Button>

                  {/* Password Management */}
                  <div className="space-y-3 pt-3 border-t">
                    <div className="space-y-0.5">
                      <Label className="flex items-center gap-2">
                        <Key className="h-4 w-4" />
                        Portal Password
                      </Label>
                      <p className="text-xs text-muted-foreground">
                        Set a password for traditional login
                      </p>
                    </div>

                    {client.portal_password ? (
                      <div className="space-y-2">
                        <div className="flex items-center gap-2 p-2 bg-muted rounded-md">
                          <Input
                            type={showPassword ? 'text' : 'password'}
                            value={client.portal_password}
                            readOnly
                            className="flex-1"
                          />
                          <Button
                            size="icon"
                            variant="ghost"
                            onClick={() => setShowPassword(!showPassword)}
                          >
                            {showPassword ? (
                              <EyeOff className="h-4 w-4" />
                            ) : (
                              <Eye className="h-4 w-4" />
                            )}
                          </Button>
                          <Button
                            size="icon"
                            variant="ghost"
                            onClick={handleCopyPassword}
                          >
                            <Copy className="h-4 w-4" />
                          </Button>
                        </div>
                        {client.password_set_at && (
                          <p className="text-xs text-muted-foreground">
                            Set {new Date(client.password_set_at).toLocaleDateString('en-US', {
                              month: 'short',
                              day: 'numeric',
                              year: 'numeric'
                            })}
                            {client.password_set_by && ` by ${client.password_set_by}`}
                          </p>
                        )}
                        <div className="flex gap-2">
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => {
                              setNewPassword(client.portal_password || '')
                              setShowPassword(true)
                            }}
                            className="flex-1"
                          >
                            <RefreshCw className="mr-2 h-3 w-3" />
                            Change
                          </Button>
                          <Button
                            variant="destructive"
                            size="sm"
                            onClick={handleClearPassword}
                            className="flex-1"
                          >
                            Clear Password
                          </Button>
                        </div>
                      </div>
                    ) : (
                      <div className="space-y-2">
                        <div className="flex gap-2">
                          <Input
                            type={showPassword ? 'text' : 'password'}
                            placeholder="Enter password"
                            value={newPassword}
                            onChange={(e) => setNewPassword(e.target.value)}
                            className="flex-1"
                          />
                          <Button
                            size="icon"
                            variant="ghost"
                            onClick={() => setShowPassword(!showPassword)}
                          >
                            {showPassword ? (
                              <EyeOff className="h-4 w-4" />
                            ) : (
                              <Eye className="h-4 w-4" />
                            )}
                          </Button>
                        </div>
                        <div className="flex gap-2">
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={handleGeneratePassword}
                            className="flex-1"
                          >
                            <RefreshCw className="mr-2 h-3 w-3" />
                            Generate
                          </Button>
                          <Button
                            size="sm"
                            onClick={handleSetPassword}
                            disabled={!newPassword || settingPassword}
                            className="flex-1"
                          >
                            {settingPassword ? (
                              <>
                                <Loader2 className="mr-2 h-3 w-3 animate-spin" />
                                Setting...
                              </>
                            ) : (
                              <>
                                <Key className="mr-2 h-3 w-3" />
                                Set Password
                              </>
                            )}
                          </Button>
                        </div>
                        <p className="text-xs text-muted-foreground">
                          Password allows client to login without magic link
                        </p>
                      </div>
                    )}
                  </div>

                  {/* Portal Info */}
                  <div className="space-y-2 text-xs text-muted-foreground pt-2">
                    {client.portal_last_login_at && (
                      <div className="flex items-center gap-2">
                        <Clock className="h-3 w-3" />
                        <span>
                          Last login:{' '}
                          {new Date(client.portal_last_login_at).toLocaleDateString('en-US', {
                            month: 'short',
                            day: 'numeric',
                            year: 'numeric',
                            hour: 'numeric',
                            minute: '2-digit'
                          })}
                        </span>
                      </div>
                    )}
                    {client.portal_invitation_sent_at && (
                      <div className="flex items-center gap-2">
                        <Mail className="h-3 w-3" />
                        <span>
                          Invitation sent:{' '}
                          {new Date(client.portal_invitation_sent_at).toLocaleDateString('en-US', {
                            month: 'short',
                            day: 'numeric',
                            year: 'numeric'
                          })}
                        </span>
                      </div>
                    )}
                  </div>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Podcast Approval Dashboard */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Mic className="h-5 w-5 text-primary" />
                Podcast Approval Dashboard
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {/* Enable Toggle */}
              <div className="flex items-center justify-between pb-3 border-b">
                <div className="space-y-0.5">
                  <Label htmlFor="dashboard-enabled">Enable Dashboard</Label>
                  <p className="text-xs text-muted-foreground">
                    Allow client to view approval dashboard
                  </p>
                </div>
                <Switch
                  id="dashboard-enabled"
                  checked={client.dashboard_enabled || false}
                  onCheckedChange={async (checked) => {
                    try {
                      await supabase
                        .from('clients')
                        .update({ dashboard_enabled: checked })
                        .eq('id', client.id)
                      queryClient.invalidateQueries({ queryKey: ['client', id] })
                      toast({
                        title: checked ? 'Dashboard Enabled' : 'Dashboard Disabled',
                        description: checked
                          ? 'Client can now view their approval dashboard'
                          : 'Dashboard is hidden from client'
                      })
                    } catch (error) {
                      toast({
                        title: 'Error',
                        description: 'Failed to update dashboard status',
                        variant: 'destructive'
                      })
                    }
                  }}
                />
              </div>

              {client.google_sheet_url ? (
                <>
                  {/* Dashboard URL */}
                  <div className="space-y-2">
                    <Label className="text-sm text-muted-foreground">Dashboard URL</Label>
                    {client.dashboard_slug ? (
                      <div className="flex items-center gap-2 p-2 bg-muted rounded-md">
                        <code className="flex-1 text-xs truncate">
                          {window.location.origin}/client/{client.dashboard_slug}
                        </code>
                        <Button size="icon" variant="ghost" onClick={handleCopyDashboardUrl}>
                          <Copy className="h-4 w-4" />
                        </Button>
                      </div>
                    ) : (
                      <p className="text-sm text-muted-foreground">
                        Dashboard slug will be generated when data is saved
                      </p>
                    )}
                  </div>

                  {/* Cache Status */}
                  {dashboardCacheStatus && (
                    <div className="space-y-3">
                      <div className="grid grid-cols-3 gap-3 p-3 bg-muted rounded-lg">
                        <div className="text-center">
                          <p className="text-2xl font-bold">{dashboardCacheStatus.total}</p>
                          <p className="text-xs text-muted-foreground">In Sheet</p>
                        </div>
                        <div className="text-center">
                          <p className="text-2xl font-bold text-orange-500">{dashboardCacheStatus.needs_fetch || 0}</p>
                          <p className="text-xs text-muted-foreground">Needs Fetch</p>
                        </div>
                        <div className="text-center">
                          <p className="text-2xl font-bold text-purple-500">{dashboardCacheStatus.aiAnalyzed || 0}</p>
                          <p className="text-xs text-muted-foreground">AI Analyzed</p>
                        </div>
                      </div>

                      <div className="space-y-2 p-3 border rounded-lg">
                        <div className="text-xs font-medium text-muted-foreground uppercase">Cached Sources</div>
                        <div className="space-y-1.5">
                          <div className="flex items-center justify-between text-sm">
                            <div className="flex items-center gap-2">
                              <div className="h-2 w-2 rounded-full bg-green-500" />
                              <span>This Client</span>
                            </div>
                            <Badge variant="outline">{dashboardCacheStatus.cached_in_client || 0}</Badge>
                          </div>
                          <div className="flex items-center justify-between text-sm">
                            <div className="flex items-center gap-2">
                              <div className="h-2 w-2 rounded-full bg-blue-500" />
                              <span>Other Clients</span>
                            </div>
                            <Badge variant="outline">{dashboardCacheStatus.cached_in_other_clients || 0}</Badge>
                          </div>
                          <div className="flex items-center justify-between text-sm">
                            <div className="flex items-center gap-2">
                              <div className="h-2 w-2 rounded-full bg-purple-500" />
                              <span>Prospects</span>
                            </div>
                            <Badge variant="outline">{dashboardCacheStatus.cached_in_prospects || 0}</Badge>
                          </div>
                          <div className="flex items-center justify-between text-sm">
                            <div className="flex items-center gap-2">
                              <div className="h-2 w-2 rounded-full bg-yellow-500" />
                              <span>Bookings</span>
                            </div>
                            <Badge variant="outline">{dashboardCacheStatus.cached_in_bookings || 0}</Badge>
                          </div>
                        </div>
                      </div>

                      <div className="p-2 bg-blue-50 dark:bg-blue-950 rounded text-xs text-blue-700 dark:text-blue-300">
                        <AlertCircle className="h-3 w-3 inline mr-1" />
                        Metadata is shared. AI analysis is personalized per client.
                      </div>
                    </div>
                  )}

                  {/* Action Buttons */}
                  <div className="space-y-2">
                    <Button
                      variant="outline"
                      className="w-full"
                      onClick={handleCheckDashboardCache}
                      disabled={dashboardCacheLoading}
                    >
                      {dashboardCacheLoading ? (
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      ) : (
                        <ListChecks className="mr-2 h-4 w-4" />
                      )}
                      Check Cache Status
                    </Button>

                    <Button
                      variant="outline"
                      className="w-full justify-between"
                      onClick={handleFetchDashboardPodcasts}
                      disabled={dashboardCacheLoading}
                    >
                      <span className="flex items-center">
                        {dashboardCacheLoading ? (
                          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        ) : (
                          <Download className="mr-2 h-4 w-4" />
                        )}
                        Fetch & Cache Metadata
                      </span>
                      {dashboardCacheStatus?.needs_fetch !== undefined && dashboardCacheStatus.needs_fetch > 0 && (
                        <Badge variant="secondary" className="ml-2">
                          {dashboardCacheStatus.needs_fetch} missing
                        </Badge>
                      )}
                    </Button>

                    <Button
                      variant="outline"
                      className="w-full justify-between"
                      onClick={handleRunAiAnalysis}
                      disabled={dashboardAiLoading || !dashboardCacheStatus?.cached}
                    >
                      <span className="flex items-center">
                        {dashboardAiLoading ? (
                          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        ) : (
                          <Brain className="mr-2 h-4 w-4" />
                        )}
                        Run AI Analysis
                        {dashboardCacheStatus && dashboardCacheStatus.cached > 0 && (
                          <span className="ml-2 text-muted-foreground">
                            ({(dashboardCacheStatus.cached - (dashboardCacheStatus.aiAnalyzed || 0))} need analysis)
                          </span>
                        )}
                      </span>
                      <Badge variant="secondary" className="ml-2">
                        Personalized
                      </Badge>
                    </Button>

                    <div className="pt-2 border-t">
                      <Button
                        className="w-full bg-primary/5 hover:bg-primary/10"
                        variant="outline"
                        onClick={handleViewDashboard}
                        disabled={!client.dashboard_slug}
                      >
                        <Eye className="mr-2 h-4 w-4" />
                        View Dashboard as Client
                      </Button>
                    </div>
                  </div>

                  {/* Client Feedback Section */}
                  {clientFeedback.length > 0 && (
                    <div className="pt-3 border-t space-y-3">
                      <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                        Client Feedback
                      </p>
                      <div className="grid grid-cols-3 gap-2">
                        <button
                          onClick={() => setExpandedFeedbackSection(expandedFeedbackSection === 'approved' ? null : 'approved')}
                          className={cn(
                            "p-3 rounded-lg text-center transition-all",
                            expandedFeedbackSection === 'approved'
                              ? "bg-green-100 dark:bg-green-900/50 ring-2 ring-green-500"
                              : "bg-green-50 dark:bg-green-950/30 hover:bg-green-100 dark:hover:bg-green-900/40"
                          )}
                        >
                          <div className="flex items-center justify-center gap-1 text-green-600 dark:text-green-400 mb-1">
                            <ThumbsUp className="h-4 w-4" />
                          </div>
                          <p className="text-lg font-bold text-green-700 dark:text-green-300">
                            {clientFeedback.filter((f: any) => f.status === 'approved').length}
                          </p>
                          <p className="text-xs text-green-600 dark:text-green-400">Approved</p>
                        </button>
                        <button
                          onClick={() => setExpandedFeedbackSection(expandedFeedbackSection === 'rejected' ? null : 'rejected')}
                          className={cn(
                            "p-3 rounded-lg text-center transition-all",
                            expandedFeedbackSection === 'rejected'
                              ? "bg-red-100 dark:bg-red-900/50 ring-2 ring-red-500"
                              : "bg-red-50 dark:bg-red-950/30 hover:bg-red-100 dark:hover:bg-red-900/40"
                          )}
                        >
                          <div className="flex items-center justify-center gap-1 text-red-600 dark:text-red-400 mb-1">
                            <ThumbsDown className="h-4 w-4" />
                          </div>
                          <p className="text-lg font-bold text-red-700 dark:text-red-300">
                            {clientFeedback.filter((f: any) => f.status === 'rejected').length}
                          </p>
                          <p className="text-xs text-red-600 dark:text-red-400">Rejected</p>
                        </button>
                        <button
                          onClick={() => setExpandedFeedbackSection(expandedFeedbackSection === 'notes' ? null : 'notes')}
                          className={cn(
                            "p-3 rounded-lg text-center transition-all",
                            expandedFeedbackSection === 'notes'
                              ? "bg-slate-200 dark:bg-slate-700 ring-2 ring-slate-500"
                              : "bg-slate-50 dark:bg-slate-800/50 hover:bg-slate-100 dark:hover:bg-slate-700/50"
                          )}
                        >
                          <div className="flex items-center justify-center gap-1 text-slate-600 dark:text-slate-400 mb-1">
                            <MessageSquare className="h-4 w-4" />
                          </div>
                          <p className="text-lg font-bold text-slate-700 dark:text-slate-300">
                            {clientFeedback.filter((f: any) => f.notes).length}
                          </p>
                          <p className="text-xs text-slate-600 dark:text-slate-400">With Notes</p>
                        </button>
                      </div>

                      {/* Approved List */}
                      {expandedFeedbackSection === 'approved' && clientFeedback.filter((f: any) => f.status === 'approved').length > 0 && (
                        <div className="space-y-2">
                          <p className="text-xs font-medium text-green-600 dark:text-green-400 uppercase tracking-wide">
                            Approved Podcasts
                          </p>
                          <div className="space-y-2 max-h-48 overflow-y-auto">
                            {clientFeedback.filter((f: any) => f.status === 'approved').map((fb: any) => (
                              <div
                                key={fb.id}
                                className="p-2 rounded-lg border bg-green-50/50 dark:bg-green-950/20 border-green-200 dark:border-green-800"
                              >
                                <div className="flex items-center gap-2">
                                  <CheckCircle2 className="h-3.5 w-3.5 text-green-600 flex-shrink-0" />
                                  <span className="font-medium text-sm truncate">
                                    {fb.podcast_name || 'Unknown Podcast'}
                                  </span>
                                </div>
                                {fb.notes && (
                                  <p className="text-xs text-muted-foreground mt-1 italic pl-5">
                                    "{fb.notes}"
                                  </p>
                                )}
                              </div>
                            ))}
                          </div>
                        </div>
                      )}

                      {/* Rejected List */}
                      {expandedFeedbackSection === 'rejected' && clientFeedback.filter((f: any) => f.status === 'rejected').length > 0 && (
                        <div className="space-y-2">
                          <div className="flex items-center justify-between">
                            <p className="text-xs font-medium text-red-600 dark:text-red-400 uppercase tracking-wide">
                              Rejected Podcasts
                            </p>
                            <Button
                              variant="outline"
                              size="sm"
                              className="h-7 text-xs text-red-600 border-red-300 hover:bg-red-50 dark:hover:bg-red-950/30"
                              onClick={deleteAllRejectedPodcasts}
                              disabled={deletingAllRejected}
                            >
                              {deletingAllRejected ? (
                                <>
                                  <Loader2 className="h-3 w-3 mr-1 animate-spin" />
                                  Deleting...
                                </>
                              ) : (
                                <>
                                  <Trash2 className="h-3 w-3 mr-1" />
                                  Delete All
                                </>
                              )}
                            </Button>
                          </div>
                          <div className="space-y-2 max-h-48 overflow-y-auto">
                            {clientFeedback.filter((f: any) => f.status === 'rejected').map((fb: any) => (
                              <div
                                key={fb.id}
                                className="p-2 rounded-lg border bg-red-50/50 dark:bg-red-950/20 border-red-200 dark:border-red-800"
                              >
                                <div className="flex items-center gap-2">
                                  <XCircle className="h-3.5 w-3.5 text-red-600 flex-shrink-0" />
                                  <span className="font-medium text-sm truncate flex-1">
                                    {fb.podcast_name || 'Unknown Podcast'}
                                  </span>
                                  <Button
                                    variant="ghost"
                                    size="icon"
                                    className="h-6 w-6 text-red-600 hover:text-red-700 hover:bg-red-100 dark:hover:bg-red-900/30 flex-shrink-0"
                                    onClick={() => deletePodcastFromDashboard(fb.podcast_id, fb.podcast_name)}
                                    disabled={deletingPodcastId === fb.podcast_id}
                                  >
                                    {deletingPodcastId === fb.podcast_id ? (
                                      <Loader2 className="h-3 w-3 animate-spin" />
                                    ) : (
                                      <Trash2 className="h-3 w-3" />
                                    )}
                                  </Button>
                                </div>
                                {fb.notes && (
                                  <p className="text-xs text-muted-foreground mt-1 italic pl-5">
                                    "{fb.notes}"
                                  </p>
                                )}
                              </div>
                            ))}
                          </div>
                        </div>
                      )}

                      {/* Notes List */}
                      {expandedFeedbackSection === 'notes' && clientFeedback.filter((f: any) => f.notes).length > 0 && (
                        <div className="space-y-2">
                          <p className="text-xs font-medium text-slate-600 dark:text-slate-400 uppercase tracking-wide">
                            Feedback with Notes
                          </p>
                          <div className="space-y-2 max-h-48 overflow-y-auto">
                            {clientFeedback.filter((f: any) => f.notes).map((fb: any) => (
                              <div
                                key={fb.id}
                                className="p-2 rounded-lg border bg-slate-50 dark:bg-slate-800/50"
                              >
                                <div className="flex items-center gap-2 mb-1">
                                  {fb.status === 'approved' ? (
                                    <CheckCircle2 className="h-3.5 w-3.5 text-green-600 flex-shrink-0" />
                                  ) : (
                                    <XCircle className="h-3.5 w-3.5 text-red-600 flex-shrink-0" />
                                  )}
                                  <span className="font-medium text-sm truncate">
                                    {fb.podcast_name || 'Unknown Podcast'}
                                  </span>
                                </div>
                                <p className="text-xs text-muted-foreground italic pl-5">
                                  "{fb.notes}"
                                </p>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  )}

                  {/* Info text */}
                  <p className="text-xs text-muted-foreground">
                    The dashboard shows podcasts from the Google Sheet. Clients can approve/reject podcasts before outreach.
                  </p>
                </>
              ) : (
                <div className="text-center py-4">
                  <Mic className="h-8 w-8 mx-auto text-muted-foreground mb-2" />
                  <p className="text-sm text-muted-foreground">
                    Set up a Google Sheet first to enable the approval dashboard
                  </p>
                  <Button variant="link" onClick={handleEditClient} className="mt-2">
                    <Edit className="mr-2 h-4 w-4" />
                    Edit Client to Add Google Sheet
                  </Button>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Podcast Outreach Interface */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Send className="h-5 w-5" />
                Podcast Outreach Interface
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {/* Webhook URL Configuration */}
              <div className="space-y-2">
                <Label htmlFor="webhook-url">Webhook URL</Label>
                <div className="flex gap-2">
                  <Input
                    id="webhook-url"
                    type="url"
                    placeholder="https://your-webhook-endpoint.com/podcast-outreach"
                    value={webhookUrl}
                    onChange={(e) => setWebhookUrl(e.target.value)}
                    className="flex-1"
                  />
                  <Button
                    onClick={handleSaveWebhookUrl}
                    disabled={savingWebhookUrl || webhookUrl === (client?.outreach_webhook_url || '')}
                  >
                    {savingWebhookUrl ? (
                      <>
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        Saving...
                      </>
                    ) : (
                      <>
                        <Save className="mr-2 h-4 w-4" />
                        Save
                      </>
                    )}
                  </Button>
                </div>
                <p className="text-xs text-muted-foreground">
                  This URL will receive POST requests when podcasts are approved for outreach
                </p>
              </div>

              {/* Stats Display */}
              {cachedPodcasts.length > 0 && (
                <div className="grid grid-cols-4 gap-3">
                  <div className="p-3 rounded-lg border bg-muted/30">
                    <div className="text-2xl font-bold">{outreachStats.total}</div>
                    <div className="text-xs text-muted-foreground">Total</div>
                  </div>
                  <div
                    className="p-3 rounded-lg border bg-green-50 dark:bg-green-900/20 cursor-pointer hover:bg-green-100 dark:hover:bg-green-900/30 transition-colors"
                    onClick={() => setExpandedOutreachSection(expandedOutreachSection === 'sent' ? null : 'sent')}
                  >
                    <div className="text-2xl font-bold text-green-600 dark:text-green-400">
                      {outreachStats.sent}
                    </div>
                    <div className="text-xs text-muted-foreground">Sent (click to view)</div>
                  </div>
                  <div
                    className="p-3 rounded-lg border bg-red-50 dark:bg-red-900/20 cursor-pointer hover:bg-red-100 dark:hover:bg-red-900/30 transition-colors"
                    onClick={() => setExpandedOutreachSection(expandedOutreachSection === 'skipped' ? null : 'skipped')}
                  >
                    <div className="text-2xl font-bold text-red-600 dark:text-red-400">
                      {outreachStats.skipped}
                    </div>
                    <div className="text-xs text-muted-foreground">Skipped (click to view)</div>
                  </div>
                  <div className="p-3 rounded-lg border bg-blue-50 dark:bg-blue-900/20">
                    <div className="text-2xl font-bold text-blue-600 dark:text-blue-400">
                      {outreachStats.remaining}
                    </div>
                    <div className="text-xs text-muted-foreground">Remaining</div>
                  </div>
                </div>
              )}

              {/* Expanded Outreach Lists */}
              {expandedOutreachSection && (
                <div className="p-4 border rounded-lg bg-muted/30">
                  {expandedOutreachSection === 'sent' && (
                    <div className="space-y-2">
                      <div className="flex items-center justify-between mb-3">
                        <p className="text-sm font-medium text-green-600 dark:text-green-400 uppercase tracking-wide">
                          Sent to Outreach ({outreachActions.filter(a => a.action === 'sent').length})
                        </p>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => setExpandedOutreachSection(null)}
                        >
                          <X className="h-4 w-4" />
                        </Button>
                      </div>
                      <div className="space-y-2 max-h-96 overflow-y-auto">
                        {outreachActions
                          .filter(a => a.action === 'sent')
                          .map((action) => (
                            <div
                              key={action.id}
                              className="p-3 rounded-lg border bg-white dark:bg-slate-800"
                            >
                              <div className="flex items-start justify-between gap-2">
                                <div className="flex-1 min-w-0">
                                  <div className="flex items-center gap-2 mb-1">
                                    <CheckCircle2 className="h-4 w-4 text-green-600 flex-shrink-0" />
                                    <span className="font-medium text-sm truncate">
                                      {action.podcast_name || 'Unknown Podcast'}
                                    </span>
                                  </div>
                                  <div className="text-xs text-muted-foreground space-y-1">
                                    <p>Sent: {new Date(action.webhook_sent_at || action.created_at).toLocaleString()}</p>
                                    {action.webhook_response_status && (
                                      <p className={action.webhook_response_status >= 200 && action.webhook_response_status < 300 ? 'text-green-600' : 'text-red-600'}>
                                        Status: {action.webhook_response_status}
                                      </p>
                                    )}
                                  </div>
                                </div>
                              </div>
                            </div>
                          ))}
                      </div>
                    </div>
                  )}

                  {expandedOutreachSection === 'skipped' && (
                    <div className="space-y-2">
                      <div className="flex items-center justify-between mb-3">
                        <p className="text-sm font-medium text-red-600 dark:text-red-400 uppercase tracking-wide">
                          Skipped Podcasts ({outreachActions.filter(a => a.action === 'skipped').length})
                        </p>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => setExpandedOutreachSection(null)}
                        >
                          <X className="h-4 w-4" />
                        </Button>
                      </div>
                      <div className="space-y-2 max-h-96 overflow-y-auto">
                        {outreachActions
                          .filter(a => a.action === 'skipped')
                          .map((action) => (
                            <div
                              key={action.id}
                              className="p-3 rounded-lg border bg-white dark:bg-slate-800"
                            >
                              <div className="flex items-start justify-between gap-2">
                                <div className="flex-1 min-w-0">
                                  <div className="flex items-center gap-2 mb-1">
                                    <XCircle className="h-4 w-4 text-red-600 flex-shrink-0" />
                                    <span className="font-medium text-sm truncate">
                                      {action.podcast_name || 'Unknown Podcast'}
                                    </span>
                                  </div>
                                  <div className="text-xs text-muted-foreground">
                                    <p>Skipped: {new Date(action.created_at).toLocaleString()}</p>
                                  </div>
                                </div>
                              </div>
                            </div>
                          ))}
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* Client Feedback Display */}
              {clientFeedback.length > 0 && (
                <div className="space-y-3 pt-2">
                  <div className="grid grid-cols-3 gap-2">
                    <Button
                      variant={expandedFeedbackSection === 'approved' ? 'default' : 'outline'}
                      size="sm"
                      className="h-auto py-2 flex flex-col items-center gap-1"
                      onClick={() => setExpandedFeedbackSection(expandedFeedbackSection === 'approved' ? null : 'approved')}
                    >
                      <ThumbsUp className="h-4 w-4" />
                      <span className="text-xs">
                        {clientFeedback.filter((f: any) => f.status === 'approved').length} Approved
                      </span>
                    </Button>
                    <Button
                      variant={expandedFeedbackSection === 'rejected' ? 'default' : 'outline'}
                      size="sm"
                      className="h-auto py-2 flex flex-col items-center gap-1"
                      onClick={() => setExpandedFeedbackSection(expandedFeedbackSection === 'rejected' ? null : 'rejected')}
                    >
                      <ThumbsDown className="h-4 w-4" />
                      <span className="text-xs">
                        {clientFeedback.filter((f: any) => f.status === 'rejected').length} Rejected
                      </span>
                    </Button>
                    <Button
                      variant={expandedFeedbackSection === 'notes' ? 'default' : 'outline'}
                      size="sm"
                      className="h-auto py-2 flex flex-col items-center gap-1"
                      onClick={() => setExpandedFeedbackSection(expandedFeedbackSection === 'notes' ? null : 'notes')}
                    >
                      <MessageSquare className="h-4 w-4" />
                      <span className="text-xs">
                        {clientFeedback.filter((f: any) => f.notes).length} With Notes
                      </span>
                    </Button>
                  </div>

                  {/* Expanded Feedback Sections */}
                  {expandedFeedbackSection && (
                    <div className="p-3 border rounded-lg bg-muted/30">
                      {/* Approved List */}
                      {expandedFeedbackSection === 'approved' && clientFeedback.filter((f: any) => f.status === 'approved').length > 0 && (
                        <div className="space-y-2">
                          <p className="text-xs font-medium text-green-600 dark:text-green-400 uppercase tracking-wide">
                            Approved Podcasts
                          </p>
                          <div className="space-y-2 max-h-48 overflow-y-auto">
                            {clientFeedback.filter((f: any) => f.status === 'approved').map((fb: any) => (
                              <div
                                key={fb.id}
                                className="p-2 rounded-lg border bg-green-50/50 dark:bg-green-950/20"
                              >
                                <div className="flex items-center gap-2">
                                  <CheckCircle2 className="h-3.5 w-3.5 text-green-600 flex-shrink-0" />
                                  <span className="font-medium text-sm truncate">
                                    {fb.podcast_name || 'Unknown Podcast'}
                                  </span>
                                </div>
                                {fb.notes && (
                                  <p className="text-xs text-muted-foreground mt-1 italic pl-5">
                                    "{fb.notes}"
                                  </p>
                                )}
                              </div>
                            ))}
                          </div>
                        </div>
                      )}

                      {/* Rejected List */}
                      {expandedFeedbackSection === 'rejected' && clientFeedback.filter((f: any) => f.status === 'rejected').length > 0 && (
                        <div className="space-y-2">
                          <div className="flex items-center justify-between">
                            <p className="text-xs font-medium text-red-600 dark:text-red-400 uppercase tracking-wide">
                              Rejected Podcasts
                            </p>
                            <Button
                              variant="outline"
                              size="sm"
                              className="h-7 text-xs text-red-600 border-red-300 hover:bg-red-50 dark:hover:bg-red-950/30"
                              onClick={deleteAllRejectedPodcasts}
                              disabled={deletingAllRejected}
                            >
                              {deletingAllRejected ? (
                                <>
                                  <Loader2 className="h-3 w-3 mr-1 animate-spin" />
                                  Deleting...
                                </>
                              ) : (
                                <>
                                  <Trash2 className="h-3 w-3 mr-1" />
                                  Delete All
                                </>
                              )}
                            </Button>
                          </div>
                          <div className="space-y-2 max-h-48 overflow-y-auto">
                            {clientFeedback.filter((f: any) => f.status === 'rejected').map((fb: any) => (
                              <div
                                key={fb.id}
                                className="p-2 rounded-lg border bg-red-50/50 dark:bg-red-950/20 border-red-200 dark:border-red-800"
                              >
                                <div className="flex items-center gap-2">
                                  <XCircle className="h-3.5 w-3.5 text-red-600 flex-shrink-0" />
                                  <span className="font-medium text-sm truncate flex-1">
                                    {fb.podcast_name || 'Unknown Podcast'}
                                  </span>
                                  <Button
                                    variant="ghost"
                                    size="icon"
                                    className="h-6 w-6 text-red-600 hover:text-red-700 hover:bg-red-100 dark:hover:bg-red-900/30 flex-shrink-0"
                                    onClick={() => deletePodcastFromDashboard(fb.podcast_id, fb.podcast_name)}
                                    disabled={deletingPodcastId === fb.podcast_id}
                                  >
                                    {deletingPodcastId === fb.podcast_id ? (
                                      <Loader2 className="h-3 w-3 animate-spin" />
                                    ) : (
                                      <Trash2 className="h-3 w-3" />
                                    )}
                                  </Button>
                                </div>
                                {fb.notes && (
                                  <p className="text-xs text-muted-foreground mt-1 italic pl-5">
                                    "{fb.notes}"
                                  </p>
                                )}
                              </div>
                            ))}
                          </div>
                        </div>
                      )}

                      {/* Notes List */}
                      {expandedFeedbackSection === 'notes' && clientFeedback.filter((f: any) => f.notes).length > 0 && (
                        <div className="space-y-2">
                          <p className="text-xs font-medium text-slate-600 dark:text-slate-400 uppercase tracking-wide">
                            Feedback with Notes
                          </p>
                          <div className="space-y-2 max-h-48 overflow-y-auto">
                            {clientFeedback.filter((f: any) => f.notes).map((fb: any) => (
                              <div
                                key={fb.id}
                                className="p-2 rounded-lg border bg-slate-50 dark:bg-slate-800/50"
                              >
                                <div className="flex items-center gap-2 mb-1">
                                  {fb.status === 'approved' ? (
                                    <CheckCircle2 className="h-3.5 w-3.5 text-green-600 flex-shrink-0" />
                                  ) : (
                                    <XCircle className="h-3.5 w-3.5 text-red-600 flex-shrink-0" />
                                  )}
                                  <span className="font-medium text-sm truncate">
                                    {fb.podcast_name || 'Unknown Podcast'}
                                  </span>
                                </div>
                                <p className="text-xs text-muted-foreground italic pl-5">
                                  "{fb.notes}"
                                </p>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}

              {/* Outreach Interface */}
              {client?.google_sheet_url ? (
                <>
                  {!client?.outreach_webhook_url && (
                    <div className="bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded-lg p-3">
                      <p className="text-sm text-yellow-800 dark:text-yellow-200">
                        ⚠️ Configure a webhook URL above to start sending outreach approvals
                      </p>
                    </div>
                  )}

                  <Collapsible open={outreachModeActive} onOpenChange={setOutreachModeActive}>
                    <CollapsibleTrigger asChild>
                      <Button
                        variant="outline"
                        className="w-full"
                        disabled={!client?.outreach_webhook_url}
                      >
                        {outreachModeActive ? (
                          <>
                            <ChevronUp className="mr-2 h-4 w-4" />
                            Hide Outreach Review
                          </>
                        ) : (
                          <>
                            <ChevronDown className="mr-2 h-4 w-4" />
                            Start Outreach Review ({outreachStats.remaining} remaining)
                          </>
                        )}
                      </Button>
                    </CollapsibleTrigger>
                    <CollapsibleContent className="mt-4">
                      {availablePodcasts.length > 0 ? (
                        <PodcastOutreachSwiper
                          podcasts={availablePodcasts}
                          currentIndex={currentPodcastIndex}
                          onCheckmark={handleSendWebhook}
                          onSkip={handleSkipPodcast}
                          onNext={() => setCurrentPodcastIndex(prev => Math.min(prev + 1, availablePodcasts.length - 1))}
                          onPrevious={() => setCurrentPodcastIndex(prev => Math.max(prev - 1, 0))}
                          sendingWebhook={sendingWebhook}
                          alreadyActioned={actionedPodcastIds}
                        />
                      ) : (
                        <div className="text-center py-8">
                          <CheckCircle2 className="h-12 w-12 mx-auto text-green-500 mb-2" />
                          <p className="text-lg font-semibold">All Podcasts Reviewed!</p>
                          <p className="text-sm text-muted-foreground mt-1">
                            {outreachStats.sent} sent, {outreachStats.skipped} skipped
                          </p>
                        </div>
                      )}
                    </CollapsibleContent>
                  </Collapsible>
                </>
              ) : (
                <div className="text-center py-4">
                  <Send className="h-8 w-8 mx-auto text-muted-foreground mb-2" />
                  <p className="text-sm text-muted-foreground">
                    Set up a Google Sheet first to enable podcast outreach
                  </p>
                  <Button variant="link" onClick={handleEditClient} className="mt-2">
                    <Edit className="mr-2 h-4 w-4" />
                    Edit Client to Add Google Sheet
                  </Button>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Addon Orders Management */}
          {clientAddons && clientAddons.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Package className="h-5 w-5" />
                  Add-on Services ({clientAddons.length})
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  {clientAddons.map((addon: BookingAddon) => (
                    <div key={addon.id} className="p-4 border rounded-lg space-y-3">
                      {/* Header */}
                      <div className="flex items-start justify-between">
                        <div className="flex-1">
                          <h4 className="font-semibold">{addon.service?.name}</h4>
                          <p className="text-sm text-muted-foreground">
                            {addon.booking?.podcast_name || 'Unknown Podcast'}
                          </p>
                        </div>
                        <div className="text-right">
                          <div className="font-semibold">{formatPrice(addon.amount_paid_cents)}</div>
                          <div className="text-xs text-muted-foreground">
                            {new Date(addon.purchased_at).toLocaleDateString('en-US', {
                              month: 'short',
                              day: 'numeric',
                              year: 'numeric'
                            })}
                          </div>
                        </div>
                      </div>

                      {/* Status & Actions */}
                      <div className="grid gap-3 md:grid-cols-2">
                        {/* Status Dropdown */}
                        <div className="space-y-1.5">
                          <Label htmlFor={`status-${addon.id}`} className="text-xs">Status</Label>
                          <Select
                            value={addon.status}
                            onValueChange={(value) => {
                              updateBookingAddonStatus(
                                addon.id,
                                value as BookingAddon['status'],
                                addon.google_drive_url || undefined,
                                addon.admin_notes || undefined
                              ).then(() => {
                                toast({
                                  title: 'Status Updated',
                                  description: `Order status changed to ${getAddonStatusText(value as BookingAddon['status'])}`
                                })
                                queryClient.invalidateQueries({ queryKey: ['client-addons', id] })
                              }).catch(error => {
                                toast({
                                  title: 'Error',
                                  description: error.message,
                                  variant: 'destructive'
                                })
                              })
                            }}
                          >
                            <SelectTrigger id={`status-${addon.id}`}>
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="pending">Pending</SelectItem>
                              <SelectItem value="in_progress">In Progress</SelectItem>
                              <SelectItem value="delivered">Delivered</SelectItem>
                              <SelectItem value="cancelled">Cancelled</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>

                        {/* Google Drive URL */}
                        <div className="space-y-1.5">
                          <Label htmlFor={`drive-${addon.id}`} className="text-xs">Google Drive URL</Label>
                          <div className="flex gap-2">
                            <Input
                              id={`drive-${addon.id}`}
                              placeholder="https://drive.google.com/..."
                              defaultValue={addon.google_drive_url || ''}
                              onBlur={(e) => {
                                const newUrl = e.target.value
                                if (newUrl !== (addon.google_drive_url || '')) {
                                  updateBookingAddonStatus(
                                    addon.id,
                                    addon.status,
                                    newUrl || undefined,
                                    addon.admin_notes || undefined
                                  ).then(() => {
                                    toast({
                                      title: 'Drive URL Updated'
                                    })
                                    queryClient.invalidateQueries({ queryKey: ['client-addons', id] })
                                  })
                                }
                              }}
                            />
                            {addon.google_drive_url && (
                              <Button
                                size="icon"
                                variant="outline"
                                onClick={() => window.open(addon.google_drive_url!, '_blank')}
                              >
                                <ExternalLink className="h-4 w-4" />
                              </Button>
                            )}
                          </div>
                        </div>
                      </div>

                      {/* Admin Notes */}
                      <div className="space-y-1.5">
                        <Label htmlFor={`notes-${addon.id}`} className="text-xs">Admin Notes</Label>
                        <textarea
                          id={`notes-${addon.id}`}
                          className="w-full min-h-[60px] px-3 py-2 text-sm border rounded-md"
                          placeholder="Internal notes about this order..."
                          defaultValue={addon.admin_notes || ''}
                          onBlur={(e) => {
                            const newNotes = e.target.value
                            if (newNotes !== (addon.admin_notes || '')) {
                              updateBookingAddonStatus(
                                addon.id,
                                addon.status,
                                addon.google_drive_url || undefined,
                                newNotes || undefined
                              ).then(() => {
                                toast({
                                  title: 'Notes Updated'
                                })
                                queryClient.invalidateQueries({ queryKey: ['client-addons', id] })
                              })
                            }
                          }}
                        />
                      </div>

                      {/* Delete Order Button */}
                      <div className="pt-2 border-t">
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => setOrderToDelete(addon)}
                          className="w-full text-red-600 hover:text-red-700 hover:bg-red-50"
                        >
                          <Trash2 className="h-4 w-4 mr-2" />
                          Delete Order
                        </Button>
                      </div>

                      {/* Delivered Info */}
                      {addon.delivered_at && (
                        <div className="text-xs text-muted-foreground flex items-center gap-1 pt-1">
                          <CheckCircle2 className="h-3 w-3 text-green-600" />
                          Delivered on {new Date(addon.delivered_at).toLocaleDateString('en-US', {
                            month: 'short',
                            day: 'numeric',
                            year: 'numeric'
                          })}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}

          {/* Progress Stats */}
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle>Progress Overview</CardTitle>
                <div className="flex items-center gap-2">
                  <Button variant="outline" size="icon" onClick={goToPreviousMonth}>
                    <ChevronLeft className="h-4 w-4" />
                  </Button>
                  <div className="text-center min-w-[150px]">
                    <p className="text-sm font-semibold">{monthNames[selectedMonth]} {selectedYear}</p>
                  </div>
                  <Button variant="outline" size="icon" onClick={goToNextMonth}>
                    <ChevronRight className="h-4 w-4" />
                  </Button>
                  <Button variant="outline" size="sm" onClick={goToThisMonth}>
                    This Month
                  </Button>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
                <div className="text-center p-4 bg-muted rounded-lg">
                  <div className="text-2xl font-bold">{totalCount}</div>
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
                  <div className="text-2xl font-bold">{completionRate.toFixed(0)}%</div>
                  <div className="text-xs text-muted-foreground mt-1">Completion Rate</div>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Notes */}
        {client.notes && (
          <Card>
            <CardHeader>
              <CardTitle>Notes</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground">{client.notes}</p>
            </CardContent>
          </Card>
        )}

        {/* Upcoming Recordings */}
        <Card>
          <CardHeader>
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <CardTitle className="text-lg sm:text-xl">Upcoming Recordings</CardTitle>
              <div className="flex items-center gap-1 flex-wrap">
                <Button
                  variant={upcomingTimeRange === 30 ? 'default' : 'outline'}
                  size="sm"
                  onClick={() => setUpcomingTimeRange(30)}
                  className="text-xs"
                >
                  1mo
                </Button>
                <Button
                  variant={upcomingTimeRange === 60 ? 'default' : 'outline'}
                  size="sm"
                  onClick={() => setUpcomingTimeRange(60)}
                  className="text-xs"
                >
                  2mo
                </Button>
                <Button
                  variant={upcomingTimeRange === 90 ? 'default' : 'outline'}
                  size="sm"
                  onClick={() => setUpcomingTimeRange(90)}
                  className="text-xs"
                >
                  3mo
                </Button>
                <Button
                  variant={upcomingTimeRange === 180 ? 'default' : 'outline'}
                  size="sm"
                  onClick={() => setUpcomingTimeRange(180)}
                  className="text-xs"
                >
                  6mo
                </Button>
              </div>
            </div>
            <p className="text-xs sm:text-sm text-muted-foreground">Next {upcomingTimeRange} days</p>
          </CardHeader>
          <CardContent>
            {upcomingRecordings.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                <Calendar className="h-8 w-8 mx-auto mb-2 opacity-50" />
                <p className="text-sm">No upcoming recordings</p>
              </div>
            ) : (
              <div className="space-y-3">
                {upcomingRecordings.map(booking => (
                  <div
                    key={booking.id}
                    className={`flex items-start gap-4 p-3 rounded-lg border ${
                      !booking.prep_sent ? 'bg-amber-50 dark:bg-amber-950/20 border-amber-200 dark:border-amber-900' : 'bg-muted/30'
                    }`}
                  >
                    {/* Date Column */}
                    <div className="flex-shrink-0 text-center min-w-[80px]">
                      <div className="text-sm font-bold">{formatUpcomingDate(booking.recording_date!)}</div>
                    </div>

                    {/* Main Content */}
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold truncate">{booking.podcast_name}</p>
                      {booking.host_name && (
                        <p className="text-xs text-muted-foreground">Host: {booking.host_name}</p>
                      )}
                      <div className="flex items-center gap-2 mt-1">
                        {getStatusBadge(booking.status)}
                        {!booking.prep_sent && (
                          <div className="flex items-center gap-1 text-xs text-amber-600">
                            <AlertCircle className="h-3 w-3" />
                            <span>Prep not sent</span>
                          </div>
                        )}
                        {booking.prep_sent && (
                          <div className="flex items-center gap-1 text-xs text-green-600">
                            <CheckCircle2 className="h-3 w-3" />
                            <span>Prep sent</span>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Upcoming Going Live */}
        <Card>
          <CardHeader>
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <CardTitle className="text-lg sm:text-xl">Upcoming Going Live</CardTitle>
              <div className="flex items-center gap-1 flex-wrap">
                <Button
                  variant={goingLiveTimeRange === 30 ? 'default' : 'outline'}
                  size="sm"
                  onClick={() => setGoingLiveTimeRange(30)}
                  className="text-xs"
                >
                  1mo
                </Button>
                <Button
                  variant={goingLiveTimeRange === 60 ? 'default' : 'outline'}
                  size="sm"
                  onClick={() => setGoingLiveTimeRange(60)}
                  className="text-xs"
                >
                  2mo
                </Button>
                <Button
                  variant={goingLiveTimeRange === 90 ? 'default' : 'outline'}
                  size="sm"
                  onClick={() => setGoingLiveTimeRange(90)}
                  className="text-xs"
                >
                  3mo
                </Button>
                <Button
                  variant={goingLiveTimeRange === 180 ? 'default' : 'outline'}
                  size="sm"
                  onClick={() => setGoingLiveTimeRange(180)}
                  className="text-xs"
                >
                  6mo
                </Button>
              </div>
            </div>
            <p className="text-xs sm:text-sm text-muted-foreground">Next {goingLiveTimeRange} days</p>
          </CardHeader>
          <CardContent>
            {upcomingGoingLive.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                <Rocket className="h-8 w-8 mx-auto mb-2 opacity-50" />
                <p className="text-sm">No upcoming publications</p>
              </div>
            ) : (
              <div className="space-y-3">
                {upcomingGoingLive.map(booking => (
                  <div
                    key={booking.id}
                    className="flex items-start gap-4 p-3 rounded-lg border bg-muted/30"
                  >
                    {/* Date Column */}
                    <div className="flex-shrink-0 text-center min-w-[80px]">
                      <div className="text-sm font-bold">{formatUpcomingDate(booking.publish_date!)}</div>
                    </div>

                    {/* Main Content */}
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold truncate">{booking.podcast_name}</p>
                      {booking.host_name && (
                        <p className="text-xs text-muted-foreground">Host: {booking.host_name}</p>
                      )}
                      <div className="flex items-center gap-2 mt-1">
                        {getStatusBadge(booking.status)}
                        {booking.episode_url && (
                          <a
                            href={booking.episode_url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-xs text-primary hover:underline inline-flex items-center gap-1"
                          >
                            <Rocket className="h-3 w-3" />
                            Episode Link
                          </a>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Booking Timeline */}
        <Card>
          <CardHeader>
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
              <div>
                <CardTitle>All Bookings</CardTitle>
                <p className="text-sm text-muted-foreground mt-1">
                  Complete list of podcast bookings - scheduled and unscheduled
                </p>
              </div>
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
                        {booking.scheduled_date ? formatDate(booking.scheduled_date) : (
                          <span className="text-muted-foreground text-sm">Unscheduled</span>
                        )}
                      </TableCell>
                      <TableCell>
                        <div>
                          <div className="flex items-center gap-2">
                            <button
                              onClick={() => handleViewPodcast(booking)}
                              className="font-medium text-primary hover:underline text-left"
                            >
                              {booking.podcast_name}
                            </button>
                            {booking.audience_size && (
                              <span className="text-xs text-muted-foreground">
                                👥 {booking.audience_size.toLocaleString()}
                              </span>
                            )}
                          </div>
                          {booking.notes && (
                            <p className="text-xs text-muted-foreground mt-1">
                              {booking.notes}
                            </p>
                          )}
                        </div>
                      </TableCell>
                      <TableCell className="text-muted-foreground">
                        {booking.host_name || '-'}
                      </TableCell>
                      <TableCell>
                        {getStatusBadge(booking.status)}
                      </TableCell>
                      <TableCell>
                        {booking.episode_url ? (
                          <a
                            href={booking.episode_url}
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
                        <div className="flex gap-2 justify-end">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleEditBooking(booking)}
                          >
                            <Edit className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleDeleteBooking(booking)}
                            className="text-destructive hover:text-destructive"
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
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
        <DialogContent className="max-w-md max-h-[90vh] overflow-hidden flex flex-col">
          <DialogHeader>
            <DialogTitle>Add Booking for {client.name}</DialogTitle>
            <DialogDescription>Create a new podcast booking</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 overflow-y-auto pr-2 flex-1">
            {/* Podcast ID Fetcher */}
            <div className="space-y-2 p-4 bg-muted/50 rounded-lg border">
              <Label htmlFor="podcast_id" className="text-sm font-semibold">
                Podcast ID (Podscan)
              </Label>
              <p className="text-xs text-muted-foreground mb-2">
                Enter a Podscan podcast ID to auto-fill booking details
              </p>
              <div className="flex gap-2">
                <Input
                  id="podcast_id"
                  placeholder="e.g., 12345"
                  value={newBookingForm.podcast_id}
                  onChange={(e) => setNewBookingForm({ ...newBookingForm, podcast_id: e.target.value })}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault()
                      handleFetchPodcastDetails()
                    }
                  }}
                />
                <Button
                  type="button"
                  onClick={handleFetchPodcastDetails}
                  disabled={!newBookingForm.podcast_id || fetchingPodcast}
                  variant="secondary"
                >
                  {fetchingPodcast ? (
                    <>
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      Fetching...
                    </>
                  ) : (
                    <>
                      <Download className="h-4 w-4 mr-2" />
                      Fetch
                    </>
                  )}
                </Button>
              </div>
            </div>

            {/* Fetched Data Summary */}
            {newBookingForm.audience_size && (
              <div className="p-4 bg-green-50 dark:bg-green-950/20 rounded-lg border border-green-200 dark:border-green-900">
                <h4 className="text-sm font-semibold mb-3 text-green-900 dark:text-green-100">Podcast Details Fetched ✓</h4>
                <div className="grid grid-cols-2 gap-3 text-sm">
                  <div>
                    <span className="text-muted-foreground">Audience:</span>
                    <div className="font-semibold">{newBookingForm.audience_size.toLocaleString()}</div>
                  </div>
                  {newBookingForm.episode_count && (
                    <div>
                      <span className="text-muted-foreground">Episodes:</span>
                      <div className="font-semibold">{newBookingForm.episode_count}</div>
                    </div>
                  )}
                  {newBookingForm.itunes_rating && (
                    <div>
                      <span className="text-muted-foreground">Rating:</span>
                      <div className="font-semibold">
                        ⭐ {newBookingForm.itunes_rating} ({newBookingForm.itunes_rating_count || 0} reviews)
                      </div>
                    </div>
                  )}
                  {newBookingForm.podcast_image_url && (
                    <div className="col-span-2">
                      <img
                        src={newBookingForm.podcast_image_url}
                        alt="Podcast cover"
                        className="w-20 h-20 rounded-lg object-cover"
                      />
                    </div>
                  )}
                </div>
              </div>
            )}

            <div className="space-y-2">
              <Label htmlFor="podcastName">Podcast Name *</Label>
              <Input
                id="podcastName"
                placeholder="Enter podcast name"
                value={newBookingForm.podcast_name}
                onChange={(e) => setNewBookingForm({ ...newBookingForm, podcast_name: e.target.value })}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="hostName">Host Name</Label>
              <Input
                id="hostName"
                placeholder="Enter host name"
                value={newBookingForm.host_name}
                onChange={(e) => setNewBookingForm({ ...newBookingForm, host_name: e.target.value })}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="podcastUrl">Podcast URL</Label>
              <Input
                id="podcastUrl"
                placeholder="https://..."
                value={newBookingForm.podcast_url}
                onChange={(e) => setNewBookingForm({ ...newBookingForm, podcast_url: e.target.value })}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="scheduledDate">Scheduled Date</Label>
              <Input
                id="scheduledDate"
                type="date"
                value={newBookingForm.scheduled_date}
                onChange={(e) => setNewBookingForm({ ...newBookingForm, scheduled_date: e.target.value })}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="status">Status</Label>
              <Select
                value={newBookingForm.status}
                onValueChange={(value: 'booked' | 'in_progress' | 'recorded' | 'published' | 'cancelled') =>
                  setNewBookingForm({ ...newBookingForm, status: value })
                }
              >
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
              <Textarea
                id="notes"
                placeholder="Any notes about this booking..."
                value={newBookingForm.notes}
                onChange={(e) => setNewBookingForm({ ...newBookingForm, notes: e.target.value })}
              />
            </div>
          </div>
          <div className="flex justify-end gap-2 pt-4 border-t mt-4">
            <Button variant="outline" onClick={() => setIsAddBookingModalOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={handleCreateBooking}
              disabled={!newBookingForm.podcast_name || createBookingMutation.isPending}
            >
              {createBookingMutation.isPending ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Saving...
                </>
              ) : (
                'Save Booking'
              )}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Edit Client Modal */}
      <Dialog open={isEditClientModalOpen} onOpenChange={setIsEditClientModalOpen}>
        <DialogContent className="max-w-md max-h-[90vh] overflow-hidden flex flex-col">
          <DialogHeader>
            <DialogTitle>Edit Client</DialogTitle>
            <DialogDescription>Update client information</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 overflow-y-auto pr-2 flex-1">
            <div className="space-y-2">
              <Label htmlFor="edit-name">Client Name *</Label>
              <Input
                id="edit-name"
                placeholder="Enter client name"
                value={editClientForm.name}
                onChange={(e) => setEditClientForm({ ...editClientForm, name: e.target.value })}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="edit-email">Email</Label>
              <Input
                id="edit-email"
                type="email"
                placeholder="client@example.com"
                value={editClientForm.email}
                onChange={(e) => setEditClientForm({ ...editClientForm, email: e.target.value })}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="edit-contact">Contact Person</Label>
              <Input
                id="edit-contact"
                placeholder="John Doe"
                value={editClientForm.contact_person}
                onChange={(e) => setEditClientForm({ ...editClientForm, contact_person: e.target.value })}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="edit-linkedin">LinkedIn URL</Label>
              <Input
                id="edit-linkedin"
                placeholder="https://linkedin.com/in/..."
                value={editClientForm.linkedin_url}
                onChange={(e) => setEditClientForm({ ...editClientForm, linkedin_url: e.target.value })}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="edit-website">Website</Label>
              <Input
                id="edit-website"
                placeholder="https://example.com"
                value={editClientForm.website}
                onChange={(e) => setEditClientForm({ ...editClientForm, website: e.target.value })}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="edit-status">Status</Label>
              <Select
                value={editClientForm.status}
                onValueChange={(value: 'active' | 'paused' | 'churned') =>
                  setEditClientForm({ ...editClientForm, status: value })
                }
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="active">Active</SelectItem>
                  <SelectItem value="paused">Paused</SelectItem>
                  <SelectItem value="churned">Churned</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="edit-notes">Notes</Label>
              <Textarea
                id="edit-notes"
                placeholder="Any additional notes..."
                value={editClientForm.notes}
                onChange={(e) => setEditClientForm({ ...editClientForm, notes: e.target.value })}
                rows={3}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="edit-bio">Client Bio (for AI Podcast Search)</Label>
              <Textarea
                id="edit-bio"
                placeholder="Describe the client's expertise, industry, target audience, and ideal podcast topics..."
                value={editClientForm.bio}
                onChange={(e) => setEditClientForm({ ...editClientForm, bio: e.target.value })}
                rows={5}
              />
              <p className="text-xs text-muted-foreground">
                This bio is used by AI to generate relevant podcast search queries in the Podcast Finder
              </p>
            </div>
            <div className="space-y-2">
              <Label htmlFor="edit-google-sheet" className="flex items-center gap-2">
                <FileText className="h-4 w-4" />
                Google Sheet URL (for Podcast Export)
              </Label>
              <div className="flex gap-2">
                <Input
                  id="edit-google-sheet"
                  type="url"
                  placeholder="https://docs.google.com/spreadsheets/d/YOUR_SHEET_ID/edit"
                  value={editClientForm.google_sheet_url}
                  onChange={(e) => setEditClientForm({ ...editClientForm, google_sheet_url: e.target.value })}
                  className="flex-1"
                />
                {!editClientForm.google_sheet_url && (
                  <Button
                    type="button"
                    variant="outline"
                    onClick={handleCreateGoogleSheet}
                    disabled={creatingSheet}
                    className="border-green-600 text-green-600 hover:bg-green-50"
                  >
                    {creatingSheet ? (
                      <>
                        <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                        Creating...
                      </>
                    ) : (
                      <>
                        <Sparkles className="h-4 w-4 mr-2" />
                        Auto-Create
                      </>
                    )}
                  </Button>
                )}
              </div>
              <p className="text-xs text-muted-foreground">
                {editClientForm.google_sheet_url
                  ? 'Podcast Finder results will be exported to this Google Sheet.'
                  : 'Click Auto-Create to generate a formatted Google Sheet with headers automatically.'}
              </p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="edit-prospect-dashboard" className="flex items-center gap-2">
                <Mic className="h-4 w-4" />
                Linked Prospect Dashboard
              </Label>
              <Select
                value={editClientForm.prospect_dashboard_slug || 'none'}
                onValueChange={(value) =>
                  setEditClientForm({ ...editClientForm, prospect_dashboard_slug: value === 'none' ? '' : value })
                }
              >
                <SelectTrigger id="edit-prospect-dashboard">
                  <SelectValue placeholder="Select a prospect dashboard" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">No dashboard linked</SelectItem>
                  {prospectDashboards.map((dashboard) => (
                    <SelectItem key={dashboard.id} value={dashboard.slug}>
                      {dashboard.prospect_name} ({dashboard.slug})
                      {!dashboard.is_active && ' [Inactive]'}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">
                {editClientForm.prospect_dashboard_slug
                  ? 'This dashboard will be shown in the client portal\'s Outreach List tab.'
                  : 'Link a prospect dashboard to replace the outreach list in the client portal.'}
              </p>
              {editClientForm.prospect_dashboard_slug && (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => window.open(`/p/${editClientForm.prospect_dashboard_slug}`, '_blank')}
                  className="gap-2"
                >
                  <ExternalLink className="h-4 w-4" />
                  Preview Dashboard
                </Button>
              )}
            </div>

            <div className="space-y-2">
              <Label htmlFor="edit-bison-campaign-id">Bison Campaign ID</Label>
              <Input
                id="edit-bison-campaign-id"
                placeholder="Enter Bison Campaign ID"
                value={editClientForm.bison_campaign_id}
                onChange={(e) => setEditClientForm({ ...editClientForm, bison_campaign_id: e.target.value })}
              />
              <p className="text-xs text-muted-foreground">
                Campaign tracking ID for Bison outreach system
              </p>
            </div>
          </div>
          <div className="flex justify-end gap-2 pt-4 border-t mt-4">
            <Button variant="outline" onClick={() => setIsEditClientModalOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={handleUpdateClient}
              disabled={!editClientForm.name || updateClientMutation.isPending}
            >
              {updateClientMutation.isPending ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Saving...
                </>
              ) : (
                'Save Changes'
              )}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Edit Booking Modal */}
      <Dialog open={!!editingBooking} onOpenChange={() => setEditingBooking(null)}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-hidden flex flex-col">
          <DialogHeader>
            <DialogTitle>Edit Podcast Booking</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 overflow-y-auto pr-2 flex-1">
            <div className="space-y-2">
              <Label htmlFor="edit-podcast-name">Podcast Name *</Label>
              <Input
                id="edit-podcast-name"
                placeholder="Enter podcast name"
                value={editBookingForm.podcast_name}
                onChange={(e) => setEditBookingForm({ ...editBookingForm, podcast_name: e.target.value })}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="edit-host-name">Host Name</Label>
              <Input
                id="edit-host-name"
                placeholder="Enter host name"
                value={editBookingForm.host_name}
                onChange={(e) => setEditBookingForm({ ...editBookingForm, host_name: e.target.value })}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="edit-podcast-url">Podcast URL</Label>
              <Input
                id="edit-podcast-url"
                placeholder="https://example.com/podcast"
                value={editBookingForm.podcast_url}
                onChange={(e) => setEditBookingForm({ ...editBookingForm, podcast_url: e.target.value })}
              />
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="space-y-2">
                <Label htmlFor="edit-scheduled-date">Scheduled Date</Label>
                <Input
                  id="edit-scheduled-date"
                  type="date"
                  value={editBookingForm.scheduled_date}
                  onChange={(e) => setEditBookingForm({ ...editBookingForm, scheduled_date: e.target.value })}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="edit-recording-date">Recording Date</Label>
                <Input
                  id="edit-recording-date"
                  type="date"
                  value={editBookingForm.recording_date}
                  onChange={(e) => setEditBookingForm({ ...editBookingForm, recording_date: e.target.value })}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="edit-publish-date">Publish Date</Label>
                <Input
                  id="edit-publish-date"
                  type="date"
                  value={editBookingForm.publish_date}
                  onChange={(e) => setEditBookingForm({ ...editBookingForm, publish_date: e.target.value })}
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="edit-episode-url">Episode URL</Label>
              <Input
                id="edit-episode-url"
                placeholder="https://example.com/episode"
                value={editBookingForm.episode_url}
                onChange={(e) => setEditBookingForm({ ...editBookingForm, episode_url: e.target.value })}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="edit-status">Status</Label>
              <Select
                value={editBookingForm.status}
                onValueChange={(value: any) => setEditBookingForm({ ...editBookingForm, status: value })}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="conversation_started">Conversation Started</SelectItem>
                  <SelectItem value="in_progress">In Progress</SelectItem>
                  <SelectItem value="booked">Booked</SelectItem>
                  <SelectItem value="recorded">Recorded</SelectItem>
                  <SelectItem value="published">Published</SelectItem>
                  <SelectItem value="cancelled">Cancelled</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="flex items-center space-x-2">
              <input
                type="checkbox"
                id="edit-prep-sent"
                checked={editBookingForm.prep_sent}
                onChange={(e) => setEditBookingForm({ ...editBookingForm, prep_sent: e.target.checked })}
                className="h-4 w-4 rounded border-gray-300"
              />
              <Label htmlFor="edit-prep-sent" className="cursor-pointer">
                Prep materials sent
              </Label>
            </div>

            <div className="space-y-2">
              <Label htmlFor="edit-notes">Notes</Label>
              <Textarea
                id="edit-notes"
                placeholder="Any additional notes..."
                value={editBookingForm.notes}
                onChange={(e) => setEditBookingForm({ ...editBookingForm, notes: e.target.value })}
              />
            </div>
          </div>
          <div className="flex justify-between pt-4 border-t mt-4">
            <Button
              variant="destructive"
              onClick={() => {
                handleDeleteBooking(editingBooking)
                setEditingBooking(null)
              }}
            >
              <Trash2 className="h-4 w-4 mr-2" />
              Delete
            </Button>
            <div className="flex gap-2">
              <Button variant="outline" onClick={() => setEditingBooking(null)}>
                Cancel
              </Button>
              <Button
                onClick={handleSaveBooking}
                disabled={!editBookingForm.podcast_name || updateBookingMutation.isPending}
              >
                {updateBookingMutation.isPending ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Saving...
                  </>
                ) : (
                  'Save Changes'
                )}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <Dialog open={!!deletingBooking} onOpenChange={() => setDeletingBooking(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Delete Podcast</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              Are you sure you want to delete this podcast booking? This action cannot be undone.
            </p>
            {deletingBooking && (
              <div className="p-3 bg-muted rounded-lg">
                <p className="font-medium">{deletingBooking.podcast_name}</p>
                <p className="text-sm text-muted-foreground">{client?.name}</p>
              </div>
            )}
            <div className="flex justify-end gap-2 pt-4">
              <Button variant="outline" onClick={() => setDeletingBooking(null)}>
                Cancel
              </Button>
              <Button
                variant="destructive"
                onClick={confirmDelete}
                disabled={deleteBookingMutation.isPending}
              >
                {deleteBookingMutation.isPending ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Deleting...
                  </>
                ) : (
                  <>
                    <Trash2 className="h-4 w-4 mr-2" />
                    Delete
                  </>
                )}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Podcast Details Modal */}
      <Dialog open={isPodcastDetailsModalOpen} onOpenChange={setIsPodcastDetailsModalOpen}>
        <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Podcast Details</DialogTitle>
            <DialogDescription>
              Information from Podscan API
            </DialogDescription>
          </DialogHeader>
          {viewingPodcast && (
            <div className="space-y-6">
              {/* Podcast Header with Image */}
              <div className="flex gap-4">
                {viewingPodcast.podcast_image_url && (
                  <img
                    src={viewingPodcast.podcast_image_url}
                    alt={viewingPodcast.podcast_name}
                    className="w-32 h-32 rounded-lg object-cover shadow-md"
                  />
                )}
                <div className="flex-1 space-y-2">
                  <h3 className="text-xl font-bold">{viewingPodcast.podcast_name}</h3>
                  {viewingPodcast.host_name && (
                    <div className="flex items-center gap-2 text-muted-foreground">
                      <User className="h-4 w-4" />
                      <span className="text-sm">Host: {viewingPodcast.host_name}</span>
                    </div>
                  )}
                  {viewingPodcast.podcast_url && (
                    <a
                      href={viewingPodcast.podcast_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 text-sm text-primary hover:underline"
                    >
                      <Globe className="h-4 w-4" />
                      Visit Podcast
                      <ExternalLink className="h-3 w-3" />
                    </a>
                  )}
                </div>
              </div>

              {/* Stats Grid */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                {viewingPodcast.audience_size && (
                  <div className="p-4 bg-muted rounded-lg">
                    <p className="text-xs text-muted-foreground mb-1">Audience Size</p>
                    <p className="text-2xl font-bold">{viewingPodcast.audience_size.toLocaleString()}</p>
                  </div>
                )}
                {viewingPodcast.episode_count && (
                  <div className="p-4 bg-muted rounded-lg">
                    <p className="text-xs text-muted-foreground mb-1">Episodes</p>
                    <p className="text-2xl font-bold">{viewingPodcast.episode_count.toLocaleString()}</p>
                  </div>
                )}
                {viewingPodcast.itunes_rating && (
                  <div className="p-4 bg-muted rounded-lg">
                    <p className="text-xs text-muted-foreground mb-1">iTunes Rating</p>
                    <p className="text-2xl font-bold">{viewingPodcast.itunes_rating.toFixed(1)} ⭐</p>
                  </div>
                )}
                {viewingPodcast.itunes_rating_count && (
                  <div className="p-4 bg-muted rounded-lg">
                    <p className="text-xs text-muted-foreground mb-1">Ratings Count</p>
                    <p className="text-2xl font-bold">{viewingPodcast.itunes_rating_count.toLocaleString()}</p>
                  </div>
                )}
              </div>

              {/* Description */}
              {viewingPodcast.podcast_description && (
                <div className="space-y-2">
                  <h4 className="font-semibold">Description</h4>
                  <p className="text-sm text-muted-foreground leading-relaxed">
                    {viewingPodcast.podcast_description}
                  </p>
                </div>
              )}

              {/* Technical Details */}
              <div className="space-y-3 p-4 bg-muted rounded-lg">
                <h4 className="font-semibold">Technical Details</h4>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-sm">
                  {viewingPodcast.podcast_id && (
                    <div>
                      <span className="text-muted-foreground">Podcast ID:</span>
                      <span className="ml-2 font-mono">{viewingPodcast.podcast_id}</span>
                    </div>
                  )}
                  {viewingPodcast.rss_url && (
                    <div className="col-span-full">
                      <span className="text-muted-foreground">RSS Feed:</span>
                      <a
                        href={viewingPodcast.rss_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="ml-2 text-primary hover:underline break-all"
                      >
                        {viewingPodcast.rss_url}
                      </a>
                    </div>
                  )}
                </div>
              </div>

              {/* Booking Status */}
              <div className="space-y-2">
                <h4 className="font-semibold">Booking Status</h4>
                <div className="flex items-center gap-3">
                  {getStatusBadge(viewingPodcast.status)}
                  {viewingPodcast.scheduled_date && (
                    <div className="flex items-center gap-1 text-sm text-muted-foreground">
                      <Calendar className="h-4 w-4" />
                      <span>Scheduled: {formatDate(viewingPodcast.scheduled_date)}</span>
                    </div>
                  )}
                </div>
              </div>

              {/* Notes */}
              {viewingPodcast.notes && (
                <div className="space-y-2">
                  <h4 className="font-semibold">Notes</h4>
                  <p className="text-sm text-muted-foreground whitespace-pre-wrap">
                    {viewingPodcast.notes}
                  </p>
                </div>
              )}

              {/* Close Button */}
              <div className="flex justify-end pt-4 border-t">
                <Button onClick={() => setIsPodcastDetailsModalOpen(false)}>
                  Close
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Delete Client Confirmation Dialog */}
      <AlertDialog open={isDeleteClientDialogOpen} onOpenChange={setIsDeleteClientDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Are you sure?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete <strong>{client.name}</strong> and all associated bookings. This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleteClientMutation.isPending}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDeleteClient}
              disabled={deleteClientMutation.isPending}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {deleteClientMutation.isPending ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Deleting...
                </>
              ) : (
                'Delete Client'
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Delete Order Confirmation Dialog */}
      <AlertDialog open={!!orderToDelete} onOpenChange={() => setOrderToDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Add-on Order</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete this add-on service order? This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          {orderToDelete && (
            <div className="my-4 p-4 rounded-lg bg-muted">
              <div className="space-y-2 text-sm">
                <div>
                  <span className="font-semibold">Service:</span> {orderToDelete.service?.name}
                </div>
                <div>
                  <span className="font-semibold">Podcast:</span> {orderToDelete.booking?.podcast_name}
                </div>
                <div>
                  <span className="font-semibold">Amount:</span> {formatPrice(orderToDelete.amount_paid_cents)}
                </div>
                <div>
                  <span className="font-semibold">Status:</span> {getAddonStatusText(orderToDelete.status)}
                </div>
              </div>
            </div>
          )}
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleteOrderMutation.isPending}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (orderToDelete) {
                  deleteOrderMutation.mutate(orderToDelete.id)
                }
              }}
              disabled={deleteOrderMutation.isPending}
              className="bg-red-600 hover:bg-red-700"
            >
              {deleteOrderMutation.isPending ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Deleting...
                </>
              ) : (
                'Delete Order'
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </DashboardLayout>
  )
}
