import { beforeEach, describe, expect, it, vi } from 'vitest'
import { supabase } from '@/lib/supabase'
import { defaultInstantlyTimezone } from '@/lib/instantlyTimezones'
import {
  addWorkspaceCampaignPodcasts,
  connectWorkspaceInstantly,
  createClientInstantlyCampaign,
  deleteWorkspaceCampaign,
  provisionWorkspaceCampaign,
  getClientInstantlyCampaignLinks,
  setClientInstantlyCampaignLinks,
  getWorkspaceCampaignOverview,
  getWorkspaceCampaignReplies,
  getWorkspaceRecentReplies,
  getWorkspaceCampaignSendingStatus,
  getWorkspaceMailboxes,
  getWorkspacePromptRequirements,
  getWorkspaceResearchPromptOverrides,
  getWorkspaceAiModels,
  setWorkspaceAiModel,
  resetClientPromptRequirements,
  setClientPromptRequirements,
  setWorkspacePromptRequirements,
  launchWorkspaceCampaignPitch,
  prepareWorkspaceCampaignPodcast,
  resetWorkspaceResearchPrompt,
  saveWorkspaceCampaign,
  setWorkspaceResearchPrompt,
  updateWorkspaceCampaignContact,
} from '@/services/workspaceCampaigns'

vi.mock('@/lib/supabase', () => ({
  supabase: { functions: { invoke: vi.fn() } },
}))

const invoke = vi.mocked(supabase.functions.invoke)
const workspaceId = '11111111-1111-4111-8111-111111111111'
const clientId = '22222222-2222-4222-8222-222222222222'
const shortlistPodcastId = '33333333-3333-4333-8333-333333333333'

const integration = {
  connected: false,
  status: 'disconnected' as const,
  provider_workspace_id: null,
  provider_workspace_name: null,
  api_key_last_four: null,
  accounts: [],
  active_account_count: 0,
  connected_at: null,
  last_verified_at: null,
  last_error: null,
  can_manage: true,
  required_scopes: [],
}

