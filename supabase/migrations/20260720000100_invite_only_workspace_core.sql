-- Invite-only workspace foundation.
-- This migration is intentionally additive and keeps the legacy admin_users
-- table as the platform-admin bootstrap during the tenant rollout.

BEGIN;

-- Serialize bootstrap work if two deployment jobs race.
SELECT pg_advisory_xact_lock(hashtextextended('goap:invite-only-workspace-core:v1', 0));

-- Platform access is bootstrapped from this legacy allowlist. Empty or
-- case-duplicated addresses would make that boundary ambiguous, so fail the
-- release transaction before any RLS policy begins trusting it.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conrelid = 'public.admin_users'::regclass
      AND conname = 'admin_users_email_nonblank_check'
  ) THEN
    ALTER TABLE public.admin_users
      ADD CONSTRAINT admin_users_email_nonblank_check
      CHECK (NULLIF(btrim(email), '') IS NOT NULL) NOT VALID;
  END IF;
END;
$$;

ALTER TABLE public.admin_users
  VALIDATE CONSTRAINT admin_users_email_nonblank_check;

CREATE UNIQUE INDEX IF NOT EXISTS admin_users_email_normalized_uidx
  ON public.admin_users (lower(btrim(email)));

CREATE TABLE IF NOT EXISTS public.workspaces (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL CHECK (char_length(btrim(name)) BETWEEN 1 AND 120),
  slug TEXT NOT NULL UNIQUE CHECK (
    slug = lower(slug)
    AND slug ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'
  ),
  status TEXT NOT NULL DEFAULT 'active'
    CHECK (status IN ('active', 'suspended', 'archived')),
  is_default BOOLEAN NOT NULL DEFAULT false,
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS workspaces_one_default_idx
  ON public.workspaces (is_default)
  WHERE is_default;

CREATE INDEX IF NOT EXISTS workspaces_status_idx
  ON public.workspaces (status);

CREATE TABLE IF NOT EXISTS public.workspace_memberships (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL
    REFERENCES public.workspaces(id) ON DELETE RESTRICT,
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  email_normalized TEXT NOT NULL CHECK (
    email_normalized = lower(btrim(email_normalized))
    AND email_normalized ~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'
  ),
  full_name TEXT,
  role TEXT NOT NULL DEFAULT 'member'
    CHECK (role IN ('owner', 'admin', 'member')),
  status TEXT NOT NULL DEFAULT 'invited'
    CHECK (status IN ('invited', 'active', 'suspended', 'revoked')),
  invite_expires_at TIMESTAMPTZ,
  invited_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  invited_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  accepted_at TIMESTAMPTZ,
  accepted_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  suspended_at TIMESTAMPTZ,
  suspended_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  revoked_at TIMESTAMPTZ,
  revoked_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT workspace_memberships_live_user_check CHECK (
    status NOT IN ('active', 'suspended') OR user_id IS NOT NULL
  ),
  CONSTRAINT workspace_memberships_active_acceptance_check CHECK (
    status <> 'active' OR accepted_at IS NOT NULL
  ),
  CONSTRAINT workspace_memberships_suspension_check CHECK (
    status <> 'suspended' OR suspended_at IS NOT NULL
  ),
  CONSTRAINT workspace_memberships_revocation_check CHECK (
    status <> 'revoked' OR revoked_at IS NOT NULL
  ),
  CONSTRAINT workspace_memberships_invite_expiry_check CHECK (
    status <> 'invited'
    OR (invite_expires_at IS NOT NULL AND invite_expires_at > invited_at)
  )
);

-- CREATE TABLE IF NOT EXISTS does not reconcile a partially deployed table.
-- Add and validate the lifecycle checks explicitly so a drifted target fails
-- before any invite endpoint is enabled.
DO $$
DECLARE
  constraint_definition RECORD;
BEGIN
  FOR constraint_definition IN
    SELECT *
    FROM (VALUES
      (
        'workspace_memberships_live_user_check',
        'CHECK (status NOT IN (''active'', ''suspended'') OR user_id IS NOT NULL)'
      ),
      (
        'workspace_memberships_active_acceptance_check',
        'CHECK (status <> ''active'' OR accepted_at IS NOT NULL)'
      ),
      (
        'workspace_memberships_suspension_check',
        'CHECK (status <> ''suspended'' OR suspended_at IS NOT NULL)'
      ),
      (
        'workspace_memberships_revocation_check',
        'CHECK (status <> ''revoked'' OR revoked_at IS NOT NULL)'
      ),
      (
        'workspace_memberships_invite_expiry_check',
        'CHECK (status <> ''invited'' OR (invite_expires_at IS NOT NULL AND invite_expires_at > invited_at))'
      )
    ) AS required_constraint(constraint_name, definition)
  LOOP
    IF NOT EXISTS (
      SELECT 1
      FROM pg_constraint
      WHERE conrelid = 'public.workspace_memberships'::regclass
        AND conname = constraint_definition.constraint_name
    ) THEN
      EXECUTE format(
        'ALTER TABLE public.workspace_memberships ADD CONSTRAINT %I %s NOT VALID',
        constraint_definition.constraint_name,
        constraint_definition.definition
      );
    END IF;

    EXECUTE format(
      'ALTER TABLE public.workspace_memberships VALIDATE CONSTRAINT %I',
      constraint_definition.constraint_name
    );
  END LOOP;
END;
$$;

-- ON DELETE SET NULL permits safe cleanup of unaccepted Auth invitations. The
-- live-user CHECK above makes deletion of an active or suspended identity fail
-- atomically instead of leaving a stranded live membership.

-- A revoked row is historical and must not block a fresh invitation.
CREATE UNIQUE INDEX IF NOT EXISTS workspace_memberships_live_email_idx
  ON public.workspace_memberships (workspace_id, email_normalized)
  WHERE status IN ('invited', 'active', 'suspended');

CREATE UNIQUE INDEX IF NOT EXISTS workspace_memberships_live_user_idx
  ON public.workspace_memberships (workspace_id, user_id)
  WHERE user_id IS NOT NULL
    AND status IN ('invited', 'active', 'suspended');

-- The MVP intentionally allows one private workspace per invited account.
-- These global partial indexes also close concurrent double-invite races that
-- cannot be prevented reliably with an application-side existence check.
CREATE UNIQUE INDEX IF NOT EXISTS workspace_memberships_one_live_email_idx
  ON public.workspace_memberships (email_normalized)
  WHERE status IN ('invited', 'active', 'suspended');

CREATE UNIQUE INDEX IF NOT EXISTS workspace_memberships_one_live_user_idx
  ON public.workspace_memberships (user_id)
  WHERE user_id IS NOT NULL
    AND status IN ('invited', 'active', 'suspended');

CREATE INDEX IF NOT EXISTS workspace_memberships_user_status_idx
  ON public.workspace_memberships (user_id, status)
  WHERE user_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS workspace_memberships_workspace_status_idx
  ON public.workspace_memberships (workspace_id, status);

CREATE TABLE IF NOT EXISTS public.workspace_audit_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL
    REFERENCES public.workspaces(id) ON DELETE RESTRICT,
  -- Deliberately not an FK: audit records must survive Auth-user deletion
  -- without an ON DELETE mutation violating the append-only trigger.
  actor_user_id UUID,
  action TEXT NOT NULL CHECK (char_length(btrim(action)) BETWEEN 1 AND 160),
  entity_type TEXT NOT NULL CHECK (char_length(btrim(entity_type)) BETWEEN 1 AND 80),
  entity_id UUID,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  request_id TEXT,
  ip_address INET,
  user_agent TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS workspace_audit_log_workspace_created_idx
  ON public.workspace_audit_log (workspace_id, created_at DESC);

CREATE INDEX IF NOT EXISTS workspace_audit_log_actor_created_idx
  ON public.workspace_audit_log (actor_user_id, created_at DESC)
  WHERE actor_user_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS workspace_audit_log_entity_idx
  ON public.workspace_audit_log (workspace_id, entity_type, entity_id)
  WHERE entity_id IS NOT NULL;

-- Secure the new API-visible tables in this same transaction. Policies are
-- added by the RLS migration, but a paused/failed rollout must default-deny
-- rather than exposing memberships or audit records through default grants.
ALTER TABLE public.workspaces ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.workspace_memberships ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.workspace_audit_log ENABLE ROW LEVEL SECURITY;

REVOKE ALL PRIVILEGES ON TABLE public.workspaces FROM PUBLIC, anon, authenticated;
REVOKE ALL PRIVILEGES ON TABLE public.workspace_memberships FROM PUBLIC, anon, authenticated;
REVOKE ALL PRIVILEGES ON TABLE public.workspace_audit_log FROM PUBLIC, anon, authenticated;

GRANT ALL PRIVILEGES ON TABLE public.workspaces TO service_role;
GRANT ALL PRIVILEGES ON TABLE public.workspace_memberships TO service_role;
REVOKE ALL PRIVILEGES ON TABLE public.workspace_audit_log FROM service_role;
GRANT SELECT, INSERT ON TABLE public.workspace_audit_log TO service_role;

CREATE OR REPLACE FUNCTION public.workspace_touch_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS workspaces_touch_updated_at ON public.workspaces;
CREATE TRIGGER workspaces_touch_updated_at
  BEFORE UPDATE ON public.workspaces
  FOR EACH ROW
  EXECUTE FUNCTION public.workspace_touch_updated_at();

DROP TRIGGER IF EXISTS workspace_memberships_touch_updated_at
  ON public.workspace_memberships;
CREATE TRIGGER workspace_memberships_touch_updated_at
  BEFORE UPDATE ON public.workspace_memberships
  FOR EACH ROW
  EXECUTE FUNCTION public.workspace_touch_updated_at();

-- Each invited account receives a private workspace. Locking the parent row
-- serializes concurrent membership creation and prevents one member's
-- lifecycle transition from suspending a workspace that contains another
-- live member. The legacy default workspace is intentionally multi-member.
CREATE OR REPLACE FUNCTION public.enforce_private_workspace_single_live_member()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = ''
AS $$
DECLARE
  workspace_is_default BOOLEAN;
BEGIN
  SELECT workspace.is_default
  INTO workspace_is_default
  FROM public.workspaces AS workspace
  WHERE workspace.id = NEW.workspace_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'workspace does not exist'
      USING ERRCODE = '23503';
  END IF;

  IF NOT workspace_is_default
     AND NEW.status IN ('invited', 'active', 'suspended')
     AND EXISTS (
       SELECT 1
       FROM public.workspace_memberships AS existing_membership
       WHERE existing_membership.workspace_id = NEW.workspace_id
         AND existing_membership.id <> NEW.id
         AND existing_membership.status IN ('invited', 'active', 'suspended')
     ) THEN
    RAISE EXCEPTION 'private workspaces support exactly one live membership'
      USING ERRCODE = '23505';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS workspace_memberships_enforce_private_single_live
  ON public.workspace_memberships;
CREATE TRIGGER workspace_memberships_enforce_private_single_live
  BEFORE INSERT OR UPDATE OF workspace_id, status ON public.workspace_memberships
  FOR EACH ROW
  EXECUTE FUNCTION public.enforce_private_workspace_single_live_member();

CREATE OR REPLACE FUNCTION public.prevent_workspace_audit_mutation()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  RAISE EXCEPTION 'workspace_audit_log is append-only'
    USING ERRCODE = '55000';
END;
$$;

DROP TRIGGER IF EXISTS workspace_audit_log_append_only
  ON public.workspace_audit_log;
CREATE TRIGGER workspace_audit_log_append_only
  BEFORE UPDATE OR DELETE ON public.workspace_audit_log
  FOR EACH ROW
  EXECUTE FUNCTION public.prevent_workspace_audit_mutation();

-- Create one deterministic legacy workspace. The creator is the first current
-- admin_users row that can be matched to a real Supabase Auth user.
INSERT INTO public.workspaces (
  name,
  slug,
  status,
  is_default,
  created_by
)
VALUES (
  'Get On A Pod',
  'get-on-a-pod',
  'active',
  true,
  (
    SELECT auth_user.id
    FROM public.admin_users AS admin_user
    JOIN auth.users AS auth_user
      ON lower(btrim(auth_user.email)) = lower(btrim(admin_user.email))
    ORDER BY admin_user.created_at, admin_user.id
    LIMIT 1
  )
)
ON CONFLICT (slug) DO UPDATE
SET
  name = EXCLUDED.name,
  status = 'active',
  is_default = true,
  created_by = COALESCE(workspaces.created_by, EXCLUDED.created_by),
  updated_at = now();

-- Bootstrap all admin_users that have an Auth identity into the default
-- workspace. One deterministic user is the owner; remaining users are admins.
WITH matched_admins AS (
  SELECT DISTINCT ON (auth_user.id)
    auth_user.id AS user_id,
    lower(btrim(auth_user.email)) AS email_normalized,
    COALESCE(
      NULLIF(btrim(admin_user.name), ''),
      NULLIF(btrim(auth_user.raw_user_meta_data ->> 'full_name'), ''),
      split_part(auth_user.email, '@', 1)
    ) AS full_name,
    admin_user.created_at,
    admin_user.id AS admin_user_id
  FROM public.admin_users AS admin_user
  JOIN auth.users AS auth_user
    ON lower(btrim(auth_user.email)) = lower(btrim(admin_user.email))
  WHERE auth_user.email IS NOT NULL
  ORDER BY auth_user.id, admin_user.created_at, admin_user.id
), ranked_admins AS (
  SELECT
    matched_admins.*,
    row_number() OVER (
      ORDER BY matched_admins.created_at, matched_admins.admin_user_id
    ) AS owner_rank
  FROM matched_admins
), default_workspace AS (
  SELECT id
  FROM public.workspaces
  WHERE slug = 'get-on-a-pod'
  LIMIT 1
)
INSERT INTO public.workspace_memberships (
  workspace_id,
  user_id,
  email_normalized,
  full_name,
  role,
  status,
  invite_expires_at,
  invited_at,
  invited_by,
  accepted_at,
  accepted_by
)
SELECT
  default_workspace.id,
  ranked_admins.user_id,
  ranked_admins.email_normalized,
  ranked_admins.full_name,
  CASE WHEN ranked_admins.owner_rank = 1 THEN 'owner' ELSE 'admin' END,
  'active',
  NULL,
  COALESCE(ranked_admins.created_at, now()),
  ranked_admins.user_id,
  now(),
  ranked_admins.user_id
FROM ranked_admins
CROSS JOIN default_workspace
ON CONFLICT DO NOTHING;

-- Fail the migration instead of silently bootstrapping an unusable default
-- workspace. A conflict with an existing live membership must be reconciled
-- deliberately before tenant access is enabled.
DO $$
DECLARE
  default_workspace_id UUID;
  matched_admin_count BIGINT;
  bootstrapped_admin_count BIGINT;
  owner_count BIGINT;
  matched_owner_count BIGINT;
  invalid_admin_role_count BIGINT;
BEGIN
  SELECT workspace.id
  INTO default_workspace_id
  FROM public.workspaces AS workspace
  WHERE workspace.slug = 'get-on-a-pod'
    AND workspace.is_default
    AND workspace.status = 'active';

  SELECT count(DISTINCT auth_user.id)
  INTO matched_admin_count
  FROM public.admin_users AS admin_user
  JOIN auth.users AS auth_user
    ON lower(btrim(auth_user.email)) = lower(btrim(admin_user.email))
  WHERE auth_user.email IS NOT NULL;

  -- A prepared baseline may run this migration before an Auth user is seeded.
  -- Leave it default-deny and let deployment verification fail closed. The
  -- historical migration directory is not a replayable fresh-database setup.
  IF matched_admin_count = 0 THEN
    RETURN;
  END IF;

  SELECT count(DISTINCT membership.user_id)
  INTO bootstrapped_admin_count
  FROM public.workspace_memberships AS membership
  JOIN auth.users AS auth_user
    ON auth_user.id = membership.user_id
  JOIN public.admin_users AS admin_user
    ON lower(btrim(admin_user.email)) = lower(btrim(auth_user.email))
  WHERE membership.workspace_id = default_workspace_id
    AND membership.status = 'active';

  IF bootstrapped_admin_count <> matched_admin_count THEN
    RAISE EXCEPTION
      'expected % bootstrapped administrators, found %',
      matched_admin_count,
      bootstrapped_admin_count;
  END IF;

  SELECT count(*)
  INTO invalid_admin_role_count
  FROM public.workspace_memberships AS membership
  JOIN auth.users AS auth_user
    ON auth_user.id = membership.user_id
  JOIN public.admin_users AS admin_user
    ON lower(btrim(admin_user.email)) = lower(btrim(auth_user.email))
  WHERE membership.workspace_id = default_workspace_id
    AND membership.status = 'active'
    AND membership.role NOT IN ('owner', 'admin');

  IF invalid_admin_role_count <> 0 THEN
    RAISE EXCEPTION
      '% bootstrapped administrators have a non-administrator workspace role',
      invalid_admin_role_count;
  END IF;

  SELECT count(*)
  INTO owner_count
  FROM public.workspace_memberships AS membership
  WHERE membership.workspace_id = default_workspace_id
    AND membership.role = 'owner'
    AND membership.status = 'active'
    AND membership.user_id IS NOT NULL;

  IF owner_count <> 1 THEN
    RAISE EXCEPTION
      'expected exactly one active default-workspace owner, found %',
      owner_count;
  END IF;

  SELECT count(*)
  INTO matched_owner_count
  FROM public.workspace_memberships AS membership
  JOIN auth.users AS auth_user
    ON auth_user.id = membership.user_id
  JOIN public.admin_users AS admin_user
    ON lower(btrim(admin_user.email)) = lower(btrim(auth_user.email))
  WHERE membership.workspace_id = default_workspace_id
    AND membership.role = 'owner'
    AND membership.status = 'active';

  IF matched_owner_count <> 1 THEN
    RAISE EXCEPTION 'the default-workspace owner must be a platform administrator';
  END IF;
END;
$$;

DO $$
DECLARE
  invalid_private_workspace_count BIGINT;
BEGIN
  SELECT count(*)
  INTO invalid_private_workspace_count
  FROM (
    SELECT membership.workspace_id
    FROM public.workspace_memberships AS membership
    JOIN public.workspaces AS workspace
      ON workspace.id = membership.workspace_id
    WHERE NOT workspace.is_default
      AND membership.status IN ('invited', 'active', 'suspended')
    GROUP BY membership.workspace_id
    HAVING count(*) > 1
  ) AS invalid_workspace;

  IF invalid_private_workspace_count <> 0 THEN
    RAISE EXCEPTION
      '% private workspaces have more than one live membership',
      invalid_private_workspace_count;
  END IF;
END;
$$;

-- Attach all legacy clients to the default workspace. Keep the FK RESTRICTIVE
-- so an accidental workspace delete cannot cascade through the client graph.
ALTER TABLE public.clients
  ADD COLUMN IF NOT EXISTS workspace_id UUID;

-- Preserve historical client.updated_at values while applying ownership and
-- dashboard backfills. The checked-in schema's exact timestamp trigger is
-- disabled temporarily and restored to its original firing mode afterward.
CREATE TEMP TABLE goap_client_timestamp_triggers (
  trigger_name NAME PRIMARY KEY,
  trigger_mode "char" NOT NULL
) ON COMMIT DROP;

INSERT INTO goap_client_timestamp_triggers (trigger_name, trigger_mode)
SELECT trigger.tgname, trigger.tgenabled
FROM pg_trigger AS trigger
WHERE trigger.tgrelid = 'public.clients'::regclass
  AND NOT trigger.tgisinternal
  AND trigger.tgenabled <> 'D'
  AND trigger.tgname = 'update_clients_updated_at';

DO $$
DECLARE
  timestamp_trigger RECORD;
BEGIN
  FOR timestamp_trigger IN
    SELECT trigger_name FROM goap_client_timestamp_triggers
  LOOP
    EXECUTE format(
      'ALTER TABLE public.clients DISABLE TRIGGER %I',
      timestamp_trigger.trigger_name
    );
  END LOOP;
END;
$$;

-- New approval dashboards are opt-in. Preserve previously issued legacy
-- dashboard URLs by treating an existing slug as evidence that the dashboard
-- was already published; operators must audit that legacy allowlist in staging.
ALTER TABLE public.clients
  ADD COLUMN IF NOT EXISTS dashboard_enabled BOOLEAN;

UPDATE public.clients
SET dashboard_enabled = (dashboard_slug IS NOT NULL)
WHERE dashboard_enabled IS NULL;

ALTER TABLE public.clients
  ALTER COLUMN dashboard_enabled SET DEFAULT false,
  ALTER COLUMN dashboard_enabled SET NOT NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conrelid = 'public.clients'::regclass
      AND conname = 'clients_workspace_id_fkey'
  ) THEN
    ALTER TABLE public.clients
      ADD CONSTRAINT clients_workspace_id_fkey
      FOREIGN KEY (workspace_id)
      REFERENCES public.workspaces(id)
      ON DELETE RESTRICT
      NOT VALID;
  END IF;
