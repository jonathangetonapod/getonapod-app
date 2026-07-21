-- Usage with psql: psql "$DATABASE_URL" -v client_email='person@example.com' -f scripts/find-nwolfe-client.sql
-- Password verifiers are intentionally excluded from diagnostics.
SELECT
  id,
  name,
  email,
  workspace_id,
  status,
  portal_access_enabled,
  password_set_at
FROM public.clients
WHERE lower(btrim(email)) = lower(btrim(:'client_email'));
