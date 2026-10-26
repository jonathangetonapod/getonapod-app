import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const edge = readFileSync('supabase/functions/workspace-podcast-catalog/index.ts', 'utf8')
const shortlistEdge = readFileSync('supabase/functions/workspace-client-shortlist/index.ts', 'utf8')
const searchHelper = readFileSync('supabase/functions/_shared/podcastSearch.ts', 'utf8')
const foundationMigration = readFileSync('supabase/migrations/20260725000600_workspace_podcast_catalog.sql', 'utf8')
const filterMigration = readFileSync('supabase/migrations/20260725000700_workspace_podcast_catalog_filters.sql', 'utf8')
const v3Migration = readFileSync('supabase/migrations/20261029000100_workspace_podcast_catalog_v3.sql', 'utf8')
const config = readFileSync('supabase/config.toml', 'utf8')
const service = readFileSync('src/services/workspacePodcastCatalog.ts', 'utf8')
const clientEditor = readFileSync('src/components/workspace/ClientShortlistEditor.tsx', 'utf8')
const layout = readFileSync('src/components/workspace/WorkspaceLayout.tsx', 'utf8')
const routes = readFileSync('src/App.tsx', 'utf8')

assert.match(edge, /requireAuthenticatedUser\(req\)/u)
assert.match(edge, /requireWorkspaceFeatureAccess\(context, workspaceId\)/u)
assert.match(edge, /rpc\('workspace_podcast_catalog_page_v3'/u)
assert.match(edge, /generatePodcastSearchEmbedding\(search[,)]/u)
assert.match(edge, /p_query_embedding: queryEmbedding/u)
assert.match(edge, /search_mode: search \? \(queryEmbedding \? 'hybrid' : 'keyword'\) : 'browse'/u)
assert.match(edge, /'none'/u)
assert.match(edge, /'last_90_days'/u)
assert.match(edge, /'250k_plus'/u)
assert.match(edge, /requireOnlyKeys\(body,/u)
assert.doesNotMatch(edge, /from\('podcasts'\)/u)

assert.match(foundationMigration, /CREATE OR REPLACE FUNCTION public\.workspace_podcast_catalog_page_v1/u)
assert.match(filterMigration, /CREATE OR REPLACE FUNCTION public\.workspace_podcast_catalog_page_v2/u)
assert.match(filterMigration, /SECURITY DEFINER/u)
assert.match(filterMigration, /podcast\.podscan_email[\s\S]+\^\[\^\[:space:\]@\]/u)
assert.match(filterMigration, /LEFT JOIN public\.podcast_direct_contacts/u)
assert.match(filterMigration, /verification_status = 'verified'/u)
assert.match(filterMigration, /public\.client_dashboard_podcasts/u)
assert.match(filterMigration, /public\.prospect_dashboard_podcasts/u)
assert.match(filterMigration, /podcast\.embedding <=> p_query_embedding/u)
assert.match(filterMigration, /semantic_candidates AS MATERIALIZED/u)
assert.match(filterMigration, /ORDER BY podcast\.embedding <=> p_query_embedding[\s\S]*?LIMIT 300/u)
assert.match(filterMigration, /podcast_categories::TEXT/u)
assert.match(filterMigration, /normalized_contact = 'none'/u)
assert.match(filterMigration, /normalized_activity = 'last_90_days'/u)
assert.match(filterMigration, /normalized_audience = '10k_50k'/u)
assert.match(
  filterMigration,
  /REVOKE ALL ON FUNCTION public\.workspace_podcast_catalog_page_v2\([\s\S]+FROM PUBLIC, anon, authenticated, service_role;/u,
)
assert.match(
  filterMigration,
  /GRANT EXECUTE ON FUNCTION public\.workspace_podcast_catalog_page_v2\([\s\S]+TO service_role;/u,
)
// v3 is what the Podcast Database calls. Still publishing needs a recent
// episode, not only the feed's active flag, and the page gets one catalogue-wide
// refresh date instead of deriving one from whichever rows are on screen.
assert.match(v3Migration, /CREATE OR REPLACE FUNCTION public\.workspace_podcast_catalog_page_v3/u)
assert.match(v3Migration, /SECURITY DEFINER/u)
assert.match(
  v3Migration,
  /normalized_activity = 'active'\s+AND is_active IS TRUE\s+AND last_posted_at >= NOW\(\) - INTERVAL '90 days'/u,
)
assert.match(v3Migration, /'catalog_refreshed_at', \(SELECT max\(podscan_last_fetched_at\) FROM catalog\)/u)
assert.match(v3Migration, /LEFT JOIN public\.podcast_direct_contacts/u)
assert.match(v3Migration, /ORDER BY podcast\.embedding <=> p_query_embedding[\s\S]*?LIMIT 300/u)
assert.match(
  v3Migration,
  /REVOKE ALL ON FUNCTION public\.workspace_podcast_catalog_page_v3\([\s\S]+FROM PUBLIC, anon, authenticated, service_role;/u,
)
assert.match(
  v3Migration,
  /GRANT EXECUTE ON FUNCTION public\.workspace_podcast_catalog_page_v3\([\s\S]+TO service_role;/u,
)
// Best fit is the default: reachable, mid-size, recently publishing.
assert.match(edge, /optionalChoice\(body\.sort, 'sort', SORT_OPTIONS, 'best_fit'\)/u)
assert.match(edge, /'250k_1m', '1m_plus'/u)
assert.match(v3Migration, /p_sort TEXT DEFAULT 'best_fit'/u)
assert.match(v3Migration, /WHEN audience_size >= 10000 AND audience_size < 250000 THEN 3/u)
assert.match(v3Migration, /CASE WHEN effective_sort = 'best_fit' THEN fit_score END DESC NULLS LAST/u)
assert.match(v3Migration, /normalized_audience = '1m_plus' AND audience_size >= 1000000/u)
// A search follows the chosen sort; Relevance is the sort that ranks by match.
assert.match(edge, /'best_fit', 'relevance', 'audience'/u)
assert.match(v3Migration, /WHEN normalized_sort = 'relevance' AND normalized_search IS NULL THEN 'best_fit'/u)
assert.match(v3Migration, /ORDER BY\s+CASE WHEN effective_sort = 'relevance' THEN search_rank END DESC NULLS LAST,/u)
assert.doesNotMatch(v3Migration, /ORDER BY\s+CASE WHEN normalized_search IS NOT NULL THEN search_rank END/u)
assert.match(service, /signal,\n  \}\)/u)
// Language and region filters, and Rating and Reach sorts.
assert.match(edge, /'rating', 'reach'/u)
assert.match(edge, /p_language: language,\s+p_region: region,/u)
assert.match(edge, /const LOCALE_CODE = /u)
assert.match(v3Migration, /p_language TEXT DEFAULT NULL,\s+p_region TEXT DEFAULT NULL,/u)
assert.match(v3Migration, /normalized_language IS NULL OR lower\(language\) = normalized_language/u)
assert.match(v3Migration, /'languages', COALESCE\(/u)
assert.match(v3Migration, /CASE WHEN effective_sort = 'reach' THEN podcast_reach_score END DESC NULLS LAST/u)
// "uk" is folded into the ISO "gb", or United Kingdom is offered twice.
assert.match(v3Migration, /WHEN lower\(btrim\(podcast\.region\)\) = 'uk' THEN 'gb'/u)
// A search matches every word in any order, not only the exact phrase, and
// Best fit ranks by reach inside doubling audience bands around 50K.
assert.match(v3Migration, /regexp_split_to_array\(lower\(btrim\(p_search\)\), '\\s\+'\)/u)
assert.match(v3Migration, /OR NOT EXISTS \(\s+SELECT 1\s+FROM unnest\(search_words\) search_word/u)
assert.doesNotMatch(v3Migration, /OR position\(normalized_search IN lower\(concat_ws\(/u)
assert.match(v3Migration, /round\(abs\(ln\(audience_size::NUMERIC \/ 50000\)\) \/ ln\(2\)\)/u)
assert.match(searchHelper, /model: EMBEDDING_MODEL/u)
assert.match(searchHelper, /dimensions: EMBEDDING_DIMENSIONS/u)
assert.match(shortlistEdge, /rpc\('workspace_podcast_catalog_page_v2'/u)
assert.match(shortlistEdge, /generatePodcastSearchEmbedding\(query[,)]/u)

assert.match(config, /\[functions\.workspace-podcast-catalog\]\s+verify_jwt = true/u)
assert.match(service, /functions\.invoke\('workspace-podcast-catalog'/u)
assert.match(service, /audience: params\.audience \|\| 'all'/u)
assert.match(service, /response\.workspace\.id !== canonicalWorkspaceId/u)
assert.match(clientEditor, /Browse database/u)
assert.match(layout, /id: 'podcast-database'[\s\S]+enabled: true/u)
assert.match(routes, /path="\/app\/podcast-database"/u)
assert.match(routes, /path="\/app\/workspaces\/:workspaceId\/podcast-database"/u)

// Search embeddings on the platform OpenAI key are rate limited per workspace
// and per member (shared limiter); past the limit, or if the limiter fails,
// the search runs keyword-only rather than spending more.
assert.match(edge, /reservePublicRate\(context\.admin, \[/u)
assert.match(edge, /bucket: `catalog-embed:\$\{workspaceId\}`/u)
assert.match(edge, /bucket: `catalog-embed-user:\$\{context\.user\.id\}`/u)
assert.match(edge, /openaiKey\.source !== 'workspace'/u)
assert.match(edge, /embeddingAllowed = false/u)
assert.match(edge, /const searchEmbedding = embeddingAllowed\s+\? await generatePodcastSearchEmbedding\(search, openaiKey\)\s+: null/u)

console.log('workspace podcast catalog Edge contract passed')
