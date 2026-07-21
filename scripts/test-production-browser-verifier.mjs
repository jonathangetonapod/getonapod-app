import assert from 'node:assert/strict'

import {
  isJavaScriptContentType,
  KNOWN_COMPROMISED_ASSET_PATHS,
  resolveJavaScriptReferences,
  verifyRetiredBrowserAssets,
} from './verify-production-browser-bundle.mjs'

const origin = 'https://getonapod.com'
const baseUrl = new URL('/assets/index-example.js', origin)
const source = `
  import('./App-relative.js')
  import('../shared-parent.js')
  const viteDependencies = ['assets/vendor-root.js', '/assets/error-boundary.js']
  const runtimeNames = ['Node.js', 'bare-runtime.js']
  const absolute = 'https://getonapod.com/assets/absolute.js'
  const external = 'https://example.com/external.js'
`

assert.deepEqual(
  resolveJavaScriptReferences(source, baseUrl, origin).map((url) => url.href),
  [
    'https://getonapod.com/assets/App-relative.js',
    'https://getonapod.com/shared-parent.js',
    'https://getonapod.com/assets/vendor-root.js',
    'https://getonapod.com/assets/error-boundary.js',
    'https://getonapod.com/assets/absolute.js',
  ],
)

for (const contentType of [
  'application/javascript',
  'application/javascript; charset=utf-8',
  'text/javascript; charset=UTF-8',
  'application/ecmascript',
]) {
  assert.equal(isJavaScriptContentType(contentType), true, contentType)
}

for (const contentType of [
  '',
  'text/html; charset=utf-8',
  'text/plain',
  'application/json',
  'application/javascriptish',
]) {
  assert.equal(isJavaScriptContentType(contentType), false, contentType)
}

assert.deepEqual(KNOWN_COMPROMISED_ASSET_PATHS, [
  '/assets/Node.js',
  '/assets/index-DlOoAdvm.js',
  '/assets/App-4j-h30J_.js',
  '/assets/supabase-RKBMPFVQ.js',
  '/assets/button-CElMJTZX.js',
  '/assets/ErrorBoundary-CAwUNoYN.js',
])

const retiredPaths = ['/assets/retired.js', '/assets/clean-fallback.js']
const retiredCalls = []
const retirement = await verifyRetiredBrowserAssets(origin, {
  paths: retiredPaths,
  fetchImpl: async (url, options) => {
    retiredCalls.push({ url: url.href, options })
    const missing = url.pathname === retiredPaths[0]
    return fakeResponse({
      body: missing ? 'Not Found' : '<!doctype html><title>Clean fallback</title>',
      status: missing ? 404 : 200,
      url: url.href,
    })
  },
})
assert.deepEqual(retirement, { checkedCount: 2 })
assert.deepEqual(retiredCalls.map((call) => call.url), retiredPaths.map((pathname) => `${origin}${pathname}`))
for (const call of retiredCalls) {
  assert.equal(call.options.headers['cache-control'], 'no-cache')
  assert.equal(call.options.redirect, 'follow')
}

const syntheticServiceRoleJwt = [
  Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url'),
  Buffer.from(JSON.stringify({ iss: 'supabase', role: 'service_role' })).toString('base64url'),
  'synthetic-signature-for-retirement-test',
].join('.')
await assert.rejects(
  verifyRetiredBrowserAssets(origin, {
    paths: ['/assets/compromised.js'],
    fetchImpl: async (url) => fakeResponse({
      body: `window.__config = ${JSON.stringify(syntheticServiceRoleJwt)}`,
      status: 200,
      url: url.href,
    }),
  }),
  (error) => {
    assert.match(error.message, /values suppressed/u)
    assert.match(error.message, /SUPABASE_SERVICE_ROLE_JWT/u)
    assert.doesNotMatch(error.message, new RegExp(syntheticServiceRoleJwt.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&'), 'u'))
    return true
  },
)

await assert.rejects(
  verifyRetiredBrowserAssets(origin, {
    paths: ['/assets/unavailable.js'],
    fetchImpl: async (url) => fakeResponse({ body: 'temporary failure', status: 503, url: url.href }),
  }),
  /could not be verified/u,
)

let crossOriginFetched = false
await assert.rejects(
  verifyRetiredBrowserAssets(origin, {
    paths: ['https://example.com/external.js'],
    fetchImpl: async () => {
      crossOriginFetched = true
      throw new Error('must not fetch')
    },
  }),
  /outside the production origin/u,
)
assert.equal(crossOriginFetched, false)

function fakeResponse({ body, status, url }) {
  return {
    ok: status >= 200 && status < 300,
    status,
    text: async () => body,
    url,
  }
}

process.stdout.write('Production browser crawler, retirement, and content-type checks passed\n')
