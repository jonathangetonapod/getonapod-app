import { useEffect } from 'react'
import { Helmet } from 'react-helmet-async'
import { useLocation } from 'react-router-dom'

import { ClipsBento } from '@/components/clips/ClipsBento'
import { ClipsCompare } from '@/components/clips/ClipsCompare'
import { ClipsFooter } from '@/components/clips/ClipsFooter'
import { ClipsFinal } from '@/components/clips/ClipsForm'
import { ClipsHero } from '@/components/clips/ClipsHero'
import { ClipsCrossed, ClipsProcess, ClipsTable } from '@/components/clips/ClipsMiddle'
import { ClipsNav } from '@/components/clips/ClipsNav'
import { ClipsNumbers } from '@/components/clips/ClipsNumbers'
import { ClipsPricing } from '@/components/clips/ClipsPricing'
import { ClipsFaq, ClipsFit, ClipsFounder } from '@/components/clips/ClipsStories'
import { ClipsMarquee, ClipsWork } from '@/components/clips/ClipsWork'
import { prefersReducedMotion } from '@/components/clips/clipsMotion'
import PageSEO from '@/components/seo/PageSEO'
import { readClipsAttribution, trackClips } from '@/lib/clipsAnalytics'
import { CLIPS_FAQ, CLIPS_PATH, CLIPS_SEO } from '@/lib/clipsContent'
import '@/styles/clips.css'

/**
 * The page's four faces, from Google Fonts with display=swap. Inter Tight is
 * the display face and is preloaded; the fallbacks in clips.css carry matched
 * metrics so the swap moves nothing.
 */
const FONTS_HREF =
  'https://fonts.googleapis.com/css2?family=Inter+Tight:wght@600;700;800&family=Instrument+Sans:ital,wght@0,400;0,500;0,600;1,400&family=JetBrains+Mono:wght@400;500&family=Caveat:wght@600&display=swap'

const FAQ_JSON_LD = {
  '@context': 'https://schema.org',
  '@type': 'FAQPage',
  mainEntity: CLIPS_FAQ.items.map((item) => ({
    '@type': 'Question',
    name: item.q,
    acceptedAnswer: { '@type': 'Answer', text: item.a },
  })),
}

const SERVICE_JSON_LD = {
  '@context': 'https://schema.org',
  '@type': 'Service',
  name: 'Short-form clips for podcast hosts and long-form creators',
  serviceType: 'Podcast clip editing',
  provider: { '@type': 'Organization', name: 'Get On A Pod LLC', url: 'https://getonapod.com' },
  areaServed: 'Worldwide',
  description: CLIPS_SEO.description,
  offers: {
    '@type': 'Offer',
    price: '750',
    priceCurrency: 'USD',
    priceSpecification: { '@type': 'UnitPriceSpecification', price: '750', priceCurrency: 'USD', billingDuration: 'P1M' },
    url: 'https://getonapod.com/clips#pricing',
  },
}

/**
 * getonapod.com/clips.
 *
 * Self-contained: its own nav, footer, dark theme and fonts, all scoped under
 * .clips-page so nothing here reaches the rest of the site and nothing from the
 * site's cream-and-copper system reaches in.
 */
const Clips = () => {
  const location = useLocation()

  useEffect(() => {
    readClipsAttribution()
    trackClips('clips_view')
  }, [])

  // A hash arriving with the page (a shared /clips#pricing link) has nothing
  // to land on until the route has rendered.
  useEffect(() => {
    if (!location.hash) return
    const target = document.getElementById(location.hash.slice(1))
    target?.scrollIntoView({ behavior: prefersReducedMotion() ? 'auto' : 'smooth', block: 'start' })
  }, [location.hash])

  return (
    <div className="clips-page">
      <PageSEO
        title={CLIPS_SEO.title}
        description={CLIPS_SEO.description}
        path={CLIPS_PATH}
        image={CLIPS_SEO.image}
        imageAlt={CLIPS_SEO.imageAlt}
        themeColor="#0a0a0b"
      />
      <Helmet>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link rel="preload" as="style" href={FONTS_HREF} />
        <link rel="stylesheet" href={FONTS_HREF} />
        <script type="application/ld+json">{JSON.stringify(SERVICE_JSON_LD)}</script>
        <script type="application/ld+json">{JSON.stringify(FAQ_JSON_LD)}</script>
      </Helmet>

      <a className="clips-skip" href="#clips-main">Skip to content</a>
      <ClipsNav />
      <main id="clips-main">
        <ClipsHero />
        <ClipsWork />
        <ClipsMarquee />
        <ClipsNumbers />
        <ClipsBento />
        <ClipsCompare />
        <ClipsProcess />
        <ClipsTable />
        <ClipsCrossed />
        <ClipsPricing />
        <ClipsFounder />
        <ClipsFit />
        <ClipsFaq />
        <ClipsFinal />
      </main>
      <ClipsFooter />
    </div>
  )
}

export default Clips
