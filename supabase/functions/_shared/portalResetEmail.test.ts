import { webcrypto } from 'node:crypto'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { sendPortalInviteEmail, sendPortalResetEmail } from './portalResetEmail.ts'

const base = { workspaceName: 'Agency', recipientName: 'Client', recipientEmail: 'client@example.test',
  url: 'https://app.example.test/portal/reset?token=capability-one', loginUrl: 'https://app.example.test/portal/login' }
const sent = vi.fn()
beforeEach(() => {
  sent.mockReset().mockImplementation(async () => new Response(JSON.stringify({ status: 'sent', provider_message_id: 'gmail-1' })))
  vi.stubGlobal('fetch', sent)
  vi.stubGlobal('crypto', webcrypto)
  vi.stubGlobal('Deno', { env: { get: (key: string) => ({ N8N_EMAIL_WEBHOOK_URL: 'https://mail.example.test/hook', N8N_EMAIL_WEBHOOK_SECRET: 'test-secret' })[key] } })
})
afterEach(() => vi.unstubAllGlobals())
const key = (index: number) => JSON.parse(sent.mock.calls[index][1].body).idempotency_key

describe('portal mail operation identity', () => {
  it('reuses the persisted capability identity even when branding changes, without exposing its token', async () => {
    await sendPortalInviteEmail(base)
    await sendPortalInviteEmail({ ...base, workspaceName: 'Renamed agency' })
    expect(key(0)).toBe(key(1))
    expect(key(0)).not.toContain('capability-one')
    expect(key(0)).toMatch(/^portal-invite:[0-9a-f]{64}$/u)
  })
  it('distinguishes separately issued recovery capabilities and mail purposes', async () => {
    await sendPortalResetEmail(base)
    await sendPortalResetEmail({ ...base, url: base.url.replace('capability-one', 'capability-two') })
    await sendPortalInviteEmail(base)
    expect(new Set([key(0), key(1), key(2)]).size).toBe(3)
  })
  it('preserves uncertain delivery instead of issuing another capability or retrying', async () => {
    sent.mockResolvedValue(new Response(JSON.stringify({ code: 'DELIVERY_UNCONFIRMED' }), { status: 409 }))
    await expect(sendPortalResetEmail(base)).resolves.toMatchObject({ status: 'unknown' })
    expect(sent).toHaveBeenCalledTimes(1)
  })
})
