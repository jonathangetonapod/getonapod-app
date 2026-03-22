import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3'

const corsHeaders = {
  'Access-Control-Allow-Origin': Deno.env.get('ALLOWED_ORIGIN') || 'https://getonapod.com',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const GOAP_LOGO_URL = 'https://getonapod.com/logo.png'

// Brand colors
const COLOR_DARK = { red: 0.2, green: 0.2, blue: 0.2 }
const COLOR_GRAY = { red: 0.4, green: 0.4, blue: 0.4 }
const COLOR_LIGHT_GRAY = { red: 0.6, green: 0.6, blue: 0.6 }

/**
 * Generate Google Access Token from Service Account (with domain-wide delegation)
 */
async function getGoogleAccessToken(): Promise<string> {
  const serviceAccountJson = Deno.env.get('GOOGLE_SERVICE_ACCOUNT_JSON')
  if (!serviceAccountJson) throw new Error('GOOGLE_SERVICE_ACCOUNT_JSON not configured')

  const serviceAccount = JSON.parse(serviceAccountJson)
  const { client_email, private_key } = serviceAccount
  if (!client_email || !private_key) throw new Error('Invalid service account credentials')

  const now = Math.floor(Date.now() / 1000)
  const base64UrlEncode = (data: string) =>
    btoa(data).replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '')

  const jwtHeader = base64UrlEncode(JSON.stringify({ alg: 'RS256', typ: 'JWT' }))

  const userEmail = Deno.env.get('GOOGLE_WORKSPACE_USER_EMAIL')
  if (!userEmail) throw new Error('GOOGLE_WORKSPACE_USER_EMAIL not configured')

  const jwtPayload = base64UrlEncode(JSON.stringify({
    iss: client_email,
    scope: 'https://www.googleapis.com/auth/documents https://www.googleapis.com/auth/drive',
    aud: 'https://oauth2.googleapis.com/token',
    exp: now + 3600,
    iat: now,
    sub: userEmail,
  }))

  const pemContents = private_key
    .replace('-----BEGIN PRIVATE KEY-----', '')
    .replace('-----END PRIVATE KEY-----', '')
    .replace(/\s/g, '')

  const binaryDer = Uint8Array.from(atob(pemContents), (c) => c.charCodeAt(0))
  const key = await crypto.subtle.importKey(
    'pkcs8', binaryDer,
    { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
    false, ['sign']
  )

  const encoder = new TextEncoder()
  const signatureInput = `${jwtHeader}.${jwtPayload}`
  const signature = await crypto.subtle.sign('RSASSA-PKCS1-v1_5', key, encoder.encode(signatureInput))
  const signatureEncoded = base64UrlEncode(String.fromCharCode(...new Uint8Array(signature)))
  const jwt = `${signatureInput}.${signatureEncoded}`

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
 * Generate media kit content using Claude AI — returns structured JSON
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
}): Promise<{
  aboutBio: string
  credentials: string[]
  speakingTopics: { title: string; description: string }[]
}> {
  const anthropicApiKey = Deno.env.get('ANTHROPIC_API_KEY')
  if (!anthropicApiKey) throw new Error('ANTHROPIC_API_KEY not configured')

  const expertiseList = prospect.expertise?.length ? prospect.expertise.join(', ') : 'Not specified'
  const topicsList = prospect.topics?.length ? prospect.topics.join(', ') : 'Not specified'

  const prompt = `You are creating content for a professional podcast guest media kit.

PROSPECT DETAILS:
- Name: ${prospect.name}
- Title: ${prospect.title || 'Not specified'}
- Company: ${prospect.company || 'Not specified'}
- Industry: ${prospect.industry || 'Not specified'}
- Bio: ${prospect.bio}
- Areas of Expertise: ${expertiseList}
- Speaking Topics: ${topicsList}
- Target Audience: ${prospect.targetAudience || 'Not specified'}

Return a JSON object with exactly this structure (no markdown, no code fences, just raw JSON):

{
  "aboutBio": "2-3 paragraph professional bio in third person. Compelling, highlights achievements and credibility. Use line breaks between paragraphs.",
  "credentials": ["credential 1", "credential 2", "...5-7 impressive stats/achievements from their bio"],
  "speakingTopics": [
    {"title": "Topic Title", "description": "1-2 sentence description of what they'd discuss"},
    {"title": "Topic Title", "description": "1-2 sentence description"},
    ...4-6 topics
  ]
}

RULES:
- Be specific — use real details from their bio
- Make them sound like a must-have podcast guest
- Don't make up facts not in their bio
- Return ONLY valid JSON, nothing else`

  const claudeResponse = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'x-api-key': anthropicApiKey,
      'anthropic-version': '2023-06-01',
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 2500,
      messages: [{ role: 'user', content: prompt }],
    }),
  })

  if (!claudeResponse.ok) {
    const error = await claudeResponse.text()
    throw new Error(`Claude API error: ${error}`)
  }

  const claudeData = await claudeResponse.json()
  let rawText = ''
  for (const block of claudeData.content) {
    if (block.type === 'text') {
      rawText = block.text.trim()
      break
    }
  }

  // Strip markdown code fences if present
  rawText = rawText.replace(/^```json?\s*/i, '').replace(/\s*```$/i, '').trim()

  if (!rawText) throw new Error('Empty response from Claude')

  return JSON.parse(rawText)
}

