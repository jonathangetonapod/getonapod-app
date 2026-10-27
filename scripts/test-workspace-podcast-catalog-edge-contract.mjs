import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const edge = readFileSync('supabase/functions/workspace-podcast-catalog/index.ts', 'utf8')
const shortlistEdge = readFileSync('supabase/functions/workspace-client-shortlist/index.ts', 'utf8')
const searchHelper = readFileSync('supabase/functions/_shared/podcastSearch.ts', 'utf8')
const foundationMigration = readFileSync('supabase/migrations/20260725000600_workspace_podcast_catalog.sql', 'utf8')
const filterMigration = readFileSync('supabase/migrations/20260725000700_workspace_podcast_catalog_filters.sql', 'utf8')
const v3Migration = readFileSync('supabase/migrations/20261029000100_workspace_podcast_catalog_v3.sql', 'utf8')
const scaleMigration = readFileSync('supabase/migrations/20261029000300_podcast_catalog_scale.sql', 'utf8')
const categoryGroupsMigration = readFileSync('supabase/migrations/20261029000700_podcast_catalog_category_groups.sql', 'utf8')
const guestsMigration = readFileSync('supabase/migrations/20261029000900_podcast_catalog_guests_filter.sql', 'utf8')
const embeddingCacheMigration = readFileSync('supabase/migrations/20261029001000_podcast_search_embedding_cache.sql', 'utf8')
const verifiedContactMigration = readFileSync('supabase/migrations/20261030000200_podcast_contact_email_verified.sql', 'utf8')
const config = readFileSync('supabase/config.toml', 'utf8')
const service = readFileSync('src/services/workspacePodcastCatalog.ts', 'utf8')
const clientEditor = readFileSync('src/components/workspace/ClientShortlistEditor.tsx', 'utf8')
const layout = readFileSync('src/components/workspace/WorkspaceLayout.tsx', 'utf8')
const routes = readFileSync('src/App.tsx', 'utf8')

