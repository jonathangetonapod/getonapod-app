import { z } from 'zod';
import Anthropic from '@anthropic-ai/sdk';
import { supabase } from '../services/supabase.js';
import { generateProspectEmbedding, createProspectText } from '../services/openai.js';
import { config } from '../config.js';

const anthropic = new Anthropic({ apiKey: config.anthropic.apiKey });

// Input validation schema
const MatchPodcastsInputSchema = z.object({
  prospect_name: z.string().min(1, 'Prospect name is required'),
  prospect_bio: z.string().optional(),
  match_threshold: z.number().min(0).max(1).optional().default(0.2),
  match_count: z.number().min(1).max(100).optional().default(50),
  prospect_id: z.string().uuid().optional(),
  export_to_sheet: z.boolean().optional().default(false),
  use_ai_filter: z.boolean().optional().default(true) // Enable AI quality filtering by default
});

type MatchPodcastsInput = z.infer<typeof MatchPodcastsInputSchema>;

interface PodcastMatch {
  id: string;
  podscan_id: string;
  podcast_name: string;
  podcast_description: string | null;
  podcast_categories: any;
  audience_size: number | null;
  similarity: number;
  relevance_score?: number; // 0-10 AI-evaluated relevance
  relevance_reason?: string; // Why this podcast is relevant
}

interface MatchPodcastsResponse {
  success: boolean;
  data?: {
    prospect_text: string;
    matches: PodcastMatch[];
    total_matches: number;
    threshold_used: number;
    exported_to_sheet?: boolean;
    sheet_url?: string;
  };
  error?: string;
}

/**
 * Use AI to filter and evaluate podcast relevance
 * Returns only truly relevant podcasts with explanations
 */
async function filterPodcastsWithAI(
  prospectText: string,
  matches: PodcastMatch[]
): Promise<PodcastMatch[]> {
  if (matches.length === 0) return [];

  try {
    // Prepare podcast summaries for AI evaluation
    const podcastSummaries = matches.map((m, i) => ({
      index: i,
      name: m.podcast_name,
      description: m.podcast_description?.substring(0, 300) || 'No description',
      categories: Array.isArray(m.podcast_categories)
        ? m.podcast_categories.map((c: any) => c.category_name).join(', ')
        : 'Unknown'
    }));

    const prompt = `You are evaluating podcast recommendations for a prospect. Your job is to filter out irrelevant matches and explain why each relevant podcast is a good fit.

PROSPECT PROFILE:
${prospectText}

PODCAST CANDIDATES:
${podcastSummaries.map(p => `${p.index}. ${p.name}
   Categories: ${p.categories}
   Description: ${p.description}`).join('\n\n')}

For each podcast, evaluate its relevance (0-10 scale):
- 8-10: Highly relevant, excellent match for this prospect
- 6-7: Relevant, good potential fit
- 5: Moderately relevant, worth including
- 0-4: Not relevant, filter out

Respond with ONLY a JSON array of objects for podcasts scoring 5+ (no other text):
[
  {
    "index": 0,
    "relevance_score": 8,
    "reason": "Brief explanation of why this is relevant (1 sentence)"
  }
]

Be reasonably selective - include podcasts that are clearly relevant or moderately relevant to the prospect's profile. Exclude only those that are clearly unrelated or generic.`;

    const response = await anthropic.messages.create({
      model: 'claude-sonnet-4-5-20250929',
      max_tokens: 4096,
      temperature: 0.3,
      messages: [
        {
          role: 'user',
          content: `You are a podcast matching expert. ${prompt}\n\nRespond with ONLY the JSON array, no other text.`
        }
      ]
    });

    const content = response.content[0].type === 'text' ? response.content[0].text : '';
    if (!content) {
      console.error('No AI response content');
      return matches; // Fallback to original matches
    }

    // Strip markdown code blocks if present
    let jsonContent = content.trim();
    if (jsonContent.startsWith('```')) {
      // Remove ```json or ``` at start and ``` at end
      jsonContent = jsonContent.replace(/^```(?:json)?\n?/, '').replace(/\n?```$/, '');
    }

    // Parse AI response
    const parsed = JSON.parse(jsonContent);
    const evaluations = Array.isArray(parsed) ? parsed : (parsed.evaluations || parsed.podcasts || []);

    // Filter and enrich matches based on AI evaluation
    const filtered: PodcastMatch[] = [];
    for (const evaluation of evaluations) {
      const match = matches[evaluation.index];
      if (match && evaluation.relevance_score >= 5) {
        filtered.push({
          ...match,
          relevance_score: evaluation.relevance_score,
          relevance_reason: evaluation.reason
        });
      }
    }

    // Sort by relevance score (descending), then by similarity
    filtered.sort((a, b) => {
      const scoreA = a.relevance_score || 0;
      const scoreB = b.relevance_score || 0;
      if (scoreB !== scoreA) return scoreB - scoreA;
      return b.similarity - a.similarity;
    });

    return filtered;

  } catch (error) {
    console.error('AI filtering error:', error);
    return matches; // Fallback to original matches on error
  }
}

