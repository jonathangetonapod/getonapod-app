-- Disposable non-production behavior verification for workspace onboarding.
-- Every fixture and mutation is enclosed in this transaction and rolled back.

BEGIN;

DO $behavior_guard$
BEGIN
  IF current_setting('goap.workspace_onboarding_behavior', true)
      <> 'nonproduction-rollback-v1'
    OR current_setting('goap.environment', true) NOT IN ('local', 'staging')
    OR current_setting('transaction_read_only') <> 'off'
  THEN
    RAISE EXCEPTION 'workspace onboarding behavior test is not authorized'
      USING ERRCODE = '42501';
  END IF;

  PERFORM pg_advisory_xact_lock(
    hashtextextended('goap:workspace-onboarding:behavior:v1', 0)
  );
END;
$behavior_guard$;

DO $static_contract$
DECLARE
  required_table TEXT;
  required_function TEXT;
BEGIN
  FOREACH required_table IN ARRAY ARRAY[
    'workspace_onboarding_templates',
    'workspace_onboarding_template_versions',
    'workspace_onboarding_instances',
    'workspace_onboarding_assignments',
    'workspace_onboarding_drafts',
    'workspace_onboarding_answer_revisions',
    'workspace_onboarding_review_comments',
    'workspace_onboarding_profile_drafts',
    'workspace_onboarding_assets',
    'workspace_onboarding_notifications',
    'workspace_client_pitch_profiles'
  ]
  LOOP
    IF to_regclass('public.' || required_table) IS NULL
      OR NOT EXISTS (
        SELECT 1
        FROM pg_class AS relation
        WHERE relation.oid = to_regclass('public.' || required_table)
          AND relation.relrowsecurity
      )
      OR has_table_privilege('anon', 'public.' || required_table, 'SELECT')
      OR has_table_privilege('authenticated', 'public.' || required_table, 'SELECT')
      OR NOT has_table_privilege('service_role', 'public.' || required_table, 'SELECT')
    THEN
      RAISE EXCEPTION 'onboarding table % is missing or exposed', required_table;
    END IF;
  END LOOP;

  FOREACH required_function IN ARRAY ARRAY[
    'public.workspace_onboarding_staff_list_v1(uuid,uuid,bigint)',
    'public.workspace_onboarding_staff_detail_v1(uuid,uuid,uuid,bigint)',
    'public.workspace_onboarding_template_operation_v1(text,uuid,uuid,jsonb,uuid,bigint)',
    'public.workspace_onboarding_start_v1(uuid,uuid,uuid,jsonb,uuid,bigint)',
    'public.workspace_onboarding_instance_operation_v1(text,uuid,uuid,jsonb,uuid,bigint)',
    'public.workspace_onboarding_approve_v1(uuid,uuid,jsonb,uuid,bigint)',
    'public.workspace_onboarding_client_operation_v1(text,uuid,text,jsonb)',
    'public.mark_workspace_onboarding_viewed_v1(uuid,text)',
    'public.set_workspace_onboarding_ai_profile_v1(uuid,integer,text,jsonb,text)',
    'public.record_workspace_onboarding_invitation_v1(uuid,text,text,text)',
    'public.record_workspace_onboarding_change_request_v1(uuid,text,text,text)'
  ]
  LOOP
    IF to_regprocedure(required_function) IS NULL
      OR NOT has_function_privilege('service_role', required_function, 'EXECUTE')
      OR has_function_privilege('authenticated', required_function, 'EXECUTE')
      OR has_function_privilege('anon', required_function, 'EXECUTE')
    THEN
      RAISE EXCEPTION 'onboarding RPC % is missing or exposed', required_function;
    END IF;
  END LOOP;

  IF to_regprocedure('public.claim_workspace_onboarding_reminders_v1(integer)') IS NOT NULL
    OR to_regprocedure(
      'public.complete_workspace_onboarding_notification_v1(uuid,text,text,text)'
    ) IS NOT NULL
  THEN
    RAISE EXCEPTION 'automated onboarding reminder RPCs were not retired';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM storage.buckets AS bucket
    WHERE bucket.id = 'workspace-onboarding-assets'
      AND bucket.name = 'workspace-onboarding-assets'
      AND NOT bucket.public
      AND bucket.file_size_limit = 10485760
      AND bucket.allowed_mime_types @> ARRAY[
        'image/jpeg', 'image/png', 'image/webp', 'application/pdf'
      ]::TEXT[]
  ) THEN
    RAISE EXCEPTION 'private onboarding asset bucket contract is missing';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_trigger AS trigger_definition
    WHERE trigger_definition.tgname = 'workspace_onboarding_template_versions_immutable'
      AND trigger_definition.tgenabled <> 'D'
  ) OR NOT EXISTS (
    SELECT 1
    FROM pg_trigger AS trigger_definition
    WHERE trigger_definition.tgname = 'workspace_onboarding_answer_revisions_immutable'
      AND trigger_definition.tgenabled <> 'D'
  ) THEN
    RAISE EXCEPTION 'onboarding immutability triggers are missing';
  END IF;
