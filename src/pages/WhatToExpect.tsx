import Navbar from '@/components/Navbar';
import Footer from '@/components/Footer';
import PageSEO from '@/components/seo/PageSEO';
import { CALL_URL } from '@/lib/landingContent';

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
    description: 'We notify you when the episode publishes, get the full recording from the host and send you 5 captioned vertical clips, ready for your social feeds.',
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
    title: 'Bookings, prep briefs, episodes and clips',
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
    <div className="dfy-page">
      <PageSEO
        title="What happens after you join, week by week | Get On A Pod"
        description="How Get On A Pod runs a podcast guesting campaign, from the positioning interview to the published episode: what you approve, when pitches go out and when you record."
        path="/what-to-expect"
      />
      <Navbar />

      <main className="dfy-wrap">
        <section className="dfy-page-hero">
          <span className="dfy-kicker">What to expect</span>
          <h1>What happens after you join, week by week.</h1>
          <p className="dfy-page-lead">
            You approve every show and every pitch before anything goes out. Outreach starts within the first two weeks, most clients record their first episode within 3–5 weeks, and your portal shows where everything stands the whole time.
          </p>

          <div className="dfy-cta-row">
            <a className="dfy-btn dfy-btn-primary" href={CALL_URL} target="_blank" rel="noopener noreferrer">
              Book a 30-minute call
            </a>
            <a className="dfy-btn dfy-btn-ghost" href="/#pricing">See pricing: $1,000 a month</a>
          </div>

          <p className="dfy-cta-note">
            On the call we show you the kinds of shows we would pitch you to, and tell you honestly whether we are a fit.
          </p>

          <div className="dfy-facts-grid">
            {summaryCards.map((card) => (
              <div key={card.title}>
                <span className="dfy-kicker">{card.label}</span>
                <h2 className="dfy-fact-title">{card.title}</h2>
                <p className="dfy-fact-copy">{card.description}</p>
              </div>
            ))}
          </div>
        </section>

        <hr className="dfy-rule" />

        <section className="dfy-section">
          <span className="dfy-kicker">The eleven steps</span>
          <h2 className="dfy-title">From shortlist to published episode.</h2>
          <p className="dfy-copy">
            At every step you can see what stage the campaign is in, what needs your approval and what is already moving.
          </p>

          <ol className="mt-6 list-none p-0">
            {steps.map((step) => (
              <li key={step.number} className="dfy-how-row">
                <span className="dfy-how-n">{step.number}</span>
                <div>
                  <h3 className="dfy-how-title">{step.title}</h3>
                  <span className="dfy-when">{step.duration}</span>
                </div>
                <p className="dfy-how-copy">{step.description}</p>
              </li>
            ))}
          </ol>

          <div className="dfy-panel mt-10">
            <span className="dfy-kicker">What stays true throughout</span>
            <ul className="dfy-includes">
              {constants.map((item) => (
                <li key={item}>
                  <span className="dfy-list-mark" aria-hidden="true" />
                  <span>{item}</span>
                </li>
              ))}
            </ul>
          </div>
        </section>
      </main>

      <section className="dfy-book">
        <div className="dfy-book-in">
          <span className="dfy-kicker">Next step</span>
          <h2><span>See the shows</span><span>we would pitch you to.</span></h2>
          <p className="dfy-book-copy">
            In 30 minutes we show you the kinds of shows we would target for you, and tell you honestly how many bookings to expect in your niche.
          </p>
          <div className="dfy-cta-row">
            <a className="dfy-btn dfy-btn-ghost" href={CALL_URL} target="_blank" rel="noopener noreferrer">
              Book a 30-minute call
            </a>
            <a className="dfy-btn dfy-btn-ghost" href="/#pricing">See pricing: $1,000 a month</a>
          </div>
          <p className="dfy-book-note">30 minutes, no commitment.</p>
        </div>
      </section>

      <Footer />
    </div>
  );
};

export default WhatToExpect;
