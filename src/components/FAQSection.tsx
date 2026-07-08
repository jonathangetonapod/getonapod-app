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
          <div className="rounded-[34px] border border-[#0d1b2a]/8 bg-[#fffdf9]/94 px-6 py-7 shadow-[0_22px_44px_rgba(13,27,42,0.08)] sm:px-8 sm:py-9 lg:px-10">
            <div className="flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
              <div className="max-w-3xl">
                <p className="section-kicker">Q+A</p>
                <h2 className="mt-4 font-editorial text-4xl leading-[0.94] tracking-[-0.045em] text-[#0d1b2a] sm:text-5xl md:text-6xl">
                  Questions buyers ask before they book.
                </h2>
                <p className="mt-5 max-w-2xl text-base leading-8 text-[#54473d] sm:text-lg">
                  These answers cover fit, pricing, guarantees, and how the campaign actually runs. The goal is clarity, not clever copy.
                </p>
              </div>

              <div className="w-full rounded-[24px] border border-[#0d1b2a]/8 bg-[#fff3e8] p-5 lg:max-w-sm">
                <p className="section-kicker">Still unsure?</p>
                <p className="mt-3 text-base leading-7 text-[#3f342c]">
                  The shortlist call is where we pressure-test fit. If podcast guesting is not a strong channel for your market, we will tell you directly.
                </p>
                <Button variant="hero" size="lg" className="mt-5 w-full rounded-full px-7 sm:w-auto" asChild>
                  <a href="https://calendly.com/getonapodjg/30min" target="_blank" rel="noopener noreferrer">
                    Book My Shortlist Call
                  </a>
                </Button>
              </div>
            </div>

            <div className="mt-8 border-t border-[#0d1b2a]/8 pt-8">
              <div className="grid gap-8 md:grid-cols-2 xl:grid-cols-3 xl:gap-10">
                {faqCategories.map((category) => (
                  <article key={category.category}>
                    <p className="font-mono text-[11px] uppercase tracking-[0.2em] text-[#7a6554]">
                      {category.category}
                    </p>

                    <div className="mt-5 space-y-5">
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
                  </article>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
};

export default FAQSection;
