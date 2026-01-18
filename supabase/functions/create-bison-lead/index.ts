import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const { message_id } = await req.json()

    if (!message_id) {
      throw new Error('message_id is required')
    }

    console.log('[Create Bison Lead] Processing message:', message_id)

    // Initialize Supabase client
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const supabase = createClient(supabaseUrl, supabaseServiceKey)

    // Fetch message with client data
    const { data: message, error: fetchError } = await supabase
      .from('outreach_messages')
      .select(`
        *,
        client:clients!inner(id, name, email)
      `)
      .eq('id', message_id)
      .single()

    if (fetchError) {
      console.error('[Create Bison Lead] Fetch error:', fetchError)
      throw new Error(`Failed to fetch message: ${fetchError.message}`)
    }

    if (!message) {
      throw new Error(`Message not found: ${message_id}`)
    }

    console.log('[Create Bison Lead] Message fetched:', {
      id: message.id,
      host_email: message.host_email,
      has_client: !!message.client
    })

    // Check if lead already created
    if (message.bison_lead_id) {
      console.log('[Create Bison Lead] Lead already exists:', message.bison_lead_id)
      return new Response(
        JSON.stringify({
          success: true,
          lead_id: message.bison_lead_id,
          already_exists: true
        }),
        {
          status: 200,
          headers: {
            ...corsHeaders,
            'Content-Type': 'application/json',
          },
        }
      )
    }

    // Get Bison API credentials
    const bisonApiUrl = Deno.env.get('BISON_API_URL')
    const bisonApiKey = Deno.env.get('BISON_API_KEY')

    if (!bisonApiUrl || !bisonApiKey) {
      throw new Error('BISON_API_URL and BISON_API_KEY must be configured')
    }

    // Parse host name into first and last name
    const nameParts = message.host_name.trim().split(' ')
    const firstName = nameParts[0] || 'Unknown'
    const lastName = nameParts.slice(1).join(' ') || 'Host'

    // Build custom variables
    const customVariables = []

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

    // First, search for existing lead by email in Bison
    console.log('[Create Bison Lead] Searching for existing lead:', message.host_email)

    let leadId: number | null = null
    let leadAlreadyExisted = false

    const searchResponse = await fetch(`${bisonApiUrl}/api/leads?email=${encodeURIComponent(message.host_email)}`, {
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${bisonApiKey}`
      }
    })

    if (searchResponse.ok) {
      const searchData = await searchResponse.json()
      if (searchData.data && Array.isArray(searchData.data) && searchData.data.length > 0) {
        leadId = searchData.data[0].id
        leadAlreadyExisted = true
        console.log('[Create Bison Lead] Found existing lead with ID:', leadId)
      }
    }

    // If no existing lead found, create new one
    if (!leadId) {
      console.log('[Create Bison Lead] No existing lead found, creating new lead in Bison')

      const leadPayload = {
        first_name: firstName,
        last_name: lastName,
        email: message.host_email,
        company: message.podcast_name || 'Unknown Podcast',
        title: 'Podcast Host',
        notes: `Outreach for ${message.client?.name || 'client'}`,
        custom_variables: customVariables
      }

      const createLeadResponse = await fetch(`${bisonApiUrl}/api/leads`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${bisonApiKey}`
        },
        body: JSON.stringify(leadPayload)
      })

      if (!createLeadResponse.ok) {
        const errorText = await createLeadResponse.text()
        let errorData
        try {
          errorData = JSON.parse(errorText)
        } catch (e) {
          errorData = { message: errorText }
        }

        // Check if it's a duplicate email error (race condition)
        if (createLeadResponse.status === 422 && errorData?.data?.message?.includes('email has already been taken')) {
          // Try to search again
          const retrySearchResponse = await fetch(`${bisonApiUrl}/api/leads?email=${encodeURIComponent(message.host_email)}`, {
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${bisonApiKey}`
            }
          })

          if (retrySearchResponse.ok) {
            const retrySearchData = await retrySearchResponse.json()
            if (retrySearchData.data && Array.isArray(retrySearchData.data) && retrySearchData.data.length > 0) {
              leadId = retrySearchData.data[0].id
              leadAlreadyExisted = true
              console.log('[Create Bison Lead] Found lead after duplicate error:', leadId)
            }
          }
        }

        if (!leadId) {
          console.error('[Create Bison Lead] Failed to create lead:', {
            status: createLeadResponse.status,
            statusText: createLeadResponse.statusText,
            error: errorData
          })

          // User-friendly error messages
          const userMessage = errorData?.data?.message || errorData?.message || 'Unknown error'
          throw new Error(`Could not create lead in Bison: ${userMessage}`)
        }
      } else {
        const leadData = await createLeadResponse.json()
        console.log('[Create Bison Lead] Bison response:', leadData)

        leadId = leadData.data?.id

        if (!leadId) {
          console.error('[Create Bison Lead] No lead ID in response:', leadData)
          throw new Error('Bison did not return a lead ID')
        }

        console.log('[Create Bison Lead] Lead created with ID:', leadId)
      }
    }

    // Update message with bison_lead_id (don't change status - that's handled separately)
    const { error: updateError } = await supabase
      .from('outreach_messages')
      .update({
        bison_lead_id: leadId
      })
      .eq('id', message_id)

    if (updateError) {
      console.error('[Create Bison Lead] Failed to update message:', updateError)
      // Don't throw - lead was created successfully
    }

    // Attach to campaign if campaign_id exists
    if (message.bison_campaign_id) {
      console.log('[Create Bison Lead] Attaching lead to campaign:', message.bison_campaign_id)

      const attachPayload = {
        lead_ids: [leadId]
      }

      const attachResponse = await fetch(
        `${bisonApiUrl}/api/campaigns/${message.bison_campaign_id}/leads/attach-leads`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${bisonApiKey}`
          },
          body: JSON.stringify(attachPayload)
        }
      )

      if (!attachResponse.ok) {
        const errorText = await attachResponse.text()
        console.error('[Create Bison Lead] Failed to attach to campaign:', errorText)
        // Don't throw - lead was created successfully, just not attached
        return new Response(
          JSON.stringify({
            success: true,
            lead_id: leadId,
            campaign_attached: false,
            campaign_error: errorText
          }),
          {
            status: 200,
            headers: {
              ...corsHeaders,
              'Content-Type': 'application/json',
            },
          }
        )
      }

      console.log('[Create Bison Lead] Lead attached to campaign successfully')
    }

    return new Response(
      JSON.stringify({
        success: true,
        lead_id: leadId,
        lead_already_existed: leadAlreadyExisted,
        campaign_attached: !!message.bison_campaign_id,
        campaign_id: message.bison_campaign_id
      }),
      {
        status: 200,
        headers: {
          ...corsHeaders,
          'Content-Type': 'application/json',
        },
      }
    )
  } catch (error) {
    console.error('[Create Bison Lead] Error:', error)

    return new Response(
      JSON.stringify({
        success: false,
        error: error.message || 'Internal server error',
      }),
      {
        status: 400,
        headers: {
          ...corsHeaders,
          'Content-Type': 'application/json',
        },
      }
    )
  }
})
