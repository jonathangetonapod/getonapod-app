// Fails when a migration exposes a SECURITY DEFINER function to the browser.
//
// 20261011000500 revoked EXECUTE from PUBLIC, anon and authenticated on every
// SECURITY DEFINER function in public, except an allowlist, and changed the
// default privileges so new functions start with no EXECUTE for those roles.
// Default privileges only cover functions created by the migration role, so
// every later migration that creates a SECURITY DEFINER function must still
// revoke PUBLIC on it in the same file, or the function must be on that
// allowlist. A later GRANT of EXECUTE to anon or authenticated on a SECURITY
// DEFINER function is also refused unless the function is allowlisted.
//
// The allowlist is read from the newest migration that carries the
// security-definer-allowlist markers (20261011000600 replaced the baseline's,
// dropping cleanup_expired_portal_data and get_client_portal_stats). No later
// migration may restore EXECUTE for PUBLIC by default in public: per-schema
// default privileges add to the global ones, so a global GRANT would re-open
// every new public function to anon and authenticated.
import assert from 'node:assert/strict'
import { readdirSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = fileURLToPath(new URL('..', import.meta.url))
const migrationsDirectory = path.join(root, 'supabase/migrations')
const BASELINE = '20261011000500_security_definer_grants_and_confirmed_invites.sql'

const ALLOWLIST_MARKER = /-- security-definer-allowlist:start([\s\S]*?)-- security-definer-allowlist:end/u

export function readAllowlist(sql, fileName = BASELINE) {
  const block = sql.match(ALLOWLIST_MARKER)
  assert.ok(block, `${fileName} must mark its allowlist with security-definer-allowlist comments`)
  const names = [...block[1].replace(/--[^\n]*/gu, '').matchAll(/'([a-z0-9_]+)'/gu)].map((match) => match[1])
  assert.ok(names.length > 0, 'the SECURITY DEFINER allowlist must not be empty')
  return new Set(names)
}

function stripComments(sql) {
  return sql.replace(/--[^\n]*/gu, '').replace(/\/\*[\s\S]*?\*\//gu, '')
}

/** SECURITY DEFINER functions created in `sql`, by bare name. */
export function definerFunctions(sql) {
  const source = stripComments(sql)
  const names = new Set()
  const pattern = /CREATE\s+(?:OR\s+REPLACE\s+)?(?:FUNCTION|PROCEDURE)\s+(?:public\.)?"?([A-Za-z0-9_]+)"?\s*\(/giu
  for (const match of source.matchAll(pattern)) {
    const rest = source.slice(match.index + match[0].length)
    const bodyStart = rest.match(/\bAS\s+(\$[A-Za-z0-9_]*\$)/u)
    let header = rest.slice(0, bodyStart ? bodyStart.index : 4_000)
    if (bodyStart) {
      const tag = bodyStart[1]
      const afterTag = rest.indexOf(tag, bodyStart.index + bodyStart[0].length)
      if (afterTag > 0) {
        const statementEnd = rest.indexOf(';', afterTag + tag.length)
        header += rest.slice(afterTag, statementEnd > 0 ? statementEnd : undefined)
      }
    }
    if (/\bSECURITY\s+DEFINER\b/iu.test(header)) names.add(match[1].toLowerCase())
  }
  return names
}

/** Statements that would give PUBLIC (or anon/authenticated) EXECUTE on new public functions by default. */
export function defaultFunctionGrants(sql) {
  const source = stripComments(sql)
  const found = []
  const pattern = /ALTER\s+DEFAULT\s+PRIVILEGES\s+((?:FOR\s+(?:ROLE|USER)\s+[^;]*?\s+)?(?:IN\s+SCHEMA\s+([^;]*?)\s+)?)GRANT\s+(?:ALL(?:\s+PRIVILEGES)?|EXECUTE)\s+ON\s+(?:FUNCTIONS|ROUTINES)\s+TO\s+([^;]+);/giu
  for (const match of source.matchAll(pattern)) {
    const schemas = match[2]
    const grantees = match[3]
    const global = !schemas
    const inPublic = schemas && /(?:^|[\s,])"?public"?(?:$|[\s,])/iu.test(schemas)
    if (global && /\bPUBLIC\b/iu.test(grantees)) found.push(match[0].trim())
    else if (inPublic && /\b(?:PUBLIC|anon|authenticated)\b/iu.test(grantees)) found.push(match[0].trim())
  }
  return found
}

/** Functions whose EXECUTE is revoked from PUBLIC in `sql`. */
export function publicRevokes(sql) {
  const source = stripComments(sql)
  const names = new Set()
  const pattern = /REVOKE\s+(?:ALL(?:\s+PRIVILEGES)?|EXECUTE)\s+ON\s+(?:FUNCTION|PROCEDURE)\s+(?:public\.)?"?([A-Za-z0-9_]+)"?[^;]*?\bFROM\s+([^;]+);/giu
  for (const match of source.matchAll(pattern)) {
    if (/\bPUBLIC\b/iu.test(match[2])) names.add(match[1].toLowerCase())
  }
  return names
}

/** Functions granted EXECUTE to anon or authenticated in `sql`. */
export function browserGrants(sql) {
  const source = stripComments(sql)
  const names = new Set()
  const pattern = /GRANT\s+(?:ALL(?:\s+PRIVILEGES)?|EXECUTE)\s+ON\s+(?:FUNCTION|PROCEDURE)\s+(?:public\.)?"?([A-Za-z0-9_]+)"?[^;]*?\bTO\s+([^;]+);/giu
  for (const match of source.matchAll(pattern)) {
    if (/\b(?:anon|authenticated|PUBLIC)\b/iu.test(match[2])) names.add(match[1].toLowerCase())
  }
  return names
}

export function findViolations(fileName, sql, allowlist, knownDefiners) {
  const violations = []
  const created = definerFunctions(sql)
  const revoked = publicRevokes(sql)
  for (const name of created) {
    if (!allowlist.has(name) && !revoked.has(name)) {
      violations.push(`${fileName}: SECURITY DEFINER function ${name} must REVOKE EXECUTE ... FROM PUBLIC, anon, authenticated in the same migration, or be added to the allowlist in ${BASELINE}`)
    }
  }
  for (const name of browserGrants(sql)) {
    if ((created.has(name) || knownDefiners.has(name)) && !allowlist.has(name)) {
      violations.push(`${fileName}: SECURITY DEFINER function ${name} is granted to anon/authenticated but is not on the allowlist in ${BASELINE}`)
    }
  }
  return violations
}

// The checker's own behaviour, so a regex change cannot silently pass everything.
{
  const allow = new Set(['current_workspace_id'])
  const leaky = `CREATE OR REPLACE FUNCTION public.leaky(p UUID)\nRETURNS BOOLEAN\nLANGUAGE sql\nSECURITY DEFINER\nSET search_path = ''\nAS $$ SELECT true $$;`
  assert.equal(findViolations('x.sql', leaky, allow, new Set()).length, 1)
  const trailing = `CREATE FUNCTION public.trailing() RETURNS int AS $body$ SELECT 1 $body$ LANGUAGE sql SECURITY DEFINER;`
  assert.equal(findViolations('x.sql', trailing, allow, new Set()).length, 1)
  assert.equal(findViolations('x.sql', `${leaky}\nREVOKE ALL ON FUNCTION public.leaky(UUID) FROM PUBLIC, anon, authenticated;`, allow, new Set()).length, 0)
  const invoker = 'CREATE FUNCTION public.plain() RETURNS int LANGUAGE sql AS $$ SELECT 1 $$;'
  assert.equal(findViolations('x.sql', invoker, allow, new Set()).length, 0)
  const regrant = `${leaky}\nREVOKE ALL ON FUNCTION public.leaky(UUID) FROM PUBLIC;\nGRANT EXECUTE ON FUNCTION public.leaky(UUID) TO authenticated;`
  assert.equal(findViolations('x.sql', regrant, allow, new Set()).length, 1)
  assert.equal(findViolations('x.sql', 'GRANT EXECUTE ON FUNCTION public.current_workspace_id() TO authenticated;', allow, new Set(['current_workspace_id'])).length, 0)
  assert.equal(defaultFunctionGrants('ALTER DEFAULT PRIVILEGES GRANT EXECUTE ON FUNCTIONS TO PUBLIC;').length, 1)
  assert.equal(defaultFunctionGrants('ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT EXECUTE ON FUNCTIONS TO anon;').length, 1)
  assert.equal(defaultFunctionGrants('ALTER DEFAULT PRIVILEGES IN SCHEMA extensions GRANT EXECUTE ON FUNCTIONS TO PUBLIC;').length, 0)
  assert.equal(defaultFunctionGrants("EXECUTE format('ALTER DEFAULT PRIVILEGES IN SCHEMA %I GRANT EXECUTE ON FUNCTIONS TO PUBLIC', s);").length, 0)
  assert.equal(defaultFunctionGrants('ALTER DEFAULT PRIVILEGES REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC;').length, 0)
}

const files = readdirSync(migrationsDirectory).filter((name) => name.endsWith('.sql')).sort()
assert.ok(files.includes(BASELINE), `${BASELINE} must exist`)
const baselineSql = readFileSync(path.join(migrationsDirectory, BASELINE), 'utf8')
readAllowlist(baselineSql)
const allowlistFile = files.filter((name) => name >= BASELINE && ALLOWLIST_MARKER.test(readFileSync(path.join(migrationsDirectory, name), 'utf8'))).at(-1)
const allowlistSql = readFileSync(path.join(migrationsDirectory, allowlistFile), 'utf8')
const allowlist = readAllowlist(allowlistSql, allowlistFile)
if (allowlistFile !== BASELINE) {
  // A replacement allowlist must re-run the sweep that gives it effect.
  assert.match(allowlistSql, /WHERE n\.nspname = 'public'\s+AND p\.prosecdef/u, `${allowlistFile} must re-run the SECURITY DEFINER sweep with its allowlist`)
  assert.match(allowlistSql, /REVOKE EXECUTE ON FUNCTION %s FROM PUBLIC, anon, authenticated/u)
}

// The baseline itself must keep doing what the later checks rely on.
assert.match(baselineSql, /ALTER DEFAULT PRIVILEGES IN SCHEMA public\s+REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC, anon, authenticated;/u)
assert.match(baselineSql, /ALTER DEFAULT PRIVILEGES\s+REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC;/u)
assert.match(baselineSql, /WHERE n\.nspname = 'public'\s+AND p\.prosecdef/u)
assert.match(baselineSql, /REVOKE EXECUTE ON FUNCTION %s FROM PUBLIC, anon, authenticated/u)
assert.match(baselineSql, /GRANT EXECUTE ON FUNCTION %s TO service_role/u)
for (const required of ['current_workspace_id', 'can_access_workspace', 'is_platform_admin']) {
  assert.ok(allowlist.has(required), `the allowlist must keep ${required}`)
}
// Service-role only since 20261011000600; nothing in the browser calls them.
for (const retired of ['cleanup_expired_portal_data', 'get_client_portal_stats']) {
  assert.ok(!allowlist.has(retired), `${retired} must stay off the allowlist`)
}

const knownDefiners = new Set()
const violations = []
for (const name of files) {
  const sql = readFileSync(path.join(migrationsDirectory, name), 'utf8')
  for (const definer of definerFunctions(sql)) knownDefiners.add(definer)
  if (name <= BASELINE) continue
  violations.push(...findViolations(name, sql, allowlist, knownDefiners))
  for (const statement of defaultFunctionGrants(sql)) {
    violations.push(`${name}: ${statement.split(/\s+/u).join(' ')} would give every new function in public EXECUTE for the browser roles by default; grant per function instead`)
  }
}

if (violations.length) {
  console.error(violations.join('\n'))
  process.exit(1)
}

console.log(`SECURITY DEFINER grant check passed; allowlist=${allowlist.size} (${allowlistFile}), later migrations=${files.filter((name) => name > BASELINE).length}`)
