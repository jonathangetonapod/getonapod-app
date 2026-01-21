import { useState, useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Progress } from '@/components/ui/progress'
import { Badge } from '@/components/ui/badge'
import {
  ArrowRight,
  ArrowLeft,
  User,
  Briefcase,
  Target,
  Sparkles,
  CheckCircle2,
  Upload,
  Mail,
  Calendar,
  Key,
  ExternalLink,
  Loader2,
  Copy,
  Star,
  TrendingUp,
  Check,
  Quote
} from 'lucide-react'
import { toast } from 'sonner'
import confetti from 'canvas-confetti'

interface OnboardingData {
  // Basic Information
  name: string
  title: string
  company: string
  website: string
  bio: string

  // Expertise
  expertise: string[]

  // Media & Story
  previousPodcasts: string
  compellingStory: string
  uniqueJourney: string

  // Topics & Passion
  topicsConfident: string[]
  passions: string

  // Social & Contact
  socialFollowers: string
  email: string

  // Value Proposition
  audienceValue: string
  impact: string
  personalStories: string
  hobbies: string

  // Target & Goals
  idealAudience: string
  goals: string[]
  specificPodcasts: string

  // Key Messages
  keyMessages: string[]
  specificAngles: string
  futureVision: string

  // Logistics
  availability: string
  calendarLink: string
  additionalInfo: string

  // Headshot
  headshotFile: File | null
}

const initialData: OnboardingData = {
  name: '',
  title: '',
  company: '',
  website: '',
  bio: '',
  expertise: [],
  previousPodcasts: '',
  compellingStory: '',
  uniqueJourney: '',
  topicsConfident: [],
  passions: '',
  socialFollowers: '',
  email: '',
  audienceValue: '',
  impact: '',
  personalStories: '',
  hobbies: '',
  idealAudience: '',
  goals: [],
  specificPodcasts: '',
  keyMessages: [],
  specificAngles: '',
  futureVision: '',
  availability: '',
  calendarLink: '',
  additionalInfo: '',
  headshotFile: null
}

const expertiseOptions = [
  'Copywriting', 'Marketing', 'Psychology', 'Advertising Strategy',
  'Communications', 'Marketing Funnels', 'Growth', 'PR (public relations)',
  'Sales', 'Branding', 'Social Media', 'SEO', 'Content Marketing'
]

const topicOptions = [
  'Marketing', 'Copywriting', 'PR', 'Psychology', 'Advertising',
  'Strategic Communication', 'Branding', 'Lead Generation', 'Sales Process',
  'Conversion Rate Optimization', 'Entrepreneurship', 'Startups'
]

const goalOptions = [
  'Brand Awareness', 'Client Acquisition', 'Promotion', 'Thought Leadership',
  'Network Building', 'Product Launch', 'Authority Building'
]

const testimonials = [
  {
    name: 'Sarah Chen',
    title: 'CEO at TechFlow',
    quote: 'Get On A Pod secured me 12 podcast appearances in 3 months. My brand visibility skyrocketed!',
    image: 'https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=100&h=100&fit=crop'
  },
  {
    name: 'Michael Rodriguez',
    title: 'Marketing Director',
    quote: 'The team made the entire process seamless. I went from unknown to industry thought leader.',
    image: 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=100&h=100&fit=crop'
  },
  {
    name: 'Emily Thompson',
    title: 'Founder & Author',
    quote: 'Best investment I made for my personal brand. The ROI has been incredible.',
    image: 'https://images.unsplash.com/photo-1438761681033-6461ffad8d80?w=100&h=100&fit=crop'
  }
]

const stats = [
  { label: 'Clients Booked', value: '500+' },
  { label: 'Podcast Placements', value: '2,500+' },
  { label: 'Success Rate', value: '94%' }
]

const STORAGE_KEY = 'onboarding_draft'
const STORAGE_STEP_KEY = 'onboarding_step'

