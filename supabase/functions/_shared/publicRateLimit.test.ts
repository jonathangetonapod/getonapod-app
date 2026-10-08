import { HttpError } from './httpError.ts'
import {
  callerAddress,
  enforcePublicFeedbackRate,
  PUBLIC_RATE_LIMITED_CODE,
  shouldRecordPublicView,
} from './publicRateLimit.ts'

function assertEquals(actual: unknown, expected: unknown, note = ''): void {
  const left = JSON.stringify(actual)
  const right = JSON.stringify(expected)
  if (left !== right) throw new Error(`${note} expected ${right}, received ${left}`)
}

const DASHBOARD = '11111111-1111-4111-8111-111111111111'

function fakeAdmin(result: { data: unknown; error: unknown }) {
  const calls: Array<{ fn: string; args: Record<string, unknown> }> = []
  return {
    calls,
    rpc: (fn: string, args: Record<string, unknown>) => {
      calls.push({ fn, args })
      return Promise.resolve(result)
    },
  }
}

// No address headers, so the hash path (and its env read) is never reached.
const anonymousRequest = () => new Request('https://example.test/', { method: 'POST' })

Deno.test('trusts cf-connecting-ip, then only the last x-forwarded-for hop', () => {
  assertEquals(callerAddress(new Request('https://x.test/', {
    headers: { 'cf-connecting-ip': '203.0.113.9', 'x-forwarded-for': '1.1.1.1, 2.2.2.2' },
  })), '203.0.113.9')
  assertEquals(callerAddress(new Request('https://x.test/', {
    headers: { 'x-forwarded-for': 'spoofed, 198.51.100.4' },
  })), '198.51.100.4')
  assertEquals(callerAddress(new Request('https://x.test/')), null)
})

Deno.test('reserves a dashboard bucket and an address bucket in one call', async () => {
  const admin = fakeAdmin({ data: true, error: null })
  await enforcePublicFeedbackRate(admin, anonymousRequest(), 'client', DASHBOARD)
  assertEquals(admin.calls.length, 1)
  assertEquals(admin.calls[0].fn, 'reserve_public_capability_rate_v1')
  assertEquals(admin.calls[0].args, {
    p_buckets: [`feedback:client:${DASHBOARD}`, 'feedback-ip:unidentified'],
    p_limits: [300, 120],
    p_window_seconds: [3600, 600],
  })
})

Deno.test('a full bucket is a coded 429', async () => {
  const admin = fakeAdmin({ data: false, error: null })
  let caught: unknown = null
  try {
    await enforcePublicFeedbackRate(admin, anonymousRequest(), 'prospect', DASHBOARD)
  } catch (error) {
    caught = error
  }
  if (!(caught instanceof HttpError)) throw new Error('expected an HttpError')
  assertEquals(caught.status, 429)
  assertEquals(caught.code, PUBLIC_RATE_LIMITED_CODE)
})

Deno.test('a broken limiter does not block the write', async () => {
  const admin = fakeAdmin({ data: null, error: { message: 'missing function' } })
  await enforcePublicFeedbackRate(admin, anonymousRequest(), 'client', DASHBOARD)
})

Deno.test('views are deduplicated per dashboard and caller', async () => {
  const seen = fakeAdmin({ data: false, error: null })
  assertEquals(await shouldRecordPublicView(seen, anonymousRequest(), 'client', DASHBOARD), false)
  assertEquals(seen.calls[0].args, {
    p_buckets: [`view:client:${DASHBOARD}:unidentified`],
    p_limits: [1],
    p_window_seconds: [3600],
  })
  const fresh = fakeAdmin({ data: true, error: null })
  assertEquals(await shouldRecordPublicView(fresh, anonymousRequest(), 'client', DASHBOARD), true)
  const broken = fakeAdmin({ data: null, error: { message: 'down' } })
  assertEquals(await shouldRecordPublicView(broken, anonymousRequest(), 'client', DASHBOARD), true)
})