describe('workspaceCampaigns service', () => {
  beforeEach(() => vi.clearAllMocks())

  it('loads the campaign overview through the workspace-scoped function', async () => {
    invoke.mockResolvedValueOnce({
      data: { integration, can_manage_campaigns: true, campaigns: [], provider_campaigns: [] },
      error: null,
    } as never)

    await expect(getWorkspaceCampaignOverview(workspaceId)).resolves.toMatchObject({ campaigns: [] })
    expect(invoke).toHaveBeenCalledWith('workspace-client-campaigns', {
      body: { action: 'overview', workspace_id: workspaceId },
    })
  })

  // A 2xx the page cannot read must surface as an error with a retry, not fall
  // through as "not connected" and "no campaigns assigned" stated as fact.
  it('refuses an overview payload it cannot read', async () => {
    invoke.mockResolvedValue({ data: null, error: null } as never)
    await expect(getWorkspaceCampaignOverview(workspaceId)).rejects.toThrow('could not be read')
  })

  it('loads mailboxes through the workspace-scoped function', async () => {
    invoke.mockResolvedValueOnce({
      data: {
        connected: true,
        provider_workspace_name: 'Solar workspace',
        accounts: [],
        last_synced_at: '2026-07-24T12:00:00.000Z',
        analytics_errors: [],
      },
      error: null,
    } as never)

    await expect(getWorkspaceMailboxes(workspaceId)).resolves.toMatchObject({ connected: true })
    expect(invoke).toHaveBeenCalledWith('workspace-client-campaigns', {
      body: { action: 'mailboxes', workspace_id: workspaceId },
    })
  })

  it('sends the owner key only to the authenticated connection action', async () => {
    invoke.mockResolvedValueOnce({ data: { integration }, error: null } as never)

    await connectWorkspaceInstantly(workspaceId, 'instantly-v2-owner-key')

    expect(invoke).toHaveBeenCalledWith('workspace-client-campaigns', {
      body: {
        action: 'connect-instantly',
        workspace_id: workspaceId,
        api_key: 'instantly-v2-owner-key',
      },
    })
  })

  it('names Email Bison and its instance URL, and never sends a URL for other providers', async () => {
    invoke.mockResolvedValue({ data: { integration }, error: null } as never)

    await connectWorkspaceInstantly(workspaceId, 'bison-api-user-token-123456', {
      provider: 'emailbison',
      baseUrl: 'https://send.agency.com',
    })
    expect(invoke).toHaveBeenLastCalledWith('workspace-client-campaigns', {
      body: {
        action: 'connect-instantly',
        workspace_id: workspaceId,
        api_key: 'bison-api-user-token-123456',
        provider: 'emailbison',
        base_url: 'https://send.agency.com',
      },
    })

    await connectWorkspaceInstantly(workspaceId, 'reachinbox-key-1234567890', {
      provider: 'reachinbox',
      baseUrl: 'https://ignored.example.com',
    })
    expect(invoke).toHaveBeenLastCalledWith('workspace-client-campaigns', {
      body: {
        action: 'connect-instantly',
        workspace_id: workspaceId,
        api_key: 'reachinbox-key-1234567890',
        provider: 'reachinbox',
      },
    })
  })

  it('maps campaign drafts and explicit pitch launches to narrow actions', async () => {
    invoke
      .mockResolvedValueOnce({ data: { campaign: null, targets: [] }, error: null } as never)
      .mockResolvedValueOnce({ data: { campaign: null, targets: [] }, error: null } as never)

    await saveWorkspaceCampaign({
      workspaceId,
      clientId,
      name: 'Client Podcast Outreach',
      timezone: 'America/New_York',
      dailyLimit: 30,
      senderAccounts: ['sender@example.com'],
      shortlistPodcastIds: [shortlistPodcastId],
      providerCampaignId: '77777777-7777-4777-8777-777777777777',
    })
    await launchWorkspaceCampaignPitch({
      workspaceId,
      clientId,
      shortlistPodcastId,
      subject: 'A tailored guest idea',
      pitchBody: 'A reviewed opening pitch.',
      followUpOneSubject: 'Re: A tailored guest idea',
      followUpOneBody: 'A reviewed first follow-up.',
      followUpTwoSubject: 'Re: A tailored guest idea',
      followUpTwoBody: 'A reviewed final follow-up.',
    })

    expect(invoke).toHaveBeenNthCalledWith(1, 'workspace-client-campaigns', {
      body: {
        action: 'upsert',
        workspace_id: workspaceId,
        client_id: clientId,
        name: 'Client Podcast Outreach',
        timezone: 'America/New_York',
        daily_limit: 30,
        sender_accounts: ['sender@example.com'],
        shortlist_podcast_ids: [shortlistPodcastId],
        provider_campaign_id: '77777777-7777-4777-8777-777777777777',
      },
    })
    expect(invoke).toHaveBeenNthCalledWith(2, 'workspace-client-campaigns', {
      body: {
        action: 'launch-pitch',
        workspace_id: workspaceId,
        client_id: clientId,
        shortlist_podcast_id: shortlistPodcastId,
        subject: 'A tailored guest idea',
        pitch_body: 'A reviewed opening pitch.',
        follow_up_1_subject: 'Re: A tailored guest idea',
        follow_up_1_body: 'A reviewed first follow-up.',
        follow_up_2_subject: 'Re: A tailored guest idea',
        follow_up_2_body: 'A reviewed final follow-up.',
      },
    })
  })

  it('pushes a researched three-email package into the existing client campaign', async () => {
    invoke.mockResolvedValueOnce({ data: { added: true, campaign: {}, target: {} }, error: null } as never)

    await prepareWorkspaceCampaignPodcast({
      workspaceId,
      clientId,
      shortlistPodcastId,
      researchNotes: 'Recent episodes and audience notes.',
      hostName: 'Jamie Host',
      contactEmail: 'host@example.com',
      subject: 'A tailored guest idea',
      pitchBody: 'A reviewed opening pitch.',
      followUpOneSubject: 'Re: A tailored guest idea',
      followUpOneBody: 'A reviewed first follow-up.',
      followUpTwoSubject: 'Re: A tailored guest idea',
      followUpTwoBody: 'A reviewed final follow-up.',
    })

    expect(invoke).toHaveBeenCalledWith('workspace-client-campaigns', {
      body: {
        action: 'prepare-podcast',
        workspace_id: workspaceId,
        client_id: clientId,
        shortlist_podcast_id: shortlistPodcastId,
        research_notes: 'Recent episodes and audience notes.',
        host_name: 'Jamie Host',
        contact_email: 'host@example.com',
        subject: 'A tailored guest idea',
        pitch_body: 'A reviewed opening pitch.',
        follow_up_1_subject: 'Re: A tailored guest idea',
        follow_up_1_body: 'A reviewed first follow-up.',
        follow_up_2_subject: 'Re: A tailored guest idea',
        follow_up_2_body: 'A reviewed final follow-up.',
        pitch_chain_version: null,
        // Omitted by the caller means the client's own campaign, which is where
        // every send went before the picker existed.
        instantly_campaign_id: null,
      },
    })
  })

  // The campaign object carries one integer for "why is nothing sending". This
  // reads the provider's own account: which accounts are unavailable and why,
  // what is queued, when the issue began.
  it('reads the provider account of why a campaign is not sending', async () => {
    const response = {
      status: 'account_daily_limit_met',
      status_message: 'Every sending account has reached its daily limit.',
      issue_started_at: '2026-08-01T09:00:00Z',
      last_healthy_send_at: '2026-07-31T16:00:00Z',
      in_schedule: true,
      accounts: { total_connected: 3, available: 0, daily_limit_hit: 2, disconnected: 1, slow_ramp_limit_hit: 0 },
      daily_limit: { limit: 30, sent: 30, limit_hit: true },
      follow_ups_waiting: { count: 4, earliest_wait_seconds: 3600 },
      checked_at: '2026-08-01T12:00:00Z',
    }
    invoke.mockResolvedValue({ data: response, error: null })

    await expect(getWorkspaceCampaignSendingStatus(workspaceId, clientId)).resolves.toEqual(response)
    expect(invoke).toHaveBeenCalledWith('workspace-client-campaigns', {
      body: {
        action: 'campaign-sending-status',
        workspace_id: workspaceId,
        client_id: clientId,
      },
    })
  })

  it('reads campaign replies for one client and decodes the matched podcast name', async () => {
    invoke.mockResolvedValueOnce({
      data: {
        supported: true,
        provider_label: 'Email Bison',
        replies: [{
          id: '7',
          provider_campaign_id: '42',
          from_email: 'host@show.fm',
          from_name: 'Pat Host',
          subject: 'Re: Guest idea',
          body_text: 'Sounds good',
          received_at: '2026-11-20T10:00:00Z',
          automated: false,
          interested: true,
          target: { id: 't1', shortlist_podcast_id: 's1', podcast_id: 'p1', podcast_name: 'Tom &amp; Jerry', host_name: 'Pat' },
        }],
        truncated: false,
        checked_at: '2026-11-23T10:00:00Z',
      },
      error: null,
    } as never)

    const result = await getWorkspaceCampaignReplies(workspaceId, clientId)
    expect(invoke).toHaveBeenCalledWith('workspace-client-campaigns', {
      body: { action: 'campaign-replies', workspace_id: workspaceId, client_id: clientId },
    })
    expect(result.replies[0].target?.podcast_name).toBe('Tom & Jerry')
    expect(result.replies[0].body_text).toBe('Sounds good')
    expect(result.truncated).toBe(false)
  })

  it('reads the workspace recent replies and drops rows without a client', async () => {
    invoke.mockResolvedValueOnce({
      data: {
        supported: true,
        provider_label: 'Email Bison',
        truncated: true,
        failed_campaigns: 1,
        checked_at: '2026-11-23T10:00:00Z',
        replies: [
          { id: '1', provider_campaign_id: '42', from_email: 'a@b.fm', from_name: null, subject: null, body_text: 'Hi', received_at: null, automated: false, interested: null, target: null, client: { id: clientId, name: 'Dallas' } },
          { id: '2', provider_campaign_id: '42', from_email: 'c@d.fm', from_name: null, subject: null, body_text: 'Hi', received_at: null, automated: false, interested: null, target: null, client: null },
        ],
      },
      error: null,
    } as never)
    const result = await getWorkspaceRecentReplies(workspaceId)
    expect(invoke).toHaveBeenCalledWith('workspace-client-campaigns', {
      body: { action: 'workspace-replies', workspace_id: workspaceId },
    })
    expect(result.replies.map((reply) => reply.id)).toEqual(['1'])
    expect(result.failed_campaigns).toBe(1)
    expect(result.truncated).toBe(true)
  })

  it('refuses an unreadable replies response instead of showing an empty list', async () => {
    invoke.mockResolvedValueOnce({ data: { replies: 'nope' }, error: null } as never)
    await expect(getWorkspaceCampaignReplies(workspaceId, clientId)).rejects.toThrow('could not be read')
  })

  it('saves a campaign-local host contact without mutating the podcast database', async () => {
    invoke.mockResolvedValueOnce({ data: { target: { id: 'target-one' } }, error: null } as never)

    await updateWorkspaceCampaignContact({
      workspaceId,
      clientId,
      shortlistPodcastId,
      contactEmail: 'host@example.com',
      hostName: 'Jamie Host',
    })

    expect(invoke).toHaveBeenCalledWith('workspace-client-campaigns', {
      body: {
        action: 'update-contact',
        workspace_id: workspaceId,
        client_id: clientId,
        shortlist_podcast_id: shortlistPodcastId,
        contact_email: 'host@example.com',
        host_name: 'Jamie Host',
      },
    })
  })

  it('appends podcasts to an existing client campaign through a narrow action', async () => {
    invoke.mockResolvedValueOnce({ data: { added: 1, campaign: {}, targets: [] }, error: null } as never)

    await addWorkspaceCampaignPodcasts({ workspaceId, clientId, shortlistPodcastIds: [shortlistPodcastId] })

    expect(invoke).toHaveBeenCalledWith('workspace-client-campaigns', {
      body: {
        action: 'add-podcasts',
        workspace_id: workspaceId,
        client_id: clientId,
        shortlist_podcast_ids: [shortlistPodcastId],
      },
    })
  })
})

