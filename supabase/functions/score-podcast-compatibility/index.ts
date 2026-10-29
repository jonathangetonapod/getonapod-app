import { credentialProvider, textTokenUsage, textAiClient, platformTextAiKey, type TextAiCredential, type TextAiMessage } from '../_shared/textAi.ts'
import { providerException } from '../_shared/providerErrors.ts'
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
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
  writeAudit,
} from '../_shared/workspaceAuth.ts'
import { type ClientFitProfile, loadClientFitProfile } from '../_shared/clientFitProfile.ts'
import { chargeCredits, logOperationCost, refundCredits } from '../_shared/billing.ts'
import { resolveTextAiKey, } from '../_shared/workspaceAiKeys.ts'
import {
  groupScoringPrompt,
  parseGroupScores,
  parseSingleScore,
  SCORING_GROUP_SIZE,
  singleScoringPrompt,
  storedEpisodeTitles,
  targetProfile,
  type ParsedScore,
  type ScoringEpisode,
  type ScoringPodcast,
} from '../_shared/compatibilityPrompt.ts'

const METHODS = ['POST'] as const
const SCORING_MODEL = 'claude-sonnet-5-5'
const MANAGER_ROLES = new Set(['owner', 'admin', 'platform_admin'])
const MAX_SHORTLIST_IDS = 20
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu

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
  concerns?: string[]
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

