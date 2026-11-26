import { ed25519, x25519 } from '@noble/curves/ed25519.js'
import { sha256 } from '@noble/hashes/sha256.js'
import { randomBytes } from '@noble/ciphers/utils.js'
import { timelockDecrypt, timelockEncrypt, Buffer } from 'tlock-js'
import { quicknetClient } from 'drand-client'
import { roundForReleaseMs } from './drand.ts'
import { concatBytes, decodeBase64Url, encodeBase64Url } from './crypto/bytes.ts'
import { openBox, sealBox } from './crypto/box.ts'
import { reassembleTransfer, splitTransfer } from './transfer.ts'
import type { ChunkSession } from './transfer.ts'
import { createSignalingEnvelope, parseSignalingEnvelope } from './signaling.ts'

type ElmApp = {
  ports: {
    themeChanged: { subscribe: (callback: (theme: string) => void) => void }
    initializeIdentity: { send: (payload: { name: string }) => void; subscribe?: (callback: (payload: unknown) => void) => void }
    createOffer: { send: (payload: null) => void; subscribe?: (callback: (payload: unknown) => void) => void }
    acceptOffer: { send: (payload: string) => void; subscribe?: (callback: (payload: unknown) => void) => void }
    setRemoteAnswer: { send: (payload: string) => void; subscribe?: (callback: (payload: unknown) => void) => void }
    prepareEnvelope: {
      send: (payload: {
        recipient: string
        subject: string
        body: string
        releaseHours: number
        releaseSeconds: number
      }) => void
      subscribe?: (callback: (payload: unknown) => void) => void
    }
    decryptEnvelope: { send: (payload: string) => void; subscribe?: (callback: (payload: unknown) => void) => void }
    identityLoaded: { send: (payload: unknown) => void }
    offerCreated: { send: (payload: unknown) => void }
    answerCreated: { send: (payload: unknown) => void }
    connectionStatus: { send: (payload: unknown) => void }
    envelopeSent: { send: (payload: unknown) => void }
    envelopeReceived: { send: (payload: unknown) => void }
    letterDecrypted: { send: (payload: unknown) => void }
    bridgeError: { send: (payload: unknown) => void }
    debugLog: { send: (payload: unknown) => void }
    saveDraft: { send: (payload: unknown) => void; subscribe?: (callback: (payload: unknown) => void) => void }
    saveContact: { send: (payload: unknown) => void; subscribe?: (callback: (payload: unknown) => void) => void }
    stateLoaded: { send: (payload: unknown) => void }
    exportIdentity: { send: (payload: unknown) => void; subscribe?: (callback: (payload: unknown) => void) => void }
    identityExported: { send: (payload: unknown) => void }
    importIdentity: { send: (payload: unknown) => void; subscribe?: (callback: (payload: unknown) => void) => void }
    downloadIdentity: { send: (payload: unknown) => void; subscribe?: (callback: (payload: unknown) => void) => void }
    importIdentityFile: { send: (payload: unknown) => void; subscribe?: (callback: (payload: unknown) => void) => void }
    identityFileLoaded: { send: (payload: unknown) => void }
    resetConnection: { send: (payload: unknown) => void; subscribe?: (callback: (payload: unknown) => void) => void }
    archiveOutbox: { send: (payload: unknown) => void; subscribe?: (callback: (payload: unknown) => void) => void }
    archiveSent: { send: (payload: unknown) => void; subscribe?: (callback: (payload: unknown) => void) => void }
    restoreOutbox: { send: (payload: unknown) => void; subscribe?: (callback: (payload: unknown) => void) => void }
    deleteArchivedOutbox: { send: (payload: unknown) => void; subscribe?: (callback: (payload: unknown) => void) => void }
    restoreSent: { send: (payload: unknown) => void; subscribe?: (callback: (payload: unknown) => void) => void }
    deleteArchivedSent: { send: (payload: unknown) => void; subscribe?: (callback: (payload: unknown) => void) => void }
    retryEnvelope: { send: (payload: unknown) => void; subscribe?: (callback: (payload: unknown) => void) => void }
    outboxUpdated: { send: (payload: unknown) => void }
  }
}

type Identity = {
  name: string
  address: string
  edSecret: Uint8Array
  edPublic: Uint8Array
  xSecret: Uint8Array
  xPublic: Uint8Array
}

type StoredIdentity = {
  name: string
  edSecret: string
  edPublic: string
  xSecret: string
  xPublic: string
  address: string
}

const QUICKNET_HASH = '52db9ba70e0cc0f6eaf7803dd07447a1f5477735fd3f661792ba94600c84e971'

