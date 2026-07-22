-- Disposable non-production behavior verification for the sub-agency
-- workspace foundation. The runner must provide both guard settings. Every
-- fixture and mutation is enclosed in this transaction and is always rolled
-- back; psql disconnect also rolls back a failing run.

BEGIN;

DO $behavior_guard$
BEGIN
  IF current_setting('goap.subagency_foundation_behavior', true)
      <> 'nonproduction-rollback-v1'
    OR current_setting('goap.environment', true) NOT IN ('local', 'staging')
    OR current_setting('transaction_read_only') <> 'off'
  THEN
    RAISE EXCEPTION 'sub-agency foundation behavior test is not authorized'
      USING ERRCODE = '42501';
  END IF;

  PERFORM pg_advisory_xact_lock(
    hashtextextended('goap:subagency-foundation:behavior:v1', 0)
  );
END;
$behavior_guard$;

DO $static_contract$
DECLARE
  required_function TEXT;
  internal_function TEXT;
BEGIN
  FOREACH required_function IN ARRAY ARRAY[
    'public.workspace_staff_list_v1(uuid,uuid,bigint)',
    'public.begin_workspace_staff_invite_v1(uuid,text,text,text,uuid,bigint)',
    'public.claim_workspace_staff_invite_delivery_v1(uuid,uuid,uuid,bigint,uuid)',
    'public.find_workspace_staff_invite_auth_user_v1(uuid,uuid,uuid,bigint,uuid)',
    'public.finalize_workspace_staff_invite_v1(uuid,uuid,uuid,bigint,uuid,uuid)',
    'public.revoke_workspace_staff_account_v1(uuid,uuid,uuid,bigint,uuid)',
    'public.claim_workspace_staff_auth_lifecycle_v1(uuid,uuid,text,uuid,bigint,uuid)',
    'public.complete_workspace_staff_auth_lifecycle_v1(uuid,uuid,text,uuid,bigint,uuid)',
    'public.update_workspace_staff_role_v1(uuid,uuid,text,uuid,bigint)',
    'public.transfer_workspace_owner_v1(uuid,uuid,uuid,bigint)',
    'public.workspace_client_operation_v2(text,uuid,uuid,jsonb,uuid,bigint)',
    'public.workspace_guest_resource_operation_v1(text,uuid,uuid,jsonb,uuid,bigint)'
  ]
  LOOP
    IF to_regprocedure(required_function) IS NULL
      OR NOT has_function_privilege('service_role', required_function, 'EXECUTE')
      OR has_function_privilege('authenticated', required_function, 'EXECUTE')
      OR has_function_privilege('anon', required_function, 'EXECUTE')
    THEN
      RAISE EXCEPTION 'workspace foundation RPC % is missing or exposed',
        required_function;
    END IF;
  END LOOP;

  FOREACH internal_function IN ARRAY ARRAY[
    'public.lock_workspace_provider_lifecycle_v1(uuid)',
    'public.workspace_user_has_provider_claim_v1(uuid)',
    'public.workspace_membership_has_provider_claim_v1(uuid)',
    'public.workspace_has_provider_claim_v1(uuid,uuid)'
  ]
  LOOP
    IF to_regprocedure(internal_function) IS NULL
      OR has_function_privilege(
        'service_role', internal_function, 'EXECUTE'
      )
      OR has_function_privilege(
        'authenticated', internal_function, 'EXECUTE'
      )
      OR has_function_privilege('anon', internal_function, 'EXECUTE')
      OR EXISTS (
        SELECT 1
        FROM pg_proc AS routine
        CROSS JOIN LATERAL aclexplode(
          COALESCE(routine.proacl, acldefault('f', routine.proowner))
        ) AS privilege
        WHERE routine.oid = to_regprocedure(internal_function)
          AND privilege.grantee = 0
          AND privilege.privilege_type = 'EXECUTE'
      )
    THEN
      RAISE EXCEPTION 'workspace foundation helper % is exposed',
        internal_function;
    END IF;
  END LOOP;

  IF has_function_privilege(
      'service_role',
      'public.workspace_client_operation(text,uuid,uuid,jsonb,uuid)',
      'EXECUTE'
    )
  THEN
    RAISE EXCEPTION 'tokenless workspace client implementation remains public';
  END IF;

  IF has_function_privilege(
      'service_role',
      'public.transition_workspace_membership(uuid,text,uuid)',
      'EXECUTE'
    )
  THEN
    RAISE EXCEPTION 'tokenless workspace lifecycle implementation remains public';
  END IF;

  IF to_regprocedure('public.enforce_private_workspace_single_live_member()')
      IS NOT NULL
    OR to_regprocedure('public.enforce_private_workspace_lifecycle_pair()')
      IS NOT NULL
  THEN
    RAISE EXCEPTION 'obsolete single-member workspace invariants remain installed';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_index AS index_definition
    JOIN pg_class AS index_relation
      ON index_relation.oid = index_definition.indexrelid
    WHERE index_definition.indrelid = 'public.workspace_memberships'::regclass
      AND index_relation.relname = 'workspace_memberships_one_live_owner_idx'
      AND index_definition.indisunique
      AND index_definition.indisvalid
      AND pg_get_expr(
        index_definition.indpred,
        index_definition.indrelid
      ) ILIKE '%role = ''owner''%status%provisioning%invited%active%suspended%'
  ) THEN
    RAISE EXCEPTION 'one-live-owner unique index is missing or malformed';
  END IF;

  IF EXISTS (
    SELECT required_trigger.name
    FROM (VALUES
      ('workspace_memberships_private_staff_invariant'),
      ('workspaces_private_staff_invariant')
    ) AS required_trigger(name)
    WHERE NOT EXISTS (
      SELECT 1
      FROM pg_trigger AS trigger_definition
      WHERE trigger_definition.tgname = required_trigger.name
        AND trigger_definition.tgfoid =
          'public.enforce_private_workspace_staff_invariants()'::regprocedure
        AND trigger_definition.tgdeferrable
        AND trigger_definition.tginitdeferred
        AND trigger_definition.tgenabled <> 'D'
    )
  ) THEN
    RAISE EXCEPTION 'deferred exactly-one-owner triggers are missing';
  END IF;
END;
$static_contract$;

CREATE TEMP TABLE goap_subagency_behavior_state (
  key TEXT PRIMARY KEY,
  value UUID NOT NULL
) ON COMMIT DROP;

DO $fixtures$
DECLARE
  default_workspace_id UUID;
  workspace_a_id UUID := gen_random_uuid();
  workspace_b_id UUID := gen_random_uuid();
  owner_a_id UUID := gen_random_uuid();
  admin_a_id UUID := gen_random_uuid();
  member_a_id UUID := gen_random_uuid();
  owner_b_id UUID := gen_random_uuid();
  member_b_id UUID := gen_random_uuid();
  platform_id UUID := gen_random_uuid();
  owner_a_membership_id UUID := gen_random_uuid();
  admin_a_membership_id UUID := gen_random_uuid();
  member_a_membership_id UUID := gen_random_uuid();
  owner_b_membership_id UUID := gen_random_uuid();
  member_b_membership_id UUID := gen_random_uuid();
  platform_membership_id UUID := gen_random_uuid();
  client_a_id UUID := gen_random_uuid();
  client_b_id UUID := gen_random_uuid();
  test_suffix TEXT := substr(replace(gen_random_uuid()::TEXT, '-', ''), 1, 16);
  token_epoch BIGINT := floor(EXTRACT(EPOCH FROM clock_timestamp()))::BIGINT;
