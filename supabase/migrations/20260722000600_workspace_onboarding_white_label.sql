-- White-label, per-client onboarding presentation and explicit removal of
-- automated reminder delivery. Published question definitions remain immutable.

BEGIN;

DO $workspace_onboarding_white_label_prerequisites$
BEGIN
  IF to_regclass('public.workspace_onboarding_instances') IS NULL
    OR to_regclass('public.workspace_onboarding_templates') IS NULL
    OR to_regprocedure(
      'public.workspace_onboarding_start_v1(uuid,uuid,uuid,jsonb,uuid,bigint)'
    ) IS NULL
  THEN
    RAISE EXCEPTION
      'workspace onboarding white-labeling requires the workspace onboarding foundation';
  END IF;
END;
$workspace_onboarding_white_label_prerequisites$;

ALTER TABLE public.workspace_onboarding_instances
  ADD COLUMN experience_title TEXT NOT NULL DEFAULT 'Welcome',
  ADD COLUMN experience_body TEXT NOT NULL DEFAULT 'Please complete this secure onboarding form.',
  ADD COLUMN experience_completion_message TEXT NOT NULL DEFAULT 'Thank you. Our team will review your answers and follow up.',
  ADD COLUMN accent_color TEXT NOT NULL DEFAULT '#665CF2',
  ADD COLUMN experience_logo_path TEXT;

UPDATE public.workspace_onboarding_instances AS instance
SET
  experience_title = COALESCE(
    NULLIF(btrim(version.definition ->> 'intro_title'), ''),
    instance.experience_title
  ),
  experience_body = COALESCE(
    NULLIF(btrim(version.definition ->> 'intro_body'), ''),
    instance.experience_body
  ),
  experience_completion_message = COALESCE(
    NULLIF(btrim(version.definition ->> 'completion_message'), ''),
    instance.experience_completion_message
  )
FROM public.workspace_onboarding_template_versions AS version
WHERE version.id = instance.template_version_id
  AND version.workspace_id = instance.workspace_id;

ALTER TABLE public.workspace_onboarding_instances
  ADD CONSTRAINT workspace_onboarding_instances_experience_title_check CHECK (
    char_length(btrim(experience_title)) BETWEEN 1 AND 300
  ),
  ADD CONSTRAINT workspace_onboarding_instances_experience_body_check CHECK (
    char_length(btrim(experience_body)) BETWEEN 1 AND 3000
  ),
  ADD CONSTRAINT workspace_onboarding_instances_experience_completion_check CHECK (
    char_length(btrim(experience_completion_message)) BETWEEN 1 AND 2000
  ),
  ADD CONSTRAINT workspace_onboarding_instances_accent_color_check CHECK (
    accent_color ~ '^#[0-9A-F]{6}$'
  ),
  ADD CONSTRAINT workspace_onboarding_instances_experience_logo_check CHECK (
    experience_logo_path IS NULL
    OR experience_logo_path ~ (
      '^' || workspace_id::TEXT || '/' || id::TEXT ||
      '/brand-[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\.(png|jpg|webp)$'
    )
  );

UPDATE public.workspace_onboarding_templates
SET
  reminder_days = ARRAY[]::SMALLINT[],
  updated_at = now()
WHERE cardinality(reminder_days) <> 0;

ALTER TABLE public.workspace_onboarding_templates
  ALTER COLUMN reminder_days SET DEFAULT ARRAY[]::SMALLINT[],
  ADD CONSTRAINT workspace_onboarding_templates_reminders_disabled_check CHECK (
    cardinality(reminder_days) = 0
  );

DELETE FROM public.workspace_onboarding_notifications
WHERE kind = 'reminder';

ALTER TABLE public.workspace_onboarding_notifications
  DROP CONSTRAINT workspace_onboarding_notifications_kind_check,
  ADD CONSTRAINT workspace_onboarding_notifications_kind_check CHECK (
    kind IN ('invitation', 'changes_requested')
  );

DROP INDEX IF EXISTS public.workspace_onboarding_notifications_processing_idx;
DROP FUNCTION IF EXISTS public.claim_workspace_onboarding_reminders_v1(INTEGER);
DROP FUNCTION IF EXISTS public.complete_workspace_onboarding_notification_v1(
  UUID, TEXT, TEXT, TEXT
);

