BEGIN;

ALTER TABLE public.client_dashboard_podcasts
  ADD COLUMN IF NOT EXISTS visibility TEXT NOT NULL DEFAULT 'visible',
  ADD COLUMN IF NOT EXISTS display_order INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS is_featured BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS featured_order INTEGER,
  ADD COLUMN IF NOT EXISTS operator_notes TEXT,
  ADD COLUMN IF NOT EXISTS archived_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS archived_by UUID;

UPDATE public.client_dashboard_podcasts
SET podcast_name = 'Untitled podcast'
WHERE podcast_name IS NULL OR btrim(podcast_name) = '';

ALTER TABLE public.client_dashboard_podcasts
  ALTER COLUMN podcast_name SET NOT NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'client_dashboard_podcasts_visibility_check'
      AND conrelid = 'public.client_dashboard_podcasts'::regclass
  ) THEN
    ALTER TABLE public.client_dashboard_podcasts
      ADD CONSTRAINT client_dashboard_podcasts_visibility_check
      CHECK (visibility IN ('visible', 'hidden', 'archived'));
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'client_dashboard_podcasts_featured_order_check'
      AND conrelid = 'public.client_dashboard_podcasts'::regclass
  ) THEN
    ALTER TABLE public.client_dashboard_podcasts
      ADD CONSTRAINT client_dashboard_podcasts_featured_order_check
      CHECK (featured_order IS NULL OR featured_order >= 0);
  END IF;
END;
$$;

WITH ranked AS (
  SELECT
    id,
    ROW_NUMBER() OVER (
      PARTITION BY client_id
      ORDER BY created_at ASC NULLS LAST, id ASC
    ) - 1 AS next_display_order
  FROM public.client_dashboard_podcasts
)
UPDATE public.client_dashboard_podcasts AS shortlist
SET display_order = ranked.next_display_order
FROM ranked
WHERE shortlist.id = ranked.id
  AND shortlist.display_order = 0;

CREATE INDEX IF NOT EXISTS idx_client_dashboard_podcasts_editor_order
  ON public.client_dashboard_podcasts(client_id, visibility, display_order, id);

CREATE INDEX IF NOT EXISTS idx_client_dashboard_podcasts_featured
  ON public.client_dashboard_podcasts(client_id, featured_order, id)
  WHERE visibility = 'visible' AND is_featured = true;

CREATE OR REPLACE FUNCTION public.reorder_client_shortlist_featured_v1(
  p_client_id UUID,
  p_podcast_ids TEXT[]
)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  requested_count INTEGER := COALESCE(cardinality(p_podcast_ids), 0);
  distinct_count INTEGER := 0;
BEGIN
  IF p_client_id IS NULL OR requested_count > 6 THEN
    RAISE EXCEPTION 'invalid featured shortlist request';
  END IF;

  SELECT COUNT(DISTINCT podcast_id)
  INTO distinct_count
  FROM unnest(COALESCE(p_podcast_ids, ARRAY[]::TEXT[])) AS requested(podcast_id);

  IF distinct_count <> requested_count THEN
    RAISE EXCEPTION 'featured shortlist contains duplicate podcasts';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM unnest(COALESCE(p_podcast_ids, ARRAY[]::TEXT[])) AS requested(podcast_id)
    LEFT JOIN public.client_dashboard_podcasts AS shortlist
      ON shortlist.client_id = p_client_id
      AND shortlist.podcast_id = requested.podcast_id
      AND shortlist.visibility = 'visible'
    WHERE shortlist.id IS NULL
  ) THEN
    RAISE EXCEPTION 'featured shortlist contains an unavailable podcast';
  END IF;

  UPDATE public.client_dashboard_podcasts
  SET
    is_featured = false,
    featured_order = NULL,
    updated_at = NOW()
  WHERE client_id = p_client_id
    AND is_featured = true;

  UPDATE public.client_dashboard_podcasts AS shortlist
  SET
    is_featured = true,
    featured_order = requested.ordinality - 1,
    updated_at = NOW()
  FROM unnest(COALESCE(p_podcast_ids, ARRAY[]::TEXT[])) WITH ORDINALITY
    AS requested(podcast_id, ordinality)
  WHERE shortlist.client_id = p_client_id
    AND shortlist.podcast_id = requested.podcast_id
    AND shortlist.visibility = 'visible';

  RETURN requested_count;
END;
$$;

REVOKE ALL ON FUNCTION public.reorder_client_shortlist_featured_v1(UUID, TEXT[])
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.reorder_client_shortlist_featured_v1(UUID, TEXT[])
  TO service_role;

COMMIT;
