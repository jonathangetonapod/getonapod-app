-- Usage with psql: psql "$DATABASE_URL" -v client_email='person@example.com' -f scripts/check-nwolfe-client.sql
-- Password verifiers are intentionally excluded from diagnostics.
SELECT
  id,
  name,
  email,
  portal_access_enabled,
  password_set_at,
  portal_last_login_at
FROM public.clients
WHERE lower(btrim(email)) = lower(btrim(:'client_email'));
