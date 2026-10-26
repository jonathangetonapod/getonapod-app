import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  onboardingEmailConfigured,
  prefillOnboardingAnswers,
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

  const configured = {
    N8N_EMAIL_WEBHOOK_URL: 'https://n8n.example.test/webhook/goap-email',
    N8N_EMAIL_WEBHOOK_SECRET: 'secret',
  }

  it('reports missing sending setup as not configured instead of a silent skip', async () => {
    stubDeno({ N8N_EMAIL_WEBHOOK_URL: 'https://n8n.example.test/webhook/goap-email' })
    expect(onboardingEmailConfigured()).toBe(false)
    await expect(sendOnboardingEmail(input)).resolves.toMatchObject({ status: 'skipped', reason: 'not_configured' })
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('replies to the agency and hands over the welcome chosen for the link', async () => {
    stubDeno(configured)
    fetchMock.mockResolvedValue(new Response(JSON.stringify({ status: 'sent', provider_message_id: 'gm_1' }), { status: 200 }))
    expect(onboardingEmailConfigured()).toBe(true)
    await expect(sendOnboardingEmail({
      ...input,
      replyTo: 'hello@acme.test',
      experienceTitle: 'Welcome to Acme',
      experienceBody: 'We are glad to have you.\n\nThis takes ten minutes.',
      reminder: true,
    })).resolves.toMatchObject({ status: 'sent', providerMessageId: 'gm_1' })
    const body = JSON.parse(fetchMock.mock.calls[0][1].body)
    expect(body).toMatchObject({
      event: 'onboarding.invitation',
      to: ['casey@example.com'],
      reply_to: 'hello@acme.test',
      sender_name: 'Acme Agency',
      data: {
        workspace_name: 'Acme Agency',
        recipient_name: 'Casey',
        url: 'https://getonapod.com/onboarding/token',
        expires_on: 'October 25, 2026',
        accent_color: '#665CF2',
        custom_title: 'Welcome to Acme',
        custom_body: 'We are glad to have you.\n\nThis takes ten minutes.',
        reminder: true,
      },
    })
  })

  it('omits an invalid reply-to and leaves the fixed wording to the workflow', async () => {
    stubDeno(configured)
    fetchMock.mockResolvedValue(new Response(JSON.stringify({ status: 'sent', provider_message_id: 'gm_2' }), { status: 200 }))
    await sendOnboardingEmail({ ...input, replyTo: 'not an address' })
    const body = JSON.parse(fetchMock.mock.calls[0][1].body)
    expect(body.reply_to).toBeNull()
    expect(body.data.custom_title).toBeNull()
    expect(body.data.custom_body).toBeNull()
  })

  it('sends a change request as its own event without the welcome copy', async () => {
    stubDeno(configured)
    fetchMock.mockResolvedValue(new Response(JSON.stringify({ status: 'sent', provider_message_id: 'gm_3' }), { status: 200 }))
    await sendOnboardingEmail({ ...input, kind: 'changes_requested', experienceTitle: 'Ignored', accentColor: '#12ab34' })
    const body = JSON.parse(fetchMock.mock.calls[0][1].body)
    expect(body.event).toBe('onboarding.changes_requested')
    expect(body.data.accent_color).toBe('#12AB34')
    expect(body.data).not.toHaveProperty('custom_title')
  })
})

describe('prefillOnboardingAnswers', () => {
  const field = (id: string, type: string, mapping: string | null) => ({ ...question(id), type, mapping })
  const form = validateOnboardingDefinition(definition([{
    id: 'basics',
    questions: [
      field('full_name', 'short_text', 'client.name'),
      field('email', 'email', 'client.email'),
      field('company', 'short_text', null),
      field('website', 'url', 'client.website'),
      field('linkedin_url', 'url', 'client.linkedin_url'),
      field('bio', 'long_text', 'client.bio'),
    ] as never,
  }]))

  it('fills the contact, company and links the operator already has', () => {
    expect(prefillOnboardingAnswers(form, {
      recipientName: ' Jane Smith ',
      recipientEmail: 'jane@example.com',
      clientName: 'Acme',
      website: 'https://acme.example',
      linkedinUrl: 'linkedin.com/in/jane',
    })).toEqual({
      full_name: 'Jane Smith',
      email: 'jane@example.com',
      company: 'Acme',
      website: 'https://acme.example',
    })
  })

  it('leaves out anything empty', () => {
    expect(prefillOnboardingAnswers(form, {
      recipientName: '',
      recipientEmail: 'jane@example.com',
      clientName: null,
      website: null,
      linkedinUrl: null,
    })).toEqual({ email: 'jane@example.com' })
  })
})
