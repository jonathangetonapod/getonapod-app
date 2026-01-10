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
    title: "15-Minute Strategy Call",
    duration: "Day 1",
    icon: Calendar,
    description: "We kick things off with a quick 15-minute strategy call to get aligned on your goals, expertise, and ideal podcast audience.",
    details: [
      "Discuss your background and expertise",
      "Define your target podcast audience",
      "Set goals for your podcast appearances",
      "Answer any questions you have"
    ]
  },
  {
    number: "02",
    title: "Dashboard Access",
    duration: "Day 1",
    icon: LayoutDashboard,
    description: "You get immediate access to your Podcast Command Center — your personal dashboard where you can see all the work we're doing, analytics, and real-time updates.",
    details: [
      "Real-time visibility into our efforts",
      "Track all podcast opportunities",
      "Access to guest resources & guides",
      "Equipment, strategy, and speaking tips"
    ]
  },
  {
    number: "03",
    title: "One-Pager Creation",
    duration: "Day 2-3",
    icon: FileText,
    description: "We create a professional one-pager document with key information about you — your highlights, expertise, and everything a podcast host needs to know.",
    details: [
      "Your background and credentials",
      "Key talking points and topics",
      "What makes you a great guest",
      "Simple, clean text format"
    ]
  },
  {
    number: "04",
    title: "Podcast List for Your Approval",
    duration: "Week 1",
    icon: ThumbsUp,
    description: "We research and curate a list of podcasts perfect for your niche. You review each one and approve or reject — we never reach out without your approval first.",
    details: [
      "Hand-picked shows in your industry",
      "You approve every podcast",
      "Reject any that aren't a fit",
      "Nothing goes out without your OK"
    ]
  },
  {
    number: "05",
    title: "Messaging Approval",
    duration: "Week 1-2",
    icon: MessageSquare,
    description: "We craft personalized outreach messaging for each podcast. You review and approve the messaging before we send anything on your behalf.",
    details: [
      "Custom pitch for each show",
      "You review before we send",
      "Adjust tone and talking points",
      "Full control over your voice"
    ]
  },
  {
    number: "06",
    title: "Outreach Begins",
    duration: "After Approvals",
    icon: Send,
    description: "Once both podcasts AND messaging are approved, we start reaching out. Your dashboard updates in real-time as we coordinate with hosts.",
    details: [
      "Personalized outreach to each host",
      "Follow-up sequences included",
      "Real-time dashboard updates",
      "You'll know when we're in talks"
    ]
  },
  {
    number: "07",
    title: "Booking Confirmed",
    duration: "As They Come In",
    icon: Mic,
    description: "As soon as a podcast confirms, you're notified immediately. We handle all the scheduling logistics and calendar coordination.",
    details: [
      "Instant notification when booked",
      "Calendar coordination handled",
      "All details in your dashboard",
      "No back-and-forth for you"
    ]
  },
  {
    number: "08",
    title: "Guest Prep Kit",
    duration: "Before Recording",
    icon: Headphones,
    description: "Pro clients receive a custom prep kit before each recording with everything you need to deliver an amazing interview.",
    details: [
      "Podcast background research",
      "Host's interview style notes",
      "Suggested talking points",
      "Common questions to expect"
    ],
    proBadge: true
  },
  {
    number: "09",
    title: "Recording Notification",
    duration: "Recording Day",
    icon: Bell,
    description: "We notify you when your recording is coming up so you're prepared and ready to deliver a great conversation.",
    details: [
      "Reminder before recording",
      "Technical setup checklist",
      "Last-minute prep tips",
      "You just show up and talk"
    ]
  },
  {
    number: "10",
    title: "Episode Goes Live",
    duration: "When Published",
    icon: PlayCircle,
    description: "When your episode goes live, we notify you immediately and share all the links so you can promote your appearance.",
    details: [
      "Notified when episode publishes",
      "All episode links shared",
      "Easy to share on social",
      "Dashboard updated with stats"
    ]
  },
  {
    number: "11",
    title: "Content Repurposing",
    duration: "After Episode Airs",
    icon: Sparkles,
    description: "Pro clients get full content repurposing — blog posts and short-form video clips. Everything gets your approval before we publish anything.",
    details: [
      "2 blog posts per episode",
      "Short-form video clips",
      "You approve before publishing",
      "Maximize every appearance"
    ],
    proBadge: true
  },
  {
    number: "12",
    title: "Ongoing Reporting & Analytics",
    duration: "Always Available",
    icon: BarChart3,
    description: "Your dashboard gives you full visibility into how your podcast appearances are performing, with analytics and insights to track your growth.",
    details: [
      "Track all your appearances",
      "See audience reach metrics",
      "Monitor episode performance",
      "Real-time updates always"
    ]
  }
];

