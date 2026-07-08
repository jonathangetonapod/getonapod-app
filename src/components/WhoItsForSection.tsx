import { ArrowRight, Landmark, Megaphone, Rocket, UserRound } from 'lucide-react';
import { useScrollAnimation } from '@/hooks/useScrollAnimation';

const audiences = [
  {
    title: 'Founders',
    description: 'Build category authority, investor credibility, and demand with shows your buyers already follow.',
    icon: Rocket,
  },
  {
    title: 'Financial professionals',
    description: 'Educate the market, stay focused on trust, and turn complex viewpoints into clear guest angles.',
    icon: Landmark,
  },
  {
    title: 'Consultants and agencies',
    description: 'Turn expertise into repeatable thought leadership without needing your own media operation.',
    icon: Megaphone,
  },
  {
    title: 'Authors and speakers',
    description: 'Get in front of audiences already interested in your ideas, message, and frameworks.',
    icon: UserRound,
  },
];

const WhoItsForSection = () => {
  const { ref, isVisible } = useScrollAnimation<HTMLDivElement>();

  return (
    <section id="who-its-for" className="bg-[#edf2f7] px-4 py-12 md:py-20">
      <div className="container mx-auto">
        <div
          ref={ref}
          className={`transition-all duration-700 ${
            isVisible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-8'
          }`}
        >
          <div className="mx-auto max-w-3xl text-center">
            <p className="section-kicker">Who it is for</p>
            <h2 className="mt-4 font-display text-4xl font-semibold tracking-[-0.05em] text-[#0d1b2a] sm:text-5xl md:text-6xl">
              Built for experts whose buyers need trust before they buy.
            </h2>
            <p className="mx-auto mt-5 max-w-2xl text-base leading-8 text-[#4c5d73] sm:text-lg">
              GOAP works best when you have real expertise, a clear point of view, and a market
              that buys after credibility is established.
            </p>
          </div>

          <div className="mx-auto mt-10 grid max-w-6xl gap-5 md:grid-cols-2 xl:grid-cols-4">
            {audiences.map((audience, index) => {
              const Icon = audience.icon;

              return (
                <article
                  key={audience.title}
                  className="rounded-[28px] border border-[#0d1b2a]/8 bg-[#ffffff] p-6 shadow-[0_16px_34px_rgba(13,27,42,0.08)]"
                  style={{ transitionDelay: `${index * 100}ms` }}
                >
                  <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-[#eef4ff] text-[#2d6df6]">
                    <Icon className="h-7 w-7" strokeWidth={1.8} />
                  </div>
                  <h3 className="mt-5 font-display text-2xl font-semibold tracking-[-0.04em] text-[#0d1b2a]">
                    {audience.title}
                  </h3>
                  <p className="mt-3 text-sm leading-7 text-[#4c5d73]">{audience.description}</p>
                </article>
              );
            })}
          </div>

          <div className="mx-auto mt-8 flex max-w-6xl flex-col gap-4 rounded-[28px] border border-[#0d1b2a]/8 bg-[#ffffff] p-6 shadow-[0_16px_34px_rgba(13,27,42,0.06)] md:flex-row md:items-center md:justify-between">
            <div>
              <p className="section-kicker">Best fit</p>
              <p className="mt-3 max-w-3xl text-base leading-7 text-[#30465f]">
                The strongest campaigns come from clients with clear expertise, usable stories, and a willingness to show up prepared.
              </p>
            </div>
            <a href="#pricing" className="inline-flex items-center gap-2 text-sm font-semibold text-[#2d6df6] transition hover:gap-3">
              See plans
              <ArrowRight className="h-4 w-4" />
            </a>
          </div>
        </div>
      </div>
    </section>
  );
};

export default WhoItsForSection;
