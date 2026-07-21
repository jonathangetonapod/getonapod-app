-- Tenant RLS cutover for the invite-only MVP.
-- Anonymous content reads remain available where intentional, while client and
-- prospect dashboard capabilities move behind slug-validating Edge Functions.
-- Existing authenticated policies remain in place but are constrained by
-- RESTRICTIVE gates so broad legacy checks cannot bypass the workspace boundary.

BEGIN;

SELECT pg_advisory_xact_lock(hashtextextended('goap:invite-only-workspace-rls:v1', 0));

ALTER TABLE public.workspaces ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.workspace_memberships ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.workspace_audit_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.clients ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bookings ENABLE ROW LEVEL SECURITY;

-- New workspace tables are read directly by authenticated users. All writes are
-- performed by authenticated server endpoints using the service role so audit
-- records and lifecycle invariants remain transactional.
REVOKE ALL PRIVILEGES ON TABLE public.workspaces FROM anon, authenticated;
REVOKE ALL PRIVILEGES ON TABLE public.workspace_memberships FROM anon, authenticated;
REVOKE ALL PRIVILEGES ON TABLE public.workspace_audit_log FROM anon, authenticated;

GRANT SELECT ON TABLE public.workspaces TO authenticated;
GRANT SELECT ON TABLE public.workspace_memberships TO authenticated;
GRANT SELECT ON TABLE public.workspace_audit_log TO authenticated;

GRANT ALL PRIVILEGES ON TABLE public.workspaces TO service_role;
GRANT ALL PRIVILEGES ON TABLE public.workspace_memberships TO service_role;
REVOKE ALL PRIVILEGES ON TABLE public.workspace_audit_log FROM service_role;
GRANT SELECT, INSERT ON TABLE public.workspace_audit_log TO service_role;

DROP POLICY IF EXISTS workspaces_authenticated_select ON public.workspaces;
CREATE POLICY workspaces_authenticated_select
  ON public.workspaces
  AS PERMISSIVE
  FOR SELECT
  TO authenticated
  USING (
    public.is_platform_admin()
    OR public.can_access_workspace(id)
  );

DROP POLICY IF EXISTS workspaces_authenticated_select_isolation
  ON public.workspaces;
CREATE POLICY workspaces_authenticated_select_isolation
  ON public.workspaces
  AS RESTRICTIVE
  FOR SELECT
  TO authenticated
  USING (
    public.is_platform_admin()
    OR public.can_access_workspace(id)
  );

DROP POLICY IF EXISTS workspace_memberships_authenticated_select
  ON public.workspace_memberships;
CREATE POLICY workspace_memberships_authenticated_select
  ON public.workspace_memberships
  AS PERMISSIVE
  FOR SELECT
  TO authenticated
  USING (
    public.is_platform_admin()
    OR user_id = auth.uid()
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
    OR user_id = auth.uid()
  );

DROP POLICY IF EXISTS workspace_audit_log_authenticated_select
  ON public.workspace_audit_log;
CREATE POLICY workspace_audit_log_authenticated_select
  ON public.workspace_audit_log
  AS PERMISSIVE
  FOR SELECT
  TO authenticated
  USING (public.is_platform_admin());

DROP POLICY IF EXISTS workspace_audit_log_authenticated_select_isolation
  ON public.workspace_audit_log;
CREATE POLICY workspace_audit_log_authenticated_select_isolation
  ON public.workspace_audit_log
  AS RESTRICTIVE
  FOR SELECT
  TO authenticated
  USING (public.is_platform_admin());

-- The clients base table previously exposed every row with a dashboard slug to
-- anon. Public dashboards must use a narrow server endpoint/view instead of
-- selecting sensitive client columns directly.
DROP POLICY IF EXISTS "Allow anonymous read by dashboard_slug" ON public.clients;
DROP POLICY IF EXISTS "Clients can view own profile" ON public.clients;
REVOKE ALL PRIVILEGES ON TABLE public.clients FROM anon;

