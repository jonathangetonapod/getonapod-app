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
  status TEXT NOT NULL DEFAULT 'provisioning',
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

-- Reconcile a target that saw an earlier revision of this unreleased
-- migration before the fail-closed provisioning state was introduced.
ALTER TABLE public.workspace_memberships
  ALTER COLUMN status SET DEFAULT 'provisioning';
ALTER TABLE public.workspace_memberships
  DROP CONSTRAINT IF EXISTS workspace_memberships_status_check;
ALTER TABLE public.workspace_memberships
  ADD CONSTRAINT workspace_memberships_status_check
  CHECK (status IN ('provisioning', 'invited', 'active', 'suspended', 'revoked'))
  NOT VALID;
ALTER TABLE public.workspace_memberships
  VALIDATE CONSTRAINT workspace_memberships_status_check;

-- CREATE TABLE IF NOT EXISTS does not reconcile a partially deployed table.
-- Recreate every named lifecycle check from its authoritative definition so a
-- weak same-name draft constraint cannot survive validation and false-pass the
-- release verifier.
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
    EXECUTE format(
      'ALTER TABLE public.workspace_memberships DROP CONSTRAINT IF EXISTS %I',
      constraint_definition.constraint_name
    );

    EXECUTE format(
      'ALTER TABLE public.workspace_memberships ADD CONSTRAINT %I %s NOT VALID',
      constraint_definition.constraint_name,
      constraint_definition.definition
    );

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
DROP INDEX IF EXISTS public.workspace_memberships_live_email_idx;
DROP INDEX IF EXISTS public.workspace_memberships_live_user_idx;
DROP INDEX IF EXISTS public.workspace_memberships_one_live_email_idx;
DROP INDEX IF EXISTS public.workspace_memberships_one_live_user_idx;

CREATE UNIQUE INDEX IF NOT EXISTS workspace_memberships_live_email_idx
  ON public.workspace_memberships (workspace_id, email_normalized)
  WHERE status IN ('provisioning', 'invited', 'active', 'suspended');

CREATE UNIQUE INDEX IF NOT EXISTS workspace_memberships_live_user_idx
  ON public.workspace_memberships (workspace_id, user_id)
  WHERE user_id IS NOT NULL
    AND status IN ('provisioning', 'invited', 'active', 'suspended');

-- The MVP intentionally allows one private workspace per invited account.
-- These global partial indexes also close concurrent double-invite races that
-- cannot be prevented reliably with an application-side existence check.
CREATE UNIQUE INDEX IF NOT EXISTS workspace_memberships_one_live_email_idx
  ON public.workspace_memberships (email_normalized)
  WHERE status IN ('provisioning', 'invited', 'active', 'suspended');

CREATE UNIQUE INDEX IF NOT EXISTS workspace_memberships_one_live_user_idx
  ON public.workspace_memberships (user_id)
  WHERE user_id IS NOT NULL
    AND status IN ('provisioning', 'invited', 'active', 'suspended');

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

-- Cross-system Auth changes cannot share a PostgreSQL transaction. A durable,
-- service-only claim serializes each membership's suspend/reactivate workflow;
-- the database status remains authoritative if an Edge invocation is lost.
-- review_after marks when an operator may investigate a stale claim. It is not
-- an automatic lease: a different token can never steal an existing claim.
CREATE TABLE IF NOT EXISTS public.workspace_auth_lifecycle_claims (
  membership_id UUID PRIMARY KEY
    REFERENCES public.workspace_memberships(id) ON DELETE RESTRICT,
  lock_token UUID NOT NULL UNIQUE,
  action TEXT NOT NULL,
  desired_status TEXT NOT NULL,
  actor_user_id UUID NOT NULL,
  acquired_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  review_after TIMESTAMPTZ NOT NULL,
  CONSTRAINT workspace_auth_lifecycle_claims_action_check CHECK (
    action IN ('suspend', 'reactivate', 'reconcile_active', 'reconcile_suspended')
  ),
  CONSTRAINT workspace_auth_lifecycle_claims_desired_status_check CHECK (
    desired_status IN ('active', 'suspended')
  ),
  CONSTRAINT workspace_auth_lifecycle_claims_action_status_check CHECK (
    (action IN ('suspend', 'reconcile_suspended') AND desired_status = 'suspended')
    OR (action IN ('reactivate', 'reconcile_active') AND desired_status = 'active')
  )
);

-- Freeze lifecycle writers before inspecting a partially deployed schema. A
-- claim that commits while this migration waits is then observed and blocks
-- reconciliation instead of being rewritten with a guessed action.
LOCK TABLE public.workspace_auth_lifecycle_claims IN ACCESS EXCLUSIVE MODE;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_class AS relation
    WHERE relation.oid = 'public.workspace_auth_lifecycle_claims'::regclass
      AND relation.relkind = 'r'
      AND relation.relpersistence = 'p'
      AND NOT relation.relispartition
  ) THEN
    RAISE EXCEPTION
      'workspace Auth lifecycle claims must be an ordinary persistent table';
  ELSIF EXISTS (SELECT 1 FROM public.workspace_auth_lifecycle_claims) THEN
    RAISE EXCEPTION 'unresolved workspace Auth lifecycle claims block migration reconciliation';
  END IF;
END;
$$;

-- This relation is new and service-internal, so its exact shape is authoritative.
-- Remove every draft structural/check constraint while the table is known empty,
-- then reconstruct columns, keys, references, defaults, and checks explicitly.
DO $$
DECLARE
  existing_constraint RECORD;
BEGIN
  FOR existing_constraint IN
    SELECT constraint_definition.conname
    FROM pg_constraint AS constraint_definition
    WHERE constraint_definition.conrelid =
      'public.workspace_auth_lifecycle_claims'::regclass
      AND constraint_definition.contype <> 'n'
    ORDER BY constraint_definition.conname
  LOOP
    EXECUTE format(
      'ALTER TABLE public.workspace_auth_lifecycle_claims DROP CONSTRAINT %I',
      existing_constraint.conname
    );
  END LOOP;
END;
$$;

-- No draft trigger or standalone index may keep hidden write semantics after
-- the named constraints are rebuilt. The relation is locked and empty, so
-- removing every remaining user trigger/index is lossless and authoritative.
DO $$
DECLARE
  existing_trigger RECORD;
  existing_index RECORD;
BEGIN
  FOR existing_trigger IN
    SELECT trigger_definition.tgname
    FROM pg_trigger AS trigger_definition
    WHERE trigger_definition.tgrelid =
      'public.workspace_auth_lifecycle_claims'::regclass
      AND NOT trigger_definition.tgisinternal
    ORDER BY trigger_definition.tgname
  LOOP
    EXECUTE format(
      'DROP TRIGGER %I ON public.workspace_auth_lifecycle_claims',
      existing_trigger.tgname
    );
  END LOOP;

  FOR existing_index IN
    SELECT
      index_namespace.nspname AS schema_name,
      index_relation.relname AS index_name
    FROM pg_index AS index_definition
    JOIN pg_class AS index_relation
      ON index_relation.oid = index_definition.indexrelid
    JOIN pg_namespace AS index_namespace
      ON index_namespace.oid = index_relation.relnamespace
    WHERE index_definition.indrelid =
      'public.workspace_auth_lifecycle_claims'::regclass
    ORDER BY index_relation.relname
  LOOP
    EXECUTE format(
      'DROP INDEX %I.%I',
      existing_index.schema_name,
      existing_index.index_name
    );
  END LOOP;
END;
$$;

ALTER TABLE public.workspace_auth_lifecycle_claims
  ADD COLUMN IF NOT EXISTS membership_id UUID,
  ADD COLUMN IF NOT EXISTS lock_token UUID,
  ADD COLUMN IF NOT EXISTS action TEXT,
  ADD COLUMN IF NOT EXISTS desired_status TEXT,
  ADD COLUMN IF NOT EXISTS actor_user_id UUID,
  ADD COLUMN IF NOT EXISTS acquired_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS review_after TIMESTAMPTZ;

DO $$
DECLARE
  unexpected_column RECORD;
BEGIN
  FOR unexpected_column IN
    SELECT attribute.attname
    FROM pg_attribute AS attribute
    WHERE attribute.attrelid =
      'public.workspace_auth_lifecycle_claims'::regclass
      AND attribute.attnum > 0
      AND NOT attribute.attisdropped
      AND attribute.attname NOT IN (
        'membership_id',
        'lock_token',
        'action',
        'desired_status',
        'actor_user_id',
        'acquired_at',
        'review_after'
      )
    ORDER BY attribute.attnum
  LOOP
    EXECUTE format(
      'ALTER TABLE public.workspace_auth_lifecycle_claims DROP COLUMN %I',
      unexpected_column.attname
    );
  END LOOP;
