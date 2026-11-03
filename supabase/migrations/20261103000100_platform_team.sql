-- Platform team: invite, promote and remove the people who run the platform.
--
-- A platform administrator is an admin_users row plus an ACTIVE membership in
-- the default workspace (public.is_platform_admin_identity). Until now both
-- halves were written by hand in SQL, because every staff mutation refuses the
-- default workspace and manage-admin-users is a 410 tombstone.
--
-- This migration adds a narrow path for the default workspace only:
--
--   * begin_platform_admin_invite_v1 creates a provisioning membership in the
--     default workspace and records it in platform_admin_invitations. The
--     existing claim_workspace_invite_delivery / finalize_workspace_invite /
--     find_workspace_invite_auth_user / release_workspace_invite_delivery_claim
--     functions deliver it unchanged: they are keyed by membership and only
--     require a platform-admin actor.
--   * The admin_users row is NOT written at invite time. finalize and the Auth
--     cleanup lookup refuse identities that are already platform admins, so the
--     grant happens when the invite is accepted, in the same transaction, by
--     grant_platform_admin_on_invite_acceptance.
--   * revoke_platform_admin_invite_v1 cancels a pending invite. It is
--     revoke_workspace_invite without the private-workspace teardown (it never
--     archives a workspace or deletes portal sessions).
--   * grant_platform_admin_v1 promotes an active default-workspace member.
--   * remove_platform_team_member_v1 deletes the admin_users row and revokes the
--     default-workspace membership. The status change advances the member's
--     access epoch (advance_workspace_access_epoch_on_disable), so sessions they
--     already hold stop working at once.
--
-- Every mutation requires the actor to be the OWNER of the default workspace
-- with a fresh token. Other platform admins can read the team, not change it.
-- The owner can never be removed here and nobody can remove themselves, so the
-- platform always keeps at least one administrator.

BEGIN;