BEGIN
  SELECT workspace.id
  INTO default_workspace_id
  FROM public.workspaces AS workspace
  WHERE workspace.is_default
    AND workspace.status = 'active'
  ORDER BY workspace.created_at, workspace.id
  LIMIT 1;

  IF default_workspace_id IS NULL THEN
    RAISE EXCEPTION 'behavior fixture requires an active default workspace';
  END IF;

  INSERT INTO auth.users (
    id,
    email,
    encrypted_password,
    raw_app_meta_data,
    raw_user_meta_data,
    created_at
  )
  VALUES
    (owner_a_id, 'owner-a-' || test_suffix || '@example.invalid', 'hash',
      '{}'::JSONB, '{}'::JSONB, now()),
    (admin_a_id, 'admin-a-' || test_suffix || '@example.invalid', 'hash',
      '{}'::JSONB, '{}'::JSONB, now()),
    (member_a_id, 'member-a-' || test_suffix || '@example.invalid', 'hash',
      '{}'::JSONB, '{}'::JSONB, now()),
    (owner_b_id, 'owner-b-' || test_suffix || '@example.invalid', 'hash',
      '{}'::JSONB, '{}'::JSONB, now()),
    (member_b_id, 'member-b-' || test_suffix || '@example.invalid', 'hash',
      '{}'::JSONB, '{}'::JSONB, now()),
    (platform_id, 'platform-' || test_suffix || '@example.invalid', 'hash',
      '{}'::JSONB, '{}'::JSONB, now());

  INSERT INTO public.admin_users (email, name, user_id)
  VALUES (
    'platform-' || test_suffix || '@example.invalid',
    'Foundation Platform Admin',
    platform_id
  );

  INSERT INTO public.workspaces (
    id, name, slug, status, is_default, created_by
  )
  VALUES
    (
      workspace_a_id,
      'Foundation Workspace A',
      'foundation-a-' || test_suffix,
      'active',
      false,
      owner_a_id
    ),
    (
      workspace_b_id,
      'Foundation Workspace B',
      'foundation-b-' || test_suffix,
      'active',
      false,
      owner_b_id
    );

  INSERT INTO public.workspace_memberships (
    id,
    workspace_id,
    user_id,
    email_normalized,
    full_name,
    role,
    status,
    invited_by,
    accepted_at,
    accepted_by,
    provisioning_method,
    password_change_required,
    workspace_access_not_before_epoch
  )
  VALUES
    (
      owner_a_membership_id,
      workspace_a_id,
      owner_a_id,
      'owner-a-' || test_suffix || '@example.invalid',
      'Owner A',
      'owner',
      'active',
      platform_id,
      now(),
      owner_a_id,
      'email_invite',
      false,
      token_epoch - 10
    ),
    (
      admin_a_membership_id,
      workspace_a_id,
      admin_a_id,
      'admin-a-' || test_suffix || '@example.invalid',
      'Admin A',
      'admin',
      'active',
      owner_a_id,
      now(),
      admin_a_id,
      'email_invite',
      false,
      token_epoch - 10
    ),
    (
      member_a_membership_id,
      workspace_a_id,
      member_a_id,
      'member-a-' || test_suffix || '@example.invalid',
      'Member A',
      'member',
      'active',
      owner_a_id,
      now(),
      member_a_id,
      'email_invite',
      false,
      token_epoch - 10
    ),
    (
      owner_b_membership_id,
      workspace_b_id,
      owner_b_id,
      'owner-b-' || test_suffix || '@example.invalid',
      'Owner B',
      'owner',
      'active',
      platform_id,
      now(),
      owner_b_id,
      'email_invite',
      false,
      token_epoch - 10
    ),
    (
      member_b_membership_id,
      workspace_b_id,
      member_b_id,
      'member-b-' || test_suffix || '@example.invalid',
      'Member B',
      'member',
      'active',
      owner_b_id,
      now(),
      member_b_id,
      'email_invite',
      false,
      token_epoch - 10
    ),
    (
      platform_membership_id,
      default_workspace_id,
      platform_id,
      'platform-' || test_suffix || '@example.invalid',
      'Foundation Platform Admin',
      'owner',
      'active',
      platform_id,
      now(),
      platform_id,
      'platform_bootstrap',
      false,
      token_epoch - 10
    );

  SET CONSTRAINTS ALL IMMEDIATE;
  SET CONSTRAINTS ALL DEFERRED;

  INSERT INTO public.clients (
    id, workspace_id, name, email, status, portal_access_enabled
  )
  VALUES
    (
      client_a_id,
      workspace_a_id,
      'Foundation Client A',
      'portal-a-' || test_suffix || '@example.invalid',
      'active',
      true
    ),
    (
      client_b_id,
      workspace_b_id,
      'Foundation Client B',
      'portal-b-' || test_suffix || '@example.invalid',
      'active',
      true
    );

  INSERT INTO public.client_portal_sessions (
    client_id, session_token, expires_at
  ) VALUES
    (
      client_a_id,
      'sha256$' || repeat('A', 43) || '=',
      now() + interval '1 hour'
    ),
    (
      client_b_id,
      'sha256$' || repeat('B', 43) || '=',
      now() + interval '1 hour'
    );

  INSERT INTO public.client_portal_tokens (client_id, token, expires_at)
  VALUES
    (
      client_a_id,
      'foundation-token-a-' || test_suffix,
      now() + interval '15 minutes'
    ),
    (
      client_b_id,
      'foundation-token-b-' || test_suffix,
      now() + interval '15 minutes'
    );

  INSERT INTO goap_subagency_behavior_state (key, value)
  VALUES
    ('default_workspace', default_workspace_id),
    ('workspace_a', workspace_a_id),
    ('workspace_b', workspace_b_id),
    ('owner_a', owner_a_id),
    ('admin_a', admin_a_id),
    ('member_a', member_a_id),
    ('owner_b', owner_b_id),
    ('member_b', member_b_id),
    ('platform', platform_id),
    ('owner_a_membership', owner_a_membership_id),
    ('admin_a_membership', admin_a_membership_id),
    ('member_a_membership', member_a_membership_id),
    ('owner_b_membership', owner_b_membership_id),
    ('member_b_membership', member_b_membership_id),
    ('platform_membership', platform_membership_id),
    ('client_a', client_a_id),
    ('client_b', client_b_id);
END;
$fixtures$;

DO $platform_client_rls_context$
BEGIN
  PERFORM set_config(
    'goap.behavior.platform_id',
    (SELECT value::TEXT FROM goap_subagency_behavior_state
      WHERE key = 'platform'),
    true
  );
  PERFORM set_config(
    'goap.behavior.default_workspace_id',
    (SELECT value::TEXT FROM goap_subagency_behavior_state
      WHERE key = 'default_workspace'),
    true
  );
  PERFORM set_config(
    'goap.behavior.private_workspace_id',
    (SELECT value::TEXT FROM goap_subagency_behavior_state
      WHERE key = 'workspace_a'),
    true
  );
  PERFORM set_config(
    'goap.behavior.private_client_id',
    (SELECT value::TEXT FROM goap_subagency_behavior_state
      WHERE key = 'client_a'),
    true
  );
END;
$platform_client_rls_context$;

SET LOCAL ROLE authenticated;

