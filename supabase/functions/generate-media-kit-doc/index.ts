import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

/**
 * Generate Google Access Token from Service Account (with domain-wide delegation)
 */
async function getGoogleAccessToken(): Promise<string> {
  const serviceAccountJson = Deno.env.get('GOOGLE_SERVICE_ACCOUNT_JSON')
  if (!serviceAccountJson) {
    throw new Error('GOOGLE_SERVICE_ACCOUNT_JSON not configured')
  }

  const serviceAccount = JSON.parse(serviceAccountJson)
  const { client_email, private_key } = serviceAccount

  if (!client_email || !private_key) {
    throw new Error('Invalid service account credentials')
  }

  const now = Math.floor(Date.now() / 1000)
  const expiry = now + 3600

  const base64UrlEncode = (data: string) =>
    btoa(data)
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=/g, '')

  const jwtHeader = base64UrlEncode(JSON.stringify({ alg: 'RS256', typ: 'JWT' }))

  const userEmail = Deno.env.get('GOOGLE_WORKSPACE_USER_EMAIL')
  if (!userEmail) {
    throw new Error('GOOGLE_WORKSPACE_USER_EMAIL not configured')
  }

  const jwtPayload = base64UrlEncode(JSON.stringify({
    iss: client_email,
    scope: 'https://www.googleapis.com/auth/documents https://www.googleapis.com/auth/drive',
    aud: 'https://oauth2.googleapis.com/token',
    exp: expiry,
    iat: now,
    sub: userEmail,
  }))

  // Import private key
  const pemContents = private_key
    .replace('-----BEGIN PRIVATE KEY-----', '')
    .replace('-----END PRIVATE KEY-----', '')
    .replace(/\s/g, '')

  const binaryDer = Uint8Array.from(atob(pemContents), (c) => c.charCodeAt(0))

  const key = await crypto.subtle.importKey(
    'pkcs8',
    binaryDer,
    { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
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
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion: jwt,
    }),
  })

  const tokenData = await tokenResponse.json()

  if (!tokenResponse.ok) {
    throw new Error(`Failed to get access token: ${tokenData.error_description || tokenData.error}`)
  }

  return tokenData.access_token
}

/**
 * Generate media kit content using Claude AI
 */
async function generateMediaKitContent(prospect: {
  name: string
  bio: string
  title?: string
  company?: string
  industry?: string
  expertise?: string[]
  topics?: string[]
  targetAudience?: string
}): Promise<string> {
  const anthropicApiKey = Deno.env.get('ANTHROPIC_API_KEY')
  if (!anthropicApiKey) {
    throw new Error('ANTHROPIC_API_KEY not configured')
  }

  const expertiseList = prospect.expertise?.length ? prospect.expertise.join(', ') : 'Not specified'
  const topicsList = prospect.topics?.length ? prospect.topics.join(', ') : 'Not specified'

  const prompt = `You are creating a professional podcast guest media kit / one-pager for a prospective podcast guest. This will be formatted as a Google Doc.

PROSPECT DETAILS:
- Name: ${prospect.name}
- Title: ${prospect.title || 'Not specified'}
- Company: ${prospect.company || 'Not specified'}
- Industry: ${prospect.industry || 'Not specified'}
- Bio: ${prospect.bio}
- Areas of Expertise: ${expertiseList}
- Speaking Topics: ${topicsList}
- Target Audience: ${prospect.targetAudience || 'Not specified'}

Create a compelling, professional media kit with these sections. Return ONLY the content as structured text with clear section markers. Use this exact format:

TITLE: [Full Name] — Podcast Guest Media Kit

SECTION: About [First Name]
[2-3 paragraph professional bio written in third person. Make it compelling and highlight their unique value proposition, achievements, and credibility.]

SECTION: Key Credentials
[Bullet list of 5-7 impressive credentials, stats, or achievements extracted from their bio]

SECTION: Speaking Topics
[For each topic, provide a topic title and 1-2 sentence description of what they'd discuss. Create 4-6 topics based on their expertise.]

SECTION: Ideal Podcast Fit
[Describe the type of podcasts and audiences that would benefit most from having this person as a guest. 2-3 sentences.]

SECTION: Sample Interview Questions
[List 5-7 thought-provoking questions a podcast host could ask this guest]

SECTION: Contact
[Name]
[Title at Company]
Booking inquiries: Get On A Pod (getonapod.com)

RULES:
- Be specific and use real details from their bio
- Write in a professional but engaging tone
- Make them sound like a must-have guest
- Don't make up facts not in their bio — only extrapolate from given information
- Keep the total length to roughly 1-1.5 pages when formatted`

  const claudeResponse = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'x-api-key': anthropicApiKey,
      'anthropic-version': '2023-06-01',
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 2000,
      messages: [{ role: 'user', content: prompt }],
    }),
  })

  if (!claudeResponse.ok) {
    const error = await claudeResponse.text()
    throw new Error(`Claude API error: ${error}`)
  }

  const claudeData = await claudeResponse.json()
  let content = ''

  for (const block of claudeData.content) {
    if (block.type === 'text') {
      content = block.text.trim()
      break
    }
  }

  return content
}

