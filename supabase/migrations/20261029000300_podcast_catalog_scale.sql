-- The Podcast Database at catalogue scale.
--
-- The catalogue went from 12K to 73K shows on 2026-10-26, and the page stopped
-- loading: workspace_podcast_catalog_page_v3 hit the 8s statement timeout. On
-- every call it read every show's description and categories (stored out of
-- line, about 60 MB; 14s on production) and recomputed catalogue-wide lists and
-- counts, to show 24 shows. The refresh tick's due list timed out the same way.
--
-- 1. Search and category matching use indexed columns kept current by a
--    trigger, instead of reading every description: search_document
--    (Postgres full text, 'simple' config, no stemming) and category_keys. A search still needs every word:
--    words longer than three letters match the start of a word ("invest"
--    finds "investing"), shorter ones a whole word ("ai" does not find "said").
-- 2. Wide columns (description, artwork, links, categories) are read only for
--    the page being shown.
-- 3. Catalogue-wide lists and counts (categories, languages, regions, the
--    sync date, the summary) live in podcast_catalog_facets, refreshed every
--    15 minutes by pg_cron, instead of being recomputed on every call.
-- 4. The refresh tick's due list reads an index on "last touched" instead of
--    scanning the table.
-- 5. The page function is planned for each call's own filters
--    (plan_cache_mode = force_custom_plan); a cached generic plan cannot skip
--    the unused ones and was 40x slower.
--
-- Same function signature and response shape: the edge function and the page
-- do not change.