DO $platform_client_rls_claims$
BEGIN
  PERFORM set_config(
    'request.jwt.claim.sub',
    current_setting('goap.behavior.platform_id'),
    true
  );
  PERFORM set_config('request.jwt.claim.role', 'authenticated', true);
  PERFORM set_config(
    'request.jwt.claims',
    jsonb_build_object(
      'sub', current_setting('goap.behavior.platform_id'),
      'role', 'authenticated',
      'iat', floor(EXTRACT(EPOCH FROM clock_timestamp()))::BIGINT
    )::TEXT,
    true
  );
END;
$platform_client_rls_claims$;

DO $platform_client_rls$
DECLARE
  default_workspace_id UUID :=
    current_setting('goap.behavior.default_workspace_id')::UUID;
  private_workspace_id UUID :=
    current_setting('goap.behavior.private_workspace_id')::UUID;
  private_client_id UUID :=
    current_setting('goap.behavior.private_client_id')::UUID;
  default_client_id UUID := gen_random_uuid();
  affected BIGINT;
  blocked BOOLEAN := false;
BEGIN
  SELECT count(*)
  INTO affected
  FROM public.clients AS client
  WHERE client.id = private_client_id
    AND client.workspace_id = private_workspace_id;

  IF affected <> 1 THEN
    RAISE EXCEPTION 'platform preview could not read the private client';
  END IF;

  BEGIN
    INSERT INTO public.clients (
      id, workspace_id, name, email, status, portal_access_enabled
    ) VALUES (
      gen_random_uuid(),
      private_workspace_id,
      'Blocked Platform Private Insert',
      'blocked-private-' || replace(gen_random_uuid()::TEXT, '-', '')
        || '@example.invalid',
      'active',
      false
    );
  EXCEPTION WHEN SQLSTATE '42501' THEN
    blocked := true;
  END;
  IF NOT blocked THEN
    RAISE EXCEPTION 'platform browser inserted a private workspace client';
  END IF;

  UPDATE public.clients
  SET notes = 'blocked platform private update'
  WHERE id = private_client_id;
  GET DIAGNOSTICS affected = ROW_COUNT;
  IF affected <> 0 THEN
    RAISE EXCEPTION 'platform browser updated a private workspace client';
  END IF;

  DELETE FROM public.clients WHERE id = private_client_id;
  GET DIAGNOSTICS affected = ROW_COUNT;
  IF affected <> 0 THEN
    RAISE EXCEPTION 'platform browser deleted a private workspace client';
  END IF;

  INSERT INTO public.clients (
    id, workspace_id, name, email, status, portal_access_enabled
  ) VALUES (
    default_client_id,
    default_workspace_id,
    'Platform Default Workspace Client',
    'default-platform-' || replace(default_client_id::TEXT, '-', '')
      || '@example.invalid',
    'active',
    false
  );

  UPDATE public.clients
  SET notes = 'default workspace update allowed'
  WHERE id = default_client_id;
  GET DIAGNOSTICS affected = ROW_COUNT;
  IF affected <> 1 THEN
    RAISE EXCEPTION 'platform browser could not update its default client';
  END IF;

  DELETE FROM public.clients WHERE id = default_client_id;
  GET DIAGNOSTICS affected = ROW_COUNT;
  IF affected <> 1 THEN
    RAISE EXCEPTION 'platform browser could not delete its default client';
  END IF;
END;
$platform_client_rls$;

RESET ROLE;

DO $isolation_and_roles$
DECLARE
  workspace_a_id UUID;
  workspace_b_id UUID;
  owner_a_id UUID;
  admin_a_id UUID;
  member_a_id UUID;
  owner_b_id UUID;
  member_b_membership_id UUID;
  platform_id UUID;
  client_a_id UUID;
  client_b_id UUID;
  token_epoch BIGINT := floor(EXTRACT(EPOCH FROM clock_timestamp()))::BIGINT;
  response JSONB;
  rejected BOOLEAN;