END;
$static_contract$;

CREATE TEMP TABLE goap_onboarding_behavior_state (
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
  platform_id UUID := gen_random_uuid();
  owner_a_membership_id UUID := gen_random_uuid();
  admin_a_membership_id UUID := gen_random_uuid();
  member_a_membership_id UUID := gen_random_uuid();
  owner_b_membership_id UUID := gen_random_uuid();
  platform_membership_id UUID := gen_random_uuid();
  client_a_id UUID := gen_random_uuid();
  default_client_id UUID := gen_random_uuid();
  suffix TEXT := substr(replace(gen_random_uuid()::TEXT, '-', ''), 1, 16);
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
    id, email, encrypted_password, raw_app_meta_data, raw_user_meta_data, created_at
  )
  VALUES
    (owner_a_id, 'onboarding-owner-a-' || suffix || '@example.invalid', 'hash', '{}'::JSONB, '{}'::JSONB, now()),
    (admin_a_id, 'onboarding-admin-a-' || suffix || '@example.invalid', 'hash', '{}'::JSONB, '{}'::JSONB, now()),
    (member_a_id, 'onboarding-member-a-' || suffix || '@example.invalid', 'hash', '{}'::JSONB, '{}'::JSONB, now()),
    (owner_b_id, 'onboarding-owner-b-' || suffix || '@example.invalid', 'hash', '{}'::JSONB, '{}'::JSONB, now()),
    (platform_id, 'onboarding-platform-' || suffix || '@example.invalid', 'hash', '{}'::JSONB, '{}'::JSONB, now());

  INSERT INTO public.admin_users (email, name, user_id)
  VALUES (
    'onboarding-platform-' || suffix || '@example.invalid',
    'Onboarding Platform Owner',
    platform_id
  );

  INSERT INTO public.workspaces (id, name, slug, status, is_default, created_by)
  VALUES
    (workspace_a_id, 'Onboarding Workspace A', 'onboarding-a-' || suffix, 'active', false, owner_a_id),
    (workspace_b_id, 'Onboarding Workspace B', 'onboarding-b-' || suffix, 'active', false, owner_b_id);

  INSERT INTO public.workspace_memberships (
    id, workspace_id, user_id, email_normalized, full_name, role, status,
    invited_by, accepted_at, accepted_by, provisioning_method,
    password_change_required, workspace_access_not_before_epoch
  )
  VALUES
    (owner_a_membership_id, workspace_a_id, owner_a_id,
      'onboarding-owner-a-' || suffix || '@example.invalid', 'Owner A', 'owner', 'active',
      platform_id, now(), owner_a_id, 'email_invite', false, token_epoch - 10),
    (admin_a_membership_id, workspace_a_id, admin_a_id,
      'onboarding-admin-a-' || suffix || '@example.invalid', 'Admin A', 'admin', 'active',
      owner_a_id, now(), admin_a_id, 'email_invite', false, token_epoch - 10),
    (member_a_membership_id, workspace_a_id, member_a_id,
      'onboarding-member-a-' || suffix || '@example.invalid', 'Member A', 'member', 'active',
      owner_a_id, now(), member_a_id, 'email_invite', false, token_epoch - 10),
    (owner_b_membership_id, workspace_b_id, owner_b_id,
      'onboarding-owner-b-' || suffix || '@example.invalid', 'Owner B', 'owner', 'active',
      platform_id, now(), owner_b_id, 'email_invite', false, token_epoch - 10),
    (platform_membership_id, default_workspace_id, platform_id,
      'onboarding-platform-' || suffix || '@example.invalid', 'Onboarding Platform Owner', 'admin', 'active',
      platform_id, now(), platform_id, 'platform_bootstrap', false, token_epoch - 10);

  SET CONSTRAINTS ALL IMMEDIATE;
  SET CONSTRAINTS ALL DEFERRED;

  INSERT INTO public.clients (
    id, workspace_id, name, email, status, portal_access_enabled
  )
  VALUES (
    client_a_id,
    workspace_a_id,
    'Original Client Name',
    'original-client-' || suffix || '@example.invalid',
    'active',
    true
  ), (
    default_client_id,
    default_workspace_id,
    'Platform Owner Client',
    'platform-owner-client-' || suffix || '@example.invalid',
    'active',
    true
  );

  INSERT INTO public.client_portal_sessions (client_id, session_token, expires_at)
  VALUES (client_a_id, 'sha256$' || repeat('C', 43) || '=', now() + interval '1 hour');

  INSERT INTO public.client_portal_tokens (client_id, token, expires_at)
  VALUES (client_a_id, 'onboarding-portal-' || suffix, now() + interval '15 minutes');

  INSERT INTO goap_onboarding_behavior_state (key, value)
  VALUES
    ('default_workspace', default_workspace_id),
    ('workspace_a', workspace_a_id),
    ('workspace_b', workspace_b_id),
    ('owner_a', owner_a_id),
    ('admin_a', admin_a_id),
    ('member_a', member_a_id),
    ('owner_b', owner_b_id),
    ('platform', platform_id),
    ('member_a_membership', member_a_membership_id),
    ('client_a', client_a_id),
    ('default_client', default_client_id);
