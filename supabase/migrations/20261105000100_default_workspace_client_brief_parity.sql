-- Let the default platform workspace edit its clients' source profile and
-- host brief.
--
-- The Guest brief tab saves through update_workspace_client_profile_v1
-- (the source profile) and update_workspace_client_ai_sdr_profile_v2 (the
-- host brief). Both authorize through workspace_staff_actor_role_v1, which
-- raises 'private workspace not found' for the default workspace by design,
-- and the workspace-clients function maps any "not found" to 404
-- CLIENT_NOT_FOUND. So an operator editing a client of the platform's own
-- agency saw "Workspace client not found" for a client that plainly exists.
--
-- 20261020000100 fixed the same refusal for workspace_client_operation_v2.
-- These two take the simpler route: workspace_settings_actor_role_v1 admits
-- the default workspace (platform administrators, and owner/admin members,
-- under the staff gate's freshness rules) and, for every other workspace,
-- returns workspace_staff_actor_role_v1(..., true), which is exactly the call
-- being replaced. Tenant workspaces therefore keep their current path.
--
-- The functions are rewritten in place from their live definitions, so the
-- rest of each body (locking, optimistic concurrency, approvals, audit) is
-- untouched, and the migration fails if either definition has drifted from
-- the single staff-gate call this expects.

BEGIN;

DO $default_workspace_client_brief_prerequisites$
BEGIN
  IF to_regprocedure('public.workspace_settings_actor_role_v1(uuid,uuid,bigint)') IS NULL
    OR to_regprocedure('public.workspace_staff_actor_role_v1(uuid,uuid,bigint,boolean)') IS NULL
    OR to_regprocedure('public.update_workspace_client_profile_v1(uuid,uuid,text,timestamptz,uuid,bigint)') IS NULL
    OR to_regprocedure('public.update_workspace_client_ai_sdr_profile_v2(uuid,uuid,jsonb,text[],timestamptz,uuid,bigint)') IS NULL
  THEN
    RAISE EXCEPTION 'default workspace client brief prerequisites are missing';
  END IF;
END;
$default_workspace_client_brief_prerequisites$;

DO $enable_default_workspace_client_brief$
DECLARE
  target REGPROCEDURE;
  function_definition TEXT;
  staff_gate_count INTEGER;
  staff_gate_call CONSTANT TEXT :=
    'public\.workspace_staff_actor_role_v1\(\s*p_workspace_id,\s*p_actor_user_id,\s*p_token_issued_at,\s*true\s*\)';
  settings_gate_call CONSTANT TEXT :=
    'public.workspace_settings_actor_role_v1(p_workspace_id, p_actor_user_id, p_token_issued_at)';
BEGIN
  FOREACH target IN ARRAY ARRAY[
    'public.update_workspace_client_profile_v1(uuid,uuid,text,timestamptz,uuid,bigint)'::REGPROCEDURE,
    'public.update_workspace_client_ai_sdr_profile_v2(uuid,uuid,jsonb,text[],timestamptz,uuid,bigint)'::REGPROCEDURE
  ] LOOP
    function_definition := pg_get_functiondef(target);
    staff_gate_count := regexp_count(function_definition, staff_gate_call);

    IF staff_gate_count <> 1 THEN
      RAISE EXCEPTION
        '% had % workspace staff gate calls; expected 1',
        target, staff_gate_count;
    END IF;

    EXECUTE regexp_replace(function_definition, staff_gate_call, settings_gate_call);
  END LOOP;
END;
$enable_default_workspace_client_brief$;

COMMENT ON FUNCTION public.update_workspace_client_profile_v1(
  UUID, UUID, TEXT, TIMESTAMPTZ, UUID, BIGINT
) IS 'Updates the canonical discovery and outreach profile for a workspace-scoped client with manager authorization (tenant and default platform workspace alike), optimistic concurrency, and audit metadata.';

NOTIFY pgrst, 'reload schema';

COMMIT;
