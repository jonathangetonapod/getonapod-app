import { useScrollAnimation } from '@/hooks/useScrollAnimation';
import { useQuery } from '@tanstack/react-query';
import { getFeaturedTestimonials, getEmbedUrl } from '@/services/testimonials';
import { supabase } from '@/lib/supabase';
import { Loader2, Quote } from 'lucide-react';

interface SocialProofSectionProps {
  testimonialIds?: string[];
}

const SocialProofSection = ({ testimonialIds }: SocialProofSectionProps) => {
  const { ref, isVisible } = useScrollAnimation<HTMLDivElement>();

  // Fetch testimonials - either specific ones or featured ones
  const { data: testimonials = [], isLoading } = useQuery({
    queryKey: testimonialIds ? ['prospect-testimonials', testimonialIds] : ['featured-testimonials'],
    queryFn: async () => {
      // If specific testimonial IDs provided, fetch those
      if (testimonialIds && testimonialIds.length > 0) {
        const { data } = await supabase
          .from('testimonials')
          .select('*')
          .in('id', testimonialIds)
          .eq('is_active', true)
          .order('display_order', { ascending: true });

        return data || [];
      }

      // Otherwise fetch featured testimonials
      return getFeaturedTestimonials();
    }
  });

  // Show nothing if no testimonials
  if (!isLoading && testimonials.length === 0) {
    return null;
  }

  return (
    <section className="bg-[#081a2b] px-4 py-12 md:py-20 text-[#f7fafc]">
      <div className="container mx-auto">
        <div
          ref={ref}
          className={`transition-all duration-700 ${
            isVisible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-8'
          }`}
        >
          <div className="mx-auto mb-12 max-w-3xl text-center">
            <p className="section-kicker text-[#d4b08f]">Proof</p>
            <h2 className="mt-4 font-display text-4xl font-semibold tracking-[-0.05em] text-[#f7fafc] sm:text-5xl md:text-6xl">
              Hear it from clients who stopped doing this alone.
            </h2>
            <p className="mx-auto mt-5 max-w-2xl text-base leading-8 text-[#d8c8b5] sm:text-lg">
              Video proof beats polished promises. These are the people who already moved from random outreach to a system.
            </p>
          </div>

          {isLoading ? (
            <div className="flex justify-center py-12">
              <Loader2 className="h-8 w-8 animate-spin text-[#d4b08f]" />
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-6 md:grid-cols-2 xl:grid-cols-3">
              {testimonials.map((testimonial, index) => (
                <div
                  key={testimonial.id}
                  className="group overflow-hidden rounded-[28px] border border-white/10 bg-white/5 transition-all duration-300 hover:-translate-y-1 hover:border-[#d4b08f]/30 hover:shadow-[0_20px_36px_rgba(3,10,18,0.28)]"
                  style={{ transitionDelay: `${index * 100}ms` }}
                >
                  <div className="relative aspect-video bg-[#10263b]">
                    <iframe
                      src={getEmbedUrl(testimonial.video_url)}
                      title={`${testimonial.client_name} testimonial`}
                      allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                      allowFullScreen
                      className="absolute inset-0 w-full h-full"
                    />
                  </div>

                  <div className="p-6">
                    <div className="mb-4 flex h-11 w-11 items-center justify-center rounded-2xl bg-[#fff3e8] text-[#b46a3c]">
                      <Quote className="h-5 w-5" strokeWidth={1.8} />
                    </div>
                    {testimonial.quote && (
                      <blockquote className="mb-4 text-base italic leading-7 text-[#f7fafc]">
                        "{testimonial.quote}"
                      </blockquote>
                    )}
                    <div>
                      <p className="font-semibold text-[#f7fafc]">{testimonial.client_name}</p>
                      {testimonial.client_title && (
                        <p className="text-sm text-[#d8c8b5]">
                          {testimonial.client_title}
                        </p>
                      )}
                      {testimonial.client_company && (
                        <p className="text-sm text-[#d4b08f]">
                          {testimonial.client_company}
                        </p>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </section>
  );
};

export default SocialProofSection;
