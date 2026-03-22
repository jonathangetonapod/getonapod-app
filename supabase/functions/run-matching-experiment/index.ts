import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import Anthropic from 'npm:@anthropic-ai/sdk@0.32.1'

const corsHeaders = {
  'Access-Control-Allow-Origin': Deno.env.get('ALLOWED_ORIGIN') || 'https://getonapod.com',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

/**
 * Run a single AI scoring experiment against prospect feedback data.
 *
 * Takes podcasts already in prospect_dashboard_podcasts, scores them with
 * the Anthropic API using the given model/prompt, applies a cutoff threshold,
 * then compares AI picks against Jonathan's approve/reject decisions in
 * prospect_podcast_feedback to calculate precision, recall, and F1.
 *
 * POST { scoring_model, cutoff_threshold, scoring_prompt }
 */

const DEFAULT_SCORING_PROMPT = (prospectBio: string, podcastInfo: string) => `You are a podcast booking expert. Rate the compatibility (1-10) between this prospect and podcast.

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

CRITICAL: Your response must be ONLY valid JSON. No markdown, no code blocks, just the raw JSON object.`

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

async function scorePodcast(
  anthropic: any,
  model: string,
  prospectBio: string,
  podcast: PodcastRow,
  customPrompt?: string
): Promise<{ podcast_id: string; score: number | null }> {
  try {
    const podcastInfo = buildPodcastInfo(podcast)

    const prompt = customPrompt
      ? customPrompt
          .replace('{{PROSPECT_BIO}}', prospectBio)
          .replace('{{PODCAST_INFO}}', podcastInfo)
      : DEFAULT_SCORING_PROMPT(prospectBio, podcastInfo)

    const message = await anthropic.messages.create({
      model,
      max_tokens: 200,
      temperature: 0,
      messages: [{ role: 'user', content: prompt }],
    })

    const content = message.content[0]
    if (content.type !== 'text') {
      return { podcast_id: podcast.podcast_id, score: null }
    }

    let jsonText = content.text.trim()
    if (jsonText.startsWith('```')) {
      jsonText = jsonText.replace(/^```(?:json)?\n?/, '').replace(/\n?```$/, '').trim()
    }

    try {
      const parsed = JSON.parse(jsonText)
      return { podcast_id: podcast.podcast_id, score: parsed.score }
    } catch {
      const match = content.text.match(/\b([1-9]|10)\b/)
      if (match) {
        return { podcast_id: podcast.podcast_id, score: parseInt(match[1], 10) }
      }
      return { podcast_id: podcast.podcast_id, score: null }
    }
  } catch (error) {
    console.warn(`[RunMatchingExperiment] Scoring error for ${podcast.podcast_name?.substring(0, 50)}:`, error.message)
    return { podcast_id: podcast.podcast_id, score: null }
  }
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  const startTime = Date.now()

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
      scoring_model = 'claude-haiku-4-5-20251001',
      cutoff_threshold = 8,
      scoring_prompt,
    } = body

    console.log('[RunMatchingExperiment] Starting AI scoring experiment')
    console.log(`  scoring_model: ${scoring_model}`)
    console.log(`  cutoff_threshold: ${cutoff_threshold}`)
    console.log(`  custom_prompt: ${scoring_prompt ? 'yes' : 'no (using default)'}`)

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

    // 1. Fetch all feedback
    const { data: feedbackRows, error: feedbackError } = await supabase
      .from('prospect_podcast_feedback')
      .select('prospect_dashboard_id, podcast_id, status')
      .in('status', ['approved', 'rejected'])

    if (feedbackError) {
      console.error('[RunMatchingExperiment] Failed to fetch feedback:', feedbackError)
      throw feedbackError
    }

    if (!feedbackRows || feedbackRows.length === 0) {
      return new Response(
        JSON.stringify({ success: false, error: 'No feedback data found' }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Group feedback by prospect
    const feedbackByProspect = new Map<string, { approved: Set<string>; rejected: Set<string> }>()
    for (const row of feedbackRows) {
      if (!feedbackByProspect.has(row.prospect_dashboard_id)) {
        feedbackByProspect.set(row.prospect_dashboard_id, { approved: new Set(), rejected: new Set() })
      }
      const bucket = feedbackByProspect.get(row.prospect_dashboard_id)!
      if (row.status === 'approved') bucket.approved.add(row.podcast_id)
      else if (row.status === 'rejected') bucket.rejected.add(row.podcast_id)
    }

    // Filter to prospects with 10+ feedback entries
    const qualifiedProspects = Array.from(feedbackByProspect.entries())
      .filter(([_, fb]) => fb.approved.size + fb.rejected.size >= 10)

    console.log(`[RunMatchingExperiment] Total prospects with feedback: ${feedbackByProspect.size}`)
    console.log(`[RunMatchingExperiment] Qualified (10+ entries): ${qualifiedProspects.length}`)

    if (qualifiedProspects.length === 0) {
      return new Response(
        JSON.stringify({
          success: false,
          error: 'No prospects with 10+ feedback entries found',
          total_prospects_with_feedback: feedbackByProspect.size,
        }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // 2. Evaluate each qualified prospect
    let totalTruePositives = 0
    let totalFalsePositives = 0
    let totalFalseNegatives = 0
    let totalTrueNegatives = 0
    let totalPodcastsScored = 0
    let prospectsEvaluated = 0
    const prospectResults: any[] = []

    for (const [prospectId, feedback] of qualifiedProspects) {
      try {
        // 2a. Get prospect bio
        const { data: prospect, error: prospectError } = await supabase
          .from('prospect_dashboards')
          .select('prospect_name, prospect_bio')
          .eq('id', prospectId)
          .single()

        if (prospectError || !prospect || !prospect.prospect_bio) {
          console.warn(`[RunMatchingExperiment] Skipping prospect ${prospectId}: no bio found`)
          continue
        }

        // 2b. Get ALL their podcasts from prospect_dashboard_podcasts (the scoring pool)
        const { data: podcasts, error: podcastError } = await supabase
          .from('prospect_dashboard_podcasts')
          .select('podcast_id, podcast_name, podcast_description, publisher_name, podcast_categories, audience_size, episode_count')
          .eq('prospect_dashboard_id', prospectId)

        if (podcastError || !podcasts || podcasts.length === 0) {
          console.warn(`[RunMatchingExperiment] Skipping ${prospect.prospect_name}: no podcasts in dashboard`)
          continue
        }

        // Only score podcasts that have feedback (approved or rejected)
        const feedbackPodcastIds = new Set([...feedback.approved, ...feedback.rejected])
        const podcastsToScore = podcasts.filter(p => feedbackPodcastIds.has(p.podcast_id))

        if (podcastsToScore.length === 0) {
          console.warn(`[RunMatchingExperiment] Skipping ${prospect.prospect_name}: no podcasts with feedback`)
          continue
        }

        console.log(`[RunMatchingExperiment] Scoring ${podcastsToScore.length} podcasts for ${prospect.prospect_name}`)

        // 2c. Score podcasts in batches of 10
        const scores: { podcast_id: string; score: number | null }[] = []
        for (let i = 0; i < podcastsToScore.length; i += 10) {
          const batch = podcastsToScore.slice(i, i + 10)
          const batchScores = await Promise.all(
            batch.map(podcast =>
              scorePodcast(anthropic, scoring_model, prospect.prospect_bio, podcast, scoring_prompt)
            )
          )
          scores.push(...batchScores)

          if (i + 10 < podcastsToScore.length) {
            console.log(`[RunMatchingExperiment]   Batch ${Math.floor(i / 10) + 1} complete (${Math.min(i + 10, podcastsToScore.length)}/${podcastsToScore.length})`)
          }
        }

        // 2d. Apply cutoff — podcasts scoring >= cutoff are "AI picks"
        const aiPicks = new Set(
          scores
            .filter(s => s.score !== null && s.score >= cutoff_threshold)
            .map(s => s.podcast_id)
        )

        // 2e. Compare against feedback
        let tp = 0, fp = 0, fn = 0, tn = 0

        for (const s of scores) {
          if (s.score === null) continue

          const aiPicked = s.score >= cutoff_threshold
          const humanApproved = feedback.approved.has(s.podcast_id)
          const humanRejected = feedback.rejected.has(s.podcast_id)

          if (aiPicked && humanApproved) tp++
          else if (aiPicked && humanRejected) fp++
          else if (!aiPicked && humanApproved) fn++
          else if (!aiPicked && humanRejected) tn++
        }

        totalTruePositives += tp
        totalFalsePositives += fp
        totalFalseNegatives += fn
        totalTrueNegatives += tn
        totalPodcastsScored += scores.filter(s => s.score !== null).length
        prospectsEvaluated++

        prospectResults.push({
          prospect_name: prospect.prospect_name,
          prospect_id: prospectId,
          podcasts_scored: scores.filter(s => s.score !== null).length,
          approved_count: feedback.approved.size,
          rejected_count: feedback.rejected.size,
          ai_picks: aiPicks.size,
          true_positives: tp,
          false_positives: fp,
          false_negatives: fn,
          true_negatives: tn,
        })

        console.log(`[RunMatchingExperiment] ${prospect.prospect_name}: TP=${tp} FP=${fp} FN=${fn} TN=${tn} (${aiPicks.size} AI picks out of ${scores.filter(s => s.score !== null).length} scored)`)

      } catch (err) {
        console.warn(`[RunMatchingExperiment] Error evaluating ${prospectId}:`, err.message)
        continue
      }
    }

    // 3. Calculate aggregate metrics
    const precision = totalTruePositives + totalFalsePositives > 0
      ? totalTruePositives / (totalTruePositives + totalFalsePositives)
      : 0
    const recall = totalTruePositives + totalFalseNegatives > 0
      ? totalTruePositives / (totalTruePositives + totalFalseNegatives)
      : 0
    const f1 = precision + recall > 0
      ? 2 * (precision * recall) / (precision + recall)
      : 0

    const durationSeconds = Math.round((Date.now() - startTime) / 1000)

    console.log('[RunMatchingExperiment] === RESULTS ===')
    console.log(`  Precision: ${(precision * 100).toFixed(2)}%`)
    console.log(`  Recall:    ${(recall * 100).toFixed(2)}%`)
    console.log(`  F1:        ${(f1 * 100).toFixed(2)}%`)
    console.log(`  Prospects: ${prospectsEvaluated}`)
    console.log(`  Podcasts scored: ${totalPodcastsScored}`)
    console.log(`  Duration:  ${durationSeconds}s`)

    // 4. Save to matching_experiments table
    const parameters = { scoring_model, cutoff_threshold, has_custom_prompt: !!scoring_prompt }
    const { error: insertError } = await supabase
      .from('matching_experiments')
      .insert({
        parameters,
        scoring_model,
        cutoff_threshold: cutoff_threshold,
        scoring_prompt: scoring_prompt || null,
        precision_score: precision,
        recall_score: recall,
        f1_score: f1,
        prospects_evaluated: prospectsEvaluated,
        total_predictions: totalTruePositives + totalFalsePositives,
        total_correct: totalTruePositives,
        duration_seconds: durationSeconds,
        notes: `AI scoring experiment. Model=${scoring_model} Cutoff=${cutoff_threshold}. ${prospectsEvaluated} prospects, ${totalPodcastsScored} podcasts scored. TP=${totalTruePositives} FP=${totalFalsePositives} FN=${totalFalseNegatives} TN=${totalTrueNegatives}`,
      })

    if (insertError) {
      console.error('[RunMatchingExperiment] Failed to save results:', insertError)
    }

    // 5. Return results
    return new Response(
      JSON.stringify({
        success: true,
        precision,
        recall,
        f1,
        prospects_evaluated: prospectsEvaluated,
        total_podcasts_scored: totalPodcastsScored,
        total_true_positives: totalTruePositives,
        total_false_positives: totalFalsePositives,
        total_false_negatives: totalFalseNegatives,
        total_true_negatives: totalTrueNegatives,
        parameters: {
          scoring_model,
          cutoff_threshold,
          custom_prompt: !!scoring_prompt,
        },
        duration_seconds: durationSeconds,
        prospect_results: prospectResults,
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )

  } catch (error) {
    console.error('[RunMatchingExperiment] Error:', error)
    return new Response(
      JSON.stringify({ success: false, error: error.message || 'Internal error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})
