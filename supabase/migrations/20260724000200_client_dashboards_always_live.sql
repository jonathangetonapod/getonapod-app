-- A configured client approval dashboard is always live. Retire the previous
-- share/unshare concept so a valid dashboard slug cannot be hidden.

BEGIN;

UPDATE public.clients
SET dashboard_enabled = true
WHERE dashboard_slug IS NOT NULL
  AND dashboard_enabled IS DISTINCT FROM true;

UPDATE public.client_dashboard_podcasts
SET
  visibility = 'archived',
  archived_at = COALESCE(archived_at, timezone('utc'::TEXT, now())),
  is_featured = false,
  featured_order = NULL,
  updated_at = timezone('utc'::TEXT, now())
WHERE visibility = 'hidden';

ALTER TABLE public.client_dashboard_podcasts
  DROP CONSTRAINT IF EXISTS client_dashboard_podcasts_visibility_check;

ALTER TABLE public.client_dashboard_podcasts
  ADD CONSTRAINT client_dashboard_podcasts_visibility_check
  CHECK (visibility IN ('visible', 'archived'));

ALTER TABLE public.clients
  ALTER COLUMN dashboard_enabled SET DEFAULT true;

ALTER TABLE public.clients
  DROP CONSTRAINT IF EXISTS clients_configured_dashboard_always_live;

ALTER TABLE public.clients
  ADD CONSTRAINT clients_configured_dashboard_always_live
  CHECK (dashboard_slug IS NULL OR dashboard_enabled);

CREATE OR REPLACE FUNCTION public.record_public_client_dashboard_view(
  p_client_id UUID
)
RETURNS VOID
LANGUAGE sql
SECURITY DEFINER
SET search_path = ''
AS $$
  UPDATE public.clients
  SET
    dashboard_view_count = COALESCE(dashboard_view_count, 0) + 1,
    dashboard_last_viewed_at = now()
  WHERE id = p_client_id
    AND dashboard_slug IS NOT NULL;
$$;

DROP FUNCTION IF EXISTS public.set_workspace_client_dashboard_visibility_v1(
  UUID, UUID, BOOLEAN, UUID, BIGINT
);

NOTIFY pgrst, 'reload schema';

COMMIT;
