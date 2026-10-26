-- Host brief section approvals, and client names without trailing punctuation.
--
-- The Guest brief tab shows each host brief section as Empty, Draft or
-- Approved, and the brief counts as ready once the four required sections are
-- approved. The brief itself is six strings, so a section's approval is kept
-- beside it: the list of sections an operator approved as written. Approval
-- belongs to the text, so a section whose text changes on save drops out of
-- the list unless the same save approves it again.
--
-- Every section that already has text was written or saved by an operator on
-- the old "Approved host context" screen, so existing text starts approved and
-- no ready client loses its readiness to this change.
--
-- Client names: intake imports carried names such as "Jim D. Shields," whose
-- trailing comma leaked into copy ("Jim D. Shields,'s AI"). A trigger now cleans
-- the name on every write, from any path, and existing rows are cleaned once.

BEGIN;

DO $client_brief_approval_prerequisites$
BEGIN
  IF to_regprocedure('public.update_workspace_client_ai_sdr_profile_v1(uuid,uuid,jsonb,timestamp with time zone,uuid,bigint)') IS NULL
    OR to_regprocedure('public.workspace_staff_actor_role_v1(uuid,uuid,bigint,boolean)') IS NULL
  THEN
    RAISE EXCEPTION 'client brief approvals require the client AI SDR profile migration';
  END IF;
END;
$client_brief_approval_prerequisites$;

ALTER TABLE public.clients
  ADD COLUMN IF NOT EXISTS ai_sdr_profile_approved_fields TEXT[] NOT NULL DEFAULT '{}'::TEXT[];

ALTER TABLE public.clients
  DROP CONSTRAINT IF EXISTS clients_ai_sdr_profile_approved_fields_known;

ALTER TABLE public.clients
  ADD CONSTRAINT clients_ai_sdr_profile_approved_fields_known
  CHECK (ai_sdr_profile_approved_fields <@ ARRAY[
    'positioning',
    'topics_and_angles',
    'listener_takeaways',
    'proof_points',
    'ideal_opportunities',
    'booking_details'
  ]::TEXT[]);

COMMENT ON COLUMN public.clients.ai_sdr_profile_approved_fields IS
  'Host brief sections an operator approved as written. Only sections with text appear; changing a section''s text removes it unless that save approves it again.';

UPDATE public.clients AS client
SET ai_sdr_profile_approved_fields = ARRAY(
  SELECT field
  FROM unnest(ARRAY[
    'positioning',
    'topics_and_angles',
    'listener_takeaways',
    'proof_points',
    'ideal_opportunities',
    'booking_details'
  ]::TEXT[]) WITH ORDINALITY AS fields(field, position)
  WHERE btrim(COALESCE(client.ai_sdr_profile ->> field, '')) <> ''
  ORDER BY position
)
WHERE client.ai_sdr_profile <> '{}'::JSONB;

/*
 * p_approved_fields NULL keeps the approvals of every section whose text is
 * unchanged, so a caller that does not know about approvals never approves
 * anything and never revokes an approval it did not touch. A list replaces the
 * approvals outright; sections without text are dropped from it either way.
 */