// Helper: build requests to insert text with specific formatting
function insertStyledText(
  requests: any[],
  index: number,
  text: string,
  style: {
    fontSize?: number
    bold?: boolean
    color?: { red: number; green: number; blue: number }
    font?: string
    alignment?: string
  } = {}
): number {
  const textWithNewline = text.endsWith('\n') ? text : text + '\n'

  requests.push({
    insertText: { location: { index }, text: textWithNewline }
  })

  // Text style
  const textStyle: any = {}
  const fields: string[] = []

  if (style.fontSize) {
    textStyle.fontSize = { magnitude: style.fontSize, unit: 'PT' }
    fields.push('fontSize')
  }
  if (style.bold !== undefined) {
    textStyle.bold = style.bold
    fields.push('bold')
  }
  if (style.color) {
    textStyle.foregroundColor = { color: { rgbColor: style.color } }
    fields.push('foregroundColor')
  }
  if (style.font) {
    textStyle.weightedFontFamily = { fontFamily: style.font }
    fields.push('weightedFontFamily')
  }

  if (fields.length > 0) {
    requests.push({
      updateTextStyle: {
        range: { startIndex: index, endIndex: index + textWithNewline.length },
        textStyle,
        fields: fields.join(','),
      }
    })
  }

  // Paragraph alignment
  if (style.alignment) {
    requests.push({
      updateParagraphStyle: {
        range: { startIndex: index, endIndex: index + textWithNewline.length },
        paragraphStyle: { alignment: style.alignment },
        fields: 'alignment',
      }
    })
  }

  return index + textWithNewline.length
}

// Helper: insert a section heading
function insertSectionHeading(requests: any[], index: number, text: string): number {
  const headingText = text + '\n'
  requests.push({
    insertText: { location: { index }, text: headingText }
  })
  requests.push({
    updateParagraphStyle: {
      range: { startIndex: index, endIndex: index + headingText.length },
      paragraphStyle: { namedStyleType: 'HEADING_2' },
      fields: 'namedStyleType',
    }
  })
  // Style the heading text
  requests.push({
    updateTextStyle: {
      range: { startIndex: index, endIndex: index + headingText.length },
      textStyle: {
        fontSize: { magnitude: 14, unit: 'PT' },
        bold: true,
        foregroundColor: { color: { rgbColor: COLOR_DARK } },
        weightedFontFamily: { fontFamily: 'Arial' },
      },
      fields: 'fontSize,bold,foregroundColor,weightedFontFamily',
    }
  })
  return index + headingText.length
}

