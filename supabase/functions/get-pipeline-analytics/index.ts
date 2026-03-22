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
    const body = await req.json().catch(() => ({}))
    const now = new Date()
    const month = body.month ?? now.getMonth() + 1 // 1-indexed
    const year = body.year ?? now.getFullYear()

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const supabase = createClient(supabaseUrl, supabaseServiceKey)

    console.log(`[Pipeline Analytics] Fetching metrics for ${month}/${year}`)

    // Fetch all bookings
    const { data: allBookings, error: bookingsError } = await supabase
      .from('bookings')
      .select('id, status, scheduled_date')

    if (bookingsError) {
      throw new Error(`Failed to fetch bookings: ${bookingsError.message}`)
    }

    // Filter bookings by requested month/year (matching Dashboard.tsx logic)
    const monthBookings = (allBookings || []).filter((booking: any) => {
      if (!booking.scheduled_date) return false
      const bookingDate = new Date(booking.scheduled_date)
      // month is 1-indexed from caller, getMonth() is 0-indexed
      return bookingDate.getMonth() === month - 1 && bookingDate.getFullYear() === year
    })

    // Calculate status breakdown
    const byStatus: Record<string, number> = {}
    for (const booking of monthBookings) {
      const status = booking.status || 'unknown'
      byStatus[status] = (byStatus[status] || 0) + 1
    }

    const total = monthBookings.length
    const published = byStatus['published'] || 0
    const completionRate = total > 0 ? (published / total) * 100 : 0

    // Active clients count
    const { count: activeClients, error: clientsError } = await supabase
      .from('clients')
      .select('*', { count: 'exact', head: true })
      .eq('status', 'active')

    if (clientsError) {
      throw new Error(`Failed to fetch active clients: ${clientsError.message}`)
    }

    console.log(`[Pipeline Analytics] ${total} bookings, ${Object.keys(byStatus).length} statuses, ${activeClients} active clients`)

    return new Response(
      JSON.stringify({
        success: true,
        pipeline: {
          total,
          by_status: byStatus,
          completion_rate: Math.round(completionRate * 100) / 100,
          active_clients: activeClients || 0,
          month,
          year,
        },
      }),
      {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    )
  } catch (error) {
    console.error('[Pipeline Analytics] Error:', error)

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
