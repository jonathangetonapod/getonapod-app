import { supabase } from '@/lib/supabase'

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
 * Generate an AI-powered "Why This Show" summary using Claude via Edge Function
 * (server-side — no API key exposed in the browser)
 */
export async function generatePodcastSummary(input: PodcastSummaryInput): Promise<string> {
  try {
    const { data, error } = await supabase.functions.invoke('generate-podcast-summary', {
      body: {
        podcast_name: input.podcast_name,
        audience_size: input.audience_size,
        episode_count: input.episode_count,
        rating: input.rating,
        reach_score: input.reach_score,
        description: input.description,
        categories: input.categories,
        publisher_name: input.publisher_name,
      },
    })

    if (error) {
      throw new Error(error.message || 'Edge function invocation failed')
    }

    if (!data?.success || !data?.summary) {
      throw new Error(data?.error || 'No summary returned from edge function')
    }

    return data.summary.trim();
  } catch (error) {
    console.error('Failed to generate AI summary:', error);
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
