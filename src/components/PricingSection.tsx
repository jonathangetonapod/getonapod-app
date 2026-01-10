import { Button } from '@/components/ui/button';
import { Check, Info } from 'lucide-react';
import { useScrollAnimation } from '@/hooks/useScrollAnimation';
import { useState } from 'react';
import { FeatureDetailModal } from '@/components/pricing/FeatureDetailModal';

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

                <div className="space-y-3">
                  <Button
                    variant={plan.popular ? 'secondary' : 'hero'}
                    size="lg"
                    className="w-full min-h-[48px]"
                    asChild
                  >
                    <a href="https://calendly.com/getonapodjg/30min/2026-01-12T13:00:00-05:00" target="_blank" rel="noopener noreferrer">Book a Call</a>
                  </Button>

                  <div className="flex justify-center">
                    {/* @ts-ignore */}
                    <stripe-buy-button
                      buy-button-id={plan.name === "Starter" ? "buy_btn_1So6wjDUPtBnbWkaAkoqwcLf" : "buy_btn_1So79ZDUPtBnbWkaaZSbIvKU"}
                      publishable-key="pk_live_51O4PfBDUPtBnbWkaMgFdAHoSG9rnT54pePADcz6zzWxeDlcrkZzQa03Cfk9g5bPaJfbZJpSgsf0nfdLsduYTi5U900RbgGg9Lm"
                    />
                  </div>
                </div>
              </div>
            ))}
          </div>

          <p className="text-center text-muted-foreground mt-8">
            All plans require a 3-month minimum commitment.
          </p>
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
