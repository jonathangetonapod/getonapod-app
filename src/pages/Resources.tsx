import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import Navbar from '@/components/Navbar'
import Footer from '@/components/Footer'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { ArrowRight, Search } from 'lucide-react'
import { getGuestResources, type GuestResource, type ResourceCategory } from '@/services/guestResources'
import PageSEO from '@/components/seo/PageSEO'
import { openExternalUrl } from '@/lib/externalUrl'
import { sanitizePortalResourceContent } from '@/lib/portalResourceContent'
import { CALL_URL, CONTACT_EMAIL } from '@/lib/landingContent'

const categoryInfo: Record<ResourceCategory, { label: string }> = {
  preparation: { label: 'Preparation' },
  technical_setup: { label: 'Technical setup' },
  best_practices: { label: 'Best practices' },
  promotion: { label: 'Promotion' },
  examples: { label: 'Examples' },
  templates: { label: 'Templates' },
}

const typeInfo = {
  article: { label: 'Article' },
  video: { label: 'Video' },
  download: { label: 'Download' },
  link: { label: 'External link' },
}

const libraryPromises = [
  'Preparation guides for stronger talking points and cleaner stories.',
  'Templates and examples you can adapt before outreach or recording.',
  'Promotion resources to turn one interview into more reach afterward.',
]

function getResourceActionLabel(resource: GuestResource) {
  if (resource.type === 'article' && resource.content) return 'Read resource'
  if (resource.type === 'download' && resource.file_url) return 'Download file'
  if (resource.type === 'video' && resource.url) return 'Watch video'
  if (resource.url) return 'Open link'
  if (resource.file_url) return 'Download file'
  return 'Unavailable'
}

function sanitizeContent(content: string) {
  return sanitizePortalResourceContent(
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

const formatDate = (value: string) =>
  new Date(value).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })

