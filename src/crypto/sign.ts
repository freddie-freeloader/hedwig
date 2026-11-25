import { ed25519 } from '@noble/curves/ed25519.js'
import { concatBytes, copyBytes, lenPref, utf8 } from './bytes.ts'

export const REGISTER_LABEL = 'hedwig.v1.register'
export const OPEN_LABEL = 'hedwig.v1.open'
export const ACK_LABEL = 'hedwig.v1.ack'
export const PREVIEW_LABEL = 'hedwig.v1.preview'
export const PRESENCE_LABEL = 'hedwig.v1.presence'
export const HELLO_LABEL = 'hedwig.v1.hello'

export function domainMessage(label: string, parts: readonly Uint8Array[]): Uint8Array {
  const chunks: Uint8Array[] = [utf8(label)]
  for (const part of parts) chunks.push(lenPref(part))
  return concatBytes(chunks)
}

export function signDomain(
  secretKey: Uint8Array,
  label: string,
  parts: readonly Uint8Array[],
): Uint8Array {
  return copyBytes(ed25519.sign(domainMessage(label, parts), secretKey))
}

export function verifyDomain(
  publicKey: Uint8Array,
  signature: Uint8Array,
  label: string,
  parts: readonly Uint8Array[],
): boolean {
  try {
    return ed25519.verify(signature, domainMessage(label, parts), publicKey)
  } catch {
    return false
  }
}
