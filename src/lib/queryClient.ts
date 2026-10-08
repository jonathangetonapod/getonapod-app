import { QueryClient } from '@tanstack/react-query'

const MAX_QUERY_RETRIES = 1

// Retry only failures another attempt can fix: network errors, 5xx, timeouts
// and rate limits. A 4xx refusal (bad input, no access, not enough credits)
// gives the same answer every time, and repeating a read against a metered
// edge function can spend credits again.
export const shouldRetryQuery = (failureCount: number, error: unknown): boolean => {
  if (failureCount >= MAX_QUERY_RETRIES) return false
  const status = error && typeof error === 'object'
    ? (error as { status?: unknown }).status
    : undefined
  if (typeof status !== 'number') return true
  return status >= 500 || [408, 425, 429].includes(status)
}

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: { retry: shouldRetryQuery },
    mutations: { retry: false },
  },
})
