-- Owner-scoped credential management for workspace staff and client portals.
--
-- Staff resets use a durable provider claim. The membership is fenced before
-- Supabase Auth is changed, the generated temporary password is never stored,
-- and the user must replace it before workspace access is restored.
-- Client portal passwords continue to store only a PBKDF2 verifier.

BEGIN;

SELECT pg_advisory_xact_lock(
  hashtextextended('goap:workspace-owner-password-management:v1', 0)
);

DO $workspace_owner_password_prerequisites$
BEGIN
  IF to_regprocedure(
    'public.workspace_staff_actor_role_v1(uuid,uuid,bigint,boolean)'
  ) IS NULL
    OR to_regprocedure(
      'public.workspace_staff_list_v1(uuid,uuid,bigint)'
    ) IS NULL
    OR to_regprocedure(
      'public.lock_workspace_provider_lifecycle_v1(uuid)'
    ) IS NULL
    OR to_regprocedure(
      'public.workspace_membership_has_provider_claim_v1(uuid)'
    ) IS NULL
    OR to_regprocedure(
      'public.manage_client_portal_password(uuid,text,text,uuid)'
    ) IS NULL
  THEN
    RAISE EXCEPTION
      'workspace owner password management prerequisites are missing';
  END IF;
END;
$workspace_owner_password_prerequisites$;

LOCK TABLE public.workspace_account_credential_claims
  IN SHARE ROW EXCLUSIVE MODE;
LOCK TABLE public.workspace_memberships
  IN SHARE ROW EXCLUSIVE MODE;

ALTER TABLE public.workspace_account_credential_claims
  ADD COLUMN IF NOT EXISTS original_status TEXT,
  ADD COLUMN IF NOT EXISTS original_provisioning_method TEXT,
  ADD COLUMN IF NOT EXISTS original_password_change_required BOOLEAN,
  ADD COLUMN IF NOT EXISTS original_invited_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS original_invite_expires_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS original_workspace_access_not_before_epoch BIGINT;

ALTER TABLE public.workspace_account_credential_claims
  DROP CONSTRAINT IF EXISTS workspace_account_credential_claims_kind_check,
  DROP CONSTRAINT IF EXISTS workspace_account_credential_claims_reset_snapshot_check;

ALTER TABLE public.workspace_account_credential_claims
  ADD CONSTRAINT workspace_account_credential_claims_kind_check CHECK (
    claim_kind IN (
      'temporary_password_rotation',
      'initial_password_change',
      'staff_password_reset'
    )
  ) NOT VALID,
  ADD CONSTRAINT workspace_account_credential_claims_reset_snapshot_check CHECK (
    (
      claim_kind = 'staff_password_reset'
      AND original_status IN ('active', 'invited')
      AND original_provisioning_method IN (
        'platform_bootstrap',
        'email_invite',
        'admin_temporary_password'
      )
      AND original_password_change_required IS NOT NULL
      AND original_invited_at IS NOT NULL
      AND original_workspace_access_not_before_epoch IS NOT NULL
      AND original_workspace_access_not_before_epoch >= 0
    )
    OR (
      claim_kind <> 'staff_password_reset'
      AND original_status IS NULL
      AND original_provisioning_method IS NULL
      AND original_password_change_required IS NULL
      AND original_invited_at IS NULL
      AND original_invite_expires_at IS NULL
      AND original_workspace_access_not_before_epoch IS NULL
    )
  ) NOT VALID;

ALTER TABLE public.workspace_account_credential_claims
  VALIDATE CONSTRAINT workspace_account_credential_claims_kind_check;
ALTER TABLE public.workspace_account_credential_claims
  VALIDATE CONSTRAINT workspace_account_credential_claims_reset_snapshot_check;

