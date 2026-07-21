import process from 'node:process'
import { pathToFileURL } from 'node:url'

function configurationError(message) {
  return new Error(`Unsafe public Supabase configuration: ${message}`)
}

function decodeJwtPart(part) {
  try {
    return JSON.parse(Buffer.from(part, 'base64url').toString('utf8'))
  } catch {
    throw configurationError('the browser key is not a valid public key')
  }
}

export function validatePublicSupabaseConfig({ url, key, nowSeconds = Math.floor(Date.now() / 1000) }) {
  const normalizedUrl = typeof url === 'string' ? url.trim() : ''
  const normalizedKey = typeof key === 'string' ? key.trim() : ''
  if (!normalizedUrl || !normalizedKey) throw configurationError('URL and browser key are required')

  let parsedUrl
  try {
    parsedUrl = new URL(normalizedUrl)
  } catch {
    throw configurationError('the project URL is invalid')
  }
  if (parsedUrl.protocol !== 'https:' || parsedUrl.username || parsedUrl.password) {
    throw configurationError('the project URL must be credential-free HTTPS')
  }

  if (/^sb_publishable_[A-Za-z0-9_-]{20,}$/u.test(normalizedKey)) return true
  if (/^sb_secret_/u.test(normalizedKey)) {
    throw configurationError('a secret key cannot be embedded in the browser')
  }

  const parts = normalizedKey.split('.')
  if (parts.length !== 3) throw configurationError('the browser key must be publishable or legacy anon')
  const header = decodeJwtPart(parts[0])
  const payload = decodeJwtPart(parts[1])
  if (header.alg !== 'HS256' || payload.role !== 'anon') {
    throw configurationError('the legacy browser key must have the anon role')
  }
  if (typeof payload.exp === 'number' && payload.exp <= nowSeconds) {
    throw configurationError('the legacy anon key is expired')
  }

  const projectMatch = parsedUrl.hostname.match(/^([a-z0-9]+)\.supabase\.co$/u)
  if (projectMatch && payload.ref !== projectMatch[1]) {
    throw configurationError('the legacy anon key belongs to a different project')
  }
  return true
}

const invokedPath = process.argv[1] ? pathToFileURL(process.argv[1]).href : ''
if (invokedPath === import.meta.url) {
  try {
    validatePublicSupabaseConfig({
      url: process.env.VITE_SUPABASE_URL,
      key: process.env.VITE_SUPABASE_ANON_KEY,
    })
    process.stdout.write('Public Supabase browser configuration is safe\n')
  } catch (error) {
    process.stderr.write(`${error instanceof Error ? error.message : 'Unsafe public Supabase configuration'}\n`)
    process.exitCode = 1
  }
}
