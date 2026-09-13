import Navbar from '@/components/Navbar';
import Footer from '@/components/Footer';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { useScrollAnimation } from '@/hooks/useScrollAnimation';
import { CheckCircle2, Clock, PlayCircle, FileText, Mic, Target, TrendingUp } from 'lucide-react';
import PageSEO from '@/components/seo/PageSEO';
import { CALL_LABEL, CALL_URLS, CONTACT_EMAIL, MONTHLY_PRICE } from '@/lib/landingContent';

/**
 * The course is not built yet, and there is no waitlist table behind this
 * page. The page used to show an email field that thanked people and then
 * discarded what they typed; asking them to email us is the honest version.
 */
const WAITLIST_MAILTO = `mailto:${CONTACT_EMAIL}?subject=${encodeURIComponent('Course waitlist')}`;

const modules = [
  {
    icon: Target,
    title: "Module 1: Finding your angle",
    description: "Pin down the problem you solve and the buyer you want to reach, then turn it into three angles a host can say yes to."
  },
  {
    icon: Mic,
    title: "Module 2: Building your target list",
    description: "Research and vet podcasts that match your niche. Learn what makes a good show and how to prioritize your targets."
  },
  {
    icon: FileText,
    title: "Module 3: Your one-sheet and bio",
    description: "Build your one-sheet, bio, talking points, and media kit. Make it easy for hosts to say yes."
  },
  {
    icon: PlayCircle,
    title: "Module 4: Pitching hosts",
    description: "How to write a pitch for one specific show, plus subject lines and follow-ups, with the kinds of pitches that book our clients."
  },
  {
    icon: CheckCircle2,
    title: "Module 5: Preparing for the recording",
    description: "Research the host and audience, plan your talking points and stories, and leave the host wanting you back."
  },
  {
    icon: TrendingUp,
    title: "Module 6: Using the episode afterward",
    description: "Turn one appearance into social posts, emails and clips your customers will actually see."
  }
];

