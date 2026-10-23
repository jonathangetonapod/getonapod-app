import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import Anthropic from 'npm:@anthropic-ai/sdk@0.32.1'
import {
  HttpError,
  parseJsonObject,
  requireAuthenticatedUser,
  requirePlatformAdminOrService,
  requireUuid,
  requireWorkspaceFeatureAccess,
} from '../_shared/workspaceAuth.ts'
import { chargeCredits, logOperationCost, refundCredits } from '../_shared/billing.ts'
import { resolveAiKey } from '../_shared/workspaceAiKeys.ts'
import {
  assessProfile,
  filterQueries,
  MIN_USABLE_QUERIES,
  rejectQuery,
  vocabularyOf,
} from '../_shared/podcastQueryStrategy.ts'

const corsHeaders = {
  'Access-Control-Allow-Origin': Deno.env.get('ALLOWED_ORIGIN') || 'https://getonapod.com',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

/**
 * How many searches a run is built from. Five was hard-coded, and five is the
 * ceiling on how much of the index a run can reach: extra pages of the same
 * query saturate quickly, whereas another query looks somewhere else entirely.
 */
const DEFAULT_QUERY_COUNT = 5
const MIN_QUERY_COUNT = 3
const MAX_QUERY_COUNT = 20

function resolveQueryCount(value: unknown): number {
  // Only a number means a number. Number(null) is 0 and Number('') is 0, and
  // clamping those to the minimum turns "I did not ask" into "give me fewer".
  const requested = typeof value === 'number'
    ? value
    : typeof value === 'string' && value.trim() !== ''
      ? Number(value)
      : Number.NaN
  if (!Number.isFinite(requested)) return DEFAULT_QUERY_COUNT
  return Math.min(MAX_QUERY_COUNT, Math.max(MIN_QUERY_COUNT, Math.trunc(requested)))
}

/*
 * The profile cannot support a strategy. Answered as 422 with a status the
 * finder can branch on, and checked before the charge, so a thin profile
 * costs nothing.
 */
class ProfileTooThinError extends HttpError {
  readonly reason: string

  constructor(reason: string, isProspect: boolean) {
    super(
      422,
      'PROFILE_TOO_THIN',
      `Not enough profile to draft a strategy. Add a bio, topics or talking points to the ${isProspect ? 'prospect' : 'client'}, then try again.`,
    )
    this.reason = reason
  }
}

/*
 * A provider failure is a failure. It used to fall through to a
 * deterministic template that shipped stopwords as searches and kept the
 * charge; now the outer catch refunds and the caller sees what went wrong.
 */
function providerFailure(error: unknown, byoKeyUsed: boolean): HttpError {
  const status = error && typeof error === 'object' ? (error as { status?: unknown }).status : undefined
  console.error('[generate-podcast-queries] AI provider call failed:', error instanceof Error ? error.message : String(error))
  if (status === 401 || status === 403) {
    return byoKeyUsed
      ? new HttpError(502, 'AI_KEY_REJECTED', 'Your workspace AI key was rejected. Update it in workspace settings, then try again.')
      : new HttpError(502, 'AI_PROVIDER_REJECTED', 'The AI service rejected the request. Try again later, or contact support if it keeps happening.')
  }
  return new HttpError(502, 'STRATEGY_GENERATION_FAILED', 'The AI could not draft a search strategy. Try again in a moment.')
}

function weakStrategy(): HttpError {
  return new HttpError(502, 'STRATEGY_TOO_WEAK', 'The AI draft did not produce enough usable searches. Try again.')
}

serve(async (req) => {
  // Set when a real debit lands, so the outer catch can give it back: a
  // failure after the charge is work the workspace paid for and never got.
  let chargedForRefund: { workspaceId: string; entryId: string; amount: number } | null = null
  let refundAdmin: Parameters<typeof refundCredits>[0] | null = null
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    /*
     * Size-capped rather than a bare req.json(). Bios and avoid lists are the
     * caller-controlled text that reaches the model, credits are charged flat
     * per call, and the platform key pays for any workspace without its own —
     * so an unbounded body is a bill, not just a big request.
     */
    const body = await parseJsonObject(req, 32_768)
    // parseJsonObject answers Record<string, unknown>, so the shape is asserted
    // once here rather than at every use.
    let { clientName, clientBio, clientEmail, prospectName, prospectBio } = body as {
      clientName?: string
      clientBio?: string
      clientEmail?: string
      prospectName?: string
      prospectBio?: string
    }
    const oldQuery = typeof body.oldQuery === 'string' ? body.oldQuery : undefined
    const queryCount = resolveQueryCount(body.queryCount)
    // Searches a previous run already used. Repeating them returns the same
    // shows, so a second run on the same profile should look elsewhere.
    // Bounded and flattened: this is the one caller-controlled string that
    // reaches the prompt, and a newline in it would let an entry stop being a
    // list item and start being an instruction.
    const avoidQueries: string[] = Array.isArray(body.avoidQueries)
      ? body.avoidQueries
        .filter((entry: unknown): entry is string => typeof entry === 'string' && entry.trim() !== '')
        .map((entry: string) => entry.replace(/\s+/gu, ' ').trim().slice(0, 200))
        .slice(0, 40)
      : []
    const scopedRequest = body.workspaceId !== undefined
      || body.clientId !== undefined
      || body.prospectDashboardId !== undefined

    let anthropicApiKey = Deno.env.get('ANTHROPIC_API_KEY') || ''
    let metering: {
      admin: Awaited<ReturnType<typeof requireAuthenticatedUser>>['admin']
      workspaceId: string
      clientId: string | null
      referenceKind: string
      referenceId: string
      byoKeyUsed: boolean
      actorUserId: string
    } | null = null

    if (scopedRequest) {
      const workspaceId = requireUuid(body.workspaceId, 'workspaceId')
      const context = await requireAuthenticatedUser(req)
      await requireWorkspaceFeatureAccess(context, workspaceId)
      const hasClient = body.clientId !== undefined
      const hasProspect = body.prospectDashboardId !== undefined
      if (Number(hasClient) + Number(hasProspect) !== 1) {
        throw new HttpError(400, 'INVALID_RESEARCH_TARGET', 'Choose exactly one client or prospect research target')
      }

      const resolvedKey = await resolveAiKey(context.admin, workspaceId, 'anthropic')
      const byoKeyUsed = resolvedKey?.source === 'workspace'
      if (resolvedKey) anthropicApiKey = resolvedKey.apiKey
      metering = {
        admin: context.admin,
        workspaceId,
        clientId: hasClient ? String(body.clientId) : null,
        referenceKind: hasProspect ? 'prospect_dashboard' : 'client',
        referenceId: String(hasProspect ? body.prospectDashboardId : body.clientId),
        byoKeyUsed,
        actorUserId: context.user.id,
      }

      if (hasProspect) {
        const prospectDashboardId = requireUuid(body.prospectDashboardId, 'prospectDashboardId')
        const { data: scopedProspect, error: scopedProspectError } = await context.admin
          .from('prospect_dashboards')
          .select('id,workspace_id,prospect_name,prospect_bio,lifecycle_status,is_active')
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
        prospectName = scopedProspect.prospect_name
        prospectBio = scopedProspect.prospect_bio
        clientName = undefined
        clientBio = undefined
        clientEmail = undefined
      } else {
        const clientId = requireUuid(body.clientId, 'clientId')
        const { data: scopedClient, error: scopedClientError } = await context.admin
          .from('clients')
          .select('id,workspace_id,name,email,bio,status')
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
        clientName = scopedClient.name
        clientBio = scopedClient.bio
        clientEmail = scopedClient.email
        prospectName = undefined
        prospectBio = undefined
      }
    } else {
      await requirePlatformAdminOrService(req)
    }

    // Type validation
    if (clientName !== undefined && typeof clientName !== 'string') {
      return new Response(
        JSON.stringify({ error: 'clientName must be a string' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    if (clientBio !== undefined && typeof clientBio !== 'string') {
      return new Response(
        JSON.stringify({ error: 'clientBio must be a string' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    if (prospectName !== undefined && typeof prospectName !== 'string') {
      return new Response(
        JSON.stringify({ error: 'prospectName must be a string' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    if (prospectBio !== undefined && typeof prospectBio !== 'string') {
      return new Response(
        JSON.stringify({ error: 'prospectBio must be a string' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Support both client and prospect mode
    const targetName = prospectName || clientName
    const targetBio = prospectBio || clientBio
    const isProspectMode = !!prospectName

    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
    console.log('🎯 [PODCAST FINDER] Query Generation Request')
    console.log(`   Mode: ${isProspectMode ? 'PROSPECT' : 'CLIENT'}`)
    console.log(`   Name: ${targetName?.substring(0, 50)}`)
    console.log(`   Bio length: ${targetBio?.length || 0} characters`)
    console.log(`   ${oldQuery ? 'Regenerating' : `Generating ${queryCount}`} queries`)
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')

    const profile = assessProfile(targetBio, targetName)
    if (profile.thin) {
      console.log(`[generate-podcast-queries] Profile too thin: ${profile.reason}`)
      throw new ProfileTooThinError(profile.reason, isProspectMode)
    }
    const vocabulary = vocabularyOf(targetBio, targetName)

    // Charged only once the profile can support a strategy.
    if (metering) {
      const queryCharge = await chargeCredits(metering.admin, {
        workspaceId: metering.workspaceId,
        operationType: 'query_generation',
        referenceKind: metering.referenceKind,
        referenceId: metering.referenceId,
        clientId: metering.clientId,
        actorUserId: metering.actorUserId,
        byoKeyUsed: metering.byoKeyUsed,
      })
      if (queryCharge.entryId && !queryCharge.replayed) {
        chargedForRefund = { workspaceId: metering.workspaceId, entryId: queryCharge.entryId, amount: queryCharge.charged }
        refundAdmin = metering.admin
      }
    }
    const byoKeyUsed = metering?.byoKeyUsed ?? false

    const anthropic = new Anthropic({ apiKey: anthropicApiKey })

    const meterUsage = async (message: { usage?: { input_tokens?: number; output_tokens?: number } } | null) => {
      if (!metering || !message) return
      await logOperationCost(metering.admin, {
        workspaceId: metering.workspaceId,
        operationType: 'query_generation',
        usage: {
          anthropicInputTokens: message.usage?.input_tokens ?? 0,
          anthropicOutputTokens: message.usage?.output_tokens ?? 0,
        },
        usedByoKey: metering.byoKeyUsed,
        clientId: metering.clientId,
        referenceKind: metering.referenceKind,
        referenceId: metering.referenceId,
      })
    }

    // If oldQuery is provided, regenerate a single query
    if (oldQuery) {
      console.log('🔄 [REGENERATE] Replacing poor-performing query')
      console.log(`   Old query: ${oldQuery.substring(0, 100)}`)

      const prompt = `You are an expert podcast researcher using Podscan.fm.

Your task: Generate a *new*, high-volume podcast search query (3–7 words) for Podscan.fm,
designed to return as many relevant podcasts as possible.

The query should be a phrase or combination of phrases likely to appear in the TITLE of a podcast.
- Stay broad, but always relevant to the ${isProspectMode ? 'prospect' : 'client'}'s domain
- Use double quotes "like this" for exact phrases (e.g., "leadership podcast")
- Use * wildcards within quoted phrases (e.g., "leadership * podcast")
- Use Boolean operators (AND, OR, NOT) to combine multiple phrases
- Use Podscan's documented double-quote syntax for every exact phrase
- The new query must NOT be a duplicate of or too similar to: "${oldQuery}"
- Do not use the ${isProspectMode ? 'prospect' : 'client'}'s name or brand

Based on ${isProspectMode ? 'prospect' : 'client'} data:
- Name: ${targetName}
- Bio: ${targetBio}

Return exactly one new query as JSON:
{"query": "your query here"}

CRITICAL: Your response must be ONLY valid JSON. No markdown, no code blocks, no explanations. Just the raw JSON object.`

      console.log('🤖 [AI] Calling Claude Opus 4.5 to generate new query...')

      const message = await anthropic.messages.create({
        model: 'claude-opus-4-5-20251101',
        max_tokens: 100,
        temperature: 0.9,
        messages: [{ role: 'user', content: prompt }],
      }).catch((error: unknown) => {
        throw providerFailure(error, byoKeyUsed)
      })
      await meterUsage(message)

      const content = message.content[0]
      if (content?.type !== 'text') throw weakStrategy()

      // Strip markdown code blocks if present
      let jsonText = content.text.trim()
      if (jsonText.startsWith('```')) {
        jsonText = jsonText.replace(/^```(?:json)?\n?/, '').replace(/\n?```$/, '').trim()
      }

      let parsed: { query?: unknown }
      try {
        parsed = JSON.parse(jsonText)
      } catch {
        console.error('[generate-podcast-queries] Regenerated query was not valid JSON:', jsonText.substring(0, 200))
        throw weakStrategy()
      }

      const query = typeof parsed.query === 'string' ? parsed.query.trim() : ''
      const rejection = query && query !== oldQuery ? rejectQuery(query, vocabulary) : 'empty'
      if (rejection) {
        console.error(`[generate-podcast-queries] Regenerated query rejected (${rejection}): ${query.substring(0, 200)}`)
        throw weakStrategy()
      }

      console.log(`[generate-podcast-queries] Regenerated query: ${query}`)
      return new Response(
        JSON.stringify({ status: 'ok', query }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Generate the requested number of queries
    console.log(`🤖 [AI] Generating ${queryCount} strategic podcast search queries...`)
    console.log(`   Using Claude Opus 4.5 with temperature 0.8`)

    const prompt = `You are an expert podcast researcher using Podscan.fm.
Your goal: Generate ${queryCount} *broad, high-volume, but relevant* podcast search queries (each 3–7 words),
designed to return the most possible relevant podcasts in Podscan.fm—using advanced search syntax.

**Every query should be something likely to appear in the TITLE of a podcast, and should be
relevant to the ${isProspectMode ? 'prospect' : 'client'}'s domain.**

STRATEGIC MIX (IMPORTANT):
Spread the ${queryCount} queries across these kinds, in roughly this proportion:
1. Precise queries (${isProspectMode ? 'prospect' : 'client'}'s exact niche + specific terms) — about a fifth
2. Broad synonym queries (use OR to combine 3-5 related terms) — about two fifths
3. Wildcard queries (use * for variation: startup * podcast, business * stories) — about a fifth
4. Adjacent category queries (related but slightly different audience) — about a fifth
Every query must reach podcasts the others would miss. Near-duplicates waste a
search: the whole point of asking for ${queryCount} is ${queryCount} different corners of the index.

ADVANCED SEARCH SYNTAX RULES:
- Use double quotes "like this" for exact phrases (e.g., "digital marketing", "business leadership")
- Use * wildcards within quoted phrases for broader matching (e.g., "startup * podcast", "business * stories")
- Use Boolean operators (AND, OR, NOT) to combine multiple search terms
  Example: "B2B marketing" OR "SaaS marketing" OR "growth hacking"
- At least 2 queries MUST use wildcards (*) within quoted phrases
- At least 2 queries MUST use OR operators to combine multiple phrases
- Combine synonyms, adjacent industries, and related terms to cast the widest net while staying on-topic
- IMPORTANT: Podscan exact phrases require double quotes. Do not use single quotes as phrase operators.

QUALITY GUIDELINES:
- Do **not** use the ${isProspectMode ? 'prospect' : 'client'}'s name, brand, or job title in queries
- **Avoid** generic one-word queries like just "business", "success", "leadership"
- If you must use broad terms, always pair them with a specific modifier (e.g., "business leadership", "organizational culture")
- No duplicate queries or near-duplicates
- Think laterally - if ${isProspectMode ? 'prospect' : 'client'} is in SaaS, also search marketing/sales/tech podcasts
- Queries should find 100-300 podcasts each (broad is good!)

**Examples of excellent, high-coverage queries:**
- "business leadership" OR "executive coaching"
- "startup * podcast" OR "founder * stories"
- "digital marketing" OR "growth marketing" OR "content strategy"
- "sales * leaders" OR "revenue growth"
- "women in tech" OR "technology innovation"

${avoidQueries.length > 0 ? `ALREADY SEARCHED — do not repeat these or anything close to them, and deliberately go after different vocabulary, adjacent industries, and different show formats:
${avoidQueries.map((query: string) => `- ${query}`).join('\n')}

` : ''}Based on the following ${isProspectMode ? 'prospect' : 'client'} data:
- Name: ${targetName}
- Bio: ${targetBio}
${clientEmail ? `- Email: ${clientEmail}` : ''}

Return exactly ${queryCount} queries as a JSON object with this exact format:
{
  "queries": [
${Array.from({ length: queryCount }, (_unused, index) => `    "query ${index + 1} here"`).join(',\n')}
  ]
}

CRITICAL: Your response must be ONLY valid JSON. No markdown, no code blocks, no explanations, no additional text. Just the raw JSON object starting with { and ending with }.`

    const message = await anthropic.messages.create({
      model: 'claude-opus-4-5-20251101',
      // Scaled with the request: twenty OR-chained queries do not fit in the
      // 500 that five needed, and a truncated answer has nothing to parse.
      max_tokens: Math.min(4000, 400 + (queryCount * 80)),
      temperature: 0.8,
      messages: [{ role: 'user', content: prompt }],
    }).catch((error: unknown) => {
      throw providerFailure(error, byoKeyUsed)
    })
    await meterUsage(message)

    const content = message.content[0]
    if (content?.type !== 'text') throw weakStrategy()

    // Strip markdown code blocks if present
    let jsonText = content.text.trim()
    if (jsonText.startsWith('```')) {
      jsonText = jsonText.replace(/^```(?:json)?\n?/, '').replace(/\n?```$/, '').trim()
    }

    let candidates: unknown[] = []
    try {
      const parsed = JSON.parse(jsonText) as { queries?: unknown }
      candidates = Array.isArray(parsed.queries) ? parsed.queries : []
    } catch {
      /*
       * The model sometimes leaves the quotes inside a query unescaped, which
       * is invalid JSON but still a readable list. Split on the "," between
       * elements and take only the JSON string delimiters off each one:
       * stripping every outer quote turned "a" OR "b" into a" OR "b.
       */
      const arrayMatch = jsonText.match(/"queries"\s*:\s*\[(.*)\]/s)
      if (arrayMatch) {
        candidates = arrayMatch[1]
          .split('","')
          .map((entry: string) => entry.trim().replace(/^"(.*)"$/su, '$1').replace(/\\"/gu, '"'))
      } else {
        console.error('[generate-podcast-queries] Model answer was not a query list:', jsonText.substring(0, 300))
      }
    }

    /*
     * Only queries a search can use survive: no stopword-only phrases, no
     * template fragments, nothing unrelated to the profile, nothing already
     * searched. A short list is returned short; it is never padded.
     */
    const { kept, rejected } = filterQueries(candidates, vocabulary, queryCount, avoidQueries)
    for (const entry of rejected) {
      console.log(`[generate-podcast-queries] Dropped query (${entry.reason}): ${entry.query.substring(0, 200)}`)
    }
    if (kept.length < Math.min(MIN_USABLE_QUERIES, queryCount)) throw weakStrategy()

    console.log(`[generate-podcast-queries] Generated ${kept.length} of ${queryCount} requested queries:`)
    kept.forEach((query, index) => console.log(`   ${index + 1}. ${query}`))

    return new Response(
      JSON.stringify({ status: 'ok', queries: kept }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  } catch (error) {
    if (!(error instanceof ProfileTooThinError)) console.error('Error:', error)
    let creditsRefunded = 0
    if (chargedForRefund && refundAdmin) {
      const refunded = await refundCredits(refundAdmin, {
        workspaceId: chargedForRefund.workspaceId,
        entryId: chargedForRefund.entryId,
        reason: 'query generation failed after the charge',
      })
      if (refunded) creditsRefunded = chargedForRefund.amount
    }
    return new Response(
      JSON.stringify({
        status: error instanceof ProfileTooThinError ? 'profile_too_thin' : 'failed',
        error: (error instanceof Error ? error.message : String(error)) || 'Something went wrong on our side. Try again in a moment',
        ...(error instanceof HttpError ? { code: error.code } : {}),
        ...(error instanceof ProfileTooThinError ? { reason: error.reason } : {}),
        credits_charged: chargedForRefund?.amount ?? 0,
        credits_refunded: creditsRefunded,
      }),
      { status: error instanceof HttpError ? error.status : 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})