BEGIN
  SELECT value INTO workspace_a_id FROM goap_subagency_behavior_state
    WHERE key = 'workspace_a';
  SELECT value INTO workspace_b_id FROM goap_subagency_behavior_state
    WHERE key = 'workspace_b';
  SELECT value INTO owner_a_id FROM goap_subagency_behavior_state
    WHERE key = 'owner_a';
  SELECT value INTO admin_a_id FROM goap_subagency_behavior_state
    WHERE key = 'admin_a';
  SELECT value INTO member_a_id FROM goap_subagency_behavior_state
    WHERE key = 'member_a';
  SELECT value INTO owner_b_id FROM goap_subagency_behavior_state
    WHERE key = 'owner_b';
  SELECT value INTO member_b_membership_id FROM goap_subagency_behavior_state
    WHERE key = 'member_b_membership';
  SELECT value INTO platform_id FROM goap_subagency_behavior_state
    WHERE key = 'platform';
  SELECT value INTO client_a_id FROM goap_subagency_behavior_state
    WHERE key = 'client_a';
  SELECT value INTO client_b_id FROM goap_subagency_behavior_state
    WHERE key = 'client_b';

  response := public.workspace_staff_list_v1(
    workspace_a_id, owner_a_id, token_epoch
  );
  IF jsonb_array_length(response -> 'members') <> 3
    OR response #>> '{capabilities,read_only}' <> 'false'
    OR response #> '{capabilities,invite_roles}'
      <> '["admin", "member"]'::JSONB
    OR response::TEXT LIKE '%user_id%'
    OR response::TEXT LIKE '%workspace_access_not_before_epoch%'
  THEN
    RAISE EXCEPTION 'owner roster projection or capabilities are malformed';
  END IF;

  response := public.workspace_staff_list_v1(
    workspace_a_id, admin_a_id, token_epoch
  );
  IF response #> '{capabilities,invite_roles}' <> '["member"]'::JSONB
    OR response #>> '{capabilities,can_update_roles}' <> 'false'
    OR response #>> '{capabilities,can_transfer_owner}' <> 'false'
  THEN
    RAISE EXCEPTION 'administrator roster capabilities are malformed';
  END IF;

  response := public.workspace_staff_list_v1(
    workspace_a_id, platform_id, token_epoch
  );
  IF response #>> '{capabilities,read_only}' <> 'true'
    OR response #> '{capabilities,invite_roles}' <> '[]'::JSONB
  THEN
    RAISE EXCEPTION 'platform workspace preview is not read-only';
  END IF;

  response := public.workspace_client_operation_v2(
    'list', workspace_a_id, NULL, '{}'::JSONB, platform_id, token_epoch
  );
  IF jsonb_array_length(response) <> 1
    OR response -> 0 ->> 'id' <> client_a_id::TEXT
    OR response -> 0 ->> 'workspace_id' <> workspace_a_id::TEXT
    OR response::TEXT LIKE '%' || client_b_id::TEXT || '%'
  THEN
    RAISE EXCEPTION 'platform client preview crossed or lost its workspace';
  END IF;

  rejected := false;
  BEGIN
    PERFORM public.workspace_client_operation_v2(
      'delete',
      workspace_a_id,
      client_a_id,
      '{}'::JSONB,
      platform_id,
      token_epoch
    );
  EXCEPTION WHEN SQLSTATE '42501' THEN
    rejected := true;
  END;
  IF NOT rejected THEN
    RAISE EXCEPTION 'platform client preview invoked a tenant mutation';
  END IF;

  rejected := false;
  BEGIN
    PERFORM public.begin_workspace_staff_invite_v1(
      workspace_a_id,
      'platform-cannot-mutate@example.invalid',
      'No Mutation',
      'member',
      platform_id,
      token_epoch
    );
  EXCEPTION WHEN SQLSTATE '42501' THEN
    rejected := true;
  END;
  IF NOT rejected THEN
    RAISE EXCEPTION 'platform preview mutated tenant staff';
  END IF;

  rejected := false;
  BEGIN
    PERFORM public.workspace_staff_list_v1(
      workspace_b_id, owner_a_id, token_epoch
    );
  EXCEPTION WHEN SQLSTATE '42501' THEN
    rejected := true;
  END;
  IF NOT rejected THEN
    RAISE EXCEPTION 'workspace A owner read workspace B staff';
  END IF;

  rejected := false;
  BEGIN
    PERFORM public.workspace_staff_list_v1(
      workspace_a_id, member_a_id, token_epoch
    );
  EXCEPTION WHEN SQLSTATE '42501' THEN
    rejected := true;
  END;
  IF NOT rejected THEN
    RAISE EXCEPTION 'workspace member accessed staff administration';
  END IF;

  response := public.workspace_client_operation_v2(
    'list', workspace_a_id, NULL, '{}'::JSONB, member_a_id, token_epoch
  );
  IF jsonb_array_length(response) <> 1
    OR response -> 0 ->> 'workspace_id' <> workspace_a_id::TEXT
    OR response::TEXT LIKE '%' || client_b_id::TEXT || '%'
  THEN
    RAISE EXCEPTION 'member client list crossed a workspace boundary';
  END IF;

  response := public.workspace_guest_resource_operation_v1(
    'list', workspace_a_id, NULL, '{}'::JSONB, member_a_id, token_epoch
  );
  IF jsonb_typeof(response) <> 'array'
    OR EXISTS (
      SELECT 1
      FROM jsonb_array_elements(response) AS resource(value)
      WHERE resource.value ->> 'workspace_id' <> workspace_a_id::TEXT
    )
  THEN
    RAISE EXCEPTION 'member guest-resource list crossed a workspace boundary';
  END IF;

  rejected := false;
  BEGIN
    PERFORM public.workspace_client_operation_v2(
      'create', workspace_a_id, NULL, '{}'::JSONB, member_a_id, token_epoch
    );
  EXCEPTION WHEN SQLSTATE '42501' THEN
    rejected := true;
  END;
  IF NOT rejected THEN
    RAISE EXCEPTION 'workspace member mutated clients';
  END IF;

  rejected := false;
  BEGIN
    PERFORM public.workspace_guest_resource_operation_v1(
      'create', workspace_a_id, NULL, '{}'::JSONB, member_a_id, token_epoch
    );
  EXCEPTION WHEN SQLSTATE '42501' THEN
    rejected := true;
  END;
  IF NOT rejected THEN
    RAISE EXCEPTION 'workspace member mutated guest resources';
  END IF;

  rejected := false;
  BEGIN
    PERFORM public.begin_workspace_staff_invite_v1(
      workspace_a_id,
      'admin-escalation@example.invalid',
      'Admin Escalation',
      'admin',
      admin_a_id,
      token_epoch
    );
  EXCEPTION WHEN SQLSTATE '42501' THEN
    rejected := true;
  END;
  IF NOT rejected THEN
    RAISE EXCEPTION 'workspace administrator invited another administrator';
  END IF;

  rejected := false;
  BEGIN
    PERFORM public.update_workspace_staff_role_v1(
      workspace_a_id,
      member_b_membership_id,
      'admin',
      owner_a_id,
      token_epoch
    );
  EXCEPTION WHEN SQLSTATE 'P0002' THEN
    rejected := true;
  END;
  IF NOT rejected THEN
    RAISE EXCEPTION 'cross-workspace membership id changed role';
  END IF;

  rejected := false;
  BEGIN
    PERFORM public.update_workspace_staff_role_v1(
      workspace_a_id,
      member_b_membership_id,
      'member',
      admin_a_id,
      token_epoch
    );
  EXCEPTION WHEN SQLSTATE '42501' THEN
    rejected := true;
  END;
  IF NOT rejected THEN
    RAISE EXCEPTION 'workspace administrator accessed owner-only role changes';
  END IF;

  rejected := false;
  BEGIN
    PERFORM public.workspace_client_operation_v2(
      'update',
      workspace_a_id,
      client_b_id,
      jsonb_build_object(
        'name', 'Cross Workspace Mutation',
        'email', NULL,
        'contact_person', NULL,
        'linkedin_url', NULL,
        'website', NULL,
        'status', 'active',
        'notes', NULL
      ),
      owner_a_id,
      token_epoch
    );
  EXCEPTION WHEN SQLSTATE 'P0002' THEN
    rejected := true;
  END;
  IF NOT rejected THEN
    RAISE EXCEPTION 'cross-workspace client id was mutated';
  END IF;

  IF public.workspace_client_operation_v2(
      'list', workspace_b_id, NULL, '{}'::JSONB, owner_b_id, token_epoch
    ) -> 0 ->> 'workspace_id' <> workspace_b_id::TEXT
  THEN
    RAISE EXCEPTION 'workspace B owner could not read its own client';
  END IF;
END;
$isolation_and_roles$;

DO $staff_lifecycle$
DECLARE
  workspace_a_id UUID;
  owner_a_id UUID;
  member_a_id UUID;
  member_a_membership_id UUID;
  token_epoch BIGINT := floor(EXTRACT(EPOCH FROM clock_timestamp()))::BIGINT;
  fresh_member_epoch BIGINT;
  lock_token UUID := gen_random_uuid();
  rejected BOOLEAN;
  portal_sessions_before BIGINT;
  portal_tokens_before BIGINT;
