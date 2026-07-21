interface FunctionErrorPayload {
  error?: unknown
  message?: unknown
  code?: unknown
}

export async function toFunctionError(error: unknown, fallback: string): Promise<Error> {
  let message = error instanceof Error && error.message ? error.message : fallback
  let code: string | null = null
  const context = error && typeof error === 'object'
    ? (error as { context?: unknown }).context
    : null

  if (context instanceof Response) {
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
  return result
}
