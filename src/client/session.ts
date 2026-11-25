import { randomBytes } from '@noble/ciphers/utils.js'
import { ed25519 } from '@noble/curves/ed25519.js'
import { normalizeAddress, owlAddress, publicKeyFromAddress } from '../crypto/address.ts'
import { createInboxKey } from '../crypto/box.ts'
import {
  copyBytes,
  decodeFixed,
  encodeBase64Url,
  isRecord,
  wipe,
} from '../crypto/bytes.ts'
import { openLetter, parseEnvelope, sealLetter, verifyEnvelope } from '../crypto/letter.ts'
import type { Envelope } from '../crypto/letter.ts'
import { createWrapKey, unwrapSecret, wrapSecret } from '../crypto/wrap.ts'
import { explain } from '../domain/errors.ts'
import { cleanBody, cleanDisplayName, cleanSubject } from '../domain/text.ts'
import {
  evaluateOpen,
  formatDuration,
  localDateISO,
  nextLocalMidnight,
  systemTimeZone,
  todayLabel,
} from '../inbox/daily.ts'
import {
  buildAck,
  buildHello,
  buildOpen,
  buildPresence,
  buildPreview,
  buildRegister,
  parseSignal,
} from '../relay/api.ts'
import type { IdentityRecord, OutboxRecord, SealedRecord } from './db.ts'
import { HedwigDb } from './db.ts'
import { readDirectory, readError, requestJson } from './net.ts'
import type { PeerLetterResult } from './peers.ts'
import { PeerPost } from './peers.ts'
import type { DeskSnapshot, Notice, SentView } from './types.ts'

type LiveOwl = {
  displayName: string
  address: string
  publicKey: Uint8Array
  secretKey: Uint8Array
  wrapKey: Uint8Array
  timezone: string
  inboxPub: string
}

type ReleasePayload = {
  localDate: string
  releasedInboxPub: string
  wrappedPriv: string
  currentInboxPub: string
  envelopes: Envelope[]
}

type PreviewLetter = { id: string; from: string; fromName: string; receivedAt: string }

export class HedwigSession {
  private readonly listeners = new Set<(snapshot: DeskSnapshot) => void>()
  private db: HedwigDb | null = null
  private dbPromise: Promise<HedwigDb> | null = null
  private identity: LiveOwl | null = null
  private peers: PeerPost | null = null
  private ws: WebSocket | null = null
  private retryTimer: number | null = null
  private pulseTimer: number | null = null
  private retryMs = 500
  private run = 0
  private stopped = true
  private opening = false
  private flushing = false
  private creating = false
  private phase: DeskSnapshot['phase'] = 'loading'
  private error: string | null = null
  private relay: DeskSnapshot['relay'] = 'offline'
  private notice: Notice | null = null
  private contacts: { address: string; displayName: string }[] = []
  private sealed: SealedRecord[] = []
  private opened: { id: string; from: string; fromName: string; subject: string; body: string; sentAt: string; openedOn: string }[] = []
  private sent: { id: string; to: string; subject: string; body: string; sentAt: string }[] = []
  private outbox: OutboxRecord[] = []
  private relayPreview: PreviewLetter[] = []
  private meta: { lastOpenedLocalDate: string | null; pendingAckDate: string | null } = {
    lastOpenedLocalDate: null,
    pendingAckDate: null,
  }
  private readonly deskId: string | null

  constructor(deskId: string | null) {
    this.deskId = deskId
  }

  subscribe(listener: (snapshot: DeskSnapshot) => void): () => void {
    this.listeners.add(listener)
    listener(this.view())
    return () => this.listeners.delete(listener)
  }