assert.match(edge, /requireAuthenticatedUser\(req\)/u)
assert.match(edge, /requireWorkspaceFeatureAccess\(context, workspaceId\)/u)
assert.match(edge, /rpc\('workspace_podcast_catalog_page_v3'/u)
assert.match(edge, /generatePodcastSearchEmbedding\(normalizedSearchText\(search as string\), openaiKey\)/u)
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
assert.match(v3Migration, /normalized_language IS NULL OR lower\(btrim\(language\)\) = normalized_language/u)
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
// Review fixes: short words match whole words (escaped), language and region
// codes are not searched as text, filters trim like their option lists, and
// the option lists only carry codes the page can send back.
assert.match(v3Migration, /WHEN length\(search_word\) <= 3 THEN search_text !~ \(/u)
assert.match(v3Migration, /regexp_replace\(search_word, '\(\[\^\[:alnum:\]\]\)', '\\\\\\1', 'g'\)/u)
assert.match(v3Migration, /lower\(btrim\(language\)\) = normalized_language/u)
assert.match(v3Migration, /lower\(btrim\(region\)\) = normalized_region/u)
assert.match(v3Migration, /lower\(btrim\(language\)\) ~ '\^\[a-z\]\{2,3\}/u)
// At catalogue scale (73K shows): search and category matching use indexed
// generated columns, wide columns are read for the page only, catalogue-wide
// lists come from a cached facets row, and every call is planned for its own
// filters (a cached generic plan was 40x slower).
// Trigger-maintained columns, not GENERATED STORED: a stored generated column
// rewrites the table under an exclusive lock, which timed out on production.
assert.doesNotMatch(scaleMigration, /GENERATED ALWAYS AS/u)
assert.match(scaleMigration, /CREATE TRIGGER podcasts_search_columns\s+BEFORE INSERT OR UPDATE OF/u)
assert.match(scaleMigration, /DISABLE TRIGGER podcasts_updated_at_trigger;[\s\S]+ENABLE TRIGGER podcasts_updated_at_trigger;/u)
assert.match(scaleMigration, /USING GIN \(search_document\)/u)
assert.match(scaleMigration, /USING GIN \(category_keys\)/u)
assert.match(scaleMigration, /category_keys @> ARRAY\[normalized_category\]/u)
assert.match(scaleMigration, /podcast\.search_document @@ search_query/u)
assert.match(scaleMigration, /SET plan_cache_mode = force_custom_plan/u)
assert.match(scaleMigration, /JOIN public\.podcasts podcast ON podcast\.id = page_item\.id/u)
assert.match(scaleMigration, /'categories', COALESCE\(catalog_facets -> 'categories'/u)
assert.match(scaleMigration, /'podcast-catalog-facets',\s+'\*\/15 \* \* \* \*'/u)
assert.match(scaleMigration, /REVOKE ALL ON FUNCTION public\.refresh_podcast_catalog_facets\(\)\s+FROM PUBLIC, anon, authenticated, service_role;/u)
assert.match(scaleMigration, /podcasts_catalog_refresh_touched_idx/u)
// A category choice can cover several codes ("society|culture"), matched by overlap.
assert.match(categoryGroupsMigration, /string_to_array\(normalized_category, '\|'\)/u)
assert.match(categoryGroupsMigration, /category_filter IS NULL OR category_keys && category_filter/u)
assert.match(categoryGroupsMigration, /SET plan_cache_mode = force_custom_plan/u)
assert.match(categoryGroupsMigration, /podcast_catalog_page_cache/u)
// "Takes guests": a trailing p_guests (default 'all') in the cache key, and the
// old signature dropped so PostgREST never sees two overloads.
assert.match(guestsMigration, /DROP FUNCTION IF EXISTS public\.workspace_podcast_catalog_page_v3\(\s+TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, vector, TEXT, INTEGER, INTEGER\s+\);/u)
assert.match(guestsMigration, /p_guests TEXT DEFAULT 'all'\n\)/u)
assert.match(guestsMigration, /normalized_guests NOT IN \('all', 'yes', 'no'\)/u)
assert.match(guestsMigration, /normalized_page_size,\s+normalized_guests\s+\)\);/u)
assert.match(guestsMigration, /GRANT EXECUTE ON FUNCTION public\.workspace_podcast_catalog_page_v3\([\s\S]+INTEGER, INTEGER, TEXT\s+\) TO service_role;/u)
// Repeat searches: embeddings remembered by text, semantic pages cached, and
// Best fit led by shows that take guests.
assert.match(embeddingCacheMigration, /CREATE TABLE IF NOT EXISTS public\.podcast_search_embeddings/u)
assert.match(embeddingCacheMigration, /REVOKE ALL ON TABLE public\.podcast_search_embeddings FROM PUBLIC, anon, authenticated;/u)
assert.match(embeddingCacheMigration, /CASE WHEN p_query_embedding IS NULL THEN 'keyword' ELSE 'semantic' END/u)
assert.match(embeddingCacheMigration, /CASE WHEN podcast_has_guests IS TRUE THEN 4 ELSE 0 END/u)
assert.match(searchHelper, /export async function rememberedSearchEmbedding/u)
// Contacts chosen by deliverability: never an invalid or disposable address,
// confirmed before catch-all before unchecked; re-picked when results land;
// exposed as email_verification and the 'verified' contact filter.
assert.match(edge, /'direct', 'verified', 'none'/u)
assert.match(verifiedContactMigration, /verification\.status IS NULL OR verification\.status NOT IN \('invalid', 'disposable'\)/u)
assert.match(verifiedContactMigration, /CASE verification\.status WHEN 'ok' THEN 0 WHEN 'catch_all' THEN 1 ELSE 2 END/u)
assert.match(verifiedContactMigration, /AFTER INSERT ON public\.podcast_email_verifications\s+REFERENCING NEW TABLE AS changed_verifications/u)
assert.match(verifiedContactMigration, /AFTER UPDATE ON public\.podcast_email_verifications\s+REFERENCING NEW TABLE AS changed_verifications/u)
assert.match(verifiedContactMigration, /REVOKE ALL ON FUNCTION public\.podcasts_set_search_columns\(\) FROM PUBLIC, anon, authenticated;/u)
assert.match(verifiedContactMigration, /'email_verification', page_item\.contact_email_status/u)
assert.match(verifiedContactMigration, /normalized_contact = 'verified' AND \(direct_email IS NOT NULL OR contact_email_status = 'ok'\)/u)
assert.match(searchHelper, /model: EMBEDDING_MODEL/u)
assert.match(searchHelper, /dimensions: EMBEDDING_DIMENSIONS/u)
assert.match(shortlistEdge, /rpc\('workspace_podcast_catalog_page_v2'/u)
assert.match(shortlistEdge, /generatePodcastSearchEmbedding\(query[,)]/u)

assert.match(config, /\[functions\.workspace-podcast-catalog\]\s+verify_jwt = true/u)
assert.match(service, /functions\.invoke\('workspace-podcast-catalog'/u)
assert.match(service, /audience: params\.audience \|\| 'all'/u)
// The Takes guests filter reaches the catalog function, validated, defaulting to every format.
assert.match(edge, /const GUEST_FILTERS = new Set\(\['all', 'yes', 'no'\]\)/u)
assert.match(edge, /optionalChoice\(body\.guests, 'guests', GUEST_FILTERS, 'all'\)/u)
assert.match(edge, /p_guests: guests,/u)
assert.match(service, /guests: params\.guests \|\| 'all'/u)
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
assert.match(edge, /const searchEmbedding = embeddingAllowed\s+\? await generatePodcastSearchEmbedding\(normalizedSearchText\(search as string\), openaiKey\)\s+: null/u)
// A search seen before reuses its embedding (no OpenAI call, cost or rate
// slot); browsing reads neither the AI key nor the embedding store; the
// workspace check runs alongside those reads but before any OpenAI spend.
assert.match(edge, /const wantsEmbedding = Boolean\(search && search\.length >= 3 && isSemanticSearchEnabled\(\)\)/u)
assert.match(edge, /const \[access, rememberedEmbedding\] = await Promise\.all\(\[\s+requireWorkspaceFeatureAccess\(context, workspaceId\),/u)
// The workspace's stored AI key is read only after the access check, and only
// when no remembered embedding exists.
assert.match(edge, /if \(wantsEmbedding && !queryEmbedding\) \{[\s\S]{0,300}const openaiKey = await resolveAiKey\(context\.admin, workspaceId, 'openai'\)/u)
assert.doesNotMatch(edge, /Promise\.all\(\[[^\]]*resolveAiKey/u)
assert.match(edge, /if \(wantsEmbedding && !queryEmbedding\) \{/u)
assert.match(edge, /rememberSearchEmbedding\(context\.admin, search as string, searchEmbedding\.embedding\)/u)

console.log('workspace podcast catalog Edge contract passed')
