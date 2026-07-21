-- Disposable non-production behavior verification for workspace guest
-- resources. The guarded runner supplies both custom settings below. Every
-- fixture and mutation is enclosed in this transaction and is always rolled
-- back; a failing psql connection also rolls back on disconnect.

BEGIN;

DO $behavior_guard$
BEGIN
  IF current_setting(
      'goap.workspace_guest_resources_behavior',
      true
    ) <> 'nonproduction-rollback-v1'
    OR current_setting('goap.environment', true) NOT IN ('local', 'staging')
    OR current_setting('transaction_read_only') <> 'off'
  THEN
    RAISE EXCEPTION 'workspace guest resource behavior test is not authorized'
      USING ERRCODE = '42501';
  END IF;

  PERFORM pg_advisory_xact_lock(
    hashtextextended('goap:workspace-guest-resources:behavior:v1', 0)
  );
END;
$behavior_guard$;

CREATE TEMP TABLE goap_workspace_guest_resource_behavior_state (
  key TEXT PRIMARY KEY,
  value UUID NOT NULL
) ON COMMIT DROP;

DO $behavior_fixtures$
DECLARE
  actor_id UUID := gen_random_uuid();
  actor_b_id UUID := gen_random_uuid();
  workspace_a_id UUID := gen_random_uuid();
  workspace_b_id UUID := gen_random_uuid();
  template_id UUID := gen_random_uuid();
  default_workspace_id UUID;
  auth_instance_id UUID;
  actor_email TEXT :=
    'wgr-behavior-' || replace(gen_random_uuid()::TEXT, '-', '')
    || '@example.invalid';
  actor_b_email TEXT :=
    'wgr-behavior-b-' || replace(gen_random_uuid()::TEXT, '-', '')
    || '@example.invalid';
  test_suffix TEXT := substr(replace(gen_random_uuid()::TEXT, '-', ''), 1, 16);
BEGIN
  SELECT workspace.id
  INTO default_workspace_id
  FROM public.workspaces AS workspace
  WHERE workspace.is_default
    AND workspace.status = 'active';

  IF default_workspace_id IS NULL THEN
    RAISE EXCEPTION 'behavior fixture requires the active default workspace';
  END IF;

  SELECT auth_user.instance_id
  INTO auth_instance_id
  FROM auth.users AS auth_user
  WHERE auth_user.instance_id IS NOT NULL
  ORDER BY auth_user.created_at
  LIMIT 1;
  auth_instance_id := COALESCE(
    auth_instance_id,
    '00000000-0000-0000-0000-000000000000'::UUID
  );

  INSERT INTO auth.users (
    instance_id,
    id,
    aud,
    role,
    email,
    encrypted_password,
    email_confirmed_at,
    raw_app_meta_data,
    raw_user_meta_data,
    created_at,
    updated_at
  )
  VALUES (
    auth_instance_id,
    actor_id,
    'authenticated',
    'authenticated',
    actor_email,
    '',
    now(),
    jsonb_build_object('provider', 'email', 'providers', ARRAY['email']),
    '{}'::JSONB,
    now(),
    now()
  ), (
    auth_instance_id,
    actor_b_id,
    'authenticated',
    'authenticated',
    actor_b_email,
    '',
    now(),
    jsonb_build_object('provider', 'email', 'providers', ARRAY['email']),
    '{}'::JSONB,
    now(),
    now()
  );

  INSERT INTO public.guest_resources (
    id,
    title,
    description,
    content,
    category,
    type,
    url,
    file_url,
    featured,
    display_order,
    created_at,
    updated_at
  )
  VALUES (
    template_id,
    'Behavior Source Template',
    'Disposable source template for rollback verification',
    '<p>Behavior template content</p>',
    'preparation',
    'article',
    NULL,
    NULL,
    false,
    900000,
    now(),
    now()
  );

  INSERT INTO public.workspaces (
    id,
    name,
    slug,
    status,
    is_default,
    created_by
  )
  VALUES
    (
      workspace_a_id,
      'WGR Behavior A',
      'wgr-behavior-a-' || test_suffix,
      'active',
      false,
      actor_id
    ),
    (
      workspace_b_id,
      'WGR Behavior B',
      'wgr-behavior-b-' || test_suffix,
      'active',
      false,
      actor_b_id
    );

  INSERT INTO public.workspace_memberships (
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
      workspace_a_id,
      actor_id,
      lower(actor_email),
      'WGR Behavior Actor',
      'owner',
      'active',
      actor_id,
      now(),
      actor_id,
      'email_invite',
      false,
      floor(EXTRACT(EPOCH FROM clock_timestamp()))::BIGINT - 10
    ),
    (
      workspace_b_id,
      actor_b_id,
      lower(actor_b_email),
      'WGR Behavior Actor B',
      'owner',
      'active',
      actor_b_id,
      now(),
      actor_b_id,
      'email_invite',
      false,
      floor(EXTRACT(EPOCH FROM clock_timestamp()))::BIGINT - 10
    );

  INSERT INTO goap_workspace_guest_resource_behavior_state (key, value)
  VALUES
    ('actor', actor_id),
    ('actor_b', actor_b_id),
    ('workspace_a', workspace_a_id),
    ('workspace_b', workspace_b_id),
    ('default_workspace', default_workspace_id),
    ('template', template_id);
END;
$behavior_fixtures$;

SET CONSTRAINTS ALL IMMEDIATE;
SET CONSTRAINTS ALL DEFERRED;

DO $behavior_checks$
DECLARE
  actor_id UUID;
  actor_b_id UUID;
  workspace_a_id UUID;
  workspace_b_id UUID;
  default_workspace_id UUID;
  template_id UUID;
  client_a_id UUID := gen_random_uuid();
  client_a2_id UUID := gen_random_uuid();
  client_b_id UUID := gen_random_uuid();
  default_client_id UUID := gen_random_uuid();
  selected_a_resource_id UUID;
  selected_a2_resource_id UUID;
  draft_resource_id UUID;
  archived_resource_id UUID;
  all_resource_id UUID;
  delete_resource_id UUID;
  source_clone_a_id UUID;
  source_clone_b_id UUID;
  token_epoch BIGINT := floor(EXTRACT(EPOCH FROM clock_timestamp()))::BIGINT;
  session_a TEXT := 'sha256$' || repeat('A', 43) || '=';
  session_a2 TEXT := 'sha256$' || repeat('B', 43) || '=';
  session_default TEXT := 'sha256$' || repeat('C', 43) || '=';
  password_verifier TEXT :=
    'pbkdf2_sha256$100000$' || repeat('S', 22) || '==$'
    || repeat('H', 43) || '=';
  response JSONB;
  expected_total BIGINT;
  portal_resources JSONB;
  page_offset INTEGER;
  page_count INTEGER;
  rejected BOOLEAN;
  clone_count INTEGER;
  quota_run TEXT := substr(replace(gen_random_uuid()::TEXT, '-', ''), 1, 12);
  remaining_content BIGINT;
  content_chunk INTEGER;
  quota_index INTEGER;
  current_count INTEGER;
  current_content BIGINT;
  fill_count INTEGER;
  platform_actor_id UUID;
  resource_type_name TEXT;
  article_content TEXT;
  malformed_url TEXT;