CREATE OR REPLACE FUNCTION public.seed_workspace_onboarding_template_v1(
  p_workspace_id UUID,
  p_actor_user_id UUID
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  target_template_id UUID;
  target_definition JSONB := public.workspace_onboarding_default_definition_v1();
BEGIN
  PERFORM 1
  FROM public.workspaces AS workspace
  WHERE workspace.id = p_workspace_id
    AND NOT workspace.is_default;

  IF NOT FOUND THEN
    RETURN NULL;
  END IF;

  SELECT template.id
  INTO target_template_id
  FROM public.workspace_onboarding_templates AS template
  WHERE template.workspace_id = p_workspace_id
    AND lower(btrim(template.name)) = 'podcast guest onboarding'
    AND template.status <> 'archived'
  ORDER BY template.created_at, template.id
  LIMIT 1;

  IF FOUND THEN
    RETURN target_template_id;
  END IF;

  INSERT INTO public.workspace_onboarding_templates (
    workspace_id,
    name,
    description,
    status,
    draft_definition,
    reminder_days,
    published_version,
    is_default,
    created_by,
    updated_by
  )
  VALUES (
    p_workspace_id,
    'Podcast Guest Onboarding',
    'A complete intake for podcast positioning, stories, topics, audience, and media assets.',
    'published',
    target_definition,
    ARRAY[]::SMALLINT[],
    1,
    true,
    p_actor_user_id,
    p_actor_user_id
  )
  RETURNING id INTO target_template_id;

  INSERT INTO public.workspace_onboarding_template_versions (
    workspace_id,
    template_id,
    version,
    definition,
    published_by
  )
  VALUES (
    p_workspace_id,
    target_template_id,
    1,
    target_definition,
    p_actor_user_id
  );

  RETURN target_template_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.workspace_onboarding_instance_summary_json_v1(
  p_instance_id UUID
)
RETURNS JSONB
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT jsonb_build_object(
    'id', instance.id,
    'workspace_id', instance.workspace_id,
    'client_id', instance.client_id,
    'template_version_id', instance.template_version_id,
    'template_id', version.template_id,
    'template_name', template.name,
    'template_version', version.version,
    'client_name', client.name,
    'recipient_name', instance.recipient_name,
    'recipient_email', instance.recipient_email,
    'status', public.workspace_onboarding_effective_status_v1(
      instance.status,
      instance.capability_expires_at
    ),
    'capability_generation', instance.capability_generation,
    'capability_expires_at', instance.capability_expires_at,
    'current_revision', instance.current_revision,
    'created_at', instance.created_at,
    'updated_at', instance.updated_at,
    'invited_at', instance.invited_at,
    'started_at', instance.started_at,
    'submitted_at', instance.submitted_at,
    'changes_requested_at', instance.changes_requested_at,
    'approved_at', instance.approved_at,
    'revoked_at', instance.revoked_at,
    'archived_at', instance.archived_at,
    'progress_section', COALESCE(draft.current_section, 0),
    'draft_lock_version', COALESCE(draft.lock_version, 0),
    'open_comment_count', (
      SELECT count(*)
      FROM public.workspace_onboarding_review_comments AS comment
      WHERE comment.instance_id = instance.id
        AND comment.status = 'open'
    ),
    'profile_status', profile.status,
    'experience_title', instance.experience_title,
    'experience_body', instance.experience_body,
    'experience_completion_message', instance.experience_completion_message,
    'accent_color', instance.accent_color,
    'experience_logo_path', instance.experience_logo_path
  )
  FROM public.workspace_onboarding_instances AS instance
  JOIN public.workspace_onboarding_template_versions AS version
    ON version.id = instance.template_version_id
    AND version.workspace_id = instance.workspace_id
  JOIN public.workspace_onboarding_templates AS template
    ON template.id = version.template_id
    AND template.workspace_id = instance.workspace_id
  JOIN public.clients AS client
    ON client.id = instance.client_id
    AND client.workspace_id = instance.workspace_id
  LEFT JOIN public.workspace_onboarding_drafts AS draft
    ON draft.instance_id = instance.id
  LEFT JOIN public.workspace_onboarding_profile_drafts AS profile
    ON profile.instance_id = instance.id
  WHERE instance.id = p_instance_id;
$$;

CREATE OR REPLACE FUNCTION public.workspace_onboarding_client_view_json_v1(
  p_instance_id UUID
)
RETURNS JSONB
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT jsonb_build_object(
    'id', instance.id,
    'workspace', jsonb_build_object(
      'name', workspace.name,
      'logo_path', workspace.logo_path,
      'logo_updated_at', workspace.logo_updated_at
    ),
    'recipient_name', instance.recipient_name,
    'status', public.workspace_onboarding_effective_status_v1(
      instance.status,
      instance.capability_expires_at
    ),
    'expires_at', instance.capability_expires_at,
    'current_revision', instance.current_revision,
    'definition', jsonb_set(
      jsonb_set(
        jsonb_set(
          version.definition,
          '{intro_title}',
          to_jsonb(instance.experience_title),
          true
        ),
        '{intro_body}',
        to_jsonb(instance.experience_body),
        true
      ),
      '{completion_message}',
      to_jsonb(instance.experience_completion_message),
      true
    ),
    'accent_color', instance.accent_color,
    'experience_logo_path', instance.experience_logo_path,
    'answers', COALESCE(draft.answers, '{}'::JSONB),
    'current_section', COALESCE(draft.current_section, 0),
    'lock_version', COALESCE(draft.lock_version, 0),
    'comments', COALESCE((
      SELECT jsonb_agg(
        jsonb_build_object(
          'id', comment.id,
          'revision', comment.revision,
          'question_id', comment.question_id,
          'body', comment.body,
          'created_at', comment.created_at
        ) ORDER BY comment.created_at, comment.id
      )
      FROM public.workspace_onboarding_review_comments AS comment
      WHERE comment.instance_id = instance.id
        AND comment.status = 'open'
    ), '[]'::JSONB),
    'assets', COALESCE((
      SELECT jsonb_agg(
        jsonb_build_object(
          'id', asset.id,
          'question_id', asset.question_id,
          'original_name', asset.original_name,
          'mime_type', asset.mime_type,
          'byte_size', asset.byte_size,
          'uploaded_at', asset.uploaded_at
        ) ORDER BY asset.uploaded_at, asset.id
      )
      FROM public.workspace_onboarding_assets AS asset
      WHERE asset.instance_id = instance.id
        AND asset.deleted_at IS NULL
    ), '[]'::JSONB)
  )
  FROM public.workspace_onboarding_instances AS instance
  JOIN public.workspaces AS workspace
    ON workspace.id = instance.workspace_id
  JOIN public.workspace_onboarding_template_versions AS version
    ON version.id = instance.template_version_id
    AND version.workspace_id = instance.workspace_id
  LEFT JOIN public.workspace_onboarding_drafts AS draft
    ON draft.instance_id = instance.id
  WHERE instance.id = p_instance_id;
$$;

ALTER FUNCTION public.workspace_onboarding_start_v1(
  UUID, UUID, UUID, JSONB, UUID, BIGINT
) RENAME TO workspace_onboarding_start_base_v1;

REVOKE ALL ON FUNCTION public.workspace_onboarding_start_base_v1(
  UUID, UUID, UUID, JSONB, UUID, BIGINT
) FROM PUBLIC, anon, authenticated, service_role;

CREATE FUNCTION public.workspace_onboarding_start_v1(
  p_workspace_id UUID,
  p_template_id UUID,
  p_client_id UUID,
  p_payload JSONB,
  p_actor_user_id UUID,
  p_token_issued_at BIGINT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  experience JSONB := COALESCE(p_payload -> 'experience', '{}'::JSONB);
  target_definition JSONB;
  target_instance_id UUID;
  intro_title TEXT;
  intro_body TEXT;
  completion_message TEXT;
  accent TEXT;
  logo_path TEXT;
  base_result JSONB;
  result JSONB;
BEGIN
  IF jsonb_typeof(experience) <> 'object'
    OR EXISTS (
      SELECT 1
      FROM jsonb_object_keys(experience) AS field(key)
      WHERE field.key NOT IN (
        'intro_title',
        'intro_body',
        'completion_message',
        'accent_color',
        'logo_path'
      )
    )
  THEN
    RAISE EXCEPTION 'invalid onboarding client experience'
      USING ERRCODE = '22023';
  END IF;

  IF (experience ? 'intro_title' AND jsonb_typeof(experience -> 'intro_title') <> 'string')
    OR (experience ? 'intro_body' AND jsonb_typeof(experience -> 'intro_body') <> 'string')
    OR (experience ? 'completion_message' AND jsonb_typeof(experience -> 'completion_message') <> 'string')
    OR (experience ? 'accent_color' AND jsonb_typeof(experience -> 'accent_color') <> 'string')
    OR (
      experience ? 'logo_path'
      AND jsonb_typeof(experience -> 'logo_path') NOT IN ('string', 'null')
    )
  THEN
    RAISE EXCEPTION 'invalid onboarding client experience values'
      USING ERRCODE = '22023';
  END IF;

  base_result := public.workspace_onboarding_start_base_v1(
    p_workspace_id,
    p_template_id,
    p_client_id,
    p_payload - 'experience',
    p_actor_user_id,
    p_token_issued_at
  );
  target_instance_id := (base_result ->> 'id')::UUID;

  SELECT version.definition
  INTO target_definition
  FROM public.workspace_onboarding_instances AS instance
  JOIN public.workspace_onboarding_template_versions AS version
    ON version.id = instance.template_version_id
    AND version.workspace_id = instance.workspace_id
  WHERE instance.id = target_instance_id
    AND instance.workspace_id = p_workspace_id;

  intro_title := COALESCE(
    NULLIF(btrim(experience ->> 'intro_title'), ''),
    NULLIF(btrim(target_definition ->> 'intro_title'), ''),
    'Welcome'
  );
  intro_body := COALESCE(
    NULLIF(btrim(experience ->> 'intro_body'), ''),
    NULLIF(btrim(target_definition ->> 'intro_body'), ''),
    'Please complete this secure onboarding form.'
  );
  completion_message := COALESCE(
    NULLIF(btrim(experience ->> 'completion_message'), ''),
    NULLIF(btrim(target_definition ->> 'completion_message'), ''),
    'Thank you. Our team will review your answers and follow up.'
  );
  accent := upper(COALESCE(
    NULLIF(btrim(experience ->> 'accent_color'), ''),
    '#665CF2'
  ));
  logo_path := NULLIF(btrim(experience ->> 'logo_path'), '');

  IF char_length(intro_title) NOT BETWEEN 1 AND 300
    OR char_length(intro_body) NOT BETWEEN 1 AND 3000
    OR char_length(completion_message) NOT BETWEEN 1 AND 2000
    OR accent !~ '^#[0-9A-F]{6}$'
    OR (
      logo_path IS NOT NULL
      AND logo_path !~ (
        '^' || p_workspace_id::TEXT || '/' || target_instance_id::TEXT ||
        '/brand-[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\.(png|jpg|webp)$'
      )
    )
  THEN
    RAISE EXCEPTION 'invalid onboarding client experience values'
      USING ERRCODE = '22023';
  END IF;

  UPDATE public.workspace_onboarding_instances AS instance
  SET
    experience_title = intro_title,
    experience_body = intro_body,
    experience_completion_message = completion_message,
    accent_color = accent,
    experience_logo_path = logo_path
  WHERE instance.id = target_instance_id
    AND instance.workspace_id = p_workspace_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'workspace onboarding instance not found'
      USING ERRCODE = 'P0002';
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
    p_workspace_id,
    p_actor_user_id,
    'workspace.onboarding.experience_snapshotted',
    'workspace_onboarding_instance',
    target_instance_id,
    jsonb_build_object(
      'accent_color', accent,
      'has_client_logo', logo_path IS NOT NULL,
      'template_id', p_template_id
    )
  );

  result := public.workspace_onboarding_instance_detail_json_v1(target_instance_id)
    || jsonb_build_object(
      'client_created', COALESCE((base_result ->> 'client_created')::BOOLEAN, false)
    );
  RETURN result;
END;
$$;

REVOKE ALL ON FUNCTION public.workspace_onboarding_start_v1(
  UUID, UUID, UUID, JSONB, UUID, BIGINT
) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.workspace_onboarding_start_v1(
  UUID, UUID, UUID, JSONB, UUID, BIGINT
) TO service_role;

REVOKE ALL ON FUNCTION public.workspace_onboarding_instance_summary_json_v1(UUID)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.workspace_onboarding_client_view_json_v1(UUID)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.seed_workspace_onboarding_template_v1(UUID, UUID)
  FROM PUBLIC, anon, authenticated;

COMMENT ON COLUMN public.workspace_onboarding_instances.experience_title IS
  'Client-facing welcome title snapshotted for this invitation.';
COMMENT ON COLUMN public.workspace_onboarding_instances.experience_logo_path IS
  'Optional private onboarding logo override; null uses the workspace logo.';
COMMENT ON FUNCTION public.workspace_onboarding_start_v1(
  UUID, UUID, UUID, JSONB, UUID, BIGINT
) IS
  'Starts onboarding and snapshots a per-client white-label experience; no reminders are scheduled.';

COMMIT;