type InnerEnvelope = {
  v: 1
  id: string
  from: string
  fromName: string
  to: string
  releaseRound: number
  sentAt: string
  ephPub: string
  nonce: string
  ct: string
  sig: string
  subject: string
  subjectCt: string
}

type OuterEnvelope = {
  v: 1
  from: string
  to: string
  envelopeId: string
  releaseRound: number
  tlock: string
}


function decodeUtf8(bytes: Uint8Array): string {
  return new TextDecoder().decode(bytes)
}

function encodeUtf8(value: string): Uint8Array {
  return new TextEncoder().encode(value)
}

function makeAddress(edPublic: Uint8Array, xPublic: Uint8Array): string {
  const checksum = sha256(concatBytes([edPublic, xPublic])).slice(0, 4)
  return `owl1${encodeBase64Url(concatBytes([edPublic, xPublic, checksum]))}`
}

function parseAddress(address: string): { edPublic: Uint8Array; xPublic: Uint8Array } | null {
  const normalized = address.trim().replace(/\s+/g, '')
  if (!normalized.startsWith('owl1')) return null
  const decoded = decodeBase64Url(normalized.slice(4))
  if (!decoded || decoded.length !== 68) return null
  const edPublic = decoded.slice(0, 32)
  const xPublic = decoded.slice(32, 64)
  const checksum = decoded.slice(64)
  const expected = sha256(concatBytes([edPublic, xPublic])).slice(0, 4)
  if (!checksum.every((byte, index) => byte === expected[index])) return null
  return { edPublic, xPublic }
}

function randomId(): string {
  return encodeBase64Url(randomBytes(18)).replace(/=+$/, '')
}

function bytesEqual(left: Uint8Array, right: Uint8Array): boolean {
  if (left.length !== right.length) return false
  let different = 0
  for (let index = 0; index < left.length; index += 1) {
    different |= (left[index] ?? 0) ^ (right[index] ?? 0)
  }
  return different === 0
}

export class HedwigBridge {
  private readonly app: ElmApp
  private identity: Identity | null = null
  private peer: RTCPeerConnection | null = null
  private channel: RTCDataChannel | null = null
  private readonly receivedEnvelopeIds = new Set<string>()
  private chunkSession: ChunkSession | null = null

  constructor(app: ElmApp) {
    this.app = app
    app.ports.initializeIdentity.subscribe?.((payload) => {
      void this.initializeIdentity(payload as { name?: string })
    })
    app.ports.createOffer.subscribe?.(() => {
      void this.createOffer()
    })
    app.ports.acceptOffer.subscribe?.((payload) => {
      void this.acceptOffer(String(payload))
    })
    app.ports.setRemoteAnswer.subscribe?.((payload) => {
      void this.setRemoteAnswer(String(payload))
    })
    app.ports.prepareEnvelope.subscribe?.((payload) => {
      void this.prepareEnvelope(payload as {
        recipient: string
        subject: string
        body: string
        releaseHours: number
        releaseSeconds: number
      })
    })
    app.ports.decryptEnvelope.subscribe?.((payload) => {
      void this.decryptEnvelope(String(payload))
    })
    app.ports.saveDraft.subscribe?.((payload) => {
      this.saveDraft(payload as Record<string, string>)
    })
    app.ports.saveContact.subscribe?.((payload) => {
      this.saveContact(payload as Record<string, string>)
    })
    app.ports.exportIdentity.subscribe?.(() => {
      this.exportIdentity()
    })
    app.ports.importIdentity.subscribe?.((payload) => {
      void this.importIdentity(String(payload))
    })
    app.ports.retryEnvelope.subscribe?.((payload) => {
      this.retryEnvelope(String(payload))
    })
    app.ports.importIdentityFile.subscribe?.(() => {
      this.openIdentityFile()
    })
    app.ports.archiveOutbox.subscribe?.(() => {
      const outbox = this.readArray('hedwig-outbox')
      const archived = this.readArray('hedwig-outbox-archive')
      localStorage.setItem('hedwig-outbox-archive', JSON.stringify([...outbox, ...archived].slice(0, 200)))
      localStorage.removeItem('hedwig-outbox')
      this.loadState()
      this.log('Outbox archived locally')
    })
    app.ports.archiveSent.subscribe?.(() => {
      const sent = this.readArray('hedwig-sent')
      const archived = this.readArray('hedwig-sent-archive')
      localStorage.setItem('hedwig-sent-archive', JSON.stringify([...sent, ...archived].slice(0, 200)))
      localStorage.removeItem('hedwig-sent')
      this.loadState()
      this.log('Sent letters archived locally')
    })
    app.ports.restoreOutbox.subscribe?.((payload) => {
      this.restoreArchived('hedwig-outbox', 'hedwig-outbox-archive', String(payload))
    })
    app.ports.deleteArchivedOutbox.subscribe?.((payload) => {
      this.deleteArchived('hedwig-outbox-archive', String(payload))
    })
    app.ports.restoreSent.subscribe?.((payload) => {
      this.restoreArchived('hedwig-sent', 'hedwig-sent-archive', String(payload))
    })
    app.ports.deleteArchivedSent.subscribe?.((payload) => {
      this.deleteArchived('hedwig-sent-archive', String(payload))
    })
    app.ports.resetConnection.subscribe?.(() => {
      this.resetConnection()
    })

    void this.initializeIdentity({}).then(() => this.loadState())
  }

