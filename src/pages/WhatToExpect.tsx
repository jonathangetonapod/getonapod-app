import { Helmet } from 'react-helmet-async';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import Navbar from '@/components/Navbar';
import Footer from '@/components/Footer';
import {
  CheckCircle2,
  Calendar,
  FileText,
  Mic,
  BarChart3,
  ArrowRight,
  Sparkles,
  MessageSquare,
  Send,
  Headphones,
  LayoutDashboard,
  ThumbsUp,
  Bell,
  PlayCircle,
  BookOpen
} from 'lucide-react';

const steps = [
  {
    number: "01",
    title: "Shortlist Strategy Call",
    duration: "Day 1",
    icon: Calendar,
    description: "We start with a short call to align on your expertise, buyer, goals, and the kinds of shows worth targeting.",
    details: [
      "Clarify your expertise and strongest angles",
      "Define the buyer you want to reach",
      "Set goals for guest appearances",
      "Pressure-test fit before anything starts"
    ]
  },
  {
    number: "02",
    title: "Portal Access",
    duration: "Day 1",
    icon: LayoutDashboard,
    description: "You get access to your client portal right away so you can review approvals, statuses, resources, and campaign updates in one place.",
    details: [
      "Review targets and campaign status live",
      "Track every podcast opportunity in one place",
      "Access guest resources and guides",
      "See updates without asking for them"
    ]
  },
  {
    number: "03",
    title: "Guest Profile Creation",
    duration: "Day 2-3",
    icon: FileText,
    description: "We build a clear guest profile with the background, topics, and positioning a host needs to quickly understand why you are worth booking.",
    details: [
      "Your background and credentials",
      "Core talking points and topics",
      "Clear reasons you are a strong guest",
      "A simple format hosts can scan fast"
    ]
  },
  {
    number: "04",
    title: "Target Show Shortlist",
    duration: "Week 1",
    icon: ThumbsUp,
    description: "We research a shortlist of podcasts that fit your expertise and buyer. You approve or reject each show before any outreach starts.",
    details: [
      "Hand-picked shows based on fit, not vanity",
      "You approve every podcast target",
      "Reject anything that feels off-brand",
      "Nothing gets pitched without your OK"
    ]
  },
  {
    number: "05",
    title: "Outreach Approval",
    duration: "Week 1-2",
    icon: MessageSquare,
    description: "We write outreach around your angle and the show, then you review it before anything is sent on your behalf.",
    details: [
      "Custom pitch direction for each show",
      "You review the messaging before we send",
      "Adjust tone and talking points if needed",
      "Keep control over your voice"
    ]
  },
  {
    number: "06",
    title: "Host Outreach Starts",
    duration: "After Approvals",
    icon: Send,
    description: "Once targets and messaging are approved, we start outreach and follow-up. Your portal updates as conversations move forward.",
    details: [
      "Personalized outreach to each host",
      "Follow-up sequences included",
      "Portal updates as replies come in",
      "Clear visibility when a show is in motion"
    ]
  },
  {
    number: "07",
    title: "Booking Confirmed",
    duration: "As They Come In",
    icon: Mic,
    description: "As soon as a host confirms, you are notified. We handle the scheduling details and keep the booking moving.",
    details: [
      "Notification as soon as a booking lands",
      "Calendar coordination handled for you",
      "All details stored in your portal",
      "Less inbox back-and-forth on your side"
    ]
  },
  {
    number: "08",
    title: "Guest Prep Kit",
    duration: "Before Recording",
    icon: Headphones,
    description: "Pro clients receive a prep kit before each recording so you can show up informed, sharp, and ready to lead a strong conversation.",
    details: [
      "Podcast background research",
      "Notes on the host's interview style",
      "Suggested talking points",
      "Common questions to expect"
    ],
    proBadge: true
  },
  {
    number: "09",
    title: "Recording Reminders",
    duration: "Recording Day",
    icon: Bell,
    description: "We remind you when a recording is coming up so you are prepared and not scrambling at the last minute.",
    details: [
      "Reminder before recording",
      "Technical setup checklist",
      "Last-minute prep tips",
      "You can focus on the conversation"
    ]
  },
  {
    number: "10",
    title: "Episode Goes Live",
    duration: "When Published",
    icon: PlayCircle,
    description: "When your episode publishes, we notify you and share the links so you can amplify the appearance quickly.",
    details: [
      "Notified when the episode publishes",
      "Episode links delivered in one place",
      "Easy to share across channels",
      "Portal updated with the live appearance"
    ]
  },
  {
    number: "11",
    title: "Ongoing Reporting",
    duration: "Always Available",
    icon: BarChart3,
    description: "Your portal keeps the full record of what was approved, pitched, booked, recorded, and published so you can see campaign momentum over time.",
    details: [
      "Track every live appearance",
      "See the campaign by stage",
      "Review publish history over time",
      "Keep one source of truth for the work"
    ]
  }
];

