-- Authenticated workspace managers can explicitly share or unshare each client's
-- podcast approval dashboard. Keep this mutation workspace-bound, audited,
-- and unavailable to browser roles.

BEGIN;

DO $client_dashboard_visibility_prerequisites$
BEGIN
  IF to_regprocedure(
    'public.workspace_staff_actor_role_v1(uuid,uuid,bigint,boolean)'
  ) IS NULL THEN
    RAISE EXCEPTION
      'client dashboard visibility requires workspace staff authorization';
  END IF;
END;
$client_dashboard_visibility_prerequisites$;

CREATE OR REPLACE FUNCTION public.set_workspace_client_dashboard_visibility_v1(
  p_workspace_id UUID,
  p_client_id UUID,
  p_enabled BOOLEAN,
  p_actor_user_id UUID,
  p_token_issued_at BIGINT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  actor_role TEXT;
  previous_enabled BOOLEAN;
  dashboard_slug TEXT;
  result JSONB;
BEGIN
  IF p_workspace_id IS NULL
    OR p_client_id IS NULL
    OR p_enabled IS NULL
    OR p_actor_user_id IS NULL
    OR p_token_issued_at IS NULL
  THEN
    RAISE EXCEPTION 'invalid client dashboard visibility operation'
      USING ERRCODE = '22023';
  END IF;

  PERFORM pg_advisory_xact_lock(
    hashtextextended(
      'goap:client-dashboard-visibility:' || p_workspace_id::TEXT || ':' || p_client_id::TEXT,
      0
    )
  );

  actor_role := public.workspace_staff_actor_role_v1(
    p_workspace_id,
    p_actor_user_id,
    p_token_issued_at,
    true
  );

  IF actor_role NOT IN ('owner', 'admin', 'platform_admin') THEN
    RAISE EXCEPTION 'active workspace manager access is required'
      USING ERRCODE = '42501';
  END IF;

  SELECT
    COALESCE(client.dashboard_enabled, false),
    NULLIF(btrim(client.dashboard_slug), '')
  INTO previous_enabled, dashboard_slug
  FROM public.clients AS client
  JOIN public.workspaces AS workspace
    ON workspace.id = client.workspace_id
  WHERE client.id = p_client_id
    AND client.workspace_id = p_workspace_id
    AND workspace.status = 'active'
  FOR UPDATE OF client;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'workspace client not found' USING ERRCODE = 'P0002';
  END IF;

  IF p_enabled AND dashboard_slug IS NULL THEN
    RAISE EXCEPTION 'client dashboard address is not configured'
      USING ERRCODE = '22023';
  END IF;

  UPDATE public.clients AS client
  SET dashboard_enabled = p_enabled
  WHERE client.id = p_client_id
    AND client.workspace_id = p_workspace_id
  RETURNING jsonb_build_object(
    'id', client.id,
    'workspace_id', client.workspace_id,
    'dashboard_slug', client.dashboard_slug,
    'dashboard_enabled', client.dashboard_enabled,
    'updated_at', client.updated_at
  )
  INTO result;

  IF result IS NULL THEN
    RAISE EXCEPTION 'workspace client not found' USING ERRCODE = 'P0002';
  END IF;

  INSERT INTO public.workspace_audit_log (
    workspace_id,
    actor_user_id,
    action,
    entity_type,
    entity_id,
    metadata
  )
  VALUES (
    p_workspace_id,
    p_actor_user_id,
    CASE
      WHEN p_enabled THEN 'workspace.client.dashboard_shared'
      ELSE 'workspace.client.dashboard_unshared'
    END,
    'client',
    p_client_id,
    jsonb_build_object(
      'previous_enabled', previous_enabled,
      'dashboard_enabled', p_enabled,
      'dashboard_slug', dashboard_slug
    )
  );

  RETURN result;
END;
$$;

REVOKE ALL ON FUNCTION public.set_workspace_client_dashboard_visibility_v1(
  UUID, UUID, BOOLEAN, UUID, BIGINT
) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.set_workspace_client_dashboard_visibility_v1(
  UUID, UUID, BOOLEAN, UUID, BIGINT
) TO service_role;

COMMENT ON FUNCTION public.set_workspace_client_dashboard_visibility_v1(
  UUID, UUID, BOOLEAN, UUID, BIGINT
) IS
  'Shares or unshares a workspace-bound client dashboard with manager authorization and audit logging.';

NOTIFY pgrst, 'reload schema';

COMMIT;