END;
$fixtures$;

DO $workflow$
#variable_conflict use_variable
<<workflow>>
DECLARE
  workspace_a_id UUID := (SELECT value FROM goap_onboarding_behavior_state WHERE key = 'workspace_a');
  default_workspace_id UUID := (SELECT value FROM goap_onboarding_behavior_state WHERE key = 'default_workspace');
  workspace_b_id UUID := (SELECT value FROM goap_onboarding_behavior_state WHERE key = 'workspace_b');
  owner_a_id UUID := (SELECT value FROM goap_onboarding_behavior_state WHERE key = 'owner_a');
  admin_a_id UUID := (SELECT value FROM goap_onboarding_behavior_state WHERE key = 'admin_a');
  member_a_id UUID := (SELECT value FROM goap_onboarding_behavior_state WHERE key = 'member_a');
  owner_b_id UUID := (SELECT value FROM goap_onboarding_behavior_state WHERE key = 'owner_b');
  platform_id UUID := (SELECT value FROM goap_onboarding_behavior_state WHERE key = 'platform');
  member_a_membership_id UUID := (SELECT value FROM goap_onboarding_behavior_state WHERE key = 'member_a_membership');
  client_a_id UUID := (SELECT value FROM goap_onboarding_behavior_state WHERE key = 'client_a');
  default_client_id UUID := (SELECT value FROM goap_onboarding_behavior_state WHERE key = 'default_client');
  token_epoch BIGINT := floor(EXTRACT(EPOCH FROM clock_timestamp()))::BIGINT;
  template_id UUID;
  version_id UUID;
  instance_id UUID := gen_random_uuid();
  rotated_instance_id UUID := gen_random_uuid();
  default_instance_id UUID := gen_random_uuid();
  asset_id UUID := gen_random_uuid();
  asset_path TEXT;
  response JSONB;
  profile JSONB := jsonb_build_object(
    'professional_bio', 'Approved professional bio',
    'positioning_summary', 'A precise positioning summary',
    'expertise', jsonb_build_array('Podcast strategy'),
    'key_messages', jsonb_build_array('Trust is earned'),
    'story_angles', jsonb_build_array('From operator to advisor'),
    'talking_points', jsonb_build_array('How to prepare'),
    'ideal_audience', 'Agency founders',
    'suggested_show_fit', jsonb_build_array('Business and marketing shows')
  );
  rejected BOOLEAN;
  portal_session_count BIGINT;
  portal_token_count BIGINT;
