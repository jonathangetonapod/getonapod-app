import { createHash, randomBytes } from 'node:crypto'
import { execFileSync } from 'node:child_process'
import {
  closeSync,
  constants as fsConstants,
  fchmodSync,
  lstatSync,
  openSync,
  readFileSync,
  realpathSync,
  writeSync,
} from 'node:fs'
import { dirname, isAbsolute, relative, resolve, sep } from 'node:path'
import { fileURLToPath } from 'node:url'

/*
 * This is an intentionally black-box staging runner. It never reads .env files
 * and never accepts a service-role credential. Example confirmation format:
 *
 *   ACCEPTANCE_CONFIRM=RUN_SYNTHETIC_TESTS_ON_<ACCEPTANCE_EXPECTED_PROJECT_REF>
 *
 * All values must be supplied through dedicated ACCEPTANCE_* process variables.
 */

type JsonRecord = Record<string, unknown>
type EvidenceStatus = 'info' | 'pass' | 'fail' | 'skipped' | 'incomplete'
type ReleaseGate = 'complete' | 'incomplete' | 'optional'

interface AcceptanceConfig {
  supabaseUrl: URL
  anonKey: string
  projectRef: string
  runId: string
  evidencePath: string
  alice: AccountCredentials
  bob: AccountCredentials
  admin: AccountCredentials | null
}

interface ReleaseIntegrity {
  branch: string
  commit: string
  inputSha256: string
}

interface AccountCredentials {
  email: string
  password: string
}

interface AuthSession extends AccountCredentials {
  accessToken: string
  expiresAt: number
  workspaceId: string
  membershipId: string
}

interface AdminSession extends AccountCredentials {
  accessToken: string
  expiresAt: number
}

interface WorkspaceClientRow extends JsonRecord {
  id: string
  workspace_id: string
  name: string
  email: string | null
  contact_person: string | null
  linkedin_url: string | null
  website: string | null
  status: 'active' | 'paused' | 'churned'
  notes: string | null
  created_at: string
  updated_at: string
}

interface ClientPayload {
  name: string
  email: string
  contact_person: null
  linkedin_url: null
  website: null
  status: 'active' | 'paused' | 'churned'
  notes: string
}

interface HttpResult {
  status: number
  json: unknown
}

interface EdgeManifest {
  retired_http_410_functions: string[]
  unauthenticated_tombstone_probes: string[]
  excluded_from_tenant_environment: Array<{ name: string }>
}

interface EvidenceRecord {
  schema_version?: 1
  timestamp: string
  test: string
  status: EvidenceStatus
  code?: string
  http_status?: number
  release_gate?: ReleaseGate
  environment?: 'staging'
  raw_outputs_retained?: false
  release_branch?: string
  release_commit?: string
  release_inputs_sha256?: string
  target_project_sha256?: string
  run_id_sha256?: string
}

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
const PROJECT_REF_PATTERN = /^[a-z0-9]{8,64}$/
const RUN_ID_PATTERN = /^[a-z0-9][a-z0-9-]{6,47}$/
const EDGE_FUNCTION_NAME_PATTERN = /^[a-z0-9][a-z0-9-]{0,62}$/
const SAFE_LABEL_PATTERN = /^[A-Za-z0-9_.:-]{1,160}$/
const MAX_RESPONSE_BYTES = 1_048_576
const REQUEST_TIMEOUT_MS = 30_000
const RELEASE_BRANCH = 'feat/invite-only-workspaces'
const RELEASE_INPUT_PATHS = [
  'docs/invite-only-edge-manifest.json',
  'scripts/staging-acceptance.ts',
  'supabase/migrations/20260720000100_invite_only_workspace_core.sql',
  'supabase/migrations/20260720000200_invite_only_workspace_rls.sql',
  'supabase/migrations/20260720000300_client_portal_security.sql',
  'supabase/migrations/20260720000400_resend_webhook_idempotency.sql',
  'supabase/tests/20260720_invite_only_workspace_verification.sql',
] as const
const ACCEPTANCE_ENV_ALLOWLIST = new Set([
  'ACCEPTANCE_ADMIN_EMAIL',
  'ACCEPTANCE_ADMIN_PASSWORD',
  'ACCEPTANCE_ALICE_EMAIL',
  'ACCEPTANCE_ALICE_PASSWORD',
  'ACCEPTANCE_BOB_EMAIL',
  'ACCEPTANCE_BOB_PASSWORD',
  'ACCEPTANCE_CONFIRM',
  'ACCEPTANCE_EVIDENCE_PATH',
  'ACCEPTANCE_EXPECTED_PROJECT_REF',
  'ACCEPTANCE_PRODUCTION_PROJECT_REFS',
  'ACCEPTANCE_RUN_ID',
  'ACCEPTANCE_SUPABASE_ANON_KEY',
  'ACCEPTANCE_SUPABASE_URL',
])
const SAFE_CLIENT_KEYS = new Set([
  'id',
  'workspace_id',
  'name',
  'email',
  'contact_person',
  'linkedin_url',
  'website',
  'status',
  'notes',
  'created_at',
  'updated_at',
])

class SafeFailure extends Error {
  readonly code: string
  readonly httpStatus?: number

  constructor(code: string, httpStatus?: number) {
    super(code)
    this.name = 'SafeFailure'
    this.code = code
    this.httpStatus = httpStatus
  }
}

class ConfigurationFailure extends Error {
  constructor() {
    super('Acceptance configuration is invalid')
    this.name = 'ConfigurationFailure'
  }
}

class EvidenceWriter {
  private readonly descriptor: number
  private closed = false

  constructor(path: string) {
    this.descriptor = openSync(
      path,
      fsConstants.O_CREAT | fsConstants.O_EXCL | fsConstants.O_WRONLY,
      0o600,
    )
    fchmodSync(this.descriptor, 0o600)
  }

  write(record: EvidenceRecord): void {
    if (this.closed) throw new SafeFailure('EVIDENCE_WRITER_CLOSED')
    if (!SAFE_LABEL_PATTERN.test(record.test)) throw new SafeFailure('UNSAFE_EVIDENCE_LABEL')
    if (record.code && !SAFE_LABEL_PATTERN.test(record.code)) {
      throw new SafeFailure('UNSAFE_EVIDENCE_CODE')
    }
    if (record.release_branch && record.release_branch !== RELEASE_BRANCH) {
      throw new SafeFailure('UNSAFE_RELEASE_BRANCH')
    }
    if (record.release_commit && !/^[0-9a-f]{40,64}$/.test(record.release_commit)) {
      throw new SafeFailure('UNSAFE_RELEASE_COMMIT')
    }
    if (record.release_inputs_sha256 && !/^[0-9a-f]{64}$/.test(record.release_inputs_sha256)) {
      throw new SafeFailure('UNSAFE_RELEASE_INPUT_DIGEST')
    }
    if (record.target_project_sha256 && !/^[0-9a-f]{64}$/.test(record.target_project_sha256)) {
      throw new SafeFailure('UNSAFE_TARGET_PROJECT_DIGEST')
    }
    if (record.run_id_sha256 && !/^[0-9a-f]{64}$/.test(record.run_id_sha256)) {
      throw new SafeFailure('UNSAFE_RUN_ID_DIGEST')
    }
    writeSync(this.descriptor, `${JSON.stringify(record)}\n`)
  }

  close(): void {
    if (this.closed) return
    this.closed = true
    closeSync(this.descriptor)
  }
}

class Harness {
  readonly evidence: EvidenceWriter
  failures = 0
  incompleteGates = 0
  passes = 0

  constructor(evidence: EvidenceWriter) {
    this.evidence = evidence
  }

  private record(
    test: string,
    status: EvidenceStatus,
    options: { code?: string; httpStatus?: number; releaseGate?: ReleaseGate } = {},
  ): void {
    this.evidence.write({
      timestamp: new Date().toISOString(),
      test,
      status,
      code: options.code,
      http_status: options.httpStatus,
      release_gate: options.releaseGate,
    })
    process.stdout.write(`${status.toUpperCase()} ${test}\n`)
  }