// Helper: insert a spacer line
function insertSpacer(requests: any[], index: number): number {
  const spacer = '\n'
  requests.push({
    insertText: { location: { index }, text: spacer }
  })
  requests.push({
    updateTextStyle: {
      range: { startIndex: index, endIndex: index + spacer.length },
      textStyle: { fontSize: { magnitude: 6, unit: 'PT' } },
      fields: 'fontSize',
    }
  })
  return index + spacer.length
}

// Helper: insert bullet items
function insertBullets(requests: any[], index: number, items: string[]): number {
  const startIndex = index
  let currentIndex = index

  for (const item of items) {
    const bulletText = item + '\n'
    requests.push({
      insertText: { location: { index: currentIndex }, text: bulletText }
    })
    requests.push({
      updateTextStyle: {
        range: { startIndex: currentIndex, endIndex: currentIndex + bulletText.length },
        textStyle: {
          fontSize: { magnitude: 10, unit: 'PT' },
          foregroundColor: { color: { rgbColor: COLOR_DARK } },
          weightedFontFamily: { fontFamily: 'Arial' },
        },
        fields: 'fontSize,foregroundColor,weightedFontFamily',
      }
    })
    currentIndex += bulletText.length
  }

  // Apply bullets to all items
  requests.push({
    createParagraphBullets: {
      range: { startIndex, endIndex: currentIndex },
      bulletPreset: 'BULLET_DISC_CIRCLE_SQUARE',
    }
  })

  return currentIndex
}

/**
 * Build the full media kit document with structured formatting
 */