BEGIN
  SELECT value INTO actor_id
  FROM goap_workspace_guest_resource_behavior_state WHERE key = 'actor';
  SELECT value INTO actor_b_id
  FROM goap_workspace_guest_resource_behavior_state WHERE key = 'actor_b';
  SELECT value INTO workspace_a_id
  FROM goap_workspace_guest_resource_behavior_state WHERE key = 'workspace_a';
  SELECT value INTO workspace_b_id
  FROM goap_workspace_guest_resource_behavior_state WHERE key = 'workspace_b';
  SELECT value INTO default_workspace_id
  FROM goap_workspace_guest_resource_behavior_state
  WHERE key = 'default_workspace';
  SELECT value INTO template_id
  FROM goap_workspace_guest_resource_behavior_state WHERE key = 'template';

  SELECT resource.id INTO source_clone_a_id
  FROM public.workspace_guest_resources AS resource
  WHERE resource.workspace_id = workspace_a_id
    AND resource.source_template_id = template_id;
  SELECT resource.id INTO source_clone_b_id
  FROM public.workspace_guest_resources AS resource
  WHERE resource.workspace_id = workspace_b_id
    AND resource.source_template_id = template_id;

  IF source_clone_a_id IS NULL OR source_clone_b_id IS NULL
    OR EXISTS (
      SELECT 1
      FROM public.workspace_guest_resources AS resource
      WHERE resource.id IN (source_clone_a_id, source_clone_b_id)
        AND NOT COALESCE(
          public.guest_resource_content_has_meaningful_text(resource.content),
          false
        )
    )
  THEN
    RAISE EXCEPTION 'future private workspaces did not clone the template catalog';
  END IF;

  IF public.guest_resource_content_has_meaningful_text(
      '<p>&nbsp;&#160;&#xA0;</p>'
    )
    OR public.guest_resource_content_has_meaningful_text(
      '<p>' || chr(160) || chr(8203) || chr(8204) || chr(8205)
        || chr(65279) || '</p>'
    )
    OR public.guest_resource_content_has_meaningful_text(
      '<p>&#8203;&#8204;&#8205;&#65279;'
        || '&#x200B;&#x200c;&#x200D;&#xFEFF;</p>'
    )
    OR public.guest_resource_content_has_meaningful_text(
      '<p>&#32;&#x20;&#9;&Tab;&NewLine;</p>'
    )
    OR public.guest_resource_content_has_meaningful_text(
      '<p>&nbsp&shy</p>'
    )
    OR public.guest_resource_content_has_meaningful_text(
      '<p>&#5760;&#8192;&#8202;&#8232;&#8233;&#8239;&#8287;&#12288;&#65279;</p>'
    )
    OR public.guest_resource_content_has_meaningful_text(
      '<p>&#x1680;&#x2000;&#x200A;&#x2028;&#x2029;&#x202F;&#x205F;&#x3000;&#xFEFF;</p>'
    )
    OR public.guest_resource_content_has_meaningful_text(
      '<p>&ZeroWidthSpace;&zwnj;&zwj;&NoBreak;&ApplyFunction;&af;'
        || '&InvisibleTimes;&it;&InvisibleComma;&ic;&shy;&lrm;&rlm;</p>'
    )
    OR public.guest_resource_content_has_meaningful_text(
      '<p>&ensp;&emsp;&emsp13;&emsp14;&numsp;&puncsp;&thinsp;&ThinSpace;'
        || '&hairsp;&VeryThinSpace;&MediumSpace;&ThickSpace;'
        || '&NegativeMediumSpace;&NegativeThickSpace;&NegativeThinSpace;'
        || '&NegativeVeryThinSpace;&NonBreakingSpace;</p>'
    )
    OR public.guest_resource_content_has_meaningful_text(
      '<p>&#1;&#31;&#127;&#129;&#141;&#143;&#144;&#157;'
        || '&#x1;&#x1F;&#x7F;&#x81;&#x8D;&#x8F;&#x90;&#x9D;</p>'
    )
    OR public.guest_resource_content_has_meaningful_text(
      '<p>' || chr(1) || chr(31) || chr(127) || chr(159) || '</p>'
    )
    OR public.guest_resource_content_has_meaningful_text(
      '<p>&#1536;&#1541;&#1757;&#1807;&#2192;&#2193;&#2274;'
        || '&#65529;&#65531;&#69821;&#69837;'
        || '&#x600;&#x605;&#x6DD;&#x70F;&#x890;&#x891;&#x8E2;'
        || '&#xFFF9;&#xFFFB;&#x110BD;&#x110CD;</p>'
    )
    OR public.guest_resource_content_has_meaningful_text(
      '<p>' || chr(1536) || chr(1541) || chr(1757) || chr(1807)
        || chr(2192) || chr(2193) || chr(2274) || chr(65529)
        || chr(65531) || chr(69821) || chr(69837) || '</p>'
    )
    OR public.guest_resource_content_has_meaningful_text(
      '<p>&#173;&#8206;&#8207;&#8288;&#8289;&#8290;&#8291;&#8292;'
        || '&#xAD;&#x200E;&#x200F;&#x2060;&#x2061;&#x2062;&#x2063;&#x2064;</p>'
    )
    OR public.guest_resource_content_has_meaningful_text(
      '<p>' || chr(173) || chr(8206) || chr(8207) || chr(8288)
        || chr(8289) || chr(8290) || chr(8291) || chr(8292) || '</p>'
    )
    OR public.guest_resource_content_has_meaningful_text(
      '<p>&#847;&#6155;&#6159;&#65024;&#65039;&#917760;&#917999;'
        || '&#x34F;&#x180B;&#x180F;&#xFE00;&#xFE0F;&#xE0100;&#xE01EF;</p>'
    )
    OR public.guest_resource_content_has_meaningful_text(
      '<p>' || chr(847) || chr(6155) || chr(6159) || chr(65024)
        || chr(65039) || chr(917760) || chr(917999) || '</p>'
    )
    OR public.guest_resource_content_has_meaningful_text(
      '<p>&#x061C;&#x180E;&#x202A;&#x2069;</p>'
    )
    OR public.guest_resource_content_has_meaningful_text(
      '<p>' || chr(1564) || chr(6158) || chr(8234) || chr(8297) || '</p>'
    )
    OR public.guest_resource_content_has_meaningful_text(
      '<p>&#10240;&#x2800;</p>'
    )
    OR public.guest_resource_content_has_meaningful_text(
      '<p>' || chr(10240) || '</p>'
    )
    OR NOT public.guest_resource_content_has_meaningful_text(
      '<p>&Tab&NewLine&#32&#x20</p>'
    )
    OR NOT public.guest_resource_content_has_meaningful_text(
      '<p>&NBSP;&tab;&newline;&ZEROWIDTHSPACE;</p>'
    )
    OR NOT public.guest_resource_content_has_meaningful_text(
      '<p>&nbspx;&shy=;&thinspace;&HairSpace;</p>'
    )
    OR NOT public.guest_resource_content_has_meaningful_text(
      '<p>&#0;&#128;&#133;&#x80;&#x85;&#xD800;</p>'
    )
    OR public.guest_resource_content_has_meaningful_text('<p><br></p>')
    OR NOT public.guest_resource_content_has_meaningful_text(
      '<p>&itinerary;&#320;</p>'
    )
    OR NOT public.guest_resource_content_has_meaningful_text(
      '<p>&nnbsp;</p>'
    )
    OR public.guest_resource_content_has_meaningful_text(
      '<p title=">"> </p>'
    )
    OR public.guest_resource_content_has_meaningful_text(
      '<p title=''>''></p>'
    )
    OR public.guest_resource_content_has_meaningful_text(
      '<p title=">Visible</p>'
    )
    OR public.guest_resource_content_has_meaningful_text(
      '<p><script>Visible bait</script><style>Visible bait</style>'
        || '<template><strong>Visible bait</strong></template></p>'
    )
    OR public.guest_resource_content_has_meaningful_text(
      '<p><svg><desc>Visible bait</desc></svg>'
        || '<math><mtext>Visible bait</mtext></math>'
        || '<iframe>Visible bait</iframe><audio>Visible bait</audio>'
        || '<annotation-xml>Visible bait</annotation-xml>'
        || '<foreignObject>Visible bait</foreignObject>'
        || '<selectedcontent>Visible bait</selectedcontent></p>'
    )
    OR public.guest_resource_content_has_meaningful_text(
      '<p><!-- Visible bait > --></p>'
    )
    OR public.guest_resource_content_has_meaningful_text(
      '<p><svg><text data-x="</svg>">Visible bait</text></svg></p>'
    )
    OR public.guest_resource_content_has_meaningful_text(
      '<p>Visible article copy<script>hidden</script></p>'
    )
    OR public.guest_resource_content_has_meaningful_text(
      '<p>Visible article copy<!-- hidden --></p>'
    )
    OR public.guest_resource_content_has_meaningful_text(
      '<p title="<script>">Visible article copy</p>'
    )
    OR public.guest_resource_content_has_meaningful_text(
      '<p title="<!--">Visible article copy</p>'
    )
    OR public.guest_resource_content_has_meaningful_text(
      '<p><svg' || chr(160) || '>Visible article copy</svg></p>'
    )
    OR NOT public.guest_resource_content_has_meaningful_text(
      '<p><script_foo>Visible article copy</script_foo></p>'
    )
    OR NOT public.guest_resource_content_has_meaningful_text(
      '<p title=">">Meaningful article</p>'
    )
    OR NOT public.guest_resource_content_has_meaningful_text(
      '<p>Meaningful article</p>'
    )
  THEN
    RAISE EXCEPTION 'meaningful article-content normalization is inconsistent';
  END IF;

  IF public.guest_resource_http_url_is_safe('https://%')
    OR public.guest_resource_http_url_is_safe('https://[')
    OR public.guest_resource_http_url_is_safe(
      'https://user:password@example.com/path'
    )
    OR NOT public.guest_resource_http_url_is_safe(
      'https://example.com/resources/guide?version=1#start'
    )
    OR NOT public.guest_resource_http_url_is_safe(
      'http://localhost:8080/resources/file'
    )
    OR NOT public.guest_resource_http_url_is_safe(
      'https://[::1]:8443/resources/file'
    )
  THEN
    RAISE EXCEPTION 'HTTP URL safety normalization is inconsistent';
  END IF;

  IF public.guest_resource_text_is_normalized_nonempty(chr(160), 200)
    OR public.guest_resource_text_is_normalized_nonempty(chr(65279), 2000)
    OR public.guest_resource_text_is_normalized_nonempty(
      chr(160) || 'Visible title',
      200
    )
    OR public.guest_resource_text_is_normalized_nonempty(
      'Visible description' || chr(65279),
      2000
    )
    OR NOT public.guest_resource_text_is_normalized_nonempty(
      'Visible title',
      200
    )
    OR NOT public.guest_resource_text_is_normalized_nonempty(
      'Visible description',
      2000
    )
  THEN
    RAISE EXCEPTION 'normalized title/description semantics are inconsistent';
  END IF;

  clone_count := public.clone_workspace_guest_resource_templates(
    workspace_a_id,
    actor_id
  );
  IF clone_count <> 0 THEN
    RAISE EXCEPTION 'template clone retry was not idempotent';
  END IF;

  UPDATE public.guest_resources
  SET
    title = 'Behavior Source Template Revised',
    updated_at = now()
  WHERE id = template_id;

  IF EXISTS (
    SELECT 1
    FROM public.workspace_guest_resources
    WHERE id IN (source_clone_a_id, source_clone_b_id)
      AND title <> 'Behavior Source Template'
  ) THEN
    RAISE EXCEPTION 'workspace snapshots live-synced a template edit';
  END IF;

  FOREACH article_content IN ARRAY ARRAY[
    NULL::TEXT,
    '<p>&nbsp;&#160;&#xA0;</p>'::TEXT,
    '<p>&#32;&#x20;&#9;&Tab;&NewLine;</p>'::TEXT,
    '<p>&nbsp&shy</p>'::TEXT,
    '<p>&#5760;&#8192;&#8202;&#8232;&#8233;&#8239;&#8287;&#12288;&#65279;</p>'::TEXT,
    '<p>&#x1680;&#x2000;&#x200A;&#x2028;&#x2029;&#x202F;&#x205F;&#x3000;&#xFEFF;</p>'::TEXT,
    ('<p>&ZeroWidthSpace;&zwnj;&zwj;&NoBreak;&ApplyFunction;&af;'
      || '&InvisibleTimes;&it;&InvisibleComma;&ic;&shy;&lrm;&rlm;</p>')::TEXT,
    ('<p>&ensp;&emsp;&emsp13;&emsp14;&numsp;&puncsp;&thinsp;&ThinSpace;'
      || '&hairsp;&VeryThinSpace;&MediumSpace;&ThickSpace;'
      || '&NegativeMediumSpace;&NegativeThickSpace;&NegativeThinSpace;'
      || '&NegativeVeryThinSpace;&NonBreakingSpace;</p>')::TEXT,
    ('<p>&#1;&#31;&#127;&#129;&#141;&#143;&#144;&#157;'
      || '&#x1;&#x1F;&#x7F;&#x81;&#x8D;&#x8F;&#x90;&#x9D;</p>')::TEXT,
    ('<p>' || chr(1) || chr(31) || chr(127) || chr(159) || '</p>')::TEXT,
    ('<p>&#1536;&#1541;&#1757;&#1807;&#2192;&#2193;&#2274;'
      || '&#65529;&#65531;&#69821;&#69837;'
      || '&#x600;&#x605;&#x6DD;&#x70F;&#x890;&#x891;&#x8E2;'
      || '&#xFFF9;&#xFFFB;&#x110BD;&#x110CD;</p>')::TEXT,
    ('<p>' || chr(1536) || chr(1541) || chr(1757) || chr(1807)
      || chr(2192) || chr(2193) || chr(2274) || chr(65529)
      || chr(65531) || chr(69821) || chr(69837) || '</p>')::TEXT,
    ('<p>&#173;&#8206;&#8207;&#8288;&#8289;&#8290;&#8291;&#8292;'
      || '&#xAD;&#x200E;&#x200F;&#x2060;&#x2061;&#x2062;&#x2063;&#x2064;</p>')::TEXT,
    ('<p>&#847;&#6155;&#6159;&#65024;&#65039;&#917760;&#917999;'
      || '&#x34F;&#x180B;&#x180F;&#xFE00;&#xFE0F;&#xE0100;&#xE01EF;</p>')::TEXT,
    '<p>&#x061C;&#x180E;&#x202A;&#x2069;</p>'::TEXT,
    '<p>&#10240;&#x2800;</p>'::TEXT,
    ('<p>' || chr(10240) || '</p>')::TEXT,
    '<p title=">"></p>'::TEXT,
    '<p title=">Visible</p>'::TEXT,
    '<p><!-- Visible bait > --></p>'::TEXT,
    '<p>Visible article copy<!-- hidden --></p>'::TEXT,
    '<p>Visible article copy<script>hidden</script></p>'::TEXT,
    '<p title="<script>">Visible article copy</p>'::TEXT,
    '<p title="<!--">Visible article copy</p>'::TEXT,
    ('<p><svg' || chr(160) || '>Visible article copy</svg></p>')::TEXT,
    '<p><svg><text data-x="</svg>">Visible bait</text></svg></p>'::TEXT,
    ('<p><script>Visible bait</script><style>Visible bait</style>'
      || '<template><strong>Visible bait</strong></template></p>')::TEXT,
    ('<p><svg><desc>Visible bait</desc></svg>'
      || '<math><mtext>Visible bait</mtext></math>'
      || '<iframe>Visible bait</iframe><audio>Visible bait</audio>'
      || '<annotation-xml>Visible bait</annotation-xml>'
      || '<foreignObject>Visible bait</foreignObject>'
      || '<selectedcontent>Visible bait</selectedcontent></p>')::TEXT,
    '<p>&#8203;&#8204;&#8205;&#65279;&#x200B;&#x200c;&#x200D;&#xFEFF;</p>'::TEXT,
    ('<p>' || chr(160) || chr(8203) || chr(8204) || chr(8205)
      || chr(65279) || '</p>')::TEXT
  ]
  LOOP
    rejected := false;
    BEGIN
      INSERT INTO public.guest_resources (
        title, description, content, category, type, featured, display_order
      ) VALUES (
        'Behavior Empty Global Article',
        'Global articles require visible text',
        article_content,
        'examples',
        'article',
        false,
        910000
      );
    EXCEPTION WHEN check_violation THEN
      rejected := true;
    END;
    IF NOT rejected THEN
      RAISE EXCEPTION 'global article accepted visually empty content';
    END IF;
  END LOOP;

  FOREACH malformed_url IN ARRAY ARRAY['https://%'::TEXT, 'https://['::TEXT]
  LOOP
    rejected := false;
    BEGIN
      INSERT INTO public.guest_resources (
        title, description, category, type, url, featured, display_order
      ) VALUES (
        'Behavior Malformed Global URL',
        'Malformed browser-incompatible authorities must be rejected',
        'templates',
        'link',
        malformed_url,
        false,
        910000
      );
    EXCEPTION WHEN check_violation THEN
      rejected := true;
    END;
    IF NOT rejected THEN
      RAISE EXCEPTION 'global catalog accepted malformed URL %', malformed_url;
    END IF;
  END LOOP;

  rejected := false;
  BEGIN
    INSERT INTO public.guest_resources (
      title, description, content, category, type, featured, display_order
    ) VALUES (
      chr(160),
      'Global title must not be ECMAScript whitespace-only',
      '<p>Visible content</p>',
      'examples',
      'article',
      false,
      910000
    );
  EXCEPTION WHEN check_violation THEN
    rejected := true;
  END;
  IF NOT rejected THEN
    RAISE EXCEPTION 'global catalog accepted an NBSP-only title';
  END IF;

  rejected := false;
  BEGIN
    INSERT INTO public.guest_resources (
      title, description, content, category, type, featured, display_order
    ) VALUES (
      'Behavior Global FEFF Description',
      chr(65279),
      '<p>Visible content</p>',
      'examples',
      'article',
      false,
      910000
    );
  EXCEPTION WHEN check_violation THEN
    rejected := true;
  END;
  IF NOT rejected THEN
    RAISE EXCEPTION 'global catalog accepted a FEFF-only description';
  END IF;

  UPDATE public.guest_resources
  SET
    url = 'https://example.com/resources/guide?version=1#start',
    file_url = 'http://localhost:8080/resources/file'
  WHERE id = template_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'valid global URL constraint fixture disappeared';
  END IF;
  UPDATE public.guest_resources
  SET url = NULL, file_url = NULL
  WHERE id = template_id;

  INSERT INTO public.clients (
    id,
    workspace_id,
    name,
    email,
    status,
    portal_access_enabled,
    portal_password,
    password_set_at,
    password_set_by
  )
  VALUES
    (
      client_a_id,
      workspace_a_id,
      'Behavior Client A',
      'client-a-' || quota_run || '@example.invalid',
      'active',
      true,
      NULL,
      now(),
      'behavior'
    ),
    (
      client_a2_id,
      workspace_a_id,
      'Behavior Client A2',
      'client-a2-' || quota_run || '@example.invalid',
      'active',
      true,
      NULL,
      now(),
      'behavior'
    ),
    (
      client_b_id,
      workspace_b_id,
      'Behavior Client B',
      'client-b-' || quota_run || '@example.invalid',
      'active',
      false,
      NULL,
      NULL,
      NULL
    ),
    (
      default_client_id,
      default_workspace_id,
      'Behavior Default Client',
      'client-default-' || quota_run || '@example.invalid',
      'active',
      true,
      NULL,
      now(),
      'behavior'
    );

  INSERT INTO public.client_portal_credentials (
    client_id,
    password_verifier,
    configured_at,
    configured_by,
    updated_at
  )
  VALUES
    (client_a_id, password_verifier, now(), 'behavior', now()),
    (client_a2_id, password_verifier, now(), 'behavior', now()),
    (default_client_id, password_verifier, now(), 'behavior', now());

  INSERT INTO public.client_portal_sessions (
    client_id,
    session_token,
    expires_at,
    created_at,
    last_active_at
  )
  VALUES
    (client_a_id, session_a, now() + interval '1 hour', now(), now()),
    (client_a2_id, session_a2, now() + interval '1 hour', now(), now()),
    (
      default_client_id,
      session_default,
      now() + interval '1 hour',
      now(),
      now()
    );

  INSERT INTO public.client_portal_tokens (
    client_id,
    token,
    expires_at,
    created_at
  )
  VALUES (
    client_a_id,
    'behavior-' || replace(gen_random_uuid()::TEXT, '-', ''),
    now() + interval '15 minutes',
    now()
  );

  response := public.workspace_guest_resource_operation_v1(
    'create',
    workspace_a_id,
    NULL,
    jsonb_build_object(
      'title', 'Behavior All Clients',
      'description', 'Published to every client in the workspace',
      'content', '<p>All clients</p>',
      'category', 'preparation',
      'type', 'article',
      'url', NULL,
      'file_url', NULL,
      'featured', true,
      'display_order', 910001,
      'status', 'published',
      'visibility', 'all_clients',
      'client_ids', '[]'::JSONB
    ),
    actor_id,
    token_epoch
  );
  all_resource_id := (response ->> 'id')::UUID;

  response := public.workspace_guest_resource_operation_v1(
    'create', workspace_a_id, NULL,
    jsonb_build_object(
      'title', 'Behavior Selected A',
      'description', 'Visible only to client A',
      'content', '<p>Selected A</p>',
      'category', 'best_practices',
      'type', 'article',
      'url', NULL,
      'file_url', NULL,
      'featured', false,
      'display_order', 910002,
      'status', 'published',
      'visibility', 'selected_clients',
      'client_ids', jsonb_build_array(client_a_id)
    ), actor_id, token_epoch
  );
  selected_a_resource_id := (response ->> 'id')::UUID;

  response := public.workspace_guest_resource_operation_v1(
    'create', workspace_a_id, NULL,
    jsonb_build_object(
      'title', 'Behavior Selected A2',
      'description', 'Visible only to client A2',
      'content', '<p>Selected A2</p>',
      'category', 'best_practices',
      'type', 'article',
      'url', NULL,
      'file_url', NULL,
      'featured', false,
      'display_order', 910003,
      'status', 'published',
      'visibility', 'selected_clients',
      'client_ids', jsonb_build_array(client_a2_id)
    ), actor_id, token_epoch
  );
  selected_a2_resource_id := (response ->> 'id')::UUID;

  response := public.workspace_guest_resource_operation_v1(
    'create', workspace_a_id, NULL,
    jsonb_build_object(
      'title', 'Behavior Draft',
      'description', 'Draft resources remain private',
      'content', '<p>&nbsp;&#160;&#xA0;</p>',
      'category', 'examples',
      'type', 'article',
      'url', NULL,
      'file_url', NULL,
      'featured', false,
      'display_order', 910004,
      'status', 'draft',
      'visibility', 'all_clients',
      'client_ids', '[]'::JSONB
    ), actor_id, token_epoch
  );
  draft_resource_id := (response ->> 'id')::UUID;

  response := public.workspace_guest_resource_operation_v1(
    'create', workspace_a_id, NULL,
    jsonb_build_object(
      'title', 'Behavior Archived',
      'description', 'Archived resources remain private',
      'content', '<p>&#8203;&#8204;&#8205;&#65279;'
        || '&#x200B;&#x200c;&#x200D;&#xFEFF;</p>',
      'category', 'examples',
      'type', 'article',
      'url', NULL,
      'file_url', NULL,
      'featured', false,
      'display_order', 910005,
      'status', 'archived',
      'visibility', 'all_clients',
      'client_ids', '[]'::JSONB
    ), actor_id, token_epoch
  );
  archived_resource_id := (response ->> 'id')::UUID;

  response := public.workspace_guest_resource_operation_v1(
    'create', workspace_a_id, NULL,
    jsonb_build_object(
      'title', 'Behavior Delete Target',
      'description', 'Disposable delete target',
      'content', NULL,
      'category', 'templates',
      'type', 'article',
      'url', NULL,
      'file_url', NULL,
      'featured', false,
      'display_order', 910006,
      'status', 'draft',
      'visibility', 'all_clients',
      'client_ids', '[]'::JSONB
    ), actor_id, token_epoch
  );
  delete_resource_id := (response ->> 'id')::UUID;

  response := public.workspace_guest_resource_operation_v1(
    'update', workspace_a_id, selected_a_resource_id,
    jsonb_build_object(
      'title', 'Behavior Selected A Updated',
      'description', 'Atomic selected-client replacement retained client A',
      'content', '<p>Selected A updated</p>',
      'category', 'best_practices',
      'type', 'article',
      'url', NULL,
      'file_url', NULL,
      'featured', false,
      'display_order', 910002,
      'status', 'published',
      'visibility', 'selected_clients',
      'client_ids', jsonb_build_array(client_a_id)
    ), actor_id, token_epoch
  );
  IF response ->> 'title' <> 'Behavior Selected A Updated'
    OR response -> 'client_ids' <> jsonb_build_array(client_a_id)
  THEN
    RAISE EXCEPTION 'workspace action update did not return the exact assignment';
  END IF;

  response := public.workspace_guest_resource_operation_v1(
    'list', workspace_a_id, NULL, '{}'::JSONB, actor_id, token_epoch
  );
  IF jsonb_typeof(response) <> 'array'
    OR NOT EXISTS (
      SELECT 1 FROM jsonb_array_elements(response) AS item(value)
      WHERE item.value ->> 'id' = all_resource_id::TEXT
    )
  THEN
    RAISE EXCEPTION 'workspace owner could not list the managed catalog';
  END IF;

  PERFORM public.workspace_guest_resource_operation_v1(
    'delete', workspace_a_id, delete_resource_id, '{}'::JSONB,
    actor_id, token_epoch
  );
  IF EXISTS (
    SELECT 1 FROM public.workspace_guest_resources
    WHERE id = delete_resource_id
  ) THEN
    RAISE EXCEPTION 'workspace action delete did not remove its target';
  END IF;

  FOREACH resource_type_name IN ARRAY ARRAY['video', 'link', 'download']
  LOOP
    rejected := false;
    BEGIN
      PERFORM public.workspace_guest_resource_operation_v1(
        'create', workspace_a_id, NULL,
        jsonb_build_object(
          'title', 'Behavior Missing Action Target',
          'description', 'Published action resources require a target',
          'content', NULL,
          'category', 'examples',
          'type', resource_type_name,
          'url', NULL,
          'file_url', NULL,
          'featured', false,
          'display_order', 910010,
          'status', 'published',
          'visibility', 'all_clients',
          'client_ids', '[]'::JSONB
        ), actor_id, token_epoch
      );
    EXCEPTION WHEN SQLSTATE '22023' THEN
      rejected := true;
    END;
    IF NOT rejected THEN
      RAISE EXCEPTION 'published % resource accepted a missing target',
        resource_type_name;
    END IF;
  END LOOP;

  FOREACH article_content IN ARRAY ARRAY[
    NULL::TEXT,
    '<p>&nbsp;&#160;&#xA0;</p>'::TEXT,
    '<p>&#32;&#x20;&#9;&Tab;&NewLine;</p>'::TEXT,
    '<p>&nbsp&shy</p>'::TEXT,
    '<p>&#5760;&#8192;&#8202;&#8232;&#8233;&#8239;&#8287;&#12288;&#65279;</p>'::TEXT,
    '<p>&#x1680;&#x2000;&#x200A;&#x2028;&#x2029;&#x202F;&#x205F;&#x3000;&#xFEFF;</p>'::TEXT,
    ('<p>&ZeroWidthSpace;&zwnj;&zwj;&NoBreak;&ApplyFunction;&af;'
      || '&InvisibleTimes;&it;&InvisibleComma;&ic;&shy;&lrm;&rlm;</p>')::TEXT,
    ('<p>&ensp;&emsp;&emsp13;&emsp14;&numsp;&puncsp;&thinsp;&ThinSpace;'
      || '&hairsp;&VeryThinSpace;&MediumSpace;&ThickSpace;'
      || '&NegativeMediumSpace;&NegativeThickSpace;&NegativeThinSpace;'
      || '&NegativeVeryThinSpace;&NonBreakingSpace;</p>')::TEXT,
    ('<p>&#1;&#31;&#127;&#129;&#141;&#143;&#144;&#157;'
      || '&#x1;&#x1F;&#x7F;&#x81;&#x8D;&#x8F;&#x90;&#x9D;</p>')::TEXT,
    ('<p>' || chr(1) || chr(31) || chr(127) || chr(159) || '</p>')::TEXT,
    ('<p>&#1536;&#1541;&#1757;&#1807;&#2192;&#2193;&#2274;'
      || '&#65529;&#65531;&#69821;&#69837;'
      || '&#x600;&#x605;&#x6DD;&#x70F;&#x890;&#x891;&#x8E2;'
      || '&#xFFF9;&#xFFFB;&#x110BD;&#x110CD;</p>')::TEXT,
    ('<p>' || chr(1536) || chr(1541) || chr(1757) || chr(1807)
      || chr(2192) || chr(2193) || chr(2274) || chr(65529)
      || chr(65531) || chr(69821) || chr(69837) || '</p>')::TEXT,
    ('<p>&#173;&#8206;&#8207;&#8288;&#8289;&#8290;&#8291;&#8292;'
      || '&#xAD;&#x200E;&#x200F;&#x2060;&#x2061;&#x2062;&#x2063;&#x2064;</p>')::TEXT,
    ('<p>&#847;&#6155;&#6159;&#65024;&#65039;&#917760;&#917999;'
      || '&#x34F;&#x180B;&#x180F;&#xFE00;&#xFE0F;&#xE0100;&#xE01EF;</p>')::TEXT,
    '<p>&#x061C;&#x180E;&#x202A;&#x2069;</p>'::TEXT,
    '<p>&#10240;&#x2800;</p>'::TEXT,
    ('<p>' || chr(10240) || '</p>')::TEXT,
    '<p title=">"></p>'::TEXT,
    '<p title=">Visible</p>'::TEXT,
    '<p><!-- Visible bait > --></p>'::TEXT,
    '<p>Visible article copy<!-- hidden --></p>'::TEXT,
    '<p>Visible article copy<script>hidden</script></p>'::TEXT,
    '<p title="<script>">Visible article copy</p>'::TEXT,
    '<p title="<!--">Visible article copy</p>'::TEXT,
    ('<p><svg' || chr(160) || '>Visible article copy</svg></p>')::TEXT,
    '<p><svg><text data-x="</svg>">Visible bait</text></svg></p>'::TEXT,
    ('<p><script>Visible bait</script><style>Visible bait</style>'
      || '<template><strong>Visible bait</strong></template></p>')::TEXT,
    ('<p><svg><desc>Visible bait</desc></svg>'
      || '<math><mtext>Visible bait</mtext></math>'
      || '<iframe>Visible bait</iframe><audio>Visible bait</audio>'
      || '<annotation-xml>Visible bait</annotation-xml>'
      || '<foreignObject>Visible bait</foreignObject>'
      || '<selectedcontent>Visible bait</selectedcontent></p>')::TEXT,
    '<p>&#8203;&#8204;&#8205;&#65279;&#x200B;&#x200c;&#x200D;&#xFEFF;</p>'::TEXT,
    ('<p>' || chr(160) || chr(8203) || chr(8204) || chr(8205)
      || chr(65279) || '</p>')::TEXT
  ]
  LOOP
    rejected := false;
    BEGIN
      PERFORM public.workspace_guest_resource_operation_v1(
        'create', workspace_a_id, NULL,
        jsonb_build_object(
          'title', 'Behavior Empty Published Article',
          'description', 'Published articles require visible text',
          'content', article_content,
          'category', 'examples',
          'type', 'article',
          'url', NULL,
          'file_url', NULL,
          'featured', false,
          'display_order', 910010,
          'status', 'published',
          'visibility', 'all_clients',
          'client_ids', '[]'::JSONB
        ), actor_id, token_epoch
      );
    EXCEPTION WHEN SQLSTATE '22023' THEN
      rejected := true;
    END;
    IF NOT rejected THEN
      RAISE EXCEPTION 'published article accepted visually empty content';
    END IF;
  END LOOP;

  rejected := false;
  BEGIN
    INSERT INTO public.workspace_guest_resources (
      workspace_id,
      title,
      description,
      content,
      category,
      type,
      status,
      published_at,
      visibility,
      created_by,
      updated_by
    ) VALUES (
      workspace_a_id,
      'Behavior Direct Empty Published Article',
      'The table constraint must reject visually empty published articles',
      '<p>' || chr(8203) || chr(8204) || chr(8205) || chr(65279) || '</p>',
      'examples',
      'article',
      'published',
      now(),
      'all_clients',
      actor_id,
      actor_id
    );
  EXCEPTION WHEN check_violation THEN
    rejected := true;
  END;
  IF NOT rejected THEN
    RAISE EXCEPTION 'workspace table accepted a visually empty published article';
  END IF;

  FOREACH malformed_url IN ARRAY ARRAY['https://%'::TEXT, 'https://['::TEXT]
  LOOP
    rejected := false;
    BEGIN
      INSERT INTO public.workspace_guest_resources (
        workspace_id,
        title,
        description,
        category,
        type,
        file_url,
        status,
        visibility,
        created_by,
        updated_by
      ) VALUES (
        workspace_a_id,
        'Behavior Direct Malformed File URL',
        'The workspace table must reject malformed URL authorities',
        'templates',
        'article',
        malformed_url,
        'draft',
        'all_clients',
        actor_id,
        actor_id
      );
    EXCEPTION WHEN check_violation THEN
      rejected := true;
    END;
    IF NOT rejected THEN
      RAISE EXCEPTION 'workspace table accepted malformed file URL %',
        malformed_url;
    END IF;
  END LOOP;

  rejected := false;
  BEGIN
    INSERT INTO public.workspace_guest_resources (
      workspace_id,
      title,
      description,
      category,
      type,
      status,
      visibility,
      created_by,
      updated_by
    ) VALUES (
      workspace_a_id,
      chr(160),
      'Workspace title must not be ECMAScript whitespace-only',
      'templates',
      'article',
      'draft',
      'all_clients',
      actor_id,
      actor_id
    );
  EXCEPTION WHEN check_violation THEN
    rejected := true;
  END;
  IF NOT rejected THEN
    RAISE EXCEPTION 'workspace table accepted an NBSP-only title';
  END IF;

  rejected := false;
  BEGIN
    INSERT INTO public.workspace_guest_resources (
      workspace_id,
      title,
      description,
      category,
      type,
      status,
      visibility,
      created_by,
      updated_by
    ) VALUES (
      workspace_a_id,
      'Behavior Workspace FEFF Description',
      chr(65279),
      'templates',
      'article',
      'draft',
      'all_clients',
      actor_id,
      actor_id
    );
  EXCEPTION WHEN check_violation THEN
    rejected := true;
  END;
  IF NOT rejected THEN
    RAISE EXCEPTION 'workspace table accepted a FEFF-only description';
  END IF;

  FOREACH malformed_url IN ARRAY ARRAY['https://%'::TEXT, 'https://['::TEXT]
  LOOP
    rejected := false;
    BEGIN
      PERFORM public.workspace_guest_resource_operation_v1(
        'create', workspace_a_id, NULL,
        jsonb_build_object(
          'title', 'Behavior Malformed Link URL',
          'description', 'Workspace mutation must reject malformed authorities',
          'content', NULL,
          'category', 'examples',
          'type', 'link',
          'url', malformed_url,
          'file_url', NULL,
          'featured', false,
          'display_order', 910011,
          'status', 'published',
          'visibility', 'all_clients',
          'client_ids', '[]'::JSONB
        ), actor_id, token_epoch
      );
    EXCEPTION WHEN SQLSTATE '22023' THEN
      rejected := true;
    END;
    IF NOT rejected THEN
      RAISE EXCEPTION 'workspace action accepted malformed URL %', malformed_url;
    END IF;

    rejected := false;
    BEGIN
      PERFORM public.workspace_guest_resource_operation_v1(
        'create', workspace_a_id, NULL,
        jsonb_build_object(
          'title', 'Behavior Malformed Download URL',
          'description', 'Workspace mutation must reject malformed file targets',
          'content', NULL,
          'category', 'examples',
          'type', 'download',
          'url', NULL,
          'file_url', malformed_url,
          'featured', false,
          'display_order', 910011,
          'status', 'published',
          'visibility', 'all_clients',
          'client_ids', '[]'::JSONB
        ), actor_id, token_epoch
      );
    EXCEPTION WHEN SQLSTATE '22023' THEN
      rejected := true;
    END;
    IF NOT rejected THEN
      RAISE EXCEPTION 'workspace action accepted malformed file URL %',
        malformed_url;
    END IF;
  END LOOP;

  rejected := false;
  BEGIN
    PERFORM public.workspace_guest_resource_operation_v1(
      'create', workspace_a_id, NULL,
      jsonb_build_object(
        'title', chr(160),
        'description', 'Workspace mutation must reject invisible titles',
        'content', NULL,
        'category', 'examples',
        'type', 'article',
        'url', NULL,
        'file_url', NULL,
        'featured', false,
        'display_order', 910011,
        'status', 'draft',
        'visibility', 'all_clients',
        'client_ids', '[]'::JSONB
      ), actor_id, token_epoch
    );
  EXCEPTION WHEN SQLSTATE '22023' THEN
    rejected := true;
  END;
  IF NOT rejected THEN
    RAISE EXCEPTION 'workspace action accepted an NBSP-only title';
  END IF;

  rejected := false;
  BEGIN
    PERFORM public.workspace_guest_resource_operation_v1(
      'create', workspace_a_id, NULL,
      jsonb_build_object(
        'title', 'Behavior RPC FEFF Description',
        'description', chr(65279),
        'content', NULL,
        'category', 'examples',
        'type', 'article',
        'url', NULL,
        'file_url', NULL,
        'featured', false,
        'display_order', 910011,
        'status', 'draft',
        'visibility', 'all_clients',
        'client_ids', '[]'::JSONB
      ), actor_id, token_epoch
    );
  EXCEPTION WHEN SQLSTATE '22023' THEN
    rejected := true;
  END;
  IF NOT rejected THEN
    RAISE EXCEPTION 'workspace action accepted a FEFF-only description';
  END IF;

  rejected := false;
  BEGIN
    PERFORM public.workspace_guest_resource_operation_v1(
      'create', workspace_a_id, NULL,
      jsonb_build_object(
        'title', 'Behavior Userinfo URL',
        'description', 'URL credentials must be rejected',
        'content', NULL,
        'category', 'examples',
        'type', 'link',
        'url', 'https://user:password@example.com/path',
        'file_url', NULL,
        'featured', false,
        'display_order', 910011,
        'status', 'published',
        'visibility', 'all_clients',
        'client_ids', '[]'::JSONB
      ), actor_id, token_epoch
    );
  EXCEPTION WHEN SQLSTATE '22023' THEN
    rejected := true;
  END;
  IF NOT rejected THEN
    RAISE EXCEPTION 'workspace action accepted URL userinfo';
  END IF;

  rejected := false;
  BEGIN
    PERFORM public.workspace_guest_resource_operation_v1(
      'create', workspace_a_id, NULL,
      jsonb_build_object(
        'title', 'Behavior Cross Workspace',
        'description', 'Cross-workspace client assignments must fail',
        'content', '<p>Cross workspace</p>',
        'category', 'examples',
        'type', 'article',
        'url', NULL,
        'file_url', NULL,
        'featured', false,
        'display_order', 910012,
        'status', 'published',
        'visibility', 'selected_clients',
        'client_ids', jsonb_build_array(client_b_id)
      ), actor_id, token_epoch
    );
  EXCEPTION WHEN SQLSTATE '22023' THEN
    rejected := true;
  END;
  IF NOT rejected THEN
    RAISE EXCEPTION 'workspace action accepted a cross-workspace client';
  END IF;

  rejected := false;
  BEGIN
    INSERT INTO public.workspace_guest_resource_clients (
      workspace_id, resource_id, client_id, created_by
    ) VALUES (
      workspace_a_id, selected_a_resource_id, client_b_id, actor_id
    );
  EXCEPTION WHEN foreign_key_violation THEN
    rejected := true;
  END;
  IF NOT rejected THEN
    RAISE EXCEPTION 'composite assignment FKs accepted a cross-workspace row';
  END IF;

  rejected := false;
  BEGIN
    PERFORM public.workspace_guest_resource_operation_v1(
      'list', workspace_a_id, NULL, '{}'::JSONB, actor_id,
      GREATEST(1, token_epoch - 3600)
    );
  EXCEPTION WHEN insufficient_privilege THEN
    rejected := true;
  END;
  IF NOT rejected THEN
    RAISE EXCEPTION 'workspace action accepted a stale access epoch';
  END IF;

  rejected := false;
  BEGIN
    PERFORM public.workspace_guest_resource_operation_v1(
      'list', workspace_a_id, NULL, '{}'::JSONB, actor_b_id, token_epoch
    );
  EXCEPTION WHEN insufficient_privilege THEN
    rejected := true;
  END;
  IF NOT rejected THEN
    RAISE EXCEPTION 'workspace action accepted a different tenant owner';
  END IF;

  SELECT auth_user.id
  INTO platform_actor_id
  FROM auth.users AS auth_user
  JOIN public.admin_users AS admin_user
    ON lower(btrim(admin_user.email)) = lower(btrim(auth_user.email))
  JOIN public.workspace_memberships AS membership
    ON membership.user_id = auth_user.id
    AND membership.status = 'active'
    AND membership.email_normalized = lower(btrim(auth_user.email))
  JOIN public.workspaces AS workspace
    ON workspace.id = membership.workspace_id
    AND workspace.is_default
    AND workspace.status = 'active'
  ORDER BY auth_user.id
  LIMIT 1;

  IF platform_actor_id IS NULL THEN
    RAISE EXCEPTION 'behavior fixture requires an active platform administrator';
  END IF;

  PERFORM public.workspace_guest_resource_operation_v1(
    'list', workspace_a_id, NULL, '{}'::JSONB, platform_actor_id, token_epoch
  );
  rejected := false;
  BEGIN
    PERFORM public.workspace_guest_resource_operation_v1(
      'delete', workspace_a_id, all_resource_id, '{}'::JSONB,
      platform_actor_id, token_epoch
    );
  EXCEPTION WHEN insufficient_privilege THEN
    rejected := true;
  END;
  IF NOT rejected THEN
    RAISE EXCEPTION 'platform administrator preview was not read-only';
  END IF;

  expected_total := NULL;
  portal_resources := '[]'::JSONB;
  page_offset := 0;
  LOOP
    response := public.portal_guest_resources_for_client_v1(
      client_a_id, session_a, NULL, NULL, false, 100, page_offset
    );
    IF response ->> 'total' IS NULL THEN
      RAISE EXCEPTION 'private portal page omitted its total';
    END IF;
    IF expected_total IS NULL THEN
      expected_total := (response ->> 'total')::BIGINT;
      IF expected_total NOT BETWEEN 0 AND 1000 THEN
        RAISE EXCEPTION 'private portal reported an invalid total';
      END IF;
    ELSIF (response ->> 'total')::BIGINT <> expected_total THEN
      RAISE EXCEPTION 'private portal total changed during pagination';
    END IF;

    IF jsonb_typeof(response -> 'resources') <> 'array' THEN
      RAISE EXCEPTION 'private portal page resources were malformed';
    END IF;
    page_count := jsonb_array_length(response -> 'resources');
    portal_resources := portal_resources || (response -> 'resources');
    EXIT WHEN page_offset + page_count >= expected_total;
    IF page_count = 0 THEN
      RAISE EXCEPTION 'private portal pagination stopped before its total';
    END IF;
    page_offset := page_offset + page_count;
  END LOOP;
  IF jsonb_array_length(portal_resources) <> expected_total THEN
    RAISE EXCEPTION 'private portal pages did not aggregate to their total';
  END IF;
  response := jsonb_build_object(
    'total', expected_total,
    'resources', portal_resources
  );

  IF NOT EXISTS (
      SELECT 1 FROM jsonb_array_elements(response -> 'resources') AS item(value)
      WHERE item.value ->> 'id' = all_resource_id::TEXT
    )
    OR NOT EXISTS (
      SELECT 1 FROM jsonb_array_elements(response -> 'resources') AS item(value)
      WHERE item.value ->> 'id' = selected_a_resource_id::TEXT
    )
    OR EXISTS (
      SELECT 1 FROM jsonb_array_elements(response -> 'resources') AS item(value)
      WHERE item.value ->> 'id' IN (
        selected_a2_resource_id::TEXT,
        draft_resource_id::TEXT,
        archived_resource_id::TEXT
      )
    )
    OR EXISTS (
      SELECT 1
      FROM jsonb_array_elements(response -> 'resources') AS item(value)
      WHERE item.value ->> 'type' = 'article'
        AND NOT COALESCE(
          public.guest_resource_content_has_meaningful_text(
            item.value ->> 'content'
          ),
          false
        )
    )
  THEN
    RAISE EXCEPTION 'private portal visibility did not fail closed';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM jsonb_array_elements(response -> 'resources') AS item(value)
    CROSS JOIN LATERAL jsonb_object_keys(item.value) AS field(key)
    WHERE field.key NOT IN (
      'id', 'title', 'description', 'content', 'category', 'type',
      'url', 'file_url', 'featured', 'display_order', 'published_at',
      'updated_at'
    )
  ) THEN
    RAISE EXCEPTION 'portal response exposed a management-only field';
  END IF;

  expected_total := NULL;
  portal_resources := '[]'::JSONB;
  page_offset := 0;
  LOOP
    response := public.portal_guest_resources_for_client_v1(
      default_client_id,
      session_default,
      NULL,
      NULL,
      false,
      100,
      page_offset
    );
    IF response ->> 'total' IS NULL THEN
      RAISE EXCEPTION 'default portal page omitted its total';
    END IF;
    IF expected_total IS NULL THEN
      expected_total := (response ->> 'total')::BIGINT;
      IF expected_total NOT BETWEEN 0 AND 1000 THEN
        RAISE EXCEPTION 'default portal reported an invalid total';
      END IF;
    ELSIF (response ->> 'total')::BIGINT <> expected_total THEN
      RAISE EXCEPTION 'default portal total changed during pagination';
    END IF;

    IF jsonb_typeof(response -> 'resources') <> 'array' THEN
      RAISE EXCEPTION 'default portal page resources were malformed';
    END IF;
    page_count := jsonb_array_length(response -> 'resources');
    portal_resources := portal_resources || (response -> 'resources');
    EXIT WHEN page_offset + page_count >= expected_total;
    IF page_count = 0 THEN
      RAISE EXCEPTION 'default portal pagination stopped before its total';
    END IF;
    page_offset := page_offset + page_count;
  END LOOP;
  IF jsonb_array_length(portal_resources) <> expected_total THEN
    RAISE EXCEPTION 'default portal pages did not aggregate to their total';
  END IF;
  response := jsonb_build_object(
    'total', expected_total,
    'resources', portal_resources
  );

  IF NOT EXISTS (
    SELECT 1 FROM jsonb_array_elements(response -> 'resources') AS item(value)
    WHERE item.value ->> 'id' = template_id::TEXT
  ) OR EXISTS (
    SELECT 1
    FROM jsonb_array_elements(response -> 'resources') AS item(value)
    WHERE item.value ->> 'type' = 'article'
      AND NOT COALESCE(
        public.guest_resource_content_has_meaningful_text(
          item.value ->> 'content'
        ),
        false
      )
  ) THEN
    RAISE EXCEPTION 'default-workspace portal did not use the global catalog';
  END IF;

  rejected := false;
  BEGIN
    PERFORM public.portal_guest_resources_for_client_v1(
      client_a_id,
      'sha256$' || repeat('Z', 43) || '=',
      NULL, NULL, false, 50, 0
    );
  EXCEPTION WHEN insufficient_privilege THEN
    rejected := true;
  END;
  IF NOT rejected THEN
    RAISE EXCEPTION 'portal accepted an unknown session verifier';
  END IF;

  DELETE FROM public.guest_resources WHERE id = template_id;
  IF EXISTS (
    SELECT 1
    FROM public.workspace_guest_resources
    WHERE id IN (source_clone_a_id, source_clone_b_id)
      AND (
        source_template_id IS NOT NULL
        OR title <> 'Behavior Source Template'
      )
  ) OR (
    SELECT count(*) FROM public.workspace_guest_resources
    WHERE id IN (source_clone_a_id, source_clone_b_id)
  ) <> 2 THEN
    RAISE EXCEPTION 'template deletion did not preserve independent snapshots';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.workspace_guest_resource_clients
    WHERE workspace_id = workspace_a_id
      AND resource_id = selected_a_resource_id
      AND client_id = client_a_id
  ) THEN
    RAISE EXCEPTION 'selected-client fixture assignment is missing';
  END IF;

  UPDATE public.clients
  SET workspace_id = workspace_b_id
  WHERE id = client_a_id;

  IF EXISTS (
    SELECT 1 FROM public.client_portal_credentials WHERE client_id = client_a_id
  ) OR EXISTS (
    SELECT 1 FROM public.client_portal_sessions WHERE client_id = client_a_id
  ) OR EXISTS (
    SELECT 1 FROM public.client_portal_tokens WHERE client_id = client_a_id
  ) OR EXISTS (
    SELECT 1 FROM public.workspace_guest_resource_clients
    WHERE client_id = client_a_id
  ) OR EXISTS (
    SELECT 1 FROM public.clients
    WHERE id = client_a_id
      AND (
        portal_access_enabled
        OR portal_password IS NOT NULL
        OR password_set_at IS NOT NULL
        OR password_set_by IS NOT NULL
        OR portal_last_login_at IS NOT NULL
        OR portal_invitation_sent_at IS NOT NULL
      )
  ) THEN
    RAISE EXCEPTION 'client workspace transfer retained portal or assignment state';
  END IF;

  rejected := false;
  BEGIN
    PERFORM public.portal_guest_resources_for_client_v1(
      client_a_id, session_a, NULL, NULL, false, 50, 0
    );
  EXCEPTION WHEN insufficient_privilege THEN
    rejected := true;
  END;
  IF NOT rejected THEN
    RAISE EXCEPTION 'pre-transfer portal session survived a workspace move';
  END IF;

  DELETE FROM public.clients WHERE id = client_a2_id;
  IF NOT EXISTS (
    SELECT 1 FROM public.workspace_guest_resources
    WHERE id = selected_a2_resource_id
      AND visibility = 'selected_clients'
  ) OR EXISTS (
    SELECT 1 FROM public.workspace_guest_resource_clients
    WHERE resource_id = selected_a2_resource_id
  ) THEN
    RAISE EXCEPTION 'client deletion did not leave selected visibility fail closed';
  END IF;

  IF (
    SELECT count(*) FROM public.workspace_audit_log
    WHERE workspace_id = workspace_a_id
      AND action = 'workspace.guest_resource.created'
      AND entity_id IN (
        all_resource_id,
        selected_a_resource_id,
        selected_a2_resource_id,
        draft_resource_id,
        archived_resource_id,
        delete_resource_id
      )
  ) <> 6 OR NOT EXISTS (
    SELECT 1 FROM public.workspace_audit_log
    WHERE workspace_id = workspace_a_id
      AND action = 'workspace.guest_resource.updated'
      AND entity_id = selected_a_resource_id
  ) OR NOT EXISTS (
    SELECT 1 FROM public.workspace_audit_log
    WHERE workspace_id = workspace_a_id
      AND action = 'workspace.guest_resource.deleted'
      AND entity_id = delete_resource_id
  ) OR NOT EXISTS (
    SELECT 1 FROM public.workspace_audit_log
    WHERE workspace_id = workspace_a_id
      AND action = 'workspace.guest_resources.templates_cloned'
  ) OR NOT EXISTS (
    SELECT 1 FROM public.workspace_audit_log
    WHERE workspace_id = workspace_b_id
      AND action = 'workspace.guest_resources.templates_cloned'
  ) THEN
    RAISE EXCEPTION 'guest resource mutations or clone batches were not audited';
  END IF;

  SELECT 1000 - count(*)::INTEGER INTO fill_count
  FROM public.workspace_guest_resources
  WHERE workspace_id = workspace_a_id;
  INSERT INTO public.workspace_guest_resources (
    workspace_id, title, description, content, category, type,
    featured, display_order, status, visibility, created_by, updated_by
  )
  SELECT
    workspace_a_id,
    'Behavior Private Count ' || quota_run || ' ' || series.value,
    'Private count quota filler',
    NULL,
    'templates',
    'article',
    false,
    999000,
    'draft',
    'all_clients',
    actor_id,
    actor_id
  FROM generate_series(1, fill_count) AS series(value);

  rejected := false;
  BEGIN
    INSERT INTO public.workspace_guest_resources (
      workspace_id, title, description, category, type, status, visibility
    ) VALUES (
      workspace_a_id, 'Behavior Private Count Overflow',
      'Must be rejected', 'templates', 'article', 'draft', 'all_clients'
    );
  EXCEPTION WHEN check_violation THEN
    rejected := true;
  END;
  IF NOT rejected THEN
    RAISE EXCEPTION 'private 1000-resource quota was not enforced';
  END IF;
  DELETE FROM public.workspace_guest_resources
  WHERE workspace_id = workspace_a_id
    AND title LIKE 'Behavior Private Count ' || quota_run || ' %';

  SELECT 1000 - count(*)::INTEGER INTO fill_count FROM public.guest_resources;
  INSERT INTO public.guest_resources (
    title, description, content, category, type, url, featured, display_order
  )
  SELECT
    'Behavior Global Count ' || quota_run || ' ' || series.value,
    'Global count quota filler',
    NULL,
    'templates',
    'link',
    'https://example.com/behavior-count',
    false,
    999000
  FROM generate_series(1, fill_count) AS series(value);

  rejected := false;
  BEGIN
    INSERT INTO public.guest_resources (
      title, description, content, category, type, url, featured, display_order
    ) VALUES (
      'Behavior Global Count Overflow', 'Must be rejected', NULL,
      'templates', 'link', 'https://example.com/behavior-count-overflow',
      false, 999000
    );
  EXCEPTION WHEN check_violation THEN
    rejected := true;
  END;
  IF NOT rejected THEN
    RAISE EXCEPTION 'global 1000-resource quota was not enforced';
  END IF;
  DELETE FROM public.guest_resources
  WHERE title LIKE 'Behavior Global Count ' || quota_run || ' %';

  SELECT COALESCE(sum(char_length(COALESCE(content, ''))), 0)::BIGINT
  INTO current_content
  FROM public.workspace_guest_resources
  WHERE workspace_id = workspace_a_id;
  remaining_content := 5000000 - current_content;
  quota_index := 0;
  WHILE remaining_content > 0 LOOP
    IF remaining_content > 100000
      AND remaining_content % 100000 BETWEEN 1 AND 6
    THEN
      content_chunk := 99993;
    ELSE
      content_chunk := LEAST(100000, remaining_content)::INTEGER;
    END IF;
    IF content_chunk < 7 THEN
      UPDATE public.workspace_guest_resources
      SET content = left(content, char_length(content) - 4)
        || repeat('x', content_chunk) || '</p>'
      WHERE id = all_resource_id;
      remaining_content := 0;
    ELSE
      quota_index := quota_index + 1;
      INSERT INTO public.workspace_guest_resources (
        workspace_id, title, description, content, category, type,
        featured, display_order, status, visibility, created_by, updated_by
      ) VALUES (
        workspace_a_id,
        'Behavior Private Content ' || quota_run || ' ' || quota_index,
        'Private content quota filler',
        '<p>' || repeat('x', content_chunk - 7) || '</p>',
        'templates', 'article', false, 999000, 'draft', 'all_clients',
        actor_id, actor_id
      );
      remaining_content := remaining_content - content_chunk;
    END IF;
  END LOOP;

  rejected := false;
  BEGIN
    UPDATE public.workspace_guest_resources
    SET content = left(content, char_length(content) - 4) || 'x</p>'
    WHERE id = all_resource_id;
  EXCEPTION WHEN check_violation THEN
    rejected := true;
  END;
  IF NOT rejected THEN
    RAISE EXCEPTION 'private 5000000-character quota was not enforced';
  END IF;
  DELETE FROM public.workspace_guest_resources
  WHERE workspace_id = workspace_a_id
    AND title LIKE 'Behavior Private Content ' || quota_run || ' %';

  SELECT COALESCE(sum(char_length(COALESCE(content, ''))), 0)::BIGINT
  INTO current_content
  FROM public.guest_resources;
  remaining_content := 5000000 - current_content;
  quota_index := 0;
  WHILE remaining_content > 0 LOOP
    IF remaining_content > 100000
      AND remaining_content % 100000 BETWEEN 1 AND 6
    THEN
      content_chunk := 99993;
    ELSE
      content_chunk := LEAST(100000, remaining_content)::INTEGER;
    END IF;
    IF content_chunk < 7 THEN
      SELECT resource.id INTO delete_resource_id
      FROM public.guest_resources AS resource
      WHERE resource.content IS NOT NULL
        AND char_length(resource.content) + content_chunk >= 8
        AND char_length(resource.content) + content_chunk <= 100000
      ORDER BY resource.id
      LIMIT 1;
      IF delete_resource_id IS NULL THEN
        RAISE EXCEPTION 'global content quota fixture cannot absorb remainder';
      END IF;
      UPDATE public.guest_resources
      SET content = '<p>'
        || repeat('x', char_length(content) + content_chunk - 7)
        || '</p>'
      WHERE id = delete_resource_id;
      remaining_content := 0;
    ELSE
      quota_index := quota_index + 1;
      INSERT INTO public.guest_resources (
        title, description, content, category, type, featured, display_order
      ) VALUES (
        'Behavior Global Content ' || quota_run || ' ' || quota_index,
        'Global content quota filler',
        CASE
          WHEN content_chunk = 7 THEN '<hr>xx>'
          ELSE '<p>' || repeat('x', content_chunk - 7) || '</p>'
        END,
        'templates', 'article', false, 999000
      );
      remaining_content := remaining_content - content_chunk;
    END IF;
  END LOOP;

  rejected := false;
  BEGIN
    INSERT INTO public.guest_resources (
      title, description, content, category, type, featured, display_order
    ) VALUES (
      'Behavior Global Content Overflow', 'Must be rejected', '<p>x</p>',
      'templates', 'article', false, 999000
    );
  EXCEPTION WHEN check_violation THEN
    rejected := true;
  END;
  IF NOT rejected THEN
    RAISE EXCEPTION 'global 5000000-character quota was not enforced';
  END IF;
  DELETE FROM public.guest_resources
  WHERE title LIKE 'Behavior Global Content ' || quota_run || ' %';

  IF EXISTS (
    SELECT 1
    FROM public.workspaces AS workspace
    JOIN public.workspace_guest_resource_quota_counters AS quota
      ON quota.workspace_id = workspace.id
    LEFT JOIN LATERAL (
      SELECT
        count(*)::INTEGER AS resource_count,
        COALESCE(sum(char_length(COALESCE(resource.content, ''))), 0)::BIGINT
          AS content_char_count
      FROM public.workspace_guest_resources AS resource
      WHERE resource.workspace_id = workspace.id
    ) AS private_total ON true
    WHERE workspace.id IN (
      default_workspace_id, workspace_a_id, workspace_b_id
    ) AND (
      quota.resource_count <> CASE WHEN workspace.is_default
        THEN (SELECT count(*)::INTEGER FROM public.guest_resources)
        ELSE private_total.resource_count
      END
      OR quota.content_char_count <> CASE WHEN workspace.is_default
        THEN (
          SELECT COALESCE(sum(char_length(COALESCE(content, ''))), 0)::BIGINT
          FROM public.guest_resources
        )
        ELSE private_total.content_char_count
      END
    )
  ) THEN
    RAISE EXCEPTION 'quota counters drifted during behavior verification';
  END IF;

  UPDATE public.workspace_memberships
  SET
    status = 'suspended',
    suspended_at = now(),
    suspended_by = actor_b_id
  WHERE workspace_id = workspace_b_id;
  UPDATE public.workspaces SET status = 'suspended' WHERE id = workspace_b_id;

  rejected := false;
  BEGIN
    PERFORM public.workspace_guest_resource_operation_v1(
      'list', workspace_b_id, NULL, '{}'::JSONB, actor_b_id, token_epoch
    );
  EXCEPTION WHEN insufficient_privilege THEN
    rejected := true;
  END;
  IF NOT rejected THEN
    RAISE EXCEPTION 'workspace action accepted an inactive workspace';
  END IF;
END;
$behavior_checks$;

ROLLBACK;
