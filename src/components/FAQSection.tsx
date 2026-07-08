import { Button } from '@/components/ui/button';
import { faqCategories } from '@/components/pricing/PricingFAQ';
import { useScrollAnimation } from '@/hooks/useScrollAnimation';

const FAQSection = () => {
  const { ref, isVisible } = useScrollAnimation<HTMLDivElement>();

  return (
    <section id="faq" className="bg-transparent px-4 py-12 md:py-20">
      <div className="container mx-auto">
        <div
          ref={ref}
          className={`transition-all duration-700 ${
            isVisible ? 'translate-y-0 opacity-100' : 'translate-y-8 opacity-0'
          }`}
        >
          <div className="grid gap-8 lg:grid-cols-[0.72fr_1.28fr] lg:items-start">
            <div className="lg:sticky lg:top-36">
              <p className="section-kicker">FAQ</p>
              <h2 className="mt-4 font-editorial text-4xl leading-[0.95] tracking-[-0.05em] text-[#0d1b2a] sm:text-5xl md:text-6xl">
                Questions buyers ask before they book.
              </h2>
              <p className="mt-5 max-w-lg text-base leading-8 text-[#4c5d73] sm:text-lg">
                These answers cover fit, pricing, guarantees, and how the campaign actually runs.
              </p>

              <div className="mt-8 rounded-[30px] border border-[#0d1b2a]/8 bg-[#f4f8fc]/92 p-6 shadow-[0_18px_36px_rgba(13,27,42,0.08)]">
                <p className="section-kicker">Still unsure?</p>
                <p className="mt-3 text-base leading-7 text-[#30465f]">
                  The shortlist call is where we pressure-test fit. If podcast guesting is not a strong channel for your market, we will tell you directly.
                </p>
                <Button variant="hero" size="lg" className="mt-6 rounded-full px-7" asChild>
                  <a href="https://calendly.com/getonapodjg/30min" target="_blank" rel="noopener noreferrer">
                    Book My Shortlist Call
                  </a>
                </Button>
              </div>
            </div>

            <div className="grid gap-5 xl:grid-cols-3">
              {faqCategories.map((category) => (
                <article
                  key={category.category}
                  className="rounded-[30px] border border-[#0d1b2a]/8 bg-[#ffffff]/82 p-6 shadow-[0_16px_34px_rgba(13,27,42,0.08)] backdrop-blur-sm"
                >
                  <p className="font-mono text-[11px] uppercase tracking-[0.24em] text-[#5d7188]">
                    {category.category}
                  </p>

                  <div className="mt-5 space-y-5">
                    {category.faqs.map((faq, index) => (
                      <div
                        key={faq.question}
                        className={index > 0 ? 'border-t border-[#0d1b2a]/8 pt-5' : ''}
                      >
                        <h3 className="text-base font-semibold leading-7 text-[#0d1b2a]">
                          {faq.question}
                        </h3>
                        <p className="mt-2 text-sm leading-7 text-[#4c5d73]">
                          {faq.answer}
                        </p>
                      </div>
                    ))}
                  </div>
                </article>
              ))}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
};

export default FAQSection;
