import { Button } from '@/components/ui/button';
import { useScrollAnimation } from '@/hooks/useScrollAnimation';

const SolutionSection = () => {
  const { ref, isVisible } = useScrollAnimation<HTMLDivElement>();

  return (
    <section className="py-8 md:py-16">
      <div className="container mx-auto px-4 sm:px-6">
        <div
          ref={ref}
          className={`max-w-3xl mx-auto text-center transition-all duration-700 ${
            isVisible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-8'
          }`}
        >
          <p className="text-xs sm:text-sm font-semibold uppercase tracking-wider text-muted-foreground mb-3 sm:mb-4">
            The Solution
          </p>

          <h2 className="text-3xl sm:text-4xl md:text-5xl lg:text-6xl font-bold text-foreground mb-4 sm:mb-6">
            What If Someone Did It For You?
          </h2>

          <p className="text-base sm:text-lg md:text-xl text-muted-foreground leading-relaxed mb-8 sm:mb-10">
            Get On A Pod handles everything—researching shows, writing pitches,
            following up, booking interviews, and coordinating your calendar.
            Pro clients get a full content package to maximize every appearance.
            You pick a plan. We do the work. You show up and talk.
          </p>

          <Button variant="hero" size="lg" className="w-full sm:w-auto min-h-[48px]" asChild>
            <a href="#how-it-works">See How It Works</a>
          </Button>
        </div>
      </div>
    </section>
  );
};

export default SolutionSection;
