---
paths:
  - "supabase/functions/**/*.ts"
---

# Edge Function Rules

- Always use CORS headers: `Deno.env.get('ALLOWED_ORIGIN') || 'https://getonapod.com'`
- Never use wildcard `'*'` for Access-Control-Allow-Origin
- Use `Deno.env.get()` for secrets, never `import.meta.env`
- Every function must handle OPTIONS preflight
- Every error path must include CORS headers in the response
- Return `{ success: true/false, ... }` shape consistently
- Validate all required parameters before processing
- Use service role key for database access: `Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')`
- Log with function name prefix: `console.log('[FunctionName] ...')`
- Sanitize search inputs before using in `.or()` or `.ilike()` filters
- After creating a new function, add it to `src/lib/api-docs.ts`
