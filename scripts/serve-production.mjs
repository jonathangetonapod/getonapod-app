import { createServer } from 'node:http'
import { lstat, readFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { deflateSync } from 'node:zlib'

import serveHandler from 'serve-handler'
import { validateBrowserBundle } from './validate-browser-bundle.mjs'

const MODULE_PATH = fileURLToPath(import.meta.url)
const DEFAULT_PUBLIC_DIRECTORY = path.resolve(path.dirname(MODULE_PATH), '..', 'dist')
const INDEXABLE_ROUTE_PATTERN = /^\/(?:$|resources\/?$|blog(?:\/[^/]+)?\/?$|course\/?$|what-to-expect\/?$)/
const PUBLIC_FILE_PATTERN = /^\/(?:assets\/[^/]+|apple-touch-icon\.png|favicon(?:-16x16|-32x32)?\.(?:ico|png|svg)|icon-(?:192|512)\.png|og-image\.png|onboarding-link-(?:icon|preview)\.png|placeholder\.svg|robots\.txt|site\.webmanifest|sitemap\.xml)$/
const FILE_LIKE_PATH_PATTERN = /(?:^|\/)[^/]+\.[A-Za-z0-9][A-Za-z0-9_-]{0,15}$/
const ONBOARDING_ROUTE_PATTERN = /^\/onboarding\/([^/]+)\/?$/u
const ONBOARDING_TOKEN_PATTERN = /^([0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12})\.([1-9][0-9]{0,9})\.([A-Za-z0-9_-]{43})$/iu
const ONBOARDING_PREVIEW_PATH = '/onboarding-link-preview.png'
const ONBOARDING_ICON_PATH = '/onboarding-link-icon.png'
const DEFAULT_ONBOARDING_METADATA = Object.freeze({
  workspaceName: 'Client services',
  accentColor: '#334155',
  logoUrl: null,
})
const PNG_SIGNATURE = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])
const PNG_CACHE = new Map()

function escapeHtml(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;')
}

function normalizedAccent(value) {
  const color = typeof value === 'string' ? value.trim().toUpperCase() : ''
  return /^#[0-9A-F]{6}$/u.test(color) ? color : DEFAULT_ONBOARDING_METADATA.accentColor
}

function previewAccent(value) {
  const channels = colorChannels(normalizedAccent(value))
    .map((channel) => Math.min(255, Math.round(channel / 85) * 85))
  return `#${channels.map((channel) => channel.toString(16).padStart(2, '0')).join('').toUpperCase()}`
}

function normalizedWorkspaceName(value) {
  if (typeof value !== 'string') return DEFAULT_ONBOARDING_METADATA.workspaceName
  const name = value.replace(/[\p{Cc}\p{Cf}]/gu, '').trim()
  return name ? name.slice(0, 200) : DEFAULT_ONBOARDING_METADATA.workspaceName
}

function normalizedBaseUrl(value) {
  if (typeof value !== 'string' || !value.trim()) return null
  try {
    const parsed = new URL(value.trim())
    const local = parsed.hostname === 'localhost' || parsed.hostname === '127.0.0.1'
    if (parsed.protocol !== 'https:' && !(local && parsed.protocol === 'http:')) return null
    return parsed.origin
  } catch {
    return null
  }
}

function normalizedLogoUrl(value, supabaseOrigin) {
  if (typeof value !== 'string' || value.length > 4096 || !supabaseOrigin) return null
  try {
    const logo = new URL(value)
    const base = new URL(supabaseOrigin)
    if (logo.protocol !== 'https:' || logo.origin !== base.origin) return null
    if (!logo.pathname.startsWith('/storage/v1/object/')) return null
    return logo.toString()
  } catch {
    return null
  }
}