END;
$$;

UPDATE public.clients
SET workspace_id = (
  SELECT id
  FROM public.workspaces
  WHERE slug = 'get-on-a-pod'
  LIMIT 1
)
WHERE workspace_id IS NULL;

DO $$
DECLARE
  timestamp_trigger RECORD;
BEGIN
  FOR timestamp_trigger IN
    SELECT trigger_name, trigger_mode FROM goap_client_timestamp_triggers
  LOOP
    EXECUTE format(
      'ALTER TABLE public.clients ENABLE %s TRIGGER %I',
      CASE timestamp_trigger.trigger_mode
        WHEN 'A' THEN 'ALWAYS'
        WHEN 'R' THEN 'REPLICA'
        ELSE ''
      END,
      timestamp_trigger.trigger_name
    );
  END LOOP;
END;
$$;

CREATE INDEX IF NOT EXISTS clients_workspace_id_idx
  ON public.clients (workspace_id);

CREATE INDEX IF NOT EXISTS clients_workspace_status_idx
  ON public.clients (workspace_id, status);

ALTER TABLE public.clients
  VALIDATE CONSTRAINT clients_workspace_id_fkey;

CREATE OR REPLACE FUNCTION public.is_platform_admin()
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT auth.uid() IS NOT NULL AND EXISTS (
    SELECT 1
    FROM auth.users AS auth_user
    JOIN public.admin_users AS admin_user
      ON lower(btrim(admin_user.email)) = lower(btrim(auth_user.email))
    WHERE auth_user.id = auth.uid()
      AND NULLIF(btrim(auth_user.email), '') IS NOT NULL
  );