-- The legacy portal used a request-local GUC in an anonymous bookings policy.
-- Portal reads now use a hashed server-validated session endpoint instead.
DROP POLICY IF EXISTS "Clients can view own bookings" ON public.bookings;
REVOKE ALL PRIVILEGES ON TABLE public.bookings FROM anon;

-- Public approval dashboards now go through a slug-validated Edge Function.
-- Direct anonymous table access allowed enumeration and arbitrary feedback
-- writes when a client UUID was guessed or leaked.
DROP POLICY IF EXISTS "Public read access for client_dashboard_podcasts"
  ON public.client_dashboard_podcasts;
DROP POLICY IF EXISTS "Public read access for client_podcast_feedback"
  ON public.client_podcast_feedback;
DROP POLICY IF EXISTS "Public insert access for client_podcast_feedback"
  ON public.client_podcast_feedback;
DROP POLICY IF EXISTS "Public update access for client_podcast_feedback"
  ON public.client_podcast_feedback;
DROP POLICY IF EXISTS "Public delete access for client_podcast_feedback"
  ON public.client_podcast_feedback;
REVOKE ALL PRIVILEGES ON TABLE public.client_dashboard_podcasts FROM anon;
REVOKE ALL PRIVILEGES ON TABLE public.client_podcast_feedback FROM anon;

-- Prospect dashboards follow the same capability pattern: public callers send
-- an active dashboard slug to a narrow Edge Function. They never enumerate or
-- mutate the backing tables directly.
DROP POLICY IF EXISTS "Public can view active prospect dashboards"
  ON public.prospect_dashboards;
DROP POLICY IF EXISTS "Public read access for prospect_dashboard_podcasts"
  ON public.prospect_dashboard_podcasts;
DROP POLICY IF EXISTS "Anyone can read prospect podcast feedback"
  ON public.prospect_podcast_feedback;
DROP POLICY IF EXISTS "Anyone can insert prospect podcast feedback"
  ON public.prospect_podcast_feedback;
DROP POLICY IF EXISTS "Anyone can update prospect podcast feedback"
  ON public.prospect_podcast_feedback;

REVOKE ALL PRIVILEGES ON TABLE public.prospect_dashboards FROM anon;
REVOKE ALL PRIVILEGES ON TABLE public.prospect_dashboard_podcasts FROM anon;
REVOKE ALL PRIVILEGES ON TABLE public.prospect_podcast_feedback FROM anon;

DROP POLICY IF EXISTS "Public can read prospect podcast analyses"
  ON public.prospect_podcast_analyses;
REVOKE ALL PRIVILEGES ON TABLE public.prospect_podcast_analyses FROM anon;

-- Public onboarding is disabled in the invite-only MVP. The old table policies
-- allowed anyone who guessed a browser-generated session ID to overwrite PII.
DROP POLICY IF EXISTS "Allow anonymous insert" ON public.onboarding_sessions;
DROP POLICY IF EXISTS "Allow anonymous update" ON public.onboarding_sessions;
REVOKE ALL PRIVILEGES ON TABLE public.onboarding_sessions FROM anon;

-- Close legacy SECURITY DEFINER RPCs that were executable by ordinary API
-- roles. They bypass RLS and are only needed by trusted server processes.
DO $$
DECLARE
  function_signature TEXT;
BEGIN
  FOREACH function_signature IN ARRAY ARRAY[
    'public.cleanup_expired_portal_data()',
    'public.get_client_portal_stats()',
    'public.is_email_suppressed(text)',
    'public.record_email_bounce(text,text,boolean)'
  ]
  LOOP
    IF to_regprocedure(function_signature) IS NOT NULL THEN
      EXECUTE format(
        'REVOKE ALL ON FUNCTION %s FROM PUBLIC, anon, authenticated',
        function_signature
      );
      EXECUTE format(
        'GRANT EXECUTE ON FUNCTION %s TO service_role',
        function_signature
      );
    END IF;
  END LOOP;