  private send(port: string, payload: unknown): void {
    switch (port) {
      case 'identityLoaded':
        this.app.ports.identityLoaded.send(payload)
        break
      case 'offerCreated':
        this.app.ports.offerCreated.send(payload)
        break
      case 'answerCreated':
        this.app.ports.answerCreated.send(payload)
        break
      case 'connectionStatus':
        this.app.ports.connectionStatus.send(payload)
        break
      case 'envelopeSent':
        this.app.ports.envelopeSent.send(payload)
        break
      case 'envelopeReceived':
        this.app.ports.envelopeReceived.send(payload)
        break
      case 'letterDecrypted':
        this.app.ports.letterDecrypted.send(payload)
        break
      case 'bridgeError':
        this.app.ports.bridgeError.send(payload)
        break
      case 'debugLog':
        this.app.ports.debugLog.send(payload)
        break
      case 'stateLoaded':
        this.app.ports.stateLoaded.send(payload)
        break
      case 'identityExported':
        this.app.ports.identityExported.send(payload)
        break
    }
  }

  private log(message: string): void {
    const time = new Date().toISOString().slice(11, 23)
    console.debug(`[Hedwig] ${time} ${message}`)
    this.send('debugLog', { time, message })
  }

  private error(message: string): void {
    this.log(`ERROR ${message}`)
    this.send('bridgeError', { message })
  }

  private async initializeIdentity(request: { name?: string }): Promise<void> {
    const existing = localStorage.getItem('hedwig-mvp-identity')
    let stored: StoredIdentity | null = null
    if (existing) {
      try {
        stored = JSON.parse(existing) as StoredIdentity
      } catch {
        localStorage.removeItem('hedwig-mvp-identity')
      }
    }

    if (stored) {
      const edSecret = decodeBase64Url(stored.edSecret)
      const edPublic = decodeBase64Url(stored.edPublic)
      const xSecret = decodeBase64Url(stored.xSecret)
      const xPublic = decodeBase64Url(stored.xPublic)
      if (edSecret && edPublic && xSecret && xPublic) {
        this.identity = {
          name: request.name?.trim() || stored.name,
          address: stored.address,
          edSecret,
          edPublic,
          xSecret,
          xPublic,
        }
        if (request.name?.trim()) this.persistIdentity()
        this.send('identityLoaded', { address: stored.address, name: this.identity.name })
        this.log(`Identity loaded: ${stored.address.slice(0, 12)}...`)
        return
      }
    }

    const ed = ed25519.keygen()
    const x = x25519.keygen()
    const name = request.name?.trim() || 'My owl'
    const address = makeAddress(ed.publicKey, x.publicKey)
    this.identity = {
      name,
      address,
      edSecret: ed.secretKey,
      edPublic: ed.publicKey,
      xSecret: x.secretKey,
      xPublic: x.publicKey,
    }
    this.persistIdentity()
    this.send('identityLoaded', { address, name })
    this.log(`New identity created: ${address.slice(0, 12)}...`)
  }

  private persistIdentity(): void {
    if (!this.identity) return
    const stored: StoredIdentity = {
      name: this.identity.name,
      address: this.identity.address,
      edSecret: encodeBase64Url(this.identity.edSecret),
      edPublic: encodeBase64Url(this.identity.edPublic),
      xSecret: encodeBase64Url(this.identity.xSecret),
      xPublic: encodeBase64Url(this.identity.xPublic),
    }
    localStorage.setItem('hedwig-mvp-identity', JSON.stringify(stored))
  }

  private readArray(key: string): unknown[] {
    try {
      const value = JSON.parse(localStorage.getItem(key) ?? '[]')
      return Array.isArray(value) ? value : []
    } catch {
      return []
    }
  }

