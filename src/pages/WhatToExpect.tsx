import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import Navbar from '@/components/Navbar';
import Footer from '@/components/Footer';
import {
  CheckCircle2,
  Calendar,
  FileText,
  Mic,
  Video,
  BarChart3,
  ArrowRight,
  Clock,
  Users,
  Sparkles,
  MessageSquare,
  Send,
  Headphones
} from 'lucide-react';

const steps = [
  {
    number: "01",
    title: "Onboarding Call",
    duration: "Day 1-2",
    icon: Calendar,
    description: "We'll schedule a quick 30-minute call to learn about your expertise, target audience, and goals. This helps us find the perfect podcast matches for you.",
    details: [
      "Discuss your background and expertise",
      "Define your ideal podcast audience",
      "Set goals for your podcast tour",
      "Review your calendar availability"
    ]
  },
  {
    number: "02",
    title: "Profile & Media Kit Setup",
    duration: "Day 3-5",
    icon: FileText,
    description: "Our team creates your professional speaker profile and media kit that showcases your expertise and makes podcast hosts excited to have you on their show.",
    details: [
      "Professional bio and headshot optimization",
      "Key talking points and topics",
      "Past media appearances (if any)",
      "Social proof and credentials"
    ]
  },
  {
    number: "03",
    title: "Podcast Research & Outreach",
    duration: "Week 1-2",
    icon: Send,
    description: "We research and curate a list of podcasts perfect for your niche, then begin personalized outreach on your behalf.",
    details: [
      "Hand-picked shows in your industry",
      "Personalized pitches for each host",
      "Follow-up sequences to maximize responses",
      "You approve shows before we pitch"
    ]
  },
  {
    number: "04",
    title: "Booking Confirmations",
    duration: "Week 2-4",
    icon: Mic,
    description: "As hosts respond, we handle all the scheduling and logistics. You'll start seeing confirmed bookings roll in.",
    details: [
      "Calendar coordination with hosts",
      "Interview prep materials",
      "Technical setup guidance",
      "Reminder notifications"
    ]
  },
  {
    number: "05",
    title: "Guest Prep Kit",
    duration: "Before Each Interview",
    icon: Headphones,
    description: "Before each recording, you'll receive a custom prep kit with everything you need to deliver an amazing interview.",
    details: [
      "Podcast background research",
      "Host's interview style notes",
      "Suggested talking points",
      "Common questions to expect"
    ],
    proBadge: true
  },
  {
    number: "06",
    title: "Record Your Episodes",
    duration: "Ongoing",
    icon: Video,
    description: "Show up, share your expertise, and have great conversations. We've done all the prep work so you can focus on delivering value.",
    details: [
      "Just show up and talk",
      "Be yourself and share your story",
      "Build relationships with hosts",
      "Enjoy the process!"
    ]
  },
  {
    number: "07",
    title: "Content Repurposing",
    duration: "After Episodes Air",
    icon: Sparkles,
    description: "For Pro clients, we transform your podcast appearances into a full content package to maximize your reach.",
    details: [
      "2 SEO-optimized blog posts per episode",
      "9 short-form video clips monthly",
      "Social media ready content",
      "Maximize every appearance"
    ],
    proBadge: true
  },
  {
    number: "08",
    title: "Reporting & Analytics",
    duration: "Monthly",
    icon: BarChart3,
    description: "Track your progress with our Podcast Command Center. See all your bookings, upcoming interviews, and audience reach in one place.",
    details: [
      "All bookings in one dashboard",
      "Audience reach metrics",
      "Episode performance tracking",
      "Monthly progress reports"
    ]
  }
];

