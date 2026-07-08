import { Button } from '@/components/ui/button';
import { useScrollAnimation } from '@/hooks/useScrollAnimation';

const FinalCTASection = () => {
  const { ref, isVisible } = useScrollAnimation<HTMLDivElement>();

  return (
    <section id="book" className="bg-[#0b2036] px-4 py-12 text-[#f7fafc] md:py-20">
      <div className="container mx-auto">
        <div
          ref={ref}
          className={`mx-auto max-w-4xl rounded-[36px] border border-white/10 bg-[radial-gradient(circle_at_top_left,_rgba(45,109,246,0.28),_transparent_38%),radial-gradient(circle_at_bottom_right,_rgba(24,192,143,0.18),_transparent_34%),#10263b] px-6 py-10 text-center transition-all duration-700 md:px-10 md:py-14 ${
            isVisible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-8'
          }`}
        >
          <p className="section-kicker text-[#8cb0dd]">Next step</p>
          <h2 className="mt-4 font-display text-3xl font-semibold leading-tight tracking-[-0.05em] sm:text-4xl md:text-5xl lg:text-6xl">
            See which podcasts you could be a fit for.
          </h2>

          <p className="mx-auto mt-5 max-w-2xl text-sm leading-8 text-[#d6e5f5] sm:text-base md:text-lg lg:text-xl">
            Get a personalized shortlist based on your background, market, and expertise.
            We will show you where you fit, how the outreach would work, and what the portal experience looks like.
          </p>

          <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
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

          <p className="mt-4 text-sm text-[#c7d9ee]">
            We build the first shortlist after a short strategy call.
          </p>

          <p className="mt-5 text-xs text-[#8cb0dd] sm:text-sm">
            No pressure. Clear fit, clear workflow, clear next step.
          </p>
        </div>
      </div>
    </section>
  );
};

export default FinalCTASection;
