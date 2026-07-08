import { Button } from '@/components/ui/button';
import { useScrollAnimation } from '@/hooks/useScrollAnimation';
import { Brain, Mail, MonitorSmartphone } from 'lucide-react';

const pillars = [
  {
    title: 'Match',
    description: 'We find shows based on your expertise, buyer profile, category, and authority goals.',
    icon: Brain,
    points: ['AI-assisted show research', 'Human review for audience fit', 'Shortlist approval before outreach'],
  },
  {
    title: 'Pitch',
    description: 'We create personalized outreach that sounds like you, not a generic agency template.',
    icon: Mail,
    points: ['Positioning angles based on your story', 'Host-specific personalization', 'Follow-up handled for you'],
  },
  {
    title: 'Track',
    description: 'You see every opportunity, booking, recording, and published episode inside your portal.',
    icon: MonitorSmartphone,
    points: ['Live status pipeline', 'Recording and publish dates', 'One place to review progress'],
  },
];

const SolutionSection = () => {
  const { ref, isVisible } = useScrollAnimation<HTMLDivElement>();

  return (
    <section className="bg-[#f3f5f7] px-4 py-10 md:py-20">
      <div className="container mx-auto px-4 sm:px-6">
        <div
          ref={ref}
          className={`transition-all duration-700 ${
            isVisible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-8'
          }`}
        >
          <div className="mx-auto max-w-3xl text-center">
            <p className="section-kicker mb-4">The system</p>
            <h2 className="font-display text-4xl font-semibold tracking-[-0.05em] text-[#0d1b2a] sm:text-5xl md:text-6xl">
              A complete podcast placement system, not a spreadsheet.
            </h2>
            <p className="mx-auto mt-5 max-w-3xl text-base leading-8 text-[#4c5d73] sm:text-lg md:text-xl">
              We combine human outreach with AI-assisted podcast research, fit scoring, and transparent tracking
              so every campaign stays targeted, organized, and accountable.
            </p>
          </div>

          <div className="mt-10 grid gap-5 lg:grid-cols-3">
            {pillars.map((pillar, index) => {
              const Icon = pillar.icon;

              return (
                <article
                  key={pillar.title}
                  className="rounded-[28px] border border-[#0d1b2a]/8 bg-[#ffffff] p-6 text-left shadow-[0_18px_40px_rgba(13,27,42,0.08)]"
                  style={{ transitionDelay: `${index * 100}ms` }}
                >
                  <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-[#eef4ff] text-[#2d6df6]">
                    <Icon className="h-7 w-7" strokeWidth={1.8} />
                  </div>
                  <h3 className="mt-5 font-display text-3xl font-semibold tracking-[-0.05em] text-[#0d1b2a]">
                    {pillar.title}
                  </h3>
                  <p className="mt-3 text-base leading-7 text-[#4c5d73]">{pillar.description}</p>

                  <ul className="mt-5 space-y-3">
                    {pillar.points.map((point) => (
                      <li key={point} className="flex items-start gap-3 text-sm leading-6 text-[#30465f]">
                        <span className="mt-2 h-1.5 w-1.5 rounded-full bg-[#2d6df6]" />
                        <span>{point}</span>
                      </li>
                    ))}
                  </ul>
                </article>
              );
            })}
          </div>

          <div className="mt-10 flex justify-center">
            <Button variant="hero" size="lg" className="w-full sm:w-auto min-h-[48px] rounded-full px-7" asChild>
              <a href="#how-it-works">See How It Works</a>
            </Button>
          </div>
        </div>
      </div>
    </section>
  );
};

export default SolutionSection;
