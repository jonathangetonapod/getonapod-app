-- Let workspace managers approve submitted onboarding answers without creating
-- or editing a pitch profile. Explicit client-field mappings are still applied,
-- with the same portal-email safety guarantees as the original approval flow.

BEGIN;

DO $workspace_onboarding_answer_approval_prerequisites$
BEGIN
  IF to_regprocedure(
    'public.workspace_onboarding_actor_role_v1(uuid,uuid,bigint)'
  ) IS NULL
    OR to_regprocedure(
      'public.workspace_onboarding_instance_detail_json_v1(uuid)'
    ) IS NULL
    OR to_regclass('public.workspace_onboarding_instances') IS NULL
    OR to_regclass('public.workspace_onboarding_template_versions') IS NULL
    OR to_regclass('public.workspace_onboarding_answer_revisions') IS NULL
    OR to_regclass('public.workspace_onboarding_notifications') IS NULL
    OR to_regclass('public.workspace_audit_log') IS NULL
    OR to_regclass('public.clients') IS NULL
    OR to_regclass('public.client_portal_credentials') IS NULL
    OR to_regclass('public.client_portal_sessions') IS NULL
    OR to_regclass('public.client_portal_tokens') IS NULL
  THEN
    RAISE EXCEPTION
      'answer-only onboarding approval requires the workspace onboarding foundation';
  END IF;
END;
$workspace_onboarding_answer_approval_prerequisites$;