END;
$$;

-- The clients row contains legacy operator-only integration and portal fields.
-- Keep direct base-table access platform-admin-only; tenant CRUD goes through
-- workspace-clients, whose transactional RPC returns a narrow projection.
-- Matching restrictive policies AND-gate any legacy permissive USING (true)
-- policy already present on the table.
DROP POLICY IF EXISTS clients_workspace_access ON public.clients;
DROP POLICY IF EXISTS clients_workspace_isolation ON public.clients;

DROP POLICY IF EXISTS clients_workspace_select ON public.clients;
CREATE POLICY clients_workspace_select
  ON public.clients
  AS PERMISSIVE
  FOR SELECT
  TO authenticated
  USING (public.is_platform_admin());

DROP POLICY IF EXISTS clients_workspace_select_isolation ON public.clients;
CREATE POLICY clients_workspace_select_isolation
  ON public.clients
  AS RESTRICTIVE
  FOR SELECT
  TO authenticated
  USING (public.is_platform_admin());

DROP POLICY IF EXISTS clients_workspace_insert ON public.clients;
CREATE POLICY clients_workspace_insert
  ON public.clients
  AS PERMISSIVE
  FOR INSERT
  TO authenticated
  WITH CHECK (public.is_platform_admin());

DROP POLICY IF EXISTS clients_workspace_insert_isolation ON public.clients;
CREATE POLICY clients_workspace_insert_isolation
  ON public.clients
  AS RESTRICTIVE
  FOR INSERT
  TO authenticated
  WITH CHECK (public.is_platform_admin());

DROP POLICY IF EXISTS clients_workspace_update ON public.clients;
CREATE POLICY clients_workspace_update
  ON public.clients
  AS PERMISSIVE
  FOR UPDATE
  TO authenticated
  USING (public.is_platform_admin())
  WITH CHECK (public.is_platform_admin());

DROP POLICY IF EXISTS clients_workspace_update_isolation ON public.clients;
CREATE POLICY clients_workspace_update_isolation
  ON public.clients
  AS RESTRICTIVE
  FOR UPDATE
  TO authenticated
  USING (public.is_platform_admin())
  WITH CHECK (public.is_platform_admin());

DROP POLICY IF EXISTS clients_workspace_delete ON public.clients;
CREATE POLICY clients_workspace_delete
  ON public.clients
  AS PERMISSIVE
  FOR DELETE
  TO authenticated
  USING (public.is_platform_admin());

DROP POLICY IF EXISTS clients_workspace_delete_isolation ON public.clients;
CREATE POLICY clients_workspace_delete_isolation
  ON public.clients
  AS RESTRICTIVE
  FOR DELETE
  TO authenticated
  USING (public.is_platform_admin());

DROP POLICY IF EXISTS bookings_workspace_access ON public.bookings;
DROP POLICY IF EXISTS bookings_workspace_isolation ON public.bookings;

DROP POLICY IF EXISTS bookings_workspace_select ON public.bookings;
CREATE POLICY bookings_workspace_select
  ON public.bookings
  AS PERMISSIVE
  FOR SELECT
  TO authenticated
  USING (public.is_platform_admin());

DROP POLICY IF EXISTS bookings_workspace_select_isolation ON public.bookings;
CREATE POLICY bookings_workspace_select_isolation
  ON public.bookings
  AS RESTRICTIVE
  FOR SELECT
  TO authenticated
  USING (public.is_platform_admin());

DROP POLICY IF EXISTS bookings_workspace_insert ON public.bookings;
CREATE POLICY bookings_workspace_insert
  ON public.bookings
  AS PERMISSIVE
  FOR INSERT
  TO authenticated
  WITH CHECK (public.is_platform_admin());

DROP POLICY IF EXISTS bookings_workspace_insert_isolation ON public.bookings;
CREATE POLICY bookings_workspace_insert_isolation
  ON public.bookings
  AS RESTRICTIVE
  FOR INSERT
  TO authenticated
  WITH CHECK (public.is_platform_admin());

