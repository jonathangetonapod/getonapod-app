import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3'

const corsHeaders = {
  'Access-Control-Allow-Origin': Deno.env.get('ALLOWED_ORIGIN') || 'https://getonapod.com',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

/**
 * Generate Google Access Token from Service Account
 */
async function getGoogleAccessToken(): Promise<string> {
  const serviceAccountJson = Deno.env.get('GOOGLE_SERVICE_ACCOUNT_JSON')

  if (!serviceAccountJson) {
    throw new Error('GOOGLE_SERVICE_ACCOUNT_JSON not configured')
  }

  let serviceAccount
  try {
    serviceAccount = JSON.parse(serviceAccountJson)
  } catch (parseError) {
    console.error('[Create Sheet] Failed to parse GOOGLE_SERVICE_ACCOUNT_JSON:', parseError.message)
    console.error('[Create Sheet] First 100 chars:', serviceAccountJson.substring(0, 100))
    throw new Error('GOOGLE_SERVICE_ACCOUNT_JSON is not valid JSON')
  }

  const { client_email, private_key } = serviceAccount

  if (!client_email || !private_key) {
    throw new Error(`Invalid service account credentials. Has client_email: ${!!client_email}, has private_key: ${!!private_key}`)
  }

  console.log('[Create Sheet] Service account email:', client_email)
  console.log('[Create Sheet] Private key starts with BEGIN:', private_key.startsWith('-----BEGIN'))
  console.log('[Create Sheet] Private key length:', private_key.length)

  // Create JWT
  const now = Math.floor(Date.now() / 1000)
  const expiry = now + 3600

  const base64UrlEncode = (data: string) =>
    btoa(data)
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=/g, '')

  const jwtHeader = base64UrlEncode(JSON.stringify({
    alg: 'RS256',
    typ: 'JWT',
  }))

  // Domain-wide delegation with sheets-writer service account
  const userEmail = Deno.env.get('GOOGLE_WORKSPACE_USER_EMAIL')
  const jwtPayloadObj: Record<string, unknown> = {
    iss: client_email,
    scope: 'https://www.googleapis.com/auth/spreadsheets https://www.googleapis.com/auth/drive',
    aud: 'https://oauth2.googleapis.com/token',
    exp: expiry,
    iat: now,
  }

  if (userEmail) {
    jwtPayloadObj.sub = userEmail
    console.log('[Create Sheet] Domain-wide delegation, impersonating:', userEmail)
  } else {
    console.log('[Create Sheet] No GOOGLE_WORKSPACE_USER_EMAIL, using service account directly')
  }
  console.log('[Create Sheet] Service account:', client_email)

  const jwtPayload = base64UrlEncode(JSON.stringify(jwtPayloadObj))

  // Import private key — handle both real newlines and escaped \n from env storage
  const normalizedKey = private_key.replace(/\\n/g, '\n')
  const pemHeader = '-----BEGIN PRIVATE KEY-----'
  const pemFooter = '-----END PRIVATE KEY-----'
  const pemContents = normalizedKey
    .replace(pemHeader, '')
    .replace(pemFooter, '')
    .replace(/\s/g, '')

  console.log('[Create Sheet] PEM base64 length after stripping:', pemContents.length)

  let binaryDer: Uint8Array
  try {
    binaryDer = Uint8Array.from(atob(pemContents), (c) => c.charCodeAt(0))
  } catch (b64Error) {
    console.error('[Create Sheet] Failed to decode private key base64:', b64Error.message)
    console.error('[Create Sheet] First 20 chars of PEM content:', pemContents.substring(0, 20))
    throw new Error('Private key base64 decoding failed — key may be corrupted in env var')
  }

  const key = await crypto.subtle.importKey(
    'pkcs8',
    binaryDer,
    {
      name: 'RSASSA-PKCS1-v1_5',
      hash: 'SHA-256',
    },
    false,
    ['sign']
  )

  // Sign JWT
  const encoder = new TextEncoder()
  const signatureInput = `${jwtHeader}.${jwtPayload}`
  const signature = await crypto.subtle.sign(
    'RSASSA-PKCS1-v1_5',
    key,
    encoder.encode(signatureInput)
  )

  const signatureEncoded = base64UrlEncode(
    String.fromCharCode(...new Uint8Array(signature))
  )

  const jwt = `${signatureInput}.${signatureEncoded}`

  // Exchange JWT for access token
  const tokenResponse = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion: jwt,
    }),
  })

  const tokenText = await tokenResponse.text()
  console.log('[Create Sheet] Token response status:', tokenResponse.status)
  console.log('[Create Sheet] Token response body:', tokenText)

  let tokenData
  try {
    tokenData = JSON.parse(tokenText)
  } catch {
    throw new Error(`Token endpoint returned non-JSON: ${tokenText.substring(0, 200)}`)
  }

  if (!tokenResponse.ok) {
    throw new Error(`Failed to get access token (${tokenResponse.status}): ${tokenData.error_description || tokenData.error || tokenText}`)
  }

  return tokenData.access_token
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const { clientId, clientName, ownerEmail } = await req.json() as {
      clientId: string
      clientName: string
      ownerEmail?: string
    }

    if (!clientId || !clientName) {
      return new Response(
        JSON.stringify({ error: 'Client ID and name are required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Get access token
    console.log('[Create Sheet] Generating access token...')
    const serviceAccountJson = Deno.env.get('GOOGLE_SERVICE_ACCOUNT_JSON')!
    const serviceAccount = JSON.parse(serviceAccountJson)
    const serviceAccountEmail = serviceAccount.client_email
    console.log('[Create Sheet] Using service account:', serviceAccountEmail)

    const workspaceUserEmail = Deno.env.get('GOOGLE_WORKSPACE_USER_EMAIL')
    if (workspaceUserEmail) {
      console.log('[Domain-Wide Delegation] 🔄 Impersonating user:', workspaceUserEmail)
    }

    const accessToken = await getGoogleAccessToken()
    console.log('[Create Sheet] Access token obtained, length:', accessToken.length)
    console.log('[Create Sheet] ✅ Successfully authenticated using domain-wide delegation')

    // Get template spreadsheet ID from environment
    const templateId = Deno.env.get('GOOGLE_SHEET_TEMPLATE_ID')
    if (!templateId) {
      throw new Error('GOOGLE_SHEET_TEMPLATE_ID not configured. Please create a template spreadsheet and add its ID to Supabase secrets.')
    }

    // Copy the template spreadsheet
    // Copies are created in the impersonated user's Drive (via domain-wide delegation)
    // This avoids storage quota issues with service accounts
    const sheetTitle = `Podcast Leads - ${clientName}`
    console.log('[Create Sheet] Copying template to create:', sheetTitle)
    console.log('[Create Sheet] Template ID:', templateId)

    const copyResponse = await fetch(`https://www.googleapis.com/drive/v3/files/${templateId}/copy`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        name: sheetTitle,
      }),
    })

    if (!copyResponse.ok) {
      const errorText = await copyResponse.text()
      console.error('[Create Sheet] Failed to copy template:', errorText)
      console.error('[Create Sheet] Status:', copyResponse.status)
      throw new Error(`Google Drive API error (${copyResponse.status}): ${errorText}`)
    }

    const copiedFile = await copyResponse.json()
    const spreadsheetId = copiedFile.id
    const spreadsheetUrl = `https://docs.google.com/spreadsheets/d/${spreadsheetId}/edit`

    console.log('[Create Sheet] ✅ Sheet created successfully!')
    console.log('[Create Sheet] Spreadsheet ID:', spreadsheetId)
    console.log('[Create Sheet] Spreadsheet URL:', spreadsheetUrl)
    console.log('[Create Sheet] 🎉 Sheet was created in:', workspaceUserEmail, '\'s Google Drive')
    console.log('[Create Sheet] 💾 No service account storage quota used!')
    console.log('[Create Sheet] 🚀 Domain-wide delegation working perfectly!')

    // Transfer ownership to the user's email to avoid service account storage quota
    if (ownerEmail) {
      console.log('[Create Sheet] Transferring ownership to:', ownerEmail)
      const ownershipResponse = await fetch(
        `https://www.googleapis.com/drive/v3/files/${spreadsheetId}/permissions`,
        {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${accessToken}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            type: 'user',
            role: 'owner',
            emailAddress: ownerEmail,
            transferOwnership: true,
          }),
        }
      )

      if (!ownershipResponse.ok) {
        const errorText = await ownershipResponse.text()
        console.error('[Create Sheet] Failed to transfer ownership:', errorText)
        // Continue anyway - sheet is still created
      } else {
        console.log('[Create Sheet] Ownership transferred successfully')
      }
    }

    // Make the sheet publicly editable by anyone with the link
    const publicPermissionResponse = await fetch(
      `https://www.googleapis.com/drive/v3/files/${spreadsheetId}/permissions`,
      {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          type: 'anyone',
          role: 'writer',
        }),
      }
    )

    if (!publicPermissionResponse.ok) {
      const errorText = await publicPermissionResponse.text()
      console.error('[Create Sheet] Failed to make public:', errorText)
      // Continue anyway - this is optional
    } else {
      console.log('[Create Sheet] Made sheet publicly editable via link')
    }

    // Share the sheet with the service account (so it can write to it)
    const shareResponse = await fetch(
      `https://www.googleapis.com/drive/v3/files/${spreadsheetId}/permissions`,
      {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          type: 'user',
          role: 'writer',
          emailAddress: serviceAccountEmail,
        }),
      }
    )

    if (!shareResponse.ok) {
      const errorText = await shareResponse.text()
      console.error('[Create Sheet] Failed to share:', errorText)
      // Continue anyway - user can manually share if needed
    }

    console.log('[Create Sheet] Shared with service account')

    // Update client record with the sheet URL
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const supabase = createClient(supabaseUrl, supabaseServiceKey)

    const { error: updateError } = await supabase
      .from('clients')
      .update({ google_sheet_url: spreadsheetUrl })
      .eq('id', clientId)

    if (updateError) {
      console.error('[Create Sheet] Failed to update client:', updateError)
      // Return success anyway - they can manually add the URL
    }

    console.log('[Create Sheet] Updated client record')

    return new Response(
      JSON.stringify({
        success: true,
        spreadsheetUrl,
        spreadsheetId,
        message: `Created sheet: ${sheetTitle}`,
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  } catch (error) {
    console.error('[Create Sheet] Error:', error)
    const errorMessage = error instanceof Error ? error.message : 'Internal server error'
    const errorStack = error instanceof Error ? error.stack : undefined

    console.error('[Create Sheet] Error message:', errorMessage)
    console.error('[Create Sheet] Error stack:', errorStack)

    return new Response(
      JSON.stringify({
        success: false,
        error: errorMessage,
        details: errorStack,
      }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})
