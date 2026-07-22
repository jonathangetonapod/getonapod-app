-- Workspace-owned, capability-link client onboarding.
--
-- Staff access is resolved from the verified Auth identity and JWT issuance
-- epoch. Public intake access is scoped to one instance by a SHA-256 verifier;
-- raw capability tokens are never persisted. Submitted answers and published
-- template versions are immutable. Approval updates only explicitly mapped
-- client/profile fields and deliberately does not touch client portal access.

BEGIN;

SELECT pg_advisory_xact_lock(
  hashtextextended('goap:workspace-onboarding:v1', 0)
);

DO $workspace_onboarding_prerequisites$
BEGIN
  IF to_regprocedure(
    'public.workspace_staff_actor_role_v1(uuid,uuid,bigint,boolean)'
  ) IS NULL
    OR to_regclass('public.clients') IS NULL
    OR to_regclass('public.workspace_memberships') IS NULL
    OR to_regclass('public.workspace_audit_log') IS NULL
    OR to_regclass('public.client_portal_credentials') IS NULL
    OR to_regclass('public.client_portal_sessions') IS NULL
    OR to_regclass('public.client_portal_tokens') IS NULL
    OR to_regclass('storage.buckets') IS NULL
    OR to_regclass('storage.objects') IS NULL
    OR NOT EXISTS (
      SELECT 1
      FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name = 'clients'
        AND column_name = 'bio'
    )
    OR NOT EXISTS (
      SELECT 1
      FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name = 'workspaces'
        AND column_name = 'logo_path'
    )
    OR NOT EXISTS (
      SELECT 1
      FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name = 'workspaces'
        AND column_name = 'logo_updated_at'
    )
  THEN
    RAISE EXCEPTION
      'workspace onboarding requires the workspace, client portal, branding, audit, and Storage foundations';
  END IF;
END;
$workspace_onboarding_prerequisites$;

CREATE OR REPLACE FUNCTION public.workspace_onboarding_reminder_days_valid(
  p_days SMALLINT[]
)
RETURNS BOOLEAN
LANGUAGE plpgsql
IMMUTABLE
STRICT
SET search_path = ''
AS $$
DECLARE
  candidate SMALLINT;
BEGIN
  IF cardinality(p_days) > 10
    OR cardinality(p_days) <> cardinality(ARRAY(SELECT DISTINCT unnest(p_days)))
  THEN
    RETURN false;
  END IF;

  FOREACH candidate IN ARRAY p_days LOOP
    IF candidate < 1 OR candidate > 89 THEN
      RETURN false;
    END IF;
  END LOOP;
  RETURN true;
END;
$$;

CREATE TABLE public.workspace_onboarding_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'draft',
  draft_definition JSONB NOT NULL,
  reminder_days SMALLINT[] NOT NULL DEFAULT ARRAY[3, 7, 12]::SMALLINT[],
  published_version INTEGER NOT NULL DEFAULT 0,
  is_default BOOLEAN NOT NULL DEFAULT false,
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  updated_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  archived_at TIMESTAMPTZ,
  CONSTRAINT workspace_onboarding_templates_name_check CHECK (
    char_length(btrim(name)) BETWEEN 1 AND 120
  ),
  CONSTRAINT workspace_onboarding_templates_description_check CHECK (
    char_length(description) <= 1000
  ),
  CONSTRAINT workspace_onboarding_templates_status_check CHECK (
    status IN ('draft', 'published', 'archived')
  ),
  CONSTRAINT workspace_onboarding_templates_definition_check CHECK (
    jsonb_typeof(draft_definition) = 'object'
    AND octet_length(draft_definition::TEXT) <= 524288
  ),
  CONSTRAINT workspace_onboarding_templates_reminders_check CHECK (
    public.workspace_onboarding_reminder_days_valid(reminder_days)
  ),
  CONSTRAINT workspace_onboarding_templates_version_check CHECK (
    published_version BETWEEN 0 AND 10000
  ),
  CONSTRAINT workspace_onboarding_templates_archive_check CHECK (
    (status = 'archived' AND archived_at IS NOT NULL AND NOT is_default)
    OR (status <> 'archived' AND archived_at IS NULL)
  ),
  CONSTRAINT workspace_onboarding_templates_default_check CHECK (
    NOT is_default OR (status = 'published' AND published_version > 0)
  )
);

CREATE UNIQUE INDEX workspace_onboarding_templates_name_idx
  ON public.workspace_onboarding_templates (workspace_id, lower(btrim(name)))
  WHERE status <> 'archived';
CREATE UNIQUE INDEX workspace_onboarding_templates_default_idx
  ON public.workspace_onboarding_templates (workspace_id)
  WHERE is_default;
CREATE INDEX workspace_onboarding_templates_workspace_idx
  ON public.workspace_onboarding_templates (workspace_id, status, updated_at DESC);

CREATE TABLE public.workspace_onboarding_template_versions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  template_id UUID NOT NULL REFERENCES public.workspace_onboarding_templates(id) ON DELETE RESTRICT,
  version INTEGER NOT NULL,
  definition JSONB NOT NULL,
  published_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  published_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT workspace_onboarding_template_versions_number_check CHECK (
    version BETWEEN 1 AND 10000
  ),
  CONSTRAINT workspace_onboarding_template_versions_definition_check CHECK (
    jsonb_typeof(definition) = 'object'
    AND octet_length(definition::TEXT) <= 524288
  ),
  CONSTRAINT workspace_onboarding_template_versions_unique UNIQUE (template_id, version),
  CONSTRAINT workspace_onboarding_template_versions_workspace_unique UNIQUE (workspace_id, id)
);

CREATE INDEX workspace_onboarding_template_versions_workspace_idx
  ON public.workspace_onboarding_template_versions (workspace_id, template_id, version DESC);

CREATE TABLE public.workspace_onboarding_instances (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  client_id UUID NOT NULL REFERENCES public.clients(id) ON DELETE RESTRICT,
  template_version_id UUID NOT NULL,
  recipient_name TEXT NOT NULL,
  recipient_email TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'invited',
  capability_generation INTEGER NOT NULL DEFAULT 1,
  capability_hash TEXT NOT NULL,
  capability_expires_at TIMESTAMPTZ NOT NULL,
  current_revision INTEGER NOT NULL DEFAULT 0,
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  invited_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  started_at TIMESTAMPTZ,
  submitted_at TIMESTAMPTZ,
  changes_requested_at TIMESTAMPTZ,
  approved_at TIMESTAMPTZ,
  approved_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  revoked_at TIMESTAMPTZ,
  revoked_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  archived_at TIMESTAMPTZ,
  CONSTRAINT workspace_onboarding_instances_template_version_fkey
    FOREIGN KEY (workspace_id, template_version_id)
    REFERENCES public.workspace_onboarding_template_versions(workspace_id, id)
    ON DELETE RESTRICT,
  CONSTRAINT workspace_onboarding_instances_recipient_name_check CHECK (
    char_length(btrim(recipient_name)) BETWEEN 1 AND 200
  ),
  CONSTRAINT workspace_onboarding_instances_recipient_email_check CHECK (
    recipient_email = lower(btrim(recipient_email))
    AND char_length(recipient_email) BETWEEN 3 AND 254
    AND recipient_email ~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'
  ),
  CONSTRAINT workspace_onboarding_instances_status_check CHECK (
    status IN ('invited', 'in_progress', 'submitted', 'changes_requested', 'approved', 'revoked')
  ),
  CONSTRAINT workspace_onboarding_instances_generation_check CHECK (
    capability_generation BETWEEN 1 AND 2147483646
  ),
  CONSTRAINT workspace_onboarding_instances_hash_check CHECK (
    capability_hash ~ '^[0-9a-f]{64}$'
  ),
  CONSTRAINT workspace_onboarding_instances_expiry_check CHECK (
    capability_expires_at > invited_at
  ),
  CONSTRAINT workspace_onboarding_instances_revision_check CHECK (
    current_revision BETWEEN 0 AND 10000
  )
);

CREATE INDEX workspace_onboarding_instances_workspace_status_idx
  ON public.workspace_onboarding_instances (workspace_id, status, updated_at DESC);
CREATE INDEX workspace_onboarding_instances_workspace_client_idx
  ON public.workspace_onboarding_instances (workspace_id, client_id, created_at DESC);
CREATE INDEX workspace_onboarding_instances_capability_idx
  ON public.workspace_onboarding_instances (id, capability_hash);
CREATE INDEX workspace_onboarding_instances_expiry_idx
  ON public.workspace_onboarding_instances (capability_expires_at)
  WHERE status IN ('invited', 'in_progress', 'changes_requested');

CREATE TABLE public.workspace_onboarding_assignments (
  workspace_id UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  instance_id UUID NOT NULL REFERENCES public.workspace_onboarding_instances(id) ON DELETE CASCADE,
  membership_id UUID NOT NULL REFERENCES public.workspace_memberships(id) ON DELETE CASCADE,
  assigned_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  assigned_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (instance_id, membership_id)
);

CREATE INDEX workspace_onboarding_assignments_membership_idx
  ON public.workspace_onboarding_assignments (workspace_id, membership_id, instance_id);

CREATE TABLE public.workspace_onboarding_drafts (
  instance_id UUID PRIMARY KEY REFERENCES public.workspace_onboarding_instances(id) ON DELETE CASCADE,
  workspace_id UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  answers JSONB NOT NULL DEFAULT '{}'::JSONB,
  current_section INTEGER NOT NULL DEFAULT 0,
  lock_version BIGINT NOT NULL DEFAULT 0,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT workspace_onboarding_drafts_answers_check CHECK (
    jsonb_typeof(answers) = 'object'
    AND octet_length(answers::TEXT) <= 1048576
  ),
  CONSTRAINT workspace_onboarding_drafts_section_check CHECK (
    current_section BETWEEN 0 AND 11
  ),
  CONSTRAINT workspace_onboarding_drafts_lock_check CHECK (lock_version >= 0)
);

CREATE TABLE public.workspace_onboarding_answer_revisions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  instance_id UUID NOT NULL REFERENCES public.workspace_onboarding_instances(id) ON DELETE CASCADE,
  revision INTEGER NOT NULL,
  answers JSONB NOT NULL,
  submitted_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT workspace_onboarding_answer_revisions_revision_check CHECK (
    revision BETWEEN 1 AND 10000
  ),
  CONSTRAINT workspace_onboarding_answer_revisions_answers_check CHECK (
    jsonb_typeof(answers) = 'object'
    AND octet_length(answers::TEXT) <= 1048576
  ),
  CONSTRAINT workspace_onboarding_answer_revisions_unique UNIQUE (instance_id, revision)
);

CREATE INDEX workspace_onboarding_answer_revisions_workspace_idx
  ON public.workspace_onboarding_answer_revisions (workspace_id, instance_id, revision DESC);

CREATE TABLE public.workspace_onboarding_review_comments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  instance_id UUID NOT NULL REFERENCES public.workspace_onboarding_instances(id) ON DELETE CASCADE,
  revision INTEGER NOT NULL,
  question_id TEXT NOT NULL,
  body TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'open',
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  resolved_at TIMESTAMPTZ,
  CONSTRAINT workspace_onboarding_review_comments_revision_check CHECK (revision >= 1),
  CONSTRAINT workspace_onboarding_review_comments_question_check CHECK (
    question_id ~ '^[a-z][a-z0-9_-]{0,63}$'
  ),
  CONSTRAINT workspace_onboarding_review_comments_body_check CHECK (
    char_length(btrim(body)) BETWEEN 1 AND 2000
  ),
  CONSTRAINT workspace_onboarding_review_comments_status_check CHECK (
    status IN ('open', 'resolved')
  ),
  CONSTRAINT workspace_onboarding_review_comments_resolution_check CHECK (
    (status = 'open' AND resolved_at IS NULL)
    OR (status = 'resolved' AND resolved_at IS NOT NULL)
  )
);

CREATE INDEX workspace_onboarding_review_comments_instance_idx
  ON public.workspace_onboarding_review_comments (workspace_id, instance_id, status, created_at);

CREATE TABLE public.workspace_onboarding_profile_drafts (
  instance_id UUID PRIMARY KEY REFERENCES public.workspace_onboarding_instances(id) ON DELETE CASCADE,
  workspace_id UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  revision INTEGER NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  content JSONB NOT NULL DEFAULT '{}'::JSONB,
  generation_error TEXT,
  generated_at TIMESTAMPTZ,
  updated_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT workspace_onboarding_profile_drafts_revision_check CHECK (revision >= 1),
  CONSTRAINT workspace_onboarding_profile_drafts_status_check CHECK (
    status IN ('pending', 'generated', 'failed', 'edited', 'approved')
  ),
  CONSTRAINT workspace_onboarding_profile_drafts_content_check CHECK (
    jsonb_typeof(content) = 'object'
    AND octet_length(content::TEXT) <= 262144
  ),
  CONSTRAINT workspace_onboarding_profile_drafts_error_check CHECK (
    generation_error IS NULL OR char_length(generation_error) <= 500
  )
);

