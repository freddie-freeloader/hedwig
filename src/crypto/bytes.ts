const TEXT = new TextEncoder()
const TEXT_DEC = new TextDecoder()
const TABLE = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_'

export function utf8(value: string): Uint8Array {
  return TEXT.encode(value)
}

export function fromUtf8(bytes: Uint8Array): string {
  return TEXT_DEC.decode(bytes)
}

export function concatBytes(parts: readonly Uint8Array[]): Uint8Array {
  let total = 0
  for (const part of parts) total += part.length
  const out = new Uint8Array(total)
  let offset = 0
  for (const part of parts) {
    out.set(part, offset)
    offset += part.length
  }
  return out
}

export function u32be(value: number): Uint8Array {
  const out = new Uint8Array(4)
  new DataView(out.buffer).setUint32(0, value)
  return out
}

export function lenPref(bytes: Uint8Array): Uint8Array {
  return concatBytes([u32be(bytes.length), bytes])
}

export function wipe(bytes: Uint8Array): void {
  bytes.fill(0)
}

export function equalBytes(left: Uint8Array, right: Uint8Array): boolean {
  if (left.length !== right.length) return false
  let diff = 0
  for (let index = 0; index < left.length; index += 1) {
    diff |= (left[index] ?? 0) ^ (right[index] ?? 0)
  }
  return diff === 0
}

export function encodeBase64Url(bytes: Uint8Array): string {
  let out = ''
  let index = 0
  while (index + 3 <= bytes.length) {
    const b0 = bytes[index] ?? 0
    const b1 = bytes[index + 1] ?? 0
    const b2 = bytes[index + 2] ?? 0
    const packed = (b0 << 16) | (b1 << 8) | b2
    out += TABLE[(packed >> 18) & 63]
    out += TABLE[(packed >> 12) & 63]
    out += TABLE[(packed >> 6) & 63]
    out += TABLE[packed & 63]
    index += 3
  }
  const remaining = bytes.length - index
  if (remaining === 1) {
    const packed = (bytes[index] ?? 0) << 16
    out += TABLE[(packed >> 18) & 63]
    out += TABLE[(packed >> 12) & 63]
  } else if (remaining === 2) {
    const packed = ((bytes[index] ?? 0) << 16) | ((bytes[index + 1] ?? 0) << 8)
    out += TABLE[(packed >> 18) & 63]
    out += TABLE[(packed >> 12) & 63]
    out += TABLE[(packed >> 6) & 63]
  }
  return out
}

export function decodeBase64Url(value: string): Uint8Array | null {
  if (value.length === 0) return new Uint8Array()
  if (!/^[A-Za-z0-9_-]+$/.test(value) || value.length % 4 === 1) return null
  const pad = (4 - (value.length % 4)) % 4
  const base64 = `${value.replaceAll('-', '+').replaceAll('_', '/')}${'='.repeat(pad)}`
  let binary: string
  try {
    binary = atob(base64)
  } catch {
    return null
  }
  const out = new Uint8Array(binary.length)
  for (let index = 0; index < binary.length; index += 1) {
    out[index] = binary.charCodeAt(index)
  }
  return out
}

export function decodeFixed(value: string, length: number): Uint8Array | null {
  const bytes = decodeBase64Url(value)
  if (!bytes || bytes.length !== length) return null
  return bytes
}

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

export function copyBytes(bytes: Uint8Array): Uint8Array {
  return new Uint8Array(bytes)
}