  async start(): Promise<void> {
    this.stopped = false
    const token = ++this.run
    this.phase = 'loading'
    this.error = null
    this.emit()
    try {
      this.dbPromise ??= HedwigDb.open(this.deskId)
      const db = await this.dbPromise
      if (this.run !== token) return
      this.db = db
      const stored = await db.getIdentity()
      if (!stored) {
        this.phase = 'join'
        this.emit()
        return
      }
      const live = liveFromRecord(stored)
      if (!live) {
        this.fail('This desk’s keys could not be read.')
        return
      }
      this.identity = live
      this.meta = await db.getMeta()
      await this.reload()
      this.phase = 'ready'
      this.emit()
      await this.ensureRegistered()
      if (this.run !== token) return
      this.connectWs()
      this.pulseTimer = window.setInterval(() => {
        void this.tick()
      }, 30_000)
      await this.tick()
    } catch (caught) {
      if (this.run !== token) return
      const message = caught instanceof Error ? caught.message : 'The desk could not open.'
      this.fail(message)
    }
  }

  stop(): void {
    this.run += 1
    this.stopped = true
    if (this.retryTimer !== null) window.clearTimeout(this.retryTimer)
    if (this.pulseTimer !== null) window.clearInterval(this.pulseTimer)
    this.retryTimer = null
    this.pulseTimer = null
    this.ws?.close()
    this.ws = null
    this.peers?.close()
    this.peers = null
    this.relay = 'offline'
  }

  async createOwl(rawName: string): Promise<string | null> {
    const displayName = cleanDisplayName(rawName)
    if (!displayName) return 'Use a name of 1–32 characters.'
    if (this.creating) return null
    if (this.identity || !this.db) return 'The desk is not ready.'
    this.creating = true
    try {
      return await this.createOwlInner(displayName)
    } finally {
      this.creating = false
    }
  }

  private async createOwlInner(displayName: string): Promise<string | null> {
    if (!this.db) return 'The desk is not ready.'
    const generated = ed25519.keygen()
    const secretKey = copyBytes(generated.secretKey)
    const publicKey = copyBytes(generated.publicKey)
    wipe(generated.secretKey)
    const wrapKey = createWrapKey()
    const timezone = systemTimeZone()
    const address = owlAddress(publicKey)
    const live: LiveOwl = {
      displayName,
      address,
      publicKey,
      secretKey,
      wrapKey,
      timezone,
      inboxPub: '',
    }
    const published = await this.publishInbox(live)
    if (typeof published === 'string') {
      wipe(secretKey)
      wipe(wrapKey)
      return published === 'offline' ? 'The relay is not reachable. Start it, then try again.' : explain(published)
    }
    live.inboxPub = published.inboxPub
    const record = this.toRecord(live)
    await this.db.putIdentity(record)
    this.identity = live
    this.phase = 'ready'
    this.emit()
    this.connectWs()
    return null
  }

  async addContact(rawAddress: string): Promise<string | null> {
    if (!this.identity || !this.db) return 'The desk is not ready.'
    const address = normalizeAddress(rawAddress)
    if (!publicKeyFromAddress(address)) return 'That does not look like an owl address.'
    if (address === this.identity.address) return 'That address belongs to this desk.'
    const response = await requestJson(`/v1/owls/${encodeURIComponent(address)}`)
    if (response.status === 0) return 'The relay is not reachable.'
    if (response.status === 404) return 'No owl is using that address.'
    const directory = readDirectory(response.body)
    if (!directory) return 'The relay returned an unexpected directory card.'
    await this.db.putContact({ address: directory.address, displayName: directory.displayName })
    await this.reload()
    this.notice = { tone: 'info', text: `${directory.displayName} can receive letters.` }
    this.emit()
    return null
  }

  async removeContact(address: string): Promise<void> {
    if (!this.db) return
    await this.db.deleteContact(address)
    await this.reload()
    this.emit()
  }

  async sendLetter(to: string, subjectRaw: string, bodyRaw: string): Promise<string | null> {
    const subject = cleanSubject(subjectRaw)
    const body = cleanBody(bodyRaw)
    if (!subject) return 'Give the letter a subject.'
    if (!body) return 'Write a few words before sending.'
    if (!this.identity || !this.db) return 'The desk is not ready.'
    if (!this.contacts.some((contact) => contact.address === to)) return 'Add this correspondent before writing.'
    const draft: OutboxRecord = {
      id: encodeBase64Url(randomBytes(16)),
      to,
      subject,
      body,
      createdAt: new Date().toISOString(),
    }
    await this.db.putOutbox(draft)
    this.outbox = [...this.outbox, draft]
    this.emit()
    await this.flushOutbox()
    return null
  }

