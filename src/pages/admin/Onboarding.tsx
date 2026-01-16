import { useState, useEffect } from 'react'
import { DashboardLayout } from '@/components/admin/DashboardLayout'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Separator } from '@/components/ui/separator'
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet'
import { VisuallyHidden } from '@radix-ui/react-visually-hidden'
import { ScrollArea } from '@/components/ui/scroll-area'
import {
  ClipboardList,
  Search,
  Calendar,
  Loader2,
  Eye,
  User,
  Briefcase,
  Target,
  Mail,
  Globe,
  Users as UsersIcon
} from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { toast } from 'sonner'
import { formatDistanceToNow } from 'date-fns'

interface OnboardingData {
  name: string
  title: string
  company: string
  website: string
  email: string
  bio: string
  expertise: string[]
  previousPodcasts: string
  compellingStory: string
  uniqueJourney: string
  topicsConfident: string[]
  passions: string
  socialFollowers: string
  audienceValue: string
  impact: string
  personalStories: string
  hobbies: string
  idealAudience: string
  goals: string[]
  specificPodcasts: string
  keyMessages: string[]
  specificAngles: string
  futureVision: string
  availability: string
  calendarLink: string
  additionalInfo: string
}

interface Client {
  id: string
  name: string
  email: string
  bio: string
  notes: string
  linkedin_url: string | null
  website: string | null
  calendar_link: string | null
  photo_url: string | null
  created_at: string
  status: string
}