  private restoreArchived(liveKey: string, archiveKey: string, id: string): void {
    const archived = this.readArray(archiveKey) as Array<{ id?: string }>
    const live = this.readArray(liveKey) as unknown[]
    const item = archived.find((entry) => entry.id === id)
    if (!item) return
    localStorage.setItem(liveKey, JSON.stringify([item, ...live].slice(0, 200)))
    localStorage.setItem(archiveKey, JSON.stringify(archived.filter((entry) => entry.id !== id)))
    this.loadState()
    this.log(`Archived item restored: ${id}`)
  }

  private deleteArchived(archiveKey: string, id: string): void {
    const archived = this.readArray(archiveKey) as Array<{ id?: string }>
    localStorage.setItem(archiveKey, JSON.stringify(archived.filter((entry) => entry.id !== id)))
    this.loadState()
    this.log(`Archived item deleted: ${id}`)
  }

  private loadState(): void {
    const sealed = this.readArray('hedwig-sealed') as string[]
    const opened = this.readArray('hedwig-opened') as Array<{
      id: string
      from: string
      subject: string
      body: string
      releaseRound: number
      sentAt: string
    }>
    const outbox = this.readArray('hedwig-outbox')
    const sent = this.readArray('hedwig-sent')
    const archivedOutbox = this.readArray('hedwig-outbox-archive')
    const archivedSent = this.readArray('hedwig-sent-archive')
    for (const envelope of sealed) {
      try {
        const outer = JSON.parse(envelope) as OuterEnvelope
        if (outer.envelopeId) this.receivedEnvelopeIds.add(outer.envelopeId)
      } catch {
        // Ignore malformed legacy state.
      }
    }
    for (const letter of opened) {
      if (letter.id) this.receivedEnvelopeIds.add(letter.id)
    }
    this.send('stateLoaded', {
      contacts: this.readArray('hedwig-contacts'),
      drafts: this.readArray('hedwig-drafts'),
      sealed,
      opened,
      outbox,
      sent,
      archivedOutbox,
      archivedSent,
    })
  }

  private saveDraft(draft: Record<string, string>): void {
    if (!draft.recipient && !draft.subject && !draft.body) return
    const drafts = this.readArray('hedwig-drafts') as Record<string, string>[]
    const next = [draft, ...drafts.filter((item) =>
      item.recipient !== draft.recipient
      || item.subject !== draft.subject
    )].slice(0, 20)
    localStorage.setItem('hedwig-drafts', JSON.stringify(next))
    this.log('Draft saved locally')
  }

  private saveOutboxItem(
    id: string,
    subject: string,
    recipient: string,
    envelope: string,
    status: 'pending' | 'sent' | 'failed',
    error = '',
  ): void {
    const outbox = this.readArray('hedwig-outbox') as Array<{
      id: string
      subject: string
      recipient: string
      status: string
      envelope: string
      createdAt: string
      error: string
    }>
    const item = {
      id,
      subject,
      recipient,
      status,
      envelope,
      createdAt: new Date().toISOString(),
      error,
    }
    localStorage.setItem(
      'hedwig-outbox',
      JSON.stringify([item, ...outbox.filter((entry) => entry.id !== id)].slice(0, 50)),
    )
    const drafts = this.readArray('hedwig-drafts') as Array<{ subject: string }>
    localStorage.setItem(
      'hedwig-drafts',
      JSON.stringify(drafts.filter((draft) => draft.subject !== subject)),
    )
    this.loadState()
  }

  private saveSentItem(
    id: string,
    recipient: string,
    subject: string,
    body: string,
    releaseRound: number,
    sentAt: string,
    status: 'pending' | 'sent' | 'failed',
  ): void {
    const sent = this.readArray('hedwig-sent') as Array<{
      id: string
      to: string
      subject: string
      body: string
      releaseRound: number
      sentAt: string
      status: string
    }>
    const item = {
      id,
      to: recipient,
      subject,
      body,
      releaseRound,
      sentAt,
      sentAtLocal: new Date().toISOString(),
      status,
    }
    localStorage.setItem(
      'hedwig-sent',
      JSON.stringify([item, ...sent.filter((entry) => entry.id !== id)].slice(0, 200)),
    )
  }

  private updateSentStatus(id: string, status: 'pending' | 'sent' | 'failed'): void {
    const sent = this.readArray('hedwig-sent') as Array<{
      id: string
      to: string
      subject: string
      body: string
      releaseRound: number
      sentAt: string
      status: string
    }>
    localStorage.setItem(
      'hedwig-sent',
      JSON.stringify(sent.map((item) =>
        item.id === id ? { ...item, status } : item,
      )),
    )
  }

  private updateOutbox(id: string, status: 'pending' | 'sent' | 'failed', error = ''): void {
    const outbox = this.readArray('hedwig-outbox') as Array<{
      id: string
      subject: string
      status: string
      envelope: string
      createdAt: string
      error: string
    }>
    localStorage.setItem(
      'hedwig-outbox',
      JSON.stringify(outbox.map((item) =>
        item.id === id ? { ...item, status, error } : item,
      )),
    )
    this.loadState()
  }

