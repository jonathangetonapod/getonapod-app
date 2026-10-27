import { beforeEach, describe, expect, it, vi } from 'vitest'
import { supabase } from '@/lib/supabase'
import {
  addHostRelationshipNote,
  addOutreachSuppression,
  createHostRelationship,
  dismissHostRelationship,
  getHostRelationship,
  linkHostRelationshipClient,
  listHostRelationships,
  listHostRelationshipsPage,
  listOutreachSuppressions,
  removeOutreachSuppression,
  saveHostRelationship,
  unlinkHostRelationshipClient,
} from '@/services/hostRelationships'

vi.mock('@/lib/supabase', () => ({
  supabase: { functions: { invoke: vi.fn() } },
}))

const invoke = vi.mocked(supabase.functions.invoke)
const workspaceId = 'AAAAAAAA-AAAA-4AAA-8AAA-AAAAAAAAAAAA'
const canonicalWorkspaceId = workspaceId.toLowerCase()
const clientId = '22222222-2222-4222-8222-222222222222'

describe('hostRelationships service', () => {
  beforeEach(() => vi.clearAllMocks())

  it('loads a workspace-scoped book and normalizes missing detail arrays', async () => {
    const relationship = { podcast_id: 'show-one', derived_state: 'replied' }
    invoke
      .mockResolvedValueOnce({ data: { relationships: [relationship] }, error: null } as never)
      .mockResolvedValueOnce({ data: { relationship: null, derived: null }, error: null } as never)

    await expect(listHostRelationships(workspaceId)).resolves.toEqual([relationship])
    await expect(getHostRelationship(workspaceId, 'show-one')).resolves.toEqual({
      relationship: null,
      derived: null,
      clients: [],
      events: [],
      threads: [],
    })
    expect(invoke).toHaveBeenNthCalledWith(1, 'workspace-host-relationships', {
      body: { action: 'list', workspace_id: canonicalWorkspaceId, limit: 500, offset: 0 },
    })
    expect(invoke).toHaveBeenNthCalledWith(2, 'workspace-host-relationships', {
      body: { action: 'detail', workspace_id: canonicalWorkspaceId, podcast_id: 'show-one' },
    })
  })

  it('pages the book with whole-book totals and follows pages for the full list', async () => {
    const first = { podcast_id: 'show-one', derived_state: 'in_conversation' }
    const second = { podcast_id: 'show-two', derived_state: 'booked' }
    invoke.mockResolvedValueOnce({
      data: {
        relationships: [first],
        total: 2,
        offset: 0,
        has_more: true,
        next_offset: 1,
        counts: { in_conversation: 1, booked: 1, engaged: 0 },
      },
      error: null,
    } as never)

    const page = await listHostRelationshipsPage(workspaceId, { offset: 0, limit: 1 })
    expect(page).toEqual({
      relationships: [first],
      total: 2,
      offset: 0,
      has_more: true,
      next_offset: 1,
      counts: { in_conversation: 1, booked: 1, engaged: 0 },
    })
    expect(invoke).toHaveBeenLastCalledWith('workspace-host-relationships', {
      body: { action: 'list', workspace_id: canonicalWorkspaceId, limit: 1, offset: 0 },
    })

    invoke
      .mockResolvedValueOnce({
        data: { relationships: [first], total: 2, offset: 0, has_more: true, next_offset: 1, counts: {} },
        error: null,
      } as never)
      .mockResolvedValueOnce({
        data: { relationships: [second], total: 2, offset: 1, has_more: false, next_offset: null, counts: {} },
        error: null,
      } as never)
    await expect(listHostRelationships(workspaceId)).resolves.toEqual([first, second])
    expect(invoke).toHaveBeenLastCalledWith('workspace-host-relationships', {
      body: { action: 'list', workspace_id: canonicalWorkspaceId, limit: 500, offset: 1 },
    })
  })

  it('patches only fields the caller supplied so a summary cannot erase the stage', async () => {
    invoke.mockResolvedValue({ data: { relationship: { podcast_id: 'show-one' } }, error: null } as never)

    await saveHostRelationship(workspaceId, { podcastId: 'show-one', summary: 'Prefers concise pitches.' })

    expect(invoke).toHaveBeenCalledWith('workspace-host-relationships', {
      body: {
        action: 'upsert',
        workspace_id: canonicalWorkspaceId,
        podcast_id: 'show-one',
        summary: 'Prefers concise pitches.',
      },
    })
    const body = (invoke.mock.calls[0][1] as { body: Record<string, unknown> }).body
    expect(body).not.toHaveProperty('manual_stage')
    expect(body).not.toHaveProperty('contact_email')
  })

  it('preserves explicit null when a manager returns the stage to derived activity', async () => {
    invoke.mockResolvedValue({ data: { relationship: { podcast_id: 'show-one' } }, error: null } as never)

    await saveHostRelationship(workspaceId, { podcastId: 'show-one', manualStage: null })

    expect(invoke).toHaveBeenCalledWith('workspace-host-relationships', {
      body: {
        action: 'upsert',
        workspace_id: canonicalWorkspaceId,
        podcast_id: 'show-one',
        manual_stage: null,
      },
    })
  })

  it('uses narrow actions for interactions and client associations', async () => {
    invoke.mockResolvedValue({ data: {}, error: null } as never)

    await addHostRelationshipNote(workspaceId, {
      podcastId: 'show-one',
      body: 'Asked us to circle back in Q3.',
      kind: 'call',
      clientId,
    })
    await linkHostRelationshipClient(workspaceId, {
      podcastId: 'show-one',
      clientId,
      intent: 'considering',
    })
    await unlinkHostRelationshipClient(workspaceId, { podcastId: 'show-one', clientId })

    expect(invoke.mock.calls.map((call) => (call[1] as { body: { action: string } }).body.action)).toEqual([
      'note-add',
      'client-link',
      'client-unlink',
    ])
    expect((invoke.mock.calls[0][1] as { body: Record<string, unknown> }).body).toMatchObject({
      workspace_id: canonicalWorkspaceId,
      podcast_id: 'show-one',
      body_text: 'Asked us to circle back in Q3.',
      kind: 'call',
      client_id: clientId,
    })
  })

  it('creates manual relationships', async () => {
    invoke.mockResolvedValueOnce({
      data: { relationship: { podcast_id: 'manual-one' }, created: true },
      error: null,
    } as never)

    await expect(createHostRelationship(workspaceId, {
      podcastName: 'The Operator Room',
      hostName: 'Alex Host',
      contactEmail: 'alex@example.com',
      manualStage: 'warm',
      summary: 'Met at an event.',
    })).resolves.toEqual({ podcast_id: 'manual-one', created: true })

    expect(invoke).toHaveBeenCalledWith('workspace-host-relationships', {
      body: expect.objectContaining({
        action: 'create',
        workspace_id: canonicalWorkspaceId,
        podcast_name: 'The Operator Room',
        contact_email: 'alex@example.com',
      }),
    })
  })

  it('marks a row not a host, and undoes it, with the narrow dismiss action', async () => {
    invoke.mockResolvedValue({ data: { relationship: { podcast_id: 'manual-titan' } }, error: null } as never)

    await dismissHostRelationship(workspaceId, { podcastId: 'manual-titan', dismissed: true })
    await dismissHostRelationship(workspaceId, { podcastId: 'manual-titan', dismissed: false })

    expect(invoke).toHaveBeenNthCalledWith(1, 'workspace-host-relationships', {
      body: {
        action: 'dismiss',
        workspace_id: canonicalWorkspaceId,
        podcast_id: 'manual-titan',
        dismissed: true,
      },
    })
    expect(invoke).toHaveBeenNthCalledWith(2, 'workspace-host-relationships', {
      body: expect.objectContaining({ action: 'dismiss', dismissed: false }),
    })
  })

  it('reads the do-not-contact list and adds an address workspace-wide', async () => {
    const suppression = {
      contact_email: 'host@example.com',
      reason: 'opted_out',
      source: 'inbox_auto',
      note: 'Detected in a reply',
      created_at: '2026-07-20T12:00:00.000Z',
      created_by_email: null,
      host_name: 'Morgan Host',
      podcast_name: 'Founder & Operator',
      podcast_id: 'show-one',
      touch_count: 3,
    }
    invoke
      .mockResolvedValueOnce({ data: { suppressions: [suppression] }, error: null } as never)
      .mockResolvedValueOnce({ data: { suppressed: true }, error: null } as never)

    await expect(listOutreachSuppressions(workspaceId)).resolves.toEqual([suppression])
    await addOutreachSuppression(workspaceId, {
      contactEmail: 'other@example.com',
      reason: 'bounced',
    })

    expect(invoke).toHaveBeenNthCalledWith(1, 'workspace-host-relationships', {
      body: { action: 'suppression-list', workspace_id: canonicalWorkspaceId },
    })
    expect(invoke).toHaveBeenNthCalledWith(2, 'workspace-host-relationships', {
      body: {
        action: 'suppression-add',
        workspace_id: canonicalWorkspaceId,
        contact_email: 'other@example.com',
        reason: 'bounced',
        note: null,
      },
    })
  })

  it('treats a missing suppressions array as an empty list rather than a crash', async () => {
    invoke.mockResolvedValueOnce({ data: {}, error: null } as never)
    await expect(listOutreachSuppressions(workspaceId)).resolves.toEqual([])
  })

  it('sends the required reason when reinstating a suppressed address', async () => {
    invoke.mockResolvedValue({ data: { removed: true }, error: null } as never)

    await removeOutreachSuppression(workspaceId, {
      contactEmail: 'host@example.com',
      note: 'The reply unsubscribed from their newsletter, not from us.',
    })

    expect(invoke).toHaveBeenCalledWith('workspace-host-relationships', {
      body: {
        action: 'suppression-remove',
        workspace_id: canonicalWorkspaceId,
        contact_email: 'host@example.com',
        note: 'The reply unsubscribed from their newsletter, not from us.',
      },
    })
  })
})