DROP POLICY IF EXISTS bookings_workspace_update ON public.bookings;
CREATE POLICY bookings_workspace_update
  ON public.bookings
  AS PERMISSIVE
  FOR UPDATE
  TO authenticated
  USING (public.is_platform_admin())
  WITH CHECK (public.is_platform_admin());

DROP POLICY IF EXISTS bookings_workspace_update_isolation ON public.bookings;
CREATE POLICY bookings_workspace_update_isolation
  ON public.bookings
  AS RESTRICTIVE
  FOR UPDATE
  TO authenticated
  USING (public.is_platform_admin())
  WITH CHECK (public.is_platform_admin());

DROP POLICY IF EXISTS bookings_workspace_delete ON public.bookings;
CREATE POLICY bookings_workspace_delete
  ON public.bookings
  AS PERMISSIVE
  FOR DELETE
  TO authenticated
  USING (public.is_platform_admin());

DROP POLICY IF EXISTS bookings_workspace_delete_isolation ON public.bookings;
CREATE POLICY bookings_workspace_delete_isolation
  ON public.bookings
  AS RESTRICTIVE
  FOR DELETE
  TO authenticated
  USING (public.is_platform_admin());

-- Tenant client CRUD is deliberately narrower than the legacy clients table.
-- This service-role-only RPC rechecks the actor's live membership while
-- locking it, mutates only the MVP fields, and writes the audit event in the
-- same transaction. The Edge endpoint is the only browser-facing caller.
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
  authorized_membership_id UUID;
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

  SELECT membership.id
  INTO authorized_membership_id
  FROM public.workspace_memberships AS membership
  JOIN auth.users AS auth_user
    ON auth_user.id = membership.user_id
    AND lower(btrim(auth_user.email)) = membership.email_normalized
  WHERE membership.workspace_id = p_workspace_id
    AND membership.user_id = p_actor_user_id
    AND membership.status = 'active'
    AND membership.role IN ('owner', 'admin')
  FOR SHARE;

  IF authorized_membership_id IS NULL THEN
    RAISE EXCEPTION 'active workspace manager access is required'
      USING ERRCODE = '42501';
  END IF;

  -- Lock in membership -> workspace -> client order so account transitions,
  -- tenant client mutations, and portal login cannot invert row locks.
  PERFORM 1
  FROM public.workspaces AS workspace
  WHERE workspace.id = p_workspace_id
    AND workspace.status = 'active'
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
    'workspace.client.deleted',
    'client',
    p_client_id,
    jsonb_build_object('name', target_client.name)
  );

  RETURN to_jsonb(target_client);
END;
$$;

REVOKE ALL ON FUNCTION public.workspace_client_operation(
  TEXT, UUID, UUID, JSONB, UUID
) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.workspace_client_operation(
  TEXT, UUID, UUID, JSONB, UUID
) TO service_role;

COMMENT ON FUNCTION public.workspace_client_operation(
  TEXT, UUID, UUID, JSONB, UUID
) IS
  'Service-role-only, membership-checked, audited tenant client CRUD with a narrow return projection.';

-- Transitional containment: every other existing public table is enabled for
-- RLS. Authenticated tenants are limited to deliberately public content reads;
-- every other read and every browser write requires a platform administrator.
-- The service role bypasses RLS. As modules receive a tenant model, replace
-- these gates with explicit workspace-aware policies.
DO $$
DECLARE
  secured_table RECORD;
  public_read_expression TEXT;
