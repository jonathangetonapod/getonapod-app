-- Close SECURITY DEFINER exposure, and require a confirmed address to accept
-- a workspace invite.
--
--  1. Supabase grants EXECUTE on every new function in public to anon and
--     authenticated directly, and PostgreSQL grants it to PUBLIC. Most
--     SECURITY DEFINER functions here were written for the service role and
--     revoke those grants themselves, but nothing enforced it: one that
--     forgot became callable by anyone with the anon key through
--     /rest/v1/rpc, running as its owner. Going forward, functions this role
--     creates get no EXECUTE for PUBLIC, anon or authenticated by default,
--     and every existing SECURITY DEFINER function in public loses those
--     grants, except:
--       * the allowlist below: functions the browser calls through .rpc(),
--         helpers RLS policies call, and every function an earlier migration
--         explicitly granted to anon or authenticated (their grants are left
--         exactly as they are);
--       * any function a policy, column default, check constraint or view
--         depends on (read from pg_depend), so a policy created outside the
--         migrations cannot start failing with a permission error;
--       * functions that belong to an extension.
--     Every function that is revoked is granted to service_role explicitly,
--     so the edge functions keep their access whatever the defaults were.
--     scripts/check-security-definer-grants.mjs reads the allowlist from this
--     file and fails CI when a later migration adds a SECURITY DEFINER
--     function that neither revokes PUBLIC nor appears here.
--
--  2. accept_workspace_invite (20260720000100, not redefined since) checked
--     that the signed-in Auth user's email matched the invite, but not that
--     Auth had confirmed the address. It now refuses an unconfirmed address.
--     Invite links confirm the address when clicked; provision-workspace-account
--     and manage-workspace-staff create temporary-password users with
--     email_confirm: true, so neither path is affected.

BEGIN;

SELECT pg_advisory_xact_lock(
  hashtextextended('goap:security-definer-grants-and-confirmed-invites:v1', 0)
);

-- ---------------------------------------------------------------------------
-- 1a. Default privileges for functions created by the migration role.
--     PUBLIC's EXECUTE default is global in PostgreSQL, so it is revoked
--     globally as well as in public; anon and authenticated come from
--     Supabase's per-schema defaults.
-- ---------------------------------------------------------------------------
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC, anon, authenticated;
ALTER DEFAULT PRIVILEGES
  REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC;

-- ---------------------------------------------------------------------------
-- 1b. Existing SECURITY DEFINER functions.
-- ---------------------------------------------------------------------------
DO $security_definer_grants$
DECLARE
  -- security-definer-allowlist:start
  allowlist CONSTANT TEXT[] := ARRAY[
    -- Called from the browser through supabase.rpc().
    'count_unique_cached_podcasts',
    'get_client_portal_stats',
    'increment_post_views',
    -- Called by RLS policies, and granted to authenticated (and anon for
    -- is_platform_admin) by the migrations that created them.
    'can_access_client',
    'can_access_workspace',
    'can_manage_workspace',
    'current_auth_token_iat',
    'current_workspace_id',
    'is_platform_admin',
    'workspace_auth_credential_is_fresh',
    -- Explicitly granted to authenticated by 20250128000002. Kept so this
    -- migration changes no explicit grant; a candidate for a later revoke.
    'cleanup_expired_portal_data'
  ];
  -- security-definer-allowlist:end
  target RECORD;
BEGIN
  FOR target IN
    SELECT p.oid::regprocedure AS signature
    FROM pg_catalog.pg_proc AS p
    JOIN pg_catalog.pg_namespace AS n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.prosecdef
      AND p.prokind IN ('f', 'p')
      AND NOT (p.proname = ANY (allowlist))
      AND pg_catalog.pg_has_role(current_user, p.proowner, 'USAGE')
      AND NOT EXISTS (
        SELECT 1
        FROM pg_catalog.pg_depend AS d
        WHERE d.refclassid = 'pg_catalog.pg_proc'::regclass
          AND d.refobjid = p.oid
          AND (
            d.deptype = 'e'
            OR d.classid IN (
              'pg_catalog.pg_policy'::regclass,
              'pg_catalog.pg_attrdef'::regclass,
              'pg_catalog.pg_constraint'::regclass,
              'pg_catalog.pg_rewrite'::regclass
            )
          )
      )
    ORDER BY 1::text
  LOOP
    EXECUTE pg_catalog.format(
      'REVOKE EXECUTE ON FUNCTION %s FROM PUBLIC, anon, authenticated',
      target.signature
    );
    EXECUTE pg_catalog.format(
      'GRANT EXECUTE ON FUNCTION %s TO service_role',
      target.signature
    );
  END LOOP;
END;
$security_definer_grants$;

