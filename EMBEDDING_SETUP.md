# 🎯 Podcast Embeddings Setup Guide

## What This Does
Generates vector embeddings for all 2,431 podcasts in your database, enabling semantic search to match prospects with relevant podcasts.

## Prerequisites
- OpenAI API key (get one at https://platform.openai.com/api-keys)
- Supabase project with access to run migrations

## Step 1: Run Database Migration

This adds the vector column and search function to your database.

```bash
# Apply the migration to Supabase
# Option A: Via Supabase Dashboard
# Go to SQL Editor → New Query → Paste contents of:
# supabase/migrations/20260129_add_podcast_embeddings.sql

# Option B: Via Supabase CLI (if installed)
supabase db push
```

## Step 2: Install OpenAI Package

```bash
npm install openai
```

## Step 3: Set Your OpenAI API Key

```bash
export OPENAI_API_KEY="sk-proj-your-key-here"
```

## Step 4: Generate Embeddings

```bash
npx tsx scripts/generate-podcast-embeddings.ts
```

This will:
- ✅ Process all 2,431 podcasts
- ✅ Generate embeddings using OpenAI's text-embedding-3-small model
- ✅ Store embeddings in the database
- ✅ Take ~40-50 minutes to complete
- ✅ Cost approximately $0.06

## What Gets Embedded

For each podcast, we create a text representation including:
- Podcast name
- Description (truncated to 500 chars)
- Categories
- Host name
- Publisher name
- Language & region

## After Embeddings Are Generated

You can now search for similar podcasts:

```sql
-- Example: Search using a prospect's embedding
SELECT * FROM search_similar_podcasts(
  query_embedding := '[0.1, 0.2, ...]'::vector,
  match_threshold := 0.5,
  match_count := 50
);
```

## Next Steps

1. Create a prospect embedding generation function
2. Build a matching API endpoint
3. Integrate into your prospect workflow
4. Display ranked podcast recommendations

## Cost Breakdown

- **Model:** text-embedding-3-small
- **Cost:** $0.020 per 1M tokens
- **Avg tokens per podcast:** ~200 tokens
- **Total tokens:** 2,431 × 200 = 486,200 tokens
- **Total cost:** ~$0.01 (less than 1 cent!)

## Troubleshooting

**Rate limits:** Script includes automatic delays and retry logic

**Missing embeddings:** Re-run the script - it only processes podcasts without embeddings

**Update embeddings:** Delete existing embeddings and re-run:
```sql
UPDATE podcasts SET embedding = NULL WHERE embedding IS NOT NULL;
```
