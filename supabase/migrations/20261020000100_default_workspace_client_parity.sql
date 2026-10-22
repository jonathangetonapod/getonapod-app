-- Let the default platform workspace add, edit and remove its own clients.
--
-- The default workspace runs real clients, and the clients page lists them:
-- the workspace-clients list action reads the table after
-- requireWorkspaceFeatureAccess, which admits it. Every mutation goes through
-- workspace_client_operation_v2 instead, and that refused the default
-- workspace twice over: platform administrators resolved through
-- workspace_staff_actor_role_v1, which raises 'private workspace not found'
-- for it (the edge function maps any "not found" to 404 CLIENT_NOT_FOUND),
-- and other members failed the membership query's AND NOT workspace.is_default.
-- workspace_client_operation repeated the exclusion on its workspace check.
-- So the agency could see its clients and could not delete, edit or add one.
--
-- 20260728002100 opened the settings surface the same way: the default
-- workspace resolves through workspace_settings_actor_role_v1, which applies
-- the staff gate's freshness rules and admits platform administrators and
-- owner/admin members. Tenant workspaces keep the 20261011000800 path exactly.
-- The default workspace has no billing plan, so the active-client cap does not
-- apply to it.

BEGIN;

DO $default_workspace_client_prerequisites$
BEGIN
  IF to_regprocedure(
    'public.workspace_settings_actor_role_v1(uuid,uuid,bigint)'
  ) IS NULL
    OR to_regprocedure(
      'public.workspace_client_operation(text,uuid,uuid,jsonb,uuid)'
    ) IS NULL
  THEN
    RAISE EXCEPTION 'default workspace client prerequisites are missing';
  END IF;
END;
$default_workspace_client_prerequisites$;

-- workspace_client_operation already authorizes the caller (platform
-- administrator, or an active owner/admin membership that does not depend on
-- the workspace being private). Remove only its default-workspace exclusion,
-- and fail the migration if the definition has drifted.
DO $enable_default_workspace_clients$
DECLARE
  function_definition TEXT;
  restriction_count INTEGER;
  restriction_marker CONSTANT TEXT := 'AND NOT workspace.is_default';
BEGIN
  SELECT pg_get_functiondef(
    'public.workspace_client_operation(text,uuid,uuid,jsonb,uuid)'::REGPROCEDURE
  )
  INTO function_definition;

  restriction_count := (
    length(function_definition)
    - length(replace(function_definition, restriction_marker, ''))
  ) / length(restriction_marker);

  IF restriction_count <> 1 THEN
    RAISE EXCEPTION
      'workspace_client_operation had % default-workspace restrictions; expected 1',
      restriction_count;
  END IF;

  EXECUTE replace(function_definition, restriction_marker, 'AND TRUE');
END;
$enable_default_workspace_clients$;

