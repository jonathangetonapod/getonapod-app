# Client portal login smoke test

Use a staging client created for acceptance testing. Never query, print, or copy
the server-side password verifier.

1. Confirm `portal_access_enabled`, `password_set_at`, workspace status, and the
   existence of a row in `client_portal_credentials` using
   `scripts/check-login-client.sql` with a psql `client_email` variable.
2. Sign in through `/portal/login` with the test password.
3. Confirm a raw opaque token is stored in tab-scoped session storage and only a
   `sha256$...` verifier exists in `client_portal_sessions`.
4. Verify the stored verifier itself is rejected if submitted as a bearer token.
5. Log out and verify the session row is deleted.

Run these checks only against staging. The July 2026 security migration
invalidates legacy raw sessions, so pre-cutover sessions must sign in again.
