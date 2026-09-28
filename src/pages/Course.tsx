import Navbar from '@/components/Navbar';
import Footer from '@/components/Footer';
import { useScrollAnimation } from '@/hooks/useScrollAnimation';
import PageSEO from '@/components/seo/PageSEO';
import { CALL_LABEL, CALL_URL, CONTACT_EMAIL, MONTHLY_PRICE } from '@/lib/landingContent';

/**
 * The course is not built yet, and there is no waitlist table behind this
 * page. The page used to show an email field that thanked people and then
 * discarded what they typed; asking them to email us is the honest version.
 */
const WAITLIST_MAILTO = `mailto:${CONTACT_EMAIL}?subject=${encodeURIComponent('Course waitlist')}`;

const modules = [
  {
    title: "Module 1: Finding your angle",
    description: "Pin down the problem you solve and the buyer you want to reach, then turn it into three angles a host can say yes to."
  },
  {
    title: "Module 2: Building your target list",
    description: "Research and vet podcasts that match your niche. Learn what makes a good show and how to prioritize your targets."
  },
  {
    title: "Module 3: Your one-sheet and bio",
    description: "Build your one-sheet, bio, talking points, and media kit. Make it easy for hosts to say yes."
  },
  {
    title: "Module 4: Pitching hosts",
    description: "How to write a pitch for one specific show, plus subject lines and follow-ups, with the kinds of pitches that book our clients."
  },
  {
    title: "Module 5: Preparing for the recording",
    description: "Research the host and audience, plan your talking points and stories, and leave the host wanting you back."
  },
  {
    title: "Module 6: Using the episode afterward",
    description: "Turn one appearance into social posts, emails and clips your customers will actually see."
  }
];

const bonuses = [
  {
    title: 'Pitch templates',
    description: 'Email templates for cold pitches, warm introductions, follow-ups and thank-yous.',
  },
  {
    title: 'Guest one-sheet template',
    description: 'The template we use to position our clients, in a fill-in-the-blank format.',
  },
  {
    title: 'Repurposing playbook',
    description: 'A checklist for turning each appearance into posts for LinkedIn, X and your email list.',
  },
  {
    title: 'Podcast lists by niche',
    description: 'Active shows sorted by industry, so your first target list is not a blank page.',
  },
];

const Course = () => {
  const { ref, isVisible } = useScrollAnimation<HTMLDivElement>();

  return (
    <div className="dfy-page">
      <PageSEO
        title="Book yourself on podcasts: a course | Get On A Pod"
        description="A coming course on getting yourself booked on podcasts, using the process Get On A Pod runs for its clients: targeting, pitching, preparing and repurposing."
        path="/course"
        // Nothing links here and nothing is for sale yet; keep it out of search.
        noindex
      />
      <Navbar />

      <main className="dfy-wrap">
        <section className="dfy-page-hero">
          <span className="dfy-kicker">Coming soon</span>
          <h1>Book yourself on podcasts, the way we book our clients</h1>
          <p className="dfy-page-lead">
            The process Get On A Pod runs for its clients every week, from finding the right shows and pitching
            the hosts to preparing for the recording and using the episode afterward, written down so you can run it yourself.
          </p>

          <div className="dfy-cta-row">
            <a className="dfy-btn dfy-btn-primary" href={WAITLIST_MAILTO}>Email us to join the waitlist</a>
          </div>

          <p className="dfy-kicker dfy-facts">
            <span>6 modules</span>
            <span>Pitch and one-sheet templates</span>
            <span>Real pitch examples</span>
          </p>
        </section>

        <hr className="dfy-rule" />

        <section className="dfy-section">
          <span className="dfy-kicker">The modules</span>
          <h2 className="dfy-title">What you will learn</h2>
          <p className="dfy-copy">
            Each module is one stage of a real campaign, with the templates we use at that stage.
          </p>

          <div
            ref={ref}
            className={`mt-6 transition-all duration-700 ${
              isVisible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-8'
            }`}
          >
            {modules.map((module, index) => (
              <div key={module.title} className="dfy-how-row" style={{ transitionDelay: `${index * 100}ms` }}>
                <span className="dfy-how-n">{String(index + 1).padStart(2, '0')}</span>
                <h3 className="dfy-how-title">{module.title}</h3>
                <p className="dfy-how-copy">{module.description}</p>
              </div>
            ))}
          </div>
        </section>

        <hr className="dfy-rule" />

        <section className="dfy-section">
          <span className="dfy-kicker">Also included</span>
          <h2 className="dfy-title">Templates and lists you can use straight away</h2>

          <div className="dfy-facts-grid">
            {bonuses.map((bonus) => (
              <div key={bonus.title}>
                <h3 className="dfy-fact-title">{bonus.title}</h3>
                <p className="dfy-fact-copy">{bonus.description}</p>
              </div>
            ))}
          </div>
        </section>

        <hr className="dfy-rule" />

        <section className="dfy-section-tight">
          <span className="dfy-kicker">Not out yet</span>
          <h2 className="dfy-title">Email us and we will tell you the day it launches.</h2>
          <div className="dfy-cta-row">
            <a className="dfy-btn dfy-btn-primary" href={WAITLIST_MAILTO}>Email us to join the waitlist</a>
          </div>
        </section>
      </main>

      <section className="dfy-book">
        <div className="dfy-book-in">
          <h2><span>Rather not do it yourself?</span><span>We do it for ${MONTHLY_PRICE} a month.</span></h2>
          <p className="dfy-book-copy">
            Get On A Pod pitches the shows, books the recordings and sends you a prep brief before each one.
            Most clients have 2–4 bookings a month once outreach ramps up.
          </p>
          <div className="dfy-cta-row">
            <a className="dfy-btn dfy-btn-ghost" href={CALL_URL} target="_blank" rel="noopener noreferrer">{CALL_LABEL}</a>
          </div>
        </div>
      </section>

      <Footer />
    </div>
  );
};

export default Course;
