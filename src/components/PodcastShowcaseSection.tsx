import { useScrollAnimation } from '@/hooks/useScrollAnimation';
import { Button } from '@/components/ui/button';
import { ArrowRight, CheckCircle2, Mic, PlayCircle, Radio, TrendingUp } from 'lucide-react';

const stats = [
  {
    label: 'consumed a podcast in the last month',
    value: '58%',
    source: 'Infinite Dial 2026',
    icon: PlayCircle,
  },
  {
    label: 'ad recall among the most active podcast users',
    value: '86%',
    source: 'Sounds Profitable 2025',
    icon: TrendingUp,
  },
  {
    label: 'B2B decision-makers more receptive to strong thought leadership',
    value: '9 in 10',
    source: 'LinkedIn x Edelman',
    icon: Mic,
  },
];

const shortlistPrinciples = [
  {
    title: 'Room fit first',
    body: 'We start with host style, listener overlap, and whether your story belongs in the room.',
  },
  {
    title: 'Depth over noise',
    body: 'A strong hour on the right show outperforms shallow exposure on a bigger but weaker fit.',
  },
  {
    title: 'Content that travels',
    body: 'The best appearances also turn into clips, follow-up emails, and sales-call credibility.',
  },
];

const sampleRooms = [
  {
    label: 'Operator track',
    name: 'Founder Operator',
    audience: '18K founder and GTM listeners',
    format: 'Long-form interviews',
    fit: 'Best for B2B founders with a point of view built from real operating decisions.',
    note: 'Strong when the guest can teach through hiring, positioning, product, or go-to-market tradeoffs.',
  },
  {
    label: 'Finance track',
    name: 'WealthTech Weekly',
    audience: '22K fintech and advisory listeners',
    format: 'Topical market conversations',
    fit: 'Good for wealth, fintech, and infrastructure narratives that need strategic credibility.',
    note: 'Works best when the guest can connect company insight to larger market shifts buyers care about.',
  },
  {
    label: 'Growth track',
    name: 'Revenue Blueprint',
    audience: '15K SaaS and operator listeners',
    format: 'Tactical interviews',
    fit: 'Best for leaders who can explain a repeatable acquisition, retention, or expansion system.',
    note: 'The right episode leaves the audience with a framework they can use the same week.',
  },
];

const decisionSignals = [
  'Audience overlap beats raw vanity metrics.',
  'Host format decides whether your best stories actually land.',
  'A great appearance should help before and after the episode airs.',
];

