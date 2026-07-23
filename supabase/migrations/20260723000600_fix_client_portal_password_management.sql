-- Repair owner-managed client portal passwords.
--
-- The first tenant-scoped version used a PostgreSQL regular-expression
-- repetition upper bound of 256. PostgreSQL accepts at most 255, so every set
-- attempt failed before authorization with SQLSTATE 2201B. Match the exact
-- PBKDF2 verifier format already enforced by the credential table instead.
-- The original routine also delegated all authorization to the private-
-- workspace staff helper, which excluded the platform's default workspace.
-- Default-workspace owners need the same credential management capability for
-- their own clients, with the same token epoch and temporary-password fences.

BEGIN;

SELECT pg_advisory_xact_lock(
  hashtextextended('goap:client-portal-password-management:v2', 0)
);

DO $client_portal_password_prerequisites$
BEGIN
  IF to_regprocedure(
    'public.manage_client_portal_password(uuid,uuid,text,text,uuid,bigint)'
  ) IS NULL
    OR to_regprocedure(
      'public.workspace_staff_actor_role_v1(uuid,uuid,bigint,boolean)'
    ) IS NULL
  THEN
    RAISE EXCEPTION 'client portal password management prerequisites are missing';
  END IF;
END;
$client_portal_password_prerequisites$;