  async must<T>(test: string, action: () => Promise<T>): Promise<T> {
    try {
      const value = await action()
      this.passes += 1
      this.record(test, 'pass')
      return value
    } catch (error) {
      this.failures += 1
      const failure = safeFailure(error)
      this.record(test, 'fail', { code: failure.code, httpStatus: failure.httpStatus })
      throw failure
    }
  }

  async check(test: string, action: () => Promise<void>): Promise<boolean> {
    try {
      await action()
      this.passes += 1
      this.record(test, 'pass')
      return true
    } catch (error) {
      this.failures += 1
      const failure = safeFailure(error)
      this.record(test, 'fail', { code: failure.code, httpStatus: failure.httpStatus })
      return false
    }
  }

  optionalSkip(test: string, code: string): void {
    this.record(test, 'skipped', { code, releaseGate: 'optional' })
  }

  incomplete(test: string, code: string): void {
    this.incompleteGates += 1
    this.record(test, 'incomplete', { code, releaseGate: 'incomplete' })
  }

  summary(): void {
    const status: EvidenceStatus = this.failures > 0 ? 'fail' : 'incomplete'
    this.record('run.summary', status, {
      code: this.failures > 0 ? 'STAGING_ACCEPTANCE_FAILED' : 'MANUAL_GATES_REMAIN',
      releaseGate: 'incomplete',
    })
  }
}

function safeFailure(error: unknown): SafeFailure {
  return error instanceof SafeFailure ? error : new SafeFailure('UNEXPECTED_FAILURE')
}

function assertSafe(condition: unknown, code: string, httpStatus?: number): asserts condition {
  if (!condition) throw new SafeFailure(code, httpStatus)
}

function asRecord(value: unknown): JsonRecord | null {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? value as JsonRecord
    : null
}

function requiredEnvironment(name: string, preserveWhitespace = false): string {
  const value = process.env[name]
  if (value === undefined || value.length === 0) throw new ConfigurationFailure()
  const normalized = preserveWhitespace ? value : value.trim()
  if (normalized.length === 0) throw new ConfigurationFailure()
  return normalized
}

function optionalEnvironment(name: string, preserveWhitespace = false): string | null {
  const value = process.env[name]
  if (value === undefined || value.length === 0) return null
  const normalized = preserveWhitespace ? value : value.trim()
  return normalized.length > 0 ? normalized : null
}

function validateBrowserKey(key: string): void {
  if (key.startsWith('sb_secret_')) throw new ConfigurationFailure()
  if (key.startsWith('sb_publishable_') && key.length >= 24) return

  const parts = key.split('.')
  if (parts.length !== 3) throw new ConfigurationFailure()
  try {
    const payload = JSON.parse(Buffer.from(parts[1], 'base64url').toString('utf8')) as unknown
    if (asRecord(payload)?.role !== 'anon') throw new ConfigurationFailure()
  } catch {
    throw new ConfigurationFailure()
  }
}

function validateEmail(value: string): string {
  const email = value.trim().toLowerCase()
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254) {
    throw new ConfigurationFailure()
  }
  return email
}

function pathIsWithin(parent: string, candidate: string): boolean {
  const pathFromParent = relative(parent, candidate)
  return pathFromParent === '' || (
    pathFromParent !== '..'
    && !pathFromParent.startsWith(`..${sep}`)
    && !isAbsolute(pathFromParent)
  )
}

function repositoryRoot(): string {
  return realpathSync(fileURLToPath(new URL('..', import.meta.url)))
}

function validateEvidencePath(path: string): string {
  if (!isAbsolute(path)) throw new ConfigurationFailure()
  const repoRoot = repositoryRoot()
  const evidenceParent = realpathSync(dirname(path))
  if (pathIsWithin(repoRoot, evidenceParent)) throw new ConfigurationFailure()
  return path
}