BEGIN
  SELECT template.id
  INTO template_id
  FROM public.workspace_onboarding_templates AS template
  WHERE template.workspace_id = workspace_a_id
    AND template.status = 'published'
    AND template.is_default;

  IF template_id IS NULL OR (
    SELECT count(*) FROM public.workspace_onboarding_templates
    WHERE workspace_id = workspace_a_id
  ) <> 1 THEN
    RAISE EXCEPTION 'new private workspace did not receive one default template';
  END IF;

  IF (
    SELECT cardinality(template.reminder_days)
    FROM public.workspace_onboarding_templates AS template
    WHERE template.id = template_id
  ) <> 0 THEN
    RAISE EXCEPTION 'new workspace template still schedules reminders';
  END IF;

  SELECT version.id
  INTO version_id
  FROM public.workspace_onboarding_template_versions AS version
  WHERE version.template_id = template_id
    AND version.version = 1;

  rejected := false;
  BEGIN
    UPDATE public.workspace_onboarding_template_versions
    SET definition = definition
    WHERE id = version_id;
  EXCEPTION WHEN SQLSTATE '42501' THEN
    rejected := true;
  END;
  IF NOT rejected THEN
    RAISE EXCEPTION 'published onboarding template version was mutable';
  END IF;

  response := public.workspace_onboarding_staff_list_v1(
    workspace_a_id, owner_a_id, token_epoch
  );
  IF response ->> 'viewer_role' IS DISTINCT FROM 'owner'
    OR (response ->> 'can_manage')::BOOLEAN IS DISTINCT FROM true
    OR jsonb_array_length(response -> 'templates') <> 1
    OR jsonb_array_length(response -> 'clients') <> 1
  THEN
    RAISE EXCEPTION 'workspace owner onboarding list was incorrect';
  END IF;

  response := public.workspace_onboarding_staff_list_v1(
    workspace_a_id, admin_a_id, token_epoch
  );
  IF response ->> 'viewer_role' IS DISTINCT FROM 'admin'
    OR (response ->> 'can_manage')::BOOLEAN IS DISTINCT FROM true
  THEN
    RAISE EXCEPTION 'workspace administrator onboarding access was incorrect';
  END IF;

  response := public.workspace_onboarding_staff_list_v1(
    workspace_a_id, platform_id, token_epoch
  );
  IF response ->> 'viewer_role' IS DISTINCT FROM 'platform_admin'
    OR (response ->> 'can_manage')::BOOLEAN IS DISTINCT FROM true
  THEN
    RAISE EXCEPTION 'platform-owner selected-workspace management was not native';
  END IF;

  response := public.workspace_onboarding_staff_list_v1(
    default_workspace_id, platform_id, token_epoch
  );
  IF response ->> 'viewer_role' IS DISTINCT FROM 'admin'
    OR (response ->> 'can_manage')::BOOLEAN IS DISTINCT FROM true
    OR jsonb_array_length(response -> 'templates') < 1
  THEN
    RAISE EXCEPTION 'platform owner did not receive regular onboarding access in the default workspace';
  END IF;

  SELECT template.id
  INTO template_id
  FROM public.workspace_onboarding_templates AS template
  WHERE template.workspace_id = default_workspace_id
    AND template.status = 'published'
    AND template.is_default
  ORDER BY template.created_at, template.id
  LIMIT 1;

  response := public.workspace_onboarding_start_v1(
    default_workspace_id,
    template_id,
    default_client_id,
    jsonb_build_object(
      'instance_id', default_instance_id,
      'capability_generation', 1,
      'capability_hash', repeat('d', 64),
      'capability_expires_at', now() + interval '14 days',
      'recipient_name', 'Platform Owner Client',
      'recipient_email', 'platform-owner-client@example.invalid',
      'new_client', NULL,
      'assigned_membership_ids', '[]'::JSONB,
      'experience', jsonb_build_object(
        'intro_title', 'Welcome from the owner workspace',
        'intro_body', 'The default workspace uses the same onboarding flow.',
        'completion_message', 'Thank you. The owner workspace will review this.',
        'accent_color', '#665CF2',
        'logo_path', NULL
      )
    ),
    platform_id,
    token_epoch
  );
  IF response ->> 'workspace_id' IS DISTINCT FROM default_workspace_id::TEXT THEN
    RAISE EXCEPTION 'default workspace onboarding invitation was not created';
  END IF;

  response := public.workspace_onboarding_client_operation_v1(
    'get', default_instance_id, repeat('d', 64), '{}'::JSONB
  );
  IF response ->> 'workspace_id' IS DISTINCT FROM default_workspace_id::TEXT THEN
    RAISE EXCEPTION 'default workspace client onboarding link was unavailable';
  END IF;

  rejected := false;
  BEGIN
    PERFORM public.workspace_onboarding_staff_list_v1(
      workspace_a_id, owner_b_id, token_epoch
    );
  EXCEPTION WHEN SQLSTATE '42501' THEN
    rejected := true;
  END;
  IF NOT rejected THEN
    RAISE EXCEPTION 'cross-workspace owner read was accepted';
  END IF;

  response := public.workspace_onboarding_start_v1(
    workspace_a_id,
    template_id,
    client_a_id,
    jsonb_build_object(
      'instance_id', instance_id,
      'capability_generation', 1,
      'capability_hash', repeat('a', 64),
      'capability_expires_at', now() + interval '14 days',
      'recipient_name', 'Client Contact',
      'recipient_email', 'client-contact@example.invalid',
      'new_client', NULL,
      'assigned_membership_ids', jsonb_build_array(member_a_membership_id),
      'experience', jsonb_build_object(
        'intro_title', 'Welcome, Client Contact',
        'intro_body', 'A custom message from Onboarding Workspace A.',
        'completion_message', 'Thanks. Onboarding Workspace A will review this.',
        'accent_color', '#0F766E',
        'logo_path', NULL
      )
    ),
    owner_a_id,
    token_epoch
  );
  IF response ->> 'id' IS DISTINCT FROM instance_id::TEXT
    OR response ->> 'workspace_id' IS DISTINCT FROM workspace_a_id::TEXT
    OR (response ->> 'client_created')::BOOLEAN IS DISTINCT FROM false
    OR response ->> 'experience_title' IS DISTINCT FROM 'Welcome, Client Contact'
    OR response ->> 'accent_color' IS DISTINCT FROM '#0F766E'
    OR (
      SELECT count(*)
      FROM public.workspace_onboarding_notifications AS notification
      WHERE notification.instance_id = workflow.instance_id
    ) <> 1
  THEN
    RAISE EXCEPTION 'workspace onboarding invitation was not created correctly';
  END IF;

  response := public.workspace_onboarding_client_operation_v1(
    'get', instance_id, repeat('a', 64), '{}'::JSONB
  );
  IF response -> 'definition' ->> 'intro_title' IS DISTINCT FROM 'Welcome, Client Contact'
    OR response -> 'definition' ->> 'completion_message'
      IS DISTINCT FROM 'Thanks. Onboarding Workspace A will review this.'
    OR response ->> 'accent_color' IS DISTINCT FROM '#0F766E'
  THEN
    RAISE EXCEPTION 'per-client white-label experience was not snapshotted';
  END IF;

  PERFORM public.mark_workspace_onboarding_viewed_v1(
    instance_id, repeat('a', 64)
  );
  IF NOT EXISTS (
    SELECT 1
    FROM public.workspace_onboarding_instances AS instance
    WHERE instance.id = workflow.instance_id
      AND instance.viewed_at IS NOT NULL
  ) THEN
    RAISE EXCEPTION 'first client onboarding view was not recorded';
  END IF;

  response := public.workspace_onboarding_staff_list_v1(
    workspace_a_id, member_a_id, token_epoch
  );
  IF response ->> 'viewer_role' IS DISTINCT FROM 'member'
    OR (response ->> 'can_manage')::BOOLEAN IS DISTINCT FROM false
    OR jsonb_array_length(response -> 'templates') <> 0
    OR jsonb_array_length(response -> 'clients') <> 0
    OR jsonb_array_length(response -> 'instances') <> 1
    OR response -> 'instances' -> 0 ->> 'viewed_at' IS NULL
  THEN
    RAISE EXCEPTION 'assigned member read-only list was incorrect';
  END IF;

  rejected := false;
  BEGIN
    PERFORM public.workspace_onboarding_template_operation_v1(
      'duplicate', workspace_a_id, template_id,
      jsonb_build_object('name', 'Blocked member copy'),
      member_a_id, token_epoch
    );
  EXCEPTION WHEN SQLSTATE '42501' THEN
    rejected := true;
  END;
  IF NOT rejected THEN
    RAISE EXCEPTION 'workspace member mutated an onboarding template';
  END IF;

  response := public.workspace_onboarding_instance_operation_v1(
    'update_assignments', workspace_a_id, instance_id,
    jsonb_build_object('assigned_membership_ids', '[]'::JSONB),
    owner_a_id, token_epoch
  );
  IF jsonb_array_length(response -> 'assigned_membership_ids') <> 0 THEN
    RAISE EXCEPTION 'onboarding assignment removal failed';
  END IF;
  rejected := false;
  BEGIN
    PERFORM public.workspace_onboarding_staff_detail_v1(
      workspace_a_id, instance_id, member_a_id, token_epoch
    );
  EXCEPTION WHEN SQLSTATE 'P0002' THEN
    rejected := true;
  END;
  IF NOT rejected THEN
    RAISE EXCEPTION 'removed member retained onboarding detail access';
  END IF;
  PERFORM public.workspace_onboarding_instance_operation_v1(
    'update_assignments', workspace_a_id, instance_id,
    jsonb_build_object(
      'assigned_membership_ids', jsonb_build_array(member_a_membership_id)
    ),
    owner_a_id, token_epoch
  );

  rejected := false;
  BEGIN
    PERFORM public.workspace_onboarding_client_operation_v1(
      'get', instance_id, repeat('f', 64), '{}'::JSONB
    );
  EXCEPTION WHEN SQLSTATE 'P0002' THEN
    rejected := true;
  END;
  IF NOT rejected THEN
    RAISE EXCEPTION 'incorrect onboarding capability hash was accepted';
  END IF;

  response := public.workspace_onboarding_client_operation_v1(
    'save',
    instance_id,
    repeat('a', 64),
    jsonb_build_object(
      'answers', jsonb_build_object(
        'full_name', 'Updated Client Name',
        'email', 'updated-client@example.invalid',
        'current_bio', 'Client-authored source bio'
      ),
      'current_section', 1,
      'expected_lock_version', 0
    )
  );
  IF response ->> 'status' IS DISTINCT FROM 'in_progress'
    OR (response ->> 'lock_version')::BIGINT IS DISTINCT FROM 1
  THEN
    RAISE EXCEPTION 'capability autosave did not advance the draft';
  END IF;

  rejected := false;
  BEGIN
    PERFORM public.workspace_onboarding_client_operation_v1(
      'save', instance_id, repeat('a', 64),
      jsonb_build_object(
        'answers', '{}'::JSONB,
        'current_section', 0,
        'expected_lock_version', 0
      )
    );
  EXCEPTION WHEN SQLSTATE '40001' THEN
    rejected := true;
  END;
  IF NOT rejected THEN
    RAISE EXCEPTION 'stale onboarding autosave was accepted';
  END IF;

  asset_path := workspace_a_id::TEXT || '/' || instance_id::TEXT || '/'
    || asset_id::TEXT || '.webp';
  response := public.workspace_onboarding_client_operation_v1(
    'register_asset', instance_id, repeat('a', 64),
    jsonb_build_object(
      'expected_lock_version', 1,
      'asset_id', asset_id,
      'question_id', 'headshot',
      'storage_path', asset_path,
      'original_name', 'headshot.webp',
      'mime_type', 'image/webp',
      'byte_size', 1048576
    )
  );
  IF (response ->> 'lock_version')::BIGINT IS DISTINCT FROM 2
    OR response -> 'answers' ->> 'headshot' IS DISTINCT FROM asset_id::TEXT
  THEN
    RAISE EXCEPTION 'private WebP asset registration was incorrect';
  END IF;

  response := public.workspace_onboarding_client_operation_v1(
    'submit', instance_id, repeat('a', 64),
    jsonb_build_object('expected_lock_version', 2)
  );
  IF response ->> 'status' IS DISTINCT FROM 'submitted'
    OR (response ->> 'current_revision')::INTEGER IS DISTINCT FROM 1
  THEN
    RAISE EXCEPTION 'first immutable onboarding submission failed';
  END IF;

  rejected := false;
  BEGIN
    UPDATE public.workspace_onboarding_answer_revisions
    SET answers = '{}'::JSONB
    WHERE workspace_onboarding_answer_revisions.instance_id = workflow.instance_id
      AND workspace_onboarding_answer_revisions.revision = 1;
  EXCEPTION WHEN SQLSTATE '42501' THEN
    rejected := true;
  END;
  IF NOT rejected THEN
    RAISE EXCEPTION 'submitted onboarding revision was mutable';
  END IF;

  rejected := false;
  BEGIN
    PERFORM public.workspace_onboarding_instance_operation_v1(
      'extend', workspace_a_id, instance_id,
      jsonb_build_object('capability_expires_at', now() + interval '20 days'),
      owner_a_id, token_epoch
    );
  EXCEPTION WHEN SQLSTATE '22023' THEN
    rejected := true;
  END;
  IF NOT rejected THEN
    RAISE EXCEPTION 'submitted onboarding capability was extendable';
  END IF;

  response := public.workspace_onboarding_instance_operation_v1(
    'request_changes', workspace_a_id, instance_id,
    jsonb_build_object(
      'comments', jsonb_build_array(jsonb_build_object(
        'question_id', 'current_bio',
        'body', 'Please add one concrete result.'
      ))
    ),
    owner_a_id, token_epoch
  );
  IF response ->> 'status' IS DISTINCT FROM 'changes_requested'
    OR jsonb_array_length(response -> 'comments') <> 1
    OR NOT EXISTS (
      SELECT 1
      FROM public.workspace_onboarding_notifications AS notification
      WHERE notification.instance_id = workflow.instance_id
        AND notification.kind = 'changes_requested'
        AND notification.status = 'pending'
    )
  THEN
    RAISE EXCEPTION 'question-level change request was not created';
  END IF;

  response := public.workspace_onboarding_client_operation_v1(
    'save', instance_id, repeat('a', 64),
    jsonb_build_object(
      'answers', jsonb_build_object(
        'full_name', 'Updated Client Name',
        'email', 'updated-client@example.invalid',
        'current_bio', 'Client-authored source bio with a concrete result',
        'headshot', asset_id::TEXT
      ),
      'current_section', 1,
      'expected_lock_version', 2
    )
  );
  response := public.workspace_onboarding_client_operation_v1(
    'submit', instance_id, repeat('a', 64),
    jsonb_build_object('expected_lock_version', 3)
  );
  IF response ->> 'status' IS DISTINCT FROM 'submitted'
    OR (response ->> 'current_revision')::INTEGER IS DISTINCT FROM 2
    OR (
      SELECT count(*)
      FROM public.workspace_onboarding_answer_revisions AS revision
      WHERE revision.instance_id = workflow.instance_id
    ) <> 2
    OR EXISTS (
      SELECT 1 FROM public.workspace_onboarding_review_comments
      WHERE workspace_onboarding_review_comments.instance_id = workflow.instance_id
        AND workspace_onboarding_review_comments.status = 'open'
    )
  THEN
    RAISE EXCEPTION 'onboarding revision cycle was incorrect';
  END IF;

  IF NOT public.set_workspace_onboarding_ai_profile_v1(
    instance_id, 2, 'generated', profile, NULL
  ) THEN
    RAISE EXCEPTION 'AI pitch profile draft was not attached to latest revision';
  END IF;

  SELECT count(*) INTO portal_session_count
  FROM public.client_portal_sessions WHERE client_id = client_a_id;
  SELECT count(*) INTO portal_token_count
  FROM public.client_portal_tokens WHERE client_id = client_a_id;

  response := public.workspace_onboarding_approve_v1(
    workspace_a_id, instance_id, profile, owner_a_id, token_epoch
  );
  IF response ->> 'status' IS DISTINCT FROM 'approved'
    OR NOT EXISTS (
      SELECT 1
      FROM public.clients AS client
      WHERE client.id = client_a_id
        AND client.workspace_id = workspace_a_id
        AND client.name = 'Updated Client Name'
        AND client.email LIKE 'original-client-%@example.invalid'
        AND client.bio = 'Approved professional bio'
        AND client.portal_access_enabled
    )
    OR (SELECT count(*) FROM public.client_portal_sessions WHERE client_id = client_a_id)
      <> portal_session_count
    OR (SELECT count(*) FROM public.client_portal_tokens WHERE client_id = client_a_id)
      <> portal_token_count
    OR NOT EXISTS (
      SELECT 1
      FROM public.workspace_client_pitch_profiles AS pitch
      WHERE pitch.client_id = client_a_id
        AND pitch.approved_revision = 2
        AND pitch.positioning_summary = 'A precise positioning summary'
    )
  THEN
    RAISE EXCEPTION 'approval mapping or portal isolation was incorrect';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.workspace_audit_log AS audit
    WHERE audit.workspace_id = workspace_a_id
      AND audit.entity_id = workflow.instance_id
      AND audit.action = 'workspace.onboarding.approved'
      AND audit.metadata ->> 'portal_access_changed' = 'false'
      AND audit.metadata ->> 'mapped_email' = 'false'
      AND audit.metadata ->> 'email_mapping_skipped_for_portal_safety' = 'true'
  ) THEN
    RAISE EXCEPTION 'approval audit did not prove portal isolation';
  END IF;

  PERFORM public.workspace_onboarding_instance_operation_v1(
    'archive', workspace_a_id, instance_id, '{}'::JSONB, owner_a_id, token_epoch
  );
  response := public.workspace_onboarding_instance_operation_v1(
    'purge_paths', workspace_a_id, instance_id,
    jsonb_build_object('confirmation', 'PURGE'), owner_a_id, token_epoch
  );
  IF response -> 'storage_paths' ->> 0 IS DISTINCT FROM asset_path
    OR NOT EXISTS (
      SELECT 1
      FROM public.workspace_onboarding_instances AS instance
      WHERE instance.id = workflow.instance_id
    )
  THEN
    RAISE EXCEPTION 'purge storage preflight changed database state';
  END IF;
  response := public.workspace_onboarding_instance_operation_v1(
    'purge', workspace_a_id, instance_id,
    jsonb_build_object('confirmation', 'PURGE'), owner_a_id, token_epoch
  );
  IF (response ->> 'purged')::BOOLEAN IS DISTINCT FROM true
    OR response -> 'storage_paths' ->> 0 IS DISTINCT FROM asset_path
    OR EXISTS (
      SELECT 1
      FROM public.workspace_onboarding_instances AS instance
      WHERE instance.id = workflow.instance_id
    )
    OR NOT EXISTS (SELECT 1 FROM public.clients WHERE id = client_a_id)
    OR NOT EXISTS (
      SELECT 1
      FROM public.workspace_audit_log AS audit
      WHERE audit.entity_id = workflow.instance_id
        AND audit.action = 'workspace.onboarding.purge'
        AND audit.metadata ->> 'client_record_retained' = 'true'
    )
  THEN
    RAISE EXCEPTION 'archived onboarding PII purge contract was incorrect';
  END IF;

  response := public.workspace_onboarding_start_v1(
    workspace_a_id,
    template_id,
    client_a_id,
    jsonb_build_object(
      'instance_id', rotated_instance_id,
      'capability_generation', 1,
      'capability_hash', repeat('b', 64),
      'capability_expires_at', now() + interval '14 days',
      'recipient_name', 'Client Contact',
      'recipient_email', 'client-contact@example.invalid',
      'new_client', NULL,
      'assigned_membership_ids', '[]'::JSONB
    ),
    owner_a_id,
    token_epoch
  );
  PERFORM public.workspace_onboarding_client_operation_v1(
    'save', rotated_instance_id, repeat('b', 64),
    jsonb_build_object(
      'answers', jsonb_build_object('full_name', 'Preserved Draft'),
      'current_section', 0,
      'expected_lock_version', 0
    )
  );
  response := public.workspace_onboarding_instance_operation_v1(
    'rotate', workspace_a_id, rotated_instance_id,
    jsonb_build_object(
      'capability_generation', 2,
      'capability_hash', repeat('c', 64),
      'capability_expires_at', now() + interval '14 days'
    ),
    owner_a_id, token_epoch
  );
  IF (response ->> 'capability_generation')::INTEGER IS DISTINCT FROM 2
    OR response -> 'answers' ->> 'full_name' IS DISTINCT FROM 'Preserved Draft'
  THEN
    RAISE EXCEPTION 'capability rotation did not preserve the server draft';
  END IF;

  rejected := false;
  BEGIN
    PERFORM public.workspace_onboarding_client_operation_v1(
      'get', rotated_instance_id, repeat('b', 64), '{}'::JSONB
    );
  EXCEPTION WHEN SQLSTATE 'P0002' THEN
    rejected := true;
  END;
  IF NOT rejected THEN
    RAISE EXCEPTION 'rotated onboarding capability remained usable';
  END IF;

  PERFORM public.workspace_onboarding_client_operation_v1(
    'get', rotated_instance_id, repeat('c', 64), '{}'::JSONB
  );
  PERFORM public.workspace_onboarding_instance_operation_v1(
    'revoke', workspace_a_id, rotated_instance_id, '{}'::JSONB,
    owner_a_id, token_epoch
  );
  IF NOT EXISTS (
    SELECT 1
    FROM public.workspace_audit_log AS audit
    WHERE audit.entity_id = rotated_instance_id
      AND audit.action = 'workspace.onboarding.revoke'
      AND audit.metadata ->> 'previous_status' = 'in_progress'
  ) THEN
    RAISE EXCEPTION 'revocation audit did not preserve the prior lifecycle state';
  END IF;

  rejected := false;
  BEGIN
    PERFORM public.workspace_onboarding_staff_detail_v1(
      workspace_a_id, rotated_instance_id, member_a_id, token_epoch
    );
  EXCEPTION WHEN SQLSTATE 'P0002' THEN
    rejected := true;
  END;
  IF NOT rejected THEN
    RAISE EXCEPTION 'unassigned member read an onboarding instance';
  END IF;

  rejected := false;
  BEGIN
    PERFORM public.workspace_onboarding_staff_detail_v1(
      workspace_b_id, rotated_instance_id, owner_b_id, token_epoch
    );
  EXCEPTION WHEN SQLSTATE 'P0002' THEN
    rejected := true;
  END;
  IF NOT rejected THEN
    RAISE EXCEPTION 'cross-workspace onboarding detail was readable';
  END IF;
END;
$workflow$;

SELECT 'Workspace onboarding behavior verification passed' AS result;

ROLLBACK;
