-- Manual workspace-account provisioning with fail-closed temporary credentials.
-- Temporary-password memberships remain non-active until the user changes the
-- password, all pre-change refresh sessions are revoked, and a fresh access
-- token is issued after the recorded workspace-access epoch.

BEGIN;

SELECT pg_advisory_xact_lock(hashtextextended('goap:manual-workspace-accounts:v1', 0));

ALTER TABLE public.workspace_memberships
  ADD COLUMN IF NOT EXISTS provisioning_method TEXT,
  ADD COLUMN IF NOT EXISTS password_change_required BOOLEAN,
  ADD COLUMN IF NOT EXISTS workspace_access_not_before_epoch BIGINT;

UPDATE public.workspace_memberships AS membership
SET provisioning_method = CASE
  WHEN workspace.is_default THEN 'platform_bootstrap'
  ELSE 'email_invite'
END
FROM public.workspaces AS workspace
WHERE workspace.id = membership.workspace_id
  AND membership.provisioning_method IS NULL;

UPDATE public.workspace_memberships
SET
  password_change_required = COALESCE(password_change_required, false),
  workspace_access_not_before_epoch = COALESCE(workspace_access_not_before_epoch, 0)
WHERE password_change_required IS NULL
   OR workspace_access_not_before_epoch IS NULL;

ALTER TABLE public.workspace_memberships
  ALTER COLUMN provisioning_method SET DEFAULT 'email_invite',
  ALTER COLUMN provisioning_method SET NOT NULL,
  ALTER COLUMN password_change_required SET DEFAULT false,
  ALTER COLUMN password_change_required SET NOT NULL,
  ALTER COLUMN workspace_access_not_before_epoch SET DEFAULT 0,
  ALTER COLUMN workspace_access_not_before_epoch SET NOT NULL;

ALTER TABLE public.workspace_memberships
  DROP CONSTRAINT IF EXISTS workspace_memberships_provisioning_method_check,
  DROP CONSTRAINT IF EXISTS workspace_memberships_password_change_state_check,
  DROP CONSTRAINT IF EXISTS workspace_memberships_access_epoch_check;

ALTER TABLE public.workspace_memberships
  ADD CONSTRAINT workspace_memberships_provisioning_method_check CHECK (
    provisioning_method IN (
      'platform_bootstrap',
      'email_invite',
      'admin_temporary_password'
    )
  ) NOT VALID,
  ADD CONSTRAINT workspace_memberships_password_change_state_check CHECK (
    (
      password_change_required
      AND provisioning_method = 'admin_temporary_password'
      AND status = 'invited'
      AND user_id IS NOT NULL
    )
    OR (
      NOT password_change_required
      AND NOT (
        provisioning_method = 'admin_temporary_password'
        AND status = 'invited'
      )
    )
  ) NOT VALID,
  ADD CONSTRAINT workspace_memberships_access_epoch_check CHECK (
    workspace_access_not_before_epoch >= 0
  ) NOT VALID;

ALTER TABLE public.workspace_memberships
  VALIDATE CONSTRAINT workspace_memberships_provisioning_method_check;
ALTER TABLE public.workspace_memberships
  VALIDATE CONSTRAINT workspace_memberships_password_change_state_check;
ALTER TABLE public.workspace_memberships
  VALIDATE CONSTRAINT workspace_memberships_access_epoch_check;

CREATE TABLE public.workspace_account_credential_claims (
  membership_id UUID NOT NULL,
  attempt_id UUID NOT NULL,
  execution_id UUID NOT NULL,
  claim_kind TEXT NOT NULL,
  actor_user_id UUID NOT NULL,
  acquired_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  review_after TIMESTAMPTZ NOT NULL,
  CONSTRAINT workspace_account_credential_claims_pkey PRIMARY KEY (membership_id),
  CONSTRAINT workspace_account_credential_claims_membership_fkey FOREIGN KEY (membership_id)
    REFERENCES public.workspace_memberships(id) ON DELETE RESTRICT,
  CONSTRAINT workspace_account_credential_claims_attempt_key UNIQUE (attempt_id),
  CONSTRAINT workspace_account_credential_claims_execution_key UNIQUE (execution_id),
  CONSTRAINT workspace_account_credential_claims_kind_check CHECK (
    claim_kind IN ('temporary_password_rotation', 'initial_password_change')
  ),
  CONSTRAINT workspace_account_credential_claims_review_window_check CHECK (
    review_after > acquired_at
  )
);

ALTER TABLE public.workspace_account_credential_claims ENABLE ROW LEVEL SECURITY;
REVOKE ALL PRIVILEGES ON TABLE public.workspace_account_credential_claims
  FROM PUBLIC, anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION public.advance_workspace_access_epoch_on_disable()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  IF OLD.status = 'active' AND NEW.status <> 'active' THEN
    NEW.workspace_access_not_before_epoch := GREATEST(
      NEW.workspace_access_not_before_epoch,
      floor(EXTRACT(EPOCH FROM clock_timestamp()))::BIGINT + 1
    );
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS workspace_memberships_advance_access_epoch
  ON public.workspace_memberships;
CREATE TRIGGER workspace_memberships_advance_access_epoch
  BEFORE UPDATE OF status ON public.workspace_memberships
  FOR EACH ROW
  EXECUTE FUNCTION public.advance_workspace_access_epoch_on_disable();

REVOKE ALL ON FUNCTION public.advance_workspace_access_epoch_on_disable()
  FROM PUBLIC, anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION public.current_auth_token_iat()
RETURNS BIGINT
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT CASE
    WHEN COALESCE(auth.jwt() ->> 'iat', '') ~ '^[0-9]{1,12}$'
      THEN (auth.jwt() ->> 'iat')::BIGINT
    ELSE NULL
  END;
$$;

CREATE OR REPLACE FUNCTION public.workspace_auth_credential_is_fresh(
  p_membership_id UUID
)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT auth.role() = 'service_role' OR EXISTS (
    SELECT 1
    FROM public.workspace_memberships AS membership
    JOIN auth.users AS auth_user
      ON auth_user.id = membership.user_id
      AND lower(btrim(auth_user.email)) = membership.email_normalized
    WHERE membership.id = p_membership_id
      AND membership.user_id = auth.uid()
      AND (
        membership.provisioning_method <> 'admin_temporary_password'
        OR (
          auth.jwt() -> 'app_metadata' ->> 'workspace_id' = membership.workspace_id::TEXT
          AND auth_user.raw_app_meta_data ->> 'workspace_id' = membership.workspace_id::TEXT
          AND auth.jwt() -> 'app_metadata' ->> 'workspace_membership_id' = membership.id::TEXT
          AND auth_user.raw_app_meta_data ->> 'workspace_membership_id' = membership.id::TEXT
          AND auth.jwt() -> 'app_metadata' ->> 'workspace_provisioning_method' = 'admin_temporary_password'
          AND auth_user.raw_app_meta_data ->> 'workspace_provisioning_method' = 'admin_temporary_password'
          AND auth.jwt() -> 'app_metadata' ->> 'workspace_password_change_required'
            = membership.password_change_required::TEXT
          AND auth.jwt() -> 'app_metadata' ->> 'workspace_password_change_required'
            = auth_user.raw_app_meta_data ->> 'workspace_password_change_required'
          AND COALESCE(auth.jwt() -> 'app_metadata' ->> 'workspace_credential_version', '')
            ~ '^[0-9]{1,18}$'
          AND auth.jwt() -> 'app_metadata' ->> 'workspace_credential_version'
            = auth_user.raw_app_meta_data ->> 'workspace_credential_version'
          AND auth.jwt() -> 'app_metadata' ->> 'workspace_credential_attempt_id'
            = auth_user.raw_app_meta_data ->> 'workspace_credential_attempt_id'
          AND COALESCE(
            auth.jwt() -> 'app_metadata' ->> 'workspace_credential_execution_id',
            ''
          ) ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
          AND auth.jwt() -> 'app_metadata' ->> 'workspace_credential_execution_id'
            = auth_user.raw_app_meta_data ->> 'workspace_credential_execution_id'
        )
      )
  );
$$;

CREATE OR REPLACE FUNCTION public.current_workspace_id()
RETURNS UUID
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  selected_workspace_id UUID;
  token_iat BIGINT := public.current_auth_token_iat();