-- Category names as the filter compares them: trimmed and lower-cased.
CREATE OR REPLACE FUNCTION public.podcast_category_keys(categories JSONB)
RETURNS TEXT[]
LANGUAGE sql
IMMUTABLE
PARALLEL SAFE
AS $$
  SELECT COALESCE(array_agg(DISTINCT key), '{}'::TEXT[])
  FROM (
    SELECT lower(btrim(COALESCE(category ->> 'category_name', category #>> '{}'))) AS key
    FROM jsonb_array_elements(
      CASE WHEN jsonb_typeof(categories) = 'array' THEN categories ELSE '[]'::JSONB END
    ) category
  ) keys
  WHERE key <> ''
$$;

-- The same names as one string, for the search document (array_to_string is
-- only STABLE, and a generated column needs IMMUTABLE).
CREATE OR REPLACE FUNCTION public.podcast_category_text(categories JSONB)
RETURNS TEXT
LANGUAGE sql
IMMUTABLE
PARALLEL SAFE
AS $$
  SELECT COALESCE(string_agg(key, ' '), '')
  FROM unnest(public.podcast_category_keys(categories)) key
$$;

-- Plain columns kept current by a trigger, not GENERATED ... STORED: adding a
-- stored generated column rewrites the whole table under an exclusive lock
-- that blocks every reader of podcasts, and on production that rewrite ran
-- past the statement timeout. This way the columns appear instantly, the
-- backfill below takes row locks only, and reads carry on throughout.
ALTER TABLE public.podcasts
  ADD COLUMN IF NOT EXISTS category_keys TEXT[],
  ADD COLUMN IF NOT EXISTS search_document TSVECTOR;

CREATE OR REPLACE FUNCTION public.podcast_search_document(
  podcast_name TEXT,
  publisher_name TEXT,
  host_name TEXT,
  podcast_description TEXT,
  podcast_categories JSONB
)
RETURNS TSVECTOR
LANGUAGE sql
IMMUTABLE
PARALLEL SAFE
AS $$
  SELECT to_tsvector(
    'simple'::REGCONFIG,
    COALESCE(podcast_name, '') || ' ' ||
    COALESCE(publisher_name, '') || ' ' ||
    COALESCE(host_name, '') || ' ' ||
    COALESCE(podcast_description, '') || ' ' ||
    public.podcast_category_text(podcast_categories)
  )
$$;

CREATE OR REPLACE FUNCTION public.podcasts_set_search_columns()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = pg_catalog, public
AS $$
BEGIN
  NEW.category_keys := public.podcast_category_keys(NEW.podcast_categories);
  NEW.search_document := public.podcast_search_document(
    NEW.podcast_name, NEW.publisher_name, NEW.host_name, NEW.podcast_description, NEW.podcast_categories
  );
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS podcasts_search_columns ON public.podcasts;
CREATE TRIGGER podcasts_search_columns
  BEFORE INSERT OR UPDATE OF podcast_name, publisher_name, host_name, podcast_description, podcast_categories
  ON public.podcasts
  FOR EACH ROW EXECUTE FUNCTION public.podcasts_set_search_columns();

-- The backfill and the index builds read every show once; give this session
-- the time for it (the default would cancel them on production).
SET statement_timeout = '30min';

-- Fill existing rows. The updated_at and fetch-count triggers are paused for
-- it, so the backfill changes nothing but the two new columns; they are
-- re-enabled in the same transaction.
ALTER TABLE public.podcasts DISABLE TRIGGER podcasts_updated_at_trigger;
ALTER TABLE public.podcasts DISABLE TRIGGER trigger_auto_increment_fetch_count;
UPDATE public.podcasts
SET
  category_keys = public.podcast_category_keys(podcast_categories),
  search_document = public.podcast_search_document(
    podcast_name, publisher_name, host_name, podcast_description, podcast_categories
  )
WHERE search_document IS NULL;
ALTER TABLE public.podcasts ENABLE TRIGGER podcasts_updated_at_trigger;
ALTER TABLE public.podcasts ENABLE TRIGGER trigger_auto_increment_fetch_count;

CREATE INDEX IF NOT EXISTS podcasts_search_document_idx
  ON public.podcasts USING GIN (search_document);
CREATE INDEX IF NOT EXISTS podcasts_category_keys_idx
  ON public.podcasts USING GIN (category_keys);
CREATE INDEX IF NOT EXISTS podcasts_catalog_refresh_touched_idx
  ON public.podcasts ((GREATEST(
    COALESCE(podscan_last_fetched_at, '-infinity'::TIMESTAMPTZ),
    COALESCE(catalog_refresh_attempted_at, '-infinity'::TIMESTAMPTZ)
  )));

-- One row: the catalogue-wide facts the page shows around its results.
CREATE TABLE IF NOT EXISTS public.podcast_catalog_facets (
  id SMALLINT PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  facets JSONB NOT NULL,
  computed_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
ALTER TABLE public.podcast_catalog_facets ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.podcast_catalog_facets FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.refresh_podcast_catalog_facets()
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  computed JSONB;
BEGIN
  WITH
  usage_rows AS (
    SELECT shortlist.podcast_id, client.workspace_id
    FROM public.client_dashboard_podcasts shortlist
    JOIN public.clients client ON client.id = shortlist.client_id
    UNION ALL
    SELECT shortlist.podcast_id, dashboard.workspace_id
    FROM public.prospect_dashboard_podcasts shortlist
    JOIN public.prospect_dashboards dashboard
      ON dashboard.id = shortlist.prospect_dashboard_id
  ),
  contributing_workspaces AS (
    SELECT workspace_id FROM usage_rows WHERE workspace_id IS NOT NULL
    UNION
    SELECT contribution.workspace_id
    FROM public.podcast_catalog_contributions contribution
    WHERE contribution.workspace_id IS NOT NULL
  ),
  shows AS (
    SELECT
      podcast.is_active,
      podcast.podscan_last_fetched_at,
      podcast.language,
      CASE WHEN lower(btrim(podcast.region)) = 'uk' THEN 'gb' ELSE podcast.region END AS region,
      lower(btrim(COALESCE(podcast.podscan_email, '')))
        ~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' AS has_free_email,
      EXISTS (
        SELECT 1 FROM public.podcast_direct_contacts direct_contact
        WHERE direct_contact.podcast_id = podcast.id
          AND direct_contact.verification_status = 'verified'
      ) AS has_direct_email,
      EXISTS (SELECT 1 FROM usage_rows WHERE usage_rows.podcast_id = podcast.podscan_id) AS on_shortlist
    FROM public.podcasts podcast
  ),
  category_options AS (
    SELECT DISTINCT btrim(COALESCE(category ->> 'category_name', category #>> '{}')) AS category_name
    FROM public.podcasts podcast
    CROSS JOIN LATERAL jsonb_array_elements(
      CASE
        WHEN jsonb_typeof(podcast.podcast_categories) = 'array' THEN podcast.podcast_categories
        ELSE '[]'::JSONB
      END
    ) category
    WHERE podcast.is_active IS TRUE
      AND NULLIF(btrim(COALESCE(category ->> 'category_name', category #>> '{}')), '') IS NOT NULL
  )
  SELECT jsonb_build_object(
    'summary', jsonb_build_object(
      'total_podcasts', (SELECT count(*) FROM shows),
      'active_podcasts', (SELECT count(*) FROM shows WHERE is_active IS TRUE),
      'podcasts_with_free_email', (SELECT count(*) FROM shows WHERE has_free_email),
      'podcasts_with_direct_email', (SELECT count(*) FROM shows WHERE has_direct_email),
      'podcasts_used_in_shortlists', (SELECT count(*) FROM shows WHERE on_shortlist),
      'shortlist_uses', (SELECT count(*) FROM usage_rows),
      'contributing_workspaces', (SELECT count(*) FROM contributing_workspaces),
      'catalog_refreshed_at', (SELECT max(podscan_last_fetched_at) FROM shows)
    ),
    'categories', COALESCE((
      SELECT jsonb_agg(category_name ORDER BY category_name) FROM category_options
    ), '[]'::JSONB),
    -- Most common first; only codes the page can send back (LOCALE_CODE).
    'languages', COALESCE((
      SELECT jsonb_agg(code ORDER BY shows DESC, code)
      FROM (
        SELECT lower(btrim(language)) AS code, count(*) AS shows
        FROM shows
        WHERE is_active IS TRUE AND lower(btrim(language)) ~ '^[a-z]{2,3}(-[a-z0-9]{2,8})?$'
        GROUP BY 1
      ) language_options
    ), '[]'::JSONB),
    'regions', COALESCE((
      SELECT jsonb_agg(code ORDER BY shows DESC, code)
      FROM (
        SELECT lower(btrim(region)) AS code, count(*) AS shows
        FROM shows
        WHERE is_active IS TRUE AND lower(btrim(region)) ~ '^[a-z]{2,3}(-[a-z0-9]{2,8})?$'
        GROUP BY 1
      ) region_options
    ), '[]'::JSONB)
  ) INTO computed;

  INSERT INTO public.podcast_catalog_facets (id, facets, computed_at)
  VALUES (1, computed, NOW())
  ON CONFLICT (id) DO UPDATE SET facets = EXCLUDED.facets, computed_at = EXCLUDED.computed_at;
  RETURN computed;
END;
$$;

REVOKE ALL ON FUNCTION public.refresh_podcast_catalog_facets()
  FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.refresh_podcast_catalog_facets() TO service_role;

CREATE OR REPLACE FUNCTION public.workspace_podcast_catalog_page_v3(
  p_search TEXT DEFAULT NULL,
  p_category TEXT DEFAULT NULL,
  p_contact TEXT DEFAULT 'all',
  p_activity TEXT DEFAULT 'active',
  p_audience TEXT DEFAULT 'all',
  p_language TEXT DEFAULT NULL,
  p_region TEXT DEFAULT NULL,
  p_query_embedding vector(1536) DEFAULT NULL,
  p_sort TEXT DEFAULT 'best_fit',
  p_page INTEGER DEFAULT 1,
  p_page_size INTEGER DEFAULT 24
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
-- Planned for each call's own filters. After five calls PL/pgSQL would
-- otherwise switch to a generic plan that cannot see which filters are unused
-- (search, category), and every call after that took over 40s.
SET plan_cache_mode = force_custom_plan
AS $$
DECLARE
  normalized_search TEXT := lower(NULLIF(btrim(COALESCE(p_search, '')), ''));
  normalized_category TEXT := lower(NULLIF(btrim(COALESCE(p_category, '')), ''));
  normalized_contact TEXT := lower(btrim(COALESCE(p_contact, 'all')));
  normalized_activity TEXT := lower(btrim(COALESCE(p_activity, 'active')));
  normalized_audience TEXT := lower(btrim(COALESCE(p_audience, 'all')));
  normalized_language TEXT := lower(NULLIF(btrim(COALESCE(p_language, '')), ''));
  normalized_region TEXT := lower(NULLIF(btrim(COALESCE(p_region, '')), ''));
  normalized_sort TEXT := lower(btrim(COALESCE(p_sort, 'best_fit')));
  -- The search split into words, for ranking matches whose name has them all.
  search_words TEXT[] := CASE
    WHEN p_search IS NULL OR btrim(p_search) = '' THEN NULL
    ELSE regexp_split_to_array(lower(btrim(p_search)), '\s+')
  END;
  -- The same search as an index query: every word, longer ones as prefixes.
  search_query TSQUERY;
  catalog_facets JSONB;
  effective_sort TEXT;
  normalized_page INTEGER := COALESCE(p_page, 1);
  normalized_page_size INTEGER := COALESCE(p_page_size, 24);
  result JSONB;
BEGIN
  IF normalized_search IS NOT NULL AND length(normalized_search) > 120 THEN
    RAISE EXCEPTION 'search is invalid';
  END IF;
  IF normalized_category IS NOT NULL AND length(normalized_category) > 200 THEN
    RAISE EXCEPTION 'category is invalid';
  END IF;
  IF normalized_contact NOT IN ('all', 'any', 'free', 'direct', 'none') THEN
    RAISE EXCEPTION 'contact filter is invalid';
  END IF;
  IF normalized_activity NOT IN (
    'active',
    'last_30_days',
    'last_90_days',
    'last_180_days',
    'last_year',
    'all'
  ) THEN
    RAISE EXCEPTION 'activity filter is invalid';
  END IF;
  IF normalized_audience NOT IN (
    'all', 'under_10k', '10k_50k', '50k_250k', '250k_1m', '1m_plus', '250k_plus'
  ) THEN
    RAISE EXCEPTION 'audience filter is invalid';
  END IF;
  IF normalized_language IS NOT NULL AND length(normalized_language) > 16 THEN
    RAISE EXCEPTION 'language is invalid';
  END IF;
  IF normalized_region IS NOT NULL AND length(normalized_region) > 16 THEN
    RAISE EXCEPTION 'region is invalid';
  END IF;
  IF normalized_region = 'uk' THEN
    normalized_region := 'gb';
  END IF;
  IF normalized_sort NOT IN (
    'best_fit', 'relevance', 'audience', 'name', 'recent', 'community', 'rating', 'reach'
  ) THEN
    RAISE EXCEPTION 'sort is invalid';
  END IF;
  -- Relevance with nothing searched has nothing to rank by.
  effective_sort := CASE
    WHEN normalized_sort = 'relevance' AND normalized_search IS NULL THEN 'best_fit'
    ELSE normalized_sort
  END;
  IF normalized_page < 1 OR normalized_page > 10000 THEN
    RAISE EXCEPTION 'page is invalid';
  END IF;
  IF normalized_page_size < 12 OR normalized_page_size > 48 THEN
    RAISE EXCEPTION 'page size is invalid';
  END IF;

  -- Words are split on anything that is not a letter or digit, which is also
  -- how the search document was split, so every word is a plain token here.
  IF normalized_search IS NOT NULL THEN
    SELECT to_tsquery('simple', string_agg(
      quote_literal(word) || CASE WHEN length(word) > 3 THEN ':*' ELSE '' END,
      ' & '
    ))
    INTO search_query
    FROM regexp_split_to_table(normalized_search, '[^[:alnum:]]+') word
    WHERE word <> '';
  END IF;

  SELECT facets INTO catalog_facets FROM public.podcast_catalog_facets WHERE id = 1;
  IF catalog_facets IS NULL THEN
    catalog_facets := public.refresh_podcast_catalog_facets();
  END IF;

  WITH
  usage_rows AS (
    SELECT shortlist.podcast_id, client.workspace_id
    FROM public.client_dashboard_podcasts shortlist
    JOIN public.clients client ON client.id = shortlist.client_id
    UNION ALL
    SELECT shortlist.podcast_id, dashboard.workspace_id
    FROM public.prospect_dashboard_podcasts shortlist
    JOIN public.prospect_dashboards dashboard
      ON dashboard.id = shortlist.prospect_dashboard_id
  ),
  combined_usage AS (
    SELECT
      usage_rows.podcast_id,
      count(*)::INTEGER AS use_count,
      count(DISTINCT usage_rows.workspace_id)::INTEGER AS workspace_count
    FROM usage_rows
    GROUP BY usage_rows.podcast_id
  ),
  semantic_candidates AS MATERIALIZED (
    SELECT
      podcast.id,
      1 - (podcast.embedding <=> p_query_embedding) AS semantic_similarity
    FROM public.podcasts podcast
    WHERE p_query_embedding IS NOT NULL
      AND podcast.embedding IS NOT NULL
    ORDER BY podcast.embedding <=> p_query_embedding
    LIMIT 300
  ),
  -- The shows the search words match, from the index alone.
  search_matches AS MATERIALIZED (
    SELECT podcast.id
    FROM public.podcasts podcast
    WHERE search_query IS NOT NULL
      AND podcast.search_document @@ search_query
  ),
  -- Only the narrow columns every row needs to be filtered and ordered.
  catalog AS (
    SELECT
      podcast.id,
      podcast.podscan_id,
      podcast.podcast_name,
      podcast.publisher_name,
      COALESCE(direct_contact.host_name, podcast.host_name) AS host_name,
      podcast.category_keys,
      podcast.episode_count,
      podcast.itunes_rating,
      podcast.itunes_rating_count,
      podcast.spotify_rating,
      podcast.spotify_rating_count,
      podcast.audience_size,
      podcast.podcast_reach_score,
      podcast.language,
      -- "uk" is not an ISO region code; a few feeds use it for "gb".
      CASE WHEN lower(btrim(podcast.region)) = 'uk' THEN 'gb' ELSE podcast.region END AS region,
      podcast.last_posted_at,
      podcast.is_active,
      podcast.podscan_last_fetched_at,
      podcast.updated_at,
      CASE
        WHEN lower(btrim(COALESCE(podcast.podscan_email, '')))
          ~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'
        THEN lower(btrim(podcast.podscan_email))
        ELSE NULL
      END AS free_podscan_email,
      direct_contact.email AS direct_email,
      direct_contact.last_verified_at AS direct_verified_at,
      COALESCE(combined_usage.use_count, 0) AS shortlist_uses,
      COALESCE(combined_usage.workspace_count, 0) AS workspace_uses,
      semantic_candidate.semantic_similarity,
      search_match.id IS NOT NULL AS words_match
    FROM public.podcasts podcast
    LEFT JOIN combined_usage ON combined_usage.podcast_id = podcast.podscan_id
    LEFT JOIN semantic_candidates semantic_candidate
      ON semantic_candidate.id = podcast.id
    LEFT JOIN search_matches search_match ON search_match.id = podcast.id
    LEFT JOIN public.podcast_direct_contacts direct_contact
      ON direct_contact.podcast_id = podcast.id
      AND direct_contact.verification_status = 'verified'
  ),
  filtered AS MATERIALIZED (
    SELECT *
    FROM catalog
    WHERE
      (
        normalized_activity = 'all'
        OR (
          normalized_activity = 'active'
          AND is_active IS TRUE
          AND last_posted_at >= NOW() - INTERVAL '90 days'
        )
        OR (
          normalized_activity = 'last_30_days'
          AND is_active IS TRUE
          AND last_posted_at >= NOW() - INTERVAL '30 days'
        )
        OR (
          normalized_activity = 'last_90_days'
          AND is_active IS TRUE
          AND last_posted_at >= NOW() - INTERVAL '90 days'
        )
        OR (
          normalized_activity = 'last_180_days'
          AND is_active IS TRUE
          AND last_posted_at >= NOW() - INTERVAL '180 days'
        )
        OR (
          normalized_activity = 'last_year'
          AND is_active IS TRUE
          AND last_posted_at >= NOW() - INTERVAL '1 year'
        )
      )
      AND (
        normalized_search IS NULL
        OR words_match
        OR COALESCE(semantic_similarity, 0) >= 0.22
      )
      AND (normalized_category IS NULL OR category_keys @> ARRAY[normalized_category])
      AND (
        normalized_contact = 'all'
        OR (normalized_contact = 'any' AND (free_podscan_email IS NOT NULL OR direct_email IS NOT NULL))
        OR (normalized_contact = 'free' AND free_podscan_email IS NOT NULL)
        OR (normalized_contact = 'direct' AND direct_email IS NOT NULL)
        OR (normalized_contact = 'none' AND free_podscan_email IS NULL AND direct_email IS NULL)
      )
      -- Trimmed the same way as the option lists, so a choice always matches
      -- the shows it was counted from.
      AND (normalized_language IS NULL OR lower(btrim(language)) = normalized_language)
      AND (normalized_region IS NULL OR lower(btrim(region)) = normalized_region)
      AND (
        normalized_audience = 'all'
        OR (normalized_audience = 'under_10k' AND audience_size IS NOT NULL AND audience_size < 10000)
        OR (normalized_audience = '10k_50k' AND audience_size >= 10000 AND audience_size < 50000)
        OR (normalized_audience = '50k_250k' AND audience_size >= 50000 AND audience_size < 250000)
        OR (normalized_audience = '250k_1m' AND audience_size >= 250000 AND audience_size < 1000000)
        OR (normalized_audience = '1m_plus' AND audience_size >= 1000000)
        OR (normalized_audience = '250k_plus' AND audience_size >= 250000)
      )
  ),
  scored AS (
    SELECT
      filtered.*,
      CASE
        WHEN normalized_search IS NULL THEN 0
        ELSE
          CASE
            WHEN lower(podcast_name) = normalized_search THEN 12
            WHEN lower(podcast_name) LIKE normalized_search || '%' THEN 10
            WHEN position(normalized_search IN lower(podcast_name)) > 0 THEN 8
            WHEN lower(COALESCE(host_name, '')) = normalized_search
              OR lower(COALESCE(publisher_name, '')) = normalized_search THEN 7
            WHEN position(normalized_search IN lower(concat_ws(' ', host_name, publisher_name))) > 0 THEN 6
            -- Every word in the name, in another order: nearly as good as the phrase.
            WHEN NOT EXISTS (
              SELECT 1 FROM unnest(search_words) search_word
              WHERE position(search_word IN lower(podcast_name)) = 0
            ) THEN 5
            -- The exact phrase in the description: read only for matched shows.
            WHEN position(normalized_search IN lower(COALESCE((
              SELECT podcast.podcast_description FROM public.podcasts podcast WHERE podcast.id = filtered.id
            ), ''))) > 0 THEN 4
            WHEN position(normalized_search IN array_to_string(category_keys, ' ')) > 0 THEN 3
            -- Every word somewhere in the show's text.
            WHEN words_match THEN 2
            ELSE 0
          END
          + COALESCE(GREATEST(semantic_similarity - 0.15, 0) * 6, 0)
      END AS search_rank,
      -- Best fit: can they be reached, can a client get on, are they recording.
      (
        CASE
          WHEN direct_email IS NOT NULL THEN 3
          WHEN free_podscan_email IS NOT NULL THEN 2
          ELSE 0
        END
        + CASE
          WHEN audience_size >= 10000 AND audience_size < 250000 THEN 3
          WHEN audience_size >= 2500 AND audience_size < 1000000 THEN 1
          ELSE 0
        END
        + CASE
          WHEN last_posted_at >= NOW() - INTERVAL '30 days' THEN 2
          WHEN last_posted_at >= NOW() - INTERVAL '90 days' THEN 1
          ELSE 0
        END
      ) AS fit_score
    FROM filtered
  ),
  ordered AS (
    SELECT
      scored.*,
      row_number() OVER (
        ORDER BY
          CASE WHEN effective_sort = 'relevance' THEN search_rank END DESC NULLS LAST,
          CASE WHEN effective_sort = 'best_fit' THEN fit_score END DESC NULLS LAST,
          CASE WHEN effective_sort = 'best_fit' AND audience_size > 0 THEN
            round(abs(ln(audience_size::NUMERIC / 50000)) / ln(2))
          END ASC NULLS LAST,
          CASE WHEN effective_sort = 'best_fit' THEN podcast_reach_score END DESC NULLS LAST,
          CASE WHEN effective_sort = 'audience' THEN audience_size END DESC NULLS LAST,
          CASE WHEN effective_sort = 'community' THEN shortlist_uses END DESC NULLS LAST,
          CASE WHEN effective_sort = 'recent' THEN last_posted_at END DESC NULLS LAST,
          CASE WHEN effective_sort = 'rating' THEN
            CASE WHEN itunes_rating > 0 THEN itunes_rating ELSE NULLIF(spotify_rating, 0) END
          END DESC NULLS LAST,
          CASE WHEN effective_sort = 'rating' THEN
            CASE WHEN itunes_rating > 0 THEN itunes_rating_count ELSE spotify_rating_count END
          END DESC NULLS LAST,
          CASE WHEN effective_sort = 'reach' THEN podcast_reach_score END DESC NULLS LAST,
          CASE WHEN effective_sort = 'name' THEN lower(podcast_name) END ASC NULLS LAST,
          CASE WHEN normalized_search IS NOT NULL THEN search_rank END DESC NULLS LAST,
          CASE WHEN effective_sort <> 'name' THEN lower(podcast_name) END ASC NULLS LAST,
          podscan_id ASC
      ) AS result_order
    FROM scored
  ),
  page_items AS (
    SELECT *
    FROM ordered
    WHERE result_order > (normalized_page - 1) * normalized_page_size
      AND result_order <= normalized_page * normalized_page_size
  )
  SELECT jsonb_build_object(
    'items', COALESCE((
      SELECT jsonb_agg(
        jsonb_build_object(
          'podcast_id', page_item.podscan_id,
          'podcast_name', page_item.podcast_name,
          'podcast_description', podcast.podcast_description,
          'podcast_image_url', podcast.podcast_image_url,
          'podcast_url', podcast.podcast_url,
          'publisher_name', page_item.publisher_name,
          'host_name', page_item.host_name,
          'podcast_categories', podcast.podcast_categories,
          'episode_count', page_item.episode_count,
          'itunes_rating', page_item.itunes_rating,
          'spotify_rating', page_item.spotify_rating,
          'audience_size', page_item.audience_size,
          'podcast_reach_score', page_item.podcast_reach_score,
          'language', page_item.language,
          'region', page_item.region,
          'website', podcast.website,
          'rss_feed', podcast.rss_url,
          'last_posted_at', page_item.last_posted_at,
          'is_active', page_item.is_active,
          'catalog_updated_at', COALESCE(page_item.podscan_last_fetched_at, page_item.updated_at),
          'free_podscan_email', page_item.free_podscan_email,
          'direct_email', page_item.direct_email,
          'direct_verified_at', page_item.direct_verified_at,
          'shortlist_uses', page_item.shortlist_uses,
          'workspace_uses', page_item.workspace_uses
        )
        ORDER BY page_item.result_order
      )
      -- The wide columns, for the shows on this page only.
      FROM page_items page_item
      JOIN public.podcasts podcast ON podcast.id = page_item.id
    ), '[]'::JSONB),
    'pagination', jsonb_build_object(
      'page', normalized_page,
      'page_size', normalized_page_size,
      'total', (SELECT count(*) FROM filtered),
      'total_pages', CEIL((SELECT count(*) FROM filtered)::NUMERIC / normalized_page_size)::INTEGER
    ),
    'summary', COALESCE(catalog_facets -> 'summary', '{}'::JSONB),
    'categories', COALESCE(catalog_facets -> 'categories', '[]'::JSONB),
    'languages', COALESCE(catalog_facets -> 'languages', '[]'::JSONB),
    'regions', COALESCE(catalog_facets -> 'regions', '[]'::JSONB)
  ) INTO result;

  RETURN result;
END;
$$;

REVOKE ALL ON FUNCTION public.workspace_podcast_catalog_page_v3(
  TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, vector, TEXT, INTEGER, INTEGER
) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.workspace_podcast_catalog_page_v3(
  TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, vector, TEXT, INTEGER, INTEGER
) TO service_role;

-- The refresh tick's due list, read off the "last touched" index: shortlisted
-- shows and the rest each take the oldest from the index and stop, instead of
-- sorting the whole catalogue.
CREATE OR REPLACE FUNCTION public.podcast_catalog_refresh_due(p_limit INTEGER DEFAULT 55)
RETURNS TABLE (podscan_id TEXT)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
  WITH limits AS (
    SELECT LEAST(GREATEST(COALESCE(p_limit, 55), 1), 100) AS n
  ),
  shortlisted AS (
    SELECT shortlist.podcast_id FROM public.client_dashboard_podcasts shortlist
    UNION
    SELECT shortlist.podcast_id FROM public.prospect_dashboard_podcasts shortlist
  ),
  shortlisted_due AS (
    SELECT podcast.podscan_id, TRUE AS on_shortlist,
      GREATEST(
        COALESCE(podcast.podscan_last_fetched_at, '-infinity'::TIMESTAMPTZ),
        COALESCE(podcast.catalog_refresh_attempted_at, '-infinity'::TIMESTAMPTZ)
      ) AS last_touched
    FROM shortlisted
    JOIN public.podcasts podcast ON podcast.podscan_id = shortlisted.podcast_id
    WHERE GREATEST(
        COALESCE(podcast.podscan_last_fetched_at, '-infinity'::TIMESTAMPTZ),
        COALESCE(podcast.catalog_refresh_attempted_at, '-infinity'::TIMESTAMPTZ)
      ) < NOW() - INTERVAL '7 days'
    ORDER BY 3
    LIMIT (SELECT n FROM limits)
  ),
  other_due AS (
    SELECT podcast.podscan_id, FALSE AS on_shortlist,
      GREATEST(
        COALESCE(podcast.podscan_last_fetched_at, '-infinity'::TIMESTAMPTZ),
        COALESCE(podcast.catalog_refresh_attempted_at, '-infinity'::TIMESTAMPTZ)
      ) AS last_touched
    FROM public.podcasts podcast
    WHERE GREATEST(
        COALESCE(podcast.podscan_last_fetched_at, '-infinity'::TIMESTAMPTZ),
        COALESCE(podcast.catalog_refresh_attempted_at, '-infinity'::TIMESTAMPTZ)
      ) < NOW() - INTERVAL '30 days'
      AND NULLIF(btrim(podcast.podscan_id), '') IS NOT NULL
      AND NOT EXISTS (SELECT 1 FROM shortlisted WHERE shortlisted.podcast_id = podcast.podscan_id)
    ORDER BY GREATEST(
        COALESCE(podcast.podscan_last_fetched_at, '-infinity'::TIMESTAMPTZ),
        COALESCE(podcast.catalog_refresh_attempted_at, '-infinity'::TIMESTAMPTZ)
      )
    LIMIT (SELECT n FROM limits)
  )
  SELECT due.podscan_id
  FROM (SELECT * FROM shortlisted_due UNION ALL SELECT * FROM other_due) due
  ORDER BY due.on_shortlist DESC, due.last_touched ASC
  LIMIT (SELECT n FROM limits);
$$;

REVOKE ALL ON FUNCTION public.podcast_catalog_refresh_due(INTEGER)
  FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.podcast_catalog_refresh_due(INTEGER) TO service_role;

-- Facts first computed here, then every 15 minutes.
SELECT public.refresh_podcast_catalog_facets();

RESET statement_timeout;

CREATE EXTENSION IF NOT EXISTS pg_cron;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'podcast-catalog-facets') THEN
    PERFORM cron.unschedule('podcast-catalog-facets');
  END IF;
  PERFORM cron.schedule(
    'podcast-catalog-facets',
    '*/15 * * * *',
    $job$ SELECT public.refresh_podcast_catalog_facets(); $job$
  );
END;
$$;
