import { useState, useEffect, useMemo } from 'react';
import Navbar from '@/components/Navbar';
import Footer from '@/components/Footer';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { useScrollAnimation } from '@/hooks/useScrollAnimation';
import { Mic, Users, TrendingUp, CheckCircle2, Filter, Star, Award, BarChart3, ChevronDown, ChevronUp, ShoppingCart, Search, X, SlidersHorizontal } from 'lucide-react';
import { Skeleton } from '@/components/ui/skeleton';
import { getActivePremiumPodcasts, type PremiumPodcast } from '@/services/premiumPodcasts';
import { SocialProofNotifications } from '@/components/SocialProofNotifications';
import { CartButton } from '@/components/CartButton';
import { CartDrawer } from '@/components/CartDrawer';
import { useCartStore } from '@/stores/cartStore';
import { toast } from 'sonner';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { PODCAST_CATEGORIES } from '@/lib/categories';
import PageSEO from '@/components/seo/PageSEO';

const AUDIENCE_TIERS = [
  { label: "All Sizes", value: "all", min: 0, max: Infinity },
  { label: "Small (0-25K)", value: "small", min: 0, max: 25000 },
  { label: "Medium (25K-50K)", value: "medium", min: 25000, max: 50000 },
  { label: "Large (50K-100K)", value: "large", min: 50000, max: 100000 },
  { label: "Mega (100K+)", value: "mega", min: 100000, max: Infinity },
];
const PRICE_RANGES = [
  { label: "All Prices", value: "all", min: 0, max: Infinity },
  { label: "Under $1,000", value: "under1k", min: 0, max: 1000 },
  { label: "$1,000 - $2,500", value: "1k-2.5k", min: 1000, max: 2500 },
  { label: "$2,500 - $5,000", value: "2.5k-5k", min: 2500, max: 5000 },
  { label: "$5,000 - $10,000", value: "5k-10k", min: 5000, max: 10000 },
  { label: "$10,000+", value: "10k+", min: 10000, max: Infinity },
];
const SORT_OPTIONS = [
  { label: "Featured", value: "featured" },
  { label: "Price: Low to High", value: "price-asc" },
  { label: "Price: High to Low", value: "price-desc" },
  { label: "Audience: Large to Small", value: "audience-desc" },
  { label: "Audience: Small to Large", value: "audience-asc" },
  { label: "Name: A-Z", value: "name-asc" },
];

const HERO_SIGNALS = [
  'Guaranteed placement once purchased',
  'Choose from a pre-vetted private menu',
  'Prep support included before recording',
];

const DIFFERENCE_POINTS = [
  'Pick exact shows instead of waiting on earned outreach',
  'Buy one-time placements without committing to a monthly retainer',
  'Use this when a specific show matters more than broad campaign volume',
];

const FAQ_ITEMS = [
  {
    question: "What's the difference between Premium Placements and your retainer plans?",
    answer:
      "Retainer plans are earned outreach campaigns where we research and pitch shows that fit your niche. Premium Placements let you choose specific shows from our pre-vetted menu and purchase guaranteed placement slots.",
  },
  {
    question: "How quickly can I get booked?",
    answer:
      "Most Premium Placements are booked within 2 to 3 weeks. Recording usually happens within 4 to 6 weeks, and episodes often air 4 to 8 weeks after recording depending on the show.",
  },
  {
    question: "Can I book multiple shows at once?",
    answer:
      "Yes. Many clients book 3 to 5 placements upfront to create a more consistent content pipeline. We coordinate timing so the appearances do not stack awkwardly.",
  },
  {
    question: "What if I want a show that's not on this list?",
    answer:
      "Book a call with us. We may be able to source specific shows for your package or recommend close alternatives from the broader menu.",
  },
];

const CTA_STEPS = [
  'Tell us which shows or audience types matter most.',
  'We confirm fit, availability, and the best order to book them.',
  'You move into checkout only after the options are clear.',
];

