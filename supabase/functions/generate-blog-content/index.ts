import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import Anthropic from 'https://esm.sh/@anthropic-ai/sdk@0.71.2'

// CORS headers for browser requests
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
  // Handle CORS preflight request
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const { topic, category, keywords, tone = 'professional', wordCount = 1500 } = await req.json()

    // Validation
    if (!topic) {
      throw new Error('Topic is required')
    }

    // Initialize Anthropic client
    const anthropic = new Anthropic({
      apiKey: Deno.env.get('ANTHROPIC_API_KEY'),
    })

    // Construct prompt for blog post generation
    const prompt = `You are an expert content writer for Get On A Pod, a podcast booking agency that helps entrepreneurs and thought leaders get booked on top podcasts.

Write a comprehensive, SEO-optimized blog post about: "${topic}"

**Specifications:**
- Category: ${category || 'General'}
- Target Keywords: ${keywords || topic}
- Tone: ${tone}, authoritative, encouraging
- Target Word Count: ${wordCount}+ words
- Audience: Entrepreneurs, business leaders, content creators

**Content Structure:**
1. **Compelling Introduction** (150-200 words)
   - Hook the reader with a pain point or interesting stat
   - Explain why this topic matters
   - Preview what they'll learn

2. **Main Body** (3-5 sections with H2 headings)
   - Each section should be 300-400 words
   - Use H3 subheadings within sections for better scannability
   - Include actionable tips, examples, and best practices
   - Use bullet points and numbered lists where appropriate

3. **Conclusion** (150-200 words)
   - Summarize key takeaways
   - Include a call-to-action encouraging readers to explore Get On A Pod's services

**Content Requirements:**
- Write in HTML format using semantic tags: <h2>, <h3>, <p>, <ul>, <ol>, <li>, <strong>, <em>
- Make content scannable with clear headings and short paragraphs (2-3 sentences)
- Include specific examples and actionable advice
- Naturally incorporate keywords without over-optimization
- Mention "Get On A Pod" once in the context of podcast booking services
- End with a CTA: "Ready to get booked on top podcasts? <a href='/premium-placements'>Explore our Premium Podcast Placements</a>"

**Tone Guidelines:**
- Be encouraging and empowering
- Use "you" to speak directly to the reader
- Avoid jargon unless you explain it
- Be specific and actionable, not vague or theoretical

Generate the HTML content now:`

    // Call Claude API
    const message = await anthropic.messages.create({
      model: 'claude-sonnet-4-5-20250929',
      max_tokens: 8000,
      temperature: 0.7,
      messages: [
        {
          role: 'user',
          content: prompt,
        },
      ],
    })

    // Extract generated content
    const generatedContent = message.content[0].text

    // Generate meta description (extract first 150 chars of intro or create summary)
    const metaDescriptionPrompt = `Based on the following blog post, write a compelling meta description (150-160 characters) that includes the keyword "${keywords || topic}" and encourages clicks from search results:

${generatedContent.substring(0, 500)}...

Meta description:`

    const metaMessage = await anthropic.messages.create({
      model: 'claude-sonnet-4-5-20250929',
      max_tokens: 200,
      temperature: 0.7,
      messages: [
        {
          role: 'user',
          content: metaDescriptionPrompt,
        },
      ],
    })

    const metaDescription = metaMessage.content[0].text.trim()

    // Calculate estimated read time
    const wordCountEstimate = generatedContent.split(/\s+/).length
    const readTimeMinutes = Math.ceil(wordCountEstimate / 200)

    // Return structured response
    return new Response(
      JSON.stringify({
        success: true,
        data: {
          content: generatedContent,
          metaDescription: metaDescription,
          wordCount: wordCountEstimate,
          readTimeMinutes: readTimeMinutes,
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
    console.error('Error generating blog content:', error)

    return new Response(
      JSON.stringify({
        success: false,
        error: error.message || 'Failed to generate blog content',
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
