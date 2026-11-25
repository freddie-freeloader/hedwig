import { ed25519 } from '@noble/curves/ed25519.js'
import { owlAddress } from '../src/crypto/address.ts'
import { createInboxKey } from '../src/crypto/box.ts'
import { copyBytes, decodeFixed, encodeBase64Url, wipe } from '../src/crypto/bytes.ts'
import { sealLetter, type Envelope } from '../src/crypto/letter.ts'
import { createWrapKey, wrapSecret } from '../src/crypto/wrap.ts'
import type { Clock } from '../src/inbox/clock.ts'
import { localDateISO } from '../src/inbox/daily.ts'
import { buildAck, buildOpen, buildPreview, buildRegister, type OpenBody } from '../src/relay/api.ts'
import type { MailboxStore } from '../src/relay/store.ts'

export type TestOwl = {
  name: string
  timezone: string
  address: string
  secretKey: Uint8Array
  wrapKey: Uint8Array
  inboxSecret: Uint8Array
  inboxPub: string
  wrappedPriv: string
}

export function makeOwl(name: string, timezone: string): TestOwl {
  const generated = ed25519.keygen()
  const secretKey = copyBytes(generated.secretKey)
  const publicKey = copyBytes(generated.publicKey)
  wipe(generated.secretKey)
  const inbox = createInboxKey()
  const wrapKey = createWrapKey()
  const inboxPub = encodeBase64Url(inbox.publicKey)
  const wrappedPriv = wrapSecret(inbox.secretKey, wrapKey)
  return {
    name,
    timezone,
    address: owlAddress(publicKey),
    secretKey,
    wrapKey,
    inboxSecret: inbox.secretKey,
    inboxPub,
    wrappedPriv,
  }
}

export function registerOwl(store: MailboxStore, owl: TestOwl, clock: Clock) {
  return store.register(
    buildRegister(owl.secretKey, {
      address: owl.address,
      displayName: owl.name,
      timezone: owl.timezone,
      inboxPub: owl.inboxPub,
      wrappedPriv: owl.wrappedPriv,
      issuedAt: clock.now().toISOString(),
    }),
  )
}

export function openBody(owl: TestOwl, clock: Clock, inboxPub: string, wrappedPriv: string): OpenBody {
  return buildOpen(owl.secretKey, {
    address: owl.address,
    timezone: owl.timezone,
    localDate: localDateISO(clock.now(), owl.timezone),
    newInboxPub: inboxPub,
    wrappedNewPriv: wrappedPriv,
    issuedAt: clock.now().toISOString(),
  })
}

export function rotate(owl: TestOwl): { inboxPub: string; wrappedPriv: string } {
  const inbox = createInboxKey()
  const inboxPub = encodeBase64Url(inbox.publicKey)
  const wrappedPriv = wrapSecret(inbox.secretKey, owl.wrapKey)
  wipe(inbox.secretKey)
  return { inboxPub, wrappedPriv }
}

export function previewBody(owl: TestOwl, clock: Clock) {
  return buildPreview(owl.secretKey, {
    address: owl.address,
    issuedAt: clock.now().toISOString(),
  })
}

export function ackBody(owl: TestOwl, clock: Clock, localDate: string) {
  return buildAck(owl.secretKey, {
    address: owl.address,
    localDate,
    issuedAt: clock.now().toISOString(),
  })
}

export function letterTo(sender: TestOwl, recipientAddress: string, inboxPub: string, subject: string, body: string, sentAt: string): Envelope {
  const inboxPublic = decodeFixed(inboxPub, 32)
  if (!inboxPublic) throw new Error('inbox public key did not decode')
  return sealLetter({
    senderSecret: sender.secretKey,
    senderAddress: sender.address,
    senderName: sender.name,
    recipientAddress,
    inboxPublic,
    subject,
    body,
    sentAt,
  })
}
