import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': Deno.env.get('ALLOWED_ORIGIN') || 'https://getonapod.com',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

/**
 * Run a single matching experiment against prospect feedback data.
 *
 * Tests the vector search stage only (no AI scoring) by comparing
 * search_similar_podcasts results against human-approved/rejected feedback.
 *
 * POST { similarity_threshold, min_score, match_count, max_results }
 */
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
      similarity_threshold = 0.30,
      min_score = 8,
      match_count = 50,
      max_results = 20,
    } = body

    console.log('[RunMatchingExperiment] Starting experiment')
    console.log(`  similarity_threshold: ${similarity_threshold}`)
    console.log(`  min_score: ${min_score}`)
    console.log(`  match_count: ${match_count}`)
    console.log(`  max_results: ${max_results}`)

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const openaiKey = Deno.env.get('OPENAI_API_KEY')

    if (!openaiKey) {
      return new Response(
        JSON.stringify({ success: false, error: 'OPENAI_API_KEY not configured' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    const supabase = createClient(supabaseUrl, supabaseKey)

    // 1. Fetch all prospects that have feedback
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
      if (row.status === 'approved') {
        bucket.approved.add(row.podcast_id)
      } else if (row.status === 'rejected') {
        bucket.rejected.add(row.podcast_id)
      }
    }

    // Filter to prospects with 10+ total feedback entries
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
    let totalPredictions = 0
    let overlapSum = 0
    let prospectsEvaluated = 0
    const prospectResults: any[] = []

    for (const [prospectId, feedback] of qualifiedProspects) {
      try {
        // 2a. Get prospect dashboard info
        const { data: prospect, error: prospectError } = await supabase
          .from('prospect_dashboards')
          .select('prospect_name, prospect_bio, prospect_industry, prospect_expertise, prospect_topics, prospect_target_audience, prospect_company, prospect_title, personalized_tagline')
          .eq('id', prospectId)
          .single()

        if (prospectError || !prospect) {
          console.warn(`[RunMatchingExperiment] Skipping prospect ${prospectId}: not found`)
          continue
        }

        // 2b. Build embedding text (same approach as backfill-prospect-podcasts)
        const prospectText = [
          `Podcast guest: ${prospect.prospect_name}`,
          prospect.prospect_title && prospect.prospect_company
            ? `Role: ${prospect.prospect_title} at ${prospect.prospect_company}` : '',
          prospect.prospect_title && !prospect.prospect_company
            ? `Role: ${prospect.prospect_title}` : '',
          !prospect.prospect_title && prospect.prospect_company
            ? `Company: ${prospect.prospect_company}` : '',
          prospect.prospect_industry ? `Industry: ${prospect.prospect_industry}` : '',
          prospect.prospect_expertise?.length > 0
            ? `Expertise: ${prospect.prospect_expertise.join(', ')}` : '',
          prospect.prospect_topics?.length > 0
            ? `Topics: ${prospect.prospect_topics.join(', ')}` : '',
          prospect.prospect_target_audience
            ? `Target audience: ${prospect.prospect_target_audience}` : '',
          prospect.prospect_bio
            ? `Background: ${prospect.prospect_bio.substring(0, 1000)}` : '',
          prospect.personalized_tagline ? `Focus: ${prospect.personalized_tagline}` : ''
        ].filter(Boolean).join('\n')

        // 2c. Generate embedding via OpenAI
        const embeddingResponse = await fetch('https://api.openai.com/v1/embeddings', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${openaiKey}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            model: 'text-embedding-3-small',
            input: prospectText,
            dimensions: 1536,
          })
        })

        if (!embeddingResponse.ok) {
          const errText = await embeddingResponse.text()
          console.warn(`[RunMatchingExperiment] Embedding failed for ${prospect.prospect_name}: ${errText}`)
          continue
        }

        const embeddingData = await embeddingResponse.json()
        const embedding = embeddingData.data[0].embedding

        // 2d. Run vector search (do NOT exclude rejected — we need them in results to measure false positives)
        const { data: matches, error: searchError } = await supabase.rpc('search_similar_podcasts', {
          query_embedding: embedding,
          match_threshold: similarity_threshold,
          match_count: match_count,
          p_exclude_podcast_ids: null, // intentionally include rejected to measure false positives
        })

        if (searchError) {
          console.warn(`[RunMatchingExperiment] Search failed for ${prospect.prospect_name}:`, searchError)
          continue
        }

        // 2e. Take top N predictions (simulating max_results)
        const predictions = (matches || []).slice(0, max_results)
        const predictedIds = new Set(predictions.map((m: any) => m.podscan_id))

        // 2f. Calculate metrics for this prospect
        let tp = 0
        let fp = 0
        let fn = 0

        for (const predId of predictedIds) {
          if (feedback.approved.has(predId)) {
            tp++
          } else if (feedback.rejected.has(predId)) {
            fp++
          }
          // predictions not in either list are ignored (no ground truth)
        }

        // false negatives: approved podcasts not in predictions
        for (const approvedId of feedback.approved) {
          if (!predictedIds.has(approvedId)) {
            fn++
          }
        }

        const overlap = feedback.approved.size > 0
          ? tp / feedback.approved.size
          : 0

        totalTruePositives += tp
        totalFalsePositives += fp
        totalFalseNegatives += fn
        totalPredictions += predictedIds.size
        overlapSum += overlap
        prospectsEvaluated++

        prospectResults.push({
          prospect_name: prospect.prospect_name,
          prospect_id: prospectId,
          approved_count: feedback.approved.size,
          rejected_count: feedback.rejected.size,
          predictions: predictedIds.size,
          true_positives: tp,
          false_positives: fp,
          false_negatives: fn,
          overlap,
        })

        console.log(`[RunMatchingExperiment] ${prospect.prospect_name}: TP=${tp} FP=${fp} FN=${fn} overlap=${(overlap * 100).toFixed(1)}%`)

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
    const avgOverlap = prospectsEvaluated > 0 ? overlapSum / prospectsEvaluated : 0

    const durationSeconds = Math.round((Date.now() - startTime) / 1000)

    console.log('[RunMatchingExperiment] === RESULTS ===')
    console.log(`  Precision: ${(precision * 100).toFixed(2)}%`)
    console.log(`  Recall:    ${(recall * 100).toFixed(2)}%`)
    console.log(`  F1:        ${(f1 * 100).toFixed(2)}%`)
    console.log(`  Avg Overlap: ${(avgOverlap * 100).toFixed(2)}%`)
    console.log(`  Prospects: ${prospectsEvaluated}`)
    console.log(`  Duration:  ${durationSeconds}s`)

    // 4. Save to matching_experiments table
    const parameters = { similarity_threshold, min_score, match_count, max_results }
    const { error: insertError } = await supabase
      .from('matching_experiments')
      .insert({
        parameters,
        precision_score: precision,
        recall_score: recall,
        f1_score: f1,
        avg_overlap: avgOverlap,
        prospects_evaluated: prospectsEvaluated,
        total_predictions: totalPredictions,
        total_correct: totalTruePositives,
        duration_seconds: durationSeconds,
        notes: `Vector search only. ${prospectsEvaluated} prospects, ${totalTruePositives} TP, ${totalFalsePositives} FP, ${totalFalseNegatives} FN`,
      })

    if (insertError) {
      console.error('[RunMatchingExperiment] Failed to save results:', insertError)
      // Don't fail the response — the experiment results are still valid
    }

    // 5. Return results
    return new Response(
      JSON.stringify({
        success: true,
        precision,
        recall,
        f1,
        avg_overlap: avgOverlap,
        prospects_evaluated: prospectsEvaluated,
        total_predictions: totalPredictions,
        total_true_positives: totalTruePositives,
        total_false_positives: totalFalsePositives,
        total_false_negatives: totalFalseNegatives,
        parameters,
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
