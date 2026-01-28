import { useState, useEffect, useRef } from 'react'
import { DashboardLayout } from '@/components/admin/DashboardLayout'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Sheet, SheetContent, SheetTitle } from '@/components/ui/sheet'
import { VisuallyHidden } from '@radix-ui/react-visually-hidden'
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
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
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
  Upload,
  Plus,
  Pencil,
  ThumbsUp,
  ThumbsDown,
  MessageSquare,
  DollarSign,
  FileText,
  Video,
  Download
} from 'lucide-react'
import { format, formatDistanceToNow } from 'date-fns'
import { cn } from '@/lib/utils'
import { generateProspectVideo, pollVideoStatus } from '@/services/heygen'

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
  content_ready: boolean
  show_pricing_section: boolean
  view_count: number
  last_viewed_at: string | null
  personalized_tagline: string | null
  media_kit_url: string | null
  loom_video_url: string | null
  loom_thumbnail_url: string | null
  loom_video_title: string | null
  show_loom_video: boolean
  testimonial_ids: string[] | null
  show_testimonials: boolean
  background_video_url: string | null
  background_video_generated_at: string | null
  background_video_status: 'not_generated' | 'processing' | 'completed' | 'failed'
  first_name: string | null
  heygen_video_id: string | null
  heygen_video_status: string | null
  heygen_video_url: string | null
  heygen_video_thumbnail_url: string | null
  heygen_video_generated_at: string | null
}

interface PodcastFeedback {
  id: string
  prospect_dashboard_id: string
  podcast_id: string
  podcast_name: string | null
  status: 'approved' | 'rejected' | null
  notes: string | null
  created_at: string
  updated_at: string
}

