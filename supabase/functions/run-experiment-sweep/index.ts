import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import Anthropic from 'npm:@anthropic-ai/sdk@0.32.1'

const corsHeaders = {
  'Access-Control-Allow-Origin': Deno.env.get('ALLOWED_ORIGIN') || 'https://getonapod.com',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

/**
 * Run a parameter sweep of AI scoring experiments.
 *
 * Tests all combinations of model x cutoff x prompt against prospect feedback
 * data. Caches scoring results so the same podcast scored with the same
 * model+prompt isn't scored twice (only the cutoff changes).
 *
 * 5-minute time limit — reports partial results if cut short.
 *
 * POST { models, cutoffs, prompts }
 */

interface PodcastRow {
  podcast_id: string
  podcast_name: string
  podcast_description?: string | null
  publisher_name?: string | null
  podcast_categories?: any | null
  audience_size?: number | null
  episode_count?: number | null
}

function buildPodcastInfo(podcast: PodcastRow): string {
  const categories = Array.isArray(podcast.podcast_categories)
    ? podcast.podcast_categories.map((c: any) => typeof c === 'string' ? c : c.category_name).join(', ')
    : 'None'

  return `Podcast Name: ${podcast.podcast_name}
Host/Publisher: ${podcast.publisher_name || 'Unknown'}
Description: ${podcast.podcast_description || 'No description available'}
Categories: ${categories}
Audience Size: ${podcast.audience_size ? podcast.audience_size.toLocaleString() : 'Unknown'}
Episodes: ${podcast.episode_count || 'Unknown'}`
}

const PROMPT_VARIANTS: Record<string, (prospectBio: string, podcastInfo: string) => string> = {
  default: (prospectBio, podcastInfo) => `You are a podcast booking expert. Rate the compatibility (1-10) between this prospect and podcast.

Prospect Bio:
${prospectBio}

Podcast Information:
${podcastInfo}

Scoring Guidelines:
- 9-10: Perfect match - prospect's expertise directly aligns with podcast's focus and audience
- 7-8: Strong match - related topics, good audience overlap
- 5-6: Moderate match - some relevance but not ideal
- 3-4: Weak match - tangentially related
- 1-2: Poor match - not relevant

Return your answer as JSON in this exact format:
{
  "score": <number 1-10>,
  "reasoning": "<2-3 sentences explaining why this score>"
}

CRITICAL: Your response must be ONLY valid JSON. No markdown, no code blocks, just the raw JSON object.`,

  strict: (prospectBio, podcastInfo) => `You are a highly selective podcast booking expert. Rate the compatibility (1-10) between this prospect and podcast. Be STRICT in your scoring.

Prospect Bio:
${prospectBio}

Podcast Information:
${podcastInfo}

Scoring Guidelines (be conservative):
- 9-10: EXACT topic match. The prospect is a recognized authority on the podcast's core subject AND the podcast has a substantial, established audience (10,000+ listeners).
- 7-8: Very close topic match with clear audience overlap. The prospect could speak directly to the podcast's core audience with authority.
- 5-6: Related but not ideal. The prospect's expertise touches on the podcast's topics but isn't a direct match.
- 3-4: Only loosely connected. Different industries or audiences.
- 1-2: No meaningful connection.

IMPORTANT: Default to a LOWER score when uncertain. A 7 should feel like an obvious good fit. Anything below 7 is not worth pursuing.

Return your answer as JSON in this exact format:
{
  "score": <number 1-10>,
  "reasoning": "<2-3 sentences explaining why this score>"
}

CRITICAL: Your response must be ONLY valid JSON. No markdown, no code blocks, just the raw JSON object.`,

  lenient: (prospectBio, podcastInfo) => `You are a creative podcast booking strategist. Rate the compatibility (1-10) between this prospect and podcast. Consider ADJACENT topics and creative angles.

Prospect Bio:
${prospectBio}

Podcast Information:
${podcastInfo}

Scoring Guidelines (be generous with creative connections):
- 9-10: Perfect direct match OR a brilliant creative angle that would make for a compelling episode.
- 7-8: Good match. The prospect has relevant expertise, even if the podcast isn't exactly their core topic. Consider: Would the host's audience find value in this guest's perspective?
- 5-6: Some connection exists. The prospect could contribute a unique viewpoint even if they're not the obvious choice.
- 3-4: Stretch. Only tangentially related.
- 1-2: No realistic connection.

IMPORTANT: Consider cross-industry insights, transferable expertise, and audience curiosity. A fintech CEO could be a great fit for a leadership podcast. A health expert could work on a productivity show. Think creatively. Also give more credit to smaller niche podcasts where the prospect would be a natural fit.

Return your answer as JSON in this exact format:
{
  "score": <number 1-10>,
  "reasoning": "<2-3 sentences explaining why this score>"
}

CRITICAL: Your response must be ONLY valid JSON. No markdown, no code blocks, just the raw JSON object.`,
}

async function scorePodcast(
  anthropic: any,
  model: string,
  prospectBio: string,
  podcast: PodcastRow,
  promptKey: string
): Promise<number | null> {
  try {
    const podcastInfo = buildPodcastInfo(podcast)
    const promptFn = PROMPT_VARIANTS[promptKey]
    if (!promptFn) {
      console.warn(`[RunExperimentSweep] Unknown prompt key: ${promptKey}, falling back to default`)
      return null
    }
    const prompt = promptFn(prospectBio, podcastInfo)

    const message = await anthropic.messages.create({
      model,
      max_tokens: 200,
      temperature: 0,
      messages: [{ role: 'user', content: prompt }],
    })

    const content = message.content[0]
    if (content.type !== 'text') return null

    let jsonText = content.text.trim()
    if (jsonText.startsWith('```')) {
      jsonText = jsonText.replace(/^```(?:json)?\n?/, '').replace(/\n?```$/, '').trim()
    }

    try {
      const parsed = JSON.parse(jsonText)
      return parsed.score
    } catch {
      const match = content.text.match(/\b([1-9]|10)\b/)
      return match ? parseInt(match[1], 10) : null
    }
  } catch (error) {
    console.warn(`[RunExperimentSweep] Scoring error: ${error.message}`)
    return null
  }
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  const startTime = Date.now()
  const TIME_LIMIT_MS = 5 * 60 * 1000 // 5 minutes

  try {
    let body: any
    try {
      body = await req.json()
    } catch {
      return new Response(
        JSON.stringify({ success: false, error: 'Request body must be valid JSON' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    const {
      models = ['claude-haiku-4-5-20251001'],
      cutoffs = [6, 7, 8, 9],
      prompts = ['default', 'strict', 'lenient'],
    } = body

    const totalCombinations = models.length * cutoffs.length * prompts.length
    console.log('[RunExperimentSweep] Starting AI scoring parameter sweep')
    console.log(`  Models: ${models.join(', ')}`)
    console.log(`  Cutoffs: ${cutoffs.join(', ')}`)
    console.log(`  Prompts: ${prompts.join(', ')}`)
    console.log(`  Total combinations: ${totalCombinations}`)

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const anthropicApiKey = Deno.env.get('ANTHROPIC_API_KEY')

    if (!anthropicApiKey) {
      return new Response(
        JSON.stringify({ success: false, error: 'ANTHROPIC_API_KEY not configured' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    const supabase = createClient(supabaseUrl, supabaseKey)
    const anthropic = new Anthropic({ apiKey: anthropicApiKey })

    // -----------------------------------------------------------
    // Pre-load all data once
    // -----------------------------------------------------------

    // 1. Fetch all feedback
    const { data: feedbackRows, error: feedbackError } = await supabase
      .from('prospect_podcast_feedback')
      .select('prospect_dashboard_id, podcast_id, status')
      .in('status', ['approved', 'rejected'])

    if (feedbackError || !feedbackRows || feedbackRows.length === 0) {
      return new Response(
        JSON.stringify({ success: false, error: 'No feedback data found' }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Group by prospect
    const feedbackByProspect = new Map<string, { approved: Set<string>; rejected: Set<string> }>()
    for (const row of feedbackRows) {
      if (!feedbackByProspect.has(row.prospect_dashboard_id)) {
        feedbackByProspect.set(row.prospect_dashboard_id, { approved: new Set(), rejected: new Set() })
      }
      const bucket = feedbackByProspect.get(row.prospect_dashboard_id)!
      if (row.status === 'approved') bucket.approved.add(row.podcast_id)
      else if (row.status === 'rejected') bucket.rejected.add(row.podcast_id)
    }

    const qualifiedProspectIds = Array.from(feedbackByProspect.entries())
      .filter(([_, fb]) => fb.approved.size + fb.rejected.size >= 10)
      .map(([id]) => id)

    if (qualifiedProspectIds.length === 0) {
      return new Response(
        JSON.stringify({ success: false, error: 'No prospects with 10+ feedback entries found' }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    console.log(`[RunExperimentSweep] Qualified prospects: ${qualifiedProspectIds.length}`)

    // 2. Fetch prospect bios
    const { data: prospects, error: prospectsError } = await supabase
      .from('prospect_dashboards')
      .select('id, prospect_name, prospect_bio')
      .in('id', qualifiedProspectIds)

    if (prospectsError || !prospects || prospects.length === 0) {
      return new Response(
        JSON.stringify({ success: false, error: 'Failed to fetch prospect data' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Filter out prospects without bios
    const validProspects = prospects.filter(p => p.prospect_bio && p.prospect_bio.trim().length > 0)
    console.log(`[RunExperimentSweep] Prospects with bios: ${validProspects.length}`)

    // 3. Fetch all podcasts for these prospects (only those with feedback)
    const prospectPodcasts = new Map<string, PodcastRow[]>()

    for (const prospect of validProspects) {
      const { data: podcasts } = await supabase
        .from('prospect_dashboard_podcasts')
        .select('podcast_id, podcast_name, podcast_description, publisher_name, podcast_categories, audience_size, episode_count')
        .eq('prospect_dashboard_id', prospect.id)

      if (podcasts && podcasts.length > 0) {
        const feedback = feedbackByProspect.get(prospect.id)!
        const feedbackPodcastIds = new Set([...feedback.approved, ...feedback.rejected])
        const filtered = podcasts.filter(p => feedbackPodcastIds.has(p.podcast_id))
        if (filtered.length > 0) {
          prospectPodcasts.set(prospect.id, filtered)
        }
      }
    }

    console.log(`[RunExperimentSweep] Prospects with scorable podcasts: ${prospectPodcasts.size}`)

    // -----------------------------------------------------------
    // Score podcasts and cache results.
    // Cache key: `${model}:${promptKey}:${prospectId}:${podcastId}`
    // Value: score (number | null)
    // This way, changing only the cutoff reuses all scores.
    // -----------------------------------------------------------
    const scoreCache = new Map<string, number | null>()

    async function getScore(
      model: string,
      promptKey: string,
      prospectBio: string,
      podcast: PodcastRow,
      prospectId: string
    ): Promise<number | null> {
      const cacheKey = `${model}:${promptKey}:${prospectId}:${podcast.podcast_id}`
      if (scoreCache.has(cacheKey)) {
        return scoreCache.get(cacheKey)!
      }
      const score = await scorePodcast(anthropic, model, prospectBio, podcast, promptKey)
      scoreCache.set(cacheKey, score)
      return score
    }

    // -----------------------------------------------------------
    // Run experiments
    // For each (model x prompt), score all podcasts once.
    // Then for each cutoff, just re-threshold the cached scores.
    // -----------------------------------------------------------

    const allResults: any[] = []
    let bestF1 = -1
    let bestParams: any = null
    let experimentsRun = 0
    let stoppedEarly = false

    for (const model of models) {
      for (const promptKey of prompts) {
        // Check time limit
        if (Date.now() - startTime > TIME_LIMIT_MS) {
          stoppedEarly = true
          break
        }

        // Validate prompt key
        if (!PROMPT_VARIANTS[promptKey]) {
          console.warn(`[RunExperimentSweep] Unknown prompt "${promptKey}", skipping`)
          continue
        }

        console.log(`[RunExperimentSweep] Scoring with model=${model} prompt=${promptKey}`)

        // Score all podcasts for all prospects with this model+prompt
        // (Only scores that aren't cached yet)
        let totalToScore = 0
        let scoredSoFar = 0

        for (const [prospectId, podcasts] of prospectPodcasts) {
          for (const podcast of podcasts) {
            const cacheKey = `${model}:${promptKey}:${prospectId}:${podcast.podcast_id}`
            if (!scoreCache.has(cacheKey)) totalToScore++
          }
        }

        console.log(`[RunExperimentSweep]   New podcasts to score: ${totalToScore}`)

        for (const [prospectId, podcasts] of prospectPodcasts) {
          const prospect = validProspects.find(p => p.id === prospectId)
          if (!prospect) continue

          // Score in batches of 10
          for (let i = 0; i < podcasts.length; i += 10) {
            if (Date.now() - startTime > TIME_LIMIT_MS) {
              stoppedEarly = true
              break
            }

            const batch = podcasts.slice(i, i + 10)
            await Promise.all(
              batch.map(podcast =>
                getScore(model, promptKey, prospect.prospect_bio, podcast, prospectId)
              )
            )
            scoredSoFar += batch.length

            if (scoredSoFar % 50 === 0 || scoredSoFar === totalToScore) {
              console.log(`[RunExperimentSweep]   Progress: ${scoredSoFar}/${totalToScore + (podcasts.length - totalToScore)} scored`)
            }
          }

          if (stoppedEarly) break
        }

        if (stoppedEarly) break

        // Now evaluate each cutoff using cached scores
        for (const cutoff of cutoffs) {
          let totalTP = 0, totalFP = 0, totalFN = 0, totalTN = 0
          let evaluated = 0

          for (const [prospectId, podcasts] of prospectPodcasts) {
            const feedback = feedbackByProspect.get(prospectId)!

            for (const podcast of podcasts) {
              const cacheKey = `${model}:${promptKey}:${prospectId}:${podcast.podcast_id}`
              const score = scoreCache.get(cacheKey)
              if (score === null || score === undefined) continue

              const aiPicked = score >= cutoff
              const humanApproved = feedback.approved.has(podcast.podcast_id)
              const humanRejected = feedback.rejected.has(podcast.podcast_id)

              if (aiPicked && humanApproved) totalTP++
              else if (aiPicked && humanRejected) totalFP++
              else if (!aiPicked && humanApproved) totalFN++
              else if (!aiPicked && humanRejected) totalTN++
            }

            evaluated++
          }

          const precision = totalTP + totalFP > 0 ? totalTP / (totalTP + totalFP) : 0
          const recall = totalTP + totalFN > 0 ? totalTP / (totalTP + totalFN) : 0
          const f1 = precision + recall > 0 ? 2 * (precision * recall) / (precision + recall) : 0

          const params = {
            scoring_model: model,
            cutoff_threshold: cutoff,
            prompt_variant: promptKey,
          }

          const durationSoFar = Math.round((Date.now() - startTime) / 1000)

          // Save to DB
          const { error: insertError } = await supabase
            .from('matching_experiments')
            .insert({
              parameters: params,
              scoring_model: model,
              cutoff_threshold: cutoff,
              scoring_prompt: promptKey,
              precision_score: precision,
              recall_score: recall,
              f1_score: f1,
              prospects_evaluated: evaluated,
              total_predictions: totalTP + totalFP,
              total_correct: totalTP,
              duration_seconds: durationSoFar,
              notes: `Sweep run. Model=${model} Cutoff=${cutoff} Prompt=${promptKey}. TP=${totalTP} FP=${totalFP} FN=${totalFN} TN=${totalTN}`,
            })

          if (insertError) {
            console.warn('[RunExperimentSweep] Insert error:', insertError.message)
          }

          const result = {
            parameters: params,
            precision,
            recall,
            f1,
            prospects_evaluated: evaluated,
            total_true_positives: totalTP,
            total_false_positives: totalFP,
            total_false_negatives: totalFN,
            total_true_negatives: totalTN,
          }

          allResults.push(result)
          experimentsRun++

          if (f1 > bestF1) {
            bestF1 = f1
            bestParams = params
          }

          console.log(`[RunExperimentSweep] #${experimentsRun}/${totalCombinations} model=${model} cutoff=${cutoff} prompt=${promptKey} => P=${(precision * 100).toFixed(1)}% R=${(recall * 100).toFixed(1)}% F1=${(f1 * 100).toFixed(1)}%`)
        }

        if (stoppedEarly) break
      }
      if (stoppedEarly) break
    }

    const totalDuration = Math.round((Date.now() - startTime) / 1000)

    console.log('[RunExperimentSweep] === SWEEP COMPLETE ===')
    console.log(`  Experiments run: ${experimentsRun}/${totalCombinations}`)
    console.log(`  Best F1: ${(bestF1 * 100).toFixed(2)}%`)
    console.log(`  Best params: ${JSON.stringify(bestParams)}`)
    console.log(`  Scores cached: ${scoreCache.size}`)
    console.log(`  Duration: ${totalDuration}s`)
    if (stoppedEarly) {
      console.log('  *** Stopped early due to 5-minute time limit ***')
    }

    return new Response(
      JSON.stringify({
        success: true,
        total_experiments: experimentsRun,
        total_combinations: totalCombinations,
        stopped_early: stoppedEarly,
        best_parameters: bestParams,
        best_f1: bestF1,
        scores_cached: scoreCache.size,
        duration_seconds: totalDuration,
        all_results: allResults,
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )

  } catch (error) {
    console.error('[RunExperimentSweep] Error:', error)
    return new Response(
      JSON.stringify({ success: false, error: error.message || 'Internal error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})
