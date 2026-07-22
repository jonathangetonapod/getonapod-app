-- Sub-agency workspace foundation.
--
-- Private workspaces may contain many distinct staff accounts while retaining
-- exactly one live owner. Workspace lifecycle and staff-account lifecycle are
-- independent authorization axes. Browser roles never receive direct mutation
-- access; every public RPC below is service-role-only and revalidates the exact
-- Auth identity, workspace, role hierarchy, and token issuance epoch.

BEGIN;

SELECT pg_advisory_xact_lock(
  hashtextextended('goap:subagency-workspace-foundation:v1', 0)
);

LOCK TABLE public.workspaces IN SHARE ROW EXCLUSIVE MODE;
LOCK TABLE public.workspace_memberships IN SHARE ROW EXCLUSIVE MODE;

-- Establish a write barrier in deterministic account -> Auth -> invite order
-- before checking for provider work. These locks are defense-in-depth for the
-- required traffic freeze and prevent a new claim from racing past the guard.
LOCK TABLE public.workspace_account_credential_claims
  IN SHARE ROW EXCLUSIVE MODE;
LOCK TABLE public.workspace_auth_lifecycle_claims
  IN SHARE ROW EXCLUSIVE MODE;
LOCK TABLE public.workspace_invite_delivery_claims
  IN SHARE ROW EXCLUSIVE MODE;

-- Do not change lifecycle semantics underneath an unresolved provider call.
DO $cutover_claim_guard$
BEGIN
  IF EXISTS (SELECT 1 FROM public.workspace_auth_lifecycle_claims)
    OR EXISTS (SELECT 1 FROM public.workspace_invite_delivery_claims)
    OR EXISTS (SELECT 1 FROM public.workspace_account_credential_claims)
  THEN
    RAISE EXCEPTION
      'workspace provider claims must be reconciled before the multi-staff cutover'
      USING ERRCODE = '55000';
  END IF;
END;
$cutover_claim_guard$;

-- Force the previous deferred contract to prove that the starting state is
-- sound before replacing it in the same transaction.
SET CONSTRAINTS public.workspace_memberships_lifecycle_pair_check IMMEDIATE;
SET CONSTRAINTS public.workspaces_lifecycle_pair_check IMMEDIATE;

ALTER TABLE public.workspaces
  ADD COLUMN IF NOT EXISTS access_not_before_epoch BIGINT;

UPDATE public.workspaces
SET access_not_before_epoch = COALESCE(access_not_before_epoch, 0)
WHERE access_not_before_epoch IS NULL;

ALTER TABLE public.workspaces
  ALTER COLUMN access_not_before_epoch SET DEFAULT 0,
  ALTER COLUMN access_not_before_epoch SET NOT NULL;

ALTER TABLE public.workspaces
  DROP CONSTRAINT IF EXISTS workspaces_access_epoch_check;
ALTER TABLE public.workspaces
  ADD CONSTRAINT workspaces_access_epoch_check
  CHECK (access_not_before_epoch >= 0) NOT VALID;
ALTER TABLE public.workspaces
  VALIDATE CONSTRAINT workspaces_access_epoch_check;

DROP TRIGGER IF EXISTS workspace_memberships_lifecycle_pair_check
  ON public.workspace_memberships;
DROP TRIGGER IF EXISTS workspaces_lifecycle_pair_check
  ON public.workspaces;
DROP TRIGGER IF EXISTS workspace_memberships_enforce_private_single_live
  ON public.workspace_memberships;

DROP FUNCTION IF EXISTS public.enforce_private_workspace_lifecycle_pair();
DROP FUNCTION IF EXISTS public.enforce_private_workspace_single_live_member();

-- At most one live owner is immediate. The deferred floor below permits an
-- ordered owner transfer (demote old, then promote new) inside one transaction.
CREATE UNIQUE INDEX IF NOT EXISTS workspace_memberships_one_live_owner_idx
  ON public.workspace_memberships (workspace_id)
  WHERE role = 'owner'
    AND status IN ('provisioning', 'invited', 'active', 'suspended');

CREATE OR REPLACE FUNCTION public.enforce_private_workspace_staff_invariants()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  target_workspace_id UUID;
  target_workspace_ids UUID[];
  workspace_is_default BOOLEAN;
  workspace_status TEXT;
  live_member_count BIGINT;
  live_owner_count BIGINT;
  eligible_owner_count BIGINT;
BEGIN
  IF TG_TABLE_NAME = 'workspaces' THEN
    target_workspace_ids := CASE TG_OP
      WHEN 'INSERT' THEN ARRAY[NEW.id]
      WHEN 'DELETE' THEN ARRAY[OLD.id]
      ELSE ARRAY[OLD.id, NEW.id]
    END;
  ELSE
    target_workspace_ids := CASE TG_OP
      WHEN 'INSERT' THEN ARRAY[NEW.workspace_id]
      WHEN 'DELETE' THEN ARRAY[OLD.workspace_id]
      ELSE ARRAY[OLD.workspace_id, NEW.workspace_id]
    END;
  END IF;

  FOR target_workspace_id IN
    SELECT DISTINCT candidate.workspace_id
    FROM unnest(target_workspace_ids) AS candidate(workspace_id)
    WHERE candidate.workspace_id IS NOT NULL
    ORDER BY candidate.workspace_id
  LOOP
    SELECT workspace.is_default, workspace.status
    INTO workspace_is_default, workspace_status
    FROM public.workspaces AS workspace
    WHERE workspace.id = target_workspace_id
    FOR UPDATE;

    -- A workspace deleted in the same transaction owns no remaining invariant.
    IF NOT FOUND OR workspace_is_default THEN
      CONTINUE;
    END IF;

    SELECT
      count(*) FILTER (
        WHERE membership.status IN (
          'provisioning', 'invited', 'active', 'suspended'
        )
      ),
      count(*) FILTER (
        WHERE membership.role = 'owner'
          AND membership.status IN (
            'provisioning', 'invited', 'active', 'suspended'
          )
      ),
      count(*) FILTER (
        WHERE membership.role = 'owner'
          AND membership.status IN ('provisioning', 'invited', 'active')
      )
    INTO live_member_count, live_owner_count, eligible_owner_count
    FROM public.workspace_memberships AS membership
    WHERE membership.workspace_id = target_workspace_id;

    IF workspace_status = 'archived' AND live_member_count <> 0 THEN
      RAISE EXCEPTION 'archived private workspace cannot retain live staff'
        USING ERRCODE = '23514';
    END IF;

    IF workspace_status <> 'archived' AND live_owner_count <> 1 THEN
      RAISE EXCEPTION 'private workspace requires exactly one live owner'
        USING ERRCODE = '23514';
    END IF;

    -- A suspended workspace may preserve a legacy suspended owner. An active
    -- workspace may not: individual suspension of its sole owner is forbidden.
    IF workspace_status = 'active' AND eligible_owner_count <> 1 THEN
      RAISE EXCEPTION 'active private workspace requires an unsuspended owner'
        USING ERRCODE = '23514';
    END IF;
  END LOOP;

  RETURN NULL;
END;
$$;

CREATE CONSTRAINT TRIGGER workspace_memberships_private_staff_invariant
  AFTER INSERT OR UPDATE OR DELETE ON public.workspace_memberships
  DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW
  EXECUTE FUNCTION public.enforce_private_workspace_staff_invariants();

CREATE CONSTRAINT TRIGGER workspaces_private_staff_invariant
  AFTER INSERT OR UPDATE OR DELETE ON public.workspaces
  DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW
  EXECUTE FUNCTION public.enforce_private_workspace_staff_invariants();

CREATE OR REPLACE FUNCTION public.advance_workspace_access_epoch_on_status_change()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  IF OLD.status IS DISTINCT FROM NEW.status THEN
    NEW.access_not_before_epoch := GREATEST(
      NEW.access_not_before_epoch,
      floor(EXTRACT(EPOCH FROM clock_timestamp()))::BIGINT + 1
    );
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS workspaces_advance_access_epoch ON public.workspaces;
CREATE TRIGGER workspaces_advance_access_epoch
  BEFORE UPDATE OF status ON public.workspaces
  FOR EACH ROW
  EXECUTE FUNCTION public.advance_workspace_access_epoch_on_status_change();

