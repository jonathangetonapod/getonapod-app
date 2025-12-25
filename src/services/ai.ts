import Anthropic from '@anthropic-ai/sdk';

const anthropic = new Anthropic({
  apiKey: import.meta.env.VITE_ANTHROPIC_API_KEY,
  dangerouslyAllowBrowser: true, // Required for client-side usage
});

interface PodcastSummaryInput {
  podcast_name: string;
  audience_size: string;
  episode_count: string;
  rating: string;
  reach_score: string;
  description?: string;
  categories?: string[];
  publisher_name?: string;
}

/**
 * Generate an AI-powered "Why This Show" summary using Claude
 */
export async function generatePodcastSummary(input: PodcastSummaryInput): Promise<string> {
  try {
    console.log('🤖 Generating AI summary for:', input.podcast_name);

    const prompt = `You are a podcast booking agency expert. Write a compelling 2-3 sentence description explaining why guests should appear on this podcast and who it's ideal for.

Podcast Details:
- Name: ${input.podcast_name}
- Audience Size: ${input.audience_size}
- Episodes: ${input.episode_count}
- Rating: ${input.rating}
- Reach Score: ${input.reach_score}
${input.publisher_name ? `- Host: ${input.publisher_name}` : ''}
${input.categories?.length ? `- Categories: ${input.categories.join(', ')}` : ''}
${input.description ? `- Description: ${input.description}` : ''}

Guidelines:
- Focus on the quality and type of audience (who listens and why they matter)
- Explain the credibility and authority of the host/show
- Describe who this opportunity is ideal for (thought leaders, entrepreneurs, etc)
- DO NOT include specific numbers or metrics in your response
- DO NOT use em dashes (—)
- DO NOT include any title, heading, or hashtag (like "# Prebuilt Shopify Store Podcast")
- Start directly with the description text
- Write in a professional, persuasive tone about the strategic value
- Keep it 2-3 sentences maximum`;

    const message = await anthropic.messages.create({
      model: 'claude-sonnet-4-5-20250929',
      max_tokens: 200,
      messages: [
        {
          role: 'user',
          content: prompt,
        },
      ],
    });

    const summary = message.content[0].type === 'text' ? message.content[0].text : '';
    console.log('✅ AI summary generated:', summary);

    return summary.trim();
  } catch (error) {
    console.error('❌ Failed to generate AI summary:', error);
    // Fallback to template-based summary
    return `Ideal positioning for thought leaders. ${input.audience_size} audience with strong conversion rates. High engagement with ${input.rating} rating. Great opportunity for brand visibility and inbound lead generation.`;
  }
}

/**
 * Generate AI-powered features list based on podcast tier
 */
export async function generatePodcastFeatures(audienceSize: number): Promise<string[]> {
  // For now, return tier-based defaults
  // Can be enhanced with AI generation if needed
  if (audienceSize >= 100000) {
    return [
      'Premium audience targeting',
      'Full video + audio production',
      'Multi-platform distribution',
      'LinkedIn article feature',
      '3-month promotion package',
    ];
  } else if (audienceSize >= 50000) {
    return [
      'Extended 60-min episode',
      'YouTube video version',
      'Newsletter feature',
      'Audiogram clips package',
      'Social amplification',
    ];
  } else if (audienceSize >= 20000) {
    return [
      'Pre-interview strategy call',
      'Professional audio editing',
      'Show notes included',
      'Social media promotion',
      'Guaranteed publishing timeline',
    ];
  } else {
    return [
      'Pre-interview strategy call',
      'Professional audio editing',
      'Show notes included',
      'Social media promotion',
    ];
  }
}