CREATE TABLE IF NOT EXISTS public.platform_admin_invitations (
  membership_id UUID PRIMARY KEY
    REFERENCES public.workspace_memberships(id) ON DELETE CASCADE,
  invited_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.platform_admin_invitations ENABLE ROW LEVEL SECURITY;
REVOKE ALL PRIVILEGES ON TABLE public.platform_admin_invitations
  FROM PUBLIC, anon, authenticated, service_role;

COMMENT ON TABLE public.platform_admin_invitations IS
  'Default-workspace memberships created as platform administrator invitations. Accepting one grants admin_users; only SECURITY DEFINER functions read or write it.';

-- The caller's own default-workspace membership, after proving they are a
-- platform administrator whose token is not older than any access epoch.
CREATE OR REPLACE FUNCTION public.platform_team_actor_v1(
  p_actor_user_id UUID,
  p_token_issued_at BIGINT
)
RETURNS public.workspace_memberships
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  actor_email TEXT;
  actor_membership public.workspace_memberships%ROWTYPE;
BEGIN
  IF p_actor_user_id IS NULL
    OR p_token_issued_at IS NULL
    OR p_token_issued_at < 1
    OR p_token_issued_at > floor(EXTRACT(EPOCH FROM clock_timestamp()))::BIGINT + 300
  THEN
    RAISE EXCEPTION 'invalid platform team actor context'
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

  SELECT membership.*
  INTO actor_membership
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

  RETURN actor_membership;
END;
$$;
REVOKE ALL ON FUNCTION public.platform_team_actor_v1(UUID, BIGINT)
  FROM PUBLIC, anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION public.platform_team_owner_v1(
  p_actor_user_id UUID,
  p_token_issued_at BIGINT
)
RETURNS public.workspace_memberships
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  actor_membership public.workspace_memberships%ROWTYPE;
BEGIN
  actor_membership := public.platform_team_actor_v1(p_actor_user_id, p_token_issued_at);
  IF actor_membership.role <> 'owner' THEN
    RAISE EXCEPTION 'only the platform owner can change the platform team'
      USING ERRCODE = '42501';
  END IF;
  RETURN actor_membership;
END;
$$;
REVOKE ALL ON FUNCTION public.platform_team_owner_v1(UUID, BIGINT)
  FROM PUBLIC, anon, authenticated, service_role;

-- The default-workspace roster with each person's platform standing. Pending
-- invitations are included; revoked history is not.
CREATE OR REPLACE FUNCTION public.platform_team_list_v1(
  p_actor_user_id UUID,
  p_token_issued_at BIGINT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  actor_membership public.workspace_memberships%ROWTYPE;
  members JSONB;
BEGIN
  actor_membership := public.platform_team_actor_v1(p_actor_user_id, p_token_issued_at);

  SELECT COALESCE(jsonb_agg(row_data ORDER BY sort_status, sort_name), '[]'::JSONB)
  INTO members
  FROM (
    SELECT
      jsonb_build_object(
        'id', membership.id,
        'email', membership.email_normalized,
        'full_name', membership.full_name,
        'role', membership.role,
        'status', membership.status,
        'invited_at', membership.invited_at,
        'invite_expires_at', membership.invite_expires_at,
        'accepted_at', membership.accepted_at,
        'platform_admin', public.is_platform_admin_email(membership.email_normalized),
        'platform_invite', EXISTS (
          SELECT 1
          FROM public.platform_admin_invitations AS invitation
          WHERE invitation.membership_id = membership.id
        ),
        'delivery_pending', EXISTS (
          SELECT 1
          FROM public.workspace_invite_delivery_claims AS claim
          WHERE claim.membership_id = membership.id
        ),
        'is_self', membership.id = actor_membership.id
      ) AS row_data,
      CASE membership.status
        WHEN 'active' THEN 0
        WHEN 'invited' THEN 1
        WHEN 'provisioning' THEN 2
        ELSE 3
      END AS sort_status,
      lower(COALESCE(membership.full_name, membership.email_normalized)) AS sort_name
    FROM public.workspace_memberships AS membership
    WHERE membership.workspace_id = actor_membership.workspace_id
      AND (
        membership.status IN ('provisioning', 'invited', 'active', 'suspended')
        -- A cancelled invite still holding an Auth-cleanup claim needs a
        -- visible row so the owner can finish the cleanup.
        OR EXISTS (
          SELECT 1
          FROM public.workspace_invite_delivery_claims AS claim
          WHERE claim.membership_id = membership.id
        )
      )
    LIMIT 200
  ) AS roster;

  RETURN jsonb_build_object(
    'workspace_id', actor_membership.workspace_id,
    'can_manage', actor_membership.role = 'owner',
    'members', members
  );
END;
$$;
REVOKE ALL ON FUNCTION public.platform_team_list_v1(UUID, BIGINT)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.platform_team_list_v1(UUID, BIGINT)
  TO service_role;

CREATE OR REPLACE FUNCTION public.begin_platform_admin_invite_v1(
  p_email TEXT,
  p_full_name TEXT,
  p_actor_user_id UUID,
  p_token_issued_at BIGINT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  actor_membership public.workspace_memberships%ROWTYPE;
  membership public.workspace_memberships%ROWTYPE;
  normalized_email TEXT := lower(btrim(p_email));
  normalized_full_name TEXT := NULLIF(btrim(p_full_name), '');
  workspace public.workspaces%ROWTYPE;
BEGIN
  actor_membership := public.platform_team_owner_v1(p_actor_user_id, p_token_issued_at);

  IF normalized_email IS NULL
    OR normalized_email !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'
    OR char_length(normalized_email) > 254
    OR char_length(COALESCE(normalized_full_name, '')) > 120
  THEN
    RAISE EXCEPTION 'invalid platform admin invitation fields'
      USING ERRCODE = '22023';
  END IF;

  IF public.is_platform_admin_email(normalized_email) THEN
    RAISE EXCEPTION 'this email is already a platform administrator'
      USING ERRCODE = '23505';
  END IF;

  SELECT existing_workspace.*
  INTO workspace
  FROM public.workspaces AS existing_workspace
  WHERE existing_workspace.id = actor_membership.workspace_id
    AND existing_workspace.is_default
    AND existing_workspace.status = 'active'
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'active default workspace not found'
      USING ERRCODE = 'P0002';
  END IF;

  -- Same lock order as every other invitation: all same-email memberships,
  -- by id, before any existence check.
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
    RAISE EXCEPTION 'workspace account already exists for this email'
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
    workspace.id,
    NULL,
    normalized_email,
    normalized_full_name,
    'admin',
    'provisioning',
    NULL,
    p_actor_user_id,
    'email_invite',
    false,
    0
  )
  RETURNING * INTO membership;

  INSERT INTO public.platform_admin_invitations (membership_id, invited_by)
  VALUES (membership.id, p_actor_user_id);

  INSERT INTO public.workspace_audit_log (
    workspace_id, actor_user_id, action, entity_type, entity_id, metadata
  )
  VALUES (
    workspace.id,
    p_actor_user_id,
    'platform.team.invite_provisioning_started',
    'workspace_membership',
    membership.id,
    jsonb_build_object('email', normalized_email)
  );

  RETURN jsonb_build_object(
    'workspace', to_jsonb(workspace),
    'membership', to_jsonb(membership)
  );
END;
$$;
REVOKE ALL ON FUNCTION public.begin_platform_admin_invite_v1(TEXT, TEXT, UUID, BIGINT)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.begin_platform_admin_invite_v1(TEXT, TEXT, UUID, BIGINT)
  TO service_role;

-- The pending platform invitation to resend, with its workspace. Owner only;
-- delivery itself goes through the shared claim/finalize functions.
CREATE OR REPLACE FUNCTION public.platform_admin_invite_for_resend_v1(
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
  actor_membership public.workspace_memberships%ROWTYPE;
  membership public.workspace_memberships%ROWTYPE;
  workspace public.workspaces%ROWTYPE;
BEGIN
  IF p_membership_id IS NULL THEN
    RAISE EXCEPTION 'membership_id is required' USING ERRCODE = '22023';
  END IF;

  actor_membership := public.platform_team_owner_v1(p_actor_user_id, p_token_issued_at);

  SELECT existing_membership.*
  INTO membership
  FROM public.workspace_memberships AS existing_membership
  JOIN public.platform_admin_invitations AS invitation
    ON invitation.membership_id = existing_membership.id
  WHERE existing_membership.id = p_membership_id
    AND existing_membership.workspace_id = actor_membership.workspace_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'workspace invitation not found' USING ERRCODE = 'P0002';
  END IF;

  IF membership.status NOT IN ('provisioning', 'invited') THEN
    RAISE EXCEPTION 'workspace invitation is not pending' USING ERRCODE = '55000';
  END IF;

  SELECT existing_workspace.*
  INTO workspace
  FROM public.workspaces AS existing_workspace
  WHERE existing_workspace.id = membership.workspace_id;

  RETURN jsonb_build_object(
    'workspace', to_jsonb(workspace),
    'membership', to_jsonb(membership)
  );
END;
$$;
REVOKE ALL ON FUNCTION public.platform_admin_invite_for_resend_v1(UUID, UUID, BIGINT)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.platform_admin_invite_for_resend_v1(UUID, UUID, BIGINT)
  TO service_role;

-- revoke_workspace_invite, narrowed to platform admin invitations in the
-- default workspace and without the private-workspace teardown. The Auth
-- cleanup that follows uses the shared find/release functions, which this
-- revoke_cleanup claim feeds.
CREATE OR REPLACE FUNCTION public.revoke_platform_admin_invite_v1(
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
  actor_membership public.workspace_memberships%ROWTYPE;
  existing_claim public.workspace_invite_delivery_claims%ROWTYPE;
  membership public.workspace_memberships%ROWTYPE;
BEGIN
  IF p_membership_id IS NULL OR p_lock_token IS NULL THEN
    RAISE EXCEPTION 'membership_id and lock_token are required'
      USING ERRCODE = '22023';
  END IF;

  actor_membership := public.platform_team_owner_v1(p_actor_user_id, p_token_issued_at);

  SELECT existing_membership.*
  INTO membership
  FROM public.workspace_memberships AS existing_membership
  WHERE existing_membership.id = p_membership_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'workspace invitation not found'
      USING ERRCODE = 'P0002';
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

  IF NOT FOUND
    OR membership.workspace_id <> actor_membership.workspace_id
    OR NOT EXISTS (
      SELECT 1
      FROM public.platform_admin_invitations AS invitation
      WHERE invitation.membership_id = membership.id
    )
  THEN
    RAISE EXCEPTION 'workspace invitation not found'
      USING ERRCODE = 'P0002';
  END IF;

  -- A pending platform invitation has no admin_users row yet. If one exists
  -- the person is (or became) an administrator and must be removed instead.
  IF public.is_platform_admin_email(membership.email_normalized) THEN
    RAISE EXCEPTION 'platform administrators cannot be changed here'
      USING ERRCODE = '42501';
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
    RAISE EXCEPTION 'historical workspace invitation is superseded for this email'
      USING ERRCODE = '55000';
  END IF;

  SELECT claim.*
  INTO existing_claim
  FROM public.workspace_invite_delivery_claims AS claim
  WHERE claim.membership_id = membership.id
  FOR UPDATE;

  IF FOUND
    AND existing_claim.lock_token IS DISTINCT FROM p_lock_token
  THEN
    RAISE EXCEPTION 'workspace invite delivery is busy'
      USING ERRCODE = '55P03';
  END IF;

  IF FOUND
    AND existing_claim.lock_token = p_lock_token
    AND (
      existing_claim.actor_user_id IS DISTINCT FROM p_actor_user_id
      OR existing_claim.claim_kind <> 'revoke_cleanup'
    )
  THEN
    RAISE EXCEPTION 'workspace invite revocation token was reused inconsistently'
      USING ERRCODE = '22023';
  END IF;

  IF FOUND THEN
    IF membership.status <> 'revoked' THEN
      RAISE EXCEPTION 'workspace invite revocation claim is inconsistent'
        USING ERRCODE = '55000';
    END IF;
    RETURN membership;
  END IF;

  IF membership.status NOT IN ('provisioning', 'invited', 'revoked') THEN
    RAISE EXCEPTION 'workspace invitation is not pending'
      USING ERRCODE = '55000';
  END IF;

  IF membership.status <> 'revoked' THEN
    UPDATE public.workspace_memberships
    SET
      status = 'revoked',
      revoked_at = now(),
      revoked_by = p_actor_user_id
    WHERE id = membership.id
      AND status IN ('provisioning', 'invited')
    RETURNING * INTO membership;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'workspace invitation revocation failed'
        USING ERRCODE = '55000';
    END IF;

    INSERT INTO public.workspace_audit_log (
      workspace_id, actor_user_id, action, entity_type, entity_id, metadata
    )
    VALUES (
      membership.workspace_id,
      p_actor_user_id,
      'platform.team.invite_revoked',
      'workspace_membership',
      membership.id,
      jsonb_build_object('email', membership.email_normalized)
    );
  END IF;

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

  RETURN membership;
END;
$$;
REVOKE ALL ON FUNCTION public.revoke_platform_admin_invite_v1(UUID, UUID, BIGINT, UUID)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.revoke_platform_admin_invite_v1(UUID, UUID, BIGINT, UUID)
  TO service_role;

-- Promote someone who already works in the default workspace.
CREATE OR REPLACE FUNCTION public.grant_platform_admin_v1(
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
  actor_email TEXT;
  actor_membership public.workspace_memberships%ROWTYPE;
  auth_email TEXT;
  membership public.workspace_memberships%ROWTYPE;
BEGIN
  IF p_membership_id IS NULL THEN
    RAISE EXCEPTION 'membership_id is required' USING ERRCODE = '22023';
  END IF;

  actor_membership := public.platform_team_owner_v1(p_actor_user_id, p_token_issued_at);
  actor_email := actor_membership.email_normalized;

  SELECT existing_membership.*
  INTO membership
  FROM public.workspace_memberships AS existing_membership
  WHERE existing_membership.id = p_membership_id
    AND existing_membership.workspace_id = actor_membership.workspace_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'platform team member not found' USING ERRCODE = 'P0002';
  END IF;

  IF membership.status <> 'active' OR membership.user_id IS NULL THEN
    RAISE EXCEPTION 'only an active team member can be made a platform administrator'
      USING ERRCODE = '55000';
  END IF;

  -- The grant is keyed by email, so it must match the bound Auth identity.
  SELECT lower(btrim(auth_user.email))
  INTO auth_email
  FROM auth.users AS auth_user
  WHERE auth_user.id = membership.user_id;

  IF auth_email IS DISTINCT FROM membership.email_normalized THEN
    RAISE EXCEPTION 'platform team member identity mismatch'
      USING ERRCODE = '42501';
  END IF;

  IF public.is_platform_admin_email(membership.email_normalized) THEN
    RAISE EXCEPTION 'this email is already a platform administrator'
      USING ERRCODE = '23505';
  END IF;

  INSERT INTO public.admin_users (email, name, added_by)
  VALUES (membership.email_normalized, membership.full_name, actor_email);

  INSERT INTO public.workspace_audit_log (
    workspace_id, actor_user_id, action, entity_type, entity_id, metadata
  )
  VALUES (
    membership.workspace_id,
    p_actor_user_id,
    'platform.team.admin_granted',
    'workspace_membership',
    membership.id,
    jsonb_build_object('email', membership.email_normalized)
  );

  RETURN jsonb_build_object('id', membership.id, 'email', membership.email_normalized);
END;
$$;
REVOKE ALL ON FUNCTION public.grant_platform_admin_v1(UUID, UUID, BIGINT)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.grant_platform_admin_v1(UUID, UUID, BIGINT)
  TO service_role;

-- Remove someone from the platform team entirely: platform access and their
-- default-workspace membership go together.
CREATE OR REPLACE FUNCTION public.remove_platform_team_member_v1(
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
  actor_membership public.workspace_memberships%ROWTYPE;
  membership public.workspace_memberships%ROWTYPE;
  was_platform_admin BOOLEAN;
BEGIN
  IF p_membership_id IS NULL THEN
    RAISE EXCEPTION 'membership_id is required' USING ERRCODE = '22023';
  END IF;

  actor_membership := public.platform_team_owner_v1(p_actor_user_id, p_token_issued_at);

  SELECT existing_membership.*
  INTO membership
  FROM public.workspace_memberships AS existing_membership
  WHERE existing_membership.id = p_membership_id
    AND existing_membership.workspace_id = actor_membership.workspace_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'platform team member not found' USING ERRCODE = 'P0002';
  END IF;

  IF membership.id = actor_membership.id THEN
    RAISE EXCEPTION 'you cannot remove yourself from the platform team'
      USING ERRCODE = '42501';
  END IF;

  IF membership.role = 'owner' THEN
    RAISE EXCEPTION 'the platform owner cannot be removed'
      USING ERRCODE = '42501';
  END IF;

  IF membership.status NOT IN ('active', 'suspended') THEN
    RAISE EXCEPTION 'only an active or suspended team member can be removed; cancel a pending invitation instead'
      USING ERRCODE = '55000';
  END IF;

  was_platform_admin := public.is_platform_admin_email(membership.email_normalized);

  DELETE FROM public.admin_users AS admin_user
  WHERE lower(btrim(admin_user.email)) = membership.email_normalized;

  -- The BEFORE UPDATE OF status trigger advances workspace_access_not_before_
  -- epoch, so every token issued before this moment stops authorizing.
  UPDATE public.workspace_memberships
  SET
    status = 'revoked',
    revoked_at = now(),
    revoked_by = p_actor_user_id
  WHERE id = membership.id
  RETURNING * INTO membership;

  INSERT INTO public.workspace_audit_log (
    workspace_id, actor_user_id, action, entity_type, entity_id, metadata
  )
  VALUES (
    membership.workspace_id,
    p_actor_user_id,
    'platform.team.member_removed',
    'workspace_membership',
    membership.id,
    jsonb_build_object(
      'email', membership.email_normalized,
      'was_platform_admin', was_platform_admin
    )
  );

  RETURN jsonb_build_object('id', membership.id, 'email', membership.email_normalized);
END;
$$;
REVOKE ALL ON FUNCTION public.remove_platform_team_member_v1(UUID, UUID, BIGINT)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.remove_platform_team_member_v1(UUID, UUID, BIGINT)
  TO service_role;

-- Accepting a platform invitation grants platform access in the same
-- transaction as the acceptance itself.
CREATE OR REPLACE FUNCTION public.grant_platform_admin_on_invite_acceptance()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  inviter_email TEXT;
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM public.platform_admin_invitations AS invitation
    JOIN public.workspaces AS workspace
      ON workspace.id = NEW.workspace_id
      AND workspace.is_default
    WHERE invitation.membership_id = NEW.id
  ) THEN
    RETURN NULL;
  END IF;

  SELECT lower(btrim(auth_user.email))
  INTO inviter_email
  FROM public.platform_admin_invitations AS invitation
  JOIN auth.users AS auth_user
    ON auth_user.id = invitation.invited_by
  WHERE invitation.membership_id = NEW.id;

  INSERT INTO public.admin_users (email, name, added_by)
  VALUES (NEW.email_normalized, NEW.full_name, COALESCE(inviter_email, 'platform-invite'))
  ON CONFLICT DO NOTHING;

  INSERT INTO public.workspace_audit_log (
    workspace_id, actor_user_id, action, entity_type, entity_id, metadata
  )
  VALUES (
    NEW.workspace_id,
    NEW.user_id,
    'platform.team.admin_granted',
    'workspace_membership',
    NEW.id,
    jsonb_build_object('email', NEW.email_normalized, 'via', 'invite_acceptance')
  );

  RETURN NULL;
END;
$$;
REVOKE ALL ON FUNCTION public.grant_platform_admin_on_invite_acceptance()
  FROM PUBLIC, anon, authenticated, service_role;

DROP TRIGGER IF EXISTS workspace_memberships_grant_platform_admin
  ON public.workspace_memberships;
CREATE TRIGGER workspace_memberships_grant_platform_admin
  AFTER UPDATE OF status ON public.workspace_memberships
  FOR EACH ROW
  WHEN (NEW.status = 'active' AND OLD.status IS DISTINCT FROM 'active')
  EXECUTE FUNCTION public.grant_platform_admin_on_invite_acceptance();

COMMENT ON FUNCTION public.platform_team_list_v1(UUID, BIGINT) IS
  'Default-workspace roster with platform-admin standing; any platform administrator may read it.';
COMMENT ON FUNCTION public.begin_platform_admin_invite_v1(TEXT, TEXT, UUID, BIGINT) IS
  'Platform owner only: starts a default-workspace invitation that grants platform administration when accepted.';
COMMENT ON FUNCTION public.revoke_platform_admin_invite_v1(UUID, UUID, BIGINT, UUID) IS
  'Platform owner only: cancels a pending platform invitation and takes the Auth-cleanup claim, without any private-workspace teardown.';
COMMENT ON FUNCTION public.grant_platform_admin_v1(UUID, UUID, BIGINT) IS
  'Platform owner only: makes an active default-workspace member a platform administrator.';
COMMENT ON FUNCTION public.remove_platform_team_member_v1(UUID, UUID, BIGINT) IS
  'Platform owner only: removes platform access and revokes the default-workspace membership; never the owner or the caller.';

COMMIT;