CREATE OR REPLACE FUNCTION public.manage_client_portal_password(
  p_client_id UUID,
  p_workspace_id UUID,
  p_password_hash TEXT,
  p_set_by TEXT,
  p_actor_user_id UUID,
  p_token_issued_at BIGINT
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  actor_email TEXT;
  actor_role TEXT;
  configured BOOLEAN := p_password_hash IS NOT NULL;
  normalized_set_by TEXT := NULLIF(btrim(p_set_by), '');
  workspace_epoch BIGINT;
  workspace_is_default BOOLEAN;
  workspace_status TEXT;
BEGIN
  IF p_client_id IS NULL
    OR p_workspace_id IS NULL
    OR p_actor_user_id IS NULL
    OR p_token_issued_at IS NULL
    OR p_token_issued_at < 1
    OR p_token_issued_at
      > floor(EXTRACT(EPOCH FROM clock_timestamp()))::BIGINT + 300
  THEN
    RAISE EXCEPTION 'client portal password actor context is invalid'
      USING ERRCODE = '22023';
  END IF;

  IF configured THEN
    IF char_length(p_password_hash) > 512
      OR p_password_hash !~
        '^pbkdf2_sha256\$[0-9]{6,7}\$[A-Za-z0-9+/]{22}==\$[A-Za-z0-9+/]{43}=$'
      OR split_part(p_password_hash, '$', 2)::BIGINT
        NOT BETWEEN 100000 AND 1000000
    THEN
      RAISE EXCEPTION 'invalid portal password verifier'
        USING ERRCODE = '22023';
    END IF;
  END IF;

  SELECT
    workspace.status,
    workspace.is_default,
    workspace.access_not_before_epoch
  INTO workspace_status, workspace_is_default, workspace_epoch
  FROM public.workspaces AS workspace
  WHERE workspace.id = p_workspace_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'workspace not found' USING ERRCODE = 'P0002';
  END IF;

  IF workspace_is_default THEN
    SELECT lower(btrim(auth_user.email))
    INTO actor_email
    FROM auth.users AS auth_user
    WHERE auth_user.id = p_actor_user_id
      AND NULLIF(btrim(auth_user.email), '') IS NOT NULL;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'workspace owner identity is unavailable'
        USING ERRCODE = '42501';
    END IF;

    -- Match the application authorization path for the owner's own workspace.
    -- Membership is stabilized before workspace, following the same lock order
    -- as tenant lifecycle operations.
    SELECT membership.role
    INTO actor_role
    FROM public.workspace_memberships AS membership
    JOIN auth.users AS auth_user
      ON auth_user.id = membership.user_id
      AND lower(btrim(auth_user.email)) = membership.email_normalized
    WHERE membership.workspace_id = p_workspace_id
      AND membership.user_id = p_actor_user_id
      AND membership.email_normalized = actor_email
      AND membership.status = 'active'
      AND membership.role = 'owner'
      AND p_token_issued_at >= membership.workspace_access_not_before_epoch
      AND (
        membership.provisioning_method <> 'admin_temporary_password'
        OR (
          NOT membership.password_change_required
          AND auth_user.raw_app_meta_data ->> 'workspace_id'
            = p_workspace_id::TEXT
          AND auth_user.raw_app_meta_data ->> 'workspace_membership_id'
            = membership.id::TEXT
          AND auth_user.raw_app_meta_data ->> 'workspace_provisioning_method'
            = 'admin_temporary_password'
          AND auth_user.raw_app_meta_data
            ->> 'workspace_password_change_required' = 'false'
        )
      )
    FOR SHARE OF membership;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'default workspace owner access is required'
        USING ERRCODE = '42501';
    END IF;

    SELECT
      workspace.status,
      workspace.is_default,
      workspace.access_not_before_epoch
    INTO workspace_status, workspace_is_default, workspace_epoch
    FROM public.workspaces AS workspace
    WHERE workspace.id = p_workspace_id
    FOR SHARE;

    IF NOT FOUND OR NOT workspace_is_default THEN
      RAISE EXCEPTION 'default workspace not found' USING ERRCODE = 'P0002';
    END IF;

    IF workspace_status <> 'active'
      OR p_token_issued_at < workspace_epoch
    THEN
      RAISE EXCEPTION 'active default workspace owner access is required'
        USING ERRCODE = '42501';
    END IF;
  ELSE
    actor_role := public.workspace_staff_actor_role_v1(
      p_workspace_id, p_actor_user_id, p_token_issued_at, true
    );
    IF actor_role NOT IN ('owner', 'platform_admin') THEN
      RAISE EXCEPTION 'workspace owner access is required'
        USING ERRCODE = '42501';
    END IF;
  END IF;

  PERFORM 1
  FROM public.clients AS client
  WHERE client.id = p_client_id
    AND client.workspace_id = p_workspace_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'workspace client not found' USING ERRCODE = 'P0002';
  END IF;

  IF configured THEN
    INSERT INTO public.client_portal_credentials (
      client_id, password_verifier, configured_at, configured_by, updated_at
    )
    VALUES (
      p_client_id, p_password_hash, now(), normalized_set_by, now()
    )
    ON CONFLICT (client_id) DO UPDATE
    SET
      password_verifier = EXCLUDED.password_verifier,
      credential_version = public.client_portal_credentials.credential_version + 1,
      configured_at = EXCLUDED.configured_at,
      configured_by = EXCLUDED.configured_by,
      updated_at = EXCLUDED.updated_at;
  ELSE
    DELETE FROM public.client_portal_credentials
    WHERE client_id = p_client_id;
  END IF;

  UPDATE public.clients
  SET
    portal_access_enabled = CASE
      WHEN configured THEN true
      ELSE portal_access_enabled
    END,
    portal_password = NULL,
    password_set_at = CASE WHEN configured THEN now() ELSE NULL END,
    password_set_by = CASE
      WHEN configured THEN normalized_set_by
      ELSE NULL
    END
  WHERE id = p_client_id
    AND workspace_id = p_workspace_id;

  DELETE FROM public.client_portal_sessions WHERE client_id = p_client_id;
  DELETE FROM public.client_portal_tokens WHERE client_id = p_client_id;

  INSERT INTO public.workspace_audit_log (
    workspace_id, actor_user_id, action, entity_type, entity_id, metadata
  )
  VALUES (
    p_workspace_id,
    p_actor_user_id,
    CASE
      WHEN configured THEN 'client.portal_password.set'
      ELSE 'client.portal_password.cleared'
    END,
    'client',
    p_client_id,
    jsonb_build_object(
      'configured', configured,
      'set_by', CASE WHEN configured THEN normalized_set_by ELSE NULL END
    )
  );

  RETURN configured;
END;
$$;

REVOKE ALL ON FUNCTION public.manage_client_portal_password(
  UUID, UUID, TEXT, TEXT, UUID, BIGINT
) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.manage_client_portal_password(
  UUID, UUID, TEXT, TEXT, UUID, BIGINT
) TO service_role;

COMMENT ON FUNCTION public.manage_client_portal_password(
  UUID, UUID, TEXT, TEXT, UUID, BIGINT
) IS 'Sets or clears a client portal verifier for a workspace owner or platform owner operating in an explicitly selected workspace.';

-- Ensure PostgREST sees the repaired overload immediately after commit.
NOTIFY pgrst, 'reload schema';

COMMIT;
