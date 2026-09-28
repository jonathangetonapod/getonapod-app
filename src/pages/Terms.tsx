// These terms were drafted from how the product actually works. They need
// review by counsel before they are treated as final. Governing law and venue
// are deliberately left to the written agreement each client signs; do not add
// a jurisdiction here without that review.
import Navbar from '@/components/Navbar';
import Footer from '@/components/Footer';
import PageSEO from '@/components/seo/PageSEO';

const EFFECTIVE_DATE = '28 September 2026';
const CONTACT_EMAIL = 'jonathan@getonapod.com';

interface LegalSection {
  heading: string;
  paragraphs?: string[];
  items?: string[];
  closing?: string[];
}

const sections: LegalSection[] = [
  {
    heading: 'Who these terms apply to',
    paragraphs: [
      'These terms govern your use of the Get On A Pod website, the agency workspace app and the client portal. They bind website visitors, the people an agency invites into its workspace, and the clients who use the portal or the onboarding and approval pages. By using any of these you agree to these terms. If you use the service on behalf of a company, you confirm you have authority to bind it.',
      'Clients who sign a written agreement with Get On A Pod, and agencies that join the platform, are also bound by that agreement. Where the written agreement and these terms differ, the written agreement applies.',
    ],
  },
  {
    heading: 'What the service is',
    paragraphs: [
      'Get On A Pod offers two things. The first is a done-for-you podcast guesting service: we research shows, write pitches, send outreach on your behalf, coordinate bookings and prepare you for each recording. The second is an invite-only platform that agencies use to run the same work for their own clients, including podcast discovery, outreach campaigns, client approvals and deliverables.',
    ],
  },
  {
    heading: 'Accounts',
    paragraphs: [
      'Access to the platform is by invitation. You must keep your sign-in credentials secure and must not share them. You are responsible for everything done under your account. An agency is responsible for the actions of every person it invites into its workspace, including its own staff and its clients. Tell us straight away if you believe an account has been accessed without permission.',
    ],
  },
  {
    heading: 'Acceptable use',
    paragraphs: ['You agree not to:'],
    items: [
      'Use the service for anything unlawful, deceptive or harmful.',
      'Send unsolicited bulk email, or any outreach, in breach of applicable law.',
      'Scrape, crawl or bulk-extract data from the platform or the podcast catalogue.',
      'Reverse engineer, decompile or attempt to access the source code of the platform.',
      'Interfere with the service, probe its security or access another workspace\'s data.',
      'Upload content you do not have the right to use or that infringes anyone else\'s rights.',
    ],
    closing: [
      'Agencies are responsible for the outreach they send through the platform, including obtaining any consent that is required, honouring opt-outs and complying with CAN-SPAM, GDPR, CASL and any other law that applies to their recipients. We may suspend or remove access that we reasonably believe breaches these terms.',
    ],
  },
  {
    heading: 'Your content',
    paragraphs: [
      'You keep ownership of everything you provide, including bios, headshots, topics, files and messages. You grant Get On A Pod, and where relevant your agency, a non-exclusive, worldwide, royalty-free licence to store, copy, adapt and share that content as needed to deliver the service, which includes presenting it to podcast hosts. You confirm you have the rights needed to grant this licence. The licence ends when the content is deleted, except for copies already shared with hosts and copies kept in backups for a limited period.',
    ],
  },
  {
    heading: 'AI features',
    paragraphs: [
      'Parts of the platform use AI to draft pitches, summarise shows and suggest matches. AI output is a suggestion for you to review before it is used. We do not guarantee that AI output is accurate, complete or suitable for any particular purpose, and you are responsible for what you send.',
    ],
  },
  {
    heading: 'Fees',
    paragraphs: [
      'Pricing is stated on the website so you can decide whether to ask to join. Billing terms, including the start date, minimum term and payment schedule, are agreed in writing when you join. Subscriptions and credit purchases are billed through Stripe. Fees are non-refundable except where the law requires otherwise. We may change prices for future periods with reasonable notice.',
    ],
  },
  {
    heading: 'No guarantee of placements',
    paragraphs: [
      'Podcast hosts decide who they interview. We cannot promise that any particular show will book you, that a booked episode will be recorded or published, or that an appearance will produce any particular business result. We commit to the work described in your agreement, not to a number of placements.',
    ],
  },
  {
    heading: 'Third-party services',
    paragraphs: [
      'The service depends on things outside our control, including podcast hosts, email providers, scheduling tools, payment providers and hosting. We are not responsible for their availability, conduct or decisions. Where an agency connects its own account with a provider such as Instantly or Google, that provider\'s terms also apply to the agency\'s use of it.',
    ],
  },
  {
    heading: 'Intellectual property',
    paragraphs: [
      'The platform, including its software, design, documentation, podcast research and the Get On A Pod name and branding, belongs to Get On A Pod or its licensors. These terms give you a limited, non-transferable right to use the platform for its intended purpose while your account is active. Nothing here transfers any ownership to you.',
    ],
  },
  {
    heading: 'Termination',
    paragraphs: [
      'Either side may end the relationship in line with the notice terms in the written agreement, or, where there is none, at any time with written notice. We may suspend or end access immediately for a material breach of these terms. On termination, you can ask for an export of your data. After a recovery window, workspace data is deleted, apart from records we are required to keep by law.',
    ],
  },
  {
    heading: 'Disclaimer of warranties',
    paragraphs: [
      'The platform is provided as is and as available. To the extent permitted by law, we disclaim all warranties, express or implied, including warranties of merchantability, fitness for a particular purpose and non-infringement, and we do not warrant that the service will be uninterrupted or error-free.',
    ],
  },
  {
    heading: 'Limitation of liability',
    paragraphs: [
      'To the extent permitted by law, Get On A Pod is not liable for any indirect, incidental, special or consequential loss, or for lost profits, revenue, data or goodwill, arising from your use of the service. Our total liability for all claims arising under these terms is capped at the fees you paid to us in the twelve months before the event giving rise to the claim. Nothing in these terms limits liability that cannot be limited by law.',
    ],
  },
  {
    heading: 'Indemnity',
    paragraphs: [
      'You agree to indemnify Get On A Pod against claims, losses and reasonable costs arising from your misuse of the service, your breach of these terms, the content you provide, or outreach you send in breach of applicable law.',
    ],
  },
  {
    heading: 'Governing law and disputes',
    paragraphs: [
      'The governing law and venue for disputes are set out in the written agreement each client signs when joining.',
    ],
  },
  {
    heading: 'Changes to these terms',
    paragraphs: [
      'We may update these terms as the service changes. We will post the new version on this page with a new effective date and give account holders reasonable notice of material changes by email or in the app. Continuing to use the service after the change takes effect means you accept the updated terms.',
    ],
  },
];

