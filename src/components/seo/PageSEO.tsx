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
  favicon?: string | null
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
  favicon,
}: PageSEOProps) {
  const canonicalUrl = toAbsoluteUrl(path)
  const imageUrl = toAbsoluteUrl(image)
  const robots = noindex ? 'noindex, nofollow' : 'index, follow'
  const appName = whiteLabel ? brandName || 'Client onboarding' : SITE_NAME

  // react-helmet-async reads only the direct children of <Helmet>. A Fragment
  // between them is skipped along with everything inside it, so the social
  // tags are a flat list spread in as siblings, never grouped in a wrapper.
  const socialTags = whiteLabel
    ? []
    : [
        <meta key="og:type" property="og:type" content={type} />,
        <meta key="og:url" property="og:url" content={canonicalUrl} />,
        <meta key="og:title" property="og:title" content={title} />,
        <meta key="og:description" property="og:description" content={description} />,
        <meta key="og:image" property="og:image" content={imageUrl} />,
        <meta key="og:image:alt" property="og:image:alt" content={imageAlt} />,
        <meta key="og:image:width" property="og:image:width" content="1200" />,
        <meta key="og:image:height" property="og:image:height" content="630" />,
        <meta key="og:site_name" property="og:site_name" content={SITE_NAME} />,
        <meta key="og:locale" property="og:locale" content="en_US" />,
        <meta key="twitter:card" name="twitter:card" content="summary_large_image" />,
        <meta key="twitter:url" name="twitter:url" content={canonicalUrl} />,
        <meta key="twitter:title" name="twitter:title" content={title} />,
        <meta key="twitter:description" name="twitter:description" content={description} />,
        <meta key="twitter:image" name="twitter:image" content={imageUrl} />,
        <meta key="twitter:image:alt" name="twitter:image:alt" content={imageAlt} />,
      ]

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
      <meta name="application-name" content={appName} />
      <meta name="apple-mobile-web-app-title" content={appName} />
      {whiteLabel && favicon ? <link rel="icon" href={favicon} /> : null}
      {whiteLabel && favicon ? <link rel="apple-touch-icon" href={favicon} /> : null}
      {!whiteLabel ? <link rel="canonical" href={canonicalUrl} /> : null}
      {socialTags}
    </Helmet>
  )
}
