import assert from 'node:assert/strict'

import type { Breadcrumb, ErrorEvent } from '@sentry/react'
import { sanitizeSentryEvent } from '../src/lib/sentry'

function locationFor(value: string): Location {
  const url = new URL(value)
  return {
    href: url.href,
    origin: url.origin,
    pathname: url.pathname,
    search: url.search,
    hash: url.hash,
  } as Location
}

const safeLocation = locationFor('https://app.example.test/app/clients')
const consoleBreadcrumb: Breadcrumb = {
  category: 'console',
  message: 'client object',
  data: {
    arguments: [{ email: 'customer@example.test', clientId: 'private-client-id' }],
  },
}
const navigationBreadcrumb: Breadcrumb = {
  category: 'navigation',
  data: {
    from: '/client/private-capability',
    to: '/app/clients?code=private-code',
    unreviewed: { email: 'customer@example.test' },
  },
}
const event: ErrorEvent = {
  message: 'Failed for customer@example.test at /prospect/private-capability?token=private-token',
  exception: {
    values: [{
      type: 'CustomerError',
      value: 'Customer Name failed',
      stacktrace: {
        frames: [{
          filename: 'https://app.example.test/client/private-capability?token=private-token',
          abs_path: '/prospect/private-capability#private-fragment',
          function: 'customer@example.test',
          vars: { email: 'customer@example.test' },
          pre_context: ['customer@example.test'],
          context_line: 'customer@example.test',
          post_context: ['customer@example.test'],
          lineno: 12,
          colno: 4,
          in_app: true,
        }],
      },
    }],
  },
  breadcrumbs: [consoleBreadcrumb, navigationBreadcrumb],
  contexts: { customer: { email: 'customer@example.test' } },
  extra: { response: { token: 'private-token' } },
  tags: { customer_email: 'customer@example.test' },
  user: { id: 'opaque-user-id', email: 'customer@example.test' },
}

const sanitized = sanitizeSentryEvent(event, safeLocation)
assert.ok(sanitized)
assert.equal(sanitized.breadcrumbs?.some((item) => item.category === 'console'), false)
assert.deepEqual(sanitized.breadcrumbs?.[0]?.data, {
  from: '/client/[redacted]',
  to: '/app/clients',
})
assert.equal(sanitized.message, 'Application error')
assert.deepEqual(sanitized.exception?.values?.[0], {
  type: 'Error',
  value: 'Application exception',
  stacktrace: {
    frames: [{
      filename: '/client/[redacted]',
      abs_path: '/prospect/[redacted]',
      lineno: 12,
      colno: 4,
      in_app: true,
    }],
  },
})
assert.equal(sanitized.contexts, undefined)
assert.equal(sanitized.extra, undefined)
assert.equal(sanitized.tags, undefined)
assert.deepEqual(sanitized.user, { id: 'opaque-user-id' })
assert.equal(
  sanitizeSentryEvent(event, locationFor('https://app.example.test/client/private-capability')),
  null,
)

console.log('Sentry privacy sanitization checks passed')
