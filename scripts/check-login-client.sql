-- Usage with psql: psql "$DATABASE_URL" -v client_email='person@example.com' -f scripts/check-login-client.sql
-- This intentionally reports only credential configuration metadata.
SELECT
  client.id,
  client.name,
  client.email,
  client.portal_access_enabled,
  client.password_set_at,
  (credential.client_id IS NOT NULL) AS credential_configured
FROM public.clients AS client
LEFT JOIN public.client_portal_credentials AS credential
  ON credential.client_id = client.id
WHERE lower(btrim(client.email)) = lower(btrim(:'client_email'));
