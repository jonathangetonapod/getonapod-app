import { useScrollAnimation } from '@/hooks/useScrollAnimation';
import { Shield, CheckCircle2 } from 'lucide-react';
import { Badge } from '@/components/ui/badge';

const checkmarks = [
  "Every placement delivered",
  "No time limits on our guarantee",
  "No excuses, just results",
];

const GuaranteeSection = () => {
  const { ref, isVisible } = useScrollAnimation<HTMLDivElement>();

  return (
    <section className="py-12 md:py-20 bg-primary/5 px-4" id="guarantee">
      <div className="container mx-auto">
        <div
          ref={ref}
          className={`transition-all duration-700 ${
            isVisible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-8'
          }`}
        >
          <div className="max-w-3xl mx-auto text-center rounded-3xl border-2 border-primary/30 bg-background p-8 sm:p-10 md:p-14 shadow-lg">
            {/* Badge */}
            <Badge className="mb-6 bg-success/10 text-success border-success/20">
              Results Guaranteed
            </Badge>

            {/* Shield Icon */}
            <div className="flex items-center justify-center mb-6">
              <div className="inline-flex items-center justify-center w-16 h-16 sm:w-20 sm:h-20 rounded-full bg-primary/10">
                <Shield className="h-8 w-8 sm:h-10 sm:w-10 text-primary" />
              </div>
            </div>

            {/* Main Heading */}
            <h2 className="text-3xl sm:text-4xl md:text-5xl font-bold text-foreground mb-4 sm:mb-6">
              If We Don't Deliver, We Work For Free
            </h2>

            {/* Subtext */}
            <p className="text-base sm:text-lg md:text-xl text-muted-foreground max-w-2xl mx-auto mb-8 sm:mb-10 leading-relaxed">
              You get the exact number of podcast placements promised in your plan. If we fall short
              in your agreed timeframe, we keep pitching, booking, and coordinating at no additional
              cost until every placement is delivered.
            </p>

            {/* Checkmarks */}
            <div className="flex flex-col sm:flex-row flex-wrap items-center justify-center gap-4 sm:gap-6 md:gap-8">
              {checkmarks.map((label) => (
                <div key={label} className="flex items-center gap-2">
                  <CheckCircle2 className="h-5 w-5 text-success flex-shrink-0" />
                  <span className="text-sm sm:text-base font-medium text-foreground">
                    {label}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
};

export default GuaranteeSection;
