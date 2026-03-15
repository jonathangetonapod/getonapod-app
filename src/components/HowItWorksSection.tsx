import { useScrollAnimation } from '@/hooks/useScrollAnimation';
import { Calendar, Target, Mic, TrendingUp, ArrowRight, CheckCircle2 } from 'lucide-react';

const steps = [
  {
    number: "01",
    title: "Book a Call",
    description: "We'll discuss your goals, niche, and which plan fits.",
    details: [
      "15-minute discovery call",
      "Identify your ideal shows",
      "Pick the right plan"
    ],
    icon: Calendar,
  },
  {
    number: "02",
    title: "We Get to Work",
    description: "Researching, pitching, and booking shows that match your expertise.",
    details: [
      "Build your custom podcast list",
      "Craft personalized pitches",
      "Follow up until they say yes"
    ],
    icon: Target,
  },
  {
    number: "03",
    title: "You Show Up",
    description: "We handle prep, coordination, and scheduling.",
    details: [
      "Get your guest prep kit",
      "Show up and share your story",
      "We handle all the logistics"
    ],
    icon: Mic,
  },
  {
    number: "04",
    title: "Your Authority Grows",
    description: "Consistently, month after month.",
    details: [
      "Build audience and credibility",
      "Generate qualified leads",
      "Become the go-to expert"
    ],
    icon: TrendingUp,
  },
];

const HowItWorksSection = () => {
  const { ref, isVisible } = useScrollAnimation<HTMLDivElement>();

  return (
    <section id="how-it-works" className="py-8 md:py-16 bg-surface-subtle">
      <div className="container mx-auto px-4">
        <div
          ref={ref}
          className={`transition-all duration-700 ${
            isVisible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-8'
          }`}
        >
          {/* Header */}
          <div className="text-center mb-8 sm:mb-12 md:mb-16">
            <h2 className="text-3xl sm:text-4xl md:text-5xl font-bold text-foreground mb-3 sm:mb-4">
              How It Works
            </h2>
            <p className="text-base sm:text-lg md:text-xl text-muted-foreground max-w-2xl mx-auto px-2">
              From first call to published episode—we handle everything so you can focus on showing up and delivering value.
            </p>
          </div>

          {/* Timeline Steps */}
          <div className="max-w-4xl mx-auto">
            {steps.map((step, index) => {
              const Icon = step.icon;
              const isLast = index === steps.length - 1;
              return (
                <div
                  key={index}
                  className="relative flex gap-4 sm:gap-6 md:gap-8"
                  style={{ transitionDelay: `${index * 100}ms` }}
                >
                  {/* Timeline Column */}
                  <div className="flex flex-col items-center flex-shrink-0">
                    {/* Numbered Circle */}
                    <div className="w-10 h-10 sm:w-12 sm:h-12 rounded-full bg-primary flex items-center justify-center text-primary-foreground font-bold text-sm sm:text-base z-10">
                      {step.number}
                    </div>
                    {/* Vertical Line */}
                    {!isLast && (
                      <div className="w-px flex-1 bg-border" />
                    )}
                  </div>

                  {/* Card Content */}
                  <div className={`group flex-1 bg-background rounded-xl sm:rounded-2xl border-2 border-border p-4 sm:p-6 md:p-8 hover:border-primary/50 transition-all duration-300 hover:shadow-xl ${isLast ? 'mb-0' : 'mb-4 sm:mb-6 md:mb-8'}`}>
                    <div className="flex items-start gap-3 sm:gap-4 mb-2 md:mb-3">
                      <Icon className="w-6 h-6 sm:w-7 sm:h-7 text-primary flex-shrink-0 mt-0.5" />
                      <h3 className="text-xl sm:text-2xl md:text-3xl font-bold text-foreground">
                        {step.title}
                      </h3>
                    </div>
                    <p className="text-base sm:text-lg text-muted-foreground mb-3 md:mb-4 ml-9 sm:ml-11">
                      {step.description}
                    </p>

                    {/* Details List */}
                    <ul className="space-y-2 ml-9 sm:ml-11">
                      {step.details.map((detail, detailIndex) => (
                        <li key={detailIndex} className="flex items-start gap-2 sm:gap-3 text-foreground text-sm sm:text-base">
                          <CheckCircle2 className="w-4 h-4 sm:w-5 sm:h-5 text-primary flex-shrink-0 mt-0.5" />
                          <span>{detail}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Bottom CTA */}
          <div className="text-center mt-8 sm:mt-12 md:mt-16">
            <p className="text-base sm:text-lg text-muted-foreground mb-4 sm:mb-6">
              Simple, proven, and completely done-for-you.
            </p>
            <a
              href="#pricing"
              className="inline-flex items-center gap-2 text-primary font-semibold text-base sm:text-lg hover:gap-3 transition-all"
            >
              See Pricing & Plans
              <ArrowRight className="w-4 h-4 sm:w-5 sm:h-5" />
            </a>
          </div>
        </div>
      </div>
    </section>
  );
};

export default HowItWorksSection;
