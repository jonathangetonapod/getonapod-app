import { Button } from '@/components/ui/button';
import { ArrowRight, Check, Info, Shield, Sparkles } from 'lucide-react';
import { useScrollAnimation } from '@/hooks/useScrollAnimation';
import { useState } from 'react';
import { FeatureDetailModal } from '@/components/pricing/FeatureDetailModal';

const plan = {
  name: 'GOAP Core',
  price: '$749',
  period: '/month',
  features: [
    'Minimum 2 podcast bookings per month',
    'Private client portal with approvals and status tracking',
    'Show research, outreach, and follow-up handled for you',
    'Guest prep support before each recording',
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
    <section id="pricing" className="bg-transparent px-4 py-12 md:py-20">
      <div className="container mx-auto">
        <div
          ref={ref}
          className={`transition-all duration-700 ${
            isVisible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-8'
          }`}
        >
          <div className="grid gap-8 xl:grid-cols-[0.92fr_1.08fr] xl:items-start">
            <div className="max-w-2xl">
              <p className="section-kicker">Pricing</p>
              <h2 className="mt-4 font-editorial text-4xl leading-[0.94] tracking-[-0.045em] text-[#0d1b2a] sm:text-5xl md:text-6xl">
                Clear pricing, managed outreach, and a real delivery commitment.
              </h2>
              <p className="mt-5 text-base leading-8 text-[#54473d] sm:text-lg">
                This is for buyers who care more about audience fit than vanity reach. You can see the work, approve the targets, and know what the monthly fee is tied to.
              </p>

              <div className="mt-8 grid gap-4">
                {comparisons.map((comparison) => (
                  <div
                    key={comparison.option}
                    className={`rounded-[24px] border p-5 ${
                      comparison.option === 'Get On A Pod'
                        ? 'border-[#b46a3c]/18 bg-[#fff3e8]'
                        : 'border-[#0d1b2a]/8 bg-white/92'
                    }`}
                  >
                    <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                      <div className="max-w-xl">
                        <p className="font-display text-2xl font-semibold tracking-[-0.03em] text-[#0d1b2a]">
                          {comparison.option}
                        </p>
                        <p className="mt-2 text-sm leading-7 text-[#54473d]">{comparison.tradeoff}</p>
                      </div>
                      <p className="font-mono text-sm uppercase tracking-[0.18em] text-[#7a6554]">
                        {comparison.cost}
                      </p>
                    </div>
                  </div>
                ))}
              </div>

              <div className="mt-8 rounded-[28px] border border-[#0d1b2a]/8 bg-[#fffaf4]/92 p-6 shadow-[0_18px_36px_rgba(13,27,42,0.08)]">
                <div className="flex items-start gap-4">
                  <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-[16px] bg-[#f4ede4] text-[#b46a3c]">
                    <Shield className="h-6 w-6" strokeWidth={1.8} />
                  </div>
                  <div>
                    <p className="font-display text-2xl font-semibold tracking-[-0.03em] text-[#0d1b2a]">
                      Premium placements stay optional
                    </p>
                    <p className="mt-2 text-sm leading-7 text-[#54473d]">
                      Earned outreach comes first. If you want curated paid opportunities, they sit alongside the core service rather than replacing it.
                    </p>
                  </div>
                </div>
              </div>
            </div>

            <div className="space-y-5">
              <div className="rounded-[32px] border border-[#0d1b2a]/10 bg-[#fffdf9] p-6 shadow-[0_24px_55px_rgba(13,27,42,0.12)] sm:p-8">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                  <div>
                    <div className="mb-4 inline-flex items-center gap-2">
                      <Sparkles className="h-5 w-5 text-[#b46a3c]" />
                      <span className="rounded-full border border-[#0d1b2a]/10 bg-[#f6efe7] px-3 py-1 font-mono text-[11px] uppercase tracking-[0.2em] text-[#7a6554]">
                        Core plan
                      </span>
                    </div>
                    <h3 className="font-display text-3xl font-semibold tracking-[-0.04em] text-[#0d1b2a]">
                      {plan.name}
                    </h3>
                    <div className="mt-3 flex items-end gap-2">
                      <span className="font-display text-6xl font-semibold tracking-[-0.06em] text-[#0d1b2a]">
                        {plan.price}
                      </span>
                      <span className="pb-2 text-base text-[#76665a]">{plan.period}</span>
                    </div>
                    <p className="mt-2 text-sm text-[#76665a]">
                      Month-to-month. Includes a placement commitment.
                    </p>
                  </div>

                  <div className="rounded-[20px] border border-[#0d1b2a]/8 bg-[#fff3e8] px-4 py-3 text-sm leading-6 text-[#3f342c]">
                    <p className="font-mono text-[11px] uppercase tracking-[0.18em] text-[#7a6554]">Best for</p>
                    <p className="mt-2">
                      Experts who want the outreach handled without losing approval control or visibility.
                    </p>
                  </div>
                </div>

                <ul className="mt-8 grid gap-3">
                  {plan.features.map((feature) => (
                    <li
                      key={feature}
                      className="group flex cursor-pointer items-start gap-3 rounded-[20px] border border-[#0d1b2a]/8 bg-white px-4 py-4 transition-colors hover:bg-[#fff8f0]"
                      onClick={() => setSelectedFeature(feature)}
                    >
                      <Check className="mt-0.5 h-5 w-5 shrink-0 text-[#b46a3c]" />
                      <span className="flex-1 text-sm leading-7 text-[#3f342c]">{feature}</span>
                      <Info className="mt-0.5 h-4 w-4 shrink-0 text-[#b46a3c] opacity-0 transition-opacity group-hover:opacity-100" />
                    </li>
                  ))}
                </ul>

                <div className="mt-8 flex flex-col gap-3 sm:flex-row">
                  <Button variant="hero" size="lg" className="w-full rounded-full px-7 sm:w-auto" asChild>
                    <a href="https://calendly.com/getonapodjg/30min" target="_blank" rel="noopener noreferrer">
                      Book My Shortlist Call
                    </a>
                  </Button>
                  <Button variant="heroOutline" size="lg" className="w-full rounded-full px-7 sm:w-auto" asChild>
                    <a href="/what-to-expect">See what happens after sign-up</a>
                  </Button>
                </div>
              </div>

              <div className="rounded-[28px] border border-[#0d1b2a]/8 bg-[#081a2b] p-6 text-[#f7fafc] shadow-[0_20px_42px_rgba(13,27,42,0.18)]">
                <div className="grid gap-4 md:grid-cols-3">
                  <div className="rounded-[18px] border border-white/10 bg-white/5 px-4 py-4">
                    <p className="text-sm font-medium text-[#f7fafc]">Month-to-month</p>
                    <p className="mt-2 text-sm leading-6 text-[#d8c8b5]">No long lock-in just to get started.</p>
                  </div>
                  <div className="rounded-[18px] border border-white/10 bg-white/5 px-4 py-4">
                    <p className="text-sm font-medium text-[#f7fafc]">Approval first</p>
                    <p className="mt-2 text-sm leading-6 text-[#d8c8b5]">You review targets before outreach begins.</p>
                  </div>
                  <div className="rounded-[18px] border border-white/10 bg-white/5 px-4 py-4">
                    <p className="text-sm font-medium text-[#f7fafc]">Placement commitment</p>
                    <p className="mt-2 text-sm leading-6 text-[#d8c8b5]">The fee is tied to real delivery, not vague activity.</p>
                  </div>
                </div>

                <a
                  href="/what-to-expect"
                  className="mt-5 inline-flex items-center gap-2 text-sm font-medium text-[#f0ddc8] transition hover:gap-3"
                >
                  See onboarding and delivery details
                  <ArrowRight className="h-4 w-4" />
                </a>
              </div>
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
