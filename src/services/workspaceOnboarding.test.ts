import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  approveOnboardingAnswers,
  checkOnboardingEmailDelivery,
  hasPendingOnboardingEmail,
  getClientOnboarding,
  getOnboardingLink,
  listWorkspaceOnboarding,
  resendOnboardingInvitation,
  requestOnboardingChanges,
  retryOnboardingEmail,
  rotateOnboardingLink,
  saveClientOnboarding,
  startWorkspaceOnboarding,
  type OnboardingDefinition,
} from '@/services/workspaceOnboarding'

const { invoke } = vi.hoisted(() => ({ invoke: vi.fn() }))
vi.mock('@/lib/supabase', () => ({ supabase: { functions: { invoke } } }))

const workspaceId = '11111111-1111-4111-8111-111111111111'
const otherWorkspaceId = '22222222-2222-4222-8222-222222222222'
const templateId = '33333333-3333-4333-8333-333333333333'
const versionId = '44444444-4444-4444-8444-444444444444'
const instanceId = '55555555-5555-4555-8555-555555555555'
const clientId = '66666666-6666-4666-8666-666666666666'

const definition: OnboardingDefinition = {
  schema_version: 1,
  intro_title: 'Welcome',
  intro_body: 'Tell us about yourself.',
  completion_message: 'Thanks.',
  sections: [{
    id: 'basics',
    title: 'Basics',
    description: '',
    questions: [{
      id: 'full_name',
      type: 'short_text',
      label: 'Full name',
      description: '',
      required: true,
      placeholder: '',
      mapping: 'client.name',
    }],
  }],
}

const summary = {
  id: instanceId,
  workspace_id: workspaceId,
  client_id: clientId,
  template_version_id: versionId,
  template_id: templateId,
  template_name: 'Guest intake',
  template_version: 1,
  client_name: 'Client One',
  recipient_name: 'Casey Client',
  recipient_email: 'casey@example.com',
  status: 'invited',
  capability_generation: 1,
  capability_expires_at: '2026-08-05T00:00:00.000Z',
  current_revision: 0,
  created_at: '2026-07-22T00:00:00.000Z',
  updated_at: '2026-07-22T00:00:00.000Z',
  invited_at: '2026-07-22T00:00:00.000Z',
  viewed_at: null,
  started_at: null,
  submitted_at: null,
  changes_requested_at: null,
  approved_at: null,
  revoked_at: null,
  archived_at: null,
  progress_section: 0,
  draft_lock_version: 0,
  open_comment_count: 0,
  profile_status: null,
}

const detail = {
  ...summary,
  definition,
  answers: {},
  revisions: [],
  comments: [],
  profile: null,
  assets: [],
  assigned_membership_ids: [],
}

const listResponse = {
  workspace: { id: workspaceId, name: 'Agency', logo_path: null, logo_updated_at: null },
  viewer_role: 'owner',
  can_manage: true,
  templates: [{
    id: templateId,
    workspace_id: workspaceId,
    name: 'Guest intake',
    description: '',
    status: 'published',
    definition,
    reminder_days: [],
    published_version: 1,
    is_default: true,
    created_at: '2026-07-22T00:00:00.000Z',
    updated_at: '2026-07-22T00:00:00.000Z',
    archived_at: null,
  }],
  clients: [],
  assignable_members: [],
  instances: [summary],
}

