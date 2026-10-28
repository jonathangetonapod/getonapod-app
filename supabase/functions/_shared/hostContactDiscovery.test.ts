import { assertEquals, assertRejects } from 'jsr:@std/assert@1'
import { discoverHostLinkedin, findBlitzEmail, linkedinProfileUrl } from './hostContactDiscovery.ts'
import { HttpError } from './httpError.ts'

const profile = 'https://www.linkedin.com/in/example-host'
const usage = () => ({ input: 0, output: 0, searches: 0 })
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status })
const evidence = { type: 'web_search_tool_result', content: [{ type: 'web_search_result', url: profile }] }

Deno.test('accepts only personal LinkedIn URLs and strips tracking', () => {
  assertEquals(linkedinProfileUrl(`${profile}/?trk=search`), profile)
  assertEquals(linkedinProfileUrl('https://uk.linkedin.com/in/example-host'), profile)
  for (const url of ['https://linkedin.com/company/test', 'https://linkedin.com.evil.test/in/test',
    'https://me:secret@linkedin.com/in/test', 'http://linkedin.com/in/test',
    'https://linkedin.com:444/in/test', 'https://linkedin.com/in/test/posts', 'null']) {
    assertEquals(linkedinProfileUrl(url), null)
  }
})

Deno.test('discovers a grounded URL using Sonnet 5.5 and the supplied key', async () => {
  const tally = usage()
  const result = await discoverHostLinkedin('workspace-key', { publisher_not_confirmed_host: 'Publisher' }, tally,
    async (url, init) => {
      assertEquals(url, 'https://api.anthropic.com/v1/messages')
      assertEquals(new Headers(init?.headers).get('x-api-key'), 'workspace-key')
      const body = JSON.parse(String(init?.body))
      assertEquals(body.model, 'claude-sonnet-5-5')
      assertEquals(body.thinking.type, 'between_tools')
      assertEquals(body.tools[0].name, 'web_search')
      assertEquals(body.temperature, undefined)
      return json({ content: [{ type: 'text', text: 'Searching…' }, evidence, { type: 'text', text: profile }],
        stop_reason: 'end_turn', usage: { input_tokens: 20, output_tokens: 10, server_tool_use: { web_search_requests: 2 } } })
    })
  assertEquals(result, profile)
  assertEquals(tally, { input: 20, output: 10, searches: 2 })
})

Deno.test('does not accept hallucinated profiles or company pages', async () => {
  for (const answer of ['https://www.linkedin.com/in/not-in-results', 'https://www.linkedin.com/company/show', `Ambiguous: ${profile} and https://www.linkedin.com/in/second-host`]) {
    await assertRejects(() => discoverHostLinkedin('key', {}, usage(), () => Promise.resolve(json({
      content: [evidence, { type: 'text', text: answer }], stop_reason: 'end_turn',
    }))), HttpError, 'supported by its search results')
  }
})

Deno.test('a searched null is a legitimate miss', async () => {
  assertEquals(await discoverHostLinkedin('key', {}, usage(), () => Promise.resolve(json({
    content: [evidence, { type: 'text', text: 'null' }], stop_reason: 'end_turn',
  }))), null)
})

Deno.test('provider errors and truncated responses are not misses', async () => {
  for (const payload of [
    { content: [{ type: 'web_search_tool_result', content: { type: 'web_search_tool_result_error', error_code: 'unavailable' } }, { type: 'text', text: 'null' }], stop_reason: 'end_turn' },
    { content: [evidence, { type: 'text', text: profile }], stop_reason: 'max_tokens' },
    { content: [{ type: 'text', text: 'null' }], stop_reason: 'end_turn' },
  ]) {
    await assertRejects(() => discoverHostLinkedin('key', {}, usage(), () => Promise.resolve(json(payload))), HttpError)
  }
})

Deno.test('continues paused server-tool turns with original evidence', async () => {
  let calls = 0
  assertEquals(await discoverHostLinkedin('key', {}, usage(), (_url, init) => {
    calls += 1
    if (calls === 1) return Promise.resolve(json({ content: [evidence], stop_reason: 'pause_turn' }))
    const body = JSON.parse(String(init?.body))
    assertEquals(body.messages[1], { role: 'assistant', content: [evidence] })
    return Promise.resolve(json({ content: [{ type: 'text', text: profile }], stop_reason: 'end_turn' }))
  }), profile)
  assertEquals(calls, 2)
})

Deno.test('Blitz receives a profile URL and returns a verified work email', async () => {
  assertEquals(await findBlitzEmail('blitz-key', profile, async (url, init) => {
    assertEquals(url, 'https://api.blitz-api.ai/v2/enrichment/email')
    assertEquals(new Headers(init?.headers).get('x-api-key'), 'blitz-key')
    assertEquals(JSON.parse(String(init?.body)), { person_linkedin_url: profile })
    return json({ found: true, email: 'Host@Example.com' })
  }), 'host@example.com')
})

Deno.test('Blitz found false is distinct from outages, limits and malformed results', async () => {
  assertEquals(await findBlitzEmail('key', profile, () => Promise.resolve(json({ found: false, email: null }))), null)
  for (const status of [401, 402, 404, 422, 423, 429, 503]) {
    await assertRejects(() => findBlitzEmail('key', profile, () => Promise.resolve(json({}, status))), HttpError)
  }
  for (const payload of [{}, { found: true, email: 'invalid' }, { found: false, email: 'host@example.com' }]) {
    await assertRejects(() => findBlitzEmail('key', profile, () => Promise.resolve(json(payload))), HttpError)
  }
})

Deno.test('normalizes a single grounded URL despite extra model narration', async () => {
  assertEquals(await discoverHostLinkedin('key', {}, usage(), () => Promise.resolve(json({
    content: [evidence, { type: 'text', text: `The recurring host is supported by the show credits.\n\n${profile}/` }], stop_reason: 'end_turn',
  }))), profile)
})

Deno.test('host discovery preserves actionable sanitized provider failures', async () => {
  const rejected = await assertRejects(() => discoverHostLinkedin('private-key', {}, usage(),
    () => Promise.resolve(json({ error: { message: 'Your credit balance is too low private-key' } }, 400))), HttpError)
  assertEquals(rejected.code, 'PROVIDER_BILLING_REQUIRED')
  assertEquals(rejected.message.includes('private-key'), false)
  for (const [status, code] of [[401, 'PROVIDER_KEY_REJECTED'], [402, 'PROVIDER_BILLING_REQUIRED'], [429, 'PROVIDER_RATE_LIMITED'], [503, 'PROVIDER_UNAVAILABLE']] as const) {
    const failure = await assertRejects(() => findBlitzEmail('private-key', profile,
      () => Promise.resolve(json({ message: 'private-key' }, status))), HttpError)
    assertEquals(failure.code, code)
    assertEquals(failure.message.includes('Blitz'), true)
    assertEquals(failure.message.includes('private-key'), false)
  }
})
