import { createServer } from 'node:http'
import { lstat } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import serveHandler from 'serve-handler'
import { validateBrowserBundle } from './validate-browser-bundle.mjs'

const MODULE_PATH = fileURLToPath(import.meta.url)
const DEFAULT_PUBLIC_DIRECTORY = path.resolve(path.dirname(MODULE_PATH), '..', 'dist')
const INDEXABLE_ROUTE_PATTERN = /^\/(?:$|resources\/?$|blog(?:\/[^/]+)?\/?$|course\/?$|what-to-expect\/?$)/
const PUBLIC_FILE_PATTERN = /^\/(?:assets\/[^/]+|apple-touch-icon\.png|favicon(?:-16x16|-32x32)?\.(?:ico|png|svg)|icon-(?:192|512)\.png|og-image\.png|placeholder\.svg|robots\.txt|site\.webmanifest|sitemap\.xml)$/
const FILE_LIKE_PATH_PATTERN = /(?:^|\/)[^/]+\.[A-Za-z0-9][A-Za-z0-9_-]{0,15}$/

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

export function createProductionServer({ publicDirectory = DEFAULT_PUBLIC_DIRECTORY } = {}) {
  return createServer(async (request, response) => {
    setApplicationHeaders(request, response)

    try {
      const pathname = new URL(request.url ?? '/', 'http://localhost').pathname
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
