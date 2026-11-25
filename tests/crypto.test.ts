import { describe, expect, it } from 'vitest'
import { ed25519 } from '@noble/curves/ed25519.js'
import { owlAddress, publicKeyFromAddress } from '../src/crypto/address.ts'
import { createInboxKey, isUsableInboxPublic, openBox, sealBox } from '../src/crypto/box.ts'
import { copyBytes, decodeBase64Url, encodeBase64Url, utf8, wipe } from '../src/crypto/bytes.ts'
import { openLetter, sealLetter, verifyEnvelope } from '../src/crypto/letter.ts'
import { unwrapSecret, wrapSecret } from '../src/crypto/wrap.ts'

const SUBJECT = 'The silver larch does not repeat this phrase'
const BODY = 'Bring the spare key to the north gate, and do not mention the larch.'

function identity() {
  const generated = ed25519.keygen()
  const secretKey = copyBytes(generated.secretKey)
  const publicKey = copyBytes(generated.publicKey)
  wipe(generated.secretKey)
  return { secretKey, publicKey, address: owlAddress(publicKey) }
}

describe('owl addresses', () => {
  it('round-trips a public key and rejects a flipped checksum', () => {
    const owl = identity()
    expect(publicKeyFromAddress(owl.address)).toEqual(owl.publicKey)
    const flipped = `${owl.address.slice(0, -1)}${owl.address.endsWith('a') ? 'b' : 'a'}`
    expect(publicKeyFromAddress(flipped)).toBeNull()
    expect(publicKeyFromAddress('owl1not-an-address')).toBeNull()
  })
})

describe('base64url', () => {
  it('round-trips empty, short, and key-sized buffers', () => {
    for (const length of [0, 1, 2, 3, 32, 72]) {
      const bytes = new Uint8Array(length)
      for (let index = 0; index < length; index += 1) bytes[index] = (index * 17 + 3) % 256
      expect(decodeBase64Url(encodeBase64Url(bytes))).toEqual(bytes)
    }
    expect(decodeBase64Url('****')).toBeNull()
    expect(decodeBase64Url('abcde')).toBeNull()
  })
})

describe('sealed boxes', () => {
  it('opens for the recipient and fails closed for everyone else', () => {
    const recipient = createInboxKey()
    const other = createInboxKey()
    const aad = utf8('desk')
    const box = sealBox(utf8('a folded note'), recipient.publicKey, aad)
    expect(openBox(box, recipient.secretKey, aad)).toEqual(utf8('a folded note'))
    expect(openBox(box, other.secretKey, aad)).toBeNull()
    expect(openBox(box, recipient.secretKey, utf8('other'))).toBeNull()
    const tampered = { ...box, ciphertext: copyBytes(box.ciphertext) }
    const index = tampered.ciphertext.length - 1
    tampered.ciphertext[index] = (tampered.ciphertext[index] ?? 0) ^ 1
    expect(openBox(tampered, recipient.secretKey, aad)).toBeNull()
    wipe(recipient.secretKey)
    wipe(other.secretKey)
  })

  it('rejects a low-order inbox public key', () => {
    expect(isUsableInboxPublic(new Uint8Array(32))).toBe(false)
    const inbox = createInboxKey()
    expect(isUsableInboxPublic(inbox.publicKey)).toBe(true)
    wipe(inbox.secretKey)
  })
})

describe('inbox key wrapping', () => {
  it('round-trips the secret and rejects a damaged blob', () => {
    const inbox = createInboxKey()
    const wrapKey = new Uint8Array(32).fill(7)
    const wrapped = wrapSecret(inbox.secretKey, wrapKey)
    expect(wrapped).not.toBe(encodeBase64Url(inbox.secretKey))
    expect(unwrapSecret(wrapped, wrapKey)).toEqual(inbox.secretKey)
    expect(unwrapSecret(wrapped, new Uint8Array(32).fill(8))).toBeNull()
    const damaged = `${wrapped.slice(0, -1)}${wrapped.endsWith('a') ? 'b' : 'a'}`
    expect(unwrapSecret(damaged, wrapKey)).toBeNull()
    wipe(inbox.secretKey)
  })
})

describe('letters', () => {
  it('seals a letter so only the inbox key can read it', () => {
    const sender = identity()
    const recipient = identity()
    const inbox = createInboxKey()
    const sentAt = '2026-11-25T15:04:00.000Z'
    const envelope = sealLetter({
      senderSecret: sender.secretKey,
      senderAddress: sender.address,
      senderName: 'Alba',
      recipientAddress: recipient.address,
      inboxPublic: inbox.publicKey,
      subject: SUBJECT,
      body: BODY,
      sentAt,
    })
    expect(envelope.ct.includes(SUBJECT)).toBe(false)
    expect(envelope.ct.includes(BODY)).toBe(false)
    expect(envelope.fromName).toBe('Alba')
    expect(verifyEnvelope(envelope)).toBe(true)
    expect(verifyEnvelope({ ...envelope, fromName: 'Someone else' })).toBe(false)
    expect(openLetter(envelope, inbox.secretKey)).toEqual({
      id: envelope.id,
      from: sender.address,
      to: recipient.address,
      subject: SUBJECT,
      body: BODY,
      sentAt,
    })

    const stranger = createInboxKey()
    expect(openLetter(envelope, stranger.secretKey)).toBeNull()

    const forged = { ...envelope, ct: `${envelope.ct.slice(0, -2)}aa` }
    expect(verifyEnvelope(forged)).toBe(false)
    expect(openLetter(forged, inbox.secretKey)).toBeNull()

    const swapped = { ...envelope, from: recipient.address }
    expect(verifyEnvelope(swapped)).toBe(false)

    wipe(inbox.secretKey)
    wipe(stranger.secretKey)
    wipe(sender.secretKey)
    wipe(recipient.secretKey)
  })
})
