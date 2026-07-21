-- Read-only verification for the invite-only workspace migrations.
-- Run after the complete 20260720 migration set, including webhook
-- idempotency hardening. Any failed invariant raises.

DO $$
DECLARE
  default_workspace_id UUID;
  null_client_count BIGINT;
  bootstrap_admin_count BIGINT;
  bootstrapped_membership_count BIGINT;
  owner_count BIGINT;
  matched_owner_count BIGINT;
  invalid_admin_role_count BIGINT;
  invalid_lifecycle_count BIGINT;
  invalid_private_workspace_count BIGINT;
  invalid_constraint_count BIGINT;
  invalid_portal_fk_count BIGINT;
  invalid_slug_count BIGINT;
  missing_workspace_policy_count BIGINT;
  missing_gate_count BIGINT;
  unsafe_view_count BIGINT;
  resend_function_definition TEXT;
  resend_suppressed_upsert_definition TEXT;
  null_action_rejected BOOLEAN := false;
  null_client_action_rejected BOOLEAN := false;
BEGIN
  SELECT id
  INTO default_workspace_id
  FROM public.workspaces
  WHERE slug = 'get-on-a-pod'
    AND is_default
    AND status = 'active';

  IF default_workspace_id IS NULL THEN
    RAISE EXCEPTION 'missing active default Get On A Pod workspace';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.admin_users
    WHERE NULLIF(btrim(email), '') IS NULL
  ) THEN
    RAISE EXCEPTION 'admin_users contains a blank platform-admin email';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conrelid = 'public.admin_users'::regclass
      AND conname = 'admin_users_email_nonblank_check'
      AND contype = 'c'
      AND convalidated
  ) OR NOT EXISTS (
    SELECT 1
    FROM pg_index AS index_definition
    JOIN pg_class AS index_relation
      ON index_relation.oid = index_definition.indexrelid
    WHERE index_definition.indrelid = 'public.admin_users'::regclass
      AND index_relation.relname = 'admin_users_email_normalized_uidx'
      AND index_definition.indisunique
      AND pg_get_indexdef(index_definition.indexrelid)
        ILIKE '%lower(btrim(email))%'
  ) THEN
    RAISE EXCEPTION 'admin email normalization constraints are missing or malformed';
  END IF;

  IF pg_get_functiondef('public.is_platform_admin()'::regprocedure)
      NOT ILIKE '%auth.uid() IS NOT NULL%'
    OR pg_get_functiondef('public.is_platform_admin()'::regprocedure)
      NOT ILIKE '%FROM auth.users%'
  THEN
    RAISE EXCEPTION 'is_platform_admin is not bound to the live Auth user';
  END IF;

  SELECT count(*)
  INTO null_client_count
  FROM public.clients
  WHERE workspace_id IS NULL;

  IF null_client_count <> 0 THEN
    RAISE EXCEPTION '% clients have no workspace_id', null_client_count;
  END IF;

  SELECT count(DISTINCT auth_user.id)
  INTO bootstrap_admin_count
  FROM public.admin_users AS admin_user
  JOIN auth.users AS auth_user
    ON lower(btrim(auth_user.email)) = lower(btrim(admin_user.email));

  IF bootstrap_admin_count = 0 THEN
    RAISE EXCEPTION 'no admin_users row matches a Supabase Auth user';
  END IF;

  SELECT count(DISTINCT membership.user_id)
  INTO bootstrapped_membership_count
  FROM public.workspace_memberships AS membership
  JOIN auth.users AS auth_user
    ON auth_user.id = membership.user_id
  JOIN public.admin_users AS admin_user
    ON lower(btrim(admin_user.email)) = lower(btrim(auth_user.email))
  WHERE membership.workspace_id = default_workspace_id
    AND membership.status = 'active';

  IF bootstrapped_membership_count <> bootstrap_admin_count THEN
    RAISE EXCEPTION
      'expected % bootstrapped admin memberships, found %',
      bootstrap_admin_count,
      bootstrapped_membership_count;
  END IF;

  SELECT count(*)
  INTO owner_count
  FROM public.workspace_memberships
  WHERE workspace_id = default_workspace_id
    AND role = 'owner'
    AND status = 'active'
    AND user_id IS NOT NULL;

  IF owner_count <> 1 THEN
    RAISE EXCEPTION 'expected exactly one active default-workspace owner, found %', owner_count;
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
  INTO matched_owner_count
  FROM public.workspace_memberships AS membership
  JOIN auth.users AS auth_user
    ON auth_user.id = membership.user_id
  JOIN public.admin_users AS admin_user
    ON lower(btrim(admin_user.email)) = lower(btrim(auth_user.email))
  WHERE membership.workspace_id = default_workspace_id
    AND membership.status = 'active'
    AND membership.role = 'owner';

  IF matched_owner_count <> 1 THEN
    RAISE EXCEPTION 'the default-workspace owner is not a platform administrator';
  END IF;

  SELECT count(*)
  INTO invalid_lifecycle_count
  FROM public.workspace_memberships AS membership
  WHERE (
      membership.status IN ('active', 'suspended')
      AND membership.user_id IS NULL
    )
    OR (
      membership.status = 'active'
      AND membership.accepted_at IS NULL
    )
    OR (
      membership.status = 'suspended'
      AND membership.suspended_at IS NULL
    )
    OR (
      membership.status = 'revoked'
      AND membership.revoked_at IS NULL
    );

  IF invalid_lifecycle_count <> 0 THEN
    RAISE EXCEPTION
      '% workspace memberships violate lifecycle invariants',
      invalid_lifecycle_count;
  END IF;

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

  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint AS constraint_definition
    WHERE constraint_definition.conrelid = 'public.clients'::regclass
      AND constraint_definition.conname = 'clients_workspace_id_fkey'
      AND constraint_definition.contype = 'f'
      AND constraint_definition.confrelid = 'public.workspaces'::regclass
      AND constraint_definition.confdeltype = 'r'
      AND constraint_definition.convalidated
      AND constraint_definition.conkey = ARRAY[
        (
          SELECT attribute.attnum
          FROM pg_attribute AS attribute
          WHERE attribute.attrelid = 'public.clients'::regclass
            AND attribute.attname = 'workspace_id'
            AND NOT attribute.attisdropped
        )
      ]::SMALLINT[]
  ) THEN
    RAISE EXCEPTION 'clients workspace FK is missing, invalid, or not ON DELETE RESTRICT';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint AS constraint_definition
    WHERE constraint_definition.conrelid = 'public.workspace_memberships'::regclass
      AND constraint_definition.conname = 'workspace_memberships_user_id_fkey'
      AND constraint_definition.contype = 'f'
      AND constraint_definition.confrelid = 'auth.users'::regclass
      AND constraint_definition.confdeltype = 'n'
      AND constraint_definition.convalidated
      AND constraint_definition.conkey = ARRAY[
        (
          SELECT attribute.attnum
          FROM pg_attribute AS attribute
          WHERE attribute.attrelid = 'public.workspace_memberships'::regclass
            AND attribute.attname = 'user_id'
            AND NOT attribute.attisdropped
        )
      ]::SMALLINT[]
  ) THEN
    RAISE EXCEPTION 'membership Auth-user FK is missing, invalid, or not ON DELETE SET NULL';
  END IF;

  SELECT count(*)
  INTO invalid_constraint_count
  FROM (VALUES
    ('workspace_memberships_live_user_check'),
    ('workspace_memberships_active_acceptance_check'),
    ('workspace_memberships_suspension_check'),
    ('workspace_memberships_revocation_check'),
    ('workspace_memberships_invite_expiry_check')
  ) AS required_constraint(constraint_name)
  WHERE NOT EXISTS (
    SELECT 1
    FROM pg_constraint AS constraint_definition
    WHERE constraint_definition.conrelid = 'public.workspace_memberships'::regclass
      AND constraint_definition.conname = required_constraint.constraint_name
      AND constraint_definition.contype = 'c'
      AND constraint_definition.convalidated
  );

  IF invalid_constraint_count <> 0 THEN
    RAISE EXCEPTION '% membership lifecycle constraints are missing or invalid', invalid_constraint_count;
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_index AS index_definition
    JOIN pg_class AS index_relation
      ON index_relation.oid = index_definition.indexrelid
    WHERE index_definition.indrelid = 'public.workspace_memberships'::regclass
      AND index_relation.relname = 'workspace_memberships_one_live_email_idx'
      AND index_definition.indisunique
      AND pg_get_expr(index_definition.indpred, index_definition.indrelid)
        ILIKE '%status%invited%active%suspended%'
  ) OR NOT EXISTS (
    SELECT 1
    FROM pg_index AS index_definition
    JOIN pg_class AS index_relation
      ON index_relation.oid = index_definition.indexrelid
    WHERE index_definition.indrelid = 'public.workspace_memberships'::regclass
      AND index_relation.relname = 'workspace_memberships_one_live_user_idx'
      AND index_definition.indisunique
      AND pg_get_expr(index_definition.indpred, index_definition.indrelid)
        ILIKE '%status%invited%active%suspended%'
  ) THEN
    RAISE EXCEPTION 'global one-live-membership indexes are missing or malformed';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'clients'
      AND column_name = 'workspace_id'
      AND is_nullable <> 'NO'
  ) THEN
    RAISE EXCEPTION 'clients.workspace_id is still nullable';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'clients'
      AND column_name = 'dashboard_enabled'
      AND is_nullable <> 'NO'
  ) OR NOT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'clients'
      AND column_name = 'dashboard_enabled'
  ) THEN
    RAISE EXCEPTION 'clients.dashboard_enabled is missing or nullable';
  END IF;

  IF has_table_privilege('anon', 'public.clients', 'SELECT')
     OR has_table_privilege('anon', 'public.clients', 'INSERT')
     OR has_table_privilege('anon', 'public.clients', 'UPDATE')
     OR has_table_privilege('anon', 'public.clients', 'DELETE') THEN
    RAISE EXCEPTION 'anon still has a direct privilege on public.clients';
  END IF;

  IF has_table_privilege('anon', 'public.bookings', 'SELECT')
     OR has_table_privilege('anon', 'public.bookings', 'INSERT')
     OR has_table_privilege('anon', 'public.bookings', 'UPDATE')
     OR has_table_privilege('anon', 'public.bookings', 'DELETE') THEN
    RAISE EXCEPTION 'anon still has a direct privilege on public.bookings';
  END IF;

  IF NOT has_table_privilege('authenticated', 'public.clients', 'SELECT')
     OR NOT has_table_privilege('authenticated', 'public.clients', 'INSERT')
     OR NOT has_table_privilege('authenticated', 'public.clients', 'UPDATE')
     OR NOT has_table_privilege('authenticated', 'public.clients', 'DELETE')
     OR NOT has_table_privilege('authenticated', 'public.bookings', 'SELECT')
     OR NOT has_table_privilege('authenticated', 'public.bookings', 'INSERT')
     OR NOT has_table_privilege('authenticated', 'public.bookings', 'UPDATE')
     OR NOT has_table_privilege('authenticated', 'public.bookings', 'DELETE') THEN
    RAISE EXCEPTION 'platform-admin browser grants on clients or bookings are incomplete';
  END IF;

  IF has_table_privilege('anon', 'public.client_dashboard_podcasts', 'SELECT')
     OR has_table_privilege('anon', 'public.client_podcast_feedback', 'SELECT')
     OR has_table_privilege('anon', 'public.client_podcast_feedback', 'INSERT')
     OR has_table_privilege('anon', 'public.client_podcast_feedback', 'UPDATE')
     OR has_table_privilege('anon', 'public.client_podcast_feedback', 'DELETE') THEN
    RAISE EXCEPTION 'anon still has direct client dashboard cache or feedback privileges';
  END IF;

  IF has_table_privilege('anon', 'public.prospect_dashboards', 'SELECT')
     OR has_table_privilege('anon', 'public.prospect_dashboard_podcasts', 'SELECT')
     OR has_table_privilege('anon', 'public.prospect_podcast_analyses', 'SELECT')
     OR has_table_privilege('anon', 'public.prospect_podcast_feedback', 'SELECT')
     OR has_table_privilege('anon', 'public.prospect_podcast_feedback', 'INSERT')
     OR has_table_privilege('anon', 'public.prospect_podcast_feedback', 'UPDATE') THEN
    RAISE EXCEPTION 'anon still has direct prospect dashboard or feedback privileges';
  END IF;

  IF has_table_privilege('anon', 'public.onboarding_sessions', 'SELECT')
     OR has_table_privilege('anon', 'public.onboarding_sessions', 'INSERT')
     OR has_table_privilege('anon', 'public.onboarding_sessions', 'UPDATE') THEN
    RAISE EXCEPTION 'anon still has direct onboarding session privileges';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'client_portal_activity_log'
      AND column_name = 'client_id'
      AND is_nullable <> 'YES'
  ) THEN
    RAISE EXCEPTION 'client portal activity cannot record unknown-account attempts';
  END IF;

  IF EXISTS (
    SELECT required_column.column_name
    FROM (VALUES
      ('portal_access_enabled', 'bool'),
      ('portal_last_login_at', 'timestamptz'),
      ('portal_invitation_sent_at', 'timestamptz'),
      ('portal_password', 'text'),
      ('password_set_at', 'timestamptz'),
      ('password_set_by', 'text'),
      ('portal_email_normalized', 'text')
    ) AS required_column(column_name, expected_type)
    WHERE NOT EXISTS (
      SELECT 1
      FROM information_schema.columns AS existing_column
      WHERE existing_column.table_schema = 'public'
        AND existing_column.table_name = 'clients'
        AND existing_column.column_name = required_column.column_name
        AND existing_column.udt_name = required_column.expected_type
    )
  ) THEN
    RAISE EXCEPTION 'one or more client portal columns are missing or malformed';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'clients'
      AND column_name = 'portal_email_normalized'
      AND is_generated = 'ALWAYS'
      AND generation_expression ILIKE '%lower%btrim%email%'
  ) OR NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conrelid = 'public.clients'::regclass
      AND conname = 'clients_portal_access_email_check'
      AND contype = 'c'
      AND convalidated
  ) OR NOT EXISTS (
    SELECT 1
    FROM pg_index AS index_definition
    JOIN pg_class AS index_relation
      ON index_relation.oid = index_definition.indexrelid
    WHERE index_definition.indrelid = 'public.clients'::regclass
      AND index_relation.relname = 'clients_one_enabled_portal_email_idx'
      AND index_definition.indisunique
      AND pg_get_indexdef(index_definition.indexrelid)
        ILIKE '%portal_email_normalized%portal_access_enabled%'
  ) THEN
    RAISE EXCEPTION 'enabled portal email identity is not normalized and unique';
  END IF;

  SELECT count(*)
  INTO invalid_portal_fk_count
  FROM (VALUES
    ('client_portal_tokens', 'client_portal_tokens_client_id_fkey'),
    ('client_portal_sessions', 'client_portal_sessions_client_id_fkey'),
    ('client_portal_activity_log', 'client_portal_activity_log_client_id_fkey'),
    ('client_portal_credentials', 'client_portal_credentials_client_id_fkey')
  ) AS required_fk(table_name, constraint_name)
  WHERE NOT EXISTS (
    SELECT 1
    FROM pg_constraint AS constraint_definition
    WHERE constraint_definition.conrelid = format(
        'public.%I',
        required_fk.table_name
      )::regclass
      AND constraint_definition.conname = required_fk.constraint_name
      AND constraint_definition.contype = 'f'
      AND constraint_definition.confrelid = 'public.clients'::regclass
      AND constraint_definition.confdeltype = 'c'
      AND constraint_definition.convalidated
      AND constraint_definition.conkey = ARRAY[
        (
          SELECT attribute.attnum
          FROM pg_attribute AS attribute
          WHERE attribute.attrelid = format(
              'public.%I',
              required_fk.table_name
            )::regclass
            AND attribute.attname = 'client_id'
            AND NOT attribute.attisdropped
        )
      ]::SMALLINT[]
  );

  IF invalid_portal_fk_count <> 0 THEN
    RAISE EXCEPTION '% client portal client FKs are missing or invalid', invalid_portal_fk_count;
  END IF;

  IF EXISTS (
    SELECT 1
    FROM (VALUES
      ('client_portal_tokens'),
      ('client_portal_sessions'),
      ('client_portal_activity_log')
    ) AS portal_table(table_name)
    CROSS JOIN (VALUES ('anon'), ('authenticated')) AS browser_role(role_name)
    CROSS JOIN (VALUES
      ('SELECT'), ('INSERT'), ('UPDATE'), ('DELETE'),
      ('TRUNCATE'), ('REFERENCES'), ('TRIGGER')
    ) AS table_privilege(privilege_name)
    WHERE has_table_privilege(
      browser_role.role_name::name,
      format('public.%I', portal_table.table_name)::regclass,
      table_privilege.privilege_name
    )
  ) OR EXISTS (
    SELECT 1
    FROM (VALUES
      ('client_portal_tokens'),
      ('client_portal_sessions'),
      ('client_portal_activity_log')
    ) AS portal_table(table_name)
    CROSS JOIN (VALUES
      ('SELECT'), ('INSERT'), ('UPDATE'), ('DELETE')
    ) AS required_privilege(privilege_name)
    WHERE NOT has_table_privilege(
      'service_role',
      format('public.%I', portal_table.table_name)::regclass,
      required_privilege.privilege_name
    )
  ) THEN
    RAISE EXCEPTION 'client portal security-table grants are unsafe';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM (VALUES
      ('client_portal_tokens', 'Admin full access to portal tokens'),
      ('client_portal_sessions', 'Admin full access to portal sessions'),
      ('client_portal_activity_log', 'Admin full access to activity logs')
    ) AS legacy_policy(table_name, policy_name)
    JOIN pg_policies AS policy
      ON policy.schemaname = 'public'
      AND policy.tablename = legacy_policy.table_name
      AND policy.policyname = legacy_policy.policy_name
  ) THEN
    RAISE EXCEPTION 'a legacy permissive client portal security-table policy still exists';
  END IF;

  IF to_regclass('public.client_portal_credentials') IS NULL THEN
    RAISE EXCEPTION 'server-only client portal credential table is missing';
  END IF;

  -- The final catalog cannot reveal whether a once-valid server verifier was
  -- paired with retired plaintext before cutover. Release review must also
  -- statically require migration 003 to delete that mixed credential before
  -- clients.portal_password is cleared.

  IF EXISTS (
    SELECT 1
    FROM public.client_portal_credentials
    WHERE CASE
      WHEN password_verifier ~
        '^pbkdf2_sha256\$[0-9]{6,7}\$[A-Za-z0-9+/]{22}==\$[A-Za-z0-9+/]{43}=$'
        THEN split_part(password_verifier, '$', 2)::BIGINT
          NOT BETWEEN 100000 AND 1000000
      ELSE true
    END
  ) OR NOT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'client_portal_credentials'
      AND column_name = 'password_verifier'
      AND data_type = 'text'
      AND is_nullable = 'NO'
  ) OR NOT EXISTS (
    SELECT 1
    FROM pg_constraint AS constraint_definition
    WHERE constraint_definition.conrelid = 'public.client_portal_credentials'::regclass
      AND constraint_definition.conname = 'client_portal_credentials_pbkdf2_check'
      AND constraint_definition.contype = 'c'
      AND constraint_definition.convalidated
      AND pg_get_constraintdef(constraint_definition.oid)
        ILIKE '%password_verifier%pbkdf2_sha256%22%43%'
      AND pg_get_constraintdef(constraint_definition.oid)
        ILIKE '%split_part%100000%1000000%'
  ) THEN
    RAISE EXCEPTION 'portal credentials are not PBKDF2-only at rest';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.clients
    WHERE portal_password IS NOT NULL
  ) THEN
    RAISE EXCEPTION 'a portal verifier remains exposed on public.clients';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint AS constraint_definition
    WHERE constraint_definition.conrelid = 'public.clients'::regclass
      AND constraint_definition.conname = 'clients_portal_password_retired_check'
      AND constraint_definition.contype = 'c'
      AND constraint_definition.convalidated
      AND pg_get_constraintdef(constraint_definition.oid)
        ILIKE '%portal_password IS NULL%'
  ) THEN
    RAISE EXCEPTION 'clients.portal_password retirement is not enforced';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.client_portal_sessions
    WHERE session_token IS NULL
      OR session_token !~ '^sha256\$[A-Za-z0-9+/]{43}=$'
  ) OR NOT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'client_portal_sessions'
      AND column_name = 'session_token'
      AND data_type = 'text'
      AND is_nullable = 'NO'
  ) OR NOT EXISTS (
    SELECT 1
    FROM pg_constraint AS constraint_definition
    WHERE constraint_definition.conrelid = 'public.client_portal_sessions'::regclass
      AND constraint_definition.conname = 'client_portal_sessions_hashed_token_check'
      AND constraint_definition.contype = 'c'
      AND constraint_definition.convalidated
      AND pg_get_constraintdef(constraint_definition.oid)
        ILIKE '%session_token%sha256%43%'
  ) OR NOT EXISTS (
    SELECT 1
    FROM pg_index AS index_definition
    WHERE index_definition.indrelid = 'public.client_portal_sessions'::regclass
      AND index_definition.indisunique
      AND index_definition.indisvalid
      AND pg_get_indexdef(index_definition.indexrelid)
        ILIKE '%(session_token)%'
  ) THEN
    RAISE EXCEPTION 'portal sessions are not unique and hash-only at rest';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM pg_policies AS policy
    WHERE policy.schemaname = 'public'
      AND (
        policy.policyname = 'Clients can view their own podcast fit analyses'
        OR (
          (
            COALESCE(policy.qual, '') || ' ' || COALESCE(policy.with_check, '')
          ) ILIKE '%session_token%'
          AND (
            COALESCE(policy.qual, '') || ' ' || COALESCE(policy.with_check, '')
          ) ILIKE '%request.headers%'
        )
      )
  ) THEN
    RAISE EXCEPTION
      'a public RLS policy still treats a stored session verifier as a request bearer';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_class
    WHERE oid = 'public.client_portal_credentials'::regclass
      AND relrowsecurity
  ) OR EXISTS (
    SELECT 1
    FROM (VALUES ('anon'), ('authenticated')) AS browser_role(role_name)
    CROSS JOIN (VALUES
      ('SELECT'), ('INSERT'), ('UPDATE'), ('DELETE'),
      ('TRUNCATE'), ('REFERENCES'), ('TRIGGER')
    ) AS table_privilege(privilege_name)
    WHERE has_table_privilege(
      browser_role.role_name::name,
      'public.client_portal_credentials',
      table_privilege.privilege_name
    )
  ) OR EXISTS (
    SELECT 1
    FROM (VALUES
      ('SELECT'), ('INSERT'), ('UPDATE'), ('DELETE')
    ) AS required_privilege(privilege_name)
    WHERE NOT has_table_privilege(
      'service_role',
      'public.client_portal_credentials',
      required_privilege.privilege_name
    )
  ) THEN
    RAISE EXCEPTION 'client portal credential RLS or grants are unsafe';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_trigger AS trigger_definition
    WHERE trigger_definition.tgrelid = 'public.clients'::regclass
      AND trigger_definition.tgname = 'clients_guard_internal_fields'
      AND NOT trigger_definition.tgisinternal
      AND trigger_definition.tgenabled <> 'D'
      AND pg_get_triggerdef(trigger_definition.oid)
        ILIKE '%guard_client_internal_fields%'
      AND pg_get_triggerdef(trigger_definition.oid)
        ILIKE '%AFTER INSERT OR UPDATE%'
  ) OR pg_get_functiondef(
    'public.guard_client_internal_fields()'::regprocedure
  ) NOT ILIKE '%to_jsonb%'
    OR pg_get_functiondef(
      'public.guard_client_internal_fields()'::regprocedure
    ) NOT ILIKE '%is_platform_admin%'
    OR EXISTS (
      SELECT 1
      FROM pg_proc
      WHERE oid = 'public.guard_client_internal_fields()'::regprocedure
        AND prosecdef
    )
  THEN
    RAISE EXCEPTION 'tenant client-column mutation guard is missing or malformed';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_trigger AS trigger_definition
    WHERE trigger_definition.tgrelid = 'public.clients'::regclass
      AND trigger_definition.tgname = 'clients_revoke_portal_access_artifacts'
      AND NOT trigger_definition.tgisinternal
      AND trigger_definition.tgenabled <> 'D'
      AND pg_get_triggerdef(trigger_definition.oid)
        ILIKE '%BEFORE UPDATE%revoke_client_portal_access_artifacts%'
      AND pg_get_triggerdef(trigger_definition.oid)
        ILIKE '%portal_access_enabled%'
      AND pg_get_triggerdef(trigger_definition.oid)
        ILIKE '%email%'
  ) OR NOT EXISTS (
    SELECT 1
    FROM pg_proc AS function_definition
    WHERE function_definition.oid =
        'public.revoke_client_portal_access_artifacts()'::regprocedure
      AND function_definition.prosecdef
      AND EXISTS (
        SELECT 1
        FROM unnest(
          COALESCE(function_definition.proconfig, ARRAY[]::TEXT[])
        ) AS setting(value)
        WHERE setting.value IN ('search_path=', 'search_path=""')
      )
  ) OR pg_get_functiondef(
    'public.revoke_client_portal_access_artifacts()'::regprocedure
  ) NOT ILIKE '%OLD.email%IS DISTINCT FROM%NEW.email%DELETE FROM public.client_portal_credentials%NEW.portal_access_enabled := false%NEW.portal_password := NULL%NEW.password_set_at := NULL%NEW.password_set_by := NULL%DELETE FROM public.client_portal_sessions%DELETE FROM public.client_portal_tokens%ELSIF%OLD.portal_access_enabled%NEW.portal_access_enabled%'
    OR EXISTS (
      SELECT 1
      FROM pg_trigger AS trigger_definition
      WHERE trigger_definition.tgrelid = 'public.clients'::regclass
        AND trigger_definition.tgname = 'clients_revoke_portal_sessions_on_disable'
        AND NOT trigger_definition.tgisinternal
    )
    OR to_regprocedure(
      'public.revoke_client_portal_sessions_on_disable()'
    ) IS NOT NULL
  THEN
    RAISE EXCEPTION 'portal identity changes do not revoke all access artifacts';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.client_portal_sessions AS session
    JOIN public.clients AS client
      ON client.id = session.client_id
    WHERE NOT COALESCE(client.portal_access_enabled, false)
  ) OR EXISTS (
    SELECT 1
    FROM public.client_portal_tokens AS token
    JOIN public.clients AS client
      ON client.id = token.client_id
    WHERE NOT COALESCE(client.portal_access_enabled, false)
  ) THEN
    RAISE EXCEPTION 'a disabled client portal retains sessions or tokens';
  END IF;

  IF EXISTS (SELECT 1 FROM public.client_portal_tokens) THEN
    RAISE EXCEPTION 'retired client-portal magic-link tokens remain at cutover';
  END IF;

  -- Final values cannot prove that a pre-cutover capability which already had
  -- a strong-looking suffix was actually rotated. Release source review must
  -- additionally require migration 003 to update every non-NULL client slug,
  -- select every prospect dashboard into its rotation map without a filter,
  -- and rewrite client-to-prospect references from that same map.

  SELECT count(*)
  INTO invalid_slug_count
  FROM public.clients
  WHERE dashboard_slug IS NOT NULL
    AND dashboard_slug !~ '-[0-9a-f]{24}$';

  IF invalid_slug_count <> 0 THEN
    RAISE EXCEPTION '% client dashboard slugs retain a weak legacy format', invalid_slug_count;
  END IF;

  SELECT count(*)
  INTO invalid_slug_count
  FROM public.prospect_dashboards
  WHERE slug IS NULL
    OR slug !~ '^prospect-[0-9a-f]{24}$';

  IF invalid_slug_count <> 0 THEN
    RAISE EXCEPTION '% prospect dashboard slugs retain a weak legacy format', invalid_slug_count;
  END IF;

  SELECT count(*)
  INTO invalid_slug_count
  FROM public.clients
  WHERE prospect_dashboard_slug IS NOT NULL
    AND prospect_dashboard_slug !~ '^prospect-[0-9a-f]{24}$';

  IF invalid_slug_count <> 0 THEN
    RAISE EXCEPTION
      '% client-to-prospect slug references retain a weak legacy format',
      invalid_slug_count;
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_index AS index_definition
    WHERE index_definition.indrelid = 'public.clients'::regclass
      AND index_definition.indisunique
      AND index_definition.indisvalid
      AND pg_get_indexdef(index_definition.indexrelid)
        ILIKE '%(dashboard_slug)%'
  ) OR NOT EXISTS (
    SELECT 1
    FROM pg_index AS index_definition
    WHERE index_definition.indrelid = 'public.prospect_dashboards'::regclass
      AND index_definition.indisunique
      AND index_definition.indisvalid
      AND pg_get_indexdef(index_definition.indexrelid)
        ILIKE '%(slug)%'
  ) THEN
    RAISE EXCEPTION 'dashboard capability slugs are not protected by unique indexes';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_trigger AS trigger_definition
    WHERE trigger_definition.tgrelid = 'public.clients'::regclass
      AND trigger_definition.tgname = 'trigger_generate_client_dashboard_slug'
      AND NOT trigger_definition.tgisinternal
      AND trigger_definition.tgenabled <> 'D'
      AND pg_get_triggerdef(trigger_definition.oid)
        ILIKE '%BEFORE INSERT OR UPDATE%generate_client_dashboard_slug%'
      AND pg_get_triggerdef(trigger_definition.oid)
        ILIKE '%name%'
      AND pg_get_triggerdef(trigger_definition.oid)
        ILIKE '%dashboard_slug%'
  ) OR pg_get_functiondef(
    'public.generate_client_dashboard_slug()'::regprocedure
  ) NOT ILIKE '%auth.role()%substring%gen_random_uuid()%1, 24%'
    OR has_function_privilege(
      'anon',
      'public.generate_client_dashboard_slug()',
      'EXECUTE'
    )
    OR has_function_privilege(
      'authenticated',
      'public.generate_client_dashboard_slug()',
      'EXECUTE'
    )
  THEN
    RAISE EXCEPTION 'client dashboard capability-slug generation is missing or unsafe';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_trigger AS trigger_definition
    WHERE trigger_definition.tgrelid = 'public.prospect_dashboards'::regclass
      AND trigger_definition.tgname = 'prospect_dashboards_generate_capability_slug'
      AND NOT trigger_definition.tgisinternal
      AND trigger_definition.tgenabled <> 'D'
      AND pg_get_triggerdef(trigger_definition.oid)
        ILIKE '%BEFORE INSERT OR UPDATE OF slug%generate_prospect_dashboard_capability_slug%'
  ) OR pg_get_functiondef(
    'public.generate_prospect_dashboard_capability_slug()'::regprocedure
  ) NOT ILIKE '%prospect-%substring%gen_random_uuid()%1, 24%'
    OR has_function_privilege(
      'anon',
      'public.generate_prospect_dashboard_capability_slug()',
      'EXECUTE'
    )
    OR has_function_privilege(
      'authenticated',
      'public.generate_prospect_dashboard_capability_slug()',
      'EXECUTE'
    )
  THEN
    RAISE EXCEPTION 'prospect dashboard capability-slug generation is missing or unsafe';
  END IF;

  SELECT count(*)
  INTO missing_workspace_policy_count
  FROM (VALUES
    ('workspaces', 'workspaces_authenticated_select', 'can_access_workspace'),
    ('workspace_memberships', 'workspace_memberships_authenticated_select', 'auth.uid'),
    ('workspace_audit_log', 'workspace_audit_log_authenticated_select', 'is_platform_admin')
  ) AS required_policy(table_name, policy_name, expression_marker)
  WHERE NOT EXISTS (
    SELECT 1
    FROM pg_policies AS policy
    WHERE policy.schemaname = 'public'
      AND policy.tablename = required_policy.table_name
      AND policy.policyname = required_policy.policy_name
      AND policy.permissive = 'PERMISSIVE'
      AND policy.cmd = 'SELECT'
      AND policy.roles = ARRAY['authenticated'::name]
      AND COALESCE(policy.qual, '') ILIKE '%' || required_policy.expression_marker || '%'
  );

  IF missing_workspace_policy_count <> 0 THEN
    RAISE EXCEPTION
      '% workspace metadata SELECT policies are missing or malformed',
      missing_workspace_policy_count;
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_policies AS policy
    WHERE policy.schemaname = 'public'
      AND policy.tablename = 'workspaces'
      AND policy.policyname = 'workspaces_authenticated_select'
      AND COALESCE(policy.qual, '') ILIKE '%is_platform_admin%'
  ) OR NOT EXISTS (
    SELECT 1
    FROM pg_policies AS policy
    WHERE policy.schemaname = 'public'
      AND policy.tablename = 'workspace_memberships'
      AND policy.policyname = 'workspace_memberships_authenticated_select'
      AND COALESCE(policy.qual, '') ILIKE '%is_platform_admin%'
  ) THEN
    RAISE EXCEPTION 'platform-admin workspace metadata access is missing';
  END IF;

  SELECT count(*)
  INTO missing_workspace_policy_count
  FROM (VALUES
    ('clients', 'clients_workspace_select', 'PERMISSIVE', 'SELECT', 'is_platform_admin', NULL),
    ('clients', 'clients_workspace_select_isolation', 'RESTRICTIVE', 'SELECT', 'is_platform_admin', NULL),
    ('clients', 'clients_workspace_insert', 'PERMISSIVE', 'INSERT', NULL, 'is_platform_admin'),
    ('clients', 'clients_workspace_insert_isolation', 'RESTRICTIVE', 'INSERT', NULL, 'is_platform_admin'),
    ('clients', 'clients_workspace_update', 'PERMISSIVE', 'UPDATE', 'is_platform_admin', 'is_platform_admin'),
    ('clients', 'clients_workspace_update_isolation', 'RESTRICTIVE', 'UPDATE', 'is_platform_admin', 'is_platform_admin'),
    ('clients', 'clients_workspace_delete', 'PERMISSIVE', 'DELETE', 'is_platform_admin', NULL),
    ('clients', 'clients_workspace_delete_isolation', 'RESTRICTIVE', 'DELETE', 'is_platform_admin', NULL),
    ('bookings', 'bookings_workspace_select', 'PERMISSIVE', 'SELECT', 'is_platform_admin', NULL),
    ('bookings', 'bookings_workspace_select_isolation', 'RESTRICTIVE', 'SELECT', 'is_platform_admin', NULL),
    ('bookings', 'bookings_workspace_insert', 'PERMISSIVE', 'INSERT', NULL, 'is_platform_admin'),
    ('bookings', 'bookings_workspace_insert_isolation', 'RESTRICTIVE', 'INSERT', NULL, 'is_platform_admin'),
    ('bookings', 'bookings_workspace_update', 'PERMISSIVE', 'UPDATE', 'is_platform_admin', 'is_platform_admin'),
    ('bookings', 'bookings_workspace_update_isolation', 'RESTRICTIVE', 'UPDATE', 'is_platform_admin', 'is_platform_admin'),
    ('bookings', 'bookings_workspace_delete', 'PERMISSIVE', 'DELETE', 'is_platform_admin', NULL),
    ('bookings', 'bookings_workspace_delete_isolation', 'RESTRICTIVE', 'DELETE', 'is_platform_admin', NULL)
  ) AS required_policy(
    table_name,
    policy_name,
    policy_mode,
    command_name,
    using_marker,
    check_marker
  )
  WHERE NOT EXISTS (
    SELECT 1
    FROM pg_policies AS policy
    WHERE policy.schemaname = 'public'
      AND policy.tablename = required_policy.table_name
      AND policy.policyname = required_policy.policy_name
      AND policy.permissive = required_policy.policy_mode
      AND policy.cmd = required_policy.command_name
      AND policy.roles = ARRAY['authenticated'::name]
      AND (
        required_policy.using_marker IS NULL
        OR COALESCE(policy.qual, '') ILIKE '%' || required_policy.using_marker || '%'
      )
      AND (
        required_policy.check_marker IS NULL
        OR COALESCE(policy.with_check, '') ILIKE '%' || required_policy.check_marker || '%'
      )
  );

  IF missing_workspace_policy_count <> 0 THEN
    RAISE EXCEPTION
      '% direct client/booking platform-admin policies are missing or malformed',
      missing_workspace_policy_count;
  END IF;

  IF EXISTS (
    SELECT 1
    FROM pg_class AS relation
    JOIN pg_namespace AS namespace
      ON namespace.oid = relation.relnamespace
    WHERE namespace.nspname = 'public'
      AND relation.relname IN (
        'workspaces',
        'workspace_memberships',
        'workspace_audit_log',
        'clients',
        'bookings'
      )
      AND NOT relation.relrowsecurity
  ) THEN
    RAISE EXCEPTION 'one or more workspace boundary tables do not have RLS enabled';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_trigger AS trigger_definition
    JOIN pg_proc AS trigger_function
      ON trigger_function.oid = trigger_definition.tgfoid
    WHERE trigger_definition.tgrelid = 'public.workspace_audit_log'::regclass
      AND trigger_definition.tgname = 'workspace_audit_log_append_only'
      AND trigger_definition.tgenabled <> 'D'
      AND (trigger_definition.tgtype & 1) = 1
      AND (trigger_definition.tgtype & 2) = 2
      AND (trigger_definition.tgtype & 8) = 8
      AND (trigger_definition.tgtype & 16) = 16
      AND trigger_function.proname = 'prevent_workspace_audit_mutation'
  ) THEN
    RAISE EXCEPTION 'workspace audit append-only trigger is missing or disabled';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_trigger AS trigger_definition
    JOIN pg_proc AS trigger_function
      ON trigger_function.oid = trigger_definition.tgfoid
    WHERE trigger_definition.tgrelid = 'public.workspace_memberships'::regclass
      AND trigger_definition.tgname = 'workspace_memberships_enforce_private_single_live'
      AND trigger_definition.tgenabled <> 'D'
      AND (trigger_definition.tgtype & 1) = 1
      AND (trigger_definition.tgtype & 2) = 2
      AND (trigger_definition.tgtype & 4) = 4
      AND (trigger_definition.tgtype & 16) = 16
      AND trigger_function.proname = 'enforce_private_workspace_single_live_member'
  ) THEN
    RAISE EXCEPTION 'private-workspace single-member trigger is missing or disabled';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM pg_constraint AS constraint_definition
    WHERE constraint_definition.conrelid = 'public.workspace_audit_log'::regclass
      AND constraint_definition.contype = 'f'
      AND ARRAY[
        (
          SELECT attribute.attnum
          FROM pg_attribute AS attribute
          WHERE attribute.attrelid = 'public.workspace_audit_log'::regclass
            AND attribute.attname = 'actor_user_id'
            AND NOT attribute.attisdropped
        )
      ]::SMALLINT[] <@ constraint_definition.conkey
  ) THEN
    RAISE EXCEPTION 'workspace audit actor must not have a mutating Auth FK';
  END IF;

  IF has_table_privilege('service_role', 'public.workspace_audit_log', 'UPDATE')
     OR has_table_privilege('service_role', 'public.workspace_audit_log', 'DELETE')
     OR has_table_privilege('service_role', 'public.workspace_audit_log', 'TRUNCATE')
     OR has_table_privilege('authenticated', 'public.workspace_audit_log', 'INSERT')
     OR has_table_privilege('authenticated', 'public.workspace_audit_log', 'UPDATE')
     OR has_table_privilege('authenticated', 'public.workspace_audit_log', 'DELETE')
     OR has_table_privilege('anon', 'public.workspace_audit_log', 'INSERT') THEN
    RAISE EXCEPTION 'workspace audit table grants are not append-only';
  END IF;

  IF has_table_privilege('anon', 'public.workspaces', 'SELECT')
     OR has_table_privilege('anon', 'public.workspace_memberships', 'SELECT')
     OR has_table_privilege('anon', 'public.workspace_audit_log', 'SELECT') THEN
    RAISE EXCEPTION 'anon can read workspace metadata or audit tables';
  END IF;

  SELECT count(*)
  INTO missing_gate_count
  FROM pg_class AS relation
  JOIN pg_namespace AS namespace
    ON namespace.oid = relation.relnamespace
  WHERE namespace.nspname = 'public'
    AND relation.relkind IN ('r', 'p')
    AND relation.relname NOT IN (
      'workspaces',
      'workspace_memberships',
      'workspace_audit_log',
      'clients',
      'bookings',
      'client_portal_credentials',
      'resend_webhook_events'
    )
    AND NOT EXISTS (
      SELECT 1
      FROM pg_depend AS dependency
      WHERE dependency.classid = 'pg_class'::regclass
        AND dependency.objid = relation.oid
        AND dependency.deptype = 'e'
    )
    AND (
      NOT relation.relrowsecurity
      OR NOT EXISTS (
        SELECT 1
        FROM pg_policies AS policy
        WHERE policy.schemaname = namespace.nspname
          AND policy.tablename = relation.relname
          AND policy.policyname = 'workspace_transition_platform_admin_allow'
          AND policy.permissive = 'PERMISSIVE'
          AND policy.cmd = 'ALL'
          AND policy.roles = ARRAY['authenticated'::name]
          AND COALESCE(policy.qual, '') ILIKE '%is_platform_admin%'
          AND COALESCE(policy.with_check, '') ILIKE '%is_platform_admin%'
      )
      OR NOT EXISTS (
        SELECT 1
        FROM pg_policies AS policy
        WHERE policy.schemaname = namespace.nspname
          AND policy.tablename = relation.relname
          AND policy.policyname = 'workspace_transition_platform_admin_select_gate'
          AND policy.permissive = 'RESTRICTIVE'
          AND policy.cmd = 'SELECT'
          AND policy.roles @> ARRAY['anon'::name, 'authenticated'::name]
          AND COALESCE(policy.qual, '') ILIKE '%is_platform_admin%'
      )
      OR EXISTS (
        SELECT required_write_policy.policy_name
        FROM (VALUES
          ('workspace_transition_platform_admin_insert_gate', 'INSERT'),
          ('workspace_transition_platform_admin_update_gate', 'UPDATE'),
          ('workspace_transition_platform_admin_delete_gate', 'DELETE')
        ) AS required_write_policy(policy_name, command_name)
        WHERE NOT EXISTS (
          SELECT 1
          FROM pg_policies AS policy
          WHERE policy.schemaname = namespace.nspname
            AND policy.tablename = relation.relname
            AND policy.policyname = required_write_policy.policy_name
            AND policy.permissive = 'RESTRICTIVE'
            AND policy.cmd = required_write_policy.command_name
            AND policy.roles @> ARRAY['anon'::name, 'authenticated'::name]
            AND COALESCE(policy.qual, policy.with_check, '') ILIKE '%is_platform_admin%'
        )
      )
      OR (
        relation.relname IN (
          'blog_categories',
          'blog_posts',
          'guest_resources',
          'testimonials'
        )
        AND (
          NOT has_table_privilege('anon', relation.oid, 'SELECT')
          OR NOT has_table_privilege('authenticated', relation.oid, 'SELECT')
          OR NOT EXISTS (
            SELECT 1
            FROM pg_policies AS policy
            WHERE policy.schemaname = namespace.nspname
              AND policy.tablename = relation.relname
              AND policy.policyname = 'workspace_transition_public_read_allow'
              AND policy.permissive = 'PERMISSIVE'
              AND policy.cmd = 'SELECT'
              AND policy.roles @> ARRAY['anon'::name, 'authenticated'::name]
              AND CASE relation.relname
                WHEN 'blog_posts' THEN COALESCE(policy.qual, '') ILIKE '%status%=%published%'
                WHEN 'testimonials' THEN COALESCE(policy.qual, '') ILIKE '%is_active%=%true%'
                ELSE COALESCE(policy.qual, '') ILIKE '%true%'
              END
          )
          OR NOT EXISTS (
            SELECT 1
            FROM pg_policies AS policy
            WHERE policy.schemaname = namespace.nspname
              AND policy.tablename = relation.relname
              AND policy.policyname = 'workspace_transition_platform_admin_select_gate'
              AND policy.permissive = 'RESTRICTIVE'
              AND policy.cmd = 'SELECT'
              AND policy.roles @> ARRAY['anon'::name, 'authenticated'::name]
              AND COALESCE(policy.qual, '') ILIKE '%is_platform_admin%'
              AND CASE relation.relname
                WHEN 'blog_posts' THEN COALESCE(policy.qual, '') ILIKE '%status%=%published%'
                WHEN 'testimonials' THEN COALESCE(policy.qual, '') ILIKE '%is_active%=%true%'
                ELSE COALESCE(policy.qual, '') ILIKE '%true%'
              END
          )
        )
      )
      OR (
        relation.relname NOT IN (
          'blog_categories',
          'blog_posts',
          'guest_resources',
          'testimonials'
        )
        AND (
          has_table_privilege('anon', relation.oid, 'SELECT')
          OR EXISTS (
            SELECT 1
            FROM pg_policies AS policy
            WHERE policy.schemaname = namespace.nspname
              AND policy.tablename = relation.relname
              AND policy.policyname = 'workspace_transition_public_read_allow'
          )
        )
      )
    );

  IF missing_gate_count <> 0 THEN
    RAISE EXCEPTION
      '% RLS tables lack containment gates or violate the public-read allowlist',
      missing_gate_count;
  END IF;

  SELECT count(*)
  INTO unsafe_view_count
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
    AND NOT COALESCE(
      relation.reloptions @> ARRAY['security_invoker=true']::TEXT[],
      false
    );

  IF unsafe_view_count <> 0 THEN
    RAISE EXCEPTION '% public views are not security-invoker', unsafe_view_count;
  END IF;

  IF to_regclass('storage.objects') IS NOT NULL AND EXISTS (
    SELECT required_policy.policy_name
    FROM (VALUES
      ('workspace_transition_platform_admin_insert_gate', 'INSERT', false, true),
      ('workspace_transition_platform_admin_update_gate', 'UPDATE', true, true),
      ('workspace_transition_platform_admin_delete_gate', 'DELETE', true, false)
    ) AS required_policy(policy_name, command_name, requires_using, requires_check)
    WHERE NOT EXISTS (
      SELECT 1
      FROM pg_policies AS policy
      WHERE policy.schemaname = 'storage'
        AND policy.tablename = 'objects'
        AND policy.policyname = required_policy.policy_name
        AND policy.permissive = 'RESTRICTIVE'
        AND policy.cmd = required_policy.command_name
        AND policy.roles @> ARRAY['anon'::name, 'authenticated'::name]
        AND (
          NOT required_policy.requires_using
          OR COALESCE(policy.qual, '') ILIKE '%is_platform_admin%'
        )
        AND (
          NOT required_policy.requires_check
          OR COALESCE(policy.with_check, '') ILIKE '%is_platform_admin%'
        )
    )
  ) THEN
    RAISE EXCEPTION 'storage.objects lacks a valid browser-role platform-admin write gate';
  END IF;

  IF to_regclass('public.resend_webhook_events') IS NULL THEN
    RAISE EXCEPTION 'Resend webhook receipt ledger is missing';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint AS constraint_definition
    WHERE constraint_definition.conrelid = 'public.resend_webhook_events'::regclass
      AND constraint_definition.contype = 'p'
      AND constraint_definition.convalidated
      AND constraint_definition.conkey = ARRAY[
        (
          SELECT attribute.attnum
          FROM pg_attribute AS attribute
          WHERE attribute.attrelid = 'public.resend_webhook_events'::regclass
            AND attribute.attname = 'svix_id'
            AND NOT attribute.attisdropped
        )
      ]::SMALLINT[]
  ) OR NOT EXISTS (
    SELECT 1
    FROM pg_class AS relation
    WHERE relation.oid = 'public.resend_webhook_events'::regclass
      AND relation.relrowsecurity
  ) THEN
    RAISE EXCEPTION 'Resend webhook receipt ledger PK or RLS is missing';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM (VALUES
      ('svix_id', 'text', 'NO'),
      ('event_type', 'text', 'NO'),
      ('resend_email_id', 'text', 'YES'),
      ('event_created_at', 'timestamp with time zone', 'NO'),
      ('received_at', 'timestamp with time zone', 'NO')
    ) AS required_column(column_name, data_type, is_nullable)
    LEFT JOIN information_schema.columns AS actual_column
      ON actual_column.table_schema = 'public'
      AND actual_column.table_name = 'resend_webhook_events'
      AND actual_column.column_name = required_column.column_name
      AND actual_column.data_type = required_column.data_type
      AND actual_column.is_nullable = required_column.is_nullable
    WHERE actual_column.column_name IS NULL
  ) OR NOT EXISTS (
    SELECT 1
    FROM information_schema.columns AS actual_column
    WHERE actual_column.table_schema = 'public'
      AND actual_column.table_name = 'resend_webhook_events'
      AND actual_column.column_name = 'received_at'
      AND actual_column.column_default ILIKE '%now()%'
  ) THEN
    RAISE EXCEPTION 'Resend webhook receipt ledger columns are malformed';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM (VALUES ('anon'), ('authenticated')) AS browser_role(role_name)
    CROSS JOIN (VALUES
      ('SELECT'), ('INSERT'), ('UPDATE'), ('DELETE'),
      ('TRUNCATE'), ('REFERENCES'), ('TRIGGER')
    ) AS table_privilege(privilege_name)
    WHERE has_table_privilege(
      browser_role.role_name::name,
      'public.resend_webhook_events',
      table_privilege.privilege_name
    )
  ) OR EXISTS (
    SELECT 1
    FROM (VALUES
      ('SELECT'), ('INSERT'), ('UPDATE'), ('DELETE')
    ) AS required_privilege(privilege_name)
    WHERE NOT has_table_privilege(
      'service_role',
      'public.resend_webhook_events',
      required_privilege.privilege_name
    )
  ) THEN
    RAISE EXCEPTION 'Resend webhook receipt ledger grants are unsafe';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_index AS index_definition
    WHERE index_definition.indrelid = 'public.email_logs'::regclass
      AND index_definition.indisunique
      AND index_definition.indisvalid
      AND index_definition.indpred IS NULL
      AND index_definition.indexprs IS NULL
      AND pg_get_indexdef(index_definition.indexrelid)
        ILIKE '%(resend_email_id)%'
  ) OR NOT EXISTS (
    SELECT 1
    FROM pg_index AS index_definition
    WHERE index_definition.indrelid = 'public.email_bounces'::regclass
      AND index_definition.indisunique
      AND index_definition.indisvalid
      AND index_definition.indpred IS NULL
      AND index_definition.indexprs IS NULL
      AND pg_get_indexdef(index_definition.indexrelid)
        ILIKE '%(email_address)%'
  ) THEN
    RAISE EXCEPTION 'Resend webhook processing uniqueness prerequisites are missing';
  END IF;

  IF to_regprocedure(
    'public.process_resend_webhook_event(text,text,text,timestamptz,text,text)'
  ) IS NULL OR (
    SELECT count(*)
    FROM pg_proc AS function_definition
    JOIN pg_namespace AS namespace
      ON namespace.oid = function_definition.pronamespace
    WHERE namespace.nspname = 'public'
      AND function_definition.proname = 'process_resend_webhook_event'
  ) <> 1 THEN
    RAISE EXCEPTION 'Resend webhook processing RPC is missing or overloaded';
  END IF;

  IF has_function_privilege(
    'authenticated',
    'public.process_resend_webhook_event(text,text,text,timestamptz,text,text)',
    'EXECUTE'
  ) OR has_function_privilege(
    'anon',
    'public.process_resend_webhook_event(text,text,text,timestamptz,text,text)',
    'EXECUTE'
  ) OR NOT has_function_privilege(
    'service_role',
    'public.process_resend_webhook_event(text,text,text,timestamptz,text,text)',
    'EXECUTE'
  ) THEN
    RAISE EXCEPTION 'Resend webhook processing RPC grants are incorrect';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_proc AS function_definition
    WHERE function_definition.oid =
        'public.process_resend_webhook_event(text,text,text,timestamptz,text,text)'::regprocedure
      AND function_definition.prosecdef
      AND EXISTS (
        SELECT 1
        FROM unnest(
          COALESCE(function_definition.proconfig, ARRAY[]::TEXT[])
        ) AS setting(value)
        WHERE setting.value IN ('search_path=', 'search_path=""')
      )
  ) THEN
    RAISE EXCEPTION 'Resend webhook processing RPC lacks a fixed empty search_path';
  END IF;

  resend_function_definition := pg_get_functiondef(
    'public.process_resend_webhook_event(text,text,text,timestamptz,text,text)'::regprocedure
  );
  resend_suppressed_upsert_definition := split_part(
    resend_function_definition,
    'INSERT INTO public.email_bounces AS existing',
    2
  );

  IF resend_function_definition
      NOT ILIKE '%INSERT INTO public.resend_webhook_events%ON CONFLICT (svix_id) DO NOTHING%GET DIAGNOSTICS inserted_count = ROW_COUNT%RETURN ''duplicate''%'
    OR resend_function_definition
      NOT ILIKE '%FROM public.email_logs%resend_email_id = p_resend_email_id%FOR UPDATE%incoming_rank >= current_rank%'
    OR resend_function_definition
      NOT ILIKE '%WHEN ''email.opened''%open_count = GREATEST%+ 1%WHEN ''email.clicked''%click_count = GREATEST%+ 1%'
  THEN
    RAISE EXCEPTION 'Resend webhook processing RPC is not atomically idempotent';
  END IF;

  IF resend_function_definition
      NOT ILIKE '%''email.suppressed''%WHEN ''email.suppressed'' THEN ''suppressed''%WHEN ''suppressed'' THEN 6%'
    OR resend_function_definition
      NOT ILIKE '%IF p_event_type IN (''email.bounced'', ''email.complained'', ''email.suppressed'')%IF p_event_type = ''email.suppressed'' THEN%INSERT INTO public.email_bounces%'
    OR resend_suppressed_upsert_definition
      NOT ILIKE '%VALUES%normalized_address%''suppressed''%0%NULL%NULL%true%p_event_created_at%ON CONFLICT (email_address) DO UPDATE%bounce_type = CASE%suppressed = true%suppressed_at = CASE%LEAST%'
    OR resend_suppressed_upsert_definition ILIKE '%bounce_count =%'
    OR resend_suppressed_upsert_definition ILIKE '%first_bounced_at =%'
    OR resend_suppressed_upsert_definition ILIKE '%last_bounced_at =%'
  THEN
    RAISE EXCEPTION 'Resend provider-side suppression is not mirrored safely';
  END IF;

  IF resend_function_definition
      NOT ILIKE '%WHEN ''email.bounced'' THEN%UPDATE public.email_logs%SET bounce_type = CASE%WHEN ''unknown'' THEN 1%WHEN ''soft'' THEN 2%WHEN ''hard'' THEN 3%THEN bounce_type%ELSE normalized_bounce_type%'
    OR resend_function_definition
      NOT ILIKE '%ELSE%INSERT INTO public.email_bounces AS existing%ON CONFLICT (email_address) DO UPDATE%bounce_count = GREATEST%+ 1%first_bounced_at = CASE%LEAST%last_bounced_at = CASE%GREATEST%bounce_type = CASE%WHEN ''complaint'' THEN 5%WHEN ''hard'' THEN 4%WHEN ''soft'' THEN 2%WHEN ''unknown'' THEN 1%suppressed = COALESCE(existing.suppressed, false) OR EXCLUDED.suppressed%suppressed_at = CASE%LEAST%'
    OR (
      resend_function_definition ILIKE '%EXCLUDED.bounce_type = ''soft''%existing.bounce_count%>= 3%'
      OR resend_function_definition ILIKE '%normalized_bounce_type = ''soft''%existing.bounce_count%>= 3%'
    )
  THEN
    RAISE EXCEPTION 'Resend bounce history can regress or suppress on a mixed-event count';
  END IF;

  IF has_function_privilege(
    'authenticated',
    'public.accept_workspace_invite(uuid,uuid,text)',
    'EXECUTE'
  ) OR has_function_privilege(
    'anon',
    'public.accept_workspace_invite(uuid,uuid,text)',
    'EXECUTE'
  ) OR NOT has_function_privilege(
    'service_role',
    'public.accept_workspace_invite(uuid,uuid,text)',
    'EXECUTE'
  ) THEN
    RAISE EXCEPTION 'accept_workspace_invite EXECUTE grants are incorrect';
  END IF;

  IF has_function_privilege(
    'authenticated',
    'public.transition_workspace_membership(uuid,text,uuid)',
    'EXECUTE'
  ) OR has_function_privilege(
    'anon',
    'public.transition_workspace_membership(uuid,text,uuid)',
    'EXECUTE'
  ) OR NOT has_function_privilege(
    'service_role',
    'public.transition_workspace_membership(uuid,text,uuid)',
    'EXECUTE'
  ) THEN
    RAISE EXCEPTION 'transition_workspace_membership EXECUTE grants are incorrect';
  END IF;

  IF pg_get_functiondef(
    'public.transition_workspace_membership(uuid,text,uuid)'::regprocedure
  ) NOT ILIKE '%p_action IS NULL%p_action NOT IN (''suspend'', ''reactivate'', ''revoke_pending'')%'
    OR pg_get_functiondef(
      'public.transition_workspace_membership(uuid,text,uuid)'::regprocedure
    ) NOT ILIKE '%p_action = ''suspend''%DELETE FROM public.client_portal_sessions%DELETE FROM public.client_portal_tokens%audit_action := ''workspace.membership.suspended''%ELSIF p_action = ''reactivate''%'
    OR pg_get_functiondef(
      'public.transition_workspace_membership(uuid,text,uuid)'::regprocedure
    ) NOT ILIKE '%p_action = ''suspend''%RETURNING * INTO membership;%IF NOT FOUND THEN%workspace account transition failed%UPDATE public.workspaces%'
    OR pg_get_functiondef(
      'public.transition_workspace_membership(uuid,text,uuid)'::regprocedure
    ) NOT ILIKE '%ELSIF p_action = ''reactivate''%RETURNING * INTO membership;%IF NOT FOUND THEN%workspace account transition failed%UPDATE public.workspaces%'
    OR pg_get_functiondef(
      'public.transition_workspace_membership(uuid,text,uuid)'::regprocedure
    ) NOT ILIKE '%status = ''revoked''%RETURNING * INTO membership;%IF NOT FOUND THEN%workspace account transition failed%UPDATE public.workspaces%'
    OR pg_get_functiondef(
      'public.transition_workspace_membership(uuid,text,uuid)'::regprocedure
    ) ILIKE '%audit_action := ''workspace.membership.revoked''%END IF;%IF NOT FOUND THEN%workspace account transition failed%'
  THEN
    RAISE EXCEPTION 'workspace lifecycle transition or portal revocation is unsafe';
  END IF;

  -- Staging fixture requirement: use a real non-admin Auth user in an active
  -- private workspace with zero client_portal_sessions/client_portal_tokens.
  -- As service_role, suspend then reactivate that membership and assert both
  -- returned membership/workspace states plus their audit actions. Separately
  -- revoke_pending an invited private-workspace membership with zero artifacts
  -- and assert revoked membership, archived workspace, and revocation audit.

  IF EXISTS (
    SELECT 1
    FROM public.client_portal_sessions AS session
    JOIN public.clients AS client
      ON client.id = session.client_id
    JOIN public.workspaces AS workspace
      ON workspace.id = client.workspace_id
    WHERE workspace.status <> 'active'
  ) OR EXISTS (
    SELECT 1
    FROM public.client_portal_tokens AS token
    JOIN public.clients AS client
      ON client.id = token.client_id
    JOIN public.workspaces AS workspace
      ON workspace.id = client.workspace_id
    WHERE workspace.status <> 'active'
  ) THEN
    RAISE EXCEPTION 'a non-active workspace retains client portal sessions or tokens';
  END IF;

  IF to_regprocedure(
    'public.workspace_client_operation(text,uuid,uuid,jsonb,uuid)'
  ) IS NULL OR (
    SELECT count(*)
    FROM pg_proc AS function_definition
    JOIN pg_namespace AS namespace
      ON namespace.oid = function_definition.pronamespace
    WHERE namespace.nspname = 'public'
      AND function_definition.proname = 'workspace_client_operation'
  ) <> 1 THEN
    RAISE EXCEPTION 'workspace_client_operation is missing or overloaded';
  END IF;

  IF has_function_privilege(
    'authenticated',
    'public.workspace_client_operation(text,uuid,uuid,jsonb,uuid)',
    'EXECUTE'
  ) OR has_function_privilege(
    'anon',
    'public.workspace_client_operation(text,uuid,uuid,jsonb,uuid)',
    'EXECUTE'
  ) OR NOT has_function_privilege(
    'service_role',
    'public.workspace_client_operation(text,uuid,uuid,jsonb,uuid)',
    'EXECUTE'
  ) THEN
    RAISE EXCEPTION 'workspace_client_operation EXECUTE grants are incorrect';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_proc
    WHERE oid = 'public.workspace_client_operation(text,uuid,uuid,jsonb,uuid)'::regprocedure
      AND prosecdef
  ) OR pg_get_functiondef(
    'public.workspace_client_operation(text,uuid,uuid,jsonb,uuid)'::regprocedure
  ) NOT ILIKE '%p_action IS NULL%FROM public.workspace_memberships%membership.status = ''active''%membership.role IN (''owner'', ''admin'')%FOR SHARE%FROM public.workspaces%workspace.status = ''active''%FOR SHARE%'
    OR pg_get_functiondef(
      'public.workspace_client_operation(text,uuid,uuid,jsonb,uuid)'::regprocedure
    ) ILIKE '%FOR SHARE OF membership, workspace%'
    OR pg_get_functiondef(
      'public.workspace_client_operation(text,uuid,uuid,jsonb,uuid)'::regprocedure
    ) NOT ILIKE '%jsonb_object_keys%workspace_audit_log%workspace.client.created%workspace_audit_log%workspace.client.updated%workspace_audit_log%workspace.client.deleted%'
    OR pg_get_functiondef(
      'public.workspace_client_operation(text,uuid,uuid,jsonb,uuid)'::regprocedure
    ) ILIKE '%portal\_%' ESCAPE '\'
    OR pg_get_functiondef(
      'public.workspace_client_operation(text,uuid,uuid,jsonb,uuid)'::regprocedure
    ) ILIKE '%dashboard\_%' ESCAPE '\'
    OR pg_get_functiondef(
      'public.workspace_client_operation(text,uuid,uuid,jsonb,uuid)'::regprocedure
    ) ILIKE '%prospect\_%' ESCAPE '\'
    OR pg_get_functiondef(
      'public.workspace_client_operation(text,uuid,uuid,jsonb,uuid)'::regprocedure
    ) ILIKE '%google\_%' ESCAPE '\'
    OR pg_get_functiondef(
      'public.workspace_client_operation(text,uuid,uuid,jsonb,uuid)'::regprocedure
    ) ILIKE '%outreach\_%' ESCAPE '\'
    OR pg_get_functiondef(
      'public.workspace_client_operation(text,uuid,uuid,jsonb,uuid)'::regprocedure
    ) ILIKE '%billing\_%' ESCAPE '\'
  THEN
    RAISE EXCEPTION 'workspace_client_operation authorization, field allowlist, or audit shape is unsafe';
  END IF;

  IF has_function_privilege(
    'authenticated',
    'public.record_public_client_dashboard_view(uuid)',
    'EXECUTE'
  ) OR has_function_privilege(
    'anon',
    'public.record_public_client_dashboard_view(uuid)',
    'EXECUTE'
  ) OR NOT has_function_privilege(
    'service_role',
    'public.record_public_client_dashboard_view(uuid)',
    'EXECUTE'
  ) THEN
    RAISE EXCEPTION 'record_public_client_dashboard_view EXECUTE grants are incorrect';
  END IF;

  IF has_function_privilege(
    'authenticated',
    'public.record_public_prospect_dashboard_view(uuid)',
    'EXECUTE'
  ) OR has_function_privilege(
    'anon',
    'public.record_public_prospect_dashboard_view(uuid)',
    'EXECUTE'
  ) OR NOT has_function_privilege(
    'service_role',
    'public.record_public_prospect_dashboard_view(uuid)',
    'EXECUTE'
  ) THEN
    RAISE EXCEPTION 'record_public_prospect_dashboard_view EXECUTE grants are incorrect';
  END IF;

  IF has_function_privilege(
    'authenticated',
    'public.manage_client_portal_password(uuid,text,text,uuid)',
    'EXECUTE'
  ) OR has_function_privilege(
    'anon',
    'public.manage_client_portal_password(uuid,text,text,uuid)',
    'EXECUTE'
  ) OR NOT has_function_privilege(
    'service_role',
    'public.manage_client_portal_password(uuid,text,text,uuid)',
    'EXECUTE'
  ) THEN
    RAISE EXCEPTION 'manage_client_portal_password EXECUTE grants are incorrect';
  END IF;

  IF has_function_privilege(
    'authenticated',
    'public.initialize_client_portal_password(uuid,text,text,uuid)',
    'EXECUTE'
  ) OR has_function_privilege(
    'anon',
    'public.initialize_client_portal_password(uuid,text,text,uuid)',
    'EXECUTE'
  ) OR NOT has_function_privilege(
    'service_role',
    'public.initialize_client_portal_password(uuid,text,text,uuid)',
    'EXECUTE'
  ) THEN
    RAISE EXCEPTION 'portal credential initialization EXECUTE grants are incorrect';
  END IF;

  IF to_regprocedure(
    'public.issue_client_portal_password_session(uuid,text,text,text,text,timestamptz,text,text)'
  ) IS NULL OR to_regprocedure(
    'public.issue_client_portal_password_session(uuid,text,text,text,timestamptz,text,text)'
  ) IS NOT NULL OR (
    SELECT count(*)
    FROM pg_proc AS function_definition
    JOIN pg_namespace AS namespace
      ON namespace.oid = function_definition.pronamespace
    WHERE namespace.nspname = 'public'
      AND function_definition.proname = 'issue_client_portal_password_session'
  ) <> 1 THEN
    RAISE EXCEPTION 'portal session issuance signature is stale or overloaded';
  END IF;

  IF has_function_privilege(
    'authenticated',
    'public.issue_client_portal_password_session(uuid,text,text,text,text,timestamptz,text,text)',
    'EXECUTE'
  ) OR has_function_privilege(
    'anon',
    'public.issue_client_portal_password_session(uuid,text,text,text,text,timestamptz,text,text)',
    'EXECUTE'
  ) OR NOT has_function_privilege(
    'service_role',
    'public.issue_client_portal_password_session(uuid,text,text,text,text,timestamptz,text,text)',
    'EXECUTE'
  ) THEN
    RAISE EXCEPTION 'portal session issuance EXECUTE grants are incorrect';
  END IF;

  IF to_regprocedure(
    'public.logout_client_portal_session(text)'
  ) IS NULL OR to_regprocedure(
    'public.logout_client_portal_session(text,text)'
  ) IS NOT NULL OR (
    SELECT count(*)
    FROM pg_proc AS function_definition
    JOIN pg_namespace AS namespace
      ON namespace.oid = function_definition.pronamespace
    WHERE namespace.nspname = 'public'
      AND function_definition.proname = 'logout_client_portal_session'
  ) <> 1 THEN
    RAISE EXCEPTION 'portal logout must expose exactly the one-hash-argument contract';
  END IF;

  IF has_function_privilege(
    'authenticated',
    'public.logout_client_portal_session(text)',
    'EXECUTE'
  ) OR has_function_privilege(
    'anon',
    'public.logout_client_portal_session(text)',
    'EXECUTE'
  ) OR NOT has_function_privilege(
    'service_role',
    'public.logout_client_portal_session(text)',
    'EXECUTE'
  ) THEN
    RAISE EXCEPTION 'portal logout EXECUTE grants are incorrect';
  END IF;

  IF to_regprocedure(
    'public.reserve_client_portal_login_attempt(text,text,text)'
  ) IS NULL THEN
    RAISE EXCEPTION 'atomic portal login-attempt reservation is missing';
  END IF;

  IF has_function_privilege(
    'authenticated',
    'public.reserve_client_portal_login_attempt(text,text,text)',
    'EXECUTE'
  ) OR has_function_privilege(
    'anon',
    'public.reserve_client_portal_login_attempt(text,text,text)',
    'EXECUTE'
  ) OR NOT has_function_privilege(
    'service_role',
    'public.reserve_client_portal_login_attempt(text,text,text)',
    'EXECUTE'
  ) THEN
    RAISE EXCEPTION 'portal login-attempt reservation EXECUTE grants are incorrect';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_index AS index_definition
    JOIN pg_class AS index_relation
      ON index_relation.oid = index_definition.indexrelid
    WHERE index_definition.indrelid = 'public.client_portal_activity_log'::regclass
      AND index_relation.relname = 'client_portal_login_attempt_email_idx'
      AND index_definition.indisvalid
      AND pg_get_indexdef(index_definition.indexrelid)
        ILIKE '%metadata%email%created_at%password_login_attempt%'
  ) OR NOT EXISTS (
    SELECT 1
    FROM pg_index AS index_definition
    JOIN pg_class AS index_relation
      ON index_relation.oid = index_definition.indexrelid
    WHERE index_definition.indrelid = 'public.client_portal_activity_log'::regclass
      AND index_relation.relname = 'client_portal_login_attempt_ip_idx'
      AND index_definition.indisvalid
      AND pg_get_indexdef(index_definition.indexrelid)
        ILIKE '%ip_address%created_at%password_login_attempt%'
  ) THEN
    RAISE EXCEPTION 'portal login-attempt rate-limit indexes are missing or malformed';
  END IF;

  IF EXISTS (
    SELECT required_function.signature
    FROM (VALUES
      ('public.manage_client_portal_password(uuid,text,text,uuid)'),
      ('public.initialize_client_portal_password(uuid,text,text,uuid)'),
      ('public.issue_client_portal_password_session(uuid,text,text,text,text,timestamptz,text,text)'),
      ('public.logout_client_portal_session(text)'),
      ('public.reserve_client_portal_login_attempt(text,text,text)')
    ) AS required_function(signature)
    WHERE NOT EXISTS (
      SELECT 1
      FROM pg_proc AS function_definition
      WHERE function_definition.oid = to_regprocedure(required_function.signature)
        AND function_definition.prosecdef
        AND EXISTS (
          SELECT 1
          FROM unnest(
            COALESCE(function_definition.proconfig, ARRAY[]::TEXT[])
          ) AS setting(value)
          WHERE setting.value IN ('search_path=', 'search_path=""')
        )
    )
  ) THEN
    RAISE EXCEPTION 'one or more portal RPCs lack SECURITY DEFINER or a fixed empty search_path';
  END IF;

  IF pg_get_functiondef(
    'public.manage_client_portal_password(uuid,text,text,uuid)'::regprocedure
  ) NOT ILIKE '%FROM public.clients AS client%WHERE client.id = p_client_id%FOR UPDATE%IF configured THEN%INSERT INTO public.client_portal_credentials%ELSE%DELETE FROM public.client_portal_credentials%UPDATE public.clients%DELETE FROM public.client_portal_sessions%DELETE FROM public.client_portal_tokens%workspace_audit_log%'
    OR pg_get_functiondef(
      'public.initialize_client_portal_password(uuid,text,text,uuid)'::regprocedure
    ) NOT ILIKE '%FROM public.clients AS client%NOT COALESCE(client.portal_access_enabled, false)%FOR UPDATE%INSERT INTO public.client_portal_credentials%UPDATE public.clients%portal_access_enabled = true%DELETE FROM public.client_portal_sessions%DELETE FROM public.client_portal_tokens%workspace_audit_log%'
    OR pg_get_functiondef(
      'public.issue_client_portal_password_session(uuid,text,text,text,text,timestamptz,text,text)'::regprocedure
    ) NOT ILIKE '%p_session_token_hash%sha256%SELECT client.workspace_id%INTO target_workspace_id%FROM public.clients%FROM public.workspaces%workspace.id = target_workspace_id%workspace.status = ''active''%FOR SHARE%SELECT client.email%client.workspace_id = target_workspace_id%portal_access_enabled%portal_email_normalized = p_expected_email_normalized%FOR UPDATE%FROM public.client_portal_credentials%FOR UPDATE%password_verifier IS DISTINCT FROM p_expected_password_verifier%p_upgraded_password_verifier IS NOT NULL%UPDATE public.client_portal_credentials%password_verifier = p_upgraded_password_verifier%credential_version = credential_version + 1%configured_by = ''security_upgrade''%client_portal_sessions%p_session_token_hash%password_login_success%'
    OR pg_get_functiondef(
      'public.issue_client_portal_password_session(uuid,text,text,text,text,timestamptz,text,text)'::regprocedure
    ) ILIKE '%FOR UPDATE OF client, workspace%'
    OR pg_get_functiondef(
      'public.logout_client_portal_session(text)'::regprocedure
    ) NOT ILIKE '%p_session_token_hash%sha256%SELECT session.client_id%FROM public.client_portal_sessions%WHERE session.session_token = p_session_token_hash%LIMIT 1%PERFORM 1%FROM public.clients%FOR UPDATE%SELECT session.id%FROM public.client_portal_sessions%session.client_id = target_client_id%FOR UPDATE%client_portal_activity_log%''logout''%DELETE FROM public.client_portal_sessions%'
  THEN
    RAISE EXCEPTION 'portal credential/session RPC transaction or hash-only contract is unsafe';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_proc
    WHERE oid = 'public.reserve_client_portal_login_attempt(text,text,text)'::regprocedure
      AND prosecdef
  ) OR pg_get_functiondef(
    'public.reserve_client_portal_login_attempt(text,text,text)'::regprocedure
  ) NOT ILIKE '%pg_advisory_xact_lock%portal-login-email:%portal-login-ip:%recent_email_attempts >= 8%recent_ip_attempts >= 30%INSERT INTO public.client_portal_activity_log%password_login_attempt%'
  THEN
    RAISE EXCEPTION 'portal login-attempt reservation is not atomic or correctly bounded';
  END IF;

  IF NOT has_function_privilege(
    'anon',
    'public.is_platform_admin()',
    'EXECUTE'
  ) OR NOT has_function_privilege(
    'authenticated',
    'public.is_platform_admin()',
    'EXECUTE'
  ) THEN
    RAISE EXCEPTION 'is_platform_admin cannot support browser-role RLS gates';
  END IF;

  BEGIN
    PERFORM public.transition_workspace_membership(
      gen_random_uuid(),
      NULL,
      gen_random_uuid()
    );
  EXCEPTION
    WHEN SQLSTATE '22023' THEN
      null_action_rejected := true;
  END;

  IF NOT null_action_rejected THEN
    RAISE EXCEPTION 'NULL membership transitions are not rejected safely';
  END IF;

  BEGIN
    PERFORM public.workspace_client_operation(
      NULL,
      gen_random_uuid(),
      NULL,
      '{}'::JSONB,
      gen_random_uuid()
    );
  EXCEPTION
    WHEN SQLSTATE '22023' THEN
      null_client_action_rejected := true;
  END;

  IF NOT null_client_action_rejected THEN
    RAISE EXCEPTION 'NULL workspace client operations are not rejected safely';
  END IF;
END;
$$;

SELECT
  workspace.id,
  workspace.name,
  workspace.slug,
  workspace.status,
  count(DISTINCT membership.id) FILTER (
    WHERE membership.status = 'active'
  ) AS active_memberships,
  count(DISTINCT client.id) AS clients
FROM public.workspaces AS workspace
LEFT JOIN public.workspace_memberships AS membership
  ON membership.workspace_id = workspace.id
LEFT JOIN public.clients AS client
  ON client.workspace_id = workspace.id
GROUP BY workspace.id, workspace.name, workspace.slug, workspace.status
ORDER BY workspace.created_at;
