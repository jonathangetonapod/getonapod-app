import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': Deno.env.get('ALLOWED_ORIGIN') || 'https://getonapod.com',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const MAX_CONCURRENCY = 5

interface LeadResult {
  message_id: string
  success: boolean
  lead_id?: number | null
  already_existed?: boolean
  campaign_attached?: boolean
  error?: string
}

async function processMessage(
  messageId: string,
  supabase: any,
  bisonApiUrl: string,
  bisonApiKey: string
): Promise<LeadResult> {
  try {
    // Fetch message with client data
    const { data: message, error: fetchError } = await supabase
      .from('outreach_messages')
      .select(`
        *,
        client:clients!inner(id, name, email)
      `)
      .eq('id', messageId)
      .single()

    if (fetchError || !message) {
      return {
        message_id: messageId,
        success: false,
        error: `Message not found: ${fetchError?.message || 'No data'}`,
      }
    }

    // Check if lead already created
    if (message.bison_lead_id) {
      return {
        message_id: messageId,
        success: true,
        lead_id: message.bison_lead_id,
        already_existed: true,
      }
    }

    // Parse host name into first and last name
    const nameParts = (message.host_name || '').trim().split(' ')
    const firstName = nameParts[0] || 'Unknown'
    const lastName = nameParts.slice(1).join(' ') || 'Host'

    // Build custom variables
    const customVariables: { name: string; value: string }[] = []

    if (message.podcast_id) {
      customVariables.push({ name: 'podcast_id', value: message.podcast_id })
    }
    if (message.podcast_name) {
      customVariables.push({ name: 'podcast_name', value: message.podcast_name })
    }
    if (message.client?.name) {
      customVariables.push({ name: 'client_name', value: message.client.name })
    }
    if (message.subject_line) {
      customVariables.push({ name: 'subject_line', value: message.subject_line })
    }
    if (message.email_body) {
      customVariables.push({ name: 'email_body', value: message.email_body })
    }
    if (message.bison_campaign_id) {
      customVariables.push({ name: 'campaign_id', value: message.bison_campaign_id })
    }

    // Create lead in Bison
    const leadPayload = {
      first_name: firstName,
      last_name: lastName,
      email: message.host_email,
      company: message.podcast_name || 'Unknown Podcast',
      title: 'Podcast Host',
      notes: `Outreach for ${message.client?.name || 'client'}`,
      custom_variables: customVariables,
    }

    let leadId: number | null = null
    let leadAlreadyExisted = false

    const createLeadResponse = await fetch(`${bisonApiUrl}/api/leads`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${bisonApiKey}`,
      },
      body: JSON.stringify(leadPayload),
    })

    if (!createLeadResponse.ok) {
      const errorText = await createLeadResponse.text()
      let errorData: any
      try {
        errorData = JSON.parse(errorText)
      } catch {
        errorData = { message: errorText }
      }

      // Check if it's a duplicate email error (lead already exists)
      if (
        createLeadResponse.status === 422 &&
        errorData?.data?.message?.includes('email has already been taken')
      ) {
        // Update the existing lead using email as identifier
        const updateResponse = await fetch(
          `${bisonApiUrl}/api/leads/${encodeURIComponent(message.host_email)}`,
          {
            method: 'PATCH',
            headers: {
              'Content-Type': 'application/json',
              Authorization: `Bearer ${bisonApiKey}`,
            },
            body: JSON.stringify(leadPayload),
          }
        )

        if (updateResponse.ok) {
          const updateData = await updateResponse.json()
          leadId = updateData.data?.id
          leadAlreadyExisted = true

          if (!leadId) {
            return {
              message_id: messageId,
              success: false,
              error: 'Updated existing lead but no ID returned',
            }
          }
        } else {
          const updateErrorText = await updateResponse.text()
          return {
            message_id: messageId,
            success: false,
            error: `Lead already exists but could not be updated: ${updateErrorText}`,
          }
        }
      } else {
        const userMessage = errorData?.data?.message || errorData?.message || 'Unknown error'
        return {
          message_id: messageId,
          success: false,
          error: `Could not create lead in Bison: ${userMessage}`,
        }
      }
    } else {
      const leadData = await createLeadResponse.json()
      leadId = leadData.data?.id

      if (!leadId) {
        return {
          message_id: messageId,
          success: false,
          error: 'Bison did not return a lead ID',
        }
      }
    }

    // Update message with bison_lead_id
    const { error: updateError } = await supabase
      .from('outreach_messages')
      .update({ bison_lead_id: leadId })
      .eq('id', messageId)

    if (updateError) {
      console.error(`[Batch Create Bison Leads] Failed to update message ${messageId}:`, updateError)
    }

    // Attach to campaign if campaign_id exists
    let campaignAttached = false
    if (message.bison_campaign_id) {
      const attachResponse = await fetch(
        `${bisonApiUrl}/api/campaigns/${message.bison_campaign_id}/leads/attach-leads`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${bisonApiKey}`,
          },
          body: JSON.stringify({
            lead_ids: [leadId],
            allow_parallel_sending: false,
          }),
        }
      )

      campaignAttached = attachResponse.ok
      if (!attachResponse.ok) {
        console.warn(`[Batch Create Bison Leads] Failed to attach lead ${leadId} to campaign ${message.bison_campaign_id}`)
      }
    }

    return {
      message_id: messageId,
      success: true,
      lead_id: leadId,
      already_existed: leadAlreadyExisted,
      campaign_attached: campaignAttached,
    }
  } catch (err) {
    return {
      message_id: messageId,
      success: false,
      error: err.message || 'Unknown error',
    }
  }
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const { message_ids } = await req.json()

    if (!message_ids || !Array.isArray(message_ids) || message_ids.length === 0) {
      return new Response(
        JSON.stringify({ success: false, error: 'message_ids must be a non-empty array' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const supabase = createClient(supabaseUrl, supabaseServiceKey)

    const bisonApiUrl = Deno.env.get('BISON_API_URL')
    const bisonApiKey = Deno.env.get('BISON_API_KEY')

    if (!bisonApiUrl || !bisonApiKey) {
      throw new Error('BISON_API_URL and BISON_API_KEY must be configured')
    }

    console.log(`[Batch Create Bison Leads] Processing ${message_ids.length} messages with concurrency ${MAX_CONCURRENCY}`)

    const results: LeadResult[] = []

    // Process in batches with concurrency limit
    for (let i = 0; i < message_ids.length; i += MAX_CONCURRENCY) {
      const batch = message_ids.slice(i, i + MAX_CONCURRENCY)
      const batchResults = await Promise.all(
        batch.map((id: string) => processMessage(id, supabase, bisonApiUrl, bisonApiKey))
      )
      results.push(...batchResults)
    }

    const created = results.filter((r) => r.success && !r.already_existed).length
    const alreadyExisted = results.filter((r) => r.success && r.already_existed).length
    const failed = results.filter((r) => !r.success).length

    console.log(
      `[Batch Create Bison Leads] Complete: ${created} created, ${alreadyExisted} already existed, ${failed} failed`
    )

    return new Response(
      JSON.stringify({
        success: true,
        total: message_ids.length,
        created,
        already_existed: alreadyExisted,
        failed,
        results,
      }),
      {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    )
  } catch (error) {
    console.error('[Batch Create Bison Leads] Error:', error)

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