/**
 * Export podcast matches to the prospect's Google Sheet
 */
async function exportMatchesToSheet(
  prospectId: string,
  matches: PodcastMatch[]
): Promise<{ success: boolean; sheet_url?: string; error?: string }> {
  try {
    // Get the prospect's spreadsheet URL
    const { data: prospect, error: fetchError } = await supabase
      .from('prospect_dashboards')
      .select('spreadsheet_url')
      .eq('id', prospectId)
      .single();

    if (fetchError || !prospect) {
      return { success: false, error: 'Prospect not found or no spreadsheet linked' };
    }

    if (!prospect.spreadsheet_url) {
      return { success: false, error: 'No Google Sheet linked to this prospect' };
    }

    // Insert podcast links for this prospect
    const podcastLinks = matches.map(match => ({
      prospect_id: prospectId,
      podcast_id: match.id,
      similarity_score: match.similarity,
      matched_at: new Date().toISOString()
    }));

    const { error: insertError } = await supabase
      .from('prospect_podcast_links')
      .upsert(podcastLinks, {
        onConflict: 'prospect_id,podcast_id',
        ignoreDuplicates: false
      });

    if (insertError) {
      return { success: false, error: `Failed to export: ${insertError.message}` };
    }

    return {
      success: true,
      sheet_url: prospect.spreadsheet_url
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error during export'
    };
  }
}

/**
 * Match podcasts for a prospect using AI-powered semantic search
 */