export default function Onboarding() {
  const navigate = useNavigate()
  const [step, setStep] = useState(1)
  const [data, setData] = useState<OnboardingData>(initialData)
  const [loading, setLoading] = useState(false)
  const [accountCreated, setAccountCreated] = useState(false)
  const [accountDetails, setAccountDetails] = useState<any>(null)
  const [completedSteps, setCompletedSteps] = useState<Set<number>>(new Set())
  const [isAnimating, setIsAnimating] = useState(false)
  const [direction, setDirection] = useState<'forward' | 'backward'>('forward')
  const cardRef = useRef<HTMLDivElement>(null)

  const totalSteps = 6
  const progress = (step / totalSteps) * 100

  // Load saved progress from localStorage on mount
  useEffect(() => {
    try {
      const savedData = localStorage.getItem(STORAGE_KEY)
      const savedStep = localStorage.getItem(STORAGE_STEP_KEY)

      if (savedData) {
        const parsed = JSON.parse(savedData)
        setData(parsed)
        toast.info('Welcome back! Your progress has been restored.')
      }

      if (savedStep) {
        setStep(parseInt(savedStep, 10))
      }
    } catch (error) {
      console.error('Error loading saved progress:', error)
    }
  }, [])

  // Auto-save data to localStorage whenever it changes
  useEffect(() => {
    try {
      // Don't save if account is already created
      if (accountCreated) return

      // Don't save if data is still initial (prevents saving empty form)
      if (JSON.stringify(data) === JSON.stringify(initialData)) return

      localStorage.setItem(STORAGE_KEY, JSON.stringify(data))
      localStorage.setItem(STORAGE_STEP_KEY, step.toString())
    } catch (error) {
      console.error('Error saving progress:', error)
    }
  }, [data, step, accountCreated])

  // Clear saved progress after successful account creation
  const clearSavedProgress = () => {
    try {
      localStorage.removeItem(STORAGE_KEY)
      localStorage.removeItem(STORAGE_STEP_KEY)
    } catch (error) {
      console.error('Error clearing saved progress:', error)
    }
  }

  const updateData = (field: keyof OnboardingData, value: any) => {
    setData(prev => ({ ...prev, [field]: value }))
  }

  const toggleArrayItem = (field: keyof OnboardingData, item: string) => {
    const currentArray = data[field] as string[]
    if (currentArray.includes(item)) {
      updateData(field, currentArray.filter(i => i !== item))
    } else {
      updateData(field, [...currentArray, item])
    }
  }

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) {
      if (file.size > 5 * 1024 * 1024) {
        toast.error('File size must be less than 5MB')
        return
      }
      updateData('headshotFile', file)
      toast.success('Headshot uploaded!')
    }
  }

  const validateStep = () => {
    switch (step) {
      case 1:
        if (!data.name || !data.email || !data.company) {
          toast.error('Please fill in all required fields')
          return false
        }
        // Validate email
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
        if (!emailRegex.test(data.email)) {
          toast.error('Please enter a valid email address')
          return false
        }
        break
      case 2:
        if (!data.bio || data.expertise.length === 0) {
          toast.error('Please complete your professional profile')
          return false
        }
        break
      case 3:
        if (!data.compellingStory || !data.uniqueJourney) {
          toast.error('Please share your story')
          return false
        }
        break
      case 4:
        if (data.topicsConfident.length === 0 || !data.passions) {
          toast.error('Please tell us about your expertise and passions')
          return false
        }
        break
      case 5:
        if (!data.idealAudience || data.goals.length === 0) {
          toast.error('Please define your target and goals')
          return false
        }
        break
    }
    return true
  }

  const nextStep = () => {
    if (validateStep()) {
      // Mark current step as completed
      setCompletedSteps(prev => new Set([...prev, step]))

      // Animate transition
      setDirection('forward')
      setIsAnimating(true)

      // Small celebration for completing step
      if (step < totalSteps) {
        confetti({
          particleCount: 30,
          spread: 60,
          origin: { y: 0.6 },
          colors: ['#8B5CF6', '#EC4899', '#F59E0B']
        })
      }

      setTimeout(() => {
        setStep(prev => Math.min(prev + 1, totalSteps))
        setIsAnimating(false)

        // Scroll to top of card
        cardRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
      }, 300)
    }
  }

  const prevStep = () => {
    setDirection('backward')
    setIsAnimating(true)

    setTimeout(() => {
      setStep(prev => Math.max(prev - 1, 1))
      setIsAnimating(false)

      // Scroll to top of card
      cardRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
    }, 300)
  }

  const handleSubmit = async () => {
    if (!validateStep()) return

    setLoading(true)

    try {
      // Convert headshot to base64 if provided
      let headshotBase64: string | undefined
      let headshotFilename: string | undefined
      let headshotContentType: string | undefined

      if (data.headshotFile) {
        try {
          const reader = new FileReader()
          headshotBase64 = await new Promise<string>((resolve, reject) => {
            reader.onload = () => resolve(reader.result as string)
            reader.onerror = reject
            reader.readAsDataURL(data.headshotFile!)
          })
          headshotFilename = data.headshotFile.name
          headshotContentType = data.headshotFile.type
        } catch (fileError) {
          console.error('Error reading headshot file:', fileError)
          toast.error('Failed to process headshot image')
        }
      }

      // Generate AI bio from all the onboarding information
      toast.info('Generating your professional bio...')

      const bioResponse = await fetch(
        'https://ysjwveqnwjysldpfqzov.supabase.co/functions/v1/generate-client-bio',
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            name: data.name,
            title: data.title,
            company: data.company,
            bio: data.bio,
            expertise: data.expertise,
            compellingStory: data.compellingStory,
            uniqueJourney: data.uniqueJourney,
            topicsConfident: data.topicsConfident,
            passions: data.passions,
            audienceValue: data.audienceValue,
            personalStories: data.personalStories,
            hobbies: data.hobbies,
            futureVision: data.futureVision,
            specificAngles: data.specificAngles,
            idealAudience: data.idealAudience,
            goals: data.goals,
            socialFollowers: data.socialFollowers,
            previousPodcasts: data.previousPodcasts,
          }),
        }
      )

      if (!bioResponse.ok) {
        console.error('Bio generation failed, using original bio')
      }

      const bioData = await bioResponse.json()
      const generatedBio = bioData.bio || data.bio

      // Store additional context in notes
      const detailedNotes = `=== ONBOARDING INFORMATION ===

Goals: ${data.goals.join(', ')}
Ideal Audience: ${data.idealAudience}
Social Followers: ${data.socialFollowers}
Previous Podcasts: ${data.previousPodcasts || 'None'}
Specific Podcasts: ${data.specificPodcasts || 'N/A'}
Availability: ${data.availability}

=== DETAILED RESPONSES ===

Expertise: ${data.expertise.join(', ')}

Compelling Story:
${data.compellingStory}

What Makes Them Unique:
${data.uniqueJourney}

Topics Confident Speaking About: ${data.topicsConfident.join(', ')}

Passions:
${data.passions}

${data.audienceValue ? `Value to Audiences:\n${data.audienceValue}\n` : ''}
${data.personalStories ? `Personal Stories:\n${data.personalStories}\n` : ''}
${data.hobbies ? `Hobbies:\n${data.hobbies}\n` : ''}
${data.futureVision ? `Future Vision:\n${data.futureVision}\n` : ''}
${data.specificAngles ? `Specific Angles:\n${data.specificAngles}\n` : ''}
${data.additionalInfo ? `Additional Info:\n${data.additionalInfo}` : ''}`

      // Generate a simple password for immediate login
      const generatedPassword = `GetOnAPod${Math.floor(Math.random() * 10000)}!`

      // Create client account via API
      toast.info('Creating your account...')

      const response = await fetch(
        'https://ysjwveqnwjysldpfqzov.supabase.co/functions/v1/create-client-account',
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            name: data.name,
            email: data.email,
            bio: generatedBio,
            linkedin_url: data.linkedin_url || undefined,
            website: data.website,
            calendar_link: data.calendarLink || undefined,
            contact_person: data.name,
            notes: detailedNotes,
            status: 'active',
            enable_portal_access: true,
            password: generatedPassword,
            send_invitation_email: true,
            create_google_sheet: true,
            headshot_base64: headshotBase64,
            headshot_filename: headshotFilename,
            headshot_content_type: headshotContentType,
          }),
        }
      )

      if (!response.ok) {
        const error = await response.json()
        throw new Error(error.error || 'Failed to create account')
      }

      const result = await response.json()
      setAccountDetails(result.client)
      setAccountCreated(true)
      clearSavedProgress()
      toast.success('Your account has been created!')

      // Big celebration!
      const duration = 3000
      const animationEnd = Date.now() + duration
      const defaults = { startVelocity: 30, spread: 360, ticks: 60, zIndex: 0 }

      const randomInRange = (min: number, max: number) => Math.random() * (max - min) + min

      const interval = setInterval(() => {
        const timeLeft = animationEnd - Date.now()

        if (timeLeft <= 0) {
          return clearInterval(interval)
        }

        const particleCount = 50 * (timeLeft / duration)

        confetti({
          ...defaults,
          particleCount,
          origin: { x: randomInRange(0.1, 0.3), y: Math.random() - 0.2 },
          colors: ['#8B5CF6', '#EC4899', '#F59E0B', '#10B981']
        })
        confetti({
          ...defaults,
          particleCount,
          origin: { x: randomInRange(0.7, 0.9), y: Math.random() - 0.2 },
          colors: ['#8B5CF6', '#EC4899', '#F59E0B', '#10B981']
        })
      }, 250)

      // Show warning if Google Sheet creation failed
      if (result.google_sheet_error) {
        console.error('Google Sheet creation error:', result.google_sheet_error)
        toast.error(`Google Sheet creation failed: ${result.google_sheet_error}`)
      }

    } catch (error) {
      console.error('Onboarding error:', error)
      toast.error(error instanceof Error ? error.message : 'Something went wrong. Your progress has been saved - you can try again.')
      // Progress is automatically saved via useEffect
    } finally {
      setLoading(false)
    }
  }

  if (accountCreated && accountDetails) {
    return (
      <div className="min-h-screen relative overflow-hidden bg-gradient-to-br from-purple-100 via-pink-50 to-purple-50 dark:from-gray-900 dark:via-purple-900/20 dark:to-gray-900 py-12 px-4">
        {/* Animated Background Elements */}
        <div className="absolute inset-0 overflow-hidden pointer-events-none">
          <div className="absolute top-20 left-10 w-72 h-72 bg-purple-300/30 dark:bg-purple-500/10 rounded-full blur-3xl animate-pulse" />
          <div className="absolute top-40 right-10 w-96 h-96 bg-pink-300/30 dark:bg-pink-500/10 rounded-full blur-3xl animate-pulse delay-1000" />
          <div className="absolute bottom-20 left-1/3 w-80 h-80 bg-green-300/30 dark:bg-green-500/10 rounded-full blur-3xl animate-pulse delay-2000" />
        </div>

        <div className="max-w-4xl mx-auto relative z-10">
          <div className="text-center mb-12 animate-fade-in">
            <div className="inline-flex items-center justify-center w-24 h-24 bg-gradient-to-r from-green-400 to-emerald-500 rounded-full mb-6 shadow-2xl animate-bounce">
              <CheckCircle2 className="h-14 w-14 text-white" />
            </div>
            <h1 className="text-5xl md:text-6xl font-bold mb-4 bg-gradient-to-r from-purple-600 via-pink-600 to-purple-600 bg-clip-text text-transparent">
              Welcome to Get On A Pod! 🎉
            </h1>
            <p className="text-2xl md:text-3xl font-semibold text-gray-700 dark:text-gray-300">
              Your account is ready. Here's everything you need to get started.
            </p>
          </div>

          {/* Testimonials Section */}
          <div className="mb-12 animate-fade-in delay-100">
            <h2 className="text-2xl font-bold text-center mb-6 text-gray-800 dark:text-gray-200">
              Join Our Successful Clients
            </h2>
            <div className="grid md:grid-cols-3 gap-6">
              {testimonials.map((testimonial, index) => (
                <div
                  key={index}
                  className="backdrop-blur-xl bg-white/70 dark:bg-gray-900/70 border border-white/50 dark:border-gray-700/50 rounded-xl p-6 shadow-lg hover:scale-105 transition-transform duration-300"
                >
                  <div className="flex items-center gap-3 mb-4">
                    <img
                      src={testimonial.image}
                      alt={testimonial.name}
                      className="w-12 h-12 rounded-full object-cover"
                    />
                    <div>
                      <p className="font-semibold text-gray-900 dark:text-gray-100">{testimonial.name}</p>
                      <p className="text-xs text-muted-foreground">{testimonial.title}</p>
                    </div>
                  </div>
                  <Quote className="h-8 w-8 text-purple-400 mb-2" />
                  <p className="text-sm text-gray-700 dark:text-gray-300 italic">
                    "{testimonial.quote}"
                  </p>
                </div>
              ))}
            </div>
          </div>

          <div className="space-y-6">
            {/* Portal Access */}
            <Card className="backdrop-blur-xl bg-white/70 dark:bg-gray-900/70 border-2 border-purple-200 dark:border-purple-800 shadow-xl">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Key className="h-5 w-5 text-purple-600" />
                  Your Portal Access
                </CardTitle>
                <CardDescription>
                  Access your bookings, outreach list, and track your podcast journey
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div>
                  <Label className="text-xs text-muted-foreground">Portal URL</Label>
                  <div className="flex items-center gap-2 mt-1">
                    <Input value={accountDetails.portal_url} readOnly className="font-mono text-sm" />
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        navigator.clipboard.writeText(accountDetails.portal_url)
                        toast.success('Portal URL copied!')
                      }}
                    >
                      <Copy className="h-4 w-4" />
                    </Button>
                  </div>
                </div>

                {/* Login Credentials */}
                <div className="bg-gradient-to-r from-green-50 to-emerald-50 dark:from-green-950/20 dark:to-emerald-950/20 border-2 border-green-200 dark:border-green-800 rounded-lg p-4">
                  <p className="text-sm font-semibold text-green-900 dark:text-green-100 mb-3">
                    🔑 Your Login Credentials
                  </p>
                  <div className="space-y-3">
                    <div>
                      <Label className="text-xs text-green-700 dark:text-green-300">Email</Label>
                      <div className="flex items-center gap-2 mt-1">
                        <Input
                          value={accountDetails.email}
                          readOnly
                          className="bg-white dark:bg-gray-800 border-green-200 dark:border-green-800"
                        />
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => {
                            navigator.clipboard.writeText(accountDetails.email)
                            toast.success('Email copied!')
                          }}
                        >
                          <Copy className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                    {accountDetails.password && (
                      <div>
                        <Label className="text-xs text-green-700 dark:text-green-300">Password</Label>
                        <div className="flex items-center gap-2 mt-1">
                          <Input
                            value={accountDetails.password}
                            readOnly
                            className="bg-white dark:bg-gray-800 border-green-200 dark:border-green-800 font-mono"
                          />
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => {
                              navigator.clipboard.writeText(accountDetails.password)
                              toast.success('Password copied!')
                            }}
                          >
                            <Copy className="h-4 w-4" />
                          </Button>
                        </div>
                      </div>
                    )}
                  </div>
                  <p className="text-xs text-green-700 dark:text-green-300 mt-3">
                    💡 Save these credentials - you'll need them to log in to your client portal
                  </p>
                </div>

                <Button
                  className="w-full"
                  size="lg"
                  onClick={() => window.open(accountDetails.portal_url, '_blank')}
                >
                  <ExternalLink className="mr-2 h-5 w-5" />
                  Login to Your Portal Now
                </Button>
              </CardContent>
            </Card>

            {/* Podcast Approval Dashboard */}
            {accountDetails.dashboard_url && (
              <Card className="backdrop-blur-xl bg-white/70 dark:bg-gray-900/70 border-2 border-pink-200 dark:border-pink-800 shadow-xl">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Mic className="h-5 w-5 text-pink-600" />
                    Your Podcast Approval Dashboard
                  </CardTitle>
                  <CardDescription>
                    Review and approve podcasts before we pitch you
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div>
                    <Label className="text-xs text-muted-foreground">Dashboard URL</Label>
                    <div className="flex items-center gap-2 mt-1">
                      <Input value={accountDetails.dashboard_url} readOnly className="font-mono text-sm" />
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => {
                          navigator.clipboard.writeText(accountDetails.dashboard_url)
                          toast.success('Dashboard URL copied!')
                        }}
                      >
                        <Copy className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>

                  <div className="bg-gradient-to-r from-pink-50 to-purple-50 dark:from-pink-950/20 dark:to-purple-950/20 border-2 border-pink-200 dark:border-pink-800 rounded-lg p-4">
                    <p className="text-sm font-semibold text-pink-900 dark:text-pink-100 mb-2">
                      🎯 What is this?
                    </p>
                    <p className="text-xs text-pink-700 dark:text-pink-300 mb-3">
                      We'll curate a personalized list of podcasts that are perfect for you. Use this dashboard to review them and let us know which ones you'd like us to pitch you to. You can approve or reject podcasts, and we'll only reach out to the ones you approve!
                    </p>
                    <p className="text-xs text-pink-700 dark:text-pink-300">
                      💡 This link is unique to you and doesn't require a login - save it for easy access
                    </p>
                  </div>

                  <Button
                    className="w-full bg-gradient-to-r from-pink-500 to-purple-500 hover:from-pink-600 hover:to-purple-600"
                    size="lg"
                    onClick={() => window.open(accountDetails.dashboard_url, '_blank')}
                  >
                    <ExternalLink className="mr-2 h-5 w-5" />
                    View Your Approval Dashboard
                  </Button>
                </CardContent>
              </Card>
            )}

            {/* Next Steps */}
            <Card className="backdrop-blur-xl bg-white/70 dark:bg-gray-900/70 border border-white/50 dark:border-gray-700/50 shadow-xl">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Sparkles className="h-5 w-5 text-yellow-600" />
                  What Happens Next?
                </CardTitle>
              </CardHeader>
              <CardContent>
                <ol className="space-y-4">
                  <li className="flex items-start gap-3">
                    <div className="flex items-center justify-center w-8 h-8 rounded-full bg-purple-100 dark:bg-purple-900/20 text-purple-600 dark:text-purple-400 font-bold flex-shrink-0">
                      1
                    </div>
                    <div>
                      <p className="font-medium">We Review Your Profile</p>
                      <p className="text-sm text-muted-foreground">
                        Our team will review your information and identify the best podcast opportunities for you
                      </p>
                    </div>
                  </li>
                  <li className="flex items-start gap-3">
                    <div className="flex items-center justify-center w-8 h-8 rounded-full bg-purple-100 dark:bg-purple-900/20 text-purple-600 dark:text-purple-400 font-bold flex-shrink-0">
                      2
                    </div>
                    <div>
                      <p className="font-medium">We Start Outreach</p>
                      <p className="text-sm text-muted-foreground">
                        We'll pitch you to relevant podcasts and track all opportunities in your Google Sheet
                      </p>
                    </div>
                  </li>
                  <li className="flex items-start gap-3">
                    <div className="flex items-center justify-center w-8 h-8 rounded-full bg-purple-100 dark:bg-purple-900/20 text-purple-600 dark:text-purple-400 font-bold flex-shrink-0">
                      3
                    </div>
                    <div>
                      <p className="font-medium">You Get Booked</p>
                      <p className="text-sm text-muted-foreground">
                        Track all your bookings, recording dates, and published episodes in your portal
                      </p>
                    </div>
                  </li>
                  <li className="flex items-start gap-3">
                    <div className="flex items-center justify-center w-8 h-8 rounded-full bg-purple-100 dark:bg-purple-900/20 text-purple-600 dark:text-purple-400 font-bold flex-shrink-0">
                      4
                    </div>
                    <div>
                      <p className="font-medium">Build Your Authority</p>
                      <p className="text-sm text-muted-foreground">
                        Grow your brand, reach new audiences, and establish yourself as a thought leader
                      </p>
                    </div>
                  </li>
                </ol>
              </CardContent>
            </Card>

            {/* CTA Buttons */}
            <div className="flex flex-col gap-3 sm:gap-4">
              <Button
                className="w-full py-6 text-base font-semibold bg-gradient-to-r from-purple-500 to-pink-500 hover:from-purple-600 hover:to-pink-600 hover:scale-105 transition-all shadow-lg"
                onClick={() => window.open(accountDetails.portal_url, '_blank')}
              >
                <ExternalLink className="mr-2 h-5 w-5" />
                Access Your Portal
              </Button>
              <Button
                variant="outline"
                className="w-full py-6 text-base font-semibold hover:scale-105 transition-transform"
                onClick={() => navigate('/')}
              >
                Back to Home
              </Button>
            </div>

            {/* Contact Info */}
            <Card className="backdrop-blur-xl bg-gradient-to-r from-purple-100/70 to-pink-100/70 dark:from-purple-950/50 dark:to-pink-950/50 border-purple-200 dark:border-purple-800 shadow-xl">
              <CardContent className="pt-6">
                <p className="text-center text-sm text-muted-foreground">
                  Questions? Email us at{' '}
                  <a href="mailto:jonathan@getonapod.com" className="text-purple-600 dark:text-purple-400 hover:underline font-medium">
                    jonathan@getonapod.com
                  </a>
                </p>
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen relative overflow-hidden bg-gradient-to-br from-purple-100 via-pink-50 to-purple-50 dark:from-gray-900 dark:via-purple-900/20 dark:to-gray-900 py-12 px-4">
      {/* Animated Background Elements */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-20 left-10 w-72 h-72 bg-purple-300/30 dark:bg-purple-500/10 rounded-full blur-3xl animate-pulse" />
        <div className="absolute top-40 right-10 w-96 h-96 bg-pink-300/30 dark:bg-pink-500/10 rounded-full blur-3xl animate-pulse delay-1000" />
        <div className="absolute bottom-20 left-1/3 w-80 h-80 bg-yellow-300/20 dark:bg-yellow-500/10 rounded-full blur-3xl animate-pulse delay-2000" />
      </div>

      <div className="max-w-4xl mx-auto relative z-10">
        {/* Header with improved typography */}
        <div className="text-center mb-8 sm:mb-12 animate-fade-in px-4">
          <div className="inline-block mb-4">
            <Badge className="text-xs sm:text-sm px-3 sm:px-4 py-2 bg-gradient-to-r from-purple-500 to-pink-500 hover:from-purple-600 hover:to-pink-600 transition-all duration-300 shadow-lg">
              <Star className="h-3 w-3 sm:h-4 sm:w-4 mr-1 sm:mr-2 inline" />
              Join 500+ Successful Guests
            </Badge>
          </div>
          <h1 className="text-4xl sm:text-5xl md:text-6xl font-bold mb-3 sm:mb-4 bg-gradient-to-r from-purple-600 via-pink-600 to-purple-600 bg-clip-text text-transparent px-2">
            Get On A Pod
          </h1>
          <p className="text-xl sm:text-2xl md:text-3xl font-semibold text-gray-700 dark:text-gray-300 mb-2 px-2">
            Let's get you on amazing podcasts
          </p>
          <p className="text-sm sm:text-base text-muted-foreground flex items-center justify-center gap-2 flex-wrap">
            <span className="flex items-center gap-1">
              <TrendingUp className="h-4 w-4" />
              10-15 minutes
            </span>
            <span className="hidden sm:inline">•</span>
            <span>Auto-saves progress</span>
          </p>
        </div>

        {/* Social Proof Stats */}
        <div className="grid grid-cols-3 gap-2 sm:gap-4 mb-10 animate-fade-in delay-100">
          {stats.map((stat, index) => (
            <div
              key={index}
              className="text-center p-3 sm:p-4 rounded-xl bg-white/50 dark:bg-gray-800/50 backdrop-blur-sm border border-white/50 dark:border-gray-700/50 hover:scale-105 transition-transform duration-300 shadow-sm"
            >
              <div className="text-xl sm:text-2xl md:text-3xl font-bold bg-gradient-to-r from-purple-600 to-pink-600 bg-clip-text text-transparent">
                {stat.value}
              </div>
              <div className="text-[10px] sm:text-xs md:text-sm text-muted-foreground font-medium mt-1">
                {stat.label}
              </div>
            </div>
          ))}
        </div>

        {/* Progress with enhanced visual design */}
        <div className="mb-8 animate-fade-in delay-200">
          <div className="flex items-center justify-between mb-3">
            <span className="text-sm font-semibold text-gray-700 dark:text-gray-300">
              Step {step} of {totalSteps}
            </span>
            <span className="text-sm font-medium text-purple-600 dark:text-purple-400">
              {Math.round(progress)}% Complete
            </span>
          </div>
          <Progress value={progress} className="h-3 shadow-sm" />

          {/* Enhanced Step Navigation Dots with Checkmarks */}
          <div className="flex items-center justify-center gap-2 sm:gap-3 mt-6">
            {Array.from({ length: totalSteps }, (_, i) => i + 1).map((stepNum) => {
              const isCompleted = completedSteps.has(stepNum)
              const isCurrent = stepNum === step

              return (
                <button
                  key={stepNum}
                  onClick={() => setStep(stepNum)}
                  className={`relative w-8 h-8 sm:w-10 sm:h-10 rounded-full flex items-center justify-center text-xs sm:text-sm font-bold transition-all duration-300 ${
                    isCurrent
                      ? 'bg-gradient-to-r from-purple-500 to-pink-500 text-white scale-110 sm:scale-125 shadow-lg ring-2 sm:ring-4 ring-purple-200 dark:ring-purple-800'
                      : isCompleted
                      ? 'bg-gradient-to-r from-green-500 to-emerald-500 text-white hover:scale-110 shadow-md'
                      : 'bg-white/70 dark:bg-gray-800/70 text-gray-400 hover:bg-white dark:hover:bg-gray-800 hover:scale-105 shadow-sm'
                  }`}
                  title={`${isCompleted ? '✓ Completed' : isCurrent ? 'Current' : 'Go to'} step ${stepNum}`}
                >
                  {isCompleted ? (
                    <Check className="h-4 w-4 sm:h-5 sm:w-5" />
                  ) : (
                    stepNum
                  )}
                </button>
              )
            })}
          </div>
        </div>

        {/* Glassmorphism Form Card */}
        <Card
          ref={cardRef}
          className={`backdrop-blur-xl bg-white/70 dark:bg-gray-900/70 border-white/50 dark:border-gray-700/50 shadow-2xl transition-all duration-300 ${
            isAnimating ? (direction === 'forward' ? 'opacity-0 translate-x-8' : 'opacity-0 -translate-x-8') : 'opacity-100 translate-x-0'
          }`}
        >
          <CardHeader className="space-y-3 pb-6 sm:pb-8 px-4 sm:px-6">
            <CardTitle className="flex items-center gap-2 sm:gap-3 text-xl sm:text-2xl md:text-3xl">
              {step === 1 && <><User className="h-6 w-6 sm:h-7 sm:w-7 text-purple-500" /> Basic Information</>}
              {step === 2 && <><Briefcase className="h-6 w-6 sm:h-7 sm:w-7 text-purple-500" /> Professional Profile</>}
              {step === 3 && <><Sparkles className="h-6 w-6 sm:h-7 sm:w-7 text-purple-500" /> Your Story</>}
              {step === 4 && <><Target className="h-6 w-6 sm:h-7 sm:w-7 text-purple-500" /> Expertise & Topics</>}
              {step === 5 && <><Target className="h-6 w-6 sm:h-7 sm:w-7 text-purple-500" /> Goals & Audience</>}
              {step === 6 && <><Calendar className="h-6 w-6 sm:h-7 sm:w-7 text-purple-500" /> Final Details</>}
            </CardTitle>
            <CardDescription className="text-sm sm:text-base">
              {step === 1 && 'Tell us about yourself and your company'}
              {step === 2 && 'Share your professional background and expertise'}
              {step === 3 && 'What makes your journey unique and compelling?'}
              {step === 4 && 'What topics are you passionate about discussing?'}
              {step === 5 && 'Who do you want to reach and what are your goals?'}
              {step === 6 && 'A few more details to complete your profile'}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-5 sm:space-y-6 px-4 sm:px-6">
            {/* Step 1: Basic Information */}
            {step === 1 && (
              <>
                <div className="grid grid-cols-2 gap-3 sm:gap-4">
                  <div className="col-span-2 sm:col-span-1">
                    <Label htmlFor="name" className="text-sm font-semibold mb-2 block">Full Name *</Label>
                    <Input
                      id="name"
                      placeholder="John Doe"
                      value={data.name}
                      onChange={(e) => updateData('name', e.target.value)}
                      className="h-11 text-base"
                    />
                  </div>
                  <div className="col-span-2 sm:col-span-1">
                    <Label htmlFor="title" className="text-sm font-semibold mb-2 block">Title/Role</Label>
                    <Input
                      id="title"
                      placeholder="CEO, Founder, CMO"
                      value={data.title}
                      onChange={(e) => updateData('title', e.target.value)}
                      className="h-11 text-base"
                    />
                  </div>
                </div>

                <div>
                  <Label htmlFor="email" className="text-sm font-semibold mb-2 block">Email Address *</Label>
                  <Input
                    id="email"
                    type="email"
                    placeholder="you@company.com"
                    value={data.email}
                    onChange={(e) => updateData('email', e.target.value)}
                    className="h-11 text-base"
                  />
                </div>

                <div>
                  <Label htmlFor="company" className="text-sm font-semibold mb-2 block">Company/Organization Name *</Label>
                  <Input
                    id="company"
                    placeholder="Your Company Inc."
                    value={data.company}
                    onChange={(e) => updateData('company', e.target.value)}
                    className="h-11 text-base"
                  />
                </div>

                <div>
                  <Label htmlFor="website" className="text-sm font-semibold mb-2 block">Website URL</Label>
                  <Input
                    id="website"
                    type="url"
                    placeholder="https://yourcompany.com"
                    value={data.website}
                    onChange={(e) => updateData('website', e.target.value)}
                    className="h-11 text-base"
                  />
                </div>

                <div>
                  <Label htmlFor="socialFollowers" className="text-sm font-semibold mb-2 block">Social Media Following</Label>
                  <Input
                    id="socialFollowers"
                    placeholder="e.g., 5,000 across platforms"
                    value={data.socialFollowers}
                    onChange={(e) => updateData('socialFollowers', e.target.value)}
                    className="h-11 text-base"
                  />
                </div>
              </>
            )}

            {/* Step 2: Professional Profile */}
            {step === 2 && (
              <>
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <Label htmlFor="bio" className="text-base font-semibold">Professional Bio *</Label>
                    <span className="text-xs text-muted-foreground">
                      {data.bio.length} characters
                    </span>
                  </div>
                  <Textarea
                    id="bio"
                    placeholder="Tell us about your professional background, key accomplishments, and what you do..."
                    rows={6}
                    value={data.bio}
                    onChange={(e) => updateData('bio', e.target.value)}
                    className="resize-none focus:ring-2 focus:ring-purple-500 transition-all text-base"
                  />
                  <p className="text-xs text-muted-foreground mt-1">
                    💡 This will be used to pitch you to podcasts - make it compelling!
                  </p>
                </div>

                <div>
                  <Label className="text-base font-semibold">Areas of Expertise * (select all that apply)</Label>
                  <div className="flex flex-wrap gap-2 mt-3">
                    {expertiseOptions.map((option) => (
                      <Badge
                        key={option}
                        variant={data.expertise.includes(option) ? 'default' : 'outline'}
                        className={`cursor-pointer transition-all duration-200 ${
                          data.expertise.includes(option)
                            ? 'bg-gradient-to-r from-purple-500 to-pink-500 hover:from-purple-600 hover:to-pink-600 shadow-md hover:shadow-lg scale-105'
                            : 'hover:scale-105 hover:border-purple-400 hover:bg-purple-50 dark:hover:bg-purple-950'
                        }`}
                        onClick={() => toggleArrayItem('expertise', option)}
                      >
                        {data.expertise.includes(option) && <Check className="h-3 w-3 mr-1" />}
                        {option}
                      </Badge>
                    ))}
                  </div>
                </div>

                <div>
                  <Label htmlFor="linkedin_url" className="text-sm font-semibold mb-2 block">LinkedIn Profile URL</Label>
                  <Input
                    id="linkedin_url"
                    type="url"
                    placeholder="https://linkedin.com/in/yourname"
                    value={data.linkedin_url}
                    onChange={(e) => updateData('linkedin_url', e.target.value)}
                    className="h-11 text-base"
                  />
                </div>

                <div>
                  <Label htmlFor="previousPodcasts" className="text-sm font-semibold mb-2 block">Previous Podcast/Media Appearances</Label>
                  <Textarea
                    id="previousPodcasts"
                    placeholder="List any podcasts or media outlets you've been featured on (or write 'None')"
                    rows={3}
                    value={data.previousPodcasts}
                    onChange={(e) => updateData('previousPodcasts', e.target.value)}
                    className="resize-none focus:ring-2 focus:ring-purple-500 transition-all text-base"
                  />
                </div>
              </>
            )}

            {/* Step 3: Your Story */}
            {step === 3 && (
              <>
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <Label htmlFor="compellingStory" className="text-base font-semibold">Share a Compelling Story *</Label>
                    <span className="text-xs text-muted-foreground">
                      {data.compellingStory.length} characters
                    </span>
                  </div>
                  <Textarea
                    id="compellingStory"
                    placeholder="Share a compelling story from your personal or professional life that would engage a podcast audience..."
                    rows={6}
                    value={data.compellingStory}
                    onChange={(e) => updateData('compellingStory', e.target.value)}
                    className="resize-none focus:ring-2 focus:ring-purple-500 transition-all"
                  />
                  <p className="text-xs text-muted-foreground mt-1">
                    💡 Share challenges you've overcome, pivotal moments, or unique insights
                  </p>
                </div>

                <div>
                  <div className="flex items-center justify-between mb-2">
                    <Label htmlFor="uniqueJourney" className="text-base font-semibold">What Makes You Unique? *</Label>
                    <span className="text-xs text-muted-foreground">
                      {data.uniqueJourney.length} characters
                    </span>
                  </div>
                  <Textarea
                    id="uniqueJourney"
                    placeholder="What makes your journey or experience different from others in your industry?"
                    rows={5}
                    value={data.uniqueJourney}
                    onChange={(e) => updateData('uniqueJourney', e.target.value)}
                    className="resize-none focus:ring-2 focus:ring-purple-500 transition-all"
                  />
                </div>

                <div>
                  <Label htmlFor="personalStories" className="text-sm font-semibold mb-2 block">Additional Personal Stories</Label>
                  <Textarea
                    id="personalStories"
                    placeholder="Any other personal stories or experiences you're open to sharing?"
                    rows={4}
                    value={data.personalStories}
                    onChange={(e) => updateData('personalStories', e.target.value)}
                    className="resize-none focus:ring-2 focus:ring-purple-500 transition-all text-base"
                  />
                </div>
              </>
            )}

            {/* Step 4: Expertise & Topics */}
            {step === 4 && (
              <>
                <div>
                  <Label className="text-base font-semibold">Topics You're Confident Speaking About * (select all that apply)</Label>
                  <div className="flex flex-wrap gap-2 mt-3">
                    {topicOptions.map((option) => (
                      <Badge
                        key={option}
                        variant={data.topicsConfident.includes(option) ? 'default' : 'outline'}
                        className={`cursor-pointer transition-all duration-200 ${
                          data.topicsConfident.includes(option)
                            ? 'bg-gradient-to-r from-purple-500 to-pink-500 hover:from-purple-600 hover:to-pink-600 shadow-md hover:shadow-lg scale-105'
                            : 'hover:scale-105 hover:border-purple-400 hover:bg-purple-50 dark:hover:bg-purple-950'
                        }`}
                        onClick={() => toggleArrayItem('topicsConfident', option)}
                      >
                        {data.topicsConfident.includes(option) && <Check className="h-3 w-3 mr-1" />}
                        {option}
                      </Badge>
                    ))}
                  </div>
                </div>

                <div>
                  <Label htmlFor="passions" className="text-sm font-semibold mb-2 block">What Are You Most Passionate About? *</Label>
                  <Textarea
                    id="passions"
                    placeholder="What drives you in your personal or professional life?"
                    rows={4}
                    value={data.passions}
                    onChange={(e) => updateData('passions', e.target.value)}
                    className="resize-none focus:ring-2 focus:ring-purple-500 transition-all text-base"
                  />
                </div>

                <div>
                  <Label htmlFor="hobbies" className="text-sm font-semibold mb-2 block">Hobbies or Interests Outside of Work</Label>
                  <Textarea
                    id="hobbies"
                    placeholder="What do you enjoy discussing outside of your professional work?"
                    rows={3}
                    value={data.hobbies}
                    onChange={(e) => updateData('hobbies', e.target.value)}
                    className="resize-none focus:ring-2 focus:ring-purple-500 transition-all text-base"
                  />
                </div>

                <div>
                  <Label htmlFor="audienceValue" className="text-sm font-semibold mb-2 block">Value You Provide to Audiences</Label>
                  <Textarea
                    id="audienceValue"
                    placeholder="How can your experience and insights provide value to a podcast audience?"
                    rows={4}
                    value={data.audienceValue}
                    onChange={(e) => updateData('audienceValue', e.target.value)}
                    className="resize-none focus:ring-2 focus:ring-purple-500 transition-all text-base"
                  />
                </div>
              </>
            )}

            {/* Step 5: Goals & Audience */}
            {step === 5 && (
              <>
                <div>
                  <Label htmlFor="idealAudience" className="text-sm font-semibold mb-2 block">Your Ideal Audience *</Label>
                  <Textarea
                    id="idealAudience"
                    placeholder="Who is your ideal audience or customer base?"
                    rows={3}
                    value={data.idealAudience}
                    onChange={(e) => updateData('idealAudience', e.target.value)}
                    className="resize-none focus:ring-2 focus:ring-purple-500 transition-all text-base"
                  />
                </div>

                <div>
                  <Label className="text-base font-semibold">Your Goals for Getting on Podcasts * (select all that apply)</Label>
                  <div className="flex flex-wrap gap-2 mt-3">
                    {goalOptions.map((option) => (
                      <Badge
                        key={option}
                        variant={data.goals.includes(option) ? 'default' : 'outline'}
                        className={`cursor-pointer transition-all duration-200 ${
                          data.goals.includes(option)
                            ? 'bg-gradient-to-r from-purple-500 to-pink-500 hover:from-purple-600 hover:to-pink-600 shadow-md hover:shadow-lg scale-105'
                            : 'hover:scale-105 hover:border-purple-400 hover:bg-purple-50 dark:hover:bg-purple-950'
                        }`}
                        onClick={() => toggleArrayItem('goals', option)}
                      >
                        {data.goals.includes(option) && <Check className="h-3 w-3 mr-1" />}
                        {option}
                      </Badge>
                    ))}
                  </div>
                </div>

                <div>
                  <Label htmlFor="impact" className="text-sm font-semibold mb-2 block">Impact You Want to Make</Label>
                  <Textarea
                    id="impact"
                    placeholder="What impact can you make by sharing your story on podcasts?"
                    rows={4}
                    value={data.impact}
                    onChange={(e) => updateData('impact', e.target.value)}
                    className="resize-none focus:ring-2 focus:ring-purple-500 transition-all text-base"
                  />
                </div>

                <div>
                  <Label htmlFor="specificPodcasts" className="text-sm font-semibold mb-2 block">Specific Podcasts You're Interested In</Label>
                  <Textarea
                    id="specificPodcasts"
                    placeholder="Are there any specific podcasts you'd like to be a guest on?"
                    rows={3}
                    value={data.specificPodcasts}
                    onChange={(e) => updateData('specificPodcasts', e.target.value)}
                    className="resize-none focus:ring-2 focus:ring-purple-500 transition-all text-base"
                  />
                </div>

                <div>
                  <Label htmlFor="specificAngles" className="text-sm font-semibold mb-2 block">Specific Angles or Insights</Label>
                  <Textarea
                    id="specificAngles"
                    placeholder="Any specific angles or insights you'd like to share that would be valuable to audiences?"
                    rows={4}
                    value={data.specificAngles}
                    onChange={(e) => updateData('specificAngles', e.target.value)}
                    className="resize-none focus:ring-2 focus:ring-purple-500 transition-all text-base"
                  />
                </div>
              </>
            )}

            {/* Step 6: Final Details */}
            {step === 6 && (
              <>
                <div>
                  <Label htmlFor="futureVision" className="text-sm font-semibold mb-2 block">Future Vision</Label>
                  <Textarea
                    id="futureVision"
                    placeholder="How do you see your work evolving in the next few years?"
                    rows={4}
                    value={data.futureVision}
                    onChange={(e) => updateData('futureVision', e.target.value)}
                    className="resize-none focus:ring-2 focus:ring-purple-500 transition-all text-base"
                  />
                </div>

                <div>
                  <Label htmlFor="availability" className="text-sm font-semibold mb-2 block">Recording Availability</Label>
                  <Input
                    id="availability"
                    placeholder="e.g., Weekdays after 10am EST"
                    value={data.availability}
                    onChange={(e) => updateData('availability', e.target.value)}
                    className="h-11 text-base"
                  />
                </div>

                <div>
                  <Label htmlFor="calendarLink" className="text-sm font-semibold mb-2 block">Calendar Link (Calendly, etc.)</Label>
                  <Input
                    id="calendarLink"
                    type="url"
                    placeholder="https://calendly.com/yourname"
                    value={data.calendarLink}
                    onChange={(e) => updateData('calendarLink', e.target.value)}
                    className="h-11 text-base"
                  />
                </div>

                <div>
                  <Label htmlFor="headshot">Professional Headshot</Label>
                  <div className="mt-2">
                    <Input
                      id="headshot"
                      type="file"
                      accept="image/*"
                      onChange={handleFileChange}
                      className="cursor-pointer"
                    />
                    {data.headshotFile && (
                      <p className="text-sm text-green-600 dark:text-green-400 mt-2 flex items-center gap-2">
                        <CheckCircle2 className="h-4 w-4" />
                        {data.headshotFile.name}
                      </p>
                    )}
                  </div>
                  <p className="text-xs text-muted-foreground mt-1">
                    Upload a professional photo (max 5MB)
                  </p>
                </div>

                <div>
                  <Label htmlFor="additionalInfo" className="text-sm font-semibold mb-2 block">Anything Else We Should Know?</Label>
                  <Textarea
                    id="additionalInfo"
                    placeholder="Any additional information that would help us pitch you effectively..."
                    rows={4}
                    value={data.additionalInfo}
                    onChange={(e) => updateData('additionalInfo', e.target.value)}
                    className="resize-none focus:ring-2 focus:ring-purple-500 transition-all text-base"
                  />
                </div>
              </>
            )}

            {/* Navigation Buttons */}
            <div className="flex flex-col sm:flex-row justify-between pt-8 gap-3 sm:gap-4">
              <Button
                variant="outline"
                onClick={prevStep}
                disabled={step === 1 || loading}
                className="w-full sm:w-auto px-6 py-5 sm:py-6 text-sm sm:text-base font-semibold hover:scale-105 transition-transform disabled:opacity-50 order-2 sm:order-1"
              >
                <ArrowLeft className="mr-2 h-4 w-4 sm:h-5 sm:w-5" />
                Back
              </Button>

              {step < totalSteps ? (
                <Button
                  onClick={nextStep}
                  disabled={loading}
                  className="w-full sm:w-auto px-8 py-5 sm:py-6 text-sm sm:text-base font-semibold bg-gradient-to-r from-purple-500 to-pink-500 hover:from-purple-600 hover:to-pink-600 hover:scale-105 transition-all shadow-lg order-1 sm:order-2"
                >
                  Next
                  <ArrowRight className="ml-2 h-4 w-4 sm:h-5 sm:w-5" />
                </Button>
              ) : (
                <Button
                  onClick={handleSubmit}
                  disabled={loading}
                  className="w-full sm:w-auto px-8 py-5 sm:py-6 text-sm sm:text-base font-semibold bg-gradient-to-r from-green-500 to-emerald-500 hover:from-green-600 hover:to-emerald-600 hover:scale-105 transition-all shadow-lg order-1 sm:order-2"
                >
                  {loading ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 sm:h-5 sm:w-5 animate-spin" />
                      Creating Your Account...
                    </>
                  ) : (
                    <>
                      Complete Setup
                      <CheckCircle2 className="ml-2 h-4 w-4 sm:h-5 sm:w-5" />
                    </>
                  )}
                </Button>
              )}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
