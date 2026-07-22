import assert from 'node:assert/strict'

import {
  hasSensitiveAuthParameters,
  isSensitiveTelemetryLocation,
  redactSensitiveText,
  redactSensitiveUrl,
} from '../src/lib/sensitiveUrl'

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

const applicationLocation = locationFor('https://app.example.test/app/clients')

assert.equal(
  hasSensitiveAuthParameters(locationFor('https://app.example.test/accept-invite#access_token=secret')),
  true,
)
assert.equal(
  hasSensitiveAuthParameters(locationFor('https://app.example.test/admin/callback?code=secret')),
  true,
)
assert.equal(isSensitiveTelemetryLocation(locationFor('https://app.example.test/client/capability')), true)
assert.equal(isSensitiveTelemetryLocation(locationFor('https://app.example.test/prospect/capability/')), true)
assert.equal(isSensitiveTelemetryLocation(locationFor('https://app.example.test/CLIENT/capability/extra')), true)
assert.equal(isSensitiveTelemetryLocation(locationFor('https://app.example.test/onboarding/private-capability')), true)
assert.equal(isSensitiveTelemetryLocation(locationFor('https://app.example.test/admin/callback/')), true)
assert.equal(isSensitiveTelemetryLocation(applicationLocation), false)

assert.equal(
  redactSensitiveUrl('/client/secret-capability?code=secret', applicationLocation),
  '/client/[redacted]',
)
assert.equal(
  redactSensitiveUrl('/prospect/secret-capability/extra', applicationLocation),
  '/prospect/[redacted]/extra',
)
assert.equal(
  redactSensitiveUrl('/onboarding/instance.generation.secret', applicationLocation),
  '/onboarding/[redacted]',
)
assert.equal(
  redactSensitiveUrl('https://outside.example/prospect/secret#access_token=value', applicationLocation),
  'https://outside.example/prospect/[redacted]',
)
assert.equal(
  redactSensitiveUrl('/app/clients?email=customer@example.test#private', applicationLocation),
  '/app/clients',
)
assert.equal(
  redactSensitiveText('open /client/secret for customer@example.test and token=secret-value'),
  'open /client/[redacted] for [redacted-email] and token=[redacted]',
)
assert.equal(
  redactSensitiveText('continue /onboarding/raw-capability now'),
  'continue /onboarding/[redacted] now',
)

console.log('Sensitive URL redaction checks passed')