  async openInbox(): Promise<string | null> {
    if (!this.identity || !this.db || this.opening) return null
    this.opening = true
    this.emit()
    try {
      return await this.openLoop()
    } finally {
      this.opening = false
      this.emit()
    }
  }

  dismissNotice(): void {
    this.notice = null
    this.emit()
  }

  current(): DeskSnapshot {
    return this.view()
  }

  private async openLoop(): Promise<string | null> {
    if (this.meta.pendingAckDate) {
      const pending = await this.sendAck(this.meta.pendingAckDate)
      if (pending) return pending
    }
    for (let attempt = 0; attempt < 3; attempt += 1) {
      if (!this.identity) return 'The desk is not ready.'
      const today = localDateISO(new Date(), this.identity.timezone)
      const decision = evaluateOpen(
        { timezone: this.identity.timezone, lastOpenedLocalDate: this.meta.lastOpenedLocalDate },
        this.identity.timezone,
        today,
        new Date(),
      )
      if (!decision.ok) return explain(decision.reason)
      const release = await this.requestOpen(today)
      if (typeof release === 'string') return release
      const consumed = await this.consume(release)
      if (consumed) return consumed
      const acked = await this.sendAck(release.localDate)
      if (release.localDate === today) {
        if (acked) {
          this.notice = {
            tone: 'info',
            text: "Today's letters are open. The perch will finish closing when the relay answers.",
          }
        }
        this.emit()
        return null
      }
      if (acked) return acked
    }
    return 'The opening did not finish. Try once more.'
  }

  private async requestOpen(localDate: string): Promise<ReleasePayload | string> {
    if (!this.identity) return 'The desk is not ready.'
    const inbox = createInboxKey()
    const wrappedNewPriv = wrapSecret(inbox.secretKey, this.identity.wrapKey)
    const newInboxPub = encodeBase64Url(inbox.publicKey)
    wipe(inbox.secretKey)
    const response = await requestJson(
      '/v1/open',
      buildOpen(this.identity.secretKey, {
        address: this.identity.address,
        timezone: this.identity.timezone,
        localDate,
        newInboxPub,
        wrappedNewPriv,
        issuedAt: new Date().toISOString(),
      }),
    )
    if (response.status === 0) return 'The relay is not reachable, so the seal stays shut.'
    if (response.status === 200) {
      return parseRelease(response.body) ?? 'The relay returned an opening the desk could not read.'
    }
    const error = readError(response.body)
    if (error === 'already-opened-today' && this.db) {
      this.meta = { ...this.meta, lastOpenedLocalDate: localDate }
      await this.db.putMeta(this.meta)
    }
    return explain(error)
  }

  private async consume(release: ReleasePayload): Promise<string | null> {
    if (!this.identity || !this.db) return 'The desk is not ready.'
    const secret = unwrapSecret(release.wrappedPriv, this.identity.wrapKey)
    if (!secret) return 'The sealed key could not be opened on this desk.'
    const byId = new Map<string, Envelope>()
    for (const envelope of release.envelopes) byId.set(envelope.id, envelope)
    for (const local of this.sealed) {
      if (local.toInbox === release.releasedInboxPub) byId.set(local.id, local.envelope)
    }
    let failed = 0
    try {
      for (const envelope of byId.values()) {
        const opened = openLetter(envelope, secret)
        if (!opened) failed += 1
        else await this.db.putOpened({ ...opened, fromName: envelope.fromName, openedOn: release.localDate })
        await this.db.deleteSealed(envelope.id)
      }
    } finally {
      wipe(secret)
    }
    this.meta = { lastOpenedLocalDate: release.localDate, pendingAckDate: release.localDate }
    await this.db.putMeta(this.meta)
    await this.rememberInbox(release.currentInboxPub)
    await this.reload()
    if (failed > 0) {
      this.notice = {
        tone: 'error',
        text:
          failed === 1
            ? 'One letter failed verification and stayed unread.'
            : `${failed} letters failed verification and stayed unread.`,
      }
    }
    return null
  }

