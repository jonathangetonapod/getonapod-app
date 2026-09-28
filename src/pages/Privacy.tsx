// This privacy policy was drafted from what the product actually collects and
// which providers it uses. It needs review by counsel before it is treated as
// final. Do not name a company registration number or a governing-law
// jurisdiction here without that review.
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
    heading: 'Who we are and what this policy covers',
    paragraphs: [
      'Get On A Pod is a podcast guesting service and an invite-only platform for agencies. Agencies use the platform, which we call a workspace, to manage podcast outreach for their own clients. This policy explains what personal data we collect through the website, the workspace app, the client portal and the public onboarding and approval pages, why we collect it, who we share it with and what choices you have.',
      'We act in two different roles. For visitors to our website and for the clients we serve directly, Get On A Pod is the controller of your personal data. For the clients of an agency that uses our platform, the agency is the controller and Get On A Pod is a processor acting on that agency\'s instructions. If you are an agency\'s client and have a question about how your data is handled, contact the agency first; we will assist them in responding.',
    ],
  },
  {
    heading: 'Data we collect',
    paragraphs: ['What we collect depends on how you use the service.'],
    items: [
      'Enquiries and bookings: your name, email address, company and any message you send through the request-to-join form or when you book a call with us.',
      'Workspace accounts: the email address, name and role of each person an agency invites into its workspace, together with sign-in records.',
      'Client profiles: the information an agency enters about a client, or that a client enters through an onboarding form or the client portal, such as a bio, headshot, website, LinkedIn profile, speaking topics, availability and any files uploaded to support outreach.',
      'Podcast preferences and approvals: the shows a client approves or declines, and the pitch direction they sign off on.',
      'Outreach and replies: the emails sent to podcast hosts on a client\'s behalf and the replies those hosts send back, handled through the email provider the agency connects.',
      'Usage and technical data: pages visited, actions taken in the app, device and browser information, IP address and error reports generated when something goes wrong.',
    ],
  },
  {
    heading: 'Why we use it and on what basis',
    paragraphs: ['We use personal data for the following purposes.'],
    items: [
      'To respond to your enquiry and hold the call you booked.',
      'To provide the service: researching shows, drafting and sending pitches, tracking replies and bookings, and showing that work in the portal.',
      'To operate and secure accounts, including sign-in, invitations, access control and audit logs.',
      'To improve the product, understand how it is used and fix errors.',
      'To send service messages such as invitations, approval requests, booking confirmations and reminders.',
      'To meet legal obligations and to establish, exercise or defend legal claims.',
    ],
    closing: [
      'Where data protection law requires a legal basis, we rely on the performance of a contract with you, our legitimate interests in running and improving the service, your consent where we ask for it, and compliance with legal obligations. When we act as a processor for an agency, the agency is responsible for establishing its own legal basis for the outreach it runs.',
    ],
  },
  {
    heading: 'Who we share it with',
    paragraphs: [
      'We do not sell personal data. We share it with service providers that help us run the platform, each under terms that restrict how they may use it.',
    ],
    items: [
      'Supabase: hosting, database, authentication and file storage.',
      'Stripe: subscriptions and credit purchases.',
      'Instantly: outreach email sending, when an agency connects its own Instantly account.',
      'Resend: transactional email such as invitations and notifications.',
      'Sentry: error monitoring.',
      'Anthropic and OpenAI: AI drafting and matching, on the text supplied for that purpose.',
      'Podscan: podcast catalogue data.',
      'Cal.com: call scheduling.',
      'Google: Sheets and Calendar integrations, where an agency enables them.',
      'Cloudflare and Railway: hosting, delivery and custom domains.',
    ],
    closing: [
      'We also share data with podcast hosts when we pitch a client to their show, with an agency\'s own team members inside its workspace, and with professional advisers, authorities or a successor business where the law requires it or a sale or restructuring makes it necessary.',
    ],
  },
  {
    heading: 'How long we keep it',
    paragraphs: [
      'We keep account and client data for as long as the account is active and for a reasonable period afterwards so that work can be resumed and records kept. You can ask us to delete your data at any time. When a workspace is deleted, its data is purged after a recovery window during which the deletion can be reversed. Enquiry data is kept only as long as needed to follow up. We may keep limited records longer where the law requires it or where they are needed to resolve a dispute.',
    ],
  },
  {
    heading: 'How we protect it',
    paragraphs: [
      'Data is encrypted in transit and at rest. Access inside the platform is enforced with row-level controls so that each workspace can only reach its own records. Passwords and session tokens are stored as hashes, and credentials for connected providers are encrypted before they are saved. Access to production systems is limited to the people who need it. No system is perfectly secure, so if you believe your account has been compromised, contact us straight away.',
    ],
  },
  {
    heading: 'Cookies and browser storage',
    paragraphs: [
      'We use only essential storage. The website and app use browser storage to keep you signed in and to remember basic preferences. Client portal sessions are held in session storage and end when you close the browser. We do not use advertising cookies or cross-site tracking.',
    ],
  },
  {
    heading: 'International transfers',
    paragraphs: [
      'Our providers operate in several countries, so your data may be stored or processed outside the country you live in. Where a transfer leaves a jurisdiction with data protection law that restricts it, we rely on safeguards recognised by that law, such as standard contractual clauses, and on our providers\' own commitments to protect your data.',
    ],
  },
  {
    heading: 'Your rights',
    paragraphs: ['Depending on where you live, you may have the right to:'],
    items: [
      'Access the personal data we hold about you.',
      'Correct data that is inaccurate or incomplete.',
      'Have your data deleted.',
      'Receive a copy of your data in a portable format.',
      'Object to, or ask us to restrict, certain processing.',
      'Withdraw consent where processing relies on it.',
      'Complain to a supervisory authority in your country.',
    ],
    closing: [
      'To exercise any of these rights, email us at the address below. If we process your data on behalf of an agency, we will pass your request to that agency and help them respond.',
    ],
  },
  {
    heading: 'Children',
    paragraphs: [
      'The service is for businesses and professionals and is not intended for anyone under 18. We do not knowingly collect data from children. If you believe a child has provided us with personal data, contact us and we will delete it.',
    ],
  },
  {
    heading: 'Changes to this policy',
    paragraphs: [
      'We may update this policy as the service changes. When we do, we will change the effective date at the top of this page and, for material changes, notify account holders by email or in the app.',
    ],
  },
];

const Privacy = () => {
  return (
    <div className="dfy-page">
      <PageSEO
        title="Privacy policy | Get On A Pod"
        description="How Get On A Pod collects, uses, shares and protects personal data across the website, the agency workspace and the client portal."
        path="/privacy"
      />
      <Navbar />

      <main className="dfy-wrap">
        <section className="dfy-page-hero">
          <span className="dfy-kicker">Privacy</span>
          <h1>Privacy policy</h1>
          <p className="dfy-page-lead">
            What we collect, why, who we share it with and the choices you have. This policy applies to the Get On A Pod website, the agency workspace and the client portal.
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
                Questions, requests about your data or concerns about this policy can be sent to{' '}
                <a href={`mailto:${CONTACT_EMAIL}`}>
                  {CONTACT_EMAIL}
                </a>
                . We aim to respond within 30 days.
              </p>
            </section>
          </div>
        </section>
      </main>

      <Footer />
    </div>
  );
};

export default Privacy;
