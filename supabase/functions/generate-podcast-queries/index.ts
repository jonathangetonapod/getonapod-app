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
import { assessProfile, filterQueries, queryProblem } from '../_shared/queryQuality.ts'

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

/**
 * A provider failure is now an error the caller sees, not a cue to quietly
 * hand back template queries. The status and type are logged (never the key)
 * so the cause of the next outage is in the function logs.
 */
function providerFailure(error: unknown): HttpError {
  const status = error instanceof Anthropic.APIError ? error.status : undefined
  const type = error instanceof Anthropic.APIError
    ? (error.error as { error?: { type?: string } } | undefined)?.error?.type
    : error instanceof Error ? error.name : typeof error
  console.error(`[generate-podcast-queries] Anthropic request failed: status=${status ?? 'none'} type=${type ?? 'unknown'}`)
  return new HttpError(502, 'STRATEGY_PROVIDER_FAILED', 'The AI could not draft a search strategy. Try again in a moment.')
}

function noUsableQueries(rejected: Array<{ query: string; problem: string }>): HttpError {
  for (const entry of rejected.slice(0, 10)) {
    console.log(`[generate-podcast-queries] rejected ${entry.query}: ${entry.problem}`)
  }
  return new HttpError(502, 'STRATEGY_UNUSABLE', 'The AI did not return any usable search queries. Try again.')
}

function modelText(message: Anthropic.Message): string {
  const content = message.content.find((block) => block.type === 'text')
  if (!content || content.type !== 'text') throw new HttpError(502, 'STRATEGY_UNUSABLE', 'The AI did not return any usable search queries. Try again.')
  let text = content.text.trim()
  if (text.startsWith('```')) text = text.replace(/^```(?:json)?\n?/u, '').replace(/\n?```$/u, '').trim()
  return text
}

/**
 * The queries array from the model's JSON, or from the array body when the
 * model left a quote unescaped inside a query and the JSON does not parse.
 */
