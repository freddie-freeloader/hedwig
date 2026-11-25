import { isRecord } from '../crypto/bytes.ts'
import type { Envelope } from '../crypto/letter.ts'
import { parseEnvelope } from '../crypto/letter.ts'
import type { Signal } from '../relay/api.ts'

export type PeerLetterResult = 'ok' | 'invalid' | 'stale-inbox'

export type PeerDelivery =
  | { ok: true }
  | { ok: false; reason: 'timeout' | 'stale-inbox' | 'invalid' | 'closed' }

type Waiter = {
  resolve: (result: PeerDelivery) => void
}

type ChannelMessage =
  | { type: 'letter'; envelope: Envelope }
  | { type: 'ack'; id: string }
  | { type: 'nack'; id: string; reason: 'invalid' | 'stale-inbox' }

const ICE: RTCConfiguration = {
  iceServers: [{ urls: 'stun:stun.l.google.com:19302' }],
}

export class PeerPost {
  private readonly pcs = new Map<string, RTCPeerConnection>()
  private readonly channels = new Map<string, RTCDataChannel>()
  private readonly waiters = new Map<string, Waiter>()
  private readonly iceQueue = new Map<string, RTCIceCandidateInit[]>()
  private readonly dialing = new Map<string, Promise<RTCDataChannel | null>>()

  private readonly selfAddress: string
  private readonly sendSignal: (to: string, payload: Signal) => void
  private readonly onLetter: (envelope: Envelope) => PeerLetterResult

  constructor(
    selfAddress: string,
    sendSignal: (to: string, payload: Signal) => void,
    onLetter: (envelope: Envelope) => PeerLetterResult,
  ) {
    this.selfAddress = selfAddress
    this.sendSignal = sendSignal
    this.onLetter = onLetter
  }

  close(): void {
    for (const waiter of this.waiters.values()) waiter.resolve({ ok: false, reason: 'closed' })
    this.waiters.clear()
    for (const channel of this.channels.values()) channel.close()
    for (const pc of this.pcs.values()) pc.close()
    this.channels.clear()
    this.pcs.clear()
    this.iceQueue.clear()
    this.dialing.clear()
  }

  async deliver(to: string, envelope: Envelope, timeoutMs: number): Promise<PeerDelivery> {
    if (typeof RTCPeerConnection === 'undefined') return { ok: false, reason: 'timeout' }
    const channel = await this.openChannel(to, timeoutMs)
    if (!channel || channel.readyState !== 'open') return { ok: false, reason: 'timeout' }
    return this.writeLetter(channel, envelope, timeoutMs)
  }

  acceptSignal(from: string, payload: Signal): void {
    if (typeof RTCPeerConnection === 'undefined') return
    void this.applySignal(from, payload)
  }

  private async openChannel(to: string, timeoutMs: number): Promise<RTCDataChannel | null> {
    const existing = this.channels.get(to)
    if (existing?.readyState === 'open') return existing
    const inflight = this.dialing.get(to)
    if (inflight) return inflight
    const attempt = this.dial(to, timeoutMs)
    this.dialing.set(to, attempt)
    try {
      return await attempt
    } finally {
      if (this.dialing.get(to) === attempt) this.dialing.delete(to)
    }
  }

  private async dial(to: string, timeoutMs: number): Promise<RTCDataChannel | null> {
    const pc = this.ensurePc(to)
    const channel = pc.createDataChannel('post')
    this.bindChannel(to, channel)
    try {
      const offer = await pc.createOffer()
      await pc.setLocalDescription(offer)
    } catch {
      return null
    }
    if (!pc.localDescription?.sdp) return null
    this.sendSignal(to, { kind: 'offer', sdp: pc.localDescription.sdp })
    return waitForOpen(channel, timeoutMs)
  }

  private async applySignal(from: string, payload: Signal): Promise<void> {
    try {
      if (payload.kind === 'ice') {
        await this.addIce(from, {
          candidate: payload.candidate,
          sdpMid: payload.sdpMid,
          sdpMLineIndex: payload.sdpMLineIndex,
        })
        return
      }
      const polite = this.selfAddress > from
      let pc = this.ensurePc(from)
      if (payload.kind === 'offer') {
        const collision = pc.signalingState !== 'stable'
        if (collision && !polite) return
        if (collision && polite) {
          try {
            await pc.setLocalDescription({ type: 'rollback' })
          } catch {
            this.dropPeer(from)
            pc = this.ensurePc(from)
          }
        }
        await pc.setRemoteDescription({ type: 'offer', sdp: payload.sdp })
        await this.flushIce(from)
        const answer = await pc.createAnswer()
        await pc.setLocalDescription(answer)
        if (pc.localDescription?.sdp) {
          this.sendSignal(from, { kind: 'answer', sdp: pc.localDescription.sdp })
        }
        return
      }
      await pc.setRemoteDescription({ type: 'answer', sdp: payload.sdp })
      await this.flushIce(from)
    } catch {
      this.dropPeer(from)
    }
  }

