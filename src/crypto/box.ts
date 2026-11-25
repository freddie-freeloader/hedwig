import { xchacha20poly1305 } from '@noble/ciphers/chacha.js'
import { randomBytes } from '@noble/ciphers/utils.js'
import { x25519 } from '@noble/curves/ed25519.js'
import { hkdf } from '@noble/hashes/hkdf.js'
import { sha256 } from '@noble/hashes/sha2.js'
import { copyBytes, utf8, wipe } from './bytes.ts'

const LETTER_INFO = utf8('hedwig.v1.letter-key')

export type SealedBox = {
  ephPub: Uint8Array
  nonce: Uint8Array
  ciphertext: Uint8Array
}

export function createInboxKey(): { secretKey: Uint8Array; publicKey: Uint8Array } {
  const generated = x25519.keygen()
  return {
    secretKey: copyBytes(generated.secretKey),
    publicKey: copyBytes(generated.publicKey),
  }
}

export function isUsableInboxPublic(publicKey: Uint8Array): boolean {
  if (publicKey.length !== 32) return false
  const probe = x25519.keygen()
  try {
    x25519.getSharedSecret(probe.secretKey, publicKey)
    return true
  } catch {
    return false
  } finally {
    wipe(probe.secretKey)
  }
}

export function sealBox(
  plaintext: Uint8Array,
  recipientPublic: Uint8Array,
  aad: Uint8Array,
): SealedBox {
  if (!isUsableInboxPublic(recipientPublic)) {
    throw new Error('recipient inbox key is not usable')
  }
  const ephemeral = x25519.keygen()
  try {
    const shared = x25519.getSharedSecret(ephemeral.secretKey, recipientPublic)
    const key = hkdf(sha256, shared, ephemeral.publicKey, LETTER_INFO, 32)
    const nonce = randomBytes(24)
    const ciphertext = xchacha20poly1305(key, nonce, aad).encrypt(plaintext)
    wipe(shared)
    wipe(key)
    return {
      ephPub: copyBytes(ephemeral.publicKey),
      nonce: copyBytes(nonce),
      ciphertext: copyBytes(ciphertext),
    }
  } finally {
    wipe(ephemeral.secretKey)
  }
}

export function openBox(
  box: SealedBox,
  recipientSecret: Uint8Array,
  aad: Uint8Array,
): Uint8Array | null {
  try {
    const shared = x25519.getSharedSecret(recipientSecret, box.ephPub)
    const key = hkdf(sha256, shared, box.ephPub, LETTER_INFO, 32)
    const plaintext = xchacha20poly1305(key, box.nonce, aad).decrypt(box.ciphertext)
    wipe(shared)
    wipe(key)
    return copyBytes(plaintext)
  } catch {
    return null
  }
}
