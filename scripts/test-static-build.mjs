import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { readFileSync, readdirSync } from 'node:fs'
import path from 'node:path'

const sitemapPath = path.resolve('public', 'sitemap.xml')
const before = readFileSync(sitemapPath)
const npmCommand = process.platform === 'win32' ? 'npm.cmd' : 'npm'
const environment = {
  CI: 'true',
  LANG: 'C.UTF-8',
  PATH: process.env.PATH ?? '',
  SENTRY_AUTH_TOKEN: '',
  SUPABASE_SERVICE_ROLE_KEY: '',
  SUPABASE_URL: '',
  PODCASTS_SUPABASE_SERVICE_ROLE_KEY: '',
  PODCASTS_SUPABASE_URL: '',
  VITE_APP_URL: '',
  VITE_APP_VERSION: '',
  VITE_HEYGEN_API_KEY: '',
  VITE_SENTRY_DSN: '',
  VITE_SENTRY_ENVIRONMENT: '',
  VITE_SENTRY_RELEASE: '',
  VITE_SUPABASE_ANON_KEY: '',
  VITE_SUPABASE_URL: '',
  VITE_VIDEO_SERVICE_URL: '',
}

const result = spawnSync(npmCommand, ['run', 'build:static'], {
  cwd: process.cwd(),
  env: environment,
  stdio: 'inherit',
})
assert.equal(result.status, 0, 'isolated static production build must pass')
assert.deepEqual(
  readFileSync(sitemapPath),
  before,
  'isolated static production build must not rewrite tracked sitemap content',
)

const builtText = readdirSync(path.resolve('dist'), { recursive: true, withFileTypes: true })
  .filter((entry) => entry.isFile())
  .map((entry) => readFileSync(path.resolve(entry.parentPath, entry.name)))
  .filter((contents) => !contents.includes(0))
  .map((contents) => contents.toString('utf8'))
  .join('\n')
assert.equal(
  builtText.includes('static-validation'),
  false,
  'the internal Vite validation mode must not become a production telemetry label',
)

process.stdout.write('Isolated static build and sitemap cleanliness checks passed\n')
