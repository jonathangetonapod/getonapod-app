import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { getPortalInvitationEmail } from '../_shared/email-templates.ts'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

interface RequestBody {
  // Required fields
  name: string
  email: string

  // Optional client details
  bio?: string
  linkedin_url?: string
  website?: string
  calendar_link?: string
  contact_person?: string
  first_invoice_paid_date?: string
  status?: 'active' | 'paused' | 'churned'
  notes?: string

  // Headshot file (base64 encoded)
  headshot_base64?: string
  headshot_filename?: string
  headshot_content_type?: string

  // Portal access options
  enable_portal_access?: boolean
  password?: string // If not provided, will use magic link only
  send_invitation_email?: boolean

  // Google Sheet options
  create_google_sheet?: boolean

  // API authentication
  api_key?: string
}

interface ClientAccount {
  client_id: string
  name: string
  email: string
  bio?: string
  linkedin_url?: string
  website?: string
  calendar_link?: string
  contact_person?: string
  first_invoice_paid_date?: string
  status: string
  notes?: string
  portal_access_enabled: boolean
  portal_url: string
  password?: string
  invitation_sent: boolean
  google_sheet_url?: string
  google_sheet_created: boolean
  created_at: string
}

serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const {
      name,
      email,
      bio,
      linkedin_url,
      website,
      calendar_link,
      contact_person,
      first_invoice_paid_date,
      status = 'active',
      notes,
      headshot_base64,
      headshot_filename,
      headshot_content_type,
      enable_portal_access = true,
      password,
      send_invitation_email = true,
      create_google_sheet = false,
      api_key,
    }: RequestBody = await req.json()

    // Validation
    if (!name || !name.trim()) {
      return new Response(
        JSON.stringify({ error: 'Client name is required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    if (!email || !email.trim()) {
      return new Response(
        JSON.stringify({ error: 'Client email is required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Validate email format
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
    if (!emailRegex.test(email)) {
      return new Response(
        JSON.stringify({ error: 'Invalid email format' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Get environment variables
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const portalBaseUrl = Deno.env.get('PORTAL_BASE_URL') || 'http://localhost:5173'
    const expectedApiKey = Deno.env.get('API_KEY')
    const resendApiKey = Deno.env.get('RESEND_API_KEY')

    // API key authentication (optional, for security)
    if (expectedApiKey && api_key !== expectedApiKey) {
      console.error('[Create Client] Invalid API key')
      return new Response(
        JSON.stringify({ error: 'Invalid API key' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Initialize Supabase client with service role
    const supabase = createClient(supabaseUrl, supabaseServiceKey, {
      auth: {
        autoRefreshToken: false,
        persistSession: false
      }
    })

    console.log(`[Create Client] Creating client account for ${email}`)

    // Check if client already exists
    const { data: existingClient, error: checkError } = await supabase
      .from('clients')
      .select('id, email')
      .ilike('email', email)
      .maybeSingle()

    if (checkError) {
      console.error('[Create Client] Error checking existing client:', checkError)
      throw new Error('Failed to check existing client')
    }

    if (existingClient) {
      return new Response(
        JSON.stringify({
          error: 'Client with this email already exists',
          client_id: existingClient.id
        }),
        { status: 409, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Create client record
    const clientData: any = {
      name: name.trim(),
      email: email.trim().toLowerCase(),
      status,
      portal_access_enabled: enable_portal_access,
    }

    // Add optional fields if provided
    if (bio) clientData.bio = bio
    if (linkedin_url) clientData.linkedin_url = linkedin_url
    if (website) clientData.website = website
    if (calendar_link) clientData.calendar_link = calendar_link
    if (contact_person) clientData.contact_person = contact_person
    if (first_invoice_paid_date) clientData.first_invoice_paid_date = first_invoice_paid_date
    if (notes) clientData.notes = notes

    // Set password if provided
    if (password && enable_portal_access) {
      clientData.portal_password = password
      clientData.password_set_at = new Date().toISOString()
      clientData.password_set_by = 'API'
    }

    const { data: client, error: createError } = await supabase
      .from('clients')
      .insert([clientData])
      .select()
      .single()

    if (createError) {
      console.error('[Create Client] Error creating client:', createError)
      throw new Error(`Failed to create client: ${createError.message}`)
    }

    console.log(`[Create Client] Client created successfully: ${client.id}`)

    // Upload headshot if provided
    let headshotUrl: string | undefined
    if (headshot_base64 && headshot_filename && headshot_content_type) {
      try {
        console.log(`[Create Client] Uploading headshot for ${client.name}`)

        // Convert base64 to Uint8Array
        const base64Data = headshot_base64.split(',')[1] || headshot_base64
        const binaryString = atob(base64Data)
        const bytes = new Uint8Array(binaryString.length)
        for (let i = 0; i < binaryString.length; i++) {
          bytes[i] = binaryString.charCodeAt(i)
        }

        // Create filename with timestamp to avoid collisions
        const timestamp = Date.now()
        const fileExtension = headshot_filename.split('.').pop() || 'jpg'
        const storagePath = `client-photos/${client.id}_${timestamp}.${fileExtension}`

        // Upload to storage
        const { data: uploadData, error: uploadError } = await supabase.storage
          .from('client-assets')
          .upload(storagePath, bytes, {
            contentType: headshot_content_type,
            upsert: false
          })

        if (uploadError) {
          console.error('[Create Client] Headshot upload error:', uploadError)
        } else {
          // Get public URL
          const { data: { publicUrl } } = supabase.storage
            .from('client-assets')
            .getPublicUrl(storagePath)

          headshotUrl = publicUrl
          console.log(`[Create Client] Headshot uploaded: ${headshotUrl}`)

          // Update client with photo URL
          await supabase
            .from('clients')
            .update({ photo_url: headshotUrl })
            .eq('id', client.id)
        }
      } catch (headshotError) {
        console.error('[Create Client] Error uploading headshot:', headshotError)
        // Don't fail the whole request if headshot upload fails
      }
    }

    // Create Google Sheet if requested
    let googleSheetUrl: string | undefined
    let googleSheetCreated = false
    let googleSheetError: string | undefined
    if (create_google_sheet) {
      try {
        console.log(`[Create Client] Creating Google Sheet for ${client.name}`)
        console.log(`[Create Client] Supabase URL: ${supabaseUrl}`)

        // Call the create-client-google-sheet edge function
        const sheetResponse = await fetch(`${supabaseUrl}/functions/v1/create-client-google-sheet`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${supabaseServiceKey}`,
          },
          body: JSON.stringify({
            clientId: client.id,
            clientName: client.name,
          }),
        })

        console.log(`[Create Client] Sheet response status: ${sheetResponse.status}`)

        if (sheetResponse.ok) {
          const sheetData = await sheetResponse.json()
          googleSheetUrl = sheetData.spreadsheetUrl
          googleSheetCreated = true
          console.log(`[Create Client] Google Sheet created: ${googleSheetUrl}`)

          // Update client with Google Sheet URL
          await supabase
            .from('clients')
            .update({ google_sheet_url: googleSheetUrl })
            .eq('id', client.id)
        } else {
          const errorText = await sheetResponse.text()
          googleSheetError = `Status ${sheetResponse.status}: ${errorText}`
          console.error('[Create Client] Failed to create Google Sheet:', googleSheetError)
        }
      } catch (sheetError) {
        googleSheetError = sheetError.message || 'Unknown error'
        console.error('[Create Client] Error creating Google Sheet:', sheetError)
        // Don't fail the whole request if sheet creation fails
      }
    }

    // Send invitation email if requested and portal access is enabled
    let invitationSent = false
    if (enable_portal_access && send_invitation_email && resendApiKey) {
      try {
        const portalUrl = `${portalBaseUrl}/portal/login`
        const emailTemplate = getPortalInvitationEmail(client.name, portalUrl)

        const emailResponse = await fetch('https://api.resend.com/emails', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${resendApiKey}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            from: 'Jonathan Garces <portal@mail.getonapod.com>',
            to: [email],
            subject: emailTemplate.subject,
            html: emailTemplate.html,
            text: emailTemplate.text,
            reply_to: 'jonathan@getonapod.com',
          }),
        })

        if (emailResponse.ok) {
          const emailData = await emailResponse.json()
          console.log(`[Create Client] Invitation email sent: ${emailData.id}`)

          // Update portal_invitation_sent_at
          await supabase
            .from('clients')
            .update({ portal_invitation_sent_at: new Date().toISOString() })
            .eq('id', client.id)

          // Log email
          await supabase.from('email_logs').insert({
            resend_email_id: emailData.id,
            email_type: 'portal_invitation',
            from_address: 'Jonathan Garces <portal@mail.getonapod.com>',
            to_address: email,
            subject: emailTemplate.subject,
            status: 'sent',
            client_id: client.id,
          })

          invitationSent = true
        } else {
          const errorText = await emailResponse.text()
          console.error('[Create Client] Failed to send invitation email:', errorText)
        }
      } catch (emailError) {
        console.error('[Create Client] Error sending invitation email:', emailError)
        // Don't fail the whole request if email fails
      }
    }

    // Prepare response with all client details
    const response: ClientAccount = {
      client_id: client.id,
      name: client.name,
      email: client.email,
      status: client.status,
      portal_access_enabled: client.portal_access_enabled,
      portal_url: `${portalBaseUrl}/portal/login`,
      invitation_sent: invitationSent,
      google_sheet_created: googleSheetCreated,
      created_at: client.created_at,
    }

    // Include all optional fields that were provided
    if (client.bio) response.bio = client.bio
    if (client.linkedin_url) response.linkedin_url = client.linkedin_url
    if (client.website) response.website = client.website
    if (client.calendar_link) response.calendar_link = client.calendar_link
    if (client.contact_person) response.contact_person = client.contact_person
    if (client.first_invoice_paid_date) response.first_invoice_paid_date = client.first_invoice_paid_date
    if (client.notes) response.notes = client.notes

    // Only include password in response if it was set
    if (password && enable_portal_access) {
      response.password = password
    }

    // Include Google Sheet URL if created
    if (googleSheetUrl) {
      response.google_sheet_url = googleSheetUrl
    }

    const responsePayload: any = {
      success: true,
      message: 'Client account created successfully',
      client: response,
    }

    // Include Google Sheet error in response for debugging
    if (googleSheetError) {
      responsePayload.google_sheet_error = googleSheetError
      responsePayload.message = 'Client account created successfully, but Google Sheet creation failed'
    }

    return new Response(
      JSON.stringify(responsePayload),
      { status: 201, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )

  } catch (error) {
    console.error('[Create Client] Error:', error)

    return new Response(
      JSON.stringify({
        error: error.message || 'Internal server error',
      }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})