END;
$$;

ALTER TABLE public.workspace_auth_lifecycle_claims
  ALTER COLUMN membership_id DROP DEFAULT,
  ALTER COLUMN lock_token DROP DEFAULT,
  ALTER COLUMN action DROP DEFAULT,
  ALTER COLUMN desired_status DROP DEFAULT,
  ALTER COLUMN actor_user_id DROP DEFAULT,
  ALTER COLUMN acquired_at DROP DEFAULT,
  ALTER COLUMN review_after DROP DEFAULT;

ALTER TABLE public.workspace_auth_lifecycle_claims
  ALTER COLUMN membership_id TYPE UUID USING membership_id::TEXT::UUID,
  ALTER COLUMN lock_token TYPE UUID USING lock_token::TEXT::UUID,
  ALTER COLUMN action TYPE TEXT USING action::TEXT,
  ALTER COLUMN desired_status TYPE TEXT USING desired_status::TEXT,
  ALTER COLUMN actor_user_id TYPE UUID USING actor_user_id::TEXT::UUID,
  ALTER COLUMN acquired_at TYPE TIMESTAMPTZ USING acquired_at::TEXT::TIMESTAMPTZ,
  ALTER COLUMN review_after TYPE TIMESTAMPTZ USING review_after::TEXT::TIMESTAMPTZ;

UPDATE public.workspace_auth_lifecycle_claims
SET action = CASE desired_status
  WHEN 'active' THEN 'reconcile_active'
  WHEN 'suspended' THEN 'reconcile_suspended'
END
WHERE action IS NULL;

UPDATE public.workspace_auth_lifecycle_claims
SET review_after = now() + interval '15 minutes'
WHERE review_after IS NULL;

ALTER TABLE public.workspace_auth_lifecycle_claims
  ALTER COLUMN membership_id SET NOT NULL,
  ALTER COLUMN lock_token SET NOT NULL,
  ALTER COLUMN action SET NOT NULL,
  ALTER COLUMN desired_status SET NOT NULL,
  ALTER COLUMN actor_user_id SET NOT NULL,
  ALTER COLUMN acquired_at SET DEFAULT now(),
  ALTER COLUMN acquired_at SET NOT NULL,
  ALTER COLUMN review_after SET NOT NULL;

DROP INDEX IF EXISTS public.workspace_auth_lifecycle_claims_pkey;
DROP INDEX IF EXISTS public.workspace_auth_lifecycle_claims_lock_token_key;

ALTER TABLE public.workspace_auth_lifecycle_claims
  ADD CONSTRAINT workspace_auth_lifecycle_claims_pkey
  PRIMARY KEY (membership_id);
ALTER TABLE public.workspace_auth_lifecycle_claims
  ADD CONSTRAINT workspace_auth_lifecycle_claims_membership_id_fkey
  FOREIGN KEY (membership_id)
  REFERENCES public.workspace_memberships(id)
  ON DELETE RESTRICT
  NOT VALID;
ALTER TABLE public.workspace_auth_lifecycle_claims
  VALIDATE CONSTRAINT workspace_auth_lifecycle_claims_membership_id_fkey;
ALTER TABLE public.workspace_auth_lifecycle_claims
  ADD CONSTRAINT workspace_auth_lifecycle_claims_lock_token_key
  UNIQUE (lock_token);
ALTER TABLE public.workspace_auth_lifecycle_claims
  ADD CONSTRAINT workspace_auth_lifecycle_claims_action_check
  CHECK (
    action IN ('suspend', 'reactivate', 'reconcile_active', 'reconcile_suspended')
  ) NOT VALID;
ALTER TABLE public.workspace_auth_lifecycle_claims
  VALIDATE CONSTRAINT workspace_auth_lifecycle_claims_action_check;
ALTER TABLE public.workspace_auth_lifecycle_claims
  ADD CONSTRAINT workspace_auth_lifecycle_claims_desired_status_check
  CHECK (desired_status IN ('active', 'suspended')) NOT VALID;
ALTER TABLE public.workspace_auth_lifecycle_claims
  VALIDATE CONSTRAINT workspace_auth_lifecycle_claims_desired_status_check;
ALTER TABLE public.workspace_auth_lifecycle_claims
  ADD CONSTRAINT workspace_auth_lifecycle_claims_action_status_check
  CHECK (
    (action IN ('suspend', 'reconcile_suspended') AND desired_status = 'suspended')
    OR (action IN ('reactivate', 'reconcile_active') AND desired_status = 'active')
  ) NOT VALID;
ALTER TABLE public.workspace_auth_lifecycle_claims
  VALIDATE CONSTRAINT workspace_auth_lifecycle_claims_action_status_check;
ALTER TABLE public.workspace_auth_lifecycle_claims
  ADD CONSTRAINT workspace_auth_lifecycle_claims_review_check
  CHECK (review_after > acquired_at) NOT VALID;
ALTER TABLE public.workspace_auth_lifecycle_claims
  VALIDATE CONSTRAINT workspace_auth_lifecycle_claims_review_check;

DROP INDEX IF EXISTS public.workspace_auth_lifecycle_claims_expiry_idx;
DROP INDEX IF EXISTS public.workspace_auth_lifecycle_claims_review_idx;
CREATE INDEX workspace_auth_lifecycle_claims_review_idx
  ON public.workspace_auth_lifecycle_claims (review_after);

-- Invitation delivery crosses PostgreSQL, Supabase Auth, and the email
-- provider. A durable service-only claim prevents concurrent retries from
-- deleting or replacing one another's Auth identity. review_after is only an
-- operator-review marker; a different token never takes over automatically.
CREATE TABLE IF NOT EXISTS public.workspace_invite_delivery_claims (
  membership_id UUID PRIMARY KEY
    REFERENCES public.workspace_memberships(id) ON DELETE RESTRICT,
  lock_token UUID NOT NULL,
  claim_kind TEXT NOT NULL CHECK (claim_kind IN ('deliver', 'revoke_cleanup')),
  actor_user_id UUID NOT NULL,
  acquired_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  review_after TIMESTAMPTZ NOT NULL
);

-- A partially deployed draft must never be rewritten around an invocation
-- that may still be creating or deleting an Auth user. Reconcile Auth and the
-- membership first, then remove the old claim before replaying this release.
LOCK TABLE public.workspace_invite_delivery_claims IN ACCESS EXCLUSIVE MODE;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_class AS relation
    WHERE relation.oid = 'public.workspace_invite_delivery_claims'::regclass
      AND relation.relkind = 'r'
      AND relation.relpersistence = 'p'
      AND NOT relation.relispartition
  ) THEN
    RAISE EXCEPTION
      'workspace invite delivery claims must be an ordinary persistent table';
  ELSIF EXISTS (SELECT 1 FROM public.workspace_invite_delivery_claims) THEN
    RAISE EXCEPTION 'unresolved workspace invite delivery claims block migration reconciliation';
  END IF;
END;
$$;

-- The table is locked and proven empty above, so rebuild its complete internal
-- shape instead of trusting same-name draft columns or constraints.
DO $$
DECLARE
  existing_constraint RECORD;
BEGIN
  FOR existing_constraint IN
    SELECT constraint_definition.conname
    FROM pg_constraint AS constraint_definition
    WHERE constraint_definition.conrelid =
      'public.workspace_invite_delivery_claims'::regclass
      AND constraint_definition.contype <> 'n'
    ORDER BY constraint_definition.conname
  LOOP
    EXECUTE format(
      'ALTER TABLE public.workspace_invite_delivery_claims DROP CONSTRAINT %I',
      existing_constraint.conname
    );
  END LOOP;
END;
$$;

-- As with Auth lifecycle claims, this empty locked relation is rebuilt with no
-- surviving user trigger or standalone index semantics from an earlier draft.
DO $$
DECLARE
  existing_trigger RECORD;
  existing_index RECORD;
BEGIN
  FOR existing_trigger IN
    SELECT trigger_definition.tgname
    FROM pg_trigger AS trigger_definition
    WHERE trigger_definition.tgrelid =
      'public.workspace_invite_delivery_claims'::regclass
      AND NOT trigger_definition.tgisinternal
    ORDER BY trigger_definition.tgname
  LOOP
    EXECUTE format(
      'DROP TRIGGER %I ON public.workspace_invite_delivery_claims',
      existing_trigger.tgname
    );
  END LOOP;

  FOR existing_index IN
    SELECT
      index_namespace.nspname AS schema_name,
      index_relation.relname AS index_name
    FROM pg_index AS index_definition
    JOIN pg_class AS index_relation
      ON index_relation.oid = index_definition.indexrelid
    JOIN pg_namespace AS index_namespace
      ON index_namespace.oid = index_relation.relnamespace
    WHERE index_definition.indrelid =
      'public.workspace_invite_delivery_claims'::regclass
    ORDER BY index_relation.relname
  LOOP
    EXECUTE format(
      'DROP INDEX %I.%I',
      existing_index.schema_name,
      existing_index.index_name
    );
  END LOOP;