export default function Resources() {
  const [searchQuery, setSearchQuery] = useState('')
  const [activeCategory, setActiveCategory] = useState<'all' | ResourceCategory>('all')
  const [viewingResource, setViewingResource] = useState<GuestResource | null>(null)

  const { data: resources = [], isLoading, isError, refetch } = useQuery({
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
  const lastUpdated = formatDate(
    new Date(Math.max(0, ...resources.map((resource) => new Date(resource.updated_at).getTime()))).toISOString()
  )
  // Only categories that have something in them are worth a line; "0 available"
  // six times over is a library announcing that it is empty.
  const stockedCategories = Object.entries(categoryInfo).filter(
    ([key]) => resources.some((resource) => resource.category === key)
  )

  const openResource = (resource: GuestResource) => {
    if (resource.type === 'article' && resource.content) {
      setViewingResource(resource)
      return
    }

    if (resource.type === 'download' && resource.file_url) {
      openExternalUrl(resource.file_url)
      return
    }

    if (resource.url) {
      openExternalUrl(resource.url)
      return
    }

    if (resource.file_url) {
      openExternalUrl(resource.file_url)
    }
  }

  const renderResourceCard = (resource: GuestResource) => {
    const actionLabel = getResourceActionLabel(resource)
    const isActionable = actionLabel !== 'Unavailable'

    return (
      <article key={resource.id} className="dfy-card">
        <p className="dfy-tag-row">
          <span className="dfy-tag">{categoryInfo[resource.category].label}</span>
          <span className="dfy-tag">{typeInfo[resource.type].label}</span>
          {resource.featured && <span className="dfy-tag">Featured</span>}
        </p>

        <h3 className="dfy-card-title">{resource.title}</h3>

        <p className="dfy-card-copy">{resource.description}</p>

        <div className="dfy-card-foot">
          <span className="dfy-small">Updated {formatDate(resource.updated_at)}</span>
          <button
            type="button"
            className="dfy-btn dfy-btn-primary"
            disabled={!isActionable}
            onClick={() => openResource(resource)}
          >
            {actionLabel}
            {isActionable && <ArrowRight aria-hidden="true" />}
          </button>
        </div>
      </article>
    )
  }

  const seo = (
    <PageSEO
      title="Podcast guest resources | Get On A Pod"
      description="Free podcast guest resources from Get On A Pod: preparation guides, setup checklists, promotion templates and examples we give our own clients."
      path="/resources"
    />
  )

  const closingBand = (
    <section className="dfy-book">
      <div className="dfy-book-in">
        <span className="dfy-kicker">Need more than templates?</span>
        <h2><span>If you want the bookings, not just the homework,</span><span>we handle that too.</span></h2>
        <p className="dfy-book-copy">
          Use the free resources to sharpen your own process. Or have Get On A Pod build the shortlist, pitch the shows and handle the follow-up for $500 a month. Most clients have 2–4 bookings a month once outreach ramps up.
        </p>
        <div className="dfy-cta-row">
          <a className="dfy-btn dfy-btn-ghost" href={CALL_URL} target="_blank" rel="noopener noreferrer">
            Book a 30-minute call
          </a>
          <Link className="dfy-btn dfy-btn-ghost" to="/what-to-expect">See what to expect</Link>
        </div>
      </div>
    </section>
  )

  /*
   * The library is gated on having something in it. A hero promising
   * "preparation guides, setup checklists, promotion templates" over a grid
   * of zeros is a page that argues with itself, so until the first resource
   * is published (or while the load is failing) the page is one paragraph
   * that says so, and the offer.
   */
  if (isLoading || isError || resources.length === 0) {
    return (
      <div className="dfy-page">
        {seo}
        <Navbar />

        <main className="dfy-wrap">
          <section className="dfy-page-hero">
            <span className="dfy-kicker">Resource library</span>
            {isLoading ? (
              <div className="max-w-2xl" role="status" aria-label="Loading resources">
                <span className="dfy-skeleton h-10 w-3/4" />
                <span className="dfy-skeleton mt-6 h-4 w-full" />
                <span className="dfy-skeleton mt-3 h-4 w-5/6" />
              </div>
            ) : isError ? (
              // A failed load is not an empty library; say so and offer a retry.
              <div role="alert">
                <h1>The resources could not be loaded.</h1>
                <p className="dfy-page-lead">Something went wrong on our side. Try again in a moment.</p>
                <div className="dfy-cta-row">
                  <button type="button" className="dfy-btn dfy-btn-primary" onClick={() => refetch()}>
                    Retry
                  </button>
                </div>
              </div>
            ) : (
              <div>
                <h1>The guest library is being written.</h1>
                <p className="dfy-page-lead">
                  It is the same prep material our clients get before they record. Want it when it is ready?
                  Email <a href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a>
                </p>
              </div>
            )}
          </section>
        </main>

        {closingBand}
        <Footer />
      </div>
    )
  }

  return (
    <div className="dfy-page">
      {seo}

      <Navbar />

      <main className="dfy-wrap">
        <section className="dfy-page-hero">
          <div className="dfy-split">
            <div>
              <span className="dfy-kicker">Resource library</span>
              <h1>Resources that make you a better podcast guest.</h1>
              <p className="dfy-page-lead">
                The preparation guides, setup checklists, promotion templates and examples we give our own clients before they record. Free to read, no sign-up.
              </p>

              <div className="dfy-cta-row">
                <a className="dfy-btn dfy-btn-primary" href="#resource-library">Browse the library</a>
                <a className="dfy-btn dfy-btn-ghost" href={CALL_URL} target="_blank" rel="noopener noreferrer">
                  Book a 30-minute call
                </a>
              </div>

              <p className="dfy-kicker dfy-facts">
                <span>Free podcast guest tools</span>
                <span>No sign-up</span>
              </p>

              <div className="dfy-facts-grid">
                <div>
                  <span className="dfy-kicker">Resources</span>
                  <span className="dfy-stat">{resources.length}</span>
                </div>
                <div>
                  <span className="dfy-kicker">Categories</span>
                  <span className="dfy-stat">{categoryCount}</span>
                </div>
                <div>
                  <span className="dfy-kicker">Last updated</span>
                  <span className="dfy-fact-title">{lastUpdated}</span>
                </div>
              </div>
            </div>

            <aside className="dfy-panel">
              <span className="dfy-kicker">Inside the library</span>
              <h2 className="dfy-panel-title">Start with what you need right now.</h2>

              <ul className="dfy-includes">
                {stockedCategories.map(([key, info]) => {
                  const count = resources.filter((resource) => resource.category === key).length

                  return (
                    <li key={key}>
                      <span className="dfy-list-mark" aria-hidden="true" />
                      <span>
                        {info.label} <span className="dfy-small">{count} available</span>
                      </span>
                    </li>
                  )
                })}
              </ul>

              <div className="dfy-panel">
                <span className="dfy-kicker">What you will find</span>
                <ul className="dfy-includes">
                  {libraryPromises.map((item) => (
                    <li key={item}>
                      <span className="dfy-list-mark" aria-hidden="true" />
                      <span>{item}</span>
                    </li>
                  ))}
                </ul>
              </div>
            </aside>
          </div>
        </section>

        <section id="resource-library" className="dfy-section-tight">
          <div className="dfy-toolbar">
            <div className="dfy-input-wrap">
              <Search aria-hidden="true" />
              <input
                type="search"
                className="dfy-input"
                value={searchQuery}
                onChange={(event) => setSearchQuery(event.target.value)}
                aria-label="Search resources"
                placeholder="Search resources by title or topic..."
              />
            </div>

            <p className="dfy-small" aria-live="polite">
              {filteredResources.length} result{filteredResources.length === 1 ? '' : 's'}
            </p>

            <div className="dfy-chip-row" role="group" aria-label="Category">
              <button
                type="button"
                className="dfy-chip"
                aria-pressed={activeCategory === 'all'}
                onClick={() => setActiveCategory('all')}
              >
                All resources
              </button>
              {Object.entries(categoryInfo).map(([key, info]) => (
                <button
                  key={key}
                  type="button"
                  className="dfy-chip"
                  aria-pressed={activeCategory === key}
                  onClick={() => setActiveCategory(key as ResourceCategory)}
                >
                  {info.label}
                </button>
              ))}
            </div>
          </div>

          <div className="mt-12">
            {filteredResources.length === 0 ? (
              <div>
                <h2 className="dfy-title">No resources match that search.</h2>
                <p className="dfy-copy">
                  Try a different keyword or switch categories. Or book a 30-minute call and ask us directly.
                </p>
                <div className="dfy-cta-row">
                  <a className="dfy-btn dfy-btn-primary" href={CALL_URL} target="_blank" rel="noopener noreferrer">
                    Book a 30-minute call
                  </a>
                  <Link className="dfy-btn dfy-btn-ghost" to="/blog">Browse the blog</Link>
                </div>
              </div>
            ) : (
              <div>
                {featuredResources.length > 0 && (
                  <section>
                    <span className="dfy-kicker">Featured</span>
                    <h2 className="dfy-title">Start here.</h2>
                    <p className="dfy-copy">
                      The pieces our clients use most: to tighten their positioning, prepare faster and get more out of each appearance.
                    </p>

                    <div className="dfy-grid-2">
                      {featuredResources.map((resource) => renderResourceCard(resource))}
                    </div>
                  </section>
                )}

                {(featuredResources.length === 0 || regularResources.length > 0) && (
                  <section className={featuredResources.length > 0 ? 'mt-16' : undefined}>
                    <span className="dfy-kicker">Library</span>
                    <h2 className="dfy-title">Browse the full collection.</h2>
                    <p className="dfy-copy">
                      Use the search and category filters to find the exact guide, template, or example you need.
                    </p>

                    <div className="dfy-grid">
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
      </main>

      {closingBand}

      <Footer />

      <Dialog open={!!viewingResource} onOpenChange={() => setViewingResource(null)}>
        <DialogContent className="dfy-page dfy-dialog max-w-4xl p-0">
          <div className="dfy-dialog-scroll">
            <DialogHeader className="dfy-dialog-head space-y-3 text-left">
              {viewingResource && (
                <p className="dfy-tag-row">
                  <span className="dfy-tag">{categoryInfo[viewingResource.category].label}</span>
                  <span className="dfy-tag">{typeInfo[viewingResource.type].label}</span>
                </p>
              )}
              <DialogTitle className="dfy-dialog-title">{viewingResource?.title}</DialogTitle>
              <p className="dfy-copy">{viewingResource?.description}</p>
            </DialogHeader>

            {viewingResource?.content && (
              <div
                className="dfy-prose dfy-dialog-body"
                dangerouslySetInnerHTML={{ __html: sanitizeContent(viewingResource.content) }}
              />
            )}

            {(viewingResource?.url || viewingResource?.file_url) && (
              <div className="dfy-dialog-foot">
                <button
                  type="button"
                  className="dfy-btn dfy-btn-primary"
                  onClick={() => {
                    if (viewingResource.file_url) {
                      openExternalUrl(viewingResource.file_url)
                      return
                    }
                    if (viewingResource.url) {
                      openExternalUrl(viewingResource.url)
                    }
                  }}
                >
                  {viewingResource.file_url ? 'Download file' : 'Open link'}
                  <ArrowRight aria-hidden="true" />
                </button>
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}
