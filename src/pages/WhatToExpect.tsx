import { Button } from '@/components/ui/button';
import Navbar from '@/components/Navbar';
import Footer from '@/components/Footer';
import { ArrowRight, CheckCircle2 } from 'lucide-react';
import PageSEO from '@/components/seo/PageSEO';

/**
 * The eleven things that happen after someone joins, each in one sentence.
 * The page used to expand every one into four detail cards, so the reader
 * scrolled past forty-four boxes to learn what fits on one screen.
 */
const steps = [
  {
    number: '01',
    title: 'Positioning interview',
    duration: 'Day 1',
    description: 'About an hour on your expertise, the buyer you want to reach, and the kinds of shows worth their attention.',
  },
  {
    number: '02',
    title: 'Portal access',
    duration: 'Day 1',
    description: 'Your client portal opens the same day, with approvals, statuses and updates in one place from the start.',
  },
  {
    number: '03',
    title: 'Your guest profile',
    duration: 'Day 2-3',
    description: 'We write the profile a host reads before saying yes: your background, your topics, and why their listeners should hear from you.',
  },
  {
    number: '04',
    title: 'Your show shortlist',
    duration: 'Week 1',
    description: 'We research podcasts that fit your expertise and buyer, and you approve or reject each one before any outreach starts.',
  },
  {
    number: '05',
    title: 'Pitch approval',
    duration: 'Week 1-2',
    description: 'We write outreach around your angle and the show, and you review it before anything is sent on your behalf.',
  },
  {
    number: '06',
    title: 'Outreach starts',
    duration: 'After approvals',
    description: 'Pitches and follow-ups go out, and your portal updates as conversations move.',
  },
  {
    number: '07',
    title: 'Booking confirmed',
    duration: 'As they come in',
    description: 'When a host confirms, you are notified and we handle the scheduling.',
  },
  {
    number: '08',
    title: 'Prep brief',
    duration: 'Before each recording',
    description: 'Who the host is, who listens, the angle to lead with, and the one thing to plug.',
  },
  {
    number: '09',
    title: 'Recording reminder',
    duration: 'Recording day',
    description: 'A reminder before the recording, with a setup checklist, so nothing is last-minute.',
  },
  {
    number: '10',
    title: 'Episode goes live',
    duration: 'Usually 2–8 weeks later',
    description: 'We notify you when the episode publishes and share the links so you can use it.',
  },
  {
    number: '11',
    title: 'Ongoing reporting',
    duration: 'Always available',
    description: 'Your portal keeps the record of what was approved, pitched, booked, recorded and published.',
  },
];

const summaryCards = [
  {
    label: 'Day 1',
    title: 'Positioning interview and portal access',
    description: 'An hour on your angle, then the portal opens so you can see the work from the start.',
  },
  {
    label: 'Week 1',
    title: 'Shortlist and approvals',
    description: 'Shows are researched and reviewed before anything gets pitched.',
  },
  {
    label: 'Week 1-2',
    title: 'Outreach goes live',
    description: 'Once approvals are in, pitching and follow-up begin.',
  },
  {
    label: 'Ongoing',
    title: 'Bookings, prep briefs and published episodes',
    description: 'Most clients record their first episode within 3–5 weeks, and it usually goes live 2–8 weeks after that.',
  },
];

const constants = [
  'No outreach starts until targets and direction are approved.',
  'The portal stays current as replies, bookings, and publish dates come in.',
  'A prep brief and a reminder arrive before every recording.',
];

