import { ArrowRight, X } from 'lucide-react';
import { useScrollAnimation } from '@/hooks/useScrollAnimation';

const painCards = [
  {
    title: 'Wrong shows',
    description: 'Big audience, poor buyer fit. You spend time chasing visibility that never turns into trust.',
  },
  {
    title: 'Generic pitches',
    description: 'Hosts ignore agency-sounding outreach that feels templated, lazy, or misaligned with the show.',
  },
  {
    title: 'No tracking',
    description: 'Replies, bookings, recording dates, and publishing links disappear across inboxes and spreadsheets.',
  },
];

const ProblemSection = () => {
  const { ref, isVisible } = useScrollAnimation<HTMLDivElement>();

  return (
    <section className="bg-[#081a2b] px-4 py-14 text-[#f7fafc] md:py-20">
      <div className="container mx-auto px-4 sm:px-6">
        <div
          ref={ref}
          className={`grid gap-10 transition-all duration-700 lg:grid-cols-[0.9fr_1.1fr] lg:gap-16 ${
            isVisible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-8'
          }`}
        >
          <div className="max-w-xl">
            <p className="section-kicker text-[#8cb0dd]">The friction</p>
            <h2 className="mt-5 font-display text-4xl font-semibold leading-[1] tracking-[-0.05em] text-balance md:text-6xl">
              Getting on the right podcasts should not take 10 hours a week.
            </h2>
            <p className="mt-6 text-lg leading-8 text-[#c7d9ee]">
              Finding shows, checking fit, writing custom pitches, following up, coordinating schedules,
              and tracking publication dates quickly becomes a second job. Most experts either stall out,
              send generic outreach, or get booked on shows their buyers do not even listen to.
            </p>

            <div className="mt-8 rounded-[28px] border border-white/10 bg-white/5 p-6">
              <p className="section-kicker text-[#8cb0dd]">What GOAP replaces</p>
              <div className="mt-4 grid gap-4 sm:grid-cols-3">
                <div>
                  <p className="font-display text-3xl font-semibold tracking-[-0.05em]">Research</p>
                  <p className="mt-2 text-sm leading-6 text-[#9bb5d2]">Finding shows that actually fit your expertise and buyer profile.</p>
                </div>
                <div>
                  <p className="font-display text-3xl font-semibold tracking-[-0.05em]">Follow-up</p>
                  <p className="mt-2 text-sm leading-6 text-[#9bb5d2]">Persistent outreach without making your brand sound mass-produced.</p>
                </div>
                <div>
                  <p className="font-display text-3xl font-semibold tracking-[-0.05em]">Booking ops</p>
                  <p className="mt-2 text-sm leading-6 text-[#9bb5d2]">Scheduling, prep, and keeping every interview moving toward publish.</p>
                </div>
              </div>
            </div>
          </div>

          <div className="grid gap-4">
            {painCards.map((card, index) => (
              <div
                key={card.title}
                className="rounded-[26px] border border-white/10 bg-[#10263b] p-6 transition-all duration-500"
                style={{ transitionDelay: `${index * 100}ms` }}
              >
                <div className="flex items-start gap-4">
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[#2d6df6]/14">
                    <X className="h-4 w-4 text-[#8cb0dd]" />
                  </div>
                  <div>
                    <p className="text-lg font-semibold tracking-[-0.03em] text-[#f7fafc]">{card.title}</p>
                    <p className="mt-2 text-base leading-7 text-[#c7d9ee]">{card.description}</p>
                  </div>
                </div>
              </div>
            ))}
            <div className="rounded-[26px] border border-[#8cb0dd]/24 bg-[#8cb0dd]/10 p-6">
              <p className="section-kicker text-[#bdd0e8]">The shift</p>
              <p className="mt-3 font-display text-3xl font-semibold tracking-[-0.05em] text-[#f7fafc]">
                Stop treating podcast guesting like a side task. Run it like a pipeline.
              </p>
              <a
                href="#how-it-works"
                className="mt-4 inline-flex items-center gap-2 text-sm font-medium text-[#d6e5f5] transition hover:gap-3"
              >
                See the workflow
                <ArrowRight className="h-4 w-4" />
              </a>
            </div>
            <div className="rounded-[26px] border border-white/10 bg-white/5 p-6">
              <p className="section-kicker text-[#8cb0dd]">Reality check</p>
              <p className="mt-3 text-base leading-7 text-[#c7d9ee]">
                The bottleneck is rarely your expertise. It is the targeting, outreach discipline,
                and visibility needed to get invited consistently.
              </p>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
};

export default ProblemSection;
