import { assertEquals, assertMatch } from 'jsr:@std/assert@1'
import { runAiStepProbe } from './aiStepProbes.ts'

type Reply = { status?: number; text?: string; stop_reason?: string }

/** Answers every provider call with `reply` and records the request bodies. */
const withProvider = async (reply: Reply | ((body: Record<string, unknown>) => Reply), run: (bodies: Array<Record<string, unknown>>) => Promise<void>) => {
  const original = globalThis.fetch
  const bodies: Array<Record<string, unknown>> = []
  globalThis.fetch = (async (_url: string | URL | Request, init?: RequestInit) => {
    const body = JSON.parse(String(init?.body)) as Record<string, unknown>
    bodies.push(body)
    const answer = typeof reply === 'function' ? reply(body) : reply
    if (answer.status && answer.status >= 400) {
      return new Response(JSON.stringify({ type: 'error', error: { type: 'invalid_request_error', message: 'thinking.type: unsupported for this model' } }), { status: answer.status })
    }
    return Response.json({
      content: answer.text === undefined ? [] : [{ type: 'text', text: answer.text }],
      stop_reason: answer.stop_reason ?? 'end_turn',
      usage: { input_tokens: 10, output_tokens: 10 },
    })
  }) as typeof fetch
  try {
    await run(bodies)
  } finally {
    globalThis.fetch = original
  }
}

Deno.test('a stage probe sends the stage\'s real output limit and thinking setting for the chosen model', async () => {
  await withProvider({ text: 'Dana Whitfield' }, async (bodies) => {
    const result = await runAiStepProbe('key', 'host_name_extractor', 'claude-sonnet-5-5')
    assertEquals(result.ok, true)
    assertEquals(result.model, 'claude-sonnet-5-5')
    assertEquals(bodies[0].max_tokens, 50)
    assertEquals(bodies[0].thinking, { type: 'between_tools' })
  })
  await withProvider({ text: 'Dana Whitfield' }, async (bodies) => {
    await runAiStepProbe('key', 'host_name_extractor', 'claude-opus-5-5')
    // Opus 5.5 rejects any explicit thinking setting, so none is sent.
    assertEquals('thinking' in bodies[0], false)
  })
})

Deno.test('a model that spends its whole limit thinking fails with a reason a person can act on', async () => {
  await withProvider({ stop_reason: 'max_tokens' }, async () => {
    const result = await runAiStepProbe('key', 'autopilot', 'claude-opus-5-5')
    assertEquals(result.ok, false)
    assertMatch(result.detail, /output limit/u)
  })
})

Deno.test('a provider rejection is reported, not thrown', async () => {
  await withProvider({ status: 400 }, async () => {
    const result = await runAiStepProbe('key', 'fit_scoring', 'claude-sonnet-5-5')
    assertEquals(result.ok, false)
    assertEquals(typeof result.detail, 'string')
  })
})

Deno.test('pitch stages must return the pitch JSON the stage parses', async () => {
  await withProvider({ text: 'Hi Dana, here is a pitch in prose.' }, async () => {
    const result = await runAiStepProbe('key', 'write_email', 'claude-sonnet-5-5')
    assertEquals(result.ok, false)
    assertEquals(result.code, 'FORMAT')
  })
  await withProvider({ text: '{"subject":"S","email_1":"Hi Dana","follow_up_1":"","follow_up_2":""}' }, async () => {
    assertEquals((await runAiStepProbe('key', 'write_email', 'claude-sonnet-5-5')).ok, true)
  })
})

Deno.test('fit scoring needs a readable score for every show', async () => {
  await withProvider({ text: '[{"id":"probe-show-1","score":9,"reasoning":"fit"}]' }, async () => {
    assertEquals((await runAiStepProbe('key', 'fit_scoring', 'claude-sonnet-5-5')).ok, false)
  })
  await withProvider({
    text: '[{"id":"probe-show-1","score":9,"reasoning":"fit"},{"id":"probe-show-2","score":1,"reasoning":"no"}]',
  }, async () => {
    const result = await runAiStepProbe('key', 'fit_scoring', 'claude-sonnet-5-5')
    assertEquals(result.ok, true)
    assertMatch(result.detail, /Garden Hour: 1/u)
  })
})

Deno.test('the fact-check reports whether it caught the planted claim', async () => {
  await withProvider({ text: '{"unsupported":[{"claim":"won the Nobel Prize","problem":"not in evidence"}]}' }, async () => {
    const result = await runAiStepProbe('key', 'pitch_fact_check', 'claude-sonnet-5-5')
    assertEquals(result.ok, true)
    assertMatch(result.detail, /Caught/u)
  })
  await withProvider({ text: '{"unsupported":[]}' }, async () => {
    const result = await runAiStepProbe('key', 'pitch_fact_check', 'claude-sonnet-5-5')
    assertEquals(result.ok, true)
    assertMatch(result.detail, /missed/u)
  })
})

Deno.test('Haiku 5.5 is told not to think, so a 50-token step still has room to answer', async () => {
  await withProvider({ text: 'Dana Whitfield' }, async (bodies) => {
    const result = await runAiStepProbe('key', 'host_name_extractor', 'claude-haiku-5-5')
    assertEquals(result.ok, true)
    assertEquals(bodies[0].thinking, { type: 'disabled' })
  })
})

Deno.test('an empty research answer explains the likely cause', async () => {
  await withProvider({ stop_reason: 'max_tokens' }, async () => {
    const result = await runAiStepProbe('key', 'host_name_extractor', 'claude-opus-5-5')
    assertEquals(result.ok, false)
    assertMatch(result.detail, /output limit/u)
  })
})
