import { isUsableInboxPublic } from '../crypto/box.ts'
import { decodeFixed } from '../crypto/bytes.ts'
import type { Envelope } from '../crypto/letter.ts'
import { verifyEnvelope } from '../crypto/letter.ts'
import type { Clock } from '../inbox/clock.ts'
import { evaluateOpen, issuedAtFresh } from '../inbox/daily.ts'
import type { AckBody, OpenBody, PreviewBody, RegisterBody } from './api.ts'
import { verifyAck, verifyOpen, verifyPreview, verifyRegister } from './api.ts'

const MAILBOX_MAX = 200

export type HeldLetter = {
  envelope: Envelope
  receivedAt: string
}

export type ReleaseRecord = {
  localDate: string
  acked: boolean
  inboxPub: string
  wrappedPriv: string
  envelopes: HeldLetter[]
  releasedAt: string
}

export type OwlRecord = {
  address: string
  displayName: string
  timezone: string
  inboxPub: string
  wrappedPriv: string
  mailbox: HeldLetter[]
  release: ReleaseRecord | null
  lastAckedLocalDate: string | null
}

export type RelaySnapshot = {
  version: 1
  owls: OwlRecord[]
}

export type StoreFailure = { ok: false; status: number; error: string }

export type DirectoryEntry = {
  ok: true
  address: string
  displayName: string
  inboxPub: string
}

export type PreviewLetter = {
  id: string
  from: string
  fromName: string
  receivedAt: string
}

export type OpenResult = {
  ok: true
  replay: boolean
  localDate: string
  releasedInboxPub: string
  wrappedPriv: string
  envelopes: HeldLetter[]
  currentInboxPub: string
}

function fail(status: number, error: string): StoreFailure {
  return { ok: false, status, error }
}

function cloneLetter(letter: HeldLetter): HeldLetter {
  return {
    receivedAt: letter.receivedAt,
    envelope: { ...letter.envelope },
  }
}

function cloneOwl(owl: OwlRecord): OwlRecord {
  return {
    address: owl.address,
    displayName: owl.displayName,
    timezone: owl.timezone,
    inboxPub: owl.inboxPub,
    wrappedPriv: owl.wrappedPriv,
    mailbox: owl.mailbox.map(cloneLetter),
    release: owl.release
      ? {
          localDate: owl.release.localDate,
          acked: owl.release.acked,
          inboxPub: owl.release.inboxPub,
          wrappedPriv: owl.release.wrappedPriv,
          releasedAt: owl.release.releasedAt,
          envelopes: owl.release.envelopes.map(cloneLetter),
        }
      : null,
    lastAckedLocalDate: owl.lastAckedLocalDate,
  }
}

export class MailboxStore {
  private readonly owls = new Map<string, OwlRecord>()
  private readonly listeners = new Set<() => void>()
  private readonly clock: Clock

  constructor(clock: Clock) {
    this.clock = clock
  }

  subscribe(listener: () => void): () => void {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }

  snapshot(): RelaySnapshot {
    return { version: 1, owls: [...this.owls.values()].map(cloneOwl) }
  }

  replace(snapshot: RelaySnapshot): void {
    this.owls.clear()
    for (const owl of snapshot.owls) this.owls.set(owl.address, cloneOwl(owl))
  }

  has(address: string): boolean {
    return this.owls.has(address)
  }

  now(): Date {
    return this.clock.now()
  }

  register(body: RegisterBody): { ok: true } | StoreFailure {
    if (!issuedAtFresh(body.issuedAt, this.clock.now())) return fail(401, 'stale-request')
    if (!verifyRegister(body)) return fail(401, 'bad-signature')
    const inboxPub = decodeFixed(body.inboxPub, 32)
    if (!inboxPub || !isUsableInboxPublic(inboxPub)) return fail(400, 'bad-inbox-key')
    const existing = this.owls.get(body.address)
    if (existing) {
      const same =
        existing.displayName === body.displayName &&
        existing.timezone === body.timezone &&
        existing.inboxPub === body.inboxPub &&
        existing.wrappedPriv === body.wrappedPriv
      if (same) return { ok: true }
      return fail(409, 'already-registered')
    }
    this.owls.set(body.address, {
      address: body.address,
      displayName: body.displayName,
      timezone: body.timezone,
      inboxPub: body.inboxPub,
      wrappedPriv: body.wrappedPriv,
      mailbox: [],
      release: null,
      lastAckedLocalDate: null,
    })
    this.touch()
    return { ok: true }
  }

