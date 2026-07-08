import { useScrollAnimation } from '@/hooks/useScrollAnimation';
import { Badge } from '@/components/ui/badge';
import { BarChart3, CheckCircle2, Mail, Monitor, Sparkles } from 'lucide-react';

const reviewList = [
  'Approve shows before any outreach goes live',
  'See fit reasoning, audience, and category context',
  'Add notes so the campaign stays aligned with your brand',
];

const portalCards = [
  {
    icon: Mail,
    title: 'Outreach engine',
    description: 'Track pitches, follow-ups, and replies without asking for a status update.',
    items: ['Live campaign pipeline', 'Status by show', 'Clear next-step visibility'],
  },
  {
    icon: BarChart3,
    title: 'Visibility and reporting',
    description: 'See what is booked, recorded, publishing, and live month over month.',
    items: ['Recording calendar', 'Published episode links', 'Campaign momentum by stage'],
  },
];

const WhatYouGetSection = () => {
  const { ref, isVisible } = useScrollAnimation<HTMLDivElement>();

  return (
    <section id="command-center" className="bg-[#eaf0f6] px-4 py-12 md:py-20">
      <div className="container mx-auto px-4">
        <div
          ref={ref}
          className={`transition-all duration-700 ${
            isVisible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-8'
          }`}
        >
          <div className="grid gap-10 lg:grid-cols-[1.08fr_0.92fr] lg:items-start">
            <div>
              <div className="mb-4 inline-flex items-center gap-2">
                <Sparkles className="h-5 w-5 text-[#2d6df6]" />
                <Badge variant="outline" className="border-[#0d1b2a]/10 bg-[#ffffff] text-xs text-[#30465f]">
                  Private client portal
                </Badge>
              </div>
              <h2 className="font-display text-4xl font-semibold tracking-[-0.05em] text-[#0d1b2a] sm:text-5xl md:text-6xl">
                Know exactly what is happening with every podcast opportunity.
              </h2>
              <p className="mt-5 max-w-2xl text-base leading-8 text-[#4c5d73] sm:text-lg">
                Most agencies send a monthly PDF or an occasional update. GOAP gives you a live command center
                so you can review shows, follow the pipeline, and see every booking from first pitch to published episode.
              </p>

              <div className="mt-8 overflow-hidden rounded-[28px] border border-[#0d1b2a]/10 bg-[#081a2b] p-4 text-[#f7fafc] shadow-[0_24px_55px_rgba(13,27,42,0.18)] sm:rounded-[32px] sm:p-5">
                <div className="rounded-[24px] border border-white/10 bg-white/5 px-4 py-4 sm:px-5">
                  <div className="flex flex-col items-start gap-3 sm:flex-row sm:items-center sm:justify-between">
                    <div>
                      <p className="section-kicker text-[#8cb0dd]">Client portal preview</p>
                      <h3 className="mt-2 font-display text-2xl font-semibold tracking-[-0.05em]">
                        Approval desk
                      </h3>
                    </div>
                    <div className="rounded-full border border-[#8cb0dd]/25 bg-[#8cb0dd]/10 px-3 py-1 font-mono text-[10px] uppercase tracking-[0.24em] text-[#dce9f7]">
                      Live
                    </div>
                  </div>

                  <div className="mt-5 grid gap-3">
                    {reviewList.map((item, index) => (
                      <div key={item} className="flex items-start gap-3 rounded-2xl border border-white/10 bg-white/5 px-4 py-3">
                        <span className="font-mono text-xs text-[#8cb0dd]">0{index + 1}</span>
                        <span className="text-sm leading-6 text-[#d6e5f5]">{item}</span>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="mt-4 grid gap-4 md:grid-cols-2">
                  <div className="rounded-[24px] border border-white/10 bg-white/5 p-5">
                    <p className="section-kicker text-[#8cb0dd]">Pipeline</p>
                    <div className="mt-4 space-y-3">
                      <div className="flex items-center justify-between rounded-2xl bg-white/5 px-4 py-3 text-sm text-[#d6e5f5]">
                        <span>Pitch sent</span>
                        <span className="font-semibold text-[#8cb0dd]">14</span>
                      </div>
                      <div className="flex items-center justify-between rounded-2xl bg-white/5 px-4 py-3 text-sm text-[#d6e5f5]">
                        <span>Booked</span>
                        <span className="font-semibold text-[#b8ccff]">4</span>
                      </div>
                      <div className="flex items-center justify-between rounded-2xl bg-white/5 px-4 py-3 text-sm text-[#d6e5f5]">
                        <span>Publishing soon</span>
                        <span className="font-semibold text-[#b8ccff]">2</span>
                      </div>
                    </div>
                  </div>

                  <div className="rounded-[24px] border border-white/10 bg-[#132a44] p-5">
                    <p className="section-kicker text-[#8cb0dd]">Visibility</p>
                    <p className="mt-3 text-sm leading-7 text-[#d6e5f5]">
                      Recording dates, published episode links, and attention-needed alerts all live in one place.
                    </p>
                  </div>
                </div>
              </div>
            </div>

            <div className="grid gap-5">
              <article className="rounded-[28px] border border-[#0d1b2a]/8 bg-[#ffffff] p-6 shadow-[0_16px_34px_rgba(13,27,42,0.08)]">
                <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-[#eef4ff] text-[#2d6df6]">
                  <Monitor className="h-7 w-7" strokeWidth={1.8} />
                </div>
                <h3 className="mt-5 font-display text-3xl font-semibold tracking-[-0.05em] text-[#0d1b2a]">
                  Approval-first workflow
                </h3>
                <p className="mt-3 text-sm leading-7 text-[#4c5d73]">
                  You stay in control without having to manage the campaign yourself.
                </p>
                <ul className="mt-5 space-y-3">
                  {reviewList.map((item) => (
                    <li key={item} className="flex items-start gap-3 text-sm leading-6 text-[#30465f]">
                      <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-[#2d6df6]" />
                      <span>{item}</span>
                    </li>
                  ))}
                </ul>
              </article>

              {portalCards.map((card, index) => {
                const Icon = card.icon;

                return (
                  <article
                    key={card.title}
                    className="rounded-[28px] border border-[#0d1b2a]/8 bg-[#ffffff] p-6 shadow-[0_16px_34px_rgba(13,27,42,0.08)]"
                    style={{ transitionDelay: `${index * 100}ms` }}
                  >
                    <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-[#eef4ff] text-[#2d6df6]">
                      <Icon className="h-7 w-7" strokeWidth={1.8} />
                    </div>
                    <h3 className="mt-5 font-display text-3xl font-semibold tracking-[-0.05em] text-[#0d1b2a]">
                      {card.title}
                    </h3>
                    <p className="mt-3 text-sm leading-7 text-[#4c5d73]">{card.description}</p>
                    <ul className="mt-5 space-y-3">
                      {card.items.map((item) => (
                        <li key={item} className="flex items-start gap-3 text-sm leading-6 text-[#30465f]">
                          <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-[#2d6df6]" />
                          <span>{item}</span>
                        </li>
                      ))}
                    </ul>
                  </article>
                );
              })}

              <div className="rounded-[28px] border border-[#2d6df6]/18 bg-[#eef4ff] p-6">
                <p className="section-kicker">No more checking in</p>
                <p className="mt-3 text-base leading-7 text-[#30465f]">
                  The portal shows the pipeline from first pitch to published episode, so you never need to ask what is happening.
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