  private ensurePc(remote: string): RTCPeerConnection {
    const existing = this.pcs.get(remote)
    if (existing && existing.connectionState !== 'closed' && existing.connectionState !== 'failed') {
      return existing
    }
    const pc = new RTCPeerConnection(ICE)
    this.pcs.set(remote, pc)
    pc.onicecandidate = (event) => {
      if (!event.candidate) return
      this.sendSignal(remote, {
        kind: 'ice',
        candidate: event.candidate.candidate,
        sdpMid: event.candidate.sdpMid,
        sdpMLineIndex: event.candidate.sdpMLineIndex,
      })
    }
    pc.ondatachannel = (event) => this.bindChannel(remote, event.channel)
    pc.onconnectionstatechange = () => {
      if (pc.connectionState === 'failed' || pc.connectionState === 'closed') this.dropPeer(remote)
    }
    return pc
  }

  private bindChannel(remote: string, channel: RTCDataChannel): void {
    channel.binaryType = 'arraybuffer'
    this.channels.set(remote, channel)
    channel.onmessage = (event) => this.onChannelMessage(channel, event.data)
    channel.onclose = () => {
      if (this.channels.get(remote) === channel) this.channels.delete(remote)
    }
  }

  private onChannelMessage(channel: RTCDataChannel, data: unknown): void {
    const message = parseChannelMessage(data)
    if (!message) return
    if (message.type === 'letter') {
      const result = this.onLetter(message.envelope)
      const reply =
        result === 'ok'
          ? { type: 'ack', id: message.envelope.id }
          : { type: 'nack', id: message.envelope.id, reason: result }
      if (channel.readyState === 'open') channel.send(JSON.stringify(reply))
      return
    }
    const waiter = this.waiters.get(message.id)
    if (!waiter) return
    this.waiters.delete(message.id)
    waiter.resolve(message.type === 'ack' ? { ok: true } : { ok: false, reason: message.reason })
  }

  private writeLetter(channel: RTCDataChannel, envelope: Envelope, timeoutMs: number): Promise<PeerDelivery> {
    return new Promise((resolve) => {
      const timer = setTimeout(() => {
        this.waiters.delete(envelope.id)
        resolve({ ok: false, reason: 'timeout' })
      }, timeoutMs)
      this.waiters.set(envelope.id, {
        resolve: (result) => {
          clearTimeout(timer)
          resolve(result)
        },
      })
      try {
        channel.send(JSON.stringify({ type: 'letter', envelope }))
      } catch {
        clearTimeout(timer)
        this.waiters.delete(envelope.id)
        resolve({ ok: false, reason: 'closed' })
      }
    })
  }

  private async addIce(remote: string, init: RTCIceCandidateInit): Promise<void> {
    const pc = this.pcs.get(remote)
    if (!pc || !pc.remoteDescription) {
      const queued = this.iceQueue.get(remote) ?? []
      queued.push(init)
      this.iceQueue.set(remote, queued)
      return
    }
    await pc.addIceCandidate(init)
  }

  private async flushIce(remote: string): Promise<void> {
    const pc = this.pcs.get(remote)
    const queued = this.iceQueue.get(remote) ?? []
    this.iceQueue.set(remote, [])
    if (!pc) return
    for (const init of queued) {
      try {
        await pc.addIceCandidate(init)
      } catch {
        // A late or duplicate candidate is not fatal.
      }
    }
  }

  private dropPeer(remote: string): void {
    this.channels.get(remote)?.close()
    this.pcs.get(remote)?.close()
    this.channels.delete(remote)
    this.pcs.delete(remote)
    this.iceQueue.delete(remote)
  }
}

function waitForOpen(channel: RTCDataChannel, timeoutMs: number): Promise<RTCDataChannel | null> {
  if (channel.readyState === 'open') return Promise.resolve(channel)
  if (channel.readyState === 'closed' || channel.readyState === 'closing') return Promise.resolve(null)
  return new Promise((resolve) => {
    const timer = setTimeout(() => resolve(null), timeoutMs)
    channel.addEventListener(
      'open',
      () => {
        clearTimeout(timer)
        resolve(channel)
      },
      { once: true },
    )
    channel.addEventListener(
      'close',
      () => {
        clearTimeout(timer)
        resolve(null)
      },
      { once: true },
    )
  })
}

function parseChannelMessage(data: unknown): ChannelMessage | null {
  let value: unknown = data
  if (data instanceof ArrayBuffer) {
    try {
      value = JSON.parse(new TextDecoder().decode(data))
    } catch {
      return null
    }
  }
  if (typeof data === 'string') {
    try {
      value = JSON.parse(data)
    } catch {
      return null
    }
  }
  if (!isRecord(value) || typeof value.type !== 'string') return null
  if (value.type === 'letter') {
    const envelope = parseEnvelope(value.envelope)
    return envelope ? { type: 'letter', envelope } : null
  }
  if (typeof value.id !== 'string') return null
  if (value.type === 'ack') return { type: 'ack', id: value.id }
  if (value.type === 'nack' && (value.reason === 'invalid' || value.reason === 'stale-inbox')) {
    return { type: 'nack', id: value.id, reason: value.reason }
  }
  return null
}
