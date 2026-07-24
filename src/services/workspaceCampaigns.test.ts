import { beforeEach, describe, expect, it, vi } from 'vitest'
import { supabase } from '@/lib/supabase'
import {
  addWorkspaceCampaignPodcasts,
  connectWorkspaceInstantly,
  getWorkspaceCampaignOverview,
  launchWorkspaceCampaignPitch,
  saveWorkspaceCampaign,
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
      data: { integration, can_manage_campaigns: true, campaigns: [] },
      error: null,
    } as never)

    await expect(getWorkspaceCampaignOverview(workspaceId)).resolves.toMatchObject({ campaigns: [] })
    expect(invoke).toHaveBeenCalledWith('workspace-client-campaigns', {
      body: { action: 'overview', workspace_id: workspaceId },
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
      },
    })
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
