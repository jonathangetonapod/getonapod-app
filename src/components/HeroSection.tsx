import { Button } from '@/components/ui/button';

const proofTiles = [
  { value: '150+', label: 'podcast opportunities and placements supported' },
  { value: '50+', label: 'business, finance, founder, and operator shows' },
  { value: '2.5M+', label: 'combined estimated reach across featured shows' },
];

const firstFourteenDays = [
  'Authority angles tailored to your expertise, audience, and goals.',
  'A curated shortlist of podcasts worth pitching before outreach starts.',
  'A live portal so you can track every pitch, booking, and recording date.',
];

const operatingSignals = [
  'AI-matched show research',
  'Human-written outreach',
  'Approval-first workflow',
  'Booking and publish tracking',
];

const dashboardRows = [
  { name: 'Fintech Growth Show', fit: '9.2', status: 'Pitch sent', date: 'Pending' },
  { name: 'Founder Operator', fit: '8.8', status: 'Booked', date: 'Aug 14' },
  { name: 'WealthTech Weekly', fit: '8.5', status: 'Recorded', date: 'Publishing soon' },
];

const HeroSection = () => {
  return (
    <section className="paper-noise relative overflow-hidden bg-transparent px-4 pb-16 pt-32 md:pb-24 md:pt-40">
      <div className="absolute inset-x-0 top-0 h-px bg-[#0d1b2a]/8" />
      <div className="absolute left-0 top-28 h-[420px] w-[420px] rounded-full bg-[#2d6df6]/10 blur-3xl" />
      <div className="absolute right-0 top-20 h-[420px] w-[420px] rounded-full bg-[#f1d7b4]/35 blur-3xl" />

      <div className="container relative mx-auto">
        <div className="grid items-start gap-12 lg:grid-cols-[1.08fr_0.92fr] lg:gap-16">
          <div className="max-w-3xl">
            <div className="animate-fade-up flex flex-wrap items-center gap-3">
              <p className="section-kicker">Podcast authority system</p>
              <span className="rounded-full border border-[#0d1b2a]/10 bg-[#fff9f3] px-4 py-2 font-mono text-[10px] uppercase tracking-[0.22em] text-[#5d7188]">
                For founders, advisors, and operators
              </span>
            </div>
            <h1 className="animate-fade-up animation-delay-100 mt-5 font-editorial text-[clamp(3.7rem,7.6vw,6.8rem)] leading-[0.88] tracking-[-0.05em] text-[#0d1b2a] text-balance">
              Get booked on podcasts your buyers already trust.
            </h1>

            <p className="animate-fade-up animation-delay-200 mt-6 max-w-2xl text-lg leading-8 text-[#4c5d73] md:text-xl">
              Get On A Pod matches founders, financial professionals, and experts with relevant podcasts,
              then handles the targeting, outreach, scheduling, and tracking inside a private client portal.
            </p>

            <div className="animate-fade-up animation-delay-300 mt-8 flex flex-col gap-3 sm:flex-row">
              <Button variant="hero" size="xl" className="min-h-[56px] rounded-full px-8 text-base" asChild>
                <a href="https://calendly.com/getonapodjg/30min" target="_blank" rel="noopener noreferrer">
                  Get My Podcast Shortlist
                </a>
              </Button>
              <Button variant="heroOutline" size="xl" className="min-h-[56px] rounded-full px-8 text-base" asChild>
                <a href="#pricing">View Pricing</a>
              </Button>
            </div>

            <p className="animate-fade-up animation-delay-400 mt-4 text-sm leading-6 text-[#5f7590]">
              We build your first shortlist after a short strategy call.
            </p>

            <div className="animate-fade-up animation-delay-400 mt-8 max-w-2xl rounded-[28px] border border-[#0d1b2a]/8 bg-[#ffffff]/72 p-4 shadow-[0_20px_40px_rgba(13,27,42,0.08)] backdrop-blur-sm">
              <div className="grid gap-3 sm:grid-cols-2">
                {operatingSignals.map((signal, index) => (
                  <div
                    key={signal}
                    className="flex items-center gap-3 rounded-[20px] border border-[#0d1b2a]/8 bg-[#fdfbf7] px-4 py-3 text-sm font-medium text-[#30465f]"
                  >
                    <span className="font-mono text-xs text-[#2d6df6]">0{index + 1}</span>
                    <span>{signal}</span>
                  </div>
                ))}
              </div>
            </div>

            <div className="animate-fade-up animation-delay-500 mt-10 overflow-hidden rounded-[30px] border border-[#0d1b2a]/8 bg-[#ffffff]/78 shadow-[0_20px_42px_rgba(13,27,42,0.08)] backdrop-blur-sm">
              <div className="grid sm:grid-cols-3">
                {proofTiles.map((tile, index) => (
                  <div
                    key={tile.label}
                    className={`px-5 py-6 ${index > 0 ? 'border-t border-[#0d1b2a]/8 sm:border-l sm:border-t-0' : ''}`}
                  >
                    <div className="font-display text-4xl font-semibold tracking-[-0.05em] text-[#0d1b2a]">{tile.value}</div>
                    <p className="mt-2 max-w-[16rem] text-sm leading-6 text-[#5d7188]">{tile.label}</p>
                  </div>
                ))}
              </div>
            </div>

            <div className="animate-fade-up animation-delay-500 mt-8 rounded-[32px] border border-[#0d1b2a]/8 bg-[#fffaf4]/88 p-6 shadow-[0_18px_36px_rgba(13,27,42,0.08)]">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
                <div>
                  <p className="section-kicker">What happens in your first 14 days</p>
                  <h2 className="mt-3 font-display text-3xl font-semibold tracking-[-0.05em] text-[#0d1b2a]">
                    You see where you fit before we ever start spraying outreach.
                  </h2>
                </div>
                <p className="max-w-xs text-sm leading-6 text-[#5d7188]">
                  That is the difference between random appearances and a real authority system.
                </p>
              </div>

              <div className="editorial-rule my-5" />

              <ul className="grid gap-4 md:grid-cols-3">
                {firstFourteenDays.map((item, index) => (
                  <li key={item} className="flex gap-3 rounded-[20px] bg-[#ffffff]/70 px-3 py-3">
                    <span className="font-mono text-xs text-[#2d6df6]">0{index + 1}</span>
                    <span className="text-sm leading-6 text-[#30465f]">{item}</span>
                  </li>
                ))}
              </ul>
            </div>
          </div>

          <div className="animate-fade-up animation-delay-300 relative lg:pt-4">
            <div className="absolute -left-4 top-8 hidden rounded-full border border-[#0d1b2a]/8 bg-[#ffffff] px-4 py-2 text-xs font-medium uppercase tracking-[0.22em] text-[#5d7188] md:block">
              Buyer-fit over vanity reach
            </div>
            <div className="absolute bottom-10 left-0 hidden rounded-[24px] border border-[#0d1b2a]/10 bg-[#ffffff] p-4 shadow-[0_18px_40px_rgba(13,27,42,0.12)] md:block">
              <p className="section-kicker">Attention needed</p>
              <p className="mt-2 font-display text-2xl font-semibold text-[#0d1b2a]">3 shows ready for approval</p>
              <p className="mt-1 text-sm text-[#5d7188]">Greenlight them and we start pitching today.</p>
            </div>

            <div className="overflow-hidden rounded-[36px] border border-[#0d1b2a]/10 bg-[#081a2b] p-5 text-[#f7fafc] shadow-[0_32px_80px_rgba(13,27,42,0.22)]">
              <div className="flex items-center justify-between rounded-[24px] border border-white/10 bg-white/5 px-4 py-3">
                <div>
                  <p className="section-kicker text-[#8cb0dd]">Sample portal view</p>
                  <h2 className="mt-2 font-display text-2xl font-semibold tracking-[-0.05em]">
                    Podcast Authority Desk
                  </h2>
                </div>
                <div className="rounded-full border border-[#18c08f]/30 bg-[#18c08f]/10 px-3 py-1 text-xs uppercase tracking-[0.22em] text-[#8ef0cd]">
                  Campaign live
                </div>
              </div>

              <div className="mt-5 grid gap-4 md:grid-cols-[1.1fr_0.9fr]">
                <div className="rounded-[28px] border border-white/10 bg-[#f8fbff] p-5 text-[#0d1b2a]">
                  <div className="grid grid-cols-[1.5fr_0.6fr_0.8fr_0.8fr] gap-3 border-b border-[#0d1b2a]/10 pb-3 text-[11px] uppercase tracking-[0.24em] text-[#5d7188]">
                    <span>Podcast</span>
                    <span>Fit</span>
                    <span>Status</span>
                    <span>Date</span>
                  </div>

                  <div className="mt-4 space-y-3">
                    {dashboardRows.map((row) => (
                      <div
                        key={row.name}
                        className="grid grid-cols-[1.5fr_0.6fr_0.8fr_0.8fr] items-center gap-3 rounded-2xl border border-[#0d1b2a]/10 bg-white px-4 py-3"
                      >
                        <span className="text-sm font-medium leading-6 text-[#14283d]">{row.name}</span>
                        <span className="text-sm font-semibold text-[#2d6df6]">{row.fit}</span>
                        <span className="text-xs uppercase tracking-[0.16em] text-[#4d657e]">{row.status}</span>
                        <span className="text-sm text-[#5d7188]">{row.date}</span>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="flex flex-col gap-4">
                  <div className="rounded-[28px] border border-white/10 bg-white/5 p-5">
                    <p className="section-kicker text-[#8cb0dd]">This month</p>
                    <p className="mt-3 font-display text-4xl font-semibold tracking-[-0.05em]">11</p>
                    <p className="mt-2 text-sm leading-6 text-[#c7d9ee]">
                      Approved shows in motion across founder, finance, and operator categories.
                    </p>
                  </div>

                  <div className="rounded-[28px] border border-[#2d6df6]/30 bg-[#132a44] p-5 text-[#f7fafc]">
                    <p className="section-kicker text-[#8cb0dd]">Portal view</p>
                    <p className="mt-3 font-display text-3xl font-semibold tracking-[-0.05em]">
                      Shortlist, approvals, bookings, and episode tracking.
                    </p>
                    <p className="mt-2 text-sm leading-6 text-[#c7d9ee]/90">
                      No spreadsheets. No “just checking in.” No opacity.
                    </p>
                  </div>
                </div>
              </div>

              <div className="mt-4 rounded-[28px] border border-white/10 bg-white/5 p-5">
                <div className="flex flex-wrap items-center gap-3 text-sm text-[#d6e5f5]">
                  <span className="rounded-full bg-white/10 px-3 py-1 uppercase tracking-[0.22em]">Approval before outreach</span>
                  <span className="rounded-full bg-white/10 px-3 py-1 uppercase tracking-[0.22em]">Audience-fit targeting</span>
                  <span className="rounded-full bg-white/10 px-3 py-1 uppercase tracking-[0.22em]">Prep before recording</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
};

export default HeroSection;