describe('workspace research prompts', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  const workspaceId = '11111111-1111-4111-8111-111111111111'

  it('loads prompt overrides through the campaigns function', async () => {
    invoke.mockResolvedValueOnce({
      data: { overrides: { podcast_research: { content: 'Custom research prompt', updated_at: '2026-07-26T00:00:00.000Z' } } },
      error: null,
    } as never)

    const overrides = await getWorkspaceResearchPromptOverrides(workspaceId)

    expect(invoke).toHaveBeenCalledWith('workspace-client-campaigns', {
      body: { action: 'prompts-get', workspace_id: workspaceId },
    })
    expect(overrides.podcast_research?.content).toBe('Custom research prompt')
  })

  it('saves a prompt override with the exact payload', async () => {
    invoke.mockResolvedValueOnce({ data: { success: true }, error: null } as never)

    await setWorkspaceResearchPrompt(workspaceId, 'write_email', 'New pitch instructions')

    expect(invoke).toHaveBeenCalledWith('workspace-client-campaigns', {
      body: {
        action: 'prompts-set',
        workspace_id: workspaceId,
        prompt_id: 'write_email',
        content: 'New pitch instructions',
      },
    })
  })

  it('saves which fields a stage refuses to run without', async () => {
    invoke.mockResolvedValueOnce({ data: { success: true }, error: null } as never)

    await setWorkspacePromptRequirements(workspaceId, 'write_email', ['episode_transcript'])

    expect(invoke).toHaveBeenCalledWith('workspace-client-campaigns', {
      body: {
        action: 'prompt-requirements-set',
        workspace_id: workspaceId,
        prompt_id: 'write_email',
        required_variables: ['episode_transcript'],
      },
    })
  })

  it('reads requirements, treating an absent stage as requiring nothing', async () => {
    invoke.mockResolvedValueOnce({
      data: { requirements: { write_email: ['episode_transcript'] } },
      error: null,
    } as never)

    const requirements = await getWorkspacePromptRequirements(workspaceId)

    expect(invoke).toHaveBeenCalledWith('workspace-client-campaigns', {
      body: { action: 'prompt-requirements-get', workspace_id: workspaceId },
    })
    expect(requirements.write_email).toEqual(['episode_transcript'])
    expect(requirements.host_info).toBeUndefined()
  })

  it('sets a client requirement, and resets it back to inheriting the workspace', async () => {
    invoke.mockResolvedValueOnce({ data: { success: true }, error: null } as never)
    await setClientPromptRequirements(workspaceId, clientId, 'write_email', [])
    expect(invoke).toHaveBeenCalledWith('workspace-client-campaigns', {
      body: {
        action: 'client-prompt-requirements-set',
        workspace_id: workspaceId,
        client_id: clientId,
        prompt_id: 'write_email',
        // An empty set is an opinion: this client pitches without a transcript
        // even where the workspace insists on one.
        required_variables: [],
      },
    })

    invoke.mockResolvedValueOnce({ data: { success: true }, error: null } as never)
    await resetClientPromptRequirements(workspaceId, clientId, 'write_email')
    expect(invoke).toHaveBeenCalledWith('workspace-client-campaigns', {
      body: {
        action: 'client-prompt-requirements-reset',
        workspace_id: workspaceId,
        client_id: clientId,
        prompt_id: 'write_email',
      },
    })
  })

  it('resets a prompt override', async () => {
    invoke.mockResolvedValueOnce({ data: { success: true }, error: null } as never)

    await resetWorkspaceResearchPrompt(workspaceId, 'find_topics')

    expect(invoke).toHaveBeenCalledWith('workspace-client-campaigns', {
      body: { action: 'prompts-reset', workspace_id: workspaceId, prompt_id: 'find_topics' },
    })
  })
})

