import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const source = readFileSync('supabase/functions/account-context/index.ts', 'utf8')
const dtoSource = readFileSync(
  'supabase/functions/_shared/accountContextDto.ts',
  'utf8',
)

assert.match(
  source,
  /const ACCOUNT_WORKSPACE_COLUMNS = \[[\s\S]*?'access_not_before_epoch'/u,
)
assert.match(source, /const ACCOUNT_WORKSPACE_COLUMNS = \[[\s\S]*?'logo_path'[\s\S]*?'logo_updated_at'/u)
assert.match(
  source,
  /const workspaceAccessNotBefore = Number\(workspace\.access_not_before_epoch\)/u,
)
assert.match(
  source,
  /Number\.isSafeInteger\(workspaceAccessNotBefore\)[\s\S]*?authContext\.tokenIssuedAt >= workspaceAccessNotBefore/u,
)
assert.match(
  source,
  /membership\.status === 'invited'[\s\S]*?else if \(!workspaceTokenIsFresh\)[\s\S]*?state = 'reauthentication_required'/u,
)
assert.match(
  source,
  /membership\.status === 'active'[\s\S]*?accessTokenIsFresh[\s\S]*?workspaceTokenIsFresh[\s\S]*?workspaceCredentialIsFresh\(authContext\)/u,
)

const workspaceProjection = dtoSource.match(
  /export function toAccountWorkspaceDto[\s\S]*?return \{([\s\S]*?)\n  \}\n\}/u,
)?.[1]
assert.ok(workspaceProjection, 'workspace DTO must use an explicit projection')
assert.doesNotMatch(workspaceProjection, /access_not_before_epoch/u)
assert.match(workspaceProjection, /logo_path: workspace\.logo_path/u)
assert.match(workspaceProjection, /logo_updated_at: workspace\.logo_updated_at/u)

process.stdout.write('Account Context workspace-epoch contract checks passed\n')
