-- Compatibility hardening for the legacy client portal.
BEGIN;

-- Historical migrations recreated public.clients after the original portal
-- migration in some environments. Reconcile the portal columns additively;
-- existing values are preserved.
ALTER TABLE public.clients
  ADD COLUMN IF NOT EXISTS portal_access_enabled BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS portal_last_login_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS portal_invitation_sent_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS portal_password TEXT,
  ADD COLUMN IF NOT EXISTS password_set_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS password_set_by TEXT,
  ADD COLUMN IF NOT EXISTS portal_email_normalized TEXT
    GENERATED ALWAYS AS (
      CASE
        WHEN email IS NULL THEN NULL
        ELSE lower(btrim(email))
      END
    ) STORED;

ALTER TABLE public.clients
  DROP CONSTRAINT IF EXISTS clients_portal_access_email_check;
ALTER TABLE public.clients
  ADD CONSTRAINT clients_portal_access_email_check
  CHECK (
    NOT COALESCE(portal_access_enabled, false)
    OR NULLIF(btrim(email), '') IS NOT NULL
  ) NOT VALID;

ALTER TABLE public.clients
  VALIDATE CONSTRAINT clients_portal_access_email_check;

-- Email is only a global identity for enabled legacy portal accounts. Regular
-- workspace client records may share an email while their portal is disabled.
ALTER TABLE public.clients
  DROP CONSTRAINT IF EXISTS clients_one_enabled_portal_email_idx;
DROP INDEX IF EXISTS public.clients_one_enabled_portal_email_idx;
CREATE UNIQUE INDEX clients_one_enabled_portal_email_idx
  ON public.clients (portal_email_normalized)
  WHERE portal_access_enabled
    AND portal_email_normalized IS NOT NULL;

-- A historical DROP ... CASCADE could remove the client foreign keys while
-- leaving the portal tables behind. Re-add and validate those relationships so
-- an orphaned target fails this transaction before functions are deployed.
DO $$
DECLARE
  portal_relation RECORD;
BEGIN
  FOR portal_relation IN
    SELECT *
    FROM (VALUES
      ('client_portal_tokens', 'client_portal_tokens_client_id_fkey'),
      ('client_portal_sessions', 'client_portal_sessions_client_id_fkey'),
      ('client_portal_activity_log', 'client_portal_activity_log_client_id_fkey')
    ) AS required_relation(table_name, constraint_name)
  LOOP
    EXECUTE format(
      'ALTER TABLE public.%I DROP CONSTRAINT IF EXISTS %I',
      portal_relation.table_name,
      portal_relation.constraint_name
    );
    EXECUTE format(
      'ALTER TABLE public.%I ADD CONSTRAINT %I '
      'FOREIGN KEY (client_id) REFERENCES public.clients(id) '
      'ON DELETE CASCADE NOT VALID',
      portal_relation.table_name,
      portal_relation.constraint_name
    );
  END LOOP;
END;
$$;

ALTER TABLE public.client_portal_tokens
  VALIDATE CONSTRAINT client_portal_tokens_client_id_fkey;
ALTER TABLE public.client_portal_sessions
  VALIDATE CONSTRAINT client_portal_sessions_client_id_fkey;
ALTER TABLE public.client_portal_activity_log
  VALIDATE CONSTRAINT client_portal_activity_log_client_id_fkey;

-- Unknown-account attempts need an audit row for rate limiting, but the old
-- schema made that impossible by requiring a client foreign key.
ALTER TABLE public.client_portal_activity_log
  ALTER COLUMN client_id DROP NOT NULL;

REVOKE ALL PRIVILEGES ON TABLE public.client_portal_tokens
  FROM PUBLIC, anon, authenticated;
REVOKE ALL PRIVILEGES ON TABLE public.client_portal_sessions
  FROM PUBLIC, anon, authenticated;
REVOKE ALL PRIVILEGES ON TABLE public.client_portal_activity_log
  FROM PUBLIC, anon, authenticated;

-- Historical policies granted every authenticated account unrestricted access
-- to bearer artifacts. Workspace accounts must never mint, inspect, mutate, or
-- delete portal credentials/sessions directly; all access is server-only.
DROP POLICY IF EXISTS "Admin full access to portal tokens"
  ON public.client_portal_tokens;
DROP POLICY IF EXISTS "Admin full access to portal sessions"
  ON public.client_portal_sessions;
DROP POLICY IF EXISTS "Admin full access to activity logs"
  ON public.client_portal_activity_log;

GRANT ALL PRIVILEGES ON TABLE public.client_portal_tokens TO service_role;
GRANT ALL PRIVILEGES ON TABLE public.client_portal_sessions TO service_role;
GRANT ALL PRIVILEGES ON TABLE public.client_portal_activity_log TO service_role;

-- The revocation trigger is installed later in this migration, so explicitly
-- remove both kinds of bearer artifact for every already-disabled portal at
-- cutover. No previously issued access may survive a disabled client record.
DELETE FROM public.client_portal_tokens AS token
USING public.clients AS client
WHERE token.client_id = client.id
  AND client.portal_access_enabled IS NOT TRUE;