$$;

CREATE OR REPLACE FUNCTION public.is_platform_admin_email(
  p_email TEXT
)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT NULLIF(btrim(p_email), '') IS NOT NULL AND EXISTS (
    SELECT 1
    FROM public.admin_users AS admin_user
    WHERE lower(btrim(admin_user.email)) = lower(btrim(p_email))
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
BEGIN
  SELECT membership.workspace_id
  INTO selected_workspace_id
  FROM public.workspace_memberships AS membership
  JOIN public.workspaces AS workspace
    ON workspace.id = membership.workspace_id
  WHERE membership.user_id = auth.uid()
    AND membership.status = 'active'
    AND workspace.status = 'active'
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

  -- Transitional compatibility for existing service-role writers and global
  -- platform admins that do not yet send workspace_id explicitly.
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
      WHERE membership.workspace_id = p_workspace_id
        AND membership.user_id = auth.uid()
        AND membership.status = 'active'
        AND workspace.status = 'active'
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
      WHERE membership.workspace_id = p_workspace_id
        AND membership.user_id = auth.uid()
        AND membership.status = 'active'
        AND membership.role IN ('owner', 'admin')
        AND workspace.status = 'active'
    );
$$;

CREATE OR REPLACE FUNCTION public.can_access_client(
  p_client_id UUID
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
      FROM public.clients AS client
      WHERE client.id = p_client_id
        AND public.can_access_workspace(client.workspace_id)
    );
