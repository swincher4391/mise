import { randomBytes, createCipheriv, createDecipheriv } from 'crypto'

const ALGORITHM = 'aes-256-gcm'
const IV_LENGTH = 12
const TAG_LENGTH = 16

function getKey(): Buffer {
  const secret = process.env.COOKIE_SECRET
  if (!secret || secret.length < 32) {
    throw new Error('COOKIE_SECRET must be set and at least 32 characters')
  }
  // Use first 32 bytes of the secret as the AES-256 key
  return Buffer.from(secret.slice(0, 32), 'utf-8')
}

export function encrypt(plaintext: string): string {
  const key = getKey()
  const iv = randomBytes(IV_LENGTH)
  const cipher = createCipheriv(ALGORITHM, key, iv)
  const encrypted = Buffer.concat([cipher.update(plaintext, 'utf-8'), cipher.final()])
  const tag = cipher.getAuthTag()
  // Format: base64(iv + tag + ciphertext)
  return Buffer.concat([iv, tag, encrypted]).toString('base64url')
}

export function decrypt(token: string): string {
  const key = getKey()
  const data = Buffer.from(token, 'base64url')
  if (data.length < IV_LENGTH + TAG_LENGTH) {
    throw new Error('Invalid encrypted token')
  }
  const iv = data.subarray(0, IV_LENGTH)
  const tag = data.subarray(IV_LENGTH, IV_LENGTH + TAG_LENGTH)
  const ciphertext = data.subarray(IV_LENGTH + TAG_LENGTH)
  const decipher = createDecipheriv(ALGORITHM, key, iv)
  decipher.setAuthTag(tag)
  return decipher.update(ciphertext) + decipher.final('utf-8')
}