-- ---------------------------------------------------------------------------
-- 2. Invite acceptance requires a confirmed address.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.accept_workspace_invite(
  p_membership_id UUID,
  p_user_id UUID,
  p_email TEXT
)
RETURNS public.workspace_memberships
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  normalized_email TEXT := lower(btrim(p_email));
  auth_email TEXT;
  auth_has_password BOOLEAN;
  auth_email_confirmed BOOLEAN;
  membership public.workspace_memberships%ROWTYPE;
BEGIN
  IF p_membership_id IS NULL
     OR p_user_id IS NULL
     OR normalized_email IS NULL
     OR normalized_email = '' THEN
    RAISE EXCEPTION 'membership_id, user_id, and email are required'
      USING ERRCODE = '22023';
  END IF;

  SELECT
    lower(btrim(auth_user.email)),
    COALESCE(char_length(auth_user.encrypted_password), 0) > 0,
    auth_user.email_confirmed_at IS NOT NULL
  INTO auth_email, auth_has_password, auth_email_confirmed
  FROM auth.users AS auth_user
  WHERE auth_user.id = p_user_id;

  IF auth_email IS NULL OR auth_email <> normalized_email THEN
    RAISE EXCEPTION 'invite email does not match the Auth user'
      USING ERRCODE = '22023';
  END IF;

  IF NOT auth_has_password THEN
    RAISE EXCEPTION 'workspace invite password setup is required'
      USING ERRCODE = '55000';
  END IF;

  -- Holding a session for the invited address is not proof of owning it
  -- unless Auth has confirmed the address. Invite links confirm it when
  -- clicked; admin-provisioned and staff temporary-password accounts are
  -- created already confirmed (email_confirm: true).
  IF NOT COALESCE(auth_email_confirmed, false) THEN
    RAISE EXCEPTION 'workspace invite requires a confirmed sign-in address'
      USING ERRCODE = '55000';
  END IF;

  SELECT existing_membership.*
  INTO membership
  FROM public.workspace_memberships AS existing_membership
  WHERE existing_membership.id = p_membership_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'workspace invite not found'
      USING ERRCODE = 'P0002';
  END IF;

  -- Idempotent retry for the same accepted identity.
  IF membership.status = 'active'
     AND membership.user_id = p_user_id
     AND membership.email_normalized = normalized_email THEN
    RETURN membership;
  END IF;

  IF membership.status <> 'invited' THEN
    RAISE EXCEPTION 'workspace invite is not pending'
      USING ERRCODE = '55000';
  END IF;

  IF membership.email_normalized <> normalized_email THEN
    RAISE EXCEPTION 'workspace invite belongs to a different email'
      USING ERRCODE = '22023';
  END IF;

  IF membership.user_id IS NOT NULL AND membership.user_id <> p_user_id THEN
    RAISE EXCEPTION 'workspace invite belongs to a different Auth user'
      USING ERRCODE = '22023';
  END IF;

  IF membership.invite_expires_at IS NULL
     OR membership.invite_expires_at <= now() THEN
    RAISE EXCEPTION 'workspace invite has expired'
      USING ERRCODE = '55000';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.workspaces AS workspace
    WHERE workspace.id = membership.workspace_id
      AND workspace.status = 'active'
  ) THEN
    RAISE EXCEPTION 'workspace is not active'
      USING ERRCODE = '55000';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.workspace_memberships AS other_membership
    WHERE other_membership.id <> membership.id
      AND other_membership.status IN ('provisioning', 'invited', 'active', 'suspended')
      AND (
        other_membership.user_id = p_user_id
        OR other_membership.email_normalized = normalized_email
      )
  ) THEN
    RAISE EXCEPTION 'an active workspace membership already exists'
      USING ERRCODE = '23505';
  END IF;

  UPDATE public.workspace_memberships
  SET
    user_id = p_user_id,
    email_normalized = normalized_email,
    status = 'active',
    accepted_at = now(),
    accepted_by = p_user_id,
    suspended_at = NULL,
    suspended_by = NULL,
    revoked_at = NULL,
    revoked_by = NULL
  WHERE id = membership.id
  RETURNING * INTO membership;

  INSERT INTO public.workspace_audit_log (
    workspace_id,
    actor_user_id,
    action,
    entity_type,
    entity_id,
    metadata
  )
  VALUES (
    membership.workspace_id,
    p_user_id,
    'workspace.membership.accepted',
    'workspace_membership',
    membership.id,
    jsonb_build_object(
      'email', normalized_email,
      'role', membership.role
    )
  );

  RETURN membership;
END;
$$;

REVOKE ALL ON FUNCTION public.accept_workspace_invite(UUID, UUID, TEXT)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.accept_workspace_invite(UUID, UUID, TEXT)
  TO service_role;

COMMENT ON FUNCTION public.accept_workspace_invite(UUID, UUID, TEXT) IS
  'Service-role-only transactional activation of an invited workspace_membership. The Auth user must own the invited address, have a password and have a confirmed email.';

NOTIFY pgrst, 'reload schema';

COMMIT;
