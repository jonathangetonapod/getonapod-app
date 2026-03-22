---
paths:
  - "src/**/*.tsx"
  - "src/**/*.ts"
---

# Frontend Rules

- Use arrow function components, not `React.FC`
- Import with `@/` path alias (maps to `src/`)
- Use `interface` for object shapes, not `type`
- Error handling: `try/catch` in services, `toast()` from sonner for UI errors
- Async data: TanStack Query hooks in pages, raw `supabase` calls in services
- Never call external APIs (Anthropic, HeyGen, Podscan) directly from frontend — use edge functions
- Never store secrets in `VITE_` env vars (anon key and Stripe publishable key are exceptions)
- When calling edge functions, always include both `apikey` and `Authorization: Bearer` headers
- shadcn/ui components in `src/components/ui/` — never edit manually, use `npx shadcn-ui@latest add`
- Keep components under 200 lines unless justified