-- Return reset only when the exact actor hierarchy and target lifecycle make
-- it safe. Tenant owners may reset admins/members. The platform owner may also
-- reset a selected workspace's owner, but nobody may reset their own account.
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
              OR (membership.role = 'owner' AND actor_role <> 'platform_admin')
              OR (actor_role = 'admin' AND membership.role <> 'member')
            THEN '[]'::JSONB
            WHEN membership.role = 'owner'
              AND membership.status = 'active'
              AND actor_role = 'platform_admin'
            THEN jsonb_build_array('reset_password')
            WHEN membership.role = 'owner'
              AND membership.status = 'invited'
              AND membership.provisioning_method = 'admin_temporary_password'
              AND membership.password_change_required
              AND actor_role = 'platform_admin'
            THEN jsonb_build_array('reset_password')
            WHEN membership.status = 'provisioning'
              AND membership.provisioning_method = 'email_invite'
            THEN jsonb_build_array('retry_invite', 'revoke')
            WHEN membership.status = 'provisioning'
              AND membership.provisioning_method = 'admin_temporary_password'
            THEN jsonb_build_array('retry_password', 'revoke')
            WHEN membership.status = 'invited'
              AND membership.provisioning_method = 'admin_temporary_password'
              AND membership.password_change_required
              AND actor_role IN ('owner', 'platform_admin')
            THEN jsonb_build_array('reset_password', 'revoke')
            WHEN membership.status = 'invited' THEN
              jsonb_build_array('revoke')
            WHEN membership.status = 'active'
              AND actor_role IN ('owner', 'platform_admin') THEN
              jsonb_build_array(
                'reset_password', 'suspend', 'update_role', 'transfer_owner'
              )
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

