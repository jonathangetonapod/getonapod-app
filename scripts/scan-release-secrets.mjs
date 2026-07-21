import { existsSync, readFileSync, readdirSync } from 'node:fs'
import path from 'node:path'
import process from 'node:process'
import { fileURLToPath, pathToFileURL } from 'node:url'

const root = fileURLToPath(new URL('..', import.meta.url))
const self = path.resolve(fileURLToPath(import.meta.url))

// Vite exposes every VITE_* value to untrusted browsers. Keep this list narrow and
// validate the Supabase public-key slot separately below.
const PUBLIC_BROWSER_ENV_NAMES = new Set([
  'VITE_APP_URL',
  'VITE_APP_VERSION',
  'VITE_SENTRY_DSN',
  'VITE_SENTRY_ENVIRONMENT',
  'VITE_SENTRY_RELEASE',
  'VITE_SUPABASE_ANON_KEY',
  'VITE_SUPABASE_PUBLISHABLE_KEY',
  'VITE_SUPABASE_URL',
])

const SENSITIVE_ASSIGNMENT_NAMES = [
  'ANTHROPIC_API_KEY',
  'BRIDGEKIT_SESSION_URL',
  'BRIDGEKIT_URL',
  'BRIDGEKIT_MCP_URL',
  'BRIDGEKIT_SESSION_TOKEN',
  'CAMPAIGN_WEBHOOK_SECRET',
  'CAMPAIGN_WEBHOOK_URL',
  'CLAY_WEBHOOK_SECRET',
  'CLAY_WEBHOOK_URL',
  'GOOGLE_CLIENT_SECRET',
  'GOOGLE_CLIENT_SECRETS',
  'GOOGLE_OAUTH_CLIENT_SECRET',
  'GOOGLE_PRIVATE_KEY',
  'GOOGLE_SERVICE_ACCOUNT_KEY',
  'JOTFORM_API_KEY',
  'JOTFORM_TOKEN',
  'OPENAI_API_KEY',
  'PODSCAN_API_KEY',
  'PODSCAN_TOKEN',
  'RESEND_API_KEY',
  'RESEND_WEBHOOK_SECRET',
  'SENTRY_AUTH_TOKEN',
  'STRIPE_API_KEY',
  'STRIPE_SECRET_KEY',
  'STRIPE_WEBHOOK_SECRET',
  'SUPABASE_SECRET_KEY',
  'SUPABASE_SERVICE_KEY',
  'SUPABASE_SERVICE_ROLE_JWT',
  'SUPABASE_SERVICE_ROLE_KEY',
  'client_secret',
  'private_key',
]

const SKIPPED_DIRECTORIES = new Set([
  '.git',
  '.vite',
  'coverage',
  'node_modules',
])

function walk(directory) {
  if (!existsSync(directory)) return []
  const files = []
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    if (entry.isDirectory() && SKIPPED_DIRECTORIES.has(entry.name)) continue
    const target = path.join(directory, entry.name)
    if (entry.isDirectory()) files.push(...walk(target))
    else if (entry.isFile()) files.push(target)
  }
  return files
}

