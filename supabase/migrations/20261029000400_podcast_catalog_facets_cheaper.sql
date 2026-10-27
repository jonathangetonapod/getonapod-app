-- A cheaper catalogue facets refresh.
--
-- The first version checked "is this show on a shortlist" with a correlated
-- EXISTS against every shortlist row for each of 73K shows (about 190M
-- comparisons), and read every show's categories JSON to list the
-- categories. On production it ran past 40s every 15 minutes, on the same
-- disk the Podcast Database page reads from. Shortlisted and verified shows
-- are now joined from pre-aggregated sets, and categories come from the
-- indexed category_keys column. Same output.

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
  usage_rows AS MATERIALIZED (
    SELECT shortlist.podcast_id, client.workspace_id
    FROM public.client_dashboard_podcasts shortlist
    JOIN public.clients client ON client.id = shortlist.client_id
    UNION ALL
    SELECT shortlist.podcast_id, dashboard.workspace_id
    FROM public.prospect_dashboard_podcasts shortlist
    JOIN public.prospect_dashboards dashboard
      ON dashboard.id = shortlist.prospect_dashboard_id
  ),
  shortlisted AS (
    SELECT DISTINCT podcast_id FROM usage_rows
  ),
  verified AS (
    SELECT DISTINCT direct_contact.podcast_id
    FROM public.podcast_direct_contacts direct_contact
    WHERE direct_contact.verification_status = 'verified'
  ),
  contributing_workspaces AS (
    SELECT workspace_id FROM usage_rows WHERE workspace_id IS NOT NULL
    UNION
    SELECT contribution.workspace_id
    FROM public.podcast_catalog_contributions contribution
    WHERE contribution.workspace_id IS NOT NULL
  ),
  shows AS MATERIALIZED (
    SELECT
      podcast.is_active,
      podcast.podscan_last_fetched_at,
      podcast.language,
      CASE WHEN lower(btrim(podcast.region)) = 'uk' THEN 'gb' ELSE podcast.region END AS region,
      podcast.category_keys,
      lower(btrim(COALESCE(podcast.podscan_email, '')))
        ~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' AS has_free_email,
      verified.podcast_id IS NOT NULL AS has_direct_email,
      shortlisted.podcast_id IS NOT NULL AS on_shortlist
    FROM public.podcasts podcast
    LEFT JOIN verified ON verified.podcast_id = podcast.id
    LEFT JOIN shortlisted ON shortlisted.podcast_id = podcast.podscan_id
  ),
  category_options AS (
    SELECT DISTINCT category_key AS category_name
    FROM shows
    CROSS JOIN LATERAL unnest(shows.category_keys) category_key
    WHERE shows.is_active IS TRUE
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
