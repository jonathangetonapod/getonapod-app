import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import Anthropic from 'npm:@anthropic-ai/sdk@0.32.1'
import {
  createAdminClient,
  errorResponse,
  HttpError,
  jsonResponse,
  optionsResponse,
  parseJsonObject,
  requireAuthenticatedUser,
  requirePlatformAdminOrService,
  requireUuid,
  requireWorkspaceFeatureAccess,
} from '../_shared/workspaceAuth.ts'
import { chargeCredits, logOperationCost, refundCredits } from '../_shared/billing.ts'
import { resolveAiKey } from '../_shared/workspaceAiKeys.ts'
import {
  groupScoringPrompt,
  parseGroupScores,
  parseSingleScore,
  SCORING_GROUP_SIZE,
  singleScoringPrompt,
  storedEpisodeTitles,
  targetProfile,
  type ScoringEpisode,
  type ScoringPodcast,
} from '../_shared/compatibilityPrompt.ts'

const METHODS = ['POST'] as const
const SCORING_MODEL = 'claude-haiku-4-5-20251001'

type PodcastForScoring = ScoringPodcast

/**
 * Where a score came from. 'deterministic' is the keyword heuristic below,
 * used when the model failed; callers show it as an estimate, never as an AI
 * judgement.
 */
type ScoreSource = 'ai' | 'deterministic'

interface ScoreRow {
  podcast_id: string
  score: number | null
  reasoning?: string
  source: ScoreSource
}

const SCORE_STOP_WORDS = new Set([
  'about', 'after', 'also', 'been', 'being', 'business', 'company', 'could', 'from', 'have', 'helps',
  'into', 'more', 'most', 'over', 'podcast', 'their', 'them', 'they', 'this', 'through', 'using', 'what',
  'when', 'where', 'which', 'while', 'with', 'work', 'years', 'your',
])

function meaningfulTokens(value: string): Set<string> {
  return new Set((value.toLowerCase().match(/[a-z][a-z0-9-]{2,}/gu) || [])
    .filter((token) => !SCORE_STOP_WORDS.has(token)))
}

function deterministicScore(targetBio: string, podcast: PodcastForScoring) {
  const targetTokens = meaningfulTokens(targetBio)
  const podcastText = [
    podcast.podcast_name,
    podcast.publisher_name,
    podcast.podcast_description,
    podcast.podcast_categories?.map((category) => category.category_name).join(' '),
  ].filter(Boolean).join(' ')
  const shared = Array.from(meaningfulTokens(podcastText)).filter((token) => targetTokens.has(token)).slice(0, 4)
  const score = shared.length === 0 ? 5 : Math.min(9, 5.5 + shared.length)
  return {
    score,
    reasoning: shared.length > 0
      ? `Estimated from keyword overlap (${shared.join(', ')}), not an AI judgement. Review the audience and recent episodes before adding it.`
      : 'Estimated from keyword overlap, not an AI judgement: the description has little direct topic overlap. Review it before adding it to the shortlist.',
  }
}

function messageText(message: Anthropic.Messages.Message): string | null {
  const content = message.content[0]
  return content?.type === 'text' ? content.text : null
}

/*
 * Recent episode titles from the shared catalog, where a show has been
 * captured before. Read only: scoring never calls Podscan, so a show nobody
 * has researched yet is scored on its description and says so.
 */