  private async sendAck(localDate: string): Promise<string | null> {
    if (!this.identity || !this.db) return 'The desk is not ready.'
    const response = await requestJson(
      '/v1/ack',
      buildAck(this.identity.secretKey, {
        address: this.identity.address,
        localDate,
        issuedAt: new Date().toISOString(),
      }),
    )
    if (response.status === 0) return 'The relay did not confirm the closing of the seal.'
    if (response.status !== 200) return explain(readError(response.body))
    this.meta = { ...this.meta, pendingAckDate: null }
    await this.db.putMeta(this.meta)
    return null
  }

  private async publishInbox(live: LiveOwl): Promise<{ inboxPub: string } | string> {
    const inbox = createInboxKey()
    const wrappedPriv = wrapSecret(inbox.secretKey, live.wrapKey)
    const inboxPub = encodeBase64Url(inbox.publicKey)
    wipe(inbox.secretKey)
    const response = await requestJson(
      '/v1/register',
      buildRegister(live.secretKey, {
        address: live.address,
        displayName: live.displayName,
        timezone: live.timezone,
        inboxPub,
        wrappedPriv,
        issuedAt: new Date().toISOString(),
      }),
    )
    if (response.status === 0) return 'offline'
    if (response.status === 200) return { inboxPub }
    return readError(response.body)
  }

  private async ensureRegistered(): Promise<void> {
    if (!this.identity) return
    const response = await requestJson(`/v1/owls/${encodeURIComponent(this.identity.address)}`)
    if (response.status === 0) return
    if (response.status === 404) {
      const published = await this.publishInbox(this.identity)
      if (typeof published !== 'string') await this.rememberInbox(published.inboxPub)
      return
    }
    const directory = readDirectory(response.body)
    if (directory && directory.inboxPub !== this.identity.inboxPub) {
      await this.rememberInbox(directory.inboxPub)
    }
  }

  private async rememberInbox(inboxPub: string): Promise<void> {
    if (!this.identity || !this.db) return
    this.identity = { ...this.identity, inboxPub }
    await this.db.putIdentity(this.toRecord(this.identity))
  }

  private toRecord(live: LiveOwl): IdentityRecord {
    return {
      displayName: live.displayName,
      address: live.address,
      publicKey: encodeBase64Url(live.publicKey),
      secretKey: encodeBase64Url(live.secretKey),
      wrapKey: encodeBase64Url(live.wrapKey),
      timezone: live.timezone,
      inboxPub: live.inboxPub,
    }
  }

  private connectWs(): void {
    if (this.stopped || !this.identity) return
    this.relay = 'connecting'
    this.emit()
    const socket = new WebSocket(socketUrl())
    this.ws = socket
    socket.addEventListener('open', () => {
      if (!this.identity || this.ws !== socket) return
      const hello = buildHello(this.identity.secretKey, {
        address: this.identity.address,
        issuedAt: new Date().toISOString(),
      })
      socket.send(JSON.stringify({ type: 'hello', ...hello }))
    })
    socket.addEventListener('message', (event) => {
      if (this.ws !== socket) return
      this.onSocketMessage(event.data)
    })
    socket.addEventListener('close', () => {
      if (this.ws !== socket) return
      this.ws = null
      this.relay = 'offline'
      this.emit()
      if (this.stopped) return
      const wait = this.retryMs
      this.retryMs = Math.min(this.retryMs * 2, 8_000)
      this.retryTimer = window.setTimeout(() => this.connectWs(), wait)
    })
  }

  private onSocketMessage(data: unknown): void {
    let value: unknown = data
    if (typeof data === 'string') {
      try {
        value = JSON.parse(data)
      } catch {
        return
      }
    }
    if (!isRecord(value) || typeof value.type !== 'string') return
    if (value.type === 'hello-ok') {
      this.relay = 'online'
      this.retryMs = 500
      this.ensurePeers()
      this.emit()
      void this.tick()
      return
    }
    if (value.type === 'error' && typeof value.error === 'string') {
      this.notice = { tone: 'error', text: explain(value.error) }
      this.emit()
      return
    }
    if (value.type === 'mail') {
      void this.refreshPreview()
      return
    }
    if (value.type === 'signal' && typeof value.from === 'string') {
      const payload = parseSignal(value.payload)
      if (payload) this.peers?.acceptSignal(value.from, payload)
    }
  }