CREATE OR REPLACE FUNCTION public.update_workspace_client_ai_sdr_profile_v2(
  p_workspace_id UUID,
  p_client_id UUID,
  p_profile JSONB,
  p_approved_fields TEXT[],
  p_expected_profile_updated_at TIMESTAMPTZ,
  p_actor_user_id UUID,
  p_token_issued_at BIGINT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  profile_fields CONSTANT TEXT[] := ARRAY[
    'positioning',
    'topics_and_angles',
    'listener_takeaways',
    'proof_points',
    'ideal_opportunities',
    'booking_details'
  ]::TEXT[];
  actor_role TEXT;
  normalized_profile JSONB;
  current_profile JSONB;
  current_approved_fields TEXT[];
  current_profile_updated_at TIMESTAMPTZ;
  next_profile_updated_at TIMESTAMPTZ := clock_timestamp();
  requested_approved_fields TEXT[];
  next_approved_fields TEXT[];
  previous_completed_fields INTEGER;
  completed_fields INTEGER;
  approved_core_fields INTEGER;
  ready BOOLEAN;
  result JSONB;
BEGIN
  IF p_workspace_id IS NULL
    OR p_client_id IS NULL
    OR p_profile IS NULL
    OR jsonb_typeof(p_profile) <> 'object'
    OR p_profile - profile_fields <> '{}'::JSONB
    OR EXISTS (
      SELECT 1
      FROM unnest(profile_fields) AS fields(field)
      WHERE (p_profile ? field AND jsonb_typeof(p_profile -> field) <> 'string')
        OR char_length(COALESCE(p_profile ->> field, '')) > 4000
    )
    OR (p_approved_fields IS NOT NULL AND NOT (p_approved_fields <@ profile_fields))
    OR (p_approved_fields IS NOT NULL AND array_position(p_approved_fields, NULL) IS NOT NULL)
  THEN
    RAISE EXCEPTION 'workspace client AI SDR profile is invalid'
      USING ERRCODE = '22023';
  END IF;

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

  PERFORM pg_advisory_xact_lock(
    hashtextextended('goap:workspace-client-ai-sdr-profile:' || p_client_id::TEXT, 0)
  );

  SELECT client.ai_sdr_profile, client.ai_sdr_profile_approved_fields, client.ai_sdr_profile_updated_at
  INTO current_profile, current_approved_fields, current_profile_updated_at
  FROM public.clients AS client
  WHERE client.id = p_client_id
    AND client.workspace_id = p_workspace_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'workspace client not found' USING ERRCODE = 'P0002';
  END IF;

  IF current_profile_updated_at IS DISTINCT FROM p_expected_profile_updated_at THEN
    RAISE EXCEPTION 'workspace client AI SDR profile changed'
      USING ERRCODE = '40001';
  END IF;

  normalized_profile := COALESCE((
    SELECT jsonb_object_agg(field, btrim(p_profile ->> field))
    FROM unnest(profile_fields) AS fields(field)
    WHERE btrim(COALESCE(p_profile ->> field, '')) <> ''
  ), '{}'::JSONB);

  requested_approved_fields := COALESCE(p_approved_fields, ARRAY(
    SELECT field
    FROM unnest(current_approved_fields) AS approved(field)
    WHERE (current_profile ->> field) IS NOT DISTINCT FROM (normalized_profile ->> field)
  ));

  next_approved_fields := ARRAY(
    SELECT field
    FROM unnest(profile_fields) WITH ORDINALITY AS fields(field, position)
    WHERE field = ANY(requested_approved_fields)
      AND normalized_profile ? field
    ORDER BY position
  );

  previous_completed_fields := (
    SELECT count(*)
    FROM unnest(profile_fields) AS fields(field)
    WHERE btrim(COALESCE(current_profile ->> field, '')) <> ''
  );
  completed_fields := (
    SELECT count(*) FROM jsonb_object_keys(normalized_profile)
  );
  approved_core_fields := cardinality(ARRAY(
    SELECT unnest(next_approved_fields)
    INTERSECT
    SELECT unnest(ARRAY['positioning', 'topics_and_angles', 'listener_takeaways', 'booking_details']::TEXT[])
  ));
  ready := approved_core_fields = 4;

  UPDATE public.clients AS client
  SET ai_sdr_profile = normalized_profile,
      ai_sdr_profile_approved_fields = next_approved_fields,
      ai_sdr_profile_updated_at = next_profile_updated_at
  WHERE client.id = p_client_id
    AND client.workspace_id = p_workspace_id
    AND client.ai_sdr_profile_updated_at IS NOT DISTINCT FROM p_expected_profile_updated_at
  RETURNING jsonb_build_object(
    'id', client.id,
    'workspace_id', client.workspace_id,
    'ai_sdr_profile', client.ai_sdr_profile,
    'ai_sdr_profile_approved_fields', to_jsonb(client.ai_sdr_profile_approved_fields),
    'ai_sdr_profile_updated_at', client.ai_sdr_profile_updated_at
  )
  INTO result;

  IF result IS NULL THEN
    RAISE EXCEPTION 'workspace client AI SDR profile changed'
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
    'workspace.client.ai_sdr_profile_updated',
    'client',
    p_client_id,
    jsonb_build_object(
      'previous_completed_fields', previous_completed_fields,
      'completed_fields', completed_fields,
      'total_fields', 6,
      'approved_fields', cardinality(next_approved_fields),
      'approved_core_fields', approved_core_fields,
      'ready', ready,
      'cleared', completed_fields = 0
    )
  );

  RETURN result;
END;
$$;

REVOKE ALL ON FUNCTION public.update_workspace_client_ai_sdr_profile_v2(
  UUID, UUID, JSONB, TEXT[], TIMESTAMPTZ, UUID, BIGINT
) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.update_workspace_client_ai_sdr_profile_v2(
  UUID, UUID, JSONB, TEXT[], TIMESTAMPTZ, UUID, BIGINT
) TO service_role;

COMMENT ON FUNCTION public.update_workspace_client_ai_sdr_profile_v2(
  UUID, UUID, JSONB, TEXT[], TIMESTAMPTZ, UUID, BIGINT
) IS 'Updates the client host brief and its section approvals with manager authorization, optimistic concurrency, and content-free audit metadata.';

/*
 * Trims whitespace and trailing commas, semicolons and periods from a client
 * name. A final period stays when it closes an initial or a common suffix
 * ("Jim D.", "Acme Inc.", "Sam Jones Jr."), since that period is part of the
 * name. A name that would clean to nothing is returned trimmed instead.
 */
CREATE OR REPLACE FUNCTION public.clean_client_name_v1(p_name TEXT)
RETURNS TEXT
LANGUAGE plpgsql
IMMUTABLE
SET search_path = ''
AS $$
DECLARE
  cleaned TEXT := btrim(p_name);
BEGIN
  IF cleaned IS NULL THEN
    RETURN NULL;
  END IF;

  LOOP
    cleaned := regexp_replace(cleaned, '[[:space:],;]+$', '');
    EXIT WHEN cleaned !~ '\.$'
      OR cleaned ~ '(^|[[:space:]])[[:upper:]]\.$'
      OR cleaned ~* '(^|[[:space:]])(jr|sr|inc|co|corp|ltd|llc|llp|plc|phd|md|esq)\.$';
    cleaned := left(cleaned, -1);
  END LOOP;

  RETURN CASE WHEN cleaned = '' THEN btrim(p_name) ELSE cleaned END;
END;
$$;

COMMENT ON FUNCTION public.clean_client_name_v1(TEXT) IS
  'Trims whitespace and trailing commas, semicolons and periods from a client name, keeping a period that closes an initial or a suffix such as Inc. or Jr.';

CREATE OR REPLACE FUNCTION public.clients_clean_name()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  NEW.name := public.clean_client_name_v1(NEW.name);
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS clients_clean_name ON public.clients;
CREATE TRIGGER clients_clean_name
  BEFORE INSERT OR UPDATE OF name ON public.clients
  FOR EACH ROW
  EXECUTE FUNCTION public.clients_clean_name();

UPDATE public.clients
SET name = public.clean_client_name_v1(name)
WHERE name IS DISTINCT FROM public.clean_client_name_v1(name);

NOTIFY pgrst, 'reload schema';

COMMIT;
