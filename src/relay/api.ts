import { publicKeyFromAddress } from '../crypto/address.ts'
import { decodeFixed, encodeBase64Url, isRecord, utf8 } from '../crypto/bytes.ts'
import { parseEnvelope, type Envelope } from '../crypto/letter.ts'
import {
  ACK_LABEL,
  HELLO_LABEL,
  OPEN_LABEL,
  PRESENCE_LABEL,
  PREVIEW_LABEL,
  REGISTER_LABEL,
  signDomain,
  verifyDomain,
} from '../crypto/sign.ts'
import { WRAPPED_LENGTH } from '../crypto/wrap.ts'
import { cleanDisplayName } from '../domain/text.ts'
import { isRealIsoDate, isValidTimeZone } from '../inbox/daily.ts'

export type RegisterBody = {
  address: string
  displayName: string
  timezone: string
  inboxPub: string
  wrappedPriv: string
  issuedAt: string
  sig: string
}

export type OpenBody = {
  address: string
  timezone: string
  localDate: string
  newInboxPub: string
  wrappedNewPriv: string
  issuedAt: string
  sig: string
}

export type AckBody = {
  address: string
  localDate: string
  issuedAt: string
  sig: string
}

export type PreviewBody = {
  address: string
  issuedAt: string
  sig: string
}

export type PresenceBody = {
  address: string
  peers: string[]
  issuedAt: string
  sig: string
}

export type HelloBody = {
  address: string
  issuedAt: string
  sig: string
}

export type Signal =
  | { kind: 'offer'; sdp: string }
  | { kind: 'answer'; sdp: string }
  | { kind: 'ice'; candidate: string; sdpMid: string | null; sdpMLineIndex: number | null }

function readString(value: unknown, max: number): string | null {
  if (typeof value !== 'string' || value.length < 1 || value.length > max) return null
  return value
}

function inboxField(value: unknown): string | null {
  const text = readString(value, 128)
  if (!text || !decodeFixed(text, 32)) return null
  return text
}

function wrappedField(value: unknown): string | null {
  const text = readString(value, 256)
  if (!text || !decodeFixed(text, WRAPPED_LENGTH)) return null
  return text
}

function sigField(value: unknown): string | null {
  const text = readString(value, 128)
  if (!text || !decodeFixed(text, 64)) return null
  return text
}

function addressField(value: unknown): string | null {
  const text = readString(value, 80)
  if (!text || !publicKeyFromAddress(text)) return null
  return text
}

export function registerParts(body: Omit<RegisterBody, 'sig'>): Uint8Array[] {
  const inboxPub = decodeFixed(body.inboxPub, 32)
  const wrapped = decodeFixed(body.wrappedPriv, WRAPPED_LENGTH)
  if (!inboxPub || !wrapped) throw new Error('invalid-register')
  return [
    utf8(body.address),
    utf8(body.displayName),
    utf8(body.timezone),
    inboxPub,
    wrapped,
    utf8(body.issuedAt),
  ]
}

export function buildRegister(
  secretKey: Uint8Array,
  fields: Omit<RegisterBody, 'sig'>,
): RegisterBody {
  const displayName = cleanDisplayName(fields.displayName)
  if (!displayName || displayName !== fields.displayName) throw new Error('invalid-name')
  if (!isValidTimeZone(fields.timezone)) throw new Error('invalid-timezone')
  const sig = signDomain(secretKey, REGISTER_LABEL, registerParts(fields))
  return { ...fields, sig: encodeBase64Url(sig) }
}

export function parseRegister(value: unknown): RegisterBody | null {
  if (!isRecord(value)) return null
  const address = addressField(value.address)
  const displayName = readString(value.displayName, 32)
  const timezone = readString(value.timezone, 64)
  const inboxPub = inboxField(value.inboxPub)
  const wrappedPriv = wrappedField(value.wrappedPriv)
  const issuedAt = readString(value.issuedAt, 40)
  const sig = sigField(value.sig)
  if (!address || !displayName || !timezone || !inboxPub || !wrappedPriv || !issuedAt || !sig) {
    return null
  }
  if (cleanDisplayName(displayName) !== displayName || !isValidTimeZone(timezone)) return null
  return { address, displayName, timezone, inboxPub, wrappedPriv, issuedAt, sig }
}