END;
$$;

ALTER TABLE public.workspace_invite_delivery_claims
  ADD COLUMN IF NOT EXISTS membership_id UUID,
  ADD COLUMN IF NOT EXISTS lock_token UUID,
  ADD COLUMN IF NOT EXISTS claim_kind TEXT,
  ADD COLUMN IF NOT EXISTS actor_user_id UUID,
  ADD COLUMN IF NOT EXISTS acquired_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS review_after TIMESTAMPTZ;

DO $$
DECLARE
  unexpected_column RECORD;
BEGIN
  FOR unexpected_column IN
    SELECT attribute.attname
    FROM pg_attribute AS attribute
    WHERE attribute.attrelid =
      'public.workspace_invite_delivery_claims'::regclass
      AND attribute.attnum > 0
      AND NOT attribute.attisdropped
      AND attribute.attname NOT IN (
        'membership_id',
        'lock_token',
        'claim_kind',
        'actor_user_id',
        'acquired_at',
        'review_after'
      )
    ORDER BY attribute.attnum
  LOOP
    EXECUTE format(
      'ALTER TABLE public.workspace_invite_delivery_claims DROP COLUMN %I',
      unexpected_column.attname
    );
  END LOOP;
END;
$$;

ALTER TABLE public.workspace_invite_delivery_claims
  ALTER COLUMN membership_id DROP DEFAULT,
  ALTER COLUMN lock_token DROP DEFAULT,
  ALTER COLUMN claim_kind DROP DEFAULT,
  ALTER COLUMN actor_user_id DROP DEFAULT,
  ALTER COLUMN acquired_at DROP DEFAULT,
  ALTER COLUMN review_after DROP DEFAULT;

ALTER TABLE public.workspace_invite_delivery_claims
  ALTER COLUMN membership_id TYPE UUID USING membership_id::TEXT::UUID,
  ALTER COLUMN lock_token TYPE UUID USING lock_token::TEXT::UUID,
  ALTER COLUMN claim_kind TYPE TEXT USING claim_kind::TEXT,
  ALTER COLUMN actor_user_id TYPE UUID USING actor_user_id::TEXT::UUID,
  ALTER COLUMN acquired_at TYPE TIMESTAMPTZ USING acquired_at::TEXT::TIMESTAMPTZ,
  ALTER COLUMN review_after TYPE TIMESTAMPTZ USING review_after::TEXT::TIMESTAMPTZ;

UPDATE public.workspace_invite_delivery_claims
SET claim_kind = 'deliver'
WHERE claim_kind IS NULL;

UPDATE public.workspace_invite_delivery_claims
SET review_after = now() + interval '15 minutes'
WHERE review_after IS NULL;

ALTER TABLE public.workspace_invite_delivery_claims
  ALTER COLUMN membership_id SET NOT NULL,
  ALTER COLUMN lock_token SET NOT NULL,
  ALTER COLUMN claim_kind SET NOT NULL,
  ALTER COLUMN actor_user_id SET NOT NULL,
  ALTER COLUMN acquired_at SET DEFAULT now(),
  ALTER COLUMN acquired_at SET NOT NULL,
  ALTER COLUMN review_after SET NOT NULL;

DROP INDEX IF EXISTS public.workspace_invite_delivery_claims_pkey;
DROP INDEX IF EXISTS public.workspace_invite_delivery_claims_lock_token_key;

ALTER TABLE public.workspace_invite_delivery_claims
  ADD CONSTRAINT workspace_invite_delivery_claims_pkey
  PRIMARY KEY (membership_id);
ALTER TABLE public.workspace_invite_delivery_claims
  ADD CONSTRAINT workspace_invite_delivery_claims_membership_id_fkey
  FOREIGN KEY (membership_id)
  REFERENCES public.workspace_memberships(id)
  ON DELETE RESTRICT
  NOT VALID;
ALTER TABLE public.workspace_invite_delivery_claims
  VALIDATE CONSTRAINT workspace_invite_delivery_claims_membership_id_fkey;
ALTER TABLE public.workspace_invite_delivery_claims
  ADD CONSTRAINT workspace_invite_delivery_claims_lock_token_key
  UNIQUE (lock_token);
ALTER TABLE public.workspace_invite_delivery_claims
  ADD CONSTRAINT workspace_invite_delivery_claims_claim_kind_check
  CHECK (claim_kind IN ('deliver', 'revoke_cleanup')) NOT VALID;
ALTER TABLE public.workspace_invite_delivery_claims
  VALIDATE CONSTRAINT workspace_invite_delivery_claims_claim_kind_check;
ALTER TABLE public.workspace_invite_delivery_claims
  ADD CONSTRAINT workspace_invite_delivery_claims_review_check
  CHECK (review_after > acquired_at) NOT VALID;
ALTER TABLE public.workspace_invite_delivery_claims
  VALIDATE CONSTRAINT workspace_invite_delivery_claims_review_check;

DROP INDEX IF EXISTS public.workspace_invite_delivery_claims_expiry_idx;
DROP INDEX IF EXISTS public.workspace_invite_delivery_claims_review_idx;
CREATE INDEX workspace_invite_delivery_claims_review_idx
  ON public.workspace_invite_delivery_claims (review_after);

-- Secure the new API-visible tables in this same transaction. Policies are
-- added by the RLS migration, but a paused/failed rollout must default-deny
-- rather than exposing memberships or audit records through default grants.
ALTER TABLE public.workspaces ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.workspace_memberships ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.workspace_audit_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.workspace_auth_lifecycle_claims ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.workspace_auth_lifecycle_claims NO FORCE ROW LEVEL SECURITY;
ALTER TABLE public.workspace_invite_delivery_claims ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.workspace_invite_delivery_claims NO FORCE ROW LEVEL SECURITY;

REVOKE ALL PRIVILEGES ON TABLE public.workspaces FROM PUBLIC, anon, authenticated;
REVOKE ALL PRIVILEGES ON TABLE public.workspace_memberships FROM PUBLIC, anon, authenticated;
REVOKE ALL PRIVILEGES ON TABLE public.workspace_audit_log FROM PUBLIC, anon, authenticated;
REVOKE ALL PRIVILEGES ON TABLE public.workspace_auth_lifecycle_claims
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL PRIVILEGES ON TABLE public.workspace_invite_delivery_claims
  FROM PUBLIC, anon, authenticated, service_role;

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

-- Each invited account receives exactly one durable membership in exactly one
-- private workspace. Lock every OLD/NEW parent in deterministic order so
-- concurrent inserts, moves, deletes, and lifecycle changes cannot evade the
-- deferred total-cardinality check. The default workspace remains multi-member.
CREATE OR REPLACE FUNCTION public.enforce_private_workspace_single_live_member()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = ''
AS $$
DECLARE
  target_workspace_id UUID;
  workspace_is_default BOOLEAN;
BEGIN
  FOR target_workspace_id IN
    SELECT DISTINCT candidate.workspace_id
    FROM unnest(
      CASE TG_OP
        WHEN 'INSERT' THEN ARRAY[NEW.workspace_id]
        WHEN 'DELETE' THEN ARRAY[OLD.workspace_id]
        ELSE ARRAY[OLD.workspace_id, NEW.workspace_id]
      END
    ) AS candidate(workspace_id)
    WHERE candidate.workspace_id IS NOT NULL
    ORDER BY candidate.workspace_id
  LOOP
    SELECT workspace.is_default
    INTO workspace_is_default
    FROM public.workspaces AS workspace
    WHERE workspace.id = target_workspace_id
    FOR UPDATE;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'workspace does not exist'
        USING ERRCODE = '23503';
    END IF;

    IF TG_OP <> 'DELETE'
       AND target_workspace_id = NEW.workspace_id
       AND NOT workspace_is_default
       AND EXISTS (
         SELECT 1
         FROM public.workspace_memberships AS existing_membership
         WHERE existing_membership.workspace_id = target_workspace_id
           AND existing_membership.id <> NEW.id
       ) THEN
      RAISE EXCEPTION 'private workspaces support exactly one membership'
        USING ERRCODE = '23505';
    END IF;
  END LOOP;

  RETURN CASE TG_OP WHEN 'DELETE' THEN OLD ELSE NEW END;
END;
$$;

DROP TRIGGER IF EXISTS workspace_memberships_enforce_private_single_live
  ON public.workspace_memberships;