DELETE FROM public.client_portal_sessions AS session
USING public.clients AS client
WHERE session.client_id = client.id
  AND client.portal_access_enabled IS NOT TRUE;

DELETE FROM public.client_portal_sessions AS session
USING public.clients AS client, public.workspaces AS workspace
WHERE session.client_id = client.id
  AND workspace.id = client.workspace_id
  AND workspace.status IN ('suspended', 'archived');

-- Magic-link authentication is retired in the invite-only MVP. Remove any
-- remaining token, including tokens for enabled clients, before deploying the
-- same-name 410 Edge tombstones.
DELETE FROM public.client_portal_tokens;

-- Raw legacy sessions cannot coexist safely with hash-only lookup: accepting a
-- raw fallback would also make a leaked stored verifier usable as a bearer.
-- Sessions last only 24 hours, so invalidate legacy rows at cutover and require
-- every client to log in once after this migration.
DELETE FROM public.client_portal_sessions
WHERE session_token IS NULL
   OR session_token !~ '^sha256\$[A-Za-z0-9+/]{43}=$';

ALTER TABLE public.client_portal_sessions
  ALTER COLUMN session_token SET NOT NULL;

-- Hash-only validation and logout require a verifier to identify exactly one
-- session. Reconcile prepared databases where the historical UNIQUE constraint
-- may have drifted or never been created.
ALTER TABLE public.client_portal_sessions
  DROP CONSTRAINT IF EXISTS client_portal_sessions_token_verifier_uidx;
DROP INDEX IF EXISTS public.client_portal_sessions_token_verifier_uidx;
CREATE UNIQUE INDEX client_portal_sessions_token_verifier_uidx
  ON public.client_portal_sessions (session_token);

ALTER TABLE public.client_portal_sessions
  DROP CONSTRAINT IF EXISTS client_portal_sessions_hashed_token_check;
ALTER TABLE public.client_portal_sessions
  ADD CONSTRAINT client_portal_sessions_hashed_token_check
  CHECK (session_token ~ '^sha256\$[A-Za-z0-9+/]{43}=$') NOT VALID;

ALTER TABLE public.client_portal_sessions
  VALIDATE CONSTRAINT client_portal_sessions_hashed_token_check;

-- Reserve each password-login attempt under transaction-scoped advisory locks.
-- Counting reservations, rather than checking and later recording failures in
-- separate requests, closes the parallel-request race in the old limiter.
CREATE INDEX IF NOT EXISTS client_portal_login_attempt_email_idx
  ON public.client_portal_activity_log (
    ((metadata ->> 'email')),
    created_at DESC
  )
  WHERE action = 'password_login_attempt';

CREATE INDEX IF NOT EXISTS client_portal_login_attempt_ip_idx
  ON public.client_portal_activity_log (ip_address, created_at DESC)
  WHERE action = 'password_login_attempt';

CREATE OR REPLACE FUNCTION public.reserve_client_portal_login_attempt(
  p_email_normalized TEXT,
  p_ip_address TEXT,
  p_user_agent TEXT
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  normalized_email TEXT := lower(btrim(COALESCE(p_email_normalized, '')));
  normalized_ip TEXT := COALESCE(NULLIF(btrim(p_ip_address), ''), 'unknown');
  recent_email_attempts BIGINT;
  recent_ip_attempts BIGINT;
BEGIN
  IF char_length(normalized_email) NOT BETWEEN 3 AND 254
    OR normalized_email IS DISTINCT FROM p_email_normalized
    OR char_length(normalized_ip) > 120
    OR char_length(COALESCE(p_user_agent, '')) > 1024
  THEN
    RAISE EXCEPTION 'invalid portal login attempt parameters'
      USING ERRCODE = '22023';
  END IF;

  -- Every caller acquires locks in the same email-then-IP order.
  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('portal-login-email:' || normalized_email, 0)
  );
  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('portal-login-ip:' || normalized_ip, 0)
  );

  SELECT count(*)
  INTO recent_email_attempts
  FROM public.client_portal_activity_log AS activity
  WHERE activity.action = 'password_login_attempt'
    AND activity.created_at >= now() - interval '15 minutes'
    AND activity.metadata ->> 'email' = normalized_email;

  SELECT count(*)
  INTO recent_ip_attempts
  FROM public.client_portal_activity_log AS activity
  WHERE activity.action = 'password_login_attempt'
    AND activity.created_at >= now() - interval '15 minutes'
    AND activity.ip_address = normalized_ip;

  IF recent_email_attempts >= 8 OR recent_ip_attempts >= 30 THEN
    RETURN false;
  END IF;

  INSERT INTO public.client_portal_activity_log (
    client_id,
    session_id,
    action,
    metadata,
    ip_address,
    user_agent
  )
  VALUES (
    NULL,
    NULL,
    'password_login_attempt',
    jsonb_build_object('email', normalized_email),
    normalized_ip,
    NULLIF(p_user_agent, '')
  );

  RETURN true;
END;
$$;