BEGIN
  FOR secured_table IN
    SELECT
      namespace.nspname AS schema_name,
      relation.relname AS table_name
    FROM pg_class AS relation
    JOIN pg_namespace AS namespace
      ON namespace.oid = relation.relnamespace
    WHERE namespace.nspname = 'public'
      AND relation.relkind IN ('r', 'p')
      AND relation.relname NOT IN (
        'workspaces',
        'workspace_memberships',
        'workspace_audit_log',
        'workspace_auth_lifecycle_claims',
        'clients',
        'bookings'
      )
      AND NOT EXISTS (
        SELECT 1
        FROM pg_depend AS dependency
        WHERE dependency.classid = 'pg_class'::regclass
          AND dependency.objid = relation.oid
          AND dependency.deptype = 'e'
      )
    ORDER BY relation.relname
  LOOP
    EXECUTE format(
      'ALTER TABLE %I.%I ENABLE ROW LEVEL SECURITY',
      secured_table.schema_name,
      secured_table.table_name
    );

    EXECUTE format(
      'DROP POLICY IF EXISTS workspace_transition_platform_admin_allow ON %I.%I',
      secured_table.schema_name,
      secured_table.table_name
    );

    EXECUTE format(
      'DROP POLICY IF EXISTS workspace_transition_platform_admin_gate ON %I.%I',
      secured_table.schema_name,
      secured_table.table_name
    );

    EXECUTE format(
      'DROP POLICY IF EXISTS workspace_transition_public_read_allow ON %I.%I',
      secured_table.schema_name,
      secured_table.table_name
    );

    EXECUTE format(
      'DROP POLICY IF EXISTS workspace_transition_platform_admin_select_gate ON %I.%I',
      secured_table.schema_name,
      secured_table.table_name
    );

    EXECUTE format(
      'DROP POLICY IF EXISTS workspace_transition_platform_admin_insert_gate ON %I.%I',
      secured_table.schema_name,
      secured_table.table_name
    );

    EXECUTE format(
      'DROP POLICY IF EXISTS workspace_transition_platform_admin_update_gate ON %I.%I',
      secured_table.schema_name,
      secured_table.table_name
    );

    EXECUTE format(
      'DROP POLICY IF EXISTS workspace_transition_platform_admin_delete_gate ON %I.%I',
      secured_table.schema_name,
      secured_table.table_name
    );

    EXECUTE format(
      'CREATE POLICY workspace_transition_platform_admin_allow '
      'ON %I.%I AS PERMISSIVE FOR ALL TO authenticated '
      'USING (public.is_platform_admin()) '
      'WITH CHECK (public.is_platform_admin())',
      secured_table.schema_name,
      secured_table.table_name
    );

    public_read_expression := CASE secured_table.table_name
      WHEN 'blog_categories' THEN 'true'
      WHEN 'blog_posts' THEN 'status = ''published'''
      WHEN 'guest_resources' THEN 'true'
      WHEN 'testimonials' THEN 'is_active = true'
      ELSE NULL
    END;

    IF public_read_expression IS NOT NULL THEN
      EXECUTE format(
        'GRANT SELECT ON TABLE %I.%I TO anon, authenticated',
        secured_table.schema_name,
        secured_table.table_name
      );

      EXECUTE format(
        'CREATE POLICY workspace_transition_public_read_allow '
        'ON %I.%I AS PERMISSIVE FOR SELECT TO anon, authenticated '
        'USING (%s)',
        secured_table.schema_name,
        secured_table.table_name,
        public_read_expression
      );
    ELSE
      EXECUTE format(
        'REVOKE ALL PRIVILEGES ON TABLE %I.%I FROM anon',
        secured_table.schema_name,
        secured_table.table_name
      );
    END IF;

    EXECUTE format(
      'CREATE POLICY workspace_transition_platform_admin_select_gate '
      'ON %I.%I AS RESTRICTIVE FOR SELECT TO anon, authenticated '
      'USING (public.is_platform_admin()%s)',
      secured_table.schema_name,
      secured_table.table_name,
      CASE
        WHEN public_read_expression IS NULL THEN ''
        ELSE format(' OR (%s)', public_read_expression)
      END
    );

    EXECUTE format(
      'CREATE POLICY workspace_transition_platform_admin_insert_gate '
      'ON %I.%I AS RESTRICTIVE FOR INSERT TO anon, authenticated '
      'WITH CHECK (public.is_platform_admin())',
      secured_table.schema_name,
      secured_table.table_name
    );

    EXECUTE format(
      'CREATE POLICY workspace_transition_platform_admin_update_gate '
      'ON %I.%I AS RESTRICTIVE FOR UPDATE TO anon, authenticated '
      'USING (public.is_platform_admin()) '
      'WITH CHECK (public.is_platform_admin())',
      secured_table.schema_name,
      secured_table.table_name
    );

    EXECUTE format(
      'CREATE POLICY workspace_transition_platform_admin_delete_gate '
      'ON %I.%I AS RESTRICTIVE FOR DELETE TO anon, authenticated '
      'USING (public.is_platform_admin())',
      secured_table.schema_name,
      secured_table.table_name
    );
  END LOOP;
