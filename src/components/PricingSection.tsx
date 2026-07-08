import { Button } from '@/components/ui/button';
import { ArrowRight, Check, Info, Shield, Sparkles } from 'lucide-react';
import { useScrollAnimation } from '@/hooks/useScrollAnimation';
import { useState } from 'react';
import { FeatureDetailModal } from '@/components/pricing/FeatureDetailModal';

const plan = {
  name: "GOAP Core",
  price: "$749",
  period: "/month",
  features: [
    "Minimum 2 podcast bookings per month",
    "Private client portal with approvals and status tracking",
    "Show research, outreach, and follow-up handled for you",
    "Guest prep support before each recording",
  ],
};

const comparisons = [
  {
    option: 'DIY tools',
    cost: '$49-$299/mo',
    tradeoff: 'Cheap, but you still do the research, pitching, follow-up, and tracking yourself.',
  },
  {
    option: 'Traditional agency',
    cost: '$1,500-$5,000+/mo',
    tradeoff: 'Done for you, but often less transparent once the campaign is live.',
  },
  {
    option: 'Get On A Pod',
    cost: '$749/mo',
    tradeoff: 'Managed outreach with approvals, portal visibility, and a built-in placement commitment.',
  },
];

const PricingSection = () => {
  const { ref, isVisible } = useScrollAnimation<HTMLDivElement>();
  const [selectedFeature, setSelectedFeature] = useState<string | null>(null);

  return (
    <section id="pricing" className="bg-[#f8fbff] px-4 py-12 md:py-20">
      <div className="container mx-auto">
        <div
          ref={ref}
          className={`transition-all duration-700 ${
            isVisible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-8'
          }`}
        >
          <div className="grid gap-10 lg:grid-cols-[0.94fr_1.06fr] lg:items-start">
            <div className="max-w-xl">
              <p className="section-kicker">Pricing</p>
              <h2 className="mt-4 font-display text-4xl font-semibold tracking-[-0.05em] text-[#0d1b2a] sm:text-5xl md:text-6xl">
                Done-for-you podcast booking with clear pricing and a real delivery commitment.
              </h2>
              <p className="mt-5 text-base leading-8 text-[#4c5d73] sm:text-lg">
                This is for buyers who care more about audience fit than vanity reach. You can see the work,
                approve the targets, and know what the monthly fee is tied to.
              </p>

              <div className="mt-8 space-y-4">
                {comparisons.map((comparison) => (
                  <div
                    key={comparison.option}
                    className={`rounded-[24px] border p-5 ${
                      comparison.option === 'Get On A Pod'
                        ? 'border-[#2d6df6]/20 bg-[#eef4ff]'
                        : 'border-[#0d1b2a]/8 bg-[#ffffff]'
                    }`}
                  >
                    <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                      <div>
                        <p className="font-display text-2xl font-semibold tracking-[-0.04em] text-[#0d1b2a]">
                          {comparison.option}
                        </p>
                        <p className="mt-2 text-sm leading-6 text-[#4c5d73]">{comparison.tradeoff}</p>
                      </div>
                      <p className="font-mono text-sm uppercase tracking-[0.22em] text-[#2d6df6]">
                        {comparison.cost}
                      </p>
                    </div>
                  </div>
                ))}
              </div>

              <div className="mt-8 rounded-[28px] border border-[#2d6df6]/14 bg-[#eef4ff] p-6">
                <div className="flex items-start gap-4">
                  <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-[#2d6df6]/12 text-[#2d6df6]">
                    <Shield className="h-6 w-6" strokeWidth={1.8} />
                  </div>
                  <div>
                    <p className="font-display text-2xl font-semibold tracking-[-0.04em] text-[#0d1b2a]">
                      Premium placements available as an add-on
                    </p>
                    <p className="mt-2 text-sm leading-7 text-[#30465f]">
                      Earned outreach comes first. If you want curated paid opportunities, those sit alongside the core service rather than replacing it.
                    </p>
                  </div>
                </div>
              </div>
            </div>

            <div className="max-w-xl">
              <div className="relative flex flex-col rounded-[32px] border border-[#0d1b2a]/10 bg-[#081a2b] p-6 text-[#f7fafc] shadow-[0_28px_60px_rgba(13,27,42,0.22)] sm:p-8">
                <div className="mb-4 inline-flex items-center gap-2">
                  <Sparkles className="h-5 w-5 text-[#8cb0dd]" />
                  <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1 font-mono text-[11px] uppercase tracking-[0.22em] text-[#8cb0dd]">
                    Core plan
                  </span>
                </div>

                <div className="mb-4">
                  <h3 className="font-display text-3xl font-semibold tracking-[-0.05em]">
                    {plan.name}
                  </h3>
                  <div className="mt-3 flex items-end gap-2">
                    <span className="font-display text-5xl font-semibold tracking-[-0.06em]">
                      {plan.price}
                    </span>
                    <span className="pb-1 text-base text-[#c7d9ee]">
                      {plan.period}
                    </span>
                  </div>
                  <p className="mt-2 text-sm text-[#c7d9ee]">
                    Month-to-month. Includes a placement commitment.
                  </p>
                </div>

                <ul className="mb-8 space-y-3">
                  {plan.features.map((feature, i) => (
                    <li
                      key={i}
                      className="group flex cursor-pointer items-start gap-3 rounded-2xl border border-white/8 bg-white/5 px-4 py-3 transition hover:bg-white/10"
                      onClick={() => setSelectedFeature(feature)}
                    >
                      <Check className="mt-0.5 h-5 w-5 shrink-0 text-[#b8ccff]" />
                      <span className="flex-1 text-sm leading-6 text-[#f7fafc]">
                        {feature}
                      </span>
                      <Info className="mt-0.5 h-4 w-4 shrink-0 text-[#8cb0dd] opacity-0 transition-opacity group-hover:opacity-100" />
                    </li>
                  ))}
                </ul>

                <div className="flex flex-col gap-3">
                  <Button
                    variant="heroOutline"
                    size="lg"
                    className="w-full rounded-full border-white/15 bg-[#f7fafc] text-[#0d1b2a]"
                    asChild
                  >
                    <a href="https://calendly.com/getonapodjg/30min" target="_blank" rel="noopener noreferrer">
                      Book My Shortlist Call
                    </a>
                  </Button>
                  <Button
                    variant="ghost"
                    size="lg"
                    className="w-full rounded-full text-[#f7fafc] hover:bg-white/10 hover:text-[#f7fafc]"
                    asChild
                  >
                    <a href="/what-to-expect">
                      See exactly what happens after sign-up
                    </a>
                  </Button>
                </div>
              </div>

              <div className="mt-6 flex flex-wrap items-center gap-4 text-sm text-[#4c5d73]">
                <div className="flex items-center gap-2">
                  <Check className="h-4 w-4 text-[#2d6df6]" />
                  <span>Month-to-month</span>
                </div>
                <div className="flex items-center gap-2">
                  <Check className="h-4 w-4 text-[#2d6df6]" />
                  <span>Approve targets before outreach</span>
                </div>
                <div className="flex items-center gap-2">
                  <Check className="h-4 w-4 text-[#2d6df6]" />
                  <span>Placement commitment included</span>
                </div>
              </div>

              <a
                href="/what-to-expect"
                className="mt-6 inline-flex items-center gap-2 text-sm font-medium text-[#2d6df6] transition hover:gap-3"
              >
                <Sparkles className="h-4 w-4" />
                See onboarding and delivery details
                <ArrowRight className="h-4 w-4" />
              </a>
            </div>
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
