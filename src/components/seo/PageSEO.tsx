import { Helmet } from 'react-helmet-async'
import {
  DEFAULT_OG_IMAGE_ALT,
  DEFAULT_OG_IMAGE_PATH,
  DEFAULT_THEME_COLOR,
  SITE_NAME,
  toAbsoluteUrl,
} from '@/lib/seo'

interface PageSEOProps {
  title: string
  description: string
  path?: string
  image?: string
  imageAlt?: string
  type?: 'website' | 'article'
  keywords?: string
  noindex?: boolean
  author?: string
  whiteLabel?: boolean
  brandName?: string
  themeColor?: string
}

export default function PageSEO({
  title,
  description,
  path = '/',
  image = DEFAULT_OG_IMAGE_PATH,
  imageAlt = DEFAULT_OG_IMAGE_ALT,
  type = 'website',
  keywords,
  noindex = false,
  author = SITE_NAME,
  whiteLabel = false,
  brandName,
  themeColor = DEFAULT_THEME_COLOR,
}: PageSEOProps) {
  const canonicalUrl = toAbsoluteUrl(path)
  const imageUrl = toAbsoluteUrl(image)
  const robots = noindex ? 'noindex, nofollow' : 'index, follow'

  return (
    <Helmet>
      <title>{title}</title>
      <meta name="description" content={description} />
      {keywords ? <meta name="keywords" content={keywords} /> : null}
      <meta name="author" content={whiteLabel ? brandName || 'Client onboarding' : author} />
      <meta name="robots" content={robots} />
      <meta name="googlebot" content={robots} />
      {noindex ? <meta name="referrer" content="no-referrer" /> : null}
      <meta name="theme-color" content={themeColor} />
      <meta name="application-name" content={whiteLabel ? brandName || 'Client onboarding' : SITE_NAME} />
      <meta name="apple-mobile-web-app-title" content={whiteLabel ? brandName || 'Client onboarding' : SITE_NAME} />
      {!whiteLabel ? <link rel="canonical" href={canonicalUrl} /> : null}

      {!whiteLabel ? <>
        <meta property="og:type" content={type} />
        <meta property="og:url" content={canonicalUrl} />
        <meta property="og:title" content={title} />
        <meta property="og:description" content={description} />
        <meta property="og:image" content={imageUrl} />
        <meta property="og:image:alt" content={imageAlt} />
        <meta property="og:image:width" content="1200" />
        <meta property="og:image:height" content="630" />
        <meta property="og:site_name" content={SITE_NAME} />
        <meta property="og:locale" content="en_US" />

        <meta name="twitter:card" content="summary_large_image" />
        <meta name="twitter:url" content={canonicalUrl} />
        <meta name="twitter:title" content={title} />
        <meta name="twitter:description" content={description} />
        <meta name="twitter:image" content={imageUrl} />
        <meta name="twitter:image:alt" content={imageAlt} />
      </> : null}
    </Helmet>
  )
}