function modelQueries(text: string): string[] {
  try {
    const parsed = JSON.parse(text) as { queries?: unknown }
    return Array.isArray(parsed.queries)
      ? parsed.queries.filter((entry): entry is string => typeof entry === 'string')
      : []
  } catch {
    const arrayMatch = text.match(/"queries"\s*:\s*\[(.*)\]/su)
    if (!arrayMatch) return []
    // Only the JSON string delimiters come off: "a" OR "b" must stay intact.
    return arrayMatch[1].split('","').map((entry) => entry.trim().replace(/^"(.*)"$/su, '$1').replace(/\\"/gu, '"'))
  }
}

serve(async (req) => {
  // Set when a real debit lands, so the outer catch can give it back: a
  // failure after the charge is work the workspace paid for and never got.
  // There is no fallback strategy any more. A template built from the bio's
  // most frequent words returned "and the" and kept the credit for it.
  let chargedForRefund: { workspaceId: string; entryId: string } | null = null
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
    // Everything the workspace has written about the target, not just the bio:
    // the structured pitch profile is where positioning and topics live.
    let profileSections: Array<[string, unknown]> = []

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
          .select('id,workspace_id,name,email,bio,notes,ai_sdr_profile,status')
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

    // Bounded per section like the bio was by the request cap, so a long
    // pitch profile cannot grow the prompt without limit.
    const extraProfile = profileSections
      .filter((entry): entry is [string, string] => typeof entry[1] === 'string' && entry[1].trim() !== '')
      .map(([label, value]) => `- ${label}: ${value.replace(/\s+/gu, ' ').trim().slice(0, 2000)}`)
      .join('\n')
    const profileText = [targetBio?.trim() || '', extraProfile].filter(Boolean).join('\n')

    /*
     * Refused before the charge. A strategy drafted from a name and a website
     * is guesswork, and it used to come back as template filler the workspace
     * paid for. Not 400: the request is well formed, the profile is not ready.
     */
    const assessment = assessProfile(profileText, targetName)
    if (assessment.status === 'profile_too_thin') {
      console.log(`[generate-podcast-queries] profile too thin: ${assessment.reason}`)
      return new Response(
        JSON.stringify({ status: 'profile_too_thin', code: 'PROFILE_TOO_THIN', error: assessment.reason }),
        { status: 422, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }
    const knownWords = assessment.words

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
        chargedForRefund = { workspaceId: metering.workspaceId, entryId: queryCharge.entryId }
        refundAdmin = metering.admin
      }
    }

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
- Profile:
${profileText}

Return exactly one new query as JSON:
{"query": "your query here"}

CRITICAL: Your response must be ONLY valid JSON. No markdown, no code blocks, no explanations. Just the raw JSON object.`

      console.log('🤖 [AI] Calling Claude Sonnet 5.5 to generate new query...')

      const message = await anthropic.messages.create({
        model: 'claude-sonnet-5-5',
        ...({ thinking: { type: 'between_tools' } } as Record<string, unknown>),
        max_tokens: 100,
        messages: [{ role: 'user', content: prompt }],
      }).catch((error: unknown) => {
        throw providerFailure(error)
      })
      await meterUsage(message)

      const jsonText = modelText(message)
      let parsed: { query?: unknown }
      try {
        parsed = JSON.parse(jsonText)
      } catch {
        throw noUsableQueries([{ query: jsonText.slice(0, 120), problem: 'not JSON' }])
      }
      const replacement = typeof parsed.query === 'string' ? parsed.query.trim() : ''
      const problem = !replacement
        ? 'empty'
        : replacement === oldQuery ? 'same as the old query' : queryProblem(replacement, knownWords)
      if (problem) throw noUsableQueries([{ query: replacement, problem }])
      parsed.query = replacement

      return new Response(
        JSON.stringify({ query: parsed.query }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Generate the requested number of queries
    console.log(`🤖 [AI] Generating ${queryCount} strategic podcast search queries...`)
    console.log(`   Using Claude Sonnet 5.5`)

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
- Profile:
${profileText}
${clientEmail ? `- Email: ${clientEmail}` : ''}

Return exactly ${queryCount} queries as a JSON object with this exact format:
{
  "queries": [
${Array.from({ length: queryCount }, (_unused, index) => `    "query ${index + 1} here"`).join(',\n')}
  ]
}

CRITICAL: Your response must be ONLY valid JSON. No markdown, no code blocks, no explanations, no additional text. Just the raw JSON object starting with { and ending with }.`

    const message = await anthropic.messages.create({
      model: 'claude-sonnet-5-5',
      ...({ thinking: { type: 'between_tools' } } as Record<string, unknown>),
      // Scaled with the request: twenty OR-chained queries do not fit in the
      // 500 that five needed, and a truncated reply has no usable queries.
      max_tokens: Math.min(4000, 400 + (queryCount * 80)),
      messages: [{ role: 'user', content: prompt }],
    }).catch((error: unknown) => {
      throw providerFailure(error)
    })
    await meterUsage(message)

    /*
     * Only queries that pass the quality filter are returned, and a short list
     * stays short. Topping it up from a template is how "and the" reached the
     * index; the caller gets fewer good searches or an error, never filler.
     */
    const { queries, rejected } = filterQueries(modelQueries(modelText(message)), knownWords, {
      avoid: avoidQueries,
      limit: queryCount,
    })
    for (const entry of rejected) {
      console.log(`[generate-podcast-queries] rejected ${entry.query}: ${entry.problem}`)
    }
    if (queries.length === 0) throw noUsableQueries(rejected)

    console.log(`[generate-podcast-queries] returning ${queries.length} of ${queryCount} requested queries`)
    return new Response(
      JSON.stringify({ queries }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  } catch (error) {
    console.error('Error:', error)
    if (chargedForRefund && refundAdmin) {
      await refundCredits(refundAdmin, {
        workspaceId: chargedForRefund.workspaceId,
        entryId: chargedForRefund.entryId,
        reason: 'query generation failed after the charge',
      })
    }
    return new Response(
      JSON.stringify({
        error: (error instanceof Error ? error.message : String(error)) || 'Something went wrong on our side. Try again in a moment',
        ...(error instanceof HttpError ? { code: error.code } : {}),
      }),
      { status: error instanceof HttpError ? error.status : 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})
