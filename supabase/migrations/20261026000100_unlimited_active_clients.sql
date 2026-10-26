-- Unlimited active clients, for every workspace on every plan.
--
-- 20261011000800 refused a client becoming active once a workspace had
-- workspace_billing_profiles.included_active_clients of them (3 with no
-- profile). Both paid plans carry 1, so subscribing lowered the limit, and the
-- per-client price beside it was never billed. The product decision is now no
-- seat limit at all.
--
-- workspace_client_operation_v2 is the 20261020000100 definition with the
-- plan-limit block removed, along with the workspace row lock that existed only
-- so two concurrent calls could not both count the last free seat. Validation,
-- actor resolution, the default-workspace path and delegation to
-- workspace_client_operation are unchanged. included_active_clients stays on
-- the billing tables; nothing reads it any more.

BEGIN;


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
  'Workspace-epoch-aware client operation: every active staff role may list; owner/admin roles and the platform owner may mutate, in tenant workspaces and the default platform workspace alike. There is no limit on active clients.';

REVOKE ALL ON FUNCTION public.workspace_client_operation_v2(
  TEXT, UUID, UUID, JSONB, UUID, BIGINT
) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.workspace_client_operation_v2(
  TEXT, UUID, UUID, JSONB, UUID, BIGINT
) TO service_role;

COMMIT;
