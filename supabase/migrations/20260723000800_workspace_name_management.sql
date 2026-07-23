-- Owner-managed operational workspace names for the private app shell.
-- Client-facing agency names remain independent white-label presentation data.

BEGIN;

DO $workspace_name_management_prerequisites$
BEGIN
  IF to_regprocedure(
    'public.workspace_staff_actor_role_v1(uuid,uuid,bigint,boolean)'
  ) IS NULL THEN
    RAISE EXCEPTION
      'workspace name management requires workspace staff authorization';
  END IF;
END;
$workspace_name_management_prerequisites$;

CREATE OR REPLACE FUNCTION public.set_workspace_name_v1(
  p_workspace_id UUID,
  p_expected_updated_at TIMESTAMPTZ,
  p_workspace_name TEXT,
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
  current_updated_at TIMESTAMPTZ;
  current_workspace_name TEXT;
  normalized_workspace_name TEXT := NULLIF(btrim(p_workspace_name), '');
  result JSONB;
BEGIN
  IF p_workspace_id IS NULL
    OR p_expected_updated_at IS NULL
    OR normalized_workspace_name IS NULL
    OR char_length(normalized_workspace_name) > 120
    OR normalized_workspace_name ~ '[[:cntrl:]]'
  THEN
    RAISE EXCEPTION 'workspace name is invalid'
      USING ERRCODE = '22023';
  END IF;

  PERFORM pg_advisory_xact_lock(
    hashtextextended('goap:workspace-name:' || p_workspace_id::TEXT, 0)
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

  SELECT workspace.updated_at, workspace.name
  INTO current_updated_at, current_workspace_name
  FROM public.workspaces AS workspace
  WHERE workspace.id = p_workspace_id
    AND workspace.status = 'active'
    AND NOT workspace.is_default
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'private workspace not found' USING ERRCODE = 'P0002';
  END IF;

  IF current_updated_at IS DISTINCT FROM p_expected_updated_at THEN
    RAISE EXCEPTION 'workspace state changed'
      USING ERRCODE = '40001';
  END IF;

  UPDATE public.workspaces AS workspace
  SET name = normalized_workspace_name
  WHERE workspace.id = p_workspace_id
    AND workspace.updated_at = p_expected_updated_at
  RETURNING jsonb_build_object(
    'id', workspace.id,
    'name', workspace.name,
    'updated_at', workspace.updated_at
  )
  INTO result;

  IF result IS NULL THEN
    RAISE EXCEPTION 'workspace state changed'
      USING ERRCODE = '40001';
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
    'workspace.identity.name_updated',
    'workspace',
    p_workspace_id,
    jsonb_build_object(
      'previous_name', current_workspace_name,
      'workspace_name', normalized_workspace_name
    )
  );

  RETURN result;
END;
$$;

REVOKE ALL ON FUNCTION public.set_workspace_name_v1(
  UUID, TIMESTAMPTZ, TEXT, UUID, BIGINT
) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.set_workspace_name_v1(
  UUID, TIMESTAMPTZ, TEXT, UUID, BIGINT
) TO service_role;

COMMENT ON FUNCTION public.set_workspace_name_v1(
  UUID, TIMESTAMPTZ, TEXT, UUID, BIGINT
) IS
  'Updates the private operational workspace name with manager authorization, optimistic concurrency, and audit logging.';

NOTIFY pgrst, 'reload schema';

COMMIT;
