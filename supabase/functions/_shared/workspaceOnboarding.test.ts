import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  onboardingEmailConfigured,
  sendOnboardingEmail,
  validateOnboardingAnswers,
  validateOnboardingDefinition,
} from './workspaceOnboarding.ts'
import { starterOnboardingTemplate } from '../../../src/components/onboarding/starterTemplate.ts'

const question = (id: string) => ({
  id,
  type: 'short_text',
  label: 'Question',
  description: '',
  required: false,
  placeholder: '',
  mapping: null,
})

const definition = (sections: Array<{ id: string; questions: ReturnType<typeof question>[] }>) => ({
  schema_version: 1,
  intro_title: 'Welcome',
  intro_body: 'Tell us about yourself.',
  completion_message: 'Thank you.',
  sections: sections.map((section) => ({
    ...section,
    title: 'Section',
    description: '',
  })),
})

describe('validateOnboardingDefinition', () => {
  it('allows a section and question to share an id because their namespaces are independent', () => {
    expect(validateOnboardingDefinition(definition([
      { id: 'topics', questions: [question('topics')] },
      { id: 'goals', questions: [question('goals')] },
    ]))).toMatchObject({ schema_version: 1 })
  })

  it('still rejects duplicate section and duplicate question ids', () => {
    expect(() => validateOnboardingDefinition(definition([
      { id: 'duplicate', questions: [question('first')] },
      { id: 'duplicate', questions: [question('second')] },
    ]))).toThrow('section ids must be unique')

    expect(() => validateOnboardingDefinition(definition([
      { id: 'first', questions: [question('duplicate')] },
      { id: 'second', questions: [question('duplicate')] },
    ]))).toThrow('question ids must be unique')
  })
})

describe('validateOnboardingAnswers', () => {
  it('accepts free-form text for email, website, and date questions', () => {
    const freeTextDefinition = validateOnboardingDefinition({
      schema_version: 1,
      intro_title: 'Welcome',
      intro_body: 'Tell us about yourself.',
      completion_message: 'Thank you.',
      sections: [{
        id: 'details',
        title: 'Details',
        description: '',
        questions: [
          { ...question('email'), type: 'email', label: 'Best contact', mapping: 'client.email' },
          { ...question('website'), type: 'url', label: 'Website', mapping: 'client.website' },
          { ...question('date'), type: 'date', label: 'Important date' },
        ],
      }],
    })

    expect(validateOnboardingAnswers(freeTextDefinition, {
      email: 'Call me instead',
      website: 'Search our company name',
      date: 'Sometime next spring',
    }, { requireComplete: true, assets: [] })).toEqual({
      email: 'Call me instead',
      website: 'Search our company name',
      date: 'Sometime next spring',
    })
  })
})

describe('starter onboarding template', () => {
  it('passes the server validator and maps to client fields', () => {
    const validated = validateOnboardingDefinition(starterOnboardingTemplate('Acme Agency').definition)
    const mappings = validated.sections.flatMap((section) => section.questions).map((entry) => entry.mapping).filter(Boolean)
    expect(mappings).toEqual(['client.contact_person', 'client.bio', 'client.website', 'client.linkedin_url', 'client.calendar_link'])
  })
})

describe('sendOnboardingEmail', () => {
  const env = new Map<string, string>()
  const fetchMock = vi.fn()

  function stubDeno(values: Record<string, string>) {
    env.clear()
    for (const [key, value] of Object.entries(values)) env.set(key, value)
    vi.stubGlobal('Deno', { env: { get: (key: string) => env.get(key) } })
    vi.stubGlobal('fetch', fetchMock)
    fetchMock.mockReset()
    fetchMock.mockResolvedValue(new Response(JSON.stringify({ id: 'msg_1' }), { status: 200 }))
  }

  afterEach(() => vi.unstubAllGlobals())

  const input = {
    kind: 'invitation' as const,
    workspaceName: 'Acme Agency',
    recipientName: 'Casey',
    recipientEmail: 'casey@example.com',
    url: 'https://getonapod.com/onboarding/token',
    expiresAt: '2026-10-25T00:00:00.000Z',
  }

  it('reports missing sending setup as not configured instead of a silent skip', async () => {
    stubDeno({ RESEND_API_KEY: 'key' })
    expect(onboardingEmailConfigured()).toBe(false)
    await expect(sendOnboardingEmail(input)).resolves.toMatchObject({ status: 'skipped', reason: 'not_configured' })
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('replies to the agency and speaks in the welcome chosen for the link', async () => {
    stubDeno({ RESEND_API_KEY: 'key', RESEND_FROM_EMAIL: 'Platform <notify@getonapod.com>' })
    expect(onboardingEmailConfigured()).toBe(true)
    await expect(sendOnboardingEmail({
      ...input,
      replyTo: 'hello@acme.test',
      experienceTitle: 'Welcome to Acme',
      experienceBody: 'We are glad to have you.\n\nThis takes ten minutes.',
    })).resolves.toMatchObject({ status: 'sent' })
    const body = JSON.parse(fetchMock.mock.calls[0][1].body)
    expect(body.from).toBe('"Acme Agency" <notify@getonapod.com>')
    expect(body.reply_to).toBe('hello@acme.test')
    expect(body.subject).toBe('Welcome to Acme | Acme Agency')
    expect(body.html).toContain('Welcome to Acme')
    expect(body.html).toContain('This takes ten minutes.')
    expect(body.html).not.toContain('podcast')
    expect(body.text).toContain('We are glad to have you.')
  })

  it('falls back to the fixed wording and omits an invalid reply-to', async () => {
    stubDeno({ RESEND_API_KEY: 'key', RESEND_FROM_EMAIL: 'notify@getonapod.com' })
    await sendOnboardingEmail({ ...input, replyTo: 'not an address' })
    const body = JSON.parse(fetchMock.mock.calls[0][1].body)
    expect(body.reply_to).toBeUndefined()
    expect(body.subject).toBe('Acme Agency invited you to complete onboarding')
    expect(body.html).toContain('podcast guest onboarding')
  })
})
