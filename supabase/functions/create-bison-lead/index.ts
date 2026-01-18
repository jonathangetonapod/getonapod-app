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

    // Create lead directly in Bison - Bison will return the lead ID
    // If the email already exists, Bison will return a 422 error and we'll handle it
    console.log('[Create Bison Lead] Creating lead in Bison for:', message.host_email)

    let leadId: number | null = null
    let leadAlreadyExisted = false

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

        // Check if it's a duplicate email error (lead already exists)
        if (createLeadResponse.status === 422 && errorData?.data?.message?.includes('email has already been taken')) {
          console.log('[Create Bison Lead] Email already exists, updating existing lead via PATCH')

          // Update the existing lead using email as identifier (PATCH /api/leads/{email})
          const updatePayload = {
            first_name: firstName,
            last_name: lastName,
            email: message.host_email,
            company: message.podcast_name || 'Unknown Podcast',
            title: 'Podcast Host',
            notes: `Outreach for ${message.client?.name || 'client'}`,
            custom_variables: customVariables
          }

          const updateResponse = await fetch(`${bisonApiUrl}/api/leads/${encodeURIComponent(message.host_email)}`, {
            method: 'PATCH',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${bisonApiKey}`
            },
            body: JSON.stringify(updatePayload)
          })

          if (updateResponse.ok) {
            const updateData = await updateResponse.json()
            console.log('[Create Bison Lead] Lead updated successfully:', updateData)

            leadId = updateData.data?.id
            leadAlreadyExisted = true

            if (!leadId) {
              console.error('[Create Bison Lead] No lead ID in update response:', updateData)
              return new Response(
                JSON.stringify({
                  success: false,
                  error: 'Updated existing lead but no ID returned',
                  email: message.host_email
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

            console.log('[Create Bison Lead] Using existing lead ID:', leadId)
          } else {
            const updateErrorText = await updateResponse.text()
            console.error('[Create Bison Lead] Failed to update existing lead:', updateErrorText)

            return new Response(
              JSON.stringify({
                success: false,
                error: 'Lead already exists but could not be updated',
                email: message.host_email,
                bison_error: updateErrorText
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
        }

        if (!leadId) {
          console.error('[Create Bison Lead] Failed to create lead:', {
            status: createLeadResponse.status,
            statusText: createLeadResponse.statusText,
            error: errorData
          })

          // User-friendly error messages
          const userMessage = errorData?.data?.message || errorData?.message || 'Unknown error'

          // Return error response instead of throwing
          return new Response(
            JSON.stringify({
              success: false,
              error: `Could not create lead in Bison: ${userMessage}`,
              bison_error_details: errorData
            }),
            {
              status: 200, // Still 200 so it doesn't crash the UI
              headers: {
                ...corsHeaders,
                'Content-Type': 'application/json',
              },
            }
          )
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
      console.log('[Create Bison Lead] Lead ID to attach:', leadId)

      const attachPayload = {
        lead_ids: [leadId],
        allow_parallel_sending: false
      }

      const attachUrl = `${bisonApiUrl}/api/campaigns/${message.bison_campaign_id}/leads/attach-leads`
      console.log('[Create Bison Lead] Attachment URL:', attachUrl)
      console.log('[Create Bison Lead] Attachment payload:', JSON.stringify(attachPayload))

      const attachResponse = await fetch(
        attachUrl,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${bisonApiKey}`
          },
          body: JSON.stringify(attachPayload)
        }
      )

      console.log('[Create Bison Lead] Attachment response status:', attachResponse.status)
      const responseText = await attachResponse.text()
      console.log('[Create Bison Lead] Attachment response body:', responseText)

      if (!attachResponse.ok) {
        console.error('[Create Bison Lead] Failed to attach to campaign')
        // Don't throw - lead was created successfully, just not attached
        return new Response(
          JSON.stringify({
            success: true,
            lead_id: leadId,
            campaign_attached: false,
            campaign_error: responseText
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
    } else {
      console.warn('[Create Bison Lead] No bison_campaign_id on message - skipping campaign attachment')
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
