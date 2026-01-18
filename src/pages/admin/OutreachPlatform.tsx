import { useState, useMemo } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  getOutreachMessages,
  updateOutreachMessage,
  deleteOutreachMessage,
  type OutreachMessageWithClient
} from '@/services/outreachMessages'
import { supabase } from '@/lib/supabase'
import { DashboardLayout } from '@/components/admin/DashboardLayout'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { toast } from 'sonner'
import {
  Mail,
  Send,
  CheckCircle2,
  XCircle,
  Edit,
  Eye,
  Trash2,
  Loader2,
  AlertCircle,
  BarChart3,
  ChevronDown,
  ChevronUp,
  User,
  ExternalLink
} from 'lucide-react'

export default function OutreachPlatform() {
  const [statusFilter, setStatusFilter] = useState<'pending_review' | 'sent'>('pending_review')
  const [expandedClientIds, setExpandedClientIds] = useState<Set<string>>(new Set())
  const [editingMessage, setEditingMessage] = useState<OutreachMessageWithClient | null>(null)
  const [viewingMessage, setViewingMessage] = useState<OutreachMessageWithClient | null>(null)
  const [viewingClientBio, setViewingClientBio] = useState<OutreachMessageWithClient | null>(null)
  const [sendingMessageIds, setSendingMessageIds] = useState<Set<string>>(new Set())
  const [podscanEmail, setPodscanEmail] = useState<string | null>(null)
  const [fetchingPodscanEmail, setFetchingPodscanEmail] = useState(false)

  const queryClient = useQueryClient()

  // Fetch messages based on status filter
  const { data: allMessages = [], isLoading } = useQuery({
    queryKey: ['outreach-messages', statusFilter],
    queryFn: () => getOutreachMessages({ status: statusFilter }),
    refetchInterval: 30000 // Refresh every 30 seconds
  })

  // Fetch count of messages sent today
  const { data: sentTodayCount = 0 } = useQuery({
    queryKey: ['outreach-messages-sent-today'],
    queryFn: async () => {
      const today = new Date()
      today.setHours(0, 0, 0, 0)

      const { count, error } = await supabase
        .from('outreach_messages')
        .select('*', { count: 'exact', head: true })
        .eq('status', 'sent')
        .gte('sent_at', today.toISOString())

      if (error) throw error
      return count || 0
    },
    refetchInterval: 30000
  })

  // Group messages by client
  const messagesByClient = useMemo(() => {
    const grouped = new Map<string, OutreachMessageWithClient[]>()

    allMessages.forEach(msg => {
      const clientId = msg.client_id
      if (!grouped.has(clientId)) {
        grouped.set(clientId, [])
      }
      grouped.get(clientId)!.push(msg)
    })

    return grouped
  }, [allMessages])

  // Get unique clients with message counts
  const clients = useMemo(() => {
    return Array.from(messagesByClient.entries()).map(([clientId, messages]) => ({
      id: clientId,
      name: messages[0]?.client?.name || 'Unknown Client',
      photo_url: messages[0]?.client?.photo_url,
      count: messages.length,
      campaignId: messages[0]?.bison_campaign_id
    }))
  }, [messagesByClient])

  // Toggle client expansion
  const toggleClient = (clientId: string) => {
    setExpandedClientIds(prev => {
      const newSet = new Set(prev)
      if (newSet.has(clientId)) {
        newSet.delete(clientId)
      } else {
        newSet.add(clientId)
      }
      return newSet
    })
  }

  // Update message mutation
  const updateMutation = useMutation({
    mutationFn: ({ id, updates }: { id: string; updates: Partial<OutreachMessageWithClient> }) =>
      updateOutreachMessage(id, updates),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['outreach-messages'] })
      toast.success('Message updated successfully')
    },
    onError: (error) => {
      toast.error(`Failed to update message: ${error.message}`)
    }
  })

  // Delete message mutation
  const deleteMutation = useMutation({
    mutationFn: (id: string) => deleteOutreachMessage(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['outreach-messages'] })
      toast.success('Message deleted')
    },
    onError: (error) => {
      toast.error(`Failed to delete message: ${error.message}`)
    }
  })

  // Handle create lead in Bison and send email
  const handleApproveAndSend = async (message: OutreachMessageWithClient) => {
    setSendingMessageIds(prev => new Set(prev).add(message.id))

    try {
      // Step 1: Create lead in Bison
      const { data: bisonData, error: bisonError } = await supabase.functions.invoke('create-bison-lead', {
        body: { message_id: message.id }
      })

      if (bisonError) {
        throw new Error(`Failed to connect to Bison: ${bisonError.message}`)
      }

      if (!bisonData.success) {
        throw new Error(bisonData.error || 'Failed to create lead in Bison')
      }

      const leadId = bisonData.lead_id
      const leadStatus = bisonData.lead_already_existed ? 'found existing' : 'created new'
      const campaignMsg = bisonData.campaign_attached
        ? ` and attached to campaign ${bisonData.campaign_id}`
        : ''

      // Step 2: Send email (TODO: integrate with email platform)
      await updateMutation.mutateAsync({
        id: message.id,
        updates: {
          status: 'sent',
          sent_at: new Date().toISOString()
        }
      })

      toast.success(`Successfully ${leadStatus} lead in Bison (ID: ${leadId})${campaignMsg}. Email marked as sent.`)

      // Refresh all message queries (both pending and sent tabs)
      await queryClient.invalidateQueries({ queryKey: ['outreach-messages', 'pending_review'] })
      await queryClient.invalidateQueries({ queryKey: ['outreach-messages', 'sent'] })
      await queryClient.invalidateQueries({ queryKey: ['outreach-messages-sent-today'] })

      // Close modal after short delay to let user see the success state
      setTimeout(() => {
        setViewingMessage(null)
      }, 1500)
    } catch (error: any) {
      console.error('Error in approve and send:', error)

      // Show user-friendly error message
      const errorMessage = error.message || 'Unknown error occurred'
      toast.error(`Failed to approve and send: ${errorMessage}`)
    } finally {
      setSendingMessageIds(prev => {
        const newSet = new Set(prev)
        newSet.delete(message.id)
        return newSet
      })
    }
  }


  // Handle approve all for a specific client
  const handleApproveAll = async (clientId: string, clientName: string) => {
    const messages = messagesByClient.get(clientId) || []
    if (!messages.length) return

    const confirmSend = window.confirm(
      `Send ${messages.length} emails for ${clientName}?`
    )

    if (!confirmSend) return

    try {
      for (const message of messages) {
        await handleApproveAndSend(message)
      }
    } catch (error) {
      console.error('Error sending batch:', error)
    }
  }

  // Handle edit save
  const handleEditSave = async () => {
    if (!editingMessage) return

    await updateMutation.mutateAsync({
      id: editingMessage.id,
      updates: {
        subject_line: editingMessage.subject_line,
        email_body: editingMessage.email_body,
        host_email: editingMessage.host_email,
        host_name: editingMessage.host_name
      }
    })

    setEditingMessage(null)
  }

  // Fetch Podscan email
  const handleFetchPodscanEmail = async (podcastId: string) => {
    setFetchingPodscanEmail(true)
    setPodscanEmail(null)

    try {
      const { data, error } = await supabase.functions.invoke('fetch-podscan-email', {
        body: { podcast_id: podcastId }
      })

      if (error) throw error

      if (data.success && data.email) {
        setPodscanEmail(data.email)
        if (data.cached) {
          toast.success(`Email found in cache: ${data.email}`)
        } else {
          toast.success(`Email fetched from Podscan: ${data.email}`)
        }
      } else {
        setPodscanEmail(null)
        if (data.cached) {
          toast.info('Email was previously checked - no email available')
        } else {
          toast.info('No email found in Podscan database')
        }
      }
    } catch (error) {
      console.error('Error fetching Podscan email:', error)
      toast.error('Failed to fetch Podscan email')
    } finally {
      setFetchingPodscanEmail(false)
    }
  }

  if (isLoading) {
    return (
      <DashboardLayout>
        <div className="flex items-center justify-center min-h-screen">
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
          <h1 className="text-3xl font-bold tracking-tight flex items-center gap-2">
            <Mail className="h-8 w-8" />
            Outreach Dashboard
          </h1>
          <p className="text-muted-foreground mt-1">
            {statusFilter === 'pending_review'
              ? 'Review and approve outreach emails from Clay'
              : 'View all sent outreach messages'}
          </p>
        </div>
        <Button variant="outline" size="sm">
          <BarChart3 className="h-4 w-4 mr-2" />
          Stats Dashboard
        </Button>
      </div>

      {/* Status Filter Tabs */}
      <Tabs value={statusFilter} onValueChange={(value) => setStatusFilter(value as 'pending_review' | 'sent')}>
        <TabsList className="grid w-full max-w-md grid-cols-2">
          <TabsTrigger value="pending_review" className="gap-2">
            <AlertCircle className="h-4 w-4" />
            Pending Review
          </TabsTrigger>
          <TabsTrigger value="sent" className="gap-2">
            <CheckCircle2 className="h-4 w-4" />
            Sent
          </TabsTrigger>
        </TabsList>
      </Tabs>

      {/* Stats Bar */}
      <div className="grid grid-cols-4 gap-4">
        <Card>
          <CardContent className="pt-6">
            <div className="text-2xl font-bold">{allMessages.length}</div>
            <div className="text-sm text-muted-foreground">
              {statusFilter === 'pending_review' ? 'Pending Review' : 'Total Sent'}
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="text-2xl font-bold">{clients.length}</div>
            <div className="text-sm text-muted-foreground">Clients</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="text-2xl font-bold">
              {new Set(allMessages.map(m => m.bison_campaign_id).filter(Boolean)).size}
            </div>
            <div className="text-sm text-muted-foreground">Active Campaigns</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="text-2xl font-bold text-green-600">{sentTodayCount}</div>
            <div className="text-sm text-muted-foreground">Sent Today</div>
          </CardContent>
        </Card>
      </div>

      {/* No messages state */}
      {clients.length === 0 && (
        <Card>
          <CardContent className="py-12 text-center">
            <Mail className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
            <h3 className="text-lg font-semibold mb-2">No pending outreach messages</h3>
            <p className="text-sm text-muted-foreground">
              Messages from Clay will appear here for review and approval
            </p>
          </CardContent>
        </Card>
      )}

      {/* Client Collapsible Sections */}
      {clients.length > 0 && (
        <div className="space-y-4">
          {clients.map(client => {
            const clientMessages = messagesByClient.get(client.id) || []
            const isExpanded = expandedClientIds.has(client.id)

            return (
              <Card key={client.id}>
                <Collapsible
                  open={isExpanded}
                  onOpenChange={() => toggleClient(client.id)}
                >
                  <CollapsibleTrigger className="w-full">
                    <CardHeader className="cursor-pointer hover:bg-muted/50 transition-colors">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                          {client.photo_url && (
                            <img
                              src={client.photo_url}
                              alt={client.name}
                              className="h-10 w-10 rounded-full object-cover"
                            />
                          )}
                          <div className="text-left">
                            <CardTitle className="text-xl">{client.name}</CardTitle>
                            {client.campaignId && (
                              <div className="flex items-center gap-2 mt-1">
                                <Badge variant="outline" className="text-xs">
                                  Campaign: {client.campaignId}
                                </Badge>
                                <span className="text-sm text-muted-foreground">
                                  {client.count} pending
                                </span>
                              </div>
                            )}
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          <Badge variant="secondary" className="text-lg px-3 py-1">
                            {client.count}
                          </Badge>
                          {isExpanded ? (
                            <ChevronUp className="h-5 w-5 text-muted-foreground" />
                          ) : (
                            <ChevronDown className="h-5 w-5 text-muted-foreground" />
                          )}
                        </div>
                      </div>
                    </CardHeader>
                  </CollapsibleTrigger>

                  <CollapsibleContent>
                    <CardContent className="pt-0 space-y-4">
                      {/* Create All Leads Button - only show for pending review */}
                      {statusFilter === 'pending_review' && (
                        <div className="flex justify-end border-t pt-4">
                          <Button
                            onClick={() => handleApproveAll(client.id, client.name)}
                            disabled={sendingMessageIds.size > 0}
                          >
                            <CheckCircle2 className="h-4 w-4 mr-2" />
                            Create All Leads In Bison ({client.count})
                          </Button>
                        </div>
                      )}

                      {/* Message Cards */}
                      <div className="space-y-4">
                        {clientMessages.map(message => (
                          <MessageCard
                            key={message.id}
                            message={message}
                            onView={() => setViewingMessage(message)}
                            onDelete={() => deleteMutation.mutate(message.id)}
                          />
                        ))}
                      </div>
                    </CardContent>
                  </CollapsibleContent>
                </Collapsible>
              </Card>
            )
          })}
        </div>
      )}

      {/* Edit Modal */}
      <Dialog open={!!editingMessage} onOpenChange={() => setEditingMessage(null)}>
        <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Edit Outreach Message</DialogTitle>
            <DialogDescription>
              Make changes to the email before sending
            </DialogDescription>
          </DialogHeader>
          {editingMessage && (
            <div className="space-y-4">
              <div className="space-y-2">
                <Label>Host Name</Label>
                <Input
                  value={editingMessage.host_name}
                  onChange={(e) => setEditingMessage({ ...editingMessage, host_name: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label>Host Email</Label>
                <Input
                  type="email"
                  value={editingMessage.host_email}
                  onChange={(e) => setEditingMessage({ ...editingMessage, host_email: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label>Subject Line</Label>
                <Input
                  value={editingMessage.subject_line}
                  onChange={(e) => setEditingMessage({ ...editingMessage, subject_line: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label>Email Body</Label>
                <Textarea
                  value={editingMessage.email_body}
                  onChange={(e) => setEditingMessage({ ...editingMessage, email_body: e.target.value })}
                  rows={12}
                  className="font-mono text-sm"
                />
              </div>
              <div className="flex justify-end gap-2">
                <Button variant="outline" onClick={() => setEditingMessage(null)}>
                  Cancel
                </Button>
                <Button onClick={handleEditSave} disabled={updateMutation.isPending}>
                  {updateMutation.isPending ? (
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
          )}
        </DialogContent>
      </Dialog>

      {/* View Details Modal */}
      <Dialog open={!!viewingMessage} onOpenChange={() => {
        setViewingMessage(null)
        setPodscanEmail(null)
      }}>
        <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
          {viewingMessage && (
            <>
              <DialogHeader>
                <DialogTitle className="text-2xl">Email Review</DialogTitle>
                <DialogDescription>
                  Review email content and client information
                </DialogDescription>
              </DialogHeader>

              <div className="space-y-6">
                {/* Email Preview Section */}
                <div className="space-y-3">
                  <h3 className="text-lg font-semibold flex items-center gap-2">
                    <Mail className="h-5 w-5" />
                    Email Preview
                  </h3>
                  <div className="border rounded-lg overflow-hidden">
                    <div className="bg-muted p-4 space-y-2">
                      <div className="flex justify-between text-sm">
                        <span className="text-muted-foreground font-medium">To:</span>
                        <span>{viewingMessage.host_name} ({viewingMessage.host_email})</span>
                      </div>
                      <div className="flex justify-between text-sm">
                        <span className="text-muted-foreground font-medium">Subject:</span>
                        <span className="font-medium">{viewingMessage.subject_line}</span>
                      </div>
                    </div>
                    <div className="p-6 bg-white whitespace-pre-wrap text-sm leading-relaxed">
                      {viewingMessage.email_body}
                    </div>
                  </div>
                </div>

                {/* Client Info Section */}
                <div className="space-y-3">
                  <h3 className="text-lg font-semibold flex items-center gap-2">
                    <User className="h-5 w-5" />
                    Client Info
                  </h3>
                  <div className="border rounded-lg p-4">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        {viewingMessage.client?.photo_url && (
                          <img
                            src={viewingMessage.client.photo_url}
                            alt={viewingMessage.client.name}
                            className="h-12 w-12 rounded-full object-cover"
                          />
                        )}
                        <div className="space-y-1">
                          <div className="font-semibold">{viewingMessage.client?.name}</div>
                          <div className="text-sm text-muted-foreground">{viewingMessage.client?.email}</div>
                          {viewingMessage.bison_campaign_id && (
                            <div className="flex items-center gap-2 mt-1">
                              <span className="text-xs text-muted-foreground">Campaign:</span>
                              <Badge variant="outline">{viewingMessage.bison_campaign_id}</Badge>
                            </div>
                          )}
                        </div>
                      </div>
                      <Button
                        variant="outline"
                        onClick={() => setViewingClientBio(viewingMessage)}
                      >
                        <User className="h-4 w-4 mr-2" />
                        View Bio
                      </Button>
                    </div>
                  </div>
                </div>

                {/* Podcast ID & Link */}
                {viewingMessage.podcast_id && (
                  <div className="space-y-3">
                    <h3 className="text-lg font-semibold">Podcast</h3>
                    <div className="border rounded-lg p-4 space-y-3">
                      <div className="flex items-start justify-between">
                        <div className="space-y-1 flex-1">
                          <div className="font-semibold">{viewingMessage.podcast_name}</div>
                          <div className="text-sm text-muted-foreground">
                            ID: <span className="font-mono">{viewingMessage.podcast_id}</span>
                          </div>
                          {podscanEmail && (
                            <div className="text-sm mt-2">
                              <span className="font-medium">Podscan Email: </span>
                              <span className="text-muted-foreground">{podscanEmail}</span>
                            </div>
                          )}
                        </div>
                        <div className="flex gap-2">
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => handleFetchPodscanEmail(viewingMessage.podcast_id!)}
                            disabled={fetchingPodscanEmail}
                          >
                            {fetchingPodscanEmail ? (
                              <>
                                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                                Fetching...
                              </>
                            ) : (
                              <>
                                <Mail className="h-4 w-4 mr-2" />
                                Get Email
                              </>
                            )}
                          </Button>
                          <Button
                            variant="outline"
                            size="sm"
                            asChild
                          >
                            <a
                              href={`https://podscan.fm/dashboard/podcasts/${viewingMessage.podcast_id}`}
                              target="_blank"
                              rel="noopener noreferrer"
                            >
                              <ExternalLink className="h-4 w-4 mr-2" />
                              View on Podscan
                            </a>
                          </Button>
                        </div>
                      </div>
                    </div>
                  </div>
                )}

                {/* Action Buttons */}
                <div className="flex items-center justify-between pt-4 border-t">
                  {statusFilter === 'pending_review' ? (
                    <>
                      <Button
                        variant="outline"
                        onClick={() => {
                          setViewingMessage(null)
                          setEditingMessage(viewingMessage)
                        }}
                      >
                        <Edit className="h-4 w-4 mr-2" />
                        Edit Email
                      </Button>

                      <Button
                        onClick={() => handleApproveAndSend(viewingMessage)}
                        disabled={sendingMessageIds.has(viewingMessage.id)}
                        className="bg-green-600 hover:bg-green-700"
                      >
                        {sendingMessageIds.has(viewingMessage.id) ? (
                          <>
                            <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                            Processing...
                          </>
                        ) : (
                          <>
                            <Send className="h-4 w-4 mr-2" />
                            Create & Send Lead In Bison
                          </>
                        )}
                      </Button>
                    </>
                  ) : (
                    <div className="w-full">
                      <div className="flex items-center gap-2 text-sm text-green-600">
                        <CheckCircle2 className="h-4 w-4" />
                        <span>Sent on {new Date(viewingMessage.sent_at || '').toLocaleString()}</span>
                      </div>
                      {viewingMessage.bison_lead_id && (
                        <div className="text-sm text-muted-foreground mt-1">
                          Bison Lead ID: {viewingMessage.bison_lead_id}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>

      {/* Client Bio Modal */}
      <Dialog open={!!viewingClientBio} onOpenChange={() => setViewingClientBio(null)}>
        <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
          {viewingClientBio && (
            <>
              <DialogHeader>
                <DialogTitle className="text-2xl flex items-center gap-3">
                  {viewingClientBio.client?.photo_url && (
                    <img
                      src={viewingClientBio.client.photo_url}
                      alt={viewingClientBio.client.name}
                      className="h-10 w-10 rounded-full object-cover"
                    />
                  )}
                  {viewingClientBio.client?.name}
                </DialogTitle>
                <DialogDescription>
                  Client Bio & Information
                </DialogDescription>
              </DialogHeader>

              <div className="space-y-4">
                {viewingClientBio.client?.bio ? (
                  <div className="prose prose-sm max-w-none">
                    <div className="whitespace-pre-wrap text-sm leading-relaxed">
                      {viewingClientBio.client.bio}
                    </div>
                  </div>
                ) : (
                  <div className="text-center py-8 text-muted-foreground">
                    No bio available for this client
                  </div>
                )}
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>
      </div>
    </DashboardLayout>
  )
}

// Message Card Component
interface MessageCardProps {
  message: OutreachMessageWithClient
  onView: () => void
  onDelete: () => void
}

function MessageCard({ message, onView, onDelete }: MessageCardProps) {
  return (
    <div className="border rounded-lg p-4 hover:shadow-sm transition-shadow bg-white">
      <div className="flex items-center justify-between gap-4">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-2">
            <Mail className="h-4 w-4 text-muted-foreground flex-shrink-0" />
            <span className="font-semibold truncate">{message.podcast_name}</span>
            <Badge variant="outline" className="text-xs flex-shrink-0">
              {message.status.replace('_', ' ')}
            </Badge>
          </div>
          <div className="text-sm text-muted-foreground truncate">
            To: <span className="font-medium text-foreground">{message.host_name}</span>
          </div>
          <div className="text-sm text-muted-foreground mt-1">
            Subject: <span className="font-medium text-foreground">{message.subject_line}</span>
          </div>
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          <Button onClick={onView}>
            <Eye className="h-4 w-4 mr-2" />
            Review Email
          </Button>
          <Button size="icon" variant="ghost" onClick={onDelete}>
            <Trash2 className="h-4 w-4 text-muted-foreground" />
          </Button>
        </div>
      </div>
    </div>
  )
}