CREATE TABLE public.workspace_onboarding_assets (
  id UUID PRIMARY KEY,
  workspace_id UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  instance_id UUID NOT NULL REFERENCES public.workspace_onboarding_instances(id) ON DELETE CASCADE,
  question_id TEXT NOT NULL,
  storage_path TEXT NOT NULL UNIQUE,
  original_name TEXT NOT NULL,
  mime_type TEXT NOT NULL,
  byte_size BIGINT NOT NULL,
  uploaded_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at TIMESTAMPTZ,
  CONSTRAINT workspace_onboarding_assets_question_check CHECK (
    question_id ~ '^[a-z][a-z0-9_-]{0,63}$'
  ),
  CONSTRAINT workspace_onboarding_assets_path_check CHECK (
    storage_path = workspace_id::TEXT || '/' || instance_id::TEXT || '/' || id::TEXT ||
      CASE mime_type
        WHEN 'image/jpeg' THEN '.jpg'
        WHEN 'image/png' THEN '.png'
        WHEN 'image/webp' THEN '.webp'
        WHEN 'application/pdf' THEN '.pdf'
        ELSE '.invalid'
      END
  ),
  CONSTRAINT workspace_onboarding_assets_name_check CHECK (
    char_length(btrim(original_name)) BETWEEN 1 AND 255
  ),
  CONSTRAINT workspace_onboarding_assets_mime_check CHECK (
    mime_type IN ('image/jpeg', 'image/png', 'image/webp', 'application/pdf')
  ),
  CONSTRAINT workspace_onboarding_assets_size_check CHECK (
    byte_size BETWEEN 1 AND 10485760
    AND (mime_type = 'application/pdf' OR byte_size <= 5242880)
  )
);

CREATE INDEX workspace_onboarding_assets_instance_idx
  ON public.workspace_onboarding_assets (workspace_id, instance_id, question_id)
  WHERE deleted_at IS NULL;
CREATE UNIQUE INDEX workspace_onboarding_assets_active_question_idx
  ON public.workspace_onboarding_assets (instance_id, question_id)
  WHERE deleted_at IS NULL;

CREATE TABLE public.workspace_onboarding_notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  instance_id UUID NOT NULL REFERENCES public.workspace_onboarding_instances(id) ON DELETE CASCADE,
  kind TEXT NOT NULL,
  schedule_offset_days SMALLINT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  due_at TIMESTAMPTZ NOT NULL,
  next_attempt_at TIMESTAMPTZ NOT NULL,
  attempt_count SMALLINT NOT NULL DEFAULT 0,
  attempted_at TIMESTAMPTZ,
  sent_at TIMESTAMPTZ,
  provider_message_id TEXT,
  last_error TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT workspace_onboarding_notifications_kind_check CHECK (
    kind IN ('invitation', 'reminder', 'changes_requested')
  ),
  CONSTRAINT workspace_onboarding_notifications_offset_check CHECK (
    schedule_offset_days BETWEEN 0 AND 89
  ),
  CONSTRAINT workspace_onboarding_notifications_status_check CHECK (
    status IN ('pending', 'processing', 'sent', 'failed', 'skipped', 'cancelled')
  ),
  CONSTRAINT workspace_onboarding_notifications_attempt_check CHECK (
    attempt_count BETWEEN 0 AND 10
  ),
  CONSTRAINT workspace_onboarding_notifications_provider_check CHECK (
    provider_message_id IS NULL OR char_length(provider_message_id) <= 255
  ),
  CONSTRAINT workspace_onboarding_notifications_error_check CHECK (
    last_error IS NULL OR char_length(last_error) <= 500
  ),
  CONSTRAINT workspace_onboarding_notifications_unique UNIQUE (
    instance_id, kind, schedule_offset_days
  )
);

CREATE INDEX workspace_onboarding_notifications_due_idx
  ON public.workspace_onboarding_notifications (next_attempt_at, id)
  WHERE status IN ('pending', 'failed');
CREATE INDEX workspace_onboarding_notifications_processing_idx
  ON public.workspace_onboarding_notifications (attempted_at, id)
  WHERE status = 'processing' AND kind = 'reminder';

CREATE TABLE public.workspace_client_pitch_profiles (
  client_id UUID PRIMARY KEY REFERENCES public.clients(id) ON DELETE CASCADE,
  workspace_id UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  professional_bio TEXT NOT NULL DEFAULT '',
  positioning_summary TEXT NOT NULL DEFAULT '',
  expertise JSONB NOT NULL DEFAULT '[]'::JSONB,
  key_messages JSONB NOT NULL DEFAULT '[]'::JSONB,
  story_angles JSONB NOT NULL DEFAULT '[]'::JSONB,
  talking_points JSONB NOT NULL DEFAULT '[]'::JSONB,
  ideal_audience TEXT NOT NULL DEFAULT '',
  suggested_show_fit JSONB NOT NULL DEFAULT '[]'::JSONB,
  approved_onboarding_instance_id UUID REFERENCES public.workspace_onboarding_instances(id) ON DELETE SET NULL,
  approved_revision INTEGER,
  approved_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  approved_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT workspace_client_pitch_profiles_arrays_check CHECK (
    jsonb_typeof(expertise) = 'array'
    AND jsonb_typeof(key_messages) = 'array'
    AND jsonb_typeof(story_angles) = 'array'
    AND jsonb_typeof(talking_points) = 'array'
    AND jsonb_typeof(suggested_show_fit) = 'array'
  ),
  CONSTRAINT workspace_client_pitch_profiles_text_check CHECK (
    char_length(professional_bio) <= 20000
    AND char_length(positioning_summary) <= 10000
    AND char_length(ideal_audience) <= 10000
  ),
  CONSTRAINT workspace_client_pitch_profiles_revision_check CHECK (
    approved_revision IS NULL OR approved_revision >= 1
  )
);

CREATE INDEX workspace_client_pitch_profiles_workspace_idx
  ON public.workspace_client_pitch_profiles (workspace_id, updated_at DESC);

INSERT INTO storage.buckets (
  id,
  name,
  public,
  file_size_limit,
  allowed_mime_types
)
VALUES (
  'workspace-onboarding-assets',
  'workspace-onboarding-assets',
  false,
  10485760,
  ARRAY['image/jpeg', 'image/png', 'image/webp', 'application/pdf']
)
ON CONFLICT (id) DO UPDATE
SET
  name = EXCLUDED.name,
  public = EXCLUDED.public,
  file_size_limit = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types;

-- This bucket intentionally has no browser-facing Storage policy. Capability
-- and staff functions issue short-lived signed URLs only after authorization.
DROP POLICY IF EXISTS workspace_onboarding_assets_public_read ON storage.objects;
DROP POLICY IF EXISTS workspace_onboarding_assets_authenticated_read ON storage.objects;
DROP POLICY IF EXISTS workspace_onboarding_assets_authenticated_write ON storage.objects;

ALTER TABLE public.workspace_onboarding_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.workspace_onboarding_template_versions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.workspace_onboarding_instances ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.workspace_onboarding_assignments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.workspace_onboarding_drafts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.workspace_onboarding_answer_revisions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.workspace_onboarding_review_comments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.workspace_onboarding_profile_drafts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.workspace_onboarding_assets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.workspace_onboarding_notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.workspace_client_pitch_profiles ENABLE ROW LEVEL SECURITY;

REVOKE ALL PRIVILEGES ON TABLE public.workspace_onboarding_templates FROM PUBLIC, anon, authenticated;
REVOKE ALL PRIVILEGES ON TABLE public.workspace_onboarding_template_versions FROM PUBLIC, anon, authenticated;
REVOKE ALL PRIVILEGES ON TABLE public.workspace_onboarding_instances FROM PUBLIC, anon, authenticated;
REVOKE ALL PRIVILEGES ON TABLE public.workspace_onboarding_assignments FROM PUBLIC, anon, authenticated;
REVOKE ALL PRIVILEGES ON TABLE public.workspace_onboarding_drafts FROM PUBLIC, anon, authenticated;
REVOKE ALL PRIVILEGES ON TABLE public.workspace_onboarding_answer_revisions FROM PUBLIC, anon, authenticated;
REVOKE ALL PRIVILEGES ON TABLE public.workspace_onboarding_review_comments FROM PUBLIC, anon, authenticated;
REVOKE ALL PRIVILEGES ON TABLE public.workspace_onboarding_profile_drafts FROM PUBLIC, anon, authenticated;
REVOKE ALL PRIVILEGES ON TABLE public.workspace_onboarding_assets FROM PUBLIC, anon, authenticated;
REVOKE ALL PRIVILEGES ON TABLE public.workspace_onboarding_notifications FROM PUBLIC, anon, authenticated;
REVOKE ALL PRIVILEGES ON TABLE public.workspace_client_pitch_profiles FROM PUBLIC, anon, authenticated;

GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.workspace_onboarding_templates TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.workspace_onboarding_template_versions TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.workspace_onboarding_instances TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.workspace_onboarding_assignments TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.workspace_onboarding_drafts TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.workspace_onboarding_answer_revisions TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.workspace_onboarding_review_comments TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.workspace_onboarding_profile_drafts TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.workspace_onboarding_assets TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.workspace_onboarding_notifications TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.workspace_client_pitch_profiles TO service_role;

CREATE OR REPLACE FUNCTION public.touch_workspace_onboarding_row()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER workspace_onboarding_templates_touch
  BEFORE UPDATE ON public.workspace_onboarding_templates
  FOR EACH ROW EXECUTE FUNCTION public.touch_workspace_onboarding_row();
CREATE TRIGGER workspace_onboarding_instances_touch
  BEFORE UPDATE ON public.workspace_onboarding_instances
  FOR EACH ROW EXECUTE FUNCTION public.touch_workspace_onboarding_row();
CREATE TRIGGER workspace_onboarding_notifications_touch
  BEFORE UPDATE ON public.workspace_onboarding_notifications
  FOR EACH ROW EXECUTE FUNCTION public.touch_workspace_onboarding_row();
CREATE TRIGGER workspace_onboarding_profile_drafts_touch
  BEFORE UPDATE ON public.workspace_onboarding_profile_drafts
  FOR EACH ROW EXECUTE FUNCTION public.touch_workspace_onboarding_row();
CREATE TRIGGER workspace_client_pitch_profiles_touch
  BEFORE UPDATE ON public.workspace_client_pitch_profiles
  FOR EACH ROW EXECUTE FUNCTION public.touch_workspace_onboarding_row();

CREATE OR REPLACE FUNCTION public.prevent_workspace_onboarding_immutable_change()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF TG_OP = 'DELETE'
    AND TG_TABLE_NAME = 'workspace_onboarding_answer_revisions'
    AND COALESCE(current_setting('app.onboarding_pii_purge', true), '') = 'on'
  THEN
    RETURN OLD;
  END IF;
  RAISE EXCEPTION 'published onboarding records are immutable'
    USING ERRCODE = '42501';
END;
$$;

CREATE TRIGGER workspace_onboarding_template_versions_immutable
  BEFORE UPDATE OR DELETE ON public.workspace_onboarding_template_versions
  FOR EACH ROW EXECUTE FUNCTION public.prevent_workspace_onboarding_immutable_change();
CREATE TRIGGER workspace_onboarding_answer_revisions_immutable
  BEFORE UPDATE OR DELETE ON public.workspace_onboarding_answer_revisions
  FOR EACH ROW EXECUTE FUNCTION public.prevent_workspace_onboarding_immutable_change();

