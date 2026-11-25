import { xchacha20poly1305 } from '@noble/ciphers/chacha.js'
import { randomBytes } from '@noble/ciphers/utils.js'
import { concatBytes, copyBytes, decodeBase64Url, encodeBase64Url, wipe } from './bytes.ts'

export const WRAP_NONCE = 24
export const INBOX_SECRET = 32
export const WRAP_TAG = 16
export const WRAPPED_LENGTH = WRAP_NONCE + INBOX_SECRET + WRAP_TAG

export function createWrapKey(): Uint8Array {
  return copyBytes(randomBytes(32))
}

export function wrapSecret(secret: Uint8Array, wrapKey: Uint8Array): string {
  if (secret.length !== INBOX_SECRET) throw new Error('inbox secret must be 32 bytes')
  if (wrapKey.length !== 32) throw new Error('wrap key must be 32 bytes')
  const nonce = randomBytes(24)
  const ciphertext = xchacha20poly1305(wrapKey, nonce).encrypt(secret)
  const encoded = encodeBase64Url(concatBytes([nonce, ciphertext]))
  wipe(nonce)
  return encoded
}

export function unwrapSecret(encoded: string, wrapKey: Uint8Array): Uint8Array | null {
  if (wrapKey.length !== 32) return null
  const bytes = decodeBase64Url(encoded)
  if (!bytes || bytes.length !== WRAPPED_LENGTH) return null
  const nonce = bytes.slice(0, WRAP_NONCE)
  const ciphertext = bytes.slice(WRAP_NONCE)
  try {
    const secret = xchacha20poly1305(wrapKey, nonce).decrypt(ciphertext)
    if (secret.length !== INBOX_SECRET) return null
    return copyBytes(secret)
  } catch {
    return null
  }
}
