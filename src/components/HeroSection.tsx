import { Button } from '@/components/ui/button';
import { PlayCircle } from 'lucide-react';

const proofTiles = [
  { value: '150+', label: 'podcast opportunities and placements supported' },
  { value: '50+', label: 'business, finance, founder, and operator shows' },
  { value: '2.5M+', label: 'combined estimated reach across featured shows' },
];

const firstFourteenDays = [
  'A positioning angle built around your expertise, buyer, and market.',
  'A shortlist of podcasts worth pitching before any outreach is sent.',
  'A live portal to review pitches, bookings, recording dates, and published episodes.',
];

const operatingSignals = [
  'Buyer-fit podcast shortlist',
  'Host-specific outreach',
  'Approval before pitching',
  'Booking and publish tracking',
];

const dashboardRows = [
  { name: 'Fintech Growth Show', fit: '9.2', status: 'Ready', date: 'Awaiting approval' },
  { name: 'Founder Operator', fit: '8.8', status: 'Booked', date: 'Recording Aug 14' },
  { name: 'WealthTech Weekly', fit: '8.5', status: 'Recorded', date: 'Publishing soon' },
];

const HeroSection = () => {
  return (
    <section className="paper-noise relative overflow-hidden bg-transparent px-4 pb-16 pt-32 md:pb-24 md:pt-40">
      <div className="absolute inset-x-0 top-0 h-px bg-[#0d1b2a]/8" />
      <div className="absolute left-0 top-28 h-[280px] w-[280px] rounded-full bg-[#b46a3c]/10 blur-3xl sm:h-[420px] sm:w-[420px]" />
      <div className="absolute right-0 top-16 h-[240px] w-[240px] rounded-full bg-[#d9c6b3]/50 blur-3xl sm:top-20 sm:h-[420px] sm:w-[420px]" />

      <div className="container relative mx-auto">
        <div className="grid items-start gap-8 xl:grid-cols-[0.94fr_1.06fr] xl:gap-12">
          <div className="max-w-3xl">
            <div className="animate-fade-up flex flex-wrap items-center gap-3">
              <p className="section-kicker">Podcast booking for experts</p>
              <span className="rounded-full border border-[#0d1b2a]/10 bg-[#f6efe7] px-4 py-2 font-mono text-[10px] uppercase tracking-[0.2em] text-[#7a6554]">
                For founders, advisors, and operators
              </span>
            </div>

            <h1 className="animate-fade-up animation-delay-100 mt-6 max-w-4xl font-editorial text-[clamp(3.5rem,7vw,6.6rem)] leading-[0.9] tracking-[-0.045em] text-[#0d1b2a] text-balance">
              Get booked on podcasts your buyers already trust.
            </h1>

            <p className="animate-fade-up animation-delay-200 mt-6 max-w-2xl text-lg leading-8 text-[#54473d] md:text-xl">
              We build the shortlist, write the pitches, handle the follow-up, and track every booking in one client portal so podcast guesting does not become another job on your team.
            </p>

            <div className="animate-fade-up animation-delay-300 mt-8 flex flex-col gap-3 sm:flex-row">
              <Button variant="hero" size="xl" className="min-h-[56px] rounded-full px-8 text-base" asChild>
                <a href="https://calendly.com/getonapodjg/30min" target="_blank" rel="noopener noreferrer">
                  Book My Shortlist Call
                </a>
              </Button>
              <Button variant="heroOutline" size="xl" className="min-h-[56px] rounded-full px-8 text-base" asChild>
                <a href="#pricing">View Pricing</a>
              </Button>
            </div>

            <p className="animate-fade-up animation-delay-400 mt-4 text-sm leading-6 text-[#76665a]">
              On the call, we pressure-test fit and show the kinds of podcasts worth targeting.
            </p>

            <div className="animate-fade-up animation-delay-400 mt-8 grid gap-3 sm:grid-cols-3">
              {proofTiles.map((tile) => (
                <div
                  key={tile.label}
                  className="rounded-[24px] border border-[#0d1b2a]/8 bg-[#fffdf9]/92 px-5 py-5 shadow-[0_18px_40px_rgba(13,27,42,0.08)]"
                >
                  <div className="font-display text-4xl font-semibold tracking-[-0.04em] text-[#0d1b2a]">
                    {tile.value}
                  </div>
                  <p className="mt-2 text-sm leading-6 text-[#6a5a4d]">{tile.label}</p>
                </div>
              ))}
            </div>

            <div className="animate-fade-up animation-delay-500 mt-8 rounded-[30px] border border-[#0d1b2a]/8 bg-[#fffaf4]/92 p-5 shadow-[0_18px_36px_rgba(13,27,42,0.08)]">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
                <div>
                  <p className="section-kicker">What GOAP handles</p>
                  <h2 className="mt-2 font-display text-3xl font-semibold tracking-[-0.04em] text-[#0d1b2a]">
                    The campaign runs like a system, not a pile of tasks.
                  </h2>
                </div>
                <p className="max-w-xs text-sm leading-6 text-[#76665a]">
                  Clear approval points, cleaner outreach, and one place to track what is moving.
                </p>
              </div>

              <div className="mt-5 grid gap-3 sm:grid-cols-2">
                {operatingSignals.map((signal, index) => (
                  <div
                    key={signal}
                    className="flex items-center gap-3 rounded-[18px] border border-[#0d1b2a]/8 bg-white px-4 py-3 text-sm font-medium text-[#3f342c]"
                  >
                    <span className="font-mono text-xs text-[#b46a3c]">0{index + 1}</span>
                    <span>{signal}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>

          <div className="animate-fade-up animation-delay-300 space-y-5 xl:pt-2">
            <div className="overflow-hidden rounded-[34px] border border-[#0d1b2a]/10 bg-[#fffaf3] shadow-[0_28px_60px_rgba(13,27,42,0.14)]">
              <div className="relative aspect-video overflow-hidden bg-[radial-gradient(circle_at_top_left,_rgba(180,106,60,0.18),_transparent_36%),linear-gradient(180deg,#142638_0%,#0d1b2a_100%)]">
                <div className="absolute left-5 top-5 rounded-full border border-white/15 bg-white/10 px-3 py-1 font-mono text-[10px] uppercase tracking-[0.2em] text-[#f6ecdf] backdrop-blur">
                  Founder video
                </div>
                <div className="absolute right-5 top-5 rounded-full border border-white/15 bg-white/10 px-3 py-1 font-mono text-[10px] uppercase tracking-[0.2em] text-[#f6ecdf] backdrop-blur">
                  ~3 min explainer
                </div>

                <div className="absolute inset-0 flex flex-col items-center justify-center px-6 text-center text-[#f7fafc]">
                  <PlayCircle className="h-16 w-16 text-[#eed6bf]" strokeWidth={1.6} />
                  <p className="mt-5 max-w-md font-display text-3xl font-semibold tracking-[-0.04em]">
                    Video sales letter placeholder
                  </p>
                  <p className="mt-3 max-w-lg text-sm leading-7 text-[#d9cbbc]">
                    This is where the founder walkthrough sits so visitors can hear the offer, the process, and the reason clients trust the service.
                  </p>
                </div>
              </div>

              <div className="grid gap-4 border-t border-[#0d1b2a]/8 px-5 py-5 md:grid-cols-[0.92fr_1.08fr]">
                <div>
                  <p className="section-kicker">Why it belongs here</p>
                  <p className="mt-2 text-base leading-7 text-[#3f342c]">
                    Put the founder front and center early so the page builds trust before visitors start comparing plans.
                  </p>
                </div>
                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="rounded-[18px] border border-[#0d1b2a]/8 bg-white px-4 py-3">
                    <p className="font-mono text-[11px] uppercase tracking-[0.2em] text-[#7a6554]">Covers</p>
                    <p className="mt-2 text-sm leading-6 text-[#54473d]">Offer, workflow, approvals, and fit.</p>
                  </div>
                  <div className="rounded-[18px] border border-[#0d1b2a]/8 bg-white px-4 py-3">
                    <p className="font-mono text-[11px] uppercase tracking-[0.2em] text-[#7a6554]">Outcome</p>
                    <p className="mt-2 text-sm leading-6 text-[#54473d]">More trust before the pricing section.</p>
                  </div>
                </div>
              </div>
            </div>

            <div className="overflow-hidden rounded-[34px] border border-[#0d1b2a]/10 bg-[#081a2b] p-5 text-[#f7fafc] shadow-[0_30px_70px_rgba(13,27,42,0.2)]">
              <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
                <div className="max-w-xl">
                  <p className="section-kicker text-[#d4b08f]">Client portal preview</p>
                  <h2 className="mt-2 font-display text-3xl font-semibold tracking-[-0.04em] text-[#f7fafc]">
                    Approval desk
                  </h2>
                  <p className="mt-2 text-sm leading-7 text-[#d8c8b5]">
                    Review recommended shows before anything is pitched on your behalf.
                  </p>
                </div>
                <div className="rounded-full border border-[#d4b08f]/30 bg-[#d4b08f]/10 px-3 py-1 text-xs uppercase tracking-[0.2em] text-[#f0ddc8]">
                  3 shows ready now
                </div>
              </div>

              <div className="mt-5 grid gap-4 lg:grid-cols-[1.18fr_0.82fr]">
                <div className="rounded-[24px] border border-white/10 bg-[#fdfaf5] p-4 text-[#0d1b2a]">
                  <div className="hidden grid-cols-[1.5fr_0.5fr_0.8fr_0.9fr] gap-3 border-b border-[#0d1b2a]/10 pb-3 text-[11px] uppercase tracking-[0.2em] text-[#7a6554] md:grid">
                    <span>Show</span>
                    <span>Fit</span>
                    <span>Stage</span>
                    <span>Next step</span>
                  </div>

                  <div className="mt-4 space-y-3">
                    {dashboardRows.map((row) => (
                      <div key={row.name} className="rounded-[18px] border border-[#0d1b2a]/8 bg-white px-4 py-3">
                        <div className="grid gap-3 md:grid-cols-[1.5fr_0.5fr_0.8fr_0.9fr] md:items-center">
                          <div>
                            <span className="text-sm font-medium leading-6 text-[#14283d]">{row.name}</span>
                            <span className="mt-1 block text-xs uppercase tracking-[0.14em] text-[#76665a] md:hidden">
                              {row.status}
                            </span>
                          </div>
                          <span className="text-sm font-semibold text-[#b46a3c]">{row.fit}</span>
                          <span className="hidden text-xs uppercase tracking-[0.14em] text-[#76665a] md:block">{row.status}</span>
                          <span className="text-sm text-[#54473d]">{row.date}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-1">
                  <div className="rounded-[24px] border border-white/10 bg-white/5 p-5">
                    <p className="section-kicker text-[#d4b08f]">In motion this month</p>
                    <p className="mt-3 font-display text-5xl font-semibold tracking-[-0.05em] text-[#f7fafc]">11</p>
                    <p className="mt-2 text-sm leading-6 text-[#d8c8b5]">
                      Shows moving across approval, outreach, booking, and publish stages.
                    </p>
                  </div>

                  <div className="rounded-[24px] border border-[#d4b08f]/20 bg-[#132436] p-5">
                    <p className="section-kicker text-[#d4b08f]">What you see</p>
                    <p className="mt-3 font-display text-2xl font-semibold tracking-[-0.04em] text-[#f7fafc]">
                      Shortlist, approvals, bookings, and publish tracking.
                    </p>
                    <p className="mt-2 text-sm leading-7 text-[#d8c8b5]">
                      One place to review the work instead of chasing email threads and spreadsheet notes.
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        <div className="animate-fade-up animation-delay-500 mt-8 rounded-[32px] border border-[#0d1b2a]/8 bg-[#fffdf9]/92 p-6 shadow-[0_20px_42px_rgba(13,27,42,0.08)]">
          <div className="grid gap-6 xl:grid-cols-[0.9fr_1.1fr] xl:items-end">
            <div className="max-w-xl">
              <p className="section-kicker">Your first 14 days</p>
              <h2 className="mt-3 font-display text-3xl font-semibold tracking-[-0.04em] text-[#0d1b2a] sm:text-4xl">
                See the fit before outreach begins.
              </h2>
              <p className="mt-3 text-base leading-7 text-[#6a5a4d]">
                That is how you avoid random appearances and vague agency updates.
              </p>
            </div>

            <ul className="grid gap-3 md:grid-cols-3">
              {firstFourteenDays.map((item, index) => (
                <li key={item} className="rounded-[20px] border border-[#0d1b2a]/8 bg-white px-4 py-4">
                  <span className="font-mono text-xs text-[#b46a3c]">0{index + 1}</span>
                  <p className="mt-3 text-sm leading-7 text-[#3f342c]">{item}</p>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </div>
    </section>
  );
};

export default HeroSection;
