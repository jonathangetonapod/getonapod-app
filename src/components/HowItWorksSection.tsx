import { useScrollAnimation } from '@/hooks/useScrollAnimation';
import { ArrowRight, Calendar, ClipboardList, Mail, Mic, MonitorCheck, Sparkles } from 'lucide-react';

const steps = [
  {
    number: "01",
    title: "Authority audit",
    description: "We clarify your positioning, audience, stories, and the topics hosts will actually care about.",
    icon: Calendar,
  },
  {
    number: "02",
    title: "Podcast matching",
    description: "We build a curated target list using podcast data, fit scoring, and human review.",
    icon: ClipboardList,
  },
  {
    number: "03",
    title: "Pitch campaign",
    description: "We send personalized outreach and handle the follow-up without breaking your voice.",
    icon: Mail,
  },
  {
    number: "04",
    title: "Booking and prep",
    description: "We coordinate scheduling, lock dates, and help you show up sharp for the interview.",
    icon: Mic,
  },
  {
    number: "05",
    title: "Track and publish",
    description: "Your portal shows what is pitched, booked, recorded, and published in one pipeline.",
    icon: MonitorCheck,
  },
  {
    number: "06",
    title: "Optional amplification",
    description: "Repurpose the interview into content assets that keep the authority compounding after it airs.",
    icon: Sparkles,
  },
];

const HowItWorksSection = () => {
  const { ref, isVisible } = useScrollAnimation<HTMLDivElement>();

  return (
    <section id="how-it-works" className="bg-[#f3f5f7] px-4 py-12 md:py-20">
      <div className="container mx-auto px-4">
        <div
          ref={ref}
          className={`transition-all duration-700 ${
            isVisible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-8'
          }`}
        >
          <div className="grid gap-10 lg:grid-cols-[0.82fr_1.18fr] lg:items-start">
            <div className="max-w-xl">
              <p className="section-kicker">Process</p>
              <h2 className="mt-4 font-display text-4xl font-semibold tracking-[-0.05em] text-[#0d1b2a] sm:text-5xl md:text-6xl">
                From positioning to published episode.
              </h2>
              <p className="mt-5 text-base leading-8 text-[#4c5d73] sm:text-lg">
                The workflow is designed to reduce friction for you while preserving quality control.
                You stay visible to the process without becoming the process.
              </p>

              <div className="mt-8 rounded-[28px] border border-[#0d1b2a]/8 bg-[#ffffff] p-6 shadow-[0_16px_34px_rgba(13,27,42,0.08)]">
                <p className="section-kicker">You leave the first call with</p>
                <ul className="mt-4 space-y-3 text-sm leading-6 text-[#30465f]">
                  <li className="flex items-start gap-3">
                    <span className="mt-2 h-1.5 w-1.5 rounded-full bg-[#18c08f]" />
                    A clearer authority angle for podcast outreach
                  </li>
                  <li className="flex items-start gap-3">
                    <span className="mt-2 h-1.5 w-1.5 rounded-full bg-[#18c08f]" />
                    A shortlist and approval workflow, not vague promises
                  </li>
                  <li className="flex items-start gap-3">
                    <span className="mt-2 h-1.5 w-1.5 rounded-full bg-[#18c08f]" />
                    A clear view of how booking and tracking will work
                  </li>
                </ul>
              </div>
            </div>

            <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">
              {steps.map((step, index) => {
                const Icon = step.icon;

                return (
                  <article
                    key={step.number}
                    className="rounded-[28px] border border-[#0d1b2a]/8 bg-[#ffffff] p-6 shadow-[0_16px_34px_rgba(13,27,42,0.08)]"
                    style={{ transitionDelay: `${index * 80}ms` }}
                  >
                    <div className="flex items-center justify-between gap-3">
                      <span className="font-mono text-xs uppercase tracking-[0.28em] text-[#2d6df6]">
                        {step.number}
                      </span>
                      <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-[#eef4ff] text-[#2d6df6]">
                        <Icon className="h-5 w-5" strokeWidth={1.8} />
                      </div>
                    </div>
                    <h3 className="mt-5 font-display text-2xl font-semibold tracking-[-0.04em] text-[#0d1b2a]">
                      {step.title}
                    </h3>
                    <p className="mt-3 text-sm leading-7 text-[#4c5d73]">
                      {step.description}
                    </p>
                  </article>
                );
              })}
            </div>

          <div className="mt-10 text-center">
            <a
              href="#command-center"
              className="inline-flex items-center gap-2 text-base font-semibold text-[#2d6df6] transition-all hover:gap-3"
            >
              See the client portal
              <ArrowRight className="h-5 w-5" />
            </a>
          </div>
        </div>
      </div>
    </section>
  );
};

export default HowItWorksSection;
