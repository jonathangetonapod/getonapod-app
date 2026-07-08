import { useState } from 'react'
import DOMPurify from 'dompurify'
import { Helmet } from 'react-helmet-async'
import { useQuery } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import Navbar from '@/components/Navbar'
import Footer from '@/components/Footer'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import {
  ArrowRight,
  BookOpen,
  Download,
  ExternalLink,
  FileText,
  Loader2,
  Mic,
  Search,
  Sparkles,
  Star,
  TrendingUp,
  Video,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { getGuestResources, type GuestResource, type ResourceCategory } from '@/services/guestResources'

const categoryInfo: Record<
  ResourceCategory,
  {
    label: string
    icon: typeof BookOpen
    tone: string
  }
> = {
  preparation: {
    label: 'Preparation',
    icon: BookOpen,
    tone: 'border-[#bfd3f4] bg-[#eef4ff] text-[#2d6df6]',
  },
  technical_setup: {
    label: 'Technical setup',
    icon: Mic,
    tone: 'border-[#d6c7ee] bg-[#f6efff] text-[#7a4bc2]',
  },
  best_practices: {
    label: 'Best practices',
    icon: Star,
    tone: 'border-[#c7e8d5] bg-[#eefaf2] text-[#27925a]',
  },
  promotion: {
    label: 'Promotion',
    icon: TrendingUp,
    tone: 'border-[#f1d6b2] bg-[#fff6eb] text-[#c87a26]',
  },
  examples: {
    label: 'Examples',
    icon: Video,
    tone: 'border-[#f0c7d8] bg-[#fff1f7] text-[#c44b78]',
  },
  templates: {
    label: 'Templates',
    icon: FileText,
    tone: 'border-[#d6dff2] bg-[#f4f8fc] text-[#56708d]',
  },
}

const typeInfo = {
  article: { label: 'Article', icon: FileText },
  video: { label: 'Video', icon: Video },
  download: { label: 'Download', icon: Download },
  link: { label: 'External link', icon: ExternalLink },
}

function getResourceActionLabel(resource: GuestResource) {
  if (resource.type === 'article' && resource.content) return 'Read resource'
  if (resource.type === 'download' && resource.file_url) return 'Download file'
  if (resource.type === 'video' && resource.url) return 'Watch video'
  if (resource.url) return 'Open link'
  if (resource.file_url) return 'Download file'
  return 'Unavailable'
}

function sanitizeContent(content: string) {
  return DOMPurify.sanitize(
    content
      .replace(/â€"/g, '-')
      .replace(/â€™/g, "'")
      .replace(/â€˜/g, "'")
      .replace(/â€œ/g, '"')
      .replace(/â€/g, '"')
      .replace(/â€¦/g, '...')
      .replace(/â€¢/g, '-')
  )
}

export default function Resources() {
  const [searchQuery, setSearchQuery] = useState('')
  const [activeCategory, setActiveCategory] = useState<'all' | ResourceCategory>('all')
  const [viewingResource, setViewingResource] = useState<GuestResource | null>(null)

  const { data: resources = [], isLoading } = useQuery({
    queryKey: ['public-guest-resources'],
    queryFn: () => getGuestResources(),
  })

  const filteredResources = resources.filter((resource) => {
    const matchesSearch =
      resource.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
      resource.description.toLowerCase().includes(searchQuery.toLowerCase())

    const matchesCategory = activeCategory === 'all' || resource.category === activeCategory

    return matchesSearch && matchesCategory
  })

  const featuredResources = filteredResources.filter((resource) => resource.featured)
  const regularResources = filteredResources.filter((resource) => !resource.featured)
  const categoryCount = new Set(resources.map((resource) => resource.category)).size
  const lastUpdated =
    resources.length > 0
      ? new Date(
          Math.max(...resources.map((resource) => new Date(resource.updated_at).getTime()))
        ).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
      : 'Building now'

  const openResource = (resource: GuestResource) => {
    if (resource.type === 'article' && resource.content) {
      setViewingResource(resource)
      return
    }

    if (resource.type === 'download' && resource.file_url) {
      window.open(resource.file_url, '_blank')
      return
    }

    if (resource.url) {
      window.open(resource.url, '_blank')
      return
    }

    if (resource.file_url) {
      window.open(resource.file_url, '_blank')
    }
  }

  const renderResourceCard = (resource: GuestResource, featured = false) => {
    const CategoryIcon = categoryInfo[resource.category].icon
    const TypeIcon = typeInfo[resource.type].icon
    const actionLabel = getResourceActionLabel(resource)
    const isActionable = actionLabel !== 'Unavailable'

    return (
      <article
        key={resource.id}
        className={cn(
          'group flex h-full flex-col rounded-[28px] border border-[#0d1b2a]/8 bg-white/90 p-6 shadow-[0_16px_34px_rgba(13,27,42,0.08)] transition-all duration-300',
          featured && 'lg:p-7',
          isActionable && 'hover:-translate-y-1 hover:border-[#2d6df6]/18 hover:shadow-[0_22px_44px_rgba(13,27,42,0.12)]'
        )}
      >
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <Badge
                variant="outline"
                className={cn(
                  'rounded-full border px-3 py-1 text-[11px] font-medium tracking-[0.18em] uppercase',
                  categoryInfo[resource.category].tone
                )}
              >
                <CategoryIcon className="mr-1.5 h-3 w-3" />
                {categoryInfo[resource.category].label}
              </Badge>
              <Badge variant="outline" className="rounded-full border-[#0d1b2a]/10 bg-[#f8fbff] text-[#56708d]">
                {typeInfo[resource.type].label}
              </Badge>
              {resource.featured && (
                <Badge variant="outline" className="rounded-full border-[#f0d7aa] bg-[#fff7ea] text-[#b7791f]">
                  Featured
                </Badge>
              )}
            </div>

            <h3 className={cn('mt-4 font-display font-semibold tracking-[-0.04em] text-[#0d1b2a]', featured ? 'text-3xl' : 'text-2xl')}>
              {resource.title}
            </h3>
          </div>

          <div className="flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-[16px] border border-[#0d1b2a]/8 bg-[#f8fbff] text-[#2d6df6]">
            <TypeIcon className="h-5 w-5" />
          </div>
        </div>

        <p className={cn('mt-4 flex-1 text-[#4c5d73]', featured ? 'text-base leading-8' : 'text-sm leading-7')}>
          {resource.description}
        </p>

        <div className="mt-6 flex items-center justify-between gap-3 border-t border-[#0d1b2a]/8 pt-4">
          <p className="text-sm text-[#5d7188]">
            Updated {new Date(resource.updated_at).toLocaleDateString('en-US', {
              month: 'short',
              day: 'numeric',
              year: 'numeric',
            })}
          </p>

          <Button
            variant={featured ? 'hero' : 'outline'}
            className={cn(
              'rounded-full',
              !featured && 'border-[#0d1b2a]/10 bg-white text-[#0d1b2a]'
            )}
            disabled={!isActionable}
            onClick={() => openResource(resource)}
          >
            {actionLabel}
            {isActionable && <ArrowRight className="ml-2 h-4 w-4" />}
          </Button>
        </div>
      </article>
    )
  }

  return (
    <main className="homepage-shell min-h-screen bg-transparent text-[#0d1b2a]">
      <Helmet>
        <title>Podcast Guest Resources | Get On A Pod</title>
        <meta
          name="description"
          content="Browse podcast guest resources, templates, examples, and preparation guides from Get On A Pod."
        />
        <link rel="canonical" href="https://getonapod.com/resources" />
        <meta property="og:type" content="website" />
        <meta property="og:url" content="https://getonapod.com/resources" />
        <meta property="og:title" content="Podcast Guest Resources | Get On A Pod" />
        <meta
          property="og:description"
          content="Browse podcast guest resources, templates, examples, and preparation guides from Get On A Pod."
        />
        <meta property="og:image" content="https://getonapod.com/og-image.jpg" />
        <meta property="og:site_name" content="Get On A Pod" />
        <meta name="twitter:card" content="summary_large_image" />
        <meta name="twitter:title" content="Podcast Guest Resources | Get On A Pod" />
        <meta
          name="twitter:description"
          content="Browse podcast guest resources, templates, examples, and preparation guides from Get On A Pod."
        />
        <meta name="twitter:image" content="https://getonapod.com/og-image.jpg" />
      </Helmet>

      <Navbar />

      <section className="paper-noise relative overflow-hidden px-4 pb-12 pt-24 md:pb-16 md:pt-32">
        <div className="absolute left-0 top-16 h-[260px] w-[260px] rounded-full bg-[#2d6df6]/8 blur-3xl sm:h-[380px] sm:w-[380px]" />
        <div className="absolute right-0 top-10 h-[220px] w-[220px] rounded-full bg-[#dce7f5]/70 blur-3xl sm:h-[340px] sm:w-[340px]" />

        <div className="container relative mx-auto">
          <div className="grid gap-8 xl:grid-cols-[1.04fr_0.96fr] xl:items-start xl:gap-12">
            <div className="max-w-3xl">
              <div className="flex flex-wrap items-center gap-3">
                <p className="section-kicker">Resource library</p>
                <span className="rounded-full border border-[#0d1b2a]/10 bg-[#f4f8fc] px-4 py-2 font-mono text-[10px] uppercase tracking-[0.22em] text-[#5d7188]">
                  Free podcast guest tools
                </span>
              </div>

              <h1 className="mt-6 font-editorial text-[clamp(3rem,7vw,6.2rem)] leading-[0.92] tracking-[-0.05em] text-[#0d1b2a] text-balance">
                Resources that make you a better podcast guest.
              </h1>

              <p className="mt-6 max-w-2xl text-lg leading-8 text-[#4c5d73] md:text-xl">
                Browse preparation guides, setup checklists, promotion templates, and examples we use to help founders and operators show up sharper on every interview.
              </p>

              <div className="mt-8 flex flex-col gap-3 sm:flex-row">
                <Button variant="hero" size="xl" className="rounded-full px-8 text-base" asChild>
                  <a href="#resource-library">Browse the library</a>
                </Button>
                <Button variant="heroOutline" size="xl" className="rounded-full px-8 text-base" asChild>
                  <a href="https://calendly.com/getonapodjg/30min" target="_blank" rel="noopener noreferrer">
                    Book My Shortlist Call
                  </a>
                </Button>
              </div>

              <div className="mt-8 grid gap-3 sm:grid-cols-3">
                <div className="rounded-[22px] border border-[#0d1b2a]/8 bg-white/84 px-4 py-4 shadow-[0_16px_34px_rgba(13,27,42,0.08)]">
                  <p className="section-kicker">Resources</p>
                  <p className="mt-2 font-display text-3xl font-semibold tracking-[-0.05em] text-[#0d1b2a]">
                    {resources.length}
                  </p>
                </div>
                <div className="rounded-[22px] border border-[#0d1b2a]/8 bg-white/84 px-4 py-4 shadow-[0_16px_34px_rgba(13,27,42,0.08)]">
                  <p className="section-kicker">Categories</p>
                  <p className="mt-2 font-display text-3xl font-semibold tracking-[-0.05em] text-[#0d1b2a]">
                    {categoryCount}
                  </p>
                </div>
                <div className="rounded-[22px] border border-[#0d1b2a]/8 bg-white/84 px-4 py-4 shadow-[0_16px_34px_rgba(13,27,42,0.08)]">
                  <p className="section-kicker">Last updated</p>
                  <p className="mt-2 text-sm font-medium leading-6 text-[#0d1b2a]">
                    {lastUpdated}
                  </p>
                </div>
              </div>
            </div>

            <div className="rounded-[32px] border border-[#0d1b2a]/8 bg-white/88 p-5 shadow-[0_18px_40px_rgba(13,27,42,0.08)] backdrop-blur-sm sm:p-6">
              <p className="section-kicker">Inside the library</p>
              <h2 className="mt-3 font-display text-2xl font-semibold tracking-[-0.04em] text-[#0d1b2a]">
                Start with what you need right now.
              </h2>

              <div className="mt-5 grid gap-3 sm:grid-cols-2">
                {Object.entries(categoryInfo).map(([key, info]) => {
                  const CategoryIcon = info.icon
                  const count = resources.filter((resource) => resource.category === key).length

                  return (
                    <div
                      key={key}
                      className="rounded-[22px] border border-[#0d1b2a]/8 bg-[#f8fbff] px-4 py-4"
                    >
                      <div className="flex items-center justify-between gap-3">
                        <div className="flex items-center gap-3">
                          <div className={cn('flex h-10 w-10 items-center justify-center rounded-[14px] border', info.tone)}>
                            <CategoryIcon className="h-4 w-4" />
                          </div>
                          <div>
                            <p className="text-sm font-medium text-[#0d1b2a]">{info.label}</p>
                            <p className="text-xs text-[#5d7188]">{count} available</p>
                          </div>
                        </div>
                      </div>
                    </div>
                  )
                })}
              </div>

              <div className="mt-5 rounded-[24px] border border-[#0d1b2a]/8 bg-[#f8fbff] px-4 py-4">
                <p className="font-mono text-[11px] uppercase tracking-[0.24em] text-[#5d7188]">
                  What you will find
                </p>
                <div className="mt-3 space-y-3">
                  {[
                    'Preparation guides for stronger talking points and cleaner stories.',
                    'Templates and examples you can adapt before outreach or recording.',
                    'Promotion resources to turn one interview into more reach afterward.',
                  ].map((item) => (
                    <div key={item} className="flex gap-3">
                      <Sparkles className="mt-0.5 h-4 w-4 flex-shrink-0 text-[#2d6df6]" />
                      <p className="text-sm leading-7 text-[#4c5d73]">{item}</p>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section id="resource-library" className="px-4 pb-12">
        <div className="container mx-auto">
          <div className="rounded-[28px] border border-[#0d1b2a]/8 bg-white/88 p-4 shadow-[0_16px_34px_rgba(13,27,42,0.08)] backdrop-blur-sm sm:p-5">
            <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-center">
              <div className="relative">
                <Search className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-[#5d7188]" />
                <Input
                  value={searchQuery}
                  onChange={(event) => setSearchQuery(event.target.value)}
                  placeholder="Search resources by title or topic..."
                  className="h-12 border-[#0d1b2a]/10 bg-[#f8fbff] pl-11"
                />
              </div>

              <p className="text-sm text-[#5d7188]">
                {filteredResources.length} result{filteredResources.length === 1 ? '' : 's'}
              </p>
            </div>

            <div className="mt-4 flex flex-wrap gap-2">
              <Button
                variant={activeCategory === 'all' ? 'default' : 'outline'}
                size="sm"
                className={cn(
                  'rounded-full',
                  activeCategory !== 'all' && 'border-[#0d1b2a]/10 bg-white text-[#0d1b2a]'
                )}
                onClick={() => setActiveCategory('all')}
              >
                All resources
              </Button>
              {Object.entries(categoryInfo).map(([key, info]) => (
                <Button
                  key={key}
                  variant={activeCategory === key ? 'default' : 'outline'}
                  size="sm"
                  className={cn(
                    'rounded-full',
                    activeCategory !== key && 'border-[#0d1b2a]/10 bg-white text-[#0d1b2a]'
                  )}
                  onClick={() => setActiveCategory(key as ResourceCategory)}
                >
                  {info.label}
                </Button>
              ))}
            </div>
          </div>
        </div>
      </section>

      <section className="px-4 pb-16 md:pb-24">
        <div className="container mx-auto">
          {isLoading ? (
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
              {Array.from({ length: 6 }).map((_, index) => (
                <div
                  key={index}
                  className="rounded-[28px] border border-[#0d1b2a]/8 bg-white/88 p-6 shadow-[0_16px_34px_rgba(13,27,42,0.08)]"
                >
                  <div className="h-5 w-28 animate-pulse rounded bg-[#e6edf6]" />
                  <div className="mt-5 h-8 w-3/4 animate-pulse rounded bg-[#e6edf6]" />
                  <div className="mt-4 space-y-3">
                    <div className="h-4 w-full animate-pulse rounded bg-[#eef4ff]" />
                    <div className="h-4 w-5/6 animate-pulse rounded bg-[#eef4ff]" />
                    <div className="h-4 w-2/3 animate-pulse rounded bg-[#eef4ff]" />
                  </div>
                </div>
              ))}
            </div>
          ) : filteredResources.length === 0 ? (
            <div className="rounded-[32px] border border-[#0d1b2a]/8 bg-white/88 p-8 text-center shadow-[0_16px_34px_rgba(13,27,42,0.08)] sm:p-10">
              <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-[#eef4ff] text-[#2d6df6]">
                <BookOpen className="h-6 w-6" />
              </div>
              <h2 className="mt-5 font-display text-3xl font-semibold tracking-[-0.04em] text-[#0d1b2a]">
                No resources match that search.
              </h2>
              <p className="mx-auto mt-4 max-w-xl text-base leading-8 text-[#4c5d73]">
                Try a different keyword or switch categories. If you want tailored guidance right now, book a shortlist call and we will map the right next step with you.
              </p>
              <div className="mt-7 flex flex-col justify-center gap-3 sm:flex-row">
                <Button variant="hero" className="rounded-full px-7" asChild>
                  <a href="https://calendly.com/getonapodjg/30min" target="_blank" rel="noopener noreferrer">
                    Book My Shortlist Call
                  </a>
                </Button>
                <Button variant="outline" className="rounded-full border-[#0d1b2a]/10 bg-white text-[#0d1b2a]" asChild>
                  <Link to="/blog">Browse the blog</Link>
                </Button>
              </div>
            </div>
          ) : (
            <div className="space-y-12">
              {featuredResources.length > 0 && (
                <section>
                  <div className="max-w-2xl">
                    <p className="section-kicker">Featured</p>
                    <h2 className="mt-3 font-editorial text-4xl leading-[0.94] tracking-[-0.05em] text-[#0d1b2a] sm:text-5xl">
                      Start with the strongest resources first.
                    </h2>
                    <p className="mt-4 text-base leading-8 text-[#4c5d73]">
                      These are the pieces most likely to help you tighten your positioning, prep faster, or get more value out of each appearance.
                    </p>
                  </div>

                  <div className="mt-6 grid gap-4 lg:grid-cols-2">
                    {featuredResources.map((resource) => renderResourceCard(resource, true))}
                  </div>
                </section>
              )}

              {(featuredResources.length === 0 || regularResources.length > 0) && (
                <section>
                  <div className="max-w-2xl">
                    <p className="section-kicker">Library</p>
                    <h2 className="mt-3 font-editorial text-4xl leading-[0.94] tracking-[-0.05em] text-[#0d1b2a] sm:text-5xl">
                      Browse the full collection.
                    </h2>
                    <p className="mt-4 text-base leading-8 text-[#4c5d73]">
                      Use the search and category filters to find the exact guide, template, or example you need.
                    </p>
                  </div>

                  <div className="mt-6 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                    {(featuredResources.length > 0 ? regularResources : filteredResources).map((resource) =>
                      renderResourceCard(resource)
                    )}
                  </div>
                </section>
              )}
            </div>
          )}
        </div>
      </section>

      <section className="px-4 pb-16 md:pb-24">
        <div className="container mx-auto">
          <div className="overflow-hidden rounded-[34px] border border-[#0d1b2a]/10 bg-[#081a2b] px-6 py-8 text-[#f7fafc] shadow-[0_24px_60px_rgba(13,27,42,0.18)] md:px-8 md:py-10">
            <div className="grid gap-6 lg:grid-cols-[1.08fr_0.92fr] lg:items-end">
              <div className="max-w-2xl">
                <p className="section-kicker text-[#8cb0dd]">Need more than templates?</p>
                <h2 className="mt-3 font-editorial text-4xl leading-[0.94] tracking-[-0.05em] text-[#f7fafc] sm:text-5xl">
                  If you want the bookings, not just the homework, we handle that too.
                </h2>
                <p className="mt-4 text-base leading-8 text-[#d6e5f5] md:text-lg">
                  Use the free resources if you want to sharpen your process. If you want a team to build the shortlist, pitch the shows, and manage the follow-up, book a call.
                </p>
              </div>

              <div className="flex flex-col gap-3 sm:flex-row lg:justify-end">
                <Button variant="heroOutline" size="xl" className="rounded-full bg-[#f7fafc] px-8 text-[#0d1b2a]" asChild>
                  <a href="https://calendly.com/getonapodjg/30min" target="_blank" rel="noopener noreferrer">
                    Book My Shortlist Call
                  </a>
                </Button>
                <Button variant="ghost" size="xl" className="rounded-full border border-white/12 text-[#f7fafc] hover:bg-white/10 hover:text-[#f7fafc]" asChild>
                  <Link to="/what-to-expect">See what to expect</Link>
                </Button>
              </div>
            </div>
          </div>
        </div>
      </section>

      <Footer />

      <Dialog open={!!viewingResource} onOpenChange={() => setViewingResource(null)}>
        <DialogContent className="max-w-4xl border border-[#0d1b2a]/10 bg-white p-0 text-[#0d1b2a]">
          <div className="max-h-[90vh] overflow-y-auto">
            <DialogHeader className="border-b border-[#0d1b2a]/8 px-6 py-6">
              <div className="flex flex-wrap items-center gap-2">
                {viewingResource && (
                  <>
                    <Badge
                      variant="outline"
                      className={cn(
                        'rounded-full border px-3 py-1 text-[11px] font-medium tracking-[0.18em] uppercase',
                        categoryInfo[viewingResource.category].tone
                      )}
                    >
                      {categoryInfo[viewingResource.category].label}
                    </Badge>
                    <Badge variant="outline" className="rounded-full border-[#0d1b2a]/10 bg-[#f8fbff] text-[#56708d]">
                      {typeInfo[viewingResource.type].label}
                    </Badge>
                  </>
                )}
              </div>
              <DialogTitle className="mt-4 max-w-3xl font-editorial text-4xl leading-[0.98] tracking-[-0.05em] text-[#0d1b2a]">
                {viewingResource?.title}
              </DialogTitle>
              <p className="mt-3 max-w-2xl text-sm leading-7 text-[#4c5d73]">
                {viewingResource?.description}
              </p>
            </DialogHeader>

            {viewingResource?.content && (
              <div
                className="prose prose-sm max-w-none px-6 py-6 text-[#30465f] [&_blockquote]:rounded-r-[18px] [&_blockquote]:border-l-4 [&_blockquote]:border-[#2d6df6] [&_blockquote]:bg-[#eef4ff] [&_blockquote]:p-4 [&_blockquote]:text-[#30465f] [&_h2]:mt-8 [&_h2]:font-display [&_h2]:text-2xl [&_h2]:tracking-[-0.04em] [&_h3]:mt-6 [&_h3]:text-xl [&_h3]:font-semibold [&_li]:my-1 [&_ol]:my-4 [&_p]:my-4 [&_ul]:my-4"
                dangerouslySetInnerHTML={{ __html: sanitizeContent(viewingResource.content) }}
              />
            )}

            {(viewingResource?.url || viewingResource?.file_url) && (
              <div className="border-t border-[#0d1b2a]/8 px-6 py-5">
                <Button
                  variant="hero"
                  className="rounded-full px-6"
                  onClick={() => {
                    if (viewingResource.file_url) {
                      window.open(viewingResource.file_url, '_blank')
                      return
                    }
                    if (viewingResource.url) {
                      window.open(viewingResource.url, '_blank')
                    }
                  }}
                >
                  {viewingResource.file_url ? 'Download file' : 'Open link'}
                  <ArrowRight className="ml-2 h-4 w-4" />
                </Button>
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </main>
  )
}
