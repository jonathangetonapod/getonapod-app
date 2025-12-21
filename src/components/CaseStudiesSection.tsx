import { useScrollAnimation } from '@/hooks/useScrollAnimation';
import { ArrowRight, TrendingUp, Users, DollarSign } from 'lucide-react';

// Placeholder case studies - replace with real data
const caseStudies = [
  {
    client: "Sarah Chen",
    title: "SaaS Founder",
    industry: "B2B Tech",
    before: "0 podcast appearances, struggling with visibility",
    after: "12 podcast features in 3 months",
    metrics: [
      { icon: TrendingUp, label: "LinkedIn followers", value: "+240%" },
      { icon: Users, label: "Qualified leads", value: "18" },
      { icon: DollarSign, label: "Pipeline generated", value: "$85K" },
    ],
    quote: "Authority Lab helped me go from invisible to in-demand. My inbound completely changed.",
  },
  {
    client: "Michael Torres",
    title: "Wealth Advisor",
    industry: "Financial Services",
    before: "Relied solely on referrals for growth",
    after: "Featured on 8 finance podcasts + 2 press mentions",
    metrics: [
      { icon: Users, label: "New clients", value: "7" },
      { icon: DollarSign, label: "AUM increase", value: "$2.1M" },
      { icon: TrendingUp, label: "Website traffic", value: "+180%" },
    ],
    quote: "I closed more business in 4 months than I did the entire previous year. The credibility from podcasts and press is unmatched.",
  },
  {
    client: "Emily Watson",
    title: "CFO & Consultant",
    industry: "FinTech",
    before: "Known in her company, unknown in her industry",
    after: "Authority positioning as a thought leader",
    metrics: [
      { icon: TrendingUp, label: "Podcast appearances", value: "10" },
      { icon: Users, label: "Speaking invitations", value: "5" },
      { icon: DollarSign, label: "Consulting revenue", value: "$45K" },
    ],
    quote: "I went from 'who?' to getting invited to speak at conferences. The content Authority Lab creates makes it easy to stay top of mind.",
  },
];

const CaseStudiesSection = () => {
  const { ref, isVisible } = useScrollAnimation<HTMLDivElement>();

  return (
    <section className="py-20 md:py-32 bg-background" id="results">
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
              From Zero to Authority
            </h2>
            <p className="text-xl text-muted-foreground max-w-2xl mx-auto">
              Real results from real clients. Here's what happens when you consistently
              show up on the right podcasts and publications.
            </p>
          </div>

          {/* Case Studies */}
          <div className="space-y-12 max-w-6xl mx-auto">
            {caseStudies.map((study, index) => (
              <div
                key={index}
                className="p-8 md:p-12 bg-surface-subtle rounded-2xl border border-border"
                style={{ transitionDelay: `${index * 100}ms` }}
              >
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                  {/* Left: Client Info & Journey */}
                  <div className="lg:col-span-2">
                    <div className="mb-6">
                      <h3 className="text-2xl font-bold text-foreground mb-2">
                        {study.client}
                      </h3>
                      <p className="text-muted-foreground">
                        {study.title} • {study.industry}
                      </p>
                    </div>

                    {/* Before → After */}
                    <div className="mb-8">
                      <div className="flex flex-col md:flex-row gap-4 items-start md:items-center mb-6">
                        <div className="flex-1">
                          <p className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-2">
                            Before
                          </p>
                          <p className="text-foreground">{study.before}</p>
                        </div>
                        <ArrowRight className="h-6 w-6 text-primary flex-shrink-0 rotate-90 md:rotate-0" />
                        <div className="flex-1">
                          <p className="text-sm font-semibold text-primary uppercase tracking-wider mb-2">
                            After
                          </p>
                          <p className="text-foreground font-semibold">{study.after}</p>
                        </div>
                      </div>

                      <blockquote className="text-lg text-foreground italic border-l-4 border-primary pl-6">
                        "{study.quote}"
                      </blockquote>
                    </div>
                  </div>

                  {/* Right: Metrics */}
                  <div className="space-y-4">
                    <p className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-4">
                      Key Results
                    </p>
                    {study.metrics.map((metric, idx) => {
                      const Icon = metric.icon;
                      return (
                        <div
                          key={idx}
                          className="p-4 bg-background rounded-xl border border-border"
                        >
                          <div className="flex items-center gap-3 mb-2">
                            <Icon className="h-5 w-5 text-primary" />
                            <p className="text-sm text-muted-foreground">{metric.label}</p>
                          </div>
                          <p className="text-3xl font-bold text-foreground">{metric.value}</p>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
};

export default CaseStudiesSection;
