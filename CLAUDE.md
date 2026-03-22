# CLAUDE.md — Get On A Pod (Authority Built)

## 1. Project Overview

Podcast placement platform for a booking agency (Get On A Pod / Authority Built). Manages client bookings, prospect dashboards, outreach campaigns, AI-powered podcast matching, and a public marketing site. Three user surfaces: public marketing site, admin dashboard, and client portal.

## 2. Tech Stack

- **Framework:** React 18 + Vite 5 (SWC plugin)
- **Language:** TypeScript 5.8 (loose — `noImplicitAny: false`, `strictNullChecks: false`)
- **Styling:** Tailwind CSS 3.4 + `tailwindcss-animate` + `@tailwindcss/typography`
- **Components:** shadcn/ui (Radix primitives in `src/components/ui/`)
- **State:** Zustand (cart store), React Context (auth, client portal), TanStack React Query
- **Forms:** React Hook Form + Zod validation
- **Routing:** React Router DOM v6
- **Rich Text:** TipTap editor
- **Charts:** Recharts
- **Backend:** Supabase (auth, Postgres, edge functions, storage)
- **AI:** Anthropic Claude API + OpenAI (called from edge functions)
- **Payments:** Stripe (checkout sessions, webhooks)
- **Monitoring:** Sentry (`@sentry/react`)
- **Icons:** Lucide React

**Do not introduce:** Next.js, Redux, Styled Components, Material UI, Firebase, Prisma, tRPC.

## 3. Architecture

```
src/
  App.tsx              — All routes defined here (React Router)
  main.tsx             — Entry point (Sentry init, React render)
  index.css            — CSS variables (design tokens), Tailwind layers
  pages/               — Route-level components
    admin/             — Admin dashboard pages (ProtectedRoute)
    portal/            — Client portal pages (ClientProtectedRoute)
    prospect/          — Public prospect dashboard
    client/            — Public client approval view
    *.tsx              — Public marketing pages (Index, Blog, Checkout, etc.)
  components/
    ui/                — shadcn/ui primitives (do not edit manually)
    admin/             — Admin-specific components
    portal/            — Client portal components
    pricing/           — Pricing-specific components
    blog/              — Blog components
    docs/              — API docs components
    *.tsx              — Shared marketing components (Hero, Navbar, Footer, etc.)
  services/            — Supabase query functions (one file per domain)
  lib/                 — Utilities: supabase client, config, sentry, api-docs, utils
  hooks/               — Custom hooks (use-mobile, use-toast, useScrollAnimation)
  contexts/            — React contexts (AuthContext, ClientPortalContext)
  stores/              — Zustand stores (cartStore)
  data/                — Static data (blogPosts)
supabase/
  functions/           — Deno edge functions (one folder per function)
    _shared/           — Shared utilities (email-templates, podcastCache)
  migrations/          — SQL migration files
scripts/               — Utility scripts (sitemap gen, scraping, deployment)
```

## 4. Coding Conventions

- **Components:** Arrow function components (`const MyComponent = () => {}`), no `React.FC`
- **Naming:** PascalCase for components/types, camelCase for functions/variables
- **Imports:** Use `@/` path alias (maps to `src/`). Prefer named imports.
- **Interfaces:** Exported from service files alongside query functions. Use `interface` not `type` for object shapes.
- **Error handling:** `try/catch` in services, `toast()` (sonner) for user-facing errors
- **Async data:** TanStack Query hooks in pages, raw `supabase` calls in service files
- **Edge functions:** Deno runtime, `serve()` wrapper, inline CORS headers, `SUPABASE_SERVICE_ROLE_KEY` for DB access
- **Console logging:** Edge functions use `[Function Name]` prefix pattern (e.g., `[Generate Tagline] ...`)

## 5. UI and Design System

- **Component library:** shadcn/ui — primitives live in `src/components/ui/`. Do not manually edit these files; use `npx shadcn-ui@latest add <component>` to add new ones.
- **Styling:** Tailwind utility classes. No custom CSS files beyond `index.css`.
- **Design tokens:** CSS custom properties in `src/index.css` (`:root` and `.dark`). HSL color values consumed via `hsl(var(--primary))` pattern.
- **Font:** Inter (400-800)
- **Border radius:** `--radius: 0.5rem` base
- **Container:** max-width `1200px`, centered, `1.5rem` padding
- **Animations:** Defined in `tailwind.config.ts` — fade-up, fade-in, scale-in, shimmer, pulse-glow, etc.