function normalizeAssignedValue(value) {
  let normalized = value.trim().replace(/\s+#.*$/u, '').trim()
  const first = normalized.at(0)
  if ((first === '"' || first === "'" || first === '`') && normalized.at(-1) === first) {
    normalized = normalized.slice(1, -1).trim()
  }
  return normalized
}

function isPlaceholder(value) {
  const normalized = normalizeAssignedValue(value)
  if (!normalized) return true
  if (/^(?:0+|x+|\*+|-+|\.{3}|…+)$/iu.test(normalized)) return true
  if (/(?:\.{3}|…|<[^>]+>|\$\{)/u.test(normalized)) return true
  return /(?:^|[^a-z0-9])(?:example|placeholder|replace(?:[-_ ]?me)?|change[-_ ]?me|dummy|fake|mock|sample|test[-_ ]?only|your|redacted|not[-_ ]?set|unset|todo)(?:$|[^a-z0-9])/iu.test(normalized)
}

function jwtRole(value) {
  const parts = value.split('.')
  if (parts.length !== 3) return null
  try {
    const payload = JSON.parse(Buffer.from(parts[1], 'base64url').toString('utf8'))
    return typeof payload.role === 'string' ? payload.role : null
  } catch {
    return null
  }
}

function addLiteralPattern(findings, source, code, pattern, valueGroup = 0) {
  for (const match of source.matchAll(pattern)) {
    const value = match[valueGroup]
    if (!value || isPlaceholder(value)) continue
    findings.add(code)
    return
  }
}

function addBrowserEnvFindings(findings, source) {
  const names = new Set()
  const patterns = [
    /\b(?:import\.meta|process)\.env\.(VITE_[A-Z0-9_]+)\b/gu,
    /\b(?:import\.meta|process)\.env\[\s*["'](VITE_[A-Z0-9_]+)["']\s*\]/gu,
    /%(VITE_[A-Z0-9_]+)%/gu,
    /^\s*(?:export\s+)?(VITE_[A-Z0-9_]+)\s*=/gmu,
  ]

  for (const pattern of patterns) {
    for (const match of source.matchAll(pattern)) names.add(match[1])
  }
  for (const name of names) {
    if (!PUBLIC_BROWSER_ENV_NAMES.has(name)) findings.add('DISALLOWED_BROWSER_ENV')
  }

  const publicKeyAssignment = /^\s*(?:export\s+)?VITE_SUPABASE_(?:ANON|PUBLISHABLE)_KEY\s*=\s*([^#\r\n]*)/gimu
  for (const match of source.matchAll(publicKeyAssignment)) {
    const value = normalizeAssignedValue(match[1])
    if (!value || isPlaceholder(value)) continue
    const isLegacyAnon = jwtRole(value) === 'anon'
    const isPublishable = /^sb_publishable_[A-Za-z0-9_-]{20,}$/u.test(value)
    if (!isLegacyAnon && !isPublishable) findings.add('INVALID_PUBLIC_SUPABASE_KEY')
  }
}

export function findingsFor(source) {
  const findings = new Set()

  const literalPatterns = [
    ['OPENAI_API_KEY', /\bsk-(?:(?:proj|svcacct|admin)-[A-Za-z0-9_-]{20,}|[A-Za-z0-9]{24,})\b/gu],
    ['ANTHROPIC_API_KEY', /\bsk-ant-[A-Za-z0-9_-]{20,}\b/gu],
    ['SUPABASE_SECRET_KEY', /\bsb_secret_[A-Za-z0-9_-]{20,}\b/gu],
    ['RESEND_API_KEY', /\bre_[A-Za-z0-9][A-Za-z0-9_-]{20,}\b/gu],
    ['GOOGLE_OAUTH_CLIENT_SECRET', /\bGOCSPX-[A-Za-z0-9_-]{16,}\b/gu],
    ['STRIPE_SECRET_KEY', /\b(?:sk|rk)_(?:live|test)_[A-Za-z0-9]{16,}\b/gu],
    ['WEBHOOK_SIGNING_SECRET', /\bwhsec_[A-Za-z0-9_-]{16,}\b/gu],
    ['BRIDGEKIT_SESSION_TOKEN', /\bsess_[A-Za-z0-9_-]{20,}\b/gu],
    ['GITHUB_TOKEN', /\bgh[opusr]_[A-Za-z0-9]{20,}\b/gu],
    ['AWS_ACCESS_KEY', /\bAKIA[0-9A-Z]{16}\b/gu],
    ['PRIVATE_KEY_PEM', /-----BEGIN (?:RSA |EC |OPENSSH |ENCRYPTED )?PRIVATE KEY-----(?:(?:\r?\n)[A-Za-z0-9+/=\r\n]{32,}|(?:\\n)[A-Za-z0-9+/=\\n]{32,})/gu],
    ['CLAY_WEBHOOK_URL', /https:\/\/api\.clay\.com\/v3\/sources\/webhook\/[A-Za-z0-9_-]{16,}/gu],
    ['BRIDGEKIT_SESSION_URL', /https:\/\/getbridgekit\.com\/mcp\?[^\s"'<>]*\bsession_token=[A-Za-z0-9_-]{12,}/gu],
    ['CAMPAIGN_WEBHOOK_URL', /https?:\/\/[^\s"'<>]+\/campaign-reply-webhook(?:[/?#][^\s"'<>]*)?/giu],
  ]
  for (const [code, pattern] of literalPatterns) {
    addLiteralPattern(findings, source, code, pattern)
  }

  const assignmentNames = SENSITIVE_ASSIGNMENT_NAMES.join('|')
  const dotenvAssignment = new RegExp(
    String.raw`^\s*(?:export\s+)?(${assignmentNames})\s*=\s*([^\r\n]{8,})`,
    'gimu',
  )
  for (const match of source.matchAll(dotenvAssignment)) {
    if (!isPlaceholder(match[2])) findings.add(`LITERAL_${match[1].toUpperCase()}`)
  }

  const sourceAssignment = new RegExp(
    String.raw`(?:^|[,{;\s])["']?(${assignmentNames})["']?\s*[:=]\s*(["'\x60])([^\r\n"'\x60]{8,})\2`,
    'gimu',
  )
  for (const match of source.matchAll(sourceAssignment)) {
    if (!isPlaceholder(match[3])) findings.add(`LITERAL_${match[1].toUpperCase()}`)
  }

  const jwt = /\beyJ[A-Za-z0-9_-]{12,}\.[A-Za-z0-9_-]{12,}\.[A-Za-z0-9_-]{12,}\b/gu
  for (const match of source.matchAll(jwt)) {
    if (jwtRole(match[0]) === 'service_role') findings.add('SUPABASE_SERVICE_ROLE_JWT')
  }

  const bearer = /\bBearer\s+([A-Za-z0-9._~+/=-]{24,})/gu
  for (const match of source.matchAll(bearer)) {
    if (isPlaceholder(match[1]) || jwtRole(match[1]) === 'anon') continue
    findings.add('LITERAL_BEARER_TOKEN')
  }

  const querySecret = /[?&](?:api_?key|apikey|session_token|token|secret)=([A-Za-z0-9._~-]{16,})/giu
  for (const match of source.matchAll(querySecret)) {
    if (isPlaceholder(match[1]) || jwtRole(match[1]) === 'anon') continue
    findings.add('LITERAL_QUERY_SECRET')
  }

  addBrowserEnvFindings(findings, source)
  return [...findings].sort()
}

function makeJwt(role) {
  const encode = (value) => Buffer.from(JSON.stringify(value)).toString('base64url')
  return `${encode({ alg: 'HS256', typ: 'JWT' })}.${encode({ role })}.${'s'.repeat(43)}`
}

function joinToken(...parts) {
  return parts.join('')
}

function runSelfTests() {
  const positives = [
    ['OpenAI bundle literal', `const k="${joinToken('sk-', 'proj-', 'A'.repeat(40))}"`, 'OPENAI_API_KEY'],
    ['Placeholder substring cannot mask a token', `const k="${joinToken('sk-', 'AAAexampleBBB', 'A'.repeat(24))}"`, 'OPENAI_API_KEY'],
    ['Anthropic bundle literal', `const k="${joinToken('sk-', 'ant-api03-', 'B'.repeat(40))}"`, 'ANTHROPIC_API_KEY'],
    ['Supabase secret format', joinToken('sb_', 'secret_', 'C'.repeat(32)), 'SUPABASE_SECRET_KEY'],
    ['Supabase service JWT', makeJwt('service_role'), 'SUPABASE_SERVICE_ROLE_JWT'],
    ['Resend bundle literal', joinToken('re_', 'D'.repeat(32)), 'RESEND_API_KEY'],
    ['Google OAuth secret format', joinToken('GOCSPX-', 'E'.repeat(24)), 'GOOGLE_OAUTH_CLIENT_SECRET'],
    ['Google JSON client secret', `{"client_secret":"${'F'.repeat(32)}"}`, 'LITERAL_CLIENT_SECRET'],
    ['Google private key', joinToken('-----BEGIN ', 'PRIVATE KEY-----\\n', 'G'.repeat(40)), 'PRIVATE_KEY_PEM'],
    ['BridgeKit session token', joinToken('sess_', 'H'.repeat(40)), 'BRIDGEKIT_SESSION_TOKEN'],
    ['BridgeKit session URL', `https://getbridgekit.com/mcp?session_token=${'I'.repeat(32)}`, 'BRIDGEKIT_SESSION_URL'],
    ['Clay webhook URL', `https://api.clay.com/v3/sources/webhook/${'J'.repeat(32)}`, 'CLAY_WEBHOOK_URL'],
    ['Campaign webhook secret', `CAMPAIGN_WEBHOOK_SECRET=${'K'.repeat(32)}`, 'LITERAL_CAMPAIGN_WEBHOOK_SECRET'],
    ['Campaign webhook URL', `https://project.supabase.co/functions/v1/campaign-reply-webhook?token=${'L'.repeat(32)}`, 'CAMPAIGN_WEBHOOK_URL'],
    ['Stripe API secret', joinToken('sk_', 'live_', 'M'.repeat(24)), 'STRIPE_SECRET_KEY'],
    ['Stripe webhook secret', joinToken('whsec_', 'N'.repeat(24)), 'WEBHOOK_SIGNING_SECRET'],
    ['Podscan arbitrary token assignment', `PODSCAN_TOKEN="${'P'.repeat(32)}"`, 'LITERAL_PODSCAN_TOKEN'],
    ['Podscan bundled bearer', `authorization:"Bearer ${'Q'.repeat(32)}"`, 'LITERAL_BEARER_TOKEN'],
    ['Jotform arbitrary key assignment', `JOTFORM_API_KEY="${'R'.repeat(32)}"`, 'LITERAL_JOTFORM_API_KEY'],
    ['Jotform bundled query key', `https://api.jotform.com/form?apiKey=${'S'.repeat(32)}`, 'LITERAL_QUERY_SECRET'],
    ['Disallowed Vite source variable', 'const key = import.meta.env.VITE_HEYGEN_API_KEY', 'DISALLOWED_BROWSER_ENV'],
    ['Disallowed Vite dotenv placeholder', 'VITE_STRIPE_SECRET_KEY=your-placeholder', 'DISALLOWED_BROWSER_ENV'],
    ['Invalid Supabase public slot', `VITE_SUPABASE_ANON_KEY=${'T'.repeat(32)}`, 'INVALID_PUBLIC_SUPABASE_KEY'],
  ]

  const failures = []
  for (const [name, source, expected] of positives) {
    const actual = findingsFor(source)
    if (!actual.includes(expected)) failures.push(`${name}: expected category was not detected`)
  }

  const publicAnonJwt = makeJwt('anon')
  const negatives = [
    ['Named placeholders', [
      'OPENAI_API_KEY=your-openai-key',
      'ANTHROPIC_API_KEY=<replace-me>',
      'PODSCAN_TOKEN=${PODSCAN_TOKEN}',
      'JOTFORM_API_KEY=placeholder',
      'CAMPAIGN_WEBHOOK_SECRET=change-me',
      'const key="sk-proj-placeholder-placeholder-placeholder"',
    ].join('\n')],
    ['Public browser allowlist', [
      'VITE_SUPABASE_URL=https://project.supabase.co',
      `VITE_SUPABASE_ANON_KEY=${publicAnonJwt}`,
      `VITE_SUPABASE_PUBLISHABLE_KEY=${joinToken('sb_', 'publishable_', 'U'.repeat(32))}`,
      'VITE_APP_URL=https://app.example.org',
      'VITE_APP_VERSION=release-2026-07-21',
      'VITE_SENTRY_DSN=https://public@example.ingest.sentry.io/1',
      'VITE_SENTRY_ENVIRONMENT=staging',
      'VITE_SENTRY_RELEASE=release-2026-07-21',
    ].join('\n')],
    ['Public identifiers', [
      'const googleClientId="123.apps.googleusercontent.com"',
      `const stripePublishable="${joinToken('pk_', 'live_', 'V'.repeat(24))}"`,
      `Authorization: Bearer ${publicAnonJwt}`,
    ].join('\n')],
  ]
  for (const [name, source] of negatives) {
    const actual = findingsFor(source)
    if (actual.length > 0) failures.push(`${name}: unexpected category detected (${actual.join(',')})`)
  }

  if (failures.length > 0) {
    process.stderr.write(`release secret scan self-test failed (values suppressed):\n${failures.join('\n')}\n`)
    process.exitCode = 1
    return false
  }
  process.stdout.write(`release secret scan self-test passed; positive_cases=${positives.length}; negative_cases=${negatives.length}\n`)
  return true
}

function runRepositoryScan() {
  const candidates = walk(root)
    .map((file) => path.resolve(file))
    .filter((file) => file !== self)
    .sort()
  const failures = []

  for (const file of candidates) {
    let buffer
    try {
      buffer = readFileSync(file)
    } catch {
      failures.push(`${path.relative(root, file)}: SCAN_READ_ERROR`)
      continue
    }
    if (buffer.includes(0)) continue
    const codes = findingsFor(buffer.toString('utf8'))
    if (codes.length > 0) failures.push(`${path.relative(root, file)}: ${codes.join(',')}`)
  }

  if (failures.length > 0) {
    process.stderr.write(`release secret scan failed (values suppressed):\n${failures.join('\n')}\n`)
    process.exitCode = 1
  } else {
    process.stdout.write(`release secret scan passed; files=${candidates.length}\n`)
  }
}

const invokedPath = process.argv[1] ? pathToFileURL(path.resolve(process.argv[1])).href : ''
if (invokedPath === import.meta.url) {
  if (process.argv.includes('--self-test')) runSelfTests()
  else if (runSelfTests()) runRepositoryScan()
}