CREATE OR REPLACE FUNCTION public.claim_workspace_staff_password_reset_v1(
  p_workspace_id UUID,
  p_membership_id UUID,
  p_actor_user_id UUID,
  p_token_issued_at BIGINT,
  p_attempt_id UUID,
  p_execution_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  actor_role TEXT;
  auth_email TEXT;
  membership public.workspace_memberships%ROWTYPE;
BEGIN
  IF p_membership_id IS NULL
    OR p_attempt_id IS NULL
    OR p_execution_id IS NULL
    OR p_attempt_id = p_execution_id
  THEN
    RAISE EXCEPTION 'workspace password reset fields are invalid'
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
    RAISE EXCEPTION 'workspace staff password target not found'
      USING ERRCODE = 'P0002';
  END IF;

  IF membership.user_id IS NULL
    OR membership.user_id = p_actor_user_id
    OR actor_role = 'admin'
    OR (membership.role = 'owner' AND actor_role <> 'platform_admin')
  THEN
    RAISE EXCEPTION 'workspace staff password target is outside the actor role hierarchy'
      USING ERRCODE = '42501';
  END IF;

  IF NOT (
    membership.status = 'active'
    OR (
      membership.status = 'invited'
      AND membership.provisioning_method = 'admin_temporary_password'
      AND membership.password_change_required
    )
  ) THEN
    RAISE EXCEPTION 'workspace staff password target is unavailable'
      USING ERRCODE = '55000';
  END IF;

  IF public.workspace_membership_has_provider_claim_v1(membership.id) THEN
    RAISE EXCEPTION 'workspace staff password reset is busy'
      USING ERRCODE = '55P03';
  END IF;

  SELECT lower(btrim(auth_user.email))
  INTO auth_email
  FROM auth.users AS auth_user
  WHERE auth_user.id = membership.user_id
    AND auth_user.confirmed_at IS NOT NULL
    AND COALESCE(char_length(auth_user.encrypted_password), 0) > 0
    AND (
      (
        auth_user.raw_app_meta_data ->> 'workspace_id' = p_workspace_id::TEXT
        AND auth_user.raw_app_meta_data ->> 'workspace_membership_id'
          = membership.id::TEXT
      )
      OR (
        auth_user.raw_app_meta_data ->> 'workspace_id' IS NULL
        AND auth_user.raw_app_meta_data ->> 'workspace_membership_id' IS NULL
      )
    )
    AND NOT (
      (
        auth_user.raw_user_meta_data ->> 'workspace_id' IS NOT NULL
        AND auth_user.raw_user_meta_data ->> 'workspace_id'
          <> p_workspace_id::TEXT
      )
      OR (
        auth_user.raw_user_meta_data ->> 'workspace_membership_id' IS NOT NULL
        AND auth_user.raw_user_meta_data ->> 'workspace_membership_id'
          <> membership.id::TEXT
      )
    )
    AND NOT EXISTS (
      SELECT 1
      FROM public.workspace_memberships AS other_membership
      WHERE other_membership.id <> membership.id
        AND other_membership.user_id = auth_user.id
        AND other_membership.status IN (
          'provisioning', 'invited', 'active', 'suspended'
        )
    );

  IF auth_email IS DISTINCT FROM membership.email_normalized
    OR public.is_platform_admin_email(auth_email)
  THEN
    RAISE EXCEPTION 'workspace staff password Auth identity is unsafe'
      USING ERRCODE = '42501';
  END IF;

  INSERT INTO public.workspace_account_credential_claims (
    membership_id,
    attempt_id,
    execution_id,
    claim_kind,
    actor_user_id,
    acquired_at,
    review_after,
    original_status,
    original_provisioning_method,
    original_password_change_required,
    original_invited_at,
    original_invite_expires_at,
    original_workspace_access_not_before_epoch
  )
  VALUES (
    membership.id,
    p_attempt_id,
    p_execution_id,
    'staff_password_reset',
    p_actor_user_id,
    now(),
    now() + interval '15 minutes',
    membership.status,
    membership.provisioning_method,
    membership.password_change_required,
    membership.invited_at,
    membership.invite_expires_at,
    membership.workspace_access_not_before_epoch
  );

  UPDATE public.workspace_memberships
  SET
    status = 'invited',
    provisioning_method = 'admin_temporary_password',
    password_change_required = true,
    invited_at = now(),
    invite_expires_at = now() + interval '7 days',
    suspended_at = NULL,
    suspended_by = NULL,
    workspace_access_not_before_epoch = GREATEST(
      workspace_access_not_before_epoch,
      floor(EXTRACT(EPOCH FROM clock_timestamp()))::BIGINT + 1
    )
  WHERE id = membership.id
  RETURNING * INTO membership;

  RETURN jsonb_build_object(
    'membership', to_jsonb(membership),
    'attempt_id', p_attempt_id,
    'execution_id', p_execution_id
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.cancel_workspace_staff_password_reset_v1(
  p_workspace_id UUID,
  p_membership_id UUID,
  p_actor_user_id UUID,
  p_token_issued_at BIGINT,
  p_attempt_id UUID,
  p_execution_id UUID
)
RETURNS public.workspace_memberships
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  claim public.workspace_account_credential_claims%ROWTYPE;
  membership public.workspace_memberships%ROWTYPE;
BEGIN
  PERFORM public.lock_workspace_provider_lifecycle_v1(p_workspace_id);
  PERFORM public.workspace_staff_actor_role_v1(
    p_workspace_id, p_actor_user_id, p_token_issued_at, true
  );

  SELECT existing_membership.*
  INTO membership
  FROM public.workspace_memberships AS existing_membership
  WHERE existing_membership.id = p_membership_id
    AND existing_membership.workspace_id = p_workspace_id
  FOR UPDATE;

  SELECT existing_claim.*
  INTO claim
  FROM public.workspace_account_credential_claims AS existing_claim
  WHERE existing_claim.membership_id = p_membership_id
  FOR UPDATE;

  IF NOT FOUND
    OR claim.claim_kind <> 'staff_password_reset'
    OR claim.actor_user_id <> p_actor_user_id
    OR claim.attempt_id <> p_attempt_id
    OR claim.execution_id <> p_execution_id
  THEN
    RAISE EXCEPTION 'workspace staff password reset claim is unavailable'
      USING ERRCODE = '55000';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM auth.users AS auth_user
    WHERE auth_user.id = membership.user_id
      AND (
        auth_user.raw_app_meta_data ->> 'workspace_credential_attempt_id'
          = p_attempt_id::TEXT
        OR auth_user.raw_app_meta_data ->> 'workspace_credential_execution_id'
          = p_execution_id::TEXT
      )
  ) THEN
    RAISE EXCEPTION 'workspace staff password reset requires reconciliation'
      USING ERRCODE = '55000';
  END IF;

  UPDATE public.workspace_memberships
  SET
    status = claim.original_status,
    provisioning_method = claim.original_provisioning_method,
    password_change_required = claim.original_password_change_required,
    invited_at = claim.original_invited_at,
    invite_expires_at = claim.original_invite_expires_at,
    workspace_access_not_before_epoch = claim.original_workspace_access_not_before_epoch
  WHERE id = membership.id
  RETURNING * INTO membership;

  DELETE FROM public.workspace_account_credential_claims
  WHERE membership_id = membership.id
    AND attempt_id = p_attempt_id
    AND execution_id = p_execution_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'workspace staff password reset claim was lost'
      USING ERRCODE = '55000';
  END IF;

  RETURN membership;
END;
$$;

CREATE OR REPLACE FUNCTION public.complete_workspace_staff_password_reset_v1(
  p_workspace_id UUID,
  p_membership_id UUID,
  p_actor_user_id UUID,
  p_token_issued_at BIGINT,
  p_attempt_id UUID,
  p_execution_id UUID,
  p_credential_version BIGINT
)
RETURNS public.workspace_memberships
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  actor_role TEXT;
  auth_email TEXT;
  auth_attempt_id TEXT;
  auth_execution_id TEXT;
  auth_membership_id TEXT;
  auth_password_change_required TEXT;
  auth_provisioning_method TEXT;
  auth_version TEXT;
  auth_workspace_id TEXT;
  claim public.workspace_account_credential_claims%ROWTYPE;
  membership public.workspace_memberships%ROWTYPE;
BEGIN
  IF p_credential_version IS NULL OR p_credential_version < 1 THEN
    RAISE EXCEPTION 'workspace staff credential version is invalid'
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

  IF NOT FOUND
    OR membership.user_id IS NULL
    OR membership.user_id = p_actor_user_id
    OR actor_role = 'admin'
    OR (membership.role = 'owner' AND actor_role <> 'platform_admin')
    OR membership.status <> 'invited'
    OR membership.provisioning_method <> 'admin_temporary_password'
    OR NOT membership.password_change_required
  THEN
    RAISE EXCEPTION 'workspace staff password target is unavailable'
      USING ERRCODE = '42501';
  END IF;

  SELECT existing_claim.*
  INTO claim
  FROM public.workspace_account_credential_claims AS existing_claim
  WHERE existing_claim.membership_id = membership.id
  FOR UPDATE;

  IF NOT FOUND
    OR claim.claim_kind <> 'staff_password_reset'
    OR claim.actor_user_id <> p_actor_user_id
    OR claim.attempt_id <> p_attempt_id
    OR claim.execution_id <> p_execution_id
  THEN
    RAISE EXCEPTION 'workspace staff password reset claim is unavailable'
      USING ERRCODE = '55000';
  END IF;

  SELECT
    lower(btrim(auth_user.email)),
    auth_user.raw_app_meta_data ->> 'workspace_id',
    auth_user.raw_app_meta_data ->> 'workspace_membership_id',
    auth_user.raw_app_meta_data ->> 'workspace_provisioning_method',
    auth_user.raw_app_meta_data ->> 'workspace_password_change_required',
    auth_user.raw_app_meta_data ->> 'workspace_credential_version',
    auth_user.raw_app_meta_data ->> 'workspace_credential_attempt_id',
    auth_user.raw_app_meta_data ->> 'workspace_credential_execution_id'
  INTO
    auth_email,
    auth_workspace_id,
    auth_membership_id,
    auth_provisioning_method,
    auth_password_change_required,
    auth_version,
    auth_attempt_id,
    auth_execution_id
  FROM auth.users AS auth_user
  WHERE auth_user.id = membership.user_id
    AND auth_user.confirmed_at IS NOT NULL
    AND COALESCE(char_length(auth_user.encrypted_password), 0) > 0;

  IF auth_email IS DISTINCT FROM membership.email_normalized
    OR auth_workspace_id IS DISTINCT FROM p_workspace_id::TEXT
    OR auth_membership_id IS DISTINCT FROM membership.id::TEXT
    OR auth_provisioning_method IS DISTINCT FROM 'admin_temporary_password'
    OR auth_password_change_required IS DISTINCT FROM 'true'
    OR auth_version IS DISTINCT FROM p_credential_version::TEXT
    OR auth_attempt_id IS DISTINCT FROM p_attempt_id::TEXT
    OR auth_execution_id IS DISTINCT FROM p_execution_id::TEXT
    OR public.is_platform_admin_email(auth_email)
  THEN
    RAISE EXCEPTION 'workspace staff password Auth identity is unsafe'
      USING ERRCODE = '42501';
  END IF;

  UPDATE public.workspace_memberships
  SET
    invited_at = now(),
    invite_expires_at = now() + interval '7 days',
    workspace_access_not_before_epoch = GREATEST(
      workspace_access_not_before_epoch,
      floor(EXTRACT(EPOCH FROM clock_timestamp()))::BIGINT + 1
    )
  WHERE id = membership.id
  RETURNING * INTO membership;

  INSERT INTO public.workspace_audit_log (
    workspace_id, actor_user_id, action, entity_type, entity_id, metadata
  )
  VALUES (
    p_workspace_id,
    p_actor_user_id,
    'workspace.staff.password_reset',
    'workspace_membership',
    membership.id,
    jsonb_build_object(
      'email', membership.email_normalized,
      'role', membership.role,
      'credential_version', p_credential_version
    )
  );

  DELETE FROM public.workspace_account_credential_claims
  WHERE membership_id = membership.id
    AND attempt_id = p_attempt_id
    AND execution_id = p_execution_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'workspace staff password reset claim was lost'
      USING ERRCODE = '55000';
  END IF;

  RETURN membership;
END;
$$;

-- Tenant-scoped portal password mutation. The legacy four-argument overload
-- remains temporarily available to the platform-only admin surface.
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
  actor_role TEXT;
  configured BOOLEAN := p_password_hash IS NOT NULL;
  normalized_set_by TEXT := NULLIF(btrim(p_set_by), '');
BEGIN
  IF p_client_id IS NULL OR p_workspace_id IS NULL OR p_actor_user_id IS NULL THEN
    RAISE EXCEPTION 'client, workspace, and actor are required'
      USING ERRCODE = '22023';
  END IF;

  IF configured THEN
    IF char_length(p_password_hash) > 512
      OR p_password_hash !~ '^pbkdf2_sha256\$[0-9]{6,7}\$[^$]{16,128}\$[^$]{32,256}$'
      OR split_part(p_password_hash, '$', 2)::BIGINT NOT BETWEEN 100000 AND 1000000
    THEN
      RAISE EXCEPTION 'invalid portal password verifier'
        USING ERRCODE = '22023';
    END IF;
  END IF;

  actor_role := public.workspace_staff_actor_role_v1(
    p_workspace_id, p_actor_user_id, p_token_issued_at, true
  );
  IF actor_role NOT IN ('owner', 'platform_admin') THEN
    RAISE EXCEPTION 'workspace owner access is required'
      USING ERRCODE = '42501';
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
    portal_access_enabled = CASE WHEN configured THEN true ELSE portal_access_enabled END,
    portal_password = NULL,
    password_set_at = CASE WHEN configured THEN now() ELSE NULL END,
    password_set_by = CASE WHEN configured THEN normalized_set_by ELSE NULL END
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

REVOKE ALL ON FUNCTION public.claim_workspace_staff_password_reset_v1(
  UUID, UUID, UUID, BIGINT, UUID, UUID
) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.claim_workspace_staff_password_reset_v1(
  UUID, UUID, UUID, BIGINT, UUID, UUID
) TO service_role;

REVOKE ALL ON FUNCTION public.cancel_workspace_staff_password_reset_v1(
  UUID, UUID, UUID, BIGINT, UUID, UUID
) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.cancel_workspace_staff_password_reset_v1(
  UUID, UUID, UUID, BIGINT, UUID, UUID
) TO service_role;

REVOKE ALL ON FUNCTION public.complete_workspace_staff_password_reset_v1(
  UUID, UUID, UUID, BIGINT, UUID, UUID, BIGINT
) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.complete_workspace_staff_password_reset_v1(
  UUID, UUID, UUID, BIGINT, UUID, UUID, BIGINT
) TO service_role;

REVOKE ALL ON FUNCTION public.manage_client_portal_password(
  UUID, UUID, TEXT, TEXT, UUID, BIGINT
) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.manage_client_portal_password(
  UUID, UUID, TEXT, TEXT, UUID, BIGINT
) TO service_role;

COMMENT ON FUNCTION public.claim_workspace_staff_password_reset_v1(
  UUID, UUID, UUID, BIGINT, UUID, UUID
) IS 'Fences a workspace staff membership before a provider-side temporary-password reset.';
COMMENT ON FUNCTION public.cancel_workspace_staff_password_reset_v1(
  UUID, UUID, UUID, BIGINT, UUID, UUID
) IS 'Restores the exact pre-reset membership snapshot only when Auth was not changed.';
COMMENT ON FUNCTION public.complete_workspace_staff_password_reset_v1(
  UUID, UUID, UUID, BIGINT, UUID, UUID, BIGINT
) IS 'Finalizes an owner-issued one-time staff password without storing plaintext credentials.';
COMMENT ON FUNCTION public.manage_client_portal_password(
  UUID, UUID, TEXT, TEXT, UUID, BIGINT
) IS 'Sets or clears a tenant client portal verifier for the owning workspace owner.';

COMMIT;