const WhatToExpect = () => {
  return (
    <div className="min-h-screen bg-background">
      <Navbar />

      {/* Hero Section */}
      <section className="pt-20 pb-8 sm:pt-28 sm:pb-12 md:pt-32 md:pb-16 bg-gradient-to-b from-primary/5 via-purple-500/5 to-transparent">
        <div className="container mx-auto px-4 sm:px-6 text-center">
          <div className="inline-flex items-center gap-1.5 sm:gap-2 px-3 sm:px-4 py-1.5 sm:py-2 rounded-full bg-primary/10 text-primary text-xs sm:text-sm font-medium mb-4 sm:mb-6">
            <Sparkles className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
            Your Journey With Us
          </div>

          <h1 className="text-2xl sm:text-3xl md:text-4xl lg:text-5xl xl:text-6xl font-bold text-foreground mb-4 sm:mb-6 px-2">
            What Happens After You Sign Up?
          </h1>

          <p className="text-base sm:text-lg md:text-xl text-muted-foreground max-w-2xl mx-auto mb-6 sm:mb-8 px-2">
            Full transparency on our process. You approve everything before it goes out,
            and you have real-time visibility every step of the way.
          </p>

          <div className="flex flex-col sm:flex-row flex-wrap justify-center gap-3 sm:gap-6 md:gap-8 text-xs sm:text-sm text-muted-foreground px-4">
            <div className="flex items-center justify-center gap-2">
              <ThumbsUp className="h-4 w-4 text-primary flex-shrink-0" />
              <span>You approve everything</span>
            </div>
            <div className="flex items-center justify-center gap-2">
              <LayoutDashboard className="h-4 w-4 text-primary flex-shrink-0" />
              <span>Real-time dashboard access</span>
            </div>
            <div className="flex items-center justify-center gap-2">
              <Bell className="h-4 w-4 text-primary flex-shrink-0" />
              <span>Notified at every step</span>
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
              What Sets Us Apart
            </h2>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 sm:gap-6">
              <Card>
                <CardContent className="p-4 sm:p-6 text-center">
                  <div className="w-10 h-10 sm:w-12 sm:h-12 rounded-full bg-primary/10 flex items-center justify-center mx-auto mb-3 sm:mb-4">
                    <ThumbsUp className="h-5 w-5 sm:h-6 sm:w-6 text-primary" />
                  </div>
                  <h3 className="font-semibold text-sm sm:text-base mb-1.5 sm:mb-2">You Approve Everything</h3>
                  <p className="text-xs sm:text-sm text-muted-foreground">
                    Podcasts, messaging, blog posts, video clips — nothing goes out without your approval first.
                  </p>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="p-4 sm:p-6 text-center">
                  <div className="w-10 h-10 sm:w-12 sm:h-12 rounded-full bg-primary/10 flex items-center justify-center mx-auto mb-3 sm:mb-4">
                    <LayoutDashboard className="h-5 w-5 sm:h-6 sm:w-6 text-primary" />
                  </div>
                  <h3 className="font-semibold text-sm sm:text-base mb-1.5 sm:mb-2">Full Visibility</h3>
                  <p className="text-xs sm:text-sm text-muted-foreground">
                    Your dashboard shows everything in real-time — every outreach, every response, every booking.
                  </p>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="p-4 sm:p-6 text-center">
                  <div className="w-10 h-10 sm:w-12 sm:h-12 rounded-full bg-primary/10 flex items-center justify-center mx-auto mb-3 sm:mb-4">
                    <BookOpen className="h-5 w-5 sm:h-6 sm:w-6 text-primary" />
                  </div>
                  <h3 className="font-semibold text-sm sm:text-base mb-1.5 sm:mb-2">Resources Included</h3>
                  <p className="text-xs sm:text-sm text-muted-foreground">
                    Access guides on equipment, speaking strategy, and how to be the best podcast guest.
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
            Ready to Get Started?
          </h2>
          <p className="text-sm sm:text-base text-muted-foreground mb-6 sm:mb-8 max-w-xl mx-auto px-2">
            Book a free strategy call to discuss your goals and see if we're a good fit.
          </p>
          <div className="flex flex-col sm:flex-row justify-center gap-3 sm:gap-4">
            <Button size="lg" className="gap-2 min-h-[48px] text-sm sm:text-base" asChild>
              <a href="https://calendly.com/getonapodjg/30min/2026-01-12T13:00:00-05:00" target="_blank" rel="noopener noreferrer">
                Book a Free Call
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
