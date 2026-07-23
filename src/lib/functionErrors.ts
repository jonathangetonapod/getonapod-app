interface FunctionErrorPayload {
  error?: unknown
  message?: unknown
  code?: unknown
}

function responseHeaderNumber(headers: Headers, name: string): number | undefined {
  const rawValue = headers.get(name)
  if (rawValue === null || rawValue.trim() === '') return undefined
  const value = Number(rawValue)
  return Number.isFinite(value) && value >= 0 ? value : undefined
}

export async function toFunctionError(error: unknown, fallback: string): Promise<Error> {
  let message = error instanceof Error && error.message ? error.message : fallback
  let code: string | null = null
  let status: number | undefined
  let retryAfterSeconds: number | undefined
  let concurrencyLimit: number | undefined
  const context = error && typeof error === 'object'
    ? (error as { context?: unknown }).context
    : null

  if (context instanceof Response) {
    status = context.status
    retryAfterSeconds = responseHeaderNumber(context.headers, 'Retry-After')
    concurrencyLimit = responseHeaderNumber(context.headers, 'X-Concurrency-Limit')
    try {
      const payload = await context.clone().json() as FunctionErrorPayload
      if (typeof payload.error === 'string' && payload.error.trim()) message = payload.error
      else if (typeof payload.message === 'string' && payload.message.trim()) message = payload.message
      if (typeof payload.code === 'string' && payload.code.trim()) code = payload.code
    } catch {
      // Keep the SDK/fallback message when the response is not JSON.
    }
  }

  const result = new Error(message)
  result.name = code || 'EdgeFunctionError'
  Object.assign(result, { status, retryAfterSeconds, concurrencyLimit })
  return result
}
