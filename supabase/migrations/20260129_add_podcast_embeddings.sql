-- Enable pgvector extension for vector similarity search
CREATE EXTENSION IF NOT EXISTS vector;

-- Add embedding column to podcasts table
-- Using 1536 dimensions for OpenAI text-embedding-3-small
ALTER TABLE public.podcasts
ADD COLUMN IF NOT EXISTS embedding vector(1536);

-- Create index for fast vector similarity search
-- Using ivfflat index with cosine distance
CREATE INDEX IF NOT EXISTS podcasts_embedding_idx
ON public.podcasts
USING ivfflat (embedding vector_cosine_ops)
WITH (lists = 100);

-- Add metadata columns for embedding tracking
ALTER TABLE public.podcasts
ADD COLUMN IF NOT EXISTS embedding_generated_at TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS embedding_model TEXT DEFAULT 'text-embedding-3-small',
ADD COLUMN IF NOT EXISTS embedding_text_length INTEGER;

-- Create function to search similar podcasts by embedding
CREATE OR REPLACE FUNCTION search_similar_podcasts(
  query_embedding vector(1536),
  match_threshold float DEFAULT 0.5,
  match_count int DEFAULT 50
)
RETURNS TABLE (
  id uuid,
  podscan_id text,
  podcast_name text,
  podcast_description text,
  podcast_categories jsonb,
  audience_size integer,
  similarity float
)
LANGUAGE plpgsql
AS $$
BEGIN
  RETURN QUERY
  SELECT
    p.id,
    p.podscan_id,
    p.podcast_name,
    p.podcast_description,
    p.podcast_categories,
    p.audience_size,
    1 - (p.embedding <=> query_embedding) as similarity
  FROM public.podcasts p
  WHERE p.embedding IS NOT NULL
    AND 1 - (p.embedding <=> query_embedding) > match_threshold
  ORDER BY p.embedding <=> query_embedding
  LIMIT match_count;
END;
$$;

COMMENT ON COLUMN public.podcasts.embedding IS 'Vector embedding for semantic search (1536 dimensions from OpenAI text-embedding-3-small)';
COMMENT ON COLUMN public.podcasts.embedding_generated_at IS 'Timestamp when the embedding was generated';
COMMENT ON COLUMN public.podcasts.embedding_model IS 'Model used to generate the embedding';
COMMENT ON FUNCTION search_similar_podcasts IS 'Search for podcasts similar to a given embedding vector using cosine similarity';
