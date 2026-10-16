import { randomBytes, scrypt, timingSafeEqual } from 'node:crypto'
import { promisify } from 'node:util'

const scryptAsync = promisify(scrypt)
const KEY_LENGTH = 64

// Stored as "salt:hash" (hex). scrypt is built into Node, so no native bcrypt build is needed.
export async function hashPassword(password) {
  const salt = randomBytes(16).toString('hex')
  const hash = await scryptAsync(password, salt, KEY_LENGTH)
  return `${salt}:${hash.toString('hex')}`
}

export async function verifyPassword(password, stored) {
  const [salt, hashHex] = String(stored).split(':')
  if (!salt || !hashHex) return false
  const expected = Buffer.from(hashHex, 'hex')
  const actual = await scryptAsync(password, salt, KEY_LENGTH)
  return expected.length === actual.length && timingSafeEqual(expected, actual)
}
