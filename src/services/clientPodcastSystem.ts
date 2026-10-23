import { supabase } from '@/lib/supabase'
import { toFunctionError } from '@/lib/functionErrors'
import { decodeFeedText } from '@/lib/feedText'

export type ClientPodcastLifecycleStage =
  | 'awaiting_review'
  | 'approved'
  | 'contact_needed'
  | 'research_needed'
  | 'ready'
  | 'outreach'
  | 'conversation'
  | 'booked'
  | 'recorded'
  | 'published'

export type ClientPodcastLifecycleOutcome = 'rejected' | 'cancelled' | 'archived' | null

export interface ClientPodcastSystemClient {
  id: string
  name: string
  status: string
  photo_url: string | null
  email: string | null
  contact_person: string | null
  website: string | null
  bio: string | null
  profile: {
    ready: boolean
    completed_fields: number
    total_fields: number
    positioning: string | null
    updated_at: string | null
    has_calendar: boolean
    has_media_kit: boolean
  }
  dashboard_configured: boolean
  portal: {
    enabled: boolean
    last_login_at: string | null
  }
  onboarding: {
    id: string
    status: 'invited' | 'in_progress' | 'submitted' | 'changes_requested' | 'approved' | 'expired' | 'revoked'
    invited_at: string
    submitted_at: string | null
    approved_at: string | null
    updated_at: string
  } | null
  podcast_count: number
  created_at: string
  updated_at: string
  last_activity_at: string | null
}

export interface ClientPodcastSystemItem {
  id: string
  client: {
    id: string
    name: string
    status: string
    photo_url: string | null
  }
  podcast: {
    id: string | null
    podscan_id: string
    name: string
    description: string | null
    image_url: string | null
    url: string | null
    publisher_name: string | null
    host_name: string | null
    audience_size: number | null
    last_posted_at: string | null
  }
  stage: ClientPodcastLifecycleStage
  outcome: ClientPodcastLifecycleOutcome
  terminal: boolean
  has_conflict: boolean
  next_action: string | null
  contact: {
    available: boolean
    source: 'campaign' | 'direct' | 'podscan' | 'none'
    email: string | null
    verified_at: string | null
  }
  decision: {
    status: 'approved' | 'rejected' | null
    notes: string | null
    updated_at: string | null
  }
  analysis: {
    source: 'normalized' | 'legacy_cache' | 'none'
    clean_description: string | null
    fit_reasons: string[]
    pitch_angles: Array<{ title: string; description: string }>
    analyzed_at: string | null
  }
  campaign: {
    id: string
    target_id: string
    status: 'draft' | 'ready' | 'launching' | 'in_outreach' | 'replied' | 'completed' | 'failed'
    research_ready: boolean
    pitch_ready: boolean
    open_count: number
    reply_count: number
    launched_at: string | null
    last_activity_at: string | null
    last_error: string | null
  } | null
  legacy_outreach_at: string | null
  /**
   * The Master Inbox conversation with this host, when there is one.
   * thread_key is null when a reply is known from a campaign sync but the
   * inbox has not read the thread in yet, so there is nothing to open.
   */
  conversation: {
    thread_key: string | null
    status: string | null
    replied: boolean
    updated_at: string | null
  } | null
  booking: {
    id: string
    match: 'podcast_id' | 'podcast_name'
    status: 'conversation_started' | 'in_progress' | 'booked' | 'recorded' | 'published' | 'cancelled'
    host_name: string | null
    scheduled_date: string | null
    recording_date: string | null
    publish_date: string | null
    episode_url: string | null
    prep_sent: boolean
    notes: string | null
    created_at: string
    updated_at: string
  } | null
  operator_notes: string | null
  shortlist_created_at: string
  shortlist_updated_at: string
  last_activity_at: string | null
}

export interface ClientPodcastSystemResponse {
  workspace: {
    id: string
    name: string
    /** Brands the shell, exactly as every other workspace-scoped payload does. */
    logo_path: string | null
    logo_updated_at: string | null
  }
  viewer_role: 'owner' | 'admin' | 'member' | 'platform_admin'
  can_manage: boolean
  generated_at: string
  /**
   * True when at least one source hit its row cap and only the newest rows
   * are shown. Counts on the page are then partial and should say so.
   * Always set by getWorkspaceClientPodcastSystem (false for an older
   * function build that never sent it).
   */
  truncated?: boolean
  /** Which sources were cut short (shortlist, bookings, inbox_threads, ...). */
  truncated_sources?: string[]
  clients: ClientPodcastSystemClient[]
  summary: {
    total: number
    active: number
    completed: number
    needs_attention: number
    upcoming_recordings: number
    awaiting_publication: number
    stage_counts: Record<ClientPodcastLifecycleStage, number>
  }
  items: ClientPodcastSystemItem[]
}

export async function getWorkspaceClientPodcastSystem(
  workspaceId: string,
  options: { clientId?: string } = {},
): Promise<ClientPodcastSystemResponse> {
  const canonicalWorkspaceId = workspaceId.toLowerCase()
  const canonicalClientId = options.clientId ? options.clientId.toLowerCase() : null
  const { data, error } = await supabase.functions.invoke('workspace-client-podcast-system', {
    body: {
      action: 'list',
      workspace_id: canonicalWorkspaceId,
      // One client's pipeline only, for the client record.
      ...(canonicalClientId ? { client_id: canonicalClientId } : {}),
    },
  })
  if (error) {
    throw await toFunctionError(error, 'The pipeline could not be loaded.')
  }

  const response = data as ClientPodcastSystemResponse | null
  if (
    !response?.workspace
    || typeof response.workspace.id !== 'string'
    || response.workspace.id.toLowerCase() !== canonicalWorkspaceId
    || !Array.isArray(response.clients)
    || !Array.isArray(response.items)
    || !response.summary
    || (canonicalClientId !== null && response.clients.some((client) => client.id?.toLowerCase() !== canonicalClientId))
  ) {
    throw new Error('The pipeline response did not match the workspace address.')
  }
  /*
   * Normalized rather than trusted, because the browser bundle and the edge
   * function ship separately: a page built after this change can be talking to
   * a function deployed before it, and the type would otherwise promise two
   * fields that are simply absent. Missing reads as no logo, which is what the
   * shell drew before either existed.
   */
  const truncatedSources = Array.isArray(response.truncated_sources)
    ? response.truncated_sources.filter((source): source is string => typeof source === 'string')
    : []
  return {
    ...response,
    truncated: response.truncated === true || truncatedSources.length > 0,
    truncated_sources: truncatedSources,
    // Feed titles arrive as HTML ("Angels, Exits, &amp; Acquisitions").
    // Decoded here, once, so every surface built on this payload (the queue,
    // the opportunity sheet, the calendar, a placement seeded from a row)
    // shows and saves the readable name.
    items: response.items.map((item) => ({
      ...item,
      podcast: {
        ...item.podcast,
        name: typeof item.podcast?.name === 'string' ? decodeFeedText(item.podcast.name) : item.podcast?.name,
        description: item.podcast?.description ? decodeFeedText(item.podcast.description) : item.podcast?.description ?? null,
      },
    })),
    workspace: {
      ...response.workspace,
      logo_path: typeof response.workspace.logo_path === 'string' ? response.workspace.logo_path : null,
      logo_updated_at: typeof response.workspace.logo_updated_at === 'string'
        ? response.workspace.logo_updated_at
        : null,
    },
  }
}