  private retryEnvelope(id: string): void {
    const outbox = this.readArray('hedwig-outbox') as Array<{ id: string; envelope: string }>
    const item = outbox.find((entry) => entry.id === id)
    if (!item) {
      this.error('Prepared letter is no longer in the outbox')
      return
    }
    if (!this.channel || this.channel.readyState !== 'open') {
      this.updateOutbox(id, 'failed', 'Connect to the peer before retrying')
      this.updateSentStatus(id, 'failed')
      this.loadState()
      return
    }
    this.updateOutbox(id, 'pending')
    this.updateSentStatus(id, 'pending')
    this.loadState()
    this.sendTransfer(item.envelope)
  }

  private saveContact(contact: Record<string, string>): void {
    const address = (contact.address ?? '').trim()
    if (!parseAddress(address)) {
      this.error('Cannot save an invalid owl address')
      return
    }
    const contacts = this.readArray('hedwig-contacts') as Array<{ name: string; address: string }>
    const name = (contact.name ?? '').trim() || 'Recipient'
    const next = [
      { name, address },
      ...contacts.filter((item) => item.address !== address),
    ].slice(0, 50)
    localStorage.setItem('hedwig-contacts', JSON.stringify(next))
    this.log(`Contact saved: ${name}`)
    this.loadState()
  }

  private exportIdentity(): void {
    if (!this.identity) {
      this.error('Identity is not ready')
      return
    }
    this.persistIdentity()
    const backup = localStorage.getItem('hedwig-mvp-identity')
    this.send('identityExported', { backup: backup ?? '' })
    this.log('Identity backup exported')
  }

  private async importIdentity(serialized: string): Promise<void> {
    try {
      const stored = JSON.parse(serialized) as StoredIdentity
      if (!stored.name || !stored.address || !stored.edSecret || !stored.edPublic || !stored.xSecret || !stored.xPublic) {
        throw new Error('Identity backup is incomplete')
      }
      const edSecret = decodeBase64Url(stored.edSecret)
      const edPublic = decodeBase64Url(stored.edPublic)
      const xSecret = decodeBase64Url(stored.xSecret)
      const xPublic = decodeBase64Url(stored.xPublic)
      if (!edSecret || !edPublic || !xSecret || !xPublic) throw new Error('Identity backup is invalid')
      if (edSecret.length !== 32 || edPublic.length !== 32 || xSecret.length !== 32 || xPublic.length !== 32) {
        throw new Error('Identity backup contains invalid key lengths')
      }
      if (!bytesEqual(ed25519.getPublicKey(edSecret), edPublic)) {
        throw new Error('Ed25519 backup keys do not match')
      }
      if (!bytesEqual(x25519.getPublicKey(xSecret), xPublic)) {
        throw new Error('X25519 backup keys do not match')
      }
      if (stored.address !== makeAddress(edPublic, xPublic)) {
        throw new Error('Identity address does not match backup keys')
      }
      this.identity = {
        name: stored.name,
        address: stored.address,
        edSecret,
        edPublic,
        xSecret,
        xPublic,
      }
      this.persistIdentity()
      this.send('identityLoaded', { address: stored.address, name: stored.name })
      this.loadState()
      this.log('Identity backup restored')
    } catch (caught) {
      this.error(caught instanceof Error ? caught.message : 'Identity backup could not be restored')
    }
  }

  private openIdentityFile(): void {
    const input = document.createElement('input')
    input.type = 'file'
    input.accept = 'application/json,.json'
    input.addEventListener('change', () => {
      const file = input.files?.[0]
      if (!file) return
      void file.text().then((backup) => {
        this.send('identityFileLoaded', { backup })
      }).catch(() => {
        this.error('Identity file could not be read')
      })
    })
    input.click()
  }

  private resetConnection(): void {
    this.chunkSession = null
    if (this.channel) {
      this.channel.close()
      this.channel = null
    }
    if (this.peer) {
      this.peer.close()
      this.peer = null
    }
    this.send('connectionStatus', { status: 'disconnected' })
    this.log('Connection reset; old invitation and answer cleared')
  }

  private ensurePeer(): RTCPeerConnection {
    if (this.peer) return this.peer
    const peer = new RTCPeerConnection({
      iceServers: [{ urls: 'stun:stun.l.google.com:19302' }],
    })
    peer.addEventListener('connectionstatechange', () => {
      this.send('connectionStatus', { status: peer.connectionState })
      this.log(`Peer connection state: ${peer.connectionState}`)
      if (peer.connectionState === 'failed') this.error('Peer connection failed')
    })
    peer.addEventListener('datachannel', (event) => {
      this.attachChannel(event.channel)
    })
    this.peer = peer
    return peer
  }

