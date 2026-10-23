-- One row per view of a public prospect dashboard.
--
-- prospect_dashboards keeps a running view_count and last_viewed_at, which is
-- enough for "viewed 42 times" but not for "how many views this week": a
-- counter cannot be windowed after the fact. Prospect Studio's summary now
-- shows views in the last seven days, so each view is also recorded here.
--
-- Rows are written only by record_public_prospect_dashboard_view, which is
-- already behind the public capability rate limit, so a reload loop cannot
-- flood this table any faster than it could inflate the counter. Weeks before
-- this migration have no rows; the all-time counter is unchanged.

BEGIN;

SELECT pg_advisory_xact_lock(
  hashtextextended('goap:prospect-dashboard-views:v1', 0)
);

CREATE TABLE IF NOT EXISTS public.prospect_dashboard_views (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  prospect_dashboard_id UUID NOT NULL
    REFERENCES public.prospect_dashboards(id) ON DELETE CASCADE,
  viewed_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS prospect_dashboard_views_dashboard_viewed_idx
  ON public.prospect_dashboard_views (prospect_dashboard_id, viewed_at DESC);

-- Service role only. RLS on with no policies: browser roles see nothing. The
-- tenant boundary is the dashboard, which Prospect Studio has already scoped
-- to the caller's workspace before it asks for counts.
ALTER TABLE public.prospect_dashboard_views ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.prospect_dashboard_views FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, DELETE ON TABLE public.prospect_dashboard_views TO service_role;

-- Same conditions and lifecycle change as before; the view is now also logged
-- when, and only when, the counter moved.
CREATE OR REPLACE FUNCTION public.record_public_prospect_dashboard_view(
  p_dashboard_id UUID
)
RETURNS VOID
LANGUAGE sql
SECURITY DEFINER
SET search_path = ''
AS $$
  WITH counted AS (
    UPDATE public.prospect_dashboards
    SET
      view_count = COALESCE(view_count, 0) + 1,
      last_viewed_at = now(),
      lifecycle_status = CASE
        WHEN lifecycle_status IN ('ready', 'sent') THEN 'viewed'
        ELSE lifecycle_status
      END
    WHERE id = p_dashboard_id
      AND is_active
      AND content_ready
      AND published_at IS NOT NULL
    RETURNING id
  )
  INSERT INTO public.prospect_dashboard_views (prospect_dashboard_id)
  SELECT counted.id FROM counted;
$$;

REVOKE ALL ON FUNCTION public.record_public_prospect_dashboard_view(UUID)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.record_public_prospect_dashboard_view(UUID)
  TO service_role;

-- Views per dashboard since a moment, for the dashboards asked about.
CREATE OR REPLACE FUNCTION public.prospect_dashboard_view_counts_v1(
  p_dashboard_ids UUID[],
  p_since TIMESTAMPTZ
)
RETURNS TABLE (prospect_dashboard_id UUID, views BIGINT)
LANGUAGE sql
STABLE
SET search_path = ''
AS $$
  SELECT logged.prospect_dashboard_id, count(*)::BIGINT
  FROM public.prospect_dashboard_views AS logged
  WHERE logged.prospect_dashboard_id = ANY (p_dashboard_ids)
    AND logged.viewed_at >= p_since
  GROUP BY logged.prospect_dashboard_id;
$$;

REVOKE ALL ON FUNCTION public.prospect_dashboard_view_counts_v1(UUID[], TIMESTAMPTZ)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.prospect_dashboard_view_counts_v1(UUID[], TIMESTAMPTZ)
  TO service_role;

COMMENT ON TABLE public.prospect_dashboard_views IS
  'Service-only log of public prospect dashboard views, one row per counted view, for windowed view counts.';
COMMENT ON FUNCTION public.prospect_dashboard_view_counts_v1(UUID[], TIMESTAMPTZ) IS
  'Service-role-only count of prospect dashboard views since a timestamp, grouped by dashboard.';

NOTIFY pgrst, 'reload schema';

COMMIT;
