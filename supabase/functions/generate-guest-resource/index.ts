import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import Anthropic from 'https://esm.sh/@anthropic-ai/sdk@0.71.2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const { topic, category, resourceType = 'guide' } = await req.json()

    if (!topic) {
      throw new Error('Topic is required')
    }

    const anthropic = new Anthropic({
      apiKey: Deno.env.get('ANTHROPIC_API_KEY'),
    })

    // Get category-specific context
    const categoryContext = {
      preparation: 'helping podcast guests prepare for their interviews',
      technical_setup: 'technical setup and audio/video quality for podcast recordings',
      best_practices: 'best practices and tips for successful podcast appearances',
      promotion: 'promoting and maximizing the impact of podcast appearances',
      examples: 'real examples and case studies of successful podcast guesting',
      templates: 'templates, scripts, and frameworks for podcast guests',
    }[category] || 'podcast guesting success'

    const prompt = `You are an expert content creator for Get On A Pod, a premium podcast booking agency. Create a beautifully formatted, professional resource document about: "${topic}"

**Context:** This is a ${resourceType} focused on ${categoryContext}.

**Target Audience:** Business owners, entrepreneurs, and thought leaders who are podcast guests or want to become podcast guests.

**Document Requirements:**

1. **Professional Structure**
   - Start with a brief, engaging introduction (2-3 sentences)
   - Use clear section headings (H2) and subheadings (H3)
   - Keep paragraphs short and scannable (2-4 sentences max)

2. **Visual Formatting**
   - Use bullet points and numbered lists liberally
   - Bold key terms and important phrases
   - Use blockquotes for tips, pro-tips, or important callouts
   - Include clear action items where appropriate

3. **Content Style**
   - Be practical and actionable - readers should be able to implement immediately
   - Include specific examples and scripts where helpful
   - Use encouraging, professional tone
   - Write in second person ("you" language)

4. **HTML Structure**
   - Use semantic HTML: <h2>, <h3>, <p>, <ul>, <ol>, <li>, <strong>, <em>, <blockquote>
   - For tips/callouts, use: <blockquote><strong>Pro Tip:</strong> content here</blockquote>
   - For checklists, use: <ul> with checkbox emoji ✅ or bullet points

**Example Formatting Patterns:**

For a checklist:
<h3>Pre-Interview Checklist</h3>
<ul>
<li>✅ Test your microphone and audio levels</li>
<li>✅ Choose a quiet location with minimal echo</li>
</ul>

For a tip callout:
<blockquote>
<strong>💡 Pro Tip:</strong> Always send a thank-you email within 24 hours of recording.
</blockquote>

For key points:
<p><strong>The most important thing to remember:</strong> Be authentic and share real stories.</p>

**Content Length:** Create a comprehensive resource (800-1200 words) that provides real value.

Generate the beautifully formatted HTML content now:`

    const message = await anthropic.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 4000,
      temperature: 0.7,
      messages: [
        {
          role: 'user',
          content: prompt,
        },
      ],
    })

    // Clean up the generated content - convert special characters to ASCII equivalents
    let generatedContent = message.content[0].text
      // Convert smart quotes to regular quotes
      .replace(/[\u2018\u2019\u201A\u201B]/g, "'")  // Single quotes
      .replace(/[\u201C\u201D\u201E\u201F]/g, '"')  // Double quotes
      // Convert dashes to regular dashes
      .replace(/[\u2013\u2014\u2015]/g, '-')  // En dash, em dash, horizontal bar
      // Convert ellipsis
      .replace(/\u2026/g, '...')
      // Convert bullet points to standard
      .replace(/[\u2022\u2023\u2043]/g, '-')
      // Remove object replacement characters and other invisible chars
      .replace(/[\uFFFC\uFFFD\u200B\u200C\u200D\uFEFF\u00A0]/g, ' ')
      // Remove other problematic unicode but keep standard punctuation
      .replace(/[\u0080-\u009F]/g, '')
      // Clean up multiple spaces
      .replace(/  +/g, ' ')
      // Clean up empty list items
      .replace(/<li>\s*<\/li>/g, '')
      // Trim whitespace
      .trim()

    const wordCount = generatedContent.split(/\s+/).length

    return new Response(
      JSON.stringify({
        success: true,
        data: {
          content: generatedContent,
          wordCount: wordCount,
          readTimeMinutes: Math.ceil(wordCount / 200),
        },
      }),
      {
        headers: {
          ...corsHeaders,
          'Content-Type': 'application/json',
        },
      }
    )
  } catch (error) {
    console.error('Error generating guest resource:', error)

    return new Response(
      JSON.stringify({
        success: false,
        error: error.message || 'Failed to generate content',
      }),
      {
        status: 500,
        headers: {
          ...corsHeaders,
          'Content-Type': 'application/json',
        },
      }
    )
  }
})
