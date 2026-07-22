import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { createServer } from 'node:net'
import { once } from 'node:events'

const packageJson = JSON.parse(readFileSync('package.json', 'utf8'))
assert.equal(
  packageJson.scripts?.start,
  'node scripts/serve-production.mjs',
  'npm start must use the production header-aware server',
)

const port = await availablePort()
const origin = `http://127.0.0.1:${port}`
const npmCommand = process.platform === 'win32' ? 'npm.cmd' : 'npm'
const child = spawn(npmCommand, ['--silent', 'start'], {
  cwd: process.cwd(),
  detached: process.platform !== 'win32',
  env: {
    LANG: 'C.UTF-8',
    NODE_ENV: 'production',
    PATH: process.env.PATH ?? '',
    PORT: String(port),
  },
  stdio: ['ignore', 'pipe', 'pipe'],
})

let output = ''
const collect = (chunk) => {
  if (output.length < 65_536) output += chunk.toString('utf8').slice(0, 65_536 - output.length)
}
child.stdout.on('data', collect)
child.stderr.on('data', collect)

try {
  await waitForServer(child, origin)

  const privateRoutes = [
    '/client/private-capability',
    '/prospect/private-capability/extra',
    '/accept-invite?code=private-code',
    '/admin/callback?code=private-code',
    '/admin/clients',
    '/admin/workspace-users',
    '/admin/workspaces/11111111-1111-4111-8111-111111111111/clients',
    '/admin/workspaces/11111111-1111-4111-8111-111111111111/guest-resources',
    '/admin/workspaces/11111111-1111-4111-8111-111111111111/onboarding',
    '/app/clients',
    '/app/guest-resources',
    '/app/onboarding',
    '/onboarding/11111111-1111-4111-8111-111111111111.1.private-capability',
    '/change-password',
    '/portal/dashboard',
    '/portal/resources',
    '/unknown-route',
  ]

  for (const route of privateRoutes) {
    const response = await fetch(`${origin}${route}`)
    assert.equal(response.status, 200, route)
    assertSecurityHeaders(response, route)
    assert.equal(response.headers.get('x-robots-tag'), 'noindex, nofollow, noarchive', route)
    assert.equal(response.headers.get('cache-control'), 'private, no-store', route)
  }

  const onboardingShell = await fetch(`${origin}/onboarding/11111111-1111-4111-8111-111111111111.1.private-capability`)
  const onboardingHtml = await onboardingShell.text()
  assert.match(onboardingHtml, /<title>Secure client onboarding<\/title>/u)
  assert.match(onboardingHtml, /Private and secure client onboarding\./u)
  assert.doesNotMatch(onboardingHtml, /Get On A Pod|getonapod\.com/iu)
  assert.doesNotMatch(onboardingHtml, /application\/ld\+json|property="og:|name="twitter:/iu)

  let indexHtml = ''
  for (const route of ['/', '/resources', '/blog/example-post', '/course', '/what-to-expect']) {
    const response = await fetch(`${origin}${route}`)
    assert.equal(response.status, 200, route)
    assertSecurityHeaders(response, route)
    assert.equal(response.headers.get('x-robots-tag'), null, route)
    if (route === '/') indexHtml = await response.text()
  }

  const assetPath = indexHtml.match(/src="(\/assets\/[^"]+\.js)"/u)?.[1]
  assert.ok(assetPath, 'built index must reference a hashed JavaScript asset')
  const asset = await fetch(`${origin}${assetPath}`)
  assert.equal(asset.status, 200, assetPath)
  assertSecurityHeaders(asset, assetPath)
  assert.equal(asset.headers.get('x-robots-tag'), null, assetPath)
  assert.match(asset.headers.get('content-type') ?? '', /javascript/u, assetPath)

  const missingStaticFiles = [
    '/assets/Node.js',
    '/assets/missing.js',
    '/assets/nested/missing.js',
    '/favicon-missing.svg',
    '/unknown.js',
  ]
  for (const route of missingStaticFiles) {
    const response = await fetch(`${origin}${route}`)
    assert.equal(response.status, 404, route)
    assertSecurityHeaders(response, route)
    assert.equal(response.headers.get('x-robots-tag'), 'noindex, nofollow, noarchive', route)
    assert.equal(response.headers.get('cache-control'), 'no-store', route)
    assert.match(response.headers.get('content-type') ?? '', /^text\/plain\b/u, route)
    assert.equal(await response.text(), 'Not Found', route)
  }

  process.stdout.write('npm start production route, asset, missing-file, and security-header checks passed\n')
} catch (error) {
  if (output) process.stderr.write(`production server output:\n${output}\n`)
  throw error
} finally {
  if (child.exitCode === null && child.signalCode === null) {
    if (process.platform !== 'win32' && child.pid) process.kill(-child.pid, 'SIGTERM')
    else child.kill('SIGTERM')
  }
  if (child.exitCode === null && child.signalCode === null) {
    await Promise.race([
      once(child, 'exit'),
      new Promise((_, reject) => setTimeout(() => reject(new Error('production server did not stop')), 5_000)),
    ])
  }
}

function assertSecurityHeaders(response, route) {
  assert.equal(response.headers.get('referrer-policy'), 'no-referrer', route)
  assert.equal(response.headers.get('x-content-type-options'), 'nosniff', route)
  assert.equal(response.headers.get('x-frame-options'), 'DENY', route)
  assert.equal(
    response.headers.get('permissions-policy'),
    'camera=(), microphone=(), geolocation=(), payment=()',
    route,
  )
}

async function availablePort() {
  const probe = createServer()
  await new Promise((resolve, reject) => {
    probe.once('error', reject)
    probe.listen(0, '127.0.0.1', resolve)
  })
  const address = probe.address()
  assert.ok(address && typeof address === 'object')
  await new Promise((resolve, reject) => probe.close((error) => error ? reject(error) : resolve()))
  return address.port
}

async function waitForServer(processHandle, baseUrl) {
  const deadline = Date.now() + 10_000
  while (Date.now() < deadline) {
    if (processHandle.exitCode !== null || processHandle.signalCode !== null) {
      throw new Error('production server exited during startup')
    }
    try {
      const response = await fetch(`${baseUrl}/__readiness__`)
      if (response.status === 200) return
    } catch {
      // Retry while npm and Node initialize.
    }
    await new Promise((resolve) => setTimeout(resolve, 100))
  }
  throw new Error('production server startup timed out')
}