REVOKE ALL ON FUNCTION public.touch_workspace_onboarding_row() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.prevent_workspace_onboarding_immutable_change() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.workspace_onboarding_reminder_days_valid(SMALLINT[]) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.workspace_onboarding_default_definition_v1()
RETURNS JSONB
LANGUAGE sql
IMMUTABLE
SET search_path = ''
AS $$
  SELECT $definition$
  {
    "schema_version": 1,
    "intro_title": "Let’s build your podcast guest profile",
    "intro_body": "Share the experience, stories, and ideas that make you a compelling podcast guest. You can save your progress and return with this secure link.",
    "completion_message": "Thank you. Your agency will review your answers and follow up if anything needs clarification.",
    "sections": [
      {
        "id": "basics",
        "title": "Basic information",
        "description": "The details your agency will use to identify and contact you.",
        "questions": [
          {"id":"full_name","type":"short_text","label":"Full name","description":"Use the name you want podcast hosts to see.","required":true,"placeholder":"Jane Smith","mapping":"client.name"},
          {"id":"email","type":"email","label":"Email address","description":"For onboarding follow-up only.","required":true,"placeholder":"jane@example.com","mapping":"client.email"},
          {"id":"professional_title","type":"short_text","label":"Professional title","description":"Your current role or title.","required":true,"placeholder":"Founder and CEO","mapping":null},
          {"id":"company","type":"short_text","label":"Company or organization","description":"The organization you represent.","required":true,"placeholder":"Example Company","mapping":null},
          {"id":"website","type":"url","label":"Website","description":"Your primary professional website.","required":false,"placeholder":"https://example.com","mapping":"client.website"},
          {"id":"linkedin_url","type":"url","label":"LinkedIn profile","description":"Your public LinkedIn profile URL.","required":false,"placeholder":"https://www.linkedin.com/in/...","mapping":"client.linkedin_url"},
          {"id":"calendar_link","type":"url","label":"Scheduling link","description":"Optional link your agency can use to coordinate recordings.","required":false,"placeholder":"https://calendly.com/...","mapping":"client.calendar_link"},
          {"id":"headshot","type":"image_upload","label":"Professional headshot","description":"Upload a PNG, JPEG, or WebP image up to 5 MB.","required":false,"placeholder":"","mapping":null}
        ]
      },
      {
        "id": "professional_profile",
        "title": "Professional profile",
        "description": "Give hosts the context that establishes your authority.",
        "questions": [
          {"id":"current_bio","type":"long_text","label":"Current professional bio","description":"A rough bio is fine; your agency can refine it.","required":true,"placeholder":"Tell us about your background, role, and work...","mapping":"client.bio"},
          {"id":"expertise","type":"long_text","label":"Areas of expertise","description":"List the subjects where you have deep, practical knowledge.","required":true,"placeholder":"One topic per line works well.","mapping":null},
          {"id":"accomplishments","type":"long_text","label":"Notable accomplishments and proof points","description":"Include measurable results, credentials, awards, or milestones.","required":true,"placeholder":"What establishes your credibility?","mapping":null},
          {"id":"previous_media","type":"long_text","label":"Previous podcast or media appearances","description":"Include show names or links when available.","required":false,"placeholder":"Podcast names, episode links, interviews...","mapping":null}
        ]
      },
      {
        "id": "story",
        "title": "Your story",
        "description": "The strongest interviews are built around a memorable human story.",
        "questions": [
          {"id":"compelling_story","type":"long_text","label":"What is your most compelling story?","description":"Describe a turning point, challenge, discovery, or transformation.","required":true,"placeholder":"Set the scene, explain what changed, and share the result...","mapping":null},
          {"id":"unique_journey","type":"long_text","label":"What makes your journey unusual?","description":"Share the perspective or path that differentiates you from similar experts.","required":true,"placeholder":"What could only you talk about this way?","mapping":null},
          {"id":"personal_stories","type":"long_text","label":"Other personal stories you are comfortable sharing","description":"Optional anecdotes can help create more interview angles.","required":false,"placeholder":"Lessons, failures, surprises, or defining moments...","mapping":null}
        ]
      },
      {
        "id": "topics",
        "title": "Topics and talking points",
        "description": "Define the conversations where you can deliver the most value.",
        "questions": [
          {"id":"topics","type":"long_text","label":"Topics you can confidently discuss","description":"Be specific enough that a host can imagine the episode.","required":true,"placeholder":"One topic per line...","mapping":null},
          {"id":"passions","type":"long_text","label":"Ideas you are most passionate about","description":"What could you discuss for an hour without notes?","required":true,"placeholder":"Share the ideas that energize you...","mapping":null},
          {"id":"audience_value","type":"long_text","label":"What will listeners learn or be able to do?","description":"Focus on practical takeaways and changed perspectives.","required":true,"placeholder":"After listening, the audience will...","mapping":null},
          {"id":"hobbies","type":"long_text","label":"Personal interests or hobbies","description":"Optional details can reveal unexpected show fits and human angles.","required":false,"placeholder":"Interests outside your main work...","mapping":null}
        ]
      },
      {
        "id": "goals",
        "title": "Goals and audience",
        "description": "Help your agency target shows that support the right outcome.",
        "questions": [
          {"id":"goals","type":"multi_select","label":"Primary goals for podcast appearances","description":"Select every outcome that matters.","required":true,"placeholder":"","mapping":null,"options":[{"id":"authority","label":"Build authority"},{"id":"awareness","label":"Increase brand awareness"},{"id":"leads","label":"Generate qualified leads"},{"id":"book","label":"Promote a book or idea"},{"id":"network","label":"Build relationships"},{"id":"mission","label":"Advance a mission"}]},
          {"id":"ideal_audience","type":"long_text","label":"Who is your ideal audience?","description":"Describe roles, industries, stages, problems, or ambitions.","required":true,"placeholder":"The people who benefit most are...","mapping":null},
          {"id":"desired_impact","type":"long_text","label":"What impact do you want the interview to have?","description":"Describe what success looks like for you and the listener.","required":true,"placeholder":"A successful appearance would...","mapping":null},
          {"id":"target_shows","type":"long_text","label":"Dream shows or show styles","description":"Specific shows are welcome, but themes and formats are useful too.","required":false,"placeholder":"Shows, hosts, formats, or categories...","mapping":null},
          {"id":"specific_angles","type":"long_text","label":"Episode angles you would love to explore","description":"Draft headlines or provocative questions work well.","required":false,"placeholder":"Potential episode titles or angles...","mapping":null}
        ]
      },
      {
        "id": "final_details",
        "title": "Final details",
        "description": "A few practical details before your agency begins its review.",
        "questions": [
          {"id":"future_vision","type":"long_text","label":"What are you building toward?","description":"Share the future vision behind your work.","required":false,"placeholder":"Over the next few years...","mapping":null},
          {"id":"availability","type":"single_select","label":"Typical recording availability","description":"Choose the closest fit; details can be coordinated later.","required":true,"placeholder":"","mapping":null,"options":[{"id":"business_hours","label":"Weekday business hours"},{"id":"early_late","label":"Early mornings or evenings"},{"id":"flexible","label":"Flexible"},{"id":"coordinate","label":"Coordinate case by case"}]},
          {"id":"media_kit","type":"document_upload","label":"Media kit or supporting document","description":"Optional PDF up to 10 MB.","required":false,"placeholder":"","mapping":null},
          {"id":"additional","type":"long_text","label":"Anything else your agency should know?","description":"Add preferences, boundaries, context, or questions.","required":false,"placeholder":"Optional final notes...","mapping":null}
        ]
      }
    ]
  }
  $definition$::JSONB;
$$;

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
    ARRAY[3, 7, 12]::SMALLINT[],
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

CREATE OR REPLACE FUNCTION public.seed_workspace_onboarding_after_insert()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF NOT NEW.is_default THEN
    PERFORM public.seed_workspace_onboarding_template_v1(NEW.id, NEW.created_by);
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS workspaces_seed_onboarding_template ON public.workspaces;
CREATE TRIGGER workspaces_seed_onboarding_template
  AFTER INSERT ON public.workspaces
  FOR EACH ROW EXECUTE FUNCTION public.seed_workspace_onboarding_after_insert();

SELECT public.seed_workspace_onboarding_template_v1(workspace.id, workspace.created_by)
FROM public.workspaces AS workspace
WHERE NOT workspace.is_default;

REVOKE ALL ON FUNCTION public.workspace_onboarding_default_definition_v1() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.seed_workspace_onboarding_template_v1(UUID, UUID) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.seed_workspace_onboarding_after_insert() FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.workspace_onboarding_actor_role_v1(
  p_workspace_id UUID,
  p_actor_user_id UUID,
  p_token_issued_at BIGINT
)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  actor_email TEXT;
  actor_role TEXT;
BEGIN
  IF p_workspace_id IS NULL
    OR p_actor_user_id IS NULL
    OR p_token_issued_at IS NULL
    OR p_token_issued_at < 1
    OR p_token_issued_at > floor(EXTRACT(EPOCH FROM clock_timestamp()))::BIGINT + 300
  THEN
    RAISE EXCEPTION 'invalid workspace onboarding actor context'
      USING ERRCODE = '22023';
  END IF;

  SELECT lower(btrim(auth_user.email))
  INTO actor_email
  FROM auth.users AS auth_user
  WHERE auth_user.id = p_actor_user_id
    AND NULLIF(btrim(auth_user.email), '') IS NOT NULL;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'workspace onboarding actor identity is unavailable'
      USING ERRCODE = '42501';
  END IF;

  IF public.is_platform_admin_identity(p_actor_user_id, actor_email) THEN
    RETURN public.workspace_staff_actor_role_v1(
      p_workspace_id,
      p_actor_user_id,
      p_token_issued_at,
      true
    );
  END IF;

  SELECT membership.role
  INTO actor_role
  FROM public.workspace_memberships AS membership
  JOIN public.workspaces AS workspace
    ON workspace.id = membership.workspace_id
    AND workspace.status = 'active'
    AND NOT workspace.is_default
  JOIN auth.users AS auth_user
    ON auth_user.id = membership.user_id
    AND lower(btrim(auth_user.email)) = membership.email_normalized
  WHERE membership.workspace_id = p_workspace_id
    AND membership.user_id = p_actor_user_id
    AND membership.email_normalized = actor_email
    AND membership.status = 'active'
    AND membership.role IN ('owner', 'admin', 'member')
    AND p_token_issued_at >= membership.workspace_access_not_before_epoch
    AND p_token_issued_at >= workspace.access_not_before_epoch
    AND (
      membership.provisioning_method <> 'admin_temporary_password'
      OR (
        NOT membership.password_change_required
        AND auth_user.raw_app_meta_data ->> 'workspace_id' = p_workspace_id::TEXT
        AND auth_user.raw_app_meta_data ->> 'workspace_membership_id' = membership.id::TEXT
        AND auth_user.raw_app_meta_data ->> 'workspace_provisioning_method'
          = 'admin_temporary_password'
        AND auth_user.raw_app_meta_data ->> 'workspace_password_change_required' = 'false'
      )
    )
  FOR SHARE OF membership, workspace;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'active workspace staff access is required'
      USING ERRCODE = '42501';
  END IF;

  IF actor_role IN ('owner', 'admin') THEN
    RETURN public.workspace_staff_actor_role_v1(
      p_workspace_id,
      p_actor_user_id,
      p_token_issued_at,
      false
    );
  END IF;
  RETURN actor_role;
END;
$$;

CREATE OR REPLACE FUNCTION public.workspace_onboarding_effective_status_v1(
  p_status TEXT,
  p_capability_expires_at TIMESTAMPTZ
)
RETURNS TEXT
LANGUAGE sql
STABLE
SET search_path = ''
AS $$
  SELECT CASE
    WHEN p_status IN ('invited', 'in_progress', 'changes_requested')
      AND p_capability_expires_at <= now()
    THEN 'expired'
    ELSE p_status
  END;
$$;

CREATE OR REPLACE FUNCTION public.workspace_onboarding_template_json_v1(
  p_template_id UUID
)
RETURNS JSONB
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT jsonb_build_object(
    'id', template.id,
    'workspace_id', template.workspace_id,
    'name', template.name,
    'description', template.description,
    'status', template.status,
    'definition', template.draft_definition,
    'reminder_days', to_jsonb(template.reminder_days),
    'published_version', template.published_version,
    'is_default', template.is_default,
    'created_at', template.created_at,
    'updated_at', template.updated_at,
    'archived_at', template.archived_at
  )
  FROM public.workspace_onboarding_templates AS template
  WHERE template.id = p_template_id;
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
    'profile_status', profile.status
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

CREATE OR REPLACE FUNCTION public.workspace_onboarding_instance_detail_json_v1(
  p_instance_id UUID
)
RETURNS JSONB
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT public.workspace_onboarding_instance_summary_json_v1(instance.id)
    || jsonb_build_object(
      'definition', version.definition,
      'answers', COALESCE(draft.answers, '{}'::JSONB),
      'revisions', COALESCE((
        SELECT jsonb_agg(
          jsonb_build_object(
            'id', revision.id,
            'revision', revision.revision,
            'answers', revision.answers,
            'submitted_at', revision.submitted_at
          ) ORDER BY revision.revision
        )
        FROM public.workspace_onboarding_answer_revisions AS revision
        WHERE revision.instance_id = instance.id
      ), '[]'::JSONB),
      'comments', COALESCE((
        SELECT jsonb_agg(
          jsonb_build_object(
            'id', comment.id,
            'revision', comment.revision,
            'question_id', comment.question_id,
            'body', comment.body,
            'status', comment.status,
            'created_at', comment.created_at,
            'resolved_at', comment.resolved_at
          ) ORDER BY comment.created_at, comment.id
        )
        FROM public.workspace_onboarding_review_comments AS comment
        WHERE comment.instance_id = instance.id
      ), '[]'::JSONB),
      'profile', CASE WHEN profile.instance_id IS NULL THEN NULL ELSE jsonb_build_object(
        'revision', profile.revision,
        'status', profile.status,
        'content', profile.content,
        'generation_error', profile.generation_error,
        'generated_at', profile.generated_at,
        'updated_at', profile.updated_at
      ) END,
      'assets', COALESCE((
        SELECT jsonb_agg(
          jsonb_build_object(
            'id', asset.id,
            'question_id', asset.question_id,
            'storage_path', asset.storage_path,
            'original_name', asset.original_name,
            'mime_type', asset.mime_type,
            'byte_size', asset.byte_size,
            'uploaded_at', asset.uploaded_at
          ) ORDER BY asset.uploaded_at, asset.id
        )
        FROM public.workspace_onboarding_assets AS asset
        WHERE asset.instance_id = instance.id
          AND asset.deleted_at IS NULL
      ), '[]'::JSONB),
      'assigned_membership_ids', COALESCE((
        SELECT jsonb_agg(assignment.membership_id ORDER BY assignment.membership_id)
        FROM public.workspace_onboarding_assignments AS assignment
        WHERE assignment.instance_id = instance.id
      ), '[]'::JSONB)
    )
  FROM public.workspace_onboarding_instances AS instance
  JOIN public.workspace_onboarding_template_versions AS version
    ON version.id = instance.template_version_id
    AND version.workspace_id = instance.workspace_id
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
    'definition', version.definition,
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

