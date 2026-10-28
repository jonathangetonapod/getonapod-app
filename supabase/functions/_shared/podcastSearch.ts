import { providerFetch } from './providerErrors.ts'

const EMBEDDING_MODEL = 'text-embedding-3-small'
const EMBEDDING_DIMENSIONS = 1_536

export interface PodcastSearchEmbedding {
  embedding: number[]
  tokens: number
  usedByoKey: boolean
}

/** Semantic search is switched on for the platform (PODCAST_SEMANTIC_SEARCH_ENABLED). */
export function isSemanticSearchEnabled(): boolean {
  return Deno.env.get('PODCAST_SEMANTIC_SEARCH_ENABLED')?.trim().toLowerCase() === 'true'
}

export async function generatePodcastSearchEmbedding(
  search: string | null,
  apiKeyOverride?: { apiKey: string; source: 'workspace' | 'platform' } | null,
): Promise<PodcastSearchEmbedding | null> {
  if (!search || search.length < 3) return null
  if (!isSemanticSearchEnabled()) return null
  const apiKey = apiKeyOverride?.apiKey ?? Deno.env.get('OPENAI_API_KEY')?.trim()
  if (!apiKey) return null

  try {
    const response = await providerFetch('openai', 'https://api.openai.com/v1/embeddings', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: EMBEDDING_MODEL,
        input: search,
        dimensions: EMBEDDING_DIMENSIONS,
      }),
      signal: AbortSignal.timeout(10_000),
    })
    const payload = await response.json()
    const embedding = payload?.data?.[0]?.embedding
    if (!Array.isArray(embedding) || embedding.length !== EMBEDDING_DIMENSIONS) return null
    return {
      embedding,
      tokens: Number(payload?.usage?.total_tokens) || 0,
      usedByoKey: apiKeyOverride?.source === 'workspace',
    }
  } catch (error) {
    console.warn(
      '[PodcastSearch] Embedding provider was unavailable',
      error instanceof Error ? error.name : 'UnknownError',
    )
    return null
  }
}

/*
 * Search embeddings, remembered.
 *
 * The model and size are fixed, so a search text always has the same
 * embedding. Kept in podcast_search_embeddings keyed by the normalised text,
 * a repeat search skips the OpenAI round trip (and its cost and rate-limit
 * slot) entirely. Lower-cased and space-collapsed, so "Real  Estate" and
 * "real estate" share one entry.
 */

// deno-lint-ignore no-explicit-any
type AdminClient = { from: (table: string) => any }

export function normalizedSearchText(search: string): string {
  return search.toLowerCase().replace(/\s+/gu, ' ').trim()
}

async function searchEmbeddingKey(normalizedText: string): Promise<string> {
  const digest = await crypto.subtle.digest(
    'SHA-256',
    new TextEncoder().encode(`${EMBEDDING_MODEL}|${EMBEDDING_DIMENSIONS}|${normalizedText}`),
  )
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('')
}

function parseVector(value: unknown): number[] | null {
  const parsed = typeof value === 'string' ? (() => {
    try {
      return JSON.parse(value)
    } catch {
      return null
    }
  })() : value
  return Array.isArray(parsed) && parsed.length === EMBEDDING_DIMENSIONS && parsed.every((item) => typeof item === 'number')
    ? parsed as number[]
    : null
}

/** The remembered embedding for this search text, or null. Never throws. */
export async function rememberedSearchEmbedding(admin: AdminClient, search: string): Promise<number[] | null> {
  try {
    const key = await searchEmbeddingKey(normalizedSearchText(search))
    const { data, error } = await admin
      .from('podcast_search_embeddings')
      .select('embedding')
      .eq('search_key', key)
      .maybeSingle()
    if (error || !data) return null
    const embedding = parseVector(data.embedding)
    if (embedding) {
      // Kept while it is used; the facets cron prunes entries idle for 30 days.
      await admin.from('podcast_search_embeddings').update({ last_used_at: new Date().toISOString() }).eq('search_key', key)
    }
    return embedding
  } catch {
    return null
  }
}

/** Keep an embedding for the next identical search. Never throws. */
export async function rememberSearchEmbedding(admin: AdminClient, search: string, embedding: number[]): Promise<void> {
  try {
    const normalizedText = normalizedSearchText(search)
    const key = await searchEmbeddingKey(normalizedText)
    await admin.from('podcast_search_embeddings').upsert({
      search_key: key,
      search_text: normalizedText.slice(0, 200),
      embedding: JSON.stringify(embedding),
      last_used_at: new Date().toISOString(),
    }, { onConflict: 'search_key' })
  } catch {
    // A search that could not be remembered is only slower next time.
  }
}