BEGIN
  SELECT membership.workspace_id
  INTO selected_workspace_id
  FROM public.workspace_memberships AS membership
  JOIN public.workspaces AS workspace
    ON workspace.id = membership.workspace_id
  JOIN auth.users AS auth_user
    ON auth_user.id = membership.user_id
    AND lower(btrim(auth_user.email)) = membership.email_normalized
  WHERE membership.user_id = auth.uid()
    AND membership.status = 'active'
    AND workspace.status = 'active'
    AND token_iat IS NOT NULL
    AND token_iat >= membership.workspace_access_not_before_epoch
    AND public.workspace_auth_credential_is_fresh(membership.id)
  ORDER BY
    CASE membership.role
      WHEN 'owner' THEN 0
      WHEN 'admin' THEN 1
      ELSE 2
    END,
    membership.accepted_at NULLS LAST,
    membership.created_at,
    membership.id
  LIMIT 1;

  IF selected_workspace_id IS NOT NULL THEN
    RETURN selected_workspace_id;
  END IF;

  IF auth.role() = 'service_role' OR public.is_platform_admin() THEN
    SELECT workspace.id
    INTO selected_workspace_id
    FROM public.workspaces AS workspace
    WHERE workspace.is_default
      AND workspace.status = 'active'
    ORDER BY workspace.created_at, workspace.id
    LIMIT 1;
  END IF;

  RETURN selected_workspace_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.can_access_workspace(
  p_workspace_id UUID
)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT
    auth.role() = 'service_role'
    OR public.is_platform_admin()
    OR EXISTS (
      SELECT 1
      FROM public.workspace_memberships AS membership
      JOIN public.workspaces AS workspace
        ON workspace.id = membership.workspace_id
      JOIN auth.users AS auth_user
        ON auth_user.id = membership.user_id
        AND lower(btrim(auth_user.email)) = membership.email_normalized
      WHERE membership.workspace_id = p_workspace_id
        AND membership.user_id = auth.uid()
        AND membership.status = 'active'
        AND workspace.status = 'active'
        AND public.current_auth_token_iat() IS NOT NULL
        AND public.current_auth_token_iat() >= membership.workspace_access_not_before_epoch
        AND public.workspace_auth_credential_is_fresh(membership.id)
    );
$$;

CREATE OR REPLACE FUNCTION public.can_manage_workspace(
  p_workspace_id UUID
)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT
    auth.role() = 'service_role'
    OR public.is_platform_admin()
    OR EXISTS (
      SELECT 1
      FROM public.workspace_memberships AS membership
      JOIN public.workspaces AS workspace
        ON workspace.id = membership.workspace_id
      JOIN auth.users AS auth_user
        ON auth_user.id = membership.user_id
        AND lower(btrim(auth_user.email)) = membership.email_normalized
      WHERE membership.workspace_id = p_workspace_id
        AND membership.user_id = auth.uid()
        AND membership.status = 'active'
        AND membership.role IN ('owner', 'admin')
        AND workspace.status = 'active'
        AND public.current_auth_token_iat() IS NOT NULL
        AND public.current_auth_token_iat() >= membership.workspace_access_not_before_epoch
        AND public.workspace_auth_credential_is_fresh(membership.id)
    );
$$;

DROP POLICY IF EXISTS workspace_memberships_authenticated_select
  ON public.workspace_memberships;
CREATE POLICY workspace_memberships_authenticated_select
  ON public.workspace_memberships
  AS PERMISSIVE
  FOR SELECT
  TO authenticated
  USING (
    public.is_platform_admin()
    OR (
      user_id = auth.uid()
      AND public.current_auth_token_iat() IS NOT NULL
      AND public.current_auth_token_iat() >= workspace_access_not_before_epoch
      AND public.workspace_auth_credential_is_fresh(id)
    )
  );

DROP POLICY IF EXISTS workspace_memberships_authenticated_select_isolation
  ON public.workspace_memberships;
CREATE POLICY workspace_memberships_authenticated_select_isolation
  ON public.workspace_memberships
  AS RESTRICTIVE
  FOR SELECT
  TO authenticated
  USING (
    public.is_platform_admin()
    OR (
      user_id = auth.uid()
      AND public.current_auth_token_iat() IS NOT NULL
      AND public.current_auth_token_iat() >= workspace_access_not_before_epoch
      AND public.workspace_auth_credential_is_fresh(id)
    )
  );

CREATE OR REPLACE FUNCTION public.begin_workspace_password_account(
  p_email TEXT,
  p_full_name TEXT,
  p_workspace_name TEXT,
  p_workspace_slug TEXT,
  p_actor_user_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  membership public.workspace_memberships%ROWTYPE;
  provisioning JSONB;
  workspace public.workspaces%ROWTYPE;
BEGIN
  provisioning := public.begin_workspace_invite(
    p_email,
    p_full_name,
    p_workspace_name,
    p_workspace_slug,
    p_actor_user_id
  );

  SELECT existing_membership.*
  INTO membership
  FROM public.workspace_memberships AS existing_membership
  WHERE existing_membership.id = (provisioning -> 'membership' ->> 'id')::UUID
  FOR UPDATE;

  SELECT existing_workspace.*
  INTO workspace
  FROM public.workspaces AS existing_workspace
  WHERE existing_workspace.id = membership.workspace_id
  FOR SHARE;

  IF membership.status <> 'provisioning'
    OR workspace.is_default
  THEN
    RAISE EXCEPTION 'manual workspace account provisioning is invalid'
      USING ERRCODE = '55000';
  END IF;

  UPDATE public.workspace_memberships
  SET provisioning_method = 'admin_temporary_password'
  WHERE id = membership.id
  RETURNING * INTO membership;

  RETURN jsonb_build_object(
    'workspace', to_jsonb(workspace),
    'membership', to_jsonb(membership)
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.finalize_workspace_password_account(
  p_membership_id UUID,
  p_actor_user_id UUID,
  p_lock_token UUID,
  p_auth_user_id UUID
)
RETURNS public.workspace_memberships
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  actor_email TEXT;
  auth_email TEXT;
  auth_created_at TIMESTAMPTZ;
  auth_confirmed_at TIMESTAMPTZ;
  auth_last_sign_in_at TIMESTAMPTZ;
  auth_has_password BOOLEAN;
  auth_workspace_id TEXT;
  auth_membership_id TEXT;
  auth_provisioning_method TEXT;
  auth_password_change_required TEXT;
  auth_credential_version TEXT;
  auth_attempt_id TEXT;
  auth_execution_id TEXT;
  delivery_lock_token UUID;
  delivery_claim_kind TEXT;
  membership public.workspace_memberships%ROWTYPE;
BEGIN
  IF p_membership_id IS NULL
    OR p_actor_user_id IS NULL
    OR p_lock_token IS NULL
    OR p_auth_user_id IS NULL
  THEN
    RAISE EXCEPTION 'manual workspace account fields are required'
      USING ERRCODE = '22023';
  END IF;

  SELECT lower(btrim(auth_user.email))
  INTO actor_email
  FROM auth.users AS auth_user
  WHERE auth_user.id = p_actor_user_id
    AND NULLIF(btrim(auth_user.email), '') IS NOT NULL;

  IF NOT FOUND
    OR NOT public.is_platform_admin_identity(p_actor_user_id, actor_email)
  THEN
    RAISE EXCEPTION 'platform administrator access is required'
      USING ERRCODE = '42501';
  END IF;

  SELECT existing_membership.*
  INTO membership
  FROM public.workspace_memberships AS existing_membership
  WHERE existing_membership.id = p_membership_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'workspace account not found' USING ERRCODE = 'P0002';
  END IF;

  IF membership.status = 'invited'
    AND membership.user_id = p_auth_user_id
    AND membership.provisioning_method = 'admin_temporary_password'
    AND membership.password_change_required
  THEN
    IF EXISTS (
      SELECT 1
      FROM auth.users AS auth_user
      WHERE auth_user.id = p_auth_user_id
        AND lower(btrim(auth_user.email)) = membership.email_normalized
        AND auth_user.raw_app_meta_data ->> 'workspace_id' = membership.workspace_id::TEXT
        AND auth_user.raw_app_meta_data ->> 'workspace_membership_id' = membership.id::TEXT
        AND auth_user.raw_app_meta_data ->> 'workspace_provisioning_method' = 'admin_temporary_password'
        AND auth_user.raw_app_meta_data ->> 'workspace_password_change_required' = 'true'
        AND auth_user.raw_app_meta_data ->> 'workspace_credential_version' = '1'
        AND auth_user.raw_app_meta_data ->> 'workspace_credential_attempt_id' = p_lock_token::TEXT
        AND auth_user.raw_app_meta_data ->> 'workspace_credential_execution_id' = p_lock_token::TEXT
    ) THEN
      RETURN membership;
    END IF;

    RAISE EXCEPTION 'manual workspace Auth identity is unsafe'
      USING ERRCODE = '42501';
  END IF;

  IF membership.status <> 'provisioning' THEN
    RAISE EXCEPTION 'workspace account is not provisioning' USING ERRCODE = '55000';
  END IF;

  SELECT claim.lock_token, claim.claim_kind
  INTO delivery_lock_token, delivery_claim_kind
  FROM public.workspace_invite_delivery_claims AS claim
  WHERE claim.membership_id = membership.id
  FOR UPDATE;

  IF NOT FOUND
    OR delivery_lock_token IS DISTINCT FROM p_lock_token
    OR delivery_claim_kind <> 'deliver'
  THEN
    RAISE EXCEPTION 'workspace account provisioning claim is required'
      USING ERRCODE = '55000';
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

  IF NOT FOUND
    OR auth_email IS DISTINCT FROM membership.email_normalized
    OR auth_created_at IS NULL
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
    RAISE EXCEPTION 'manual workspace Auth identity is unsafe'
      USING ERRCODE = '42501';
  END IF;

  UPDATE public.workspace_memberships
  SET
    user_id = p_auth_user_id,
    status = 'invited',
    provisioning_method = 'admin_temporary_password',
    password_change_required = true,
    workspace_access_not_before_epoch = floor(EXTRACT(EPOCH FROM clock_timestamp()))::BIGINT,
    invited_at = now(),
    invite_expires_at = now() + interval '7 days'
  WHERE id = membership.id
    AND status = 'provisioning'
  RETURNING * INTO membership;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'manual workspace account finalization failed'
      USING ERRCODE = '55000';
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
    membership.workspace_id,
    p_actor_user_id,
    'workspace.membership.temporary_password_issued',
    'workspace_membership',
    membership.id,
    jsonb_build_object(
      'email', membership.email_normalized,
      'role', membership.role,
      'credential_version', 1
    )
  );

  DELETE FROM public.workspace_invite_delivery_claims AS claim
  WHERE claim.membership_id = membership.id
    AND claim.lock_token = p_lock_token;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'workspace account provisioning claim was lost'
      USING ERRCODE = '55000';
  END IF;

  RETURN membership;
END;
$$;

CREATE OR REPLACE FUNCTION public.cancel_workspace_password_account_provisioning(
  p_membership_id UUID,
  p_actor_user_id UUID,
  p_lock_token UUID
)
RETURNS public.workspace_memberships
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  actor_email TEXT;
  claim public.workspace_invite_delivery_claims%ROWTYPE;
  membership public.workspace_memberships%ROWTYPE;
BEGIN
  SELECT lower(btrim(auth_user.email))
  INTO actor_email
  FROM auth.users AS auth_user
  WHERE auth_user.id = p_actor_user_id
    AND NULLIF(btrim(auth_user.email), '') IS NOT NULL;

  IF NOT FOUND
    OR NOT public.is_platform_admin_identity(p_actor_user_id, actor_email)
  THEN
    RAISE EXCEPTION 'platform administrator access is required'
      USING ERRCODE = '42501';
  END IF;

  SELECT existing_membership.*
  INTO membership
  FROM public.workspace_memberships AS existing_membership
  WHERE existing_membership.id = p_membership_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'workspace account not found' USING ERRCODE = 'P0002';
  END IF;

  IF membership.status = 'revoked'
    AND membership.provisioning_method = 'admin_temporary_password'
  THEN
    RETURN membership;
  END IF;

  IF membership.status <> 'provisioning'
    OR membership.provisioning_method <> 'admin_temporary_password'
    OR membership.user_id IS NOT NULL
  THEN
    RAISE EXCEPTION 'manual workspace account cannot be cancelled'
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
  THEN
    RAISE EXCEPTION 'workspace account provisioning claim is required'
      USING ERRCODE = '55000';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM auth.users AS auth_user
    WHERE auth_user.raw_app_meta_data ->> 'workspace_membership_id' = membership.id::TEXT
      AND auth_user.raw_app_meta_data ->> 'workspace_provisioning_method' = 'admin_temporary_password'
      AND auth_user.raw_app_meta_data ->> 'workspace_credential_attempt_id' = p_lock_token::TEXT
  ) THEN
    RAISE EXCEPTION 'manual workspace Auth cleanup requires reconciliation'
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
    revoked_at = now(),
    revoked_by = p_actor_user_id,
    invite_expires_at = NULL
  WHERE id = membership.id
  RETURNING * INTO membership;

  UPDATE public.workspaces
  SET status = 'archived'
  WHERE id = membership.workspace_id
    AND NOT is_default;

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
    p_actor_user_id,
    'workspace.membership.manual_provisioning_cancelled',
    'workspace_membership',
    membership.id,
    jsonb_build_object('email', membership.email_normalized)
  );

  DELETE FROM public.workspace_invite_delivery_claims
  WHERE membership_id = membership.id
    AND lock_token = p_lock_token;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'workspace account provisioning claim was lost'
      USING ERRCODE = '55000';
  END IF;

  RETURN membership;