REVOKE ALL ON FUNCTION public.workspace_onboarding_actor_role_v1(UUID, UUID, BIGINT) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.workspace_onboarding_effective_status_v1(TEXT, TIMESTAMPTZ) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.workspace_onboarding_template_json_v1(UUID) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.workspace_onboarding_instance_summary_json_v1(UUID) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.workspace_onboarding_instance_detail_json_v1(UUID) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.workspace_onboarding_client_view_json_v1(UUID) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.workspace_onboarding_staff_list_v1(
  p_workspace_id UUID,
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
  actor_membership_id UUID;
  result JSONB;
BEGIN
  actor_role := public.workspace_onboarding_actor_role_v1(
    p_workspace_id,
    p_actor_user_id,
    p_token_issued_at
  );

  IF actor_role = 'member' THEN
    SELECT membership.id
    INTO actor_membership_id
    FROM public.workspace_memberships AS membership
    WHERE membership.workspace_id = p_workspace_id
      AND membership.user_id = p_actor_user_id
      AND membership.status = 'active'
      AND membership.role = 'member';
  END IF;

  SELECT jsonb_build_object(
    'workspace', jsonb_build_object(
      'id', workspace.id,
      'name', workspace.name,
      'logo_path', workspace.logo_path,
      'logo_updated_at', workspace.logo_updated_at
    ),
    'viewer_role', actor_role,
    'can_manage', actor_role IN ('owner', 'admin', 'platform_admin'),
    'templates', CASE
      WHEN actor_role IN ('owner', 'admin', 'platform_admin') THEN COALESCE((
        SELECT jsonb_agg(
          public.workspace_onboarding_template_json_v1(template.id)
          ORDER BY template.is_default DESC, template.updated_at DESC, template.id
        )
        FROM public.workspace_onboarding_templates AS template
        WHERE template.workspace_id = p_workspace_id
      ), '[]'::JSONB)
      ELSE '[]'::JSONB
    END,
    'clients', CASE
      WHEN actor_role IN ('owner', 'admin', 'platform_admin') THEN COALESCE((
        SELECT jsonb_agg(
          jsonb_build_object(
            'id', client.id,
            'workspace_id', client.workspace_id,
            'name', client.name,
            'email', client.email,
            'contact_person', client.contact_person,
            'status', client.status
          ) ORDER BY client.name, client.id
        )
        FROM public.clients AS client
        WHERE client.workspace_id = p_workspace_id
      ), '[]'::JSONB)
      ELSE '[]'::JSONB
    END,
    'assignable_members', CASE
      WHEN actor_role IN ('owner', 'admin', 'platform_admin') THEN COALESCE((
        SELECT jsonb_agg(
          jsonb_build_object(
            'id', membership.id,
            'full_name', membership.full_name,
            'email', membership.email_normalized
          ) ORDER BY membership.full_name NULLS LAST, membership.email_normalized, membership.id
        )
        FROM public.workspace_memberships AS membership
        WHERE membership.workspace_id = p_workspace_id
          AND membership.status = 'active'
          AND membership.role = 'member'
      ), '[]'::JSONB)
      ELSE '[]'::JSONB
    END,
    'instances', COALESCE((
      SELECT jsonb_agg(
        public.workspace_onboarding_instance_summary_json_v1(instance.id)
        ORDER BY instance.updated_at DESC, instance.id
      )
      FROM public.workspace_onboarding_instances AS instance
      WHERE instance.workspace_id = p_workspace_id
        AND (
          actor_role IN ('owner', 'admin', 'platform_admin')
          OR EXISTS (
            SELECT 1
            FROM public.workspace_onboarding_assignments AS assignment
            WHERE assignment.instance_id = instance.id
              AND assignment.workspace_id = p_workspace_id
              AND assignment.membership_id = actor_membership_id
          )
        )
    ), '[]'::JSONB)
  )
  INTO result
  FROM public.workspaces AS workspace
  WHERE workspace.id = p_workspace_id
    AND workspace.status = 'active'
    AND NOT workspace.is_default;

  IF result IS NULL THEN
    RAISE EXCEPTION 'private workspace not found' USING ERRCODE = 'P0002';
  END IF;
  RETURN result;
END;
$$;

CREATE OR REPLACE FUNCTION public.workspace_onboarding_staff_detail_v1(
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
  actor_membership_id UUID;
  result JSONB;
BEGIN
  actor_role := public.workspace_onboarding_actor_role_v1(
    p_workspace_id,
    p_actor_user_id,
    p_token_issued_at
  );

  IF actor_role = 'member' THEN
    SELECT membership.id
    INTO actor_membership_id
    FROM public.workspace_memberships AS membership
    WHERE membership.workspace_id = p_workspace_id
      AND membership.user_id = p_actor_user_id
      AND membership.status = 'active'
      AND membership.role = 'member';
  END IF;

  SELECT public.workspace_onboarding_instance_detail_json_v1(instance.id)
  INTO result
  FROM public.workspace_onboarding_instances AS instance
  WHERE instance.id = p_instance_id
    AND instance.workspace_id = p_workspace_id
    AND (
      actor_role IN ('owner', 'admin', 'platform_admin')
      OR EXISTS (
        SELECT 1
        FROM public.workspace_onboarding_assignments AS assignment
        WHERE assignment.instance_id = instance.id
          AND assignment.workspace_id = p_workspace_id
          AND assignment.membership_id = actor_membership_id
      )
    );

  IF result IS NULL THEN
    RAISE EXCEPTION 'workspace onboarding instance not found'
      USING ERRCODE = 'P0002';
  END IF;
  RETURN result;
END;
$$;

REVOKE ALL ON FUNCTION public.workspace_onboarding_staff_list_v1(UUID, UUID, BIGINT)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.workspace_onboarding_staff_list_v1(UUID, UUID, BIGINT)
  TO service_role;
REVOKE ALL ON FUNCTION public.workspace_onboarding_staff_detail_v1(UUID, UUID, UUID, BIGINT)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.workspace_onboarding_staff_detail_v1(UUID, UUID, UUID, BIGINT)
  TO service_role;

CREATE OR REPLACE FUNCTION public.workspace_onboarding_template_operation_v1(
  p_action TEXT,
  p_workspace_id UUID,
  p_template_id UUID,
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
  normalized_action TEXT := lower(btrim(COALESCE(p_action, '')));
  actor_role TEXT;
  target_template public.workspace_onboarding_templates%ROWTYPE;
  normalized_name TEXT;
  normalized_description TEXT;
  normalized_definition JSONB;
  normalized_reminder_days SMALLINT[];
  make_default BOOLEAN;
  new_version INTEGER;
  result JSONB;
BEGIN
  IF normalized_action NOT IN ('create', 'update', 'publish', 'duplicate', 'set_default', 'archive')
    OR p_workspace_id IS NULL
    OR p_actor_user_id IS NULL
    OR p_payload IS NULL
    OR jsonb_typeof(p_payload) <> 'object'
  THEN
    RAISE EXCEPTION 'invalid workspace onboarding template operation'
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
    hashtextextended('goap:workspace-onboarding-template:' || p_workspace_id::TEXT, 0)
  );

  IF normalized_action = 'create' THEN
    IF p_template_id IS NOT NULL THEN
      RAISE EXCEPTION 'template_id must be empty for create'
        USING ERRCODE = '22023';
    END IF;
    normalized_name := btrim(COALESCE(p_payload ->> 'name', ''));
    normalized_description := btrim(COALESCE(p_payload ->> 'description', ''));
    normalized_definition := p_payload -> 'definition';
    SELECT COALESCE(array_agg(reminder.day::SMALLINT ORDER BY reminder.ordinality), ARRAY[]::SMALLINT[])
    INTO normalized_reminder_days
    FROM jsonb_array_elements_text(COALESCE(p_payload -> 'reminder_days', '[]'::JSONB))
      WITH ORDINALITY AS reminder(day, ordinality);

    IF char_length(normalized_name) NOT BETWEEN 1 AND 120
      OR char_length(normalized_description) > 1000
      OR jsonb_typeof(normalized_definition) <> 'object'
      OR octet_length(normalized_definition::TEXT) > 524288
      OR NOT public.workspace_onboarding_reminder_days_valid(normalized_reminder_days)
    THEN
      RAISE EXCEPTION 'invalid workspace onboarding template payload'
        USING ERRCODE = '22023';
    END IF;

    INSERT INTO public.workspace_onboarding_templates (
      workspace_id,
      name,
      description,
      draft_definition,
      reminder_days,
      created_by,
      updated_by
    )
    VALUES (
      p_workspace_id,
      normalized_name,
      normalized_description,
      normalized_definition,
      normalized_reminder_days,
      p_actor_user_id,
      p_actor_user_id
    )
    RETURNING * INTO target_template;

  ELSE
    IF p_template_id IS NULL THEN
      RAISE EXCEPTION 'template_id is required' USING ERRCODE = '22023';
    END IF;

    SELECT template.*
    INTO target_template
    FROM public.workspace_onboarding_templates AS template
    WHERE template.id = p_template_id
      AND template.workspace_id = p_workspace_id
    FOR UPDATE;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'workspace onboarding template not found'
        USING ERRCODE = 'P0002';
    END IF;

    IF normalized_action = 'update' THEN
      IF target_template.status = 'archived' THEN
        RAISE EXCEPTION 'archived onboarding template cannot be edited'
          USING ERRCODE = '22023';
      END IF;
      normalized_name := btrim(COALESCE(p_payload ->> 'name', ''));
      normalized_description := btrim(COALESCE(p_payload ->> 'description', ''));
      normalized_definition := p_payload -> 'definition';
      SELECT COALESCE(array_agg(reminder.day::SMALLINT ORDER BY reminder.ordinality), ARRAY[]::SMALLINT[])
      INTO normalized_reminder_days
      FROM jsonb_array_elements_text(COALESCE(p_payload -> 'reminder_days', '[]'::JSONB))
        WITH ORDINALITY AS reminder(day, ordinality);

      IF char_length(normalized_name) NOT BETWEEN 1 AND 120
        OR char_length(normalized_description) > 1000
        OR jsonb_typeof(normalized_definition) <> 'object'
        OR octet_length(normalized_definition::TEXT) > 524288
        OR NOT public.workspace_onboarding_reminder_days_valid(normalized_reminder_days)
      THEN
        RAISE EXCEPTION 'invalid workspace onboarding template payload'
          USING ERRCODE = '22023';
      END IF;

      UPDATE public.workspace_onboarding_templates
      SET
        name = normalized_name,
        description = normalized_description,
        draft_definition = normalized_definition,
        reminder_days = normalized_reminder_days,
        updated_by = p_actor_user_id
      WHERE id = target_template.id
      RETURNING * INTO target_template;

    ELSIF normalized_action = 'publish' THEN
      IF target_template.status = 'archived' THEN
        RAISE EXCEPTION 'archived onboarding template cannot be published'
          USING ERRCODE = '22023';
      END IF;
      make_default := COALESCE((p_payload ->> 'make_default')::BOOLEAN, false);
      new_version := target_template.published_version + 1;

      INSERT INTO public.workspace_onboarding_template_versions (
        workspace_id,
        template_id,
        version,
        definition,
        published_by
      )
      VALUES (
        p_workspace_id,
        target_template.id,
        new_version,
        target_template.draft_definition,
        p_actor_user_id
      );

      IF make_default OR NOT EXISTS (
        SELECT 1
        FROM public.workspace_onboarding_templates AS existing_default
        WHERE existing_default.workspace_id = p_workspace_id
          AND existing_default.is_default
      ) THEN
        UPDATE public.workspace_onboarding_templates
        SET is_default = false, updated_by = p_actor_user_id
        WHERE workspace_id = p_workspace_id
          AND is_default
          AND id <> target_template.id;
        make_default := true;
      END IF;

      UPDATE public.workspace_onboarding_templates
      SET
        status = 'published',
        published_version = new_version,
        is_default = make_default OR is_default,
        updated_by = p_actor_user_id
      WHERE id = target_template.id
      RETURNING * INTO target_template;

    ELSIF normalized_action = 'duplicate' THEN
      normalized_name := btrim(COALESCE(p_payload ->> 'name', ''));
      IF char_length(normalized_name) NOT BETWEEN 1 AND 120 THEN
        RAISE EXCEPTION 'invalid duplicate template name'
          USING ERRCODE = '22023';
      END IF;

      INSERT INTO public.workspace_onboarding_templates (
        workspace_id,
        name,
        description,
        status,
        draft_definition,
        reminder_days,
        created_by,
        updated_by
      )
      VALUES (
        p_workspace_id,
        normalized_name,
        target_template.description,
        'draft',
        target_template.draft_definition,
        target_template.reminder_days,
        p_actor_user_id,
        p_actor_user_id
      )
      RETURNING * INTO target_template;

    ELSIF normalized_action = 'set_default' THEN
      IF target_template.status <> 'published' OR target_template.published_version < 1 THEN
        RAISE EXCEPTION 'only a published onboarding template can be the default'
          USING ERRCODE = '22023';
      END IF;
      UPDATE public.workspace_onboarding_templates
      SET is_default = false, updated_by = p_actor_user_id
      WHERE workspace_id = p_workspace_id
        AND is_default
        AND id <> target_template.id;
      UPDATE public.workspace_onboarding_templates
      SET is_default = true, updated_by = p_actor_user_id
      WHERE id = target_template.id
      RETURNING * INTO target_template;

    ELSIF normalized_action = 'archive' THEN
      UPDATE public.workspace_onboarding_templates
      SET
        status = 'archived',
        is_default = false,
        archived_at = now(),
        updated_by = p_actor_user_id
      WHERE id = target_template.id
      RETURNING * INTO target_template;
    END IF;
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
    'workspace.onboarding_template.' || normalized_action,
    'workspace_onboarding_template',
    target_template.id,
    jsonb_build_object(
      'name', target_template.name,
      'status', target_template.status,
      'published_version', target_template.published_version,
      'is_default', target_template.is_default
    )
  );

  result := public.workspace_onboarding_template_json_v1(target_template.id);
  RETURN result;
END;
$$;

REVOKE ALL ON FUNCTION public.workspace_onboarding_template_operation_v1(
  TEXT, UUID, UUID, JSONB, UUID, BIGINT
) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.workspace_onboarding_template_operation_v1(
  TEXT, UUID, UUID, JSONB, UUID, BIGINT
) TO service_role;

CREATE OR REPLACE FUNCTION public.workspace_onboarding_start_v1(
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
  actor_role TEXT;
  target_template public.workspace_onboarding_templates%ROWTYPE;
  target_version public.workspace_onboarding_template_versions%ROWTYPE;
  target_client public.clients%ROWTYPE;
  new_client JSONB;
  instance_id UUID;
  capability_generation INTEGER;
  capability_hash TEXT;
  capability_expires_at TIMESTAMPTZ;
  recipient_name TEXT;
  recipient_email TEXT;
  assignment_ids UUID[] := ARRAY[]::UUID[];
  valid_assignment_count INTEGER;
  reminder_day SMALLINT;
  result JSONB;
BEGIN
  IF p_workspace_id IS NULL
    OR p_template_id IS NULL
    OR p_payload IS NULL
    OR jsonb_typeof(p_payload) <> 'object'
  THEN
    RAISE EXCEPTION 'invalid workspace onboarding invitation'
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
    hashtextextended('goap:workspace-onboarding-start:' || p_workspace_id::TEXT, 0)
  );

  SELECT template.*
  INTO target_template
  FROM public.workspace_onboarding_templates AS template
  WHERE template.id = p_template_id
    AND template.workspace_id = p_workspace_id
    AND template.status = 'published'
    AND template.published_version > 0
  FOR SHARE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'published workspace onboarding template not found'
      USING ERRCODE = 'P0002';
  END IF;

  SELECT version.*
  INTO target_version
  FROM public.workspace_onboarding_template_versions AS version
  WHERE version.workspace_id = p_workspace_id
    AND version.template_id = target_template.id
    AND version.version = target_template.published_version
  FOR SHARE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'published onboarding template version not found'
      USING ERRCODE = 'P0002';
  END IF;

  instance_id := (p_payload ->> 'instance_id')::UUID;
  capability_generation := (p_payload ->> 'capability_generation')::INTEGER;
  capability_hash := lower(btrim(COALESCE(p_payload ->> 'capability_hash', '')));
  capability_expires_at := (p_payload ->> 'capability_expires_at')::TIMESTAMPTZ;
  recipient_name := btrim(COALESCE(p_payload ->> 'recipient_name', ''));
  recipient_email := lower(btrim(COALESCE(p_payload ->> 'recipient_email', '')));
  new_client := p_payload -> 'new_client';

  IF instance_id IS NULL
    OR capability_generation <> 1
    OR capability_hash !~ '^[0-9a-f]{64}$'
    OR capability_expires_at < now() + interval '1 hour'
    OR capability_expires_at > now() + interval '90 days'
    OR char_length(recipient_name) NOT BETWEEN 1 AND 200
    OR char_length(recipient_email) NOT BETWEEN 3 AND 254
    OR recipient_email !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'
  THEN
    RAISE EXCEPTION 'invalid workspace onboarding capability details'
      USING ERRCODE = '22023';
  END IF;

  IF p_client_id IS NULL THEN
    IF jsonb_typeof(new_client) <> 'object'
      OR char_length(btrim(COALESCE(new_client ->> 'name', ''))) NOT BETWEEN 1 AND 200
      OR lower(btrim(COALESCE(new_client ->> 'email', ''))) <> recipient_email
    THEN
      RAISE EXCEPTION 'valid new client details are required'
        USING ERRCODE = '22023';
    END IF;

    INSERT INTO public.clients (
      workspace_id,
      name,
      email,
      contact_person,
      status
    )
    VALUES (
      p_workspace_id,
      btrim(new_client ->> 'name'),
      recipient_email,
      NULLIF(btrim(COALESCE(new_client ->> 'contact_person', '')), ''),
      'active'
    )
    RETURNING * INTO target_client;
  ELSE
    SELECT client.*
    INTO target_client
    FROM public.clients AS client
    WHERE client.id = p_client_id
      AND client.workspace_id = p_workspace_id
    FOR SHARE;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'workspace client not found' USING ERRCODE = 'P0002';
    END IF;
  END IF;

  IF jsonb_typeof(COALESCE(p_payload -> 'assigned_membership_ids', '[]'::JSONB)) <> 'array' THEN
    RAISE EXCEPTION 'assigned membership ids must be an array'
      USING ERRCODE = '22023';
  END IF;

  SELECT COALESCE(array_agg(DISTINCT assignment.value::UUID ORDER BY assignment.value::UUID), ARRAY[]::UUID[])
  INTO assignment_ids
  FROM jsonb_array_elements_text(COALESCE(p_payload -> 'assigned_membership_ids', '[]'::JSONB))
    AS assignment(value);

  IF cardinality(assignment_ids) > 100 THEN
    RAISE EXCEPTION 'too many onboarding assignments' USING ERRCODE = '22023';
  END IF;

  SELECT count(*)
  INTO valid_assignment_count
  FROM public.workspace_memberships AS membership
  WHERE membership.workspace_id = p_workspace_id
    AND membership.id = ANY(assignment_ids)
    AND membership.status = 'active'
    AND membership.role = 'member';

  IF valid_assignment_count <> cardinality(assignment_ids) THEN
    RAISE EXCEPTION 'onboarding assignment does not belong to an active workspace member'
      USING ERRCODE = '22023';
  END IF;

  INSERT INTO public.workspace_onboarding_instances (
    id,
    workspace_id,
    client_id,
    template_version_id,
    recipient_name,
    recipient_email,
    capability_generation,
    capability_hash,
    capability_expires_at,
    created_by
  )
  VALUES (
    instance_id,
    p_workspace_id,
    target_client.id,
    target_version.id,
    recipient_name,
    recipient_email,
    capability_generation,
    capability_hash,
    capability_expires_at,
    p_actor_user_id
  );

  INSERT INTO public.workspace_onboarding_drafts (
    instance_id,
    workspace_id
  )
  VALUES (instance_id, p_workspace_id);

  INSERT INTO public.workspace_onboarding_assignments (
    workspace_id,
    instance_id,
    membership_id,
    assigned_by
  )
  SELECT
    p_workspace_id,
    instance_id,
    assignment.membership_id,
    p_actor_user_id
  FROM unnest(assignment_ids) AS assignment(membership_id);

  INSERT INTO public.workspace_onboarding_notifications (
    workspace_id,
    instance_id,
    kind,
    schedule_offset_days,
    due_at,
    next_attempt_at
  )
  VALUES (
    p_workspace_id,
    instance_id,
    'invitation',
    0,
    now(),
    now()
  );

  FOREACH reminder_day IN ARRAY target_template.reminder_days LOOP
    INSERT INTO public.workspace_onboarding_notifications (
      workspace_id,
      instance_id,
      kind,
      schedule_offset_days,
      status,
      due_at,
      next_attempt_at
    )
    VALUES (
      p_workspace_id,
      instance_id,
      'reminder',
      reminder_day,
      CASE
        WHEN now() + make_interval(days => reminder_day) < capability_expires_at
        THEN 'pending'
        ELSE 'cancelled'
      END,
      now() + make_interval(days => reminder_day),
      now() + make_interval(days => reminder_day)
    );
  END LOOP;

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
    'workspace.onboarding.invited',
    'workspace_onboarding_instance',
    instance_id,
    jsonb_build_object(
      'client_id', target_client.id,
      'template_id', target_template.id,
      'template_version', target_version.version,
      'created_client', p_client_id IS NULL,
      'assigned_member_count', cardinality(assignment_ids),
      'expires_at', capability_expires_at
    )
  );

  result := public.workspace_onboarding_instance_detail_json_v1(instance_id)
    || jsonb_build_object('client_created', p_client_id IS NULL);
  RETURN result;