CREATE OR REPLACE FUNCTION public.workspace_client_operation_v2(
  p_action TEXT,
  p_workspace_id UUID,
  p_client_id UUID,
  p_payload JSONB,
  p_actor_user_id UUID,
  p_token_issued_at BIGINT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  actor_email TEXT;
  actor_role TEXT;
  normalized_action TEXT := lower(btrim(COALESCE(p_action, '')));
  result JSONB;
  requested_status TEXT;
  current_status TEXT;
  active_client_count INTEGER;
  active_client_limit INTEGER;
  workspace_is_default BOOLEAN;
BEGIN
  IF normalized_action NOT IN ('list', 'create', 'update', 'delete')
    OR p_workspace_id IS NULL
    OR p_actor_user_id IS NULL
    OR p_token_issued_at IS NULL
    OR p_token_issued_at < 1
    OR p_token_issued_at > floor(EXTRACT(EPOCH FROM clock_timestamp()))::BIGINT + 300
  THEN
    RAISE EXCEPTION 'invalid workspace client operation'
      USING ERRCODE = '22023';
  END IF;

  -- Serialize client mutations per workspace before anything else touches the
  -- workspace row. Taking this first matters: the role check below holds
  -- FOR SHARE on the same row, and upgrading a share lock that a concurrent
  -- call also holds would deadlock. NO KEY UPDATE conflicts with FOR SHARE
  -- (so two creates cannot both count the same free seat) but not with the
  -- FOR KEY SHARE that foreign-key inserts elsewhere take.
  IF normalized_action IN ('create', 'update') THEN
    PERFORM 1
    FROM public.workspaces AS locked_workspace
    WHERE locked_workspace.id = p_workspace_id
    FOR NO KEY UPDATE;
  END IF;

  SELECT lower(btrim(auth_user.email))
  INTO actor_email
  FROM auth.users AS auth_user
  WHERE auth_user.id = p_actor_user_id
    AND NULLIF(btrim(auth_user.email), '') IS NOT NULL;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'workspace client actor identity is unavailable'
      USING ERRCODE = '42501';
  END IF;

  SELECT workspace.is_default
  INTO workspace_is_default
  FROM public.workspaces AS workspace
  WHERE workspace.id = p_workspace_id;

  -- The default workspace is the platform's own agency. Its operators resolve
  -- through the settings gate, which admits it under the same freshness rules;
  -- the staff gate and the membership query below both refuse it by design.
  IF COALESCE(workspace_is_default, false) THEN
    actor_role := public.workspace_settings_actor_role_v1(
      p_workspace_id,
      p_actor_user_id,
      p_token_issued_at
    );
  ELSIF public.is_platform_admin_identity(p_actor_user_id, actor_email) THEN
    actor_role := public.workspace_staff_actor_role_v1(
      p_workspace_id,
      p_actor_user_id,
      p_token_issued_at,
      true
    );
  ELSE
    SELECT membership.role
    INTO actor_role
    FROM public.workspace_memberships AS membership
    JOIN public.workspaces AS workspace
      ON workspace.id = membership.workspace_id
    JOIN auth.users AS auth_user
      ON auth_user.id = membership.user_id
      AND lower(btrim(auth_user.email)) = membership.email_normalized
    WHERE membership.workspace_id = p_workspace_id
      AND membership.user_id = p_actor_user_id
      AND membership.email_normalized = actor_email
      AND membership.status = 'active'
      AND membership.role IN ('owner', 'admin', 'member')
      AND workspace.status = 'active'
      AND NOT workspace.is_default
      AND p_token_issued_at >= membership.workspace_access_not_before_epoch
      AND p_token_issued_at >= workspace.access_not_before_epoch
      AND (
        membership.provisioning_method <> 'admin_temporary_password'
        OR (
          NOT membership.password_change_required
          AND auth_user.raw_app_meta_data ->> 'workspace_id' = p_workspace_id::TEXT
          AND auth_user.raw_app_meta_data ->> 'workspace_membership_id' = membership.id::TEXT
          AND auth_user.raw_app_meta_data ->> 'workspace_provisioning_method'
            = 'admin_temporary_password'
          AND auth_user.raw_app_meta_data ->> 'workspace_password_change_required'
            = 'false'
        )
      )
    FOR SHARE OF membership, workspace;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'active workspace staff access is required'
        USING ERRCODE = '42501';
    END IF;
  END IF;

  IF normalized_action <> 'list' AND actor_role = 'member' THEN
    RAISE EXCEPTION 'active workspace manager access is required'
      USING ERRCODE = '42501';
  END IF;

  IF normalized_action = 'list' THEN
    IF p_client_id IS NOT NULL
      OR COALESCE(p_payload, '{}'::JSONB) <> '{}'::JSONB
    THEN
      RAISE EXCEPTION 'invalid list parameters' USING ERRCODE = '22023';
    END IF;

    SELECT COALESCE(
      jsonb_agg(to_jsonb(safe_client) ORDER BY safe_client.name, safe_client.id),
      '[]'::JSONB
    )
    INTO result
    FROM (
      SELECT
        client.id,
        client.workspace_id,
        client.name,
        client.email,
        client.contact_person,
        client.linkedin_url,
        client.website,
        client.status,
        client.notes,
        client.created_at,
        client.updated_at
      FROM public.clients AS client
      WHERE client.workspace_id = p_workspace_id
    ) AS safe_client;

    RETURN result;
  END IF;

  -- Plan limit. Only a client becoming active takes a seat: creating one as
  -- active, or moving a paused or churned client to active. Paused and churned
  -- creates, edits that keep a client active, and moves away from active are
  -- never blocked, so a limit lowered after signup cannot freeze existing work.
  -- The count runs under the workspace lock taken above, so two concurrent
  -- calls cannot both claim the last seat.
  -- The default workspace has no plan, so it has no seat limit.
  IF normalized_action IN ('create', 'update') AND NOT COALESCE(workspace_is_default, false) THEN
    requested_status := NULLIF(btrim(p_payload ->> 'status'), '');

    IF requested_status = 'active' AND normalized_action = 'update' THEN
      SELECT client.status
      INTO current_status
      FROM public.clients AS client
      WHERE client.id = p_client_id
        AND client.workspace_id = p_workspace_id;
    END IF;

    IF requested_status = 'active'
      AND (normalized_action = 'create' OR current_status IS DISTINCT FROM 'active')
      AND (normalized_action = 'create' OR current_status IS NOT NULL)
    THEN
      SELECT COUNT(*)::INTEGER
      INTO active_client_count
      FROM public.clients AS client
      WHERE client.workspace_id = p_workspace_id
        AND client.status = 'active';

      SELECT COALESCE(profile.included_active_clients, 3)
      INTO active_client_limit
      FROM (SELECT 1) AS seed
      LEFT JOIN public.workspace_billing_profiles AS profile
        ON profile.workspace_id = p_workspace_id;

      IF active_client_count >= active_client_limit THEN
        RAISE EXCEPTION 'workspace client limit reached'
          USING ERRCODE = 'P0001',
            DETAIL = jsonb_build_object(
              'client_limit', active_client_limit,
              'active_clients', active_client_count
            )::TEXT;
      END IF;
    END IF;
  END IF;

  RETURN public.workspace_client_operation(
    normalized_action,
    p_workspace_id,
    p_client_id,
    p_payload,
    p_actor_user_id
  );
END;
$$;

COMMENT ON FUNCTION public.workspace_client_operation_v2(
  TEXT, UUID, UUID, JSONB, UUID, BIGINT
) IS
  'Workspace-epoch-aware client operation: every active staff role may list; owner/admin roles and the platform owner may mutate, in tenant workspaces and the default platform workspace alike. A client becoming active in a tenant workspace is refused past the plan''s included_active_clients, checked under a workspace row lock.';

REVOKE ALL ON FUNCTION public.workspace_client_operation_v2(
  TEXT, UUID, UUID, JSONB, UUID, BIGINT
) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.workspace_client_operation_v2(
  TEXT, UUID, UUID, JSONB, UUID, BIGINT
) TO service_role;

COMMIT;