function gitOutput(repoRoot: string, args: string[]): string {
  try {
    const pathValue = process.env.PATH
    assertSafe(typeof pathValue === 'string' && pathValue.length > 0, 'SOURCE_INTEGRITY_REFUSED')
    return execFileSync('git', args, {
      cwd: repoRoot,
      encoding: 'utf8',
      env: {
        GIT_OPTIONAL_LOCKS: '0',
        GIT_TERMINAL_PROMPT: '0',
        LANG: 'C',
        LC_ALL: 'C',
        PATH: pathValue,
      },
      maxBuffer: 1_048_576,
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim()
  } catch {
    throw new SafeFailure('SOURCE_INTEGRITY_REFUSED')
  }
}

function releaseInputDigest(repoRoot: string): string {
  const digest = createHash('sha256')
  for (const relativePath of RELEASE_INPUT_PATHS) {
    const absolutePath = resolve(repoRoot, relativePath)
    let contents: Buffer
    try {
      assertSafe(lstatSync(absolutePath).isFile(), 'SOURCE_INTEGRITY_REFUSED')
      contents = readFileSync(absolutePath)
    } catch (error) {
      if (error instanceof SafeFailure) throw error
      throw new SafeFailure('SOURCE_INTEGRITY_REFUSED')
    }
    const pathBytes = Buffer.from(relativePath, 'utf8')
    const header = Buffer.allocUnsafe(8)
    header.writeUInt32BE(pathBytes.byteLength, 0)
    header.writeUInt32BE(contents.byteLength, 4)
    digest.update(header)
    digest.update(pathBytes)
    digest.update(contents)
  }
  return digest.digest('hex')
}

function verifyReleaseIntegrity(): ReleaseIntegrity {
  const repoRoot = repositoryRoot()
  const discoveredRoot = realpathSync(gitOutput(repoRoot, ['rev-parse', '--show-toplevel']))
  assertSafe(discoveredRoot === repoRoot, 'SOURCE_INTEGRITY_REFUSED')

  const branch = gitOutput(repoRoot, ['symbolic-ref', '--quiet', '--short', 'HEAD'])
  assertSafe(branch === RELEASE_BRANCH, 'SOURCE_INTEGRITY_REFUSED')
  const commit = gitOutput(repoRoot, ['rev-parse', '--verify', 'HEAD^{commit}']).toLowerCase()
  assertSafe(/^[0-9a-f]{40,64}$/.test(commit), 'SOURCE_INTEGRITY_REFUSED')
  assertSafe(
    gitOutput(repoRoot, ['status', '--porcelain=v1', '--untracked-files=all', '--ignore-submodules=none']) === '',
    'SOURCE_WORKTREE_NOT_CLEAN',
  )
  gitOutput(repoRoot, ['ls-files', '--error-unmatch', '--', ...RELEASE_INPUT_PATHS])
  for (const relativePath of RELEASE_INPUT_PATHS) {
    const worktreeBlob = gitOutput(repoRoot, [
      'hash-object',
      `--path=${relativePath}`,
      '--',
      relativePath,
    ])
    const committedBlob = gitOutput(repoRoot, ['rev-parse', `HEAD:${relativePath}`])
    assertSafe(worktreeBlob === committedBlob, 'SOURCE_INPUT_NOT_COMMITTED')
  }

  const inputSha256 = releaseInputDigest(repoRoot)
  assertSafe(
    gitOutput(repoRoot, ['status', '--porcelain=v1', '--untracked-files=all', '--ignore-submodules=none']) === '',
    'SOURCE_WORKTREE_CHANGED_DURING_DIGEST',
  )
  assertSafe(
    gitOutput(repoRoot, ['rev-parse', '--verify', 'HEAD^{commit}']).toLowerCase() === commit,
    'SOURCE_COMMIT_CHANGED_DURING_DIGEST',
  )
  return { branch, commit, inputSha256 }
}

function readConfiguration(): AcceptanceConfig {
  if (
    Object.keys(process.env).some((name) => (
      name.startsWith('ACCEPTANCE_') && !ACCEPTANCE_ENV_ALLOWLIST.has(name)
    ))
  ) {
    throw new ConfigurationFailure()
  }

  const projectRef = requiredEnvironment('ACCEPTANCE_EXPECTED_PROJECT_REF').toLowerCase()
  if (!PROJECT_REF_PATTERN.test(projectRef)) throw new ConfigurationFailure()

  const productionRefs = requiredEnvironment('ACCEPTANCE_PRODUCTION_PROJECT_REFS')
    .split(',')
    .map((value) => value.trim().toLowerCase())
    .filter(Boolean)
  if (
    productionRefs.length === 0
    || productionRefs.some((value) => !PROJECT_REF_PATTERN.test(value))
    || productionRefs.includes(projectRef)
  ) {
    throw new ConfigurationFailure()
  }

  const confirmation = requiredEnvironment('ACCEPTANCE_CONFIRM')
  if (confirmation !== `RUN_SYNTHETIC_TESTS_ON_${projectRef}`) {
    throw new ConfigurationFailure()
  }

  const supabaseUrl = new URL(requiredEnvironment('ACCEPTANCE_SUPABASE_URL'))
  if (
    supabaseUrl.protocol !== 'https:'
    || supabaseUrl.hostname !== `${projectRef}.supabase.co`
    || supabaseUrl.username !== ''
    || supabaseUrl.password !== ''
    || supabaseUrl.port !== ''
    || supabaseUrl.pathname !== '/'
    || supabaseUrl.search !== ''
    || supabaseUrl.hash !== ''
  ) {
    throw new ConfigurationFailure()
  }

  const anonKey = requiredEnvironment('ACCEPTANCE_SUPABASE_ANON_KEY')
  validateBrowserKey(anonKey)

  const runId = requiredEnvironment('ACCEPTANCE_RUN_ID').toLowerCase()
  if (!RUN_ID_PATTERN.test(runId)) throw new ConfigurationFailure()

  const alice: AccountCredentials = {
    email: validateEmail(requiredEnvironment('ACCEPTANCE_ALICE_EMAIL')),
    password: requiredEnvironment('ACCEPTANCE_ALICE_PASSWORD', true),
  }
  const bob: AccountCredentials = {
    email: validateEmail(requiredEnvironment('ACCEPTANCE_BOB_EMAIL')),
    password: requiredEnvironment('ACCEPTANCE_BOB_PASSWORD', true),
  }
  if (alice.email === bob.email) throw new ConfigurationFailure()

  const adminEmail = optionalEnvironment('ACCEPTANCE_ADMIN_EMAIL')
  const adminPassword = optionalEnvironment('ACCEPTANCE_ADMIN_PASSWORD', true)
  if ((adminEmail === null) !== (adminPassword === null)) throw new ConfigurationFailure()
  const admin = adminEmail && adminPassword
    ? { email: validateEmail(adminEmail), password: adminPassword }
    : null
  if (admin && (admin.email === alice.email || admin.email === bob.email)) {
    throw new ConfigurationFailure()
  }

  return {
    supabaseUrl,
    anonKey,
    projectRef,
    runId,
    evidencePath: validateEvidencePath(requiredEnvironment('ACCEPTANCE_EVIDENCE_PATH')),
    alice,
    bob,
    admin,
  }
}

function readManifest(): EdgeManifest {
  let parsed: unknown
  try {
    parsed = JSON.parse(readFileSync(
      new URL('../docs/invite-only-edge-manifest.json', import.meta.url),
      'utf8',
    ))
  } catch {
    throw new SafeFailure('EDGE_MANIFEST_UNREADABLE')
  }

  const manifest = asRecord(parsed)
  const retired = manifest?.retired_http_410_functions
  const unauthenticated = manifest?.unauthenticated_tombstone_probes
  const excluded = manifest?.excluded_from_tenant_environment
  assertSafe(Array.isArray(retired) && retired.length === 17, 'EDGE_MANIFEST_INVALID')
  assertSafe(Array.isArray(unauthenticated) && unauthenticated.length === 5, 'EDGE_MANIFEST_INVALID')
  assertSafe(Array.isArray(excluded) && excluded.length === 2, 'EDGE_MANIFEST_INVALID')
  assertSafe(
    retired.every((value) => typeof value === 'string' && EDGE_FUNCTION_NAME_PATTERN.test(value)),
    'EDGE_MANIFEST_INVALID',
  )
  assertSafe(
    unauthenticated.every((value) => (
      typeof value === 'string' && EDGE_FUNCTION_NAME_PATTERN.test(value)
    )),
    'EDGE_MANIFEST_INVALID',
  )
  assertSafe(
    excluded.every((value) => {
      const name = asRecord(value)?.name
      return typeof name === 'string' && EDGE_FUNCTION_NAME_PATTERN.test(name)
    }),
    'EDGE_MANIFEST_INVALID',
  )

  const retiredFunctions = retired as string[]
  const unauthenticatedFunctions = unauthenticated as string[]
  const excludedFunctions = (excluded as JsonRecord[]).map((value) => ({ name: value.name as string }))
  assertSafe(new Set(retiredFunctions).size === retiredFunctions.length, 'EDGE_MANIFEST_INVALID')
  assertSafe(
    new Set(unauthenticatedFunctions).size === unauthenticatedFunctions.length,
    'EDGE_MANIFEST_INVALID',
  )
  assertSafe(
    new Set(excludedFunctions.map(({ name }) => name)).size === excludedFunctions.length,
    'EDGE_MANIFEST_INVALID',
  )
  assertSafe(
    unauthenticatedFunctions.every((name) => retiredFunctions.includes(name)),
    'EDGE_MANIFEST_INVALID',
  )
  assertSafe(
    excludedFunctions.some(({ name }) => name === 'create-outreach-message')
      && excludedFunctions.some(({ name }) => name === 'campaign-reply-webhook'),
    'EDGE_MANIFEST_INVALID',
  )

  return {
    retired_http_410_functions: retiredFunctions,
    unauthenticated_tombstone_probes: unauthenticatedFunctions,
    excluded_from_tenant_environment: excludedFunctions,
  }
}

async function readBoundedResponse(response: Response, maxBytes: number): Promise<unknown> {
  if (!response.body) return null
  const reader = response.body.getReader()
  const chunks: Uint8Array[] = []
  let total = 0
  try {
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      total += value.byteLength
      if (total > maxBytes) {
        await reader.cancel()
        throw new SafeFailure('RESPONSE_BODY_TOO_LARGE', response.status)
      }
      chunks.push(value)
    }
  } finally {
    reader.releaseLock()
  }

  if (total === 0) return null
  const bytes = new Uint8Array(total)
  let offset = 0
  for (const chunk of chunks) {
    bytes.set(chunk, offset)
    offset += chunk.byteLength
  }
  const text = new TextDecoder().decode(bytes)
  if (!text.trim()) return null
  try {
    return JSON.parse(text) as unknown
  } catch {
    return null
  }
}

async function boundedFetch(
  url: URL,
  init: RequestInit & { duplex?: 'half' },
  maxResponseBytes = MAX_RESPONSE_BYTES,
): Promise<HttpResult> {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS)
  try {
    const response = await fetch(url, {
      ...init,
      cache: 'no-store',
      redirect: 'error',
      signal: controller.signal,
    })
    return {
      status: response.status,
      json: await readBoundedResponse(response, maxResponseBytes),
    }
  } catch (error) {
    if (error instanceof SafeFailure) throw error
    throw new SafeFailure('NETWORK_REQUEST_FAILED')
  } finally {
    clearTimeout(timeout)
  }
}

async function callFunction(
  config: AcceptanceConfig,
  functionName: string,
  options: {
    token?: string
    method?: 'GET' | 'POST'
    jsonBody?: JsonRecord
    rawBody?: BodyInit
    extraHeaders?: Record<string, string>
    duplex?: 'half'
  } = {},
): Promise<HttpResult> {
  const url = new URL(`/functions/v1/${functionName}`, config.supabaseUrl)
  const headers: Record<string, string> = {
    Accept: 'application/json',
    apikey: config.anonKey,
    ...options.extraHeaders,
  }
  if (options.token) headers.Authorization = `Bearer ${options.token}`

  let body: BodyInit | undefined
  if (options.jsonBody !== undefined) {
    headers['Content-Type'] = 'application/json'
    body = JSON.stringify(options.jsonBody)
  } else if (options.rawBody !== undefined) {
    headers['Content-Type'] ??= 'application/json'
    body = options.rawBody
  }

  return await boundedFetch(url, {
    method: options.method ?? 'POST',
    headers,
    body,
    duplex: options.duplex,
  })
}