describe('client instantly campaign links', () => {
  const workspaceId = '11111111-1111-4111-8111-111111111111'
  const clientId = '22222222-2222-4222-8222-222222222222'

  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('loads links and linkable provider campaigns for one client', async () => {
    const response = {
      connected: true,
      links: [{ instantly_campaign_id: '33333333-3333-4333-8333-333333333333', campaign_name: 'Q3 Podcast Tour', created_at: '2026-07-26T00:00:00.000Z' }],
      provider_campaigns: [
        { id: '33333333-3333-4333-8333-333333333333', name: 'Q3 Podcast Tour', status: 1, linked_client_id: clientId, linked_client_name: 'Taylor', managed_client_id: null },
        { id: '44444444-4444-4444-8444-444444444444', name: 'Other Client Tour', status: 2, linked_client_id: '55555555-5555-4555-8555-555555555555', linked_client_name: 'Sky', managed_client_id: null },
      ],
    }
    invoke.mockResolvedValueOnce({ data: response, error: null } as never)

    const result = await getClientInstantlyCampaignLinks(workspaceId, clientId)

    expect(invoke).toHaveBeenCalledWith('workspace-client-campaigns', {
      body: { action: 'client-links-list', workspace_id: workspaceId, client_id: clientId },
    })
    expect(result).toEqual(response)
  })

  it('saves the selected campaign ids as a replace set', async () => {
    const links = [{ instantly_campaign_id: '33333333-3333-4333-8333-333333333333', campaign_name: 'Q3 Podcast Tour', created_at: null }]
    invoke.mockResolvedValueOnce({ data: { links }, error: null } as never)

    const result = await setClientInstantlyCampaignLinks(workspaceId, clientId, ['33333333-3333-4333-8333-333333333333'])

    expect(invoke).toHaveBeenCalledWith('workspace-client-campaigns', {
      body: {
        action: 'client-links-set',
        workspace_id: workspaceId,
        client_id: clientId,
        campaign_ids: ['33333333-3333-4333-8333-333333333333'],
      },
    })
    expect(result).toEqual(links)
  })

  it('creates a campaign with a real timezone and daily limit when the caller omits them', async () => {
    const link = { instantly_campaign_id: '66666666-6666-4666-8666-666666666666', campaign_name: 'Autumn Tour', created_at: null }
    invoke.mockResolvedValueOnce({ data: { link }, error: null } as never)

    const result = await createClientInstantlyCampaign({
      workspaceId,
      clientId,
      name: 'Autumn Tour',
      senderAccounts: ['host@agency.com'],
    })

    expect(invoke).toHaveBeenCalledWith('workspace-client-campaigns', {
      body: {
        action: 'client-links-create',
        workspace_id: workspaceId,
        client_id: clientId,
        name: 'Autumn Tour',
        sender_accounts: ['host@agency.com'],
        timezone: defaultInstantlyTimezone(),
        daily_limit: 30,
      },
    })
    expect(typeof (invoke.mock.calls[0][1] as { body: { timezone: unknown } }).body.timezone).toBe('string')
    expect(result).toEqual(link)
  })

  it('passes the caller\'s timezone and daily limit through unchanged', async () => {
    invoke.mockResolvedValueOnce({ data: { link: { instantly_campaign_id: 'x', campaign_name: 'x', created_at: null } }, error: null } as never)

    await createClientInstantlyCampaign({
      workspaceId,
      clientId,
      name: 'Autumn Tour',
      senderAccounts: ['host@agency.com'],
      timezone: 'Australia/Melbourne',
      dailyLimit: 50,
    })

    expect(invoke.mock.calls[0][1].body).toMatchObject({ timezone: 'Australia/Melbourne', daily_limit: 50 })
  })

  it('creates the campaign on the sending platform on request', async () => {
    invoke.mockResolvedValueOnce({ data: { campaign: { id: 'c1' }, targets: [], created: true }, error: null } as never)
    await expect(provisionWorkspaceCampaign(workspaceId, clientId)).resolves.toMatchObject({ created: true })
    expect(invoke).toHaveBeenCalledWith('workspace-client-campaigns', {
      body: { action: 'provision', workspace_id: workspaceId, client_id: clientId },
    })
  })

  it('deletes a client campaign and reports what the platform did', async () => {
    invoke.mockResolvedValueOnce({ data: { deleted: true, campaign_id: 'c1', provider_outcome: 'paused' }, error: null } as never)
    await expect(deleteWorkspaceCampaign(workspaceId, clientId)).resolves.toBe('paused')
    expect(invoke).toHaveBeenCalledWith('workspace-client-campaigns', {
      body: { action: 'delete', workspace_id: workspaceId, client_id: clientId },
    })
  })

  it('asks for a local-only removal only when told to', async () => {
    invoke.mockResolvedValueOnce({ data: { deleted: true, provider_outcome: 'skipped' }, error: null } as never)
    await expect(deleteWorkspaceCampaign(workspaceId, clientId, { localOnly: true })).resolves.toBe('skipped')
    expect(invoke).toHaveBeenCalledWith('workspace-client-campaigns', {
      body: { action: 'delete', workspace_id: workspaceId, client_id: clientId, local_only: true },
    })
  })

  it('never reports a delete the server did not confirm', async () => {
    invoke.mockResolvedValueOnce({ data: {}, error: null } as never)
    await expect(deleteWorkspaceCampaign(workspaceId, clientId)).rejects.toThrow('could not be deleted')
  })

  it('reads AI model settings, treating missing or blank entries as follow-the-default', async () => {
    invoke.mockResolvedValueOnce({
      data: { models: { default: 'claude-haiku-5-5', fit_scoring: 'claude-opus-5-5', autopilot: '' } },
      error: null,
    } as never)

    const models = await getWorkspaceAiModels(workspaceId)

    expect(invoke).toHaveBeenCalledWith('workspace-client-campaigns', {
      body: { action: 'ai-models-get', workspace_id: workspaceId },
    })
    expect(models.default).toBe('claude-haiku-5-5')
    expect(models.fit_scoring).toBe('claude-opus-5-5')
    expect(models.autopilot).toBeNull()
    expect(models.pitch_fact_check).toBeNull()
  })

  it('saves and clears one AI model setting', async () => {
    invoke.mockResolvedValueOnce({ data: { success: true }, error: null } as never)
    await setWorkspaceAiModel(workspaceId, 'default', 'claude-haiku-5-5')
    expect(invoke).toHaveBeenLastCalledWith('workspace-client-campaigns', {
      body: { action: 'ai-model-set', workspace_id: workspaceId, setting_id: 'default', model: 'claude-haiku-5-5' },
    })

    invoke.mockResolvedValueOnce({ data: { success: true }, error: null } as never)
    await setWorkspaceAiModel(workspaceId, 'pitch_fact_check', null)
    expect(invoke).toHaveBeenLastCalledWith('workspace-client-campaigns', {
      body: { action: 'ai-model-set', workspace_id: workspaceId, setting_id: 'pitch_fact_check', model: null },
    })
  })

  it('never reports an AI model save the server did not confirm', async () => {
    invoke.mockResolvedValueOnce({ data: {}, error: null } as never)
    await expect(setWorkspaceAiModel(workspaceId, 'default', 'claude-haiku-5-5')).rejects.toThrow('could not be saved')
  })
})
