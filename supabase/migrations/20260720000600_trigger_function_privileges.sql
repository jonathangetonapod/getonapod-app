-- Historical explicit grants can survive CREATE OR REPLACE FUNCTION. Trigger
-- functions are implementation details and must not remain directly
-- executable by browser roles.

BEGIN;

SELECT pg_advisory_xact_lock(
  hashtextextended('goap:trigger-function-privileges:v1', 0)
);

DO $$
DECLARE
  trigger_function_signature TEXT;
BEGIN
  FOREACH trigger_function_signature IN ARRAY ARRAY[
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
  ]
  LOOP
    IF to_regprocedure(trigger_function_signature) IS NULL THEN
      RAISE EXCEPTION
        'required trigger function is missing: %',
        trigger_function_signature;
    END IF;

    EXECUTE format(
      'REVOKE ALL ON FUNCTION %s FROM PUBLIC, anon, authenticated',
      trigger_function_signature
    );
  END LOOP;

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
    WHERE has_function_privilege(
      browser_role.name,
      trigger_function.signature,
      'EXECUTE'
    )
  ) THEN
    RAISE EXCEPTION 'browser roles retain direct trigger-function execution';
  END IF;
END;
$$;

COMMIT;
