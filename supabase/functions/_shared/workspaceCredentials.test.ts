import {
  generateTemporaryPassword,
  requirePermanentPassword,
  TEMPORARY_PASSWORD_PREFIX,
} from './workspaceCredentials.ts'

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message)
}

Deno.test('temporary passwords are unique, policy-compliant, and reserved', () => {
  const generated = new Set<string>()
  for (let index = 0; index < 2_000; index += 1) {
    const password = generateTemporaryPassword()
    assert(password.startsWith(TEMPORARY_PASSWORD_PREFIX), 'temporary prefix is missing')
    assert(password.length === 28, 'temporary password length changed')
    assert(/[A-Z]/.test(password), 'uppercase character is missing')
    assert(/[a-z]/.test(password), 'lowercase character is missing')
    assert(/[0-9]/.test(password), 'number is missing')
    assert(/[^A-Za-z0-9]/.test(password), 'symbol is missing')
    assert(!generated.has(password), 'temporary password repeated')
    generated.add(password)
  }
})

Deno.test('permanent passwords reject temporary and weak formats', () => {
  const valid = 'A private Passphrase 42!'
  assert(requirePermanentPassword(valid) === valid, 'valid password changed')

  for (const password of [
    generateTemporaryPassword(),
    'short-A1!',
    'all lowercase password 42!',
    'ALL UPPERCASE PASSWORD 42!',
    'NoNumbersInThisPassword!',
    'No-symbol-in-this-password-42'.replaceAll('-', ''),
  ]) {
    let rejected = false
    try {
      requirePermanentPassword(password)
    } catch {
      rejected = true
    }
    assert(rejected, 'unsafe permanent password was accepted')
  }
})
