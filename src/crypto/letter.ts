import { ed25519 } from '@noble/curves/ed25519.js'
import { randomBytes } from '@noble/ciphers/utils.js'
import { cleanBody, cleanDisplayName, cleanSubject } from '../domain/text.ts'
import { publicKeyFromAddress } from './address.ts'
import { openBox, sealBox } from './box.ts'
import {
  concatBytes,
  copyBytes,
  decodeBase64Url,
  decodeFixed,
  encodeBase64Url,
  fromUtf8,
  isRecord,
  lenPref,
  utf8,
} from './bytes.ts'

export const LETTER_AAD = 'hedwig.v1.letter-aad'
const CT_MAX = 12000

export type Envelope = {
  v: 1
  id: string
  from: string
  fromName: string
  to: string
  toInbox: string
  ephPub: string
  nonce: string
  ct: string
  sig: string
}

export type ReadableLetter = {
  id: string
  from: string
  to: string
  subject: string
  body: string
  sentAt: string
}

type LetterFields = {
  id: string
  from: string
  fromName: string
  to: string
  toInbox: Uint8Array
}

function letterAad(fields: LetterFields): Uint8Array {
  return concatBytes([
    utf8(LETTER_AAD),
    lenPref(utf8(fields.id)),
    lenPref(utf8(fields.from)),
    lenPref(utf8(fields.fromName)),
    lenPref(utf8(fields.to)),
    fields.toInbox,
  ])
}

function validId(id: string): boolean {
  return /^[A-Za-z0-9_-]{16,32}$/.test(id)
}

function validTimestamp(value: string): boolean {
  if (value.length < 16 || value.length > 40) return false
  return !Number.isNaN(Date.parse(value))
}

export function parseEnvelope(value: unknown): Envelope | null {
  if (!isRecord(value)) return null
  if (value.v !== 1) return null
  const id = value.id
  const from = value.from
  const fromName = value.fromName
  const to = value.to
  const toInbox = value.toInbox
  const ephPub = value.ephPub
  const nonce = value.nonce
  const ct = value.ct
  const sig = value.sig
  if (typeof id !== 'string' || !validId(id)) return null
  if (typeof from !== 'string' || typeof fromName !== 'string' || typeof to !== 'string') return null
  if (cleanDisplayName(fromName) !== fromName) return null
  if (from === to) return null
  if (typeof toInbox !== 'string' || typeof ephPub !== 'string') return null
  if (typeof nonce !== 'string' || typeof ct !== 'string' || typeof sig !== 'string') return null
  if (!publicKeyFromAddress(from) || !publicKeyFromAddress(to)) return null
  if (!decodeFixed(toInbox, 32) || !decodeFixed(ephPub, 32)) return null
  if (!decodeFixed(nonce, 24) || !decodeFixed(sig, 64)) return null
  const ciphertext = decodeBase64Url(ct)
  if (!ciphertext || ciphertext.length < 16 || ciphertext.length > CT_MAX) return null
  return { v: 1, id, from, fromName, to, toInbox, ephPub, nonce, ct, sig }
}

export function verifyEnvelope(envelope: Envelope): boolean {
  const sender = publicKeyFromAddress(envelope.from)
  const toInbox = decodeFixed(envelope.toInbox, 32)
  const ephPub = decodeFixed(envelope.ephPub, 32)
  const nonce = decodeFixed(envelope.nonce, 24)
  const ciphertext = decodeBase64Url(envelope.ct)
  const signature = decodeFixed(envelope.sig, 64)
  if (!sender || !toInbox || !ephPub || !nonce || !ciphertext || !signature) return false
  const payload = concatBytes([
    letterAad({ id: envelope.id, from: envelope.from, fromName: envelope.fromName, to: envelope.to, toInbox }),
    ephPub,
    nonce,
    lenPref(ciphertext),
  ])
  try {
    return ed25519.verify(signature, payload, sender)
  } catch {
    return false
  }
}

function parsePlaintext(bytes: Uint8Array): { subject: string; body: string; sentAt: string } | null {
  let value: unknown
  try {
    value = JSON.parse(fromUtf8(bytes))
  } catch {
    return null
  }
  if (!isRecord(value)) return null
  const { subject, body, sentAt } = value
  if (typeof subject !== 'string' || typeof body !== 'string' || typeof sentAt !== 'string') return null
  if (cleanSubject(subject) !== subject || cleanBody(body) !== body) return null
  if (!validTimestamp(sentAt)) return null
  return { subject, body, sentAt }
}

export function sealLetter(input: {
  senderSecret: Uint8Array
  senderAddress: string
  senderName: string
  recipientAddress: string
  inboxPublic: Uint8Array
  subject: string
  body: string
  sentAt: string
  id?: string
}): Envelope {
  const subject = cleanSubject(input.subject)
  const body = cleanBody(input.body)
  const fromName = cleanDisplayName(input.senderName)
  if (!subject || !body || !fromName || !validTimestamp(input.sentAt)) {
    throw new Error('invalid-letter')
  }
  if (!publicKeyFromAddress(input.senderAddress) || !publicKeyFromAddress(input.recipientAddress)) {
    throw new Error('invalid-address')
  }
  if (input.senderAddress === input.recipientAddress) throw new Error('invalid-letter')
  const id = input.id ?? encodeBase64Url(randomBytes(16))
  if (!validId(id)) throw new Error('invalid-letter')
  const plaintext = utf8(JSON.stringify({ body, sentAt: input.sentAt, subject }))
  const aad = letterAad({
    id,
    from: input.senderAddress,
    fromName,
    to: input.recipientAddress,
    toInbox: input.inboxPublic,
  })
  const sealed = sealBox(plaintext, input.inboxPublic, aad)
  const payload = concatBytes([aad, sealed.ephPub, sealed.nonce, lenPref(sealed.ciphertext)])
  const signature = ed25519.sign(payload, input.senderSecret)
  return {
    v: 1,
    id,
    from: input.senderAddress,
    fromName,
    to: input.recipientAddress,
    toInbox: encodeBase64Url(input.inboxPublic),
    ephPub: encodeBase64Url(sealed.ephPub),
    nonce: encodeBase64Url(sealed.nonce),
    ct: encodeBase64Url(sealed.ciphertext),
    sig: encodeBase64Url(copyBytes(signature)),
  }
}

export function openLetter(envelope: Envelope, inboxSecret: Uint8Array): ReadableLetter | null {
  if (!verifyEnvelope(envelope)) return null
  const toInbox = decodeFixed(envelope.toInbox, 32)
  const ephPub = decodeFixed(envelope.ephPub, 32)
  const nonce = decodeFixed(envelope.nonce, 24)
  const ciphertext = decodeBase64Url(envelope.ct)
  if (!toInbox || !ephPub || !nonce || !ciphertext) return null
  const aad = letterAad({
    id: envelope.id,
    from: envelope.from,
    fromName: envelope.fromName,
    to: envelope.to,
    toInbox,
  })
  const plaintext = openBox({ ephPub, nonce, ciphertext }, inboxSecret, aad)
  if (!plaintext) return null
  const parsed = parsePlaintext(plaintext)
  if (!parsed) return null
  return {
    id: envelope.id,
    from: envelope.from,
    to: envelope.to,
    subject: parsed.subject,
    body: parsed.body,
    sentAt: parsed.sentAt,
  }
}
