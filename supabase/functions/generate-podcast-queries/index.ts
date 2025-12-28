import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import Anthropic from 'npm:@anthropic-ai/sdk@0.32.1'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const { clientName, clientBio, clientEmail, oldQuery } = await req.json()

    if (!clientBio || clientBio.trim().length === 0) {
      return new Response(
        JSON.stringify({ error: 'Client bio is required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    const anthropic = new Anthropic({
      apiKey: Deno.env.get('ANTHROPIC_API_KEY') || '',
    })

    // If oldQuery is provided, regenerate a single query
    if (oldQuery) {
      const prompt = `You are an expert podcast researcher using Podscan.fm.

Your task: Generate a *new*, high-volume podcast search query (3–7 words) for Podscan.fm,
designed to return as many relevant podcasts as possible.

The query should be a phrase or combination of phrases likely to appear in the TITLE of a podcast.
- Stay broad, but always relevant to the client's domain
- Use single quotes 'like this' for exact phrases (e.g., 'leadership podcast')
- Use * wildcards within quoted phrases (e.g., 'leadership * podcast')
- Use Boolean operators (AND, OR, NOT) to combine multiple phrases
- Do NOT use double quotes - use single quotes only
- The new query must NOT be a duplicate of or too similar to: "${oldQuery}"
- Do not use the client's name or brand

Based on client data:
- Name: ${clientName}
- Bio: ${clientBio}

Return exactly one new query as JSON:
{"query": "your query here"}

CRITICAL: Your response must be ONLY valid JSON. No markdown, no code blocks, no explanations. Just the raw JSON object.`

      const message = await anthropic.messages.create({
        model: 'claude-opus-4-5-20251101',
        max_tokens: 100,
        temperature: 0.9,
        messages: [{ role: 'user', content: prompt }],
      })

      const content = message.content[0]
      if (content.type !== 'text') {
        throw new Error('Unexpected response type from Claude')
      }

      // Strip markdown code blocks if present
      let jsonText = content.text.trim()
      if (jsonText.startsWith('```')) {
        jsonText = jsonText.replace(/^```(?:json)?\n?/, '').replace(/\n?```$/, '').trim()
      }

      console.log('Regenerate - Raw response:', content.text)
      console.log('Regenerate - Cleaned JSON:', jsonText)

      let parsed
      try {
        parsed = JSON.parse(jsonText)
      } catch (parseError) {
        console.error('Regenerate - JSON parse error:', parseError)
        console.error('Regenerate - Failed text:', jsonText)
        throw new Error(`Failed to parse JSON: ${parseError.message}`)
      }
      return new Response(
        JSON.stringify({ query: parsed.query }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Generate 5 queries
    const prompt = `You are an expert podcast researcher using Podscan.fm.
Your goal: Generate 5 *broad, high-volume, but relevant* podcast search queries (each 3–7 words),
designed to return the most possible relevant podcasts in Podscan.fm—using advanced search syntax.

**Every query should be something likely to appear in the TITLE of a podcast, and should be
relevant to the client's domain.**

STRATEGIC MIX (IMPORTANT):
1. ONE precise query (client's exact niche + specific terms)
2. TWO broad synonym queries (use OR to combine 3-5 related terms)
3. ONE wildcard query (use * for variation: startup * podcast, business * stories)
4. ONE adjacent category query (related but slightly different audience)

ADVANCED SEARCH SYNTAX RULES:
- Use single quotes 'like this' for exact phrases (e.g., 'digital marketing', 'business leadership')
- Use * wildcards within quoted phrases for broader matching (e.g., 'startup * podcast', 'business * stories')
- Use Boolean operators (AND, OR, NOT) to combine multiple search terms
  Example: 'B2B marketing' OR 'SaaS marketing' OR 'growth hacking'
- At least 2 queries MUST use wildcards (*) within quoted phrases
- At least 2 queries MUST use OR operators to combine multiple phrases
- Combine synonyms, adjacent industries, and related terms to cast the widest net while staying on-topic
- IMPORTANT: Use ONLY single quotes ('), never double quotes (")

QUALITY GUIDELINES:
- Do **not** use the client's name, brand, or job title in queries
- **Avoid** generic one-word queries like just "business", "success", "leadership"
- If you must use broad terms, always pair them with a specific modifier (e.g., "business leadership", "organizational culture")
- No duplicate queries or near-duplicates
- Think laterally - if client is in SaaS, also search marketing/sales/tech podcasts
- Queries should find 100-300 podcasts each (broad is good!)

**Examples of excellent, high-coverage queries:**
- 'business leadership' OR 'executive coaching'
- 'startup * podcast' OR 'founder * stories'
- 'digital marketing' OR 'growth marketing' OR 'content strategy'
- 'sales * leaders' OR 'revenue growth'
- 'women in tech' OR 'technology innovation'

Based on the following client data:
- Name: ${clientName}
- Bio: ${clientBio}
${clientEmail ? `- Email: ${clientEmail}` : ''}

Return exactly 5 queries as a JSON object with this exact format:
{
  "queries": [
    "query 1 here",
    "query 2 here",
    "query 3 here",
    "query 4 here",
    "query 5 here"
  ]
}

CRITICAL: Your response must be ONLY valid JSON. No markdown, no code blocks, no explanations, no additional text. Just the raw JSON object starting with { and ending with }.`

    const message = await anthropic.messages.create({
      model: 'claude-opus-4-5-20251101',
      max_tokens: 500,
      temperature: 0.8,
      messages: [{ role: 'user', content: prompt }],
    })

    const content = message.content[0]
    if (content.type !== 'text') {
      throw new Error('Unexpected response type from Claude')
    }

    // Strip markdown code blocks if present
    let jsonText = content.text.trim()
    if (jsonText.startsWith('```')) {
      // Remove ```json or ``` at start and ``` at end
      jsonText = jsonText.replace(/^```(?:json)?\n?/, '').replace(/\n?```$/, '').trim()
    }

    // Fix: Claude doesn't escape quotes properly in the query strings
    // We need to manually fix the JSON by escaping quotes inside array values

    try {
      // First attempt: try parsing as-is
      const parsed = JSON.parse(jsonText)

      if (!parsed.queries || !Array.isArray(parsed.queries) || parsed.queries.length !== 5) {
        throw new Error('Invalid response format: expected 5 queries')
      }

      return new Response(
        JSON.stringify({ queries: parsed.queries }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    } catch (parseError) {
      console.log('First parse attempt failed, trying manual extraction...')
      console.log('Parse error:', parseError.message)

      // Second attempt: Extract array values by splitting on "," pattern
      // Match the array content between "queries": [ and ]
      const arrayMatch = jsonText.match(/"queries"\s*:\s*\[(.*)\]/s)

      if (arrayMatch) {
        const arrayContent = arrayMatch[1]
        console.log('Matched array content:', arrayContent)

        // Split by "," pattern (quote-comma-quote between array elements)
        const rawQueries = arrayContent.split('","')

        // Clean up: remove leading/trailing quotes and whitespace
        const queries = rawQueries.map(q =>
          q.trim().replace(/^"/, '').replace(/"$/, '')
        )

        console.log('Extracted queries via split:', queries)
        console.log('Query count:', queries.length)

        if (queries.length === 5) {
          return new Response(
            JSON.stringify({ queries }),
            { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          )
        } else {
          console.error('Expected 5 queries but got:', queries.length)
        }
      } else {
        console.error('Could not match array pattern in JSON text')
      }

      console.error('Manual extraction failed')
      console.error('Original text:', jsonText)
      return new Response(
        JSON.stringify({
          error: `Failed to parse JSON: ${parseError.message}`,
          raw_response: content.text,
          cleaned_text: jsonText
        }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }
  } catch (error) {
    console.error('Error:', error)
    return new Response(
      JSON.stringify({ error: error.message || 'Internal server error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})