$$;

CREATE OR REPLACE FUNCTION public.assign_client_workspace()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF NEW.workspace_id IS NULL THEN
    NEW.workspace_id := public.current_workspace_id();
  END IF;

  IF NEW.workspace_id IS NULL THEN
    RAISE EXCEPTION 'workspace_id is required for clients'
      USING ERRCODE = '23502';
  END IF;

  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.record_public_client_dashboard_view(
  p_client_id UUID
)
RETURNS VOID
LANGUAGE sql
SECURITY DEFINER
SET search_path = ''
AS $$
  UPDATE public.clients
  SET
    dashboard_view_count = COALESCE(dashboard_view_count, 0) + 1,
    dashboard_last_viewed_at = now()
  WHERE id = p_client_id
    AND dashboard_slug IS NOT NULL
    AND dashboard_enabled;
$$;

CREATE OR REPLACE FUNCTION public.record_public_prospect_dashboard_view(
  p_dashboard_id UUID
)
RETURNS VOID
LANGUAGE sql
SECURITY DEFINER
SET search_path = ''
AS $$
  UPDATE public.prospect_dashboards
  SET
    view_count = COALESCE(view_count, 0) + 1,
    last_viewed_at = now()
  WHERE id = p_dashboard_id
    AND is_active;
$$;

