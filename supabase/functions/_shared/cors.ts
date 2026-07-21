/**
 * Shared CORS configuration for all edge functions.
 * Restricts origins to known domains instead of wildcard '*'.
 */

const PRODUCTION_ALLOWED_ORIGINS = [
  'https://getonapod.com',
  'https://www.getonapod.com',
]

const LOCAL_DEVELOPMENT_ORIGINS = [
  'http://localhost:5173',
  'http://localhost:3000',
  'http://localhost:8080',
]

function isLocalHostname(hostname: string): boolean {
  const normalized = hostname.toLowerCase().replace(/\.$/, '')
  return normalized === 'localhost'
    || normalized.endsWith('.localhost')
    || normalized.startsWith('127.')
    || normalized === '[::1]'
}

export function resolveAllowedOrigins(
  environment: string | undefined,
  configuredValues: Array<string | undefined>,
): string[] {
  const development = environment?.trim().toLowerCase() === 'development'
  const configured = configuredValues
    .filter((value): value is string => Boolean(value?.trim()))
    .flatMap((value) => value.split(','))
    .map((value) => value.trim())
    .flatMap((value) => {
      try {
        const parsed = new URL(value)
        const local = isLocalHostname(parsed.hostname)
        if (local && !development) return []
        if (parsed.protocol !== 'https:' && !(local && parsed.protocol === 'http:')) return []
        return [parsed.origin]
      } catch {
        return []
      }
    })

  return [...new Set([
    ...PRODUCTION_ALLOWED_ORIGINS,
    ...configured,
    ...(development ? LOCAL_DEVELOPMENT_ORIGINS : []),
  ])]
}

const ALLOWED_ORIGINS = resolveAllowedOrigins(Deno.env.get('ENVIRONMENT'), [
  Deno.env.get('ALLOWED_ORIGINS'),
  Deno.env.get('ALLOWED_ORIGIN'),
  Deno.env.get('APP_URL'),
  Deno.env.get('WEB_URL'),
])

export function getCorsHeaders(req?: Request): Record<string, string> {
  const origin = req?.headers?.get('origin') || ''
  const allowedOrigin = ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0]

  return {
    'Access-Control-Allow-Origin': allowedOrigin,
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  }
}

/**
 * Static CORS headers for backward compatibility.
 * Prefer getCorsHeaders(req) for proper origin checking.
 */
export const corsHeaders = {
  'Access-Control-Allow-Origin': ALLOWED_ORIGINS[0],
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}