CREATE TRIGGER workspace_memberships_enforce_private_single_live
  BEFORE INSERT OR UPDATE OR DELETE ON public.workspace_memberships
  FOR EACH ROW
  EXECUTE FUNCTION public.enforce_private_workspace_single_live_member();

-- A private workspace and its membership are one account lifecycle. Check the
-- pair at transaction end so legitimate two-row transitions may update either
-- row first, while any committed mismatch fails closed.
CREATE OR REPLACE FUNCTION public.enforce_private_workspace_lifecycle_pair()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  target_workspace_id UUID;
  target_workspace_ids UUID[];
  membership_count BIGINT;
  matching_lifecycle_count BIGINT;
BEGIN
  -- OLD/NEW are typed to the firing table. Keep the two record shapes in
  -- separate PL/pgSQL statements so workspace triggers never compile a
  -- membership-only field reference (and vice versa).
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
    SELECT
      count(membership.id),
      count(membership.id) FILTER (
        WHERE (
          membership.status IN ('provisioning', 'invited', 'active')
          AND workspace.status = 'active'
        ) OR (
          membership.status = 'suspended'
          AND workspace.status = 'suspended'
        ) OR (
          membership.status = 'revoked'
          AND workspace.status = 'archived'
        )
      )
    INTO membership_count, matching_lifecycle_count
    FROM public.workspaces AS workspace
    LEFT JOIN public.workspace_memberships AS membership
      ON membership.workspace_id = workspace.id
    WHERE workspace.id = target_workspace_id
      AND NOT workspace.is_default
    GROUP BY workspace.id, workspace.status;

    -- A workspace deleted in the same transaction no longer owns a lifecycle.
    IF NOT FOUND THEN
      CONTINUE;
    END IF;

    IF membership_count <> 1 OR matching_lifecycle_count <> 1 THEN
      RAISE EXCEPTION
        'private workspace requires exactly one lifecycle-matched membership'
        USING ERRCODE = '23514';
    END IF;
  END LOOP;

  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS workspace_memberships_lifecycle_pair_check
  ON public.workspace_memberships;
CREATE CONSTRAINT TRIGGER workspace_memberships_lifecycle_pair_check
  AFTER INSERT OR UPDATE OR DELETE ON public.workspace_memberships
  DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW
  EXECUTE FUNCTION public.enforce_private_workspace_lifecycle_pair();

DROP TRIGGER IF EXISTS workspaces_lifecycle_pair_check
  ON public.workspaces;
CREATE CONSTRAINT TRIGGER workspaces_lifecycle_pair_check
  AFTER INSERT OR UPDATE OR DELETE ON public.workspaces
  DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW
  EXECUTE FUNCTION public.enforce_private_workspace_lifecycle_pair();

-- Existing private-account drift cannot be repaired safely by guessing which
-- side is authoritative. Abort before any endpoint can preserve that state.
DO $$
BEGIN
  IF EXISTS (
    SELECT workspace.id
    FROM public.workspaces AS workspace
    LEFT JOIN public.workspace_memberships AS membership
      ON membership.workspace_id = workspace.id
    WHERE NOT workspace.is_default
    GROUP BY workspace.id, workspace.status
    HAVING count(membership.id) <> 1
      OR count(membership.id) FILTER (
        WHERE (
          membership.status IN ('provisioning', 'invited', 'active')
          AND workspace.status = 'active'
        ) OR (
          membership.status = 'suspended'
          AND workspace.status = 'suspended'
        ) OR (
          membership.status = 'revoked'
          AND workspace.status = 'archived'
        )
      ) <> 1
  ) THEN
    RAISE EXCEPTION
      'private workspace membership/lifecycle drift requires manual reconciliation';
  END IF;
END;
$$;

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
      AND membership.status IN ('provisioning', 'invited', 'active', 'suspended')
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
    JOIN public.workspace_memberships AS membership
      ON membership.user_id = auth_user.id
      AND membership.email_normalized = lower(btrim(auth_user.email))
      AND membership.status = 'active'
    JOIN public.workspaces AS workspace
      ON workspace.id = membership.workspace_id
      AND workspace.is_default
      AND workspace.status = 'active'
    WHERE auth_user.id = auth.uid()
      AND NULLIF(btrim(auth_user.email), '') IS NOT NULL
  );
$$;

CREATE OR REPLACE FUNCTION public.is_platform_admin_identity(
  p_user_id UUID,
  p_email TEXT
)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT p_user_id IS NOT NULL
    AND NULLIF(btrim(p_email), '') IS NOT NULL
    AND EXISTS (
      SELECT 1
      FROM auth.users AS auth_user
      JOIN public.admin_users AS admin_user
        ON lower(btrim(admin_user.email)) = lower(btrim(auth_user.email))
      JOIN public.workspace_memberships AS membership
        ON membership.user_id = auth_user.id
        AND membership.email_normalized = lower(btrim(auth_user.email))
        AND membership.status = 'active'
      JOIN public.workspaces AS workspace
        ON workspace.id = membership.workspace_id
        AND workspace.is_default
        AND workspace.status = 'active'
      WHERE auth_user.id = p_user_id
        AND lower(btrim(auth_user.email)) = lower(btrim(p_email))
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
  JOIN auth.users AS auth_user
    ON auth_user.id = membership.user_id
    AND lower(btrim(auth_user.email)) = membership.email_normalized
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
      JOIN auth.users AS auth_user
        ON auth_user.id = membership.user_id
        AND lower(btrim(auth_user.email)) = membership.email_normalized
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
      JOIN auth.users AS auth_user
        ON auth_user.id = membership.user_id
        AND lower(btrim(auth_user.email)) = membership.email_normalized
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

-- A suspended or revoked private account cannot retain any client-portal
-- bearer artifact, including rows left by a partially deployed lifecycle.
DELETE FROM public.client_portal_sessions AS session
USING public.clients AS client, public.workspace_memberships AS membership
WHERE session.client_id = client.id
  AND membership.workspace_id = client.workspace_id
  AND membership.status IN ('suspended', 'revoked');

DELETE FROM public.client_portal_tokens AS token
USING public.clients AS client, public.workspace_memberships AS membership
WHERE token.client_id = client.id
  AND membership.workspace_id = client.workspace_id
  AND membership.status IN ('suspended', 'revoked');

CREATE OR REPLACE FUNCTION public.begin_workspace_invite(
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
  actor_email TEXT;
  normalized_email TEXT := lower(btrim(p_email));
  normalized_full_name TEXT := NULLIF(btrim(p_full_name), '');
  normalized_workspace_name TEXT := NULLIF(btrim(p_workspace_name), '');
  normalized_workspace_slug TEXT := lower(btrim(p_workspace_slug));
  workspace public.workspaces%ROWTYPE;
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

  IF normalized_email IS NULL
    OR normalized_email !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'
    OR char_length(normalized_email) > 254
    OR normalized_workspace_name IS NULL
    OR char_length(normalized_workspace_name) > 120
    OR normalized_workspace_slug IS NULL
    OR normalized_workspace_slug !~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'
    OR char_length(COALESCE(normalized_full_name, '')) > 120
  THEN
    RAISE EXCEPTION 'invalid workspace invitation fields'
      USING ERRCODE = '22023';
  END IF;

  IF public.is_platform_admin_email(normalized_email) THEN
    RAISE EXCEPTION 'platform administrators cannot be invited here'
      USING ERRCODE = '42501';
  END IF;

  -- Serialize a fresh invite against cleanup claims on older revoked rows for
  -- the same email. The live-membership unique index covers the no-row case.
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
        'provisioning',
        'invited',
        'active',
        'suspended'
      )
  ) OR EXISTS (
    SELECT 1
    FROM public.workspace_invite_delivery_claims AS delivery_claim
    JOIN public.workspace_memberships AS claimed_membership
      ON claimed_membership.id = delivery_claim.membership_id
    WHERE claimed_membership.email_normalized = normalized_email
  ) THEN
    RAISE EXCEPTION 'workspace account already exists'
      USING ERRCODE = '23505';
  END IF;

  INSERT INTO public.workspaces (
    name,
    slug,
    status,
    is_default,
    created_by
  )
  VALUES (
    normalized_workspace_name,
    normalized_workspace_slug,
    'active',
    false,
    p_actor_user_id
  )
  RETURNING * INTO workspace;

  INSERT INTO public.workspace_memberships (
    workspace_id,
    user_id,
    email_normalized,
    full_name,
    role,
    status,
    invite_expires_at,
    invited_by
  )
  VALUES (
    workspace.id,
    NULL,
    normalized_email,
    normalized_full_name,
    'owner',
    'provisioning',
    NULL,
    p_actor_user_id
  )
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
    workspace.id,
    p_actor_user_id,
    'workspace.membership.provisioning_started',
    'workspace_membership',
    membership.id,
    jsonb_build_object('email', normalized_email, 'role', membership.role)
  );

  RETURN jsonb_build_object(
    'workspace', to_jsonb(workspace),
    'membership', to_jsonb(membership)
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.claim_workspace_invite_delivery(
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
  membership public.workspace_memberships%ROWTYPE;
  existing_claim public.workspace_invite_delivery_claims%ROWTYPE;
BEGIN
  IF p_membership_id IS NULL
    OR p_actor_user_id IS NULL
    OR p_lock_token IS NULL
  THEN
    RAISE EXCEPTION 'invalid workspace invite delivery claim'
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
    RAISE EXCEPTION 'workspace invitation not found'
      USING ERRCODE = 'P0002';
  END IF;

  IF membership.status <> 'provisioning' THEN
    RAISE EXCEPTION 'workspace invitation is not provisioning'
      USING ERRCODE = '55000';
  END IF;

  SELECT claim.*
  INTO existing_claim
  FROM public.workspace_invite_delivery_claims AS claim
  WHERE claim.membership_id = membership.id
  FOR UPDATE;

  -- review_after never authorizes takeover. Only an internal retry carrying the
  -- exact same token may continue the same delivery attempt.
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
      OR existing_claim.claim_kind <> 'deliver'
    )
  THEN
    RAISE EXCEPTION 'workspace invite delivery token was reused inconsistently'
      USING ERRCODE = '22023';
  END IF;

  IF FOUND THEN
    RETURN membership;
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
    'deliver',
    p_actor_user_id,
    now(),
    now() + interval '15 minutes'
  );

  RETURN membership;
