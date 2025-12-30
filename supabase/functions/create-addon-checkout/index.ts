import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import Stripe from 'https://esm.sh/stripe@14.10.0?target=deno'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

interface AddonItem {
  bookingId: string
  serviceId: string
}

interface RequestBody {
  addons: AddonItem[]
  clientId: string
}

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    // Get environment variables
    const stripeSecretKey = Deno.env.get('STRIPE_SECRET_KEY')
    const supabaseUrl = Deno.env.get('SUPABASE_URL')
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')

    if (!stripeSecretKey) {
      throw new Error('STRIPE_SECRET_KEY not configured')
    }

    if (!supabaseUrl || !supabaseServiceKey) {
      throw new Error('Supabase keys not configured')
    }

    // Initialize Stripe and Supabase
    const stripe = new Stripe(stripeSecretKey, {
      apiVersion: '2023-10-16',
      httpClient: Stripe.createFetchHttpClient(),
    })

    const supabase = createClient(supabaseUrl, supabaseServiceKey)

    // Parse request body
    const { addons, clientId }: RequestBody = await req.json()

    // Validate input
    if (!addons || !Array.isArray(addons) || addons.length === 0 || !clientId) {
      return new Response(
        JSON.stringify({ error: 'Missing required fields: addons (array), clientId' }),
        {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      )
    }

    console.log(`Creating addon checkout for client: ${clientId} with ${addons.length} addons`)

    // Fetch client details
    const { data: client, error: clientError } = await supabase
      .from('clients')
      .select('name, email')
      .eq('id', clientId)
      .single()

    if (clientError || !client) {
      return new Response(
        JSON.stringify({ error: 'Client not found' }),
        {
          status: 404,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      )
    }

    // Process each addon and create line items
    const lineItems = []
    const addonMetadata = []

    for (const addon of addons) {
      const { bookingId, serviceId } = addon

      // Fetch service details
      const { data: service, error: serviceError } = await supabase
        .from('addon_services')
        .select('*')
        .eq('id', serviceId)
        .single()

      if (serviceError || !service) {
        console.error(`Service not found: ${serviceId}`)
        continue // Skip this addon
      }

      // Fetch booking details
      const { data: booking, error: bookingError } = await supabase
        .from('bookings')
        .select('podcast_name, podcast_image_url')
        .eq('id', bookingId)
        .single()

      if (bookingError || !booking) {
        console.error(`Booking not found: ${bookingId}`)
        continue // Skip this addon
      }

      // Check if this addon already exists
      const { data: existingAddon } = await supabase
        .from('booking_addons')
        .select('id')
        .eq('booking_id', bookingId)
        .eq('service_id', serviceId)
        .single()

      if (existingAddon) {
        console.log(`Addon already exists for booking ${bookingId} and service ${serviceId}`)
        continue // Skip this addon
      }

      // Add to line items
      lineItems.push({
        price_data: {
          currency: 'usd',
          product_data: {
            name: service.name,
            images: booking.podcast_image_url ? [booking.podcast_image_url] : [],
            description: `${service.short_description || service.name} for ${booking.podcast_name}`,
          },
          unit_amount: service.price_cents,
        },
        quantity: 1,
      })

      // Store addon metadata
      addonMetadata.push({
        bookingId,
        serviceId,
        podcastName: booking.podcast_name,
      })

      console.log(`Added addon: ${service.name} for ${booking.podcast_name}`)
    }

    // Ensure we have at least one valid addon
    if (lineItems.length === 0) {
      return new Response(
        JSON.stringify({ error: 'No valid addons to checkout. All may already be purchased.' }),
        {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      )
    }

    // Get origin for redirect URLs
    const origin = req.headers.get('origin') || 'http://localhost:8080'

    console.log(`Creating Stripe session with ${lineItems.length} line items`)

    // Create Stripe Checkout Session
    const session = await stripe.checkout.sessions.create({
      mode: 'payment',
      customer_email: client.email || undefined,
      line_items: lineItems,
      success_url: `${origin}/portal/dashboard?addon_purchase=success`,
      cancel_url: `${origin}/portal/dashboard?addon_purchase=canceled`,
      metadata: {
        type: 'addon_order',
        clientId,
        clientName: client.name,
        clientEmail: client.email || '',
        addons: JSON.stringify(addonMetadata),
      },
      payment_intent_data: {
        metadata: {
          type: 'addon_order',
          clientId,
          addons: JSON.stringify(addonMetadata),
        },
      },
    })

    console.log('✅ Addon checkout session created:', session.id)

    // Return session data
    return new Response(
      JSON.stringify({
        sessionId: session.id,
        url: session.url,
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    )
  } catch (error) {
    console.error('❌ Error creating addon checkout session:', error)
    return new Response(
      JSON.stringify({ error: error.message || 'Failed to create checkout session' }),
      {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    )
  }
})
