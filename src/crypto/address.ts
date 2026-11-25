import { sha256 } from '@noble/hashes/sha256.js'
import { concatBytes, decodeBase64Url, encodeBase64Url } from './bytes.ts'

const PREFIX = 'owl1'
const PUBLIC_KEY_LENGTH = 32
const CHECKSUM_LENGTH = 4

export function owlAddress(publicKey: Uint8Array): string {
  if (publicKey.length !== PUBLIC_KEY_LENGTH) {
    throw new Error('identity public key must be 32 bytes')
  }
  const checksum = sha256(publicKey).slice(0, CHECKSUM_LENGTH)
  return `${PREFIX}${encodeBase64Url(concatBytes([publicKey, checksum]))}`
}

export function publicKeyFromAddress(address: string): Uint8Array | null {
  if (!address.startsWith(PREFIX)) return null
  const decoded = decodeBase64Url(address.slice(PREFIX.length))
  if (!decoded || decoded.length !== PUBLIC_KEY_LENGTH + CHECKSUM_LENGTH) return null
  const publicKey = decoded.slice(0, PUBLIC_KEY_LENGTH)
  const checksum = decoded.slice(PUBLIC_KEY_LENGTH)
  const expected = sha256(publicKey).slice(0, CHECKSUM_LENGTH)
  if (checksum.length !== expected.length) return null
  for (let index = 0; index < expected.length; index += 1) {
    if (checksum[index] !== expected[index]) return null
  }
  return publicKey
}

export function normalizeAddress(input: string): string {
  return input.trim().replace(/\s+/g, '')
}

export function formatAddress(address: string): string {
  if (!address.startsWith(PREFIX)) return address
  const body = address.slice(PREFIX.length)
  const groups = body.match(/.{1,4}/g)
  return `${PREFIX} ${groups ? groups.join(' ') : body}`
}

export function shortenAddress(address: string): string {
  if (address.length <= 16) return address
  return `${address.slice(0, 10)}…${address.slice(-6)}`
}
