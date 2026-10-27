-- Podcast Database: Best fit favours business and professional shows.
--
-- The catalogue now spans every topic, and the top of the default view was
-- led by gaming, tennis and film podcasts that take guests and have an
-- email. Best fit adds +3 for business categories (business,
-- entrepreneurship, marketing, management, leadership, careers, investing,
-- non-profit) and +1 for neighbouring ones (technology, education,
-- self-improvement...), which on their own also cover gaming tech, parenting
-- and the like. Taking guests (+4) stays the strongest single factor.

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
  p_page_size INTEGER DEFAULT 24,
  p_guests TEXT DEFAULT 'all'
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
  normalized_guests TEXT := lower(btrim(COALESCE(p_guests, 'all')));
  -- The search split into words, for ranking matches whose name has them all.
  search_words TEXT[] := CASE
    WHEN p_search IS NULL OR btrim(p_search) = '' THEN NULL
    ELSE regexp_split_to_array(lower(btrim(p_search)), '\s+')
  END;
  -- The same search as an index query: every word, longer ones as prefixes.
  search_query TSQUERY;
  -- The category codes a choice covers: "health|fitness" is either half of
  -- Apple's "Health & Fitness"; a single code is a list of one.
  category_filter TEXT[];
  -- Identical filters give an identical page for every workspace (the
  -- catalogue is shared), so a recent answer is reused.
  page_cache_key TEXT;
  cached JSONB;
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
  IF normalized_contact NOT IN ('all', 'any', 'free', 'direct', 'verified', 'none') THEN
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
  IF normalized_guests NOT IN ('all', 'yes', 'no') THEN
    RAISE EXCEPTION 'guests filter is invalid';
  END IF;
  IF normalized_page < 1 OR normalized_page > 10000 THEN
    RAISE EXCEPTION 'page is invalid';
  END IF;
  IF normalized_page_size < 12 OR normalized_page_size > 48 THEN
    RAISE EXCEPTION 'page size is invalid';
  END IF;

  IF normalized_category IS NOT NULL THEN
    SELECT array_agg(DISTINCT btrim(code)) FILTER (WHERE btrim(code) <> '')
    INTO category_filter
    FROM unnest(string_to_array(normalized_category, '|')) code;
  END IF;

  -- A semantic search's embedding is a fixed function of its text (one
  -- model, one size), so the text and whether an embedding came with it are
  -- the key; a search that fell back to keywords is cached apart from it.
  page_cache_key := md5(format(
    'v3|%s|%s|%s|%s|%s|%s|%s|%s|%s|%s|%s|%s',
    COALESCE(normalized_search, '~'), COALESCE(normalized_category, '~'), normalized_contact,
    normalized_activity, normalized_audience, COALESCE(normalized_language, '~'),
    COALESCE(normalized_region, '~'), effective_sort, normalized_page, normalized_page_size,
    normalized_guests,
    CASE WHEN p_query_embedding IS NULL THEN 'keyword' ELSE 'semantic' END
  ));
  SELECT page_cache.result INTO cached
  FROM public.podcast_catalog_page_cache page_cache
  WHERE page_cache.cache_key = page_cache_key
    AND page_cache.computed_at > NOW() - INTERVAL '5 minutes';
  IF cached IS NOT NULL THEN
    RETURN cached;
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
  -- Built once. The planner has no statistics for the trimmed, lower-cased
  -- language and region filters, so it expected one matching show and rebuilt
  -- these counts for each of them (1,435 times for English + United Kingdom,
  -- 4.7s on production).
  combined_usage AS MATERIALIZED (
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
      AND podcast.hidden_reason IS NULL
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
      podcast.podcast_has_guests,
      podcast.podscan_last_fetched_at,
      podcast.updated_at,
      -- The show's own address, picked once per row (podcast_contact_email).
      podcast.contact_email AS free_podscan_email,
      -- MillionVerifier's result for that address, or null when unchecked.
      podcast.contact_email_status,
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
    -- Duplicates and spam are kept (shortlists may point at them) but never listed.
    WHERE podcast.hidden_reason IS NULL
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
      AND (category_filter IS NULL OR category_keys && category_filter)
      -- Takes guests: Podscan's has-guests flag; "no" includes shows it has
      -- no answer for.
      AND (
        normalized_guests = 'all'
        OR (normalized_guests = 'yes' AND podcast_has_guests IS TRUE)
        OR (normalized_guests = 'no' AND podcast_has_guests IS NOT TRUE)
      )
      AND (
        normalized_contact = 'all'
        OR (normalized_contact = 'any' AND (free_podscan_email IS NOT NULL OR direct_email IS NOT NULL))
        OR (normalized_contact = 'free' AND free_podscan_email IS NOT NULL)
        OR (normalized_contact = 'direct' AND direct_email IS NOT NULL)
        -- Verified deliverable: a verified direct contact, or an address
        -- MillionVerifier confirmed.
        OR (normalized_contact = 'verified' AND (direct_email IS NOT NULL OR contact_email_status = 'ok'))
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
      -- Best fit: do they take guests (strongest: it is the whole pitch), can
      -- they be reached, can a client get on, are they recording.
      (
        CASE WHEN podcast_has_guests IS TRUE THEN 4 ELSE 0 END
        -- Business topics: the shows a B2B client is pitched on (+3). Topics
        -- next to business (technology, education, self-improvement...) get
        -- a nudge only (+1): they also cover gaming tech, parenting and the
        -- like, so they are not business by themselves.
        + CASE
          WHEN category_keys && ARRAY[
            'business', 'entrepreneurship', 'marketing', 'management', 'leadership',
            'careers', 'investing', 'non-profit'
          ]::TEXT[] THEN 3
          WHEN category_keys && ARRAY[
            'technology', 'artificial-intelligence', 'machine-learning', 'programming',
            'education', 'self-improvement', 'personal-development', 'courses', 'how-to', 'government'
          ]::TEXT[] THEN 1
          ELSE 0
        END
        + CASE
          WHEN direct_email IS NOT NULL THEN 3
          -- Confirmed deliverable ahead of catch-all, unknown or unchecked.
          WHEN contact_email_status = 'ok' THEN 2
          WHEN free_podscan_email IS NOT NULL THEN 1
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
  -- Only the page is sorted out of the matches (a top-N sort that keeps
  -- page-size rows in memory), instead of numbering every matching show in
  -- order first: 55K shows on the default view, most of its time at 90K.
  page_rows AS (
    SELECT scored.*
    FROM scored
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
    LIMIT normalized_page_size
    OFFSET (normalized_page - 1) * normalized_page_size
  ),
  page_items AS (
    SELECT
      page_rows.*,
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
    FROM page_rows
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
          'email_verification', page_item.contact_email_status,
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

  IF page_cache_key IS NOT NULL THEN
    INSERT INTO public.podcast_catalog_page_cache (cache_key, result, computed_at)
    VALUES (page_cache_key, result, NOW())
    ON CONFLICT ON CONSTRAINT podcast_catalog_page_cache_pkey
    DO UPDATE SET result = EXCLUDED.result, computed_at = EXCLUDED.computed_at;
  END IF;

  RETURN result;
END;
$$;

REVOKE ALL ON FUNCTION public.workspace_podcast_catalog_page_v3(
  TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, vector, TEXT, INTEGER, INTEGER, TEXT
) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.workspace_podcast_catalog_page_v3(
  TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, vector, TEXT, INTEGER, INTEGER, TEXT
) TO service_role;

TRUNCATE public.podcast_catalog_page_cache;