END;
$$;

CREATE OR REPLACE FUNCTION public.claim_workspace_password_account_revocation(
  p_membership_id UUID,
  p_actor_user_id UUID,
  p_lock_token UUID
)
RETURNS public.workspace_memberships
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  abandoned_credential_kind TEXT;
  actor_email TEXT;
  bound_auth_email TEXT;
  credential_claim public.workspace_account_credential_claims%ROWTYPE;
  delivery_claim public.workspace_invite_delivery_claims%ROWTYPE;
  membership public.workspace_memberships%ROWTYPE;
BEGIN
  IF p_membership_id IS NULL
    OR p_actor_user_id IS NULL
    OR p_lock_token IS NULL
  THEN
    RAISE EXCEPTION 'manual revocation fields are required'
      USING ERRCODE = '22023';
  END IF;

  SELECT lower(btrim(auth_user.email))
  INTO actor_email
  FROM auth.users AS auth_user
  WHERE auth_user.id = p_actor_user_id
    AND NULLIF(btrim(auth_user.email), '') IS NOT NULL;

  IF NOT FOUND
    OR NOT public.is_platform_admin_identity(p_actor_user_id, actor_email)
  THEN
    RAISE EXCEPTION 'platform administrator access is required'
      USING ERRCODE = '42501';
  END IF;

  SELECT existing_membership.*
  INTO membership
  FROM public.workspace_memberships AS existing_membership
  WHERE existing_membership.id = p_membership_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'manual workspace account not found' USING ERRCODE = 'P0002';
  END IF;

  -- Match invite provisioning/revocation lock order: every same-email
  -- membership, the exact membership, credential claim, then delivery claim.
  PERFORM 1
  FROM public.workspace_memberships AS same_email_membership
  WHERE same_email_membership.email_normalized = membership.email_normalized
  ORDER BY same_email_membership.id
  FOR UPDATE;

  SELECT existing_membership.*
  INTO membership
  FROM public.workspace_memberships AS existing_membership
  WHERE existing_membership.id = p_membership_id
  FOR UPDATE;

  IF NOT FOUND
    OR membership.provisioning_method <> 'admin_temporary_password'
    OR membership.status NOT IN ('provisioning', 'invited', 'revoked')
  THEN
    RAISE EXCEPTION 'manual workspace account is not revocable'
      USING ERRCODE = '55000';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.workspaces AS workspace
    WHERE workspace.id = membership.workspace_id
      AND workspace.is_default
  ) OR public.is_platform_admin_email(membership.email_normalized) THEN
    RAISE EXCEPTION 'protected workspace accounts cannot be revoked here'
      USING ERRCODE = '42501';
  END IF;

  IF membership.user_id IS NOT NULL THEN
    SELECT lower(btrim(auth_user.email))
    INTO bound_auth_email
    FROM auth.users AS auth_user
    WHERE auth_user.id = membership.user_id
      AND NULLIF(btrim(auth_user.email), '') IS NOT NULL;

    IF FOUND AND public.is_platform_admin_email(bound_auth_email) THEN
      RAISE EXCEPTION 'platform administrators cannot be revoked here'
        USING ERRCODE = '42501';
    END IF;
  END IF;

  IF membership.status = 'revoked' AND (
    EXISTS (
      SELECT 1
      FROM public.workspace_memberships AS newer_membership
      WHERE newer_membership.id <> membership.id
        AND newer_membership.email_normalized = membership.email_normalized
        AND newer_membership.created_at >= membership.created_at
    ) OR EXISTS (
      SELECT 1
      FROM public.workspace_invite_delivery_claims AS other_claim
      JOIN public.workspace_memberships AS other_membership
        ON other_membership.id = other_claim.membership_id
      WHERE other_membership.id <> membership.id
        AND other_membership.email_normalized = membership.email_normalized
    )
  ) THEN
    RAISE EXCEPTION 'historical manual workspace account is superseded'
      USING ERRCODE = '55000';
  END IF;

  SELECT existing_claim.*
  INTO credential_claim
  FROM public.workspace_account_credential_claims AS existing_claim
  WHERE existing_claim.membership_id = membership.id
  FOR UPDATE;

  IF FOUND THEN
    IF credential_claim.review_after > now() THEN
      RAISE EXCEPTION 'manual workspace credential change is busy'
        USING ERRCODE = '55P03';
    END IF;

    -- Fifteen minutes exceeds the hosted Edge hard lifetime. Once the review
    -- window opens, revocation supersedes the dead credential invocation; Auth
    -- cleanup below still requires the exact marked identity to be deleted.
    abandoned_credential_kind := credential_claim.claim_kind;
    DELETE FROM public.workspace_account_credential_claims
    WHERE membership_id = membership.id;
  END IF;

  SELECT existing_claim.*
  INTO delivery_claim
  FROM public.workspace_invite_delivery_claims AS existing_claim
  WHERE existing_claim.membership_id = membership.id
  FOR UPDATE;

  IF FOUND AND delivery_claim.claim_kind = 'revoke_cleanup' THEN
    IF delivery_claim.lock_token = p_lock_token
      AND delivery_claim.actor_user_id = p_actor_user_id
    THEN
      IF membership.status <> 'revoked' THEN
        RAISE EXCEPTION 'manual revocation claim is inconsistent'
          USING ERRCODE = '55000';
      END IF;
      RETURN membership;
    END IF;

    IF delivery_claim.review_after > now() THEN
      RAISE EXCEPTION 'manual workspace account revocation is busy'
        USING ERRCODE = '55P03';
    END IF;

    UPDATE public.workspace_invite_delivery_claims
    SET
      lock_token = p_lock_token,
      actor_user_id = p_actor_user_id,
      acquired_at = now(),
      review_after = now() + interval '15 minutes'
    WHERE membership_id = membership.id;
  ELSIF FOUND THEN
    IF delivery_claim.review_after > now() THEN
      RAISE EXCEPTION 'manual workspace account provisioning is busy'
        USING ERRCODE = '55P03';
    END IF;

    UPDATE public.workspace_invite_delivery_claims
    SET
      lock_token = p_lock_token,
      claim_kind = 'revoke_cleanup',
      actor_user_id = p_actor_user_id,
      acquired_at = now(),
      review_after = now() + interval '15 minutes'
    WHERE membership_id = membership.id;
  ELSE
    INSERT INTO public.workspace_invite_delivery_claims (
      membership_id,
      lock_token,
      claim_kind,
      actor_user_id,
      acquired_at,
      review_after
    )
    VALUES (
      membership.id,
      p_lock_token,
      'revoke_cleanup',
      p_actor_user_id,
      now(),
      now() + interval '15 minutes'
    );
  END IF;

  IF membership.status <> 'revoked' THEN
    UPDATE public.workspace_memberships
    SET
      status = 'revoked',
      password_change_required = false,
      workspace_access_not_before_epoch = GREATEST(
        workspace_access_not_before_epoch,
        floor(EXTRACT(EPOCH FROM clock_timestamp()))::BIGINT + 1
      ),
      revoked_at = now(),
      revoked_by = p_actor_user_id,
      invite_expires_at = NULL
    WHERE id = membership.id
      AND status IN ('provisioning', 'invited')
    RETURNING * INTO membership;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'manual workspace account revocation failed'
        USING ERRCODE = '55000';
    END IF;

    UPDATE public.workspaces
    SET status = 'archived'
    WHERE id = membership.workspace_id
      AND NOT is_default;

    DELETE FROM public.client_portal_sessions AS session
    USING public.clients AS client
    WHERE session.client_id = client.id
      AND client.workspace_id = membership.workspace_id;

    DELETE FROM public.client_portal_tokens AS token
    USING public.clients AS client
    WHERE token.client_id = client.id
      AND client.workspace_id = membership.workspace_id;

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
      p_actor_user_id,
      'workspace.membership.manual_revoked',
      'workspace_membership',
      membership.id,
      jsonb_strip_nulls(jsonb_build_object(
        'email', membership.email_normalized,
        'abandoned_credential_kind', abandoned_credential_kind
      ))
    );
  END IF;

  RETURN membership;
