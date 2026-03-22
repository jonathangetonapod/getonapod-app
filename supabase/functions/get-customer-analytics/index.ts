import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const body = await req.json().catch(() => ({}))
    const dateFrom = body.date_from || null
    const dateTo = body.date_to || null

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const supabase = createClient(supabaseUrl, supabaseServiceKey)

    console.log(`[Customer Analytics] Fetching stats${dateFrom ? ` from ${dateFrom}` : ''}${dateTo ? ` to ${dateTo}` : ''}`)

    // Total customers count
    let customersQuery = supabase
      .from('customers')
      .select('*', { count: 'exact', head: true })

    if (dateFrom) {
      customersQuery = customersQuery.gte('created_at', dateFrom)
    }
    if (dateTo) {
      customersQuery = customersQuery.lte('created_at', dateTo)
    }

    const { count: totalCustomers, error: customersError } = await customersQuery

    if (customersError) {
      throw new Error(`Failed to fetch customer count: ${customersError.message}`)
    }

    // Fetch all orders (with optional date filter)
    let ordersQuery = supabase
      .from('orders')
      .select('total_amount, status')

    if (dateFrom) {
      ordersQuery = ordersQuery.gte('created_at', dateFrom)
    }
    if (dateTo) {
      ordersQuery = ordersQuery.lte('created_at', dateTo)
    }

    const { data: allOrders, error: ordersError } = await ordersQuery

    if (ordersError) {
      throw new Error(`Failed to fetch orders: ${ordersError.message}`)
    }

    const orders = allOrders || []

    // Total revenue (sum of paid order totals, matching customers.ts logic)
    const paidOrders = orders.filter((o: any) => o.status === 'paid')
    const totalRevenue = paidOrders.reduce(
      (sum: number, order: any) => sum + parseFloat(order.total_amount),
      0
    )

    // Average order value
    const avgOrderValue = paidOrders.length > 0 ? totalRevenue / paidOrders.length : 0

    // Total orders count
    const totalOrders = orders.length

    // Orders by status breakdown
    const ordersByStatus: Record<string, number> = {}
    for (const order of orders) {
      const status = (order as any).status || 'unknown'
      ordersByStatus[status] = (ordersByStatus[status] || 0) + 1
    }

    console.log(`[Customer Analytics] ${totalCustomers} customers, ${totalOrders} orders, $${totalRevenue.toFixed(2)} revenue`)

    return new Response(
      JSON.stringify({
        success: true,
        analytics: {
          total_customers: totalCustomers || 0,
          total_revenue: Math.round(totalRevenue * 100) / 100,
          avg_order_value: Math.round(avgOrderValue * 100) / 100,
          total_orders: totalOrders,
          orders_by_status: ordersByStatus,
        },
      }),
      {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    )
  } catch (error) {
    console.error('[Customer Analytics] Error:', error)

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
