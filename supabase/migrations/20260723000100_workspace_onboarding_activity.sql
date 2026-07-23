-- Record the first real client form view separately from the first saved edit.
-- Metadata-only link unfurls do not call this activity function.

BEGIN;

DO $workspace_onboarding_activity_prerequisites$
BEGIN
  IF to_regclass('public.workspace_onboarding_instances') IS NULL
    OR to_regprocedure(
      'public.workspace_onboarding_instance_summary_json_v1(uuid)'
    ) IS NULL
  THEN
    RAISE EXCEPTION
      'workspace onboarding activity tracking requires the workspace onboarding foundation';
  END IF;
END;
$workspace_onboarding_activity_prerequisites$;

ALTER TABLE public.workspace_onboarding_instances
  ADD COLUMN viewed_at TIMESTAMPTZ;

CREATE OR REPLACE FUNCTION public.mark_workspace_onboarding_viewed_v1(
  p_instance_id UUID,
  p_capability_hash TEXT
)
RETURNS TIMESTAMPTZ
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  first_viewed_at TIMESTAMPTZ;
BEGIN
  UPDATE public.workspace_onboarding_instances AS instance
  SET viewed_at = now()
  WHERE instance.id = p_instance_id
    AND instance.capability_hash = lower(p_capability_hash)
    AND instance.viewed_at IS NULL
  RETURNING instance.viewed_at INTO first_viewed_at;

  IF FOUND THEN
    RETURN first_viewed_at;
  END IF;

  SELECT instance.viewed_at
  INTO first_viewed_at
  FROM public.workspace_onboarding_instances AS instance
  WHERE instance.id = p_instance_id
    AND instance.capability_hash = lower(p_capability_hash);

  IF NOT FOUND THEN
    RAISE EXCEPTION 'onboarding capability not found'
      USING ERRCODE = 'P0002';
  END IF;

  RETURN first_viewed_at;
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
    'viewed_at', instance.viewed_at,
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

REVOKE ALL ON FUNCTION public.mark_workspace_onboarding_viewed_v1(UUID, TEXT)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.mark_workspace_onboarding_viewed_v1(UUID, TEXT)
  TO service_role;
REVOKE ALL ON FUNCTION public.workspace_onboarding_instance_summary_json_v1(UUID)
  FROM PUBLIC, anon, authenticated;

COMMENT ON COLUMN public.workspace_onboarding_instances.viewed_at IS
  'First successful public client form load; metadata-only link previews are excluded.';
COMMENT ON FUNCTION public.mark_workspace_onboarding_viewed_v1(UUID, TEXT) IS
  'Records the first real client form view after capability verification.';

COMMIT;