const WhatToExpect = () => {
  return (
    <div className="homepage-shell min-h-screen bg-transparent">
      <PageSEO
        title="What happens after you join, week by week | Get On A Pod"
        description="How Get On A Pod runs a podcast guesting campaign, from the positioning interview to the published episode: what you approve, when pitches go out and when you record."
        path="/what-to-expect"
      />
      <Navbar />

      <section className="paper-noise relative overflow-hidden px-4 pb-12 pt-44 sm:pt-40 md:pb-16 md:pt-36">
        <div className="absolute inset-x-0 top-0 h-px bg-[#0d1b2a]/8" />
        <div className="absolute left-0 top-20 h-[260px] w-[260px] rounded-full bg-[#b46a3c]/10 blur-3xl sm:h-[380px] sm:w-[380px]" />
        <div className="absolute right-0 top-14 h-[220px] w-[220px] rounded-full bg-[#d9c6b3]/45 blur-3xl sm:h-[360px] sm:w-[360px]" />

        <div className="container relative mx-auto">
          <div className="max-w-3xl">
            <p className="section-kicker">What to expect</p>

            <h1 className="mt-6 max-w-4xl font-editorial text-[clamp(3rem,10vw,6rem)] leading-[0.92] tracking-[-0.045em] text-[#0d1b2a] text-balance">
              What happens after you join, week by week.
            </h1>

            <p className="mt-6 max-w-2xl text-base leading-8 text-[#54473d] sm:text-lg md:text-xl">
              You approve every show and every pitch before anything goes out. Outreach starts within the first two weeks, most clients record their first episode within 3–5 weeks, and your portal shows where everything stands the whole time.
            </p>

            <div className="mt-8 flex flex-col gap-3 sm:flex-row">
              <Button variant="hero" size="xl" className="min-h-[56px] rounded-full px-8 text-base" asChild>
                <a href="https://cal.com/jonathan-garces-x5v8tl/30min" target="_blank" rel="noopener noreferrer">
                  Book a 30-minute call
                  <ArrowRight className="h-4 w-4" />
                </a>
              </Button>
              <Button variant="heroOutline" size="xl" className="min-h-[56px] rounded-full px-8 text-base" asChild>
                <a href="/#pricing">See pricing: $500 a month</a>
              </Button>
            </div>

            <p className="mt-4 text-sm leading-6 text-[#76665a]">
              On the call we show you the kinds of shows we would pitch you to, and tell you honestly whether we are a fit.
            </p>
          </div>

          <div className="mt-10 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            {summaryCards.map((card) => (
              <div
                key={card.title}
                className="rounded-[22px] border border-[#0d1b2a]/8 bg-white px-4 py-4 shadow-[0_18px_40px_rgba(13,27,42,0.06)]"
              >
                <p className="font-mono text-[11px] uppercase tracking-[0.18em] text-[#b46a3c]">
                  {card.label}
                </p>
                <p className="mt-3 font-display text-xl font-semibold tracking-[-0.03em] text-[#0d1b2a]">
                  {card.title}
                </p>
                <p className="mt-2 text-sm leading-6 text-[#6a5a4d]">
                  {card.description}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="px-4 py-12 md:py-20">
        <div className="container mx-auto">
          <div className="grid gap-10 xl:grid-cols-[0.34fr_0.66fr] xl:gap-12">
            <div className="max-w-xl xl:sticky xl:top-28 xl:self-start">
              <p className="section-kicker">The eleven steps</p>
              <h2 className="mt-4 font-editorial text-4xl leading-[0.94] tracking-[-0.045em] text-[#0d1b2a] sm:text-5xl md:text-6xl">
                From shortlist to published episode.
              </h2>
              <p className="mt-5 max-w-lg text-base leading-8 text-[#54473d] sm:text-lg">
                At every step you can see what stage the campaign is in, what needs your approval and what is already moving.
              </p>

              <div className="mt-8 rounded-[28px] border border-[#0d1b2a]/8 bg-[#fffaf4]/92 p-5 shadow-[0_18px_36px_rgba(13,27,42,0.08)]">
                <p className="section-kicker">What stays true throughout</p>
                <ul className="mt-4 space-y-3">
                  {constants.map((item) => (
                    <li key={item} className="flex items-start gap-3 rounded-[18px] border border-[#0d1b2a]/8 bg-white px-4 py-3">
                      <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-[#b46a3c]" aria-hidden="true" />
                      <p className="text-sm leading-7 text-[#3f342c]">{item}</p>
                    </li>
                  ))}
                </ul>
              </div>
            </div>

            <ol className="divide-y divide-[#0d1b2a]/8 rounded-[30px] border border-[#0d1b2a]/8 bg-[#fffdf9]/94 shadow-[0_18px_40px_rgba(13,27,42,0.08)]">
              {steps.map((step) => (
                <li key={step.number} className="grid gap-2 px-5 py-5 sm:grid-cols-[3rem_minmax(0,1fr)] sm:gap-x-5 sm:px-6">
                  <span className="font-mono text-[11px] uppercase tracking-[0.18em] text-[#8e4a1f] sm:pt-1.5">
                    {step.number}
                  </span>
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
                      <h3 className="font-display text-xl font-semibold tracking-[-0.03em] text-[#0d1b2a] sm:text-2xl">
                        {step.title}
                      </h3>
                      <span className="font-mono text-[11px] uppercase tracking-[0.18em] text-[#7a6554]">
                        {step.duration}
                      </span>
                    </div>
                    <p className="mt-2 max-w-2xl text-sm leading-7 text-[#54473d] sm:text-base">
                      {step.description}
                    </p>
                  </div>
                </li>
              ))}
            </ol>
          </div>
        </div>
      </section>

      <section className="px-4 pb-16 pt-2 md:pb-24">
        <div className="container mx-auto">
          <div className="overflow-hidden rounded-[36px] border border-[#0d1b2a]/10 bg-[#081a2b] px-6 py-8 text-[#f7fafc] shadow-[0_30px_70px_rgba(13,27,42,0.2)] sm:px-8 sm:py-10 md:px-10">
            <div className="grid gap-8 lg:grid-cols-[0.92fr_1.08fr] lg:items-end">
              <div className="max-w-2xl">
                <div className="flex flex-wrap items-center gap-3">
                  <p className="section-kicker text-[#d4b08f]">Next step</p>
                  <span className="rounded-full border border-[#d4b08f]/25 bg-[#d4b08f]/10 px-3 py-1 font-mono text-[10px] uppercase tracking-[0.18em] text-[#f0ddc8]">
                    30 minutes, no commitment
                  </span>
                </div>
                <h2 className="mt-4 font-editorial text-4xl leading-[0.94] tracking-[-0.045em] text-[#f7fafc] sm:text-5xl md:text-6xl">
                  See the shows we would pitch you to.
                </h2>
                <p className="mt-5 max-w-xl text-base leading-8 text-[#d8c8b5] sm:text-lg">
                  In 30 minutes we show you the kinds of shows we would target for you, and tell you honestly how many bookings to expect in your niche.
                </p>
              </div>

              <div className="flex flex-col gap-3 sm:flex-row lg:justify-end">
                <Button variant="hero" size="xl" className="w-full rounded-full px-8 sm:w-auto" asChild>
                  <a href="https://cal.com/jonathan-garces-x5v8tl/30min" target="_blank" rel="noopener noreferrer">
                    Book a 30-minute call
                    <ArrowRight className="h-4 w-4" />
                  </a>
                </Button>
                <Button
                  variant="heroOutline"
                  size="xl"
                  className="w-full rounded-full border-white/15 bg-white/5 px-8 text-[#f7fafc] shadow-none hover:border-[#d4b08f]/35 hover:bg-white/10 sm:w-auto"
                  asChild
                >
                  <a href="/#pricing">See pricing: $500 a month</a>
                </Button>
              </div>
            </div>
          </div>
        </div>
      </section>

      <Footer />
    </div>
  );
};

export default WhatToExpect;