CREATE OR REPLACE FUNCTION public.workspace_onboarding_approve_answers_v1(
  p_workspace_id UUID,
  p_instance_id UUID,
  p_actor_user_id UUID,
  p_token_issued_at BIGINT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  actor_role TEXT;
  target_instance public.workspace_onboarding_instances%ROWTYPE;
  target_version public.workspace_onboarding_template_versions%ROWTYPE;
  submitted_answers JSONB;
  question_value JSONB;
  mapping_name TEXT;
  answer_value JSONB;
  mapped_name TEXT;
  mapped_email TEXT;
  mapped_contact_person TEXT;
  mapped_website TEXT;
  mapped_linkedin_url TEXT;
  mapped_calendar_link TEXT;
  mapped_bio TEXT;
  has_name BOOLEAN := false;
  has_email BOOLEAN := false;
  has_contact_person BOOLEAN := false;
  has_website BOOLEAN := false;
  has_linkedin_url BOOLEAN := false;
  has_calendar_link BOOLEAN := false;
  has_bio BOOLEAN := false;
  apply_email BOOLEAN := false;
BEGIN
  IF p_workspace_id IS NULL OR p_instance_id IS NULL THEN
    RAISE EXCEPTION 'invalid onboarding approval target'
      USING ERRCODE = '22023';
  END IF;

  actor_role := public.workspace_onboarding_actor_role_v1(
    p_workspace_id,
    p_actor_user_id,
    p_token_issued_at
  );
  IF actor_role NOT IN ('owner', 'admin', 'platform_admin') THEN
    RAISE EXCEPTION 'active workspace manager access is required'
      USING ERRCODE = '42501';
  END IF;

  PERFORM pg_advisory_xact_lock(
    hashtextextended('goap:workspace-onboarding-instance:' || p_instance_id::TEXT, 0)
  );

  SELECT instance.*
  INTO target_instance
  FROM public.workspace_onboarding_instances AS instance
  WHERE instance.id = p_instance_id
    AND instance.workspace_id = p_workspace_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'workspace onboarding instance not found'
      USING ERRCODE = 'P0002';
  END IF;
  IF target_instance.status <> 'submitted' OR target_instance.current_revision < 1 THEN
    RAISE EXCEPTION 'only the latest submitted onboarding can be approved'
      USING ERRCODE = '22023';
  END IF;

  SELECT version.*
  INTO target_version
  FROM public.workspace_onboarding_template_versions AS version
  WHERE version.id = target_instance.template_version_id
    AND version.workspace_id = p_workspace_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'workspace onboarding template version not found'
      USING ERRCODE = 'P0002';
  END IF;

  SELECT revision.answers
  INTO submitted_answers
  FROM public.workspace_onboarding_answer_revisions AS revision
  WHERE revision.instance_id = p_instance_id
    AND revision.workspace_id = p_workspace_id
    AND revision.revision = target_instance.current_revision;

  IF submitted_answers IS NULL THEN
    RAISE EXCEPTION 'submitted onboarding revision not found'
      USING ERRCODE = 'P0002';
  END IF;

  FOR question_value IN
    SELECT question.value
    FROM jsonb_array_elements(target_version.definition -> 'sections') AS section(value)
    CROSS JOIN LATERAL jsonb_array_elements(section.value -> 'questions') AS question(value)
  LOOP
    mapping_name := question_value ->> 'mapping';
    answer_value := submitted_answers -> (question_value ->> 'id');
    IF mapping_name IS NULL OR answer_value IS NULL OR answer_value = 'null'::JSONB THEN
      CONTINUE;
    END IF;

    IF mapping_name = 'client.name' AND jsonb_typeof(answer_value) = 'string' THEN
      mapped_name := btrim(answer_value #>> '{}');
      has_name := mapped_name <> '';
    ELSIF mapping_name = 'client.email' AND jsonb_typeof(answer_value) = 'string' THEN
      mapped_email := lower(btrim(answer_value #>> '{}'));
      has_email := mapped_email ~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$';
    ELSIF mapping_name = 'client.contact_person' AND jsonb_typeof(answer_value) = 'string' THEN
      mapped_contact_person := NULLIF(btrim(answer_value #>> '{}'), '');
      has_contact_person := true;
    ELSIF mapping_name = 'client.website' AND jsonb_typeof(answer_value) = 'string' THEN
      mapped_website := NULLIF(btrim(answer_value #>> '{}'), '');
      has_website := true;
    ELSIF mapping_name = 'client.linkedin_url' AND jsonb_typeof(answer_value) = 'string' THEN
      mapped_linkedin_url := NULLIF(btrim(answer_value #>> '{}'), '');
      has_linkedin_url := true;
    ELSIF mapping_name = 'client.calendar_link' AND jsonb_typeof(answer_value) = 'string' THEN
      mapped_calendar_link := NULLIF(btrim(answer_value #>> '{}'), '');
      has_calendar_link := true;
    ELSIF mapping_name = 'client.bio' AND jsonb_typeof(answer_value) = 'string' THEN
      mapped_bio := NULLIF(btrim(answer_value #>> '{}'), '');
      has_bio := true;
    END IF;
  END LOOP;

  -- Avoid the portal credential lifecycle trigger unless the mapped address is
  -- unchanged or the client has no portal authentication state to invalidate.
  SELECT has_email AND (
    lower(btrim(COALESCE(client.email, ''))) = mapped_email
    OR (
      NOT COALESCE(client.portal_access_enabled, false)
      AND client.portal_password IS NULL
      AND NOT EXISTS (
        SELECT 1 FROM public.client_portal_credentials AS credential
        WHERE credential.client_id = client.id
      )
      AND NOT EXISTS (
        SELECT 1 FROM public.client_portal_sessions AS session
        WHERE session.client_id = client.id
      )
      AND NOT EXISTS (
        SELECT 1 FROM public.client_portal_tokens AS token
        WHERE token.client_id = client.id
      )
    )
  )
  INTO apply_email
  FROM public.clients AS client
  WHERE client.id = target_instance.client_id
    AND client.workspace_id = p_workspace_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'workspace client not found' USING ERRCODE = 'P0002';
  END IF;

  UPDATE public.clients
  SET
    name = CASE WHEN has_name THEN mapped_name ELSE name END,
    email = CASE WHEN apply_email THEN mapped_email ELSE email END,
    contact_person = CASE WHEN has_contact_person THEN mapped_contact_person ELSE contact_person END,
    website = CASE WHEN has_website THEN mapped_website ELSE website END,
    linkedin_url = CASE WHEN has_linkedin_url THEN mapped_linkedin_url ELSE linkedin_url END,
    calendar_link = CASE WHEN has_calendar_link THEN mapped_calendar_link ELSE calendar_link END,
    bio = CASE WHEN has_bio THEN mapped_bio ELSE bio END
  WHERE id = target_instance.client_id
    AND workspace_id = p_workspace_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'workspace client not found' USING ERRCODE = 'P0002';
  END IF;

  UPDATE public.workspace_onboarding_instances
  SET
    status = 'approved',
    approved_at = now(),
    approved_by = p_actor_user_id
  WHERE id = p_instance_id
    AND workspace_id = p_workspace_id;

  UPDATE public.workspace_onboarding_notifications
  SET status = 'cancelled'
  WHERE instance_id = p_instance_id
    AND workspace_id = p_workspace_id
    AND status IN ('pending', 'processing', 'failed');

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
    'workspace.onboarding.approved',
    'workspace_onboarding_instance',
    p_instance_id,
    jsonb_build_object(
      'client_id', target_instance.client_id,
      'revision', target_instance.current_revision,
      'mapped_name', has_name,
      'mapped_email', apply_email,
      'mapped_contact_person', has_contact_person,
      'mapped_website', has_website,
      'mapped_linkedin_url', has_linkedin_url,
      'mapped_calendar_link', has_calendar_link,
      'mapped_bio', has_bio,
      'email_mapping_requested', has_email,
      'email_mapping_skipped_for_portal_safety', has_email AND NOT apply_email,
      'portal_access_changed', false,
      'profile_created', false,
      'approval_mode', 'answers_only'
    )
  );

  RETURN public.workspace_onboarding_instance_detail_json_v1(p_instance_id);
END;
$$;

REVOKE ALL ON FUNCTION public.workspace_onboarding_approve_answers_v1(
  UUID, UUID, UUID, BIGINT
) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.workspace_onboarding_approve_answers_v1(
  UUID, UUID, UUID, BIGINT
) TO service_role;

COMMENT ON FUNCTION public.workspace_onboarding_approve_answers_v1(
  UUID, UUID, UUID, BIGINT
) IS
  'Approves submitted onboarding answers and applies safe client mappings without creating a pitch profile.';

COMMIT;
