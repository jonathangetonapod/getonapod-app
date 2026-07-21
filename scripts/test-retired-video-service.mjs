import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { request } from 'node:http'

import { createRetiredVideoServer } from '../video-generator/server.js'

const servicePackage = JSON.parse(readFileSync(
  new URL('../video-generator/package.json', import.meta.url),
  'utf8',
))
const dockerfile = readFileSync(new URL('../video-generator/Dockerfile', import.meta.url), 'utf8')

assert.equal(servicePackage.scripts?.start, 'node server.js')
assert.deepEqual(servicePackage.dependencies ?? {}, {})
assert.deepEqual(servicePackage.devDependencies ?? {}, {})
assert.match(dockerfile, /^FROM node:22\.22\.2-alpine$/mu)
assert.match(dockerfile, /^USER node$/mu)
assert.doesNotMatch(dockerfile, /npm\s+(?:ci|install)/u)

function send({ port, path, method = 'GET', body = '', contentType }) {
  return new Promise((resolve, reject) => {
    const headers = {}
    if (body) headers['Content-Length'] = Buffer.byteLength(body)
    if (contentType) headers['Content-Type'] = contentType

    const outgoing = request({
      host: '127.0.0.1',
      port,
      path,
      method,
      headers,
    }, (response) => {
      const chunks = []
      response.on('data', (chunk) => chunks.push(chunk))
      response.on('end', () => resolve({
        status: response.statusCode,
        headers: response.headers,
        body: Buffer.concat(chunks).toString('utf8'),
      }))
    })
    outgoing.on('error', reject)
    outgoing.end(body)
  })
}

const server = createRetiredVideoServer()

try {
  await new Promise((resolve, reject) => {
    server.once('error', reject)
    server.listen(0, '127.0.0.1', resolve)
  })
  const address = server.address()
  assert.ok(address && typeof address === 'object')

  const cases = [
    { path: '/api/generate', method: 'POST', body: '{"prompt":"test"}', contentType: 'application/json' },
    { path: '/api/generate', method: 'POST', body: '{', contentType: 'application/json' },
    { path: '/api/generate', method: 'POST', body: 'x'.repeat(128 * 1024), contentType: 'application/octet-stream' },
    { path: '/api', method: 'GET' },
  ]

  for (const testCase of cases) {
    const result = await send({ port: address.port, ...testCase })
    assert.equal(result.status, 410)
    assert.equal(result.headers['cache-control'], 'no-store')
    assert.equal(result.headers['x-content-type-options'], 'nosniff')
    assert.equal(JSON.parse(result.body).code, 'VIDEO_GENERATION_DISABLED')
  }

  const health = await send({ port: address.port, path: '/health' })
  assert.equal(health.status, 200)
  assert.equal(health.headers['cache-control'], 'no-store')
  assert.deepEqual(JSON.parse(health.body), { status: 'retired' })

  const missing = await send({ port: address.port, path: '/unknown' })
  assert.equal(missing.status, 404)

  process.stdout.write('Retired video service tombstone checks passed\n')
} finally {
  await new Promise((resolve, reject) => {
    server.close((error) => error ? reject(error) : resolve())
  })
}
