/**
 * Shared CORS configuration for all edge functions.
 * Restricts origins to known domains instead of wildcard '*'.
 */

const ALLOWED_ORIGINS = [
  'https://getonapod.com',
  'https://www.getonapod.com',
  'https://authoritybuilt.com',
  'https://www.authoritybuilt.com',
]

// In development, also allow localhost
if (Deno.env.get('ENVIRONMENT') !== 'production') {
  ALLOWED_ORIGINS.push('http://localhost:5173', 'http://localhost:3000', 'http://localhost:8080')
}

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
