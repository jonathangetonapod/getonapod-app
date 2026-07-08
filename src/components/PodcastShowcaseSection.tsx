import { useState, useEffect } from 'react';
import { useScrollAnimation } from '@/hooks/useScrollAnimation';
import { Button } from '@/components/ui/button';
import { ArrowRight, Loader2, Mic, PlayCircle, TrendingUp } from 'lucide-react';
import { searchBusinessPodcasts, PodcastData } from '@/services/podscan';
import { useToast } from '@/hooks/use-toast';
import { PodcastAnalyticsModal } from '@/components/PodcastAnalyticsModal';

const stats = [
  {
    label: 'consumed a podcast in the last month',
    value: '58%',
    source: 'Infinite Dial 2026',
    icon: PlayCircle,
  },
  {
    label: 'ad recall among the most active podcast users',
    value: '86%',
    source: 'Sounds Profitable 2025',
    icon: TrendingUp,
  },
  {
    label: 'B2B decision-makers more receptive to strong thought leadership',
    value: '9 in 10',
    source: 'LinkedIn x Edelman',
    icon: Mic,
  },
];

const PodcastShowcaseSection = () => {
  const { ref, isVisible } = useScrollAnimation<HTMLDivElement>();
  const [podcasts, setPodcasts] = useState<PodcastData[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [selectedPodcast, setSelectedPodcast] = useState<PodcastData | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const { toast } = useToast();

  const handlePodcastClick = (podcast: PodcastData) => {
    setSelectedPodcast(podcast);
    setIsModalOpen(true);
  };

  useEffect(() => {
    const loadPodcasts = async () => {
      try {
        setIsLoading(true);
        const data = await searchBusinessPodcasts(12);
        setPodcasts(data);
      } catch (error) {
        console.error('Failed to load podcasts:', error);
        toast({
          title: "Failed to load podcasts",
          description: "Using fallback data. Please try again later.",
          variant: "destructive",
        });
        // Fallback to static data if API fails
        setPodcasts([
          { podcast_id: '1', podcast_name: "Tech Leaders Podcast", podcast_url: '', podcast_description: '', podcast_categories: [{ category_id: '1', category_name: 'Technology' }] },
          { podcast_id: '2', podcast_name: "The SaaS Show", podcast_url: '', podcast_description: '', podcast_categories: [{ category_id: '2', category_name: 'SaaS' }] },
          { podcast_id: '3', podcast_name: "Founder Stories", podcast_url: '', podcast_description: '', podcast_categories: [{ category_id: '3', category_name: 'Entrepreneurship' }] },
          { podcast_id: '4', podcast_name: "FinTech Insider", podcast_url: '', podcast_description: '', podcast_categories: [{ category_id: '4', category_name: 'Finance' }] },
          { podcast_id: '5', podcast_name: "Growth Talks", podcast_url: '', podcast_description: '', podcast_categories: [{ category_id: '5', category_name: 'Marketing' }] },
          { podcast_id: '6', podcast_name: "The Executive Edge", podcast_url: '', podcast_description: '', podcast_categories: [{ category_id: '6', category_name: 'Leadership' }] },
          { podcast_id: '7', podcast_name: "Scale & Grow", podcast_url: '', podcast_description: '', podcast_categories: [{ category_id: '7', category_name: 'Business' }] },
          { podcast_id: '8', podcast_name: "Startup Success", podcast_url: '', podcast_description: '', podcast_categories: [{ category_id: '8', category_name: 'Startups' }] },
        ]);
      } finally {
        setIsLoading(false);
      }
    };

    loadPodcasts();
  }, []);

  return (
    <section className="bg-[#f8fbff] px-4 py-12 md:py-20" id="results">
      <div className="container mx-auto">
        <div
          ref={ref}
          className={`transition-all duration-700 ${
            isVisible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-8'
          }`}
        >
          <div className="grid gap-10 lg:grid-cols-[0.92fr_1.08fr] lg:items-start">
            <div className="max-w-xl">
              <p className="section-kicker">Why podcasts work</p>
              <h2 className="mt-4 font-display text-4xl font-semibold tracking-[-0.05em] text-[#0d1b2a] sm:text-5xl md:text-6xl">
                Podcasts build trust before the sales call.
              </h2>
              <p className="mt-5 text-base leading-8 text-[#4c5d73] sm:text-lg">
                A podcast appearance gives buyers 30 to 60 minutes with your ideas inside a show
                they already chose to trust. That is why podcast guesting is a credibility channel,
                not a vanity channel.
              </p>

              <div className="mt-8 grid gap-4">
                {stats.map((stat, index) => {
                  const Icon = stat.icon;

                  return (
                    <div
                      key={stat.value}
                      className="rounded-[24px] border border-[#0d1b2a]/8 bg-[#ffffff] p-5 shadow-[0_14px_30px_rgba(13,27,42,0.08)]"
                      style={{ transitionDelay: `${index * 100}ms` }}
                    >
                      <div className="flex items-start gap-4">
                        <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-[#eef4ff] text-[#2d6df6]">
                          <Icon className="h-6 w-6" strokeWidth={1.8} />
                        </div>
                        <div>
                          <p className="font-display text-4xl font-semibold tracking-[-0.05em] text-[#0d1b2a]">{stat.value}</p>
                          <p className="mt-2 text-sm leading-6 text-[#30465f]">{stat.label}</p>
                          <p className="mt-2 font-mono text-[11px] uppercase tracking-[0.26em] text-[#56708d]">{stat.source}</p>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>

              <div className="mt-8 rounded-[28px] border border-[#0d1b2a]/8 bg-[#081a2b] p-6 text-[#f7fafc] shadow-[0_18px_40px_rgba(13,27,42,0.18)]">
                <p className="section-kicker text-[#8cb0dd]">What this means for you</p>
                <p className="mt-3 text-base leading-7 text-[#d6e5f5]">
                  The right guest appearance compresses trust, positioning, and long-form attention into one channel.
                  GOAP turns that channel into a repeatable system.
                </p>
              </div>
            </div>

            <div>
              <div className="mb-6 flex items-end justify-between gap-4">
                <div>
                  <p className="section-kicker">Results and examples</p>
                  <h3 className="mt-3 font-display text-3xl font-semibold tracking-[-0.05em] text-[#0d1b2a]">
                    Shows our clients get placed on.
                  </h3>
                </div>
                <p className="hidden max-w-xs text-sm leading-6 text-[#5d7188] md:block">
                  Click any card to inspect the show. This is the kind of visibility buyers expect from a real platform.
                </p>
              </div>

              {isLoading ? (
                <div className="flex min-h-[320px] items-center justify-center rounded-[32px] border border-[#0d1b2a]/8 bg-[#ffffff]">
                  <Loader2 className="h-8 w-8 animate-spin text-[#2d6df6]" />
                  <span className="ml-3 text-[#5d7188]">Loading shows...</span>
                </div>
              ) : (
                <div className="grid grid-cols-2 gap-4 md:grid-cols-3">
                  {podcasts.map((podcast, index) => (
                    <button
                      key={podcast.podcast_id}
                      type="button"
                      onClick={() => handlePodcastClick(podcast)}
                      className="group overflow-hidden rounded-[24px] border border-[#0d1b2a]/8 bg-[#ffffff] text-left transition-all duration-300 hover:-translate-y-1 hover:border-[#2d6df6]/30 hover:shadow-[0_18px_34px_rgba(13,27,42,0.12)]"
                      style={{ transitionDelay: `${index * 40}ms` }}
                    >
                      <div className="relative aspect-square overflow-hidden bg-gradient-to-br from-[#dfeafb] via-[#eef4ff] to-[#d8f7ed]">
                        {podcast.podcast_image_url ? (
                          <img
                            src={podcast.podcast_image_url}
                            alt={podcast.podcast_name}
                            className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
                          />
                        ) : (
                          <div className="flex h-full w-full items-end p-4">
                            <span className="font-display text-lg font-semibold leading-tight tracking-[-0.04em] text-[#0d1b2a]">
                              {podcast.podcast_name}
                            </span>
                          </div>
                        )}
                        <div className="absolute left-3 top-3 rounded-full border border-white/60 bg-white/80 px-2.5 py-1 font-mono text-[10px] uppercase tracking-[0.2em] text-[#56708d] backdrop-blur">
                          {podcast.podcast_categories?.[0]?.category_name ?? 'Business'}
                        </div>
                      </div>

                      <div className="p-4">
                        <h4 className="line-clamp-2 text-sm font-semibold leading-6 text-[#0d1b2a] md:text-base">
                          {podcast.podcast_name}
                        </h4>
                        <p className="mt-2 inline-flex items-center gap-2 text-xs uppercase tracking-[0.18em] text-[#2d6df6]">
                          View details
                          <ArrowRight className="h-3.5 w-3.5" />
                        </p>
                      </div>
                    </button>
                  ))}
                </div>
              )}

              <div className="mt-8 flex flex-col gap-4 sm:flex-row">
                <Button variant="hero" size="lg" className="rounded-full px-7" asChild>
                  <a href="https://calendly.com/getonapodjg/30min" target="_blank" rel="noopener noreferrer">
                    Get My Podcast Shortlist
                  </a>
                </Button>
                <Button variant="heroOutline" size="lg" className="rounded-full px-7" asChild>
                  <a href="/premium-placements">View Premium Placements</a>
                </Button>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Podcast Analytics Modal */}
      <PodcastAnalyticsModal
        podcast={selectedPodcast}
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
      />
    </section>
  );
};

export default PodcastShowcaseSection;