export function verifyRegister(body: RegisterBody): boolean {
  const publicKey = publicKeyFromAddress(body.address)
  const signature = decodeFixed(body.sig, 64)
  if (!publicKey || !signature) return false
  return verifyDomain(publicKey, signature, REGISTER_LABEL, registerParts(body))
}

export function openParts(body: Omit<OpenBody, 'sig'>): Uint8Array[] {
  const inboxPub = decodeFixed(body.newInboxPub, 32)
  const wrapped = decodeFixed(body.wrappedNewPriv, WRAPPED_LENGTH)
  if (!inboxPub || !wrapped) throw new Error('invalid-open')
  return [
    utf8(body.address),
    utf8(body.timezone),
    utf8(body.localDate),
    inboxPub,
    wrapped,
    utf8(body.issuedAt),
  ]
}

export function buildOpen(secretKey: Uint8Array, fields: Omit<OpenBody, 'sig'>): OpenBody {
  if (!isRealIsoDate(fields.localDate) || !isValidTimeZone(fields.timezone)) {
    throw new Error('invalid-open')
  }
  return { ...fields, sig: encodeBase64Url(signDomain(secretKey, OPEN_LABEL, openParts(fields))) }
}

export function parseOpen(value: unknown): OpenBody | null {
  if (!isRecord(value)) return null
  const address = addressField(value.address)
  const timezone = readString(value.timezone, 64)
  const localDate = readString(value.localDate, 10)
  const newInboxPub = inboxField(value.newInboxPub)
  const wrappedNewPriv = wrappedField(value.wrappedNewPriv)
  const issuedAt = readString(value.issuedAt, 40)
  const sig = sigField(value.sig)
  if (!address || !timezone || !localDate || !newInboxPub || !wrappedNewPriv || !issuedAt || !sig) {
    return null
  }
  if (!isRealIsoDate(localDate) || !isValidTimeZone(timezone)) return null
  return { address, timezone, localDate, newInboxPub, wrappedNewPriv, issuedAt, sig }
}

export function verifyOpen(body: OpenBody): boolean {
  const publicKey = publicKeyFromAddress(body.address)
  const signature = decodeFixed(body.sig, 64)
  if (!publicKey || !signature) return false
  return verifyDomain(publicKey, signature, OPEN_LABEL, openParts(body))
}

export function buildAck(secretKey: Uint8Array, fields: Omit<AckBody, 'sig'>): AckBody {
  return {
    ...fields,
    sig: encodeBase64Url(signDomain(secretKey, ACK_LABEL, [utf8(fields.address), utf8(fields.localDate), utf8(fields.issuedAt)])),
  }
}

export function parseAck(value: unknown): AckBody | null {
  if (!isRecord(value)) return null
  const address = addressField(value.address)
  const localDate = readString(value.localDate, 10)
  const issuedAt = readString(value.issuedAt, 40)
  const sig = sigField(value.sig)
  if (!address || !localDate || !issuedAt || !sig || !isRealIsoDate(localDate)) return null
  return { address, localDate, issuedAt, sig }
}

export function verifyAck(body: AckBody): boolean {
  const publicKey = publicKeyFromAddress(body.address)
  const signature = decodeFixed(body.sig, 64)
  if (!publicKey || !signature) return false
  return verifyDomain(publicKey, signature, ACK_LABEL, [
    utf8(body.address),
    utf8(body.localDate),
    utf8(body.issuedAt),
  ])
}

export function buildPreview(secretKey: Uint8Array, fields: Omit<PreviewBody, 'sig'>): PreviewBody {
  return {
    ...fields,
    sig: encodeBase64Url(signDomain(secretKey, PREVIEW_LABEL, [utf8(fields.address), utf8(fields.issuedAt)])),
  }
}

export function parsePreview(value: unknown): PreviewBody | null {
  if (!isRecord(value)) return null
  const address = addressField(value.address)
  const issuedAt = readString(value.issuedAt, 40)
  const sig = sigField(value.sig)
  if (!address || !issuedAt || !sig) return null
  return { address, issuedAt, sig }
}

