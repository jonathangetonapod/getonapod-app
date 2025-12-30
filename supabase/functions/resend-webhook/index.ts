import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, svix-id, svix-timestamp, svix-signature',
}

/**
 * Resend Webhook Handler
 *
 * Handles delivery events from Resend:
 * - email.sent
 * - email.delivered
 * - email.delivery_delayed
 * - email.bounced
 * - email.complained
 * - email.opened
 * - email.clicked
 *
 * Documentation: https://resend.com/docs/dashboard/webhooks/introduction
 */

interface ResendWebhookEvent {
  type: string
  created_at: string
  data: {
    email_id: string
    from: string
    to: string[]
    subject: string
    created_at: string
    // Event-specific fields
    bounce_type?: string // 'hard' | 'soft' | 'spam'
    complaint_type?: string
    click?: {
      link: string
      timestamp: string
    }
  }
}

serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    // Get environment variables
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const resendWebhookSecret = Deno.env.get('RESEND_WEBHOOK_SECRET')

    // Initialize Supabase client with service role
    const supabase = createClient(supabaseUrl, supabaseServiceKey)

    // TODO: Verify webhook signature using svix-* headers
    // For now, we'll just process the event
    if (resendWebhookSecret) {
      const svixId = req.headers.get('svix-id')
      const svixTimestamp = req.headers.get('svix-timestamp')
      const svixSignature = req.headers.get('svix-signature')

      if (!svixId || !svixTimestamp || !svixSignature) {
        console.warn('[Resend Webhook] Missing Svix headers')
        // Continue anyway for now
      }
    }

    // Parse webhook event
    const event: ResendWebhookEvent = await req.json()
    console.log(`[Resend Webhook] Received event: ${event.type} for ${event.data.email_id}`)

    const emailId = event.data.email_id
    const toAddress = event.data.to[0] // Get first recipient

    // Find email log entry
    const { data: emailLog, error: findError } = await supabase
      .from('email_logs')
      .select('*')
      .eq('resend_email_id', emailId)
      .single()

    if (findError) {
      console.warn(`[Resend Webhook] Email log not found for ${emailId}:`, findError)
      // Return success anyway - Resend doesn't need to retry
      return new Response(
        JSON.stringify({ received: true, warning: 'Email log not found' }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Handle different event types
    switch (event.type) {
      case 'email.sent':
        await supabase
          .from('email_logs')
          .update({ status: 'sent' })
          .eq('resend_email_id', emailId)
        console.log(`[Resend Webhook] Email sent: ${emailId}`)
        break

      case 'email.delivered':
        await supabase
          .from('email_logs')
          .update({ status: 'delivered' })
          .eq('resend_email_id', emailId)
        console.log(`[Resend Webhook] Email delivered: ${emailId}`)
        break

      case 'email.delivery_delayed':
        await supabase
          .from('email_logs')
          .update({
            metadata: {
              ...emailLog?.metadata,
              delivery_delayed: true,
              delayed_at: event.created_at
            }
          })
          .eq('resend_email_id', emailId)
        console.log(`[Resend Webhook] Email delayed: ${emailId}`)
        break

      case 'email.bounced':
        const bounceType = event.data.bounce_type || 'unknown'

        // Update email log
        await supabase
          .from('email_logs')
          .update({
            status: 'bounced',
            bounce_type: bounceType
          })
          .eq('resend_email_id', emailId)

        // Record bounce for suppression
        await supabase.rpc('record_email_bounce', {
          email: toAddress,
          bounce_type_param: bounceType,
          auto_suppress: true
        })

        console.log(`[Resend Webhook] Email bounced (${bounceType}): ${emailId} - ${toAddress}`)
        break

      case 'email.complained':
        const complaintType = event.data.complaint_type || 'abuse'

        // Update email log
        await supabase
          .from('email_logs')
          .update({
            status: 'complained',
            complaint_type: complaintType
          })
          .eq('resend_email_id', emailId)

        // Record as complaint bounce for suppression
        await supabase.rpc('record_email_bounce', {
          email: toAddress,
          bounce_type_param: 'complaint',
          auto_suppress: true
        })

        console.log(`[Resend Webhook] Email complained (${complaintType}): ${emailId} - ${toAddress}`)

        // TODO: Alert admin about spam complaint
        break

      case 'email.opened':
        const currentOpenCount = emailLog?.open_count || 0
        const openedAt = emailLog?.opened_at || event.created_at

        await supabase
          .from('email_logs')
          .update({
            opened_at: openedAt, // Keep first open time
            open_count: currentOpenCount + 1
          })
          .eq('resend_email_id', emailId)

        console.log(`[Resend Webhook] Email opened (#${currentOpenCount + 1}): ${emailId}`)
        break

      case 'email.clicked':
        const currentClickCount = emailLog?.click_count || 0
        const clickedAt = emailLog?.clicked_at || event.created_at
        const clickedLink = event.data.click?.link

        await supabase
          .from('email_logs')
          .update({
            clicked_at: clickedAt, // Keep first click time
            click_count: currentClickCount + 1,
            metadata: {
              ...emailLog?.metadata,
              last_clicked_link: clickedLink
            }
          })
          .eq('resend_email_id', emailId)

        console.log(`[Resend Webhook] Email clicked (#${currentClickCount + 1}): ${emailId} -> ${clickedLink}`)
        break

      default:
        console.log(`[Resend Webhook] Unknown event type: ${event.type}`)
    }

    return new Response(
      JSON.stringify({ received: true, event_type: event.type }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )

  } catch (error) {
    console.error('[Resend Webhook] Error:', error)

    // Return 200 anyway to avoid Resend retrying
    return new Response(
      JSON.stringify({ received: true, error: error.message }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})