  private ensurePeers(): void {
    if (this.peers || !this.identity) return
    this.peers = new PeerPost(
      this.identity.address,
      (to, payload) => {
        if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return
        this.ws.send(JSON.stringify({ type: 'signal', to, payload }))
      },
      (envelope) => this.acceptPeerLetter(envelope),
    )
  }

  private acceptPeerLetter(envelope: Envelope): PeerLetterResult {
    if (!this.identity || !this.db) return 'invalid'
    if (!verifyEnvelope(envelope) || envelope.to !== this.identity.address) return 'invalid'
    if (envelope.toInbox !== this.identity.inboxPub) return 'stale-inbox'
    if (this.sealed.some((letter) => letter.id === envelope.id)) return 'ok'
    if (this.opened.some((letter) => letter.id === envelope.id)) return 'ok'
    const record: SealedRecord = {
      id: envelope.id,
      from: envelope.from,
      toInbox: envelope.toInbox,
      envelope,
      receivedAt: new Date().toISOString(),
    }
    this.sealed = [...this.sealed, record]
    void this.db.putSealed(record).then(() => this.emit())
    return 'ok'
  }

  private async tick(): Promise<void> {
    if (this.meta.pendingAckDate) await this.sendAck(this.meta.pendingAckDate)
    if (this.relay === 'online') await this.flushOutbox()
    await this.refreshPreview()
    this.emit()
  }

  private async refreshPreview(): Promise<void> {
    if (!this.identity) return
    const response = await requestJson(
      '/v1/preview',
      buildPreview(this.identity.secretKey, {
        address: this.identity.address,
        issuedAt: new Date().toISOString(),
      }),
    )
    if (response.status !== 200) return
    const letters = parsePreview(response.body)
    if (!letters) return
    this.relayPreview = letters
    this.emit()
  }

  private async flushOutbox(): Promise<void> {
    if (this.flushing || !this.db) return
    this.flushing = true
    try {
      for (const draft of [...this.outbox]) {
        const result = await this.tryDeliver(draft)
        if (result === 'waiting') break
        await this.db.deleteOutbox(draft.id)
        this.outbox = this.outbox.filter((item) => item.id !== draft.id)
        if (result === 'sent') {
          const record = {
            id: draft.id,
            to: draft.to,
            subject: draft.subject,
            body: draft.body,
            sentAt: draft.createdAt,
          }
          await this.db.putSent(record)
          this.sent = [...this.sent, record]
          const name = this.contacts.find((contact) => contact.address === draft.to)?.displayName
          this.notice = { tone: 'info', text: `Letter sent to ${name ?? 'your correspondent'}.` }
        }
        this.emit()
      }
    } finally {
      this.flushing = false
    }
  }

  private async tryDeliver(draft: OutboxRecord): Promise<'sent' | 'waiting' | 'failed'> {
    if (!this.identity) return 'waiting'
    const directory = await this.lookup(draft.to)
    if (directory === 'offline') return 'waiting'
    if (!directory) {
      this.notice = { tone: 'error', text: 'That correspondent is no longer on the relay.' }
      return 'failed'
    }
    let inboxPublic = decodeFixed(directory.inboxPub, 32)
    if (!inboxPublic) return 'failed'
    let envelope = this.sealDraft(draft, inboxPublic)
    if (await this.peerOnline(draft.to)) {
      this.ensurePeers()
      const direct = await this.peers?.deliver(draft.to, envelope, 2500)
      if (direct?.ok) return 'sent'
      if (direct && !direct.ok && direct.reason === 'stale-inbox') {
        const refreshed = await this.lookup(draft.to)
        if (refreshed && refreshed !== 'offline') {
          const next = decodeFixed(refreshed.inboxPub, 32)
          if (next) {
            inboxPublic = next
            envelope = this.sealDraft(draft, inboxPublic)
          }
        }
      }
    }
    const posted = await this.postLetter(envelope)
    if (posted === 'sent') return 'sent'
    if (posted === 'waiting') return 'waiting'
    if (posted === 'stale-inbox') {
      const refreshed = await this.lookup(draft.to)
      if (!refreshed || refreshed === 'offline') return 'waiting'
      const next = decodeFixed(refreshed.inboxPub, 32)
      if (!next) return 'failed'
      const retry = await this.postLetter(this.sealDraft(draft, next))
      if (retry === 'sent') return 'sent'
      if (retry === 'waiting') return 'waiting'
      this.notice = { tone: 'error', text: explain(retry) }
      return 'failed'
    }
    this.notice = { tone: 'error', text: explain(posted) }
    return 'failed'
  }

