import { PODCAST_CATEGORIES } from '@/lib/categories';

const ANTHROPIC_API_KEY = import.meta.env.VITE_ANTHROPIC_API_KEY;

export interface AutoCategorizeInput {
  podcastName: string;
  description?: string;
  whyThisShow?: string;
}

/**
 * Use Claude AI to automatically suggest the best category for a podcast
 * from our predefined list of categories
 */
export async function autoCategorizePodcast(input: AutoCategorizeInput): Promise<string> {
  if (!ANTHROPIC_API_KEY) {
    console.warn('Anthropic API key not found, returning default category');
    return 'Business'; // Default fallback
  }

  try {
    const prompt = `You are a podcast categorization expert. Based on the information below, select the SINGLE BEST category from this list:

${PODCAST_CATEGORIES.map((cat, i) => `${i + 1}. ${cat}`).join('\n')}

Podcast Information:
- Name: ${input.podcastName}
${input.description ? `- Description: ${input.description}` : ''}
${input.whyThisShow ? `- Why This Show: ${input.whyThisShow}` : ''}

IMPORTANT: Reply with ONLY the category name from the list above. Nothing else. Just the exact category name.`;

    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 50,
        messages: [
          {
            role: 'user',
            content: prompt,
          },
        ],
      }),
    });

    if (!response.ok) {
      throw new Error(`API request failed: ${response.statusText}`);
    }

    const data = await response.json();
    const suggestedCategory = data.content[0].text.trim();

    // Validate that the suggestion is in our list
    if (PODCAST_CATEGORIES.includes(suggestedCategory as any)) {
      return suggestedCategory;
    }

    // If AI returns something not in our list, try fuzzy matching
    const lowerSuggestion = suggestedCategory.toLowerCase();
    const match = PODCAST_CATEGORIES.find(
      (cat) => cat.toLowerCase() === lowerSuggestion || lowerSuggestion.includes(cat.toLowerCase())
    );

    return match || 'Business'; // Default to Business if no match
  } catch (error) {
    console.error('Auto-categorization failed:', error);
    return 'Business'; // Fallback to Business
  }
}