END;
$$;

REVOKE ALL ON FUNCTION public.workspace_onboarding_start_v1(
  UUID, UUID, UUID, JSONB, UUID, BIGINT
) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.workspace_onboarding_start_v1(
  UUID, UUID, UUID, JSONB, UUID, BIGINT
) TO service_role;

CREATE OR REPLACE FUNCTION public.workspace_onboarding_instance_operation_v1(
  p_action TEXT,
  p_workspace_id UUID,
  p_instance_id UUID,
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
  normalized_action TEXT := lower(btrim(COALESCE(p_action, '')));
  actor_role TEXT;
  target_instance public.workspace_onboarding_instances%ROWTYPE;
  target_version public.workspace_onboarding_template_versions%ROWTYPE;
  comment_value JSONB;
  comment_question_id TEXT;
  comment_body TEXT;
  normalized_profile JSONB;
  next_generation INTEGER;
  next_hash TEXT;
  next_expiry TIMESTAMPTZ;
  previous_status TEXT;
  assignment_ids UUID[] := ARRAY[]::UUID[];
  valid_assignment_count INTEGER;
  purged_paths JSONB;
  audit_metadata JSONB := '{}'::JSONB;
  result JSONB;
BEGIN
  IF normalized_action NOT IN (
    'request_changes',
    'update_profile',
    'rotate',
    'extend',
    'revoke',
    'archive',
    'update_assignments',
    'purge_paths',
    'purge'
  )
    OR p_workspace_id IS NULL
    OR p_instance_id IS NULL
    OR p_payload IS NULL
    OR jsonb_typeof(p_payload) <> 'object'
  THEN
    RAISE EXCEPTION 'invalid workspace onboarding instance operation'
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

  SELECT version.*
  INTO target_version
  FROM public.workspace_onboarding_template_versions AS version
  WHERE version.id = target_instance.template_version_id
    AND version.workspace_id = p_workspace_id;

  IF normalized_action = 'request_changes' THEN
    IF target_instance.status <> 'submitted' OR target_instance.current_revision < 1 THEN
      RAISE EXCEPTION 'only a submitted onboarding can receive change requests'
        USING ERRCODE = '22023';
    END IF;
    IF jsonb_typeof(p_payload -> 'comments') <> 'array'
      OR jsonb_array_length(p_payload -> 'comments') NOT BETWEEN 1 AND 100
    THEN
      RAISE EXCEPTION 'at least one review comment is required'
        USING ERRCODE = '22023';
    END IF;

    FOR comment_value IN
      SELECT value FROM jsonb_array_elements(p_payload -> 'comments')
    LOOP
      comment_question_id := btrim(COALESCE(comment_value ->> 'question_id', ''));
      comment_body := btrim(COALESCE(comment_value ->> 'body', ''));
      IF comment_question_id !~ '^[a-z][a-z0-9_-]{0,63}$'
        OR char_length(comment_body) NOT BETWEEN 1 AND 2000
        OR NOT EXISTS (
          SELECT 1
          FROM jsonb_array_elements(target_version.definition -> 'sections') AS section(value)
          CROSS JOIN LATERAL jsonb_array_elements(section.value -> 'questions') AS question(value)
          WHERE question.value ->> 'id' = comment_question_id
        )
      THEN
        RAISE EXCEPTION 'invalid onboarding review comment'
          USING ERRCODE = '22023';
      END IF;

      INSERT INTO public.workspace_onboarding_review_comments (
        workspace_id,
        instance_id,
        revision,
        question_id,
        body,
        created_by
      )
      VALUES (
        p_workspace_id,
        p_instance_id,
        target_instance.current_revision,
        comment_question_id,
        comment_body,
        p_actor_user_id
      );
    END LOOP;

    UPDATE public.workspace_onboarding_instances
    SET
      status = 'changes_requested',
      changes_requested_at = now(),
      capability_expires_at = GREATEST(capability_expires_at, now() + interval '14 days')
    WHERE id = p_instance_id
    RETURNING * INTO target_instance;

    INSERT INTO public.workspace_onboarding_notifications (
      workspace_id,
      instance_id,
      kind,
      schedule_offset_days,
      due_at,
      next_attempt_at
    )
    VALUES (
      p_workspace_id,
      p_instance_id,
      'changes_requested',
      0,
      now(),
      now()
    )
    ON CONFLICT (instance_id, kind, schedule_offset_days) DO UPDATE
    SET
      status = 'pending',
      due_at = now(),
      next_attempt_at = now(),
      attempt_count = 0,
      attempted_at = NULL,
      sent_at = NULL,
      provider_message_id = NULL,
      last_error = NULL;

    audit_metadata := jsonb_build_object(
      'revision', target_instance.current_revision,
      'comment_count', jsonb_array_length(p_payload -> 'comments'),
      'expires_at', target_instance.capability_expires_at
    );

  ELSIF normalized_action = 'update_profile' THEN
    IF target_instance.status NOT IN ('submitted', 'changes_requested')
      OR target_instance.current_revision < 1
    THEN
      RAISE EXCEPTION 'a submitted onboarding is required to edit the pitch profile'
        USING ERRCODE = '22023';
    END IF;
    normalized_profile := p_payload -> 'profile';
    IF jsonb_typeof(normalized_profile) <> 'object'
      OR octet_length(normalized_profile::TEXT) > 262144
    THEN
      RAISE EXCEPTION 'invalid onboarding pitch profile'
        USING ERRCODE = '22023';
    END IF;

    INSERT INTO public.workspace_onboarding_profile_drafts (
      instance_id,
      workspace_id,
      revision,
      status,
      content,
      generation_error,
      updated_by
    )
    VALUES (
      p_instance_id,
      p_workspace_id,
      target_instance.current_revision,
      'edited',
      normalized_profile,
      NULL,
      p_actor_user_id
    )
    ON CONFLICT (instance_id) DO UPDATE
    SET
      revision = EXCLUDED.revision,
      status = 'edited',
      content = EXCLUDED.content,
      generation_error = NULL,
      updated_by = EXCLUDED.updated_by;
    audit_metadata := jsonb_build_object('revision', target_instance.current_revision);

  ELSIF normalized_action = 'rotate' THEN
    IF target_instance.status IN ('approved', 'revoked', 'submitted') THEN
      RAISE EXCEPTION 'this onboarding capability cannot be rotated'
        USING ERRCODE = '22023';
    END IF;
    next_generation := (p_payload ->> 'capability_generation')::INTEGER;
    next_hash := lower(btrim(COALESCE(p_payload ->> 'capability_hash', '')));
    next_expiry := (p_payload ->> 'capability_expires_at')::TIMESTAMPTZ;
    IF next_generation <> target_instance.capability_generation + 1
      OR next_hash !~ '^[0-9a-f]{64}$'
      OR next_expiry < now() + interval '1 hour'
      OR next_expiry > now() + interval '90 days'
    THEN
      RAISE EXCEPTION 'invalid rotated onboarding capability'
        USING ERRCODE = '22023';
    END IF;

    UPDATE public.workspace_onboarding_instances
    SET
      capability_generation = next_generation,
      capability_hash = next_hash,
      capability_expires_at = next_expiry,
      invited_at = now(),
      revoked_at = NULL,
      revoked_by = NULL
    WHERE id = p_instance_id
    RETURNING * INTO target_instance;

    UPDATE public.workspace_onboarding_notifications
    SET
      status = CASE
        WHEN kind = 'reminder'
          AND now() + make_interval(days => schedule_offset_days) < next_expiry
        THEN 'pending'
        WHEN kind = 'invitation' THEN 'pending'
        ELSE 'cancelled'
      END,
      due_at = CASE
        WHEN kind = 'invitation' THEN now()
        ELSE now() + make_interval(days => schedule_offset_days)
      END,
      next_attempt_at = CASE
        WHEN kind = 'invitation' THEN now()
        ELSE now() + make_interval(days => schedule_offset_days)
      END,
      attempt_count = 0,
      attempted_at = NULL,
      sent_at = NULL,
      provider_message_id = NULL,
      last_error = NULL
    WHERE instance_id = p_instance_id;
    audit_metadata := jsonb_build_object(
      'generation', next_generation,
      'expires_at', next_expiry
    );

  ELSIF normalized_action = 'extend' THEN
    IF target_instance.status IN ('submitted', 'approved', 'revoked') THEN
      RAISE EXCEPTION 'this onboarding capability cannot be extended'
        USING ERRCODE = '22023';
    END IF;
    next_expiry := (p_payload ->> 'capability_expires_at')::TIMESTAMPTZ;
    IF next_expiry <= target_instance.capability_expires_at
      OR next_expiry < now() + interval '1 hour'
      OR next_expiry > now() + interval '90 days'
    THEN
      RAISE EXCEPTION 'invalid onboarding capability extension'
        USING ERRCODE = '22023';
    END IF;
    UPDATE public.workspace_onboarding_instances
    SET capability_expires_at = next_expiry
    WHERE id = p_instance_id
    RETURNING * INTO target_instance;
    UPDATE public.workspace_onboarding_notifications
    SET
      status = 'pending',
      next_attempt_at = due_at,
      attempt_count = 0,
      attempted_at = NULL,
      sent_at = NULL,
      provider_message_id = NULL,
      last_error = NULL
    WHERE instance_id = p_instance_id
      AND kind = 'reminder'
      AND status = 'cancelled'
      AND due_at > now()
      AND due_at < next_expiry;
    audit_metadata := jsonb_build_object('expires_at', next_expiry);

  ELSIF normalized_action = 'revoke' THEN
    IF target_instance.status = 'approved' THEN
      RAISE EXCEPTION 'approved onboarding cannot be revoked'
        USING ERRCODE = '22023';
    END IF;
    previous_status := target_instance.status;
    IF target_instance.status <> 'revoked' THEN
      UPDATE public.workspace_onboarding_instances
      SET
        status = 'revoked',
        revoked_at = now(),
        revoked_by = p_actor_user_id
      WHERE id = p_instance_id
      RETURNING * INTO target_instance;
      UPDATE public.workspace_onboarding_notifications
      SET status = 'cancelled'
      WHERE instance_id = p_instance_id
        AND status IN ('pending', 'processing', 'failed');
    END IF;
    audit_metadata := jsonb_build_object('previous_status', previous_status);

  ELSIF normalized_action = 'archive' THEN
    IF target_instance.archived_at IS NULL THEN
      UPDATE public.workspace_onboarding_instances
      SET
        archived_at = now(),
        status = CASE
          WHEN status IN ('invited', 'in_progress', 'changes_requested') THEN 'revoked'
          ELSE status
        END,
        revoked_at = CASE
          WHEN status IN ('invited', 'in_progress', 'changes_requested') THEN now()
          ELSE revoked_at
        END,
        revoked_by = CASE
          WHEN status IN ('invited', 'in_progress', 'changes_requested') THEN p_actor_user_id
          ELSE revoked_by
        END
      WHERE id = p_instance_id
      RETURNING * INTO target_instance;
      UPDATE public.workspace_onboarding_notifications
      SET status = 'cancelled'
      WHERE instance_id = p_instance_id
        AND status IN ('pending', 'processing', 'failed');
    END IF;
    audit_metadata := jsonb_build_object('status', target_instance.status);

  ELSIF normalized_action = 'update_assignments' THEN
    IF jsonb_typeof(p_payload -> 'assigned_membership_ids') <> 'array' THEN
      RAISE EXCEPTION 'assigned membership ids must be an array'
        USING ERRCODE = '22023';
    END IF;
    SELECT COALESCE(array_agg(DISTINCT assignment.value::UUID ORDER BY assignment.value::UUID), ARRAY[]::UUID[])
    INTO assignment_ids
    FROM jsonb_array_elements_text(p_payload -> 'assigned_membership_ids') AS assignment(value);
    IF cardinality(assignment_ids) > 100 THEN
      RAISE EXCEPTION 'too many onboarding assignments' USING ERRCODE = '22023';
    END IF;
    SELECT count(*)
    INTO valid_assignment_count
    FROM public.workspace_memberships AS membership
    WHERE membership.workspace_id = p_workspace_id
      AND membership.id = ANY(assignment_ids)
      AND membership.status = 'active'
      AND membership.role = 'member';
    IF valid_assignment_count <> cardinality(assignment_ids) THEN
      RAISE EXCEPTION 'invalid onboarding assignment'
        USING ERRCODE = '22023';
    END IF;
    DELETE FROM public.workspace_onboarding_assignments
    WHERE instance_id = p_instance_id;
    INSERT INTO public.workspace_onboarding_assignments (
      workspace_id,
      instance_id,
      membership_id,
      assigned_by
    )
    SELECT p_workspace_id, p_instance_id, assignment.membership_id, p_actor_user_id
    FROM unnest(assignment_ids) AS assignment(membership_id);
    audit_metadata := jsonb_build_object('assigned_member_count', cardinality(assignment_ids));

  ELSIF normalized_action IN ('purge_paths', 'purge') THEN
    IF target_instance.archived_at IS NULL
      OR p_payload ->> 'confirmation' <> 'PURGE'
    THEN
      RAISE EXCEPTION 'archived onboarding and explicit purge confirmation are required'
        USING ERRCODE = '22023';
    END IF;

    SELECT COALESCE(jsonb_agg(asset.storage_path ORDER BY asset.storage_path), '[]'::JSONB)
    INTO purged_paths
    FROM public.workspace_onboarding_assets AS asset
    WHERE asset.instance_id = p_instance_id;

    IF normalized_action = 'purge_paths' THEN
      RETURN jsonb_build_object(
        'instance_id', p_instance_id,
        'storage_paths', purged_paths
      );
    END IF;

    PERFORM set_config('app.onboarding_pii_purge', 'on', true);
    DELETE FROM public.workspace_onboarding_instances
    WHERE id = p_instance_id
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
      'workspace.onboarding.purge',
      'workspace_onboarding_instance',
      p_instance_id,
      jsonb_build_object(
        'client_id', target_instance.client_id,
        'asset_count', jsonb_array_length(purged_paths),
        'client_record_retained', true
      )
    );
    RETURN jsonb_build_object(
      'purged', true,
      'instance_id', p_instance_id,
      'storage_paths', purged_paths
    );
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
    'workspace.onboarding.' || normalized_action,
    'workspace_onboarding_instance',
    p_instance_id,
    audit_metadata
  );

  result := public.workspace_onboarding_instance_detail_json_v1(p_instance_id);
  RETURN result;