const Terms = () => {
  return (
    <div className="dfy-page">
      <PageSEO
        title="Terms of service | Get On A Pod"
        description="The terms that govern use of the Get On A Pod website, the agency workspace and the client portal."
        path="/terms"
      />
      <Navbar />

      <main className="dfy-wrap">
        <section className="dfy-page-hero">
          <span className="dfy-kicker">Terms</span>
          <h1>Terms of service</h1>
          <p className="dfy-page-lead">
            The rules for using the Get On A Pod website, the agency workspace and the client portal, and what each side can expect from the other.
          </p>
          <p className="dfy-kicker dfy-facts">
            <span>Effective {EFFECTIVE_DATE}</span>
          </p>
        </section>

        <hr className="dfy-rule" />

        <section className="dfy-section-tight">
          <div className="dfy-prose">
            {sections.map((section) => (
              <section key={section.heading}>
                <h2>{section.heading}</h2>
                {section.paragraphs?.map((paragraph) => (
                  <p key={paragraph}>{paragraph}</p>
                ))}
                {section.items ? (
                  <ul>
                    {section.items.map((item) => (
                      <li key={item}>{item}</li>
                    ))}
                  </ul>
                ) : null}
                {section.closing?.map((paragraph) => (
                  <p key={paragraph}>{paragraph}</p>
                ))}
              </section>
            ))}

            <section>
              <h2>Contact</h2>
              <p>
                Questions about these terms can be sent to{' '}
                <a href={`mailto:${CONTACT_EMAIL}`}>
                  {CONTACT_EMAIL}
                </a>
                .
              </p>
            </section>
          </div>
        </section>
      </main>

      <Footer />
    </div>
  );
};

export default Terms;
