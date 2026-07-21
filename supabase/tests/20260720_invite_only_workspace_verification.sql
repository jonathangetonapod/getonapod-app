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
  lifecycle_pair_definition TEXT;
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
    OR pg_get_functiondef('public.is_platform_admin()'::regprocedure)
      NOT ILIKE '%workspace_memberships%email_normalized%workspaces%is_default%'
  THEN
    RAISE EXCEPTION 'is_platform_admin is not bound to the live Auth user';
  END IF;

  IF to_regprocedure('public.is_platform_admin_identity(uuid,text)') IS NULL
    OR has_function_privilege(
      'authenticated',
      'public.is_platform_admin_identity(uuid,text)',
      'EXECUTE'
    )
    OR has_function_privilege(
      'anon',
      'public.is_platform_admin_identity(uuid,text)',
      'EXECUTE'
    )
    OR NOT has_function_privilege(
      'service_role',
      'public.is_platform_admin_identity(uuid,text)',
      'EXECUTE'
    )
    OR pg_get_functiondef(
      'public.is_platform_admin_identity(uuid,text)'::regprocedure
    ) NOT ILIKE '%auth.users%admin_users%workspace_memberships%email_normalized%workspaces%is_default%'
  THEN
    RAISE EXCEPTION 'platform-admin identity binding is missing or unsafe';
  END IF;

  IF pg_get_functiondef('public.current_workspace_id()'::regprocedure)
      NOT ILIKE '%JOIN auth.users%lower(btrim(auth_user.email)) = membership.email_normalized%'
    OR pg_get_functiondef('public.can_access_workspace(uuid)'::regprocedure)
      NOT ILIKE '%JOIN auth.users%lower(btrim(auth_user.email)) = membership.email_normalized%'
    OR pg_get_functiondef('public.can_manage_workspace(uuid)'::regprocedure)
      NOT ILIKE '%JOIN auth.users%lower(btrim(auth_user.email)) = membership.email_normalized%'
  THEN
    RAISE EXCEPTION 'workspace authorization is not bound to the current Auth identity';
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
  ) AS invalid_workspace;

  IF invalid_private_workspace_count <> 0 THEN
    RAISE EXCEPTION
      '% private workspaces lack exactly one lifecycle-matched membership',
      invalid_private_workspace_count;
  END IF;

  SELECT pg_get_functiondef(
    to_regprocedure('public.enforce_private_workspace_lifecycle_pair()')
  )
  INTO lifecycle_pair_definition;

  IF lifecycle_pair_definition IS NULL
    OR lifecycle_pair_definition NOT ILIKE '%TG_OP%'
    OR lifecycle_pair_definition NOT ILIKE '%OLD.id%'
    OR lifecycle_pair_definition NOT ILIKE '%NEW.id%'
    OR lifecycle_pair_definition NOT ILIKE '%OLD.workspace_id%'
    OR lifecycle_pair_definition NOT ILIKE '%NEW.workspace_id%'
    OR lifecycle_pair_definition NOT ILIKE '%LEFT JOIN public.workspace_memberships%'
    OR lifecycle_pair_definition NOT ILIKE '%count(membership.id)%'
    OR lifecycle_pair_definition NOT ILIKE '%FILTER%matching_lifecycle_count%'
    OR lifecycle_pair_definition NOT ILIKE '%membership_count <> 1%'
    OR lifecycle_pair_definition NOT ILIKE '%matching_lifecycle_count <> 1%'
    OR lifecycle_pair_definition NOT ILIKE '%private workspace requires exactly one lifecycle-matched membership%'
    OR EXISTS (
      SELECT 1
      FROM (VALUES
        ('workspaces', 'workspaces_lifecycle_pair_check'),
        ('workspace_memberships', 'workspace_memberships_lifecycle_pair_check')
      ) AS required_trigger(table_name, trigger_name)
      WHERE NOT EXISTS (
        SELECT 1
        FROM pg_trigger AS trigger_definition
        WHERE trigger_definition.tgrelid = format(
            'public.%I',
            required_trigger.table_name
          )::regclass
          AND trigger_definition.tgname = required_trigger.trigger_name
          AND trigger_definition.tgfoid =
            'public.enforce_private_workspace_lifecycle_pair()'::regprocedure
          AND trigger_definition.tgtype = 29
          AND trigger_definition.tgdeferrable
          AND trigger_definition.tginitdeferred
          AND trigger_definition.tgenabled <> 'D'
      )
    )
  THEN
    RAISE EXCEPTION 'private workspace lifecycle pairing is not deferred and enforced';
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
    (
      'workspace_memberships_status_check',
      '%status%ANY%provisioning%invited%active%suspended%revoked%'
    ),
    (
      'workspace_memberships_live_user_check',
      '%status%ALL%active%suspended%OR%user_id IS NOT NULL%'
    ),
    (
      'workspace_memberships_active_acceptance_check',
      '%status%<>%active%OR%accepted_at IS NOT NULL%'
    ),
    (
      'workspace_memberships_suspension_check',
      '%status%<>%suspended%OR%suspended_at IS NOT NULL%'
    ),
    (
      'workspace_memberships_revocation_check',
      '%status%<>%revoked%OR%revoked_at IS NOT NULL%'
    ),
    (
      'workspace_memberships_invite_expiry_check',
      '%status%<>%invited%OR%invite_expires_at IS NOT NULL%AND%invite_expires_at%>%invited_at%'
    )
  ) AS required_constraint(constraint_name, definition_pattern)
  WHERE NOT EXISTS (
    SELECT 1
    FROM pg_constraint AS constraint_definition
    WHERE constraint_definition.conrelid = 'public.workspace_memberships'::regclass
      AND constraint_definition.conname = required_constraint.constraint_name
      AND constraint_definition.contype = 'c'
      AND constraint_definition.convalidated
      AND pg_get_constraintdef(constraint_definition.oid)
        ILIKE required_constraint.definition_pattern
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
        ILIKE '%status%provisioning%invited%active%suspended%'
  ) OR NOT EXISTS (
    SELECT 1
    FROM pg_index AS index_definition
    JOIN pg_class AS index_relation
      ON index_relation.oid = index_definition.indexrelid
    WHERE index_definition.indrelid = 'public.workspace_memberships'::regclass
      AND index_relation.relname = 'workspace_memberships_one_live_user_idx'
      AND index_definition.indisunique
      AND pg_get_expr(index_definition.indpred, index_definition.indrelid)
        ILIKE '%status%provisioning%invited%active%suspended%'
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
      AND replace(replace(regexp_replace(
        pg_get_constraintdef(oid),
        '[[:space:]]',
        '',
        'g'
      ), '(', ''), ')', '') =
        'CHECKNOTCOALESCEportal_access_enabled,falseORNULLIFbtrimemail,''''::textISNOTNULL'
  ) OR NOT EXISTS (
    SELECT 1
    FROM pg_index AS index_definition
    JOIN pg_class AS index_relation
      ON index_relation.oid = index_definition.indexrelid
    WHERE index_definition.indrelid = 'public.clients'::regclass
      AND index_relation.relname = 'clients_one_enabled_portal_email_idx'
      AND index_relation.relam = (
        SELECT access_method.oid
        FROM pg_am AS access_method
        WHERE access_method.amname = 'btree'
      )
      AND index_definition.indisunique
      AND NOT index_definition.indisprimary
      AND NOT index_definition.indisexclusion
      AND index_definition.indimmediate
      AND index_definition.indisvalid
      AND index_definition.indisready
      AND index_definition.indislive
      AND index_definition.indnkeyatts = 1
      AND index_definition.indnatts = 1
      AND index_definition.indexprs IS NULL
      AND index_definition.indpred IS NOT NULL
      AND index_definition.indoption[0] = 0
      AND index_definition.indclass[0] = (
        SELECT operator_class.oid
        FROM pg_opclass AS operator_class
        JOIN pg_am AS access_method
          ON access_method.oid = operator_class.opcmethod
        WHERE access_method.amname = 'btree'
          AND operator_class.opcname = 'text_ops'
          AND operator_class.opcintype = 'text'::regtype
          AND operator_class.opcdefault
      )
      AND index_definition.indcollation[0] = (
        SELECT attribute.attcollation
        FROM pg_attribute AS attribute
        WHERE attribute.attrelid = 'public.clients'::regclass
          AND attribute.attname = 'portal_email_normalized'
          AND NOT attribute.attisdropped
      )
      AND index_definition.indkey[0] = (
        SELECT attribute.attnum
        FROM pg_attribute AS attribute
        WHERE attribute.attrelid = 'public.clients'::regclass
          AND attribute.attname = 'portal_email_normalized'
          AND NOT attribute.attisdropped
      )
      AND replace(replace(regexp_replace(
        pg_get_expr(index_definition.indpred, index_definition.indrelid),
        '[[:space:]]',
        '',
        'g'
      ), '(', ''), ')', '') =
        'portal_access_enabledANDportal_email_normalizedISNOTNULL'
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
      AND constraint_definition.confupdtype = 'a'
      AND constraint_definition.confmatchtype = 's'
      AND constraint_definition.convalidated
      AND NOT constraint_definition.condeferrable
      AND NOT constraint_definition.condeferred
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
      AND constraint_definition.confkey = ARRAY[
        (
          SELECT attribute.attnum
          FROM pg_attribute AS attribute
          WHERE attribute.attrelid = 'public.clients'::regclass
            AND attribute.attname = 'id'
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
      AND replace(replace(regexp_replace(
        pg_get_constraintdef(constraint_definition.oid),
        '[[:space:]]',
        '',
        'g'
      ), '(', ''), ')', '') =
        'CHECKCASEWHENpassword_verifier~''^pbkdf2_sha256\$[0-9]{6,7}\$[A-Za-z0-9+/]{22}==\$[A-Za-z0-9+/]{43}=$''::textTHENsplit_partpassword_verifier,''$''::text,2::bigint>=100000ANDsplit_partpassword_verifier,''$''::text,2::bigint<=1000000ELSEfalseEND'
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
      AND replace(replace(regexp_replace(
        pg_get_constraintdef(constraint_definition.oid),
        '[[:space:]]',
        '',
        'g'
      ), '(', ''), ')', '') = 'CHECKportal_passwordISNULL'
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
      AND replace(replace(regexp_replace(
        pg_get_constraintdef(constraint_definition.oid),
        '[[:space:]]',
        '',
        'g'
      ), '(', ''), ')', '') =
        'CHECKsession_token~''^sha256\$[A-Za-z0-9+/]{43}=$''::text'
  ) OR NOT EXISTS (
    SELECT 1
    FROM pg_index AS index_definition
    JOIN pg_class AS index_relation
      ON index_relation.oid = index_definition.indexrelid
    WHERE index_definition.indrelid = 'public.client_portal_sessions'::regclass
      AND index_relation.relname =
        'client_portal_sessions_token_verifier_uidx'
      AND index_relation.relam = (
        SELECT access_method.oid
        FROM pg_am AS access_method
        WHERE access_method.amname = 'btree'
      )
      AND index_definition.indisunique
      AND NOT index_definition.indisprimary
      AND NOT index_definition.indisexclusion
      AND index_definition.indimmediate
      AND index_definition.indisvalid
      AND index_definition.indisready
      AND index_definition.indislive
      AND index_definition.indnkeyatts = 1
      AND index_definition.indnatts = 1
      AND index_definition.indexprs IS NULL
      AND index_definition.indpred IS NULL
      AND index_definition.indoption[0] = 0
      AND index_definition.indclass[0] = (
        SELECT operator_class.oid
        FROM pg_opclass AS operator_class
        JOIN pg_am AS access_method
          ON access_method.oid = operator_class.opcmethod
        WHERE access_method.amname = 'btree'
          AND operator_class.opcname = 'text_ops'
          AND operator_class.opcintype = 'text'::regtype
          AND operator_class.opcdefault
      )
      AND index_definition.indcollation[0] = (
        SELECT attribute.attcollation
        FROM pg_attribute AS attribute
        WHERE attribute.attrelid = 'public.client_portal_sessions'::regclass
          AND attribute.attname = 'session_token'
          AND NOT attribute.attisdropped
      )
      AND index_definition.indkey[0] = (
        SELECT attribute.attnum
        FROM pg_attribute AS attribute
        WHERE attribute.attrelid = 'public.client_portal_sessions'::regclass
          AND attribute.attname = 'session_token'
          AND NOT attribute.attisdropped
      )
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
  -- and rewrite real client-to-prospect references from that same map.
  -- Migration 005 canonicalizes the historical empty-string representation of
  -- "no linked prospect" and prevents weak values from returning.

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

  IF to_regprocedure(
      'public.normalize_client_prospect_dashboard_slug()'
    ) IS NULL
    OR pg_get_functiondef(
      'public.normalize_client_prospect_dashboard_slug()'::regprocedure
    ) NOT ILIKE '%NEW.prospect_dashboard_slug := NULLIF%btrim(NEW.prospect_dashboard_slug)%'
    OR NOT EXISTS (
      SELECT 1
      FROM pg_trigger AS trigger_definition
      WHERE trigger_definition.tgrelid = 'public.clients'::regclass
        AND trigger_definition.tgname =
          'clients_normalize_prospect_dashboard_slug'
        AND NOT trigger_definition.tgisinternal
        AND trigger_definition.tgenabled = 'O'
        AND trigger_definition.tgfoid =
          'public.normalize_client_prospect_dashboard_slug()'::regprocedure
        AND pg_get_triggerdef(trigger_definition.oid)
          ILIKE '%BEFORE INSERT OR UPDATE OF prospect_dashboard_slug ON public.clients%'
    ) OR NOT EXISTS (
      SELECT 1
      FROM pg_constraint AS constraint_definition
      WHERE constraint_definition.conrelid = 'public.clients'::regclass
        AND constraint_definition.conname =
          'clients_prospect_dashboard_slug_capability_check'
        AND constraint_definition.contype = 'c'
        AND constraint_definition.convalidated
        AND pg_get_constraintdef(constraint_definition.oid)
          ILIKE '%prospect_dashboard_slug IS NULL%'
        AND pg_get_constraintdef(constraint_definition.oid)
          LIKE '%^prospect-[0-9a-f]{24}$%'
    ) OR NOT EXISTS (
      SELECT 1
      FROM pg_constraint AS constraint_definition
      WHERE constraint_definition.conrelid = 'public.clients'::regclass
        AND constraint_definition.confrelid =
          'public.prospect_dashboards'::regclass
        AND constraint_definition.conname =
          'clients_prospect_dashboard_slug_fkey'
        AND constraint_definition.contype = 'f'
        AND constraint_definition.convalidated
        AND constraint_definition.confupdtype = 'c'
        AND constraint_definition.confdeltype = 'n'
        AND constraint_definition.conkey = ARRAY[
          (
            SELECT attribute.attnum
            FROM pg_attribute AS attribute
            WHERE attribute.attrelid = 'public.clients'::regclass
              AND attribute.attname = 'prospect_dashboard_slug'
          )
        ]::SMALLINT[]
        AND constraint_definition.confkey = ARRAY[
          (
            SELECT attribute.attnum
            FROM pg_attribute AS attribute
            WHERE attribute.attrelid = 'public.prospect_dashboards'::regclass
              AND attribute.attname = 'slug'
          )
        ]::SMALLINT[]
    )
  THEN
    RAISE EXCEPTION
      'client-to-prospect capability references are not durably normalized';
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

  IF EXISTS (
    SELECT 1
    FROM unnest(ARRAY[
      'public.workspace_touch_updated_at()',
      'public.assign_client_workspace()',
      'public.enforce_private_workspace_single_live_member()',
      'public.enforce_private_workspace_lifecycle_pair()',
      'public.prevent_workspace_audit_mutation()',
      'public.generate_client_dashboard_slug()',
      'public.generate_prospect_dashboard_capability_slug()',
      'public.guard_client_internal_fields()',
      'public.revoke_client_portal_access_artifacts()',
      'public.normalize_client_prospect_dashboard_slug()'
    ]) AS trigger_function(signature)
    CROSS JOIN (VALUES ('anon'), ('authenticated')) AS browser_role(name)
    WHERE to_regprocedure(trigger_function.signature) IS NULL
      OR COALESCE(
        has_function_privilege(
          browser_role.name,
          to_regprocedure(trigger_function.signature),
          'EXECUTE'
        ),
        true
      )
  ) THEN
    RAISE EXCEPTION
      'browser roles can directly execute release trigger functions';
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
  ) NOT ILIKE '%auth.role()%substring%gen_random_uuid()%1, 12%substring%gen_random_uuid()%1, 12%'
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
  ) NOT ILIKE '%prospect-%substring%gen_random_uuid()%1, 12%substring%gen_random_uuid()%1, 12%'
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
    (
      'workspaces',
      'workspaces_authenticated_select',
      'PERMISSIVE',
      'can_access_workspace',
      'is_platform_admin'
    ),
    (
      'workspaces',
      'workspaces_authenticated_select_isolation',
      'RESTRICTIVE',
      'can_access_workspace',
      'is_platform_admin'
    ),
    (
      'workspace_memberships',
      'workspace_memberships_authenticated_select',
      'PERMISSIVE',
      'auth.uid',
      'is_platform_admin'
    ),
    (
      'workspace_memberships',
      'workspace_memberships_authenticated_select_isolation',
      'RESTRICTIVE',
      'auth.uid',
      'is_platform_admin'
    ),
    (
      'workspace_audit_log',
      'workspace_audit_log_authenticated_select',
      'PERMISSIVE',
      'is_platform_admin',
      'is_platform_admin'
    ),
    (
      'workspace_audit_log',
      'workspace_audit_log_authenticated_select_isolation',
      'RESTRICTIVE',
      'is_platform_admin',
      'is_platform_admin'
    )
  ) AS required_policy(
    table_name,
    policy_name,
    policy_mode,
    access_marker,
    admin_marker
  )
  WHERE NOT EXISTS (
    SELECT 1
    FROM pg_policies AS policy
    WHERE policy.schemaname = 'public'
      AND policy.tablename = required_policy.table_name
      AND policy.policyname = required_policy.policy_name
      AND policy.permissive = required_policy.policy_mode
      AND policy.cmd = 'SELECT'
      AND policy.roles = ARRAY['authenticated'::name]
      AND COALESCE(policy.qual, '') ILIKE '%' || required_policy.access_marker || '%'
      AND COALESCE(policy.qual, '') ILIKE '%' || required_policy.admin_marker || '%'
  );

  IF missing_workspace_policy_count <> 0 THEN
    RAISE EXCEPTION
      '% workspace metadata SELECT policies are missing or malformed',
      missing_workspace_policy_count;
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
    WHERE trigger_definition.tgrelid = 'public.workspace_memberships'::regclass
      AND trigger_definition.tgname = 'workspace_memberships_enforce_private_single_live'
      AND trigger_definition.tgenabled <> 'D'
      AND trigger_definition.tgtype = 31
      AND trigger_definition.tgfoid =
        'public.enforce_private_workspace_single_live_member()'::regprocedure
  ) OR pg_get_functiondef(
    'public.enforce_private_workspace_single_live_member()'::regprocedure
  ) NOT ILIKE '%TG_OP%OLD.workspace_id%NEW.workspace_id%FOR UPDATE%existing_membership.workspace_id = target_workspace_id%existing_membership.id <> NEW.id%private workspaces support exactly one membership%'
  THEN
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
      'workspace_auth_lifecycle_claims',
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
    FROM pg_class AS relation
    WHERE relation.oid = 'public.resend_webhook_events'::regclass
      AND relation.relkind = 'r'
      AND relation.relpersistence = 'p'
      AND NOT relation.relispartition
  ) THEN
    RAISE EXCEPTION 'Resend webhook receipt ledger is not durable and ordinary';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint AS constraint_definition
    WHERE constraint_definition.conrelid = 'public.resend_webhook_events'::regclass
      AND constraint_definition.conname = 'resend_webhook_events_pkey'
      AND constraint_definition.contype = 'p'
      AND constraint_definition.convalidated
      AND NOT constraint_definition.condeferrable
      AND NOT constraint_definition.condeferred
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
      AND NOT relation.relforcerowsecurity
  ) THEN
    RAISE EXCEPTION 'Resend webhook receipt ledger PK or RLS is missing';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM (VALUES
      ('svix_id', 'text', 'NO', NULL::TEXT),
      ('event_type', 'text', 'NO', NULL::TEXT),
      ('resend_email_id', 'text', 'YES', NULL::TEXT),
      ('event_created_at', 'timestamptz', 'NO', NULL::TEXT),
      ('received_at', 'timestamptz', 'NO', 'now')
    ) AS required_column(column_name, udt_name, is_nullable, default_marker)
    LEFT JOIN information_schema.columns AS actual_column
      ON actual_column.table_schema = 'public'
      AND actual_column.table_name = 'resend_webhook_events'
      AND actual_column.column_name = required_column.column_name
      AND actual_column.udt_name = required_column.udt_name
      AND actual_column.is_nullable = required_column.is_nullable
      AND CASE
        WHEN required_column.default_marker IS NULL
          THEN actual_column.column_default IS NULL
        ELSE lower(btrim(COALESCE(actual_column.column_default, ''))) =
          required_column.default_marker || '()'
      END
    WHERE actual_column.column_name IS NULL
  ) OR (
    SELECT count(*)
    FROM information_schema.columns AS actual_column
    WHERE actual_column.table_schema = 'public'
      AND actual_column.table_name = 'resend_webhook_events'
  ) <> 5 OR (
    SELECT count(*)
    FROM pg_constraint AS constraint_definition
    WHERE constraint_definition.conrelid =
      'public.resend_webhook_events'::regclass
      AND constraint_definition.contype <> 'n'
  ) <> 4 OR NOT EXISTS (
    SELECT 1
    FROM pg_constraint AS constraint_definition
    WHERE constraint_definition.conrelid =
        'public.resend_webhook_events'::regclass
      AND constraint_definition.conname =
        'resend_webhook_events_svix_id_check'
      AND constraint_definition.contype = 'c'
      AND constraint_definition.convalidated
      AND lower(replace(replace(regexp_replace(
        pg_get_constraintdef(constraint_definition.oid),
        '[[:space:]]',
        '',
        'g'
      ), '(', ''), ')', '')) =
        'checkchar_lengthsvix_id>=1andchar_lengthsvix_id<=256'
  ) OR NOT EXISTS (
    SELECT 1
    FROM pg_constraint AS constraint_definition
    WHERE constraint_definition.conrelid =
        'public.resend_webhook_events'::regclass
      AND constraint_definition.conname =
        'resend_webhook_events_event_type_check'
      AND constraint_definition.contype = 'c'
      AND constraint_definition.convalidated
      AND lower(replace(replace(regexp_replace(
        pg_get_constraintdef(constraint_definition.oid),
        '[[:space:]]',
        '',
        'g'
      ), '(', ''), ')', '')) =
        'checkchar_lengthevent_type>=1andchar_lengthevent_type<=128'
  ) OR NOT EXISTS (
    SELECT 1
    FROM pg_constraint AS constraint_definition
    WHERE constraint_definition.conrelid =
        'public.resend_webhook_events'::regclass
      AND constraint_definition.conname =
        'resend_webhook_events_resend_email_id_check'
      AND constraint_definition.contype = 'c'
      AND constraint_definition.convalidated
      AND lower(replace(replace(regexp_replace(
        pg_get_constraintdef(constraint_definition.oid),
        '[[:space:]]',
        '',
        'g'
      ), '(', ''), ')', '')) =
        'checkresend_email_idisnullorchar_lengthresend_email_id>=1andchar_lengthresend_email_id<=256'
  ) THEN
    RAISE EXCEPTION 'Resend webhook receipt ledger columns are malformed';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_index AS index_definition
    JOIN pg_class AS index_relation
      ON index_relation.oid = index_definition.indexrelid
    WHERE index_definition.indrelid =
        'public.resend_webhook_events'::regclass
      AND index_relation.relname = 'resend_webhook_events_received_at_idx'
      AND index_relation.relam = (
        SELECT access_method.oid
        FROM pg_am AS access_method
        WHERE access_method.amname = 'btree'
      )
      AND index_definition.indisvalid
      AND index_definition.indisready
      AND index_definition.indislive
      AND NOT index_definition.indisunique
      AND NOT index_definition.indisexclusion
      AND index_definition.indimmediate
      AND index_definition.indnkeyatts = 1
      AND index_definition.indnatts = 1
      AND index_definition.indexprs IS NULL
      AND index_definition.indpred IS NULL
      AND index_definition.indoption[0] = 3
      AND index_definition.indkey[0] = (
        SELECT attribute.attnum
        FROM pg_attribute AS attribute
        WHERE attribute.attrelid = 'public.resend_webhook_events'::regclass
          AND attribute.attname = 'received_at'
          AND NOT attribute.attisdropped
      )
  ) THEN
    RAISE EXCEPTION 'Resend webhook receipt ledger index is malformed';
  END IF;

  IF (
    SELECT count(*)
    FROM pg_index AS index_definition
    WHERE index_definition.indrelid =
      'public.resend_webhook_events'::regclass
  ) <> 2 OR EXISTS (
    SELECT 1
    FROM pg_trigger AS trigger_definition
    WHERE trigger_definition.tgrelid =
        'public.resend_webhook_events'::regclass
      AND NOT trigger_definition.tgisinternal
  ) OR NOT EXISTS (
    SELECT 1
    FROM pg_constraint AS constraint_definition
    JOIN pg_index AS index_definition
      ON index_definition.indexrelid = constraint_definition.conindid
    JOIN pg_class AS index_relation
      ON index_relation.oid = index_definition.indexrelid
    WHERE constraint_definition.conrelid =
        'public.resend_webhook_events'::regclass
      AND constraint_definition.conname = 'resend_webhook_events_pkey'
      AND index_relation.relname = 'resend_webhook_events_pkey'
      AND index_relation.relam = (
        SELECT access_method.oid
        FROM pg_am AS access_method
        WHERE access_method.amname = 'btree'
      )
      AND index_definition.indisprimary
      AND index_definition.indisunique
      AND NOT index_definition.indisexclusion
      AND index_definition.indimmediate
      AND index_definition.indisvalid
      AND index_definition.indisready
      AND index_definition.indislive
      AND index_definition.indnkeyatts = 1
      AND index_definition.indnatts = 1
      AND index_definition.indexprs IS NULL
      AND index_definition.indpred IS NULL
      AND index_definition.indoption[0] = 0
      AND index_definition.indkey[0] = (
        SELECT attribute.attnum
        FROM pg_attribute AS attribute
        WHERE attribute.attrelid = 'public.resend_webhook_events'::regclass
          AND attribute.attname = 'svix_id'
          AND NOT attribute.attisdropped
      )
  ) THEN
    RAISE EXCEPTION 'Resend webhook receipt ledger has hidden write semantics';
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

  IF to_regprocedure(
      'public.begin_workspace_invite(text,text,text,text,uuid)'
    ) IS NULL
    OR to_regprocedure(
      'public.claim_workspace_invite_delivery(uuid,uuid,uuid)'
    ) IS NULL
    OR to_regprocedure(
      'public.release_workspace_invite_delivery_claim(uuid,uuid)'
    ) IS NULL
    OR to_regprocedure(
      'public.finalize_workspace_invite(uuid,uuid,uuid,uuid)'
    ) IS NULL
    OR to_regprocedure(
      'public.finalize_workspace_invite(uuid,uuid,uuid)'
    ) IS NOT NULL
    OR to_regprocedure(
      'public.finalize_workspace_invite(uuid,uuid)'
    ) IS NOT NULL
    OR to_regprocedure(
      'public.find_workspace_invite_auth_user(uuid,uuid,uuid)'
    ) IS NULL
    OR to_regprocedure(
      'public.find_workspace_invite_auth_user(uuid,uuid)'
    ) IS NOT NULL
    OR to_regprocedure(
      'public.revoke_workspace_invite(uuid,uuid,uuid)'
    ) IS NULL
    OR has_function_privilege(
      'authenticated',
      'public.begin_workspace_invite(text,text,text,text,uuid)',
      'EXECUTE'
    )
    OR has_function_privilege(
      'anon',
      'public.begin_workspace_invite(text,text,text,text,uuid)',
      'EXECUTE'
    )
    OR NOT has_function_privilege(
      'service_role',
      'public.begin_workspace_invite(text,text,text,text,uuid)',
      'EXECUTE'
    )
    OR has_function_privilege(
      'authenticated',
      'public.claim_workspace_invite_delivery(uuid,uuid,uuid)',
      'EXECUTE'
    )
    OR has_function_privilege(
      'anon',
      'public.claim_workspace_invite_delivery(uuid,uuid,uuid)',
      'EXECUTE'
    )
    OR NOT has_function_privilege(
      'service_role',
      'public.claim_workspace_invite_delivery(uuid,uuid,uuid)',
      'EXECUTE'
    )
    OR has_function_privilege(
      'authenticated',
      'public.release_workspace_invite_delivery_claim(uuid,uuid)',
      'EXECUTE'
    )
    OR has_function_privilege(
      'anon',
      'public.release_workspace_invite_delivery_claim(uuid,uuid)',
      'EXECUTE'
    )
    OR NOT has_function_privilege(
      'service_role',
      'public.release_workspace_invite_delivery_claim(uuid,uuid)',
      'EXECUTE'
    )
    OR has_function_privilege(
      'authenticated',
      'public.finalize_workspace_invite(uuid,uuid,uuid,uuid)',
      'EXECUTE'
    )
    OR has_function_privilege(
      'anon',
      'public.finalize_workspace_invite(uuid,uuid,uuid,uuid)',
      'EXECUTE'
    )
    OR NOT has_function_privilege(
      'service_role',
      'public.finalize_workspace_invite(uuid,uuid,uuid,uuid)',
      'EXECUTE'
    )
    OR has_function_privilege(
      'authenticated',
      'public.find_workspace_invite_auth_user(uuid,uuid,uuid)',
      'EXECUTE'
    )
    OR has_function_privilege(
      'anon',
      'public.find_workspace_invite_auth_user(uuid,uuid,uuid)',
      'EXECUTE'
    )
    OR NOT has_function_privilege(
      'service_role',
      'public.find_workspace_invite_auth_user(uuid,uuid,uuid)',
      'EXECUTE'
    )
    OR has_function_privilege(
      'authenticated',
      'public.revoke_workspace_invite(uuid,uuid,uuid)',
      'EXECUTE'
    )
    OR has_function_privilege(
      'anon',
      'public.revoke_workspace_invite(uuid,uuid,uuid)',
      'EXECUTE'
    )
    OR NOT has_function_privilege(
      'service_role',
      'public.revoke_workspace_invite(uuid,uuid,uuid)',
      'EXECUTE'
    )
  THEN
    RAISE EXCEPTION 'workspace invite provisioning RPC grants are incorrect';
  END IF;

  -- Keep the app-only candidate equality branch inside the contradictory-
  -- ownership precheck itself. The broader marker assertion below also sees
  -- the final candidate query and cannot distinguish that unsafe placement.
  IF pg_get_functiondef(
      'public.begin_workspace_invite(text,text,text,text,uuid)'::regprocedure
    ) NOT ILIKE '%is_platform_admin_identity%workspace_memberships%email_normalized = normalized_email%ORDER BY existing_membership.id%FOR UPDATE%status IN (%''provisioning''%workspace_invite_delivery_claims%claimed_membership.email_normalized = normalized_email%INSERT INTO public.workspaces%INSERT INTO public.workspace_memberships%''provisioning''%workspace.membership.provisioning_started%RETURN jsonb_build_object%'
    OR pg_get_functiondef(
      'public.claim_workspace_invite_delivery(uuid,uuid,uuid)'::regprocedure
    ) NOT ILIKE '%is_platform_admin_identity%FOR UPDATE%membership.status <> ''provisioning''%workspace_invite_delivery_claims%lock_token IS DISTINCT FROM p_lock_token%workspace invite delivery is busy%lock_token = p_lock_token%claim_kind <> ''deliver''%IF FOUND THEN%RETURN membership;%INSERT INTO public.workspace_invite_delivery_claims%review_after%interval ''15 minutes''%'
    OR pg_get_functiondef(
      'public.claim_workspace_invite_delivery(uuid,uuid,uuid)'::regprocedure
    ) ILIKE '%existing_claim.review_after > now()%'
    OR pg_get_functiondef(
      'public.claim_workspace_invite_delivery(uuid,uuid,uuid)'::regprocedure
    ) ILIKE '%ON CONFLICT%'
    OR pg_get_functiondef(
      'public.release_workspace_invite_delivery_claim(uuid,uuid)'::regprocedure
    ) NOT ILIKE '%same_email_membership.email_normalized = membership.email_normalized%ORDER BY same_email_membership.id%FOR UPDATE%SELECT claim.lock_token, claim.claim_kind, claim.acquired_at%existing_lock_token IS DISTINCT FROM p_lock_token%RETURN false%claim_kind = ''revoke_cleanup''%newer_membership.email_normalized = membership.email_normalized%newer_membership.created_at >= membership.created_at%workspace_invite_delivery_claims AS other_claim%JOIN public.workspace_memberships AS other_membership%other_membership.id <> membership.id%historical workspace invitation is superseded%auth.users%auth_user.id = membership.user_id%OR auth_user.raw_user_meta_data%OR auth_user.raw_app_meta_data%claim_kind = ''deliver''%lower(btrim(auth_user.email)) = membership.email_normalized%auth_user.invited_at IS NOT NULL%auth_user.created_at >= claim_acquired_at%Auth cleanup is incomplete%DELETE FROM public.workspace_invite_delivery_claims%lock_token = p_lock_token%RETURN true%'
    OR pg_get_functiondef(
      'public.release_workspace_invite_delivery_claim(uuid,uuid)'::regprocedure
    ) ILIKE '%claim_acquired_at - interval%'
    OR pg_get_functiondef(
      'public.release_workspace_invite_delivery_claim(uuid,uuid)'::regprocedure
    ) ILIKE '%auth_user.created_at >= membership.created_at%'
    OR pg_get_functiondef(
      'public.finalize_workspace_invite(uuid,uuid,uuid,uuid)'::regprocedure
    ) NOT ILIKE '%is_platform_admin_identity%FOR UPDATE%membership.status = ''invited''%membership.user_id = p_auth_user_id%membership.status <> ''provisioning''%workspace_invite_delivery_claims%delivery_lock_token IS DISTINCT FROM p_lock_token%delivery_claim_kind <> ''deliver''%encrypted_password%raw_app_meta_data%workspace_id%raw_app_meta_data%workspace_membership_id%auth_user.id = p_auth_user_id%auth_workspace_id IS NULL%auth_membership_id IS NULL%Auth identity is not ready%auth_email IS DISTINCT FROM membership.email_normalized%auth_workspace_id IS DISTINCT FROM membership.workspace_id%auth_membership_id IS DISTINCT FROM membership.id%auth_invited_at IS NULL%auth_created_at < membership.created_at%auth_confirmed_at IS NOT NULL%auth_last_sign_in_at IS NOT NULL%auth_has_password%is_platform_admin_email(auth_email)%status = ''invited''%invited_at = auth_invited_at%invite_expires_at = auth_invited_at%workspace.membership.invited%DELETE FROM public.workspace_invite_delivery_claims%claim.lock_token = p_lock_token%'
    OR pg_get_functiondef(
      'public.find_workspace_invite_auth_user(uuid,uuid,uuid)'::regprocedure
    ) NOT ILIKE '%is_platform_admin_identity%same_email_membership.email_normalized = membership.email_normalized%ORDER BY same_email_membership.id%FOR UPDATE%SELECT claim.lock_token, claim.claim_kind%existing_lock_token IS DISTINCT FROM p_lock_token%existing_claim_kind = ''revoke_cleanup''%newer_membership.email_normalized = membership.email_normalized%newer_membership.created_at >= membership.created_at%workspace_invite_delivery_claims AS other_claim%other_membership.id <> membership.id%historical workspace invitation is superseded%raw_app_meta_data%workspace_membership_id%<> membership.id%raw_app_meta_data%workspace_id%<> membership.workspace_id%bound_membership.user_id = auth_user.id%unsafe: contradictory ownership%array_agg(auth_user.id%auth_user.id = membership.user_id%raw_user_meta_data%workspace_membership_id%raw_user_meta_data%workspace_id%membership.workspace_id%auth_user.invited_at IS NOT NULL%auth_user.created_at >= membership.created_at%raw_app_meta_data%workspace_membership_id%raw_app_meta_data%workspace_id%membership.workspace_id%cardinality(candidate_user_ids) <> 1%Auth identity is ambiguous%is_platform_admin_email(candidate_emails[1])%'
    OR pg_get_functiondef(
      'public.find_workspace_invite_auth_user(uuid,uuid,uuid)'::regprocedure
    ) NOT ILIKE '%WHERE (%auth_user.id = membership.user_id%OR auth_user.raw_user_meta_data ->> ''workspace_membership_id'' = membership.id::text%OR (%auth_user.raw_app_meta_data ->> ''workspace_membership_id'' = membership.id::text%AND auth_user.raw_app_meta_data ->> ''workspace_id'' = membership.workspace_id::text%)%)%AND (%auth_user.raw_app_meta_data ->> ''workspace_membership_id'' IS NOT NULL%<> membership.id::text%OR (%auth_user.raw_app_meta_data ->> ''workspace_id'' IS NOT NULL%<> membership.workspace_id::text%OR EXISTS (%bound_membership.user_id = auth_user.id%'
    OR pg_get_functiondef(
      'public.find_workspace_invite_auth_user(uuid,uuid,uuid)'::regprocedure
    ) ILIKE '%LIMIT 1%'
    OR pg_get_functiondef(
      'public.revoke_workspace_invite(uuid,uuid,uuid)'::regprocedure
    ) NOT ILIKE '%is_platform_admin_identity%WHERE existing_membership.id = p_membership_id;%same_email_membership.email_normalized = membership.email_normalized%ORDER BY same_email_membership.id%FOR UPDATE%WHERE existing_membership.id = p_membership_id%FOR UPDATE%membership.status = ''revoked''%newer_membership.email_normalized = membership.email_normalized%newer_membership.created_at >= membership.created_at%workspace_invite_delivery_claims AS other_claim%other_membership.id <> membership.id%historical workspace invitation is superseded%workspace_invite_delivery_claims%FOR UPDATE%lock_token IS DISTINCT FROM p_lock_token%claim_kind <> ''revoke_cleanup''%IF FOUND THEN%membership.status <> ''revoked''%RETURN membership%membership.status NOT IN (''provisioning'', ''invited'', ''revoked'')%status = ''revoked''%DELETE FROM public.client_portal_sessions%DELETE FROM public.client_portal_tokens%workspace.membership.revoked%INSERT INTO public.workspace_invite_delivery_claims%review_after%''revoke_cleanup''%interval ''15 minutes''%'
    OR pg_get_functiondef(
      'public.revoke_workspace_invite(uuid,uuid,uuid)'::regprocedure
    ) ILIKE '%ON CONFLICT%'
    OR pg_get_functiondef(
      'public.accept_workspace_invite(uuid,uuid,text)'::regprocedure
    ) NOT ILIKE '%encrypted_password%password setup is required%membership.status <> ''invited''%'
  THEN
    RAISE EXCEPTION 'workspace invitation provisioning is not fail-closed and auditable';
  END IF;

  -- Static Edge regression requirement: manage-workspace-users must evaluate
  -- inviteRedirectUrl() before claimInviteDelivery(), then pass that already
  -- validated value to inviteUserByEmail(). A missing/invalid redirect after
  -- provisioning must create no delivery claim and retry_invite must remain
  -- available. Provider fallback fixtures must prove an unmarked same-email
  -- Auth row created before claim.acquired_at is excluded and one created at
  -- or after claim.acquired_at is included only for claim_kind = 'deliver'.
  -- Revoke-cleanup fixtures must also prove that any newer membership B
  -- (regardless of status), or any other same-email membership with a claim,
  -- permanently supersedes A. Even when B's Auth user matches A solely through
  -- A's exact trusted app-metadata membership+workspace markers, B's membership
  -- binding is contradictory ownership and must fail before candidate selection.

  IF to_regclass('public.workspace_invite_delivery_claims') IS NULL
    OR NOT (
      SELECT relation.relrowsecurity
        AND NOT relation.relforcerowsecurity
        AND relation.relkind = 'r'
        AND relation.relpersistence = 'p'
        AND NOT relation.relispartition
      FROM pg_class AS relation
      WHERE relation.oid = 'public.workspace_invite_delivery_claims'::regclass
    )
    OR has_table_privilege('anon', 'public.workspace_invite_delivery_claims', 'SELECT')
    OR has_table_privilege('authenticated', 'public.workspace_invite_delivery_claims', 'SELECT')
    OR has_table_privilege('service_role', 'public.workspace_invite_delivery_claims', 'SELECT')
    OR has_table_privilege('service_role', 'public.workspace_invite_delivery_claims', 'INSERT')
    OR has_table_privilege('service_role', 'public.workspace_invite_delivery_claims', 'UPDATE')
    OR has_table_privilege('service_role', 'public.workspace_invite_delivery_claims', 'DELETE')
    OR EXISTS (
      SELECT 1
      FROM (VALUES
        ('membership_id', 'uuid', NULL::TEXT),
        ('lock_token', 'uuid', NULL::TEXT),
        ('claim_kind', 'text', NULL::TEXT),
        ('actor_user_id', 'uuid', NULL::TEXT),
        ('acquired_at', 'timestamptz', 'now'),
        ('review_after', 'timestamptz', NULL::TEXT)
      ) AS required_column(column_name, udt_name, default_marker)
      WHERE NOT EXISTS (
        SELECT 1
        FROM information_schema.columns AS existing_column
        WHERE existing_column.table_schema = 'public'
          AND existing_column.table_name = 'workspace_invite_delivery_claims'
          AND existing_column.column_name = required_column.column_name
          AND existing_column.udt_name = required_column.udt_name
          AND existing_column.is_nullable = 'NO'
          AND CASE
            WHEN required_column.default_marker IS NULL
              THEN existing_column.column_default IS NULL
            ELSE lower(btrim(COALESCE(existing_column.column_default, ''))) =
              required_column.default_marker || '()'
          END
      )
    )
    OR (
      SELECT count(*)
      FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name = 'workspace_invite_delivery_claims'
    ) <> 6
    OR (
      SELECT count(*)
      FROM pg_constraint AS constraint_definition
      WHERE constraint_definition.conrelid =
        'public.workspace_invite_delivery_claims'::regclass
        AND constraint_definition.contype <> 'n'
    ) <> 5
    OR (
      SELECT count(*)
      FROM pg_index AS index_definition
      WHERE index_definition.indrelid =
        'public.workspace_invite_delivery_claims'::regclass
    ) <> 3
    OR EXISTS (
      SELECT 1
      FROM pg_trigger AS trigger_definition
      WHERE trigger_definition.tgrelid =
          'public.workspace_invite_delivery_claims'::regclass
        AND NOT trigger_definition.tgisinternal
    )
    OR NOT EXISTS (
      SELECT 1
      FROM pg_constraint AS constraint_definition
      WHERE constraint_definition.conrelid =
          'public.workspace_invite_delivery_claims'::regclass
        AND constraint_definition.conname =
          'workspace_invite_delivery_claims_pkey'
        AND constraint_definition.contype = 'p'
        AND constraint_definition.convalidated
        AND NOT constraint_definition.condeferrable
        AND NOT constraint_definition.condeferred
        AND constraint_definition.conkey = ARRAY[
          (
            SELECT attribute.attnum
            FROM pg_attribute AS attribute
            WHERE attribute.attrelid =
                'public.workspace_invite_delivery_claims'::regclass
              AND attribute.attname = 'membership_id'
              AND NOT attribute.attisdropped
          )
        ]::SMALLINT[]
    )
    OR NOT EXISTS (
      SELECT 1
      FROM pg_constraint AS constraint_definition
      WHERE constraint_definition.conrelid =
          'public.workspace_invite_delivery_claims'::regclass
        AND constraint_definition.conname =
          'workspace_invite_delivery_claims_membership_id_fkey'
        AND constraint_definition.confrelid =
          'public.workspace_memberships'::regclass
        AND constraint_definition.contype = 'f'
        AND constraint_definition.confdeltype = 'r'
        AND constraint_definition.confupdtype = 'a'
        AND constraint_definition.confmatchtype = 's'
        AND constraint_definition.convalidated
        AND NOT constraint_definition.condeferrable
        AND NOT constraint_definition.condeferred
        AND constraint_definition.conkey = ARRAY[
          (
            SELECT attribute.attnum
            FROM pg_attribute AS attribute
            WHERE attribute.attrelid =
                'public.workspace_invite_delivery_claims'::regclass
              AND attribute.attname = 'membership_id'
              AND NOT attribute.attisdropped
          )
        ]::SMALLINT[]
        AND constraint_definition.confkey = ARRAY[
          (
            SELECT attribute.attnum
            FROM pg_attribute AS attribute
            WHERE attribute.attrelid = 'public.workspace_memberships'::regclass
              AND attribute.attname = 'id'
              AND NOT attribute.attisdropped
          )
        ]::SMALLINT[]
    )
    OR NOT EXISTS (
      SELECT 1
      FROM pg_constraint AS constraint_definition
      WHERE constraint_definition.conrelid =
          'public.workspace_invite_delivery_claims'::regclass
        AND constraint_definition.conname =
          'workspace_invite_delivery_claims_lock_token_key'
        AND constraint_definition.contype = 'u'
        AND constraint_definition.convalidated
        AND NOT constraint_definition.condeferrable
        AND NOT constraint_definition.condeferred
        AND constraint_definition.conkey = ARRAY[
          (
            SELECT attribute.attnum
            FROM pg_attribute AS attribute
            WHERE attribute.attrelid =
                'public.workspace_invite_delivery_claims'::regclass
              AND attribute.attname = 'lock_token'
              AND NOT attribute.attisdropped
          )
        ]::SMALLINT[]
    )
    OR NOT EXISTS (
      SELECT 1
      FROM pg_constraint
      WHERE conrelid = 'public.workspace_invite_delivery_claims'::regclass
        AND conname = 'workspace_invite_delivery_claims_claim_kind_check'
        AND contype = 'c'
        AND convalidated
        AND replace(replace(regexp_replace(
          pg_get_constraintdef(oid),
          '[[:space:]]',
          '',
          'g'
        ), '(', ''), ')', '') =
          'CHECKclaim_kind=ANYARRAY[''deliver''::text,''revoke_cleanup''::text]'
    )
    OR NOT EXISTS (
      SELECT 1
      FROM pg_constraint
      WHERE conrelid = 'public.workspace_invite_delivery_claims'::regclass
        AND conname = 'workspace_invite_delivery_claims_review_check'
        AND contype = 'c'
        AND convalidated
        AND replace(replace(regexp_replace(
          pg_get_constraintdef(oid),
          '[[:space:]]',
          '',
          'g'
        ), '(', ''), ')', '') = 'CHECKreview_after>acquired_at'
    )
    OR EXISTS (
      SELECT 1
      FROM (VALUES
        (
          'workspace_invite_delivery_claims_pkey',
          'membership_id',
          true,
          true
        ),
        (
          'workspace_invite_delivery_claims_lock_token_key',
          'lock_token',
          true,
          false
        ),
        (
          'workspace_invite_delivery_claims_review_idx',
          'review_after',
          false,
          false
        )
      ) AS required_index(index_name, column_name, is_unique, is_primary)
      WHERE NOT EXISTS (
        SELECT 1
        FROM pg_index AS index_definition
        JOIN pg_class AS index_relation
          ON index_relation.oid = index_definition.indexrelid
        WHERE index_definition.indrelid =
            'public.workspace_invite_delivery_claims'::regclass
          AND index_relation.relname = required_index.index_name
          AND index_relation.relam = (
            SELECT access_method.oid
            FROM pg_am AS access_method
            WHERE access_method.amname = 'btree'
          )
          AND index_definition.indisunique = required_index.is_unique
          AND index_definition.indisprimary = required_index.is_primary
          AND NOT index_definition.indisexclusion
          AND index_definition.indimmediate
          AND index_definition.indisvalid
          AND index_definition.indisready
          AND index_definition.indislive
          AND index_definition.indnkeyatts = 1
          AND index_definition.indnatts = 1
          AND index_definition.indexprs IS NULL
          AND index_definition.indpred IS NULL
          AND index_definition.indoption[0] = 0
          AND index_definition.indclass[0] = (
            SELECT operator_class.oid
            FROM pg_opclass AS operator_class
            JOIN pg_am AS access_method
              ON access_method.oid = operator_class.opcmethod
            JOIN pg_attribute AS attribute
              ON attribute.attrelid =
                'public.workspace_invite_delivery_claims'::regclass
              AND attribute.attname = required_index.column_name
              AND NOT attribute.attisdropped
            WHERE access_method.amname = 'btree'
              AND operator_class.opcdefault
              AND operator_class.opcintype = attribute.atttypid
          )
          AND index_definition.indcollation[0] = (
            SELECT attribute.attcollation
            FROM pg_attribute AS attribute
            WHERE attribute.attrelid =
                'public.workspace_invite_delivery_claims'::regclass
              AND attribute.attname = required_index.column_name
              AND NOT attribute.attisdropped
          )
          AND index_definition.indkey[0] = (
            SELECT attribute.attnum
            FROM pg_attribute AS attribute
            WHERE attribute.attrelid =
                'public.workspace_invite_delivery_claims'::regclass
              AND attribute.attname = required_index.column_name
              AND NOT attribute.attisdropped
          )
      )
    )
  THEN
    RAISE EXCEPTION 'workspace invite delivery claims are not service-function-only';
  END IF;

  IF EXISTS (SELECT 1 FROM public.workspace_invite_delivery_claims) THEN
    RAISE EXCEPTION 'an unresolved workspace invite delivery claim remains';
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

  IF to_regclass('public.workspace_auth_lifecycle_claims') IS NULL
    OR NOT (
      SELECT relation.relrowsecurity
        AND NOT relation.relforcerowsecurity
        AND relation.relkind = 'r'
        AND relation.relpersistence = 'p'
        AND NOT relation.relispartition
      FROM pg_class AS relation
      WHERE relation.oid = 'public.workspace_auth_lifecycle_claims'::regclass
    )
    OR has_table_privilege('anon', 'public.workspace_auth_lifecycle_claims', 'SELECT')
    OR has_table_privilege('authenticated', 'public.workspace_auth_lifecycle_claims', 'SELECT')
    OR has_table_privilege('service_role', 'public.workspace_auth_lifecycle_claims', 'SELECT')
    OR has_table_privilege('service_role', 'public.workspace_auth_lifecycle_claims', 'INSERT')
    OR has_table_privilege('service_role', 'public.workspace_auth_lifecycle_claims', 'UPDATE')
    OR has_table_privilege('service_role', 'public.workspace_auth_lifecycle_claims', 'DELETE')
    OR EXISTS (
      SELECT 1
      FROM (VALUES
        ('membership_id', 'uuid', NULL::TEXT),
        ('lock_token', 'uuid', NULL::TEXT),
        ('action', 'text', NULL::TEXT),
        ('desired_status', 'text', NULL::TEXT),
        ('actor_user_id', 'uuid', NULL::TEXT),
        ('acquired_at', 'timestamptz', 'now'),
        ('review_after', 'timestamptz', NULL::TEXT)
      ) AS required_column(column_name, udt_name, default_marker)
      WHERE NOT EXISTS (
        SELECT 1
        FROM information_schema.columns AS existing_column
        WHERE existing_column.table_schema = 'public'
          AND existing_column.table_name = 'workspace_auth_lifecycle_claims'
          AND existing_column.column_name = required_column.column_name
          AND existing_column.udt_name = required_column.udt_name
          AND existing_column.is_nullable = 'NO'
          AND CASE
            WHEN required_column.default_marker IS NULL
              THEN existing_column.column_default IS NULL
            ELSE lower(btrim(COALESCE(existing_column.column_default, ''))) =
              required_column.default_marker || '()'
          END
      )
    )
    OR (
      SELECT count(*)
      FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name = 'workspace_auth_lifecycle_claims'
    ) <> 7
    OR (
      SELECT count(*)
      FROM pg_constraint AS constraint_definition
      WHERE constraint_definition.conrelid =
          'public.workspace_auth_lifecycle_claims'::regclass
        AND constraint_definition.contype <> 'n'
    ) <> 7
    OR (
      SELECT count(*)
      FROM pg_index AS index_definition
      WHERE index_definition.indrelid =
        'public.workspace_auth_lifecycle_claims'::regclass
    ) <> 3
    OR EXISTS (
      SELECT 1
      FROM pg_trigger AS trigger_definition
      WHERE trigger_definition.tgrelid =
          'public.workspace_auth_lifecycle_claims'::regclass
        AND NOT trigger_definition.tgisinternal
    )
    OR EXISTS (
      SELECT 1
      FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name = 'workspace_auth_lifecycle_claims'
        AND column_name = 'expires_at'
    )
    OR NOT EXISTS (
      SELECT 1
      FROM pg_constraint AS constraint_definition
      WHERE constraint_definition.conrelid =
          'public.workspace_auth_lifecycle_claims'::regclass
        AND constraint_definition.conname =
          'workspace_auth_lifecycle_claims_pkey'
        AND constraint_definition.contype = 'p'
        AND constraint_definition.convalidated
        AND NOT constraint_definition.condeferrable
        AND NOT constraint_definition.condeferred
        AND constraint_definition.conkey = ARRAY[
          (
            SELECT attribute.attnum
            FROM pg_attribute AS attribute
            WHERE attribute.attrelid =
                'public.workspace_auth_lifecycle_claims'::regclass
              AND attribute.attname = 'membership_id'
              AND NOT attribute.attisdropped
          )
        ]::SMALLINT[]
    )
    OR NOT EXISTS (
      SELECT 1
      FROM pg_constraint AS constraint_definition
      WHERE constraint_definition.conrelid =
          'public.workspace_auth_lifecycle_claims'::regclass
        AND constraint_definition.conname =
          'workspace_auth_lifecycle_claims_membership_id_fkey'
        AND constraint_definition.contype = 'f'
        AND constraint_definition.confrelid =
          'public.workspace_memberships'::regclass
        AND constraint_definition.confdeltype = 'r'
        AND constraint_definition.confupdtype = 'a'
        AND constraint_definition.confmatchtype = 's'
        AND constraint_definition.convalidated
        AND NOT constraint_definition.condeferrable
        AND NOT constraint_definition.condeferred
        AND constraint_definition.conkey = ARRAY[
          (
            SELECT attribute.attnum
            FROM pg_attribute AS attribute
            WHERE attribute.attrelid =
                'public.workspace_auth_lifecycle_claims'::regclass
              AND attribute.attname = 'membership_id'
              AND NOT attribute.attisdropped
          )
        ]::SMALLINT[]
        AND constraint_definition.confkey = ARRAY[
          (
            SELECT attribute.attnum
            FROM pg_attribute AS attribute
            WHERE attribute.attrelid = 'public.workspace_memberships'::regclass
              AND attribute.attname = 'id'
              AND NOT attribute.attisdropped
          )
        ]::SMALLINT[]
    )
    OR NOT EXISTS (
      SELECT 1
      FROM pg_constraint AS constraint_definition
      WHERE constraint_definition.conrelid =
          'public.workspace_auth_lifecycle_claims'::regclass
        AND constraint_definition.conname =
          'workspace_auth_lifecycle_claims_lock_token_key'
        AND constraint_definition.contype = 'u'
        AND constraint_definition.convalidated
        AND NOT constraint_definition.condeferrable
        AND NOT constraint_definition.condeferred
        AND constraint_definition.conkey = ARRAY[
          (
            SELECT attribute.attnum
            FROM pg_attribute AS attribute
            WHERE attribute.attrelid =
                'public.workspace_auth_lifecycle_claims'::regclass
              AND attribute.attname = 'lock_token'
              AND NOT attribute.attisdropped
          )
        ]::SMALLINT[]
    )
    OR NOT EXISTS (
      SELECT 1
      FROM pg_constraint
      WHERE conrelid = 'public.workspace_auth_lifecycle_claims'::regclass
        AND conname = 'workspace_auth_lifecycle_claims_action_check'
        AND contype = 'c'
        AND convalidated
        AND replace(replace(regexp_replace(
          pg_get_constraintdef(oid),
          '[[:space:]]',
          '',
          'g'
        ), '(', ''), ')', '') =
          'CHECKaction=ANYARRAY[''suspend''::text,''reactivate''::text,''reconcile_active''::text,''reconcile_suspended''::text]'
    )
    OR NOT EXISTS (
      SELECT 1
      FROM pg_constraint
      WHERE conrelid = 'public.workspace_auth_lifecycle_claims'::regclass
        AND conname = 'workspace_auth_lifecycle_claims_desired_status_check'
        AND contype = 'c'
        AND convalidated
        AND replace(replace(regexp_replace(
          pg_get_constraintdef(oid),
          '[[:space:]]',
          '',
          'g'
        ), '(', ''), ')', '') =
          'CHECKdesired_status=ANYARRAY[''active''::text,''suspended''::text]'
    )
    OR NOT EXISTS (
      SELECT 1
      FROM pg_constraint
      WHERE conrelid = 'public.workspace_auth_lifecycle_claims'::regclass
        AND conname = 'workspace_auth_lifecycle_claims_action_status_check'
        AND contype = 'c'
        AND convalidated
        AND replace(replace(regexp_replace(
          pg_get_constraintdef(oid),
          '[[:space:]]',
          '',
          'g'
        ), '(', ''), ')', '') =
          'CHECKaction=ANYARRAY[''suspend''::text,''reconcile_suspended''::text]ANDdesired_status=''suspended''::textORaction=ANYARRAY[''reactivate''::text,''reconcile_active''::text]ANDdesired_status=''active''::text'
    )
    OR NOT EXISTS (
      SELECT 1
      FROM pg_constraint
      WHERE conrelid = 'public.workspace_auth_lifecycle_claims'::regclass
        AND conname = 'workspace_auth_lifecycle_claims_review_check'
        AND contype = 'c'
        AND convalidated
        AND replace(replace(regexp_replace(
          pg_get_constraintdef(oid),
          '[[:space:]]',
          '',
          'g'
        ), '(', ''), ')', '') = 'CHECKreview_after>acquired_at'
    )
    OR EXISTS (
      SELECT 1
      FROM (VALUES
        (
          'workspace_auth_lifecycle_claims_pkey',
          'membership_id',
          true,
          true
        ),
        (
          'workspace_auth_lifecycle_claims_lock_token_key',
          'lock_token',
          true,
          false
        ),
        (
          'workspace_auth_lifecycle_claims_review_idx',
          'review_after',
          false,
          false
        )
      ) AS required_index(index_name, column_name, is_unique, is_primary)
      WHERE NOT EXISTS (
        SELECT 1
        FROM pg_index AS index_definition
        JOIN pg_class AS index_relation
          ON index_relation.oid = index_definition.indexrelid
        WHERE index_definition.indrelid =
            'public.workspace_auth_lifecycle_claims'::regclass
          AND index_relation.relname = required_index.index_name
          AND index_relation.relam = (
            SELECT access_method.oid
            FROM pg_am AS access_method
            WHERE access_method.amname = 'btree'
          )
          AND index_definition.indisunique = required_index.is_unique
          AND index_definition.indisprimary = required_index.is_primary
          AND NOT index_definition.indisexclusion
          AND index_definition.indimmediate
          AND index_definition.indisvalid
          AND index_definition.indisready
          AND index_definition.indislive
          AND index_definition.indnkeyatts = 1
          AND index_definition.indnatts = 1
          AND index_definition.indexprs IS NULL
          AND index_definition.indpred IS NULL
          AND index_definition.indoption[0] = 0
          AND index_definition.indclass[0] = (
            SELECT operator_class.oid
            FROM pg_opclass AS operator_class
            JOIN pg_am AS access_method
              ON access_method.oid = operator_class.opcmethod
            JOIN pg_attribute AS attribute
              ON attribute.attrelid =
                'public.workspace_auth_lifecycle_claims'::regclass
              AND attribute.attname = required_index.column_name
              AND NOT attribute.attisdropped
            WHERE access_method.amname = 'btree'
              AND operator_class.opcdefault
              AND operator_class.opcintype = attribute.atttypid
          )
          AND index_definition.indcollation[0] = (
            SELECT attribute.attcollation
            FROM pg_attribute AS attribute
            WHERE attribute.attrelid =
                'public.workspace_auth_lifecycle_claims'::regclass
              AND attribute.attname = required_index.column_name
              AND NOT attribute.attisdropped
          )
          AND index_definition.indkey[0] = (
            SELECT attribute.attnum
            FROM pg_attribute AS attribute
            WHERE attribute.attrelid =
                'public.workspace_auth_lifecycle_claims'::regclass
              AND attribute.attname = required_index.column_name
              AND NOT attribute.attisdropped
          )
      )
    )
  THEN
    RAISE EXCEPTION 'workspace Auth lifecycle claims are not service-function-only';
  END IF;

  IF to_regprocedure(
      'public.claim_workspace_auth_lifecycle(uuid,text,uuid,uuid)'
    ) IS NULL
    OR to_regprocedure(
      'public.complete_workspace_auth_lifecycle(uuid,text,uuid,uuid)'
    ) IS NULL
    OR to_regprocedure(
      'public.list_workspace_auth_lifecycle_pending()'
    ) IS NULL
    OR to_regprocedure(
      'public.list_workspace_invite_cleanup_conflicts()'
    ) IS NULL
    OR to_regprocedure(
      'public.list_workspace_invite_reconciliation_pending()'
    ) IS NULL
    OR to_regprocedure(
      'public.release_workspace_auth_lifecycle_claim(uuid,uuid)'
    ) IS NOT NULL
    OR has_function_privilege(
      'authenticated',
      'public.claim_workspace_auth_lifecycle(uuid,text,uuid,uuid)',
      'EXECUTE'
    )
    OR has_function_privilege(
      'anon',
      'public.claim_workspace_auth_lifecycle(uuid,text,uuid,uuid)',
      'EXECUTE'
    )
    OR NOT has_function_privilege(
      'service_role',
      'public.claim_workspace_auth_lifecycle(uuid,text,uuid,uuid)',
      'EXECUTE'
    )
    OR has_function_privilege(
      'authenticated',
      'public.complete_workspace_auth_lifecycle(uuid,text,uuid,uuid)',
      'EXECUTE'
    )
    OR has_function_privilege(
      'anon',
      'public.complete_workspace_auth_lifecycle(uuid,text,uuid,uuid)',
      'EXECUTE'
    )
    OR NOT has_function_privilege(
      'service_role',
      'public.complete_workspace_auth_lifecycle(uuid,text,uuid,uuid)',
      'EXECUTE'
    )
    OR has_function_privilege(
      'authenticated',
      'public.list_workspace_auth_lifecycle_pending()',
      'EXECUTE'
    )
    OR has_function_privilege(
      'anon',
      'public.list_workspace_auth_lifecycle_pending()',
      'EXECUTE'
    )
    OR NOT has_function_privilege(
      'service_role',
      'public.list_workspace_auth_lifecycle_pending()',
      'EXECUTE'
    )
    OR has_function_privilege(
      'authenticated',
      'public.list_workspace_invite_cleanup_conflicts()',
      'EXECUTE'
    )
    OR has_function_privilege(
      'anon',
      'public.list_workspace_invite_cleanup_conflicts()',
      'EXECUTE'
    )
    OR NOT has_function_privilege(
      'service_role',
      'public.list_workspace_invite_cleanup_conflicts()',
      'EXECUTE'
    )
    OR has_function_privilege(
      'authenticated',
      'public.list_workspace_invite_reconciliation_pending()',
      'EXECUTE'
    )
    OR has_function_privilege(
      'anon',
      'public.list_workspace_invite_reconciliation_pending()',
      'EXECUTE'
    )
    OR NOT has_function_privilege(
      'service_role',
      'public.list_workspace_invite_reconciliation_pending()',
      'EXECUTE'
    )
  THEN
    RAISE EXCEPTION 'workspace Auth lifecycle claim EXECUTE grants are incorrect';
  END IF;

  IF pg_get_functiondef(
      'public.claim_workspace_auth_lifecycle(uuid,text,uuid,uuid)'::regprocedure
    ) NOT ILIKE '%p_action NOT IN (%''suspend''%''reactivate''%''reconcile_active''%''reconcile_suspended''%FOR UPDATE%workspace_auth_lifecycle_claims%lock_token IS DISTINCT FROM p_lock_token%workspace Auth lifecycle is busy%existing_claim.action IS DISTINCT FROM p_action%existing_claim.desired_status IS DISTINCT FROM desired_status%existing_claim.actor_user_id IS DISTINCT FROM p_actor_user_id%IF FOUND THEN%membership.status IS DISTINCT FROM desired_status%RETURN membership%'
    OR pg_get_functiondef(
      'public.claim_workspace_auth_lifecycle(uuid,text,uuid,uuid)'::regprocedure
    ) ILIKE '%existing_claim.review_after > now()%'
    OR pg_get_functiondef(
      'public.claim_workspace_auth_lifecycle(uuid,text,uuid,uuid)'::regprocedure
    ) ILIKE '%ON CONFLICT%'
    OR pg_get_functiondef(
      'public.claim_workspace_auth_lifecycle(uuid,text,uuid,uuid)'::regprocedure
    ) NOT ILIKE '%p_action IN (''reactivate'', ''reconcile_active'')%auth_email IS DISTINCT FROM membership.email_normalized%identity mismatch requires manual review%'
    OR pg_get_functiondef(
      'public.claim_workspace_auth_lifecycle(uuid,text,uuid,uuid)'::regprocedure
    ) NOT ILIKE '%p_action = ''suspend'' AND membership.status <> ''active''%p_action = ''reactivate'' AND membership.status <> ''suspended''%p_action = ''reconcile_active'' AND membership.status <> ''active''%status no longer matches active reconciliation%p_action = ''reconcile_suspended'' AND membership.status <> ''suspended''%status no longer matches suspended reconciliation%INSERT INTO public.workspace_auth_lifecycle_claims%action%desired_status%IF p_action = ''suspend'' THEN%transition_workspace_membership%ELSIF p_action = ''reactivate'' THEN%transition_workspace_membership%'
    OR pg_get_functiondef(
      'public.claim_workspace_auth_lifecycle(uuid,text,uuid,uuid)'::regprocedure
    ) NOT ILIKE '%FROM public.workspaces AS workspace%workspace.id = membership.workspace_id%NOT workspace.is_default%workspace.status = CASE membership.status%WHEN ''provisioning'' THEN ''active''%WHEN ''invited'' THEN ''active''%WHEN ''active'' THEN ''active''%WHEN ''suspended'' THEN ''suspended''%WHEN ''revoked'' THEN ''archived''%NOT EXISTS%other_membership.workspace_id = membership.workspace_id%other_membership.id <> membership.id%FOR SHARE%private workspace lifecycle does not match its membership%SELECT claim.*%workspace_auth_lifecycle_claims%'
    OR pg_get_functiondef(
      'public.complete_workspace_auth_lifecycle(uuid,text,uuid,uuid)'::regprocedure
    ) NOT ILIKE '%is_platform_admin_identity%md5(p_lock_token::text)%workspace_memberships%FOR UPDATE%workspace_auth_lifecycle_claims%FOR UPDATE%IF NOT FOUND THEN%workspace_audit_log%workspace.membership.auth_reconciled%audit.request_id = completion_request_id%audit.metadata = jsonb_build_object(%''action'', p_action%''desired_status'', desired_status%RETURN membership%claim is required%existing_claim.lock_token IS DISTINCT FROM p_lock_token%existing_claim.action IS DISTINCT FROM p_action%existing_claim.desired_status IS DISTINCT FROM desired_status%existing_claim.actor_user_id IS DISTINCT FROM p_actor_user_id%membership.status IS DISTINCT FROM desired_status%INSERT INTO public.workspace_audit_log%''workspace.membership.auth_reconciled''%jsonb_build_object(%''action'', existing_claim.action%''desired_status'', existing_claim.desired_status%completion_request_id%DELETE FROM public.workspace_auth_lifecycle_claims%claim.lock_token = p_lock_token%IF NOT FOUND THEN%claim was lost%RETURN membership%'
    OR pg_get_functiondef(
      'public.complete_workspace_auth_lifecycle(uuid,text,uuid,uuid)'::regprocedure
    ) NOT ILIKE '%FROM public.workspaces AS workspace%workspace.id = membership.workspace_id%NOT workspace.is_default%workspace.status = CASE membership.status%WHEN ''provisioning'' THEN ''active''%WHEN ''invited'' THEN ''active''%WHEN ''active'' THEN ''active''%WHEN ''suspended'' THEN ''suspended''%WHEN ''revoked'' THEN ''archived''%NOT EXISTS%other_membership.workspace_id = membership.workspace_id%other_membership.id <> membership.id%FOR SHARE%private workspace lifecycle does not match its membership%SELECT claim.*%workspace_auth_lifecycle_claims%'
    OR pg_get_functiondef(
      'public.complete_workspace_auth_lifecycle(uuid,text,uuid,uuid)'::regprocedure
    ) ~* 'jsonb_build_object[[:space:]]*\([^;]*p_lock_token'
    OR pg_get_function_result(
      'public.list_workspace_auth_lifecycle_pending()'::regprocedure
    ) NOT ILIKE '%membership_id uuid%review_after timestamp with time zone%'
    OR pg_get_functiondef(
      'public.list_workspace_auth_lifecycle_pending()'::regprocedure
    ) NOT ILIKE '%auth.role() <> ''service_role''%SELECT claim.membership_id, claim.review_after%workspace_auth_lifecycle_claims%'
    OR pg_get_functiondef(
      'public.list_workspace_auth_lifecycle_pending()'::regprocedure
    ) ILIKE '%lock_token%'
    OR pg_get_functiondef(
      'public.list_workspace_auth_lifecycle_pending()'::regprocedure
    ) ILIKE '%actor_user_id%'
    OR pg_get_function_result(
      'public.list_workspace_invite_cleanup_conflicts()'::regprocedure
    ) NOT ILIKE '%membership_id uuid%has_newer_membership boolean%'
    OR pg_get_functiondef(
      'public.list_workspace_invite_cleanup_conflicts()'::regprocedure
    ) NOT ILIKE '%auth.role() <> ''service_role''%historical_membership.status = ''revoked''%newer_membership.created_at >= historical_membership.created_at%workspace_invite_delivery_claims AS other_claim%other_membership.id <> historical_membership.id%'
    OR pg_get_functiondef(
      'public.list_workspace_invite_cleanup_conflicts()'::regprocedure
    ) ILIKE '%lock_token%'
    OR pg_get_functiondef(
      'public.list_workspace_invite_cleanup_conflicts()'::regprocedure
    ) ILIKE '%actor_user_id%'
    OR pg_get_function_result(
      'public.list_workspace_invite_reconciliation_pending()'::regprocedure
    ) NOT ILIKE '%membership_id uuid%claim_kind text%review_after timestamp with time zone%'
    OR pg_get_functiondef(
      'public.list_workspace_invite_reconciliation_pending()'::regprocedure
    ) NOT ILIKE '%auth.role() <> ''service_role''%SELECT claim.membership_id, claim.claim_kind, claim.review_after%workspace_invite_delivery_claims%'
    OR pg_get_functiondef(
      'public.list_workspace_invite_reconciliation_pending()'::regprocedure
    ) ILIKE '%lock_token%'
    OR pg_get_functiondef(
      'public.list_workspace_invite_reconciliation_pending()'::regprocedure
    ) ILIKE '%actor_user_id%'
  THEN
    RAISE EXCEPTION 'workspace Auth lifecycle claim serialization is unsafe';
  END IF;

  -- Static Edge/UI regression requirement: reconcile_active and
  -- reconcile_suspended must be sent unchanged end to end; neither may alias
  -- suspend/reactivate. Claim projections may expose only pending state,
  -- review_after, and invite claim_kind (never lock_token or actor_user_id),
  -- and the UI must disable all lifecycle/invite actions while pending.
  -- Staging must hold a stale reconcile dialog across a
  -- concurrent transition and prove the locked claim rejects it without
  -- changing membership/workspace state. It must also prove a fresh normal
  -- action against an already-desired state is rejected, while a same-token
  -- lost-response retry returns the original claim/completion exactly once.

  IF EXISTS (SELECT 1 FROM public.workspace_auth_lifecycle_claims) THEN
    RAISE EXCEPTION 'an unresolved workspace Auth lifecycle claim remains';
  END IF;

  IF pg_get_functiondef(
    'public.transition_workspace_membership(uuid,text,uuid)'::regprocedure
  ) NOT ILIKE '%p_action IS NULL%p_action NOT IN (''suspend'', ''reactivate'')%'
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
    ) NOT ILIKE '%bound_auth_email%IF NOT FOUND THEN%Auth identity is missing%admin_users%bound_auth_email%platform administrators cannot be changed here%'
    OR pg_get_functiondef(
      'public.transition_workspace_membership(uuid,text,uuid)'::regprocedure
    ) ILIKE '%bound_auth_email IS DISTINCT FROM membership.email_normalized%'
    OR pg_get_functiondef(
      'public.transition_workspace_membership(uuid,text,uuid)'::regprocedure
    ) ILIKE '%revoke_pending%'
    OR pg_get_functiondef(
      'public.transition_workspace_membership(uuid,text,uuid)'::regprocedure
    ) ILIKE '%workspace_invite_delivery_claims%'
    OR pg_get_functiondef(
      'public.transition_workspace_membership(uuid,text,uuid)'::regprocedure
    ) ILIKE '%workspace.membership.revoked%'
    OR pg_get_functiondef(
      'public.transition_workspace_membership(uuid,text,uuid)'::regprocedure
    ) ILIKE '%status = ''revoked''%'
  THEN
    RAISE EXCEPTION 'workspace lifecycle transition exposes an unsafe revocation path';
  END IF;

  -- Staging fixture requirement: use a real non-admin Auth user in an active
  -- private workspace with zero client_portal_sessions/client_portal_tokens.
  -- As service_role, suspend then reactivate that membership and assert both
  -- returned membership/workspace states plus their audit actions. Pending
  -- invitation revocation must be tested only through revoke_workspace_invite,
  -- including its durable revoke_cleanup claim and verified Auth deletion.

  IF EXISTS (
    SELECT 1
    FROM public.client_portal_sessions AS session
    JOIN public.clients AS client
      ON client.id = session.client_id
    JOIN public.workspaces AS workspace
      ON workspace.id = client.workspace_id
    WHERE workspace.status <> 'active'
      OR EXISTS (
        SELECT 1
        FROM public.workspace_memberships AS membership
        WHERE membership.workspace_id = workspace.id
          AND membership.status IN ('suspended', 'revoked')
      )
  ) OR EXISTS (
    SELECT 1
    FROM public.client_portal_tokens AS token
    JOIN public.clients AS client
      ON client.id = token.client_id
    JOIN public.workspaces AS workspace
      ON workspace.id = client.workspace_id
    WHERE workspace.status <> 'active'
      OR EXISTS (
        SELECT 1
        FROM public.workspace_memberships AS membership
        WHERE membership.workspace_id = workspace.id
          AND membership.status IN ('suspended', 'revoked')
      )
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
    ) NOT ILIKE '%JOIN auth.users%lower(btrim(auth_user.email)) = membership.email_normalized%'
    OR pg_get_functiondef(
      'public.workspace_client_operation(text,uuid,uuid,jsonb,uuid)'::regprocedure
    ) ILIKE '%FOR SHARE OF membership, workspace%'
    OR pg_get_functiondef(
      'public.workspace_client_operation(text,uuid,uuid,jsonb,uuid)'::regprocedure
    ) NOT ILIKE '%jsonb_object_keys%workspace_audit_log%workspace.client.created%workspace_audit_log%workspace.client.updated%workspace_audit_log%workspace.client.deleted%'
    OR pg_get_functiondef(
      'public.workspace_client_operation(text,uuid,uuid,jsonb,uuid)'::regprocedure
    ) NOT ILIKE '%normalized_linkedin%''^https?://[^[:space:][:cntrl:]]+$''%'
    OR pg_get_functiondef(
      'public.workspace_client_operation(text,uuid,uuid,jsonb,uuid)'::regprocedure
    ) NOT ILIKE '%normalized_website%''^https?://[^[:space:][:cntrl:]]+$''%'
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

DO $$
DECLARE
  cancel_definition TEXT;
  claim_definition TEXT;
  complete_revocation_definition TEXT;
  finalize_definition TEXT;
  find_revocation_auth_definition TEXT;
  list_reconciliation_definition TEXT;
  reconcile_definition TEXT;
  release_definition TEXT;
  revoke_definition TEXT;
  required_function TEXT;
BEGIN
  IF EXISTS (
    SELECT 1
    FROM (VALUES
      ('provisioning_method', 'text', 'NO'),
      ('password_change_required', 'boolean', 'NO'),
      ('workspace_access_not_before_epoch', 'bigint', 'NO')
    ) AS expected(column_name, data_type, is_nullable)
    LEFT JOIN information_schema.columns AS actual
      ON actual.table_schema = 'public'
      AND actual.table_name = 'workspace_memberships'
      AND actual.column_name = expected.column_name
      AND actual.data_type = expected.data_type
      AND actual.is_nullable = expected.is_nullable
    WHERE actual.column_name IS NULL
  ) THEN
    RAISE EXCEPTION 'manual workspace credential columns are missing or malformed';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_class AS relation
    WHERE relation.oid = 'public.workspace_account_credential_claims'::regclass
      AND relation.relrowsecurity
      AND relation.relkind = 'r'
  ) OR has_table_privilege('anon', 'public.workspace_account_credential_claims', 'SELECT')
    OR has_table_privilege('authenticated', 'public.workspace_account_credential_claims', 'SELECT')
    OR has_table_privilege('service_role', 'public.workspace_account_credential_claims', 'SELECT')
  THEN
    RAISE EXCEPTION 'workspace credential claims are not service-function-only';
  END IF;

  IF EXISTS (
    SELECT expected.column_name
    FROM (VALUES
      ('membership_id', 'uuid', 'NO'),
      ('attempt_id', 'uuid', 'NO'),
      ('execution_id', 'uuid', 'NO'),
      ('claim_kind', 'text', 'NO'),
      ('actor_user_id', 'uuid', 'NO'),
      ('acquired_at', 'timestamp with time zone', 'NO'),
      ('review_after', 'timestamp with time zone', 'NO')
    ) AS expected(column_name, data_type, is_nullable)
    LEFT JOIN information_schema.columns AS actual
      ON actual.table_schema = 'public'
      AND actual.table_name = 'workspace_account_credential_claims'
      AND actual.column_name = expected.column_name
      AND actual.data_type = expected.data_type
      AND actual.is_nullable = expected.is_nullable
    WHERE actual.column_name IS NULL
  ) OR (
    SELECT count(*)
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'workspace_account_credential_claims'
  ) <> 7 THEN
    RAISE EXCEPTION 'workspace credential claim shape is malformed';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conrelid = 'public.workspace_memberships'::regclass
      AND conname = 'workspace_memberships_password_change_state_check'
      AND pg_get_constraintdef(oid) ILIKE '%password_change_required%admin_temporary_password%status = ''invited''%'
  ) THEN
    RAISE EXCEPTION 'manual password-change membership invariant is missing';
  END IF;

  FOREACH required_function IN ARRAY ARRAY[
    'public.begin_workspace_password_account(text,text,text,text,uuid)',
    'public.finalize_workspace_password_account(uuid,uuid,uuid,uuid)',
    'public.cancel_workspace_password_account_provisioning(uuid,uuid,uuid)',
    'public.claim_workspace_account_credential(uuid,text,uuid,uuid,uuid,bigint,bigint,uuid,uuid,boolean)',
    'public.release_workspace_account_credential_claim(uuid,uuid,uuid,uuid)',
    'public.reconcile_workspace_account_credential_claim(uuid,text,uuid,uuid)',
    'public.list_workspace_account_credential_reconciliation_pending()',
    'public.complete_workspace_temporary_password_rotation(uuid,uuid,uuid,uuid,bigint)',
    'public.complete_workspace_initial_password_change(uuid,uuid,text,uuid,uuid,bigint,bigint)',
    'public.claim_workspace_password_account_revocation(uuid,uuid,uuid)',
    'public.find_workspace_password_account_auth_user(uuid,uuid,uuid)',
    'public.complete_workspace_password_account_revocation(uuid,uuid,uuid)',
    'public.workspace_client_operation_v2(text,uuid,uuid,jsonb,uuid,bigint)'
  ]
  LOOP
    IF to_regprocedure(required_function) IS NULL
      OR NOT has_function_privilege('service_role', required_function, 'EXECUTE')
      OR has_function_privilege('anon', required_function, 'EXECUTE')
      OR has_function_privilege('authenticated', required_function, 'EXECUTE')
    THEN
      RAISE EXCEPTION 'manual workspace function % is missing or exposed', required_function;
    END IF;
  END LOOP;

  finalize_definition := pg_get_functiondef(
    'public.finalize_workspace_password_account(uuid,uuid,uuid,uuid)'::regprocedure
  );
  claim_definition := pg_get_functiondef(
    'public.claim_workspace_account_credential(uuid,text,uuid,uuid,uuid,bigint,bigint,uuid,uuid,boolean)'::regprocedure
  );
  release_definition := pg_get_functiondef(
    'public.release_workspace_account_credential_claim(uuid,uuid,uuid,uuid)'::regprocedure
  );
  reconcile_definition := pg_get_functiondef(
    'public.reconcile_workspace_account_credential_claim(uuid,text,uuid,uuid)'::regprocedure
  );
  cancel_definition := pg_get_functiondef(
    'public.cancel_workspace_password_account_provisioning(uuid,uuid,uuid)'::regprocedure
  );
  list_reconciliation_definition := pg_get_functiondef(
    'public.list_workspace_account_credential_reconciliation_pending()'::regprocedure
  );
  revoke_definition := pg_get_functiondef(
    'public.claim_workspace_password_account_revocation(uuid,uuid,uuid)'::regprocedure
  );
  find_revocation_auth_definition := pg_get_functiondef(
    'public.find_workspace_password_account_auth_user(uuid,uuid,uuid)'::regprocedure
  );
  complete_revocation_definition := pg_get_functiondef(
    'public.complete_workspace_password_account_revocation(uuid,uuid,uuid)'::regprocedure
  );

  IF to_regprocedure('public.current_auth_token_iat()') IS NULL
    OR pg_get_functiondef('public.current_auth_token_iat()'::regprocedure)
      NOT ILIKE '%auth.jwt()%iat%'
    OR pg_get_functiondef('public.current_workspace_id()'::regprocedure)
      NOT ILIKE '%workspace_access_not_before_epoch%current_auth_token_iat%'
    OR pg_get_functiondef('public.can_access_workspace(uuid)'::regprocedure)
      NOT ILIKE '%workspace_access_not_before_epoch%current_auth_token_iat%'
    OR pg_get_functiondef('public.can_manage_workspace(uuid)'::regprocedure)
      NOT ILIKE '%workspace_access_not_before_epoch%current_auth_token_iat%'
    OR to_regprocedure('public.workspace_auth_credential_is_fresh(uuid)') IS NULL
    OR pg_get_functiondef('public.workspace_auth_credential_is_fresh(uuid)'::regprocedure)
      NOT ILIKE '%raw_app_meta_data%workspace_credential_version%workspace_credential_attempt_id%workspace_credential_execution_id%workspace_password_change_required%'
  THEN
    RAISE EXCEPTION 'workspace access helpers do not reject stale access tokens';
  END IF;

  IF finalize_definition NOT ILIKE '%admin_temporary_password%'
    OR finalize_definition NOT ILIKE '%workspace_password_change_required%'
    OR finalize_definition NOT ILIKE '%workspace_credential_execution_id%'
    OR finalize_definition NOT ILIKE '%encrypted_password%'
    OR finalize_definition NOT ILIKE '%confirmed_at%'
    OR finalize_definition NOT ILIKE '%last_sign_in_at%'
    OR finalize_definition NOT ILIKE '%workspace_invite_delivery_claims%'
    OR finalize_definition NOT ILIKE '%temporary_password_issued%'
    OR pg_get_functiondef(
      'public.complete_workspace_initial_password_change(uuid,uuid,text,uuid,uuid,bigint,bigint)'::regprocedure
    ) NOT ILIKE '%claim.acquired_at >= membership.invite_expires_at%workspace_password_change_required%workspace_credential_attempt_id%workspace_credential_execution_id%workspace_access_not_before_epoch%p_token_issued_at + 1%clock_timestamp%initial_password_changed%'
    OR pg_get_functiondef(
      'public.complete_workspace_temporary_password_rotation(uuid,uuid,uuid,uuid,bigint)'::regprocedure
    ) NOT ILIKE '%workspace_credential_attempt_id%workspace_credential_execution_id%p_execution_id%temporary_password_rotated%'
    OR pg_get_functiondef(
      'public.workspace_client_operation_v2(text,uuid,uuid,jsonb,uuid,bigint)'::regprocedure
    ) NOT ILIKE '%p_token_issued_at >= membership.workspace_access_not_before_epoch%FOR SHARE OF membership%workspace_client_operation%'
  THEN
    RAISE EXCEPTION 'manual credential finalization or token-epoch enforcement is malformed';
  END IF;

  IF claim_definition NOT ILIKE '%p_attempt_id = p_execution_id%'
    OR claim_definition NOT ILIKE '%existing_claim.attempt_id <> p_attempt_id%'
    OR claim_definition NOT ILIKE '%existing_claim.execution_id <> p_execution_id%'
    OR claim_definition NOT ILIKE '%existing_claim.review_after <= now()%'
    OR claim_definition NOT ILIKE '%requires reconciliation%'
    OR claim_definition NOT ILIKE '%p_token_issued_at < membership.workspace_access_not_before_epoch%'
    OR claim_definition NOT ILIKE '%p_expected_credential_version%'
    OR claim_definition NOT ILIKE '%p_expected_credential_attempt_id%'
    OR claim_definition NOT ILIKE '%p_expected_credential_execution_id%'
    OR claim_definition NOT ILIKE '%actor_credential_execution_id%'
    OR claim_definition NOT ILIKE '%workspace credential change is busy%'
    OR release_definition NOT ILIKE '%workspace_credential_attempt_id%'
    OR release_definition NOT ILIKE '%workspace_credential_execution_id%'
    OR release_definition NOT ILIKE '%p_execution_id%'
    OR release_definition NOT ILIKE '%provider change requires reconciliation%'
    OR reconcile_definition NOT ILIKE '%claim.review_after > now()%'
    OR reconcile_definition NOT ILIKE '%p_execution_id = claim.execution_id%'
    OR reconcile_definition NOT ILIKE '%p_execution_id = claim.attempt_id%'
    OR reconcile_definition NOT ILIKE '%requires a new execution%'
    OR reconcile_definition NOT ILIKE '%execution_id = p_execution_id%'
    OR reconcile_definition NOT ILIKE '%review_after = now() +%'
    OR reconcile_definition NOT ILIKE '%400 seconds%'
    OR reconcile_definition NOT ILIKE '%Preserve acquired_at%'
    OR cancel_definition NOT ILIKE '%status = ''revoked''%'
    OR cancel_definition NOT ILIKE '%status = ''archived''%'
    OR cancel_definition NOT ILIKE '%workspace_credential_attempt_id%'
    OR cancel_definition NOT ILIKE '%manual_provisioning_cancelled%'
  THEN
    RAISE EXCEPTION 'manual credential concurrency or cancellation is malformed';
  END IF;

  IF list_reconciliation_definition
      NOT ILIKE '%RETURNS TABLE(membership_id uuid, claim_kind text, review_after timestamp with time zone)%'
    OR list_reconciliation_definition NOT ILIKE '%claim.membership_id%'
    OR list_reconciliation_definition NOT ILIKE '%claim.claim_kind%'
    OR list_reconciliation_definition NOT ILIKE '%claim.review_after%'
    OR list_reconciliation_definition ILIKE '%attempt_id%'
    OR list_reconciliation_definition ILIKE '%execution_id%'
    OR list_reconciliation_definition ILIKE '%actor_user_id%'
  THEN
    RAISE EXCEPTION 'manual credential reconciliation projection is too broad or malformed';
  END IF;

  IF revoke_definition NOT ILIKE '%admin_temporary_password%'
    OR revoke_definition NOT ILIKE '%status = ''revoked''%'
    OR revoke_definition NOT ILIKE '%password_change_required = false%'
    OR revoke_definition NOT ILIKE '%workspace_access_not_before_epoch%'
    OR revoke_definition NOT ILIKE '%revoke_cleanup%'
    OR revoke_definition NOT ILIKE '%review_after > now()%'
    OR revoke_definition NOT ILIKE '%manual_revoked%'
    OR find_revocation_auth_definition NOT ILIKE '%workspace_credential_attempt_id%'
    OR find_revocation_auth_definition NOT ILIKE '%workspace_credential_execution_id%'
    OR find_revocation_auth_definition NOT ILIKE '%workspace_provisioning_method%'
    OR find_revocation_auth_definition NOT ILIKE '%manual workspace Auth identity is unsafe%'
    OR complete_revocation_definition NOT ILIKE '%workspace.membership.manual_auth_cleanup_completed%'
    OR complete_revocation_definition NOT ILIKE '%workspace_invite_delivery_claims%'
  THEN
    RAISE EXCEPTION 'manual account revocation claim or exact Auth cleanup is malformed';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_trigger
    WHERE tgrelid = 'public.workspace_memberships'::regclass
      AND tgname = 'workspace_memberships_advance_access_epoch'
      AND tgenabled <> 'D'
      AND NOT tgisinternal
  ) OR pg_get_functiondef(
    'public.advance_workspace_access_epoch_on_disable()'::regprocedure
  ) NOT ILIKE '%OLD.status = ''active''%NEW.status <> ''active''%workspace_access_not_before_epoch%clock_timestamp%'
    OR has_function_privilege(
      'service_role',
      'public.advance_workspace_access_epoch_on_disable()',
      'EXECUTE'
    )
  THEN
    RAISE EXCEPTION 'workspace disable transitions do not advance the access-token epoch safely';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'workspace_memberships'
      AND policyname IN (
        'workspace_memberships_authenticated_select',
        'workspace_memberships_authenticated_select_isolation'
      )
      AND (
        COALESCE(qual, '') NOT ILIKE '%current_auth_token_iat%'
        OR COALESCE(qual, '') NOT ILIKE '%workspace_auth_credential_is_fresh%'
      )
  ) THEN
    RAISE EXCEPTION 'workspace membership reads do not enforce the access-token epoch';
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