END;
$$;

CREATE OR REPLACE FUNCTION public.find_workspace_password_account_auth_user(
  p_membership_id UUID,
  p_actor_user_id UUID,
  p_lock_token UUID
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  actor_email TEXT;
  candidate_emails TEXT[];
  candidate_user_ids UUID[];
  claim public.workspace_invite_delivery_claims%ROWTYPE;
  membership public.workspace_memberships%ROWTYPE;
  matched_user_id UUID;
  matched_metadata JSONB;
BEGIN
  IF p_membership_id IS NULL
    OR p_actor_user_id IS NULL
    OR p_lock_token IS NULL
  THEN
    RAISE EXCEPTION 'manual revocation lookup fields are required'
      USING ERRCODE = '22023';
  END IF;

  SELECT lower(btrim(auth_user.email))
  INTO actor_email
  FROM auth.users AS auth_user
  WHERE auth_user.id = p_actor_user_id
    AND NULLIF(btrim(auth_user.email), '') IS NOT NULL;

  IF NOT FOUND
    OR NOT public.is_platform_admin_identity(p_actor_user_id, actor_email)
  THEN
    RAISE EXCEPTION 'platform administrator access is required'
      USING ERRCODE = '42501';
  END IF;

  SELECT existing_membership.*
  INTO membership
  FROM public.workspace_memberships AS existing_membership
  WHERE existing_membership.id = p_membership_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'manual workspace account not found' USING ERRCODE = 'P0002';
  END IF;

  PERFORM 1
  FROM public.workspace_memberships AS same_email_membership
  WHERE same_email_membership.email_normalized = membership.email_normalized
  ORDER BY same_email_membership.id
  FOR UPDATE;

  SELECT existing_membership.*
  INTO membership
  FROM public.workspace_memberships AS existing_membership
  WHERE existing_membership.id = p_membership_id
  FOR UPDATE;

  IF membership.provisioning_method <> 'admin_temporary_password'
    OR membership.status <> 'revoked'
    OR membership.password_change_required
    OR NOT EXISTS (
      SELECT 1
      FROM public.workspaces AS workspace
      WHERE workspace.id = membership.workspace_id
        AND workspace.status = 'archived'
        AND NOT workspace.is_default
    )
  THEN
    RAISE EXCEPTION 'manual workspace revocation state is invalid'
      USING ERRCODE = '55000';
  END IF;

  SELECT existing_claim.*
  INTO claim
  FROM public.workspace_invite_delivery_claims AS existing_claim
  WHERE existing_claim.membership_id = membership.id
  FOR UPDATE;

  IF NOT FOUND
    OR claim.claim_kind <> 'revoke_cleanup'
    OR claim.lock_token <> p_lock_token
    OR claim.actor_user_id <> p_actor_user_id
  THEN
    RAISE EXCEPTION 'manual workspace revocation claim is required'
      USING ERRCODE = '55000';
  END IF;

  SELECT
    array_agg(auth_user.id ORDER BY auth_user.created_at, auth_user.id),
    array_agg(lower(btrim(auth_user.email)) ORDER BY auth_user.created_at, auth_user.id)
  INTO candidate_user_ids, candidate_emails
  FROM auth.users AS auth_user
  WHERE auth_user.id = membership.user_id
    OR (
      auth_user.raw_app_meta_data ->> 'workspace_id' = membership.workspace_id::TEXT
      AND auth_user.raw_app_meta_data ->> 'workspace_membership_id' = membership.id::TEXT
    );

  IF COALESCE(cardinality(candidate_user_ids), 0) = 0 THEN
    RETURN NULL;
  END IF;

  IF cardinality(candidate_user_ids) <> 1 THEN
    RAISE EXCEPTION 'manual workspace Auth identity is ambiguous'
      USING ERRCODE = '55000';
  END IF;

  matched_user_id := candidate_user_ids[1];
  SELECT auth_user.raw_app_meta_data
  INTO matched_metadata
  FROM auth.users AS auth_user
  WHERE auth_user.id = matched_user_id;

  IF candidate_emails[1] IS DISTINCT FROM membership.email_normalized
    OR public.is_platform_admin_email(candidate_emails[1])
    OR matched_metadata ->> 'workspace_id' IS DISTINCT FROM membership.workspace_id::TEXT
    OR matched_metadata ->> 'workspace_membership_id' IS DISTINCT FROM membership.id::TEXT
    OR matched_metadata ->> 'workspace_provisioning_method' IS DISTINCT FROM 'admin_temporary_password'
    OR COALESCE(matched_metadata ->> 'workspace_credential_version', '') !~ '^[0-9]{1,18}$'
    OR COALESCE(matched_metadata ->> 'workspace_credential_attempt_id', '')
      !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
    OR COALESCE(matched_metadata ->> 'workspace_credential_execution_id', '')
      !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
    OR COALESCE(matched_metadata ->> 'workspace_password_change_required', '')
      NOT IN ('true', 'false')
    OR EXISTS (
      SELECT 1
      FROM public.workspace_memberships AS other_membership
      WHERE other_membership.id <> membership.id
        AND other_membership.user_id = matched_user_id
    )
  THEN
    RAISE EXCEPTION 'manual workspace Auth identity is unsafe'
      USING ERRCODE = '42501';
  END IF;

  RETURN matched_user_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.complete_workspace_password_account_revocation(
  p_membership_id UUID,
  p_actor_user_id UUID,
  p_lock_token UUID
)
RETURNS public.workspace_memberships
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  actor_email TEXT;
  claim public.workspace_invite_delivery_claims%ROWTYPE;
  completion_request_id TEXT := 'manual-revoke:' || md5(p_lock_token::TEXT);
  membership public.workspace_memberships%ROWTYPE;
BEGIN
  IF p_membership_id IS NULL
    OR p_actor_user_id IS NULL
    OR p_lock_token IS NULL
  THEN
    RAISE EXCEPTION 'manual revocation completion fields are required'
      USING ERRCODE = '22023';
  END IF;

  SELECT lower(btrim(auth_user.email))
  INTO actor_email
  FROM auth.users AS auth_user
  WHERE auth_user.id = p_actor_user_id
    AND NULLIF(btrim(auth_user.email), '') IS NOT NULL;

  IF NOT FOUND
    OR NOT public.is_platform_admin_identity(p_actor_user_id, actor_email)
  THEN
    RAISE EXCEPTION 'platform administrator access is required'
      USING ERRCODE = '42501';
  END IF;

  SELECT existing_membership.*
  INTO membership
  FROM public.workspace_memberships AS existing_membership
  WHERE existing_membership.id = p_membership_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'manual workspace account not found' USING ERRCODE = 'P0002';
  END IF;

  PERFORM 1
  FROM public.workspace_memberships AS same_email_membership
  WHERE same_email_membership.email_normalized = membership.email_normalized
  ORDER BY same_email_membership.id
  FOR UPDATE;

  SELECT existing_membership.*
  INTO membership
  FROM public.workspace_memberships AS existing_membership
  WHERE existing_membership.id = p_membership_id
  FOR UPDATE;

  IF membership.provisioning_method <> 'admin_temporary_password'
    OR membership.status <> 'revoked'
    OR membership.password_change_required
    OR NOT EXISTS (
      SELECT 1
      FROM public.workspaces AS workspace
      WHERE workspace.id = membership.workspace_id
        AND workspace.status = 'archived'
        AND NOT workspace.is_default
    )
  THEN
    RAISE EXCEPTION 'manual workspace revocation state is invalid'
      USING ERRCODE = '55000';
  END IF;

  SELECT existing_claim.*
  INTO claim
  FROM public.workspace_invite_delivery_claims AS existing_claim
  WHERE existing_claim.membership_id = membership.id
  FOR UPDATE;

  IF NOT FOUND THEN
    IF EXISTS (
      SELECT 1
      FROM public.workspace_audit_log AS audit
      WHERE audit.workspace_id = membership.workspace_id
        AND audit.actor_user_id = p_actor_user_id
        AND audit.action = 'workspace.membership.manual_auth_cleanup_completed'
        AND audit.entity_type = 'workspace_membership'
        AND audit.entity_id = membership.id
        AND audit.request_id = completion_request_id
    ) THEN
      RETURN membership;
    END IF;

    RAISE EXCEPTION 'manual workspace revocation claim is required'
      USING ERRCODE = '55000';
  END IF;

  IF claim.claim_kind <> 'revoke_cleanup'
    OR claim.lock_token <> p_lock_token
    OR claim.actor_user_id <> p_actor_user_id
  THEN
    RAISE EXCEPTION 'manual workspace account revocation is busy'
      USING ERRCODE = '55P03';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM auth.users AS auth_user
    WHERE auth_user.id = membership.user_id
      OR auth_user.raw_user_meta_data ->> 'workspace_membership_id' = membership.id::TEXT
      OR auth_user.raw_app_meta_data ->> 'workspace_membership_id' = membership.id::TEXT
  ) THEN
    RAISE EXCEPTION 'manual workspace Auth cleanup is incomplete'
      USING ERRCODE = '55000';
  END IF;

  DELETE FROM public.workspace_invite_delivery_claims
  WHERE membership_id = membership.id
    AND lock_token = p_lock_token;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'manual workspace revocation claim was lost'
      USING ERRCODE = '55000';
  END IF;

  INSERT INTO public.workspace_audit_log (
    workspace_id,
    actor_user_id,
    action,
    entity_type,
    entity_id,
    metadata,
    request_id
  )
  VALUES (
    membership.workspace_id,
    p_actor_user_id,
    'workspace.membership.manual_auth_cleanup_completed',
    'workspace_membership',
    membership.id,
    jsonb_build_object('email', membership.email_normalized),
    completion_request_id
  );

  RETURN membership;