const WhatToExpect = () => {
  return (
    <div className="min-h-screen bg-background">
      <Helmet>
        <title>What to Expect After You Sign Up | Get On A Pod</title>
        <meta name="description" content="See exactly how Get On A Pod runs a podcast booking campaign, from shortlist call to published episode." />
        <link rel="canonical" href="https://getonapod.com/what-to-expect" />
        <meta property="og:type" content="website" />
        <meta property="og:url" content="https://getonapod.com/what-to-expect" />
        <meta property="og:title" content="What to Expect After You Sign Up | Get On A Pod" />
        <meta property="og:description" content="See exactly how Get On A Pod runs a podcast booking campaign, from shortlist call to published episode." />
        <meta property="og:image" content="https://getonapod.com/og-image.jpg" />
        <meta property="og:site_name" content="Get On A Pod" />
        <meta name="twitter:card" content="summary_large_image" />
        <meta name="twitter:title" content="What to Expect After You Sign Up | Get On A Pod" />
        <meta name="twitter:description" content="See exactly how Get On A Pod runs a podcast booking campaign, from shortlist call to published episode." />
        <meta name="twitter:image" content="https://getonapod.com/og-image.jpg" />
      </Helmet>
      <Navbar />

      {/* Hero Section */}
      <section className="pt-20 pb-8 sm:pt-28 sm:pb-12 md:pt-32 md:pb-16 bg-gradient-to-b from-primary/5 via-purple-500/5 to-transparent">
        <div className="container mx-auto px-4 sm:px-6 text-center">
          <div className="inline-flex items-center gap-1.5 sm:gap-2 px-3 sm:px-4 py-1.5 sm:py-2 rounded-full bg-primary/10 text-primary text-xs sm:text-sm font-medium mb-4 sm:mb-6">
            <Sparkles className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
            How delivery actually works
          </div>

          <h1 className="text-2xl sm:text-3xl md:text-4xl lg:text-5xl xl:text-6xl font-bold text-foreground mb-4 sm:mb-6 px-2">
            What happens after you sign up.
          </h1>

          <p className="text-base sm:text-lg md:text-xl text-muted-foreground max-w-2xl mx-auto mb-6 sm:mb-8 px-2">
            You approve targets and messaging before outreach starts, and you can see the campaign live in your portal from day one.
          </p>

          <div className="flex flex-col sm:flex-row flex-wrap justify-center gap-3 sm:gap-6 md:gap-8 text-xs sm:text-sm text-muted-foreground px-4">
            <div className="flex items-center justify-center gap-2">
              <ThumbsUp className="h-4 w-4 text-primary flex-shrink-0" />
              <span>You approve targets before outreach</span>
            </div>
            <div className="flex items-center justify-center gap-2">
              <LayoutDashboard className="h-4 w-4 text-primary flex-shrink-0" />
              <span>Live portal visibility</span>
            </div>
            <div className="flex items-center justify-center gap-2">
              <Bell className="h-4 w-4 text-primary flex-shrink-0" />
              <span>Updates at every major step</span>
            </div>
          </div>
        </div>
      </section>

      {/* Timeline Section */}
      <section className="py-8 sm:py-12 md:py-20">
        <div className="container mx-auto px-4 sm:px-6">
          <div className="max-w-4xl mx-auto">
            {steps.map((step, index) => (
              <div key={index} className="relative">
                {/* Connector Line */}
                {index < steps.length - 1 && (
                  <div className="absolute left-5 sm:left-6 md:left-8 top-16 sm:top-20 bottom-0 w-0.5 bg-gradient-to-b from-primary/30 to-primary/10" />
                )}

                <div className="flex gap-3 sm:gap-4 md:gap-6 mb-6 sm:mb-8 md:mb-12">
                  {/* Step Number Circle */}
                  <div className="flex-shrink-0 relative z-10">
                    <div className="w-10 h-10 sm:w-12 sm:h-12 md:w-16 md:h-16 rounded-full bg-primary/10 border-2 border-primary flex items-center justify-center">
                      <step.icon className="h-4 w-4 sm:h-5 sm:w-5 md:h-6 md:w-6 text-primary" />
                    </div>
                  </div>

                  {/* Content */}
                  <div className="flex-1 min-w-0 pt-0.5 sm:pt-1">
                    <div className="flex flex-wrap items-center gap-1.5 sm:gap-2 md:gap-3 mb-1.5 sm:mb-2">
                      <span className="text-[10px] sm:text-xs font-bold text-primary bg-primary/10 px-1.5 sm:px-2 py-0.5 rounded">
                        STEP {step.number}
                      </span>
                      <span className="text-[10px] sm:text-xs text-muted-foreground">
                        {step.duration}
                      </span>
                      {step.proBadge && (
                        <span className="text-[10px] sm:text-xs font-medium text-white bg-gradient-to-r from-purple-600 to-pink-600 px-1.5 sm:px-2 py-0.5 rounded">
                          PRO
                        </span>
                      )}
                    </div>

                    <h3 className="text-base sm:text-lg md:text-xl lg:text-2xl font-bold text-foreground mb-1.5 sm:mb-2">
                      {step.title}
                    </h3>

                    <p className="text-sm sm:text-base text-muted-foreground mb-3 sm:mb-4">
                      {step.description}
                    </p>

                    <Card className="bg-muted/30 border-muted">
                      <CardContent className="p-3 sm:p-4">
                        <ul className="grid grid-cols-1 sm:grid-cols-2 gap-1.5 sm:gap-2">
                          {step.details.map((detail, i) => (
                            <li key={i} className="flex items-start gap-1.5 sm:gap-2 text-xs sm:text-sm">
                              <CheckCircle2 className="h-3.5 w-3.5 sm:h-4 sm:w-4 text-green-500 flex-shrink-0 mt-0.5" />
                              <span className="text-muted-foreground">{detail}</span>
                            </li>
                          ))}
                        </ul>
                      </CardContent>
                    </Card>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Key Highlights Section */}
      <section className="py-8 sm:py-12 md:py-16 bg-muted/30">
        <div className="container mx-auto px-4 sm:px-6">
          <div className="max-w-4xl mx-auto">
            <h2 className="text-xl sm:text-2xl md:text-3xl font-bold text-center mb-6 sm:mb-8">
              What this process is built to protect
            </h2>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 sm:gap-6">
              <Card>
                <CardContent className="p-4 sm:p-6 text-center">
                  <div className="w-10 h-10 sm:w-12 sm:h-12 rounded-full bg-primary/10 flex items-center justify-center mx-auto mb-3 sm:mb-4">
                    <ThumbsUp className="h-5 w-5 sm:h-6 sm:w-6 text-primary" />
                  </div>
                  <h3 className="font-semibold text-sm sm:text-base mb-1.5 sm:mb-2">Approval Before Outreach</h3>
                  <p className="text-xs sm:text-sm text-muted-foreground">
                    Podcasts and messaging are reviewed before anything gets sent on your behalf.
                  </p>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="p-4 sm:p-6 text-center">
                  <div className="w-10 h-10 sm:w-12 sm:h-12 rounded-full bg-primary/10 flex items-center justify-center mx-auto mb-3 sm:mb-4">
                    <LayoutDashboard className="h-5 w-5 sm:h-6 sm:w-6 text-primary" />
                  </div>
                  <h3 className="font-semibold text-sm sm:text-base mb-1.5 sm:mb-2">Live Visibility</h3>
                  <p className="text-xs sm:text-sm text-muted-foreground">
                    Your portal shows approvals, outreach, replies, bookings, and publish status in one place.
                  </p>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="p-4 sm:p-6 text-center">
                  <div className="w-10 h-10 sm:w-12 sm:h-12 rounded-full bg-primary/10 flex items-center justify-center mx-auto mb-3 sm:mb-4">
                    <BookOpen className="h-5 w-5 sm:h-6 sm:w-6 text-primary" />
                  </div>
                  <h3 className="font-semibold text-sm sm:text-base mb-1.5 sm:mb-2">Prep Resources Included</h3>
                  <p className="text-xs sm:text-sm text-muted-foreground">
                    You get practical guidance on prep, equipment, and how to show up well when the recording date arrives.
                  </p>
                </CardContent>
              </Card>
            </div>
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="py-10 sm:py-16 md:py-20 bg-gradient-to-b from-transparent via-primary/5 to-primary/10">
        <div className="container mx-auto px-4 sm:px-6 text-center">
          <h2 className="text-xl sm:text-2xl md:text-3xl lg:text-4xl font-bold text-foreground mb-3 sm:mb-4">
            Want to see what this would look like for your market?
          </h2>
          <p className="text-sm sm:text-base text-muted-foreground mb-6 sm:mb-8 max-w-xl mx-auto px-2">
            Book a shortlist call. We will pressure-test fit and show you the kinds of podcasts worth targeting.
          </p>
          <div className="flex flex-col sm:flex-row justify-center gap-3 sm:gap-4">
            <Button size="lg" className="gap-2 min-h-[48px] text-sm sm:text-base" asChild>
              <a href="https://calendly.com/getonapodjg/30min" target="_blank" rel="noopener noreferrer">
                Book My Shortlist Call
                <ArrowRight className="h-4 w-4" />
              </a>
            </Button>
            <Button size="lg" variant="outline" className="min-h-[48px] text-sm sm:text-base" asChild>
              <a href="/#pricing">View Pricing</a>
            </Button>
          </div>
        </div>
      </section>

      <Footer />
    </div>
  );
};

export default WhatToExpect;