BEGIN
  SELECT value INTO workspace_a_id FROM goap_subagency_behavior_state
    WHERE key = 'workspace_a';
  SELECT value INTO owner_a_id FROM goap_subagency_behavior_state
    WHERE key = 'owner_a';
  SELECT value INTO member_a_id FROM goap_subagency_behavior_state
    WHERE key = 'member_a';
  SELECT value INTO member_a_membership_id FROM goap_subagency_behavior_state
    WHERE key = 'member_a_membership';

  SELECT count(*) INTO portal_sessions_before
  FROM public.client_portal_sessions AS session
  JOIN public.clients AS client ON client.id = session.client_id
  WHERE client.workspace_id = workspace_a_id;

  SELECT count(*) INTO portal_tokens_before
  FROM public.client_portal_tokens AS token
  JOIN public.clients AS client ON client.id = token.client_id
  WHERE client.workspace_id = workspace_a_id;

  PERFORM public.claim_workspace_staff_auth_lifecycle_v1(
    workspace_a_id,
    member_a_membership_id,
    'suspend',
    owner_a_id,
    token_epoch,
    lock_token
  );

  rejected := false;
  BEGIN
    PERFORM public.claim_workspace_staff_auth_lifecycle_v1(
      workspace_a_id,
      member_a_membership_id,
      'suspend',
      owner_a_id,
      token_epoch,
      gen_random_uuid()
    );
  EXCEPTION WHEN SQLSTATE '55P03' THEN
    rejected := true;
  END;
  IF NOT rejected THEN
    RAISE EXCEPTION 'staff lifecycle claim was stealable';
  END IF;

  PERFORM public.complete_workspace_staff_auth_lifecycle_v1(
    workspace_a_id,
    member_a_membership_id,
    'suspend',
    owner_a_id,
    token_epoch,
    lock_token
  );

  IF (SELECT status FROM public.workspaces WHERE id = workspace_a_id) <> 'active'
    OR (SELECT status FROM public.workspace_memberships
        WHERE id = member_a_membership_id) <> 'suspended'
    OR portal_sessions_before <> (
      SELECT count(*)
      FROM public.client_portal_sessions AS session
      JOIN public.clients AS client ON client.id = session.client_id
      WHERE client.workspace_id = workspace_a_id
    )
    OR portal_tokens_before <> (
      SELECT count(*)
      FROM public.client_portal_tokens AS token
      JOIN public.clients AS client ON client.id = token.client_id
      WHERE client.workspace_id = workspace_a_id
    )
  THEN
    RAISE EXCEPTION 'staff suspension changed workspace or client-portal state';
  END IF;

  rejected := false;
  BEGIN
    PERFORM public.workspace_client_operation_v2(
      'list', workspace_a_id, NULL, '{}'::JSONB, member_a_id, token_epoch
    );
  EXCEPTION WHEN SQLSTATE '42501' THEN
    rejected := true;
  END;
  IF NOT rejected THEN
    RAISE EXCEPTION 'suspended staff retained tenant access';
  END IF;

  lock_token := gen_random_uuid();
  PERFORM public.claim_workspace_staff_auth_lifecycle_v1(
    workspace_a_id,
    member_a_membership_id,
    'reactivate',
    owner_a_id,
    token_epoch,
    lock_token
  );
  PERFORM public.complete_workspace_staff_auth_lifecycle_v1(
    workspace_a_id,
    member_a_membership_id,
    'reactivate',
    owner_a_id,
    token_epoch,
    lock_token
  );

  SELECT workspace_access_not_before_epoch
  INTO fresh_member_epoch
  FROM public.workspace_memberships
  WHERE id = member_a_membership_id;

  rejected := false;
  BEGIN
    PERFORM public.workspace_client_operation_v2(
      'list', workspace_a_id, NULL, '{}'::JSONB, member_a_id, token_epoch
    );
  EXCEPTION WHEN SQLSTATE '42501' THEN
    rejected := true;
  END;
  IF NOT rejected THEN
    RAISE EXCEPTION 'reactivation accepted a stale pre-suspension token';
  END IF;

  IF jsonb_typeof(public.workspace_client_operation_v2(
      'list',
      workspace_a_id,
      NULL,
      '{}'::JSONB,
      member_a_id,
      fresh_member_epoch
    )) <> 'array'
  THEN
    RAISE EXCEPTION 'reactivated staff could not use a fresh token';
  END IF;
END;
$staff_lifecycle$;

DO $staff_claim_transition_interlocks$
DECLARE
  workspace_a_id UUID;
  owner_a_id UUID;
  admin_a_id UUID;
  admin_a_membership_id UUID;
  token_epoch BIGINT := floor(EXTRACT(EPOCH FROM clock_timestamp()))::BIGINT;
  owner_claim_lock UUID := gen_random_uuid();
  admin_claim_lock UUID := gen_random_uuid();
  cleanup_lock UUID;
  pending_membership_id UUID;
  response JSONB;
  rejected BOOLEAN;