async function createMediaKitDoc(
  accessToken: string,
  prospect: {
    name: string
    title?: string
    company?: string
    imageUrl?: string
    dashboardSlug?: string
  },
  content: {
    aboutBio: string
    credentials: string[]
    speakingTopics: { title: string; description: string }[]
  }
): Promise<{ docId: string; docUrl: string }> {
  // Create blank doc
  const docTitle = `${prospect.name} — Podcast Guest Media Kit | Get On A Pod`
  const createResponse = await fetch('https://docs.googleapis.com/v1/documents', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ title: docTitle }),
  })

  if (!createResponse.ok) {
    throw new Error(`Failed to create Google Doc: ${await createResponse.text()}`)
  }

  const doc = await createResponse.json()
  const docId = doc.documentId
  const docUrl = `https://docs.google.com/document/d/${docId}/edit`
  console.log('[Generate Media Kit] Doc created:', docId)

  const requests: any[] = []
  let idx = 1

  // ── Title ──
  idx = insertStyledText(requests, idx, 'PODCAST GUEST MEDIA KIT', {
    fontSize: 24, bold: true, color: COLOR_DARK, font: 'Arial', alignment: 'START',
  })

  // ── Spacer ──
  idx = insertSpacer(requests, idx)

  // ── Prospect Name ──
  idx = insertStyledText(requests, idx, prospect.name, {
    fontSize: 18, bold: true, color: COLOR_DARK, font: 'Arial',
  })

  // ── Title & Company ──
  const subtitle = [prospect.title, prospect.company].filter(Boolean).join(', ')
  if (subtitle) {
    idx = insertStyledText(requests, idx, subtitle, {
      fontSize: 12, color: COLOR_GRAY, font: 'Arial',
    })
  }

  idx = insertSpacer(requests, idx)

  // ══════════════════════════════════════
  // SECTION: About
  // ══════════════════════════════════════
  idx = insertSectionHeading(requests, idx, `About ${prospect.name.split(' ')[0]}`)

  // Split bio into paragraphs
  const bioParagraphs = content.aboutBio.split(/\n+/).filter(Boolean)
  for (const para of bioParagraphs) {
    idx = insertStyledText(requests, idx, para, {
      fontSize: 10, color: COLOR_DARK, font: 'Arial',
    })
  }

  idx = insertSpacer(requests, idx)

  // ══════════════════════════════════════
  // SECTION: Key Credentials
  // ══════════════════════════════════════
  idx = insertSectionHeading(requests, idx, 'Key Credentials')
  idx = insertBullets(requests, idx, content.credentials)

  idx = insertSpacer(requests, idx)

  // ══════════════════════════════════════
  // SECTION: Speaking Topics
  // ══════════════════════════════════════
  idx = insertSectionHeading(requests, idx, 'Speaking Topics')

  for (const topic of content.speakingTopics) {
    // Topic title (bold)
    const titleText = topic.title + '\n'
    requests.push({
      insertText: { location: { index: idx }, text: titleText }
    })
    requests.push({
      updateTextStyle: {
        range: { startIndex: idx, endIndex: idx + titleText.length },
        textStyle: {
          fontSize: { magnitude: 10, unit: 'PT' },
          bold: true,
          foregroundColor: { color: { rgbColor: COLOR_DARK } },
          weightedFontFamily: { fontFamily: 'Arial' },
        },
        fields: 'fontSize,bold,foregroundColor,weightedFontFamily',
      }
    })
    idx += titleText.length

    // Topic description
    idx = insertStyledText(requests, idx, topic.description, {
      fontSize: 10, color: COLOR_GRAY, font: 'Arial',
    })
  }

  idx = insertSpacer(requests, idx)

  // ══════════════════════════════════════
  // SECTION: Your Podcast Opportunities
  // ══════════════════════════════════════
  idx = insertSectionHeading(requests, idx, 'Your Podcast Opportunities')

  idx = insertStyledText(requests, idx, "We've curated 50+ podcasts that are a strong fit for your expertise. View your personalized podcast dashboard with AI-powered match analysis, audience demographics, and one-click approval:", {
    fontSize: 10, color: COLOR_DARK, font: 'Arial',
  })

  if (prospect.dashboardSlug) {
    const dashboardUrl = `https://getonapod.com/prospect/${prospect.dashboardSlug}`
    const linkText = `View Your Podcast Dashboard\n`
    requests.push({
      insertText: { location: { index: idx }, text: linkText }
    })
    requests.push({
      updateTextStyle: {
        range: { startIndex: idx, endIndex: idx + linkText.length },
        textStyle: {
          fontSize: { magnitude: 11, unit: 'PT' },
          bold: true,
          link: { url: dashboardUrl },
          weightedFontFamily: { fontFamily: 'Arial' },
        },
        fields: 'fontSize,bold,link,weightedFontFamily',
      }
    })
    idx += linkText.length
  }

  idx = insertSpacer(requests, idx)

  // ══════════════════════════════════════
  // SECTION: About Get On A Pod
  // ══════════════════════════════════════
  idx = insertSectionHeading(requests, idx, 'About Get On A Pod')

  idx = insertStyledText(requests, idx, 'Get On A Pod is a done-for-you podcast booking agency that helps founders, executives, and thought leaders build authority through strategic podcast appearances — without pitching themselves.', {
    fontSize: 10, color: COLOR_DARK, font: 'Arial',
  })
  idx = insertStyledText(requests, idx, 'We handle the research, pitching, follow-ups, and scheduling. You just show up and share your expertise.', {
    fontSize: 10, color: COLOR_DARK, font: 'Arial',
  })

  idx = insertSpacer(requests, idx)

  // ══════════════════════════════════════
  // SECTION: How It Works
  // ══════════════════════════════════════
  idx = insertSectionHeading(requests, idx, 'How It Works')

  const steps = [
    { label: 'Step 1 — Discovery Call', desc: 'A quick 15-minute call to understand your goals, niche, and the type of audiences you want to reach.' },
    { label: 'Step 2 — Your Personalized Podcast Dashboard', desc: 'We build you a custom Podcast Command Center — a live dashboard with 50+ hand-picked shows tailored to your expertise. Each podcast includes AI-powered fit analysis explaining exactly why it\'s a match, audience demographics, listener ratings, and episode data. You review everything and approve each show before we ever reach out.' },
    { label: 'Step 3 — Personalized Outreach', desc: 'We craft custom pitches for each host, highlighting why you\'re the perfect guest. Every message is reviewed by you before it\'s sent. We handle all follow-ups until they commit.' },
    { label: 'Step 4 — You Show Up & Shine', desc: 'We coordinate scheduling, send you a guest prep kit with host research and talking points, and handle all logistics. You just show up and deliver value.' },
    { label: 'Step 5 — Your Authority Compounds', desc: 'Every appearance builds your credibility, attracts qualified leads, and positions you as the go-to expert in your space — month after month.' },
  ]

  for (const step of steps) {
    // Step label (bold)
    const labelText = step.label + '\n'
    requests.push({
      insertText: { location: { index: idx }, text: labelText }
    })
    requests.push({
      updateTextStyle: {
        range: { startIndex: idx, endIndex: idx + labelText.length },
        textStyle: {
          fontSize: { magnitude: 10, unit: 'PT' },
          bold: true,
          foregroundColor: { color: { rgbColor: COLOR_DARK } },
          weightedFontFamily: { fontFamily: 'Arial' },
        },
        fields: 'fontSize,bold,foregroundColor,weightedFontFamily',
      }
    })
    idx += labelText.length

    // Step description
    idx = insertStyledText(requests, idx, step.desc, {
      fontSize: 10, color: COLOR_GRAY, font: 'Arial',
    })
  }

  idx = insertSpacer(requests, idx)

  // ══════════════════════════════════════
  // SECTION: What Sets Us Apart
  // ══════════════════════════════════════
  idx = insertSectionHeading(requests, idx, 'What Sets Us Apart')

  const differentiators = [
    'Your Podcast Command Center — Most agencies send a monthly PDF. We give you a live, interactive dashboard where you see every podcast we\'ve curated, AI-generated fit analysis for each show, audience demographics, listener ratings, and real-time campaign progress.',
    'AI-Powered Matching — Our AI analyzes each podcast against your expertise, speaking topics, and target audience to explain exactly why it\'s a fit. No guesswork — data-driven recommendations.',
    'Full Approval Control — You review and approve every podcast and every outreach message before we send it. Your brand, your call. Nothing goes out without your sign-off.',
    'Results Guaranteed — 2+ podcast placements per month, guaranteed. If we fall short, we keep working at no additional cost until every placement is delivered.',
    'Completely Done-For-You — Research, curation, pitching, follow-ups, scheduling, guest prep kits. We handle everything. You just show up and share your expertise.',
  ]

  idx = insertBullets(requests, idx, differentiators)

  idx = insertSpacer(requests, idx)

  // ══════════════════════════════════════
  // SECTION: CTA
  // ══════════════════════════════════════
  idx = insertSectionHeading(requests, idx, 'Ready to Build Your Authority?')

  if (prospect.dashboardSlug) {
    const dashboardUrl = `https://getonapod.com/prospect/${prospect.dashboardSlug}`
    idx = insertStyledText(requests, idx, "We've already identified 50+ podcasts that are a perfect fit for your story. View your personalized dashboard and see exactly which shows we'd pitch you to:", {
      fontSize: 10, color: COLOR_DARK, font: 'Arial',
    })

    const ctaLinkText = `View Your Podcast Dashboard\n`
    requests.push({
      insertText: { location: { index: idx }, text: ctaLinkText }
    })
    requests.push({
      updateTextStyle: {
        range: { startIndex: idx, endIndex: idx + ctaLinkText.length },
        textStyle: {
          fontSize: { magnitude: 11, unit: 'PT' },
          bold: true,
          link: { url: dashboardUrl },
          weightedFontFamily: { fontFamily: 'Arial' },
        },
        fields: 'fontSize,bold,link,weightedFontFamily',
      }
    })
    idx += ctaLinkText.length
  }

  idx = insertStyledText(requests, idx, 'Questions? Reply to this email or book a 15-minute call at getonapod.com.', {
    fontSize: 10, color: COLOR_DARK, font: 'Arial',
  })

  idx = insertSpacer(requests, idx)

  // ── Footer ──
  idx = insertStyledText(requests, idx, 'Prepared by Get On A Pod  |  getonapod.com', {
    fontSize: 9, bold: true, color: COLOR_LIGHT_GRAY, font: 'Arial', alignment: 'CENTER',
  })
  idx = insertStyledText(requests, idx, 'Get Booked on Podcasts. Build Your Authority. Without Pitching Yourself.', {
    fontSize: 9, color: COLOR_LIGHT_GRAY, font: 'Arial', alignment: 'CENTER',
  })

  // ── Set default document style ──
  requests.push({
    updateDocumentStyle: {
      documentStyle: {
        marginTop: { magnitude: 50, unit: 'PT' },
        marginBottom: { magnitude: 50, unit: 'PT' },
        marginLeft: { magnitude: 60, unit: 'PT' },
        marginRight: { magnitude: 60, unit: 'PT' },
      },
      fields: 'marginTop,marginBottom,marginLeft,marginRight',
    }
  })

  // Execute batch update
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
  } else {
    console.log('[Generate Media Kit] Content inserted and formatted successfully')
  }

  // ── Insert images independently (each in its own batch so failures don't cascade) ──
  const insertImage = async (index: number, uri: string, width: number, height: number, label: string) => {
    try {
      const imgResponse = await fetch(
        `https://docs.googleapis.com/v1/documents/${docId}:batchUpdate`,
        {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${accessToken}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            requests: [
              {
                insertInlineImage: {
                  location: { index },
                  uri,
                  objectSize: {
                    height: { magnitude: height, unit: 'PT' },
                    width: { magnitude: width, unit: 'PT' },
                  }
                }
              },
              {
                insertText: { location: { index: index + 1 }, text: '\n' }
              }
            ]
          }),
        }
      )
      if (!imgResponse.ok) {
        const imgError = await imgResponse.text()
        console.error(`[Generate Media Kit] ${label} insertion failed:`, imgError)
        return false
      }
      console.log(`[Generate Media Kit] ${label} inserted successfully`)
      return true
    } catch (err) {
      console.error(`[Generate Media Kit] ${label} error:`, err)
      return false
    }
  }

  // Insert GOAP logo at the top (index 1)
  const logoInserted = await insertImage(1, GOAP_LOGO_URL, 120, 40, 'Logo')

  // Insert prospect photo after logo + title
  if (prospect.imageUrl) {
    // If logo was inserted, content shifted by 2 (image + newline)
    const offset = logoInserted ? 2 : 0
    const titleLen = 'PODCAST GUEST MEDIA KIT\n'.length
    const spacerLen = 1
    const photoIdx = 1 + offset + titleLen + spacerLen
    await insertImage(photoIdx, prospect.imageUrl, 100, 100, 'Prospect photo')
  }

  return { docId, docUrl }
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const body = await req.json()
    const {
      dashboardId, prospectName, prospectBio, prospectTitle, prospectCompany,
      prospectIndustry, prospectExpertise, prospectTopics, prospectTargetAudience,
      prospectImageUrl, dashboardSlug,
    } = body

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
    console.log('[Generate Media Kit] Content generated')

    // Step 2: Get Google access token
    console.log('[Generate Media Kit] Authenticating with Google...')
    const accessToken = await getGoogleAccessToken()

    // Step 3: Create formatted Google Doc
    console.log('[Generate Media Kit] Creating Google Doc...')
    const { docId, docUrl } = await createMediaKitDoc(accessToken, {
      name: prospectName,
      title: prospectTitle,
      company: prospectCompany,
      imageUrl: prospectImageUrl,
      dashboardSlug,
    }, content)

    // Step 4: Make the doc publicly viewable
    const permResponse = await fetch(
      `https://www.googleapis.com/drive/v3/files/${docId}/permissions`,
      {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ type: 'anyone', role: 'reader' }),
      }
    )
    if (!permResponse.ok) {
      console.error('[Generate Media Kit] Failed to make public:', await permResponse.text())
    }

    // Step 5: Save URL to database
    const supabase = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)
    const { error: updateError } = await supabase
      .from('prospect_dashboards')
      .update({ media_kit_url: docUrl })
      .eq('id', dashboardId)

    if (updateError) {
      console.error('[Generate Media Kit] Failed to save URL:', updateError)
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