## 6. Content and Copy Guidance

- Tone: Professional, confident, results-oriented. Not salesy or hype-driven.
- Brand name: "Get On A Pod" (product) / "Authority Built" (company)
- Pricing: $749/month (as of last update — verify in `PricingSection.tsx`)
- Target audience: Entrepreneurs, founders, thought leaders seeking podcast guest appearances
- Avoid: Overpromising, vague claims, exclamation marks in body copy

## 7. Testing and Quality Bar

- **No test framework currently configured** (no Jest, Vitest, or Playwright in deps)
- **"Done" means:** TypeScript compiles (`tsc`), Vite builds without errors (`npm run build`), no runtime console errors on affected pages
- **Lint:** ESLint 9 with `typescript-eslint` and React hooks/refresh plugins
- Before shipping, manually verify affected pages render correctly

## 8. File and Component Placement Rules

- **New page:** Create in `src/pages/` (or `src/pages/admin/`, `src/pages/portal/`), add route in `App.tsx` above the catch-all `*` route
- **New service:** Create in `src/services/` (one file per domain, exports async functions using `supabase`)
- **New hook:** Create in `src/hooks/`
- **New edge function:** Create folder in `supabase/functions/<function-name>/index.ts` with CORS headers and `serve()` boilerplate
- **New UI primitive:** Use `npx shadcn-ui@latest add`, never hand-write into `components/ui/`
- **Prefer editing over creating.** Check if a service file or component already exists before making a new one.

## 9. Safety Rules

- **Auth:** Do not modify `AuthContext.tsx`, `ClientPortalContext.tsx`, or `ProtectedRoute.tsx` without explicit approval
- **Database:** Never change schema without a Supabase migration file in `supabase/migrations/`
- **API keys:** All secrets go in Supabase edge function env vars (server-side). Client-side env vars use `VITE_` prefix and must contain only public keys (anon key, Stripe publishable key, Sentry DSN).
- **Edge functions:** Maintain backward compatibility — existing callers (webhooks, other services) depend on request/response shapes
- **Admin access:** Controlled via `admin_users` DB table + fallback email in `src/lib/config.ts`
- **Do not** delete or rename Supabase edge functions without checking all callers

## 10. Commands

```bash
npm run dev          # Start Vite dev server
npm run build        # Generate sitemap + production build
npm run build:dev    # Development build (no sitemap)
npm run preview      # Preview production build
npm run lint         # ESLint
npm run sitemap      # Generate sitemap only

# Supabase
supabase functions serve                        # Local edge function dev
supabase functions deploy <function-name>       # Deploy single edge function
supabase db push                                # Push migrations
supabase db diff --use-migra                    # Generate migration from schema diff
```

## Environment Variables

**Client-side (`.env`, `VITE_` prefix):**
- `VITE_SUPABASE_URL` — Supabase project URL
- `VITE_SUPABASE_ANON_KEY` — Supabase anonymous/public key
- `VITE_SENTRY_DSN` — Sentry error tracking DSN
- `VITE_STRIPE_PUBLISHABLE_KEY` — Stripe public key
- `VITE_VIDEO_SERVICE_URL` — Video generator service URL
- `VITE_HEYGEN_API_KEY` — HeyGen avatar video API key

**Edge function env vars (set in Supabase dashboard, not in `.env`):**
- `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` — auto-injected by Supabase
- `ANTHROPIC_API_KEY` — Claude API for AI features
- `OPENAI_API_KEY` — OpenAI for embeddings/completions
- `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET` — Stripe server-side

## Edge Function Pattern

Standard boilerplate for every new edge function:

```typescript
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }
  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    )
    const body = await req.json()
    // ... implementation
    return new Response(JSON.stringify({ success: true, data }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  } catch (error) {
    return new Response(JSON.stringify({ success: false, error: error.message }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500,
    })
  }
})
```

## API Documentation

The app includes a built-in API docs page at `/docs` powered by `src/lib/api-docs.ts`. This file defines all edge function endpoints with params, auth requirements, and response examples. When adding or modifying an edge function, update the corresponding entry in `api-docs.ts`.