  private attachChannel(channel: RTCDataChannel): void {
    this.channel = channel
    channel.addEventListener('open', () => {
      this.send('connectionStatus', { status: 'connected' })
      this.log('WebRTC data channel opened')
    })
    channel.addEventListener('close', () => {
      this.send('connectionStatus', { status: 'disconnected' })
      this.log('WebRTC data channel closed')
    })
    channel.addEventListener('message', (event) => {
      try {
        const payload = JSON.parse(String(event.data)) as OuterEnvelope & { type?: string; envelopeId?: string }
        if (payload.type === 'delivery-confirmation') {
          this.send('envelopeSent', { envelope: String(payload.envelopeId), confirmed: true, envelopeId: payload.envelopeId })
          this.updateOutbox(String(payload.envelopeId), 'sent')
          this.updateSentStatus(String(payload.envelopeId), 'sent')
          this.loadState()
          this.log(`Send confirmation received for ${payload.envelopeId}`)
          return
        }
        if (payload.type === 'hedwig-chunk') {
          const next = reassembleTransfer(this.chunkSession, payload)
          this.chunkSession = next.session
          if (!next.result.ok) {
            if (next.result.reason === 'invalid-frame') this.error('Invalid transfer chunk')
            return
          }
          const envelope = JSON.parse(next.result.payload) as OuterEnvelope & { type?: string }
          this.receiveEnvelope(channel, envelope)
          return
        }
        const envelope = payload as OuterEnvelope
        this.receiveEnvelope(channel, envelope)
      } catch (caught) {
        this.error(caught instanceof Error ? caught.message : 'Invalid received envelope')
      }
    })
  }

  private receiveEnvelope(channel: RTCDataChannel, envelope: OuterEnvelope): void {
    try {
      if (envelope.v !== 1 || !envelope.tlock) throw new Error('Invalid received envelope')
      if (
        !/^owl1/.test(envelope.from)
        || !/^owl1/.test(envelope.to)
        || !/^[A-Za-z0-9_-]{16,32}$/.test(envelope.envelopeId)
        || !Number.isInteger(envelope.releaseRound)
        || envelope.releaseRound < 1
        || envelope.tlock.length > 1_024_000
      ) {
        throw new Error('Invalid envelope fields')
      }
      if (this.receivedEnvelopeIds.has(envelope.envelopeId)) {
        this.log(`Duplicate envelope ignored: ${envelope.envelopeId}`)
        channel.send(JSON.stringify({ type: 'delivery-confirmation', envelopeId: envelope.envelopeId }))
        return
      }
      this.receivedEnvelopeIds.add(envelope.envelopeId)
      const sealed = this.readArray('hedwig-sealed') as string[]
      const receivedEnvelope = { ...envelope, receivedAt: new Date().toISOString() }
      sealed.unshift(JSON.stringify(receivedEnvelope))
      localStorage.setItem('hedwig-sealed', JSON.stringify(sealed.slice(0, 100)))
      this.log(`Envelope received: ${envelope.envelopeId}`)
      channel.send(JSON.stringify({ type: 'delivery-confirmation', envelopeId: envelope.envelopeId }))
      this.log(`Send confirmation returned for ${envelope.envelopeId}`)
      this.send('envelopeReceived', {
        envelope: JSON.stringify(envelope),
        releaseRound: envelope.releaseRound,
        receivedAt: receivedEnvelope.receivedAt,
      })
      this.loadState()
    } catch (caught) {
      this.error(caught instanceof Error ? caught.message : 'Invalid received envelope')
    }
  }

  private sendTransfer(serialized: string): void {
    if (!this.channel || this.channel.readyState !== 'open') {
      throw new Error('Connect to the peer before sending')
    }
    const envelope = JSON.parse(serialized) as OuterEnvelope
    if (!envelope.envelopeId) throw new Error('Envelope ID is missing')
    const frames = splitTransfer(serialized, envelope.envelopeId)
    for (const frame of frames) {
      this.channel.send(JSON.stringify(frame))
    }
  }

  private async waitForIce(peer: RTCPeerConnection): Promise<void> {
    if (peer.iceGatheringState === 'complete') return
    await new Promise<void>((resolve) => {
      const timeout = window.setTimeout(resolve, 5000)
      peer.addEventListener('icegatheringstatechange', () => {
        if (peer.iceGatheringState === 'complete') {
          window.clearTimeout(timeout)
          resolve()
        }
      })
    })
  }