function deterministicScore(targetText: string, podcast: PodcastForScoring) {
  const targetTokens = meaningfulTokens(targetText)
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

function messageText(message: TextAiMessage): string | null {
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

function shortlistIds(value: unknown): string[] {
  if (!Array.isArray(value) || value.length === 0 || value.length > MAX_SHORTLIST_IDS) {
    throw new HttpError(400, 'INVALID_SHORTLIST_IDS', `shortlistPodcastIds must list 1 to ${MAX_SHORTLIST_IDS} shortlist rows`)
  }
  if (value.some((id) => typeof id !== 'string' || !UUID_PATTERN.test(id))) {
    throw new HttpError(400, 'INVALID_SHORTLIST_IDS', 'shortlistPodcastIds must be shortlist row ids')
  }
  return [...new Set((value as string[]).map((id) => id.toLowerCase()))]
}

/*
 * The client's own shortlist rows, with the shared catalog's current copy of
 * each show laid over the snapshot taken when it was added — the same merge
 * the shortlist editor shows.
 */
async function shortlistPodcasts(
  admin: ReturnType<typeof createAdminClient>,
  clientId: string,
  ids: string[],
): Promise<Array<{ rowId: string; podcast: PodcastForScoring }>> {
  const { data: rows, error } = await admin
    .from('client_dashboard_podcasts')
    .select('id,podcast_id,podcast_name,podcast_description,publisher_name,podcast_categories,audience_size,episode_count')
    .eq('client_id', clientId)
    .in('id', ids)
  if (error) throw new HttpError(500, 'SHORTLIST_LOOKUP_FAILED', 'The shortlist could not be loaded')
  if (!rows || rows.length === 0) throw new HttpError(404, 'SHORTLIST_PODCAST_NOT_FOUND', 'None of these shows are on this client\'s shortlist')
  const podscanIds = rows.map((row) => String(row.podcast_id)).filter((id) => /^[a-zA-Z0-9_-]+$/u.test(id))
  const catalog = podscanIds.length > 0
    ? await admin
      .from('podcasts')
      .select('podscan_id,podcast_name,podcast_description,publisher_name,podcast_categories,audience_size,episode_count')
      .in('podscan_id', podscanIds)
    : { data: [], error: null }
  const catalogById = new Map((catalog.error ? [] : catalog.data ?? []).map((row) => [String(row.podscan_id), row]))
  return rows.map((row) => {
    const current = catalogById.get(String(row.podcast_id))
    return {
      rowId: String(row.id),
      podcast: {
        podcast_id: String(row.podcast_id),
        podcast_name: current?.podcast_name || row.podcast_name || 'Untitled podcast',
        podcast_description: current?.podcast_description ?? row.podcast_description ?? null,
        publisher_name: current?.publisher_name ?? row.publisher_name ?? null,
        podcast_categories: current?.podcast_categories ?? row.podcast_categories ?? null,
        audience_size: current?.audience_size ?? row.audience_size ?? null,
        episode_count: current?.episode_count ?? row.episode_count ?? null,
      },
    }
  })
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
      /** Score these shortlist rows and save the result on them. Client mode only. */
      shortlistPodcastIds?: unknown
    }
    let { clientBio, prospectBio } = body
    const scopedRequest = body.workspaceId !== undefined
      || body.clientId !== undefined
      || body.prospectDashboardId !== undefined
    const shortlistMode = body.shortlistPodcastIds !== undefined
    // Workspace callers are capped: one request scores at most 20 podcasts.
    let podcasts = scopedRequest && Array.isArray(body.podcasts)
      ? body.podcasts.slice(0, 20)
      : body.podcasts

    let anthropicApiKey: TextAiCredential = platformTextAiKey() ?? ''
    let meteringActorUserId = ''
    let admin: ReturnType<typeof createAdminClient> | null = null
    // Everything on file about the client: bio, guest brief and intake answers.
    let clientProfile: ClientFitProfile | null = null
    let shortlistRows: Array<{ rowId: string; podcast: PodcastForScoring }> = []
    let actorRole = ''
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
      actorRole = (await requireWorkspaceFeatureAccess(context, workspaceId)).role
      admin = context.admin
      const hasClient = body.clientId !== undefined
      const hasProspect = body.prospectDashboardId !== undefined
      if (Number(hasClient) + Number(hasProspect) !== 1) {
        throw new HttpError(400, 'INVALID_RESEARCH_TARGET', 'Choose exactly one client or prospect research target')
      }

      const resolvedKey = await resolveTextAiKey(context.admin, workspaceId)
      const byoKeyUsed = resolvedKey?.source === 'workspace'
      if (resolvedKey) anthropicApiKey = resolvedKey
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
        try {
          clientProfile = await loadClientFitProfile(context.admin, workspaceId, clientId)
        } catch {
          throw new HttpError(500, 'CLIENT_CONTEXT_UNAVAILABLE', 'The client profile could not be loaded')
        }
        if (!clientProfile) {
          throw new HttpError(404, 'CLIENT_NOT_FOUND', 'This client is not in this workspace')
        }
        // Named rather than folded into "not found": a paused client is a
        // state the operator can change, a missing one is not.
        if (clientProfile.status !== 'active') {
          throw new HttpError(
            409,
            'CLIENT_NOT_ACTIVE',
            `This client is ${clientProfile.status}. Reactivate them to run this.`,
          )
        }
        clientBio = undefined
        prospectBio = undefined
      }
    } else {
      await requirePlatformAdminOrService(req)
      admin = createAdminClient()
    }

    if (shortlistMode) {
      if (!clientProfile || !metering?.clientId) {
        throw new HttpError(400, 'INVALID_RESEARCH_TARGET', 'Shortlist scoring needs a workspace client')
      }
      if (body.podcasts !== undefined) {
        throw new HttpError(400, 'INVALID_PODCASTS', 'Send podcasts or shortlistPodcastIds, not both')
      }
      // Saving onto the shortlist is a shortlist edit, which only managers make.
      if (!MANAGER_ROLES.has(actorRole)) {
        throw new HttpError(403, 'WORKSPACE_MANAGER_REQUIRED', 'Workspace manager access is required')
      }
      shortlistRows = await shortlistPodcasts(metering.admin, metering.clientId, shortlistIds(body.shortlistPodcastIds))
      podcasts = shortlistRows.map((row) => row.podcast)
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
    // A workspace client is scored on everything on file, so a guest brief or
    // a submitted intake is enough without a bio.
    const profile = clientProfile ? clientProfile.profile : targetProfile(targetBio ?? '')
    if (!profile.trim()) {
      throw new HttpError(
        400,
        'BIO_REQUIRED',
        clientProfile
          ? 'Add a bio, guest brief or intake for this client before scoring'
          : `${isProspectMode ? 'Prospect' : 'Client'} bio is required for compatibility scoring`,
      )
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

    const anthropic = textAiClient(anthropicApiKey)
    const targetLabel = isProspectMode ? 'prospect' : 'client'
    const episodesById = admin
      ? await storedEpisodes(admin, podcasts.map((podcast) => podcast.podcast_id))
      : new Map<string, ScoringEpisode[]>()
    const episodesFor = (podcast: PodcastForScoring) => episodesById.get(podcast.podcast_id) ?? []
    let anthropicInputTokens = 0
    let anthropicOutputTokens = 0
    const ask = async (prompt: string, maxTokens: number) => {
      const message = await anthropic.messages.create({
        model: SCORING_MODEL,
        ...({ thinking: { type: 'between_tools' } } as Record<string, unknown>),
        max_tokens: maxTokens,
        messages: [{ role: 'user', content: prompt }],
      }).catch((error: unknown) => { throw error instanceof HttpError ? error : providerException(credentialProvider(anthropicApiKey), error) })
      anthropicInputTokens += message.usage?.input_tokens ?? 0
      anthropicOutputTokens += message.usage?.output_tokens ?? 0
      return messageText(message)
    }

    // One model call per group; the group's misses get their own call each,
    // and only what still fails falls back to the keyword estimate.
    const scoreGroup = async (group: PodcastForScoring[]): Promise<ScoreRow[]> => {
      let groupScores = new Map<string, ParsedScore>()
      try {
        const text = await ask(groupScoringPrompt({
          targetLabel,
          profile,
          podcasts: group.map((podcast) => ({ podcast, episodes: episodesFor(podcast) })),
        }), 240 * group.length + 200)
        if (text) groupScores = parseGroupScores(text, group.map((podcast) => podcast.podcast_id))
      } catch (error) {
        console.error('[score-podcast-compatibility] group call failed:', error instanceof Error ? error.message : 'unknown error')
      }
      return await Promise.all(group.map(async (podcast): Promise<ScoreRow> => {
        let parsed = groupScores.get(podcast.podcast_id) ?? null
        if (!parsed) {
          try {
            const text = await ask(singleScoringPrompt({ targetLabel, profile, podcast, episodes: episodesFor(podcast) }), 320)
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
            ...(parsed.concerns.length > 0 ? { concerns: parsed.concerns } : {}),
            source: 'ai',
          }
        }
        return { podcast_id: podcast.podcast_id, ...deterministicScore(profile, podcast), source: 'deterministic' }
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

    /*
     * Shortlist mode keeps the result on each row, with the fingerprint of the
     * profile it was judged against so a later brief or intake change shows
     * the score as stale. Estimates are saved too, labelled, so the row says
     * what happened rather than looking untouched.
     */
    let saved = 0
    if (shortlistMode && clientProfile && metering?.clientId) {
      const scoredAt = new Date().toISOString()
      const rowIdByPodcast = new Map(shortlistRows.map((row) => [row.podcast.podcast_id, row.rowId]))
      const writes = await Promise.all(scores.map(async (row) => {
        const rowId = rowIdByPodcast.get(row.podcast_id)
        if (!rowId || row.score === null) return false
        const { error } = await metering!.admin
          .from('client_dashboard_podcasts')
          .update({
            fit_score: Math.min(10, Math.max(1, Math.round(row.score * 10) / 10)),
            fit_reasoning: row.reasoning ?? null,
            fit_concerns: row.concerns ?? [],
            fit_source: row.source === 'ai' ? 'ai' : 'estimate',
            fit_scored_at: scoredAt,
            fit_profile_hash: clientProfile!.hash,
          })
          .eq('id', rowId)
          .eq('client_id', metering!.clientId!)
        return !error
      }))
      saved = writes.filter(Boolean).length
      if (saved === 0) {
        throw new HttpError(500, 'SHORTLIST_SCORE_SAVE_FAILED', 'The fit scores could not be saved')
      }
      await writeAudit(metering.admin, {
        workspaceId: metering.workspaceId,
        actorUserId: meteringActorUserId,
        action: 'workspace.client.shortlist.fit_scored',
        entityType: 'client',
        entityId: metering.clientId,
        metadata: { shortlist_podcast_ids: shortlistRows.map((row) => row.rowId), saved, estimated: deterministicCount },
      })
    }

    if (metering) {
      await logOperationCost(metering.admin, {
        workspaceId: metering.workspaceId,
        operationType: 'compatibility_scoring',
        usage: textTokenUsage(anthropicApiKey, anthropicInputTokens, anthropicOutputTokens),
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
      ...(shortlistMode && clientProfile ? { saved, profile_hash: clientProfile.hash } : {}),
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
