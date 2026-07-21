import { HttpError } from './httpError.ts'

export const TEMPORARY_PASSWORD_PREFIX = 'Tmp-'

const UPPERCASE = 'ABCDEFGHJKLMNPQRSTUVWXYZ'
const LOWERCASE = 'abcdefghijkmnopqrstuvwxyz'
const DIGITS = '23456789'
const SYMBOLS = '-_'
const ALPHABET = `${UPPERCASE}${LOWERCASE}${DIGITS}${SYMBOLS}`

function randomIndex(length: number): number {
  if (!Number.isSafeInteger(length) || length < 1 || length > 256) {
    throw new Error('invalid random selection length')
  }

  const limit = 256 - (256 % length)
  const byte = new Uint8Array(1)
  do {
    crypto.getRandomValues(byte)
  } while (byte[0] >= limit)
  return byte[0] % length
}

function pick(group: string): string {
  return group[randomIndex(group.length)]
}

export function generateTemporaryPassword(): string {
  const body = [pick(UPPERCASE), pick(LOWERCASE), pick(DIGITS), pick(SYMBOLS)]
  while (body.length < 24) body.push(pick(ALPHABET))

  for (let index = body.length - 1; index > 0; index -= 1) {
    const swapIndex = randomIndex(index + 1)
    const value = body[index]
    body[index] = body[swapIndex]
    body[swapIndex] = value
  }

  return `${TEMPORARY_PASSWORD_PREFIX}${body.join('')}`
}

export function requirePermanentPassword(value: unknown): string {
  if (typeof value !== 'string') {
    throw new HttpError(400, 'INVALID_PASSWORD', 'new_password must be a string')
  }
  if (value.length < 12 || value.length > 128) {
    throw new HttpError(400, 'WEAK_PASSWORD', 'Use a password between 12 and 128 characters')
  }
  if (value.startsWith(TEMPORARY_PASSWORD_PREFIX)) {
    throw new HttpError(400, 'TEMPORARY_PASSWORD_REUSE', 'Choose a new password, not a temporary password')
  }
  if (!/[A-Z]/.test(value) || !/[a-z]/.test(value) || !/[0-9]/.test(value) || !/[^A-Za-z0-9]/.test(value)) {
    throw new HttpError(
      400,
      'WEAK_PASSWORD',
      'Use uppercase, lowercase, number, and symbol characters',
    )
  }
  return value
}

export function credentialVersion(value: unknown): number {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 1) {
    throw new HttpError(409, 'CREDENTIAL_STATE_INVALID', 'The account credential state requires review')
  }
  return value
}