  private async createOffer(): Promise<void> {
    try {
      const peer = this.ensurePeer()
      this.attachChannel(peer.createDataChannel('hedwig'))
      const offer = await peer.createOffer()
      await peer.setLocalDescription(offer)
      await this.waitForIce(peer)
      this.log(`ICE gathering complete (${peer.iceGatheringState})`)
      const envelope = createSignalingEnvelope('offer', peer.localDescription as RTCSessionDescriptionInit)
      this.send('offerCreated', { sdp: JSON.stringify(envelope) })
      this.send('connectionStatus', { status: 'waiting-for-answer' })
    } catch (caught) {
      this.error(caught instanceof Error ? caught.message : 'Could not create invitation')
    }
  }

  private async acceptOffer(serialized: string): Promise<void> {
    try {
      const description = parseSignalingEnvelope(serialized, 'offer')
      const peer = this.ensurePeer()
      await peer.setRemoteDescription(description)
      const answer = await peer.createAnswer()
      await peer.setLocalDescription(answer)
      await this.waitForIce(peer)
      this.log(`ICE gathering complete (${peer.iceGatheringState})`)
      const envelope = createSignalingEnvelope('answer', peer.localDescription as RTCSessionDescriptionInit)
      this.send('answerCreated', { sdp: JSON.stringify(envelope) })
      this.send('connectionStatus', { status: 'waiting-for-peer' })
    } catch (caught) {
      this.error(caught instanceof Error ? caught.message : 'Could not accept invitation')
    }
  }

  private async setRemoteAnswer(serialized: string): Promise<void> {
    try {
      const description = parseSignalingEnvelope(serialized, 'answer')
      await this.ensurePeer().setRemoteDescription(description)
      this.log('Remote answer applied')
      this.send('connectionStatus', { status: 'connecting' })
    } catch (caught) {
      this.error(caught instanceof Error ? caught.message : 'Could not apply answer')
    }
  }

  private async prepareEnvelope(request: {
    recipient: string
    subject: string
    body: string
    releaseHours: number
    releaseSeconds?: number
  }): Promise<void> {
    try {
      if (!this.identity) throw new Error('Identity is not ready')
      const recipient = parseAddress(request.recipient)
      if (!recipient) throw new Error('Recipient owl address is invalid')
      if (!request.subject.trim()) throw new Error('Subject is required')
      if (!request.body.trim()) throw new Error('Letter text is required')

      const releaseTime =
        Date.now()
        + Math.max(0, request.releaseSeconds ?? 0) * 1000
        + Math.max(0, request.releaseHours) * 60 * 60 * 1000
      const client = quicknetClient()
      const chain = await client.chain().info()
      if (chain.hash !== QUICKNET_HASH) {
        throw new Error('Unexpected drand chain')
      }
      const releaseRound = roundForReleaseMs(releaseTime, chain)

      const box = sealBox(
        encodeUtf8(JSON.stringify({
          subject: request.subject.trim(),
          body: request.body.trim(),
          sentAt: new Date().toISOString(),
        })),
        recipient.xPublic,
        encodeUtf8('hedwig-mvp-letter'),
      )

      const id = randomId()
      const signedPayload = encodeUtf8(JSON.stringify({
        v: 1,
        id,
        from: this.identity.address,
        to: request.recipient.trim(),
        releaseRound,
        ephPub: encodeBase64Url(box.ephPub),
        nonce: encodeBase64Url(box.nonce),
        ct: encodeBase64Url(box.ciphertext),
      }))
      const sig = ed25519.sign(signedPayload, this.identity.edSecret)

      const inner: InnerEnvelope = {
        v: 1,
        id,
        from: this.identity.address,
        fromName: this.identity.name,
        to: request.recipient.trim(),
        releaseRound,
        sentAt: new Date().toISOString(),
        ephPub: encodeBase64Url(box.ephPub),
        nonce: encodeBase64Url(box.nonce),
        ct: encodeBase64Url(box.ciphertext),
        sig: encodeBase64Url(sig),
        subject: request.subject.trim(),
        subjectCt: '',
      }

      const sentAt = inner.sentAt

      const plaintext = encodeUtf8(JSON.stringify(inner))
      const tlock = await timelockEncrypt(releaseRound, Buffer.from(plaintext), client)
      const outer: OuterEnvelope = {
        v: 1,
        from: this.identity.address,
        to: request.recipient.trim(),
        envelopeId: id,
        releaseRound,
        tlock,
      }
      const serialized = JSON.stringify(outer)
      this.saveSentItem(
        id,
        request.recipient.trim(),
        request.subject.trim(),
        request.body.trim(),
        releaseRound,
        sentAt,
        'pending',
      )
      if (!this.channel || this.channel.readyState !== 'open') {
        this.saveOutboxItem(id, request.subject.trim(), request.recipient.trim(), serialized, 'failed', 'Connect to the peer before sending')
        this.updateSentStatus(id, 'failed')
        throw new Error('Connect to the peer before sending')
      }
      this.saveOutboxItem(id, request.subject.trim(), request.recipient.trim(), serialized, 'pending')
      this.log(`Sending envelope ${id}: ${request.subject.trim()} (release round ${releaseRound})`)
      this.sendTransfer(serialized)
      this.send('envelopeSent', { envelope: serialized, confirmed: false, envelopeId: id })
      this.log(`Envelope ${id} handed to the WebRTC data channel`)
    } catch (caught) {
      this.error(caught instanceof Error ? caught.message : 'Could not prepare envelope')
    }
  }

