import { useScrollAnimation } from '@/hooks/useScrollAnimation';
import { Monitor, FileText, Video, BarChart3, CheckCircle2, Sparkles, ThumbsUp, Brain } from 'lucide-react';
import { Badge } from '@/components/ui/badge';

const features = [
  {
    icon: Monitor,
    title: "Podcast Command Center",
    description: "Your personal dashboard to review and approve every podcast before we pitch.",
    items: [
      "See 50+ hand-picked podcasts for you",
      "AI explains why each show fits your expertise",
      "View audience demographics per podcast",
      "Approve or reject with one click"
    ],
    color: "from-blue-500/20 to-blue-600/20",
    badge: "Full Transparency"
  },
  {
    icon: ThumbsUp,
    title: "You're In Control",
    description: "No spray-and-pray outreach. We only pitch shows YOU approve.",
    items: [
      "Review every podcast before outreach",
      "Add notes on your preferences",
      "Quality over quantity approach",
      "Your brand, your choice"
    ],
    color: "from-purple-500/20 to-purple-600/20",
    badge: "Your Call"
  },
  {
    icon: Video,
    title: "Content Package",
    description: "Maximize every appearance with ready-to-post promotional assets.",
    items: [
      "9 short-form video clips (3 per podcast)",
      "2 blog posts per episode",
      "Optimized for LinkedIn & social",
      "Ready to repurpose everywhere"
    ],
    color: "from-green-500/20 to-green-600/20",
    badge: "Pro Plan"
  },
  {
    icon: BarChart3,
    title: "Reporting & Analytics",
    description: "Track your podcast journey with real-time insights and metrics.",
    items: [
      "Shows booked and aired",
      "Total audience reach",
      "Campaign progress tracking",
      "Pipeline visibility"
    ],
    color: "from-orange-500/20 to-orange-600/20",
    badge: "Real-Time"
  },
];

const WhatYouGetSection = () => {
  const { ref, isVisible } = useScrollAnimation<HTMLDivElement>();

  return (
    <section className="py-8 md:py-16 bg-background">
      <div className="container mx-auto px-4">
        <div
          ref={ref}
          className={`transition-all duration-700 ${
            isVisible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-8'
          }`}
        >
          {/* Header */}
          <div className="text-center mb-8 sm:mb-12 md:mb-16">
            <div className="inline-flex items-center gap-2 mb-3 sm:mb-4">
              <Sparkles className="w-5 h-5 sm:w-6 sm:h-6 text-primary" />
              <Badge variant="outline" className="text-xs sm:text-sm">
                Full Transparency
              </Badge>
            </div>
            <h2 className="text-3xl sm:text-4xl md:text-5xl font-bold text-foreground mb-3 sm:mb-4">
              Your Podcast Command Center
            </h2>
            <p className="text-base sm:text-lg md:text-xl text-muted-foreground max-w-2xl mx-auto px-2">
              Most agencies send you a monthly PDF. We give you a live dashboard where you control everything.
            </p>
          </div>

          {/* Features Grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 sm:gap-6 md:gap-8 max-w-6xl mx-auto">
            {features.map((feature, index) => {
              const Icon = feature.icon;
              return (
                <div
                  key={index}
                  className="group relative bg-background rounded-xl sm:rounded-2xl border-2 border-border p-4 sm:p-6 md:p-8 hover:border-primary/50 transition-all duration-300 hover:shadow-xl hover:-translate-y-1"
                  style={{ transitionDelay: `${index * 100}ms` }}
                >
                  {/* Badge */}
                  <div className="absolute -top-3 right-4 sm:right-6">
                    <Badge className="bg-primary/10 text-primary border-primary/20 text-xs sm:text-sm">
                      {feature.badge}
                    </Badge>
                  </div>

                  {/* Icon */}
                  <div className="mb-4 sm:mb-6">
                    <div className={`inline-flex w-12 h-12 sm:w-14 sm:h-14 md:w-16 md:h-16 rounded-xl sm:rounded-2xl bg-gradient-to-br ${feature.color} items-center justify-center`}>
                      <Icon className="w-6 h-6 sm:w-7 sm:h-7 md:w-8 md:h-8 text-foreground" strokeWidth={1.5} />
                    </div>
                  </div>

                  {/* Content */}
                  <h3 className="text-lg sm:text-xl md:text-2xl font-bold text-foreground mb-1 sm:mb-2">
                    {feature.title}
                  </h3>
                  <p className="text-sm sm:text-base text-muted-foreground mb-3 sm:mb-4">
                    {feature.description}
                  </p>

                  {/* Items List */}
                  <ul className="space-y-2 sm:space-y-2.5">
                    {feature.items.map((item, i) => (
                      <li key={i} className="flex items-start gap-2 sm:gap-3 text-foreground">
                        <CheckCircle2 className="w-4 h-4 sm:w-5 sm:h-5 text-primary flex-shrink-0 mt-0.5" />
                        <span className="text-sm sm:text-base">{item}</span>
                      </li>
                    ))}
                  </ul>

                  {/* Hover Indicator */}
                  <div className="absolute bottom-0 left-0 right-0 h-1 bg-gradient-to-r from-primary/0 via-primary to-primary/0 opacity-0 group-hover:opacity-100 transition-opacity rounded-b-2xl" />
                </div>
              );
            })}
          </div>

          {/* Bottom Note */}
          <div className="text-center mt-8 sm:mt-12 md:mt-16 px-2">
            <p className="text-base sm:text-lg text-muted-foreground">
              <span className="font-semibold text-foreground">Pro clients</span> get the full content package—video clips, blog posts, and guest prep kits for every episode.
            </p>
          </div>
        </div>
      </div>
    </section>
  );
};

export default WhatYouGetSection;