export async function matchPodcastsForProspect(
  input: MatchPodcastsInput
): Promise<MatchPodcastsResponse> {
  try {
    // Validate input
    const validated = MatchPodcastsInputSchema.parse(input);

    // Create prospect text representation
    const prospectText = createProspectText(validated.prospect_name, validated.prospect_bio);

    if (!prospectText || prospectText.trim().length < 5) {
      return {
        success: false,
        error: 'Insufficient prospect information. Please provide at least a name.'
      };
    }

    // Generate embedding for prospect
    let embedding: number[];
    try {
      embedding = await generateProspectEmbedding(prospectText);
    } catch (error) {
      return {
        success: false,
        error: `Failed to generate embedding: ${error instanceof Error ? error.message : 'Unknown error'}`
      };
    }

    // Ensure we always return at least 15 results
    const MIN_RESULTS = 15;
    const requestedCount = Math.max(validated.match_count, MIN_RESULTS);

    // If AI filtering is enabled, request more candidates initially
    const initialCount = validated.use_ai_filter ? requestedCount * 4 : requestedCount;

    // Search for similar podcasts using the database function
    const { data: matches, error: searchError } = await supabase.rpc('search_similar_podcasts', {
      query_embedding: embedding,
      match_threshold: validated.match_threshold,
      match_count: initialCount
    });

    if (searchError) {
      return {
        success: false,
        error: `Database search failed: ${searchError.message}`
      };
    }

    let finalMatches = matches || [];

    // If we still got fewer than enough results, do a second search with lower threshold
    const targetForFallback = validated.use_ai_filter ? MIN_RESULTS * 4 : MIN_RESULTS * 2;
    if (finalMatches.length < targetForFallback) {
      const { data: additionalMatches, error: additionalError } = await supabase.rpc('search_similar_podcasts', {
        query_embedding: embedding,
        match_threshold: -1.0, // Negative threshold to guarantee getting enough results
        match_count: 100 // Get many candidates
      });

      if (!additionalError && additionalMatches) {
        // Use the additional matches, but deduplicate by ID
        const existingIds = new Set(finalMatches.map((m: PodcastMatch) => m.id));
        const uniqueAdditional = additionalMatches.filter((m: PodcastMatch) => !existingIds.has(m.id));

        // Combine matches
        finalMatches = [...finalMatches, ...uniqueAdditional];
      }
    }

    // Apply AI filtering if enabled (filters out irrelevant matches and adds explanations)
    if (validated.use_ai_filter && finalMatches.length > 0) {
      // Get extra candidates for AI filtering since it will reduce the count
      // Always get a large pool for AI to evaluate
      const { data: extraMatches } = await supabase.rpc('search_similar_podcasts', {
        query_embedding: embedding,
        match_threshold: -1.0, // Negative threshold ensures we get all podcasts
        match_count: 100 // Get many candidates for AI to filter
      });

      if (extraMatches) {
        const existingIds = new Set(finalMatches.map((m: PodcastMatch) => m.id));
        const uniqueExtra = extraMatches.filter((m: PodcastMatch) => !existingIds.has(m.id));
        finalMatches = [...finalMatches, ...uniqueExtra];
      }

      const aiFiltered = await filterPodcastsWithAI(prospectText, finalMatches);

      // Try to reach MIN_RESULTS, but prioritize quality over quantity
      const targetCount = Math.max(MIN_RESULTS, validated.match_count);

      if (aiFiltered.length < targetCount) {
        // Keep all AI-filtered results, fill remainder with highest similarity from original
        const aiFilteredIds = new Set(aiFiltered.map((m: PodcastMatch) => m.id));
        const remaining = finalMatches
          .filter((m: PodcastMatch) => !aiFilteredIds.has(m.id))
          .sort((a: PodcastMatch, b: PodcastMatch) => b.similarity - a.similarity)
          .slice(0, targetCount - aiFiltered.length);

        // Combine AI-verified + similarity-sorted matches
        // If we still can't reach targetCount, that's okay - quality over quantity
        finalMatches = [...aiFiltered, ...remaining];
      } else {
        finalMatches = aiFiltered.slice(0, targetCount);
      }
    } else {
      // No AI filtering, just limit to requested count
      finalMatches = finalMatches.slice(0, Math.max(MIN_RESULTS, validated.match_count));
    }

    if (finalMatches.length === 0) {
      return {
        success: true,
        data: {
          prospect_text: prospectText,
          matches: [],
          total_matches: 0,
          threshold_used: validated.match_threshold
        }
      };
    }

    // Export to Google Sheet if requested
    let exportResult: { success: boolean; sheet_url?: string; error?: string } | undefined;
    if (validated.export_to_sheet && validated.prospect_id) {
      exportResult = await exportMatchesToSheet(validated.prospect_id, finalMatches);
    }

    return {
      success: true,
      data: {
        prospect_text: prospectText,
        matches: finalMatches,
        total_matches: finalMatches.length,
        threshold_used: validated.match_threshold,
        exported_to_sheet: exportResult?.success || false,
        sheet_url: exportResult?.sheet_url
      }
    };
  } catch (error) {
    // Catch validation errors and any other errors
    if (error instanceof z.ZodError) {
      return {
        success: false,
        error: `Validation error: ${error.errors.map(e => e.message).join(', ')}`
      };
    }

    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    };
  }
}
