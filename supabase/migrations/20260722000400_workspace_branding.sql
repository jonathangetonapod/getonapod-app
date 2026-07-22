-- Workspace-specific branding for tenant and platform-owner workspace views.
-- Logos are public presentation assets, but every write remains server-side
-- and is authorized against the exact selected workspace.

BEGIN;

DO $workspace_branding_prerequisites$
BEGIN
  IF to_regprocedure(
    'public.workspace_staff_actor_role_v1(uuid,uuid,bigint,boolean)'
  ) IS NULL
    OR to_regclass('storage.buckets') IS NULL
    OR to_regclass('storage.objects') IS NULL
  THEN
    RAISE EXCEPTION
      'workspace branding requires workspace staff management and Supabase Storage';
  END IF;
END;
$workspace_branding_prerequisites$;

ALTER TABLE public.workspaces
  ADD COLUMN IF NOT EXISTS logo_path TEXT,
  ADD COLUMN IF NOT EXISTS logo_updated_at TIMESTAMPTZ;

DO $workspace_logo_constraint$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conrelid = 'public.workspaces'::regclass
      AND conname = 'workspaces_logo_state_check'
  ) THEN
    ALTER TABLE public.workspaces
      ADD CONSTRAINT workspaces_logo_state_check CHECK (
        (
          logo_path IS NULL
          AND logo_updated_at IS NULL
        )
        OR (
          logo_updated_at IS NOT NULL
          AND logo_path ~ (
            '^' || id::TEXT ||
            '/[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\.(png|jpg|webp)$'
          )
        )
      ) NOT VALID;
  END IF;
END;
$workspace_logo_constraint$;

ALTER TABLE public.workspaces
  VALIDATE CONSTRAINT workspaces_logo_state_check;

INSERT INTO storage.buckets (
  id,
  name,
  public,
  file_size_limit,
  allowed_mime_types
)
VALUES (
  'workspace-logos',
  'workspace-logos',
  true,
  2097152,
  ARRAY['image/jpeg', 'image/png', 'image/webp']
)
ON CONFLICT (id) DO UPDATE
SET
  name = EXCLUDED.name,
  public = EXCLUDED.public,
  file_size_limit = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types;

DROP POLICY IF EXISTS workspace_logos_public_read ON storage.objects;
CREATE POLICY workspace_logos_public_read
  ON storage.objects
  FOR SELECT
  TO public
  USING (bucket_id = 'workspace-logos');

CREATE OR REPLACE FUNCTION public.set_workspace_logo_v1(
  p_workspace_id UUID,
  p_expected_logo_path TEXT,
  p_logo_path TEXT,
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
  current_logo_path TEXT;
  result JSONB;
BEGIN
  IF p_workspace_id IS NULL THEN
    RAISE EXCEPTION 'workspace_id is required' USING ERRCODE = '22023';
  END IF;

  PERFORM pg_advisory_xact_lock(
    hashtextextended('goap:workspace-branding:' || p_workspace_id::TEXT, 0)
  );

  actor_role := public.workspace_staff_actor_role_v1(
    p_workspace_id,
    p_actor_user_id,
    p_token_issued_at,
    true
  );

  IF actor_role NOT IN ('owner', 'admin', 'platform_admin') THEN
    RAISE EXCEPTION 'active workspace manager access is required'
      USING ERRCODE = '42501';
  END IF;

  SELECT workspace.logo_path
  INTO current_logo_path
  FROM public.workspaces AS workspace
  WHERE workspace.id = p_workspace_id
    AND workspace.status = 'active'
    AND NOT workspace.is_default
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'private workspace not found' USING ERRCODE = 'P0002';
  END IF;

  IF current_logo_path IS DISTINCT FROM p_expected_logo_path THEN
    RAISE EXCEPTION 'workspace logo state changed'
      USING ERRCODE = '40001';
  END IF;

  IF p_logo_path IS NOT NULL
    AND p_logo_path !~ (
      '^' || p_workspace_id::TEXT ||
      '/[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\.(png|jpg|webp)$'
    )
  THEN
    RAISE EXCEPTION 'workspace logo path is invalid' USING ERRCODE = '22023';
  END IF;

  UPDATE public.workspaces AS workspace
  SET
    logo_path = p_logo_path,
    logo_updated_at = CASE
      WHEN p_logo_path IS NULL THEN NULL
      ELSE clock_timestamp()
    END
  WHERE workspace.id = p_workspace_id
    AND workspace.logo_path IS NOT DISTINCT FROM p_expected_logo_path
  RETURNING jsonb_build_object(
    'id', workspace.id,
    'logo_path', workspace.logo_path,
    'logo_updated_at', workspace.logo_updated_at
  )
  INTO result;

  IF result IS NULL THEN
    RAISE EXCEPTION 'workspace logo state changed'
      USING ERRCODE = '40001';
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
    CASE
      WHEN p_logo_path IS NULL THEN 'workspace.branding.logo_removed'
      ELSE 'workspace.branding.logo_updated'
    END,
    'workspace',
    p_workspace_id,
    jsonb_build_object(
      'had_previous_logo', current_logo_path IS NOT NULL,
      'has_logo', p_logo_path IS NOT NULL
    )
  );

  RETURN result;
END;
$$;

REVOKE ALL ON FUNCTION public.set_workspace_logo_v1(
  UUID, TEXT, TEXT, UUID, BIGINT
) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.set_workspace_logo_v1(
  UUID, TEXT, TEXT, UUID, BIGINT
) TO service_role;

COMMENT ON COLUMN public.workspaces.logo_path IS
  'Server-managed object path in the public workspace-logos bucket.';
COMMENT ON FUNCTION public.set_workspace_logo_v1(
  UUID, TEXT, TEXT, UUID, BIGINT
) IS
  'Atomically updates or removes a workspace logo with manager authorization, stale-state protection, and an append-only audit event.';

COMMIT;
