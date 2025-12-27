import { useScrollAnimation } from '@/hooks/useScrollAnimation';
import { useQuery } from '@tanstack/react-query';
import { getFeaturedTestimonials, getEmbedUrl } from '@/services/testimonials';
import { Loader2 } from 'lucide-react';

const SocialProofSection = () => {
  const { ref, isVisible } = useScrollAnimation<HTMLDivElement>();

  // Fetch featured testimonials from database
  const { data: testimonials = [], isLoading } = useQuery({
    queryKey: ['featured-testimonials'],
    queryFn: getFeaturedTestimonials
  });

  // Show nothing if no testimonials
  if (!isLoading && testimonials.length === 0) {
    return null;
  }

  return (
    <section className="py-8 md:py-16 bg-surface-subtle">
      <div className="container mx-auto">
        <div
          ref={ref}
          className={`transition-all duration-700 ${
            isVisible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-8'
          }`}
        >
          <div className="text-center mb-16">
            <h2 className="text-4xl md:text-5xl lg:text-6xl font-bold text-foreground mb-4">
              What Our Clients Say
            </h2>
            <p className="text-xl text-muted-foreground max-w-2xl mx-auto">
              Hear directly from founders and executives who've transformed their authority through strategic podcast placements.
            </p>
          </div>

          {isLoading ? (
            <div className="flex justify-center py-12">
              <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
              {testimonials.map((testimonial, index) => (
                <div
                  key={testimonial.id}
                  className="group bg-background rounded-xl border border-border overflow-hidden hover:border-primary/50 transition-all duration-300 hover:shadow-lg"
                  style={{ transitionDelay: `${index * 100}ms` }}
                >
                  {/* Video Embed */}
                  <div className="relative aspect-video bg-muted">
                    <iframe
                      src={getEmbedUrl(testimonial.video_url)}
                      title={`${testimonial.client_name} testimonial`}
                      allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                      allowFullScreen
                      className="absolute inset-0 w-full h-full"
                    />
                  </div>

                  {/* Testimonial Info */}
                  <div className="p-6">
                    {testimonial.quote && (
                      <blockquote className="text-foreground mb-4 italic">
                        "{testimonial.quote}"
                      </blockquote>
                    )}
                    <div>
                      <p className="font-semibold text-foreground">{testimonial.client_name}</p>
                      {testimonial.client_title && (
                        <p className="text-sm text-muted-foreground">
                          {testimonial.client_title}
                        </p>
                      )}
                      {testimonial.client_company && (
                        <p className="text-sm text-muted-foreground">
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
