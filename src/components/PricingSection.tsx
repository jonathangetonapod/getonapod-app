import { Button } from '@/components/ui/button';
import { Check, Sparkles, ArrowRight, Info } from 'lucide-react';
import { useScrollAnimation } from '@/hooks/useScrollAnimation';
import { useState } from 'react';
import { FeatureDetailModal } from '@/components/pricing/FeatureDetailModal';

const plan = {
  name: "Get On A Pod",
  price: "$499",
  period: "/month",
  features: [
    "2+ guaranteed podcast bookings every month",
    "Podcast Command Center access",
    "Reporting & analytics dashboard",
  ],
};

const PricingSection = () => {
  const { ref, isVisible } = useScrollAnimation<HTMLDivElement>();
  const [selectedFeature, setSelectedFeature] = useState<string | null>(null);

  return (
    <section id="pricing" className="py-8 md:py-16 bg-surface-subtle px-4">
      <div className="container mx-auto">
        <div
          ref={ref}
          className={`transition-all duration-700 ${
            isVisible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-8'
          }`}
        >
          <h2 className="text-3xl sm:text-4xl md:text-5xl font-bold text-foreground text-center mb-6 sm:mb-12 md:mb-16">
            Simple, Transparent Pricing
          </h2>

          <div className="max-w-sm mx-auto">
            <div className="relative flex flex-col p-5 sm:p-6 md:p-8 rounded-xl sm:rounded-2xl bg-background border border-border hover:border-foreground/20 transition-all duration-300">
              <div className="mb-3 sm:mb-4">
                <h3 className="text-lg sm:text-xl font-semibold text-foreground">
                  {plan.name}
                </h3>
                <div className="mt-1.5 sm:mt-2 flex items-baseline gap-1">
                  <span className="text-2xl sm:text-3xl md:text-4xl font-bold text-foreground">
                    {plan.price}
                  </span>
                  <span className="text-sm sm:text-base text-muted-foreground">
                    {plan.period}
                  </span>
                </div>
                <p className="mt-1.5 text-xs sm:text-sm text-muted-foreground/80">
                  That's ~$250 per podcast booking
                </p>
              </div>

              <ul className="space-y-2 sm:space-y-3 mb-6 sm:mb-8 flex-1">
                {plan.features.map((feature, i) => (
                  <li
                    key={i}
                    className="flex items-start gap-2 sm:gap-3 cursor-pointer group transition-all duration-200 rounded-lg -mx-2 px-2 py-1.5 sm:py-1 hover:bg-muted"
                    onClick={() => setSelectedFeature(feature)}
                  >
                    <Check className="w-4 h-4 sm:w-5 sm:h-5 flex-shrink-0 mt-0.5 text-green-500" />
                    <span className="flex-1 text-sm sm:text-base text-muted-foreground">
                      {feature}
                    </span>
                    <Info className="w-4 h-4 flex-shrink-0 mt-0.5 opacity-0 group-hover:opacity-100 transition-opacity text-muted-foreground" />
                  </li>
                ))}
              </ul>

              <Button
                size="lg"
                className="w-full min-h-[48px] text-sm sm:text-base"
                asChild
              >
                <a href="https://calendly.com/getonapodjg/30min/2026-01-12T13:00:00-05:00" target="_blank" rel="noopener noreferrer">Get Started Today</a>
              </Button>
            </div>
          </div>

          {/* Reassurance pills */}
          <div className="flex flex-wrap items-center justify-center gap-3 sm:gap-4 mt-6 sm:mt-8">
            <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
              <Check className="w-4 h-4 text-green-500 flex-shrink-0" />
              <span>No long-term contracts</span>
            </div>
            <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
              <Check className="w-4 h-4 text-green-500 flex-shrink-0" />
              <span>Cancel anytime</span>
            </div>
            <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
              <Check className="w-4 h-4 text-green-500 flex-shrink-0" />
              <span>Results guaranteed</span>
            </div>
          </div>

          {/* Comparison callout */}
          <div className="max-w-lg mx-auto mt-10 sm:mt-12">
            <p className="text-xs font-semibold text-muted-foreground text-center mb-4 uppercase tracking-widest">
              Why this is a no-brainer
            </p>
            <div className="grid grid-cols-3 gap-3 sm:gap-4">
              <div className="text-center p-3 sm:p-4 rounded-xl bg-background border border-border">
                <p className="text-xs sm:text-sm text-muted-foreground mb-1">DIY outreach</p>
                <p className="text-sm sm:text-base font-semibold text-muted-foreground/60 line-through">$2,000–3,000</p>
                <p className="text-[10px] sm:text-xs text-muted-foreground/50 mt-0.5">per month</p>
              </div>
              <div className="text-center p-3 sm:p-4 rounded-xl bg-background border border-border">
                <p className="text-xs sm:text-sm text-muted-foreground mb-1">Booking agency</p>
                <p className="text-sm sm:text-base font-semibold text-muted-foreground/60 line-through">$3,000–5,000</p>
                <p className="text-[10px] sm:text-xs text-muted-foreground/50 mt-0.5">per month</p>
              </div>
              <div className="text-center p-3 sm:p-4 rounded-xl bg-primary/5 border-2 border-primary/30">
                <p className="text-xs sm:text-sm font-semibold text-primary mb-1">Get On A Pod</p>
                <p className="text-sm sm:text-base font-bold text-foreground">$499</p>
                <p className="text-[10px] sm:text-xs text-muted-foreground mt-0.5">per month</p>
              </div>
            </div>
          </div>

          {/* Post-signup link */}
          <div className="text-center mt-10 sm:mt-12">
            <a
              href="/what-to-expect"
              className="group inline-flex items-center gap-2 text-sm sm:text-base text-primary font-medium hover:gap-3 transition-all"
            >
              <Sparkles className="h-4 w-4 group-hover:scale-110 transition-transform" />
              See exactly what happens after you sign up
              <ArrowRight className="h-4 w-4 group-hover:translate-x-1 transition-transform" />
            </a>
          </div>
        </div>
      </div>

      <FeatureDetailModal
        selectedFeature={selectedFeature}
        onClose={() => setSelectedFeature(null)}
      />
    </section>
  );
};

export default PricingSection;
