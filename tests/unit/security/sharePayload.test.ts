import { describe, expect, it } from 'vitest'
import { gzipSync } from 'node:zlib'
import { decodeSharePayload, MAX_DECODED_BYTES } from '../../../api/_lib/sharePayload.ts'

/** Encode an arbitrary value the way the client's buildShareUrl does. */
function encode(value: unknown): string {
  const json = typeof value === 'string' ? value : JSON.stringify(value)
  return gzipSync(Buffer.from(json, 'utf8'))
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
}

const VALID = { t: 'Buffalo Chicken Mac', ig: ['24 oz chicken breast'], st: ['Air fry at 375F'] }

describe('decodeSharePayload', () => {
  it('round-trips a valid recipe', () => {
    const payload = decodeSharePayload(encode(VALID))
    expect(payload.t).toBe('Buffalo Chicken Mac')
    expect(payload.ig).toEqual(['24 oz chicken breast'])
    expect(payload.st).toEqual(['Air fry at 375F'])
  })

  it('defaults missing steps to an empty array', () => {
    const payload = decodeSharePayload(encode({ t: 'No Steps', ig: ['salt'] }))
    expect(payload.st).toEqual([])
  })

  it('rejects a payload with no title', () => {
    expect(() => decodeSharePayload(encode({ ig: [] }))).toThrow(/title/)
  })

  it('rejects a payload with no ingredients array', () => {
    expect(() => decodeSharePayload(encode({ t: 'X' }))).toThrow(/ingredients/)
  })

  it('rejects a non-object payload', () => {
    expect(() => decodeSharePayload(encode('"just a string"'))).toThrow()
  })

  it('rejects data that is not valid gzip', () => {
    expect(() => decodeSharePayload('bm90LWd6aXA')).toThrow()
  })

  it('rejects an over-long encoded parameter before inflating', () => {
    expect(() => decodeSharePayload('A'.repeat(12_001))).toThrow(/too large/i)
  })

  // A decompression bomb: a small gzip payload that inflates past the cap.
  // Without maxOutputLength this would allocate tens of MB before JSON.parse.
  it('refuses to inflate a decompression bomb past the cap', () => {
    const bomb = gzipSync(Buffer.alloc(MAX_DECODED_BYTES * 8, 0x41))
    expect(bomb.length).toBeLessThan(12_000)

    const encoded = bomb.toString('base64').replace(/\+/g, '-').replace(/\//g, '_')
    expect(() => decodeSharePayload(encoded)).toThrow()
  })
})
