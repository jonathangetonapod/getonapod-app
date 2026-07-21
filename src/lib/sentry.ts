import * as Sentry from '@sentry/react'
import {
  isSensitiveTelemetryLocation,
  redactSensitiveText,
  redactSensitiveUrl,
} from './sensitiveUrl'

export function sanitizeSentryBreadcrumb(
  breadcrumb: Sentry.Breadcrumb,
  location: Location = window.location,
): Sentry.Breadcrumb | null {
  if (isSensitiveTelemetryLocation(location)) return null

  const category = breadcrumb.category?.toLowerCase() ?? ''
  if (category === 'console' || category === 'dom' || category.startsWith('ui.')) return null

  // Never forward arbitrary integration data. Console arguments, DOM selectors,
  // request bodies, and SDK-specific nested objects can contain customer data.
  const data: Record<string, unknown> = {}
  if (category === 'http') {
    if (typeof breadcrumb.data?.url === 'string') {
      data.url = redactSensitiveUrl(breadcrumb.data.url, location)
    }
    if (typeof breadcrumb.data?.method === 'string') data.method = breadcrumb.data.method
    if (typeof breadcrumb.data?.status_code === 'number') {
      data.status_code = breadcrumb.data.status_code
    }
  } else if (category === 'navigation') {
    if (typeof breadcrumb.data?.from === 'string') {
      data.from = redactSensitiveUrl(breadcrumb.data.from, location)
    }
    if (typeof breadcrumb.data?.to === 'string') {
      data.to = redactSensitiveUrl(breadcrumb.data.to, location)
    }
  }

  return {
    ...breadcrumb,
    message: undefined,
    data: Object.keys(data).length > 0 ? data : undefined,
  }
}

export function sanitizeSentryEvent(
  event: Sentry.ErrorEvent,
  location: Location = window.location,
): Sentry.ErrorEvent | null {
  if (isSensitiveTelemetryLocation(location)) return null
  if (event.request) {
    event.request = event.request.url
      ? { url: redactSensitiveUrl(event.request.url, location) }
      : undefined
  }
  event.contexts = undefined
  event.extra = undefined
  event.tags = undefined
  event.user = event.user?.id ? { id: event.user.id } : undefined
  if (event.message) event.message = 'Application error'
  event.transaction = undefined
  if (event.exception?.values) {
    event.exception.values = event.exception.values.map((value) => ({
      type: 'Error',
      value: value.value ? 'Application exception' : value.value,
      stacktrace: value.stacktrace?.frames
        ? {
            frames: value.stacktrace.frames.map((frame) => ({
              filename: typeof frame.filename === 'string'
                ? redactSensitiveUrl(frame.filename, location)
                : undefined,
              abs_path: typeof frame.abs_path === 'string'
                ? redactSensitiveUrl(frame.abs_path, location)
                : undefined,
              lineno: frame.lineno,
              colno: frame.colno,
              in_app: frame.in_app,
            })),
          }
        : undefined,
    }))
  }
  if (event.breadcrumbs) {
    event.breadcrumbs = event.breadcrumbs
      .map((breadcrumb) => sanitizeSentryBreadcrumb(breadcrumb, location))
      .filter((value): value is Sentry.Breadcrumb => value !== null)
  }
  return event
}

export function initSentry() {
  const sentryDsn = import.meta.env.VITE_SENTRY_DSN

  if (!sentryDsn) {
    console.warn('[Sentry] DSN not configured - error tracking disabled')
    return
  }

  Sentry.init({
    dsn: sentryDsn,
    // Manual capture only. Browser defaults install console/DOM/network
    // breadcrumb collectors even when `integrations: []` is supplied.
    defaultIntegrations: false,
    sendDefaultPii: false,

    // Ignore known noisy errors
    ignoreErrors: [
      // Stripe Buy Button internal race condition - harmless
      /Cannot read properties of undefined \(reading 'payload'\)/,
      // Stripe telemetry blocked by ad blockers
      /Error fetching https:\/\/r\.stripe\.com/,
    ],

    tracesSampleRate: 0,
    replaysSessionSampleRate: 0,
    replaysOnErrorSampleRate: 0,

    // Static release validation uses a dedicated Vite mode. Do not let that
    // implementation detail mislabel real production telemetry.
    environment: import.meta.env.VITE_SENTRY_ENVIRONMENT
      || (import.meta.env.PROD ? 'production' : 'development'),

    // Release tracking
    release: import.meta.env.VITE_SENTRY_RELEASE
      || import.meta.env.VITE_APP_VERSION
      || 'development',

    beforeBreadcrumb(breadcrumb) {
      return sanitizeSentryBreadcrumb(breadcrumb)
    },

    beforeSendTransaction() {
      return null
    },

    // Filter out known errors
    beforeSend(event, hint) {
      const error = hint.originalException

      // Ignore network errors from ad blockers
      if (error && typeof error === 'object' && 'message' in error) {
        const message = String(error.message)
        if (
          message.includes('Failed to fetch') ||
          message.includes('NetworkError') ||
          message.includes('Load failed')
        ) {
          return null
        }
      }

      return sanitizeSentryEvent(event)
    },
  })
}

// Helper to capture exceptions with context
export function captureException(error: Error, _context?: Record<string, unknown>) {
  console.error('[Error]', 'Application error', redactSensitiveText(error.message))

  Sentry.captureException(error)
}

// Helper to capture messages
export function captureMessage(message: string, level: 'info' | 'warning' | 'error' = 'info') {
  // Preserve only severity; caller-supplied text can contain customer data.
  void message
  Sentry.captureMessage('Application message', level)
}

// Set user context when they log in
export function setUser(user: { id: string; email?: string; name?: string } | null) {
  if (user) {
    Sentry.setUser({ id: user.id })
  } else {
    Sentry.setUser(null)
  }
}