  private async postLetter(envelope: Envelope): Promise<'sent' | 'waiting' | 'stale-inbox' | string> {
    const response = await requestJson('/v1/letters', envelope)
    if (response.status === 200) return 'sent'
    if (response.status === 0) return 'waiting'
    const error = readError(response.body)
    if (error === 'stale-inbox') return 'stale-inbox'
    return error
  }

  private sealDraft(draft: OutboxRecord, inboxPublic: Uint8Array): Envelope {
    if (!this.identity) throw new Error('missing identity')
    return sealLetter({
      senderSecret: this.identity.secretKey,
    senderAddress: this.identity.address,
    senderName: this.identity.displayName,
    recipientAddress: draft.to,
      inboxPublic,
      subject: draft.subject,
      body: draft.body,
      sentAt: draft.createdAt,
    })
  }

  private async lookup(
    address: string,
  ): Promise<{ inboxPub: string; displayName: string } | 'offline' | null> {
    const response = await requestJson(`/v1/owls/${encodeURIComponent(address)}`)
    if (response.status === 0) return 'offline'
    if (response.status === 404) return null
    const directory = readDirectory(response.body)
    return directory ? { inboxPub: directory.inboxPub, displayName: directory.displayName } : null
  }

  private async peerOnline(address: string): Promise<boolean> {
    if (!this.identity || this.relay !== 'online') return false
    const response = await requestJson(
      '/v1/presence',
      buildPresence(this.identity.secretKey, {
        address: this.identity.address,
        peers: [address],
        issuedAt: new Date().toISOString(),
      }),
    )
    if (response.status !== 200 || !isRecord(response.body) || !Array.isArray(response.body.online)) {
      return false
    }
    return response.body.online.includes(address)
  }

  private async reload(): Promise<void> {
    if (!this.db) return
    this.contacts = await this.db.listContacts()
    this.sealed = await this.db.listSealed()
    this.opened = await this.db.listOpened()
    this.sent = await this.db.listSent()
    this.outbox = await this.db.listOutbox()
    this.meta = await this.db.getMeta()
  }

  private fail(message: string): void {
    this.phase = 'error'
    this.error = message
    this.emit()
  }

  private emit(): void {
    const snapshot = this.view()
    for (const listener of this.listeners) listener(snapshot)
  }

