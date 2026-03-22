import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': Deno.env.get('ALLOWED_ORIGIN') || 'https://getonapod.com',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const { days_back = 30 } = await req.json()

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const supabase = createClient(supabaseUrl, supabaseServiceKey)

    console.log(`[Get Sales Call Analytics] days_back=${days_back}`)

    const cutoffDate = new Date()
    cutoffDate.setDate(cutoffDate.getDate() - days_back)
    const cutoffISO = cutoffDate.toISOString()

    // Fetch all sales calls within the time period
    const { data: calls, error: callsError } = await supabase
      .from('sales_calls')
      .select('id, call_type, recording_start_time')
      .gte('recording_start_time', cutoffISO)
      .eq('hidden', false)

    if (callsError) {
      throw callsError
    }

    const totalCalls = calls?.length || 0

    // Count calls by type
    const callsByType: Record<string, number> = {}
    for (const call of calls || []) {
      const type = call.call_type || 'unclassified'
      callsByType[type] = (callsByType[type] || 0) + 1
    }

    // Fetch analyses for calls in the time period
    const callIds = (calls || []).map((c) => c.id)

    let analyzedCalls = 0
    let avgScore = 0
    let topScores: any[] = []

    if (callIds.length > 0) {
      const { data: analyses, error: analysesError } = await supabase
        .from('sales_call_analysis')
        .select(`
          id,
          sales_call_id,
          overall_score,
          discovery_score,
          objection_handling_score,
          closing_score,
          engagement_score,
          analyzed_at,
          sales_call:sales_calls!sales_call_id(title, meeting_title, recording_start_time)
        `)
        .in('sales_call_id', callIds)
        .order('overall_score', { ascending: false })

      if (analysesError) {
        console.error('[Get Sales Call Analytics] Analyses error:', analysesError)
      }

      if (analyses && analyses.length > 0) {
        analyzedCalls = analyses.length

        // Calculate average overall score
        const totalScore = analyses.reduce((sum, a) => sum + (a.overall_score || 0), 0)
        avgScore = parseFloat((totalScore / analyzedCalls).toFixed(1))

        // Top 5 scores
        topScores = analyses.slice(0, 5).map((a: any) => ({
          sales_call_id: a.sales_call_id,
          title: a.sales_call?.title || a.sales_call?.meeting_title || 'Untitled',
          overall_score: a.overall_score,
          recording_date: a.sales_call?.recording_start_time || null,
        }))
      }
    }

    console.log(`[Get Sales Call Analytics] total=${totalCalls} analyzed=${analyzedCalls} avg=${avgScore}`)

    return new Response(
      JSON.stringify({
        success: true,
        analytics: {
          total_calls: totalCalls,
          analyzed_calls: analyzedCalls,
          avg_score: avgScore,
          calls_by_type: callsByType,
          top_scores: topScores,
        },
      }),
      {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    )
  } catch (error) {
    console.error('[Get Sales Call Analytics] Error:', error)

    return new Response(
      JSON.stringify({
        success: false,
        error: error.message || 'Internal server error',
      }),
      {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    )
  }
})
