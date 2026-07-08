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
          <div className="grid gap-8 xl:grid-cols-[0.84fr_1.16fr] xl:items-start">
            <div className="max-w-xl xl:sticky xl:top-32">
              <p className="section-kicker">Q+A</p>
              <h2 className="mt-4 font-editorial text-4xl leading-[0.94] tracking-[-0.045em] text-[#0d1b2a] sm:text-5xl md:text-6xl">
                Questions buyers ask before they book.
              </h2>
              <p className="mt-5 max-w-lg text-base leading-8 text-[#54473d] sm:text-lg">
                These answers cover fit, pricing, guarantees, and how the campaign actually runs. The goal is clarity, not clever copy.
              </p>

              <div className="mt-8 rounded-[28px] border border-[#0d1b2a]/8 bg-[#fffaf4]/92 p-6 shadow-[0_18px_36px_rgba(13,27,42,0.08)]">
                <p className="section-kicker">Still unsure?</p>
                <p className="mt-3 text-base leading-7 text-[#3f342c]">
                  The shortlist call is where we pressure-test fit. If podcast guesting is not a strong channel for your market, we will tell you directly.
                </p>
                <Button variant="hero" size="lg" className="mt-6 rounded-full px-7" asChild>
                  <a href="https://calendly.com/getonapodjg/30min" target="_blank" rel="noopener noreferrer">
                    Book My Shortlist Call
                  </a>
                </Button>
              </div>
            </div>

            <div className="space-y-4">
              {faqCategories.map((category) => (
                <article
                  key={category.category}
                  className="rounded-[28px] border border-[#0d1b2a]/8 bg-white/92 p-6 shadow-[0_16px_34px_rgba(13,27,42,0.08)]"
                >
                  <div className="grid gap-5 lg:grid-cols-[0.34fr_0.66fr] lg:items-start">
                    <div>
                      <p className="font-mono text-[11px] uppercase tracking-[0.2em] text-[#7a6554]">
                        {category.category}
                      </p>
                    </div>

                    <div className="space-y-5">
                      {category.faqs.map((faq, index) => (
                        <div
                          key={faq.question}
                          className={index > 0 ? 'border-t border-[#0d1b2a]/8 pt-5' : ''}
                        >
                          <h3 className="text-lg font-semibold leading-7 text-[#0d1b2a]">
                            {faq.question}
                          </h3>
                          <p className="mt-2 text-sm leading-7 text-[#54473d]">
                            {faq.answer}
                          </p>
                        </div>
                      ))}
                    </div>
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
