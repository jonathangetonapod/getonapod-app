import { beforeEach, describe, expect, it, vi } from 'vitest'

import { requestClipsCut } from './clipsLeads'
import { supabase } from '@/lib/supabase'

vi.mock('@/lib/supabase', () => ({
  supabase: { functions: { invoke: vi.fn() } },
}))

const invoke = vi.mocked(supabase.functions.invoke)

describe('requestClipsCut', () => {
  beforeEach(() => {
    invoke.mockReset()
    invoke.mockResolvedValue({ data: { received: true, startedAt: '2026-10-24T15:00:00.000Z' }, error: null } as never)
  })

  it('sends the three fields, the honeypot, the timer and only the attribution that exists', async () => {
    const receipt = await requestClipsCut({
      name: '  Dana ',
      email: ' Dana@Example.COM ',
      show: ' https://youtu.be/abc123 ',
      website: '',
      elapsedMs: 4321.7,
      attribution: { utm_source: 'newsletter', referrer: 'https://news.example.com/', landing_path: '/clips?utm_source=newsletter' },
    })

    expect(invoke).toHaveBeenCalledWith('clips-lead', {
      body: {
        name: 'Dana',
        email: 'dana@example.com',
        show: 'https://youtu.be/abc123',
        website: '',
        elapsedMs: 4322,
        utm_source: 'newsletter',
        referrer: 'https://news.example.com/',
        landing_path: '/clips?utm_source=newsletter',
      },
    })
    expect(receipt).toEqual({ startedAt: '2026-10-24T15:00:00.000Z' })
  })

  it('surfaces the reason the function refused', async () => {
    invoke.mockResolvedValue({
      data: null,
      error: Object.assign(new Error('Edge Function returned a non-2xx status code'), {
        context: new Response(
          JSON.stringify({ error: 'Paste a YouTube channel or episode link', code: 'INVALID_FIELD' }),
          { status: 400, headers: { 'Content-Type': 'application/json' } },
        ),
      }),
    } as never)

    await expect(requestClipsCut({
      name: 'Dana', email: 'dana@example.com', show: 'https://vimeo.com/1', website: '', elapsedMs: 5000, attribution: {},
    })).rejects.toThrow('Paste a YouTube channel or episode link')
  })

  it('gives the host the mailto line, not the SDK wording, when nothing was reached', async () => {
    invoke.mockResolvedValue({
      data: null,
      error: new Error('Failed to send a request to the Edge Function'),
    } as never)

    await expect(requestClipsCut({
      name: 'Dana', email: 'dana@example.com', show: 'https://youtube.com/@dana', website: '', elapsedMs: 5000, attribution: {},
    })).rejects.toThrow("Something broke on our side. Email jonathan@getonapod.com and we'll start the clock by hand.")
  })
})
