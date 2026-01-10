import { useScrollAnimation } from '@/hooks/useScrollAnimation';
import { PricingFAQ } from '@/components/pricing/PricingFAQ';

const FAQSection = () => {
  const { ref, isVisible } = useScrollAnimation<HTMLDivElement>();

  return (
    <section id="faq" className="py-8 md:py-16">
      <div className="container mx-auto">
        <div
          ref={ref}
          className={`max-w-3xl mx-auto transition-all duration-700 ${
            isVisible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-8'
          }`}
        >
          <h2 className="text-4xl md:text-5xl font-bold text-foreground text-center mb-12">
            Questions
          </h2>

          <PricingFAQ />
        </div>
      </div>
    </section>
  );
};

export default FAQSection;