DROP TRIGGER IF EXISTS clients_assign_workspace ON public.clients;
CREATE TRIGGER clients_assign_workspace
  BEFORE INSERT ON public.clients
  FOR EACH ROW
  EXECUTE FUNCTION public.assign_client_workspace();

ALTER TABLE public.clients
  ALTER COLUMN workspace_id SET NOT NULL;

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
  membership public.workspace_memberships%ROWTYPE;
BEGIN
  IF p_membership_id IS NULL
     OR p_user_id IS NULL
     OR normalized_email IS NULL
     OR normalized_email = '' THEN
    RAISE EXCEPTION 'membership_id, user_id, and email are required'
      USING ERRCODE = '22023';
  END IF;

  SELECT lower(btrim(auth_user.email))
  INTO auth_email
  FROM auth.users AS auth_user
  WHERE auth_user.id = p_user_id;

  IF auth_email IS NULL OR auth_email <> normalized_email THEN
    RAISE EXCEPTION 'invite email does not match the Auth user'
      USING ERRCODE = '22023';
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
      AND other_membership.status IN ('invited', 'active', 'suspended')
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

-- Membership/workspace state and its audit event change in one transaction.
-- Auth banning/unbanning remains an Edge Function concern and is compensated
-- there if this RPC fails.
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
  membership public.workspace_memberships%ROWTYPE;
  audit_action TEXT;
  bound_auth_email TEXT;
