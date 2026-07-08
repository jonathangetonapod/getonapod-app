import { useScrollAnimation } from '@/hooks/useScrollAnimation';
import { Badge } from '@/components/ui/badge';
import { BarChart3, CheckCircle2, Mail, Monitor, Sparkles } from 'lucide-react';

const reviewList = [
  'Approve target shows before outreach starts',
  'See why each show fits your audience and topic',
  'Leave notes so the targeting stays aligned with your brand',
];

const portalCards = [
  {
    icon: Mail,
    title: 'Outreach engine',
    description: 'See who has been pitched, who replied, and what needs attention without chasing updates.',
    items: ['Live campaign pipeline', 'Status by show', 'Clear next-step visibility'],
  },
  {
    icon: BarChart3,
    title: 'Visibility and reporting',
    description: 'Track booked interviews, recording dates, publish dates, and live links month over month.',
    items: ['Recording calendar', 'Published episode links', 'Campaign momentum by stage'],
  },
];

const WhatYouGetSection = () => {
  const { ref, isVisible } = useScrollAnimation<HTMLDivElement>();

  return (
    <section id="command-center" className="bg-transparent px-4 py-12 md:py-20">
      <div className="container mx-auto">
        <div
          ref={ref}
          className={`transition-all duration-700 ${
            isVisible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-8'
          }`}
        >
          <div className="grid gap-8 xl:grid-cols-[0.96fr_1.04fr] xl:items-end">
            <div className="max-w-3xl">
              <div className="mb-4 inline-flex items-center gap-2">
                <Sparkles className="h-5 w-5 text-[#b46a3c]" />
                <Badge variant="outline" className="border-[#0d1b2a]/10 bg-[#fffaf4] text-xs text-[#54473d]">
                  Private client portal
                </Badge>
              </div>
              <h2 className="font-editorial text-4xl leading-[0.94] tracking-[-0.045em] text-[#0d1b2a] sm:text-5xl md:text-6xl">
                Approve shows, track outreach, and see every booking without asking for updates.
              </h2>
              <p className="mt-5 max-w-2xl text-base leading-8 text-[#54473d] sm:text-lg">
                Instead of monthly PDFs and scattered email threads, your portal shows recommended podcasts, approvals, outreach status, recording dates, and published episodes in one place.
              </p>
            </div>

            <div className="rounded-[28px] border border-[#0d1b2a]/8 bg-[#fffaf4]/92 p-6 shadow-[0_18px_36px_rgba(13,27,42,0.08)]">
              <p className="section-kicker">What the portal changes</p>
              <p className="mt-3 text-base leading-7 text-[#54473d]">
                You stay in control without becoming the project manager. Approvals are clear, campaign state is visible, and every stage has a next step.
              </p>
            </div>
          </div>

          <div className="mt-8 grid gap-5 xl:grid-cols-[1.08fr_0.92fr]">
            <div className="overflow-hidden rounded-[30px] border border-[#0d1b2a]/10 bg-[#081a2b] p-5 text-[#f7fafc] shadow-[0_28px_60px_rgba(13,27,42,0.18)]">
              <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
                <div>
                  <p className="section-kicker text-[#d4b08f]">Portal preview</p>
                  <h3 className="mt-2 font-display text-3xl font-semibold tracking-[-0.04em]">
                    Approval desk
                  </h3>
                </div>
                <div className="rounded-full border border-[#d4b08f]/25 bg-[#d4b08f]/10 px-3 py-1 font-mono text-[10px] uppercase tracking-[0.2em] text-[#f0ddc8]">
                  Live
                </div>
              </div>

              <div className="mt-5 grid gap-4 lg:grid-cols-[0.98fr_1.02fr]">
                <div className="rounded-[22px] border border-white/10 bg-white/5 px-4 py-4">
                  <p className="section-kicker text-[#d4b08f]">Review flow</p>
                  <div className="mt-4 grid gap-3">
                    {reviewList.map((item, index) => (
                      <div key={item} className="flex items-start gap-3 rounded-[18px] border border-white/10 bg-white/5 px-4 py-3">
                        <span className="font-mono text-xs text-[#d4b08f]">0{index + 1}</span>
                        <span className="text-sm leading-6 text-[#d8c8b5]">{item}</span>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="grid gap-4 md:grid-cols-2">
                  <div className="rounded-[22px] border border-white/10 bg-white/5 p-5">
                    <p className="section-kicker text-[#d4b08f]">Pipeline</p>
                    <div className="mt-4 space-y-3">
                      <div className="flex items-center justify-between rounded-[16px] bg-white/5 px-4 py-3 text-sm text-[#d8c8b5]">
                        <span>Pitch sent</span>
                        <span className="font-semibold text-[#f7fafc]">14</span>
                      </div>
                      <div className="flex items-center justify-between rounded-[16px] bg-white/5 px-4 py-3 text-sm text-[#d8c8b5]">
                        <span>Booked</span>
                        <span className="font-semibold text-[#f7fafc]">4</span>
                      </div>
                      <div className="flex items-center justify-between rounded-[16px] bg-white/5 px-4 py-3 text-sm text-[#d8c8b5]">
                        <span>Publishing soon</span>
                        <span className="font-semibold text-[#f7fafc]">2</span>
                      </div>
                    </div>
                  </div>

                  <div className="rounded-[22px] border border-[#d4b08f]/20 bg-[#132436] p-5">
                    <p className="section-kicker text-[#d4b08f]">Visibility</p>
                    <p className="mt-3 text-sm leading-7 text-[#d8c8b5]">
                      Recording dates, published links, and attention-needed alerts all live in one place.
                    </p>
                  </div>
                </div>
              </div>
            </div>

            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-2">
              <article className="rounded-[26px] border border-[#0d1b2a]/8 bg-white/92 p-6 shadow-[0_16px_34px_rgba(13,27,42,0.08)] md:col-span-2">
                <div className="grid gap-5 lg:grid-cols-[0.52fr_0.48fr] lg:items-start">
                  <div>
                    <div className="flex h-14 w-14 items-center justify-center rounded-[16px] bg-[#f4ede4] text-[#b46a3c]">
                      <Monitor className="h-7 w-7" strokeWidth={1.8} />
                    </div>
                    <h3 className="mt-5 font-display text-3xl font-semibold tracking-[-0.04em] text-[#0d1b2a]">
                      Approval-first workflow
                    </h3>
                    <p className="mt-3 text-sm leading-7 text-[#54473d]">
                      You stay in control without having to manage the campaign yourself.
                    </p>
                  </div>

                  <ul className="space-y-3">
                    {reviewList.map((item) => (
                      <li key={item} className="flex items-start gap-3 text-sm leading-6 text-[#3f342c]">
                        <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-[#b46a3c]" />
                        <span>{item}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              </article>

              {portalCards.map((card) => {
                const Icon = card.icon;

                return (
                  <article
                    key={card.title}
                    className="rounded-[26px] border border-[#0d1b2a]/8 bg-white/92 p-6 shadow-[0_16px_34px_rgba(13,27,42,0.08)]"
                  >
                    <div className="flex h-14 w-14 items-center justify-center rounded-[16px] bg-[#f4ede4] text-[#b46a3c]">
                      <Icon className="h-7 w-7" strokeWidth={1.8} />
                    </div>
                    <h3 className="mt-5 font-display text-2xl font-semibold tracking-[-0.04em] text-[#0d1b2a]">
                      {card.title}
                    </h3>
                    <p className="mt-3 text-sm leading-7 text-[#54473d]">{card.description}</p>
                    <ul className="mt-5 space-y-3">
                      {card.items.map((item) => (
                        <li key={item} className="flex items-start gap-3 text-sm leading-6 text-[#3f342c]">
                          <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-[#b46a3c]" />
                          <span>{item}</span>
                        </li>
                      ))}
                    </ul>
                  </article>
                );
              })}

              <div className="rounded-[26px] border border-[#0d1b2a]/8 bg-[#fffaf4]/92 p-6 md:col-span-2">
                <p className="section-kicker">No more checking in</p>
                <p className="mt-3 text-base leading-7 text-[#3f342c]">
                  You should not have to ask where things stand. The portal shows every opportunity from first pitch to published episode.
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
};

export default WhatYouGetSection;