END;
$$;

REVOKE ALL ON FUNCTION public.workspace_onboarding_instance_operation_v1(
  TEXT, UUID, UUID, JSONB, UUID, BIGINT
) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.workspace_onboarding_instance_operation_v1(
  TEXT, UUID, UUID, JSONB, UUID, BIGINT
) TO service_role;

CREATE OR REPLACE FUNCTION public.workspace_onboarding_approve_v1(
  p_workspace_id UUID,
  p_instance_id UUID,
  p_profile JSONB,
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
  IF p_workspace_id IS NULL
    OR p_instance_id IS NULL
    OR jsonb_typeof(p_profile) <> 'object'
    OR octet_length(p_profile::TEXT) > 262144
    OR jsonb_typeof(COALESCE(p_profile -> 'expertise', 'null'::JSONB)) <> 'array'
    OR jsonb_typeof(COALESCE(p_profile -> 'key_messages', 'null'::JSONB)) <> 'array'
    OR jsonb_typeof(COALESCE(p_profile -> 'story_angles', 'null'::JSONB)) <> 'array'
    OR jsonb_typeof(COALESCE(p_profile -> 'talking_points', 'null'::JSONB)) <> 'array'
    OR jsonb_typeof(COALESCE(p_profile -> 'suggested_show_fit', 'null'::JSONB)) <> 'array'
  THEN
    RAISE EXCEPTION 'invalid approved onboarding profile'
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

  SELECT revision.answers
  INTO submitted_answers
  FROM public.workspace_onboarding_answer_revisions AS revision
  WHERE revision.instance_id = p_instance_id
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

  -- Changing clients.email invokes the portal security lifecycle trigger,
  -- which intentionally disables access and destroys credentials/sessions.
  -- Onboarding approval must remain independent from portal authentication,
  -- so apply an email mapping only when there is no portal state to disturb.
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
    bio = CASE
      WHEN NULLIF(btrim(COALESCE(p_profile ->> 'professional_bio', '')), '') IS NOT NULL
        THEN btrim(p_profile ->> 'professional_bio')
      WHEN has_bio THEN mapped_bio
      ELSE bio
    END
  WHERE id = target_instance.client_id
    AND workspace_id = p_workspace_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'workspace client not found' USING ERRCODE = 'P0002';
  END IF;

  INSERT INTO public.workspace_client_pitch_profiles (
    client_id,
    workspace_id,
    professional_bio,
    positioning_summary,
    expertise,
    key_messages,
    story_angles,
    talking_points,
    ideal_audience,
    suggested_show_fit,
    approved_onboarding_instance_id,
    approved_revision,
    approved_by,
    approved_at
  )
  VALUES (
    target_instance.client_id,
    p_workspace_id,
    left(COALESCE(p_profile ->> 'professional_bio', ''), 20000),
    left(COALESCE(p_profile ->> 'positioning_summary', ''), 10000),
    p_profile -> 'expertise',
    p_profile -> 'key_messages',
    p_profile -> 'story_angles',
    p_profile -> 'talking_points',
    left(COALESCE(p_profile ->> 'ideal_audience', ''), 10000),
    p_profile -> 'suggested_show_fit',
    p_instance_id,
    target_instance.current_revision,
    p_actor_user_id,
    now()
  )
  ON CONFLICT (client_id) DO UPDATE
  SET
    workspace_id = EXCLUDED.workspace_id,
    professional_bio = EXCLUDED.professional_bio,
    positioning_summary = EXCLUDED.positioning_summary,
    expertise = EXCLUDED.expertise,
    key_messages = EXCLUDED.key_messages,
    story_angles = EXCLUDED.story_angles,
    talking_points = EXCLUDED.talking_points,
    ideal_audience = EXCLUDED.ideal_audience,
    suggested_show_fit = EXCLUDED.suggested_show_fit,
    approved_onboarding_instance_id = EXCLUDED.approved_onboarding_instance_id,
    approved_revision = EXCLUDED.approved_revision,
    approved_by = EXCLUDED.approved_by,
    approved_at = EXCLUDED.approved_at;

  INSERT INTO public.workspace_onboarding_profile_drafts (
    instance_id,
    workspace_id,
    revision,
    status,
    content,
    generation_error,
    generated_at,
    updated_by
  )
  VALUES (
    p_instance_id,
    p_workspace_id,
    target_instance.current_revision,
    'approved',
    p_profile,
    NULL,
    now(),
    p_actor_user_id
  )
  ON CONFLICT (instance_id) DO UPDATE
  SET
    revision = EXCLUDED.revision,
    status = 'approved',
    content = EXCLUDED.content,
    generation_error = NULL,
    updated_by = EXCLUDED.updated_by;

  UPDATE public.workspace_onboarding_instances
  SET
    status = 'approved',
    approved_at = now(),
    approved_by = p_actor_user_id
  WHERE id = p_instance_id;

  UPDATE public.workspace_onboarding_notifications
  SET status = 'cancelled'
  WHERE instance_id = p_instance_id
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
      'email_mapping_requested', has_email,
      'email_mapping_skipped_for_portal_safety', has_email AND NOT apply_email,
      'portal_access_changed', false
    )
  );

  RETURN public.workspace_onboarding_instance_detail_json_v1(p_instance_id);
