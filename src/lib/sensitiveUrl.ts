const AUTH_PARAMETER_NAMES = new Set([
  'access_token',
  'refresh_token',
  'provider_token',
  'provider_refresh_token',
  'token',
  'token_hash',
  'code',
])

const AUTH_ROUTE_PATTERN = /^\/(?:accept-invite|admin\/callback)(?:\/|$)/i
const CAPABILITY_ROUTE_PATTERN = /^\/(?:client|prospect)(?:\/|$)/i
const CAPABILITY_TOKEN_PATH_PATTERN = /^\/(client|prospect)\/[^/]+/i

function hashParameters(hash: string): URLSearchParams {
  const value = hash.startsWith('#') ? hash.slice(1) : hash
  return new URLSearchParams(value)
}

function containsAuthParameters(parameters: URLSearchParams): boolean {
  return [...parameters.keys()].some((key) => AUTH_PARAMETER_NAMES.has(key.toLowerCase()))
}

export function hasSensitiveAuthParameters(location: Location = window.location): boolean {
  return containsAuthParameters(new URLSearchParams(location.search))
    || containsAuthParameters(hashParameters(location.hash))
}

export function isSensitiveTelemetryLocation(location: Location = window.location): boolean {
  return AUTH_ROUTE_PATTERN.test(location.pathname)
    || CAPABILITY_ROUTE_PATTERN.test(location.pathname)
    || hasSensitiveAuthParameters(location)
}

export function scrubConsumedAuthParameters(location: Location = window.location): void {
  const url = new URL(location.href)
  let changed = false
  for (const key of [...url.searchParams.keys()]) {
    if (AUTH_PARAMETER_NAMES.has(key.toLowerCase())) {
      url.searchParams.delete(key)
      changed = true
    }
  }
  if (containsAuthParameters(hashParameters(url.hash))) {
    url.hash = ''
    changed = true
  }
  if (changed) {
    window.history.replaceState(window.history.state, document.title, `${url.pathname}${url.search}${url.hash}`)
  }
}

export function redactSensitiveUrl(
  value: string,
  location: Location = window.location,
): string {
  try {
    const url = new URL(value, location.origin)
    if (CAPABILITY_TOKEN_PATH_PATTERN.test(url.pathname)) {
      url.pathname = url.pathname.replace(CAPABILITY_TOKEN_PATH_PATTERN, '/$1/[redacted]')
    }
    // Query values and fragments are not required to diagnose render failures.
    // Drop them wholesale so future customer/provider parameters are fail-safe.
    url.search = ''
    url.hash = ''
    return url.origin === location.origin
      ? `${url.pathname}${url.search}${url.hash}`
      : url.toString()
  } catch {
    return '[redacted-url]'
  }
}

export function redactSensitiveText(value: string): string {
  return value
    .replace(/\/(client|prospect)\/[^\s?#/]+/gi, '/$1/[redacted]')
    .replace(
      /\b(access_token|refresh_token|provider_token|provider_refresh_token|token|token_hash|code)=([^&\s#]+)/gi,
      '$1=[redacted]',
    )
    .replace(/\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi, '[redacted-email]')
    .replace(/\beyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\b/g, '[redacted-jwt]')
    .replace(/\bBearer\s+[^\s,;]+/gi, 'Bearer [redacted]')
}
