import { supabase } from '@/lib/supabase';

export interface AutoCategorizeInput {
  podcastName: string;
  description?: string;
  whyThisShow?: string;
}

/**
 * Use Claude AI to automatically suggest the best category for a podcast
 * from our predefined list of categories.
 * Calls the auto-categorize-podcast edge function (server-side).
 */
export async function autoCategorizePodcast(input: AutoCategorizeInput): Promise<string> {
  try {
    const { data, error } = await supabase.functions.invoke('auto-categorize-podcast', {
      body: {
        podcastName: input.podcastName,
        description: input.description,
        whyThisShow: input.whyThisShow,
      },
    });

    if (error) {
      console.error('Auto-categorization edge function error:', error);
      return 'Business';
    }

    if (data?.success && data?.category) {
      return data.category;
    }

    // Edge function returned an error payload with a fallback category
    if (data?.category) {
      return data.category;
    }

    return 'Business';
  } catch (error) {
    console.error('Auto-categorization failed:', error);
    return 'Business';
  }
}
