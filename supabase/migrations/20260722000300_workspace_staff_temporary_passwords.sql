-- Let workspace owners/admins (and the platform owner in an explicitly
-- selected workspace) provision non-owner staff with a one-time temporary
-- password. Password generation remains provider-side; plaintext credentials
-- are never stored in Postgres.

BEGIN;

DO $workspace_staff_temporary_password_prerequisites$
BEGIN
  IF to_regprocedure(
    'public.workspace_staff_actor_role_v1(uuid,uuid,bigint,boolean)'
  ) IS NULL
    OR to_regprocedure(
      'public.workspace_staff_list_v1(uuid,uuid,bigint)'
    ) IS NULL
    OR to_regprocedure(
      'public.begin_workspace_staff_invite_v1(uuid,text,text,text,uuid,bigint)'
    ) IS NULL
    OR to_regprocedure(
      'public.find_workspace_staff_invite_auth_user_v1(uuid,uuid,uuid,bigint,uuid)'
    ) IS NULL
    OR to_regprocedure(
      'public.release_workspace_invite_delivery_claim(uuid,uuid)'
    ) IS NULL
  THEN
    RAISE EXCEPTION
      'workspace staff temporary passwords require platform-owner workspace management';
  END IF;
END;
$workspace_staff_temporary_password_prerequisites$;

