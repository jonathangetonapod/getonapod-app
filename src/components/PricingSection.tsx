import { Button } from '@/components/ui/button';
import { Check, Sparkles, ArrowRight, Info } from 'lucide-react';
import { useScrollAnimation } from '@/hooks/useScrollAnimation';
import { useState } from 'react';
import { FeatureDetailModal } from '@/components/pricing/FeatureDetailModal';

const plans = [
  {
    name: "Starter",
    price: "$749",
    period: "/month",
    features: [
      "2 podcast bookings/month, minimum",
      "Podcast Command Center access",
      "Reporting & analytics dashboard",
    ],
  },
];

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
            Starter Plan
          </h2>

          <div className="max-w-sm mx-auto">
            {plans.map((plan, index) => (
              <div
                key={index}
                className="relative flex flex-col p-5 sm:p-6 md:p-8 rounded-xl sm:rounded-2xl bg-background border border-border hover:border-foreground/20 transition-all duration-300"
              >
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
                  <a href="https://calendly.com/getonapodjg/30min/2026-01-12T13:00:00-05:00" target="_blank" rel="noopener noreferrer">Book a Call</a>
                </Button>
              </div>
            ))}
          </div>

          <p className="text-center text-sm sm:text-base text-muted-foreground mt-6 sm:mt-8">
            Month-to-month. Cancel anytime.
          </p>
          <div className="text-center mt-8">
            <Button
              variant="ghost"
              size="lg"
              className="gap-2 text-primary hover:text-primary hover:bg-primary/10 border border-primary/20 hover:border-primary/40 transition-all duration-300 group"
              asChild
            >
              <a href="/what-to-expect">
                <Sparkles className="h-4 w-4 group-hover:scale-110 transition-transform" />
                Curious what happens after you sign up?
                <ArrowRight className="h-4 w-4 group-hover:translate-x-1 transition-transform" />
              </a>
            </Button>
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