async function callRest(
  config: AcceptanceConfig,
  token: string,
  table: string,
  options: {
    method?: 'GET' | 'PATCH' | 'DELETE'
    query?: Record<string, string>
    body?: JsonRecord
  } = {},
): Promise<HttpResult> {
  const url = new URL(`/rest/v1/${table}`, config.supabaseUrl)
  for (const [key, value] of Object.entries(options.query ?? {})) {
    url.searchParams.set(key, value)
  }
  const headers: Record<string, string> = {
    Accept: 'application/json',
    apikey: config.anonKey,
    Authorization: `Bearer ${token}`,
    Prefer: 'return=representation',
  }
  let body: string | undefined
  if (options.body) {
    headers['Content-Type'] = 'application/json'
    body = JSON.stringify(options.body)
  }
  return await boundedFetch(url, {
    method: options.method ?? 'GET',
    headers,
    body,
  })
}

async function attemptPasswordSignIn(
  config: AcceptanceConfig,
  credentials: AccountCredentials,
): Promise<{ accessToken: string; expiresAt: number } | null> {
  const url = new URL('/auth/v1/token', config.supabaseUrl)
  url.searchParams.set('grant_type', 'password')
  const result = await boundedFetch(url, {
    method: 'POST',
    headers: {
      Accept: 'application/json',
      apikey: config.anonKey,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ email: credentials.email, password: credentials.password }),
  })
  if (result.status === 400 || result.status === 401 || result.status === 403) return null
  assertSafe(result.status === 200, 'AUTH_SIGN_IN_UNEXPECTED_STATUS', result.status)

  const response = asRecord(result.json)
  const accessToken = response?.access_token
  const expiresAtValue = response?.expires_at
  const expiresInValue = response?.expires_in
  assertSafe(
    typeof accessToken === 'string' && accessToken.length > 0 && accessToken.length <= 16_384,
    'AUTH_SIGN_IN_RESPONSE_INVALID',
  )
  const expiresAt = typeof expiresAtValue === 'number'
    ? expiresAtValue
    : typeof expiresInValue === 'number'
      ? Math.floor(Date.now() / 1000) + expiresInValue
      : Number.NaN
  assertSafe(
    Number.isFinite(expiresAt) && expiresAt > Math.floor(Date.now() / 1000) + 300,
    'AUTH_SESSION_TOO_SHORT',
  )
  return {
    accessToken,
    expiresAt,
  }
}

async function loadTenantSession(
  config: AcceptanceConfig,
  credentials: AccountCredentials,
): Promise<AuthSession> {
  const auth = await attemptPasswordSignIn(config, credentials)
  assertSafe(auth, 'TENANT_SIGN_IN_FAILED')
  const contextResult = await callFunction(config, 'account-context', {
    token: auth.accessToken,
    method: 'GET',
  })
  assertSafe(contextResult.status === 200, 'TENANT_CONTEXT_REJECTED', contextResult.status)
  const context = asRecord(contextResult.json)
  const workspace = asRecord(context?.workspace)
  const membership = asRecord(context?.membership)
  const user = asRecord(context?.user)
  assertSafe(context?.state === 'active', 'TENANT_CONTEXT_NOT_ACTIVE')
  assertSafe(context?.platform_admin === false, 'TENANT_CONTEXT_IS_ADMIN')
  assertSafe(user?.email === credentials.email, 'TENANT_CONTEXT_IDENTITY_MISMATCH')
  assertSafe(typeof workspace?.id === 'string' && UUID_PATTERN.test(workspace.id), 'TENANT_WORKSPACE_INVALID')
  assertSafe(workspace.status === 'active', 'TENANT_WORKSPACE_NOT_ACTIVE')
  assertSafe(workspace.is_default === false, 'TENANT_WORKSPACE_IS_DEFAULT')
  assertSafe(typeof membership?.id === 'string' && UUID_PATTERN.test(membership.id), 'TENANT_MEMBERSHIP_INVALID')
  assertSafe(membership.status === 'active', 'TENANT_MEMBERSHIP_NOT_ACTIVE')
  assertSafe(membership.role === 'owner', 'TENANT_MEMBERSHIP_NOT_OWNER')
  return {
    ...credentials,
    accessToken: auth.accessToken,
    expiresAt: auth.expiresAt,
    workspaceId: workspace.id,
    membershipId: membership.id,
  }
}

async function loadAdminSession(
  config: AcceptanceConfig,
  credentials: AccountCredentials,
): Promise<AdminSession> {
  const auth = await attemptPasswordSignIn(config, credentials)
  assertSafe(auth, 'ADMIN_SIGN_IN_FAILED')
  const contextResult = await callFunction(config, 'account-context', {
    token: auth.accessToken,
    method: 'GET',
  })
  assertSafe(contextResult.status === 200, 'ADMIN_CONTEXT_REJECTED', contextResult.status)
  const context = asRecord(contextResult.json)
  const user = asRecord(context?.user)
  assertSafe(context?.platform_admin === true, 'ADMIN_CONTEXT_NOT_PLATFORM_ADMIN')
  assertSafe(user?.email === credentials.email, 'ADMIN_CONTEXT_IDENTITY_MISMATCH')
  return {
    ...credentials,
    accessToken: auth.accessToken,
    expiresAt: auth.expiresAt,
  }
}

function expectStatus(result: HttpResult, expected: number, code: string): void {
  assertSafe(result.status === expected, code, result.status)
}

function parseWorkspaceClient(value: unknown): WorkspaceClientRow {
  const row = asRecord(value)
  assertSafe(row, 'CLIENT_RESPONSE_INVALID')
  assertSafe(
    Object.keys(row).every((key) => SAFE_CLIENT_KEYS.has(key)),
    'CLIENT_RESPONSE_NOT_NARROW',
  )
  assertSafe(typeof row.id === 'string' && UUID_PATTERN.test(row.id), 'CLIENT_RESPONSE_INVALID')
  assertSafe(
    typeof row.workspace_id === 'string' && UUID_PATTERN.test(row.workspace_id),
    'CLIENT_RESPONSE_INVALID',
  )
  assertSafe(typeof row.name === 'string', 'CLIENT_RESPONSE_INVALID')
  assertSafe(row.email === null || typeof row.email === 'string', 'CLIENT_RESPONSE_INVALID')
  assertSafe(row.contact_person === null || typeof row.contact_person === 'string', 'CLIENT_RESPONSE_INVALID')
  assertSafe(row.linkedin_url === null || typeof row.linkedin_url === 'string', 'CLIENT_RESPONSE_INVALID')
  assertSafe(row.website === null || typeof row.website === 'string', 'CLIENT_RESPONSE_INVALID')
  assertSafe(['active', 'paused', 'churned'].includes(String(row.status)), 'CLIENT_RESPONSE_INVALID')
  assertSafe(row.notes === null || typeof row.notes === 'string', 'CLIENT_RESPONSE_INVALID')
  assertSafe(typeof row.created_at === 'string' && typeof row.updated_at === 'string', 'CLIENT_RESPONSE_INVALID')
  return row as WorkspaceClientRow
}

async function listWorkspaceClients(
  config: AcceptanceConfig,
  session: AuthSession,
  workspaceId = session.workspaceId,
): Promise<WorkspaceClientRow[]> {
  const result = await callFunction(config, 'workspace-clients', {
    token: session.accessToken,
    jsonBody: { action: 'list', workspace_id: workspaceId },
  })
  expectStatus(result, 200, 'WORKSPACE_CLIENT_LIST_FAILED')
  const response = asRecord(result.json)
  assertSafe(Array.isArray(response?.clients), 'WORKSPACE_CLIENT_LIST_INVALID')
  return response.clients.map(parseWorkspaceClient)
}

async function createWorkspaceClient(
  config: AcceptanceConfig,
  session: AuthSession,
  payload: ClientPayload,
): Promise<WorkspaceClientRow> {
  const result = await callFunction(config, 'workspace-clients', {
    token: session.accessToken,
    jsonBody: {
      action: 'create',
      workspace_id: session.workspaceId,
      client: payload,
    },
  })
  expectStatus(result, 201, 'WORKSPACE_CLIENT_CREATE_FAILED')
  const client = parseWorkspaceClient(asRecord(result.json)?.client)
  assertSafe(client.workspace_id === session.workspaceId, 'CLIENT_WORKSPACE_MISMATCH')
  return client
}