-- The browser receives only the action that is safe for the exact pending
-- provisioning method. A temporary-password row can never be retried through
-- the email-invite provider path (or vice versa).
CREATE OR REPLACE FUNCTION public.workspace_staff_list_v1(
  p_workspace_id UUID,
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
  result JSONB;
BEGIN
  actor_role := public.workspace_staff_actor_role_v1(
    p_workspace_id,
    p_actor_user_id,
    p_token_issued_at,
    true
  );

  SELECT jsonb_build_object(
    'workspace', jsonb_build_object(
      'id', workspace.id,
      'name', workspace.name,
      'status', workspace.status
    ),
    'capabilities', jsonb_build_object(
      'read_only', false,
      'invite_roles', CASE actor_role
        WHEN 'owner' THEN jsonb_build_array('admin', 'member')
        WHEN 'platform_admin' THEN jsonb_build_array('admin', 'member')
        WHEN 'admin' THEN jsonb_build_array('member')
        ELSE '[]'::JSONB
      END,
      'can_generate_password', actor_role IN (
        'owner', 'admin', 'platform_admin'
      ),
      'can_update_roles', actor_role IN ('owner', 'platform_admin'),
      'can_transfer_owner', actor_role IN ('owner', 'platform_admin')
    ),
    'members', COALESCE((
      SELECT jsonb_agg(
        jsonb_build_object(
          'id', membership.id,
          'email', membership.email_normalized,
          'full_name', membership.full_name,
          'role', membership.role,
          'status', membership.status,
          'setup_method', membership.provisioning_method,
          'invited_at', membership.invited_at,
          'invite_expires_at', membership.invite_expires_at,
          'accepted_at', membership.accepted_at,
          'suspended_at', membership.suspended_at,
          'pending_review', claim_state.pending_review,
          'allowed_actions', CASE
            WHEN claim_state.pending_review
              OR membership.user_id = p_actor_user_id
              OR membership.role = 'owner'
              OR (actor_role = 'admin' AND membership.role <> 'member')
            THEN '[]'::JSONB
            WHEN membership.status = 'provisioning'
              AND membership.provisioning_method = 'email_invite'
            THEN jsonb_build_array('retry_invite', 'revoke')
            WHEN membership.status = 'provisioning'
              AND membership.provisioning_method = 'admin_temporary_password'
            THEN jsonb_build_array('retry_password', 'revoke')
            WHEN membership.status = 'invited' THEN
              jsonb_build_array('revoke')
            WHEN membership.status = 'active'
              AND actor_role IN ('owner', 'platform_admin') THEN
              jsonb_build_array('suspend', 'update_role', 'transfer_owner')
            WHEN membership.status = 'active' THEN
              jsonb_build_array('suspend')
            WHEN membership.status = 'suspended'
              AND actor_role IN ('owner', 'platform_admin') THEN
              jsonb_build_array('reactivate', 'revoke', 'update_role')
            WHEN membership.status = 'suspended' THEN
              jsonb_build_array('reactivate', 'revoke')
            ELSE '[]'::JSONB
          END
        )
        ORDER BY
          CASE membership.role WHEN 'owner' THEN 0 WHEN 'admin' THEN 1 ELSE 2 END,
          membership.full_name NULLS LAST,
          membership.email_normalized,
          membership.id
      )
      FROM public.workspace_memberships AS membership
      CROSS JOIN LATERAL (
        SELECT (
          EXISTS (
            SELECT 1
            FROM public.workspace_invite_delivery_claims AS invite_claim
            WHERE invite_claim.membership_id = membership.id
          ) OR EXISTS (
            SELECT 1
            FROM public.workspace_auth_lifecycle_claims AS lifecycle_claim
            WHERE lifecycle_claim.membership_id = membership.id
          ) OR EXISTS (
            SELECT 1
            FROM public.workspace_account_credential_claims AS credential_claim
            WHERE credential_claim.membership_id = membership.id
          )
        ) AS pending_review
      ) AS claim_state
      WHERE membership.workspace_id = p_workspace_id
        AND (
          membership.status <> 'revoked'
          OR claim_state.pending_review
        )
    ), '[]'::JSONB)
  )
  INTO result
  FROM public.workspaces AS workspace
  WHERE workspace.id = p_workspace_id;

  IF result IS NULL THEN
    RAISE EXCEPTION 'private workspace not found' USING ERRCODE = 'P0002';
  END IF;

  RETURN result;
END;
$$;

-- Reuse the fully serialized staff invitation preflight, then atomically bind
-- the pending row to the temporary-password provisioning method before the
-- transaction becomes visible.
CREATE OR REPLACE FUNCTION public.begin_workspace_staff_password_account_v1(
  p_workspace_id UUID,
  p_email TEXT,
  p_full_name TEXT,
  p_role TEXT,
  p_actor_user_id UUID,
  p_token_issued_at BIGINT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  membership public.workspace_memberships%ROWTYPE;
  provisioning JSONB;
BEGIN
  provisioning := public.begin_workspace_staff_invite_v1(
    p_workspace_id,
    p_email,
    p_full_name,
    p_role,
    p_actor_user_id,
    p_token_issued_at
  );

  UPDATE public.workspace_memberships
  SET provisioning_method = 'admin_temporary_password'
  WHERE id = (provisioning #>> '{membership,id}')::UUID
    AND workspace_id = p_workspace_id
    AND status = 'provisioning'
    AND provisioning_method = 'email_invite'
    AND user_id IS NULL
    AND NOT password_change_required
  RETURNING * INTO membership;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'workspace staff password provisioning is invalid'
      USING ERRCODE = '55000';
  END IF;

  INSERT INTO public.workspace_audit_log (
    workspace_id, actor_user_id, action, entity_type, entity_id, metadata
  )
  VALUES (
    p_workspace_id,
    p_actor_user_id,
    'workspace.staff.temporary_password_provisioning_started',
    'workspace_membership',
    membership.id,
    jsonb_build_object(
      'email', membership.email_normalized,
      'role', membership.role
    )
  );

  RETURN jsonb_build_object(
    'workspace', provisioning -> 'workspace',
    'membership', to_jsonb(membership)
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.claim_workspace_staff_password_delivery_v1(
  p_workspace_id UUID,
  p_membership_id UUID,
  p_actor_user_id UUID,
  p_token_issued_at BIGINT,
  p_lock_token UUID
)
RETURNS public.workspace_memberships
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  actor_role TEXT;
  existing_claim public.workspace_invite_delivery_claims%ROWTYPE;
  membership public.workspace_memberships%ROWTYPE;
BEGIN
  IF p_membership_id IS NULL OR p_lock_token IS NULL THEN
    RAISE EXCEPTION 'membership_id and lock_token are required'
      USING ERRCODE = '22023';
  END IF;

  PERFORM public.lock_workspace_provider_lifecycle_v1(p_workspace_id);

  actor_role := public.workspace_staff_actor_role_v1(
    p_workspace_id, p_actor_user_id, p_token_issued_at, true
  );

  SELECT existing_membership.*
  INTO membership
  FROM public.workspace_memberships AS existing_membership
  WHERE existing_membership.id = p_membership_id
    AND existing_membership.workspace_id = p_workspace_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'workspace staff password account not found'
      USING ERRCODE = 'P0002';
  END IF;

  IF membership.role = 'owner'
    OR membership.user_id = p_actor_user_id
    OR (actor_role = 'admin' AND membership.role <> 'member')
  THEN
    RAISE EXCEPTION 'workspace staff target is outside the actor role hierarchy'
      USING ERRCODE = '42501';
  END IF;

  IF membership.status <> 'provisioning'
    OR membership.provisioning_method <> 'admin_temporary_password'
    OR membership.user_id IS NOT NULL
    OR membership.password_change_required
  THEN
    RAISE EXCEPTION 'workspace staff password account is not provisioning'
      USING ERRCODE = '55000';
  END IF;

  SELECT claim.*
  INTO existing_claim
  FROM public.workspace_invite_delivery_claims AS claim
  WHERE claim.membership_id = membership.id
  FOR UPDATE;

  IF FOUND AND existing_claim.lock_token IS DISTINCT FROM p_lock_token THEN
    RAISE EXCEPTION 'workspace staff password delivery is busy'
      USING ERRCODE = '55P03';
  END IF;

  IF FOUND AND (
    existing_claim.claim_kind <> 'deliver'
    OR existing_claim.actor_user_id <> p_actor_user_id
  ) THEN
    RAISE EXCEPTION 'workspace staff password token was reused inconsistently'
      USING ERRCODE = '22023';
  END IF;

  IF FOUND THEN
    RETURN membership;
  END IF;

  INSERT INTO public.workspace_invite_delivery_claims (
    membership_id, lock_token, claim_kind, actor_user_id, acquired_at, review_after
  )
  VALUES (
    membership.id,
    p_lock_token,
    'deliver',
    p_actor_user_id,
    now(),
    now() + interval '15 minutes'
  );

  RETURN membership;
END;
$$;

CREATE OR REPLACE FUNCTION public.finalize_workspace_staff_password_account_v1(
  p_workspace_id UUID,
  p_membership_id UUID,
  p_actor_user_id UUID,
  p_token_issued_at BIGINT,
  p_lock_token UUID,
  p_auth_user_id UUID
)
RETURNS public.workspace_memberships
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  actor_role TEXT;
  auth_confirmed_at TIMESTAMPTZ;
  auth_created_at TIMESTAMPTZ;
  auth_email TEXT;
  auth_has_password BOOLEAN;
  auth_last_sign_in_at TIMESTAMPTZ;
  auth_membership_id TEXT;
  auth_password_change_required TEXT;
  auth_provisioning_method TEXT;
  auth_workspace_id TEXT;
  auth_credential_version TEXT;
  auth_attempt_id TEXT;
  auth_execution_id TEXT;
  claim public.workspace_invite_delivery_claims%ROWTYPE;
  membership public.workspace_memberships%ROWTYPE;
BEGIN
  IF p_membership_id IS NULL OR p_lock_token IS NULL OR p_auth_user_id IS NULL THEN
    RAISE EXCEPTION 'workspace staff password finalization fields are required'
      USING ERRCODE = '22023';
  END IF;

  PERFORM public.lock_workspace_provider_lifecycle_v1(p_workspace_id);

  actor_role := public.workspace_staff_actor_role_v1(
    p_workspace_id, p_actor_user_id, p_token_issued_at, true
  );

  SELECT existing_membership.*
  INTO membership
  FROM public.workspace_memberships AS existing_membership
  WHERE existing_membership.id = p_membership_id
    AND existing_membership.workspace_id = p_workspace_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'workspace staff password account not found'
      USING ERRCODE = 'P0002';
  END IF;

  IF membership.role = 'owner'
    OR membership.user_id = p_actor_user_id
    OR (actor_role = 'admin' AND membership.role <> 'member')
  THEN
    RAISE EXCEPTION 'workspace staff target is outside the actor role hierarchy'
      USING ERRCODE = '42501';
  END IF;

  SELECT
    lower(btrim(auth_user.email)),
    auth_user.created_at,
    auth_user.confirmed_at,
    auth_user.last_sign_in_at,
    COALESCE(char_length(auth_user.encrypted_password), 0) > 0,
    auth_user.raw_app_meta_data ->> 'workspace_id',
    auth_user.raw_app_meta_data ->> 'workspace_membership_id',
    auth_user.raw_app_meta_data ->> 'workspace_provisioning_method',
    auth_user.raw_app_meta_data ->> 'workspace_password_change_required',
    auth_user.raw_app_meta_data ->> 'workspace_credential_version',
    auth_user.raw_app_meta_data ->> 'workspace_credential_attempt_id',
    auth_user.raw_app_meta_data ->> 'workspace_credential_execution_id'
  INTO
    auth_email,
    auth_created_at,
    auth_confirmed_at,
    auth_last_sign_in_at,
    auth_has_password,
    auth_workspace_id,
    auth_membership_id,
    auth_provisioning_method,
    auth_password_change_required,
    auth_credential_version,
    auth_attempt_id,
    auth_execution_id
  FROM auth.users AS auth_user
  WHERE auth_user.id = p_auth_user_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'workspace staff password Auth identity is not ready'
      USING ERRCODE = '55000';
  END IF;

  IF auth_workspace_id IS NULL
    OR auth_membership_id IS NULL
    OR auth_provisioning_method IS NULL
    OR auth_password_change_required IS NULL
    OR auth_credential_version IS NULL
    OR auth_attempt_id IS NULL
    OR auth_execution_id IS NULL
  THEN
    RAISE EXCEPTION 'workspace staff password Auth identity is not ready'
      USING ERRCODE = '55000';
  END IF;

  IF membership.status = 'invited'
    AND membership.user_id = p_auth_user_id
    AND membership.provisioning_method = 'admin_temporary_password'
    AND membership.password_change_required
  THEN
    IF auth_email IS NOT DISTINCT FROM membership.email_normalized
      AND auth_confirmed_at IS NOT NULL
      AND auth_has_password
      AND auth_workspace_id IS NOT DISTINCT FROM membership.workspace_id::TEXT
      AND auth_membership_id IS NOT DISTINCT FROM membership.id::TEXT
      AND auth_provisioning_method IS NOT DISTINCT FROM 'admin_temporary_password'
      AND auth_password_change_required IS NOT DISTINCT FROM 'true'
      AND auth_credential_version IS NOT DISTINCT FROM '1'
      AND auth_attempt_id IS NOT DISTINCT FROM p_lock_token::TEXT
      AND auth_execution_id IS NOT DISTINCT FROM p_lock_token::TEXT
      AND NOT public.is_platform_admin_email(auth_email)
    THEN
      RETURN membership;
    END IF;

    RAISE EXCEPTION 'workspace staff password Auth identity is unsafe'
      USING ERRCODE = '42501';
  END IF;

  IF membership.status = 'provisioning'
    AND (auth_confirmed_at IS NULL OR NOT auth_has_password)
  THEN
    RAISE EXCEPTION 'workspace staff password Auth identity is not ready'
      USING ERRCODE = '55000';
  END IF;

  IF membership.status <> 'provisioning'
    OR membership.provisioning_method <> 'admin_temporary_password'
    OR membership.user_id IS NOT NULL
    OR membership.password_change_required
  THEN
    RAISE EXCEPTION 'workspace staff password account is not provisioning'
      USING ERRCODE = '55000';
  END IF;

  SELECT existing_claim.*
  INTO claim
  FROM public.workspace_invite_delivery_claims AS existing_claim
  WHERE existing_claim.membership_id = membership.id
  FOR UPDATE;

  IF NOT FOUND
    OR claim.lock_token <> p_lock_token
    OR claim.actor_user_id <> p_actor_user_id
    OR claim.claim_kind <> 'deliver'
  THEN
    RAISE EXCEPTION 'workspace staff password delivery claim is required'
      USING ERRCODE = '55000';
  END IF;

  IF auth_email IS NULL
    OR auth_created_at IS NULL
    OR auth_email IS DISTINCT FROM membership.email_normalized
    OR auth_created_at < membership.created_at - interval '1 minute'
    OR auth_confirmed_at IS NULL
    OR auth_last_sign_in_at IS NOT NULL
    OR NOT auth_has_password
    OR auth_workspace_id IS DISTINCT FROM membership.workspace_id::TEXT
    OR auth_membership_id IS DISTINCT FROM membership.id::TEXT
    OR auth_provisioning_method IS DISTINCT FROM 'admin_temporary_password'
    OR auth_password_change_required IS DISTINCT FROM 'true'
    OR auth_credential_version IS DISTINCT FROM '1'
    OR auth_attempt_id IS DISTINCT FROM p_lock_token::TEXT
    OR auth_execution_id IS DISTINCT FROM p_lock_token::TEXT
    OR public.is_platform_admin_email(auth_email)
  THEN
    RAISE EXCEPTION 'workspace staff password Auth identity is unsafe'
      USING ERRCODE = '42501';
  END IF;

  UPDATE public.workspace_memberships
  SET
    user_id = p_auth_user_id,
    status = 'invited',
    provisioning_method = 'admin_temporary_password',
    password_change_required = true,
    workspace_access_not_before_epoch = floor(
      EXTRACT(EPOCH FROM clock_timestamp())
    )::BIGINT,
    invited_at = now(),
    invite_expires_at = now() + interval '7 days'
  WHERE id = membership.id
    AND workspace_id = p_workspace_id
    AND status = 'provisioning'
  RETURNING * INTO membership;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'workspace staff password finalization failed'
      USING ERRCODE = '55000';
  END IF;

  INSERT INTO public.workspace_audit_log (
    workspace_id, actor_user_id, action, entity_type, entity_id, metadata
  )
  VALUES (
    p_workspace_id,
    p_actor_user_id,
    'workspace.staff.temporary_password_issued',
    'workspace_membership',
    membership.id,
    jsonb_build_object(
      'email', membership.email_normalized,
      'role', membership.role,
      'credential_version', 1
    )
  );

  DELETE FROM public.workspace_invite_delivery_claims
  WHERE membership_id = membership.id
    AND lock_token = p_lock_token;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'workspace staff password delivery claim was lost'
      USING ERRCODE = '55000';
  END IF;

  RETURN membership;
END;
$$;

CREATE OR REPLACE FUNCTION public.cancel_workspace_staff_password_account_v1(
  p_workspace_id UUID,
  p_membership_id UUID,
  p_actor_user_id UUID,
  p_token_issued_at BIGINT,
  p_lock_token UUID
)
RETURNS public.workspace_memberships
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  actor_role TEXT;
  claim public.workspace_invite_delivery_claims%ROWTYPE;
  membership public.workspace_memberships%ROWTYPE;
BEGIN
  IF p_membership_id IS NULL OR p_lock_token IS NULL THEN
    RAISE EXCEPTION 'workspace staff password cancellation fields are required'
      USING ERRCODE = '22023';
  END IF;

  PERFORM public.lock_workspace_provider_lifecycle_v1(p_workspace_id);

  actor_role := public.workspace_staff_actor_role_v1(
    p_workspace_id, p_actor_user_id, p_token_issued_at, true
  );

  SELECT existing_membership.*
  INTO membership
  FROM public.workspace_memberships AS existing_membership
  WHERE existing_membership.id = p_membership_id
    AND existing_membership.workspace_id = p_workspace_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'workspace staff password account not found'
      USING ERRCODE = 'P0002';
  END IF;

  IF membership.role = 'owner'
    OR membership.user_id = p_actor_user_id
    OR (actor_role = 'admin' AND membership.role <> 'member')
  THEN
    RAISE EXCEPTION 'workspace staff target is outside the actor role hierarchy'
      USING ERRCODE = '42501';
  END IF;

  IF membership.status <> 'provisioning'
    OR membership.provisioning_method <> 'admin_temporary_password'
    OR membership.user_id IS NOT NULL
    OR membership.password_change_required
  THEN
    RAISE EXCEPTION 'workspace staff password account cannot be cancelled'
      USING ERRCODE = '55000';
  END IF;

  SELECT existing_claim.*
  INTO claim
  FROM public.workspace_invite_delivery_claims AS existing_claim
  WHERE existing_claim.membership_id = membership.id
  FOR UPDATE;

  IF NOT FOUND
    OR claim.claim_kind <> 'deliver'
    OR claim.lock_token <> p_lock_token
    OR claim.actor_user_id <> p_actor_user_id
  THEN
    RAISE EXCEPTION 'workspace staff password delivery claim is required'
      USING ERRCODE = '55000';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM auth.users AS auth_user
    WHERE auth_user.id = membership.user_id
      OR auth_user.raw_user_meta_data ->> 'workspace_membership_id'
        = membership.id::TEXT
      OR auth_user.raw_app_meta_data ->> 'workspace_membership_id'
        = membership.id::TEXT
  ) THEN
    RAISE EXCEPTION 'workspace staff password Auth cleanup requires reconciliation'
      USING ERRCODE = '55000';
  END IF;

  UPDATE public.workspace_memberships
  SET
    status = 'revoked',
    password_change_required = false,
    workspace_access_not_before_epoch = GREATEST(
      workspace_access_not_before_epoch,
      floor(EXTRACT(EPOCH FROM clock_timestamp()))::BIGINT + 1
    ),
    invite_expires_at = NULL,
    suspended_at = NULL,
    suspended_by = NULL,
    revoked_at = now(),
    revoked_by = p_actor_user_id
  WHERE id = membership.id
    AND workspace_id = p_workspace_id
    AND status = 'provisioning'
  RETURNING * INTO membership;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'workspace staff password cancellation failed'
      USING ERRCODE = '55000';
  END IF;

  INSERT INTO public.workspace_audit_log (
    workspace_id, actor_user_id, action, entity_type, entity_id, metadata
  )
  VALUES (
    p_workspace_id,
    p_actor_user_id,
    'workspace.staff.temporary_password_provisioning_cancelled',
    'workspace_membership',
    membership.id,
    jsonb_build_object(
      'email', membership.email_normalized,
      'role', membership.role
    )
  );

  DELETE FROM public.workspace_invite_delivery_claims
  WHERE membership_id = membership.id
    AND lock_token = p_lock_token;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'workspace staff password delivery claim was lost'
      USING ERRCODE = '55000';
  END IF;

  RETURN membership;
END;
$$;

REVOKE ALL ON FUNCTION public.workspace_staff_list_v1(
  UUID, UUID, BIGINT
) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.begin_workspace_staff_password_account_v1(
  UUID, TEXT, TEXT, TEXT, UUID, BIGINT
) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.claim_workspace_staff_password_delivery_v1(
  UUID, UUID, UUID, BIGINT, UUID
) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.finalize_workspace_staff_password_account_v1(
  UUID, UUID, UUID, BIGINT, UUID, UUID
) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.cancel_workspace_staff_password_account_v1(
  UUID, UUID, UUID, BIGINT, UUID
) FROM PUBLIC, anon, authenticated, service_role;

GRANT EXECUTE ON FUNCTION public.workspace_staff_list_v1(
  UUID, UUID, BIGINT
) TO service_role;
GRANT EXECUTE ON FUNCTION public.begin_workspace_staff_password_account_v1(
  UUID, TEXT, TEXT, TEXT, UUID, BIGINT
) TO service_role;
GRANT EXECUTE ON FUNCTION public.claim_workspace_staff_password_delivery_v1(
  UUID, UUID, UUID, BIGINT, UUID
) TO service_role;
GRANT EXECUTE ON FUNCTION public.finalize_workspace_staff_password_account_v1(
  UUID, UUID, UUID, BIGINT, UUID, UUID
) TO service_role;
GRANT EXECUTE ON FUNCTION public.cancel_workspace_staff_password_account_v1(
  UUID, UUID, UUID, BIGINT, UUID
) TO service_role;

COMMENT ON FUNCTION public.begin_workspace_staff_password_account_v1(
  UUID, TEXT, TEXT, TEXT, UUID, BIGINT
) IS
  'Begins a workspace-authorized non-owner staff account whose generated temporary password must be replaced at first sign-in.';
COMMENT ON FUNCTION public.claim_workspace_staff_password_delivery_v1(
  UUID, UUID, UUID, BIGINT, UUID
) IS
  'Claims one exact temporary-password Auth provisioning attempt under the workspace owner/admin/platform hierarchy.';
COMMENT ON FUNCTION public.finalize_workspace_staff_password_account_v1(
  UUID, UUID, UUID, BIGINT, UUID, UUID
) IS
  'Binds an exact generated-password Auth identity to its staff membership without storing the plaintext password.';
COMMENT ON FUNCTION public.cancel_workspace_staff_password_account_v1(
  UUID, UUID, UUID, BIGINT, UUID
) IS
  'Revokes a failed staff password provisioning row only after exact Auth cleanup is proven.';

COMMIT;
