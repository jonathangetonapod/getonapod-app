import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { appEmailConfigured, sendAppEmail } from './appEmail.ts'

describe('sendAppEmail', () => {
  const env = new Map<string, string>()
  const fetchMock = vi.fn()

  function stubDeno(values: Record<string, string>) {
    env.clear()
    for (const [key, value] of Object.entries(values)) env.set(key, value)
    vi.stubGlobal('Deno', { env: { get: (key: string) => env.get(key) } })
    vi.stubGlobal('fetch', fetchMock)
    fetchMock.mockReset()
  }

  const configured = {
    N8N_EMAIL_WEBHOOK_URL: 'https://n8n.example.test/webhook/goap-email',
    N8N_EMAIL_WEBHOOK_SECRET: 'shared-secret',
  }

  const reply = (status: number, body: unknown) => new Response(JSON.stringify(body), { status })

  afterEach(() => vi.unstubAllGlobals())

  it('skips without calling out when the webhook is not configured', async () => {
    stubDeno({ N8N_EMAIL_WEBHOOK_SECRET: 'shared-secret' })
    expect(appEmailConfigured()).toBe(false)
    await expect(sendAppEmail({ event: 'portal.invite', to: ['a@example.com'], data: {} }))
      .resolves.toMatchObject({ status: 'skipped', reason: 'not_configured' })
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('refuses a webhook that is not https', () => {
    stubDeno({ ...configured, N8N_EMAIL_WEBHOOK_URL: 'http://n8n.example.test/webhook/goap-email' })
    expect(appEmailConfigured()).toBe(false)
  })

  it('posts the event with the shared secret and cleaned recipients and sender', async () => {
    stubDeno(configured)
    fetchMock.mockResolvedValue(reply(200, { status: 'sent', provider_message_id: 'gm_1' }))
    await expect(sendAppEmail({
      event: 'client.booking_confirmed',
      to: ['a@example.com', 'a@example.com', 'not an address'],
      senderName: 'Acme "Pods"\r\nBcc: x@evil.test',
      replyTo: 'bad reply',
      idempotencyKey: 'client-notification:w:c:booking:1:booked',
      data: { show_name: 'The Show' },
    })).resolves.toEqual({ status: 'sent', providerMessageId: 'gm_1', error: null, retryable: false })

    const [url, init] = fetchMock.mock.calls[0]
    expect(url).toBe('https://n8n.example.test/webhook/goap-email')
    expect(init.headers['x-webhook-secret']).toBe('shared-secret')
    expect(JSON.parse(init.body)).toEqual({
      event: 'client.booking_confirmed',
      idempotency_key: 'client-notification:w:c:booking:1:booked',
      to: ['a@example.com'],
      reply_to: null,
      sender_name: 'Acme Pods  Bcc: x@evil.test',
      data: { show_name: 'The Show' },
    })
  })

  it('gives every send its own key when the caller has none', async () => {
    stubDeno(configured)
    fetchMock.mockResolvedValue(reply(200, { status: 'sent', provider_message_id: 'gm_2' }))
    await sendAppEmail({ event: 'portal.password_reset', to: ['a@example.com'], data: {} })
    await sendAppEmail({ event: 'portal.password_reset', to: ['a@example.com'], data: {} })
    const keys = fetchMock.mock.calls.map(([, init]) => JSON.parse(init.body).idempotency_key)
    expect(keys[0]).toMatch(/^portal\.password_reset:/u)
    expect(keys[0]).not.toBe(keys[1])
  })

  it('marks only a 503 as safe to retry', async () => {
    stubDeno(configured)
    fetchMock.mockResolvedValueOnce(reply(503, { status: 'failed', error: 'provider_unavailable' }))
    await expect(sendAppEmail({ event: 'portal.invite', to: ['a@example.com'], data: {} }))
      .resolves.toMatchObject({ status: 'failed', retryable: true })

    for (const status of [400, 401, 409, 502]) {
      fetchMock.mockResolvedValueOnce(reply(status, { status: 'failed', error: 'x' }))
      await expect(sendAppEmail({ event: 'portal.invite', to: ['a@example.com'], data: {} }))
        .resolves.toMatchObject({ status: 'failed', retryable: false })
    }
  })

  it('never treats a timeout as retryable, because the email may have left', async () => {
    stubDeno(configured)
    fetchMock.mockRejectedValue(new DOMException('timed out', 'TimeoutError'))
    await expect(sendAppEmail({ event: 'portal.invite', to: ['a@example.com'], data: {} }))
      .resolves.toMatchObject({ status: 'failed', retryable: false })
  })

  it('does not count a 200 without a sent status as delivered', async () => {
    stubDeno(configured)
    fetchMock.mockResolvedValue(reply(200, { ok: true }))
    await expect(sendAppEmail({ event: 'portal.invite', to: ['a@example.com'], data: {} }))
      .resolves.toMatchObject({ status: 'failed' })
  })

  it('fails without calling out when no recipient is valid', async () => {
    stubDeno(configured)
    await expect(sendAppEmail({ event: 'portal.invite', to: ['nope'], data: {} }))
      .resolves.toMatchObject({ status: 'failed', retryable: false })
    expect(fetchMock).not.toHaveBeenCalled()
  })
})

describe('email leaves only through the n8n workflow', () => {
  const functionsRoot = join(__dirname, '..')

  function sources(dir: string): string[] {
    return readdirSync(dir).flatMap((name) => {
      const path = join(dir, name)
      if (statSync(path).isDirectory()) return sources(path)
      return path.endsWith('.ts') && !path.endsWith('.test.ts') ? [path] : []
    })
  }

  it('has no edge function calling an email provider directly', () => {
    const offenders = sources(functionsRoot)
      .filter((path) => /api\.resend\.com|RESEND_API_KEY|gmail\.googleapis\.com/u.test(readFileSync(path, 'utf8')))
      .map((path) => path.slice(functionsRoot.length + 1))
    expect(offenders).toEqual([])
  })
})
