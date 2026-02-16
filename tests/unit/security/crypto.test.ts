import { afterAll, beforeEach, describe, expect, it } from 'vitest'
import { decrypt, encrypt } from '../../../api/_lib/crypto.ts'

const VALID_COOKIE_SECRET = '12345678901234567890123456789012'
const originalCookieSecret = process.env.COOKIE_SECRET

beforeEach(() => {
  process.env.COOKIE_SECRET = VALID_COOKIE_SECRET
})

afterAll(() => {
  if (originalCookieSecret === undefined) {
    delete process.env.COOKIE_SECRET
  } else {
    process.env.COOKIE_SECRET = originalCookieSecret
  }
})

describe('cookie crypto', () => {
  it('encrypts and decrypts a value round-trip', () => {
    const plaintext = 'sensitive-session-token'
    const token = encrypt(plaintext)

    expect(decrypt(token)).toBe(plaintext)
  })

  it('produces different ciphertexts for different plaintexts', () => {
    const tokenA = encrypt('alpha')
    const tokenB = encrypt('beta')

    expect(tokenA).not.toBe(tokenB)
  })

  it('fails to decrypt tampered data', () => {
    const token = encrypt('do-not-tamper')
    const raw = Buffer.from(token, 'base64url')
    raw[raw.length - 1] ^= 0x01
    const tampered = raw.toString('base64url')

    expect(() => decrypt(tampered)).toThrow()
  })

  it('fails to decrypt truncated data', () => {
    const token = encrypt('truncate-me')
    const raw = Buffer.from(token, 'base64url').subarray(0, 20)
    const truncated = raw.toString('base64url')

    expect(() => decrypt(truncated)).toThrow('Invalid encrypted token')
  })

  it('throws when COOKIE_SECRET is missing', () => {
    delete process.env.COOKIE_SECRET

    expect(() => encrypt('x')).toThrow('COOKIE_SECRET must be set and at least 32 characters')
  })

  it('throws when COOKIE_SECRET is too short', () => {
    process.env.COOKIE_SECRET = 'too-short'

    expect(() => encrypt('x')).toThrow('COOKIE_SECRET must be set and at least 32 characters')
  })
})