export default function Onboarding() {
  const [clients, setClients] = useState<Client[]>([])
  const [loading, setLoading] = useState(true)
  const [searchQuery, setSearchQuery] = useState('')
  const [selectedClient, setSelectedClient] = useState<Client | null>(null)
  const [parsedData, setParsedData] = useState<Partial<OnboardingData> | null>(null)

  useEffect(() => {
    fetchClients()
  }, [])

  const fetchClients = async () => {
    setLoading(true)
    try {
      const { data, error } = await supabase
        .from('clients')
        .select('*')
        .order('created_at', { ascending: false })

      if (error) throw error

      // Filter clients that have onboarding data in notes
      const clientsWithOnboarding = (data || []).filter(client =>
        client.notes?.includes('=== ONBOARDING INFORMATION ===')
      )

      setClients(clientsWithOnboarding)
    } catch (error) {
      console.error('Error fetching clients:', error)
      toast.error('Failed to load onboarding submissions')
    } finally {
      setLoading(false)
    }
  }

  const parseOnboardingData = (notes: string): Partial<OnboardingData> => {
    const data: Partial<OnboardingData> = {}

    // Extract goals
    const goalsMatch = notes.match(/Goals: (.+)/)
    if (goalsMatch) {
      data.goals = goalsMatch[1].split(', ')
    }

    // Extract ideal audience
    const audienceMatch = notes.match(/Ideal Audience: (.+)/)
    if (audienceMatch) {
      data.idealAudience = audienceMatch[1]
    }

    // Extract social followers
    const followersMatch = notes.match(/Social Followers: (.+)/)
    if (followersMatch) {
      data.socialFollowers = followersMatch[1]
    }

    // Extract previous podcasts
    const podcastsMatch = notes.match(/Previous Podcasts: (.+)/)
    if (podcastsMatch) {
      data.previousPodcasts = podcastsMatch[1]
    }

    // Extract specific podcasts
    const specificMatch = notes.match(/Specific Podcasts: (.+)/)
    if (specificMatch) {
      data.specificPodcasts = specificMatch[1]
    }

    // Extract availability
    const availMatch = notes.match(/Availability: (.+)/)
    if (availMatch) {
      data.availability = availMatch[1]
    }

    // Extract expertise
    const expertiseMatch = notes.match(/Expertise: (.+)/)
    if (expertiseMatch) {
      data.expertise = expertiseMatch[1].split(', ')
    }

    // Extract compelling story
    const storyMatch = notes.match(/Compelling Story:\n(.+?)(?=\n\n|What Makes|$)/s)
    if (storyMatch) {
      data.compellingStory = storyMatch[1].trim()
    }

    // Extract what makes them unique
    const uniqueMatch = notes.match(/What Makes Them Unique:\n(.+?)(?=\n\n|Topics Confident|$)/s)
    if (uniqueMatch) {
      data.uniqueJourney = uniqueMatch[1].trim()
    }

    // Extract topics
    const topicsMatch = notes.match(/Topics Confident Speaking About: (.+)/)
    if (topicsMatch) {
      data.topicsConfident = topicsMatch[1].split(', ')
    }

    // Extract passions
    const passionsMatch = notes.match(/Passions:\n(.+?)(?=\n\n|Value to|$)/s)
    if (passionsMatch) {
      data.passions = passionsMatch[1].trim()
    }

    // Extract value to audiences
    const valueMatch = notes.match(/Value to Audiences:\n(.+?)(?=\n\n|Personal Stories|$)/s)
    if (valueMatch) {
      data.audienceValue = valueMatch[1].trim()
    }

    // Extract personal stories
    const personalMatch = notes.match(/Personal Stories:\n(.+?)(?=\n\n|Hobbies|$)/s)
    if (personalMatch) {
      data.personalStories = personalMatch[1].trim()
    }

    // Extract hobbies
    const hobbiesMatch = notes.match(/Hobbies:\n(.+?)(?=\n\n|Future Vision|$)/s)
    if (hobbiesMatch) {
      data.hobbies = hobbiesMatch[1].trim()
    }

    // Extract future vision
    const visionMatch = notes.match(/Future Vision:\n(.+?)(?=\n\n|Specific Angles|$)/s)
    if (visionMatch) {
      data.futureVision = visionMatch[1].trim()
    }

    // Extract specific angles
    const anglesMatch = notes.match(/Specific Angles:\n(.+?)(?=\n\n|Additional Info|$)/s)
    if (anglesMatch) {
      data.specificAngles = anglesMatch[1].trim()
    }

    // Extract additional info
    const additionalMatch = notes.match(/Additional Info:\n(.+?)$/s)
    if (additionalMatch) {
      data.additionalInfo = additionalMatch[1].trim()
    }

    return data
  }

  const handleViewClient = (client: Client) => {
    setSelectedClient(client)
    const parsed = parseOnboardingData(client.notes || '')
    setParsedData(parsed)
  }

  const filteredClients = clients.filter(client =>
    client.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    client.email.toLowerCase().includes(searchQuery.toLowerCase()) ||
    client.company?.toLowerCase().includes(searchQuery.toLowerCase())
  )

  return (
    <DashboardLayout>
      <div className="space-y-6">
        {/* Header */}
        <div>
          <h1 className="text-3xl font-bold flex items-center gap-3">
            <ClipboardList className="h-8 w-8" />
            Onboarding Submissions
          </h1>
          <p className="text-muted-foreground mt-2">
            View and manage client onboarding responses
          </p>
        </div>

        {/* Search */}
        <div className="flex items-center gap-4">
          <div className="relative flex-1 max-w-md">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search by name, email, or company..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-10"
            />
          </div>
          <Button variant="outline" onClick={fetchClients}>
            <Loader2 className={`h-4 w-4 mr-2 ${loading ? 'animate-spin' : ''}`} />
            Refresh
          </Button>
        </div>

        {/* Stats */}
        <div className="grid gap-4 md:grid-cols-3">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium">Total Submissions</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{clients.length}</div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium">This Month</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">
                {clients.filter(c => {
                  const date = new Date(c.created_at)
                  const now = new Date()
                  return date.getMonth() === now.getMonth() && date.getFullYear() === now.getFullYear()
                }).length}
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium">This Week</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">
                {clients.filter(c => {
                  const date = new Date(c.created_at)
                  const now = new Date()
                  const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000)
                  return date >= weekAgo
                }).length}
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Clients List */}
        {loading ? (
          <Card>
            <CardContent className="flex items-center justify-center py-12">
              <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            </CardContent>
          </Card>
        ) : filteredClients.length === 0 ? (
          <Card>
            <CardContent className="flex flex-col items-center justify-center py-12 text-center">
              <ClipboardList className="h-12 w-12 text-muted-foreground mb-4" />
              <p className="text-lg font-medium">No onboarding submissions found</p>
              <p className="text-sm text-muted-foreground mt-2">
                {searchQuery ? 'Try adjusting your search' : 'Submissions will appear here when clients complete onboarding'}
              </p>
            </CardContent>
          </Card>
        ) : (
          <div className="grid gap-4">
            {filteredClients.map((client) => {
              const parsed = parseOnboardingData(client.notes || '')
              return (
                <Card key={client.id} className="hover:border-primary/50 transition-colors">
                  <CardHeader>
                    <div className="flex items-start justify-between">
                      <div className="space-y-1">
                        <CardTitle className="flex items-center gap-2">
                          <User className="h-5 w-5" />
                          {client.name}
                        </CardTitle>
                        <CardDescription className="space-y-1">
                          <div className="flex items-center gap-2">
                            <Mail className="h-3 w-3" />
                            {client.email}
                          </div>
                          {client.website && (
                            <div className="flex items-center gap-2">
                              <Globe className="h-3 w-3" />
                              {client.website}
                            </div>
                          )}
                        </CardDescription>
                      </div>
                      <div className="flex items-center gap-2">
                        <Badge variant="secondary">
                          <Calendar className="h-3 w-3 mr-1" />
                          {formatDistanceToNow(new Date(client.created_at), { addSuffix: true })}
                        </Badge>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => handleViewClient(client)}
                        >
                          <Eye className="h-4 w-4 mr-2" />
                          View Details
                        </Button>
                      </div>
                    </div>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-3">
                      {parsed.goals && parsed.goals.length > 0 && (
                        <div>
                          <p className="text-sm font-medium mb-1">Goals:</p>
                          <div className="flex flex-wrap gap-1">
                            {parsed.goals.map((goal, i) => (
                              <Badge key={i} variant="outline">{goal}</Badge>
                            ))}
                          </div>
                        </div>
                      )}
                      {parsed.expertise && parsed.expertise.length > 0 && (
                        <div>
                          <p className="text-sm font-medium mb-1">Expertise:</p>
                          <div className="flex flex-wrap gap-1">
                            {parsed.expertise.slice(0, 5).map((exp, i) => (
                              <Badge key={i} variant="secondary">{exp}</Badge>
                            ))}
                            {parsed.expertise.length > 5 && (
                              <Badge variant="secondary">+{parsed.expertise.length - 5} more</Badge>
                            )}
                          </div>
                        </div>
                      )}
                    </div>
                  </CardContent>
                </Card>
              )
            })}
          </div>
        )}
      </div>

      {/* Detail Sheet */}
      <Sheet open={!!selectedClient} onOpenChange={(open) => !open && setSelectedClient(null)}>
        <SheetContent side="right" className="w-full sm:max-w-2xl overflow-y-auto">
          <VisuallyHidden>
            <SheetTitle>Client Onboarding Details</SheetTitle>
          </VisuallyHidden>
          <SheetHeader>
            <div className="space-y-4">
              {selectedClient?.photo_url && (
                <div className="flex justify-center">
                  <img
                    src={selectedClient.photo_url}
                    alt={`${selectedClient.name} headshot`}
                    className="w-24 h-24 rounded-full object-cover border-4 border-primary/20"
                  />
                </div>
              )}
              <div className="space-y-2">
                <h2 className="text-2xl font-bold">{selectedClient?.name}</h2>
                <div className="space-y-1 text-sm text-muted-foreground">
                  <div className="flex items-center gap-2">
                    <Mail className="h-4 w-4" />
                    {selectedClient?.email}
                  </div>
                  {selectedClient?.website && (
                    <div className="flex items-center gap-2">
                      <Globe className="h-4 w-4" />
                      <a href={selectedClient.website} target="_blank" rel="noopener noreferrer" className="hover:underline">
                        {selectedClient.website}
                      </a>
                    </div>
                  )}
                  <div className="flex items-center gap-2">
                    <Calendar className="h-4 w-4" />
                    Submitted {selectedClient && formatDistanceToNow(new Date(selectedClient.created_at), { addSuffix: true })}
                  </div>
                </div>
              </div>
            </div>
          </SheetHeader>

          <ScrollArea className="h-[calc(100vh-200px)] pr-4">
            <div className="space-y-6 mt-6">
              {/* Bio */}
              <div>
                <h3 className="font-semibold flex items-center gap-2 mb-2">
                  <User className="h-4 w-4" />
                  Professional Bio
                </h3>
                <p className="text-sm whitespace-pre-wrap bg-muted p-3 rounded-lg">
                  {selectedClient?.bio}
                </p>
              </div>

              <Separator />

              {/* Goals & Audience */}
              {parsedData?.goals && (
                <div>
                  <h3 className="font-semibold flex items-center gap-2 mb-2">
                    <Target className="h-4 w-4" />
                    Goals
                  </h3>
                  <div className="flex flex-wrap gap-2">
                    {parsedData.goals.map((goal, i) => (
                      <Badge key={i}>{goal}</Badge>
                    ))}
                  </div>
                </div>
              )}

              {parsedData?.idealAudience && (
                <div>
                  <h3 className="font-semibold mb-2">Ideal Audience</h3>
                  <p className="text-sm text-muted-foreground">{parsedData.idealAudience}</p>
                </div>
              )}

              <Separator />

              {/* Expertise & Topics */}
              {parsedData?.expertise && (
                <div>
                  <h3 className="font-semibold flex items-center gap-2 mb-2">
                    <Briefcase className="h-4 w-4" />
                    Areas of Expertise
                  </h3>
                  <div className="flex flex-wrap gap-2">
                    {parsedData.expertise.map((exp, i) => (
                      <Badge key={i} variant="secondary">{exp}</Badge>
                    ))}
                  </div>
                </div>
              )}

              {parsedData?.topicsConfident && (
                <div>
                  <h3 className="font-semibold mb-2">Topics Confident Speaking About</h3>
                  <div className="flex flex-wrap gap-2">
                    {parsedData.topicsConfident.map((topic, i) => (
                      <Badge key={i} variant="outline">{topic}</Badge>
                    ))}
                  </div>
                </div>
              )}

              <Separator />

              {/* Story */}
              {parsedData?.compellingStory && (
                <div>
                  <h3 className="font-semibold mb-2">Compelling Story</h3>
                  <p className="text-sm whitespace-pre-wrap bg-muted p-3 rounded-lg">
                    {parsedData.compellingStory}
                  </p>
                </div>
              )}

              {parsedData?.uniqueJourney && (
                <div>
                  <h3 className="font-semibold mb-2">What Makes Them Unique</h3>
                  <p className="text-sm whitespace-pre-wrap bg-muted p-3 rounded-lg">
                    {parsedData.uniqueJourney}
                  </p>
                </div>
              )}

              <Separator />

              {/* Passions & Hobbies */}
              {parsedData?.passions && (
                <div>
                  <h3 className="font-semibold mb-2">Passions</h3>
                  <p className="text-sm text-muted-foreground whitespace-pre-wrap">
                    {parsedData.passions}
                  </p>
                </div>
              )}

              {parsedData?.hobbies && (
                <div>
                  <h3 className="font-semibold mb-2">Hobbies & Interests</h3>
                  <p className="text-sm text-muted-foreground whitespace-pre-wrap">
                    {parsedData.hobbies}
                  </p>
                </div>
              )}

              <Separator />

              {/* Value & Impact */}
              {parsedData?.audienceValue && (
                <div>
                  <h3 className="font-semibold mb-2">Value to Audiences</h3>
                  <p className="text-sm text-muted-foreground whitespace-pre-wrap">
                    {parsedData.audienceValue}
                  </p>
                </div>
              )}

              {parsedData?.personalStories && (
                <div>
                  <h3 className="font-semibold mb-2">Personal Stories</h3>
                  <p className="text-sm text-muted-foreground whitespace-pre-wrap">
                    {parsedData.personalStories}
                  </p>
                </div>
              )}

              <Separator />

              {/* Logistics */}
              {parsedData?.socialFollowers && (
                <div>
                  <h3 className="font-semibold flex items-center gap-2 mb-2">
                    <UsersIcon className="h-4 w-4" />
                    Social Media Following
                  </h3>
                  <p className="text-sm text-muted-foreground">{parsedData.socialFollowers}</p>
                </div>
              )}

              {parsedData?.previousPodcasts && (
                <div>
                  <h3 className="font-semibold mb-2">Previous Podcast Appearances</h3>
                  <p className="text-sm text-muted-foreground">{parsedData.previousPodcasts}</p>
                </div>
              )}

              {parsedData?.specificPodcasts && parsedData.specificPodcasts !== 'N/A' && (
                <div>
                  <h3 className="font-semibold mb-2">Specific Podcasts Interested In</h3>
                  <p className="text-sm text-muted-foreground">{parsedData.specificPodcasts}</p>
                </div>
              )}

              {parsedData?.availability && (
                <div>
                  <h3 className="font-semibold mb-2">Recording Availability</h3>
                  <p className="text-sm text-muted-foreground">{parsedData.availability}</p>
                </div>
              )}

              {selectedClient?.calendar_link && (
                <div>
                  <h3 className="font-semibold mb-2">Calendar Link</h3>
                  <a
                    href={selectedClient.calendar_link}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-sm text-primary hover:underline"
                  >
                    {selectedClient.calendar_link}
                  </a>
                </div>
              )}

              <Separator />

              {/* Additional Info */}
              {parsedData?.futureVision && (
                <div>
                  <h3 className="font-semibold mb-2">Future Vision</h3>
                  <p className="text-sm text-muted-foreground whitespace-pre-wrap">
                    {parsedData.futureVision}
                  </p>
                </div>
              )}

              {parsedData?.specificAngles && (
                <div>
                  <h3 className="font-semibold mb-2">Specific Angles</h3>
                  <p className="text-sm text-muted-foreground whitespace-pre-wrap">
                    {parsedData.specificAngles}
                  </p>
                </div>
              )}

              {parsedData?.additionalInfo && (
                <div>
                  <h3 className="font-semibold mb-2">Additional Information</h3>
                  <p className="text-sm text-muted-foreground whitespace-pre-wrap">
                    {parsedData.additionalInfo}
                  </p>
                </div>
              )}
            </div>
          </ScrollArea>
        </SheetContent>
      </Sheet>
    </DashboardLayout>
  )
}
