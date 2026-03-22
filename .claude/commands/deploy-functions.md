---
description: Deploy all or specific Supabase edge functions
argument-hint: [function-name or "all"]
---

Deploy edge functions to Supabase.

If "$ARGUMENTS" is "all", deploy every function:
!`ls -d supabase/functions/*/index.ts | sed 's|supabase/functions/||;s|/index.ts||' | grep -v _shared | tr '\n' ' '`

Otherwise deploy the specified function: $ARGUMENTS

Before deploying:
1. Run `npx vite build` to verify the frontend builds
2. Deploy using `supabase functions deploy $ARGUMENTS`
3. Verify the function responds with a quick test