export async function loadOnboardingShareMetadata(token, {
  fetchImpl = globalThis.fetch,
  supabaseUrl = process.env.SUPABASE_PUBLIC_URL ?? process.env.SUPABASE_URL ?? process.env.VITE_SUPABASE_URL,
  timeoutMs = 2500,
} = {}) {
  if (!ONBOARDING_TOKEN_PATTERN.test(token) || typeof fetchImpl !== 'function') return null
  const supabaseOrigin = normalizedBaseUrl(supabaseUrl)
  if (!supabaseOrigin) return null

  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), timeoutMs)
  try {
    const response = await fetchImpl(`${supabaseOrigin}/functions/v1/client-onboarding`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'metadata', token }),
      cache: 'no-store',
      redirect: 'error',
      signal: controller.signal,
    })
    if (!response.ok) return null
    const declaredLength = Number(response.headers.get('content-length') ?? 0)
    if (declaredLength > 16_384) return null
    const body = await response.text()
    if (Buffer.byteLength(body) > 16_384) return null
    const source = JSON.parse(body)
    const metadata = source && typeof source === 'object' && !Array.isArray(source)
      ? source.metadata
      : null
    const workspace = metadata && typeof metadata === 'object' && !Array.isArray(metadata)
      && metadata.workspace && typeof metadata.workspace === 'object' && !Array.isArray(metadata.workspace)
      ? metadata.workspace
      : null
    if (!workspace) return null
    return {
      workspaceName: normalizedWorkspaceName(workspace.name),
      accentColor: normalizedAccent(metadata.accent_color),
      logoUrl: normalizedLogoUrl(workspace.logo_url, supabaseOrigin),
    }
  } catch {
    return null
  } finally {
    clearTimeout(timeout)
  }
}

