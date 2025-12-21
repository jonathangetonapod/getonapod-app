import { useScrollAnimation } from '@/hooks/useScrollAnimation';
import { Button } from '@/components/ui/button';
import { Mic, TrendingUp } from 'lucide-react';

// Placeholder podcast data - replace with real shows
const podcasts = [
  { name: "Tech Leaders Podcast", category: "Technology" },
  { name: "The SaaS Show", category: "SaaS" },
  { name: "Founder Stories", category: "Entrepreneurship" },
  { name: "FinTech Insider", category: "Finance" },
  { name: "Growth Talks", category: "Marketing" },
  { name: "The Executive Edge", category: "Leadership" },
  { name: "Scale & Grow", category: "Business" },
  { name: "Startup Success", category: "Startups" },
  { name: "Future of Finance", category: "Finance" },
  { name: "The Authority Show", category: "Personal Brand" },
  { name: "Revenue Leaders", category: "Sales" },
  { name: "Product Mind", category: "Product" },
  { name: "Innovators Lab", category: "Innovation" },
  { name: "The CFO Playbook", category: "Finance" },
  { name: "Tech Stack Weekly", category: "Technology" },
  { name: "Founder's Journey", category: "Entrepreneurship" },
];

const stats = [
  { label: "Total Placements", value: "150+", icon: Mic },
  { label: "Combined Reach", value: "2.5M+", icon: TrendingUp },
  { label: "Shows Partnered", value: "50+", icon: Mic },
];

const PodcastShowcaseSection = () => {
  const { ref, isVisible } = useScrollAnimation<HTMLDivElement>();

  return (
    <section className="py-20 md:py-32 bg-gradient-to-b from-surface-subtle to-background" id="podcast-showcase">
      <div className="container mx-auto">
        <div
          ref={ref}
          className={`transition-all duration-700 ${
            isVisible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-8'
          }`}
        >
          {/* Header */}
          <div className="text-center mb-16">
            <h2 className="text-3xl md:text-5xl font-bold text-foreground mb-6">
              We've Booked Our Clients On These Shows
            </h2>
            <p className="text-xl text-muted-foreground max-w-2xl mx-auto mb-12">
              From tech and finance to entrepreneurship and leadership—we have relationships
              with podcasts across every major industry.
            </p>

            {/* Stats */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-8 max-w-4xl mx-auto mb-16">
              {stats.map((stat, index) => {
                const Icon = stat.icon;
                return (
                  <div
                    key={index}
                    className="p-6 bg-background rounded-xl border border-border"
                    style={{ transitionDelay: `${index * 100}ms` }}
                  >
                    <Icon className="h-8 w-8 text-primary mx-auto mb-3" />
                    <p className="text-4xl font-bold text-foreground mb-1">{stat.value}</p>
                    <p className="text-sm text-muted-foreground">{stat.label}</p>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Podcast Grid */}
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4 mb-12">
            {podcasts.map((podcast, index) => (
              <div
                key={index}
                className="group p-6 bg-background rounded-xl border border-border hover:border-primary/50 transition-all duration-300 hover:shadow-lg flex flex-col items-center justify-center text-center min-h-[140px]"
                style={{ transitionDelay: `${index * 50}ms` }}
              >
                <div className="p-3 bg-primary/10 rounded-full mb-3 group-hover:bg-primary/20 transition-colors">
                  <Mic className="h-5 w-5 text-primary" />
                </div>
                <h3 className="font-semibold text-foreground mb-1 text-sm md:text-base">
                  {podcast.name}
                </h3>
                <p className="text-xs text-muted-foreground">{podcast.category}</p>
              </div>
            ))}
          </div>

          {/* CTA */}
          <div className="text-center">
            <p className="text-muted-foreground mb-6">
              And we're adding new partnerships every week.
            </p>
            <div className="flex flex-col sm:flex-row gap-4 justify-center">
              <Button variant="default" size="lg" asChild>
                <a href="#pricing">Get Started</a>
              </Button>
              <Button variant="outline" size="lg" asChild>
                <a href="/premium-placements">View Premium Placements</a>
              </Button>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
};

export default PodcastShowcaseSection;