END;
$$;

CREATE OR REPLACE FUNCTION public.release_workspace_invite_delivery_claim(
  p_membership_id UUID,
  p_lock_token UUID
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  claim_acquired_at TIMESTAMPTZ;
  claim_kind TEXT;
  existing_lock_token UUID;
  membership public.workspace_memberships%ROWTYPE;
BEGIN
  IF p_membership_id IS NULL OR p_lock_token IS NULL THEN
    RAISE EXCEPTION 'membership_id and lock_token are required'
      USING ERRCODE = '22023';
  END IF;

  SELECT existing_membership.*
  INTO membership
  FROM public.workspace_memberships AS existing_membership
  WHERE existing_membership.id = p_membership_id;

  -- ON DELETE RESTRICT means a missing membership cannot coexist with a live
  -- claim. Treat that already-absent state as an idempotent cleanup success.
  IF NOT FOUND THEN
    RETURN TRUE;
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

  IF NOT FOUND THEN
    RETURN TRUE;
  END IF;

  SELECT claim.lock_token, claim.claim_kind, claim.acquired_at
  INTO existing_lock_token, claim_kind, claim_acquired_at
  FROM public.workspace_invite_delivery_claims AS claim
  WHERE claim.membership_id = p_membership_id
  FOR UPDATE;

  -- Idempotent success handles a committed DELETE whose response was lost.
  IF NOT FOUND THEN
    RETURN TRUE;
  END IF;

  IF existing_lock_token IS DISTINCT FROM p_lock_token THEN
    RETURN FALSE;
  END IF;

  -- Historical revoked rows must never use a cleanup claim to inspect or
  -- delete an Auth identity that belongs to a later live invitation for the
  -- same email address.
  IF claim_kind = 'revoke_cleanup' AND (
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

  -- This release path is cleanup-only. Successful finalization deletes the
  -- claim atomically in finalize_workspace_invite. Refuse cleanup release while
  -- any Auth identity is still bound or carries either invitation marker. The
  -- email-only provider fallback is valid only for the delivery attempt that
  -- acquired this claim; revoke cleanup uses exact identity/metadata binding.
  IF EXISTS (
    SELECT 1
    FROM auth.users AS auth_user
    WHERE auth_user.id = membership.user_id
      OR auth_user.raw_user_meta_data ->> 'workspace_membership_id' = membership.id::TEXT
      OR auth_user.raw_app_meta_data ->> 'workspace_membership_id' = membership.id::TEXT
      OR (
        claim_kind = 'deliver'
        AND claim_acquired_at IS NOT NULL
        AND lower(btrim(auth_user.email)) = membership.email_normalized
        AND auth_user.invited_at IS NOT NULL
        AND auth_user.created_at >= claim_acquired_at
      )
  ) THEN
    RAISE EXCEPTION 'workspace invite Auth cleanup is incomplete'
      USING ERRCODE = '55000';
  END IF;

  DELETE FROM public.workspace_invite_delivery_claims AS claim
  WHERE claim.membership_id = p_membership_id
    AND claim.lock_token = p_lock_token;

  RETURN TRUE;
END;
$$;

-- Replaying a draft of this migration must not leave the earlier unclaimed
-- two-argument finalizer callable.
DROP FUNCTION IF EXISTS public.finalize_workspace_invite(UUID, UUID);
DROP FUNCTION IF EXISTS public.finalize_workspace_invite(UUID, UUID, UUID);

CREATE OR REPLACE FUNCTION public.finalize_workspace_invite(
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
  auth_user_id UUID;
  auth_email TEXT;
  auth_invited_at TIMESTAMPTZ;
  auth_created_at TIMESTAMPTZ;
  auth_confirmed_at TIMESTAMPTZ;
  auth_last_sign_in_at TIMESTAMPTZ;
  auth_has_password BOOLEAN;
  auth_workspace_id TEXT;
  auth_membership_id TEXT;
  delivery_lock_token UUID;
  delivery_claim_kind TEXT;
  membership public.workspace_memberships%ROWTYPE;
BEGIN
  IF p_membership_id IS NULL
    OR p_actor_user_id IS NULL
    OR p_lock_token IS NULL
    OR p_auth_user_id IS NULL
  THEN
    RAISE EXCEPTION 'membership_id, actor_user_id, lock_token, and auth_user_id are required'
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
    RAISE EXCEPTION 'workspace invitation not found'
      USING ERRCODE = 'P0002';
  END IF;

  IF membership.status = 'invited' AND membership.user_id IS NOT NULL THEN
    IF membership.user_id = p_auth_user_id THEN
      RETURN membership;
    END IF;

    RAISE EXCEPTION 'workspace invitation is bound to a different Auth identity'
      USING ERRCODE = '42501';
  END IF;

  IF membership.status <> 'provisioning' THEN
    RAISE EXCEPTION 'workspace invitation is not provisioning'
      USING ERRCODE = '55000';
  END IF;

  SELECT claim.lock_token, claim.claim_kind
  INTO delivery_lock_token, delivery_claim_kind
  FROM public.workspace_invite_delivery_claims AS claim
  WHERE claim.membership_id = membership.id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'workspace invite delivery claim is required'
      USING ERRCODE = '55000';
  END IF;

  IF delivery_lock_token IS DISTINCT FROM p_lock_token THEN
    RAISE EXCEPTION 'workspace invite delivery is busy'
      USING ERRCODE = '55P03';
  END IF;

  IF delivery_claim_kind <> 'deliver' THEN
    RAISE EXCEPTION 'workspace invite delivery claim has the wrong purpose'
      USING ERRCODE = '55000';
  END IF;

  SELECT
    auth_user.id,
    lower(btrim(auth_user.email)),
    auth_user.invited_at,
    auth_user.created_at,
    auth_user.confirmed_at,
    auth_user.last_sign_in_at,
    COALESCE(char_length(auth_user.encrypted_password), 0) > 0,
    auth_user.raw_app_meta_data ->> 'workspace_id',
    auth_user.raw_app_meta_data ->> 'workspace_membership_id'
  INTO
    auth_user_id,
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

  IF NOT FOUND OR auth_user_id IS NULL THEN
    RAISE EXCEPTION 'workspace invitation Auth identity is not ready'
      USING ERRCODE = '55000';
  END IF;

  IF auth_workspace_id IS NULL OR auth_membership_id IS NULL THEN
    RAISE EXCEPTION 'workspace invitation Auth identity is not ready'
      USING ERRCODE = '55000';
  END IF;

  IF auth_email IS DISTINCT FROM membership.email_normalized
    OR auth_workspace_id IS DISTINCT FROM membership.workspace_id::TEXT
    OR auth_membership_id IS DISTINCT FROM membership.id::TEXT
    OR auth_invited_at IS NULL
    OR auth_created_at IS NULL
    OR auth_created_at < membership.created_at - interval '1 minute'
    OR auth_confirmed_at IS NOT NULL
    OR auth_last_sign_in_at IS NOT NULL
    OR auth_has_password
    OR public.is_platform_admin_email(auth_email)
  THEN
    RAISE EXCEPTION 'workspace invitation Auth identity is unsafe'
      USING ERRCODE = '42501';
  END IF;

  UPDATE public.workspace_memberships
  SET
    user_id = auth_user_id,
    status = 'invited',
    invited_at = auth_invited_at,
    invite_expires_at = auth_invited_at + interval '24 hours'
  WHERE id = membership.id
    AND status = 'provisioning'
  RETURNING * INTO membership;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'workspace invitation finalization failed'
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
    'workspace.membership.invited',
    'workspace_membership',
    membership.id,
    jsonb_build_object('email', membership.email_normalized, 'role', membership.role)
  );

  -- Claim release and invitation finalization commit together. A lost RPC
  -- response can therefore be retried idempotently through the invited branch
  -- above without risking deletion of the finalized Auth user.
  DELETE FROM public.workspace_invite_delivery_claims AS claim
  WHERE claim.membership_id = membership.id
    AND claim.lock_token = p_lock_token;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'workspace invite delivery claim was lost'
      USING ERRCODE = '55000';
  END IF;

  RETURN membership;
END;
$$;

DROP FUNCTION IF EXISTS public.find_workspace_invite_auth_user(UUID, UUID);

CREATE OR REPLACE FUNCTION public.find_workspace_invite_auth_user(
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
  existing_claim_kind TEXT;
  existing_lock_token UUID;
  membership public.workspace_memberships%ROWTYPE;
  matched_user_id UUID;
BEGIN
  IF p_membership_id IS NULL
    OR p_actor_user_id IS NULL
    OR p_lock_token IS NULL
  THEN
    RAISE EXCEPTION 'membership_id, actor_user_id, and lock_token are required'
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

  IF NOT FOUND THEN
    RAISE EXCEPTION 'workspace invitation not found'
      USING ERRCODE = 'P0002';
  END IF;

  SELECT claim.lock_token, claim.claim_kind
  INTO existing_lock_token, existing_claim_kind
  FROM public.workspace_invite_delivery_claims AS claim
  WHERE claim.membership_id = membership.id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'workspace invite delivery claim is required'
      USING ERRCODE = '55000';
  END IF;

  IF existing_lock_token IS DISTINCT FROM p_lock_token THEN
    RAISE EXCEPTION 'workspace invite delivery is busy'
      USING ERRCODE = '55P03';
  END IF;

  IF existing_claim_kind = 'revoke_cleanup' AND (
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

  -- Every candidate source, including an app-metadata-only match, must pass the
  -- contradictory-ownership precheck. Trusted app metadata or another
  -- membership binding always wins over an old/user-editable marker.
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
    )
      AND (
        (
          auth_user.raw_app_meta_data ->> 'workspace_membership_id' IS NOT NULL
          AND auth_user.raw_app_meta_data ->> 'workspace_membership_id' <> membership.id::TEXT
        )
        OR (
          auth_user.raw_app_meta_data ->> 'workspace_id' IS NOT NULL
          AND auth_user.raw_app_meta_data ->> 'workspace_id' <> membership.workspace_id::TEXT
        )
        OR EXISTS (
          SELECT 1
          FROM public.workspace_memberships AS bound_membership
          WHERE bound_membership.id <> membership.id
            AND bound_membership.user_id = auth_user.id
        )
      )
  ) THEN
    RAISE EXCEPTION 'workspace invitation Auth identity is unsafe: contradictory ownership'
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
      AND auth_user.invited_at IS NOT NULL
      AND auth_user.created_at >= membership.created_at - interval '1 minute'
    )
    OR (
      auth_user.raw_app_meta_data ->> 'workspace_membership_id' = membership.id::TEXT
      AND auth_user.raw_app_meta_data ->> 'workspace_id' = membership.workspace_id::TEXT
    );

  IF COALESCE(cardinality(candidate_user_ids), 0) = 0 THEN
    RETURN NULL;
  END IF;

  IF cardinality(candidate_user_ids) <> 1 THEN
    RAISE EXCEPTION 'workspace invitation Auth identity is ambiguous'
      USING ERRCODE = '55000';
  END IF;

  matched_user_id := candidate_user_ids[1];
  IF candidate_emails[1] IS DISTINCT FROM membership.email_normalized
    OR public.is_platform_admin_email(candidate_emails[1])
  THEN
    RAISE EXCEPTION 'workspace invitation Auth identity is unsafe'
      USING ERRCODE = '42501';
  END IF;

  RETURN matched_user_id;
END;
$$;

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
    COALESCE(char_length(auth_user.encrypted_password), 0) > 0
  INTO auth_email, auth_has_password
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

-- Membership/workspace state and its audit event change in one transaction.
-- The database state is authoritative; the Edge Function reconciles the
-- external Auth state while holding a durable lifecycle claim.
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
     OR p_action NOT IN ('suspend', 'reactivate') THEN
    RAISE EXCEPTION 'unsupported workspace membership transition'
      USING ERRCODE = '22023';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM auth.users AS auth_user
    JOIN public.admin_users AS admin_user
      ON lower(btrim(admin_user.email)) = lower(btrim(auth_user.email))
    JOIN public.workspace_memberships AS actor_membership
      ON actor_membership.user_id = auth_user.id
      AND actor_membership.email_normalized = lower(btrim(auth_user.email))
      AND actor_membership.status = 'active'
    JOIN public.workspaces AS actor_workspace
      ON actor_workspace.id = actor_membership.workspace_id
      AND actor_workspace.is_default
      AND actor_workspace.status = 'active'
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

    IF NOT FOUND THEN
      RAISE EXCEPTION 'workspace account Auth identity is missing'
        USING ERRCODE = '55000';
    END IF;
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.admin_users AS admin_user
    WHERE lower(btrim(admin_user.email)) IN (
      membership.email_normalized,
      bound_auth_email
    )
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

-- Revocation and its Auth cleanup use the same non-stealable claim as invite
-- delivery. The membership is revoked before this function returns, while the
-- claim remains until the exact Auth identity is confirmed absent.
DROP FUNCTION IF EXISTS public.revoke_workspace_invite(UUID, UUID);

CREATE OR REPLACE FUNCTION public.revoke_workspace_invite(
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
  bound_auth_email TEXT;
  existing_claim public.workspace_invite_delivery_claims%ROWTYPE;
  membership public.workspace_memberships%ROWTYPE;
BEGIN
  IF p_membership_id IS NULL
    OR p_actor_user_id IS NULL
    OR p_lock_token IS NULL
  THEN
    RAISE EXCEPTION 'membership_id, actor_user_id, and lock_token are required'
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

  -- Read the email first, then take every same-email membership lock in a
  -- deterministic order. This matches fresh invitation provisioning and
  -- closes the historical-row/new-invitation race before a cleanup claim can
  -- be acquired. Invite-delivery functions still take membership -> claim.
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

  IF NOT FOUND THEN
    RAISE EXCEPTION 'workspace invitation not found'
      USING ERRCODE = 'P0002';
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

  IF public.is_platform_admin_email(membership.email_normalized) THEN
    RAISE EXCEPTION 'platform administrators cannot be changed here'
      USING ERRCODE = '42501';
  END IF;

  IF membership.user_id IS NOT NULL THEN
    SELECT lower(btrim(auth_user.email))
    INTO bound_auth_email
    FROM auth.users AS auth_user
    WHERE auth_user.id = membership.user_id
      AND NULLIF(btrim(auth_user.email), '') IS NOT NULL;

    IF FOUND AND public.is_platform_admin_email(bound_auth_email) THEN
      RAISE EXCEPTION 'platform administrators cannot be changed here'
        USING ERRCODE = '42501';
    END IF;
  END IF;

  -- An old revoked record is not a cleanup handle for a later account. This
  -- check runs after the same-email lock and before any claim lookup/insert.
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

  -- A retry carrying the same token observes the original review timestamp and
  -- never extends or steals the claim.
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
      'workspace.membership.revoked',
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
  membership public.workspace_memberships%ROWTYPE;
  existing_claim public.workspace_auth_lifecycle_claims%ROWTYPE;
  actor_email TEXT;
  auth_email TEXT;
  desired_status TEXT;
BEGIN
  IF p_membership_id IS NULL
    OR p_actor_user_id IS NULL
    OR p_lock_token IS NULL
    OR p_action IS NULL
    OR p_action NOT IN (
      'suspend',
      'reactivate',
      'reconcile_active',
      'reconcile_suspended'
    )
  THEN
    RAISE EXCEPTION 'invalid workspace Auth lifecycle claim'
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
    RAISE EXCEPTION 'workspace account not found'
      USING ERRCODE = 'P0002';
  END IF;

  IF public.is_platform_admin_email(membership.email_normalized) THEN
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

  IF membership.user_id IS NULL THEN
    RAISE EXCEPTION 'workspace account Auth identity is missing'
      USING ERRCODE = '55000';
  END IF;

  SELECT lower(btrim(auth_user.email))
  INTO auth_email
  FROM auth.users AS auth_user
  WHERE auth_user.id = membership.user_id
    AND NULLIF(btrim(auth_user.email), '') IS NOT NULL;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'workspace account Auth identity is missing'
      USING ERRCODE = '55000';
  END IF;

  IF public.is_platform_admin_email(auth_email) THEN
    RAISE EXCEPTION 'platform administrators cannot be changed here'
      USING ERRCODE = '42501';
  END IF;

  IF p_action IN ('reactivate', 'reconcile_active')
    AND auth_email IS DISTINCT FROM membership.email_normalized
  THEN
    RAISE EXCEPTION 'workspace account identity mismatch requires manual review'
      USING ERRCODE = '55000';
  END IF;

  desired_status := CASE p_action
    WHEN 'suspend' THEN 'suspended'
    WHEN 'reconcile_suspended' THEN 'suspended'
    ELSE 'active'
  END;

  -- Reconciliation must never bless a database-side lifecycle mismatch. Lock
  -- the paired workspace before reading/creating the durable claim.
  PERFORM 1
  FROM public.workspaces AS workspace
  WHERE workspace.id = membership.workspace_id
    AND NOT workspace.is_default
    AND workspace.status = CASE membership.status
      WHEN 'provisioning' THEN 'active'
      WHEN 'invited' THEN 'active'
      WHEN 'active' THEN 'active'
      WHEN 'suspended' THEN 'suspended'
      WHEN 'revoked' THEN 'archived'
    END
    AND NOT EXISTS (
      SELECT 1
      FROM public.workspace_memberships AS other_membership
      WHERE other_membership.workspace_id = membership.workspace_id
        AND other_membership.id <> membership.id
    )
  FOR SHARE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'private workspace lifecycle does not match its membership'
      USING ERRCODE = '23514';
  END IF;

  SELECT claim.*
  INTO existing_claim
  FROM public.workspace_auth_lifecycle_claims AS claim
  WHERE claim.membership_id = membership.id
  FOR UPDATE;

  -- A different token never takes over automatically, even after review_after.
  -- The marker only tells an operator when a stranded invocation is old
  -- enough to investigate and reconcile manually.
  IF FOUND
    AND existing_claim.lock_token IS DISTINCT FROM p_lock_token
  THEN
    RAISE EXCEPTION 'workspace Auth lifecycle is busy'
      USING ERRCODE = '55P03';
  END IF;

  IF FOUND
    AND existing_claim.lock_token = p_lock_token
    AND (
      existing_claim.action IS DISTINCT FROM p_action
      OR existing_claim.desired_status IS DISTINCT FROM desired_status
      OR existing_claim.actor_user_id IS DISTINCT FROM p_actor_user_id
    )
  THEN
    RAISE EXCEPTION 'workspace Auth lifecycle token was reused inconsistently'
      USING ERRCODE = '22023';
  END IF;

  -- A retry with the same token observes the transition already committed by
  -- its original claim. It never refreshes the claim or writes a second
  -- transition audit event.
  IF FOUND THEN
    IF membership.status IS DISTINCT FROM desired_status THEN
      RAISE EXCEPTION 'workspace Auth lifecycle claim is inconsistent'
        USING ERRCODE = '55000';
    END IF;
    RETURN membership;
  END IF;

  -- A fresh normal action is a transition, never an implicit reconciliation.
  -- Reconciliation has its own action and requires the exact current desired
  -- status while this membership row is locked, so a stale dialog cannot undo
  -- a concurrent suspend/reactivate transition.
  IF p_action = 'suspend' AND membership.status <> 'active' THEN
    RAISE EXCEPTION 'workspace account is not active'
      USING ERRCODE = '55000';
  ELSIF p_action = 'reactivate' AND membership.status <> 'suspended' THEN
    RAISE EXCEPTION 'workspace account is not suspended'
      USING ERRCODE = '55000';
  ELSIF p_action = 'reconcile_active' AND membership.status <> 'active' THEN
    RAISE EXCEPTION 'workspace account status no longer matches active reconciliation'
      USING ERRCODE = '55000';
  ELSIF p_action = 'reconcile_suspended' AND membership.status <> 'suspended' THEN
    RAISE EXCEPTION 'workspace account status no longer matches suspended reconciliation'
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
      membership.id,
      'suspend',
      p_actor_user_id
    );
  ELSIF p_action = 'reactivate' THEN
    membership := public.transition_workspace_membership(
      membership.id,
      'reactivate',
      p_actor_user_id
    );
  END IF;

  RETURN membership;
END;
$$;

-- Earlier drafts exposed an unaudited release path. Successful provider
-- reconciliation must instead complete through the token-bound RPC below;
-- an ambiguous provider error deliberately leaves the durable claim intact.
DROP FUNCTION IF EXISTS public.release_workspace_auth_lifecycle_claim(UUID, UUID);

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
  completion_request_id TEXT;
  desired_status TEXT;
  existing_claim public.workspace_auth_lifecycle_claims%ROWTYPE;
  membership public.workspace_memberships%ROWTYPE;
BEGIN
  IF p_membership_id IS NULL
    OR p_actor_user_id IS NULL
    OR p_lock_token IS NULL
    OR p_action IS NULL
    OR p_action NOT IN (
      'suspend',
      'reactivate',
      'reconcile_active',
      'reconcile_suspended'
    )
  THEN
    RAISE EXCEPTION 'invalid workspace Auth lifecycle completion'
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

  desired_status := CASE p_action
    WHEN 'suspend' THEN 'suspended'
    WHEN 'reconcile_suspended' THEN 'suspended'
    ELSE 'active'
  END;
  -- Store only a one-way fingerprint as the audit idempotency key. The raw
  -- lifecycle capability token is never written to the audit log.
  completion_request_id := 'auth-lifecycle:' || md5(p_lock_token::TEXT);

  SELECT existing_membership.*
  INTO membership
  FROM public.workspace_memberships AS existing_membership
  WHERE existing_membership.id = p_membership_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'workspace account not found'
      USING ERRCODE = 'P0002';
  END IF;

  -- Completion and its idempotent retry both require the exact database-side
  -- lifecycle pair before the durable claim may be released or observed done.
  PERFORM 1
  FROM public.workspaces AS workspace
  WHERE workspace.id = membership.workspace_id
    AND NOT workspace.is_default
    AND workspace.status = CASE membership.status
      WHEN 'provisioning' THEN 'active'
      WHEN 'invited' THEN 'active'
      WHEN 'active' THEN 'active'
      WHEN 'suspended' THEN 'suspended'
      WHEN 'revoked' THEN 'archived'
    END
    AND NOT EXISTS (
      SELECT 1
      FROM public.workspace_memberships AS other_membership
      WHERE other_membership.workspace_id = membership.workspace_id
        AND other_membership.id <> membership.id
    )
  FOR SHARE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'private workspace lifecycle does not match its membership'
      USING ERRCODE = '23514';
  END IF;

  SELECT claim.*
  INTO existing_claim
  FROM public.workspace_auth_lifecycle_claims AS claim
  WHERE claim.membership_id = p_membership_id
  FOR UPDATE;

  -- A retry after the completion transaction committed finds the append-only
  -- audit event by its token fingerprint and returns without duplicating it.
  IF NOT FOUND THEN
    IF membership.status = desired_status AND EXISTS (
      SELECT 1
      FROM public.workspace_audit_log AS audit
      WHERE audit.workspace_id = membership.workspace_id
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

  IF membership.status IS DISTINCT FROM desired_status THEN
    RAISE EXCEPTION 'workspace account status changed during Auth reconciliation'
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

CREATE OR REPLACE FUNCTION public.list_workspace_auth_lifecycle_pending()
RETURNS TABLE (
  membership_id UUID,
  review_after TIMESTAMPTZ
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF auth.role() <> 'service_role' THEN
    RAISE EXCEPTION 'service role access is required'
      USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
  SELECT claim.membership_id, claim.review_after
  FROM public.workspace_auth_lifecycle_claims AS claim
  ORDER BY claim.membership_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.list_workspace_invite_cleanup_conflicts()
RETURNS TABLE (
  membership_id UUID,
  has_newer_membership BOOLEAN
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF auth.role() <> 'service_role' THEN
    RAISE EXCEPTION 'service role access is required'
      USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
  SELECT
    historical_membership.id,
    EXISTS (
      SELECT 1
      FROM public.workspace_memberships AS newer_membership
      WHERE newer_membership.id <> historical_membership.id
        AND newer_membership.email_normalized = historical_membership.email_normalized
        AND newer_membership.created_at >= historical_membership.created_at
    ) AS has_newer_membership
  FROM public.workspace_memberships AS historical_membership
  WHERE historical_membership.status = 'revoked'
    AND (
      EXISTS (
        SELECT 1
        FROM public.workspace_memberships AS newer_membership
        WHERE newer_membership.id <> historical_membership.id
          AND newer_membership.email_normalized = historical_membership.email_normalized
          AND newer_membership.created_at >= historical_membership.created_at
      ) OR EXISTS (
        SELECT 1
        FROM public.workspace_invite_delivery_claims AS other_claim
        JOIN public.workspace_memberships AS other_membership
          ON other_membership.id = other_claim.membership_id
        WHERE other_membership.id <> historical_membership.id
          AND other_membership.email_normalized = historical_membership.email_normalized
      )
    )
  ORDER BY historical_membership.id;
END;
$$;

CREATE OR REPLACE FUNCTION public.list_workspace_invite_reconciliation_pending()
RETURNS TABLE (
  membership_id UUID,
  claim_kind TEXT,
  review_after TIMESTAMPTZ
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF auth.role() <> 'service_role' THEN
    RAISE EXCEPTION 'service role access is required'
      USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
  SELECT claim.membership_id, claim.claim_kind, claim.review_after
  FROM public.workspace_invite_delivery_claims AS claim
  ORDER BY claim.membership_id;
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
REVOKE ALL ON FUNCTION public.enforce_private_workspace_lifecycle_pair()
  FROM PUBLIC;
REVOKE ALL ON FUNCTION public.prevent_workspace_audit_mutation() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.record_public_client_dashboard_view(UUID)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.record_public_prospect_dashboard_view(UUID)
  FROM PUBLIC, anon, authenticated;

REVOKE ALL ON FUNCTION public.is_platform_admin() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.is_platform_admin_email(TEXT)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.is_platform_admin_identity(UUID, TEXT)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.current_workspace_id() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.can_access_workspace(UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.can_manage_workspace(UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.can_access_client(UUID) FROM PUBLIC;
-- Anonymous write gates also call this helper. With no authenticated email it
-- deterministically returns false, yielding a normal RLS denial.
GRANT EXECUTE ON FUNCTION public.is_platform_admin() TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.is_platform_admin_email(TEXT) TO service_role;
GRANT EXECUTE ON FUNCTION public.is_platform_admin_identity(UUID, TEXT)
  TO service_role;
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
REVOKE ALL ON FUNCTION public.begin_workspace_invite(TEXT, TEXT, TEXT, TEXT, UUID)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.begin_workspace_invite(TEXT, TEXT, TEXT, TEXT, UUID)
  TO service_role;
REVOKE ALL ON FUNCTION public.claim_workspace_invite_delivery(UUID, UUID, UUID)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.claim_workspace_invite_delivery(UUID, UUID, UUID)
  TO service_role;
REVOKE ALL ON FUNCTION public.release_workspace_invite_delivery_claim(UUID, UUID)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.release_workspace_invite_delivery_claim(UUID, UUID)
  TO service_role;
REVOKE ALL ON FUNCTION public.finalize_workspace_invite(UUID, UUID, UUID, UUID)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.finalize_workspace_invite(UUID, UUID, UUID, UUID)
  TO service_role;
REVOKE ALL ON FUNCTION public.find_workspace_invite_auth_user(UUID, UUID, UUID)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.find_workspace_invite_auth_user(UUID, UUID, UUID)
  TO service_role;
REVOKE ALL ON FUNCTION public.revoke_workspace_invite(UUID, UUID, UUID)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.revoke_workspace_invite(UUID, UUID, UUID)
  TO service_role;

REVOKE ALL ON FUNCTION public.transition_workspace_membership(UUID, TEXT, UUID)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.transition_workspace_membership(UUID, TEXT, UUID)
  TO service_role;
REVOKE ALL ON FUNCTION public.claim_workspace_auth_lifecycle(UUID, TEXT, UUID, UUID)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.claim_workspace_auth_lifecycle(UUID, TEXT, UUID, UUID)
  TO service_role;
REVOKE ALL ON FUNCTION public.complete_workspace_auth_lifecycle(UUID, TEXT, UUID, UUID)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.complete_workspace_auth_lifecycle(UUID, TEXT, UUID, UUID)
  TO service_role;
REVOKE ALL ON FUNCTION public.list_workspace_auth_lifecycle_pending()
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.list_workspace_auth_lifecycle_pending()
  TO service_role;
REVOKE ALL ON FUNCTION public.list_workspace_invite_cleanup_conflicts()
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.list_workspace_invite_cleanup_conflicts()
  TO service_role;
REVOKE ALL ON FUNCTION public.list_workspace_invite_reconciliation_pending()
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.list_workspace_invite_reconciliation_pending()
  TO service_role;

COMMENT ON TABLE public.workspaces IS
  'Tenant workspaces for the invite-only application.';
COMMENT ON TABLE public.workspace_memberships IS
  'Workspace members and pending invitations. Provisioning rows are unbound; delivered invitations bind the exact Auth user before acceptance.';
COMMENT ON TABLE public.workspace_audit_log IS
  'Append-only audit events for workspace-scoped administrative actions.';
COMMENT ON TABLE public.workspace_auth_lifecycle_claims IS
  'Service-function-only, action-bound, non-stealable claims for cross-system Auth reconciliation.';
COMMENT ON TABLE public.workspace_invite_delivery_claims IS
  'Service-function-only, non-stealable claims for cross-system Auth invitation delivery and cleanup.';
COMMENT ON COLUMN public.clients.workspace_id IS
  'Owning tenant workspace. Existing rows were assigned to the default Get On A Pod workspace.';
COMMENT ON FUNCTION public.accept_workspace_invite(UUID, UUID, TEXT) IS
  'Service-role-only transactional activation of an invited workspace_membership.';
COMMENT ON FUNCTION public.begin_workspace_invite(TEXT, TEXT, TEXT, TEXT, UUID) IS
  'Service-role-only atomic creation of a fail-closed provisioning membership and private workspace.';
COMMENT ON FUNCTION public.claim_workspace_invite_delivery(UUID, UUID, UUID) IS
  'Service-role-only, durable, idempotent claim that serializes invitation delivery without automatic takeover.';
COMMENT ON FUNCTION public.release_workspace_invite_delivery_claim(UUID, UUID) IS
  'Service-role-only cleanup release of a matching invitation-delivery claim after Auth absence is verified.';
COMMENT ON FUNCTION public.finalize_workspace_invite(UUID, UUID, UUID, UUID) IS
  'Service-role-only token-bound Auth invitation finalization with atomic audit and delivery-claim release.';
COMMENT ON FUNCTION public.find_workspace_invite_auth_user(UUID, UUID, UUID) IS
  'Service-role-only, token-bound, ambiguity-rejecting reconciliation lookup for an Auth user created from a specific workspace invitation.';
COMMENT ON FUNCTION public.revoke_workspace_invite(UUID, UUID, UUID) IS
  'Service-role-only atomic pending-invite revocation and durable Auth-cleanup claim acquisition.';
COMMENT ON FUNCTION public.is_platform_admin_identity(UUID, TEXT) IS
  'Service-role-only platform-admin check bound to Auth user, current email, and an active default-workspace membership.';
COMMENT ON FUNCTION public.transition_workspace_membership(UUID, TEXT, UUID) IS
  'Service-role-only atomic suspend or reactivate transition. Pending invitations must use the durable Auth-cleanup revocation workflow.';
COMMENT ON FUNCTION public.claim_workspace_auth_lifecycle(UUID, TEXT, UUID, UUID) IS
  'Service-role-only, durable, action-bound claim for explicit Auth transitions or status-preserving reconciliation without automatic takeover.';
COMMENT ON FUNCTION public.complete_workspace_auth_lifecycle(UUID, TEXT, UUID, UUID) IS
  'Service-role-only token-bound Auth reconciliation completion with atomic minimal audit and claim deletion.';
COMMENT ON FUNCTION public.list_workspace_auth_lifecycle_pending() IS
  'Service-role-only projection of lifecycle membership IDs and review timestamps; tokens and actors are never returned.';
COMMENT ON FUNCTION public.list_workspace_invite_cleanup_conflicts() IS
  'Service-role-only projection identifying historical invite cleanup records superseded by another membership or claim.';
COMMENT ON FUNCTION public.list_workspace_invite_reconciliation_pending() IS
  'Service-role-only projection of invite claim purpose and review timestamp; tokens and actors are never returned.';
COMMENT ON FUNCTION public.record_public_prospect_dashboard_view(UUID) IS
  'Service-role-only atomic view counter for an active public prospect dashboard.';

COMMIT;
