import { HttpError } from './httpError.ts'

export type ProviderName = 'anthropic' | 'openai' | 'openai-platform' | 'podscan' | 'blitz' | 'winnr'
export type ProviderRuntimeCode = 'PROVIDER_KEY_REJECTED' | 'PROVIDER_BILLING_REQUIRED' | 'PROVIDER_RATE_LIMITED' | 'PROVIDER_UNAVAILABLE' | 'PLATFORM_PROVIDER_ACTION_REQUIRED'

const LABELS: Record<ProviderName, string> = {
  anthropic: 'Anthropic', openai: 'OpenAI', 'openai-platform': 'OpenAI', podscan: 'Podscan', blitz: 'Blitz', winnr: 'Winnr',
}

// Examine only bounded diagnostic fields. Upstream bodies, request IDs, URLs,
// prompts and credentials are never included in the error we return or log.
function diagnostic(value: unknown, depth = 0): string {
  if (typeof value === 'string') return value.slice(0, 2_000).toLowerCase()
  if (!value || typeof value !== 'object' || Array.isArray(value) || depth > 2) return ''
  const record = value as Record<string, unknown>
  return ['code', 'type', 'message', 'error'].map((key) => diagnostic(record[key], depth + 1)).join(' ')
}

export function providerFailure(provider: ProviderName, status?: number, payload?: unknown): HttpError {
  const label = LABELS[provider]
  const detail = diagnostic(payload)
  const billing = status === 402 || /insufficient_quota|billing_hard_limit|billing_not_active|credit balance.{0,40}(?:too low|insufficient)|insufficient.{0,20}(?:credits|funds|balance)|(?:out of|no remaining).{0,20}credits|(?:daily|per_day)_limit_exceeded/u.test(detail)
  if (provider !== 'anthropic' && provider !== 'openai' && (billing || status === 401 || status === 403 || provider === 'blitz' && status === 423)) {
    return new HttpError(503, 'PLATFORM_PROVIDER_ACTION_REQUIRED', `${label} needs attention from the platform administrator. Contact support; you do not need to supply a ${label} key.`)
  }
  if (billing) return new HttpError(402, 'PROVIDER_BILLING_REQUIRED', `${label} needs billing attention. Add funds or review your plan and usage limits in your ${label} account, then try again.`)
  if (status === 401 || status === 403 || provider === 'blitz' && status === 423) {
    return new HttpError(409, 'PROVIDER_KEY_REJECTED', `${label} rejected the saved API key or its permissions. Update the ${label} key in Billing → Provider accounts, then try again.`)
  }
  if (status === 429 || /rate_limit_(?:error|exceeded)|per_minute_limit_exceeded|concurrency_limit_exceeded/u.test(detail)) {
    return new HttpError(429, 'PROVIDER_RATE_LIMITED', `${label} is limiting requests. Wait a moment, then try again. Your saved key has not been removed.`)
  }
  return new HttpError(503, 'PROVIDER_UNAVAILABLE', `${label} could not complete this request. Try again shortly; if it continues, contact support.`)
}

export function isProviderRuntimeError(error: unknown): error is HttpError {
  return error instanceof HttpError && ['PROVIDER_KEY_REJECTED', 'PROVIDER_BILLING_REQUIRED', 'PROVIDER_RATE_LIMITED', 'PROVIDER_UNAVAILABLE', 'PLATFORM_PROVIDER_ACTION_REQUIRED'].includes(error.code)
}

/** Normalize SDK failures without returning their raw request/response text. */
export function providerException(provider: ProviderName, error: unknown): HttpError {
  if (isProviderRuntimeError(error)) return error
  const value = error && typeof error === 'object' ? error as Record<string, unknown> : {}
  return providerFailure(provider, typeof value.status === 'number' ? value.status : undefined, value.error ?? value)
}

async function readErrorPayload(response: Response): Promise<unknown> {
  const reader = response.body?.getReader()
  if (!reader) return null
  let bytes = 0
  let raw = ''
  const decoder = new TextDecoder()
  try {
    while (bytes < 16_384) {
      const { done, value } = await reader.read()
      if (done) break
      const chunk = value.subarray(0, 16_384 - bytes)
      bytes += chunk.length
      raw += decoder.decode(chunk, { stream: true })
    }
    raw += decoder.decode()
    try { return JSON.parse(raw) } catch { return null }
  } catch {
    return null
  } finally {
    await reader.cancel().catch(() => undefined)
  }
}

export async function providerResponseError(provider: ProviderName, response: Response): Promise<HttpError> {
  return providerFailure(provider, response.status, await readErrorPayload(response))
}

/** Fetch provider work without exposing upstream messages or credential data. */
export async function providerFetch(provider: ProviderName, input: RequestInfo | URL, init?: RequestInit, fetcher: typeof fetch = fetch): Promise<Response> {
  let response: Response
  try {
    response = await fetcher(input, init)
  } catch {
    throw providerFailure(provider)
  }
  if (!response.ok) throw await providerResponseError(provider, response)
  return response
}
