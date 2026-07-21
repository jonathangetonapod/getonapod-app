import { createServer } from 'node:http'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const MODULE_PATH = fileURLToPath(import.meta.url)
const API_RESPONSE = JSON.stringify({
  error: 'Video generation is not available',
  code: 'VIDEO_GENERATION_DISABLED',
})
const HEALTH_RESPONSE = JSON.stringify({ status: 'retired' })

function sendJson(response, statusCode, body) {
  response.writeHead(statusCode, {
    'Cache-Control': 'no-store',
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': Buffer.byteLength(body),
    'X-Content-Type-Options': 'nosniff',
  })
  response.end(body)
}

function requestPath(request) {
  try {
    return new URL(request.url ?? '/', 'http://localhost').pathname
  } catch {
    return request.url ?? '/'
  }
}

// The standalone recorder/HeyGen service is retired for the invite-only MVP.
// It intentionally has no third-party dependencies and never parses a request
// body, so malformed or oversized historical mutation requests still fail
// closed with the same 410 response and cannot reach a provider or database.
export function createRetiredVideoServer() {
  return createServer((request, response) => {
    request.resume()
    const pathname = requestPath(request)

    if (pathname === '/health') {
      // Keep the historical deployment health check green so this safe
      // tombstone can replace a still-mutating old Railway revision.
      sendJson(response, 200, HEALTH_RESPONSE)
      return
    }

    if (pathname === '/api' || pathname.startsWith('/api/')) {
      sendJson(response, 410, API_RESPONSE)
      return
    }

    sendJson(response, 404, JSON.stringify({ error: 'Not found' }))
  })
}

function parsePort(value) {
  const port = Number.parseInt(value, 10)
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error('PORT must be an integer between 1 and 65535')
  }
  return port
}

if (resolve(process.argv[1] ?? '') === MODULE_PATH) {
  const port = parsePort(process.env.PORT ?? '3001')
  createRetiredVideoServer().listen(port, '0.0.0.0', () => {
    console.log(`Retired video service tombstone listening on port ${port}`)
  })
}
