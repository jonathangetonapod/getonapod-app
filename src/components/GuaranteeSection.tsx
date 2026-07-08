import { useScrollAnimation } from '@/hooks/useScrollAnimation';
import { Shield, CheckCircle2 } from 'lucide-react';
import { Badge } from '@/components/ui/badge';

const checkmarks = [
  "Placement commitment tied to your plan",
  "If we miss the target, we keep working at no extra management fee",
  "Transparency in the portal while we make up any shortfall",
];

const GuaranteeSection = () => {
  const { ref, isVisible } = useScrollAnimation<HTMLDivElement>();

  return (
    <section className="bg-[#f3f5f7] px-4 py-12 md:py-20" id="guarantee">
      <div className="container mx-auto">
        <div
          ref={ref}
          className={`transition-all duration-700 ${
            isVisible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-8'
          }`}
        >
          <div className="mx-auto max-w-5xl rounded-[36px] border border-[#0d1b2a]/10 bg-[#081a2b] p-4 shadow-[0_30px_70px_rgba(13,27,42,0.2)] md:p-6">
            <div className="grid gap-8 rounded-[28px] bg-[#f8fbff] p-8 md:grid-cols-[0.82fr_1.18fr] md:p-12">
              <div>
                <Badge className="border-[#18c08f]/20 bg-[#18c08f]/10 text-[#087f5b]">
                  Placement commitment
                </Badge>

                <div className="mt-6 flex items-center justify-center md:justify-start">
                  <div className="inline-flex h-16 w-16 items-center justify-center rounded-full bg-[#eef4ff] md:h-20 md:w-20">
                    <Shield className="h-8 w-8 text-[#2d6df6] md:h-10 md:w-10" />
                  </div>
                </div>

                <h2 className="mt-6 font-display text-3xl font-semibold tracking-[-0.05em] text-[#0d1b2a] sm:text-4xl md:text-5xl">
                  If we miss the agreed target, we keep working until the owed placements are made up.
                </h2>
              </div>

              <div>
                <p className="text-base leading-8 text-[#4c5d73] sm:text-lg">
                  We do not treat podcast booking like a vague awareness project. Your plan includes a clear delivery target.
                  If we fall short on the agreed placement commitment, we continue pitching, following up, and coordinating at no
                  additional management fee until the shortfall is closed.
                </p>

                <div className="mt-8 space-y-4">
                  {checkmarks.map((label) => (
                    <div key={label} className="flex items-start gap-3 rounded-2xl border border-[#0d1b2a]/8 bg-[#ffffff] px-4 py-4">
                      <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-[#18c08f]" />
                      <span className="text-sm leading-6 text-[#30465f]">
                        {label}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
};

export default GuaranteeSection;
