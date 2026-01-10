import { useScrollAnimation } from '@/hooks/useScrollAnimation';

const WhyProSection = () => {
  const { ref, isVisible } = useScrollAnimation<HTMLDivElement>();

  return (
    <section className="py-8 md:py-16 px-4">
      <div className="container mx-auto">
        <div
          ref={ref}
          className={`max-w-3xl mx-auto text-center transition-all duration-700 ${
            isVisible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-8'
          }`}
        >
          <h2 className="text-3xl sm:text-4xl md:text-5xl font-bold text-foreground mb-6 sm:mb-8">
            Why Pro?
          </h2>

          <div className="text-base sm:text-lg md:text-xl text-muted-foreground leading-relaxed space-y-4 sm:space-y-6 text-left">
            <p>
              <span className="text-foreground font-medium">Podcasts build your audience. Content extends your reach.</span>{' '}
              Pro gives you both.
            </p>

            <p>
              Every episode comes with a full content package—9 short-form video clips,
              2 blog posts, and a guest prep kit so you show up confident and leave with
              assets ready to repurpose.
            </p>

            <p>
              No more letting great conversations disappear after they air. Turn every
              appearance into weeks of content for LinkedIn, Twitter, your blog, and beyond.
            </p>

            <p className="text-foreground font-medium">
              You don't just appear on podcasts. You turn every appearance into a content engine.
            </p>
          </div>
        </div>
      </div>
    </section>
  );
};

export default WhyProSection;