describe('workspaceOnboarding service', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    localStorage.clear()
  })

  it('normalizes the selected workspace and rejects cross-workspace rows', async () => {
    invoke.mockResolvedValueOnce({ data: listResponse, error: null })
    await expect(listWorkspaceOnboarding(workspaceId.toUpperCase())).resolves.toMatchObject({
      workspace: { id: workspaceId },
      instances: [{ id: instanceId }],
    })
    expect(invoke).toHaveBeenCalledWith('workspace-onboarding', {
      body: { action: 'list', workspace_id: workspaceId },
    })

    invoke.mockResolvedValueOnce({
      data: { ...listResponse, instances: [{ ...summary, workspace_id: otherWorkspaceId }] },
      error: null,
    })
    await expect(listWorkspaceOnboarding(workspaceId)).rejects.toThrow(
      'The onboarding response did not match the workspace.',
    )
  })

  it('creates one scoped invitation without requesting platform email delivery', async () => {
    invoke.mockResolvedValueOnce({
      data: {
        instance: detail,
        onboarding_url: 'https://getonapod.com/onboarding/redacted-test-token',
        delivery: { status: 'skipped' },
      },
      error: null,
    })
    const input = {
      template_id: templateId,
      client_id: clientId,
      new_client: null,
      recipient_name: 'Casey Client',
      recipient_email: 'casey@example.com',
      expires_in_days: 14,
      assigned_membership_ids: [],
      experience: {
        intro_title: 'Welcome, Casey',
        intro_body: 'Tell Agency about yourself.',
        completion_message: 'Thanks. Agency will review this.',
        accent_color: '#0F766E',
      },
    }
    await expect(startWorkspaceOnboarding(workspaceId, input)).resolves.toMatchObject({
      delivery: { status: 'skipped' },
      onboarding_url: expect.stringContaining('/onboarding/'),
    })
    expect(invoke).toHaveBeenCalledWith('workspace-onboarding', {
      body: {
        action: 'start',
        workspace_id: workspaceId,
        ...input,
        send_email: false,
        experience: {
          ...input.experience,
          brand_logo: null,
        },
      },
    })
  })

  it('asks only for the sections a caller needs and reads the email setup', async () => {
    invoke.mockResolvedValueOnce({
      data: {
        ...listResponse,
        workspace: { ...listResponse.workspace, client_contact_email: 'hello@agency.test', client_brand_accent_color: '#c7794f' },
        templates: [],
        clients: [],
        email_delivery: { configured: false },
        instances: [{ ...summary, delivery: { kind: 'invitation', status: 'unknown', last_error: null, attempted_at: null, sent_at: null } }],
      },
      error: null,
    })
    await expect(listWorkspaceOnboarding(workspaceId, ['instances'])).resolves.toMatchObject({
      workspace: { client_contact_email: 'hello@agency.test', client_brand_accent_color: '#C7794F' },
      email_delivery: { configured: false },
      instances: [{ delivery: { status: 'unknown' } }],
    })
    expect(invoke).toHaveBeenCalledWith('workspace-onboarding', {
      body: { action: 'list', workspace_id: workspaceId, include: ['instances'] },
    })
  })

  it('sends the idempotency key with a start and reports a replay and a duplicate client', async () => {
    invoke.mockResolvedValueOnce({
      data: {
        instance: detail,
        onboarding_url: 'https://getonapod.com/onboarding/redacted-test-token',
        delivery: { status: 'skipped', reason: 'not_configured' },
        replayed: true,
        duplicate_client: { id: clientId, name: 'Client One' },
      },
      error: null,
    })
    const key = '77777777-7777-4777-8777-777777777777'
    await expect(startWorkspaceOnboarding(workspaceId, {
      template_id: templateId,
      client_id: null,
      new_client: { name: 'Client Two', email: 'casey@example.com' },
      recipient_name: 'Casey Client',
      recipient_email: 'casey@example.com',
      expires_in_days: 14,
      assigned_membership_ids: [],
      send_email: true,
      idempotency_key: key.toUpperCase(),
      experience: {
        intro_title: 'Welcome',
        intro_body: 'Hello.',
        completion_message: 'Thanks.',
        accent_color: '#0F766E',
      },
    })).resolves.toMatchObject({
      replayed: true,
      delivery: { status: 'skipped', reason: 'not_configured' },
      duplicate_client: { id: clientId, name: 'Client One' },
    })
    expect(invoke.mock.calls[0][1].body).toMatchObject({ action: 'start', idempotency_key: key, send_email: true })
  })

  it('resends the current link and rotates with an email only when asked', async () => {
    invoke
      .mockResolvedValueOnce({ data: { instance: detail, onboarding_url: 'https://getonapod.com/onboarding/a', delivery: { status: 'sent' } }, error: null })
      .mockResolvedValueOnce({ data: { instance: detail, onboarding_url: 'https://getonapod.com/onboarding/b', delivery: { status: 'failed' } }, error: null })
      .mockResolvedValueOnce({ data: { instance: detail, onboarding_url: 'https://getonapod.com/onboarding/c' }, error: null })

    await expect(resendOnboardingInvitation(workspaceId, instanceId)).resolves.toMatchObject({ delivery: { status: 'sent' } })
    await expect(rotateOnboardingLink(workspaceId, instanceId, 14, true)).resolves.toMatchObject({ delivery: { status: 'failed' } })
    await rotateOnboardingLink(workspaceId, instanceId, 14)

    expect(invoke).toHaveBeenNthCalledWith(1, 'workspace-onboarding', {
      body: { action: 'resend_invitation', workspace_id: workspaceId, instance_id: instanceId, operation_id: expect.any(String) },
    })
    expect(invoke).toHaveBeenNthCalledWith(2, 'workspace-onboarding', {
      body: { action: 'rotate', workspace_id: workspaceId, instance_id: instanceId, expires_in_days: 14, send_email: true, operation_id: expect.any(String) },
    })
    expect(invoke).toHaveBeenNthCalledWith(3, 'workspace-onboarding', {
      body: { action: 'rotate', workspace_id: workspaceId, instance_id: instanceId, expires_in_days: 14, send_email: false },
    })
  })

  it('reuses a reminder operation after a lost response, then reserves a new ID for the next intentional send', async () => {
    invoke.mockRejectedValueOnce(new Error('Network disconnected'))
    await expect(resendOnboardingInvitation(workspaceId, instanceId)).rejects.toThrow('Network disconnected')
    const first = invoke.mock.calls[0][1].body.operation_id
    expect(hasPendingOnboardingEmail(workspaceId, instanceId)).toBe(true)
    invoke.mockResolvedValue({ data: { delivery: { status: 'sent', operation_id: first } }, error: null })
    await expect(resendOnboardingInvitation(workspaceId, instanceId)).resolves.toMatchObject({ delivery: { status: 'sent', operation_id: first } })
    expect(invoke.mock.calls[1][1].body.operation_id).toBe(first)
    expect(hasPendingOnboardingEmail(workspaceId, instanceId)).toBe(false)
    await resendOnboardingInvitation(workspaceId, instanceId)
    expect(invoke.mock.calls[2][1].body.operation_id).not.toBe(first)
  })

  it('holds unknown operations and rejects a different action or edited comments until reconciled', async () => {
    const comments = [{ question_id: 'full_name', body: 'Please add your full name.' }]
    invoke.mockResolvedValue({ data: { delivery: { status: 'unknown' } }, error: null })
    await requestOnboardingChanges(workspaceId, instanceId, comments)
    const first = invoke.mock.calls[0][1].body.operation_id
    await expect(resendOnboardingInvitation(workspaceId, instanceId)).rejects.toThrow('Check delivery')
    await expect(requestOnboardingChanges(workspaceId, instanceId, [{ ...comments[0], body: 'Changed draft' }])).rejects.toThrow('Check delivery')
    expect(invoke).toHaveBeenCalledTimes(1)
    await checkOnboardingEmailDelivery(workspaceId, instanceId)
    expect(invoke.mock.calls[1][1].body).toEqual({ action: 'email_operation_status', workspace_id: workspaceId, instance_id: instanceId, operation_id: first })
    expect(hasPendingOnboardingEmail(workspaceId, instanceId)).toBe(true)
    invoke.mockResolvedValue({ data: { delivery: { status: 'failed' } }, error: null })
    await checkOnboardingEmailDelivery(workspaceId, instanceId)
    expect(hasPendingOnboardingEmail(workspaceId, instanceId)).toBe(false)
  })

  it('recovers a persisted rotate operation after reload without changing its link expiry', async () => {
    const operationId = '77777777-7777-4777-8777-777777777777'
    localStorage.setItem(`onboarding-email-operation:${workspaceId}:${instanceId}`, JSON.stringify({
      action: 'rotate', operation_id: operationId, extra: { expires_in_days: 14, send_email: true },
    }))
    invoke.mockResolvedValueOnce({ data: { delivery: { status: 'sent' } }, error: null })
    await retryOnboardingEmail(workspaceId, instanceId)
    expect(invoke.mock.calls[0][1].body).toEqual({ action: 'rotate', operation_id: operationId, workspace_id: workspaceId, instance_id: instanceId, expires_in_days: 14, send_email: true })
    expect(hasPendingOnboardingEmail(workspaceId, instanceId)).toBe(false)
  })

  it('only reads when checking an unstarted operation, preserving its identity for an explicit retry', async () => {
    invoke.mockRejectedValueOnce(new Error('Offline'))
    await expect(requestOnboardingChanges(workspaceId, instanceId, [{ question_id: 'full_name', body: 'Please complete this.' }])).rejects.toThrow('Offline')
    const original = invoke.mock.calls[0][1].body
    invoke.mockResolvedValueOnce({ data: { operation_state: 'not_started', delivery: { status: 'unknown', recorded: false } }, error: null })
    await expect(checkOnboardingEmailDelivery(workspaceId, instanceId)).resolves.toMatchObject({ operation_state: 'not_started' })
    expect(invoke.mock.calls[1][1].body).toEqual({ action: 'email_operation_status', workspace_id: workspaceId, instance_id: instanceId, operation_id: original.operation_id })
    expect(hasPendingOnboardingEmail(workspaceId, instanceId)).toBe(true)
    invoke.mockResolvedValueOnce({ data: { delivery: { status: 'sent' } }, error: null })
    await retryOnboardingEmail(workspaceId, instanceId)
    expect(invoke.mock.calls[2][1].body).toEqual(original)
  })

  it('does not treat missing or unrecorded receipts as permission to create a new send', async () => {
    invoke.mockResolvedValueOnce({ data: {}, error: null })
      .mockResolvedValueOnce({ data: { delivery: { status: 'sent', recorded: false } }, error: null })
    await resendOnboardingInvitation(workspaceId, instanceId)
    await checkOnboardingEmailDelivery(workspaceId, instanceId)
    expect(hasPendingOnboardingEmail(workspaceId, instanceId)).toBe(true)
    expect(invoke.mock.calls[1][1].body.operation_id).toBe(invoke.mock.calls[0][1].body.operation_id)
    await checkOnboardingEmailDelivery(otherWorkspaceId, instanceId)
    expect(invoke).toHaveBeenCalledTimes(2)
  })

  it('does not send when its operation identity cannot be persisted', async () => {
    const write = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('Storage unavailable') })
    try {
      await expect(resendOnboardingInvitation(workspaceId, instanceId)).rejects.toThrow('Storage unavailable')
      expect(invoke).not.toHaveBeenCalled()
    } finally {
      write.mockRestore()
    }
  })

  it('retrieves the current secure link without rotating its generation', async () => {
    invoke.mockResolvedValueOnce({
      data: {
        instance: detail,
        onboarding_url: 'https://getonapod.com/onboarding/redacted-current-token',
      },
      error: null,
    })

    await expect(getOnboardingLink(workspaceId, instanceId)).resolves.toMatchObject({
      instance: { id: instanceId, capability_generation: 1 },
      onboarding_url: expect.stringContaining('/onboarding/'),
    })
    expect(invoke).toHaveBeenCalledWith('workspace-onboarding', {
      body: {
        action: 'get_link',
        workspace_id: workspaceId,
        instance_id: instanceId,
      },
    })
  })

  it('approves submitted answers without requiring a pitch profile', async () => {
    invoke.mockResolvedValueOnce({
      data: {
        instance: {
          ...detail,
          status: 'approved',
          approved_at: '2026-07-23T12:00:00.000Z',
        },
      },
      error: null,
    })

    await expect(approveOnboardingAnswers(workspaceId, instanceId)).resolves.toMatchObject({
      instance: { id: instanceId, status: 'approved' },
    })
    expect(invoke).toHaveBeenCalledWith('workspace-onboarding', {
      body: {
        action: 'approve_answers',
        workspace_id: workspaceId,
        instance_id: instanceId,
      },
    })
  })

  it('keeps the capability in function request bodies and never uses browser storage', async () => {
    const clientView = {
      id: instanceId,
      workspace: { name: 'Agency', logo_url: null },
      accent_color: '#0F766E',
      recipient_name: 'Casey',
      status: 'in_progress',
      expires_at: '2026-08-05T00:00:00.000Z',
      current_revision: 0,
      definition,
      answers: { full_name: 'Casey' },
      current_section: 0,
      lock_version: 2,
      comments: [],
      assets: [],
    }
    invoke
      .mockResolvedValueOnce({ data: { onboarding: clientView }, error: null })
      .mockResolvedValueOnce({ data: { onboarding: { ...clientView, lock_version: 3 } }, error: null })

    await getClientOnboarding('private-capability')
    await saveClientOnboarding('private-capability', { full_name: 'Casey Client' }, 0, 2)

    expect(invoke).toHaveBeenNthCalledWith(1, 'client-onboarding', {
      // The hostname the link was opened on travels with every client call.
      body: { action: 'get', token: 'private-capability', hostname: 'localhost' },
    })
    expect(invoke).toHaveBeenNthCalledWith(2, 'client-onboarding', {
      body: {
        action: 'save',
        token: 'private-capability',
        answers: { full_name: 'Casey Client' },
        current_section: 0,
        expected_lock_version: 2,
        hostname: 'localhost',
      },
    })
  })
})