END;
$$;

DROP FUNCTION IF EXISTS public.claim_workspace_account_credential(
  UUID, TEXT, UUID, UUID, UUID
);
DROP FUNCTION IF EXISTS public.claim_workspace_account_credential(
  UUID, TEXT, UUID, UUID, UUID, BIGINT, BIGINT, UUID, BOOLEAN
);

CREATE OR REPLACE FUNCTION public.claim_workspace_account_credential(
  p_membership_id UUID,
  p_claim_kind TEXT,
  p_actor_user_id UUID,
  p_attempt_id UUID,
  p_execution_id UUID,
  p_token_issued_at BIGINT,
  p_expected_credential_version BIGINT,
  p_expected_credential_attempt_id UUID,
  p_expected_credential_execution_id UUID,
  p_expected_password_change_required BOOLEAN
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  actor_email TEXT;
  actor_workspace_id TEXT;
  actor_membership_id TEXT;
  actor_provisioning_method TEXT;
  actor_password_change_required TEXT;
  actor_credential_version TEXT;
  actor_credential_attempt_id TEXT;
  actor_credential_execution_id TEXT;
  existing_claim public.workspace_account_credential_claims%ROWTYPE;
  membership public.workspace_memberships%ROWTYPE;
BEGIN
  IF p_membership_id IS NULL
    OR p_claim_kind NOT IN ('temporary_password_rotation', 'initial_password_change')
    OR p_actor_user_id IS NULL
    OR p_attempt_id IS NULL
    OR p_execution_id IS NULL
    OR p_attempt_id = p_execution_id
  THEN
    RAISE EXCEPTION 'invalid workspace credential claim' USING ERRCODE = '22023';
  END IF;

  SELECT lower(btrim(auth_user.email))
  INTO actor_email
  FROM auth.users AS auth_user
  WHERE auth_user.id = p_actor_user_id
    AND NULLIF(btrim(auth_user.email), '') IS NOT NULL;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'workspace credential actor is invalid' USING ERRCODE = '42501';
  END IF;

  SELECT existing_membership.*
  INTO membership
  FROM public.workspace_memberships AS existing_membership
  WHERE existing_membership.id = p_membership_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'workspace account not found' USING ERRCODE = 'P0002';
  END IF;

  IF membership.provisioning_method <> 'admin_temporary_password'
    OR membership.status <> 'invited'
    OR NOT membership.password_change_required
    OR membership.user_id IS NULL
  THEN
    RAISE EXCEPTION 'workspace account does not require a temporary password change'
      USING ERRCODE = '55000';
  END IF;

  SELECT claim.*
  INTO existing_claim
  FROM public.workspace_account_credential_claims AS claim
  WHERE claim.membership_id = membership.id
  FOR UPDATE;

  IF FOUND THEN
    IF existing_claim.claim_kind <> p_claim_kind
      OR existing_claim.actor_user_id <> p_actor_user_id
      OR existing_claim.attempt_id <> p_attempt_id
      OR existing_claim.execution_id <> p_execution_id
    THEN
      RAISE EXCEPTION 'workspace credential change is busy'
        USING ERRCODE = '55P03';
    END IF;

    -- An execution cannot resume after its lease has opened for review. Only
    -- reconciliation may renew it, and reconciliation assigns a new execution
    -- marker before any further Auth provider mutation is permitted.
    IF existing_claim.review_after <= now() THEN
      RAISE EXCEPTION 'workspace credential change requires reconciliation'
        USING ERRCODE = '55P03';
    END IF;

    RETURN jsonb_build_object(
      'membership', to_jsonb(membership),
      'attempt_id', existing_claim.attempt_id,
      'execution_id', existing_claim.execution_id
    );
  END IF;

  IF p_claim_kind = 'temporary_password_rotation' THEN
    IF NOT public.is_platform_admin_identity(p_actor_user_id, actor_email) THEN
      RAISE EXCEPTION 'platform administrator access is required'
        USING ERRCODE = '42501';
    END IF;

    IF p_token_issued_at IS NOT NULL
      OR p_expected_credential_version IS NOT NULL
      OR p_expected_credential_attempt_id IS NOT NULL
      OR p_expected_credential_execution_id IS NOT NULL
      OR p_expected_password_change_required IS NOT NULL
    THEN
      RAISE EXCEPTION 'temporary password rotation token fields must be null'
        USING ERRCODE = '22023';
    END IF;
  ELSE
    -- This check occurs while the membership row is locked and immediately
    -- before the durable claim is inserted. It closes the pre-claim race in
    -- which an access token validated by Edge could become stale after an
    -- administrator rotates the temporary password but before this RPC runs.
    SELECT
      auth_user.raw_app_meta_data ->> 'workspace_id',
      auth_user.raw_app_meta_data ->> 'workspace_membership_id',
      auth_user.raw_app_meta_data ->> 'workspace_provisioning_method',
      auth_user.raw_app_meta_data ->> 'workspace_password_change_required',
      auth_user.raw_app_meta_data ->> 'workspace_credential_version',
      auth_user.raw_app_meta_data ->> 'workspace_credential_attempt_id',
      auth_user.raw_app_meta_data ->> 'workspace_credential_execution_id'
    INTO
      actor_workspace_id,
      actor_membership_id,
      actor_provisioning_method,
      actor_password_change_required,
      actor_credential_version,
      actor_credential_attempt_id,
      actor_credential_execution_id
    FROM auth.users AS auth_user
    WHERE auth_user.id = p_actor_user_id
      AND lower(btrim(auth_user.email)) = membership.email_normalized;

    IF membership.user_id IS DISTINCT FROM p_actor_user_id
      OR membership.email_normalized IS DISTINCT FROM actor_email
      OR NOT FOUND
      OR membership.invite_expires_at IS NULL
      OR membership.invite_expires_at <= now()
      OR p_token_issued_at IS NULL
      OR p_token_issued_at < membership.workspace_access_not_before_epoch
      OR p_expected_credential_version IS NULL
      OR p_expected_credential_version < 1
      OR p_expected_credential_attempt_id IS NULL
      OR p_expected_credential_execution_id IS NULL
      OR p_expected_password_change_required IS DISTINCT FROM true
      OR p_attempt_id = p_expected_credential_attempt_id
      OR p_execution_id = p_expected_credential_execution_id
      OR actor_workspace_id IS DISTINCT FROM membership.workspace_id::TEXT
      OR actor_membership_id IS DISTINCT FROM membership.id::TEXT
      OR actor_provisioning_method IS DISTINCT FROM 'admin_temporary_password'
      OR actor_password_change_required IS DISTINCT FROM 'true'
      OR actor_password_change_required IS DISTINCT FROM
        p_expected_password_change_required::TEXT
      OR actor_credential_version IS DISTINCT FROM
        p_expected_credential_version::TEXT
      OR actor_credential_attempt_id IS DISTINCT FROM
        p_expected_credential_attempt_id::TEXT
      OR actor_credential_execution_id IS DISTINCT FROM
        p_expected_credential_execution_id::TEXT
    THEN
      RAISE EXCEPTION 'temporary password token is stale, invalid, or expired'
        USING ERRCODE = '42501';
    END IF;
  END IF;

  INSERT INTO public.workspace_account_credential_claims (
    membership_id,
    attempt_id,
    execution_id,
    claim_kind,
    actor_user_id,
    acquired_at,
    review_after
  )
  VALUES (
    membership.id,
    p_attempt_id,
    p_execution_id,
    p_claim_kind,
    p_actor_user_id,
    now(),
    now() + interval '15 minutes'
  );

  RETURN jsonb_build_object(
    'membership', to_jsonb(membership),
    'attempt_id', p_attempt_id,
    'execution_id', p_execution_id
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.release_workspace_account_credential_claim(
  p_membership_id UUID,
  p_actor_user_id UUID,
  p_attempt_id UUID,
  p_execution_id UUID
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  claim public.workspace_account_credential_claims%ROWTYPE;
  membership public.workspace_memberships%ROWTYPE;
BEGIN
  SELECT existing_membership.*
  INTO membership
  FROM public.workspace_memberships AS existing_membership
  WHERE existing_membership.id = p_membership_id
  FOR UPDATE;

  IF NOT FOUND THEN RETURN false; END IF;

  SELECT existing_claim.*
  INTO claim
  FROM public.workspace_account_credential_claims AS existing_claim
  WHERE existing_claim.membership_id = p_membership_id
  FOR UPDATE;

  IF NOT FOUND THEN RETURN true; END IF;

  IF claim.actor_user_id IS DISTINCT FROM p_actor_user_id
    OR claim.attempt_id IS DISTINCT FROM p_attempt_id
    OR claim.execution_id IS DISTINCT FROM p_execution_id
  THEN
    RETURN false;
  END IF;

  IF EXISTS (
    SELECT 1
    FROM auth.users AS auth_user
    WHERE auth_user.id = membership.user_id
      AND (
        auth_user.raw_app_meta_data ->> 'workspace_credential_attempt_id' = p_attempt_id::TEXT
        OR auth_user.raw_app_meta_data ->> 'workspace_credential_execution_id' = p_execution_id::TEXT
      )
  ) THEN
    RAISE EXCEPTION 'workspace credential provider change requires reconciliation'
      USING ERRCODE = '55000';
  END IF;

  DELETE FROM public.workspace_account_credential_claims
  WHERE membership_id = p_membership_id
    AND attempt_id = p_attempt_id
    AND execution_id = p_execution_id;

  RETURN true;
END;
$$;

DROP FUNCTION IF EXISTS public.reconcile_workspace_account_credential_claim(
  UUID, TEXT, UUID
);

CREATE OR REPLACE FUNCTION public.reconcile_workspace_account_credential_claim(
  p_membership_id UUID,
  p_claim_kind TEXT,
  p_actor_user_id UUID,
  p_execution_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  actor_email TEXT;
  claim public.workspace_account_credential_claims%ROWTYPE;
  membership public.workspace_memberships%ROWTYPE;
BEGIN
  IF p_membership_id IS NULL
    OR p_claim_kind NOT IN ('temporary_password_rotation', 'initial_password_change')
    OR p_actor_user_id IS NULL
    OR p_execution_id IS NULL
  THEN
    RAISE EXCEPTION 'invalid workspace credential reconciliation'
      USING ERRCODE = '22023';
  END IF;

  SELECT lower(btrim(auth_user.email))
  INTO actor_email
  FROM auth.users AS auth_user
  WHERE auth_user.id = p_actor_user_id
    AND NULLIF(btrim(auth_user.email), '') IS NOT NULL;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'workspace credential actor is invalid' USING ERRCODE = '42501';
  END IF;

  SELECT existing_membership.*
  INTO membership
  FROM public.workspace_memberships AS existing_membership
  WHERE existing_membership.id = p_membership_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'workspace account not found' USING ERRCODE = 'P0002';
  END IF;

  IF membership.provisioning_method <> 'admin_temporary_password'
    OR membership.status <> 'invited'
    OR NOT membership.password_change_required
    OR membership.user_id IS NULL
  THEN
    RAISE EXCEPTION 'workspace credential reconciliation state is invalid'
      USING ERRCODE = '55000';
  END IF;

  SELECT existing_claim.*
  INTO claim
  FROM public.workspace_account_credential_claims AS existing_claim
  WHERE existing_claim.membership_id = membership.id
  FOR UPDATE;

  IF NOT FOUND OR claim.claim_kind <> p_claim_kind THEN
    RAISE EXCEPTION 'workspace credential reconciliation claim is unavailable'
      USING ERRCODE = '55000';
  END IF;

  IF claim.review_after > now() THEN
    RAISE EXCEPTION 'workspace credential reconciliation is not ready'
      USING ERRCODE = '55P03';
  END IF;

  IF p_execution_id = claim.execution_id
    OR p_execution_id = claim.attempt_id
  THEN
    RAISE EXCEPTION 'workspace credential reconciliation requires a new execution'
      USING ERRCODE = '22023';
  END IF;

  IF p_claim_kind = 'temporary_password_rotation' THEN
    IF NOT public.is_platform_admin_identity(p_actor_user_id, actor_email) THEN
      RAISE EXCEPTION 'platform administrator access is required'
        USING ERRCODE = '42501';
    END IF;
  ELSIF membership.user_id IS DISTINCT FROM p_actor_user_id
    OR membership.email_normalized IS DISTINCT FROM actor_email
  THEN
    RAISE EXCEPTION 'workspace credential reconciliation identity is invalid'
      USING ERRCODE = '42501';
  END IF;

  -- Hosted Supabase Edge workers have a hard maximum lifetime of 400 seconds.
  -- The 15-minute review window is deliberately longer, so the execution that
  -- acquired the old lease cannot still be running when this lease is renewed.
  -- Revisit this invariant before self-hosting or increasing worker lifetimes.
  -- Preserve acquired_at: it proves an initial-password change began before its
  -- invitation expired, while review_after is the renewable execution lease.
  UPDATE public.workspace_account_credential_claims
  SET
    execution_id = p_execution_id,
    actor_user_id = p_actor_user_id,
    review_after = now() + interval '15 minutes'
  WHERE membership_id = membership.id
  RETURNING * INTO claim;

  RETURN jsonb_build_object(
    'membership', to_jsonb(membership),
    'attempt_id', claim.attempt_id,
    'execution_id', claim.execution_id
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.list_workspace_account_credential_reconciliation_pending()
RETURNS TABLE (
  membership_id UUID,
  claim_kind TEXT,
  review_after TIMESTAMPTZ
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT
    claim.membership_id,
    claim.claim_kind,
    claim.review_after
  FROM public.workspace_account_credential_claims AS claim
  ORDER BY claim.review_after, claim.membership_id;
$$;

CREATE OR REPLACE FUNCTION public.complete_workspace_temporary_password_rotation(
  p_membership_id UUID,
  p_actor_user_id UUID,
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
  actor_email TEXT;
  auth_email TEXT;
  auth_version TEXT;
  auth_execution_id TEXT;
  claim public.workspace_account_credential_claims%ROWTYPE;
  membership public.workspace_memberships%ROWTYPE;
BEGIN
  SELECT lower(btrim(auth_user.email))
  INTO actor_email
  FROM auth.users AS auth_user
  WHERE auth_user.id = p_actor_user_id;

  IF actor_email IS NULL
    OR NOT public.is_platform_admin_identity(p_actor_user_id, actor_email)
    OR p_credential_version IS NULL
    OR p_credential_version < 1
  THEN
    RAISE EXCEPTION 'platform administrator access is required'
      USING ERRCODE = '42501';
  END IF;

  SELECT existing_membership.*
  INTO membership
  FROM public.workspace_memberships AS existing_membership
  WHERE existing_membership.id = p_membership_id
  FOR UPDATE;

  IF NOT FOUND
    OR membership.provisioning_method <> 'admin_temporary_password'
    OR membership.status <> 'invited'
    OR NOT membership.password_change_required
    OR membership.user_id IS NULL
  THEN
    RAISE EXCEPTION 'temporary password account is unavailable'
      USING ERRCODE = '55000';
  END IF;

  SELECT existing_claim.*
  INTO claim
  FROM public.workspace_account_credential_claims AS existing_claim
  WHERE existing_claim.membership_id = membership.id
  FOR UPDATE;

  IF NOT FOUND
    OR claim.claim_kind <> 'temporary_password_rotation'
    OR claim.actor_user_id <> p_actor_user_id
    OR claim.attempt_id <> p_attempt_id
    OR claim.execution_id <> p_execution_id
  THEN
    RAISE EXCEPTION 'temporary password rotation claim is required'
      USING ERRCODE = '55000';
  END IF;

  SELECT
    lower(btrim(auth_user.email)),
    auth_user.raw_app_meta_data ->> 'workspace_credential_version',
    auth_user.raw_app_meta_data ->> 'workspace_credential_execution_id'
  INTO auth_email, auth_version, auth_execution_id
  FROM auth.users AS auth_user
  WHERE auth_user.id = membership.user_id
    AND COALESCE(char_length(auth_user.encrypted_password), 0) > 0
    AND auth_user.raw_app_meta_data ->> 'workspace_id' = membership.workspace_id::TEXT
    AND auth_user.raw_app_meta_data ->> 'workspace_membership_id' = membership.id::TEXT
    AND auth_user.raw_app_meta_data ->> 'workspace_provisioning_method' = 'admin_temporary_password'
    AND auth_user.raw_app_meta_data ->> 'workspace_password_change_required' = 'true'
    AND auth_user.raw_app_meta_data ->> 'workspace_credential_attempt_id' = p_attempt_id::TEXT
    AND auth_user.raw_app_meta_data ->> 'workspace_credential_execution_id' = p_execution_id::TEXT;

  IF auth_email IS DISTINCT FROM membership.email_normalized
    OR auth_version IS DISTINCT FROM p_credential_version::TEXT
    OR auth_execution_id IS DISTINCT FROM p_execution_id::TEXT
    OR public.is_platform_admin_email(auth_email)
  THEN
    RAISE EXCEPTION 'temporary password Auth identity is unsafe'
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
    workspace_id,
    actor_user_id,
    action,
    entity_type,
    entity_id,
    metadata
  )
  VALUES (
    membership.workspace_id,
    p_actor_user_id,
    'workspace.membership.temporary_password_rotated',
    'workspace_membership',
    membership.id,
    jsonb_build_object(
      'email', membership.email_normalized,
      'credential_version', p_credential_version
    )
  );

  DELETE FROM public.workspace_account_credential_claims
  WHERE membership_id = membership.id
    AND attempt_id = p_attempt_id
    AND execution_id = p_execution_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'temporary password rotation claim was lost'
      USING ERRCODE = '55000';
  END IF;

  RETURN membership;
END;
$$;

CREATE OR REPLACE FUNCTION public.complete_workspace_initial_password_change(
  p_membership_id UUID,
  p_user_id UUID,
  p_email TEXT,
  p_attempt_id UUID,
  p_execution_id UUID,
  p_credential_version BIGINT,
  p_token_issued_at BIGINT
)
RETURNS public.workspace_memberships
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  auth_email TEXT;
  auth_version TEXT;
  auth_execution_id TEXT;
  claim public.workspace_account_credential_claims%ROWTYPE;
  membership public.workspace_memberships%ROWTYPE;
  normalized_email TEXT := lower(btrim(p_email));
BEGIN
  IF p_membership_id IS NULL
    OR p_user_id IS NULL
    OR normalized_email IS NULL
    OR normalized_email = ''
    OR p_attempt_id IS NULL
    OR p_execution_id IS NULL
    OR p_credential_version IS NULL
    OR p_credential_version < 2
    OR p_token_issued_at IS NULL
    OR p_token_issued_at < 1
  THEN
    RAISE EXCEPTION 'initial password change fields are invalid'
      USING ERRCODE = '22023';
  END IF;

  SELECT existing_membership.*
  INTO membership
  FROM public.workspace_memberships AS existing_membership
  WHERE existing_membership.id = p_membership_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'workspace account not found' USING ERRCODE = 'P0002';
  END IF;

  IF membership.status = 'active'
    AND membership.user_id = p_user_id
    AND membership.email_normalized = normalized_email
    AND membership.provisioning_method = 'admin_temporary_password'
    AND NOT membership.password_change_required
  THEN
    RETURN membership;
  END IF;

  IF membership.status <> 'invited'
    OR membership.user_id <> p_user_id
    OR membership.email_normalized <> normalized_email
    OR membership.provisioning_method <> 'admin_temporary_password'
    OR NOT membership.password_change_required
    OR NOT EXISTS (
      SELECT 1
      FROM public.workspaces AS workspace
      WHERE workspace.id = membership.workspace_id
        AND workspace.status = 'active'
    )
  THEN
    RAISE EXCEPTION 'temporary password account is invalid or expired'
      USING ERRCODE = '42501';
  END IF;

  SELECT existing_claim.*
  INTO claim
  FROM public.workspace_account_credential_claims AS existing_claim
  WHERE existing_claim.membership_id = membership.id
  FOR UPDATE;

  IF NOT FOUND
    OR claim.claim_kind <> 'initial_password_change'
    OR claim.actor_user_id <> p_user_id
    OR claim.attempt_id <> p_attempt_id
    OR claim.execution_id <> p_execution_id
  THEN
    RAISE EXCEPTION 'initial password change claim is required'
      USING ERRCODE = '55000';
  END IF;

  -- Fresh acquisition is expiry-gated in claim_workspace_account_credential.
  -- A matching durable claim may finish later when it was acquired before the
  -- invitation expired. reconcile_workspace_account_credential_claim preserves
  -- acquired_at while renewing only the exclusive execution lease.
  IF membership.invite_expires_at IS NULL
    OR claim.acquired_at >= membership.invite_expires_at
  THEN
    RAISE EXCEPTION 'temporary password account is invalid or expired'
      USING ERRCODE = '42501';
  END IF;

  SELECT
    lower(btrim(auth_user.email)),
    auth_user.raw_app_meta_data ->> 'workspace_credential_version',
    auth_user.raw_app_meta_data ->> 'workspace_credential_execution_id'
  INTO auth_email, auth_version, auth_execution_id
  FROM auth.users AS auth_user
  WHERE auth_user.id = p_user_id
    AND COALESCE(char_length(auth_user.encrypted_password), 0) > 0
    AND auth_user.raw_app_meta_data ->> 'workspace_id' = membership.workspace_id::TEXT
    AND auth_user.raw_app_meta_data ->> 'workspace_membership_id' = membership.id::TEXT
    AND auth_user.raw_app_meta_data ->> 'workspace_provisioning_method' = 'admin_temporary_password'
    AND auth_user.raw_app_meta_data ->> 'workspace_password_change_required' = 'false'
    AND auth_user.raw_app_meta_data ->> 'workspace_credential_attempt_id' = p_attempt_id::TEXT
    AND auth_user.raw_app_meta_data ->> 'workspace_credential_execution_id' = p_execution_id::TEXT;

  IF auth_email IS DISTINCT FROM normalized_email
    OR auth_version IS DISTINCT FROM p_credential_version::TEXT
    OR auth_execution_id IS DISTINCT FROM p_execution_id::TEXT
    OR public.is_platform_admin_email(auth_email)
  THEN
    RAISE EXCEPTION 'changed-password Auth identity is unsafe'
      USING ERRCODE = '42501';
  END IF;

  UPDATE public.workspace_memberships
  SET
    status = 'active',
    password_change_required = false,
    accepted_at = now(),
    accepted_by = p_user_id,
    invite_expires_at = NULL,
    workspace_access_not_before_epoch = GREATEST(
      workspace_access_not_before_epoch,
      p_token_issued_at + 1,
      floor(EXTRACT(EPOCH FROM clock_timestamp()))::BIGINT + 1
    )
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
    'workspace.membership.initial_password_changed',
    'workspace_membership',
    membership.id,
    jsonb_build_object(
      'email', membership.email_normalized,
      'credential_version', p_credential_version,
      'access_not_before_epoch', membership.workspace_access_not_before_epoch
    )
  );

  DELETE FROM public.workspace_account_credential_claims
  WHERE membership_id = membership.id
    AND attempt_id = p_attempt_id
    AND execution_id = p_execution_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'initial password change claim was lost'
      USING ERRCODE = '55000';
  END IF;

  RETURN membership;
END;
$$;

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
BEGIN
  IF p_token_issued_at IS NULL OR p_token_issued_at < 1 THEN
    RAISE EXCEPTION 'valid access token issuance is required'
      USING ERRCODE = '42501';
  END IF;

  PERFORM 1
  FROM public.workspace_memberships AS membership
  JOIN auth.users AS auth_user
    ON auth_user.id = membership.user_id
    AND lower(btrim(auth_user.email)) = membership.email_normalized
  WHERE membership.workspace_id = p_workspace_id
    AND membership.user_id = p_actor_user_id
    AND membership.status = 'active'
    AND membership.role IN ('owner', 'admin')
    AND p_token_issued_at >= membership.workspace_access_not_before_epoch
  FOR SHARE OF membership;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'active workspace manager access is required'
      USING ERRCODE = '42501';
  END IF;

  RETURN public.workspace_client_operation(
    p_action,
    p_workspace_id,
    p_client_id,
    p_payload,
    p_actor_user_id
  );
END;
$$;

REVOKE ALL ON FUNCTION public.current_auth_token_iat() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.current_auth_token_iat() TO authenticated;

REVOKE ALL ON FUNCTION public.workspace_auth_credential_is_fresh(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.workspace_auth_credential_is_fresh(UUID) TO authenticated;

REVOKE ALL ON FUNCTION public.finalize_workspace_password_account(
  UUID, UUID, UUID, UUID
) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.finalize_workspace_password_account(
  UUID, UUID, UUID, UUID
) TO service_role;

REVOKE ALL ON FUNCTION public.cancel_workspace_password_account_provisioning(
  UUID, UUID, UUID
) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.cancel_workspace_password_account_provisioning(
  UUID, UUID, UUID
) TO service_role;

REVOKE ALL ON FUNCTION public.begin_workspace_password_account(
  TEXT, TEXT, TEXT, TEXT, UUID
) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.begin_workspace_password_account(
  TEXT, TEXT, TEXT, TEXT, UUID
) TO service_role;

REVOKE ALL ON FUNCTION public.claim_workspace_account_credential(
  UUID, TEXT, UUID, UUID, UUID, BIGINT, BIGINT, UUID, UUID, BOOLEAN
) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.claim_workspace_account_credential(
  UUID, TEXT, UUID, UUID, UUID, BIGINT, BIGINT, UUID, UUID, BOOLEAN
) TO service_role;

REVOKE ALL ON FUNCTION public.release_workspace_account_credential_claim(
  UUID, UUID, UUID, UUID
) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.release_workspace_account_credential_claim(
  UUID, UUID, UUID, UUID
) TO service_role;

REVOKE ALL ON FUNCTION public.reconcile_workspace_account_credential_claim(
  UUID, TEXT, UUID, UUID
) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.reconcile_workspace_account_credential_claim(
  UUID, TEXT, UUID, UUID
) TO service_role;

REVOKE ALL ON FUNCTION public.list_workspace_account_credential_reconciliation_pending()
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.list_workspace_account_credential_reconciliation_pending()
  TO service_role;

REVOKE ALL ON FUNCTION public.claim_workspace_password_account_revocation(
  UUID, UUID, UUID
) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.claim_workspace_password_account_revocation(
  UUID, UUID, UUID
) TO service_role;

REVOKE ALL ON FUNCTION public.find_workspace_password_account_auth_user(
  UUID, UUID, UUID
) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.find_workspace_password_account_auth_user(
  UUID, UUID, UUID
) TO service_role;

REVOKE ALL ON FUNCTION public.complete_workspace_password_account_revocation(
  UUID, UUID, UUID
) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.complete_workspace_password_account_revocation(
  UUID, UUID, UUID
) TO service_role;

REVOKE ALL ON FUNCTION public.complete_workspace_temporary_password_rotation(
  UUID, UUID, UUID, UUID, BIGINT
) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.complete_workspace_temporary_password_rotation(
  UUID, UUID, UUID, UUID, BIGINT
) TO service_role;

REVOKE ALL ON FUNCTION public.complete_workspace_initial_password_change(
  UUID, UUID, TEXT, UUID, UUID, BIGINT, BIGINT
) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.complete_workspace_initial_password_change(
  UUID, UUID, TEXT, UUID, UUID, BIGINT, BIGINT
) TO service_role;

REVOKE ALL ON FUNCTION public.workspace_client_operation_v2(
  TEXT, UUID, UUID, JSONB, UUID, BIGINT
) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.workspace_client_operation_v2(
  TEXT, UUID, UUID, JSONB, UUID, BIGINT
) TO service_role;

COMMENT ON TABLE public.workspace_account_credential_claims IS
  'Service-only durable claims for temporary credential rotation and initial password replacement.';
COMMENT ON FUNCTION public.finalize_workspace_password_account(
  UUID, UUID, UUID, UUID
) IS
  'Binds an exact manually created Auth user to a fail-closed invited membership without storing its temporary password.';
COMMENT ON FUNCTION public.cancel_workspace_password_account_provisioning(
  UUID, UUID, UUID
) IS
  'Archives a failed manual provisioning row only after any exact marked Auth identity has been removed.';
COMMENT ON FUNCTION public.claim_workspace_password_account_revocation(
  UUID, UUID, UUID
) IS
  'Revokes manual account data access atomically and acquires the exact Auth cleanup claim; an expired hosted invocation may be superseded after fifteen minutes.';
COMMENT ON FUNCTION public.find_workspace_password_account_auth_user(
  UUID, UUID, UUID
) IS
  'Returns only the exact marked manual-account Auth identity owned by a matching revocation claim.';
COMMENT ON FUNCTION public.complete_workspace_password_account_revocation(
  UUID, UUID, UUID
) IS
  'Completes an idempotent manual-account revocation only after the exact Auth identity is absent.';
COMMENT ON FUNCTION public.list_workspace_account_credential_reconciliation_pending() IS
  'Service-only narrow projection of pending credential reconciliation kind and review time.';
COMMENT ON FUNCTION public.workspace_client_operation_v2(
  TEXT, UUID, UUID, JSONB, UUID, BIGINT
) IS
  'Token-epoch-gated wrapper around audited tenant client CRUD.';

COMMIT;
