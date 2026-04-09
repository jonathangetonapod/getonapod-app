---
paths:
  - "src/**/*"
  - "supabase/**/*"
---

# Security Rules

- Never expose API keys in client-side code (no VITE_ANTHROPIC_API_KEY, etc.)
- Never use `dangerouslyAllowBrowser: true` for AI SDK clients
- Always verify Stripe webhook signatures with `constructEventAsync()`
- Sanitize user search input before `.or()` or `.ilike()` Supabase filters
- Sort columns must be validated against an allowlist, never pass raw user input
- Portal session tokens have 24hr TTL — always check expiry server-side
- Admin routes must use ProtectedRoute with email validation
- Database schema changes require migration files in `supabase/migrations/`
- CORS must be restricted to known domains, never wildcard `'*'`
