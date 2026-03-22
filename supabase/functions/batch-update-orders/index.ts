import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const VALID_STATUSES = ['pending', 'processing', 'completed', 'cancelled', 'refunded']

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const { order_ids, status, admin_notes } = await req.json()

    // Validate inputs
    if (!order_ids || !Array.isArray(order_ids) || order_ids.length === 0) {
      return new Response(
        JSON.stringify({ success: false, error: 'order_ids must be a non-empty array' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    if (!status || !VALID_STATUSES.includes(status)) {
      return new Response(
        JSON.stringify({
          success: false,
          error: `Invalid status. Must be one of: ${VALID_STATUSES.join(', ')}`,
        }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const supabase = createClient(supabaseUrl, supabaseServiceKey)

    console.log(`[Batch Update Orders] Updating ${order_ids.length} orders to status: ${status}`)

    let updated = 0
    let failed = 0
    const errors: string[] = []

    // Process each order individually to track successes/failures
    for (const orderId of order_ids) {
      try {
        const updateData: Record<string, any> = {
          status,
          updated_at: new Date().toISOString(),
        }

        if (admin_notes !== undefined) {
          updateData.admin_notes = admin_notes
        }

        const { error: updateError } = await supabase
          .from('orders')
          .update(updateData)
          .eq('id', orderId)

        if (updateError) {
          failed++
          errors.push(`Order ${orderId}: ${updateError.message}`)
          console.error(`[Batch Update Orders] Failed to update order ${orderId}:`, updateError)
        } else {
          updated++
        }
      } catch (err) {
        failed++
        errors.push(`Order ${orderId}: ${err.message}`)
        console.error(`[Batch Update Orders] Error processing order ${orderId}:`, err)
      }
    }

    console.log(`[Batch Update Orders] Complete: ${updated} updated, ${failed} failed`)

    return new Response(
      JSON.stringify({
        success: true,
        updated,
        failed,
        errors,
      }),
      {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    )
  } catch (error) {
    console.error('[Batch Update Orders] Error:', error)

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