  directory(address: string): DirectoryEntry | StoreFailure {
    const owl = this.owls.get(address)
    if (!owl) return fail(404, 'unknown-owl')
    return {
      ok: true,
      address: owl.address,
      displayName: owl.displayName,
      inboxPub: owl.inboxPub,
    }
  }

  postLetter(envelope: Envelope): { ok: true } | StoreFailure {
    if (!verifyEnvelope(envelope)) return fail(401, 'bad-signature')
    const recipient = this.owls.get(envelope.to)
    if (!recipient) return fail(404, 'unknown-owl')
    if (envelope.toInbox !== recipient.inboxPub) return fail(409, 'stale-inbox')
    if (recipient.mailbox.some((letter) => letter.envelope.id === envelope.id)) return { ok: true }
    if (recipient.release?.envelopes.some((letter) => letter.envelope.id === envelope.id)) {
      return { ok: true }
    }
    if (recipient.mailbox.length >= MAILBOX_MAX) return fail(409, 'mailbox-full')
    recipient.mailbox.push({
      envelope: { ...envelope },
      receivedAt: this.clock.now().toISOString(),
    })
    this.touch()
    return { ok: true }
  }

  preview(body: PreviewBody): { ok: true; letters: PreviewLetter[] } | StoreFailure {
    if (!issuedAtFresh(body.issuedAt, this.clock.now())) return fail(401, 'stale-request')
    if (!verifyPreview(body)) return fail(401, 'bad-signature')
    const owl = this.owls.get(body.address)
    if (!owl) return fail(404, 'unknown-owl')
    return {
      ok: true,
      letters: owl.mailbox.map((letter) => ({
        id: letter.envelope.id,
        from: letter.envelope.from,
        fromName: letter.envelope.fromName,
        receivedAt: letter.receivedAt,
      })),
    }
  }

  open(body: OpenBody): OpenResult | StoreFailure {
    if (!issuedAtFresh(body.issuedAt, this.clock.now())) return fail(401, 'stale-request')
    if (!verifyOpen(body)) return fail(401, 'bad-signature')
    const owl = this.owls.get(body.address)
    if (!owl) return fail(404, 'unknown-owl')
    if (owl.release && !owl.release.acked) {
      return this.releasePayload(owl, true)
    }
    const decision = evaluateOpen(
      { timezone: owl.timezone, lastOpenedLocalDate: owl.lastAckedLocalDate },
      body.timezone,
      body.localDate,
      this.clock.now(),
    )
    if (!decision.ok) return fail(409, decision.reason)
    const nextPub = decodeFixed(body.newInboxPub, 32)
    if (!nextPub || !isUsableInboxPublic(nextPub)) return fail(400, 'bad-inbox-key')
    if (body.newInboxPub === owl.inboxPub) return fail(400, 'bad-inbox-key')
    const releasedAt = this.clock.now().toISOString()
    owl.release = {
      localDate: body.localDate,
      acked: false,
      inboxPub: owl.inboxPub,
      wrappedPriv: owl.wrappedPriv,
      envelopes: owl.mailbox.map(cloneLetter),
      releasedAt,
    }
    owl.inboxPub = body.newInboxPub
    owl.wrappedPriv = body.wrappedNewPriv
    owl.mailbox = []
    this.touch()
    return this.releasePayload(owl, false)
  }

  ack(body: AckBody): { ok: true } | StoreFailure {
    if (!issuedAtFresh(body.issuedAt, this.clock.now())) return fail(401, 'stale-request')
    if (!verifyAck(body)) return fail(401, 'bad-signature')
    const owl = this.owls.get(body.address)
    if (!owl) return fail(404, 'unknown-owl')
    if (!owl.release) return { ok: true }
    if (owl.release.localDate !== body.localDate) return fail(409, 'pending-ack')
    if (!owl.release.acked) {
      owl.release = {
        localDate: owl.release.localDate,
        acked: true,
        inboxPub: '',
        wrappedPriv: '',
        envelopes: [],
        releasedAt: owl.release.releasedAt,
      }
      owl.lastAckedLocalDate = body.localDate
      this.touch()
    }
    return { ok: true }
  }

  private releasePayload(owl: OwlRecord, replay: boolean): OpenResult | StoreFailure {
    if (!owl.release) return fail(409, 'pending-ack')
    return {
      ok: true,
      replay,
      localDate: owl.release.localDate,
      releasedInboxPub: owl.release.inboxPub,
      wrappedPriv: owl.release.wrappedPriv,
      envelopes: owl.release.envelopes.map(cloneLetter),
      currentInboxPub: owl.inboxPub,
    }
  }

  private touch(): void {
    for (const listener of this.listeners) listener()
  }
}
