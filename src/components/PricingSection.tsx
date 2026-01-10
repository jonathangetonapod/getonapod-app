import { Button } from '@/components/ui/button';
import { Check, Info } from 'lucide-react';
import { useScrollAnimation } from '@/hooks/useScrollAnimation';
import { useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';

type FeatureDetail = {
  title: string;
  description: string;
  details: string[];
};

const featureDetails: Record<string, FeatureDetail> = {
  "2 podcast bookings/month": {
    title: "2 Podcast Bookings Per Month",
    description: "We secure 2 quality podcast appearances for you every month on shows that match your expertise and target audience.",
    details: [
      "Hand-picked shows relevant to your niche",
      "Vetted for audience engagement and quality",
      "Full scheduling coordination handled for you",
      "Episode prep support included",
    ],
  },
  "Minimum 3 bookings/month": {
    title: "Minimum 3 Bookings Per Month",
    description: "We guarantee at least 3 podcast appearances monthly, often more depending on availability and your approval queue.",
    details: [
      "3+ hand-picked shows relevant to your niche",
      "Vetted for audience engagement and quality",
      "Full scheduling coordination handled for you",
      "Episode prep support included",
    ],
  },
  "Podcast Command Center access": {
    title: "Podcast Command Center",
    description: "Your personal dashboard where you control your entire podcast campaign with full transparency.",
    details: [
      "See 50+ hand-picked podcasts curated for you",
      "AI-powered analysis explains why each show fits",
      "View audience demographics per podcast",
      "Approve or reject shows with one click",
      "Track your pipeline in real-time",
    ],
  },
  "Reporting & analytics dashboard": {
    title: "Reporting & Analytics Dashboard",
    description: "Track your podcast journey with real-time insights and metrics that show your campaign's performance.",
    details: [
      "Shows booked, recorded, and aired",
      "Total audience reach across all appearances",
      "Campaign progress and pipeline visibility",
      "Episode status tracking",
      "Performance trends over time",
    ],
  },
  "2 blog posts per episode": {
    title: "2 Blog Posts Per Episode",
    description: "Professional blog content created from each podcast episode, ready to publish on your website or LinkedIn.",
    details: [
      "Written by professional content writers",
      "SEO-optimized for your target keywords",
      "Captures key insights from your conversation",
      "Formatted and ready to publish",
      "Extends the life of your podcast appearance",
    ],
  },
  "Guest prep kit": {
    title: "Guest Prep Kit",
    description: "Everything you need to show up confident and deliver your best performance on every podcast.",
    details: [
      "Host background and interview style",
      "Audience demographics and interests",
      "Suggested talking points tailored to the show",
      "Common questions the host asks",
      "Tips to maximize your appearance",
    ],
  },
  "9 video clips (3 per podcast)": {
    title: "9 Short-Form Video Clips",
    description: "Professional video clips created from your podcast appearances, optimized for social media.",
    details: [
      "3 clips per podcast episode",
      "Edited with captions and branding",
      "Optimized for LinkedIn, Twitter, Instagram",
      "Vertical and horizontal formats available",
      "Ready to post immediately",
    ],
  },
};

const plans = [
  {
    name: "Starter",
    price: "$1,000",
    period: "/month",
    features: [
      "2 podcast bookings/month",
      "Podcast Command Center access",
      "Reporting & analytics dashboard",
    ],
    popular: false,
  },
  {
    name: "Pro",
    price: "$1,500",
    period: "/month",
    features: [
      "Minimum 3 bookings/month",
      "Podcast Command Center access",
      "2 blog posts per episode",
      "Guest prep kit",
      "9 video clips (3 per podcast)",
      "Reporting & analytics dashboard",
    ],
    popular: true,
  },
];

const PricingSection = () => {
  const { ref, isVisible } = useScrollAnimation<HTMLDivElement>();
  const [selectedFeature, setSelectedFeature] = useState<string | null>(null);

  const currentFeatureDetail = selectedFeature ? featureDetails[selectedFeature] : null;

  return (
    <section id="pricing" className="py-8 md:py-16 bg-surface-subtle px-4">
      <div className="container mx-auto">
        <div
          ref={ref}
          className={`transition-all duration-700 ${
            isVisible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-8'
          }`}
        >
          <h2 className="text-4xl sm:text-4xl md:text-5xl font-bold text-foreground text-center mb-8 sm:mb-12 md:mb-16 px-4">
            Choose Your Plan
          </h2>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 max-w-3xl mx-auto">
            {plans.map((plan, index) => (
              <div
                key={index}
                className={`relative p-6 sm:p-8 rounded-xl border transition-all duration-300 ${
                  plan.popular
                    ? 'bg-primary text-primary-foreground border-primary md:scale-105'
                    : 'bg-background border-border hover:border-foreground/20'
                }`}
                style={{ transitionDelay: `${index * 100}ms` }}
              >
                {plan.popular && (
                  <div className="absolute -top-3 left-1/2 -translate-x-1/2 px-3 py-1 bg-background text-foreground text-xs font-semibold rounded-full">
                    Most Popular
                  </div>
                )}

                <h3 className={`text-xl font-semibold mb-2 ${
                  plan.popular ? 'text-primary-foreground' : 'text-foreground'
                }`}>
                  {plan.name}
                </h3>

                <div className="mb-6">
                  <span className={`text-4xl font-bold ${
                    plan.popular ? 'text-primary-foreground' : 'text-foreground'
                  }`}>
                    {plan.price}
                  </span>
                  <span className={plan.popular ? 'text-primary-foreground/70' : 'text-muted-foreground'}>
                    {plan.period}
                  </span>
                </div>

                <ul className="space-y-3 mb-8">
                  {plan.features.map((feature, i) => (
                    <li
                      key={i}
                      className={`flex items-start gap-3 cursor-pointer group transition-all duration-200 rounded-lg -mx-2 px-2 py-1 ${
                        plan.popular
                          ? 'hover:bg-primary-foreground/10'
                          : 'hover:bg-muted'
                      }`}
                      onClick={() => setSelectedFeature(feature)}
                    >
                      <Check className={`w-5 h-5 flex-shrink-0 mt-0.5 ${
                        plan.popular ? 'text-primary-foreground' : 'text-foreground'
                      }`} />
                      <span className={`flex-1 ${plan.popular ? 'text-primary-foreground/90' : 'text-muted-foreground'}`}>
                        {feature}
                      </span>
                      <Info className={`w-4 h-4 flex-shrink-0 mt-0.5 opacity-0 group-hover:opacity-100 transition-opacity ${
                        plan.popular ? 'text-primary-foreground/70' : 'text-muted-foreground'
                      }`} />
                    </li>
                  ))}
                </ul>

                <Button
                  variant={plan.popular ? 'secondary' : 'hero'}
                  size="lg"
                  className="w-full min-h-[48px]"
                  asChild
                >
                  <a href="https://calendly.com/getonapodjg/30min" target="_blank" rel="noopener noreferrer">Book a Call</a>
                </Button>
              </div>
            ))}
          </div>

          <p className="text-center text-muted-foreground mt-8">
            All plans require a 3-month minimum commitment.
          </p>
        </div>
      </div>

      {/* Feature Detail Modal */}
      <Dialog open={!!selectedFeature} onOpenChange={() => setSelectedFeature(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="text-xl font-bold">
              {currentFeatureDetail?.title}
            </DialogTitle>
            <DialogDescription className="text-base pt-2">
              {currentFeatureDetail?.description}
            </DialogDescription>
          </DialogHeader>

          <div className="mt-4">
            <p className="text-sm font-medium text-foreground mb-3">What's included:</p>
            <ul className="space-y-2">
              {currentFeatureDetail?.details.map((detail, i) => (
                <li key={i} className="flex items-start gap-3">
                  <Check className="w-4 h-4 flex-shrink-0 mt-0.5 text-primary" />
                  <span className="text-sm text-muted-foreground">{detail}</span>
                </li>
              ))}
            </ul>
          </div>
        </DialogContent>
      </Dialog>
    </section>
  );
};

export default PricingSection;