async function callWorkspaceClientMutation(
  config: AcceptanceConfig,
  session: AuthSession,
  action: 'update' | 'delete',
  workspaceId: string,
  clientId: string,
  payload?: ClientPayload,
): Promise<HttpResult> {
  const jsonBody: JsonRecord = {
    action,
    workspace_id: workspaceId,
    client_id: clientId,
  }
  if (action === 'update') jsonBody.client = payload
  return await callFunction(config, 'workspace-clients', {
    token: session.accessToken,
    jsonBody,
  })
}

function clientSnapshot(client: WorkspaceClientRow): string {
  return JSON.stringify([
    client.id,
    client.workspace_id,
    client.name,
    client.email,
    client.contact_person,
    client.linkedin_url,
    client.website,
    client.status,
    client.notes,
    client.created_at,
    client.updated_at,
  ])
}

function findClient(clients: WorkspaceClientRow[], clientId: string): WorkspaceClientRow | null {
  return clients.find((client) => client.id === clientId) ?? null
}

function mutateUuid(uuid: string): string {
  const replacement = uuid.endsWith('0') ? '1' : '0'
  const mutated = `${uuid.slice(0, -1)}${replacement}`
  assertSafe(UUID_PATTERN.test(mutated) && mutated !== uuid, 'UUID_MUTATION_FAILED')
  return mutated
}

function expectDeniedOrEmpty(result: HttpResult, code: string): void {
  if (result.status === 403) return
  if (result.status === 200 && Array.isArray(result.json) && result.json.length === 0) return
  throw new SafeFailure(code, result.status)
}

function expectMutationDeniedOrEmpty(result: HttpResult, code: string): void {
  if (result.status === 403) return
  if ((result.status === 200 || result.status === 204) && (
    result.json === null || (Array.isArray(result.json) && result.json.length === 0)
  )) return
  throw new SafeFailure(code, result.status)
}

function syntheticPayload(runId: string, owner: 'alice' | 'bob'): ClientPayload {
  return {
    name: `GOAP acceptance ${owner} ${runId}`,
    email: `goap-acceptance-${owner}-${runId}@example.invalid`,
    contact_person: null,
    linkedin_url: null,
    website: null,
    status: 'active',
    notes: `acceptance:${runId}:${owner}`,
  }
}

function isSyntheticClient(
  client: WorkspaceClientRow,
  workspaceId: string,
  payload: ClientPayload,
): boolean {
  return client.workspace_id === workspaceId
    && client.name === payload.name
    && client.email === payload.email
    && client.contact_person === payload.contact_person
    && client.linkedin_url === payload.linkedin_url
    && client.website === payload.website
    && client.status === payload.status
    && client.notes === payload.notes
}

async function setPortalAccess(
  config: AcceptanceConfig,
  admin: AdminSession,
  clientId: string,
  enabled: boolean,
): Promise<void> {
  const result = await callRest(config, admin.accessToken, 'clients', {
    method: 'PATCH',
    query: { select: 'id,portal_access_enabled', id: `eq.${clientId}` },
    body: { portal_access_enabled: enabled },
  })
  expectStatus(result, 200, 'PORTAL_ACCESS_UPDATE_FAILED')
  assertSafe(Array.isArray(result.json) && result.json.length === 1, 'PORTAL_ACCESS_UPDATE_INVALID')
  const updated = asRecord(result.json[0])
  assertSafe(
    updated?.id === clientId && updated.portal_access_enabled === enabled,
    'PORTAL_ACCESS_UPDATE_INVALID',
  )
}

async function adminMembershipStatus(
  config: AcceptanceConfig,
  admin: AdminSession,
  membershipId: string,
): Promise<'active' | 'suspended'> {
  const result = await callFunction(config, 'manage-workspace-users', {
    token: admin.accessToken,
    jsonBody: { action: 'list' },
  })
  expectStatus(result, 200, 'ADMIN_MEMBERSHIP_LIST_FAILED')
  const users = asRecord(result.json)?.users
  assertSafe(Array.isArray(users), 'ADMIN_MEMBERSHIP_LIST_INVALID')
  const matches = users
    .map(asRecord)
    .filter((value): value is JsonRecord => value?.id === membershipId)
  assertSafe(matches.length === 1, 'ADMIN_MEMBERSHIP_NOT_FOUND')
  const status = matches[0].status
  assertSafe(status === 'active' || status === 'suspended', 'ADMIN_MEMBERSHIP_STATE_INVALID')
  return status
}

async function recoverSyntheticClient(
  config: AcceptanceConfig,
  session: AuthSession,
  payload: ClientPayload,
  ambiguityCode: string,
): Promise<WorkspaceClientRow | null> {
  let finalObservationWasEmpty = false
  let lastFailure: SafeFailure | null = null
  for (const delayMs of [0, 500, 1_000, 2_000, 4_000]) {
    if (delayMs > 0) await new Promise((resolve) => setTimeout(resolve, delayMs))
    try {
      const matches = (await listWorkspaceClients(config, session))
        .filter((client) => isSyntheticClient(client, session.workspaceId, payload))
      assertSafe(matches.length <= 1, ambiguityCode)
      if (matches.length === 1) return matches[0]
      finalObservationWasEmpty = true
    } catch (error) {
      const failure = safeFailure(error)
      if (failure.code === ambiguityCode) throw failure
      lastFailure = failure
      finalObservationWasEmpty = false
    }
  }
  if (finalObservationWasEmpty) return null
  throw lastFailure ?? new SafeFailure('CLEANUP_FIXTURE_DISCOVERY_FAILED')
}

async function deleteSyntheticClient(
  config: AcceptanceConfig,
  session: AuthSession,
  clientId: string,
): Promise<void> {
  let lastFailure: SafeFailure | null = null
  for (const delayMs of [0, 500, 1_500, 3_000]) {
    if (delayMs > 0) await new Promise((resolve) => setTimeout(resolve, delayMs))
    try {
      const result = await callWorkspaceClientMutation(
        config,
        session,
        'delete',
        session.workspaceId,
        clientId,
      )
      assertSafe(
        result.status === 200 || result.status === 404,
        'CLEANUP_CLIENT_DELETE_FAILED',
        result.status,
      )
      const remaining = await listWorkspaceClients(config, session)
      assertSafe(!findClient(remaining, clientId), 'CLEANUP_CLIENT_REMAINS')
      return
    } catch (error) {
      lastFailure = safeFailure(error)
    }
  }
  throw lastFailure ?? new SafeFailure('CLEANUP_CLIENT_DELETE_FAILED')
}

async function reconcileAliceLifecycle(
  config: AcceptanceConfig,
  admin: AdminSession,
  alice: AuthSession,
): Promise<AuthSession> {
  let lastFailure: SafeFailure | null = null
  for (const delayMs of [0, 500, 1_500, 3_000]) {
    if (delayMs > 0) await new Promise((resolve) => setTimeout(resolve, delayMs))
    try {
      const state = await adminMembershipStatus(config, admin, alice.membershipId)
      if (state === 'suspended') {
        const result = await callFunction(config, 'manage-workspace-users', {
          token: admin.accessToken,
          jsonBody: { action: 'reactivate', membership_id: alice.membershipId },
        })
        expectStatus(result, 200, 'CLEANUP_REACTIVATE_FAILED')
      }
      return await retryTenantSignIn(config, alice)
    } catch (error) {
      lastFailure = safeFailure(error)
    }
  }
  throw lastFailure ?? new SafeFailure('CLEANUP_LIFECYCLE_RECONCILIATION_FAILED')
}

async function retryTenantSignIn(
  config: AcceptanceConfig,
  current: AuthSession,
): Promise<AuthSession> {
  for (const delayMs of [0, 500, 1_000, 2_000]) {
    if (delayMs > 0) await new Promise((resolve) => setTimeout(resolve, delayMs))
    try {
      return await loadTenantSession(config, current)
    } catch {
      // Reactivation can take a moment to become visible to Auth.
    }
  }
  throw new SafeFailure('TENANT_REAUTHENTICATION_FAILED')
}