const Course = () => {
  const { ref, isVisible } = useScrollAnimation<HTMLDivElement>();

  return (
    <main className="min-h-screen bg-background">
      <PageSEO
        title="Book yourself on podcasts: a course | Get On A Pod"
        description="A coming course on getting yourself booked on podcasts, using the process Get On A Pod runs for its clients: targeting, pitching, preparing and repurposing."
        path="/course"
      />
      <Navbar />

      {/* Hero Section */}
      <section className="pt-24 pb-12 md:pt-36 md:pb-24 bg-gradient-to-b from-primary/5 to-background px-4">
        <div className="container mx-auto">
          <div className="max-w-3xl mx-auto text-center">
            <Badge className="mb-4">Coming Soon</Badge>
            <h1 className="text-3xl sm:text-4xl md:text-6xl font-bold text-foreground mb-4 md:mb-6 leading-tight">
              Book yourself on podcasts, the way we book our clients
            </h1>
            <p className="text-base sm:text-lg md:text-xl text-muted-foreground mb-6 md:mb-8 leading-relaxed px-2">
              The process Get On A Pod runs for its clients every week — finding the right shows, pitching
              the hosts, preparing for the recording and using the episode afterward — written down so you can run it yourself.
            </p>

            <div className="flex justify-center mb-6 md:mb-8 px-2">
              <Button size="lg" className="w-full sm:w-auto min-h-[48px]" asChild>
                <a href={WAITLIST_MAILTO}>Email us to join the waitlist</a>
              </Button>
            </div>

            <div className="flex flex-col sm:flex-row gap-3 sm:gap-4 justify-center items-center text-sm text-muted-foreground">
              <div className="flex items-center gap-2">
                <CheckCircle2 className="h-5 w-5 text-success flex-shrink-0" />
                6 modules
              </div>
              <div className="flex items-center gap-2">
                <CheckCircle2 className="h-5 w-5 text-success flex-shrink-0" />
                Pitch and one-sheet templates
              </div>
              <div className="flex items-center gap-2">
                <CheckCircle2 className="h-5 w-5 text-success flex-shrink-0" />
                Real pitch examples
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* What's Included Section */}
      <section className="py-10 md:py-20 px-4">
        <div className="container mx-auto">
          <div className="text-center mb-10 md:mb-16">
            <h2 className="text-2xl sm:text-3xl md:text-4xl font-bold text-foreground mb-3 md:mb-4">
              What you will learn
            </h2>
            <p className="text-base sm:text-lg md:text-xl text-muted-foreground max-w-2xl mx-auto leading-relaxed px-2">
              Each module is one stage of a real campaign, with the templates we use at that stage.
            </p>
          </div>

          <div
            ref={ref}
            className={`transition-all duration-700 ${
              isVisible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-8'
            }`}
          >
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 md:gap-8">
              {modules.map((module, index) => {
                const Icon = module.icon;
                return (
                  <div
                    key={index}
                    className="p-5 md:p-8 bg-surface-subtle rounded-xl border border-border"
                    style={{ transitionDelay: `${index * 100}ms` }}
                  >
                    <div className="p-3 bg-primary/10 rounded-lg w-fit mb-3 md:mb-4">
                      <Icon className="h-5 w-5 md:h-6 md:w-6 text-primary" />
                    </div>

                    <h3 className="text-lg md:text-xl font-bold text-foreground mb-2 md:mb-3">
                      {module.title}
                    </h3>

                    <p className="text-sm md:text-base text-muted-foreground">
                      {module.description}
                    </p>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </section>

      {/* Bonuses Section */}
      <section className="py-10 md:py-20 bg-surface-subtle px-4">
        <div className="container mx-auto max-w-4xl">
          <div className="text-center mb-10 md:mb-16">
            <h2 className="text-2xl sm:text-3xl md:text-4xl font-bold text-foreground mb-3 md:mb-4">
              Also included
            </h2>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 md:gap-6">
            <div className="p-4 md:p-6 bg-background rounded-xl border border-border">
              <h3 className="text-base md:text-lg font-bold text-foreground mb-2">
                Pitch templates
              </h3>
              <p className="text-sm md:text-base text-muted-foreground">
                Email templates for cold pitches, warm introductions, follow-ups and thank-yous.
              </p>
            </div>

            <div className="p-4 md:p-6 bg-background rounded-xl border border-border">
              <h3 className="text-base md:text-lg font-bold text-foreground mb-2">
                Guest one-sheet template
              </h3>
              <p className="text-sm md:text-base text-muted-foreground">
                The template we use to position our clients, in a fill-in-the-blank format.
              </p>
            </div>

            <div className="p-4 md:p-6 bg-background rounded-xl border border-border">
              <h3 className="text-base md:text-lg font-bold text-foreground mb-2">
                Repurposing playbook
              </h3>
              <p className="text-sm md:text-base text-muted-foreground">
                A checklist for turning each appearance into posts for LinkedIn, X and your email list.
              </p>
            </div>

            <div className="p-4 md:p-6 bg-background rounded-xl border border-border">
              <h3 className="text-base md:text-lg font-bold text-foreground mb-2">
                Podcast lists by niche
              </h3>
              <p className="text-sm md:text-base text-muted-foreground">
                Active shows sorted by industry, so your first target list is not a blank page.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Timeline Section */}
      <section className="py-10 md:py-20 px-4">
        <div className="container mx-auto max-w-3xl text-center">
          <div className="p-5 md:p-8 bg-surface-subtle rounded-xl border border-border">
            <Clock className="h-10 w-10 md:h-12 md:w-12 text-primary mx-auto mb-3 md:mb-4" />
            <h2 className="text-xl sm:text-2xl md:text-3xl font-bold text-foreground mb-3 md:mb-4">
              Not out yet
            </h2>
            <p className="text-sm md:text-base text-muted-foreground mb-5 md:mb-6">
              Email us and we will tell you the day it launches.
            </p>
            <Button className="w-full sm:w-auto min-h-[48px]" asChild>
              <a href={WAITLIST_MAILTO}>Email us to join the waitlist</a>
            </Button>
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="py-10 md:py-20 bg-primary text-primary-foreground px-4">
        <div className="container mx-auto text-center">
          <h2 className="text-2xl sm:text-3xl md:text-4xl font-bold mb-4 md:mb-6 leading-tight">
            Rather not do it yourself? We do it for ${MONTHLY_PRICE} a month.
          </h2>
          <p className="text-base sm:text-lg md:text-xl mb-6 md:mb-8 max-w-2xl mx-auto opacity-90 leading-relaxed">
            Get On A Pod pitches the shows, books the recordings and sends you a prep brief before each one.
            Most clients have 2–4 bookings a month once outreach ramps up.
          </p>
          <Button variant="secondary" size="lg" asChild className="min-h-[48px]">
            <a href={CALL_URLS.podcasts} target="_blank" rel="noopener noreferrer">{CALL_LABEL.podcasts}</a>
          </Button>
        </div>
      </section>

      <Footer />
    </main>
  );
};

export default Course;
