-- Podcast Database catalog, version 3.
--
-- "Still publishing" (activity = 'active') used to be Podscan's is_active flag
-- alone. That flag only says the feed has not been retired, so a show whose
-- newest episode in the catalogue was months old still passed, and the
-- default view led with shows nobody could confirm were still recording. It
-- now also needs an episode in the last 90 days.
--
-- The page also gets one catalogue-wide refresh date (summary.
-- catalog_refreshed_at): the latest time any show was pulled from Podscan.
-- The header used to show the oldest date among the rows on screen, so it
-- changed with every search and page.
--
-- Best fit (the new default sort) leads with shows a client can realistically
-- book: a reachable email, a mid-size audience (10K to 250K) and a recent
-- episode, rather than the biggest shows in the catalogue. The 250K+ audience
-- band is split into 250K to 1M and 1M+; 250k_plus is still accepted for old
-- addresses.
--
-- A search used to put its own match ranking ahead of whichever sort was
-- chosen, so "Largest audience" came back in match order. Now the chosen sort
-- applies, with match ranking only breaking ties, and a Relevance sort orders
-- by the match itself (the page selects it while a search is active).
--
-- Language and region filters (with the codes the catalogue holds, so the
-- page offers only choices that match something), and Rating and Reach score
-- sorts. Rating sorts by the rating the list shows: Apple Podcasts, or Spotify
-- where a show has no Apple rating, with more ratings breaking ties.
--
-- A search matches shows containing every word typed, in any order and
-- anywhere in the show's text, rather than the exact phrase: "real estate
-- investing" used to miss a show about "investing in real estate". Exact
-- phrases still rank first under Relevance. Words of three letters or fewer
-- ("ai", "seo") must match a whole word, or "ai" would match "said". Language
-- and region codes are no longer searched as text ("us" matched every US
-- show); they have their own filters.
--
-- Within a Best fit tier, audiences are grouped into doubling bands around
-- 50K (about 35K to 70K, then 18K to 35K and 70K to 140K, and so on), nearest
-- band first, and ranked by reach score inside each band. Ranking by reach
-- alone filled the first page with shows just under the 250K edge; ranking by
-- distance alone filled it with shows at exactly 50K.
--
-- v2 is left as it was: the client shortlist editor's search still calls it.

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
  -- The search split into words; a show must contain every one of them.
  search_words TEXT[] := CASE
    WHEN p_search IS NULL OR btrim(p_search) = '' THEN NULL
    ELSE regexp_split_to_array(lower(btrim(p_search)), '\s+')
  END;
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
  catalog AS (
    SELECT
      podcast.id,
      podcast.podscan_id,
      podcast.podcast_name,
      podcast.podcast_description,
      podcast.podcast_image_url,
      podcast.podcast_url,
      podcast.publisher_name,
      COALESCE(direct_contact.host_name, podcast.host_name) AS host_name,
      podcast.podcast_categories,
      podcast.episode_count,
      podcast.itunes_rating,
      podcast.itunes_rating_count,
      podcast.spotify_rating,
      podcast.spotify_rating_count,
      podcast.audience_size,
      podcast.podcast_reach_score,
      podcast.language,
      -- "uk" is not an ISO region code; a few feeds use it for "gb", and both
      -- would read as United Kingdom in the filter.
      CASE WHEN lower(btrim(podcast.region)) = 'uk' THEN 'gb' ELSE podcast.region END AS region,
      podcast.website,
      podcast.rss_url,
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
      -- The text a search looks in, built only when there is a search: as typed
      -- for long words, and as space-separated words for short ones.
      CASE WHEN normalized_search IS NOT NULL THEN lower(concat_ws(
        ' ',
        podcast.podcast_name,
        podcast.publisher_name,
        COALESCE(direct_contact.host_name, podcast.host_name),
        podcast.podcast_description,
        podcast.podcast_categories::TEXT
      )) END AS search_text
    FROM public.podcasts podcast
    LEFT JOIN combined_usage ON combined_usage.podcast_id = podcast.podscan_id
    LEFT JOIN semantic_candidates semantic_candidate
      ON semantic_candidate.id = podcast.id
    LEFT JOIN public.podcast_direct_contacts direct_contact
      ON direct_contact.podcast_id = podcast.id
      AND direct_contact.verification_status = 'verified'
  ),
  filtered AS (
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
        OR NOT EXISTS (
          SELECT 1
          FROM unnest(search_words) search_word
          WHERE CASE
            -- A whole word: \m and \M are word boundaries, and anything in the
            -- word that regex would read as syntax is escaped first.
            WHEN length(search_word) <= 3 THEN search_text !~ (
              '\m' || regexp_replace(search_word, '([^[:alnum:]])', '\\\1', 'g') || '\M'
            )
            ELSE position(search_word IN search_text) = 0
          END
        )
        OR COALESCE(semantic_similarity, 0) >= 0.22
      )
      AND (
        normalized_category IS NULL
        OR EXISTS (
          SELECT 1
          FROM jsonb_array_elements(
            CASE
              WHEN jsonb_typeof(podcast_categories) = 'array' THEN podcast_categories
              ELSE '[]'::JSONB
            END
          ) category
          WHERE lower(btrim(COALESCE(
            category ->> 'category_name',
            category #>> '{}'
          ))) = normalized_category
        )
      )
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
            WHEN position(normalized_search IN lower(COALESCE(podcast_description, ''))) > 0 THEN 4
            WHEN position(normalized_search IN lower(COALESCE(podcast_categories::TEXT, ''))) > 0 THEN 3
            -- Every word somewhere in the show's text.
            -- (The filter already required that, short words as whole words.)
            WHEN NOT EXISTS (
              SELECT 1 FROM unnest(search_words) search_word
              WHERE position(search_word IN search_text) = 0
            ) THEN 2
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
  ),
  category_options AS (
    SELECT DISTINCT btrim(COALESCE(
      category ->> 'category_name',
      category #>> '{}'
    )) AS category_name
    FROM public.podcasts podcast
    CROSS JOIN LATERAL jsonb_array_elements(
      CASE
        WHEN jsonb_typeof(podcast.podcast_categories) = 'array'
        THEN podcast.podcast_categories
        ELSE '[]'::JSONB
      END
    ) category
    WHERE podcast.is_active IS TRUE
      AND NULLIF(btrim(COALESCE(
        category ->> 'category_name',
        category #>> '{}'
      )), '') IS NOT NULL
  ),
  contributing_workspaces AS (
    SELECT client.workspace_id
    FROM public.client_dashboard_podcasts shortlist
    JOIN public.clients client ON client.id = shortlist.client_id
    WHERE client.workspace_id IS NOT NULL
    UNION
    SELECT dashboard.workspace_id
    FROM public.prospect_dashboard_podcasts shortlist
    JOIN public.prospect_dashboards dashboard
      ON dashboard.id = shortlist.prospect_dashboard_id
    WHERE dashboard.workspace_id IS NOT NULL
    UNION
    SELECT contribution.workspace_id
    FROM public.podcast_catalog_contributions contribution
    WHERE contribution.workspace_id IS NOT NULL
  )
  SELECT jsonb_build_object(
    'items', COALESCE((
      SELECT jsonb_agg(
        jsonb_build_object(
          'podcast_id', page_item.podscan_id,
          'podcast_name', page_item.podcast_name,
          'podcast_description', page_item.podcast_description,
          'podcast_image_url', page_item.podcast_image_url,
          'podcast_url', page_item.podcast_url,
          'publisher_name', page_item.publisher_name,
          'host_name', page_item.host_name,
          'podcast_categories', page_item.podcast_categories,
          'episode_count', page_item.episode_count,
          'itunes_rating', page_item.itunes_rating,
          'spotify_rating', page_item.spotify_rating,
          'audience_size', page_item.audience_size,
          'podcast_reach_score', page_item.podcast_reach_score,
          'language', page_item.language,
          'region', page_item.region,
          'website', page_item.website,
          'rss_feed', page_item.rss_url,
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
      FROM page_items page_item
    ), '[]'::JSONB),
    'pagination', jsonb_build_object(
      'page', normalized_page,
      'page_size', normalized_page_size,
      'total', (SELECT count(*) FROM filtered),
      'total_pages', CEIL((SELECT count(*) FROM filtered)::NUMERIC / normalized_page_size)::INTEGER
    ),
    'summary', jsonb_build_object(
      'total_podcasts', (SELECT count(*) FROM catalog),
      'active_podcasts', (SELECT count(*) FROM catalog WHERE is_active IS TRUE),
      'podcasts_with_free_email', (SELECT count(*) FROM catalog WHERE free_podscan_email IS NOT NULL),
      'podcasts_with_direct_email', (SELECT count(*) FROM catalog WHERE direct_email IS NOT NULL),
      'podcasts_used_in_shortlists', (SELECT count(*) FROM catalog WHERE shortlist_uses > 0),
      'shortlist_uses', (SELECT COALESCE(sum(shortlist_uses), 0) FROM catalog),
      'contributing_workspaces', (SELECT count(*) FROM contributing_workspaces),
      'catalog_refreshed_at', (SELECT max(podscan_last_fetched_at) FROM catalog)
    ),
    'categories', COALESCE((
      SELECT jsonb_agg(category_name ORDER BY category_name)
      FROM category_options
    ), '[]'::JSONB),
    -- Most common first, so English and the United States lead their lists.
    'languages', COALESCE((
      SELECT jsonb_agg(code ORDER BY shows DESC, code)
      FROM (
        SELECT lower(btrim(language)) AS code, count(*) AS shows
        FROM catalog
        -- Only codes the page can send back (the edge function's LOCALE_CODE).
        WHERE is_active IS TRUE AND lower(btrim(language)) ~ '^[a-z]{2,3}(-[a-z0-9]{2,8})?$'
        GROUP BY 1
      ) language_options
    ), '[]'::JSONB),
    'regions', COALESCE((
      SELECT jsonb_agg(code ORDER BY shows DESC, code)
      FROM (
        SELECT lower(btrim(region)) AS code, count(*) AS shows
        FROM catalog
        WHERE is_active IS TRUE AND lower(btrim(region)) ~ '^[a-z]{2,3}(-[a-z0-9]{2,8})?$'
        GROUP BY 1
      ) region_options
    ), '[]'::JSONB)
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

COMMENT ON FUNCTION public.workspace_podcast_catalog_page_v3(
  TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, vector, TEXT, INTEGER, INTEGER
) IS
  'Service-only hybrid podcast search. Still publishing means active with an episode in the last 90 days.';
