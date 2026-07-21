import assert from 'node:assert/strict'
import { existsSync, readFileSync } from 'node:fs'

const dockerfile = readFileSync('Dockerfile', 'utf8')
const dockerignore = readFileSync('.dockerignore', 'utf8')
const railway = readFileSync('railway.toml', 'utf8')
const localNodeInstaller = readFileSync('scripts/install-local-node.py', 'utf8')
const localNodeRunner = readFileSync('scripts/with-local-node.sh', 'utf8')
const packageJson = JSON.parse(readFileSync('package.json', 'utf8'))

assert.equal(existsSync('nixpacks.toml'), false, 'obsolete Nixpacks Node configuration must stay removed')
assert.equal(packageJson.engines?.node, '22.22.2')
assert.equal(packageJson.engines?.npm, '10.9.7')
assert.equal(packageJson.packageManager, 'npm@10.9.7')

assert.equal(
  [...dockerfile.matchAll(/^FROM node:22\.22\.2-alpine AS (?:build|runtime)$/gmu)].length,
  2,
  'both Docker stages must use the exact reviewed Node image',
)
assert.equal(
  [...dockerfile.matchAll(/test "\$\(npm --version\)" = "10\.9\.7"/gmu)].length,
  2,
  'both Docker stages must verify the exact reviewed bundled npm release',
)
assert.match(dockerfile, /npm ci --ignore-scripts --no-audit --no-fund/u)
assert.match(dockerfile, /npm ci --omit=dev --ignore-scripts --no-audit --no-fund/u)
assert.match(dockerfile, /ARG VITE_SUPABASE_URL/u)
assert.match(dockerfile, /ARG VITE_SUPABASE_ANON_KEY/u)
assert.match(dockerfile, /ARG VITE_APP_URL/u)
assert.match(dockerfile, /test -n "\$\{VITE_SUPABASE_URL\}"/u)
assert.match(dockerfile, /test -n "\$\{VITE_SUPABASE_ANON_KEY\}"/u)
assert.match(dockerfile, /test -n "\$\{VITE_APP_URL\}"/u)
assert.match(dockerfile, /^USER node$/mu)
assert.match(dockerfile, /^CMD \["npm", "start"\]$/mu)

assert.match(railway, /^builder = "DOCKERFILE"$/mu)
assert.match(railway, /^dockerfilePath = "Dockerfile"$/mu)
assert.match(railway, /^startCommand = "npm start"$/mu)

assert.match(localNodeInstaller, /^VERSION = "v22\.22\.2"$/mu)
assert.match(localNodeInstaller, /^NPM_VERSION = "10\.9\.7"$/mu)
assert.match(localNodeInstaller, /^ARCHIVE_SHA256 = "[0-9a-f]{64}"$/mu)
assert.match(localNodeInstaller, /hmac\.compare_digest\(actual_sha256, ARCHIVE_SHA256\)/u)
assert.match(localNodeInstaller, /tar\.extractall\(extract_dir, filter="data"\)/u)
assert.match(localNodeRunner, /node_version.*v22\.22\.2/su)
assert.match(localNodeRunner, /npm_version.*10\.9\.7/su)

for (const ignoredPath of [
  '.git',
  '.env*',
  '**/.env*',
  '.tools',
  '**/.tools',
  'node_modules',
  '**/node_modules',
  'dist',
  'coverage',
  '*.log',
  '**/*.log',
  'credentials',
  '**/credentials',
  'credentials.json',
  '**/credentials.json',
  '*service-account*.json',
  '**/*service-account*.json',
  '*.ndjson',
  '**/*.ndjson',
  '*.sha256',
  '**/*.sha256',
]) {
  assert.ok(
    dockerignore.split(/\r?\n/u).includes(ignoredPath),
    `.dockerignore must exclude ${ignoredPath}`,
  )
}

process.stdout.write('Deployment Docker/Railway configuration checks passed\n')
