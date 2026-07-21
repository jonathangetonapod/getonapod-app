const PASSWORD_SCHEME = 'pbkdf2_sha256'
const PASSWORD_ITERATIONS = 600_000
const SESSION_SCHEME = 'sha256'
const encoder = new TextEncoder()

function copyToArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  const copy = new Uint8Array(bytes.byteLength)
  copy.set(bytes)
  return copy.buffer
}

function bytesToBase64(bytes: Uint8Array): string {
  let binary = ''
  for (const byte of bytes) binary += String.fromCharCode(byte)
  return btoa(binary)
}

function base64ToBytes(value: string): Uint8Array | null {
  try {
    return Uint8Array.from(atob(value), (character) => character.charCodeAt(0))
  } catch {
    return null
  }
}

function constantTimeEqual(left: Uint8Array, right: Uint8Array): boolean {
  let difference = left.length ^ right.length
  const length = Math.max(left.length, right.length)
  for (let index = 0; index < length; index += 1) {
    difference |= (left[index] ?? 0) ^ (right[index] ?? 0)
  }
  return difference === 0
}

async function sha256(value: string): Promise<Uint8Array> {
  return new Uint8Array(await crypto.subtle.digest('SHA-256', encoder.encode(value)))
}

async function derivePassword(
  password: string,
  salt: Uint8Array,
  iterations: number,
): Promise<Uint8Array> {
  const key = await crypto.subtle.importKey(
    'raw',
    encoder.encode(password),
    'PBKDF2',
    false,
    ['deriveBits'],
  )
  const bits = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', hash: 'SHA-256', salt: copyToArrayBuffer(salt), iterations },
    key,
    256,
  )
  return new Uint8Array(bits)
}

async function performDummyPasswordWork(password: string, seed: string): Promise<void> {
  const saltMaterial = await sha256(seed)
  await derivePassword(password, saltMaterial.slice(0, 16), PASSWORD_ITERATIONS)
}

export async function hashPortalPassword(password: string): Promise<string> {
  const salt = crypto.getRandomValues(new Uint8Array(16))
  const digest = await derivePassword(password, salt, PASSWORD_ITERATIONS)
  return [
    PASSWORD_SCHEME,
    PASSWORD_ITERATIONS.toString(),
    bytesToBase64(salt),
    bytesToBase64(digest),
  ].join('$')
}

export async function verifyPortalPassword(
  password: string,
  storedValue: string,
): Promise<{ valid: boolean; needsUpgrade: boolean }> {
  const parts = storedValue.split('$')
  if (parts.length === 4 && parts[0] === PASSWORD_SCHEME) {
    const iterations = Number(parts[1])
    const salt = base64ToBytes(parts[2])
    const expected = base64ToBytes(parts[3])
    if (
      !Number.isSafeInteger(iterations)
      || iterations < 100_000
      || iterations > 1_000_000
      || !salt
      || salt.length < 16
      || !expected
      || expected.length !== 32
    ) {
      await performDummyPasswordWork(password, storedValue)
      return { valid: false, needsUpgrade: false }
    }

    const actual = await derivePassword(password, salt, iterations)
    return {
      valid: constantTimeEqual(actual, expected),
      needsUpgrade: iterations < PASSWORD_ITERATIONS,
    }
  }

  // Plaintext and unknown verifier formats are never accepted. Legacy portal
  // credentials are invalidated during the SaaS cutover and must be reset by a
  // platform administrator.
  await performDummyPasswordWork(password, storedValue)
  return { valid: false, needsUpgrade: false }
}

export async function hashPortalSessionToken(token: string): Promise<string> {
  return `${SESSION_SCHEME}$${bytesToBase64(await sha256(token))}`
}
