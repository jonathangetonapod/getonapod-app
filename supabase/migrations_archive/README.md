# Archived migrations

These six files used to sit in `supabase/migrations/` without a timestamp
prefix. The Supabase CLI only runs files named `<timestamp>_name.sql`, so it
always skipped them: `supabase db reset` never applied them, and
`supabase db push` never recorded them. Their objects reached production
because someone ran them by hand in the SQL editor.

| File | Applied by hand | Now folded into |
| --- | --- | --- |
| `create_ecommerce_tables.sql` | Dec 2025 | `20250125000003_blog_system.sql` |
| `add_my_cost_to_premium_podcasts.sql` | Dec 2025 | `20250125000003_blog_system.sql` |
| `fix_premium_podcasts_public_access.sql` | Dec 2025 | `20250125000003_blog_system.sql` |
| `add_category_to_premium_podcasts.sql` | Dec 2025 | `20250125000003_blog_system.sql` |
| `create_onboarding_sessions.sql` | Apr 2026 | `20260322_matching_experiments.sql` |
| `fix_onboarding_sessions_cascade_delete.sql` | Apr 2026 | `20260322_matching_experiments.sql` |

Their DDL now sits at the end of those numbered migrations, in idempotent form
(`CREATE TABLE IF NOT EXISTS`, `ADD COLUMN IF NOT EXISTS`, drop-then-create
policies and triggers, guarded `DO` blocks). A fresh database gets the objects,
and production is unaffected because it never re-runs a numbered migration.
Each folded block is marked with a `-- replay-safety:` comment.

`premium_podcasts` was never created by any migration. The folded definition
is inferred from the root-level `supabase-premium-podcasts-schema.sql` script,
plus the two `ALTER`s above.

Do not move these files back into `supabase/migrations/`. Do not give them
timestamps either: production would treat them as new, unapplied migrations.
They are kept only as a record of what was run by hand.