export default function ProspectDashboards() {
  const [dashboards, setDashboards] = useState<ProspectDashboard[]>([])
  const [loading, setLoading] = useState(true)
  const [searchQuery, setSearchQuery] = useState('')
  const [allTestimonials, setAllTestimonials] = useState<any[]>([])
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false)
  const [dashboardToDelete, setDashboardToDelete] = useState<ProspectDashboard | null>(null)
  const [selectedDashboard, setSelectedDashboard] = useState<ProspectDashboard | null>(null)
  const [editImageUrl, setEditImageUrl] = useState('')
  const [savingImage, setSavingImage] = useState(false)
  const [uploadingImage, setUploadingImage] = useState(false)
  const [bioExpanded, setBioExpanded] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  // Create prospect dialog
  const [createDialogOpen, setCreateDialogOpen] = useState(false)
  const [creating, setCreating] = useState(false)
  const [newProspect, setNewProspect] = useState({
    name: '',
    bio: '',
    imageUrl: '',
    spreadsheetUrl: ''
  })

  // Edit spreadsheet URL
  const [editSpreadsheetUrl, setEditSpreadsheetUrl] = useState('')
  const [savingSpreadsheet, setSavingSpreadsheet] = useState(false)

  // Edit tagline
  const [editTagline, setEditTagline] = useState('')
  const [savingTagline, setSavingTagline] = useState(false)
  const [generatingTagline, setGeneratingTagline] = useState(false)

  // Edit media kit URL
  const [editMediaKitUrl, setEditMediaKitUrl] = useState('')
  const [savingMediaKit, setSavingMediaKit] = useState(false)

  // Edit Loom video URL
  const [editLoomVideoUrl, setEditLoomVideoUrl] = useState('')
  const [editLoomThumbnailUrl, setEditLoomThumbnailUrl] = useState('')
  const [editLoomVideoTitle, setEditLoomVideoTitle] = useState('')
  const [savingLoomVideo, setSavingLoomVideo] = useState(false)
  const [selectedTestimonials, setSelectedTestimonials] = useState<string[]>([])
  const [savingTestimonials, setSavingTestimonials] = useState(false)
  const [togglingTestimonials, setTogglingTestimonials] = useState(false)

  // Background video generation
  const [generatingVideo, setGeneratingVideo] = useState(false)
  const [videoProgress, setVideoProgress] = useState(0)

  // HeyGen AI video generation
  const [generatingHeyGenVideo, setGeneratingHeyGenVideo] = useState(false)

  // Edit prospect name
  const [editProspectName, setEditProspectName] = useState('')
  const [savingProspectName, setSavingProspectName] = useState(false)
  const [isEditingName, setIsEditingName] = useState(false)

  // Feedback state
  const [feedback, setFeedback] = useState<PodcastFeedback[]>([])
  const [loadingFeedback, setLoadingFeedback] = useState(false)
  const [expandedFeedbackSection, setExpandedFeedbackSection] = useState<'approved' | 'rejected' | 'notes' | null>(null)
  const [deletingPodcastId, setDeletingPodcastId] = useState<string | null>(null)
  const [deletingAllRejected, setDeletingAllRejected] = useState(false)

  // Cache status state
  const [checkingStatus, setCheckingStatus] = useState(false)
  const [cacheStatusData, setCacheStatusData] = useState<{
    totalInSheet: number
    cached: number
    missing: number
    withAi: number
    withoutAi: number
    withDemographics: number
  } | null>(null)

  // Podcast fetching state
  const [fetchingPodcasts, setFetchingPodcasts] = useState(false)
  const [fetchStatus, setFetchStatus] = useState<{
    fetched: number
    stoppedEarly: boolean
    remaining: number
  } | null>(null)

  const appUrl = window.location.origin
  const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL

  useEffect(() => {
    fetchDashboards()
    fetchTestimonials()
  }, [])

  // Fetch feedback when a dashboard is selected
  useEffect(() => {
    const fetchFeedback = async () => {
      if (!selectedDashboard) {
        setFeedback([])
        setExpandedFeedbackSection(null)
        return
      }
      setExpandedFeedbackSection(null)

      setLoadingFeedback(true)
      try {
        const { data, error } = await supabase
          .from('prospect_podcast_feedback')
          .select('*')
          .eq('prospect_dashboard_id', selectedDashboard.id)
          .order('updated_at', { ascending: false })

        if (error) throw error

        // Enrich feedback with podcast names from Podscan API for entries missing names
        const feedbackData = data || []
        const podscanApiKey = import.meta.env.VITE_PODSCAN_API_KEY

        const enrichedFeedback = await Promise.all(
          feedbackData.map(async (fb) => {
            if (fb.podcast_name) return fb

            // Fetch podcast name from Podscan
            try {
              const response = await fetch(
                `https://podscan.fm/api/v1/podcasts/${fb.podcast_id}`,
                {
                  headers: {
                    'Authorization': `Bearer ${podscanApiKey}`,
                  },
                }
              )
              if (response.ok) {
                const podcastData = await response.json()
                const podcast = podcastData.podcast || podcastData
                return { ...fb, podcast_name: podcast.podcast_name || null }
              }
            } catch (err) {
              console.error('Error fetching podcast name:', err)
            }
            return fb
          })
        )

        setFeedback(enrichedFeedback)
      } catch (error) {
        console.error('Error fetching feedback:', error)
      } finally {
        setLoadingFeedback(false)
      }
    }

    fetchFeedback()
  }, [selectedDashboard])

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

  const fetchTestimonials = async () => {
    try {
      const { data, error } = await supabase
        .from('testimonials')
        .select('*')
        .eq('is_active', true)
        .order('display_order', { ascending: true })

      if (error) throw error
      setAllTestimonials(data || [])
    } catch (error) {
      console.error('Error fetching testimonials:', error)
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

  const copyLink = (slug: string, includeTour: boolean = false) => {
    const url = includeTour
      ? `${appUrl}/prospect/${slug}?tour=1`
      : `${appUrl}/prospect/${slug}`
    navigator.clipboard.writeText(url)
    toast.success(includeTour ? 'Link with welcome tour copied!' : 'Dashboard link copied!')
  }

  // Helper to extract spreadsheet ID from URL
  const extractSpreadsheetId = (url: string | null): string | null => {
    if (!url) return null
    const match = url.match(/\/spreadsheets\/d\/([a-zA-Z0-9-_]+)/)
    return match ? match[1] : null
  }

  const deletePodcastFromDashboard = async (podcastId: string, podcastName: string | null) => {
    if (!selectedDashboard?.id) {
      toast.error('No dashboard selected')
      return
    }

    setDeletingPodcastId(podcastId)
    try {
      // Delete from Google Sheet first
      const spreadsheetId = extractSpreadsheetId(selectedDashboard.spreadsheet_url)
      if (spreadsheetId) {
        try {
          const response = await fetch(`${SUPABASE_URL}/functions/v1/delete-podcast-from-sheet`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${(await supabase.auth.getSession()).data.session?.access_token}`,
            },
            body: JSON.stringify({ spreadsheetId, podcastId }),
          })

          if (!response.ok) {
            const errorData = await response.json()
            console.warn('Failed to delete from Google Sheet:', errorData.error)
            // Continue with database deletion even if sheet deletion fails
          } else {
            console.log('Deleted from Google Sheet successfully')
          }
        } catch (sheetError) {
          console.warn('Error deleting from Google Sheet:', sheetError)
          // Continue with database deletion
        }
      }

      // Delete from the cached podcasts table
      const { error: cacheError } = await supabase
        .from('prospect_dashboard_podcasts')
        .delete()
        .eq('prospect_dashboard_id', selectedDashboard.id)
        .eq('podcast_id', podcastId)

      if (cacheError) {
        console.error('Error deleting from cache:', cacheError)
      }

      // Delete the feedback record
      const { error: feedbackError } = await supabase
        .from('prospect_podcast_feedback')
        .delete()
        .eq('prospect_dashboard_id', selectedDashboard.id)
        .eq('podcast_id', podcastId)

      if (feedbackError) {
        console.error('Error deleting feedback:', feedbackError)
      }

      // Remove from local feedback state
      setFeedback(prev => prev.filter(f => f.podcast_id !== podcastId))

      toast.success(`Deleted "${podcastName || podcastId}" from dashboard`)
    } catch (error) {
      console.error('Error deleting podcast:', error)
      toast.error(error instanceof Error ? error.message : 'Failed to delete podcast')
    } finally {
      setDeletingPodcastId(null)
    }
  }

  const deleteAllRejectedPodcasts = async () => {
    if (!selectedDashboard?.id) {
      toast.error('No dashboard selected')
      return
    }

    const rejectedPodcasts = feedback.filter(f => f.status === 'rejected')
    if (rejectedPodcasts.length === 0) {
      toast.error('No rejected podcasts to delete')
      return
    }

    setDeletingAllRejected(true)
    try {
      const podcastIds = rejectedPodcasts.map(f => f.podcast_id)

      // Delete from Google Sheet first (one by one since the API deletes single rows)
      const spreadsheetId = extractSpreadsheetId(selectedDashboard.spreadsheet_url)
      if (spreadsheetId) {
        const accessToken = (await supabase.auth.getSession()).data.session?.access_token
        let sheetDeleteCount = 0

        for (const podcastId of podcastIds) {
          try {
            const response = await fetch(`${SUPABASE_URL}/functions/v1/delete-podcast-from-sheet`, {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${accessToken}`,
              },
              body: JSON.stringify({ spreadsheetId, podcastId }),
            })

            if (response.ok) {
              sheetDeleteCount++
            }
          } catch (sheetError) {
            console.warn('Error deleting from Google Sheet:', podcastId, sheetError)
          }
        }

        console.log(`Deleted ${sheetDeleteCount}/${podcastIds.length} from Google Sheet`)
      }

      // Delete all rejected from cached podcasts table
      const { error: cacheError } = await supabase
        .from('prospect_dashboard_podcasts')
        .delete()
        .eq('prospect_dashboard_id', selectedDashboard.id)
        .in('podcast_id', podcastIds)

      if (cacheError) {
        console.error('Error deleting from cache:', cacheError)
      }

      // Delete all rejected feedback records
      const { error: feedbackError } = await supabase
        .from('prospect_podcast_feedback')
        .delete()
        .eq('prospect_dashboard_id', selectedDashboard.id)
        .in('podcast_id', podcastIds)

      if (feedbackError) {
        console.error('Error deleting feedback:', feedbackError)
      }

      // Remove from local feedback state
      setFeedback(prev => prev.filter(f => f.status !== 'rejected'))

      toast.success(`Deleted ${rejectedPodcasts.length} rejected podcasts`)
    } catch (error) {
      console.error('Error deleting rejected podcasts:', error)
      toast.error(error instanceof Error ? error.message : 'Failed to delete rejected podcasts')
    } finally {
      setDeletingAllRejected(false)
    }
  }

  // Sync editImageUrl, editSpreadsheetUrl, editTagline, editMediaKitUrl, editLoomVideoUrl, editLoomThumbnailUrl, editLoomVideoTitle, editProspectName and reset state when selectedDashboard changes
  useEffect(() => {
    if (selectedDashboard) {
      setEditImageUrl(selectedDashboard.prospect_image_url || '')
      setEditSpreadsheetUrl(selectedDashboard.spreadsheet_url || '')
      setEditMediaKitUrl(selectedDashboard.media_kit_url || '')
      setEditLoomVideoUrl(selectedDashboard.loom_video_url || '')
      setEditLoomThumbnailUrl(selectedDashboard.loom_thumbnail_url || '')
      setEditLoomVideoTitle(selectedDashboard.loom_video_title || 'Your Personal Video Message')
      setEditProspectName(selectedDashboard.prospect_name || '')
      setSelectedTestimonials(selectedDashboard.testimonial_ids || [])
      // Extract the custom part of tagline (after "perfect for ")
      const tagline = selectedDashboard.personalized_tagline || ''
      const match = tagline.match(/perfect for\s+(.+)$/i)
      setEditTagline(match ? match[1] : '')
      setBioExpanded(false)
      setIsEditingName(false)
      // Reset cache status when switching dashboards
      setCacheStatusData(null)
      setFetchStatus(null)
      setAiStatus(null)
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

  // Generate a random slug
  const generateSlug = () => {
    const chars = 'abcdefghijklmnopqrstuvwxyz0123456789'
    let slug = ''
    for (let i = 0; i < 8; i++) {
      slug += chars.charAt(Math.floor(Math.random() * chars.length))
    }
    return slug
  }

  const createProspect = async () => {
    if (!newProspect.name.trim()) {
      toast.error('Prospect name is required')
      return
    }

    setCreating(true)
    try {
      const slug = generateSlug()
      let spreadsheetId = ''
      let spreadsheetUrl = newProspect.spreadsheetUrl.trim()

      // Extract spreadsheet ID if URL provided
      if (spreadsheetUrl) {
        const extractedId = extractSpreadsheetId(spreadsheetUrl)
        if (extractedId) {
          spreadsheetId = extractedId
          // Normalize the URL
          spreadsheetUrl = `https://docs.google.com/spreadsheets/d/${extractedId}/edit`
        }
      }

      const { data, error } = await supabase
        .from('prospect_dashboards')
        .insert({
          slug,
          prospect_name: newProspect.name.trim(),
          prospect_bio: newProspect.bio.trim() || null,
          prospect_image_url: newProspect.imageUrl.trim() || null,
          spreadsheet_id: spreadsheetId || null,
          spreadsheet_url: spreadsheetUrl || null,
          is_active: true,
          view_count: 0
        })
        .select()
        .single()

      if (error) throw error

      setDashboards(prev => [data, ...prev])
      setCreateDialogOpen(false)
      setNewProspect({ name: '', bio: '', imageUrl: '', spreadsheetUrl: '' })
      toast.success('Prospect created successfully!')

      // Open the side panel for the new prospect
      setSelectedDashboard(data)
    } catch (error) {
      console.error('Error creating prospect:', error)
      toast.error('Failed to create prospect')
    } finally {
      setCreating(false)
    }
  }

  const saveSpreadsheetUrl = async () => {
    if (!selectedDashboard) return

    setSavingSpreadsheet(true)
    try {
      let spreadsheetId = ''
      let spreadsheetUrl = editSpreadsheetUrl.trim()

      // Extract spreadsheet ID if URL provided
      if (spreadsheetUrl) {
        const extractedId = extractSpreadsheetId(spreadsheetUrl)
        if (extractedId) {
          spreadsheetId = extractedId
          // Normalize the URL
          spreadsheetUrl = `https://docs.google.com/spreadsheets/d/${extractedId}/edit`
        }
      }

      const { error } = await supabase
        .from('prospect_dashboards')
        .update({
          spreadsheet_id: spreadsheetId || null,
          spreadsheet_url: spreadsheetUrl || null
        })
        .eq('id', selectedDashboard.id)

      if (error) throw error

      // Update local state
      setDashboards(prev =>
        prev.map(d =>
          d.id === selectedDashboard.id
            ? { ...d, spreadsheet_id: spreadsheetId, spreadsheet_url: spreadsheetUrl }
            : d
        )
      )
      setSelectedDashboard(prev =>
        prev ? { ...prev, spreadsheet_id: spreadsheetId, spreadsheet_url: spreadsheetUrl } : null
      )
      setEditSpreadsheetUrl(spreadsheetUrl)

      toast.success('Google Sheet URL updated!')
    } catch (error) {
      console.error('Error saving spreadsheet URL:', error)
      toast.error('Failed to save spreadsheet URL')
    } finally {
      setSavingSpreadsheet(false)
    }
  }

  const saveTagline = async () => {
    if (!selectedDashboard) return

    setSavingTagline(true)
    try {
      // Construct full tagline with "We've curated X podcasts perfect for " prefix
      const fullTagline = editTagline.trim()
        ? `We've curated podcasts perfect for ${editTagline.trim()}`
        : null

      const { error } = await supabase
        .from('prospect_dashboards')
        .update({ personalized_tagline: fullTagline })
        .eq('id', selectedDashboard.id)

      if (error) throw error

      // Update local state
      setDashboards(prev =>
        prev.map(d =>
          d.id === selectedDashboard.id
            ? { ...d, personalized_tagline: fullTagline }
            : d
        )
      )
      setSelectedDashboard(prev =>
        prev ? { ...prev, personalized_tagline: fullTagline } : null
      )

      toast.success('Tagline updated!')
    } catch (error) {
      console.error('Error saving tagline:', error)
      toast.error('Failed to save tagline')
    } finally {
      setSavingTagline(false)
    }
  }

  const saveMediaKitUrl = async () => {
    if (!selectedDashboard) return

    setSavingMediaKit(true)
    try {
      const { error } = await supabase
        .from('prospect_dashboards')
        .update({ media_kit_url: editMediaKitUrl.trim() || null })
        .eq('id', selectedDashboard.id)

      if (error) throw error

      // Update local state
      setDashboards(prev =>
        prev.map(d =>
          d.id === selectedDashboard.id
            ? { ...d, media_kit_url: editMediaKitUrl.trim() || null }
            : d
        )
      )
      setSelectedDashboard(prev =>
        prev ? { ...prev, media_kit_url: editMediaKitUrl.trim() || null } : null
      )

      toast.success('Media kit URL saved!')
    } catch (error) {
      console.error('Error saving media kit URL:', error)
      toast.error('Failed to save media kit URL')
    } finally {
      setSavingMediaKit(false)
    }
  }

  // Parse Loom HTML snippet to extract video URL and thumbnail URL
  const parseLoomHtml = (html: string) => {
    const parser = new DOMParser()
    const doc = parser.parseFromString(html, 'text/html')

    // Extract video URL from <a> tag's href
    const link = doc.querySelector('a[href*="loom.com"]')
    const videoUrl = link?.getAttribute('href') || ''

    // Extract thumbnail URL from <img> tag's src
    const img = doc.querySelector('img[src*="cdn.loom.com"]')
    const thumbnailUrl = img?.getAttribute('src') || ''

    return { videoUrl, thumbnailUrl }
  }

  const handleLoomHtmlPaste = (html: string) => {
    const trimmed = html.trim()

    // Check if it looks like HTML (contains < and >)
    if (trimmed.includes('<') && trimmed.includes('>')) {
      const { videoUrl, thumbnailUrl } = parseLoomHtml(trimmed)

      if (videoUrl) {
        setEditLoomVideoUrl(videoUrl)
        if (thumbnailUrl) {
          setEditLoomThumbnailUrl(thumbnailUrl)
        }
        toast.success('Loom video and thumbnail extracted!')
      } else {
        toast.error('Could not find Loom video URL in the HTML')
      }
    } else if (trimmed.includes('loom.com')) {
      // If it's just a plain URL, use it as video URL
      setEditLoomVideoUrl(trimmed)
    }
  }

  const saveLoomVideoUrl = async () => {
    if (!selectedDashboard) return

    setSavingLoomVideo(true)
    try {
      const { error } = await supabase
        .from('prospect_dashboards')
        .update({
          loom_video_url: editLoomVideoUrl.trim() || null,
          loom_thumbnail_url: editLoomThumbnailUrl.trim() || null,
          loom_video_title: editLoomVideoTitle.trim() || null
        })
        .eq('id', selectedDashboard.id)

      if (error) throw error

      // Update local state
      setDashboards(prev =>
        prev.map(d =>
          d.id === selectedDashboard.id
            ? {
                ...d,
                loom_video_url: editLoomVideoUrl.trim() || null,
                loom_thumbnail_url: editLoomThumbnailUrl.trim() || null,
                loom_video_title: editLoomVideoTitle.trim() || null
              }
            : d
        )
      )
      setSelectedDashboard(prev =>
        prev ? {
          ...prev,
          loom_video_url: editLoomVideoUrl.trim() || null,
          loom_thumbnail_url: editLoomThumbnailUrl.trim() || null,
          loom_video_title: editLoomVideoTitle.trim() || null
        } : null
      )

      toast.success('Loom video saved!')
    } catch (error) {
      console.error('Error saving Loom video:', error)
      toast.error('Failed to save Loom video')
    } finally {
      setSavingLoomVideo(false)
    }
  }

  const saveProspectName = async () => {
    if (!selectedDashboard || !editProspectName.trim()) return

    setSavingProspectName(true)
    try {
      const { error } = await supabase
        .from('prospect_dashboards')
        .update({ prospect_name: editProspectName.trim() })
        .eq('id', selectedDashboard.id)

      if (error) throw error

      // Update local state
      setDashboards(prev =>
        prev.map(d =>
          d.id === selectedDashboard.id
            ? { ...d, prospect_name: editProspectName.trim() }
            : d
        )
      )
      setSelectedDashboard(prev =>
        prev ? { ...prev, prospect_name: editProspectName.trim() } : null
      )

      setIsEditingName(false)
      toast.success('Prospect name updated!')
    } catch (error) {
      console.error('Error saving prospect name:', error)
      toast.error('Failed to save prospect name')
    } finally {
      setSavingProspectName(false)
    }
  }

  const generateTagline = async () => {
    if (!selectedDashboard) return

    if (!selectedDashboard.prospect_bio) {
      toast.error('Please add a prospect bio first to generate a tagline')
      return
    }

    setGeneratingTagline(true)
    try {
      const response = await fetch(`${SUPABASE_URL}/functions/v1/generate-tagline`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'apikey': import.meta.env.VITE_SUPABASE_ANON_KEY,
        },
        body: JSON.stringify({
          prospectName: selectedDashboard.prospect_name,
          prospectBio: selectedDashboard.prospect_bio,
          podcastCount: cacheStatusData?.totalInSheet || 0,
          dashboardId: selectedDashboard.id,
        }),
      })

      if (!response.ok) {
        const error = await response.json()
        throw new Error(error.error || 'Failed to generate tagline')
      }

      const data = await response.json()
      if (data.tagline) {
        // Extract just the custom part after "perfect for "
        const match = data.tagline.match(/perfect for\s+(.+)$/i)
        const customPart = match ? match[1] : data.tagline
        setEditTagline(customPart)

        // Update local state with full tagline
        setDashboards(prev =>
          prev.map(d =>
            d.id === selectedDashboard.id
              ? { ...d, personalized_tagline: data.tagline }
              : d
          )
        )
        setSelectedDashboard(prev =>
          prev ? { ...prev, personalized_tagline: data.tagline } : null
        )

        toast.success('Tagline generated!')
      }
    } catch (error) {
      console.error('Error generating tagline:', error)
      toast.error(error instanceof Error ? error.message : 'Failed to generate tagline')
    } finally {
      setGeneratingTagline(false)
    }
  }

  // Check cache status - just reports stats, doesn't fetch anything
  const checkCacheStatus = async () => {
    if (!selectedDashboard?.spreadsheet_id) {
      toast.error('Please link a Google Sheet first')
      return
    }

    setCheckingStatus(true)

    try {
      const response = await fetch(`${SUPABASE_URL}/functions/v1/get-prospect-podcasts`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'apikey': import.meta.env.VITE_SUPABASE_ANON_KEY,
        },
        body: JSON.stringify({
          spreadsheetId: selectedDashboard.spreadsheet_id,
          prospectDashboardId: selectedDashboard.id,
          checkStatusOnly: true,
        }),
      })

      if (!response.ok) {
        const error = await response.json()
        throw new Error(error.error || 'Failed to check cache status')
      }

      const data = await response.json()
      setCacheStatusData(data.status)

      // Clear fetch status when checking fresh
      setFetchStatus(null)
      setAiStatus(null)

      if (data.status.missing === 0 && data.status.withoutAi === 0) {
        toast.success(`All ${data.status.totalInSheet} podcasts ready!`)
      } else {
        toast.info(`Found ${data.status.totalInSheet} podcasts: ${data.status.cached} cached, ${data.status.missing} missing, ${data.status.withoutAi} need AI`)
      }
    } catch (error) {
      console.error('Error checking cache status:', error)
      toast.error(error instanceof Error ? error.message : 'Failed to check cache status')
    } finally {
      setCheckingStatus(false)
    }
  }

  // Fetch missing podcasts from Podscan
  const fetchMissingPodcasts = async () => {
    if (!selectedDashboard?.spreadsheet_id) {
      toast.error('Please link a Google Sheet first')
      return
    }

    setFetchingPodcasts(true)

    try {
      toast.info('Fetching missing podcasts from Podscan...')

      const response = await fetch(`${SUPABASE_URL}/functions/v1/get-prospect-podcasts`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'apikey': import.meta.env.VITE_SUPABASE_ANON_KEY,
        },
        body: JSON.stringify({
          spreadsheetId: selectedDashboard.spreadsheet_id,
          prospectDashboardId: selectedDashboard.id,
          prospectName: selectedDashboard.prospect_name,
          prospectBio: selectedDashboard.prospect_bio,
          skipAiAnalysis: true, // Skip AI, just fetch podcast data
        }),
      })

      if (!response.ok) {
        const error = await response.json()
        throw new Error(error.error || 'Failed to fetch podcasts')
      }

      const data = await response.json()
      setFetchStatus({
        fetched: data.fetched || 0,
        stoppedEarly: data.stoppedEarly || false,
        remaining: data.remaining || 0,
      })

      // Show cache performance
      if (data.cachePerformance) {
        const { cacheHitRate, apiCallsSaved, costSavings } = data.cachePerformance
        if (data.stoppedEarly) {
          toast.warning(`Fetched ${data.fetched} podcasts. ${data.remaining} remaining | Cache: ${cacheHitRate}% | Saved: $${costSavings}`)
        } else if (data.fetched > 0) {
          toast.success(`✅ Fetched ${data.fetched} podcasts | 💾 Cache: ${cacheHitRate}% | 💰 Saved ${apiCallsSaved} API calls ($${costSavings})`)
        } else {
          toast.success(`🎉 All podcasts from cache! | 💰 Saved ${apiCallsSaved} API calls ($${costSavings})`)
        }
      } else {
        // Fallback for responses without cache performance
        if (data.stoppedEarly) {
          toast.warning(`Fetched ${data.fetched} podcasts. ${data.remaining} remaining - click again to continue.`)
        } else if (data.fetched > 0) {
          toast.success(`Fetched ${data.fetched} podcasts from Podscan!`)
        } else {
          toast.success('All podcasts already cached!')
        }
      }

      // Refresh status from DB after fetching completes
      setFetchingPodcasts(false)
      await checkCacheStatus()
      return
    } catch (error) {
      console.error('Error fetching podcasts:', error)
      toast.error(error instanceof Error ? error.message : 'Failed to fetch podcasts')
    } finally {
      setFetchingPodcasts(false)
    }
  }

  // Publish toggle state
  const [togglingPublish, setTogglingPublish] = useState(false)

  const toggleContentReady = async () => {
    if (!selectedDashboard) return

    setTogglingPublish(true)
    try {
      const newValue = !selectedDashboard.content_ready
      const { error } = await supabase
        .from('prospect_dashboards')
        .update({ content_ready: newValue })
        .eq('id', selectedDashboard.id)

      if (error) throw error

      // Update local state
      setDashboards(prev =>
        prev.map(d =>
          d.id === selectedDashboard.id ? { ...d, content_ready: newValue } : d
        )
      )
      setSelectedDashboard(prev =>
        prev ? { ...prev, content_ready: newValue } : null
      )

      toast.success(newValue ? 'Dashboard published! Prospect can now see content.' : 'Dashboard unpublished. Prospect will see Coming Soon.')
    } catch (error) {
      console.error('Error toggling content ready:', error)
      toast.error('Failed to update publish status')
    } finally {
      setTogglingPublish(false)
    }
  }

  // Pricing section toggle state
  const [togglingPricing, setTogglingPricing] = useState(false)

  // Loom video toggle state
  const [togglingLoomVideo, setTogglingLoomVideo] = useState(false)

  const togglePricingSection = async () => {
    if (!selectedDashboard) return

    setTogglingPricing(true)
    try {
      const newValue = !selectedDashboard.show_pricing_section
      const { error } = await supabase
        .from('prospect_dashboards')
        .update({ show_pricing_section: newValue })
        .eq('id', selectedDashboard.id)

      if (error) throw error

      // Update local state
      setDashboards(prev =>
        prev.map(d =>
          d.id === selectedDashboard.id ? { ...d, show_pricing_section: newValue } : d
        )
      )
      setSelectedDashboard(prev =>
        prev ? { ...prev, show_pricing_section: newValue } : null
      )

      toast.success(newValue ? 'Pricing section enabled' : 'Pricing section hidden')
    } catch (error) {
      console.error('Error toggling pricing section:', error)
      toast.error('Failed to update pricing section visibility')
    } finally {
      setTogglingPricing(false)
    }
  }

  const toggleLoomVideo = async () => {
    if (!selectedDashboard) return

    setTogglingLoomVideo(true)
    try {
      const newValue = !selectedDashboard.show_loom_video
      const { error } = await supabase
        .from('prospect_dashboards')
        .update({ show_loom_video: newValue })
        .eq('id', selectedDashboard.id)

      if (error) throw error

      // Update local state
      setDashboards(prev =>
        prev.map(d =>
          d.id === selectedDashboard.id ? { ...d, show_loom_video: newValue } : d
        )
      )
      setSelectedDashboard(prev =>
        prev ? { ...prev, show_loom_video: newValue } : null
      )

      toast.success(newValue ? 'Loom video enabled' : 'Loom video hidden')
    } catch (error) {
      console.error('Error toggling Loom video:', error)
      toast.error('Failed to update Loom video visibility')
    } finally {
      setTogglingLoomVideo(false)
    }
  }

  const saveTestimonials = async () => {
    if (!selectedDashboard) return

    setSavingTestimonials(true)
    try {
      const { error } = await supabase
        .from('prospect_dashboards')
        .update({ testimonial_ids: selectedTestimonials })
        .eq('id', selectedDashboard.id)

      if (error) throw error

      // Update local state
      setDashboards(prev =>
        prev.map(d =>
          d.id === selectedDashboard.id
            ? { ...d, testimonial_ids: selectedTestimonials }
            : d
        )
      )
      setSelectedDashboard(prev =>
        prev ? { ...prev, testimonial_ids: selectedTestimonials } : null
      )

      toast.success('Testimonials saved!')
    } catch (error) {
      console.error('Error saving testimonials:', error)
      toast.error('Failed to save testimonials')
    } finally {
      setSavingTestimonials(false)
    }
  }

  const toggleTestimonials = async () => {
    if (!selectedDashboard) return

    setTogglingTestimonials(true)
    try {
      const newValue = !selectedDashboard.show_testimonials
      const { error } = await supabase
        .from('prospect_dashboards')
        .update({ show_testimonials: newValue })
        .eq('id', selectedDashboard.id)

      if (error) throw error

      // Update local state
      setDashboards(prev =>
        prev.map(d =>
          d.id === selectedDashboard.id ? { ...d, show_testimonials: newValue } : d
        )
      )
      setSelectedDashboard(prev =>
        prev ? { ...prev, show_testimonials: newValue } : null
      )

      toast.success(newValue ? 'Testimonials section enabled' : 'Testimonials section hidden')
    } catch (error) {
      console.error('Error toggling testimonials:', error)
      toast.error('Failed to update testimonials visibility')
    } finally {
      setTogglingTestimonials(false)
    }
  }

  const handleGenerateBackgroundVideo = async () => {
    if (!selectedDashboard) return

    setGeneratingVideo(true)
    setVideoProgress(0)

    try {
      // Update status to processing
      await supabase
        .from('prospect_dashboards')
        .update({ background_video_status: 'processing' })
        .eq('id', selectedDashboard.id)

      // Update local state
      setSelectedDashboard(prev =>
        prev ? { ...prev, background_video_status: 'processing' } : null
      )

      toast.info('Starting dashboard recording...', {
        description: 'This will take about 45-60 seconds'
      })

      // Call video generation service
      const videoServiceUrl = import.meta.env.VITE_VIDEO_SERVICE_URL || 'http://localhost:3001'
      const response = await fetch(`${videoServiceUrl}/api/generate-video`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          dashboardId: selectedDashboard.id,
          slug: selectedDashboard.slug
        })
      })

      if (!response.ok) {
        const error = await response.json()
        throw new Error(error.error || 'Failed to generate video')
      }

      const result = await response.json()

      // Update local state with video URL
      setDashboards(prev =>
        prev.map(d =>
          d.id === selectedDashboard.id
            ? {
                ...d,
                background_video_url: result.videoUrl,
                background_video_generated_at: new Date().toISOString(),
                background_video_status: 'completed'
              }
            : d
        )
      )
      setSelectedDashboard(prev =>
        prev
          ? {
              ...prev,
              background_video_url: result.videoUrl,
              background_video_generated_at: new Date().toISOString(),
              background_video_status: 'completed'
            }
          : null
      )

      toast.success('Dashboard video generated!', {
        description: 'Ready to use with HeyGen'
      })
    } catch (error) {
      console.error('Error generating video:', error)

      // Update status to failed
      await supabase
        .from('prospect_dashboards')
        .update({ background_video_status: 'failed' })
        .eq('id', selectedDashboard.id)

      setSelectedDashboard(prev =>
        prev ? { ...prev, background_video_status: 'failed' } : null
      )

      toast.error('Failed to generate video', {
        description: error instanceof Error ? error.message : 'Please try again'
      })
    } finally {
      setGeneratingVideo(false)
      setVideoProgress(0)
    }
  }

  // HeyGen AI Video Generation
  const handleGenerateHeyGenVideo = async () => {
    if (!selectedDashboard) return

    if (!selectedDashboard.background_video_url) {
      toast.error('Generate dashboard recording first')
      return
    }

    if (!selectedDashboard.first_name) {
      toast.error('Please enter prospect first name')
      return
    }

    try {
      setGeneratingHeyGenVideo(true)

      toast.info('Starting HeyGen AI video generation...', {
        description: 'This may take 2-3 minutes'
      })

      // Generate the video
      const videoId = await generateProspectVideo(
        selectedDashboard.id,
        selectedDashboard.background_video_url,
        selectedDashboard.first_name
      )

      // Update local state to show pending status
      setSelectedDashboard(prev =>
        prev ? { ...prev, heygen_video_status: 'pending', heygen_video_id: videoId } : null
      )

      toast.success('HeyGen video queued!', {
        description: 'Rendering in progress...'
      })

      // Poll for completion in the background
      pollVideoStatus(videoId, selectedDashboard.id)
        .then((videoUrl) => {
          setSelectedDashboard(prev =>
            prev
              ? {
                  ...prev,
                  heygen_video_url: videoUrl,
                  heygen_video_status: 'completed',
                }
              : null
          )
          toast.success('HeyGen video ready!', {
            description: 'Your AI avatar video is complete'
          })
        })
        .catch((error) => {
          console.error('Polling error:', error)
          toast.error('Video generation failed', {
            description: error instanceof Error ? error.message : 'Please try again'
          })
        })
        .finally(() => {
          setGeneratingHeyGenVideo(false)
        })
    } catch (error) {
      console.error('Error generating HeyGen video:', error)
      setGeneratingHeyGenVideo(false)

      toast.error('Failed to start video generation', {
        description: error instanceof Error ? error.message : 'Please try again'
      })
    }
  }

  // Refresh HeyGen Video Status (failsafe)
  const handleRefreshVideoStatus = async () => {
    if (!selectedDashboard?.heygen_video_id) {
      toast.error('No video ID found')
      return
    }

    try {
      toast.info('Checking video status...')

      const response = await fetch(
        `${import.meta.env.VITE_VIDEO_SERVICE_URL || 'http://localhost:3001'}/api/heygen/status/${selectedDashboard.heygen_video_id}/${selectedDashboard.id}`,
        { cache: 'no-store' }
      )

      if (!response.ok) {
        throw new Error('Failed to check video status')
      }

      const status = await response.json()

      // Update local state
      setSelectedDashboard(prev =>
        prev
          ? {
              ...prev,
              heygen_video_status: status.status,
              ...(status.video_url && { heygen_video_url: status.video_url }),
              ...(status.thumbnail_url && { heygen_video_thumbnail_url: status.thumbnail_url }),
            }
          : null
      )

      if (status.status === 'completed') {
        toast.success('Video is ready!')
      } else if (status.status === 'failed') {
        toast.error('Video generation failed')
      } else {
        toast.info(`Video status: ${status.status}`)
      }
    } catch (error) {
      console.error('Error refreshing video status:', error)
      toast.error('Failed to refresh status')
    }
  }

  // Download HeyGen video as MP4
  const handleDownloadVideo = async () => {
    if (!selectedDashboard?.heygen_video_url) {
      toast.error('No video URL available')
      return
    }

    try {
      toast.info('Downloading video...')

      // Fetch the video from HeyGen URL
      const response = await fetch(selectedDashboard.heygen_video_url)

      if (!response.ok) {
        throw new Error('Failed to download video')
      }

      // Get the video blob
      const blob = await response.blob()

      // Create a download link
      const url = window.URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `${selectedDashboard.prospect_name || 'prospect'}-heygen-video.mp4`
      document.body.appendChild(a)
      a.click()

      // Cleanup
      window.URL.revokeObjectURL(url)
      document.body.removeChild(a)

      toast.success('Video downloaded!')
    } catch (error) {
      console.error('Error downloading video:', error)
      toast.error('Failed to download video')
    }
  }

  // AI Analysis state
  const [runningAiAnalysis, setRunningAiAnalysis] = useState(false)
  const [aiStatus, setAiStatus] = useState<{
    analyzed: number
    remaining: number
    total: number
    complete: boolean
    stoppedEarly: boolean
  } | null>(null)

  // Run AI analysis on cached podcasts - automatically continues until complete
  const runAiAnalysis = async () => {
    if (!selectedDashboard?.spreadsheet_id) {
      toast.error('Please link a Google Sheet first')
      return
    }

    setRunningAiAnalysis(true)
    let totalAnalyzed = 0
    let isComplete = false
    let batchNumber = 0

    toast.info('Starting AI analysis...')

    while (!isComplete) {
      batchNumber++

      // Create abort controller with 50 second timeout per batch
      const controller = new AbortController()
      const timeoutId = setTimeout(() => controller.abort(), 50000)

      try {
        const response = await fetch(`${SUPABASE_URL}/functions/v1/get-prospect-podcasts`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'apikey': import.meta.env.VITE_SUPABASE_ANON_KEY,
          },
          body: JSON.stringify({
            spreadsheetId: selectedDashboard.spreadsheet_id,
            prospectDashboardId: selectedDashboard.id,
            prospectName: selectedDashboard.prospect_name,
            prospectBio: selectedDashboard.prospect_bio,
            aiAnalysisOnly: true,
          }),
          signal: controller.signal,
        })

        clearTimeout(timeoutId)

        if (!response.ok) {
          const error = await response.json()
          throw new Error(error.error || 'Failed to run AI analysis')
        }

        const data = await response.json()
        totalAnalyzed += data.analyzed || 0

        setAiStatus({
          analyzed: totalAnalyzed,
          remaining: data.remaining || 0,
          total: data.total || 0,
          complete: data.aiComplete || false,
          stoppedEarly: data.stoppedEarly || false,
        })

        // Update cache status after each batch
        if (cacheStatusData) {
          setCacheStatusData({
            ...cacheStatusData,
            withAi: cacheStatusData.withAi + (data.analyzed || 0),
            withoutAi: data.remaining || 0,
          })
        }

        if (data.aiComplete) {
          isComplete = true
          toast.success(`AI analysis complete! All ${data.total} podcasts analyzed.`)
        } else if (data.stoppedEarly && data.remaining > 0) {
          // Continue automatically - show progress
          toast.info(`Batch ${batchNumber}: Analyzed ${data.analyzed} podcasts. ${data.remaining} remaining, continuing...`)
          // Small delay between batches to prevent rate limiting
          await new Promise(resolve => setTimeout(resolve, 1000))
        } else {
          isComplete = true
          toast.success(`Analyzed ${totalAnalyzed} podcasts.`)
        }
      } catch (error) {
        clearTimeout(timeoutId)
        console.error('Error running AI analysis:', error)
        if (error instanceof Error && error.name === 'AbortError') {
          toast.warning(`Batch ${batchNumber} timed out. Retrying...`)
          // Continue trying on timeout
          await new Promise(resolve => setTimeout(resolve, 2000))
        } else {
          toast.error(error instanceof Error ? error.message : 'Failed to run AI analysis')
          break // Stop on other errors
        }
      }
    }

    setRunningAiAnalysis(false)
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
        <div className="flex gap-2">
          <Button onClick={() => setCreateDialogOpen(true)} size="sm">
            <Plus className="h-4 w-4 mr-2" />
            New Prospect
          </Button>
          <Button onClick={fetchDashboards} variant="outline" size="sm">
            <RefreshCw className={cn("h-4 w-4 mr-2", loading && "animate-spin")} />
            Refresh
          </Button>
        </div>
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
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="default" size="sm" className="flex-1">
                        <Copy className="h-4 w-4 mr-2" />
                        Copy Link
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="start">
                      <DropdownMenuItem onClick={() => copyLink(dashboard.slug)}>
                        <Copy className="h-4 w-4 mr-2" />
                        Copy Link
                      </DropdownMenuItem>
                      <DropdownMenuItem onClick={() => copyLink(dashboard.slug, true)}>
                        <Sparkles className="h-4 w-4 mr-2" />
                        Copy with Welcome Tour
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
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
        <SheetContent className="!w-full sm:!max-w-xl p-0 overflow-y-auto overflow-x-hidden" aria-describedby={undefined}>
          <VisuallyHidden>
            <SheetTitle>Prospect Dashboard Details</SheetTitle>
          </VisuallyHidden>
          {selectedDashboard && (
            <div className="flex flex-col h-full">
              {/* Close button - fixed position */}
              <div className="absolute top-4 right-4 z-10">
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8 bg-background/80 backdrop-blur-sm"
                  onClick={() => setSelectedDashboard(null)}
                >
                  <X className="h-4 w-4" />
                </Button>
              </div>

              <ScrollArea className="flex-1 overflow-x-hidden">
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
                  </div>
                  {isEditingName ? (
                    <div className="flex items-center gap-2">
                      <Input
                        value={editProspectName}
                        onChange={(e) => setEditProspectName(e.target.value)}
                        className="text-2xl font-bold h-auto py-2"
                        placeholder="Enter prospect name"
                        autoFocus
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') saveProspectName()
                          if (e.key === 'Escape') {
                            setIsEditingName(false)
                            setEditProspectName(selectedDashboard.prospect_name)
                          }
                        }}
                      />
                      <Button
                        size="sm"
                        onClick={saveProspectName}
                        disabled={savingProspectName || !editProspectName.trim()}
                      >
                        {savingProspectName ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                          <Save className="h-4 w-4" />
                        )}
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => {
                          setIsEditingName(false)
                          setEditProspectName(selectedDashboard.prospect_name)
                        }}
                        disabled={savingProspectName}
                      >
                        <X className="h-4 w-4" />
                      </Button>
                    </div>
                  ) : (
                    <div className="flex items-center gap-2">
                      <h2 className="text-2xl font-bold">{selectedDashboard.prospect_name}</h2>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => setIsEditingName(true)}
                      >
                        <Pencil className="h-4 w-4" />
                      </Button>
                    </div>
                  )}
                  {selectedDashboard.prospect_bio && (
                    <div className="mt-2">
                      <p className={cn(
                        "text-muted-foreground text-sm whitespace-pre-wrap",
                        !bioExpanded && "line-clamp-3"
                      )}>
                        {selectedDashboard.prospect_bio}
                      </p>
                      {selectedDashboard.prospect_bio.length > 150 && (
                        <button
                          onClick={() => setBioExpanded(!bioExpanded)}
                          className="text-primary text-sm font-medium mt-1 hover:underline"
                        >
                          {bioExpanded ? 'Show less' : 'Show more'}
                        </button>
                      )}
                    </div>
                  )}
                </div>
                <div className="p-6 pr-8 space-y-6">
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

                  {/* Google Sheet URL */}
                  <div className="space-y-3">
                    <h3 className="font-semibold flex items-center gap-2">
                      <FileSpreadsheet className="h-4 w-4" />
                      Google Sheet
                    </h3>
                    <div className="flex gap-2">
                      <Input
                        placeholder="Paste Google Sheet URL..."
                        value={editSpreadsheetUrl}
                        onChange={(e) => setEditSpreadsheetUrl(e.target.value)}
                        className="text-sm"
                      />
                      <Button
                        variant="outline"
                        size="icon"
                        onClick={saveSpreadsheetUrl}
                        disabled={savingSpreadsheet || editSpreadsheetUrl === (selectedDashboard.spreadsheet_url || '')}
                      >
                        {savingSpreadsheet ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                          <Save className="h-4 w-4" />
                        )}
                      </Button>
                    </div>
                    {editSpreadsheetUrl && (
                      <Button
                        variant="link"
                        className="h-auto p-0 text-xs"
                        onClick={() => window.open(editSpreadsheetUrl, '_blank')}
                      >
                        <ExternalLink className="h-3 w-3 mr-1" />
                        Open in Google Sheets
                      </Button>
                    )}
                    <p className="text-xs text-muted-foreground">
                      Link the Google Sheet containing podcast opportunities for this prospect
                    </p>
                    <details className="text-xs">
                      <summary className="text-muted-foreground cursor-pointer hover:text-foreground">
                        Expected sheet format
                      </summary>
                      <div className="mt-2 p-2 bg-muted rounded text-muted-foreground space-y-1">
                        <p className="font-medium">Columns (in order):</p>
                        <ol className="list-decimal list-inside space-y-0.5 pl-2">
                          <li>Podcast Name</li>
                          <li>Description</li>
                          <li>iTunes Rating</li>
                          <li>Episode Count</li>
                          <li>Podscan Podcast ID</li>
                        </ol>
                      </div>
                    </details>
                  </div>

                  <Separator />

                  {/* Personalized Tagline */}
                  <div className="space-y-3">
                    <h3 className="font-semibold flex items-center gap-2">
                      <Pencil className="h-4 w-4" />
                      Dashboard Tagline
                    </h3>
                    <p className="text-xs text-muted-foreground">
                      Customize what appears after "We've curated X podcasts perfect for..."
                    </p>
                    <div className="p-3 bg-slate-50 dark:bg-slate-800/50 rounded-lg">
                      <p className="text-sm text-muted-foreground mb-2">Preview:</p>
                      <p className="text-sm font-medium">
                        We've curated {cacheStatusData?.totalInSheet || '...'} podcasts perfect for{' '}
                        <span className="text-primary">{editTagline || 'your expertise'}</span>
                      </p>
                    </div>
                    <Textarea
                      placeholder="e.g., sharing your mission to transform healthcare through technology"
                      value={editTagline}
                      onChange={(e) => setEditTagline(e.target.value)}
                      className="text-sm min-h-[80px]"
                    />
                    <div className="flex gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        className="flex-1"
                        onClick={generateTagline}
                        disabled={generatingTagline || !selectedDashboard.prospect_bio}
                      >
                        {generatingTagline ? (
                          <>
                            <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                            Generating...
                          </>
                        ) : (
                          <>
                            <Sparkles className="h-4 w-4 mr-2" />
                            Generate with AI
                          </>
                        )}
                      </Button>
                      <Button
                        size="sm"
                        onClick={saveTagline}
                        disabled={savingTagline}
                      >
                        {savingTagline ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                          <Save className="h-4 w-4" />
                        )}
                      </Button>
                    </div>
                    {!selectedDashboard.prospect_bio && (
                      <p className="text-xs text-amber-600">
                        Add a prospect bio to enable AI generation
                      </p>
                    )}
                  </div>

                  <Separator />

                  {/* Media Kit / One Pager URL */}
                  <div className="space-y-3">
                    <h3 className="font-semibold flex items-center gap-2">
                      <FileText className="h-4 w-4" />
                      Media Kit / One Pager
                    </h3>
                    <div className="flex gap-2">
                      <Input
                        placeholder="Paste media kit URL..."
                        value={editMediaKitUrl}
                        onChange={(e) => setEditMediaKitUrl(e.target.value)}
                        className="text-sm"
                      />
                      <Button
                        variant="outline"
                        size="icon"
                        onClick={saveMediaKitUrl}
                        disabled={savingMediaKit || editMediaKitUrl === (selectedDashboard.media_kit_url || '')}
                      >
                        {savingMediaKit ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                          <Save className="h-4 w-4" />
                        )}
                      </Button>
                    </div>
                    {editMediaKitUrl && (
                      <Button
                        variant="link"
                        className="h-auto p-0 text-xs"
                        onClick={() => window.open(editMediaKitUrl, '_blank')}
                      >
                        <ExternalLink className="h-3 w-3 mr-1" />
                        Preview Media Kit
                      </Button>
                    )}
                    <p className="text-xs text-muted-foreground">
                      Link to the prospect's media kit or one-pager document (Google Doc, PDF, etc.)
                    </p>
                  </div>

                  <Separator />

                  {/* Loom Video URL */}
                  <div className="space-y-3">
                    <h3 className="font-semibold flex items-center gap-2">
                      <Video className="h-4 w-4" />
                      Loom Video
                    </h3>

                    {/* Quick Paste Area */}
                    <div className="space-y-2">
                      <Label className="text-xs text-muted-foreground">
                        Paste Loom HTML snippet here (or just the video URL):
                      </Label>
                      <Textarea
                        placeholder="Paste the HTML code from Loom here..."
                        className="text-sm font-mono min-h-[80px]"
                        onChange={(e) => handleLoomHtmlPaste(e.target.value)}
                      />
                      <p className="text-xs text-muted-foreground">
                        The video URL and thumbnail will be extracted automatically
                      </p>
                    </div>

                    <Separator />

                    {/* Extracted Values */}
                    <div className="space-y-2">
                      <Label className="text-xs font-semibold">Extracted Values:</Label>
                      <div className="flex gap-2">
                        <Input
                          placeholder="Video URL (auto-filled)"
                          value={editLoomVideoUrl}
                          onChange={(e) => setEditLoomVideoUrl(e.target.value)}
                          className="text-sm"
                          readOnly
                        />
                      </div>
                      <div className="flex gap-2">
                        <Input
                          placeholder="Thumbnail URL (auto-filled)"
                          value={editLoomThumbnailUrl}
                          onChange={(e) => setEditLoomThumbnailUrl(e.target.value)}
                          className="text-sm"
                          readOnly
                        />
                      </div>
                      <div className="flex gap-2">
                        <Input
                          placeholder="Video title (e.g., Your Personal Video Message)..."
                          value={editLoomVideoTitle}
                          onChange={(e) => setEditLoomVideoTitle(e.target.value)}
                          className="text-sm"
                        />
                        <Button
                          variant="outline"
                          size="icon"
                          onClick={saveLoomVideoUrl}
                          disabled={savingLoomVideo || (editLoomVideoUrl === (selectedDashboard.loom_video_url || '') && editLoomThumbnailUrl === (selectedDashboard.loom_thumbnail_url || '') && editLoomVideoTitle === (selectedDashboard.loom_video_title || ''))}
                        >
                          {savingLoomVideo ? (
                            <Loader2 className="h-4 w-4 animate-spin" />
                          ) : (
                            <Save className="h-4 w-4" />
                          )}
                        </Button>
                      </div>
                    </div>
                    {editLoomVideoUrl && (
                      <Button
                        variant="link"
                        className="h-auto p-0 text-xs"
                        onClick={() => window.open(editLoomVideoUrl, '_blank')}
                      >
                        <ExternalLink className="h-3 w-3 mr-1" />
                        Preview Video
                      </Button>
                    )}

                    {/* Toggle Show/Hide Video */}
                    <div className="pt-2 border-t">
                      <div className="flex items-center justify-between">
                        <div>
                          <p className="text-sm font-medium">Show Video</p>
                          <p className="text-xs text-muted-foreground">
                            {selectedDashboard.show_loom_video
                              ? 'Video visible to prospect'
                              : 'Video hidden from prospect'}
                          </p>
                        </div>
                        <Button
                          onClick={toggleLoomVideo}
                          disabled={togglingLoomVideo || !editLoomVideoUrl}
                          variant={selectedDashboard.show_loom_video ? "default" : "outline"}
                          size="sm"
                          className={cn(
                            selectedDashboard.show_loom_video && "bg-purple-600 hover:bg-purple-700"
                          )}
                        >
                          {togglingLoomVideo ? (
                            <Loader2 className="h-4 w-4 animate-spin" />
                          ) : selectedDashboard.show_loom_video ? (
                            <>
                              <Eye className="h-4 w-4 mr-1" />
                              Showing
                            </>
                          ) : (
                            <>
                              <EyeOff className="h-4 w-4 mr-1" />
                              Hidden
                            </>
                          )}
                        </Button>
                      </div>
                    </div>
                  </div>

                  <Separator />

                  {/* Background Video for HeyGen */}
                  <div className="space-y-3">
                    <h3 className="font-semibold flex items-center gap-2">
                      <Video className="h-4 w-4" />
                      Background Video (HeyGen)
                    </h3>
                    <p className="text-sm text-muted-foreground">
                      Generate a 45-second recording of the dashboard interactions to use as background for HeyGen AI videos.
                    </p>

                    {/* Show existing video if available */}
                    {selectedDashboard.background_video_url && (
                      <div className="space-y-2">
                        <video
                          src={selectedDashboard.background_video_url}
                          controls
                          className="w-full rounded-lg border"
                        />
                        <div className="flex gap-2">
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => window.open(selectedDashboard.background_video_url!, '_blank')}
                          >
                            <ExternalLink className="h-4 w-4 mr-2" />
                            Open Video
                          </Button>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => {
                              navigator.clipboard.writeText(selectedDashboard.background_video_url!)
                              toast.success('Video URL copied to clipboard')
                            }}
                          >
                            <Copy className="h-4 w-4 mr-2" />
                            Copy URL
                          </Button>
                        </div>
                        {selectedDashboard.background_video_generated_at && (
                          <p className="text-xs text-muted-foreground">
                            Generated {formatDistanceToNow(new Date(selectedDashboard.background_video_generated_at), { addSuffix: true })}
                          </p>
                        )}
                      </div>
                    )}

                    {/* Status indicator */}
                    {selectedDashboard.background_video_status === 'processing' && (
                      <div className="flex items-center gap-2 p-3 bg-blue-50 border border-blue-200 rounded-lg">
                        <Loader2 className="h-4 w-4 animate-spin text-blue-600" />
                        <span className="text-sm text-blue-900">Recording in progress...</span>
                      </div>
                    )}

                    {selectedDashboard.background_video_status === 'failed' && (
                      <div className="flex items-center gap-2 p-3 bg-red-50 border border-red-200 rounded-lg">
                        <XCircle className="h-4 w-4 text-red-600" />
                        <span className="text-sm text-red-900">Generation failed. Try again.</span>
                      </div>
                    )}

                    {/* Generate button */}
                    <Button
                      onClick={handleGenerateBackgroundVideo}
                      disabled={generatingVideo || selectedDashboard.background_video_status === 'processing'}
                      className="w-full"
                      variant={selectedDashboard.background_video_url ? "outline" : "default"}
                    >
                      {generatingVideo || selectedDashboard.background_video_status === 'processing' ? (
                        <>
                          <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                          Recording Dashboard...
                        </>
                      ) : selectedDashboard.background_video_url ? (
                        <>
                          <RefreshCw className="h-4 w-4 mr-2" />
                          Re-generate Recording
                        </>
                      ) : (
                        <>
                          <Video className="h-4 w-4 mr-2" />
                          Generate Dashboard Recording
                        </>
                      )}
                    </Button>
                  </div>

                  <Separator />

                  {/* HeyGen AI Video */}
                  <div className="space-y-3">
                    <h3 className="font-semibold flex items-center gap-2">
                      <Sparkles className="h-4 w-4" />
                      HeyGen AI Avatar Video
                    </h3>
                    <p className="text-sm text-muted-foreground">
                      Generate a personalized AI avatar video using the dashboard recording as background.
                    </p>

                    {/* First Name Input */}
                    <div className="space-y-2">
                      <Label htmlFor="first_name">
                        Prospect First Name *
                      </Label>
                      <Input
                        id="first_name"
                        placeholder="Enter first name for video personalization"
                        value={selectedDashboard.first_name || ''}
                        onChange={(e) => {
                          setSelectedDashboard(prev =>
                            prev ? { ...prev, first_name: e.target.value } : null
                          )
                        }}
                        onBlur={async () => {
                          if (!selectedDashboard) return
                          // Auto-save first name
                          const { error } = await supabase
                            .from('prospect_dashboards')
                            .update({ first_name: selectedDashboard.first_name })
                            .eq('id', selectedDashboard.id)

                          if (error) {
                            toast.error('Failed to save first name')
                          } else {
                            toast.success('First name saved')
                          }
                        }}
                      />
                      <p className="text-xs text-muted-foreground">
                        This name will be used in the AI avatar greeting
                      </p>
                    </div>

                    {/* Show existing HeyGen video if available */}
                    {selectedDashboard.heygen_video_url && (
                      <div className="space-y-2">
                        <video
                          src={selectedDashboard.heygen_video_url}
                          controls
                          className="w-full rounded-lg border"
                          poster={selectedDashboard.heygen_video_thumbnail_url || undefined}
                        />
                        <div className="flex gap-2">
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => window.open(selectedDashboard.heygen_video_url!, '_blank')}
                          >
                            <ExternalLink className="h-4 w-4 mr-2" />
                            Open Video
                          </Button>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => {
                              navigator.clipboard.writeText(selectedDashboard.heygen_video_url!)
                              toast.success('Video URL copied to clipboard')
                            }}
                          >
                            <Copy className="h-4 w-4 mr-2" />
                            Copy URL
                          </Button>
                        </div>
                        {selectedDashboard.heygen_video_generated_at && (
                          <p className="text-xs text-muted-foreground">
                            Generated {formatDistanceToNow(new Date(selectedDashboard.heygen_video_generated_at), { addSuffix: true })}
                          </p>
                        )}
                        <p className="text-xs text-orange-600">
                          ⚠️ HeyGen video URLs expire in 7 days
                        </p>
                      </div>
                    )}

                    {/* Status indicators */}
                    {selectedDashboard.heygen_video_status === 'pending' && (
                      <div className="flex items-center gap-2 p-3 bg-blue-50 border border-blue-200 rounded-lg">
                        <Loader2 className="h-4 w-4 animate-spin text-blue-600" />
                        <span className="text-sm text-blue-900">HeyGen video queued...</span>
                      </div>
                    )}

                    {selectedDashboard.heygen_video_status === 'processing' && (
                      <div className="flex items-center gap-2 p-3 bg-blue-50 border border-blue-200 rounded-lg">
                        <Loader2 className="h-4 w-4 animate-spin text-blue-600" />
                        <span className="text-sm text-blue-900">Generating AI avatar video...</span>
                      </div>
                    )}

                    {selectedDashboard.heygen_video_status === 'failed' && (
                      <div className="flex items-center gap-2 p-3 bg-red-50 border border-red-200 rounded-lg">
                        <XCircle className="h-4 w-4 text-red-600" />
                        <span className="text-sm text-red-900">HeyGen generation failed. Try again.</span>
                      </div>
                    )}

                    {/* Requirements check */}
                    {!selectedDashboard.background_video_url && (
                      <div className="flex items-center gap-2 p-3 bg-amber-50 border border-amber-200 rounded-lg">
                        <XCircle className="h-4 w-4 text-amber-600" />
                        <span className="text-sm text-amber-900">
                          Generate dashboard recording first
                        </span>
                      </div>
                    )}

                    {/* Generate button */}
                    <Button
                      onClick={handleGenerateHeyGenVideo}
                      disabled={
                        !selectedDashboard.background_video_url ||
                        !selectedDashboard.first_name ||
                        selectedDashboard.heygen_video_status === 'processing' ||
                        selectedDashboard.heygen_video_status === 'pending' ||
                        generatingHeyGenVideo
                      }
                      className="w-full"
                      variant={selectedDashboard.heygen_video_url ? "outline" : "default"}
                    >
                      {selectedDashboard.heygen_video_status === 'processing' || selectedDashboard.heygen_video_status === 'pending' || generatingHeyGenVideo ? (
                        <>
                          <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                          Generating AI Video...
                        </>
                      ) : selectedDashboard.heygen_video_url ? (
                        <>
                          <RefreshCw className="h-4 w-4 mr-2" />
                          Re-generate AI Video
                        </>
                      ) : (
                        <>
                          <Sparkles className="h-4 w-4 mr-2" />
                          Generate HeyGen AI Video
                        </>
                      )}
                    </Button>

                    {/* Refresh Status button (failsafe) */}
                    {selectedDashboard.heygen_video_id && (
                      <Button
                        onClick={handleRefreshVideoStatus}
                        variant="ghost"
                        size="sm"
                        className="w-full"
                      >
                        <RefreshCw className="h-3 w-3 mr-2" />
                        Refresh Video Status
                      </Button>
                    )}

                    {/* Download Video button */}
                    {selectedDashboard.heygen_video_url && selectedDashboard.heygen_video_status === 'completed' && (
                      <Button
                        onClick={handleDownloadVideo}
                        variant="ghost"
                        size="sm"
                        className="w-full"
                      >
                        <Download className="h-3 w-3 mr-2" />
                        Download Video (MP4)
                      </Button>
                    )}
                  </div>

                  <Separator />

                  {/* Testimonials */}
                  <div className="space-y-3">
                    <h3 className="font-semibold flex items-center gap-2">
                      <Users className="h-4 w-4" />
                      Testimonial Videos
                    </h3>

                    <div className="space-y-2">
                      <Label className="text-sm text-muted-foreground">
                        Select testimonials to show for this prospect:
                      </Label>

                      {/* Testimonial Selection */}
                      <div className="max-h-48 overflow-y-auto space-y-2 border rounded-lg p-3">
                        {allTestimonials.length === 0 ? (
                          <p className="text-sm text-muted-foreground text-center py-4">
                            No testimonials available
                          </p>
                        ) : (
                          allTestimonials.map((testimonial) => (
                            <label
                              key={testimonial.id}
                              className="flex items-start gap-2 p-2 rounded hover:bg-accent cursor-pointer"
                            >
                              <input
                                type="checkbox"
                                checked={selectedTestimonials.includes(testimonial.id)}
                                onChange={(e) => {
                                  if (e.target.checked) {
                                    setSelectedTestimonials([...selectedTestimonials, testimonial.id])
                                  } else {
                                    setSelectedTestimonials(selectedTestimonials.filter(id => id !== testimonial.id))
                                  }
                                }}
                                className="mt-1"
                              />
                              <div className="flex-1">
                                <p className="text-sm font-medium">{testimonial.client_name}</p>
                                {testimonial.client_title && (
                                  <p className="text-xs text-muted-foreground">{testimonial.client_title}</p>
                                )}
                              </div>
                            </label>
                          ))
                        )}
                      </div>

                      <div className="flex items-center gap-2">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={saveTestimonials}
                          disabled={savingTestimonials || JSON.stringify(selectedTestimonials) === JSON.stringify(selectedDashboard.testimonial_ids || [])}
                        >
                          {savingTestimonials ? (
                            <Loader2 className="h-4 w-4 animate-spin mr-1" />
                          ) : (
                            <Save className="h-4 w-4 mr-1" />
                          )}
                          Save Selection
                        </Button>
                        <span className="text-xs text-muted-foreground">
                          {selectedTestimonials.length} selected
                        </span>
                      </div>
                    </div>

                    {/* Toggle Show/Hide Testimonials */}
                    <div className="pt-2 border-t">
                      <div className="flex items-center justify-between">
                        <div>
                          <p className="text-sm font-medium">Show Testimonials Section</p>
                          <p className="text-xs text-muted-foreground">
                            {selectedDashboard.show_testimonials
                              ? 'Testimonials section visible to prospect'
                              : 'Testimonials section hidden from prospect'}
                          </p>
                        </div>
                        <Button
                          onClick={toggleTestimonials}
                          disabled={togglingTestimonials || selectedTestimonials.length === 0}
                          variant={selectedDashboard.show_testimonials ? "default" : "outline"}
                          size="sm"
                          className={cn(
                            selectedDashboard.show_testimonials && "bg-purple-600 hover:bg-purple-700"
                          )}
                        >
                          {togglingTestimonials ? (
                            <Loader2 className="h-4 w-4 animate-spin" />
                          ) : selectedDashboard.show_testimonials ? (
                            <>
                              <Eye className="h-4 w-4 mr-1" />
                              Showing
                            </>
                          ) : (
                            <>
                              <EyeOff className="h-4 w-4 mr-1" />
                              Hidden
                            </>
                          )}
                        </Button>
                      </div>
                    </div>
                  </div>

                  <Separator />

                  {/* Prepare for Client - 3 Step Workflow */}
                  <div className="space-y-3">
                    <h3 className="font-semibold flex items-center gap-2">
                      <Sparkles className="h-4 w-4" />
                      Prepare for Client
                    </h3>
                    <p className="text-xs text-muted-foreground">
                      Build the cache before sharing to ensure instant loading for the client
                    </p>

                    {/* Button 1: Check Cache Status */}
                    <Button
                      onClick={checkCacheStatus}
                      disabled={checkingStatus || fetchingPodcasts || runningAiAnalysis || !selectedDashboard.spreadsheet_id}
                      className="w-full"
                      variant="outline"
                      size="sm"
                    >
                      {checkingStatus ? (
                        <>
                          <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                          Checking...
                        </>
                      ) : (
                        <>
                          <BarChart3 className="h-4 w-4 mr-2" />
                          Check Cache Status
                        </>
                      )}
                    </Button>

                    {/* Status Display */}
                    {cacheStatusData && (
                      <div className="p-3 bg-slate-50 dark:bg-slate-800/50 rounded-lg space-y-2">
                        <div className="text-sm font-medium">
                          {cacheStatusData.totalInSheet} podcasts in sheet
                        </div>
                        <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs">
                          <span className="text-muted-foreground">Cached:</span>
                          <span className={cn("font-medium", cacheStatusData.cached === cacheStatusData.totalInSheet ? "text-green-600" : "")}>
                            {cacheStatusData.cached}
                          </span>
                          <span className="text-muted-foreground">Missing:</span>
                          <span className={cn("font-medium", cacheStatusData.missing > 0 ? "text-amber-600" : "text-green-600")}>
                            {cacheStatusData.missing}
                          </span>
                          <span className="text-muted-foreground">With AI:</span>
                          <span className={cn("font-medium", cacheStatusData.withAi === cacheStatusData.cached ? "text-green-600" : "")}>
                            {cacheStatusData.withAi}
                          </span>
                          <span className="text-muted-foreground">Need AI:</span>
                          <span className={cn("font-medium", cacheStatusData.withoutAi > 0 ? "text-purple-600" : "text-green-600")}>
                            {cacheStatusData.withoutAi}
                          </span>
                        </div>
                      </div>
                    )}

                    {/* Button 2: Find Missing Podcasts OR Link Cached Podcasts */}
                    {cacheStatusData && (cacheStatusData.missing > 0 || (cacheStatusData.cached > 0 && cacheStatusData.withAi === 0)) && (
                      <div className="space-y-2">
                        {fetchingPodcasts && (
                          <div className="space-y-2">
                            <div className="h-2 w-full bg-muted rounded-full overflow-hidden">
                              <div
                                className="h-full bg-primary rounded-full animate-pulse"
                                style={{
                                  width: '100%',
                                  animation: 'progress-indeterminate 2s ease-in-out infinite',
                                }}
                              />
                            </div>
                            <p className="text-xs text-center text-muted-foreground">
                              {cacheStatusData.missing > 0 ? 'Fetching from Podscan...' : 'Linking cached podcasts...'}
                            </p>
                          </div>
                        )}
                        <Button
                          onClick={fetchMissingPodcasts}
                          disabled={fetchingPodcasts || runningAiAnalysis || checkingStatus}
                          className="w-full"
                          size="sm"
                        >
                          {fetchingPodcasts ? (
                            <>
                              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                              {cacheStatusData.missing > 0 ? 'Fetching...' : 'Linking...'}
                            </>
                          ) : fetchStatus?.stoppedEarly ? (
                            <>
                              <RefreshCw className="h-4 w-4 mr-2" />
                              Continue ({fetchStatus.remaining} remaining)
                            </>
                          ) : cacheStatusData.missing > 0 ? (
                            <>
                              <RefreshCw className="h-4 w-4 mr-2" />
                              Find Missing Podcasts ({cacheStatusData.missing})
                            </>
                          ) : (
                            <>
                              <RefreshCw className="h-4 w-4 mr-2" />
                              Link Cached Podcasts ({cacheStatusData.cached})
                            </>
                          )}
                        </Button>
                      </div>
                    )}

                    {/* Button 3: Run AI Analysis */}
                    {cacheStatusData && cacheStatusData.withoutAi > 0 && (
                      <div className="space-y-2">
                        {runningAiAnalysis && (
                          <div className="space-y-2">
                            <div className="h-2 w-full bg-muted rounded-full overflow-hidden">
                              <div
                                className="h-full bg-purple-500 rounded-full animate-pulse"
                                style={{
                                  width: '100%',
                                  animation: 'progress-indeterminate 2s ease-in-out infinite',
                                }}
                              />
                            </div>
                            <p className="text-xs text-center text-muted-foreground">
                              Generating AI insights...
                            </p>
                          </div>
                        )}
                        <Button
                          onClick={runAiAnalysis}
                          disabled={runningAiAnalysis || fetchingPodcasts || checkingStatus}
                          className="w-full"
                          variant="secondary"
                          size="sm"
                        >
                          {runningAiAnalysis ? (
                            <>
                              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                              Analyzing...
                            </>
                          ) : aiStatus?.stoppedEarly ? (
                            <>
                              <Sparkles className="h-4 w-4 mr-2" />
                              Continue AI ({aiStatus.remaining} remaining)
                            </>
                          ) : (
                            <>
                              <Sparkles className="h-4 w-4 mr-2" />
                              Run AI Analysis ({cacheStatusData.withoutAi})
                            </>
                          )}
                        </Button>
                      </div>
                    )}

                    {/* Publish Toggle */}
                    <div className="pt-2 border-t">
                      <div className="flex items-center justify-between">
                        <div>
                          <p className="text-sm font-medium">Publish to Client</p>
                          <p className="text-xs text-muted-foreground">
                            {selectedDashboard.content_ready
                              ? 'Client can see the dashboard'
                              : 'Client sees "Coming Soon"'}
                          </p>
                        </div>
                        <Button
                          onClick={toggleContentReady}
                          disabled={togglingPublish}
                          variant={selectedDashboard.content_ready ? "default" : "outline"}
                          size="sm"
                          className={cn(
                            selectedDashboard.content_ready && "bg-green-600 hover:bg-green-700"
                          )}
                        >
                          {togglingPublish ? (
                            <Loader2 className="h-4 w-4 animate-spin" />
                          ) : selectedDashboard.content_ready ? (
                            <>
                              <CheckCircle2 className="h-4 w-4 mr-1" />
                              Published
                            </>
                          ) : (
                            <>
                              <Eye className="h-4 w-4 mr-1" />
                              Publish
                            </>
                          )}
                        </Button>
                      </div>
                    </div>

                    {/* Pricing Section Toggle */}
                    <div className="pt-2 border-t">
                      <div className="flex items-center justify-between">
                        <div>
                          <p className="text-sm font-medium">Show Pricing</p>
                          <p className="text-xs text-muted-foreground">
                            {selectedDashboard.show_pricing_section !== false
                              ? 'Pricing CTA section visible'
                              : 'Pricing section hidden'}
                          </p>
                        </div>
                        <Button
                          onClick={togglePricingSection}
                          disabled={togglingPricing}
                          variant={selectedDashboard.show_pricing_section !== false ? "default" : "outline"}
                          size="sm"
                          className={cn(
                            selectedDashboard.show_pricing_section !== false && "bg-purple-600 hover:bg-purple-700"
                          )}
                        >
                          {togglingPricing ? (
                            <Loader2 className="h-4 w-4 animate-spin" />
                          ) : selectedDashboard.show_pricing_section !== false ? (
                            <>
                              <DollarSign className="h-4 w-4 mr-1" />
                              Showing
                            </>
                          ) : (
                            <>
                              <EyeOff className="h-4 w-4 mr-1" />
                              Hidden
                            </>
                          )}
                        </Button>
                      </div>
                    </div>
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

                  {/* Prospect Feedback */}
                  <div className="space-y-3">
                    <h3 className="font-semibold flex items-center gap-2">
                      <MessageSquare className="h-4 w-4" />
                      Prospect Feedback
                    </h3>

                    {loadingFeedback ? (
                      <div className="flex items-center justify-center py-4">
                        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                      </div>
                    ) : feedback.length === 0 ? (
                      <p className="text-sm text-muted-foreground">
                        No feedback from prospect yet
                      </p>
                    ) : (
                      <>
                        {/* Feedback Summary - Clickable */}
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
                              {feedback.filter(f => f.status === 'approved').length}
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
                              {feedback.filter(f => f.status === 'rejected').length}
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
                              {feedback.filter(f => f.notes).length}
                            </p>
                            <p className="text-xs text-slate-600 dark:text-slate-400">With Notes</p>
                          </button>
                        </div>

                        {/* Approved Podcasts List */}
                        {expandedFeedbackSection === 'approved' && feedback.filter(f => f.status === 'approved').length > 0 && (
                          <div className="space-y-2 mt-4">
                            <p className="text-xs font-medium text-green-600 dark:text-green-400 uppercase tracking-wide">
                              Approved Podcasts
                            </p>
                            <div className="space-y-2 max-h-64 overflow-y-auto">
                              {feedback.filter(f => f.status === 'approved').map((fb) => (
                                <div
                                  key={fb.id}
                                  className="p-3 rounded-lg border bg-green-50/50 dark:bg-green-950/20 border-green-200 dark:border-green-800"
                                >
                                  <div className="flex items-center gap-2 mb-1">
                                    <CheckCircle2 className="h-3.5 w-3.5 text-green-600 flex-shrink-0" />
                                    <span className="font-medium text-sm truncate">
                                      {fb.podcast_name || 'Unknown Podcast'}
                                    </span>
                                  </div>
                                  <p className="text-xs text-muted-foreground font-mono">
                                    ID: {fb.podcast_id}
                                  </p>
                                  {fb.notes && (
                                    <p className="text-xs text-muted-foreground mt-1 italic">
                                      "{fb.notes}"
                                    </p>
                                  )}
                                </div>
                              ))}
                            </div>
                          </div>
                        )}

                        {/* Rejected Podcasts List */}
                        {expandedFeedbackSection === 'rejected' && feedback.filter(f => f.status === 'rejected').length > 0 && (
                          <div className="space-y-2 mt-4">
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
                            <div className="space-y-2 max-h-64 overflow-y-auto overflow-x-hidden">
                              {feedback.filter(f => f.status === 'rejected').map((fb) => (
                                <div
                                  key={fb.id}
                                  className="p-3 rounded-lg border bg-red-50/50 dark:bg-red-950/20 border-red-200 dark:border-red-800"
                                >
                                  <div className="flex items-center gap-2 mb-1">
                                    <XCircle className="h-3.5 w-3.5 text-red-600 flex-shrink-0" />
                                    <span className="font-medium text-sm truncate max-w-[320px]">
                                      {fb.podcast_name || 'Unknown Podcast'}
                                    </span>
                                    <Button
                                      variant="ghost"
                                      size="icon"
                                      className="h-7 w-7 text-red-600 hover:text-red-700 hover:bg-red-100 dark:hover:bg-red-900/30 flex-shrink-0 ml-auto"
                                      onClick={() => deletePodcastFromDashboard(fb.podcast_id, fb.podcast_name)}
                                      disabled={deletingPodcastId === fb.podcast_id}
                                    >
                                      {deletingPodcastId === fb.podcast_id ? (
                                        <Loader2 className="h-4 w-4 animate-spin" />
                                      ) : (
                                        <Trash2 className="h-4 w-4" />
                                      )}
                                    </Button>
                                  </div>
                                  <p className="text-xs text-muted-foreground font-mono">
                                    ID: {fb.podcast_id}
                                  </p>
                                  {fb.notes && (
                                    <p className="text-xs text-muted-foreground mt-1 italic">
                                      "{fb.notes}"
                                    </p>
                                  )}
                                </div>
                              ))}
                            </div>
                          </div>
                        )}

                        {/* Feedback with Notes */}
                        {expandedFeedbackSection === 'notes' && feedback.filter(f => f.notes).length > 0 && (
                          <div className="space-y-2 mt-4">
                            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                              Notes from Prospect
                            </p>
                            <div className="space-y-2 max-h-64 overflow-y-auto">
                              {feedback.filter(f => f.notes).map((fb) => (
                                <div
                                  key={fb.id}
                                  className={cn(
                                    "p-3 rounded-lg border text-sm",
                                    fb.status === 'approved'
                                      ? "bg-green-50/50 dark:bg-green-950/20 border-green-200 dark:border-green-800"
                                      : fb.status === 'rejected'
                                      ? "bg-red-50/50 dark:bg-red-950/20 border-red-200 dark:border-red-800"
                                      : "bg-slate-50 dark:bg-slate-800/50 border-slate-200 dark:border-slate-700"
                                  )}
                                >
                                  <div className="flex items-center gap-2 mb-2">
                                    {fb.status === 'approved' ? (
                                      <CheckCircle2 className="h-3.5 w-3.5 text-green-600 flex-shrink-0" />
                                    ) : fb.status === 'rejected' ? (
                                      <XCircle className="h-3.5 w-3.5 text-red-600 flex-shrink-0" />
                                    ) : null}
                                    <span className="font-medium truncate">
                                      {fb.podcast_name || 'Unknown Podcast'}
                                    </span>
                                  </div>
                                  <p className="text-sm mb-2">{fb.notes}</p>
                                  <p className="text-xs text-muted-foreground font-mono">
                                    ID: {fb.podcast_id}
                                  </p>
                                </div>
                              ))}
                            </div>
                          </div>
                        )}
                      </>
                    )}
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
              <div className="p-4 border-t bg-muted/30 space-y-2">
                <Button
                  className="w-full"
                  onClick={() => copyLink(selectedDashboard.slug)}
                >
                  <Copy className="h-4 w-4 mr-2" />
                  Copy Link to Share
                </Button>
                <Button
                  variant="outline"
                  className="w-full"
                  onClick={() => copyLink(selectedDashboard.slug, true)}
                >
                  <Sparkles className="h-4 w-4 mr-2" />
                  Copy with Welcome Tour
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

      {/* Create Prospect Dialog */}
      <Dialog open={createDialogOpen} onOpenChange={setCreateDialogOpen}>
        <DialogContent className="sm:max-w-[500px]">
          <DialogHeader>
            <DialogTitle>Create New Prospect</DialogTitle>
            <DialogDescription>
              Add a new prospect to track podcast opportunities for. You can link a Google Sheet later.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="prospect-name">
                Prospect Name <span className="text-destructive">*</span>
              </Label>
              <Input
                id="prospect-name"
                placeholder="e.g., John Smith, Acme Corp CEO"
                value={newProspect.name}
                onChange={(e) => setNewProspect(prev => ({ ...prev, name: e.target.value }))}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="prospect-bio">Bio / Background</Label>
              <Textarea
                id="prospect-bio"
                placeholder="Describe the prospect's expertise, industry, target audience..."
                value={newProspect.bio}
                onChange={(e) => setNewProspect(prev => ({ ...prev, bio: e.target.value }))}
                className="min-h-[100px]"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="prospect-image">Profile Picture URL</Label>
              <Input
                id="prospect-image"
                type="url"
                placeholder="https://example.com/profile-picture.jpg"
                value={newProspect.imageUrl}
                onChange={(e) => setNewProspect(prev => ({ ...prev, imageUrl: e.target.value }))}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="prospect-sheet">Google Sheet URL</Label>
              <Input
                id="prospect-sheet"
                type="url"
                placeholder="https://docs.google.com/spreadsheets/d/..."
                value={newProspect.spreadsheetUrl}
                onChange={(e) => setNewProspect(prev => ({ ...prev, spreadsheetUrl: e.target.value }))}
              />
              <p className="text-xs text-muted-foreground">
                Link an existing Google Sheet or leave blank to add later.
              </p>
              <details className="text-xs">
                <summary className="text-muted-foreground cursor-pointer hover:text-foreground">
                  Expected sheet format
                </summary>
                <div className="mt-2 p-2 bg-muted rounded text-muted-foreground space-y-1">
                  <p className="font-medium">Columns (in order):</p>
                  <ol className="list-decimal list-inside space-y-0.5 pl-2">
                    <li>Podcast Name</li>
                    <li>Description</li>
                    <li>iTunes Rating</li>
                    <li>Episode Count</li>
                    <li>Podscan Podcast ID</li>
                  </ol>
                </div>
              </details>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCreateDialogOpen(false)}>
              Cancel
            </Button>
            <Button onClick={createProspect} disabled={creating || !newProspect.name.trim()}>
              {creating ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Creating...
                </>
              ) : (
                <>
                  <Plus className="h-4 w-4 mr-2" />
                  Create Prospect
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      </div>
    </DashboardLayout>
  )
}
