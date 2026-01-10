import { Button } from '@/components/ui/button';
import { useScrollAnimation } from '@/hooks/useScrollAnimation';

const FinalCTASection = () => {
  const { ref, isVisible } = useScrollAnimation<HTMLDivElement>();

  return (
    <section id="book" className="py-8 md:py-16 bg-primary text-primary-foreground px-4">
      <div className="container mx-auto">
        <div
          ref={ref}
          className={`max-w-3xl mx-auto text-center transition-all duration-700 ${
            isVisible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-8'
          }`}
        >
          <h2 className="text-3xl sm:text-4xl md:text-5xl lg:text-6xl font-bold mb-4 sm:mb-6 leading-tight">
            Ready to Stop Being a Secret?
          </h2>

          <p className="text-sm sm:text-base md:text-lg lg:text-xl text-primary-foreground/80 mb-6 sm:mb-8 md:mb-10">
            Book a call to see if Get On A Pod is right for you.
          </p>

          <Button
            variant="secondary"
            size="xl"
            className="shadow-lg min-h-[48px] sm:min-h-[56px] w-full sm:w-auto text-sm sm:text-base"
            asChild
          >
            <a href="https://calendly.com/getonapodjg/30min/2026-01-12T13:00:00-05:00" target="_blank" rel="noopener noreferrer">Book Your Call</a>
          </Button>

          <p className="text-xs sm:text-sm text-primary-foreground/60 mt-4 sm:mt-6">
            No pitch. No pressure. Just a conversation to see if we're a fit.
          </p>
        </div>
      </div>
    </section>
  );
};

export default FinalCTASection;
