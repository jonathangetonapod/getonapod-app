import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const require = createRequire(import.meta.url)
const { loadModule, parseSync } = require('libpg-query')
const root = fileURLToPath(new URL('..', import.meta.url))

const SQL_INPUTS = [
  'supabase/migrations/20260720000100_invite_only_workspace_core.sql',
  'supabase/migrations/20260720000200_invite_only_workspace_rls.sql',
  'supabase/migrations/20260720000300_client_portal_security.sql',
  'supabase/migrations/20260720000400_resend_webhook_idempotency.sql',
  'supabase/tests/20260720_invite_only_workspace_verification.sql',
]

await loadModule()

const failures = []
for (const relativePath of SQL_INPUTS) {
  try {
    parseSync(readFileSync(path.join(root, relativePath), 'utf8'))
  } catch (error) {
    const message = error instanceof Error ? error.message.split('\n', 1)[0] : 'parse failed'
    failures.push(`${relativePath}: ${message}`)
  }
}

if (failures.length > 0) {
  process.stderr.write(`PostgreSQL grammar validation failed:\n${failures.join('\n')}\n`)
  process.exitCode = 1
} else {
  process.stdout.write(`PostgreSQL grammar validation passed; files=${SQL_INPUTS.length}\n`)
}
