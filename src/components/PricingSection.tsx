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
    price: "$2,000",
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
          <h2 className="text-3xl sm:text-4xl md:text-5xl font-bold text-foreground text-center mb-6 sm:mb-12 md:mb-16">
            Choose Your Plan
          </h2>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 sm:gap-6 max-w-3xl mx-auto">
            {plans.map((plan, index) => (
              <div
                key={index}
                className={`relative flex flex-col p-5 sm:p-6 md:p-8 rounded-xl sm:rounded-2xl transition-all duration-300 ${
                  plan.popular
                    ? 'bg-gradient-to-b from-primary/5 to-purple-500/5 border-2 border-primary shadow-xl md:scale-105 order-first md:order-none'
                    : 'bg-background border border-border hover:border-foreground/20'
                }`}
                style={{ transitionDelay: `${index * 100}ms` }}
              >
                {plan.popular && (
                  <div className="absolute -top-3 left-1/2 -translate-x-1/2">
                    <span className="px-3 py-1 text-xs font-semibold bg-primary text-white rounded-full whitespace-nowrap">
                      Most Popular
                    </span>
                  </div>
                )}

                <div className="mb-3 sm:mb-4 mt-1 sm:mt-0">
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
                      className={`flex items-start gap-2 sm:gap-3 cursor-pointer group transition-all duration-200 rounded-lg -mx-2 px-2 py-1.5 sm:py-1 ${
                        plan.popular
                          ? 'hover:bg-primary/10'
                          : 'hover:bg-muted'
                      }`}
                      onClick={() => setSelectedFeature(feature)}
                    >
                      <Check className={`w-4 h-4 sm:w-5 sm:h-5 flex-shrink-0 mt-0.5 ${
                        plan.popular ? 'text-primary' : 'text-green-500'
                      }`} />
                      <span className={`flex-1 text-sm sm:text-base text-muted-foreground ${plan.popular ? 'font-medium' : ''}`}>
                        {feature}
                      </span>
                      <Info className="w-4 h-4 flex-shrink-0 mt-0.5 opacity-0 group-hover:opacity-100 transition-opacity text-muted-foreground" />
                    </li>
                  ))}
                </ul>

                <div className="space-y-3">
                  <Button
                    size="lg"
                    className="w-full min-h-[48px] text-sm sm:text-base"
                    asChild
                  >
                    <a href="https://calendly.com/getonapodjg/30min/2026-01-12T13:00:00-05:00" target="_blank" rel="noopener noreferrer">Book a Call</a>
                  </Button>

                  <div className="flex justify-center [&>stripe-buy-button]:w-full [&>stripe-buy-button]:max-w-full">
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

          <p className="text-center text-sm sm:text-base text-muted-foreground mt-6 sm:mt-8">
            All plans require a 3-month minimum commitment.
          </p>
          <div className="text-center mt-6">
            <Button variant="outline" size="sm" className="gap-2" asChild>
              <a href="/what-to-expect">
                <Info className="h-4 w-4" />
                What happens after you sign up?
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
