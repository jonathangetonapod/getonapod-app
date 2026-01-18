import { useState, useMemo } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  getOutreachMessages,
  updateOutreachMessage,
  deleteOutreachMessage,
  type OutreachMessageWithClient
} from '@/services/outreachMessages'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
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
  BarChart3
} from 'lucide-react'

export default function OutreachPlatform() {
  const [selectedClientId, setSelectedClientId] = useState<string | null>(null)
  const [editingMessage, setEditingMessage] = useState<OutreachMessageWithClient | null>(null)
  const [previewMessage, setPreviewMessage] = useState<OutreachMessageWithClient | null>(null)
  const [sendingMessageIds, setSendingMessageIds] = useState<Set<string>>(new Set())

  const queryClient = useQueryClient()

  // Fetch all messages
  const { data: allMessages = [], isLoading } = useQuery({
    queryKey: ['outreach-messages'],
    queryFn: () => getOutreachMessages({ status: 'pending_review' }),
    refetchInterval: 30000 // Refresh every 30 seconds
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

  // Set first client as selected by default
  useState(() => {
    if (clients.length > 0 && !selectedClientId) {
      setSelectedClientId(clients[0].id)
    }
  })

  // Get messages for selected client
  const selectedMessages = selectedClientId
    ? messagesByClient.get(selectedClientId) || []
    : []

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

  // Handle approve and send
  const handleApproveAndSend = async (message: OutreachMessageWithClient) => {
    setSendingMessageIds(prev => new Set(prev).add(message.id))

    try {
      // TODO: Call email platform API here
      // For now, just mark as sent
      await updateMutation.mutateAsync({
        id: message.id,
        updates: {
          status: 'sent',
          sent_at: new Date().toISOString()
        }
      })

      toast.success(`Email sent to ${message.host_name}`)
    } catch (error) {
      toast.error('Failed to send email')
    } finally {
      setSendingMessageIds(prev => {
        const newSet = new Set(prev)
        newSet.delete(message.id)
        return newSet
      })
    }
  }

  // Handle approve all
  const handleApproveAll = async () => {
    if (!selectedMessages.length) return

    const confirmSend = window.confirm(
      `Send ${selectedMessages.length} emails for ${clients.find(c => c.id === selectedClientId)?.name}?`
    )

    if (!confirmSend) return

    try {
      for (const message of selectedMessages) {
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

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    )
  }

  return (
    <div className="container mx-auto py-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight flex items-center gap-2">
            <Mail className="h-8 w-8" />
            Outreach Dashboard
          </h1>
          <p className="text-muted-foreground mt-1">
            Review and approve outreach emails from Clay
          </p>
        </div>
        <Button variant="outline" size="sm">
          <BarChart3 className="h-4 w-4 mr-2" />
          Stats Dashboard
        </Button>
      </div>

      {/* Stats Bar */}
      <div className="grid grid-cols-4 gap-4">
        <Card>
          <CardContent className="pt-6">
            <div className="text-2xl font-bold">{allMessages.length}</div>
            <div className="text-sm text-muted-foreground">Pending Review</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="text-2xl font-bold">{clients.length}</div>
            <div className="text-sm text-muted-foreground">Active Clients</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="text-2xl font-bold">
              {new Set(allMessages.map(m => m.bison_campaign_id)).size}
            </div>
            <div className="text-sm text-muted-foreground">Campaigns</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="text-2xl font-bold text-green-600">0</div>
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

      {/* Client Tabs */}
      {clients.length > 0 && (
        <Card>
          <CardHeader className="border-b">
            <div className="flex items-center justify-between">
              <CardTitle>Review Messages</CardTitle>
              {selectedMessages.length > 0 && (
                <Button onClick={handleApproveAll} disabled={sendingMessageIds.size > 0}>
                  <CheckCircle2 className="h-4 w-4 mr-2" />
                  Approve All ({selectedMessages.length})
                </Button>
              )}
            </div>
          </CardHeader>
          <CardContent className="p-0">
            <Tabs value={selectedClientId || undefined} onValueChange={setSelectedClientId}>
              {/* Client Tab Headers */}
              <div className="border-b px-6 pt-6">
                <TabsList className="grid w-full gap-2" style={{ gridTemplateColumns: `repeat(${Math.min(clients.length, 5)}, 1fr)` }}>
                  {clients.slice(0, 5).map(client => (
                    <TabsTrigger key={client.id} value={client.id} className="relative">
                      {client.photo_url && (
                        <img
                          src={client.photo_url}
                          alt={client.name}
                          className="h-6 w-6 rounded-full mr-2 object-cover"
                        />
                      )}
                      {client.name}
                      <Badge variant="secondary" className="ml-2">
                        {client.count}
                      </Badge>
                    </TabsTrigger>
                  ))}
                </TabsList>
              </div>

              {/* Tab Content */}
              {clients.map(client => (
                <TabsContent key={client.id} value={client.id} className="m-0 p-6 space-y-6">
                  {/* Campaign Info */}
                  {client.campaignId && (
                    <div className="flex items-center gap-2 p-3 bg-blue-50 dark:bg-blue-900/20 rounded-lg border border-blue-200 dark:border-blue-800">
                      <AlertCircle className="h-4 w-4 text-blue-600" />
                      <span className="text-sm font-medium">
                        Campaign: {client.campaignId}
                      </span>
                      <span className="text-sm text-muted-foreground">
                        ({client.count} pending)
                      </span>
                    </div>
                  )}

                  {/* Message Cards */}
                  <div className="space-y-4">
                    {selectedMessages.map(message => (
                      <MessageCard
                        key={message.id}
                        message={message}
                        onEdit={() => setEditingMessage(message)}
                        onPreview={() => setPreviewMessage(message)}
                        onApprove={() => handleApproveAndSend(message)}
                        onDelete={() => deleteMutation.mutate(message.id)}
                        isSending={sendingMessageIds.has(message.id)}
                      />
                    ))}
                  </div>
                </TabsContent>
              ))}
            </Tabs>
          </CardContent>
        </Card>
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

      {/* Preview Modal */}
      <Dialog open={!!previewMessage} onOpenChange={() => setPreviewMessage(null)}>
        <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Email Preview</DialogTitle>
          </DialogHeader>
          {previewMessage && (
            <div className="space-y-4">
              <div className="space-y-2 p-4 bg-muted rounded-lg">
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">To:</span>
                  <span>{previewMessage.host_email}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Subject:</span>
                  <span className="font-medium">{previewMessage.subject_line}</span>
                </div>
              </div>
              <div className="p-4 border rounded-lg whitespace-pre-wrap text-sm">
                {previewMessage.email_body}
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  )
}

// Message Card Component
interface MessageCardProps {
  message: OutreachMessageWithClient
  onEdit: () => void
  onPreview: () => void
  onApprove: () => void
  onDelete: () => void
  isSending: boolean
}

function MessageCard({ message, onEdit, onPreview, onApprove, onDelete, isSending }: MessageCardProps) {
  return (
    <div className="border rounded-lg p-4 hover:shadow-md transition-shadow">
      <div className="flex items-start justify-between gap-4 mb-3">
        <div className="flex-1">
          <div className="flex items-center gap-2 mb-1">
            <Mail className="h-4 w-4 text-muted-foreground" />
            <span className="font-medium">{message.podcast_name}</span>
            <Badge variant="outline" className="text-xs">
              {message.status.replace('_', ' ')}
            </Badge>
          </div>
          <div className="text-sm text-muted-foreground">
            To: {message.host_name} ({message.host_email})
          </div>
        </div>
      </div>

      <div className="mb-3">
        <div className="text-sm font-medium mb-1">Subject: {message.subject_line}</div>
        <div className="p-3 bg-muted/30 rounded-lg text-sm text-muted-foreground">
          {message.email_body.slice(0, 150)}...
        </div>
      </div>

      <div className="flex items-center gap-2">
        <Button size="sm" variant="outline" onClick={onEdit}>
          <Edit className="h-4 w-4 mr-1" />
          Edit
        </Button>
        <Button size="sm" variant="outline" onClick={onPreview}>
          <Eye className="h-4 w-4 mr-1" />
          Preview
        </Button>
        <Button
          size="sm"
          onClick={onApprove}
          disabled={isSending}
          className="bg-green-600 hover:bg-green-700"
        >
          {isSending ? (
            <>
              <Loader2 className="h-4 w-4 mr-1 animate-spin" />
              Sending...
            </>
          ) : (
            <>
              <Send className="h-4 w-4 mr-1" />
              Approve & Send
            </>
          )}
        </Button>
        <Button size="sm" variant="ghost" onClick={onDelete}>
          <Trash2 className="h-4 w-4" />
        </Button>
      </div>
    </div>
  )
}