END;
$$;

REVOKE ALL ON FUNCTION public.workspace_onboarding_approve_v1(
  UUID, UUID, JSONB, UUID, BIGINT
) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.workspace_onboarding_approve_v1(
  UUID, UUID, JSONB, UUID, BIGINT
) TO service_role;

CREATE OR REPLACE FUNCTION public.workspace_onboarding_client_operation_v1(
  p_action TEXT,
  p_instance_id UUID,
  p_capability_hash TEXT,
  p_payload JSONB
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  normalized_action TEXT := lower(btrim(COALESCE(p_action, '')));
  target_instance public.workspace_onboarding_instances%ROWTYPE;
  target_draft public.workspace_onboarding_drafts%ROWTYPE;
  target_asset public.workspace_onboarding_assets%ROWTYPE;
  next_answers JSONB;
  next_section INTEGER;
  expected_lock BIGINT;
  next_revision INTEGER;
  asset_id UUID;
  asset_question_id TEXT;
  asset_path TEXT;
  asset_name TEXT;
  asset_mime TEXT;
  asset_size BIGINT;
  result JSONB;
BEGIN
  IF normalized_action NOT IN ('get', 'save', 'submit', 'register_asset', 'delete_asset')
    OR p_instance_id IS NULL
    OR p_capability_hash !~ '^[0-9a-f]{64}$'
    OR p_payload IS NULL
    OR jsonb_typeof(p_payload) <> 'object'
  THEN
    RAISE EXCEPTION 'invalid onboarding capability request'
      USING ERRCODE = '22023';
  END IF;

  IF normalized_action = 'get' THEN
    SELECT instance.*
    INTO target_instance
    FROM public.workspace_onboarding_instances AS instance
    JOIN public.workspaces AS workspace
      ON workspace.id = instance.workspace_id
      AND workspace.status = 'active'
      AND NOT workspace.is_default
    WHERE instance.id = p_instance_id
      AND instance.capability_hash = lower(p_capability_hash);
  ELSE
    PERFORM pg_advisory_xact_lock(
      hashtextextended('goap:workspace-onboarding-instance:' || p_instance_id::TEXT, 0)
    );
    SELECT instance.*
    INTO target_instance
    FROM public.workspace_onboarding_instances AS instance
    JOIN public.workspaces AS workspace
      ON workspace.id = instance.workspace_id
      AND workspace.status = 'active'
      AND NOT workspace.is_default
    WHERE instance.id = p_instance_id
      AND instance.capability_hash = lower(p_capability_hash)
    FOR UPDATE OF instance;
  END IF;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'onboarding capability not found'
      USING ERRCODE = 'P0002';
  END IF;

  IF normalized_action = 'get' THEN
    RETURN public.workspace_onboarding_client_view_json_v1(p_instance_id);
  END IF;

  IF target_instance.status IN ('revoked', 'approved')
    OR target_instance.status = 'submitted'
    OR target_instance.capability_expires_at <= now()
  THEN
    RAISE EXCEPTION 'onboarding capability is not editable'
      USING ERRCODE = '42501';
  END IF;

  SELECT draft.*
  INTO target_draft
  FROM public.workspace_onboarding_drafts AS draft
  WHERE draft.instance_id = p_instance_id
    AND draft.workspace_id = target_instance.workspace_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'onboarding draft not found' USING ERRCODE = 'P0002';
  END IF;

  IF normalized_action = 'save' THEN
    next_answers := p_payload -> 'answers';
    next_section := (p_payload ->> 'current_section')::INTEGER;
    expected_lock := (p_payload ->> 'expected_lock_version')::BIGINT;
    IF jsonb_typeof(next_answers) <> 'object'
      OR octet_length(next_answers::TEXT) > 1048576
      OR next_section NOT BETWEEN 0 AND 11
      OR expected_lock <> target_draft.lock_version
    THEN
      IF expected_lock IS DISTINCT FROM target_draft.lock_version THEN
        RAISE EXCEPTION 'onboarding draft changed'
          USING ERRCODE = '40001';
      END IF;
      RAISE EXCEPTION 'invalid onboarding draft'
        USING ERRCODE = '22023';
    END IF;

    UPDATE public.workspace_onboarding_drafts
    SET
      answers = next_answers,
      current_section = next_section,
      lock_version = lock_version + 1,
      updated_at = now()
    WHERE instance_id = p_instance_id;

    UPDATE public.workspace_onboarding_instances
    SET
      status = CASE WHEN status = 'invited' THEN 'in_progress' ELSE status END,
      started_at = COALESCE(started_at, now())
    WHERE id = p_instance_id;

  ELSIF normalized_action = 'submit' THEN
    expected_lock := (p_payload ->> 'expected_lock_version')::BIGINT;
    IF expected_lock <> target_draft.lock_version THEN
      RAISE EXCEPTION 'onboarding draft changed'
        USING ERRCODE = '40001';
    END IF;

    next_revision := target_instance.current_revision + 1;
    INSERT INTO public.workspace_onboarding_answer_revisions (
      workspace_id,
      instance_id,
      revision,
      answers
    )
    VALUES (
      target_instance.workspace_id,
      p_instance_id,
      next_revision,
      target_draft.answers
    );

    UPDATE public.workspace_onboarding_review_comments
    SET status = 'resolved', resolved_at = now()
    WHERE instance_id = p_instance_id
      AND status = 'open';

    INSERT INTO public.workspace_onboarding_profile_drafts (
      instance_id,
      workspace_id,
      revision,
      status,
      content,
      generation_error,
      generated_at,
      updated_by
    )
    VALUES (
      p_instance_id,
      target_instance.workspace_id,
      next_revision,
      'pending',
      '{}'::JSONB,
      NULL,
      NULL,
      NULL
    )
    ON CONFLICT (instance_id) DO UPDATE
    SET
      revision = EXCLUDED.revision,
      status = 'pending',
      content = '{}'::JSONB,
      generation_error = NULL,
      generated_at = NULL,
      updated_by = NULL;

    UPDATE public.workspace_onboarding_instances
    SET
      status = 'submitted',
      current_revision = next_revision,
      submitted_at = now(),
      changes_requested_at = CASE
        WHEN status = 'changes_requested' THEN changes_requested_at
        ELSE NULL
      END
    WHERE id = p_instance_id;

    UPDATE public.workspace_onboarding_notifications
    SET status = 'cancelled'
    WHERE instance_id = p_instance_id
      AND status IN ('pending', 'processing', 'failed');

    RETURN public.workspace_onboarding_client_view_json_v1(p_instance_id);

  ELSIF normalized_action = 'register_asset' THEN
    expected_lock := (p_payload ->> 'expected_lock_version')::BIGINT;
    asset_id := (p_payload ->> 'asset_id')::UUID;
    asset_question_id := btrim(COALESCE(p_payload ->> 'question_id', ''));
    asset_path := btrim(COALESCE(p_payload ->> 'storage_path', ''));
    asset_name := btrim(COALESCE(p_payload ->> 'original_name', ''));
    asset_mime := btrim(COALESCE(p_payload ->> 'mime_type', ''));
    asset_size := (p_payload ->> 'byte_size')::BIGINT;

    IF expected_lock <> target_draft.lock_version THEN
      RAISE EXCEPTION 'onboarding draft changed'
        USING ERRCODE = '40001';
    END IF;

    INSERT INTO public.workspace_onboarding_assets (
      id,
      workspace_id,
      instance_id,
      question_id,
      storage_path,
      original_name,
      mime_type,
      byte_size
    )
    VALUES (
      asset_id,
      target_instance.workspace_id,
      p_instance_id,
      asset_question_id,
      asset_path,
      asset_name,
      asset_mime,
      asset_size
    );

    UPDATE public.workspace_onboarding_drafts
    SET
      answers = jsonb_set(answers, ARRAY[asset_question_id], to_jsonb(asset_id::TEXT), true),
      lock_version = lock_version + 1,
      updated_at = now()
    WHERE instance_id = p_instance_id;

    UPDATE public.workspace_onboarding_instances
    SET
      status = CASE WHEN status = 'invited' THEN 'in_progress' ELSE status END,
      started_at = COALESCE(started_at, now())
    WHERE id = p_instance_id;

  ELSIF normalized_action = 'delete_asset' THEN
    expected_lock := (p_payload ->> 'expected_lock_version')::BIGINT;
    asset_id := (p_payload ->> 'asset_id')::UUID;
    IF expected_lock <> target_draft.lock_version THEN
      RAISE EXCEPTION 'onboarding draft changed'
        USING ERRCODE = '40001';
    END IF;
    SELECT asset.*
    INTO target_asset
    FROM public.workspace_onboarding_assets AS asset
    WHERE asset.id = asset_id
      AND asset.instance_id = p_instance_id
      AND asset.workspace_id = target_instance.workspace_id
      AND asset.deleted_at IS NULL
    FOR UPDATE;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'onboarding asset not found' USING ERRCODE = 'P0002';
    END IF;

    UPDATE public.workspace_onboarding_assets
    SET deleted_at = now()
    WHERE id = asset_id;
    UPDATE public.workspace_onboarding_drafts
    SET
      answers = CASE
        WHEN answers ->> target_asset.question_id = asset_id::TEXT
          THEN answers - target_asset.question_id
        ELSE answers
      END,
      lock_version = lock_version + 1,
      updated_at = now()
    WHERE instance_id = p_instance_id;

    RETURN jsonb_build_object(
      'deleted', true,
      'storage_path', target_asset.storage_path,
      'view', public.workspace_onboarding_client_view_json_v1(p_instance_id)
    );
  END IF;

  result := public.workspace_onboarding_client_view_json_v1(p_instance_id);
  RETURN result;
END;
$$;

REVOKE ALL ON FUNCTION public.workspace_onboarding_client_operation_v1(
  TEXT, UUID, TEXT, JSONB
) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.workspace_onboarding_client_operation_v1(
  TEXT, UUID, TEXT, JSONB
) TO service_role;

CREATE OR REPLACE FUNCTION public.set_workspace_onboarding_ai_profile_v1(
  p_instance_id UUID,
  p_revision INTEGER,
  p_status TEXT,
  p_content JSONB,
  p_error TEXT
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  target_instance public.workspace_onboarding_instances%ROWTYPE;
  normalized_status TEXT := lower(btrim(COALESCE(p_status, '')));
BEGIN
  IF p_instance_id IS NULL
    OR p_revision IS NULL
    OR p_revision < 1
    OR normalized_status NOT IN ('generated', 'failed')
    OR jsonb_typeof(COALESCE(p_content, '{}'::JSONB)) <> 'object'
    OR octet_length(COALESCE(p_content, '{}'::JSONB)::TEXT) > 262144
    OR char_length(COALESCE(p_error, '')) > 500
  THEN
    RAISE EXCEPTION 'invalid onboarding AI profile result'
      USING ERRCODE = '22023';
  END IF;

  SELECT instance.*
  INTO target_instance
  FROM public.workspace_onboarding_instances AS instance
  WHERE instance.id = p_instance_id
    AND instance.status = 'submitted'
    AND instance.current_revision = p_revision
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN false;
  END IF;

  INSERT INTO public.workspace_onboarding_profile_drafts (
    instance_id,
    workspace_id,
    revision,
    status,
    content,
    generation_error,
    generated_at,
    updated_by
  )
  VALUES (
    p_instance_id,
    target_instance.workspace_id,
    p_revision,
    normalized_status,
    CASE WHEN normalized_status = 'generated' THEN p_content ELSE '{}'::JSONB END,
    CASE WHEN normalized_status = 'failed' THEN COALESCE(p_error, 'AI draft unavailable') ELSE NULL END,
    CASE WHEN normalized_status = 'generated' THEN now() ELSE NULL END,
    NULL
  )
  ON CONFLICT (instance_id) DO UPDATE
  SET
    revision = EXCLUDED.revision,
    status = EXCLUDED.status,
    content = EXCLUDED.content,
    generation_error = EXCLUDED.generation_error,
    generated_at = EXCLUDED.generated_at,
    updated_by = NULL;
  RETURN true;
END;
$$;

CREATE OR REPLACE FUNCTION public.record_workspace_onboarding_invitation_v1(
  p_instance_id UUID,
  p_status TEXT,
  p_provider_message_id TEXT,
  p_error TEXT
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  normalized_status TEXT := lower(btrim(COALESCE(p_status, '')));
BEGIN
  IF p_instance_id IS NULL
    OR normalized_status NOT IN ('sent', 'failed', 'skipped')
    OR char_length(COALESCE(p_provider_message_id, '')) > 255
    OR char_length(COALESCE(p_error, '')) > 500
  THEN
    RAISE EXCEPTION 'invalid onboarding invitation delivery result'
      USING ERRCODE = '22023';
  END IF;

  UPDATE public.workspace_onboarding_notifications
  SET
    status = normalized_status,
    attempt_count = LEAST(attempt_count + 1, 10),
    attempted_at = now(),
    sent_at = CASE WHEN normalized_status = 'sent' THEN now() ELSE NULL END,
    provider_message_id = NULLIF(btrim(COALESCE(p_provider_message_id, '')), ''),
    last_error = CASE
      WHEN normalized_status = 'failed' THEN COALESCE(NULLIF(btrim(p_error), ''), 'Email delivery failed')
      ELSE NULL
    END,
    next_attempt_at = CASE
      WHEN normalized_status = 'failed' THEN now() + interval '6 hours'
      ELSE next_attempt_at
    END
  WHERE instance_id = p_instance_id
    AND kind = 'invitation'
    AND schedule_offset_days = 0;
  RETURN FOUND;
END;
$$;

CREATE OR REPLACE FUNCTION public.record_workspace_onboarding_change_request_v1(
  p_instance_id UUID,
  p_status TEXT,
  p_provider_message_id TEXT,
  p_error TEXT
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  normalized_status TEXT := lower(btrim(COALESCE(p_status, '')));
BEGIN
  IF p_instance_id IS NULL
    OR normalized_status NOT IN ('sent', 'failed', 'skipped')
    OR char_length(COALESCE(p_provider_message_id, '')) > 255
    OR char_length(COALESCE(p_error, '')) > 500
  THEN
    RAISE EXCEPTION 'invalid onboarding change-request delivery result'
      USING ERRCODE = '22023';
  END IF;

  UPDATE public.workspace_onboarding_notifications
  SET
    status = normalized_status,
    attempt_count = LEAST(attempt_count + 1, 10),
    attempted_at = now(),
    sent_at = CASE WHEN normalized_status = 'sent' THEN now() ELSE NULL END,
    provider_message_id = NULLIF(btrim(COALESCE(p_provider_message_id, '')), ''),
    last_error = CASE
      WHEN normalized_status = 'failed' THEN COALESCE(NULLIF(btrim(p_error), ''), 'Email delivery failed')
      ELSE NULL
    END,
    next_attempt_at = CASE
      WHEN normalized_status = 'failed' THEN now() + interval '6 hours'
      ELSE next_attempt_at
    END
  WHERE instance_id = p_instance_id
    AND kind = 'changes_requested'
    AND schedule_offset_days = 0;
  RETURN FOUND;
END;
$$;

CREATE OR REPLACE FUNCTION public.claim_workspace_onboarding_reminders_v1(
  p_limit INTEGER
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  result JSONB;
BEGIN
  IF p_limit IS NULL OR p_limit NOT BETWEEN 1 AND 50 THEN
    RAISE EXCEPTION 'invalid reminder claim limit' USING ERRCODE = '22023';
  END IF;

  WITH candidates AS (
    SELECT notification.id
    FROM public.workspace_onboarding_notifications AS notification
    JOIN public.workspace_onboarding_instances AS instance
      ON instance.id = notification.instance_id
      AND instance.workspace_id = notification.workspace_id
    JOIN public.workspaces AS workspace
      ON workspace.id = instance.workspace_id
      AND workspace.status = 'active'
      AND NOT workspace.is_default
    WHERE notification.kind = 'reminder'
      AND (
        (
          notification.status IN ('pending', 'failed')
          AND notification.next_attempt_at <= now()
        )
        OR (
          notification.status = 'processing'
          AND notification.attempted_at <= now() - interval '15 minutes'
        )
      )
      AND notification.attempt_count < 5
      AND instance.status IN ('invited', 'in_progress', 'changes_requested')
      AND instance.capability_expires_at > now()
      AND instance.archived_at IS NULL
    ORDER BY notification.next_attempt_at, notification.id
    FOR UPDATE OF notification SKIP LOCKED
    LIMIT p_limit
  ), claimed AS (
    UPDATE public.workspace_onboarding_notifications AS notification
    SET
      status = 'processing',
      attempt_count = notification.attempt_count + 1,
      attempted_at = now()
    FROM candidates
    WHERE notification.id = candidates.id
    RETURNING notification.*
  )
  SELECT COALESCE(jsonb_agg(
    jsonb_build_object(
      'notification_id', claimed.id,
      'instance_id', instance.id,
      'workspace_id', instance.workspace_id,
      'workspace_name', workspace.name,
      'recipient_name', instance.recipient_name,
      'recipient_email', instance.recipient_email,
      'capability_generation', instance.capability_generation,
      'capability_expires_at', instance.capability_expires_at,
      'schedule_offset_days', claimed.schedule_offset_days
    ) ORDER BY claimed.next_attempt_at, claimed.id
  ), '[]'::JSONB)
  INTO result
  FROM claimed
  JOIN public.workspace_onboarding_instances AS instance
    ON instance.id = claimed.instance_id
  JOIN public.workspaces AS workspace
    ON workspace.id = instance.workspace_id;

  RETURN result;
END;
$$;

CREATE OR REPLACE FUNCTION public.complete_workspace_onboarding_notification_v1(
  p_notification_id UUID,
  p_status TEXT,
  p_provider_message_id TEXT,
  p_error TEXT
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  normalized_status TEXT := lower(btrim(COALESCE(p_status, '')));
BEGIN
  IF p_notification_id IS NULL
    OR normalized_status NOT IN ('sent', 'failed', 'skipped', 'cancelled')
    OR char_length(COALESCE(p_provider_message_id, '')) > 255
    OR char_length(COALESCE(p_error, '')) > 500
  THEN
    RAISE EXCEPTION 'invalid onboarding notification result'
      USING ERRCODE = '22023';
  END IF;

  UPDATE public.workspace_onboarding_notifications
  SET
    status = normalized_status,
    sent_at = CASE WHEN normalized_status = 'sent' THEN now() ELSE NULL END,
    provider_message_id = NULLIF(btrim(COALESCE(p_provider_message_id, '')), ''),
    last_error = CASE
      WHEN normalized_status = 'failed' THEN COALESCE(NULLIF(btrim(p_error), ''), 'Email delivery failed')
      ELSE NULL
    END,
    next_attempt_at = CASE
      WHEN normalized_status = 'failed' THEN now() + interval '6 hours'
      ELSE next_attempt_at
    END
  WHERE id = p_notification_id
    AND status = 'processing';
  RETURN FOUND;
END;
$$;

REVOKE ALL ON FUNCTION public.set_workspace_onboarding_ai_profile_v1(
  UUID, INTEGER, TEXT, JSONB, TEXT
) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.set_workspace_onboarding_ai_profile_v1(
  UUID, INTEGER, TEXT, JSONB, TEXT
) TO service_role;
REVOKE ALL ON FUNCTION public.record_workspace_onboarding_invitation_v1(
  UUID, TEXT, TEXT, TEXT
) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.record_workspace_onboarding_invitation_v1(
  UUID, TEXT, TEXT, TEXT
) TO service_role;
REVOKE ALL ON FUNCTION public.record_workspace_onboarding_change_request_v1(
  UUID, TEXT, TEXT, TEXT
) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.record_workspace_onboarding_change_request_v1(
  UUID, TEXT, TEXT, TEXT
) TO service_role;
REVOKE ALL ON FUNCTION public.claim_workspace_onboarding_reminders_v1(INTEGER)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.claim_workspace_onboarding_reminders_v1(INTEGER)
  TO service_role;
REVOKE ALL ON FUNCTION public.complete_workspace_onboarding_notification_v1(
  UUID, TEXT, TEXT, TEXT
) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.complete_workspace_onboarding_notification_v1(
  UUID, TEXT, TEXT, TEXT
) TO service_role;

COMMENT ON TABLE public.workspace_onboarding_templates IS
  'Workspace-owned onboarding builders; published versions are snapshotted separately.';
COMMENT ON TABLE public.workspace_onboarding_template_versions IS
  'Immutable onboarding form definitions pinned by client invitations.';
COMMENT ON TABLE public.workspace_onboarding_instances IS
  'One-client capability-link onboarding lifecycles; only SHA-256 token verifiers are stored.';
COMMENT ON TABLE public.workspace_onboarding_answer_revisions IS
  'Immutable client-submitted answer snapshots retained until an explicit onboarding PII purge.';
COMMENT ON TABLE public.workspace_onboarding_assets IS
  'Private onboarding uploads addressed through short-lived signed URLs only.';
COMMENT ON TABLE public.workspace_client_pitch_profiles IS
  'Approved podcast pitch profiles, independent from client portal authentication and sessions.';
COMMENT ON FUNCTION public.workspace_onboarding_staff_list_v1(UUID, UUID, BIGINT) IS
  'Lists manager-visible workspace onboarding data or only instances assigned to the current member.';
COMMENT ON FUNCTION public.workspace_onboarding_client_operation_v1(TEXT, UUID, TEXT, JSONB) IS
  'Capability-verifier intake API for read, autosave, immutable submission, and private upload metadata.';
COMMENT ON FUNCTION public.workspace_onboarding_approve_v1(UUID, UUID, JSONB, UUID, BIGINT) IS
  'Approves the latest submission, applies explicit client mappings, and never mutates portal access.';

COMMIT;
