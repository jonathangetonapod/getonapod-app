import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': Deno.env.get('ALLOWED_ORIGIN') || 'https://getonapod.com',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const VALID_STATUSES = [
  'conversation_started',
  'in_progress',
  'booked',
  'recorded',
  'published',
  'cancelled',
]

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const { booking_ids, updates } = await req.json()

    // Validate inputs
    if (!booking_ids || !Array.isArray(booking_ids) || booking_ids.length === 0) {
      return new Response(
        JSON.stringify({ success: false, error: 'booking_ids must be a non-empty array' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    if (!updates || typeof updates !== 'object') {
      return new Response(
        JSON.stringify({ success: false, error: 'updates object is required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Validate status if provided
    if (updates.status && !VALID_STATUSES.includes(updates.status)) {
      return new Response(
        JSON.stringify({
          success: false,
          error: `Invalid status. Must be one of: ${VALID_STATUSES.join(', ')}`,
        }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Build the update payload from allowed fields
    const updateData: Record<string, any> = {
      updated_at: new Date().toISOString(),
    }

    if (updates.status !== undefined) {
      updateData.status = updates.status
    }

    if (updates.prep_sent !== undefined) {
      updateData.prep_sent = updates.prep_sent
    }

    if (updates.notes !== undefined) {
      updateData.notes = updates.notes
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const supabase = createClient(supabaseUrl, supabaseServiceKey)

    console.log(`[Batch Update Bookings] Updating ${booking_ids.length} bookings with:`, updateData)

    let updated = 0
    let failed = 0

    // Process each booking individually to track successes/failures
    for (const bookingId of booking_ids) {
      try {
        const { error: updateError } = await supabase
          .from('bookings')
          .update(updateData)
          .eq('id', bookingId)

        if (updateError) {
          failed++
          console.error(`[Batch Update Bookings] Failed to update booking ${bookingId}:`, updateError)
        } else {
          updated++
        }
      } catch (err) {
        failed++
        console.error(`[Batch Update Bookings] Error processing booking ${bookingId}:`, err)
      }
    }

    console.log(`[Batch Update Bookings] Complete: ${updated} updated, ${failed} failed`)

    return new Response(
      JSON.stringify({
        success: true,
        updated,
        failed,
      }),
      {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    )
  } catch (error) {
    console.error('[Batch Update Bookings] Error:', error)

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
