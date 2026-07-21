import assert from 'node:assert/strict'

import { safeExternalUrl } from '../src/lib/externalUrl'

assert.equal(safeExternalUrl('https://example.test/path?q=1'), 'https://example.test/path?q=1')
assert.equal(safeExternalUrl('http://example.test'), 'http://example.test/')
assert.equal(safeExternalUrl('javascript:alert(1)'), null)
assert.equal(safeExternalUrl('data:text/html,<script>alert(1)</script>'), null)
assert.equal(safeExternalUrl('/relative/path'), null)
assert.equal(safeExternalUrl('https://user:password@example.test/private'), null)
assert.equal(safeExternalUrl('not a URL'), null)

console.log('External URL allowlist checks passed')
