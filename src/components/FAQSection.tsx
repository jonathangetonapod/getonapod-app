import { useScrollAnimation } from '@/hooks/useScrollAnimation';
import { PricingFAQ } from '@/components/pricing/PricingFAQ';

const FAQSection = () => {
  const { ref, isVisible } = useScrollAnimation<HTMLDivElement>();

  return (
    <section id="faq" className="bg-[#f8fbff] px-4 py-12 md:py-20">
      <div className="container mx-auto">
        <div
          ref={ref}
          className={`mx-auto max-w-5xl transition-all duration-700 ${
            isVisible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-8'
          }`}
        >
          <div className="mb-10 max-w-3xl">
            <p className="section-kicker">FAQ</p>
            <h2 className="mt-4 font-display text-4xl font-semibold tracking-[-0.05em] text-[#0d1b2a] sm:text-5xl md:text-6xl">
              Questions serious buyers ask before they commit.
            </h2>
            <p className="mt-5 text-base leading-8 text-[#4c5d73] sm:text-lg">
              The answers below focus on fit, transparency, guarantees, and how the platform works in practice.
            </p>
          </div>

          <div className="rounded-[32px] border border-[#0d1b2a]/8 bg-[#ffffff] p-6 shadow-[0_16px_34px_rgba(13,27,42,0.08)] sm:p-8 md:p-10">
            <PricingFAQ variant="compact" />
          </div>
        </div>
      </div>
    </section>
  );
};

export default FAQSection;