BEGIN
  IF p_membership_id IS NULL OR p_actor_user_id IS NULL THEN
    RAISE EXCEPTION 'membership_id and actor_user_id are required'
      USING ERRCODE = '22023';
  END IF;

  IF p_action IS NULL
     OR p_action NOT IN ('suspend', 'reactivate', 'revoke_pending') THEN
    RAISE EXCEPTION 'unsupported workspace membership transition'
      USING ERRCODE = '22023';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM auth.users AS auth_user
    JOIN public.admin_users AS admin_user
      ON lower(btrim(admin_user.email)) = lower(btrim(auth_user.email))
    WHERE auth_user.id = p_actor_user_id
  ) THEN
    RAISE EXCEPTION 'platform administrator access is required'
      USING ERRCODE = '42501';
  END IF;

  SELECT existing_membership.*
  INTO membership
  FROM public.workspace_memberships AS existing_membership
  WHERE existing_membership.id = p_membership_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'workspace account not found'
      USING ERRCODE = 'P0002';
  END IF;

  IF membership.user_id IS NOT NULL THEN
    SELECT lower(btrim(auth_user.email))
    INTO bound_auth_email
    FROM auth.users AS auth_user
    WHERE auth_user.id = membership.user_id
      AND NULLIF(btrim(auth_user.email), '') IS NOT NULL;

    IF NOT FOUND
      OR bound_auth_email IS DISTINCT FROM membership.email_normalized
    THEN
      RAISE EXCEPTION 'workspace account identity mismatch'
        USING ERRCODE = '55000';
    END IF;
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.admin_users AS admin_user
    WHERE lower(btrim(admin_user.email)) = membership.email_normalized
  ) THEN
    RAISE EXCEPTION 'platform administrators cannot be changed here'
      USING ERRCODE = '42501';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.workspaces AS workspace
    WHERE workspace.id = membership.workspace_id
      AND workspace.is_default
  ) THEN
    RAISE EXCEPTION 'the default workspace cannot be changed here'
      USING ERRCODE = '42501';
  END IF;

  IF p_action = 'suspend' THEN
    IF membership.status <> 'active' THEN
      RAISE EXCEPTION 'workspace account is not active'
        USING ERRCODE = '55000';
    END IF;

    UPDATE public.workspace_memberships
    SET
      status = 'suspended',
      suspended_at = now(),
      suspended_by = p_actor_user_id
    WHERE id = membership.id
    RETURNING * INTO membership;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'workspace account transition failed'
        USING ERRCODE = '55000';
    END IF;

    UPDATE public.workspaces
    SET status = 'suspended'
    WHERE id = membership.workspace_id;

    DELETE FROM public.client_portal_sessions AS session
    USING public.clients AS client
    WHERE session.client_id = client.id
      AND client.workspace_id = membership.workspace_id;

    DELETE FROM public.client_portal_tokens AS token
    USING public.clients AS client
    WHERE token.client_id = client.id
      AND client.workspace_id = membership.workspace_id;

    audit_action := 'workspace.membership.suspended';
  ELSIF p_action = 'reactivate' THEN
    IF membership.status <> 'suspended' THEN
      RAISE EXCEPTION 'workspace account is not suspended'
        USING ERRCODE = '55000';
    END IF;

    UPDATE public.workspace_memberships
    SET
      status = 'active',
      suspended_at = NULL,
      suspended_by = NULL
    WHERE id = membership.id
    RETURNING * INTO membership;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'workspace account transition failed'
        USING ERRCODE = '55000';
    END IF;

    UPDATE public.workspaces
    SET status = 'active'
    WHERE id = membership.workspace_id;

    audit_action := 'workspace.membership.reactivated';
  ELSE
    IF membership.status <> 'invited' THEN
      RAISE EXCEPTION 'workspace invitation is not pending'
        USING ERRCODE = '55000';
    END IF;

    UPDATE public.workspace_memberships
    SET
      user_id = NULL,
      status = 'revoked',
      revoked_at = now(),
      revoked_by = p_actor_user_id
    WHERE id = membership.id
    RETURNING * INTO membership;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'workspace account transition failed'
        USING ERRCODE = '55000';
    END IF;

    UPDATE public.workspaces
    SET status = 'archived'
    WHERE id = membership.workspace_id;

    DELETE FROM public.client_portal_sessions AS session
    USING public.clients AS client
    WHERE session.client_id = client.id
      AND client.workspace_id = membership.workspace_id;

    DELETE FROM public.client_portal_tokens AS token
    USING public.clients AS client
    WHERE token.client_id = client.id
      AND client.workspace_id = membership.workspace_id;

    audit_action := 'workspace.membership.revoked';
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
    audit_action,
    'workspace_membership',
    membership.id,
    jsonb_build_object('email', membership.email_normalized)
  );

  RETURN membership;
