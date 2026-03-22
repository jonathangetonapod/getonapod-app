import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const VALID_STATUSES = ['pending', 'processing', 'completed', 'cancelled', 'refunded'] as const

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const { order_id, status, admin_notes } = await req.json()

    // Validate required fields
    if (!order_id) {
      return new Response(
        JSON.stringify({ success: false, error: 'order_id is required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    if (!status) {
      return new Response(
        JSON.stringify({ success: false, error: 'status is required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Validate status value
    if (!VALID_STATUSES.includes(status)) {
      return new Response(
        JSON.stringify({
          success: false,
          error: `Invalid status '${status}'. Must be one of: ${VALID_STATUSES.join(', ')}`,
        }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const supabase = createClient(supabaseUrl, supabaseServiceKey)

    console.log(`[Update Order Status] Updating order ${order_id} to status: ${status}`)

    // Build the update payload
    const updatePayload: Record<string, unknown> = {
      status,
    }

    if (admin_notes !== undefined) {
      updatePayload.admin_notes = admin_notes
    }

    // Update the order
    const { data: order, error: updateError } = await supabase
      .from('orders')
      .update(updatePayload)
      .eq('id', order_id)
      .select('id, status, updated_at')
      .single()

    if (updateError) {
      // Check if it's a "not found" error (no rows matched)
      if (updateError.code === 'PGRST116') {
        return new Response(
          JSON.stringify({ success: false, error: `Order not found: ${order_id}` }),
          { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        )
      }
      throw updateError
    }

    if (!order) {
      return new Response(
        JSON.stringify({ success: false, error: `Order not found: ${order_id}` }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    console.log(`[Update Order Status] Order ${order_id} updated to ${status}`)

    return new Response(
      JSON.stringify({
        success: true,
        order: {
          id: order.id,
          status: order.status,
          updated_at: order.updated_at,
        },
      }),
      {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    )
  } catch (error) {
    console.error('[Update Order Status] Error:', error)

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
