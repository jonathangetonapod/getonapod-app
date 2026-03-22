---
description: Scaffold a new Supabase edge function
argument-hint: [function-name]
---

Create a new edge function at `supabase/functions/$ARGUMENTS/index.ts`.

Use the standard boilerplate from CLAUDE.md:
- Deno serve() wrapper
- CORS headers with `Deno.env.get('ALLOWED_ORIGIN') || 'https://getonapod.com'`
- Supabase client with service role key
- Try/catch with structured JSON error responses
- Console logging with `[$ARGUMENTS]` prefix

After creating:
1. Add the endpoint to `src/lib/api-docs.ts`
2. Add documentation to the appropriate `docs/api/edge-functions-*.md` file
3. Deploy with `supabase functions deploy $ARGUMENTS`