const PodcastShowcaseSection = () => {
  const { ref, isVisible } = useScrollAnimation<HTMLDivElement>();
  const [featuredRoom, ...secondaryRooms] = sampleRooms;

  return (
    <section className="paper-noise relative overflow-hidden px-4 py-14 md:py-24" id="results">
      <div className="absolute left-0 top-24 h-[240px] w-[240px] rounded-full bg-[#2d6df6]/8 blur-3xl sm:h-[360px] sm:w-[360px]" />
      <div className="absolute right-0 top-0 h-[220px] w-[220px] rounded-full bg-[#dce7f5]/60 blur-3xl sm:h-[320px] sm:w-[320px]" />

      <div className="container relative mx-auto">
        <div
          ref={ref}
          className={`transition-all duration-700 ${
            isVisible ? 'translate-y-0 opacity-100' : 'translate-y-8 opacity-0'
          }`}
        >
          <div className="grid gap-10 xl:grid-cols-[0.78fr_1.22fr] xl:items-start">
            <div className="max-w-xl xl:sticky xl:top-28">
              <p className="section-kicker">Why podcasts work</p>
              <h2 className="mt-4 font-editorial text-4xl leading-[0.95] tracking-[-0.05em] text-[#0d1b2a] sm:text-5xl md:text-6xl">
                A shortlist is more than a pile of logos.
              </h2>
              <p className="mt-5 max-w-lg text-base leading-8 text-[#4c5d73] sm:text-lg">
                The right show gives buyers sustained time with your ideas in a context they already trust.
                That only works when the guest, the host, and the audience are aligned from the start.
              </p>

              <div className="mt-8 grid gap-4">
                {stats.map((stat) => {
                  const Icon = stat.icon;

                  return (
                    <div
                      key={stat.value}
                      className="rounded-[24px] border border-[#0d1b2a]/8 bg-[#ffffff]/86 p-5 shadow-[0_14px_30px_rgba(13,27,42,0.08)] backdrop-blur-sm"
                    >
                      <div className="flex items-start gap-4">
                        <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-[#eef4ff] text-[#2d6df6]">
                          <Icon className="h-6 w-6" strokeWidth={1.8} />
                        </div>
                        <div>
                          <p className="font-display text-4xl font-semibold tracking-[-0.05em] text-[#0d1b2a]">
                            {stat.value}
                          </p>
                          <p className="mt-2 text-sm leading-6 text-[#30465f]">{stat.label}</p>
                          <p className="mt-2 font-mono text-[11px] uppercase tracking-[0.26em] text-[#56708d]">
                            {stat.source}
                          </p>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>

              <div className="mt-8 rounded-[28px] border border-[#0d1b2a]/8 bg-[#081a2b] p-6 text-[#f7fafc] shadow-[0_18px_40px_rgba(13,27,42,0.18)]">
                <p className="section-kicker text-[#8cb0dd]">What GOAP actually does</p>
                <p className="mt-3 text-base leading-7 text-[#d6e5f5]">
                  We do not just find podcasts. We build a room-by-room guesting strategy that helps your story
                  land with the people most likely to buy, refer, or remember you.
                </p>
              </div>

              <div className="mt-8 flex flex-col gap-4 sm:flex-row">
                <Button variant="hero" size="lg" className="rounded-full px-7" asChild>
                  <a href="https://calendly.com/getonapodjg/30min" target="_blank" rel="noopener noreferrer">
                    Book My Shortlist Call
                  </a>
                </Button>
                <Button variant="heroOutline" size="lg" className="rounded-full px-7" asChild>
                  <a href="/premium-placements">View Premium Placements</a>
                </Button>
              </div>
            </div>

            <div className="space-y-5">
              <div className="rounded-[32px] border border-[#0d1b2a]/8 bg-[#ffffff]/82 p-6 shadow-[0_20px_42px_rgba(13,27,42,0.08)] backdrop-blur-sm md:p-7">
                <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
                  <div className="max-w-2xl">
                    <p className="section-kicker">Sample shortlist anatomy</p>
                    <h3 className="mt-3 font-display text-3xl font-semibold tracking-[-0.05em] text-[#0d1b2a] sm:text-4xl">
                      We shortlist by guest-story fit, not by random download counts.
                    </h3>
                  </div>
                  <div className="rounded-full border border-[#0d1b2a]/10 bg-[#f4f8fc] px-4 py-2 font-mono text-[10px] uppercase tracking-[0.22em] text-[#56708d]">
                    Representative examples
                  </div>
                </div>

                <div className="mt-6 grid gap-3 md:grid-cols-3">
                  {shortlistPrinciples.map((principle, index) => (
                    <div
                      key={principle.title}
                      className="rounded-[22px] border border-[#0d1b2a]/8 bg-[#f8fbff] p-4"
                    >
                      <p className="font-mono text-[11px] uppercase tracking-[0.22em] text-[#56708d]">
                        0{index + 1}
                      </p>
                      <p className="mt-3 font-display text-xl font-semibold tracking-[-0.04em] text-[#0d1b2a]">
                        {principle.title}
                      </p>
                      <p className="mt-2 text-sm leading-7 text-[#4c5d73]">{principle.body}</p>
                    </div>
                  ))}
                </div>
              </div>

              <div className="grid gap-5 lg:grid-cols-[1.04fr_0.96fr]">
                <article className="overflow-hidden rounded-[32px] border border-[#0d1b2a]/10 bg-[#081a2b] text-[#f7fafc] shadow-[0_28px_60px_rgba(13,27,42,0.2)]">
                  <div className="bg-[radial-gradient(circle_at_top_left,_rgba(45,109,246,0.35),_transparent_38%),radial-gradient(circle_at_bottom_right,_rgba(140,176,221,0.2),_transparent_34%),#081a2b] p-6 md:p-7">
                    <div className="flex flex-wrap items-center gap-3">
                      <span className="rounded-full border border-[#8cb0dd]/24 bg-[#8cb0dd]/10 px-3 py-1 font-mono text-[10px] uppercase tracking-[0.22em] text-[#d6e5f5]">
                        {featuredRoom.label}
                      </span>
                      <span className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs text-[#d6e5f5]">
                        <Radio className="h-3.5 w-3.5" />
                        High-conviction fit
                      </span>
                    </div>

                    <h4 className="mt-5 font-editorial text-5xl leading-[0.92] tracking-[-0.05em] text-[#f7fafc] sm:text-6xl">
                      {featuredRoom.name}
                    </h4>

                    <p className="mt-4 max-w-xl text-base leading-8 text-[#d6e5f5] md:text-lg">
                      {featuredRoom.fit}
                    </p>

                    <div className="mt-6 grid gap-3 sm:grid-cols-2">
                      <div className="rounded-[22px] border border-white/10 bg-white/5 p-4">
                        <p className="font-mono text-[11px] uppercase tracking-[0.22em] text-[#8cb0dd]">Audience</p>
                        <p className="mt-2 text-sm leading-7 text-[#f7fafc]">{featuredRoom.audience}</p>
                      </div>
                      <div className="rounded-[22px] border border-white/10 bg-white/5 p-4">
                        <p className="font-mono text-[11px] uppercase tracking-[0.22em] text-[#8cb0dd]">Format</p>
                        <p className="mt-2 text-sm leading-7 text-[#f7fafc]">{featuredRoom.format}</p>
                      </div>
                    </div>

                    <div className="mt-6 rounded-[24px] border border-white/10 bg-[#10263b] p-5">
                      <p className="font-mono text-[11px] uppercase tracking-[0.22em] text-[#8cb0dd]">Why it makes the list</p>
                      <p className="mt-3 text-sm leading-7 text-[#d6e5f5]">{featuredRoom.note}</p>
                    </div>
                  </div>
                </article>

                <div className="grid gap-5">
                  {secondaryRooms.map((room, index) => (
                    <article
                      key={room.name}
                      className={`rounded-[30px] border p-6 shadow-[0_18px_36px_rgba(13,27,42,0.08)] ${
                        index === 0
                          ? 'border-[#0d1b2a]/8 bg-[#ffffff]/86 backdrop-blur-sm'
                          : 'border-[#2d6df6]/12 bg-[#eef4ff]/86 backdrop-blur-sm'
                      }`}
                    >
                      <div className="flex flex-wrap items-center gap-3">
                        <span className="rounded-full border border-[#0d1b2a]/10 bg-white/70 px-3 py-1 font-mono text-[10px] uppercase tracking-[0.22em] text-[#56708d]">
                          {room.label}
                        </span>
                        <span className="inline-flex items-center gap-2 text-xs uppercase tracking-[0.18em] text-[#2d6df6]">
                          <ArrowRight className="h-3.5 w-3.5" />
                          Shortlist candidate
                        </span>
                      </div>

                      <h4 className="mt-5 font-display text-3xl font-semibold tracking-[-0.05em] text-[#0d1b2a]">
                        {room.name}
                      </h4>
                      <p className="mt-3 text-sm leading-7 text-[#30465f]">{room.fit}</p>

                      <div className="mt-5 grid gap-3 sm:grid-cols-2">
                        <div className="rounded-[20px] border border-[#0d1b2a]/8 bg-white/60 p-4">
                          <p className="font-mono text-[11px] uppercase tracking-[0.22em] text-[#56708d]">Audience</p>
                          <p className="mt-2 text-sm leading-6 text-[#0d1b2a]">{room.audience}</p>
                        </div>
                        <div className="rounded-[20px] border border-[#0d1b2a]/8 bg-white/60 p-4">
                          <p className="font-mono text-[11px] uppercase tracking-[0.22em] text-[#56708d]">Format</p>
                          <p className="mt-2 text-sm leading-6 text-[#0d1b2a]">{room.format}</p>
                        </div>
                      </div>

                      <div className="mt-5 rounded-[22px] border border-[#0d1b2a]/8 bg-[#f8fbff] p-4">
                        <p className="font-mono text-[11px] uppercase tracking-[0.22em] text-[#56708d]">Why it makes the list</p>
                        <p className="mt-3 text-sm leading-7 text-[#4c5d73]">{room.note}</p>
                      </div>
                    </article>
                  ))}
                </div>
              </div>

              <div className="rounded-[32px] border border-[#0d1b2a]/8 bg-[#f4f8fc]/92 p-6 shadow-[0_18px_36px_rgba(13,27,42,0.08)]">
                <p className="section-kicker">What we are optimizing for</p>
                <div className="mt-4 grid gap-3 md:grid-cols-3">
                  {decisionSignals.map((signal) => (
                    <div
                      key={signal}
                      className="flex items-start gap-3 rounded-[22px] border border-[#0d1b2a]/8 bg-white/70 px-4 py-4 text-sm leading-7 text-[#30465f]"
                    >
                      <CheckCircle2 className="mt-1 h-4 w-4 flex-shrink-0 text-[#2d6df6]" />
                      <span>{signal}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
};

export default PodcastShowcaseSection;
