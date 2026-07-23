BEGIN;

DO $default_workspace_onboarding_prerequisites$
BEGIN
  IF to_regprocedure(
    'public.is_platform_admin_identity(uuid,text)'
  ) IS NULL
    OR to_regprocedure(
      'public.workspace_staff_actor_role_v1(uuid,uuid,bigint,boolean)'
    ) IS NULL
    OR to_regprocedure(
      'public.seed_workspace_onboarding_template_v1(uuid,uuid)'
    ) IS NULL
    OR to_regprocedure(
      'public.workspace_onboarding_staff_list_v1(uuid,uuid,bigint)'
    ) IS NULL
    OR to_regprocedure(
      'public.workspace_onboarding_client_operation_v1(text,uuid,text,jsonb)'
    ) IS NULL
  THEN
    RAISE EXCEPTION 'default workspace onboarding prerequisites are missing';
  END IF;
END;
$default_workspace_onboarding_prerequisites$;

-- Resolve a real target-workspace membership before considering platform
-- management. This keeps the platform owner a normal owner/admin/member in
-- their own workspace while retaining explicit entry to client workspaces.
CREATE OR REPLACE FUNCTION public.workspace_onboarding_actor_role_v1(
  p_workspace_id UUID,
  p_actor_user_id UUID,
  p_token_issued_at BIGINT
)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  actor_email TEXT;
  actor_role TEXT;
BEGIN
  IF p_workspace_id IS NULL
    OR p_actor_user_id IS NULL
    OR p_token_issued_at IS NULL
    OR p_token_issued_at < 1
    OR p_token_issued_at > floor(EXTRACT(EPOCH FROM clock_timestamp()))::BIGINT + 300
  THEN
    RAISE EXCEPTION 'invalid workspace onboarding actor context'
      USING ERRCODE = '22023';
  END IF;

  SELECT lower(btrim(auth_user.email))
  INTO actor_email
  FROM auth.users AS auth_user
  WHERE auth_user.id = p_actor_user_id
    AND NULLIF(btrim(auth_user.email), '') IS NOT NULL;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'workspace onboarding actor identity is unavailable'
      USING ERRCODE = '42501';
  END IF;

  SELECT membership.role
  INTO actor_role
  FROM public.workspace_memberships AS membership
  JOIN public.workspaces AS workspace
    ON workspace.id = membership.workspace_id
    AND workspace.status = 'active'
  JOIN auth.users AS auth_user
    ON auth_user.id = membership.user_id
    AND lower(btrim(auth_user.email)) = membership.email_normalized
  WHERE membership.workspace_id = p_workspace_id
    AND membership.user_id = p_actor_user_id
    AND membership.email_normalized = actor_email
    AND membership.status = 'active'
    AND membership.role IN ('owner', 'admin', 'member')
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
        AND auth_user.raw_app_meta_data ->> 'workspace_password_change_required' = 'false'
      )
    )
  FOR SHARE OF membership, workspace;

  IF FOUND THEN
    RETURN actor_role;
  END IF;

  IF public.is_platform_admin_identity(p_actor_user_id, actor_email) THEN
    RETURN public.workspace_staff_actor_role_v1(
      p_workspace_id,
      p_actor_user_id,
      p_token_issued_at,
      true
    );
  END IF;

  RAISE EXCEPTION 'active workspace staff access is required'
    USING ERRCODE = '42501';
END;
$$;

-- These functions already enforce either authenticated workspace membership
-- or an unguessable onboarding capability. Remove only their legacy default-
-- workspace exclusions and fail the migration if the expected definitions
-- have drifted.
DO $enable_default_workspace_onboarding$
DECLARE
  function_signature REGPROCEDURE;
  function_definition TEXT;
  expected_restrictions INTEGER;
  restriction_count INTEGER;
  restriction_marker CONSTANT TEXT := 'AND NOT workspace.is_default';
BEGIN
  FOR function_signature, expected_restrictions IN
    SELECT patch.signature::REGPROCEDURE, patch.expected
    FROM (VALUES
      ('public.seed_workspace_onboarding_template_v1(uuid,uuid)', 1),
      ('public.workspace_onboarding_staff_list_v1(uuid,uuid,bigint)', 1),
      ('public.workspace_onboarding_client_operation_v1(text,uuid,text,jsonb)', 2)
    ) AS patch(signature, expected)
  LOOP
    SELECT pg_get_functiondef(function_signature)
    INTO function_definition;

    restriction_count := (
      length(function_definition)
      - length(replace(function_definition, restriction_marker, ''))
    ) / length(restriction_marker);

    IF restriction_count <> expected_restrictions THEN
      RAISE EXCEPTION
        'onboarding function % had % default-workspace restrictions; expected %',
        function_signature,
        restriction_count,
        expected_restrictions;
    END IF;

    EXECUTE replace(function_definition, restriction_marker, 'AND TRUE');
  END LOOP;
END;
$enable_default_workspace_onboarding$;

CREATE OR REPLACE FUNCTION public.seed_workspace_onboarding_after_insert()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF NEW.created_by IS NOT NULL THEN
    PERFORM public.seed_workspace_onboarding_template_v1(NEW.id, NEW.created_by);
  END IF;
  RETURN NEW;
END;
$$;

DO $seed_default_workspace_onboarding$
DECLARE
  target RECORD;
  seeded_template_id UUID;
BEGIN
  FOR target IN
    SELECT
      workspace.id,
      COALESCE(workspace.created_by, fallback_actor.user_id) AS actor_user_id
    FROM public.workspaces AS workspace
    LEFT JOIN LATERAL (
      SELECT membership.user_id
      FROM public.workspace_memberships AS membership
      WHERE membership.workspace_id = workspace.id
        AND membership.status = 'active'
        AND membership.role IN ('owner', 'admin')
      ORDER BY
        CASE membership.role WHEN 'owner' THEN 0 ELSE 1 END,
        membership.created_at,
        membership.id
      LIMIT 1
    ) AS fallback_actor ON true
    WHERE workspace.is_default
      AND workspace.status = 'active'
  LOOP
    IF target.actor_user_id IS NULL THEN
      RAISE EXCEPTION 'active default workspace has no onboarding seed actor';
    END IF;

    seeded_template_id := public.seed_workspace_onboarding_template_v1(
      target.id,
      target.actor_user_id
    );
    IF seeded_template_id IS NULL THEN
      RAISE EXCEPTION 'default workspace onboarding template was not seeded';
    END IF;
  END LOOP;
END;
$seed_default_workspace_onboarding$;

COMMENT ON FUNCTION public.workspace_onboarding_actor_role_v1(UUID, UUID, BIGINT) IS
  'Returns the real active workspace role first; platform management applies only when the actor has no target membership.';
COMMENT ON FUNCTION public.seed_workspace_onboarding_after_insert() IS
  'Seeds the standard onboarding template for every workspace, including the platform owner workspace.';

COMMIT;