END;
$$;

-- Record bootstrap once. The existence predicate keeps manual/idempotent reruns
-- from creating duplicate bootstrap events.
INSERT INTO public.workspace_audit_log (
  workspace_id,
  actor_user_id,
  action,
  entity_type,
  entity_id,
  metadata
)
SELECT
  workspace.id,
  workspace.created_by,
  'workspace.bootstrap.completed',
  'workspace',
  workspace.id,
  jsonb_build_object(
    'clients_backfilled', (
      SELECT count(*)
      FROM public.clients AS client
      WHERE client.workspace_id = workspace.id
    ),
    'memberships_bootstrapped', (
      SELECT count(*)
      FROM public.workspace_memberships AS membership
      WHERE membership.workspace_id = workspace.id
        AND membership.status = 'active'
    )
  )
FROM public.workspaces AS workspace
WHERE workspace.slug = 'get-on-a-pod'
  AND EXISTS (
    SELECT 1
    FROM public.workspace_memberships AS membership
    WHERE membership.workspace_id = workspace.id
      AND membership.status = 'active'
  )
  AND NOT EXISTS (
    SELECT 1
    FROM public.workspace_audit_log AS audit
    WHERE audit.workspace_id = workspace.id
      AND audit.action = 'workspace.bootstrap.completed'
  );

