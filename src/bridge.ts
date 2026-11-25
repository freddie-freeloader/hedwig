import { ed25519, x25519 } from '@noble/curves/ed25519.js'
import { sha256 } from '@noble/hashes/sha256.js'
import { randomBytes } from '@noble/ciphers/utils.js'
import { mainnetClient, timelockDecrypt, timelockEncrypt, Buffer } from 'tlock-js'
import { roundForReleaseMs } from './drand.ts'
import { concatBytes, decodeBase64Url, encodeBase64Url } from './crypto/bytes.ts'
import { openBox, sealBox } from './crypto/box.ts'

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

export class HedwigBridge {
  private readonly app: ElmApp
  private identity: Identity | null = null
  private peer: RTCPeerConnection | null = null
  private channel: RTCDataChannel | null = null

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

    void this.initializeIdentity({})
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
          this.log(`Send confirmation received for ${payload.envelopeId}`)
          return
        }
        const envelope = payload as OuterEnvelope
        if (envelope.v !== 1 || !envelope.tlock) throw new Error('Invalid received envelope')
        this.log(`Envelope received: ${envelope.envelopeId}`)
        channel.send(JSON.stringify({ type: 'delivery-confirmation', envelopeId: envelope.envelopeId }))
        this.log(`Send confirmation returned for ${envelope.envelopeId}`)
        this.send('envelopeReceived', {
          envelope: JSON.stringify(envelope),
          releaseRound: envelope.releaseRound,
        })
      } catch (caught) {
        this.error(caught instanceof Error ? caught.message : 'Invalid received envelope')
      }
    })
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
      this.send('offerCreated', { sdp: JSON.stringify(peer.localDescription) })
      this.send('connectionStatus', { status: 'waiting-for-answer' })
    } catch (caught) {
      this.error(caught instanceof Error ? caught.message : 'Could not create invitation')
    }
  }

  private async acceptOffer(serialized: string): Promise<void> {
    try {
      const description = JSON.parse(serialized) as RTCSessionDescriptionInit
      const peer = this.ensurePeer()
      await peer.setRemoteDescription(description)
      const answer = await peer.createAnswer()
      await peer.setLocalDescription(answer)
      await this.waitForIce(peer)
      this.log(`ICE gathering complete (${peer.iceGatheringState})`)
      this.send('answerCreated', { sdp: JSON.stringify(peer.localDescription) })
      this.send('connectionStatus', { status: 'waiting-for-peer' })
    } catch (caught) {
      this.error(caught instanceof Error ? caught.message : 'Could not accept invitation')
    }
  }

  private async setRemoteAnswer(serialized: string): Promise<void> {
    try {
      const description = JSON.parse(serialized) as RTCSessionDescriptionInit
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
      const client = mainnetClient()
      const chain = await client.chain().info()
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
      if (!this.channel || this.channel.readyState !== 'open') {
        throw new Error('Connect to the peer before sending')
      }
      this.log(`Sending envelope ${id}: ${request.subject.trim()} (release round ${releaseRound})`)
      this.channel.send(serialized)
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

      const client = mainnetClient()
      const plaintext = await timelockDecrypt(outer.tlock, client)
      this.log(`TLock decryption succeeded for round ${outer.releaseRound}`)
      const inner = JSON.parse(decodeUtf8(plaintext)) as InnerEnvelope

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
      this.send('letterDecrypted', {
        id: inner.id,
        from: inner.fromName || inner.from,
        subject: content.subject,
        body: content.body,
        releaseRound: inner.releaseRound,
        sentAt: content.sentAt,
      })
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