const PremiumPlacements = () => {
  const { ref, isVisible } = useScrollAnimation<HTMLDivElement>();
  const [podcasts, setPodcasts] = useState<PremiumPodcast[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [expandedCards, setExpandedCards] = useState<Set<string>>(new Set());
  const [modalPodcast, setModalPodcast] = useState<PremiumPodcast | null>(null);

  // Filter states
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [selectedAudienceTier, setSelectedAudienceTier] = useState("all");
  const [selectedPriceRange, setSelectedPriceRange] = useState("all");
  const [sortBy, setSortBy] = useState("featured");

  // Cart store
  const { addItem, isInCart } = useCartStore();

  // Handle add to cart
  const handleAddToCart = (podcast: PremiumPodcast) => {
    addItem(podcast);
    toast.success(`${podcast.podcast_name} added to cart!`, {
      description: 'View your cart to proceed to checkout',
    });
  };

  const toggleFeatures = (podcastId: string) => {
    setExpandedCards(prev => {
      const newSet = new Set(prev);
      if (newSet.has(podcastId)) {
        newSet.delete(podcastId);
      } else {
        newSet.add(podcastId);
      }
      return newSet;
    });
  };

  // Get preview text (50 chars max)
  const getPreviewText = (text: string): string => {
    if (text.length <= 50) return text;
    // Truncate to 50 chars at word boundary
    const truncated = text.substring(0, 50);
    const lastSpace = truncated.lastIndexOf(' ');
    return (lastSpace > 0 ? truncated.substring(0, lastSpace) : truncated).trim() + '...';
  };

  // Check if text needs "Read More" (longer than 50 chars)
  const needsReadMore = (text: string): boolean => {
    return text.length > 50;
  };

  useEffect(() => {
    const loadPodcasts = async () => {
      try {
        setIsLoading(true);
        const data = await getActivePremiumPodcasts(); // Load active podcasts from backend
        setPodcasts(data);
      } catch (error) {
        console.error('Failed to load premium podcasts:', error);
        toast({
          title: "Failed to load podcasts",
          description: "Please try again later.",
          variant: "destructive",
        });
      } finally {
        setIsLoading(false);
      }
    };

    loadPodcasts();
  }, []);

  // Helper functions
  const parsePrice = (priceString: string): number => {
    return parseFloat(priceString.replace(/[$,]/g, ''));
  };

  const parseAudience = (audienceString: string | undefined): number => {
    if (!audienceString) return 0;
    return parseFloat(audienceString.replace(/,/g, ''));
  };

  // Comprehensive filtering and sorting
  const filteredAndSortedPodcasts = useMemo(() => {
    let filtered = [...podcasts];

    // Search filter
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase();
      filtered = filtered.filter(p =>
        p.podcast_name.toLowerCase().includes(query) ||
        p.why_this_show?.toLowerCase().includes(query) ||
        p.category?.toLowerCase().includes(query)
      );
    }

    // Category filter
    if (selectedCategory) {
      filtered = filtered.filter(p => p.category === selectedCategory);
    }

    // Audience tier filter
    if (selectedAudienceTier !== "all") {
      const tier = AUDIENCE_TIERS.find(t => t.value === selectedAudienceTier);
      if (tier) {
        filtered = filtered.filter(p => {
          const audience = parseAudience(p.audience_size);
          return audience >= tier.min && audience < tier.max;
        });
      }
    }

    // Price range filter
    if (selectedPriceRange !== "all") {
      const range = PRICE_RANGES.find(r => r.value === selectedPriceRange);
      if (range) {
        filtered = filtered.filter(p => {
          const price = parsePrice(p.price);
          return price >= range.min && price < range.max;
        });
      }
    }

    // Sort
    filtered.sort((a, b) => {
      switch (sortBy) {
        case "featured":
          // Featured first, then by display order
          if (a.is_featured !== b.is_featured) {
            return a.is_featured ? -1 : 1;
          }
          return a.display_order - b.display_order;

        case "price-asc":
          return parsePrice(a.price) - parsePrice(b.price);

        case "price-desc":
          return parsePrice(b.price) - parsePrice(a.price);

        case "audience-desc":
          return parseAudience(b.audience_size) - parseAudience(a.audience_size);

        case "audience-asc":
          return parseAudience(a.audience_size) - parseAudience(b.audience_size);

        case "name-asc":
          return a.podcast_name.localeCompare(b.podcast_name);

        default:
          return 0;
      }
    });

    return filtered;
  }, [podcasts, searchQuery, selectedCategory, selectedAudienceTier, selectedPriceRange, sortBy]);

  // Clear all filters
  const clearFilters = () => {
    setSearchQuery("");
    setSelectedCategory(null);
    setSelectedAudienceTier("all");
    setSelectedPriceRange("all");
    setSortBy("featured");
  };

  // Check if any filters are active
  const hasActiveFilters = searchQuery || selectedCategory || selectedAudienceTier !== "all" || selectedPriceRange !== "all" || sortBy !== "featured";
  const featuredCount = useMemo(() => podcasts.filter((podcast) => podcast.is_featured).length, [podcasts]);

  return (
    <main className="homepage-shell min-h-screen bg-transparent text-[#0d1b2a]">
      <PageSEO
        title="Premium Podcast Placements | Get On A Pod"
        description="Browse pre-vetted premium podcast placements and book guaranteed podcast appearances on specific shows."
        path="/premium-placements"
      />
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-[60] focus:rounded-full focus:bg-[#0d1b2a] focus:px-4 focus:py-2 focus:text-sm focus:text-[#f7fafc]"
      >
        Skip to content
      </a>
      <Navbar />

      <div id="main-content" className="relative">
        <section className="paper-noise relative overflow-hidden px-4 pb-14 pt-32 md:pb-20 md:pt-40">
          <div className="absolute left-0 top-28 h-[280px] w-[280px] rounded-full bg-[#2d6df6]/10 blur-3xl sm:h-[420px] sm:w-[420px]" />
          <div className="absolute right-0 top-16 h-[240px] w-[240px] rounded-full bg-[#dce7f5]/50 blur-3xl sm:top-20 sm:h-[420px] sm:w-[420px]" />

          <div className="container relative mx-auto">
            <div className="grid gap-12 lg:grid-cols-[1.02fr_0.98fr] lg:items-start lg:gap-16">
              <div className="max-w-3xl">
                <div className="animate-fade-up flex flex-wrap items-center gap-3">
                  <p className="section-kicker">Premium placements</p>
                  <span className="rounded-full border border-[#0d1b2a]/10 bg-[#f3f7fc] px-4 py-2 font-mono text-[10px] uppercase tracking-[0.22em] text-[#5d7188]">
                    For buyers who want exact-show access
                  </span>
                </div>

                <h1 className="animate-fade-up animation-delay-100 mt-5 font-editorial text-[clamp(3.25rem,7vw,6.4rem)] leading-[0.9] tracking-[-0.05em] text-[#0d1b2a] text-balance">
                  Pick the exact shows. Buy the placement with confidence.
                </h1>

                <p className="animate-fade-up animation-delay-200 mt-6 max-w-2xl text-lg leading-8 text-[#4c5d73] md:text-xl">
                  Premium Placements give you access to a private menu of pre-vetted podcasts where the slot is guaranteed once purchased.
                  This is the fast path for buyers who care about specific shows, not just general outreach volume.
                </p>

                <div className="animate-fade-up animation-delay-300 mt-8 flex flex-col gap-3 sm:flex-row">
                  <Button variant="hero" size="xl" className="min-h-[56px] rounded-full px-8 text-base" asChild>
                    <a href="#placements">Browse Available Shows</a>
                  </Button>
                  <Button variant="heroOutline" size="xl" className="min-h-[56px] rounded-full px-8 text-base" asChild>
                    <a href="https://calendly.com/getonapodjg/30min" target="_blank" rel="noopener noreferrer">
                      Talk Through My Options
                    </a>
                  </Button>
                </div>

                <p className="animate-fade-up animation-delay-400 mt-4 text-sm leading-6 text-[#5f7590]">
                  Use this when earned outreach is too slow or you already know the rooms you want to be in.
                </p>

                <div className="animate-fade-up animation-delay-400 mt-8 max-w-2xl rounded-[28px] border border-[#0d1b2a]/8 bg-[#ffffff]/72 p-4 shadow-[0_20px_40px_rgba(13,27,42,0.08)] backdrop-blur-sm">
                  <div className="grid gap-3 sm:grid-cols-3">
                    {HERO_SIGNALS.map((signal, index) => (
                      <div
                        key={signal}
                        className="flex items-start gap-3 rounded-[20px] border border-[#0d1b2a]/8 bg-[#f5f8fc] px-4 py-3 text-sm font-medium text-[#30465f]"
                      >
                        <span className="font-mono text-xs text-[#2d6df6]">0{index + 1}</span>
                        <span>{signal}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              <div className="animate-fade-up animation-delay-300 lg:pt-4">
                <div className="overflow-hidden rounded-[34px] border border-[#0d1b2a]/10 bg-[#081a2b] p-4 text-[#f7fafc] shadow-[0_32px_80px_rgba(13,27,42,0.22)] sm:p-5">
                  <div className="rounded-[24px] border border-[#8cb0dd]/18 bg-[#10263b] px-4 py-4">
                    <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                      <div>
                        <p className="section-kicker text-[#8cb0dd]">How it differs</p>
                        <p className="mt-2 font-display text-2xl font-semibold tracking-[-0.05em] text-[#f7fafc]">
                          This is a show-by-show buying experience, not a broad outreach campaign.
                        </p>
                      </div>
                      <div className="self-start rounded-full border border-[#8cb0dd]/25 bg-[#8cb0dd]/10 px-3 py-1 text-xs uppercase tracking-[0.22em] text-[#dce9f7]">
                        Private menu
                      </div>
                    </div>
                  </div>

                  <div className="mt-4 grid gap-4 sm:grid-cols-3">
                    <div className="rounded-[24px] border border-white/10 bg-white/5 p-4">
                      <p className="section-kicker text-[#8cb0dd]">Available now</p>
                      <p className="mt-3 font-display text-4xl font-semibold tracking-[-0.05em]">
                        {isLoading ? '...' : podcasts.length}
                      </p>
                      <p className="mt-2 text-sm leading-6 text-[#c7d9ee]">
                        Pre-vetted shows currently listed in the premium menu.
                      </p>
                    </div>
                    <div className="rounded-[24px] border border-white/10 bg-white/5 p-4">
                      <p className="section-kicker text-[#8cb0dd]">Featured</p>
                      <p className="mt-3 font-display text-4xl font-semibold tracking-[-0.05em]">
                        {isLoading ? '...' : featuredCount}
                      </p>
                      <p className="mt-2 text-sm leading-6 text-[#c7d9ee]">
                        Priority opportunities highlighted from the current menu.
                      </p>
                    </div>
                    <div className="rounded-[24px] border border-white/10 bg-white/5 p-4">
                      <p className="section-kicker text-[#8cb0dd]">Buying model</p>
                      <p className="mt-3 font-display text-2xl font-semibold tracking-[-0.05em]">
                        One-time
                      </p>
                      <p className="mt-2 text-sm leading-6 text-[#c7d9ee]">
                        Purchase only the placements you want instead of committing to a retainer.
                      </p>
                    </div>
                  </div>

                  <div className="mt-4 rounded-[24px] border border-white/10 bg-white/5 p-5">
                    <div className="grid gap-3">
                      {DIFFERENCE_POINTS.map((point, index) => (
                        <div key={point} className="flex items-start gap-3 rounded-2xl border border-white/10 bg-[#132a44] px-4 py-3">
                          <span className="font-mono text-xs text-[#8cb0dd]">0{index + 1}</span>
                          <span className="text-sm leading-6 text-[#d6e5f5]">{point}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>

        <section id="placements" className="px-4 pb-8 md:pb-10">
          <div className="container mx-auto">
            <div className="rounded-[32px] border border-[#0d1b2a]/8 bg-[#ffffff]/82 p-5 shadow-[0_20px_42px_rgba(13,27,42,0.08)] backdrop-blur-sm md:p-6">
              <div className="mb-6 flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
                <div className="max-w-2xl">
                  <p className="section-kicker">Available shows</p>
                  <h2 className="mt-3 font-display text-3xl font-semibold tracking-[-0.05em] text-[#0d1b2a] sm:text-4xl md:text-5xl">
                    Browse the current premium placements menu.
                  </h2>
                  <p className="mt-4 text-base leading-8 text-[#4c5d73] sm:text-lg">
                    Filter by category, audience, or price and add the shows you want to your cart. Every listing here is a direct premium placement opportunity.
                  </p>
                </div>
                <div className="rounded-[24px] border border-[#0d1b2a]/8 bg-[#f4f8fc] px-4 py-4 text-sm text-[#30465f]">
                  Showing <span className="font-semibold text-[#0d1b2a]">{filteredAndSortedPodcasts.length}</span> of{' '}
                  <span className="font-semibold text-[#0d1b2a]">{podcasts.length}</span> available shows
                </div>
              </div>

              <div className="space-y-3 md:space-y-4">
                <div className="flex flex-col gap-3 md:flex-row md:gap-4">
                  <div className="relative flex-1">
                    <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 transform text-[#5d7188]" />
                    <Input
                      placeholder="Search by show name, category, or fit..."
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      className="min-h-[48px] border-[#0d1b2a]/10 bg-[#f8fbff] pl-10 pr-10 text-[#0d1b2a] placeholder:text-[#7b8da3]"
                    />
                    {searchQuery && (
                      <button
                        onClick={() => setSearchQuery("")}
                        className="absolute right-3 top-1/2 p-2 -translate-y-1/2 transform"
                      >
                        <X className="h-4 w-4 text-[#5d7188] hover:text-[#0d1b2a]" />
                      </button>
                    )}
                  </div>

                  <Select value={sortBy} onValueChange={setSortBy}>
                    <SelectTrigger className="w-full min-h-[48px] border-[#0d1b2a]/10 bg-[#f8fbff] text-[#0d1b2a] md:w-[220px]">
                      <SelectValue placeholder="Sort by" />
                    </SelectTrigger>
                    <SelectContent>
                      {SORT_OPTIONS.map((option) => (
                        <SelectItem key={option.value} value={option.value}>
                          {option.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>

                  <Sheet>
                    <SheetTrigger asChild>
                      <Button variant="heroOutline" className="min-h-[48px] md:hidden">
                        <SlidersHorizontal className="mr-2 h-4 w-4" />
                        Filters
                        {hasActiveFilters && (
                          <Badge className="ml-2 rounded-full bg-[#0d1b2a] px-2 text-[#f7fafc]">
                            {[searchQuery, selectedCategory, selectedAudienceTier !== "all", selectedPriceRange !== "all"].filter(Boolean).length}
                          </Badge>
                        )}
                      </Button>
                    </SheetTrigger>
                    <SheetContent side="right" className="w-[300px] overflow-y-auto border-l border-[#0d1b2a]/10 bg-[#f8fbff]">
                      <SheetHeader>
                        <SheetTitle className="text-[#0d1b2a]">Filters</SheetTitle>
                        <SheetDescription>
                          Refine the premium placements menu
                        </SheetDescription>
                      </SheetHeader>
                      <div className="mt-6 space-y-6">
                        <div>
                          <label className="mb-2 block text-sm font-medium text-[#30465f]">Category</label>
                          <Select value={selectedCategory || "all"} onValueChange={(value) => setSelectedCategory(value === "all" ? null : value)}>
                            <SelectTrigger className="min-h-[48px] border-[#0d1b2a]/10 bg-white">
                              <SelectValue placeholder="All Categories" />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="all">All Categories</SelectItem>
                              {PODCAST_CATEGORIES.map((category) => (
                                <SelectItem key={category} value={category}>
                                  {category}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>

                        <div>
                          <label className="mb-2 block text-sm font-medium text-[#30465f]">Audience Size</label>
                          <Select value={selectedAudienceTier} onValueChange={setSelectedAudienceTier}>
                            <SelectTrigger className="min-h-[48px] border-[#0d1b2a]/10 bg-white">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              {AUDIENCE_TIERS.map((tier) => (
                                <SelectItem key={tier.value} value={tier.value}>
                                  {tier.label}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>

                        <div>
                          <label className="mb-2 block text-sm font-medium text-[#30465f]">Price Range</label>
                          <Select value={selectedPriceRange} onValueChange={setSelectedPriceRange}>
                            <SelectTrigger className="min-h-[48px] border-[#0d1b2a]/10 bg-white">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              {PRICE_RANGES.map((range) => (
                                <SelectItem key={range.value} value={range.value}>
                                  {range.label}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>

                        {hasActiveFilters && (
                          <Button onClick={clearFilters} variant="heroOutline" className="w-full min-h-[48px]">
                            <X className="mr-2 h-4 w-4" />
                            Clear Filters
                          </Button>
                        )}
                      </div>
                    </SheetContent>
                  </Sheet>
                </div>

                <div className="hidden items-center gap-3 md:flex">
                  <span className="whitespace-nowrap text-sm text-[#5d7188]">Category:</span>
                  <div className="flex flex-wrap items-center gap-2">
                    <Button
                      variant={selectedCategory === null ? "hero" : "heroOutline"}
                      size="sm"
                      onClick={() => setSelectedCategory(null)}
                      className="h-8 rounded-full px-4 text-xs"
                    >
                      All
                    </Button>
                    {PODCAST_CATEGORIES.map((category) => (
                      <Button
                        key={category}
                        variant={selectedCategory === category ? "hero" : "heroOutline"}
                        size="sm"
                        onClick={() => setSelectedCategory(category)}
                        className="h-8 whitespace-nowrap rounded-full px-4 text-xs"
                      >
                        {category}
                      </Button>
                    ))}
                  </div>
                </div>

                <div className="hidden items-center gap-4 md:flex">
                  <div className="flex items-center gap-2">
                    <span className="whitespace-nowrap text-sm text-[#5d7188]">Audience:</span>
                    <Select value={selectedAudienceTier} onValueChange={setSelectedAudienceTier}>
                      <SelectTrigger className="h-9 w-[180px] border-[#0d1b2a]/10 bg-[#f8fbff]">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {AUDIENCE_TIERS.map((tier) => (
                          <SelectItem key={tier.value} value={tier.value}>
                            {tier.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="flex items-center gap-2">
                    <span className="whitespace-nowrap text-sm text-[#5d7188]">Price:</span>
                    <Select value={selectedPriceRange} onValueChange={setSelectedPriceRange}>
                      <SelectTrigger className="h-9 w-[180px] border-[#0d1b2a]/10 bg-[#f8fbff]">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {PRICE_RANGES.map((range) => (
                          <SelectItem key={range.value} value={range.value}>
                            {range.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  {hasActiveFilters && (
                    <Button onClick={clearFilters} variant="ghost" size="sm" className="h-9 text-[#2d6df6] hover:bg-[#eef4ff] hover:text-[#2d6df6]">
                      <X className="mr-2 h-4 w-4" />
                      Clear All
                    </Button>
                  )}
                </div>
              </div>
            </div>
          </div>
        </section>

        <section className="px-4 pb-16 pt-2 md:pb-28">
          <div className="container mx-auto">
            <div
              ref={ref}
              className={`transition-all duration-700 ${
                isVisible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-8'
              }`}
            >
              {isLoading ? (
                <div className="grid grid-cols-1 gap-5 md:grid-cols-2 xl:grid-cols-3">
                  {Array.from({ length: 6 }).map((_, i) => (
                    <div
                      key={i}
                      className="overflow-hidden rounded-[28px] border border-[#0d1b2a]/8 bg-[#ffffff]/88 shadow-[0_16px_34px_rgba(13,27,42,0.08)]"
                    >
                      <Skeleton className="h-40 w-full rounded-none bg-[#dfeafb]" />

                      <div className="p-5 md:p-6">
                        <div className="mb-4 flex min-h-[3rem] items-center md:h-16">
                          <Skeleton className="h-8 w-3/4 bg-[#eef4ff]" />
                        </div>

                        <div className="mb-4 grid grid-cols-2 gap-3">
                          {Array.from({ length: 4 }).map((_, j) => (
                            <div key={j} className="rounded-[18px] border border-[#0d1b2a]/8 bg-[#f5f8fc] p-3">
                              <div className="space-y-1">
                                <Skeleton className="h-3 w-12 bg-[#dfeafb]" />
                                <Skeleton className="h-4 w-16 bg-[#dfeafb]" />
                              </div>
                            </div>
                          ))}
                        </div>

                        <div className="mb-4 rounded-[20px] border border-[#2d6df6]/12 bg-[#eef4ff] p-3">
                          <div className="mb-2 flex items-center gap-2">
                            <Skeleton className="h-4 w-4 rounded-full bg-[#b8ccff]" />
                            <Skeleton className="h-3 w-24 bg-[#b8ccff]" />
                          </div>
                          <Skeleton className="mb-1 h-4 w-full bg-[#dce7f5]" />
                          <Skeleton className="h-4 w-2/3 bg-[#dce7f5]" />
                        </div>

                        <div className="mb-4 md:mb-6">
                          <Skeleton className="h-4 w-32 bg-[#dfeafb]" />
                        </div>

                        <div className="border-t border-[#0d1b2a]/8 pt-5">
                          <div className="mb-3 md:mb-4">
                            <Skeleton className="mb-2 h-3 w-16 bg-[#dfeafb]" />
                            <Skeleton className="mb-1 h-10 w-28 bg-[#dfeafb]" />
                            <Skeleton className="h-3 w-24 bg-[#dfeafb]" />
                          </div>
                          <Skeleton className="h-12 w-full rounded-full bg-[#dfeafb]" />
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              ) : filteredAndSortedPodcasts.length === 0 ? (
                <div className="rounded-[32px] border border-[#0d1b2a]/8 bg-[#ffffff]/82 px-6 py-16 text-center shadow-[0_20px_42px_rgba(13,27,42,0.08)]">
                  <Filter className="mx-auto mb-4 h-16 w-16 text-[#8cb0dd]" />
                  <h3 className="mb-2 font-display text-3xl font-semibold tracking-[-0.04em] text-[#0d1b2a]">No podcasts found</h3>
                  <p className="mb-4 text-[#5d7188]">
                    Try adjusting your filters or search query
                  </p>
                  {hasActiveFilters && (
                    <Button onClick={clearFilters} variant="heroOutline">
                      <X className="mr-2 h-4 w-4" />
                      Clear All Filters
                    </Button>
                  )}
                </div>
              ) : (
                <div className="grid grid-cols-1 gap-5 md:grid-cols-2 xl:grid-cols-3">
                  {filteredAndSortedPodcasts.map((podcast, index) => (
                    <div
                      key={podcast.id}
                      className="group relative flex h-full flex-col overflow-hidden rounded-[28px] border border-[#0d1b2a]/8 bg-[#ffffff]/88 shadow-[0_16px_34px_rgba(13,27,42,0.08)] transition-all duration-300 hover:-translate-y-1 hover:border-[#2d6df6]/20 hover:shadow-[0_22px_40px_rgba(13,27,42,0.12)]"
                      style={{ transitionDelay: `${index * 100}ms` }}
                    >
                      <div className="absolute right-4 top-4 z-10 flex flex-col gap-2">
                        {podcast.is_featured && (
                          <Badge className="border border-[#2d6df6]/18 bg-[#eef4ff] text-[#2d6df6]">
                            Featured
                          </Badge>
                        )}
                      </div>

                      <div className="relative h-40 overflow-hidden bg-gradient-to-br from-[#dfeafb] via-[#eef4ff] to-[#edf3fa] md:h-48">
                        {podcast.podcast_image_url ? (
                          <img
                            src={podcast.podcast_image_url}
                            alt={podcast.podcast_name}
                            className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105"
                          />
                        ) : (
                          <div className="flex h-full w-full items-center justify-center">
                            <Mic className="h-12 w-12 text-[#5d7188] md:h-16 md:w-16" />
                          </div>
                        )}
                        {podcast.category && (
                          <div className="absolute left-4 top-4 rounded-full border border-white/60 bg-white/85 px-3 py-1 font-mono text-[10px] uppercase tracking-[0.2em] text-[#56708d] backdrop-blur">
                            {podcast.category}
                          </div>
                        )}
                        <div className="absolute inset-0 bg-gradient-to-t from-white/65 via-transparent to-transparent" />
                      </div>

                      <div className="flex flex-1 flex-col p-5 md:p-6">
                        <div className="mb-4 flex min-h-[3rem] items-center md:h-16">
                          <h3 className="line-clamp-2 font-display text-2xl font-semibold leading-tight tracking-[-0.04em] text-[#0d1b2a]">
                            {podcast.podcast_name}
                          </h3>
                        </div>

                        <div className="mb-4 grid grid-cols-2 gap-3">
                          {podcast.audience_size && (
                            <div className="rounded-[18px] border border-[#0d1b2a]/8 bg-[#f5f8fc] p-3 text-sm">
                              <div className="mb-2 flex items-center gap-2">
                                <Users className="h-4 w-4 text-[#2d6df6]" />
                                <p className="text-xs uppercase tracking-[0.18em] text-[#5d7188]">Audience</p>
                              </div>
                              <p className="font-semibold text-[#0d1b2a]">{podcast.audience_size}</p>
                            </div>
                          )}
                          {podcast.episode_count && (
                            <div className="rounded-[18px] border border-[#0d1b2a]/8 bg-[#f5f8fc] p-3 text-sm">
                              <div className="mb-2 flex items-center gap-2">
                                <BarChart3 className="h-4 w-4 text-[#2d6df6]" />
                                <p className="text-xs uppercase tracking-[0.18em] text-[#5d7188]">Episodes</p>
                              </div>
                              <p className="font-semibold text-[#0d1b2a]">{podcast.episode_count}</p>
                            </div>
                          )}
                          {podcast.rating && (
                            <div className="rounded-[18px] border border-[#0d1b2a]/8 bg-[#f5f8fc] p-3 text-sm">
                              <div className="mb-2 flex items-center gap-2">
                                <Star className="h-4 w-4 text-[#2d6df6]" />
                                <p className="text-xs uppercase tracking-[0.18em] text-[#5d7188]">Rating</p>
                              </div>
                              <p className="font-semibold text-[#0d1b2a]">{podcast.rating}</p>
                            </div>
                          )}
                          {podcast.reach_score && (
                            <div className="rounded-[18px] border border-[#0d1b2a]/8 bg-[#f5f8fc] p-3 text-sm">
                              <div className="mb-2 flex items-center gap-2">
                                <TrendingUp className="h-4 w-4 text-[#2d6df6]" />
                                <p className="text-xs uppercase tracking-[0.18em] text-[#5d7188]">Reach score</p>
                              </div>
                              <p className="font-semibold text-[#0d1b2a]">{podcast.reach_score}</p>
                            </div>
                          )}
                        </div>

                        {podcast.why_this_show && (
                          <div className="mb-4 rounded-[20px] border border-[#2d6df6]/12 bg-[#eef4ff] p-4">
                            <div className="mb-2 flex items-center gap-2">
                              <Award className="h-4 w-4 text-[#2d6df6]" />
                              <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-[#56708d]">
                                Why this show
                              </p>
                            </div>
                            <div className="text-sm leading-7 text-[#30465f]">
                              <p>{getPreviewText(podcast.why_this_show)}</p>
                              {needsReadMore(podcast.why_this_show) && (
                                <button
                                  onClick={() => setModalPodcast(podcast)}
                                  className="mt-2 font-medium text-[#2d6df6] transition-colors hover:text-[#204fad]"
                                >
                                  Read the full rationale
                                </button>
                              )}
                            </div>
                          </div>
                        )}

                        {podcast.whats_included && podcast.whats_included.length > 0 && (
                          <div className="mb-5 border-t border-[#0d1b2a]/8 pt-4">
                            <button
                              onClick={() => toggleFeatures(podcast.id)}
                              className="flex min-h-[44px] w-full items-center justify-between gap-3 py-2 text-left text-xs font-semibold uppercase tracking-[0.22em] text-[#56708d] transition-colors hover:text-[#0d1b2a]"
                            >
                              <span>What's included</span>
                              {expandedCards.has(podcast.id) ? (
                                <ChevronUp className="h-5 w-5" />
                              ) : (
                                <ChevronDown className="h-5 w-5" />
                              )}
                            </button>
                            {expandedCards.has(podcast.id) && (
                              <div className="mt-3 space-y-3 animate-in fade-in slide-in-from-top-2 duration-200">
                                {podcast.whats_included.map((feature, idx) => (
                                  <div key={idx} className="flex items-start gap-3 text-sm leading-6 text-[#30465f]">
                                    <CheckCircle2 className="mt-0.5 h-4 w-4 flex-shrink-0 text-[#2d6df6]" />
                                    {feature}
                                  </div>
                                ))}
                              </div>
                            )}
                          </div>
                        )}

                        <div className="mt-auto border-t border-[#0d1b2a]/8 pt-5">
                          <div className="mb-4">
                            <p className="font-mono text-[11px] uppercase tracking-[0.22em] text-[#56708d]">Investment</p>
                            <p className="mt-2 font-display text-5xl font-semibold tracking-[-0.06em] text-[#0d1b2a]">{podcast.price}</p>
                            <p className="mt-1 text-sm text-[#5d7188]">One-time placement</p>
                          </div>
                          {isInCart(podcast.id) ? (
                            <Button
                              className="w-full rounded-full border border-[#2d6df6]/16 bg-[#eef4ff] text-[#2d6df6] hover:bg-[#eef4ff]"
                              size="lg"
                              disabled
                            >
                              <CheckCircle2 className="mr-2 h-5 w-5" />
                              Added to Cart
                            </Button>
                          ) : (
                            <Button
                              variant="hero"
                              className="w-full rounded-full"
                              size="lg"
                              onClick={() => handleAddToCart(podcast)}
                            >
                              <ShoppingCart className="mr-2 h-5 w-5" />
                              Add Placement to Cart
                            </Button>
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

        <section className="bg-transparent px-4 py-12 md:py-20">
          <div className="container mx-auto">
            <div className="grid gap-8 lg:grid-cols-[0.76fr_1.24fr] lg:items-start">
              <div className="lg:sticky lg:top-36">
                <p className="section-kicker">Questions</p>
                <h2 className="mt-4 font-editorial text-4xl leading-[0.95] tracking-[-0.05em] text-[#0d1b2a] sm:text-5xl md:text-6xl">
                  What buyers usually want to know first.
                </h2>
                <p className="mt-5 max-w-lg text-base leading-8 text-[#4c5d73] sm:text-lg">
                  Premium Placements are a different buying motion than a retainer, so the questions are different too.
                </p>

                <div className="mt-8 rounded-[30px] border border-[#0d1b2a]/8 bg-[#f4f8fc]/92 p-6 shadow-[0_18px_36px_rgba(13,27,42,0.08)]">
                  <p className="section-kicker">Need help choosing?</p>
                  <p className="mt-3 text-base leading-7 text-[#30465f]">
                    If you are unsure whether to buy a placement or run earned outreach, we can pressure-test the right option with you first.
                  </p>
                  <Button variant="hero" size="lg" className="mt-6 rounded-full px-7" asChild>
                    <a href="https://calendly.com/getonapodjg/30min" target="_blank" rel="noopener noreferrer">
                      Talk Through My Options
                    </a>
                  </Button>
                </div>
              </div>

              <div className="grid gap-5 md:grid-cols-2">
                {FAQ_ITEMS.map((item) => (
                  <article
                    key={item.question}
                    className="rounded-[30px] border border-[#0d1b2a]/8 bg-[#ffffff]/82 p-6 shadow-[0_16px_34px_rgba(13,27,42,0.08)] backdrop-blur-sm"
                  >
                    <h3 className="font-display text-2xl font-semibold tracking-[-0.04em] text-[#0d1b2a]">
                      {item.question}
                    </h3>
                    <p className="mt-3 text-sm leading-7 text-[#4c5d73] sm:text-base">
                      {item.answer}
                    </p>
                  </article>
                ))}
              </div>
            </div>
          </div>
        </section>

        <section className="bg-[#0b2036] px-4 py-12 text-[#f7fafc] md:py-20">
          <div className="container mx-auto">
            <div className="mx-auto overflow-hidden rounded-[38px] border border-white/10 bg-[radial-gradient(circle_at_top_left,_rgba(45,109,246,0.28),_transparent_38%),radial-gradient(circle_at_bottom_right,_rgba(140,176,221,0.18),_transparent_34%),#10263b]">
              <div className="grid gap-8 px-6 py-10 md:px-10 md:py-14 lg:grid-cols-[1.06fr_0.94fr] lg:gap-12">
                <div className="max-w-2xl">
                  <p className="section-kicker text-[#8cb0dd]">Next step</p>
                  <h2 className="mt-4 font-editorial text-4xl leading-[0.92] tracking-[-0.05em] sm:text-5xl md:text-6xl">
                    Want help choosing the right premium placements?
                  </h2>

                  <p className="mt-5 max-w-xl text-sm leading-8 text-[#d6e5f5] sm:text-base md:text-lg lg:text-xl">
                    Book a call and we will help you decide which shows fit your message, audience, and budget before you check out.
                  </p>

                  <div className="mt-8 flex flex-col gap-3 sm:flex-row">
                    <Button
                      variant="heroOutline"
                      size="xl"
                      className="min-h-[48px] w-full rounded-full bg-[#f7fafc] text-sm text-[#0d1b2a] sm:min-h-[56px] sm:w-auto sm:text-base"
                      asChild
                    >
                      <a href="https://calendly.com/getonapodjg/30min" target="_blank" rel="noopener noreferrer">
                        Book My Premium Call
                      </a>
                    </Button>
                    <Button
                      variant="ghost"
                      size="xl"
                      className="min-h-[48px] w-full rounded-full border border-white/12 text-sm text-[#f7fafc] hover:bg-white/10 hover:text-[#f7fafc] sm:min-h-[56px] sm:w-auto sm:text-base"
                      asChild
                    >
                      <a href="#placements">Browse the Menu</a>
                    </Button>
                  </div>

                  <p className="mt-5 text-sm text-[#c7d9ee]">
                    If earned outreach is a better fit than paid placements, we will tell you directly.
                  </p>
                </div>

                <div className="rounded-[32px] border border-white/10 bg-white/5 p-6 backdrop-blur-sm">
                  <p className="section-kicker text-[#8cb0dd]">What happens on the call</p>
                  <div className="mt-5 space-y-4">
                    {CTA_STEPS.map((step, index) => (
                      <div
                        key={step}
                        className="flex items-start gap-4 rounded-[24px] border border-white/10 bg-white/5 px-4 py-4"
                      >
                        <span className="font-mono text-xs text-[#8cb0dd]">0{index + 1}</span>
                        <p className="text-sm leading-7 text-[#d6e5f5]">{step}</p>
                      </div>
                    ))}
                  </div>

                  <div className="mt-5 rounded-[24px] border border-[#f7fafc]/10 bg-[#0b2036] px-4 py-4">
                    <p className="font-mono text-[11px] uppercase tracking-[0.24em] text-[#8cb0dd]">Clarity first</p>
                    <p className="mt-2 text-sm leading-7 text-[#d6e5f5]">
                      The goal is to help you buy the right placements, not push the wrong ones.
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>

        <Footer />
      </div>

      <SocialProofNotifications />
      <CartButton />
      <CartDrawer />

      <Dialog open={!!modalPodcast} onOpenChange={(open) => !open && setModalPodcast(null)}>
        <DialogContent className="mx-4 max-h-[80vh] max-w-2xl overflow-y-auto rounded-[28px] border border-[#0d1b2a]/10 bg-[#f8fbff] sm:mx-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-xl font-semibold md:text-2xl">
              <Award className="h-5 w-5 flex-shrink-0 text-[#2d6df6] md:h-6 md:w-6" />
              <span className="line-clamp-2">Why {modalPodcast?.podcast_name}?</span>
            </DialogTitle>
          </DialogHeader>
          <DialogDescription className="pt-4 text-sm leading-relaxed text-[#30465f] md:text-base">
            {modalPodcast?.why_this_show}
          </DialogDescription>
        </DialogContent>
      </Dialog>
    </main>
  );
};

export default PremiumPlacements;