-- Every provider-claim acquisition and every role/lifecycle mutation takes
-- the same transaction-scoped workspace lock before examining claims. This
-- closes the race where a role is changed just before an in-flight provider
-- operation records the actor that must later be authorized to complete it.
CREATE OR REPLACE FUNCTION public.lock_workspace_provider_lifecycle_v1(
  p_workspace_id UUID
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF p_workspace_id IS NULL THEN
    RAISE EXCEPTION 'workspace provider lifecycle lock requires a workspace'
      USING ERRCODE = '22023';
  END IF;

  PERFORM pg_advisory_xact_lock(
    hashtextextended(
      'goap:workspace-provider-lifecycle:' || p_workspace_id::TEXT,
      0
    )
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.workspace_user_has_provider_claim_v1(
  p_user_id UUID
)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT p_user_id IS NOT NULL AND (
    EXISTS (
      SELECT 1
      FROM public.workspace_invite_delivery_claims AS claim
      WHERE claim.actor_user_id = p_user_id
    )
    OR EXISTS (
      SELECT 1
      FROM public.workspace_auth_lifecycle_claims AS claim
      WHERE claim.actor_user_id = p_user_id
    )
    OR EXISTS (
      SELECT 1
      FROM public.workspace_account_credential_claims AS claim
      WHERE claim.actor_user_id = p_user_id
    )
  );
$$;

CREATE OR REPLACE FUNCTION public.workspace_membership_has_provider_claim_v1(
  p_membership_id UUID
)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT p_membership_id IS NOT NULL AND (
    EXISTS (
      SELECT 1
      FROM public.workspace_invite_delivery_claims AS claim
      WHERE claim.membership_id = p_membership_id
    )
    OR EXISTS (
      SELECT 1
      FROM public.workspace_auth_lifecycle_claims AS claim
      WHERE claim.membership_id = p_membership_id
    )
    OR EXISTS (
      SELECT 1
      FROM public.workspace_account_credential_claims AS claim
      WHERE claim.membership_id = p_membership_id
    )
  );
$$;

CREATE OR REPLACE FUNCTION public.workspace_has_provider_claim_v1(
  p_workspace_id UUID,
  p_excluded_auth_membership_id UUID
)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.workspace_invite_delivery_claims AS claim
    JOIN public.workspace_memberships AS membership
      ON membership.id = claim.membership_id
    WHERE membership.workspace_id = p_workspace_id
  ) OR EXISTS (
    SELECT 1
    FROM public.workspace_auth_lifecycle_claims AS claim
    JOIN public.workspace_memberships AS membership
      ON membership.id = claim.membership_id
    WHERE membership.workspace_id = p_workspace_id
      AND (
        p_excluded_auth_membership_id IS NULL
        OR claim.membership_id <> p_excluded_auth_membership_id
      )
  ) OR EXISTS (
    SELECT 1
    FROM public.workspace_account_credential_claims AS claim
    JOIN public.workspace_memberships AS membership
      ON membership.id = claim.membership_id
    WHERE membership.workspace_id = p_workspace_id
  );
$$;

-- Resolve and lock a tenant manager or the platform owner acting in an
-- explicitly selected private workspace.
CREATE OR REPLACE FUNCTION public.workspace_staff_actor_role_v1(
  p_workspace_id UUID,
  p_actor_user_id UUID,
  p_token_issued_at BIGINT,
  p_allow_platform_management BOOLEAN
)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  actor_email TEXT;
  actor_role TEXT;
  workspace_epoch BIGINT;
  workspace_is_default BOOLEAN;
  workspace_status TEXT;
BEGIN
  IF p_workspace_id IS NULL
    OR p_actor_user_id IS NULL
    OR p_token_issued_at IS NULL
    OR p_token_issued_at < 1
    OR p_token_issued_at > floor(EXTRACT(EPOCH FROM clock_timestamp()))::BIGINT + 300
  THEN
    RAISE EXCEPTION 'invalid workspace staff actor context'
      USING ERRCODE = '22023';
  END IF;

  SELECT lower(btrim(auth_user.email))
  INTO actor_email
  FROM auth.users AS auth_user
  WHERE auth_user.id = p_actor_user_id
    AND NULLIF(btrim(auth_user.email), '') IS NOT NULL;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'workspace staff actor identity is unavailable'
      USING ERRCODE = '42501';
  END IF;

  -- Validate the target without taking a row lock. Each authorization branch
  -- repeats this lookup with its branch-safe lock order before returning.
  SELECT
    workspace.status,
    workspace.is_default,
    workspace.access_not_before_epoch
  INTO workspace_status, workspace_is_default, workspace_epoch
  FROM public.workspaces AS workspace
  WHERE workspace.id = p_workspace_id;

  IF NOT FOUND OR workspace_is_default THEN
    RAISE EXCEPTION 'private workspace not found' USING ERRCODE = 'P0002';
  END IF;

  IF public.is_platform_admin_identity(p_actor_user_id, actor_email) THEN
    -- Platform management never creates or impersonates a membership in the
    -- target workspace, so it may safely stabilize that workspace before the
    -- default bootstrap row.
    SELECT
      workspace.status,
      workspace.is_default,
      workspace.access_not_before_epoch
    INTO workspace_status, workspace_is_default, workspace_epoch
    FROM public.workspaces AS workspace
    WHERE workspace.id = p_workspace_id
    FOR SHARE;

    IF NOT FOUND OR workspace_is_default THEN
      RAISE EXCEPTION 'private workspace not found' USING ERRCODE = 'P0002';
    END IF;

    IF p_allow_platform_management IS NOT TRUE THEN
      RAISE EXCEPTION 'platform owner management is not allowed for this operation'
        USING ERRCODE = '42501';
    END IF;

    IF workspace_status <> 'active' THEN
      RAISE EXCEPTION 'active selected workspace is required'
        USING ERRCODE = '42501';
    END IF;

    PERFORM 1
    FROM public.workspace_memberships AS membership
    JOIN public.workspaces AS workspace
      ON workspace.id = membership.workspace_id
      AND workspace.is_default
      AND workspace.status = 'active'
    JOIN auth.users AS auth_user
      ON auth_user.id = membership.user_id
      AND lower(btrim(auth_user.email)) = membership.email_normalized
    WHERE membership.user_id = p_actor_user_id
      AND membership.email_normalized = actor_email
      AND membership.status = 'active'
      AND p_token_issued_at >= membership.workspace_access_not_before_epoch
      AND p_token_issued_at >= workspace.access_not_before_epoch
      AND (
        membership.provisioning_method <> 'admin_temporary_password'
        OR (
          NOT membership.password_change_required
          AND auth_user.raw_app_meta_data ->> 'workspace_id' = workspace.id::TEXT
          AND auth_user.raw_app_meta_data ->> 'workspace_membership_id' = membership.id::TEXT
          AND auth_user.raw_app_meta_data ->> 'workspace_provisioning_method'
            = 'admin_temporary_password'
          AND auth_user.raw_app_meta_data ->> 'workspace_password_change_required' = 'false'
        )
      )
    FOR SHARE OF membership;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'platform administrator token is stale'
        USING ERRCODE = '42501';
    END IF;

    RETURN 'platform_admin';
  END IF;

  IF workspace_status <> 'active'
    OR p_token_issued_at < workspace_epoch
  THEN
    RAISE EXCEPTION 'active workspace staff access is required'
      USING ERRCODE = '42501';
  END IF;

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
    AND membership.role IN ('owner', 'admin')
    AND p_token_issued_at >= membership.workspace_access_not_before_epoch
    AND (
      membership.provisioning_method <> 'admin_temporary_password'
      OR (
        NOT membership.password_change_required
        AND auth_user.raw_app_meta_data ->> 'workspace_provisioning_method'
          = 'admin_temporary_password'
        AND auth_user.raw_app_meta_data ->> 'workspace_id' = p_workspace_id::TEXT
        AND auth_user.raw_app_meta_data ->> 'workspace_membership_id' = membership.id::TEXT
        AND auth_user.raw_app_meta_data ->> 'workspace_password_change_required' = 'false'
      )
    )
  FOR SHARE OF membership;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'active workspace owner or administrator access is required'
      USING ERRCODE = '42501';
  END IF;

  -- Tenant operations use the same membership -> workspace row-lock order as
  -- client mutations and workspace lifecycle transitions. Recheck the target
  -- under lock so a concurrent suspension or epoch change cannot pass through.
  SELECT
    workspace.status,
    workspace.is_default,
    workspace.access_not_before_epoch
  INTO workspace_status, workspace_is_default, workspace_epoch
  FROM public.workspaces AS workspace
  WHERE workspace.id = p_workspace_id
  FOR SHARE;

  IF NOT FOUND OR workspace_is_default THEN
    RAISE EXCEPTION 'private workspace not found' USING ERRCODE = 'P0002';
  END IF;

  IF workspace_status <> 'active'
    OR p_token_issued_at < workspace_epoch
  THEN
    RAISE EXCEPTION 'active workspace staff access is required'
      USING ERRCODE = '42501';
  END IF;

  RETURN actor_role;
END;
$$;

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
  actor_email TEXT;
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
            WHEN membership.status = 'provisioning' THEN
              jsonb_build_array('retry_invite', 'revoke')
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

CREATE OR REPLACE FUNCTION public.begin_workspace_staff_invite_v1(
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
  actor_role TEXT;
  membership public.workspace_memberships%ROWTYPE;
  normalized_email TEXT := lower(btrim(p_email));
  normalized_full_name TEXT := NULLIF(btrim(p_full_name), '');
  normalized_role TEXT := lower(btrim(p_role));
  workspace public.workspaces%ROWTYPE;
BEGIN
  IF p_workspace_id IS NOT NULL THEN
    PERFORM pg_advisory_xact_lock(
      hashtextextended(
        'goap:workspace-staff-cap:' || p_workspace_id::TEXT,
        0
      )
    );
  END IF;

  actor_role := public.workspace_staff_actor_role_v1(
    p_workspace_id, p_actor_user_id, p_token_issued_at, true
  );

  IF normalized_email IS NULL
    OR normalized_email !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'
    OR char_length(normalized_email) > 254
    OR char_length(COALESCE(normalized_full_name, '')) > 120
    OR normalized_role IS NULL
    OR normalized_role NOT IN ('admin', 'member')
  THEN
    RAISE EXCEPTION 'invalid workspace staff invitation fields'
      USING ERRCODE = '22023';
  END IF;

  IF actor_role = 'admin' AND normalized_role <> 'member' THEN
    RAISE EXCEPTION 'workspace administrators may invite members only'
      USING ERRCODE = '42501';
  END IF;

  IF public.is_platform_admin_email(normalized_email) THEN
    RAISE EXCEPTION 'platform administrators cannot be invited as workspace staff'
      USING ERRCODE = '42501';
  END IF;

  -- Serialize capacity checks on the workspace row so concurrent invitations
  -- cannot both observe the last free slot. The owner counts toward the cap.
  PERFORM 1
  FROM public.workspaces AS target_workspace
  WHERE target_workspace.id = p_workspace_id
    AND target_workspace.status = 'active'
    AND NOT target_workspace.is_default
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'active private workspace not found'
      USING ERRCODE = 'P0002';
  END IF;

  IF (
    SELECT count(*)
    FROM public.workspace_memberships AS roster_membership
    WHERE roster_membership.workspace_id = p_workspace_id
      AND (
        roster_membership.status IN (
          'provisioning', 'invited', 'active', 'suspended'
        )
        OR (
          roster_membership.status = 'revoked'
          AND (
            EXISTS (
              SELECT 1
              FROM public.workspace_invite_delivery_claims AS invite_claim
              WHERE invite_claim.membership_id = roster_membership.id
            ) OR EXISTS (
              SELECT 1
              FROM public.workspace_auth_lifecycle_claims AS lifecycle_claim
              WHERE lifecycle_claim.membership_id = roster_membership.id
            ) OR EXISTS (
              SELECT 1
              FROM public.workspace_account_credential_claims AS credential_claim
              WHERE credential_claim.membership_id = roster_membership.id
            )
          )
        )
      )
  ) >= 100 THEN
    RAISE EXCEPTION 'workspace staff limit reached'
      USING ERRCODE = '55000';
  END IF;

  PERFORM 1
  FROM public.workspace_memberships AS existing_membership
  WHERE existing_membership.email_normalized = normalized_email
  ORDER BY existing_membership.id
  FOR UPDATE;

  IF EXISTS (
    SELECT 1
    FROM public.workspace_memberships AS existing_membership
    WHERE existing_membership.email_normalized = normalized_email
      AND existing_membership.status IN (
        'provisioning', 'invited', 'active', 'suspended'
      )
  ) OR EXISTS (
    SELECT 1
    FROM public.workspace_invite_delivery_claims AS delivery_claim
    JOIN public.workspace_memberships AS claimed_membership
      ON claimed_membership.id = delivery_claim.membership_id
    WHERE claimed_membership.email_normalized = normalized_email
  ) THEN
    RAISE EXCEPTION 'workspace staff account already exists'
      USING ERRCODE = '23505';
  END IF;

  INSERT INTO public.workspace_memberships (
    workspace_id,
    user_id,
    email_normalized,
    full_name,
    role,
    status,
    invite_expires_at,
    invited_by,
    provisioning_method,
    password_change_required,
    workspace_access_not_before_epoch
  )
  VALUES (
    p_workspace_id,
    NULL,
    normalized_email,
    normalized_full_name,
    normalized_role,
    'provisioning',
    NULL,
    p_actor_user_id,
    'email_invite',
    false,
    0
  )
  RETURNING * INTO membership;

  SELECT existing_workspace.*
  INTO workspace
  FROM public.workspaces AS existing_workspace
  WHERE existing_workspace.id = p_workspace_id;

  INSERT INTO public.workspace_audit_log (
    workspace_id, actor_user_id, action, entity_type, entity_id, metadata
  )
  VALUES (
    p_workspace_id,
    p_actor_user_id,
    'workspace.staff.invite_provisioning_started',
    'workspace_membership',
    membership.id,
    jsonb_build_object('email', normalized_email, 'role', normalized_role)
  );

  RETURN jsonb_build_object(
    'workspace', to_jsonb(workspace),
    'membership', to_jsonb(membership)
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.claim_workspace_staff_invite_delivery_v1(
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
    RAISE EXCEPTION 'workspace staff invitation not found' USING ERRCODE = 'P0002';
  END IF;

  IF membership.role = 'owner'
    OR (actor_role = 'admin' AND membership.role <> 'member')
  THEN
    RAISE EXCEPTION 'workspace staff target is outside the actor role hierarchy'
      USING ERRCODE = '42501';
  END IF;

  IF membership.status <> 'provisioning'
    OR membership.provisioning_method <> 'email_invite'
  THEN
    RAISE EXCEPTION 'workspace staff invitation is not provisioning'
      USING ERRCODE = '55000';
  END IF;

  SELECT claim.*
  INTO existing_claim
  FROM public.workspace_invite_delivery_claims AS claim
  WHERE claim.membership_id = membership.id
  FOR UPDATE;

  IF FOUND AND existing_claim.lock_token IS DISTINCT FROM p_lock_token THEN
    RAISE EXCEPTION 'workspace staff invite delivery is busy'
      USING ERRCODE = '55P03';
  END IF;

  IF FOUND AND (
    existing_claim.claim_kind <> 'deliver'
    OR existing_claim.actor_user_id <> p_actor_user_id
  ) THEN
    RAISE EXCEPTION 'workspace staff invite token was reused inconsistently'
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

CREATE OR REPLACE FUNCTION public.find_workspace_staff_invite_auth_user_v1(
  p_workspace_id UUID,
  p_membership_id UUID,
  p_actor_user_id UUID,
  p_token_issued_at BIGINT,
  p_lock_token UUID
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  actor_role TEXT;
  candidate_emails TEXT[];
  candidate_user_ids UUID[];
  claim public.workspace_invite_delivery_claims%ROWTYPE;
  membership public.workspace_memberships%ROWTYPE;
BEGIN
  IF p_membership_id IS NULL OR p_lock_token IS NULL THEN
    RAISE EXCEPTION 'membership_id and lock_token are required'
      USING ERRCODE = '22023';
  END IF;

  actor_role := public.workspace_staff_actor_role_v1(
    p_workspace_id, p_actor_user_id, p_token_issued_at, true
  );

  SELECT existing_membership.*
  INTO membership
  FROM public.workspace_memberships AS existing_membership
  WHERE existing_membership.id = p_membership_id
    AND existing_membership.workspace_id = p_workspace_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'workspace staff account not found' USING ERRCODE = 'P0002';
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
    AND existing_membership.workspace_id = p_workspace_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'workspace staff account not found' USING ERRCODE = 'P0002';
  END IF;

  IF membership.role = 'owner'
    OR membership.user_id = p_actor_user_id
    OR (actor_role = 'admin' AND membership.role <> 'member')
  THEN
    RAISE EXCEPTION 'workspace staff target is outside the actor role hierarchy'
      USING ERRCODE = '42501';
  END IF;

  SELECT existing_claim.*
  INTO claim
  FROM public.workspace_invite_delivery_claims AS existing_claim
  WHERE existing_claim.membership_id = membership.id
  FOR UPDATE;

  IF NOT FOUND
    OR claim.lock_token <> p_lock_token
    OR claim.actor_user_id <> p_actor_user_id
    OR claim.claim_kind NOT IN ('deliver', 'revoke_cleanup')
  THEN
    RAISE EXCEPTION 'workspace staff provider claim is required'
      USING ERRCODE = '55000';
  END IF;

  IF claim.claim_kind = 'revoke_cleanup' AND (
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
    RAISE EXCEPTION 'historical workspace staff account is superseded'
      USING ERRCODE = '55000';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM auth.users AS auth_user
    WHERE (
      auth_user.id = membership.user_id
      OR auth_user.raw_user_meta_data ->> 'workspace_membership_id' = membership.id::TEXT
      OR (
        auth_user.raw_app_meta_data ->> 'workspace_membership_id' = membership.id::TEXT
        AND auth_user.raw_app_meta_data ->> 'workspace_id' = membership.workspace_id::TEXT
      )
    ) AND (
      (
        auth_user.raw_app_meta_data ->> 'workspace_membership_id' IS NOT NULL
        AND auth_user.raw_app_meta_data ->> 'workspace_membership_id' <> membership.id::TEXT
      ) OR (
        auth_user.raw_app_meta_data ->> 'workspace_id' IS NOT NULL
        AND auth_user.raw_app_meta_data ->> 'workspace_id' <> membership.workspace_id::TEXT
      ) OR EXISTS (
        SELECT 1
        FROM public.workspace_memberships AS bound_membership
        WHERE bound_membership.id <> membership.id
          AND bound_membership.user_id = auth_user.id
      )
    )
  ) THEN
    RAISE EXCEPTION 'workspace staff Auth identity has contradictory ownership'
      USING ERRCODE = '42501';
  END IF;

  SELECT
    array_agg(auth_user.id ORDER BY auth_user.created_at, auth_user.id),
    array_agg(lower(btrim(auth_user.email)) ORDER BY auth_user.created_at, auth_user.id)
  INTO candidate_user_ids, candidate_emails
  FROM auth.users AS auth_user
  WHERE auth_user.id = membership.user_id
    OR (
      auth_user.raw_user_meta_data ->> 'workspace_membership_id' = membership.id::TEXT
      AND auth_user.raw_user_meta_data ->> 'workspace_id' = membership.workspace_id::TEXT
      AND auth_user.created_at >= membership.created_at - interval '1 minute'
    )
    OR (
      auth_user.raw_app_meta_data ->> 'workspace_membership_id' = membership.id::TEXT
      AND auth_user.raw_app_meta_data ->> 'workspace_id' = membership.workspace_id::TEXT
    );

  IF COALESCE(cardinality(candidate_user_ids), 0) = 0 THEN
    RETURN NULL;
  END IF;

  IF cardinality(candidate_user_ids) <> 1
    OR candidate_emails[1] IS DISTINCT FROM membership.email_normalized
    OR public.is_platform_admin_email(candidate_emails[1])
  THEN
    RAISE EXCEPTION 'workspace staff Auth identity is unsafe or ambiguous'
      USING ERRCODE = '42501';
  END IF;

  RETURN candidate_user_ids[1];
END;
$$;

CREATE OR REPLACE FUNCTION public.finalize_workspace_staff_invite_v1(
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
  auth_invited_at TIMESTAMPTZ;
  auth_last_sign_in_at TIMESTAMPTZ;
  auth_membership_id TEXT;
  auth_workspace_id TEXT;
  claim public.workspace_invite_delivery_claims%ROWTYPE;
  membership public.workspace_memberships%ROWTYPE;
BEGIN
  IF p_membership_id IS NULL OR p_lock_token IS NULL OR p_auth_user_id IS NULL THEN
    RAISE EXCEPTION 'workspace staff invitation finalization fields are required'
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
    RAISE EXCEPTION 'workspace staff invitation not found' USING ERRCODE = 'P0002';
  END IF;

  IF membership.role = 'owner'
    OR membership.user_id = p_actor_user_id
    OR (actor_role = 'admin' AND membership.role <> 'member')
  THEN
    RAISE EXCEPTION 'workspace staff target is outside the actor role hierarchy'
      USING ERRCODE = '42501';
  END IF;

  IF membership.status = 'invited' AND membership.user_id = p_auth_user_id THEN
    RETURN membership;
  END IF;

  IF membership.status <> 'provisioning'
    OR membership.provisioning_method <> 'email_invite'
  THEN
    RAISE EXCEPTION 'workspace staff invitation is not provisioning'
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
    RAISE EXCEPTION 'workspace staff invite delivery claim is required'
      USING ERRCODE = '55000';
  END IF;

  SELECT
    lower(btrim(auth_user.email)),
    auth_user.invited_at,
    auth_user.created_at,
    auth_user.confirmed_at,
    auth_user.last_sign_in_at,
    COALESCE(char_length(auth_user.encrypted_password), 0) > 0,
    auth_user.raw_app_meta_data ->> 'workspace_id',
    auth_user.raw_app_meta_data ->> 'workspace_membership_id'
  INTO
    auth_email,
    auth_invited_at,
    auth_created_at,
    auth_confirmed_at,
    auth_last_sign_in_at,
    auth_has_password,
    auth_workspace_id,
    auth_membership_id
  FROM auth.users AS auth_user
  WHERE auth_user.id = p_auth_user_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'workspace staff invitation Auth identity is not ready'
      USING ERRCODE = '55000';
  END IF;

  IF auth_workspace_id IS NULL OR auth_membership_id IS NULL THEN
    RAISE EXCEPTION 'workspace staff invitation Auth identity is not ready'
      USING ERRCODE = '55000';
  END IF;

  IF auth_email IS DISTINCT FROM membership.email_normalized
    OR auth_invited_at IS NULL
    OR auth_created_at IS NULL
    OR auth_created_at < membership.created_at - interval '1 minute'
    OR auth_confirmed_at IS NOT NULL
    OR auth_last_sign_in_at IS NOT NULL
    OR auth_has_password
    OR auth_workspace_id IS DISTINCT FROM membership.workspace_id::TEXT
    OR auth_membership_id IS DISTINCT FROM membership.id::TEXT
    OR public.is_platform_admin_email(auth_email)
  THEN
    RAISE EXCEPTION 'workspace staff invitation Auth identity is unsafe'
      USING ERRCODE = '42501';
  END IF;

  UPDATE public.workspace_memberships
  SET
    user_id = p_auth_user_id,
    status = 'invited',
    invited_at = auth_invited_at,
    invite_expires_at = auth_invited_at + interval '24 hours'
  WHERE id = membership.id
    AND status = 'provisioning'
  RETURNING * INTO membership;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'workspace staff invitation finalization failed'
      USING ERRCODE = '55000';
  END IF;

  INSERT INTO public.workspace_audit_log (
    workspace_id, actor_user_id, action, entity_type, entity_id, metadata
  )
  VALUES (
    p_workspace_id,
    p_actor_user_id,
    'workspace.staff.invited',
    'workspace_membership',
    membership.id,
    jsonb_build_object('email', membership.email_normalized, 'role', membership.role)
  );

  DELETE FROM public.workspace_invite_delivery_claims
  WHERE membership_id = membership.id
    AND lock_token = p_lock_token;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'workspace staff invite delivery claim was lost'
      USING ERRCODE = '55000';
  END IF;

  RETURN membership;
END;
$$;

CREATE OR REPLACE FUNCTION public.revoke_workspace_staff_account_v1(
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
    RAISE EXCEPTION 'workspace staff revocation fields are required'
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
    AND existing_membership.workspace_id = p_workspace_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'workspace staff account not found' USING ERRCODE = 'P0002';
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
    AND existing_membership.workspace_id = p_workspace_id
  FOR UPDATE;

  IF membership.role = 'owner'
    OR membership.user_id = p_actor_user_id
    OR (actor_role = 'admin' AND membership.role <> 'member')
  THEN
    RAISE EXCEPTION 'workspace staff target is outside the actor role hierarchy'
      USING ERRCODE = '42501';
  END IF;

  IF public.is_platform_admin_email(membership.email_normalized) THEN
    RAISE EXCEPTION 'platform administrators cannot be changed here'
      USING ERRCODE = '42501';
  END IF;

  IF public.workspace_user_has_provider_claim_v1(membership.user_id) THEN
    RAISE EXCEPTION 'workspace staff actor has a pending provider claim'
      USING ERRCODE = '55P03';
  END IF;

  IF membership.status NOT IN (
    'provisioning', 'invited', 'active', 'suspended', 'revoked'
  ) THEN
    RAISE EXCEPTION 'workspace staff account is not revocable'
      USING ERRCODE = '55000';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.workspace_account_credential_claims AS credential_claim
    WHERE credential_claim.membership_id = membership.id
  ) OR EXISTS (
    SELECT 1
    FROM public.workspace_auth_lifecycle_claims AS lifecycle_claim
    WHERE lifecycle_claim.membership_id = membership.id
  ) THEN
    RAISE EXCEPTION 'workspace staff provider operation is busy'
      USING ERRCODE = '55P03';
  END IF;

  SELECT claim.*
  INTO existing_claim
  FROM public.workspace_invite_delivery_claims AS claim
  WHERE claim.membership_id = membership.id
  FOR UPDATE;

  IF FOUND AND existing_claim.lock_token IS DISTINCT FROM p_lock_token THEN
    RAISE EXCEPTION 'workspace staff provider operation is busy'
      USING ERRCODE = '55P03';
  END IF;

  IF FOUND AND (
    existing_claim.claim_kind <> 'revoke_cleanup'
    OR existing_claim.actor_user_id <> p_actor_user_id
  ) THEN
    RAISE EXCEPTION 'workspace staff revocation token was reused inconsistently'
      USING ERRCODE = '22023';
  END IF;

  IF FOUND THEN
    IF membership.status <> 'revoked' THEN
      RAISE EXCEPTION 'workspace staff revocation claim is inconsistent'
        USING ERRCODE = '55000';
    END IF;
    RETURN membership;
  END IF;

  IF membership.status = 'revoked' AND EXISTS (
    SELECT 1
    FROM public.workspace_memberships AS newer_membership
    WHERE newer_membership.id <> membership.id
      AND newer_membership.email_normalized = membership.email_normalized
      AND newer_membership.created_at >= membership.created_at
  ) THEN
    RAISE EXCEPTION 'historical workspace staff account is superseded'
      USING ERRCODE = '55000';
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
      invite_expires_at = NULL,
      suspended_at = NULL,
      suspended_by = NULL,
      revoked_at = now(),
      revoked_by = p_actor_user_id
    WHERE id = membership.id
    RETURNING * INTO membership;

    INSERT INTO public.workspace_audit_log (
      workspace_id, actor_user_id, action, entity_type, entity_id, metadata
    )
    VALUES (
      p_workspace_id,
      p_actor_user_id,
      'workspace.staff.revoked',
      'workspace_membership',
      membership.id,
      jsonb_build_object('email', membership.email_normalized, 'role', membership.role)
    );
  END IF;

  INSERT INTO public.workspace_invite_delivery_claims (
    membership_id, lock_token, claim_kind, actor_user_id, acquired_at, review_after
  )
  VALUES (
    membership.id,
    p_lock_token,
    'revoke_cleanup',
    p_actor_user_id,
    now(),
    now() + interval '15 minutes'
  );

  RETURN membership;
END;
$$;

-- Claim the provider-side suspend/reactivate operation only after applying the
-- membership-local database transition. A staff transition never changes the
-- workspace lifecycle and never touches client-portal credentials or sessions.
CREATE OR REPLACE FUNCTION public.claim_workspace_staff_auth_lifecycle_v1(
  p_workspace_id UUID,
  p_membership_id UUID,
  p_action TEXT,
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
  auth_email TEXT;
  desired_status TEXT;
  existing_claim public.workspace_auth_lifecycle_claims%ROWTYPE;
  membership public.workspace_memberships%ROWTYPE;
BEGIN
  IF p_membership_id IS NULL
    OR p_lock_token IS NULL
    OR p_action IS NULL
    OR p_action NOT IN (
      'suspend',
      'reactivate',
      'reconcile_active',
      'reconcile_suspended'
    )
  THEN
    RAISE EXCEPTION 'invalid workspace staff Auth lifecycle claim'
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
    RAISE EXCEPTION 'workspace staff account not found' USING ERRCODE = 'P0002';
  END IF;

  IF membership.role = 'owner'
    OR membership.user_id = p_actor_user_id
    OR (actor_role = 'admin' AND membership.role <> 'member')
  THEN
    RAISE EXCEPTION 'workspace staff target is outside the actor role hierarchy'
      USING ERRCODE = '42501';
  END IF;

  IF membership.user_id IS NULL THEN
    RAISE EXCEPTION 'workspace staff Auth identity is missing'
      USING ERRCODE = '55000';
  END IF;

  IF public.workspace_user_has_provider_claim_v1(membership.user_id) THEN
    RAISE EXCEPTION 'workspace staff actor has a pending provider claim'
      USING ERRCODE = '55P03';
  END IF;

  SELECT lower(btrim(auth_user.email))
  INTO auth_email
  FROM auth.users AS auth_user
  WHERE auth_user.id = membership.user_id
    AND NULLIF(btrim(auth_user.email), '') IS NOT NULL;

  IF NOT FOUND
    OR auth_email IS DISTINCT FROM membership.email_normalized
    OR public.is_platform_admin_email(auth_email)
  THEN
    RAISE EXCEPTION 'workspace staff Auth identity is unsafe'
      USING ERRCODE = '42501';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.workspace_invite_delivery_claims AS invite_claim
    WHERE invite_claim.membership_id = membership.id
  ) OR EXISTS (
    SELECT 1
    FROM public.workspace_account_credential_claims AS credential_claim
    WHERE credential_claim.membership_id = membership.id
  ) THEN
    RAISE EXCEPTION 'workspace staff provider operation is busy'
      USING ERRCODE = '55P03';
  END IF;

  desired_status := CASE p_action
    WHEN 'suspend' THEN 'suspended'
    WHEN 'reconcile_suspended' THEN 'suspended'
    ELSE 'active'
  END;

  SELECT claim.*
  INTO existing_claim
  FROM public.workspace_auth_lifecycle_claims AS claim
  WHERE claim.membership_id = membership.id
  FOR UPDATE;

  IF FOUND AND existing_claim.lock_token IS DISTINCT FROM p_lock_token THEN
    RAISE EXCEPTION 'workspace staff Auth lifecycle is busy'
      USING ERRCODE = '55P03';
  END IF;

  IF FOUND AND (
    existing_claim.action IS DISTINCT FROM p_action
    OR existing_claim.desired_status IS DISTINCT FROM desired_status
    OR existing_claim.actor_user_id IS DISTINCT FROM p_actor_user_id
  ) THEN
    RAISE EXCEPTION 'workspace staff Auth lifecycle token was reused inconsistently'
      USING ERRCODE = '22023';
  END IF;

  IF FOUND THEN
    IF membership.status IS DISTINCT FROM desired_status THEN
      RAISE EXCEPTION 'workspace staff Auth lifecycle claim is inconsistent'
        USING ERRCODE = '55000';
    END IF;
    RETURN membership;
  END IF;

  IF p_action = 'suspend' AND membership.status <> 'active' THEN
    RAISE EXCEPTION 'workspace staff account is not active'
      USING ERRCODE = '55000';
  ELSIF p_action = 'reactivate' AND membership.status <> 'suspended' THEN
    RAISE EXCEPTION 'workspace staff account is not suspended'
      USING ERRCODE = '55000';
  ELSIF p_action = 'reconcile_active' AND membership.status <> 'active' THEN
    RAISE EXCEPTION 'workspace staff status no longer matches active reconciliation'
      USING ERRCODE = '55000';
  ELSIF p_action = 'reconcile_suspended'
    AND membership.status <> 'suspended'
  THEN
    RAISE EXCEPTION 'workspace staff status no longer matches suspended reconciliation'
      USING ERRCODE = '55000';
  END IF;

  INSERT INTO public.workspace_auth_lifecycle_claims (
    membership_id,
    lock_token,
    action,
    desired_status,
    actor_user_id,
    acquired_at,
    review_after
  )
  VALUES (
    membership.id,
    p_lock_token,
    p_action,
    desired_status,
    p_actor_user_id,
    now(),
    now() + interval '15 minutes'
  );

  IF p_action = 'suspend' THEN
    UPDATE public.workspace_memberships
    SET
      status = 'suspended',
      suspended_at = now(),
      suspended_by = p_actor_user_id,
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
      'workspace.staff.suspended',
      'workspace_membership',
      membership.id,
      jsonb_build_object('email', membership.email_normalized, 'role', membership.role)
    );
  ELSIF p_action = 'reactivate' THEN
    UPDATE public.workspace_memberships
    SET
      status = 'active',
      suspended_at = NULL,
      suspended_by = NULL,
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
      'workspace.staff.reactivated',
      'workspace_membership',
      membership.id,
      jsonb_build_object('email', membership.email_normalized, 'role', membership.role)
    );
  END IF;

  RETURN membership;
END;
$$;

CREATE OR REPLACE FUNCTION public.complete_workspace_staff_auth_lifecycle_v1(
  p_workspace_id UUID,
  p_membership_id UUID,
  p_action TEXT,
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
  auth_email TEXT;
  completion_request_id TEXT;
  desired_status TEXT;
  existing_claim public.workspace_auth_lifecycle_claims%ROWTYPE;
  membership public.workspace_memberships%ROWTYPE;
BEGIN
  IF p_membership_id IS NULL
    OR p_lock_token IS NULL
    OR p_action IS NULL
    OR p_action NOT IN (
      'suspend',
      'reactivate',
      'reconcile_active',
      'reconcile_suspended'
    )
  THEN
    RAISE EXCEPTION 'invalid workspace staff Auth lifecycle completion'
      USING ERRCODE = '22023';
  END IF;

  PERFORM public.lock_workspace_provider_lifecycle_v1(p_workspace_id);

  actor_role := public.workspace_staff_actor_role_v1(
    p_workspace_id, p_actor_user_id, p_token_issued_at, true
  );

  desired_status := CASE p_action
    WHEN 'suspend' THEN 'suspended'
    WHEN 'reconcile_suspended' THEN 'suspended'
    ELSE 'active'
  END;
  completion_request_id := 'staff-auth-lifecycle:' || md5(p_lock_token::TEXT);

  SELECT existing_membership.*
  INTO membership
  FROM public.workspace_memberships AS existing_membership
  WHERE existing_membership.id = p_membership_id
    AND existing_membership.workspace_id = p_workspace_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'workspace staff account not found' USING ERRCODE = 'P0002';
  END IF;

  IF membership.role = 'owner'
    OR membership.user_id = p_actor_user_id
    OR (actor_role = 'admin' AND membership.role <> 'member')
  THEN
    RAISE EXCEPTION 'workspace staff target is outside the actor role hierarchy'
      USING ERRCODE = '42501';
  END IF;

  IF membership.user_id IS NULL THEN
    RAISE EXCEPTION 'workspace staff Auth identity is missing'
      USING ERRCODE = '55000';
  END IF;

  SELECT lower(btrim(auth_user.email))
  INTO auth_email
  FROM auth.users AS auth_user
  WHERE auth_user.id = membership.user_id
    AND NULLIF(btrim(auth_user.email), '') IS NOT NULL;

  IF NOT FOUND
    OR auth_email IS DISTINCT FROM membership.email_normalized
    OR public.is_platform_admin_email(auth_email)
  THEN
    RAISE EXCEPTION 'workspace staff Auth identity is unsafe'
      USING ERRCODE = '42501';
  END IF;

  SELECT claim.*
  INTO existing_claim
  FROM public.workspace_auth_lifecycle_claims AS claim
  WHERE claim.membership_id = membership.id
  FOR UPDATE;

  IF NOT FOUND THEN
    IF membership.status = desired_status AND EXISTS (
      SELECT 1
      FROM public.workspace_audit_log AS audit
      WHERE audit.workspace_id = p_workspace_id
        AND audit.actor_user_id = p_actor_user_id
        AND audit.action = 'workspace.staff.auth_reconciled'
        AND audit.entity_type = 'workspace_membership'
        AND audit.entity_id = membership.id
        AND audit.request_id = completion_request_id
        AND audit.metadata = jsonb_build_object(
          'action', p_action,
          'desired_status', desired_status
        )
    ) THEN
      RETURN membership;
    END IF;

    RAISE EXCEPTION 'workspace staff Auth lifecycle claim is required'
      USING ERRCODE = '55000';
  END IF;

  IF existing_claim.lock_token IS DISTINCT FROM p_lock_token THEN
    RAISE EXCEPTION 'workspace staff Auth lifecycle is busy'
      USING ERRCODE = '55P03';
  END IF;

  IF existing_claim.action IS DISTINCT FROM p_action
    OR existing_claim.desired_status IS DISTINCT FROM desired_status
    OR existing_claim.actor_user_id IS DISTINCT FROM p_actor_user_id
  THEN
    RAISE EXCEPTION 'workspace staff Auth lifecycle token was reused inconsistently'
      USING ERRCODE = '22023';
  END IF;

  IF membership.status IS DISTINCT FROM desired_status THEN
    RAISE EXCEPTION 'workspace staff status changed during Auth reconciliation'
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
    p_workspace_id,
    p_actor_user_id,
    'workspace.staff.auth_reconciled',
    'workspace_membership',
    membership.id,
    jsonb_build_object(
      'action', existing_claim.action,
      'desired_status', existing_claim.desired_status
    ),
    completion_request_id
  );

  DELETE FROM public.workspace_auth_lifecycle_claims AS claim
  WHERE claim.membership_id = membership.id
    AND claim.lock_token = p_lock_token;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'workspace staff Auth lifecycle claim was lost'
      USING ERRCODE = '55000';
  END IF;

  RETURN membership;
END;
$$;

CREATE OR REPLACE FUNCTION public.update_workspace_staff_role_v1(
  p_workspace_id UUID,
  p_membership_id UUID,
  p_role TEXT,
  p_actor_user_id UUID,
  p_token_issued_at BIGINT
)
RETURNS public.workspace_memberships
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  actor_role TEXT;
  membership public.workspace_memberships%ROWTYPE;
  normalized_role TEXT := lower(btrim(p_role));
  previous_role TEXT;
BEGIN
  IF p_membership_id IS NULL
    OR normalized_role IS NULL
    OR normalized_role NOT IN ('admin', 'member')
  THEN
    RAISE EXCEPTION 'invalid workspace staff role update'
      USING ERRCODE = '22023';
  END IF;

  PERFORM public.lock_workspace_provider_lifecycle_v1(p_workspace_id);

  actor_role := public.workspace_staff_actor_role_v1(
    p_workspace_id, p_actor_user_id, p_token_issued_at, true
  );

  IF actor_role NOT IN ('owner', 'platform_admin') THEN
    RAISE EXCEPTION 'workspace owner access is required'
      USING ERRCODE = '42501';
  END IF;

  SELECT existing_membership.*
  INTO membership
  FROM public.workspace_memberships AS existing_membership
  WHERE existing_membership.id = p_membership_id
    AND existing_membership.workspace_id = p_workspace_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'workspace staff account not found' USING ERRCODE = 'P0002';
  END IF;

  IF membership.role = 'owner' OR membership.user_id = p_actor_user_id THEN
    RAISE EXCEPTION 'workspace owner role changes require ownership transfer'
      USING ERRCODE = '42501';
  END IF;

  IF membership.status NOT IN ('active', 'suspended') THEN
    RAISE EXCEPTION 'workspace staff account role is not editable'
      USING ERRCODE = '55000';
  END IF;

  IF public.workspace_user_has_provider_claim_v1(membership.user_id) THEN
    RAISE EXCEPTION 'workspace staff actor has a pending provider claim'
      USING ERRCODE = '55P03';
  END IF;

  IF public.workspace_membership_has_provider_claim_v1(membership.id) THEN
    RAISE EXCEPTION 'workspace staff provider operation is busy'
      USING ERRCODE = '55P03';
  END IF;

  IF membership.role = normalized_role THEN
    RETURN membership;
  END IF;

  previous_role := membership.role;

  UPDATE public.workspace_memberships
  SET
    role = normalized_role,
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
    'workspace.staff.role_updated',
    'workspace_membership',
    membership.id,
    jsonb_build_object(
      'email', membership.email_normalized,
      'previous_role', previous_role,
      'role', membership.role
    )
  );

  RETURN membership;
END;
$$;

CREATE OR REPLACE FUNCTION public.transfer_workspace_owner_v1(
  p_workspace_id UUID,
  p_membership_id UUID,
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
  next_epoch BIGINT := floor(EXTRACT(EPOCH FROM clock_timestamp()))::BIGINT + 1;
  new_owner public.workspace_memberships%ROWTYPE;
  previous_owner public.workspace_memberships%ROWTYPE;
BEGIN
  IF p_membership_id IS NULL THEN
    RAISE EXCEPTION 'workspace ownership transfer target is required'
      USING ERRCODE = '22023';
  END IF;

  PERFORM public.lock_workspace_provider_lifecycle_v1(p_workspace_id);

  actor_role := public.workspace_staff_actor_role_v1(
    p_workspace_id, p_actor_user_id, p_token_issued_at, true
  );

  IF actor_role NOT IN ('owner', 'platform_admin') THEN
    RAISE EXCEPTION 'workspace owner access is required'
      USING ERRCODE = '42501';
  END IF;

  -- Lock both membership rows in deterministic id order before changing the
  -- unique owner slot. The deferred floor permits this ordered handoff.
  PERFORM 1
  FROM public.workspace_memberships AS membership
  WHERE membership.workspace_id = p_workspace_id
    AND membership.id IN (p_membership_id, (
      SELECT owner_membership.id
      FROM public.workspace_memberships AS owner_membership
      WHERE owner_membership.workspace_id = p_workspace_id
        AND owner_membership.status = 'active'
        AND owner_membership.role = 'owner'
    ))
  ORDER BY membership.id
  FOR UPDATE;

  SELECT membership.*
  INTO previous_owner
  FROM public.workspace_memberships AS membership
  WHERE membership.workspace_id = p_workspace_id
    AND membership.status = 'active'
    AND membership.role = 'owner'
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'workspace ownership changed during transfer'
      USING ERRCODE = '55000';
  END IF;

  IF actor_role = 'owner' AND previous_owner.user_id <> p_actor_user_id THEN
    RAISE EXCEPTION 'workspace ownership changed during transfer'
      USING ERRCODE = '55000';
  END IF;

  SELECT membership.*
  INTO new_owner
  FROM public.workspace_memberships AS membership
  WHERE membership.id = p_membership_id
    AND membership.workspace_id = p_workspace_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'workspace ownership transfer target not found'
      USING ERRCODE = 'P0002';
  END IF;

  IF new_owner.id = previous_owner.id
    OR new_owner.role NOT IN ('admin', 'member')
    OR new_owner.status <> 'active'
    OR new_owner.user_id IS NULL
    OR new_owner.accepted_at IS NULL
  THEN
    RAISE EXCEPTION 'ownership transfer requires another active accepted staff account'
      USING ERRCODE = '55000';
  END IF;

  IF public.workspace_user_has_provider_claim_v1(previous_owner.user_id)
    OR public.workspace_user_has_provider_claim_v1(new_owner.user_id)
  THEN
    RAISE EXCEPTION 'workspace ownership transfer actor has a pending provider claim'
      USING ERRCODE = '55P03';
  END IF;

  IF public.is_platform_admin_email(new_owner.email_normalized)
    OR public.workspace_membership_has_provider_claim_v1(previous_owner.id)
    OR public.workspace_membership_has_provider_claim_v1(new_owner.id)
  THEN
    RAISE EXCEPTION 'workspace ownership transfer target is unavailable'
      USING ERRCODE = '55000';
  END IF;

  PERFORM 1
  FROM auth.users AS auth_user
  WHERE auth_user.id = new_owner.user_id
    AND lower(btrim(auth_user.email)) = new_owner.email_normalized;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'workspace ownership transfer target identity is unsafe'
      USING ERRCODE = '42501';
  END IF;

  UPDATE public.workspace_memberships
  SET
    role = 'admin',
    workspace_access_not_before_epoch = GREATEST(
      workspace_access_not_before_epoch,
      next_epoch
    )
  WHERE id = previous_owner.id
  RETURNING * INTO previous_owner;

  UPDATE public.workspace_memberships
  SET
    role = 'owner',
    workspace_access_not_before_epoch = GREATEST(
      workspace_access_not_before_epoch,
      next_epoch
    )
  WHERE id = new_owner.id
  RETURNING * INTO new_owner;

  INSERT INTO public.workspace_audit_log (
    workspace_id, actor_user_id, action, entity_type, entity_id, metadata
  )
  VALUES (
    p_workspace_id,
    p_actor_user_id,
    'workspace.owner.transferred',
    'workspace_membership',
    new_owner.id,
    jsonb_build_object(
      'previous_owner_membership_id', previous_owner.id,
      'previous_owner_email', previous_owner.email_normalized,
      'owner_email', new_owner.email_normalized
    )
  );

  RETURN jsonb_build_object(
    'owner', to_jsonb(new_owner),
    'previous_owner', to_jsonb(previous_owner)
  );
END;
$$;

-- Platform suspension remains a workspace-wide administrative lifecycle. Only
-- the sole live owner represents that lifecycle; other staff rows remain
-- membership-local and may coexist in arbitrary non-owner states.
CREATE OR REPLACE FUNCTION public.transition_workspace_membership(
  p_membership_id UUID,
  p_action TEXT,
  p_actor_user_id UUID
)
RETURNS public.workspace_memberships
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  actor_email TEXT;
  audit_action TEXT;
  bound_auth_email TEXT;
  membership public.workspace_memberships%ROWTYPE;
  initial_workspace_id UUID;
  workspace public.workspaces%ROWTYPE;
BEGIN
  IF p_membership_id IS NULL OR p_actor_user_id IS NULL THEN
    RAISE EXCEPTION 'membership_id and actor_user_id are required'
      USING ERRCODE = '22023';
  END IF;

  IF p_action IS NULL OR p_action NOT IN ('suspend', 'reactivate') THEN
    RAISE EXCEPTION 'unsupported workspace membership transition'
      USING ERRCODE = '22023';
  END IF;

  SELECT existing_membership.workspace_id
  INTO initial_workspace_id
  FROM public.workspace_memberships AS existing_membership
  WHERE existing_membership.id = p_membership_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'workspace account not found' USING ERRCODE = 'P0002';
  END IF;

  PERFORM public.lock_workspace_provider_lifecycle_v1(initial_workspace_id);

  -- Match the established tenant operation lock order: membership first,
  -- workspace second. The workspace advisory lock still serializes provider
  -- lifecycle claims before either row lock is acquired.
  SELECT existing_membership.*
  INTO membership
  FROM public.workspace_memberships AS existing_membership
  WHERE existing_membership.id = p_membership_id
  FOR UPDATE;

  IF NOT FOUND
    OR membership.workspace_id <> initial_workspace_id
  THEN
    RAISE EXCEPTION 'workspace account changed during transition'
      USING ERRCODE = '55000';
  END IF;

  SELECT existing_workspace.*
  INTO workspace
  FROM public.workspaces AS existing_workspace
  WHERE existing_workspace.id = initial_workspace_id
  FOR UPDATE;

  IF NOT FOUND OR workspace.is_default THEN
    RAISE EXCEPTION 'private workspace not found' USING ERRCODE = 'P0002';
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

  IF membership.role <> 'owner' THEN
    RAISE EXCEPTION 'only the workspace owner can represent workspace lifecycle'
      USING ERRCODE = '42501';
  END IF;

  IF membership.user_id IS NULL THEN
    RAISE EXCEPTION 'workspace owner Auth identity is missing'
      USING ERRCODE = '55000';
  END IF;

  SELECT lower(btrim(auth_user.email))
  INTO bound_auth_email
  FROM auth.users AS auth_user
  WHERE auth_user.id = membership.user_id
    AND NULLIF(btrim(auth_user.email), '') IS NOT NULL;

  IF NOT FOUND
    OR bound_auth_email IS DISTINCT FROM membership.email_normalized
    OR public.is_platform_admin_email(bound_auth_email)
  THEN
    RAISE EXCEPTION 'workspace owner Auth identity is unsafe'
      USING ERRCODE = '42501';
  END IF;

  IF p_action = 'suspend' THEN
    IF workspace.status <> 'active' OR membership.status <> 'active' THEN
      RAISE EXCEPTION 'workspace owner and workspace are not active'
        USING ERRCODE = '55000';
    END IF;

    UPDATE public.workspace_memberships
    SET
      status = 'suspended',
      suspended_at = now(),
      suspended_by = p_actor_user_id,
      workspace_access_not_before_epoch = GREATEST(
        workspace_access_not_before_epoch,
        floor(EXTRACT(EPOCH FROM clock_timestamp()))::BIGINT + 1
      )
    WHERE id = membership.id
      AND role = 'owner'
      AND status = 'active'
    RETURNING * INTO membership;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'workspace owner transition failed'
        USING ERRCODE = '55000';
    END IF;

    UPDATE public.workspaces
    SET status = 'suspended'
    WHERE id = workspace.id
      AND status = 'active';

    IF NOT FOUND THEN
      RAISE EXCEPTION 'workspace transition failed'
        USING ERRCODE = '55000';
    END IF;

    DELETE FROM public.client_portal_sessions AS session
    USING public.clients AS client
    WHERE session.client_id = client.id
      AND client.workspace_id = workspace.id;

    DELETE FROM public.client_portal_tokens AS token
    USING public.clients AS client
    WHERE token.client_id = client.id
      AND client.workspace_id = workspace.id;

    audit_action := 'workspace.membership.suspended';
  ELSE
    IF workspace.status <> 'suspended' OR membership.status <> 'suspended' THEN
      RAISE EXCEPTION 'workspace owner and workspace are not suspended'
        USING ERRCODE = '55000';
    END IF;

    UPDATE public.workspace_memberships
    SET
      status = 'active',
      suspended_at = NULL,
      suspended_by = NULL,
      workspace_access_not_before_epoch = GREATEST(
        workspace_access_not_before_epoch,
        floor(EXTRACT(EPOCH FROM clock_timestamp()))::BIGINT + 1
      )
    WHERE id = membership.id
      AND role = 'owner'
      AND status = 'suspended'
    RETURNING * INTO membership;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'workspace owner transition failed'
        USING ERRCODE = '55000';
    END IF;

    UPDATE public.workspaces
    SET status = 'active'
    WHERE id = workspace.id
      AND status = 'suspended';

    IF NOT FOUND THEN
      RAISE EXCEPTION 'workspace transition failed'
        USING ERRCODE = '55000';
    END IF;

    audit_action := 'workspace.membership.reactivated';
  END IF;

  INSERT INTO public.workspace_audit_log (
    workspace_id, actor_user_id, action, entity_type, entity_id, metadata
  )
  VALUES (
    workspace.id,
    p_actor_user_id,
    audit_action,
    'workspace_membership',
    membership.id,
    jsonb_build_object('email', membership.email_normalized, 'role', 'owner')
  );

  RETURN membership;
END;
$$;

CREATE OR REPLACE FUNCTION public.claim_workspace_auth_lifecycle(
  p_membership_id UUID,
  p_action TEXT,
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
  auth_email TEXT;
  desired_status TEXT;
  existing_claim public.workspace_auth_lifecycle_claims%ROWTYPE;
  initial_workspace_id UUID;
  membership public.workspace_memberships%ROWTYPE;
  workspace public.workspaces%ROWTYPE;
BEGIN
  IF p_membership_id IS NULL
    OR p_actor_user_id IS NULL
    OR p_lock_token IS NULL
    OR p_action IS NULL
    OR p_action NOT IN (
      'suspend', 'reactivate', 'reconcile_active', 'reconcile_suspended'
    )
  THEN
    RAISE EXCEPTION 'invalid workspace Auth lifecycle claim'
      USING ERRCODE = '22023';
  END IF;

  SELECT existing_membership.workspace_id
  INTO initial_workspace_id
  FROM public.workspace_memberships AS existing_membership
  WHERE existing_membership.id = p_membership_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'workspace account not found' USING ERRCODE = 'P0002';
  END IF;

  PERFORM public.lock_workspace_provider_lifecycle_v1(initial_workspace_id);

  -- Keep owner lifecycle locks compatible with tenant client operations.
  SELECT existing_membership.*
  INTO membership
  FROM public.workspace_memberships AS existing_membership
  WHERE existing_membership.id = p_membership_id
  FOR UPDATE;

  IF NOT FOUND
    OR membership.workspace_id <> initial_workspace_id
  THEN
    RAISE EXCEPTION 'workspace account changed during lifecycle claim'
      USING ERRCODE = '55000';
  END IF;

  SELECT existing_workspace.*
  INTO workspace
  FROM public.workspaces AS existing_workspace
  WHERE existing_workspace.id = initial_workspace_id
  FOR UPDATE;

  IF NOT FOUND OR workspace.is_default THEN
    RAISE EXCEPTION 'private workspace not found' USING ERRCODE = 'P0002';
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

  IF membership.role <> 'owner' THEN
    RAISE EXCEPTION 'workspace lifecycle target must be the owner'
      USING ERRCODE = '42501';
  END IF;

  IF membership.user_id IS NULL THEN
    RAISE EXCEPTION 'workspace owner Auth identity is missing'
      USING ERRCODE = '55000';
  END IF;

  SELECT lower(btrim(auth_user.email))
  INTO auth_email
  FROM auth.users AS auth_user
  WHERE auth_user.id = membership.user_id
    AND NULLIF(btrim(auth_user.email), '') IS NOT NULL;

  IF NOT FOUND
    OR auth_email IS DISTINCT FROM membership.email_normalized
    OR public.is_platform_admin_email(auth_email)
  THEN
    RAISE EXCEPTION 'workspace owner Auth identity is unsafe'
      USING ERRCODE = '42501';
  END IF;

  desired_status := CASE p_action
    WHEN 'suspend' THEN 'suspended'
    WHEN 'reconcile_suspended' THEN 'suspended'
    ELSE 'active'
  END;

  SELECT claim.*
  INTO existing_claim
  FROM public.workspace_auth_lifecycle_claims AS claim
  WHERE claim.membership_id = membership.id
  FOR UPDATE;

  IF FOUND AND existing_claim.lock_token IS DISTINCT FROM p_lock_token THEN
    RAISE EXCEPTION 'workspace Auth lifecycle is busy'
      USING ERRCODE = '55P03';
  END IF;

  IF FOUND AND (
    existing_claim.action IS DISTINCT FROM p_action
    OR existing_claim.desired_status IS DISTINCT FROM desired_status
    OR existing_claim.actor_user_id IS DISTINCT FROM p_actor_user_id
  ) THEN
    RAISE EXCEPTION 'workspace Auth lifecycle token was reused inconsistently'
      USING ERRCODE = '22023';
  END IF;

  IF public.workspace_has_provider_claim_v1(
    workspace.id,
    CASE WHEN FOUND THEN membership.id ELSE NULL END
  ) THEN
    RAISE EXCEPTION 'workspace provider lifecycle is busy'
      USING ERRCODE = '55P03';
  END IF;

  IF FOUND THEN
    IF workspace.status IS DISTINCT FROM desired_status
      OR membership.status IS DISTINCT FROM desired_status
    THEN
      RAISE EXCEPTION 'workspace Auth lifecycle claim is inconsistent'
        USING ERRCODE = '55000';
    END IF;
    RETURN membership;
  END IF;

  IF p_action = 'suspend' AND (
    workspace.status <> 'active' OR membership.status <> 'active'
  ) THEN
    RAISE EXCEPTION 'workspace owner and workspace are not active'
      USING ERRCODE = '55000';
  ELSIF p_action = 'reactivate' AND (
    workspace.status <> 'suspended' OR membership.status <> 'suspended'
  ) THEN
    RAISE EXCEPTION 'workspace owner and workspace are not suspended'
      USING ERRCODE = '55000';
  ELSIF p_action = 'reconcile_active' AND (
    workspace.status <> 'active' OR membership.status <> 'active'
  ) THEN
    RAISE EXCEPTION 'workspace lifecycle no longer matches active reconciliation'
      USING ERRCODE = '55000';
  ELSIF p_action = 'reconcile_suspended' AND (
    workspace.status <> 'suspended' OR membership.status <> 'suspended'
  ) THEN
    RAISE EXCEPTION 'workspace lifecycle no longer matches suspended reconciliation'
      USING ERRCODE = '55000';
  END IF;

  INSERT INTO public.workspace_auth_lifecycle_claims (
    membership_id,
    lock_token,
    action,
    desired_status,
    actor_user_id,
    acquired_at,
    review_after
  )
  VALUES (
    membership.id,
    p_lock_token,
    p_action,
    desired_status,
    p_actor_user_id,
    now(),
    now() + interval '15 minutes'
  );

  IF p_action = 'suspend' THEN
    membership := public.transition_workspace_membership(
      membership.id, 'suspend', p_actor_user_id
    );
  ELSIF p_action = 'reactivate' THEN
    membership := public.transition_workspace_membership(
      membership.id, 'reactivate', p_actor_user_id
    );
  END IF;

  RETURN membership;
END;
$$;

CREATE OR REPLACE FUNCTION public.complete_workspace_auth_lifecycle(
  p_membership_id UUID,
  p_action TEXT,
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
  auth_email TEXT;
  completion_request_id TEXT;
  desired_status TEXT;
  existing_claim public.workspace_auth_lifecycle_claims%ROWTYPE;
  initial_workspace_id UUID;
  membership public.workspace_memberships%ROWTYPE;
  workspace public.workspaces%ROWTYPE;
BEGIN
  IF p_membership_id IS NULL
    OR p_actor_user_id IS NULL
    OR p_lock_token IS NULL
    OR p_action IS NULL
    OR p_action NOT IN (
      'suspend', 'reactivate', 'reconcile_active', 'reconcile_suspended'
    )
  THEN
    RAISE EXCEPTION 'invalid workspace Auth lifecycle completion'
      USING ERRCODE = '22023';
  END IF;

  SELECT existing_membership.workspace_id
  INTO initial_workspace_id
  FROM public.workspace_memberships AS existing_membership
  WHERE existing_membership.id = p_membership_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'workspace account not found' USING ERRCODE = 'P0002';
  END IF;

  PERFORM public.lock_workspace_provider_lifecycle_v1(initial_workspace_id);

  -- Complete lifecycle work in the same membership -> workspace order used by
  -- its claim and transition phases.
  SELECT existing_membership.*
  INTO membership
  FROM public.workspace_memberships AS existing_membership
  WHERE existing_membership.id = p_membership_id
  FOR UPDATE;

  IF NOT FOUND
    OR membership.workspace_id <> initial_workspace_id
  THEN
    RAISE EXCEPTION 'workspace account changed during lifecycle completion'
      USING ERRCODE = '55000';
  END IF;

  SELECT existing_workspace.*
  INTO workspace
  FROM public.workspaces AS existing_workspace
  WHERE existing_workspace.id = initial_workspace_id
  FOR UPDATE;

  IF NOT FOUND OR workspace.is_default THEN
    RAISE EXCEPTION 'private workspace not found' USING ERRCODE = 'P0002';
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

  IF membership.role <> 'owner' THEN
    RAISE EXCEPTION 'workspace lifecycle target must be the owner'
      USING ERRCODE = '42501';
  END IF;

  IF membership.user_id IS NULL THEN
    RAISE EXCEPTION 'workspace owner Auth identity is missing'
      USING ERRCODE = '55000';
  END IF;

  SELECT lower(btrim(auth_user.email))
  INTO auth_email
  FROM auth.users AS auth_user
  WHERE auth_user.id = membership.user_id
    AND NULLIF(btrim(auth_user.email), '') IS NOT NULL;

  IF NOT FOUND
    OR auth_email IS DISTINCT FROM membership.email_normalized
    OR public.is_platform_admin_email(auth_email)
  THEN
    RAISE EXCEPTION 'workspace owner Auth identity is unsafe'
      USING ERRCODE = '42501';
  END IF;

  desired_status := CASE p_action
    WHEN 'suspend' THEN 'suspended'
    WHEN 'reconcile_suspended' THEN 'suspended'
    ELSE 'active'
  END;
  completion_request_id := 'auth-lifecycle:' || md5(p_lock_token::TEXT);

  IF workspace.status IS DISTINCT FROM desired_status
    OR membership.status IS DISTINCT FROM desired_status
  THEN
    RAISE EXCEPTION 'workspace lifecycle changed during Auth reconciliation'
      USING ERRCODE = '55000';
  END IF;

  SELECT claim.*
  INTO existing_claim
  FROM public.workspace_auth_lifecycle_claims AS claim
  WHERE claim.membership_id = membership.id
  FOR UPDATE;

  IF public.workspace_has_provider_claim_v1(
    workspace.id,
    CASE WHEN FOUND THEN membership.id ELSE NULL END
  ) THEN
    RAISE EXCEPTION 'workspace provider lifecycle is busy'
      USING ERRCODE = '55P03';
  END IF;

  IF NOT FOUND THEN
    IF EXISTS (
      SELECT 1
      FROM public.workspace_audit_log AS audit
      WHERE audit.workspace_id = workspace.id
        AND audit.actor_user_id = p_actor_user_id
        AND audit.action = 'workspace.membership.auth_reconciled'
        AND audit.entity_type = 'workspace_membership'
        AND audit.entity_id = membership.id
        AND audit.request_id = completion_request_id
        AND audit.metadata = jsonb_build_object(
          'action', p_action,
          'desired_status', desired_status
        )
    ) THEN
      RETURN membership;
    END IF;

    RAISE EXCEPTION 'workspace Auth lifecycle claim is required'
      USING ERRCODE = '55000';
  END IF;

  IF existing_claim.lock_token IS DISTINCT FROM p_lock_token THEN
    RAISE EXCEPTION 'workspace Auth lifecycle is busy'
      USING ERRCODE = '55P03';
  END IF;

  IF existing_claim.action IS DISTINCT FROM p_action
    OR existing_claim.desired_status IS DISTINCT FROM desired_status
    OR existing_claim.actor_user_id IS DISTINCT FROM p_actor_user_id
  THEN
    RAISE EXCEPTION 'workspace Auth lifecycle token was reused inconsistently'
      USING ERRCODE = '22023';
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
    workspace.id,
    p_actor_user_id,
    'workspace.membership.auth_reconciled',
    'workspace_membership',
    membership.id,
    jsonb_build_object(
      'action', existing_claim.action,
      'desired_status', existing_claim.desired_status
    ),
    completion_request_id
  );

  DELETE FROM public.workspace_auth_lifecycle_claims AS claim
  WHERE claim.membership_id = membership.id
    AND claim.lock_token = p_lock_token;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'workspace Auth lifecycle claim was lost'
      USING ERRCODE = '55000';
  END IF;

  RETURN membership;
END;
$$;

-- Workspace-level epochs revoke every tenant session after a workspace status
-- transition. Membership epochs continue to revoke only the affected staff
-- account after suspension, revocation, role change, or ownership transfer.
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
    AND token_iat >= workspace.access_not_before_epoch
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
        AND public.current_auth_token_iat()
          >= membership.workspace_access_not_before_epoch
        AND public.current_auth_token_iat()
          >= workspace.access_not_before_epoch
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
        AND public.current_auth_token_iat()
          >= membership.workspace_access_not_before_epoch
        AND public.current_auth_token_iat()
          >= workspace.access_not_before_epoch
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
      AND public.current_auth_token_iat()
        >= workspace_access_not_before_epoch
      AND public.workspace_auth_credential_is_fresh(id)
      AND EXISTS (
        SELECT 1
        FROM public.workspaces AS workspace
        WHERE workspace.id = workspace_memberships.workspace_id
          AND workspace.status = 'active'
          AND public.current_auth_token_iat()
            >= workspace.access_not_before_epoch
      )
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
      AND public.current_auth_token_iat()
        >= workspace_access_not_before_epoch
      AND public.workspace_auth_credential_is_fresh(id)
      AND EXISTS (
        SELECT 1
        FROM public.workspaces AS workspace
        WHERE workspace.id = workspace_memberships.workspace_id
          AND workspace.status = 'active'
          AND public.current_auth_token_iat()
            >= workspace.access_not_before_epoch
      )
    )
  );

-- Platform administrators retain cross-workspace SELECT for an explicitly
-- selected workspace,
-- but browser sessions may mutate client rows only in the platform's default
-- workspace. Private-workspace writes must pass through the audited tenant RPC.
DROP POLICY IF EXISTS clients_workspace_insert ON public.clients;
CREATE POLICY clients_workspace_insert
  ON public.clients
  AS PERMISSIVE
  FOR INSERT
  TO authenticated
  WITH CHECK (
    public.is_platform_admin()
    AND EXISTS (
      SELECT 1
      FROM public.workspaces AS workspace
      WHERE workspace.id = clients.workspace_id
        AND workspace.is_default
        AND workspace.status = 'active'
    )
  );

DROP POLICY IF EXISTS clients_workspace_insert_isolation ON public.clients;
CREATE POLICY clients_workspace_insert_isolation
  ON public.clients
  AS RESTRICTIVE
  FOR INSERT
  TO authenticated
  WITH CHECK (
    public.is_platform_admin()
    AND EXISTS (
      SELECT 1
      FROM public.workspaces AS workspace
      WHERE workspace.id = clients.workspace_id
        AND workspace.is_default
        AND workspace.status = 'active'
    )
  );

DROP POLICY IF EXISTS clients_workspace_update ON public.clients;
CREATE POLICY clients_workspace_update
  ON public.clients
  AS PERMISSIVE
  FOR UPDATE
  TO authenticated
  USING (
    public.is_platform_admin()
    AND EXISTS (
      SELECT 1
      FROM public.workspaces AS workspace
      WHERE workspace.id = clients.workspace_id
        AND workspace.is_default
        AND workspace.status = 'active'
    )
  )
  WITH CHECK (
    public.is_platform_admin()
    AND EXISTS (
      SELECT 1
      FROM public.workspaces AS workspace
      WHERE workspace.id = clients.workspace_id
        AND workspace.is_default
        AND workspace.status = 'active'
    )
  );

DROP POLICY IF EXISTS clients_workspace_update_isolation ON public.clients;
CREATE POLICY clients_workspace_update_isolation
  ON public.clients
  AS RESTRICTIVE
  FOR UPDATE
  TO authenticated
  USING (
    public.is_platform_admin()
    AND EXISTS (
      SELECT 1
      FROM public.workspaces AS workspace
      WHERE workspace.id = clients.workspace_id
        AND workspace.is_default
        AND workspace.status = 'active'
    )
  )
  WITH CHECK (
    public.is_platform_admin()
    AND EXISTS (
      SELECT 1
      FROM public.workspaces AS workspace
      WHERE workspace.id = clients.workspace_id
        AND workspace.is_default
        AND workspace.status = 'active'
    )
  );

DROP POLICY IF EXISTS clients_workspace_delete ON public.clients;
CREATE POLICY clients_workspace_delete
  ON public.clients
  AS PERMISSIVE
  FOR DELETE
  TO authenticated
  USING (
    public.is_platform_admin()
    AND EXISTS (
      SELECT 1
      FROM public.workspaces AS workspace
      WHERE workspace.id = clients.workspace_id
        AND workspace.is_default
        AND workspace.status = 'active'
    )
  );

DROP POLICY IF EXISTS clients_workspace_delete_isolation ON public.clients;
CREATE POLICY clients_workspace_delete_isolation
  ON public.clients
  AS RESTRICTIVE
  FOR DELETE
  TO authenticated
  USING (
    public.is_platform_admin()
    AND EXISTS (
      SELECT 1
      FROM public.workspaces AS workspace
      WHERE workspace.id = clients.workspace_id
        AND workspace.is_default
        AND workspace.status = 'active'
    )
  );

-- The internal client writer accepts either an active tenant manager or the
-- authenticated platform owner. The token-aware v2 wrapper below remains the
-- only executable service entry point and records the real actor in every
-- audit event.
CREATE OR REPLACE FUNCTION public.workspace_client_operation(
  p_action TEXT,
  p_workspace_id UUID,
  p_client_id UUID,
  p_payload JSONB,
  p_actor_user_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  actor_email TEXT;
  actor_is_authorized BOOLEAN := false;
  target_client RECORD;
  result JSONB;
  normalized_name TEXT;
  normalized_email TEXT;
  normalized_contact TEXT;
  normalized_linkedin TEXT;
  normalized_website TEXT;
  normalized_notes TEXT;
  normalized_status TEXT;
BEGIN
  IF p_action IS NULL
    OR p_action NOT IN ('list', 'create', 'update', 'delete')
    OR p_workspace_id IS NULL
    OR p_actor_user_id IS NULL
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

  actor_is_authorized := public.is_platform_admin_identity(
    p_actor_user_id,
    actor_email
  );

  IF NOT actor_is_authorized THEN
    SELECT EXISTS (
      SELECT 1
      FROM public.workspace_memberships AS membership
      JOIN auth.users AS auth_user
        ON auth_user.id = membership.user_id
        AND lower(btrim(auth_user.email)) = membership.email_normalized
      WHERE membership.workspace_id = p_workspace_id
        AND membership.user_id = p_actor_user_id
        AND membership.email_normalized = actor_email
        AND membership.status = 'active'
        AND membership.role IN ('owner', 'admin')
    )
    INTO actor_is_authorized;
  END IF;

  IF NOT actor_is_authorized THEN
    RAISE EXCEPTION 'active workspace manager access is required'
      USING ERRCODE = '42501';
  END IF;

  PERFORM 1
  FROM public.workspaces AS workspace
  WHERE workspace.id = p_workspace_id
    AND workspace.status = 'active'
    AND NOT workspace.is_default
  FOR SHARE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'active workspace manager access is required'
      USING ERRCODE = '42501';
  END IF;

  IF p_action = 'list' THEN
    IF p_client_id IS NOT NULL
      OR COALESCE(p_payload, '{}'::JSONB) <> '{}'::JSONB
    THEN
      RAISE EXCEPTION 'invalid list parameters' USING ERRCODE = '22023';
    END IF;

    SELECT COALESCE(
      jsonb_agg(to_jsonb(safe_client) ORDER BY safe_client.name),
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

  IF p_action IN ('create', 'update') THEN
    IF p_payload IS NULL
      OR jsonb_typeof(p_payload) <> 'object'
      OR EXISTS (
        SELECT 1
        FROM jsonb_object_keys(p_payload) AS payload_key(key)
        WHERE payload_key.key NOT IN (
          'name',
          'email',
          'contact_person',
          'linkedin_url',
          'website',
          'status',
          'notes'
        )
      )
    THEN
      RAISE EXCEPTION 'invalid client payload' USING ERRCODE = '22023';
    END IF;

    normalized_name := NULLIF(btrim(p_payload ->> 'name'), '');
    normalized_email := NULLIF(btrim(p_payload ->> 'email'), '');
    normalized_contact := NULLIF(btrim(p_payload ->> 'contact_person'), '');
    normalized_linkedin := NULLIF(btrim(p_payload ->> 'linkedin_url'), '');
    normalized_website := NULLIF(btrim(p_payload ->> 'website'), '');
    normalized_status := NULLIF(btrim(p_payload ->> 'status'), '');
    normalized_notes := NULLIF(btrim(p_payload ->> 'notes'), '');

    IF normalized_name IS NULL
      OR char_length(normalized_name) > 200
      OR char_length(COALESCE(normalized_email, '')) > 254
      OR char_length(COALESCE(normalized_contact, '')) > 200
      OR char_length(COALESCE(normalized_linkedin, '')) > 2048
      OR char_length(COALESCE(normalized_website, '')) > 2048
      OR (
        normalized_linkedin IS NOT NULL
        AND normalized_linkedin !~* '^https?://[^[:space:][:cntrl:]]+$'
      )
      OR (
        normalized_website IS NOT NULL
        AND normalized_website !~* '^https?://[^[:space:][:cntrl:]]+$'
      )
      OR char_length(COALESCE(normalized_notes, '')) > 10000
      OR normalized_status NOT IN ('active', 'paused', 'churned')
    THEN
      RAISE EXCEPTION 'invalid client fields' USING ERRCODE = '22023';
    END IF;
  END IF;

  IF p_action = 'create' THEN
    IF p_client_id IS NOT NULL THEN
      RAISE EXCEPTION 'client_id is not accepted for create' USING ERRCODE = '22023';
    END IF;

    INSERT INTO public.clients (
      workspace_id,
      name,
      email,
      contact_person,
      linkedin_url,
      website,
      status,
      notes
    )
    VALUES (
      p_workspace_id,
      normalized_name,
      normalized_email,
      normalized_contact,
      normalized_linkedin,
      normalized_website,
      normalized_status,
      normalized_notes
    )
    RETURNING
      id,
      workspace_id,
      name,
      email,
      contact_person,
      linkedin_url,
      website,
      status,
      notes,
      created_at,
      updated_at
    INTO target_client;

    INSERT INTO public.workspace_audit_log (
      workspace_id, actor_user_id, action, entity_type, entity_id, metadata
    )
    VALUES (
      p_workspace_id,
      p_actor_user_id,
      'workspace.client.created',
      'client',
      target_client.id,
      jsonb_build_object('name', target_client.name)
    );

    RETURN to_jsonb(target_client);
  END IF;

  IF p_client_id IS NULL THEN
    RAISE EXCEPTION 'client_id is required' USING ERRCODE = '22023';
  END IF;

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
  INTO target_client
  FROM public.clients AS client
  WHERE client.id = p_client_id
    AND client.workspace_id = p_workspace_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'workspace client not found' USING ERRCODE = 'P0002';
  END IF;

  IF p_action = 'update' THEN
    UPDATE public.clients AS client
    SET
      name = normalized_name,
      email = normalized_email,
      contact_person = normalized_contact,
      linkedin_url = normalized_linkedin,
      website = normalized_website,
      status = normalized_status,
      notes = normalized_notes
    WHERE client.id = p_client_id
      AND client.workspace_id = p_workspace_id
    RETURNING
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
    INTO target_client;

    INSERT INTO public.workspace_audit_log (
      workspace_id, actor_user_id, action, entity_type, entity_id, metadata
    )
    VALUES (
      p_workspace_id,
      p_actor_user_id,
      'workspace.client.updated',
      'client',
      p_client_id,
      jsonb_build_object('name', target_client.name)
    );

    RETURN to_jsonb(target_client);
  END IF;

  IF COALESCE(p_payload, '{}'::JSONB) <> '{}'::JSONB THEN
    RAISE EXCEPTION 'delete does not accept a payload' USING ERRCODE = '22023';
  END IF;

  DELETE FROM public.clients
  WHERE id = p_client_id
    AND workspace_id = p_workspace_id;

  INSERT INTO public.workspace_audit_log (
    workspace_id, actor_user_id, action, entity_type, entity_id, metadata
  )
  VALUES (
    p_workspace_id,
    p_actor_user_id,
    'workspace.client.deleted',
    'client',
    p_client_id,
    jsonb_build_object('name', target_client.name)
  );

  RETURN to_jsonb(target_client);
END;
$$;

-- Members can read the client directory used by every tenant module. Client
-- mutations remain manager/platform-owner operations and retain the existing
-- audited implementation.
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

  IF public.is_platform_admin_identity(p_actor_user_id, actor_email) THEN
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

-- Preserve the established mutation implementation behind a non-RPC name and
-- expose a narrow wrapper that additionally permits member read access.
ALTER FUNCTION public.workspace_guest_resource_operation_v1(
  TEXT, UUID, UUID, JSONB, UUID, BIGINT
) RENAME TO workspace_guest_resource_operation_manager_v1;

REVOKE ALL ON FUNCTION public.workspace_guest_resource_operation_manager_v1(
  TEXT, UUID, UUID, JSONB, UUID, BIGINT
) FROM PUBLIC, anon, authenticated, service_role;

-- Platform-owner mutations use the same validation, workspace binding,
-- assignment replacement, narrow response, and audit contract as tenant
-- managers while retaining the platform actor's real Auth id.
CREATE OR REPLACE FUNCTION public.platform_workspace_guest_resource_mutation_v1(
  p_action TEXT,
  p_workspace_id UUID,
  p_resource_id UUID,
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
  actor_role TEXT;
  normalized_action TEXT := lower(btrim(COALESCE(p_action, '')));
  expected_payload_keys CONSTANT TEXT[] := ARRAY[
    'title',
    'description',
    'content',
    'category',
    'type',
    'url',
    'file_url',
    'featured',
    'display_order',
    'status',
    'visibility',
    'client_ids'
  ];
  normalized_title TEXT;
  normalized_description TEXT;
  normalized_content TEXT;
  normalized_category public.resource_category;
  normalized_type public.resource_type;
  normalized_url TEXT;
  normalized_file_url TEXT;
  normalized_featured BOOLEAN;
  normalized_display_order INTEGER;
  normalized_status TEXT;
  normalized_visibility TEXT;
  normalized_client_ids UUID[] := ARRAY[]::UUID[];
  matching_client_count INTEGER := 0;
  target_resource public.workspace_guest_resources%ROWTYPE;
  previous_client_ids UUID[] := ARRAY[]::UUID[];
  result JSONB;
BEGIN
  IF normalized_action NOT IN ('create', 'update', 'delete')
    OR p_workspace_id IS NULL
    OR p_actor_user_id IS NULL
    OR p_token_issued_at IS NULL
    OR p_token_issued_at < 1
    OR p_token_issued_at > floor(EXTRACT(EPOCH FROM clock_timestamp()))::BIGINT + 300
  THEN
    RAISE EXCEPTION 'invalid platform workspace guest resource mutation'
      USING ERRCODE = '22023';
  END IF;

  actor_role := public.workspace_staff_actor_role_v1(
    p_workspace_id,
    p_actor_user_id,
    p_token_issued_at,
    true
  );

  IF actor_role <> 'platform_admin' THEN
    RAISE EXCEPTION 'platform owner access is required'
      USING ERRCODE = '42501';
  END IF;

  IF normalized_action = 'delete' THEN
    IF p_resource_id IS NULL
      OR COALESCE(p_payload, '{}'::JSONB) <> '{}'::JSONB
    THEN
      RAISE EXCEPTION 'invalid delete parameters' USING ERRCODE = '22023';
    END IF;

    SELECT resource.*
    INTO target_resource
    FROM public.workspace_guest_resources AS resource
    WHERE resource.id = p_resource_id
      AND resource.workspace_id = p_workspace_id
    FOR UPDATE;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'workspace guest resource not found'
        USING ERRCODE = 'P0002';
    END IF;

    SELECT COALESCE(array_agg(link.client_id ORDER BY link.client_id), ARRAY[]::UUID[])
    INTO previous_client_ids
    FROM public.workspace_guest_resource_clients AS link
    WHERE link.resource_id = p_resource_id
      AND link.workspace_id = p_workspace_id;

    DELETE FROM public.workspace_guest_resources
    WHERE id = p_resource_id
      AND workspace_id = p_workspace_id;

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
      'workspace.guest_resource.deleted',
      'workspace_guest_resource',
      p_resource_id,
      jsonb_build_object(
        'title', target_resource.title,
        'status', target_resource.status,
        'visibility', target_resource.visibility,
        'client_count', cardinality(previous_client_ids),
        'source_template_id', target_resource.source_template_id
      )
    );

    RETURN 'null'::JSONB;
  END IF;

  IF p_payload IS NULL
    OR jsonb_typeof(p_payload) <> 'object'
    OR NOT p_payload ?& expected_payload_keys
    OR EXISTS (
      SELECT 1
      FROM jsonb_object_keys(p_payload) AS payload_key(key)
      WHERE payload_key.key <> ALL(expected_payload_keys)
    )
    OR jsonb_typeof(p_payload -> 'title') <> 'string'
    OR jsonb_typeof(p_payload -> 'description') <> 'string'
    OR jsonb_typeof(p_payload -> 'content') NOT IN ('string', 'null')
    OR jsonb_typeof(p_payload -> 'category') <> 'string'
    OR jsonb_typeof(p_payload -> 'type') <> 'string'
    OR jsonb_typeof(p_payload -> 'url') NOT IN ('string', 'null')
    OR jsonb_typeof(p_payload -> 'file_url') NOT IN ('string', 'null')
    OR jsonb_typeof(p_payload -> 'featured') <> 'boolean'
    OR jsonb_typeof(p_payload -> 'display_order') <> 'number'
    OR jsonb_typeof(p_payload -> 'status') <> 'string'
    OR jsonb_typeof(p_payload -> 'visibility') <> 'string'
    OR jsonb_typeof(p_payload -> 'client_ids') <> 'array'
  THEN
    RAISE EXCEPTION 'invalid workspace guest resource payload'
      USING ERRCODE = '22023';
  END IF;

  normalized_title := btrim(p_payload ->> 'title');
  normalized_description := btrim(p_payload ->> 'description');
  normalized_content := NULLIF(btrim(p_payload ->> 'content'), '');
  normalized_url := NULLIF(btrim(p_payload ->> 'url'), '');
  normalized_file_url := NULLIF(btrim(p_payload ->> 'file_url'), '');
  normalized_featured := (p_payload ->> 'featured')::BOOLEAN;
  normalized_status := btrim(p_payload ->> 'status');
  normalized_visibility := btrim(p_payload ->> 'visibility');

  IF (p_payload ->> 'display_order') !~ '^[0-9]+$'
    OR (p_payload ->> 'display_order')::NUMERIC > 1000000
    OR NOT public.guest_resource_text_is_normalized_nonempty(
      normalized_title,
      200
    )
    OR NOT public.guest_resource_text_is_normalized_nonempty(
      normalized_description,
      2000
    )
    OR char_length(COALESCE(normalized_content, '')) > 100000
    OR (
      normalized_content IS NOT NULL
      AND (
        normalized_content !~*
          '^<(p|h[1-6]|ul|ol|blockquote|pre|hr)([[:space:]>])'
        OR right(normalized_content, 1) <> '>'
      )
    )
    OR (
      normalized_url IS NOT NULL
      AND NOT public.guest_resource_http_url_is_safe(normalized_url)
    )
    OR (
      normalized_file_url IS NOT NULL
      AND NOT public.guest_resource_http_url_is_safe(normalized_file_url)
    )
    OR p_payload ->> 'category' NOT IN (
      'preparation',
      'technical_setup',
      'best_practices',
      'promotion',
      'examples',
      'templates'
    )
    OR p_payload ->> 'type' NOT IN ('article', 'video', 'download', 'link')
    OR normalized_status NOT IN ('draft', 'published', 'archived')
    OR normalized_visibility NOT IN ('all_clients', 'selected_clients')
    OR (
      normalized_status = 'published'
      AND (
        (
          p_payload ->> 'type' IN ('video', 'link')
          AND normalized_url IS NULL
        )
        OR (
          p_payload ->> 'type' = 'download'
          AND normalized_file_url IS NULL
        )
        OR (
          p_payload ->> 'type' = 'article'
          AND NOT COALESCE(
            public.guest_resource_content_has_meaningful_text(
              normalized_content
            ),
            false
          )
        )
      )
    )
    OR jsonb_array_length(p_payload -> 'client_ids') > 500
    OR EXISTS (
      SELECT 1
      FROM jsonb_array_elements(p_payload -> 'client_ids') AS client_id(value)
      WHERE jsonb_typeof(client_id.value) <> 'string'
        OR client_id.value #>> '{}' !~*
          '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
    )
    OR jsonb_array_length(p_payload -> 'client_ids') <> (
      SELECT count(DISTINCT lower(client_id.value #>> '{}'))
      FROM jsonb_array_elements(p_payload -> 'client_ids') AS client_id(value)
    )
  THEN
    RAISE EXCEPTION 'invalid workspace guest resource fields'
      USING ERRCODE = '22023';
  END IF;

  normalized_display_order := (p_payload ->> 'display_order')::INTEGER;
  normalized_category := (p_payload ->> 'category')::public.resource_category;
  normalized_type := (p_payload ->> 'type')::public.resource_type;

  SELECT COALESCE(
    array_agg((client_id.value #>> '{}')::UUID ORDER BY client_id.value #>> '{}'),
    ARRAY[]::UUID[]
  )
  INTO normalized_client_ids
  FROM jsonb_array_elements(p_payload -> 'client_ids') AS client_id(value);

  IF (
      normalized_visibility = 'selected_clients'
      AND cardinality(normalized_client_ids) = 0
    ) OR (
      normalized_visibility = 'all_clients'
      AND cardinality(normalized_client_ids) <> 0
    )
  THEN
    RAISE EXCEPTION 'client_ids do not match resource visibility'
      USING ERRCODE = '22023';
  END IF;

  IF cardinality(normalized_client_ids) > 0 THEN
    PERFORM 1
    FROM public.clients AS client
    WHERE client.workspace_id = p_workspace_id
      AND client.id = ANY(normalized_client_ids)
    ORDER BY client.id
    FOR SHARE;
    GET DIAGNOSTICS matching_client_count = ROW_COUNT;

    IF matching_client_count <> cardinality(normalized_client_ids) THEN
      RAISE EXCEPTION 'one or more resource clients are outside the workspace'
        USING ERRCODE = '22023';
    END IF;
  END IF;

  IF normalized_action = 'create' THEN
    IF p_resource_id IS NOT NULL THEN
      RAISE EXCEPTION 'resource_id is not accepted for create'
        USING ERRCODE = '22023';
    END IF;

    INSERT INTO public.workspace_guest_resources (
      workspace_id,
      title,
      description,
      content,
      category,
      type,
      url,
      file_url,
      featured,
      display_order,
      status,
      published_at,
      visibility,
      source_template_id,
      created_by,
      updated_by
    )
    VALUES (
      p_workspace_id,
      normalized_title,
      normalized_description,
      normalized_content,
      normalized_category,
      normalized_type,
      normalized_url,
      normalized_file_url,
      normalized_featured,
      normalized_display_order,
      normalized_status,
      CASE WHEN normalized_status = 'published' THEN now() ELSE NULL END,
      normalized_visibility,
      NULL,
      p_actor_user_id,
      p_actor_user_id
    )
    RETURNING * INTO target_resource;

    INSERT INTO public.workspace_guest_resource_clients (
      workspace_id,
      resource_id,
      client_id,
      created_by
    )
    SELECT
      p_workspace_id,
      target_resource.id,
      assigned_client.client_id,
      p_actor_user_id
    FROM unnest(normalized_client_ids) AS assigned_client(client_id);

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
      'workspace.guest_resource.created',
      'workspace_guest_resource',
      target_resource.id,
      jsonb_build_object(
        'title', target_resource.title,
        'status', target_resource.status,
        'visibility', target_resource.visibility,
        'client_count', cardinality(normalized_client_ids),
        'source_template_id', NULL
      )
    );
  ELSE
    IF normalized_action <> 'update' OR p_resource_id IS NULL THEN
      RAISE EXCEPTION 'resource_id is required for update'
        USING ERRCODE = '22023';
    END IF;

    SELECT resource.*
    INTO target_resource
    FROM public.workspace_guest_resources AS resource
    WHERE resource.id = p_resource_id
      AND resource.workspace_id = p_workspace_id
    FOR UPDATE;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'workspace guest resource not found'
        USING ERRCODE = 'P0002';
    END IF;

    SELECT COALESCE(array_agg(link.client_id ORDER BY link.client_id), ARRAY[]::UUID[])
    INTO previous_client_ids
    FROM public.workspace_guest_resource_clients AS link
    WHERE link.resource_id = p_resource_id
      AND link.workspace_id = p_workspace_id;

    UPDATE public.workspace_guest_resources AS resource
    SET
      title = normalized_title,
      description = normalized_description,
      content = normalized_content,
      category = normalized_category,
      type = normalized_type,
      url = normalized_url,
      file_url = normalized_file_url,
      featured = normalized_featured,
      display_order = normalized_display_order,
      status = normalized_status,
      published_at = CASE
        WHEN normalized_status <> 'published' THEN NULL
        WHEN target_resource.status = 'published' THEN target_resource.published_at
        ELSE now()
      END,
      visibility = normalized_visibility,
      updated_by = p_actor_user_id
    WHERE resource.id = p_resource_id
      AND resource.workspace_id = p_workspace_id
    RETURNING resource.* INTO target_resource;

    DELETE FROM public.workspace_guest_resource_clients
    WHERE resource_id = p_resource_id
      AND workspace_id = p_workspace_id;

    INSERT INTO public.workspace_guest_resource_clients (
      workspace_id,
      resource_id,
      client_id,
      created_by
    )
    SELECT
      p_workspace_id,
      p_resource_id,
      assigned_client.client_id,
      p_actor_user_id
    FROM unnest(normalized_client_ids) AS assigned_client(client_id);

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
      'workspace.guest_resource.updated',
      'workspace_guest_resource',
      p_resource_id,
      jsonb_build_object(
        'title', target_resource.title,
        'status', target_resource.status,
        'visibility', target_resource.visibility,
        'client_count', cardinality(normalized_client_ids),
        'previous_client_count', cardinality(previous_client_ids),
        'source_template_id', target_resource.source_template_id
      )
    );
  END IF;

  SELECT jsonb_build_object(
    'id', resource.id,
    'workspace_id', resource.workspace_id,
    'title', resource.title,
    'description', resource.description,
    'content', resource.content,
    'category', resource.category,
    'type', resource.type,
    'url', resource.url,
    'file_url', resource.file_url,
    'featured', resource.featured,
    'display_order', resource.display_order,
    'status', resource.status,
    'published_at', resource.published_at,
    'visibility', resource.visibility,
    'source_template_id', resource.source_template_id,
    'created_at', resource.created_at,
    'updated_at', resource.updated_at,
    'client_ids', COALESCE(assignment.client_ids, ARRAY[]::UUID[])
  )
  INTO result
  FROM public.workspace_guest_resources AS resource
  LEFT JOIN LATERAL (
    SELECT array_agg(link.client_id ORDER BY link.client_id) AS client_ids
    FROM public.workspace_guest_resource_clients AS link
    WHERE link.workspace_id = resource.workspace_id
      AND link.resource_id = resource.id
  ) AS assignment ON true
  WHERE resource.id = target_resource.id
    AND resource.workspace_id = p_workspace_id;

  RETURN result;
END;
$$;

REVOKE ALL ON FUNCTION public.platform_workspace_guest_resource_mutation_v1(
  TEXT, UUID, UUID, JSONB, UUID, BIGINT
) FROM PUBLIC, anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION public.workspace_guest_resource_operation_v1(
  p_action TEXT,
  p_workspace_id UUID,
  p_resource_id UUID,
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
BEGIN
  IF normalized_action NOT IN ('list', 'create', 'update', 'delete')
    OR p_workspace_id IS NULL
    OR p_actor_user_id IS NULL
    OR p_token_issued_at IS NULL
    OR p_token_issued_at < 1
    OR p_token_issued_at > floor(EXTRACT(EPOCH FROM clock_timestamp()))::BIGINT + 300
  THEN
    RAISE EXCEPTION 'invalid workspace guest resource operation'
      USING ERRCODE = '22023';
  END IF;

  SELECT lower(btrim(auth_user.email))
  INTO actor_email
  FROM auth.users AS auth_user
  WHERE auth_user.id = p_actor_user_id
    AND NULLIF(btrim(auth_user.email), '') IS NOT NULL;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'workspace guest resource actor identity is unavailable'
      USING ERRCODE = '42501';
  END IF;

  IF public.is_platform_admin_identity(p_actor_user_id, actor_email) THEN
    IF normalized_action = 'list' THEN
      -- The established manager function independently verifies the platform
      -- identity for its list path.
      RETURN public.workspace_guest_resource_operation_manager_v1(
        normalized_action,
        p_workspace_id,
        p_resource_id,
        p_payload,
        p_actor_user_id,
        p_token_issued_at
      );
    END IF;

    RETURN public.platform_workspace_guest_resource_mutation_v1(
      normalized_action,
      p_workspace_id,
      p_resource_id,
      p_payload,
      p_actor_user_id,
      p_token_issued_at
    );
  END IF;

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

  IF actor_role IN ('owner', 'admin') THEN
    RETURN public.workspace_guest_resource_operation_manager_v1(
      normalized_action,
      p_workspace_id,
      p_resource_id,
      p_payload,
      p_actor_user_id,
      p_token_issued_at
    );
  END IF;

  IF normalized_action <> 'list' THEN
    RAISE EXCEPTION 'active workspace manager access is required'
      USING ERRCODE = '42501';
  END IF;

  IF p_resource_id IS NOT NULL
    OR COALESCE(p_payload, '{}'::JSONB) <> '{}'::JSONB
  THEN
    RAISE EXCEPTION 'invalid list parameters' USING ERRCODE = '22023';
  END IF;

  SELECT COALESCE(
    jsonb_agg(
      jsonb_build_object(
        'id', resource.id,
        'workspace_id', resource.workspace_id,
        'title', resource.title,
        'description', resource.description,
        'content', resource.content,
        'category', resource.category,
        'type', resource.type,
        'url', resource.url,
        'file_url', resource.file_url,
        'featured', resource.featured,
        'display_order', resource.display_order,
        'status', resource.status,
        'published_at', resource.published_at,
        'visibility', resource.visibility,
        'source_template_id', resource.source_template_id,
        'created_at', resource.created_at,
        'updated_at', resource.updated_at,
        'client_ids', COALESCE(assignment.client_ids, ARRAY[]::UUID[])
      )
      ORDER BY
        resource.featured DESC,
        resource.display_order,
        resource.title,
        resource.id
    ),
    '[]'::JSONB
  )
  INTO result
  FROM public.workspace_guest_resources AS resource
  LEFT JOIN LATERAL (
    SELECT array_agg(link.client_id ORDER BY link.client_id) AS client_ids
    FROM public.workspace_guest_resource_clients AS link
    WHERE link.workspace_id = resource.workspace_id
      AND link.resource_id = resource.id
  ) AS assignment ON true
  WHERE resource.workspace_id = p_workspace_id;

  RETURN result;
END;
$$;

-- Trigger and authorization helpers are implementation details. SECURITY
-- DEFINER public entry points remain callable only by trusted Edge Functions.
REVOKE ALL ON FUNCTION public.enforce_private_workspace_staff_invariants()
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.advance_workspace_access_epoch_on_status_change()
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.lock_workspace_provider_lifecycle_v1(UUID)
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.workspace_user_has_provider_claim_v1(UUID)
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.workspace_membership_has_provider_claim_v1(UUID)
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.workspace_has_provider_claim_v1(UUID, UUID)
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.workspace_staff_actor_role_v1(
  UUID, UUID, BIGINT, BOOLEAN
) FROM PUBLIC, anon, authenticated, service_role;

-- The original client function has no token epoch parameter. Keep it as an
-- implementation detail called by v2 after v2 has revalidated the actor.
REVOKE ALL ON FUNCTION public.workspace_client_operation(
  TEXT, UUID, UUID, JSONB, UUID
) FROM PUBLIC, anon, authenticated, service_role;

-- Lifecycle claims are the only supported entry point for the legacy
-- platform workspace transition. Prevent a service caller from bypassing the
-- durable provider claim and directly coupling a membership to workspace state.
REVOKE ALL ON FUNCTION public.transition_workspace_membership(
  UUID, TEXT, UUID
) FROM PUBLIC, anon, authenticated, service_role;

REVOKE ALL ON FUNCTION public.claim_workspace_auth_lifecycle(
  UUID, TEXT, UUID, UUID
) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.claim_workspace_auth_lifecycle(
  UUID, TEXT, UUID, UUID
) TO service_role;

REVOKE ALL ON FUNCTION public.complete_workspace_auth_lifecycle(
  UUID, TEXT, UUID, UUID
) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.complete_workspace_auth_lifecycle(
  UUID, TEXT, UUID, UUID
) TO service_role;

REVOKE ALL ON FUNCTION public.workspace_staff_list_v1(
  UUID, UUID, BIGINT
) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.workspace_staff_list_v1(
  UUID, UUID, BIGINT
) TO service_role;

REVOKE ALL ON FUNCTION public.begin_workspace_staff_invite_v1(
  UUID, TEXT, TEXT, TEXT, UUID, BIGINT
) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.begin_workspace_staff_invite_v1(
  UUID, TEXT, TEXT, TEXT, UUID, BIGINT
) TO service_role;

REVOKE ALL ON FUNCTION public.claim_workspace_staff_invite_delivery_v1(
  UUID, UUID, UUID, BIGINT, UUID
) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.claim_workspace_staff_invite_delivery_v1(
  UUID, UUID, UUID, BIGINT, UUID
) TO service_role;

REVOKE ALL ON FUNCTION public.find_workspace_staff_invite_auth_user_v1(
  UUID, UUID, UUID, BIGINT, UUID
) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.find_workspace_staff_invite_auth_user_v1(
  UUID, UUID, UUID, BIGINT, UUID
) TO service_role;

REVOKE ALL ON FUNCTION public.finalize_workspace_staff_invite_v1(
  UUID, UUID, UUID, BIGINT, UUID, UUID
) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.finalize_workspace_staff_invite_v1(
  UUID, UUID, UUID, BIGINT, UUID, UUID
) TO service_role;

REVOKE ALL ON FUNCTION public.revoke_workspace_staff_account_v1(
  UUID, UUID, UUID, BIGINT, UUID
) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.revoke_workspace_staff_account_v1(
  UUID, UUID, UUID, BIGINT, UUID
) TO service_role;

REVOKE ALL ON FUNCTION public.claim_workspace_staff_auth_lifecycle_v1(
  UUID, UUID, TEXT, UUID, BIGINT, UUID
) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.claim_workspace_staff_auth_lifecycle_v1(
  UUID, UUID, TEXT, UUID, BIGINT, UUID
) TO service_role;

REVOKE ALL ON FUNCTION public.complete_workspace_staff_auth_lifecycle_v1(
  UUID, UUID, TEXT, UUID, BIGINT, UUID
) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.complete_workspace_staff_auth_lifecycle_v1(
  UUID, UUID, TEXT, UUID, BIGINT, UUID
) TO service_role;

REVOKE ALL ON FUNCTION public.update_workspace_staff_role_v1(
  UUID, UUID, TEXT, UUID, BIGINT
) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.update_workspace_staff_role_v1(
  UUID, UUID, TEXT, UUID, BIGINT
) TO service_role;

REVOKE ALL ON FUNCTION public.transfer_workspace_owner_v1(
  UUID, UUID, UUID, BIGINT
) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.transfer_workspace_owner_v1(
  UUID, UUID, UUID, BIGINT
) TO service_role;

REVOKE ALL ON FUNCTION public.workspace_client_operation_v2(
  TEXT, UUID, UUID, JSONB, UUID, BIGINT
) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.workspace_client_operation_v2(
  TEXT, UUID, UUID, JSONB, UUID, BIGINT
) TO service_role;

REVOKE ALL ON FUNCTION public.workspace_guest_resource_operation_v1(
  TEXT, UUID, UUID, JSONB, UUID, BIGINT
) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.workspace_guest_resource_operation_v1(
  TEXT, UUID, UUID, JSONB, UUID, BIGINT
) TO service_role;

COMMENT ON COLUMN public.workspaces.access_not_before_epoch IS
  'Minimum Auth token iat accepted for any tenant member of this workspace.';
COMMENT ON INDEX public.workspace_memberships_one_live_owner_idx IS
  'Immediate upper bound of one live owner per workspace; a deferred trigger enforces the owner floor.';
COMMENT ON FUNCTION public.workspace_staff_list_v1(UUID, UUID, BIGINT) IS
  'Returns the bounded workspace staff roster and owner-equivalent platform management capabilities without exposing Auth ids or security epochs.';
COMMENT ON FUNCTION public.begin_workspace_staff_invite_v1(
  UUID, TEXT, TEXT, TEXT, UUID, BIGINT
) IS
  'Begins a service-delivered invitation for a non-owner workspace staff account under the owner/admin/platform hierarchy.';
COMMENT ON FUNCTION public.claim_workspace_staff_auth_lifecycle_v1(
  UUID, UUID, TEXT, UUID, BIGINT, UUID
) IS
  'Atomically claims and applies a membership-only staff suspend/reactivate transition; workspace and client portal state are untouched.';
COMMENT ON FUNCTION public.complete_workspace_staff_auth_lifecycle_v1(
  UUID, UUID, TEXT, UUID, BIGINT, UUID
) IS
  'Completes the exact durable staff Auth lifecycle claim after provider reconciliation.';
COMMENT ON FUNCTION public.update_workspace_staff_role_v1(
  UUID, UUID, TEXT, UUID, BIGINT
) IS
  'Lets the current workspace owner or platform owner change a non-owner staff role between admin and member while revoking stale sessions.';
COMMENT ON FUNCTION public.transfer_workspace_owner_v1(
  UUID, UUID, UUID, BIGINT
) IS
  'Lets the current workspace owner or platform owner atomically transfer the sole live owner role to another active accepted staff account.';
COMMENT ON FUNCTION public.workspace_client_operation_v2(
  TEXT, UUID, UUID, JSONB, UUID, BIGINT
) IS
  'Workspace-epoch-aware client operation: every active staff role may list; owner/admin roles and the platform owner may mutate.';
COMMENT ON FUNCTION public.workspace_guest_resource_operation_v1(
  TEXT, UUID, UUID, JSONB, UUID, BIGINT
) IS
  'Workspace-epoch-aware guest-resource operation: every active staff role may list; owner/admin roles and the platform owner may mutate.';

COMMIT;
