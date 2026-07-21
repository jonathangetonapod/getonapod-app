# Sentry privacy-safe setup

Sentry is optional for this application. The invite-only MVP uses error-only
telemetry and deliberately suppresses events on authentication and bearer-
capability routes.

## Enforced application posture

The checked-in `src/lib/sentry.ts` and startup sequence enforce:

- no session replay;
- no performance tracing or transaction events;
- all browser default integrations disabled, including automatic console, DOM,
  fetch, XHR, navigation, and history breadcrumbs;
- `sendDefaultPii: false`;
- Sentry user context limited to an opaque application ID;
- event `contexts` and `extra` removed;
- request data reduced to a redacted URL;
- manually supplied breadcrumbs restricted to redacted HTTP/navigation fields;
- sensitive query/hash values and client/prospect capability slugs redacted;
- no telemetry while the browser is on `/accept-invite`,
  `/admin/callback`, `/client/:slug`, or `/prospect/:slug`; and
- Supabase Auth parameters consumed and removed from the address bar before the
  rest of the application initializes.

Do not add replay, browser tracing, automatic PII, request bodies, response
bodies, headers, email addresses, names, or capture contexts without a new
privacy/security review.

## Before enabling a DSN

1. Review existing Sentry, hosting, proxy, analytics, and support logs for
   invitation, recovery, OAuth, portal-session, or capability URLs.
2. Revoke affected sessions/links and purge retained sensitive telemetry under
   the incident process.
3. Restrict Sentry project membership, configure the minimum retention period,
   and document who can export events.
4. Verify production CSP and referrer headers at the hosting/CDN boundary.

The DSN is a browser-visible project identifier, not a private server secret.
A Sentry organization auth token is private and must never use a `VITE_` name
or enter the frontend build.

## Configuration

Only add the browser DSN to the frontend environment:

```dotenv
VITE_SENTRY_DSN=https://public-key@example.ingest.sentry.io/project-id
VITE_SENTRY_ENVIRONMENT=staging
VITE_SENTRY_RELEASE=reviewed-release-id
```

Leave `VITE_SENTRY_DSN` empty to disable Sentry. Do not configure
`SENTRY_AUTH_TOKEN` for the no-source-map MVP build. Set the environment and
release explicitly in each reviewed deployment. If the environment is omitted,
production builds report `production` rather than the internal
`static-validation` Vite mode. `VITE_APP_VERSION` remains a supported release
fallback for existing deployments.

## Safe verification

Test from a non-sensitive route with a synthetic error that contains no client
data, email, UUID, URL, token, or provider response. Confirm the event contains:

- a redacted/non-sensitive URL only;
- no replay;
- no trace;
- no request headers/body;
- no `contexts` or `extra`;
- no email or name; and
- at most an opaque user ID.

Then visit each suppressed Auth/capability route and verify that no Sentry event,
breadcrumb, replay, or transaction is emitted. Run:

```bash
npm run test:sensitive-url
npm run lint:mvp
npm run typecheck:app
```

A successful synthetic event proves delivery only. It does not replace the
historical telemetry incident review or production-header verification.
