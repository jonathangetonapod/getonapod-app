import { Button } from '@/components/ui/button';

const HeroSection = () => {
  return (
    <section className="relative min-h-screen flex items-center justify-center pt-24 pb-16 md:pt-20 md:pb-24 px-4">
      <div className="container mx-auto text-center">
        <div className="max-w-4xl mx-auto">
          <h1 className="animate-fade-up text-4xl sm:text-5xl md:text-6xl lg:text-7xl font-bold tracking-tight text-foreground leading-[1.2] sm:leading-tight mb-6 px-2">
            Get Booked on Podcasts.
            <br />
            Build Your Authority.
            <br />
            <span className="text-primary">Without Pitching Yourself.</span>
          </h1>

          <p className="animate-fade-up animation-delay-100 text-base sm:text-lg md:text-xl text-muted-foreground max-w-2xl mx-auto mb-8 sm:mb-10 leading-relaxed px-4">
            We research, pitch, and book podcast appearances that build your credibility
            and attract qualified leads. You just show up and talk.
          </p>

          <div className="animate-fade-up animation-delay-200 flex flex-col sm:flex-row gap-3 sm:gap-4 justify-center px-4">
            <Button variant="hero" size="xl" className="w-full sm:w-auto min-h-[48px] text-base" asChild>
              <a href="https://calendly.com/getonapodjg/30min/2026-01-12T13:00:00-05:00" target="_blank" rel="noopener noreferrer">Book a Call</a>
            </Button>
            <Button variant="heroOutline" size="xl" className="w-full sm:w-auto min-h-[48px] text-base" asChild>
              <a href="#how-it-works">See How It Works</a>
            </Button>
          </div>

          {/* Trust bar */}
          <div className="animate-fade-up animation-delay-300 mt-12 sm:mt-16 flex flex-col sm:flex-row items-center justify-center gap-6 sm:gap-10 text-sm sm:text-base text-muted-foreground">
            <div className="flex items-center gap-2">
              <span className="text-lg sm:text-xl font-bold text-foreground">150+</span>
              <span>Placements</span>
            </div>
            <div className="hidden sm:block h-5 w-px bg-border" />
            <div className="flex items-center gap-2">
              <span className="text-lg sm:text-xl font-bold text-foreground">50+</span>
              <span>Shows</span>
            </div>
            <div className="hidden sm:block h-5 w-px bg-border" />
            <div className="flex items-center gap-2">
              <span className="text-lg sm:text-xl font-bold text-foreground">Results</span>
              <span>Guaranteed</span>
            </div>
          </div>
        </div>
      </div>

      {/* Bold gradient background with primary/indigo tones */}
      <div className="absolute inset-0 -z-10 overflow-hidden">
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[1200px] h-[900px] bg-gradient-radial from-primary/8 via-primary/3 to-transparent rounded-full blur-3xl" />
        <div className="absolute -top-24 -right-24 w-[600px] h-[600px] bg-gradient-radial from-primary/6 to-transparent rounded-full blur-3xl" />
        <div className="absolute top-1/3 -left-32 w-[500px] h-[500px] bg-gradient-radial from-primary/5 to-transparent rounded-full blur-3xl" />
      </div>
    </section>
  );
};

export default HeroSection;