const WhatToExpect = () => {
  return (
    <div className="min-h-screen bg-background">
      <Navbar />

      {/* Hero Section */}
      <section className="pt-24 pb-12 sm:pt-32 sm:pb-16 bg-gradient-to-b from-primary/5 via-purple-500/5 to-transparent">
        <div className="container mx-auto px-4 sm:px-6 text-center">
          <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-primary/10 text-primary text-sm font-medium mb-6">
            <Sparkles className="h-4 w-4" />
            Your Journey With Us
          </div>

          <h1 className="text-3xl sm:text-4xl md:text-5xl lg:text-6xl font-bold text-foreground mb-6">
            What Happens After You Sign Up?
          </h1>

          <p className="text-lg sm:text-xl text-muted-foreground max-w-2xl mx-auto mb-8">
            Here's exactly what to expect when you become a Get On A Pod client.
            No surprises, just a clear path to podcast success.
          </p>

          <div className="flex flex-wrap justify-center gap-4 sm:gap-8 text-sm text-muted-foreground">
            <div className="flex items-center gap-2">
              <Clock className="h-4 w-4 text-primary" />
              <span>First booking in 2-4 weeks</span>
            </div>
            <div className="flex items-center gap-2">
              <Users className="h-4 w-4 text-primary" />
              <span>Dedicated account manager</span>
            </div>
            <div className="flex items-center gap-2">
              <MessageSquare className="h-4 w-4 text-primary" />
              <span>Ongoing communication</span>
            </div>
          </div>
        </div>
      </section>

      {/* Timeline Section */}
      <section className="py-12 sm:py-20">
        <div className="container mx-auto px-4 sm:px-6">
          <div className="max-w-4xl mx-auto">
            {steps.map((step, index) => (
              <div key={index} className="relative">
                {/* Connector Line */}
                {index < steps.length - 1 && (
                  <div className="absolute left-6 sm:left-8 top-20 bottom-0 w-0.5 bg-gradient-to-b from-primary/30 to-primary/10" />
                )}

                <div className="flex gap-4 sm:gap-6 mb-8 sm:mb-12">
                  {/* Step Number Circle */}
                  <div className="flex-shrink-0 relative z-10">
                    <div className="w-12 h-12 sm:w-16 sm:h-16 rounded-full bg-primary/10 border-2 border-primary flex items-center justify-center">
                      <step.icon className="h-5 w-5 sm:h-6 sm:w-6 text-primary" />
                    </div>
                  </div>

                  {/* Content */}
                  <div className="flex-1 pt-1">
                    <div className="flex flex-wrap items-center gap-2 sm:gap-3 mb-2">
                      <span className="text-xs font-bold text-primary bg-primary/10 px-2 py-0.5 rounded">
                        STEP {step.number}
                      </span>
                      <span className="text-xs text-muted-foreground">
                        {step.duration}
                      </span>
                      {step.proBadge && (
                        <span className="text-xs font-medium text-white bg-gradient-to-r from-purple-600 to-pink-600 px-2 py-0.5 rounded">
                          PRO
                        </span>
                      )}
                    </div>

                    <h3 className="text-xl sm:text-2xl font-bold text-foreground mb-2">
                      {step.title}
                    </h3>

                    <p className="text-muted-foreground mb-4">
                      {step.description}
                    </p>

                    <Card className="bg-muted/30 border-muted">
                      <CardContent className="p-4">
                        <ul className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                          {step.details.map((detail, i) => (
                            <li key={i} className="flex items-start gap-2 text-sm">
                              <CheckCircle2 className="h-4 w-4 text-green-500 flex-shrink-0 mt-0.5" />
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

      {/* CTA Section */}
      <section className="py-12 sm:py-20 bg-gradient-to-b from-transparent via-primary/5 to-primary/10">
        <div className="container mx-auto px-4 sm:px-6 text-center">
          <h2 className="text-2xl sm:text-3xl md:text-4xl font-bold text-foreground mb-4">
            Ready to Get Started?
          </h2>
          <p className="text-muted-foreground mb-8 max-w-xl mx-auto">
            Book a free strategy call to discuss your goals and see if we're a good fit.
          </p>
          <div className="flex flex-col sm:flex-row justify-center gap-4">
            <Button size="lg" className="gap-2" asChild>
              <a href="https://calendly.com/getonapodjg/30min/2026-01-12T13:00:00-05:00" target="_blank" rel="noopener noreferrer">
                Book a Free Call
                <ArrowRight className="h-4 w-4" />
              </a>
            </Button>
            <Button size="lg" variant="outline" asChild>
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