REVOKE ALL ON FUNCTION public.workspace_touch_updated_at() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.assign_client_workspace() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.enforce_private_workspace_single_live_member()
  FROM PUBLIC;
REVOKE ALL ON FUNCTION public.prevent_workspace_audit_mutation() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.record_public_client_dashboard_view(UUID)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.record_public_prospect_dashboard_view(UUID)
  FROM PUBLIC, anon, authenticated;

REVOKE ALL ON FUNCTION public.is_platform_admin() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.is_platform_admin_email(TEXT)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.current_workspace_id() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.can_access_workspace(UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.can_manage_workspace(UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.can_access_client(UUID) FROM PUBLIC;
-- Anonymous write gates also call this helper. With no authenticated email it
-- deterministically returns false, yielding a normal RLS denial.
GRANT EXECUTE ON FUNCTION public.is_platform_admin() TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.is_platform_admin_email(TEXT) TO service_role;
GRANT EXECUTE ON FUNCTION public.current_workspace_id() TO authenticated;
GRANT EXECUTE ON FUNCTION public.can_access_workspace(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.can_manage_workspace(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.can_access_client(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.record_public_client_dashboard_view(UUID)
  TO service_role;
GRANT EXECUTE ON FUNCTION public.record_public_prospect_dashboard_view(UUID)
  TO service_role;

REVOKE ALL ON FUNCTION public.accept_workspace_invite(UUID, UUID, TEXT)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.accept_workspace_invite(UUID, UUID, TEXT)
  TO service_role;

REVOKE ALL ON FUNCTION public.transition_workspace_membership(UUID, TEXT, UUID)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.transition_workspace_membership(UUID, TEXT, UUID)
  TO service_role;

COMMENT ON TABLE public.workspaces IS
  'Tenant workspaces for the invite-only application.';
COMMENT ON TABLE public.workspace_memberships IS
  'Workspace members and pending invitations. Invited rows have nullable user_id until accepted.';
COMMENT ON TABLE public.workspace_audit_log IS
  'Append-only audit events for workspace-scoped administrative actions.';
COMMENT ON COLUMN public.clients.workspace_id IS
  'Owning tenant workspace. Existing rows were assigned to the default Get On A Pod workspace.';
COMMENT ON FUNCTION public.accept_workspace_invite(UUID, UUID, TEXT) IS
  'Service-role-only transactional activation of an invited workspace_membership.';
COMMENT ON FUNCTION public.transition_workspace_membership(UUID, TEXT, UUID) IS
  'Service-role-only atomic suspend, reactivate, or pending-invite revocation transition.';
COMMENT ON FUNCTION public.record_public_prospect_dashboard_view(UUID) IS
  'Service-role-only atomic view counter for an active public prospect dashboard.';

COMMIT;