END;
$$;

-- Tenant users do not receive Storage write access in this MVP. Keep existing
-- public-read policies (for published images) while AND-gating anonymous and
-- authenticated uploads, updates, and deletes to platform administrators.
DO $$
BEGIN
  IF to_regclass('storage.objects') IS NOT NULL THEN
    EXECUTE 'ALTER TABLE storage.objects ENABLE ROW LEVEL SECURITY';
    EXECUTE 'DROP POLICY IF EXISTS workspace_transition_platform_admin_write_gate ON storage.objects';
    EXECUTE 'DROP POLICY IF EXISTS workspace_transition_platform_admin_insert_gate ON storage.objects';
    EXECUTE 'DROP POLICY IF EXISTS workspace_transition_platform_admin_update_gate ON storage.objects';
    EXECUTE 'DROP POLICY IF EXISTS workspace_transition_platform_admin_delete_gate ON storage.objects';
    EXECUTE
      'CREATE POLICY workspace_transition_platform_admin_insert_gate '
      'ON storage.objects AS RESTRICTIVE FOR INSERT TO anon, authenticated '
      'WITH CHECK (public.is_platform_admin())';
    EXECUTE
      'CREATE POLICY workspace_transition_platform_admin_update_gate '
      'ON storage.objects AS RESTRICTIVE FOR UPDATE TO anon, authenticated '
      'USING (public.is_platform_admin()) '
      'WITH CHECK (public.is_platform_admin())';
    EXECUTE
      'CREATE POLICY workspace_transition_platform_admin_delete_gate '
      'ON storage.objects AS RESTRICTIVE FOR DELETE TO anon, authenticated '
      'USING (public.is_platform_admin())';
  END IF;
END;
$$;

-- PostgreSQL views otherwise run with the view owner's privileges and can
-- bypass underlying table RLS. Security-invoker views preserve existing grants
-- while applying the caller's table policies.
DO $$
DECLARE
  secured_view RECORD;
BEGIN
  FOR secured_view IN
    SELECT
      namespace.nspname AS schema_name,
      relation.relname AS view_name
    FROM pg_class AS relation
    JOIN pg_namespace AS namespace
      ON namespace.oid = relation.relnamespace
    WHERE namespace.nspname = 'public'
      AND relation.relkind = 'v'
      AND NOT EXISTS (
        SELECT 1
        FROM pg_depend AS dependency
        WHERE dependency.classid = 'pg_class'::regclass
          AND dependency.objid = relation.oid
          AND dependency.deptype = 'e'
      )
    ORDER BY relation.relname
  LOOP
    EXECUTE format(
      'ALTER VIEW %I.%I SET (security_invoker = true)',
      secured_view.schema_name,
      secured_view.view_name
    );
  END LOOP;
END;
$$;

-- Retire the legacy portal policy that treated a value from request headers as
-- a raw client_portal_sessions.session_token. Portal access now goes through
-- hash-only service-role Edge Functions; leaving the policy in the catalog
-- risks re-enabling bearer-by-stored-verifier authentication during a future
-- policy change.
DROP POLICY IF EXISTS "Clients can view their own podcast fit analyses"
  ON public.podcast_fit_analyses;

COMMIT;
