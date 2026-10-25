/**
 * Build-time rendering of the public marketing pages.
 *
 * scripts/prerender-marketing.mjs builds this module for Node and calls
 * renderMarketingPage for every route in PRERENDERED_ROUTES. The HTML it
 * returns goes inside <div id="root"> and the Helmet tags go into <head>, so a
 * crawler or link-preview bot that never runs JavaScript still reads the
 * page's copy, title, description, canonical URL and social card.
 *
 * Nothing here hydrates. The browser app boots exactly as before and renders
 * over this markup (see src/lib/prerenderedShell.tsx for how the lazy route
 * fallback keeps the page on screen meanwhile).
 */
import type { ComponentType } from 'react'
import { renderToString } from 'react-dom/server'
import { StaticRouter } from 'react-router-dom/server'
import { HelmetProvider, type HelmetServerState } from 'react-helmet-async'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { TooltipProvider } from '@/components/ui/tooltip'
import Landing from '@/pages/Landing'
import AgencyLanding from '@/pages/AgencyLanding'
import Clips from '@/pages/Clips'
import Resources from '@/pages/Resources'
import Blog from '@/pages/Blog'
import WhatToExpect from '@/pages/WhatToExpect'
import Privacy from '@/pages/Privacy'
import Terms from '@/pages/Terms'
import type { GuestResource } from '@/services/guestResources'

export interface PrerenderedRoute {
  path: string
  /** Written to dist/prerender/<file>. */
  file: string
  /** The page module, used to find its CSS and chunks in the Vite manifest. */
  source: string
  Page: ComponentType
}

// Every path here must also be in INDEXABLE_ROUTE_PATTERN in
// scripts/serve-production.mjs and in the sitemap's static pages.
export const PRERENDERED_ROUTES: PrerenderedRoute[] = [
  { path: '/', file: 'index.html', source: 'src/pages/Landing.tsx', Page: Landing },
  { path: '/platform', file: 'platform.html', source: 'src/pages/AgencyLanding.tsx', Page: AgencyLanding },
  { path: '/clips', file: 'clips.html', source: 'src/pages/Clips.tsx', Page: Clips },
  { path: '/resources', file: 'resources.html', source: 'src/pages/Resources.tsx', Page: Resources },
  { path: '/blog', file: 'blog.html', source: 'src/pages/Blog.tsx', Page: Blog },
  { path: '/what-to-expect', file: 'what-to-expect.html', source: 'src/pages/WhatToExpect.tsx', Page: WhatToExpect },
  { path: '/privacy', file: 'privacy.html', source: 'src/pages/Privacy.tsx', Page: Privacy },
  { path: '/terms', file: 'terms.html', source: 'src/pages/Terms.tsx', Page: Terms },
]

export interface RenderedPage {
  html: string
  head: string
  title: string
}

/** Public data the build fetched ahead of time. Anything missing renders its loading state. */
export interface PrerenderData {
  guestResources?: GuestResource[]
}

export const renderMarketingPage = (route: PrerenderedRoute, data: PrerenderData = {}): RenderedPage => {
  const helmetContext: { helmet?: HelmetServerState } = {}
  // A fresh client per page. Seeded queries render with their data; the rest
  // render their loading state and the browser fills them in.
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  // Same key as the Resources page's query.
  if (data.guestResources?.length) queryClient.setQueryData(['public-guest-resources'], data.guestResources)
  const { Page } = route
  const html = renderToString(
    <HelmetProvider context={helmetContext}>
      <QueryClientProvider client={queryClient}>
        <TooltipProvider>
          <StaticRouter location={route.path}>
            <Page />
          </StaticRouter>
        </TooltipProvider>
      </QueryClientProvider>
    </HelmetProvider>,
  )
  const helmet = helmetContext.helmet
  const head = helmet
    ? [helmet.meta.toString(), helmet.link.toString(), helmet.script.toString()].filter(Boolean).join('\n')
    : ''
  const titleMatch = helmet?.title.toString().match(/<title[^>]*>([\s\S]*?)<\/title>/u)
  return { html, head, title: titleMatch?.[1] ?? '' }
}
