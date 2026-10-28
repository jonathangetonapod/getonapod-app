import { providerException, providerFailure, providerFetch, providerResponseError } from './providerErrors.ts'

function assert(value: unknown, message = 'assertion failed'): asserts value { if (!value) throw new Error(message) }

Deno.test('provider authentication errors name recovery without exposing upstream credentials', () => {
  for (const provider of ['anthropic', 'openai', 'podscan', 'blitz', 'winnr'] as const) {
    for (const status of [401, 403]) {
      const failure = providerFailure(provider, status, { error: { message: 'rejected secret-key-12345' } })
      assert(failure.code === 'PROVIDER_KEY_REJECTED')
      assert(failure.status === 409, 'provider auth must not log the user out')
      assert(failure.message.includes('Provider accounts'))
      assert(!failure.message.includes('secret-key'))
    }
  }
})

Deno.test('Anthropic credit exhaustion differs from unrelated invalid requests', () => {
  const billing = providerFailure('anthropic', 400, { error: { type: 'invalid_request_error', message: 'Your credit balance is too low to access the Anthropic API.' } })
  const invalid = providerFailure('anthropic', 400, { error: { type: 'invalid_request_error', message: 'maximum context length exceeded' } })
  assert(billing.code === 'PROVIDER_BILLING_REQUIRED')
  assert(invalid.code === 'PROVIDER_UNAVAILABLE')
})

Deno.test('OpenAI insufficient quota differs from a transient 429 rate limit', () => {
  assert(providerFailure('openai', 429, { error: { code: 'insufficient_quota' } }).code === 'PROVIDER_BILLING_REQUIRED')
  assert(providerFailure('openai', 429, { error: { code: 'rate_limit_exceeded' } }).code === 'PROVIDER_RATE_LIMITED')
})

Deno.test('other provider account limits and daily quotas retain actionable billing errors', () => {
  assert(providerFailure('blitz', 402).code === 'PROVIDER_BILLING_REQUIRED')
  assert(providerFailure('winnr', 402).code === 'PROVIDER_BILLING_REQUIRED')
  assert(providerFailure('blitz', 423).code === 'PROVIDER_KEY_REJECTED')
  assert(providerFailure('podscan', 429, { error: 'daily_limit_exceeded' }).code === 'PROVIDER_BILLING_REQUIRED')
  assert(providerFailure('podscan', 429, { error: 'concurrency_limit_exceeded' }).code === 'PROVIDER_RATE_LIMITED')
})

Deno.test('provider fetch preserves success and sanitizes HTTP and transport failures', async () => {
  const success = new Response(JSON.stringify({ ok: true }))
  assert(await providerFetch('openai', 'https://provider.test', {}, () => Promise.resolve(success)) === success)
  for (const fetcher of [
    () => Promise.resolve(new Response(JSON.stringify({ error: { code: 'insufficient_quota', message: 'secret-123' } }), { status: 429 })),
    () => Promise.reject(new Error('network error with secret-123')),
  ]) {
    let failure: unknown
    try { await providerFetch('openai', 'https://provider.test', {}, fetcher) } catch (error) { failure = error }
    assert(failure instanceof Error)
    assert(!failure.message.includes('secret-123'))
    assert(failure.message.includes('OpenAI'))
  }
})

Deno.test('malformed and oversized error bodies do not leak into responses', async () => {
  const failure = await providerResponseError('winnr', new Response('private-payload'.repeat(5_000), { status: 500 }))
  assert(failure.code === 'PROVIDER_UNAVAILABLE')
  assert(!failure.message.includes('private-payload'))
})

Deno.test('SDK failures retain their classification without upstream error text', () => {
  const failure = providerException('anthropic', { status: 400, error: { error: { message: 'Your credit balance is too low. secret-key-123' } } })
  assert(failure.code === 'PROVIDER_BILLING_REQUIRED')
  assert(!failure.message.includes('secret-key'))
  assert(providerException('anthropic', failure) === failure)
})