export function whiteLabelOnboardingShell(source, metadata = DEFAULT_ONBOARDING_METADATA, assets = {}) {
  const workspaceName = normalizedWorkspaceName(metadata?.workspaceName)
  const accentColor = normalizedAccent(metadata?.accentColor)
  const logoUrl = typeof metadata?.logoUrl === 'string' ? metadata.logoUrl : null
  const previewImageUrl = typeof assets.previewImageUrl === 'string' ? assets.previewImageUrl : ONBOARDING_PREVIEW_PATH
  const fallbackIconUrl = typeof assets.fallbackIconUrl === 'string' ? assets.fallbackIconUrl : ONBOARDING_ICON_PATH
  const iconUrl = logoUrl ?? fallbackIconUrl
  const pageTitle = `${workspaceName} · Client onboarding`
  const cardTitle = 'Complete your client intake'
  const description = `Complete your private onboarding securely with ${workspaceName}.`
  const withoutStructuredData = source.replace(
    /\s*<script\s+type=["']application\/ld\+json["'][^>]*>[\s\S]*?<\/script>/giu,
    '',
  )
  const withoutMarketingMeta = withoutStructuredData
    .replace(/\s*<meta\s+(?:name=["'](?:theme-color|application-name|apple-mobile-web-app-title|msapplication-TileColor|title|description|keywords|author|robots|twitter:[^"']+)["']|property=["']og:[^"']+["'])[^>]*\/>/giu, '')
    .replace(/\s*<link\s+rel=["'](?:canonical|manifest|icon|apple-touch-icon)["'][^>]*\/>/giu, '')
    .replace(/<title>[\s\S]*?<\/title>/iu, `<title>${escapeHtml(pageTitle)}</title>`)

  const privateMetadata = `
    <meta name="theme-color" content="${escapeHtml(accentColor)}" />
    <meta name="application-name" content="${escapeHtml(workspaceName)}" />
    <meta name="apple-mobile-web-app-title" content="${escapeHtml(workspaceName)}" />
    <meta name="description" content="${escapeHtml(description)}" />
    <meta name="author" content="${escapeHtml(workspaceName)}" />
    <meta name="robots" content="noindex, nofollow, noarchive" />
    <meta property="og:type" content="website" />
    <meta property="og:title" content="${escapeHtml(cardTitle)}" />
    <meta property="og:description" content="${escapeHtml(description)}" />
    <meta property="og:site_name" content="${escapeHtml(workspaceName)}" />
    <meta property="og:image" content="${escapeHtml(previewImageUrl)}" />
    <meta property="og:image:type" content="image/png" />
    <meta property="og:image:width" content="1200" />
    <meta property="og:image:height" content="630" />
    <meta property="og:image:alt" content="Secure client onboarding" />
    <meta name="twitter:card" content="summary_large_image" />
    <meta name="twitter:title" content="${escapeHtml(cardTitle)}" />
    <meta name="twitter:description" content="${escapeHtml(description)}" />
    <meta name="twitter:image" content="${escapeHtml(previewImageUrl)}" />
    <link rel="icon" href="${escapeHtml(iconUrl)}" />
    <link rel="apple-touch-icon" sizes="180x180" href="${escapeHtml(iconUrl)}" />`
  return withoutMarketingMeta.replace('</head>', `${privateMetadata}\n  </head>`)
}

const CRC_TABLE = (() => {
  const table = new Uint32Array(256)
  for (let index = 0; index < 256; index += 1) {
    let value = index
    for (let bit = 0; bit < 8; bit += 1) value = (value & 1) ? 0xEDB88320 ^ (value >>> 1) : value >>> 1
    table[index] = value >>> 0
  }
  return table
})()

function pngChunk(type, data) {
  const name = Buffer.from(type, 'ascii')
  const payload = Buffer.concat([name, data])
  let crc = 0xFFFFFFFF
  for (const byte of payload) crc = CRC_TABLE[(crc ^ byte) & 0xFF] ^ (crc >>> 8)
  const chunk = Buffer.allocUnsafe(data.length + 12)
  chunk.writeUInt32BE(data.length, 0)
  name.copy(chunk, 4)
  data.copy(chunk, 8)
  chunk.writeUInt32BE((crc ^ 0xFFFFFFFF) >>> 0, data.length + 8)
  return chunk
}

function colorChannels(accentColor) {
  return [
    Number.parseInt(accentColor.slice(1, 3), 16),
    Number.parseInt(accentColor.slice(3, 5), 16),
    Number.parseInt(accentColor.slice(5, 7), 16),
  ]
}

function insideRoundedRectangle(x, y, left, top, right, bottom, radius) {
  if (x < left || x > right || y < top || y > bottom) return false
  const nearestX = Math.max(left + radius, Math.min(right - radius, x))
  const nearestY = Math.max(top + radius, Math.min(bottom - radius, y))
  return Math.hypot(x - nearestX, y - nearestY) <= radius
}

function segmentDistance(x, y, startX, startY, endX, endY) {
  const deltaX = endX - startX
  const deltaY = endY - startY
  const lengthSquared = deltaX * deltaX + deltaY * deltaY
  const position = Math.max(0, Math.min(1, ((x - startX) * deltaX + (y - startY) * deltaY) / lengthSquared))
  return Math.hypot(x - (startX + position * deltaX), y - (startY + position * deltaY))
}

export function generateOnboardingPreviewPng(accentValue, icon = false) {
  const accentColor = previewAccent(accentValue)
  const cacheKey = `${icon ? 'icon' : 'preview'}:${accentColor}`
  const cached = PNG_CACHE.get(cacheKey)
  if (cached) return cached

  const width = icon ? 180 : 1200
  const height = icon ? 180 : 630
  const [accentRed, accentGreen, accentBlue] = colorChannels(accentColor)
  const stride = width * 4 + 1
  const pixels = Buffer.allocUnsafe(stride * height)
  const clamp = (value) => Math.max(0, Math.min(255, Math.round(value)))

  for (let y = 0; y < height; y += 1) {
    const row = y * stride
    pixels[row] = 0
    const ny = y / Math.max(height - 1, 1)
    for (let x = 0; x < width; x += 1) {
      const nx = x / Math.max(width - 1, 1)
      const gradient = 0.22 + (nx * 0.52) + (ny * 0.10)
      const cornerGlow = Math.max(0, 1 - Math.hypot(nx - 0.82, ny - 0.18) / 0.55) ** 2
      const lowerGlow = Math.max(0, 1 - Math.hypot(nx - 0.16, ny - 0.92) / 0.66) ** 2
      const ribbon = Math.max(0, 1 - Math.abs(ny - (0.82 - nx * 0.48)) / 0.18)
      let red = 15 * (1 - gradient) + accentRed * gradient
      let green = 23 * (1 - gradient) + accentGreen * gradient
      let blue = 42 * (1 - gradient) + accentBlue * gradient
      const light = cornerGlow * 0.28 + ribbon * 0.08
      red += (255 - red) * light + accentRed * lowerGlow * 0.08
      green += (255 - green) * light + accentGreen * lowerGlow * 0.08
      blue += (255 - blue) * light + accentBlue * lowerGlow * 0.08

      if (icon) {
        const center = Math.hypot(nx - 0.5, ny - 0.5)
        const halo = Math.max(0, 1 - center / 0.36) ** 2 * 0.30
        red += (255 - red) * halo
        green += (255 - green) * halo
        blue += (255 - blue) * halo
        const badge = center <= 0.25
        if (badge) {
          red += (255 - red) * 0.88
          green += (255 - green) * 0.88
          blue += (255 - blue) * 0.88
        }
        if (segmentDistance(nx, ny, 0.37, 0.50, 0.46, 0.59) < 0.025
          || segmentDistance(nx, ny, 0.46, 0.59, 0.65, 0.38) < 0.025) {
          red = accentRed
          green = accentGreen
          blue = accentBlue
        }
      } else {
        const shadow = insideRoundedRectangle(nx, ny, 0.293, 0.102, 0.713, 0.902, 0.045)
        if (shadow) {
          red *= 0.76
          green *= 0.76
          blue *= 0.76
        }
        const card = insideRoundedRectangle(nx, ny, 0.28, 0.08, 0.70, 0.88, 0.045)
        if (card) {
          red += (255 - red) * 0.94
          green += (255 - green) * 0.94
          blue += (255 - blue) * 0.94
        }

        if (insideRoundedRectangle(nx, ny, 0.33, 0.16, 0.65, 0.184, 0.012)) {
          red += (226 - red) * 0.95
          green += (232 - green) * 0.95
          blue += (240 - blue) * 0.95
        }
        if (insideRoundedRectangle(nx, ny, 0.33, 0.16, 0.48, 0.184, 0.012)) {
          red = accentRed
          green = accentGreen
          blue = accentBlue
        }
        if (insideRoundedRectangle(nx, ny, 0.33, 0.235, 0.52, 0.267, 0.012)) {
          red = 30
          green = 41
          blue = 59
        }
        if (insideRoundedRectangle(nx, ny, 0.33, 0.285, 0.60, 0.302, 0.008)) {
          red = 148
          green = 163
          blue = 184
        }

        for (let fieldIndex = 0; fieldIndex < 4; fieldIndex += 1) {
          const fieldTop = 0.355 + fieldIndex * 0.105
          if (insideRoundedRectangle(nx, ny, 0.33, fieldTop, 0.65, fieldTop + 0.068, 0.014)) {
            red += (248 - red) * 0.92
            green += (250 - green) * 0.92
            blue += (252 - blue) * 0.92
          }
          if (Math.hypot(nx - 0.355, ny - (fieldTop + 0.034)) <= 0.011) {
            red = accentRed
            green = accentGreen
            blue = accentBlue
          }
          if (insideRoundedRectangle(nx, ny, 0.38, fieldTop + 0.022, 0.58 - fieldIndex * 0.018, fieldTop + 0.044, 0.008)) {
            red = 203
            green = 213
            blue = 225
          }
        }

        if (insideRoundedRectangle(nx, ny, 0.49, 0.795, 0.65, 0.842, 0.018)) {
          red = accentRed
          green = accentGreen
          blue = accentBlue
        }
        const badgeCenter = Math.hypot(nx - 0.715, ny - 0.19)
        if (badgeCenter <= 0.078) {
          red += (255 - red) * 0.94
          green += (255 - green) * 0.94
          blue += (255 - blue) * 0.94
        }
        if (segmentDistance(nx, ny, 0.68, 0.19, 0.706, 0.218) < 0.008
          || segmentDistance(nx, ny, 0.706, 0.218, 0.756, 0.158) < 0.008) {
          red = accentRed
          green = accentGreen
          blue = accentBlue
        }
      }

      const offset = row + 1 + x * 4
      pixels[offset] = clamp(red)
      pixels[offset + 1] = clamp(green)
      pixels[offset + 2] = clamp(blue)
      pixels[offset + 3] = 255
    }
  }

  const header = Buffer.alloc(13)
  header.writeUInt32BE(width, 0)
  header.writeUInt32BE(height, 4)
  header[8] = 8
  header[9] = 6
  header[10] = 0
  header[11] = 0
  header[12] = 0
  const png = Buffer.concat([
    PNG_SIGNATURE,
    pngChunk('IHDR', header),
    pngChunk('IDAT', deflateSync(pixels, { level: 9 })),
    pngChunk('IEND', Buffer.alloc(0)),
  ])
  PNG_CACHE.set(cacheKey, png)
  return png
}

export function isPrivateApplicationPath(pathname) {
  return !PUBLIC_FILE_PATTERN.test(pathname) && !INDEXABLE_ROUTE_PATTERN.test(pathname)
}

export function isStaticFileRequest(pathname) {
  return pathname === '/assets'
    || pathname.startsWith('/assets/')
    || PUBLIC_FILE_PATTERN.test(pathname)
    || FILE_LIKE_PATH_PATTERN.test(pathname)
}

async function isRegularPublicFile(publicDirectory, pathname) {
  let decodedPath
  try {
    decodedPath = decodeURIComponent(pathname).replaceAll('\\', '/')
  } catch {
    return false
  }

  const candidate = path.resolve(publicDirectory, `.${decodedPath}`)
  const relative = path.relative(publicDirectory, candidate)
  if (relative.startsWith('..') || path.isAbsolute(relative)) return false

  try {
    return (await lstat(candidate)).isFile()
  } catch {
    return false
  }
}

function sendMissingStaticFile(response) {
  response.statusCode = 404
  response.setHeader('Cache-Control', 'no-store')
  response.setHeader('Content-Type', 'text/plain; charset=utf-8')
  response.setHeader('X-Robots-Tag', 'noindex, nofollow, noarchive')
  response.end('Not Found')
}

function setApplicationHeaders(request, response) {
  response.setHeader('Referrer-Policy', 'no-referrer')
  response.setHeader('X-Content-Type-Options', 'nosniff')
  response.setHeader('X-Frame-Options', 'DENY')
  response.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=(), payment=()')

  const pathname = new URL(request.url ?? '/', 'http://localhost').pathname
  if (isPrivateApplicationPath(pathname)) {
    // These headers are selected from the original request path before the SPA
    // fallback rewrites it to index.html.
    response.setHeader('X-Robots-Tag', 'noindex, nofollow, noarchive')
    response.setHeader('Cache-Control', 'private, no-store')
  }
}

function requestOrigin(request, configuredOrigin) {
  const configured = normalizedBaseUrl(configuredOrigin)
  if (configured) return configured
  const forwardedProtocol = request.headers['x-forwarded-proto']?.split(',')[0]?.trim().toLowerCase()
  const protocol = forwardedProtocol === 'https' ? 'https:' : 'http:'
  const host = request.headers.host ?? 'localhost'
  try {
    return new URL(`${protocol}//${host}`).origin
  } catch {
    return 'http://localhost'
  }
}

function onboardingAssetUrl(origin, pathname, accentColor) {
  const asset = new URL(pathname, origin)
  asset.searchParams.set('accent', normalizedAccent(accentColor).slice(1))
  return asset.toString()
}

function sendOnboardingImage(request, response, pathname, accentValue) {
  if (request.method !== 'GET' && request.method !== 'HEAD') {
    response.statusCode = 405
    response.setHeader('Allow', 'GET, HEAD')
    response.end()
    return
  }
  const icon = pathname === ONBOARDING_ICON_PATH
  const accentColor = previewAccent(`#${accentValue ?? ''}`)
  const etag = `"onboarding-${icon ? 'icon' : 'preview'}-${accentColor.slice(1)}"`
  response.setHeader('Cache-Control', 'public, max-age=604800, stale-while-revalidate=86400')
  response.setHeader('Content-Type', 'image/png')
  response.setHeader('ETag', etag)
  if (request.headers['if-none-match'] === etag) {
    response.statusCode = 304
    response.end()
    return
  }
  const image = generateOnboardingPreviewPng(accentColor, icon)
  response.statusCode = 200
  response.setHeader('Content-Length', image.length)
  if (request.method === 'HEAD') response.end()
  else response.end(image)
}

export function createProductionServer({
  publicDirectory = DEFAULT_PUBLIC_DIRECTORY,
  supabaseUrl = process.env.SUPABASE_PUBLIC_URL ?? process.env.SUPABASE_URL ?? process.env.VITE_SUPABASE_URL,
  applicationOrigin = process.env.PUBLIC_APP_URL ?? process.env.VITE_APP_URL,
  fetchImpl = globalThis.fetch,
} = {}) {
  return createServer(async (request, response) => {
    setApplicationHeaders(request, response)

    try {
      const requestUrl = new URL(request.url ?? '/', 'http://localhost')
      const pathname = requestUrl.pathname
      if (pathname === ONBOARDING_PREVIEW_PATH || pathname === ONBOARDING_ICON_PATH) {
        sendOnboardingImage(request, response, pathname, requestUrl.searchParams.get('accent'))
        return
      }

      if (isStaticFileRequest(pathname)) {
        if (!await isRegularPublicFile(publicDirectory, pathname)) {
          sendMissingStaticFile(response)
          return
        }
        await serveHandler(request, response, {
          public: publicDirectory,
          cleanUrls: false,
          directoryListing: false,
        })
        return
      }

      const onboardingMatch = pathname.match(ONBOARDING_ROUTE_PATTERN)
      if (onboardingMatch) {
        let token = ''
        try {
          token = decodeURIComponent(onboardingMatch[1])
        } catch {
          // Invalid path encoding receives the generic private shell.
        }
        const metadata = await loadOnboardingShareMetadata(token, { fetchImpl, supabaseUrl })
        const origin = requestOrigin(request, applicationOrigin)
        const accentColor = metadata?.accentColor ?? DEFAULT_ONBOARDING_METADATA.accentColor
        const source = await readFile(path.join(publicDirectory, 'index.html'), 'utf8')
        const html = whiteLabelOnboardingShell(source, metadata ?? DEFAULT_ONBOARDING_METADATA, {
          previewImageUrl: onboardingAssetUrl(origin, ONBOARDING_PREVIEW_PATH, accentColor),
          fallbackIconUrl: onboardingAssetUrl(origin, ONBOARDING_ICON_PATH, accentColor),
        })
        response.statusCode = 200
        response.setHeader('Content-Type', 'text/html; charset=utf-8')
        response.setHeader('Content-Length', Buffer.byteLength(html))
        if (request.method === 'HEAD') response.end()
        else response.end(html)
        return
      }

      await serveHandler(request, response, {
        public: publicDirectory,
        cleanUrls: false,
        directoryListing: false,
        rewrites: [{ source: '**', destination: '/index.html' }],
      })
    } catch (error) {
      console.error('[production-server] Request failed:', error instanceof Error ? error.message : 'Unknown error')
      if (!response.headersSent) {
        response.statusCode = 500
        response.setHeader('Content-Type', 'text/plain; charset=utf-8')
      }
      response.end('Internal Server Error')
    }
  })
}

function parsePort(value) {
  const port = Number.parseInt(value, 10)
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error('PORT must be an integer between 1 and 65535')
  }
  return port
}

if (path.resolve(process.argv[1] ?? '') === MODULE_PATH) {
  validateBrowserBundle(DEFAULT_PUBLIC_DIRECTORY)
  const port = parsePort(process.env.PORT ?? '3000')
  const server = createProductionServer()

  server.listen(port, '0.0.0.0', () => {
    console.log(`[production-server] Listening on port ${port}`)
  })

  const shutdown = () => server.close(() => process.exit(0))
  process.once('SIGINT', shutdown)
  process.once('SIGTERM', shutdown)
}
