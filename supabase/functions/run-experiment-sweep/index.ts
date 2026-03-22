import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': Deno.env.get('ALLOWED_ORIGIN') || 'https://getonapod.com',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

/**
 * Run a parameter sweep of matching experiments.
 *
 * Generates all combinations of (threshold x match_count x max_results)
 * and evaluates each against prospect feedback data. Tracks the best
 * parameter set by F1 score.
 *
 * 5-minute time limit — reports partial results if cut short.
 *
 * POST { thresholds, match_counts, max_results_options }
 */
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
      thresholds = [0.15, 0.20, 0.25, 0.30, 0.35, 0.40],
      match_counts = [30, 50, 75, 100],
      max_results_options = [10, 15, 20, 30],
    } = body

    const totalCombinations = thresholds.length * match_counts.length * max_results_options.length
    console.log('[RunExperimentSweep] Starting parameter sweep')
    console.log(`  Thresholds: ${thresholds.join(', ')}`)
    console.log(`  Match counts: ${match_counts.join(', ')}`)
    console.log(`  Max results: ${max_results_options.join(', ')}`)
    console.log(`  Total combinations: ${totalCombinations}`)

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

    // -----------------------------------------------------------
    // Pre-load all data once (avoids repeated DB calls per combo)
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

    // 2. Fetch prospect dashboards
    const { data: prospects, error: prospectsError } = await supabase
      .from('prospect_dashboards')
      .select('id, prospect_name, prospect_bio, prospect_industry, prospect_expertise, prospect_topics, prospect_target_audience, prospect_company, prospect_title, personalized_tagline')
      .in('id', qualifiedProspectIds)

    if (prospectsError || !prospects || prospects.length === 0) {
      return new Response(
        JSON.stringify({ success: false, error: 'Failed to fetch prospect data' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // 3. Generate embeddings once per prospect (reused across all parameter combos)
    console.log(`[RunExperimentSweep] Generating embeddings for ${prospects.length} prospects...`)
    const prospectEmbeddings = new Map<string, number[]>()

    for (const prospect of prospects) {
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

      try {
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

        if (embeddingResponse.ok) {
          const data = await embeddingResponse.json()
          prospectEmbeddings.set(prospect.id, data.data[0].embedding)
          console.log(`  Embedded: ${prospect.prospect_name}`)
        } else {
          console.warn(`  Embedding failed for ${prospect.prospect_name}`)
        }
      } catch (err) {
        console.warn(`  Embedding error for ${prospect.prospect_name}: ${err.message}`)
      }
    }

    console.log(`[RunExperimentSweep] Embeddings ready: ${prospectEmbeddings.size}/${prospects.length}`)

    // -----------------------------------------------------------
    // Run experiments: for each (threshold x match_count) we query
    // the DB once, then slice to different max_results values.
    // -----------------------------------------------------------

    // Cache search results by (prospect, threshold, match_count) to avoid redundant RPC calls.
    // Key: `${prospectId}:${threshold}:${matchCount}`
    const searchCache = new Map<string, any[]>()

    const allResults: any[] = []
    let bestF1 = -1
    let bestParams: any = null
    let experimentsRun = 0
    let stoppedEarly = false

    for (const threshold of thresholds) {
      for (const matchCount of match_counts) {
        // Check time limit before starting a new (threshold, matchCount) group
        if (Date.now() - startTime > TIME_LIMIT_MS) {
          stoppedEarly = true
          break
        }

        // Run vector search for each prospect at this (threshold, matchCount)
        for (const [prospectId, embedding] of prospectEmbeddings) {
          const cacheKey = `${prospectId}:${threshold}:${matchCount}`
          if (searchCache.has(cacheKey)) continue

          try {
            const { data: matches } = await supabase.rpc('search_similar_podcasts', {
              query_embedding: embedding,
              match_threshold: threshold,
              match_count: matchCount,
              p_exclude_podcast_ids: null,
            })
            searchCache.set(cacheKey, matches || [])
          } catch (err) {
            console.warn(`[RunExperimentSweep] Search failed: ${cacheKey}`, err.message)
            searchCache.set(cacheKey, [])
          }
        }

        // Now evaluate each max_results option
        for (const maxResults of max_results_options) {
          if (Date.now() - startTime > TIME_LIMIT_MS) {
            stoppedEarly = true
            break
          }

          let totalTP = 0
          let totalFP = 0
          let totalFN = 0
          let totalPreds = 0
          let overlapSum = 0
          let evaluated = 0

          for (const [prospectId, embedding] of prospectEmbeddings) {
            const cacheKey = `${prospectId}:${threshold}:${matchCount}`
            const matches = searchCache.get(cacheKey) || []
            const predictions = matches.slice(0, maxResults)
            const predictedIds = new Set(predictions.map((m: any) => m.podscan_id))
            const feedback = feedbackByProspect.get(prospectId)!

            let tp = 0, fp = 0, fn = 0

            for (const predId of predictedIds) {
              if (feedback.approved.has(predId)) tp++
              else if (feedback.rejected.has(predId)) fp++
            }

            for (const approvedId of feedback.approved) {
              if (!predictedIds.has(approvedId)) fn++
            }

            const overlap = feedback.approved.size > 0 ? tp / feedback.approved.size : 0

            totalTP += tp
            totalFP += fp
            totalFN += fn
            totalPreds += predictedIds.size
            overlapSum += overlap
            evaluated++
          }

          const precision = totalTP + totalFP > 0 ? totalTP / (totalTP + totalFP) : 0
          const recall = totalTP + totalFN > 0 ? totalTP / (totalTP + totalFN) : 0
          const f1 = precision + recall > 0 ? 2 * (precision * recall) / (precision + recall) : 0
          const avgOverlap = evaluated > 0 ? overlapSum / evaluated : 0

          const params = {
            similarity_threshold: threshold,
            match_count: matchCount,
            max_results: maxResults,
          }

          const durationSoFar = Math.round((Date.now() - startTime) / 1000)

          // Save to DB
          const { error: insertError } = await supabase
            .from('matching_experiments')
            .insert({
              parameters: params,
              precision_score: precision,
              recall_score: recall,
              f1_score: f1,
              avg_overlap: avgOverlap,
              prospects_evaluated: evaluated,
              total_predictions: totalPreds,
              total_correct: totalTP,
              duration_seconds: durationSoFar,
              notes: `Sweep run. TP=${totalTP} FP=${totalFP} FN=${totalFN}`,
            })

          if (insertError) {
            console.warn('[RunExperimentSweep] Insert error:', insertError.message)
          }

          const result = {
            parameters: params,
            precision,
            recall,
            f1,
            avg_overlap: avgOverlap,
            prospects_evaluated: evaluated,
            total_predictions: totalPreds,
            total_true_positives: totalTP,
            total_false_positives: totalFP,
            total_false_negatives: totalFN,
          }

          allResults.push(result)
          experimentsRun++

          if (f1 > bestF1) {
            bestF1 = f1
            bestParams = params
          }

          console.log(`[RunExperimentSweep] #${experimentsRun}/${totalCombinations} thresh=${threshold} mc=${matchCount} mr=${maxResults} => P=${(precision * 100).toFixed(1)}% R=${(recall * 100).toFixed(1)}% F1=${(f1 * 100).toFixed(1)}%`)
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
