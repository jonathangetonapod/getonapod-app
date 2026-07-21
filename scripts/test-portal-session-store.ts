import assert from 'node:assert/strict'

import { createPortalSessionStore } from '../src/lib/portalSessionStore'

class MemoryStorage implements Storage {
  readonly values = new Map<string, string>()
  get length() { return this.values.size }
  clear() { this.values.clear() }
  getItem(key: string) { return this.values.get(key) ?? null }
  key(index: number) { return [...this.values.keys()][index] ?? null }
  removeItem(key: string) { this.values.delete(key) }
  setItem(key: string, value: string) { this.values.set(key, value) }
}

const session = {
  session_token: 'opaque-session-token',
  expires_at: '2099-01-01T00:00:00.000Z',
  client_id: 'client-id',
}
const client = { id: 'client-id', name: 'Client Name' }

const persistentWindow = {
  localStorage: new MemoryStorage(),
  sessionStorage: new MemoryStorage(),
}
const firstStore = createPortalSessionStore(() => persistentWindow)
firstStore.save(session, client)
assert.deepEqual(firstStore.get(), { session, client })

const reloadedStore = createPortalSessionStore(() => persistentWindow)
assert.deepEqual(reloadedStore.get(), { session, client })

const deniedStore = createPortalSessionStore(() => {
  throw new DOMException('Storage denied', 'SecurityError')
})
deniedStore.save(session, client)
assert.deepEqual(deniedStore.get(), { session, client })
deniedStore.clear()
assert.deepEqual(deniedStore.get(), { session: null, client: null })

assert.throws(
  () => firstStore.save(session, { id: 'different-client', name: 'Wrong Client' }),
  /does not match/,
)

console.log('Portal session storage fallback checks passed')
