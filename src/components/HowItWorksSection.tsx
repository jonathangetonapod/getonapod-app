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
    color: "from-blue-500/20 to-blue-600/20"
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
    color: "from-purple-500/20 to-purple-600/20"
  },
  {
    number: "03",
    title: "You Show Up",
    description: "We handle prep, coordination, and content.",
    details: [
      "Get your guest prep kit",
      "Show up and share your story",
      "Receive content for promotion"
    ],
    icon: Mic,
    color: "from-green-500/20 to-green-600/20"
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
    color: "from-orange-500/20 to-orange-600/20"
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
          <div className="text-center mb-12 md:mb-16">
            <h2 className="text-4xl md:text-5xl font-bold text-foreground mb-4">
              How It Works
            </h2>
            <p className="text-xl text-muted-foreground max-w-2xl mx-auto">
              From first call to published episode—we handle everything so you can focus on showing up and delivering value.
            </p>
          </div>

          {/* Steps */}
          <div className="max-w-6xl mx-auto space-y-6 md:space-y-8">
            {steps.map((step, index) => {
              const Icon = step.icon;
              return (
                <div
                  key={index}
                  className="relative"
                  style={{ transitionDelay: `${index * 100}ms` }}
                >
                  <div className="group relative bg-background rounded-2xl border-2 border-border p-6 md:p-8 hover:border-primary/50 transition-all duration-300 hover:shadow-xl">
                    <div className="flex flex-col md:flex-row gap-6 md:gap-8">
                      {/* Number & Icon */}
                      <div className="flex items-start gap-4 md:gap-6">
                        <div className="flex-shrink-0">
                          <div className={`relative w-16 h-16 md:w-20 md:h-20 rounded-2xl bg-gradient-to-br ${step.color} flex items-center justify-center`}>
                            <Icon className="w-8 h-8 md:w-10 md:h-10 text-foreground" />
                            <div className="absolute -top-2 -right-2 w-8 h-8 bg-primary rounded-full flex items-center justify-center text-primary-foreground font-bold text-sm">
                              {step.number}
                            </div>
                          </div>
                        </div>
                      </div>

                      {/* Content */}
                      <div className="flex-1">
                        <h3 className="text-2xl md:text-3xl font-bold text-foreground mb-3">
                          {step.title}
                        </h3>
                        <p className="text-lg text-muted-foreground mb-4">
                          {step.description}
                        </p>

                        {/* Details List */}
                        <ul className="space-y-2">
                          {step.details.map((detail, detailIndex) => (
                            <li key={detailIndex} className="flex items-start gap-3 text-foreground">
                              <CheckCircle2 className="w-5 h-5 text-primary flex-shrink-0 mt-0.5" />
                              <span>{detail}</span>
                            </li>
                          ))}
                        </ul>
                      </div>
                    </div>
                  </div>

                  {/* Arrow Connector */}
                  {index < steps.length - 1 && (
                    <div className="flex justify-center py-4">
                      <ArrowRight className="w-6 h-6 md:w-8 md:h-8 text-primary animate-bounce" style={{ animationDuration: '2s' }} />
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {/* Bottom CTA */}
          <div className="text-center mt-12 md:mt-16">
            <p className="text-lg text-muted-foreground mb-6">
              Simple, proven, and completely done-for-you.
            </p>
            <a
              href="#pricing"
              className="inline-flex items-center gap-2 text-primary font-semibold text-lg hover:gap-3 transition-all"
            >
              See Pricing & Plans
              <ArrowRight className="w-5 h-5" />
            </a>
          </div>
        </div>
      </div>
    </section>
  );
};

export default HowItWorksSection;