  private async decryptEnvelope(serialized: string): Promise<void> {
    try {
      if (!this.identity) throw new Error('Identity is not ready')
      const outer = JSON.parse(serialized) as OuterEnvelope
      this.log(`Opening envelope ${outer.envelopeId ?? "unknown"} (round ${outer.releaseRound})`)
      const recipient = parseAddress(outer.to)
      if (!recipient) throw new Error('Envelope recipient is invalid')
      if (outer.to !== this.identity.address) throw new Error('This letter belongs to another owl')

      const client = quicknetClient()
      const chain = await client.chain().info()
      if (chain.hash !== QUICKNET_HASH) {
        throw new Error('Unexpected drand chain')
      }
      const plaintext = await timelockDecrypt(outer.tlock, client)
      this.log(`TLock decryption succeeded for round ${outer.releaseRound}`)
      const inner = JSON.parse(decodeUtf8(plaintext)) as InnerEnvelope

      if (
        inner.v !== 1
        || inner.id !== outer.envelopeId
        || inner.to !== outer.to
        || inner.releaseRound !== outer.releaseRound
      ) {
        throw new Error('Envelope fields do not match')
      }

      const sender = parseAddress(inner.from)
      if (!sender) throw new Error('Sender address is invalid')
      const ephPub = decodeBase64Url(inner.ephPub)
      const nonce = decodeBase64Url(inner.nonce)
      const ciphertext = decodeBase64Url(inner.ct)
      const signature = decodeBase64Url(inner.sig)
      if (!ephPub || !nonce || !ciphertext || !signature) throw new Error('Envelope fields are invalid')

      const signedPayload = encodeUtf8(JSON.stringify({
        v: 1,
        id: inner.id,
        from: inner.from,
        to: inner.to,
        releaseRound: inner.releaseRound,
        ephPub: inner.ephPub,
        nonce: inner.nonce,
        ct: inner.ct,
      }))
      if (!ed25519.verify(signature, signedPayload, sender.edPublic)) {
        throw new Error('Letter signature is invalid')
      }

      const opened = openBox(
        { ephPub, nonce, ciphertext },
        this.identity.xSecret,
        encodeUtf8('hedwig-mvp-letter'),
      )
      if (!opened) throw new Error('Letter could not be decrypted')
      const content = JSON.parse(decodeUtf8(opened)) as { subject: string; body: string; sentAt: string }
      const letter = {
        id: inner.id,
        from: inner.fromName || inner.from,
        subject: content.subject,
        body: content.body,
        releaseRound: inner.releaseRound,
        sentAt: content.sentAt,
        receivedAt: new Date().toISOString(),
        openedAt: new Date().toISOString(),
      }
      if (this.receivedEnvelopeIds.has(inner.id)) {
        // Keep replay protection while allowing the persisted opened letter to surface.
        const existing = this.readArray('hedwig-opened') as Array<typeof letter>
        if (!existing.some((item) => item.id === inner.id)) {
          existing.unshift(letter)
          localStorage.setItem('hedwig-opened', JSON.stringify(existing.slice(0, 100)))
        }
      }
      const sealed = this.readArray('hedwig-sealed') as string[]
      localStorage.setItem(
        'hedwig-sealed',
        JSON.stringify(sealed.filter((serialized) => {
          try {
            return (JSON.parse(serialized) as OuterEnvelope).envelopeId !== inner.id
          } catch {
            return true
          }
        })),
      )
      this.send('letterDecrypted', letter)
      this.loadState()
    } catch (caught) {
      const message = caught instanceof Error ? caught.message : 'Could not open letter'
      if (/round|future|not yet|chain/i.test(message)) {
        this.error('This letter is still sealed until its drand round')
      } else {
        this.error(message)
      }
    }
  }
}
