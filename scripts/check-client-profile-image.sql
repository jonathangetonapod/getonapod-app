-- Usage with psql: psql "$DATABASE_URL" -v client_email='person@example.com' -f scripts/check-client-profile-image.sql
SELECT id, name, email, photo_url
FROM public.clients
WHERE lower(btrim(email)) = lower(btrim(:'client_email'));