  private view(): DeskSnapshot {
    const zone = this.identity?.timezone ?? systemTimeZone()
    const now = new Date()
    const today = this.identity ? localDateISO(now, zone) : ''
    const openedToday = Boolean(this.identity && this.meta.lastOpenedLocalDate === today)
    const names = new Map(this.contacts.map((contact) => [contact.address, contact.displayName]))
    const localSealed = this.sealed.filter((letter) => !openedToday || letter.toInbox === this.identity?.inboxPub)
    const seen = new Set(localSealed.map((letter) => letter.id))
    const sealed = [
      ...localSealed.map((letter) => ({
        id: letter.id,
        from: letter.from,
        fromName: names.get(letter.from) ?? letter.envelope.fromName,
        receivedAt: letter.receivedAt,
      })),
      ...this.relayPreview
        .filter((letter) => !seen.has(letter.id))
        .map((letter) => ({
          id: letter.id,
          from: letter.from,
          fromName: names.get(letter.from) ?? letter.fromName,
          receivedAt: letter.receivedAt,
        })),
    ].sort((left, right) => left.receivedAt.localeCompare(right.receivedAt))
    const letters = this.opened
      .map((letter) => ({
        ...letter,
        fromName: names.get(letter.from) ?? letter.fromName,
      }))
      .sort((left, right) => right.sentAt.localeCompare(left.sentAt))
    const next = openedToday ? nextLocalMidnight(now, zone) : null
    return {
      phase: this.phase,
      deskLabel: this.deskId,
      error: this.error,
      relay: this.relay,
      profile: this.identity
        ? {
            displayName: this.identity.displayName,
            address: this.identity.address,
            timezone: this.identity.timezone,
          }
        : null,
      todayLabel: today ? todayLabel(now, zone) : '',
      contacts: [...this.contacts].sort((left, right) => left.displayName.localeCompare(right.displayName)),
      sealed,
      openedToday,
      todayLetters: letters.filter((letter) => letter.openedOn === today),
      earlierLetters: letters.filter((letter) => letter.openedOn !== today),
      sent: sentViews(this.outbox, this.sent, names),
      nextOpenLabel: next ? `The perch opens again at midnight (${formatDuration(next.getTime() - now.getTime())}).` : null,
      notice: this.notice,
      opening: this.opening,
    }
  }
}

function liveFromRecord(record: IdentityRecord): LiveOwl | null {
  const publicKey = decodeFixed(record.publicKey, 32)
  const secretKey = decodeFixed(record.secretKey, 32)
  const wrapKey = decodeFixed(record.wrapKey, 32)
  if (!publicKey || !secretKey || !wrapKey) return null
  if (owlAddress(publicKey) !== record.address) return null
  return {
    displayName: record.displayName,
    address: record.address,
    publicKey,
    secretKey,
    wrapKey,
    timezone: record.timezone,
    inboxPub: record.inboxPub,
  }
}

function parseRelease(body: unknown): ReleasePayload | null {
  if (!isRecord(body) || body.ok !== true) return null
  if (typeof body.localDate !== 'string' || typeof body.releasedInboxPub !== 'string') return null
  if (typeof body.wrappedPriv !== 'string' || typeof body.currentInboxPub !== 'string') return null
  if (!Array.isArray(body.envelopes)) return null
  const envelopes: Envelope[] = []
  for (const entry of body.envelopes) {
    if (!isRecord(entry)) return null
    const envelope = parseEnvelope(entry.envelope)
    if (!envelope) return null
    envelopes.push(envelope)
  }
  return {
    localDate: body.localDate,
    releasedInboxPub: body.releasedInboxPub,
    wrappedPriv: body.wrappedPriv,
    currentInboxPub: body.currentInboxPub,
    envelopes,
  }
}

function parsePreview(body: unknown): PreviewLetter[] | null {
  if (!isRecord(body) || !Array.isArray(body.letters)) return null
  const letters: PreviewLetter[] = []
  for (const entry of body.letters) {
    if (!isRecord(entry)) return null
    if (typeof entry.id !== 'string' || typeof entry.from !== 'string' || typeof entry.fromName !== 'string') {
      return null
    }
    if (typeof entry.receivedAt !== 'string') return null
    letters.push({ id: entry.id, from: entry.from, fromName: entry.fromName, receivedAt: entry.receivedAt })
  }
  return letters
}

function sentViews(
  outbox: OutboxRecord[],
  sent: { id: string; to: string; subject: string; body: string; sentAt: string }[],
  names: Map<string, string>,
): SentView[] {
  const waiting: SentView[] = outbox.map((letter) => ({
    id: letter.id,
    to: letter.to,
    toName: names.get(letter.to) ?? null,
    subject: letter.subject,
    body: letter.body,
    sentAt: letter.createdAt,
    status: 'waiting',
  }))
  const delivered: SentView[] = sent.map((letter) => ({
    id: letter.id,
    to: letter.to,
    toName: names.get(letter.to) ?? null,
    subject: letter.subject,
    body: letter.body,
    sentAt: letter.sentAt,
    status: 'delivered',
  }))
  return [...waiting, ...delivered]
}

function socketUrl(): string {
  const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
  return `${protocol}//${window.location.host}/ws`
}
