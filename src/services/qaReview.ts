import { supabase } from '@/lib/supabase'

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL
const MAX_PODCASTS_PER_QA = 50
const BATCH_SIZE = 5 // concurrent API calls per batch

export interface QAPodcastInput {
  podcast_id: string
  podcast_name: string
  podcast_description?: string | null
  publisher_name?: string | null
  podcast_categories?: Array<{ category_name: string }> | null
  audience_size?: number | null
  episode_count?: number | null
}

export interface QAResult {
  podcast_id: string
  bio_fit_score: number | null
  topic_relevance_score: number | null
  bio_fit_reasoning: string | null
  topic_reasoning: string | null
  pitch_angles: Array<{ title: string; description: string }>
  topic_signals: string[]
}

export type ScoreTier = 'green' | 'yellow' | 'red' | 'unavailable'

export function getScoreTier(score: number | null): ScoreTier {
  if (score === null) return 'unavailable'
  if (score >= 7) return 'green'
  if (score >= 5) return 'yellow'
  return 'red'
}

/**
 * Run QA review on selected podcasts in batches.
 * Calls the Edge Function in groups of BATCH_SIZE, reporting progress.
 */
export async function runQAReview(
  prospectBio: string,
  targetTopic: string,
  podcasts: QAPodcastInput[],
  onProgress?: (completed: number, total: number) => void,
): Promise<QAResult[]> {
  if (!prospectBio.trim()) {
    throw new Error('Prospect bio is required for QA review')
  }

  if (podcasts.length === 0) {
    return []
  }

  if (podcasts.length > MAX_PODCASTS_PER_QA) {
    throw new Error(`Maximum ${MAX_PODCASTS_PER_QA} podcasts per QA review. You selected ${podcasts.length}.`)
  }

  const { data: { session } } = await supabase.auth.getSession()
  if (!session) {
    throw new Error('You must be logged in to run QA review')
  }

  const results: QAResult[] = []
  let completed = 0

  // Process in sequential batches of BATCH_SIZE
  for (let i = 0; i < podcasts.length; i += BATCH_SIZE) {
    const batch = podcasts.slice(i, i + BATCH_SIZE)

    try {
      const response = await fetch(`${SUPABASE_URL}/functions/v1/qa-review-podcasts`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({
          prospect_bio: prospectBio,
          target_topic: targetTopic.trim() || null,
          podcasts: batch,
        }),
      })

      if (!response.ok) {
        const error = await response.json()
        throw new Error(error.error || 'QA review failed')
      }

      const data = await response.json()
      results.push(...data.results)
    } catch (error) {
      console.error('[QA Review] Batch error:', error)
      // Add null results for failed batch so UI can show "unavailable"
      batch.forEach(podcast => {
        results.push({
          podcast_id: podcast.podcast_id,
          bio_fit_score: null,
          topic_relevance_score: null,
          bio_fit_reasoning: null,
          topic_reasoning: null,
          pitch_angles: [],
          topic_signals: [],
        })
      })
    }

    completed += batch.length
    onProgress?.(completed, podcasts.length)

    // Small delay between batches
    if (i + BATCH_SIZE < podcasts.length) {
      await new Promise(resolve => setTimeout(resolve, 500))
    }
  }

  return results
}