export function verifyPreview(body: PreviewBody): boolean {
  const publicKey = publicKeyFromAddress(body.address)
  const signature = decodeFixed(body.sig, 64)
  if (!publicKey || !signature) return false
  return verifyDomain(publicKey, signature, PREVIEW_LABEL, [utf8(body.address), utf8(body.issuedAt)])
}

export function buildPresence(secretKey: Uint8Array, fields: Omit<PresenceBody, 'sig'>): PresenceBody {
  return {
    ...fields,
    sig: encodeBase64Url(
      signDomain(secretKey, PRESENCE_LABEL, [
        utf8(fields.address),
        utf8(fields.issuedAt),
        utf8(fields.peers.join('\n')),
      ]),
    ),
  }
}

export function parsePresence(value: unknown): PresenceBody | null {
  if (!isRecord(value)) return null
  const address = addressField(value.address)
  const issuedAt = readString(value.issuedAt, 40)
  const sig = sigField(value.sig)
  if (!address || !issuedAt || !sig || !Array.isArray(value.peers) || value.peers.length > 50) {
    return null
  }
  const peers: string[] = []
  for (const peer of value.peers) {
    const parsed = addressField(peer)
    if (!parsed) return null
    peers.push(parsed)
  }
  return { address, peers, issuedAt, sig }
}

export function verifyPresence(body: PresenceBody): boolean {
  const publicKey = publicKeyFromAddress(body.address)
  const signature = decodeFixed(body.sig, 64)
  if (!publicKey || !signature) return false
  return verifyDomain(publicKey, signature, PRESENCE_LABEL, [
    utf8(body.address),
    utf8(body.issuedAt),
    utf8(body.peers.join('\n')),
  ])
}

export function buildHello(secretKey: Uint8Array, fields: Omit<HelloBody, 'sig'>): HelloBody {
  return {
    ...fields,
    sig: encodeBase64Url(signDomain(secretKey, HELLO_LABEL, [utf8(fields.address), utf8(fields.issuedAt)])),
  }
}

export function parseHello(value: unknown): HelloBody | null {
  if (!isRecord(value)) return null
  const address = addressField(value.address)
  const issuedAt = readString(value.issuedAt, 40)
  const sig = sigField(value.sig)
  if (!address || !issuedAt || !sig) return null
  return { address, issuedAt, sig }
}

export function verifyHello(body: HelloBody): boolean {
  const publicKey = publicKeyFromAddress(body.address)
  const signature = decodeFixed(body.sig, 64)
  if (!publicKey || !signature) return false
  return verifyDomain(publicKey, signature, HELLO_LABEL, [utf8(body.address), utf8(body.issuedAt)])
}

export function parseSignal(value: unknown): Signal | null {
  if (!isRecord(value)) return null
  if (value.kind === 'offer' || value.kind === 'answer') {
    if (typeof value.sdp !== 'string' || value.sdp.length < 1 || value.sdp.length > 20_000) return null
    return { kind: value.kind, sdp: value.sdp }
  }
  if (value.kind === 'ice') {
    if (typeof value.candidate !== 'string' || value.candidate.length < 1 || value.candidate.length > 2000) {
      return null
    }
    const sdpMid = value.sdpMid
    const sdpMLineIndex = value.sdpMLineIndex
    if (sdpMid !== null && typeof sdpMid !== 'string') return null
    if (typeof sdpMid === 'string' && sdpMid.length > 32) return null
    if (sdpMLineIndex !== null && (typeof sdpMLineIndex !== 'number' || !Number.isInteger(sdpMLineIndex))) {
      return null
    }
    return {
      kind: 'ice',
      candidate: value.candidate,
      sdpMid: typeof sdpMid === 'string' ? sdpMid : null,
      sdpMLineIndex: typeof sdpMLineIndex === 'number' ? sdpMLineIndex : null,
    }
  }
  return null
}

export function parsePostedLetter(value: unknown): Envelope | null {
  return parseEnvelope(value)
}