-- Password verifiers are server-only credentials, not client profile fields.
-- Legacy plaintext credentials are intentionally invalidated at cutover; only
-- versioned PBKDF2-SHA256 verifiers may be stored in this relation.
CREATE TABLE IF NOT EXISTS public.client_portal_credentials (
  client_id UUID PRIMARY KEY
    REFERENCES public.clients(id) ON DELETE CASCADE,
  password_verifier TEXT NOT NULL
    CHECK (char_length(password_verifier) BETWEEN 1 AND 512),
  credential_version BIGINT NOT NULL DEFAULT 1
    CHECK (credential_version > 0),
  configured_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  configured_by TEXT,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.client_portal_credentials
  DROP CONSTRAINT IF EXISTS client_portal_credentials_client_id_fkey;
ALTER TABLE public.client_portal_credentials
  ADD CONSTRAINT client_portal_credentials_client_id_fkey
  FOREIGN KEY (client_id)
  REFERENCES public.clients(id)
  ON DELETE CASCADE
  NOT VALID;
ALTER TABLE public.client_portal_credentials
  VALIDATE CONSTRAINT client_portal_credentials_client_id_fkey;

ALTER TABLE public.client_portal_credentials ENABLE ROW LEVEL SECURITY;
REVOKE ALL PRIVILEGES ON TABLE public.client_portal_credentials
  FROM PUBLIC, anon, authenticated;
GRANT ALL PRIVILEGES ON TABLE public.client_portal_credentials TO service_role;

-- A partially prepared target may already contain compatibility credentials.
-- Any client with a legacy plaintext value is treated as compromised even if a
-- syntactically valid verifier also exists; delete that verifier before the
-- plaintext marker is cleared so it can never revive on a later re-enable.
DELETE FROM public.client_portal_credentials AS credential
USING public.clients AS client
WHERE credential.client_id = client.id
  AND client.portal_password IS NOT NULL
  AND char_length(client.portal_password) > 0;

-- Disable affected portals and remove every remaining non-PBKDF2 value before
-- enforcing the storage invariant. An operator can re-enable access only by
-- setting a new password through the service-only management path.
UPDATE public.clients AS client
SET
  portal_access_enabled = false,
  password_set_at = NULL,
  password_set_by = NULL
WHERE (
    client.portal_password IS NOT NULL
    AND char_length(client.portal_password) > 0
  )
  OR EXISTS (
    SELECT 1
    FROM public.client_portal_credentials AS credential
    WHERE credential.client_id = client.id
      AND CASE
        WHEN credential.password_verifier ~
          '^pbkdf2_sha256\$[0-9]{6,7}\$[A-Za-z0-9+/]{22}==\$[A-Za-z0-9+/]{43}=$'
          THEN split_part(credential.password_verifier, '$', 2)::BIGINT
            NOT BETWEEN 100000 AND 1000000
        ELSE true
      END
  );

-- The preceding update may have disabled a partially prepared client after
-- the earlier artifact cleanup ran. Remove even already-hashed sessions for
-- that newly disabled portal before enforcing the final invariants.
DELETE FROM public.client_portal_sessions AS session
USING public.clients AS client
WHERE session.client_id = client.id
  AND client.portal_access_enabled IS NOT TRUE;

DELETE FROM public.client_portal_credentials
WHERE CASE
  WHEN password_verifier ~
    '^pbkdf2_sha256\$[0-9]{6,7}\$[A-Za-z0-9+/]{22}==\$[A-Za-z0-9+/]{43}=$'
    THEN split_part(password_verifier, '$', 2)::BIGINT
      NOT BETWEEN 100000 AND 1000000
  ELSE true
END;

ALTER TABLE public.client_portal_credentials
  DROP CONSTRAINT IF EXISTS client_portal_credentials_pbkdf2_check;
ALTER TABLE public.client_portal_credentials
  ADD CONSTRAINT client_portal_credentials_pbkdf2_check
  CHECK (
    CASE
      WHEN password_verifier ~
        '^pbkdf2_sha256\$[0-9]{6,7}\$[A-Za-z0-9+/]{22}==\$[A-Za-z0-9+/]{43}=$'
        THEN split_part(password_verifier, '$', 2)::BIGINT
          BETWEEN 100000 AND 1000000
      ELSE false
    END
  ) NOT VALID;

ALTER TABLE public.client_portal_credentials
  VALIDATE CONSTRAINT client_portal_credentials_pbkdf2_check;

-- Erase the retired profile credential. Password metadata was cleared above
-- for every invalidated legacy portal and is preserved for already-valid,
-- server-only PBKDF2 credentials on a prepared target.
UPDATE public.clients
SET
  portal_password = NULL
WHERE portal_password IS NOT NULL;

ALTER TABLE public.clients
  DROP CONSTRAINT IF EXISTS clients_portal_password_retired_check;
ALTER TABLE public.clients
  ADD CONSTRAINT clients_portal_password_retired_check
  CHECK (portal_password IS NULL) NOT VALID;

ALTER TABLE public.clients
  VALIDATE CONSTRAINT clients_portal_password_retired_check;

COMMENT ON TABLE public.client_portal_credentials IS
  'Server-only client portal password verifiers. Never expose this relation to browser roles.';
COMMENT ON COLUMN public.clients.portal_password IS
  'Retired compatibility column. Must remain NULL; verifiers live in client_portal_credentials.';
COMMENT ON COLUMN public.client_portal_sessions.session_token IS
  'SHA-256 verifier for an opaque client-held session token. Stored verifiers are never accepted as bearer tokens.';

-- Dashboard slugs are bearer capabilities: knowing one permits viewing the
-- associated approval dashboard and changing its feedback. Rotate every
-- pre-cutover link because regex shape cannot prove random provenance, then
-- keep every newly generated or supplied slug non-enumerable.
CREATE OR REPLACE FUNCTION public.generate_client_dashboard_slug()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = ''
AS $$
DECLARE
  slug_base TEXT;
BEGIN
  -- Ordinary browser users can never choose or rotate a capability slug. The
  -- workspace client endpoint uses the service role and also omits this field.
  IF auth.role() IN ('anon', 'authenticated')
    AND NOT public.is_platform_admin()
  THEN
    IF TG_OP = 'UPDATE' THEN
      NEW.dashboard_slug := OLD.dashboard_slug;
      RETURN NEW;
    END IF;
    NEW.dashboard_slug := NULL;
  END IF;

  IF NEW.dashboard_slug IS NULL
    OR NEW.dashboard_slug !~ '-[0-9a-f]{24}$'
  THEN
    slug_base := left(
      trim(BOTH '-' FROM lower(regexp_replace(COALESCE(NEW.name, 'client'), '[^a-zA-Z0-9]+', '-', 'g'))),
      48
    );
    IF slug_base = '' THEN
      slug_base := 'client';
    END IF;

    -- Each UUID contributes only its first 48 fully random bits, avoiding the
    -- fixed version/variant nibbles while producing a 96-bit suffix.
    NEW.dashboard_slug := slug_base || '-' ||
      substring(replace(gen_random_uuid()::TEXT, '-', ''), 1, 12) ||
      substring(replace(gen_random_uuid()::TEXT, '-', ''), 1, 12);
  END IF;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.generate_client_dashboard_slug() FROM PUBLIC;
DROP TRIGGER IF EXISTS trigger_generate_client_dashboard_slug ON public.clients;
CREATE TRIGGER trigger_generate_client_dashboard_slug
  BEFORE INSERT OR UPDATE OF name, dashboard_slug ON public.clients
  FOR EACH ROW
  EXECUTE FUNCTION public.generate_client_dashboard_slug();

-- Every existing link has already crossed the trust boundary, and a suffix
-- that looks random may still have been deliberately predictable. Rotate all
-- non-null client capabilities during staged cutover; operators must distribute
-- replacement URLs after migration acceptance.
UPDATE public.clients AS client
SET dashboard_slug = COALESCE(
    NULLIF(
      left(
        trim(BOTH '-' FROM lower(regexp_replace(client.dashboard_slug, '[^a-zA-Z0-9]+', '-', 'g'))),
        48
      ),
      ''
    ),
    'client'
  ) || '-' ||
    substring(replace(gen_random_uuid()::TEXT, '-', ''), 1, 12) ||
    substring(replace(gen_random_uuid()::TEXT, '-', ''), 1, 12)
WHERE client.dashboard_slug IS NOT NULL;

-- Reconcile drifted databases where dashboard_slug was added before its
-- historical UNIQUE constraint. Capability URLs must never resolve to more
-- than one client, even when the target schema was prepared out of order.
CREATE UNIQUE INDEX IF NOT EXISTS clients_dashboard_slug_capability_uidx
  ON public.clients (dashboard_slug)
  WHERE dashboard_slug IS NOT NULL;

-- Prospect dashboard slugs are the same kind of bearer capability. Generate
-- them in the database so every creation path receives the same entropy.
CREATE OR REPLACE FUNCTION public.generate_prospect_dashboard_capability_slug()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  IF NEW.slug IS NULL
    OR NEW.slug !~ '^prospect-[0-9a-f]{24}$'
  THEN
    NEW.slug := 'prospect-' ||
      substring(replace(gen_random_uuid()::TEXT, '-', ''), 1, 12) ||
      substring(replace(gen_random_uuid()::TEXT, '-', ''), 1, 12);
  END IF;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.generate_prospect_dashboard_capability_slug()
  FROM PUBLIC;
DROP TRIGGER IF EXISTS prospect_dashboards_generate_capability_slug
  ON public.prospect_dashboards;
CREATE TRIGGER prospect_dashboards_generate_capability_slug
  BEFORE INSERT OR UPDATE OF slug ON public.prospect_dashboards
  FOR EACH ROW
  EXECUTE FUNCTION public.generate_prospect_dashboard_capability_slug();

CREATE TEMP TABLE goap_prospect_slug_rotation
ON COMMIT DROP
AS
SELECT
  dashboard.id,
  dashboard.slug AS old_slug,
  'prospect-' ||
    substring(replace(gen_random_uuid()::TEXT, '-', ''), 1, 12) ||
    substring(replace(gen_random_uuid()::TEXT, '-', ''), 1, 12) AS new_slug
FROM public.prospect_dashboards AS dashboard;

UPDATE public.prospect_dashboards AS dashboard
SET slug = rotation.new_slug
FROM goap_prospect_slug_rotation AS rotation
WHERE dashboard.id = rotation.id;

-- Converted clients retain an internal link to a prospect by slug. Carry that
-- reference through the capability rotation in the same transaction.
UPDATE public.clients AS client
SET prospect_dashboard_slug = rotation.new_slug
FROM goap_prospect_slug_rotation AS rotation
WHERE client.prospect_dashboard_slug = rotation.old_slug;

-- Browser roles can manage ordinary fields on their own client rows, but must
-- not move a client between workspaces or write credential/server metadata.
-- Check auth.role(), which remains the signed request role even inside a
-- SECURITY DEFINER call; do not trust current_user for this boundary.
CREATE OR REPLACE FUNCTION public.guard_client_internal_fields()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  IF auth.role() IN ('anon', 'authenticated') THEN
    IF public.is_platform_admin() THEN
      RETURN NEW;
    END IF;

    IF TG_OP = 'INSERT' THEN
      IF COALESCE(NEW.portal_access_enabled, false)
        OR COALESCE(NEW.dashboard_enabled, false)
        OR COALESCE(NEW.dashboard_view_count, 0) <> 0
        OR jsonb_strip_nulls(
          to_jsonb(NEW) - ARRAY[
            'id',
            'workspace_id',
            'name',
            'email',
            'portal_email_normalized',
            'dashboard_slug',
            'contact_person',
            'linkedin_url',
            'website',
            'status',
            'notes',
            'created_at',
            'updated_at',
            'portal_access_enabled',
            'dashboard_enabled',
            'dashboard_view_count'
          ]::TEXT[]
        ) <> '{}'::JSONB
      THEN
        RAISE EXCEPTION 'only workspace client fields may be inserted'
          USING ERRCODE = '42501';
      END IF;
    ELSIF (
      to_jsonb(NEW) - ARRAY[
        'name',
        'email',
        'portal_email_normalized',
        'contact_person',
        'linkedin_url',
        'website',
        'status',
        'notes',
        'updated_at'
      ]::TEXT[]
    ) IS DISTINCT FROM (
      to_jsonb(OLD) - ARRAY[
        'name',
        'email',
        'portal_email_normalized',
        'contact_person',
        'linkedin_url',
        'website',
        'status',
        'notes',
        'updated_at'
      ]::TEXT[]
    )
    THEN
      RAISE EXCEPTION 'only workspace client fields may be updated'
        USING ERRCODE = '42501';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.guard_client_internal_fields() FROM PUBLIC;
DROP TRIGGER IF EXISTS clients_guard_internal_fields ON public.clients;
CREATE TRIGGER clients_guard_internal_fields
  AFTER INSERT OR UPDATE ON public.clients
  FOR EACH ROW
  EXECUTE FUNCTION public.guard_client_internal_fields();

-- Disabling access or changing its login identity is a credential boundary.
-- Delete both active sessions and outstanding magic links while this UPDATE
-- holds the same client-row lock used by password-session issuance.
CREATE OR REPLACE FUNCTION public.revoke_client_portal_access_artifacts()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF lower(btrim(COALESCE(OLD.email, '')))
    IS DISTINCT FROM lower(btrim(COALESCE(NEW.email, '')))
  THEN
    -- A portal email change is an identity reassignment. Never carry the old
    -- person's password verifier onto the new login identity.
    DELETE FROM public.client_portal_credentials
    WHERE client_id = OLD.id;

    NEW.portal_access_enabled := false;
    NEW.portal_password := NULL;
    NEW.password_set_at := NULL;
    NEW.password_set_by := NULL;

    DELETE FROM public.client_portal_sessions
    WHERE client_id = OLD.id;

    DELETE FROM public.client_portal_tokens
    WHERE client_id = OLD.id;
  ELSIF COALESCE(OLD.portal_access_enabled, false)
    AND NOT COALESCE(NEW.portal_access_enabled, false)
  THEN
    DELETE FROM public.client_portal_sessions
    WHERE client_id = OLD.id;

    DELETE FROM public.client_portal_tokens
    WHERE client_id = OLD.id;
  END IF;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.revoke_client_portal_access_artifacts()
  FROM PUBLIC;
DROP TRIGGER IF EXISTS clients_revoke_portal_access_artifacts
  ON public.clients;
DROP TRIGGER IF EXISTS clients_revoke_portal_sessions_on_disable
  ON public.clients;
DROP FUNCTION IF EXISTS public.revoke_client_portal_sessions_on_disable();
CREATE TRIGGER clients_revoke_portal_access_artifacts
  BEFORE UPDATE OF portal_access_enabled, email ON public.clients
  FOR EACH ROW
  EXECUTE FUNCTION public.revoke_client_portal_access_artifacts();

-- Finish password-based portal setup for a newly inserted client in one
-- transaction. The create endpoint initially leaves access disabled, so an
-- RPC failure cannot leave a half-configured account reachable.
CREATE OR REPLACE FUNCTION public.initialize_client_portal_password(
  p_client_id UUID,
  p_password_hash TEXT,
  p_set_by TEXT,
  p_actor_user_id UUID
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  target_workspace_id UUID;
  normalized_set_by TEXT := NULLIF(btrim(p_set_by), '');
BEGIN
  IF p_client_id IS NULL OR p_password_hash IS NULL THEN
    RAISE EXCEPTION 'client_id and password verifier are required'
      USING ERRCODE = '22023';
  END IF;

  IF char_length(p_password_hash) > 512
    OR p_password_hash !~ '^pbkdf2_sha256\$[0-9]{6,7}\$[^$]{16,128}\$[^$]{32,256}$'
  THEN
    RAISE EXCEPTION 'invalid portal password verifier'
      USING ERRCODE = '22023';
  END IF;

  IF split_part(p_password_hash, '$', 2)::BIGINT NOT BETWEEN 100000 AND 1000000 THEN
    RAISE EXCEPTION 'invalid portal password verifier work factor'
      USING ERRCODE = '22023';
  END IF;

  IF p_actor_user_id IS NOT NULL AND NOT EXISTS (
    SELECT 1
    FROM auth.users AS auth_user
    JOIN public.admin_users AS admin_user
      ON lower(btrim(admin_user.email)) = lower(btrim(auth_user.email))
    WHERE auth_user.id = p_actor_user_id
      AND NULLIF(btrim(auth_user.email), '') IS NOT NULL
  ) THEN
    RAISE EXCEPTION 'platform administrator access is required'
      USING ERRCODE = '42501';
  END IF;

  SELECT client.workspace_id
  INTO target_workspace_id
  FROM public.clients AS client
  WHERE client.id = p_client_id
    AND NOT COALESCE(client.portal_access_enabled, false)
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'disabled client not found'
      USING ERRCODE = 'P0002';
  END IF;

  INSERT INTO public.client_portal_credentials (
    client_id,
    password_verifier,
    configured_at,
    configured_by,
    updated_at
  )
  VALUES (
    p_client_id,
    p_password_hash,
    now(),
    normalized_set_by,
    now()
  );

  UPDATE public.clients
  SET
    portal_password = NULL,
    password_set_at = now(),
    password_set_by = normalized_set_by,
    portal_access_enabled = true
  WHERE id = p_client_id;

  DELETE FROM public.client_portal_sessions
  WHERE client_id = p_client_id;

  DELETE FROM public.client_portal_tokens
  WHERE client_id = p_client_id;

  INSERT INTO public.workspace_audit_log (
    workspace_id,
    actor_user_id,
    action,
    entity_type,
    entity_id,
    metadata
  )
  VALUES (
    target_workspace_id,
    p_actor_user_id,
    'client.portal_password.initialized',
    'client',
    p_client_id,
    jsonb_build_object('configured', true, 'set_by', normalized_set_by)
  );

  RETURN true;
END;
$$;

-- Change the private verifier, revoke every existing portal session, and
-- append the administrative audit event under the same client-row lock.
CREATE OR REPLACE FUNCTION public.manage_client_portal_password(
  p_client_id UUID,
  p_password_hash TEXT,
  p_set_by TEXT,
  p_actor_user_id UUID
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  target_workspace_id UUID;
  configured BOOLEAN := p_password_hash IS NOT NULL;
  normalized_set_by TEXT := NULLIF(btrim(p_set_by), '');
BEGIN
  IF p_client_id IS NULL OR p_actor_user_id IS NULL THEN
    RAISE EXCEPTION 'client_id and actor_user_id are required'
      USING ERRCODE = '22023';
  END IF;

  IF configured THEN
    IF char_length(p_password_hash) > 512
      OR p_password_hash !~ '^pbkdf2_sha256\$[0-9]{6,7}\$[^$]{16,128}\$[^$]{32,256}$'
    THEN
      RAISE EXCEPTION 'invalid portal password verifier'
        USING ERRCODE = '22023';
    END IF;

    IF split_part(p_password_hash, '$', 2)::BIGINT NOT BETWEEN 100000 AND 1000000 THEN
      RAISE EXCEPTION 'invalid portal password verifier work factor'
        USING ERRCODE = '22023';
    END IF;
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM auth.users AS auth_user
    JOIN public.admin_users AS admin_user
      ON lower(btrim(admin_user.email)) = lower(btrim(auth_user.email))
    WHERE auth_user.id = p_actor_user_id
      AND NULLIF(btrim(auth_user.email), '') IS NOT NULL
  ) THEN
    RAISE EXCEPTION 'platform administrator access is required'
      USING ERRCODE = '42501';
  END IF;

  SELECT client.workspace_id
  INTO target_workspace_id
  FROM public.clients AS client
  WHERE client.id = p_client_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'client not found'
      USING ERRCODE = 'P0002';
  END IF;

  IF configured THEN
    INSERT INTO public.client_portal_credentials (
      client_id,
      password_verifier,
      configured_at,
      configured_by,
      updated_at
    )
    VALUES (
      p_client_id,
      p_password_hash,
      now(),
      normalized_set_by,
      now()
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
    portal_password = NULL,
    password_set_at = CASE WHEN configured THEN now() ELSE NULL END,
    password_set_by = CASE WHEN configured THEN normalized_set_by ELSE NULL END
  WHERE id = p_client_id;

  DELETE FROM public.client_portal_sessions
  WHERE client_id = p_client_id;

  DELETE FROM public.client_portal_tokens
  WHERE client_id = p_client_id;

  INSERT INTO public.workspace_audit_log (
    workspace_id,
    actor_user_id,
    action,
    entity_type,
    entity_id,
    metadata
  )
  VALUES (
    target_workspace_id,
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

-- Serialize successful login issuance with password reset. Login locks the
-- active workspace before the client; reset locks the same client before
-- credentials/sessions. If login commits first, reset deletes that session;
-- if reset commits first, the exact expected-verifier check returns NULL.
DROP FUNCTION IF EXISTS public.issue_client_portal_password_session(
  UUID, TEXT, TEXT, TEXT, TIMESTAMPTZ, TEXT, TEXT
);
CREATE OR REPLACE FUNCTION public.issue_client_portal_password_session(
  p_client_id UUID,
  p_expected_email_normalized TEXT,
  p_expected_password_verifier TEXT,
  p_upgraded_password_verifier TEXT,
  p_session_token_hash TEXT,
  p_expires_at TIMESTAMPTZ,
  p_ip_address TEXT,
  p_user_agent TEXT
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  client_email TEXT;
  target_workspace_id UUID;
  stored_password_verifier TEXT;
  new_session_id UUID;
BEGIN
  IF p_client_id IS NULL
    OR p_expected_email_normalized IS NULL
    OR char_length(p_expected_email_normalized) NOT BETWEEN 3 AND 254
    OR p_expected_email_normalized IS DISTINCT FROM lower(btrim(p_expected_email_normalized))
    OR p_expected_password_verifier IS NULL
    OR char_length(p_expected_password_verifier) NOT BETWEEN 1 AND 512
    OR p_session_token_hash IS NULL
    OR p_session_token_hash !~ '^sha256\$[A-Za-z0-9+/]{43}=$'
    OR p_expires_at IS NULL
    OR p_expires_at <= now()
    OR p_expires_at > now() + interval '25 hours'
    OR char_length(COALESCE(p_ip_address, '')) > 120
    OR char_length(COALESCE(p_user_agent, '')) > 1024
  THEN
    RAISE EXCEPTION 'invalid portal session parameters'
      USING ERRCODE = '22023';
  END IF;

  IF p_upgraded_password_verifier IS NOT NULL THEN
    IF char_length(p_upgraded_password_verifier) > 512
      OR p_upgraded_password_verifier !~ '^pbkdf2_sha256\$[0-9]{6,7}\$[^$]{16,128}\$[^$]{32,256}$'
    THEN
      RAISE EXCEPTION 'invalid upgraded portal password verifier'
        USING ERRCODE = '22023';
    END IF;

    IF split_part(p_upgraded_password_verifier, '$', 2)::BIGINT
      NOT BETWEEN 100000 AND 1000000
    THEN
      RAISE EXCEPTION 'invalid upgraded portal password verifier work factor'
        USING ERRCODE = '22023';
    END IF;
  END IF;

  -- Resolve without a row lock, then acquire workspace -> client -> credential
  -- deterministically. The final client query rechecks the resolved workspace
  -- and all login predicates after the workspace status lock is held.
  SELECT client.workspace_id
  INTO target_workspace_id
  FROM public.clients AS client
  WHERE client.id = p_client_id;

  IF NOT FOUND THEN
    RETURN NULL;
  END IF;

  PERFORM 1
  FROM public.workspaces AS workspace
  WHERE workspace.id = target_workspace_id
    AND workspace.status = 'active'
  FOR SHARE;

  IF NOT FOUND THEN
    RETURN NULL;
  END IF;

  SELECT client.email
  INTO client_email
  FROM public.clients AS client
  WHERE client.id = p_client_id
    AND client.workspace_id = target_workspace_id
    AND client.portal_access_enabled
    AND client.portal_email_normalized = p_expected_email_normalized
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN NULL;
  END IF;

  SELECT credential.password_verifier
  INTO stored_password_verifier
  FROM public.client_portal_credentials AS credential
  WHERE credential.client_id = p_client_id
  FOR UPDATE;

  IF NOT FOUND
    OR stored_password_verifier IS DISTINCT FROM p_expected_password_verifier
  THEN
    RETURN NULL;
  END IF;

  IF p_upgraded_password_verifier IS NOT NULL THEN
    UPDATE public.client_portal_credentials
    SET
      password_verifier = p_upgraded_password_verifier,
      credential_version = credential_version + 1,
      configured_at = now(),
      configured_by = 'security_upgrade',
      updated_at = now()
    WHERE client_id = p_client_id;

    UPDATE public.clients
    SET
      portal_password = NULL,
      password_set_at = now(),
      password_set_by = 'security_upgrade'
    WHERE id = p_client_id;
  END IF;

  INSERT INTO public.client_portal_sessions (
    client_id,
    session_token,
    expires_at,
    ip_address,
    user_agent
  )
  VALUES (
    p_client_id,
    p_session_token_hash,
    p_expires_at,
    NULLIF(p_ip_address, ''),
    NULLIF(p_user_agent, '')
  )
  RETURNING id INTO new_session_id;

  UPDATE public.clients
  SET portal_last_login_at = now()
  WHERE id = p_client_id;

  INSERT INTO public.client_portal_activity_log (
    client_id,
    session_id,
    action,
    metadata,
    ip_address,
    user_agent
  )
  VALUES (
    p_client_id,
    new_session_id,
    'password_login_success',
    jsonb_build_object('email', client_email, 'ip', p_ip_address),
    NULLIF(p_ip_address, ''),
    NULLIF(p_user_agent, '')
  );

  RETURN new_session_id;
END;
$$;

-- Atomically invalidate a portal bearer token and retain a logout audit row.
-- A database error must never be reported as a successful server logout.
DROP FUNCTION IF EXISTS public.logout_client_portal_session(TEXT, TEXT);
CREATE OR REPLACE FUNCTION public.logout_client_portal_session(
  p_session_token_hash TEXT
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  target_client_id UUID;
  target_session_id UUID;
BEGIN
  IF p_session_token_hash IS NULL
    OR p_session_token_hash !~ '^sha256\$[A-Za-z0-9+/]{43}=$'
  THEN
    RAISE EXCEPTION 'invalid portal session token'
      USING ERRCODE = '22023';
  END IF;

  -- Resolve the parent without locking the session, then use the same
  -- client -> session lock order as password reset and portal disable flows.
  -- This avoids a session -> client / client -> session deadlock.
  SELECT session.client_id
  INTO target_client_id
  FROM public.client_portal_sessions AS session
  WHERE session.session_token = p_session_token_hash
  LIMIT 1;

  IF NOT FOUND THEN
    RETURN false;
  END IF;

  PERFORM 1
  FROM public.clients AS client
  WHERE client.id = target_client_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN false;
  END IF;

  SELECT session.id
  INTO target_session_id
  FROM public.client_portal_sessions AS session
  WHERE session.session_token = p_session_token_hash
    AND session.client_id = target_client_id
  LIMIT 1
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN false;
  END IF;

  INSERT INTO public.client_portal_activity_log (
    client_id,
    session_id,
    action,
    metadata
  )
  VALUES (
    target_client_id,
    target_session_id,
    'logout',
    '{}'::JSONB
  );

  DELETE FROM public.client_portal_sessions
  WHERE id = target_session_id;

  RETURN true;
END;
$$;

REVOKE ALL ON FUNCTION public.manage_client_portal_password(UUID, TEXT, TEXT, UUID)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.manage_client_portal_password(UUID, TEXT, TEXT, UUID)
  TO service_role;

REVOKE ALL ON FUNCTION public.initialize_client_portal_password(UUID, TEXT, TEXT, UUID)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.initialize_client_portal_password(UUID, TEXT, TEXT, UUID)
  TO service_role;

REVOKE ALL ON FUNCTION public.issue_client_portal_password_session(
  UUID, TEXT, TEXT, TEXT, TEXT, TIMESTAMPTZ, TEXT, TEXT
) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.issue_client_portal_password_session(
  UUID, TEXT, TEXT, TEXT, TEXT, TIMESTAMPTZ, TEXT, TEXT
) TO service_role;

REVOKE ALL ON FUNCTION public.logout_client_portal_session(TEXT)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.logout_client_portal_session(TEXT)
  TO service_role;

REVOKE ALL ON FUNCTION public.reserve_client_portal_login_attempt(TEXT, TEXT, TEXT)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.reserve_client_portal_login_attempt(TEXT, TEXT, TEXT)
  TO service_role;

COMMENT ON FUNCTION public.manage_client_portal_password(UUID, TEXT, TEXT, UUID) IS
  'Service-role-only atomic portal-password change, session revocation, and workspace audit event.';
COMMENT ON FUNCTION public.initialize_client_portal_password(UUID, TEXT, TEXT, UUID) IS
  'Service-role-only atomic initial client portal credential setup and access enablement.';
COMMENT ON FUNCTION public.issue_client_portal_password_session(
  UUID, TEXT, TEXT, TEXT, TEXT, TIMESTAMPTZ, TEXT, TEXT
) IS
  'Service-role-only identity-and-credential compare-and-create portal login transaction serialized with account changes.';
COMMENT ON FUNCTION public.logout_client_portal_session(TEXT) IS
  'Service-role-only atomic portal session invalidation with retained audit event.';
COMMENT ON FUNCTION public.reserve_client_portal_login_attempt(TEXT, TEXT, TEXT) IS
  'Service-role-only atomic password-login attempt reservation and rate-limit check.';

COMMIT;