/**
 * Create a Google Doc and populate it with formatted content
 */
async function createGoogleDoc(
  accessToken: string,
  title: string,
  content: string
): Promise<{ docId: string; docUrl: string }> {
  // Step 1: Create blank doc
  const createResponse = await fetch('https://docs.googleapis.com/v1/documents', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ title }),
  })

  if (!createResponse.ok) {
    const errorText = await createResponse.text()
    throw new Error(`Failed to create Google Doc: ${errorText}`)
  }

  const doc = await createResponse.json()
  const docId = doc.documentId
  const docUrl = `https://docs.google.com/document/d/${docId}/edit`

  console.log('[Generate Media Kit] Doc created:', docId)

  // Step 2: Parse content and build batch update requests
  const requests: any[] = []
  let insertIndex = 1 // Google Docs index starts at 1

  const lines = content.split('\n')
  let isFirstSection = true

  for (const line of lines) {
    const trimmed = line.trim()
    if (!trimmed) continue

    if (trimmed.startsWith('TITLE:')) {
      const titleText = trimmed.replace('TITLE:', '').trim() + '\n'
      requests.push({
        insertText: { location: { index: insertIndex }, text: titleText }
      })
      requests.push({
        updateParagraphStyle: {
          range: { startIndex: insertIndex, endIndex: insertIndex + titleText.length },
          paragraphStyle: { namedStyleType: 'HEADING_1' },
          fields: 'namedStyleType',
        }
      })
      insertIndex += titleText.length
      isFirstSection = true
    } else if (trimmed.startsWith('SECTION:')) {
      const sectionTitle = trimmed.replace('SECTION:', '').trim() + '\n'
      // Add spacing before sections (except first)
      if (!isFirstSection) {
        requests.push({
          insertText: { location: { index: insertIndex }, text: '\n' }
        })
        insertIndex += 1
      }
      isFirstSection = false

      requests.push({
        insertText: { location: { index: insertIndex }, text: sectionTitle }
      })
      requests.push({
        updateParagraphStyle: {
          range: { startIndex: insertIndex, endIndex: insertIndex + sectionTitle.length },
          paragraphStyle: { namedStyleType: 'HEADING_2' },
          fields: 'namedStyleType',
        }
      })
      insertIndex += sectionTitle.length
    } else {
      // Regular text or bullet
      const isBullet = trimmed.startsWith('- ') || trimmed.startsWith('• ') || /^\d+[\.\)]/.test(trimmed)
      let textContent: string

      if (isBullet) {
        textContent = trimmed.replace(/^[-•]\s*/, '').replace(/^\d+[\.\)]\s*/, '') + '\n'
      } else {
        textContent = trimmed + '\n'
      }

      requests.push({
        insertText: { location: { index: insertIndex }, text: textContent }
      })

      if (isBullet) {
        requests.push({
          createParagraphBullets: {
            range: { startIndex: insertIndex, endIndex: insertIndex + textContent.length },
            bulletPreset: 'BULLET_DISC_CIRCLE_SQUARE',
          }
        })
      } else {
        requests.push({
          updateParagraphStyle: {
            range: { startIndex: insertIndex, endIndex: insertIndex + textContent.length },
            paragraphStyle: { namedStyleType: 'NORMAL_TEXT' },
            fields: 'namedStyleType',
          }
        })
      }

      insertIndex += textContent.length
    }
  }

  // Step 3: Execute batch update
  if (requests.length > 0) {
    const updateResponse = await fetch(
      `https://docs.googleapis.com/v1/documents/${docId}:batchUpdate`,
      {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ requests }),
      }
    )

    if (!updateResponse.ok) {
      const errorText = await updateResponse.text()
      console.error('[Generate Media Kit] Batch update error:', errorText)
      // Doc is still created, just may not be fully formatted
    } else {
      console.log('[Generate Media Kit] Content inserted and formatted')
    }
  }

  return { docId, docUrl }
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const body = await req.json()
    const { dashboardId, prospectName, prospectBio, prospectTitle, prospectCompany, prospectIndustry, prospectExpertise, prospectTopics, prospectTargetAudience } = body

    if (!dashboardId || !prospectName || !prospectBio) {
      return new Response(
        JSON.stringify({ success: false, error: 'dashboardId, prospectName, and prospectBio are required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    console.log('[Generate Media Kit] Starting for:', prospectName)

    // Step 1: Generate content with Claude
    console.log('[Generate Media Kit] Generating content with Claude...')
    const content = await generateMediaKitContent({
      name: prospectName,
      bio: prospectBio,
      title: prospectTitle,
      company: prospectCompany,
      industry: prospectIndustry,
      expertise: prospectExpertise,
      topics: prospectTopics,
      targetAudience: prospectTargetAudience,
    })

    console.log('[Generate Media Kit] Content generated, length:', content.length)

    // Step 2: Get Google access token
    console.log('[Generate Media Kit] Authenticating with Google...')
    const accessToken = await getGoogleAccessToken()

    // Step 3: Create Google Doc with content
    const docTitle = `${prospectName} — Podcast Guest Media Kit`
    console.log('[Generate Media Kit] Creating Google Doc:', docTitle)

    const { docId, docUrl } = await createGoogleDoc(accessToken, docTitle, content)

    // Step 4: Make the doc publicly viewable
    const publicPermissionResponse = await fetch(
      `https://www.googleapis.com/drive/v3/files/${docId}/permissions`,
      {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          type: 'anyone',
          role: 'reader',
        }),
      }
    )

    if (!publicPermissionResponse.ok) {
      console.error('[Generate Media Kit] Failed to make public:', await publicPermissionResponse.text())
    } else {
      console.log('[Generate Media Kit] Doc made publicly viewable')
    }

    // Step 5: Save URL to database
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const supabase = createClient(supabaseUrl, supabaseServiceKey)

    const { error: updateError } = await supabase
      .from('prospect_dashboards')
      .update({ media_kit_url: docUrl })
      .eq('id', dashboardId)

    if (updateError) {
      console.error('[Generate Media Kit] Failed to save URL:', updateError)
    } else {
      console.log('[Generate Media Kit] Saved URL to database')
    }

    console.log('[Generate Media Kit] Done! URL:', docUrl)

    return new Response(
      JSON.stringify({ success: true, docUrl, docId }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  } catch (error) {
    console.error('[Generate Media Kit] Error:', error)
    const errorMessage = error instanceof Error ? error.message : 'Internal server error'
    return new Response(
      JSON.stringify({ success: false, error: errorMessage }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})