BEGIN
  SELECT value INTO workspace_a_id FROM goap_subagency_behavior_state
    WHERE key = 'workspace_a';
  SELECT value INTO owner_a_id FROM goap_subagency_behavior_state
    WHERE key = 'owner_a';
  SELECT value INTO admin_a_id FROM goap_subagency_behavior_state
    WHERE key = 'admin_a';
  SELECT value INTO admin_a_membership_id FROM goap_subagency_behavior_state
    WHERE key = 'admin_a_membership';

  response := public.begin_workspace_staff_invite_v1(
    workspace_a_id,
    'owner-claim-interlock-' || replace(gen_random_uuid()::TEXT, '-', '')
      || '@example.invalid',
    'Owner Claim Interlock',
    'member',
    owner_a_id,
    token_epoch
  );
  pending_membership_id := (response #>> '{membership,id}')::UUID;
  PERFORM public.claim_workspace_staff_invite_delivery_v1(
    workspace_a_id,
    pending_membership_id,
    owner_a_id,
    token_epoch,
    owner_claim_lock
  );

  rejected := false;
  BEGIN
    PERFORM public.transfer_workspace_owner_v1(
      workspace_a_id,
      admin_a_membership_id,
      owner_a_id,
      token_epoch
    );
  EXCEPTION WHEN SQLSTATE '55P03' THEN
    rejected := true;
  END;
  IF NOT rejected THEN
    RAISE EXCEPTION 'owner transfer stranded an owner provider claim';
  END IF;

  IF NOT public.release_workspace_invite_delivery_claim(
      pending_membership_id, owner_claim_lock
    )
  THEN
    RAISE EXCEPTION 'owner transfer interlock claim did not release';
  END IF;

  cleanup_lock := gen_random_uuid();
  PERFORM public.revoke_workspace_staff_account_v1(
    workspace_a_id,
    pending_membership_id,
    owner_a_id,
    token_epoch,
    cleanup_lock
  );
  IF public.find_workspace_staff_invite_auth_user_v1(
      workspace_a_id,
      pending_membership_id,
      owner_a_id,
      token_epoch,
      cleanup_lock
    ) IS NOT NULL
    OR NOT public.release_workspace_invite_delivery_claim(
      pending_membership_id, cleanup_lock
    )
  THEN
    RAISE EXCEPTION 'owner transfer interlock fixture did not clean up';
  END IF;

  response := public.begin_workspace_staff_invite_v1(
    workspace_a_id,
    'admin-claim-interlock-' || replace(gen_random_uuid()::TEXT, '-', '')
      || '@example.invalid',
    'Admin Claim Interlock',
    'member',
    admin_a_id,
    token_epoch
  );
  pending_membership_id := (response #>> '{membership,id}')::UUID;
  PERFORM public.claim_workspace_staff_invite_delivery_v1(
    workspace_a_id,
    pending_membership_id,
    admin_a_id,
    token_epoch,
    admin_claim_lock
  );

  rejected := false;
  BEGIN
    PERFORM public.update_workspace_staff_role_v1(
      workspace_a_id,
      admin_a_membership_id,
      'member',
      owner_a_id,
      token_epoch
    );
  EXCEPTION WHEN SQLSTATE '55P03' THEN
    rejected := true;
  END;
  IF NOT rejected THEN
    RAISE EXCEPTION 'role demotion stranded the target actor provider claim';
  END IF;

  rejected := false;
  BEGIN
    PERFORM public.claim_workspace_staff_auth_lifecycle_v1(
      workspace_a_id,
      admin_a_membership_id,
      'suspend',
      owner_a_id,
      token_epoch,
      gen_random_uuid()
    );
  EXCEPTION WHEN SQLSTATE '55P03' THEN
    rejected := true;
  END;
  IF NOT rejected THEN
    RAISE EXCEPTION 'staff suspension stranded the target actor provider claim';
  END IF;

  IF NOT public.release_workspace_invite_delivery_claim(
      pending_membership_id, admin_claim_lock
    )
  THEN
    RAISE EXCEPTION 'staff actor interlock claim did not release';
  END IF;

  cleanup_lock := gen_random_uuid();
  PERFORM public.revoke_workspace_staff_account_v1(
    workspace_a_id,
    pending_membership_id,
    owner_a_id,
    token_epoch,
    cleanup_lock
  );
  IF public.find_workspace_staff_invite_auth_user_v1(
      workspace_a_id,
      pending_membership_id,
      owner_a_id,
      token_epoch,
      cleanup_lock
    ) IS NOT NULL
    OR NOT public.release_workspace_invite_delivery_claim(
      pending_membership_id, cleanup_lock
    )
  THEN
    RAISE EXCEPTION 'staff actor interlock fixture did not clean up';
  END IF;
END;
$staff_claim_transition_interlocks$;

DO $platform_workspace_lifecycle$
DECLARE
  workspace_b_id UUID;
  owner_b_id UUID;
  member_b_id UUID;
  owner_b_membership_id UUID;
  member_b_membership_id UUID;
  platform_id UUID;
  client_b_id UUID;
  token_epoch BIGINT := floor(EXTRACT(EPOCH FROM clock_timestamp()))::BIGINT;
  workspace_fresh_epoch BIGINT;
  delivery_lock UUID := gen_random_uuid();
  lifecycle_lock UUID := gen_random_uuid();
  cleanup_lock UUID;
  pending_membership_id UUID;
  response JSONB;
  rejected BOOLEAN;
BEGIN
  SELECT value INTO workspace_b_id FROM goap_subagency_behavior_state
    WHERE key = 'workspace_b';
  SELECT value INTO owner_b_id FROM goap_subagency_behavior_state
    WHERE key = 'owner_b';
  SELECT value INTO member_b_id FROM goap_subagency_behavior_state
    WHERE key = 'member_b';
  SELECT value INTO owner_b_membership_id FROM goap_subagency_behavior_state
    WHERE key = 'owner_b_membership';
  SELECT value INTO member_b_membership_id FROM goap_subagency_behavior_state
    WHERE key = 'member_b_membership';
  SELECT value INTO platform_id FROM goap_subagency_behavior_state
    WHERE key = 'platform';
  SELECT value INTO client_b_id FROM goap_subagency_behavior_state
    WHERE key = 'client_b';

  response := public.begin_workspace_staff_invite_v1(
    workspace_b_id,
    'workspace-lifecycle-claim-' || replace(gen_random_uuid()::TEXT, '-', '')
      || '@example.invalid',
    'Claim Interlock',
    'member',
    owner_b_id,
    token_epoch
  );
  pending_membership_id := (response #>> '{membership,id}')::UUID;
  PERFORM public.claim_workspace_staff_invite_delivery_v1(
    workspace_b_id,
    pending_membership_id,
    owner_b_id,
    token_epoch,
    delivery_lock
  );

  rejected := false;
  BEGIN
    PERFORM public.claim_workspace_auth_lifecycle(
      owner_b_membership_id,
      'suspend',
      platform_id,
      lifecycle_lock
    );
  EXCEPTION
    WHEN SQLSTATE '55P03' OR SQLSTATE '55000' THEN
      rejected := true;
  END;
  IF NOT rejected THEN
    RAISE EXCEPTION 'workspace suspension bypassed an outstanding staff claim';
  END IF;

  IF NOT public.release_workspace_invite_delivery_claim(
      pending_membership_id, delivery_lock
    )
  THEN
    RAISE EXCEPTION 'workspace lifecycle interlock claim did not release';
  END IF;
  cleanup_lock := gen_random_uuid();
  PERFORM public.revoke_workspace_staff_account_v1(
    workspace_b_id,
    pending_membership_id,
    owner_b_id,
    token_epoch,
    cleanup_lock
  );
  IF public.find_workspace_staff_invite_auth_user_v1(
      workspace_b_id,
      pending_membership_id,
      owner_b_id,
      token_epoch,
      cleanup_lock
    ) IS NOT NULL
  THEN
    RAISE EXCEPTION 'provider-free lifecycle interlock found an Auth user';
  END IF;
  IF NOT public.release_workspace_invite_delivery_claim(
      pending_membership_id, cleanup_lock
    )
  THEN
    RAISE EXCEPTION 'provider-free lifecycle interlock did not clean up';
  END IF;

  lifecycle_lock := gen_random_uuid();
  PERFORM public.claim_workspace_auth_lifecycle(
    owner_b_membership_id,
    'suspend',
    platform_id,
    lifecycle_lock
  );
  PERFORM public.complete_workspace_auth_lifecycle(
    owner_b_membership_id,
    'suspend',
    platform_id,
    lifecycle_lock
  );

  IF (SELECT status FROM public.workspaces WHERE id = workspace_b_id)
      <> 'suspended'
    OR (SELECT status FROM public.workspace_memberships
        WHERE id = owner_b_membership_id) <> 'suspended'
    OR (SELECT status FROM public.workspace_memberships
        WHERE id = member_b_membership_id) <> 'active'
    OR (SELECT count(*) FROM public.client_portal_sessions
        WHERE client_id = client_b_id) <> 0
    OR (SELECT count(*) FROM public.client_portal_tokens
        WHERE client_id = client_b_id) <> 0
  THEN
    RAISE EXCEPTION 'platform workspace suspension corrupted multi-staff lifecycle';
  END IF;

  rejected := false;
  BEGIN
    PERFORM public.workspace_client_operation_v2(
      'list', workspace_b_id, NULL, '{}'::JSONB, member_b_id, token_epoch
    );
  EXCEPTION WHEN SQLSTATE '42501' THEN
    rejected := true;
  END;
  IF NOT rejected THEN
    RAISE EXCEPTION 'staff retained access to a suspended workspace';
  END IF;

  lifecycle_lock := gen_random_uuid();
  PERFORM public.claim_workspace_auth_lifecycle(
    owner_b_membership_id,
    'reactivate',
    platform_id,
    lifecycle_lock
  );
  PERFORM public.complete_workspace_auth_lifecycle(
    owner_b_membership_id,
    'reactivate',
    platform_id,
    lifecycle_lock
  );

  SELECT access_not_before_epoch
  INTO workspace_fresh_epoch
  FROM public.workspaces
  WHERE id = workspace_b_id;

  IF (SELECT status FROM public.workspaces WHERE id = workspace_b_id) <> 'active'
    OR (SELECT status FROM public.workspace_memberships
        WHERE id = owner_b_membership_id) <> 'active'
    OR (SELECT status FROM public.workspace_memberships
        WHERE id = member_b_membership_id) <> 'active'
  THEN
    RAISE EXCEPTION 'platform workspace reactivation did not restore staff';
  END IF;

  rejected := false;
  BEGIN
    PERFORM public.workspace_client_operation_v2(
      'list', workspace_b_id, NULL, '{}'::JSONB, member_b_id, token_epoch
    );
  EXCEPTION WHEN SQLSTATE '42501' THEN
    rejected := true;
  END;
  IF NOT rejected THEN
    RAISE EXCEPTION 'workspace reactivation accepted a stale staff token';
  END IF;

  IF jsonb_typeof(public.workspace_client_operation_v2(
      'list',
      workspace_b_id,
      NULL,
      '{}'::JSONB,
      member_b_id,
      workspace_fresh_epoch
    )) <> 'array'
  THEN
    RAISE EXCEPTION 'fresh staff token failed after workspace reactivation';
  END IF;
END;
$platform_workspace_lifecycle$;

DO $invite_and_revoke$
DECLARE
  workspace_a_id UUID;
  workspace_b_id UUID;
  owner_a_id UUID;
  owner_b_id UUID;
  client_a_id UUID;
  token_epoch BIGINT := floor(EXTRACT(EPOCH FROM clock_timestamp()))::BIGINT;
  owner_b_fresh_epoch BIGINT;
  invite_email TEXT :=
    'staff-invite-' || replace(gen_random_uuid()::TEXT, '-', '')
    || '@example.invalid';
  invited_user_id UUID := gen_random_uuid();
  delivery_lock UUID := gen_random_uuid();
  revoke_lock UUID := gen_random_uuid();
  membership_id UUID;
  retry_membership_id UUID;
  found_auth_user_id UUID;
  response JSONB;
  rejected BOOLEAN;
  portal_sessions_before BIGINT;
  portal_tokens_before BIGINT;
BEGIN
  SELECT value INTO workspace_a_id FROM goap_subagency_behavior_state
    WHERE key = 'workspace_a';
  SELECT value INTO workspace_b_id FROM goap_subagency_behavior_state
    WHERE key = 'workspace_b';
  SELECT value INTO owner_a_id FROM goap_subagency_behavior_state
    WHERE key = 'owner_a';
  SELECT value INTO owner_b_id FROM goap_subagency_behavior_state
    WHERE key = 'owner_b';
  SELECT value INTO client_a_id FROM goap_subagency_behavior_state
    WHERE key = 'client_a';

  SELECT GREATEST(
    workspace.access_not_before_epoch,
    membership.workspace_access_not_before_epoch
  )
  INTO owner_b_fresh_epoch
  FROM public.workspaces AS workspace
  JOIN public.workspace_memberships AS membership
    ON membership.workspace_id = workspace.id
   AND membership.user_id = owner_b_id
  WHERE workspace.id = workspace_b_id;

  response := public.begin_workspace_staff_invite_v1(
    workspace_a_id,
    invite_email,
    'Invited Staff',
    'member',
    owner_a_id,
    token_epoch
  );
  membership_id := (response #>> '{membership,id}')::UUID;

  PERFORM public.claim_workspace_staff_invite_delivery_v1(
    workspace_a_id,
    membership_id,
    owner_a_id,
    token_epoch,
    delivery_lock
  );

  rejected := false;
  BEGIN
    PERFORM public.claim_workspace_staff_invite_delivery_v1(
      workspace_a_id,
      membership_id,
      owner_a_id,
      token_epoch,
      gen_random_uuid()
    );
  EXCEPTION WHEN SQLSTATE '55P03' THEN
    rejected := true;
  END;
  IF NOT rejected THEN
    RAISE EXCEPTION 'staff invite delivery claim was stealable';
  END IF;

  INSERT INTO auth.users (
    id,
    email,
    encrypted_password,
    raw_app_meta_data,
    raw_user_meta_data,
    created_at,
    invited_at,
    last_sign_in_at
  ) VALUES (
    invited_user_id,
    invite_email,
    '',
    jsonb_build_object(
      'workspace_id', workspace_a_id,
      'workspace_membership_id', membership_id
    ),
    jsonb_build_object(
      'workspace_id', workspace_a_id,
      'workspace_membership_id', membership_id
    ),
    now(),
    now(),
    NULL
  );

  PERFORM public.finalize_workspace_staff_invite_v1(
    workspace_a_id,
    membership_id,
    owner_a_id,
    token_epoch,
    delivery_lock,
    invited_user_id
  );

  -- Same-identity retry after a lost response is idempotent even though the
  -- delivery claim has already been removed.
  PERFORM public.finalize_workspace_staff_invite_v1(
    workspace_a_id,
    membership_id,
    owner_a_id,
    token_epoch,
    delivery_lock,
    invited_user_id
  );

  UPDATE auth.users
  SET encrypted_password = 'configured-password-hash'
  WHERE id = invited_user_id;

  PERFORM public.accept_workspace_invite(
    membership_id, invited_user_id, invite_email
  );

  rejected := false;
  BEGIN
    PERFORM public.begin_workspace_staff_invite_v1(
      workspace_b_id,
      invite_email,
      'Duplicate Staff',
      'member',
      owner_b_id,
      owner_b_fresh_epoch
    );
  EXCEPTION WHEN SQLSTATE '23505' THEN
    rejected := true;
  END;
  IF NOT rejected THEN
    RAISE EXCEPTION 'one Auth account joined multiple live workspaces';
  END IF;

  SELECT count(*) INTO portal_sessions_before
  FROM public.client_portal_sessions
  WHERE client_id = client_a_id;
  SELECT count(*) INTO portal_tokens_before
  FROM public.client_portal_tokens
  WHERE client_id = client_a_id;

  PERFORM public.revoke_workspace_staff_account_v1(
    workspace_a_id,
    membership_id,
    owner_a_id,
    token_epoch,
    revoke_lock
  );

  found_auth_user_id := public.find_workspace_staff_invite_auth_user_v1(
    workspace_a_id,
    membership_id,
    owner_a_id,
    token_epoch,
    revoke_lock
  );
  IF found_auth_user_id IS DISTINCT FROM invited_user_id THEN
    RAISE EXCEPTION 'staff revocation did not bind the exact Auth identity';
  END IF;

  DELETE FROM auth.users WHERE id = found_auth_user_id;
  IF NOT public.release_workspace_invite_delivery_claim(
      membership_id, revoke_lock
    )
  THEN
    RAISE EXCEPTION 'staff revocation cleanup claim did not release';
  END IF;

  IF (SELECT status FROM public.workspaces WHERE id = workspace_a_id) <> 'active'
    OR portal_sessions_before <> (
      SELECT count(*) FROM public.client_portal_sessions
      WHERE client_id = client_a_id
    )
    OR portal_tokens_before <> (
      SELECT count(*) FROM public.client_portal_tokens
      WHERE client_id = client_a_id
    )
  THEN
    RAISE EXCEPTION 'staff removal changed workspace or client-portal state';
  END IF;

  response := public.workspace_staff_list_v1(
    workspace_a_id, owner_a_id, token_epoch
  );
  IF response::TEXT LIKE '%' || membership_id::TEXT || '%'
    OR response::TEXT LIKE '%' || invite_email || '%'
  THEN
    RAISE EXCEPTION 'revoked workspace user remained visible in roster UX';
  END IF;

  -- now() is transaction-stable, while production reinvites occur in a later
  -- transaction. Make that ordering explicit for the supersession checks.
  UPDATE public.workspace_memberships
  SET created_at = clock_timestamp() - interval '1 minute'
  WHERE id = membership_id;

  response := public.begin_workspace_staff_invite_v1(
    workspace_a_id,
    invite_email,
    'Reinvited Staff',
    'member',
    owner_a_id,
    token_epoch
  );
  retry_membership_id := (response #>> '{membership,id}')::UUID;
  IF retry_membership_id = membership_id THEN
    RAISE EXCEPTION 'revoked history was reused as a live staff account';
  END IF;

  revoke_lock := gen_random_uuid();
  PERFORM public.revoke_workspace_staff_account_v1(
    workspace_a_id,
    retry_membership_id,
    owner_a_id,
    token_epoch,
    revoke_lock
  );
  IF public.find_workspace_staff_invite_auth_user_v1(
      workspace_a_id,
      retry_membership_id,
      owner_a_id,
      token_epoch,
      revoke_lock
    ) IS NOT NULL
  THEN
    RAISE EXCEPTION 'provider-free provisioning cleanup found an Auth user';
  END IF;
  IF NOT public.release_workspace_invite_delivery_claim(
      retry_membership_id, revoke_lock
    )
  THEN
    RAISE EXCEPTION 'provider-free provisioning cleanup did not release';
  END IF;
END;
$invite_and_revoke$;

DO $owner_transfer_and_floor$
DECLARE
  workspace_a_id UUID;
  owner_a_id UUID;
  admin_a_id UUID;
  owner_a_membership_id UUID;
  admin_a_membership_id UUID;
  member_a_membership_id UUID;
  token_epoch BIGINT := floor(EXTRACT(EPOCH FROM clock_timestamp()))::BIGINT;
  admin_fresh_epoch BIGINT;
  owner_fresh_epoch BIGINT;
  response JSONB;
  rejected BOOLEAN;
BEGIN
  SELECT value INTO workspace_a_id FROM goap_subagency_behavior_state
    WHERE key = 'workspace_a';
  SELECT value INTO owner_a_id FROM goap_subagency_behavior_state
    WHERE key = 'owner_a';
  SELECT value INTO admin_a_id FROM goap_subagency_behavior_state
    WHERE key = 'admin_a';
  SELECT value INTO owner_a_membership_id FROM goap_subagency_behavior_state
    WHERE key = 'owner_a_membership';
  SELECT value INTO admin_a_membership_id FROM goap_subagency_behavior_state
    WHERE key = 'admin_a_membership';
  SELECT value INTO member_a_membership_id FROM goap_subagency_behavior_state
    WHERE key = 'member_a_membership';

  PERFORM public.update_workspace_staff_role_v1(
    workspace_a_id,
    admin_a_membership_id,
    'member',
    owner_a_id,
    token_epoch
  );
  SELECT workspace_access_not_before_epoch
  INTO admin_fresh_epoch
  FROM public.workspace_memberships
  WHERE id = admin_a_membership_id;

  rejected := false;
  BEGIN
    PERFORM public.workspace_client_operation_v2(
      'list', workspace_a_id, NULL, '{}'::JSONB, admin_a_id, token_epoch
    );
  EXCEPTION WHEN SQLSTATE '42501' THEN
    rejected := true;
  END;
  IF NOT rejected THEN
    RAISE EXCEPTION 'role change accepted a stale administrator token';
  END IF;

  PERFORM public.update_workspace_staff_role_v1(
    workspace_a_id,
    admin_a_membership_id,
    'admin',
    owner_a_id,
    token_epoch
  );

  response := public.transfer_workspace_owner_v1(
    workspace_a_id,
    admin_a_membership_id,
    owner_a_id,
    token_epoch
  );

  IF response #>> '{owner,id}' <> admin_a_membership_id::TEXT
    OR response #>> '{owner,role}' <> 'owner'
    OR response #>> '{previous_owner,id}' <> owner_a_membership_id::TEXT
    OR response #>> '{previous_owner,role}' <> 'admin'
    OR (
      SELECT count(*)
      FROM public.workspace_memberships
      WHERE workspace_id = workspace_a_id
        AND role = 'owner'
        AND status IN ('provisioning', 'invited', 'active', 'suspended')
    ) <> 1
  THEN
    RAISE EXCEPTION 'workspace ownership transfer was not atomic';
  END IF;

  SELECT workspace_access_not_before_epoch
  INTO admin_fresh_epoch
  FROM public.workspace_memberships
  WHERE id = admin_a_membership_id;
  SELECT workspace_access_not_before_epoch
  INTO owner_fresh_epoch
  FROM public.workspace_memberships
  WHERE id = owner_a_membership_id;

  rejected := false;
  BEGIN
    PERFORM public.transfer_workspace_owner_v1(
      workspace_a_id,
      member_a_membership_id,
      owner_a_id,
      owner_fresh_epoch
    );
  EXCEPTION WHEN SQLSTATE '42501' THEN
    rejected := true;
  END;
  IF NOT rejected THEN
    RAISE EXCEPTION 'previous owner retained owner privileges';
  END IF;

  IF (public.workspace_staff_list_v1(
      workspace_a_id, admin_a_id, admin_fresh_epoch
    ) #>> '{capabilities,can_transfer_owner}') <> 'true'
  THEN
    RAISE EXCEPTION 'new owner could not manage workspace staff';
  END IF;

  rejected := false;
  BEGIN
    PERFORM public.claim_workspace_staff_auth_lifecycle_v1(
      workspace_a_id,
      admin_a_membership_id,
      'suspend',
      admin_a_id,
      admin_fresh_epoch,
      gen_random_uuid()
    );
  EXCEPTION WHEN SQLSTATE '42501' THEN
    rejected := true;
  END;
  IF NOT rejected THEN
    RAISE EXCEPTION 'final owner suspended itself';
  END IF;

  rejected := false;
  BEGIN
    PERFORM public.revoke_workspace_staff_account_v1(
      workspace_a_id,
      admin_a_membership_id,
      admin_a_id,
      admin_fresh_epoch,
      gen_random_uuid()
    );
  EXCEPTION WHEN SQLSTATE '42501' THEN
    rejected := true;
  END;
  IF NOT rejected THEN
    RAISE EXCEPTION 'final owner revoked itself';
  END IF;

  rejected := false;
  BEGIN
    UPDATE public.workspace_memberships
    SET role = 'admin'
    WHERE id = admin_a_membership_id;
    SET CONSTRAINTS ALL IMMEDIATE;
  EXCEPTION WHEN SQLSTATE '23514' THEN
    rejected := true;
  END;
  SET CONSTRAINTS ALL DEFERRED;
  IF NOT rejected THEN
    RAISE EXCEPTION 'deferred owner floor allowed final-owner demotion';
  END IF;

  rejected := false;
  BEGIN
    DELETE FROM public.workspace_memberships
    WHERE id = admin_a_membership_id;
    SET CONSTRAINTS ALL IMMEDIATE;
  EXCEPTION WHEN SQLSTATE '23514' THEN
    rejected := true;
  END;
  SET CONSTRAINTS ALL DEFERRED;
  IF NOT rejected THEN
    RAISE EXCEPTION 'deferred owner floor allowed final-owner deletion';
  END IF;

  IF (SELECT status FROM public.workspaces WHERE id = workspace_a_id) <> 'active'
  THEN
    RAISE EXCEPTION 'ownership transfer changed workspace lifecycle';
  END IF;
END;
$owner_transfer_and_floor$;

SET CONSTRAINTS ALL IMMEDIATE;

DO $final_state$
BEGIN
  IF EXISTS (SELECT 1 FROM public.workspace_auth_lifecycle_claims)
    OR EXISTS (SELECT 1 FROM public.workspace_invite_delivery_claims)
    OR EXISTS (SELECT 1 FROM public.workspace_account_credential_claims)
  THEN
    RAISE EXCEPTION 'behavior test left a durable provider claim unresolved';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.workspaces AS workspace
    WHERE NOT workspace.is_default
      AND workspace.status <> 'archived'
      AND 1 <> (
        SELECT count(*)
        FROM public.workspace_memberships AS membership
        WHERE membership.workspace_id = workspace.id
          AND membership.role = 'owner'
          AND membership.status IN (
            'provisioning', 'invited', 'active', 'suspended'
          )
      )
  ) THEN
    RAISE EXCEPTION 'final behavior state violates exactly-one-owner invariant';
  END IF;
END;
$final_state$;

ROLLBACK;