async function storedEpisodes(
  admin: ReturnType<typeof createAdminClient>,
  podcastIds: string[],
): Promise<Map<string, ScoringEpisode[]>> {
  const ids = podcastIds.filter((id) => /^[a-zA-Z0-9_-]+$/u.test(id))
  if (ids.length === 0) return new Map()
  try {
    const { data, error } = await admin
      .from('podcasts')
      .select('podscan_id,recent_episodes')
      .in('podscan_id', ids)
    if (error || !Array.isArray(data)) return new Map()
    return new Map(data.map((row) => [String(row.podscan_id), storedEpisodeTitles(row.recent_episodes)]))
  } catch {
    return new Map()
  }
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return optionsResponse(req, METHODS)

  // Set when a real debit lands, so the outer catch can give it back: a
  // scoring run that dies after the charge delivered nothing to pay for.
  let chargedForRefund: { workspaceId: string; entryId: string } | null = null
  let refundAdmin: Parameters<typeof refundCredits>[0] | null = null

  try {
    if (req.method !== 'POST') throw new HttpError(405, 'METHOD_NOT_ALLOWED', 'Only POST is allowed')

    /*
     * Size-capped. Podcast names, descriptions and publishers go straight into
     * the prompt, the credit charge is flat per request, and a workspace with
     * no key of its own spends the platform's — so an unbounded body is a bill.
     */
    const body = await parseJsonObject(req, 262_144) as {
      clientBio?: string
      prospectBio?: string
      podcasts: PodcastForScoring[]
      workspaceId?: string
      clientId?: string
      prospectDashboardId?: string
    }
    let { clientBio, prospectBio } = body
    const scopedRequest = body.workspaceId !== undefined
      || body.clientId !== undefined
      || body.prospectDashboardId !== undefined
    // Workspace callers are capped: one request scores at most 20 podcasts.
    const podcasts = scopedRequest && Array.isArray(body.podcasts)
      ? body.podcasts.slice(0, 20)
      : body.podcasts

    let anthropicApiKey = Deno.env.get('ANTHROPIC_API_KEY') || ''
    let meteringActorUserId = ''
    let admin: ReturnType<typeof createAdminClient> | null = null
    // Everything the workspace wrote about the client, not just the bio.
    let profileSections: Array<[string, unknown]> = []
    let metering: {
      admin: Awaited<ReturnType<typeof requireAuthenticatedUser>>['admin']
      workspaceId: string
      clientId: string | null
      referenceKind: string
      referenceId: string
      byoKeyUsed: boolean
    } | null = null

    if (scopedRequest) {
      const workspaceId = requireUuid(body.workspaceId, 'workspaceId')
      const context = await requireAuthenticatedUser(req)
      await requireWorkspaceFeatureAccess(context, workspaceId)
      admin = context.admin
      const hasClient = body.clientId !== undefined
      const hasProspect = body.prospectDashboardId !== undefined
      if (Number(hasClient) + Number(hasProspect) !== 1) {
        throw new HttpError(400, 'INVALID_RESEARCH_TARGET', 'Choose exactly one client or prospect research target')
      }

      const resolvedKey = await resolveAiKey(context.admin, workspaceId, 'anthropic')
      const byoKeyUsed = resolvedKey?.source === 'workspace'
      if (resolvedKey) anthropicApiKey = resolvedKey.apiKey
      meteringActorUserId = context.user.id
      metering = {
        admin: context.admin,
        workspaceId,
        clientId: hasClient ? String(body.clientId) : null,
        referenceKind: hasProspect ? 'prospect_dashboard' : 'client',
        referenceId: String(hasProspect ? body.prospectDashboardId : body.clientId),
        byoKeyUsed,
      }
      if (hasProspect) {
        const prospectDashboardId = requireUuid(body.prospectDashboardId, 'prospectDashboardId')
        const { data: scopedProspect, error: scopedProspectError } = await context.admin
          .from('prospect_dashboards')
          .select('id,workspace_id,prospect_bio,lifecycle_status,is_active')
          .eq('id', prospectDashboardId)
          .eq('workspace_id', workspaceId)
          .neq('lifecycle_status', 'archived')
          .eq('is_active', true)
          .maybeSingle()
        if (scopedProspectError) {
          throw new HttpError(500, 'PROSPECT_CONTEXT_UNAVAILABLE', 'The prospect profile could not be loaded')
        }
        if (!scopedProspect || scopedProspect.workspace_id !== workspaceId) {
          throw new HttpError(404, 'PROSPECT_NOT_FOUND', 'Active workspace prospect not found')
        }
        prospectBio = scopedProspect.prospect_bio
        clientBio = undefined
      } else {
        const clientId = requireUuid(body.clientId, 'clientId')
        const { data: scopedClient, error: scopedClientError } = await context.admin
          .from('clients')
          .select('id,workspace_id,bio,notes,ai_sdr_profile,status')
          .eq('id', clientId)
          .eq('workspace_id', workspaceId)
          .maybeSingle()

        if (scopedClientError) {
          throw new HttpError(500, 'CLIENT_CONTEXT_UNAVAILABLE', 'The client profile could not be loaded')
        }
        if (!scopedClient || scopedClient.workspace_id !== workspaceId) {
          throw new HttpError(404, 'CLIENT_NOT_FOUND', 'This client is not in this workspace')
        }
        // Named rather than folded into "not found": a paused client is a
        // state the operator can change, a missing one is not.
        if (scopedClient.status !== 'active') {
          throw new HttpError(
            409,
            'CLIENT_NOT_ACTIVE',
            `This client is ${scopedClient.status}. Reactivate them to run this.`,
          )
        }
        clientBio = scopedClient.bio
        prospectBio = undefined
        const pitch = scopedClient.ai_sdr_profile && typeof scopedClient.ai_sdr_profile === 'object'
          ? scopedClient.ai_sdr_profile as Record<string, unknown>
          : {}
        profileSections = [
          ['Notes', scopedClient.notes],
          ['Positioning', pitch.positioning],
          ['Topics and angles', pitch.topics_and_angles],
          ['Listener takeaways', pitch.listener_takeaways],
          ['Proof points', pitch.proof_points],
          ['Ideal opportunities', pitch.ideal_opportunities],
        ]
      }
    } else {
      await requirePlatformAdminOrService(req)
      admin = createAdminClient()
    }

    if (clientBio !== undefined && typeof clientBio !== 'string') {
      throw new HttpError(400, 'INVALID_BIO', 'clientBio must be a string')
    }
    if (prospectBio !== undefined && typeof prospectBio !== 'string') {
      throw new HttpError(400, 'INVALID_BIO', 'prospectBio must be a string')
    }
    if (!Array.isArray(podcasts)) {
      throw new HttpError(400, 'INVALID_PODCASTS', 'podcasts must be an array')
    }

    const targetBio = prospectBio || clientBio
    const isProspectMode = !!prospectBio
    if (!targetBio || targetBio.trim().length === 0) {
      throw new HttpError(400, 'BIO_REQUIRED', `${isProspectMode ? 'Prospect' : 'Client'} bio is required for compatibility scoring`)
    }
    if (podcasts.length === 0) {
      throw new HttpError(400, 'INVALID_PODCASTS', 'Podcasts array is required')
    }
    if (podcasts.some((podcast) => !podcast || typeof podcast.podcast_id !== 'string' || typeof podcast.podcast_name !== 'string')) {
      throw new HttpError(400, 'INVALID_PODCASTS', 'Every podcast needs a podcast_id and podcast_name')
    }
    console.log(`[score-podcast-compatibility] ${isProspectMode ? 'prospect' : 'client'} mode, ${podcasts.length} podcasts`)

    /*
     * Charged here rather than on arrival. Every check between the old charge
     * site and this line — the client still being active, the prospect not
     * archived, a bio existing, podcasts actually being sent — can refuse the
     * request, and each refusal used to bill a workspace for nothing.
     *
     * No idempotency key, deliberately, and the metering contract asserts its
     * absence: a search is not an artifact, so repeating one inside the window
     * is an ordinary second search rather than a retry of the first.
     */
    if (metering) {
      const scoringCharge = await chargeCredits(metering.admin, {
        workspaceId: metering.workspaceId,
        operationType: 'compatibility_scoring',
        referenceKind: metering.referenceKind,
        referenceId: metering.referenceId,
        clientId: metering.clientId,
        actorUserId: meteringActorUserId,
        byoKeyUsed: metering.byoKeyUsed,
      })
      if (scoringCharge.entryId && !scoringCharge.replayed) {
        chargedForRefund = { workspaceId: metering.workspaceId, entryId: scoringCharge.entryId }
        refundAdmin = metering.admin
      }
    }

    const anthropic = new Anthropic({ apiKey: anthropicApiKey })
    const targetLabel = isProspectMode ? 'prospect' : 'client'
    const profile = targetProfile(targetBio, profileSections)
    const episodesById = admin
      ? await storedEpisodes(admin, podcasts.map((podcast) => podcast.podcast_id))
      : new Map<string, ScoringEpisode[]>()
    const episodesFor = (podcast: PodcastForScoring) => episodesById.get(podcast.podcast_id) ?? []
    let anthropicInputTokens = 0
    let anthropicOutputTokens = 0
    const ask = async (prompt: string, maxTokens: number) => {
      const message = await anthropic.messages.create({
        model: SCORING_MODEL,
        max_tokens: maxTokens,
        temperature: 0,
        messages: [{ role: 'user', content: prompt }],
      })
      anthropicInputTokens += message.usage?.input_tokens ?? 0
      anthropicOutputTokens += message.usage?.output_tokens ?? 0
      return messageText(message)
    }

    // One model call per group; the group's misses get their own call each,
    // and only what still fails falls back to the keyword estimate.
    const scoreGroup = async (group: PodcastForScoring[]): Promise<ScoreRow[]> => {
      let groupScores = new Map<string, { score: number; reasoning: string | null }>()
      try {
        const text = await ask(groupScoringPrompt({
          targetLabel,
          profile,
          podcasts: group.map((podcast) => ({ podcast, episodes: episodesFor(podcast) })),
        }), 180 * group.length + 200)
        if (text) groupScores = parseGroupScores(text, group.map((podcast) => podcast.podcast_id))
      } catch (error) {
        console.error('[score-podcast-compatibility] group call failed:', error instanceof Error ? error.message : 'unknown error')
      }
      return await Promise.all(group.map(async (podcast): Promise<ScoreRow> => {
        let parsed = groupScores.get(podcast.podcast_id) ?? null
        if (!parsed) {
          try {
            const text = await ask(singleScoringPrompt({ targetLabel, profile, podcast, episodes: episodesFor(podcast) }), 250)
            parsed = text ? parseSingleScore(text) : null
          } catch (error) {
            console.error('[score-podcast-compatibility] single call failed:', error instanceof Error ? error.message : 'unknown error')
          }
        }
        if (parsed) {
          return {
            podcast_id: podcast.podcast_id,
            score: parsed.score,
            ...(parsed.reasoning ? { reasoning: parsed.reasoning } : {}),
            source: 'ai',
          }
        }
        return { podcast_id: podcast.podcast_id, ...deterministicScore(targetBio, podcast), source: 'deterministic' }
      }))
    }

    const groups: PodcastForScoring[][] = []
    for (let start = 0; start < podcasts.length; start += SCORING_GROUP_SIZE) {
      groups.push(podcasts.slice(start, start + SCORING_GROUP_SIZE))
    }
    const scores = (await Promise.all(groups.map(scoreGroup))).flat()
    const deterministicCount = scores.filter((score) => score.source === 'deterministic').length

    /*
     * A request where the model scored nothing delivered only the keyword
     * estimate, which costs nothing to produce. The charge goes back; the
     * estimates are still returned, labelled, so the caller has something to
     * show. A partly estimated request keeps its flat charge.
     */
    let refunded = false
    if (deterministicCount === scores.length && chargedForRefund && refundAdmin) {
      refunded = await refundCredits(refundAdmin, {
        workspaceId: chargedForRefund.workspaceId,
        entryId: chargedForRefund.entryId,
        reason: 'compatibility scoring fell back to keyword estimates for every podcast',
      })
      chargedForRefund = null
    }
    console.log(`[score-podcast-compatibility] scored ${scores.length - deterministicCount} with AI, ${deterministicCount} estimated`)

    if (metering) {
      await logOperationCost(metering.admin, {
        workspaceId: metering.workspaceId,
        operationType: 'compatibility_scoring',
        usage: { anthropicInputTokens, anthropicOutputTokens },
        usedByoKey: metering.byoKeyUsed,
        clientId: metering.clientId,
        referenceKind: metering.referenceKind,
        referenceId: metering.referenceId,
      })
    }

    /*
     * deterministic_count says how many of these came from the local
     * keyword heuristic rather than the model, and each score names its own
     * source. refunded says the whole request was given back.
     */
    return jsonResponse(req, METHODS, 200, {
      scores,
      deterministic_count: deterministicCount,
      refunded,
    })
  } catch (error) {
    if (chargedForRefund && refundAdmin) {
      await refundCredits(refundAdmin, {
        workspaceId: chargedForRefund.workspaceId,
        entryId: chargedForRefund.entryId,
        reason: 'compatibility scoring failed after the charge',
      })
    }
    return errorResponse(req, METHODS, error)
  }
})
