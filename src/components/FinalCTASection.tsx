import { Button } from '@/components/ui/button';
import { useScrollAnimation } from '@/hooks/useScrollAnimation';

const nextSteps = [
  'We learn your background, buyer profile, and authority angle.',
  'We show the kind of podcasts that fit before outreach begins.',
  'You see how approvals, booking ops, and portal tracking would work.',
];

const FinalCTASection = () => {
  const { ref, isVisible } = useScrollAnimation<HTMLDivElement>();

  return (
    <section id="book" className="bg-[#0b2036] px-4 py-12 text-[#f7fafc] md:py-20">
      <div className="container mx-auto">
        <div
          ref={ref}
          className={`mx-auto overflow-hidden rounded-[38px] border border-white/10 bg-[radial-gradient(circle_at_top_left,_rgba(45,109,246,0.28),_transparent_38%),radial-gradient(circle_at_bottom_right,_rgba(140,176,221,0.18),_transparent_34%),#10263b] transition-all duration-700 ${
            isVisible ? 'translate-y-0 opacity-100' : 'translate-y-8 opacity-0'
          }`}
        >
          <div className="grid gap-8 px-6 py-10 md:px-10 md:py-14 lg:grid-cols-[1.06fr_0.94fr] lg:gap-12">
            <div className="max-w-2xl">
              <p className="section-kicker text-[#8cb0dd]">Next step</p>
              <h2 className="mt-4 font-editorial text-4xl leading-[0.92] tracking-[-0.05em] sm:text-5xl md:text-6xl">
                See which podcasts you could be a fit for before you commit.
              </h2>

              <p className="mt-5 max-w-xl text-sm leading-8 text-[#d6e5f5] sm:text-base md:text-lg lg:text-xl">
                Get a personalized shortlist based on your background, market, and expertise. We will show you where you fit, how the outreach would work, and what the portal experience looks like.
              </p>

              <div className="mt-8 flex flex-col gap-3 sm:flex-row">
                <Button
                  variant="heroOutline"
                  size="xl"
                  className="min-h-[48px] w-full rounded-full bg-[#f7fafc] text-sm text-[#0d1b2a] sm:min-h-[56px] sm:w-auto sm:text-base"
                  asChild
                >
                  <a href="https://calendly.com/getonapodjg/30min" target="_blank" rel="noopener noreferrer">
                    Get My Podcast Shortlist
                  </a>
                </Button>
                <Button
                  variant="ghost"
                  size="xl"
                  className="min-h-[48px] w-full rounded-full border border-white/12 text-sm text-[#f7fafc] hover:bg-white/10 hover:text-[#f7fafc] sm:min-h-[56px] sm:w-auto sm:text-base"
                  asChild
                >
                  <a href="#pricing">See Pricing</a>
                </Button>
              </div>

              <p className="mt-5 text-sm text-[#c7d9ee]">
                We build the first shortlist after a short strategy call.
              </p>
            </div>

            <div className="rounded-[32px] border border-white/10 bg-white/5 p-6 backdrop-blur-sm">
              <p className="section-kicker text-[#8cb0dd]">What happens on the call</p>
              <div className="mt-5 space-y-4">
                {nextSteps.map((step, index) => (
                  <div
                    key={step}
                    className="flex items-start gap-4 rounded-[24px] border border-white/10 bg-white/5 px-4 py-4"
                  >
                    <span className="font-mono text-xs text-[#8cb0dd]">0{index + 1}</span>
                    <p className="text-sm leading-7 text-[#d6e5f5]">{step}</p>
                  </div>
                ))}
              </div>

              <div className="mt-5 rounded-[24px] border border-[#f7fafc]/10 bg-[#0b2036] px-4 py-4">
                <p className="font-mono text-[11px] uppercase tracking-[0.24em] text-[#8cb0dd]">No pressure</p>
                <p className="mt-2 text-sm leading-7 text-[#d6e5f5]">
                  Clear fit, clear workflow, and a direct answer on whether podcast guesting is worth pursuing for your market.
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
};

export default FinalCTASection;