async function main(): Promise<number> {
  const config = readConfiguration()
  const manifest = readManifest()
  const release = verifyReleaseIntegrity()
  const evidence = new EvidenceWriter(config.evidencePath)
  const harness = new Harness(evidence)

  let alice: AuthSession | null = null
  let bob: AuthSession | null = null
  let admin: AdminSession | null = null
  let aliceClient: WorkspaceClientRow | null = null
  let bobClient: WorkspaceClientRow | null = null
  let aliceCreateMayHaveSucceeded = false
  let bobCreateMayHaveSucceeded = false
  let alicePortalPasswordTouched = false
  let alicePortalAccessTouched = false
  let aliceLifecycleTouched = false
  let fatal = false

  harness.evidence.write({
    schema_version: 1,
    timestamp: new Date().toISOString(),
    test: 'run.started',
    status: 'info',
    release_gate: 'incomplete',
    environment: 'staging',
    raw_outputs_retained: false,
    release_branch: release.branch,
    release_commit: release.commit,
    release_inputs_sha256: release.inputSha256,
    target_project_sha256: createHash('sha256')
      .update(`target-project\0${config.projectRef}`)
      .digest('hex'),
    run_id_sha256: createHash('sha256')
      .update(`acceptance-run\0${config.runId}`)
      .digest('hex'),
  })

  try {
    alice = await harness.must('auth.alice_active_context', async () => {
      return await loadTenantSession(config, config.alice)
    })
    bob = await harness.must('auth.bob_active_context', async () => {
      return await loadTenantSession(config, config.bob)
    })
    assertSafe(alice.workspaceId !== bob.workspaceId, 'TENANT_WORKSPACES_NOT_DISTINCT')
    assertSafe(alice.membershipId !== bob.membershipId, 'TENANT_MEMBERSHIPS_NOT_DISTINCT')

    if (config.admin) {
      admin = await harness.must('auth.admin_platform_context', async () => {
        return await loadAdminSession(config, config.admin as AccountCredentials)
      })
    } else {
      harness.incomplete('auth.admin_platform_context', 'ADMIN_CREDENTIALS_NOT_SUPPLIED')
    }

    await harness.must('fixtures.disposable_empty_workspaces', async () => {
      const [aliceRows, bobRows] = await Promise.all([
        listWorkspaceClients(config, alice as AuthSession),
        listWorkspaceClients(config, bob as AuthSession),
      ])
      const tagPrefix = `acceptance:${config.runId}:`
      assertSafe(
        aliceRows.length === 0 && bobRows.length === 0,
        'DEDICATED_TENANT_WORKSPACES_REQUIRED',
      )
      assertSafe(
        ![...aliceRows, ...bobRows].some((client) => client.notes?.startsWith(tagPrefix)),
        'RUN_TAG_ALREADY_EXISTS',
      )
    })

    const alicePayload = syntheticPayload(config.runId, 'alice')
    const bobPayload = syntheticPayload(config.runId, 'bob')
    aliceClient = await harness.must('fixtures.alice_client_create', async () => {
      aliceCreateMayHaveSucceeded = true
      return await createWorkspaceClient(config, alice as AuthSession, alicePayload)
    })
    bobClient = await harness.must('fixtures.bob_client_create', async () => {
      bobCreateMayHaveSucceeded = true
      return await createWorkspaceClient(config, bob as AuthSession, bobPayload)
    })

    const originalBobSnapshot = clientSnapshot(bobClient)
    await harness.check('isolation.workspace_lists', async () => {
      const [aliceRows, bobRows] = await Promise.all([
        listWorkspaceClients(config, alice as AuthSession),
        listWorkspaceClients(config, bob as AuthSession),
      ])
      assertSafe(findClient(aliceRows, (aliceClient as WorkspaceClientRow).id), 'ALICE_CLIENT_NOT_LISTED')
      assertSafe(!findClient(aliceRows, (bobClient as WorkspaceClientRow).id), 'BOB_CLIENT_LEAKED_TO_ALICE')
      assertSafe(findClient(bobRows, (bobClient as WorkspaceClientRow).id), 'BOB_CLIENT_NOT_LISTED')
      assertSafe(!findClient(bobRows, (aliceClient as WorkspaceClientRow).id), 'ALICE_CLIENT_LEAKED_TO_BOB')
    })

    await harness.check('isolation.edge_wrong_workspace_list', async () => {
      const result = await callFunction(config, 'workspace-clients', {
        token: (alice as AuthSession).accessToken,
        jsonBody: { action: 'list', workspace_id: (bob as AuthSession).workspaceId },
      })
      expectStatus(result, 403, 'WRONG_WORKSPACE_LIST_NOT_DENIED')
    })

    await harness.check('isolation.edge_cross_client_update', async () => {
      const result = await callWorkspaceClientMutation(
        config,
        alice as AuthSession,
        'update',
        (alice as AuthSession).workspaceId,
        (bobClient as WorkspaceClientRow).id,
        { ...alicePayload, name: `${alicePayload.name} cross-update` },
      )
      expectStatus(result, 404, 'CROSS_CLIENT_UPDATE_NOT_DENIED')
    })

    await harness.check('isolation.edge_cross_workspace_update', async () => {
      const result = await callWorkspaceClientMutation(
        config,
        alice as AuthSession,
        'update',
        (bob as AuthSession).workspaceId,
        (bobClient as WorkspaceClientRow).id,
        { ...alicePayload, name: `${alicePayload.name} wrong-workspace` },
      )
      expectStatus(result, 403, 'CROSS_WORKSPACE_UPDATE_NOT_DENIED')
    })

    await harness.check('isolation.edge_cross_client_delete', async () => {
      const result = await callWorkspaceClientMutation(
        config,
        alice as AuthSession,
        'delete',
        (alice as AuthSession).workspaceId,
        (bobClient as WorkspaceClientRow).id,
      )
      expectStatus(result, 404, 'CROSS_CLIENT_DELETE_NOT_DENIED')
    })

    await harness.check('isolation.edge_modified_uuid', async () => {
      const modifiedId = mutateUuid((bobClient as WorkspaceClientRow).id)
      const aliceRows = await listWorkspaceClients(config, alice as AuthSession)
      assertSafe(!findClient(aliceRows, modifiedId), 'MODIFIED_UUID_COLLIDES_WITH_ALICE_CLIENT')
      const update = await callWorkspaceClientMutation(
        config,
        alice as AuthSession,
        'update',
        (alice as AuthSession).workspaceId,
        modifiedId,
        { ...alicePayload, name: `${alicePayload.name} modified-uuid` },
      )
      expectStatus(update, 404, 'MODIFIED_UUID_UPDATE_NOT_DENIED')
      const deletion = await callWorkspaceClientMutation(
        config,
        alice as AuthSession,
        'delete',
        (alice as AuthSession).workspaceId,
        modifiedId,
      )
      expectStatus(deletion, 404, 'MODIFIED_UUID_DELETE_NOT_DENIED')
    })

    await harness.check('isolation.edge_internal_field_write', async () => {
      const originalAliceSnapshot = clientSnapshot(aliceClient as WorkspaceClientRow)
      const result = await callFunction(config, 'workspace-clients', {
        token: (alice as AuthSession).accessToken,
        jsonBody: {
          action: 'update',
          workspace_id: (alice as AuthSession).workspaceId,
          client_id: (aliceClient as WorkspaceClientRow).id,
          client: {
            ...alicePayload,
            name: `${alicePayload.name} hidden-field-attempt`,
            portal_access_enabled: true,
          },
        },
      })
      expectStatus(result, 400, 'INTERNAL_CLIENT_FIELD_NOT_REJECTED')
      const currentAlice = findClient(
        await listWorkspaceClients(config, alice as AuthSession),
        (aliceClient as WorkspaceClientRow).id,
      )
      assertSafe(currentAlice, 'ALICE_CLIENT_MISSING_AFTER_INTERNAL_FIELD_ATTACK')
      assertSafe(
        clientSnapshot(currentAlice) === originalAliceSnapshot,
        'ALICE_CLIENT_CHANGED_AFTER_INTERNAL_FIELD_ATTACK',
      )
    })

    alice = await harness.must('auth.alice_refresh_before_rest', async () => {
      const previous = alice as AuthSession
      const refreshed = await loadTenantSession(config, previous)
      assertSafe(
        refreshed.workspaceId === previous.workspaceId
          && refreshed.membershipId === previous.membershipId,
        'TENANT_CONTEXT_CHANGED_DURING_RUN',
      )
      return refreshed
    })

    await harness.check('isolation.rest_own_client_base_table_read', async () => {
      const result = await callRest(config, (alice as AuthSession).accessToken, 'clients', {
        query: { select: 'id', id: `eq.${(aliceClient as WorkspaceClientRow).id}` },
      })
      expectDeniedOrEmpty(result, 'REST_OWN_CLIENT_BASE_TABLE_READ_NOT_DENIED')
    })

    await harness.check('isolation.rest_cross_client_read', async () => {
      const result = await callRest(config, (alice as AuthSession).accessToken, 'clients', {
        query: { select: 'id', id: `eq.${(bobClient as WorkspaceClientRow).id}` },
      })
      expectDeniedOrEmpty(result, 'REST_CROSS_CLIENT_READ_NOT_DENIED')
    })

    await harness.check('isolation.rest_cross_client_update', async () => {
      const result = await callRest(config, (alice as AuthSession).accessToken, 'clients', {
        method: 'PATCH',
        query: { select: 'id', id: `eq.${(bobClient as WorkspaceClientRow).id}` },
        body: { name: `${alicePayload.name} rest-cross-update` },
      })
      expectMutationDeniedOrEmpty(result, 'REST_CROSS_CLIENT_UPDATE_NOT_DENIED')
    })

    await harness.check('isolation.rest_cross_client_delete', async () => {
      const result = await callRest(config, (alice as AuthSession).accessToken, 'clients', {
        method: 'DELETE',
        query: { select: 'id', id: `eq.${(bobClient as WorkspaceClientRow).id}` },
      })
      expectMutationDeniedOrEmpty(result, 'REST_CROSS_CLIENT_DELETE_NOT_DENIED')
    })

    for (const [table, selection] of [
      ['bookings', 'id'],
      ['client_portal_credentials', 'client_id'],
      ['client_portal_sessions', 'id'],
      ['workspace_audit_log', 'id'],
    ] as const) {
      await harness.check(`isolation.rest_sensitive_${table}`, async () => {
        const result = await callRest(config, (alice as AuthSession).accessToken, table, {
          query: { select: selection, limit: '1' },
        })
        expectDeniedOrEmpty(result, 'REST_SENSITIVE_TABLE_NOT_DENIED')
      })
    }

    await harness.check('isolation.bob_unchanged_after_attacks', async () => {
      const currentBob = findClient(
        await listWorkspaceClients(config, bob as AuthSession),
        (bobClient as WorkspaceClientRow).id,
      )
      assertSafe(currentBob, 'BOB_CLIENT_MISSING_AFTER_ATTACKS')
      assertSafe(clientSnapshot(currentBob) === originalBobSnapshot, 'BOB_CLIENT_CHANGED_AFTER_ATTACKS')
    })

    const excludedProbeToken = admin?.accessToken ?? alice.accessToken
    const unauthenticatedTombstones = new Set(manifest.unauthenticated_tombstone_probes)
    for (const functionName of manifest.retired_http_410_functions) {
      const isPublicProbe = unauthenticatedTombstones.has(functionName)
      if (!isPublicProbe && !admin) {
        harness.incomplete(`tombstone.${functionName}`, 'ADMIN_TOMBSTONE_PROBE_NOT_RUN')
        continue
      }
      await harness.check(`tombstone.${functionName}`, async () => {
        const result = await callFunction(config, functionName, {
          token: isPublicProbe ? undefined : (admin as AdminSession).accessToken,
          rawBody: '{not-valid-json',
        })
        expectStatus(result, 410, 'TOMBSTONE_NOT_ACTIVE')
      })
    }

    for (const { name } of manifest.excluded_from_tenant_environment) {
      await harness.check(`excluded.${name}`, async () => {
        const result = await callFunction(config, name, {
          token: excludedProbeToken,
          jsonBody: {},
        })
        expectStatus(result, 404, 'EXCLUDED_FUNCTION_IS_DEPLOYED')
      })
    }

    const resendMarker = createHash('sha256')
      .update(`resend:${config.runId}`)
      .digest('hex')
      .slice(0, 24)
    const resendHeaders = {
      'svix-id': `msg_${resendMarker}`,
      'svix-timestamp': String(Math.floor(Date.now() / 1000)),
      'svix-signature': `v1,${'A'.repeat(44)}`,
    }
    await harness.check('resend.invalid_signature', async () => {
      const result = await callFunction(config, 'resend-webhook', {
        jsonBody: {
          type: 'email.sent',
          created_at: new Date().toISOString(),
          data: { email_id: `acceptance-${resendMarker}` },
        },
        extraHeaders: resendHeaders,
      })
      expectStatus(result, 400, 'INVALID_RESEND_SIGNATURE_NOT_REJECTED')
    })

    await harness.check('resend.chunked_body_limit', async () => {
      const firstChunk = new Uint8Array(32_768).fill(97)
      const secondChunk = new Uint8Array(32_769).fill(98)
      const stream = new ReadableStream<Uint8Array>({
        start(controller) {
          controller.enqueue(firstChunk)
          controller.enqueue(secondChunk)
          controller.close()
        },
      })
      const result = await callFunction(config, 'resend-webhook', {
        rawBody: stream,
        extraHeaders: { ...resendHeaders, 'svix-id': `msg_${resendMarker}_large` },
        duplex: 'half',
      })
      expectStatus(result, 413, 'RESEND_STREAM_LIMIT_NOT_ENFORCED')
    })

    if (admin) {
      await harness.check('admin.portal_suspend_reactivate_lifecycle', async () => {
        const listResult = await callFunction(config, 'manage-workspace-users', {
          token: (admin as AdminSession).accessToken,
          jsonBody: { action: 'list' },
        })
        expectStatus(listResult, 200, 'ADMIN_MEMBERSHIP_LIST_FAILED')
        const users = asRecord(listResult.json)?.users
        assertSafe(Array.isArray(users), 'ADMIN_MEMBERSHIP_LIST_INVALID')
        const membershipIds = new Set(
          users.map((value) => asRecord(value)?.id).filter((value): value is string => typeof value === 'string'),
        )
        assertSafe(
          membershipIds.has((alice as AuthSession).membershipId)
            && membershipIds.has((bob as AuthSession).membershipId),
          'ADMIN_FIXTURE_MEMBERSHIPS_NOT_FOUND',
        )

        const portalPassword = `${randomBytes(32).toString('base64url')}!Aa1`
        alicePortalPasswordTouched = true
        const passwordSet = await callFunction(config, 'manage-client-portal-password', {
          token: (admin as AdminSession).accessToken,
          jsonBody: {
            action: 'set',
            client_id: (aliceClient as WorkspaceClientRow).id,
            password: portalPassword,
            set_by: 'Staging acceptance',
          },
        })
        expectStatus(passwordSet, 200, 'PORTAL_PASSWORD_SET_FAILED')

        alicePortalAccessTouched = true
        await setPortalAccess(
          config,
          admin as AdminSession,
          (aliceClient as WorkspaceClientRow).id,
          true,
        )

        const portalLogin = await callFunction(config, 'login-with-password', {
          jsonBody: {
            email: (aliceClient as WorkspaceClientRow).email,
            password: portalPassword,
          },
        })
        expectStatus(portalLogin, 200, 'PORTAL_LOGIN_FAILED')
        const portalToken = asRecord(portalLogin.json)?.session_token
        const portalClient = asRecord(asRecord(portalLogin.json)?.client)
        assertSafe(typeof portalToken === 'string' && UUID_PATTERN.test(portalToken), 'PORTAL_TOKEN_INVALID')
        assertSafe(portalClient?.id === (aliceClient as WorkspaceClientRow).id, 'PORTAL_CLIENT_MISMATCH')

        const portalValidation = await callFunction(config, 'validate-portal-session', {
          jsonBody: { sessionToken: portalToken },
        })
        expectStatus(portalValidation, 200, 'PORTAL_SESSION_VALIDATION_FAILED')

        const preSuspendClients = await listWorkspaceClients(config, alice as AuthSession)
        assertSafe(
          preSuspendClients.length === 1
            && isSyntheticClient(
              preSuspendClients[0],
              (alice as AuthSession).workspaceId,
              alicePayload,
            ),
          'ALICE_WORKSPACE_NOT_DISPOSABLE',
        )
        const adminWorkspaceClients = await callRest(
          config,
          (admin as AdminSession).accessToken,
          'clients',
          {
            query: {
              select: 'id',
              workspace_id: `eq.${(alice as AuthSession).workspaceId}`,
            },
          },
        )
        expectStatus(adminWorkspaceClients, 200, 'ADMIN_WORKSPACE_CLIENT_CHECK_FAILED')
        assertSafe(
          Array.isArray(adminWorkspaceClients.json)
            && adminWorkspaceClients.json.length === 1
            && asRecord(adminWorkspaceClients.json[0])?.id === (aliceClient as WorkspaceClientRow).id,
          'ALICE_WORKSPACE_NOT_DISPOSABLE',
        )

        aliceLifecycleTouched = true
        const suspend = await callFunction(config, 'manage-workspace-users', {
          token: (admin as AdminSession).accessToken,
          jsonBody: { action: 'suspend', membership_id: (alice as AuthSession).membershipId },
        })
        expectStatus(suspend, 200, 'ALICE_SUSPEND_FAILED')

        const suspendedWorkspaceCall = await callFunction(config, 'workspace-clients', {
          token: (alice as AuthSession).accessToken,
          jsonBody: { action: 'list', workspace_id: (alice as AuthSession).workspaceId },
        })
        assertSafe(
          suspendedWorkspaceCall.status === 401 || suspendedWorkspaceCall.status === 403,
          'SUSPENDED_WORKSPACE_CALL_NOT_DENIED',
          suspendedWorkspaceCall.status,
        )
        assertSafe(
          await attemptPasswordSignIn(config, alice as AuthSession) === null,
          'SUSPENDED_AUTH_SIGN_IN_NOT_DENIED',
        )
        const invalidatedPortal = await callFunction(config, 'validate-portal-session', {
          jsonBody: { sessionToken: portalToken },
        })
        expectStatus(invalidatedPortal, 401, 'SUSPENDED_PORTAL_TOKEN_STILL_VALID')

        const reactivate = await callFunction(config, 'manage-workspace-users', {
          token: (admin as AdminSession).accessToken,
          jsonBody: { action: 'reactivate', membership_id: (alice as AuthSession).membershipId },
        })
        expectStatus(reactivate, 200, 'ALICE_REACTIVATE_FAILED')
        alice = await retryTenantSignIn(config, alice as AuthSession)
        aliceLifecycleTouched = false
        await listWorkspaceClients(config, alice)

        const stillInvalidPortal = await callFunction(config, 'validate-portal-session', {
          jsonBody: { sessionToken: portalToken },
        })
        expectStatus(stillInvalidPortal, 401, 'OLD_PORTAL_TOKEN_REVIVED')

        const crudAfterReactivation = await callWorkspaceClientMutation(
          config,
          alice,
          'update',
          alice.workspaceId,
          (aliceClient as WorkspaceClientRow).id,
          alicePayload,
        )
        expectStatus(crudAfterReactivation, 200, 'CRUD_AFTER_REACTIVATION_FAILED')
        aliceClient = parseWorkspaceClient(asRecord(crudAfterReactivation.json)?.client)
      })
    } else {
      harness.incomplete(
        'admin.portal_suspend_reactivate_lifecycle',
        'ADMIN_LIFECYCLE_NOT_RUN',
      )
    }
  } catch {
    fatal = true
  } finally {
    if (
      config.admin
      && admin
      && (aliceLifecycleTouched || alicePortalAccessTouched || alicePortalPasswordTouched)
    ) {
      await harness.check('cleanup.admin_session_refresh', async () => {
        admin = await loadAdminSession(config, config.admin as AccountCredentials)
      })
    }

    if (admin && alice && aliceLifecycleTouched) {
      await harness.check('cleanup.alice_lifecycle_reconcile', async () => {
        alice = await reconcileAliceLifecycle(
          config,
          admin as AdminSession,
          alice as AuthSession,
        )
        aliceLifecycleTouched = false
      })
    }

    if (admin && aliceClient && alicePortalAccessTouched) {
      await harness.check('cleanup.portal_access_disable', async () => {
        await setPortalAccess(
          config,
          admin as AdminSession,
          (aliceClient as WorkspaceClientRow).id,
          false,
        )
        alicePortalAccessTouched = false
      })
    }

    if (admin && aliceClient && alicePortalPasswordTouched) {
      await harness.check('cleanup.portal_password_clear', async () => {
        const result = await callFunction(config, 'manage-client-portal-password', {
          token: (admin as AdminSession).accessToken,
          jsonBody: { action: 'clear', client_id: (aliceClient as WorkspaceClientRow).id },
        })
        expectStatus(result, 200, 'CLEANUP_PORTAL_CLEAR_FAILED')
        alicePortalPasswordTouched = false
      })
    }

    if (alice && !aliceClient && aliceCreateMayHaveSucceeded) {
      await harness.check('cleanup.alice_fixture_discovery', async () => {
        const payload = syntheticPayload(config.runId, 'alice')
        aliceClient = await recoverSyntheticClient(
          config,
          alice as AuthSession,
          payload,
          'CLEANUP_ALICE_FIXTURE_AMBIGUOUS',
        )
      })
    }

    if (bob && !bobClient && bobCreateMayHaveSucceeded) {
      await harness.check('cleanup.bob_fixture_discovery', async () => {
        const payload = syntheticPayload(config.runId, 'bob')
        bobClient = await recoverSyntheticClient(
          config,
          bob as AuthSession,
          payload,
          'CLEANUP_BOB_FIXTURE_AMBIGUOUS',
        )
      })
    }

    if (alice && aliceClient) {
      await harness.check('cleanup.alice_client', async () => {
        if (aliceLifecycleTouched) throw new SafeFailure('CLEANUP_ALICE_STATE_UNRESOLVED')
        const currentAlice = await loadTenantSession(config, alice as AuthSession)
        alice = currentAlice
        await deleteSyntheticClient(config, currentAlice, (aliceClient as WorkspaceClientRow).id)
      })
    }

    if (bob && bobClient) {
      await harness.check('cleanup.bob_client', async () => {
        const currentBob = await loadTenantSession(config, bob as AuthSession)
        bob = currentBob
        await deleteSyntheticClient(config, currentBob, (bobClient as WorkspaceClientRow).id)
      })
    }

    await harness.check('source.integrity_final', async () => {
      const finalRelease = verifyReleaseIntegrity()
      assertSafe(finalRelease.branch === release.branch, 'SOURCE_BRANCH_CHANGED_DURING_RUN')
      assertSafe(finalRelease.commit === release.commit, 'SOURCE_COMMIT_CHANGED_DURING_RUN')
      assertSafe(
        finalRelease.inputSha256 === release.inputSha256,
        'SOURCE_INPUTS_CHANGED_DURING_RUN',
      )
    })

    harness.incomplete('manual.invite_link_acceptance', 'MANUAL_INVITE_EVIDENCE_REQUIRED')
    harness.incomplete('resend.signed_replay_and_ordering', 'SIGNED_RESEND_REPLAY_NOT_RUN')
    harness.incomplete('resend.provider_account_configuration', 'MANUAL_PROVIDER_EVIDENCE_REQUIRED')
    if (fatal && harness.failures === 0) harness.failures += 1
    harness.summary()
    evidence.close()
  }

  if (harness.failures > 0) {
    process.stdout.write('Staging acceptance: FAILED\n')
    return 1
  }
  process.stdout.write('Staging acceptance: INCOMPLETE (manual release gates remain)\n')
  return 2
}

try {
  process.exitCode = await main()
} catch (error) {
  const code = error instanceof ConfigurationFailure
    ? 'CONFIGURATION_REFUSED'
    : error instanceof SafeFailure
      ? error.code
      : 'UNEXPECTED_BOOTSTRAP_FAILURE'
  process.stderr.write(`Staging acceptance refused: ${code}\n`)
  process.exitCode = 1
}
